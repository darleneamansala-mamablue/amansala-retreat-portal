// ===== import-export.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== CSV IMPORT =====
function openCsvImportModal(){
  const sel=document.getElementById('csvRetreatSel');
  if(sel){
    while(sel.options.length>2)sel.remove(2);
    AppData.bookings.filter(b=>b.status!=='cancelled').sort((a,b)=>a.startDate.localeCompare(b.startDate)).forEach(b=>{
      const o=document.createElement('option');
      o.value=b.id;
      o.textContent=`${b.leaderName||b.retreatName} · ${fmtDate(b.startDate)} – ${fmtDate(b.endDate)}`;
      sel.appendChild(o);
    });
    if(regSelBk)sel.value=regSelBk.id;
    else sel.value='__new__';
    csvOnRetreatSel();
  }
  const vr=document.getElementById('csvVenRow');
  if(vr){vr.innerHTML='';AppData.venRows.forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent=r;vr.appendChild(o);});}
  document.getElementById('csvFileName').textContent='No file chosen';
  document.getElementById('csvImportInfo').style.display='none';
  document.getElementById('csvImportWarn').style.display='none';
  document.getElementById('csvPreviewWrap').style.display='none';
  document.getElementById('csvImportConfirmBtn').style.display='none';
  const ow=document.getElementById('csvOverwrite');if(ow)ow.checked=false;
  csvImportRows=[];_csvPreviewBk=null;
  openModal('csvImportModal');
}
function csvOnRetreatSel(){
  const val=document.getElementById('csvRetreatSel')?.value;
  const form=document.getElementById('csvNewRetreatForm');
  if(!form)return;
  form.style.display=val==='__new__'?'block':'none';
}
const LODGING_MAP={
  'deluxe beach':'rt1','deluxe beachfront king':'rt1',
  'superior king':'rt2',
  'garden king plus':'rt3','garden plus king':'rt3','garden plus':'rt3',
  'garden king':'rt4',
  'garden basic queen private':'rt5','garden basic':'rt5',
  'bed in a double beachview room':'rt6','double beachview':'rt6',
  'bed in a double room':'rt7','double room':'rt7','bed in a double room 2025':'rt7',
  'bed in a double beachview room 2025':'rt6',
  'bed in a garden triple room':'rt8','triple':'rt8',
  'quad room':'rt9','quad':'rt9','bed in a quad room':'rt9',
  'shanti king':'csh1',
  'shanti 2 queens':'csh2','shanti 2 queen':'csh2','shanti 2 bed':'csh2','shanti 2 beds':'csh2',
  'casa king downstairs':'cg1','casa grande king private':'cg1',
  'casa grande bedroom':'cg2','casa grande up king for 2':'cg2',
  'casa 2 queens':'cg3','casa grande queen for 2':'cg3',
  'casa individual bed':'cg4','casa grande upstairs individual bed':'cg4','casa grande - upstairs individual bed':'cg4',
  'casa small queen':'cg5','casa grande shared bathroom':'cg5','casa grande (shared bathroom)':'cg5',
};
let csvImportRows=[];
let _csvPreviewBk=null;
function _findCanonicalRoom(roomStr){
  if(!roomStr)return null;
  const norm=roomStr.trim().toLowerCase();
  // "Quad Room - 14" → "14"
  const stripped=norm.replace(/^[a-z\s]+[-–]\s*/,'').trim();
  // "A33", "B30", "F23" → "33", "30", "23" (single letter before digits, e.g. Retreat Guru naming)
  const digitStrip=norm.replace(/^[a-z](\d+.*)$/,'$1');
  // Exact case-sensitive match first — prevents "13b" (bd2) from matching "13B" (rt2)
  for(const rt of AppData.roomTypes){for(const r of(rt.rooms||[])){if(r.trim()===roomStr.trim())return r;}}
  for(const rt of AppData.roomTypes){for(const r of(rt.rooms||[])){const rn=r.trim().toLowerCase();if(rn===norm||rn===stripped||rn===digitStrip)return r;}}
  // RG uses the shared room base number (e.g. "5") while portal has beds "5a"/"5b" — try appending "a"
  for(const rt of AppData.roomTypes){for(const r of(rt.rooms||[])){const rn=r.trim().toLowerCase();if(rn===norm+'a'||rn===stripped+'a')return r;}}
  // Strip trailing letter suffix: "9n"→"9", "10n"→"10", "3A"→"3" (RG sometimes appends letter suffixes)
  const trailStrip=norm.replace(/[a-z]+$/,'');
  if(trailStrip&&trailStrip!==norm){for(const rt of AppData.roomTypes){for(const r of(rt.rooms||[])){if(r.trim().toLowerCase()===trailStrip)return r;}}}
  // CG/C4 descriptive names from RG paste ("Casa 2 queens", "Small Queen a", "Individual Bed | Private Bathroom", etc.)
  const cgPortal=CG_RG_ROOM_MAP[norm];if(cgPortal)return cgPortal;
  const c4Entry=C4_RG_ROOM_MAP[norm];if(c4Entry?.room)return c4Entry.room;
  return null;
}
// Returns all partner beds for a shared room (double/triple/quad), excluding canonRoom itself.
// Only expands BED room types (bd1/bd2/bd3/bd4); single-occupancy rooms ending in B (e.g. "5B","13B") return [].
function _getSharedBeds(canonRoom){
  const PARENT_TO_BED={'rt6':'bd1','rt7':'bd2','rt8':'bd3','rt9':'bd4'};
  // Fixed bed count per type — drives expansion regardless of what's in localStorage
  const BED_COUNT={'bd1':2,'bd2':2,'bd3':3,'bd4':4};
  const SUFFIXES=['a','b','c','d'];
  function _mergedRt(id){
    const s=AppData.roomTypes.find(rt=>rt.id===id),d=DEF_ROOM_TYPES.find(rt=>rt.id===id);
    return{...(s||d||{}),id,rooms:[...new Set([...((s&&s.rooms)||[]),...((d&&d.rooms)||[])])]};
  }
  // Generate all bed names for a given base + type, using naming format from existing rooms
  function _expandBase(bedTypeId,base,excludeRoom){
    const suf=SUFFIXES.slice(0,BED_COUNT[bedTypeId]||2);
    const merged=_mergedRt(bedTypeId);
    const existing=merged.rooms.filter(r=>{const sp=splitDoubleHalf(r);return sp&&sp.base.toLowerCase()===base.toLowerCase();});
    const usesDash=existing.some(r=>/-[a-d]$/i.test(r));
    return suf.map(s=>usesDash?base+'-'+s:base+s).filter(r=>r!==excludeRoom);
  }
  // Case 1: input is already a bed room — generate all siblings from BED_COUNT
  const canonRt=[...BED_RT_IDS].map(_mergedRt).find(rt=>rt.rooms.some(r=>r===canonRoom));
  if(canonRt){const sp=splitDoubleHalf(canonRoom);if(!sp)return[];return _expandBase(canonRt.id,sp.base,canonRoom);}
  // Case 2: input is a parent room (rt6/rt7/rt8/rt9) — generate all beds in the paired bed type
  const parentRt=Object.keys(PARENT_TO_BED).map(_mergedRt).find(rt=>rt.rooms.some(r=>r===canonRoom));
  if(!parentRt)return[];
  return _expandBase(PARENT_TO_BED[parentRt.id],canonRoom,null).filter(r=>r!==canonRoom);
}
function _csvParseLine(line){
  const r=[];let cur='';let inQ=false;
  for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){inQ=!inQ;}else if(ch===','&&!inQ){r.push(cur.trim());cur='';}else{cur+=ch;}}
  r.push(cur.trim());return r;
}
function _csvParseStayDates(str){
  const mo={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  let m=str.match(/(\w+)\s+(\d+)\s*[-–]\s*(\d+),?\s*(\d{4})/);
  if(m){const y=parseInt(m[4]);return{start:fmtISO(new Date(y,mo[m[1]],parseInt(m[2]))),end:fmtISO(new Date(y,mo[m[1]],parseInt(m[3])))};}
  m=str.match(/(\w+)\s+(\d+)\s*[-–]\s*(\w+)\s+(\d+),?\s*(\d{4})/);
  if(m){const y=parseInt(m[5]);return{start:fmtISO(new Date(y,mo[m[1]],parseInt(m[2]))),end:fmtISO(new Date(y,mo[m[3]],parseInt(m[4])))};}
  return null;
}
function _csvMapLodging(raw){
  const clean=raw.replace(/^[\s\(\)]*[Yy][\s\(\)Nn]*\s*/,'').trim().toLowerCase().replace(/\s+/g,' ');
  if(LODGING_MAP[clean])return LODGING_MAP[clean];
  for(const[k,v]of Object.entries(LODGING_MAP)){if(clean.includes(k)||k.includes(clean))return v;}
  return null;
}
function _renderCsvPreview(rows,bkForPreview){
  const overwrite=document.getElementById('csvOverwrite')?.checked;
  const warns=rows.filter(r=>r.warn||(r.existingReg&&!overwrite));
  const warnEl=document.getElementById('csvImportWarn');
  if(warns.length){warnEl.style.display='block';warnEl.innerHTML=warns.map(r=>(r.existingReg&&!overwrite)?`⚠️ Room <b>${r.room}</b> already imported — will skip (check "Overwrite" to replace)`:`⚠️ Could not map lodging type: "<b>${r.lodgeRaw}</b>" for ${r.name||'guest'} — will skip`).join('<br>');}else{warnEl.style.display='none';}
  const infoEl=document.getElementById('csvImportInfo');
  infoEl.style.display='block';
  const bkLabel=bkForPreview?`<b>${bkForPreview.leaderName||bkForPreview.retreatName}</b> &nbsp;·&nbsp; ${fmtDate(bkForPreview.startDate)} – ${fmtDate(bkForPreview.endDate)}`:'<b>New Retreat</b>';
  infoEl.innerHTML=`Importing into: ${bkLabel} &nbsp;·&nbsp; <b>${rows.length} row${rows.length!==1?'s':''} found</b>`;
  document.getElementById('csvImportBody').innerHTML=rows.map(r=>{
    const willSkip=r.warn||(r.existingReg&&!overwrite);
    const isOverwriting=r.existingReg&&overwrite;
    const bg=r.warn?'#fffbeb':isOverwriting?'#eff6ff':(r.existingReg&&!overwrite)?'#f9fafb':'';
    const status=r.warn?'<span style="color:#b45309;font-size:11px">⚠ Unknown type</span>':(r.existingReg&&!overwrite)?'<span style="color:#9ca3af;font-size:11px">Skip (taken)</span>':isOverwriting?'<span style="color:#2563eb;font-size:11px">↺ Overwrite</span>':!r.name?'<span style="color:#6b7280;font-size:11px">Block only</span>':'<span style="color:#15803d;font-size:11px">✓ Ready</span>';
    return`<tr style="border-bottom:1px solid var(--border);background:${bg};opacity:${willSkip?.6:1}"><td style="padding:7px 12px">${r.name||'—'}</td><td style="padding:7px 12px;white-space:nowrap;font-size:11.5px">${r.dates?fmtDate(r.dates.start)+' – '+fmtDate(r.dates.end):r.stayNights+' nights'}</td><td style="padding:7px 12px">${r.rtName||'<span style="color:#b45309">—</span>'}</td><td style="padding:7px 12px">${r.room||'—'}</td><td style="padding:7px 12px;text-align:center">${r.guestCount}</td><td style="padding:7px 12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;color:var(--muted)">${r.notes||'—'}</td><td style="padding:7px 12px;text-align:right;font-weight:600">${r.price!=null?fmt$(r.price):'—'}</td><td style="padding:7px 12px">${status}</td></tr>`;
  }).join('');
  const importable=rows.filter(r=>!r.warn&&r.rtId&&(!r.existingReg||overwrite)).length;
  const confirmBtn=document.getElementById('csvImportConfirmBtn');
  confirmBtn.textContent=`Import ${importable} Registration${importable!==1?'s':''}`;
  confirmBtn.style.display='inline-flex';
  document.getElementById('csvPreviewWrap').style.display='block';
}
function parseCsvImport(input){
  const file=input.files[0];if(!file)return;
  document.getElementById('csvFileName').textContent=file.name;
  const reader=new FileReader();
  reader.onload=ev=>{
    const selVal=document.getElementById('csvRetreatSel')?.value||'';
    let bkForPreview=null;
    if(selVal&&selVal!=='__new__')bkForPreview=AppData.bookings.find(b=>b.id===selVal)||regSelBk;
    else bkForPreview=regSelBk;
    const lines=ev.target.result.trim().split(/\r?\n/);
    if(lines.length<2){showToast('CSV appears empty.');return;}
    const headers=_csvParseLine(lines[0]);
    const fc=names=>headers.findIndex(h=>names.some(n=>h.toLowerCase().includes(n)));
    const iName=fc(['name']);
    const iDates=fc(['stay date','dates']);
    const iLodge=fc(['lodging','room type','lodge']);
    const iRoom=fc(['room']);
    const iNotes=fc(['registration note','notes','note']);
    const iCount=fc(['how many','people','count','guests','pax']);
    const nights=bkForPreview?getNights(bkForPreview):7;
    const rows=[];
    let autoStart=null,autoEnd=null;
    for(let i=1;i<lines.length;i++){
      const v=_csvParseLine(lines[i]);
      if(!v.length||v.every(c=>!c))continue;
      const name=(iName>=0?v[iName]:'').trim();
      const lodgeRaw=(iLodge>=0?v[iLodge]:'').trim();
      const roomRaw=(iRoom>=0?v[iRoom]:'').trim();
      const room=_findCanonicalRoom(roomRaw)||roomRaw;
      const notes=(iNotes>=0?v[iNotes]:'').trim();
      const guestCount=parseInt(iCount>=0?v[iCount]:'1')||1;
      const datesStr=(iDates>=0?v[iDates]:'').trim();
      const dates=_csvParseStayDates(datesStr);
      if(dates){if(!autoStart||dates.start<autoStart)autoStart=dates.start;if(!autoEnd||dates.end>autoEnd)autoEnd=dates.end;}
      const rtId=_csvMapLodging(lodgeRaw);
      let rt=AppData.roomTypes.find(r=>r.id===rtId);
      let finalRtId=rtId;
      if(!rt&&room){const rtFromRoom=AppData.roomTypes.find(r=>(r.rooms||[]).some(x=>x===room))||AppData.roomTypes.find(r=>(r.rooms||[]).some(x=>x.toLowerCase()===room.toLowerCase()));if(rtFromRoom){rt=rtFromRoom;finalRtId=rtFromRoom.id;}}
      const stayNights=dates?Math.max(1,Math.round((pd(dates.end)-pd(dates.start))/DAY_MS)):nights;
      const refBk=bkForPreview||{startDate:dates?.start||'',endDate:dates?.end||''};
      const roomTotal=(rt&&name)?calcPrice(rt,guestCount,stayNights,dates?.start||refBk.startDate,refBk):null;
      const price=roomTotal!=null?+(roomTotal/guestCount).toFixed(2):null;
      const existingReg=bkForPreview?AppData.regs.find(r=>r.bookingId===bkForPreview.id&&r.room.toLowerCase()===room.toLowerCase()):null;
      rows.push({name,lodgeRaw,rtId:finalRtId,rtName:rt?.name||'',room,notes,guestCount,price,stayNights,dates,existingReg,warn:!rt&&!name?false:!rt});
    }
    if(selVal==='__new__'&&autoStart){
      const sd=document.getElementById('csvStartDate');const ed=document.getElementById('csvEndDate');
      if(sd&&!sd.value)sd.value=autoStart;if(ed&&!ed.value)ed.value=autoEnd||autoStart;
    }
    csvImportRows=rows;
    _csvPreviewBk=bkForPreview;
    _renderCsvPreview(rows,bkForPreview);
  };
  reader.readAsText(file);
  input.value='';
}
function confirmCsvImport(){
  if(!csvImportRows.length)return;
  const selVal=document.getElementById('csvRetreatSel')?.value||'';
  const importStatus=document.getElementById('csvImportStatus')?.value||'deposit_paid';
  let targetBk=null;
  if(selVal==='__new__'){
    const leader=(document.getElementById('csvLeaderName')?.value||'').trim();
    const name=(document.getElementById('csvRetName')?.value||'').trim();
    const start=document.getElementById('csvStartDate')?.value||'';
    const end=document.getElementById('csvEndDate')?.value||'';
    const row=document.getElementById('csvVenRow')?.value||AppData.venRows[0]||'RETREAT 1';
    if(!leader||!start||!end){showToast('Please fill in leader name and dates for the new retreat.');return;}
    const _namedPax=csvImportRows.filter(r=>r.name&&r.rtId).length;
    targetBk={id:uid(),leaderName:leader,retreatName:name||leader,startDate:start,endDate:end,row,pax:_namedPax||csvImportRows.length,status:importStatus||'deposit_paid',notes:'',roomAssignments:[],blockedRooms:[]};
    AppData.bookings.push(targetBk);
    logActivity('Retreat created via CSV import',`${leader} · ${fmtDate(start)} – ${fmtDate(end)}`,targetBk.id);
  }else{
    targetBk=AppData.bookings.find(b=>b.id===selVal)||regSelBk;
    if(targetBk&&importStatus)targetBk.status=importStatus;
    // Sync pax with actual named guest count when re-importing
    if(targetBk){const _namedPax=csvImportRows.filter(r=>r.name&&r.rtId).length;if(_namedPax>0)targetBk.pax=_namedPax;}
  }
  if(!targetBk){showToast('Please select or create a retreat first.');return;}
  if(!targetBk.blockedRooms)targetBk.blockedRooms=[];
  const overwrite=document.getElementById('csvOverwrite')?.checked;
  const roomGroups={};
  csvImportRows.forEach(r=>{
    if(!r.rtId)return;
    if(!r.name&&!r.room)return;
    if(r.existingReg&&!overwrite)return;
    const key=r.room||('_noroom_'+r.name);
    if(!roomGroups[key]){roomGroups[key]={rtId:r.rtId,room:r.room||'',notes:r.notes,guests:[],blockOnly:!r.name};}
    if(r.name)roomGroups[key].guests.push({name:r.name,email:'',phone:'',note:r.notes});
    else roomGroups[key].blockOnly=true;
  });
  let added=0,blocked=0,unknownRooms=0;
  Object.values(roomGroups).forEach(grp=>{
    const canonRoom=_findCanonicalRoom(grp.room)||grp.room;
    const existingIdx=grp.room?AppData.regs.findIndex(r=>r.bookingId===targetBk.id&&r.room.toLowerCase()===canonRoom.toLowerCase()):-1;
    if(existingIdx>=0&&!overwrite)return;
    if(existingIdx>=0&&overwrite)AppData.regs.splice(existingIdx,1);
    // Block-only rows (empty rooms): just add to blockedRooms, no reg
    if(grp.blockOnly&&!grp.guests.length){
      if(canonRoom){
        const isSystemRoom=!!_findCanonicalRoom(canonRoom);
        if(isSystemRoom&&!targetBk.blockedRooms.some(r=>r.toLowerCase()===canonRoom.toLowerCase())){targetBk.blockedRooms.push(canonRoom);blocked++;targetBk.blockedRoomsUpdatedAt=new Date().toISOString();}
        else if(!isSystemRoom)unknownRooms++;
      }
      return;
    }
    AppData.regs.push({id:uid(),bookingId:targetBk.id,room:canonRoom,roomTypeId:grp.rtId,guests:grp.guests.length?grp.guests:[{name:'',email:'',phone:'',note:''}],customPrice:null,amountPaid:0,notes:grp.notes});
    added++;
    if(canonRoom){
      const isSystemRoom=!!_findCanonicalRoom(canonRoom);
      if(isSystemRoom){if(!targetBk.blockedRooms.some(r=>r.toLowerCase()===canonRoom.toLowerCase())){targetBk.blockedRooms.push(canonRoom);targetBk.blockedRoomsUpdatedAt=new Date().toISOString();}}
      else{unknownRooms++;}
    }
  });
  saveAll();
  closeModal('csvImportModal');
  regSelBk=targetBk;
  const sel=document.getElementById('regRetreatSel');
  if(sel)sel.value=targetBk.id;
  regRender();buildDashboard();
  let msg=`Imported ${added} guest registration${added!==1?'s':''}${blocked?` + ${blocked} empty room${blocked!==1?'s':''} blocked`:''} into ${targetBk.leaderName||targetBk.retreatName}.`;
  if(unknownRooms)msg+=` ⚠ ${unknownRooms} room number${unknownRooms!==1?'s':''} not in system — manually block those rooms to see them in the grid.`;
  showToast(msg);
  const guestCount=Object.values(roomGroups).reduce((s,g)=>s+Math.max(1,g.guests.length),0);
  logActivity('CSV Import',`${guestCount} guest${guestCount!==1?'s':''} → ${added} room${added!==1?'s':''} imported into ${targetBk.leaderName||targetBk.retreatName}`,targetBk.id);
}


// ===== RETREAT GURU IMPORT (PDF + Paste) =====
const RG_TYPE_MAP={
  'deluxe beachfront king':'rt1','deluxe beach front king':'rt1','beachfront king':'rt1',
  'superior king':'rt2','superior':'rt2',
  'garden king plus':'rt3','garden plus king':'rt3','garden plus':'rt3',
  'garden king':'rt4','garden':'rt4',
  'garden basic queen private':'rt5','garden basic':'rt5','simple n small':'rt5','simple & small':'rt5',
  'bed in a double beachview room':'bd1','bed in a double beachview':'bd1','bed in a beachview double':'bd1','beachview double bed':'bd1',
  'beachview double':'rt6',
  'bed in a double room':'bd2','double room bed':'bd2',
  'double room':'rt7','double':'rt7',
  'bed in a garden triple room':'bd3','bed in a triple room':'bd3',
  'triple room':'rt8','triple':'rt8',
  'bed in a quad room':'bd4','quad room':'rt9',
  'casita queen room':'c4b','casita queen':'c4b','casita 1 bed':'c4b',
  'casita 2 queens':'c4c','casita 2 queen':'c4c','casita 2 beds':'c4c',
  'shanti king':'csh1',
  'shanti 2 queens':'csh2','shanti 2 queen':'csh2','shanti 2 bed':'csh2','shanti 2 beds':'csh2',
  'casa king':'cg1','casa grande king':'cg1','casa grande king private':'cg1',
  'casa grande bedroom':'cg2','casa grande up king for 2':'cg2','casa grande up king':'cg2',
  'casa 2 queens':'cg3','casa grande queen for 2':'cg3','casa grande 2 queen downstairs':'cg3',
  'casa individual bed':'cg4','casa grande - upstairs individual bed':'cg4','casa grande upstairs individual bed':'cg4',
  'casa small queen':'cg5','casa grande shared bathroom':'cg5','casa grande (shared bathroom)':'cg5','casa grande up shared 2 queen':'cg5',
};
// Casita 4 bed types — descriptive room names from RG → portal room names
const C4_RT_IDS=new Set(['c4b','c4c']);
const C4_RG_ROOM_MAP={
  'casita 4/1 bed':{rt:'c4b',room:'Casita 4 / 1'},
  'casita 4/1 beds':{rt:'c4b',room:'Casita 4 / 1'},
  'casita 4/2 beds':{rt:'c4c',room:null},  // null = pick first available c4c bed
  'casita 4/2 bed':{rt:'c4c',room:null},
};
// Shanti sub-room names: "Shanti King Room 1/2/3" → Shanti 1/2/3 (csh1)
// "Shanti 2 beds Room 1/2/3" → Shanti 4a/5a/6a + sibling 4b/5b/6b (csh2)
const CSH_RG_ROOM_MAP={
  'shanti king room 1':  {rt:'csh1',room:'Shanti 1', sibling:null},
  'shanti king room 2':  {rt:'csh1',room:'Shanti 2', sibling:null},
  'shanti king room 3':  {rt:'csh1',room:'Shanti 3', sibling:null},
  'shanti 2 beds room 1':{rt:'csh2',room:'Shanti 4a',sibling:'Shanti 4b'},
  'shanti 2 beds room 2':{rt:'csh2',room:'Shanti 5a',sibling:'Shanti 5b'},
  'shanti 2 beds room 3':{rt:'csh2',room:'Shanti 6a',sibling:'Shanti 6b'},
};

// Maps RG descriptive room names (paste + PDF) → portal room names in rooms[]
// Keys are lowercase RG room column values; values are exact portal room names in roomTypes.rooms[]
const CG_RG_ROOM_MAP={
  'casa king downstairs':'Casa King Downstairs',
  'casa grande king downstairs':'Casa King Downstairs',
  'casa grande - bedroom':'Casa Grande Up King',
  'casa grande bedroom':'Casa Grande Up King',
  'casa grande up king':'Casa Grande Up King',
  'casa 2 queens':'Queen Downstairs A',
  'queen downstairs a':'Queen Downstairs A',
  'queen downstairs b':'Queen Downstairs B',
  'individual bed | private bathroom':'Upstairs Individual Bed',
  'upstairs individual bed':'Upstairs Individual Bed',
  'casa grande - upstairs individual bed':'Upstairs Individual Bed',
  'small queen a':'Casa Grande Up A',
  'casa grande up a':'Casa Grande Up A',
  'small queen b':'Casa Grande Up B',
  'casa grande up b':'Casa Grande Up B',
};
