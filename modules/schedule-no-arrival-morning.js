// ===== schedule-no-arrival-morning.js — a retreat has NO morning class on the day it arrives (Darlene 2026-10-30) =====
// Loaded as a classic script AFTER teacher-portal.js, extra-class.js and schedule-show-pending.js; shares global scope. Standalone: skedGetRetreatEvents is only wrapped.
// The calendar drew a morning "Opening Class" on a retreat's arrival day whenever the retreat had no evening Arrival Class (Beth Stuart, Nov 1: Chica 8:00 AM) — but the guests are
// still arriving that day, so no morning class can run. The teacher's own day-by-day schedule already says "Arrival day — no morning classes"; this makes the calendar, the daily
// briefing and the shala double-booking alert agree with it. A class an admin has deliberately set for that morning (it shows "(time changed)") is kept.
(function () {
  const prev = window.skedGetRetreatEvents;
  if (typeof prev !== 'function') return;
  window.skedGetRetreatEvents = function () {
    const evs = prev.apply(this, arguments) || [];
    try { return evs.filter(e => !(e && typeof e.id === 'string' && /_morn_arr$/.test(e.id) && !/\(time changed\)/.test(e.subtitle || ''))); }
    catch (err) { return evs; }
  };
})();
