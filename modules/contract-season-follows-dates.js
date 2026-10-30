// ===== contract-season-follows-dates.js — an unsigned contract switches High/Low Season when the retreat dates change (Darlene 2026-10-30) =====
// Loaded as a classic script AFTER contract-library-link.js; shares global scope. Standalone: only clcTemplateFor is wrapped.
// A contract that was SENT keeps a frozen copy (snapshot) of the template it was sent with. If the dates are then moved into the other season
// (High Oct–May, Low Jun–Sep) and the contract is NOT signed, that frozen copy is out of date: it is dropped and the contract follows the
// active template for the new season. A SIGNED contract is never touched. A frozen copy for the same season is kept as before.
(function () {
  const prev = window.clcTemplateFor;
  if (typeof prev !== 'function') return;
  const wrapped = function (bk, isLow) {
    try {
      const snap = _clcSnaps[bk.id];
      if (snap && !bk.contractSignedAt && (snap.type === 'retreat-high' || snap.type === 'retreat-low') && snap.type !== (isLow ? 'retreat-low' : 'retreat-high')) clcDropSnapshot(bk);
    } catch (e) { console.warn('[contract-season-follows-dates]', e); }
    return prev.apply(this, arguments);
  };
  window.clcTemplateFor = wrapped;
  try { clcTemplateFor = wrapped; } catch (e) {}
})();
