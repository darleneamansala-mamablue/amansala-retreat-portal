'use strict';

// Adapted from Jorge's version: our Supabase has no relational room_types/bookings
// tables — everything lives as one JSON blob per `key` in the `app_store` table.
const SUPABASE_URL = 'https://fzresosiqafiyxfgeyvk.supabase.co';

async function readAppStore(key, hdrs) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.${encodeURIComponent(key)}&select=value`, { headers: hdrs });
  if (!res.ok) throw new Error(`${key} fetch failed`);
  const rows = await res.json();
  return rows[0]?.value ?? null;
}

// Map our real roomTypes shape to the field names the Extra Nights front-end expects.
// be_* fields are set via the Booking Engine admin tab (modules/booking-engine-admin.js)
// and live directly on the roomTypes app_store record — read them straight through.
function mapRoomType(rt) {
  return {
    id: rt.id,
    name: rt.name,
    rooms: rt.rooms ?? [],
    max_occ: rt.maxOcc ?? 2,
    price_single_high: rt.price1 ?? null,
    price_single_low: rt.price1_low ?? rt.price1 ?? null,
    price_double_high: rt.price2 ?? null,
    price_double_low: rt.price2_low ?? rt.price2 ?? null,
    be_price_single: rt.be_price_single ?? null,
    be_price_double: rt.be_price_double ?? null,
    be_photos: rt.be_photos ?? [],
    be_description: rt.be_description ?? rt.desc ?? null,
    be_amenities: rt.be_amenities ?? [],
    color: rt.color ?? null,
  };
}

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

  try {
    const [roomTypesRaw, settings] = await Promise.all([
      readAppStore('roomTypes', hdrs),
      readAppStore('bookingEngineSettings', hdrs),
    ]);
    // Offer every real, actively-used room type (has at least one physical room),
    // gated by whichever Booking Engine toggle applies to the calling page.
    const enabledFlag = source === 'extra_nights' ? 'be_extra_nights' : 'be_enabled';
    const roomTypes = (roomTypesRaw ?? [])
      .filter(rt => (rt.rooms ?? []).length > 0 && rt[enabledFlag])
      .map(mapRoomType);

    if (listAll) {
      return {
        statusCode: 200,
        headers: { ...cors(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomTypes, settings: settings ?? {} }),
      };
    }

    const bookings = (await readAppStore('bookings', hdrs)) ?? [];
    const blockedRooms = new Set(
      bookings
        .filter(bk => bk.status !== 'cancelled' && bk.startDate < checkOut && bk.endDate > checkIn)
        .flatMap(bk => bk.blockedRooms ?? [])
    );

    const available = roomTypes.map(rt => {
      const rooms = rt.rooms ?? [];
      const availableCount = rooms.filter(r => !blockedRooms.has(r)).length;
      return { ...rt, available_rooms: availableCount, total_rooms: rooms.length };
    }).filter(rt => rt.available_rooms > 0);

    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ available, settings: settings ?? {} }),
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
