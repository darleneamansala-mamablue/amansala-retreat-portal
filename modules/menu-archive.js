// ===== menu-archive.js — every week's menu is saved, and past weeks can be opened again (Darlene 2026-11-05) =====
// Loaded as a classic script AFTER menu.js and the other menu modules; shares global scope. Standalone: wraps menuRenderWeek and adds a "Past menus" button next to "Add Retreats to Week".
// Why: the Menu only lets you move forward from this week, and a past week redrawn from today's template can differ from what was really served (dishes and groups change). So the week
// is saved AS IT LOOKED: while a week is the current or a coming week, its drawn menu (dishes, groups, counts) is saved after every change in app_store 'menu_archive_<first day of the week>'.
// Once that week is over the saved copy stays exactly as it was (it is never overwritten by a later, different redraw). "Past menus" lists the saved weeks; open one to read it,
// print it, or delete it. "Save this week now" saves the week on screen on demand. Weeks that were never on screen before today are not saved: there is nothing to copy.
const MA_PREFIX = 'menu_archive_';
let maTimer = null, maLast = {}, maList = [];
const maEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const maToday = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const maWho = () => (typeof getCurrentSession === 'function' && (getCurrentSession() || {}).name) || 'Staff';
// the week's drawn grid, made read-only (no buttons that edit, no inputs)
function maSnapshot() {
  const g = document.querySelector('#menuGrid .menu-week-grid'); if (!g) return '';
  const wrap = g.closest('#menuGrid') || g.parentNode, clone = wrap.cloneNode(true);
  clone.querySelectorAll('.msd-bar').forEach(b => { b.classList.remove('msd-bar'); });
  clone.querySelectorAll('input,select,textarea,button').forEach(el => { if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') { const v = el.value; const sp = document.createElement('span'); sp.textContent = v; el.replaceWith(sp); } else if (el.tagName === 'SELECT') { const sp = document.createElement('span'); sp.textContent = el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : ''; el.replaceWith(sp); } else el.remove(); });
  let html = clone.innerHTML;
  html = html.replace(/\son(?:click|input|change|dragstart|dragover|drop|dragend|mousedown|dblclick|blur|focus|keydown)="[^"]*"/g, '').replace(/\sdraggable="true"/g, '').replace(/\scontenteditable="[^"]*"/g, '');
  return html;
}
async function maSave(force) {
  try {
    if (typeof menuCurrentMonday === 'undefined' || !menuCurrentMonday || typeof db === 'undefined') return;
    if (typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE) return;
    const week = menuCurrentMonday, endIso = (() => { const d = new Date(week + 'T12:00:00'); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })();
    const over = endIso < maToday();
    if (over && !force) return;                                    // a finished week is left exactly as it was saved
    const html = maSnapshot(); if (!html || (!force && maLast[week] === html)) return;
    if (over && force) { const { data } = await db.from('app_store').select('value').eq('key', MA_PREFIX + week).maybeSingle(); if (data && data.value && !confirm('This past week is already saved. Replace the saved copy with what is on screen now?')) return; }
    const { error } = await db.from('app_store').upsert({ key: MA_PREFIX + week, value: { week, end: endIso, savedAt: new Date().toISOString(), by: maWho(), html }, updated_at: new Date().toISOString() });
    if (!error) { maLast[week] = html; if (force && typeof showToast === 'function') showToast('Menu for the week of ' + week + ' saved.'); }
  } catch (e) { console.warn('[menu archive]', e); }
}
async function maOpenList() {
  let rows = [];
  try { const { data } = await db.from('app_store').select('key,updated_at').like('key', MA_PREFIX + '%').order('key', { ascending: false }); rows = data || []; } catch (e) {}
  maList = rows.map(r => r.key.slice(MA_PREFIX.length));
  const ov = document.createElement('div'); ov.id = 'maOv'; ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;overflow:auto;padding:24px';
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  ov.innerHTML = `<div style="max-width:980px;margin:0 auto;background:#fff;border-radius:14px;padding:20px 24px;font-family:'Jost',sans-serif"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div style="font-size:20px;font-weight:700">Past menus</div><div><button onclick="maSave(true)" style="padding:7px 14px;border:1.5px solid #b2d8d8;background:#f0f9f9;color:#2d6a6a;border-radius:8px;font-weight:700;font-family:inherit;cursor:pointer">Save this week now</button> <button onclick="document.getElementById('maOv').remove()" style="padding:7px 14px;border:1.5px solid #c8bfb5;background:#fff;border-radius:8px;font-family:inherit;cursor:pointer">Close</button></div></div>
    <div style="font-size:12.5px;color:#6b7280;margin:6px 0 12px">Each week is saved as it looked, while it is the current or a coming week. A finished week is never changed. Click a week to open it.</div>
    <div id="maList">${maList.length ? maList.map(w => `<button onclick="maView('${w}')" style="display:inline-block;margin:0 8px 8px 0;padding:8px 14px;border:1.5px solid #d6cfc4;background:#faf8f4;border-radius:10px;font-family:inherit;font-size:13.5px;font-weight:600;cursor:pointer">${fmt(w)}</button>`).join('') : '<div style="color:#9ca3af;padding:12px 0">No weeks are saved yet. The week on screen saves itself from now on.</div>'}</div><div id="maView" style="margin-top:14px"></div></div>`;
  document.body.appendChild(ov);
}
async function maView(week) {
  const box = document.getElementById('maView'); if (!box) return; box.innerHTML = '<div style="color:#9ca3af">Loading…</div>';
  try {
    const { data } = await db.from('app_store').select('value').eq('key', MA_PREFIX + week).maybeSingle(); const v = data && data.value;
    if (!v) { box.innerHTML = '<div style="color:#b91c1c">Could not open that week.</div>'; return; }
    const when = new Date(v.savedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Cancun' });
    box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px"><div style="font-weight:700">Week of ${maEsc(v.week)} <span style="font-weight:500;color:#6b7280;font-size:12.5px">· saved ${maEsc(when)} by ${maEsc(v.by)}</span></div><div><button onclick="maPrint('${maEsc(v.week)}')" style="padding:6px 12px;border:1.5px solid #c8bfb5;background:#fff;border-radius:8px;font-family:inherit;cursor:pointer">Print</button> <button onclick="maRemove('${maEsc(v.week)}')" style="padding:6px 12px;border:1.5px solid #fca5a5;background:#fff;color:#b91c1c;border-radius:8px;font-family:inherit;cursor:pointer">Delete</button></div></div><div id="maSaved" style="overflow:auto;border:1px solid #e8dfd4;border-radius:10px">${v.html}</div>`;
  } catch (e) { box.innerHTML = '<div style="color:#b91c1c">Could not open that week.</div>'; }
}
function maPrint(week) {
  const el = document.getElementById('maSaved'); if (!el) return;
  const w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to print.'); return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Menu · week of ' + week + '</title>' + [...document.querySelectorAll('style,link[rel="stylesheet"]')].map(n => n.outerHTML).join('') + '<style>body{background:#fff;margin:12px}@page{size:landscape;margin:8mm}</style></head><body>' + el.innerHTML + '</body></html>');
  w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 600);
}
async function maRemove(week) {
  if (!confirm('Delete the saved menu for the week of ' + week + '? This cannot be undone.')) return;
  try { await db.from('app_store').delete().eq('key', MA_PREFIX + week); delete maLast[week]; } catch (e) {}
  const ov = document.getElementById('maOv'); if (ov) ov.remove(); maOpenList();
}
(function () {
  if (typeof menuRenderWeek !== 'function') return;
  const orig = window.menuRenderWeek;
  window.menuRenderWeek = function () {
    const r = orig.apply(this, arguments);
    try {
      const pop = document.querySelector('#tab-menu button[onclick="menuPopulateFromRetreats()"]');
      if (pop && !document.getElementById('maBtn') && !(typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE)) pop.insertAdjacentHTML('beforebegin', `<button id="maBtn" onclick="maOpenList()" style="display:flex;align-items:center;gap:6px;padding:7px 14px;background:#fff;color:#374151;border:1.5px solid #d6cfc4;border-radius:8px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer">📚 Past menus</button>`);
      clearTimeout(maTimer); maTimer = setTimeout(() => maSave(false), 2500);
    } catch (e) { console.warn('[menu archive]', e); }
    return r;
  };
})();
