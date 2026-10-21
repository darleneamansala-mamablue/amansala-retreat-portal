// ===== reports-daily-categories.js — "Sales by category" on the Daily Report =====
// Loaded as a classic script AFTER reports.js; shares global scope. Standalone: wraps _rptRenderDailyView and adds one card above
// "Payments by User"; reports.js is not edited. Uses the same rows, user filter and date range as the cards above it, so the
// total here equals Room Sales + Folio Charges exactly (credits net against their own category, tax is included like everywhere
// else in this report). Everything is by the date the charge was POSTED (Tulum day), same as the Room Sales card.
// ROOMS are different: Darlene 2026-10-21 — posting a whole stay on the day it was booked "throws off the numbers", so Rooms here is
// what the stays EARN each night: for every booking that has a guest sleeping that night, its total room revenue (the portal's own
// _calcRoomRevenue, the same figure the Financial Summary uses, so it includes packages, tax and gratuity) divided evenly across its
// nights; Room Only bookings use roomRateTotal the same way. Room charges posted on the day are NOT added again (shown as a note).
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

// Nights in [from, to] (inclusive ISO dates) → [ISO date, ...]
function rdcDays(from, to) { const out = []; for (let d = pd(from); d <= pd(to) && out.length < 400; d = new Date(d.getTime() + DAY_MS)) out.push(fmtISO(d)); return out; }
function rdcRoomsEarned() {
  const days = rdcDays(_dailyFrom, _dailyTo); let amt = 0, stays = 0;
  (AppData.bookings || []).forEach(bk => {
    if (bk.status === 'cancelled' || !bk.startDate || !bk.endDate) return;
    const nights = getNights(bk); if (!nights) return;
    const n = days.filter(d => d >= bk.startDate && d < bk.endDate).length; if (!n) return;
    let total = 0;
    try { total = bk.bookingType === 'room_only' ? (bk.roomRateTotal || 0) : (typeof _calcRoomRevenue === 'function' ? _calcRoomRevenue(bk) : 0); } catch (e) { total = 0; }
    if (!total) return;
    amt += total / nights * n; stays += n;
  });
  return { amt: Math.round(amt * 100) / 100, nights: stays };
}

function rdcSummary() {
  const rows = _rptDailyFolioCharges(), out = {};
  rows.forEach(i => {
    const k = rdcCategory(i); if (k === 'Rooms') return; // rooms come from the nights stayed, below
    const o = out[k] = out[k] || { n: 0, amt: 0, names: {} };
    o.n++; o.amt += Number(i.amount) || 0;
    if (k === 'Other') { const nm = i.category || 'No category'; o.names[nm] = (o.names[nm] || 0) + (Number(i.amount) || 0); }
  });
  const re = rdcRoomsEarned(); out.Rooms = { n: re.nights, amt: re.amt, unit: 'room-nights' };
  return out;
}

function rdcHtml() {
  const s = rdcSummary(), posted = _rptDailyFolioCharges().filter(i => rdcCategory(i) === 'Rooms').reduce((t, i) => t + (Number(i.amount) || 0), 0), total = Object.values(s).reduce((t, o) => t + o.amt, 0);
  const th = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;padding:8px 14px;border-bottom:2px solid var(--border)';
  const row = (name, o, note) => `<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:9px 14px;font-size:13px;font-weight:600;color:#111827">${name}${note ? `<div style="font-size:11px;font-weight:400;color:#9ca3af">${note}</div>` : ''}</td><td style="padding:9px 14px;text-align:center;font-size:12px;color:#6b7280">${o ? o.n : 0}</td><td style="padding:9px 14px;text-align:right;font-size:14px;font-weight:700;color:${o && o.amt < 0 ? '#16a34a' : '#111827'}">${fmt$(o ? o.amt : 0)}</td></tr>`;
  const other = s.Other, otherNote = other ? Object.entries(other.names).map(([k, v]) => `${escHtml(k)} ${fmt$(v)}`).join(' · ') : '';
  return `<div id="rdcCard" style="margin-bottom:24px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:8px">Income by Category — for the day</div>
    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden;max-width:620px"><table style="width:100%;border-collapse:collapse">
      <thead style="background:#f8fafc"><tr><th style="${th};text-align:left">Category</th><th style="${th};text-align:center">Charges</th><th style="${th};text-align:right">Amount</th></tr></thead>
      <tbody>${RDC_ROWS.map(n => row(n, s[n], n === 'Rooms' ? 'Earned by nights stayed (bookings spread evenly per night, incl. packages, tax &amp; gratuity)' : '')).join('')}${other ? row('Other', other, otherNote) : ''}
        <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:800;font-size:13px">Total income for the day</td><td></td><td style="padding:10px 14px;text-align:right;font-weight:800;font-size:15px">${fmt$(total)}</td></tr></tbody></table></div>
    <div style="font-size:11.5px;color:#6b7280;margin-top:6px;max-width:620px">Rooms = nights stayed in the range. Room charges posted in the same range (${fmt$(posted)}, the Room Sales card) are not added again. Everything else = charged on the day.</div></div>`;
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
