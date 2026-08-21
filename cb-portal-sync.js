// ===== CLOUDBEDS PORTAL SYNC =====
// Extracted from booking-hub.html — edit THIS file for all Cloudbeds frontend sync logic.
// DO NOT duplicate these functions back into booking-hub.html.

const CLOUDBEDS_PROXY='/.netlify/functions/cloudbeds';
let cbSyncing=false,cbLastSync=null,cbRoomLookup={},cbAvailCache={};

// Block codes stored in localStorage separately from bookings — immune to Supabase merge overwrites
function _cbGetBlockCode(bk){
  if(!bk)return null;
  try{const m=JSON.parse(localStorage.getItem('amansala_cb_block_codes')||'{}');return bk.cbAllotmentBlockCode||m[bk.id]||null;}catch(e){return bk.cbAllotmentBlockCode||null;}
}
function _cbSetBlockCode(bk,code){
  if(!bk)return;
  bk.cbAllotmentBlockCode=code||null;
  try{const m=JSON.parse(localStorage.getItem('amansala_cb_block_codes')||'{}');if(code)m[bk.id]=code;else delete m[bk.id];localStorage.setItem('amansala_cb_block_codes',JSON.stringify(m));}catch(e){}
}

function cbIsLowSeason(dateStr){return isLowSeason(dateStr);}

function setSyncStatus(state,msg){
  const badge=document.getElementById('cbSyncBadge');
  const dot=document.getElementById('cbSyncDot');
  const txt=document.getElementById('cbSyncMsg');
  if(!badge)return;
  badge.style.display='flex';
  if(state==='syncing'){dot.style.background='#f59e0b';dot.style.animation='cbPulse 1s infinite';txt.textContent=msg||'Syncing Cloudbeds…';}
  else if(state==='ok'){dot.style.background='#22c55e';dot.style.animation='';txt.textContent=msg||'Cloudbeds synced';setTimeout(()=>{badge.style.display='none';},3000);}
  else{dot.style.background='#ef4444';dot.style.animation='';txt.textContent=msg||'Cloudbeds error';setTimeout(()=>{badge.style.display='none';},4000);}
}

async function syncAllFromCloudbeds(){
  if(cbSyncing)return;cbSyncing=true;setSyncStatus('syncing');
  try{await syncRoomTypesFromCloudbeds();cbLastSync=new Date().toISOString();setSyncStatus('ok');}
  catch(err){console.warn('[CB sync failed]',err);setSyncStatus('error',err.message);}
  finally{cbSyncing=false;}
}

async function syncRoomTypesFromCloudbeds(){
  const res=await fetch(`${CLOUDBEDS_PROXY}?action=getRooms`);
  if(!res.ok)throw new Error(`getRooms HTTP ${res.status}`);
  const data=await res.json();if(data.error)throw new Error(data.error);
  // Only update the room lookup map for availability/rate sync — never overwrite portal room types
  if(data.roomLookup)cbRoomLookup=data.roomLookup;
  // DO NOT replace roomTypes — portal room configuration is managed here, not in Cloudbeds
}

