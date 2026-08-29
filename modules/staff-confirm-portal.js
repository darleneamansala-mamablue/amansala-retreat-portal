// ===== staff-confirm-portal.js — shared login for instructors/therapists/guides =====
// Loaded as a classic script; shares global scope (same pattern as cb-portal-sync.js).
// Fully separate, additive system, mirroring driver-portal.js structurally — own
// storage keys, own login/session, own dashboard. Must never modify or interfere
// with staff login (admin-staff.js), teacher login (teacher-portal.js), or driver
// login (driver-portal.js) mechanisms.
//
// One login covers everything assigned to that person by NAME across three
// systems: BBC schedule slots (instructor), Spa appointments (therapist), and
// Tour ops (guide/driver) — matched by name, not by domain, so someone like
// Sergio (BBC classes + spa services) sees both under one sign-in. They can only
// see their own hours and confirm/unconfirm them — no financials, no other tabs.

// ===== ACCOUNTS =====
const DEF_STAFF_CONFIRM=[
  {id:'sc_ryan',name:'Ryan',username:'ryan',password:'Tulum123',active:true},
  {id:'sc_adele',name:'Adele',username:'adele',password:'Tulum123',active:true},
  {id:'sc_sergio',name:'Sergio',username:'sergio',password:'Tulum123',active:true},
  {id:'sc_fernando',name:'Fernando',username:'fernando',password:'Tulum123',active:true},
  {id:'sc_kun',name:'Kun',username:'kun',password:'Tulum123',active:true},
  {id:'sc_yolanda',name:'Yolanda',username:'yolanda',password:'Tulum123',active:true},
  {id:'sc_maya',name:'Maya',username:'maya',password:'Tulum123',active:true},
  {id:'sc_kiki',name:'Kiki',username:'kiki',password:'Tulum123',active:true},
  {id:'sc_marco',name:'Marco',username:'marco',password:'Tulum123',active:true},
  {id:'sc_rubi',name:'Rubi',username:'rubi',password:'Tulum123',active:true,isPayrollAdmin:true},
  {id:'sc_rosy',name:'Rosy',username:'rosy',password:'Tulum123',active:true},
  {id:'sc_kike',name:'Kike',username:'kike',password:'Tulum123',active:true},
];
// BBC pay rates per confirmed session — Darlene's spec (2026-08-29). Anything
// not listed here (tours, ceremonies, meals, Opening Circle, Departures) has
// no rate and shows as "no rate set" in payroll rather than being silently
// skipped or paid $0 without explanation.
const BBC_PAY_RATES={
  'yoga':800,'yoga mala':800,'gentle yoga':800,
  'circuit training':1000,'bbc 20':1000,'sculpt & tone':1000,'boxing':1000,'absolution':1000,'pilates':1000,
  'latin grooves':1000,'afrobeats':1000,'bollywood':1000,'salsa':1000,'dance':1000,
  'morning beach walk':500,
};
function bbcPayRateFor(activity){
  if(!activity)return null;
  const a=activity.trim().toLowerCase();
  if(a.indexOf('grand rising')===0)return 250; // activation slot — Breathwork/Meditation
  return BBC_PAY_RATES[a]!=null?BBC_PAY_RATES[a]:null;
}
// Only CONFIRMED sessions count toward pay — matches the spa payroll
// convention of paying for completed work, not everything scheduled.
function scComputeBbcPayroll(){
  const byName={};
  (typeof bbcSchedules!=='undefined'?bbcSchedules:[]).forEach(s=>{
    if(s.status!=='confirmed')return;
    (s.days||[]).forEach(day=>{
      (day.slots||[]).forEach(slot=>{
        if(!slot.confirmed||!slot.instructor)return;
        const name=slot.instructor.trim();if(!name)return;
        if(!byName[name])byName[name]={name,sessions:[],unrated:[],total:0};
        const rate=bbcPayRateFor(slot.activity);
        if(rate==null){byName[name].unrated.push(slot.activity);return;}
        byName[name].sessions.push({date:day.date,activity:slot.activity,schedName:s.name,rate});
        byName[name].total+=rate;
      });
    });
  });
  return Object.values(byName).sort((a,b)=>b.total-a.total);
}
function scPayrollTableHtml(){
  const rows=scComputeBbcPayroll();
  if(!rows.length)return'<div style="text-align:center;padding:30px;color:#c8bfb5;font-style:italic">No confirmed BBC sessions yet.</div>';
  return`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">
    <thead><tr style="background:#faf7f2"><th style="padding:8px 10px;text-align:left;color:#5a5048">Instructor</th><th style="padding:8px 10px;text-align:left;color:#5a5048">Confirmed Sessions</th><th style="padding:8px 10px;text-align:left;color:#5a5048">Unrated</th><th style="padding:8px 10px;text-align:right;color:#5a5048">Total</th></tr></thead>
    <tbody>${rows.map(r=>`<tr style="border-bottom:1px solid #f0ece4;vertical-align:top">
      <td style="padding:9px 10px;font-weight:700;color:var(--dark)">${r.name}</td>
      <td style="padding:9px 10px;font-size:11.5px;color:#5a5048">${r.sessions.map(s=>`${s.activity} — ${s.date} ($${s.rate})`).join('<br>')||'—'}</td>
      <td style="padding:9px 10px;font-size:11.5px;color:#c8a468;font-style:italic">${r.unrated.length?'no rate set: '+r.unrated.join(', '):'—'}</td>
      <td style="padding:9px 10px;font-weight:800;color:var(--teal,#2d6a6a);text-align:right;white-space:nowrap">$${r.total.toFixed(2)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}
let staffConfirmAccounts=[];
let currentStaffConfirmSession=null;

function loadStaffConfirmAccountsLocal(){
  const raw=localStorage.getItem('amansala_staff_confirm_accounts');
  if(raw){try{staffConfirmAccounts=JSON.parse(raw);}catch{staffConfirmAccounts=DEF_STAFF_CONFIRM.map(a=>({...a}));}}
  else{staffConfirmAccounts=DEF_STAFF_CONFIRM.map(a=>({...a}));localStorage.setItem('amansala_staff_confirm_accounts',JSON.stringify(staffConfirmAccounts));}
  staffConfirmAccounts.forEach(a=>{if(a.active===undefined)a.active=true;});
  if(!staffConfirmAccounts.length)staffConfirmAccounts=DEF_STAFF_CONFIRM.map(a=>({...a}));
}
async function loadStaffConfirmAccounts(){
  loadStaffConfirmAccountsLocal();
  try{
    const{data}=await db.from('app_store').select('value').eq('key','staffConfirmAccounts').maybeSingle();
    if(data?.value&&Array.isArray(data.value)&&data.value.length){staffConfirmAccounts=data.value;}
  }catch(e){}
}
async function saveStaffConfirmAccounts(){
  localStorage.setItem('amansala_staff_confirm_accounts',JSON.stringify(staffConfirmAccounts));
  try{await db.from('app_store').upsert({key:'staffConfirmAccounts',value:staffConfirmAccounts,updated_at:new Date().toISOString()});}catch(e){console.warn('Staff confirm account sync failed:',e);}
}

// ===== MODE DETECTION (mirrors IS_DRIVER_MODE/IS_TEACHER_MODE pattern) =====
const IS_STAFF_CONFIRM_MODE=new URLSearchParams(window.location.search).get('mode')==='confirm'||sessionStorage.getItem('ama_confirm_mode')==='1'||(!localStorage.getItem('ama_admin_device')&&localStorage.getItem('ama_confirm_persist')==='1');

function getStaffConfirmSession(){
  if(currentStaffConfirmSession)return currentStaffConfirmSession;
  const raw=sessionStorage.getItem('amansala_staff_confirm_session');
  if(raw){try{currentStaffConfirmSession=JSON.parse(raw);}catch{currentStaffConfirmSession=null;}}
  return currentStaffConfirmSession;
}

function staffConfirmLoginSubmit(){
  const username=document.getElementById('staffConfirmLoginUser').value.trim().toLowerCase();
  const password=document.getElementById('staffConfirmLoginPass').value;
  const errEl=document.getElementById('staffConfirmLoginErr');
  errEl.textContent='';
  if(!username||!password){errEl.textContent='Please enter your username and password.';return;}
  function tryLogin(){
    return staffConfirmAccounts.find(a=>a.active&&a.username.toLowerCase()===username&&a.password===password)||null;
  }
  let account=tryLogin();
  if(!account){
    errEl.textContent='Checking credentials…';
    db.from('app_store').select('value').eq('key','staffConfirmAccounts').maybeSingle().then(({data})=>{
      if(data?.value&&Array.isArray(data.value)&&data.value.length){
        staffConfirmAccounts=data.value;
        localStorage.setItem('amansala_staff_confirm_accounts',JSON.stringify(staffConfirmAccounts));
      }
      account=tryLogin();
      if(!account){errEl.textContent='Incorrect username or password.';return;}
      errEl.textContent='';
      staffConfirmLoginComplete(account);
    }).catch(()=>{errEl.textContent='Incorrect username or password.';});
    return;
  }
  staffConfirmLoginComplete(account);
}

function staffConfirmLoginComplete(account){
  const session={id:account.id,name:account.name,username:account.username.toLowerCase()};
  sessionStorage.setItem('amansala_staff_confirm_session',JSON.stringify(session));
  sessionStorage.setItem('ama_confirm_mode','1');
  localStorage.setItem('ama_confirm_persist','1');
  currentStaffConfirmSession=session;
  const ov=document.getElementById('staffConfirmLoginOverlay');if(ov)ov.style.display='none';
  const dash=document.getElementById('staffConfirmDashboard');if(dash)dash.style.display='block';
  scInitDashboard();
}
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&document.getElementById('staffConfirmLoginOverlay')?.style.display!=='none'&&IS_STAFF_CONFIRM_MODE)staffConfirmLoginSubmit();});

