// ===== dashboard-room-only.js — "Room-only guests today" card at the top of the Dashboard (Darlene 2026-10-26) =====
// Counts individual room-only bookings (Cloudbeds / Direct / OTA): in house tonight, arriving today, departing today, plus the next 7 days.
// A booking counts when start <= night < end. Cancelled, archived and not-yet-confirmed ('requested') bookings are left out. Guests = each booking's guest number (pax).
// Display only; nothing is saved. Wraps buildDashboard() and adds one card above its content.
(function () {
  const iso = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
  const rooms = b => (b.blockedRooms || []).length || 1;
  const live = b => b && b.bookingType === 'room_only' && !kind(b) && b.status !== 'cancelled' && b.status !== 'requested' && !(b.flags || []).includes('archived');
  const esc = s => String(s == null ? '' : s).replace(/&amp;/g, '&').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const D = b => [(b.startDate || '').slice(0, 10), (b.endDate || '').slice(0, 10)];
  function stats(ds) {
    const inh = [], arr = [], dep = [];
    (AppData.bookings || []).filter(live).forEach(b => {
      const [s, e] = D(b); if (!s || !e) return;
      if (s <= ds && ds < e) inh.push(b);
      if (s === ds) arr.push(b);
      if (e === ds) dep.push(b);
    });
    const g = a => a.reduce((n, b) => n + (Number(b.pax) || 0), 0), r = a => a.reduce((n, b) => n + rooms(b), 0);
    return { inh, arr, dep, gIn: g(inh), gArr: g(arr), gDep: g(dep), rIn: r(inh), rArr: r(arr), rDep: r(dep) };
  }
  // BBC / RNR (incl. WeTravel) groups: in house today or arriving in the next 14 days. Guests = pax, else registered guests; "?" when neither is known yet.
  const kind = b => { const t = (b.retreatName || '') + ' ' + (b.leaderName || ''); return /\bBBC\b|bikini\s*boot/i.test(t) ? 'BBC' : (/\bRNR\b|restore\s*(&|and)?\s*renew/i.test(t) ? 'RNR' : ''); };
  // Every guest registered on the booking (WeTravel guests arrive with the room not yet assigned, so do not filter by room)
  const regGuests = b => (AppData.regs || []).filter(r => r.bookingId === b.id).reduce((n, r) => n + new Set((r.guests || []).filter(g => g && g.name).map(g => g.name.trim().toLowerCase())).size, 0);
  function groups(todayIso, endIso) {
    const m = {};
    (AppData.bookings || []).forEach(b => {
      const k = kind(b); if (!k || b.status === 'cancelled' || b.status === 'requested' || (b.flags || []).includes('archived')) return;
      const [s, e] = D(b); if (!s || !e || e < todayIso || s > endIso) return;
      const key = k + s + e, x = m[key] = m[key] || { k, s, e, n: 0, r: 0, res: 0, wt: false, now: s <= todayIso && todayIso < e };
      let n = Number(b.pax) || 0; if (!n) n = regGuests(b);
      x.n += n; x.r += rooms(b); x.res++; (x.ids = x.ids || []).push(b.id); x.wt = x.wt || b.source === 'wetravel';
    });
    return Object.values(m).sort((a, c) => a.s.localeCompare(c.s));
  }
  function groupsHtml(todayIso, endIso) {
    const g = groups(todayIso, endIso);
    window._droGroups = g.map(x => x.ids || []);
    const rows = g.length ? g.map((x, gi) => '<div onclick="droGroup(' + gi + ')" title="Click to see the bookings" style="cursor:pointer;display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-top:1px solid #efeae0;font-size:12.5px"><span><b style="color:' + (x.k === 'BBC' ? '#b45309' : '#6d28d9') + '">' + x.k + '</b>' + (x.wt ? ' · WeTravel' : '') + (x.now ? ' <span style="color:#15803d;font-weight:700">in house now</span>' : ' <span style="color:#4b5563">upcoming</span>') + '</span><span style="color:#4b5563;white-space:nowrap">' + x.s.slice(5) + ' → ' + x.e.slice(5) + ' · ' + x.res + ' booking' + (x.res === 1 ? '' : 's') + ' · ' + x.r + ' room' + (x.r === 1 ? '' : 's') + ' · ' + (x.n ? x.n + ' guest' + (x.n === 1 ? '' : 's') : 'guests not entered yet') + '</span></div><div id="droG' + gi + '" style="display:none;margin:0 0 6px;padding:6px 12px;background:#faf8f3;border-radius:8px"></div>').join('')
      : '<div style="font-size:12.5px;color:#4b5563;padding:5px 0;border-top:1px solid #efeae0">No BBC or RNR groups in house or arriving in the next 14 days.</div>';
    return '<div style="margin-top:14px"><div style="font-size:13px;font-weight:800;color:#1f2d2d;margin-bottom:2px">BBC / RNR groups (incl. WeTravel)</div>' + rows + '</div>';
  }
  // Guests really in the house on a night (Darlene 2026-11-05: "82 guests in house" was the groups' contracted headcounts, most of whom are not here): the named guests on the room list whose own stay covers
  // that night (their check-in <= night < their check-out) and who have not already checked out. A booking with no room list yet falls back to its guest count.
  function tonight(b, ds) {
    const regs = (AppData.regs || []).filter(r => r.bookingId === b.id && !r.cancelled);
    if (!regs.length) return Number(b.pax) || 0;
    let n = 0;
    regs.forEach(r => {
      const ci = String(r.checkIn || b.startDate || '').slice(0, 10), co = String(r.checkOut || b.endDate || '').slice(0, 10), out = r.checkedOutAt ? String(r.checkedOutAt).slice(0, 10) : '';
      if (!ci || !co || !(ci <= ds && ds < co) || (out && out <= ds)) return;
      n += new Set((r.guests || []).filter(g => g && g.name && !g.cancelled).map(g => g.name.trim().toLowerCase())).size;
    });
    return n;
  }
  // Everyone in house tonight: room-only guests plus retreat / BBC / RNR / WeTravel groups (start <= night < end; cancelled, archived and unconfirmed 'requested' bookings left out)
  function everyone(ds, roomOnlyGuests) {
    let grp = 0, n = 0;
    (AppData.bookings || []).forEach(b => {
      if (!b || b.status === 'cancelled' || b.status === 'requested' || (b.flags || []).includes('archived')) return;
      if (b.bookingType === 'room_only' && !kind(b)) return;
      const [s, e] = D(b); if (!s || !e || !(s <= ds && ds < e)) return;
      const g = tonight(b, ds);
      grp += g; n++;
    });
    return { grp, n, total: grp + roomOnlyGuests };
  }
  function card() {
    const today = new Date(); today.setHours(12, 0, 0, 0);
    // The day picked in the 7-day strip (Darlene 2026-11-05): the whole card (dark line, tiles, list) follows it, not only the list under the strip
    const selDay = window._droDay || iso(today), isToday = selDay === iso(today), niceDay = new Date(selDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const t = stats(selDay);
    const tile = (n, sub, label, bg, key) => '<div onclick="droShow(\''+key+'\')" title="Click to see who" style="cursor:pointer;flex:1;min-width:130px;background:' + bg + ';border-radius:10px;padding:12px 14px"><div style="font-size:30px;font-weight:800;color:#1f2d2d;line-height:1">' + n + '</div><div style="font-size:12.5px;font-weight:700;color:#1f2d2d;margin-top:4px">' + label + '</div><div style="font-size:11.5px;color:#4b5563">' + sub + '</div></div>';
    const bk = (n, r) => (n === 1 ? '1 booking' : n + ' bookings') + ' · ' + (r === 1 ? '1 room' : r + ' rooms');
    let strip = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const s = stats(iso(d));
      strip += '<div onclick="droPick(\'' + iso(d) + '\')" title="Click to show this day" style="cursor:pointer;flex:1;min-width:58px;text-align:center;padding:6px 2px;border-radius:8px;border:2px solid ' + (iso(d) === selDay ? '#2d6a6a' : 'transparent') + ';background:' + (iso(d) === selDay ? '#e0f2fe' : '#f6f3ec') + '"><div style="font-size:10.5px;font-weight:700;color:#4b5563">' + d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + d.getDate() + '</div><div style="font-size:18px;font-weight:800;color:#1f2d2d">' + s.gIn + '</div></div>';
    }
    const lists = { in: t.inh, arr: t.arr, dep: t.dep };
    window._droTitle = isToday ? { in: 'In house tonight', arr: 'Arriving today', dep: 'Departing today' } : { in: 'In house on ' + niceDay, arr: 'Arriving ' + niceDay, dep: 'Departing ' + niceDay };
    window._droLists = {}; Object.keys(lists).forEach(k => { window._droLists[k] = lists[k].map(b => b.id); });
    const names = '<div id="droPanel" style="display:none;margin-top:10px;padding:10px 12px;background:#faf8f3;border-radius:10px"></div>';
    return '<div id="droCard" style="background:#fff;border-radius:14px;padding:16px 18px;margin-bottom:18px;box-shadow:0 1px 4px rgba(0,0,0,.06)">'
      + '<div style="font-size:15px;font-weight:800;color:#1f2d2d;margin-bottom:10px">🏨 Room-only guests today &amp; BBC / RNR</div>'
      + (function () { const ev = everyone(selDay, t.gIn); return '<div style="background:#1f2d2d;color:#fff;border-radius:10px;padding:10px 14px;margin-bottom:10px;font-size:13.5px"><b style="font-size:20px">' + ev.total + '</b> guests in house ' + (isToday ? 'tonight' : 'on ' + niceDay) + ', everyone <span style="opacity:.85">· ' + t.gIn + ' room-only · ' + ev.grp + ' in ' + ev.n + ' retreat / BBC / RNR group' + (ev.n === 1 ? '' : 's') + ' (guests on each group\'s room list ' + (isToday ? 'for tonight' : 'for that night') + ')</span></div>'; })()
      + '<div style="display:flex;gap:10px;flex-wrap:wrap">' + tile(t.gIn, bk(t.inh.length, t.rIn), 'Room-only guests in house ' + (isToday ? 'tonight' : 'on ' + niceDay), '#dcfce7', 'in') + tile(t.gArr, bk(t.arr.length, t.rArr), 'Room-only guests arriving ' + (isToday ? 'today' : 'on ' + niceDay), '#e0f2fe', 'arr') + tile(t.gDep, bk(t.dep.length, t.rDep), 'Room-only guests departing ' + (isToday ? 'today' : 'on ' + niceDay), '#fef3c7', 'dep') + '</div>'
      + '<div style="font-size:11.5px;font-weight:700;color:#4b5563;margin:12px 0 4px">Guests in house, next 7 days</div><div style="display:flex;gap:6px;flex-wrap:wrap">' + strip + '</div>'
      + names
      + groupsHtml(iso(today), iso(new Date(today.getTime() + 14 * 864e5)))
      + '<div style="font-size:11px;color:#6b7280;margin-top:8px">Individual room-only bookings (Cloudbeds, Direct, OTA). The three room-only tiles and the 7-day strip count room-only bookings only; the dark line on top adds the retreat, BBC, RNR and WeTravel groups. Requested (unconfirmed) bookings are not counted.</div></div>';
  }
  // Room type, room and nightly rate for a booking, worked out the same way as the Reservations tab (custom rate if set, else the room type's rate for that many guests)
  function stayInfo(b) {
    try {
      const reg = (AppData.regs || []).find(r => r.bookingId === b.id), room = (reg && reg.room) || (b.blockedRooms || [])[0] || '';
      const rt = (AppData.roomTypes || []).find(t => (t.rooms || []).includes(room));
      const [s, e] = D(b), ci = (reg && reg.checkIn) || s, co = (reg && reg.checkOut) || e;
      const gc = reg ? Math.max(1, (reg.guests || []).filter(g => g && g.name && !g.cancelled).length) : (Number(b.pax) || 1);
      const nights = Math.max(1, Math.round((Date.parse(co + 'T12:00:00') - Date.parse(ci + 'T12:00:00')) / 864e5));
      let rate = reg && reg.customRateOverride != null ? Number(reg.customRateOverride) : (rt && typeof getRoomRate === 'function' ? getRoomRate(rt, gc, ci, nights) : null);
      if (rate != null && isNaN(rate)) rate = null;
      return { type: rt ? rt.name : '', room, rate };
    } catch (x) { return { type: '', room: '', rate: null }; }
  }
  const stayLine = b => { const i = stayInfo(b); const bits = [i.type, i.room ? 'Room ' + i.room : '', i.rate != null ? '$' + Number(i.rate).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' / night' : ''].filter(Boolean); return bits.join(' · '); };
  // Notes on a booking for the quick view: staff-only internal notes first, then the booking / guest notes (birthdays, celebrations, dietary...)
  function notesOf(b) {
    const regs = (AppData.regs || []).filter(r => r.bookingId === b.id), out = [], seen = new Set();
    const add = (label, t) => { t = String(t || '').replace(/\s+/g, ' ').trim(); if (!t || seen.has(t.toLowerCase())) return; seen.add(t.toLowerCase()); out.push({ label, text: t.length > 220 ? t.slice(0, 220) + '…' : t }); };
    const SIG = /—\s*[^—\n]+,\s*[A-Z][a-z]{2}\s+\d{1,2}\s*$/;
    regs.forEach(r => add('Internal', r.internalNotes && !SIG.test(String(r.internalNotes).trim()) ? String(r.internalNotes).trim() + ' (writer not recorded)' : r.internalNotes));
    if (!out.length) out.push({ label: 'Internal', text: 'No internal notes', none: true });
    regs.forEach(r => { add('Note', r.notes); (r.guests || []).forEach(g => g && add('Guest note', g.notes)); });
    add('Booking note', b.notes);
    return out;
  }
  const notesHtml = b => notesOf(b).map(n => '<div style="margin-top:2px;font-size:12px;color:' + (n.none ? '#4b5563' : '#7c2d12') + '"><b>📝 ' + n.label + ':</b> ' + esc(n.text) + '</div>').join('');
  // Click a tile: list the guests behind the number; click a guest to open their booking (Darlene 2026-11-02: "we need to be able to see who the one guest is or click into it")
  window.droPick = function (ds) { window._droDay = ds === iso(new Date()) ? null : ds; try { paint(); } catch (e) {} };
  window.droShow = function (key) {
    const box = document.getElementById('droPanel'); if (!box) return;
    if (box.dataset.k === key && box.style.display !== 'none') { box.style.display = 'none'; return; }
    box.dataset.k = key; box.style.display = 'block';
    const rowsFor = ids => {
    return ids.map(id => (AppData.bookings || []).find(b => b.id === id)).filter(Boolean).sort((a, b) => (a.leaderName || '').localeCompare(b.leaderName || '')).map(b => {
      const reg = (AppData.regs || []).find(r => r.bookingId === b.id), gn = reg && (reg.guests || []).find(g => g && g.name), nm = (gn && gn.name) || b.leaderName || b.retreatName || 'Guest';
      const [s, e] = D(b), label = esc(nm) + (gn && b.leaderName && b.leaderName !== nm ? ' <span style="color:#6b7280">(' + esc(b.leaderName) + ')</span>' : '');
      const click = ' onclick="droSummary(\'' + String(b.id).replace(/'/g, '') + '\')" style="cursor:pointer;color:#2d6a6a;font-weight:700;text-decoration:underline"';
      const sl = stayLine(b); return '<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-top:1px solid #efeae0;font-size:12.5px"><span><span' + click + '>' + label + '</span>' + (sl ? '<div style="color:#4b5563;font-size:12px;margin-top:1px">' + esc(sl) + '</div>' : '') + notesHtml(b) + '</span><span style="color:#4b5563;white-space:nowrap">' + s.slice(5) + ' → ' + e.slice(5) + ' · ' + (Number(b.pax) || 0) + ' guest' + ((Number(b.pax) || 0) === 1 ? '' : 's') + ' · ' + (rooms(b) === 1 ? '1 room' : rooms(b) + ' rooms') + '</span></div>';
    }).join('');
    };
    const section = (title, ids) => '<div style="font-size:12.5px;font-weight:800;color:#1f2d2d;margin:8px 0 4px">' + title + ' (' + ids.length + ')</div>' + (ids.length ? rowsFor(ids) : '<div style="font-size:12.5px;color:#4b5563">Nobody.</div>');
    if (key.slice(0, 4) === 'day:') {   // a day of the next-7-days strip: who arrives, who leaves, who is staying (room-only: Cloudbeds / Direct / OTA)
      const ds = key.slice(4), st = stats(ds), arrIds = st.arr.map(b => b.id), depIds = st.dep.map(b => b.id);
      const stay = st.inh.map(b => b.id).filter(id => !arrIds.includes(id));
      const nice = (() => { try { return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }); } catch (e) { return ds; } })();
      box.innerHTML = '<div style="font-size:13.5px;font-weight:800;color:#1f2d2d">' + nice + '</div>' + section('Arriving', arrIds) + section('Departing', depIds) + section('Already in house', stay);
      return;
    }
    const ids = (window._droLists || {})[key] || [], title = (window._droTitle || { in: 'In house tonight', arr: 'Arriving today', dep: 'Departing today' })[key];
    box.innerHTML = '<div style="font-size:12.5px;font-weight:800;color:#1f2d2d;margin-bottom:4px">' + title + '</div>' + (ids.length ? rowsFor(ids) : '<div style="font-size:12.5px;color:#4b5563">Nobody.</div>');
  };
  // Click a guest: a short summary of the booking, with a button for the full booking / folio (Darlene 2026-11-02: "a summary of the bookings when we click it")
  window.droSummary = function (id) {
    const b = (AppData.bookings || []).find(x => x.id === id); if (!b) return;
    const regs = (AppData.regs || []).filter(r => r.bookingId === id), [s, e] = D(b);
    const nights = Math.max(0, Math.round((Date.parse(e + 'T12:00:00') - Date.parse(s + 'T12:00:00')) / 864e5));
    const fmt = ds => { try { return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); } catch (x) { return ds; } };
    const guests = [...new Set(regs.flatMap(r => (r.guests || []).map(g => g && g.name && g.name.trim()).filter(Boolean)))];
    const roomList = (b.blockedRooms || []).join(', ') || [...new Set(regs.map(r => r.room).filter(Boolean))].join(', ') || '—';
    const paid = regs.reduce((n, r) => n + (Number(r.amountPaid) || 0), 0);
    const row = (k, v) => v ? '<div style="display:flex;gap:10px;padding:5px 0;border-top:1px solid #efeae0;font-size:13px"><span style="min-width:110px;color:#4b5563;font-weight:700">' + k + '</span><span style="flex:1">' + v + '</span></div>' : '';
    const reg = regs[0], nm = (guests[0]) || b.leaderName || 'Guest';
    let m = document.getElementById('droSumModal');
    if (!m) { m = document.createElement('div'); m.id = 'droSumModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99996;display:flex;align-items:center;justify-content:center;padding:16px'; m.onclick = ev => { if (ev.target === m) m.style.display = 'none'; }; document.body.appendChild(m); }
    m.style.display = 'flex';
    m.innerHTML = '<div style="background:#f5f1eb;border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow:auto;padding:20px 24px;box-shadow:0 12px 40px rgba(0,0,0,.3);font-family:Jost,sans-serif;color:#2d2520">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-family:\'Cormorant Garamond\',serif;font-size:24px;font-weight:700">' + esc(b.leaderName || b.retreatName || nm) + '</div><button onclick="document.getElementById(\'droSumModal\').style.display=\'none\'" style="border:none;background:none;font-size:22px;cursor:pointer;color:#4b5563">✕</button></div>'
      + '<div style="background:#fff;border-radius:12px;padding:4px 14px">'
      + row('Status', esc(String(b.status || '').replace(/_/g, ' ')))
      + row('Stay', fmt(s) + ' → ' + fmt(e) + ' · ' + nights + ' night' + (nights === 1 ? '' : 's'))
      + row('Room', esc(stayLine(b) || roomList))
      + row('Guests', (Number(b.pax) || guests.length || 0) + (guests.length ? ' · ' + esc(guests.join(', ')) : ''))
      + row('Email', esc(b.leaderEmail || ''))
      + row('Phone', esc(b.leaderPhone || ''))
      + row('Meal plan', esc(b.mealPlan || ''))
      + row('Paid so far', paid ? '$' + paid.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '')
      + row('Notes', notesOf(b).map(x => '<b>' + x.label + ':</b> ' + esc(x.text)).join('<br>'))
      + '</div>'
      + (reg ? '<button onclick="document.getElementById(\'droSumModal\').style.display=\'none\';openBookingDetailForReg(\'' + String(reg.id).replace(/'/g, '') + '\',' + JSON.stringify(nm).replace(/"/g, '&quot;') + ')" style="margin-top:12px;padding:8px 16px;border:none;border-radius:8px;background:#2d6a6a;color:#fff;font-weight:700;cursor:pointer;font-family:inherit">Open full booking</button>' : '')
      + '</div>';
  };
  // Click a BBC / RNR / WeTravel row: the bookings inside it, each opening the summary (Darlene 2026-11-02: "we would like a We Travel ...")
  window.droGroup = function (i) {
    const box = document.getElementById('droG' + i); if (!box) return;
    if (box.style.display !== 'none') { box.style.display = 'none'; return; }
    box.style.display = 'block';
    const rows = ((window._droGroups || [])[i] || []).map(id => (AppData.bookings || []).find(b => b.id === id)).filter(Boolean).map(b => {
      const regs = (AppData.regs || []).filter(r => r.bookingId === b.id), names = [...new Set(regs.flatMap(r => (r.guests || []).map(g => g && g.name && g.name.trim()).filter(Boolean)))];
      const sl = stayLine(b), [bs, be] = D(b);
      return '<div style="padding:5px 0;border-top:1px solid #efeae0;font-size:12.5px"><span onclick="event.stopPropagation();droSummary(\'' + String(b.id).replace(/'/g, '') + '\')" style="cursor:pointer;color:#2d6a6a;font-weight:700;text-decoration:underline">' + esc(b.leaderName || b.retreatName || 'Guest') + '</span> <span style="color:#4b5563">' + bs.slice(5) + ' → ' + be.slice(5) + (names.length ? ' · ' + esc(names.join(', ')) : ' · guests not entered yet') + '</span>' + (sl ? '<div style="color:#4b5563;font-size:12px">' + esc(sl) + '</div>' : '') + notesHtml(b) + '</div>';
    }).join('');
    box.innerHTML = rows || '<div style="font-size:12.5px;color:#4b5563">No bookings.</div>';
    box.onclick = ev => ev.stopPropagation();
  };
  function paint() {
    try {
      const el = document.getElementById('dbContent'); if (!el) return;
      const old = document.getElementById('droCard'); if (old) old.remove();
      el.insertAdjacentHTML('afterbegin', card());
      try { window.droShow('arr'); } catch (e) {}   // arrivals open by default so the notes are seen without a click (Darlene 2026-11-02)
    } catch (e) { console.warn('[dashboard-room-only]', e); }
  }
  const orig = window.buildDashboard;
  if (typeof orig === 'function') window.buildDashboard = function () { const r = orig.apply(this, arguments); paint(); return r; };
})();
