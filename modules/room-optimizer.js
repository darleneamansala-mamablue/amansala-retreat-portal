// ===== room-optimizer.js — STRAIGHTLINE ROOMS + OVERBOOKING OPTIMIZATION =====
// Loaded as a classic script; shares global scope with booking-hub.html (same
// pattern as venues.js/room-blocking.js). New, separate module per the
// project's own "new features get their own file" convention.
//
// Scope decisions made during Phase 1/2 (see chat 2026-09-17) that this file
// depends on:
//  - Only PORTAL reservations (real AppData.bookings rows) are ever proposed
//    as moves. Raw, unlinked Cloudbeds-only reservations are treated as fixed
//    obstacles for scoring/overbooking, never as move candidates — there is
//    no safe portal-side identity to move/sync back for them.
//  - Bed-level and virtual-group room types (BED_RT_IDS, VIRTUAL_GROUP_RT_IDS,
//    plus Casita's bed entries c4b/c4c) are excluded from the optimizer
//    entirely for V1 — those are always booked as individual beds shared by
//    unrelated guests, which is a fundamentally different (and much riskier)
//    optimization problem than "move a couple's whole room."
//  - "Grande vs Chica" has no clean property field in this codebase (Phase 1
//    finding) — the only reliable signal is roomCategory(room) from
//    booking-hub.html, which is why grouping is keyed on roomTypeId PLUS
//    roomCategory(), not roomTypeId alone.
//  - Maintenance status (modules/housekeeping.js) has no date range — a room
//    currently flagged maintenance is excluded from destination candidates
//    for the whole analysis window, not just "today".
//  - No Cloudbeds webhook exists — "sync status" here means revalidate/await
//    around each move, not a real push channel.

// ── CONFIG — centralized scoring knobs, per the spec's "don't scatter this
// across the code" requirement. Adjust these, not the logic below, to retune
// behavior (e.g. if the preferred retreat length changes). ─────────────────
const OZ_CONFIG={
  // Score awarded for the resulting gap length created/left behind by a move.
  // Keyed by nights; anything not listed falls back to `default`.
  gapScore:{0:100, 1:-80, 2:-20, 3:30, 4:60, 5:80, 6:80, 7:80, default:40},
  movePenalty:-15,          // flat cost per reservation actually moved — biases toward leaving things alone
  minApprovalDelta:1,       // a move must net-improve by at least this much (after movePenalty) to be suggested at all
  maxIterationsPerGroup:200,// safety cap on the greedy search per property+category group
};
function ozGapScore(nights){
  if(nights==null)return 0;
  return OZ_CONFIG.gapScore[nights]!=null?OZ_CONFIG.gapScore[nights]:OZ_CONFIG.gapScore.default;
}

// Room types excluded from optimizer scope entirely (see header comment).
const OZ_EXCLUDED_RT_IDS=new Set([...(typeof DUPLICATE_ROOM_ENTRY_IDS!=='undefined'?DUPLICATE_ROOM_ENTRY_IDS:[]),...(typeof VIRTUAL_GROUP_RT_IDS!=='undefined'?VIRTUAL_GROUP_RT_IDS:[])]);

// ── GROUPING ─────────────────────────────────────────────────────────────
// groupKey = roomTypeId + Grande/Chica category. rt1/rt2/rt3/rt4/rt6/rt7 mix
// Chica (CH-prefixed) rooms into the same `rooms` array as Grande rooms
// (Phase 1 finding), so roomTypeId alone is NOT a safe "same inventory
// group" key — this is the single most important correctness rule here.
// `cbKnownRooms` (from ozFetchCloudbedsRoomTruth) is optional — when
// provided, a room the portal config lists but Cloudbeds no longer
// recognizes (renamed/removed) is silently excluded rather than proposed as
// a destination. Omitted entirely, this falls back to the portal's own
// config, same as before this cross-check existed.
function ozBuildGroups(cbKnownRooms){
  const groups=new Map();
  AppData.roomTypes.forEach(rt=>{
    if(OZ_EXCLUDED_RT_IDS.has(rt.id))return;
    (rt.rooms||[]).forEach(room=>{
      if(cbKnownRooms&&!cbKnownRooms.has(room))return;
      const cat=roomCategory(room);
      const key=rt.id+'::'+cat;
      if(!groups.has(key))groups.set(key,{key,rtId:rt.id,rtName:rt.name,category:cat,rooms:[]});
      groups.get(key).rooms.push(room);
    });
  });
  return groups;
}
function ozCategoryLabel(cat){return cat===1?'Chica':cat===2?'Casa':'Grande';}

