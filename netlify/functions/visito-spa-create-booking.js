'use strict';

// Visito AI "Tool" — lets Lana book a spa appointment end to end, with ZERO
// staff involvement: determines whether the guest is currently staying at
// the hotel (charges the service straight to their room folio, same as
// spa-booking.html's live flow) or is offsite (creates a Stripe Checkout
// Session and hands back a short payment link instead of spa-booking.html's
// current "our team will reach out to collect payment" — Jorge's ask
// 2026-09-23: "revise si es huésped que haga cargo a habitación o enviar
// stripe si es offsite").
//
// Mirrors spa-booking.html's sbFinalConfirm() as closely as possible so an
// appointment Lana creates is indistinguishable from one a guest books
// themselves: same spa_appointments row shape, same registrations.charges/
// bookings.charges posting, same confirmation + therapist-notification
// emails.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const STRIPE_API = 'https://api.stripe.com/v1';

function hhmmToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function fmtDateLong(ds) { return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
function fmtT(t) { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + ap; }
function esc(s) { return (s || '').replace(/</g, '&lt;'); }
function spaGroupPrice(s, n) {
  if (!s.groupPricing || !n || n < 1) return null;
  const gp = s.groupPricing;
  if (gp.belowMin && gp.belowMin[n] != null) return gp.belowMin[n];
  if (gp.flatFee != null) return gp.flatFee + Math.max(0, n - (gp.flatFeeMax || 0)) * (gp.perPersonUSD || 0);
  if (n >= gp.minGroup) return gp.perPersonUSD * n;
  return null;
}
function normName(s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function findGuestReg(regs, clientName, roomNumber) {
  const key = (clientName || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!key) return null;
  const rn = (roomNumber || '').toLowerCase().replace(/\s+/g, ' ').trim();
  let fallback = null;
  for (const reg of regs) {
    const idx = (reg.guests || []).findIndex(g => (g.name || '').toLowerCase().replace(/\s+/g, ' ').trim() === key);
    if (idx >= 0) {
      const match = { reg, guest: reg.guests[idx] };
      if (rn && (reg.room || '').toLowerCase().replace(/\s+/g, ' ').trim() === rn) return match;
      if (!fallback) fallback = match;
    }
  }
  return fallback;
}
function findGuestBooking(bookings, clientName, roomNumber) {
  const key = (clientName || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!key) return null;
  const rn = (roomNumber || '').toLowerCase().replace(/\s+/g, ' ').trim();
  let fallback = null;
  for (const bk of bookings) {
    if (bk.booking_type !== 'room_only') continue;
    if ((bk.leader_name || '').toLowerCase().replace(/\s+/g, ' ').trim() !== key) continue;
    const rooms = (bk.blocked_rooms || []).map(r => (r || '').toLowerCase().replace(/\s+/g, ' ').trim());
    if (rn && rooms.includes(rn)) return { bk };
    if (!fallback) fallback = { bk };
  }
  return fallback;
}
function emailShell(headline, bodyHtml) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f0ea;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0ea;padding:32px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <tr><td style="background:#2d6a6a;padding:28px 36px;text-align:center">
    <div style="font-size:11px;letter-spacing:.15em;color:#a7d7d7;text-transform:uppercase;margin-bottom:6px">Amansala Eco-Chic Resort + Retreat</div>
    <div style="font-size:22px;font-weight:700;color:#fff">${headline}</div>
  </td></tr>
  <tr><td style="padding:32px 36px">${bodyHtml}</td></tr>
  <tr><td style="background:#f5f0ea;padding:20px 36px;text-align:center;border-top:1px solid #e8e3dc">
    <p style="font-size:12px;color:#9ca3af;margin:0">Amansala Eco-Chic Resort · Tulum, México · retreats@amansala.com</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}
function emailRow(label, value) {
  return `<tr><td style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:13px;color:#6b7280;width:130px;vertical-align:top">${label}</td><td style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:14px;color:#1a2332;font-weight:500">${value}</td></tr>`;
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

  const {
    firstName, lastName, email, phone, guestType, roomNumber,
    serviceId, date, start, therapistId, roomId, guestCount,
  } = payload.arguments || {};

  const missing = ['firstName', 'lastName', 'email', 'phone', 'guestType', 'serviceId', 'date', 'start', 'therapistId']
    .filter(f => !({ firstName, lastName, email, phone, guestType, serviceId, date, start, therapistId }[f]));
  if (missing.length) return ok({ success: false, message: `Me faltan estos datos: ${missing.join(', ')}.` });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ok({ success: false, message: 'El correo no parece válido.' });
  if (guestType !== 'hotel' && guestType !== 'offsite') return ok({ success: false, message: 'guestType debe ser "hotel" u "offsite".' });

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };
  const clientName = `${firstName} ${lastName}`.trim();

  try {
    const [sdRes, apRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_data&select=value`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_appointments&select=value`, { headers: hdrs }),
    ]);
    const [sdRow] = sdRes.ok ? await sdRes.json() : [];
    const spaData = sdRow?.value || {};
    const svc = (spaData.services || []).find(s => s.id === serviceId && s.active);
    if (!svc) return ok({ success: false, message: 'No encontré ese servicio — vuelve a llamar a spa_list_services.' });
    const ther = (spaData.therapists || []).find(t => t.id === therapistId);
    if (!ther) return ok({ success: false, message: 'No encontré ese terapeuta — vuelve a llamar a spa_check_availability para obtener un therapistId válido.' });

    const [apRow] = apRes.ok ? await apRes.json() : [];
    const appts = apRow?.value || [];

    // Re-verify the slot is still free right before writing — same
    // conflict check as sbFinalConfirm's revalidation.
    const startMin = hhmmToMin(start), endMin = startMin + svc.duration;
    const conflict = appts.some(a => {
      if (a.date !== date || a.status === 'CANCELLED') return false;
      if (a.therapistId !== therapistId) return false;
      const aStart = hhmmToMin(a.start), aEnd = aStart + (a.duration || 60);
      return startMin < aEnd && endMin > aStart;
    });
    if (conflict) return ok({ success: false, message: 'Justo se acaba de ocupar ese horario — vuelve a llamar a spa_check_availability para ver opciones actuales.' });

    const priceUSD = svc.groupPricing ? spaGroupPrice(svc, Math.max(1, parseInt(guestCount) || svc.groupPricing.minGuests || 1)) : svc.price;
    if (priceUSD == null) return ok({ success: false, message: 'No pude calcular el precio para ese número de invitados — pregúntale al huésped un número distinto o avisa al equipo.' });

    const isHotel = guestType === 'hotel';
    let stayStart = null, stayEnd = null, regMatch = null, bkMatch = null, matchedRoomNumber = roomNumber || null;
    if (isHotel) {
      const [regRes, bkRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/registrations?select=id,booking_id,room,guests,charges`, { headers: hdrs }),
        fetch(`${SUPABASE_URL}/rest/v1/bookings?select=id,leader_name,booking_type,blocked_rooms,charges,start_date,end_date`, { headers: hdrs }),
      ]);
      const regsAll = regRes.ok ? await regRes.json() : [];
      const bookingsAll = bkRes.ok ? await bkRes.json() : [];

      // Only ever match against a stay that actually covers the appointment
      // date -- matching a name against a past or future stay is how you'd
      // charge (or fail to charge) the wrong person.
      const activeBookings = bookingsAll.filter(b => b.start_date && b.end_date && date >= b.start_date && date <= b.end_date);
      const activeBookingIds = new Set(activeBookings.map(b => b.id));
      const activeRegs = regsAll.filter(r => activeBookingIds.has(r.booking_id));
      const activeRoomOnlyBookings = activeBookings.filter(b => b.booking_type === 'room_only');

      if (roomNumber) {
        regMatch = findGuestReg(activeRegs, clientName, roomNumber);
        bkMatch = !regMatch ? findGuestBooking(activeRoomOnlyBookings, clientName, roomNumber) : null;
      } else {
        // Name-only: auto-match the room if there's exactly one guest with
        // this name staying right now; otherwise ask instead of guessing.
        const regNameMatches = activeRegs.filter(r => (r.guests || []).some(g => normName(g.name) === normName(clientName)));
        const bkNameMatches = activeRoomOnlyBookings.filter(b => normName(b.leader_name) === normName(clientName));
        const totalMatches = regNameMatches.length + bkNameMatches.length;
        if (totalMatches > 1) {
          return ok({ success: false, needsRoomNumber: true, message: `Hay más de un huésped registrado con el nombre "${clientName}" — pídele su número de cuarto para confirmar a quién cobrar y vuelve a llamar con roomNumber.` });
        }
        if (regNameMatches.length === 1) {
          const reg = regNameMatches[0];
          regMatch = { reg, guest: (reg.guests || []).find(g => normName(g.name) === normName(clientName)) };
        } else if (bkNameMatches.length === 1) {
          bkMatch = { bk: bkNameMatches[0] };
        }
      }

      if (!regMatch && !bkMatch) {
        return ok({ success: false, message: `No encontré a "${clientName}" como huésped con estancia activa el ${date}${roomNumber ? ` en el cuarto ${roomNumber}` : ''}. Confirma el nombre completo (como está en la reservación) ${roomNumber ? 'y el número de cuarto' : 'o pídele su número de cuarto'}.` });
      }

      matchedRoomNumber = roomNumber || (regMatch ? regMatch.reg.room : (bkMatch.bk.blocked_rooms || [])[0]) || null;
      const parentBk = regMatch ? activeBookings.find(b => b.id === regMatch.reg.booking_id) : bkMatch.bk;
      if (parentBk?.start_date && parentBk?.end_date) { stayStart = parentBk.start_date; stayEnd = parentBk.end_date; }
      if ((stayStart && date < stayStart) || (stayEnd && date > stayEnd)) {
        return ok({ success: false, message: `Esa fecha está fuera de la estancia del huésped (${stayStart} – ${stayEnd}) — pídele una fecha dentro de su estadía.` });
      }
    }

    const apptId = 'ap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const appt = {
      id: apptId,
      clientName, guestType, sessionType: svc.sessionType || 'individual',
      email, phone, roomNumber: matchedRoomNumber,
      serviceId, therapistId, roomId: roomId || null,
      date, start, duration: svc.duration,
      status: isHotel ? 'CONFIRMED' : 'PAYMENT_PENDING',
      paymentStatus: isHotel ? 'NOT_REQUIRED' : 'PENDING',
      folioStatus: isHotel ? 'PENDING' : 'NOT_REQUIRED',
      therapistPreference: { type: 'specific', requestedTherapistId: therapistId },
      source: 'guest_booking',
      guestCount: svc.groupPricing ? (parseInt(guestCount) || svc.groupPricing.minGuests || 1) : null,
      groupTotalPriceUSD: svc.groupPricing ? priceUSD : null,
      notes: svc.groupPricing ? `${parseInt(guestCount) || svc.groupPricing.minGuests || 1} guests · $${priceUSD} USD total` : '',
      createdAt: new Date().toISOString(),
    };

    let folioPosted = false;
    const therName = `${ther.firstName} ${ther.lastName || ''}`.trim();
    if (isHotel) {
      const category = /massage/i.test(svc.name) ? 'Massage' : 'Spa';
      const chargeId = 'chg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const charge = { id: chargeId, date, category, description: svc.name, amount: priceUSD, guestName: clientName, therapistName: therName, therapistId, addedAt: new Date().toISOString(), addedBy: 'Visito AI (auto)', source: 'spa' };
      try {
        if (regMatch) {
          const newCharges = [...(regMatch.reg.charges || []), charge];
          const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/registrations?id=eq.${regMatch.reg.id}`, {
            method: 'PATCH', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ charges: newCharges }),
          });
          if (patchRes.ok) { appt.folioStatus = 'POSTED'; appt.folioChargeId = chargeId; appt.folioRegId = regMatch.reg.id; folioPosted = true; }
          else console.warn('[visito-spa-create-booking] registrations charge PATCH failed:', await patchRes.text());
        } else if (bkMatch) {
          const newCharges = [...(bkMatch.bk.charges || []), charge];
          const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${bkMatch.bk.id}`, {
            method: 'PATCH', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ charges: newCharges }),
          });
          if (patchRes.ok) { appt.folioStatus = 'POSTED'; appt.folioChargeId = chargeId; appt.folioBkId = bkMatch.bk.id; folioPosted = true; }
          else console.warn('[visito-spa-create-booking] bookings charge PATCH failed:', await patchRes.text());
        }
      } catch (chErr) { console.warn('[visito-spa-create-booking] folio post failed (non-fatal):', chErr.message); }
    }

    // Offsite: create a Stripe Checkout Session + short payment link instead
    // of leaving it for staff to chase down manually (Jorge's ask).
    let paymentUrl = null;
    if (!isHotel) {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) return jsonErr(500, 'Stripe not configured');
      const siteUrl = process.env.URL || 'https://amansalaportal.com';
      const amountCents = Math.round(priceUSD * 100);
      if (amountCents >= 50) {
        const params = new URLSearchParams({
          mode: 'payment',
          success_url: `${siteUrl}/?visito_spa=success`,
          cancel_url: `${siteUrl}/?visito_spa=cancelled`,
          customer_email: email,
          'line_items[0][price_data][currency]': 'usd',
          'line_items[0][price_data][product_data][name]': `Amansala Spa · ${svc.name} · ${date} ${start}`.slice(0, 250),
          'line_items[0][price_data][unit_amount]': String(amountCents),
          'line_items[0][quantity]': '1',
          'payment_intent_data[metadata][source]': 'visito_spa',
          'payment_intent_data[metadata][apptId]': apptId,
          'payment_intent_data[metadata][serviceName]': svc.name.slice(0, 200),
          'payment_intent_data[metadata][clientName]': clientName.slice(0, 100),
        });
        const csRes = await fetch(`${STRIPE_API}/checkout/sessions`, {
          method: 'POST', headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' }, body: params.toString(),
        });
        const cs = await csRes.json();
        if (cs.error) { console.warn('[visito-spa-create-booking] Stripe error (non-fatal):', cs.error.message); }
        else {
          paymentUrl = cs.url;
          try {
            const shortId = Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
            const slRes = await fetch(`${SUPABASE_URL}/rest/v1/payment_shortlinks`, {
              method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ id: shortId, target_url: cs.url }),
            });
            if (slRes.ok) paymentUrl = `https://amansalaportal.com/pay/${shortId}`;
          } catch (slErr) { console.warn('[visito-spa-create-booking] shortlink failed (non-fatal):', slErr.message); }
        }
      }
    }

    // Write the appointment last, once payment link (if any) is ready.
    const latest = [...appts, appt];
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, {
      method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'spa_appointments', value: latest, updated_at: new Date().toISOString() }),
    });
    if (!upsertRes.ok) throw new Error('Could not save the appointment: ' + await upsertRes.text());

    // Confirmation + therapist-notification emails (best-effort, non-fatal).
    const roomLoc = (spaData.rooms || []).find(r => r.id === roomId);
    const meetAt = roomLoc ? (roomLoc.location ? `${roomLoc.name} — ${roomLoc.location}` : roomLoc.name) : 'Our spa reception';
    try {
      const rows = [
        emailRow('Service', esc(svc.name)), emailRow('Date', fmtDateLong(date)), emailRow('Time', fmtT(start)),
        emailRow('Therapist', esc(therName)), emailRow('Meet at', esc(meetAt)),
        ...(matchedRoomNumber ? [emailRow('Your room', esc(matchedRoomNumber))] : []),
        ...(folioPosted ? [emailRow('Payment', 'Charged to your room folio')] : []),
      ].join('');
      const payBlock = paymentUrl
        ? `<div style="text-align:center;margin:24px 0"><a href="${paymentUrl}" style="display:inline-block;background:#0e9494;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:700">Pay for Your Appointment</a></div><p style="font-size:12.5px;color:#6b7280;text-align:center">Or copy this link: ${paymentUrl}</p>`
        : (!isHotel ? '<p style="font-size:13.5px;color:#374151">Our team will follow up shortly to collect payment.</p>' : '');
      const body = `<p style="font-size:15px;color:#374151;margin:0 0 24px">Hi ${esc(firstName)}, you're booked! Here are your appointment details:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px">${rows}</table>
        ${payBlock}`;
      await fetch(`${process.env.URL || 'https://amansalaportal.com'}/.netlify/functions/send-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, subject: 'Spa Appointment Confirmed — Amansala', html: emailShell('Your Spa Appointment is Confirmed', body) }),
      });
      if (ther.email) {
        const therBody = `<p style="font-size:15px;color:#374151;margin:0 0 24px">Hi ${esc(ther.firstName)}, a new appointment was just booked with you:</p>
          <table width="100%" cellpadding="0" cellspacing="0">${emailRow('Client', esc(clientName))}${emailRow('Service', esc(svc.name))}${emailRow('Date', fmtDateLong(date))}${emailRow('Time', fmtT(start))}</table>
          <p style="font-size:13.5px;color:#6b7280;margin:20px 0 0">It's on your schedule.</p>`;
        await fetch(`${process.env.URL || 'https://amansalaportal.com'}/.netlify/functions/send-email`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: ther.email, subject: 'New Appointment — Amansala Spa', html: emailShell('New Appointment Booked', therBody) }),
        });
      }
    } catch (emailErr) { console.warn('[visito-spa-create-booking] email failed (non-fatal):', emailErr.message); }

    return ok({
      success: true,
      appointmentId: apptId,
      serviceName: svc.name, therapistName: therName, date, start, durationMinutes: svc.duration,
      priceUSD, guestType, folioPosted, roomNumber: matchedRoomNumber,
      paymentUrl,
      message: isHotel
        ? `Cita creada y cargada al cuarto ${matchedRoomNumber || ''} (${clientName}). Correo de confirmación enviado.`
        : (paymentUrl
          ? `Cita creada — comparte este link de pago con el huésped para confirmarla (también se le mandó por correo): ${paymentUrl}`
          : `Cita creada, pero no se pudo generar el link de pago automático — avísale al equipo que necesita cobrarle a ${clientName} manualmente.`),
    });
  } catch (err) {
    console.error('[visito-spa-create-booking]', err.message);
    return jsonErr(500, err.message);
  }
};

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: msg }) }; }
