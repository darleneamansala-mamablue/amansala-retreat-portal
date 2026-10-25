// ===== menu-click-edit.js — click a dish on the Menu page to edit it right there (Darlene 2026-10-17) =====
// Loaded as a classic script AFTER menu.js, menu-variants.js and menu-editor.js; shares global scope. Standalone: no other module is edited.
// On the Menu tab every dish in the week grid can be clicked. A small window opens with the dish's name on the menu (Spanish), English name
// and description, and these buttons: Save, Remove from this day, Move to... (any day and meal) and Cancel. Every meal also has a "+ Add dish".
// The dinner main (★ line) and the dessert can be edited too. Changes are saved straight away to the same place the Menu Editor saves
// (the menu the week is using: Menu 1 or Menu 2 Más Carne), so the Menu Editor, history and "Restore original menu" keep working as before.
// A menu is a weekly pattern: changing Thursday changes every Thursday that uses that menu, not just the week on screen.

const MCE_MEALS = [['lightBreakfast', 'Fruit, Coffee & Tea'], ['brunch', 'Brunch'], ['lunch', 'Lunch'], ['snack', 'Snack'], ['dinner.dishes', 'Dinner (soup, salad, side…)']];
let _mceCtx = null;   // what the open window is editing

function mceCss() {
  if (document.getElementById('mceCss')) return;
  const st = document.createElement('style'); st.id = 'mceCss';
  st.textContent = '.menu-dish[data-mce]{cursor:pointer;border-radius:4px}.menu-dish[data-mce]:hover{background:#fff7ed;outline:1px dashed #fdba74}.mce-add{display:block;margin:2px 0 0;padding:2px 4px;font-size:10.5px;color:#c2410c;background:none;border:none;cursor:pointer;text-align:left;font-family:inherit;opacity:.75}.mce-add:hover{opacity:1;text-decoration:underline}';
  document.head.appendChild(st);
}
function mceVariantNow() { try { return menuVariantForWeek(menuCurrentMonday); } catch (e) { return 'menu1'; } }
function mceDayIdx(ds) { return menuDayIndex(ds); }

