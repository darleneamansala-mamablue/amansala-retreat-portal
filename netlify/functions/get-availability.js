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

  let checkIn, checkOut, listAll, source;
  try { ({ checkIn, checkOut, listAll, source } = JSON.parse(event.body || '{}')); }
  catch { return jsonErr(400, 'Invalid JSON'); }
  if (!listAll && (!checkIn || !checkOut)) return jsonErr(400, 'Missing checkIn or checkOut');

  const hdrs = {
    'apikey': supaKey,
    'Authorization': `Bearer ${supaKey}`,
    'Content-Type': 'application/json',
  };

  const RT_FIELDS = 'id,name,rooms,max_occ,price_single_high,price_single_low,price_double_high,price_double_low,be_price_single,be_price_double,be_photos,be_description,be_amenities,color';
  const rtFilter  = source === 'extra_nights' ? 'be_extra_nights=eq.true' : 'be_enabled=eq.true';

  try {
    // listAll mode: return room types without availability filter
    if (listAll) {
      const [rtRes, settingsRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/room_types?${rtFilter}&select=${RT_FIELDS}`, { headers: hdrs }),
        fetch(`${SUPABASE_URL}/rest/v1/booking_engine_settings?id=eq.1`, { headers: hdrs }),
      ]);
      if (!rtRes.ok) throw new Error('room_types fetch failed');
      const [roomTypes, settingsArr] = await Promise.all([
        rtRes.json(), settingsRes.ok ? settingsRes.json() : Promise.resolve([{}]),
      ]);
      return {
        statusCode: 200,
        headers: { ...cors(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomTypes: roomTypes ?? [], settings: settingsArr[0] ?? {} }),
      };
    }

    const [bkRes, rtRes, settingsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/bookings?select=blocked_rooms&status=neq.cancelled&start_date=lt.${checkOut}&end_date=gt.${checkIn}`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/room_types?${rtFilter}&select=${RT_FIELDS}`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/booking_engine_settings?id=eq.1`, { headers: hdrs }),
    ]);

    if (!bkRes.ok)  throw new Error('bookings fetch failed');
    if (!rtRes.ok)  throw new Error('room_types fetch failed');

    const [bookings, roomTypes, settingsArr] = await Promise.all([
      bkRes.json(), rtRes.json(), settingsRes.ok ? settingsRes.json() : Promise.resolve([{}]),
    ]);

    const blockedRooms = new Set(
      (bookings ?? []).flatMap(bk => bk.blocked_rooms ?? [])
    );

    const available = (roomTypes ?? []).map(rt => {
      const rooms = rt.rooms ?? [];
      const availableCount = rooms.filter(r => !blockedRooms.has(r)).length;
      return { ...rt, available_rooms: availableCount, total_rooms: rooms.length };
    }).filter(rt => rt.available_rooms > 0);

    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ available, settings: settingsArr[0] ?? {} }),
    };
  } catch (err) {
    console.error('[get-availability]', err.message);
    return jsonErr(500, err.message);
  }
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
