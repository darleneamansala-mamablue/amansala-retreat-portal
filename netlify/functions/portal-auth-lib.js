'use strict';

// portal-auth-lib.js — passwords for the portal's smaller logins (spa staff, drivers, staff confirmation) and the old
// 'staffAccounts' list, checked on the server. Until 2026-11-02 those passwords sat in app_store in plain text (or an
// unsalted SHA-256) and were compared in the browser, so anyone holding the public anon key could read them. Now they
// live in the portal_logins table (sql/portal_logins.sql: RLS on, no access for anon), salted with scrypt.
//
// Moving them is lazy and safe to deploy before the table exists: every login first moves whatever passwords are still in
// that kind's app_store list into portal_logins and strips them from the list (an old browser tab that saves its copy
// back puts them there again, and the next login strips them again; a password already in portal_logins always wins).
// While the table is missing, logins check the old list exactly as before and nothing is stripped.
const crypto = require('crypto');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const BLOB_KEY = { spa: 'spaStaffAccounts', driver: 'driverAccounts', confirm: 'staffConfirmAccounts', staff: 'staffAccounts' };
// Accounts that only ever existed in the browser code (no app_store list was ever saved for spa staff or drivers). Their
// passwords were public in modules/*.js; they keep working until an admin sets new ones, and are no longer in the browser.
const DEFAULTS = {
  spa: [
    { id: 'spastaff_rosy', name: 'Rosy', username: 'rosy', password: 'rosy2026' },
    { id: 'spastaff_kike', name: 'Kike', username: 'kike', password: 'kike2026' },
    { id: 'spastaff_host', name: 'Host', username: 'host', password: 'host2026' },
    { id: 'spastaff_rubi', name: 'Rubi', username: 'rubi', password: 'rubi2026' },
  ],
  driver: [
    { id: 'drv_irving', name: 'Irving', username: 'irving', password: 'irving2026' },
    { id: 'drv_salamon', name: 'Salamon', username: 'salamon', password: 'salamon2026' },
  ],
  confirm: [], staff: [],
};

const hdrs = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const norm = s => String(s || '').trim().toLowerCase();

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return 'scrypt$' + salt.toString('hex') + '$' + crypto.scryptSync(String(pw), salt, 32).toString('hex');
}
// 'scrypt$salt$hash' (new), 'sha256$hex' (a hash moved from the old staffAccounts list); anything else never matches
function checkPassword(pw, stored) {
  const s = String(stored || '');
  if (s.startsWith('scrypt$')) {
    const [, salt, hash] = s.split('$');
    if (!salt || !hash) return false;
    const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'hex'), 32), want = Buffer.from(hash, 'hex');
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }
  if (s.startsWith('sha256$')) {
    const got = Buffer.from(crypto.createHash('sha256').update(String(pw), 'utf8').digest('hex')), want = Buffer.from(s.slice(7));
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }
  return false;
}

// Signed pass for a signed-in session (HMAC, 12 h): lets the account functions check that an admin is asking, without a
// new secret to configure -- the key is derived from the service key, which never leaves the server.
const TOKEN_HOURS = 1;   // renewed by session-refresh while the page is open (2026-11-02: was 12 h, not renewable)
const tokenKey = () => crypto.createHash('sha256').update('amansala-portal-token|' + (process.env.SUPABASE_SERVICE_KEY || '')).digest();
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function signToken(claims) {
  const now = Date.now();
  const body = b64u(JSON.stringify({ auth: now, ...claims, iat: now, exp: now + TOKEN_HOURS * 3600e3 }));   // auth = the sign-in time, kept on renewal
  return body + '.' + b64u(crypto.createHmac('sha256', tokenKey()).update(body).digest());
}
function verifyToken(tok, graceMs = 0) {
  const [body, sig] = String(tok || '').split('.');
  if (!body || !sig) return null;
  const want = b64u(crypto.createHmac('sha256', tokenKey()).update(body).digest());
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const c = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); return c.exp + graceMs > Date.now() ? c : null; } catch (e) { return null; }
}

