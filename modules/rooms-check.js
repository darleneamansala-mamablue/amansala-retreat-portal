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
    // 1b. a guest registered in a room that the booking does not hold (the Rooms grid draws a booking's room list, not the guest list), and guests with no room at all
    const inList = (list, room) => typeof roomListIncludes === 'function' ? roomListIncludes(list, room) : (list || []).map(String).includes(String(room));
    (AppData.regs || []).forEach(r => {
      if (r.cancelled) return;
      const b = bks.find(x => x.id === r.bookingId); if (!b) return;
      const gs = (r.guests || []).filter(g => g && g.name && !g.cancelled); if (!gs.length) return;
      const who = gs.map(g => g.name).join(' & ') + (b.leaderName ? ' (' + (b.retreatName || b.leaderName) + ')' : '');
      if (!r.room) out.push({ who, from: r.checkIn || b.startDate, to: r.checkOut || b.endDate, why: 'Guest is registered but has no room', kind: 'reg' });
      else if (!inList(b.blockedRooms, r.room)) out.push({ who, from: r.checkIn || b.startDate, to: r.checkOut || b.endDate, why: 'Registered in room ' + r.room + ' but the booking does not hold that room, so Rooms does not draw it', kind: 'reg', room: r.room });
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
    m.innerHTML = `<div style="background:#fff;border-radius:14px;padding:20px 22px;max-width:760px;width:100%;max-height:85vh;overflow:auto;font-family:Jost,sans-serif"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px">Not on the Rooms grid (next 45 days)</b><button onclick="document.getElementById('rcheckModal').remove()" style="border:0;background:none;font-size:22px;cursor:pointer">×</button></div><div style="font-size:12.5px;color:#6b7280;margin:4px 0 8px">${list.length} found. Nothing is changed here; fix each one in Reservations / Venues, or give it a room.</div><input id="rcheckQ" placeholder="Find a guest by name (e.g. Reece)" oninput="clearTimeout(window._rcq);window._rcq=setTimeout(()=>roomsCheckFind(this.value),300)" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid #bfdbfe;border-radius:9px;font:inherit;margin-bottom:6px"><div id="rcheckFound"></div>${rows || '<div style="padding:16px 0">Everything that is coming is drawn on the Rooms grid.</div>'}</div>`;
  }
  // Find a guest: everything the portal has about a name (booking, room registration, booking-engine reservation, transport) and whether the Rooms grid draws it
  async function find(q) {
    const n = norm(q), out = [];
    if (n.length < 3) return '<div style="padding:8px 0;color:#6b7280">Type at least 3 letters.</div>';
    const has = s => norm(s).includes(n);
    (AppData.bookings || []).forEach(b => {
      if (has(b.leaderName) || has(b.retreatName)) out.push(`Booking <b>${esc(b.leaderName || b.retreatName)}</b>${b.retreatName && b.retreatName !== b.leaderName ? ' (' + esc(b.retreatName) + ')' : ''} · ${esc(day(String(b.startDate).slice(0, 10)))} → ${esc(day(String(b.endDate).slice(0, 10)))} · status ${esc(b.status || '?')} · type ${esc(b.bookingType || 'group')} · rooms held: ${esc((b.blockedRooms || []).join(', ') || 'NONE')}`);
    });
    (AppData.regs || []).forEach(r => (r.guests || []).forEach(g => {
      if (!g || !has(g.name)) return;
      const b = (AppData.bookings || []).find(x => x.id === r.bookingId);
      const held = b && r.room && (typeof roomListIncludes === 'function' ? roomListIncludes(b.blockedRooms, r.room) : (b.blockedRooms || []).includes(r.room));
      out.push(`Room registration <b>${esc(g.name)}</b> · room ${esc(r.room || 'NONE')} · ${b ? esc(b.retreatName || b.leaderName) + ' · booking status ' + esc(b.status || '?') : 'its booking was not found'}${g.cancelled || r.cancelled ? ' · CANCELLED' : ''} · ${r.room ? (held ? 'room is held by the booking' : 'booking does NOT hold this room') : 'no room'}`);
    }));
    try {
      const { data } = await db.from('booking_requests').select('first_name,last_name,room,check_in,check_out,status,source').gte('check_out', plus(today(), -60));
      (data || []).forEach(r => { const nm = ((r.first_name || '') + ' ' + (r.last_name || '')).trim(); if (has(nm)) out.push(`Booking-engine / Cloudbeds reservation <b>${esc(nm)}</b> · room ${esc(r.room || 'NONE')} · ${esc(day(r.check_in))} → ${esc(day(r.check_out))} · status ${esc(r.status || '?')} · ${esc(r.source || '')} · ${r.room && DRAWN.includes(r.status) ? 'drawn on Rooms' : 'NOT drawn on Rooms'}`); });
    } catch (e) {}
    try {
      (typeof loadTransport === 'function' ? loadTransport() : []).forEach(s => { const nm = ((s.firstName || '') + ' ' + (s.lastName || '')).trim(); if (has(nm)) out.push(`Transport / Arrivals <b>${esc(nm)}</b> · arrives ${esc(s.arrivalDate || '?')}${s.bookingId ? ' · linked to a booking' : ' · not linked to a booking'}`); });
    } catch (e) {}
    return out.length ? out.map(x => `<div style="padding:7px 0;border-top:1px solid #eee;font-size:13px">${x}</div>`).join('') : '<div style="padding:8px 0;color:#b45309">Nothing found with that name anywhere in the portal.</div>';
  }
  window.roomsCheckFind = async q => { const el = document.getElementById('rcheckFound'); if (el) el.innerHTML = await find(q); };
  window.roomsCheck = show;

  function chip() {
    if (document.getElementById('rcheckChip')) return;
    if (typeof tnrAdmin === 'function' && !tnrAdmin()) return;
    const b = document.createElement('button'); b.id = 'rcheckChip'; b.textContent = '🔎 Rooms check'; b.onclick = show;
    b.style.cssText = 'position:fixed;right:14px;bottom:330px;z-index:99992;padding:8px 14px;border-radius:99px;border:2px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;font-family:Jost,sans-serif;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12)';
    document.body.appendChild(b);
  }
  // also a button in the Rooms grid toolbar (next to the "show N days" list), where it is easy to find
  function toolbarBtn() {
    const sel = document.getElementById('rcShowSel');
    if (!sel || document.getElementById('rcheckBtn')) return;
    if (typeof tnrAdmin === 'function' && !tnrAdmin()) return;
    const b = document.createElement('button'); b.id = 'rcheckBtn'; b.type = 'button'; b.textContent = '🔎 Rooms check'; b.onclick = show;
    b.style.cssText = 'margin-left:8px;padding:6px 12px;border-radius:8px;border:1.5px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;font-family:Jost,sans-serif;font-size:12.5px;font-weight:700;cursor:pointer';
    sel.insertAdjacentElement('afterend', b);
  }
  setTimeout(chip, 9500); setInterval(chip, 60000);
  setTimeout(toolbarBtn, 3000); setInterval(toolbarBtn, 5000);
})();
