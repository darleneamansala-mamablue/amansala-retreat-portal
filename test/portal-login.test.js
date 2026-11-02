// node test/portal-login.test.js -- passwords of the smaller logins and the old staffAccounts list move from app_store
// (readable with the public key) to portal_logins, checked on the server; the master password no longer signs in.
const assert = require('assert');
process.env.SUPABASE_SERVICE_KEY = 'service-key';
const json = (d, status = 200) => ({ ok: status < 300, status, json: async () => d, text: async () => JSON.stringify(d) });
let db;
function reset({ table = true } = {}) {
  db = {
    table,
    logins: [],
    store: {
      staffConfirmAccounts: { value: [
        { id: 'sc_ana', name: 'Ana', username: 'ana', password: 'ana-secret', active: true, unavailableDates: ['2026-11-05'] },
        { id: 'sc_off', name: 'Off', username: 'off', password: 'off-secret', active: false },
      ], updated_at: 't1' },
      staffAccounts: { value: [
        { id: 'st_1', name: 'Test', username: 'test', password: 'plain-old', role: 'admin', active: true },
        { id: 'st_2', name: 'Yohan', username: 'yohan', passwordHash: require('crypto').createHash('sha256').update('hashed-old').digest('hex'), role: 'admin', active: true },
      ], updated_at: 't2' },
    },
    staff: [],
  };
}
global.fetch = async (url, opts = {}) => {
  const u = new URL(url), p = u.searchParams, path = u.pathname, m = opts.method || 'GET';
  if (path.endsWith('/portal_logins')) {
    if (!db.table) return json({ code: '42P01', message: 'relation does not exist' }, 404);
    if (m === 'GET') return json(db.logins.filter(l => l.kind === p.get('kind').slice(3)));
    if (m === 'POST') { const r = JSON.parse(opts.body); db.logins = db.logins.filter(l => !(l.kind === r.kind && l.account_id === r.account_id)); db.logins.push(r); return json(null, 201); }
    if (m === 'DELETE') { db.logins = db.logins.filter(l => !(l.kind === p.get('kind').slice(3) && l.account_id === p.get('account_id').slice(3))); return json(null, 204); }
  }
  if (path.endsWith('/app_store')) {
    if (m === 'POST') { const b = JSON.parse(opts.body); db.store[b.key] = { value: b.value, updated_at: 'p' + Date.now() }; return json([db.store[b.key]], 201); }
    const key = p.get('key').slice(3), row = db.store[key];
    if (m === 'GET') return json(row ? [{ value: row.value, updated_at: row.updated_at }] : []);
    if (m === 'PATCH') { if (!row || decodeURIComponent(p.get('updated_at').slice(3)) !== row.updated_at) return json([]); const b = JSON.parse(opts.body); db.store[key] = { value: b.value, updated_at: b.updated_at + Math.random() }; return json([db.store[key]]); }
  }
  if (path.endsWith('/staff')) return json(db.staff.filter(s => s.username === p.get('username').slice(3)));
  throw new Error('unexpected ' + m + ' ' + url);
};
const call = (fn, body) => require('../netlify/functions/' + fn).handler({ httpMethod: 'POST', body: JSON.stringify(body) }).then(r => JSON.parse(r.body));
const noPasswords = key => db.store[key].value.every(a => !a.password && !a.passwordHash);

