'use strict';

// menu-whatsapp-now.js — the group meals WhatsApp on demand (scheduled functions answer 403 to a direct call).
// Signed-in admin only. POST {token, date?:'YYYY-MM-DD', dryRun?:true, only?:'+52…'}
//   dryRun: the lines it would send, nothing is sent; only: send just to that phone (a test); neither: send to the whole list.
const { staffAllowed, cors, reply } = require('./portal-auth-lib');
const { runMenuWhatsapp } = require('./menu-whatsapp-lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
  const who = await staffAllowed({ headers: event.headers || {}, body: JSON.stringify({ token: b.token }) });
  if (!who || who.role !== 'admin') return reply(401, { error: 'Admins only' });
  if (b.date && !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return reply(400, { error: 'date as YYYY-MM-DD' });
  try { return reply(200, await runMenuWhatsapp({ date: b.date, dryRun: !!b.dryRun, only: b.only ? String(b.only) : null })); }
  catch (e) { console.error('[menu-whatsapp-now]', e); return reply(500, { error: e.message }); }
};
