// ===== casita4-alert.js — admin-only "this retreat's people can fit in Casita 4" alert =====
// Loaded as a classic script AFTER venues.js and retreat-builder.js (right after casa-shanti-alert.js); shares global scope.
// Standalone: no other module is edited. Shows an amber banner at the top of BOTH the Venues tab and the Room Calendar tab
// (same alert, same dismiss: dismissing it in one hides it in the other) for a retreat that
//   - has at least 2 double rooms FILLED WITH NAMES and at least 1 basic room FILLED WITH A NAME, and
//   - does not already have Casita 4 blocked, and
//   - Casita 4 is actually free for the retreat's dates.
// Casita 4 = 2 double rooms (Casita 4 /2a-2b and /3a-3b) + 1 basic room (Casita 4 / 1), so that combination fits exactly.
// "Filled with names" (rooms with no names never trigger the alert):
//   a double ROOM (Double / Beachview Double) needs 2 named guests; a double made of BEDS (Bed in a Double) needs every bed
//   of that room blocked AND named; a basic room (Simple n Small / Garden Basic) needs 1 named guest.
// Never shown to teachers. Change the constants below to change the rules.

const C4_DOUBLE_ROOM_TYPES=['rt6','rt7'], C4_DOUBLE_BED_TYPES=['bd1','bd2'], C4_BASIC_TYPES=['rt5'];
const C4_MIN_DOUBLES=2, C4_MIN_BASICS=1;
const C4_TYPES=['c4a','c4b','c4c'];          // Casita 4 whole house + its component rooms
const C4_DISMISS_KEY='casita4_dismissed';
let _c4Dismissed=new Set(),_c4Loaded=false;