function staffConfirmLogout(){
  if(!confirm('Sign out?'))return;
  sessionStorage.removeItem('amansala_staff_confirm_session');
  sessionStorage.removeItem('ama_confirm_mode');
  localStorage.removeItem('ama_confirm_persist');
  currentStaffConfirmSession=null;
  location.href=location.pathname;
}

// ===== BOOTSTRAP =====
async function initStaffConfirmMode(){
  if(!IS_STAFF_CONFIRM_MODE)return;
  await loadStaffConfirmAccounts();
  document.querySelectorAll('.tab-btn').forEach(b=>b.style.pointerEvents='none');
  const session=getStaffConfirmSession();
  if(session){
    const ov=document.getElementById('staffConfirmLoginOverlay');if(ov)ov.style.display='none';
    const dash=document.getElementById('staffConfirmDashboard');if(dash)dash.style.display='block';
    scInitDashboard();
    return;
  }
  const ov=document.getElementById('staffConfirmLoginOverlay');if(ov)ov.style.display='flex';
  setTimeout(()=>document.getElementById('staffConfirmLoginUser')?.focus(),120);
}

// ===== DATA GATHERING (matched by name across the three systems) =====
function scSessionName(){return(getStaffConfirmSession()?.name||'').trim().toLowerCase();}

