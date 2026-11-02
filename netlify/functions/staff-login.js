'use strict';

// Verifies a staff username/password server-side (using the Supabase service
// key, never exposed to the browser) instead of the client downloading every
// account's password_hash to compare locally. Security report 2026-10-02: a
// colleague noticed the anon key is visible in booking-hub.html's source --
// that key is SUPPOSED to be public (Supabase's design), but with no Row
// Level Security on any table, it meant the `staff` SQL table's password
// hashes (and the legacy app_store 'staffAccounts' blob's) were readable by
// anyone with that key, no login required. This function is the fix for the
// highest-severity piece of that: password hashes never leave the server.
//
// Checks, in order: the `staff` SQL table (current system of record), then the
// accounts of the legacy app_store 'staffAccounts' list, whose passwords now live
// in portal_logins (portal-auth-lib.js moves them there and strips them from the
// list). The hardcoded MASTER accounts were removed 2026-11-02: their passwords
// were also written in the public page code (admin-staff.js, spa-payroll.html),
// so anyone could sign in as Darlene.
// A successful login also returns `token`, a signed 12-hour pass the admin
// screens send to the account functions (portal-accounts.js).
const crypto = require('crypto');
const { checkLogin, signToken } = require('./portal-auth-lib');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!username || !password) return ok({ success: false });

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };
  const passwordHash = sha256Hex(password);

  // 1. Real `staff` SQL table -- current system of record.
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/staff?username=eq.${encodeURIComponent(username)}&select=id,name,role,active,password_hash`,
      { headers: hdrs }
    );
    if (r.ok) {
      const rows = await r.json();
      const acct = (rows || []).find(s => s.active !== false && s.password_hash === passwordHash);
      if (acct) return done({ id: acct.id, name: acct.name, role: acct.role });
    }
  } catch (e) { /* fall through */ }

  // 2. Legacy app_store 'staffAccounts' list -- accounts never migrated to `staff`.
  try {
    const acct = await checkLogin(supaKey, 'staff', username, password);
    if (acct) {
      let role = acct.role;
      if (!role) { const b = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.staffAccounts&select=value`, { headers: hdrs }); const rows = b.ok ? await b.json() : []; const a = ((rows[0] && rows[0].value) || []).find(x => String(x.id) === String(acct.id)); role = (a && a.role) || 'staff'; }
      return done({ id: acct.id, name: acct.name, role });
    }
  } catch (e) { /* fall through */ }

  return ok({ success: false });
};

function done(session) {
  return ok({ success: true, session, token: signToken({ kind: 'staff', sub: session.id, name: session.name, role: session.role }) });
}
function ok(data) {
  return { statusCode: 200, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}
function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
