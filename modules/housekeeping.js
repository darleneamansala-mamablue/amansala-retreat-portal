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
let hkDate=null;        // board date (YYYY-MM-DD, hotel-local); null until hkInit
let hkCleanLog={};      // roomId -> latest finished cleaning on hkDate, from the HK app
let hkCleanList=[];     // every finished cleaning on hkDate, newest first (activity feed)
let hkInProgress={};    // roomId -> cleaning started in the HK app but not finished yet
let hkPrevSeen=null;    // badge "seen" time from before this visit -- rows after it are NEW
let hkFeedExpanded=false;
let hkAutoTimer=null;

// Finished cleanings (room, housekeeper name, times) come from the housekeeping
// app's own DB through its Netlify function -- see getCleanLog in
// amansala-housekeeping/netlify/functions/housekeeping.js.
const HK_CLEANLOG_URL='https://amansala-housekeeping.netlify.app/.netlify/functions/housekeeping?action=getCleanLog';
const HK_BADGE_SEEN_KEY='hk_badge_seen_at';

function hkToday(){return fmtISO(new Date());}
async function hkFetchCleanLogFull(date){
  const r=await fetch(HK_CLEANLOG_URL+'&date='+date);
  const d=await r.json();
  if(!d.success)throw new Error(d.error||'getCleanLog failed');
  return d;
}
async function hkFetchCleanLog(date){return(await hkFetchCleanLogFull(date)).cleaned||[];}
// Returns the cleanings that weren't in the previous load (for the live alert)
async function hkLoadCleanLog(){
  const date=hkDate;
  try{
    const d=await hkFetchCleanLogFull(date);
    if(date!==hkDate)return[]; // user moved to another day meanwhile
    const list=d.cleaned||[];
    const ip={};
    (d.inProgress||[]).forEach(c=>{ip[c.room]=c;});
    hkInProgress=ip;
    const key=c=>c.room+'|'+c.roomType+'|'+c.finishedAt;
    const before=new Set(hkCleanList.map(key));
    const map={};
    list.forEach(c=>{const prev=map[c.room];if(!prev||(c.finishedAt||'')>(prev.finishedAt||''))map[c.room]=c;});
    hkCleanLog=map;
    hkCleanList=list.slice().sort((a,b)=>(b.finishedAt||'').localeCompare(a.finishedAt||''));
    return hkCleanList.filter(c=>!before.has(key(c)));
  }catch(e){console.warn('HK clean log failed:',e);return[];}
}
function hkFmtTime(iso){return new Date(iso).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});}
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

// ===== OCCUPANCY (for the board's selected date) =====
function hkOccupancyToday(){
  const today=hkDate||hkToday();
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
      getRoomBks(roomId).filter(b=>b.status!=='cancelled'&&b.startDate<=today&&today<=b.endDate&&hkRegCounts(b,roomId)).forEach(b=>{
        const type=b.startDate===today?'arriving':b.endDate===today?'departing':'staying';
        addOcc(roomId,{type,guestNames:(b.guests||[]).join(', '),retreatName:b.retreatName||b.leaderName,checkIn:b.startDate,checkOut:b.endDate});
      });
    });
  });
  return occ;
}

// A room removed from the retreat's blockedRooms keeps its old registrations
// row, and a reg whose named guests are all cancelled is empty too -- neither
// is an occupied room. Jorge's report 2026-09-30: GV8 (guest moved to GV15)
// and CH17 showed "In-house · Anthony Chavez" with nobody in them. Same guard
// as Transport (#136) and registeredCount() (#137).
function hkRegCounts(b,roomId){
  const bk=AppData.bookings.find(x=>x.id===b.bookingId);
  if(bk?.blockedRooms?.length&&!bk.blockedRooms.includes(roomId))return false;
  const reg=AppData.regs.find(r=>r.id===b.id);
  const named=(reg?.guests||[]).filter(g=>g.name);
  if(named.length&&named.every(g=>g.cancelled))return false;
  return true;
}

