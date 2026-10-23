// ===== cas-sync.js — generic compare-and-swap sync engine (2026-10-20) =====
// Generalizes modules/spa-appt-merge.js's pattern (read that file first if this
// one is confusing) from a single app_store blob to any real SQL table with its
// own `updated_at` column (bookings, registrations, room_types).
//
// The bug this replaces: syncToSupabase() (booking-hub.html) used to decide
// whether to upload an object by comparing its OWN `.updatedAt` field (set by
// whichever function last mutated it) against the server's `updated_at` --
// but nothing forced a mutating function to actually bump `.updatedAt`. Forget
// it once and that edit silently never uploads, then gets overwritten back to
// the stale server value by the old guard's "self-heal". Real incidents this
// caused: rcMoveRoom (modules/venues.js) twice in 48h, plus teacherSignContract,
// pipeMoveStage, and ~20 other functions found in the 2026-10-20 audit.
//
// Here, "did this object change" is never a manual flag -- it's computed by
// diffing the object's CURRENT fields against a snapshot taken the last time
// this tab loaded or saved it (`base`, a Map<id,{sqlJson,updatedAt}>). Nothing
// for a mutating function to remember. A row that loses a write race (another
// tab/device saved first) is merged column-by-column -- a field only wins if
// THIS tab's copy actually differs from ITS OWN last-known baseline, so two
// people editing DIFFERENT fields of the same row at once both survive -- then
// retried, never silently dropped. A row that can't be saved after every retry
// stays flagged dirty (so the next sync retries it automatically) and is
// reported back to the caller to show the user, not just logged to console.

// The row as SQL columns, without updated_at: that column is the CAS version stamp, never data, so code that still bumps
// .updatedAt by hand (the old convention) doesn't by itself make a row look edited.
function _casSql(toSqlRow,row){const sql={...toSqlRow(row)};delete sql.updated_at;return sql;}
function casSnapshotRow(toSqlRow,row){return JSON.stringify(_casSql(toSqlRow,row));}

// Call once, right after loadFromSupabase() populates the live array, using
// the REAL `updated_at` each row came back with from SQL -- that's the only
// trustworthy starting baseline. Never call this again after that; casSyncTable
// keeps `base` current on every successful write or merge.
function casBuildBase(rows,idOf,toSqlRow,updatedAtOf){
  const m=new Map();
  (rows||[]).forEach(row=>{
    const id=idOf(row);
    if(id==null)return;
    m.set(id,{sqlJson:casSnapshotRow(toSqlRow,row),updatedAt:updatedAtOf(row)});
  });
  return m;
}

function _casBackoff(ms){return new Promise(res=>setTimeout(res,ms));}

// Updates ONE row with up to `maxAttempts` compare-and-swap retries. Mutates
// `row` in place when a conflict pulls in fields another tab changed, and
// updates `base.get(id)` on every successful write (including a resolved
// conflict) so the NEXT call sees the correct baseline.
async function casUpdateOne({db,table,row,idOf,toSqlRow,fromSqlRow,base,maxAttempts}){
  const id=idOf(row);
  const known=base.get(id);
  // Captured ONCE, before any retry -- must not be recomputed from `row` after
  // a merge mutates it in place, or a second conflict on the same call would
  // lose track of what this tab actually meant to change (diffing the
  // already-merged state against itself would show no changes left).
  const myIntendedSql=_casSql(toSqlRow,row);
  if(!known){
    // No baseline for this id at all -- caller should normally route a
    // genuinely new row through insert instead, but if it ends up here
    // (e.g. a row this tab somehow never synced before), just write it
    // unconditionally once and establish a baseline for next time.
    const{data,error}=await db.from(table).update({...myIntendedSql,updated_at:new Date().toISOString()}).eq('id',id).select('*');
    if(error)return{ok:false,id,reason:error.message};
    if(!data||!data.length)return{ok:false,id,reason:'gone'};
    base.set(id,{sqlJson:JSON.stringify(myIntendedSql),updatedAt:data[0].updated_at});
    row.updatedAt=data[0].updated_at;
    return{ok:true,id};
  }
  const oldSql=JSON.parse(known.sqlJson);
  let payload=myIntendedSql,conditionUpdatedAt=known.updatedAt;
  for(let attempt=0;attempt<(maxAttempts||10);attempt++){
    const{data,error}=await db.from(table)
      .update({...payload,updated_at:new Date().toISOString()})
      .eq('id',id).eq('updated_at',conditionUpdatedAt)
      .select('*');
    if(error){await _casBackoff(400);continue;}
    if(data&&data.length){
      base.set(id,{sqlJson:JSON.stringify(payload),updatedAt:data[0].updated_at});
      Object.assign(row,fromSqlRow(payload));
      row.updatedAt=data[0].updated_at;
      return{ok:true,id};
    }
    // Lost the race -- someone else wrote first. Re-read and merge column by
    // column: a field wins only if THIS tab's intended value differs from its
    // OWN last-known baseline (i.e. this tab genuinely changed it); every
    // other field keeps whatever the fresh server row has, so a field the
    // OTHER tab changed and this tab never touched survives untouched.
    const{data:freshRow,error:fe}=await db.from(table).select('*').eq('id',id).maybeSingle();
    if(fe){await _casBackoff(400);continue;}
    // Deleted on another tab/device: nothing to merge into. Reported back as 'gone' so the caller drops it from memory --
    // retrying would only fail again on every save (and a recent id would otherwise get re-created by the insert path).
    if(!freshRow)return{ok:false,id,reason:'gone'};
    const merged={};
    for(const col in myIntendedSql){
      merged[col]=(JSON.stringify(myIntendedSql[col])!==JSON.stringify(oldSql[col]))?myIntendedSql[col]:freshRow[col];
    }
    payload=merged;
    conditionUpdatedAt=freshRow.updated_at;
    // Reflect the MERGED state on screen right away (my intended fields +
    // their non-conflicting ones), not the raw fresh server row -- assigning
    // the raw fresh row here would overwrite this tab's own pending edit back
    // to the old value for every retry, and if every retry then fails, that
    // edit is gone from the screen even though the merge logic itself never
    // dropped it (real bug caught while building this: `payload`/`merged` is
    // a local variable, thrown away on exhaustion -- `row` and `base` are the
    // only state that survives, so `row` must already hold the right answer).
    Object.assign(row,fromSqlRow(merged));
    await _casBackoff(80+Math.random()*220);
  }
  return{ok:false,id,reason:'exhausted'};
}

