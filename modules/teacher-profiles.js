// ===== teacher-profiles.js — Teacher/Group profile directory =====
// Loaded as a classic script; shares global scope (same pattern as cb-portal-sync.js).
// Own module, own storage, own tab — notes that follow a teacher or group
// across every retreat they bring, independent of any single booking (a
// bk.notes field only ever applied to that one retreat and got lost the
// next time the same group booked under a new booking record).

let teacherProfiles=[];
let tpEditId=null;

function tpLoad(){
  try{teacherProfiles=JSON.parse(localStorage.getItem('amansala_teacher_profiles')||'[]');}catch{teacherProfiles=[];}
}
// Populate from local cache immediately at script load — the venue-booking
// modal's profile-match banner (tpCheckMatch) can be triggered long before
// the admin ever visits the Teacher Profiles tab, so it can't wait for tpInit().
tpLoad();
async function tpSyncFromSupabase(){
  try{
    const{data}=await db.from('app_store').select('value').eq('key','teacherProfiles').maybeSingle();
    if(Array.isArray(data?.value))teacherProfiles=data.value;
  }catch(e){}
}
function tpSaveAll(){
  localStorage.setItem('amansala_teacher_profiles',JSON.stringify(teacherProfiles));
  (async()=>{try{await db.from('app_store').upsert({key:'teacherProfiles',value:teacherProfiles,updated_at:new Date().toISOString()});}catch(e){console.warn('Teacher profile sync failed:',e);}})();
}

function tpInit(){
  tpLoad();
  tpRender();
  tpSyncFromSupabase().then(()=>tpRender());
}

// A profile "matches" a booking when its name/email/any alias case-insensitively
// appears in (or contains) the booking's leader name, retreat name, or email —
// permissive enough to catch "Awaken Retreats" matching a retreat named just
// "Awaken", without matching on very short/common substrings.
function tpNorm(s){return(s||'').toLowerCase().trim();}
function tpNamesOverlap(a,b){
  a=tpNorm(a);b=tpNorm(b);
  if(!a||!b||a.length<3||b.length<3)return false;
  return a.includes(b)||b.includes(a);
}
function tpFindMatch(bk){
  if(!bk)return null;
  return teacherProfiles.find(p=>{
    const names=[p.name,...(p.aliases||[])];
    if(p.email&&bk.leaderEmail&&tpNorm(p.email)===tpNorm(bk.leaderEmail))return true;
    return names.some(n=>tpNamesOverlap(n,bk.leaderName)||tpNamesOverlap(n,bk.retreatName));
  })||null;
}