// ── CLOUDBEDS ROOM TRUTH — cross-check, warn-only (never hard-blocks the
// feature if this fetch fails; Phase 2 explicitly said correctness/safety
// over a perfect solve, and the portal's own room-type config is still the
// fallback source of truth). ────────────────────────────────────────────
async function ozFetchCloudbedsRoomTruth(){
  try{
    const resp=await fetch(`${CLOUDBEDS_PROXY}?action=getRooms`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const data=await resp.json();
    const known=new Set();
    (data?.roomTypes||[]).forEach(t=>(t.rooms||[]).forEach(r=>known.add(r)));
    return known.size?known:null;
  }catch(e){console.warn('[optimizer] Cloudbeds room truth fetch failed — proceeding on portal config only',e);return null;}
}

// ── ROOM STATE HELPERS ───────────────────────────────────────────────────
function ozRoomIsMaintenance(room){
  return(typeof hkStatusMap!=='undefined'&&hkStatusMap[room]==='maintenance');
}
function ozPortalResIdSet(){
  const s=new Set();
  AppData.bookings.forEach(bk=>Object.values(bk.cbReservationIds||{}).forEach(id=>{if(id)s.add(String(id));}));
  return s;
}
// One interval per booking-that-holds-this-room. `locked` folds together the
// two independent lock flags in this codebase (Phase 1 finding):
// bk.roomLocked (Room Calendar padlock) and the guest registration's own
// `locked` field (Registration tab room grid) — if either is set, the
// optimizer must not move it.
function ozPortalIntervalsForRoom(room){
  return AppData.bookings.filter(b=>b.status!=='cancelled'&&(b.blockedRooms||[]).includes(room)).map(bk=>{
    const reg=getRegForRoom(bk.id,room);
    return{
      room,start:bk.startDate,end:bk.endDate,bkId:bk.id,external:false,
      label:bk.leaderName||bk.retreatName||'Blocked',
      guestLabel:(reg?.guests||[]).filter(g=>g.name).map(g=>g.name).join(' & ')||bk.leaderName||bk.retreatName||'Guest',
      locked:!!bk.roomLocked||!!reg?.locked,
      bookingType:bk.bookingType||null,
    };
  });
}
function ozExternalIntervalsForRoom(room,extReservations,portalResIds){
  return(extReservations||[]).filter(r=>(r.rooms||[]).includes(room)&&!portalResIds.has(String(r.reservationID))).map(r=>({
    room,start:r.startDate,end:r.endDate,external:true,label:r.guestName||'Cloudbeds reservation',reservationID:r.reservationID,locked:true,
  }));
}

// ── GAP SCORING ──────────────────────────────────────────────────────────
// Only INTERIOR gaps (bounded by a real checkout on one side and a real
// check-in on the other) are scored — an open edge before the first booking
// or after the last one is just normal future-open inventory, not something
// straightlining can fix, so it's never counted.
function ozInteriorGaps(intervals){
  const sorted=intervals.slice().sort((a,b)=>a.start.localeCompare(b.start));
  const gaps=[];
  for(let i=0;i<sorted.length-1;i++){
    const gapStart=sorted[i].end,gapEnd=sorted[i+1].start;
    if(gapEnd<gapStart)continue; // overlap — shouldn't happen in valid data, ignore rather than crash
    const nights=Math.round((pd(gapEnd)-pd(gapStart))/DAY_MS);
    gaps.push({start:gapStart,end:gapEnd,nights,before:sorted[i],after:sorted[i+1]});
  }
  return gaps;
}
function ozScoreRoomIntervals(intervals,rangeStart,rangeEnd){
  return ozInteriorGaps(intervals).filter(g=>g.start<rangeEnd&&g.end>rangeStart).reduce((sum,g)=>sum+ozGapScore(g.nights),0);
}

// ── OVERBOOKING DETECTION — independent of the move optimizer; moving
// reservations between rooms WITHIN a group never changes total demand vs
// total supply for that group, so this is computed on the real, current
// assignment, night by night. ───────────────────────────────────────────
function ozDetectOverbooking(groups,extReservations,rangeStart,rangeEnd){
  const portalResIds=ozPortalResIdSet();
  const alerts=[];
  groups.forEach(group=>{
    const capacity=group.rooms.length;
    const allIntervals=[];
    group.rooms.forEach(room=>{
      ozPortalIntervalsForRoom(room).forEach(iv=>allIntervals.push(iv));
      ozExternalIntervalsForRoom(room,extReservations,portalResIds).forEach(iv=>allIntervals.push(iv));
    });
    if(!allIntervals.length)return;
    let cur=pd(rangeStart);const endD=pd(rangeEnd);
    let run=null;
    while(cur<endD){
      const dayStr=fmtISO(cur);
      const occ=allIntervals.filter(iv=>iv.start<=dayStr&&iv.end>dayStr);
      if(occ.length>capacity){
        if(!run)run={start:dayStr,nights:[]};
        run.nights.push({date:dayStr,count:occ.length,capacity,occupants:occ});
      }else if(run){
        alerts.push(ozBuildOverbookAlert(group,run,dayStr));
        run=null;
      }
      cur=addDays(cur,1);
    }
    if(run)alerts.push(ozBuildOverbookAlert(group,run,fmtISO(endD)));
  });
  return alerts;
}
function ozBuildOverbookAlert(group,run,endStr){
  const maxNight=run.nights.reduce((m,n)=>n.count>m.count?n:m,run.nights[0]);
  return{
    id:uid(),groupKey:group.key,rtId:group.rtId,rtName:group.rtName,category:group.category,
    startDate:run.start,endDate:endStr,
    available:maxNight.capacity,required:maxNight.count,overBy:maxNight.count-maxNight.capacity,
    resolution:null, // filled in by ozFindSolution: {type:'assignment'|'true', moves?}
  };
}

// ── MOVE SEARCH (per group, greedy local search — small N, no need for a
// full solver; correctness/explainability over mathematical optimality per
// the spec) ──────────────────────────────────────────────────────────────
function ozBuildWorkingSet(groups,extReservations){
  const portalResIds=ozPortalResIdSet();
  const working=new Map();
  groups.forEach(group=>group.rooms.forEach(room=>{
    working.set(room,[...ozPortalIntervalsForRoom(room),...ozExternalIntervalsForRoom(room,extReservations,portalResIds)]);
  }));
  return working;
}
function ozSearchGroupMoves(group,working,rangeStart,rangeEnd,restrictBkIds){
  const suggestions=[];
  let iterations=0;
  while(iterations++<OZ_CONFIG.maxIterationsPerGroup){
    let best=null;
    group.rooms.forEach(fromRoom=>{
      (working.get(fromRoom)||[]).forEach(iv=>{
        if(iv.external||iv.locked)return;
        if(restrictBkIds&&!restrictBkIds.has(iv.bkId))return;
        if(!(iv.start<rangeEnd&&iv.end>rangeStart))return; // reservation not in the analyzed window
        group.rooms.forEach(toRoom=>{
          if(toRoom===fromRoom||ozRoomIsMaintenance(toRoom))return;
          const toIntervals=working.get(toRoom)||[];
          const fits=!toIntervals.some(o=>iv.start<o.end&&iv.end>o.start);
          if(!fits)return;
          const fromIntervals=working.get(fromRoom)||[];
          const fromAfter=fromIntervals.filter(x=>x!==iv);
          const toAfter=[...toIntervals,iv];
          const beforeScore=ozScoreRoomIntervals(fromIntervals,rangeStart,rangeEnd)+ozScoreRoomIntervals(toIntervals,rangeStart,rangeEnd);
          const afterScore=ozScoreRoomIntervals(fromAfter,rangeStart,rangeEnd)+ozScoreRoomIntervals(toAfter,rangeStart,rangeEnd);
          const delta=(afterScore-beforeScore)+OZ_CONFIG.movePenalty;
          if(delta>=OZ_CONFIG.minApprovalDelta&&(!best||delta>best.delta)){
            best={iv,fromRoom,toRoom,delta,fromIntervals,toIntervals,fromAfter,toAfter};
          }
        });
      });
    });
    if(!best)break;
    working.set(best.fromRoom,best.fromAfter);
    const movedIv={...best.iv,room:best.toRoom};
    working.set(best.toRoom,[...best.toAfter.filter(x=>x!==best.iv),movedIv]);
    suggestions.push(ozBuildSuggestion(best,group));
  }
  return suggestions;
}
function ozBuildSuggestion(best,group){
  const{iv,fromRoom,toRoom,delta,fromIntervals,fromAfter,toAfter}=best;
  const bk=AppData.bookings.find(b=>b.id===iv.bkId);
  const why=['Same property and room category','Available for the entire reservation','No locked reservation affected','No room block or maintenance conflict on the destination','No split stay — one room for the whole reservation'];

  // Describe the most notable gap change on each side, touching iv's old/new neighborhood.
  const fromGapsBefore=ozInteriorGaps(fromIntervals).filter(g=>g.before===iv||g.after===iv);
  fromGapsBefore.forEach(g=>{
    if(g.nights===1)why.push(`Eliminates a 1-night orphan gap in ${fromRoom}`);
    else if(g.nights>=4&&g.nights<=7)why.push(`Leaves a ${g.nights}-night sellable opening in ${fromRoom} where there wasn't a clean one before`);
  });
  const toAfterMoveGaps=ozInteriorGaps(toAfter).filter(g=>(g.before===iv||g.after===iv));
  toAfterMoveGaps.forEach(g=>{
    if(g.nights===0)why.push(`Creates a same-day checkout → check-in straightline in ${toRoom}`);
    else if(g.nights>=4&&g.nights<=7)why.push(`Creates a ${g.nights}-night sellable opening in ${toRoom}`);
  });

  const reg=bk?getRegForRoom(bk.id,fromRoom):null;
  const guestLabel=(reg?.guests||[]).filter(g=>g.name).map(g=>g.name).join(' & ')||bk?.leaderName||bk?.retreatName||'Guest';
  return{
    id:uid(),bkId:iv.bkId,fromRoom,toRoom,guestLabel,
    rtId:group.rtId,rtName:group.rtName,category:group.category,
    startDate:iv.start,endDate:iv.end,why,delta,
    status:'pending', // pending|skipped|validating|sending|confirmed|failed
    error:null,
  };
}

// One-night gaps left in the FINAL (post-optimizer) arrangement are flagged
// as extension opportunities, not forced moves — the optimizer may
// legitimately decide leaving one alone is better than the alternative.
function ozFindOneNightGaps(working,rangeStart,rangeEnd){
  const flags=[];
  working.forEach((intervals,room)=>{
    ozInteriorGaps(intervals).filter(g=>g.nights===1&&g.start<rangeEnd&&g.end>rangeStart).forEach(g=>{
      flags.push({id:uid(),room,start:g.start,end:g.end,beforeBkId:g.before.bkId||null,afterBkId:g.after.bkId||null,
        beforeExternal:!!g.before.external,afterExternal:!!g.after.external,
        beforeLabel:g.before.label,afterLabel:g.after.label});
    });
  });
  return flags;
}

// ── MAIN ANALYSIS ENTRY POINT ────────────────────────────────────────────
let _ozLastAnalysis=null;
async function ozAnalyze(rangeStart,rangeEnd){
  const extReservations=await fetchExternalReservationsForRange(rangeStart,rangeEnd);
  const cbKnownRooms=await ozFetchCloudbedsRoomTruth();
  const groups=ozBuildGroups(cbKnownRooms);

  const overbooking=ozDetectOverbooking(groups,extReservations,rangeStart,rangeEnd);
  const working=ozBuildWorkingSet(groups,extReservations);
  const lockedBkIds=new Set();
  let suggestions=[];
  groups.forEach(group=>{
    // Track locked reservations touched in this window purely for the summary count.
    group.rooms.forEach(room=>(working.get(room)||[]).forEach(iv=>{
      if(!iv.external&&iv.locked&&iv.start<rangeEnd&&iv.end>rangeStart)lockedBkIds.add(iv.bkId);
    }));
    suggestions=suggestions.concat(ozSearchGroupMoves(group,working,rangeStart,rangeEnd));
  });
  const oneNightGaps=ozFindOneNightGaps(working,rangeStart,rangeEnd);

  const analyzedCount=new Set();
  AppData.bookings.forEach(b=>{
    if(b.status==='cancelled')return;
    if(b.startDate<rangeEnd&&b.endDate>rangeStart&&(b.blockedRooms||[]).length)analyzedCount.add(b.id);
  });

  _ozLastAnalysis={rangeStart,rangeEnd,suggestions,overbooking,oneNightGaps,lockedCount:lockedBkIds.size,analyzedCount:analyzedCount.size,cbKnownRooms,groups};
  return _ozLastAnalysis;
}

// Restricted re-run used by "Find Solution" on one specific overbooking alert.
async function ozFindSolutionForAlert(alertId){
  const alert=(_ozLastAnalysis?.overbooking||[]).find(a=>a.id===alertId);
  if(!alert)return null;
  const extReservations=await fetchExternalReservationsForRange(alert.startDate,alert.endDate);
  const cbKnownRooms=await ozFetchCloudbedsRoomTruth();
  const groups=ozBuildGroups(cbKnownRooms);
  const group=[...groups.values()].find(g=>g.key===alert.groupKey);
  if(!group)return null;
  const working=ozBuildWorkingSet(groups,extReservations);
  const moves=ozSearchGroupMoves(group,working,alert.startDate,alert.endDate);
  // Re-check capacity on the POST-move state for this group/window — moving
  // rooms around inside a group can never change total demand vs supply, so
  // if it's still over capacity after the best available reassignment, this
  // is a true inventory overbooking, not a fixable assignment conflict.
  let stillOver=false;
  let cur=pd(alert.startDate);const endD=pd(alert.endDate);
  while(cur<endD){
    const dayStr=fmtISO(cur);
    const occ=group.rooms.reduce((n,room)=>n+(working.get(room)||[]).filter(iv=>iv.start<=dayStr&&iv.end>dayStr).length,0);
    if(occ>group.rooms.length)stillOver=true;
    cur=addDays(cur,1);
  }
  alert.resolution=stillOver?{type:'true'}:{type:'assignment',moves};
  return alert.resolution;
}

// ── MOVE EXECUTION — awaited, validated, status-tracked. Deliberately NOT
// reusing rcMoveRoom() (venues.js), which is optimistic/fire-and-forget for
// the manual single-drag UX; the optimizer needs to wait for and confirm
// each Cloudbeds response before touching portal data (Phase 2 decision).
// ──────────────────────────────────────────────────────────────────────
async function ozRevalidateMove(sug){
  const bk=AppData.bookings.find(b=>b.id===sug.bkId);
  if(!bk||bk.status==='cancelled')return'Reservation no longer exists.';
  if(bk.startDate!==sug.startDate||bk.endDate!==sug.endDate)return'Reservation dates changed since this was calculated.';
  if(!(bk.blockedRooms||[]).includes(sug.fromRoom))return'Reservation is no longer in the expected room.';
  const reg=getRegForRoom(bk.id,sug.fromRoom);
  if(bk.roomLocked||reg?.locked)return'Reservation was locked since this was calculated.';
  if(ozRoomIsMaintenance(sug.toRoom))return'Destination room was marked under maintenance since this was calculated.';
  const conflict=AppData.bookings.find(other=>other.id!==bk.id&&other.status!=='cancelled'&&(other.blockedRooms||[]).includes(sug.toRoom)&&datesOverlap(sug.startDate,sug.endDate,other.startDate,other.endDate));
  if(conflict)return`Room ${sug.toRoom} was booked by ${conflict.leaderName||conflict.retreatName} since this was calculated.`;
  // Fresh Cloudbeds check — someone may have booked the destination directly in Cloudbeds since analysis ran.
  const fresh=await fetchExternalReservationsForRange(sug.startDate,sug.endDate);
  const portalResIds=ozPortalResIdSet();
  const extBlock=fresh.find(r=>(r.rooms||[]).includes(sug.toRoom)&&!portalResIds.has(String(r.reservationID))&&r.startDate<sug.endDate&&r.endDate>sug.startDate);
  if(extBlock)return`Room ${sug.toRoom} now has a Cloudbeds reservation (${extBlock.guestName}) since this was calculated.`;
  return null; // valid
}
async function ozExecuteMove(sug){
  sug.status='validating';
  const validationError=await ozRevalidateMove(sug);
  if(validationError){sug.status='failed';sug.error=validationError;return sug;}

  const bk=AppData.bookings.find(b=>b.id===sug.bkId);
  const fromRoom=sug.fromRoom,toRoom=sug.toRoom;
  const cbResId=(bk.cbReservationIds||{})[fromRoom];
  sug.status='sending';

  if(!cbResId){
    // Never pushed to Cloudbeds yet — portal-only move, nothing to sync.
    ozApplyPortalMove(bk,fromRoom,toRoom);
    sug.status='confirmed';sug.cbSynced=false;
    ozAudit(sug,bk,'no Cloudbeds reservation on this room yet — portal only');
    return sug;
  }

  try{
    const cbCfg=JSON.parse(localStorage.getItem('ama_cb_config')||'{}');
    const mapping=(cbCfg.mapping||[]).find(m=>m.portalRoom===toRoom);
    let newCbRoomId=mapping?.cbId||cbRoomLookup?.[toRoom]||null;
    if(!newCbRoomId){
      const norm=s=>s.toLowerCase().replace(/\s*-\s*/g,'-');
      const key=Object.keys(cbRoomLookup||{}).find(k=>norm(k)===norm(toRoom));
      if(key)newCbRoomId=cbRoomLookup[key];
    }
    const moveResp=await fetch(`${CLOUDBEDS_PROXY}?action=moveReservationRoom`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({reservationId:cbResId,newCbRoomId,newRoomName:toRoom,startDate:bk.startDate,endDate:bk.endDate})}).then(r=>r.json());
    if(!moveResp?.success){
      sug.status='failed';sug.error='Cloudbeds could not confirm this room reassignment.';
      return sug;
    }
    ozApplyPortalMove(bk,fromRoom,toRoom);
    // Best-effort — the room move itself already succeeded and is confirmed;
    // a guest-name-label failure here shouldn't roll back a confirmed move.
    try{
      const movedReg=getRegForRoom(bk.id,toRoom);
      const movedNames=(movedReg?.guests||[]).filter(g=>g.name).map(g=>g.name.trim());
      const guestId=(bk.cbGuestIds||{})[toRoom]||null;
      const nameResp=await fetch(`${CLOUDBEDS_PROXY}?action=updateReservationGuest`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({reservationId:cbResId,guestId,roomName:toRoom,startDate:bk.startDate,endDate:bk.endDate,
          guestFirstName:movedNames.join(' & '),groupName:bk.retreatName||bk.row||'',leaderName:bk.leaderName||'',adults:Math.max(1,movedNames.length),dailyRate:0})}).then(r=>r.json());
      if(nameResp?.reservationId&&nameResp.reservationId!==cbResId){
        bk.cbReservationIds[toRoom]=nameResp.reservationId;
        if(nameResp.guestId){if(!bk.cbGuestIds)bk.cbGuestIds={};bk.cbGuestIds[toRoom]=nameResp.guestId;}
      }
    }catch(e){console.warn('[optimizer] guest-name sync after move failed (move itself still confirmed)',e);}
    saveAll();
    sug.status='confirmed';sug.cbSynced=true;
    ozAudit(sug,bk,'Cloudbeds synced');
  }catch(e){
    console.warn('[optimizer] move failed',e);
    sug.status='failed';sug.error='Could not reach Cloudbeds — try again.';
  }
  return sug;
}
function ozApplyPortalMove(bk,fromRoom,toRoom){
  bk.blockedRooms=(bk.blockedRooms||[]).map(r=>r===fromRoom?toRoom:r);
  const reg=getRegForRoom(bk.id,fromRoom);
  if(reg){
    const targetRt=AppData.roomTypes.find(rt=>(rt.rooms||[]).includes(toRoom));
    reg.room=toRoom;
    if(targetRt)reg.roomTypeId=targetRt.id;
    reg.customPrice=null;
  }
  if(bk.cbReservationIds&&bk.cbReservationIds[fromRoom]){
    bk.cbReservationIds[toRoom]=bk.cbReservationIds[fromRoom];delete bk.cbReservationIds[fromRoom];
    if(bk.cbAdjustmentIds){bk.cbAdjustmentIds[toRoom]=bk.cbAdjustmentIds[fromRoom]||null;delete bk.cbAdjustmentIds[fromRoom];}
    if(bk.cbGuestIds){bk.cbGuestIds[toRoom]=bk.cbGuestIds[fromRoom]||null;delete bk.cbGuestIds[fromRoom];}
    if(bk.cbNoteIds){bk.cbNoteIds[toRoom]=bk.cbNoteIds[fromRoom]||null;delete bk.cbNoteIds[fromRoom];}
  }
  bk.blockedRoomsUpdatedAt=new Date().toISOString();
  saveAll();
}
// In-session only (Phase 2 scope decision) — permanent history lives in the
// existing Activity Log via logActivity, which every move also writes to.
let _ozRecentMoves=[];
function ozAudit(sug,bk,cbNote){
  const record={
    ts:new Date().toISOString(),bkId:bk.id,guestLabel:sug.guestLabel,
    fromRoom:sug.fromRoom,toRoom:sug.toRoom,rtName:sug.rtName,category:ozCategoryLabel(sug.category),
    initiator:(typeof currentUserName!=='undefined'&&currentUserName)||'Staff',reason:sug.why.join('; '),cbNote,
  };
  _ozRecentMoves.unshift(record);
  if(typeof logActivity==='function'){
    logActivity('Room optimizer move',`${sug.guestLabel} — ${sug.rtName} (${ozCategoryLabel(sug.category)}) Room ${sug.fromRoom} → Room ${sug.toRoom}. Reason: ${sug.why.join('; ')}. Cloudbeds: ${cbNote}.`,bk.id);
  }
}

