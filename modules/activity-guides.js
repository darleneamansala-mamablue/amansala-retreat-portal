// ===== activity-guides.js — the Guide 1 / Guide 2 choices on the Activity Sheet follow the Tours guides (Darlene 2026-10-17) =====
// Loaded as a classic script AFTER activity-sheet.js and spa.js; shares global scope. Standalone: activity-sheet.js is not edited.
// The Activity Sheet's guide dropdowns used a fixed list (TOUR_GUIDE_NAMES = Marco, Yolanda, Sergio, Ryan). This keeps that list but adds
//   - everyone in the Spa calendar's Tours section (therapists whose primary category is "Tours (guides)": Yolanda, Sergio, Fernando), and
//   - anyone already assigned as a guide on any activity (so an existing assignment never disappears from its dropdown).
// The list is filled in place, so the sheet's dropdowns pick it up the next time they are drawn.
function agTitle(n) { n = String(n || '').trim(); return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''; }
function agRefreshGuides() {
  try {
    if (typeof TOUR_GUIDE_NAMES === 'undefined') return;
    const have = new Map();
    const add = n => { const t = agTitle(n); if (t && !have.has(t.toLowerCase())) have.set(t.toLowerCase(), t); };
    TOUR_GUIDE_NAMES.forEach(add);
    add('Fernando');
    try { ((typeof SpaData !== 'undefined' && SpaData.therapists) || []).filter(t => t.primaryCategory === 'tours' && t.active !== false).forEach(t => add(t.firstName)); } catch (e) {}
    try { Object.values(typeof actOpsData !== 'undefined' ? actOpsData : {}).forEach(o => { add(o && o.guide1); add(o && o.guide2); }); } catch (e) {}
    const names = [...have.values()];
    if (names.length !== TOUR_GUIDE_NAMES.length || names.some((n, i) => n !== TOUR_GUIDE_NAMES[i])) TOUR_GUIDE_NAMES.splice(0, TOUR_GUIDE_NAMES.length, ...names);
  } catch (e) { /* never break the Activity Sheet */ }
}
agRefreshGuides();
// the spa data and the saved assignments load a moment after the page: refresh a few times while they arrive
let _agTries = 0;
const _agTimer = setInterval(() => { agRefreshGuides(); if (++_agTries > 12) clearInterval(_agTimer); }, 1500);
// and just before the sheet draws its cards
(function () {
  ['actSheetRenderSummary', 'actSheetRenderWeek', 'actByRetreatRender'].forEach(n => {
    const orig = window[n]; if (typeof orig !== 'function') return;
    window[n] = function () { agRefreshGuides(); return orig.apply(this, arguments); };
  });
})();
