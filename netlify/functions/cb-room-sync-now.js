'use strict';

// cb-room-sync-now.js — run the portal → Cloudbeds room sync (cb-room-sync.js) on demand: an admin pass required.
//   POST {token, dryRun: true}  -> what would move, nothing written
//   POST {token}                -> moves them now
//   POST {token, scan: true}    -> runs the copies scan (cb-dup-scan.js) instead
const { staffAllowed, cors, reply } = require('./portal-auth-lib');
const { run } = require('./cb-room-sync');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
  const who = await staffAllowed({ headers: event.headers || {}, body: JSON.stringify({ token: b.token }) }, { admin: true });
  if (!who) return reply(401, { error: 'Sign in as an admin.' });
  try {
    if (b.scan === true) return reply(200, await require('./cb-dup-scan').run());
    return reply(200, await run({ dryRun: b.dryRun === true }));
  }
  catch (e) { console.error('[cb-room-sync-now]', e); return reply(500, { error: 'Could not run the sync' }); }
};
