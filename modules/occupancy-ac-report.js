// ===== occupancy-ac-report.js — "Occupancy & AC" report: pick From / To, get rooms occupied, AC units and room numbers (Darlene 2026-10-29) =====
// Loaded as a classic script AFTER host-checklist-all.js; shares global scope. Standalone and read-only: it only reads bookings and registrations.
// A room counts as occupied on a night when a named, non-cancelled guest is registered in it and their stay covers that night (their own check-in/out, else the
// room's, else the retreat's dates; check-out day not counted). The range is nights: From through To inclusive. Soft holds ("requested") are left out unless ticked.
// Rooms are counted as whole units: a bed ("12a") counts as its room ("12"); Casa Master, Casa Shanti and Casita 4 each count as ONE unit with all of their AC units.
// AC units per room are the inventory Darlene gave on 2026-10-12 (see OAR_AC_NOTES below); rooms she has not confirmed are counted with an assumption that is printed in the report.
const OAR_AC = { 'Casa Master': 7, 'Casa Shanti': 7, 'Casita 4': 3, '14B': 2, '11': 3, '19': 2, '19B': 2 };
const OAR_AC_NOTES = ['Casa Master 7, Casa Shanti 7, Casita 4: 3', 'Room 14B: 2, Room 11: 3, 19A/19B: 2 each', 'Other triples: 2 each (rooms 6 and 32 are not confirmed yet, counted as 2)', 'Every other guest room: 1'];
let oarRows = [], oarNights = [];

function oarToday() { return new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10); }
function oarAdd(d, n) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function oarFmt(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); }
const oarEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function oarTypeOf(room) { return (AppData.roomTypes || []).find(t => (t.rooms || []).includes(room)); }
function oarUnit(room) {
  const r = String(room || '').trim();
  if (/^casita 4/i.test(r)) return 'Casita 4';
  const t = oarTypeOf(r);
  if (/^(cm1|cg[1-6])$/.test(t && t.id) || /^casa master$/i.test(r)) return 'Casa Master';
  if (/^csh/.test(t && t.id) || /^casa shanti$/i.test(r)) return 'Casa Shanti';
  if (/^bd[1-4]$/.test(t && t.id)) { const s = splitDoubleHalf(r); if (s && s.base) return String(s.base).trim(); }
  return r;
}
function oarAcFor(unit) {
  if (OAR_AC[unit] != null) return OAR_AC[unit];
  const t = oarTypeOf(unit);
  if (t && t.id === 'rt8') return 2;     // triples
  return 1;
}

function oarScan(from, to, soft) {
  const nights = []; for (let d = from; d <= to && nights.length < 400; d = oarAdd(d, 1)) nights.push(d);
  const live = new Map((AppData.bookings || []).filter(b => b.status !== 'cancelled' && (soft || b.status !== 'requested') && b.startDate && b.endDate).map(b => [b.id, b]));
  const units = new Map();      // unit → {rooms:Set, guests:Set, retreats:Set, nights:Set}
  const perNight = nights.map(d => ({ d, units: new Set() }));
  (AppData.regs || []).forEach(r => {
    const bk = live.get(r.bookingId); if (!bk || r.cancelled) return;
    const unit = oarUnit(r.room); if (!unit) return;
    (r.guests || []).filter(g => g && g.name && !g.cancelled).forEach(g => {
      const a = String(g.checkIn || r.checkIn || bk.startDate).slice(0, 10), b = String(g.checkOut || r.checkOut || bk.endDate).slice(0, 10);
      perNight.forEach(p => {
        if (a <= p.d && p.d < b) {
          p.units.add(unit);
          let u = units.get(unit); if (!u) units.set(unit, u = { unit, rooms: new Set(), guests: new Set(), retreats: new Set(), nights: new Set() });
          u.rooms.add(r.room); u.guests.add(g.name.trim()); u.retreats.add(bk.leaderName || bk.retreatName || ''); u.nights.add(p.d);
        }
      });
    });
  });
  const rows = [...units.values()].map(u => ({ unit: u.unit, ac: oarAcFor(u.unit), rooms: [...u.rooms], guests: [...u.guests], retreats: [...u.retreats].filter(Boolean), nights: u.nights.size }))
    .sort((a, b) => String(a.unit).localeCompare(String(b.unit), undefined, { numeric: true }));
  return { rows, perNight: perNight.map(p => ({ d: p.d, rooms: p.units.size, ac: [...p.units].reduce((s, u) => s + oarAcFor(u), 0) })), nights: nights.length };
}

