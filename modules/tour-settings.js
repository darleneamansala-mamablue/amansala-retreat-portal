// ===== tour-settings.js — "Manage Tours" panel: price, default time, weekday
// rotation, and add/delete for every tour/ceremony/activity =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

const TOUR_DEFAULT_TIMES_KEY='amansala_tour_default_times';
// Seeded from the old hardcoded weekday auto-assign template (formerly
// SKED_AUTO_TEMPLATE in modules/teacher-portal.js) so the panel starts out
// showing what was actually in use, not a blank slate.
const TOUR_DEFAULT_TIMES_SEED={
  ao1:'11:45', ao2:'10:30', ao3:'11:45', ao4:'19:15', ao5:'19:15',
  ao6:'11:45', ao7:'11:45', ao9:'15:00', ao10:'15:00', ao12:'20:30',
  ao13:'19:30', ao14:'17:00', ao16:'11:45',
};
let TOUR_DEFAULT_TIMES={...TOUR_DEFAULT_TIMES_SEED};
function loadTourDefaultTimesLocal(){
  try{
    const raw=localStorage.getItem(TOUR_DEFAULT_TIMES_KEY);
    if(raw)TOUR_DEFAULT_TIMES={...TOUR_DEFAULT_TIMES_SEED,...JSON.parse(raw)};
  }catch(e){}
}
async function loadTourDefaultTimes(){
  loadTourDefaultTimesLocal();
  try{
    const{data}=await db.from('app_store').select('value').eq('key','tourDefaultTimes').maybeSingle();
    if(data?.value&&typeof data.value==='object')TOUR_DEFAULT_TIMES={...TOUR_DEFAULT_TIMES_SEED,...data.value};
  }catch(e){}
}
async function saveTourDefaultTimes(){
  localStorage.setItem(TOUR_DEFAULT_TIMES_KEY,JSON.stringify(TOUR_DEFAULT_TIMES));
  try{await db.from('app_store').upsert({key:'tourDefaultTimes',value:TOUR_DEFAULT_TIMES,updated_at:new Date().toISOString()});}catch(e){console.warn('Tour default times sync failed:',e);}
}
loadTourDefaultTimes();
// Global helper other modules read from (falls back to 11:45, the standard
// tour-slot default, for anything not explicitly set here).
function tourDefaultTime(aoId){return TOUR_DEFAULT_TIMES[aoId]||'11:45';}

const TOUR_WEEKDAYS_KEY='amansala_tour_weekdays';
// Which day(s) of the week each tour/ceremony auto-assigns on — inverted
// from the same old hardcoded template as the seed above (e.g. Tulum Ruins
// was Monday-only). Gitano (ao13, driven by the offsite-night picker) and
// anything added later default to no scheduled days until set here.
const TOUR_WEEKDAYS_SEED={
  ao1:[1], ao2:[4], ao3:[3,5], ao4:[1,5], ao5:[2,6],
  ao6:[2,6], ao7:[0], ao9:[3,6], ao10:[0,4], ao12:[0,3], ao14:[2,5],
};
let TOUR_WEEKDAYS={...TOUR_WEEKDAYS_SEED};
function loadTourWeekdaysLocal(){
  try{
    const raw=localStorage.getItem(TOUR_WEEKDAYS_KEY);
    if(raw)TOUR_WEEKDAYS={...TOUR_WEEKDAYS_SEED,...JSON.parse(raw)};
  }catch(e){}
}
async function loadTourWeekdays(){
  loadTourWeekdaysLocal();
  try{
    const{data}=await db.from('app_store').select('value').eq('key','tourWeekdays').maybeSingle();
    if(data?.value&&typeof data.value==='object')TOUR_WEEKDAYS={...TOUR_WEEKDAYS_SEED,...data.value};
  }catch(e){}
}
async function saveTourWeekdays(){
  localStorage.setItem(TOUR_WEEKDAYS_KEY,JSON.stringify(TOUR_WEEKDAYS));
  try{await db.from('app_store').upsert({key:'tourWeekdays',value:TOUR_WEEKDAYS,updated_at:new Date().toISOString()});}catch(e){console.warn('Tour weekdays sync failed:',e);}
}
loadTourWeekdays();
// Global helper — every add-on scheduled to auto-assign on this weekday
// (0=Sun...6=Sat), replacing the old hardcoded SKED_AUTO_TEMPLATE[dow]
// lookup in modules/teacher-portal.js. Returns the same {aoId,time} shape
// that code already expected.
function skedTemplateForDay(dow){
  return Object.keys(TOUR_WEEKDAYS)
    .filter(aoId=>(TOUR_WEEKDAYS[aoId]||[]).includes(dow))
    .map(aoId=>({aoId,time:tourDefaultTime(aoId)}));
}

