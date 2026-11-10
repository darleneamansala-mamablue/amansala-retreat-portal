'use strict';
// 9:00 PM Tulum (02:00 UTC, netlify.toml): tomorrow's shala classes and activities before 4:00 PM, by WhatsApp (shala-briefing-lib.js)
const { runBriefing } = require('./shala-briefing-lib');
exports.handler = async () => { const r = await runBriefing('AM'); console.log('[shala-briefing am]', JSON.stringify(r)); return { statusCode: 200, body: JSON.stringify(r) }; };
