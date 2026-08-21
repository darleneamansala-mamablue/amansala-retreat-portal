// ===== room-blocking.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== ROOM BLOCKING =====
let blockEditBkId=null;

function datesOverlap(s1,e1,s2,e2){return s1<e2&&e1>s2;}

function blockUpdateCount(){
  const n=document.querySelectorAll('#blockModalBody .block-room-item input:checked').length;
  document.getElementById('blockSelCount').textContent=n+' room'+(n===1?'':'s')+' selected';
}

function getRowAllowedRooms(row){
  if(!row)return null;
  const r=row.toUpperCase();
  const allowed=new Set();
  if(r==='CASA GRANDE'){
    AppData.roomTypes.filter(rt=>rt.property==='CASA GRANDE').forEach(rt=>rt.rooms.forEach(room=>allowed.add(room)));
  }else if(r==='CASA SHANTI'){
    AppData.roomTypes.filter(rt=>rt.property==='CASA SHANTI').forEach(rt=>rt.rooms.forEach(room=>allowed.add(room)));
  }else if(r==='CHICA'){
    AppData.roomTypes.filter(rt=>(rt.property||'AMANSALA')==='AMANSALA').forEach(rt=>{
      rt.rooms.filter(room=>room.toUpperCase().startsWith('CH')).forEach(room=>allowed.add(room));
    });
  }else if(r==='CASITA 4'){
    const C4_IDS=new Set(['c4a','c4b','c4c']);
    AppData.roomTypes.filter(rt=>C4_IDS.has(rt.id)).forEach(rt=>rt.rooms.forEach(room=>allowed.add(room)));
  }else{
    // RETREAT 1-4: Amansala proper — exclude Ch/CSH/CG/C4 rooms (those belong to their own rows)
    const _C4_IDS=new Set(['c4a','c4b','c4c']);
    AppData.roomTypes.filter(rt=>(rt.property||'AMANSALA')==='AMANSALA'&&!_C4_IDS.has(rt.id)).forEach(rt=>{
      rt.rooms.filter(room=>{const u=room.toUpperCase();return!u.startsWith('CH');}).forEach(room=>allowed.add(room));
    });
  }
  return allowed;
}

/** Rooms from a back-to-back retreat on the same row (straight-line continuity). */
function getStraightLineRooms(bk){
  const sl=new Set();
  if(!bk||!bk.startDate||!bk.row)return sl;
  const row=(bk.row||'').toUpperCase();
  AppData.bookings.forEach(other=>{
    if(other.id===bk.id)return;
    if((other.row||'').toUpperCase()!==row)return;
    if(other.endDate!==bk.startDate)return;
    (other.blockedRooms||[]).forEach(r=>sl.add(r));
  });
  return sl;
}

function roomInAutoPool(room,bk,rowAllowed,takenRooms){
  if(takenRooms.has(room))return false;
  if(rowAllowed&&!rowAllowed.has(room))return false;
  const u=room.toUpperCase();
  if(u.startsWith('CH')&&(bk.row||'').toUpperCase()!=='CHICA')return false;
  return true;
}

function roomAutoSortKey(room,slRooms){
  const sl=slRooms.has(room)?0:1;
  const u=room.toUpperCase();
  const bld=/^[0-9]/.test(room)||/^[0-9A-Z][0-9A-Z]?B?$/i.test(room)?1:u.startsWith('CH')?2:u.startsWith('GV')?3:4;
  return sl*10+bld;
}