function scBbcItemsForName(name){
  const items=[];
  (typeof bbcSchedules!=='undefined'?bbcSchedules:[]).forEach(s=>{
    if(s.status!=='confirmed')return; // still-changing drafts don't show to staff yet
    (s.days||[]).forEach((day,di)=>{
      (day.slots||[]).forEach((slot,si)=>{
        if(slot.type==='meal')return;
        if(!slot.instructor||slot.instructor.trim().toLowerCase()!==name)return;
        items.push({domain:'bbc',schedId:s.id,schedName:s.name,di,si,date:day.date,time:slot.time,activity:slot.activity,location:slot.location,confirmed:!!slot.confirmed,confirmedAt:slot.confirmedAt,confirmedBy:slot.confirmedBy||null,requestedChange:!!slot.requestedChange,requestedChangeNote:slot.requestedChangeNote||'',requestedChangeBy:slot.requestedChangeBy||null});
      });
    });
  });
  return items;
}

function scSpaItemsForName(name){
  if(typeof SpaData==='undefined')return[];
  const ther=(SpaData.therapists||[]).find(t=>{
    const full=((t.firstName||'')+' '+(t.lastName||'')).trim().toLowerCase();
    return full===name||(t.firstName||'').trim().toLowerCase()===name;
  });
  if(!ther)return[];
  return(typeof SpaAppointments!=='undefined'?SpaAppointments:[]).filter(a=>a.therapistId===ther.id&&a.status!=='CANCELLED').map(a=>{
    const svc=(SpaData.services||[]).find(s=>s.id===a.serviceId);
    return{domain:'spa',id:a.id,date:a.date,time:a.start,duration:a.duration,activity:svc?svc.name:'Service',client:a.clientName,confirmed:!!a.confirmed,confirmedAt:a.confirmedAt,confirmedBy:a.confirmedBy||null,requestedChange:!!a.requestedChange,requestedChangeNote:a.requestedChangeNote||'',requestedChangeBy:a.requestedChangeBy||null};
  });
}

function scTourItemsForName(name){
  const items=[];
  const ops=(typeof actOpsData!=='undefined'?actOpsData:{});
  Object.keys(ops).forEach(opsKey=>{
    const o=ops[opsKey]||{};
    const[aoId,date]=opsKey.split('|');
    const role=o.guide1===name||o.guide2===name?'guide':o.driver===name?'driver':null;
    if(!role)return;
    const ao=(typeof ADD_ONS!=='undefined'?ADD_ONS:[]).find(a=>a.id===aoId);
    const confirmed=role==='driver'?!!o.driverConfirmed:!!o.guideConfirmed;
    const confirmedAt=role==='driver'?o.driverConfirmedAt:o.guideConfirmedAt;
    const confirmedBy=role==='driver'?o.driverConfirmedBy:o.guideConfirmedBy;
    items.push({domain:'tour',opsKey,date,activity:ao?ao.name:aoId,role,confirmed,confirmedAt,confirmedBy:confirmedBy||null,requestedChange:!!o.requestedChange,requestedChangeNote:o.requestedChangeNote||'',requestedChangeBy:o.requestedChangeBy||null});
  });
  return items;
}

function scAllItemsForName(name){
  return[...scBbcItemsForName(name),...scSpaItemsForName(name),...scTourItemsForName(name)].sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
}

