// ===== rooms-check.js — admin "Rooms check": who is on Arrivals / Transport / the reservation lists but NOT drawn on the Rooms grid (Darlene 2026-11-12, Reece Vissia) =====
// Loaded as a classic script AFTER venues.js and transport-no-reservation-alert.js; shares global scope. Read-only: nothing is changed or saved.
// The Rooms grid draws (1) portal bookings that have a room in their room list and are not cancelled, and (2) booking-engine / Cloudbeds reservations that have a room and a status of
// paid, in_house, checked_out or confirmed. Anything else can show on Arrivals but not on Rooms. This lists those, with the reason, so a person can be fixed or placed in a room.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const norm = s => String(s || '').toLowerCase().replace(/\|.*$/, '').replace(/\(.*?\)/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const today = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const plus = (d, n) => new Date(new Date(d + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
  const day = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const DRAWN = ['paid', 'in_house', 'checked_out', 'confirmed'];

  async function scan() {
    const t = today(), horizon = plus(t, 45), out = [];
    const bks = (AppData.bookings || []).filter(b => b.status !== 'cancelled' && !(b.flags || []).includes('archived') && b.startDate && b.endDate && String(b.endDate).slice(0, 10) >= t && String(b.startDate).slice(0, 10) <= horizon);
    // 1. portal bookings with no room in the room list (never drawn on Rooms)
    bks.forEach(b => {
      const rooms = (b.blockedRooms || []).filter(Boolean);
      const known = new Set((AppData.roomTypes || []).flatMap(rt => rt.rooms || []).map(String));
      if (!rooms.length) out.push({ who: b.leaderName || b.retreatName || b.id, from: b.startDate, to: b.endDate, why: 'Portal booking with no room in its room list', kind: 'booking' });
      else if (known.size && rooms.every(r => !known.has(String(r)))) out.push({ who: b.leaderName || b.retreatName || b.id, from: b.startDate, to: b.endDate, why: 'Its rooms (' + rooms.join(', ') + ') are not in the room list of the Rooms grid', kind: 'booking' });
    });
    // 2. booking-engine / Cloudbeds reservations the Rooms grid leaves out
    const names = new Set();
    bks.forEach(b => { names.add(norm(b.leaderName)); });
    (AppData.regs || []).forEach(r => (r.guests || []).forEach(g => g && g.name && !g.cancelled && names.add(norm(g.name))));
    try {
      const { data } = await db.from('booking_requests').select('id,first_name,last_name,room,check_in,check_out,status,source').gte('check_out', t).lte('check_in', horizon);
      (data || []).forEach(r => {
        const who = ((r.first_name || '') + ' ' + (r.last_name || '')).trim() || 'Guest';
        if (/cancel|no_show|declined|refund/i.test(r.status || '')) return;
        names.add(norm(who));
        if (!r.room) out.push({ who, from: r.check_in, to: r.check_out, why: 'Reservation (' + (r.source || 'booking engine') + ', ' + (r.status || '?') + ') has no room assigned', kind: 'request' });
        else if (!DRAWN.includes(r.status)) out.push({ who, from: r.check_in, to: r.check_out, why: 'Status "' + (r.status || '?') + '" is not drawn on the Rooms grid (only paid, confirmed, in house, checked out)', kind: 'request', room: r.room });
      });
    } catch (e) { console.warn('[rooms-check] reservations', e.message); }
    // 3. transport / arrivals entries whose guest is on no reservation at all
    try {
      const subs = typeof loadTransport === 'function' ? loadTransport() : [];
      subs.filter(s => s.arrivalDate && s.arrivalDate >= t && s.arrivalDate <= horizon).forEach(s => {
        const nm = ((s.firstName || '') + ' ' + (s.lastName || '')).trim();
        if (!nm || names.has(norm(nm))) return;
        const last = norm(s.lastName); if (last && [...names].some(n => n && n.split(' ').pop() === last && n.split(' ')[0] === norm(s.firstName).split(' ')[0])) return;
        out.push({ who: nm, from: s.arrivalDate, to: s.departureDate || '', why: 'On the Transport / Arrivals list but on no reservation', kind: 'transport' });
      });
    } catch (e) { console.warn('[rooms-check] transport', e.message); }
    return out.sort((a, b) => String(a.from).localeCompare(String(b.from)) || a.who.localeCompare(b.who));
  }

  async function show() {
    let m = document.getElementById('rcheckModal');
    if (!m) { m = document.createElement('div'); m.id = 'rcheckModal'; m.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px'; m.onclick = e => { if (e.target === m) m.remove(); }; document.body.appendChild(m); }
    m.innerHTML = '<div style="background:#fff;border-radius:14px;padding:20px 22px;max-width:760px;width:100%;max-height:85vh;overflow:auto;font-family:Jost,sans-serif"><b>Checking…</b></div>';
    const list = await scan();
    const rows = list.map(x => `<div style="padding:9px 0;border-top:1px solid #eee"><b>${esc(x.who)}</b> <span style="color:#6b7280;font-size:12.5px">${esc(day(x.from))}${x.to ? ' → ' + esc(day(x.to)) : ''}${x.room ? ' · room ' + esc(x.room) : ''}</span><div style="font-size:12.5px;color:#b45309;margin-top:2px">${esc(x.why)}</div></div>`).join('');
    m.innerHTML = `<div style="background:#fff;border-radius:14px;padding:20px 22px;max-width:760px;width:100%;max-height:85vh;overflow:auto;font-family:Jost,sans-serif"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px">Not on the Rooms grid (next 45 days)</b><button onclick="document.getElementById('rcheckModal').remove()" style="border:0;background:none;font-size:22px;cursor:pointer">×</button></div><div style="font-size:12.5px;color:#6b7280;margin:4px 0 8px">${list.length} found. Nothing is changed here; fix each one in Reservations / Venues, or give it a room.</div>${rows || '<div style="padding:16px 0">Everything that is coming is drawn on the Rooms grid.</div>'}</div>`;
  }
  window.roomsCheck = show;

  function chip() {
    if (document.getElementById('rcheckChip')) return;
    if (typeof tnrAdmin === 'function' && !tnrAdmin()) return;
    const b = document.createElement('button'); b.id = 'rcheckChip'; b.textContent = '🔎 Rooms check'; b.onclick = show;
    b.style.cssText = 'position:fixed;right:14px;bottom:268px;z-index:99986;padding:8px 14px;border-radius:99px;border:2px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;font-family:Jost,sans-serif;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12)';
    document.body.appendChild(b);
  }
  setTimeout(chip, 9500); setInterval(chip, 60000);
})();