// Reverses one already-completed move through the same validate→Cloudbeds→
// confirm pipeline. Refuses (rather than silently reverting locally) if the
// original room is no longer free.
async function ozUndoMove(recordIdx){
  const rec=_ozRecentMoves[recordIdx];if(!rec)return{ok:false,reason:'Move record not found.'};
  const bk=AppData.bookings.find(b=>b.id===rec.bkId);if(!bk)return{ok:false,reason:'Reservation no longer exists.'};
  if(!(bk.blockedRooms||[]).includes(rec.toRoom))return{ok:false,reason:'Reservation is no longer in the room this move put it in — cannot safely auto-reverse.'};
  const conflict=AppData.bookings.find(other=>other.id!==bk.id&&other.status!=='cancelled'&&(other.blockedRooms||[]).includes(rec.fromRoom)&&datesOverlap(bk.startDate,bk.endDate,other.startDate,other.endDate));
  if(conflict)return{ok:false,reason:`Room ${rec.fromRoom} is no longer available — booked by ${conflict.leaderName||conflict.retreatName}.`};
  const reverseSug={id:uid(),bkId:bk.id,fromRoom:rec.toRoom,toRoom:rec.fromRoom,guestLabel:rec.guestLabel,rtId:null,rtName:rec.rtName,category:null,startDate:bk.startDate,endDate:bk.endDate,why:['Manual undo of a previous optimizer move'],status:'pending'};
  const result=await ozExecuteMove(reverseSug);
  if(result.status==='confirmed'){_ozRecentMoves.splice(recordIdx,1);return{ok:true};}
  return{ok:false,reason:result.error||'Could not reverse this move.'};
}