// ===== CONFIRM ACTIONS (reusable by the staff dashboard AND the admin board) =====
// `who` is the confirming person's name — shown as initials on the badge so
// it's clear who actually clicked Confirm, not just that "someone" did.
function scInitials(name){
  if(!name)return'';
  return name.trim().split(/\s+/).slice(0,2).map(w=>w[0].toUpperCase()).join('');
}
function scConfirmBbc(schedId,di,si,who){
  if(typeof bbcSchedules==='undefined')return;
  const s=bbcSchedules.find(x=>x.id===schedId);if(!s)return;
  const slot=s.days[di]?.slots[si];if(!slot)return;
  slot.confirmed=!slot.confirmed;
  slot.confirmedAt=slot.confirmed?new Date().toISOString():null;
  slot.confirmedBy=slot.confirmed?(who||null):null;
  bbcSaveData();
}
function scConfirmSpa(apptId,who){
  if(typeof SpaAppointments==='undefined')return;
  const a=SpaAppointments.find(x=>x.id===apptId);if(!a)return;
  a.confirmed=!a.confirmed;
  a.confirmedAt=a.confirmed?new Date().toISOString():null;
  a.confirmedBy=a.confirmed?(who||null):null;
  spaCalSave();
}
function scConfirmTour(opsKey,role,who){
  const field=role==='driver'?'driverConfirmed':'guideConfirmed';
  const byField=role==='driver'?'driverConfirmedBy':'guideConfirmedBy';
  const cur=!!(actOpsData[opsKey]||{})[field];
  if(!actOpsData[opsKey])actOpsData[opsKey]={};
  actOpsData[opsKey][byField]=cur?null:(who||null);
  actOpsSet(opsKey,field,!cur); // reuses existing function — saves + timestamps + refreshes admin view
}

// ===== STAFF DASHBOARD =====
async function scInitDashboard(){
  const root=document.getElementById('staffConfirmDashboard');if(!root)return;
  root.innerHTML='<div style="text-align:center;padding:80px 20px;color:#8a7e74;font-family:\'Jost\',sans-serif">Loading your schedule…</div>';
  await Promise.all([
    (typeof bbcLoadData==='function'?bbcLoadData():Promise.resolve()),
    (typeof spaLoad==='function'&&typeof spaLoaded!=='undefined'&&!spaLoaded?spaLoad():Promise.resolve()),
    (typeof spaCalLoad==='function'&&typeof spaCalLoaded!=='undefined'&&!spaCalLoaded?spaCalLoad():Promise.resolve()),
    (typeof actOpsLoad==='function'?actOpsLoad():Promise.resolve()),
  ]);
  scRenderDashboard();
}

function scFmtDate(ds){const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});}

