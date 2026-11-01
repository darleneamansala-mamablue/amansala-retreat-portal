// node test/checkout-links.test.js -- check-out pay links (dry run): a split stay's guest gets the link of the folio on the
// stay's FIRST segment (where every charge is), as a whole-bill link (?all=1); an ordinary guest gets their own.
const assert = require('assert');
process.env.SUPABASE_SERVICE_KEY = 'k';
const tomorrow = (() => { const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Cancun' })); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
const day = n => { const d = new Date(tomorrow + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const bookings = [{ id: 'B1', start_date: day(-6), end_date: tomorrow, blocked_rooms: ['10', '12', '20'] }];
const regs = [
  { id: 'S1', booking_id: 'B1', room: '10', cancelled: false, check_in: null, check_out: day(-3), guests: [{ name: 'Ana', phone: '+525511111111' }] },   // first half
  { id: 'S2', booking_id: 'B1', room: '12', cancelled: false, check_in: day(-3), check_out: null, guests: [{ name: 'Ana', phone: '+525511111111' }] },  // moved rooms
  { id: 'O1', booking_id: 'B1', room: '20', cancelled: false, check_in: null, check_out: null, guests: [{ name: 'Bea', phone: '+525522222222' }] },
];
const folios = [{ id: 'FA', registration_id: 'S1', guest_name: 'Ana', payment_token: 'TOK_ANA', created_at: '1' }, { id: 'FB', registration_id: 'O1', guest_name: 'Bea', payment_token: 'TOK_BEA', created_at: '1' }];
const json = d => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) });
let created = 0;
global.fetch = async (url, opts = {}) => {
  const u = new URL(url), p = u.searchParams;
  if (u.pathname.endsWith('/app_store')) return json([{ value: { notifications: { checkoutLinksEnabled: false } } }]);
  if (u.pathname.endsWith('/booking_requests')) return json([]);
  if (u.pathname.endsWith('/bookings')) return json(bookings);
  if (u.pathname.endsWith('/registrations')) return json(regs);
  if (u.pathname.endsWith('/folios')) { if (opts.method === 'POST') { created++; return json([{}]); } const id = (p.get('registration_id') || '').slice(3); return json(folios.filter(f => f.registration_id === id)); }
  return json([]);
};
const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(' '));
require('../netlify/functions/send-checkout-payment-links').handler().then(() => {
  console.log = orig;
  const sent = logs.filter(l => l.includes('would send'));
  assert.ok(sent.some(l => l.includes('Ana') && l.includes('token=TOK_ANA&all=1')), 'split-stay guest gets the first-segment folio, whole bill: ' + sent.join(' | '));
  assert.ok(sent.some(l => l.includes('Bea') && l.includes('token=TOK_BEA&all=1')), 'ordinary guest unchanged');
  assert.strictEqual(sent.length, 2); assert.strictEqual(created, 0, 'no empty folio created for the departing segment');
  console.log('checkout-links: all passed');
}).catch(e => { console.log = orig; console.error('FAIL', e.message); process.exit(1); });
