// ===== meal-times.js — per-retreat Light Breakfast (Fruit, Coffee & Tea) time =====
// Loaded as a classic script AFTER menu.js; shares global scope. menu.js's menuMealTime() returns the time stored at
// bk.packageCustomPrices.__cfg__.lightBreakfastTime (HH:MM) when a retreat has one, otherwise the usual 07:00.
// No new database column: it lives in the existing package_custom_prices JSON next to the other per-retreat settings.
// UI: a "⏰ Light Breakfast times" button in the Menu tab toolbar lists this week's retreats with a time box each.

function mtWeekRetreats(){
  if(typeof menuCurrentMonday==='undefined'||!menuCurrentMonday)return [];
  const first=menuCurrentMonday;
  const d=new Date(first+'T12:00:00');d.setDate(d.getDate()+6);
  const last=d.toISOString().split('T')[0];
  return AppData.bookings.filter(b=>{
    if(b.status==='cancelled'||b.mealPlan==='none')return false;
    if(b.bookingType==='room_only'&&b.retreatName!=='Bikini Bootcamp'&&b.mealPlan!=='weTravel')return false;
    const s=(b.startDate||'').slice(0,10),e=(b.endDate||'').slice(0,10);
    return s&&e&&s<=last&&e>=first;
  }).sort((a,b)=>(a.startDate||'').localeCompare(b.startDate||''));
}
function mtOpen(){
  const bks=mtWeekRetreats();
  let ov=document.getElementById('mtOv');if(ov)ov.remove();
  ov=document.createElement('div');ov.id='mtOv';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const esc=x=>String(x==null?'':x).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const rows=bks.map(b=>{
    const cur=(b.packageCustomPrices&&b.packageCustomPrices.__cfg__&&b.packageCustomPrices.__cfg__.lightBreakfastTime)||'';
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #e5e7eb">
      <div style="flex:1"><div style="font-weight:600;font-size:13px">${esc(b.leaderName||b.retreatName||'Group')}</div>
        <div style="font-size:11.5px;color:#7f8c9a">${esc((b.startDate||'').slice(0,10))} → ${esc((b.endDate||'').slice(0,10))}</div></div>
      <input type="time" data-mt-id="${esc(b.id)}" value="${esc(cur||'07:00')}" style="padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:13px"></div>`;
  }).join('');
  ov.innerHTML=`<div style="background:#fff;border-radius:12px;width:min(480px,100%);max-height:84vh;overflow-y:auto;padding:20px">
    <div style="font-size:16px;font-weight:700;margin-bottom:4px">Light Breakfast times</div>
    <div style="font-size:12px;color:#7f8c9a;margin-bottom:10px">Fruit, Coffee &amp; Tea. The usual time is 7:00 AM. Set a different time for any retreat this week; it applies to all of that retreat's days.</div>
    ${rows||'<div style="font-size:13px;color:#a89e94;padding:10px 0">No retreats this week.</div>'}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button onclick="document.getElementById('mtOv').remove()" style="padding:8px 16px;border:1.5px solid #d1d5db;background:#fff;border-radius:8px;cursor:pointer">Cancel</button>
      <button onclick="mtSave()" style="padding:8px 18px;background:#0e9494;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">Save times</button></div></div>`;
  document.body.appendChild(ov);
}
async function mtSave(){
  let changed=0;
  const jobs=[];
  document.querySelectorAll('#mtOv input[data-mt-id]').forEach(inp=>{
    const bk=AppData.bookings.find(b=>b.id===inp.dataset.mtId);if(!bk)return;
    const cfgNow=(bk.packageCustomPrices&&bk.packageCustomPrices.__cfg__&&bk.packageCustomPrices.__cfg__.lightBreakfastTime)||'';
    const v=(inp.value||'').trim();
    const want=(v&&v!=='07:00')?v:'';      // 07:00 is the default — store nothing
    if(want===cfgNow)return;
    bk.packageCustomPrices=bk.packageCustomPrices||{};
    bk.packageCustomPrices.__cfg__=bk.packageCustomPrices.__cfg__||{};
    if(want)bk.packageCustomPrices.__cfg__.lightBreakfastTime=want;else delete bk.packageCustomPrices.__cfg__.lightBreakfastTime;
    if(!Object.keys(bk.packageCustomPrices.__cfg__).length)delete bk.packageCustomPrices.__cfg__;
    changed++;
    jobs.push(db.from('bookings').update({package_custom_prices:Object.keys(bk.packageCustomPrices).length?bk.packageCustomPrices:null}).eq('id',bk.id));
  });
  document.getElementById('mtOv')?.remove();
  if(!changed){showToast('No changes');return;}
  saveAll();
  try{await Promise.all(jobs);}catch(e){}
  try{menuPopulateFromRetreats(true);}catch(e){}
  showToast(`Light Breakfast time saved for ${changed} retreat${changed===1?'':'s'} ✓`);
}

// ---------- button in the Menu toolbar ----------
function mtInjectButton(){
  const lbl=document.getElementById('menuWeekLabel');if(!lbl||!lbl.parentNode||document.getElementById('mtBtn'))return;
  const b=document.createElement('button');b.id='mtBtn';b.textContent='⏰ Light Breakfast times';
  b.title="Set a retreat's Light Breakfast (Fruit, Coffee & Tea) time";
  b.style.cssText="padding:4px 10px;font-size:12px;font-weight:600;font-family:'Jost',sans-serif;border:1.5px solid var(--border);border-radius:7px;background:#fff;cursor:pointer";
  b.onclick=mtOpen;
  lbl.parentNode.appendChild(b);
}
(function(){
  const orig=menuRenderWeek;
  menuRenderWeek=function(){const r=orig.apply(this,arguments);try{mtInjectButton();}catch(e){}return r;};
})();
