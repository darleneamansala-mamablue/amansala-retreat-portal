// ===== driver-portal.js — Driver login + ride confirmation =====
// Loaded as a classic script; shares global scope (same pattern as cb-portal-sync.js).
// Fully separate, additive system for Irving & Salamon — must never modify or
// interfere with the existing staff login (admin-staff.js) or teacher login
// (teacher-portal.js) mechanisms. Mirrors the staff-login pattern structurally
// but lives in its own storage keys and its own login/session functions.

// ===== DRIVER ACCOUNTS =====
const DEF_DRIVERS=[
  {id:'drv_irving',name:'Irving',username:'irving',password:'irving2026',active:true},
  {id:'drv_salamon',name:'Salamon',username:'salamon',password:'salamon2026',active:true},
];
let driverAccounts=[];
let currentDriverSession=null;
let driverConfirmations={};

function loadDrivers(){
  const raw=localStorage.getItem('amansala_drivers');
  if(raw){try{driverAccounts=JSON.parse(raw);}catch{driverAccounts=DEF_DRIVERS.map(d=>({...d}));}}
  else{driverAccounts=DEF_DRIVERS.map(d=>({...d}));localStorage.setItem('amansala_drivers',JSON.stringify(driverAccounts));}
  driverAccounts.forEach(d=>{if(d.active===undefined)d.active=true;});
  if(!driverAccounts.length)driverAccounts=DEF_DRIVERS.map(d=>({...d}));
}
function saveDrivers(){
  localStorage.setItem('amansala_drivers',JSON.stringify(driverAccounts));
  (async()=>{try{await db.from('app_store').upsert({key:'driverAccounts',value:driverAccounts,updated_at:new Date().toISOString()});}catch(e){console.warn('Driver account sync failed:',e);}})();
}

// ===== RIDE CONFIRMATIONS =====
// Keyed by `${transportSubmissionId}_${arrival|departure}` -> {driver,confirmedAt}
function loadDriverConfirmationsLocal(){
  const raw=localStorage.getItem('amansala_driver_confirmations');
  if(raw){try{driverConfirmations=JSON.parse(raw);}catch{driverConfirmations={};}}
}
async function syncDriverConfirmationsFromSupabase(){
  try{
    const{data}=await db.from('app_store').select('value').eq('key','driverConfirmations').maybeSingle();
    if(data?.value){driverConfirmations={...driverConfirmations,...data.value};localStorage.setItem('amansala_driver_confirmations',JSON.stringify(driverConfirmations));}
  }catch(e){}
}
function saveDriverConfirmations(){
  localStorage.setItem('amansala_driver_confirmations',JSON.stringify(driverConfirmations));
  (async()=>{try{await db.from('app_store').upsert({key:'driverConfirmations',value:driverConfirmations,updated_at:new Date().toISOString()});}catch(e){console.warn('Driver confirmation sync failed:',e);}})();
}
function drTripKey(t){return t.id+'_'+t._kind;}

// ===== MODE DETECTION (mirrors IS_TEACHER_MODE/IS_EVENT_MODE pattern) =====
const IS_DRIVER_MODE=new URLSearchParams(window.location.search).get('mode')==='driver'||sessionStorage.getItem('ama_driver_mode')==='1'||(!localStorage.getItem('ama_admin_device')&&localStorage.getItem('ama_driver_persist')==='1');

function getDriverSession(){
  if(currentDriverSession)return currentDriverSession;
  const raw=sessionStorage.getItem('amansala_driver_session');
  if(raw){try{currentDriverSession=JSON.parse(raw);}catch{currentDriverSession=null;}}
  return currentDriverSession;
}

function driverLoginSubmit(){
  const username=document.getElementById('driverLoginUser').value.trim().toLowerCase();
  const password=document.getElementById('driverLoginPass').value;
  const errEl=document.getElementById('driverLoginErr');
  errEl.textContent='';
  if(!username||!password){errEl.textContent='Please enter your username and password.';return;}
  function tryLogin(){
    return driverAccounts.find(d=>d.active&&d.username.toLowerCase()===username&&d.password===password)
      ||DEF_DRIVERS.find(d=>d.username===username&&d.password===password)||null;
  }
  let account=tryLogin();
  if(!account){
    errEl.textContent='Checking credentials…';
    db.from('app_store').select('value').eq('key','driverAccounts').maybeSingle().then(({data})=>{
      if(data?.value&&Array.isArray(data.value)&&data.value.length){
        const seen=new Map();
        data.value.forEach(d=>d.username&&seen.set(d.username.toLowerCase(),d));
        driverAccounts.forEach(d=>{if(d.username&&!seen.has(d.username.toLowerCase()))seen.set(d.username.toLowerCase(),d);});
        driverAccounts=[...seen.values()];
        localStorage.setItem('amansala_drivers',JSON.stringify(driverAccounts));
      }
      account=tryLogin();
      if(!account){errEl.textContent='Incorrect username or password.';return;}
      errEl.textContent='';
      driverLoginComplete(account);
    }).catch(()=>{errEl.textContent='Incorrect username or password.';});
    return;
  }
  driverLoginComplete(account);
}

function driverLoginComplete(account){
  const session={id:account.id,name:account.name,username:account.username.toLowerCase()};
  sessionStorage.setItem('amansala_driver_session',JSON.stringify(session));
  sessionStorage.setItem('ama_driver_mode','1');
  localStorage.setItem('ama_driver_persist','1');
  currentDriverSession=session;
  const ov=document.getElementById('driverLoginOverlay');if(ov)ov.style.display='none';
  const dash=document.getElementById('driverDashboard');if(dash)dash.style.display='block';
  drInitDashboard();
}
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&document.getElementById('driverLoginOverlay')?.style.display!=='none'&&IS_DRIVER_MODE)driverLoginSubmit();});

