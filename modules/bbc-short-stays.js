// ===== bbc-short-stays.js — short stays and "just choose the dates" on the New BBC Schedule form (Darlene 2026-10-25) =====
// Loaded as a classic script AFTER bbc-schedule.js; shares global scope. Standalone: bbc-schedule.js is not edited. The form only offered 4, 5 or 6 nights.
//   - Adds "2 Days" (1 night), "2 Nights" and "3 Nights" in front of them (copies of the "4 Nights" button).
//   - Adds a "Departure date" field under the Arrival date: pick the two dates and the number of nights is worked out (and the matching button is ticked);
//     pick a button instead and the departure date fills in. Any length works (a button is added on the fly for lengths that have none).
// The builder handles any length (arrival day, full days, departure morning). A 2-day stay is arrival day + departure morning; 2 nights adds one full day (no offsite dinner).
// Fewer than 3 guests still gets the simpler one-fitness-class afternoons.
const BSS_LABELS = { 1: '2 Days', 2: '2 Nights', 3: '3 Nights' };
const bssRadio = n => document.querySelector('input[name="bbcNights"][value="' + n + '"]');
function bssMakeRadio(n, before) {
  const four = bssRadio(4), lab = four && four.closest('label'); if (!lab) return null;
  const c = lab.cloneNode(true), i = c.querySelector('input'); i.value = String(n); i.checked = false; c.lastChild.textContent = ' ' + (BSS_LABELS[n] || n + ' Nights');
  c.style.padding = '10px 8px'; lab.parentNode.insertBefore(c, before === undefined ? lab : before); return i;
}
function bssAdd() {
  const four = bssRadio(4), lab = four && four.closest('label'); if (!lab) return;
  if (!bssRadio(2)) { [3, 2, 1].forEach(n => bssMakeRadio(n)); lab.parentNode.querySelectorAll('label').forEach(l => { l.style.padding = '10px 8px'; }); }
  if (document.getElementById('bssEnd')) return;
  const start = document.getElementById('bbcNewStart'), box = start && start.parentElement; if (!box) return;
  const wrap = document.createElement('div'), l0 = box.querySelector('label');
  wrap.innerHTML = '<label style="' + (l0 ? l0.getAttribute('style') : '') + '">Departure date (optional — or choose the nights below)</label><input type="date" id="bssEnd" onchange="bssEndChange()" style="' + start.getAttribute('style') + '">';
  box.insertAdjacentElement('afterend', wrap);
}
const bssDays = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const bssAddDays = (a, n) => new Date(Date.parse(a + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
function bssEndChange() {
  const s = document.getElementById('bbcNewStart').value, e = document.getElementById('bssEnd').value; if (!s || !e) return;
  const n = bssDays(s, e);
  if (n < 1 || n > 30) { showToast('The departure date must be after the arrival date (up to 30 nights).'); document.getElementById('bssEnd').value = ''; return; }
  let r = bssRadio(n);
  if (!r) { const four = bssRadio(4), lab = four && four.closest('label'); r = bssMakeRadio(n, null); if (r && lab) lab.parentNode.appendChild(r.closest('label')); }
  if (r) r.checked = true;
  if (typeof bbcUpdateNights === 'function') bbcUpdateNights();
}
(function () {
  if (typeof bbcShowNewForm === 'function') {
    const o = window.bbcShowNewForm;
    window.bbcShowNewForm = function () {
      const r = o.apply(this, arguments);
      try {
        bssAdd(); const e = document.getElementById('bssEnd'); if (e) e.value = '';
        document.querySelectorAll('input[name="bbcNights"]').forEach(i => { const l = i.closest('label'); if (l && !(i.value in { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 })) l.remove(); });   // drop on-the-fly lengths from last time
        const five = bssRadio(5); if (five) five.checked = true;
      } catch (err) { console.warn('[bbc-short-stays]', err); }
      return r;
    };
  }
  if (typeof bbcUpdateNights === 'function') {                    // a button or the arrival date changed: keep the departure date in step
    const o = window.bbcUpdateNights;
    window.bbcUpdateNights = function () {
      const r = o.apply(this, arguments);
      try {
        const s = document.getElementById('bbcNewStart').value, e = document.getElementById('bssEnd'), c = document.querySelector('input[name="bbcNights"]:checked');
        if (e && s && c) e.value = bssAddDays(s, parseInt(c.value, 10));
      } catch (err) {}
      return r;
    };
  }
})();
