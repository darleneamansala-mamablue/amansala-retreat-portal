'use strict';
// booking-payment-lib.js against an in-memory database: request -> partial payment (no confirmation) -> daily
// reminders with what is left -> full payment (one confirmation) -> overdue after the 6-day date.
const assert = require('assert');

const db = { app_store: [], bookings: [], registrations: [], folios: [], folio_items: [], room_types: [{ id: 'rt4', name: 'Garden' }] };
const sent = [];
let now = Date.parse('2026-11-04T17:00:00Z'), seq = 0;
const realNow = Date.now; Date.now = () => now;

function match(row, params) {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
    const val = row[k] == null ? null : String(row[k]);
    if (v.startsWith('eq.')) { if (val !== decodeURIComponent(v.slice(3))) return false; }
    else if (v.startsWith('in.(')) { if (!decodeURIComponent(v.slice(4, -1)).split(',').includes(val)) return false; }
  }
  return true;
}
global.fetch = async (url, opt = {}) => {
  const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  if (url.includes('api.resend.com')) { sent.push({ ch: 'email', ...JSON.parse(opt.body) }); return res(200, { id: 'e' }); }
  if (url.includes('visitoai.com')) { sent.push({ ch: 'wa', ...JSON.parse(opt.body) }); return res(200, { accepted: true }); }
  if (url.includes('send-booking-confirmation')) { sent.push({ ch: 'confirmation', ...JSON.parse(opt.body) }); return res(200, { success: true, results: { email: 'sent', whatsapp: 'sent' } }); }
  if (url.includes('/rpc/find_or_create_folio')) return res(404, { code: 'PGRST202' });
  const u = new URL(url), table = u.pathname.split('/').pop(), params = [...u.searchParams.entries()], rows = db[table];
  const method = opt.method || 'GET';
  if (method === 'GET') return res(200, rows.filter(r => match(r, params)));
  if (method === 'POST') {
    const list = [].concat(JSON.parse(opt.body)).map(r => ({ id: r.id || 'x' + (++seq), created_at: new Date(now + seq).toISOString(), ...r }));
    if (table === 'app_store') list.forEach(r => { r.updated_at = new Date(now + (++seq)).toISOString(); });
    rows.push(...list); return res(201, list);
  }
  if (method === 'PATCH') {
    const hit = rows.filter(r => match(r, params)), patch = JSON.parse(opt.body);
    hit.forEach(r => Object.assign(r, patch, table === 'app_store' ? { updated_at: new Date(now + (++seq)).toISOString() } : {}));
    return res(200, hit);
  }
  return res(200, []);
};
process.env.RESEND_API_KEY = 'r'; process.env.VISITO_M2M_KEY = 'v'; process.env.VISITO_WA_CHANNEL_ID = 'c';

const L = require('../netlify/functions/booking-payment-lib');
const KEY = 'k';
db.app_store.push({ key: 'booking_payment_flow', value: { enabled: true }, updated_at: 'a' });
db.bookings.push({ id: 'bk1', leader_name: 'Ana Test', leader_email: 'ana@x.com', leader_phone: '+15550001', start_date: '2026-11-20', end_date: '2026-11-23', status: 'confirmed', booking_type: 'room_only', room_rate_total: 600, room_rate_nights: 3, blocked_rooms: ['GV1'] });
db.registrations.push({ id: 'rg1', booking_id: 'bk1', room: 'GV1', room_type_id: 'rt4', guests: [{ name: 'Ana Test', email: 'ana@x.com', phone: '+15550001' }], check_in: null, check_out: null, custom_rate_override: null, cancelled: false, created_at: 'a' });
const pending = () => (db.app_store.find(r => r.key === 'booking_payment_pending') || {}).value || {};
const pay = amt => db.folio_items.push({ id: 'p' + (++seq), folio_id: db.folios[0].id, description: 'Payment', qty: 1, unit_price: -amt, tax_rate: 0, category: 'Payment' });
const dayLater = n => { now += n * 86400000; };

