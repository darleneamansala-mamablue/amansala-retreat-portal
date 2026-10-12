'use strict';
// Runs after a Retreat Booking card payment succeeds (called from stripe-webhook.js for source=retreat_booking).
// 1. Idempotent: a PaymentIntent is only ever fulfilled once.
// 2. Puts the guest(s) into free rooms/beds of the retreat's room block, so they show in Teacher Reg's room list where staff can
//    move them around like any other guest. King bed = one room holding both guests; Double/Triple = one bed per guest.
// 3. Records spa pre-bookings as requests for the spa team (app_store retreat_spa_requests) and emails guest + staff.
// If no room is free any more (two guests paid at once for the last one) the order is marked needs_attention and staff is
// emailed with everything needed to refund or place the guest by hand. Nothing is lost.
const L = require('./rb-lib');

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function baseOf(unit) { return String(unit).replace(/\s*-?\s*[a-z]$/i, ''); }

// Choose n free units, preferring beds of one room
function pickUnits(free, n) {
  if (free.length < n) return null;
  if (n === 1) return [free[0]];
  const groups = {};
  free.forEach((u) => { (groups[baseOf(u)] = groups[baseOf(u)] || []).push(u); });
  const best = Object.values(groups).filter((g) => g.length >= n).sort((a, b) => a.length - b.length)[0];
  return best ? best.slice(0, n) : free.slice(0, n);
}

async function sendEmail(to, subject, html, replyTo) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Amansala <retreats@amansala.com>', to: Array.isArray(to) ? to : [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
  } catch (e) { console.warn('[rb-fulfil] email failed', e.message); }
}

