'use strict';
// On-demand trigger for the Revenue Manager recompute. room-price-recalc.js has a `schedule`
// in netlify.toml, and Netlify blocks direct public GET/POST requests to any scheduled
// function with a 403 (confirmed live 2026-10-17 against rb-charge-balances.js and
// send-climas-report.js too -- this is a Netlify platform rule, not specific to this
// function). revenue-manager.html's "Refresh recommendations" button calls THIS plain,
// unscheduled function instead, which just runs the exact same logic on demand.
const { runRecalc } = require('./room-price-recalc');

exports.handler = async () => {
  try {
    const r = await runRecalc();
    return { statusCode: 200, headers: cors(), body: JSON.stringify(r) };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' }; }
