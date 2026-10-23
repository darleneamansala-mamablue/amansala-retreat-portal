// Plain Node test harness for modules/cas-sync.js — no framework, matching this
// repo's no-build-step convention. Run with: node test/cas-sync.test.js
//
// A fake Supabase client (makeFakeDb) implements just the chain methods
// cas-sync.js actually uses: .from(table).update(payload).eq().eq().select()
// and .select().eq().maybeSingle() and .insert(). Tests simulate a second
// "tab" racing the one under test by mutating the fake server's rows via an
// `onUpdateAttempt` hook fired right before each conditional-update check.

const assert = require('assert');
const { casBuildBase, casUpdateOne, casSyncTable } = require('../modules/cas-sync.js');

function makeFakeDb(initialRows, { onUpdateAttempt } = {}) {
  const serverRows = new Map(initialRows.map(r => [r.id, { ...r }]));
  let attempt = 0;
  function from() {
    return {
      update(payload) {
        const filters = {};
        const builder = {
          eq(col, val) { filters[col] = val; return builder; },
          async select() {
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
  assert.strictEqual(base.get('bk1').sqlJson, JSON.stringify(toSqlRow(local)), 'base must reflect what was written');
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
  return JSON.stringify(toSqlRow(row)) === base.get(row.id).sqlJson;
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
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
