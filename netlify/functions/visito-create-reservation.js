'use strict';

// Visito AI "Tool" — lets Lana create a Room Only reservation (Escape / Extra
// Nights) directly from a WhatsApp conversation, with ZERO staff involvement.
//
// Design: reuses the EXACT same pricing computation as stripe.js (the
// function book.html's own checkout already uses) so a price Lana quotes can
// never drift from what a human guest booking directly would pay. Instead of
// a raw PaymentIntent (meant for an embedded card form Lana can't render),
// this creates a Stripe Checkout Session — a hosted, guest-friendly payment
// page — with the SAME metadata shape on payment_intent_data that
// stripe-webhook.js already expects. That means once the guest pays, the
// existing stripe-webhook.js handler creates the real booking_requests row,
// auto-assigns a room, pushes it to Cloudbeds, and emails the confirmation —
// all already-working, already-tested code, completely unchanged.
//
// Scope: Room Only ONLY (Jorge's decision 2026-09-22) — group retreat
// bookings are NOT created by this tool.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const STRIPE_API = 'https://api.stripe.com/v1';

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

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!stripeKey) return jsonErr(500, 'Stripe not configured');
  if (!supaKey) return jsonErr(500, 'Server config error');

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { roomTypeId, checkIn, checkOut, adults, firstName, lastName, email, phone, notes } = payload.arguments || {};
  const missing = ['roomTypeId', 'checkIn', 'checkOut', 'firstName', 'lastName', 'email']
    .filter(f => !({ roomTypeId, checkIn, checkOut, firstName, lastName, email }[f]));
  if (missing.length) {
    return ok({ success: false, message: `Me faltan estos datos para crear la reserva: ${missing.join(', ')}.` });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return ok({ success: false, message: 'El correo no parece válido — pídele al huésped que lo confirme.' });
  }
  if (checkIn >= checkOut) {
    return ok({ success: false, message: 'La fecha de salida debe ser después de la de entrada.' });
  }

  const supaHdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  try {
    // Re-verify availability server-side right before charging — Lana may be
    // working from a check_availability answer that's a few minutes stale.
    const [bkRes, rtRes, settRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/bookings?select=id,blocked_rooms&status=neq.cancelled&start_date=lt.${checkOut}&end_date=gt.${checkIn}`, { headers: supaHdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/room_types?id=eq.${encodeURIComponent(roomTypeId)}&select=id,name,rooms,max_occ,be_price_single,be_price_double,price_single_high,price_single_low`, { headers: supaHdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/booking_engine_settings?id=eq.1`, { headers: supaHdrs }),
    ]);
    if (!rtRes.ok) throw new Error('room_types fetch failed');
    const [rt] = await rtRes.json();
    if (!rt) return ok({ success: false, message: 'No encontré ese tipo de habitación — vuelve a llamar a check_availability para obtener un roomTypeId válido.' });

    const bookings = bkRes.ok ? await bkRes.json() : [];
    const blockedRooms = new Set((bookings || []).flatMap(bk => bk.blocked_rooms || []));
    const overlappingIds = (bookings || []).map(bk => bk.id).filter(Boolean);
    if (overlappingIds.length) {
      const regRes = await fetch(`${SUPABASE_URL}/rest/v1/registrations?select=room,guests&booking_id=in.(${overlappingIds.join(',')})`, { headers: supaHdrs });
      if (regRes.ok) {
        const regs = await regRes.json();
        (regs || []).forEach(r => { if (r.room && (r.guests || []).some(g => g && g.name)) blockedRooms.add(r.room); });
      }
    }
    const availableCount = (rt.rooms || []).filter(r => !blockedRooms.has(r)).length;
    if (availableCount <= 0) {
      return ok({ success: false, message: `Justo se acaba de agotar la disponibilidad de ${rt.name} para esas fechas — pídele al huésped otras fechas o tipo de habitación.` });
    }

    let taxPct = 0, seasonalAdj = {}, weekendPremium = 0;
    if (settRes.ok) {
      const [s] = await settRes.json();
      if (s) {
        taxPct = parseFloat(s.taxes_pct) || 0;
        seasonalAdj = s.seasonal_adjustments || {};
        weekendPremium = parseFloat(s.weekend_premium) || 0;
      }
    }

    const numAdults = Math.max(1, parseInt(adults) || 1);
    const nights = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
    const baseRate = numAdults >= 2
      ? (rt.be_price_double ?? rt.be_price_single ?? 0)
      : (rt.be_price_single ?? (isLow(checkIn) ? (rt.price_single_low ?? rt.price_single_high) : rt.price_single_high) ?? 0);
    const ciDate = new Date(checkIn + 'T12:00:00');
    const month = ciDate.getMonth() + 1;
    const dow = ciDate.getDay();
    const isWeekend = dow === 0 || dow === 5 || dow === 6;
    const seasonalPct = Number(seasonalAdj[String(month)] || 0);
    const weekendMult = (isWeekend && weekendPremium) ? (1 + weekendPremium / 100) : 1;
    const rate = Math.round(baseRate * (1 + seasonalPct / 100) * weekendMult);
    const subtotal = rate * nights;
    const taxAmt = Math.round(subtotal * taxPct) / 100;
    const totalUSD = subtotal + taxAmt;
    const amountCents = Math.round(totalUSD * 100);
    if (amountCents < 50) return ok({ success: false, message: 'El monto calculado es demasiado bajo para procesar el pago.' });

    const siteUrl = process.env.URL || 'https://amansala-staging.netlify.app';
    const meta = {
      roomTypeId: rt.id,
      roomTypeName: rt.name,
      checkIn, checkOut,
      adults: String(numAdults),
      firstName: firstName.slice(0, 100),
      lastName: lastName.slice(0, 100),
      email: email.slice(0, 200),
      phone: (phone || '').slice(0, 50),
      notes: (notes || '').slice(0, 400),
      source: 'Visito AI',
    };

    const params = new URLSearchParams({
      mode: 'payment',
      success_url: `${siteUrl}/?visito_booking=success`,
      cancel_url: `${siteUrl}/?visito_booking=cancelled`,
      customer_email: email,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `Amansala Tulum · ${rt.name} · ${checkIn} – ${checkOut}`.slice(0, 250),
      'line_items[0][price_data][unit_amount]': String(amountCents),
      'line_items[0][quantity]': '1',
    });
    Object.entries(meta).forEach(([k, v]) => params.append(`payment_intent_data[metadata][${k}]`, v));

    const csRes = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
      body: params.toString(),
    });
    const cs = await csRes.json();
    if (cs.error) return jsonErr(400, cs.error.message || 'Stripe error');

    return ok({
      success: true,
      roomTypeName: rt.name,
      checkIn, checkOut, nights, adults: numAdults,
      ratePerNight: rate,
      total: totalUSD,
      paymentUrl: cs.url,
      message: `Reserva pre-creada — envíale este link de pago al huésped para confirmarla: ${cs.url}`,
    });
  } catch (err) {
    console.error('[visito-create-reservation]', err.message);
    return jsonErr(500, err.message);
  }
};

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: msg }) }; }
