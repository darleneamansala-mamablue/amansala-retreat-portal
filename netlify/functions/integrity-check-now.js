'use strict';

// Runs the morning data check (integrity-check.js) on demand for an admin, without sending the WhatsApp: POST {token}.
const { staffAllowed, cors, reply } = require('./portal-auth-lib');
const { check } = require('./integrity-check');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  const who = await staffAllowed({ headers: event.headers || {}, body: JSON.stringify({ token: b.token }) }, { admin: true });
  if (!who) return reply(401, { error: 'Admins only' });
  const r = await check({ dry: true });
  return { ...r, headers: { ...cors(), 'Content-Type': 'application/json' } };
};
