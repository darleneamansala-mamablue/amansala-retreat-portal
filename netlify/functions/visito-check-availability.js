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

  const { checkIn, checkOut, adults } = payload.arguments || {};
  if (!checkIn || !checkOut) {
    return ok({ success: false, message: 'Necesito la fecha de entrada y salida (checkIn, checkOut) para revisar disponibilidad.' });
  }
  if (checkIn >= checkOut) {
    return ok({ success: false, message: 'La fecha de salida debe ser después de la de entrada.' });
  }

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  try {
    const [bkRes, rtRes, settingsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/bookings?select=id,blocked_rooms&status=neq.cancelled&start_date=lt.${checkOut}&end_date=gt.${checkIn}`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/room_types?be_enabled=eq.true&select=id,name,rooms,max_occ,be_price_single,be_price_double,price_single_high,price_single_low,be_description`, { headers: hdrs }),
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

    const options = (roomTypes || [])
      .map(rt => {
        const rooms = rt.rooms || [];
        const availableCount = rooms.filter(r => !blockedRooms.has(r)).length;
        if (availableCount <= 0) return null;
        if (rt.max_occ && numAdults > rt.max_occ) return null;
        const baseRate = numAdults >= 2
          ? (rt.be_price_double ?? rt.be_price_single ?? 0)
          : (rt.be_price_single ?? (isLow(checkIn) ? (rt.price_single_low ?? rt.price_single_high) : rt.price_single_high) ?? 0);
        const rate = Math.round(baseRate * (1 + seasonalPct / 100) * weekendMult);
        const subtotal = rate * nights;
        const tax = Math.round(subtotal * taxPct) / 100;
        return {
          roomTypeId: rt.id,
          roomTypeName: rt.name,
          description: rt.be_description || null,
          maxOccupancy: rt.max_occ || null,
          availableRooms: availableCount,
          ratePerNight: rate,
          nights,
          subtotal,
          taxes: tax,
          total: +(subtotal + tax).toFixed(2),
        };
      })
      .filter(Boolean);

    if (!options.length) {
      return ok({ success: false, message: `No hay habitaciones disponibles del ${checkIn} al ${checkOut} para ${numAdults} adulto(s).` });
    }

    return ok({ success: true, checkIn, checkOut, nights, adults: numAdults, options });
  } catch (err) {
    console.error('[visito-check-availability]', err.message);
    return jsonErr(500, err.message);
  }
};

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: msg }) }; }