// ══════════════════════════════════════════════════════════════════════════
// UI LAYER — buttons, modals. Workflow is strictly ANALYZE → PREVIEW →
// (per-alert) VALIDATE → USER APPROVAL → UPDATE CLOUDBEDS → CONFIRM →
// UPDATE PORTAL → SHOW SYNC STATUS. Nothing here ever calls ozExecuteMove
// without an explicit click on a specific approved move.
// ══════════════════════════════════════════════════════════════════════════

function ozCurrentRange(){
  const start=fmtISO(rcStart);
  const end=fmtISO(addDays(rcStart,rcShowDays));
  return{start,end};
}

// ── ✨ STRAIGHTLINE ROOMS ────────────────────────────────────────────────
async function ozOpenStraightline(){
  openModal('ozPreviewModal');
  document.getElementById('ozPreviewBody').innerHTML='<div style="padding:30px;text-align:center;color:var(--muted)">Analyzing the current calendar range…</div>';
  document.getElementById('ozPreviewFoot').style.display='none';
  const{start,end}=ozCurrentRange();
  let analysis;
  try{ analysis=await ozAnalyze(start,end); }
  catch(e){ console.error('[optimizer] analyze failed',e); document.getElementById('ozPreviewBody').innerHTML='<div style="padding:30px;text-align:center;color:#dc2626">Could not complete analysis — try again.</div>'; return; }
  ozRenderSummary(analysis);
}
function ozRenderSummary(analysis){
  const{suggestions,overbooking,oneNightGaps,lockedCount,analyzedCount,cbKnownRooms,rangeStart,rangeEnd}=analysis;
  const straightlines=suggestions.filter(s=>s.why.some(w=>w.includes('same-day')));
  const sellable=suggestions.filter(s=>s.why.some(w=>w.includes('sellable opening')));
  const eliminated1night=suggestions.filter(s=>s.why.some(w=>w.includes('Eliminates a 1-night')));
  const cbWarning=cbKnownRooms?'':'<div style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:12px">⚠ Could not verify the room list against Cloudbeds right now — recommendations below use the portal\'s own room configuration only.</div>';
  document.getElementById('ozPreviewBody').innerHTML=`
    ${cbWarning}
    <div style="font-size:13px;color:var(--muted);margin-bottom:10px">${fmtDate(rangeStart)} – ${fmtDate(rangeEnd)}</div>
    <div style="display:flex;flex-direction:column;gap:7px;font-size:14px">
      <div><b>${analyzedCount}</b> reservations analyzed</div>
      <div><b>${suggestions.length}</b> recommended room move${suggestions.length!==1?'s':''}</div>
      <div><b>${eliminated1night.length}</b> one-night gap${eliminated1night.length!==1?'s':''} eliminated</div>
      <div><b>${straightlines.length}</b> exact checkout/check-in straightline${straightlines.length!==1?'s':''} created</div>
      <div><b>${sellable.length}</b> sellable opening${sellable.length!==1?'s':''} (4–7 nights) created</div>
      <div style="${overbooking.length?'color:#dc2626;font-weight:700':''}">${overbooking.length?'🚨':''} <b>${overbooking.length}</b> potential overbooking${overbooking.length!==1?'s':''} detected</div>
      <div><b>${lockedCount}</b> locked reservation${lockedCount!==1?'s':''} untouched</div>
      ${oneNightGaps.length?`<div style="color:#b45309">⚠ <b>${oneNightGaps.length}</b> remaining 1-night gap${oneNightGaps.length!==1?'s':''} — see Review for extension options</div>`:''}
    </div>`;
  const foot=document.getElementById('ozPreviewFoot');
  foot.style.display='flex';
  foot.innerHTML=`<div class="l"></div><div class="r">
    <button class="btn btn-secondary" onclick="closeModal('ozPreviewModal')">Cancel</button>
    ${suggestions.length||oneNightGaps.length?`<button class="btn btn-primary" onclick="ozOpenReview()">Review Suggested Moves</button>`:''}
  </div>`;
}

