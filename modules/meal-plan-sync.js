// ===== meal-plan-sync.js — a meal-plan change updates the kitchen menu (2026-10-07) =====
// The printed/kitchen menu is built from saved meal rows, and menuPopulateFromRetreats() only
// rebuilds them when the Menu tab is opened for a week, when a teacher schedule is confirmed,
// or from the Populate button. Choosing a different Meals Included plan for a group (booking
// form, retreat window, Review Schedule) never triggered it, so the printed menu kept the old
// plan until someone repopulated by hand (Lillian So, Oct 11-17).
// This wraps saveAll(): when any active booking's mealPlan differs from what we last saw, the
// menu is repopulated for every week of that retreat. Own module — menu.js is untouched.
(function(){
  const seen=new Map(); // bookingId -> mealPlan last seen
  const planOf=b=>b.mealPlan||'';
  function snapshot(){
    try{(AppData.bookings||[]).forEach(b=>{if(b&&b.id&&!seen.has(b.id))seen.set(b.id,planOf(b));});}catch(e){}
  }
  function repopulate(b){
    if(typeof menuPopulateFromRetreats!=='function'||typeof menuGetSunday!=='function'||!b.startDate||!b.endDate)return;
    const saved=menuCurrentMonday;
    try{
      let cur=new Date(menuGetSunday(b.startDate)+'T12:00:00');
      const end=new Date(b.endDate+'T12:00:00');
      while(cur<=end){
        menuCurrentMonday=cur.toISOString().split('T')[0];
        menuPopulateFromRetreats(true);
        cur.setDate(cur.getDate()+7);
      }
    }finally{
      menuCurrentMonday=saved||menuGetSunday(new Date());
      try{menuRenderWeek();}catch(e){}
    }
  }
  if(typeof saveAll==='function'){
    const orig=saveAll;
    saveAll=function(){
      const r=orig.apply(this,arguments);
      try{
        const changed=[];
        (AppData.bookings||[]).forEach(b=>{
          if(!b||!b.id)return;
          const now=planOf(b);
          if(seen.has(b.id)&&seen.get(b.id)!==now&&b.status!=='cancelled')changed.push(b);
          seen.set(b.id,now);
        });
        changed.forEach(repopulate);
        if(changed.length&&typeof showToast==='function')
          showToast('Kitchen menu updated for the new meal plan: '+changed.map(b=>b.leaderName||b.retreatName||'Group').join(', ')+'.');
      }catch(e){console.warn('[meal-plan-sync]',e);}
      return r;
    };
  }
  snapshot();
  setInterval(snapshot,2000); // record bookings as data loads, before anyone edits them
})();