function driverLogout(){
  if(!confirm('Sign out?'))return;
  sessionStorage.removeItem('amansala_driver_session');
  sessionStorage.removeItem('ama_driver_mode');
  localStorage.removeItem('ama_driver_persist');
  currentDriverSession=null;
  location.href=location.pathname;
}

// ===== BOOTSTRAP =====
function initDriverMode(){
  if(!IS_DRIVER_MODE)return;
  loadDrivers();
  loadDriverConfirmationsLocal();
  document.querySelectorAll('.tab-btn').forEach(b=>b.style.pointerEvents='none');
  const session=getDriverSession();
  if(session){
    const ov=document.getElementById('driverLoginOverlay');if(ov)ov.style.display='none';
    const dash=document.getElementById('driverDashboard');if(dash)dash.style.display='block';
    drInitDashboard();
    return;
  }
  const ov=document.getElementById('driverLoginOverlay');if(ov)ov.style.display='flex';
  setTimeout(()=>document.getElementById('driverLoginUser')?.focus(),120);
}

// ===== DASHBOARD =====
function drInitDashboard(){
  const root=document.getElementById('driverDashboard');if(!root)return;
  const session=getDriverSession();if(!session)return;
  const today=fmtISO(new Date());
  root.innerHTML=`
    <div style="max-width:560px;margin:0 auto;padding:24px 16px 60px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700;color:#2d6a6a">Hi, ${session.name}</div>
          <div style="font-size:11px;color:#8a7e74;letter-spacing:1px;text-transform:uppercase">Driver Portal</div>
        </div>
        <button onclick="driverLogout()" style="background:none;border:1.5px solid #c8bfb5;color:#5a5048;padding:7px 16px;border-radius:8px;font-family:'Jost',sans-serif;font-size:12px;cursor:pointer">Sign Out</button>
      </div>
      <input type="date" id="drDate" value="${today}" onchange="drRenderList()" style="width:100%;box-sizing:border-box;padding:11px 14px;border:1.5px solid #c8bfb5;border-radius:9px;font-family:'Jost',sans-serif;font-size:14px;margin-bottom:18px;background:#fff;color:#2d2520">
      <div id="drListMeta" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#8a7e74;margin-bottom:10px"></div>
      <div id="drList"></div>
    </div>`;
  drRenderList();
  // Pull the latest ride + confirmation data from Supabase, then refresh the view
  Promise.all([syncTransportFromSupabase(),syncDriverConfirmationsFromSupabase()]).then(()=>drRenderList());
}

function drRenderList(){
  const session=getDriverSession();if(!session)return;
  const dateEl=document.getElementById('drDate');
  const date=dateEl?dateEl.value:fmtISO(new Date());
  const listEl=document.getElementById('drList');
  const metaEl=document.getElementById('drListMeta');
  if(!listEl)return;
  const{salamon,irving}=trComputeDriverAssignments(date);
  const trips=session.name==='Irving'?irving:salamon;
  const dt=new Date(date+'T00:00:00');
  const MNTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateLabel=MNTHS[dt.getMonth()]+' '+dt.getDate()+', '+dt.getFullYear();
  if(metaEl)metaEl.textContent=`${dateLabel} · ${trips.length} trip${trips.length!==1?'s':''}`;

  if(!trips.length){
    listEl.innerHTML=`<div style="text-align:center;color:#8a7e74;font-size:13px;padding:40px 0;background:#fff;border:1px solid #e8dfd4;border-radius:12px">No trips assigned for ${dateLabel}.</div>`;
    return;
  }

  listEl.innerHTML=trips.map(t=>{
    const key=drTripKey(t);
    const conf=driverConfirmations[key];
    const isArr=t._kind==='arrival';
    const time=isArr?t.arrivalTime:t.departureTime;
    const airport=isArr?t.arrivalAirport:t.departureAirport;
    const confTime=conf?new Date(conf.confirmedAt).toTimeString().slice(0,5):'';
    return `<div style="background:#fff;border:1.5px solid ${conf?'#86efac':'#e8dfd4'};border-radius:12px;padding:16px 18px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-weight:800;color:${isArr?'#0e9494':'#d97706'};font-size:12.5px;letter-spacing:.3px">${isArr?'↓ ARRIVAL':'↑ DEPARTURE'} · ${airport==='cancun'?'CUN':'TQO'}</div>
          <div style="font-size:20px;font-weight:800;color:#2d2520;margin-top:4px">${tsFmt(time)}</div>
        </div>
        ${conf
          ?`<div style="font-size:11.5px;font-weight:700;color:#15803d;background:#dcfce7;border-radius:99px;padding:6px 14px;white-space:nowrap">&#10003; Confirmed ${tsFmt(confTime)}</div>`
          :`<button onclick="drConfirmTrip('${key}')" style="background:#2d6a6a;color:#fff;border:none;padding:10px 20px;border-radius:9px;font-family:'Jost',sans-serif;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Confirm</button>`}
      </div>
      <div style="margin-top:12px;font-size:14px;color:#2d2520;font-weight:600">${t.firstName} ${t.lastName}</div>
      <div style="font-size:12px;color:#8a7e74;margin-top:3px">${t.retreatLabel}${t.room?' · Room '+t.room:''}${t.flightNumber?' · Flight '+t.flightNumber:''}</div>
      ${t.note?`<div style="font-size:12px;color:#15803d;font-weight:700;margin-top:8px">${t.note}</div>`:''}
    </div>`;
  }).join('');
}

function drConfirmTrip(key){
  const session=getDriverSession();if(!session)return;
  driverConfirmations[key]={driver:session.name,confirmedAt:new Date().toISOString()};
  saveDriverConfirmations();
  drRenderList();
}
