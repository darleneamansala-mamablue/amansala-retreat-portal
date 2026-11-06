// ===== guest-date-picker.js — Room List "Edit Guest" date fields open on the retreat's month (Jorge 2026-11-06) =====
// An empty check-in / check-out field opened the browser's calendar on TODAY, so staff had to change month and year by hand
// (NurrieStearns ended up "Jan 14, 2027 — Nov 20, 2026"). Now, when one of those fields is clicked while empty, it shows the
// retreat's date (check-out: the guest's own check-in + the retreat's length, or the retreat's end) so the calendar opens there;
// if the person leaves without choosing, the field goes back to empty. A check-out can't be picked before the check-in (min).
// Standalone; classic script.
(function () {
  const isDateField = el => el && el.tagName === 'INPUT' && el.type === 'date' && /^(g\d-check(in|out)|gm-check(in|out))$/.test(el.id || '');
  const bk = () => (typeof regSelBk !== 'undefined' && regSelBk) || null;
  const pairIn = el => document.getElementById(el.id.replace('checkout', 'checkin'));
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  document.addEventListener('focusin', e => {
    const el = e.target; if (!isDateField(el)) return;
    const b = bk(); const isOut = /checkout/.test(el.id);
    const ci = isOut ? ((pairIn(el) && pairIn(el).value) || (document.getElementById('gm-checkin') || {}).value || (b && b.startDate) || '') : '';
    if (isOut && ci) el.min = addDays(ci, 1);
    if (el.value) return;
    let guess = '';
    if (isOut) guess = (b && b.endDate && (!ci || b.endDate > ci)) ? b.endDate : (ci ? addDays(ci, 1) : '');
    else guess = (document.getElementById('gm-checkin') || {}).value || (b && b.startDate) || '';
    if (!guess) return;
    el.value = guess; el.dataset.prefill = guess; el.dataset.touched = '';
  });
  document.addEventListener('change', e => { const el = e.target; if (isDateField(el)) el.dataset.touched = '1'; }, true);
  document.addEventListener('focusout', e => {
    const el = e.target; if (!isDateField(el) || !el.dataset.prefill) return;
    if (!el.dataset.touched && el.value === el.dataset.prefill) el.value = '';   // only looked, didn't pick: stays empty
    delete el.dataset.prefill;
  });
})();
