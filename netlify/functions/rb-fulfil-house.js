'use strict';
// Runs after a Casa Master (house) card payment succeeds (stripe-webhook.js, source=retreat_booking_house).
// 1. Idempotent: a PaymentIntent is only fulfilled once.
// 2. Marks each booked bedroom as taken for this retreat (app_store retreat_house_rooms), so it is not offered again.
// 3. Adds the order to the retreat's order list (We Take Payment panel) with every room, guest and price, schedules the balance
//    when the guest paid 50% now, and emails the guest (confirmation + record link) and staff (what to place by hand).
// Staff place the guests in the room list / Cloudbeds by hand: the house rooms are not separate units in the portal.
const L = require('./rb-lib');
const H = require('./rb-house-lib');

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function sendEmail(to, subject, html, replyTo) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Amansala <retreats@amansala.com>', to: Array.isArray(to) ? to : [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
  } catch (e) { console.warn('[rb-fulfil-house] email failed', e.message); }
}

function roomHtml(r) {
  const guests = r.guestList.map((g) => esc(g.name) + (g.type === 'child' ? ` (child, age ${g.age})` : '')).join(', ');
  return `<tr><td style="padding:8px 0;border-top:1px solid #eee"><b>${esc(r.label)}</b><br><span style="font-size:13px;color:#555">${esc(r.beds)}<br>${r.guests} guest${r.guests > 1 ? 's' : ''}: ${guests}<br>${r.nights} nights · ${money(r.nightlyRate)} per night${r.rateLabel === 'sharing' || r.rateLabel === 'sharing the king bed' ? ' per person (sharing)' : ' (private)'}${r.supplement ? ` · individual bed ${money(r.supplement.nightlyRate)} per night = ${money(r.supplement.amount)}` : ''}<br>Room ${money(r.roomSubtotal)} · taxes ${money(r.taxes)} · gratuity ${money(r.gratuity)}${r.teaching ? ' · teaching fee ' + money(r.teaching) : ''}</span></td><td style="padding:8px 0;border-top:1px solid #eee;text-align:right;vertical-align:top"><b>${money(r.total)}</b></td></tr>`;
}

