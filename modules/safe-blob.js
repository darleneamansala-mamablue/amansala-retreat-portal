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

  window.safeBlobSave = async function (key, local, base) {
    let lastErr = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const { data: row, error: re } = await db.from('app_store').select('value,updated_at').eq('key', key).maybeSingle();
        if (re) throw re;
        const server = row ? row.value : undefined;
        const conflicts = [];
        const value = row ? merge3(base, local, server, '', conflicts) : clone(local);
        if (row && same(value, server)) return { ok: true, value, conflicts };
        const now = new Date().toISOString();
        let ok;
        if (row) {
          const { data: upd, error: ue } = await db.from('app_store').update({ value, updated_at: now }).eq('key', key).eq('updated_at', row.updated_at).select('key');
          if (ue) throw ue; ok = !!(upd && upd.length);
        } else {
          const { error: ie } = await db.from('app_store').insert({ key, value, updated_at: now });
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
})();
