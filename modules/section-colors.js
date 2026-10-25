// ===== section-colors.js — every part of the portal has its own color (Darlene 2026-10-25) =====
// Loaded as a classic script LAST; shares global scope. Standalone: only adds styles and sets a color on each sidebar button. Nothing is moved or renamed.
//   - In the left menu each section's icon is its own color, and the section you are in is highlighted in that color.
//   - A colored band runs across the top of the section you are in, so you always know where you are (Menu orange, Spa pink, Transport blue ...).
// To change a color, edit the list below (tab id -> color). Sections not in the list get a color of their own automatically.
const SC_COLORS = {
  dashboard: '#2d6a6a', pipeline: '#7c3aed', 'booking-engine': '#0369a1', reservations: '#0891b2', menu: '#ea580c', actsheet: '#65a30d', venues: '#4f46e5', roomcal: '#be185d',
  teacherreg: '#c026d3', teacherprofiles: '#a21caf', builder: '#b45309', datefinder: '#0d9488', skedda: '#dc2626', transport: '#2563eb', housekeeping: '#059669', events: '#d97706',
  spa: '#db2777', bbcsched: '#0e7490', confirmations: '#16a34a', wetravel: '#9333ea', guestchat: '#0284c7', reports: '#475569', settings: '#64748b', activity: '#78716c',
  items: '#ca8a04', commissions: '#15803d', contractlib: '#6d28d9', menueditor: '#f97316', botlogadmin: '#0f766e', hostchecklist: '#d97706'
};
const SC_AUTO = ['#e11d48', '#0891b2', '#7c3aed', '#16a34a', '#ea580c', '#2563eb', '#c026d3', '#ca8a04', '#0d9488', '#be123c'];
function scColorFor(key) { if (SC_COLORS[key]) return SC_COLORS[key]; let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return SC_AUTO[h % SC_AUTO.length]; }
function scTabOf(b) {
  const o = b.getAttribute('onclick') || '', m = /switchTab\('([a-z-]+)'/.exec(o);
  if (m) return m[1]; if (/hcOpen/.test(o)) return 'hostchecklist'; return b.id || '';
}
(function () {
  if (!document.getElementById('scCss')) {
    const st = document.createElement('style'); st.id = 'scCss';
    st.textContent = '.tab-bar .tab-btn{--sec:#94a3b8}' +
      '.tab-bar .tab-btn svg{color:var(--sec)!important;opacity:1!important}' +
      '.tab-bar .tab-btn.active{background:color-mix(in srgb,var(--sec) 24%,transparent)!important;border-left-color:var(--sec)!important}' +
      '.tab-bar .tab-btn:hover{background:color-mix(in srgb,var(--sec) 14%,transparent)}' +
      '.tab-panel.active::before{content:"";display:block;height:5px;flex:0 0 5px;background:var(--sec-now,#2d6a6a)}' +
      '#mlBurger{border-color:var(--sec-now,#2d6a6a)!important}';
    document.head.appendChild(st);
  }
  function paint() {
    try {
      document.querySelectorAll('.tab-bar .tab-btn').forEach(b => { const k = scTabOf(b); if (k && b.dataset.sc !== k) { b.dataset.sc = k; b.style.setProperty('--sec', scColorFor(k)); } });
      const p = document.querySelector('.tab-panel.active'); if (!p) return;
      const id = p.id.replace(/^tab-/, ''), c = scColorFor(id);
      if (document.body.style.getPropertyValue('--sec-now') !== c) document.body.style.setProperty('--sec-now', c);
    } catch (e) {}
  }
  if (typeof switchTab === 'function') { const o = window.switchTab; window.switchTab = function () { const r = o.apply(this, arguments); setTimeout(paint, 0); return r; }; }
  setInterval(paint, 700); setTimeout(paint, 300);
})();