async function pushReservationsToCloudbeds(bk){
  console.log('[CB push] blockedRooms:',JSON.stringify(bk.blockedRooms),'existingIds:',JSON.stringify(bk.cbReservationIds||{}));
  if(!bk.blockedRooms||!bk.blockedRooms.length){console.log('[CB push] no rooms, exit');return;}
  if(!bk.cbReservationIds)bk.cbReservationIds={};
  if(!bk.cbGuestIds)bk.cbGuestIds={};
  if(!bk.cbAdjustmentIds)bk.cbAdjustmentIds={};


  // Create Group Profile → Event → AllotmentBlock (once per booking, skip if already done)
  let allotmentBlockCode=_cbGetBlockCode(bk);
  // Pre-verify: when block code is known, use getReservations (one call) instead of
  // 37 individual checkReservation calls — avoids rate limiting and status field mismatches.
  // Without block code, fall back to individual checkReservation per stored ID.
  if(allotmentBlockCode&&Object.keys(bk.cbReservationIds||{}).length>0){
    try{
      const recRes=await fetch(`${CLOUDBEDS_PROXY}?action=recoverCbIds`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({bookingId:bk.id,startDate:bk.startDate,endDate:bk.endDate,allotmentBlockCode,blockedRooms:bk.blockedRooms||[]})});
      const recD=await recRes.json();
      const recoveredIds=recD.cbIds||{};
      const foundCount=Object.keys(recoveredIds).length;
      console.log('[CB pre-verify] block lookup found:',foundCount,'rooms');
      if(foundCount>0){
        for(const roomName of Object.keys(bk.cbReservationIds||{})){
          const storedId=bk.cbReservationIds[roomName];
          if(!storedId)continue;
          const recoveredId=recoveredIds[roomName];
          if(recoveredId&&recoveredId===storedId){
            // Same ID confirmed active — keep
          } else if(recoveredId&&recoveredId!==storedId){
            // Recover found this room with a different (correct) ID → update it
            console.log('[CB pre-verify] correcting ID for',roomName,'('+storedId+'→'+recoveredId+')');
            bk.cbReservationIds[roomName]=recoveredId;
            if(recD.cbGuestIds?.[roomName])bk.cbGuestIds[roomName]=recD.cbGuestIds[roomName];
          } else {
            // Room not in recovered results — may be deleted. But first check if another
            // portal room shares this same CB ID (e.g. "1B" and "1b" both pointing to the
            // same reservation due to a prior Recover casing error). In that case the other
            // room "consumed" the ID in recoveredIds — don't auto-clear, let user fix manually.
            const sharedWith=Object.entries(bk.cbReservationIds).find(([r,id])=>r!==roomName&&id===storedId);
            if(sharedWith){
              console.log('[CB pre-verify] room',roomName,'shares ID',storedId,'with',sharedWith[0],'— skipping auto-clear (ambiguous)');
            } else {
              // Unique ID not found in recover → reservation genuinely deleted in Cloudbeds
              console.log('[CB pre-verify] stale ID for',roomName,'('+storedId+') — not found in block, clearing');
              delete bk.cbReservationIds[roomName];
              if(bk.cbGuestIds)delete bk.cbGuestIds[roomName];
              if(bk.cbAdjustmentIds)delete bk.cbAdjustmentIds[roomName];
            }
          }
        }
      } else {
        // recoverCbIds returned 0 — all reservations in the block were likely cancelled in CB.
        // Fall back to individual checkReservation to confirm each stored ID is truly inactive.
        // Deduplicate calls when multiple portal rooms share the same CB reservation ID.
        console.log('[CB pre-verify] foundCount=0 — verifying stored IDs individually');
        const _checkedIds={};
        for(const roomName of Object.keys(bk.cbReservationIds||{})){
          const storedId=bk.cbReservationIds[roomName];
          if(!storedId)continue;
          if(!(storedId in _checkedIds)){
            try{
              const chk=await fetch(`${CLOUDBEDS_PROXY}?action=checkReservation`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reservationId:storedId})});
              const chkD=await chk.json();
              _checkedIds[storedId]=chkD.active!==false;
            }catch(e){_checkedIds[storedId]=true;/* network error — assume active */}
          }
          if(!_checkedIds[storedId]){
            console.log('[CB pre-verify] stale (all-cancelled)',roomName,'('+storedId+') — removing');
            delete bk.cbReservationIds[roomName];
            if(bk.cbGuestIds)delete bk.cbGuestIds[roomName];
            if(bk.cbAdjustmentIds)delete bk.cbAdjustmentIds[roomName];
          }
        }
      }
    }catch(e){console.warn('[CB pre-verify] block lookup failed, skipping verify:',e.message);}
  } else {
    for(const roomName of Object.keys(bk.cbReservationIds||{})){
      const storedId=bk.cbReservationIds[roomName];
      if(!storedId)continue;
      try{
        const chk=await fetch(`${CLOUDBEDS_PROXY}?action=checkReservation`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reservationId:storedId})});
        const chkD=await chk.json();
        if(!chkD.active){
          console.log('[CB pre-verify] stale ID for',roomName,'('+storedId+') — removing');
          delete bk.cbReservationIds[roomName];
          if(bk.cbGuestIds)delete bk.cbGuestIds[roomName];
          if(bk.cbAdjustmentIds)delete bk.cbAdjustmentIds[roomName];
        }
      }catch(e){/* network error — assume valid */}
    }
  }
  const hasExistingReservations=Object.keys(bk.cbReservationIds||{}).length>0;
  // If all room IDs were stale AND there was never an allotment block → full fresh start
  // But if we already have a block code, keep it — the block exists independently of room reservations
  if(!hasExistingReservations&&!allotmentBlockCode){bk.cbGroupCode=null;bk.cbEventId=null;}
  // If cbAllotmentBlockCode was lost (stale reference, sync race) but we have existing
  // reservations, recover it from Cloudbeds before creating new ones.
  if(!allotmentBlockCode&&hasExistingReservations){
    const firstResId=Object.values(bk.cbReservationIds).find(Boolean);
    if(firstResId){
      try{
        const rr=await fetch(`${CLOUDBEDS_PROXY}?action=getReservationBlock`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reservationId:firstResId})});
        const rd=await rr.json();
        if(rd.allotmentBlockCode){allotmentBlockCode=rd.allotmentBlockCode;bk.cbAllotmentBlockCode=allotmentBlockCode;if(rd.groupCode)bk.cbGroupCode=rd.groupCode;console.log('[CB group] recovered block:',allotmentBlockCode,'group:',rd.groupCode);}
        else console.warn('[CB group] existing reservations have no block code — new room will be unlinked');
      }catch(e){console.warn('[CB group] recovery failed:',e.message);}
    }
  }
  const newRooms=bk.blockedRooms.filter(r=>!(bk.cbReservationIds||{})[r]);
  // Create group event if: no block code AND there are new rooms to create.
  // Don't gate on hasExistingReservations — if recovery failed and we have new rooms,
  // we still need an event (otherwise rooms are created unlinked / "outside the event").
  if(!allotmentBlockCode&&newRooms.length>0){
    // Fresh block: create new event + allotment block
    try{
      const gRes=await fetch(`${CLOUDBEDS_PROXY}?action=createGroupEvent`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({retreatName:bk.retreatName||bk.row||'',leaderName:bk.leaderName||'',startDate:bk.startDate,endDate:bk.endDate,rooms:bk.blockedRooms})});
      const gd=await gRes.json();
      if(gd.allotmentBlockCode){allotmentBlockCode=gd.allotmentBlockCode;bk.cbAllotmentBlockCode=allotmentBlockCode;bk.cbGroupCode=gd.eventCode||null;bk.cbEventId=gd.eventId;bk.cbProfileId=gd.profileId;console.log('[CB group] event='+gd.eventId+' block='+allotmentBlockCode);}
      else console.warn('[CB group] no allotmentBlockCode:',JSON.stringify(gd).slice(0,200));
    }catch(e){console.warn('[CB group] failed, proceeding without group:',e.message);}
  }
  // Use the manual mapping from Cloudbeds Settings if available
  const cbCfg=JSON.parse(localStorage.getItem('ama_cb_config')||'{}');
  const cbMapping=cbCfg.mapping||[]; // [{cbId, portalRoom}]

  // Main loop: create one individual Cloudbeds reservation per blocked room.
  // This applies to ALL room types including Casa Grande (cg1-cg5) and Casa Shanti (csh1-csh2)
  // which now each have their own physical room in Cloudbeds via Split Inventory.
  for(const roomName of bk.blockedRooms){
    if(bk.cbReservationIds[roomName]){
      // Already verified active in the pre-verify pass above — safe to skip
      const existingId=bk.cbReservationIds[roomName];
      {
        const reg=AppData.regs.find(r=>r.bookingId===bk.id&&r.room===roomName);
        const guestNames=(reg?.guests||[]).filter(g=>g.name).map(g=>g.name.trim());
        if(guestNames.length){
          const up={reservationId:existingId,roomName,startDate:bk.startDate,endDate:bk.endDate,
            guestFirstName:guestNames.join(' & '),groupName:bk.retreatName||bk.row||'',
            leaderName:bk.leaderName||'',adults:guestNames.length,dailyRate:0};
          fetch(`${CLOUDBEDS_PROXY}?action=updateReservationGuest`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(up)}).catch(e=>console.warn('[CB name sync]',e));
        }
        console.log('[CB push] skip (existing)',roomName,'id:',existingId,guestNames.length?'→ name synced':'→ no guest yet');
        continue;
      }
    }
    try{
      const mapped=cbMapping.find(m=>m.portalRoom===roomName);
      const payload={roomName,startDate:bk.startDate,endDate:bk.endDate,groupName:bk.retreatName||bk.row||'',leaderName:bk.leaderName||'',adults:1,dailyRate:0,bookingId:bk.id};
      if(allotmentBlockCode)payload.allotmentBlockCode=allotmentBlockCode;
      if(mapped?.cbId){
        payload.cbRoomId=mapped.cbId;
      }else{
        const directId=cbRoomLookup[roomName];
        if(directId){payload.cbRoomId=directId;}
        else{
          const norm=s=>s.toLowerCase().replace(/\s*-\s*/g,'-');
          const normRoom=norm(roomName);
          const cbKey=Object.keys(cbRoomLookup).find(k=>norm(k)===normRoom);
          if(cbKey)payload.cbRoomId=cbRoomLookup[cbKey];
        }
      }
      console.log('[CB push] trying room',roomName,'cbRoomId:',payload.cbRoomId||'(none, will lookup by name)');
      const res=await fetch(`${CLOUDBEDS_PROXY}?action=createReservation`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d=await res.json();
      console.log('[CB push] response for',roomName,':',JSON.stringify(d).slice(0,200));
      if(!res.ok||d.error)throw new Error(d.error||`HTTP ${res.status}`);
      if(d.reservationId){bk.cbReservationIds[roomName]=d.reservationId;console.log('[CB push] SUCCESS portal='+roomName+' → cbRoomName='+d.cbRoomName+' resId='+d.reservationId+' roomAssign='+JSON.stringify(d.roomAssign)+' rateApply='+JSON.stringify(d.rateApply)+' adjustmentId='+d.adjustmentId);}
      if(d.guestId)bk.cbGuestIds[roomName]=d.guestId;
      if(!bk.cbAdjustmentIds)bk.cbAdjustmentIds={};
      bk.cbAdjustmentIds[roomName]=d.adjustmentId||null;
    }catch(err){console.warn(`[CB block] ${roomName}: ${err.message}`);}
  }
  // If a Supabase realtime sync fired during this async function, the bookings array
  // was replaced and bk is now a stale reference. Re-apply our CB changes to the
  // current live object so saveAll() persists them.
  function _reapplyCbToBk(){
    const live=AppData.bookings.find(b=>b.id===bk.id);
    if(live){
      if(Object.keys(bk.cbReservationIds||{}).length>=Object.keys(live.cbReservationIds||{}).length)live.cbReservationIds=bk.cbReservationIds;
      live.cbGuestIds=bk.cbGuestIds;
      live.cbAdjustmentIds=bk.cbAdjustmentIds;
      if(bk.cbAllotmentBlockCode)live.cbAllotmentBlockCode=bk.cbAllotmentBlockCode;
      if(bk.cbEventId)live.cbEventId=bk.cbEventId;
      if(bk.cbNoteIds)live.cbNoteIds=bk.cbNoteIds;
    }
  }
  _reapplyCbToBk();
  saveAll();
  // Second save after 2s to catch any realtime update that fires right after the first save
  setTimeout(()=>{_reapplyCbToBk();saveAll();},2000);
}

