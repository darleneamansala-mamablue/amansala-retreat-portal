// ===== spa-tours-group.js — a "Tours" section on the spa calendar for the tour guides (Darlene 2026-10-16) =====
// Loaded as a classic script AFTER spa-two-groups.js; shares global scope. Standalone: it wraps the grouping function and adds one filter
// button; nothing else is edited.
// A therapist whose profile "Primary category" is "Tours (guides)" is taken out of Body Work / Spirit or Movement and shown once in their
// own third section, Tours. Set it on the profile: Spa > Therapists > edit > Primary category. The guides are Yolanda, Sergio, Fernando and Ignacia.
// A therapist with alsoTours: true (Kun, Darlene, Ryan) is shown in Tours AND stays in their own section.
const SPA_TOURS_KEY = 'tours';
(function () {
  if (typeof spaTherGroupList !== 'function') return;
  const base = window.spaTherGroupList;
  window.spaTherGroupList = function (therapists) {
    // Tours section = people whose primary category is Tours (they leave the other sections) plus people marked alsoTours (Kun, Darlene, Ryan:
    // they stay in their usual section too, so a tour can be booked for them and their other bookings show in both places).
    const guides = therapists.filter(t => t.primaryCategory === SPA_TOURS_KEY || t.alsoTours);
    const rest = base(therapists.filter(t => t.primaryCategory !== SPA_TOURS_KEY));
    if (!guides.length) return rest;
    guides.sort((a, b) => String(a.firstName || '').localeCompare(String(b.firstName || ''), undefined, { sensitivity: 'base' }));
    return rest.concat([{ label: 'Tours', key: SPA_TOURS_KEY, list: guides }]);
  };
  try { if (typeof SPA_GROUP_ICON !== 'undefined') SPA_GROUP_ICON[SPA_TOURS_KEY] = '🧭'; } catch (e) {}
  try {
    if (typeof SPA_CAL_FILTER_BTNS !== 'undefined' && !SPA_CAL_FILTER_BTNS.some(b => b.key === SPA_TOURS_KEY)) SPA_CAL_FILTER_BTNS.push({ key: SPA_TOURS_KEY, label: '🧭 Tours' });
  } catch (e) {}
  // "Spirit or Movement" must not also pull in the Tours section (it used to mean "everything that is not Body Work")
  if (typeof spaCalGroupMatchesFilter === 'function') {
    const baseMatch = spaCalGroupMatchesFilter;
    window.spaCalGroupMatchesFilter = function (groupKey) {
      if (typeof spaCalGroupFilter !== 'undefined' && spaCalGroupFilter === 'other') return groupKey === 'other';
      return baseMatch(groupKey);
    };
  }
  try { if (typeof spaCalRenderToolbar === 'function' && document.getElementById('spaAddBtnWrap')) spaCalRenderToolbar(); } catch (e) {}
})();