// Main entry point for a whole table's worth of live rows in one pass.
// `rows`: the live in-memory array (AppData.bookings / AppData.regs / AppData.roomTypes).
// `idOf`/`toSqlRow`/`fromSqlRow`: same conversion functions callers already have
//   (appBookingToSqlRow/sqlBookingToApp etc.) -- unit_price/tax/etc. shaping is
//   unchanged, this file only decides WHEN and HOW to write, never WHAT.
// `base`: the Map from casBuildBase(), mutated in place.
// `deletedIds`: existing tombstone Set (deletedBookingIds/deletedRegIds) -- rows
//   in here are skipped entirely, matching today's behavior (delete is handled
//   by the caller exactly as before, outside this function).
// `isRecentLocalId`: existing _isRecentLocalId(id) helper -- tells a genuinely
//   new local row (never yet in `base`) apart from a zombie (an old id missing
//   from `base`, e.g. a stale tab's leftover memory of something deleted
//   elsewhere) -- zombies are skipped, reported back as `skippedZombies`.
async function casSyncTable({db,table,rows,idOf,toSqlRow,fromSqlRow,base,deletedIds,isRecentLocalId,concurrency}){
  const live=(rows||[]).filter(row=>{
    const id=idOf(row);
    return id!=null&&!(deletedIds&&deletedIds.has(id));
  });
  const toInsert=[],toUpdate=[],skippedZombies=[],unknown=[];
  live.forEach(row=>{
    const id=idOf(row);
    const known=base.get(id);
    if(!known){unknown.push(row);return;}
    if(casSnapshotRow(toSqlRow,row)!==known.sqlJson)toUpdate.push(row);
  });

  // No baseline for these rows: this tab never loaded them from SQL (created here since load, or brought in after load by a
  // screen that re-fetches rows on its own -- Block Rooms reloading a retreat's registrations, Split stay inserting straight to
  // SQL). Ask SQL which of them already exist. An existing one adopts the server row as its baseline and is saved like any
  // other row if this tab's copy differs; only a row SQL doesn't have is inserted (a genuinely new one) or skipped (an old id
  // that is gone -- a stale tab's zombie, never resurrected).
  if(unknown.length){
    const ids=unknown.map(idOf),onServer=new Map();
    for(let i=0;i<ids.length;i+=100){
      const{data,error}=await db.from(table).select('*').in('id',ids.slice(i,i+100));
      if(error){unknown.forEach(row=>skippedZombies.push(idOf(row)));unknown.length=0;break;}
      (data||[]).forEach(r=>onServer.set(r.id,r));
    }
    unknown.forEach(row=>{
      const id=idOf(row),srv=onServer.get(id);
      if(srv){
        base.set(id,{sqlJson:casSnapshotRow(toSqlRow,fromSqlRow(srv)),updatedAt:srv.updated_at});
        if(casSnapshotRow(toSqlRow,row)!==base.get(id).sqlJson)toUpdate.push(row);
      }else if(!isRecentLocalId||isRecentLocalId(id))toInsert.push(row);
      else skippedZombies.push(id);
    });
  }

  const failed=[],gone=[];
  let insertedCount=0,updatedCount=0;

  if(toInsert.length){
    // .select() so the baseline gets SQL's real updated_at -- a client-side "now" never matches it, and every row's first
    // edit after creation would then lose a CAS race against itself
    const{data,error}=await db.from(table).insert(toInsert.map(row=>_casSql(toSqlRow,row))).select('*');
    if(!error){
      insertedCount=toInsert.length;
      const byId=new Map((data||[]).map(r=>[r.id,r]));
      toInsert.forEach(row=>{
        const srv=byId.get(idOf(row));
        base.set(idOf(row),{sqlJson:casSnapshotRow(toSqlRow,row),updatedAt:srv?srv.updated_at:null});
        if(srv)row.updatedAt=srv.updated_at;
      });
    }else{
      toInsert.forEach(row=>failed.push({id:idOf(row),row,reason:error.message}));
    }
  }

  const chunkSize=concurrency||10;
  for(let i=0;i<toUpdate.length;i+=chunkSize){
    const chunk=toUpdate.slice(i,i+chunkSize);
    const results=await Promise.all(chunk.map(row=>casUpdateOne({db,table,row,idOf,toSqlRow,fromSqlRow,base})));
    results.forEach((res,idx)=>{
      if(res.ok)updatedCount++;
      else if(res.reason==='gone'){gone.push(res.id);base.delete(res.id);}
      else failed.push({id:res.id,row:chunk[idx],reason:res.reason});
    });
  }

  // gone: deleted on another tab/device -- the caller removes them from memory so they are not offered again
  return{inserted:insertedCount,updated:updatedCount,failed,gone,skippedZombies};
}

if(typeof module!=='undefined'&&module.exports){
  // Node test harness only (see test/cas-sync.test.js) -- a plain <script> tag
  // in the browser never sets `module`, so this never runs there.
  module.exports={casSnapshotRow,casBuildBase,casUpdateOne,casSyncTable};
}
