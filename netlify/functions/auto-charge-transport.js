'use strict';

// Runs daily at 05:00 UTC (midnight Tulum, UTC-5) — called twice by pg_cron:
//   type=arrival   → charges tomorrow's arrivals (1 day ahead)
//   type=departure → charges departures 2 days ahead
// Also the "Cargar" button on the Transport screen (?date=&type=).
// If booking has flag "teacher_pays_[arrival|departure]_transport" → charge teacher's folio the total.
// If not → charge each guest individually at the rate for their service group size.
// One charge per GUEST, not per transport row: a guest's duplicate rows (placeholder stub + real form, or two submissions) are
// collapsed exactly as the Transport screen shows them (transport-charge-lib.js). Only adds what is missing: a guest whose folio
// already has their "<Arrival|Departure> Transport <date>" charge is skipped, so a second run (cron + the button, or a retry)
// can never charge twice. Real case 2026-10-21: Departure Transport posted twice, seconds apart, on about ten folios.
// Pass dryRun: true to see what would be charged without writing anything.

const L = require('./transport-charge-lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return { statusCode: 500, body: 'Missing SUPABASE_SERVICE_KEY' };

  // Accept optional date and type override via query param or POST body
  let tomorrow = event.queryStringParameters?.date ?? null;
  let type     = event.queryStringParameters?.type ?? 'arrival';
  let dryRun   = event.queryStringParameters?.dryRun === '1';
  if (event.body) {
    try {
      const b = JSON.parse(event.body);
      if (!tomorrow) tomorrow = b.date ?? null;
      if (b.type)    type     = b.type;
      if (b.dryRun === true) dryRun = true;
    } catch {}
  }
  const isArr = type !== 'departure';
  if (!tomorrow) {
    const now  = new Date();
    const tulu = new Date(now.getTime() + (-5 * 60 - now.getTimezoneOffset()) * 60000);
    tulu.setDate(tulu.getDate() + (isArr ? 1 : 2));  // arrivals: 1 day ahead; departures: 2 days ahead
    tomorrow = tulu.toISOString().slice(0, 10);
  }
  console.log(`[auto-charge-transport] processing ${type}s for ${tomorrow}${dryRun ? ' (dry run)' : ''}`);

  let r;
  try {
    r = await L.runCharges(supaKey, { direction: isArr ? 'arrival' : 'departure', date: tomorrow, mode: 'insertOnly', dryRun });
  } catch (e) {
    console.error('[auto-charge-transport]', e.message);
    return { statusCode: 500, body: e.message };
  }
  const results = { date: tomorrow, type, dryRun, charged: r.charged,
    skipped: r.skipped.concat(r.kept.map(k => ({ ...k, reason: 'already_charged' }))), errors: r.errors };
  console.log('[auto-charge-transport] done:', JSON.stringify(results));
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify(results),
  };
};
