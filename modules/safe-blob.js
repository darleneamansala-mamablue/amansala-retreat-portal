// ===== safe-blob.js — saving a whole app_store blob without overwriting anyone (Jorge 2026-11-07: "cubrir 100% reescritura perdida") =====
// Some screens keep one big JSON in app_store (spa settings, menu, driver confirmations…) and used to save their WHOLE copy, so a tab
// holding an older copy wiped what others saved meanwhile. safeBlobSave(key, local, base) instead:
//   1. works out what THIS tab changed since it loaded (`base` = the value as loaded / last saved), field by field;
//   2. applies only that on top of the latest saved value — lists of records with an `id` are merged record by record (added,
//      edited field by field, deleted), objects key by key; everything this tab did not touch stays as saved by others;
//   3. writes only if nobody saved in between (compare-and-swap on updated_at), else re-reads and redoes it (up to 12 times).
// Returns { ok, value, conflicts } — value is the merged saved value (use it as the new local AND base); conflicts lists the fields
// someone else had also changed (this tab's version was kept; the other one is in History). Classic script, global functions.
(function () {
  const J = v => JSON.stringify(v === undefined ? null : v);
  const same = (a, b) => J(a) === J(b);
  const clone = v => (v === undefined ? undefined : JSON.parse(J(v)));
  const isIdList = v => Array.isArray(v) && v.length > 0 && v.every(x => x && typeof x === 'object' && !Array.isArray(x) && x.id != null);
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

  // three-way merge: base (what this tab started from), local (this tab now), server (saved now)
  function merge3(base, local, server, path, conflicts) {
    if (same(local, base)) return clone(server);            // this tab did not touch it: keep what is saved
    if (same(server, base) || same(server, local)) return clone(local);   // only this tab changed it
    // both changed it
    const lists = [base, local, server].filter(v => v !== undefined && v !== null);
    if (lists.every(v => Array.isArray(v)) && lists.some(isIdList)) return mergeList(base || [], local || [], server || [], path, conflicts);
    if (lists.every(isObj)) {
      const out = {}, keys = new Set([...Object.keys(base || {}), ...Object.keys(local || {}), ...Object.keys(server || {})]);
      keys.forEach(k => {
        const v = merge3((base || {})[k], (local || {})[k], (server || {})[k], path ? path + '.' + k : k, conflicts);
        if (v !== undefined) out[k] = v;
      });
      return out;
    }
    conflicts.push(path || '(value)');
    return clone(local);                                     // same field changed in two places: this tab's version wins, noted
  }
  function mergeList(base, local, server, path, conflicts) {
    const by = l => { const m = new Map(); (l || []).forEach(x => { if (x && x.id != null) m.set(String(x.id), x); }); return m; };
    const B = by(base), L = by(local), S = by(server);
    const out = [];
    const seen = new Set();
    // keep the saved order; then records only this tab added
    (server || []).forEach(s => {
      if (!s || s.id == null) { out.push(s); return; }
      const id = String(s.id); seen.add(id);
      const b = B.get(id), l = L.get(id);
      if (b && !l) { if (!same(s, b)) { conflicts.push(`${path}[${id}] deleted here, edited elsewhere — kept`); out.push(s); } return; }   // deleted here
      if (!b && !l) { out.push(s); return; }                                     // added elsewhere
      out.push(merge3(b, l, s, `${path}[${id}]`, conflicts));
    });
    (local || []).forEach(l => {
      if (!l || l.id == null) return;
      const id = String(l.id);
      if (seen.has(id)) return;
      if (B.has(id)) { if (!same(l, B.get(id))) conflicts.push(`${path}[${id}] edited here, deleted elsewhere — stays deleted`); return; }   // deleted elsewhere since this tab loaded
      out.push(clone(l));                                    // added here
    });
    return out;
  }

  window.safeBlobMerge = function (base, local, server) { const conflicts = []; return { value: merge3(base, local, server, '', conflicts), conflicts }; };

  window.safeBlobSave = async function (key, local, base, client) {
    const c = client || db;
    let lastErr = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const { data: row, error: re } = await c.from('app_store').select('value,updated_at').eq('key', key).maybeSingle();
        if (re) throw re;
        const server = row ? row.value : undefined;
        const conflicts = [];
        const value = row ? merge3(base, local, server, '', conflicts) : clone(local);
        if (row && same(value, server)) return { ok: true, value, conflicts };
        const now = new Date().toISOString();
        let ok;
        if (row) {
          const { data: upd, error: ue } = await c.from('app_store').update({ value, updated_at: now }).eq('key', key).eq('updated_at', row.updated_at).select('key');
          if (ue) throw ue; ok = !!(upd && upd.length);
        } else {
          const { error: ie } = await c.from('app_store').insert({ key, value, updated_at: now });
          if (ie) throw ie; ok = true;
        }
        if (ok) return { ok: true, value, conflicts };
        await new Promise(r => setTimeout(r, 80 + Math.random() * 220));   // someone saved at the same moment: redo on the new value
      } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 400)); }
    }
    console.error('[safe-blob] could not save', key, lastErr);
    return { ok: false, error: lastErr };
  };
  window.safeBlobClone = clone;

  // ---- every screen at once (Jorge 2026-11-07): ~60 places save their whole list with db.from('app_store').upsert({key, value}).
  // Reads of app_store remember each key's value as this tab got it; a later one-row upsert of that key then goes through
  // safeBlobSave (only this tab's changes, compare-and-swap) instead of writing the whole copy. Left as before: keys never read
  // in this tab, several rows in one upsert (saveAll has its own guard), and keys that are meant to be overwritten (edit locks,
  // session signals, backups, logs). Off switch for one browser: localStorage 'safe_blob_off' = '1'.
  if (typeof db === 'undefined' || !db || typeof db.from !== 'function') return;
  const RAW = { from: db.from.bind(db) };
  const SKIP = /(^retreat_lock_|^session_revocations$|^clear_signal$|^cas_sync$|_bk_|backup|_log$|^cas_log|_before_|^menu_archive_|^deleted(Booking|Reg|Payment)Ids$)/;
  const base = {};
  window._sbUnprotected = window._sbUnprotected || {};
  const off = () => { try { return localStorage.getItem('safe_blob_off') === '1'; } catch (e) { return false; } };
  function record(keys, data) {
    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    rows.forEach(r => {
      if (!r || !('value' in r)) return;
      const k = r.key != null ? r.key : (keys.length === 1 ? keys[0] : null);
      if (k != null) base[k] = clone(r.value);
    });
  }
  // safeBlobSave reads/writes with the raw client, so its own reads never move a screen's starting point
  const rawSave = (key, local, b) => window.safeBlobSave(key, local, b, RAW);
  // the portal's first full read happens before this file loads: start from the copy it left (booking-hub.html loadFromSupabase)
  // a save made before that first read lands is built on an empty screen (the Menu rebuilt on reload before its data loaded and
  // wrote the current week only, wiping the other weeks -- 2026-11-07): it waits for the read; if the key already exists it is
  // dropped (nothing a person typed can be in it yet), a brand-new key is written as usual
  let seeded = false, seedWaiters = [];
  const seedDone = () => { seeded = true; seedWaiters.forEach(f => f()); seedWaiters = []; };
  const waitSeed = () => seeded ? Promise.resolve() : new Promise(res => { seedWaiters.push(res); setTimeout(() => { seeded = true; res(); }, 30000); });   // no full read (teacher page…): go on after 30 s
  window.safeBlobSeed = function () { try { if (window._sbLastStore) { record([], JSON.parse(window._sbLastStore)); window._sbLastStore = null; seedDone(); } } catch (e) {} };
  window.safeBlobSeed();
  window._sbDropped = window._sbDropped || {};
  // ---- transport rows (Jorge 2026-11-07): each edit wrote the WHOLE `data` of the row, so a screen opened earlier undid what someone
  // else changed in the same transport (flight, pickup, notes, charge marks). Reads remember each row's data; an update/upsert of
  // one row's data then saves only this screen's changes on top of the current row, and only if it did not change in between.
  const trBase = {};
  const trRecord = data => (Array.isArray(data) ? data : (data ? [data] : [])).forEach(r => { if (r && r.id != null && r.data && typeof r.data === 'object') trBase[r.id] = clone(r.data); });
  async function trSave(id, local, extra) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const { data: cur, error: re } = await RAW.from('transport').select('id,data').eq('id', id).maybeSingle();
      if (re) return { data: null, error: re };
      if (!cur) { const r = await RAW.from('transport').insert({ id, data: local, ...(extra || {}) }); if (!r.error) trBase[id] = clone(local); return r; }
      const conflicts = [];
      const merged = merge3(trBase[id], local, cur.data, '', conflicts);
      if (same(merged, cur.data) && !extra) { trBase[id] = clone(local); return { data: null, error: null }; }
      const { data: upd, error: ue } = await RAW.from('transport').update({ data: merged, ...(extra || {}) }).eq('id', id).eq('data', J(cur.data)).select('id');
      if (ue) return { data: null, error: ue };
      if (upd && upd.length) {
        trBase[id] = clone(local);
        if (conflicts.length) { try { console.warn('[safe-blob] transport', id, 'also changed elsewhere:', conflicts); } catch (e) {} }
        return { data: null, error: null, merged };
      }
      await new Promise(r => setTimeout(r, 80 + Math.random() * 220));
    }
    return { data: null, error: { message: 'The transport changed while saving — try again.' } };
  }
  const thenable = exec => { let run = null; const go = () => run || (run = exec()); const t = { then: (a, b) => go().then(a, b), catch: b => go().catch(b), finally: f => go().finally(f), select() { return t; }, single() { return t; }, maybeSingle() { return t; } }; return t; };

  const prevFrom = db.from;
  db.from = function (table) {
    const qb = prevFrom.apply(db, arguments);
    if (table === 'transport' && !off()) {
      const tsel = qb.select.bind(qb);
      qb.select = function () { const fb = tsel.apply(qb, arguments), th = fb.then.bind(fb); fb.then = (res, rej) => th(r => { try { if (r && !r.error) trRecord(r.data); } catch (e) {} return res ? res(r) : r; }, rej); return fb; };
      const tupd = qb.update.bind(qb);
      qb.update = function (payload, opts) {
        const onlyData = payload && typeof payload === 'object' && 'data' in payload && Object.keys(payload).every(k => k === 'data' || k === 'booking_id' || k === 'submitted_at');
        if (!onlyData) return tupd(payload, opts);
        let id = null, other = false;
        const fb = tupd(payload, opts);
        // learn the filter: only `.eq('id', x)` takes the safe path
        const t = thenable(() => (id != null && !other && trBase[id] !== undefined)
          ? trSave(id, payload.data, Object.fromEntries(Object.entries(payload).filter(([k]) => k !== 'data')))
          : new Promise((ok, no) => fb.then(ok, no)));
        t.eq = (c, v) => { if (c === 'id' && id == null) id = v; else other = true; fb.eq(c, v); return t; };
        ['in', 'neq', 'match', 'filter', 'is', 'or'].forEach(f => { t[f] = (...a) => { other = true; fb[f](...a); return t; }; });
        return t;
      };
      const tups = qb.upsert.bind(qb);
      qb.upsert = function (values, opts) {
        const row = !Array.isArray(values) ? values : (values.length === 1 ? values[0] : null);
        if (!row || row.id == null || !row.data || trBase[row.id] === undefined) {
          const fb = tups(values, opts), th = fb.then.bind(fb);
          fb.then = (res, rej) => th(r => { try { if (r && !r.error) (Array.isArray(values) ? values : [values]).forEach(x => { if (x && x.id != null && x.data) trBase[x.id] = clone(x.data); }); } catch (e) {} return res ? res(r) : r; }, rej);
          return fb;
        }
        return thenable(() => trSave(row.id, row.data, Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'data' && k !== 'id'))));
      };
      return qb;
    }
    if (table !== 'app_store' || off()) return qb;
    const sel = qb.select.bind(qb);
    qb.select = function () {
      const fb = sel.apply(qb, arguments), keys = [];
      ['eq', 'in'].forEach(f => { const o = fb[f].bind(fb); fb[f] = function (c, v) { if (c === 'key') keys.push(...(Array.isArray(v) ? v : [v])); return o(c, v); }; });
      const th = fb.then.bind(fb);
      fb.then = (res, rej) => th(r => { try { if (r && !r.error) record(keys, r.data); } catch (e) {} return res ? res(r) : r; }, rej);
      return fb;
    };
    const ups = qb.upsert.bind(qb);
    qb.upsert = function (values, opts) {
      const rows = Array.isArray(values) ? values : [values];
      const row = rows.length === 1 ? rows[0] : null;
      if (row && row.key != null && 'value' in row && !SKIP.test(String(row.key)) && !(row.key in base) && !seeded) {
        let run = null;
        const exec = () => run || (run = waitSeed().then(() => {
          if (row.key in base) { window._sbDropped[row.key] = (window._sbDropped[row.key] || 0) + 1; console.warn('[safe-blob] dropped a save made before the data loaded:', row.key); return { data: null, error: null, status: 200 }; }
          return ups(values, opts).then(r => { try { if (r && !r.error) base[row.key] = clone(row.value); } catch (e) {} return r; });   // a new key: written as usual
        }));
        const t = { then: (a, b) => exec().then(a, b), catch: b => exec().catch(b), finally: f => exec().finally(f), select() { return t; }, single() { return t; }, maybeSingle() { return t; } };
        return t;
      }
      if (!row || row.key == null || !('value' in row) || SKIP.test(String(row.key)) || !(row.key in base)) {
        rows.forEach(r => { if (r && r.key != null && !SKIP.test(String(r.key)) && !(r.key in base)) window._sbUnprotected[r.key] = (window._sbUnprotected[r.key] || 0) + 1; });
        const fb = ups(values, opts), th = fb.then.bind(fb);
        fb.then = (res, rej) => th(r => { try { if (r && !r.error) rows.forEach(x => { if (x && x.key != null && 'value' in x) base[x.key] = clone(x.value); }); } catch (e) {} return res ? res(r) : r; }, rej);
        return fb;
      }
      let run = null;
      const exec = () => run || (run = rawSave(row.key, row.value, base[row.key]).then(res => {
        if (!res.ok) return { data: null, error: res.error || { message: 'could not save ' + row.key } };
        base[row.key] = clone(row.value);   // this tab's copy is its new starting point
        if (res.conflicts && res.conflicts.length) { try { console.warn('[safe-blob]', row.key, 'also changed elsewhere:', res.conflicts); } catch (e) {} }
        return { data: null, error: null, status: 200 };
      }));
      const t = { then: (a, b) => exec().then(a, b), catch: b => exec().catch(b), finally: f => exec().finally(f), select() { return t; }, single() { return t; }, maybeSingle() { return t; } };
      return t;
    };
    return qb;
  };
})();