function scItemCardHtml(item,forAdmin){
  const today=new Date().toISOString().slice(0,10);
  const isPast=item.date<today;
  const label=item.domain==='bbc'?'Bikini Bootcamp':item.domain==='spa'?'Spa':('Tour — '+(item.role==='driver'?'Driver':'Guide'));
  const color=item.domain==='bbc'?'#0e9494':item.domain==='spa'?'#a855f7':'#d97706';
  const timeLabel=item.domain==='spa'&&item.time?spaCalFmtT(item.time):(item.time||'');
  const sub=item.domain==='spa'?(item.client?' · '+item.client:''):(item.location?' · '+item.location:'');
  // Who confirms: on the staff's own dashboard it's whoever is logged in;
  // on the admin board it's the person the item belongs to (an admin
  // confirming on someone's behalf still records that person's name).
  const who=forAdmin?(item.instructorName||''):(getStaffConfirmSession()?.name||'');
  const whoEsc=who.replace(/'/g,"\\'");
  const onClick=item.domain==='bbc'?`scConfirmBbc('${item.schedId}',${item.di},${item.si},'${whoEsc}')`
    :item.domain==='spa'?`scConfirmSpa('${item.id}','${whoEsc}')`
    :`scConfirmTour('${item.opsKey}','${item.role}','${whoEsc}')`;
  const refresh=forAdmin?';scRenderAdminBoard();scRenderPayrollBoardIfPresent()':';scRenderDashboard()';
  const confirmedLabel='&#10003; Confirmed'+(item.confirmedBy?' by '+scInitials(item.confirmedBy):'');
  const changeArgs=item.domain==='bbc'?`'bbc','${item.schedId}',${item.di},${item.si}`
    :item.domain==='spa'?`'spa','${item.id}'`
    :`'tour','${item.opsKey}','${item.role}'`;
  const noteEsc=(item.requestedChangeNote||'').replace(/"/g,'&quot;');
  let actionHtml;
  if(item.confirmed){
    actionHtml=`<button onclick="${onClick}${refresh}" title="Click to unconfirm" style="font-size:11.5px;font-weight:700;color:#15803d;background:#dcfce7;border:none;border-radius:99px;padding:6px 14px;white-space:nowrap;cursor:pointer">${confirmedLabel}</button>`;
  } else if(item.requestedChange){
    const cancelBtn=forAdmin?`<button onclick="scCancelAssignment(${changeArgs})${refresh}" style="font-size:11px;font-weight:700;color:#dc2626;background:#fff;border:1.5px solid #fca5a5;border-radius:8px;padding:5px 12px;cursor:pointer;white-space:nowrap">Cancel It</button>`:'';
    actionHtml=`<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
      <span title="${noteEsc}" style="font-size:11px;font-weight:700;color:#b45309;background:#fef3c7;border-radius:99px;padding:6px 14px;white-space:nowrap">⚠ Change Requested${item.requestedChangeBy?' by '+scInitials(item.requestedChangeBy):''}</span>
      <div style="display:flex;gap:10px;align-items:center">${cancelBtn}<button onclick="scClearRequestChange(${changeArgs})${refresh}" style="font-size:10.5px;color:#8a7e74;background:none;border:none;cursor:pointer;text-decoration:underline">dismiss flag</button></div>
    </div>`;
  } else {
    actionHtml=`<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
      <button onclick="scRequestChange(${changeArgs},'${whoEsc}')${refresh}" style="background:#fff;color:#b45309;border:1.5px solid #fde68a;padding:9px 14px;border-radius:9px;font-family:'Jost',sans-serif;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">Request Change</button>
      <button onclick="${onClick}${refresh}" style="background:#2d6a6a;color:#fff;border:none;padding:9px 18px;border-radius:9px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap">Confirm</button>
    </div>`;
  }
  return`<div style="background:#fff;border:1.5px solid ${item.confirmed?'#86efac':item.requestedChange?'#fde68a':'#e8dfd4'};border-radius:12px;padding:16px 18px;margin-bottom:10px;opacity:${isPast&&!item.confirmed&&!item.requestedChange?'.55':'1'}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
      <div>
        <div style="font-weight:800;color:${color};font-size:11px;letter-spacing:.4px;text-transform:uppercase">${label}${forAdmin?' · '+(item.instructorName||''):''}</div>
        <div style="font-size:16px;font-weight:700;color:#2d2520;margin-top:3px">${item.activity}</div>
        <div style="font-size:12.5px;color:#8a7e74;margin-top:3px">${scFmtDate(item.date)}${timeLabel?' · '+timeLabel:''}${sub}</div>
        ${item.requestedChange&&item.requestedChangeNote?`<div style="font-size:12px;color:#92400e;margin-top:6px;font-style:italic">"${item.requestedChangeNote}"</div>`:''}
      </div>
      ${actionHtml}
    </div>
  </div>`;
}
function scRequestChange(domain,a,b,c,who){
  const note=prompt('What\'s the issue? (e.g. "not available that day", "wrong time")')||'';
  if(domain==='bbc'){
    if(typeof bbcSchedules==='undefined')return;
    const s=bbcSchedules.find(x=>x.id===a);if(!s)return;
    const slot=s.days[b]?.slots[c];if(!slot)return;
    slot.requestedChange=true;slot.requestedChangeNote=note;slot.requestedChangeBy=who;
    bbcSaveData();
  } else if(domain==='spa'){
    if(typeof SpaAppointments==='undefined')return;
    const appt=SpaAppointments.find(x=>x.id===a);if(!appt)return;
    appt.requestedChange=true;appt.requestedChangeNote=note;appt.requestedChangeBy=who;
    spaCalSave();
  } else {
    if(!actOpsData[a])actOpsData[a]={};
    actOpsData[a].requestedChange=true;actOpsData[a].requestedChangeNote=note;actOpsData[a].requestedChangeBy=who;
    actOpsSave();
  }
}
function scClearRequestChange(domain,a,b,c){
  if(domain==='bbc'){
    if(typeof bbcSchedules==='undefined')return;
    const s=bbcSchedules.find(x=>x.id===a);const slot=s&&s.days[b]?.slots[c];
    if(slot){slot.requestedChange=false;bbcSaveData();}
  } else if(domain==='spa'){
    if(typeof SpaAppointments==='undefined')return;
    const appt=SpaAppointments.find(x=>x.id===a);
    if(appt){appt.requestedChange=false;spaCalSave();}
  } else if(actOpsData[a]){
    actOpsData[a].requestedChange=false;actOpsSave();
  }
}
// Actually cancels the thing itself, not just the flag — for when whoever
// was assigned genuinely can't do it and it needs to come off the books,
// not just be re-confirmed with someone else later. Admin-only.
function scCancelAssignment(domain,a,b,c){
  if(!confirm('Cancel this? This removes it, not just the confirmation flag.'))return;
  if(domain==='bbc'){
    if(typeof bbcSchedules==='undefined')return;
    const s=bbcSchedules.find(x=>x.id===a);const slot=s&&s.days[b]?.slots[c];
    if(!slot)return;
    slot.instructor='';slot.confirmed=false;slot.confirmedAt=null;slot.confirmedBy=null;
    slot.requestedChange=false;slot.requestedChangeNote='';slot.requestedChangeBy=null;
    bbcSaveData();
  } else if(domain==='spa'){
    if(typeof SpaAppointments==='undefined')return;
    const appt=SpaAppointments.find(x=>x.id===a);if(!appt)return;
    appt.status='CANCELLED';
    appt.requestedChange=false;appt.requestedChangeNote='';appt.requestedChangeBy=null;
    spaCalSave();
  } else {
    if(!actOpsData[a])return;
    if(b==='driver'){
      actOpsData[a].driver='';actOpsData[a].driverConfirmed=false;actOpsData[a].driverConfirmedAt=null;actOpsData[a].driverConfirmedBy=null;
    } else {
      // b==='guide' — clear both guide slots; whichever one actually held
      // this person is gone either way, and re-assigning starts fresh.
      actOpsData[a].guide1='';actOpsData[a].guide2='';
      actOpsData[a].guideConfirmed=false;actOpsData[a].guideConfirmedAt=null;actOpsData[a].guideConfirmedBy=null;
    }
    actOpsData[a].requestedChange=false;actOpsData[a].requestedChangeNote='';actOpsData[a].requestedChangeBy=null;
    actOpsSave();
  }
}

// Global availability check other modules (bbc-schedule.js) consult before
// assigning an instructor — no account on file, or no date/name given, means
// "don't block" (we can't know they're unavailable if we have no record).
function scIsAvailable(name,date){
  if(!name||!date)return true;
  const list=(typeof staffConfirmAccounts!=='undefined'?staffConfirmAccounts:[]);
  const acct=list.find(a=>a.name.trim().toLowerCase()===name.trim().toLowerCase());
  if(!acct)return true;
  return !(acct.unavailableDates||[]).includes(date);
}

function scAvailabilityHtml(account){
  const dates=(account.unavailableDates||[]).slice().sort();
  const fmtD=ds=>{const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});};
  return`<div style="margin-top:10px;margin-bottom:26px">
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#8a7e74;margin-bottom:10px">My Availability</div>
    <div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;padding:16px 18px">
      <div style="font-size:12.5px;color:#8a7e74;margin-bottom:12px">Mark dates you're NOT available — you won't be scheduled for BBC classes on these days.</div>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <input type="date" id="scUnavailInput" style="flex:1;padding:8px 10px;border:1.5px solid #e8dfd4;border-radius:8px;font-family:'Jost',sans-serif;font-size:13px">
        <button onclick="scAddUnavailable()" style="background:#2d6a6a;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap">Mark Unavailable</button>
      </div>
      ${dates.length?dates.map(d=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f0ece4;font-size:12.5px;color:#2d2520"><span>${fmtD(d)}</span><button onclick="scRemoveUnavailable('${d}')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:12px;text-decoration:underline">remove</button></div>`).join(''):'<div style="font-size:12px;color:#c8bfb5;font-style:italic">No dates marked — you\'re available for everything.</div>'}
    </div>
  </div>`;
}
function scAddUnavailable(){
  const val=document.getElementById('scUnavailInput').value;if(!val)return;
  const session=getStaffConfirmSession();if(!session)return;
  const account=staffConfirmAccounts.find(a=>a.id===session.id);if(!account)return;
  account.unavailableDates=account.unavailableDates||[];
  if(!account.unavailableDates.includes(val))account.unavailableDates.push(val);
  saveStaffConfirmAccounts();
  scRenderDashboard();
}
function scRemoveUnavailable(date){
  const session=getStaffConfirmSession();if(!session)return;
  const account=staffConfirmAccounts.find(a=>a.id===session.id);if(!account)return;
  account.unavailableDates=(account.unavailableDates||[]).filter(d=>d!==date);
  saveStaffConfirmAccounts();
  scRenderDashboard();
}

// ===== Team availability editing — for Payroll Admin accounts (e.g. Rubi, Darlene) =====
function scTeamAvailabilityHtml(){
  const today=new Date().toISOString().slice(0,10);
  const fmtD=ds=>{const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});};
  const staff=staffConfirmAccounts.filter(a=>a.active).slice().sort((a,b)=>a.name.localeCompare(b.name));
  return`<div style="margin-top:10px;margin-bottom:26px">
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#8a7e74;margin-bottom:10px">Team Availability — Edit Anyone's Dates</div>
    <div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;overflow:hidden">
      ${staff.map(a=>{
        const dates=(a.unavailableDates||[]).slice().sort();
        const upcoming=dates.filter(d=>d>=today);
        return`<details style="border-bottom:1px solid #f0ece4">
          <summary style="cursor:pointer;padding:12px 16px;font-size:13px;font-weight:700;color:#2d2520;display:flex;justify-content:space-between;align-items:center">
            <span>${a.name}</span>
            ${upcoming.length?`<span style="font-size:10.5px;font-weight:700;color:#dc2626">🚫 ${upcoming.length} date${upcoming.length>1?'s':''}</span>`:'<span style="font-size:10.5px;color:#c8bfb5;font-style:italic">available</span>'}
          </summary>
          <div style="padding:0 16px 14px">
            <div style="display:flex;gap:8px;margin-bottom:10px">
              <input type="date" id="scTeamUnavailInput_${a.id}" style="flex:1;padding:8px 10px;border:1.5px solid #e8dfd4;border-radius:8px;font-family:'Jost',sans-serif;font-size:13px">
              <button onclick="scTeamAddUnavailable('${a.id}')" style="background:#2d6a6a;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap">Mark Unavailable</button>
            </div>
            ${dates.length?dates.map(d=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0ece4;font-size:12.5px;color:#2d2520"><span>${fmtD(d)}</span><button onclick="scTeamRemoveUnavailable('${a.id}','${d}')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:12px;text-decoration:underline">remove</button></div>`).join(''):'<div style="font-size:12px;color:#c8bfb5;font-style:italic">No dates marked.</div>'}
          </div>
        </details>`;
      }).join('')}
    </div>
  </div>`;
}
function scTeamRefreshWhicheverView(){
  if(document.getElementById('scAccountsList'))scRenderAdminAccounts();
  if(document.getElementById('staffConfirmDashboard'))scRenderDashboard();
}
function scTeamAddUnavailable(id){
  const input=document.getElementById('scTeamUnavailInput_'+id);const val=input?input.value:'';if(!val)return;
  const account=staffConfirmAccounts.find(a=>a.id===id);if(!account)return;
  account.unavailableDates=account.unavailableDates||[];
  if(!account.unavailableDates.includes(val))account.unavailableDates.push(val);
  saveStaffConfirmAccounts();
  scTeamRefreshWhicheverView();
}
function scTeamRemoveUnavailable(id,date){
  const account=staffConfirmAccounts.find(a=>a.id===id);if(!account)return;
  account.unavailableDates=(account.unavailableDates||[]).filter(d=>d!==date);
  saveStaffConfirmAccounts();
  scTeamRefreshWhicheverView();
}

