// An empty Room Only folio is backfilled with its Room charge on open -- but not when the same guest already has that
// room's Room charge on another folio from around those dates (extra night charged on the retreat folio: Amy Reich,
// room 24, $575 twice). Runs the real _bdRoomChargeElsewhere from modules/booking-detail.js. Run: node test/room-charge-backfill.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'booking-detail.js'), 'utf8').split('\n');
const i = src.findIndex(l => l.startsWith('async function _bdRoomChargeElsewhere('));
let j = i; while (src[j] !== '}') j++;
function fakeDb(folios, items) {
  return { from(t) {
    const f = []; const q = {
      select() { return q; }, ilike(c, v) { const re = new RegExp('^' + v.toLowerCase().split('%').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'); f.push(r => re.test(String(r[c]).toLowerCase())); return q; },
      neq(c, v) { f.push(r => r[c] !== v); return q; }, eq(c, v) { f.push(r => r[c] === v); return q; }, in(c, v) { f.push(r => v.includes(r[c])); return q; },
      then(res) { return Promise.resolve({ data: (t === 'folios' ? folios : items).filter(r => f.every(x => x(r))) }).then(res); } };
    return q; } };
}
(async () => {
  const run = (folios, items) => { const ctx = { db: fakeDb(folios, items), DAY_MS: 864e5, pd: s => new Date(s + 'T00:00:00') }; vm.createContext(ctx); vm.runInContext(src.slice(i, j + 1).join('\n'), ctx); return ctx._bdRoomChargeElsewhere; };
  const extra = { id: 'f4', guest_name: 'Amy Reich' };
  const folios = [{ id: 'f3', guest_name: 'amy reich ' }, extra];
  let fn = run(folios, [{ folio_id: 'f3', category: 'Room', description: 'Room charge — 24', created_at: '2026-10-21T17:08:50Z' }]);
  assert.strictEqual(await fn(extra, '24', '2026-10-20'), true, 'already charged on the retreat folio: skip');
  assert.strictEqual(await fn(extra, '25', '2026-10-20'), false, 'other room: backfill');
  fn = run(folios, [{ folio_id: 'f3', category: 'Room', description: 'Room charge — 24', created_at: '2026-03-01T00:00:00Z' }]);
  assert.strictEqual(await fn(extra, '24', '2026-10-20'), false, 'a stay months ago does not count');
  fn = run([extra], []);
  assert.strictEqual(await fn(extra, '24', '2026-10-20'), false, 'no other folio: backfill');
  console.log('room charge backfill: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