let _blockModalOrigRooms=[];// snapshot of blockedRooms when modal opened — used by blockSave to diff correctly
async function openBlockModal(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);
  if(!bk)return;
  blockEditBkId=bkId;
  _blockModalOrigRooms=[...(bk.blockedRooms||[])];// snapshot BEFORE any Recover CB IDs could modify bk
  document.getElementById('blockModalSub').textContent=
    `${bk.leaderName||bk.retreatName} · ${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}${bk.pax?' · '+bk.pax+' estimated guests':''}`;

  // Fetch external Cloudbeds reservations for this booking's date range
  try{
    const extResp=await fetch('/.netlify/functions/cloudbeds?action=getExternalReservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({startDate:bk.startDate,endDate:bk.endDate})});
    const extData=await extResp.json();
    if(extData?.success)externalReservations=extData.reservations||[];
  }catch(e){console.warn('[openBlockModal] ext fetch failed',e);}

  // rooms blocked by other overlapping retreats
  const conflictMap=new Map();
  AppData.bookings.forEach(other=>{
    if(other.id===bkId)return;
    if(!datesOverlap(bk.startDate,bk.endDate,other.startDate,other.endDate))return;
    (other.blockedRooms||[]).forEach(room=>{
      if(!conflictMap.has(room))conflictMap.set(room,other.leaderName||other.retreatName);
    });
  });
  // Also add external Cloudbeds reservations (walk-ins, OTAs, etc.)
  const _portalIds=new Set();
  AppData.bookings.forEach(bk2=>Object.values(bk2.cbReservationIds||{}).forEach(id=>{if(id)_portalIds.add(String(id));}));
  externalReservations.forEach(r=>{
    if(_portalIds.has(String(r.reservationID)))return;
    if(!datesOverlap(bk.startDate,bk.endDate,r.startDate,r.endDate))return;
    (r.rooms||[]).forEach(room=>{
      if(!conflictMap.has(room))conflictMap.set(room,`${r.guestName} (${r.sourceName||'Cloudbeds'})`);
      if(!conflictMap.has(room.toLowerCase()))conflictMap.set(room.toLowerCase(),conflictMap.get(room));
    });
  });

  const myBlocked=new Set(bk.blockedRooms||[]);
  // Virtual group rooms (rt8/rt9): expand "11" → individual beds "11a/b/c/d" in block display.
  // Guard: only expand rooms that are actual virtual-group parents (rt8/rt9) — prevents
  // pure-number rooms like "3" from being incorrectly removed when "3B" is also in the block.
  [...myBlocked].forEach(r=>{
    if(!/^\d+$/.test(r))return;
    const isVirtParent=AppData.roomTypes.some(rt=>VIRTUAL_GROUP_RT_IDS.has(rt.id)&&(rt.rooms||[]).includes(r));
    if(!isVirtParent)return;
    const childRe=new RegExp('^'+r+'[a-z]$','i');
    if([...myBlocked].some(s=>childRe.test(s))){myBlocked.delete(r);return;}
    const bedRt=AppData.roomTypes.find(rt=>BED_RT_IDS.has(rt.id)&&(rt.rooms||[]).some(s=>childRe.test(s)));
    if(bedRt){myBlocked.delete(r);(bedRt.rooms||[]).filter(s=>childRe.test(s)).forEach(s=>myBlocked.add(s));}
  });

  // Back-to-back predecessor on same row: pre-select their rooms for calendar continuity
  const predecessor=AppData.bookings.find(other=>
    other.id!==bkId&&other.row&&bk.row&&other.row===bk.row&&
    other.endDate===bk.startDate&&(other.blockedRooms||[]).length>0
  );
  const noRoomsYet=myBlocked.size===0;
  const rowAllowed=getRowAllowedRooms(bk.row);
  const slRooms=getStraightLineRooms(bk);
  const suggestedRooms=new Set(
    [...slRooms].filter(r=>!conflictMap.has(r)&&(!rowAllowed||rowAllowed.has(r))&&!myBlocked.has(r))
  );

  const body=document.getElementById('blockModalBody');
  body.innerHTML='';

  const totalRooms=AppData.roomTypes.filter(rt=>!DUPLICATE_ROOM_ENTRY_IDS.has(rt.id)).reduce((s,rt)=>s+rt.rooms.length,0);
  const takenByOthers=conflictMap.size;
  const occupiedCount=AppData.regs.filter(r=>r.bookingId===blockEditBkId&&(r.guests||[]).some(g=>g.name)).length;
  body.innerHTML+=`<div class="block-summary-bar"><b>${totalRooms}</b> total rooms &nbsp;·&nbsp; <b style="color:#dc2626">${takenByOthers}</b> blocked by other retreats &nbsp;·&nbsp; <b style="color:var(--teal)">${myBlocked.size}</b> currently assigned to this retreat${occupiedCount?` &nbsp;·&nbsp; <b style="color:#0e9494">${occupiedCount}</b> <span style="color:#0e9494">have registered guests (teal border)</span>`:''}
  </div>`;
  if(suggestedRooms.size>0){
    const predName=predecessor?(predecessor.leaderName||predecessor.retreatName):'prior retreat';
    const suggestAction=noRoomsYet?'uncheck any you don\'t need.':'check any you\'d like to add.';
    body.innerHTML+=`<div class="block-summary-bar" style="background:#fff1f1;border-color:#fca5a5;color:#991b1b;margin-top:-4px">
      <b style="color:#b91c1c">&#9632; Red = straight-line rooms</b>&nbsp; <b>${suggestedRooms.size}</b> rooms from <b>${predName}</b> (back-to-back on ${bk.row}) — ${suggestAction}
    </div>`;
  }

  const PROP_COLORS_BLK={'AMANSALA':'#e0f2fe','CASA SHANTI':'#e0f7fa','CASA GRANDE':'#fef3c7'};
  let blkLastProp=null;
  AppData.roomTypes.forEach(rt=>{
    if(VIRTUAL_GROUP_RT_IDS.has(rt.id))return; // Triple/Quad virtual parents — use individual beds (bd3/bd4) instead
    const prop=rt.property||'AMANSALA';
    if(prop!==blkLastProp){
      blkLastProp=prop;
      const ph=document.createElement('div');
      ph.style.cssText=`padding:8px 14px 5px;background:${PROP_COLORS_BLK[prop]||'#f5f5f5'};font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#374151;border-top:1px solid var(--border);margin-top:4px`;
      ph.textContent=prop;
      body.appendChild(ph);
    }
    const sec=document.createElement('div');sec.className='block-rt-section';
    sec.innerHTML=`<div class="block-rt-hdr">
      <div class="block-rt-dot" style="background:${rt.color}"></div>
      <span class="block-rt-name">${rt.name}</span>
      <span class="block-rt-count">(${(BED_RT_IDS.has(rt.id)?rt.rooms:buildUiRoomEntries(rt)).length} rooms)</span>
      <a class="block-sel-all" href="#" onclick="blockSelectAll('${rt.id}',event)">Select All</a>
    </div><div class="block-rooms-grid" id="blk-grid-${rt.id}"></div>`;
    body.appendChild(sec);

    const grid=document.getElementById('blk-grid-'+rt.id);

    // Sort rooms: guests first, then by building priority (numbered > Ch > GV > other)
    function roomBuildingPriority(r){
      if(/^[0-9]/.test(r)||/^[0-9A-Z][0-9A-Z]?B?$/.test(r))return 1; // numbered/main building
      if(/^Ch/i.test(r))return 2; // Chica
      if(/^GV/i.test(r))return 3; // Garden Villas
      return 4;
    }
    // Bed types (bd1/bd2/bd3/bd4): show individual beds in block editor so admin can block them independently
    const blkEntries=BED_RT_IDS.has(rt.id)
      ?rt.rooms.map(r=>({display:r,physical:[r],merged:false}))
      :buildUiRoomEntries(rt);
    const uiEntries=blkEntries.sort((a,b)=>{
      const aGuests=a.physical.some(p=>{const reg=AppData.regs.find(r=>r.bookingId===blockEditBkId&&r.room===p);return(reg?.guests||[]).filter(g=>g.name).length>0;});
      const bGuests=b.physical.some(p=>{const reg=AppData.regs.find(r=>r.bookingId===blockEditBkId&&r.room===p);return(reg?.guests||[]).filter(g=>g.name).length>0;});
      if(aGuests!==bGuests)return aGuests?-1:1;
      // Note: selected rooms are NOT bubbled to the top here — they're already highlighted
      // (blue border) inline, and pulling them out would split their building group in two.
      return a.display.localeCompare(b.display,undefined,{numeric:true});
    });

    let lastGroup=null;
    uiEntries.forEach(entry=>{
      const room=entry.display;
      const conflict=entry.physical.map(p=>conflictMap.get(p)).find(Boolean);
      const isOther=entry.physical.some(p=>conflictMap.has(p));
      const isSuggested=entry.physical.some(p=>suggestedRooms.has(p));
      const isChecked=entry.physical.some(p=>myBlocked.has(p))||(noRoomsYet&&isSuggested);
      const guestNames=[];
      entry.physical.forEach(p=>{
        const roomReg=AppData.regs.find(r=>r.bookingId===blockEditBkId&&r.room===p);
        (roomReg?.guests||[]).filter(g=>g.name).forEach(g=>guestNames.push(g.name+(entry.merged&&entry.physical.length>1?` (${p})`:'')));
      });
      const hasGuests=guestNames.length>0;
      const repPhysical=entry.physical[0];

      const grp=hasGuests?'booked':isOther?'other':roomBuildingPriority(repPhysical)===1?'main':roomBuildingPriority(repPhysical)===2?'chica':roomBuildingPriority(repPhysical)===3?'gv':'other2';
      if(grp!==lastGroup){
        lastGroup=grp;
        const divLabel={
          booked:`<span style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#0e9494;padding:8px 2px 3px;display:block">▶ Has Registered Guests — do not remove</span>`,
          main:`<span style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#374151;padding:8px 2px 3px;display:block">▶ Main Building (priority rooms)</span>`,
          chica:`<span style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#6b7280;padding:8px 2px 3px;display:block">▶ Chica — can release if needed</span>`,
          gv:`<span style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#6b7280;padding:8px 2px 3px;display:block">▶ Garden Villas — can release if needed</span>`,
          other:`<span style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#9ca3af;padding:8px 2px 3px;display:block">▶ Other retreats</span>`,
          other2:`<span style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#9ca3af;padding:8px 2px 3px;display:block">▶ Other rooms</span>`,
        }[grp]||'';
        if(divLabel){const dl=document.createElement('div');dl.style.cssText='width:100%;flex-basis:100%';dl.innerHTML=divLabel;grid.appendChild(dl);}
      }

      const item=document.createElement('label');
      item.className='block-room-item'+(isChecked?' br-checked':'')+(isOther?' br-other':'')+(isSuggested&&!isOther?' br-suggest':'')+(hasGuests?' br-has-guests':'');
      item.dataset.room=room;
      item.dataset.physical=JSON.stringify(entry.physical);
      item.dataset.hasGuests=hasGuests?'1':'';
      item.title=hasGuests?'Guests: '+guestNames.join(', '):(isOther?'Booked by: '+conflict:'')+(entry.merged?'\n(Cloudbeds: '+entry.physical.join(', ')+')':'');
      const lbl=entry.merged?`${room} <span style="font-size:9px;font-weight:600;color:#8a7e74">double</span>`:room;
      item.innerHTML=`<input type="checkbox"${isChecked?' checked':''}${isOther?' disabled':''} onchange="blockToggle(this)">`
        +`<span class="br-lbl">${lbl}</span>`
        +(hasGuests?`<span style="display:inline-flex;align-items:center;gap:2px;font-size:9px;font-weight:800;color:#0e9494;letter-spacing:.2px;margin-left:2px" title="${guestNames.join(', ')}"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${guestNames.length}</span><span onclick="clearBlockRoomGuests('${room.replace(/\\/g,'\\\\').replace(/'/g,'\\\'')}')" title="Remove ghost guest registrations" style="cursor:pointer;color:#9ca3af;font-size:11px;font-weight:900;margin-left:1px;line-height:1;padding:0 1px" onmouseenter="this.style.color='#dc2626'" onmouseleave="this.style.color='#9ca3af'">×</span>`:'')
        +(isOther?`<span style="font-size:9px;font-weight:800;color:#dc2626;letter-spacing:.3px;margin-left:2px" title="Booked by: ${conflict}">BOOKED</span>`:'')
        +(isSuggested&&!isOther?`<span style="font-size:9px;font-weight:800;color:#b91c1c;letter-spacing:.3px;margin-left:2px">↔</span>`:'');
      grid.appendChild(item);
    });
  });

  // Auto-Assign when Pax is set (works for new blocks and re-runs)
  const blockAutoBtn=document.getElementById('blockAutoBtn');
  if(blockAutoBtn){
    const hasPax=parseInt(bk.pax)>0;
    blockAutoBtn.style.display=hasPax?'inline-flex':'none';
    blockAutoBtn.title=noRoomsYet?'Auto-assign from pax preset + straight-line rooms':'Re-run auto-assign (keeps rooms with registered guests)';
  }

  blockUpdateCount();
  openModal('blockModal');
}

