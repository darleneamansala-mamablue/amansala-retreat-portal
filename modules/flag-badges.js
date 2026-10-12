// ===== flag-badges.js — 🚩 flag/notification badges on the Room Calendar, kept in step with Venues =====
// Loaded as a classic script AFTER venues.js and teacher-portal.js; shares global scope. Standalone: venues.js is not modified.
// Venues (venBuild) already shows a 🚩 badge on a retreat's bar when it has open flags/notes (auto flags + manual flags),
// and clicking it opens Flags & Notes (openFlagsModal). This module adds the SAME badge, from the same data, to each
// retreat pill in the Room Calendar's "Active in this view" strip, so both calendars show the same open items. Resolving
// or clearing one in either place goes through the same functions, which call venBuild(); the wrapper below refreshes
// the Room Calendar strip every time venBuild runs, so the two always agree.

function fbFlagState(bk){
  const open=(typeof getOpenAutoFlags==='function'?getOpenAutoFlags(bk):[]).length+(bk.flags||[]).filter(f=>!f.resolved).length;
  const hasHistory=open>0||(typeof getAutoFlags==='function'&&getAutoFlags(bk).length>0)||(bk.flags||[]).length>0;
  return {open,hasHistory};
}
function fbDecoratePills(){
  document.querySelectorAll('#rcTodayLegendCells .rtl-pill').forEach(pill=>{
    pill.querySelector('.fb-flag')?.remove();
    const bk=AppData.bookings.find(b=>b.id===pill.dataset.bkId);if(!bk)return;
    const {open,hasHistory}=fbFlagState(bk);
    if(!hasHistory)return;
    const b=document.createElement('span');b.className='fb-flag';
    if(open>0){
      b.textContent=open>1?'🚩'+open:'🚩';
      b.title=`${open} open flag${open>1?'s':''} — click to review`;
      b.style.cssText='position:absolute;right:2px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:800;color:#b91c1c;background:#fff;border-radius:8px;padding:0 4px;line-height:15px;cursor:pointer;box-shadow:0 0 0 1px #b91c1c';
    }else{
      b.textContent='🚩';
      b.title='All flags resolved — click to review';
      b.style.cssText='position:absolute;right:2px;top:50%;transform:translateY(-50%);font-size:11px;line-height:15px;cursor:pointer;filter:grayscale(1) opacity(.6)';
    }
    b.onclick=e=>{e.stopPropagation();openFlagsModal(bk.id);};
    pill.appendChild(b);
  });
}
(function(){
  const legend=_rcRenderTodayLegend;
  _rcRenderTodayLegend=function(){const r=legend.apply(this,arguments);try{fbDecoratePills();}catch(e){}return r;};
  const ven=venBuild;
  venBuild=function(){
    const r=ven.apply(this,arguments);
    // Room Calendar strip follows Venues: flag changes made in either place show in both
    try{if(typeof rcStart!=='undefined'&&rcStart&&document.getElementById('rcTodayLegendCells'))_rcRenderTodayLegend();}catch(e){}
    return r;
  };
})();
