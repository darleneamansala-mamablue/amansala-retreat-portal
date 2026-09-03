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
// Sectioned per Darlene's spec: Today / Tomorrow / Upcoming / Requiring
// Confirmation / Recently Changed / Completed — a trip can appear in more
// than one section (e.g. today's trip that also needs confirmation), each
// section is a different lens on the same underlying trip list, not a
// strict partition.
let drPendingDeclineKey=null;

function drInitDashboard(){
  const root=document.getElementById('driverDashboard');if(!root)return;
  const session=getDriverSession();if(!session)return;
  root.innerHTML=`
    <div style="max-width:600px;margin:0 auto;padding:22px 14px 60px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700;color:#2d6a6a">Hi, ${session.name}</div>
          <div style="font-size:11px;color:#8a7e74;letter-spacing:1px;text-transform:uppercase">Driver Portal</div>
        </div>
        <button onclick="driverLogout()" style="background:none;border:1.5px solid #c8bfb5;color:#5a5048;padding:7px 16px;border-radius:8px;font-family:'Jost',sans-serif;font-size:12px;cursor:pointer">Sign Out</button>
      </div>
      <div id="drSections"></div>
    </div>
    <div id="drDeclineModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;align-items:center;justify-content:center;padding:20px">
      <div style="background:#fff;border-radius:14px;padding:22px;max-width:380px;width:100%;box-sizing:border-box">
        <div style="font-weight:800;font-size:15px;color:#2d2520;margin-bottom:8px">Decline This Trip?</div>
        <div style="font-size:12.5px;color:#8a7e74;margin-bottom:12px">Please tell us why — this is required so we can reassign it.</div>
        <textarea id="drDeclineReason" rows="3" style="width:100%;box-sizing:border-box;padding:10px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:'Jost',sans-serif;font-size:13px;margin-bottom:12px" placeholder="Reason for declining…"></textarea>
        <div id="drDeclineErr" style="color:#dc2626;font-size:12px;margin-bottom:8px;display:none">Please enter a reason.</div>
        <div style="display:flex;gap:8px">
          <button onclick="drCloseDeclineModal()" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #c8bfb5;background:#fff;cursor:pointer;font-family:'Jost',sans-serif;font-size:13px">Cancel</button>
          <button onclick="drSubmitDecline()" style="flex:1;padding:10px;border-radius:8px;border:none;background:#dc2626;color:#fff;cursor:pointer;font-family:'Jost',sans-serif;font-size:13px;font-weight:700">Decline</button>
        </div>
      </div>
    </div>
    <div id="drGroupModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;align-items:center;justify-content:center;padding:20px">
      <div style="background:#fff;border-radius:14px;padding:22px;max-width:380px;width:100%;box-sizing:border-box">
        <div style="font-weight:800;font-size:15px;color:#2d2520;margin-bottom:8px">Confirm This Group?</div>
        <div id="drGroupList" style="font-size:12.5px;color:#5a5048;margin-bottom:14px"></div>
        <div style="display:flex;gap:8px">
          <button onclick="drCloseGroupModal()" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #c8bfb5;background:#fff;cursor:pointer;font-family:'Jost',sans-serif;font-size:13px">Cancel</button>
          <button onclick="drSubmitGroupConfirm()" style="flex:1;padding:10px;border-radius:8px;border:none;background:#2d6a6a;color:#fff;cursor:pointer;font-family:'Jost',sans-serif;font-size:13px;font-weight:700">Confirm All</button>
        </div>
      </div>
    </div>
    <div id="drBulkModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;align-items:center;justify-content:center;padding:20px">
      <div style="background:#fff;border-radius:14px;padding:22px;max-width:380px;width:100%;box-sizing:border-box">
        <div style="font-weight:800;font-size:15px;color:#2d2520;margin-bottom:8px">Confirm All Trips For This Date?</div>
        <div id="drBulkList" style="font-size:12.5px;color:#5a5048;margin-bottom:14px;max-height:240px;overflow-y:auto"></div>
        <div style="display:flex;gap:8px">
          <button onclick="drCloseBulkModal()" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #c8bfb5;background:#fff;cursor:pointer;font-family:'Jost',sans-serif;font-size:13px">Cancel</button>
          <button onclick="drSubmitBulkConfirm()" style="flex:1;padding:10px;border-radius:8px;border:none;background:#2d6a6a;color:#fff;cursor:pointer;font-family:'Jost',sans-serif;font-size:13px;font-weight:700">Confirm All</button>
        </div>
      </div>
    </div>`;
  // Sync confirmations from Supabase BEFORE the first render — rendering
  // first (against an empty local driverConfirmations) would fabricate
  // fresh 'pending' records for every trip, immediately flip them to
  // 'viewed', and save that back — clobbering any real confirmed/declined/
  // reconfirm history already sitting in Supabase from another device.
  // Confirmations sync first (so trDrvCheckReconfirm has real prior state
  // to diff against), then transport data, then render exactly once.
  document.getElementById('drSections').innerHTML='<div style="text-align:center;color:#8a7e74;font-size:13px;padding:40px 0">Loading your trips…</div>';
  (async()=>{
    await syncDriverConfirmationsFromSupabase();
    await syncTransportFromSupabase();
    drRenderSections();
  })();
}

