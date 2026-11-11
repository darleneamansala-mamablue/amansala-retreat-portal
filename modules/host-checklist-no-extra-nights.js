// Host checklist list: leaves off "Extra Night" stays (a guest staying on after a retreat), We Travel groups, and retreats whose
// end date has passed (the list used to keep them 3 more days). Checked every time the list is drawn, so it stays current by itself.
// Wraps hcRetreats; nothing is saved or deleted.
(function () {
  if (typeof hcRetreats !== 'function') return;
  const orig = window.hcRetreats;
  const isWeTravel = b => typeof mwtIs === 'function' ? mwtIs(b) : /we\s*travel/i.test(String(b.leaderName || '') + ' ' + String(b.retreatName || ''));
  window.hcRetreats = function () {
    const today = typeof hcToday === 'function' ? hcToday() : new Date().toISOString().slice(0, 10);
    return (orig.apply(this, arguments) || []).filter(b =>
      String(b.retreatName || '').trim().toLowerCase() !== 'extra night' &&
      !isWeTravel(b) &&
      String(b.endDate).slice(0, 10) >= today);
  };
})();
