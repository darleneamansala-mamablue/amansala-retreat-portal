'use strict';
// 10:00 AM Tulum (15:00 UTC, netlify.toml): the Guest Book by email and WhatsApp to the guests arriving in two days (guest-book-lib.js)
const { runGuestBook } = require('./guest-book-lib');
exports.handler = async () => { const r = await runGuestBook(); console.log('[guest-book pre-arrival]', JSON.stringify(r).slice(0, 3000)); return { statusCode: 200, body: JSON.stringify(r) }; };
