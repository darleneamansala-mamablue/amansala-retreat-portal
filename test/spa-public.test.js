// node test/spa-public.test.js -- the public spa booking page's server side (netlify/functions/spa-public.js): what it
// shows (no client or guest contact details, no staff pay), booking for hotel guests (folio at the catalog price, tip
// line, stay window) and offsite guests (Stripe payment checked, never reused), the slot re-check, and cancelling.
const assert = require('assert');
process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.STRIPE_SECRET_KEY = 'sk'; process.env.RESEND_API_KEY = 're';
const day = n => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
let T, mails, pis, refunds, seq;
function reset() {
  seq = 0; mails = []; refunds = [];
  pis = { pi_ok: { id: 'pi_ok', status: 'succeeded', metadata: { source: 'spa_booking', serviceId: 's1', tipAmount: '5' } }, pi_other: { id: 'pi_other', status: 'succeeded', metadata: { source: 'spa_booking', serviceId: 's2' } } };
  T = {
    app_store: new Map([
      ['spa_data', { key: 'spa_data', updated_at: 't0', value: {
        services: [{ id: 's1', name: '60 Minute Massage', duration: 60, price: 95, active: true, category: 'massage', costs: { oil: 3 } }, { id: 's2', name: 'Tarot', duration: 60, price: 80, active: true }],
        therapists: [{ id: 'th1', firstName: 'Laura', lastName: 'L', gender: 'female', active: true, email: 'laura@x.com', phone: '555', notes: 'private', services: [{ serviceId: 's1', compensationType: 'FIXED', compensationValue: 30 }] }],
        rooms: [{ id: 'r1', name: 'Room A', location: 'Chica' }] } }],
      ['spa_appointments', { key: 'spa_appointments', updated_at: 't1', value: [
        { id: 'ap_old', clientName: 'Other Client', email: 'other@x.com', phone: '999', date: day(3), start: '15:00', duration: 60, status: 'CONFIRMED', therapistId: 'th1', serviceId: 's1' }] }],
      ['staffConfirmAccounts', { key: 'staffConfirmAccounts', updated_at: 't2', value: [{ name: 'Laura', username: 'laura', unavailableDates: ['2026-12-25'], spaWorkingHours: { x: 1 } }] }],
    ]),
    bookings: [{ id: 'b1', leader_name: 'Retreat', booking_type: null, blocked_rooms: ['5'], charges: [], start_date: day(-1), end_date: day(5), status: 'confirmed' }],
    registrations: [{ id: 'g1', booking_id: 'b1', room: '5', guests: [{ name: 'Ana Lopez', email: 'ana@x.com', phone: '111' }], cancelled: false }],
    folios: [], folio_items: [],
  };
}
const json = (d, status = 200) => ({ ok: status < 300, status, json: async () => d, text: async () => JSON.stringify(d) });
const val = (p, k) => { const v = p.get(k); return v && v.startsWith('eq.') ? decodeURIComponent(v.slice(3)) : v; };
global.fetch = async (url, opts = {}) => {
  const u = new URL(url), p = u.searchParams, path = u.pathname, m = opts.method || 'GET';
  if (u.hostname === 'api.resend.com') { mails.push(JSON.parse(opts.body)); return json({ id: 'm' }); }
  if (u.hostname === 'api.stripe.com') {
    if (path === '/v1/refunds') { refunds.push(new URLSearchParams(opts.body).get('payment_intent')); return json({ id: 're' }); }
    const pi = pis[decodeURIComponent(path.split('/').pop())]; return json(pi || { error: { message: 'no' } }, pi ? 200 : 404);
  }
  const table = path.split('/').pop();
  if (table === 'find_or_create_folio') return json({ code: 'PGRST202' }, 404);   // the fallback look-up is exercised
  if (table === 'app_store') {
    const key = val(p, 'key'), row = T.app_store.get(key);
    if (m === 'GET') return json(row ? [row] : []);
    if (m === 'PATCH') { if (!row || val(p, 'updated_at') !== row.updated_at) return json([]); const b = JSON.parse(opts.body); T.app_store.set(key, { key, value: b.value, updated_at: 'v' + (++seq) }); return json([{ key }]); }
    if (m === 'POST') { const b = JSON.parse(opts.body); T.app_store.set(b.key, { ...b, updated_at: 'v' + (++seq) }); return json(null, 201); }
  }
  let rows = T[table];
  if (m === 'POST') { const add = [].concat(JSON.parse(opts.body)).map(x => ({ id: table.slice(0, 2) + (++seq), ...x })); rows.push(...add); return json(add, 201); }
  const filt = r => [...p].every(([k, v]) => {
    if (['select', 'order', 'limit'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(r[k]) === decodeURIComponent(v.slice(3));
    if (v.startsWith('neq.')) return String(r[k]) !== v.slice(4);
    if (v.startsWith('lte.')) return String(r[k]) <= v.slice(4);
    if (v.startsWith('gte.')) return String(r[k]) >= v.slice(4);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map(decodeURIComponent).includes(String(r[k]));
    return true;
  });
  if (m === 'DELETE') { const hit = rows.filter(filt); T[table] = rows.filter(r => !hit.includes(r)); return json(hit); }
  if (m === 'PATCH') { rows.filter(filt).forEach(r => Object.assign(r, JSON.parse(opts.body))); return json(null, 204); }
  return json(rows.filter(filt));
};
const fn = require('../netlify/functions/spa-public');
const get = async q => JSON.parse((await fn.handler({ httpMethod: 'GET', queryStringParameters: q })).body);
const post = async b => { const r = await fn.handler({ httpMethod: 'POST', body: JSON.stringify(b) }); return { code: r.statusCode, ...JSON.parse(r.body) }; };
const hotel = extra => ({ action: 'book', serviceId: 's1', date: day(3), start: '11:00', therapistId: 'th1', roomId: 'r1', prefType: 'specific', guestType: 'hotel', firstName: 'Ana', lastName: 'Lopez', email: 'ana@x.com', phone: '111', roomNumber: '5', tipAmount: 10, ...extra });

(async () => {
  reset();
  // 1. what the page sees
  const init = await get({ action: 'init' });
  const blob = JSON.stringify(init);
  for (const secret of ['other@x.com', 'Other Client', '999', 'laura@x.com', 'private', 'compensation', 'ap_old', 'costs', 'Ana Lopez', 'spaWorkingHours'])
    assert.ok(!blob.includes(secret), 'init leaks ' + secret);
  assert.strictEqual(init.busy.length, 1); assert.strictEqual(init.busy[0].therapistId, 'th1');
  assert.deepStrictEqual(init.staff, [{ name: 'Laura', unavailableDates: ['2026-12-25'], dayOfWeekRules: [] }]);
  console.log('ok   - init: catalog, busy times and days off with no contact details, pay, costs or appointment ids');

  // 2. stay look-up: window only
  assert.deepStrictEqual(await post({ action: 'lookup', name: 'ana  lopez', room: '5' }), { code: 200, start: day(-1), end: day(5) });
  assert.deepStrictEqual(await post({ action: 'lookup', name: 'Nobody', room: '5' }), { code: 200 });
  console.log('ok   - stay look-up returns only the dates');

  // 3. hotel booking: folio at the catalog price + tip line, emails, appointment saved
  let r = await post(hotel({ price: 1 }));
  assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.folioPosted, true);
  const items = T.folio_items;
  assert.deepStrictEqual(items.map(i => [i.unit_price, i.tax_rate, i.category]), [[95, 13, 'Spa'], [10, 0, 'Tip']]);
  const saved = T.app_store.get('spa_appointments').value.find(a => a.id === r.appt.id);
  assert.strictEqual(saved.folioStatus, 'POSTED'); assert.ok(saved.folioTipId); assert.strictEqual(saved.email, 'ana@x.com');
  assert.ok(!('email' in r.appt) && !('phone' in r.appt) && !('clientName' in r.appt), 'reply has no contact details');
  assert.deepStrictEqual(mails.map(x => x.to[0]).sort(), ['ana@x.com', 'laura@x.com']);
  console.log('ok   - hotel booking: charged at $95 + $10 tip line (a price sent by the page is ignored), saved, 2 emails');

  // 4. same therapist + time again: refused, nothing charged
  const before = T.folio_items.length;
  r = await post(hotel({ firstName: 'Ana', start: '11:30' }));
  assert.strictEqual(r.conflict, true); assert.strictEqual(T.folio_items.length, before);
  console.log('ok   - overlapping slot: refused before any charge');

  // 5. date outside the stay
  r = await post(hotel({ date: day(9), start: '12:00' }));
  assert.strictEqual(r.outsideStay, true);
  console.log('ok   - date outside the stay: refused');

  // 6. offsite: payment checked, never reused, wrong service refused
  r = await post({ action: 'book', serviceId: 's1', date: day(4), start: '10:00', therapistId: 'th1', guestType: 'offsite', firstName: 'Day', lastName: 'Guest', email: 'day@x.com', paymentIntentId: 'pi_ok' });
  assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.appt.tipAmount, 5, 'tip taken from the payment, not the page');
  assert.strictEqual(T.app_store.get('spa_appointments').value.find(a => a.id === r.appt.id).paymentStatus, 'PAID');
  r = await post({ action: 'book', serviceId: 's1', date: day(4), start: '13:00', therapistId: 'th1', guestType: 'offsite', firstName: 'Day', lastName: 'Guest', email: 'day@x.com', paymentIntentId: 'pi_ok' });
  assert.strictEqual(r.code, 409, 'payment reused');
  r = await post({ action: 'book', serviceId: 's1', date: day(4), start: '14:00', therapistId: 'th1', guestType: 'offsite', firstName: 'Day', lastName: 'Guest', email: 'day@x.com', paymentIntentId: 'pi_other' });
  assert.ok(r.error, 'payment for another service');
  r = await post({ action: 'book', serviceId: 's1', date: day(4), start: '10:30', therapistId: 'th1', guestType: 'offsite', firstName: 'X', lastName: 'Y', email: 'x@x.com', paymentIntentId: 'pi_other2' });
  assert.ok(r.error);
  console.log('ok   - offsite: paid booking saved; a payment cannot be reused or used for another service');

  // 7. offsite slot lost after paying: refunded by the server
  pis.pi_late = { id: 'pi_late', status: 'succeeded', metadata: { source: 'spa_booking', serviceId: 's1' } };
  r = await post({ action: 'book', serviceId: 's1', date: day(3), start: '15:30', therapistId: 'th1', guestType: 'offsite', firstName: 'L', lastName: 'Ate', email: 'l@x.com', paymentIntentId: 'pi_late' });
  assert.strictEqual(r.conflict, true); assert.strictEqual(r.refunded, true); assert.deepStrictEqual(refunds, ['pi_late']);
  console.log('ok   - offsite slot taken meanwhile: refunded on the server');

  // 8. cancel: >12 h removes the charge and the tip; again = already; an appointment within 12 h cannot be cancelled online
  const hotelAppt = T.app_store.get('spa_appointments').value.find(a => a.guestType === 'hotel');
  mails = [];
  r = await post({ action: 'cancel', id: hotelAppt.id });
  assert.ok(r.ok && r.folioReversed, JSON.stringify(r)); assert.strictEqual(T.folio_items.length, 0, 'charge and tip removed');
  assert.strictEqual(T.app_store.get('spa_appointments').value.find(a => a.id === hotelAppt.id).status, 'CANCELLED');
  assert.strictEqual(mails.length, 2, 'guest + therapist emailed');
  assert.strictEqual((await post({ action: 'cancel', id: hotelAppt.id })).reason, 'already');
  const soon = new Date(Date.now() + 3 * 3600e3 - 5 * 3600e3);   // Tulum wall-clock, 3 h from now
  T.app_store.get('spa_appointments').value.push({ id: 'ap_soon', date: soon.toISOString().slice(0, 10), start: soon.toISOString().slice(11, 16), duration: 60, status: 'CONFIRMED', therapistId: 'th1' });
  assert.strictEqual((await post({ action: 'cancel', id: 'ap_soon' })).reason, 'too_late');
  assert.strictEqual((await post({ action: 'cancel', id: 'nope' })).reason, 'not_found');
  const view = await get({ action: 'appt', id: hotelAppt.id });
  assert.strictEqual(view.appt.status, 'CANCELLED'); assert.ok(!('email' in view.appt));
  console.log('ok   - cancel: charge + tip removed, emails sent; already / too late / not found handled');

  // 9. the other client's appointment was never changed
  assert.strictEqual(T.app_store.get('spa_appointments').value.find(a => a.id === 'ap_old').status, 'CONFIRMED');
  console.log('spa public: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