(async () => {
  // 1. request: folio opened with the Room charge, due in 6 days, email + WhatsApp v2
  const r = await L.requestPayment(KEY, 'bk1');
  assert.strictEqual(r.mode, 'payment_requested'); assert.strictEqual(r.amount, 600); assert.strictEqual(r.dueDate, '2026-11-10');
  assert.strictEqual(db.folio_items.filter(i => i.category === 'Room').length, 1);
  assert.deepStrictEqual(sent.map(s => s.ch), ['email', 'wa']);
  assert.ok(/by <strong>November 10<\/strong>/.test(sent[0].html) && /wa\.me\/529848795999/.test(sent[0].html));
  assert.strictEqual(sent[1].template.name, 'booking_payment_request_v4');
  assert.deepStrictEqual(sent[1].template.components[0].parameters.map(p => p.text).slice(0, 5), ['Ana', 'from November 20 to 23rd', 'Garden', '$600.00 USD', 'November 10']);
  console.log('request: ok');
  // same day: no reminder yet
  sent.length = 0; let o = await L.sendReminders(KEY); assert.strictEqual(sent.length, 0); assert.deepStrictEqual(o.reminded, []);
  // 2. partial payment: no confirmation
  pay(200); const c1 = await L.confirmIfPaid(KEY, { folioId: db.folios[0].id, paid: 200 });
  assert.strictEqual(c1.skipped, 'not paid in full'); assert.strictEqual(sent.length, 0);   // partial message switched off
  console.log('partial payment, no confirmation: ok');
  db.app_store.find(r => r.key === 'booking_payment_flow').value.partial = true;
  const c1b = await L.confirmIfPaid(KEY, { folioId: db.folios[0].id, paid: 200 });
  assert.strictEqual(c1b.mode, 'partial'); assert.strictEqual(c1b.balance, 400);
  assert.deepStrictEqual(sent.map(s => s.ch), ['email', 'wa']);
  assert.strictEqual(sent[1].template.name, 'booking_payment_partial');
  assert.deepStrictEqual(sent[1].template.components[0].parameters.map(p => p.text).slice(0, 6), ['Ana', '$200.00 USD', 'from November 20 to 23rd', 'Garden', '$400.00 USD', 'November 10']);
  assert.ok(/received your payment of <strong>\$200\.00 USD/.test(sent[0].html));
  sent.length = 0;
  console.log('partial payment message: ok');
  // 3. next day: reminder with what is left, once a day
  dayLater(1); o = await L.sendReminders(KEY);
  assert.deepStrictEqual(o.reminded, ['Ana Test $400.00 USD']);
  assert.strictEqual(sent.find(s => s.ch === 'wa').template.name, 'booking_payment_reminder_v3');
  assert.ok(/Remaining balance: <strong>\$400\.00 USD/.test(sent.find(s => s.ch === 'email').html));
  sent.length = 0; o = await L.sendReminders(KEY); assert.strictEqual(sent.length, 0);
  dayLater(1); o = await L.sendReminders(KEY); assert.strictEqual(o.reminded.length, 1); assert.strictEqual(pending().bk1.reminders, 2);
  console.log('daily reminders: ok');
  // 4. paid in full: one confirmation, then nothing more
  sent.length = 0; pay(400);
  const c2 = await L.confirmIfPaid(KEY, { folioId: db.folios[0].id }); assert.strictEqual(c2.mode, 'confirmed');
  assert.deepStrictEqual(sent.map(s => s.ch), ['confirmation']);
  const c3 = await L.confirmIfPaid(KEY, { folioId: db.folios[0].id }); assert.strictEqual(c3.skipped, 'not waiting for a payment');
  dayLater(1); sent.length = 0; await L.sendReminders(KEY); assert.strictEqual(sent.length, 0);
  console.log('full payment, one confirmation: ok');
  // 5. another reservation never paid: reminders up to the due date, then overdue (nothing more to the guest)
  db.bookings.push({ ...db.bookings[0], id: 'bk2', leader_name: 'Bo Test' });
  db.registrations.push({ ...db.registrations[0], id: 'rg2', booking_id: 'bk2', guests: [{ name: 'Bo Test', email: 'bo@x.com', phone: '+15550002' }] });
  const r2 = await L.requestPayment(KEY, 'bk2'); const due = r2.dueDate;
  let reminders = 0;
  for (let d = 1; d <= 8; d++) { dayLater(1); sent.length = 0; const x = await L.sendReminders(KEY); reminders += x.reminded.filter(t => t.startsWith('Bo')).length; if (x.overdue.length) assert.ok(new Date(now).toISOString().slice(0, 10) > due); }
  assert.strictEqual(reminders, 6);
  const od = await L.overdueList(KEY); assert.strictEqual(od.length, 1); assert.ok(/Bo Test \(GV1, from November 20 to 23rd\): debe \$600\.00 USD/.test(od[0]));
  console.log('six reminders, then overdue: ok');
  // 6. switch off: confirmation at once, as before
  db.app_store.find(r => r.key === 'booking_payment_flow').value.enabled = false;
  db.bookings.push({ ...db.bookings[0], id: 'bk3' }); db.registrations.push({ ...db.registrations[0], id: 'rg3', booking_id: 'bk3' });
  sent.length = 0; const r3 = await L.requestPayment(KEY, 'bk3'); assert.strictEqual(r3.flow, 'off'); assert.deepStrictEqual(sent.map(s => s.ch), ['confirmation']);
  console.log('switch off, old behaviour: ok');
  Date.now = realNow;
})().catch(e => { console.error(e); process.exit(1); });
