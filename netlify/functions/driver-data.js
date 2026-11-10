'use strict';

// driver-data.js — the drivers' page (driver-view.html?co=irving|salomon), on the server (security plan phase 3,
// 2026-11-02). The page used to read EVERY transport row, booking and registration (all guests' emails and phones) with
// the public key, and confirming a ride wrote back its whole copy of the row, undoing office edits made since it loaded.
//   GET  ?co=irving|salomon   that company's rides only: guest name, room, flight, times, notes, confirmed; no email/phone
//   POST {co, rowIds, confirmed}   sets ONLY data.driver_confirmed, on rows that belong to that company
const crypto = require('crypto');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const hdrs = key => ({ apikey: key, Authorization: `Bearer ${key}` });
const reply = (code, data) => ({ statusCode: code, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Portal-Token', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
// Drivers sign in (Jorge 2026-11-10, security review: ?co=irving answered anyone with every ride, guest names and flights):
// a driver's database pass (portal-login, kind driver) or a staff pass. A driver only ever gets their own company's rides --
// the company comes from the account, not from the link.
const coOfAccount = n => /irving/i.test(n || '') ? 'irving' : /sal[oa]m[oó]n/i.test(n || '') ? 'salomon' : '';
const DATA_KEYS = ['firstName', 'lastName', 'arrivalDate', 'arrivalTime', 'arrivalAirport', 'arrivalOT', 'departureDate', 'departureTime', 'departureAirport', 'departureOT',
  'flightNumber', 'willingToShare', 'notes', 'driver_confirmed', 'departurePickupOverride', 'flightLabel'];

// same rule as driver-view.html: Irving = Tulum both ways + Cancún departures; Salomón = Cancún arrivals
function matchesCo(co, airport, type) {
  const ap = String(airport || '').toLowerCase();
  if (co === 'irving') return ap === 'tulum' || (ap === 'cancun' && type === 'departure');
  if (co === 'salomon') return ap === 'cancun' && type === 'arrival';
  return false;
}
const forCo = (co, d) => !!d && ((d.arrivalDate && matchesCo(co, d.arrivalAirport, 'arrival')) || (d.departureDate && matchesCo(co, d.departureAirport, 'departure')));

async function getAll(key, path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { ...hdrs(key), Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(path.split('?')[0] + ' ' + r.status);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Portal-Token' }, body: '' };
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  const who = await require('./portal-auth-lib').portalAllowed(event, { roles: ['driver'] });
  if (!who) return reply(401, { error: 'Sign in' });
  const accountCo = who.app_role === 'driver' ? coOfAccount(who.name) : null;
  if (who.app_role === 'driver' && !accountCo) return reply(403, { error: 'This account is not linked to a transport company' });
  try {
    if (event.httpMethod === 'GET') {
      const co = accountCo || String((event.queryStringParameters || {}).co || '').toLowerCase();
      if (co !== 'irving' && co !== 'salomon') return reply(400, { error: 'Unknown company' });
      const [rows, bookings, groupsRow] = await Promise.all([
        getAll(key, 'transport?select=id,booking_id,data,submitted_at'),
        getAll(key, 'bookings?select=id,leader_name,retreat_name,start_date,end_date,status&status=neq.cancelled'),
        getAll(key, 'settings?key=eq.transport_groups&select=value'),
      ]);
      const mine = rows.filter(r => forCo(co, r.data));
      const bkIds = [...new Set(mine.map(r => r.booking_id).filter(Boolean))];
      const regs = [];
      for (let i = 0; i < bkIds.length; i += 80) regs.push(...await getAll(key, `registrations?booking_id=in.(${bkIds.slice(i, i + 80).map(encodeURIComponent).join(',')})&select=booking_id,room,guests`));
      // room by name: exact, then a unique first name, then a unique email (same as the page used to do)
      const exact = {}, first = {}, byEmail = {};
      regs.forEach(r => (r.guests || []).forEach(g => {
        if (!g || !g.name || !r.booking_id) return;
        exact[`${r.booking_id}|${g.name.toLowerCase()}`] = r.room || '';
        const fn = g.name.trim().split(/\s+/)[0].toLowerCase();
        if (fn.length >= 3) { const k = `${r.booking_id}|${fn}`; first[k] = first[k] || { room: r.room || '', count: 0 }; first[k].count++; }
        if (g.email) { const k = `${r.booking_id}|${g.email.toLowerCase().trim()}`; byEmail[k] = byEmail[k] || { room: r.room || '', count: 0 }; byEmail[k].count++; }
      }));
      const roomFor = (bk, d) => {
        const name = [d.firstName, d.lastName].filter(Boolean).join(' ').toLowerCase();
        if (exact[`${bk}|${name}`]) return exact[`${bk}|${name}`];
        const fn = String(d.firstName || '').trim().toLowerCase();
        if (fn.length >= 3) { const f = first[`${bk}|${fn}`]; if (f && f.count === 1) return f.room; }
        const em = String(d.email || '').toLowerCase().trim();
        if (em && bk) { const e = byEmail[`${bk}|${em}`]; if (e && e.count === 1) return e.room; }
        return '';
      };
      const used = new Set(mine.map(r => r.booking_id));
      return reply(200, {
        co, name: who.name || '',
        rows: mine.map(r => {
          const d = r.data || {}, data = {};
          DATA_KEYS.forEach(k => { if (d[k] !== undefined) data[k] = d[k]; });
          // the page groups one guest's repeated submissions by email: it gets a fingerprint, not the address
          const em = String(d.email || '').toLowerCase().trim();
          return { id: r.id, booking_id: r.booking_id, submitted_at: r.submitted_at, data, room: roomFor(r.booking_id, d), emailKey: em ? crypto.createHash('sha256').update(em).digest('hex').slice(0, 16) : '' };
        }),
        bookings: bookings.filter(b => used.has(b.id)).map(b => ({ id: b.id, leader_name: b.leader_name, retreat_name: b.retreat_name, start_date: b.start_date, end_date: b.end_date })),
        groups: (groupsRow[0] && groupsRow[0].value) || [],
      });
    }
    if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
    let b;
    try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
    const co = accountCo || String(b.co || '').toLowerCase();
    if (co !== 'irving' && co !== 'salomon') return reply(400, { error: 'Unknown company' });
    const ids = (Array.isArray(b.rowIds) ? b.rowIds : []).map(String).slice(0, 50);
    const failed = [];
    for (const id of ids) {
      try {
        // the row as it is NOW (office edits since the page loaded are kept), only this one field changed
        const [row] = await getAll(key, `transport?id=eq.${encodeURIComponent(id)}&select=id,data`);
        if (!row || !forCo(co, row.data)) { failed.push(id); continue; }
        const r = await fetch(`${SUPABASE_URL}/rest/v1/transport?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: { ...hdrs(key), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ data: { ...row.data, driver_confirmed: !!b.confirmed } }),
        });
        if (!r.ok) failed.push(id);
      } catch (e) { failed.push(id); }
    }
    return reply(200, { ok: failed.length === 0, failed });
  } catch (e) {
    console.error('[driver-data]', e);
    return reply(500, { error: 'Could not load the rides' });
  }
};