async function restoreCancelledReservations(reservationIds){
  if(!reservationIds||!reservationIds.length)return;
  showToast(`Restoring ${reservationIds.length} reservations in Cloudbeds…`);
  let ok=0,fail=0;
  for(const reservationId of reservationIds){
    try{
      const res=await fetch(`${CLOUDBEDS_PROXY}?action=restoreReservation`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reservationId})});
      const d=await res.json();
      if(d.success){ok++;}else{fail++;console.warn('[CB restore] failed:',reservationId,d);}
    }catch(e){fail++;console.warn('[CB restore] error:',reservationId,e);}
  }
  showToast(`Restored ${ok} reservation${ok!==1?'s':''}${fail?` (${fail} failed)`:''}. Refresh Cloudbeds to confirm.`);
}

async function cancelCloudbedReservations(bk,{wait=false}={}){
  if(!bk)return;
  // Deduplicate IDs in case any rooms share a reservation (migration safety)
  const ids=[...new Set(Object.values(bk.cbReservationIds||{}).filter(Boolean))];
  const calls=ids.map(reservationId=>
    fetch(`${CLOUDBEDS_PROXY}?action=cancelReservation`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reservationId})})
      .catch(e=>console.warn('[CB cancel]',e))
  );
  if(wait)await Promise.all(calls);
}

