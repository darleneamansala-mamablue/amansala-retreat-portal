// ===== included-activity-rule.js — an INCLUDED activity is never given to two groups on the same day (Darlene 2026-10-16) =====
// Loaded as a classic script AFTER teacher-portal.js, activity-sheet.js and salsa-rule.js; shares global scope. Standalone: no other
// module is edited.
//   - Temazcal (ao5) is one ceremony a night: a retreat that has it on a day blocks every other retreat from it that day, included or optional
//     (a retreat's own two groups, see temazcal-split.js, are fine).
//   - Group Salsa Class (ao12) and Cooking Class (ao14) are included for EVERY retreat, and Sound Healing & Cacao (ao4) is included when
//     it is in the retreat's package. The teacher's "Prepaid Package" box therefore always lists Salsa and Cooking (shown "not yet
//     set" until they are scheduled), so they can be scheduled like the other included activities.
//   - When a retreat has an included activity on a day, no other retreat can be given that same activity on that day. Refused with a
//     message (naming the other retreat) when assigned by hand: Review Schedule day, Add activity, Activity Sheet date, or a teacher's
//     "Request a time". Auto-assign moves a clashing activity to the nearest day that is free.
//   - Exception: a SMALL group (fewer guests than the small-group minimum in Manage Tours, default 6) does not block and is not blocked.
// Change the constants below to change the rules.

const IA_EXCLUSIVE=['ao4','ao5','ao12'];  // activities that only one group can have on a given day (Cooking Class ao14 is NOT here: any number of groups can have it the same day, Darlene 2026-10-30 — nobody really attends it)
const IA_ALWAYS_BLOCK=['ao5'];                  // Temazcal: one ceremony slot a night, so ANY group having it blocks the others (included or optional)
const IA_ALWAYS_INCLUDED=['ao12','ao14'];     // included for every retreat (Salsa, Cooking)

function iaPax(bk){return Number(bk&&bk.pax)||0;}
function iaMinPax(){try{return (typeof _sgp!=='undefined'&&_sgp&&Number(_sgp.minPax))||6;}catch(e){return 6;}}
function iaSmall(bk){const n=iaPax(bk);return n>0&&n<iaMinPax();}
function iaIncluded(bk,act){
  if(!act||!IA_EXCLUSIVE.includes(act.aoId))return false;
  return IA_ALWAYS_INCLUDED.includes(act.aoId)||!!act.prepaid||(bk.packages||[]).includes(act.aoId);
}
// does this retreat's activity stop other retreats having the same one that day?
function iaBlocks(bk,act){return !!act&&(IA_ALWAYS_BLOCK.includes(act.aoId)||iaIncluded(bk,act));}
function iaFmt(d){try{return new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});}catch(e){return d;}}
function iaName(id){const a=(typeof ADD_ONS!=='undefined'?ADD_ONS:[]).find(x=>x.id===id);return (a&&a.name)||id;}
// the other retreat that already has this included activity on that day, if any
function iaClash(bk,aoId,date){
  if(!bk||!date||!IA_EXCLUSIVE.includes(aoId)||iaSmall(bk))return null;
  // Sound Healing & Cacao: a group that did not prepay it is put at the same time as the others — never blocked (Darlene 2026-10-30)
  if(aoId==='ao4'&&!((bk.packages||[]).includes('ao4')||(bk.retreatActivities||[]).some(x=>x&&x.aoId==='ao4'&&x.prepaid)))return null;
  const today=new Date().toISOString().slice(0,10);
  return (AppData.bookings||[]).find(o=>{
    if(o===bk||o.id===bk.id||o.status==='cancelled'||(o.flags||[]).includes('archived')||String(o.endDate||'').slice(0,10)<today)return false;
    if(iaSmall(o))return false;
    return (o.retreatActivities||[]).some(a=>a&&a.aoId===aoId&&String(a.date||'').slice(0,10)===date&&iaBlocks(o,a));
  })||null;
}
function iaRefuse(bk,aoId,date,exceptAct){
  if(!IA_EXCLUSIVE.includes(aoId)||!date)return false;
  const o=iaClash(bk,aoId,date);
  if(!o)return false;
  if(typeof showToast==='function')showToast(`${iaName(aoId)} is already ${IA_ALWAYS_BLOCK.includes(aoId)?'booked':'included'} for ${o.leaderName||o.retreatName||'another retreat'} on ${iaFmt(date)}. Two groups can't have the same activity on the same day — pick another day (groups under ${iaMinPax()} guests are the exception).`);
  return true;
}
function iaBk(id){return (AppData.bookings||[]).find(b=>b.id===id);}

