// ===== hide-fire-pit.js — the Fire Pit buttons and bar are taken off the screens (Darlene 2026-11-05: "please remove the fire pit") =====
// Loaded as a classic script; style only. Hides (does not delete): the "🔥 Fire Pit  none set / Set nights" bar inside the retreat window, the 🔥 Fire Pit quick button, and the Fire Pit sidebar tab.
// Nothing saved is touched: Fire Pit nights already set on a retreat stay in the data and on the calendar, so this is fully undoable by removing this file's script tag.
(function () {
  if (document.getElementById('hfpCss')) return;
  const st = document.createElement('style'); st.id = 'hfpCss';
  st.textContent = '#regFirePitBox,#firepitTabBtn,#qpBar button[onclick*="qpShow(\'fire\')"]{display:none!important}';
  document.head.appendChild(st);
})();