function syncNotesToCloudbeds(reg){
  if(!reg)return;
  const bk=AppData.bookings.find(b=>b.id===reg.bookingId);
  if(!bk)return;
  const cbResId=(bk?.cbReservationIds||{})[reg.room];
  if(!cbResId)return;
  const guestNoteLines=(reg.guests||[]).filter(g=>g.name&&g.notes).map(g=>`${g.name}: ${g.notes}`);
  const allNotes=[reg.notes,...guestNoteLines].filter(Boolean).join('\n');
  const noteId=(bk?.cbNoteIds||{})[reg.room]||null;
  fetch(`${CLOUDBEDS_PROXY}?action=updateReservationNotes`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({reservationId:cbResId,notes:allNotes,noteId})
  }).then(r=>r.json()).then(d=>{
    if(!bk.cbNoteIds)bk.cbNoteIds={};
    if(d.noteId){bk.cbNoteIds[reg.room]=d.noteId;saveAll();}
    else if(d.deleted){bk.cbNoteIds[reg.room]=null;saveAll();}
  }).catch(e=>console.warn('[CB notes sync]',e));
}

function resetCbReservationIds(){
  const bk=AppData.bookings.find(b=>b.id===blockEditBkId);
  if(!bk)return;
  if(!confirm('Clear all stored Cloudbeds reservation IDs for this retreat?\n\nThis will NOT cancel the existing reservations in Cloudbeds — it just lets the portal re-create them on the next Save Block.'))return;
  bk.cbReservationIds={};
  bk.cbGuestIds={};
  bk.cbAdjustmentIds={};
  bk.cbAllotmentBlockCode=null;
  bk.cbGroupCode=null;
  bk.cbEventId=null;
  saveAll();
  showToast('CB reservation IDs cleared. Save the block again to re-sync.');
}