function oarRender() {
  const m = document.getElementById('oarModal'); if (!m) return;
  const from = document.getElementById('oarFrom').value, to = document.getElementById('oarTo').value, soft = document.getElementById('oarSoft').checked;
  const out = document.getElementById('oarOut');
  if (!from || !to || to < from) { out.innerHTML = '<div style="color:#b91c1c;font-size:13px">Pick a From date and a To date (To on or after From).</div>'; return; }
  const res = oarScan(from, to, soft); oarRows = res.rows; oarNights = res.perNight;
  const rooms = res.rows.length, ac = res.rows.reduce((s, r) => s + r.ac, 0);
  const peak = res.perNight.reduce((b, p) => p.rooms > b.rooms ? p : b, { rooms: 0, ac: 0, d: '' });
  const tile = (n, l, s) => `<div style="flex:1;min-width:150px;background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;padding:12px 16px"><div style="font-size:26px;font-weight:800;color:#2d2520">${n}</div><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280">${l}</div>${s ? `<div style="font-size:11.5px;color:#9ca3af;margin-top:2px">${s}</div>` : ''}</div>`;
  const th = 'text-align:left;padding:7px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;border-bottom:2px solid #e8dfd4';
  const td = 'padding:7px 10px;font-size:13px;border-bottom:1px solid #f0ebe0;vertical-align:top';
  out.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${tile(rooms, 'Rooms occupied', oarFmt(from) + ' – ' + oarFmt(to) + ' · ' + res.nights + ' night' + (res.nights !== 1 ? 's' : ''))}${tile(ac, 'AC units', 'in those rooms')}${tile(peak.rooms + ' / ' + peak.ac, 'Busiest night', peak.d ? oarFmt(peak.d) + ' (rooms / AC)' : '')}</div>
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin:6px 0">Room numbers</div>
    <div style="font-size:13.5px;line-height:1.7;background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;padding:10px 14px;margin-bottom:14px">${res.rows.length ? res.rows.map(r => oarEsc(r.unit)).join(' · ') : 'No rooms occupied in this range.'}</div>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;margin-bottom:14px"><tr><th style="${th}">Room</th><th style="${th}">AC</th><th style="${th}">Nights</th><th style="${th}">Guests</th><th style="${th}">Retreat</th></tr>
      ${res.rows.map(r => `<tr><td style="${td};font-weight:700">${oarEsc(r.unit)}</td><td style="${td}">${r.ac}</td><td style="${td}">${r.nights}</td><td style="${td};font-size:12px;color:#4b5563">${oarEsc(r.guests.join(', '))}</td><td style="${td};font-size:12px;color:#4b5563">${oarEsc(r.retreats.join(', '))}</td></tr>`).join('')}
      <tr><td style="${td};font-weight:800">Total</td><td style="${td};font-weight:800">${ac}</td><td colspan="3" style="${td};font-weight:800">${rooms} room${rooms !== 1 ? 's' : ''}</td></tr></table>
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin:6px 0">Night by night</div>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;margin-bottom:12px"><tr><th style="${th}">Night</th><th style="${th}">Rooms</th><th style="${th}">AC units</th></tr>
      ${res.perNight.map(p => `<tr><td style="${td}">${oarFmt(p.d)}</td><td style="${td}">${p.rooms}</td><td style="${td}">${p.ac}</td></tr>`).join('')}</table>
    <div style="font-size:11.5px;color:#9ca3af;line-height:1.6">A bed counts as its room, and Casa Master, Casa Shanti and Casita 4 count as one unit each. AC units used: ${OAR_AC_NOTES.join('; ')}.${soft ? '' : ' Soft holds are not counted.'}</div>`;
}
function oarCsv() {
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const lines = [['Room', 'AC units', 'Nights occupied', 'Guests', 'Retreat'].map(q).join(',')].concat(oarRows.map(r => [r.unit, r.ac, r.nights, r.guests.join('; '), r.retreats.join('; ')].map(q).join(',')));
  lines.push(['TOTAL', oarRows.reduce((s, r) => s + r.ac, 0), '', oarRows.length + ' rooms', ''].map(q).join(','));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = `occupancy-ac-${document.getElementById('oarFrom').value}-to-${document.getElementById('oarTo').value}.csv`; document.body.appendChild(a); a.click(); a.remove();
}
function oarPrint() {
  const body = document.getElementById('oarOut'); if (!body) return;
  const w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to print.'); return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Occupancy & AC</title><style>body{font-family:Jost,Arial,sans-serif;padding:24px;color:#2d2520}table{border-collapse:collapse;width:100%}</style></head><body><h2>Occupancy &amp; AC report</h2>' + body.innerHTML + '</body></html>');
  w.document.close(); setTimeout(() => w.print(), 400);
}
function oarOpen() {
  if (typeof hcTeam === 'function' && !hcTeam()) return;
  let m = document.getElementById('oarModal');
  if (!m) { m = document.createElement('div'); m.id = 'oarModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Jost,sans-serif'; document.body.appendChild(m); }
  const inp = 'padding:7px 10px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:inherit;font-size:13.5px;background:#fff';
  const btn = 'padding:7px 13px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer';
  m.style.display = 'flex';
  m.innerHTML = `<div style="background:#f5f1eb;border-radius:16px;max-width:860px;width:100%;max-height:92vh;overflow:auto;padding:20px 24px;box-shadow:0 12px 40px rgba(0,0,0,.3)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700;color:#2d2520">Occupancy &amp; AC report</div><button onclick="document.getElementById('oarModal').style.display='none'" style="background:none;border:none;font-size:24px;cursor:pointer;color:#6b7280">×</button></div>
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px">
      <div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:3px">From</label><input id="oarFrom" type="date" value="${oarToday()}" onchange="oarRender()" style="${inp}"></div>
      <div><label style="display:block;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:3px">To</label><input id="oarTo" type="date" value="${oarAdd(oarToday(), 6)}" onchange="oarRender()" style="${inp}"></div>
      <label style="display:flex;gap:6px;align-items:center;font-size:12.5px;color:#4b5563;padding-bottom:8px"><input id="oarSoft" type="checkbox" onchange="oarRender()"> Include soft holds</label>
      <button onclick="oarCsv()" style="${btn}">⬇ Download CSV</button><button onclick="oarPrint()" style="${btn}">🖨 Print</button></div>
    <div id="oarOut"></div></div>`;
  oarRender();
}
(function () {
  function add() {
    if (document.getElementById('oarBtn')) return true;
    const anchor = document.getElementById('hcPendingsBtn') || document.getElementById('hostchecklistTabBtn'), side = document.getElementById('staffSideBtn');
    if (!anchor || !side) return false;
    const b = document.createElement('button');
    b.className = 'tab-btn tab-btn-sub'; b.id = 'oarBtn'; b.setAttribute('onclick', 'oarOpen()'); b.style.color = '#0e7490';
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="2"/><line x1="7" y1="20" x2="17" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg> Occupancy &amp; AC Report';
    side.parentNode.insertBefore(b, anchor.nextSibling);
    return true;
  }
  function tick() { try { if (!add()) return; const b = document.getElementById('oarBtn'); if (b) b.style.display = (typeof hcTeam === 'function' && hcTeam()) ? '' : 'none'; } catch (e) {} }
  setInterval(tick, 60000); setTimeout(tick, 7000); setTimeout(tick, 16000);
})();
