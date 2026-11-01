// Plain Node test harness for modules/cas-sync.js — no framework, matching this
// repo's no-build-step convention. Run with: node test/cas-sync.test.js
//
// A fake Supabase client (makeFakeDb) implements just the chain methods
// cas-sync.js actually uses: .from(table).update(payload).eq().eq().select()
// and .select().eq().maybeSingle() and .insert(). Tests simulate a second
// "tab" racing the one under test by mutating the fake server's rows via an
// `onUpdateAttempt` hook fired right before each conditional-update check.

const assert = require('assert');
const { casBuildBase, casUpdateOne, casSyncTable, casSnapshotRow, casPendingRows, casPatchBase, casRebaseRows, _casMerge3 } = require('../modules/cas-sync.js');

function makeFakeDb(initialRows, { onUpdateAttempt, delayMs } = {}) {
  const serverRows = new Map(initialRows.map(r => [r.id, { ...r }]));
  let attempt = 0;
  function from() {
    return {
      update(payloadLive) {
        const payload = JSON.parse(JSON.stringify(payloadLive)); // sent over the wire now, like the real client
        const filters = {};
        const builder = {
          eq(col, val) { filters[col] = val; return builder; },
          async select() {
            if (delayMs) await new Promise(r => setTimeout(r, delayMs));
            attempt++;
            if (onUpdateAttempt) onUpdateAttempt(attempt, serverRows);
            const row = serverRows.get(filters.id);
            if (!row) return { data: [], error: null };
            for (const k of Object.keys(filters)) {
              if (k === 'id') continue;
              if (String(row[k]) !== String(filters[k])) return { data: [], error: null };
            }
            const updated = { ...row, ...payload };
            serverRows.set(filters.id, updated);
            return { data: [updated], error: null };
          },
        };
        return builder;
      },
      insert(rows) {
        const list = (Array.isArray(rows) ? rows : [rows]);
        const dup = list.find(r => serverRows.has(r.id));
        const done = () => {
          if (dup) return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
          const out = list.map(r => { const row = { ...r, updated_at: r.updated_at || new Date(Date.now() + 7).toISOString() }; serverRows.set(r.id, row); return { ...row }; });
          return { data: out, error: null };
        };
        let ran = null;
        const run = () => (ran = ran || done());
        return { select: async () => run(), then: (res, rej) => Promise.resolve(run()).then(res, rej) };
      },
      select() {
        const filters = {};
        const builder = {
          eq(col, val) { filters[col] = val; return builder; },
          async in(col, vals) { return { data: vals.filter(v => serverRows.has(v)).map(v => ({ ...serverRows.get(v) })), error: null }; },
          async maybeSingle() {
            const row = serverRows.get(filters.id);
            return { data: row ? { ...row } : null, error: null };
          },
        };
        return builder;
      },
    };
  }
  return { from, _server: serverRows, attempts: () => attempt };
}

const idOf = r => r.id;
const toSqlRow = r => ({ id: r.id, leader_name: r.leaderName, notes: r.notes });
const fromSqlRow = r => ({ id: r.id, leaderName: r.leader_name, notes: r.notes });

let passed = 0, failed = 0;
async function run(name, fn) {
  try { await fn(); console.log('ok   -', name); passed++; }
  catch (e) { console.error('FAIL -', name, '\n     ', e.message); failed++; }
}

// 1. Happy path — no conflict at all.
async function test_happyPath() {
  const serverRow = { id: 'bk1', leader_name: 'Jorge', notes: 'old', updated_at: '2026-01-01T00:00:00.000Z' };
  const db = makeFakeDb([serverRow]);
  const local = { id: 'bk1', leaderName: 'Jorge', notes: 'new note' };
  const base = casBuildBase([local], idOf, toSqlRow, () => serverRow.updated_at);
  const res = await casUpdateOne({ db, table: 'bookings', row: local, idOf, toSqlRow, fromSqlRow, base });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(db._server.get('bk1').notes, 'new note');
  assert.strictEqual(base.get('bk1').sqlJson, casSnapshotRow(toSqlRow, local), 'base must reflect what was written');
}