function openCbIdsModal(){
  const bk=AppData.bookings.find(b=>b.id===blockEditBkId);
  if(!bk)return;
  const rooms=bk.blockedRooms||[];
  const cbIds=bk.cbReservationIds||{};
  const body=document.getElementById('cbIdsModalBody');
  if(!body)return;
  const blockCode=_cbGetBlockCode(bk)||'';
  const hasBlockCode=!!blockCode;
  const noRoomsNote=!rooms.length?`<div style="font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:8px 10px;margin-bottom:6px">⚠ No rooms blocked yet — enter the Block Code below then click ⬇ Recover CB IDs to auto-import rooms from Cloudbeds.</div>`:'';
  body.innerHTML=noRoomsNote+`<div style="border:1.5px solid ${hasBlockCode?'#86efac':'#fde68a'};border-radius:8px;padding:10px 12px;background:${hasBlockCode?'#f0fdf4':'#fffbeb'};margin-bottom:4px">
    <div style="font-size:11px;font-weight:700;color:${hasBlockCode?'#15803d':'#92400e'};margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px">Allotment Block Code ${hasBlockCode?'✓':' — required for Recover CB IDs'}</div>
    <input id="cbBlockCodeInput" type="text" value="${escHtml(blockCode)}" placeholder="Paste from Cloudbeds event (e.g. b123456)"
      style="width:100%;box-sizing:border-box;padding:7px 10px;border:1.5px solid ${hasBlockCode?'#86efac':'#fcd34d'};border-radius:6px;font-size:13px;font-family:'Jost',sans-serif">
    <div style="font-size:11px;color:#6b7280;margin-top:4px">In Cloudbeds → open the group event → copy the Block Code. Save here, then use ⬇ Recover CB IDs.</div>
  </div>`+rooms.map(room=>{
    const existing=cbIds[room]||'';
    const hasId=!!existing;
    return `<div style="display:flex;align-items:center;gap:10px">
      <div style="width:110px;font-size:13px;font-weight:600;color:var(--dark);flex-shrink:0">${escHtml(room)}</div>
      <input type="text" data-room="${escHtml(room)}" value="${escHtml(existing)}" placeholder="Cloudbeds reservation ID"
        style="flex:1;padding:7px 10px;border:1.5px solid ${hasId?'#86efac':'var(--border)'};border-radius:8px;font-size:13px;font-family:'Jost',sans-serif">
      ${hasId?'<span style="font-size:11px;color:#16a34a;flex-shrink:0">✓ linked</span>':'<span style="font-size:11px;color:#9ca3af;flex-shrink:0">not linked</span>'}
    </div>`;
  }).join('');
  openModal('cbIdsModal');
}

