'use strict';

// staff-accounts.js — Manage Staff (admin-staff.js) saves the `staff` table through here, as an admin (staff-login pass,
// role admin), 2026-11-02. The screen used to upsert the table from the browser with the password hash; since the
// 2026-10-02 fix that hid password_hash from the browser, the database refused that upsert ("permission denied"), so
// new or edited accounts were not saved; and Delete only removed the person from the screen, never from the table.
//   {token, action:'save', id?, name, username, role, password?}   creates (password required) or updates
//   {token, action:'setActive', id, active}
//   {token, action:'delete', id}
const crypto = require('crypto');
const { staffFromEvent, revokeSessions } = require('./portal-auth-lib');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const reply = (code, data) => ({ statusCode: code, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Portal-Token', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
// staff-login.js compares the SHA-256 hex of the password with staff.password_hash
const sha256 = s => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  const who = staffFromEvent(event, { admin: true });
  if (!who) return reply(401, { error: 'Sign out and sign in again as an admin to manage staff.' });
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
  try {
    const id = String(b.id || '').slice(0, 80);
    if (b.action === 'save') {
      const name = String(b.name || '').trim().slice(0, 80), username = String(b.username || '').trim().toLowerCase().slice(0, 60);
      const role = ['admin', 'staff'].includes(b.role) ? b.role : 'staff', password = String(b.password || '');
      if (!name || !username) return reply(400, { error: 'Please enter a name and a username.' });
      if (!id && password.length < 6) return reply(400, { error: 'Use a password of at least 6 characters.' });
      if (password && password.length < 6) return reply(400, { error: 'Use a password of at least 6 characters.' });
      const dup = await (await fetch(`${SUPABASE_URL}/rest/v1/staff?username=eq.${encodeURIComponent(username)}&select=id`, { headers: h })).json();
      if ((dup || []).some(r => r.id !== id)) return reply(409, { error: 'That username is already in use.' });
      const row = { name, username, role, ...(password ? { password_hash: sha256(password) } : {}) };
      if (id) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/staff?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify(row) });
        const done = r.ok ? await r.json() : [];
        // a new password signs this person out everywhere (open pages within minutes)
        if (done.length) { if (password) await revokeSessions(key, 'staff', id); return reply(200, { ok: true, id, signedOut: !!password }); }
        if (!password) return reply(400, { error: 'This account is not in the staff list yet — set a password to add it.' });
      }
      const newId = id || ('stf_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'));
      const r = await fetch(`${SUPABASE_URL}/rest/v1/staff`, { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ id: newId, ...row, active: true }) });
      if (!r.ok) throw new Error('insert ' + r.status + ' ' + (await r.text()).slice(0, 160));
      return reply(200, { ok: true, id: newId });
    }
    if (!id) return reply(400, { error: 'Missing account' });
    if (b.action === 'setActive') {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/staff?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ active: !!b.active }) });
      if (r.ok && !b.active) await revokeSessions(key, 'staff', id);   // switched off: out everywhere
      return reply(r.ok ? 200 : 500, { ok: r.ok });
    }
    if (b.action === 'delete') {
      if (String(who.sub) === id) return reply(400, { error: "You can't delete your own account." });
      const r = await fetch(`${SUPABASE_URL}/rest/v1/staff?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { ...h, Prefer: 'return=minimal' } });
      if (r.ok) await revokeSessions(key, 'staff', id);   // removed: out everywhere
      return reply(r.ok ? 200 : 500, { ok: r.ok });
    }
    return reply(400, { error: 'Unknown action' });
  } catch (e) {
    console.error('[staff-accounts]', e);
    return reply(500, { error: 'Could not save the account' });
  }
};
