// ===== spa-confirm-label.js — who confirmed a spa service: the THERAPIST or STAFF =====
// Loaded as a classic script AFTER staff-confirm-portal.js (and spa.js / spa-calendar.js); shares global scope. Standalone: it wraps a few
// existing functions and decorates the screens afterwards; nothing else is edited.
// Why: the calendar showed the same green check whether the therapist confirmed from their own login or staff clicked it for them (or the
// booking status "Confirmed" auto-ticked it), so nobody could tell if the therapist really knows about the service.
// What it does:
//   - records WHO confirmed on the appointment (confirmedByRole: 'therapist' | 'staff') whenever a confirmation is made or removed
//   - therapist confirms from their own login (?mode=confirm) -> 'therapist'; admin calendar / dashboard / Confirm tab / saving a booking
//     with status Confirmed -> 'staff'
//   - Calendar block: ✅ + "Confirmed by therapist" for a real therapist confirmation; ☑️ + "Confirmed by staff, not yet by therapist" for staff
//   - Dashboard and Confirm tab buttons: "✓ Confirmed by therapist" / "✓ Confirmed by staff"
// Services confirmed before this change have no recorded role: they show "Confirmed" with "(who not recorded)" instead of guessing.

function sclRole(a) {
  if (!a || !a.confirmed) return null;
  return a.confirmedByRole || 'unknown';
}
function sclLabel(a) {
  const r = sclRole(a);
  if (r === 'therapist') return 'Confirmed by therapist';
  if (r === 'staff') return 'Confirmed by staff';
  if (r === 'unknown') return 'Confirmed (who not recorded)';
  return '';
}
function sclTitle(a) {
  const r = sclRole(a);
  const when = a.confirmedAt ? ' on ' + new Date(a.confirmedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const by = a.confirmedBy ? ' (' + a.confirmedBy + ')' : '';
  if (r === 'therapist') return 'Confirmed by the therapist' + by + when;
  if (r === 'staff') return 'Confirmed by staff' + by + when + ' — the therapist has not confirmed this themselves';
  if (r === 'unknown') return 'Confirmed' + by + when + ' — who confirmed it was not recorded';
  return 'Not yet confirmed by the therapist';
}
function sclAppt(id) { try { return (SpaAppointments || []).find(x => x.id === id); } catch (e) { return null; } }

// Therapist signed in on their own confirm page (not an admin, not staff acting for them)
function sclIsTherapistLogin(appt) {
  try {
    if (typeof IS_STAFF_CONFIRM_MODE === 'undefined' || !IS_STAFF_CONFIRM_MODE) return false;
    const s = typeof getStaffConfirmSession === 'function' ? getStaffConfirmSession() : null;
    if (!s || !s.name) return false;
    const t = (SpaData.therapists || []).find(x => x.id === appt.therapistId);
    const mine = t ? String(t.firstName || '').trim().toLowerCase() : '';
    const who = String(s.name).trim().toLowerCase();
    return !!mine && (who === mine || who === (mine + ' ' + String(t.lastName || '').trim().toLowerCase()).trim());
  } catch (e) { return false; }
}
function sclStamp(appt, role) {
  if (!appt) return;
  if (appt.confirmed) { appt.confirmedByRole = role; } else { appt.confirmedByRole = null; }
}

// ---- decorate the screens ----
function sclDecorate() {
  try {
    // Calendar blocks (therapist columns carry the check icon)
    document.querySelectorAll('[ondragstart^="spaCalDragStart"]').forEach(box => {
      const m = /spaCalDragStart\(event,'([^']+)'\)/.exec(box.getAttribute('ondragstart') || '');
      const a = m && sclAppt(m[1]);
      const icon = box.querySelector('[onclick*="spaCalToggleApptConfirm"]');
      if (!a || !icon) return;
      const r = sclRole(a);
      icon.textContent = r === 'therapist' ? '✅' : '⏳';   // only the therapist's own confirmation counts as confirmed
      icon.title = sclTitle(a) + (a.confirmed ? ' — click to unconfirm' : ' — click to confirm on their behalf');
      box.querySelectorAll('.scl-label').forEach(x => x.remove());
      if ((a.confirmed || r !== 'therapist') && box.offsetHeight > 44 && a.confirmed) {
        const d = document.createElement('div');
        d.className = 'scl-label';
        d.style.cssText = 'font-size:9.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:' + (r === 'therapist' ? '#15803d' : '#92400e');
        d.textContent = r === 'therapist' ? 'Confirmed by therapist' : 'Not confirmed';
        box.appendChild(d);
      }
    });
    // Dashboard and Confirm tab buttons
    document.querySelectorAll('button[onclick*="spaDashToggleConfirm"]').forEach(btn => {
      const m = /spaDashToggleConfirm\('([^']+)'\)/.exec(btn.getAttribute('onclick') || '');
      const a = m && sclAppt(m[1]);
      if (!a || !a.confirmed) return;
      const r = sclRole(a);
      btn.textContent = r === 'therapist' ? '✓ Confirmed by therapist' : 'Not confirmed';
      btn.title = sclTitle(a);
      btn.style.whiteSpace = 'normal';
      btn.style.lineHeight = '1.25';
      if (r !== 'therapist') { btn.style.background = '#fef3c7'; btn.style.borderColor = '#fcd34d'; btn.style.color = '#92400e'; }
    });
  } catch (e) { /* never break the screen */ }
}

