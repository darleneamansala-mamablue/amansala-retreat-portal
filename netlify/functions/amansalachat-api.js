'use strict';

// GET /.netlify/functions/amansalachat-api?action=...
// Read-only API for "amansalachat" (guest messaging / tickets app), called
// server-to-server. Tells it who is in which room, and lets it match an
// incoming WhatsApp/email to a stay.
//
// Auth: Authorization: Bearer <AMANSALACHAT_API_KEY> (env var).
//
// Actions:
//   rooms                              → { rooms:[{ room, type_id, type_name }] }
//   stays&from=YYYY-MM-DD[&to=…]       → { stays:[Stay] } overlapping [from,to]
//                                         (check_in <= to AND check_out >= from;
//                                         to defaults to from; max 62 days)
//   lookup&phone=… | &email=…          → { stays:[Stay] } any date, newest first, max 50
//
// Stay: { source:'retreat'|'room_only', id:'reg:<id>'|'req:<id>', booking_id,
//         booking_name, room, room_type, check_in, check_out, checked_in_at,
//         checked_out_at, status, guests:[{ name, email, phone, phone_e164,
//         check_in, check_out, folio_id }], folio_id, notes }
//
// Occupancy rules are the same as send-checkout-payment-links.js /
// xetux-reservation-lookup.js / housekeeping: skip cancelled bookings,
// cancelled registrations, rooms no longer in the booking's blocked_rooms and
// guests marked cancelled; a reg's own check_in/check_out wins over the
// booking's dates, and a guest's own checkIn/checkOut wins over the reg's
// (booking-hub guestNights()). Room Only = booking_requests with a room and
// status not declined/cancelled.
//
// Nunca devuelve payment_token, datos de tarjeta ni campos de Stripe — every
// field in the response is whitelisted below.

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vnttlpqkssihbmcynxvo.supabase.co';
const MAX_RANGE_DAYS = 62;
const LOOKUP_LIMIT = 50;
const PAGE = 1000;
// Retreat regs/guests can start before / end after their booking's dates
// (extra nights) — widen the bookings query by this much, then filter exactly.
const BOOKING_MARGIN_DAYS = 31;

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// Constant-time compare of the bearer token
function authorized(header, expected) {
  const m = /^Bearer\s+(.+)$/i.exec(String(header || '').trim());
  if (!m) return false;
  const a = Buffer.from(m[1].trim());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Same as send-checkout-payment-links.js — stored phones are free-form; a bare
// 10-digit number is sent as +1. Returns null if unusable.
function toE164(raw) {
  const s = String(raw || '').replace(/[‪-‮]/g, '').trim();
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return digits.length >= 10 && digits.length <= 15 ? '+' + digits : null;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length === 12 && digits.startsWith('52')) return '+' + digits;
  if (digits.length === 13 && digits.startsWith('521')) return '+' + digits;
  return null;
}

const last10 = p => String(p || '').replace(/\D/g, '').slice(-10);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s));
const addDays = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const day = v => (v ? String(v).slice(0, 10) : null);
const minD = arr => arr.filter(Boolean).sort()[0] || null;
const maxD = arr => arr.filter(Boolean).sort().slice(-1)[0] || null;
const normName = s => String(s || '').trim().toLowerCase();

