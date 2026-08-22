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
        if(isSystemRoom&&!targetBk.blockedRooms.some(r=>r.toLowerCase()===canonRoom.toLowerCase())){targetBk.blockedRooms.push(canonRoom);blocked++;}
        else if(!isSystemRoom)unknownRooms++;
      }
      return;
    }
    AppData.regs.push({id:uid(),bookingId:targetBk.id,room:canonRoom,roomTypeId:grp.rtId,guests:grp.guests.length?grp.guests:[{name:'',email:'',phone:'',note:''}],customPrice:null,amountPaid:0,notes:grp.notes});
    added++;
    if(canonRoom){
      const isSystemRoom=!!_findCanonicalRoom(canonRoom);
      if(isSystemRoom){if(!targetBk.blockedRooms.some(r=>r.toLowerCase()===canonRoom.toLowerCase()))targetBk.blockedRooms.push(canonRoom);}
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


// ===== RETREAT GURU PASTE (Step 2) =====
let rgPasteData={names:[],rows:[]};

function _parseRGPasteText(text){
  // Normalize tabs to newlines — some browsers (or OS clipboard settings) paste
  // table columns separated by \t instead of \n, which breaks line-by-line parsing.
  const lines=text.replace(/\t/g,'\n').split(/[\n\r]+/).map(l=>l.trim()).filter(Boolean);
  const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ROOM_RE=/^[A-Za-z]{0,4}\d+[A-Za-z]?$/;
  const BAL_RE=/^\$[\d,]+\.\d{2}$/;
  const ID_RE=/^\d{4,8}$/;  // RG registration IDs are 4-8 digits; 10-digit phone numbers must not match
  const MONTH_RE=/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i;
  const SKIP_V=new Set(['n/a','reserved','cancelled','waitlisted','complete','not complete','yes','no','group lead','auto email stopped','add note','participant']);
  function isPhoneLine(l){return /^[+\(]?\d[\d\s\-\.\(\)]{5,23}$/.test(l)&&(l.match(/\d/g)||[]).length>=7&&!MONTH_RE.test(l)&&!BAL_RE.test(l);}

  const names=[];
  let inNames=false,dataStart=0;
  for(let i=0;i<lines.length;i++){
    if(lines[i]==='Name'&&lines[i+1]==='Sort ascending.'){
      if(!inNames){inNames=true;i++;continue;}
      inNames=false;i++;
      while(i<lines.length&&!ID_RE.test(lines[i]))i++;
      dataStart=i;break;
    }
    if(inNames&&/^[A-Za-zÀ-ÿ][a-zA-ZÀ-ÿ '.,()-]+$/.test(lines[i])&&lines[i].includes(' ')&&!lines[i].includes('Sort'))names.push(lines[i]);
  }

  const namesSet=new Set(names);
  function isNameLine(l){
    if(SKIP_V.has(l.toLowerCase())||BAL_RE.test(l)||MONTH_RE.test(l)||EMAIL_RE.test(l)) return false;
    const w=l.split(/\s+/);
    return w.length>=2&&w.length<=5&&w.every(x=>/^[A-ZÀ-Ö][a-zA-ZÀ-ÿ'.,-]*$/.test(x));
  }
  function isValidName(l){return namesSet.size?namesSet.has(l):isNameLine(l);}

  // RG paste has Name (col 1) before ID (col 2): name for row N appears at end of row N-1's data
  // Initialize from line before first ID
  let nextName=dataStart>0&&isValidName(lines[dataStart-1])?lines[dataStart-1]:'';
  const rows=[];
  let i=dataStart;
  // Real RG rows: ID followed (within 4 lines) by a date with a month name.
  // Looking up to 4 lines ahead handles extra columns (e.g. Program, Program Category)
  // that some RG views insert between the ID and the date.
  const REG_DATE_RE=/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+,\s+(?:\d{4},\s+)?\d+:\d+\s*(am|pm)/i;
  const hasRegDate=lines.some(l=>REG_DATE_RE.test(l));
  const ROOM_STATUS_RE=/^(vacant[-\s]dirty|vacant[-\s]clean|occupied|out[-\s]of[-\s]service)/i;
  function isRealId(idx){
    if(!ID_RE.test(lines[idx]))return false;
    if(idx>0&&ID_RE.test(lines[idx-1]))return false; // Person ID immediately follows real ID
    if(hasRegDate){for(let k=1;k<=4;k++){if(REG_DATE_RE.test(lines[idx+k]||''))return true;}return false;}
    for(let k=1;k<=4;k++){if(MONTH_RE.test(lines[idx+k]||''))return true;}
    return false;
  }
  while(i<lines.length){
    if(!isRealId(i)){i++;continue;}
    const nameFromCol=nextName; nextName='';
    i++;
    const rl=[];
    while(i<lines.length&&!isRealId(i)){rl.push(lines[i]);i++;}
    const emailIdx=rl.findIndex(l=>EMAIL_RE.test(l));
    const email=emailIdx>=0?rl[emailIdx]:'';
    // Room: search AFTER email to skip pre-email booking group numbers
    let searchFrom=emailIdx>=0?emailIdx+1:0;
    const roomSlice=rl.slice(searchFrom);
    // For no-email rows: also require a canonical room match to exclude RG booking-window numbers
    // (e.g. "273","277" match ROOM_RE but are not portal rooms — _findCanonicalRoom returns null for them).
    // For email rows: email anchor already positions us past non-room lines, no canonical check needed.
    // Room Status anchor: room is the line immediately before "vacant-dirty/clean", "occupied", etc.
    const rsLocalIdx=roomSlice.findIndex(l=>ROOM_STATUS_RE.test(l));
    let room='',roomLocalIdx=-1;
    if(rsLocalIdx>0){
      const rsCand=roomSlice[rsLocalIdx-1];
      const rsCandLk=rsCand.trim().toLowerCase();
      const _cgAnchor=CG_RG_ROOM_MAP[rsCandLk];const _c4Anchor=C4_RG_ROOM_MAP[rsCandLk]?.room;
      if(_cgAnchor){room=_cgAnchor;roomLocalIdx=rsLocalIdx-1;}
      else if(_c4Anchor){room=_c4Anchor;roomLocalIdx=rsLocalIdx-1;}
      else if(ROOM_RE.test(rsCand)&&!SKIP_V.has(rsCandLk)&&_findCanonicalRoom(rsCand)){room=rsCand;roomLocalIdx=rsLocalIdx-1;}
      else{const cm=rsCand.replace(/[^\x20-\x7E]/g,'').trim().match(/^.+?\s*[-–]\s*([A-Za-z]{0,4}\d+[A-Za-z]?)\s*$/);if(cm&&!BAL_RE.test(rsCand)){room=cm[1];roomLocalIdx=rsLocalIdx-1;}}
    }
    if(!room){
      // Check CG/C4 descriptive names first — they don't match ROOM_RE but are valid rooms
      for(let j=0;j<roomSlice.length;j++){
        const lk=roomSlice[j].trim().toLowerCase();
        if(BAL_RE.test(roomSlice[j])||MONTH_RE.test(roomSlice[j]))continue;
        const _cgr=CG_RG_ROOM_MAP[lk];if(_cgr){room=_cgr;roomLocalIdx=j;break;}
        const _c4r=C4_RG_ROOM_MAP[lk]?.room;if(_c4r){room=_c4r;roomLocalIdx=j;break;}
      }
      if(!room){
        roomLocalIdx=roomSlice.findIndex(l=>ROOM_RE.test(l)&&!SKIP_V.has(l.toLowerCase())&&!isPhoneLine(l)&&_findCanonicalRoom(l)!==null);
        room=roomLocalIdx>=0?roomSlice[roomLocalIdx]:'';
        if(!room){for(let j=0;j<roomSlice.length;j++){const cm=roomSlice[j].replace(/[^\x20-\x7E]/g,'').trim().match(/^.+?\s*[-–]\s*([A-Za-z]{0,4}\d+[A-Za-z]?)\s*$/);if(cm&&!SKIP_V.has(roomSlice[j].toLowerCase())&&!BAL_RE.test(roomSlice[j])){room=cm[1];roomLocalIdx=j;break;}}}
      }
    }
    const roomIdx=roomLocalIdx>=0?searchFrom+roomLocalIdx:-1;
    const balIdx=rl.findIndex(l=>BAL_RE.test(l));
    // Look at end of rl (after last balance) — next row's Name column value lives there
    let lastBal=-1;for(let j=rl.length-1;j>=0;j--){if(BAL_RE.test(rl[j])){lastBal=j;break;}}
    if(lastBal>=0&&lastBal<rl.length-1){nextName=rl.slice(lastBal+1).find(l=>isValidName(l))||'';}
    else if(lastBal<0&&rl.length>0){nextName=rl.slice(-4).find(l=>isValidName(l))||'';}  // sub-reg with no balance
    // Name: prefer Name column (col 1, before ID); fallback to first name-like value between email and room
    const nameEnd=roomIdx>=0?roomIdx:(balIdx>=0?balIdx:rl.length);
    const nameInRow=emailIdx>=0?rl.slice(emailIdx+1,nameEnd).find(l=>isNameLine(l))||'':'';
    const name=nameFromCol||nameInRow;
    let notes='';
    if(roomIdx>=0&&balIdx>roomIdx+1){
      notes=rl.slice(roomIdx+1,balIdx).filter(l=>!BAL_RE.test(l)&&l.length>2&&!SKIP_V.has(l.toLowerCase())&&!MONTH_RE.test(l)&&!/^\d+$/.test(l)&&!EMAIL_RE.test(l)&&!isPhoneLine(l)&&!ROOM_STATUS_RE.test(l)&&!/^\d{4}-\d{2}-\d{2}/.test(l)).join(' ').trim();
    }
    const phone=rl.find(l=>isPhoneLine(l))||'';
    rows.push({name,email,phone,room,notes});
  }
  // The names list (between the two "Name Sort ascending." headers) is in the same
  // display order as the data rows — assign names[i] → rows[i]
  rows.forEach((r,i)=>{if(i<names.length&&names[i])r.name=names[i];});
  return{names,rows};
}

function _resolvePasteRoom(rawRoom, assignedInBatch){
  // Map RG room (e.g. "2A") to portal canonical room, resolving shared-room duplicates to sibling beds
  let canon=_findCanonicalRoom(rawRoom)||rawRoom;
  if(!canon)return '';
  // If canon is a parent room (rt6/rt7/rt8/rt9), not a bed itself,
  // redirect to first available bed (e.g. "5" → "5a", then "5b" for second guest)
  const _inBedType=r=>[...BED_RT_IDS].some(id=>{
    const rt=AppData.roomTypes.find(x=>x.id===id),def=(typeof DEF_ROOM_TYPES!=='undefined'?DEF_ROOM_TYPES:[]).find(x=>x.id===id);
    return[...new Set([...((rt&&rt.rooms)||[]),...((def&&def.rooms)||[])])].some(x=>x===r);
  });
  if(!_inBedType(canon)){
    const beds=_getSharedBeds(canon);
    if(beds.length>0)canon=beds[0];
  }
  if(assignedInBatch.has(canon.toLowerCase())){
    for(const sib of _getSharedBeds(canon)){
      if(!assignedInBatch.has(sib.toLowerCase())){canon=sib;break;}
    }
    // For CG/C4 sub-room types (cg3: Queen Downstairs A+B, cg5: Up A+B, c4b, c4c)
    // _getSharedBeds returns [] for these — fall back to sibling rooms within same roomType.
    // Do NOT apply this fallback for regular room types (king, queen, etc.) where two guests
    // sharing the same room number should stay in the same portal room entry.
    if(assignedInBatch.has(canon.toLowerCase())){
      const sameRt=AppData.roomTypes.find(r=>(r.rooms||[]).some(x=>x.toLowerCase()===canon.toLowerCase()));
      const _cgc4=new Set(['cg1','cg2','cg3','cg4','cg5','cg6','c4b','c4c']);
      if(sameRt?.rooms?.length>1&&_cgc4.has(sameRt.id)){for(const sib of sameRt.rooms){if(!assignedInBatch.has(sib.toLowerCase())){canon=sib;break;}}}
    }
  }
  assignedInBatch.add(canon.toLowerCase());
  return canon;
}

function _renderRGPastePreview(data,bk){
  const{names,rows}=data;
  const assignedInBatch=new Set();
  const matchable=rows.filter(r=>r.room).length;
  document.getElementById('rgPasteInfo').style.display='block';
  const bkLabel=bk?`<b>${bk.leaderName||bk.retreatName}</b>`:'(no retreat)';
  document.getElementById('rgPasteInfo').innerHTML=`${matchable} row${matchable!==1?'s':''} with room found for ${bkLabel}`;
  document.getElementById('rgPasteBody').innerHTML=rows.map(r=>{
    const canonRoom=r.room?_resolvePasteRoom(r.room,assignedInBatch):'';
    const existingReg=bk&&canonRoom?AppData.regs.find(reg=>reg.bookingId===bk.id&&reg.room.toLowerCase()===canonRoom.toLowerCase()):null;
    const displayRoom=canonRoom||r.room||'—';
    const st=existingReg?'<span style="color:#2563eb;font-size:11px">↺ Update</span>':canonRoom?'<span style="color:#15803d;font-size:11px">+ Create</span>':'<span style="color:#9ca3af;font-size:11px">No room</span>';
    return`<tr style="border-bottom:1px solid var(--border)"><td style="padding:7px 12px;font-family:monospace;font-weight:600">${displayRoom}</td><td style="padding:7px 12px;font-size:12.5px;font-weight:600">${r.name||'—'}</td><td style="padding:7px 12px;font-size:12px">${r.email||'—'}</td><td style="padding:7px 12px;font-size:12px;color:var(--muted)">${r.phone||'—'}</td><td style="padding:7px 12px;font-size:12px;color:var(--muted)">${r.notes||'—'}</td><td style="padding:7px 12px">${st}</td></tr>`;
  }).join('');
  document.getElementById('rgPasteConfirmBtn').style.display='inline-flex';
  document.getElementById('rgPastePreviewWrap').style.display='block';
}

function onRGPastePaste(el){
  setTimeout(()=>{
    const text=el.value;if(!text.trim())return;
    const selVal=document.getElementById('rgRetreatSel')?.value||'';
    const bk=AppData.bookings.find(b=>b.id===selVal)||regSelBk||null;
    rgPasteData=_parseRGPasteText(text);
    _renderRGPastePreview(rgPasteData,bk);
  },50);
}

function _decodeHtmlEntities(s){const t=document.createElement('textarea');t.innerHTML=s;return t.value;}
function confirmRGPaste(){
  const selVal=document.getElementById('rgRetreatSel')?.value||'';
  const targetBk=AppData.bookings.find(b=>b.id===selVal)||regSelBk;
  if(!targetBk){showToast('Select a retreat first.');return;}
  const{rows}=rgPasteData;
  let updated=0,created=0;
  const usedRooms=new Set();
  const roomGuestIdx=new Map(); // tracks how many paste rows we've seen per room this batch (for position-based update)
  const cbUpdates=new Map(); // canonRoom.lower → {canonRoom, targetReg} — tracks FINAL state per room
  if(!targetBk.blockedRooms)targetBk.blockedRooms=[];
  rows.forEach(r=>{
    if(!r.room)return;
    const canonRoom=_resolvePasteRoom(r.room,usedRooms);
    if(!canonRoom)return;
    const rName=_decodeHtmlEntities(r.name||'');
    const existingReg=AppData.regs.find(reg=>reg.bookingId===targetBk.id&&reg.room.toLowerCase()===canonRoom.toLowerCase());
    let targetReg=null;
    if(existingReg){
      // Ensure room is in blockedRooms even if reg already existed
      if(!targetBk.blockedRooms.some(x=>x.toLowerCase()===canonRoom.toLowerCase()))targetBk.blockedRooms.push(canonRoom);
      const isBed=BED_RT_IDS.has(existingReg.roomTypeId);
      const maxG=AppData.roomTypes.find(t=>t.id===existingReg.roomTypeId)?.maxOcc||2;
      const rKey=canonRoom.toLowerCase();
      const rIdx=roomGuestIdx.get(rKey)||0;
      roomGuestIdx.set(rKey,rIdx+1);
      if(!isBed){
        // Re-import safe: 1) same name already exists → skip push, just update contact
        //                 2) name changed → update by position
        //                 3) genuinely new guest → add
        const nameMatch=rName?existingReg.guests.findIndex(g=>g.name&&g.name.toLowerCase()===rName.toLowerCase()):-1;
        if(nameMatch>=0){
          const g=existingReg.guests[nameMatch];
          if(r.email)g.email=r.email;if(r.phone)g.phone=r.phone;if(r.notes)g.notes=r.notes;
        }else if(rIdx<existingReg.guests.length){
          const g=existingReg.guests[rIdx];
          if(rName)g.name=rName;if(r.email)g.email=r.email;if(r.phone)g.phone=r.phone;if(r.notes)g.notes=r.notes;
        }else if(existingReg.guests.length<maxG){
          existingReg.guests.push({name:rName,email:r.email||'',phone:r.phone||'',notes:r.notes||''});
        }else{
          const g=existingReg.guests[0];
          if(rName)g.name=rName;if(r.email)g.email=r.email;if(r.phone)g.phone=r.phone;if(r.notes)g.notes=r.notes;
        }
      }else{
        if(rName&&existingReg.guests[0])existingReg.guests[0].name=rName;
        if(r.email&&existingReg.guests[0])existingReg.guests[0].email=r.email;
        if(r.phone&&existingReg.guests[0])existingReg.guests[0].phone=r.phone;
        if(r.notes&&existingReg.guests[0])existingReg.guests[0].notes=r.notes;
      }
      existingReg.updatedAt=new Date().toISOString();
      targetReg=existingReg;updated++;
    }else{
      roomGuestIdx.set(canonRoom.toLowerCase(),(roomGuestIdx.get(canonRoom.toLowerCase())||0)+1);
      const rt=AppData.roomTypes.find(t=>(t.rooms||[]).some(x=>x.toLowerCase()===canonRoom.toLowerCase()));
      const newReg={id:uid(),bookingId:targetBk.id,room:canonRoom,roomTypeId:rt?.id||'',guests:[{name:rName,email:r.email||'',phone:r.phone||'',notes:r.notes||''}],customPrice:null,amountPaid:0,notes:''};
      AppData.regs.push(newReg);targetReg=newReg;
      if(rt&&!targetBk.blockedRooms.some(x=>x.toLowerCase()===canonRoom.toLowerCase()))targetBk.blockedRooms.push(canonRoom);
      created++;
    }
    if(targetReg)cbUpdates.set(canonRoom.toLowerCase(),{canonRoom,targetReg});
    // For shared rooms (double/triple/quad), ensure all partner beds exist
    for(const bed of _getSharedBeds(canonRoom)){
      const existingBed=AppData.regs.find(reg=>reg.bookingId===targetBk.id&&reg.room.toLowerCase()===bed.toLowerCase());
      if(!existingBed){
        const bedRt=AppData.roomTypes.find(t=>(t.rooms||[]).some(x=>x.toLowerCase()===bed.toLowerCase()));
        AppData.regs.push({id:uid(),bookingId:targetBk.id,room:bed,roomTypeId:bedRt?.id||'',guests:[{name:'',email:'',phone:'',notes:''}],customPrice:null,amountPaid:0,notes:''});
        if(!targetBk.blockedRooms.some(x=>x.toLowerCase()===bed.toLowerCase()))targetBk.blockedRooms.push(bed);
        created++;
      }
    }
  });
  saveAll();regRender();buildDashboard();
  showToast(`${updated} reg${updated!==1?'s':''} updated, ${created} created.`);
  // Push to Cloudbeds — ONE call per room with the FINAL guest state (avoids race condition)
  for(const{canonRoom,targetReg}of cbUpdates.values()){
    const _cbIds=targetBk.cbReservationIds||{};
    let cbResId=_cbIds[canonRoom];
    if(!cbResId){const ci=Object.keys(_cbIds).find(k=>k.toLowerCase()===canonRoom.toLowerCase());if(ci)cbResId=_cbIds[ci];}
    if(!cbResId){const str=canonRoom.replace(/[A-Za-z]+$/,'');if(str&&str!==canonRoom){const ci=Object.keys(_cbIds).find(k=>k.toLowerCase()===str.toLowerCase());if(ci)cbResId=_cbIds[ci];}}
    if(!cbResId)continue;
    const names=(targetReg.guests||[]).filter(g=>g.name).map(g=>g.name);
    if(!names.length)continue;
    const guestName=names.join(' & ');
    const adults=names.length;
    const noteLines=(targetReg.guests||[]).filter(g=>g.name&&g.notes).map(g=>`${g.name}: ${g.notes}`);
    const allNotes=[...noteLines].filter(Boolean).join('\n')||undefined;
    const adjId=(targetBk.cbAdjustmentIds||{})[canonRoom]||null;
    const noteId=(targetBk.cbNoteIds||{})[canonRoom]||null;
    const _cbRt=AppData.roomTypes.find(t=>(t.rooms||[]).some(x=>x.toLowerCase()===canonRoom.toLowerCase()));
    const _low=cbIsLowSeason(targetBk.startDate||'');
    const dailyRate=_cbRt?(_low?(adults>=2?(_cbRt.price2_low||_cbRt.price2||_cbRt.price1_low||_cbRt.price1||0):(_cbRt.price1_low||_cbRt.price1||0)):(adults>=2?(_cbRt.price2||_cbRt.price1||0):(_cbRt.price1||0))):0;
    fetch(`${CLOUDBEDS_PROXY}?action=updateReservationGuest`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({reservationId:cbResId,roomName:canonRoom,startDate:targetBk.startDate||'',endDate:targetBk.endDate||'',guestFirstName:guestName,groupName:targetBk.retreatName||targetBk.row||'',leaderName:targetBk.leaderName||'',adults,dailyRate:0,adjustmentId:adjId,notes:allNotes,noteId})
    }).then(res=>res.json()).then(d=>{
      if(d.reservationId){if(!targetBk.cbReservationIds)targetBk.cbReservationIds={};targetBk.cbReservationIds[canonRoom]=d.reservationId;}
      if(d.guestId){if(!targetBk.cbGuestIds)targetBk.cbGuestIds={};targetBk.cbGuestIds[canonRoom]=d.guestId;}
      if(!targetBk.cbAdjustmentIds)targetBk.cbAdjustmentIds={};targetBk.cbAdjustmentIds[canonRoom]=d.adjustmentId||null;
      if(!targetBk.cbNoteIds)targetBk.cbNoteIds={};if(d.noteId)targetBk.cbNoteIds[canonRoom]=d.noteId;else if(d.noteDeleted)targetBk.cbNoteIds[canonRoom]=null;
      saveAll();
    }).catch(e=>console.warn('[CB paste name]',e));
  }
  logActivity('Retreat Guru Paste',`${updated+created} records updated in ${targetBk.leaderName||targetBk.retreatName}`,targetBk.id);
}

function _renderRGPreview(rooms,bk){
  const warns=rooms.filter(r=>!r.matched);
  const warnEl=document.getElementById('rgImportWarn');
  if(warns.length){warnEl.style.display='block';warnEl.innerHTML=warns.map(r=>`⚠️ Room <b>${r.roomRaw}</b> (${r.rtNameRG}) not found in portal — will be skipped`).join('<br>');}
  else{warnEl.style.display='none';}
  const infoEl=document.getElementById('rgImportInfo');
  infoEl.style.display='block';
  const bkLabel=bk?`<b>${bk.leaderName||bk.retreatName}</b> &nbsp;·&nbsp; ${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}`:'<b>New Retreat</b>';
  const matched=rooms.filter(r=>r.matched).length;
  const withGuests=rooms.filter(r=>r.matched&&r.guestName).length;
  infoEl.innerHTML=`Importing to: ${bkLabel} &nbsp;·&nbsp; <b>${matched} room${matched!==1?'s':''}</b>${withGuests?` · ${withGuests} with guest`:''}`;
  document.getElementById('rgPreviewBody').innerHTML=rooms.map(r=>{
    const bg=r.matched?'':'#fffbeb';const op=r.matched?1:.5;
    const st=r.matched?(r.guestName?'<span style="color:#15803d;font-size:11px">✓ With guest</span>':'<span style="color:#6b7280;font-size:11px">✓ Block only</span>'):'<span style="color:#b45309;font-size:11px">⚠ No match</span>';
    const typeNote=r.rtIdRG!==r.rtIdPortal?`<span style="font-size:10px;color:var(--muted)"> → ${r.rtNamePortal}</span>`:'';
    return`<tr style="border-bottom:1px solid var(--border);background:${bg};opacity:${op}"><td style="padding:7px 12px;font-size:11.5px;color:var(--muted)">${r.rtNameRG}${typeNote}</td><td style="padding:7px 12px;font-weight:600">${r.rtNamePortal}</td><td style="padding:7px 12px;font-family:monospace">${r.roomRaw}</td><td style="padding:7px 12px;font-weight:700;color:var(--primary);font-family:monospace">${r.roomPortal}</td><td style="padding:7px 12px;font-size:12.5px">${r.guestName||'<span style="color:#9ca3af">—</span>'}</td><td style="padding:7px 12px">${st}</td></tr>`;
  }).join('');
  const confirmBtn=document.getElementById('rgImportConfirmBtn');
  confirmBtn.textContent=`Block ${matched} room${matched!==1?'s':''}${withGuests?` + create ${withGuests} reg`:''}`;
  confirmBtn.style.display='inline-flex';
  document.getElementById('rgPreviewWrap').style.display='block';
}

async function parseRGPdf(input){
  const file=input.files[0];if(!file)return;
  document.getElementById('rgPdfFileName').textContent=file.name;
  document.getElementById('rgImportConfirmBtn').style.display='none';
  document.getElementById('rgPreviewWrap').style.display='none';
  document.getElementById('rgImportInfo').style.display='none';
  showToast('Reading PDF…');
  try{
    const lines=await _extractPdfLines(file);
    const selVal=document.getElementById('rgRetreatSel')?.value||'';
    let bk=null;
    if(selVal&&selVal!=='__new__')bk=AppData.bookings.find(b=>b.id===selVal)||regSelBk;
    else bk=regSelBk;
    const rooms=_parseRGLines(lines);
    if(!rooms.length){showToast('No rooms found in the PDF. Is this a Retreat Guru PDF?');return;}
    rgParsedRooms=rooms;_rgPreviewBk=bk;
    _renderRGPreview(rooms,bk);
  }catch(e){
    console.error(e);
    showToast('Error reading PDF: '+e.message);
  }
  input.value='';
}

function confirmRGImport(){
  if(!rgParsedRooms.length)return;
  const selVal=document.getElementById('rgRetreatSel')?.value||'';
  let targetBk=null;
  if(selVal==='__new__'){
    const leader=(document.getElementById('rgLeaderName')?.value||'').trim();
    const name=(document.getElementById('rgRetName')?.value||'').trim();
    const start=document.getElementById('rgStartDate')?.value||'';
    const end=document.getElementById('rgEndDate')?.value||'';
    const row=document.getElementById('rgVenRow')?.value||AppData.venRows[0]||'RETREAT 1';
    if(!leader||!start||!end){showToast('Please fill in the leader name and dates.');return;}
    targetBk={id:uid(),leaderName:leader,retreatName:name||leader,startDate:start,endDate:end,row,pax:0,status:'deposit_paid',notes:'',roomAssignments:[],blockedRooms:[]};
    AppData.bookings.push(targetBk);
    logActivity('Retreat created via Retreat Guru',`${leader} · ${fmtDate(start)} – ${fmtDate(end)}`,targetBk.id);
  }else{
    targetBk=AppData.bookings.find(b=>b.id===selVal)||regSelBk;
  }
  if(!targetBk){showToast('Select or create a retreat first.');return;}
  if(!targetBk.blockedRooms)targetBk.blockedRooms=[];
  let added=0,skipped=0,regsCreated=0;
  rgParsedRooms.forEach(r=>{
    if(!r.matched)return;
    if(VIRTUAL_GROUP_RT_IDS.has(r.rtIdPortal))return;
    const room=r.roomPortal;
    if(!targetBk.blockedRooms.some(x=>x.toLowerCase()===room.toLowerCase())){targetBk.blockedRooms.push(room);added++;}
    else skipped++;
    // For shared rooms (double/triple/quad), also block all partner beds
    for(const bed of _getSharedBeds(room)){
      if(!targetBk.blockedRooms.some(x=>x.toLowerCase()===bed.toLowerCase())){targetBk.blockedRooms.push(bed);added++;}
    }
    // Fallback: for bed types, directly enforce sibling beds from DEF_ROOM_TYPES
    if(BED_RT_IDS.has(r.rtIdPortal)){
      const _defBedRt=DEF_ROOM_TYPES.find(d=>d.id===r.rtIdPortal);
      const _sp=splitDoubleHalf(room);
      if(_defBedRt&&_sp&&_sp.base){
        _defBedRt.rooms.filter(dr=>{const s=splitDoubleHalf(dr);return s&&s.base.toLowerCase()===_sp.base.toLowerCase();}).forEach(sibling=>{
          if(!targetBk.blockedRooms.some(x=>x.toLowerCase()===sibling.toLowerCase())){targetBk.blockedRooms.push(sibling);added++;}
        });
      }
    }
    // Create registration if guest name was found in the PDF
    if(r.guestName){
      const existingReg=AppData.regs.find(reg=>reg.bookingId===targetBk.id&&reg.room.toLowerCase()===room.toLowerCase());
      if(!existingReg){
        AppData.regs.push({id:uid(),bookingId:targetBk.id,room,roomTypeId:r.rtIdPortal,guests:[{name:r.guestName,email:'',phone:'',note:''}],customPrice:null,amountPaid:0,notes:''});
        regsCreated++;
      }
    }
  });
  if(regsCreated>0)targetBk.pax=Math.max(targetBk.pax||0,regsCreated);
  saveAll();
  closeModal('rgImportModal');
  regSelBk=targetBk;
  const sel=document.getElementById('regRetreatSel');
  if(sel)sel.value=targetBk.id;
  regRender();buildDashboard();
  const msg=`${added} room${added!==1?'s':''} blocked${regsCreated?` · ${regsCreated} reg${regsCreated!==1?'s':''} created`:''} in ${targetBk.leaderName||targetBk.retreatName}.`;
  showToast(msg);
  logActivity('Retreat Guru Import',msg,targetBk.id);
  pushReservationsToCloudbeds(targetBk).catch(e=>console.warn('[CB push RG]',e));
}
