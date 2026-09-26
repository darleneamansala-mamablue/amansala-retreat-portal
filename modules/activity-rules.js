// ===== activity-rules.js — tour scheduling rules (Darlene's rule 2026-09-26) =====
// No tour is ever kept on a retreat's arrival day or departure day, and an
// entry with no tour attached (aoId missing / "undefined" — shows up as an
// "undefined" column on the sign-up sheet) is dropped. Enforced right before
// every save, so it holds no matter which screen added the tour (auto-assign,
// teacher requests, the activity sheet, manual adds).
// Past retreats are never touched. Entries dated completely outside the stay (e.g. a retreat whose dates moved
// but its tours didn't) are left alone — those need a person to decide
// whether to move them or remove them.

function tourDateAllowed(bk,date){
  if(!bk||!date)return false;
  const s=(bk.startDate||'').slice(0,10),e=(bk.endDate||'').slice(0,10);
  return date!==s&&date!==e;
}
function cleanRetreatActivities(bk){
  const acts=bk&&bk.retreatActivities;
  if(!Array.isArray(acts)||!acts.length)return 0;
  // Tours unchecked in "Tours for this group" (tour-picker.js) never stay on.
  const off=new Set(bk?.packageCustomPrices?.__cfg__?.tourOff||[]);
  const keep=acts.filter(a=>a&&a.aoId&&a.aoId!=='undefined'&&!off.has(a.aoId)&&tourDateAllowed(bk,(a.date||'').slice(0,10)));
  const removed=acts.length-keep.length;
  if(removed){bk.retreatActivities=keep;bk.retreatActivitiesUpdatedAt=new Date().toISOString();}
  return removed;
}
if(typeof saveAll==='function'){
  const _arOrigSaveAll=saveAll;
  saveAll=function(){
    try{
      // Current and future retreats only — past ones are history (a tour that
      // really happened on a departure day stays on record).
      const today=new Date().toISOString().slice(0,10);
      let n=0;(AppData.bookings||[]).forEach(bk=>{if(bk.status!=='cancelled'&&(bk.endDate||'').slice(0,10)>=today)n+=cleanRetreatActivities(bk);});
      if(n&&typeof showToast==='function')showToast(`${n} tour${n===1?'':'s'} removed (arrival/departure day or not offered for that group).`);
    }catch(e){console.warn('[activity-rules]',e);}
    return _arOrigSaveAll.apply(this,arguments);
  };
}