// 2. Conflict on the first attempt, resolves on retry — and the other tab's
//    untouched-by-us field change must survive alongside our own.
async function test_conflictThenResolve() {
  const serverRow = { id: 'bk2', leader_name: 'Jorge', notes: 'old', updated_at: '2026-01-01T00:00:00.000Z' };
  const db = makeFakeDb([serverRow], {
    onUpdateAttempt(attempt, server) {
      if (attempt === 1) {
        // Another tab sneaks in a write to a DIFFERENT field right before our
        // first conditional update lands, bumping updated_at so our eq() misses.
        const cur = server.get('bk2');
        server.set('bk2', { ...cur, leader_name: 'Someone Else', updated_at: '2026-01-02T00:00:00.000Z' });
      }
    },
  });
  const local = fromSqlRow(serverRow); // pristine — matches what this tab last loaded
  const base = casBuildBase([local], idOf, toSqlRow, () => serverRow.updated_at);
  local.notes = 'my change'; // the edit happens AFTER the baseline snapshot, same as real usage
  const res = await casUpdateOne({ db, table: 'bookings', row: local, idOf, toSqlRow, fromSqlRow, base });
  assert.strictEqual(res.ok, true, 'should recover after one conflict');
  assert.strictEqual(db._server.get('bk2').notes, 'my change', 'our own change must survive');
  assert.strictEqual(db._server.get('bk2').leader_name, 'Someone Else', 'their change to a field we never touched must survive too');
  assert.strictEqual(local.notes, 'my change', 'in-memory row must still show our own pending edit, not have reverted it');
  assert.strictEqual(local.leaderName, 'Someone Else', 'in-memory row must pick up their change too');
}

// 3. Sustained conflict that never resolves within maxAttempts — must report
//    failure (not throw, not silently succeed), and the user's own edit must
//    still be visible in-memory (not reverted), and the row must still read
//    as dirty afterwards so the next sync cycle retries it automatically.
async function test_exhaustedConflictNeverLosesTheEdit() {
  const serverRow = { id: 'bk3', leader_name: 'Jorge', notes: 'old', updated_at: '2026-01-01T00:00:00.000Z' };
  const db = makeFakeDb([serverRow], {
    onUpdateAttempt(attempt, server) {
      // Someone else writes EVERY single time, right before our check —
      // our condition can never match.
      const cur = server.get('bk3');
      server.set('bk3', { ...cur, leader_name: 'Rival ' + attempt, updated_at: '2026-01-0' + (2 + attempt) + 'T00:00:00.000Z' });
    },
  });
  const local = fromSqlRow(serverRow);
  const base = casBuildBase([local], idOf, toSqlRow, () => serverRow.updated_at);
  local.notes = 'my change';
  const res = await casUpdateOne({ db, table: 'bookings', row: local, idOf, toSqlRow, fromSqlRow, base, maxAttempts: 3 });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'exhausted');
  assert.strictEqual(local.notes, 'my change', 'the pending edit must still be visible on screen, never silently reverted');
  // Confirm casSyncTable still considers it dirty next time around (base was
  // never advanced past the original baseline on a failed attempt).
  const dirtyNow = casSnapshotRowMatchesBase(local, base, toSqlRow);
  assert.strictEqual(dirtyNow, false, 'row must still diff against base — i.e. still "dirty" for the next sync pass');
}
function casSnapshotRowMatchesBase(row, base, toSqlRow) {
  return casSnapshotRow(toSqlRow, row) === base.get(row.id).sqlJson;
}

// 4. Two tabs editing DIFFERENT fields of the same row at once, through the
//    full casSyncTable entry point (not casUpdateOne directly) — both edits
//    must survive.
async function test_differentFieldsBothSurvive_viaSyncTable() {
  const serverRow = { id: 'bk4', leader_name: 'Jorge', notes: 'old', updated_at: '2026-01-01T00:00:00.000Z' };
  const db = makeFakeDb([serverRow], {
    onUpdateAttempt(attempt, server) {
      if (attempt === 1) {
        const cur = server.get('bk4');
        server.set('bk4', { ...cur, leader_name: 'Changed By Other Tab', updated_at: '2026-01-02T00:00:00.000Z' });
      }
    },
  });
  const local = fromSqlRow(serverRow);
  const base = casBuildBase([local], idOf, toSqlRow, () => serverRow.updated_at);
  local.notes = 'changed by this tab';
  const result = await casSyncTable({
    db, table: 'bookings', rows: [local], idOf, toSqlRow, fromSqlRow, base,
    deletedIds: new Set(), isRecentLocalId: () => true,
  });
  assert.strictEqual(result.updated, 1);
  assert.strictEqual(result.failed.length, 0);
  assert.strictEqual(db._server.get('bk4').notes, 'changed by this tab');
  assert.strictEqual(db._server.get('bk4').leader_name, 'Changed By Other Tab');
}

