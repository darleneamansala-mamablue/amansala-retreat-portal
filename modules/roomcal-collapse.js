// ===== roomcal-collapse.js — accordion for the Room Calendar's header block =====
// Loaded as a classic script (after alert-layout.js). Layout only: adds a "Hide / Show" toggle next to the "Room Calendar" title that folds
// the date controls, the action buttons, the month buttons and the stats line, so the calendar itself gets more room. The date range stays
// visible while folded. Nothing in booking-hub.html or the other modules is edited. The choice is remembered in this browser.
(function(){
  const KEY='rc_header_collapsed';
  const css=`
#tab-roomcal.rc-folded .panel-toolbar .toolbar-right>*:not(#rcRangeLbl):not(#rcReturnToRetreatBtn){display:none!important}
#tab-roomcal.rc-folded #rcAvailBar{display:none!important}
.rc-fold-btn{display:inline-flex;align-items:center;gap:6px;margin-left:12px;padding:4px 12px;font-size:12px;font-weight:600;color:var(--muted,#6b7280);background:#fff;border:1px solid var(--border,#e5e0d5);border-radius:8px;cursor:pointer;vertical-align:middle}
.rc-fold-btn:hover{background:var(--sand,#f4f1ea)}`;
  const st=document.createElement('style');st.id='roomcalCollapseCss';st.textContent=css;document.head.appendChild(st);

  function stored(){try{return localStorage.getItem(KEY)==='1';}catch(e){return false;}}
  function save(v){try{localStorage.setItem(KEY,v?'1':'0');}catch(e){}}
  function paint(tab,btn){
    const folded=tab.classList.contains('rc-folded');
    btn.textContent=(folded?'▸ Show controls':'▾ Hide controls');
    btn.setAttribute('aria-expanded',folded?'false':'true');
  }
  function init(){
    const tab=document.getElementById('tab-roomcal');
    const h2=tab&&tab.querySelector('.panel-toolbar h2');
    if(!tab||!h2||tab.querySelector('.rc-fold-btn'))return !!(tab&&tab.querySelector('.rc-fold-btn'));
    if(stored())tab.classList.add('rc-folded');
    const btn=document.createElement('button');
    btn.type='button';btn.className='rc-fold-btn';
    btn.onclick=function(){tab.classList.toggle('rc-folded');save(tab.classList.contains('rc-folded'));paint(tab,btn);};
    h2.appendChild(btn);paint(tab,btn);
    return true;
  }
  if(!init()){
    const mo=new MutationObserver(function(){if(init())mo.disconnect();});
    mo.observe(document.documentElement,{childList:true,subtree:true});
  }
})();
