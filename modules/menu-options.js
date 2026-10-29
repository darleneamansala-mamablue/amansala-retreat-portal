// ===== menu-options.js — a pool of OPTION dishes you can swap in and out of the weekly menu (Darlene 2026-10-29) =====
// Loaded as a classic script AFTER menu-click-edit.js; shares global scope. Standalone: menu-click-edit.js is only wrapped (mceOpen, mceSave, menuRenderWeek).
// Idea: "10 options for a 7-day meal". Each meal (brunch, snack, dinner soup/salad/side, dinner main, dessert, ...) has a list of OPTION dishes that are not on the menu right now.
//   - On the Menu tab, the "🍽 Options" button opens the list, by meal: add a dish (Spanish name, English name, description) or delete one.
//   - Click a dish (the same window as "Edit this dish"): a new "Options" box lets you PICK an option. Pressing Save puts it in place of this dish — and the dish you took out goes
//     into the options list for that meal, so it can come back later. In "+ add dish" the picked option is added and leaves the list.
//   - "Put this dish in the options list" in the same window adds the dish you are looking at to the list without changing the menu.
// Swapping saves through the same path as every other click-edit (so it is the weekly pattern of the menu in use, history and "Restore original menu" keep working).
// The list is stored in app_store key 'menuOptionsPool' = { '<meal path>': [ {name, en, desc} ] }.
(function () {
  const KEY = 'menuOptionsPool';
  const MEALS = [['lightBreakfast', 'Fruit, Coffee & Tea'], ['breakfast', 'Breakfast'], ['brunch', 'Brunch'], ['lunch', 'Lunch'], ['snack', 'Snack'], ['dinner.dishes', 'Dinner (soup, salad, side…)'], ['dinner.protein', 'Dinner main'], ['dinner.dessert', 'Dessert']];
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  let pool = null, pick = null, oldDish = null, mgrMeal = 'brunch';

  async function load() {
    if (pool) return pool;
    try { const { data } = await db.from('app_store').select('value').eq('key', KEY).maybeSingle(); pool = (data && data.value && typeof data.value === 'object') ? data.value : {}; }
    catch (e) { try { pool = JSON.parse(localStorage.getItem('amansala_menu_options_pool') || '{}'); } catch (e2) { pool = {}; } }
    return pool;
  }
  async function save() {
    try { localStorage.setItem('amansala_menu_options_pool', JSON.stringify(pool)); } catch (e) {}
    try { await db.from('app_store').upsert({ key: KEY, value: pool, updated_at: new Date().toISOString() }); }
    catch (e) { if (typeof showToast === 'function') showToast('Could not save the options: ' + (e.message || e)); }
  }
  const list = path => (pool[path] = pool[path] || []);
  const clean = s => (typeof meClean === 'function' ? meClean(s) : String(s || '').replace(/★/g, '').trim());
  const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
  function addOpt(path, o) { if (!o.name) return false; if (list(path).some(x => same(x.name, o.name))) return false; list(path).push({ name: clean(o.name), en: o.en || '', desc: o.desc || '' }); return true; }

  // ---- inside the "Edit this dish" window ----
  const prevOpen = window.mceOpen;
  if (typeof prevOpen === 'function') {
    window.mceOpen = async function () {
      const r = await prevOpen.apply(this, arguments);
      try {
        await load(); pick = null;
        const c = window._mceCtx || _mceCtx; const ov = document.getElementById('mceOv'); if (!c || !ov) return r;
        oldDish = c.isNew ? null : { name: c.key, en: (document.getElementById('mceEn') || {}).value || '', desc: (document.getElementById('mceDesc') || {}).value || '' };
        const opts = list(c.path);
        const saveRow = ov.querySelector('#mceSave'); if (!saveRow) return r;
        const box = document.createElement('div');
        box.style.cssText = 'margin:0 0 12px;padding:10px 12px;border:1.5px solid #fcd34d;background:#fffbeb;border-radius:10px';
        box.innerHTML = `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#92400e;margin-bottom:6px">Options for this meal${opts.length ? ' (' + opts.length + ')' : ''}</div>
          ${opts.length ? `<select id="mopSel" onchange="mopPick(this.value)" style="width:100%;padding:8px;border:1.5px solid #fcd34d;border-radius:8px;font-family:inherit;font-size:13px;background:#fff"><option value="">Swap with an option…</option>${opts.map((o, i) => `<option value="${i}">${esc(o.en || o.name)}${o.en ? ' — ' + esc(o.name) : ''}</option>`).join('')}</select>
          <div style="font-size:11.5px;color:#92400e;margin-top:4px">${c.isNew ? 'It is added when you press Save.' : 'Pick one, check it, then press Save. The dish you take out goes into the options.'}</div>` : '<div style="font-size:12.5px;color:#92400e">No options for this meal yet. Add some with the 🍽 Options button, or put this dish in the list below.</div>'}
          ${c.isNew ? '' : '<button type="button" onclick="mopPutThis()" style="margin-top:8px;padding:5px 11px;border:1.5px solid #fcd34d;border-radius:8px;background:#fff;color:#92400e;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">Put this dish in the options list</button>'}`;
        saveRow.parentElement.parentElement.insertBefore(box, saveRow.parentElement);
      } catch (e) { console.warn('[menu-options]', e); }
      return r;
    };
  }
  window.mopPick = function (i) {
    const c = _mceCtx; if (!c) return;
    const o = i === '' ? null : list(c.path)[+i]; pick = o || null; if (!o) return;
    const n = document.getElementById('mceName'), e = document.getElementById('mceEn'), d = document.getElementById('mceDesc');
    if (n) n.value = o.name; if (e) e.value = o.en || ''; if (d) d.value = o.desc || '';
  };
  window.mopPutThis = async function () {
    const c = _mceCtx; if (!c || !oldDish) return;
    const o = { name: (document.getElementById('mceName') || {}).value || oldDish.name, en: (document.getElementById('mceEn') || {}).value, desc: (document.getElementById('mceDesc') || {}).value };
    const ok = addOpt(c.path, o); await save();
    if (typeof showToast === 'function') showToast(ok ? '"' + clean(o.name) + '" is now in the options ✓' : 'It is already in the options.');
  };
  // when a picked option is saved: take it out of the list and put the dish it replaced into the list
  const prevSave = window.mceSave;
  if (typeof prevSave === 'function') {
    window.mceSave = function () {
      try {
        const c = _mceCtx;
        if (c && pick) {
          const l = list(c.path), ix = l.findIndex(x => same(x.name, pick.name)); if (ix >= 0) l.splice(ix, 1);
          if (!c.isNew && oldDish && oldDish.name && !same(oldDish.name, pick.name)) addOpt(c.path, oldDish);
          pick = null; save();
        }
      } catch (e) { console.warn('[menu-options] swap', e); }
      return prevSave.apply(this, arguments);
    };
  }

  // ---- the "🍽 Options" manager ----
  function mgrHtml() {
    const l = list(mgrMeal), inp = "padding:7px 9px;border:1.5px solid #d6cfc4;border-radius:8px;font-family:inherit;font-size:13px;box-sizing:border-box";
    return `<div style="background:#fff;border-radius:12px;width:min(640px,100%);max-height:92vh;overflow:auto;padding:20px;font-family:'Jost',sans-serif">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><div style="font-size:18px;font-weight:700">🍽 Option dishes</div><button onclick="document.getElementById('mopOv').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#6b7280">×</button></div>
      <div style="font-size:12.5px;color:#6b7280;margin-bottom:12px">Dishes you can swap in and out. On the menu, click a dish and choose “Swap with an option”. A dish you take out goes back into this list.</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${MEALS.map(([k, n]) => `<button onclick="mopMeal('${k}')" style="padding:5px 10px;border-radius:99px;border:1.5px solid ${k === mgrMeal ? '#2d6a6a' : '#d6cfc4'};background:${k === mgrMeal ? '#2d6a6a' : '#fff'};color:${k === mgrMeal ? '#fff' : '#374151'};font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">${esc(n)}${(pool[k] || []).length ? ' · ' + pool[k].length : ''}</button>`).join('')}</div>
      ${l.length ? l.map((o, i) => `<div style="display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid #f0ebe0"><div style="flex:1"><b>${esc(o.name)}</b>${o.en ? ' <span style="color:#6b7280">· ' + esc(o.en) + '</span>' : ''}${o.desc ? `<div style="font-size:12px;color:#9a8f83">${esc(o.desc)}</div>` : ''}</div><button onclick="mopDel(${i})" style="border:none;background:none;color:#b91c1c;cursor:pointer;font-size:12px;font-family:inherit">Delete</button></div>`).join('') : '<div style="font-size:13px;color:#6b7280;padding:8px 0">No options for this meal yet.</div>'}
      <div style="margin-top:14px;padding-top:12px;border-top:2px solid #e8dfd4"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#8a7e74;margin-bottom:6px">Add an option</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input id="mopN" placeholder="Name on the menu (Spanish)" style="${inp}"><input id="mopE" placeholder="English name" style="${inp}"><input id="mopD" placeholder="Description (printed menu)" style="${inp};grid-column:1/-1"></div>
        <button onclick="mopAdd()" style="margin-top:8px;padding:8px 16px;border:none;border-radius:8px;background:#2d6a6a;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">+ Add to ${esc((MEALS.find(m => m[0] === mgrMeal) || [])[1] || '')}</button></div></div>`;
  }
  window.mopOpen = async function () {
    await load();
    let ov = document.getElementById('mopOv');
    if (!ov) { ov = document.createElement('div'); ov.id = 'mopOv'; ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px'; document.body.appendChild(ov); }
    ov.innerHTML = mgrHtml();
  };
  const redraw = () => { const ov = document.getElementById('mopOv'); if (ov) ov.innerHTML = mgrHtml(); };
  window.mopMeal = k => { mgrMeal = k; redraw(); };
  window.mopDel = async i => { const l = list(mgrMeal); const o = l[i]; if (!o || !confirm('Delete "' + o.name + '" from the options?')) return; l.splice(i, 1); await save(); redraw(); };
  window.mopAdd = async () => {
    const g = id => (document.getElementById(id) || {}).value || '';
    if (!g('mopN').trim()) { if (typeof showToast === 'function') showToast('Type the name of the dish first.'); return; }
    if (!addOpt(mgrMeal, { name: g('mopN'), en: g('mopE').trim(), desc: g('mopD').trim() })) { if (typeof showToast === 'function') showToast('That dish is already in the options.'); return; }
    await save(); redraw();
  };

  // button next to "✏️ Edit dishes / add a dish"
  function addBtn() {
    const t = document.getElementById('mceToggle'); if (!t || document.getElementById('mopBtn')) return;
    const b = document.createElement('button'); b.id = 'mopBtn'; b.type = 'button'; b.onclick = window.mopOpen; b.textContent = '🍽 Options';
    b.style.cssText = "margin:0 0 12px 8px;padding:8px 16px;border-radius:9px;font-family:'Jost',sans-serif;font-size:13px;font-weight:700;cursor:pointer;border:2px solid #fcd34d;background:#fffbeb;color:#92400e";
    t.after(b);
  }
  const prevRender = window.menuRenderWeek;
  if (typeof prevRender === 'function') window.menuRenderWeek = function () { const r = prevRender.apply(this, arguments); setTimeout(addBtn, 50); return r; };
  setTimeout(addBtn, 2500);
})();
