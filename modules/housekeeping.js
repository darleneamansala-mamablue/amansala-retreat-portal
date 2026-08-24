// ===== housekeeping.js — room cleaning status board =====
// Loaded as a classic script; shares global scope (same pattern as cb-portal-sync.js).
// Own module, own storage — does not touch any other module's data or login flow.
// Occupancy is derived from the existing AppData.bookings/AppData.regs model
// (getRoomBks, booking-hub.html) rather than a separate registrations/booking_requests
// schema, since this app has no per-guest date ranges — a room is "occupied" for
// its parent booking's full startDate..endDate window.

const HK_STATUS_CFG={
  clean:      {label:'Clean',       bg:'#dcfce7',color:'#16a34a',border:'#86efac',dot:'#16a34a'},
  dirty:      {label:'Dirty',       bg:'#fef2f2',color:'#dc2626',border:'#fca5a5',dot:'#dc2626'},
  maintenance:{label:'Maintenance', bg:'#f1f5f9',color:'#475569',border:'#cbd5e1',dot:'#64748b'},
};

let hkStatusMap={};
let hkFilter='all';
let hkModalRoom=null;
let hkPendingStatus=null;

// ===== PERSISTENCE (localStorage cache + app_store sync, same pattern as driverConfirmations) =====
function hkLoadStatusLocal(){
  const raw=localStorage.getItem('amansala_room_status');
  if(raw){try{hkStatusMap=JSON.parse(raw);}catch{hkStatusMap={};}}
}
async function hkSyncStatusFromSupabase(){
  try{
    const{data}=await db.from('app_store').select('value').eq('key','roomStatus').maybeSingle();
    if(data?.value){hkStatusMap={...hkStatusMap,...data.value};localStorage.setItem('amansala_room_status',JSON.stringify(hkStatusMap));}
  }catch(e){}
}
function hkSaveStatusMap(){
  localStorage.setItem('amansala_room_status',JSON.stringify(hkStatusMap));
  (async()=>{try{await db.from('app_store').upsert({key:'roomStatus',value:hkStatusMap,updated_at:new Date().toISOString()});}catch(e){console.warn('Room status sync failed:',e);}})();
}

// ===== OCCUPANCY (today only — this is an operational board, not a planner) =====
function hkOccupancyToday(){
  const today=fmtISO(new Date());
  const occ={};
  const addOcc=(room,entry)=>{
    const prev=occ[room];
    if(!prev){occ[room]=entry;return;}
    if((prev.type==='departing'&&entry.type==='arriving')||(prev.type==='arriving'&&entry.type==='departing')){
      const dep=entry.type==='departing'?entry:prev;
      const arr=entry.type==='arriving'?entry:prev;
      occ[room]={type:'turnover',departing:dep,arriving:arr};
    } else if(entry.type==='arriving'){
      occ[room]=entry;
    }
  };
  (AppData.roomTypes||[]).forEach(rt=>{
    (rt.rooms||[]).forEach(roomId=>{
      getRoomBks(roomId).filter(b=>b.status!=='cancelled'&&b.startDate<=today&&today<=b.endDate).forEach(b=>{
        const type=b.startDate===today?'arriving':b.endDate===today?'departing':'staying';
        addOcc(roomId,{type,guestNames:(b.guests||[]).join(', '),retreatName:b.retreatName||b.leaderName,checkIn:b.startDate,checkOut:b.endDate});
      });
    });
  });
  return occ;
}

function hkEffectiveStatus(roomId,occ){
  const stored=hkStatusMap[roomId];
  const today=fmtISO(new Date());
  const updatedToday=stored?.updated_at?.slice(0,10)===today;
  const o=occ[roomId];
  if(o&&!updatedToday)return'dirty';
  return stored?.status||'clean';
}

function hkMatchesFilter(roomId,occ){
  if(hkFilter==='all')return true;
  if(hkFilter==='occupied')return['staying','turnover'].includes(occ[roomId]?.type);
  return hkEffectiveStatus(roomId,occ)===hkFilter;
}

// ===== INIT / REFRESH =====
function hkInit(){
  hkLoadStatusLocal();
  hkRender();
  Promise.all([loadFromSupabase(),hkSyncStatusFromSupabase()]).then(()=>hkRender());
}
function hkRefresh(){
  const body=document.getElementById('hkBody');
  if(body)body.innerHTML='<div style="color:#8a7e74;text-align:center;padding:60px 0">Refreshing…</div>';
  Promise.all([loadFromSupabase(),hkSyncStatusFromSupabase()]).then(()=>hkRender());
}

