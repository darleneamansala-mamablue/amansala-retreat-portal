// ===== salsa-rule.js — Group Salsa Class is NEVER on the same night as the offsite dinner or a ceremony (Darlene 2026-10-16) =====
// Loaded as a classic script AFTER activity-rules.js and the activity sheet; shares global scope. Standalone: no other module is edited.
//   - A night is "taken" when the retreat has the offsite dinner (Gitano ao13, Offsite Dinner Onsite ao11) or an evening ceremony
//     (Sound Healing & Cacao ao4, Temazcal ao5, or anything in the Ceremony category at 5pm or later) on it.
//   - Salsa (ao12) in the evening on a taken night is moved to the NEAREST night of the stay with free time (never arrival or
//     departure day, never a night that already has a ceremony / dinner / another salsa). Enforced right before every save.
//   - If every night is taken, salsa is offered in the DAYTIME instead (SR_DAY_TIME on the same date) and a notice is shown.
//   - Moving salsa by hand (Activity Sheet date, Review Schedule date) onto a taken night is refused with a message; free nights and
//     daytime times are always allowed.
//   - Every automatic move leaves a notice on the retreat (bk.salsaNotice) shown as an amber banner on the Venues and Room Calendar
//     tabs, with a Dismiss button. Admin only; never shown to teachers.
// Past retreats are never touched. Change the constants below to change the rules.

const SR_SALSA='ao12';
const SR_BLOCKERS=['ao13','ao11','ao4','ao5'];
const SR_EVENING_FROM='17:00';
const SR_DAY_TIME='16:00';

function srD(s){return String(s||'').slice(0,10);}
function srTime(a){return a.time||((typeof tourDefaultTime==='function'&&tourDefaultTime(SR_SALSA))||'20:30');}
function srIsEvening(t){return String(t||'')>=SR_EVENING_FROM;}
function srIsCeremonyEvening(a){
  if(SR_BLOCKERS.includes(a.aoId))return true;
  const ao=(typeof ADD_ONS!=='undefined'?ADD_ONS:[]).find(x=>x.id===a.aoId);
  return !!(ao&&String(ao.category||ao.cat||'').toLowerCase()==='ceremony'&&srIsEvening(a.time));
}
// what is on that night (other than the salsa entry itself)
function srTaken(bk,date,exceptAct){
  return (bk.retreatActivities||[]).some(a=>a!==exceptAct&&srD(a.date)===date&&(srIsCeremonyEvening(a)||(a.aoId===SR_SALSA&&srIsEvening(srTime(a)))));
}
function srNights(bk){
  const s=srD(bk.startDate),e=srD(bk.endDate),out=[];
  if(!s||!e)return out;
  for(let t=new Date(s+'T12:00:00').getTime()+86400000;;t+=86400000){
    const d=new Date(t).toISOString().slice(0,10);if(d>=e)break;out.push(d);
  }
  return out;
}
function srFmt(d){
  try{const x=new Date(d+'T12:00:00');return x.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});}catch(e){return d;}
}
function srEnforce(bk){
  const acts=bk&&bk.retreatActivities;
  if(!Array.isArray(acts)||!acts.length)return 0;
  const nights=srNights(bk);
  let changed=0;
  acts.filter(a=>a&&a.aoId===SR_SALSA).forEach(a=>{
    const d=srD(a.date);
    if(!d||!nights.includes(d))return;                       // arrival/departure/outside the stay: a person decides
    if(!srIsEvening(srTime(a))||!srTaken(bk,d,a))return;       // daytime, or the night is free: fine
    const free=nights.filter(n=>n!==d&&!srTaken(bk,n,a)&&!(typeof iaClash==='function'&&iaClash(bk,SR_SALSA,n)))
      .sort((x,y)=>Math.abs(new Date(x)-new Date(d))-Math.abs(new Date(y)-new Date(d))||x.localeCompare(y));
    const who=bk.leaderName||bk.retreatName||'this retreat';
    if(free.length){
      a.date=free[0];
      bk.salsaNotice=`Salsa moved from ${srFmt(d)} to ${srFmt(free[0])} — ${srFmt(d)} has the offsite dinner or a ceremony.`;
    }else{
      a.time=SR_DAY_TIME;
      bk.salsaNotice=`Every night has the offsite dinner or a ceremony, so Salsa is offered in the DAYTIME instead (${srFmt(d)} at ${SR_DAY_TIME}). Change it in the Activity Sheet if you prefer another time.`;
    }
    bk.retreatActivitiesUpdatedAt=new Date().toISOString();
    changed++;
    if(typeof showToast==='function')showToast(`${who}: ${bk.salsaNotice}`);
  });
  return changed;
}
if(typeof saveAll==='function'){
  const _srOrigSaveAll=saveAll;
  saveAll=function(){
    try{
      const today=new Date().toISOString().slice(0,10);
      (AppData.bookings||[]).forEach(bk=>{
        if(bk.status==='cancelled'||(bk.flags||[]).includes('archived')||bk.bookingType==='room_only')return;
        if(srD(bk.endDate)<today)return;
        srEnforce(bk);
      });
    }catch(e){console.warn('[salsa-rule]',e);}
    const r=_srOrigSaveAll.apply(this,arguments);
    try{srRender();}catch(e){}
    return r;
  };
}

