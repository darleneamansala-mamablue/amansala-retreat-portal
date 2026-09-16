// ===== spa-staff-portal.js — Spa-only staff login (Rosy, Kike, Host, Rubi, etc.) =====
// Loaded as a classic script; shares global scope (same pattern as cb-portal-sync.js).
// Own isolated account list, mirrors driver-portal.js / staff-confirm-portal.js
// structurally — separate credentials from the main staff login so spa staff
// never get access to the rest of the portal. Reuses the existing admin Spa
// Calendar tab (#tab-spa, spaInit()/spaCalRender() etc. in spa.js/
// spa-calendar.js) instead of duplicating that UI — this mode just takes
// over the full screen and activates that one tab, nothing else.

const DEF_SPA_STAFF=[
  {id:'spastaff_rosy',name:'Rosy',username:'rosy',password:'rosy2026',active:true},
  {id:'spastaff_kike',name:'Kike',username:'kike',password:'kike2026',active:true},
  {id:'spastaff_host',name:'Host',username:'host',password:'host2026',active:true},
  {id:'spastaff_rubi',name:'Rubi',username:'rubi',password:'rubi2026',active:true},
];
let spaStaffAccounts=[];
let currentSpaStaffSession=null;

function loadSpaStaffAccounts(){
  const raw=localStorage.getItem('amansala_spa_staff');
  if(raw){try{spaStaffAccounts=JSON.parse(raw);}catch{spaStaffAccounts=DEF_SPA_STAFF.map(s=>({...s}));}}
  else{spaStaffAccounts=DEF_SPA_STAFF.map(s=>({...s}));localStorage.setItem('amansala_spa_staff',JSON.stringify(spaStaffAccounts));}
  spaStaffAccounts.forEach(s=>{if(s.active===undefined)s.active=true;});
  if(!spaStaffAccounts.length)spaStaffAccounts=DEF_SPA_STAFF.map(s=>({...s}));
}
function saveSpaStaffAccounts(){
  localStorage.setItem('amansala_spa_staff',JSON.stringify(spaStaffAccounts));
  (async()=>{try{await db.from('app_store').upsert({key:'spaStaffAccounts',value:spaStaffAccounts,updated_at:new Date().toISOString()});}catch(e){console.warn('Spa staff account sync failed:',e);}})();
}

// ===== MODE DETECTION (mirrors IS_DRIVER_MODE/IS_STAFF_CONFIRM_MODE pattern) =====
const IS_SPA_STAFF_MODE=new URLSearchParams(window.location.search).get('mode')==='spa-staff'||sessionStorage.getItem('ama_spa_staff_mode')==='1'||(!localStorage.getItem('ama_admin_device')&&localStorage.getItem('ama_spa_staff_persist')==='1');

function getSpaStaffSession(){
  if(currentSpaStaffSession)return currentSpaStaffSession;
  const raw=sessionStorage.getItem('amansala_spa_staff_session');
  if(raw){try{currentSpaStaffSession=JSON.parse(raw);}catch{currentSpaStaffSession=null;}}
  return currentSpaStaffSession;
}

function spaStaffLoginSubmit(){
  const username=document.getElementById('spaStaffLoginUser').value.trim().toLowerCase();
  const password=document.getElementById('spaStaffLoginPass').value;
  const errEl=document.getElementById('spaStaffLoginErr');
  errEl.textContent='';
  if(!username||!password){errEl.textContent='Please enter your username and password.';return;}
  function tryLogin(){
    return spaStaffAccounts.find(a=>a.active&&a.username.toLowerCase()===username&&a.password===password)||null;
  }
  let account=tryLogin();
  if(!account){
    errEl.textContent='Checking credentials…';
    db.from('app_store').select('value').eq('key','spaStaffAccounts').maybeSingle().then(({data})=>{
      if(data?.value&&Array.isArray(data.value)&&data.value.length){
        spaStaffAccounts=data.value;
        localStorage.setItem('amansala_spa_staff',JSON.stringify(spaStaffAccounts));
      }
      account=tryLogin();
      if(!account){errEl.textContent='Incorrect username or password.';return;}
      errEl.textContent='';
      spaStaffLoginComplete(account);
    }).catch(()=>{errEl.textContent='Incorrect username or password.';});
    return;
  }
  spaStaffLoginComplete(account);
}

