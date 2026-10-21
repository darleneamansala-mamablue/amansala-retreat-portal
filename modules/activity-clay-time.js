// ===== activity-clay-time.js — Mayan Clay is always at 3:00 PM =====
// Loaded as a classic script AFTER activity-rules.js and tour-settings.js; shares global scope. Darlene 2026-10-21: "never put Mayan Clay
// at 12:30, always at 3:00". Two duplicate catalog entries ("Mayan Clay Ceremony" ao9 and "Mayan Clay" ao20) existed, and ao20's default time was
// 12:30, so retreats were getting a second Mayan Clay at 12:30. Now: (1) every Mayan Clay's default time for auto-assign is 15:00; (2) on every
// save, any Mayan Clay entry on a current or future retreat that is not at 15:00 is moved to 15:00 (this hooks cleanRetreatActivities, which
// activity-rules.js already runs on each booking right before every save). Past retreats are left alone.
// PRICE / DUPLICATE (Darlene 2026-10-21: "Mayan Clay should be 65 usd pp"): the second entry "Mayan Clay" (ao20, $85) is treated as the same activity
// as "Mayan Clay Ceremony" (ao9, $65): auto-assign no longer schedules ao20, and on save any ao20 entry on a current or future retreat becomes ao9
// (if that day already has an ao9, the extra is dropped), so there is one Mayan Clay at $65. The ao20 catalog row itself is not deleted.
const CLAY_TIME = '15:00';
function clayIsClay(aoId) {
  if (aoId === 'ao9' || aoId === 'ao20') return true;
  try { const ao = (typeof ADD_ONS !== 'undefined' ? ADD_ONS : []).find(x => x.id === aoId); return !!(ao && /^mayan clay\b/i.test(ao.name || '')); } catch (e) { return false; }
}
(function () {
  if (typeof skedTemplateForDay === 'function') {
    const origTpl = window.skedTemplateForDay;
    window.skedTemplateForDay = function () { const r = origTpl.apply(this, arguments); return Array.isArray(r) ? r.filter(t => t.aoId !== 'ao20') : r; };
  }
  if (typeof tourDefaultTime === 'function') {
    const origTime = window.tourDefaultTime;
    window.tourDefaultTime = function (aoId) { return clayIsClay(aoId) ? CLAY_TIME : origTime.apply(this, arguments); };
  }
  if (typeof cleanRetreatActivities === 'function') {
    const origClean = window.cleanRetreatActivities;
    window.cleanRetreatActivities = function (bk) {
      try {
        let moved = 0;
        const cfg = bk && bk.packageCustomPrices && bk.packageCustomPrices.__cfg__, off = (cfg && cfg.tourOff) || [];
        if (bk && Array.isArray(bk.retreatActivities) && !off.includes('ao20') && bk.retreatActivities.some(a => a && a.aoId === 'ao20')) {
          // The group wants this Mayan Clay (ao20 is on and scheduled). If the "Tours for this group" list has the other Mayan Clay (ao9) switched off —
          // which people do to get rid of the duplicate — switch it back on, otherwise the converted entry would be dropped and the group would lose Mayan Clay.
          if (cfg && off.includes('ao9')) cfg.tourOff = off.filter(x => x !== 'ao9');
          const seen = new Set(); bk.retreatActivities.forEach(a => { if (a && a.aoId === 'ao9') seen.add((a.date || '').slice(0, 10)); });
          bk.retreatActivities = bk.retreatActivities.filter(a => { if (!a || a.aoId !== 'ao20') return true; const d = (a.date || '').slice(0, 10); if (seen.has(d)) return false; a.aoId = 'ao9'; seen.add(d); return true; });
          moved++;
        }
        (bk && bk.retreatActivities || []).forEach(a => { if (a && clayIsClay(a.aoId) && a.time !== CLAY_TIME) { a.time = CLAY_TIME; moved++; } });
        if (moved) bk.retreatActivitiesUpdatedAt = bk.updatedAt = new Date().toISOString();
      } catch (e) { console.warn('[clay time]', e); }
      return origClean.apply(this, arguments);
    };
  }
})();