// ---- manual moves: refuse a taken night, with a message ----
function srRefuse(bk,date,time,act){
  if(!bk||!date||!srIsEvening(time||srTime(act||{})))return false;
  if(!srNights(bk).includes(date))return false;
  if(!srTaken(bk,date,act||null))return false;
  const free=srNights(bk).filter(n=>!srTaken(bk,n,act||null));
  if(typeof showToast==='function')showToast(`Salsa can't be on ${srFmt(date)}: that night has the offsite dinner or a ceremony. `+(free.length?`Free nights: ${free.map(srFmt).join(', ')}.`:`No free night — choose a daytime time instead.`));
  return true;
}
if(typeof actSummarySetDate==='function'){
  const _srOrigSet=actSummarySetDate;
  actSummarySetDate=function(aoId,bkIds,dateInputId,timeInputId){
    if(aoId===SR_SALSA){
      const date=(document.getElementById(dateInputId)||{}).value||'',time=(document.getElementById(timeInputId)||{}).value||'';
      const bad=(bkIds||[]).some(id=>{const bk=(AppData.bookings||[]).find(b=>b.id===id);const act=bk&&(bk.retreatActivities||[]).find(a=>a.aoId===SR_SALSA);return srRefuse(bk,date,time,act);});
      if(bad)return;
    }
    return _srOrigSet.apply(this,arguments);
  };
}
if(typeof svChangeActivityDate==='function'){
  const _srOrigChange=svChangeActivityDate;
  svChangeActivityDate=function(bkId,idx,newDate){
    const bk=(AppData.bookings||[]).find(b=>b.id===bkId),act=bk&&(bk.retreatActivities||[])[idx];
    if(act&&act.aoId===SR_SALSA&&srRefuse(bk,srD(newDate),srTime(act),act))return;
    return _srOrigChange.apply(this,arguments);
  };
}

// ---- notice banner (admin only) ----
function srEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function srIsTeacherView(){try{return !!(typeof IS_TEACHER_MODE!=='undefined'&&IS_TEACHER_MODE&&!document.body.classList.contains('admin-preview'));}catch(e){return false;}}
function srDismiss(bkId){
  const bk=(AppData.bookings||[]).find(b=>b.id===bkId);
  if(bk){delete bk.salsaNotice;bk.retreatActivitiesUpdatedAt=new Date().toISOString();}
  if(typeof saveAll==='function')saveAll();
  srRender();
}
function srRender(){
  const hosts=['tab-venues','tab-roomcal'].map(id=>document.getElementById(id)).filter(Boolean);
  hosts.forEach(h=>h.querySelector('.sr-alert')?.remove());
  if(srIsTeacherView()||!hosts.length||typeof AppData==='undefined'||!AppData.bookings)return;
  const today=new Date().toISOString().slice(0,10);
  const list=AppData.bookings.filter(b=>b.salsaNotice&&b.status!=='cancelled'&&srD(b.endDate)>=today);
  if(!list.length)return;
  const rows=list.map(b=>`<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:5px 0">
    <span style="flex:1;min-width:240px;font-size:13px;color:#78350f;font-weight:600"><b>${srEsc(b.leaderName||b.retreatName||'Retreat')}</b>: ${srEsc(b.salsaNotice)}</span>
    <button type="button" onclick="srDismiss('${srEsc(b.id)}')" style="padding:5px 12px;font-size:12px;font-weight:600;border:1.5px solid #d6c4a1;color:#78350f;background:#fff;border-radius:8px;cursor:pointer">Dismiss</button></div>`).join('');
  hosts.forEach(h=>{
    const el=document.createElement('div');el.className='sr-alert';
    el.style.cssText='margin:8px 16px 0;padding:8px 14px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px';
    el.innerHTML=`<div style="font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#92400e">Admin alert · Salsa</div>${rows}`;
    h.insertBefore(el,h.firstChild);
  });
}
(function(){
  ['venBuild','rcBuild'].forEach(n=>{
    const f=window[n];if(typeof f!=='function')return;
    window[n]=function(){const r=f.apply(this,arguments);try{srRender();}catch(e){}return r;};
  });
  try{srRender();}catch(e){}
})();