function scRenderDashboard(){
  const root=document.getElementById('staffConfirmDashboard');if(!root)return;
  const session=getStaffConfirmSession();if(!session)return;
  const name=scSessionName();
  const bbc=scBbcItemsForName(name).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  const spa=scSpaItemsForName(name).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  const tour=scTourItemsForName(name).sort((a,b)=>a.date.localeCompare(b.date));
  const section=(title,items)=>items.length?`<div style="margin-bottom:26px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#8a7e74;margin-bottom:10px">${title}</div>${items.map(i=>scItemCardHtml(i,false)).join('')}</div>`:'';
  const all=[...bbc,...spa,...tour];
  const account=staffConfirmAccounts.find(a=>a.id===session.id);
  const isPayrollAdmin=!!account?.isPayrollAdmin;
  root.innerHTML=`
    <div style="max-width:640px;margin:0 auto;padding:28px 20px 60px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
        <div>
          <div style="font-size:22px;font-weight:800;color:#2d2520;font-family:'Cormorant Garamond',serif">Hi, ${session.name}</div>
          <div style="font-size:12.5px;color:#8a7e74;margin-top:2px">Your hours — confirm what's yours</div>
        </div>
        <button onclick="staffConfirmLogout()" style="background:#fff;border:1.5px solid #e8dfd4;color:#6b5f54;padding:8px 14px;border-radius:9px;font-family:'Jost',sans-serif;font-size:12px;font-weight:600;cursor:pointer">Sign Out</button>
      </div>
      ${all.length===0?`<div style="text-align:center;padding:60px 20px;color:#c8bfb5;font-style:italic">No hours assigned to you right now.</div>`:''}
      ${section('Bikini Bootcamp',bbc)}
      ${section('Spa',spa)}
      ${section('Tours',tour)}
      ${account?scAvailabilityHtml(account):''}
      ${isPayrollAdmin?scTeamAvailabilityHtml():''}
      ${isPayrollAdmin?`<div style="margin-top:10px">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#8a7e74;margin-bottom:10px">Bikini Bootcamp Payroll — All Staff</div>
        <div id="scStaffPayrollBoard" style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;overflow:hidden">${scPayrollTableHtml()}</div>
      </div>`:''}
    </div>`;
}
function scRenderPayrollBoardIfPresent(){
  const admin=document.getElementById('scPayrollBoard');if(admin)admin.innerHTML=scPayrollTableHtml();
  const staff=document.getElementById('scStaffPayrollBoard');if(staff)staff.innerHTML=scPayrollTableHtml();
}

