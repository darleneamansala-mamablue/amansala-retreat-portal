// ===== team-quick-panel.js — "🔥 Fire Pit" and "✅ Checklist" buttons that follow the retreat you are looking at (team only) =====
// Loaded as a classic script AFTER fire-pit.js and host-checklist.js; shares global scope. Standalone. The Fire Pit and Host Checklist boxes were built to sit inside the
// retreat window, which does not exist on every screen (the preview-as-teacher shows the teacher's own pages). These two small buttons sit in the bottom-left corner of ANY screen
// where a retreat is open, open that retreat's Fire Pit nights or Host Checklist in a pop-up, and save through the same functions as the tabs. Shown only to the team:
// the admin portal, or the preview-as-teacher on an admin device. A real teacher on their own device never sees them. Asked by Darlene 2026-10-24: "I can not see the fire pit".
function qpTeam() {
  try { return (typeof IS_TEACHER_MODE === 'undefined' || !IS_TEACHER_MODE) || sessionStorage.getItem('ama_admin_viewing') === '1' || !!localStorage.getItem('ama_admin_device'); } catch (e) { return false; }
}
function qpBookingId() {
  if (qpForced) return qpForced;
  try {
    if (typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE) { if (typeof _tsBkId !== 'undefined' && _tsBkId) return _tsBkId; return sessionStorage.getItem('teacher_bk_id') || localStorage.getItem('teacher_bk_id') || ''; }
    return (typeof regSelBk !== 'undefined' && regSelBk && regSelBk.id) || '';
  } catch (e) { return ''; }
}
let qpOpen = '', qpShownFor = '', qpForced = '';   // qpForced: open for this retreat instead of the one on screen (used by the Tours-for-this-group checklist)   // qpOpen: 'fire' | 'list' | ''

function qpBar() {
  let bar = document.getElementById('qpBar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'qpBar'; bar.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:99990;display:none;gap:8px;font-family:Jost,sans-serif'; document.body.appendChild(bar); }
  return bar;
}
function qpTick() {
  try {
    if (!document.body) return;
    const id = qpTeam() ? qpBookingId() : '', bk = id ? (AppData.bookings || []).find(b => b.id === id) : null, bar = qpBar();
    if (!bk) { bar.style.display = 'none'; qpShownFor = ''; return; }
    if (qpShownFor !== id) {
      qpShownFor = id; bar.style.display = 'flex';
      const isBbc = typeof hcIsBbc === 'function' && hcIsBbc(bk);   // BBC has no host checklist
      const st = 'padding:9px 14px;border-radius:99px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;box-shadow:0 4px 14px rgba(0,0,0,.25)';
      bar.innerHTML = `<button onclick="qpShow('fire')" style="${st};border:2px solid #fdba74;background:#fff7ed;color:#9a3412">🔥 Fire Pit</button>${isBbc ? '' : `<button onclick="qpShow('list')" style="${st};border:2px solid #6ee7b7;background:#ecfdf5;color:#065f46">✅ Checklist</button>`}<button onclick="qpShow('class')" style="${st};border:2px solid #c4b5fd;background:#f5f3ff;color:#5b21b6">➕ Add class</button><button onclick="qpShow('tip')" style="${st};border:2px solid #86efac;background:#f0fdf4;color:#166534">💵 Group tip</button>`;
    }
  } catch (e) {}
}
function qpShow(which, forId) {
  if (forId) qpForced = forId;
  const id = qpBookingId(), bk = (AppData.bookings || []).find(b => b.id === id); if (!bk) return;
  if (which === 'list' && typeof hcIsBbc === 'function' && hcIsBbc(bk)) { try { showToast('BBC groups do not have a host checklist.'); } catch (e) {} return; }
  qpOpen = which;
  if (typeof fpState !== 'undefined') fpState.bookingId = id;
  if (typeof hcState !== 'undefined') { hcState.bookingId = id; if (!hcState.loaded && typeof hcLoad === 'function') hcLoad(); }
  let m = document.getElementById('qpModal');
  if (!m) { m = document.createElement('div'); m.id = 'qpModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Jost,sans-serif'; document.body.appendChild(m); }
  m.style.display = 'flex'; qpDraw();
}
function qpDraw() {
  const m = document.getElementById('qpModal'); if (!m || m.style.display === 'none') return;
  const id = qpBookingId(), bk = (AppData.bookings || []).find(b => b.id === id); if (!bk) { m.style.display = 'none'; return; }
  const title = bk.leaderName || bk.retreatName || 'Retreat', fire = qpOpen === 'fire', cls = qpOpen === 'class', tip = qpOpen === 'tip';
  m.innerHTML = `<div style="background:#f5f1eb;border-radius:16px;max-width:760px;width:100%;max-height:92vh;overflow:auto;padding:20px 24px;box-shadow:0 12px 40px rgba(0,0,0,.3)">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px"><div><div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700">${fire ? '🔥 Fire Pit nights' : cls ? '➕ Add a class' : tip ? '💵 Group tip' : '✅ Host checklist'}</div><div style="font-size:12.5px;color:#6b7280">${String(title).replace(/</g, '&lt;')} · team only, teachers never see this</div></div>
      <button onclick="qpClose()" style="border:none;background:none;font-size:22px;cursor:pointer;color:#6b7280">✕</button></div>
    ${tip ? (typeof gtHtml === 'function' ? gtHtml(bk) : 'Tips are not loaded.') : cls ? (typeof ecHtml === 'function' ? ecHtml(bk) : 'Classes are not loaded.') : fire ? (typeof fpPickerHtml === 'function' ? fpPickerHtml(bk) : 'Fire Pit is not loaded.') : (typeof hcBodyHtml === 'function' ? hcBodyHtml(bk) : 'Checklist is not loaded.')}</div>`;
}
function qpClose() { qpOpen = ''; qpForced = ''; const m = document.getElementById('qpModal'); if (m) m.style.display = 'none'; try { if (typeof fpRenderBox === 'function') fpRenderBox(); if (typeof hcRenderBox === 'function') hcRenderBox(); } catch (e) {} }

// After any save from the pop-up, draw it again so ticks, nights and notes show straight away
(function () {
  const after = name => { const f = window[name]; if (typeof f !== 'function') return; window[name] = function () { const r = f.apply(this, arguments); Promise.resolve(r).then(() => setTimeout(qpDraw, 30)); return r; }; };
  ['hcToggle', 'hcNote', 'hcAddExtra', 'hcRemoveExtra', 'fpSave'].forEach(after);
  setInterval(qpTick, 1200); setTimeout(qpTick, 300);
})();
