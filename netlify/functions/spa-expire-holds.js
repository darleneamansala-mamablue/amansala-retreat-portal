'use strict';

// Every 5 minutes: cancels the offsite spa holds Lana / Ask Jorge made that were not paid within 10 minutes (spa-hold-lib.js),
// so the slot is free again on the calendar and for the next guest (Jorge 2026-11-09).
const { expireHolds } = require('./spa-hold-lib');

exports.handler = async () => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return { statusCode: 500, body: 'no key' };
  const cancelled = await expireHolds(key);
  if (cancelled.length) console.log('[spa-expire-holds] cancelled unpaid holds:', cancelled.map(a => `${a.id} ${a.clientName} ${a.date} ${a.start}`).join('; '));
  return { statusCode: 200, body: JSON.stringify({ cancelled: cancelled.length }) };
};
