// ===== menu-wetravel-group.js — one "We Travel" row on the kitchen menu (Darlene 2026-11-04) =====
// Loaded as a classic script AFTER menu.js and the other menu modules; shares global scope.
// Every We Travel booking (We Travel BBC, We Travel RNR, ...) plus Tara Nolan and Stephanie M. is ONE group, "We Travel", with one global count per meal.
// Light breakfast is ONE general count for every group that has it (34 people), not a row per group (Darlene 2026-11-04). Only light breakfast.
// We Travel always eats Breakfast, Lunch and Dinner at the fixed We Travel times (WETRAVEL_MEAL_TIMES in menu.js), whatever Meal Plan the booking carries.
const MWT_GROUP = 'We Travel';
const MWT_LB = 'All groups';
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
    // only the week on screen is rebuilt, so only its days are touched; old merged rows go first so a re-run never doubles them
    const days = [];
    if (menuCurrentMonday) for (let i = 0; i < 7; i++) { const d = new Date(menuCurrentMonday + 'T12:00:00'); d.setDate(d.getDate() + i); days.push(d.toISOString().split('T')[0]); }
    const weekDays = () => days.map(d => menuSchedule[d]).filter(Boolean);
    weekDays().forEach(day => Object.keys(day).forEach(m => { if (Array.isArray(day[m])) day[m] = day[m].filter(r => r.group !== MWT_GROUP && !(m === 'lightBreakfast' && r.group === MWT_LB)); }));
    wt.forEach(b => { b.mealPlan = 'weTravel'; });          // breakfast · lunch · dinner at the fixed We Travel times, for this run only
    try { basePopulate(true); } finally { wt.forEach((b, i) => { b.mealPlan = saved[i]; }); }
    const names = new Set(wt.map(b => b.leaderName || b.retreatName || 'Group'));
    const total = rows => rows.reduce((n, r) => n + (parseInt(r.pax, 10) || 0), 0);
    weekDays().forEach(day => Object.keys(day).forEach(m => {
      let rows = day[m]; if (!Array.isArray(rows)) return;
      const mine = rows.filter(r => names.has(r.group));
      if (mine.length) rows = rows.filter(r => !names.has(r.group)).concat(Object.assign({}, mine[0], { group: MWT_GROUP, pax: String(total(mine)) }));
      if (m === 'lightBreakfast' && rows.length) {
        const first = rows.slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''))[0];
        rows = [Object.assign({}, first, { group: MWT_LB, pax: String(total(rows)) })];
      }
      day[m] = rows.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    }));
    menuSaveSchedule(); menuRenderWeek();
    if (!silent) showToast('Populated the retreats for this week');
  };
}
