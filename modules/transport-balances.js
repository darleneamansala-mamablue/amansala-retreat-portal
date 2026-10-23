// ===== transport-balances.js — Transport log: show what each guest still owes =====
// Loaded as a classic script AFTER transport.js; shares global scope. Standalone: wraps tr2LoadData (to read the guests' bills once the log has
// loaded, then redraw) and tr2RenderRow (to add a small badge under the guest's name). Badge: red "$761.80 due" when the bill is open, green
// "Paid ✓" when it is $0.00, grey "Credit $x" when overpaid; nothing when the guest has no bill. A bill is every folio on the guest's registration:
// qty x price plus the line's tax rate, payments being negative lines (the same sum as Reservations > Departures and guest-pay.html).
// Read-only. Only guests matched to a registration (row.regId) get a badge; guests staying in the next 30 days or checked out in the last 3 are read.
// Asked by Darlene 2026-10-22.
let trbBalance = {};   // regId -> bill total
let trbLoading = false, trbLoadedAt = 0;

async function trbFetchIn(table, col, ids, select) {
  const out = [];
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await db.from(table).select(select).in(col, chunk).order('id').range(from, from + 999);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}

async function trbLoad() {
  if (trbLoading || Date.now() - trbLoadedAt < 60000) return; trbLoading = true;   // bills change slowly; the log redraws often
  try {
    const t = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10), add = n => new Date(Date.parse(t + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
    const lo = add(-3), hi = add(30), bks = {}; (AppData.bookings || []).forEach(b => { bks[b.id] = b; });
    const regIds = (AppData.regs || []).filter(r => { const b = bks[r.bookingId] || {}, ci = r.checkIn || b.startDate, co = r.checkOut || b.endDate; return b.status !== 'cancelled' && ci && co && co >= lo && ci <= hi; }).map(r => r.id);
    const folios = regIds.length ? await trbFetchIn('folios', 'registration_id', regIds, 'id,registration_id') : [];
    const items = folios.length ? await trbFetchIn('folio_items', 'folio_id', folios.map(f => f.id), 'id,folio_id,qty,unit_price,tax_rate') : [];
    const byFolio = {}; items.forEach(i => { byFolio[i.folio_id] = (byFolio[i.folio_id] || 0) + (Number(i.qty) || 1) * (Number(i.unit_price) || 0) * (1 + (Number(i.tax_rate) || 0) / 100); });
    const next = {}; folios.forEach(f => { next[f.registration_id] = (next[f.registration_id] || 0) + (byFolio[f.id] || 0); });
    Object.keys(next).forEach(k => { next[k] = Math.round(next[k] * 100) / 100; });
    trbBalance = next; trbLoadedAt = Date.now();
  } catch (e) { console.warn('[transport-balances]', e.message); }
  trbLoading = false;
}

function trbBadge(regId) {
  if (!regId || !(regId in trbBalance)) return '';
  const b = trbBalance[regId], money = n => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const st = 'display:inline-block;margin-top:2px;font-size:9.5px;font-weight:700;padding:1px 7px;border-radius:10px;';
  if (Math.abs(b) < 0.5) return `<div><span style="${st}background:#d1fae5;color:#065f46">Paid ✓</span></div>`;
  return b > 0 ? `<div><span style="${st}background:#fee2e2;color:#b91c1c">${money(b)} due</span></div>` : `<div><span style="${st}background:#e5e7eb;color:#4b5563">Credit ${money(b)}</span></div>`;
}

(function () {
  if (typeof tr2RenderRow !== 'function' || typeof tr2LoadData !== 'function') return;
  const origRow = window.tr2RenderRow, origLoad = window.tr2LoadData;
  window.tr2RenderRow = function (e) {
    const html = origRow.apply(this, arguments);
    try { const badge = trbBadge(e && e.regId); return badge ? html.replace(/(<div style="font-weight:700;color:#111827">[^<]*<\/div>)/, '$1' + badge) : html; } catch (err) { return html; }
  };
  window.tr2LoadData = async function () {
    const out = await origLoad.apply(this, arguments);
    trbLoad().then(() => { try { if (typeof tr2BuildView === 'function' && document.getElementById('tr2-body')) tr2BuildView(); } catch (e) {} });
    return out;
  };
})();
