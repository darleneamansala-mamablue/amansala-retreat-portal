'use strict';
// transport-paid-lib.js — a visitor (not staying at the hotel) paid the airport transfer Lana sent them
// (visito-transport-create-booking.js, Stripe metadata source 'visito_transport'). Before 2026-11-11 nothing happened after the
// payment: the money reached Stripe and nobody knew a van was needed. Now stripe-webhook calls onTransportPaid:
//   - the ride is put on the Transport screen (marked paid online: it rides in the van but is never charged to a folio)
//   - the guest gets an email "payment received -- please complete your flight details" with the transport form already
//     linked to their ride (the form is only ever sent after the payment)
//   - the team gets an email that a paid ride is waiting
// Paying twice for the same Stripe payment does nothing the second time.
const crypto = require('crypto');
const { sendMail } = require('./mail-lib');
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const SITE = process.env.URL || 'https://amansalaportal.com';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function onTransportPaid(key, pi) {
  const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const m = pi.metadata || {};
  const id = 'tr_pay_' + pi.id;
  const got = await fetch(`${SUPABASE_URL}/rest/v1/transport?id=eq.${encodeURIComponent(id)}&select=id`, { headers: H });
  if (got.ok && (await got.json()).length) return { result: 'already', id };
  const dir = m.direction === 'departure' ? 'departure' : 'arrival', ap = m.airport === 'tulum' ? 'tulum' : 'cancun';
  const name = String(m.clientName || '').trim(), parts = name.split(/\s+/);
  const firstName = parts.shift() || 'Guest', lastName = parts.join(' ');
  const now = new Date().toISOString(), editKey = crypto.randomBytes(12).toString('hex');
  const data = {
    id, firstName, lastName, email: m.email || '', phone: m.phone || '', bookingId: 'individual', isIndividual: true,
    flightNumber: m.flightNumber || '', notes: `Paid online ($${(pi.amount / 100).toFixed(2)} USD, ${m.pax || 1} passenger${String(m.pax) === '1' ? '' : 's'}) — booked with Lana`,
    [dir === 'arrival' ? 'arrivalDate' : 'departureDate']: m.date || '', [dir === 'arrival' ? 'arrivalTime' : 'departureTime']: m.time || '',
    [dir === 'arrival' ? 'arrivalAirport' : 'departureAirport']: ap, [dir === 'arrival' ? 'departureOT' : 'arrivalOT']: true,
    paidOnline: true, paidAmount: pi.amount / 100, stripePaymentIntent: pi.id, pax: Number(m.pax) || 1,
    editKey, submittedAt: now, filledBy: { by: 'lana', at: now }, lastEditBy: { by: 'stripe', at: now },
  };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/transport?on_conflict=id`, { method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ id, booking_id: null, data, submitted_at: now }) });
  if (!r.ok) throw new Error('transport save ' + r.status + ' ' + (await r.text()).slice(0, 150));
  const formUrl = `${SITE}/transport-form.html?tr=${encodeURIComponent(id)}&k=${editKey}`;
  const when = `${dir === 'arrival' ? 'Arrival' : 'Departure'} · ${ap === 'cancun' ? 'Cancún' : 'Tulum'} airport · ${esc(m.date || '')}${m.time ? ' ' + esc(m.time) : ''}`;
  const shell = (title, body) => `<div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f0ea;padding:28px 0"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden"><div style="background:#1a2332;padding:22px;text-align:center;color:#fff;font-size:19px;font-weight:700;letter-spacing:1px">AMANSALA</div><div style="padding:26px 30px;font-size:14.5px;color:#374151;line-height:1.6"><h2 style="font-size:18px;color:#1a2332;margin:0 0 10px">${title}</h2>${body}</div></div></div>`;
  try {
    if (m.email) await sendMail({ to: m.email, subject: 'Transfer paid — please complete your flight details', html: shell('Payment received ✓', `<p>Hi ${esc(firstName)}, thank you — your airport transfer is paid.</p><p style="background:#f0fdf4;border-left:4px solid #16a34a;padding:12px 16px;border-radius:6px">${when}<br>${esc(String(m.pax || 1))} passenger${String(m.pax) === '1' ? '' : 's'} · $${(pi.amount / 100).toFixed(2)} USD paid</p><p>To schedule your driver, please complete your flight details (flight number and time):</p><p style="text-align:center;margin:22px 0"><a href="${formUrl}" style="background:#0e9494;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:700">Complete my flight details</a></p><p style="font-size:12.5px;color:#6b7280">You can also reply on WhatsApp with your flight number and time.</p>`) });
  } catch (e) { console.warn('[transport-paid] guest email failed:', e.message); }
  try {
    await sendMail({ to: 'retreats@amansala.com', subject: `Paid airport transfer — ${name || 'guest'} (${m.date || ''})`, html: shell('Paid transfer (booked with Lana)', `<p><b>${esc(name)}</b>${m.email ? ' · ' + esc(m.email) : ''}${m.phone ? ' · ' + esc(m.phone) : ''}</p><p>${when}<br>${esc(String(m.pax || 1))} passenger(s) · $${(pi.amount / 100).toFixed(2)} USD paid online (Stripe ${esc(pi.id)})${m.flightNumber ? '<br>Flight ' + esc(m.flightNumber) : ''}</p><p>It is on the Transport screen, marked paid online (not charged to any folio). The guest was asked to complete the flight details.</p>`) });
  } catch (e) { console.warn('[transport-paid] staff email failed:', e.message); }
  return { result: 'created', id };
}
module.exports = { onTransportPaid };
