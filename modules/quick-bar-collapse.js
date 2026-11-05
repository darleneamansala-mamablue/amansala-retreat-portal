// ===== quick-bar-collapse.js — the 🔥 Fire Pit / ✅ Checklist / ➕ Add class / 💵 Group tip buttons are folded away until you want them (Darlene 2026-11-05) =====
// Loaded as a classic script AFTER team-quick-panel.js and mobile-layout.js; shares global scope. Style and one small toggle only: the buttons, and what they open, are not touched.
// The bar (#qpBar) used to sit across the bottom-left of every retreat screen and cover the page ("we do not need this set up all the time"). It now starts folded behind one small "Tools" button;
// click it to show the four buttons, click again to fold them. The choice is remembered on that device.
(function () {
  if (document.getElementById('qpbCss')) return;
  const st = document.createElement('style'); st.id = 'qpbCss';
  st.textContent = '#qpBar.qpb-closed{display:none!important}' +
    '#qpToggle{position:fixed;left:14px;bottom:14px;z-index:99991;display:none;padding:7px 14px;border-radius:99px;border:1.5px solid #c8bfb5;background:#fff;color:#374151;font:700 12.5px Jost,sans-serif;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.18)}' +
    '#qpToggle.qpb-up{bottom:64px}' +
    '@media(max-width:700px){#qpToggle{left:8px;bottom:8px}#qpToggle.qpb-up{bottom:104px}}';
  document.head.appendChild(st);
  const isOpen = () => { try { return localStorage.getItem('qp_bar_open') === '1'; } catch (e) { return false; } };
  function sync() {
    try {
      const bar = document.getElementById('qpBar'); let t = document.getElementById('qpToggle');
      if (!t) { t = document.createElement('button'); t.id = 'qpToggle'; t.onclick = () => { try { localStorage.setItem('qp_bar_open', isOpen() ? '0' : '1'); } catch (e) {} sync(); }; document.body.appendChild(t); }
      const has = !!bar && bar.style.display === 'flex';          // team-quick-panel shows the bar only when a retreat is open
      t.style.display = has ? 'block' : 'none';
      if (!bar) return;
      const open = isOpen(); bar.classList.toggle('qpb-closed', !open);
      t.classList.toggle('qpb-up', open); t.textContent = open ? 'Tools ▾' : '🧰 Tools ▸';
      t.title = open ? 'Fold the Fire Pit, Checklist, Add class and Group tip buttons' : 'Show Fire Pit, Checklist, Add class and Group tip';
    } catch (e) {}
  }
  setInterval(sync, 700); setTimeout(sync, 300);
})();
