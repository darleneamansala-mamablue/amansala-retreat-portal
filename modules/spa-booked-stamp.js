// ===== spa-booked-stamp.js — "Booked Nov 9, 3:42 PM" visible on every spa calendar card and in the appointment form (Darlene 2026-11-13, urgent) =====
// Loaded as a classic script AFTER spa-booked-time.js; shares global scope. Standalone: no other module is edited. Every way an appointment is created (admin calendar, online
// booking page, Lana) already stores createdAt, so this only DISPLAYS it, in Tulum time, whoever booked and whether or not the booker is known. Cards too short for an extra line
// keep it as hover text. Appointments with no createdAt (very old ones) show "not recorded" in the form only.
(function () {
  if (typeof spaCalRender !== 'function') return;
  const fmt = iso => { try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Cancun', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  const whenOf = a => { const iso = a && (a.createdAt || a.bookedByAt); return iso ? fmt(iso) : ''; };

  function decorate() {
    try {
      document.querySelectorAll('[onclick*="spaApptShowForm(\'"]').forEach(card => {
        if (card.querySelector('.sbsStamp')) return;
        const m = (card.getAttribute('onclick') || '').match(/spaApptShowForm\('([^']+)'\)/); if (!m) return;
        const a = (typeof SpaAppointments !== 'undefined' ? SpaAppointments : []).find(x => x.id === m[1]); if (!a) return;
        const w = whenOf(a); if (!w) return;
        card.title = (card.title ? card.title + ' · ' : '') + 'Booked ' + w;
        if (card.offsetHeight < 52) return;   // too short for another line: hover only
        const el = document.createElement('div'); el.className = 'sbsStamp'; el.textContent = 'Booked ' + w;
        el.style.cssText = 'position:absolute;left:7px;bottom:3px;font-size:10px;font-weight:700;color:#1f2937;white-space:nowrap;pointer-events:none';
        card.appendChild(el);
      });
    } catch (e) {}
  }

  const origRender = window.spaCalRender;
  window.spaCalRender = function () { const out = origRender.apply(this, arguments); setTimeout(decorate, 120); setTimeout(decorate, 700); return out; };

  const origForm = window.spaApptShowForm;
  if (typeof origForm === 'function') window.spaApptShowForm = function (id) {
    const out = origForm.apply(this, arguments);
    try {
      const a = id ? SpaAppointments.find(x => x.id === id) : null, wrap = document.getElementById('spaApptHistoryWrap'); if (!wrap) return out;
      let el = document.getElementById('spaApptBookedStamp');
      if (!el) { el = document.createElement('div'); el.id = 'spaApptBookedStamp'; el.style.cssText = 'font-size:12.5px;color:#1f2937;background:#f5f1eb;border-radius:8px;padding:7px 10px;margin:8px 0'; wrap.parentNode.insertBefore(el, wrap); }
      if (!a) { el.style.display = 'none'; return out; }
      const w = whenOf(a); el.style.display = 'block';
      el.innerHTML = w ? `<b>Booked:</b> ${w} <span style="color:#4b5563">(Tulum time)</span>` : '<b>Booked:</b> time not recorded (made before this was tracked)';
    } catch (e) {}
    return out;
  };
  setTimeout(decorate, 300);
})();