function blockSetChecked(cb,on,silent){
  const item=cb.closest('.block-room-item');if(!item)return false;
  if(!on&&item.dataset.hasGuests==='1'&&!silent){
    const physical=JSON.parse(item.dataset.physical||'[]');
    const names=physical.flatMap(room=>{
      const reg=AppData.regs.find(r=>r.bookingId===blockEditBkId&&r.room===room);
      return(reg?.guests||[]).filter(g=>g.name).map(g=>g.name);
    }).join(', ');
    const room=item.dataset.room;
    if(!confirm(`⚠ Room ${room} has a registered guest (${names||'unnamed'}).\n\nRemoving this room will NOT delete their registration — but it will hide them from the room grid.\n\nAre you sure you want to remove it from the block?`)){
      return false;
    }
  }
  cb.checked=on;
  on?item.classList.add('br-checked'):item.classList.remove('br-checked');
  blockUpdateCount();
  return true;
}

function blockAutoAssign(){
  const bk=AppData.bookings.find(b=>b.id===blockEditBkId);if(!bk)return;
  const pax=parseInt(bk.pax)||0;
  if(!pax){alert('Set the expected guest count (Pax) on this booking first — auto-assign uses the 15-guest base room mix (+ increments every 5 guests).');return;}
  const hadBlock=(bk.blockedRooms||[]).length>0;
  const{selected,beds,flags,slRooms}=computeAutoRoomBlock(bk);
  const guestRooms=[...new Set(AppData.regs.filter(r=>r.bookingId===blockEditBkId&&r.room&&(r.guests||[]).some(g=>g.name)).map(r=>r.room))];
  const merged=[...new Set([...selected,...guestRooms])];
  if(!merged.length){
    alert('No rooms could be auto-assigned — inventory may be full on these dates, or Pax/row may not match available rooms.');
    return;
  }
  if(hadBlock&&!confirm(`Apply auto-assign room block?\n\n${merged.length} rooms (${beds} guest beds in preset)\n${guestRooms.length?'Includes '+guestRooms.length+' room(s) with registered guests.\n':''}${slRooms.size?'Straight-line rooms prioritized.\n':''}${flags.length?'Note: '+flags.join('; '):''}\n\nThis replaces the current checkbox selection.`))return;
  document.querySelectorAll('#blockModalBody .block-room-item input:not(:disabled)').forEach(cb=>blockSetChecked(cb,false,true));
  const allItems=document.querySelectorAll('#blockModalBody .block-room-item');
  let applied=0;
  merged.forEach(room=>{
    const display=collapsePhysicalToDisplay(room);
    const item=[...allItems].find(el=>el.dataset.room===display);
    if(!item){
      // Virtual parent (rt8/rt9): expand to individual sub-room checkboxes
      _getSharedBeds(room).forEach(sub=>{
        const subItem=[...allItems].find(el=>el.dataset.room===sub);
        if(subItem){const cb=subItem.querySelector('input');if(cb&&!cb.disabled&&blockSetChecked(cb,true,true))applied++;}
      });
      return;
    }
    const cb=item.querySelector('input');
    if(cb&&!cb.disabled&&blockSetChecked(cb,true,true))applied++;
  });
  if(!applied){
    alert('Auto-assign computed rooms but none could be checked in the modal — they may be booked by another retreat on these dates.');
    return;
  }
  showToast(`Auto-assigned ${applied} room${applied!==1?'s':''} (${beds} guest beds · ${pax} pax).`);
}

