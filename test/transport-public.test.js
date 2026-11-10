// node test/transport-public.test.js -- the drivers' page and the guests' transport form on the server
// (driver-data.js, transport-public.js): only that company's rides and no guest emails/phones for drivers, a driver's
// "confirmed" never overwrites office edits, a guest update keeps the office's fields, the edit link needs its key.
const assert = require('assert');
process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.RESEND_API_KEY = 're'; process.env.SUPABASE_JWT_SECRET = 'jwt-test';
let T, mails;
const day = n => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
function reset() {
  mails = [];
  T = {
    transport: [
      { id: 'tr_1', booking_id: 'b1', submitted_at: 's', data: { id: 'tr_1', firstName: 'Ana', lastName: 'Lopez', email: 'ana@x.com', arrivalDate: day(2), arrivalTime: '10:00', arrivalAirport: 'cancun', departureDate: day(6), departureTime: '15:00', departureAirport: 'cancun', folioCharged: true, flightLabel: 'AM 123' } },
      { id: 'tr_2', booking_id: 'b1', submitted_at: 's', data: { id: 'tr_2', firstName: 'Bea', lastName: 'Ruiz', email: 'bea@x.com', arrivalDate: day(2), arrivalTime: '11:00', arrivalAirport: 'tulum', departureDate: day(6), departureTime: '12:00', departureAirport: 'tulum' } },
    ],
    bookings: [{ id: 'b1', leader_name: 'Leader', retreat_name: 'Yoga Week', start_date: day(1), end_date: day(7), status: 'confirmed' }, { id: 'b0', leader_name: 'Old', retreat_name: 'Past', start_date: day(-40), end_date: day(-35), status: 'confirmed' }],
    registrations: [{ booking_id: 'b1', room: '12', guests: [{ name: 'Ana Lopez', email: 'ana@x.com', phone: '111' }, { name: 'Bea Ruiz', email: 'bea@x.com', phone: '222' }] }],
    settings: [{ key: 'transport_groups', value: [['arrival|tr_1', 'g1']] }],
  };
}
const json = (d, status = 200) => ({ ok: status < 300, status, json: async () => d, text: async () => JSON.stringify(d) });
global.fetch = async (url, opts = {}) => {
  const u = new URL(url), p = u.searchParams, m = opts.method || 'GET', table = u.pathname.split('/').pop();
  if (u.hostname === 'api.resend.com') { mails.push(JSON.parse(opts.body)); return json({ id: 'm' }); }
  const filt = r => [...p].every(([k, v]) => {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(r[k]) === decodeURIComponent(v.slice(3));
    if (v.startsWith('neq.')) return String(r[k]) !== v.slice(4);
    if (v.startsWith('gte.')) return String(r[k]) >= v.slice(4);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map(decodeURIComponent).includes(String(r[k]));
    return true;
  });
  if (m === 'POST') { const row = JSON.parse(opts.body); const i = T[table].findIndex(r => r.id === row.id); if (i >= 0) T[table][i] = row; else T[table].push(row); return json(null, 201); }
  if (m === 'PATCH') { T[table].filter(filt).forEach(r => Object.assign(r, JSON.parse(opts.body))); return json(null, 204); }
  return json(T[table].filter(filt));
};
const drv = require('../netlify/functions/driver-data'), tp = require('../netlify/functions/transport-public');
const A = require('../netlify/functions/portal-auth-lib');
const asDriver = n => ({ authorization: 'Bearer ' + A.signDbPass({ sub: 'drv_' + n, app_role: 'driver', name: n }) });
const call = async (fn, ev) => { if (fn === drv && !(ev.headers && ev.headers.authorization)) ev = { ...ev, headers: asDriver(((ev.queryStringParameters || {}).co || JSON.parse(ev.body || '{}').co) === 'salomon' ? 'Salamon' : 'Irving') }; const r = await fn.handler(ev); return { code: r.statusCode, ...JSON.parse(r.body) }; };

