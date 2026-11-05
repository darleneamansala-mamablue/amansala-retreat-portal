'use strict';
const { findOrCreateFolioLocked } = require('./folio-lib');

// GET /.netlify/functions/xetux-reservation-lookup?guestName=...
// Called by Xetux POS to look up a guest's active (checked-in) reservation
// and linked open folio before posting a charge. If no open folio exists
// yet, one is created so Xetux always gets a usable folio id.
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

async function supaPost(key, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

// Returns the open folio id for a registration/booking_request, creating one
// (empty, $0 balance) if none exists yet — so Xetux always has a folio to
// charge against instead of getting folio:null.
async function findOrCreateFolio(key, { registrationId, bookingRequestId, guestName }) {
  const linkField = registrationId ? 'registration_id' : 'booking_request_id';
  const linkId = registrationId || bookingRequestId;
  // shared locked find-or-create (this guest's open folio, else the oldest open one, else a new one); POS searches can fire
  // several look-ups at once, and each one used to be able to create its own folio
  const locked = await findOrCreateFolioLocked(key, { registrationId: registrationId || null, bookingRequestId: registrationId ? null : bookingRequestId,
    guestName, token: crypto.randomUUID().replace(/-/g, ''), openOnly: true, reuseAnyOpen: true });
  if (locked) return locked.id;

  const existing = await supaGet(
    key,
    `folios?select=id&${linkField}=eq.${encodeURIComponent(linkId)}&status=eq.open&order=created_at.asc&limit=1`,
  );
  if (existing[0] && existing[0].id) return existing[0].id;

  const created = await supaPost(key, 'folios', {
    [linkField]: linkId,
    guest_name: guestName,
    name: guestName,
    payment_token: crypto.randomUUID().replace(/-/g, ''),
    status: 'open',
  });
  return created && created.id ? created.id : null;
}

const tulumToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
const sameRoom = (a, b) => String(a || '').toLowerCase().replace(/[\s-]/g, '') === String(b || '').toLowerCase().replace(/[\s-]/g, '');

// Guests staying TODAY (Tulum date) and not checked out: the guest's own room dates (an extra night or a split stay has
// its own), not only the retreat's. One row per guest, with their open folio (created when missing). Shared with
// xetux-room-charge.js, which re-checks the reservation before posting.
async function findInHouse(supaKey, { guestName = '', roomNumber = '', reservationID = '' } = {}) {
  const today = tulumToday(), results = [];
  const bks = await supaGet(supaKey, `bookings?select=id,start_date,end_date,status&status=neq.cancelled&start_date=lte.${today}&end_date=gte.${today}&limit=1000`);
  const byId = new Map(bks.map(b => [b.id, b]));
  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i += 80) {
    const regs = await supaGet(supaKey, `registrations?select=id,room,guests,booking_id,check_in,check_out,cancelled,checked_in_at,checked_out_at&booking_id=in.(${ids.slice(i, i + 80).map(encodeURIComponent).join(',')})`);
    for (const reg of regs) {
      if (reg.cancelled || reg.checked_out_at || !reg.room || !Array.isArray(reg.guests)) continue;
      if (reservationID && String(reg.id) !== String(reservationID)) continue;
      const bk = byId.get(reg.booking_id);
      const inD = reg.check_in || bk.start_date, outD = reg.check_out || bk.end_date;
      if (!(inD <= today && outD >= today)) continue;
      if (roomNumber && !sameRoom(reg.room, roomNumber)) continue;
      for (const guest of reg.guests) {
        if (!guest || !guest.name || guest.cancelled) continue;
        if (guestName && !nameMatch(guest.name, guestName)) continue;
        const folioId = await findOrCreateFolio(supaKey, { registrationId: reg.id, guestName: guest.name });
        results.push({ reservationID: String(reg.id), folio: folioId ? String(folioId) : null, guestName: guest.name, roomNumber: reg.room,
          checkInDate: toDateTime(inD), checkOutDate: toDateTime(outD), status: 'confirmed', checkedIn: !!reg.checked_in_at });
      }
    }
  }
  // Booking Engine reservations (booking_requests)
  const reqs = await supaGet(supaKey, `booking_requests?select=id,room,first_name,last_name,check_in,check_out,status,checked_in_at,checked_out_at&check_in=lte.${today}&check_out=gte.${today}&status=not.in.(declined,cancelled)`);
  for (const req of reqs) {
    if (!req.room || req.checked_out_at) continue;
    if (reservationID && String(req.id) !== String(reservationID)) continue;
    const fullName = [req.first_name, req.last_name].filter(Boolean).join(' ').trim();
    if (!fullName || (guestName && !nameMatch(fullName, guestName)) || (roomNumber && !sameRoom(req.room, roomNumber))) continue;
    const folioId = await findOrCreateFolio(supaKey, { bookingRequestId: req.id, guestName: fullName });
    results.push({ reservationID: String(req.id), folio: folioId ? String(folioId) : null, guestName: fullName, roomNumber: req.room,
      checkInDate: toDateTime(req.check_in), checkOutDate: toDateTime(req.check_out), status: req.status || 'confirmed', checkedIn: !!req.checked_in_at });
  }
  return results;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'GET') return jsonErr(405, 'Method Not Allowed');

  const expectedToken = process.env.XETUX_API_TOKEN;
  if (!expectedToken) return jsonErr(500, 'Server config error');

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const providedToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!providedToken || providedToken !== expectedToken) return jsonErr(401, 'Unauthorized');

  const qs = event.queryStringParameters || {};
  const guestName = String(qs.guestName || '').trim();
  // Jorge 2026-11-05 (Benix / Xetux): the waiter can also search by room number
  const roomNumber = String(qs.roomNumber || qs.room || '').trim();
  if (!guestName && !roomNumber) return jsonErr(400, 'guestName or roomNumber is required');

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  const results = await findInHouse(supaKey, { guestName, roomNumber });
  if (!results.length) {
    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'NO_ACTIVE_RESERVATION',
        message: `No se encontró una reserva activa para ${guestName ? 'guestName=' + guestName : 'roomNumber=' + roomNumber}`,
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

module.exports.findInHouse = findInHouse;
