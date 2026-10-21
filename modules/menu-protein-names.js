// ===== menu-protein-names.js — "Filete de Mero" name, and frozen fish for tacos =====
// Loaded as a classic script AFTER menu.js and menu-variants.js; shares global scope. Darlene 2026-10-21:
//  1. Where the cost list says "Filete Fresco de Róbalo Nacional" it should say "Filete de Mero" (a new supplier price list is coming, so only the
//     name changes here; the price stays whatever is saved until she uploads it). The id stays 'robalo', so day assignments keep working.
//     menu.js's default list is updated too; this also renames copies already saved in a browser or in the shared cost list.
//  2. "When it is tacos it is frozen fish": on a day whose midday star dish is fish tacos (Tacos Negros de Pez), the protein costed for midday is
//     the frozen fish ('basa', Filete Congelado de Basa), whatever is saved for that day. The saved day assignments were still from before the
//     menu was re-ordered (tacos now fall on Sunday, where chicken was saved), so a fixed saved mapping can't be trusted for tacos.
const MPN_FROZEN_FISH = 'basa';

// Only the old róbalo entry is renamed, never other fresh fish.
function mpnFixNames() {
  try { (menuProteinPrices || []).forEach(p => { if (p && (p.id === 'robalo' || /^filete fresco de r[oó]balo/i.test(p.name || ''))) p.name = 'Filete de Mero'; }); } catch (e) {}
}
function mpnIsFishTacos(text) { const s = String(text || '').toLowerCase(); return /taco/.test(s) && /\b(pez|pescado|fish)\b/.test(s); }

(function () {
  if (typeof menuRenderCostPanel === 'function') {
    const origRender = window.menuRenderCostPanel;
    window.menuRenderCostPanel = function () { mpnFixNames(); return origRender.apply(this, arguments); };
  }
  if (typeof menuLoadCostData === 'function') {
    const origLoad = window.menuLoadCostData;
    window.menuLoadCostData = function () { const r = origLoad.apply(this, arguments); mpnFixNames(); return r; };
  }
  if (typeof menuAssignForIdx === 'function') {
    const origAssign = window.menuAssignForIdx;
    window.menuAssignForIdx = function (di) {
      const a = origAssign.apply(this, arguments);
      try {
        const day = menuDataForIdx(di) || {};
        const star = ((day.lunch || []).find(d => String(d).includes('★')) || (day.brunch || []).find(d => String(d).includes('★')) || '');
        if (mpnIsFishTacos(star)) return Object.assign({}, a, { midday: MPN_FROZEN_FISH });
        if (mpnIsFishTacos(day.dinner && day.dinner.protein)) return Object.assign({}, a, { dinner: MPN_FROZEN_FISH });
      } catch (e) {}
      return a;
    };
  }
})();
