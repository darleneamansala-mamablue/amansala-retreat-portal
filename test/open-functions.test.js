// node test/open-functions.test.js -- functions that used to answer anyone on the internet (2026-11-02): the Revenue
// Manager price functions and the energy assistant need the staff-login pass; the spa refund only refunds a fresh
// spa-booking payment that no appointment holds.
const assert = require('assert');
process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.STRIPE_SECRET_KEY = 'sk'; process.env.ANTHROPIC_API_KEY = 'ak';
const { signToken } = require('../netlify/functions/portal-auth-lib');
const json = (d, status = 200) => ({ ok: status < 300, status, json: async () => d, text: async () => JSON.stringify(d) });
let pis = {}, appts = [], refunded = [];
global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.hostname === 'api.stripe.com') {
    if (u.pathname.startsWith('/v1/payment_intents/')) { const pi = pis[decodeURIComponent(u.pathname.split('/').pop())]; return json(pi || { error: { message: 'No such payment_intent' } }, pi ? 200 : 404); }
    if (u.pathname === '/v1/refunds') { const id = new URLSearchParams(opts.body).get('payment_intent'); refunded.push(id); return json({ id: 're_1', status: 'succeeded', amount: 100 }); }
  }
  if (u.pathname.endsWith('/app_store')) return json([{ value: appts }]);
  return json([]);   // settings/rates reads
};
const call = (fn, ev) => require('../netlify/functions/' + fn).handler({ httpMethod: 'POST', headers: {}, ...ev });
const now = Math.floor(Date.now() / 1000);
(async () => {
  const jorge = signToken({ kind: 'staff', sub: 'j', name: 'Jorge Canales', role: 'admin' });
  const other = signToken({ kind: 'staff', sub: 't', name: 'Tricia', role: 'staff' });
  const spa = signToken({ kind: 'spa', sub: 's', name: 'Rosy' });

  // Revenue Manager functions: no pass / someone else / a spa pass -> 401; Jorge -> past the check
  for (const fn of ['room-price-apply', 'room-price-settings', 'room-price-recalc-now']) {
    for (const [label, tok] of [['no pass', ''], ['Tricia', other], ['spa login', spa], ['forged', jorge.slice(0, -2) + 'xx']]) {
      const r = await call(fn, { headers: tok ? { 'x-portal-token': tok } : {}, body: JSON.stringify({ changes: [] }) });
      assert.strictEqual(r.statusCode, 401, `${fn} with ${label}`);
    }
    const r = await call(fn, { headers: { 'x-portal-token': jorge }, body: JSON.stringify({ changes: [] }) });
    assert.notStrictEqual(r.statusCode, 401, fn + ' with Jorge');
  }
  console.log('ok   - Revenue Manager price functions: staff pass of Jorge/Darlene only');

  // energy assistant: staff only
  assert.strictEqual((await call('energy-chat', { body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) })).statusCode, 401);
  console.log('ok   - energy assistant: refused without a staff pass');

  // spa refund
  pis = {
    pi_fresh: { id: 'pi_fresh', status: 'succeeded', created: now - 60, metadata: { source: 'spa_booking' } },
    pi_room: { id: 'pi_room', status: 'succeeded', created: now - 60, metadata: { source: 'booking_engine' } },
    pi_old: { id: 'pi_old', status: 'succeeded', created: now - 3 * 3600, metadata: { source: 'spa_booking' } },
    pi_booked: { id: 'pi_booked', status: 'succeeded', created: now - 60, metadata: { source: 'spa_booking' } },
  };
  appts = [{ id: 'a1', paymentIntentId: 'pi_booked', status: 'BOOKED' }];
  const refund = async id => (await call('refund-spa-payment', { body: JSON.stringify({ paymentIntentId: id }) })).statusCode;
  assert.strictEqual(await refund('pi_room'), 403, 'not a spa payment');
  assert.strictEqual(await refund('pi_old'), 403, 'older than 2 h');
  assert.strictEqual(await refund('pi_booked'), 403, 'held by an appointment');
  assert.strictEqual(await refund('pi_nope'), 400, 'unknown payment');
  assert.deepStrictEqual(refunded, [], 'nothing refunded so far');
  assert.strictEqual(await refund('pi_fresh'), 200, 'fresh spa payment with no appointment');
  assert.deepStrictEqual(refunded, ['pi_fresh']);
  console.log('ok   - spa refund: only a fresh spa payment no appointment holds');
  // send-email: signed-in portal sessions only (staff-login pass, or a database pass of any portal role incl. a teacher's)
  process.env.RESEND_API_KEY = 're'; process.env.SUPABASE_JWT_SECRET = 'jwt';
  const lib = require('../netlify/functions/portal-auth-lib');
  const mail = { to: 'x@y.com', subject: 's', html: '<p>h</p>' };
  const sent = async headers => (await call('send-email', { headers, body: JSON.stringify(mail) })).statusCode;
  assert.strictEqual(await sent({}), 401, 'anyone');
  assert.strictEqual(await sent({ 'x-portal-token': 'forged.x' }), 401);
  assert.strictEqual(await sent({ authorization: 'Bearer ' + lib.signDbPass({ app_role: 'teacher' }).slice(0, -3) + 'abc' }), 401, 'forged pass');
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => url.includes('api.resend.com') ? json({ id: 'm1' }) : realFetch(url, opts);
  assert.strictEqual(await sent({ 'x-portal-token': other }), 200, 'staff session');
  assert.strictEqual(await sent({ authorization: 'Bearer ' + lib.signDbPass({ app_role: 'teacher', booking_id: 'b1' }) }), 200, 'teacher session');
  global.fetch = realFetch;
  console.log('ok   - send-email: refused without a signed-in portal session');
  console.log('open functions: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
