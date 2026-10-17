// ===== menu-edit-shortcut.js — an "Edit menu" button on the Menu tab that opens the Menu Editor (Darlene 2026-10-17) =====
// Loaded as a classic script near the end of the page; standalone, nothing else is edited. The Menu Editor itself lives in the sidebar
// (orange pencil, with Staff / Items / Contract Templates); this just puts a way in on the page where the menu is shown.
function menuOpenEditor() {
  const b = document.getElementById('menuEditorTabBtn');
  if (b) b.style.display = 'flex';
  if (typeof switchTab === 'function') switchTab('menueditor', b);
}
(function () {
  try {
    const bar = document.querySelector('#tab-menu > div');          // the Menu tab's top bar
    const right = bar && bar.children[1];                           // its right-hand group of buttons
    if (!right || right.querySelector('#menuEditShortcut')) return;
    const btn = document.createElement('button');
    btn.id = 'menuEditShortcut'; btn.type = 'button'; btn.onclick = menuOpenEditor;
    btn.title = 'Open the Menu Editor to change, add, remove or move dishes';
    btn.style.cssText = "display:flex;align-items:center;gap:6px;padding:7px 14px;background:#fff7ed;color:#c2410c;border:1.5px solid #fdba74;border-radius:8px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer";
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg> Edit menu';
    right.insertBefore(btn, right.firstChild);
  } catch (e) { /* never break the page */ }
})();
