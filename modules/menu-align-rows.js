// Menu grid: every meal lines up across the 7 days. The dish list of each meal gets the height of the
// tallest day, so the retreat lines (GIH, etc.) start at the same level; the red ✕ sits at the right edge.
(function () {
  if (!document.getElementById('malCss')) {
    const st = document.createElement('style'); st.id = 'malCss';
    st.textContent = '#menuGrid .menu-dish[data-mce]{display:flex!important;align-items:flex-start;justify-content:space-between;gap:4px;white-space:normal!important}#menuGrid .menu-dish[data-mce] .mce-x{float:none;flex:none;margin-left:auto}';
    document.head.appendChild(st);
  }
  let busy = false, timer = null, obs = null;
  function align() {
    const grid = document.getElementById('menuGrid'); if (!grid || busy) return;
    busy = true; if (obs) obs.disconnect();
    try {
      const lists = [...grid.querySelectorAll('.menu-grid-cell[data-mce-meal] .menu-dish-list')];
      lists.forEach(l => { l.style.minHeight = ''; });
      const by = {};
      lists.forEach(l => { const k = l.closest('.menu-grid-cell').dataset.mceMeal; (by[k] = by[k] || []).push(l); });
      const top = l => { const c = l.closest('.menu-grid-cell'), t = c.querySelector('.menu-sched-tbl'); return t ? t.getBoundingClientRect().top - c.getBoundingClientRect().top : l.getBoundingClientRect().bottom - c.getBoundingClientRect().top; };
      for (let pass = 0; pass < 3; pass++) {
        Object.keys(by).forEach(k => {
          const offs = by[k].map(top), mx = Math.max.apply(null, offs);
          by[k].forEach((l, i) => { const d = mx - offs[i]; if (d > 0.5) l.style.minHeight = (parseFloat(l.style.minHeight) || l.getBoundingClientRect().height) + d - (getComputedStyle(l).boxSizing === 'border-box' ? 0 : (parseFloat(getComputedStyle(l).paddingTop) + parseFloat(getComputedStyle(l).paddingBottom))) * (l.style.minHeight ? 0 : 1) + 'px'; });
        });
      }
    } catch (e) { console.warn('[menu-align-rows]', e); }
    busy = false; watch();
  }
  function later() { clearTimeout(timer); timer = setTimeout(align, 120); }
  function watch() {
    const grid = document.getElementById('menuGrid'); if (!grid) return;
    if (!obs) obs = new MutationObserver(later);
    obs.observe(grid, { childList: true, subtree: true });
  }
  const orig = window.menuRenderWeek;
  if (typeof orig === 'function') window.menuRenderWeek = function () { const r = orig.apply(this, arguments); setTimeout(align, 150); setTimeout(align, 600); setTimeout(align, 2000); return r; };
  window.addEventListener('resize', later);
  try { document.fonts.ready.then(later); } catch (e) {}
  setTimeout(() => { watch(); align(); }, 800);
})();
