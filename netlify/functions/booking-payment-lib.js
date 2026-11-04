'use strict';

// booking-payment-lib.js — "pay first, then confirm" for reservations staff create by hand in Rooms (Jorge, 2026-11-04).
//   1. requestPayment(): right after the reservation is saved, the guest gets an email + WhatsApp thanking them and asking
//      them to pay at their folio link (guest-pay.html). The folio is created here with its Room charge if it has none,
//      so the link shows the amount. The booking is remembered in app_store 'booking_payment_pending'.
//   2. confirmIfPaid(): every place a payment lands on a folio (guest-pay / Charge Card, card on file, Booking Detail's
//      Record Payment) calls this; the first payment on a pending booking sends the usual booking confirmation
//      (send-booking-confirmation.js) once, and the booking is marked confirmed.
// A reservation with nothing to pay ($0) skips step 1 and is confirmed straight away, as before.
const crypto = require('crypto');
const { findOrCreateFolioLocked } = require('./folio-lib');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const SITE = process.env.URL || 'https://amansalaportal.com';
const VISITO_API = 'https://platform-api.visitoai.com/m2m/v1';
const WHATSAPP_URL = 'https://wa.me/529848795999';
const PENDING_KEY = 'booking_payment_pending';
const TEMPLATE = 'booking_payment_request';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const hdrs = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
async function sget(key, path) { const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: hdrs(key) }); return r.ok ? r.json() : []; }
function ordinal(n) { const v = n % 100; if (v >= 11 && v <= 13) return n + 'th'; return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'); }
function dateRange(a0, b0) {   // same wording as send-booking-confirmation.js: "from November 4 to 5th"
  const a = new Date(a0 + 'T00:00:00'), b = new Date(b0 + 'T00:00:00');
  const same = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return `from ${MONTHS[a.getMonth()]} ${a.getDate()} to ${same ? ordinal(b.getDate()) : `${MONTHS[b.getMonth()]} ${ordinal(b.getDate())}`}`;
}
const money = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
const itemTotal = i => Number(i.qty) * Number(i.unit_price) * (1 + (Number(i.tax_rate) || 0) / 100);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// the booking, its (first) registration and its room type name; the booking may still be landing (the screen saves first)
async function loadBooking(key, bookingId) {
  for (let i = 0; i < 6; i++) {
    const [bk] = await sget(key, `bookings?id=eq.${encodeURIComponent(bookingId)}&select=id,leader_name,leader_email,leader_phone,start_date,end_date,status,booking_type,room_rate_total,room_rate_nights,blocked_rooms`);
    const regs = bk ? await sget(key, `registrations?booking_id=eq.${encodeURIComponent(bookingId)}&select=id,room,room_type_id,guests,check_in,check_out,custom_rate_override,cancelled&order=created_at`) : [];
    const reg = regs.find(r => !r.cancelled) || null;
    if (bk && reg) {
      const [rt] = reg.room_type_id ? await sget(key, `room_types?id=eq.${encodeURIComponent(reg.room_type_id)}&select=name`) : [];
      return { bk, reg, roomType: (rt && rt.name) || '' };
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  return null;
}

// app_store 'booking_payment_pending' = { bookingId: {requestedAt, folioId, confirmedAt?} }, compare-and-swap
async function updatePending(key, fn) {
  for (let i = 0; i < 6; i++) {
    const [row] = await sget(key, `app_store?key=eq.${PENDING_KEY}&select=value,updated_at`);
    const next = fn(JSON.parse(JSON.stringify((row && row.value) || {})));
    if (next === null) return false;
    const now = new Date().toISOString();
    const r = row
      ? await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.${PENDING_KEY}&updated_at=eq.${encodeURIComponent(row.updated_at)}`, { method: 'PATCH', headers: { ...hdrs(key), Prefer: 'return=representation' }, body: JSON.stringify({ value: next, updated_at: now }) })
      : await fetch(`${SUPABASE_URL}/rest/v1/app_store`, { method: 'POST', headers: { ...hdrs(key), Prefer: 'return=representation' }, body: JSON.stringify({ key: PENDING_KEY, value: next, updated_at: now }) });
    if (r.ok && (await r.json()).length) return true;
    await new Promise(res => setTimeout(res, 100 + Math.random() * 200));
  }
  return false;
}

async function sendConfirmation(bk, reg, roomType) {
  const g = (reg.guests || []).find(x => x && x.name) || {};
  const name = g.name || bk.leader_name || '';
  const r = await fetch(`${SITE}/.netlify/functions/send-booking-confirmation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: name.split(' ')[0] || '', lastName: name.split(' ').slice(1).join(' '), email: g.email || bk.leader_email || '', phone: g.phone || bk.leader_phone || '',
      checkIn: reg.check_in || bk.start_date, checkOut: reg.check_out || bk.end_date, roomType, bookingId: bk.id }),
  });
  return r.json().catch(() => ({}));
}

