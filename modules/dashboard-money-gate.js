// ===== dashboard-money-gate.js — only Jorge, Darlene and Melissa see the Dashboard money numbers (Darlene 2026-11-01) =====
// Sales, payments, balances and "money received" on the Dashboard are hidden for every other login (Max, Michele, all other staff) and are never built
// in a teacher / client session. Wraps buildDashboard and re-scrubs whenever another module redraws the Dashboard.
// This hides the numbers on screen; the data itself is still stored in the shared database (see the note to Jorge about database-side protection).
const DMG_ALLOWED = /^(jorge|darlene|melissa|hilario)\b/i;   // Hilario added 2026-11-03 (Jorge: same access as his)
function dmgIsTeacher() { try { return typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE && sessionStorage.getItem('ama_admin_viewing') !== '1'; } catch (e) { return true; } }
function dmgAllowed() {
  try { const s = JSON.parse(sessionStorage.getItem('amansala_staff_session') || 'null'); return !!(s && s.role === 'admin' && DMG_ALLOWED.test(String(s.name || '').trim())); } catch (e) { return false; }
}
let dmgBusy = false;
function dmgScrub() {
  const el = document.getElementById('dbContent'); if (!el || dmgBusy) return;
  if (dmgAllowed()) return;
  dmgBusy = true;
  try {
    [...el.children].forEach(c => { if (c.id === 'dmgNote') return; if (/\$\s?[\d,]|MX\$|\bUSD\b|\bMXN\b/.test(c.textContent || '')) c.remove(); });
    if (!document.getElementById('dmgNote')) {
      const n = document.createElement('div'); n.id = 'dmgNote';
      n.style.cssText = 'margin:10px 0;padding:10px 14px;border:1.5px solid #d6cfc4;border-radius:10px;background:#fff;color:#374151;font-size:13px;font-weight:600';
      n.textContent = 'Sales and payment numbers on the Dashboard are only shown to Jorge, Darlene, Melissa and Hilario.';
      el.insertBefore(n, el.firstChild);
    }
  } finally { dmgBusy = false; }
}
(function () {
  const orig = window.buildDashboard;
  if (typeof orig !== 'function') return;
  window.buildDashboard = function () {
    if (dmgIsTeacher()) { const el = document.getElementById('dbContent'); if (el) el.innerHTML = ''; return; }
    const r = orig.apply(this, arguments); dmgScrub(); return r;
  };
  const start = () => { const el = document.getElementById('dbContent'); if (!el) return setTimeout(start, 1500); new MutationObserver(() => dmgScrub()).observe(el, { childList: true }); dmgScrub(); };
  start();
})();