// ── REVIEW SUGGESTED MOVES ───────────────────────────────────────────────
function ozOpenReview(){
  closeModal('ozPreviewModal');
  openModal('ozReviewModal');
  ozRenderReview();
}
function ozRenderReview(){
  const analysis=_ozLastAnalysis;if(!analysis)return;
  const body=document.getElementById('ozReviewBody');
  const moveCards=analysis.suggestions.map((s,i)=>`
    <div class="oz-move-card" id="ozMove_${s.id}" style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;${s.status==='skipped'?'opacity:.45':''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div>
          <div style="font-weight:700;font-size:14px">${escHtml(s.guestLabel)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${fmtDate(s.startDate)} – ${fmtDate(s.endDate)}</div>
        </div>
        <div id="ozMoveStatus_${s.id}" style="font-size:11.5px;font-weight:700;${ozStatusStyle(s.status)}">${ozStatusLabel(s.status)}</div>
      </div>
      <div style="display:flex;gap:18px;margin-top:8px;font-size:12.5px">
        <div><div style="color:var(--muted);font-size:10.5px;text-transform:uppercase">Current</div>${ozCategoryLabel(s.category)} — ${escHtml(s.rtName)} — Room ${escHtml(s.fromRoom)}</div>
        <div style="font-size:16px;color:var(--teal)">→</div>
        <div><div style="color:var(--muted);font-size:10.5px;text-transform:uppercase">Proposed</div>${ozCategoryLabel(s.category)} — ${escHtml(s.rtName)} — Room ${escHtml(s.toRoom)}</div>
      </div>
      <div style="margin-top:8px;font-size:12px;color:#166534">${s.why.map(w=>`✓ ${escHtml(w)}`).join('<br>')}</div>
      ${s.error?`<div style="margin-top:6px;font-size:12px;color:#dc2626">⚠ ${escHtml(s.error)}</div>`:''}
      <div style="margin-top:10px;display:flex;gap:8px" id="ozMoveActions_${s.id}">
        ${s.status==='pending'?`<button class="btn btn-primary btn-sm" onclick="ozApproveOne(${i})">Approve</button><button class="btn btn-secondary btn-sm" onclick="ozSkipOne(${i})">Skip</button>`:''}
        ${s.status==='failed'?`<button class="btn btn-secondary btn-sm" onclick="ozOpenStraightline()">Recalculate</button>`:''}
      </div>
    </div>`).join('');
  const oneNightCards=analysis.oneNightGaps.map(g=>`
    <div class="oz-gap-card" style="border:1px dashed #f59e0b;background:#fffbeb;border-radius:10px;padding:12px 14px;margin-bottom:10px">
      <div style="font-weight:700;font-size:13px;color:#92400e">⚠ 1-NIGHT GAP — Room ${escHtml(g.room)}</div>
      <div style="font-size:12px;color:#92400e;margin-top:2px">${fmtDate(g.start)} – ${fmtDate(g.end)} · Potential extension opportunity</div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
        ${g.beforeBkId?`<button class="btn btn-secondary btn-sm" onclick="closeModal('ozReviewModal');openBookingFolio('${g.beforeBkId}')">Offer Previous Guest +1 Night</button>`:''}
        ${g.afterBkId?`<button class="btn btn-secondary btn-sm" onclick="closeModal('ozReviewModal');openBookingFolio('${g.afterBkId}')">Offer Next Guest Early Arrival</button>`:''}
      </div>
    </div>`).join('');
  body.innerHTML=(moveCards||'<div style="color:var(--muted);padding:10px 0">No room moves recommended for this range.</div>')+oneNightCards;
  const pendingCount=analysis.suggestions.filter(s=>s.status==='pending').length;
  document.getElementById('ozReviewFoot').innerHTML=`
    <div class="l" style="font-size:12px;color:var(--muted)">${pendingCount} move${pendingCount!==1?'s':''} awaiting approval</div>
    <div class="r">
      <button class="btn btn-secondary" onclick="closeModal('ozReviewModal')">Close</button>
      ${pendingCount?`<button class="btn btn-primary" onclick="ozApproveAllSafe()">Approve All Safe Moves</button>`:''}
    </div>`;
}
function ozStatusLabel(s){return{pending:'Pending review',skipped:'Skipped',validating:'Validating…',sending:'Sending to Cloudbeds…',confirmed:'✓ Confirmed',failed:'⚠ Not completed'}[s]||s;}
function ozStatusStyle(s){return{pending:'color:#6b7280',skipped:'color:#9ca3af',validating:'color:#0891b2',sending:'color:#0891b2',confirmed:'color:#16a34a',failed:'color:#dc2626'}[s]||'';}

