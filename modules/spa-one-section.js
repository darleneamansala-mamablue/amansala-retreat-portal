// ===== spa-one-section.js — one section for Spirit, Movement and Tours on the Spa Calendar =====
// Loaded as a classic script AFTER spa-tours-group.js (and spa-two-groups.js); shares global scope. Darlene 2026-10-22: "this is two times, it should only be one time —
// take the one with all the names of the therapists that do spirit or movement and tours."
// The calendar used to draw Body Work, then "Spirit or Movement", then a separate "Tours" section; Kun, Darlene and Ryan (also tours) were in both, so their columns and
// appointments showed twice. Now the two are ONE section, "Spirit, Movement & Tours", with every name once (alphabetical), and the filter buttons are Body Work and
// Spirit, Movement & Tours. Appointments, tour bookings and everything else are unchanged; only the grouping of columns changes.
(function () {
  if (typeof spaTherGroupList !== 'function') return;
  const base = window.spaTherGroupList;
  window.spaTherGroupList = function (therapists) {
    const groups = base(therapists), other = groups.find(g => g.key === 'other'), tours = groups.find(g => g.key === 'tours');
    if (!tours) return groups;
    const seen = new Set(), merged = [...(other ? other.list : []), ...tours.list].filter(t => !seen.has(t.id) && seen.add(t.id))
      .sort((a, b) => String(a.firstName || '').localeCompare(String(b.firstName || ''), undefined, { sensitivity: 'base' }));
    const out = groups.filter(g => g.key !== 'other' && g.key !== 'tours');
    out.push({ label: 'Spirit, Movement & Tours', key: 'other', list: merged });
    return out;
  };
  try {
    if (typeof SPA_CAL_FILTER_BTNS !== 'undefined') {
      for (let i = SPA_CAL_FILTER_BTNS.length - 1; i >= 0; i--) if (SPA_CAL_FILTER_BTNS[i].key === 'tours') SPA_CAL_FILTER_BTNS.splice(i, 1);
      SPA_CAL_FILTER_BTNS.forEach(b => { if (b.key === 'other') b.label = '🌿 Spirit, Movement & Tours'; });
    }
  } catch (e) {}
  try { if (typeof spaCalRenderToolbar === 'function' && document.getElementById('spaAddBtnWrap')) spaCalRenderToolbar(); } catch (e) {}
})();
