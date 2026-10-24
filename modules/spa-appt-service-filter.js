// ===== spa-appt-service-filter.js — New/Edit Appointment: the Service list only shows what the therapists really offer =====
// Loaded as a classic script AFTER spa-calendar.js and spa-booked-by.js; shares global scope. Standalone: wraps spaApptShowForm and spaApptOnTherapistChange.
// Before: the Service pull-down listed every active service, including leftover duplicates with no therapist (a second "Tarot Card Reading", "90 Minute Massage", ...).
// Pick one of those and the Therapist list came up empty (Darlene 2026-10-24: "I can not choose a therapist"). Now:
//  - a service nobody active offers is not listed (when editing an appointment that already has one, that one stays so it can still be opened);
//  - once a therapist is picked (e.g. by clicking in their column), the list is only that therapist's services; a service they don't offer is cleared.
// The Therapist list keeps its own rule (active therapists who offer the chosen service). Nothing is saved or changed in the data.
function sasOffered(t) { return new Set((t.services || []).map(s => s.serviceId)); }

function sasFilter(keepServiceId, strict) {   // strict: the user just picked a therapist, so drop the current service if that therapist doesn't offer it
  const svcSel = document.getElementById('spaApptService'), therSel = document.getElementById('spaApptTherapist');
  if (!svcSel || typeof SpaData === 'undefined') return;
  const active = (SpaData.therapists || []).filter(t => t.active);
  const therId = therSel ? therSel.value : '', ther = therId ? active.find(t => t.id === therId) : null;
  const anyOffer = new Set(); active.forEach(t => sasOffered(t).forEach(id => anyOffer.add(id)));
  const mine = ther ? sasOffered(ther) : null;
  const current = keepServiceId != null ? keepServiceId : svcSel.value;
  const list = (SpaData.services || []).filter(s => s.active && ((!strict && current === s.id) || (anyOffer.has(s.id) && (!mine || mine.has(s.id)))));
  const keep = list.some(s => s.id === current) ? current : '';
  svcSel.innerHTML = '<option value="">— Select —</option>' + list.map(s => `<option value="${s.id}" ${keep === s.id ? 'selected' : ''}>${String(s.name).replace(/</g, '&lt;')}</option>`).join('');
  svcSel.value = keep;
  return keep;
}

(function () {
  if (typeof spaApptShowForm !== 'function') return;
  const origShow = window.spaApptShowForm, origTher = window.spaApptOnTherapistChange;
  window.spaApptShowForm = function (id) {
    const out = origShow.apply(this, arguments);
    try {
      const a = id ? (SpaAppointments || []).find(x => x.id === id) : null, before = document.getElementById('spaApptService')?.value || '';
      sasFilter(a ? a.serviceId : before);
      if (typeof spaApptOnServiceChange === 'function' && !a) spaApptOnServiceChange();   // refresh price + therapist list for whatever is selected now
    } catch (e) {}
    return out;
  };
  if (typeof origTher === 'function') window.spaApptOnTherapistChange = function () {
    const out = origTher.apply(this, arguments);
    try {
      const had = document.getElementById('spaApptService')?.value || '', now = sasFilter(undefined, true);
      if (had && !now && typeof spaApptOnServiceChange === 'function') spaApptOnServiceChange();   // their list doesn't include the service: cleared, so refresh price/therapists
    } catch (e) {}
    return out;
  };
})();