function drGatherAll(session){
  // 3 days back covers "recently changed" and completed trips just past;
  // 45 days forward covers "upcoming" — generous enough for retreat-length
  // stays without pulling in the entire future calendar.
  return trDrvGatherTrips(session.id,3,45);
}

function drCardHtml(t,session){
  const key=drTripKey(t);
  const rec=t._drvRec||driverConfirmations[key];
  const status=rec?.status||'pending';
  const st=TR_DRV_STATUS[status]||TR_DRV_STATUS.pending;
  const isArr=t._kind==='arrival';
  const time=isArr?t.arrivalTime:t.departureTime;
  const airport=isArr?t.arrivalAirport:t.departureAirport;
  const dt=new Date(t._date+'T00:00:00');
  const MNTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateLabel=MNTHS[dt.getMonth()]+' '+dt.getDate();
  const canAct=status==='pending'||status==='viewed'||status==='reconfirm';
  const statusBadge=`<div style="font-size:11px;font-weight:700;color:${st.color};background:${st.bg};border:1px solid ${st.border};border-radius:99px;padding:4px 12px;white-space:nowrap">${st.label}</div>`;
  const confirmedLine=(status==='confirmed'||status==='completed')&&rec?.confirmedAt
    ?`<div style="margin-top:10px;font-size:12px;color:#15803d"><b>${TR_DRV_STATUS.confirmed.label}</b><br>${rec.confirmedBy||session.name} · ${trFmtTulum(rec.confirmedAt)}</div>`:'';
  const changeMsg=(status==='reconfirm'&&rec?.changeMessage)
    ?`<div style="margin-top:10px;font-size:12.5px;color:#c2410c;font-weight:700;background:#ffedd5;border-radius:8px;padding:8px 10px">${rec.changeMessage}</div>`:'';
  const declineMsg=(status==='declined'&&rec?.declineReason)
    ?`<div style="margin-top:10px;font-size:12px;color:#dc2626">Declined: ${rec.declineReason}</div>`:'';
  const actions=canAct?`<div style="display:flex;gap:8px;margin-top:12px">
      <button onclick="drConfirmOne('${key}')" style="flex:1;background:#2d6a6a;color:#fff;border:none;padding:11px 14px;border-radius:9px;font-family:'Jost',sans-serif;font-size:13px;font-weight:700;cursor:pointer">Confirm I Received This Assignment</button>
      <button onclick="drShowDeclineModal('${key}')" style="background:#fff;color:#dc2626;border:1.5px solid #fca5a5;padding:11px 14px;border-radius:9px;font-family:'Jost',sans-serif;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Decline</button>
    </div>`:'';
  const groupBtn=(t._pairKey&&canAct)?`<button onclick="drShowGroupModal('${t._pairKey}')" style="margin-top:8px;width:100%;background:#fff;color:#2d6a6a;border:1.5px dashed #2d6a6a;padding:9px 14px;border-radius:9px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer">Confirm Round-Trip Group</button>`:'';
  return`<div style="background:#fff;border:1.5px solid ${st.border};border-radius:12px;padding:16px 18px;margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
      <div>
        <div style="font-weight:800;color:${isArr?'#0e9494':'#d97706'};font-size:12.5px;letter-spacing:.3px">${isArr?'↓ ARRIVAL':'↑ DEPARTURE'} · ${airport==='cancun'?'CUN':'TQO'} · ${dateLabel}</div>
        <div style="font-size:20px;font-weight:800;color:#2d2520;margin-top:4px">${tsFmt(time)}</div>
      </div>
      ${statusBadge}
    </div>
    <div style="margin-top:12px;font-size:14px;color:#2d2520;font-weight:600">${t.firstName} ${t.lastName}</div>
    <div style="font-size:12px;color:#8a7e74;margin-top:3px">${t.retreatLabel}${t.room?' · Room '+t.room:''}${t.flightNumber?' · Flight '+t.flightNumber:''}</div>
    ${t.note?`<div style="font-size:12px;color:#15803d;font-weight:700;margin-top:8px">${t.note}</div>`:''}
    ${changeMsg}${confirmedLine}${declineMsg}${actions}${groupBtn}
  </div>`;
}

