'use strict';
// TEMPORARY recovery link: re-runs the booking step for ONE paid retreat-booking PaymentIntent whose webhook delivery failed
// (Tiffany Turner, 2026-10-16). It looks the payment up in Stripe itself, refuses anything that did not succeed or is not a retreat
// booking, and rb-fulfil is idempotent (a PaymentIntent is only ever fulfilled once). To be deleted after use.
const L = require('./rb-lib');

exports.handler = async (event) => {
  const pi = (event.queryStringParameters || {}).pi || '';
  if (!/^pi_[A-Za-z0-9]+$/.test(pi)) return L.json(400, { error: 'Missing payment id' });
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) return L.json(500, { error: 'not configured' });
  const r = await fetch('https://api.stripe.com/v1/payment_intents/' + pi, { headers: { Authorization: `Bearer ${sk}` } });
  const intent = await r.json();
  if (intent.error) return L.json(404, { error: 'payment not found' });
  if (intent.status !== 'succeeded') return L.json(409, { error: 'payment has not succeeded', status: intent.status });
  const src = (intent.metadata || {}).source;
  try {
    if (src === 'retreat_booking') return L.json(200, { source: src, result: await require('./rb-fulfil').fulfil(intent) });
    if (src === 'retreat_booking_house') return L.json(200, { source: src, result: await require('./rb-fulfil-house').fulfil(intent) });
  } catch (e) { return L.json(500, { error: e.message }); }
  return L.json(400, { error: 'not a retreat booking payment' });
};
