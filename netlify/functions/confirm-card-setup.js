'use strict';

// Verifies a SetupIntent directly against Stripe (server-side, using the secret
// key) before saving the card to the registration -- same "never trust the
// client's bare claim" pattern as confirm-booking-payment.js/confirm-folio-payment.js.
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

  const { setupIntentId, regId } = body;
  if (!setupIntentId || !regId) return jsonErr(400, 'Missing setupIntentId or regId');

  const stripeHdrs = { Authorization: `Bearer ${stripeKey}`, 'Stripe-Version': '2024-06-20' };
  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json' };

  let si;
  try {
    const siRes = await fetch(`${STRIPE_API}/setup_intents/${encodeURIComponent(setupIntentId)}`, { headers: stripeHdrs });
    si = await siRes.json();
    if (si.error) return jsonErr(400, si.error.message ?? 'Stripe error');
  } catch (err) {
    return jsonErr(500, 'Could not verify setup with Stripe');
  }

  if (si.status !== 'succeeded') return jsonErr(400, `Card setup not completed (status: ${si.status})`);
  if ((si.metadata || {}).regId !== regId) return jsonErr(400, 'Setup does not match this registration');
  if (!si.payment_method) return jsonErr(400, 'No payment method on setup intent');

  let brand = null, last4 = null;
  try {
    const pmRes = await fetch(`${STRIPE_API}/payment_methods/${encodeURIComponent(si.payment_method)}`, { headers: stripeHdrs });
    const pm = await pmRes.json();
    if (pm.card) { brand = pm.card.brand; last4 = pm.card.last4; }
  } catch (err) { /* non-fatal -- card still saved, just no display label */ }

  try {
    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(regId)}`, {
      method: 'PATCH', headers: { ...hdrs, Prefer: 'return=minimal' },
      body: JSON.stringify({ stripe_customer_id: si.customer, stripe_payment_method_id: si.payment_method, stripe_card_brand: brand, stripe_card_last4: last4 }),
    });
    if (!patchRes.ok) return jsonErr(500, 'Card saved with Stripe but could not save to the registration: ' + await patchRes.text());
  } catch (err) {
    return jsonErr(500, 'Could not save card: ' + err.message);
  }

  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, customerId: si.customer, paymentMethodId: si.payment_method, brand, last4 }),
  };
};

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) }; }
