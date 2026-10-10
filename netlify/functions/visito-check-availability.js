'use strict';

// Visito AI "Tool" — lets Lana check Room Only availability/pricing during a
// WhatsApp conversation. Registered via Visito's M2M API (POST /m2m/v1/tools)
// with endpoint.url pointing here; Visito POSTs {arguments, meta} and expects
// a flat JSON object back (see https://docs.visitoai.com/api-docs/conversational-ai-api).
//
// Reuses the exact same availability/pricing source as the public booking
// engine (get-availability.js / stripe.js) — same room types, same be_enabled
// filter, same seasonal/weekend pricing — so what Lana quotes a guest always
// matches what book.html would show and what they'd actually be charged.
//
// Scope: Room Only (Escape / Extra Nights) ONLY — retreat group bookings are
// out of scope for autonomous AI booking (Jorge's decision 2026-09-22: too
// much risk of a costly mistake — duplicate room blocks, wrong contract
// terms — without a human reviewing).

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

function isLow(dateStr) {
  const m = new Date(dateStr + 'T12:00:00').getMonth() + 1;
  return m >= 5 && m <= 9;
}

// Extra Night only -- Jorge's call 2026-10-08: no one can book an extra
// night overlapping the Dec 20 – Jan 15 holiday window, same as retreats
// never book then. Same logic as stripe.js's inExtraNightBlackout.
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
// other(s). Real double-booking gap confirmed 2026-10-10 (Jorge's report):
// this (and get-availability.js) never propagated the block, unlike the
// admin Room Calendar's rsComputeAvailability.
//
// Sibling resolution is constrained to the known parent-type <-> bed-type
// pairs (rt6<->bd1, rt7<->bd2, rt8<->bd3, rt9<->bd4) -- NOT a blind
// same-leading-digits match. Rooms like "13B"/"5B"/"2B"/"3B" are standalone
// single rooms in UNRELATED room types (rt1/rt2/rt3/rt4) that happen to
// share a numeric prefix with a completely different physical room's bed
// pair ("13"/"13a"/"13b" in rt7/bd2) -- confirmed via live room_types data
// 2026-10-10. Matching on string pattern alone would wrongly link them.
const ROOM_PARENT_TO_BED = { rt6: 'bd1', rt7: 'bd2', rt8: 'bd3', rt9: 'bd4' };
const ROOM_BED_TO_PARENT = { bd1: 'rt6', bd2: 'rt7', bd3: 'rt8', bd4: 'rt9' };
// A second, different kind of derived relationship (Jorge's confirmation
// 2026-10-10): "Casa Master" and "Casa Shanti" are each a single whole-villa
// room type that, when rented exclusively, encompasses SEVERAL OTHER,
// otherwise-independent room types (not a same-room bed-split) -- Casa
// Master = Casa King Downstairs + Casa Grande Up King + Casa Grande 2 Queen
// Downstairs + Casa Grande Upstairs Individual + Casa Grande Up Shared 2
// Queen; Casa Shanti = Shanti King + Shanti 2 Bed. Booking the whole villa
// must block every room in every listed sub-type, and booking any room in
// any sub-type must block the whole-villa option for those dates.
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
// roomTypes: [{id, rooms}] for every room type, unfiltered.
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
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const expectedToken = process.env.VISITO_TOOL_SECRET;
  if (!expectedToken) return jsonErr(500, 'Server config error');
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  if (authHeader.replace(/^Bearer\s+/i, '').trim() !== expectedToken) return jsonErr(401, 'Unauthorized');

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { checkIn, checkOut, adults, discountCode, stayType } = payload.arguments || {};
  // Which arguments Lana actually sent (names only, plus the discount code) --
  // Jorge's test 2026-09-30: a discount code wasn't applied and Lana handed
  // off to staff; this shows whether the Visito tool schema even has
  // discountCode.
  console.log('[visito-check-availability] args:', Object.keys(payload.arguments || {}).join(','), '| discountCode:', discountCode || '(none)');
  if (!checkIn || !checkOut) {
    return ok({ success: false, message: 'Necesito la fecha de entrada y salida (checkIn, checkOut) para revisar disponibilidad.' });
  }
  if (checkIn >= checkOut) {
    return ok({ success: false, message: 'La fecha de salida debe ser después de la de entrada.' });
  }
  // "escape" = the general Book a Stay page (book.html); "extra_night" = a
  // night added right before/after an existing group retreat (extra-nights.html).
  // Different room-type pool (be_extra_nights, not be_enabled) AND its own
  // separately-adjustable rate (be_price_single_extra_night / _low) — a flat
  // rate, no Escape seasonal/weekend surcharge (Jorge's call 2026-10-08,
  // reverting his own 2026-09-23 ask for parity with Escape's dynamic pricing).
  const isExtraNight = stayType === 'extra_night';
  if (isExtraNight && inExtraNightBlackout(checkIn, checkOut)) {
    return ok({ success: false, message: 'Extra Night no está disponible del 20 de diciembre al 15 de enero — la propiedad no reserva noches extra en esa ventana.' });
  }

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  try {
    const rtFilter = isExtraNight ? 'be_extra_nights=eq.true' : 'be_enabled=eq.true';
    const [bkRes, rtRes, settingsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/bookings?select=id,blocked_rooms&status=neq.cancelled&start_date=lt.${checkOut}&end_date=gt.${checkIn}`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/room_types?${rtFilter}&select=id,name,rooms,max_occ,be_price_single,be_price_single_extra_night,be_price_single_extra_night_low,be_price_double,price_single_high,price_single_low,be_description`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/booking_engine_settings?id=eq.1`, { headers: hdrs }),
    ]);
    if (!bkRes.ok || !rtRes.ok) throw new Error('availability fetch failed');

    const [bookings, roomTypes, settingsArr] = await Promise.all([
      bkRes.json(), rtRes.json(), settingsRes.ok ? settingsRes.json() : Promise.resolve([{}]),
    ]);
    const settings = settingsArr[0] || {};

    const blockedRooms = new Set((bookings || []).flatMap(bk => bk.blocked_rooms || []));
    const overlappingIds = (bookings || []).map(bk => bk.id).filter(Boolean);
    if (overlappingIds.length) {
      const regRes = await fetch(`${SUPABASE_URL}/rest/v1/registrations?select=room,guests&booking_id=in.(${overlappingIds.join(',')})`, { headers: hdrs });
      if (regRes.ok) {
        const regs = await regRes.json();
        (regs || []).forEach(r => { if (r.room && (r.guests || []).some(g => g && g.name)) blockedRooms.add(r.room); });
      }
    }

    const allTypesRes = await fetch(`${SUPABASE_URL}/rest/v1/room_types?select=id,rooms`, { headers: hdrs });
    const allTypes = allTypesRes.ok ? await allTypesRes.json() : [];
    propagateSiblingBlocks(blockedRooms, allTypes);

    const nights = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
    const numAdults = Math.max(1, parseInt(adults) || 1);
    const taxPct = parseFloat(settings.taxes_pct) || 0;
    const seasonalAdj = settings.seasonal_adjustments || {};
    const weekendPremium = parseFloat(settings.weekend_premium) || 0;
    const ciDate = new Date(checkIn + 'T12:00:00');
    const month = ciDate.getMonth() + 1;
    const dow = ciDate.getDay();
    const isWeekend = dow === 0 || dow === 5 || dow === 6;
    const seasonalPct = Number(seasonalAdj[String(month)] || 0);
    const weekendMult = (isWeekend && weekendPremium) ? (1 + weekendPremium / 100) : 1;

    // Discount code — same validation as stripe.js (book.html's checkout). Only
    // reported back if it actually applies, so Lana never quotes a discount that
    // create_reservation would then reject.
    let dc = null, validatedCode = null;
    if (discountCode) {
      try {
        const dcRes = await fetch(
          `${SUPABASE_URL}/rest/v1/be_discount_codes?code=eq.${encodeURIComponent(String(discountCode).toUpperCase().trim())}&active=eq.true&select=*`,
          { headers: hdrs }
        );
        if (dcRes.ok) {
          const dcRows = await dcRes.json();
          const cand = dcRows[0];
          const pageKey = isExtraNight ? 'extra_nights' : 'escape';
          const appliesHere = !cand?.applies_to || cand.applies_to === 'all' || cand.applies_to === pageKey;
          const inBlackout = cand?.blackout_start && cand?.blackout_end && checkIn < cand.blackout_end && checkOut > cand.blackout_start;
          if (cand && appliesHere && !inBlackout
                 && !(cand.expires_at && new Date(cand.expires_at + 'T23:59:59') < new Date())
                 && !(cand.max_uses != null && cand.used_count >= cand.max_uses)) {
            dc = cand; validatedCode = cand.code;
          }
        }
      } catch (_) { /* non-fatal — quote without discount */ }
    }

    const options = (roomTypes || [])
      .map(rt => {
        const rooms = rt.rooms || [];
        const availableCount = rooms.filter(r => !blockedRooms.has(r)).length;
        if (availableCount <= 0) return null;
        if (rt.max_occ && numAdults > rt.max_occ) return null;
        // be_price_single is a FLAT room rate (not per-person) — same regardless of
        // adults count. be_price_double is NOT a price at all despite the name (it's
        // an occupancy-count field elsewhere in the schema) — matches stripe.js/
        // book.html exactly (confirmed real incident 2026-09-22: using be_price_double
        // here made create_reservation compute $0 for any room type where it was null).
        // Extra Night prefers its own rate (be_price_single_extra_night), falling
        // back to the Escape rate when not explicitly set — and its own May–Sep
        // LOW season rate (be_price_single_extra_night_low), same low-season
        // window retreats use (Jorge's call 2026-10-08).
        const extraNightRate = isLow(checkIn)
          ? (rt.be_price_single_extra_night_low ?? rt.be_price_single_extra_night ?? rt.be_price_single)
          : (rt.be_price_single_extra_night ?? rt.be_price_single);
        const baseRate = (isExtraNight ? extraNightRate : rt.be_price_single)
          ?? (isLow(checkIn) ? (rt.price_single_low ?? rt.price_single_high) : rt.price_single_high) ?? 0;
        // Extra Night is a flat rate, no seasonal/weekend surcharge — Jorge's
        // call 2026-10-08: those adjustments are an Escape-only thing. (Briefly
        // applied to Extra Night too per his 2026-09-23 ask; reverted here —
        // real case: Elizabeth Wirick quoted $470.69 for one Simple n Small
        // night that should've been the plain $295 + tax.)
        const rate = isExtraNight ? Math.round(baseRate) : Math.round(baseRate * (1 + seasonalPct / 100) * weekendMult);
        const subtotal = rate * nights;
        const discountAmount = dc ? (dc.type === 'pct' ? Math.round(subtotal * dc.value) / 100 : Math.min(dc.value, subtotal)) : 0;
        const tax = Math.round((subtotal - discountAmount) * taxPct) / 100;
        return {
          roomTypeId: rt.id,
          roomTypeName: rt.name,
          description: rt.be_description || null,
          maxOccupancy: rt.max_occ || null,
          availableRooms: availableCount,
          ratePerNight: rate,
          nights,
          subtotal,
          discountCode: validatedCode,
          discountAmount,
          taxes: tax,
          total: +(subtotal - discountAmount + tax).toFixed(2),
        };
      })
      .filter(Boolean);

    if (!options.length) {
      return ok({ success: false, message: `No hay habitaciones disponibles del ${checkIn} al ${checkOut} para ${numAdults} adulto(s)${isExtraNight ? ' (Extra Night)' : ''}.` });
    }

    return ok({
      success: true, stayType: isExtraNight ? 'extra_night' : 'escape', checkIn, checkOut, nights, adults: numAdults, options,
      ...(discountCode ? { discountCodeApplied: !!validatedCode, discountCode: validatedCode || null } : {}),
    });
  } catch (err) {
    console.error('[visito-check-availability]', err.message);
    return jsonErr(500, err.message);
  }
};

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: msg }) }; }