// ===== RENDER =====
function hkRender(){
  const root=document.getElementById('hkRoot');if(!root)return;
  const occ=hkOccupancyToday();
  hkRenderFilters();
  hkRenderSummary(occ);
  hkRenderGrid(occ);
}

function hkRenderFilters(){
  const el=document.getElementById('hkFilters');if(!el)return;
  const opts=[
    {key:'all',label:'All'},
    {key:'dirty',label:'Dirty'},
    {key:'clean',label:'Clean'},
    {key:'occupied',label:'In-house'},
    {key:'maintenance',label:'Maintenance'},
  ];
  el.innerHTML=opts.map(o=>`
    <button onclick="hkSetFilter('${o.key}')" id="hkF-${o.key}"
      style="padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif;border:1.5px solid ${hkFilter===o.key?'#2d6a6a':'#e5ddd2'};${hkFilter===o.key?'background:#2d6a6a;color:#fff':'background:#fff;color:#5a5048'}">
      ${o.label}
    </button>`).join('');
}

function hkRenderSummary(occ){
  const el=document.getElementById('hkSummary');if(!el)return;
  const allRooms=(AppData.roomTypes||[]).flatMap(rt=>rt.rooms||[]);
  const counts={clean:0,dirty:0,maintenance:0};
  let inhouse=0;
  allRooms.forEach(roomId=>{
    const st=hkEffectiveStatus(roomId,occ);
    counts[st]=(counts[st]||0)+1;
    if(occ[roomId]?.type==='staying'||occ[roomId]?.type==='turnover')inhouse++;
  });
  const pills=Object.entries(counts).map(([key,n])=>{
    const c=HK_STATUS_CFG[key];
    return `<div style="display:flex;align-items:center;gap:7px;padding:9px 16px;border-radius:10px;background:${c.bg};border:1px solid ${c.border}">
      <span style="width:9px;height:9px;border-radius:50%;background:${c.dot}"></span>
      <span style="font-size:12px;font-weight:700;color:${c.color}">${c.label}</span>
      <span style="font-size:18px;font-weight:800;color:${c.color}">${n}</span>
    </div>`;
  });
  pills.push(`<div style="display:flex;align-items:center;gap:7px;padding:9px 16px;border-radius:10px;background:#fefce8;border:1px solid #fde68a">
    <span style="width:9px;height:9px;border-radius:50%;background:#d97706"></span>
    <span style="font-size:12px;font-weight:700;color:#92400e">In-house</span>
    <span style="font-size:18px;font-weight:800;color:#92400e">${inhouse}</span>
  </div>`);
  el.innerHTML=pills.join('');
}

function hkRenderGrid(occ){
  const body=document.getElementById('hkBody');if(!body)return;
  const groups=(AppData.roomTypes||[]).map(rt=>{
    const rooms=(rt.rooms||[]).filter(roomId=>hkMatchesFilter(roomId,occ));
    return{rt,rooms};
  }).filter(g=>g.rooms.length>0);

  if(!groups.length){
    body.innerHTML='<div style="color:#8a7e74;text-align:center;padding:60px 0;font-size:14px;background:#fff;border:1px solid #e8dfd4;border-radius:12px">No rooms to show.</div>';
    return;
  }

  body.innerHTML=groups.map(({rt,rooms})=>`
    <div style="background:#fff;border-radius:12px;border:1px solid #e8dfd4;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.04);margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;padding:11px 16px;background:#faf7f2;border-bottom:1px solid #e8dfd4">
        <span style="width:10px;height:10px;border-radius:50%;background:${rt.color||'#6b7280'}"></span>
        <span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#2d2520">${escHtml(rt.name)}</span>
        <span style="font-size:11px;color:#8a7e74">${rooms.length} room${rooms.length!==1?'s':''}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">
        ${rooms.map(roomId=>hkRoomCard(roomId,rt,occ)).join('')}
      </div>
    </div>`).join('');
}