// 5. Two tabs editing the SAME field — documented outcome is last-write-wins
//    (whichever tab's casUpdateOne call actually lands the final write), not
//    a crash and not a silent no-op.
async function test_sameFieldLastWriteWins() {
  const serverRow = { id: 'bk5', leader_name: 'Jorge', notes: 'old', updated_at: '2026-01-01T00:00:00.000Z' };
  const db = makeFakeDb([serverRow], {
    onUpdateAttempt(attempt, server) {
      if (attempt === 1) {
        // The other tab ALSO changed `notes` (the same field we're changing).
        const cur = server.get('bk5');
        server.set('bk5', { ...cur, notes: 'their note', updated_at: '2026-01-02T00:00:00.000Z' });
      }
    },
  });
  const local = fromSqlRow(serverRow);
  const base = casBuildBase([local], idOf, toSqlRow, () => serverRow.updated_at);
  local.notes = 'my note';
  const res = await casUpdateOne({ db, table: 'bookings', row: local, idOf, toSqlRow, fromSqlRow, base });
  assert.strictEqual(res.ok, true);
  // This tab's merge logic treats "notes" as something IT changed (differs
  // from its own baseline), so this tab's value wins — documented, acceptable
  // last-write-wins behavior, same as any real-time system.
  assert.strictEqual(db._server.get('bk5').notes, 'my note');
}

// 6. A row brought in AFTER load (Block Rooms re-fetching a retreat's registrations) has no baseline: it must adopt the
//    server row and save an edit normally -- not be re-inserted (duplicate key) nor skipped as a zombie (edit never saved).
async function test_rowFetchedAfterLoadStillSaves() {
  const old = { id: 'id_1700000000000_abcd', leader_name: 'Ana', notes: 'server', updated_at: '2026-01-01T00:00:00.000Z' };
  const recent = { id: 'id_' + Date.now() + '_wxyz', leader_name: 'Bea', notes: 'server', updated_at: '2026-01-01T00:00:00.000Z' };
  const db = makeFakeDb([old, recent]);
  const base = new Map();   // this tab loaded before both rows existed
  const rows = [fromSqlRow(old), fromSqlRow(recent)];
  rows[0].notes = 'edited old'; rows[1].notes = 'edited recent';
  const res = await casSyncTable({ db, table: 'registrations', rows, idOf, toSqlRow, fromSqlRow, base, isRecentLocalId: id => !/^id_1700/.test(id) });
  assert.deepStrictEqual(res.failed, [], 'nothing may fail');
  assert.deepStrictEqual(res.skippedZombies, [], 'an existing row is never treated as a zombie');
  assert.strictEqual(res.inserted, 0, 'an existing row is never re-inserted');
  assert.strictEqual(db._server.get(old.id).notes, 'edited old');
  assert.strictEqual(db._server.get(recent.id).notes, 'edited recent');
}

// 7. Split stay: the new row is inserted straight to SQL and pushed into memory; the next sync must not try to insert it again
async function test_rowInsertedDirectlyIsNotReinserted() {
  const db = makeFakeDb([]);
  const created = { id: 'id_' + Date.now() + '_spl1', leader_name: 'Cal', notes: 'split', updated_at: '2026-10-22T10:00:00.000Z' };
  db._server.set(created.id, { ...created });
  const rows = [fromSqlRow(created)];
  const res = await casSyncTable({ db, table: 'registrations', rows, idOf, toSqlRow, fromSqlRow, base: new Map(), isRecentLocalId: () => true });
  assert.deepStrictEqual(res.failed, [], 'no duplicate-key failure');
  assert.strictEqual(res.inserted, 0);
  assert.strictEqual(res.updated, 0, 'unchanged row is not even written');
}

