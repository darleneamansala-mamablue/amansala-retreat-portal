// ===== transport-balances.js — Transport log: show what each guest still owes =====
// Loaded as a classic script AFTER transport.js; shares global scope. Standalone: wraps tr2LoadData (to read the guests' bills once the log has
// loaded, then redraw) and tr2RenderRow (to add a small badge under the guest's name). Badge: red "$761.80 due" when the bill is open, green
// "Paid ✓" when it is $0.00, grey "Credit $x" when overpaid; nothing when the guest has no bill. A bill is every folio on the guest's registration:
// qty x price plus the line's tax rate, payments being negative lines (the same sum as Reservations > Departures and guest-pay.html).
// Read-only. Only guests matched to a registration (row.regId) get a badge; guests staying in the next 30 days or checked out in the last 3 are read.
// Asked by Darlene 2026-10-22.
let trbBalance = {};   // regId -> [{ name, total }] one entry per guest folio on that registration
// Online stays (Extra Night / Book a Stay) bill on their own folio, not on the retreat's registration -- a guest who stayed an extra
// night and leaves that day showed the retreat's $0 instead of what they owe for the night (Jorge 2026-11-07). Departure rows now
// add the guest's stays that end on the departure day: online ones, and other registrations (room-only / next retreat).
let trbReq = [];       // [{ id, norm, email, checkIn, checkOut, total }]
let trbRegOut = {};    // regId -> effective check-out date
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
    const outBy = {}; (AppData.regs || []).forEach(r => { const b = bks[r.bookingId] || {}; outBy[r.id] = r.checkOut || b.endDate || ''; });
    const { data: reqs } = await db.from('booking_requests').select('id,first_name,last_name,email,check_in,check_out,status').gte('check_out', lo).lte('check_in', hi).neq('status', 'cancelled');
    const reqList = (reqs || []).filter(q => q.status !== 'cancelled' && q.status !== 'pending');
    const folios = regIds.length ? await trbFetchIn('folios', 'registration_id', regIds, 'id,registration_id,guest_name') : [];
    const reqFolios = reqList.length ? await trbFetchIn('folios', 'booking_request_id', reqList.map(q => q.id), 'id,booking_request_id') : [];
    const items = folios.length + reqFolios.length ? await trbFetchIn('folio_items', 'folio_id', [...folios, ...reqFolios].map(f => f.id), 'id,folio_id,qty,unit_price,tax_rate') : [];
    const byFolio = {}; items.forEach(i => { byFolio[i.folio_id] = (byFolio[i.folio_id] || 0) + (Number(i.qty) || 1) * (Number(i.unit_price) || 0) * (1 + (Number(i.tax_rate) || 0) / 100); });
    // One bill per guest (folio guest_name), like Reservations > Departures: guests sharing a room each have their own folio, so the
    // badge must not add them together. Folios with the same guest name on a registration are summed.
    const next = {};
    folios.forEach(f => {
      const list = (next[f.registration_id] = next[f.registration_id] || []), nm = trbNorm(f.guest_name);
      const hit = list.find(x => x.norm === nm);
      if (hit) hit.total += byFolio[f.id] || 0; else list.push({ norm: nm, name: f.guest_name, total: byFolio[f.id] || 0 });
    });
    Object.values(next).forEach(l => l.forEach(x => { x.total = Math.round(x.total * 100) / 100; }));
    const reqTotal = {}; reqFolios.forEach(f => { reqTotal[f.booking_request_id] = (reqTotal[f.booking_request_id] || 0) + (byFolio[f.id] || 0); });
    trbReq = reqList.filter(q => reqTotal[q.id] != null).map(q => ({ id: q.id, norm: trbNorm(`${q.first_name || ''} ${q.last_name || ''}`), email: String(q.email || '').trim().toLowerCase(), checkIn: q.check_in, checkOut: q.check_out, total: Math.round(reqTotal[q.id] * 100) / 100 }));
    trbRegOut = outBy;
    trbBalance = next; trbLoadedAt = Date.now();
  } catch (e) { console.warn('[transport-balances]', e.message); }
  trbLoading = false;
}

const trbNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// The folio for this transport guest: same name, or one name containing all the words of the other (only if exactly one folio fits).
function trbFind(regId, guest) {
  const list = trbBalance[regId]; if (!list || !list.length) return null;
  const g = trbNorm(guest), gw = g.split(' ').filter(Boolean);
  const same = list.find(x => x.norm === g);
  if (same) return same;
  const near = list.filter(x => { const xw = x.norm.split(' ').filter(Boolean), [short, long] = xw.length <= gw.length ? [xw, gw] : [gw, xw]; return short.length && short.every(w => long.includes(w)); });
  if (near.length === 1) return near[0];
  return null;   // no folio under this guest's name: show nothing rather than another guest's number
}

const trbSameName = (a, b) => { if (!a || !b) return false; if (a === b) return true; const aw = a.split(' '), bw = b.split(' '), [s, l] = aw.length <= bw.length ? [aw, bw] : [bw, aw]; return s.length >= 2 && s.every(w => l.includes(w)); };
// the guest's other stays that end on this departure day (an Extra Night after the retreat, a room-only stay...)
function trbLaterStays(e) {
  if (!e || e.type !== 'departure' || !e.date) return [];
  const g = trbNorm(e.guest), em = String(e.email || '').trim().toLowerCase(), out = [];
  trbReq.forEach(q => { if (q.checkOut === e.date && ((em && q.email === em) || trbSameName(q.norm, g))) out.push({ label: 'Extra night / online stay', total: q.total }); });
  Object.keys(trbBalance).forEach(rid => {
    if (rid === e.regId || trbRegOut[rid] !== e.date) return;
    const hit = trbFind(rid, e.guest); if (hit) out.push({ label: 'Other stay', total: hit.total });
  });
  return out;
}

function trbBadge(regId, guest, e) {
  const own = trbFind(regId, guest);
  // a departure after the retreat (extra night, own stay): leave on the day of that stay -> its bill counts, added to the retreat's
  const ownOut = regId ? trbRegOut[regId] : null;
  const later = e && e.type === 'departure' && (!ownOut || ownOut < e.date || !own) ? trbLaterStays(e) : [];
  if (!own && !later.length) return '';
  const b = Math.round(((own ? own.total : 0) + later.reduce((s, x) => s + x.total, 0)) * 100) / 100, money = n => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tip = later.length ? ` title="${[own ? `Retreat: ${money(own.total)}${own.total < 0 ? ' credit' : ''}` : '', ...later.map(x => `${x.label}: ${money(x.total)}${x.total < 0 ? ' credit' : ''}`)].filter(Boolean).join(' · ')}"` : '';
  const st = 'display:inline-block;margin-top:2px;font-size:9.5px;font-weight:700;padding:1px 7px;border-radius:10px;';
  const plus = later.length ? ' <span style="font-weight:600">+ extra</span>' : '';
  if (Math.abs(b) < 0.5) return `<div><span${tip} style="${st}background:#d1fae5;color:#065f46">Paid ✓${plus}</span></div>`;
  return b > 0 ? `<div><span${tip} style="${st}background:#fee2e2;color:#b91c1c">${money(b)} due${plus}</span></div>` : `<div><span${tip} style="${st}background:#e5e7eb;color:#4b5563">Credit ${money(b)}${plus}</span></div>`;
}

(function () {
  if (typeof tr2RenderRow !== 'function' || typeof tr2LoadData !== 'function') return;
  const origRow = window.tr2RenderRow, origLoad = window.tr2LoadData;
  window.tr2RenderRow = function (e) {
    const html = origRow.apply(this, arguments);
    try { const badge = trbBadge(e && e.regId, e && e.guest, e); return badge ? html.replace(/(<div style="font-weight:700;color:#111827">[^<]*<\/div>)/, '$1' + badge) : html; } catch (err) { return html; }
  };
  window.tr2LoadData = async function () {
    const out = await origLoad.apply(this, arguments);
    trbLoad().then(() => { try { if (typeof tr2BuildView === 'function' && document.getElementById('tr2-body')) tr2BuildView(); } catch (e) {} });
    return out;
  };
})();
