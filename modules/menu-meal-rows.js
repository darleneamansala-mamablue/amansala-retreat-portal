// ===== menu-meal-rows.js — choose which meal rows a week's menu shows (Darlene 2026-10-25) =====
// Loaded as a classic script AFTER menu.js and menu-click-edit.js; shares global scope. Until now the Menu page decided by itself (Breakfast and Lunch only appeared when some group that week
// had that meal). A row of tick boxes above the week now lets you choose: Fruit/Coffee/Tea (light breakfast), Breakfast, Brunch, Lunch, Snack, Dinner. The choice is saved for that week
// (app_store 'menuMealRows' = { "<Sunday of the week>": [meal ids] }), used by the Menu page, the printed week and the wall menus. "Automatic" removes the choice for that week.
// menu.js and menu-click-edit.js ask menuMealsFor(days, automaticList) for the list (one guarded line each).
const MMR_KEY = 'menuMealRows';
const MMR_ALL = [['lightBreakfast', 'Fruit, Coffee & Tea'], ['breakfast', 'Breakfast'], ['brunch', 'Brunch'], ['lunch', 'Lunch'], ['snack', 'Snack'], ['dinner', 'Dinner']];
let mmrData = {}, mmrLoaded = false;
function mmrWeekKey(ds) { try { return typeof menuGetSunday === 'function' ? menuGetSunday(ds) : ds; } catch (e) { return ds; } }
function menuMealsFor(days, auto) {
  try {
    const sel = mmrData[mmrWeekKey(days[0])];
    if (Array.isArray(sel) && sel.length) return MMR_ALL.map(m => m[0]).filter(id => sel.includes(id));
  } catch (e) {}
  return auto;
}
async function mmrLoad() {
  try { const { data } = await db.from('app_store').select('value').eq('key', MMR_KEY).maybeSingle(); mmrData = (data && data.value && typeof data.value === 'object') ? data.value : {}; mmrLoaded = true; } catch (e) { console.warn('[menu-meal-rows]', e); }
  try { if (document.getElementById('menuGrid') && menuCurrentMonday) menuRenderWeek(); } catch (e) {}
}
async function mmrSave(week, list) {
  try {
    const { data } = await db.from('app_store').select('value').eq('key', MMR_KEY).maybeSingle();
    const all = (data && data.value && typeof data.value === 'object') ? data.value : {};
    if (list) all[week] = list; else delete all[week];
    const { error } = await db.from('app_store').upsert({ key: MMR_KEY, value: all, updated_at: new Date().toISOString() }); if (error) throw error;
    mmrData = all; return true;
  } catch (e) { showToast('Could not save: ' + (e.message || e)); return false; }
}
async function mmrToggle(id, on) {
  const week = mmrWeekKey(menuCurrentMonday), cur = mmrCurrentIds();
  const next = on ? MMR_ALL.map(m => m[0]).filter(x => cur.includes(x) || x === id) : cur.filter(x => x !== id);
  if (!next.length) { showToast('Keep at least one meal showing.'); mmrBar(); return; }
  if (await mmrSave(week, next)) { try { menuRenderWeek(); } catch (e) {} }
}
async function mmrAuto() { if (await mmrSave(mmrWeekKey(menuCurrentMonday), null)) { try { menuRenderWeek(); } catch (e) {} } }
function mmrAutoIds() {                                      // what the page picks by itself: Breakfast / Lunch only when some group that week has them
  const days = []; for (let i = 0; i < 7; i++) days.push(new Date(Date.parse(menuCurrentMonday + 'T12:00:00Z') + i * 86400000).toISOString().slice(0, 10));
  const has = m => days.some(ds => ((menuSchedule[ds] || {})[m] || []).length > 0);
  return ['lightBreakfast', ...(has('breakfast') ? ['breakfast'] : []), 'brunch', ...(has('lunch') ? ['lunch'] : []), 'snack', 'dinner'];
}
function mmrCurrentIds() { const sel = mmrData[mmrWeekKey(menuCurrentMonday)]; return (Array.isArray(sel) && sel.length) ? sel : mmrAutoIds(); }
function mmrBar() {
  const wrap = document.getElementById('menuGridWrap'), grid = document.getElementById('menuGrid'); if (!wrap || !grid) return;
  let bar = document.getElementById('mmrBar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'mmrBar'; bar.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;background:#fff;border:1.5px solid #e8dfd4;border-radius:10px;padding:8px 14px;margin-bottom:12px;font-family:'Jost',sans-serif;font-size:12.5px"; wrap.insertBefore(bar, grid); }
  const cur = mmrCurrentIds(), custom = Array.isArray(mmrData[mmrWeekKey(menuCurrentMonday)]);
  bar.innerHTML = '<b style="color:#6b7280;text-transform:uppercase;font-size:11px;letter-spacing:.5px">Meals shown this week</b>' +
    MMR_ALL.map(m => `<label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" ${cur.includes(m[0]) ? 'checked' : ''} onchange="mmrToggle('${m[0]}',this.checked)" style="accent-color:#2d6a6a"> ${m[1]}</label>`).join('') +
    (custom ? '<button onclick="mmrAuto()" style="border:1.5px solid #c8bfb5;background:#fff;border-radius:8px;padding:3px 10px;font-family:inherit;font-size:12px;cursor:pointer">Automatic</button>' : '<span style="color:#9ca3af">(automatic)</span>');
}
(function () {
  const o = window.menuRenderWeek;
  if (typeof o === 'function') window.menuRenderWeek = function () {
    const r = o.apply(this, arguments);
    try {
      mmrBar();
    } catch (e) { console.warn('[menu-meal-rows]', e); }
    return r;
  };
  mmrLoad();
})();