// ===== ADMIN — manage accounts + read/toggle every domain's confirm status =====
function scAdminAddAccount(){
  const name=document.getElementById('scNewName').value.trim();
  const username=document.getElementById('scNewUser').value.trim().toLowerCase();
  const password=document.getElementById('scNewPass').value.trim();
  if(!name||!username||!password){alert('Please fill in name, username, and password.');return;}
  if(staffConfirmAccounts.some(a=>a.username.toLowerCase()===username)){alert('That username is already in use.');return;}
  staffConfirmAccounts.push({id:'sc_'+Math.random().toString(36).substr(2,9),name,username,password,active:true});
  saveStaffConfirmAccounts();
  scRenderAdminAccounts();
  document.getElementById('scNewName').value='';document.getElementById('scNewUser').value='';document.getElementById('scNewPass').value='';
}
function scAdminToggleActive(id){
  const a=staffConfirmAccounts.find(x=>x.id===id);if(!a)return;
  a.active=!a.active;
  saveStaffConfirmAccounts();
  scRenderAdminAccounts();
}
function scAdminTogglePayrollAdmin(id){
  const a=staffConfirmAccounts.find(x=>x.id===id);if(!a)return;
  a.isPayrollAdmin=!a.isPayrollAdmin;
  saveStaffConfirmAccounts();
  scRenderAdminAccounts();
}
function scAdminRemoveAccount(id){
  const a=staffConfirmAccounts.find(x=>x.id===id);if(!a)return;
  if(!confirm('Remove '+a.name+'’s login?'))return;
  staffConfirmAccounts=staffConfirmAccounts.filter(x=>x.id!==id);
  saveStaffConfirmAccounts();
  scRenderAdminAccounts();
}
function scCopyLoginLink(){
  const url=location.origin+location.pathname.replace(/[^/]*$/,'')+'booking-hub.html?mode=confirm';
  navigator.clipboard.writeText(url).then(()=>showToast('Login link copied — send it to your team.')).catch(()=>alert(url));
}

