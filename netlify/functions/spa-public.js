'use strict';

// spa-public.js — everything the public spa booking page (spa-booking.html, /spa) needs, on the server (security plan
// phase 3, 2026-11-02). The page used to read the whole spa_appointments list (every client's name, email, phone), every
// registration and booking (every hotel guest), and the staff schedules with the public key, then post folio charges,
// save appointments and send emails from the browser. Now:
//   GET  ?action=catalog         the catalog alone (spa-landing.html)
//   GET  ?action=init            catalog without staff contact/pay, busy times without names, schedules, rotation, blocks
//   GET  ?action=guest&g=        a personal link from Lana (guest-link-lib): that guest's name, room, email, phone, stay
//   GET  ?action=appt&id=        one appointment for its confirmation / cancel link (no contact details)
//   POST {action:'lookup', name, room}      the stay window of a hotel guest ({start,end} or {})
//   POST {action:'book', ...}               re-checks the slot, matches the guest, charges the folio at the catalog price
//                                           (hotel) or checks the Stripe payment (offsite), saves, emails
//   POST {action:'cancel', id}              12-hour rule, removes the folio charge (and tip), saves, emails
// The appointment id stays the key of the confirmation / cancel links, as before.
const { findOrCreateFolioLocked } = require('./folio-lib');
const { sendMail } = require('./mail-lib');
const { verifyGuestLink } = require('./guest-link-lib');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const STRIPE_API = 'https://api.stripe.com/v1';
const SITE = process.env.URL || 'https://amansalaportal.com';