// ---- manual assignment guards ----
if(typeof svChangeActivityDate==='function'){
  const _o=svChangeActivityDate;
  svChangeActivityDate=function(bkId,idx,newDate){
    const bk=iaBk(bkId),act=bk&&(bk.retreatActivities||[])[idx];
    if(act&&iaRefuse(bk,act.aoId,String(newDate||'').slice(0,10),act)){if(typeof svRefreshActivityView==='function')svRefreshActivityView(bkId);return;}
    return _o.apply(this,arguments);
  };
}
if(typeof svAddActivity==='function'){
  const _o=svAddActivity;
  svAddActivity=function(bkId){
    const bk=iaBk(bkId);
    const aoId=(document.getElementById('svAddAoId')||{}).value,date=(document.getElementById('svAddAoDate')||{}).value;
    if(bk&&aoId&&iaRefuse(bk,aoId,date))return;
    return _o.apply(this,arguments);
  };
}
if(typeof actSummarySetDate==='function'){
  const _o=actSummarySetDate;
  actSummarySetDate=function(aoId,bkIds,dateInputId,timeInputId){
    const date=(document.getElementById(dateInputId)||{}).value||'';
    if((bkIds||[]).some(id=>{const bk=iaBk(id);return bk&&iaRefuse(bk,aoId,date);}))return;
    return _o.apply(this,arguments);
  };
}
if(typeof tsSaveConfirmedActivityRequest==='function'){
  const _o=tsSaveConfirmedActivityRequest;
  tsSaveConfirmedActivityRequest=function(aoId){
    const bk=iaBk(_tsBkId),date=(document.getElementById('tsActReqDate_'+aoId)||{}).value||'';
    if(bk&&iaRefuse(bk,aoId,date))return;
    return _o.apply(this,arguments);
  };
}
// ---- auto-assign: move a clashing included activity to the nearest day that is free ----
if(typeof svAutoAssignActivities==='function'){
  const _o=svAutoAssignActivities;
  svAutoAssignActivities=function(bkId){
    const r=_o.apply(this,arguments);
    try{
      const bk=iaBk(bkId);if(!bk)return r;
      const s=String(bk.startDate||'').slice(0,10),e=String(bk.endDate||'').slice(0,10);
      const days=[];for(let t=new Date(s+'T12:00:00').getTime()+86400000;;t+=86400000){const d=new Date(t).toISOString().slice(0,10);if(d>=e)break;days.push(d);}
      const stuck=[];let moved=0;
      (bk.retreatActivities||[]).forEach(a=>{
        const d=String(a.date||'').slice(0,10);
        if(!IA_EXCLUSIVE.includes(a.aoId)||a._iaDone||!iaClash(bk,a.aoId,d))return;
        const taken=new Set((bk.retreatActivities||[]).filter(x=>x!==a&&x.aoId===a.aoId).map(x=>String(x.date||'').slice(0,10)));
        const free=days.filter(x=>x!==d&&!taken.has(x)&&!iaClash(bk,a.aoId,x)).sort((x,y)=>Math.abs(new Date(x)-new Date(d))-Math.abs(new Date(y)-new Date(d))||x.localeCompare(y));
        if(free.length){(bk.retreatActivities||[]).filter(x=>x.aoId===a.aoId&&String(x.date||'').slice(0,10)===d).forEach(x=>{x.date=free[0];x._iaDone=true;});moved++;}else stuck.push(iaName(a.aoId));
      });
      (bk.retreatActivities||[]).forEach(x=>{delete x._iaDone;});
      if(moved||stuck.length){
        bk.retreatActivitiesUpdatedAt=bk.updatedAt=new Date().toISOString();
        if(typeof saveAll==='function')saveAll();
        if(typeof svRefreshActivityView==='function')svRefreshActivityView(bkId);
        if(typeof showToast==='function')showToast((moved?`${moved} included activit${moved>1?'ies':'y'} moved to a day no other group has it. `:'')+(stuck.length?`No free day for ${stuck.join(', ')} — another group already has it every day. Please schedule it by hand.`:''));
      }
    }catch(e){console.warn('[included-activity-rule]',e);}
    return r;
  };
}
// ---- the teacher's "Prepaid Package" box always lists Salsa and Cooking ----
// The list is built from bk.packages, so the two are added for the duration of the render only (nothing is saved to the retreat).
if(typeof tsRenderCalSection==='function'){
  const _o=tsRenderCalSection;
  tsRenderCalSection=function(bk){
    if(!bk)return _o.apply(this,arguments);
    const had=bk.packages;
    try{bk.packages=[...new Set([...(had||[]),...IA_ALWAYS_INCLUDED])];return _o.apply(this,arguments);}
    finally{if(had===undefined)delete bk.packages;else bk.packages=had;}
  };
}
