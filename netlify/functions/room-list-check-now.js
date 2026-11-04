'use strict';

// room-list-check-now.js — run the daily room check (room-list-check.js) on demand. Scheduled functions refuse direct
// calls, so this is how an admin sees today's result or fires a test WhatsApp.
//   POST {token}               -> {problems: [...]} without sending
//   POST {token, send: true}   -> also sends the WhatsApp to the numbers in app_store 'room_check_alert'
//   POST {token, send: true, numbers: ['+52...']} -> sends only to those (a test for one person)
const { staffAllowed, cors, reply } = require('./portal-auth-lib');
const { run } = require('./room-list-check');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
  const who = await staffAllowed({ headers: event.headers || {}, body: JSON.stringify({ token: b.token }) }, { admin: true });
  if (!who) return reply(401, { error: 'Sign in as an admin.' });
  try {
    const numbers = Array.isArray(b.numbers) ? b.numbers.map(String).filter(n => /^\+\d{10,15}$/.test(n)) : undefined;
    return reply(200, await run({ send: b.send === true, numbers: numbers && numbers.length ? numbers : undefined }));
  } catch (e) {
    console.error('[room-list-check-now]', e);
    return reply(500, { error: 'Could not run the check' });
  }
};
