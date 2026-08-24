// ===== admin-staff.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== ADMIN DONE TASKS =====
let adminDone={};
function loadAdminDone(){
  adminDone=JSON.parse(localStorage.getItem('amansala_admin_done')||'{}');
  const limit=Date.now()-30*24*3600*1000;
  Object.keys(adminDone).forEach(k=>{if(new Date(adminDone[k].ts).getTime()<limit)delete adminDone[k];});
  localStorage.setItem('amansala_admin_done',JSON.stringify(adminDone));
}
function saveAdminDone(){localStorage.setItem('amansala_admin_done',JSON.stringify(adminDone));}
function dbMarkDone(bkId,type,label){adminDone[bkId+'_'+type]={ts:new Date().toISOString(),label};saveAdminDone();buildDashboard();logActivity('Task completed',label,bkId);showToast(label+' — marked done ✓');}
function dbUnmarkDone(key){delete adminDone[key];saveAdminDone();buildDashboard();}


// ===== STAFF ACCOUNTS =====
const DEF_STAFF=[
  {id:'staff_001',name:'Darlene',username:'darlene',password:'amansala2024',role:'admin',active:true},
  {id:'staff_002',name:'Front Desk',username:'frontdesk',password:'welcome1',role:'staff',active:true},
];
let staffAccounts=[];
let currentSession=null;

function loadStaff(){
  const raw=localStorage.getItem('amansala_staff');
  if(raw){try{staffAccounts=JSON.parse(raw);}catch{staffAccounts=DEF_STAFF.map(s=>({...s}));}}
  else{staffAccounts=DEF_STAFF.map(s=>({...s}));localStorage.setItem('amansala_staff',JSON.stringify(staffAccounts));}
  // Deduplicate: keep only the last entry per username
  const seen=new Map();
  staffAccounts.forEach(s=>seen.set(s.username.toLowerCase(),s));
  staffAccounts=[...seen.values()];
  // Ensure active field is set (accounts created before this field existed)
  staffAccounts.forEach(s=>{if(s.active===undefined)s.active=true;});
  // If somehow empty, restore defaults
  if(!staffAccounts.length){staffAccounts=DEF_STAFF.map(s=>({...s}));}
}
function saveStaff(){
  localStorage.setItem('amansala_staff',JSON.stringify(staffAccounts));
  (async()=>{try{await db.from('app_store').upsert({key:'staffAccounts',value:staffAccounts,updated_at:new Date().toISOString()});}catch(e){console.warn('Staff sync failed:',e);}})();
}

function getCurrentSession(){
  if(currentSession)return currentSession;
  const raw=sessionStorage.getItem('amansala_staff_session');
  if(raw){try{currentSession=JSON.parse(raw);}catch{currentSession=null;}}
  return currentSession;
}

function applySession(session){
  currentSession=session;
  const badge=document.getElementById('staffUserBadge');
  if(badge){badge.style.display='block';}
  const nameEl=document.getElementById('staffBadgeName');
  const roleEl=document.getElementById('staffBadgeRole');
  if(nameEl)nameEl.textContent=session.name;
  if(roleEl)roleEl.textContent=session.role==='admin'?'Admin':'Staff';
  if(session.role==='admin'){
    const btn=document.getElementById('staffManageBtn');if(btn)btn.style.display='';
    const btn2=document.getElementById('staffSideBtn');if(btn2)btn2.style.display='flex';
    const cb=document.getElementById('actClearBtn');if(cb)cb.style.display='';
  }
  document.querySelectorAll('.tab-btn').forEach(b=>b.style.pointerEvents='');
}