exports.handler = async event => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const apiKey = process.env.AMANSALACHAT_API_KEY;
  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!apiKey || !supaKey) { console.error('[amansalachat-api] AMANSALACHAT_API_KEY / SUPABASE_SERVICE_KEY missing'); return json(500, { error: 'Server config error' }); }

  const hdr = event.headers || {};
  if (!authorized(hdr.authorization || hdr.Authorization, apiKey)) return json(401, { error: 'Unauthorized' });

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };
  const get = async path => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: hdrs });
    if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };
  // PostgREST caps each response (max-rows) — page with Range until short page
  const getAll = async path => {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { ...hdrs, 'Range-Unit': 'items', Range: `${from}-${from + PAGE - 1}` } });
      if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const rows = await r.json();
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  };
  // id=in.(…) in chunks so the URL stays short
  const getIn = async (table, select, col, ids, extra = '') => {
    const out = [];
    const uniq = [...new Set(ids.filter(v => v != null))];
    for (let i = 0; i < uniq.length; i += 100) {
      out.push(...await getAll(`${table}?select=${select}&${col}=in.(${uniq.slice(i, i + 100).map(encodeURIComponent).join(',')})${extra}`));
    }
    return out;
  };

  const roomTypeMap = async () => {
    const rts = await getAll('room_types?select=id,name,rooms&order=id');
    const byRoom = {};
    rts.forEach(rt => (rt.rooms || []).forEach(room => { if (!byRoom[room]) byRoom[room] = { type_id: rt.id, type_name: rt.name }; }));
    return { rts, byRoom };
  };

  // ── Build Stay objects ─────────────────────────────────────────────────────
  // range = { from, to } → keep only guests/stays overlapping it; null = all
  async function buildStays({ bookings, regs, reqs, range }) {
    const { byRoom } = await roomTypeMap();
    const bkById = Object.fromEntries(bookings.map(b => [b.id, b]));
    const overlaps = (ci, co) => !range || ((!ci || ci <= range.to) && (!co || co >= range.from));
    const stays = [];

    regs.forEach(reg => {
      const bk = bkById[reg.booking_id];
      if (!bk || bk.status === 'cancelled' || reg.cancelled) return;
      if (Array.isArray(bk.blocked_rooms) && bk.blocked_rooms.length && !bk.blocked_rooms.includes(reg.room)) return;
      const regIn = day(reg.check_in) || day(bk.start_date);
      const regOut = day(reg.check_out) || day(bk.end_date);
      const guests = (Array.isArray(reg.guests) ? reg.guests : [])
        .filter(g => g && !g.cancelled && (g.name || g.email || g.phone))
        .map(g => ({
          name: g.name || null, email: g.email || null, phone: g.phone || null, phone_e164: toE164(g.phone),
          check_in: day(g.checkIn) || regIn, check_out: day(g.checkOut) || regOut,
        }))
        .filter(g => overlaps(g.check_in, g.check_out));
      const ci = minD([regIn, ...guests.map(g => g.check_in)]);
      const co = maxD([regOut, ...guests.map(g => g.check_out)]);
      if (!overlaps(ci, co)) return;
      // A reg with no guest names yet still occupies the room; one whose guests
      // are all cancelled / outside the range does not.
      if (range && !guests.length && (reg.guests || []).length) return;
      stays.push({
        source: 'retreat', id: `reg:${reg.id}`, _anchor: ['registration_id', reg.id],
        booking_id: bk.id, booking_name: bk.retreat_name || bk.leader_name || null, booking_type: bk.booking_type || null,
        room: reg.room || null, room_type: (byRoom[reg.room] || {}).type_name || null,
        check_in: ci, check_out: co, checked_in_at: reg.checked_in_at || null, checked_out_at: reg.checked_out_at || null,
        status: bk.status || null, guests, folio_id: null, notes: reg.notes || null,
      });
    });

    reqs.forEach(rq => {
      if (!rq.room || ['declined', 'cancelled'].includes(rq.status)) return;
      const ci = day(rq.check_in), co = day(rq.check_out);
      if (!overlaps(ci, co)) return;
      const name = [rq.first_name, rq.last_name].filter(Boolean).join(' ').trim() || null;
      stays.push({
        source: 'room_only', id: `req:${rq.id}`, _anchor: ['booking_request_id', rq.id],
        booking_id: rq.id, booking_name: 'Room Only', booking_type: 'room_only',
        room: rq.room, room_type: rq.room_type_name || (byRoom[rq.room] || {}).type_name || null,
        check_in: ci, check_out: co, checked_in_at: rq.checked_in_at || null, checked_out_at: rq.checked_out_at || null,
        status: rq.status || null,
        guests: [{ name, email: rq.email || null, phone: rq.phone || null, phone_e164: toE164(rq.phone), check_in: ci, check_out: co }],
        folio_id: null, notes: rq.notes || rq.special_requests || null,
      });
    });

    // Folios (id only — never payment_token): per guest by name, stay = oldest
    const folios = [
      ...await getIn('folios', 'id,registration_id,guest_name,status,created_at', 'registration_id', stays.filter(s => s.source === 'retreat').map(s => s._anchor[1]), '&order=created_at'),
      ...await getIn('folios', 'id,booking_request_id,guest_name,status,created_at', 'booking_request_id', stays.filter(s => s.source === 'room_only').map(s => s._anchor[1]), '&order=created_at'),
    ];
    stays.forEach(s => {
      const [col, id] = s._anchor;
      delete s._anchor;
      const mine = folios.filter(f => f[col] === id).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1));
      s.folio_id = mine[0] ? mine[0].id : null;
      s.guests.forEach(g => { const f = mine.find(x => normName(x.guest_name) && normName(x.guest_name) === normName(g.name)); g.folio_id = f ? f.id : null; });
    });
    return stays;
  }

  const qs = event.queryStringParameters || {};
  const action = qs.action;

  try {
    // ── rooms ────────────────────────────────────────────────────────────────
    if (action === 'rooms') {
      const { rts } = await roomTypeMap();
      const seen = new Set();
      const rooms = [];
      rts.forEach(rt => (rt.rooms || []).forEach(room => {
        if (seen.has(room)) return;
        seen.add(room);
        rooms.push({ room, type_id: rt.id, type_name: rt.name });
      }));
      return json(200, { rooms });
    }

    // ── stays ────────────────────────────────────────────────────────────────
    if (action === 'stays') {
      const from = qs.from, to = qs.to || qs.from;
      if (!isDate(from) || !isDate(to) || to < from) return json(400, { error: 'from/to must be YYYY-MM-DD, to >= from' });
      if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_RANGE_DAYS) return json(400, { error: `Max range is ${MAX_RANGE_DAYS} days` });

      const bookings = await getAll(`bookings?select=id,retreat_name,leader_name,start_date,end_date,status,blocked_rooms,booking_type`
        + `&status=neq.cancelled&start_date=lte.${addDays(to, BOOKING_MARGIN_DAYS)}&end_date=gte.${addDays(from, -BOOKING_MARGIN_DAYS)}`);
      const regs = await getIn('registrations', 'id,booking_id,room,guests,check_in,check_out,checked_in_at,checked_out_at,notes,cancelled', 'booking_id', bookings.map(b => b.id));
      const reqs = await getAll(`booking_requests?select=*&room=not.is.null&status=not.in.(declined,cancelled)&check_in=lte.${to}&check_out=gte.${from}`);
      const stays = await buildStays({ bookings, regs, reqs, range: { from, to } });
      stays.sort((a, b) => String(a.room).localeCompare(String(b.room), 'en', { numeric: true }) || String(a.check_in).localeCompare(String(b.check_in)));
      return json(200, { stays });
    }

    // ── lookup ───────────────────────────────────────────────────────────────
    if (action === 'lookup') {
      const email = String(qs.email || '').trim().toLowerCase();
      const phone = last10(qs.phone);
      if (!email && phone.length < 7) return json(400, { error: 'phone or email required' });
      const guestMatches = g => g && !g.cancelled && (
        (email && String(g.email || '').trim().toLowerCase() === email) ||
        (phone && last10(g.phone) === phone));

      // Retreats: guests is a JSONB array of free-form contacts, so scan the
      // last ~2 years of bookings' registrations (narrow select) and match in JS.
      const since = addDays(new Date().toISOString().slice(0, 10), -730);
      const bookings = await getAll(`bookings?select=id,retreat_name,leader_name,start_date,end_date,status,blocked_rooms,booking_type&status=neq.cancelled&end_date=gte.${since}`);
      const lite = await getIn('registrations', 'id,guests', 'booking_id', bookings.map(b => b.id));
      const hitIds = lite.filter(r => (r.guests || []).some(guestMatches)).map(r => r.id);
      const regs = hitIds.length
        ? await getIn('registrations', 'id,booking_id,room,guests,check_in,check_out,checked_in_at,checked_out_at,notes,cancelled', 'id', hitIds)
        : [];

      // Room Only: email filter server-side; phone is free-form → narrow select, match in JS
      let reqs = [];
      if (email) reqs = await getAll(`booking_requests?select=*&room=not.is.null&email=ilike.${encodeURIComponent(email.replace(/[%_*]/g, ''))}&order=check_in.desc&limit=${LOOKUP_LIMIT}`);
      if (phone) {
        const lr = await getAll(`booking_requests?select=id,phone&room=not.is.null&phone=not.is.null&check_out=gte.${since}`);
        const ids = lr.filter(r => last10(r.phone) === phone).map(r => r.id).filter(id => !reqs.some(x => x.id === id));
        if (ids.length) reqs.push(...await getIn('booking_requests', '*', 'id', ids));
      }

      let stays = await buildStays({ bookings, regs, reqs, range: null });
      // Only the matching guests' stays (a reg can hold several guests — return the whole room)
      stays.sort((a, b) => String(b.check_in).localeCompare(String(a.check_in)));
      stays = stays.slice(0, LOOKUP_LIMIT);
      return json(200, { stays });
    }

    return json(400, { error: 'Unknown action (rooms | stays | lookup)' });
  } catch (e) {
    console.error('[amansalachat-api]', action, e.message);
    return json(502, { error: 'Upstream error' });
  }
};
