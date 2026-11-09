// ===== spa-appt-merge.js — spa appointments can never be lost by a save (Darlene 2026-10-19, urgent) =====
// Root cause: spaCalSave() upserted this tab's WHOLE appointment list over the saved one, so any tab holding an older copy wiped every
// appointment made elsewhere since it loaded (real report: Magda Wojtowicz's two massages were charged to her folio but gone from the calendar).
// Now every save is a compare-and-swap on the saved row, and only THIS tab's own changes are applied to the latest saved list:
//   1. read the saved list and its updated_at;  2. apply this tab's added / edited / deleted appointments to it (everyone else's stay);
//   3. write it back only if updated_at is still the one we read. If someone saved in between, nothing is written: re-read and redo (up to 12 tries).
// A tab that can't save says so on screen and keeps its changes to retry; it never silently drops them. Standalone; wraps spaCalLoad / spaCalSave.
let _sam_base = {};            // id -> JSON of each appointment as last loaded or saved (to know what THIS tab changed)
const _sam_snap = list => { const m = {}; (list || []).forEach(a => { if (a && a.id) m[a.id] = JSON.stringify(a); }); return m; };
const _sam_origLoad = spaCalLoad;
spaCalLoad = async function () { await _sam_origLoad(); _sam_base = _sam_snap(SpaAppointments); };
let _sam_busy = Promise.resolve();
spaCalSave = function () { _sam_busy = _sam_busy.then(_sam_save, _sam_save); return _sam_busy; };   // one save at a time in this tab
async function _sam_save() {
  const local = SpaAppointments || [];
  const changed = local.filter(a => a && a.id && _sam_base[a.id] !== JSON.stringify(a));
  const localIds = new Set(local.map(a => a && a.id));
  const deleted = Object.keys(_sam_base).filter(id => !localIds.has(id));
  if (!changed.length && !deleted.length) return true;
  // Copies, taken now: an appointment can change WHILE this save is on its way (the room charge right after "Save" sets folioStatus
  // POSTED a moment later). The old code then counted that later change as saved without ever writing it -- 63 hotel appointments
  // were charged to the folio but still read "not charged" (Connie Smith, Jorge 2026-11-09).
  const copy = {}; changed.forEach(a => { copy[a.id] = JSON.parse(JSON.stringify(a)); });
  let lastErr = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const { data: row, error: re } = await db.from('app_store').select('value,updated_at').eq('key', 'spa_appointments').maybeSingle();
      if (re) throw re;
      const server = row && Array.isArray(row.value) ? row.value : [];
      const del = new Set(deleted), chg = {}; changed.forEach(a => { chg[a.id] = JSON.parse(JSON.stringify(copy[a.id])); });
      const seen = new Set();
      // an appointment changed here AND by someone else: merged field by field (Jorge 2026-11-07), not this tab's copy over theirs
      const conflicts = [];
      const merged = server.filter(a => a && !del.has(a.id)).map(a => {
        seen.add(a.id);
        if (!chg[a.id]) return a;
        if (typeof safeBlobMerge !== 'function' || !_sam_base[a.id]) return chg[a.id];
        const m = safeBlobMerge(JSON.parse(_sam_base[a.id]), chg[a.id], a); conflicts.push(...m.conflicts); return m.value;
      });
      changed.forEach(a => { if (!seen.has(a.id)) merged.push(chg[a.id]); });
      let ok = false;
      if (row) {
        const { data: upd, error: ue } = await db.from('app_store').update({ value: merged, updated_at: new Date().toISOString() }).eq('key', 'spa_appointments').eq('updated_at', row.updated_at).select('key');
        if (ue) throw ue;
        ok = !!(upd && upd.length);
      } else {
        const { error: ie } = await db.from('app_store').insert({ key: 'spa_appointments', value: merged, updated_at: new Date().toISOString() });
        if (ie) throw ie; ok = true;
      }
      if (ok) {   // refresh this tab with what is now saved, keeping the objects other code is holding wherever this tab changed them
        const live = {}; changed.forEach(a => { live[a.id] = a; });
        // keep the objects other code is holding; fields changed on them since the copy stay changed and go out with the next save
        const next = merged.map(a => {
          const l = live[a.id];
          if (!l) return a;
          if (JSON.stringify(copy[a.id]) === JSON.stringify(a)) return l;
          const since = {}; Object.keys(l).forEach(k => { if (JSON.stringify(l[k]) !== JSON.stringify(copy[a.id][k])) since[k] = l[k]; });
          Object.keys(l).forEach(k => delete l[k]); Object.assign(l, a, since);
          return l;
        });
        if (conflicts.length) { try { showToast('Saved ✓ — someone else was editing the same appointment; both changes were combined (' + conflicts.slice(0, 2).join(', ') + ' kept as yours).'); } catch (e) {} }
        SpaAppointments.length = 0; next.forEach(a => SpaAppointments.push(a));
        _sam_base = _sam_snap(merged);   // what is really saved now -- not this tab's list, which may already hold newer changes
        try { fetch('/.netlify/functions/spa-alerts-now-background', { method: 'POST' }).catch(() => {}); } catch (e) {}   // spa WhatsApp alerts at once (Jorge 2026-11-05)
        return true;
      }
      await new Promise(r => setTimeout(r, 80 + Math.random() * 220));   // someone saved at the same moment: re-read and redo
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 400)); }
  }
  console.error('[spa-appt-merge] could not save', lastErr);
  try { showToast('The spa calendar could NOT save that change. Check the connection and try again. Nothing has been lost on screen.'); } catch (e) {}
  return false;
}
