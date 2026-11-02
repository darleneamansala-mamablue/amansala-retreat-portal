// node test/sign-out-everywhere.test.js -- a new password, switching an account off or removing it signs that person out
// everywhere: session-refresh stops renewing their passes (open pages then sign out). Teachers are never affected; a pass
// that ran out while the computer slept is still renewed (12 h); a copied pass dies within the hour.
const assert = require('assert');
process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.SUPABASE_JWT_SECRET = 'jwt';
const lib = require('../netlify/functions/portal-auth-lib');
let store = {}, staff = [{ id: 'S1', name: 'Jorge', username: 'jorge', role: 'admin', active: true }, { id: 'S2', name: 'Tricia', username: 'tricia', role: 'staff', active: true }], logins = [];
const json = (d, status = 200) => ({ ok: status < 300, status, json: async () => d, text: async () => JSON.stringify(d) });
global.fetch = async (url, opts = {}) => {
  const u = new URL(url), p = u.searchParams, m = opts.method || 'GET', table = u.pathname.split('/').pop();
  const eq = k => { const v = p.get(k); return v && v.startsWith('eq.') ? decodeURIComponent(v.slice(3)) : null; };
  if (table === 'app_store') {
    const key = eq('key'), row = store[key];
    if (m === 'GET') return json(row ? [row] : []);
    if (m === 'PATCH') { if (!row || eq('updated_at') !== row.updated_at) return json([]); const b = JSON.parse(opts.body); store[key] = { ...b, updated_at: 'u' + Math.random() }; return json([store[key]]); }
    if (m === 'POST') { const b = JSON.parse(opts.body); store[b.key] = { ...b, updated_at: 'u' + Math.random() }; return json([store[b.key]], 201); }
  }
  if (table === 'portal_logins') {
    if (m === 'GET') return json(logins.filter(l => l.kind === eq('kind')));
    if (m === 'POST') { const r = JSON.parse(opts.body); logins = logins.filter(l => !(l.kind === r.kind && l.account_id === r.account_id)); logins.push(r); return json(null, 201); }
    if (m === 'DELETE') { logins = logins.filter(l => l.account_id !== eq('account_id')); return json(null, 204); }
  }
  if (table === 'staff') {
    const f = r => !eq('id') || r.id === eq('id');
    if (m === 'GET') return json(staff.filter(r => !eq('username') || r.username === eq('username')));
    if (m === 'PATCH') { const hit = staff.filter(f); hit.forEach(r => Object.assign(r, JSON.parse(opts.body))); return json(hit); }
    if (m === 'DELETE') { staff = staff.filter(r => !f(r)); return json(null, 204); }
  }
  return json([]);
};
const call = async (fn, body, headers = {}) => { const r = await require('../netlify/functions/' + fn).handler({ httpMethod: 'POST', headers, body: JSON.stringify(body) }); return { code: r.statusCode, ...JSON.parse(r.body) }; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const passFor = (claims, authSecAgo = 0) => lib.signDbPass(claims, Math.floor(Date.now() / 1000) - authSecAgo);
(async () => {
  const admin = lib.signToken({ kind: 'staff', sub: 'S1', name: 'Jorge', role: 'admin' });
  // Tricia signed in a minute ago
  const tPass = passFor({ sub: 'S2', app_role: 'staff' }, 60), tTok = lib.signToken({ kind: 'staff', sub: 'S2', name: 'Tricia', role: 'staff', auth: Date.now() - 60e3 });
  let r = await call('session-refresh', { dbPass: tPass, token: tTok });
  assert.ok(r.dbPass && r.token, 'renewed while nothing changed');
  // Jorge gives her a new password -> her passes are no longer renewed
  r = await call('staff-accounts', { token: admin, action: 'save', id: 'S2', name: 'Tricia', username: 'tricia', role: 'staff', password: 'newpass1' });
  assert.ok(r.ok && r.signedOut);
  assert.strictEqual((await call('session-refresh', { dbPass: tPass, token: tTok })).code, 401, 'old session refused after a new password');
  // her next sign-in (after the change) is fine
  await wait(1100);
  const fresh = passFor({ sub: 'S2', app_role: 'staff' }, 0);
  assert.ok((await call('session-refresh', { dbPass: fresh })).dbPass, 'a sign-in after the change is renewed');
  // switched off -> out; removed -> out
  await call('staff-accounts', { token: admin, action: 'setActive', id: 'S2', active: false });
  assert.strictEqual((await call('session-refresh', { dbPass: fresh })).code, 401, 'switched off');
  console.log('ok   - staff: new password / switched off -> passes not renewed; a later sign-in works');

  // spa login: new password set by an admin -> out
  const spa = passFor({ sub: 'spastaff_rosy', app_role: 'spa' }, 30);
  assert.ok((await call('session-refresh', { dbPass: spa })).dbPass);
  await call('portal-accounts', { token: admin, action: 'setPassword', kind: 'spa', accountId: 'spastaff_rosy', username: 'rosy', password: 'rosynew1' });
  assert.strictEqual((await call('session-refresh', { dbPass: spa })).code, 401);
  // confirm account switched off -> out
  const conf = passFor({ sub: 'sc_ana', app_role: 'confirm' }, 30);
  await call('portal-accounts', { token: admin, action: 'signOut', kind: 'confirm', accountId: 'sc_ana' });
  assert.strictEqual((await call('session-refresh', { dbPass: conf })).code, 401);
  console.log('ok   - spa / confirmation: new password or switched off -> out');

  // teachers are never signed out this way
  const teacher = passFor({ sub: 'teacher:b1', app_role: 'teacher', booking_id: 'b1' }, 30);
  assert.ok((await call('session-refresh', { dbPass: teacher })).dbPass);
  // passes last one hour; one that ran out during sleep is still renewed (12 h); a forged one never
  const [, body] = lib.signDbPass({ sub: 'S1', app_role: 'admin' }).split('.');
  const c = JSON.parse(Buffer.from(body, 'base64url'));
  assert.strictEqual(c.exp - c.iat, 3600);
  const crypto = require('crypto'), b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b64u({ alg: 'HS256', typ: 'JWT' }), now = Math.floor(Date.now() / 1000);
  const mk = claims => { const b = b64u(claims); return h + '.' + b + '.' + crypto.createHmac('sha256', 'jwt').update(h + '.' + b).digest('base64url'); };
  const slept = mk({ iss: 'amansala-portal', role: 'authenticated', sub: 'S1', app_role: 'admin', iat: now - 3 * 3600, exp: now - 2 * 3600, auth_time: now - 3 * 3600 });
  assert.ok((await call('session-refresh', { dbPass: slept })).dbPass, 'expired 2 h ago: renewed');
  const old = mk({ iss: 'amansala-portal', role: 'authenticated', sub: 'S1', app_role: 'admin', iat: now - 20 * 3600, exp: now - 19 * 3600, auth_time: now - 20 * 3600 });
  assert.strictEqual((await call('session-refresh', { dbPass: old })).code, 401, 'expired 19 h ago: sign in again');
  assert.strictEqual((await call('session-refresh', { dbPass: slept.slice(0, -4) + 'AAAA' })).code, 401, 'forged');
  console.log('ok   - teachers unaffected; 1-hour passes; renewed after sleep (12 h), not after that, never forged');
  // an admin pass from before a sign-out stops working at once in the account functions (not only at renewal) --
  // also an old-style pass (12 h, no sign-in time) from before this change
  const melOld = (() => { const t = lib.signToken({ kind: 'staff', sub: 'S1', name: 'Jorge', role: 'admin' }); return t; })();
  await new Promise(r => setTimeout(r, 5));
  store.session_revocations = { key: 'session_revocations', value: { 'staff:S1': new Date().toISOString() }, updated_at: 'x1' };
  assert.strictEqual((await call('staff-accounts', { token: melOld, action: 'save', name: 'Evil', username: 'evil', role: 'admin', password: 'evilpass' })).code, 401, 'revoked admin cannot create accounts');
  assert.strictEqual((await call('portal-accounts', { token: melOld, action: 'setPassword', kind: 'spa', accountId: 'x', username: 'x', password: 'xxxxxx' })).code, 401);
  console.log('ok   - a revoked admin pass is refused at once by the account functions');
  console.log('sign out everywhere: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