// switch: app_store 'booking_payment_flow' = {enabled: true}. Off (or missing) = the old behaviour, confirmation at once
// -- kept off until the WhatsApp template is approved by Meta
async function flowEnabled(key) { const [row] = await sget(key, `app_store?key=eq.booking_payment_flow&select=value`); return !!(row && row.value && row.value.enabled); }

async function requestPayment(key, bookingId, { force = false } = {}) {
  const L = await loadBooking(key, bookingId);
  if (!L) return { error: 'booking not found' };
  const { bk, reg, roomType } = L;
  if (!force && !(await flowEnabled(key))) return { mode: 'confirmed', flow: 'off', results: (await sendConfirmation(bk, reg, roomType)).results || null };
  const g = (reg.guests || []).find(x => x && x.name) || {};
  const name = g.name || bk.leader_name || 'Guest', email = g.email || bk.leader_email || '', phone = g.phone || bk.leader_phone || '';
  const checkIn = reg.check_in || bk.start_date, checkOut = reg.check_out || bk.end_date;
  const nights = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
  const rate = reg.custom_rate_override != null ? Number(reg.custom_rate_override) : (Number(bk.room_rate_total) || 0) / (Number(bk.room_rate_nights) || nights);
  // nothing to pay: confirm right away, as before
  if (!(rate > 0)) return { mode: 'confirmed', results: (await sendConfirmation(bk, reg, roomType)).results || null };
  // the folio, with its Room charge (the same line Booking Detail seeds for a Room Only reservation)
  const lock = await findOrCreateFolioLocked(key, { registrationId: reg.id, guestName: name, token: crypto.randomBytes(12).toString('hex'), reuseSingle: true });
  let folio = lock && lock.folio;
  if (!folio) {
    [folio] = await sget(key, `folios?registration_id=eq.${encodeURIComponent(reg.id)}&select=*&order=created_at&limit=1`);
    if (!folio) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/folios`, { method: 'POST', headers: { ...hdrs(key), Prefer: 'return=representation' }, body: JSON.stringify({ registration_id: reg.id, guest_name: name, name, payment_token: crypto.randomBytes(12).toString('hex'), status: 'open' }) });
      [folio] = r.ok ? await r.json() : [];
    }
  }
  if (!folio) return { error: 'could not open the folio' };
  let items = await sget(key, `folio_items?folio_id=eq.${folio.id}&select=qty,unit_price,tax_rate,category`);
  if (!items.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/folio_items`, { method: 'POST', headers: { ...hdrs(key), Prefer: 'return=minimal' }, body: JSON.stringify({ folio_id: folio.id, description: `Room charge — ${reg.room || 'Room'}`, qty: nights, unit_price: rate, tax_rate: 0, category: 'Room' }) });
    items = await sget(key, `folio_items?folio_id=eq.${folio.id}&select=qty,unit_price,tax_rate,category`);
  }
  const due = items.reduce((s, i) => s + itemTotal(i), 0);
  if (!(due > 0.005)) return { mode: 'confirmed', results: (await sendConfirmation(bk, reg, roomType)).results || null };
  await updatePending(key, m => { m[bk.id] = { requestedAt: new Date().toISOString(), folioId: folio.id, regId: reg.id }; return m; });
  const link = `${SITE.replace(/\/$/, '')}/guest-pay.html?token=${folio.payment_token}&all=1`;
  const first = name.split(/\s+/)[0] || 'there', range = dateRange(checkIn, checkOut), room = roomType || 'room';
  const results = { email: null, whatsapp: null };
  // email
  const resendKey = process.env.RESEND_API_KEY;
  if (email && resendKey) {
    const html = `<p>Hi ${esc(first)},</p>
<p>Thank you for choosing Amansala! We're holding your reservation <strong>${esc(range)}</strong> in a <strong>${esc(room)}</strong> room.</p>
<p>To secure your booking, please complete your payment of <strong>${esc(money(due))}</strong> using the secure link below:</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#2d6a6a;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Pay my reservation</a></p>
<p>As soon as your payment is received, we'll send you your booking confirmation with everything you need to know before your arrival.</p>
<p>If you have any questions, simply reply to this email or <a href="${WHATSAPP_URL}">message us on WhatsApp at +52 1 984 879 5999</a>.</p>
<p>We look forward to welcoming you to Tulum!</p>
<p>Warm regards,<br>The Amansala Team</p>`;
    try {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Amansala <retreats@amansala.com>', to: [email], reply_to: 'amansala.reservations@gmail.com', subject: 'Complete your Amansala reservation', html }) });
      results.email = r.ok ? 'sent' : `failed (${r.status})`;
      if (!r.ok) console.warn('[booking-payment] email', r.status, (await r.text()).slice(0, 200));
    } catch (e) { results.email = 'error: ' + e.message; }
  }
  // WhatsApp
  const m2m = process.env.VISITO_M2M_KEY, channelId = process.env.VISITO_WA_CHANNEL_ID;
  if (phone && m2m && channelId) {
    try {
      const r = await fetch(`${VISITO_API}/whatsapp-templates/${encodeURIComponent(channelId)}/send`, {
        method: 'POST', headers: { Authorization: `Bearer ${m2m}`, 'Content-Type': 'application/json', 'Idempotency-Key': `pay-request-${bk.id}` },
        body: JSON.stringify({ to: phone, template: { name: TEMPLATE, language: { code: 'en_US' }, components: [{ type: 'body', parameters: [
          { type: 'text', text: first }, { type: 'text', text: range }, { type: 'text', text: room }, { type: 'text', text: money(due) }, { type: 'text', text: link },
        ] }] } }),
      });
      const b = await r.json().catch(() => ({}));
      results.whatsapp = (r.ok && b.accepted !== false) ? 'sent' : `failed (${r.status})`;
      if (results.whatsapp !== 'sent') console.warn('[booking-payment] whatsapp', r.status, JSON.stringify(b).slice(0, 200));
    } catch (e) { results.whatsapp = 'error: ' + e.message; }
  }
  console.log('[booking-payment] payment request', bk.id, name, money(due), JSON.stringify(results));
  return { mode: 'payment_requested', amount: due, link, results };
}

