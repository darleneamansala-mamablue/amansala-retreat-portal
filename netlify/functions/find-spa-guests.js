'use strict';

// Returns hotel guests with active or upcoming reservations (no email required).
// Used by the spa calendar admin 🔍 lookup to find a guest by name.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const query = ((body.name || '') + '').trim();
  const today = new Date().toISOString().slice(0, 10);
  const norm  = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const qNorm = norm(query);

  const supaHdrs = {
    'apikey':        supaKey,
    'Authorization': `Bearer ${supaKey}`,
    'Content-Type':  'application/json',
  };

  const items = [];

  // ── 1. Fetch registrations with active/upcoming bookings ──────────────────
  const PAGE = 1000;
  let regs = [];
  let from = 0;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/registrations`
      + `?select=id,room,guests,booking_id,bookings!inner(start_date,end_date,status,retreat_name)`
      + `&bookings.end_date=gte.${today}`
      + `&bookings.status=neq.cancelled`
      + `&order=booking_id.asc`;
    const res = await fetch(url, {
      headers: { ...supaHdrs, 'Range': `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
    });
    if (!res.ok) break;
    const page = await res.json();
    if (!Array.isArray(page) || !page.length) break;
    regs = regs.concat(page);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  for (const reg of regs) {
    const bk = reg.bookings || {};
    if (!reg.room) continue;
    const guests = Array.isArray(reg.guests) ? reg.guests : [];
    if (guests.length) {
      for (const g of guests) {
        if (!g.name) continue;
        if (qNorm && !norm(g.name).includes(qNorm)) continue;
        items.push({
          name:           g.name,
          room:           reg.room,
          checkIn:        bk.start_date  || null,
          checkOut:       bk.end_date    || null,
          retreatName:    bk.retreat_name || null,
          source:         'registration',
          registrationId: reg.id,
        });
      }
    }
  }

  // ── 2. Fetch booking_requests with future check-out ───────────────────────
  let reqs = [];
  const reqUrl = `${SUPABASE_URL}/rest/v1/booking_requests`
    + `?select=id,room,room_type_name,first_name,last_name,check_in,check_out`
    + `&check_out=gte.${today}`
    + `&order=check_in.asc`;
  const reqRes = await fetch(reqUrl, { headers: supaHdrs });
  if (reqRes.ok) reqs = await reqRes.json();

  for (const req of (Array.isArray(reqs) ? reqs : [])) {
    const name = [req.first_name, req.last_name].filter(Boolean).join(' ').trim();
    if (!name) continue;
    const room = req.room || req.room_type_name || null;
    if (qNorm && !norm(name).includes(qNorm)) continue;
    items.push({
      name,
      room,
      checkIn:          req.check_in  || null,
      checkOut:         req.check_out || null,
      retreatName:      null,
      source:           'booking_request',
      bookingRequestId: req.id,
    });
  }

  // De-dupe by name + room
  const seen = new Set();
  const unique = items.filter(x => {
    const k = norm(x.name) + '|' + x.room;
    return seen.has(k) ? false : (seen.add(k), true);
  });

  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ guests: unique }),
  };
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonErr(code, msg) {
  return {
    statusCode: code,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: msg }),
  };
}