// Database pass (security plan phase 2): a JWT signed with the project's JWT secret (Netlify env SUPABASE_JWT_SECRET,
// from Supabase > Project Settings > API > JWT secret), sent by the portal on every request to the database. Supabase
// then sees role 'authenticated' and these claims instead of the public anon key; the RLS rules of phase 4 read
// app_role (staff / admin / spa / driver / confirm) and, for teachers later, booking_id. Without the env var nothing is
// issued and the portal keeps using the anon key, as before.
const DB_PASS_HOURS = 1, DB_PASS_MAX_DAYS = 14;   // 1 h, renewed every few minutes while the page is open (was 12 h)
function signDbPass(claims, authTime) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: 'amansala-portal', aud: 'authenticated', role: 'authenticated', iat: now, exp: now + DB_PASS_HOURS * 3600, auth_time: authTime || now, ...claims }));
  return head + '.' + body + '.' + b64u(crypto.createHmac('sha256', secret).update(head + '.' + body).digest());
}
function verifyDbPass(tok, graceMs = 0) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  const [head, body, sig] = String(tok || '').split('.');
  if (!secret || !head || !body || !sig) return null;
  const want = b64u(crypto.createHmac('sha256', secret).update(head + '.' + body).digest());
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const c = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    return c.iss === 'amansala-portal' && c.exp + graceMs / 1000 > now ? c : null;
  } catch (e) { return null; }
}