// 8. Deleted on another tab: reported as gone right away (one attempt), not as a failure retried on every save
async function test_deletedElsewhereIsGone() {
  const srv = { id: 'bk9', leader_name: 'Dee', notes: 'x', updated_at: '2026-01-01T00:00:00.000Z' };
  const db = makeFakeDb([srv]);
  const local = fromSqlRow(srv);
  const base = casBuildBase([local], idOf, toSqlRow, () => srv.updated_at);
  db._server.delete('bk9');
  local.notes = 'edit after delete';
  const t0 = Date.now();
  const res = await casSyncTable({ db, table: 'bookings', rows: [local], idOf, toSqlRow, fromSqlRow, base });
  assert.deepStrictEqual(res.gone, ['bk9']);
  assert.deepStrictEqual(res.failed, []);
  assert.ok(!base.has('bk9'), 'baseline dropped');
  assert.ok(Date.now() - t0 < 300, 'no retry loop');
}

// 9. A new row's baseline is SQL's real updated_at, so its first edit after creation saves on the first attempt
async function test_insertThenEditFirstAttempt() {
  const db = makeFakeDb([]);
  const row = { id: 'id_' + Date.now() + '_new1', leaderName: 'Eve', notes: 'v1' };
  const base = new Map();
  await casSyncTable({ db, table: 'bookings', rows: [row], idOf, toSqlRow, fromSqlRow, base, isRecentLocalId: () => true });
  const before = db.attempts();
  row.notes = 'v2';
  const res = await casSyncTable({ db, table: 'bookings', rows: [row], idOf, toSqlRow, fromSqlRow, base, isRecentLocalId: () => true });
  assert.strictEqual(res.updated, 1);
  assert.strictEqual(db.attempts() - before, 1, 'one update attempt, no self-conflict');
  assert.strictEqual(db._server.get(row.id).notes, 'v2');
}

// 10. Only .updatedAt bumped by hand (the old convention) and nothing else: no write
async function test_updatedAtAloneIsNotAnEdit() {
  const toSqlTs = r => ({ id: r.id, leader_name: r.leaderName, notes: r.notes, updated_at: r.updatedAt || null });
  const fromSqlTs = r => ({ id: r.id, leaderName: r.leader_name, notes: r.notes, updatedAt: r.updated_at });
  const srv = { id: 'bk7', leader_name: 'Fay', notes: 'n', updated_at: '2026-01-01T00:00:00.000Z' };
  const db = makeFakeDb([srv]);
  const local = fromSqlTs(srv);
  const base = casBuildBase([local], idOf, toSqlTs, () => srv.updated_at);
  local.updatedAt = new Date().toISOString();
  const res = await casSyncTable({ db, table: 'bookings', rows: [local], idOf, toSqlRow: toSqlTs, fromSqlRow: fromSqlTs, base });
  assert.strictEqual(res.updated, 0);
  assert.strictEqual(db.attempts(), 0);
}


// Rows with a list column, for the tests below
const toSqlL = r => ({ id: r.id, leader_name: r.leaderName, notes: r.notes, acts: r.acts === undefined ? null : r.acts });
const fromSqlL = r => { const o = {}; if ('id' in r) o.id = r.id; if ('leader_name' in r) o.leaderName = r.leader_name; if ('notes' in r) o.notes = r.notes; if ('acts' in r) o.acts = r.acts; return o; };

// 11. A second quick edit made while the first save is still in the air stays pending and is saved by the next save --
//     never folded into the baseline unsent (the bug: date edit, then time edit within a second, time lost).
async function test_editDuringSaveIsNotLost() {
  const srv = { id: 'bk11', leader_name: 'Ana', notes: 'n0', acts: [{ aoId: 'ao1', date: '2027-01-01', time: '10:00' }], updated_at: '2026-01-01T00:00:00.000Z' };
  const db = makeFakeDb([srv], { delayMs: 30 });
  const local = fromSqlL(srv); local.acts = JSON.parse(JSON.stringify(srv.acts));
  const base = casBuildBase([local], idOf, toSqlL, () => srv.updated_at);
  local.acts[0].date = '2027-01-02';                               // edit 1
  const first = casSyncTable({ db, table: 'bookings', rows: [local], idOf, toSqlRow: toSqlL, fromSqlRow: fromSqlL, base });
  await new Promise(r => setTimeout(r, 5));
  local.acts[0].time = '11:00'; local.notes = 'n1';               // edit 2, while edit 1 is in the air
  await first;
  assert.strictEqual(local.notes, 'n1', 'edit 2 still on screen');
  assert.strictEqual(local.acts[0].time, '11:00', 'edit 2 still on screen');
  const second = await casSyncTable({ db, table: 'bookings', rows: [local], idOf, toSqlRow: toSqlL, fromSqlRow: fromSqlL, base });
  assert.strictEqual(second.updated, 1, 'next save sends edit 2');
  const s = db._server.get('bk11');
  assert.strictEqual(s.notes, 'n1'); assert.strictEqual(s.acts[0].time, '11:00'); assert.strictEqual(s.acts[0].date, '2027-01-02');
}

