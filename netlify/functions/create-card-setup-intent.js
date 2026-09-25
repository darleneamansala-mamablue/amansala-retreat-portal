'use strict';

// Creates a Stripe SetupIntent so staff can vault a guest's card at check-in
// WITHOUT charging it -- the actual charge (folio balance, incidentals, a
// no-show fee, whatever comes up during the stay) happens later via
// charge-card-on-file.js, using the saved customer + payment_method. Jorge's
// ask 2026-09-25: today the portal can only charge via a one-time Stripe
// link/PaymentIntent -- there was no way to keep a card on file to charge
// after the fact.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const STRIPE_API = 'https://api.stripe.com/v1';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const pubKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!stripeKey || !pubKey) return jsonErr(500, 'Stripe not configured');
  if (!supaKey) return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { regId } = body;
  if (!regId) return jsonErr(400, 'Missing regId');

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json' };
  const stripeHdrs = { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' };

  let reg;
  try {
    const regRes = await fetch(`${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(regId)}&select=id,guests,stripe_customer_id`, { headers: hdrs });
    if (!regRes.ok) throw new Error('registration fetch failed');
    [reg] = await regRes.json();
  } catch (err) {
    return jsonErr(500, 'Could not fetch registration');
  }
  if (!reg) return jsonErr(404, 'Registration not found');

  const guest = (reg.guests || []).find(g => g.name) || {};

  try {
    // Reuse the existing Stripe Customer if this guest already has one on file
    // (e.g. re-saving a new card after the old one expired) -- creating a
    // second Customer per guest would just orphan the old saved card.
    let customerId = reg.stripe_customer_id;
    if (!customerId) {
      const custParams = new URLSearchParams({
        name: (guest.name || '').slice(0, 200),
        'metadata[regId]': regId,
      });
      if (guest.email) custParams.set('email', guest.email);
      const custRes = await fetch(`${STRIPE_API}/customers`, { method: 'POST', headers: stripeHdrs, body: custParams.toString() });
      const cust = await custRes.json();
      if (cust.error) return jsonErr(400, cust.error.message ?? 'Stripe error creating customer');
      customerId = cust.id;
    }

    const siParams = new URLSearchParams({
      customer: customerId,
      usage: 'off_session',
      'metadata[regId]': regId,
    });
    const siRes = await fetch(`${STRIPE_API}/setup_intents`, { method: 'POST', headers: stripeHdrs, body: siParams.toString() });
    const si = await siRes.json();
    if (si.error) return jsonErr(400, si.error.message ?? 'Stripe error creating setup intent');

    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientSecret: si.client_secret, setupIntentId: si.id, publishableKey: pubKey, customerId }),
    };
  } catch (err) {
    return jsonErr(500, 'Stripe request failed: ' + err.message);
  }
};

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) }; }
