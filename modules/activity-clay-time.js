// ===== activity-clay-time.js — Mayan Clay is always at 3:00 PM =====
// Loaded as a classic script AFTER activity-rules.js and tour-settings.js; shares global scope. Darlene 2026-10-21: "never put Mayan Clay
// at 12:30, always at 3:00". Two duplicate catalog entries ("Mayan Clay Ceremony" ao9 and "Mayan Clay" ao20) existed, and ao20's default time was
// 12:30, so retreats were getting a second Mayan Clay at 12:30. Now: (1) every Mayan Clay's default time for auto-assign is 15:00; (2) on every
// save, any Mayan Clay entry on a current or future retreat that is not at 15:00 is moved to 15:00 (this hooks cleanRetreatActivities, which
// activity-rules.js already runs on each booking right before every save). Past retreats are left alone.
const CLAY_TIME = '15:00';
function clayIsClay(aoId) {
  if (aoId === 'ao9' || aoId === 'ao20') return true;
  try { const ao = (typeof ADD_ONS !== 'undefined' ? ADD_ONS : []).find(x => x.id === aoId); return !!(ao && /^mayan clay\b/i.test(ao.name || '')); } catch (e) { return false; }
}
(function () {
  if (typeof tourDefaultTime === 'function') {
    const origTime = window.tourDefaultTime;
    window.tourDefaultTime = function (aoId) { return clayIsClay(aoId) ? CLAY_TIME : origTime.apply(this, arguments); };
  }
  if (typeof cleanRetreatActivities === 'function') {
    const origClean = window.cleanRetreatActivities;
    window.cleanRetreatActivities = function (bk) {
      try {
        let moved = 0;
        (bk && bk.retreatActivities || []).forEach(a => { if (a && clayIsClay(a.aoId) && a.time !== CLAY_TIME) { a.time = CLAY_TIME; moved++; } });
        if (moved) bk.retreatActivitiesUpdatedAt = bk.updatedAt = new Date().toISOString();
      } catch (e) { console.warn('[clay time]', e); }
      return origClean.apply(this, arguments);
    };
  }
})();