// 12. A list that was null and became [] in memory (a cleanup/render did it) is not an edit: no write, and on a merge it
//     never wipes the list another tab just filled.
async function test_nullToEmptyIsNotAnEdit() {
  const srv = { id: 'bk12', leader_name: 'Bo', notes: 'x', acts: null, updated_at: '2026-01-01T00:00:00.000Z' };
  const db = makeFakeDb([srv], {
    onUpdateAttempt(attempt, server) {
      if (attempt === 1) server.set('bk12', { ...server.get('bk12'), acts: [{ aoId: 'ao5', date: '2027-02-02' }], updated_at: '2026-01-02T00:00:00.000Z' });
    },
  });
  const local = fromSqlL(srv);
  const base = casBuildBase([local], idOf, toSqlL, () => srv.updated_at);
  local.acts = [];
  const r0 = await casSyncTable({ db, table: 'bookings', rows: [local], idOf, toSqlRow: toSqlL, fromSqlRow: fromSqlL, base });
  assert.strictEqual(r0.updated, 0, '[] vs null alone is no write');
  local.notes = 'real edit';                                       // a real edit on another column forces a write + merge
  const r1 = await casSyncTable({ db, table: 'bookings', rows: [local], idOf, toSqlRow: toSqlL, fromSqlRow: fromSqlL, base });
  assert.strictEqual(r1.updated, 1);
  assert.deepStrictEqual(db._server.get('bk12').acts, [{ aoId: 'ao5', date: '2027-02-02' }], 'the other tab\'s new list survives');
  assert.strictEqual(db._server.get('bk12').notes, 'real edit');
  assert.deepStrictEqual(local.acts, [{ aoId: 'ao5', date: '2027-02-02' }], 'and shows on this screen');
}

// 13. Same content, different key order (jsonb returns keys in its own order) is not an edit
async function test_keyOrderIsNotAnEdit() {
  const srv = { id: 'bk13', leader_name: 'Cy', notes: 'x', acts: [{ date: '2027-01-01', aoId: 'ao1', time: '10:00' }], updated_at: '2026-01-01T00:00:00.000Z' };
  const db = makeFakeDb([srv]);
  const local = fromSqlL(srv);
  const base = casBuildBase([local], idOf, toSqlL, () => srv.updated_at);
  local.acts = [{ aoId: 'ao1', time: '10:00', date: '2027-01-01' }];
  const res = await casSyncTable({ db, table: 'bookings', rows: [local], idOf, toSqlRow: toSqlL, fromSqlRow: fromSqlL, base });
  assert.strictEqual(res.updated, 0);
  assert.strictEqual(db.attempts(), 0);
}

// 14. Both tabs changed the same column: this tab wins (documented) and the row is reported as a conflict for the Sync Log
async function test_sameColumnConflictIsReported() {
  const srv = { id: 'bk14', leader_name: 'Di', notes: 'old', updated_at: '2026-01-01T00:00:00.000Z' };
  const db = makeFakeDb([srv], {
    onUpdateAttempt(attempt, server) { if (attempt === 1) server.set('bk14', { ...server.get('bk14'), notes: 'theirs', leader_name: 'Their Name', updated_at: '2026-01-02T00:00:00.000Z' }); },
  });
  const local = fromSqlRow(srv);
  const base = casBuildBase([local], idOf, toSqlRow, () => srv.updated_at);
  local.notes = 'mine';
  const res = await casSyncTable({ db, table: 'bookings', rows: [local], idOf, toSqlRow, fromSqlRow, base });
  assert.strictEqual(res.updated, 1);
  assert.strictEqual(res.conflicts.length, 1);
  assert.strictEqual(res.conflicts[0].reason, 'notes', 'only the column both changed is named');
  assert.strictEqual(db._server.get('bk14').leader_name, 'Their Name');
}

