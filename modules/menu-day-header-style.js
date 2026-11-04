// ===== menu-day-header-style.js — Menu day headers: white background, black words, bigger type (Darlene 2026-11-04) =====
// Loaded as a classic script; style only. Covers the headers in the week grid and the frozen copy above it (menu-sticky-days.js).
// Weekday 10 -> 14 px, date 14 -> 18 px, "Day n" 9 -> 13 px. Today keeps a teal line under it so it still stands out.
(function () {
  if (document.getElementById('mdhCss')) return;
  const st = document.createElement('style'); st.id = 'mdhCss';
  st.textContent = '.menu-day-header,.msd-bar .msd-head{background:#fff!important;color:#000!important;border-bottom:2px solid #d4cfca}' +
    '.menu-day-today .menu-day-header,.menu-day-today.msd-head,.msd-head.menu-day-today{border-bottom:3px solid var(--teal,#2d6a6a)}' +
    '.menu-day-header .menu-day-name,.msd-head .menu-day-name{font-size:14px!important;opacity:1!important;color:#000!important}' +
    '.menu-day-header .menu-day-date,.msd-head .menu-day-date{font-size:18px!important;color:#000!important}' +
    '.menu-day-header div[style*="font-size:9px"],.msd-head div[style*="font-size:9px"]{font-size:13px!important;opacity:1!important;color:#000!important}' +
    '.menu-day-header svg,.msd-head svg{opacity:.8!important;color:#000!important}';
  document.head.appendChild(st);
})();
