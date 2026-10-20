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
      async insert(rows) {
        (Array.isArray(rows) ? rows : [rows]).forEach(r => {
          serverRows.set(r.id, { ...r, updated_at: r.updated_at || new Date().toISOString() });
        });
        return { error: null };
      },
      select() {
        const filters = {};
        const builder = {
          eq(col, val) { filters[col] = val; return builder; },
          async maybeSingle() {
            const row = serverRows.get(filters.id);
            return { data: row ? { ...row } : null, error: null };
          },
        };
        return builder;
      },
    };
  }
  return { from, _server: serverRows };
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

(async () => {
  await run('happy path, no conflict', test_happyPath);
  await run('conflict on attempt 1, resolves on retry, both edits survive', test_conflictThenResolve);
  await run('sustained conflict exhausts retries without losing the pending edit', test_exhaustedConflictNeverLosesTheEdit);
  await run('two tabs, different fields, via casSyncTable, both survive', test_differentFieldsBothSurvive_viaSyncTable);
  await run('two tabs, same field, last write wins (documented)', test_sameFieldLastWriteWins);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
