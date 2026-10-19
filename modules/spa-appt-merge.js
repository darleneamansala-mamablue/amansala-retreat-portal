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
  let lastErr = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const { data: row, error: re } = await db.from('app_store').select('value,updated_at').eq('key', 'spa_appointments').maybeSingle();
      if (re) throw re;
      const server = row && Array.isArray(row.value) ? row.value : [];
      const del = new Set(deleted), chg = {}; changed.forEach(a => { chg[a.id] = a; });
      const seen = new Set();
      const merged = server.filter(a => a && !del.has(a.id)).map(a => { seen.add(a.id); return chg[a.id] || a; });
      changed.forEach(a => { if (!seen.has(a.id)) merged.push(a); });
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
        const byId = {}; merged.forEach(a => { byId[a.id] = a; });
        const next = merged.map(a => (chg[a.id] ? chg[a.id] : a));
        SpaAppointments.length = 0; next.forEach(a => SpaAppointments.push(a));
        _sam_base = _sam_snap(SpaAppointments);
        return true;
      }
      await new Promise(r => setTimeout(r, 80 + Math.random() * 220));   // someone saved at the same moment: re-read and redo
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 400)); }
  }
  console.error('[spa-appt-merge] could not save', lastErr);
  try { showToast('The spa calendar could NOT save that change. Check the connection and try again. Nothing has been lost on screen.'); } catch (e) {}
  return false;
}
