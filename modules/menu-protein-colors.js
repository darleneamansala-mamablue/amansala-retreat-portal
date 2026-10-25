// ===== menu-protein-colors.js — each protein has its own color on the Menu (Darlene 2026-10-25) =====
// Loaded as a classic script AFTER menu.js and menu-click-edit.js; shares global scope. Standalone: menu.js is not edited. It replaces menuProteinColor() (used for the ★ mains, the dinner main
// and the cost view) so the colors are five clearly different ones, and it also tints any other dish whose name names a protein. A legend sits above the week.
//   Chicken = yellow · Shrimp = orange · Fish (pescado) = blue · Salmon = pink · Beef = red · Plant-based / tofu = green.
// A dish is matched by words in its name (English or Spanish); salmon and shrimp are checked before "fish" so they keep their own colors. To change a color or add a word, edit PC_KINDS below.
const PC_KINDS = [
  { id: 'salmon', label: 'Salmon', re: /salmon|salmón/i, bg: '#fce7f3', color: '#9d174d', border: '#f9a8d4' },
  { id: 'shrimp', label: 'Shrimp', re: /shrimp|camar[oó]n|camarones|langostino/i, bg: '#ffedd5', color: '#9a3412', border: '#fdba74' },
  { id: 'beef', label: 'Beef', re: /\bbeef\b|\bres\b|\bribs?\b|arrachera|\bcarne\b|brisket|\bsteak\b/i, bg: '#fecaca', color: '#991b1b', border: '#f87171' },
  { id: 'chicken', label: 'Chicken', re: /chicken|pollo|kebab/i, bg: '#fef08a', color: '#854d0e', border: '#facc15' },
  { id: 'fish', label: 'Fish', re: /\bfish\b|pescado|robalo|\bbasa\b|\btuna\b|at[uú]n|mahi|snapper|huachinango/i, bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
  { id: 'plant', label: 'Plant-based', re: /plant[- ]?based|tofu|phad thai/i, bg: '#dcfce7', color: '#166534', border: '#86efac' }
];
const PC_DEFAULT = { bg: '#fef9e7', color: '#78350f', border: '#fde8c8' };
function pcKind(text) {
  const s = String(text || '').replace(/★/g, '').replace(/cabbage steak|corn ribs|elote ribs/ig, '');   // vegetable dishes that borrow a meat word
  return PC_KINDS.find(k => k.re.test(s)) || null;
}
window.menuProteinColor = function (text) { const k = pcKind(text); return k ? { bg: k.bg, color: k.color, border: k.border } : PC_DEFAULT; };

function pcDecorate() {
  try {
    const grid = document.getElementById('menuGrid'), wrap = document.getElementById('menuGridWrap'); if (!grid || !wrap) return;
    grid.querySelectorAll('.menu-dish').forEach(el => {
      if (el.dataset.pc || el.style.visibility === 'hidden') return; el.dataset.pc = '1';
      if (el.style.background || el.style.backgroundColor) return;                   // ★ mains already carry their protein color
      const k = pcKind(el.textContent); if (!k) return;
      el.style.borderLeft = '4px solid ' + k.border; el.style.background = k.bg; el.style.color = k.color; el.style.paddingLeft = '6px'; el.style.borderRadius = '3px';
    });
    let lg = document.getElementById('pcLegend');
    if (!lg) {
      lg = document.createElement('div'); lg.id = 'pcLegend'; lg.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-bottom:12px;font-family:'Jost',sans-serif;font-size:12px";
      lg.innerHTML = '<b style="color:#6b7280;text-transform:uppercase;font-size:11px;letter-spacing:.5px">Protein colors</b>' + PC_KINDS.map(k => `<span style="background:${k.bg};color:${k.color};border:1.5px solid ${k.border};border-radius:99px;padding:2px 10px;font-weight:700">${k.label}</span>`).join('');
      wrap.insertBefore(lg, grid);
    }
  } catch (e) { console.warn('[menu-protein-colors]', e); }
}
(function () {
  const o = window.menuRenderWeek;
  if (typeof o === 'function') window.menuRenderWeek = function () { const r = o.apply(this, arguments); setTimeout(pcDecorate, 0); setTimeout(pcDecorate, 250); return r; };
  setTimeout(() => { try { if (document.getElementById('menuGrid') && typeof menuCurrentMonday !== 'undefined' && menuCurrentMonday) menuRenderWeek(); } catch (e) {} }, 400);
})();
