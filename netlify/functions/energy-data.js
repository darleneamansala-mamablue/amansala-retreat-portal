'use strict';

// energy-data.js — occupancy for energy.html (rooms taken per night, no names), read on the server instead of with the
// public database key (security plan phase 4, 2026-11-02).
//   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD   {bookings:[{start_date,end_date,status,blocked_rooms}], roomTypes:[{id,rooms}]}
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const reply = (code, data) => ({ statusCode: code, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const day = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;

exports.handler = async (event) => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  const q = event.queryStringParameters || {}, from = day(q.from), to = day(q.to);
  if (!from || !to) return reply(400, { error: 'Pick a date range' });
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const [b, rt] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/bookings?start_date=lte.${to}&end_date=gte.${from}&status=neq.cancelled&select=start_date,end_date,status,blocked_rooms`, { headers: h }),
      fetch(`${SUPABASE_URL}/rest/v1/room_types?select=id,rooms`, { headers: h }),
    ]);
    if (!b.ok) throw new Error('bookings ' + b.status);
    return reply(200, { bookings: await b.json(), roomTypes: rt.ok ? await rt.json() : [] });
  } catch (e) { console.error('[energy-data]', e); return reply(500, { error: 'Could not load bookings' }); }
};
