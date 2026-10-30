// ===== schedule-show-pending.js — every retreat shows on the Schedule calendar, even before its schedule is confirmed (Darlene 2026-10-30) =====
// Loaded as a classic script AFTER teacher-portal.js (and extra-class.js); shares global scope. Standalone: skedGetRetreatEvents and the three calendar builders are only wrapped.
// The calendar (Day / Week / List) used to draw ONLY retreats whose schedule was confirmed, so a retreat still "pending" (schedule requested but not confirmed yet) was missing and
// the day looked empty. While the calendar is being drawn, retreats with a schedule request in ANY other status are now drawn too, with "(pending)" on the class so it is clear
// it is not confirmed. Nothing else changes: the double-booking alert, the daily briefing, printed schedules and the teacher's own pages still use confirmed schedules only,
// and no booking is changed (the status is only borrowed for the length of one call and put straight back).
(function () {
  let on = 0;
  const prev = window.skedGetRetreatEvents;
  if (typeof prev !== 'function') return;
  window.skedGetRetreatEvents = function (dateStr) {
    if (!on) return prev.apply(this, arguments);
    const borrowed = [];
    try {
      (AppData.bookings || []).forEach(b => {
        const sr = b.scheduleRequest;
        if (b.status !== 'cancelled' && sr && sr.adminStatus !== 'confirmed' && (b.bookingType || '') !== 'room_only' && dateStr >= b.startDate && dateStr <= b.endDate) borrowed.push({ b, sr, was: sr.adminStatus });
      });
      borrowed.forEach(x => { x.sr.adminStatus = 'confirmed'; });
      const evs = prev.apply(this, arguments) || [];
      const ids = new Set(borrowed.map(x => 'ret_' + x.b.id));
      evs.forEach(e => { if (e && e.id && [...ids].some(id => String(e.id).indexOf(id) === 0)) { e._pendingSchedule = true; e.title = (e.title || '') + ' (pending)'; } });
      return evs;
    } finally {
      borrowed.forEach(x => { x.sr.adminStatus = x.was; });
    }
  };
  ['skedBuild', 'skedBuildWeek', 'skedBuildList'].forEach(n => {
    const orig = window[n];
    if (typeof orig !== 'function') return;
    window[n] = function () { on++; try { return orig.apply(this, arguments); } finally { on--; } };
  });
})();
