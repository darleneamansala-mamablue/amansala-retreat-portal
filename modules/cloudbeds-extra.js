// ===== cloudbeds-extra.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== CLOUDBEDS INTEGRATION =====
async function syncRoomsFromCloudbeds(){
  const msg=document.getElementById('cbSyncRoomsMsg');
  if(msg)msg.textContent='Fetching…';
  try{
    const res=await fetch(`${CLOUDBEDS_PROXY}?action=getRooms`);
    if(!res.ok)throw new Error('HTTP '+res.status);
    const data=await res.json();
    if(data.error)throw new Error(data.error);
    const cbTypes=data.roomTypes||[]; // [{id, name, rooms:[], maxOcc, ...}]
    if(!cbTypes.length)throw new Error('No room types returned');
    console.log('[CB sync] types from Cloudbeds:',cbTypes.map(t=>t.name+' ('+t.rooms.length+' rooms)'));

    // Match each Cloudbeds type to a portal room type by normalized name
    const norm=s=>(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    console.log('[CB sync] portal roomType ids in memory:',AppData.roomTypes.map(t=>t.id+':'+t.name));
    let matched=0,created=0;
    cbTypes.forEach(cb=>{
      const cbNorm=norm(cb.name);
      let rt=AppData.roomTypes.find(t=>norm(t.name)===cbNorm)
        ||AppData.roomTypes.find(t=>cbNorm.includes(norm(t.name))||norm(t.name).includes(cbNorm));
      console.log('[CB sync] matching',cb.name,'→',rt?rt.id+':'+rt.name:'NO MATCH','('+cb.rooms.length+' rooms)');
      if(rt){
        rt.rooms=[...cb.rooms];
        if(cb.maxOcc)rt.maxOcc=cb.maxOcc;
        matched++;
      }else{
        // Create new room type keeping Cloudbeds name and rooms
        AppData.roomTypes.push({id:'cb_'+cb.id,name:cb.name,color:cb.color||'#607D8B',maxOcc:cb.maxOcc||2,
          rooms:[...cb.rooms],price1:0,price2:0,price1_low:0,price2_low:0});
        created++;
      }
    });
    // Re-apply DEF_ROOM_TYPES room ownership after sync so Cloudbeds names like
    // "Bed in a Beachview Double" don't leave duplicate room entries in portal types.
    const _dm=new Map();
    DEF_ROOM_TYPES.forEach(d=>d.rooms.forEach(r=>_dm.set(r,d.id)));
    AppData.roomTypes.forEach(s=>{s.rooms=s.rooms.filter(r=>{const c=_dm.get(r);return!c||c===s.id;});});
    saveAll();
    openSettings(); // re-render the modal table
    const total=matched+created;
    if(msg)msg.textContent=`✓ ${total} types synced (${matched} updated, ${created} new)`;
    showToast(`Cloudbeds rooms synced — ${matched} updated, ${created} new room types.`);
  }catch(e){
    if(msg)msg.textContent='Error: '+e.message;
    showToast('Sync failed: '+e.message);
  }
}

function openCbSettings(){
  const cfg=JSON.parse(localStorage.getItem('ama_cb_config')||'{}');
  const pidEl=document.getElementById('cbPropertyIdInput');
  const tokEl=document.getElementById('cbTokenInput');
  if(pidEl)pidEl.value=cfg.propertyId||'';
  if(tokEl)tokEl.value=cfg.token||'';
  // Render existing mapping
  cbRenderMapping(cfg.mapping||[],cfg.cbRooms||[]);
  const log=document.getElementById('cbSyncLog');if(log)log.style.display='none';
  openModal('cbSettingsModal');
}
function cbSaveCredentials(){
  const pid=document.getElementById('cbPropertyIdInput')?.value.trim();
  const tok=document.getElementById('cbTokenInput')?.value.trim();
  if(!pid||!tok){showToast('Please enter both Property ID and Access Token.');return;}
  const cfg=JSON.parse(localStorage.getItem('ama_cb_config')||'{}');
  cfg.propertyId=pid;cfg.token=tok;
  localStorage.setItem('ama_cb_config',JSON.stringify(cfg));
  showToast('Credentials saved.');
}
async function cbFetchRooms(){
  const cfg=JSON.parse(localStorage.getItem('ama_cb_config')||'{}');
  const status=document.getElementById('cbFetchStatus');
  if(status)status.textContent='Fetching…';
  try{
    // Use the Netlify proxy — no CORS issues, reuses the server-side API key
    const res=await fetch(`${CLOUDBEDS_PROXY}?action=getRooms`);
    if(!res.ok)throw new Error('HTTP '+res.status);
    const data=await res.json();
    if(data.error)throw new Error(data.error);
    // getRooms returns roomLookup: { roomName → roomID } and roomTypes
    const lookup=data.roomLookup||{};
    cfg.cbRooms=Object.entries(lookup).map(([name,id])=>{
      const rt=(data.roomTypes||[]).find(t=>(t.rooms||[]).includes(name));
      return{id:String(id),name,type:rt?.name||''};
    }).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    localStorage.setItem('ama_cb_config',JSON.stringify(cfg));
    cbRenderMapping(cfg.mapping||[],cfg.cbRooms);
    if(status)status.textContent=`${cfg.cbRooms.length} rooms loaded`;
  }catch(e){
    if(status)status.textContent='Error: '+e.message;
    showToast('Could not fetch rooms: '+e.message);
  }
}
function cbRenderMapping(mapping,cbRooms){
  const wrap=document.getElementById('cbMappingRows');if(!wrap)return;
  if(!cbRooms||!cbRooms.length){
    wrap.innerHTML='<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Fetch rooms from Cloudbeds to build the mapping.</div>';
    return;
  }
  // Build flat list of all portal room numbers
  const portalRooms=[];
  AppData.roomTypes.forEach(rt=>rt.rooms.forEach(rn=>portalRooms.push(rn)));
  const mapById=mapping.reduce((m,e)=>{m[e.cbId]=e.portalRoom;return m;},{});
  wrap.innerHTML=cbRooms.map(cr=>{
    const opts=['<option value="">— None —</option>',
      ...portalRooms.map(rn=>`<option value="${rn}"${mapById[cr.id]===rn?' selected':''}>${rn}</option>`)
    ].join('');
    return`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);font-size:12.5px">
      <span style="font-weight:600">${cr.name||cr.id}</span>
      <span style="color:var(--muted)">${cr.type||'—'}</span>
      <select data-cbid="${cr.id}" style="padding:5px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12px;background:#fff">${opts}</select>
    </div>`;
  }).join('');
}
function cbSaveMapping(){
  const cfg=JSON.parse(localStorage.getItem('ama_cb_config')||'{}');
  const selects=document.querySelectorAll('#cbMappingRows select[data-cbid]');
  cfg.mapping=[];
  selects.forEach(sel=>{
    if(sel.value)cfg.mapping.push({cbId:sel.dataset.cbid,portalRoom:sel.value});
  });
  localStorage.setItem('ama_cb_config',JSON.stringify(cfg));
  showToast(`Mapping saved — ${cfg.mapping.length} room${cfg.mapping.length!==1?'s':''} linked.`);
}
async function cbPushReservation(reg,bkId){
  const cfg=JSON.parse(localStorage.getItem('ama_cb_config')||'{}');
  if(!cfg.propertyId||!cfg.token||!cfg.mapping||!cfg.mapping.length)return null;
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return null;
  const mapped=cfg.mapping.find(m=>m.portalRoom===reg.room);
  if(!mapped)return null;
  const body={
    propertyID:cfg.propertyId,
    roomID:mapped.cbId,
    startDate:bk.startDate,
    endDate:bk.endDate,
    guestFirstName:reg.name?reg.name.split(' ')[0]:'Guest',
    guestLastName:reg.name?reg.name.split(' ').slice(1).join(' ')||'—':'—',
    guestEmail:reg.email||'',
    adults:reg.guests||1,
  };
  const res=await fetch('https://api.cloudbeds.com/api/v1.1/postReservation',{
    method:'POST',headers:{Authorization:'Bearer '+cfg.token,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(body)
  });
  return res.ok?(await res.json()):null;
}
async function cbSyncBooking(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const bkRegs=AppData.regs.filter(r=>r.bkId===bkId&&r.name&&r.room);
  const log=document.getElementById('cbSyncLog');
  if(log){log.style.display='block';log.innerHTML='<b>Syncing to Cloudbeds…</b><br>';}
  let ok=0,skip=0,fail=0;
  for(const reg of bkRegs){
    try{
      const result=await cbPushReservation(reg,bkId);
      if(result&&result.success){ok++;if(log)log.innerHTML+=`✅ ${reg.name} → Room ${reg.room}<br>`;}
      else if(!result){skip++;if(log)log.innerHTML+=`⏭ ${reg.name} (Room ${reg.room}) — no mapping, skipped<br>`;}
      else{fail++;if(log)log.innerHTML+=`❌ ${reg.name} (Room ${reg.room}) — ${result.message||'error'}<br>`;}
    }catch(e){fail++;if(log)log.innerHTML+=`❌ ${reg.name} — ${e.message}<br>`;}
  }
  if(log)log.innerHTML+=`<br><b>Done:</b> ${ok} synced · ${skip} skipped · ${fail} failed`;
  showToast(`Cloudbeds sync: ${ok} synced, ${skip} skipped, ${fail} failed.`);
}

function svToggleChangesForm(bkId){
  const form=document.getElementById('svChangesForm');
  const btn=document.getElementById('svSendChangesBtn');
  if(!form)return;
  const visible=form.style.display!=='none';
  form.style.display=visible?'none':'block';
  if(btn)btn.style.display=visible?'none':'flex';
}

function tsSendAdminChanges(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);
  if(!bk||!bk.scheduleRequest)return;
  const sr=bk.scheduleRequest;
  const override={
    morningStart:document.getElementById('svAdjMorningStart')?.value||sr.morningStart,
    morningDur:parseInt(document.getElementById('svAdjMorningDur')?.value)||sr.morningDur,
    morningShala1:document.getElementById('svAdjMorningShala1')?.value||sr.morningShala1,
    morningShala2:document.getElementById('svAdjMorningShala2')?.value||sr.morningShala2,
  };
  if(sr.hasAfternoon){
    override.afternoonStart=document.getElementById('svAdjAfternoonStart')?.value||sr.afternoonStart;
    override.afternoonDur=parseInt(document.getElementById('svAdjAfternoonDur')?.value)||sr.afternoonDur;
    override.afternoonShala1=document.getElementById('svAdjAfternoonShala1')?.value||sr.afternoonShala1;
    override.afternoonShala2=document.getElementById('svAdjAfternoonShala2')?.value||sr.afternoonShala2;
  }
  bk.scheduleRequest.adminOverride=override;
  bk.scheduleRequest.adminStatus='changes';
  bk.scheduleRequest.adminNote=document.getElementById('tsAdminNoteInput')?.value||'';
  saveAll();buildDashboard();
  logActivity('Schedule changes requested',bk.leaderName||bk.retreatName,bkId);
  closeModal('scheduleViewerModal');
  showToast('Changes sent to teacher — they will see your suggested times.');
}

function svGetConflicts(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);
  if(!bk||!bk.scheduleRequest)return[];
  const sr=bk.scheduleRequest;
  const conflicts=[];
  // Returns true if two time ranges overlap, with a 15-min buffer between classes
  const timesOverlap=(startA,durA,startB,durB)=>{
    if(!startA||!startB)return false;
    const toMin=t=>{const[h,m]=t.split(':').map(Number);return h*60+m;};
    const sA=toMin(startA),eA=sA+(durA||90);
    const sB=toMin(startB),eB=sB+(durB||90);
    return sA<eB+15&&eA>sB; // 15-min buffer: next class can start 15 min after previous ends
  };
  AppData.bookings.filter(b=>b.id!==bkId&&b.status!=='cancelled'&&b.scheduleRequest?.adminStatus==='confirmed').forEach(other=>{
    if(other.endDate<=bk.startDate||other.startDate>=bk.endDate)return;
    const osr=other.scheduleRequest;
    if(!osr)return;
    // Morning shala overlap — only flag if times actually clash
    if(timesOverlap(sr.morningStart,sr.morningDur,osr.morningStart,osr.morningDur)){
      const myShalas=[sr.morningShala1,sr.morningShala2].filter(Boolean);
      const theirMornShalas=[osr.morningShala1,osr.morningShala2].filter(Boolean);
      const mornConflicts=myShalas.filter(s=>theirMornShalas.includes(s));
      if(mornConflicts.length){
        conflicts.push({otherBk:other,period:'morning',shalas:mornConflicts,otherTime:osr.morningStart,myTime:sr.morningStart});
      }
    }
    // Afternoon shala overlap — only flag if times actually clash
    if(sr.hasAfternoon&&osr.hasAfternoon){
      const afSlot=sr.afternoonSlot||sr.afternoonStart;
      const oAfSlot=osr.afternoonSlot||osr.afternoonStart;
      if(timesOverlap(afSlot,sr.afternoonDur,oAfSlot,osr.afternoonDur)){
        const myAfShalas=[sr.afternoonShala1,sr.afternoonShala2].filter(Boolean);
        const theirAfShalas=[osr.afternoonShala1,osr.afternoonShala2].filter(Boolean);
        const afConflicts=myAfShalas.filter(s=>theirAfShalas.includes(s));
        if(afConflicts.length){
          conflicts.push({otherBk:other,period:'afternoon',shalas:afConflicts,otherTime:oAfSlot,myTime:afSlot});
        }
      }
    }
  });
  return conflicts;
}