function hkEffectiveStatus(roomId,occ){
  const stored=hkStatusMap[roomId];
  const date=hkDate||hkToday();
  const isToday=date===hkToday();
  // local date, not updated_at.slice(0,10) (UTC -- flipped to tomorrow at 7pm)
  const storedOnDate=isToday&&stored?.updated_at&&fmtISO(new Date(stored.updated_at))===date;
  const log=hkCleanLog[roomId];
  // A finished cleaning in the HK app wins unless someone changed it here later
  if(log&&(!storedOnDate||(log.finishedAt||'')>=stored.updated_at))return'clean';
  if(storedOnDate)return stored.status;
  if(occ[roomId])return'dirty';
  return isToday?(stored?.status||'clean'):'clean';
}

function hkMatchesFilter(roomId,occ){
  if(hkFilter==='all')return true;
  if(hkFilter==='occupied')return['staying','turnover'].includes(occ[roomId]?.type);
  return hkEffectiveStatus(roomId,occ)===hkFilter;
}

// ===== INIT / REFRESH =====
function hkInit(){
  if(!hkDate)hkDate=hkToday();
  hkLoadStatusLocal();
  try{hkPrevSeen=localStorage.getItem(HK_BADGE_SEEN_KEY);}catch(e){}
  hkMarkBadgeSeen();
  hkRender();
  Promise.all([loadFromSupabase(),hkSyncStatusFromSupabase(),hkLoadCleanLog()]).then(()=>hkRender());
  hkStartAutoRefresh();
}
function hkRefresh(){
  const body=document.getElementById('hkBody');
  if(body)body.innerHTML='<div style="color:#8a7e74;text-align:center;padding:60px 0">Refreshing…</div>';
  Promise.all([loadFromSupabase(),hkSyncStatusFromSupabase(),hkLoadCleanLog()]).then(()=>hkRender());
}
function hkIsOpen(){return document.getElementById('tab-housekeeping')?.classList.contains('active');}
// While the board is open, pick up cleanings finished in the HK app every 60s
function hkStartAutoRefresh(){
  if(hkAutoTimer)return;
  hkAutoTimer=setInterval(async()=>{
    if(!hkIsOpen()||document.hidden)return;
    const [,fresh]=await Promise.all([hkSyncStatusFromSupabase(),hkLoadCleanLog()]);
    hkMarkBadgeSeen();
    if(fresh.length&&hkDate===hkToday()){
      const c=fresh[0];
      showToast(fresh.length===1?`✓ ${c.cleanedBy||'Housekeeping'} finished ${c.room}`:`✓ ${fresh.length} rooms finished: ${fresh.map(f=>f.room).join(', ')}`);
    }
    if(!document.getElementById('hkStatusModal')?.classList.contains('open'))hkRender();
  },60000);
}
function hkSetDate(date){
  if(!date)return;
  hkDate=date;hkCleanLog={};hkCleanList=[];hkInProgress={};hkFeedExpanded=false;
  hkRender();
  hkLoadCleanLog().then(()=>hkRender());
}
function hkShiftDate(days){hkSetDate(fmtISO(addDays(pd(hkDate||hkToday()),days)));}

// ===== SIDEBAR BADGE: "+N" rooms cleaned today since you last opened the board =====
function hkMarkBadgeSeen(){
  try{localStorage.setItem(HK_BADGE_SEEN_KEY,new Date().toISOString());}catch(e){}
  hkSetBadge(0);
}
function hkSetBadge(n){
  const btn=document.getElementById('housekeepingTabBtn');if(!btn)return;
  let b=btn.querySelector('.hk-nav-badge');
  if(!n){if(b)b.remove();return;}
  if(!b){b=document.createElement('span');b.className='hk-nav-badge';btn.appendChild(b);}
  b.textContent='+'+n;
  b.title=n+' room'+(n!==1?'s':'')+' cleaned since you last looked';
}
async function hkPollBadge(){
  const btn=document.getElementById('housekeepingTabBtn');
  if(!btn||btn.offsetParent===null||document.hidden)return;
  if(hkIsOpen()){hkMarkBadgeSeen();return;}
  let seen=null;try{seen=localStorage.getItem(HK_BADGE_SEEN_KEY);}catch(e){}
  if(!seen){hkMarkBadgeSeen();return;} // first run: start counting from now
  try{
    const list=await hkFetchCleanLog(hkToday());
    hkSetBadge(list.filter(c=>(c.finishedAt||'')>seen).length);
  }catch(e){}
}
setTimeout(hkPollBadge,5000);
setInterval(hkPollBadge,60000);