function c4Named(reg){return (reg.guests||[]).filter(g=>g&&String(g.name||'').trim()).length;}
function c4BedBase(room){return String(room).replace(/\s*-?\s*[a-d]$/i,'');}
function c4Counts(bk){
  // named guests per blocked room of this retreat
  const named={};
  AppData.regs.filter(r=>r.bookingId===bk.id&&!r.cancelled).forEach(r=>{named[r.room]=(named[r.room]||0)+c4Named(r);});
  let doubles=0,basics=0;
  const bedGroups={};
  (bk.blockedRooms||[]).forEach(room=>{
    const rt=AppData.roomTypes.find(t=>(t.rooms||[]).includes(room));
    if(!rt)return;
    if(C4_DOUBLE_ROOM_TYPES.includes(rt.id)){if((named[room]||0)>=2)doubles++;}
    else if(C4_BASIC_TYPES.includes(rt.id)){if((named[room]||0)>=1)basics++;}
    else if(C4_DOUBLE_BED_TYPES.includes(rt.id)){
      const g=bedGroups[c4BedBase(room)]=bedGroups[c4BedBase(room)]||{beds:0,named:0};
      g.beds++;if((named[room]||0)>=1)g.named++;
    }
  });
  Object.values(bedGroups).forEach(g=>{if(g.beds>=2&&g.named===g.beds)doubles++;});
  return {doubles,basics};
}
function c4Available(bk){
  if(typeof _freeRoomsCountForNotif!=='function')return false;
  return C4_TYPES.every(id=>{
    const rt=AppData.roomTypes.find(t=>t.id===id);if(!rt)return false;
    return _freeRoomsCountForNotif(id,bk.startDate,bk.endDate)===(rt.rooms||[]).length;
  });
}
function c4Alerts(){
  const today=new Date().toISOString().slice(0,10);
  const c4Rooms=new Set(C4_TYPES.flatMap(id=>((AppData.roomTypes.find(t=>t.id===id)||{}).rooms)||[]));
  return AppData.bookings.filter(bk=>{
    if(bk.status==='cancelled'||(bk.flags||[]).includes('archived')||bk.bookingType==='room_only')return false;
    if(!bk.startDate||!bk.endDate||bk.endDate.slice(0,10)<today)return false;
    if(_c4Dismissed.has(bk.id))return false;
    if((bk.blockedRooms||[]).some(r=>c4Rooms.has(r)))return false;      // already has Casita 4
    const c=c4Counts(bk);
    if(c.doubles<C4_MIN_DOUBLES||c.basics<C4_MIN_BASICS)return false;
    return c4Available(bk);
  }).sort((a,b)=>a.startDate.localeCompare(b.startDate));
}
async function c4Load(){
  try{
    const {data}=await db.from('app_store').select('value').eq('key',C4_DISMISS_KEY).maybeSingle();
    if(data&&Array.isArray(data.value))_c4Dismissed=new Set(data.value);
  }catch(e){}
  _c4Loaded=true;
}
async function c4Dismiss(bkId){
  _c4Dismissed.add(bkId);
  c4Render();
  try{await db.from('app_store').upsert({key:C4_DISMISS_KEY,value:[..._c4Dismissed],updated_at:new Date().toISOString()});}catch(e){}
}
function c4Esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function c4IsTeacherView(){try{return !!(typeof IS_TEACHER_MODE!=='undefined'&&IS_TEACHER_MODE&&!document.body.classList.contains('admin-preview'));}catch(e){return false;}}
function c4Render(){
  const hosts=['tab-venues','tab-roomcal'].map(id=>document.getElementById(id)).filter(Boolean);
  hosts.forEach(h=>h.querySelector('.c4-alert')?.remove());
  if(c4IsTeacherView()||!hosts.length||typeof AppData==='undefined'||!AppData.bookings)return;
  let list=[];try{list=c4Alerts();}catch(e){return;}
  if(!list.length)return;
  const fmt=d=>{try{return fmtDate(d);}catch(e){return d;}};
  const html=list.map(bk=>{
    const c=c4Counts(bk),name=bk.leaderName||bk.retreatName||'Retreat';
    return `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:6px 0">
      <span style="font-size:15px">🏠</span>
      <span style="flex:1;min-width:240px;font-size:13px;color:#78350f;font-weight:600"><b>${c4Esc(name)}</b> has ${c.doubles} double rooms and ${c.basics} basic room${c.basics>1?'s':''} filled with names, so those guests can fit in <b>Casita 4</b> (2 doubles + 1 basic), and Casita 4 is available ${c4Esc(fmt(bk.startDate))} to ${c4Esc(fmt(bk.endDate))}.</span>
      <button type="button" onclick="openBookingFromNotif('${c4Esc(bk.id)}')" style="padding:5px 12px;font-size:12px;font-weight:700;border:1.5px solid #b45309;color:#b45309;background:#fff;border-radius:8px;cursor:pointer">Open retreat</button>
      <button type="button" onclick="c4Dismiss('${c4Esc(bk.id)}')" style="padding:5px 12px;font-size:12px;font-weight:600;border:1.5px solid #d6c4a1;color:#78350f;background:#fff;border-radius:8px;cursor:pointer">Dismiss</button></div>`;
  }).join('');
  // More than 3 alerts: show a one-line summary, expand to the list (remembered in this browser)
  let open=true;
  if(list.length>3){try{open=localStorage.getItem('c4_alert_open')==='1';}catch(e){open=false;}}
  const summary=list.length>3
    ?`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="flex:1;min-width:240px;font-size:13px;color:#78350f;font-weight:700">🏠 Casita 4 is available for ${list.length} retreats whose people fit in it.</span><button type="button" onclick="c4Toggle()" style="padding:5px 12px;font-size:12px;font-weight:700;border:1.5px solid #b45309;color:#b45309;background:#fff;border-radius:8px;cursor:pointer">${open?'Hide list':'Show list'}</button></div>`
    :'';
  hosts.forEach(h=>{
    const el=document.createElement('div');el.className='c4-alert';
    el.style.cssText='margin:10px 16px 0;padding:8px 14px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px';
    el.innerHTML=`<div style="font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#92400e">Admin alert · Casita 4</div>${summary}${open?`<div style="max-height:260px;overflow-y:auto">${html}</div>`:''}`;
    h.insertBefore(el,h.firstChild);
  });
}
function c4Toggle(){
  try{localStorage.setItem('c4_alert_open',localStorage.getItem('c4_alert_open')==='1'?'0':'1');}catch(e){}
  c4Render();
}
(function(){
  ['venBuild','rcBuild'].forEach(n=>{
    const f=window[n];if(typeof f!=='function')return;
    window[n]=function(){const r=f.apply(this,arguments);try{if(_c4Loaded)c4Render();}catch(e){}return r;};
  });
  c4Load().then(()=>{try{c4Render();}catch(e){}});
})();
