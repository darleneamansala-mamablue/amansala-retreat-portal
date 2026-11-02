'use strict';

// session-refresh.js — swaps a database pass (portal-auth-lib signDbPass) that is still valid for a fresh one, so a
// browser left signed in keeps working past the 12 hours. A pass is renewed for at most 14 days after the sign-in it came
// from (auth_time); after that the person signs in again.
const { signDbPass, verifyDbPass, DB_PASS_MAX_DAYS, cors, reply } = require('./portal-auth-lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
  const c = verifyDbPass(b.dbPass);
  if (!c) return reply(401, { error: 'Sign in again' });
  if (Math.floor(Date.now() / 1000) - (c.auth_time || c.iat) > DB_PASS_MAX_DAYS * 86400) return reply(401, { error: 'Sign in again' });
  const { iss, aud, role, iat, exp, auth_time, ...claims } = c;
  return reply(200, { dbPass: signDbPass(claims, auth_time) });
};
