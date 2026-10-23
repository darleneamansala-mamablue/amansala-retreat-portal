// ===== spa-therapist-done.js — a service the therapist marked counts as done for payroll and the reports =====
// Loaded as a classic script AFTER spa.js and spa-confirm-label.js; shares global scope. Darlene 2026-10-22: "the therapist marks it complete." A therapist marks a service from their own
// login (?mode=confirm); that saves a confirmed check on the appointment (confirmed: true, confirmedByRole: 'therapist') but never changed its status, and Spa > Payroll and the Dashboard's
// daily report only counted status COMPLETED, so therapist marks never reached payroll (the last 55 services all sat at "Confirmed" and showed $0 owed).
// (Rule since 2026-10-23, see spaIsDone below: a service whose time has passed counts unless cancelled.) A service counts as DONE when its status is Completed OR the therapist confirmed it themselves (confirmedByRole 'therapist'). A check put on by staff, or one with no recorded role,
// does not count: staff ticking it only means the booking is confirmed, and the Day Report lists those as "not yet marked by the therapist" so someone can chase them.
// Nothing is saved or changed on the appointments; only what payroll and the reports count.
// Darlene 2026-10-23: nobody should have to mark a service completed. Once its time has passed it counts as done, unless it was cancelled
// (a no-show, or a booking still waiting for payment, also doesn't count). Tulum is UTC-5 all year. A therapist's own confirmation still counts even before the end time.
function spaTimePassed(a) {
  if (!a || !a.date) return false;
  const start = Date.parse(a.date + 'T' + (a.start || '00:00') + ':00-05:00'); if (isNaN(start)) return false;
  return start + (a.duration || 60) * 60000 <= Date.now();
}
function spaIsDone(a) {
  if (!a) return false;
  if (a.status === 'COMPLETED') return true;
  if (a.status === 'CANCELLED' || a.status === 'NO_SHOW' || a.status === 'PAYMENT_PENDING') return false;
  return spaTimePassed(a) || (a.confirmed === true && a.confirmedByRole === 'therapist');
}
const sdnAsCompleted = a => (spaIsDone(a) && a.status !== 'COMPLETED') ? { ...a, status: 'COMPLETED' } : a;

(function () {
  // Spa > Payroll reads the global SpaAppointments directly: hand it a copy in which therapist-marked services read as Completed, for the duration of the call
  if (typeof spaRenderPayrollTable === 'function') {
    const orig = window.spaRenderPayrollTable;
    window.spaRenderPayrollTable = function () {
      const real = SpaAppointments;
      try { SpaAppointments = real.map(sdnAsCompleted); return orig.apply(this, arguments); } finally { SpaAppointments = real; }
    };
  }
  // Dashboard daily report takes the day's appointments as an argument
  if (typeof spaDailyReportHtml === 'function') {
    const orig = window.spaDailyReportHtml;
    window.spaDailyReportHtml = function (todays) { return orig.call(this, (todays || []).map(sdnAsCompleted)); };
  }
})();