const TOUR_WEEKDAY_LABELS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function openTourSettings(){
  tourSettingsRenderRows();
  openModal('tourSettingsModal');
}
function tourSettingsRenderRows(){
  const tbody=document.getElementById('tourSettingsTbody');if(!tbody)return;
  const list=(typeof ADD_ONS!=='undefined'?ADD_ONS:[]).slice().sort((a,b)=>a.name.localeCompare(b.name));
  tbody.innerHTML=list.map(a=>{
    const days=TOUR_WEEKDAYS[a.id]||[];
    const dayBtns=TOUR_WEEKDAY_LABELS.map((lbl,d)=>{
      const on=days.includes(d);
      return `<button type="button" onclick="tourSettingsToggleDay(this,'${a.id}',${d})" data-id="${a.id}" data-day="${d}" data-on="${on?'1':'0'}" style="width:30px;height:26px;border-radius:6px;font-size:10.5px;font-weight:700;cursor:pointer;border:1.5px solid ${on?'var(--teal,#2d6a6a)':'var(--border)'};background:${on?'var(--teal,#2d6a6a)':'#fff'};color:${on?'#fff':'var(--dark)'}">${lbl[0]}</button>`;
    }).join('');
    const price=a.price??0, cost=a.cost??0, profit=price-cost;
    return `<tr data-row-id="${a.id}">
    <td style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:13px">${escHtml(a.name)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid var(--border)"><input type="number" step="0.01" min="0" value="${price}" data-id="${a.id}" data-f="price" oninput="tourSettingsUpdateProfit('${a.id}')" style="width:80px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-family:'Jost',sans-serif;font-size:13px"></td>
    <td style="padding:8px 12px;border-bottom:1px solid var(--border)">
      <input type="number" step="0.01" min="0" value="${cost}" data-id="${a.id}" data-f="cost" oninput="tourSettingsUpdateProfit('${a.id}')" style="width:80px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-family:'Jost',sans-serif;font-size:13px">
      <div id="tourSettingsProfit_${a.id}" style="font-size:10.5px;color:${profit>=0?'#059669':'#dc2626'};margin-top:3px">${fmt$(profit)} profit</div>
    </td>
    <td style="padding:8px 12px;border-bottom:1px solid var(--border)"><input type="time" value="${tourDefaultTime(a.id)}" data-id="${a.id}" data-f="time" style="padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-family:'Jost',sans-serif;font-size:13px"></td>
    <td style="padding:8px 12px;border-bottom:1px solid var(--border)"><div style="display:flex;gap:3px">${dayBtns}</div></td>
    <td style="padding:8px 12px;border-bottom:1px solid var(--border)"><button type="button" onclick="tourSettingsDeleteRow('${a.id}','${escHtml(a.name).replace(/'/g,"\\'")}')" style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:16px;line-height:1" title="Delete this tour">&times;</button></td>
  </tr>`;
  }).join('');
}
function tourSettingsUpdateProfit(aoId){
  const priceInp=document.querySelector(`input[data-id="${aoId}"][data-f="price"]`);
  const costInp=document.querySelector(`input[data-id="${aoId}"][data-f="cost"]`);
  const el=document.getElementById('tourSettingsProfit_'+aoId);
  if(!priceInp||!costInp||!el)return;
  const profit=(parseFloat(priceInp.value)||0)-(parseFloat(costInp.value)||0);
  el.textContent=fmt$(profit)+' profit';
  el.style.color=profit>=0?'#059669':'#dc2626';
}
function tourSettingsToggleDay(btn,aoId,day){
  const on=btn.dataset.on==='1';
  btn.dataset.on=on?'0':'1';
  btn.style.background=on?'#fff':'var(--teal,#2d6a6a)';
  btn.style.color=on?'var(--dark)':'#fff';
  btn.style.borderColor=on?'var(--border)':'var(--teal,#2d6a6a)';
}
function tourSettingsAddNew(){
  const name=(document.getElementById('tourSettingsNewName')?.value||'').trim();
  if(!name){showToast('Enter a name for the new tour first.');return;}
  const price=parseFloat(document.getElementById('tourSettingsNewPrice')?.value)||0;
  const cost=parseFloat(document.getElementById('tourSettingsNewCost')?.value)||0;
  const time=document.getElementById('tourSettingsNewTime')?.value||'11:45';
  const nextNum=Math.max(0,...ADD_ONS.map(a=>parseInt((a.id||'').replace('ao',''))||0))+1;
  const id='ao'+nextNum;
  ADD_ONS.push({id,name,desc:'',price,cost});
  TOUR_DEFAULT_TIMES[id]=time;
  document.getElementById('tourSettingsNewName').value='';
  document.getElementById('tourSettingsNewPrice').value='';
  document.getElementById('tourSettingsNewCost').value='';
  document.getElementById('tourSettingsNewTime').value='11:45';
  tourSettingsRenderRows();
  showToast(`"${name}" added — set its days below, then Save.`);
}
async function tourSettingsDeleteRow(aoId,name){
  if(!confirm(`Delete "${name}"? This removes it from the tour catalog entirely — any retreat day it's already scheduled on will keep showing it, but it won't be offered for new scheduling.`))return;
  const idx=ADD_ONS.findIndex(a=>a.id===aoId);
  if(idx>-1)ADD_ONS.splice(idx,1);
  delete TOUR_DEFAULT_TIMES[aoId];
  delete TOUR_WEEKDAYS[aoId];
  try{await db.from('add_ons').delete().eq('id',aoId);}catch(e){console.warn('add_ons delete failed:',e);}
  await saveTourDefaultTimes();
  await saveTourWeekdays();
  tourSettingsRenderRows();
  showToast(`"${name}" deleted.`);
}
function saveTourSettings(){
  document.querySelectorAll('#tourSettingsTbody input[data-f="price"]').forEach(inp=>{
    const a=ADD_ONS.find(x=>x.id===inp.dataset.id);if(a)a.price=parseFloat(inp.value)||0;
  });
  document.querySelectorAll('#tourSettingsTbody input[data-f="cost"]').forEach(inp=>{
    const a=ADD_ONS.find(x=>x.id===inp.dataset.id);if(a)a.cost=parseFloat(inp.value)||0;
  });
  document.querySelectorAll('#tourSettingsTbody input[data-f="time"]').forEach(inp=>{
    if(inp.value)TOUR_DEFAULT_TIMES[inp.dataset.id]=inp.value;
  });
  document.querySelectorAll('#tourSettingsTbody tr[data-row-id]').forEach(tr=>{
    const aoId=tr.dataset.rowId;
    const days=[...tr.querySelectorAll('button[data-day]')].filter(b=>b.dataset.on==='1').map(b=>parseInt(b.dataset.day));
    TOUR_WEEKDAYS[aoId]=days;
  });
  saveAddOnsToSupabase();
  saveTourDefaultTimes();
  saveTourWeekdays();
  closeModal('tourSettingsModal');
  showToast('Tour prices, default times & weekday schedule saved.');
}
