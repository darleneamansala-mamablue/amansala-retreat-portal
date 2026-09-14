'use strict';

// GET /.netlify/functions/xetux-reservation-lookup?guestName=...
// Called by Xetux POS to look up a guest's active (checked-in) reservation
// and linked open folio before posting a charge.
// Auth: Authorization: Bearer <XETUX_API_TOKEN> (fixed token, no rotation).
// Spec agreed with Xetux 2026-09-14 — always returns HTTP 200; a missing
// reservation is signaled via success:false, not a 404.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

function norm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function nameMatch(a, b) {
  const tokA = norm(a).split(/\s+/).filter(Boolean);
  const tokB = norm(b).split(/\s+/).filter(Boolean);
  if (!tokA.length || !tokB.length) return false;
  const [shorter, longer] = tokA.length <= tokB.length ? [tokA, tokB] : [tokB, tokA];
  return shorter.every(t => longer.includes(t));
}

function toDateTime(d) {
  if (!d) return null;
  const s = String(d).replace('T', ' ').replace('Z', '');
  if (s.length >= 19) return s.slice(0, 19);
  if (s.length === 10) return `${s} 00:00:00`;
  return s;
}

async function supaGet(key, path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'GET') return jsonErr(405, 'Method Not Allowed');

  const expectedToken = process.env.XETUX_API_TOKEN;
  if (!expectedToken) return jsonErr(500, 'Server config error');

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const providedToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!providedToken || providedToken !== expectedToken) return jsonErr(401, 'Unauthorized');

  const guestName = ((event.queryStringParameters && event.queryStringParameters.guestName) || '').trim();
  if (!guestName) return jsonErr(400, 'guestName is required');

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  const today = new Date().toISOString().slice(0, 10);
  const results = [];

  // ── Retreat guests currently checked in ──────────────────────────────
  const regs = await supaGet(
    supaKey,
    'registrations?select=id,room,guests,booking_id,bookings!inner(start_date,end_date,status)'
      + `&bookings.start_date=lte.${today}`
      + `&bookings.end_date=gte.${today}`
      + '&bookings.status=neq.cancelled',
  );

  for (const reg of regs) {
    if (!reg.room || !Array.isArray(reg.guests)) continue;
    const guest = reg.guests.find(g => g.name && nameMatch(g.name, guestName));
    if (!guest) continue;

    const folios = await supaGet(
      supaKey,
      `folios?select=id&registration_id=eq.${encodeURIComponent(reg.id)}&status=eq.open&order=created_at.asc&limit=1`,
    );

    results.push({
      reservationID: String(reg.id),
      folio: folios[0] && folios[0].id ? String(folios[0].id) : null,
      guestName: guest.name,
      roomNumber: reg.room,
      checkInDate: toDateTime(reg.bookings && reg.bookings.start_date),
      checkOutDate: toDateTime(reg.bookings && reg.bookings.end_date),
      status: 'confirmed',
    });
  }

  // ── Room-only bookings currently checked in ──────────────────────────
  const bookingReqs = await supaGet(
    supaKey,
    'booking_requests?select=id,room,first_name,last_name,check_in,check_out,status'
      + `&check_in=lte.${today}`
      + `&check_out=gte.${today}`
      + '&status=not.in.(declined,cancelled)',
  );

  for (const req of bookingReqs) {
    if (!req.room) continue;
    const fullName = [req.first_name, req.last_name].filter(Boolean).join(' ').trim();
    if (!fullName || !nameMatch(fullName, guestName)) continue;

    const folios = await supaGet(
      supaKey,
      `folios?select=id&booking_request_id=eq.${encodeURIComponent(req.id)}&status=eq.open&order=created_at.asc&limit=1`,
    );

    results.push({
      reservationID: String(req.id),
      folio: folios[0] && folios[0].id ? String(folios[0].id) : null,
      guestName: fullName,
      roomNumber: req.room,
      checkInDate: toDateTime(req.check_in),
      checkOutDate: toDateTime(req.check_out),
      status: req.status || 'confirmed',
    });
  }

  if (!results.length) {
    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'NO_ACTIVE_RESERVATION',
        message: `No se encontró una reserva activa para guestName=${guestName}`,
      }),
    };
  }

  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, data: results }),
  };
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}
function jsonErr(code, msg) {
  return {
    statusCode: code,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, error: msg }),
  };
}
