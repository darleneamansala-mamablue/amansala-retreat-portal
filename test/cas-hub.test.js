// Node harness for the CAS wiring inside booking-hub.html (load gate, reload keeping unsaved rows, Restore backup).
// Runs the REAL code: the block from the rollout switch through loadFromSupabase(), plus saveAll(), cut out of the page and
// evaluated in a vm sandbox against an in-memory fake Supabase whose rows get a new updated_at on every write (like the DB
// trigger). Run with: node test/cas-hub.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'booking-hub.html'), 'utf8');
const lines = html.split('\n');
const at = re => { const i = lines.findIndex(l => re.test(l)); if (i < 0) throw new Error('not found: ' + re); return i; };
const endOf = start => { for (let i = start + 1; i < lines.length; i++) if (lines[i] === '}') return i; throw new Error('no end'); };
const syncStart = at(/^let _casRemoteMode=/), loadStart = at(/^async function loadFromSupabase\(\)/);
const saveStart = at(/^let _saveAllBusy=/), saveEnd = endOf(at(/^function saveAll\(\)/));
const HUB = lines.slice(at(/^if\(location\.search\.includes\('cas=0'\)\)/), endOf(loadStart) + 1).join('\n') + '\n' + lines.slice(saveStart, saveEnd + 1).join('\n');
const ENGINE = fs.readFileSync(path.join(__dirname, '..', 'modules', 'cas-sync.js'), 'utf8');

let clock = Date.parse('2026-11-01T12:00:00Z');
const stamp = () => new Date(clock += 1000).toISOString().replace('Z', '123+00:00');
function fakeDb(seed) {
  const T = { bookings: new Map(), registrations: new Map(), payments: new Map(), app_store: new Map(), room_types: new Map() };
  for (const t in seed) seed[t].forEach(r => T[t].set(r.id ?? r.key, { ...r }));
  const log = [];
  function from(table) {
    const m = T[table] || (T[table] = new Map());
    const st = { op: 'select', filters: [], payload: null };
    const keyOf = r => r.id ?? r.key;
    const match = r => st.filters.every(f => f(r));
    const exec = () => {
      const rows = [...m.values()].filter(match);
      if (st.op === 'select') return { data: rows.map(r => ({ ...r })), error: null };
      if (st.op === 'update') { const out = rows.map(r => { const n = { ...r, ...JSON.parse(JSON.stringify(st.payload)), updated_at: stamp() }; m.set(keyOf(r), n); return { ...n }; }); log.push({ table, op: 'update', ids: out.map(keyOf), payload: st.payload }); return { data: out, error: null }; }
      if (st.op === 'insert' || st.op === 'upsert') { const list = [].concat(st.payload).map(r => JSON.parse(JSON.stringify(r))); const out = list.map(r => { const n = { ...(m.get(keyOf(r)) || {}), ...r, updated_at: stamp() }; m.set(keyOf(n), n); return { ...n }; }); log.push({ table, op: st.op, ids: out.map(keyOf) }); return { data: out, error: null }; }
      if (st.op === 'delete') { rows.forEach(r => m.delete(keyOf(r))); log.push({ table, op: 'delete', ids: rows.map(keyOf) }); return { data: null, error: null }; }
    };
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; },
      range(a, z) { const r = exec(); r.data = r.data.sort((x, y) => String(keyOf(x)).localeCompare(String(keyOf(y)))).slice(a, z + 1); return Promise.resolve(r); },
      eq(c, v) { st.filters.push(r => String(r[c]) === String(v)); return b; },
      in(c, vs) { st.filters.push(r => vs.includes(r[c])); return b; },
      not(c, op, v) { const re = new RegExp('^' + v.replace(/%/g, '.*') + '$'); st.filters.push(r => !re.test(r[c])); return b; },
      like(c, v) { const re = new RegExp('^' + v.replace(/%/g, '.*') + '$'); st.filters.push(r => re.test(r[c])); return b; },
      gte() { return b; },
      update(p) { st.op = 'update'; st.payload = p; return b; },
      insert(p) { st.op = 'insert'; st.payload = p; return b; },
      upsert(p) { st.op = 'upsert'; st.payload = p; return b; },
      delete() { st.op = 'delete'; return b; },
      maybeSingle() { const r = exec(); return Promise.resolve({ data: r.data[0] || null, error: null }); },
      single() { return b.maybeSingle(); },
      then(res, rej) { return Promise.resolve(exec()).then(res, rej); },
    };
    return b;
  }
  return { from, T, log };
}

