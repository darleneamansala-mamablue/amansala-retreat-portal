// ===== spa-two-groups.js — therapists grouped in two sections, each name once =====
// Loaded as a classic script AFTER spa.js and spa-calendar.js; shares global scope. Standalone: it replaces only the grouping
// function spaTherGroupList (used by the Calendar columns and the Therapists list) and renames two filter buttons. Nothing else is edited.
// Before: a therapist appeared under every category of their services (Laura under Body Workers and Spirit Workers, Sergio under
// Spirit, Fitness, Yoga and more), so names repeated.
// Now exactly two sections, Body Work first, and every therapist appears ONCE:
//   Body Work           = anyone with a massage / body-work service (or whose profile's primary category is massage)
//   Spirit or Movement  = everyone else (spirit, fitness, yoga, pilates, dance)
// A therapist with both (e.g. Laura: massage + spirit) goes under Body Work. Set a therapist's "primary category" on their profile to
// override this for one person.
const SPA2_BODY_KEY = 'massage';       // keys kept the same so the Calendar's group filter buttons keep working
const SPA2_OTHER_KEY = 'other';
function spa2IsBodyWork(t) {
  if (t.primaryCategory) return t.primaryCategory === 'massage';
  try { return spaTherCategories(t).has('massage'); } catch (e) { return false; }
}
(function () {
  if (typeof spaTherGroupList !== 'function') return;
  window.spaTherGroupList = function (therapists) {
    const body = therapists.filter(spa2IsBodyWork);
    const bodyIds = new Set(body.map(t => t.id));
    const other = therapists.filter(t => !bodyIds.has(t.id));
    return [
      { label: 'Body Work', key: SPA2_BODY_KEY, list: body },
      { label: 'Spirit or Movement', key: SPA2_OTHER_KEY, list: other },
    ].filter(g => g.list.length);
  };
  try { if (typeof SPA_GROUP_ICON !== 'undefined') { SPA_GROUP_ICON[SPA2_BODY_KEY] = '🪷'; SPA_GROUP_ICON[SPA2_OTHER_KEY] = '🌿'; } } catch (e) {}
  try {
    if (typeof SPA_CAL_FILTER_BTNS !== 'undefined') {
      SPA_CAL_FILTER_BTNS.forEach(b => {
        if (b.key === 'massage') b.label = '🪷 Body Work';
        if (b.key === 'other') b.label = '🌿 Spirit or Movement';
      });
    }
  } catch (e) {}
  try { if (typeof spaCalRenderToolbar === 'function' && document.getElementById('spaAddBtnWrap')) spaCalRenderToolbar(); } catch (e) {}
})();
