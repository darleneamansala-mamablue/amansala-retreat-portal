'use strict';

// hk-staging.js — the Housekeeping app (amansala-housekeeping.netlify.app) reads the portal's rooms through here (Jorge
// 2026-11-06: "staging portal en housekeeping app no ven los cuartos"). It used to read bookings / registrations /
// booking_requests / room_types straight from this database with the public key, and since every table got its access rules
// (2026-11-02) that key sees nothing. Only a person signed in to the Housekeeping app gets an answer: their own sign-in token
// is checked with the Housekeeping app's database. Answers only what the app shows: rooms, guest names, dates, check-in state.
//   GET  ?action=day&date=YYYY-MM-DD  -> { bookings, requests, regs }   (the same fields the app used to read)
//   GET  ?action=roomTypes            -> { roomTypes: [{name, rooms}] }
//   POST ?action=roomClean {room_name} -> marks the room clean in room_status
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const HK_URL = 'https://fzresosiqafiyxfgeyvk.supabase.co', HK_PUBLIC_KEY = 'sb_publishable_SG-1dCQntmSYtb1zwgl7Vg_-nAlTrsB';
const ORIGINS = ['https://amansala-housekeeping.netlify.app', 'http://localhost:8888'];
const cors = o => ({ 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' });

exports.handler = async (event) => {
  const h = cors((event.headers || {}).origin || (event.headers || {}).Origin);
  const reply = (code, body) => ({ statusCode: code, headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: h, body: '' };
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });

  // signed in to the Housekeeping app?
  const tok = String((event.headers || {}).authorization || (event.headers || {}).Authorization || '').replace(/^Bearer\s+/i, '');
  if (!tok) return reply(401, { error: 'Sign in again.' });
  const ur = await fetch(`${HK_URL}/auth/v1/user`, { headers: { apikey: HK_PUBLIC_KEY, Authorization: `Bearer ${tok}` } }).catch(() => null);
  if (!ur || !ur.ok) return reply(401, { error: 'Sign in again.' });

  const H = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async p => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(p.split('?')[0] + ' ' + r.status); return r.json(); };
  const q = event.queryStringParameters || {}, action = q.action || '';
  try {
    if (action === 'day') {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
      const [bookings, requests] = await Promise.all([
        get(`bookings?select=id,retreat_name,start_date,end_date,status,booking_type,blocked_rooms&status=neq.cancelled&start_date=lte.${day}&end_date=gte.${day}&limit=1000`),
        get(`booking_requests?select=room,first_name,last_name,check_in,check_out,status,checked_in_at,checked_out_at&check_in=lte.${day}&check_out=gte.${day}&status=in.(paid,in_house,checked_out)&limit=1000`),
      ]);
      const ids = bookings.map(b => b.id), regs = [];
      for (let i = 0; i < ids.length; i += 80) {
        regs.push(...await get(`registrations?select=room,guests,booking_id,cancelled,check_in,check_out,checked_in_at,checked_out_at&booking_id=in.(${ids.slice(i, i + 80).map(encodeURIComponent).join(',')})&limit=2000`));
      }
      // only what housekeeping needs from each guest: the name
      regs.forEach(r => { r.guests = (r.guests || []).map(g => ({ name: g && g.name, cancelled: !!(g && g.cancelled) })); });
      return reply(200, { bookings, requests, regs });
    }
    if (action === 'roomTypes') return reply(200, { roomTypes: await get('room_types?select=name,rooms&order=name') });
    if (action === 'roomClean' && event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}'), room = String(b.room_name || '').trim().slice(0, 60);
      if (!room) return reply(400, { error: 'room_name' });
      const r = await fetch(`${SUPABASE_URL}/rest/v1/room_status?on_conflict=room_name`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ room_name: room, status: 'clean', updated_at: new Date().toISOString() }) });
      return reply(r.ok ? 200 : 500, { ok: r.ok });
    }
    return reply(400, { error: 'Unknown action' });
  } catch (e) {
    console.error('[hk-staging]', e.message);
    return reply(500, { error: 'Could not load the portal rooms.' });
  }
};
