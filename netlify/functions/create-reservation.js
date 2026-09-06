'use strict';

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { roomTypeId, roomTypeName, checkIn, checkOut, adults,
          firstName, lastName, email, phone, dietary, notes, source, dailyRate } = body;

  if (!firstName || !lastName || !checkIn || !checkOut) return jsonErr(400, 'Missing required fields');
  if (checkIn >= checkOut) return jsonErr(400, 'Check-out must be after check-in');

  const hdrs = {
    'apikey': supaKey,
    'Authorization': `Bearer ${supaKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };

  const baseRecord = {
    room_type_id:   roomTypeId   ?? null,
    room_type_name: roomTypeName ?? null,
    check_in:       checkIn,
    check_out:      checkOut,
    adults:         adults ?? 1,
    first_name:     firstName,
    last_name:      lastName,
    email:          email    || null,
    phone:          phone    || null,
    dietary:        dietary  || null,
    notes:          notes    || null,
    status:         'confirmed',
    source:         source   ?? 'walk-in',
  };

  try {
    // Try with daily_rate; fall back without it if the column doesn't exist yet
    const record = dailyRate != null ? { ...baseRecord, daily_rate: dailyRate } : baseRecord;
    let res = await fetch(`${SUPABASE_URL}/rest/v1/booking_requests`, {
      method: 'POST', headers: hdrs, body: JSON.stringify(record),
    });
    if (!res.ok) {
      const err = await res.json();
      if (dailyRate != null && (err.message?.includes('daily_rate') || err.code === '42703')) {
        // Column not yet added — retry without it
        res = await fetch(`${SUPABASE_URL}/rest/v1/booking_requests`, {
          method: 'POST', headers: hdrs, body: JSON.stringify(baseRecord),
        });
        if (!res.ok) { const e2 = await res.json(); throw new Error(e2.message ?? `Insert failed: ${res.status}`); }
      } else {
        throw new Error(err.message ?? `Insert failed: ${res.status}`);
      }
    }
    const data = await res.json();
    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, data: Array.isArray(data) ? data[0] : data }),
    };
  } catch (err) {
    console.error('[create-reservation]', err.message);
    return jsonErr(500, err.message);
  }
};

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }; }
function jsonErr(c, m) { return { statusCode: c, headers: cors(), body: JSON.stringify({ error: m }) }; }
