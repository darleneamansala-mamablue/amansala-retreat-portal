'use strict';

// Removes a guest's saved card (Jorge's ask 2026-09-25, right after Card on
// File shipped -- staff need a way to take it off again, e.g. the guest asks,
// or it was saved by mistake). Detaches the PaymentMethod from Stripe (so it
// can't be reused even if something still had the id cached) and clears the
// registration's saved-card columns.
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

  const { regId } = body;
  if (!regId) return jsonErr(400, 'Missing regId');

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json' };

  let reg;
  try {
    const regRes = await fetch(`${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(regId)}&select=id,stripe_payment_method_id`, { headers: hdrs });
    if (!regRes.ok) throw new Error('registration fetch failed');
    [reg] = await regRes.json();
  } catch (err) {
    return jsonErr(500, 'Could not fetch registration');
  }
  if (!reg) return jsonErr(404, 'Registration not found');

  if (reg.stripe_payment_method_id) {
    try {
      await fetch(`${STRIPE_API}/payment_methods/${encodeURIComponent(reg.stripe_payment_method_id)}/detach`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${stripeKey}`, 'Stripe-Version': '2024-06-20' },
      });
      // Non-fatal if this fails (e.g. already detached) -- the point is the
      // registration no longer references it either way, below.
    } catch (err) { /* ignore */ }
  }

  try {
    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(regId)}`, {
      method: 'PATCH', headers: { ...hdrs, Prefer: 'return=minimal' },
      body: JSON.stringify({ stripe_payment_method_id: null, stripe_card_brand: null, stripe_card_last4: null }),
    });
    if (!patchRes.ok) return jsonErr(500, 'Could not remove card: ' + await patchRes.text());
  } catch (err) {
    return jsonErr(500, 'Could not remove card: ' + err.message);
  }

  return { statusCode: 200, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true }) };
};

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) }; }
