'use strict';

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const STRIPE_API   = 'https://api.stripe.com/v1';

function isLow(dateStr) {
  const m = new Date(dateStr + 'T12:00:00').getMonth() + 1;
  return m >= 5 && m <= 9;
}

// Extra Night only -- Jorge's call 2026-10-08: no one can book an extra
// night overlapping the Dec 20 – Jan 15 holiday window, same as retreats
// never book then. Checks both possible blackout instances touching checkIn's
// year (the stay itself is always short, so this always covers the real
// window even when checkIn falls in January, i.e. the PRIOR December's
// blackout).
function inExtraNightBlackout(checkIn, checkOut) {
  const ciYear = new Date(checkIn + 'T12:00:00').getFullYear();
  return [ciYear - 1, ciYear].some(y => {
    const blackoutStart = `${y}-12-20`;
    const blackoutEnd   = `${y + 1}-01-15`;
    return checkIn < blackoutEnd && checkOut > blackoutStart;
  });
}

// A room sold whole (e.g. "19B") and as individual shared beds ("19B -a",
// "19B -b") is the SAME physical space -- blocking one must block the
// other(s). Mirrors stripe-webhook.js's own copy exactly (kept duplicated,
// not shared, matching every other room-siblings copy in netlify/functions —
// get-availability.js, visito-check-availability.js).
const ROOM_PARENT_TO_BED = { rt6: 'bd1', rt7: 'bd2', rt8: 'bd3', rt9: 'bd4' };
const ROOM_BED_TO_PARENT = { bd1: 'rt6', bd2: 'rt7', bd3: 'rt8', bd4: 'rt9' };
const VILLA_TO_SUBTYPES = { cm1: ['cg1', 'cg2', 'cg3', 'cg4', 'cg5'], csh3: ['csh1', 'csh2'] };
function splitDoubleHalf(room) {
  const r = String(room || '').trim();
  let m = r.match(/^(\d+)([a-d])$/i);
  if (m) return { base: m[1] };
  m = r.match(/^(.+?)\s*-([a-d])$/i);
  if (m) return { base: m[1] };
  m = r.match(/^(.+\d)([a-d])$/i);
  if (m) return { base: m[1] };
  return null;
}
function propagateSiblingBlocks(blockedSet, roomTypes) {
  const roomToType = new Map();
  roomTypes.forEach(rt => (rt.rooms || []).forEach(r => roomToType.set(r, rt.id)));
  const roomsById = new Map(roomTypes.map(rt => [rt.id, rt.rooms || []]));
  const toAdd = new Set();
  [...blockedSet].forEach(room => {
    const typeId = roomToType.get(room);
    if (!typeId) return;
    if (ROOM_PARENT_TO_BED[typeId]) {
      (roomsById.get(ROOM_PARENT_TO_BED[typeId]) || []).forEach(r => {
        const s = splitDoubleHalf(r);
        if (s && s.base.toLowerCase() === room.toLowerCase()) toAdd.add(r);
      });
    } else if (ROOM_BED_TO_PARENT[typeId]) {
      const split = splitDoubleHalf(room);
      if (!split) return;
      const parentRooms = roomsById.get(ROOM_BED_TO_PARENT[typeId]) || [];
      if (parentRooms.includes(split.base)) toAdd.add(split.base);
      (roomsById.get(typeId) || []).forEach(r => {
        const s = splitDoubleHalf(r);
        if (s && s.base.toLowerCase() === split.base.toLowerCase()) toAdd.add(r);
      });
    }
    if (VILLA_TO_SUBTYPES[typeId]) {
      VILLA_TO_SUBTYPES[typeId].forEach(subId => (roomsById.get(subId) || []).forEach(r => toAdd.add(r)));
    } else {
      for (const [villaId, subIds] of Object.entries(VILLA_TO_SUBTYPES)) {
        if (subIds.includes(typeId)) (roomsById.get(villaId) || []).forEach(r => toAdd.add(r));
      }
    }
  });
  toAdd.forEach(r => blockedSet.add(r));
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
  if (source === 'Extra Night' && inExtraNightBlackout(checkIn, checkOut)) {
    return jsonErr(400, 'Extra Night is not available Dec 20 – Jan 15 — the property doesn\'t book during that window.');
  }

  const supaHdrs = {
    'apikey':        supaKey,
    'Authorization': `Bearer ${supaKey}`,
    'Content-Type':  'application/json',
  };

  // Fetch room type + booking engine settings in parallel
  const [rtRes, settRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/room_types?id=eq.${encodeURIComponent(roomTypeId)}&select=id,name,be_price_single,be_price_single_extra_night,be_price_single_extra_night_low,be_price_double,price_single_high,price_single_low,price_double_high`, { headers: supaHdrs }),
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
  // sees on the room card matches what they're actually charged. Extra Night has
  // its OWN separately-adjustable rate (be_price_single_extra_night), falling back
  // to the Escape rate when not explicitly set — "derived from Escape" until
  // someone overrides it (Jorge's ask 2026-09-23). Extra Night also gets its own
  // May–Sep LOW season rate (be_price_single_extra_night_low) — same low-season
  // window retreats use (isLow/isLowSeason, May 1 – Sep 30) — Jorge's call
  // 2026-10-08, falling back to the regular (high-season) Extra Night rate when
  // not set.
  const isExtraNight = source === 'Extra Night';
  const extraNightRate = isLow(checkIn)
    ? (rt.be_price_single_extra_night_low ?? rt.be_price_single_extra_night ?? rt.be_price_single)
    : (rt.be_price_single_extra_night ?? rt.be_price_single);
  const baseRate = (isExtraNight ? extraNightRate : rt.be_price_single)
    ?? (isLow(checkIn) ? (rt.price_single_low ?? rt.price_single_high) : rt.price_single_high) ?? 0;

  const ciDate    = new Date(checkIn + 'T12:00:00');
  const month     = ciDate.getMonth() + 1;
  const dow       = ciDate.getDay();
  const isWeekend = dow === 0 || dow === 5 || dow === 6;
  const seasonalPct = Number(seasonalAdj[String(month)] ?? 0);
  const weekendMult = isWeekend && weekendPremium ? (1 + weekendPremium / 100) : 1;
  // Extra Night is a flat rate, no seasonal/weekend surcharge — Jorge's call
  // 2026-10-08: those adjustments are an Escape-only thing. Extra Night pricing
  // used to be static (per Darlene 2026-09-03), briefly got the same dynamic
  // adjustment as Escape (Jorge's 2026-09-23 ask), and is reverted to static
  // here — real case: Elizabeth Wirick quoted $470.69 for one Simple n Small
  // night that should've been the plain $295 + tax.
  const rate        = isExtraNight ? Math.round(baseRate) : Math.round(baseRate * (1 + seasonalPct / 100) * weekendMult);
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

  // Pick a physical room NOW and hold it for HOLD_TTL_MIN minutes -- before this, a room was
  // only ever assigned AFTER payment succeeded (stripe-webhook.js), with zero check at charge
  // time, so two guests paying within the same few minutes for the last room of a type could
  // both be charged, and the second one got no room at all with nothing but a console.warn (no
  // staff alert). Jorge's ask 2026-10-14: apply the same hold-while-paying fix as retreat-booking.
  const rtAllRes = await fetch(`${SUPABASE_URL}/rest/v1/room_types?id=eq.${encodeURIComponent(roomTypeId)}&select=rooms`, { headers: supaHdrs });
  const [rtAll] = rtAllRes.ok ? await rtAllRes.json() : [{}];
  const physicalRooms = rtAll?.rooms ?? [];
  if (!physicalRooms.length) return jsonErr(400, 'That room type has no physical rooms configured.');

  const [brOccRes, bkOccRes, allTypesRes, heldRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/booking_requests?room=not.is.null&check_in=lt.${encodeURIComponent(checkOut)}&check_out=gt.${encodeURIComponent(checkIn)}&status=not.in.(declined,cancelled)&select=room`, { headers: supaHdrs }),
    fetch(`${SUPABASE_URL}/rest/v1/bookings?start_date=lt.${encodeURIComponent(checkOut)}&end_date=gt.${encodeURIComponent(checkIn)}&status=neq.cancelled&select=blocked_rooms`, { headers: supaHdrs }),
    fetch(`${SUPABASE_URL}/rest/v1/room_types?select=id,rooms`, { headers: supaHdrs }),
    fetch(`${SUPABASE_URL}/rest/v1/eng_holds?check_in=lt.${encodeURIComponent(checkOut)}&check_out=gt.${encodeURIComponent(checkIn)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=room`, { headers: supaHdrs }),
  ]);
  const occupied = new Set((brOccRes.ok ? await brOccRes.json() : []).map(r => r.room));
  (bkOccRes.ok ? await bkOccRes.json() : []).forEach(b => (b.blocked_rooms ?? []).forEach(r => occupied.add(r)));
  const allTypes = allTypesRes.ok ? await allTypesRes.json() : [];
  propagateSiblingBlocks(occupied, allTypes);
  (heldRes.ok ? await heldRes.json() : []).forEach(h => occupied.add(h.room));

  const assignedRoom = physicalRooms.find(r => !occupied.has(r)) ?? null;
  if (!assignedRoom) return jsonErr(409, 'Sorry, that room type just sold out. Please choose a different room or dates.');

  const engHoldId = 'eh_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const expiresAt = new Date(Date.now() + 20 * 60000).toISOString();
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/eng_holds`, {
      method: 'POST', headers: { ...supaHdrs, Prefer: 'return=minimal' },
      body: JSON.stringify({ id: engHoldId, hold_id: engHoldId, room: assignedRoom, check_in: checkIn, check_out: checkOut, expires_at: expiresAt }),
    });
  } catch (holdErr) { console.error('[stripe] could not place room hold (non-fatal):', holdErr.message); }

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
    'metadata[rate]':            String(rate),
    'metadata[assignedRoom]':    assignedRoom,
    'metadata[engHoldId]':       engHoldId,
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
  if (pi.error) {
    fetch(`${SUPABASE_URL}/rest/v1/eng_holds?id=eq.${encodeURIComponent(engHoldId)}`, { method: 'DELETE', headers: supaHdrs }).catch(() => {});
    return jsonErr(400, pi.error.message ?? 'Stripe error');
  }

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
