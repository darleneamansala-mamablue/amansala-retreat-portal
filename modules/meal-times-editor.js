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
//   Per day          bk.packageCustomPrices.__cfg__.mealTimesByDate = {'YYYY-MM-DD':{lightBreakfast,breakfast|brunch,lunch}}
//                    (a day's own Dinner uses bk.scheduleRequest.dinnerTimeByDate, which Review Schedule already had)
//                    A day's own time wins over the retreat-wide time.
// Applied in: the Menu (menuMealTime), the teacher's schedule and the printed schedule (tsApplyMealTimeOverrides, called
// right after tsApplyMealPlan in teacher-portal.js).

const MTE_CFG_KEYS={lightBreakfast:'lightBreakfastTime',breakfast:'breakfastTime',brunch:'brunchTime'};
function mteCfg(bk){return (bk&&bk.packageCustomPrices&&bk.packageCustomPrices.__cfg__)||{};}
function mteTime(bk,meal){const t=mteCfg(bk)[MTE_CFG_KEYS[meal]];return /^\d{2}:\d{2}$/.test(t||'')?t:'';}
function mteDay(bk,meal,dateStr){
  const t=((mteCfg(bk).mealTimesByDate||{})[dateStr]||{})[meal];
  return /^\d{2}:\d{2}$/.test(t||'')?t:'';
}
function mtePlan(bk){return new Set((typeof TS_MEAL_PLANS!=='undefined'&&TS_MEAL_PLANS[bk.mealPlan||'standard'])||['lightBreakfast','brunch','snack','dinner']);}

// ---------- Menu: brunch override (Breakfast + Light Breakfast are already handled by menu.js / meal-times.js) ----------
(function(){
  const prev=menuMealTime;
  menuMealTime=function(bk,meal,dateStr){
    if(bk.mealPlan!=='weTravel'&&dateStr){const dv=mteDay(bk,meal,dateStr);if(dv)return dv;}   // that day's own time
    if(meal==='brunch'&&bk.mealPlan!=='weTravel'){
      const t=mteTime(bk,'brunch');
      const isArrival=dateStr&&bk.startDate&&dateStr===bk.startDate.slice(0,10);
      if(t&&!isArrival)return t;
    }
    return prev.apply(this,arguments);
  };
})();

