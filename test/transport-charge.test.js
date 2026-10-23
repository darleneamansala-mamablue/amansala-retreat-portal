// Plain Node test harness for auto-charge-transport.js / adjust-transport-charge.js (transport-charge-lib.js) -- no framework,
// matching this repo's no-build-step convention. Run with: node test/transport-charge.test.js
// An in-memory stand-in for the Supabase REST API (just the filters these functions use) runs the real handlers end to end,
// writes included. Covers the 2026-10-21/22 double charges: duplicate transport rows charged once per row, and a regroup
// posting a new charge while the old one stayed on the folio.
const W = require('path').join(__dirname, '..');
let DB;
const parse = (url) => { const u = new URL(url); const table = u.pathname.split('/').pop(); const f = []; let limit = Infinity, offset = 0;
  for (const [k, v] of u.searchParams) { if (k === 'select' || k === 'order') continue; if (k === 'limit') { limit = +v; continue; } if (k === 'offset') { offset = +v; continue; }
    if (k === 'or') { f.push(['__or', 'or', v.slice(1, -1).split(',').map(c => { const a = c.split('.'); return [a[0], a[1], a.slice(2).join('.')]; })]); continue; }
    const i = v.indexOf('.'); f.push([k, v.slice(0, i), v.slice(i + 1)]); } return { table, f, limit, offset }; };
const like = (pat, s, ci) => new RegExp('^' + pat.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', ci ? 'i' : '').test(String(s ?? ''));
const match = (row, f) => f.every(([k, op, v]) => { const x = row[k];
  if (op === 'or') return v.some(c => match(row, [c])); if (op === 'eq') return String(x) === v; if (op === 'neq') return String(x) !== v; if (op === 'in') return v.slice(1, -1).split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(x));
  if (op === 'like') return like(v, x); if (op === 'ilike') return like(v, x, true); if (op === 'gte') return String(x) >= v; if (op === 'lt') return String(x) < v; if (op === 'gt') return String(x) > v; throw new Error('op ' + op); });
