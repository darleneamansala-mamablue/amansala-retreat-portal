'use strict';

// Verifies a spa-booking PaymentIntent directly against Stripe's API before
// spa-booking.html is allowed to write the appointment -- never trust the
// client's bare claim that confirmPayment() succeeded, same pattern
// confirm-folio-payment.js already uses for folio payments.
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

  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, amount: pi.amount_received / 100 }),
  };
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
