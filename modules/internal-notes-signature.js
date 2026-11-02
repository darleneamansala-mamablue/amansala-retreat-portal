// ===== internal-notes-signature.js — internal notes say who wrote them =====
// Loaded as a classic script AFTER booking-detail.js; shares global scope. Standalone: wraps bdSaveInternalNotes. When the Internal Notes box is saved with a change, the text is
// signed at the end with the signed-in name and date, e.g. "Coming to celebrate her birthday — Darlene, Nov 2". A note that already ends with a signature is left as it is, so
// editing a signed note does not stack signatures. Notes written before this have no signature; the Dashboard shows them as "(writer not recorded)".
// Asked by Darlene 2026-11-02: "Notes should say who wrote the notes, but it needs to be visible from the arrival dashboard".
(function () {
  const orig = window.bdSaveInternalNotes;
  if (typeof orig !== 'function') return;
  const SIG = /—\s*[^—\n]+,\s*[A-Z][a-z]{2}\s+\d{1,2}\s*$/;
  window.bdSaveInternalNotes = function () {
    try {
      const ta = document.getElementById('bdInternalNotes');
      if (ta) {
        const cur = String(ta.value || '').trim();
        const prev = String(_bdKind === 'req' ? ((_bdReqCache && _bdReqCache.internalNotes) || '') : ((AppData.regs.find(r => r.id === _bdId) || {}).internalNotes || '')).trim();
        if (cur && cur !== prev && !SIG.test(cur)) {
          const me = (typeof getCurrentSession === 'function' && (getCurrentSession() || {}).name) || 'Staff';
          const when = new Date(Date.now() - 5 * 3600 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
          ta.value = cur + ' — ' + me + ', ' + when;
        }
      }
    } catch (e) { /* never block saving a note */ }
    return orig.apply(this, arguments);
  };
})();
