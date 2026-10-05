'use strict';

// Collects payment from an OFFSITE (day-spa, not staying at the hotel)
// guest BEFORE their appointment is written -- this function already
// existed (ported from staging) but was never actually wired up to
// spa-booking.html, which until now created the appointment immediately
// with status 'PAYMENT_PENDING' and called the guest later to collect
// payment by phone, even though the page already said "Advance payment is
// required" (Jorge's report 2026-10-05). Hotel guests are unaffected --
// their service is still auto-charged to their room folio at confirm time.
// Price is computed authoritatively here from the real spa_data catalog,
// never trusted from the client -- only the optional tip add-on is
// client-supplied (sanitized, not validated against anything, since it's
// the guest's own discretionary choice).
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const STRIPE_API   = 'https://api.stripe.com/v1';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const pubKey    = process.env.STRIPE_PUBLISHABLE_KEY;
  const supaKey   = process.env.SUPABASE_SERVICE_KEY;

  if (!stripeKey || !pubKey) return jsonErr(500, 'Stripe not configured');
  if (!supaKey)              return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { serviceId, guestCount, email, firstName, lastName } = body;
  // Optional discretionary tip, added on top of the authoritative service
  // price below -- unlike the service price, there's nothing to validate
  // against a catalog (it's the guest's own choice), just sanitize it to a
  // sane non-negative amount.
  const tipAmount = Math.max(0, Math.min(500, Number(body.tipAmount) || 0));
  if (!serviceId || !email || !firstName || !lastName) return jsonErr(400, 'Missing required fields');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonErr(400, 'Invalid email');

  // Fetch authoritative spa service data from Supabase
  const supaHdrs = {
    'apikey':        supaKey,
    'Authorization': `Bearer ${supaKey}`,
  };
  const sdRes = await fetch(
    `${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_data&select=value`,
    { headers: supaHdrs }
  );
  if (!sdRes.ok) return jsonErr(500, 'Could not fetch spa data');
  const [sdRow] = await sdRes.json();
  const spaData  = sdRow?.value ?? {};
  const svc      = (spaData.services || []).find(s => s.id === serviceId);
  if (!svc)        return jsonErr(404, 'Service not found');
  if (!svc.active) return jsonErr(400, 'Service not available for booking');

  // Compute authoritative price server-side
  let priceUSD;
  if (svc.groupPricing) {
    const n  = Math.max(1, parseInt(guestCount) || 1);
    const gp = svc.groupPricing;
    if (n >= gp.minGroup) {
      priceUSD = gp.perPersonUSD * n;
    } else if (gp.belowMin && gp.belowMin[n] != null) {
      priceUSD = gp.belowMin[n];
    } else {
      return jsonErr(400, 'Invalid guest count for group pricing');
    }
  } else {
    priceUSD = Number(svc.price);
  }

  if (!priceUSD || priceUSD <= 0) return jsonErr(400, 'Service price not set');

  const totalUSD = +(priceUSD + tipAmount).toFixed(2);
  const amountCents = Math.round(totalUSD * 100);
  if (amountCents < 50) return jsonErr(400, 'Amount too small');

  const desc = `Amansala Spa · ${svc.name}${svc.groupPricing ? ` (${guestCount || 1} guests)` : ''}`;

  const params = new URLSearchParams({
    amount:                  String(amountCents),
    currency:                'usd',
    receipt_email:           email,
    description:             desc.slice(0, 1000),
    'metadata[serviceId]':   serviceId,
    'metadata[serviceName]': svc.name.slice(0, 200),
    'metadata[firstName]':   String(firstName).slice(0, 100),
    'metadata[lastName]':    String(lastName).slice(0, 100),
    'metadata[email]':       email.slice(0, 200),
    'metadata[guestCount]':  String(guestCount || 1),
    'metadata[tipAmount]':   String(tipAmount),
    'metadata[source]':      'spa_booking',
  });

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
      amount:          totalUSD,
      servicePrice:    priceUSD,
      tipAmount,
    }),
  };
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonErr(code, msg) {
  return {
    statusCode: code,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: msg }),
  };
}
