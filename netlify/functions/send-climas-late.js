'use strict';

// Every 30 min from 7:30 to 11:30 pm Tulum (netlify.toml): the rooms checked in after the 7 pm A/C list, sent to the same
// numbers with the same approved template, headed "LLEGADA TARDE" (Jorge 2026-11-07). Nothing is sent when nobody new
// checked in. All the logic is in send-climas-report.js run({ late: true }).
const { run } = require('./send-climas-report');

exports.handler = async () => run({ late: true });
