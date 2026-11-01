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
// The value as compared, never as written: keys sorted (Postgres jsonb hands objects back in its own key order, so a list
// rebuilt with the same content would otherwise look edited), and null/''/[]/{} all count as "empty" (a render that turns a
// null list into [] is not an edit -- and must never win a merge over a list someone else just filled).
function _casCanon(v){
  if(v===undefined||v===null||v==='')return null;
  if(Array.isArray(v)){if(!v.length)return null;return v.map(_casCanon);}
  if(typeof v==='object'){
    const out={};let n=0;
    Object.keys(v).sort().forEach(k=>{const c=_casCanon(v[k]);if(c!==null){out[k]=c;n++;}});
    return n?out:null;
  }
  return v;
}
function _casSame(a,b){return JSON.stringify(_casCanon(a))===JSON.stringify(_casCanon(b));}
function _casSnapshotSql(sql){return JSON.stringify(_casCanon(sql));}
function casSnapshotRow(toSqlRow,row){return _casSnapshotSql(_casSql(toSqlRow,row));}
// Three-way merge of ONE column both sides changed since this tab's baseline `b`: `m` = this tab's value, `t` = the server's
// (another person's) value. Lists and settings objects are joined instead of one side replacing the other:
//  - objects (package_custom_prices, schedule_request, cb_* maps, deposit_invoice...): key by key, recursively;
//  - lists whose items all carry an `id` (charges): item by item -- each side's adds, removals and edits are kept;
//  - other lists (retreat_activities, blocked_rooms, guests, schedule overrides...): what each side added or removed is
//    applied to the other (an item edited on one side = the old item removed + the new one added).
// Only a plain value both changed to different things (same text field, same number) has no join: this tab's value wins and
// `lost` is true so the conflict is logged.
function _casIsObj(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
function _casMerge3(b,m,t){
  if(_casSame(m,b))return{v:t,lost:false};
  if(_casSame(t,b)||_casSame(t,m))return{v:m,lost:false};
  const cb=_casCanon(b),cm=_casCanon(m),ct=_casCanon(t);
  if((cm===null||_casIsObj(cm))&&(ct===null||_casIsObj(ct))&&(cb===null||_casIsObj(cb))&&(_casIsObj(cm)||_casIsObj(ct))){
    const bo=_casIsObj(b)?b:{},mo=_casIsObj(m)?m:{},to=_casIsObj(t)?t:{},out={};let lost=false;
    new Set([...Object.keys(mo),...Object.keys(to),...Object.keys(bo)]).forEach(k=>{
      const r=_casMerge3(bo[k],mo[k],to[k]);lost=lost||r.lost;
      if(r.v!==undefined)out[k]=r.v;
    });
    return{v:out,lost};
  }
  if((cm===null||Array.isArray(cm))&&(ct===null||Array.isArray(ct))&&(cb===null||Array.isArray(cb))){
    const ba=Array.isArray(b)?b:[],ma=Array.isArray(m)?m:[],ta=Array.isArray(t)?t:[];
    const all=[...ba,...ma,...ta];
    if(all.length&&all.every(x=>_casIsObj(x)&&x.id!=null)){
      const byId=a=>new Map(a.map(x=>[x.id,x]));
      const B=byId(ba),M=byId(ma),T=byId(ta),out=[];let lost=false;
      ma.forEach(x=>{
        const inB=B.has(x.id),inT=T.has(x.id);
        if(inB&&!inT){if(!_casSame(x,B.get(x.id)))out.push(x);return;}   // they removed it: gone, unless this tab edited it
        if(!inT){out.push(x);return;}                                       // this tab added it
        const r=_casMerge3(B.get(x.id),x,T.get(x.id));lost=lost||r.lost;out.push(r.v);
      });
      ta.forEach(x=>{
        if(M.has(x.id))return;
        if(!B.has(x.id)){out.push(x);return;}                               // they added it
        if(!_casSame(x,B.get(x.id)))out.push(x);                            // this tab removed it, they edited it: keep theirs
      });
      return{v:out,lost};
    }
    const key=x=>JSON.stringify(_casCanon(x));
    const count=a=>{const c=new Map();a.forEach(x=>{const k=key(x);c.set(k,(c.get(k)||0)+1);});return c;};
    const cB=count(ba),cM=count(ma),cT=count(ta),n=(c,k)=>c.get(k)||0;
    const removeLeft=new Map(),out=[];
    new Set([...cB.keys(),...cT.keys()]).forEach(k=>{
      const theyRemoved=Math.max(0,n(cB,k)-n(cT,k)),iRemoved=Math.max(0,n(cB,k)-n(cM,k));
      if(theyRemoved>iRemoved)removeLeft.set(k,theyRemoved-iRemoved);
    });
    ma.forEach(x=>{const k=key(x),r=removeLeft.get(k)||0;if(r){removeLeft.set(k,r-1);return;}out.push(x);});
    const added=new Map();
    ta.forEach(x=>{
      const k=key(x),theyAdded=Math.max(0,n(cT,k)-n(cB,k)),iAdded=Math.max(0,n(cM,k)-n(cB,k)),done=added.get(k)||0;
      if(done<theyAdded-iAdded){out.push(x);added.set(k,done+1);}
    });
    return{v:out,lost:false};
  }
  return{v:m,lost:true};
}
// A direct write (db.from(table).update(...)) or a partial re-fetch put these SQL values on the server: record them in the
// baseline so they are not taken for this tab's own pending edit later (which would undo someone else's newer change to the
// same column, e.g. a check-in undone elsewhere). updated_at is left alone on purpose: the next save then sees the row
// changed, re-reads it and merges -- those columns, now equal to the baseline, take the server value.
function casPatchBase(base,id,sqlCols){
  const known=base.get(id);if(!known)return;
  const sql=JSON.parse(known.sqlJson)||{};
  Object.keys(sqlCols).forEach(col=>{if(col!=='updated_at')sql[col]=sqlCols[col];});
  base.set(id,{sqlJson:_casSnapshotSql(sql),updatedAt:known.updatedAt});
}
// Rows this tab just re-read in full from SQL and put in memory as they are (Block Rooms re-fetching a retreat's
// registrations): their server copy is now the baseline.
function casRebaseRows(base,sqlRows,toSqlRow,fromSqlRow){
  (sqlRows||[]).forEach(r=>{if(r&&r.id!=null)base.set(r.id,{sqlJson:casSnapshotRow(toSqlRow,fromSqlRow(r)),updatedAt:r.updated_at});});
}

// A deep copy taken at the moment of saving: arrays/objects inside a row are shared with the live object, so without the
// copy an edit made while the request is in the air would end up in the baseline without ever having been sent.
function _casCopy(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
// Puts the columns that came from the server (another tab's changes) onto the live object -- but only where this tab has not
// edited that column again since the save started, so an edit made mid-save is never overwritten.
function _casApplyServerCols(row,toSqlRow,fromSqlRow,cols,serverSql,sentSql){
  if(!cols.length)return;
  const now=_casSql(toSqlRow,row),patch={};
  cols.forEach(col=>{if(_casSame(now[col],sentSql[col]))patch[col]=_casCopy(serverSql[col]);});
  const fields=fromSqlRow(patch);
  Object.keys(fields).forEach(f=>{if(fields[f]===undefined)delete fields[f];});
  Object.assign(row,fields);
}

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
async function casUpdateOne({db,table,row,idOf,toSqlRow,fromSqlRow,base,maxAttempts,serverWins}){
  const id=idOf(row);
  const known=base.get(id);
  // Captured ONCE, as a deep copy, before any await -- the live row can keep changing while this request is in the air
  // (a second quick edit), and those later changes must stay pending for the next save, not be counted as sent.
  const myIntendedSql=_casCopy(_casSql(toSqlRow,row));
  if(!known){
    // No baseline for this id at all -- casSyncTable never sends one here (unknown rows are looked up first), kept only
    // as a safe fallback: write it once and establish a baseline for next time.
    const{data,error}=await db.from(table).update({...myIntendedSql,updated_at:new Date().toISOString()}).eq('id',id).select('*');
    if(error)return{ok:false,id,reason:error.message};
    if(!data||!data.length)return{ok:false,id,reason:'gone'};
    base.set(id,{sqlJson:_casSnapshotSql(myIntendedSql),updatedAt:data[0].updated_at});
    row.updatedAt=data[0].updated_at;
    return{ok:true,id};
  }
  const oldSql=JSON.parse(known.sqlJson)||{};
  // Columns this tab actually changed since its baseline -- the only ones it may write over someone else's value
  const mine=new Set(Object.keys(myIntendedSql).filter(col=>!_casSame(myIntendedSql[col],oldSql[col])));
  let payload=myIntendedSql,conditionUpdatedAt=known.updatedAt,fromServer=[];
  const conflicts=new Set();
  for(let attempt=0;attempt<(maxAttempts||10);attempt++){
    const{data,error}=await db.from(table)
      .update({...payload,updated_at:new Date().toISOString()})
      .eq('id',id).eq('updated_at',conditionUpdatedAt)
      .select('*');
    if(error){await _casBackoff(400);continue;}
    if(data&&data.length){
      base.set(id,{sqlJson:_casSnapshotSql(payload),updatedAt:data[0].updated_at});
      _casApplyServerCols(row,toSqlRow,fromSqlRow,fromServer,payload,myIntendedSql);
      row.updatedAt=data[0].updated_at;
      return{ok:true,id,conflicts:[...conflicts]};
    }
    // Lost the race -- someone else wrote first. Re-read and merge column by column: a column this tab changed keeps this
    // tab's value; every other column takes the fresh server value, so another tab's change to a column this tab never
    // touched survives untouched.
    const{data:freshRow,error:fe}=await db.from(table).select('*').eq('id',id).maybeSingle();
    if(fe){await _casBackoff(400);continue;}
    // Deleted on another tab/device: nothing to merge into. Reported back as 'gone' so the caller drops it from memory --
    // retrying would only fail again on every save (and a recent id would otherwise get re-created by the insert path).
    if(!freshRow)return{ok:false,id,reason:'gone'};
    const merged={};fromServer=[];
    for(const col in myIntendedSql){
      if(mine.has(col)){
        // Both sides changed this column: join them (lists/objects); a plain value both changed differently goes to this
        // tab (last write) and is logged -- except the columns the portal fills in by itself (serverWins), where an
        // automatic value must never replace what a person or another screen already saved.
        let r=_casMerge3(oldSql[col],myIntendedSql[col],freshRow[col]);
        if(r.lost&&serverWins&&serverWins.has(col))r={v:freshRow[col],lost:false};
        merged[col]=r.v;
        if(r.lost)conflicts.add(col);
        if(!_casSame(r.v,myIntendedSql[col]))fromServer.push(col);
      }else{merged[col]=freshRow[col];fromServer.push(col);}
    }
    payload=merged;
    conditionUpdatedAt=freshRow.updated_at;
    // Show the merged state right away (another tab's changes on the columns this tab did not touch). If every retry then
    // fails, this tab's own pending edits are still on screen and still differ from the baseline, so the next save retries.
    _casApplyServerCols(row,toSqlRow,fromSqlRow,fromServer,merged,myIntendedSql);
    await _casBackoff(80+Math.random()*220);
  }
  return{ok:false,id,reason:'exhausted'};
}

// Rows of the live array that still hold changes not saved yet (differ from their baseline), or that were created here and
// never inserted. A reload must keep these instead of replacing them with the server copy, or the change is silently lost.
function casPendingRows(rows,idOf,toSqlRow,base,isRecentLocalId){
  return(rows||[]).filter(row=>{
    const id=idOf(row);if(id==null)return false;
    const known=base.get(id);
    if(!known)return!isRecentLocalId||isRecentLocalId(id);
    return casSnapshotRow(toSqlRow,row)!==known.sqlJson;
  });
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
async function casSyncTable({db,table,rows,idOf,toSqlRow,fromSqlRow,base,deletedIds,isRecentLocalId,concurrency,serverWins}){
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

  const failed=[],gone=[],conflicts=[];
  let insertedCount=0,updatedCount=0;

  if(toInsert.length){
    // .select() so the baseline gets SQL's real updated_at -- a client-side "now" never matches it, and every row's first
    // edit after creation would then lose a CAS race against itself
    const sent=toInsert.map(row=>_casCopy(_casSql(toSqlRow,row)));
    const{data,error}=await db.from(table).insert(sent).select('*');
    if(!error){
      insertedCount=toInsert.length;
      const byId=new Map((data||[]).map(r=>[r.id,r]));
      toInsert.forEach((row,i)=>{
        const srv=byId.get(idOf(row));
        base.set(idOf(row),{sqlJson:_casSnapshotSql(sent[i]),updatedAt:srv?srv.updated_at:null});
        if(srv)row.updatedAt=srv.updated_at;
      });
    }else{
      toInsert.forEach(row=>failed.push({id:idOf(row),row,reason:error.message}));
    }
  }

  const chunkSize=concurrency||10;
  for(let i=0;i<toUpdate.length;i+=chunkSize){
    const chunk=toUpdate.slice(i,i+chunkSize);
    const results=await Promise.all(chunk.map(row=>casUpdateOne({db,table,row,idOf,toSqlRow,fromSqlRow,base,serverWins})));
    results.forEach((res,idx)=>{
      if(res.ok){updatedCount++;if(res.conflicts&&res.conflicts.length)conflicts.push({id:res.id,row:chunk[idx],reason:res.conflicts.join(',')});}
      else if(res.reason==='gone'){gone.push(res.id);base.delete(res.id);}
      else failed.push({id:res.id,row:chunk[idx],reason:res.reason});
    });
  }

  // gone: deleted on another tab/device -- the caller removes them from memory so they are not offered again
  // conflicts: rows saved where another tab had changed one of the same columns (this tab's value won) -- logged by the caller
  return{inserted:insertedCount,updated:updatedCount,failed,gone,skippedZombies,conflicts};
}

if(typeof module!=='undefined'&&module.exports){
  // Node test harness only (see test/cas-sync.test.js) -- a plain <script> tag
  // in the browser never sets `module`, so this never runs there.
  module.exports={casSnapshotRow,casBuildBase,casUpdateOne,casSyncTable,casPendingRows,casPatchBase,casRebaseRows,_casMerge3};
}
