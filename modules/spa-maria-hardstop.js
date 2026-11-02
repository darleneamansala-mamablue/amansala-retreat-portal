// ===== spa-maria-hardstop.js — the spa calendar does not let Maria Luisa be booked past her limits =====
// Loaded as a classic script AFTER spa-therapist-rules.js; shares global scope. Wraps spaApptSave: for Maria Luisa only, a NEW booking (or one moved to her / to another
// day or time) is refused when she already has her daily maximum (default 4), or when it would start inside her 45-minute break after her first 2 services.
// Other therapists keep the old "Book it anyway?" warning from spa-therapist-rules.js. Limits come from the Auto-Assign settings (sraRot), same as the guest booking page.
// Asked by Darlene 2026-11-02: "The spa is still not blocking Maria Luisa ... when she has too many services ... it should be automatically".
(function () {
  const orig = window.spaApptSave;
  if (typeof orig !== 'function') return;
  const isMaria = t => { const R = typeof sraRot !== 'undefined' ? sraRot : {}, n = (R.mariaName || 'Maria Luisa').trim().toLowerCase(); return !!t && ((t.firstName || '').trim().toLowerCase() === n || `${(t.firstName || '').trim()} ${(t.lastName || '').trim()}`.trim().toLowerCase() === n); };
  window.spaApptSave = function () {
    try {
      const g = id => (document.getElementById(id) || {}).value;
      const id = g('spaApptId'), therId = g('spaApptTherapist'), date = g('spaApptDate'), status = g('spaApptStatus'), start = g('spaApptStart');
      const t = (SpaData.therapists || []).find(x => x.id === therId);
      if (isMaria(t) && date && start && status !== 'CANCELLED' && Array.isArray(SpaAppointments)) {
        const prev = id ? SpaAppointments.find(a => a.id === id) : null;
        const unchanged = prev && prev.therapistId === therId && prev.date === date && prev.start === start;
        if (!unchanged) {
          const R = typeof sraRot !== 'undefined' ? sraRot : {}, cap = parseInt(R.mariaDailyCap, 10) || 4, stage = parseInt(R.mariaStageSize, 10) || 2, brk = parseInt(R.mariaBreakMinutes, 10) || 45;
          const dur = parseInt(g('spaApptDuration'), 10) || 60, s0 = spaCalHHMMToMin(start);
          const others = SpaAppointments.filter(a => a.id !== id && a.date === date && a.therapistId === therId && a.status !== 'CANCELLED').sort((a, b) => spaCalHHMMToMin(a.start) - spaCalHHMMToMin(b.start));
          let msg = '';
          if (others.length >= cap) msg = `${t.firstName} ${t.lastName || ''} already has ${others.length} services that day, and her maximum is ${cap}. Please choose another therapist or another day.`;
          else if (others.length >= stage) {
            const first = others.slice(0, stage), lastEnd = Math.max(...first.map(a => spaCalHHMMToMin(a.start) + (a.duration || 60)));
            const next = others[stage], nextStart = next ? spaCalHHMMToMin(next.start) : Infinity;
            if (s0 >= lastEnd && s0 < lastEnd + brk) msg = `${t.firstName} needs a ${brk}-minute break after her first ${stage} services (she is free again at ${spaCalFmtT(String(Math.floor((lastEnd + brk) / 60)).padStart(2, '0') + ':' + String((lastEnd + brk) % 60).padStart(2, '0'))}). Please choose a later time or another therapist.`;
          }
          if (msg) { alert(msg.replace(/\s+/g, ' ').trim()); return; }
        }
      }
    } catch (e) { /* never block saving because of a bug in this check */ }
    return orig.apply(this, arguments);
  };
})();
