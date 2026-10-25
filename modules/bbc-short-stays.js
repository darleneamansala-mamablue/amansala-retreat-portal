// ===== bbc-short-stays.js — 2-night and 3-night options on the New BBC Schedule form (Darlene 2026-10-25: a guest who is only here two nights) =====
// Loaded as a classic script AFTER bbc-schedule.js; shares global scope. Standalone: bbc-schedule.js is not edited. The form only offered 4, 5 or 6 nights; this adds "2 Nights" and
// "3 Nights" in front of them by copying the "4 Nights" button. The schedule builder already works for any length (arrival day, full days, departure morning), so a 2-night stay is
// arrival day + one full day + departure morning (no offsite dinner). Fewer than 3 guests still gets the simpler one-fitness-class afternoons.
function bssAdd() {
  const four = document.querySelector('input[name="bbcNights"][value="4"]'), lab = four && four.closest('label'); if (!lab || document.querySelector('input[name="bbcNights"][value="2"]')) return;
  [3, 2].forEach(n => {
    const c = lab.cloneNode(true), i = c.querySelector('input'); i.value = String(n); i.checked = false; c.lastChild.textContent = ' ' + n + ' Nights';
    lab.parentNode.insertBefore(c, lab);
  });
  lab.parentNode.querySelectorAll('label').forEach(l => { l.style.padding = '10px 8px'; });
}
(function () {
  if (typeof bbcShowNewForm !== 'function') return;
  const o = window.bbcShowNewForm;
  window.bbcShowNewForm = function () { const r = o.apply(this, arguments); try { bssAdd(); } catch (e) { console.warn('[bbc-short-stays]', e); } return r; };
})();
