// ===== dashboard-arrivals-today.js — "Arriving today" on the Dashboard shows the same people as the Daily Briefing (Darlene 2026-11-05) =====
// Loaded as a classic script AFTER dashboard-room-only.js and daily-briefing.js; shares global scope. The Room-only card said "Arriving today: Nobody" while the Daily Briefing listed an Extra Night
// booking and five airport arrivals for the De La Sol Retreat. This adds one block to that card with exactly the briefing's information: every booking that starts today (retreats, extra nights,
// room-only) and every airport arrival on today's Transport list, with the retreat name, the driver, and a ticked box once the guest is checked in. Display only; nothing is saved.
(function () {
  if (typeof buildDashboard !== 'function') return;
  const esc = s => String(s == null ? '' : s).replace(/&amp;/g, '&').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const todayIso = () => window._droDay || new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);   // follows the day picked in the 7-day strip
  const tm = t => { if (!t) return ''; const [h, m] = String(t).split(':').map(Number); return ((h % 12) || 12) + ':' + String(m || 0).padStart(2, '0') + (h >= 12 ? ' pm' : ' am'); };
  function block() {
    const d = todayIso();
    const bks = (AppData.bookings || []).filter(b => b.status !== 'cancelled' && !(b.flags || []).includes('archived') && String(b.startDate || '').slice(0, 10) === d);
    let subs = []; try { subs = typeof loadTransport === 'function' ? loadTransport().filter(s => s.arrivalDate === d).sort((a, b) => String(a.arrivalTime).localeCompare(String(b.arrivalTime))) : []; } catch (e) {}
    const tick = on => typeof dbTick === 'function' ? dbTick(on) : (on ? '✓ ' : '');
    const here = s => typeof dbSubArrived === 'function' ? dbSubArrived(s) : false;
    const retreat = s => { const b = (AppData.bookings || []).find(x => x.id === s.bookingId); const n = b && (b.retreatName || b.leaderName); return n ? ' <span style="color:#0f766e;font-weight:600">· ' + esc(n) + '</span>' : ''; };
    const rows = bks.map(b => `<div style="padding:5px 0;border-top:1px solid #efeae0;font-size:13px"><b>${esc(b.leaderName || b.retreatName)}</b>${b.retreatName && b.retreatName !== b.leaderName ? ' <span style="color:#0f766e;font-weight:600">(' + esc(b.retreatName) + ')</span>' : ''} · ${b.pax || '?'} guest${Number(b.pax) === 1 ? '' : 's'} · ${(b.blockedRooms || []).length || 1} room${((b.blockedRooms || []).length || 1) === 1 ? '' : 's'} <span style="color:#6b7280">(booking starts that day)</span></div>`).join('')
      + subs.map(s => { const h = here(s), nm = ((s.firstName || '') + ' ' + (s.lastName || '')).trim() || 'Guest'; return `<div style="padding:5px 0;border-top:1px solid #efeae0;font-size:13px">${tick(h)}<b>${tm(s.arrivalTime) || 'time TBD'}</b> · ${esc(nm)}${retreat(s)} · airport arrival <b style="color:${h ? '#166534' : '#92400e'}">${h ? 'Arrived' : 'Pending to arrive'}</b></div>`; }).join('');
    return `<div id="droToday" style="margin-top:14px"><div style="font-size:13px;font-weight:800;color:#1f2d2d;margin-bottom:2px">Arriving ${window._droDay ? 'on ' + new Date(window._droDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'today'} <span style="font-weight:500;color:#6b7280">· the same list as the Daily Briefing</span></div>${rows || '<div style="font-size:12.5px;color:#4b5563;padding:5px 0;border-top:1px solid #efeae0">Nobody arriving that day.</div>'}</div>`;
  }
  const addBlock = () => { try { const p = document.getElementById('droPanel'); const old = document.getElementById('droToday'); if (old) old.remove(); if (p) p.insertAdjacentHTML('afterend', block()); } catch (e) { console.warn('[dashboard arrivals today]', e); } };
  if (typeof window.droPick === 'function') { const pick = window.droPick; window.droPick = function () { const r = pick.apply(this, arguments); addBlock(); return r; }; }
  const orig = window.buildDashboard;
  window.buildDashboard = function () {
    const r = orig.apply(this, arguments);
    try { const p = document.getElementById('droPanel'); if (p && !document.getElementById('droToday')) p.insertAdjacentHTML('afterend', block()); } catch (e) { console.warn('[dashboard arrivals today]', e); }
    return r;
  };
})();
