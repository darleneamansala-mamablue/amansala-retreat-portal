// Schedule class editor (Calendar > click a class): the Duration list now goes up to 4.5 hours (3, 3.5, 4 and 4.5 hours added after 2.5).
// Adds options to #skedEditClassDur; if a class already has a longer length than the list, that length is added too when the editor opens.
(function () {
  const EXTRA = [[180, '3 hours'], [210, '3.5 hours'], [240, '4 hours'], [270, '4.5 hours']];
  function add() {
    const sel = document.getElementById('skedEditClassDur');
    if (!sel) return false;
    EXTRA.forEach(([v, t]) => {
      if (![...sel.options].some(o => +o.value === v)) { const o = document.createElement('option'); o.value = String(v); o.textContent = t; sel.appendChild(o); }
    });
    return true;
  }
  if (!add()) document.addEventListener('DOMContentLoaded', add);
})();