function spaStaffLoginComplete(account){
  const session={id:account.id,name:account.name,username:account.username.toLowerCase()};
  sessionStorage.setItem('amansala_spa_staff_session',JSON.stringify(session));
  sessionStorage.setItem('ama_spa_staff_mode','1');
  localStorage.setItem('ama_spa_staff_persist','1');
  currentSpaStaffSession=session;
  const ov=document.getElementById('spaStaffLoginOverlay');if(ov)ov.style.display='none';
  spaStaffShowDashboard();
}
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&document.getElementById('spaStaffLoginOverlay')?.style.display!=='none'&&IS_SPA_STAFF_MODE)spaStaffLoginSubmit();});

function spaStaffLogout(){
  if(!confirm('Sign out?'))return;
  sessionStorage.removeItem('amansala_spa_staff_session');
  sessionStorage.removeItem('ama_spa_staff_mode');
  localStorage.removeItem('ama_spa_staff_persist');
  currentSpaStaffSession=null;
  location.href=location.pathname;
}

// ===== BOOTSTRAP =====
function initSpaStaffMode(){
  if(!IS_SPA_STAFF_MODE)return;
  loadSpaStaffAccounts();
  document.querySelectorAll('.tab-btn').forEach(b=>b.style.pointerEvents='none');
  const session=getSpaStaffSession();
  if(session){spaStaffShowDashboard();return;}
  const ov=document.getElementById('spaStaffLoginOverlay');if(ov)ov.style.display='flex';
  setTimeout(()=>document.getElementById('spaStaffLoginUser')?.focus(),120);
}

// ===== SIMPLE EN/ES TOGGLE — Darlene's ask 2026-09-16 ("if they click a
// Mexico button they can see the Spanish"). Scoped to spa-staff mode only —
// the admin Spa tab is untouched and always stays English. Covers the New/
// Edit Appointment modal and the calendar toolbar, the two things front-desk
// staff actually use; translates via [data-i18n] markers so it survives
// re-renders without touching the shared render functions' logic.
let spaStaffLang=localStorage.getItem('ama_spa_staff_lang')||'en';
const SPA_STAFF_I18N={
  modal_title_new:{en:'New Appointment',es:'Nueva Cita'},
  modal_title_edit:{en:'Edit Appointment',es:'Editar Cita'},
  lbl_client_name:{en:'Client Name *',es:'Nombre del Cliente *'},
  lbl_guest_type:{en:'Guest Type',es:'Tipo de Huésped'},
  opt_hotel_guest:{en:'Hotel Guest',es:'Huésped del Hotel'},
  opt_offsite_guest:{en:'Offsite Guest',es:'Huésped Externo'},
  lbl_guest_room:{en:'Guest Room #',es:'N.º de Habitación'},
  lbl_guest_room_hint:{en:'(for billing — leave blank to match by name)',es:'(para cobro — dejar en blanco para buscar por nombre)'},
  room_bill_note:{en:"Billed to the guest's room automatically — paid when they settle at checkout.",es:'Se cobra automáticamente a la habitación del huésped — se paga al hacer el check-out.'},
  lbl_service:{en:'Service *',es:'Servicio *'},
  lbl_therapist:{en:'Therapist *',es:'Terapeuta *'},
  lbl_room:{en:'Room',es:'Sala'},
  lbl_date:{en:'Date *',es:'Fecha *'},
  lbl_start_time:{en:'Start Time *',es:'Hora de Inicio *'},
  lbl_duration:{en:'Duration (min)',es:'Duración (min)'},
  lbl_status:{en:'Status',es:'Estado'},
  opt_confirmed:{en:'Confirmed',es:'Confirmado'},
  opt_completed:{en:'Completed',es:'Completado'},
  opt_no_show:{en:'No Show',es:'No Asistió'},
  opt_cancelled:{en:'Cancelled',es:'Cancelado'},
  lbl_payment_status:{en:'Payment Status',es:'Estado de Pago'},
  opt_pending:{en:'Pending',es:'Pendiente'},
  opt_paid:{en:'Paid',es:'Pagado'},
  lbl_notes:{en:'Notes',es:'Notas'},
  btn_cancel:{en:'Cancel',es:'Cancelar'},
  btn_save:{en:'Save Appointment',es:'Guardar Cita'},
  btn_delete:{en:'Delete',es:'Eliminar'},
  btn_delete_appt:{en:'Delete Appointment',es:'Eliminar Cita'},
  btn_today:{en:'Today',es:'Hoy'},
  btn_new_appt:{en:'New Appointment',es:'Nueva Cita'},
  btn_by_therapist:{en:'By Therapist',es:'Por Terapeuta'},
  btn_by_room:{en:'By Room',es:'Por Sala'},
  btn_sign_out:{en:'Sign Out',es:'Cerrar Sesión'},
  time_conflict_warn:{en:'Time conflict — see below',es:'Conflicto de horario — ver abajo'},
};
function spaStaffApplyI18n(){
  const lang=spaStaffLang;
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const entry=SPA_STAFF_I18N[el.dataset.i18n];if(!entry)return;
    const text=entry[lang]||entry.en;
    if('placeholder' in el.dataset)el.placeholder=text;else el.textContent=text;
  });
}
function spaStaffSetLang(lang){
  spaStaffLang=lang;
  localStorage.setItem('ama_spa_staff_lang',lang);
  const enBtn=document.getElementById('spaStaffLangEn'),esBtn=document.getElementById('spaStaffLangEs');
  if(enBtn)enBtn.style.opacity=lang==='en'?'1':'.4';
  if(esBtn)esBtn.style.opacity=lang==='es'?'1':'.4';
  spaStaffApplyI18n();
}

