// ===== reports-daily-categories.js — "Sales by category" on the Daily Report =====
// Loaded as a classic script AFTER reports.js; shares global scope. Standalone: wraps _rptRenderDailyView and adds one card above
// "Payments by User"; reports.js is not edited. Uses the same rows, user filter and date range as the cards above it, so the
// total here equals Room Sales + Folio Charges exactly (credits net against their own category, tax is included like everywhere
// else in this report). Everything is by the date the charge was POSTED (Tulum day), same as the Room Sales card.
// Categories asked for by Darlene 2026-10-21: Rooms, Meal Plan, Boutique, Spa, Transport, Bar, Restaurant, Tours, Rituals.
// Folio items today only carry Room, Spa, Restaurant, Transport/Transportation, Tour, Boutique (+ Tip, Credit, Upgrade...), so
// Meal Plan, Bar and Rituals are recognised from the category OR the wording of the description; anything not recognised lands in
// "Other" with its original category names listed, so nothing is hidden and the total always ties out.
const RDC_ROWS = ['Rooms', 'Meal Plan', 'Boutique', 'Spa', 'Transport', 'Bar', 'Restaurant', 'Tours', 'Rituals'];

function rdcCategory(i) {
  const cat = String(i.category || '').toLowerCase().trim(), desc = String(i.description || '').toLowerCase();
  if (cat === 'room') return 'Rooms';
  if (/meal ?plan|plan de comida/.test(cat) || /meal ?plan|plan de comida/.test(desc)) return 'Meal Plan';
  if (/ritual/.test(cat) || /ritual|temazcal|ceremon|cacao/.test(desc)) return 'Rituals';
  if (cat === 'bar' || /\bbar\b/.test(desc)) return 'Bar';
  if (cat === 'boutique') return 'Boutique';
  if (cat === 'spa' || cat === 'massage') return 'Spa';
  if (cat === 'transport' || cat === 'transportation') return 'Transport';
  if (cat === 'restaurant') return 'Restaurant';
  if (cat === 'tour' || cat === 'tours') return 'Tours';
  return 'Other';
}

function rdcSummary() {
  const rows = _rptDailyFolioCharges(), out = {};
  rows.forEach(i => {
    const k = rdcCategory(i), o = out[k] = out[k] || { n: 0, amt: 0, names: {} };
    o.n++; o.amt += Number(i.amount) || 0;
    if (k === 'Other') { const nm = i.category || 'No category'; o.names[nm] = (o.names[nm] || 0) + (Number(i.amount) || 0); }
  });
  return out;
}

function rdcHtml() {
  const s = rdcSummary(), total = Object.values(s).reduce((t, o) => t + o.amt, 0);
  const th = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;padding:8px 14px;border-bottom:2px solid var(--border)';
  const row = (name, o, note) => `<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:9px 14px;font-size:13px;font-weight:600;color:#111827">${name}${note ? `<div style="font-size:11px;font-weight:400;color:#9ca3af">${note}</div>` : ''}</td><td style="padding:9px 14px;text-align:center;font-size:12px;color:#6b7280">${o ? o.n : 0}</td><td style="padding:9px 14px;text-align:right;font-size:14px;font-weight:700;color:${o && o.amt < 0 ? '#16a34a' : '#111827'}">${fmt$(o ? o.amt : 0)}</td></tr>`;
  const other = s.Other, otherNote = other ? Object.entries(other.names).map(([k, v]) => `${escHtml(k)} ${fmt$(v)}`).join(' · ') : '';
  return `<div id="rdcCard" style="margin-bottom:24px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:8px">Sales by Category — charged on the day</div>
    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden;max-width:620px"><table style="width:100%;border-collapse:collapse">
      <thead style="background:#f8fafc"><tr><th style="${th};text-align:left">Category</th><th style="${th};text-align:center">Charges</th><th style="${th};text-align:right">Amount</th></tr></thead>
      <tbody>${RDC_ROWS.map(n => row(n, s[n], n === 'Rooms' ? 'Room sales posted this day' : '')).join('')}${other ? row('Other', other, otherNote) : ''}
        <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:800;font-size:13px">Total charged</td><td></td><td style="padding:10px 14px;text-align:right;font-weight:800;font-size:15px">${fmt$(total)}</td></tr></tbody></table></div></div>`;
}

(function () {
  if (typeof _rptRenderDailyView !== 'function' || typeof _rptDailyFolioCharges !== 'function') return;
  const orig = window._rptRenderDailyView;
  window._rptRenderDailyView = function () {
    const r = orig.apply(this, arguments);
    try {
      const el = document.getElementById('reportsContent'); if (!el || document.getElementById('rdcCard')) return r;
      const label = [...el.querySelectorAll('div')].find(d => d.children.length === 0 && /^payments by user$/i.test(d.textContent.trim()));
      const anchor = label ? label.parentElement : (el.querySelector('div[style*="grid-template-columns:repeat(5"]') || {}).nextElementSibling;
      const holder = document.createElement('div'); holder.innerHTML = rdcHtml();
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(holder.firstElementChild, anchor);
      else (el.firstElementChild || el).appendChild(holder.firstElementChild);
    } catch (e) { console.warn('[daily categories] could not render', e); }
    return r;
  };
})();
