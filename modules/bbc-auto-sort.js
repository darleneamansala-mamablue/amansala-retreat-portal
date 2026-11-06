// ===== bbc-auto-sort.js — Bikini Bootcamp schedule: lines fall into clock order by themselves (Darlene 2026-11-06) =====
// Loaded as a classic script AFTER bbc-schedule.js and bbc-sort-slots.js; shares global scope. Uses that module's bbcSortDay (the "Sort by time" button), so the order is the same one.
// A day re-sorts when a time box is finished (clicking away from it, not while typing) and right after a slot, workshop or tour is added.
(function () {
  if (typeof bbcSortDay !== 'function') return;
  let quiet = false;
  const sortQuiet = (schedId, di) => { const t = window.showToast; quiet = true; try { window.showToast = function (m) { if (!/time/i.test(String(m))) return t.apply(this, arguments); }; bbcSortDay(schedId, di); } finally { window.showToast = t; quiet = false; } };
  document.addEventListener('change', e => {
    const el = e.target, on = el && el.getAttribute && el.getAttribute('oninput');
    const m = on && /bbcSlotField\('([^']+)',(\d+),(\d+),'time'/.exec(on);
    if (m) sortQuiet(m[1], +m[2]);
  }, true);
  ['bbcAddSlot', 'bbcAddWorkshop', 'bbcAddTour'].forEach(name => {
    const fn = window[name]; if (typeof fn !== 'function') return;
    window[name] = function (schedId, di) { const r = fn.apply(this, arguments); setTimeout(() => { try { sortQuiet(schedId, di); } catch (e) {} }, 0); return r; };
  });
})();
