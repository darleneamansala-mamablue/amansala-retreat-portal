// ===== contract-no-season-labels.js — contracts no longer print "High Season / Low Season" (Darlene 2026-10-28) =====
// Loaded as a classic script AFTER every other contract module; shares global scope. Standalone: only wraps generateContractHTML / generateContractText.
// Removes the season badge under the title and the "— Low Season (Jun – Sep)" / "— High Season (Oct – May)" part of headings, in the contract on screen,
// the teacher portal, Download PDF / Print and the copied text. The rates themselves still follow the season of the retreat's dates; only the label is dropped.
(function () {
  const html = h => h
    .replace(/<div[^>]*>\s*<span[^>]*>\s*(?:LOW|HIGH) SEASON RATES\s*<\/span>\s*<\/div>/gi, '')
    .replace(/\s*[—–-]\s*(?:High|Low) Season\s*(?:\([^)]*\))?(?=\s*<)/gi, '');
  const text = t => t.replace(/\s*—\s*(?:HIGH|LOW) SEASON(?:\s*\([^)]*\))?/g, '');
  const wrap = (name, fn) => {
    const prev = window[name];
    if (typeof prev !== 'function') return;
    window[name] = function () {
      const out = prev.apply(this, arguments);
      try { return typeof out === 'string' ? fn(out) : out; } catch (e) { console.warn('[contract-no-season-labels]', e); return out; }
    };
  };
  wrap('generateContractHTML', html);
  wrap('generateContractText', text);
})();
