'use strict';
// guest-stay-kind.js: Extra Night only for a group retreat guest near those dates; a Room Only guest extends at the Escape rate
const assert = require('assert');
const db = {
  bookings: [{ id: 'r1', booking_type: 'retreat', start_date: '2026-11-01', end_date: '2026-11-06' }, { id: 'o1', booking_type: 'room_only', start_date: '2026-11-04', end_date: '2026-11-05' }],
  registrations: [{ booking_id: 'r1', guests: [{ name: 'Ana', phone: '+1 555 000 1111' }] }, { booking_id: 'o1', guests: [{ name: 'Mel', phone: '+16029094310' }] }],
  booking_requests: [{ phone: '5219840000000' }],
};
global.fetch = async url => { const t = new URL(url).pathname.split('/').pop(); return { ok: true, json: async () => db[t] }; };
const { stayKindForPhone, phoneOf } = require('../netlify/functions/guest-stay-kind');
(async () => {
  assert.strictEqual(phoneOf({ meta: { conversationKey: 'amansala-2:whatsapp:16029094310:x' } }), '16029094310');
  assert.strictEqual(await stayKindForPhone('k', '15550001111', '2026-11-06', '2026-11-07'), 'extra_night');   // right after her retreat
  assert.strictEqual(await stayKindForPhone('k', '16029094310', '2026-11-05', '2026-11-06'), 'escape');        // Room Only guest
  assert.strictEqual(await stayKindForPhone('k', '15550001111', '2026-12-20', '2026-12-21'), 'escape');        // far from the retreat
  assert.strictEqual(await stayKindForPhone('k', '9840000000', '2026-11-05', '2026-11-06'), 'escape');         // booking engine guest
  assert.strictEqual(await stayKindForPhone('k', '19999999999', '2026-11-05', '2026-11-06'), null);            // unknown number
  console.log('guest-stay-kind: ok');
})().catch(e => { console.error(e); process.exit(1); });
