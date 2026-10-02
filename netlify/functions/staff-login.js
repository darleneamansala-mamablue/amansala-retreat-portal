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
// Checks, in order, the same three sources the old client-side
// staffLoginSubmit() did: the `staff` SQL table (current system of record),
// the legacy app_store 'staffAccounts' blob (older accounts never migrated),
// then the hardcoded MASTER fallback accounts -- so no existing login breaks.
const crypto = require('crypto');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

const MASTER = [
  { id: 'staff_001', name: 'Darlene', username: 'darlene', password: 'amansala2024', role: 'admin' },
  { id: 'staff_002', name: 'Front Desk', username: 'frontdesk', password: 'welcome1', role: 'staff' },
];

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
      if (acct) return ok({ success: true, session: { id: acct.id, name: acct.name, role: acct.role } });
    }
  } catch (e) { /* fall through */ }

  // 2. Legacy app_store 'staffAccounts' blob -- accounts never migrated to `staff`.
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.staffAccounts&select=value`, { headers: hdrs });
    if (r.ok) {
      const rows = await r.json();
      const list = (rows && rows[0] && Array.isArray(rows[0].value)) ? rows[0].value : [];
      const acct = list.find(s => s.active !== false && (s.username || '').toLowerCase() === username && s.passwordHash === passwordHash);
      if (acct) return ok({ success: true, session: { id: acct.id, name: acct.name, role: acct.role } });
    }
  } catch (e) { /* fall through */ }

  // 3. Hardcoded master fallback accounts -- matches the old client behavior.
  const m = MASTER.find(s => s.username === username && s.password === password);
  if (m) return ok({ success: true, session: { id: m.id, name: m.name, role: m.role } });

  return ok({ success: false });
};

function ok(data) {
  return { statusCode: 200, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}
function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
