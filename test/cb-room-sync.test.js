// node test/cb-room-sync.test.js -- portal -> Cloudbeds room sync: a linked reservation in another room is moved to the
// portal's room; bed "1b" is not room "1B"; a reservation linked to two rooms, a room the booking no longer holds,
// cancelled bookings and stays outside the 30 days are left alone; dry run writes nothing.
const assert = require('assert');
process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.URL = 'https://site';
const { sameRoom, linkedInWindow } = require('../netlify/functions/cb-room-sync');
assert.ok(sameRoom('GV24', 'GV24') && sameRoom('Gv13a', 'GV13a') && sameRoom('4B -a', '4b -a'));
assert.ok(!sameRoom('1b', '1B') && !sameRoom('19B', '19b') && !sameRoom('CH0', 'GV24'));
const w = linkedInWindow([
  { id: 'K', retreat_name: 'Karsyn Morse', start_date: '2026-11-10', end_date: '2026-11-15', status: 'confirmed', blocked_rooms: ['GV24', 'CH12'], cb_reservation_ids: { GV24: 'a', CH12: 'b', OLD: 'c' } },
  { id: 'D', retreat_name: 'Dup', start_date: '2026-11-10', end_date: '2026-11-12', status: 'confirmed', blocked_rooms: ['1', '2'], cb_reservation_ids: { 1: 'x', 2: 'x' } },
  { id: 'X', retreat_name: 'Cancelled', start_date: '2026-11-10', end_date: '2026-11-12', status: 'cancelled', blocked_rooms: ['5'], cb_reservation_ids: { 5: 'y' } },
  { id: 'L', retreat_name: 'Later', start_date: '2027-03-01', end_date: '2027-03-05', status: 'confirmed', blocked_rooms: ['6'], cb_reservation_ids: { 6: 'z' } },
], '2026-11-04', '2026-12-04');
assert.deepStrictEqual(w.map(x => x.room + ':' + x.id), ['GV24:a', 'CH12:b']);
// end to end with a fake Cloudbeds proxy and database
const cbRooms = { a: ['CH0'], b: ['CH12'] }, moved = [], writes = [];
global.fetch = async (url, opts = {}) => {
  const ok = d => ({ ok: true, status: 200, json: async () => d });
  if (url.includes('/rest/v1/bookings')) return ok(url.includes('offset=0') ? [{ id: 'K', retreat_name: 'Karsyn Morse', start_date: '2026-11-10', end_date: '2026-11-15', status: 'confirmed', blocked_rooms: ['GV24', 'CH12'], cb_reservation_ids: { GV24: 'a', CH12: 'b' } }] : []);
  if (url.includes('/rest/v1/')) { writes.push(url); return ok([]); }
  const action = new URL(url).searchParams.get('action'), b = JSON.parse(opts.body || '{}');
  if (action === 'getReservationRooms') return ok({ reservations: Object.fromEntries(b.reservationIds.map(id => [id, { status: 'confirmed', guest: 'Wendy Klein', endDate: '2099-01-01', rooms: cbRooms[id] }])) });
  if (action === 'moveReservationRoom') { moved.push(b); cbRooms[b.reservationId] = [b.newRoomName]; return ok({ success: true, data: { success: true } }); }
  return ok({});
};
const { run } = require('../netlify/functions/cb-room-sync');
(async () => {
  const dry = await run({ dryRun: true });
  assert.strictEqual(dry.moved.length, 1); assert.strictEqual(moved.length, 0, 'dry run moves nothing'); assert.strictEqual(writes.length, 0, 'dry run writes nothing');
  const r = await run();
  assert.deepStrictEqual(moved, [{ reservationId: 'a', newRoomName: 'GV24' }]); assert.ok(/CH0 → GV24/.test(r.moved[0]));
  assert.ok(writes.some(u => u.includes('app_store')), 'result saved for the 7am message');
  console.log('cb room sync: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
