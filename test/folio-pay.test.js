// node test/folio-pay.test.js -- the check-out pay link (?all=1) covers ALL of a guest's folios on the room: get-folio shows
// them, folio-payment charges their total, confirm-folio-payment settles each one; a plain link stays one folio.
const assert = require('assert');
process.env.SUPABASE_SERVICE_KEY = 'k'; process.env.STRIPE_SECRET_KEY = 'sk'; process.env.STRIPE_PUBLISHABLE_KEY = 'pk';
const folios = [
  { id: 'F1', registration_id: 'R1', guest_name: 'Ana Lopez', name: 'Ana Lopez', status: 'open', payment_token: 'T1', created_at: '2026-10-01T00:00:00Z' },
  { id: 'F2', registration_id: 'R1', guest_name: 'ana lopez ', name: 'ana lopez ', status: 'open', payment_token: 'T2', created_at: '2026-10-01T00:00:30Z' },   // race duplicate
  { id: 'F3', registration_id: 'R1', guest_name: 'Bea Ruiz', name: 'Bea Ruiz', status: 'open', payment_token: 'T3', created_at: '2026-10-01T00:01:00Z' },       // roommate
];
let items, pis, nextPi;
function reset() {
  items = [
    { id: 'i1', folio_id: 'F1', description: 'Room charge', qty: 2, unit_price: 100, tax_rate: 0, created_at: '2026-10-02' },
    { id: 'i2', folio_id: 'F2', description: 'Massage', qty: 1, unit_price: 100, tax_rate: 13, created_at: '2026-10-03' },
    { id: 'i3', folio_id: 'F3', description: 'Bea dinner', qty: 1, unit_price: 50, tax_rate: 0, created_at: '2026-10-03' },
  ];
  pis = {}; nextPi = 1;
}
const json = (d, status = 200) => ({ ok: status < 300, status, json: async () => d, text: async () => JSON.stringify(d) });
global.fetch = async (url, opts = {}) => {
  const u = new URL(url), p = u.searchParams, path = u.pathname;
  if (u.hostname === 'api.stripe.com') {
    if (opts.method === 'POST') { const b = new URLSearchParams(opts.body), id = 'pi_' + nextPi++; const md = {}; for (const [k, v] of b) { const m = /^metadata\[(.+)\]$/.exec(k); if (m) md[m[1]] = v; } pis[id] = { id, amount: +b.get('amount'), amount_received: +b.get('amount'), metadata: md, status: 'succeeded', client_secret: id + '_secret' }; return json(pis[id]); }
    return json(pis[path.split('/').pop()]);
  }
  if (path.endsWith('/folios')) {
    let r = folios;
    if (p.get('payment_token')) r = r.filter(f => f.payment_token === p.get('payment_token').slice(3));
    if (p.get('registration_id')) r = r.filter(f => f.registration_id === p.get('registration_id').slice(3));
    if (p.get('id')) r = r.filter(f => f.id === p.get('id').slice(3));
    return json(r);
  }
  if (path.endsWith('/folio_items')) {
    if (opts.method === 'POST') { [].concat(JSON.parse(opts.body)).forEach((x, n) => items.push({ id: 'n' + items.length + n, created_at: '2026-10-09', ...x })); return json(null, 201); }
    const fid = p.get('folio_id') || ''; const ids = fid.startsWith('in.(') ? fid.slice(4, -1).split(',') : [fid.slice(3)];
    let r = items.filter(i => ids.includes(i.folio_id));
    const d = p.get('description'); if (d) { const needle = d.replace(/^ilike\.\*|\*$/g, ''); r = r.filter(i => (i.description || '').includes(needle)); }
    return json(r);
  }
  if (path.includes('/registrations') || path.includes('/booking_requests')) return json([]);
  return json([]);
};
const req = n => require('../netlify/functions/' + n);
const call = async (fn, ev) => { const r = await fn.handler(ev); return { status: r.statusCode, body: JSON.parse(r.body || '{}') }; };
const bal = id => +items.filter(i => i.folio_id === id).reduce((s, i) => s + i.qty * i.unit_price * (1 + (i.tax_rate || 0) / 100), 0).toFixed(2);
let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
(async () => {
  reset();
  // get-folio
  let r = await call(req('get-folio'), { httpMethod: 'GET', queryStringParameters: { token: 'T1' } });
  ok(r.body.items.length === 1 && Math.abs(r.body.total - 200) < 0.01, 'plain link: one folio');
  r = await call(req('get-folio'), { httpMethod: 'GET', queryStringParameters: { token: 'T1', all: '1' } });
  ok(r.body.items.length === 2 && Math.abs(r.body.total - 313) < 0.01, 'check-out link: both of Ana\'s folios, not Bea\'s');
  ok(r.body.folios.map(f => f.id).join() === 'F1,F2', 'lists the folios');
  // folio-payment
  r = await call(req('folio-payment'), { httpMethod: 'POST', body: JSON.stringify({ token: 'T1', all: true }) });
  ok(r.body.amount === 313, 'charges the whole bill: ' + r.body.amount);
  const pi = Object.values(pis)[0];
  ok(pi.metadata.folioId === 'F1' && pi.metadata.folioIds === 'F1,F2', 'metadata names both folios');
  // confirm
  r = await call(req('confirm-folio-payment'), { httpMethod: 'POST', body: JSON.stringify({ paymentIntentId: pi.id, folioId: 'F1' }) });
  ok(r.body.success && bal('F1') === 0 && bal('F2') === 0 && bal('F3') === 50, `both settled, roommate untouched (F1 ${bal('F1')}, F2 ${bal('F2')}, F3 ${bal('F3')})`);
  const before = items.length;
  r = await call(req('confirm-folio-payment'), { httpMethod: 'POST', body: JSON.stringify({ paymentIntentId: pi.id, folioId: 'F1' }) });
  ok(r.body.alreadyRecorded && items.length === before, 'confirming twice records nothing more');
  // plain link: unchanged behaviour
  reset();
  r = await call(req('folio-payment'), { httpMethod: 'POST', body: JSON.stringify({ token: 'T2' }) });
  ok(r.body.amount === 113 && !Object.values(pis)[0].metadata.folioIds, 'plain link charges its folio only');
  await call(req('confirm-folio-payment'), { httpMethod: 'POST', body: JSON.stringify({ paymentIntentId: Object.values(pis)[0].id, folioId: 'F2' }) });
  ok(bal('F2') === 0 && bal('F1') === 200, 'and settles only that folio');
  // tip on the check-out link: re-render shows the whole bill
  reset();
  r = await call(req('add-folio-tip'), { httpMethod: 'POST', body: JSON.stringify({ token: 'T1', amount: 20, description: 'Staff', all: true }) });
  ok(r.body.items.length === 3 && Math.abs(r.body.total - 333) < 0.01, 'tip added, whole bill returned: ' + r.body.total);
  console.log(`folio-pay: ${passed} checks passed`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
