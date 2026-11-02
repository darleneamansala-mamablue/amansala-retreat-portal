'use strict';

// portal-accounts.js — set or remove the password of a spa staff / driver / staff confirmation login, from the admin
// screens. The caller sends the pass it got from staff-login (admin role) as `token`.
//   {token, action:'setPassword', kind, accountId, username, name, password}
//   {token, action:'remove', kind, accountId}
//   {token, action:'status', kind}   -> {ids: [account ids that have a password]}
//   {token, action:'signOut', kind, accountId}   signs the person out everywhere (account switched off)
const { staffAllowed, hashPassword, upsertLogin, deleteLogin, migrateKind, revokeSessions, norm, cors, reply } = require('./portal-auth-lib');

const KINDS = ['spa', 'driver', 'confirm'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
  const who = await staffAllowed({ headers: {}, body: JSON.stringify({ token: b.token }) }, { admin: true });
  if (!who) return reply(401, { error: 'Sign out and sign in again as an admin to change passwords.' });
  const kind = String(b.kind || '');
  if (!KINDS.includes(kind)) return reply(400, { error: 'Unknown login' });
  try {
    const logins = await migrateKind(key, kind);
    if (!logins) return reply(503, { error: 'The password table is not set up yet (sql/portal_logins.sql).' });
    if (b.action === 'status') return reply(200, { ids: logins.map(l => l.account_id) });
    const id = String(b.accountId || '');
    if (!id) return reply(400, { error: 'Missing account' });
    if (b.action === 'signOut') return reply(200, { success: await revokeSessions(key, kind, id) });
    if (b.action === 'remove') { const okDel = await deleteLogin(key, kind, id); await revokeSessions(key, kind, id); return reply(200, { success: okDel }); }
    if (b.action === 'setPassword') {
      const pw = String(b.password || ''), u = norm(b.username);
      if (pw.length < 6) return reply(400, { error: 'Use at least 6 characters.' });
      if (!u) return reply(400, { error: 'Missing username' });
      if (logins.some(l => l.username === u && l.account_id !== id)) return reply(409, { error: 'That username is already in use.' });
      const okSet = await upsertLogin(key, { kind, account_id: id, username: u, name: b.name || u, password_hash: hashPassword(pw), active: true });
      if (okSet) await revokeSessions(key, kind, id);   // a new password signs this person out everywhere
      return reply(200, { success: okSet });
    }
    return reply(400, { error: 'Unknown action' });
  } catch (e) {
    console.error('[portal-accounts]', e);
    return reply(500, { error: 'Could not save' });
  }
};