function makeTab(db, localStore) {
  const ls = new Map(Object.entries(localStore || {}));
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, setInterval() {}, Promise, JSON, Date, Math, Map, Set, Array, Object, String, Number, RegExp, Error,
    location: { protocol: 'https:', search: '', pathname: '/booking-hub.html' }, navigator: { userAgent: 'test' },
    localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
    db, toasts: [],
    PORTAL_SETTINGS_DEFAULTS: { transportRates: {}, notifications: {}, contractDeadlines: {} }, DEF_ROOM_TYPES: [], RT_VERSION: 1, VEN_ROWS_VERSION: 1, venYear: 2026,
  };
  ctx.showToast = m => ctx.toasts.push(m);
  vm.createContext(ctx);
  vm.runInContext(ENGINE + '\nconst AppData={bookings:[],venRows:[],roomTypes:[],regs:[],teacherMessages:[],programBlocks:[],specialEvents:[]};\n' +
    'let deletedBookingIds=new Set(),deletedRegIds=new Set(),deletedPaymentIds=new Set(),regSelBk=null,_lastLocalSaveAt=0,_appStoreUpdatedAt={},PortalSettings={};\n' +
    HUB + '\nthis.T={db,casAfterFetch,casAfterPartialFetch,get AppData(){return AppData},saveAll,loadFromSupabase,syncToSupabase,get ready(){return _casBaseReady},set ready(v){_casBaseReady=v},sqlBookingToApp,sqlRegToApp,get busy(){return _saveAllBusy}};', ctx);
  return ctx.T;
}
const flush = async t => { await t.busy; await new Promise(r => setTimeout(r, 5)); await t.busy; };
const bk = (id, extra) => ({ id, leader_name: 'L ' + id, notes: 'server', status: 'confirmed', retreat_activities: null, updated_at: '2026-11-01T00:00:00.000+00:00', ...extra });
const casOn = { key: 'cas_sync', value: { mode: 'on2' } };

let passed = 0, failed = 0;
async function run(name, fn) { try { await fn(); console.log('ok   -', name); passed++; } catch (e) { console.error('FAIL -', name, '\n     ', e.stack.split('\n').slice(0, 3).join('\n      ')); failed++; } }

// 1. A save before the first load (memory = this browser's old localStorage copy) must not write the old copy over the
//    server -- it takes the old guarded path, which skips rows older than the server's.
async function test_saveBeforeLoadDoesNotOverwrite() {
  const db = fakeDb({ bookings: [bk('b1', { notes: 'NEW from Darlene', updated_at: '2026-11-01T10:00:00.000+00:00' })], app_store: [casOn] });
  const t = makeTab(db);
  t.AppData.bookings = [{ id: 'b1', leaderName: 'L b1', notes: 'OLD from 3 weeks ago', status: 'confirmed', updatedAt: '2026-10-10T00:00:00.000Z' }];
  t.saveAll(); await flush(t);
  assert.strictEqual(t.ready, false);
  assert.strictEqual(db.T.bookings.get('b1').notes, 'NEW from Darlene');
}

// 2. Same, when the first load failed (app_store error): the gate stays closed for the whole session
async function test_failedLoadKeepsGateClosed() {
  const db = fakeDb({ bookings: [bk('b1', { notes: 'NEW', updated_at: '2026-11-01T10:00:00.000+00:00' })], app_store: [casOn] });
  const t = makeTab(db);
  const orig = db.from; db.from = tb => (tb === 'app_store' ? { select: () => ({ not: async () => ({ data: null, error: { message: 'statement timeout' } }), in: async () => ({ data: [casOn] }) }) } : orig(tb));
  assert.strictEqual(await t.loadFromSupabase(), false);
  t.AppData.bookings = [{ id: 'b1', notes: 'OLD', updatedAt: '2026-10-10T00:00:00.000Z' }];
  t.saveAll(); await flush(t);
  assert.strictEqual(t.ready, false);
  assert.strictEqual(db.T.bookings.get('b1').notes, 'NEW');
}

