// ===== tour-cancel.js — "Not enough people" / "Tour cancelled" on every Activities > Summary card (Darlene 2026-10-27) =====
// Loaded as a classic script AFTER activity-sheet.js and activity-leader.js; shares global scope. Standalone: activity-sheet.js is not edited.
// When nobody (or too few) join a tour, staff can mark that date's card as "Not enough people to run this tour" or "Tour cancelled".
// The card then shows a red banner at the top (with an Undo button). Saved with the card's other assignments (app_store 'act_ops',
// fields cancelled = 'notEnough' | 'cancelled' and cancelledAt) through the sheet's own actOpsSet. Nothing is deleted: Undo restores the card as it was.
const TC_LABEL = { notEnough: 'Not enough people to go on this tour', cancelled: 'Tour cancelled' };
function tcDecorate() {
  try {
    document.querySelectorAll('select[onchange*="\',\'guide1\'"]').forEach(g1 => {
      const m = /actOpsSet\('([^']+)','guide1'/.exec(g1.getAttribute('onchange') || ''); if (!m) return;
      const key = m[1], ops = (typeof actOpsData !== 'undefined' && actOpsData[key]) || {};
      const opsBlock = g1.closest('div[style*="background:#f9f7f4"]'); if (!opsBlock || opsBlock.dataset.tcDone) return; opsBlock.dataset.tcDone = '1';
      const card = opsBlock.parentElement;
      const k = JSON.stringify(key).replace(/"/g, '&quot;');
      const btn = 'padding:7px 13px;border-radius:8px;font-family:\'Jost\',sans-serif;font-size:13px;font-weight:600;cursor:pointer;';
      const bar = document.createElement('div');
      if (ops.cancelled) {
        const when = ops.cancelledAt ? ' · ' + new Date(ops.cancelledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        bar.style.cssText = 'padding:12px 20px;background:#fee2e2;border-bottom:2px solid #dc2626;display:flex;align-items:center;gap:14px;flex-wrap:wrap';
        bar.innerHTML = `<span style="font-size:15px;font-weight:700;color:#b91c1c">🚫 ${TC_LABEL[ops.cancelled] || TC_LABEL.cancelled}${when}</span>` +
          `<button onclick="tcSet(${k},'')" style="${btn}background:#fff;color:#374151;border:1.5px solid #d1d5db">Undo — run the tour</button>`;
        card.insertBefore(bar, card.firstChild);
        card.style.opacity = '0.92';
      } else {
        bar.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 12px';
        bar.innerHTML = `<span style="font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">Can't run this tour?</span>` +
          `<button onclick="tcSet(${k},'notEnough')" style="${btn}background:#fff7ed;color:#c2410c;border:1.5px solid #fdba74">Not enough people</button>` +
          `<button onclick="tcSet(${k},'cancelled')" style="${btn}background:#fef2f2;color:#b91c1c;border:1.5px solid #fca5a5">Tour cancelled</button>`;
        const first = opsBlock.children[1]; opsBlock.insertBefore(bar, first || null);
      }
    });
  } catch (e) { /* never break the Activity Sheet */ }
}
window.tcSet = function (key, val) {
  if (typeof actOpsData === 'undefined') return;
  if (!actOpsData[key]) actOpsData[key] = {};
  actOpsData[key].cancelledAt = val ? new Date().toISOString() : '';
  actOpsSet(key, 'cancelled', val);
};
(function () {
  ['actSheetRenderSummary'].forEach(n => {
    const orig = window[n]; if (typeof orig !== 'function') return;
    window[n] = function () { const r = orig.apply(this, arguments); setTimeout(tcDecorate, 10); return r; };
  });
  setTimeout(tcDecorate, 10);
})();