// Signing someone out everywhere (2026-11-02): app_store 'session_revocations' = {"<kind>:<account id>": ISO time}. Passes
// issued before that time are not renewed (session-refresh), so open pages sign out within minutes and a copied pass
// stops working within the hour. Written when a password changes or an account is switched off or removed.
// kind: 'staff' (admin and staff logins), 'spa', 'driver', 'confirm'. Teachers (no account) are never on it.
const passKind = c => c && (c.kind || (c.app_role === 'admin' || c.app_role === 'staff' ? 'staff' : ['spa', 'driver', 'confirm'].includes(c.app_role) ? c.app_role : null));
async function revokedAt(key, kind, id) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.session_revocations&select=value`, { headers: hdrs(key) });
    const [row] = r.ok ? await r.json() : [];
    // '*' = everyone signed out at that time (Jorge 2026-11-05: after restoring the spa settings, no old tab may save its copy)
    const v = (row && row.value) || {}, t = Math.max(v[`${kind}:${id}`] ? Date.parse(v[`${kind}:${id}`]) : 0, v['*'] ? Date.parse(v['*']) : 0);
    return t || 0;
  } catch (e) { return 0; }
}
async function revokeSessions(key, kind, id) {
  if (!kind || !id) return false;
  for (let i = 0; i < 8; i++) {
    const g = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.session_revocations&select=value,updated_at`, { headers: hdrs(key) });
    const [row] = g.ok ? await g.json() : [];
    const value = { ...((row && row.value) || {}), [`${kind}:${id}`]: new Date().toISOString() }, now = new Date().toISOString();
    const r = row
      ? await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.session_revocations&updated_at=eq.${encodeURIComponent(row.updated_at)}`, { method: 'PATCH', headers: { ...hdrs(key), Prefer: 'return=representation' }, body: JSON.stringify({ value, updated_at: now }) })
      : await fetch(`${SUPABASE_URL}/rest/v1/app_store`, { method: 'POST', headers: { ...hdrs(key), Prefer: 'return=representation' }, body: JSON.stringify({ key: 'session_revocations', value, updated_at: now }) });
    if (r.ok && (await r.json()).length) return true;
    await new Promise(res => setTimeout(res, 80 + Math.random() * 200));
  }
  return false;
}

// staffFromEvent + "not signed out since": for functions that change things (accounts, prices, payroll, emails) a pass
// from before a sign-out-everywhere stops working at once, not only when it can no longer be renewed. Passes from before
// 2026-11-02 carry no sign-in time: their 12-hour expiry tells it.
async function staffAllowed(event, opts = {}) {
  const c = staffFromEvent(event, opts);
  if (!c) return null;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key || !c.sub) return c;
  const signedInAt = c.auth || c.iat || (c.exp - 12 * 3600e3);
  const t = await revokedAt(key, 'staff', String(c.sub));
  return t && t >= signedInAt ? null : c;
}

async function readBlob(key, kind) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.${BLOB_KEY[kind]}&select=value,updated_at`, { headers: hdrs(key) });
  const rows = r.ok ? await r.json() : [];
  const row = rows && rows[0];
  return row ? { list: Array.isArray(row.value) ? row.value : [], updatedAt: row.updated_at } : null;
}
// null = table not there yet (sql/portal_logins.sql not run)
async function readLogins(key, kind) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/portal_logins?kind=eq.${kind}&select=*`, { headers: hdrs(key) });
  if (!r.ok) return null;
  return r.json();
}
async function upsertLogin(key, row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/portal_logins?on_conflict=kind,account_id`, {
    method: 'POST', headers: { ...hdrs(key), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ ...row, username: norm(row.username), updated_at: new Date().toISOString() }),
  });
  return r.ok;
}
async function deleteLogin(key, kind, accountId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/portal_logins?kind=eq.${kind}&account_id=eq.${encodeURIComponent(accountId)}`, { method: 'DELETE', headers: hdrs(key) });
  return r.ok;
}

// Moves passwords still sitting in the kind's app_store list (and the code defaults) into portal_logins, then strips them
// from the list. Returns the kind's logins, or null while the table is missing.
async function migrateKind(key, kind) {
  let logins = await readLogins(key, kind);
  if (!logins) return null;
  const have = new Set(logins.map(l => l.account_id)), taken = new Set(logins.map(l => l.username));
  const blob = await readBlob(key, kind);
  const add = [];
  const consider = (a, stored) => {
    const id = String(a.id || ''), u = norm(a.username);
    if (!id || !u || !stored || have.has(id) || taken.has(u)) return;
    have.add(id); taken.add(u);
    add.push({ kind, account_id: id, username: u, name: a.name || u, password_hash: stored, active: a.active !== false });
  };
  (blob ? blob.list : []).forEach(a => consider(a, a.password ? hashPassword(a.password) : a.passwordHash ? 'sha256$' + String(a.passwordHash).toLowerCase() : null));
  DEFAULTS[kind].forEach(a => consider(a, hashPassword(a.password)));
  for (const row of add) if (await upsertLogin(key, row)) logins.push(row);
  if (blob && blob.list.some(a => a && (a.password || a.passwordHash))) {
    // only accounts whose password is now in portal_logins lose it; compare-and-swap on updated_at so a save from a
    // browser at the same moment is never overwritten (the next login strips it then)
    const safe = new Set(logins.map(l => l.account_id));
    const list = blob.list.map(a => { if (!a || !safe.has(String(a.id))) return a; const { password, passwordHash, ...rest } = a; return rest; });
    await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.${BLOB_KEY[kind]}&updated_at=eq.${encodeURIComponent(blob.updatedAt)}`, {
      method: 'PATCH', headers: { ...hdrs(key), Prefer: 'return=minimal' }, body: JSON.stringify({ value: list, updated_at: new Date().toISOString() }),
    });
  }
  return logins;
}

// Checks a username/password for one kind. Returns the account ({id,name,username}) or null.
async function checkLogin(key, kind, username, password) {
  const u = norm(username);
  if (!u || !password || !BLOB_KEY[kind]) return null;
  const logins = await migrateKind(key, kind);
  if (logins) {
    const l = logins.find(x => x.username === u && x.active !== false);
    if (!l || !checkPassword(password, l.password_hash)) return null;
    // an account switched off in its own list (Staff Confirm admin) cannot sign in either
    if (kind !== 'staff') {
      const blob = await readBlob(key, kind);
      const a = blob && blob.list.find(x => String(x.id) === l.account_id);
      if (a && a.active === false) return null;
      return { id: l.account_id, name: (a && a.name) || l.name, username: u };
    }
    return { id: l.account_id, name: l.name, username: u };
  }
  // table not created yet: the old check, on the server
  const blob = await readBlob(key, kind);
  const sha = crypto.createHash('sha256').update(String(password), 'utf8').digest('hex');
  const a = [...(blob ? blob.list : []), ...DEFAULTS[kind]].find(x => x && x.active !== false && norm(x.username) === u && (x.password === password || x.passwordHash === sha));
  return a ? { id: a.id, name: a.name, username: u, role: a.role } : null;
}