function drRenderSections(){
  const session=getDriverSession();if(!session)return;
  const root=document.getElementById('drSections');if(!root)return;
  const trips=drGatherAll(session);
  const today=fmtISO(new Date());
  const tomorrow=fmtISO(new Date(Date.now()+86400000));

  // Viewing marks 'pending' -> 'viewed' — never confirms. Batch any changes
  // into one save instead of one per trip.
  let viewedChanged=false;
  trips.forEach(t=>{
    const rec=t._drvRec;
    if(rec&&rec.status==='pending'){
      rec.status='viewed';rec.viewedAt=new Date().toISOString();
      trDrvPushHistory(rec,'viewed',session.name,null);
      viewedChanged=true;
    }
  });
  if(viewedChanged)saveDriverConfirmations();

  const activeStatus=t=>{const s=t._drvRec?.status;return s!=='completed'&&s!=='cancelled';};
  const requiring=trips.filter(t=>['pending','viewed','reconfirm'].includes(t._drvRec?.status))
    .sort((a,b)=>(a._date+((a.arrivalTime||a.departureTime)||'')).localeCompare(b._date+((b.arrivalTime||b.departureTime)||'')));
  const changed=trips.filter(t=>t._drvRec?.status==='reconfirm')
    .sort((a,b)=>(b._drvRec.changedAt||'').localeCompare(a._drvRec.changedAt||''));
  const completed=trips.filter(t=>t._drvRec?.status==='completed').sort((a,b)=>b._date.localeCompare(a._date));
  const cancelled=trips.filter(t=>t._drvRec?.status==='cancelled').sort((a,b)=>b._date.localeCompare(a._date));
  const todays=trips.filter(t=>t._date===today&&activeStatus(t));
  const tomorrows=trips.filter(t=>t._date===tomorrow&&activeStatus(t));
  const upcoming=trips.filter(t=>t._date>tomorrow&&activeStatus(t));

  const section=(title,list,opts)=>{
    if(!list.length)return'';
    opts=opts||{};
    const bulkBtn=(opts.forDate&&list.some(t=>['pending','viewed','reconfirm'].includes(t._drvRec?.status)))
      ?`<button onclick="drShowBulkModal('${opts.forDate}')" style="font-size:11.5px;font-weight:700;padding:6px 14px;border-radius:8px;border:none;background:#2d6a6a;color:#fff;cursor:pointer;white-space:nowrap">Confirm All Visible</button>`:'';
    return`<div style="margin-bottom:22px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#8a7e74">${title} <span style="background:#e8dfd4;color:#5a5048;border-radius:99px;padding:1px 8px;font-size:11px;margin-left:4px">${list.length}</span></div>
        ${bulkBtn}
      </div>
      ${list.map(t=>drCardHtml(t,session)).join('')}
    </div>`;
  };

  const html=
    section('⚠ Requiring Confirmation',requiring)+
    section("Today's Trips",todays,{forDate:today})+
    section("Tomorrow's Trips",tomorrows,{forDate:tomorrow})+
    section('Upcoming Trips',upcoming)+
    section('🔄 Recently Changed',changed)+
    section('✓ Completed Trips',completed)+
    section('✕ Cancelled Trips',cancelled);
  root.innerHTML=html||`<div style="text-align:center;color:#8a7e74;font-size:13px;padding:40px 0;background:#fff;border:1px solid #e8dfd4;border-radius:12px">No trips assigned right now.</div>`;
}