function ozSkipOne(i){
  const s=_ozLastAnalysis.suggestions[i];if(!s)return;
  s.status='skipped';
  ozRenderReview();
}
async function ozApproveOne(i){
  const s=_ozLastAnalysis.suggestions[i];if(!s||s.status!=='pending')return;
  document.getElementById(`ozMoveStatus_${s.id}`).textContent=ozStatusLabel('validating');
  await ozExecuteMove(s);
  ozRenderReview();
  if(s.status==='confirmed'){venBuild();rcBuild();}
}
async function ozApproveAllSafe(){
  const pending=_ozLastAnalysis.suggestions.filter(s=>s.status==='pending');
  if(!pending.length)return;
  if(!confirm(`Approve and sync ${pending.length} move${pending.length!==1?'s':''} to Cloudbeds? Each will be validated again right before it's sent.`))return;
  let ok=0,failed=0;
  // Sequential, not parallel — Cloudbeds room assignment isn't safe to
  // parallelize against itself, and this makes per-move status trivial to
  // show live (Phase 2 decision).
  for(const s of pending){
    document.getElementById(`ozMoveStatus_${s.id}`)?.replaceChildren(document.createTextNode(ozStatusLabel('validating')));
    await ozExecuteMove(s);
    ozRenderReview();
    if(s.status==='confirmed')ok++;else if(s.status==='failed')failed++;
  }
  venBuild();rcBuild();
  ozShowCompletion(ok,failed);
}
function ozShowCompletion(ok,failed){
  const el=document.createElement('div');
  el.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center';
  el.innerHTML=`<div style="background:#fff;border-radius:12px;padding:24px 28px;max-width:380px;text-align:center">
    <div style="font-size:16px;font-weight:700;margin-bottom:10px">STRAIGHTLINE COMPLETE</div>
    <div style="font-size:14px;color:#16a34a;font-weight:600">${ok} move${ok!==1?'s':''} successful</div>
    ${failed?`<div style="font-size:14px;color:#dc2626;font-weight:600;margin-top:4px">${failed} move${failed!==1?'s':''} could not be completed</div>`:''}
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:center">
      ${failed?`<button class="btn btn-secondary btn-sm" id="ozViewFailedBtn">View Failed Move${failed!==1?'s':''}</button>`:''}
      <button class="btn btn-primary btn-sm" id="ozCloseCompleteBtn">Close</button>
    </div>
  </div>`;
  document.body.appendChild(el);
  el.querySelector('#ozCloseCompleteBtn').onclick=()=>el.remove();
  const viewBtn=el.querySelector('#ozViewFailedBtn');
  // Failed moves stay visible with their error + a Recalculate button in the
  // Review modal itself (ozRenderReview) — reopen it rather than duplicate
  // that view here.
  if(viewBtn)viewBtn.onclick=()=>{el.remove();openModal('ozReviewModal');ozRenderReview();};
}