// ===== RENDER =====
function hkRender(){
  const root=document.getElementById('hkRoot');if(!root)return;
  if(!hkDate)hkDate=hkToday();
  const occ=hkOccupancyToday();
  hkRenderDateNav();
  hkRenderFilters();
  hkRenderSummary(occ);
  hkRenderFeed();
  hkRenderGrid(occ);
}

// ===== ACTIVITY FEED: what each housekeeper has finished, newest first =====
const HK_TASK_LABEL={checkout:'Departure',arrival:'Arrival',stayover:'Stayover',refresh:'Refresh'};
function hkRenderFeed(){
  const el=document.getElementById('hkFeed');if(!el)return;
  const ipList=Object.values(hkInProgress).sort((a,b)=>(a.startedAt||'').localeCompare(b.startedAt||''));
  if(!hkCleanList.length&&!ipList.length){el.innerHTML='';return;}
  const LIMIT=6;
  const rows=hkFeedExpanded?hkCleanList:hkCleanList.slice(0,LIMIT);
  const isNew=c=>hkPrevSeen&&hkDate===hkToday()&&(c.finishedAt||'')>hkPrevSeen;
  const newN=hkCleanList.filter(isNew).length;
  el.innerHTML=`
    <div style="background:#fff;border-radius:12px;border:1px solid #e8dfd4;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.04);margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;padding:11px 16px;background:#f0fdfa;border-bottom:1px solid #ccfbf1">
        <span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#0f766e">&#10003; Housekeeping activity</span>
        <span style="font-size:11px;color:#5a8a84">${hkCleanList.length} finished${ipList.length?' &middot; '+ipList.length+' in progress':''}</span>
        ${newN?`<span style="font-size:10px;font-weight:700;background:#4db6ac;color:#fff;padding:2px 8px;border-radius:10px">${newN} new</span>`:''}
      </div>
      ${ipList.map(c=>{
        const mins=c.startedAt?Math.max(0,Math.round((Date.now()-new Date(c.startedAt))/60000)):null;
        return `<div style="display:flex;align-items:center;gap:12px;padding:9px 16px;border-bottom:1px solid #f5f1eb;font-size:12.5px;background:#fffbeb">
          <span style="font-weight:700;color:#2d2520;min-width:62px">${escHtml(c.room)}</span>
          <span style="color:#b45309;font-weight:600;flex:1">${escHtml(c.cleanedBy||'Housekeeping')}</span>
          <span style="color:#8a7e74">${escHtml(HK_TASK_LABEL[c.roomType]||c.roomType||'')}</span>
          ${mins!==null?`<span style="color:#8a7e74">${mins} min so far</span>`:''}
          <span style="font-size:10px;font-weight:700;color:#b45309;background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:2px 9px;min-width:70px;text-align:center">&#9203; In progress</span>
        </div>`;}).join('')}
      ${rows.map(c=>{
        const mins=c.startedAt&&c.finishedAt?Math.max(0,Math.round((new Date(c.finishedAt)-new Date(c.startedAt))/60000)):null;
        return `<div style="display:flex;align-items:center;gap:12px;padding:9px 16px;border-bottom:1px solid #f5f1eb;font-size:12.5px;${isNew(c)?'background:#f0fdfa':''}">
          <span style="font-weight:700;color:#2d2520;min-width:62px">${escHtml(c.room)}</span>
          <span style="color:#0f766e;font-weight:600;flex:1">${escHtml(c.cleanedBy||'Housekeeping')}</span>
          <span style="color:#8a7e74">${escHtml(HK_TASK_LABEL[c.roomType]||c.roomType||'')}</span>
          ${mins!==null?`<span style="color:#8a7e74">${mins} min</span>`:''}
          <span style="color:#5a5048;font-weight:600;min-width:70px;text-align:right">${c.finishedAt?hkFmtTime(c.finishedAt):''}</span>
          ${isNew(c)?'<span style="font-size:9.5px;font-weight:700;color:#0f766e;border:1px solid #5eead4;border-radius:8px;padding:1px 6px">NEW</span>':''}
        </div>`;}).join('')}
      ${hkCleanList.length>LIMIT?`<div onclick="hkFeedExpanded=!hkFeedExpanded;hkRenderFeed()" style="padding:8px 16px;font-size:12px;font-weight:600;color:#2d6a6a;cursor:pointer;text-align:center">${hkFeedExpanded?'Show less':'Show all '+hkCleanList.length}</div>`:''}
    </div>`;
}

