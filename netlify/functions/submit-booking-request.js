'use strict';

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { roomTypeId, roomTypeName, checkIn, checkOut, adults,
          firstName, lastName, email, phone, dietary, notes } = body;

  if (!firstName || !lastName || !email || !checkIn || !checkOut) {
    return jsonErr(400, 'Missing required fields');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonErr(400, 'Invalid email');
  }
  if (checkIn >= checkOut) {
    return jsonErr(400, 'Check-out must be after check-in');
  }

  const hdrs = {
    'apikey': supaKey,
    'Authorization': `Bearer ${supaKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };

  const record = {
    room_type_id:   roomTypeId   ?? null,
    room_type_name: roomTypeName ?? null,
    check_in:       checkIn,
    check_out:      checkOut,
    adults:         adults ?? 1,
    first_name:     firstName,
    last_name:      lastName,
    email,
    phone:          phone    || null,
    dietary:        dietary  || null,
    notes:          notes    || null,
    status:         'pending',
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/booking_requests`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message ?? `Insert failed: ${res.status}`);
    }
    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('[submit-booking-request]', err.message);
    return jsonErr(500, err.message);
  }
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
