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
    const { bk, cfg } = found;
    const rec = await L.appStoreGet(key, 'rbhouse:' + pi.id);
    if (!rec) throw new Error('house booking details not found for this payment');

    // Mark the rooms taken; if one was taken by another paid order in the meantime, say so (nothing is lost; staff resolve it)
    const all = (await L.appStoreGet(key, H.HOUSE_ROOMS_KEY)) || {};
    const mine = all[bookingId] || {};
    const conflicts = rec.rooms.filter((r) => mine[r.id] && mine[r.id].piId !== pi.id);
    rec.rooms.forEach((r) => { if (!mine[r.id]) mine[r.id] = { piId: pi.id, at: new Date().toISOString() }; });
    all[bookingId] = mine;
    await L.appStoreSet(key, H.HOUSE_ROOMS_KEY, all);

    const paidNow = pi.amount / 100;
    const isDeposit = m.rbPlan === 'deposit' && Number(m.rbBalance) > 0;
    const roomLater = isDeposit ? Math.round(Number(m.rbBalance) * 100) / 100 : 0;
    const roomLabels = rec.rooms.map((r) => `${r.label} (${r.guests})`);
    const order = {
      piId: pi.id, bookingId, at: new Date().toISOString(), type: 'house',
      name: m.rbName, email: m.rbEmail, phone: m.rbPhone, total: rec.total, paidNow, balance: roomLater, balanceDate: isDeposit ? m.rbBalanceDate : null,
      status: conflicts.length ? 'needs_attention' : 'placed', units: roomLabels,
      houseRooms: rec.rooms.map((r) => ({ id: r.id, label: r.label, guests: r.guestList, total: r.total, supplement: r.supplement })),
      recordUrl: L.recordUrl(pi.id),
    };
    if (conflicts.length) order.conflict = `Already sold to another booking: ${conflicts.map((r) => r.label).join(', ')}`;
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
        id: 'bal_' + Date.now().toString(36), piId: pi.id, bookingId, retreat: `${cfg.title || bk.retreat_name || bk.leader_name} - Casa Master`,
        customerId: typeof pi.customer === 'string' ? pi.customer : (pi.customer && pi.customer.id) || '',
        paymentMethodId: typeof pi.payment_method === 'string' ? pi.payment_method : (pi.payment_method && pi.payment_method.id) || '',
        amount: roomLater, dueDate: m.rbBalanceDate, status: 'scheduled', tries: 0,
        name: m.rbName, email: m.rbEmail, phone: m.rbPhone, units: roomLabels, rowAmounts: {},
        consent: 'Guest authorized the balance to be charged to the card used at booking', createdAt: new Date().toISOString(),
      });
      await L.appStoreSet(key, L.BAL_KEY, sched);
    }

    const title = cfg.title || bk.retreat_name || bk.leader_name || 'the retreat';
    const dates = `${bk.start_date} – ${bk.end_date}`;
    const rows = rec.rooms.map(roomHtml).join('');
    const guestHtml = `<div style="font-family:Arial,sans-serif;color:#1f2b27;max-width:600px">
      <h2 style="font-weight:400">Thank you for your booking</h2>
      <p>Hi ${esc((m.rbName || '').split(' ')[0])}, your payment of <b>${money(paidNow)}</b>${isDeposit ? ' (50% of your rooms)' : ''} was received and your Casa Master rooms for <b>${esc(title)}</b> (${esc(dates)}) are reserved.</p>
      <table style="width:100%;border-collapse:collapse">${rows}<tr><td style="padding:10px 0;border-top:2px solid #1f2b27;font-weight:700">Total for ${rec.guests} guest${rec.guests > 1 ? 's' : ''} · ${rec.rooms.length} room${rec.rooms.length > 1 ? 's' : ''}</td><td style="padding:10px 0;border-top:2px solid #1f2b27;text-align:right;font-weight:700">${money(rec.total)}</td></tr><tr><td style="padding:2px 0">Paid today</td><td style="text-align:right">${money(paidNow)}</td></tr></table>
      ${isDeposit ? `<p><b>Remaining balance: ${money(roomLater)}.</b> As you authorized, it will be charged automatically to the same card on <b>${esc(m.rbBalanceDate)}</b>. We will email you when it is charged.</p>` : ''}
      ${(cfg.includes || []).length ? `<p style="margin-bottom:4px"><b>What's included</b></p><ul style="margin-top:0">${cfg.includes.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>${cfg.notIncluded ? `<p style="font-size:13px">${esc(cfg.notIncluded)}</p>` : ''}` : ''}
      <p><a href="${L.recordUrl(pi.id)}" style="color:#3f5147;font-weight:700">Download your booking record (PDF)</a>: every room, guest and price, the cancellation policy and everything you agreed to.</p>
      <p>Questions? Reply to this email or write to retreats@amansala.com.</p><p>Amansala · Tulum</p></div>`;
    await sendEmail(m.rbEmail, `Thank you for your booking — ${title} · Casa Master`, guestHtml, 'retreats@amansala.com');

    const staffTo = cfg.notifyEmail || 'retreats@amansala.com';
    const staffHtml = `<div style="font-family:Arial,sans-serif;color:#1f2b27;max-width:640px"><h3>${conflicts.length ? '⚠ Casa Master booking — a room was already sold, needs attention' : 'New Casa Master booking'}</h3>
      <p><b>${esc(m.rbName)}</b> · ${esc(m.rbEmail)} · ${esc(m.rbPhone)}<br>${esc(title)} · ${esc(dates)}</p>
      ${conflicts.length ? `<p><b>Already sold to another booking:</b> ${conflicts.map((r) => esc(r.label)).join(', ')}. Please place or refund by hand.</p>` : ''}
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <p>${isDeposit ? 'Paid now ' + money(paidNow) + ' (50%). Balance ' + money(roomLater) + ' auto-charges ' + esc(m.rbBalanceDate) + '.' : 'Total ' + money(rec.total) + ' paid'} · Stripe ${esc(pi.id)} · <a href="${L.recordUrl(pi.id)}">Booking record</a></p>
      <p><b>Please place these guests in the room list / Cloudbeds</b> (Casa Master rooms are not separate units in the portal yet).</p></div>`;
    await sendEmail(staffTo, `${conflicts.length ? 'ACTION NEEDED: ' : ''}New Casa Master booking — ${m.rbName} · ${title}`, staffHtml);
    return { ok: true, placed: !conflicts.length };
  } catch (err) {
    console.error('[rb-fulfil-house] failed after payment', pi.id, err.message);
    orders[pi.id] = { piId: pi.id, bookingId, type: 'house', status: 'error', error: String(err.message).slice(0, 300), name: m.rbName, email: m.rbEmail, at: new Date().toISOString() };
    try { await L.appStoreSet(key, L.ORDERS_KEY, orders); } catch (e) { /* ignore */ }
    await sendEmail('retreats@amansala.com', `ACTION NEEDED: Casa Master booking paid but not recorded — ${m.rbName || ''}`,
      `<p>A Casa Master booking payment succeeded but could not be fully recorded.</p><p><b>${esc(m.rbName)}</b> · ${esc(m.rbEmail)} · ${esc(m.rbPhone)}<br>Retreat booking id: ${esc(bookingId)}<br>Stripe payment: ${esc(pi.id)}<br>Total: ${esc(m.rbTotal)}<br>Rooms: ${esc(m.rbRooms)}<br>Error: ${esc(err.message)}</p>`);
    return { error: true };
  }
}

module.exports = { fulfil };
