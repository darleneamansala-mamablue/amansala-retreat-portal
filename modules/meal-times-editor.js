// ===== meal-times-editor.js — edit every meal time for a retreat in one place =====
// Loaded as a classic script AFTER menu.js, meal-times.js and teacher-portal.js; shares global scope.
// Menu tab → "⏰ Meal times": one row per retreat this week with its Light Breakfast, Breakfast / Brunch, Lunch and
// Dinner times. Leave a box empty (or clear it) to go back to the automatic time (class time + 15 min for brunch,
// 45 min after the evening class for dinner, 1:00 PM lunch, 7:00 AM light breakfast).
// Where each time lives (no new database columns):
//   Light Breakfast  bk.packageCustomPrices.__cfg__.lightBreakfastTime   (same key meal-times.js already used)
//   Breakfast        bk.packageCustomPrices.__cfg__.breakfastTime         (Breakfast · Lunch plans)
//   Brunch           bk.packageCustomPrices.__cfg__.brunchTime            (standard plan)
//   Lunch            bk.scheduleRequest.adminOverride.lunchStart          (same as Review Schedule)
//   Dinner           bk.scheduleRequest.dinnerTimeOverride                (same as Review Schedule; a per-night time
//                                                                         set in Review Schedule still wins for that night)
// Applied in: the Menu (menuMealTime), the teacher's schedule and the printed schedule (tsApplyMealTimeOverrides, called
// right after tsApplyMealPlan in teacher-portal.js).

const MTE_CFG_KEYS={lightBreakfast:'lightBreakfastTime',breakfast:'breakfastTime',brunch:'brunchTime'};
function mteCfg(bk){return (bk&&bk.packageCustomPrices&&bk.packageCustomPrices.__cfg__)||{};}
function mteTime(bk,meal){const t=mteCfg(bk)[MTE_CFG_KEYS[meal]];return /^\d{2}:\d{2}$/.test(t||'')?t:'';}
function mtePlan(bk){return new Set((typeof TS_MEAL_PLANS!=='undefined'&&TS_MEAL_PLANS[bk.mealPlan||'standard'])||['lightBreakfast','brunch','snack','dinner']);}

// ---------- Menu: brunch override (Breakfast + Light Breakfast are already handled by menu.js / meal-times.js) ----------
(function(){
  const prev=menuMealTime;
  menuMealTime=function(bk,meal,dateStr){
    if(meal==='brunch'&&bk.mealPlan!=='weTravel'){
      const t=mteTime(bk,'brunch');
      const isArrival=dateStr&&bk.startDate&&dateStr===bk.startDate.slice(0,10);
      if(t&&!isArrival)return t;
    }
    return prev.apply(this,arguments);
  };
})();

// ---------- Teacher / printed schedule rows ----------
function tsApplyMealTimeOverrides(bk,rows){
  if(!bk||bk.mealPlan==='weTravel')return rows;
  const plan=mtePlan(bk);
  const lb=mteTime(bk,'lightBreakfast');
  const morning=plan.has('brunch')?mteTime(bk,'brunch'):(plan.has('breakfast')?mteTime(bk,'breakfast'):'');
  rows.forEach(r=>{
    const d=String(r.desc||'');
    let t='';
    if(/^Fruit, Coffee/.test(d))t=lb;
    else if(/^(Brunch|Breakfast)\b/.test(d))t=morning;
    if(t){r.time=tsFmt(t);r.sk=t;}
  });
  return rows;
}

