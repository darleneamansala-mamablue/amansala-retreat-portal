'use strict';
// transport-charge-late.js — the Transport screen calls this right after it creates a ride: when the nightly charge run has
// already gone over that date, the ride is charged now (transport-charge-lib.js chargeIfLate). Signed-in portal users only.
//   POST {rowId}
const { portalAllowed } = require('./portal-auth-lib');
const { chargeIfLate } = require('./transport-charge-lib');
const reply = (code, data) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  if (!(await portalAllowed(event))) return reply(401, { error: 'Sign in again' });
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
  if (!b.rowId) return reply(400, { error: 'rowId required' });
  return reply(200, { results: await chargeIfLate(process.env.SUPABASE_SERVICE_KEY, String(b.rowId)) });
};
