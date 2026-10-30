// Menu saves one at a time. A new menu edit waits until the previous save has finished,
// so quick back-to-back edits can't overwrite each other. If a save does not go through,
// say so clearly and show what is really saved.
(function () {
  let inflight = Promise.resolve();
  const origLoad = window.mceLoadState, origCommit = window.mceCommit;
  if (typeof origLoad !== 'function' || typeof origCommit !== 'function') return;
  window.mceLoadState = async function () {
    try { await inflight; } catch (e) {}
    return origLoad.apply(this, arguments);
  };
  window.mceCommit = function () {
    const args = arguments, before = (typeof _meLoadedAt !== 'undefined') ? _meLoadedAt : null;
    const p = (async () => {
      let err = null;
      try { await origCommit.apply(null, args); } catch (e) { err = e; }
      const saved = !err && typeof _meLoadedAt !== 'undefined' && _meLoadedAt !== before;
      if (!saved) {
        try { alert('⚠ That menu change was NOT saved' + (err ? ' (' + (err.message || err) + ')' : '') + '.\n\nThe menu will now show what is really saved. Please make the change again.'); } catch (e) {}
        try { await meLoadAndApply(); } catch (e) {}
        try { if (typeof menuRenderWeek === 'function' && menuCurrentMonday) menuRenderWeek(); } catch (e) {}
      }
    })();
    inflight = p;
    return p;
  };
})();