// ---------- editor ----------
function mteEsc(x){return String(x==null?'':x).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}
function mteSampleDate(bk){
  const d=new Date((bk.startDate||'').slice(0,10)+'T12:00:00');d.setDate(d.getDate()+1);
  return d.toISOString().split('T')[0];
}
function mteFields(bk){
  if(bk.mealPlan==='weTravel')return [];
  const plan=mtePlan(bk),f=[];
  if(plan.has('lightBreakfast'))f.push(['lightBreakfast','Fruit, Coffee & Tea']);
  if(plan.has('breakfast'))f.push(['breakfast','Breakfast']);
  else if(plan.has('brunch'))f.push(['brunch','Brunch']);
  if(plan.has('lunch'))f.push(['lunch','Lunch']);
  if(plan.has('dinner'))f.push(['dinner','Dinner']);
  return f;
}
// Time currently in effect, to pre-fill each box
function mteCurrent(bk,meal){
  try{return menuMealTime(bk,meal==='brunch'?'brunch':meal,mteSampleDate(bk))||'';}catch(e){return '';}
}
let _mteFromSchedule='';   // booking id when opened from Review Schedule
function mteOpen(bkId){
  _mteFromSchedule=(typeof bkId==='string'&&bkId)?bkId:'';
  const bks=_mteFromSchedule?AppData.bookings.filter(b=>b.id===_mteFromSchedule):(typeof mtWeekRetreats==='function'?mtWeekRetreats():[]);
  document.getElementById('mtOv')?.remove();
  const ov=document.createElement('div');ov.id='mtOv';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const rows=bks.map(b=>{
    const fields=mteFields(b);
    const inputs=fields.length?fields.map(([m,lbl])=>{
      const cur=mteCurrent(b,m);
      return `<label style="display:flex;flex-direction:column;gap:3px;font-size:11px;font-weight:600;color:#5a6a6a">${mteEsc(lbl)}
        <input type="time" data-mte-id="${mteEsc(b.id)}" data-mte-meal="${m}" data-mte-orig="${mteEsc(cur)}" value="${mteEsc(cur)}" style="padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:13px"></label>`;
    }).join(''):'<div style="font-size:12px;color:#a89e94">Fixed meal times for this group.</div>';
    return `<div style="padding:10px 0;border-top:1px solid #e5e7eb">
      <div style="font-weight:600;font-size:13px">${mteEsc(b.leaderName||b.retreatName||'Group')}</div>
      <div style="font-size:11.5px;color:#7f8c9a;margin-bottom:6px">${mteEsc((b.startDate||'').slice(0,10))} → ${mteEsc((b.endDate||'').slice(0,10))}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${inputs}</div></div>`;
  }).join('');
  ov.innerHTML=`<div style="background:#fff;border-radius:12px;width:min(560px,100%);max-height:86vh;overflow-y:auto;padding:20px">
    <div style="font-size:16px;font-weight:700;margin-bottom:4px">Meal times</div>
    <div style="font-size:12px;color:#7f8c9a;margin-bottom:10px">Change any time for a retreat this week; it applies to all of that retreat's days and shows on the Menu, the teacher's schedule and the printed schedule. Clear a box to go back to the automatic time. A dinner time set for one specific night in Review Schedule still wins for that night.</div>
    ${rows||'<div style="font-size:13px;color:#a89e94;padding:10px 0">No retreats this week.</div>'}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button onclick="document.getElementById('mtOv').remove()" style="padding:8px 16px;border:1.5px solid #d1d5db;background:#fff;border-radius:8px;cursor:pointer">Cancel</button>
      <button onclick="mteSave()" style="padding:8px 18px;background:#0e9494;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">Save times</button></div></div>`;
  document.body.appendChild(ov);
}
async function mteSave(){
  const touched=new Map();   // bookingId → bk
  document.querySelectorAll('#mtOv input[data-mte-id]').forEach(inp=>{
    const bk=AppData.bookings.find(b=>b.id===inp.dataset.mteId);if(!bk)return;
    const meal=inp.dataset.mteMeal,v=(inp.value||'').trim(),orig=inp.dataset.mteOrig||'';
    if(v===orig)return;                                   // untouched
    if(meal==='lunch'||meal==='dinner'){
      bk.scheduleRequest=bk.scheduleRequest||{};
      const sr=bk.scheduleRequest;
      if(meal==='lunch'){
        sr.adminOverride=sr.adminOverride||{};
        if(v)sr.adminOverride.lunchStart=v;else delete sr.adminOverride.lunchStart;
      }else sr.dinnerTimeOverride=v;
    }else{
      bk.packageCustomPrices=bk.packageCustomPrices||{};
      const cfg=bk.packageCustomPrices.__cfg__=bk.packageCustomPrices.__cfg__||{};
      if(v)cfg[MTE_CFG_KEYS[meal]]=v;else delete cfg[MTE_CFG_KEYS[meal]];
      if(!Object.keys(cfg).length)delete bk.packageCustomPrices.__cfg__;
    }
    touched.set(bk.id,bk);
  });
  document.getElementById('mtOv')?.remove();
  if(!touched.size){showToast('No changes');return;}
  saveAll();
  try{
    await Promise.all([...touched.values()].map(bk=>db.from('bookings').update({
      package_custom_prices:Object.keys(bk.packageCustomPrices||{}).length?bk.packageCustomPrices:null,
      schedule_request:bk.scheduleRequest||null
    }).eq('id',bk.id)));
  }catch(e){}
  try{menuPopulateFromRetreats(true);}catch(e){}
  if(_mteFromSchedule&&typeof openScheduleViewer==='function'){try{openScheduleViewer(_mteFromSchedule);}catch(e){}}
  showToast(`Meal times saved for ${touched.size} retreat${touched.size===1?'':'s'} ✓`);
}

// The Menu toolbar button from meal-times.js now opens this editor
function mtInjectButton(){
  const lbl=document.getElementById('menuWeekLabel');if(!lbl||!lbl.parentNode||document.getElementById('mtBtn'))return;
  const b=document.createElement('button');b.id='mtBtn';b.textContent='⏰ Meal times';
  b.title="Set a retreat's Light Breakfast, Breakfast/Brunch, Lunch and Dinner times";
  b.style.cssText="padding:4px 10px;font-size:12px;font-weight:600;font-family:'Jost',sans-serif;border:1.5px solid var(--border);border-radius:7px;background:#fff;cursor:pointer";
  b.onclick=()=>mteOpen();
  lbl.parentNode.appendChild(b);
}
