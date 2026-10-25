// ===== menu-sticky-days.js — the day names stay frozen at the top of the Menu page while you scroll (Darlene 2026-10-25) =====
// Loaded as a classic script; no other module is edited. The first version made the day headers "sticky" inside the week grid, but a header inside a CSS grid can only stick within its own
// row, so nothing was frozen. Now: after the week is drawn, a copy of the 7 day headers is placed in a bar ABOVE the grid that sticks to the top of the Menu scroll area, and the grid's
// own header row is hidden (still in the page, so click-to-edit and printing keep finding it). Clicking a frozen day still prints that day. Same column widths as the grid below.
(function () {
  if (!document.getElementById('msdCss')) {
    const st = document.createElement('style'); st.id = 'msdCss';
    st.textContent = '.msd-bar{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:repeat(7,minmax(140px,1fr));gap:1px;background:#d4cfca;border:1px solid #d4cfca;border-bottom:0;border-radius:12px 12px 0 0;overflow:hidden;box-shadow:0 3px 6px rgba(0,0,0,.2)}' +
      '.msd-bar .msd-head{background:#1a2332;color:#fff;padding:10px 8px;text-align:center}' +
      '.menu-week-grid.msd-on{border-top-left-radius:0;border-top-right-radius:0}' +
      '.menu-week-grid.msd-on>.menu-day-header{display:none}';
    document.head.appendChild(st);
  }
  function msdBuild() {
    try {
      const grid = document.querySelector('#menuGrid .menu-week-grid'); if (!grid || grid.classList.contains('msd-on')) return;
      const heads = [...grid.querySelectorAll(':scope>.menu-day-header')]; if (heads.length !== 7) return;
      const bar = document.createElement('div'); bar.className = 'msd-bar';
      bar.innerHTML = heads.map(h => h.outerHTML.replace('menu-day-header', 'msd-head')).join('');
      grid.parentNode.insertBefore(bar, grid); grid.classList.add('msd-on');
    } catch (e) { console.warn('[menu-sticky-days]', e); }
  }
  const o = window.menuRenderWeek;
  if (typeof o === 'function') window.menuRenderWeek = function () { const r = o.apply(this, arguments); setTimeout(msdBuild, 0); return r; };
  setTimeout(msdBuild, 0);
})();