// ── 🚨 OVERBOOKING BADGE + MODAL ─────────────────────────────────────────
// Checked on every Room Calendar load, not just when Straightline is
// clicked, so it surfaces even if nobody manually runs the optimizer.
let _ozOverbookAlerts=[];
async function ozRefreshOverbookBadge(){
  const badge=document.getElementById('ozOverbookBadge');
  if(!badge)return;
  try{
    const{start,end}=ozCurrentRange();
    const extReservations=await fetchExternalReservationsForRange(start,end);
    const groups=ozBuildGroups();
    _ozOverbookAlerts=ozDetectOverbooking(groups,extReservations,start,end);
  }catch(e){console.warn('[optimizer] overbooking check failed',e);_ozOverbookAlerts=[];}
  badge.style.display=_ozOverbookAlerts.length?'inline-flex':'none';
  badge.textContent=`🚨 OVERBOOKING (${_ozOverbookAlerts.length})`;
}
function ozOpenOverbookModal(){
  openModal('ozOverbookModal');
  ozRenderOverbookModal();
}
function ozRenderOverbookModal(){
  const body=document.getElementById('ozOverbookBody');
  if(!_ozOverbookAlerts.length){body.innerHTML='<div style="padding:20px;text-align:center;color:var(--muted)">No overbooking detected for the current calendar range.</div>';return;}
  body.innerHTML=_ozOverbookAlerts.map(a=>`
    <div class="oz-overbook-card" id="ozAlert_${a.id}" style="border:1px solid #fca5a5;background:#fef2f2;border-radius:10px;padding:14px;margin-bottom:12px">
      <div style="font-weight:700;color:#991b1b">🚨 OVERBOOKING — ${fmtDate(a.startDate)}</div>
      <div style="margin-top:4px;font-size:13px">${escHtml(a.rtName)} — ${ozCategoryLabel(a.category)}</div>
      <div style="margin-top:6px;font-size:12.5px;color:#7f1d1d">Available rooms: ${a.available} &nbsp;·&nbsp; Required rooms: ${a.required} &nbsp;·&nbsp; Overbooked by: ${a.overBy}</div>
      <div style="margin-top:2px;font-size:12px;color:#7f1d1d">Affected: ${fmtDate(a.startDate)} – ${fmtDate(a.endDate)}</div>
      <div id="ozAlertSolution_${a.id}" style="margin-top:10px"></div>
      <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="ozRunFindSolution('${a.id}')">Find Solution</button>
    </div>`).join('');
}
async function ozRunFindSolution(alertId){
  const container=document.getElementById(`ozAlertSolution_${alertId}`);
  if(container)container.innerHTML='<div style="font-size:12px;color:var(--muted)">Checking whether this can be resolved by reassigning rooms…</div>';
  const resolution=await ozFindSolutionForAlert(alertId);
  if(!container)return;
  if(!resolution){container.innerHTML='<div style="font-size:12px;color:#dc2626">Could not evaluate this alert — try again.</div>';return;}
  if(resolution.type==='true'){
    container.innerHTML=`<div style="background:#fff;border:1px solid #dc2626;border-radius:8px;padding:10px;font-size:12.5px;color:#7f1d1d">
      <b>🚨 TRUE INVENTORY OVERBOOKING</b><br>
      No valid room reassignment can accommodate all reservations within this property and category. Manual action required — this cannot be fixed by moving rooms alone.
    </div>`;
    return;
  }
  const moves=resolution.moves||[];
  if(!moves.length){container.innerHTML='<div style="font-size:12px;color:var(--muted)">No safe reassignment found for this window.</div>';return;}
  container.innerHTML=`<div style="background:#fff;border:1px solid #16a34a;border-radius:8px;padding:10px">
    <div style="font-weight:700;color:#166534;font-size:12.5px;margin-bottom:6px">SOLUTION FOUND</div>
    ${moves.map(m=>`<div style="font-size:12.5px;margin-bottom:6px">
      <b>${escHtml(m.guestLabel)}</b><br>Room ${escHtml(m.fromRoom)} → Room ${escHtml(m.toRoom)}<br>
      <span style="color:#166534">${m.why.map(w=>`✓ ${escHtml(w)}`).join('<br>')}</span>
    </div>`).join('')}
    <button class="btn btn-primary btn-sm" onclick='ozApproveOverbookSolution(${JSON.stringify(alertId)})'>Approve Solution</button>
  </div>`;
}
async function ozApproveOverbookSolution(alertId){
  const alert=_ozOverbookAlerts.find(a=>a.id===alertId);
  if(!alert||!alert.resolution||alert.resolution.type!=='assignment')return;
  const moves=alert.resolution.moves;
  if(!confirm(`Approve and sync ${moves.length} move${moves.length!==1?'s':''} to resolve this overbooking?`))return;
  for(const m of moves)await ozExecuteMove(m);
  venBuild();rcBuild();
  await ozRefreshOverbookBadge();
  ozRenderOverbookModal();
}
