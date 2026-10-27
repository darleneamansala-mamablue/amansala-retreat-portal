// ===== tour-joined.js — "How many joined" on every Activities > Summary card (Darlene 2026-10-27) =====
// Loaded as a classic script AFTER activity-sheet.js; shares global scope. Standalone: activity-sheet.js is not edited.
// Guests don't always sign up on the portal, so staff can type how many people really joined that tour / ceremony.
// Saved with the card's other assignments (app_store 'act_ops', field joined) through the sheet's own actOpsSetNum.
// When a number is entered, the cost and payment lines use it instead of the sign-up count. Empty = keep using the sign-up list.
function tjHas(ops) { return ops && ops.joined !== undefined && ops.joined !== null && ops.joined !== ''; }
function tjDecorate() {
  try {
    document.querySelectorAll('select[onchange*="\',\'guide1\'"]').forEach(g1 => {
      const m = /actOpsSet\('([^']+)','guide1'/.exec(g1.getAttribute('onchange') || ''); if (!m) return;
      const key = m[1], ops = (typeof actOpsData !== 'undefined' && actOpsData[key]) || {};
      const opsBlock = g1.closest('div[style*="background:#f9f7f4"]'); if (!opsBlock || opsBlock.dataset.tjDone) return; opsBlock.dataset.tjDone = '1';
      const costEl = opsBlock.querySelector('[data-signed]'), signed = costEl ? parseInt(costEl.dataset.signed || '0') : 0;
      const k = JSON.stringify(key).replace(/"/g, '&quot;');
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:0 0 12px;padding:10px 12px;background:#ecfdf5;border:1.5px solid #6ee7b7;border-radius:9px';
      bar.innerHTML = `<label style="font-size:13px;font-weight:700;color:#065f46">👥 How many joined?</label>` +
        `<input type="number" min="0" inputmode="numeric" value="${tjHas(ops) ? Number(ops.joined) : ''}" placeholder="—" onchange="tjSet(${k},this.value)" style="width:90px;padding:7px 10px;border:1.5px solid #6ee7b7;border-radius:8px;font-family:'Jost',sans-serif;font-size:15px;font-weight:600;background:#fff">` +
        `<span style="font-size:12px;color:#047857">Signed up on the portal: <b>${signed}</b>${tjHas(ops) ? ' · using your number for the costs' : ' · leave empty to use the sign-ups'}</span>`;
      opsBlock.insertBefore(bar, opsBlock.children[1] || null);
    });
  } catch (e) { /* never break the Activity Sheet */ }
}
window.tjSet = function (key, val) {
  const v = String(val).trim() === '' ? '' : Math.max(0, parseInt(val, 10) || 0);
  if (typeof actOpsSetNum === 'function') actOpsSetNum(key, 'joined', v);
  if (typeof actSheetRenderSummary === 'function') actSheetRenderSummary();
};
(function () {
  const cost = window.actOpsCostHtml;
  if (typeof cost === 'function') window.actOpsCostHtml = function (ops, totalSigned, aoId, opsKey) {
    if (tjHas(ops)) totalSigned = Number(ops.joined) || 0;
    return cost.call(this, ops, totalSigned, aoId, opsKey);
  };
  const orig = window.actSheetRenderSummary;
  if (typeof orig === 'function') window.actSheetRenderSummary = function () { const r = orig.apply(this, arguments); setTimeout(tjDecorate, 20); return r; };
  setTimeout(tjDecorate, 20);
})();