// ---------- Teacher / printed schedule rows ----------
function tsApplyMealTimeOverrides(bk,rows,dateStr){
  if(!bk||bk.mealPlan==='weTravel')return rows;
  const plan=mtePlan(bk);
  const mornKey=plan.has('brunch')?'brunch':'breakfast';
  const lb=mteTime(bk,'lightBreakfast');
  const morning=mteTime(bk,mornKey);
  rows.forEach(r=>{
    const d=String(r.desc||'');
    let t='';
    if(/^Fruit, Coffee/.test(d))t=mteDay(bk,'lightBreakfast',dateStr)||lb;
    else if(/^(Brunch|Breakfast)\b/.test(d))t=mteDay(bk,mornKey,dateStr)||morning;
    else if(/^Lunch\b/.test(d))t=mteDay(bk,'lunch',dateStr);
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
// Which meals a given day has (arrival day: dinner only; departure day: morning meals only)
function mteDayMeals(bk,fields,i,nights){
  return fields.filter(([m])=>{
    if(i===0)return m==='dinner';
    if(i===nights)return m==='lightBreakfast'||m==='breakfast'||m==='brunch';
    return true;
  });
}
function mteDays(bk){
  const out=[],n=Math.max(1,Math.round((new Date(bk.endDate.slice(0,10)+'T12:00:00')-new Date(bk.startDate.slice(0,10)+'T12:00:00'))/86400000));
  for(let i=0;i<=n;i++){
    const d=new Date(bk.startDate.slice(0,10)+'T12:00:00');d.setDate(d.getDate()+i);
    out.push({i,n,date:d.toISOString().split('T')[0],lbl:d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})});
  }
  return out;
}
// Time currently in effect, to pre-fill each box
function mteCurrent(bk,meal,date){
  try{return menuMealTime(bk,meal,date||mteSampleDate(bk))||'';}catch(e){return '';}
}
function mteInput(b,meal,date,val){
  return `<input type="time" data-mte-id="${mteEsc(b.id)}" data-mte-meal="${meal}" data-mte-date="${date||''}" data-mte-orig="${mteEsc(val)}" value="${mteEsc(val)}" style="padding:5px 7px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;width:128px">`;
}
let _mteFromSchedule='';   // booking id when opened from Review Schedule or the teacher's own schedule page
let _mteTeacher=false;     // true when a teacher is editing their own retreat's times
function mteOpen(bkId,teacher){
  _mteFromSchedule=(typeof bkId==='string'&&bkId)?bkId:'';
  _mteTeacher=!!teacher;
  const bks=_mteFromSchedule?AppData.bookings.filter(b=>b.id===_mteFromSchedule):(typeof mtWeekRetreats==='function'?mtWeekRetreats():[]);
  document.getElementById('mtOv')?.remove();
  const ov=document.createElement('div');ov.id='mtOv';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  const th='padding:4px 6px;font-size:11px;font-weight:700;color:#5a6a6a;text-align:left;white-space:nowrap';
  const rows=bks.map(b=>{
    const fields=mteFields(b);
    if(!fields.length)return `<div style="padding:10px 0;border-top:1px solid #e5e7eb"><div style="font-weight:600;font-size:13px">${mteEsc(b.leaderName||b.retreatName||'Group')}</div><div style="font-size:12px;color:#a89e94">Fixed meal times for this group.</div></div>`;
    const all=`<div style="display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 10px">${fields.map(([m,lbl])=>`<label style="display:flex;flex-direction:column;gap:3px;font-size:11px;font-weight:600;color:#5a6a6a">${mteEsc(lbl)}${mteInput(b,m,'',mteCurrent(b,m))}</label>`).join('')}</div>`;
    const days=mteDays(b);
    const head=`<tr><th style="${th}">Day</th>${fields.map(([m,lbl])=>`<th style="${th}">${mteEsc(lbl)}</th>`).join('')}</tr>`;
    const body=days.map(d=>{
      const has=new Set(mteDayMeals(b,fields,d.i,d.n).map(x=>x[0]));
      return `<tr style="border-top:1px solid #f1f5f9"><td style="padding:4px 6px;font-size:12px;font-weight:600;white-space:nowrap">${mteEsc(d.lbl)}</td>${fields.map(([m])=>`<td style="padding:3px 4px">${has.has(m)?mteInput(b,m,d.date,mteCurrent(b,m,d.date)):'<span style="color:#cbd5d5;font-size:12px">—</span>'}</td>`).join('')}</tr>`;
    }).join('');
    return `<div style="padding:10px 0;border-top:1px solid #e5e7eb">
      <div style="font-weight:600;font-size:13px">${mteEsc(b.leaderName||b.retreatName||'Group')}</div>
      <div style="font-size:11.5px;color:#7f8c9a">${mteEsc((b.startDate||'').slice(0,10))} → ${mteEsc((b.endDate||'').slice(0,10))}</div>
      <div style="font-size:12px;font-weight:700;margin-top:8px;color:#2d3a3a">All days</div>
      <div style="font-size:11.5px;color:#7f8c9a">Change a time here to set it for every day.</div>${all}
      <div style="font-size:12px;font-weight:700;color:#2d3a3a">Day by day</div>
      <div style="font-size:11.5px;color:#7f8c9a;margin-bottom:4px">Change just one day's time below. The other days stay as they are.</div>
      <div style="overflow-x:auto"><table style="border-collapse:collapse">${head}${body}</table></div></div>`;
  }).join('');
  ov.innerHTML=`<div style="background:#fff;border-radius:12px;width:min(720px,100%);max-height:90vh;overflow-y:auto;padding:20px">
    <div style="font-size:16px;font-weight:700;margin-bottom:4px">${_mteTeacher?'Edit my meal times':'Meal times'}</div>
    <div style="font-size:12px;color:#7f8c9a;margin-bottom:6px">${_mteTeacher?'Set the times you would like, for every day at once or for one day at a time. Your schedule and our kitchen update right away. Clear a box to go back to the usual time.':'Set a time for every day at once, or for one day at a time. Shows on the Menu, the teacher\'s schedule and the printed schedule. Clear a box to go back to the automatic time.'}</div>
    ${rows||'<div style="font-size:13px;color:#a89e94;padding:10px 0">No retreats this week.</div>'}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button onclick="document.getElementById('mtOv').remove()" style="padding:8px 16px;border:1.5px solid #d1d5db;background:#fff;border-radius:8px;cursor:pointer">Cancel</button>
      <button onclick="mteSave()" style="padding:8px 18px;background:#0e9494;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">Save times</button></div></div>`;
  document.body.appendChild(ov);
}
async function mteSave(){
  const touched=new Map();   // bookingId → bk
  const changeLog=[];
  const inputs=[...document.querySelectorAll('#mtOv input[data-mte-id]')];
  const bump=(inp,fn)=>{
    const bk=AppData.bookings.find(b=>b.id===inp.dataset.mteId);if(!bk)return;
    const meal=inp.dataset.mteMeal,date=inp.dataset.mteDate,v=(inp.value||'').trim(),orig=inp.dataset.mteOrig||'';
    if(v===orig)return;
    fn(bk,meal,date,v);touched.set(bk.id,bk);
    changeLog.push(`${meal==='lightBreakfast'?'Fruit, Coffee & Tea':meal[0].toUpperCase()+meal.slice(1)}${date?' '+date.slice(5):''} ${v||'automatic'}`);
  };
  const cfgOf=bk=>{bk.packageCustomPrices=bk.packageCustomPrices||{};return bk.packageCustomPrices.__cfg__=bk.packageCustomPrices.__cfg__||{};};
  // 1) "All days" boxes: set the retreat-wide time and drop that meal's per-day times (the teacher means every day)
  inputs.filter(i=>!i.dataset.mteDate).forEach(inp=>bump(inp,(bk,meal,date,v)=>{
    if(meal==='lunch'||meal==='dinner'){
      bk.scheduleRequest=bk.scheduleRequest||{};const sr=bk.scheduleRequest;
      if(meal==='lunch'){sr.adminOverride=sr.adminOverride||{};if(v)sr.adminOverride.lunchStart=v;else delete sr.adminOverride.lunchStart;
        const bd=cfgOf(bk).mealTimesByDate||{};Object.keys(bd).forEach(k=>{delete bd[k].lunch;});}
      else{sr.dinnerTimeOverride=v;sr.dinnerTimeByDate={};}
    }else{
      const cfg=cfgOf(bk);
      if(v)cfg[MTE_CFG_KEYS[meal]]=v;else delete cfg[MTE_CFG_KEYS[meal]];
      const bd=cfg.mealTimesByDate||{};Object.keys(bd).forEach(k=>{delete bd[k][meal];});
    }
  }));
  // 2) Day-by-day boxes
  inputs.filter(i=>i.dataset.mteDate).forEach(inp=>bump(inp,(bk,meal,date,v)=>{
    if(meal==='dinner'){
      bk.scheduleRequest=bk.scheduleRequest||{};const sr=bk.scheduleRequest;
      sr.dinnerTimeByDate=sr.dinnerTimeByDate||{};
      if(v)sr.dinnerTimeByDate[date]=v;else delete sr.dinnerTimeByDate[date];
    }else{
      const cfg=cfgOf(bk);cfg.mealTimesByDate=cfg.mealTimesByDate||{};
      cfg.mealTimesByDate[date]=cfg.mealTimesByDate[date]||{};
      if(v)cfg.mealTimesByDate[date][meal]=v;else delete cfg.mealTimesByDate[date][meal];
    }
  }));
  // tidy empty containers
  touched.forEach(bk=>{
    const cfg=bk.packageCustomPrices&&bk.packageCustomPrices.__cfg__;
    if(cfg&&cfg.mealTimesByDate){Object.keys(cfg.mealTimesByDate).forEach(k=>{if(!Object.keys(cfg.mealTimesByDate[k]).length)delete cfg.mealTimesByDate[k];});if(!Object.keys(cfg.mealTimesByDate).length)delete cfg.mealTimesByDate;}
    if(cfg&&!Object.keys(cfg).length)delete bk.packageCustomPrices.__cfg__;
    if(bk.scheduleRequest&&bk.scheduleRequest.dinnerTimeByDate&&!Object.keys(bk.scheduleRequest.dinnerTimeByDate).length)delete bk.scheduleRequest.dinnerTimeByDate;
    if(_mteTeacher){bk.scheduleRequest=bk.scheduleRequest||{};bk.scheduleRequest.mealTimesTeacherEdit={at:new Date().toISOString(),changes:changeLog.slice(0,12).join(', ')+(changeLog.length>12?' …':'')};}
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
  if(_mteFromSchedule&&_mteTeacher){
    try{const b=AppData.bookings.find(x=>x.id===_mteFromSchedule);if(typeof tsRenderCalSection==='function')tsRenderCalSection(b);if(typeof tsRenderDinnerTime==='function')tsRenderDinnerTime(b);}catch(e){}
  }else if(_mteFromSchedule&&typeof openScheduleViewer==='function'){try{openScheduleViewer(_mteFromSchedule);}catch(e){}}
  showToast(_mteTeacher?'Your meal times are saved ✓':`Meal times saved for ${touched.size} retreat${touched.size===1?'':'s'} ✓`);
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
