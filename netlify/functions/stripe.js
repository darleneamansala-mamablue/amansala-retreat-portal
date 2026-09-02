'use strict';

// Adapted from Jorge's version onto our app_store blob pattern (see get-availability.js).
// Rate calculation mirrors get-rates.js exactly so what a guest sees on the room
// card matches what they're actually charged.
const SUPABASE_URL = 'https://fzresosiqafiyxfgeyvk.supabase.co';
const STRIPE_API = 'https://api.stripe.com/v1';

async function readAppStore(key, hdrs) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.${encodeURIComponent(key)}&select=value`, { headers: hdrs });
  if (!res.ok) throw new Error(`${key} fetch failed`);
  const rows = await res.json();
  return rows[0]?.value ?? null;
}

function isLow(dateStr) {
  const m = new Date(dateStr + 'T12:00:00').getMonth() + 1;
  return m >= 5 && m <= 9;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const pubKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const supaKey = process.env.SUPABASE_SERVICE_KEY;

  if (!stripeKey || !pubKey) return jsonErr(500, 'Stripe not configured');
  if (!supaKey) return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { roomTypeId, roomTypeName, checkIn, checkOut, adults,
          firstName, lastName, email, phone, dietary, notes,
          discountCode, source } = body;

  if (!firstName || !lastName || !email || !checkIn || !checkOut || !roomTypeId) {
    return jsonErr(400, 'Missing required fields');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonErr(400, 'Invalid email');
  if (checkIn >= checkOut) return jsonErr(400, 'Check-out must be after check-in');

  const hdrs = { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}`, 'Content-Type': 'application/json' };

  let rt;
  try {
    const roomTypes = (await readAppStore('roomTypes', hdrs)) ?? [];
    rt = roomTypes.find(r => r.id === roomTypeId);
  } catch (err) {
    return jsonErr(500, 'Could not fetch room type');
  }
  if (!rt) return jsonErr(404, 'Room type not found');

  let taxPct = 0, seasonalAdj = {}, weekendPremium = 0;
  try {
    const settings = await readAppStore('bookingEngineSettings', hdrs);
    if (settings) {
      taxPct = parseFloat(settings.taxes_pct) || 0;
      seasonalAdj = settings.seasonal_adjustments ?? {};
      weekendPremium = parseFloat(settings.weekend_premium) || 0;
    }
  } catch (_) { /* no settings configured yet — use zero defaults */ }

  const numAdults = Math.max(1, parseInt(adults) || 1);
  const nights = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));

  // Our real seasonal single-occupancy rate — same source get-rates.js uses.
  const baseRate = isLow(checkIn) ? (rt.price1_low ?? rt.price1) : rt.price1;
  if (baseRate == null) return jsonErr(400, 'Room type has no price configured');

  const ciDate = new Date(checkIn + 'T12:00:00');
  const month = ciDate.getMonth() + 1;
  const dow = ciDate.getDay();
  const isWeekend = dow === 0 || dow === 5 || dow === 6;
  const seasonalPct = Number(seasonalAdj[String(month)] ?? 0);
  const rate = Math.round(baseRate * (1 + seasonalPct / 100) * (isWeekend && weekendPremium ? (1 + weekendPremium / 100) : 1));
  const subtotal = rate * nights;

  // Validate and apply discount code server-side
  let discountAmount = 0;
  let validatedCode = null;
  if (discountCode) {
    try {
      const codes = (await readAppStore('beDiscountCodes', hdrs)) ?? [];
      const wanted = String(discountCode).toUpperCase().trim();
      const dc = codes.find(c => c.active && (c.code || '').toUpperCase().trim() === wanted);
      const pageKey = source === 'Extra Night' ? 'extra_nights' : 'escape';
      const appliesHere = !dc?.appliesTo || dc.appliesTo === 'all' || dc.appliesTo === pageKey;
      if (dc && appliesHere
             && !(dc.expiresAt && new Date(dc.expiresAt + 'T23:59:59') < new Date())
             && !(dc.maxUses != null && (dc.usedCount ?? 0) >= dc.maxUses)) {
        validatedCode = dc.code;
        if (dc.type === 'pct') {
          discountAmount = Math.round(subtotal * dc.value) / 100;
        } else {
          discountAmount = Math.min(dc.value, subtotal);
        }
      }
    } catch (_) { /* non-fatal — proceed without discount */ }
  }

  const taxAmt = Math.round((subtotal - discountAmount) * taxPct) / 100;
  const totalUSD = subtotal - discountAmount + taxAmt;
  const amountCents = Math.round(totalUSD * 100);

  if (amountCents < 50) return jsonErr(400, 'Amount too small');

  // Stripe metadata has a 500-char limit per value
  const params = new URLSearchParams({
    amount: String(amountCents),
    currency: 'usd',
    receipt_email: email,
    description: `Amansala Tulum · ${(roomTypeName ?? rt.name).slice(0, 200)} · ${checkIn} – ${checkOut}`,
    'metadata[roomTypeId]': roomTypeId,
    'metadata[roomTypeName]': (roomTypeName ?? rt.name).slice(0, 200),
    'metadata[checkIn]': checkIn,
    'metadata[checkOut]': checkOut,
    'metadata[adults]': String(numAdults),
    'metadata[firstName]': firstName.slice(0, 100),
    'metadata[lastName]': lastName.slice(0, 100),
    'metadata[email]': email.slice(0, 200),
    'metadata[phone]': (phone || '').slice(0, 50),
    'metadata[dietary]': (dietary || '').slice(0, 200),
    'metadata[notes]': (notes || '').slice(0, 400),
    'metadata[discountCode]': (validatedCode || '').slice(0, 50),
    'metadata[discountAmount]': String(discountAmount),
    'metadata[source]': (source || 'Escape').slice(0, 50),
  });

  const piRes = await fetch(`${STRIPE_API}/payment_intents`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
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
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      publishableKey: pubKey,
      amount: totalUSD,
      nights,
      taxPct,
      discountCode: validatedCode,
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