// The signed pass from staff-login (body.token or header X-Portal-Token), for functions only staff may call.
// opts.admin: role admin only; opts.names: lower-case name fragments allowed (Revenue Manager: jorge, darlene).
function staffFromEvent(event, opts = {}) {
  const h = event.headers || {};
  let tok = h['x-portal-token'] || h['X-Portal-Token'];
  if (!tok && event.body) { try { tok = JSON.parse(event.body).token; } catch (e) {} }
  const c = verifyToken(tok);
  if (!c || c.kind !== 'staff') return null;
  if (opts.admin && c.role !== 'admin') return null;
  if (opts.names && !opts.names.some(n => String(c.name || '').toLowerCase().includes(n))) return null;
  return c;
}

// For functions the portal's own screens call (security review 2026-11-10: several answered anyone): a staff pass in the
// X-Portal-Token header (the portal's fetch wrapper adds it), or -- when roles are given -- a database pass of one of those roles
// (Authorization: Bearer), or a call from another function of this site through require() (event.internal: true, which an HTTP
// request cannot set). Returns who it is, or null.
async function portalAllowed(event, opts = {}) {
  if (event && event.internal === true) return { internal: true };
  const h = (event && event.headers) || {};
  const st = await staffAllowed({ headers: h, body: '' }, opts);   // header only: some of these bodies carry a folio "token"
  if (st) return st;
  const roles = opts.roles || [];
  if (!roles.length) return null;
  const c = verifyDbPass(String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, ''));
  if (!c || !roles.includes(c.app_role)) return null;
  const key = process.env.SUPABASE_SERVICE_KEY, kind = passKind(c);
  if (key && kind && c.sub) { const t = await revokedAt(key, kind, String(c.sub)); if (t && t >= (c.auth_time || c.iat) * 1000) return null; }
  return c;
}

// The portal program itself is only served to a browser that signed in (2026-11-10, the accountant saw the whole portal's code
// without an account). Signing in sets this cookie; netlify/edge-functions/portal-gate.js checks it before handing out
// booking-hub.html and modules/*. Same signature on both sides: HMAC-SHA256, key = sha256('amansala-gate|' + service key).
const GATE_DAYS = 14;
const gateKey = () => crypto.createHash('sha256').update('amansala-gate|' + (process.env.SUPABASE_SERVICE_KEY || '')).digest();
function gateCookie(claims) {
  const body = b64u(JSON.stringify({ ...claims, exp: Date.now() + GATE_DAYS * 86400e3 }));
  const tok = body + '.' + b64u(crypto.createHmac('sha256', gateKey()).update(body).digest());
  return `ama_gate=${tok}; Path=/; Max-Age=${GATE_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}
const clearGateCookie = () => 'ama_gate=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';

// Server-to-server calls between this site's functions over HTTP (cloudbeds.js is called with fetch by stripe-webhook, rb-lib,
// cb-room-sync, ...): a header derived from the service key, which only the server has.
const internalKey = () => { const k = process.env.SUPABASE_SERVICE_KEY; return k ? crypto.createHash('sha256').update('amansala-internal:' + k).digest('hex') : ''; };
const internalHeaders = () => { const k = internalKey(); return k ? { 'X-Internal-Key': k } : {}; };
function isInternal(event) {
  const h = (event && event.headers) || {}, got = String(h['x-internal-key'] || h['X-Internal-Key'] || ''), want = internalKey();
  return !!want && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

const cors = () => ({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Portal-Token, Authorization' });
const reply = (code, data) => ({ statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

module.exports = { gateCookie, clearGateCookie, internalHeaders, isInternal, portalAllowed, staffAllowed, passKind, revokedAt, revokeSessions, staffFromEvent, signDbPass, verifyDbPass, DB_PASS_MAX_DAYS, SUPABASE_URL, BLOB_KEY, hdrs, norm, hashPassword, checkPassword, signToken, verifyToken, readBlob, readLogins, upsertLogin, deleteLogin, migrateKind, checkLogin, cors, reply };
