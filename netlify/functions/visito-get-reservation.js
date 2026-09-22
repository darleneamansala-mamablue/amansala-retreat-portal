'use strict';

// Visito AI "Tool" — lets Lana answer "what's the status of my reservation?"
// once a guest gives their Cloudbeds confirmation/reservation number (the
// number they already have from their booking email — Visito's own Cloudbeds
// integration already shows this same ID in Guest Engagement → Reservations,
// this tool just adds the extra detail only our system has: real balance
// after any discount, room assignment, dietary notes, etc.)
//
// Scope: Room Only (booking_requests) ONLY — matches the "Solo Room Only"
// decision (2026-09-22) for what the AI is allowed to touch/see. Retreat
// group bookings are not exposed here.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

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

  const reservationNumber = String((payload.arguments || {}).reservationNumber || '').trim();
  if (!reservationNumber) {
    return ok({ success: false, message: 'Necesito el número de reserva (el de confirmación de Cloudbeds) para buscarla.' });
  }

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/booking_requests?cb_reservation_id=eq.${encodeURIComponent(reservationNumber)}&select=id,room,room_type_name,check_in,check_out,first_name,last_name,adults,status,amount_paid,dietary,notes`,
      { headers: hdrs }
    );
    if (!res.ok) throw new Error('booking_requests fetch failed');
    const [br] = await res.json();
    if (!br) {
      return ok({ success: false, message: `No encontré ninguna reserva con el número ${reservationNumber}. Puede ser una reserva de retiro grupal (no cubierta por este buscador) — en ese caso hay que pedirle ayuda a un miembro del equipo.` });
    }

    const nights = Math.max(1, Math.round((new Date(br.check_out) - new Date(br.check_in)) / 86400000));

    return ok({
      success: true,
      reservationNumber,
      guestName: [br.first_name, br.last_name].filter(Boolean).join(' '),
      roomType: br.room_type_name,
      room: br.room || 'Por asignar',
      checkIn: br.check_in,
      checkOut: br.check_out,
      nights,
      adults: br.adults,
      status: br.status,
      amountPaid: br.amount_paid,
      dietary: br.dietary || null,
      notes: br.notes || null,
    });
  } catch (err) {
    console.error('[visito-get-reservation]', err.message);
    return jsonErr(500, err.message);
  }
};

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: msg }) }; }