async function fulfil(pi) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const m = pi.metadata || {};
  const bookingId = m.rbBookingId;
  if (!key || !bookingId) return { skipped: true };

  const orders = (await L.appStoreGet(key, L.ORDERS_KEY)) || {};
  if (orders[pi.id]) return { duplicate: true };
  orders[pi.id] = { piId: pi.id, bookingId, status: 'processing', at: new Date().toISOString() };
  await L.appStoreSet(key, L.ORDERS_KEY, orders);
  try {
    const found = await L.loadRetreat(key, bookingId);
    if (!found || !found.cfg) { console.error('[rb-fulfil-house] retreat/config missing for', bookingId); return { error: 'no retreat' }; }
    const { bk } = found;
    const cfg = H.cfgFor(found.cfg, m.rbHouseId || null) || found.cfg;
    const HL = (cfg.house && cfg.house.label) || 'Casa Master';
    const rec = await L.appStoreGet(key, 'rbhouse:' + pi.id);
    if (!rec) throw new Error('house booking details not found for this payment');

    // Mark the rooms taken; if one was taken by another paid order in the meantime, say so (nothing is lost; staff resolve it)
    // perBed rooms (Casita 4's shared rooms): mark only the SPECIFIC beds this order paid for
    // (rec.rooms[i].chosenUnits, set in retreat-booking-house-intent.js) -- any sibling bed in
    // the same room stays open for someone else, instead of marking the whole room as sold.
    const all = (await L.appStoreGet(key, H.HOUSE_ROOMS_KEY)) || {};
    const mine = all[bookingId] || {};
    const soldKeysOf = (r) => (r.chosenUnits && r.chosenUnits.length ? r.chosenUnits : [r.id]);
    const conflicts = rec.rooms.filter((r) => soldKeysOf(r).some((k) => mine[k] && mine[k].piId !== pi.id));
    rec.rooms.forEach((r) => { soldKeysOf(r).forEach((k) => { if (!mine[k]) mine[k] = { piId: pi.id, at: new Date().toISOString() }; }); });
    all[bookingId] = mine;
    await L.appStoreSet(key, H.HOUSE_ROOMS_KEY, all);
    // retreat_house_rooms above is now the permanent "taken" signal for these bedrooms --
    // the temporary hold placed in retreat-booking-house-intent.js has done its job.
    await L.releaseHold(key, m.rbHoldId);

    // Put every guest on the room list: one registration row per real room (unit), exactly like the single-room checkout does.
    const rts = await L.sget(key, 'room_types?select=id,rooms');
    const stayTxt = (rec.dates && rec.dates.custom) ? ` · STAY ${rec.dates.checkIn} to ${rec.dates.checkOut} (retreat ${bk.start_date} to ${bk.end_date}, extra nights include all meals)` : '';
    const typeOf = {}; rts.forEach((t) => (t.rooms || []).forEach((u) => { if (!typeOf[u]) typeOf[u] = t.id; }));
    const placedUnits = [], placeIssues = [];
    const paidTotal = pi.amount / 100, bookerName = String(m.rbName || '').trim().toLowerCase();
    for (const r of rec.rooms) {
      const cr = ((cfg.house && cfg.house.rooms) || []).find((x) => x.id === r.id) || {};
      // perBed rooms: only the specific beds THIS order paid for (chosenUnits), not every bed
      // the room config lists -- otherwise a sibling guest's bed would get overwritten here.
      const units = (Array.isArray(r.chosenUnits) && r.chosenUnits.length) ? r.chosenUnits : (Array.isArray(cr.units) ? cr.units : []);
      if (!units.length) { placeIssues.push(`${r.label}: not linked to a real room, please place the guests by hand`); continue; }
      const gl = r.guestList.map((g) => ({ name: g.name, email: g.name.trim().toLowerCase() === bookerName ? (m.rbEmail || '') : '', phone: g.name.trim().toLowerCase() === bookerName ? (m.rbPhone || '') : '', notes: g.type === 'child' ? `Child, age ${g.age}` : '' }));
      const byUnit = units.map(() => []);
      gl.forEach((g, i) => byUnit[units.length > 1 ? i % units.length : 0].push(g));   // two-bed room: one guest per bed
      const perUnit = Math.round((paidTotal * (r.total / rec.total) / units.length) * 100) / 100;
      for (let k = 0; k < units.length; k++) {
        const unit = units[k];
        const existing = await L.sget(key, `registrations?booking_id=eq.${encodeURIComponent(bookingId)}&room=eq.${encodeURIComponent(unit)}&select=id,notes,amount_paid`);
        const note = `Booked online (${HL}, ${r.label}) ${new Date().toISOString().slice(0, 10)} · booked by ${m.rbName}${r.supplement ? ' · includes the individual bed' : ''}${stayTxt}`;
        const patch = { guests: byUnit[k], amount_paid: perUnit + (Number(existing[0] && existing[0].amount_paid) || 0), notes: (existing[0] && existing[0].notes ? existing[0].notes + ' — ' : '') + note, room_type_id: typeOf[unit] || null };
        if (existing[0]) await L.sreq(key, 'PATCH', `registrations?id=eq.${existing[0].id}`, patch, 'return=minimal');
        else await L.sreq(key, 'POST', 'registrations', { booking_id: bookingId, room: unit, is_teacher_room: false, ...patch }, 'return=minimal');
        placedUnits.push(unit);
        // put the guest name on that room's Cloudbeds reservation so hotel inventory matches the room list
        const ids = bk.cb_reservation_ids || {}, gids = bk.cb_guest_ids || {};
        if (!ids[unit]) { placeIssues.push(`${unit}: no Cloudbeds reservation on file`); continue; }
        if (!byUnit[k].length) continue;
        try {
          const cr2 = await L.cbCall('updateReservationGuest', { reservationId: ids[unit], guestId: gids[unit], roomName: unit, startDate: bk.start_date, endDate: bk.end_date,
            guestFirstName: byUnit[k].map((g) => g.name).join(' & '), guestEmail: byUnit[k][0].email || m.rbEmail || '', guestPhone: byUnit[k][0].phone || m.rbPhone || '',
            groupName: cfg.title || bk.retreat_name || bk.leader_name, leaderName: bk.leader_name, adults: byUnit[k].length, dailyRate: 0, skipRecreateFallback: true }, 22000);
          if (cr2 && (cr2.updated === false || cr2.success === false || cr2.error)) placeIssues.push(`${unit}: Cloudbeds did not accept the guest name (${cr2.error || cr2.message || 'rename refused'})`);
        } catch (e) { placeIssues.push(`${unit}: Cloudbeds update failed (${e.message})`); }
      }
    }

    const paidNow = pi.amount / 100;
    const isDeposit = m.rbPlan === 'deposit' && Number(m.rbBalance) > 0;
    const roomLater = isDeposit ? Math.round(Number(m.rbBalance) * 100) / 100 : 0;
    const roomLabels = rec.rooms.map((r) => `${r.label} (${r.guests})`);
    const order = {
      piId: pi.id, bookingId, at: new Date().toISOString(), type: 'house',
      name: m.rbName, email: m.rbEmail, phone: m.rbPhone, total: rec.total, paidNow, balance: roomLater, balanceDate: isDeposit ? m.rbBalanceDate : null,
      status: (conflicts.length || placeIssues.some((x) => /not linked/.test(x))) ? 'needs_attention' : 'placed', units: placedUnits.length ? placedUnits : roomLabels,
      houseRooms: rec.rooms.map((r) => ({ id: r.id, label: r.label, guests: r.guestList, total: r.total, supplement: r.supplement })),
      recordUrl: L.recordUrl(pi.id), stay: rec.dates || null,
    };
    if (conflicts.length) order.conflict = `Already sold to another booking: ${conflicts.map((r) => r.label).join(', ')}`;
    order.cloudbeds = placeIssues.length ? 'needs_update' : 'updated';
    if (placeIssues.length) order.cloudbedsIssues = placeIssues;
    orders[pi.id] = order;
    await L.appStoreSet(key, L.ORDERS_KEY, orders);

    try {
      const consent = await L.appStoreGet(key, 'rbconsent:' + pi.id);
      if (consent) { consent.status = 'paid'; consent.paidAt = new Date().toISOString(); consent.paidNow = paidNow; consent.units = roomLabels; await L.appStoreSet(key, 'rbconsent:' + pi.id, consent); }
      rec.status = 'paid'; rec.paidAt = new Date().toISOString();
      await L.appStoreSet(key, 'rbhouse:' + pi.id, rec);
    } catch (e) { console.warn('[rb-fulfil-house] record update failed', e.message); }

    if (isDeposit) {
      const sched = (await L.appStoreGet(key, L.BAL_KEY)) || [];
      sched.push({
        id: 'bal_' + Date.now().toString(36), piId: pi.id, bookingId, retreat: `${cfg.title || bk.retreat_name || bk.leader_name} - ${HL}`,
        customerId: typeof pi.customer === 'string' ? pi.customer : (pi.customer && pi.customer.id) || '',
        paymentMethodId: typeof pi.payment_method === 'string' ? pi.payment_method : (pi.payment_method && pi.payment_method.id) || '',
        amount: roomLater, dueDate: m.rbBalanceDate, status: 'scheduled', tries: 0,
        name: m.rbName, email: m.rbEmail, phone: m.rbPhone, units: roomLabels, rowAmounts: {},
        consent: 'Guest authorized the balance to be charged to the card used at booking', createdAt: new Date().toISOString(),
      });
      await L.appStoreSet(key, L.BAL_KEY, sched);
    }

    const stay = rec.dates || { checkIn: bk.start_date, checkOut: bk.end_date, custom: false };
    const title = cfg.title || bk.retreat_name || bk.leader_name || 'the retreat';
    const dates = `${stay.checkIn} – ${stay.checkOut}`;
    const extraNote = stay.custom ? `Stay ${stay.checkIn} to ${stay.checkOut} differs from the retreat (${bk.start_date} to ${bk.end_date}); extra nights include all meals.` : '';
    const rows = rec.rooms.map(roomHtml).join('');
    const guestHtml = `<div style="font-family:Arial,sans-serif;color:#1f2b27;max-width:600px">
      <h2 style="font-weight:400">Thank you for your booking</h2>
      <p>Hi ${esc((m.rbName || '').split(' ')[0])}, your payment of <b>${money(paidNow)}</b>${isDeposit ? ' (50% of your rooms)' : ''} was received and your ${HL} rooms for <b>${esc(title)}</b> (${esc(dates)}) are reserved.</p>
      <table style="width:100%;border-collapse:collapse">${rows}<tr><td style="padding:10px 0;border-top:2px solid #1f2b27;font-weight:700">Total for ${rec.guests} guest${rec.guests > 1 ? 's' : ''} · ${rec.rooms.length} room${rec.rooms.length > 1 ? 's' : ''}</td><td style="padding:10px 0;border-top:2px solid #1f2b27;text-align:right;font-weight:700">${money(rec.total)}</td></tr><tr><td style="padding:2px 0">Paid today</td><td style="text-align:right">${money(paidNow)}</td></tr></table>
      ${isDeposit ? `<p><b>Remaining balance: ${money(roomLater)}.</b> As you authorized, it will be charged automatically to the same card on <b>${esc(m.rbBalanceDate)}</b>. We will email you when it is charged.</p>` : ''}
      ${(cfg.includes || []).length ? `<p style="margin-bottom:4px"><b>What's included</b></p><ul style="margin-top:0">${cfg.includes.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>${cfg.notIncluded ? `<p style="font-size:13px">${esc(cfg.notIncluded)}</p>` : ''}` : ''}
      ${stay.custom ? `<p>Your stay is <b>${esc(stay.checkIn)} to ${esc(stay.checkOut)}</b>. The nights outside the retreat dates include all meals.</p>` : ''}
      <p><a href="${L.recordUrl(pi.id)}" style="color:#3f5147;font-weight:700">Download your booking record (PDF)</a>: every room, guest and price, the cancellation policy and everything you agreed to.</p>
      <p>Questions? Reply to this email or write to retreats@amansala.com.</p><p>Amansala · Tulum</p></div>`;
    await sendEmail(m.rbEmail, `Thank you for your booking — ${title} · ${HL}`, guestHtml, 'retreats@amansala.com');

    const staffTo = cfg.notifyEmail || 'retreats@amansala.com';
    const staffHtml = `<div style="font-family:Arial,sans-serif;color:#1f2b27;max-width:640px"><h3>${conflicts.length ? `⚠ ${HL} booking — a room was already sold, needs attention` : `New ${HL} booking`}</h3>
      <p><b>${esc(m.rbName)}</b> · ${esc(m.rbEmail)} · ${esc(m.rbPhone)}<br>${esc(title)} · ${esc(dates)}</p>
      ${extraNote ? `<p><b>Different dates from the retreat:</b> ${esc(extraNote)} Please add the extra nights in Cloudbeds.</p>` : ''}
      ${conflicts.length ? `<p><b>Already sold to another booking:</b> ${conflicts.map((r) => esc(r.label)).join(', ')}. Please place or refund by hand.</p>` : ''}
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <p>${isDeposit ? 'Paid now ' + money(paidNow) + ' (50%). Balance ' + money(roomLater) + ' auto-charges ' + esc(m.rbBalanceDate) + '.' : 'Total ' + money(rec.total) + ' paid'} · Stripe ${esc(pi.id)} · <a href="${L.recordUrl(pi.id)}">Booking record</a></p>
      <p>${placedUnits.length ? '<b>On the room list now:</b> ' + placedUnits.map(esc).join(', ') + '.' : ''}</p>
      ${placeIssues.length ? '<p><b>Needs a manual look:</b><br>' + placeIssues.map(esc).join('<br>') + '</p>' : ''}</div>`;
    await sendEmail(staffTo, `${conflicts.length ? 'ACTION NEEDED: ' : ''}New ${HL} booking — ${m.rbName} · ${title}`, staffHtml);
    return { ok: true, placed: !conflicts.length };
  } catch (err) {
    console.error('[rb-fulfil-house] failed after payment', pi.id, err.message);
    orders[pi.id] = { piId: pi.id, bookingId, type: 'house', status: 'error', error: String(err.message).slice(0, 300), name: m.rbName, email: m.rbEmail, at: new Date().toISOString() };
    try { await L.appStoreSet(key, L.ORDERS_KEY, orders); } catch (e) { /* ignore */ }
    await L.releaseHold(key, m.rbHoldId); // otherwise it just sits until HOLD_TTL_MIN expires, which is fine too
    await sendEmail('retreats@amansala.com', `ACTION NEEDED: house booking paid but not recorded — ${m.rbName || ''}`,
      `<p>A house booking payment succeeded but could not be fully recorded.</p><p><b>${esc(m.rbName)}</b> · ${esc(m.rbEmail)} · ${esc(m.rbPhone)}<br>Retreat booking id: ${esc(bookingId)}<br>Stripe payment: ${esc(pi.id)}<br>Total: ${esc(m.rbTotal)}<br>Rooms: ${esc(m.rbRooms)}<br>Error: ${esc(err.message)}</p>`);
    return { error: true };
  }
}

module.exports = { fulfil };