function staffLoginSubmit(){
  const username=document.getElementById('staffLoginUser').value.trim().toLowerCase();
  const password=document.getElementById('staffLoginPass').value;
  const errEl=document.getElementById('staffLoginErr');
  errEl.textContent='';
  if(!username||!password){errEl.textContent='Please enter your username and password.';return;}
  const MASTER=[
    {id:'staff_001',name:'Darlene',username:'darlene',password:'amansala2024',role:'admin'},
    {id:'staff_002',name:'Front Desk',username:'frontdesk',password:'welcome1',role:'staff'},
  ];
  function tryLogin(){
    let account=staffAccounts.find(s=>s.active&&s.username.toLowerCase()===username&&s.password===password);
    if(!account){account=MASTER.find(s=>s.username===username&&s.password===password)||null;}
    return account;
  }
  let account=tryLogin();
  if(!account){
    // Not found locally — pull latest from Supabase then retry once
    errEl.textContent='Checking credentials…';
    db.from('app_store').select('key,value').then(({data})=>{
      if(data){
        const row=data.find(r=>r.key==='staffAccounts');
        if(row&&Array.isArray(row.value)&&row.value.length){
          const seen=new Map();
          row.value.forEach(s=>s.username&&seen.set(s.username.toLowerCase(),s));
          staffAccounts.forEach(s=>{if(s.username&&!seen.has(s.username.toLowerCase()))seen.set(s.username.toLowerCase(),s);});
          staffAccounts=[...seen.values()];
          localStorage.setItem('amansala_staff',JSON.stringify(staffAccounts));
        }
      }
      account=tryLogin();
      if(!account){errEl.textContent='Incorrect username or password.';return;}
      errEl.textContent='';
      staffLoginComplete(account,MASTER);
    }).catch(()=>{errEl.textContent='Incorrect username or password.';});
    return;
  }
  staffLoginComplete(account,MASTER);
}

function staffLoginComplete(account,MASTER){
  // Ensure master accounts always have correct role
  const masterMatch=MASTER.find(s=>s.username===account.username.toLowerCase());
  if(masterMatch&&account.role!==masterMatch.role){
    account={...account,role:masterMatch.role};
    const idx=staffAccounts.findIndex(s=>s.username.toLowerCase()===account.username.toLowerCase());
    if(idx>=0){staffAccounts[idx].role=masterMatch.role;saveStaff();}
  }
  const session={id:account.id,name:account.name,role:account.role};
  sessionStorage.setItem('amansala_staff_session',JSON.stringify(session));
  localStorage.setItem('ama_admin_device','1');
  localStorage.removeItem('ama_teacher_persist');
  localStorage.removeItem('teacher_bk_id');
  document.getElementById('staffLoginOverlay').style.display='none';
  applySession(session);
  logActivity('Signed in','',null);
  buildDashboard();
  venBuild();
}
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&document.getElementById('staffLoginOverlay')?.style.display!=='none')staffLoginSubmit();});

function staffLogout(){
  if(!confirm('Sign out of the Amansala portal?'))return;
  sessionStorage.removeItem('amansala_staff_session');
  currentSession=null;
  location.reload();
}

function initStaffLogin(){
  if(IS_EVENT_MODE){initEventMode();return;}
  if(IS_TEACHER_MODE){initTeacherMode();return;}
  if(typeof IS_DRIVER_MODE!=='undefined'&&IS_DRIVER_MODE){initDriverMode();return;}
  loadStaff();
  let session=getCurrentSession();
  if(session){
    // Re-validate role: master accounts always get their correct role
    const MASTER_ROLES={darlene:'admin',frontdesk:'staff'};
    const masterRole=MASTER_ROLES[session.name?.toLowerCase()]||MASTER_ROLES[session.id==='staff_001'?'darlene':session.id==='staff_002'?'frontdesk':''];
    if(masterRole&&session.role!==masterRole){
      session={...session,role:masterRole};
      sessionStorage.setItem('amansala_staff_session',JSON.stringify(session));
      currentSession=session;
    }
    applySession(session);
    buildDashboard();
    venBuild();
    const _retBk=sessionStorage.getItem('ama_admin_return_bk');
    if(_retBk){
      sessionStorage.removeItem('ama_admin_return_bk');
      const _retBtn=[...document.querySelectorAll('.tab-btn')].find(b=>b.textContent.trim()==='Teachers');
      if(_retBtn){switchTab('teacherreg',_retBtn);setTimeout(()=>regSelectRetreat(_retBk),80);}
    } else {
      const _lastTab=localStorage.getItem('ama_last_tab');
      const _lastRegBk=localStorage.getItem('ama_last_reg_bk');
      if(_lastTab&&_lastTab!=='dashboard'){
        const _lastBtn=[...document.querySelectorAll('.tab-btn')].find(b=>(b.getAttribute('onclick')||'').includes(`'${_lastTab}'`));
        if(_lastBtn){
          switchTab(_lastTab,_lastBtn);
          if(_lastTab==='teacherreg'&&_lastRegBk){setTimeout(()=>regSelectRetreat(_lastRegBk),80);}
        }
      }
    }
    return;
  }
  document.getElementById('staffLoginOverlay').style.display='flex';
  document.querySelectorAll('.tab-btn').forEach(b=>b.style.pointerEvents='none');
  setTimeout(()=>document.getElementById('staffLoginUser')?.focus(),120);
}


