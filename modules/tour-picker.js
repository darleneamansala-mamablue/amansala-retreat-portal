// ===== tour-picker.js — per-group tour checklist (Darlene 2026-09-26) =====
// One checkbox per tour above a retreat's activity editor (Schedule Viewer
// and the Room-Only "Daily Activities" editor both render it through
// svActivityEditorHtml). Checked = the group gets it; unchecked = the teacher
// doesn't want it, so it's taken off the schedule and never auto-assigned
// again for this group. Stored per retreat in
// packageCustomPrices.__cfg__.tourOff (same JSONB field roomNotes /
// hideRoomNumbers already use — no schema change). activity-rules.js removes
// unchecked tours on every save, whichever screen added them.
// Classic script; loaded after teacher-portal.js and tour-settings.js.

function tpGetOff(bk){return new Set(bk?.packageCustomPrices?.__cfg__?.tourOff||[]);}
function tpSetOff(bk,set){
  if(!bk.packageCustomPrices)bk.packageCustomPrices={};
  if(!bk.packageCustomPrices.__cfg__)bk.packageCustomPrices.__cfg__={};
  bk.packageCustomPrices.__cfg__.tourOff=[...set];
}
function tpTourList(){
  return (typeof ADD_ONS!=='undefined'?ADD_ONS:[]).filter(a=>a&&a.id&&a.name)
    .slice().sort((a,b)=>a.name.localeCompare(b.name));
}
function tourPickerHtml(bk,bkId){
  const off=tpGetOff(bk);
  const tours=tpTourList();
  if(!tours.length)return '';
  // Checked = actually on this group's schedule right now (and not turned off).
  const scheduled=new Set((bk.retreatActivities||[]).map(a=>a.aoId));
  const isOn=t=>scheduled.has(t.id)&&!off.has(t.id);
  const onCount=tours.filter(isOn).length;
  const items=tours.map(t=>{
    const on=isOn(t);
    return `<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;border:1.5px solid ${on?'var(--teal)':'var(--border)'};border-radius:8px;background:${on?'#f0f9f9':'#fff'};cursor:pointer;font-size:12.5px;font-weight:600;color:var(--dark)">
      <input type="checkbox" ${on?'checked':''} onchange="tpToggle('${bkId}','${t.id}',this.checked)" style="width:16px;height:16px;accent-color:var(--teal);cursor:pointer">
      ${escHtml(t.name)}</label>`;
  }).join('');
  return `<div style="margin:0 0 14px;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;background:#faf7f2">
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
      <span style="font-size:13px;font-weight:800;color:var(--dark)">Tours for this group</span>
      <span style="font-size:12px;color:var(--dark)">${onCount} on the schedule · check to add a tour, uncheck to remove it for this group</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px">${items}</div>
  </div>`;
}
// First stay day (never arrival/departure) that the tour normally runs on,
// per Tour Settings weekdays; null if none fits.
function tpDefaultDate(bk,aoId){
  const days=(typeof TOUR_WEEKDAYS!=='undefined'&&TOUR_WEEKDAYS[aoId])||[];
  const nights=getNights(bk);
  for(let i=1;i<nights;i++){
    const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
    if(days.includes(d.getDay()))return fmtISO(d);
  }
  return null;
}
function tpToggle(bkId,aoId,checked){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const off=tpGetOff(bk);
  const name=(ADD_ONS.find(a=>a.id===aoId)||{}).name||'Tour';
  if(checked){
    off.delete(aoId);
    const has=(bk.retreatActivities||[]).some(a=>a.aoId===aoId);
    if(!has){
      const date=tpDefaultDate(bk,aoId);
      if(date){
        if(!bk.retreatActivities)bk.retreatActivities=[];
        bk.retreatActivities.push({aoId,date,time:(typeof tourDefaultTime==='function'?tourDefaultTime(aoId):'11:45'),prepaid:(bk.packages||[]).includes(aoId)});
        bk.retreatActivitiesUpdatedAt=new Date().toISOString();
        showToast(`${name} added on ${fmtDate(date)}.`);
      }else{
        showToast(`${name} is included — it doesn't normally run on these days, so add it below with a date.`);
      }
    }
  }else{
    off.add(aoId);
    const before=(bk.retreatActivities||[]).length;
    bk.retreatActivities=(bk.retreatActivities||[]).filter(a=>a.aoId!==aoId);
    if(bk.retreatActivities.length!==before){bk.retreatActivitiesUpdatedAt=new Date().toISOString();}
    showToast(`${name} removed for this group — it won't be auto-assigned again.`);
  }
  tpSetOff(bk,off);
  saveAll();
  try{db.from('bookings').update({package_custom_prices:bk.packageCustomPrices}).eq('id',bk.id).then(()=>{}).catch(()=>{});}catch(e){}
  svRefreshActivityView(bkId);
}
if(typeof svActivityEditorHtml==='function'){
  const _tpOrigEditor=svActivityEditorHtml;
  svActivityEditorHtml=function(bk,bkId){
    let pick='';try{pick=tourPickerHtml(bk,bkId);}catch(e){console.warn('[tour-picker]',e);}
    return pick+_tpOrigEditor.apply(this,arguments);
  };
}