(async () => {
  // 1. Staff confirmation: the password in the list still works, then lives only in portal_logins, salted
  reset();
  let r = await call('portal-login', { kind: 'confirm', username: 'Ana', password: 'ana-secret' });
  assert.strictEqual(r.success, true); assert.strictEqual(r.session.id, 'sc_ana'); assert.ok(r.token);
  assert.ok(noPasswords('staffConfirmAccounts'), 'passwords stripped from app_store');
  assert.deepStrictEqual(db.store.staffConfirmAccounts.value[0].unavailableDates, ['2026-11-05'], 'the rest of the account kept');
  assert.ok(db.logins.every(l => l.password_hash.startsWith('scrypt$') && !l.password_hash.includes('ana-secret')));
  assert.strictEqual((await call('portal-login', { kind: 'confirm', username: 'ana', password: 'ana-secret' })).success, true, 'still works after the move');
  assert.strictEqual((await call('portal-login', { kind: 'confirm', username: 'ana', password: 'wrong' })).success, false);
  assert.strictEqual((await call('portal-login', { kind: 'confirm', username: 'off', password: 'off-secret' })).success, false, 'switched-off account');
  console.log('ok   - confirm: password moved to the server, stripped from the list, wrong/off refused');

  // 2. An old browser tab saves its copy back with the password: the next login strips it again, the server copy wins
  db.store.staffConfirmAccounts = { value: [{ id: 'sc_ana', name: 'Ana', username: 'ana', password: 'stale', active: true }], updated_at: 't9' };
  assert.strictEqual((await call('portal-login', { kind: 'confirm', username: 'ana', password: 'stale' })).success, false, 'stale password from the list ignored');
  assert.ok(noPasswords('staffConfirmAccounts'));
  console.log('ok   - an old tab putting a password back: stripped again, server password wins');

  // 3. Spa staff / drivers (accounts only in the code): the old passwords keep working, now checked on the server
  assert.strictEqual((await call('portal-login', { kind: 'spa', username: 'rosy', password: 'rosy2026' })).success, true);
  assert.strictEqual((await call('portal-login', { kind: 'driver', username: 'irving', password: 'irving2026' })).success, true);
  assert.strictEqual((await call('portal-login', { kind: 'driver', username: 'irving', password: 'rosy2026' })).success, false);
  console.log('ok   - spa staff and drivers sign in on the server');

  // 4. Before sql/portal_logins.sql is run: the old check, on the server, and nothing is stripped
  reset({ table: false });
  assert.strictEqual((await call('portal-login', { kind: 'confirm', username: 'ana', password: 'ana-secret' })).success, true);
  assert.ok(!noPasswords('staffConfirmAccounts'), 'nothing stripped while the table is missing');
  assert.strictEqual((await call('portal-login', { kind: 'spa', username: 'kike', password: 'kike2026' })).success, true);
  console.log('ok   - table not created yet: logins keep working, nothing removed');

  // 5. staff-login: master password gone; old staffAccounts list (plain and SHA-256) moves to portal_logins; admin pass
  reset();
  assert.strictEqual((await call('staff-login', { username: 'darlene', password: 'amansala2024' })).success, false, 'master password refused');
  r = await call('staff-login', { username: 'test', password: 'plain-old' });
  assert.strictEqual(r.success, true); assert.strictEqual(r.session.role, 'admin'); assert.ok(r.token);
  assert.strictEqual((await call('staff-login', { username: 'yohan', password: 'hashed-old' })).success, true, 'old SHA-256 account');
  assert.ok(noPasswords('staffAccounts'));
  db.staff = [{ id: 'S9', name: 'Real', username: 'real', role: 'staff', active: true, password_hash: require('crypto').createHash('sha256').update('pw').digest('hex') }];
  const staffTok = (await call('staff-login', { username: 'real', password: 'pw' })).token;
  console.log('ok   - staff-login: master password refused, old list moved, pass returned');

  // 6. portal-accounts: only an admin pass can set a password; the new one works, the old one stops
  assert.ok((await call('portal-accounts', { token: staffTok, action: 'setPassword', kind: 'confirm', accountId: 'sc_ana', username: 'ana', password: 'brand-new' })).error, 'non-admin refused');
  assert.ok((await call('portal-accounts', { token: 'x.y', action: 'setPassword', kind: 'confirm', accountId: 'sc_ana', username: 'ana', password: 'brand-new' })).error, 'forged pass refused');
  const ok = await call('portal-accounts', { token: r.token, action: 'setPassword', kind: 'confirm', accountId: 'sc_ana', username: 'ana', name: 'Ana', password: 'brand-new' });
  assert.strictEqual(ok.success, true);
  assert.strictEqual((await call('portal-login', { kind: 'confirm', username: 'ana', password: 'brand-new' })).success, true);
  assert.strictEqual((await call('portal-login', { kind: 'confirm', username: 'ana', password: 'ana-secret' })).success, false);
  assert.strictEqual((await call('portal-accounts', { token: r.token, action: 'remove', kind: 'confirm', accountId: 'sc_ana' })).success, true);
  assert.strictEqual((await call('portal-login', { kind: 'confirm', username: 'ana', password: 'brand-new' })).success, false, 'removed account');
  console.log('ok   - portal-accounts: admin sets / removes passwords, others refused');

  // 7. Database pass: none without SUPABASE_JWT_SECRET; with it, an HS256 JWT Supabase accepts (role authenticated +
  //    app_role), renewable while valid, never after 14 days, never forged
  reset();
  delete process.env.SUPABASE_JWT_SECRET;
  assert.strictEqual((await call('portal-login', { kind: 'spa', username: 'rosy', password: 'rosy2026' })).dbPass, null, 'no secret: no pass');
  process.env.SUPABASE_JWT_SECRET = 'jwt-secret-for-tests';
  const crypto = require('crypto');
  const parse = t => { const [h, b, sg] = t.split('.'); assert.strictEqual(crypto.createHmac('sha256', 'jwt-secret-for-tests').update(h + '.' + b).digest('base64url'), sg, 'HS256 signature'); return [JSON.parse(Buffer.from(h, 'base64url')), JSON.parse(Buffer.from(b, 'base64url'))]; };
  let pass = (await call('portal-login', { kind: 'spa', username: 'rosy', password: 'rosy2026' })).dbPass;
  let [hd, cl] = parse(pass);
  assert.deepStrictEqual([hd.alg, cl.role, cl.aud, cl.app_role, cl.sub], ['HS256', 'authenticated', 'authenticated', 'spa', 'spastaff_rosy']);
  assert.ok(cl.exp - cl.iat === 3600, 'one hour');
  const adminPass = (await call('staff-login', { username: 'test', password: 'plain-old' })).dbPass;
  assert.strictEqual(parse(adminPass)[1].app_role, 'admin');
  const fresh = (await call('session-refresh', { dbPass: pass })).dbPass;
  assert.ok(fresh && parse(fresh)[1].auth_time === cl.auth_time && parse(fresh)[1].app_role === 'spa', 'renewed, same sign-in time');
  const forged = pass.split('.').slice(0, 2).join('.') + '.' + 'x'.repeat(43);
  assert.ok((await call('session-refresh', { dbPass: forged })).error, 'forged pass refused');
  const old = require('../netlify/functions/portal-auth-lib').signDbPass({ sub: 'a', app_role: 'spa' }, Math.floor(Date.now() / 1000) - 15 * 86400);
  assert.ok((await call('session-refresh', { dbPass: old })).error, 'sign-in older than 14 days refused');
  console.log('ok   - database pass: signed for Supabase, renewable, forged/too old refused');
  console.log('portal login: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