function blockToggle(cb){
  const on=cb.checked;
  if(!blockSetChecked(cb,on,false))cb.checked=!on;
}

function blockSelectAll(rtId,e){
  e.preventDefault();
  const grid=document.getElementById('blk-grid-'+rtId);
  const cbs=Array.from(grid.querySelectorAll('input[type=checkbox]:not(:disabled)'));
  const allOn=cbs.every(c=>c.checked);
  cbs.forEach(cb=>{cb.checked=!allOn;blockToggle(cb);});
}

function clearBlockRoomGuests(displayRoom){
  const item=document.querySelector(`.block-room-item[data-room="${CSS.escape(displayRoom)}"]`);
  const physical=item?JSON.parse(item.dataset.physical||'[]'):[displayRoom];
  if(!confirm(`Remove guest registrations from room ${displayRoom}? This cannot be undone.`))return;
  AppData.regs=AppData.regs.filter(r=>!(r.bookingId===blockEditBkId&&physical.includes(r.room)));
  saveAll();
  openBlockModal(blockEditBkId);
}
function blockSave(){
  const bk=AppData.bookings.find(b=>b.id===blockEditBkId);
  if(!bk)return;
  const selected=Array.from(document.querySelectorAll('#blockModalBody .block-room-item input:checked'))
    .flatMap(cb=>{
      const item=cb.closest('.block-room-item');
      const physical=JSON.parse(item?.dataset.physical||'[]');
      return physical.length?physical:[item?.dataset.room].filter(Boolean);
    });

  // Hard validation: reject any room already blocked by an overlapping retreat or external Cloudbeds reservation
  const conflicts=[];
  AppData.bookings.forEach(other=>{
    if(other.id===bk.id)return;
    if(!datesOverlap(bk.startDate,bk.endDate,other.startDate,other.endDate))return;
    (other.blockedRooms||[]).forEach(room=>{
      if(selected.includes(room))conflicts.push(`Room ${room} → ${other.leaderName||other.retreatName}`);
    });
  });
  const _bsPortalIds=new Set();
  AppData.bookings.forEach(bk2=>Object.values(bk2.cbReservationIds||{}).forEach(id=>{if(id)_bsPortalIds.add(String(id));}));
  externalReservations.forEach(r=>{
    if(_bsPortalIds.has(String(r.reservationID)))return;
    if(!datesOverlap(bk.startDate,bk.endDate,r.startDate,r.endDate))return;
    (r.rooms||[]).forEach(room=>{
      if(selected.some(s=>s.toLowerCase()===room.toLowerCase()))
        conflicts.push(`Room ${room} → ${r.guestName} (${r.sourceName||'Cloudbeds'})`);
    });
  });
  if(conflicts.length){
    alert('Cannot save — the following rooms are already blocked by another retreat on overlapping dates:\n\n'+conflicts.join('\n'));
    return;
  }

  // Cancel Cloudbeds reservations for rooms removed from the block.
  // Use _blockModalOrigRooms (snapshot at modal-open time) not bk.blockedRooms —
  // Recover CB IDs may have added rooms to bk.blockedRooms while the modal was open;
  // those recovered rooms should never be treated as "removed" by the UI.
  const prevRooms=_blockModalOrigRooms.length?_blockModalOrigRooms:(bk.blockedRooms||[]);
  const removedRooms=prevRooms.filter(r=>!selected.includes(r));
  removedRooms.forEach(r=>{
    const rid=(bk.cbReservationIds||{})[r];
    if(rid){
      fetch(`${CLOUDBEDS_PROXY}?action=cancelReservation`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reservationId:rid})}).then(res=>res.json()).then(d=>console.log('[CB cancel room]',r,rid,JSON.stringify(d).slice(0,150))).catch(e=>console.warn('[CB cancel removed room]',e));
      delete bk.cbReservationIds[r];
      if(bk.cbGuestIds)delete bk.cbGuestIds[r];
      if(bk.cbAdjustmentIds)delete bk.cbAdjustmentIds[r];
    }
    // Delete the reg for this room so old guest names don't reappear if room is re-added
    const removedReg=AppData.regs.find(reg=>reg.bookingId===bk.id&&reg.room===r);
    if(removedReg){deletedRegIds.add(removedReg.id);AppData.regs=AppData.regs.filter(reg=>reg.id!==removedReg.id);}
  });

  bk.blockedRooms=selected;
  if(regSelBk&&regSelBk.id===bk.id)regSelBk=bk;
  saveAll();
  closeModal('blockModal');
  regRender();
  // Refresh dashboard pipeline so potential revenue reflects the new room count
  buildDashboard();
  showToast(`${bk.blockedRooms.length} rooms blocked for this retreat.`);
  pushReservationsToCloudbeds(bk).catch(e=>console.warn('[CB push]',e));
}