let seq = 0;
global.fetch = async (url, opts = {}) => {
  const m = opts.method || 'GET', q = parse(url), t = (DB[q.table] ||= []);
  const ok = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
  if (m === 'GET') return ok(t.filter(r => match(r, q.f)).slice(q.offset, q.offset + q.limit));
  if (m === 'POST') { const b = JSON.parse(opts.body); const row = { id: b.id || `${q.table}_${++seq}`, created_at: new Date(Date.now() + seq * 1000).toISOString(), ...b }; t.push(row); return ok([row], 201); }
  if (m === 'PATCH') { const b = JSON.parse(opts.body); const rs = t.filter(r => match(r, q.f)); rs.forEach(r => Object.assign(r, b)); return ok(rs); }
  if (m === 'DELETE') { const rs = t.filter(r => match(r, q.f)); DB[q.table] = t.filter(r => !rs.includes(r)); return ok(rs); }
};
console.log = ((l) => (...a) => { if (!/^\[(auto|adjust)/.test(String(a[0]))) l(...a); })(console.log);
process.env.SUPABASE_SERVICE_KEY = 'x';
const auto = require(W + '/netlify/functions/auto-charge-transport.js').handler;
const adjust = require(W + '/netlify/functions/adjust-transport-charge.js').handler;
const runAuto = (date, type) => auto({ httpMethod: 'POST', queryStringParameters: { date, type } }).then(r => JSON.parse(r.body));
const runAdj = (rowId, direction) => adjust({ httpMethod: 'POST', queryStringParameters: {}, body: JSON.stringify({ rowId, direction }) }).then(r => JSON.parse(r.body));
const D = '2026-11-10';
const row = (id, first, last, extra = {}) => ({ id, booking_id: 'bk1', submitted_at: extra.at || '2026-11-01T10:00:00Z', data: { firstName: first, lastName: last, email: extra.email || `${first}@x.com`, arrivalDate: '2026-11-05', departureDate: D, departureTime: extra.time || '12:00', departureAirport: 'cancun', departureOT: !!extra.ot, flightNumber: 'AA1', ...(extra.data || {}) } });
const fresh = () => { seq = 0; DB = {
  bookings: [{ id: 'bk1', flags: [], leader_name: 'Leader' }],
  registrations: [{ id: 'r1', booking_id: 'bk1', room: '10', guests: [{ name: 'Ana Lopez' }] }, { id: 'r2', booking_id: 'bk1', room: '11', guests: [{ name: 'Bea Ruiz' }] },
                  { id: 'r3', booking_id: 'bk1', room: '12', guests: [{ name: 'Cal Diaz' }, { name: 'Dee Diaz' }] }],
  folios: [{ id: 'f1', registration_id: 'r1', guest_name: 'Ana Lopez', status: 'open' }, { id: 'f2', registration_id: 'r2', guest_name: 'Bea Ruiz', status: 'open' }, { id: 'f3', registration_id: 'r3', guest_name: 'Cal Diaz', status: 'open' }],
  folio_items: [], transport: [], settings: [], app_store: [] }; };
const dep = () => DB.folio_items.filter(i => i.description.startsWith('Departure')).map(i => `${DB.folios.find(f => f.id === i.folio_id).guest_name}: $${i.unit_price} "${i.description}"`);
let fails = 0; const check = (name, cond, extra) => { console.log((cond ? 'ok   ' : 'FAIL ') + ' ' + name + (cond ? '' : '\n      ' + JSON.stringify(extra))); if (!cond) fails++; };
(async () => {
  // A. Duplicate rows (placeholder stub + real form): one charge, and the stub does not count as a passenger
  fresh();
  DB.transport.push(row('stub', 'Ana', 'Lopez', { at: '2026-10-01T00:00:00Z', data: { flightNumber: '', arrivalDate: '' } }), row('real', 'Ana', 'Lopez'));
  await runAuto(D, 'departure');
  check('A. Ana has 2 rows: one $195 charge (alone)', dep().length === 1 && /\$195/.test(dep()[0]), dep());
  // B. Second run (cron + button / retry): nothing added
  await runAuto(D, 'departure');
  check('B. A second run adds nothing', dep().length === 1, dep());
  // C. Regroup: Bea joins Ana's van -> Ana's charge is EDITED to $100, Bea gets one; no extra line
  DB.transport.push(row('bea', 'Bea', 'Ruiz', { time: '12:10' }));
  await runAdj('real', 'departure');
  check('C. Regroup: Ana edited to $100, Bea $100, no old charge left', dep().length === 2 && dep().every(x => /\$100/.test(x)), dep());
  // D. The charge is linked on the OTHER (stub) row and the real row lost its link -> still found and edited, not doubled
  const ana = DB.folio_items.find(i => i.folio_id === 'f1');
  DB.transport.find(r => r.id === 'real').data.folioCharged = {};
  DB.transport.find(r => r.id === 'stub').data.folioCharged = { departureFolioItemId: ana.id };
  DB.transport.find(r => r.id === 'bea').data.departureTime = '15:00';   // split: each alone again
  await runAdj('bea', 'departure');
  check('D. Split with the link on the stub row: Ana $195, Bea $195, nothing doubled', dep().length === 2 && dep().every(x => /\$195/.test(x)), dep());
  // E. Link lost entirely + a stray duplicate system line (the 2026-10-22 leftover): adjust leaves exactly one
  DB.folio_items.push({ id: 'old1', folio_id: 'f1', description: `Departure Transport ${D} — CANCUN 12:00 (adjusted)`, qty: 1, unit_price: 100, tax_rate: 13, category: 'Transport', created_at: '2026-11-01T00:00:00Z' });
  DB.transport.forEach(r => { if (r.data.folioCharged) r.data.folioCharged = {}; });
  await runAdj('real', 'departure');
  check('E. A leftover old system line is removed: one per guest', dep().length === 2 && dep().filter(x => x.startsWith('Ana')).length === 1, dep());
  // F. Guest switched to Own Transport -> their charge goes away
  DB.transport.find(r => r.id === 'bea').data.departureOT = true;
  await runAdj('bea', 'departure');
  check('F. Bea switches to Own Transport: her charge is removed', dep().length === 1 && dep()[0].startsWith('Ana'), dep());
  // G. Charged by hand -> nightly never adds a system charge next to it (own line, and a friend's line "(Name)")
  fresh();
  DB.transport.push(row('a', 'Ana', 'Lopez'), row('b', 'Bea', 'Ruiz', { time: '18:00' }));
  DB.folio_items.push({ id: 'm1', folio_id: 'f1', description: 'Departure Cancun airport 6 or + Sharing', qty: 1, unit_price: 45, category: 'Transport', created_at: '2026-11-08T10:00:00Z' },
                      { id: 'm2', folio_id: 'f1', description: 'Departure Cancun (Bea Rui)', qty: 1, unit_price: 45, category: 'Transport', created_at: '2026-11-08T10:01:00Z' });
  const g = await runAuto(D, 'departure');
  check('G. Charged by hand (own line and a friend\'s "(Name)" line): nothing added', dep().length === 2 && g.charged.length === 0, { dep: dep(), skipped: g.skipped });
  // H. King room, two guests on one registration: two charges, and an adjust keeps both
  fresh();
  DB.transport.push(row('c', 'Cal', 'Diaz'), row('d', 'Dee', 'Diaz'));
  await runAuto(D, 'departure');
  check('H1. Two guests in one room: two $100 charges', dep().length === 2 && dep().every(x => /\$100/.test(x)), dep());
  await runAdj('c', 'departure');
  check('H2. Adjust on that room: still two, unchanged', dep().length === 2 && dep().every(x => /\$100/.test(x)), dep());
  // I. Same person submitted on two retreats (Wendy Oberg weeks): one charge
  fresh();
  DB.bookings.push({ id: 'bk0', flags: [], leader_name: 'Leader' });
  DB.transport.push(row('w1', 'Ana', 'Lopez'), { ...row('w0', 'Ana', 'Lopez'), booking_id: 'bk0' });
  await runAuto(D, 'departure');
  check('I. Same person on two retreats: one $195 charge', dep().length === 1 && /\$195/.test(dep()[0]), dep());
  // J. Teacher pays: one total on the teacher room, adjust edits it
  fresh();
  DB.bookings[0].flags = ['teacher_pays_departure_transport'];
  DB.registrations.push({ id: 'rt', booking_id: 'bk1', room: 'T', is_teacher_room: true, guests: [{ name: 'Tea Cher' }] });
  DB.folios.push({ id: 'ft', registration_id: 'rt', guest_name: 'Tea Cher', status: 'open' });
  DB.transport.push(row('a', 'Ana', 'Lopez'), row('b', 'Bea', 'Ruiz', { time: '18:00' }));
  await runAuto(D, 'departure');
  check('J1. Teacher pays: one $390 charge', dep().length === 1 && /Tea Cher: \$390/.test(dep()[0]), dep());
  DB.transport.find(r => r.id === 'b').data.departureTime = '12:05';
  await runAdj('b', 'departure');
  check('J2. They share the van: the same charge becomes $200', dep().length === 1 && /Tea Cher: \$200/.test(dep()[0]), dep());
  // K. Two guests in one room, each with their own folio: each charge on its own folio, with the guest's name
  fresh();
  DB.folios.push({ id: 'f4', registration_id: 'r3', guest_name: 'Dee Diaz', status: 'open' });
  DB.transport.push(row('c', 'Cal', 'Diaz'), row('d', 'Dee', 'Diaz'));
  await runAuto(D, 'departure');
  check('K1. Room of two, two folios: one named charge on each', dep().length === 2 && dep().some(x => /^Cal Diaz: \$100 ".*— Cal Diaz"/.test(x)) && dep().some(x => /^Dee Diaz: \$100 ".*— Dee Diaz"/.test(x)), dep());
  // K2. Today's state: both lines identical on the first guest's folio -> adjust names them, moves nothing, adds nothing
  fresh();
  DB.folios.push({ id: 'f4', registration_id: 'r3', guest_name: 'Dee Diaz', status: 'open' });
  DB.transport.push(row('c', 'Cal', 'Diaz'), row('d', 'Dee', 'Diaz'));
  ['i1', 'i2'].forEach((id, n) => DB.folio_items.push({ id, folio_id: 'f3', description: `Departure Transport ${D} — CANCUN 12:00 (adjusted)`, qty: 1, unit_price: 100, category: 'Transport', created_at: `2026-11-0${n + 1}T00:00:00Z` }));
  DB.transport.find(r => r.id === 'c').data.folioCharged = { departureFolioItemId: 'i1' };
  DB.transport.find(r => r.id === 'd').data.folioCharged = { departureFolioItemId: 'i2' };
  await runAdj('c', 'departure');
  const k2 = DB.folio_items.filter(i => i.description.startsWith('Departure'));
  check('K2. Two identical lines: named, still on the same folio, nothing added', k2.length === 2 && k2.every(i => i.folio_id === 'f3') && k2.some(i => i.id === 'i1' && /Cal Diaz/.test(i.description)) && k2.some(i => i.id === 'i2' && /Dee Diaz/.test(i.description)), dep());
  // K3. One guest alone in a room: no name added to the text
  fresh();
  DB.transport.push(row('a', 'Ana', 'Lopez'));
  await runAuto(D, 'departure');
  check('K3. Guest alone: text has no name', dep().length === 1 && !/Ana Lopez"/.test(dep()[0]), dep());
  console.log(fails ? `\n${fails} FAILED` : '\nAll passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