// 15. A merge pulls another tab's column onto the screen, but never over an edit to that column made while saving
async function test_mergeDoesNotOverwriteEditMadeMidSave() {
  const srv = { id: 'bk15', leader_name: 'Ed', notes: 'old', updated_at: '2026-01-01T00:00:00.000Z' };
  let local;
  const db = makeFakeDb([srv], {
    delayMs: 10,
    onUpdateAttempt(attempt, server) {
      if (attempt === 1) {
        server.set('bk15', { ...server.get('bk15'), leader_name: 'Theirs', updated_at: '2026-01-02T00:00:00.000Z' });
        local.leaderName = 'Mine typed mid-save';                   // this tab edits the same column while the save is retrying
      }
    },
  });
  local = fromSqlRow(srv);
  const base = casBuildBase([local], idOf, toSqlRow, () => srv.updated_at);
  local.notes = 'n';
  await casSyncTable({ db, table: 'bookings', rows: [local], idOf, toSqlRow, fromSqlRow, base });
  assert.strictEqual(local.leaderName, 'Mine typed mid-save', 'mid-save edit kept on screen');
  const again = await casSyncTable({ db, table: 'bookings', rows: [local], idOf, toSqlRow, fromSqlRow, base });
  assert.strictEqual(again.updated, 1, 'and saved next');
  assert.strictEqual(db._server.get('bk15').leader_name, 'Mine typed mid-save');
}

// 16. casPendingRows: what a reload must keep (unsaved edits, new unsaved rows) and what it may replace
async function test_pendingRows() {
  const a = { id: 'a', leaderName: 'A', notes: 'x' }, b = { id: 'b', leaderName: 'B', notes: 'x' };
  const base = casBuildBase([a, b], idOf, toSqlRow, () => 't0');
  b.notes = 'edited';
  const fresh = { id: 'id_' + Date.now() + '_new', leaderName: 'N', notes: '' };
  const zombie = { id: 'id_1600000000000_old', leaderName: 'Z', notes: '' };
  const pend = casPendingRows([a, b, fresh, zombie], idOf, toSqlRow, base, id => !/^id_1600/.test(id)).map(r => r.id);
  assert.deepStrictEqual(pend, ['b', fresh.id]);
}

// ---- Step 2: two people changing the same list / settings object at the same time --------------------------------------
// Runs a real two-tab race through casSyncTable: `other` is what another tab saved first, `mine` what this tab changes.
async function race(col, start, other, mine, opts = {}) {
  const toS = r => ({ id: r.id, [col]: r[col] === undefined ? null : r[col], notes: r.notes });
  const fromS = r => { const o = {}; if ('id' in r) o.id = r.id; if (col in r) o[col] = r[col]; if ('notes' in r) o.notes = r.notes; return o; };
  const srv = { id: 'r', [col]: start, notes: 'n', updated_at: '2026-01-01T00:00:00.000Z' };
  const db = makeFakeDb([srv], { onUpdateAttempt(a, server) { if (a === 1) server.set('r', { ...server.get('r'), [col]: other, updated_at: '2026-01-02T00:00:00.000Z' }); } });
  const local = fromS(JSON.parse(JSON.stringify(srv)));
  const base = casBuildBase([local], idOf, toS, () => srv.updated_at);
  local[col] = mine;
  const res = await casSyncTable({ db, table: 't', rows: [local], idOf, toSqlRow: toS, fromSqlRow: fromS, base, serverWins: opts.serverWins });
  return { server: db._server.get('r')[col], local: local[col], res };
}
const A = (aoId, date) => ({ aoId, date, time: '10:00', prepaid: false });