// find the grid's cells and give every real dish line its address
function mceDecorate() {
  try {
    if (typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE && !document.body.classList.contains('admin-preview')) return;
    mceCss();
    const grid = document.getElementById('menuGrid'); if (!grid) return;
    const dates = [...grid.querySelectorAll('.menu-day-header')].map(h => (/menuPrintDay\('([^']+)'\)/.exec(h.getAttribute('onclick') || '') || [])[1]);
    if (dates.length !== 7 || dates.some(d => !d)) return;
    const cells = [...grid.querySelectorAll('.menu-grid-cell')];
    const weekHasLunch = dates.some(ds => (menuSchedule[ds] && menuSchedule[ds].lunch || []).length > 0);
    const weekHasBreakfast = dates.some(ds => (menuSchedule[ds] && menuSchedule[ds].breakfast || []).length > 0);
    const meals = ['lightBreakfast', ...(weekHasBreakfast ? ['breakfast'] : []), 'brunch', ...(weekHasLunch ? ['lunch'] : []), 'snack', 'dinner'];
    if (cells.length !== meals.length * 7) return;
    cells.forEach((cell, n) => {
      const meal = meals[Math.floor(n / 7)], ds = dates[n % 7];
      if (meal === 'breakfast') return;                       // not part of the editable menu
      const list = cell.querySelector('.menu-dish-list'); if (!list || list.dataset.mceDone) return; list.dataset.mceDone = '1';
      const real = [...list.querySelectorAll('.menu-dish')].filter(el => el.style.visibility !== 'hidden' && !/^—$/.test(el.textContent.trim()));
      const md = menuDataFor(ds) || {};
      let entries = [];
      if (meal === 'dinner') {
        const d = md.dinner || {};
        if (d.protein) entries.push({ path: 'dinner.protein' });
        (d.dishes || []).forEach((x, i) => entries.push({ path: 'dinner.dishes', i }));
        if (d.dessert) entries.push({ path: 'dinner.dessert' });
      } else {
        const dishes = (meal === 'lunch' && !((menuSchedule[ds] && menuSchedule[ds].lunch) || []).length) ? [] : (md[meal] || []);
        dishes.forEach((x, i) => entries.push({ path: meal, i }));
      }
      real.forEach((el, k) => {
        const e = entries[k]; if (!e) return;
        el.dataset.mce = '1'; el.title = 'Click to edit, move or remove this dish';
        el.addEventListener('click', ev => { ev.stopPropagation(); mceOpen(ds, e.path, e.i); });
      });
      // the "+ add dish" button was removed (Darlene 2026-10-25); dishes can still be clicked to edit, move or remove
    });
  } catch (e) { console.warn('[menu-click-edit]', e); }
}

// put the Menu Editor's working copy in step with the menu this week uses, then hand back the day
async function mceLoadState() {
  const v = mceVariantNow();
  _meMenu = v;
  _meOv = await meFetch(v);
  _meLoadedAt = _meOv ? _meOv.updatedAt : null;
  _meDays = JSON.parse(JSON.stringify(meTarget(v)));
  _meDish = {}; _meDirty = false;
  return v;
}
function mceListOf(day, path) {
  const d = (_meDays[day] = _meDays[day] || {});
  if (path === 'dinner.dishes') { d.dinner = d.dinner || { dishes: [] }; d.dinner.dishes = d.dinner.dishes || []; return d.dinner.dishes; }
  d[path] = d[path] || []; return d[path];
}
function mceDayName(di) { return (typeof ME_DAYS !== 'undefined' && ME_DAYS[di]) || 'Day ' + di; }

async function mceOpen(ds, path, i) {
  try { await mceLoadState(); } catch (e) { showToast('Could not open the menu: ' + (e.message || e)); return; }
  const di = mceDayIdx(ds);
  let raw = '';
  if (path === 'dinner.protein') raw = (_meDays[di].dinner || {}).protein || '';
  else if (path === 'dinner.dessert') raw = (_meDays[di].dinner || {}).dessert || '';
  else if (i != null) raw = mceListOf(di, path)[i] || '';
  const key = meClean(raw), det = key ? menuItemDetail(key) : { name: '', desc: '' };
  _mceCtx = { ds, di, path, i, key, isNew: i == null && !/^dinner\.(protein|dessert)$/.test(path) };
  const star = /★/.test(raw), starOk = path === 'brunch' || path === 'lunch';
  const single = /^dinner\.(protein|dessert)$/.test(path);
  const where = single ? (path === 'dinner.protein' ? 'Dinner main' : 'Dessert') : (MCE_MEALS.find(m => m[0] === path) || [])[1];
  let ov = document.getElementById('mceOv'); if (ov) ov.remove();
  ov = document.createElement('div'); ov.id = 'mceOv';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const inp = "width:100%;padding:8px 10px;border:1.5px solid #d6cfc4;border-radius:8px;font-family:'Jost',sans-serif;font-size:13.5px;box-sizing:border-box;margin:3px 0 10px";
  const lab = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#8a7e74';
  const dests = Object.keys(ME_DAYS).map(d => `<optgroup label="${meEsc(ME_DAYS[d])}">` + MCE_MEALS.map(m => `<option value="${d}|${m[0]}">${meEsc(m[1])}</option>`).join('') + '</optgroup>').join('');
  ov.innerHTML = `<div style="background:#fff;border-radius:12px;width:min(520px,100%);max-height:92vh;overflow:auto;padding:20px;font-family:'Jost',sans-serif">
    <div style="font-size:17px;font-weight:700;margin-bottom:2px">${_mceCtx.isNew ? 'Add a dish' : 'Edit this dish'}</div>
    <div style="font-size:12.5px;color:#6b7280;margin-bottom:14px">${meEsc(mceDayName(di))} · ${meEsc(where || '')}. This is the weekly menu, so it changes every ${meEsc(mceDayName(di))} that uses ${meEsc(MENU_VARIANTS[mceVariantNow()] || 'this menu')}.</div>
    <label style="${lab}">Name on the menu (Spanish)</label><input id="mceName" value="${meEsc(key)}" style="${inp}">
    <label style="${lab}">English name</label><input id="mceEn" value="${meEsc(det.name || '')}" style="${inp}">
    ${single && path === 'dinner.dessert' ? '<div style="font-size:11.5px;color:#7f8c9a;margin:-6px 0 10px">Two desserts: separate them with · </div>' : ''}
    <label style="${lab}">Description (printed menu)</label><textarea id="mceDesc" rows="3" style="${inp}">${meEsc(det.desc || '')}</textarea>
    ${starOk ? `<label style="font-size:13px;display:flex;gap:8px;align-items:center;margin:0 0 12px"><input type="checkbox" id="mceStar" ${star ? 'checked' : ''}> ★ Main dish of this meal</label>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <button class="btn btn-primary" id="mceSave" style="flex:1;min-width:120px" onclick="mceSave()">Save</button>
      <button class="btn btn-secondary" style="flex:1;min-width:90px" onclick="mceClose()">Cancel</button></div>
    ${_mceCtx.isNew ? '' : `<div style="border-top:1px solid #eee;padding-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <select id="mceMove" style="flex:1;min-width:160px;padding:8px;border:1.5px solid #d6cfc4;border-radius:8px;font-family:inherit;font-size:13px"><option value="">Move to…</option>${single ? '' : dests}</select>
      <button class="btn btn-secondary" ${single ? 'disabled title="Edit the text instead, or use Remove"' : ''} onclick="mceMoveDish()">Move</button>
      <button class="btn btn-secondary" style="color:#b91c1c" onclick="mceRemove()">Remove from this day</button></div>`}
    <div style="font-size:11.5px;color:#9ca3af;margin-top:10px">Saved straight away. History and "Restore original menu" are in the Menu Editor.</div></div>`;
  document.body.appendChild(ov);
  const f = document.getElementById('mceName'); if (f) f.focus();
}
function mceClose() { const ov = document.getElementById('mceOv'); if (ov) ov.remove(); _mceCtx = null; }

// keep every dish's custom wording when saving (the Menu Editor only keeps the ones it has drawn)
function mceKeepAllDetails() {
  const names = new Set();
  Object.values(_meDays).forEach(d => {
    ['lightBreakfast', 'brunch', 'lunch', 'snack'].forEach(k => (d[k] || []).forEach(x => names.add(meClean(x))));
    const din = d.dinner || {};
    (din.dishes || []).forEach(x => names.add(meClean(x)));
    if (din.protein) names.add(meClean(din.protein));
    if (din.dessert) String(din.dessert).split('·').forEach(x => names.add(x.trim()));
  });
  names.forEach(n => { if (n) { try { meDetail(n); } catch (e) {} } });
}
async function mceCommit(msg) {
  mceKeepAllDetails();
  await meSave();                                 // writes the same record the Menu Editor writes, with its checks and history
  try { if (typeof menuRenderWeek === 'function') menuRenderWeek(); } catch (e) {}
  mceClose();
}
function mceSave() {
  const c = _mceCtx; if (!c) return;
  const name = (document.getElementById('mceName').value || '').trim();
  const en = (document.getElementById('mceEn').value || '').trim(), desc = (document.getElementById('mceDesc').value || '').trim();
  const star = !!(document.getElementById('mceStar') || {}).checked;
  if (!name) { showToast('Type the name of the dish first.'); return; }
  const day = _meDays[c.di];
  if (c.path === 'dinner.protein') { day.dinner = day.dinner || { dishes: [] }; day.dinner.protein = name; }
  else if (c.path === 'dinner.dessert') { day.dinner = day.dinner || { dishes: [] }; day.dinner.dessert = name; }
  else {
    const list = mceListOf(c.di, c.path), val = name + ((c.path === 'brunch' || c.path === 'lunch') && star ? ' ★' : '');
    if (c.i == null) list.push(val); else list[c.i] = val;
  }
  const det = meDetail(name); det.name = en; det.desc = desc;
  mceCommit();
}
function mceRemove() {
  const c = _mceCtx; if (!c) return;
  if (!confirm('Remove "' + (c.key || 'this dish') + '" from ' + mceDayName(c.di) + '?')) return;
  const day = _meDays[c.di];
  if (c.path === 'dinner.protein') delete (day.dinner || {}).protein;
  else if (c.path === 'dinner.dessert') delete (day.dinner || {}).dessert;
  else mceListOf(c.di, c.path).splice(c.i, 1);
  mceCommit();
}
function mceMoveDish() {
  const c = _mceCtx; if (!c) return;
  const v = (document.getElementById('mceMove') || {}).value; if (!v) { showToast('Choose where to move it.'); return; }
  const [toDay, toPath] = v.split('|'), src = mceListOf(c.di, c.path);
  let item = src[c.i]; src.splice(c.i, 1);
  if (!(toPath === 'brunch' || toPath === 'lunch')) item = meClean(item);
  mceListOf(+toDay, toPath).push(item);
  mceCommit();
}
(function () {
  const orig = window.menuRenderWeek;
  if (typeof orig !== 'function') return;
  window.menuRenderWeek = function () { const r = orig.apply(this, arguments); setTimeout(mceDecorate, 0); return r; };
  setTimeout(mceDecorate, 0);
})();
