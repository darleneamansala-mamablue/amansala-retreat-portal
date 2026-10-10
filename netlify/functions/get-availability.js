'use strict';

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

// Extra Night only -- Jorge's call 2026-10-08: no one can book an extra
// night overlapping the Dec 20 – Jan 15 holiday window, same as retreats
// never book then. Same logic as stripe.js's inExtraNightBlackout.
function inExtraNightBlackout(checkIn, checkOut) {
  const ciYear = new Date(checkIn + 'T12:00:00').getFullYear();
  return [ciYear - 1, ciYear].some(y => {
    const blackoutStart = `${y}-12-20`;
    const blackoutEnd   = `${y + 1}-01-15`;
    return checkIn < blackoutEnd && checkOut > blackoutStart;
  });
}

// A room sold whole (e.g. "19B") and as individual shared beds ("19B -a",
// "19B -b") is the SAME physical space -- blocking one must block the
// other(s). The admin Room Calendar already does this (rsComputeAvailability
// in modules/venues.js); this public endpoint never did, a real
// double-booking gap confirmed 2026-10-10 (Jorge's report): a guest could
// pay online for a room whose sibling bed/parent was already occupied by a
// retreat.
//
// Sibling resolution is constrained to the known parent-type <-> bed-type
// pairs (rt6<->bd1, rt7<->bd2, rt8<->bd3, rt9<->bd4) -- NOT a blind
// same-leading-digits match. Rooms like "13B"/"5B"/"2B"/"3B" are standalone
// single rooms in UNRELATED room types (rt1/rt2/rt3/rt4) that happen to
// share a numeric prefix with a completely different physical room's bed
// pair ("13"/"13a"/"13b" in rt7/bd2) -- confirmed via live room_types data
// 2026-10-10. Matching on string pattern alone (without the type-pair
// check) would have wrongly linked them.
const ROOM_PARENT_TO_BED = { rt6: 'bd1', rt7: 'bd2', rt8: 'bd3', rt9: 'bd4' };
const ROOM_BED_TO_PARENT = { bd1: 'rt6', bd2: 'rt7', bd3: 'rt8', bd4: 'rt9' };
// A second, different kind of derived relationship (Jorge's confirmation
// 2026-10-10): "Casa Master" and "Casa Shanti" are each a single whole-villa
// room type that, when rented exclusively, encompasses SEVERAL OTHER,
// otherwise-independent room types (not a same-room bed-split) -- Casa
// Master = Casa King Downstairs + Casa Grande Up King + Casa Grande 2 Queen
// Downstairs + Casa Grande Upstairs Individual + Casa Grande Up Shared 2
// Queen; Casa Shanti = Shanti King + Shanti 2 Bed. Booking the whole villa
// must block every room in every listed sub-type, and booking any room in
// any sub-type must block the whole-villa option for those dates.
const VILLA_TO_SUBTYPES = { cm1: ['cg1', 'cg2', 'cg3', 'cg4', 'cg5'], csh3: ['csh1', 'csh2'] };
function splitDoubleHalf(room) {
  const r = String(room || '').trim();
  let m = r.match(/^(\d+)([a-d])$/i);
  if (m) return { base: m[1] };
  m = r.match(/^(.+?)\s*-([a-d])$/i);
  if (m) return { base: m[1] };
  m = r.match(/^(.+\d)([a-d])$/i);
  if (m) return { base: m[1] };
  return null;
}
// roomTypes: [{id, rooms}] for every room type, unfiltered.
function propagateSiblingBlocks(blockedSet, roomTypes) {
  const roomToType = new Map();
  roomTypes.forEach(rt => (rt.rooms || []).forEach(r => roomToType.set(r, rt.id)));
  const roomsById = new Map(roomTypes.map(rt => [rt.id, rt.rooms || []]));
  const toAdd = new Set();
  [...blockedSet].forEach(room => {
    const typeId = roomToType.get(room);
    if (!typeId) return;
    if (ROOM_PARENT_TO_BED[typeId]) {
      (roomsById.get(ROOM_PARENT_TO_BED[typeId]) || []).forEach(r => {
        const s = splitDoubleHalf(r);
        if (s && s.base.toLowerCase() === room.toLowerCase()) toAdd.add(r);
      });
    } else if (ROOM_BED_TO_PARENT[typeId]) {
      const split = splitDoubleHalf(room);
      if (!split) return;
      const parentRooms = roomsById.get(ROOM_BED_TO_PARENT[typeId]) || [];
      if (parentRooms.includes(split.base)) toAdd.add(split.base);
      (roomsById.get(typeId) || []).forEach(r => {
        const s = splitDoubleHalf(r);
        if (s && s.base.toLowerCase() === split.base.toLowerCase()) toAdd.add(r);
      });
    }
    if (VILLA_TO_SUBTYPES[typeId]) {
      VILLA_TO_SUBTYPES[typeId].forEach(subId => (roomsById.get(subId) || []).forEach(r => toAdd.add(r)));
    } else {
      for (const [villaId, subIds] of Object.entries(VILLA_TO_SUBTYPES)) {
        if (subIds.includes(typeId)) (roomsById.get(villaId) || []).forEach(r => toAdd.add(r));
      }
    }
  });
  toAdd.forEach(r => blockedSet.add(r));
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
  if (!listAll && source === 'extra_nights' && inExtraNightBlackout(checkIn, checkOut)) {
    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: [], settings: {}, blackout: true }),
    };
  }

  const hdrs = {
    'apikey': supaKey,
    'Authorization': `Bearer ${supaKey}`,
    'Content-Type': 'application/json',
  };

  const RT_FIELDS = 'id,name,rooms,max_occ,price_single_high,price_single_low,price_double_high,price_double_low,be_price_single,be_price_single_extra_night,be_price_single_extra_night_low,be_price_double,be_photos,be_description,be_amenities,color';
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
      fetch(`${SUPABASE_URL}/rest/v1/bookings?select=id,blocked_rooms&status=neq.cancelled&start_date=lt.${checkOut}&end_date=gt.${checkIn}`, { headers: hdrs }),
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
    // Also cross-check real registrations, not just blocked_rooms — a room
    // can have a named guest registered in it whose room was never added to
    // its booking's blocked_rooms ("orphaned registration"; confirmed real
    // incidents: Katherine McClelland's CH3a/CH3b, Monica's 5B/GV13a/GV13b).
    // This is the public guest-facing booking site, so this gap could have
    // let a real guest book an already-occupied room online.
    const overlappingIds = (bookings ?? []).map(bk => bk.id).filter(Boolean);
    if (overlappingIds.length) {
      const regRes = await fetch(`${SUPABASE_URL}/rest/v1/registrations?select=room,guests&booking_id=in.(${overlappingIds.join(',')})`, { headers: hdrs });
      if (regRes.ok) {
        const regs = await regRes.json();
        (regs ?? []).forEach(r => {
          if (r.room && (r.guests || []).some(g => g && g.name)) blockedRooms.add(r.room);
        });
      }
    }

    // Propagate each blocked room to its whole-room/sub-bed siblings (see
    // splitDoubleHalf above) -- needs the FULL room list across every room
    // type, not just the ones matching rtFilter, since a sibling can live in
    // a differently-enabled room type.
    const allTypesRes = await fetch(`${SUPABASE_URL}/rest/v1/room_types?select=id,rooms`, { headers: hdrs });
    const allTypes = allTypesRes.ok ? await allTypesRes.json() : [];
    propagateSiblingBlocks(blockedRooms, allTypes);

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