async function test_activitiesBothAdd() {
  const { server, local } = await race('acts', [A('ao1', 'd1')], [A('ao1', 'd1'), A('ao2', 'd2')], [A('ao1', 'd1'), A('ao3', 'd3')]);
  assert.deepStrictEqual(server.map(a => a.aoId).sort(), ['ao1', 'ao2', 'ao3'], 'both new activities kept');
  assert.deepStrictEqual(local.map(a => a.aoId).sort(), ['ao1', 'ao2', 'ao3'], 'and shown on this screen');
}
async function test_activitiesRemoveVsAdd() {
  const { server } = await race('acts', [A('ao1', 'd1'), A('ao2', 'd2')], [A('ao1', 'd1'), A('ao2', 'd2'), A('ao9', 'd9')], [A('ao2', 'd2')]);
  assert.deepStrictEqual(server.map(a => a.aoId).sort(), ['ao2', 'ao9'], 'my removal of ao1 and their add of ao9 both apply');
}
async function test_activitiesBothAddSameNoDuplicate() {
  const { server } = await race('acts', [], [A('ao5', 'd5')], [A('ao5', 'd5')]);
  assert.strictEqual(server.length, 1);
}
async function test_activitiesEditVsAdd() {
  const { server } = await race('acts', [A('ao1', 'd1')], [A('ao1', 'd1'), A('ao2', 'd2')], [A('ao1', 'd4')]);
  assert.deepStrictEqual(server.map(a => a.aoId + '@' + a.date).sort(), ['ao1@d4', 'ao2@d2'], 'my date change and their new activity');
}
const C = (id, amount, d) => ({ id, amount, description: d || 'x' });
async function test_chargesBothAdd() {
  const { server, res } = await race('charges', [C('c1', 10)], [C('c1', 10), C('c2', 95, 'Boutique')], [C('c1', 10), C('c3', 145, 'Massage')]);
  assert.deepStrictEqual(server.map(c => c.id).sort(), ['c1', 'c2', 'c3'], 'boutique AND massage both kept');
  assert.strictEqual(res.conflicts.length, 0);
}
async function test_chargesEditVsDeleteOther() {
  const { server } = await race('charges', [C('c1', 10), C('c2', 20)], [C('c1', 10)], [C('c1', 12), C('c2', 20)]);
  assert.deepStrictEqual(server, [C('c1', 12)], 'my edit of c1 kept, their delete of c2 applied');
}
async function test_chargesSameChargeBothEdited() {
  const { server, res } = await race('charges', [C('c1', 10, 'a')], [C('c1', 10, 'theirs')], [C('c1', 15, 'a')]);
  assert.deepStrictEqual(server, [C('c1', 15, 'theirs')], 'different fields of the same charge both kept');
  assert.strictEqual(res.conflicts.length, 0);
}
async function test_blockedRoomsTwoMoves() {
  const { server } = await race('rooms', ['10', '11', '20'], ['10', '13', '20'], ['12', '11', '20']);
  assert.deepStrictEqual([...server].sort(), ['12', '13', '20'], 'move 10->12 here and 11->13 there both apply');
}
async function test_settingsObjectDifferentKeys() {
  const start = { __cfg__: { taxRate: 16, hideRoomNumbers: false }, pkgA: 100 };
  const { server } = await race('pcp', start, { __cfg__: { taxRate: 0, hideRoomNumbers: false }, pkgA: 100 }, { __cfg__: { taxRate: 16, hideRoomNumbers: true }, pkgA: 100 });
  assert.deepStrictEqual(server, { __cfg__: { taxRate: 0, hideRoomNumbers: true }, pkgA: 100 }, 'tax rate there + hide numbers here');
}
async function test_settingsSameKeyConflictLogged() {
  const { server, res } = await race('pcp', { pkgA: 100 }, { pkgA: 120 }, { pkgA: 130 });
  assert.deepStrictEqual(server, { pkgA: 130 });
  assert.strictEqual(res.conflicts[0].reason, 'pcp');
}
async function test_autoColumnServerWins() {
  const { server, local, res } = await race('venue_row', 'R1', 'R2', 'R3', { serverWins: new Set(['venue_row']) });
  assert.strictEqual(server, 'R2', 'an automatic value never replaces what was already saved');
  assert.strictEqual(local, 'R2');
  assert.strictEqual(res.conflicts.length, 0);
}
async function test_guestsNameFixVsAddGuest() {
  const g = (name) => ({ name, email: '', phone: '' });
  const { server } = await race('guests', [g('Ana Lopz')], [g('Ana Lopz'), g('Bea')], [g('Ana Lopez')]);
  assert.deepStrictEqual(server.map(x => x.name).sort(), ['Ana Lopez', 'Bea']);
}

