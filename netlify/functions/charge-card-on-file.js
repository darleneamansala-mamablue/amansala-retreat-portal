'use strict';

// Charges a guest's saved card (customer + payment_method vaulted at check-in
// via create-card-setup-intent.js/confirm-card-setup.js) -- an off_session
// PaymentIntent, confirmed immediately server-side. No card re-entry, no
// payment link. Records the payment as a negative-priced folio_items row,
// same representation every other folio payment (Cash/Zelle/Stripe link/etc.)
// already uses.
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

  const { regId, folioId, amount, description } = body;
  if (!regId || !folioId) return jsonErr(400, 'Missing regId or folioId');
  if (!amount || amount <= 0) return jsonErr(400, 'Invalid amount');

  const amountCents = Math.round(Number(amount) * 100);
  if (amountCents < 50) return jsonErr(400, 'Amount too small (minimum $0.50)');

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json' };
  const stripeHdrs = { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' };

  let reg;
  try {
    const regRes = await fetch(`${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(regId)}&select=id,stripe_customer_id,stripe_payment_method_id`, { headers: hdrs });
    if (!regRes.ok) throw new Error('registration fetch failed');
    [reg] = await regRes.json();
  } catch (err) {
    return jsonErr(500, 'Could not fetch registration');
  }
  if (!reg) return jsonErr(404, 'Registration not found');
  if (!reg.stripe_customer_id || !reg.stripe_payment_method_id) return jsonErr(400, 'No card on file for this guest yet -- save one first.');

  const params = new URLSearchParams({
    amount: String(amountCents),
    currency: 'usd',
    customer: reg.stripe_customer_id,
    payment_method: reg.stripe_payment_method_id,
    off_session: 'true',
    confirm: 'true',
    description: (description || 'Amansala · Card on file charge').slice(0, 1000),
    'metadata[source]': 'card_on_file',
    'metadata[folioId]': String(folioId).slice(0, 200),
    'metadata[regId]': regId,
  });

  let pi;
  try {
    const piRes = await fetch(`${STRIPE_API}/payment_intents`, { method: 'POST', headers: stripeHdrs, body: params.toString() });
    pi = await piRes.json();
    if (pi.error) {
      // A saved card occasionally needs re-authentication for an off_session
      // charge (issuer-side, rare but real) -- surface that distinctly so
      // staff know to ask the guest to re-enter their card instead of
      // treating this like a declined card.
      if (pi.error.code === 'authentication_required') return jsonErr(402, 'The card needs the guest to re-authenticate — ask them to re-enter their card (Save Card again) or use another payment method.');
      return jsonErr(400, pi.error.message ?? 'Stripe error');
    }
  } catch (err) {
    return jsonErr(500, 'Stripe request failed: ' + err.message);
  }

  if (pi.status !== 'succeeded') return jsonErr(400, `Charge did not complete (status: ${pi.status})`);

  try {
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/folio_items`, {
      method: 'POST',
      headers: { ...hdrs, Prefer: 'return=minimal' },
      body: JSON.stringify({
        folio_id: folioId,
        description: `Payment — Card on File (${pi.id})`,
        qty: 1,
        unit_price: -(pi.amount_received / 100),
        tax_rate: 0,
      }),
    });
    if (!insertRes.ok) return jsonErr(500, 'Charged but could not save to the folio: ' + await insertRes.text());
  } catch (err) {
    return jsonErr(500, 'Charged but could not save to the folio: ' + err.message);
  }

  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, amount: pi.amount_received / 100, paymentIntentId: pi.id }),
  };
};

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) }; }
