// ===== mobile-layout.js — the portal on a phone (Darlene 2026-10-25) =====
// Loaded as a classic script LAST; shares global scope. Standalone: only adds styles that apply on screens 820px wide or less (phones, small tablets) plus a menu button; a computer screen is unchanged.
//   - The left menu becomes a slide-out drawer opened with the ☰ button at the top-left (it used to squeeze the page into a sliver); choosing a section closes it.
//   - Pages use the full width with smaller padding; wide tables and grids (Schedule, Room Calendar, Menu, reports) scroll sideways inside their own area instead of stretching the page.
//   - Pop-ups fill the screen, inputs are big enough to tap without the phone zooming in, buttons wrap, and the floating team buttons shrink.
(function () {
  if (document.getElementById('mlCss')) return;
  const css = `
@media (max-width: 820px) {
  html, body { overflow-x: hidden; }
  .app-header { padding: 8px 10px 8px 54px !important; gap: 6px; position: relative; }
  .app-brand { font-size: 18px !important; }
  .app-header .app-nav, .app-header #staffUserBadge { flex-wrap: wrap; }
  #staffUserBadge { padding: 4px 8px !important; font-size: 11.5px !important; }
  #mlBurger { display: flex !important; }
  #appBody { padding-left: 0 !important; }
  #sideNav, .tab-bar { position: fixed !important; top: 0 !important; bottom: 0 !important; left: -270px !important; width: 250px !important; z-index: 100000 !important; transition: left .22s ease; box-shadow: none; padding-top: 52px; }
  #sideNav.ml-open, .tab-bar.ml-open { left: 0 !important; box-shadow: 6px 0 24px rgba(0,0,0,.45); }
  .tab-bar .tab-label, .tab-bar .tab-bar-toggle-label { display: inline !important; }
  .tab-bar .tab-btn { justify-content: flex-start !important; padding: 13px 16px !important; font-size: 14px !important; }
  .tab-bar .tab-bar-toggle { display: none !important; }
  #mlBackdrop.ml-open { display: block; }
  .tab-panel { min-width: 0; }
  .tab-panel > div, .panel-toolbar { min-width: 0; }
  .reg-panel, .builder-right, #dbContent, .act-feed, .panel-body { padding: 12px !important; }
  .panel-toolbar { padding: 10px 12px !important; flex-wrap: wrap; gap: 8px; }
  .panel-toolbar h2 { font-size: 18px !important; }
  [style*="padding:28px 36px"], [style*="padding:24px 28px"], [style*="padding: 28px 36px"] { padding: 12px !important; }
  [style*="grid-template-columns"]:not(.menu-week-grid):not(.msd-bar) { grid-template-columns: 1fr !important; }
  [style*="min-width:340px"], [style*="min-width: 340px"] { min-width: 0 !important; }
  table { max-width: 100%; }
  .ml-scroll { overflow-x: auto !important; -webkit-overflow-scrolling: touch; max-width: 100%; }
  #menuGridWrap, .gantt-scroll, #skedGrid, .sked-wrap, #rcWrap, #spaContent, #reportsContent { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
  .modal, .modal-overlay > div { width: 100vw !important; max-width: 100vw !important; max-height: 100vh !important; border-radius: 0 !important; }
  #qpModal > div, #hcAlertModal > div, #sdbModal > div { max-width: 100vw !important; max-height: 100vh !important; border-radius: 12px !important; padding: 14px !important; }
  input:not(#menuGrid input), select:not(#menuGrid select), textarea:not(#menuGrid textarea) { font-size: 16px !important; }
  .tab-panel > div:nth-child(-n+3) { flex-wrap: wrap !important; }
  button, .btn, .tab-btn { min-height: 38px; }
  #qpBar { left: 8px !important; right: 8px; bottom: 8px !important; flex-wrap: wrap; justify-content: flex-start; }
  #qpBar button { padding: 7px 10px !important; font-size: 12px !important; }
  #hcAlertChip, #sdbChip, #hcAlertChipWrap { left: 8px !important; font-size: 11.5px !important; padding: 6px 10px !important; }
  #hcAlertChip { bottom: 96px !important; }
  .menu-week-grid, .msd-bar { min-width: 980px; }
  #mmrBar { gap: 4px 10px !important; padding: 6px 10px !important; }
  .kpi-row, .db-kpis { flex-wrap: wrap; }
}
#mlBurger { display: none; position: fixed; top: 7px; left: 8px; z-index: 100001; width: 40px; height: 40px; align-items: center; justify-content: center; border-radius: 10px; border: 1.5px solid rgba(255,255,255,.35); background: #1a2332; color: #fff; font-size: 22px; line-height: 1; cursor: pointer; }
#mlBackdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 99999; }
`;
  const st = document.createElement('style'); st.id = 'mlCss'; st.textContent = css; document.head.appendChild(st);
  const burger = document.createElement('button'); burger.id = 'mlBurger'; burger.type = 'button'; burger.setAttribute('aria-label', 'Menu'); burger.textContent = '☰';
  const back = document.createElement('div'); back.id = 'mlBackdrop';
  document.body.appendChild(burger); document.body.appendChild(back);
  const nav = () => document.getElementById('sideNav') || document.querySelector('.tab-bar');
  const toggle = on => { const n = nav(); if (!n) return; const open = on == null ? !n.classList.contains('ml-open') : on; n.classList.toggle('ml-open', open); back.classList.toggle('ml-open', open); burger.textContent = open ? '✕' : '☰'; };
  burger.addEventListener('click', () => toggle());
  back.addEventListener('click', () => toggle(false));
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.tab-bar .tab-btn'); if (b && window.innerWidth <= 820) setTimeout(() => toggle(false), 60); });
  // wide tables get their own sideways scroll on phones
  const wrapTables = () => { if (window.innerWidth > 820) return; document.querySelectorAll('.tab-panel.active table, .modal table').forEach(t => { const p = t.parentElement; if (p && !p.classList.contains('ml-scroll') && !p.closest('.ml-scroll') && t.scrollWidth > (p.clientWidth || 0) + 2) p.classList.add('ml-scroll'); }); };
  setInterval(wrapTables, 1500);
  // the tab-bar's own "collapsed" memory must not leave the drawer narrow
  document.body.addEventListener('click', () => { const n = nav(); if (n && window.innerWidth <= 820) n.classList.remove('collapsed'); }, true);
})();
