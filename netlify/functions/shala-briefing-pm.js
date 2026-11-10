'use strict';
// 1:00 PM Tulum (18:00 UTC, netlify.toml): today's shala classes and activities from 4:00 PM on, by WhatsApp (shala-briefing-lib.js)
const { runBriefing } = require('./shala-briefing-lib');
exports.handler = async () => { const r = await runBriefing('PM'); console.log('[shala-briefing pm]', JSON.stringify(r)); return { statusCode: 200, body: JSON.stringify(r) }; };
