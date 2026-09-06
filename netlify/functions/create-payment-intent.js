'use strict';

const STRIPE_API = 'https://api.stripe.com/v1';

function cors() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const pubKey    = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!stripeKey || !pubKey) return jsonErr(500, 'Stripe not configured');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { amount, description, email, folioId } = body;
  if (!amount || amount <= 0) return jsonErr(400, 'Invalid amount');

  const amountCents = Math.round(Number(amount) * 100);
  if (amountCents < 50) return jsonErr(400, 'Amount too small (minimum $0.50)');

  const params = new URLSearchParams({
    amount:      String(amountCents),
    currency:    'usd',
    description: (description ?? 'Amansala charge').slice(0, 1000),
    'metadata[source]': 'admin_folio',
  });
  if (email) params.set('receipt_email', email);
  // Stamped on the PaymentIntent so confirm-folio-payment.js can verify, server-side,
  // that a successful charge is being recorded against the folio it was meant for.
  if (folioId) params.set('metadata[folioId]', String(folioId).slice(0, 200));

  const piRes = await fetch(`${STRIPE_API}/payment_intents`, {
    method:  'POST',
    headers: {
      'Authorization':  `Bearer ${stripeKey}`,
      'Content-Type':   'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body: params.toString(),
  });
  const pi = await piRes.json();
  if (pi.error) return jsonErr(400, pi.error.message ?? 'Stripe error');

  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientSecret:    pi.client_secret,
      paymentIntentId: pi.id,
      publishableKey:  pubKey,
      amount:          Number(amount),
    }),
  };
};
