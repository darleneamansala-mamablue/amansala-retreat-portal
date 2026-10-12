// ===== casa-shanti-alert.js — admin-only "this teacher has enough rooms to take Casa Shanti" alert =====
// Loaded as a classic script AFTER venues.js and retreat-builder.js; shares global scope. Standalone: no other module is edited.
// Shows an amber banner at the top of BOTH the Venues tab and the Room Calendar tab (same alert, same dismiss: dismissing it in
// one hides it in the other) when a retreat has at least 3 double rooms AND at least 3 king rooms blocked, Casa Shanti has not
// been blocked for it, and Casa Shanti is actually free for the retreat's dates. Never shown to teachers.
// Counting rules (change the constants below): a "double" = a blocked Double / Beachview Double room, or every two blocked beds
// of a Bed-in-a-Double; a "king" = a blocked Beachfront King, Superior, Garden Plus or Garden room (all king-bed rooms).
// "Free" = Casa Shanti and all of its component rooms (Shanti King 1-3, Shanti 2 Bed) are unused by any other retreat or
// reservation overlapping those dates (same rule the sold-out notifications use: _freeRoomsCountForNotif).

const CS_DOUBLE_ROOM_TYPES=['rt6','rt7'], CS_DOUBLE_BED_TYPES=['bd1','bd2'], CS_KING_TYPES=['rt1','rt2','rt3','rt4'];
const CS_MIN_DOUBLES=3, CS_MIN_KINGS=3;
const CS_TYPES=['csh1','csh2','csh3'];
const CS_DISMISS_KEY='casa_shanti_dismissed';
let _csDismissed=new Set(),_csLoaded=false;

function csCounts(bk){
  let doubles=0,beds=0,kings=0;
  (bk.blockedRooms||[]).forEach(room=>{
    const rt=AppData.roomTypes.find(t=>(t.rooms||[]).includes(room));
    if(!rt)return;
    if(CS_DOUBLE_ROOM_TYPES.includes(rt.id))doubles++;
    else if(CS_DOUBLE_BED_TYPES.includes(rt.id))beds++;
    else if(CS_KING_TYPES.includes(rt.id))kings++;
  });
  return {doubles:doubles+Math.floor(beds/2),kings};
}
function csAvailable(bk){
  if(typeof _freeRoomsCountForNotif!=='function')return false;
  return CS_TYPES.every(id=>{
    const rt=AppData.roomTypes.find(t=>t.id===id);if(!rt)return false;
    return _freeRoomsCountForNotif(id,bk.startDate,bk.endDate)===(rt.rooms||[]).length;
  });
}
function csAlerts(){
  const today=new Date().toISOString().slice(0,10);
  const csRooms=new Set(CS_TYPES.flatMap(id=>((AppData.roomTypes.find(t=>t.id===id)||{}).rooms)||[]));
  return AppData.bookings.filter(bk=>{
    if(bk.status==='cancelled'||(bk.flags||[]).includes('archived')||bk.bookingType==='room_only')return false;
    if(!bk.startDate||!bk.endDate||bk.endDate.slice(0,10)<today)return false;
    if(_csDismissed.has(bk.id))return false;
    if((bk.blockedRooms||[]).some(r=>csRooms.has(r)))return false;      // already has Casa Shanti
    const c=csCounts(bk);
    if(c.doubles<CS_MIN_DOUBLES||c.kings<CS_MIN_KINGS)return false;
    return csAvailable(bk);
  }).sort((a,b)=>a.startDate.localeCompare(b.startDate));
}
async function csLoad(){
  try{
    const {data}=await db.from('app_store').select('value').eq('key',CS_DISMISS_KEY).maybeSingle();
    if(data&&Array.isArray(data.value))_csDismissed=new Set(data.value);
  }catch(e){}
  _csLoaded=true;
}
async function csDismiss(bkId){
  _csDismissed.add(bkId);
  csRender();
  try{await db.from('app_store').upsert({key:CS_DISMISS_KEY,value:[..._csDismissed],updated_at:new Date().toISOString()});}catch(e){}
}
function csEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function csIsTeacherView(){try{return !!(typeof IS_TEACHER_MODE!=='undefined'&&IS_TEACHER_MODE&&!document.body.classList.contains('admin-preview'));}catch(e){return false;}}
function csRender(){
  const hosts=['tab-venues','tab-roomcal'].map(id=>document.getElementById(id)).filter(Boolean);
  hosts.forEach(h=>h.querySelector('.cs-alert')?.remove());
  if(csIsTeacherView()||!hosts.length||typeof AppData==='undefined'||!AppData.bookings)return;
  let list=[];try{list=csAlerts();}catch(e){return;}
  if(!list.length)return;
  const fmt=d=>{try{return fmtDate(d);}catch(e){return d;}};
  const html=list.map(bk=>{
    const c=csCounts(bk),name=bk.leaderName||bk.retreatName||'Retreat';
    return `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:6px 0">
      <span style="font-size:15px">🏡</span>
      <span style="flex:1;min-width:240px;font-size:13px;color:#78350f;font-weight:600"><b>${csEsc(name)}</b> has enough rooms to take <b>Casa Shanti</b>: ${c.doubles} double rooms + ${c.kings} king rooms, and Casa Shanti is available ${csEsc(fmt(bk.startDate))} – ${csEsc(fmt(bk.endDate))}.</span>
      <button type="button" onclick="openBookingFromNotif('${csEsc(bk.id)}')" style="padding:5px 12px;font-size:12px;font-weight:700;border:1.5px solid #b45309;color:#b45309;background:#fff;border-radius:8px;cursor:pointer">Open retreat</button>
      <button type="button" onclick="csDismiss('${csEsc(bk.id)}')" style="padding:5px 12px;font-size:12px;font-weight:600;border:1.5px solid #d6c4a1;color:#78350f;background:#fff;border-radius:8px;cursor:pointer">Dismiss</button></div>`;
  }).join('');
  // More than 3 alerts: show a one-line summary, expand to the list (remembered in this browser)
  let open=true;
  if(list.length>3){try{open=localStorage.getItem('cs_alert_open')==='1';}catch(e){open=false;}}
  const summary=list.length>3
    ?`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="flex:1;min-width:240px;font-size:13px;color:#78350f;font-weight:700">🏡 Casa Shanti is available for ${list.length} retreats that have enough rooms to take it.</span><button type="button" onclick="csToggle()" style="padding:5px 12px;font-size:12px;font-weight:700;border:1.5px solid #b45309;color:#b45309;background:#fff;border-radius:8px;cursor:pointer">${open?'Hide list':'Show list'}</button></div>`
    :'';
  hosts.forEach(h=>{
    const el=document.createElement('div');el.className='cs-alert';
    el.style.cssText='margin:10px 16px 0;padding:8px 14px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px';
    el.innerHTML=`<div style="font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#92400e">Admin alert · Casa Shanti</div>${summary}${open?`<div style="max-height:260px;overflow-y:auto">${html}</div>`:''}`;
    h.insertBefore(el,h.firstChild);
  });
}
function csToggle(){
  try{localStorage.setItem('cs_alert_open',localStorage.getItem('cs_alert_open')==='1'?'0':'1');}catch(e){}
  csRender();
}
(function(){
  ['venBuild','rcBuild'].forEach(n=>{
    const f=window[n];if(typeof f!=='function')return;
    window[n]=function(){const r=f.apply(this,arguments);try{if(_csLoaded)csRender();}catch(e){}return r;};
  });
  csLoad().then(()=>{try{csRender();}catch(e){}});
})();