function saveCbIds(){
  const bk=AppData.bookings.find(b=>b.id===blockEditBkId);
  if(!bk)return;
  if(!bk.cbReservationIds)bk.cbReservationIds={};
  let saved=0;
  const blockCodeEl=document.getElementById('cbBlockCodeInput');
  if(blockCodeEl){
    const bc=(blockCodeEl.value||'').trim();
    const current=_cbGetBlockCode(bk)||'';
    if(bc!==current){_cbSetBlockCode(bk,bc||null);saved++;}
  }
  document.querySelectorAll('#cbIdsModalBody input[data-room]').forEach(inp=>{
    const room=inp.dataset.room;
    const val=(inp.value||'').trim();
    if(val&&val!==bk.cbReservationIds[room]){bk.cbReservationIds[room]=val;saved++;}
    else if(!val&&bk.cbReservationIds[room]){delete bk.cbReservationIds[room];saved++;}
  });
  saveAll();
  closeModal('cbIdsModal');
  showToast(saved?`Saved ${saved} change${saved!==1?'s':''}. Use ⬇ Recover CB IDs to auto-fill room IDs.`:'No changes.');
}

async function recoverCbReservationIds(){
  const bk=AppData.bookings.find(b=>b.id===blockEditBkId);
  if(!bk)return;
  if(!bk.startDate||!bk.endDate){showToast('Booking has no dates — cannot recover.');return;}
  showToast('Querying Cloudbeds for existing reservations…');
  try{
    const res=await fetch(`${CLOUDBEDS_PROXY}?action=recoverCbIds`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({bookingId:bk.id,startDate:bk.startDate,endDate:bk.endDate,allotmentBlockCode:_cbGetBlockCode(bk),blockedRooms:bk.blockedRooms||[]})
    });
    const d=await res.json();
    if(d.error)throw new Error(d.error);
    if(!d.count){showToast('No matching Cloudbeds reservations found for this booking.');return;}
    // Backend already resolved duplicates — always accept recovered IDs as source of truth
    if(!bk.cbReservationIds)bk.cbReservationIds={};
    if(!bk.cbGuestIds)bk.cbGuestIds={};
    let added=0,roomsAdded=0;
    Object.entries(d.cbIds||{}).forEach(([room,id])=>{
      if(bk.cbReservationIds[room]!==id){bk.cbReservationIds[room]=id;added++;}
      // Also restore blockedRooms if Cloudbeds has rooms the portal lost
      if(!(bk.blockedRooms||[]).includes(room)){
        if(!bk.blockedRooms)bk.blockedRooms=[];
        bk.blockedRooms.push(room);
        roomsAdded++;
      }
    });
    Object.entries(d.cbGuestIds||{}).forEach(([room,id])=>{if(!bk.cbGuestIds[room])bk.cbGuestIds[room]=id;});
    console.log('[CB recover] found='+d.count+' added='+added+' roomsAdded='+roomsAdded,'ids:',JSON.stringify(bk.cbReservationIds));
    // Re-apply recovered data to the live booking object in case Supabase realtime
    // replaced bookings[] between saveAll() and now
    function _reapplyRecover(){
      const live=AppData.bookings.find(b=>b.id===bk.id);
      if(!live)return;
      Object.entries(d.cbIds||{}).forEach(([room,id])=>{
        if(!live.cbReservationIds)live.cbReservationIds={};
        live.cbReservationIds[room]=id;
        if(!(live.blockedRooms||[]).includes(room)){
          if(!live.blockedRooms)live.blockedRooms=[];
          live.blockedRooms.push(room);
        }
      });
    }
    _reapplyRecover();
    saveAll();
    const msg=roomsAdded>0
      ?`Recovered ${added} CB IDs and restored ${roomsAdded} missing room${roomsAdded!==1?'s':''} to block.`
      :`Recovered ${added} Cloudbeds reservation ID${added!==1?'s':''}. Teacher sync should now work.`;
    showToast(msg);
    // Re-apply again after 2s to catch any realtime Supabase event that fires after saveAll
    setTimeout(()=>{_reapplyRecover();saveAll();},2000);
    // Refresh the Block Rooms modal after 2.5s so recovered rooms appear with checkboxes
    if(typeof openBlockModal==='function'){
      closeModal('cbIdsModal');
      setTimeout(()=>openBlockModal(bk.id),2500);
    }
  }catch(e){
    console.warn('[CB recover]',e);
    showToast('Recovery failed: '+e.message);
  }
}