function tpRender(){
  const list=document.getElementById('tpList');if(!list)return;
  const q=tpNorm(document.getElementById('tpSearch')?.value);
  const items=teacherProfiles.filter(p=>!q||tpNorm(p.name).includes(q)||(p.aliases||[]).some(a=>tpNorm(a).includes(q))||tpNorm(p.notes).includes(q))
    .sort((a,b)=>tpNorm(a.name).localeCompare(tpNorm(b.name)));
  if(!items.length){
    list.innerHTML=`<div style="text-align:center;color:#8a7e74;font-size:13px;padding:60px 0;background:#fff;border:1px solid #e8dfd4;border-radius:12px">${teacherProfiles.length?'No profiles match your search.':'No teacher profiles yet — click + New Profile to add one.'}</div>`;
    return;
  }
  const aoMap={};(typeof ADD_ONS!=='undefined'?ADD_ONS:[]).forEach(a=>aoMap[a.id]=a);
  list.innerHTML=items.map(p=>{
    const acts=(p.recommendedActivities||[]).map(id=>aoMap[id]?.name||id);
    return `<div onclick="tpOpenEdit('${p.id}')" style="background:#fff;border:1px solid #e8dfd4;border-radius:12px;padding:16px 20px;margin-bottom:12px;cursor:pointer;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 10px rgba(0,0,0,.06)'" onmouseout="this.style.boxShadow='none'">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:15px;font-weight:700;color:#2d2520">${escHtml(p.name)}</span>
        ${p.email?`<span style="font-size:11.5px;color:#8a7e74">${escHtml(p.email)}</span>`:''}
      </div>
      ${(p.aliases||[]).length?`<div style="font-size:11.5px;color:#8a7e74;margin-top:3px">Also: ${p.aliases.map(escHtml).join(', ')}</div>`:''}
      ${p.notes?`<div style="font-size:12.5px;color:#5a5048;margin-top:8px;line-height:1.6;white-space:pre-wrap">${escHtml(p.notes).slice(0,240)}${p.notes.length>240?'…':''}</div>`:''}
      ${acts.length?`<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:5px">${acts.map(n=>`<span style="font-size:10.5px;font-weight:700;background:#f0f9f9;color:#2d6a6a;border-radius:99px;padding:2px 9px">${escHtml(n)}</span>`).join('')}</div>`:''}
    </div>`;
  }).join('');
}

function tpOpenEdit(id){
  tpEditId=id;
  const p=id?teacherProfiles.find(x=>x.id===id):null;
  document.getElementById('tpModalTitle').textContent=p?'Edit Profile':'New Profile';
  document.getElementById('tp-id').value=id||'';
  document.getElementById('tp-name').value=p?.name||'';
  document.getElementById('tp-email').value=p?.email||'';
  document.getElementById('tp-aliases').value=(p?.aliases||[]).join(', ');
  document.getElementById('tp-notes').value=p?.notes||'';
  const grid=document.getElementById('tpActivityGrid');
  const selected=new Set(p?.recommendedActivities||[]);
  grid.innerHTML=(typeof ADD_ONS!=='undefined'?ADD_ONS:[]).filter(a=>a.id!=='ao13').map(a=>{
    const on=selected.has(a.id);
    return `<button type="button" data-ao="${a.id}" onclick="tpToggleActivityChip(this)" style="padding:6px 12px;border-radius:8px;font-family:'Jost',sans-serif;font-size:12px;font-weight:${on?700:500};cursor:pointer;border:1.5px solid ${on?'var(--teal)':'var(--border)'};background:${on?'#f0f9f9':'#fff'};color:${on?'var(--teal)':'var(--dark)'}">${escHtml(a.name)}</button>`;
  }).join('');
  document.getElementById('tpDeleteBtn').style.display=id?'inline-flex':'none';
  openModal('tpModal');
}
function tpToggleActivityChip(btn){
  const on=btn.style.borderColor==='var(--teal)'||btn.getAttribute('data-on')==='1';
  const next=!on;
  btn.setAttribute('data-on',next?'1':'0');
  btn.style.fontWeight=next?'700':'500';
  btn.style.border=next?'1.5px solid var(--teal)':'1.5px solid var(--border)';
  btn.style.background=next?'#f0f9f9':'#fff';
  btn.style.color=next?'var(--teal)':'var(--dark)';
}

function tpSave(){
  const name=document.getElementById('tp-name').value.trim();
  if(!name){showToast('Please enter a name or group.');return;}
  const email=document.getElementById('tp-email').value.trim();
  const aliases=document.getElementById('tp-aliases').value.split(',').map(s=>s.trim()).filter(Boolean);
  const notes=document.getElementById('tp-notes').value.trim();
  const recommendedActivities=[...document.querySelectorAll('#tpActivityGrid button')].filter(b=>b.getAttribute('data-on')==='1').map(b=>b.getAttribute('data-ao'));
  const id=document.getElementById('tp-id').value;
  if(id){
    const p=teacherProfiles.find(x=>x.id===id);
    if(p)Object.assign(p,{name,email,aliases,notes,recommendedActivities,updatedAt:new Date().toISOString()});
  } else {
    teacherProfiles.push({id:uid(),name,email,aliases,notes,recommendedActivities,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  }
  tpSaveAll();
  closeModal('tpModal');
  tpRender();
  showToast('Profile saved ✓');
}
function tpDelete(){
  if(!tpEditId)return;
  if(!confirm('Delete this teacher profile? This cannot be undone.'))return;
  teacherProfiles=teacherProfiles.filter(x=>x.id!==tpEditId);
  tpSaveAll();
  closeModal('tpModal');
  tpRender();
  showToast('Profile deleted.');
}

// ── Venue/retreat-booking modal integration ──
// As Darlene types a leader/retreat name while adding or editing a retreat,
// surface any matching profile's notes right there so she doesn't have to
// remember to go check the Teacher Profiles tab separately.
function tpCheckMatch(){
  const banner=document.getElementById('tpMatchBanner');if(!banner)return;
  const leaderName=document.getElementById('vm-leader')?.value||'';
  const retreatName=document.getElementById('vm-retreat')?.value||'';
  const fakeB={leaderName,retreatName};
  const p=tpFindMatch(fakeB);
  if(!p){banner.style.display='none';banner.innerHTML='';return;}
  const aoMap={};(typeof ADD_ONS!=='undefined'?ADD_ONS:[]).forEach(a=>aoMap[a.id]=a);
  const acts=(p.recommendedActivities||[]).map(id=>aoMap[id]?.name||id);
  banner.style.display='block';
  banner.innerHTML=`<div style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:10px;padding:12px 16px;margin:2px 0 10px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:12.5px;font-weight:700;color:#92400e">📋 Matches profile: ${escHtml(p.name)}</span>
      <button type="button" onclick="tpOpenEdit('${p.id}')" style="margin-left:auto;font-size:11px;font-weight:700;color:#92400e;background:none;border:1px solid #92400e;border-radius:6px;padding:2px 9px;cursor:pointer">View/Edit</button>
    </div>
    ${p.notes?`<div style="font-size:12.5px;color:#78350f;margin-top:6px;line-height:1.6;white-space:pre-wrap">${escHtml(p.notes)}</div>`:''}
    ${acts.length?`<div style="margin-top:6px;font-size:11.5px;color:#92400e"><b>Loves:</b> ${acts.map(escHtml).join(', ')}</div>`:''}
  </div>`;
}
