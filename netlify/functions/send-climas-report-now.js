'use strict';

// Unscheduled wrapper around send-climas-report.js's run() -- Netlify scheduled
// functions return 403 on a direct HTTP call, so this exists purely so staff
// (or this session) can trigger a test send without waiting for the nightly
// 7pm Tulum run. Same pattern as room-price-recalc-now.js.

const { run } = require('./send-climas-report');

exports.handler = async (event) => {
  // admins only (security review 2026-11-10: anyone could fire the A/C list and suppress that day's 7pm run)
  if (!(await require('./portal-auth-lib').portalAllowed(event, { admin: true }))) return { statusCode: 401, body: 'Sign in again' };
  const result = await run();
  return result;
};
