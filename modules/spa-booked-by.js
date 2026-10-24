// ===== spa-booked-by.js — who booked each spa appointment, by their login =====
// Loaded as a classic script AFTER spa-appt-merge.js and spa-time-blocks.js; shares global scope. Standalone: wraps spaCalSave (stamps every appointment created from
// the admin calendar in the last 3 minutes with the signed-in user's name: bookedBy / bookedByAt), spaApptShowForm (adds a "Booked by" line to the appointment form)
// and spaCalPanelHtml (hover text on each calendar card). Guest bookings made on the booking page already carry source 'guest_booking' and read "Booked online by the guest".
// Appointments made before this existed have no record and read "not recorded". Asked by Darlene 2026-10-24: "we need to see who booked the massage based on their log in".
const SBY_WINDOW_MS = 3 * 60 * 1000;
const sbyEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function sbyWho(a) {
  if (!a) return '';
  if (a.bookedBy) return a.bookedBy;
  if (a.source === 'guest_booking') return 'the guest (online)';
  return '';
}
// The words shown (Darlene 2026-10-24): "Cyan booked", "Rubi booked", "Darlene booked" for the office, and "Client booked online" when the guest booked on the booking page.
function sbyLabel(a) { const who = sbyWho(a); if (!who) return ''; return a.bookedBy ? `${a.bookedBy} booked` : 'Client booked online'; }
function sbyWhen(a) { try { return a.bookedByAt ? new Date(a.bookedByAt).toLocaleString('en-US', { timeZone: 'America/Cancun', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; } catch (e) { return ''; } }
function sbyStamp() {
  const me = (typeof getCurrentSession === 'function' && (getCurrentSession() || {}).name) || '', now = Date.now();
  if (!me) return;
  (SpaAppointments || []).forEach(a => { if (!a.bookedBy && a.source !== 'guest_booking' && a.createdAt && now - Date.parse(a.createdAt) >= 0 && now - Date.parse(a.createdAt) < SBY_WINDOW_MS) { a.bookedBy = me; a.bookedByAt = a.createdAt; } });
}

(function () {
  if (typeof spaCalSave !== 'function') return;
  const origSave = window.spaCalSave, origForm = window.spaApptShowForm, origPanel = window.spaCalPanelHtml;
  window.spaCalSave = function () { try { sbyStamp(); } catch (e) {} return origSave.apply(this, arguments); };
  if (typeof origForm === 'function') window.spaApptShowForm = function (id) {
    const out = origForm.apply(this, arguments);
    try {
      const a = id ? SpaAppointments.find(x => x.id === id) : null, wrap = document.getElementById('spaApptHistoryWrap'); if (!wrap) return out;
      let el = document.getElementById('spaApptBookedBy');
      if (!el) { el = document.createElement('div'); el.id = 'spaApptBookedBy'; el.style.cssText = 'font-size:12px;color:#4b5563;background:#f5f1eb;border-radius:8px;padding:7px 10px;margin:8px 0'; wrap.parentNode.insertBefore(el, wrap); }
      if (!a) { el.style.display = 'none'; return out; }
      const who = sbyWho(a), when = sbyWhen(a);
      el.style.display = 'block';
      el.innerHTML = who ? `<b>${sbyEsc(sbyLabel(a))}</b>${when ? ' · ' + when : ''}` : '<b>Booked by:</b> <span style="color:#9ca3af">not recorded (made before this was tracked)</span>';
    } catch (e) {}
    return out;
  };
  // Visible on the card itself (Darlene 2026-10-24): after each draw, add a small "Booked by ..." line at the bottom of every appointment card.
  // Done on the drawn page, after the other modules have decorated the cards, so it sits under their lines (e.g. "Confirmed by therapist").
  const origRender = window.spaCalRender;
  if (typeof origRender === 'function') window.spaCalRender = function () {
    const out = origRender.apply(this, arguments);
    setTimeout(sbyDecorate, 80); setTimeout(sbyDecorate, 600);
    return out;
  };
  if (typeof origPanel === 'function') window.spaCalPanelHtml = function (cols, isTher) {
    let html = origPanel.apply(this, arguments);
    try {
      (SpaAppointments || []).forEach(a => {
        const who = sbyWho(a); if (!who) return;
        const marker = `spaApptShowForm('${a.id}')" style=`;
        if (html.includes(marker)) html = html.split(marker).join(`spaApptShowForm('${a.id}')" title="${sbyEsc(sbyLabel(a))}" style=`);
      });
    } catch (e) {}
    return html;
  };
})();

function sbyDecorate() {
  try {
    document.querySelectorAll('[onclick*="spaApptShowForm(\'"]').forEach(card => {
      if (card.querySelector('.sbyLine')) return;
      const m = (card.getAttribute('onclick') || '').match(/spaApptShowForm\('([^']+)'\)/); if (!m) return;
      const a = (SpaAppointments || []).find(x => x.id === m[1]); if (!a) return;
      const who = sbyWho(a);
      const line = document.createElement('div'); line.className = 'sbyLine';
      line.style.cssText = 'font-size:9.5px;font-weight:700;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:' + (who ? '#7c3aed' : '#9ca3af');
      line.textContent = who ? sbyLabel(a) : 'Booked by: not recorded';
      card.appendChild(line);
    });
  } catch (e) {}
}