// ===== ACTIVITY LOG =====
function loadActivityLog(){try{return JSON.parse(localStorage.getItem('amansala_activity_log')||'[]');}catch{return [];}}

function logActivity(action,detail,bkId){
  const session=getCurrentSession();
  const entry={
    id:uid(),ts:new Date().toISOString(),
    userId:session?.id||'system',userName:session?.name||'System',userRole:session?.role||'system',
    action:action||'',detail:detail||'',bkId:bkId||null
  };
  const log=loadActivityLog();
  log.unshift(entry);
  if(log.length>1000)log.splice(1000);
  localStorage.setItem('amansala_activity_log',JSON.stringify(log));
}

function buildActivityLog(){
  const log=loadActivityLog();
  const filterUser=(document.getElementById('actFilterUser')||{}).value||'';
  const filterRole=(document.getElementById('actFilterRole')||{}).value||'';
  const feed=document.getElementById('actFeed');if(!feed)return;

  const userSel=document.getElementById('actFilterUser');
  if(userSel){
    const names=[...new Set(log.map(e=>e.userName))].filter(Boolean).sort();
    const cur=userSel.value;
    userSel.innerHTML='<option value="">All Staff</option>'+names.map(n=>`<option value="${n}"${n===cur?' selected':''}>${n}</option>`).join('');
  }

  let filtered=log;
  if(filterUser)filtered=filtered.filter(e=>e.userName===filterUser);
  if(filterRole)filtered=filtered.filter(e=>e.userRole===filterRole);

  if(!filtered.length){feed.innerHTML='<div style="padding:40px;text-align:center;color:var(--muted);font-size:13px;font-style:italic">No activity recorded yet.</div>';return;}

  const today=new Date().toISOString().slice(0,10);
  const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const groups={};
  filtered.forEach(e=>{const d=e.ts.slice(0,10);if(!groups[d])groups[d]=[];groups[d].push(e);});

  feed.innerHTML=Object.entries(groups).map(([date,entries])=>{
    let label=date;
    if(date===today)label='Today';
    else if(date===yesterday)label='Yesterday';
    else{const d=new Date(date+'T12:00:00');label=d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});}
    const rows=entries.map(e=>{
      const role=e.userRole||'staff';
      const initials=(e.userName||'?').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
      const t=new Date(e.ts);
      const timeStr=t.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
      return `<div class="act-entry">
        <div class="act-avatar role-${role}">${initials}</div>
        <div class="act-body">
          <div><span class="act-who">${e.userName}</span><span class="act-who-role">${role}</span></div>
          <div class="act-action">${e.action}</div>
          ${e.detail?`<div class="act-detail">${e.detail}</div>`:''}
          <div class="act-time">${timeStr}</div>
        </div>
      </div>`;
    }).join('');
    return `<div class="act-day-label">${label}</div>${rows}`;
  }).join('');
}

function clearActivityLog(){
  const session=getCurrentSession();
  if(session?.role!=='admin'){showToast('Admin access required.');return;}
  if(!confirm('Clear all activity log entries? This cannot be undone.'))return;
  localStorage.removeItem('amansala_activity_log');
  buildActivityLog();
  showToast('Activity log cleared.');
}


// ===== MANAGE STAFF =====
function openManageStaff(){renderStaffList();openModal('manageStaffModal');}

function renderStaffList(){
  const body=document.getElementById('staffListBody');if(!body)return;
  if(!staffAccounts.length){body.innerHTML='<div style="color:var(--muted);font-size:13px;padding:8px 0">No staff accounts.</div>';return;}
  body.innerHTML=staffAccounts.map(s=>{
    const initials=(s.name||'?').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
    return `<div class="staff-row">
      <div class="staff-avatar-sm${s.role==='admin'?' admin':''}">${initials}</div>
      <div style="flex:1">
        <div style="font-size:13.5px;font-weight:600;color:var(--dark)">${s.name}${!s.active?' <span style="color:#dc2626;font-size:12px;font-weight:400">(inactive)</span>':''}</div>
        <div style="font-size:12px;color:var(--muted)">@${s.username} · ${s.role}</div>
      </div>
      <button class="btn btn-secondary" style="font-size:12px;padding:5px 12px" onclick="copyStaffLogin('${s.id}')">Copy Login</button>
      <button class="btn btn-secondary" style="font-size:12px;padding:5px 12px" onclick="openEditStaff('${s.id}')">Edit</button>
      ${s.id!=='staff_001'?`<button class="btn btn-secondary" style="font-size:12px;padding:5px 12px;color:${s.active?'#dc2626':'#16a34a'}" onclick="toggleStaffActive('${s.id}')">${s.active?'Deactivate':'Activate'}</button>`:''}
      ${s.id!=='staff_001'&&s.id!=='staff_002'?`<button class="btn btn-secondary" style="font-size:12px;padding:5px 12px;color:#dc2626;border-color:#fca5a5" onclick="deleteStaffMember('${s.id}')">Delete</button>`:''}
    </div>`;
  }).join('');
}