(async () => {
  reset();
  // drivers: Salomón = Cancún arrivals (Ana); Irving = Tulum both ways + Cancún departures (Ana dep + Bea)
  const sal = await call(drv, { httpMethod: 'GET', queryStringParameters: { co: 'salomon' } });
  assert.deepStrictEqual(sal.rows.map(r => r.id), ['tr_1']);
  const irv = await call(drv, { httpMethod: 'GET', queryStringParameters: { co: 'irving' } });
  assert.deepStrictEqual(irv.rows.map(r => r.id).sort(), ['tr_1', 'tr_2']);
  const blob = JSON.stringify(irv);
  for (const secret of ['ana@x.com', 'bea@x.com', '111', '222', 'folioCharged']) assert.ok(!blob.includes(secret), 'driver data leaks ' + secret);
  assert.strictEqual(irv.rows.find(r => r.id === 'tr_1').room, '12', 'room matched on the server');
  assert.ok(irv.rows[0].emailKey && irv.rows[0].emailKey.length === 16);
  // a driver always gets their own company, whatever the link says; an account with no company and no sign-in are refused
  assert.deepStrictEqual((await call(drv, { httpMethod: 'GET', queryStringParameters: { co: 'x' }, headers: asDriver('Salamon') })).rows.map(r => r.id), ['tr_1']);
  assert.strictEqual((await call(drv, { httpMethod: 'GET', queryStringParameters: { co: 'irving' }, headers: asDriver('Pedro') })).code, 403);
  assert.strictEqual((await drv.handler({ httpMethod: 'GET', queryStringParameters: { co: 'irving' }, headers: {} })).statusCode, 401);
  console.log("ok   - drivers see only their company's rides, with rooms, without emails/phones/office fields");

  // confirming: only driver_confirmed changes, on the row as it is now; another company's row is refused
  T.transport[0].data.flightLabel = 'AM 999 (changed by the office)';
  let r = await call(drv, { httpMethod: 'POST', body: JSON.stringify({ co: 'salomon', rowIds: ['tr_1', 'tr_2'], confirmed: true }) });
  assert.deepStrictEqual(r.failed, ['tr_2'], 'Tulum ride is not Salomón\'s');
  assert.strictEqual(T.transport[0].data.driver_confirmed, true);
  assert.strictEqual(T.transport[0].data.flightLabel, 'AM 999 (changed by the office)', 'office edit kept');
  assert.strictEqual(T.transport[0].data.folioCharged, true);
  assert.strictEqual(T.transport[1].data.driver_confirmed, undefined);
  console.log('ok   - confirm sets only the mark, keeps office edits, refuses other companies');

  // the form: upcoming retreats only
  const rl = await call(tp, { httpMethod: 'GET', queryStringParameters: { action: 'retreats' } });
  // the list carries a form-only code, not the booking id; sending the code back saves the booking id
  assert.strictEqual(rl.retreats.length, 1); assert.ok(/^r_[0-9a-f]{16}$/.test(rl.retreats[0].id) && rl.retreats[0].id !== 'b1');
  // a new submission: saved with a private key, emailed with a link that carries it
  const form = { action: 'submit', bookingId: rl.retreats[0].id, firstName: 'Cleo', lastName: 'Diaz', email: 'cleo@x.com', flightNumber: 'UA1', arrivalDate: day(2), arrivalTime: '09:30', arrivalAirport: 'cancun', departureDate: day(6), departureTime: '18:00', departureAirport: 'cancun' };
  r = await call(tp, { httpMethod: 'POST', body: JSON.stringify(form) });
  assert.ok(r.ok && r.k && r.id.startsWith('tr_'));
  assert.ok(mails[0].html.includes(`tr=${r.id}&amp;k=${r.k}`) || mails[0].html.includes(`tr=${r.id}&k=${r.k}`), 'email link has the key');
  const id = r.id, k = r.k;
  assert.strictEqual((await call(tp, { httpMethod: 'GET', queryStringParameters: { action: 'entry', tr: id } })).code, 404, 'no key');
  assert.strictEqual((await call(tp, { httpMethod: 'GET', queryStringParameters: { action: 'entry', tr: id, k: 'wrong' } })).code, 404);
  const got = await call(tp, { httpMethod: 'GET', queryStringParameters: { action: 'entry', tr: id, k } });
  assert.strictEqual(got.entry.firstName, 'Cleo'); assert.ok(!('editKey' in got.entry));
  assert.strictEqual(T.transport.find(x => x.id === id).booking_id, 'b1', 'saved under the real booking'); assert.strictEqual(got.entry.bookingId, rl.retreats[0].id, 'the entry carries the code');
  console.log('ok   - new submission: saved, emailed, its edit link needs the private key');

  // the office marks it charged; the guest updates the flight: the office field stays
  T.transport.find(x => x.id === id).data.folioCharged = true;
  r = await call(tp, { httpMethod: 'POST', body: JSON.stringify({ ...form, tr: id, k, flightNumber: 'UA2' }) });
  assert.ok(r.ok);
  const row = T.transport.find(x => x.id === id).data;
  assert.strictEqual(row.flightNumber, 'UA2'); assert.strictEqual(row.folioCharged, true, 'office field kept'); assert.strictEqual(row.editKey, k);
  assert.strictEqual((await call(tp, { httpMethod: 'POST', body: JSON.stringify({ ...form, tr: id, k: 'nope' }) })).code, 403, 'update without the key');
  console.log('ok   - guest update keeps the office fields; an update without the key is refused');

  // an old entry (from before keys) still opens and updates through its old link
  assert.strictEqual((await call(tp, { httpMethod: 'GET', queryStringParameters: { action: 'entry', tr: 'tr_2' } })).entry.firstName, 'Bea');
  // an individual guest is matched to their retreat by email
  r = await call(tp, { httpMethod: 'POST', body: JSON.stringify({ ...form, bookingId: 'individual', firstName: 'Ana', lastName: 'L', email: 'ANA@x.com' }) });
  assert.strictEqual(r.entry.bookingId, 'b1');
  console.log('ok   - old links still work; an individual guest is matched to the retreat on the server');

  // the same guest sends the form again from the general link (no update link): their entry is updated, not doubled
  const before = T.transport.length;
  r = await call(tp, { httpMethod: 'POST', body: JSON.stringify({ ...form, lastName: 'Diaz Typo', email: 'CLEO@x.com', flightNumber: 'UA3' }) });
  assert.strictEqual(r.id, id, 'same entry'); assert.strictEqual(T.transport.length, before, 'no second entry');
  const again = T.transport.find(x => x.id === id).data;
  assert.strictEqual(again.flightNumber, 'UA3'); assert.strictEqual(again.folioCharged, true, 'office field kept'); assert.strictEqual(again.editKey, k);
  assert.ok(/Updated/.test(mails[mails.length - 1].subject), 'update email');
  // a partner sharing the email keeps a separate entry
  r = await call(tp, { httpMethod: 'POST', body: JSON.stringify({ ...form, firstName: 'Dan', email: 'cleo@x.com' }) });
  assert.notStrictEqual(r.id, id); assert.strictEqual(T.transport.length, before + 1);
  console.log('ok   - a repeat from the general link updates the entry; a partner with the same email gets their own');
  console.log('transport public: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
