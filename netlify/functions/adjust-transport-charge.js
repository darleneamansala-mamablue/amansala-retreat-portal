'use strict';

// Re-prices a booking's transport charges for one direction + date with the current groupings.
// Called automatically when admin edits a transport row (time/airport/OT changed) or changes grouping
// (drag-to-share / split) AFTER a charge has already been applied, and by monitor-flights.js.
// Accepts: { rowId, direction, dryRun? } — direction = 'arrival' | 'departure'
//
// The guest's existing charge is EDITED to the new price, not deleted and posted again; a duplicate is removed and only a
// missing one is added (transport-charge-lib.js reconcileCharges). It used to void only the charge linked on the same row and
// post a new "(adjusted)" one, so a charge linked on the guest's other (duplicate) row, or one whose link was lost, stayed on the
// folio next to the new one. Real case 2026-10-22: a regroup at 7:10 PM left a second departure charge on about ten folios.
// Hand-entered charges (e.g. "Departure Cancun airport 6 or + Sharing") are never touched.

const L = require('./transport-charge-lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return { statusCode: 500, body: 'Missing SUPABASE_SERVICE_KEY' };

  let rowId, direction, dryRun;
  try {
    const parsed = event.body ? JSON.parse(event.body) : {};
    rowId     = String(event.queryStringParameters?.rowId     ?? parsed.rowId     ?? '');
    direction = String(event.queryStringParameters?.direction ?? parsed.direction ?? 'arrival');
    dryRun    = parsed.dryRun === true || event.queryStringParameters?.dryRun === '1';
  } catch {
    rowId = ''; direction = 'arrival';
  }
  if (!rowId) return { statusCode: 400, body: JSON.stringify({ error: 'rowId required' }) };
  if (!['arrival', 'departure'].includes(direction)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'direction must be arrival or departure' }) };
  }

  const rowRes = await L.supaFetch(supaKey, `transport?select=id,booking_id,data&id=eq.${encodeURIComponent(rowId)}&limit=1`);
  if (!rowRes.ok) return { statusCode: 500, body: JSON.stringify({ error: 'transport fetch failed', detail: rowRes.data }) };
  const triggerRow = Array.isArray(rowRes.data) ? rowRes.data[0] : null;
  if (!triggerRow) return { statusCode: 404, body: JSON.stringify({ error: 'transport row not found' }) };
  const f = L.fields(direction);
  const date = triggerRow.data?.[f.date];
  if (!date) return { statusCode: 400, body: JSON.stringify({ error: `no ${direction}Date on row` }) };

  let r;
  try {
    r = await L.runCharges(supaKey, { direction, date, mode: 'sync', bookingId: triggerRow.booking_id || null, triggerRowId: rowId, suffix: ' (adjusted)', dryRun });
  } catch (e) {
    console.error('[adjust-transport-charge]', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
  // Same shape the Transport screen reads (voided / recharged), plus the detail
  const recharged = r.charged.concat(r.updated, r.kept.map(k => ({ ...k, unchanged: true })));
  const results = { date, direction, dryRun, voided: r.deleted, recharged, charged: r.charged, updated: r.updated, kept: r.kept, skipped: r.skipped, errors: r.errors };
  console.log('[adjust-transport-charge] done:', JSON.stringify(results));
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify(results),
  };
};