function scRenderAdminAccounts(){
  const el=document.getElementById('scAccountsList');if(!el)return;
  const today=new Date().toISOString().slice(0,10);
  const fmtD=ds=>{const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});};
  el.innerHTML=staffConfirmAccounts.map(a=>{
    const dates=(a.unavailableDates||[]).slice().sort();
    const upcoming=dates.filter(d=>d>=today);
    return`
    <details style="border:1.5px solid var(--border);border-radius:9px;margin-bottom:7px;background:${a.active?'#fff':'#f5f5f0'}">
      <summary style="list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:9px 12px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px;font-weight:700;color:var(--dark);font-size:13px">${a.name}${upcoming.length?`<div style="font-weight:600;color:#dc2626;font-size:10.5px;margin-top:2px">🚫 ${upcoming.map(fmtD).join(', ')}</div>`:''}</div>
        <div style="font-size:12px;color:var(--muted);min-width:90px">@${a.username}</div>
        <div style="font-size:12px;color:var(--muted);font-family:monospace;min-width:100px">${a.password}</div>
        <button onclick="event.preventDefault();scAdminTogglePayrollAdmin('${a.id}')" title="Can see everyone's hours + BBC payroll, and edit everyone's availability" style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;border:1.5px solid ${a.isPayrollAdmin?'#93c5fd':'#e8dfd4'};background:${a.isPayrollAdmin?'#dbeafe':'#f5f5f0'};color:${a.isPayrollAdmin?'#1d4ed8':'#9ca3af'};cursor:pointer">${a.isPayrollAdmin?'★ Payroll Admin':'Payroll Admin'}</button>
        <button onclick="event.preventDefault();scAdminToggleActive('${a.id}')" style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;border:1.5px solid ${a.active?'#86efac':'#e8dfd4'};background:${a.active?'#dcfce7':'#f5f5f0'};color:${a.active?'#15803d':'#9ca3af'};cursor:pointer">${a.active?'Active':'Disabled'}</button>
        <button onclick="event.preventDefault();scAdminRemoveAccount('${a.id}')" style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:8px;border:1.5px solid #fca5a5;background:#fff;color:#dc2626;cursor:pointer">Remove</button>
      </summary>
      <div style="padding:0 12px 12px;border-top:1px solid #f0ece4;margin-top:2px">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#8a7e74;margin:10px 0 8px">Edit Availability</div>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <input type="date" id="scTeamUnavailInput_${a.id}" style="flex:1;padding:8px 10px;border:1.5px solid #e8dfd4;border-radius:8px;font-family:'Jost',sans-serif;font-size:13px">
          <button onclick="scTeamAddUnavailable('${a.id}')" style="background:#2d6a6a;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap">Mark Unavailable</button>
        </div>
        ${dates.length?dates.map(d=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0ece4;font-size:12.5px;color:#2d2520"><span>${fmtD(d)}</span><button onclick="scTeamRemoveUnavailable('${a.id}','${d}')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:12px;text-decoration:underline">remove</button></div>`).join(''):'<div style="font-size:12px;color:#c8bfb5;font-style:italic">No dates marked.</div>'}
      </div>
    </details>`;}).join('');
}

async function scAdminInit(){
  const el=document.getElementById('scAccountsList');if(!el)return;
  await loadStaffConfirmAccounts();
  scRenderAdminAccounts();
  await Promise.all([
    (typeof bbcLoadData==='function'?bbcLoadData():Promise.resolve()),
    (typeof spaLoad==='function'&&typeof spaLoaded!=='undefined'&&!spaLoaded?spaLoad():Promise.resolve()),
    (typeof spaCalLoad==='function'&&typeof spaCalLoaded!=='undefined'&&!spaCalLoaded?spaCalLoad():Promise.resolve()),
    (typeof actOpsLoad==='function'?actOpsLoad():Promise.resolve()),
  ]);
  scRenderAdminBoard();
  const payrollEl=document.getElementById('scPayrollBoard');
  if(payrollEl)payrollEl.innerHTML=scPayrollTableHtml();
}

function scRenderAdminBoard(){
  const el=document.getElementById('scAdminBoard');if(!el)return;
  const names=[...new Set(staffConfirmAccounts.map(a=>a.name.trim().toLowerCase()))];
  const byNameLabel=new Map(staffConfirmAccounts.map(a=>[a.name.trim().toLowerCase(),a.name]));
  let all=[];
  names.forEach(n=>{
    scAllItemsForName(n).forEach(i=>{i.instructorName=byNameLabel.get(n);all.push(i);});
  });
  all.sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
  const today=new Date().toISOString().slice(0,10);
  const upcoming=all.filter(i=>i.date>=today||!i.confirmed);
  if(!upcoming.length){el.innerHTML='<div style="text-align:center;padding:30px;color:#c8bfb5;font-style:italic">Nothing assigned yet.</div>';return;}
  el.innerHTML=upcoming.map(i=>scItemCardHtml(i,true)).join('');
}
