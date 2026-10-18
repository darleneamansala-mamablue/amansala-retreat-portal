'use strict';

// Unscheduled wrapper around send-climas-report.js's run() -- Netlify scheduled
// functions return 403 on a direct HTTP call, so this exists purely so staff
// (or this session) can trigger a test send without waiting for the nightly
// 7pm Tulum run. Same pattern as room-price-recalc-now.js.

const { run } = require('./send-climas-report');

exports.handler = async () => {
  const result = await run();
  return result;
};