async function cbSyncNamesForBooking(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);
  if(!bk){showToast('Retiro no encontrado.');return;}
  const cbIds=bk.cbReservationIds||{};
  if(!Object.keys(cbIds).length){showToast('Este retiro no tiene reservaciones en Cloudbeds.');return;}
  let synced=0,skipped=0;
  showToast('Sincronizando nombres con Cloudbeds…');
  for(const roomName of Object.keys(cbIds)){
    const existingId=cbIds[roomName];if(!existingId)continue;
    const reg=AppData.regs.find(r=>r.bookingId===bk.id&&r.room===roomName);
    const guestNames=(reg?.guests||[]).filter(g=>g.name).map(g=>g.name.trim());
    if(!guestNames.length){skipped++;continue;}
    try{
      await fetch(`${CLOUDBEDS_PROXY}?action=updateReservationGuest`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({reservationId:existingId,roomName,startDate:bk.startDate,endDate:bk.endDate,
          guestFirstName:guestNames.join(' & '),groupName:bk.retreatName||bk.row||'',
          leaderName:bk.leaderName||'',adults:guestNames.length,dailyRate:0})});
      synced++;
    }catch(e){console.warn('[CB sync names]',roomName,e);}
  }
  showToast(`Nombres sincronizados: ${synced} cuarto${synced!==1?'s':''}${skipped?' ('+skipped+' sin huésped)':''}.`);
}

