// ===== hide-skylar-widget.js — the floating chat bubble ("Amansala Support" / Skylar) is taken out (Darlene 2026-11-05) =====
// Loaded as a classic script; style only. Teachers use the "Assistant" tab in their portal navigation (modules/retreat-assistant-tab.js) to ask questions and to add or remove rooms, so the round
// chat button in the bottom-right corner, which sat on top of other screens, is hidden everywhere. Nothing is deleted: removing this file's script tag brings the bubble back.
(function () {
  if (document.getElementById('hskCss')) return;
  const st = document.createElement('style'); st.id = 'hskCss';
  st.textContent = '#skylarWidget{display:none!important}';
  document.head.appendChild(st);
})();