function hkRoomCard(roomId,rt,occ){
  const st=hkEffectiveStatus(roomId,occ);
  const cfg=HK_STATUS_CFG[st];
  const o=occ[roomId];
  const stored=hkStatusMap[roomId];
  const notes=stored?.notes;
  const updatedAt=stored?.updated_at;
  const modalStatus=st;

  let occBadge='';
  if(o){
    if(o.type==='turnover'){
      const depNames=o.departing.guestNames||o.departing.retreatName||'';
      const arrNames=o.arriving.guestNames||o.arriving.retreatName||'';
      occBadge=`<div style="font-size:10px;font-weight:700;color:#dc2626;margin-top:5px">&larr; Departs today${depNames?' &middot; '+escHtml(depNames.slice(0,22)):''}</div>
        <div style="font-size:10px;font-weight:700;color:#16a34a;margin-top:2px">&rarr; Arrives today${arrNames?' &middot; '+escHtml(arrNames.slice(0,22)):''}</div>`;
    } else {
      const icon=o.type==='arriving'?'&rarr;':o.type==='departing'?'&larr;':'&bull;';
      const color=o.type==='arriving'?'#16a34a':o.type==='departing'?'#dc2626':'#d97706';
      const label=o.type==='arriving'?'Arrives today':o.type==='departing'?'Departs today':'In-house';
      const names=o.guestNames||o.retreatName||'';
      occBadge=`<div style="font-size:10px;font-weight:700;color:${color};margin-top:5px">${icon} ${label}${names?' &middot; '+escHtml(names.slice(0,25)):''}</div>`;
    }
  }

  const notesBadge=notes?`<div style="font-size:10px;color:#8a7e74;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escHtml(notes)}">&#128221; ${escHtml(notes)}</div>`:'';
  const timeAgo=updatedAt?`<div style="font-size:9px;color:#c8bfb5;margin-top:3px">${hkTimeAgo(updatedAt)}</div>`:'';

  return `<div onclick="hkOpenModal('${roomId}','${escHtml(rt.name)}','${modalStatus}')"
    style="padding:14px 16px;border-right:1px solid #f5f1eb;border-bottom:1px solid #f5f1eb;cursor:pointer;transition:background .15s"
    onmouseover="this.style.background='#faf7f2'" onmouseout="this.style.background=''">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span style="font-size:13px;font-weight:700;color:#2d2520">${escHtml(roomId)}</span>
      <span style="font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:20px;background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border};white-space:nowrap">${cfg.label}</span>
    </div>
    ${occBadge}${notesBadge}${timeAgo}
  </div>`;
}

function hkTimeAgo(iso){
  const diff=Date.now()-new Date(iso).getTime();
  const mins=Math.floor(diff/60000);
  if(mins<2)return'Just now';
  if(mins<60)return mins+'m ago';
  const hrs=Math.floor(mins/60);
  if(hrs<24)return hrs+'h ago';
  return Math.floor(hrs/24)+'d ago';
}

// ===== FILTER =====
function hkSetFilter(f){
  hkFilter=f;
  const occ=hkOccupancyToday();
  hkRenderFilters();
  hkRenderGrid(occ);
}

// ===== STATUS MODAL =====
function hkOpenModal(roomId,rtName,currentStatus){
  hkModalRoom=roomId;
  hkPendingStatus=currentStatus;
  document.getElementById('hkModalRoom').textContent=roomId;
  document.getElementById('hkModalType').textContent=rtName;
  document.getElementById('hkModalNotes').value=hkStatusMap[roomId]?.notes||'';
  hkHighlightStatus(currentStatus);
  openModal('hkStatusModal');
}
function hkSetPendingStatus(status){
  hkPendingStatus=status;
  hkHighlightStatus(status);
}
function hkHighlightStatus(status){
  ['clean','dirty','maintenance'].forEach(s=>{
    const btn=document.getElementById('hkOpt-'+s);
    if(!btn)return;
    btn.style.borderWidth=s===status?'2.5px':'1.5px';
    btn.style.opacity=s===status?'1':'.6';
  });
}
function hkSaveModal(){
  if(!hkModalRoom||!hkPendingStatus)return;
  const notes=document.getElementById('hkModalNotes').value.trim()||null;
  hkStatusMap[hkModalRoom]={status:hkPendingStatus,notes,updated_at:new Date().toISOString()};
  hkSaveStatusMap();
  closeModal('hkStatusModal');
  const savedRoom=hkModalRoom,savedStatus=hkPendingStatus;
  hkModalRoom=null;
  hkRender();
  showToast(savedRoom+' → '+HK_STATUS_CFG[savedStatus].label+' ✓');
}
