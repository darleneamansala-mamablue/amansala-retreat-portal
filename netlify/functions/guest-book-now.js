'use strict';

// guest-book-now.js — the pre-arrival Guest Book message on demand (scheduled functions answer 403 to a direct call).
// Signed-in admin only. POST {token, date?:'YYYY-MM-DD' (arrival date), dryRun?:true, only?:{name, email, phone}}
//   dryRun: who would get it, nothing is sent; only: a test to that email / phone; neither: the real run for that arrival date.
const { staffAllowed, cors, reply } = require('./portal-auth-lib');
const { runGuestBook } = require('./guest-book-lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
  const who = await staffAllowed({ headers: event.headers || {}, body: JSON.stringify({ token: b.token }) });
  if (!who || who.role !== 'admin') return reply(401, { error: 'Admins only' });
  if (b.date && !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return reply(400, { error: 'date as YYYY-MM-DD' });
  try { return reply(200, await runGuestBook({ date: b.date, dryRun: !!b.dryRun, only: b.only && typeof b.only === 'object' ? b.only : null })); }
  catch (e) { console.error('[guest-book-now]', e); return reply(500, { error: e.message }); }
};
