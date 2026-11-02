'use strict';

// portal-login.js — sign-in for the smaller logins: spa staff (?mode=spa-staff), drivers (?mode=driver) and staff
// confirmation (?mode=confirm). The browser sends {kind, username, password}; the password is checked here against
// portal_logins (see portal-auth-lib.js), never in the browser.
const { checkLogin, signToken, cors, reply } = require('./portal-auth-lib');

const KINDS = ['spa', 'driver', 'confirm'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
  const kind = String(body.kind || '');
  if (!KINDS.includes(kind)) return reply(400, { error: 'Unknown login' });
  try {
    const acct = await checkLogin(key, kind, body.username, String(body.password || ''));
    if (!acct) return reply(200, { success: false });
    return reply(200, { success: true, session: { id: acct.id, name: acct.name, username: acct.username }, token: signToken({ kind, sub: acct.id, name: acct.name }) });
  } catch (e) {
    console.error('[portal-login]', e);
    return reply(500, { error: 'Login failed' });
  }
};
