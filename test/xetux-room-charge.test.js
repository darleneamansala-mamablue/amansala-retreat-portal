'use strict';
// xetux-reservation-lookup.js + xetux-room-charge.js against a fake database: lookup by name or room (in-house only),
// a ticket posted once (retries do nothing), tip on its own line, void, wrong folio / checked-out guest refused.
const assert = require('assert');
process.env.XETUX_API_TOKEN = 't'; process.env.SUPABASE_SERVICE_KEY = 'k';
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
const add = n => new Date(Date.parse(today + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const db = {
  bookings: [{ id: 'b1', start_date: add(-2), end_date: add(3), status: 'confirmed' }],
  registrations: [{ id: 'r1', booking_id: 'b1', room: '13b', guests: [{ name: 'Jane Doe' }], check_in: null, check_out: null, checked_in_at: 'x', checked_out_at: null },
    { id: 'r2', booking_id: 'b1', room: 'GV2', guests: [{ name: 'Old Guest' }], check_in: null, check_out: null, checked_in_at: 'x', checked_out_at: 'y' }],
  booking_requests: [], folios: [{ id: 'f1', registration_id: 'r1', status: 'open', guest_name: 'Jane Doe' }], folio_items: [],
};
let seq = 0;
global.fetch = async (url, opt = {}) => {
  const res = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
  const u = new URL(url), t = u.pathname.split('/').pop(), m = opt.method || 'GET';
  if (t === 'find_or_create_folio') return res(200, db.folios.find(f => f.registration_id === JSON.parse(opt.body).p_registration_id) || null);
  if (m === 'POST') { const rows = [].concat(JSON.parse(opt.body)).map(r => ({ id: 'i' + (++seq), ...r })); db[t].push(...rows); return res(201, rows); }
  let rows = db[t] || [];
  for (const [k, v] of u.searchParams) {
    if (['select', 'limit', 'order', 'offset'].includes(k)) continue;
    if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === v.slice(3));
    if (v.startsWith('ilike.')) { const needle = v.slice(6).replace(/^\*|\*$/g, '').toLowerCase(); rows = rows.filter(r => String(r[k]).toLowerCase().includes(needle)); }
  }
  return res(200, rows);
};
const look = require('../netlify/functions/xetux-reservation-lookup');
const ch = require('../netlify/functions/xetux-room-charge');
const get = qs => look.handler({ httpMethod: 'GET', headers: { authorization: 'Bearer t' }, queryStringParameters: qs }).then(r => JSON.parse(r.body));
const post = (b, tok = 't') => ch.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + tok }, body: JSON.stringify(b) }).then(r => ({ code: r.statusCode, ...JSON.parse(r.body) }));
(async () => {
  let r = await get({ guestName: 'jane doe' }); assert.ok(r.success); assert.strictEqual(r.data[0].roomNumber, '13b'); assert.strictEqual(r.data[0].folio, 'f1');
  r = await get({ roomNumber: '13B' }); assert.strictEqual(r.data[0].guestName, 'Jane Doe');
  r = await get({ roomNumber: 'GV2' }); assert.strictEqual(r.error, 'NO_ACTIVE_RESERVATION');          // checked out
  db.registrations.push({ id: 'r3', booking_id: 'b1', room: '14a', guests: [{ name: 'Not Yet' }], check_in: null, check_out: null, checked_in_at: null, checked_out_at: null });
  r = await get({ checkedIn: 'true' }); assert.ok(r.success); assert.deepStrictEqual(r.data.map(x => x.guestName), ['Jane Doe']);   // checked in only, not checked out
  r = await get({}); assert.strictEqual(r.success, false);
  assert.strictEqual((await post({ ticketId: '1' }, 'bad')).code, 401);
  r = await post({ ticketId: '174407', folio: 'f1', reservationID: 'r1', subtotal: 48, tip: 7, waiter: 'Ana', items: [{ description: 'Tacos', quantity: 2 }] });
  assert.ok(r.success); assert.strictEqual(r.charged, 61.24); assert.strictEqual(db.folio_items.length, 2); assert.strictEqual(r.balance, 61.24);
  assert.ok(/Restaurant \(Xetux #174407\) · Ana · 2× Tacos/.test(db.folio_items[0].description)); assert.strictEqual(db.folio_items[0].tax_rate, 13);
  r = await post({ ticketId: '174407', folio: 'f1', reservationID: 'r1', subtotal: 48 }); assert.ok(r.alreadyPosted); assert.strictEqual(db.folio_items.length, 2);
  r = await post({ ticketId: '17440', folio: 'f1', reservationID: 'r1', subtotal: 10 }); assert.ok(r.success && !r.alreadyPosted);     // a ticket id that is a prefix of another
  r = await post({ ticketId: '9', folio: 'fX', reservationID: 'r1', subtotal: 10 }); assert.strictEqual(r.error, 'FOLIO_NOT_FOUND');
  r = await post({ ticketId: '9', folio: 'f1', reservationID: 'r2', subtotal: 10 }); assert.strictEqual(r.error, 'NO_ACTIVE_RESERVATION');
  r = await post({ ticketId: '9', folio: 'f1', reservationID: 'r1', subtotal: -1 }); assert.strictEqual(r.error, 'INVALID_AMOUNT');
  r = await post({ action: 'void', ticketId: '174407', reason: 'wrong room' }); assert.ok(r.voided); assert.strictEqual(r.balance, 11.3);
  r = await post({ action: 'void', ticketId: '174407' }); assert.ok(r.alreadyVoided);
  console.log('xetux room charge: ok');
})().catch(e => { console.error(e); process.exit(1); });
