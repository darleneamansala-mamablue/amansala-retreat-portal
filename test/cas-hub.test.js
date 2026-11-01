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
    HUB + '\nthis.T={get AppData(){return AppData},saveAll,loadFromSupabase,syncToSupabase,get ready(){return _casBaseReady},set ready(v){_casBaseReady=v},sqlBookingToApp,sqlRegToApp,get busy(){return _saveAllBusy}};', ctx);
  return ctx.T;
}
const flush = async t => { await t.busy; await new Promise(r => setTimeout(r, 5)); await t.busy; };
const bk = (id, extra) => ({ id, leader_name: 'L ' + id, notes: 'server', status: 'confirmed', retreat_activities: null, updated_at: '2026-11-01T00:00:00.000+00:00', ...extra });
const casOn = { key: 'cas_sync', value: { mode: 'on' } };

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
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
