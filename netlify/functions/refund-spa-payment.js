'use strict';

// Safety net for the rare race condition in spa-booking.html's offsite-guest
// flow: an offsite guest now pays BEFORE their slot is locked in, and the
// final conflict re-check (someone else booked the exact same slot in the
// few seconds it took to complete Stripe payment) happens AFTER that
// payment succeeds. Rather than leave a guest charged with no appointment,
// the client calls this to refund them immediately and asks them to pick a
// different slot.
const STRIPE_API = 'https://api.stripe.com/v1';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return jsonErr(500, 'Stripe not configured');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { paymentIntentId } = body;
  if (!paymentIntentId) return jsonErr(400, 'Missing paymentIntentId');

  // Only that case (2026-11-02: this used to refund ANY payment on the Stripe account for anyone who asked): a spa-booking
  // payment made in the last 2 hours that no appointment holds.
  const piRes = await fetch(`${STRIPE_API}/payment_intents/${encodeURIComponent(String(paymentIntentId))}`, {
    headers: { 'Authorization': `Bearer ${stripeKey}`, 'Stripe-Version': '2024-06-20' },
  });
  const pi = await piRes.json();
  if (pi.error || !pi.id) return jsonErr(400, 'Payment not found');
  if ((pi.metadata || {}).source !== 'spa_booking') return jsonErr(403, 'Not a spa booking payment');
  if (pi.status !== 'succeeded') return jsonErr(400, 'Payment not completed');
  if (Date.now() / 1000 - pi.created > 2 * 3600) return jsonErr(403, 'Too old to refund here: ask the front desk');
  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');
  const ar = await fetch('https://vnttlpqkssihbmcynxvo.supabase.co/rest/v1/app_store?key=eq.spa_appointments&select=value', { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } });
  if (!ar.ok) return jsonErr(500, 'Could not check the appointment');
  const rows = await ar.json();
  const appts = (rows[0] && Array.isArray(rows[0].value)) ? rows[0].value : [];
  if (appts.some(a => a && a.paymentIntentId === pi.id && a.status !== 'CANCELLED')) return jsonErr(403, 'This payment belongs to a booked appointment');

  const params = new URLSearchParams({ payment_intent: paymentIntentId });
  const res = await fetch(`${STRIPE_API}/refunds`, {
    method:  'POST',
    headers: {
      'Authorization':  `Bearer ${stripeKey}`,
      'Content-Type':   'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body: params.toString(),
  });
  const refund = await res.json();
  if (refund.error) return jsonErr(400, refund.error.message ?? 'Refund failed');

  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, refundId: refund.id }),
  };
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
