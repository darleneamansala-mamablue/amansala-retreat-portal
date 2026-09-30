// ===== activity-rules.js — tour scheduling rules (Darlene's rules 2026-09-26/30) =====
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
  // Never two off-site tours on the same day (Darlene 2026-09-30) — ceremonies
  // and on-site activities follow Tour Settings and may share a day. The first
  // tour on a day stays; any later one that day is dropped. Only days inside
  // the stay: tours dated outside it are left for a person to sort out.
  const TOURS=new Set([...(typeof TOUR_AO_IDS!=='undefined'?TOUR_AO_IDS:['ao1','ao2','ao3','ao6','ao7']),'ao16']);
  const s0=(bk.startDate||'').slice(0,10),e0=(bk.endDate||'').slice(0,10);
  const tourDays=new Set();
  const keep2=keep.filter(a=>{
    const d=(a.date||'').slice(0,10);
    if(!TOURS.has(a.aoId)||!(d>s0&&d<e0))return true;
    if(tourDays.has(d))return false;
    tourDays.add(d);return true;
  });
  keep.length=0;keep2.forEach(a=>keep.push(a));
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
      if(n&&typeof showToast==='function')showToast(`${n} tour${n===1?'':'s'} removed — tours can't be on arrival/departure day, two tours can't share a day, and unchecked tours stay off.`);
    }catch(e){console.warn('[activity-rules]',e);}
    return _arOrigSaveAll.apply(this,arguments);
  };
}

// Moving a tour (date dropdown in Review Schedule / Daily Activities) onto a
// day that already has a different tour is refused up front, with a message,
// instead of being silently dropped at save.
function tourDayTaken(bk,date,exceptIdx){
  const TOURS=new Set([...(typeof TOUR_AO_IDS!=='undefined'?TOUR_AO_IDS:['ao1','ao2','ao3','ao6','ao7']),'ao16']);
  return (bk.retreatActivities||[]).find((a,i)=>i!==exceptIdx&&TOURS.has(a.aoId)&&(a.date||'').slice(0,10)===date)||null;
}
if(typeof svChangeActivityDate==='function'){
  const _arOrigChangeDate=svChangeActivityDate;
  svChangeActivityDate=function(bkId,idx,newDate){
    const bk=AppData.bookings.find(b=>b.id===bkId);
    const act=bk&&(bk.retreatActivities||[])[idx];
    const TOURS=new Set([...(typeof TOUR_AO_IDS!=='undefined'?TOUR_AO_IDS:['ao1','ao2','ao3','ao6','ao7']),'ao16']);
    if(act&&TOURS.has(act.aoId)){
      const clash=tourDayTaken(bk,newDate,idx);
      if(clash){
        const nm=id=>((typeof ADD_ONS!=='undefined'?ADD_ONS:[]).find(a=>a.id===id)||{}).name||id;
        showToast(`${nm(clash.aoId)} is already on that day — only one tour per day.`);
        if(typeof svRefreshActivityView==='function')svRefreshActivityView(bkId);
        return;
      }
    }
    return _arOrigChangeDate.apply(this,arguments);
  };
}
