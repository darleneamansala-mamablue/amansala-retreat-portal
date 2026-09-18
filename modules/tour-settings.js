// ===== tour-settings.js — "Manage Tours" panel: edit price + default time per tour/add-on =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

const TOUR_DEFAULT_TIMES_KEY='amansala_tour_default_times';
// Seeded from the current weekday auto-assign template / manual-add defaults
// (modules/teacher-portal.js SKED_AUTO_TEMPLATE) so the panel starts out showing
// what's actually in use today, not a blank slate.
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

function openTourSettings(){
  const tbody=document.getElementById('tourSettingsTbody');if(!tbody)return;
  const list=(typeof ADD_ONS!=='undefined'?ADD_ONS:[]).slice().sort((a,b)=>a.name.localeCompare(b.name));
  tbody.innerHTML=list.map(a=>`<tr>
    <td style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:13px">${escHtml(a.name)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid var(--border)"><input type="number" step="0.01" min="0" value="${a.price??0}" data-id="${a.id}" data-f="price" style="width:90px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-family:'Jost',sans-serif;font-size:13px"></td>
    <td style="padding:8px 12px;border-bottom:1px solid var(--border)"><input type="time" value="${tourDefaultTime(a.id)}" data-id="${a.id}" data-f="time" style="padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-family:'Jost',sans-serif;font-size:13px"></td>
  </tr>`).join('');
  openModal('tourSettingsModal');
}
function saveTourSettings(){
  document.querySelectorAll('#tourSettingsTbody input[data-f="price"]').forEach(inp=>{
    const a=ADD_ONS.find(x=>x.id===inp.dataset.id);if(a)a.price=parseFloat(inp.value)||0;
  });
  document.querySelectorAll('#tourSettingsTbody input[data-f="time"]').forEach(inp=>{
    if(inp.value)TOUR_DEFAULT_TIMES[inp.dataset.id]=inp.value;
  });
  saveAddOnsToSupabase();
  saveTourDefaultTimes();
  closeModal('tourSettingsModal');
  showToast('Tour prices & default times saved.');
}