// Guest modal
function gToggleTeacher(){
  gIsTeacherRoom=!gIsTeacherRoom;
  const btn=document.getElementById('gTeacherBtn');
  if(btn){btn.style.background=gIsTeacherRoom?'#b45309':'#fff';btn.style.color=gIsTeacherRoom?'#fff':'#b45309';btn.textContent=gIsTeacherRoom?'✓ Teacher Room':'Teacher Room';}
}
function gOpenAddExtraGuest(room,rtId){gExtraGuestMode=true;gOpenEdit(room,rtId);}
function gOpenAdd(room,rtId){
  if(IS_TEACHER_MODE&&regSelBk?.allLocked){showToast('El retiro está bloqueado por el admin.');return;}
  gEditRegId=null;
  gEditRoom=regSelBk?resolvePhysicalRoomForGuest(regSelBk.id,room,rtId):room;
  gEditRtId=rtId;
  const rt=AppData.roomTypes.find(t=>t.id===rtId);
  const ui=rt?buildUiRoomEntries(rt).find(e=>e.display===room||e.physical.includes(room)):null;
  const disp=ui?ui.display:room;
  document.getElementById('gModalTitle').textContent='Add Guest';
  document.getElementById('gModalSub').textContent=`${disp}${ui?.merged?' ('+gEditRoom+')':''} · ${rt?rt.name:''}`;
  document.getElementById('gDelBtn').style.display='none';
  for(let i=0;i<4;i++)['name','email','phone','note'].forEach(f=>{const el=document.getElementById(`g${i}-${f}`);if(el)el.value='';});
  document.getElementById('gm-override').value='';document.getElementById('gm-paid').value='0';document.getElementById('gm-notes').value='';
  const _pkgPriceEl=document.getElementById('gm-pkg-price');if(_pkgPriceEl)_pkgPriceEl.value='';
  const _rateEl=document.getElementById('gm-rate-override');if(_rateEl){_rateEl.value='';_rateEl.style.display=IS_TEACHER_MODE?'none':'inline-block';}
  const _datesRowA=document.getElementById('gm-dates-row');if(_datesRowA)_datesRowA.style.display='none';
  const _ciElA=document.getElementById('gm-checkin');if(_ciElA)_ciElA.value='';
  const _coElA=document.getElementById('gm-checkout');if(_coElA)_coElA.value='';
  gIsTeacherRoom=false;
  const _tBtn=document.getElementById('gTeacherBtn');if(_tBtn){_tBtn.style.display=IS_TEACHER_MODE?'none':'inline-flex';_tBtn.style.background='#fff';_tBtn.style.color='#b45309';_tBtn.textContent='Teacher Room';}
  gSetupTabs(rt);gSwitchTab(0);gUpdatePrice();openModal('guestModal');
}
function gOpenEdit(room,rtId){
  if(IS_TEACHER_MODE&&regSelBk?.allLocked){showToast('El retiro está bloqueado por el admin.');return;}
  const reg=getRegForRoom(regSelBk.id,room);if(!reg)return gOpenAdd(room,rtId);
  gEditRegId=reg.id;gEditRoom=room;gEditRtId=rtId;
  const rt=AppData.roomTypes.find(t=>t.id===rtId);
  document.getElementById('gModalTitle').textContent='Edit Guest';
  document.getElementById('gModalSub').textContent=`${room} · ${rt?rt.name:''}`;
  document.getElementById('gDelBtn').style.display='inline-flex';
  for(let i=0;i<4;i++){const g=reg.guests?.[i]||{};['name','email','phone','note'].forEach(f=>{const el=document.getElementById(`g${i}-${f}`);if(el)el.value=f==='note'?(g.notes||''):(g[f]||'');});}
  document.getElementById('gm-override').value=reg.customPrice!=null?reg.customPrice:'';
  document.getElementById('gm-paid').value=reg.amountPaid||'';
  document.getElementById('gm-notes').value=reg.notes||'';
  const _pkgPriceElE=document.getElementById('gm-pkg-price');if(_pkgPriceElE)_pkgPriceElE.value=reg.customPkgPrice!=null?reg.customPkgPrice:'';
  const _rateElE=document.getElementById('gm-rate-override');if(_rateElE){_rateElE.value=reg.customRateOverride!=null?reg.customRateOverride:'';_rateElE.style.display=IS_TEACHER_MODE?'none':'inline-block';}
  const _datesRowE=document.getElementById('gm-dates-row');
  const _ciElE=document.getElementById('gm-checkin');const _coElE=document.getElementById('gm-checkout');
  if(_ciElE)_ciElE.value=reg.checkIn||regSelBk?.startDate||'';
  if(_coElE)_coElE.value=reg.checkOut||regSelBk?.endDate||'';
  if(_datesRowE)_datesRowE.style.display=IS_TEACHER_MODE?'none':'flex';
  gIsTeacherRoom=!!reg.isTeacherRoom;
  const _tBtnE=document.getElementById('gTeacherBtn');if(_tBtnE){_tBtnE.style.display=IS_TEACHER_MODE?'none':'inline-flex';_tBtnE.style.background=gIsTeacherRoom?'#b45309':'#fff';_tBtnE.style.color=gIsTeacherRoom?'#fff':'#b45309';_tBtnE.textContent=gIsTeacherRoom?'✓ Teacher Room':'Teacher Room';}
  const last=(reg.guests||[]).reduce((a,g,i)=>g.name?i:a,-1);
  gSetupTabs(rt);gSwitchTab(Math.max(0,last));gUpdatePrice();openModal('guestModal');
}
function gSetupTabs(rt){
  const maxOcc=gExtraGuestMode?2:(rt?rt.maxOcc:1);
  const tabsEl=document.getElementById('gTabs');
  if(maxOcc>=2){tabsEl.style.display='flex';[0,1,2,3].forEach(i=>{const t=document.getElementById('gtab'+i);if(t)t.style.display=i<maxOcc?'':'none';});}
  else tabsEl.style.display='none';
  [0,1,2,3].forEach(i=>{const p=document.getElementById('gp'+i);if(p)p.style.display='none';});
  document.getElementById('gp0').style.display='block';
}
function gSwitchTab(idx){
  gCurTab=idx;
  const rt=AppData.roomTypes.find(t=>t.id===gEditRtId);
  const maxOcc=gExtraGuestMode?2:(rt?rt.maxOcc:1);
  for(let i=0;i<maxOcc;i++){document.getElementById('gtab'+i)?.classList.toggle('active',i===idx);document.getElementById('gp'+i).style.display=i===idx?'block':'none';}
  gUpdatePrice();
}
function gCountGuests(){let n=0;for(let i=0;i<4;i++){const el=document.getElementById('g'+i+'-name');if(el&&el.value.trim())n=i+1;}return Math.max(1,n);}
function gUpdatePrice(){
  const rt=AppData.roomTypes.find(t=>t.id===gEditRtId);if(!rt)return;
  const _ciV=(document.getElementById('gm-checkin')?.value||'').trim();
  const _coV=(document.getElementById('gm-checkout')?.value||'').trim();
  const _effStart=_ciV||regSelBk?.startDate||'';
  const _effEnd=_coV||regSelBk?.endDate||'';
  const nights=(_effStart&&_effEnd)?Math.max(1,Math.round((pd(_effEnd)-pd(_effStart))/DAY_MS)):(regSelBk?getNights(regSelBk):1);
  const gc=gCountGuests();
  const bd=calcBD(rt,gc,nights,_effStart,regSelBk);
  const ov=document.getElementById('gm-override').value;
  const _rateOvRaw=document.getElementById('gm-rate-override')?.value;
  const _rateOvParsed=(_rateOvRaw!=null&&_rateOvRaw!=='')?parseFloat(_rateOvRaw):NaN;
  const _rateOv=!isNaN(_rateOvParsed)?_rateOvParsed:null;
  const _effRate=_rateOv!==null?_rateOv:bd.rate;
  const _effBase=+(_effRate*gc*nights).toFixed(2);
  const _pkgOvRaw=document.getElementById('gm-pkg-price')?.value;
  const _pkgOvParsed=(_pkgOvRaw!=null&&_pkgOvRaw!=='')?parseFloat(_pkgOvRaw):NaN;
  const _pkgOv=!isNaN(_pkgOvParsed)?_pkgOvParsed:null;
  const _effPkg=_pkgOv!==null?_pkgOv:bd.pkg;
  const _pkgTr=getBkTaxRate(regSelBk);
  const _adjTax=+(_effBase*0.16+_effPkg*_pkgTr).toFixed(2);
  const _adjTotal=+(_effBase+_effPkg+_adjTax+bd.dip).toFixed(2);
  const final=ov!==''?parseFloat(ov)||0:_adjTotal;
  const paid=parseFloat(document.getElementById('gm-paid').value)||0;
  const bal=final-paid;
  const season=isLowSeason(_effStart)?'Low Season (May – Sep)':'High Season (Oct – Apr)';
  const _gtr=getBkTaxRate(regSelBk);
  document.getElementById('pbSeasonLbl').textContent=`Pricing — ${season} · +16% room tax · +$30/night tip`;
  document.getElementById('pbc-type').textContent=`${rt.name} · ${gc} guest${gc>1?'s':''} · ${nights} night${nights!==1?'s':''}`;
  document.getElementById('pbc-rate').textContent=_rateOv!==null?`${fmt$(bd.rate)} →`:`${fmt$(bd.rate)}/person/night`;
  document.getElementById('pbc-base').textContent=fmt$(_effBase);
  const pkgEl=document.getElementById('pbc-pkg-row');
  const pkgOvEl=document.getElementById('gm-pkg-price');
  const pkgOv=pkgOvEl&&pkgOvEl.value!==''?parseFloat(pkgOvEl.value)||0:null;
  if(pkgEl){const pkgs=calcPkgItems(regSelBk);if(pkgs.length){pkgEl.style.display='';document.getElementById('pbc-pkg-lbl').textContent=`Packages (${pkgs.map(p=>p.name).join(', ')}) ×${gc}`;document.getElementById('pbc-pkg').textContent=pkgOv!==null?`${fmt$(bd.pkg)} →`:`${fmt$(bd.pkg)}`;}else{pkgEl.style.display='none';}}
  document.getElementById('pbc-tax-lbl').textContent=`Tax (${_effPkg>0&&_pkgTr!==0.16?`16% rm / ${_pkgTr===0?'0%':Math.round(_pkgTr*100)+'%'} ext`:'16%'})`;
  document.getElementById('pbc-tax').textContent=fmt$(_adjTax);
  document.getElementById('pbc-dip-lbl').textContent=`Tip fee ($${getTip(regSelBk)}×${gc} guest${gc>1?'s':''}×${nights} night${nights!==1?'s':''})`;
  document.getElementById('pbc-dip').textContent=fmt$(bd.dip);
  document.getElementById('pbc-total').textContent=fmt$(final);
  const balEl=document.getElementById('gm-balance');balEl.value=fmt$(bal);balEl.style.color=bal>0?'#dc2626':'#059669';
}
function gSave(){
  const name=document.getElementById('g0-name').value.trim();if(!name){alert('Enter guest name.');return;}
  const ov=document.getElementById('gm-override').value;
  const customPrice=ov!==''?parseFloat(ov)||null:null;
  const amountPaid=parseFloat(document.getElementById('gm-paid').value)||0;
  const notes=document.getElementById('gm-notes').value.trim();
  const _pkgPriceVal=document.getElementById('gm-pkg-price')?.value;
  const _pkgPriceSaved=(_pkgPriceVal!=null&&_pkgPriceVal!=='')?parseFloat(_pkgPriceVal):NaN;
  const customPkgPrice=!isNaN(_pkgPriceSaved)?_pkgPriceSaved:null;
  const _rateOvVal=document.getElementById('gm-rate-override')?.value;
  const _rateOvSaved=(_rateOvVal!=null&&_rateOvVal!=='')?parseFloat(_rateOvVal):NaN;
  const customRateOverride=!isNaN(_rateOvSaved)?_rateOvSaved:null;
  const checkIn=(document.getElementById('gm-checkin')?.value||'').trim()||null;
  const checkOut=(document.getElementById('gm-checkout')?.value||'').trim()||null;
  const guests=[];for(let i=0;i<4;i++){const n=(document.getElementById('g'+i+'-name')?.value||'').trim();if(n||i===0)guests.push({name:n,email:(document.getElementById('g'+i+'-email')?.value||'').trim(),phone:(document.getElementById('g'+i+'-phone')?.value||'').trim(),notes:(document.getElementById('g'+i+'-note')?.value||'').trim()});}
  const _regTs=new Date().toISOString();
  if(gEditRegId){const reg=AppData.regs.find(r=>r.id===gEditRegId);Object.assign(reg,{guests,customPrice,customPkgPrice,customRateOverride,amountPaid,notes,isTeacherRoom:gIsTeacherRoom||undefined,checkIn:checkIn||undefined,checkOut:checkOut||undefined,updatedAt:_regTs});}
  else{
    // Check room not already assigned in this booking
    if(!gEditRegId){
      const taken=AppData.regs.find(r=>r.bookingId===regSelBk.id&&r.room===gEditRoom&&!r.isTeacherRoom);
      if(taken){
        const g=(taken.guests||[]).find(x=>x.name);
        alert(`Room ${gEditRoom} is already assigned to ${g?.name||'another guest'}. Please choose a different room.`);
        return;
      }
    }
    AppData.regs.push({id:uid(),bookingId:regSelBk.id,room:gEditRoom,roomTypeId:gEditRtId,guests,customPrice,customPkgPrice,customRateOverride,amountPaid,notes,isTeacherRoom:gIsTeacherRoom||undefined,updatedAt:_regTs});
  }
  gExtraGuestMode=false;saveAll();closeModal('guestModal');regRender();showToast(gEditRegId?'Updated.':'Guest added.');
  // Update Cloudbeds reservation guest name and adult count
  const _cbResId=regSelBk&&regSelBk.cbReservationIds&&regSelBk.cbReservationIds[gEditRoom];
  if(_cbResId&&guests[0]&&guests[0].name){
    {
      const _rt=AppData.roomTypes.find(t=>(t.rooms||[]).includes(gEditRoom||''));
      const _low=cbIsLowSeason(regSelBk.startDate||'');
      const _names=guests.filter(g=>g.name).map(g=>g.name.trim());
      const _guestName=_names.join(' & ');
      const _adultCount=Math.max(1,_names.length);
      const _prevAdjId=(regSelBk.cbAdjustmentIds||{})[gEditRoom]||null;
      const _prevNoteId=(regSelBk.cbNoteIds||{})[gEditRoom]||null;
      const _cbGuestId=(regSelBk.cbGuestIds||{})[gEditRoom]||null;
      const _guestNoteLines=guests.filter(g=>g.name&&g.notes).map(g=>`${g.name}: ${g.notes}`);
      const _allNotes=[notes,..._guestNoteLines].filter(Boolean).join('\n');
      console.log('[CB updateGuest] resId='+_cbResId+' guestId='+_cbGuestId+' name='+_guestName);
      fetch(`${CLOUDBEDS_PROXY}?action=updateReservationGuest`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({reservationId:_cbResId,guestId:_cbGuestId,roomName:gEditRoom||'',startDate:checkIn||regSelBk.startDate||'',endDate:checkOut||regSelBk.endDate||'',guestFirstName:_guestName,groupName:regSelBk.retreatName||regSelBk.row||'',leaderName:regSelBk.leaderName||'',adults:_adultCount,dailyRate:0,adjustmentId:_prevAdjId,notes:_allNotes,noteId:_prevNoteId})
      }).then(r=>r.json()).then(d=>{
        console.log('[CB updateGuest result]',JSON.stringify(d).slice(0,300));
        if(d.reservationId){regSelBk.cbReservationIds[gEditRoom]=d.reservationId;if(d.guestId){if(!regSelBk.cbGuestIds)regSelBk.cbGuestIds={};regSelBk.cbGuestIds[gEditRoom]=d.guestId;}if(!regSelBk.cbAdjustmentIds)regSelBk.cbAdjustmentIds={};regSelBk.cbAdjustmentIds[gEditRoom]=d.adjustmentId||null;if(!regSelBk.cbNoteIds)regSelBk.cbNoteIds={};if(d.noteId)regSelBk.cbNoteIds[gEditRoom]=d.noteId;else if(d.noteDeleted)regSelBk.cbNoteIds[gEditRoom]=null;saveAll();}
      }).catch(e=>console.warn('[CB updateGuest]',e));
    }
  }
}
function gDelete(){
  if(!gEditRegId||!confirm('Remove guest?'))return;
  const reg=AppData.regs.find(r=>r.id===gEditRegId);
  const namedGuests=(reg?.guests||[]).filter(g=>g.name);

  // If the room has more than 1 named guest, only remove the active tab's guest and keep the reg
  if(reg&&namedGuests.length>1){
    const rmIdx=gCurTab;
    if(reg.guests[rmIdx])reg.guests[rmIdx]={name:'',email:'',phone:'',notes:''};
    // Compact: keep only named guests (re-index from 0) so price recalculates correctly
    const kept=reg.guests.filter(g=>g.name);
    reg.guests=kept.length?kept:[{name:'',email:'',phone:'',notes:''}];
    saveAll();closeModal('guestModal');regRender();showToast('Removed.');
    // Sync updated guest list to Cloudbeds
    const _cbResId=(regSelBk?.cbReservationIds||{})[gEditRoom];
    if(_cbResId&&reg.guests[0]?.name){
      const _names=reg.guests.filter(g=>g.name).map(g=>g.name);
      const _prevAdjId=(regSelBk.cbAdjustmentIds||{})[gEditRoom]||null;
      fetch(`${CLOUDBEDS_PROXY}?action=updateReservationGuest`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({reservationId:_cbResId,roomName:gEditRoom||'',startDate:regSelBk.startDate||'',endDate:regSelBk.endDate||'',guestFirstName:_names.join(' & '),groupName:regSelBk.retreatName||regSelBk.row||'',leaderName:regSelBk.leaderName||'',adults:_names.length,adjustmentId:_prevAdjId,isGuestRemoval:true})
      }).then(r=>r.json()).then(d=>{
        if(!regSelBk.cbAdjustmentIds)regSelBk.cbAdjustmentIds={};
        regSelBk.cbAdjustmentIds[gEditRoom]=d.adjustmentId||null;saveAll();
      }).catch(e=>console.warn('[CB update after partial remove]',e));
    }
    return;
  }

  // Only 1 (or 0) named guest — delete the whole reg and reset Cloudbeds to group name
  if(regSelBk){
    const _rid=(regSelBk.cbReservationIds||{})[gEditRoom];
    if(_rid){
      {
        const _prevAdjIdDel=(regSelBk.cbAdjustmentIds||{})[gEditRoom]||null;
        fetch(`${CLOUDBEDS_PROXY}?action=updateReservationGuest`,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({reservationId:_rid,roomName:gEditRoom||'',startDate:regSelBk.startDate||'',endDate:regSelBk.endDate||'',guestFirstName:'',groupName:regSelBk.retreatName||regSelBk.row||'',leaderName:regSelBk.leaderName||'',adults:1,adjustmentId:_prevAdjIdDel,isGuestRemoval:true})
        }).then(r=>r.json()).then(d=>{
          if(d.guestId){if(!regSelBk.cbGuestIds)regSelBk.cbGuestIds={};regSelBk.cbGuestIds[gEditRoom]=d.guestId;}if(!regSelBk.cbAdjustmentIds)regSelBk.cbAdjustmentIds={};regSelBk.cbAdjustmentIds[gEditRoom]=null;saveAll();
        }).catch(e=>console.warn('[CB reset guest]',e));
      }
    }
  }
  deletedRegIds.add(gEditRegId);
  AppData.regs=AppData.regs.filter(r=>r.id!==gEditRegId);saveAll();closeModal('guestModal');regRender();showToast('Removed.');
}

// Settings
