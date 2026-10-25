// ===== menu-sticky-days.js — the day names stay frozen at the top of the Menu page while you scroll (Darlene 2026-10-25) =====
// Loaded as a classic script; styles only, no other module is edited. The week grid clipped its contents (overflow:hidden for the rounded corners), which stops anything inside
// from sticking, so the clipping is lifted and the corner rounding is moved onto the first and last day header instead.
(function () {
  if (document.getElementById('msdCss')) return;
  const st = document.createElement('style'); st.id = 'msdCss';
  st.textContent = '#menuGrid .menu-week-grid{overflow:visible}' +
    '#menuGrid .menu-week-grid>.menu-day-header{position:sticky;top:0;z-index:5;box-shadow:0 2px 4px rgba(0,0,0,.18)}' +
    '#menuGrid .menu-week-grid>.menu-day-header:first-child{border-top-left-radius:12px}' +
    '#menuGrid .menu-week-grid>.menu-day-header:nth-child(7){border-top-right-radius:12px}';
  document.head.appendChild(st);
})();
