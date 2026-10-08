'use strict';

// Verifies a PaymentIntent directly against Stripe's API (server-side, using the
// secret key) before recording a payment on a folio -- same pattern as
// confirm-booking-payment.js, sidesteps needing STRIPE_WEBHOOK_SECRET (not
// configured) while never trusting a client's bare claim that a payment
// succeeded. Records the payment as a negative-priced folio_items row, the
// same representation every other folio payment (Cash/Zelle/etc.) already
// uses, so existing balance/Rate-and-Folios logic picks it up automatically.
// Used by both guest-pay.html (guest self-pay) and the admin "Charge Card" flow.
const { sendPaymentNotification } = require('./notify-payment');
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const STRIPE_API = 'https://api.stripe.com/v1';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!stripeKey) return jsonErr(500, 'Stripe not configured');
  if (!supaKey) return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { paymentIntentId, folioId } = body;
  if (!paymentIntentId || !folioId) return jsonErr(400, 'Missing paymentIntentId or folioId');

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json' };

  // Verify directly with Stripe -- never trust the client's claim alone.
  let pi;
  try {
    const piRes = await fetch(`${STRIPE_API}/payment_intents/${encodeURIComponent(paymentIntentId)}`, {
      headers: { Authorization: `Bearer ${stripeKey}`, 'Stripe-Version': '2024-06-20' },
    });
    pi = await piRes.json();
    if (pi.error) return jsonErr(400, pi.error.message ?? 'Stripe error');
  } catch (err) {
    return jsonErr(500, 'Could not verify payment with Stripe');
  }

  if (pi.status !== 'succeeded') return jsonErr(400, `Payment not completed (status: ${pi.status})`);
  if ((pi.metadata || {}).folioId !== folioId) return jsonErr(400, 'Payment does not match this folio');

  try {
    // Idempotency: skip if a folio_items row already references this PaymentIntent
    // (embedded in the description, same loose-matching style confirm-booking-payment.js
    // uses for stripePaymentIntentId -- folio_items has no dedicated column for it).
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/folio_items?folio_id=eq.${encodeURIComponent(folioId)}&description=ilike.*${encodeURIComponent(paymentIntentId)}*&select=id`,
      { headers: hdrs }
    );
    const existing = existingRes.ok ? await existingRes.json() : [];
    if (existing.length) {
      return {
        statusCode: 200,
        headers: { ...cors(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, amount: pi.amount_received / 100, alreadyRecorded: true }),
      };
    }

    const amount = pi.amount_received / 100;
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/folio_items`, {
      method: 'POST',
      headers: { ...hdrs, Prefer: 'return=minimal' },
      body: JSON.stringify({
        folio_id: folioId,
        description: `Payment — Credit Card (Stripe) (${paymentIntentId})`,
        qty: 1,
        unit_price: -amount,
        tax_rate: 0,
        category: 'Payment',
      }),
    });
    if (!insertRes.ok) {
      const errBody = await insertRes.text();
      return jsonErr(500, 'Payment charged but could not save: ' + errBody);
    }

    notifyFolioPayment(hdrs, folioId, amount).catch(e => console.warn('[confirm-folio-payment] notify failed:', e.message));

    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, amount }),
    };
  } catch (err) {
    return jsonErr(500, 'Could not record payment: ' + err.message);
  }
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}

function fmtDateRangeEs(start, end) {
  if (!start || !end) return '—';
  const opts = { day: 'numeric', month: 'short' };
  const a = new Date(start + 'T00:00:00'), b = new Date(end + 'T00:00:00');
  return `${a.toLocaleDateString('es-MX', opts)} – ${b.toLocaleDateString('es-MX', { ...opts, year: 'numeric' })}`;
}

// Looks up the guest name + dates for the Jorge WhatsApp alert -- works
// whether this PaymentIntent came from folio-payment.js (guest self-pay,
// rich metadata) or create-payment-intent.js (admin "Charge Card", bare
// amount/folioId only) since it re-derives everything from the folio itself
// rather than trusting whichever metadata the caller happened to attach.
async function notifyFolioPayment(hdrs, folioId, amount) {
  const folioRes = await fetch(`${SUPABASE_URL}/rest/v1/folios?id=eq.${encodeURIComponent(folioId)}&select=id,name,guest_name,booking_request_id,registration_id&limit=1`, { headers: hdrs });
  const [folio] = folioRes.ok ? await folioRes.json() : [];
  if (!folio) return;

  let guestName = folio.guest_name || folio.name || 'Huésped';
  let dates = '—';
  if (folio.registration_id) {
    const regRes = await fetch(`${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(folio.registration_id)}&select=check_in,check_out,bookings(start_date,end_date)&limit=1`, { headers: hdrs });
    const [reg] = regRes.ok ? await regRes.json() : [];
    if (reg) dates = fmtDateRangeEs(reg.check_in || reg.bookings?.start_date, reg.check_out || reg.bookings?.end_date);
  } else if (folio.booking_request_id) {
    const bkRes = await fetch(`${SUPABASE_URL}/rest/v1/booking_requests?id=eq.${encodeURIComponent(folio.booking_request_id)}&select=first_name,last_name,check_in,check_out&limit=1`, { headers: hdrs });
    const [bk] = bkRes.ok ? await bkRes.json() : [];
    if (bk) {
      if (!folio.guest_name) guestName = `${bk.first_name || ''} ${bk.last_name || ''}`.trim() || guestName;
      dates = fmtDateRangeEs(bk.check_in, bk.check_out);
    }
  }

  await sendPaymentNotification({ status: 'recibido', guestName, source: 'Folio', dates, amount: `$${amount.toFixed(2)}` });
}