// casPatchBase: a direct write recorded in the baseline -- a check-in undone on another device is not re-applied
async function test_patchBaseAfterDirectWrite() {
  const toS = r => ({ id: r.id, checked_in_at: r.checkedInAt || null, notes: r.notes });
  const fromS = r => { const o = {}; if ('id' in r) o.id = r.id; if ('checked_in_at' in r) o.checkedInAt = r.checked_in_at; if ('notes' in r) o.notes = r.notes; return o; };
  const srv = { id: 'g1', checked_in_at: null, notes: 'n', updated_at: '2026-01-01T00:00:00.000Z' };
  const db = makeFakeDb([srv]);
  const local = fromS(srv);
  const base = casBuildBase([local], idOf, toS, () => srv.updated_at);
  local.checkedInAt = 'T1';                                                         // Check In written straight to SQL
  db._server.set('g1', { ...db._server.get('g1'), checked_in_at: 'T1', updated_at: '2026-01-02T00:00:00.000Z' });
  casPatchBase(base, 'g1', { checked_in_at: 'T1' });
  db._server.set('g1', { ...db._server.get('g1'), checked_in_at: null, updated_at: '2026-01-03T00:00:00.000Z' }); // undone elsewhere
  local.notes = 'later edit';
  await casSyncTable({ db, table: 'registrations', rows: [local], idOf, toSqlRow: toS, fromSqlRow: fromS, base });
  assert.strictEqual(db._server.get('g1').checked_in_at, null, 'the undo elsewhere stands');
  assert.strictEqual(db._server.get('g1').notes, 'later edit');
}
async function test_rebaseRows() {
  const base = new Map();
  casRebaseRows(base, [{ id: 'x', leader_name: 'L', notes: 'n', updated_at: 'T9' }], toSqlRow, fromSqlRow);
  assert.strictEqual(base.get('x').updatedAt, 'T9');
  assert.strictEqual(base.get('x').sqlJson, casSnapshotRow(toSqlRow, { id: 'x', leaderName: 'L', notes: 'n' }));
}

(async () => {
  await run('happy path, no conflict', test_happyPath);
  await run('conflict on attempt 1, resolves on retry, both edits survive', test_conflictThenResolve);
  await run('sustained conflict exhausts retries without losing the pending edit', test_exhaustedConflictNeverLosesTheEdit);
  await run('two tabs, different fields, via casSyncTable, both survive', test_differentFieldsBothSurvive_viaSyncTable);
  await run('two tabs, same field, last write wins (documented)', test_sameFieldLastWriteWins);
  await run('row fetched after load (Block Rooms) still saves, never re-inserted or skipped', test_rowFetchedAfterLoadStillSaves);
  await run('row inserted straight to SQL (Split stay) is not inserted again', test_rowInsertedDirectlyIsNotReinserted);
  await run('row deleted on another tab is reported gone at once, not retried', test_deletedElsewhereIsGone);
  await run('new row: first edit after creation saves on the first attempt', test_insertThenEditFirstAttempt);
  await run('only .updatedAt bumped by hand is not an edit', test_updatedAtAloneIsNotAnEdit);
  await run('edit made while a save is in the air is not lost', test_editDuringSaveIsNotLost);
  await run('null -> [] is not an edit and never wipes a list filled elsewhere', test_nullToEmptyIsNotAnEdit);
  await run('same content in another key order is not an edit', test_keyOrderIsNotAnEdit);
  await run('same column changed by both tabs is reported as a conflict', test_sameColumnConflictIsReported);
  await run('merge never overwrites an edit made mid-save', test_mergeDoesNotOverwriteEditMadeMidSave);
  await run('reload keeps pending rows only', test_pendingRows);
  await run('activities: both add, both kept', test_activitiesBothAdd);
  await run('activities: my removal + their add', test_activitiesRemoveVsAdd);
  await run('activities: same add on both sides is not duplicated', test_activitiesBothAddSameNoDuplicate);
  await run('activities: my edit + their add', test_activitiesEditVsAdd);
  await run('charges: boutique + massage at once, both kept', test_chargesBothAdd);
  await run('charges: my edit + their delete of another', test_chargesEditVsDeleteOther);
  await run('charges: different fields of one charge', test_chargesSameChargeBothEdited);
  await run('blocked rooms: two moves at once', test_blockedRoomsTwoMoves);
  await run('settings object: different keys both kept', test_settingsObjectDifferentKeys);
  await run('settings object: same key -> last wins, logged', test_settingsSameKeyConflictLogged);
  await run('automatic column: server value wins', test_autoColumnServerWins);
  await run('guests: name fix + added guest', test_guestsNameFixVsAddGuest);
  await run('direct write recorded: undo elsewhere not reverted', test_patchBaseAfterDirectWrite);
  await run('rebase rows from a full re-fetch', test_rebaseRows);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
