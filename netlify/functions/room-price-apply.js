'use strict';
// Pushes approved prices into `be_rates` -- the exact table netlify/functions/get-rates.js
// already reads for the live Escape booking engine, so a row written here is live on the
// public booking page on its very next price lookup. This is the only place in the Revenue
// Manager that writes a real, guest-facing price; everything else (settings, nightly recalc)
// only produces a SUGGESTION until a human calls this endpoint (mirrors RoomPriceGenie's own
// "Upload Prices" button in Jorge's screenshots).
//
// One row per room_type_id+date (start_date=end_date=date) -- simplest shape that matches how
// get-rates.js looks a date up, and lets each day carry its own occupancy-driven price instead
// of forcing a whole date range to share one number.
const L = require('./room-price-lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return jsonErr(400, 'Invalid JSON'); }
  const changes = Array.isArray(body.changes) ? body.changes : [];
  const staffName = String(body.staffName || 'unknown').slice(0, 80);
  if (!changes.length) return jsonErr(400, 'Missing changes');
  for (const c of changes) {
    if (!c.room_type_id || !c.date || c.price_single == null) return jsonErr(400, 'Each change needs room_type_id, date, price_single');
  }

  try {
    const r = await L.applyPriceChanges(key, changes, staffName);
    return ok({ success: true, applied: r.applied });
  } catch (err) {
    return jsonErr(500, err.message);
  }
};

function ok(data) { return { statusCode: 200, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(data) }; }
function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) }; }