const hdrs = key => ({ apikey: key, Authorization: `Bearer ${key}` });
const cors = () => ({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
const reply = (code, data) => ({ statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const hhmmToMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fmtDateLong = ds => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const fmtT = t => { const [h, m] = t.split(':').map(Number); return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM'); };
// appointment start in Tulum (UTC-5, no DST since 2015)
const apptTime = a => new Date(`${a.date}T${a.start}:00-05:00`).getTime();

async function getKey(key, name) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.${name}&select=value,updated_at`, { headers: hdrs(key) });
  if (!r.ok) throw new Error('read ' + name + ' ' + r.status);
  const [row] = await r.json();
  return row || null;
}
async function getAll(key, path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { ...hdrs(key), Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(path.split('?')[0] + ' ' + r.status);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
// Saves ONE change to spa_appointments: re-read, apply, write only if nobody saved in between (compare-and-swap on
// updated_at), else redo. fn returns the new list, or {abort: <reason>} to stop without writing.
async function mutateAppts(key, fn) {
  let lastErr = '';
  for (let i = 0; i < 12; i++) {
    const row = await getKey(key, 'spa_appointments');
    const cur = row && Array.isArray(row.value) ? row.value : [];
    const next = fn(cur.slice());
    if (next && next.abort) return next;
    const now = new Date().toISOString();
    if (row) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_appointments&updated_at=eq.${encodeURIComponent(row.updated_at)}`, {
        method: 'PATCH', headers: { ...hdrs(key), 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ value: next, updated_at: now }),
      });
      if (r.ok && (await r.json()).length) return { list: next };
      lastErr = 'busy ' + r.status;
    } else {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store`, { method: 'POST', headers: { ...hdrs(key), 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ key: 'spa_appointments', value: next, updated_at: now }) });
      if (r.ok) return { list: next };
      lastErr = 'insert ' + r.status;
    }
    await new Promise(res => setTimeout(res, 80 + Math.random() * 220));
  }
  throw new Error('Could not save the appointment: ' + lastErr);
}

function spaGroupPrice(s, n) {
  if (!s.groupPricing || !n || n < 1) return null;
  const gp = s.groupPricing;
  if (gp.belowMin && gp.belowMin[n] != null) return gp.belowMin[n];
  if (gp.flatFee != null) return gp.flatFee + Math.max(0, n - (gp.flatFeeMax || 0)) * (gp.perPersonUSD || 0);
  if (n >= gp.minGroup) return gp.perPersonUSD * n;
  return null;
}
// what the page may see of the catalog: no therapist email, phone, notes or pay rates
function publicSpaData(sd) {
  return {
    services: (sd.services || []).map(s => { const { costs, compensation, compensationType, compensationValue, compensationCurrency, internalNotes, ...rest } = s; return rest; }),   // costs = what a service costs Amansala
    rooms: (sd.rooms || []).map(r => ({ id: r.id, name: r.name, location: r.location })),
    therapists: (sd.therapists || []).map(t => ({
      id: t.id, firstName: t.firstName, lastName: t.lastName, gender: t.gender, active: t.active, defaultRoomId: t.defaultRoomId,
      photoDataUrl: t.photoDataUrl, bio: t.bio, maxServicesPerDay: t.maxServicesPerDay, breakMinutes: t.breakMinutes,
      primaryCategory: t.primaryCategory, sortOrder: t.sortOrder, services: (t.services || []).map(x => ({ serviceId: x.serviceId })),
    })),
  };
}
const BUSY_KEYS = ['date', 'start', 'duration', 'status', 'therapistId', 'roomId', 'rotationGroup', 'rotationName'];
const busyView = a => { const o = {}; BUSY_KEYS.forEach(k => { if (a[k] !== undefined) o[k] = a[k]; }); return o; };
// the appointment as its own confirmation / cancel page shows it
const apptView = a => ({
  id: a.id, serviceId: a.serviceId, therapistId: a.therapistId, roomId: a.roomId, roomNumber: a.roomNumber, date: a.date, start: a.start,
  duration: a.duration, status: a.status, cancelledAt: a.cancelledAt || null, guestType: a.guestType, tipAmount: a.tipAmount || 0,
  groupTotalPriceUSD: a.groupTotalPriceUSD || null, guestCount: a.guestCount || null, folioStatus: a.folioStatus, therapistPreference: a.therapistPreference || null,
});

// ---- hotel guest matching (same rules as the page and visito-spa-create-booking.js) ----
function findGuestReg(regs, clientName, roomNumber) {
  const key = norm(clientName), rn = norm(roomNumber);
  if (!key) return null;
  let fallback = null;
  for (const reg of regs) {
    const g = (reg.guests || []).find(x => norm(x.name) === key);
    if (!g) continue;
    if (rn && norm(reg.room) === rn) return { reg, guest: g };
    if (!fallback) fallback = { reg, guest: g };
  }
  return fallback;
}
function findGuestBooking(bookings, clientName, roomNumber) {
  const key = norm(clientName), rn = norm(roomNumber);
  if (!key) return null;
  let fallback = null;
  for (const bk of bookings) {
    if (bk.booking_type !== 'room_only' || norm(bk.leader_name) !== key) continue;
    if (rn && (bk.blocked_rooms || []).map(norm).includes(rn)) return { bk };
    if (!fallback) fallback = { bk };
  }
  return fallback;
}
// bookings that cover `onDate` (or, without a date, that have not ended), with their registrations
async function staysAround(key, onDate) {
  const today = new Date().toISOString().slice(0, 10);
  const q = onDate ? `start_date=lte.${onDate}&end_date=gte.${onDate}` : `end_date=gte.${today}`;
  const bookings = await getAll(key, `bookings?${q}&status=neq.cancelled&select=id,leader_name,booking_type,blocked_rooms,charges,start_date,end_date`);
  const ids = bookings.map(b => b.id), regs = [];
  for (let i = 0; i < ids.length; i += 80) {
    regs.push(...await getAll(key, `registrations?booking_id=in.(${ids.slice(i, i + 80).map(encodeURIComponent).join(',')})&select=id,booking_id,room,guests,cancelled`));
  }
  return { bookings, regs: regs.filter(r => !r.cancelled) };
}
function matchStay(stays, clientName, room) {
  const rm = findGuestReg(stays.regs, clientName, room);
  if (rm) return { reg: rm.reg, guest: rm.guest, bk: stays.bookings.find(b => b.id === rm.reg.booking_id) || null };
  const bm = findGuestBooking(stays.bookings, clientName, room);
  return bm ? { reg: null, guest: null, bk: bm.bk } : null;
}

// ---- emails (moved from the page) ----
function emailShell(headline, bodyHtml) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f0ea;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0ea;padding:32px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <tr><td style="background:#2d6a6a;padding:28px 36px;text-align:center">
    <div style="font-size:11px;letter-spacing:.15em;color:#a7d7d7;text-transform:uppercase;margin-bottom:6px">Amansala Eco-Chic Resort + Retreat</div>
    <div style="font-size:22px;font-weight:700;color:#fff">${headline}</div>
  </td></tr>
  <tr><td style="padding:32px 36px">${bodyHtml}</td></tr>
  <tr><td style="background:#f5f0ea;padding:20px 36px;text-align:center;border-top:1px solid #e8e3dc">
    <p style="font-size:12px;color:#9ca3af;margin:0">Amansala Eco-Chic Resort · Tulum, México · retreats@amansala.com</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
const row = (label, value) => `<tr><td style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:13px;color:#6b7280;width:130px;vertical-align:top">${label}</td><td style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:14px;color:#1a2332;font-weight:500">${value}</td></tr>`;
// where to meet (same rule as sbfMeet in modules/spa-booking-flow.js)
function meet(sd, rot, a) {
  const svc = (sd.services || []).find(s => s.id === a.serviceId), ther = (sd.therapists || []).find(t => t.id === a.therapistId);
  if (svc && /tarot/i.test(svc.name || '')) return { where: 'The Restaurant', text: 'Please meet in the Restaurant.' };
  const maria = norm((rot && rot.mariaName) || 'Maria Luisa');
  if (ther && (norm(ther.firstName) === maria || norm(`${ther.firstName || ''} ${ther.lastName || ''}`) === maria)) return { where: 'Grande Reception', text: 'Please meet in the Grande Reception.' };
  return { where: 'The rooftop of Chica', text: 'You can meet your therapist on the rooftop of Chica. Your therapist will come out and look for you on the deck.' };
}
async function mailConfirm(sd, rot, a, svc, firstName, folioPosted) {
  const ther = (sd.therapists || []).find(t => t.id === a.therapistId);
  const therName = ther && (a.therapistPreference || {}).type === 'specific' ? `${ther.firstName} ${ther.lastName || ''}`.trim() : 'Assigned by our team';
  const room = (sd.rooms || []).find(r => r.id === a.roomId), m = meet(sd, rot, a);
  const meetAt = m.where || (room ? (room.location ? `${room.name} — ${room.location}` : room.name) : 'Our spa reception');
  const body = `<p style="font-size:15px;color:#374151;margin:0 0 24px">Hi ${esc(firstName)}, you're booked! Here are your appointment details:</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
        ${row('Service', esc(svc.name))}${row('Date', fmtDateLong(a.date))}${row('Time', fmtT(a.start))}${row('Therapist', esc(therName))}${row('Meet at', esc(meetAt))}
        ${a.roomNumber ? row('Your room', esc(a.roomNumber)) : ''}
        ${folioPosted ? row('Payment', 'Charged to your room folio') : ''}
        ${a.tipAmount > 0 ? row('Tip', `$${a.tipAmount} USD${folioPosted ? ' (added to your room folio)' : ' (please add this when you settle payment)'}`) : ''}
      </table>
      ${m.text ? `<p style="font-size:14.5px;color:#1a2332;font-weight:600;margin:0 0 20px;padding:14px 16px;background:#f0f9f9;border-radius:10px">Where to meet: ${esc(m.text)}</p>` : ''}
      <p style="font-size:13.5px;color:#6b7280;margin:0 0 20px">Need to cancel? You can cancel free of charge up to 12 hours before your appointment using the button below. Need a different time instead? Please contact us directly — our team handles all time changes personally.</p>
      <div style="text-align:center;margin-bottom:8px">
        <a href="${SITE}/spa-booking.html?cancel=${a.id}" style="display:inline-block;background:#b45309;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:.3px">Cancel My Appointment</a>
      </div>
      <div style="text-align:center">
        <a href="${SITE}/spa-booking.html?confirmation=${a.id}" style="display:inline-block;color:#2d6a6a;text-decoration:underline;font-size:13px;font-weight:600">View this confirmation anytime</a>
      </div>`;
  return sendMail({ to: a.email, subject: 'Spa Appointment Confirmed — Amansala', html: emailShell('Your Spa Appointment is Confirmed', body) });
}
async function mailTherapistNew(sd, a, svc) {
  const targets = a.therapistId ? (sd.therapists || []).filter(t => t.id === a.therapistId) : (sd.therapists || []).filter(t => t.active && (t.services || []).some(s => s.serviceId === svc.id));
  await Promise.all(targets.filter(t => t.email).map(t => {
    const body = `<p style="font-size:15px;color:#374151;margin:0 0 24px">Hi ${esc(t.firstName)}, a new appointment ${a.therapistId ? 'was just booked with you' : 'is available to claim'}:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">${row('Client', esc(a.clientName || ''))}${row('Service', esc(svc.name || ''))}${row('Date', fmtDateLong(a.date))}${row('Time', fmtT(a.start))}</table>
        <p style="font-size:13.5px;color:#6b7280;margin:20px 0 0">${a.therapistId ? "It's on your schedule." : 'First to claim it in the admin calendar gets it.'}</p>`;
    return sendMail({ to: t.email, subject: (a.therapistId ? 'New Appointment — ' : 'New Appointment Available — ') + 'Amansala Spa', html: emailShell(a.therapistId ? 'New Appointment Booked' : 'New Appointment Available', body) });
  }));
}
async function mailCancel(sd, a, svc) {
  const ther = a.therapistId ? (sd.therapists || []).find(t => t.id === a.therapistId) : null;
  if (a.email) {
    const body = `<p style="font-size:15px;color:#374151;margin:0 0 24px">Hi ${esc((a.clientName || '').split(' ')[0] || 'there')}, your massage${ther ? ` with ${esc(ther.firstName)}` : ''} at ${fmtT(a.start)} on ${fmtDateLong(a.date)} has been cancelled:</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">${row('Service', esc(svc ? svc.name : ''))}${row('Was scheduled', fmtDateLong(a.date) + ' at ' + fmtT(a.start))}</table>
      ${a.folioStatus === 'REVERSED' ? '<p style="font-size:13.5px;color:#374151;margin:0 0 20px">The charge has been removed from your room folio.</p>' : ''}
      <p style="font-size:13.5px;color:#6b7280;margin:20px 0 0">We hope to welcome you for a treatment another time.</p>`;
    await sendMail({ to: a.email, subject: 'Spa Appointment Cancelled — Amansala', html: emailShell('Spa Appointment Cancelled', body) });
  }
  if (ther && ther.email) {
    const body = `<p style="font-size:15px;color:#374151;margin:0 0 24px">Hi ${esc(ther.firstName)}, a client just cancelled an appointment on your schedule:</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">${row('Client', esc(a.clientName || ''))}${row('Service', esc(svc ? svc.name : ''))}${row('Was scheduled', fmtDateLong(a.date) + ' at ' + fmtT(a.start))}</table>
      <p style="font-size:13.5px;color:#6b7280;margin:20px 0 0">That time is now open on your schedule.</p>`;
    await sendMail({ to: ther.email, subject: 'Appointment Cancelled — Amansala Spa', html: emailShell('A Client Cancelled Their Appointment', body) });
  }
}

// ---- actions ----
async function init(key) {
  const [sd, ap, sc, rot, blk] = await Promise.all(['spa_data', 'spa_appointments', 'staffConfirmAccounts', 'spa_rotation_settings', 'spa_time_blocks'].map(k => getKey(key, k)));
  const today = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
  return {
    spaData: publicSpaData((sd && sd.value) || {}),
    busy: ((ap && ap.value) || []).filter(a => a && a.date >= today).map(busyView),
    staff: ((sc && sc.value) || []).map(a => ({ name: a.name, unavailableDates: a.unavailableDates || [], dayOfWeekRules: a.dayOfWeekRules || [] })),
    rotation: (rot && rot.value) || null,
    blocks: Array.isArray(blk && blk.value) ? blk.value.map(b => ({ therapistId: b.therapistId, date: b.date, start: b.start, end: b.end, allDay: b.allDay })) : [],
  };
}
async function stripeGet(path) {
  const r = await fetch(`${STRIPE_API}/${path}`, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Stripe-Version': '2024-06-20' } });
  return r.json();
}
async function stripeRefund(piId) {
  try {
    const r = await fetch(`${STRIPE_API}/refunds`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' }, body: new URLSearchParams({ payment_intent: piId }).toString() });
    const d = await r.json(); return !d.error;
  } catch (e) { return false; }
}
async function deleteItem(key, id) {
  try { const r = await fetch(`${SUPABASE_URL}/rest/v1/folio_items?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { ...hdrs(key), Prefer: 'return=representation' } }); return r.ok ? (await r.json()).length > 0 : false; } catch (e) { return false; }
}
const overlaps = (a, date, start, dur, therapistId, roomId) => {
  if (!a || a.date !== date || a.status === 'CANCELLED') return false;
  if (a.therapistId !== therapistId && !(roomId && a.roomId === roomId)) return false;
  const s = hhmmToMin(a.start), e = s + (a.duration || 60), my = hhmmToMin(start);
  return my < e && my + dur > s;
};

async function book(key, b) {
  const [sdRow, rotRow] = await Promise.all([getKey(key, 'spa_data'), getKey(key, 'spa_rotation_settings')]);
  const sd = (sdRow && sdRow.value) || {}, rot = (rotRow && rotRow.value) || {};
  const svc = (sd.services || []).find(s => s.id === b.serviceId && s.active);
  if (!svc) return reply(400, { error: 'That service is not available.' });
  const date = String(b.date || ''), start = String(b.start || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start)) return reply(400, { error: 'Please pick a date and time.' });
  if (apptTime({ date, start }) < Date.now() + 2 * 3600e3 - 60e3) return reply(400, { error: "Online bookings need at least 2 hours' notice." });
  const ther = (sd.therapists || []).find(t => t.id === b.therapistId && t.active !== false && (t.services || []).some(s => s.serviceId === svc.id));
  if (!ther) return reply(400, { error: 'That therapist is not available for this service.' });
  const roomId = b.roomId && (sd.rooms || []).some(r => r.id === b.roomId) ? b.roomId : null;
  const firstName = String(b.firstName || '').trim().slice(0, 80), lastName = String(b.lastName || '').trim().slice(0, 80);
  const email = String(b.email || '').trim().slice(0, 200), phone = String(b.phone || '').trim().slice(0, 40);
  if (!firstName || !lastName) return reply(400, { error: 'Please enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: 'Please enter a valid email.' });
  const isHotel = b.guestType === 'hotel';
  const guestCount = svc.groupPricing ? Math.max(1, parseInt(b.guestCount, 10) || svc.groupPricing.minGroup || 1) : null;
  const price = svc.groupPricing ? spaGroupPrice(svc, guestCount) : Number(svc.price);
  if (price == null || !(price >= 0)) return reply(400, { error: "That group size isn't priced yet — please contact us directly." });
  const clientName = `${firstName} ${lastName}`;
  let tip = Math.max(0, Math.min(1000, Number(b.tipAmount) || 0));

  // offsite: the Stripe payment must be a spa-booking payment for this service that no other appointment holds
  let pi = null;
  if (!isHotel) {
    if (!b.paymentIntentId) return reply(400, { error: 'Payment is required.' });
    pi = await stripeGet(`payment_intents/${encodeURIComponent(String(b.paymentIntentId))}`);
    if (!pi || pi.error || pi.status !== 'succeeded' || (pi.metadata || {}).source !== 'spa_booking' || (pi.metadata || {}).serviceId !== svc.id) return reply(400, { error: 'We could not verify your payment.' });
    tip = Math.max(0, Number((pi.metadata || {}).tipAmount) || 0);
  }

  // the slot, before anything is charged
  const cur = await getKey(key, 'spa_appointments');
  const taken = list => (list || []).some(a => overlaps(a, date, start, svc.duration, ther.id, roomId));
  if (pi && ((cur && cur.value) || []).some(a => a && a.paymentIntentId === pi.id && a.status !== 'CANCELLED')) return reply(409, { error: 'This payment is already used for a booking.' });
  if (taken(cur && cur.value)) {
    const refunded = pi ? await stripeRefund(pi.id) : false;
    return reply(200, { conflict: true, refunded });
  }

  // hotel guest: match the stay covering that day
  let match = null;
  if (isHotel) {
    match = matchStay(await staysAround(key), clientName, b.roomNumber);
    if (match && match.bk && match.bk.start_date && match.bk.end_date && (date < match.bk.start_date || date > match.bk.end_date)) return reply(200, { outsideStay: true, start: match.bk.start_date, end: match.bk.end_date });
  }

  const appt = {
    id: 'ap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    clientName, guestType: isHotel ? 'hotel' : 'offsite', sessionType: svc.sessionType || 'individual',
    email, phone: phone || null, roomNumber: String(b.roomNumber || '').trim().slice(0, 20) || null,
    serviceId: svc.id, therapistId: ther.id, roomId, date, start, duration: svc.duration,
    status: 'CONFIRMED', paymentStatus: isHotel ? 'NOT_REQUIRED' : 'PAID', paymentIntentId: pi ? pi.id : null,
    folioStatus: isHotel ? 'PENDING' : 'NOT_REQUIRED',
    therapistPreference: { type: ['specific', 'male', 'female', 'none'].includes(b.prefType) ? b.prefType : 'none', requestedTherapistId: b.prefType === 'specific' ? ther.id : null },
    rotationGroup: ['male', 'female'].includes(b.rotationGroup) ? b.rotationGroup : null, rotationName: b.rotationGroup ? String(b.rotationName || '').slice(0, 40) || null : null,
    cancellationPolicyAcceptedAt: b.policyAcceptedAt ? String(b.policyAcceptedAt).slice(0, 40) : null, cancellationPolicyVersion: b.policyVersion ? String(b.policyVersion).slice(0, 40) : null,
    source: 'guest_booking', guestCount, groupTotalPriceUSD: svc.groupPricing ? price : null,
    notes: svc.groupPricing ? `${guestCount} guests · $${price} USD total` : '', tipAmount: tip, createdAt: new Date().toISOString(),
  };

  // charge the room folio at the catalog price (tip = its own line)
  let folioPosted = false;
  const posted = [];
  const therName = `${ther.firstName} ${ther.lastName || ''}`.trim();
  if (isHotel && match) {
    try {
      if (match.reg) {
        const gName = (match.guest && match.guest.name) || clientName;
        const f = await findOrCreateFolioLocked(key, { registrationId: match.reg.id, guestName: gName, token: Date.now().toString(36) + Math.random().toString(36).slice(2, 12), openOnly: true });
        let folioId = f && f.id;
        if (!folioId) {
          const r = await fetch(`${SUPABASE_URL}/rest/v1/folios?registration_id=eq.${encodeURIComponent(match.reg.id)}&guest_name=eq.${encodeURIComponent(gName)}&status=eq.open&select=id&order=created_at.asc&limit=1`, { headers: hdrs(key) });
          const ex = r.ok ? await r.json() : [];
          folioId = ex[0] && ex[0].id;
          if (!folioId) {
            const cr = await fetch(`${SUPABASE_URL}/rest/v1/folios`, { method: 'POST', headers: { ...hdrs(key), 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ registration_id: match.reg.id, guest_name: gName, name: gName, payment_token: Date.now().toString(36) + Math.random().toString(36).slice(2, 12), status: 'open' }) });
            folioId = cr.ok ? ((await cr.json())[0] || {}).id : null;
          }
        }
        if (folioId) {
          const day = `${date}T17:00:00Z`;
          const items = [{ folio_id: folioId, description: `${therName} - ${svc.name}`, created_at: day, qty: 1, unit_price: Number(price), tax_rate: 13, category: 'Spa' }];
          if (tip > 0) items.push({ folio_id: folioId, description: `${therName} - Tip`, created_at: day, qty: 1, unit_price: tip, tax_rate: 0, category: 'Tip' });
          const ir = await fetch(`${SUPABASE_URL}/rest/v1/folio_items`, { method: 'POST', headers: { ...hdrs(key), 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(items) });
          const saved = ir.ok ? await ir.json() : [];
          if (saved[0]) {
            posted.push(...saved.map(x => x.id));
            Object.assign(appt, { folioStatus: 'POSTED', folioChargeId: saved[0].id, folioTipId: saved[1] ? saved[1].id : null, folioRegId: match.reg.id, folioId });
            folioPosted = true;
          }
        }
      } else if (match.bk) {
        // Room Only guests with no registration row: the charge goes on the booking (as before)
        const chargeId = 'chg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const add = [{ id: chargeId, date, category: 'Spa', description: svc.name, amount: price, guestName: match.bk.leader_name, therapistName: therName, therapistId: ther.id, addedAt: new Date().toISOString(), addedBy: 'Spa Booking (auto)', source: 'spa' }];
        if (tip > 0) add.push({ id: chargeId + 't', date, category: 'Tip', description: 'Tip for ' + therName, amount: tip, guestName: match.bk.leader_name, therapistName: therName, therapistId: ther.id, addedAt: new Date().toISOString(), addedBy: 'Spa Booking (auto)', source: 'spa' });
        const pr = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(match.bk.id)}`, { method: 'PATCH', headers: { ...hdrs(key), 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ charges: [...(match.bk.charges || []), ...add] }) });
        if (pr.ok) { Object.assign(appt, { folioStatus: 'POSTED', folioChargeId: chargeId, folioBkId: match.bk.id }); folioPosted = true; }
      }
    } catch (e) { console.warn('[spa-public] folio charge failed:', e.message); }
  }

  // save, re-checking the slot against the list as it is right now
  const res = await mutateAppts(key, list => taken(list) ? { abort: 'taken' } : (list.some(a => a.id === appt.id) ? list : [...list, appt]));
  if (res.abort) {
    for (const id of posted) await deleteItem(key, id);
    const refunded = pi ? await stripeRefund(pi.id) : false;
    return reply(200, { conflict: true, refunded });
  }
  try { await mailConfirm(sd, rot, appt, svc, firstName, folioPosted); await mailTherapistNew(sd, appt, svc); } catch (e) { console.warn('[spa-public] email failed:', e.message); }
  return reply(200, { ok: true, appt: apptView(appt), folioPosted, email });
}

async function cancel(key, id) {
  const cur = await getKey(key, 'spa_appointments');
  const a = ((cur && cur.value) || []).find(x => x && x.id === id);
  if (!a) return reply(404, { reason: 'not_found' });
  if (a.status === 'CANCELLED') return reply(200, { reason: 'already' });
  if ((apptTime(a) - Date.now()) / 3600e3 < 12) return reply(200, { reason: 'too_late' });
  let reversed = false;
  if (a.folioStatus === 'POSTED' && a.folioChargeId) {
    if (await deleteItem(key, a.folioChargeId)) reversed = true;
    if (a.folioTipId) await deleteItem(key, a.folioTipId);
    else if (a.folioId && Number(a.tipAmount) > 0) {
      // bookings from before the tip id was kept: the tip line on the same folio and day
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/folio_items?folio_id=eq.${encodeURIComponent(a.folioId)}&category=eq.Tip&select=id,unit_price,created_at`, { headers: hdrs(key) });
        const tips = r.ok ? await r.json() : [];
        const t = tips.find(x => Number(x.unit_price) === Number(a.tipAmount) && String(x.created_at || '').slice(0, 10) === a.date);
        if (t) await deleteItem(key, t.id);
      } catch (e) {}
    }
    for (const [table, col] of [['registrations', a.folioRegId], ['bookings', a.folioBkId]]) {
      if (!col || reversed && table === 'registrations') continue;
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(col)}&select=charges`, { headers: hdrs(key) });
        const [rowv] = r.ok ? await r.json() : [];
        if (rowv && Array.isArray(rowv.charges)) {
          const next = rowv.charges.filter(c => c.id !== a.folioChargeId && c.id !== a.folioChargeId + 't');
          if (next.length !== rowv.charges.length) {
            const pr = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(col)}`, { method: 'PATCH', headers: { ...hdrs(key), 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ charges: next }) });
            if (pr.ok) reversed = true;
          }
        }
      } catch (e) {}
    }
  }
  let done = null;
  await mutateAppts(key, list => list.map(x => {
    if (x.id !== id) return x;
    done = { ...x, status: 'CANCELLED', cancelledAt: new Date().toISOString(), folioStatus: x.folioStatus === 'POSTED' ? 'REVERSED' : x.folioStatus };
    return done;
  }));
  const sdRow = await getKey(key, 'spa_data');
  const sd = (sdRow && sdRow.value) || {};
  try { await mailCancel(sd, done || a, (sd.services || []).find(s => s.id === a.serviceId)); } catch (e) {}
  return reply(200, { ok: true, folioReversed: reversed && (done || {}).folioStatus === 'REVERSED' });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  try {
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};
      if (q.action === 'init') return reply(200, await init(key));
      if (q.action === 'catalog') { const sd = await getKey(key, 'spa_data'); return reply(200, { spaData: publicSpaData((sd && sd.value) || {}) }); }   // spa-landing.html
      if (q.action === 'guest') {
        const c = verifyGuestLink(q.g);
        if (!c) return reply(200, {});
        const [reg] = await (await fetch(`${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(c.r)}&select=room,guests,booking_id,cancelled,check_in,check_out`, { headers: hdrs(key) })).json();
        if (!reg || reg.cancelled || !reg.room) return reply(200, {});
        const [bk] = await (await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(reg.booking_id)}&select=start_date,end_date,status`, { headers: hdrs(key) })).json();
        const g = (reg.guests || []).find(x => x && !x.cancelled && norm(x.name) === norm(c.n));
        if (!g || !bk || bk.status === 'cancelled') return reply(200, {});
        return reply(200, { name: g.name, room: reg.room, email: g.email || '', phone: g.phone || '', start: reg.check_in || bk.start_date, end: reg.check_out || bk.end_date });
      }
      if (q.action === 'appt') {
        const cur = await getKey(key, 'spa_appointments');
        const a = ((cur && cur.value) || []).find(x => x && x.id === String(q.id || ''));
        return a ? reply(200, { appt: apptView(a) }) : reply(404, { error: 'not found' });
      }
      return reply(400, { error: 'Unknown action' });
    }
    if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
    let b;
    try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
    if (b.action === 'lookup') {
      const m = matchStay(await staysAround(key), String(b.name || ''), String(b.room || ''));
      return reply(200, m && m.bk && m.bk.start_date && m.bk.end_date ? { start: m.bk.start_date, end: m.bk.end_date } : {});
    }
    if (b.action === 'book') return await book(key, b);
    if (b.action === 'cancel') return await cancel(key, String(b.id || ''));
    return reply(400, { error: 'Unknown action' });
  } catch (e) {
    console.error('[spa-public]', e);
    return reply(500, { error: 'Something went wrong — please try again.' });
  }
};

module.exports._test = { publicSpaData, busyView, apptView, matchStay, spaGroupPrice };