// a payment just landed on this folio: the first one on a pending booking sends its confirmation (once)
async function confirmIfPaid(key, { folioId }) {
  if (!key || !folioId) return { skipped: 'no folio' };
  const [row] = await sget(key, `app_store?key=eq.${PENDING_KEY}&select=value`);
  const pending = (row && row.value) || {};
  const [folio] = await sget(key, `folios?id=eq.${encodeURIComponent(folioId)}&select=id,registration_id`);
  if (!folio || !folio.registration_id) return { skipped: 'not a reservation folio' };
  const [reg] = await sget(key, `registrations?id=eq.${encodeURIComponent(folio.registration_id)}&select=booking_id`);
  const bookingId = reg && reg.booking_id, p = bookingId && pending[bookingId];
  if (!p || p.confirmedAt) return { skipped: 'not waiting for a payment' };
  const pays = await sget(key, `folio_items?folio_id=eq.${encodeURIComponent(folioId)}&category=eq.Payment&select=unit_price`);
  if (!pays.some(x => Number(x.unit_price) < 0)) return { skipped: 'no payment yet' };
  // claim it first, so two payments at once do not send two confirmations
  const claimed = await updatePending(key, m => { if (!m[bookingId] || m[bookingId].confirmedAt) return null; m[bookingId].confirmedAt = new Date().toISOString(); return m; });
  if (!claimed) return { skipped: 'already confirmed' };
  const L = await loadBooking(key, bookingId);
  if (!L) return { error: 'booking not found' };
  const out = await sendConfirmation(L.bk, L.reg, L.roomType);
  console.log('[booking-payment] confirmation after payment', bookingId, JSON.stringify(out.results || out));
  return { mode: 'confirmed', results: out.results || null };
}

module.exports = { requestPayment, confirmIfPaid, dateRange };