async function fulfil(pi) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const m = pi.metadata || {};
  const bookingId = m.rbBookingId;
  if (!key || !bookingId) return { skipped: true };

  const orders = (await L.appStoreGet(key, L.ORDERS_KEY)) || {};
  if (orders[pi.id]) return { duplicate: true };
  // Claim this PaymentIntent first so a retry or a second delivery can never place the guest twice
  orders[pi.id] = { piId: pi.id, bookingId, status: 'processing', at: new Date().toISOString() };
  await L.appStoreSet(key, L.ORDERS_KEY, orders);
  try {

  const found = await L.loadRetreat(key, bookingId);
  if (!found || !found.cfg) { console.error('[rb-fulfil] retreat/config missing for', bookingId); return { error: 'no retreat' }; }
  const { bk, cfg } = found;
  const room = JSON.parse(m.rbRoom || '{}');
  const others = JSON.parse(m.rbOthers || '[]');
  const svc = JSON.parse(m.rbSvc || '[]');
  const rm = (cfg.rooms || []).find((r) => r.rtId === room.rtId);
  const nights = L.nightsOf(bk);
  const cart = { room: { rtId: room.rtId, mode: room.mode, beds: room.beds }, services: svc.map(([id, mm, q]) => ({ id, m: mm, q })) };
  const priced = L.priceCart(cfg, nights, cart);
  const roomLine = priced.lines.find((l) => l.type === 'room');
  const guests = [{ name: m.rbName, email: m.rbEmail, phone: m.rbPhone, notes: '' }].concat(others.map((n) => ({ name: n, email: '', phone: '', notes: '' })));
  const agreed = (m.rbAck || '').includes('roommate') ? 'cancellation policy and single-bed roommate terms' : 'cancellation policy';

  const av = await L.availability(key, bk, cfg);
  const freeAll = (av[room.rtId] || { free: [] }).free;
  const isLeader = (m.rbAck || '').includes('leader=1');
  const freeChica = freeAll.filter(L.isChica), freeGrande = freeAll.filter(L.isGrande);
  const needUnits = rm && rm.kind === 'twin' ? guests.length : 1;
  // Leaders: Chica first; if Chica is out of this room type, Grande (and the guest + staff are told). Everyone else: Grande
  // rooms first so Chica stays free for leaders, then Chica, then anything free.
  let units, property = '';
  if (isLeader) {
    units = pickUnits(freeChica, needUnits);
    if (units) property = 'Chica';
    else { units = pickUnits(freeGrande, needUnits) || pickUnits(freeAll, needUnits); if (units) property = 'Grande'; }
  } else {
    units = pickUnits(freeGrande, needUnits) || pickUnits(freeChica, needUnits) || pickUnits(freeAll, needUnits);
  }
  const leaderAtGrande = isLeader && property === 'Grande';

  const note = `Booked online ${new Date().toISOString().slice(0, 10)}${isLeader ? ' · LEADER (' + (property || 'no room') + ')' : ''} · agreed to ${agreed} · Stripe ${pi.id}`;

  const order = { piId: pi.id, bookingId, at: new Date().toISOString(), name: m.rbName, email: m.rbEmail, phone: m.rbPhone, total: priced.total, units: units || [], status: units ? 'placed' : 'needs_attention' };

  if (units) {
    const perRow = Math.round((roomLine.amount / units.length) * 100) / 100;
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const rowGuests = rm.kind === 'twin' ? [guests[i]] : guests;     // king: both guests in the one room
      const existing = await L.sget(key, `registrations?booking_id=eq.${encodeURIComponent(bookingId)}&room=eq.${encodeURIComponent(unit)}&select=id,notes,amount_paid`);
      const rowNote = (existing[0] && existing[0].notes ? existing[0].notes + ' — ' : '') + note;
      const patch = { guests: rowGuests, amount_paid: perRow + (Number(existing[0] && existing[0].amount_paid) || 0), notes: rowNote, room_type_id: room.rtId };
      if (existing[0]) await L.sreq(key, 'PATCH', `registrations?id=eq.${existing[0].id}`, patch, 'return=minimal');
      else await L.sreq(key, 'POST', 'registrations', { booking_id: bookingId, room: unit, is_teacher_room: false, ...patch }, 'return=minimal');
    }
  }

  const svcLines = priced.lines.filter((l) => l.type === 'service');
  if (svcLines.length) {
    const list = (await L.appStoreGet(key, L.SPA_KEY)) || [];
    list.push({ id: 'rs_' + Date.now().toString(36), piId: pi.id, bookingId, retreat: cfg.title || bk.retreat_name || bk.leader_name, name: m.rbName, email: m.rbEmail, phone: m.rbPhone, status: 'requested', createdAt: new Date().toISOString(), items: svcLines.map((l) => ({ name: l.name, minutes: l.minutes, qty: l.qty, price: l.amount })) });
    await L.appStoreSet(key, L.SPA_KEY, list);
  }

  orders[pi.id] = order;
  await L.appStoreSet(key, L.ORDERS_KEY, orders);

  const title = cfg.title || bk.retreat_name || bk.leader_name || 'the retreat';
  const dates = `${bk.start_date} – ${bk.end_date}`;
  const itemRows = priced.lines.map((l) => `<tr><td style="padding:6px 0">${esc(l.name)}${l.type === 'service' ? ` (${l.minutes === 60 ? '1 hour' : l.minutes + ' min'}${l.qty > 1 ? ' × ' + l.qty : ''})` : l.guests > 1 ? ` (${l.guests} guests)` : ''}</td><td style="padding:6px 0;text-align:right">${money(l.amount)}</td></tr>`).join('');
  const guestHtml = `<div style="font-family:Arial,sans-serif;color:#1f2b27;max-width:560px">
    <h2 style="font-weight:400">Thank you for your booking</h2>
    <p>Hi ${esc((m.rbName || '').split(' ')[0])}, your payment of <b>${money(priced.total)}</b> was received and your place at <b>${esc(title)}</b> (${esc(dates)}) is ${units ? 'confirmed' : 'received. Our team will confirm your room shortly'}.</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #ddd;border-bottom:1px solid #ddd">${itemRows}<tr><td style="padding:8px 0;font-weight:700">Total paid</td><td style="padding:8px 0;text-align:right;font-weight:700">${money(priced.total)}</td></tr></table>
    ${isLeader && units ? `<p><b>Your room as a leader:</b> ${leaderAtGrande ? 'Amansala Chica is out of ' + esc(roomLine.name) + ' rooms, so your room will be at <b>Amansala Grande</b>.' : 'your room will be at <b>Amansala Chica</b>.'}</p>` : ''}
    ${svcLines.length ? '<p>Our spa team will contact you to schedule your treatments.</p>' : ''}
    <p>Questions? Reply to this email or write to retreats@amansala.com.</p><p>Amansala · Tulum</p></div>`;
  await sendEmail(m.rbEmail, `Thank you for your booking — ${title}`, guestHtml, 'retreats@amansala.com');

  const staffTo = cfg.notifyEmail || 'retreats@amansala.com';
  const staffHtml = `<div style="font-family:Arial,sans-serif;color:#1f2b27"><h3>${units ? 'New retreat booking' : '⚠ Paid but NO ROOM FREE — needs attention'}</h3>
    <p><b>${esc(m.rbName)}</b> · ${esc(m.rbEmail)} · ${esc(m.rbPhone)}<br>${esc(title)} · ${esc(dates)}<br>${isLeader ? '<b>Leader</b>' + (leaderAtGrande ? ' placed at GRANDE because Chica was out of ' + esc(roomLine.name) + ' rooms' : ' placed at Chica') + '<br>' : ''}${units ? 'Placed in: ' + esc(units.join(', ')) : 'No free room of this type was left when the payment completed. Place the guest by hand or refund in Stripe.'}</p>
    ${others.length ? `<p>Other guests: ${esc(others.join(', '))}</p>` : ''}
    <table style="border-collapse:collapse">${itemRows}</table><p>Total ${money(priced.total)} · Stripe ${esc(pi.id)}</p>
    ${svcLines.length ? '<p><b>Spa pre-bookings to schedule</b> (saved under retreat spa requests).</p>' : ''}</div>`;
  await sendEmail(staffTo, `${units ? 'New retreat booking' : 'ACTION NEEDED: paid, no room'} — ${m.rbName} · ${title}`, staffHtml);
  return { ok: true, placed: !!units };
  } catch (err) {
    console.error('[rb-fulfil] failed after payment', pi.id, err.message);
    orders[pi.id] = { piId: pi.id, bookingId, status: 'error', error: String(err.message).slice(0, 300), name: m.rbName, email: m.rbEmail, at: new Date().toISOString() };
    try { await L.appStoreSet(key, L.ORDERS_KEY, orders); } catch (e) { /* ignore */ }
    await sendEmail('retreats@amansala.com', `ACTION NEEDED: retreat booking paid but not recorded — ${m.rbName || ''}`,
      `<p>A retreat booking payment succeeded but could not be fully recorded.</p><p><b>${esc(m.rbName)}</b> · ${esc(m.rbEmail)} · ${esc(m.rbPhone)}<br>Retreat booking id: ${esc(bookingId)}<br>Stripe payment: ${esc(pi.id)}<br>Total: ${esc(m.rbTotal)}<br>Error: ${esc(err.message)}</p><p>Please place the guest in the room list by hand or refund in Stripe.</p>`);
    return { error: true };
  }
}

module.exports = { fulfil, pickUnits };
