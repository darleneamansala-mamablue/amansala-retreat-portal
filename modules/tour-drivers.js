// ===== tour-drivers.js — the list of tour drivers, each marked as an Amansala driver or an outside driver (Darlene 2026-11-04) =====
// Loaded as a classic script AFTER activity-sheet.js and activity-guides.js; shares global scope. Standalone: activity-sheet.js is not edited here.
// The Driver dropdown on the Activities page and the Tours & Ceremonies page reads TOUR_DRIVER_NAMES (a fixed list: Rubi, Rosy, Kike). This
// keeps that list but fills it in place from the saved driver list below, so both pages show the same drivers:
//   Amansala drivers: Teo, Beto        Outside driver (paid van, 1,900 MXN): Miguel
// plus anyone already assigned as a driver on any tour (so an existing assignment never disappears from its dropdown).
// Drivers are added and removed from the "Add a driver" strip at the top of Tours & Ceremonies. Saved in app_store 'tour_drivers' = [{ name, type }].

const TD_KEY = 'tour_drivers';
const TD_SEED = [{ name: 'Teo', type: 'amansala' }, { name: 'Beto', type: 'amansala' }, { name: 'Miguel', type: 'outside' }];
let tdList = TD_SEED.concat((typeof TOUR_DRIVER_NAMES !== 'undefined' ? TOUR_DRIVER_NAMES : []).map(n => ({ name: n, type: '' })));
const tdEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function tdTitle(n) { n = String(n || '').trim().replace(/\s+/g, ' '); return n.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
function tdType(name) { const d = tdList.find(x => x.name.toLowerCase() === String(name || '').toLowerCase()); return d ? d.type : ''; }
function tdRefresh() {
  try {
    if (typeof TOUR_DRIVER_NAMES === 'undefined') return;
    const have = new Map(), add = n => { const t = tdTitle(n); if (t && !have.has(t.toLowerCase())) have.set(t.toLowerCase(), t); };
    tdList.forEach(d => add(d.name));
    try { Object.values(typeof actOpsData !== 'undefined' ? actOpsData : {}).forEach(o => add(o && o.driver)); } catch (e) {}
    const names = [...have.values()];
    if (names.length !== TOUR_DRIVER_NAMES.length || names.some((n, i) => n !== TOUR_DRIVER_NAMES[i])) TOUR_DRIVER_NAMES.splice(0, TOUR_DRIVER_NAMES.length, ...names);
  } catch (e) { /* never break the Activities page */ }
}
async function tdLoad() {
  try {
    const { data } = await db.from('app_store').select('value').eq('key', TD_KEY).maybeSingle();
    if (data && Array.isArray(data.value) && data.value.length) tdList = data.value.filter(d => d && d.name).map(d => ({ name: tdTitle(d.name), type: d.type === 'amansala' || d.type === 'outside' ? d.type : '' }));
  } catch (e) {}
  tdRefresh();
}
async function tdSave() { try { await db.from('app_store').upsert({ key: TD_KEY, value: tdList, updated_at: new Date().toISOString() }); return true; } catch (e) { return false; } }
async function tdAdd(name, type) {
  name = tdTitle(name);
  if (!name) return { ok: false, msg: 'Type the driver\'s name first.' };
  if (tdList.some(d => d.name.toLowerCase() === name.toLowerCase())) return { ok: true, msg: name + ' is already on the list.' };
  tdList.push({ name, type: type === 'outside' ? 'outside' : 'amansala' }); tdRefresh();
  const saved = await tdSave();
  return { ok: saved, msg: saved ? name + ' added to the drivers.' : 'Could not save ' + name + ' — try again.' };
}
async function tdRemove(name) {
  tdList = tdList.filter(d => d.name.toLowerCase() !== String(name).toLowerCase());
  if (typeof TOUR_DRIVER_NAMES !== 'undefined') { const i = TOUR_DRIVER_NAMES.findIndex(n => n.toLowerCase() === String(name).toLowerCase()); if (i >= 0) TOUR_DRIVER_NAMES.splice(i, 1); }
  return tdSave();
}
// the strip drawn at the top of Tours & Ceremonies (under "Add a guide")
function tdStripHtml() {
  const tag = t => t === 'outside' ? ' <span style="color:#92400e">· outside</span>' : t === 'amansala' ? ' <span style="color:#166534">· Amansala</span>' : '';
  return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-4px 0 14px;padding:10px 12px;background:#fff;border:1px solid #e8dfd4;border-radius:10px">
    <span style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">Add a driver</span>
    <input id="tdNewName" type="text" placeholder="Type a name" onkeydown="if(event.key==='Enter')tdAddFromStrip()" style="padding:7px 10px;border:1.5px solid #d6cfc4;border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;width:150px">
    <select id="tdNewType" style="padding:7px 8px;border:1.5px solid #d6cfc4;border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;background:#fff"><option value="amansala">Amansala driver</option><option value="outside">Outside driver</option></select>
    <button onclick="tdAddFromStrip()" style="padding:7px 14px;font-size:12.5px;font-weight:700;border:none;border-radius:7px;background:#2d6a6a;color:#fff;cursor:pointer;font-family:'Jost',sans-serif">+ Add</button>
    <span style="font-size:11.5px;color:#6b7280;margin-left:8px">Drivers:</span>` +
    tdList.map(d => `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 4px 3px 10px;border-radius:99px;background:#f0ebe0;font-size:12.5px">${tdEsc(d.name)}${tag(d.type)}<button title="Remove ${tdEsc(d.name)} from the list" onclick="tdRemoveFromStrip('${tdEsc(d.name).replace(/'/g, "\\'")}')" style="border:none;background:none;cursor:pointer;color:#9ca3af;font-size:15px;line-height:1;padding:0 4px">&times;</button></span>`).join('') + '</div>';
}
async function tdAddFromStrip() {
  const inp = document.getElementById('tdNewName'), sel = document.getElementById('tdNewType'); if (!inp) return;
  const r = await tdAdd(inp.value, sel && sel.value);
  if (typeof showToast === 'function') showToast(r.msg);
  if (r.ok && typeof tcwRender === 'function') tcwRender();
}
async function tdRemoveFromStrip(name) {
  if (!confirm('Remove ' + name + ' from the driver list? Past assignments stay on the tours.')) return;
  await tdRemove(name); if (typeof tcwRender === 'function') tcwRender();
}
tdRefresh();
tdLoad();
// the saved assignments load a moment after the page: refresh a few times while they arrive, and just before the Activities page draws
let _tdTries = 0;
const _tdTimer = setInterval(() => { tdRefresh(); if (++_tdTries > 12) clearInterval(_tdTimer); }, 1500);
(function () {
  ['actSheetRenderSummary', 'actSheetRenderWeek', 'actByRetreatRender'].forEach(n => {
    const orig = window[n]; if (typeof orig !== 'function') return;
    window[n] = function () { tdRefresh(); return orig.apply(this, arguments); };
  });
})();
