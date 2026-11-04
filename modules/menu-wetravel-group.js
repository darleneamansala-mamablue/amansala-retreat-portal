// ===== menu-wetravel-group.js — one "We Travel" row on the kitchen menu (Darlene 2026-11-04) =====
// Loaded as a classic script AFTER menu.js and the other menu modules; shares global scope.
// Every We Travel booking (We Travel BBC, We Travel RNR, ...) plus Tara Nolan and Stephanie M. is ONE group, "We Travel", with one global count per meal.
// We Travel always eats Breakfast, Lunch and Dinner at the fixed We Travel times (WETRAVEL_MEAL_TIMES in menu.js), whatever Meal Plan the booking carries.
const MWT_GROUP = 'We Travel';
const MWT_EXTRA = [/^tara\s+nolan/i, /^stephanie\s+m/i];
function mwtIs(b) {
  if (!b || b.status === 'cancelled') return false;
  const nm = String(b.leaderName || b.retreatName || '');
  return b.mealPlan === 'weTravel' || /we\s*travel/i.test(nm + ' ' + (b.retreatName || '')) || MWT_EXTRA.some(r => r.test(nm));
}
if (typeof menuPopulateFromRetreats === 'function') {
  const basePopulate = menuPopulateFromRetreats;
  menuPopulateFromRetreats = function (silent) {
    const wt = (AppData.bookings || []).filter(mwtIs), saved = wt.map(b => b.mealPlan);
    // old merged rows go first so a re-run never doubles them
    Object.values(menuSchedule).forEach(day => Object.keys(day || {}).forEach(m => { if (Array.isArray(day[m])) day[m] = day[m].filter(r => r.group !== MWT_GROUP); }));
    wt.forEach(b => { b.mealPlan = 'weTravel'; });          // breakfast · lunch · dinner at the fixed We Travel times, for this run only
    try { basePopulate(true); } finally { wt.forEach((b, i) => { b.mealPlan = saved[i]; }); }
    const names = new Set(wt.map(b => b.leaderName || b.retreatName || 'Group'));
    let merged = 0;
    Object.values(menuSchedule).forEach(day => Object.keys(day || {}).forEach(m => {
      const rows = day[m]; if (!Array.isArray(rows)) return;
      const mine = rows.filter(r => names.has(r.group)); if (!mine.length) return;
      const total = mine.reduce((n, r) => n + (parseInt(r.pax, 10) || 0), 0);
      const row = Object.assign({}, mine[0], { group: MWT_GROUP, pax: String(total) });
      day[m] = rows.filter(r => !names.has(r.group)).concat(row).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      merged++;
    }));
    menuSaveSchedule(); menuRenderWeek();
    if (!silent) showToast('Populated ' + (wt.length ? 'We Travel (' + wt.length + ' bookings) and ' : '') + 'the other retreats');
  };
}
