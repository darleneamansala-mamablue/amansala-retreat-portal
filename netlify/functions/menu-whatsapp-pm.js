'use strict';
// 9:00 PM Tulum (02:00 UTC, netlify.toml): tomorrow's group meals to the restaurant and kitchen team by WhatsApp (menu-whatsapp-lib.js)
const { runMenuWhatsapp } = require('./menu-whatsapp-lib');
exports.handler = async () => { const r = await runMenuWhatsapp(); console.log('[menu-whatsapp pm]', JSON.stringify(r)); return { statusCode: 200, body: JSON.stringify(r) }; };