// Takes over the existing admin Spa Calendar tab wholesale (fullscreen)
// instead of duplicating that UI in a second set of elements — but forces
// it onto the booking Calendar view specifically and hides Dashboard/
// Services/Therapists/Payroll/etc., since front-desk spa staff should only
// ever log appointments, never see revenue, payroll, or admin config
// (Darlene's ask 2026-09-16: "anyone can log an appointment").
function spaStaffShowDashboard(){
  const session=getSpaStaffSession();if(!session)return;
  const panel=document.getElementById('tab-spa');if(!panel)return;
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  panel.classList.add('active');
  panel.style.cssText='display:flex;flex-direction:column;position:fixed;inset:0;background:#f0ece4;z-index:9998;overflow-y:auto;padding:20px;box-sizing:border-box';
  ['spaViewDashboard','spaViewConfirm','spaViewServices','spaViewTherapists','spaViewRooms','spaViewPublic','spaViewPayroll'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  if(typeof spaCurView!=='undefined')spaCurView='calendar';
  let bar=document.getElementById('spaStaffTopBar');
  if(!bar){
    bar=document.createElement('div');
    bar.id='spaStaffTopBar';
    bar.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:14px;border-bottom:1.5px solid var(--border)';
    bar.innerHTML=`<div style="font-family:'Italiana',serif;font-size:20px;color:var(--dark)">Amansala Spa</div>
      <div style="display:flex;align-items:center;gap:14px;font-size:13px;color:var(--muted)">
        <div style="display:flex;gap:6px">
          <button id="spaStaffLangEn" onclick="spaStaffSetLang('en')" title="English" style="border:none;background:none;cursor:pointer;font-size:20px;line-height:1">🇺🇸</button>
          <button id="spaStaffLangEs" onclick="spaStaffSetLang('es')" title="Español" style="border:none;background:none;cursor:pointer;font-size:20px;line-height:1">🇲🇽</button>
        </div>
        <span>${escHtml(session.name)}</span>
        <button class="btn btn-secondary btn-sm" data-i18n="btn_sign_out" onclick="spaStaffLogout()">Sign Out</button>
      </div>`;
    panel.insertBefore(bar,panel.firstChild);
  }
  spaInit();
  setTimeout(()=>{spaStaffSetLang(spaStaffLang);},60);
}
