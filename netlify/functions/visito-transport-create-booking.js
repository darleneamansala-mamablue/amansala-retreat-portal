'use strict';

// Visito AI "Tool" — lets Lana book a private airport transfer end to end, mirroring
// visito-spa-create-booking.js's hotel/offsite split exactly (Jorge's ask 2026-10-15,
// "quiero hacer todo de una vez" after the spa tax fix):
//
// - hotel guest: Lana just takes down the flight info (same fields the guest's own
//   transport-form.html submission would have) and saves it to the SAME `transport` table
//   that fills (arrival/departure date, time, airport, flight number). Nothing is charged
//   here -- auto-charge-transport.js already runs nightly and bills the guest's room folio
//   automatically the night before, at the real per-person rate below, same as it always has.
// - offsite guest (not staying at the hotel): creates a real Stripe Checkout Session
//   (base + a separate 13% tax line item, same pattern as spa) and hands back a payment
//   link, instead of Lana quoting a made-up number with no way to actually collect it.
//
// Same RATES table as auto-charge-transport.js / visito-transport-check-price.js
// (duplicated here per this repo's per-function convention).
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const STRIPE_API = 'https://api.stripe.com/v1';
const RATES = {
  cancun: [195, 100, 80, 65, 55, 45],
  tulum:  [145,  80, 65, 55, 45, 40],
};
function autoRate(airport, pax) {
  const tbl = RATES[airport];
  if (!tbl) return null;
  return tbl[Math.min(Math.max(pax, 1) - 1, tbl.length - 1)];
}