// 3. After a good load the gate opens and an edit saves through CAS (conditional update)
async function test_afterLoadCasSaves() {
  const db = fakeDb({ bookings: [bk('b1')], app_store: [casOn] });
  const t = makeTab(db);
  assert.strictEqual(await t.loadFromSupabase(), true);
  assert.strictEqual(t.ready, true);
  t.AppData.bookings[0].notes = 'edited';
  t.saveAll(); await flush(t);
  assert.strictEqual(db.T.bookings.get('b1').notes, 'edited');
  assert.ok(db.log.some(l => l.table === 'bookings' && l.op === 'update'), 'went through CAS update, not bulk upsert');
  assert.ok(!db.log.some(l => l.table === 'bookings' && l.op === 'upsert'));
}

// 4. A reload keeps a row whose save failed / is still pending, instead of silently replacing it with the server copy
async function test_reloadKeepsUnsavedRow() {
  const db = fakeDb({ bookings: [bk('b1'), bk('b2')], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  t.AppData.bookings.find(b => b.id === 'b1').notes = 'not saved yet';
  db.T.bookings.set('b2', { ...db.T.bookings.get('b2'), notes: 'changed elsewhere', updated_at: stamp() });
  await t.loadFromSupabase();
  assert.strictEqual(t.AppData.bookings.find(b => b.id === 'b1').notes, 'not saved yet', 'pending edit survives the reload');
  assert.strictEqual(t.AppData.bookings.find(b => b.id === 'b2').notes, 'changed elsewhere', 'other rows refresh normally');
  t.saveAll(); await flush(t);
  assert.strictEqual(db.T.bookings.get('b1').notes, 'not saved yet', 'and is saved by the next save');
}

// 5. Edit kept across a reload, while someone else changed ANOTHER field of the same booking: both survive
async function test_reloadKeptRowMergesWithOtherChange() {
  const db = fakeDb({ bookings: [bk('b1')], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  t.AppData.bookings[0].notes = 'mine';
  db.T.bookings.set('b1', { ...db.T.bookings.get('b1'), status: 'cancelled', updated_at: stamp() });
  await t.loadFromSupabase();
  t.saveAll(); await flush(t);
  assert.strictEqual(db.T.bookings.get('b1').notes, 'mine');
  assert.strictEqual(db.T.bookings.get('b1').status, 'cancelled');
}

// 6. A load waits for saves already queued, so it never reads the server before this tab's own save lands
async function test_loadWaitsForQueuedSave() {
  const db = fakeDb({ bookings: [bk('b1')], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  t.AppData.bookings[0].notes = 'just typed';
  t.saveAll();
  await t.loadFromSupabase();
  assert.strictEqual(t.AppData.bookings[0].notes, 'just typed');
  assert.strictEqual(db.T.bookings.get('b1').notes, 'just typed');
}

// 7. Restore from backup does not go through CAS (it would write the whole backup over today's data); same as before:
//    backup rows older than the server are skipped
async function test_restoreBackupDoesNotMassOverwrite() {
  const db = fakeDb({ bookings: [bk('b1', { notes: 'today', updated_at: '2026-11-01T10:00:00.000+00:00' })], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  // what importData() does
  t.AppData.bookings = [{ id: 'b1', notes: 'from backup', updatedAt: '2026-09-01T00:00:00.000Z' }];
  t.ready = false;
  t.saveAll(); await flush(t);
  assert.strictEqual(db.T.bookings.get('b1').notes, 'today');
}

// 8. A new booking created after load is inserted; a reload before it is saved does not drop it
async function test_newRowSurvivesReload() {
  const db = fakeDb({ bookings: [bk('b1')], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  const id = 'id_' + Date.now() + '_new1';
  t.AppData.bookings.push({ id, leaderName: 'New', notes: 'x', status: 'requested' });
  await t.loadFromSupabase();
  assert.ok(t.AppData.bookings.some(b => b.id === id), 'still in memory after reload');
  t.saveAll(); await flush(t);
  assert.ok(db.T.bookings.has(id), 'inserted');
}

// 9. With the switch off, nothing above changes: old path, no gate effect
async function test_switchOffUsesOldPath() {
  const db = fakeDb({ bookings: [bk('b1')], app_store: [{ key: 'cas_sync', value: { mode: 'off' } }] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  t.AppData.bookings[0].notes = 'edited'; t.AppData.bookings[0].updatedAt = new Date(clock + 60000).toISOString();
  t.saveAll(); await flush(t);
  assert.ok(db.log.some(l => l.table === 'bookings' && l.op === 'upsert'), 'old bulk upsert');
  assert.strictEqual(db.T.bookings.get('b1').notes, 'edited');
}

// 10. A same-field conflict is written to the Sync Log
async function test_conflictLogged() {
  const db = fakeDb({ bookings: [bk('b1')], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  t.AppData.bookings[0].notes = 'mine';
  db.T.bookings.set('b1', { ...db.T.bookings.get('b1'), notes: 'theirs', updated_at: stamp() });
  t.saveAll(); await flush(t); await new Promise(r => setTimeout(r, 10));
  const logs = [...db.T.app_store.keys()].filter(k => k.startsWith('cas_log:')).map(k => db.T.app_store.get(k).value);
  assert.ok(logs.some(v => v.kind === 'conflict' && v.items[0].reason === 'notes'), 'conflict on notes logged');
}

// ---- Step 2: direct writes and Block Rooms --------------------------------------------------------------------------
// 11. Two people change different settings of the same retreat (both live in package_custom_prices) through a screen that
//     writes the column straight to SQL. With the safety net the direct write is left to CAS, which joins both.
async function test_directWriteJoinedNotOverwritten() {
  const db = fakeDb({ bookings: [bk('b1', { package_custom_prices: { __cfg__: { taxRate: 16, hideRoomNumbers: false } } })], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  // someone else sets tax rate 0 meanwhile
  const cur = db.T.bookings.get('b1');
  db.T.bookings.set('b1', { ...cur, package_custom_prices: { __cfg__: { taxRate: 0, hideRoomNumbers: false } }, updated_at: stamp() });
  // this tab toggles hide room numbers the way toggleHideRoomNumbers() does: memory, saveAll, then a direct write
  const b = t.AppData.bookings[0];
  b.packageCustomPrices = { __cfg__: { taxRate: 16, hideRoomNumbers: true } };
  t.saveAll();
  const r = await t.db.from('bookings').update({ package_custom_prices: b.packageCustomPrices }).eq('id', 'b1');
  assert.strictEqual(r.error, null);
  await flush(t);
  assert.deepStrictEqual(db.T.bookings.get('b1').package_custom_prices, { __cfg__: { taxRate: 0, hideRoomNumbers: true } });
}
// 12. A direct write whose value is not in memory goes to SQL as before, and the baseline learns it: a check-in written
//     directly and then undone on another device is not re-applied by this tab's next save
async function test_directWriteNotInMemoryPatchesBase() {
  const db = fakeDb({ registrations: [{ id: 'g1', booking_id: 'b1', room: '10', checked_in_at: null, notes: 'n', updated_at: '2026-11-01T00:00:00.000+00:00' }], bookings: [bk('b1')], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  await t.db.from('registrations').update({ checked_in_at: '2026-11-01T15:00:00Z' }).eq('id', 'g1');
  assert.strictEqual(db.T.registrations.get('g1').checked_in_at, '2026-11-01T15:00:00Z', 'written directly');
  t.AppData.regs[0].checkedInAt = '2026-11-01T15:00:00Z';     // the screen mirrors it in memory after the write
  db.T.registrations.set('g1', { ...db.T.registrations.get('g1'), checked_in_at: null, updated_at: stamp() });  // undone elsewhere
  t.AppData.regs[0].notes = 'later';
  t.saveAll(); await flush(t);
  assert.strictEqual(db.T.registrations.get('g1').checked_in_at, null, 'the undo stands');
  assert.strictEqual(db.T.registrations.get('g1').notes, 'later');
}
// 13. Switch off: direct writes behave exactly as before
async function test_directWriteSwitchOff() {
  const db = fakeDb({ bookings: [bk('b1')], app_store: [{ key: 'cas_sync', value: { mode: 'off' } }] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  t.AppData.bookings[0].notes = 'x';
  await t.db.from('bookings').update({ notes: 'x' }).eq('id', 'b1');
  assert.ok(db.log.some(l => l.table === 'bookings' && l.op === 'update' && l.payload.notes === 'x'), 'written directly');
}
// 14. Block Rooms re-fetch: what it brought in is not taken for this tab's own edit
async function test_blockRoomsRefetchRebased() {
  const db = fakeDb({ registrations: [{ id: 'g1', booking_id: 'b1', room: '10', guests: [{ name: 'Ana' }], updated_at: '2026-11-01T00:00:00.000+00:00' }], bookings: [bk('b1', { blocked_rooms: ['10'] })], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  // another tab edits guests and rooms
  db.T.registrations.set('g1', { ...db.T.registrations.get('g1'), guests: [{ name: 'Ana Lopez' }], updated_at: stamp() });
  db.T.bookings.set('b1', { ...db.T.bookings.get('b1'), blocked_rooms: ['10', '11'], updated_at: stamp() });
  // this tab opens Block Rooms: fresh fetch put in memory (as openBlockModal does)
  const freshRegs = [{ ...db.T.registrations.get('g1') }], freshBk = { blocked_rooms: ['10', '11'] };
  t.AppData.regs.splice(0, t.AppData.regs.length, ...freshRegs.map(t.sqlRegToApp));
  t.AppData.bookings[0].blockedRooms = freshBk.blocked_rooms;
  t.casAfterFetch('registrations', freshRegs); t.casAfterPartialFetch('bookings', 'b1', freshBk);
  // the other tab changes them again
  db.T.registrations.set('g1', { ...db.T.registrations.get('g1'), guests: [{ name: 'Ana López' }], updated_at: stamp() });
  db.T.bookings.set('b1', { ...db.T.bookings.get('b1'), blocked_rooms: ['10', '11', '12'], updated_at: stamp() });
  // this tab saves something unrelated
  t.AppData.bookings[0].notes = 'unrelated';
  t.saveAll(); await flush(t);
  assert.deepStrictEqual(db.T.registrations.get('g1').guests, [{ name: 'Ana López' }], 'guests not reverted');
  assert.deepStrictEqual(db.T.bookings.get('b1').blocked_rooms, ['10', '11', '12'], 'rooms not reverted');
  assert.strictEqual(db.T.bookings.get('b1').notes, 'unrelated');
}
// 15. Activities: staff adds one in this tab while another tab adds a different one -- both kept
async function test_activitiesBothKeptThroughPage() {
  const db = fakeDb({ bookings: [bk('b1', { retreat_activities: [{ aoId: 'ao1', date: '2027-01-02', time: '10:00', prepaid: false }] })], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  const cur = db.T.bookings.get('b1');
  db.T.bookings.set('b1', { ...cur, retreat_activities: [...cur.retreat_activities, { aoId: 'ao2', date: '2027-01-03', time: '11:45', prepaid: true }], updated_at: stamp() });
  t.AppData.bookings[0].retreatActivities.push({ aoId: 'ao21', date: '2027-01-02', time: '20:00', prepaid: false });
  t.saveAll(); await flush(t);
  assert.deepStrictEqual(db.T.bookings.get('b1').retreat_activities.map(a => a.aoId).sort(), ['ao1', 'ao2', 'ao21']);
}

// 16. The switch written by older code ('on') still turns it on for the new code
async function test_legacyOn() {
  const db = fakeDb({ bookings: [bk('b1')], app_store: [{ key: 'cas_sync', value: { mode: 'on' } }] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  t.AppData.bookings[0].notes = 'edited';
  t.saveAll(); await flush(t);
  assert.ok(db.log.some(l => l.table === 'bookings' && l.op === 'update'));
}

// ---- Payments ---------------------------------------------------------------------------------------------------------
const pay = (id, bkId, amount, extra) => ({ id, booking_id: bkId, amount, date: '2026-11-01', method: 'stripe', ref: '', note: '', staff_name: 'S', created_at: '2026-11-01T00:00:00.000Z', ...extra });
// 17. A payment edited on another computer is not put back to the old amount by a tab opened earlier
async function test_paymentEditNotReverted() {
  const db = fakeDb({ bookings: [bk('b1')], payments: [pay('p1', 'b1', 1000)], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  db.T.payments.set('p1', { ...db.T.payments.get('p1'), amount: 1200 });       // corrected elsewhere
  t.AppData.bookings[0].notes = 'unrelated'; t.saveAll(); await flush(t);
  assert.strictEqual(db.T.payments.get('p1').amount, 1200);
}
// 18. A payment deleted on another computer does not come back from a tab that still has it
async function test_deletedPaymentNotResurrected() {
  const db = fakeDb({ bookings: [bk('b1')], payments: [pay('p1', 'b1', 1000), pay('p2', 'b1', 500)], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  db.T.payments.delete('p2');                                                    // deleted elsewhere
  db.T.app_store.set('deletedPaymentIds', { key: 'deletedPaymentIds', value: ['p2'] });
  t.AppData.bookings[0].notes = 'unrelated'; t.saveAll(); await flush(t);
  assert.ok(!db.T.payments.has('p2'), 'not re-created');
  assert.deepStrictEqual(db.T.app_store.get('deletedPaymentIds').value, ['p2'], 'and the deleted list keeps it');
}
// 19. A payment recorded here is saved; an edit here is saved; a delete here is saved and listed
async function test_paymentAddEditDelete() {
  const db = fakeDb({ bookings: [bk('b1')], payments: [pay('p1', 'b1', 1000)], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  const b = t.AppData.bookings[0];
  b.payments.push({ id: 'id_' + Date.now() + '_pnew', amount: 300, date: '2026-11-01', method: 'cash', ref: '', note: '', ts: '2026-11-01T01:00:00.000Z' });
  b.payments[0].amount = 1100;
  t.saveAll(); await flush(t);
  assert.strictEqual(db.T.payments.get('p1').amount, 1100);
  assert.ok([...db.T.payments.keys()].some(k => k.endsWith('_pnew')));
  const before = db.log.filter(l => l.table === 'payments' && l.op === 'upsert').length;
  t.saveAll(); await flush(t);
  assert.strictEqual(db.log.filter(l => l.table === 'payments' && l.op === 'upsert').length, before, 'nothing re-sent when nothing changed');
}
// 20. Deleted lists from two computers are joined, not overwritten
async function test_tombstonesJoined() {
  const db = fakeDb({ bookings: [bk('b1')], app_store: [casOn, { key: 'deletedPaymentIds', value: ['pX'] }] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  db.T.app_store.set('deletedPaymentIds', { key: 'deletedPaymentIds', value: ['pX', 'pY'] });   // other computer deletes pY
  t.saveAll(); await flush(t);
  assert.deepStrictEqual([...db.T.app_store.get('deletedPaymentIds').value].sort(), ['pX', 'pY']);
}
// 21. A payment recorded here survives a reload that happens before it is saved
async function test_pendingPaymentSurvivesReload() {
  const db = fakeDb({ bookings: [bk('b1')], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  t.AppData.bookings[0].payments.push({ id: 'id_' + Date.now() + '_pq', amount: 70, date: '2026-11-01', method: 'cash', ts: '2026-11-01T01:00:00.000Z' });
  await t.loadFromSupabase();
  assert.ok(t.AppData.bookings[0].payments.some(p => p.id.endsWith('_pq')));
}

// ---- Cloudbeds answers arriving after a reload ------------------------------------------------------------------------
// 22. A screen holds a booking, asks Cloudbeds, the page reloads meanwhile (2-minute refresh), then the answer arrives and
//     the new reservation id is written on the held booking: it must be saved (before: written on a detached copy, lost)
async function test_cloudbedsAnswerAfterReloadIsSaved() {
  const db = fakeDb({ bookings: [bk('b1', { cb_reservation_ids: { '10': 'R1' }, blocked_rooms: ['10'] })], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  const held = t.AppData.bookings[0];                       // e.g. ozExecuteMove's `bk`, before `await fetch(...)`
  db.T.bookings.set('b1', { ...db.T.bookings.get('b1'), notes: 'edited elsewhere meanwhile', updated_at: stamp() });
  await t.loadFromSupabase();                                // reload while waiting for Cloudbeds
  assert.strictEqual(held.notes, 'edited elsewhere meanwhile', 'the held object got the fresh values');
  held.cbReservationIds = { ...held.cbReservationIds, '12': 'R2' };   // Cloudbeds answered
  t.saveAll(); await flush(t);
  assert.deepStrictEqual(db.T.bookings.get('b1').cb_reservation_ids, { '10': 'R1', '12': 'R2' });
  assert.strictEqual(db.T.bookings.get('b1').notes, 'edited elsewhere meanwhile');
}
// 23. Same for a registration held across a reload
async function test_heldRegistrationStaysLive() {
  const db = fakeDb({ bookings: [bk('b1')], registrations: [{ id: 'g1', booking_id: 'b1', room: '10', guests: [{ name: 'A' }], updated_at: '2026-11-01T00:00:00.000+00:00' }], app_store: [casOn] });
  const t = makeTab(db);
  await t.loadFromSupabase();
  const held = t.AppData.regs[0];
  await t.loadFromSupabase();
  assert.strictEqual(t.AppData.regs[0], held, 'same object after reload');
  held.room = '11';
  t.saveAll(); await flush(t);
  assert.strictEqual(db.T.registrations.get('g1').room, '11');
}

(async () => {
  await run('save before first load never overwrites with the old local copy', test_saveBeforeLoadDoesNotOverwrite);
  await run('failed first load keeps the gate closed', test_failedLoadKeepsGateClosed);
  await run('after a good load, edits save through CAS', test_afterLoadCasSaves);
  await run('reload keeps an unsaved edit and saves it next', test_reloadKeepsUnsavedRow);
  await run('kept edit merges with another field changed elsewhere', test_reloadKeptRowMergesWithOtherChange);
  await run('load waits for a queued save', test_loadWaitsForQueuedSave);
  await run('Restore backup does not mass-overwrite', test_restoreBackupDoesNotMassOverwrite);
  await run('new booking survives a reload before its first save', test_newRowSurvivesReload);
  await run('switch off = old path', test_switchOffUsesOldPath);
  await run('same-field conflict goes to the Sync Log', test_conflictLogged);
  await run("legacy 'on' still counts as on", test_legacyOn);
  await run('payment edited elsewhere is not reverted', test_paymentEditNotReverted);
  await run('payment deleted elsewhere does not come back', test_deletedPaymentNotResurrected);
  await run('payment add / edit saved, nothing re-sent when unchanged', test_paymentAddEditDelete);
  await run('deleted lists from two computers are joined', test_tombstonesJoined);
  await run('payment recorded here survives a reload before saving', test_pendingPaymentSurvivesReload);
  await run('Cloudbeds answer arriving after a reload is saved', test_cloudbedsAnswerAfterReloadIsSaved);
  await run('registration held across a reload stays live', test_heldRegistrationStaysLive);
  await run('direct write of a settings column is joined, not overwritten', test_directWriteJoinedNotOverwritten);
  await run('direct write not in memory: written, and an undo elsewhere stands', test_directWriteNotInMemoryPatchesBase);
  await run('switch off: direct writes unchanged', test_directWriteSwitchOff);
  await run('Block Rooms re-fetch does not revert later changes', test_blockRoomsRefetchRebased);
  await run('activities added in two tabs are both kept', test_activitiesBothKeptThroughPage);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