function hkRenderDateNav(){
  const el=document.getElementById('hkDateNav');if(!el)return;
  const isToday=hkDate===hkToday();
  const btn="padding:5px 10px;border:1.5px solid #e5ddd2;border-radius:8px;background:#fff;font-family:'Jost',sans-serif;font-size:12px;font-weight:600;cursor:pointer;color:#5a5048";
  el.innerHTML=`
    <button onclick="hkShiftDate(-1)" style="${btn}" title="Previous day">&lsaquo;</button>
    <input type="date" value="${hkDate}" onchange="hkSetDate(this.value)" style="padding:4px 8px;border:1.5px solid #e5ddd2;border-radius:8px;font-family:'Jost',sans-serif;font-size:12px;color:#2d2520;background:#fff">
    <button onclick="hkShiftDate(1)" style="${btn}" title="Next day">&rsaquo;</button>
    ${isToday?'':`<button onclick="hkSetDate(hkToday())" style="${btn};border-color:#2d6a6a;color:#2d6a6a">Today</button>`}`;
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
  const cleanedN=Object.keys(hkCleanLog).length;
  const ipN=Object.keys(hkInProgress).length;
  if(ipN)pills.push(`<div onclick="document.getElementById('hkFeed')?.scrollIntoView({behavior:'smooth',block:'start'})" title="See which rooms" style="cursor:pointer;display:flex;align-items:center;gap:7px;padding:9px 16px;border-radius:10px;background:#fffbeb;border:1px solid #fcd34d">
    <span style="font-size:12px;font-weight:700;color:#b45309">&#9203; In progress</span>
    <span style="font-size:18px;font-weight:800;color:#b45309">${ipN}</span>
  </div>`);
  pills.push(`<div onclick="document.getElementById('hkFeed')?.scrollIntoView({behavior:'smooth',block:'start'})" title="See which rooms" style="cursor:pointer;display:flex;align-items:center;gap:7px;padding:9px 16px;border-radius:10px;background:#f0fdfa;border:1px solid #99f6e4">
    <span style="font-size:12px;font-weight:700;color:#0f766e">&#10003; Cleaned by housekeeping</span>
    <span style="font-size:18px;font-weight:800;color:#0f766e">${cleanedN}</span>
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
  const log=hkCleanLog[roomId];
  const ip=hkInProgress[roomId];
  const ipBadge=ip&&!(log&&(log.finishedAt||'')>(ip.startedAt||''))?`<div style="font-size:10px;font-weight:700;color:#b45309;margin-top:4px">&#9203; In progress &middot; ${escHtml(ip.cleanedBy||'housekeeping')}${ip.startedAt?' &middot; since '+hkFmtTime(ip.startedAt):''}</div>`:'';
  const cleanedBadge=log?`<div style="font-size:10px;font-weight:700;color:#0f766e;margin-top:4px">&#10003; Cleaned by ${escHtml(log.cleanedBy||'housekeeping')}${log.finishedAt?' &middot; '+hkFmtTime(log.finishedAt):''}</div>`:'';
  const timeAgo=updatedAt&&hkDate===hkToday()?`<div style="font-size:9px;color:#c8bfb5;margin-top:3px">${hkTimeAgo(updatedAt)}</div>`:'';

  return `<div onclick="hkOpenModal('${roomId}','${escHtml(rt.name)}','${modalStatus}')"
    style="padding:14px 16px;border-right:1px solid #f5f1eb;border-bottom:1px solid #f5f1eb;cursor:pointer;transition:background .15s"
    onmouseover="this.style.background='#faf7f2'" onmouseout="this.style.background=''">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span style="font-size:13px;font-weight:700;color:#2d2520">${escHtml(roomId)}</span>
      <span style="font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:20px;background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border};white-space:nowrap">${cfg.label}</span>
    </div>
    ${occBadge}${ipBadge}${cleanedBadge}${notesBadge}${timeAgo}
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