function normName(s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
// Same matching shape as visito-spa-create-booking.js's findGuestReg/findGuestBooking --
// prefer an exact room-number match, else the lone name match if there's only one.
function findGuestReg(regs, clientName, roomNumber) {
  const key = normName(clientName);
  if (!key) return null;
  const rn = normName(roomNumber);
  let fallback = null;
  for (const reg of regs) {
    const idx = (reg.guests || []).findIndex(g => normName(g.name) === key);
    if (idx >= 0) {
      const match = { reg, guest: reg.guests[idx] };
      if (rn && normName(reg.room) === rn) return match;
      if (!fallback) fallback = match;
    }
  }
  return fallback;
}
function findGuestBooking(bookings, clientName, roomNumber) {
  const key = normName(clientName);
  if (!key) return null;
  const rn = normName(roomNumber);
  let fallback = null;
  for (const bk of bookings) {
    if (bk.booking_type !== 'room_only') continue;
    if (normName(bk.leader_name) !== key) continue;
    const rooms = (bk.blocked_rooms || []).map(normName);
    if (rn && rooms.includes(rn)) return { bk };
    if (!fallback) fallback = { bk };
  }
  return fallback;
}

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: msg }) }; }

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

  const {
    firstName, lastName, email, phone, guestType, roomNumber,
    airport, pax, direction, date, time, flightNumber, notes,
  } = payload.arguments || {};

  const clientName = `${firstName || ''} ${lastName || ''}`.trim();
  const ap = String(airport || '').trim().toLowerCase();
  const n = Math.round(Number(pax)) || 1;
  const dir = direction === 'departure' ? 'departure' : 'arrival';

  const missing = ['firstName', 'lastName', 'guestType', 'airport', 'date']
    .filter(f => !({ firstName, lastName, guestType, airport, date })[f]);
  if (missing.length) return ok({ success: false, message: `Me faltan estos datos: ${missing.join(', ')}.` });
  if (!RATES[ap]) return ok({ success: false, message: 'El aeropuerto debe ser "cancun" o "tulum".' });
  if (guestType !== 'hotel' && guestType !== 'offsite') return ok({ success: false, message: 'guestType debe ser "hotel" u "offsite".' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ok({ success: false, message: 'date debe tener formato YYYY-MM-DD.' });

  const isHotel = guestType === 'hotel';
  if (!isHotel && !email) return ok({ success: false, message: 'Para un visitante necesito su correo para mandarle el link de pago.' });
  if (!isHotel && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ok({ success: false, message: 'El correo no parece válido.' });

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };
  const perPersonUSD = autoRate(ap, n);
  const subtotalUSD = Math.round(perPersonUSD * n * 100) / 100;
  const taxAmount = Math.round(subtotalUSD * 0.13 * 100) / 100;
  const totalUSD = Math.round((subtotalUSD + taxAmount) * 100) / 100;
  const priceDisplay = `$${perPersonUSD} USD${n > 1 ? ` por persona ($${subtotalUSD.toFixed(2)} USD subtotal)` : ''} + 13% tax`;

  try {
    if (isHotel) {
      // Same guest-matching shape as visito-spa-create-booking.js: an active stay today's
      // date doesn't need to fall within (a transfer is usually booked for check-in/out day,
      // which this guest's stay naturally brackets) -- but we DO need their booking_id so the
      // transport row joins the same registration the nightly cron already matches by name.
      const [regRes, bkRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/registrations?select=id,booking_id,room,guests,cancelled`, { headers: hdrs }),
        fetch(`${SUPABASE_URL}/rest/v1/bookings?select=id,leader_name,booking_type,blocked_rooms,status`, { headers: hdrs }),
      ]);
      const regsAll = (regRes.ok ? await regRes.json() : []).filter(r => !r.cancelled);
      const bookingsAll = (bkRes.ok ? await bkRes.json() : []).filter(b => b.status !== 'cancelled');

      let regMatch = null, bkMatch = null;
      if (roomNumber) {
        regMatch = findGuestReg(regsAll, clientName, roomNumber);
        bkMatch = !regMatch ? findGuestBooking(bookingsAll, clientName, roomNumber) : null;
      } else {
        const regNameMatches = regsAll.filter(r => (r.guests || []).some(g => normName(g.name) === normName(clientName)));
        const bkNameMatches = bookingsAll.filter(b => b.booking_type === 'room_only' && normName(b.leader_name) === normName(clientName));
        if (regNameMatches.length + bkNameMatches.length > 1) {
          return ok({ success: false, needsRoomNumber: true, message: `Hay más de un huésped registrado con el nombre "${clientName}" — pídele su número de cuarto y vuelve a llamar con roomNumber.` });
        }
        if (regNameMatches.length === 1) regMatch = { reg: regNameMatches[0] };
        else if (bkNameMatches.length === 1) bkMatch = { bk: bkNameMatches[0] };
      }
      if (!regMatch && !bkMatch) {
        return ok({ success: false, message: `No encontré a "${clientName}" como huésped registrado${roomNumber ? ` en el cuarto ${roomNumber}` : ''}. Confirma el nombre completo (como está en la reservación) o pídele su número de cuarto.` });
      }
      const bookingId = regMatch ? regMatch.reg.booking_id : bkMatch.bk.id;

      // Merge into the SAME transport row the guest's own form would create/update (one row
      // per guest, both directions share it) -- never clobber the other direction's fields.
      const existingRes = await fetch(`${SUPABASE_URL}/rest/v1/transport?select=id,data&booking_id=eq.${encodeURIComponent(bookingId)}`, { headers: hdrs });
      const existingRows = existingRes.ok ? await existingRes.json() : [];
      const existing = existingRows.find(r => normName(`${r.data?.firstName || ''} ${r.data?.lastName || ''}`) === normName(clientName));

      const dirFields = dir === 'arrival'
        ? { arrivalDate: date, arrivalTime: time || '', arrivalAirport: ap, flightNumber: flightNumber || existing?.data?.flightNumber || '' }
        : { departureDate: date, departureTime: time || '', departureAirport: ap, flightNumber: flightNumber || existing?.data?.flightNumber || '' };

      const rowId = existing?.id || ('tr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
      // existing.data spreads FIRST so the other direction's fields (and anything else
      // already on file) survive -- the fresh values below always win over stale ones.
      const data = {
        ...(existing?.data || {}),
        id: rowId,
        firstName, lastName,
        email: email || existing?.data?.email || '',
        notes: notes || existing?.data?.notes || '',
        ...dirFields,
        submittedAt: new Date().toISOString(),
      };
      const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/transport?on_conflict=id`, {
        method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ id: rowId, booking_id: bookingId, data, submitted_at: data.submittedAt }),
      });
      if (!saveRes.ok) throw new Error('No se pudo guardar el transporte: ' + await saveRes.text());

      return ok({
        success: true, guestType: 'hotel', direction: dir, bookingId,
        priceDisplay, totalUSD,
        message: `Información de transporte guardada (${dir === 'arrival' ? 'llegada' : 'salida'}, ${date}${time ? ' ' + time : ''}, ${ap === 'cancun' ? 'Cancún' : 'Tulum'}). Se cobrará automáticamente a tu cuarto la noche antes (${priceDisplay} = $${totalUSD.toFixed(2)} USD total).`,
      });
    }

    // Offsite: real Stripe Checkout Session, base + tax as two line items (same pattern as
    // the spa fix), instead of leaving the guest with a made-up number and no way to pay.
    const stripeKey = process.env.STRIPE_SECRET_KEY, pubKey = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!stripeKey) return jsonErr(500, 'Stripe not configured');
    const siteUrl = process.env.URL || 'https://amansalaportal.com';
    const subtotalCents = Math.round(subtotalUSD * 100);
    const taxCents = Math.round(taxAmount * 100);
    if (subtotalCents < 50) return ok({ success: false, message: 'El monto calculado es demasiado bajo para procesar el pago.' });

    const label = `Amansala Transfer · ${ap === 'cancun' ? 'Cancún' : 'Tulum'} ↔ Amansala · ${dir === 'arrival' ? 'Llegada' : 'Salida'} ${date}`;
    const params = new URLSearchParams({
      mode: 'payment',
      success_url: `${siteUrl}/?visito_transport=success`,
      cancel_url: `${siteUrl}/?visito_transport=cancelled`,
      customer_email: email,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': label.slice(0, 250),
      'line_items[0][price_data][unit_amount]': String(subtotalCents),
      'line_items[0][quantity]': '1',
      'line_items[1][price_data][currency]': 'usd',
      'line_items[1][price_data][product_data][name]': 'Tax (13%)',
      'line_items[1][price_data][unit_amount]': String(taxCents),
      'line_items[1][quantity]': '1',
      'payment_intent_data[metadata][source]': 'visito_transport',
      'payment_intent_data[metadata][airport]': ap,
      'payment_intent_data[metadata][pax]': String(n),
      'payment_intent_data[metadata][direction]': dir,
      'payment_intent_data[metadata][date]': date,
      'payment_intent_data[metadata][time]': time || '',
      'payment_intent_data[metadata][flightNumber]': (flightNumber || '').slice(0, 50),
      'payment_intent_data[metadata][clientName]': clientName.slice(0, 100),
      'payment_intent_data[metadata][email]': email.slice(0, 200),
      'payment_intent_data[metadata][phone]': (phone || '').slice(0, 50),
    });
    const csRes = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST', headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' }, body: params.toString(),
    });
    const cs = await csRes.json();
    if (cs.error) return jsonErr(400, cs.error.message || 'Stripe error');

    // Short /pay/<id> link instead of Stripe's long Checkout URL (same pattern as spa/room
    // reservations -- unusable pasted into WhatsApp otherwise).
    let paymentUrl = cs.url;
    try {
      const shortId = Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
      const slRes = await fetch(`${SUPABASE_URL}/rest/v1/payment_shortlinks`, {
        method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ id: shortId, target_url: cs.url }),
      });
      if (slRes.ok) paymentUrl = `https://amansalaportal.com/pay/${shortId}`;
    } catch (slErr) { console.warn('[visito-transport-create-booking] shortlink failed (non-fatal):', slErr.message); }

    // Email the payment link too, same as spa/room reservations.
    try {
      const emailHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f0ea;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:#1a2332;padding:24px 32px;text-align:center"><span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:1px">AMANSALA</span></div>
  <div style="padding:32px 32px 24px">
    <p style="font-size:15px;color:#1a2332">Hi ${firstName},</p>
    <p style="color:#4a4a4a;line-height:1.7">Here's your private transfer summary — click below to complete your payment and confirm it.</p>
    <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:14px 18px;border-radius:6px;margin:20px 0">
      <strong style="color:#1a2332">${label}</strong><br>
      <span style="color:#4a4a4a">${n} passenger${n !== 1 ? 's' : ''}${time ? ' · ' + time : ''}</span><br>
      <span style="color:#4a4a4a">$${subtotalUSD.toFixed(2)} USD + 13% tax</span><br>
      <span style="color:#4a4a4a;font-weight:700">Total: $${totalUSD.toFixed(2)} USD</span>
    </div>
    <div style="text-align:center;margin:28px 0"><a href="${paymentUrl}" style="background:#0e9494;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Complete Payment</a></div>
    <p style="color:#6b7280;font-size:12px;text-align:center">If the button doesn't work, copy this link into your browser:<br>${paymentUrl}</p>
  </div>
</div></body></html>`;
      await fetch(`${siteUrl}/.netlify/functions/send-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, subject: 'Complete Your Transfer Reservation — Amansala', html: emailHtml }),
      });
    } catch (emailErr) { console.warn('[visito-transport-create-booking] email failed (non-fatal):', emailErr.message); }

    return ok({
      success: true, guestType: 'offsite', direction: dir,
      priceDisplay, subtotalUSD, taxRatePct: 13, taxAmount, totalUSD,
      paymentUrl,
      message: `Traslado creado (precio: ${priceDisplay} = $${totalUSD.toFixed(2)} USD total) — comparte este link de pago con el huésped para confirmarlo (también se le mandó por correo): ${paymentUrl}`,
    });
  } catch (err) {
    console.error('[visito-transport-create-booking]', err.message);
    return jsonErr(500, err.message);
  }
};
