'use strict';

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const STRIPE_API   = 'https://api.stripe.com/v1';

function isLow(dateStr) {
  const m = new Date(dateStr + 'T12:00:00').getMonth() + 1;
  return m >= 5 && m <= 9;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const pubKey    = process.env.STRIPE_PUBLISHABLE_KEY;
  const supaKey   = process.env.SUPABASE_SERVICE_KEY;

  if (!stripeKey || !pubKey) return jsonErr(500, 'Stripe not configured');
  if (!supaKey) return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { roomTypeId, roomTypeName, checkIn, checkOut, adults,
          firstName, lastName, email, phone, dietary, notes,
          discountCode, source } = body;

  if (!firstName || !lastName || !email || !phone || !checkIn || !checkOut || !roomTypeId) {
    return jsonErr(400, 'Missing required fields');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonErr(400, 'Invalid email');
  if (checkIn >= checkOut) return jsonErr(400, 'Check-out must be after check-in');

  const supaHdrs = {
    'apikey':        supaKey,
    'Authorization': `Bearer ${supaKey}`,
    'Content-Type':  'application/json',
  };

  // Fetch room type + booking engine settings in parallel
  const [rtRes, settRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/room_types?id=eq.${encodeURIComponent(roomTypeId)}&select=id,name,be_price_single,be_price_double,price_single_high,price_single_low,price_double_high`, { headers: supaHdrs }),
    fetch(`${SUPABASE_URL}/rest/v1/booking_engine_settings?id=eq.1`, { headers: supaHdrs }),
  ]);

  if (!rtRes.ok) return jsonErr(500, 'Could not fetch room type');
  const [rt] = await rtRes.json();
  if (!rt) return jsonErr(404, 'Room type not found');

  let taxPct = 0, seasonalAdj = {}, weekendPremium = 0;
  if (settRes.ok) {
    const [s] = await settRes.json();
    if (s) {
      taxPct         = parseFloat(s.taxes_pct)      || 0;
      seasonalAdj    = s.seasonal_adjustments        ?? {};
      weekendPremium = parseFloat(s.weekend_premium) || 0;
    }
  }

  const numAdults = Math.max(1, parseInt(adults) || 1);
  const nights    = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));

  // A Booking Engine override (admin Rates tab) takes priority; otherwise our real
  // seasonal single-occupancy rate — same source get-rates.js uses, so what a guest
  // sees on the room card matches what they're actually charged.
  const baseRate = rt.be_price_single ?? (isLow(checkIn) ? (rt.price_single_low ?? rt.price_single_high) : rt.price_single_high) ?? 0;

  const ciDate    = new Date(checkIn + 'T12:00:00');
  const month     = ciDate.getMonth() + 1;
  const dow       = ciDate.getDay();
  const isWeekend = dow === 0 || dow === 5 || dow === 6;
  // Extra Nights pricing is intentionally static — no seasonal/weekend swings,
  // per Darlene (2026-09-03). Only Book a Stay (source === 'Escape') fluctuates.
  const isStatic    = source === 'Extra Night';
  const seasonalPct = isStatic ? 0 : Number(seasonalAdj[String(month)] ?? 0);
  const weekendMult = isStatic ? 1 : (isWeekend && weekendPremium ? (1 + weekendPremium / 100) : 1);
  const rate        = Math.round(baseRate * (1 + seasonalPct / 100) * weekendMult);
  const subtotal    = rate * nights;

  // Validate and apply discount code server-side
  let discountAmount = 0;
  let validatedCode  = null;
  if (discountCode) {
    try {
      const dcRes = await fetch(
        `${SUPABASE_URL}/rest/v1/be_discount_codes?code=eq.${encodeURIComponent(String(discountCode).toUpperCase().trim())}&active=eq.true&select=*`,
        { headers: supaHdrs }
      );
      if (dcRes.ok) {
        const dcRows = await dcRes.json();
        const dc = dcRows[0];
        const pageKey = source === 'Extra Night' ? 'extra_nights' : 'escape';
        const appliesHere = !dc?.applies_to || dc.applies_to === 'all' || dc.applies_to === pageKey;
        const inBlackout = dc?.blackout_start && dc?.blackout_end && checkIn < dc.blackout_end && checkOut > dc.blackout_start;
        if (dc && appliesHere && !inBlackout
               && !(dc.expires_at && new Date(dc.expires_at + 'T23:59:59') < new Date())
               && !(dc.max_uses != null && dc.used_count >= dc.max_uses)) {
          validatedCode = dc.code;
          if (dc.type === 'pct') {
            discountAmount = Math.round(subtotal * dc.value) / 100;
          } else {
            discountAmount = Math.min(dc.value, subtotal);
          }
        }
      }
    } catch (_) { /* non-fatal — proceed without discount */ }
  }

  const taxAmt      = Math.round((subtotal - discountAmount) * taxPct) / 100;
  const totalUSD    = subtotal - discountAmount + taxAmt;
  const amountCents = Math.round(totalUSD * 100);

  if (amountCents < 50) return jsonErr(400, 'Amount too small');

  // Stripe metadata has a 500-char limit per value
  const params = new URLSearchParams({
    amount:             String(amountCents),
    currency:           'usd',
    receipt_email:      email,
    description:        `Amansala Tulum · ${(roomTypeName ?? rt.name).slice(0, 200)} · ${checkIn} – ${checkOut}`,
    'metadata[roomTypeId]':   roomTypeId,
    'metadata[roomTypeName]': (roomTypeName ?? rt.name).slice(0, 200),
    'metadata[checkIn]':      checkIn,
    'metadata[checkOut]':     checkOut,
    'metadata[adults]':       String(numAdults),
    'metadata[firstName]':    firstName.slice(0, 100),
    'metadata[lastName]':     lastName.slice(0, 100),
    'metadata[email]':        email.slice(0, 200),
    'metadata[phone]':        (phone || '').slice(0, 50),
    'metadata[dietary]':      (dietary || '').slice(0, 200),
    'metadata[notes]':           (notes || '').slice(0, 400),
    'metadata[discountCode]':    (validatedCode || '').slice(0, 50),
    'metadata[discountAmount]':  String(discountAmount),
    'metadata[source]':          (source || 'Escape').slice(0, 50),
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
      nights,
      taxPct,
      discountCode:    validatedCode,
      discountAmount,
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