function svNotifyConflict(otherBkId,thisBkId,shalaIds,period){
  const other=AppData.bookings.find(b=>b.id===otherBkId);
  const thisBk=AppData.bookings.find(b=>b.id===thisBkId);
  if(!other||!thisBk)return;
  const shalaNames=shalaIds.split(',').map(id=>SHALAS.find(s=>s.id===id)?.name||id).join(' and ');
  const msg='Hi '+(other.leaderName||'')+',\n\nWe wanted to reach out because there is a scheduling overlap for the '+shalaNames+' shala during your '+period+' class. Another retreat group is also requesting that space at a similar time.\n\nWould you be open to adjusting your start time by 15–30 minutes? We want to make sure both groups have the best experience.\n\nPlease reply to this email or let us know through your portal. Thank you!\n\nWarm regards,\nAmansala Team';
  const email=other.leaderEmail||'';
  const win=window.open('','_blank','width=600,height=400');
  if(win){
    win.document.write('<pre style="font-family:sans-serif;padding:20px;white-space:pre-wrap">'+msg+'</pre><p>Email: <a href="mailto:'+email+'">'+(email||'(no email on file)')+'</a></p>');
  }else{
    showToast('Draft: '+msg.slice(0,80)+'...');
  }
  logActivity('Conflict notification drafted',(other.leaderName||'Teacher')+' re: '+shalaNames,thisBkId);
}

