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

  const { roomTypeId, checkIn, checkOut, adults, firstName, lastName, email, phone, notes, discountCode } = payload.arguments || {};
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
    // be_price_single is a FLAT room rate (not per-person) — same regardless of
    // adults count. be_price_double is NOT a price at all despite the name (it's
    // an occupancy-count field elsewhere in the schema) — matches stripe.js/
    // book.html exactly (confirmed real incident 2026-09-22: using be_price_double
    // here made this compute $0 for any room type where it was null, tripping the
    // "amount too small" guard and failing the reservation).
    const baseRate = rt.be_price_single ?? (isLow(checkIn) ? (rt.price_single_low ?? rt.price_single_high) : rt.price_single_high) ?? 0;
    const ciDate = new Date(checkIn + 'T12:00:00');
    const month = ciDate.getMonth() + 1;
    const dow = ciDate.getDay();
    const isWeekend = dow === 0 || dow === 5 || dow === 6;
    const seasonalPct = Number(seasonalAdj[String(month)] || 0);
    const weekendMult = (isWeekend && weekendPremium) ? (1 + weekendPremium / 100) : 1;
    const rate = Math.round(baseRate * (1 + seasonalPct / 100) * weekendMult);
    const subtotal = rate * nights;

    // Discount code — same validation as stripe.js (book.html's checkout), so a
    // code Lana applies behaves identically to one a guest enters directly.
    let discountAmount = 0, validatedCode = null;
    if (discountCode) {
      try {
        const dcRes = await fetch(
          `${SUPABASE_URL}/rest/v1/be_discount_codes?code=eq.${encodeURIComponent(String(discountCode).toUpperCase().trim())}&active=eq.true&select=*`,
          { headers: supaHdrs }
        );
        if (dcRes.ok) {
          const dcRows = await dcRes.json();
          const dc = dcRows[0];
          const appliesHere = !dc?.applies_to || dc.applies_to === 'all' || dc.applies_to === 'escape';
          const inBlackout = dc?.blackout_start && dc?.blackout_end && checkIn < dc.blackout_end && checkOut > dc.blackout_start;
          if (dc && appliesHere && !inBlackout
                 && !(dc.expires_at && new Date(dc.expires_at + 'T23:59:59') < new Date())
                 && !(dc.max_uses != null && dc.used_count >= dc.max_uses)) {
            validatedCode = dc.code;
            discountAmount = dc.type === 'pct' ? Math.round(subtotal * dc.value) / 100 : Math.min(dc.value, subtotal);
          }
        }
      } catch (_) { /* non-fatal — proceed without discount */ }
      if (!validatedCode) {
        return ok({ success: false, message: `El código "${discountCode}" no es válido, ya expiró, o no aplica para estas fechas — pregúntale al huésped si quiere continuar sin descuento.` });
      }
    }

    const taxAmt = Math.round((subtotal - discountAmount) * taxPct) / 100;
    const totalUSD = subtotal - discountAmount + taxAmt;
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
      discountCode: (validatedCode || '').slice(0, 50),
      discountAmount: String(discountAmount),
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

    // Stripe Checkout URLs are ~600 characters — unusable pasted into
    // WhatsApp — so hand Lana a short /pay/<id> link instead (resolved by
    // pay-redirect.js) that 302s to the real cs.url (Jorge's ask 2026-09-23).
    // Falls back to the raw Stripe URL if the shortlink insert fails for any
    // reason — a working ugly link beats a broken pretty one.
    let paymentUrl = cs.url;
    try {
      const shortId = Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
      const slRes = await fetch(`${SUPABASE_URL}/rest/v1/payment_shortlinks`, {
        method: 'POST',
        headers: { ...supaHdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ id: shortId, target_url: cs.url }),
      });
      if (slRes.ok) paymentUrl = `https://amansalaportal.com/pay/${shortId}`;
    } catch (slErr) {
      console.warn('[visito-create-reservation] shortlink insert failed (non-fatal):', slErr.message);
    }

    // Also email the payment link directly to the guest — Lana pastes it in
    // WhatsApp too, but a guest reading it later (or forwarding it) should
    // have it in their inbox as well (Jorge's ask 2026-09-22).
    let emailed = false;
    try {
      const emailHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f0ea;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:#1a2332;padding:24px 32px;text-align:center">
    <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:1px">AMANSALA</span>
    <span style="color:rgba(255,255,255,.5);font-size:11px;display:block;letter-spacing:2px;margin-top:2px">ECO-CHIC RESORT + RETREAT</span>
  </div>
  <div style="padding:32px 32px 24px">
    <p style="font-size:15px;color:#1a2332">Hi ${firstName},</p>
    <p style="color:#4a4a4a;line-height:1.7">Thanks for reaching out! Here's your reservation summary — click below to complete your payment and confirm it.</p>
    <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:14px 18px;border-radius:6px;margin:20px 0">
      <strong style="color:#1a2332">${rt.name}</strong><br>
      <span style="color:#4a4a4a">${checkIn} – ${checkOut} · ${nights} night${nights !== 1 ? 's' : ''} · ${numAdults} adult${numAdults !== 1 ? 's' : ''}</span><br>
      <span style="color:#4a4a4a;font-weight:700">Total: $${totalUSD.toFixed(2)} USD</span>
    </div>
    <div style="text-align:center;margin:28px 0"><a href="${paymentUrl}" style="background:#0e9494;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Complete Payment</a></div>
    <p style="color:#6b7280;font-size:12px;text-align:center">If the button doesn't work, copy this link into your browser:<br>${paymentUrl}</p>
    <p style="color:#4a4a4a">Warm regards,<br><strong>Amansala Team</strong></p>
  </div>
  <div style="background:#f5f0ea;padding:16px 32px;text-align:center;font-size:11px;color:#8a7e74">
    Amansala Eco-Chic Resort &amp; Retreat · Tulum, Mexico · <a href="mailto:bookings@amansala.com" style="color:#0e9494">bookings@amansala.com</a>
  </div>
</div></body></html>`;
      const emailRes = await fetch(`${siteUrl}/.netlify/functions/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, subject: `Complete Your Reservation — ${rt.name}`, html: emailHtml, replyTo: 'bookings@amansala.com' }),
      });
      emailed = emailRes.ok;
    } catch (emailErr) {
      console.warn('[visito-create-reservation] email failed (non-fatal):', emailErr.message);
    }

    return ok({
      success: true,
      roomTypeName: rt.name,
      checkIn, checkOut, nights, adults: numAdults,
      ratePerNight: rate,
      discountCode: validatedCode,
      discountAmount,
      total: totalUSD,
      paymentUrl,
      emailedToGuest: emailed,
      message: emailed
        ? `Reserva pre-creada — comparte este link de pago con el huésped para confirmarla (también se le mandó por correo a ${email}): ${paymentUrl}`
        : `Reserva pre-creada — comparte este link de pago con el huésped para confirmarla: ${paymentUrl} (no se pudo mandar el correo automático, avísale que revise spam o mándaselo tú por WhatsApp)`,
    });
  } catch (err) {
    console.error('[visito-create-reservation]', err.message);
    return jsonErr(500, err.message);
  }
};

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: msg }) }; }