// ===== CB SYNC ALL =====
function openCbSyncAllModal(){
  const list=document.getElementById('cbSyncAllList');
  const log=document.getElementById('cbSyncAllLog');
  const status=document.getElementById('cbSyncAllStatus');
  if(log){log.style.display='none';log.innerHTML='';}
  if(status)status.textContent='';

  // Build list of bookings with CB reservations
  const bks=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.blockedRooms?.length&&Object.keys(b.cbReservationIds||{}).length>0)
    .sort((a,b)=>(a.startDate||'').localeCompare(b.startDate||''));

  if(!list)return;
  if(!bks.length){
    list.innerHTML='<div style="font-size:13px;color:var(--muted);padding:8px 0">No retreats with linked Cloudbeds reservations found.</div>';
    openModal('cbSyncAllModal');return;
  }
  list.innerHTML=bks.map(bk=>{
    const linked=Object.keys(bk.cbReservationIds||{}).length;
    const total=(bk.blockedRooms||[]).length;
    const hasAdj=Object.values(bk.cbAdjustmentIds||{}).some(Boolean);
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:#fafafa">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600;color:var(--dark)">${escHtml(bk.retreatName||bk.row||bk.id)}</div>
        <div style="font-size:12px;color:var(--muted)">${bk.startDate||'?'} – ${bk.endDate||'?'} &nbsp;·&nbsp; ${linked}/${total} rooms linked</div>
      </div>
      ${hasAdj?'<span style="font-size:11px;color:#dc2626;padding:3px 8px;background:#fef2f2;border-radius:20px;border:1px solid #fca5a5">has negative rates</span>':'<span style="font-size:11px;color:#16a34a;padding:3px 8px;background:#f0fdf4;border-radius:20px;border:1px solid #86efac">clean</span>'}
      <div id="cbSyncRow-${escHtml(bk.id)}" style="font-size:12px;color:var(--muted);width:80px;text-align:right"></div>
    </div>`;
  }).join('');

  if(status)status.textContent=bks.length+' retreat'+(bks.length!==1?'s':'')+' with CB reservations';
  openModal('cbSyncAllModal');
}

function _cbSyncLog(msg){
  const log=document.getElementById('cbSyncAllLog');
  if(!log)return;
  log.style.display='block';
  log.innerHTML+=escHtml(msg)+'<br>';
  log.scrollTop=log.scrollHeight;
}

async function cbSyncAllNames(){
  const btn=document.getElementById('cbSyncAllNamesBtn');
  const fixBtn=document.getElementById('cbSyncAllFixBtn');
  if(btn)btn.disabled=true;if(fixBtn)fixBtn.disabled=true;
  const status=document.getElementById('cbSyncAllStatus');
  const bks=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.blockedRooms?.length&&Object.keys(b.cbReservationIds||{}).length>0)
    .sort((a,b)=>(a.startDate||'').localeCompare(b.startDate||''));
  let done=0,synced=0;
  for(const bk of bks){
    const rowEl=document.getElementById('cbSyncRow-'+bk.id);
    if(rowEl)rowEl.textContent='syncing…';
    const cbIds=bk.cbReservationIds||{};
    let roomsDone=0;
    for(const roomName of Object.keys(cbIds)){
      const existingId=cbIds[roomName];if(!existingId)continue;
      const reg=AppData.regs.find(r=>r.bookingId===bk.id&&r.room===roomName);
      const guestNames=(reg?.guests||[]).filter(g=>g.name).map(g=>g.name.trim());
      if(!guestNames.length)continue;
      try{
        await fetch(`${CLOUDBEDS_PROXY}?action=updateReservationGuest`,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({reservationId:existingId,roomName,startDate:bk.startDate,endDate:bk.endDate,
            guestFirstName:guestNames.join(' & '),groupName:bk.retreatName||bk.row||'',
            leaderName:bk.leaderName||'',adults:guestNames.length,dailyRate:0})});
        roomsDone++;synced++;
        _cbSyncLog((bk.retreatName||bk.id)+' › '+roomName+' → '+guestNames.join(' & '));
      }catch(e){_cbSyncLog('ERROR '+roomName+': '+e.message);}
    }
    if(rowEl)rowEl.textContent=roomsDone?roomsDone+' updated':'no guests';
    done++;
    if(status)status.textContent='Synced '+done+'/'+bks.length+' retreats…';
  }
  if(status)status.textContent='Done — '+synced+' name'+(synced!==1?'s':'')+' synced to Cloudbeds.';
  if(btn)btn.disabled=false;if(fixBtn)fixBtn.disabled=false;
}

async function cbSyncAllFix(){
  const bks=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.blockedRooms?.length&&Object.keys(b.cbReservationIds||{}).length>0);
  if(!bks.length){showToast('No retreats to fix.');return;}
  const names=bks.map(b=>b.retreatName||b.row||b.id).join('\n• ');
  if(!confirm(`This will CANCEL all Cloudbeds reservations for ${bks.length} retreat(s) and recreate them cleanly (fixes negative rate entries):\n\n• ${names}\n\nContinue?`))return;

  const btn=document.getElementById('cbSyncAllFixBtn');
  const namesBtn=document.getElementById('cbSyncAllNamesBtn');
  if(btn)btn.disabled=true;if(namesBtn)namesBtn.disabled=true;
  const status=document.getElementById('cbSyncAllStatus');
  let done=0;
  for(const bk of bks){
    const rowEl=document.getElementById('cbSyncRow-'+bk.id);
    if(rowEl)rowEl.textContent='resetting…';
    const nIds=Object.keys(bk.cbReservationIds||{}).length;
    _cbSyncLog((bk.retreatName||bk.id)+': cancelling '+nIds+' CB reservation(s)…');
    await cancelCloudbedReservations(bk,{wait:true});
    bk.cbReservationIds={};bk.cbGuestIds={};bk.cbAdjustmentIds={};
    bk.cbAllotmentBlockCode=null;bk.cbGroupCode=null;bk.cbEventId=null;
    saveAll();
    // Wait 3s for Cloudbeds to process cancellations before recreating
    await new Promise(r=>setTimeout(r,3000));
    _cbSyncLog((bk.retreatName||bk.id)+': creating new reservations…');
    await pushReservationsToCloudbeds(bk);
    saveAll(); // extra save to help Supabase sync race condition
    if(rowEl)rowEl.textContent='✓ done';
    done++;
    if(status)status.textContent='Fixed '+done+'/'+bks.length+' retreats…';
  }
  if(status)status.textContent='Done — '+done+' retreat'+(done!==1?'s':'')+' recreated cleanly in Cloudbeds.';
  if(btn)btn.disabled=false;if(namesBtn)namesBtn.disabled=false;
}
