// ===== spa-tours-columns.js — each appointment shows once for people who are in both Tours and their own section =====
// Loaded as a classic script AFTER spa-tours-group.js and spa-calendar.js; shares global scope. Darlene 2026-10-22, looking at the Spa Calendar: "there are two".
// Kun, Darlene and Ryan are marked "also tours" (spa-tours-group.js), so they have a column in their own section AND in the Tours section, so a tour can be booked
// for them. Both columns used to list ALL of that person's appointments, so every appointment (e.g. Darlene's Tarot readings) appeared twice, once under Tours.
// Now, for those people only: the Tours section shows their tour appointments, and their own section shows everything else. Real tour guides (primary category
// Tours) are unchanged. Only what is drawn changes; appointments themselves, reports, payroll and the rule alerts still see everything.
function stcIsTourSvc(svc) { return !!svc && (svc.category === 'tour' || /tour|cenote|ruins|mangrov|muyil|atik|float/i.test(svc.name || '')); }

(function () {
  if (typeof spaCalSectionHtml !== 'function') return;
  const orig = window.spaCalSectionHtml;
  window.spaCalSectionHtml = function (title, cols, dateStr) {
    const all = SpaAppointments;
    try {
      const both = new Set((SpaData.therapists || []).filter(t => t.alsoTours && t.primaryCategory !== 'tours').map(t => t.id));
      if (both.size) {
        const isToursPanel = title === 'Tours', svcOf = a => (SpaData.services || []).find(s => s.id === a.serviceId);
        SpaAppointments = all.filter(a => !both.has(a.therapistId) || (stcIsTourSvc(svcOf(a)) === isToursPanel));
      }
    } catch (e) { SpaAppointments = all; }
    try { return orig.apply(this, arguments); } finally { SpaAppointments = all; }
  };
})();