// ===== CONFIRM / DECLINE ACTIONS =====
// A driver can only ever act on driverConfirmations entries whose driverId
// matches their own session — enforced here, not just by what's rendered,
// so a driver can never confirm another driver's assignment even by
// crafting the call directly.
function drOwnsKey(key,session){
  const rec=driverConfirmations[key];
  return!!rec&&rec.driverId===session.id;
}
function drConfirmOne(key){
  const session=getDriverSession();if(!session)return;
  if(!drOwnsKey(key,session)){showToast&&showToast('This assignment is not yours to confirm.');return;}
  const rec=driverConfirmations[key];
  rec.status='confirmed';
  rec.confirmedAt=new Date().toISOString();
  rec.confirmedBy=session.name;
  rec.confirmedVersion=rec.version;
  trDrvPushHistory(rec,'confirmed',session.name,rec.note||null);
  saveDriverConfirmations();
  drRenderSections();
}
function drShowDeclineModal(key){
  drPendingDeclineKey=key;
  document.getElementById('drDeclineReason').value='';
  document.getElementById('drDeclineErr').style.display='none';
  document.getElementById('drDeclineModal').style.display='flex';
}
function drCloseDeclineModal(){document.getElementById('drDeclineModal').style.display='none';drPendingDeclineKey=null;}
function drSubmitDecline(){
  const session=getDriverSession();if(!session||!drPendingDeclineKey)return;
  const reason=document.getElementById('drDeclineReason').value.trim();
  if(!reason){document.getElementById('drDeclineErr').style.display='block';return;}
  if(!drOwnsKey(drPendingDeclineKey,session)){drCloseDeclineModal();return;}
  const rec=driverConfirmations[drPendingDeclineKey];
  rec.status='declined';
  rec.declineReason=reason;
  rec.declinedAt=new Date().toISOString();
  trDrvPushHistory(rec,'declined',session.name,reason);
  saveDriverConfirmations();
  drCloseDeclineModal();
  drRenderSections();
}
// Round-trip group confirm: t._pairKey points at the arrival leg's key that
// this departure was combined with — confirming the group confirms both
// legs together in one action.
function drShowGroupModal(pairKey){
  const session=getDriverSession();if(!session)return;
  const trips=drGatherAll(session);
  const groupKeys=new Set([pairKey]);
  trips.forEach(t=>{if(t._pairKey===pairKey)groupKeys.add(drTripKey(t));});
  const groupTrips=trips.filter(t=>groupKeys.has(drTripKey(t)));
  document.getElementById('drGroupList').innerHTML=groupTrips.map(t=>{
    const isArr=t._kind==='arrival';const time=isArr?t.arrivalTime:t.departureTime;
    return`<div style="padding:6px 0;border-bottom:1px solid #f0ece4">${isArr?'↓':'↑'} ${tsFmt(time)} — ${t.firstName} ${t.lastName}</div>`;
  }).join('');
  document.getElementById('drGroupModal').dataset.keys=[...groupKeys].join('|');
  document.getElementById('drGroupModal').style.display='flex';
}
function drCloseGroupModal(){document.getElementById('drGroupModal').style.display='none';}
function drSubmitGroupConfirm(){
  const session=getDriverSession();if(!session)return;
  const keys=(document.getElementById('drGroupModal').dataset.keys||'').split('|').filter(Boolean);
  keys.forEach(k=>{
    if(!drOwnsKey(k,session))return;
    const rec=driverConfirmations[k];
    rec.status='confirmed';rec.confirmedAt=new Date().toISOString();rec.confirmedBy=session.name;rec.confirmedVersion=rec.version;
    trDrvPushHistory(rec,'confirmed',session.name,'Confirmed as part of a round-trip group');
  });
  saveDriverConfirmations();
  drCloseGroupModal();
  drRenderSections();
}
// Bulk confirm-all-for-a-date: shows exactly which trips are included
// before committing, per spec.
function drShowBulkModal(dateStr){
  const session=getDriverSession();if(!session)return;
  const trips=drGatherAll(session).filter(t=>t._date===dateStr&&['pending','viewed','reconfirm'].includes(t._drvRec?.status));
  document.getElementById('drBulkList').innerHTML=trips.map(t=>{
    const isArr=t._kind==='arrival';const time=isArr?t.arrivalTime:t.departureTime;
    return`<div style="padding:6px 0;border-bottom:1px solid #f0ece4">${isArr?'↓':'↑'} ${tsFmt(time)} — ${t.firstName} ${t.lastName}</div>`;
  }).join('')||'<div style="color:#8a7e74;font-style:italic">Nothing left to confirm for this date.</div>';
  document.getElementById('drBulkModal').dataset.date=dateStr;
  document.getElementById('drBulkModal').style.display='flex';
}
function drCloseBulkModal(){document.getElementById('drBulkModal').style.display='none';}
function drSubmitBulkConfirm(){
  const session=getDriverSession();if(!session)return;
  const dateStr=document.getElementById('drBulkModal').dataset.date;
  const trips=drGatherAll(session).filter(t=>t._date===dateStr&&['pending','viewed','reconfirm'].includes(t._drvRec?.status));
  trips.forEach(t=>{
    const key=drTripKey(t);
    if(!drOwnsKey(key,session))return;
    const rec=driverConfirmations[key];
    rec.status='confirmed';rec.confirmedAt=new Date().toISOString();rec.confirmedBy=session.name;rec.confirmedVersion=rec.version;
    trDrvPushHistory(rec,'confirmed',session.name,'Confirmed via bulk "Confirm All Visible"');
  });
  saveDriverConfirmations();
  drCloseBulkModal();
  drRenderSections();
}
