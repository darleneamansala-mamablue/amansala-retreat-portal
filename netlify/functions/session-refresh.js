'use strict';

// session-refresh.js — renews a signed-in page's passes while it is open: the database pass (signDbPass) and/or the
// staff-login pass (signToken), both 1 hour. Called every few minutes by the portal (and the Revenue Manager / spa
// payroll pages). A pass is renewed for at most 14 days after the sign-in it came from, and never after the account was
// signed out everywhere (password changed, switched off or removed -- session_revocations): then the reply is 401 and the
// page asks to sign in again.
//   POST {dbPass?, token?}  ->  {dbPass?, token?}
const { signDbPass, verifyDbPass, signToken, verifyToken, DB_PASS_MAX_DAYS, passKind, revokedAt, cors, reply } = require('./portal-auth-lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  const key = process.env.SUPABASE_SERVICE_KEY;
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
  // a pass that ran out while the computer slept can still be renewed for 12 h (never once the account was signed out)
  const GRACE = 12 * 3600e3;
  const db = b.dbPass ? verifyDbPass(b.dbPass, GRACE) : null, tk = b.token ? verifyToken(b.token, GRACE) : null;
  if ((b.dbPass && !db && !tk) || (b.token && !tk && !db) || (!db && !tk)) return reply(401, { error: 'Sign in again' });
  const now = Date.now(), maxMs = DB_PASS_MAX_DAYS * 86400e3;
  const signedInAt = db ? (db.auth_time || db.iat) * 1000 : (tk.auth || tk.iat || 0);
  if (now - signedInAt > maxMs) return reply(401, { error: 'Sign in again' });
  // signed out everywhere since this sign-in?
  const who = db || tk, kind = passKind(who);
  if (kind && who.sub && key) {
    const t = await revokedAt(key, kind, String(who.sub));
    if (t && t >= signedInAt) return reply(401, { error: 'Your account changed — please sign in again.' });
  }
  const out = {};
  if (db) { const { iss, aud, role, iat, exp, auth_time, ...claims } = db; out.dbPass = signDbPass(claims, auth_time); }
  if (tk) { const { iat, exp, ...claims } = tk; out.token = signToken(claims); }
  return reply(200, out);
};
