// ===== spa-booked-time.js — the booking time on every spa card (Darlene 2026-11-10) =====
// Loaded as a classic script AFTER spa-booked-by.js; shares global scope. spa-booked-by.js is not edited: after it draws "Darlene booked" on a calendar card, this adds the day and time it was
// booked ("Darlene booked · Nov 9, 3:42 PM", Tulum time). The appointment form already shows the time. Appointments made before this was tracked have no time, so nothing is added to them.
(function () {
  if (typeof sbyDecorate !== 'function') return;
  const whenOf = a => {
    const iso = a && (a.bookedByAt || a.createdAt); if (!iso) return '';
    try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Cancun', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  };
  const base = sbyDecorate;
  window.sbyDecorate = function () {
    const out = base.apply(this, arguments);
    try {
      document.querySelectorAll('[onclick*="spaApptShowForm(\'"]').forEach(card => {
        const m = (card.getAttribute('onclick') || '').match(/spaApptShowForm\('([^']+)'\)/); if (!m) return;
        const a = (SpaAppointments || []).find(x => x.id === m[1]); if (!a) return;
        const w = whenOf(a); if (!w) return;
        card.querySelectorAll('.sbyLine').forEach(el => {
          if (el.dataset.sbt) return; el.dataset.sbt = '1';
          if (el.tagName === 'SPAN') el.textContent += ' · ' + w;   // the "Darlene booked" line on the card
          el.title = (el.title ? el.title + ' · ' : '') + w;           // the initials pill: on hover
        });
      });
    } catch (e) {}
    return out;
  };
})();
