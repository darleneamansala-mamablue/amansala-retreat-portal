'use strict';
// refund-folio-payment.js against a fake Stripe + database: only Jorge/Hilario/Melissa, never more than Stripe says is
// left, the refund line on the folio, the guest emailed + WhatsApp'd.
const assert = require('assert');
process.env.SUPABASE_SERVICE_KEY = 'k'; process.env.STRIPE_SECRET_KEY = 's'; process.env.PORTAL_TOKEN_SECRET = 't'; process.env.SUPABASE_JWT_SECRET = 't';
process.env.RESEND_API_KEY = 'r'; process.env.VISITO_M2M_KEY = 'v'; process.env.VISITO_WA_CHANNEL_ID = 'c';
const db = {
  folio_items: [{ id: 'it1', folio_id: 'f1', description: 'Payment — Credit Card (Stripe) (pi_abc)', unit_price: -200, category: 'Payment' },
    { id: 'it2', folio_id: 'f1', description: 'Payment — Cash', unit_price: -50, category: 'Payment' }],
  folios: [{ id: 'f1', guest_name: 'Ana Test', registration_id: 'rg1', booking_request_id: null }],
  registrations: [{ id: 'rg1', booking_id: 'bk1', guests: [{ name: 'Ana Test', email: 'ana@x.com', phone: '+15550001111' }], check_in: null, check_out: null }],
  bookings: [{ id: 'bk1', start_date: '2026-11-20', end_date: '2026-11-23' }],
};
let refunded = 0; const sent = [];
global.fetch = async (url, opt = {}) => {
  const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  if (url.includes('api.resend.com')) { sent.push('email:' + JSON.parse(opt.body).to[0]); return res(200, {}); }
  if (url.includes('visitoai.com')) { sent.push('wa:' + JSON.parse(opt.body).to); return res(200, { accepted: true }); }
  if (url.includes('/payment_intents/')) return res(200, { id: 'pi_abc', status: 'succeeded', latest_charge: { amount: 20000, amount_refunded: refunded } });
  if (url.includes('/refunds')) { const a = Number(new URLSearchParams(opt.body).get('amount')); refunded += a; return res(200, { id: 're_' + refunded }); }
  const u = new URL(url), t = u.pathname.split('/').pop();
  if ((opt.method || 'GET') === 'POST') { const row = { id: 'n' + db[t].length, ...JSON.parse(opt.body) }; db[t].push(row); return res(201, [row]); }
  const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
  return res(200, db[t].filter(r => r.id === id));
};
const { signToken } = require('../netlify/functions/portal-auth-lib');
const fn = require('../netlify/functions/refund-folio-payment');
const call = (name, body) => fn.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ token: signToken({ kind: 'staff', name, role: 'admin' }), ...body }) }).then(r => ({ code: r.statusCode, ...JSON.parse(r.body) }));

(async () => {
  let r = await call('Irvin', { folioItemId: 'it1', amount: 50 }); assert.strictEqual(r.code, 403);
  r = await call('Jorge', { folioItemId: 'it2', amount: 10 }); assert.strictEqual(r.code, 400); assert.ok(/by hand/.test(r.error));
  r = await call('Hilario', { folioItemId: 'it1', amount: 80, reason: 'one night less' });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.stillRefundable, 120);
  const line = db.folio_items.find(i => /^Refund/.test(i.description)); assert.strictEqual(line.unit_price, 80); assert.ok(/of pi_abc · one night less/.test(line.description));
  assert.deepStrictEqual(sent, ['email:ana@x.com', 'wa:15550001111']);
  r = await call('Melissa', { folioItemId: 'it1', amount: 130 }); assert.strictEqual(r.code, 400); assert.ok(/\$120\.00 USD/.test(r.error));
  r = await call('Jorge', { folioItemId: 'it1', amount: 120 }); assert.strictEqual(r.code, 200); assert.strictEqual(r.stillRefundable, 0);
  r = await call('Jorge', { folioItemId: 'it1', amount: 1 }); assert.ok(/fully refunded/.test(r.error));
  console.log('refund-folio-payment: ok');
})().catch(e => { console.error(e); process.exit(1); });
