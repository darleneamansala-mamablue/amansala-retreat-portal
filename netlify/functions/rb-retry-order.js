'use strict';
// Manual recovery for a Retreat Booking payment stuck in 'error' (fulfilment threw, e.g. the Tiffany
// Turner 23502 incident) or 'needs_attention' (no room was free at the time -- may be free now).
// Staff triggers this from the Dashboard's "Action needed" row (modules/booking-page-dashboard.js)
// instead of needing someone with Supabase access to fix it by hand. The stored order record only
// keeps a summary, not the full metadata rb-fulfil.js/rb-fulfil-house.js need, so this re-fetches the
// PaymentIntent straight from Stripe and re-runs the same fulfilment logic. Safe to click more than
// once: rb-fulfil.js/rb-fulfil-house.js only treat an already-'placed' order as a true duplicate.
const STRIPE_API = 'https://api.stripe.com/v1';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors(), body: 'Method Not Allowed' };

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!stripeKey || !supaKey) return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body); } catch { return jsonErr(400, 'Invalid JSON'); }
  const piId = body.piId;
  if (!piId) return jsonErr(400, 'Missing piId');

  try {
    const piRes = await fetch(`${STRIPE_API}/payment_intents/${encodeURIComponent(piId)}`, {
      headers: { Authorization: `Bearer ${stripeKey}`, 'Stripe-Version': '2024-06-20' },
    });
    const pi = await piRes.json();
    if (pi.error) return jsonErr(400, pi.error.message || 'Stripe error');
    if (pi.status !== 'succeeded') return jsonErr(400, `Payment not completed (status: ${pi.status})`);

    const source = (pi.metadata || {}).source;
    let r;
    if (source === 'retreat_booking_house') r = await require('./rb-fulfil-house').fulfil(pi);
    else if (source === 'retreat_booking') r = await require('./rb-fulfil').fulfil(pi);
    else return jsonErr(400, 'This payment is not a retreat booking payment');

    if (r && r.duplicate) return jsonErr(409, 'Already recorded -- nothing to retry');
    if (r && r.error) return jsonErr(500, 'Retry ran but failed again -- check the Dashboard for the new error');
    return ok(r);
  } catch (err) {
    return jsonErr(500, 'Retry failed: ' + err.message);
  }
};

function ok(r) {
  return { statusCode: 200, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, placed: !!(r && r.placed) }) };
}
function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
