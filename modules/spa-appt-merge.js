// ===== spa-appt-merge.js — stop spa appointments from vanishing (Darlene 2026-10-19) =====
// Root cause: spaCalSave() upserts this tab's WHOLE appointment list over the saved one. Any tab holding an older copy (a calendar left open,
// the staff portal, a phone) wipes every appointment made elsewhere since it loaded. Real report: Magda Wojtowicz's two Mayan Healing massages
// (15:24 and 15:31) had their folio charges written but the appointments were gone from spa_appointments.
// Fix (same idea as the spa_data merge in spa.js): right before saving, re-read the saved list and keep any appointment this tab never saw.
// An appointment this tab knew about and no longer has was deleted here on purpose, so it stays deleted. Standalone; wraps spaCalLoad / spaCalSave.
let _sam_known = null;         // ids this tab has seen (loaded or saved)
const _sam_origLoad = spaCalLoad, _sam_origSave = spaCalSave;
spaCalLoad = async function () { await _sam_origLoad(); _sam_known = new Set((SpaAppointments || []).map(a => a.id)); };
spaCalSave = async function () {
  try {
    if (_sam_known) {
      const { data } = await db.from('app_store').select('value').eq('key', 'spa_appointments').maybeSingle();
      const server = (data && Array.isArray(data.value)) ? data.value : [];
      const have = new Set(SpaAppointments.map(a => a.id));
      const rescued = server.filter(a => a && a.id && !have.has(a.id) && !_sam_known.has(a.id));
      if (rescued.length) { SpaAppointments.push(...rescued); console.info('[spa-appt-merge] kept ' + rescued.length + ' appointment(s) made elsewhere'); }
    }
  } catch (e) { console.warn('[spa-appt-merge]', e); }
  await _sam_origSave();
  _sam_known = new Set((SpaAppointments || []).map(a => a.id));
};