function copyStaffLogin(id){
  const s=staffAccounts.find(a=>a.id===id);if(!s)return;
  const url=window.location.origin+window.location.pathname;
  const text=`Amansala Staff Portal Login\nURL: ${url}\nUsername: ${s.username}\nPassword: ${s.password}`;
  navigator.clipboard.writeText(text).then(()=>showToast('Login info copied to clipboard!')).catch(()=>{
    prompt('Copy this login info:',text);
  });
}

function openAddStaff(){
  document.getElementById('editStaffTitle').textContent='Add Staff Member';
  ['esId','esName','esUser','esPass'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('esRole').value='staff';
  openModal('editStaffModal');
}

function openEditStaff(id){
  const s=staffAccounts.find(a=>a.id===id);if(!s)return;
  document.getElementById('editStaffTitle').textContent='Edit Staff Member';
  document.getElementById('esId').value=s.id;
  document.getElementById('esName').value=s.name;
  document.getElementById('esUser').value=s.username;
  document.getElementById('esPass').value=s.password;
  document.getElementById('esRole').value=s.role;
  openModal('editStaffModal');
}

function saveStaffMember(){
  try{
    const id=document.getElementById('esId')?document.getElementById('esId').value:'';
    const nameEl=document.getElementById('esName');
    const userEl=document.getElementById('esUser');
    const passEl=document.getElementById('esPass');
    const roleEl=document.getElementById('esRole');
    if(!nameEl||!userEl||!passEl||!roleEl){showToast('Form error — please reload the page.');return;}
    const name=nameEl.value.trim();
    const username=userEl.value.trim().toLowerCase();
    const password=passEl.value;
    const role=roleEl.value;
    if(!name){showToast('Please enter a name.');return;}
    if(!username){showToast('Please enter a username.');return;}
    if(!password){showToast('Please enter a password.');return;}
    if(id){
      const s=staffAccounts.find(a=>a.id===id);
      if(s){s.name=name;s.username=username;s.password=password;s.role=role;}
    }else{
      staffAccounts.push({id:uid(),name,username,password,role,active:true});
    }
    localStorage.setItem('amansala_staff',JSON.stringify(staffAccounts));
    closeModal('editStaffModal');
    try{renderStaffList();}catch(e){console.warn('[staff] renderList:',e);}
    try{logActivity('Staff account '+(id?'updated':'added'),`${name} (@${username}, ${role})`,null);}catch(e){}
    showToast('Saving '+(id?'changes':'account')+'…');
    db.from('app_store').upsert({key:'staffAccounts',value:staffAccounts,updated_at:new Date().toISOString()})
      .then(({error})=>{
        if(error)showToast('⚠️ Cloud sync failed — Kat may not be able to log in from another device. Try again.');
        else showToast('Staff member '+(id?'updated':'added')+': '+name+' ✓ Synced to cloud');
      }).catch(()=>showToast('⚠️ Cloud sync failed — staff account saved locally only.'));
  }catch(e){
    console.error('[staff] saveStaffMember error:',e);
    showToast('Save failed: '+e.message);
  }
}

function toggleStaffActive(id){
  const s=staffAccounts.find(a=>a.id===id);if(!s)return;
  s.active=!s.active;saveStaff();renderStaffList();
  logActivity('Staff account '+(s.active?'activated':'deactivated'),s.name,null);
  showToast(`${s.name} ${s.active?'activated':'deactivated'}.`);
}
function deleteStaffMember(id){
  const s=staffAccounts.find(a=>a.id===id);if(!s)return;
  if(!confirm(`Delete ${s.name} (@${s.username})? This cannot be undone.`))return;
  staffAccounts=staffAccounts.filter(a=>a.id!==id);
  saveStaff();renderStaffList();
  logActivity('Staff account deleted',`${s.name} (@${s.username})`,null);
  showToast(`${s.name} deleted.`);
}

