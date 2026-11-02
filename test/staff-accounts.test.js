// node test/staff-accounts.test.js -- Manage Staff through the server (staff-accounts.js): admins only; a new account can
// sign in (staff-login); username clashes refused; update without a password keeps it; deactivate; delete removes the row.
const assert = require('assert');
process.env.SUPABASE_SERVICE_KEY = 'svc';
const { signToken } = require('../netlify/functions/portal-auth-lib');
let staff = [{ id: 'S1', name: 'Jorge', username: 'jorge', role: 'admin', active: true, password_hash: 'x' }];
const json = (d, status = 200) => ({ ok: status < 300, status, json: async () => d, text: async () => JSON.stringify(d) });
global.fetch = async (url, opts = {}) => {
  const u = new URL(url), p = u.searchParams, m = opts.method || 'GET', table = u.pathname.split('/').pop();
  const f = r => [...p].every(([k, v]) => k === 'select' || !v.startsWith('eq.') || String(r[k]) === decodeURIComponent(v.slice(3)));
  if (table === 'app_store' || table === 'portal_logins') return json([]);
  if (table !== 'staff') return json([]);
  if (m === 'GET') return json(staff.filter(f));
  if (m === 'POST') { staff.push(JSON.parse(opts.body)); return json(null, 201); }
  if (m === 'PATCH') { const hit = staff.filter(f); hit.forEach(r => Object.assign(r, JSON.parse(opts.body))); return json(hit); }
  if (m === 'DELETE') { staff = staff.filter(r => !f(r)); return json(null, 204); }
};
const sa = require('../netlify/functions/staff-accounts'), login = require('../netlify/functions/staff-login');
const admin = signToken({ kind: 'staff', sub: 'S1', name: 'Jorge', role: 'admin' }), plain = signToken({ kind: 'staff', sub: 'S2', name: 'T', role: 'staff' });
const call = async (tok, body) => { const r = await sa.handler({ httpMethod: 'POST', headers: { 'x-portal-token': tok }, body: JSON.stringify(body) }); return { code: r.statusCode, ...JSON.parse(r.body) }; };
(async () => {
  assert.strictEqual((await call(plain, { action: 'save', name: 'N', username: 'n', password: 'secret1' })).code, 401, 'not an admin');
  assert.strictEqual((await call('', { action: 'save', name: 'N', username: 'n', password: 'secret1' })).code, 401, 'no pass');
  let r = await call(admin, { action: 'save', name: 'New Person', username: 'NewP', role: 'staff', password: 'secret12' });
  assert.ok(r.ok && r.id);
  const l = JSON.parse((await login.handler({ httpMethod: 'POST', body: JSON.stringify({ username: 'newp', password: 'secret12' }) })).body);
  assert.strictEqual(l.success, true, 'new account signs in'); assert.strictEqual(l.session.role, 'staff');
  assert.strictEqual((await call(admin, { action: 'save', name: 'Other', username: 'newp', password: 'secret12' })).code, 409, 'username taken');
  assert.strictEqual((await call(admin, { action: 'save', name: 'Short', username: 's2', password: '123' })).code, 400, 'short password');
  r = await call(admin, { action: 'save', id: r.id, name: 'New Person 2', username: 'newp', role: 'admin' });
  const row = staff.find(x => x.username === 'newp');
  assert.ok(r.ok); assert.strictEqual(row.name, 'New Person 2'); assert.strictEqual(row.role, 'admin'); assert.ok(row.password_hash, 'password kept');
  assert.ok((await call(admin, { action: 'setActive', id: row.id, active: false })).ok); assert.strictEqual(row.active, false);
  assert.strictEqual(JSON.parse((await login.handler({ httpMethod: 'POST', body: JSON.stringify({ username: 'newp', password: 'secret12' }) })).body).success, false, 'inactive cannot sign in');
  assert.strictEqual((await call(admin, { action: 'delete', id: 'S1' })).code, 400, 'not yourself');
  assert.ok((await call(admin, { action: 'delete', id: row.id })).ok); assert.ok(!staff.some(x => x.id === row.id), 'row removed');
  console.log('staff accounts: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
