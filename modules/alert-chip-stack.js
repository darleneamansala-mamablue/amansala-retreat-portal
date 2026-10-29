// ===== alert-chip-stack.js — the three red/orange alert chips sit in one tidy, equal-width column (Darlene 2026-10-29) =====
// Loaded as a classic script AFTER tour-match-alert.js, shala-double-book-alert.js and transport-no-reservation-alert.js; shares global scope. Layout only.
// Each of those modules creates its own chip (fixed position, its own width). This puts the existing chips into one bottom-right column so they line up on the left and right edges,
// share the width of the widest one, and are evenly spaced. The chips' own counting, showing/hiding and click actions are untouched.
(function () {
  const IDS = ['sdbChip', 'tmaChip', 'tnrChip'];   // top to bottom
  function stack() {
    let box = document.getElementById('alertStack');
    if (!box) {
      if (!document.body) return;
      box = document.createElement('div'); box.id = 'alertStack';
      box.style.cssText = 'position:fixed;right:14px;bottom:60px;z-index:99990;display:flex;flex-direction:column;align-items:stretch;gap:8px;pointer-events:none';
      document.body.appendChild(box);
    }
    IDS.forEach(id => {
      const c = document.getElementById(id); if (!c) return;
      if (c.parentNode !== box) {
        c.style.position = 'static'; c.style.right = ''; c.style.bottom = ''; c.style.left = '';
        c.style.pointerEvents = 'auto'; c.style.textAlign = 'center'; c.style.boxSizing = 'border-box'; c.style.width = '100%';
      }
      box.appendChild(c);   // keeps the order above
    });
  }
  setInterval(stack, 1500); setTimeout(stack, 3000); setTimeout(stack, 9000); setTimeout(stack, 14000);
})();