(function () {
  const wrapAfter = (name, fn) => {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () { const r = orig.apply(this, arguments); try { fn.apply(this, arguments); } catch (e) {} return r; };
  };
  // redraws: decorate after
  ['spaCalRender', 'spaRenderDashboard', 'spaRenderConfirmations'].forEach(n => wrapAfter(n, () => setTimeout(sclDecorate, 0)));

  // therapist's own login or admin: scConfirmSpa toggles; stamp who did it, save, redraw
  const origConfirm = window.scConfirmSpa;
  if (typeof origConfirm === 'function') {
    window.scConfirmSpa = async function (apptId, who) {
      const res = await origConfirm.apply(this, arguments);
      try {
        const a = sclAppt(apptId);
        if (a) {
          sclStamp(a, sclIsTherapistLogin(a) ? 'therapist' : 'staff');
          if (typeof spaCalSave === 'function') await spaCalSave();
          if (typeof scTeamRefreshWhicheverView === 'function') scTeamRefreshWhicheverView();
          setTimeout(sclDecorate, 0);
        }
      } catch (e) {}
      return res;
    };
  }
  // admin Dashboard / Confirm tab toggle: always staff
  const origDash = window.spaDashToggleConfirm;
  if (typeof origDash === 'function') {
    window.spaDashToggleConfirm = async function (apptId) {
      const res = await origDash.apply(this, arguments);
      try {
        const a = sclAppt(apptId);
        if (a) { sclStamp(a, 'staff'); if (typeof spaCalSave === 'function') await spaCalSave(); setTimeout(sclDecorate, 0); }
      } catch (e) {}
      return res;
    };
  }
  // saving a booking with status Confirmed auto-ticks the confirmation: that is staff, not the therapist
  const origSave = window.spaApptSave;
  if (typeof origSave === 'function') {
    window.spaApptSave = function () {
      const started = Date.now() - 2000;
      const res = origSave.apply(this, arguments);
      setTimeout(() => {
        try {
          let changed = false;
          (SpaAppointments || []).forEach(a => {
            if (a.confirmed && !a.confirmedByRole && a.confirmedAt && new Date(a.confirmedAt).getTime() >= started) { a.confirmedByRole = 'staff'; changed = true; }
          });
          if (changed && typeof spaCalSave === 'function') spaCalSave();
          sclDecorate();
        } catch (e) {}
      }, 600);
      setTimeout(() => { try { let c = false; (SpaAppointments || []).forEach(a => { if (a.confirmed && !a.confirmedByRole && a.confirmedAt && new Date(a.confirmedAt).getTime() >= started) { a.confirmedByRole = 'staff'; c = true; } }); if (c && typeof spaCalSave === 'function') spaCalSave(); sclDecorate(); } catch (e) {} }, 2500);
      return res;
    };
  }
  setTimeout(sclDecorate, 800);
})();
