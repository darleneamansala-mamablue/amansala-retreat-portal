// node test/public-forms.test.js -- the smaller public pages on the server: lead forms (inquiry-submit), activity
// sign-up (activity-public), kitchen head-counts (kitchen-week-data), spa payroll (spa-payroll-data), guest book
// (public-content). Each returns only what its page needs and accepts only what its page should write.
const assert = require('assert');
process.env.SUPABASE_SERVICE_KEY = 'svc';
const { signToken } = require('../netlify/functions/portal-auth-lib');
let T, seq = 0;
function reset() {
  T = {
    bookings: [{ id: 'b1', retreat_name: 'Yoga', leader_name: 'Lee', leader_email: 'lee@x.com', leader_phone: '555', start_date: '2026-12-01', end_date: '2026-12-06', status: 'confirmed', charges: [{ amount: 9 }], notes: 'secret note',
      retreat_activities: [{ aoId: 'ao1', date: '2026-12-02', time: '09:00', prepaid: false, staffNote: 'x' }], packages: ['ao5'], package_custom_prices: { ao1: 70, __cfg__: { smallGroupGuests: 8, taxRate: 16 } },
      pax: 10, booking_type: null, cancelled_at: null, meal_plan: 'full', schedule_request: { offsiteChoice: 'gitano', offsiteNight: 3, teacherNotes: 'private' } }],
    registrations: [{ id: 'g1', booking_id: 'b1', check_in: null, check_out: null, cancelled: false, guests: [{ name: 'Ana Lopez', email: 'ana@x.com', phone: '111' }, { name: '' }, { name: 'Bea', cancelled: true }] }],
    app_store: [
      { key: 'act_signups_b1', updated_at: 'u0', value: [{ id: 'su_0', firstName: 'Old', lastName: 'Guest', roomNumber: '3', activities: ['ao1'] }] },
      { key: 'crm_inquiries', updated_at: 'u1', value: [] },
      { key: 'guestBookConfig', updated_at: 'u2', value: { hero: { title: 'Hi' } } },
      { key: 'staffConfirmAccounts', updated_at: 'u3', value: [{ name: 'X' }] },
      { key: 'spa_data', updated_at: 'u4', value: { services: [{ id: 's1', name: 'Massage', price: 95, duration: 60 }], therapists: [{ id: 't1', firstName: 'Laura', email: 'l@x.com', phone: '9', services: [{ serviceId: 's1', compensationType: 'FIXED', compensationValue: 300, compensationCurrency: 'MXN' }] }] } },
      { key: 'spa_appointments', updated_at: 'u5', value: [{ id: 'a1', therapistId: 't1', serviceId: 's1', status: 'COMPLETED', date: '2026-10-01', start: '10:00', duration: 60, clientName: 'Client', email: 'c@x.com', phone: '7' }] },
    ],
  };
}
const json = (d, status = 200) => ({ ok: status < 300, status, json: async () => d, text: async () => JSON.stringify(d) });
global.fetch = async (url, opts = {}) => {
  const u = new URL(url), p = u.searchParams, m = opts.method || 'GET', table = u.pathname.split('/').pop();
  const filt = r => [...p].every(([k, v]) => {
    if (['select', 'order', 'limit'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(r[k]) === decodeURIComponent(v.slice(3));
    if (v.startsWith('gte.')) return String(r[k]) >= v.slice(4);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map(decodeURIComponent).includes(String(r[k]));
    return true;
  });
  const rows = T[table];
  if (m === 'POST') { [].concat(JSON.parse(opts.body)).forEach(x => rows.push({ ...x, updated_at: 'n' + (++seq) })); return json(null, 201); }
  if (m === 'PATCH') { const hit = rows.filter(filt); hit.forEach(r => Object.assign(r, JSON.parse(opts.body), { updated_at: 'n' + (++seq) })); return json(hit); }
  return json(rows.filter(filt));
};
const call = async (name, ev) => { const r = await require('../netlify/functions/' + name).handler(ev); return { code: r.statusCode, ...JSON.parse(r.body) }; };
const post = (name, b, headers = {}) => call(name, { httpMethod: 'POST', headers, body: JSON.stringify(b) });

(async () => {
  reset();
  // lead forms: server-set status/source, only the form's fields; the event lead is appended, not overwritten
  let r = await post('inquiry-submit', { kind: 'leader', name: 'Mia', email: 'mia@x.com', phone: '1', startDate: '2027-01-10', endDate: '2027-01-15', pax: 12, status: 'confirmed', blocked_rooms: ['1'], chica: true });
  assert.ok(r.ok);
  const lead = T.bookings.find(b => b.leader_name === 'Mia');
  assert.deepStrictEqual([lead.status, lead.source, lead.venue_row, lead.blocked_rooms.length, lead.pax], ['requested', 'inquiry', 'CHICA', 0, 12]);
  await post('inquiry-submit', { kind: 'event', type: 'wedding', name: 'Wed A', email: 'a@x.com', honoree: 'A&B', date: '2027-03-01' });
  await post('inquiry-submit', { kind: 'event', type: 'bachelorette', name: 'Wed B', email: 'b@x.com', honoree: 'C', date: '2027-04-01' });
  assert.strictEqual(T.app_store.find(x => x.key === 'crm_inquiries').value.length, 2, 'both event leads kept');
  assert.strictEqual(T.bookings.filter(b => b.source === 'inquiry').length, 3);
  assert.strictEqual((await post('inquiry-submit', { kind: 'leader', name: 'Bot', email: 'b@x.com', website: 'spam' })).ok, true);
  assert.ok(!T.bookings.some(b => b.leader_name === 'Bot'), 'honeypot');
  assert.strictEqual((await post('inquiry-submit', { kind: 'leader', name: 'X', email: 'bad' })).code, 400);
  console.log('ok   - lead forms: status/source set by the server, extra columns ignored, event leads appended, bots dropped');

  // activity sign-up: no leader contact, no other guests; only offered activities; own entry replaced
  r = await call('activity-public', { httpMethod: 'GET', queryStringParameters: { id: 'b1' } });
  const s = JSON.stringify(r);
  for (const secret of ['lee@x.com', '555', 'secret note', 'Old', 'taxRate', 'staffNote']) assert.ok(!s.includes(secret), 'sign-up page leaks ' + secret);
  assert.deepStrictEqual(r.retreat.customPrices, { ao1: 70, __cfg__: { smallGroupGuests: 8 } });
  r = await post('activity-public', { id: 'b1', firstName: 'Ana', lastName: 'Lopez', room: '5', activities: ['ao1', 'ao99'] });
  assert.ok(r.ok && !r.updated);
  r = await post('activity-public', { id: 'b1', firstName: 'ana', lastName: 'LOPEZ', room: '5', activities: ['ao1'] });
  assert.ok(r.ok && r.updated);
  const su = T.app_store.find(x => x.key === 'act_signups_b1').value;
  assert.strictEqual(su.length, 2, 'old guest kept, Ana once'); assert.deepStrictEqual(su[1].activities, ['ao1'], 'not-offered activity dropped');
  assert.strictEqual((await post('activity-public', { id: 'b1', firstName: 'X', lastName: 'Y', activities: ['ao99'] })).code, 400);
  console.log('ok   - activity sign-up: no contact details or other guests shown; only offered activities saved');

  // kitchen: head-counts without names
  r = await call('kitchen-week-data', { httpMethod: 'GET' });
  const k = JSON.stringify(r);
  for (const secret of ['Ana Lopez', 'ana@x.com', '111', 'private']) assert.ok(!k.includes(secret), 'kitchen leaks ' + secret);
  assert.deepStrictEqual(r.registrations[0].guests, [{ name: 'Guest', cancelled: false }, { name: 'Guest', cancelled: true }]);
  assert.deepStrictEqual(r.bookings.find(b => b.id === 'b1').schedule_request, { offsiteChoice: 'gitano', offsiteNight: 3 });
  console.log('ok   - kitchen: same head-count, no guest names or contacts');

  // spa payroll: admin pass only, no client details
  assert.strictEqual((await call('spa-payroll-data', { httpMethod: 'GET', headers: {} })).code, 401);
  assert.strictEqual((await call('spa-payroll-data', { httpMethod: 'GET', headers: { 'x-portal-token': signToken({ kind: 'staff', role: 'staff', name: 'T' }) } })).code, 401);
  r = await call('spa-payroll-data', { httpMethod: 'GET', headers: { 'x-portal-token': signToken({ kind: 'staff', role: 'admin', name: 'Jorge' }) } });
  const pj = JSON.stringify(r);
  for (const secret of ['Client', 'c@x.com', 'l@x.com']) assert.ok(!pj.includes(secret), 'payroll leaks ' + secret);
  assert.strictEqual(r.therapists[0].services[0].compensationValue, 300); assert.strictEqual(r.appointments[0].status, 'COMPLETED');
  console.log('ok   - spa payroll: admins only, pay rates yes, client details no');

  // guest book: only the allowed key
  assert.deepStrictEqual((await call('public-content', { queryStringParameters: { key: 'guestBookConfig' } })).value, { hero: { title: 'Hi' } });
  assert.strictEqual((await call('public-content', { queryStringParameters: { key: 'staffConfirmAccounts' } })).code, 404);
  console.log('ok   - public content: guest book only');
  console.log('public forms: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
