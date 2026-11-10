// ===== daily-shalas-bbc.js — Bikini Bootcamp classes on the Daily Shalas page (Darlene 2026-11-09) =====
// Loaded as a classic script AFTER daily-shalas.js and the bbc-* modules; shares global scope. daily-shalas.js is not edited: its dsClasses() is wrapped so the page also lists the
// confirmed Bikini Bootcamp classes of the day (yoga, fitness, workshops... every line held in a shala), in the same time order, with the same Start / Finish buttons.
// The team taps Start and Finish; the page keeps who did it (from their login) and how long it took, per class, exactly as it does for retreat classes.
(function () {
  if (typeof dsClasses !== 'function') return;
  const SHALAS = ['beachfront', 'grande', 'heaven', 'chica', 'skye'];
  const hhmm = (h, m) => String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  const bump = (t, add) => { const [h, m] = t.split(':').map(Number); return hhmm(h + add, m); };
  function bbcClasses(date) {
    const out = [];
    (typeof bbcSchedules !== 'undefined' ? bbcSchedules : []).forEach(s => {
      if (s.status !== 'confirmed') return;
      const day = (s.days || []).find(d => d.date === date); if (!day) return;
      (day.slots || []).forEach((slot, si) => {
        if (slot.type === 'meal' || /^meet /i.test(slot.location || '')) return;
        const shala = typeof bbcLocToShalaId === 'function' ? bbcLocToShalaId(slot.location) : null;
        if (!shala || !SHALAS.includes(shala)) return;
        const r = typeof bbcSlotTimeRange === 'function' ? bbcSlotTimeRange(slot.time, 45) : null; if (!r) return;
        let start = r.start, end = r.end;
        const h = +start.slice(0, 2);
        if (slot.pm && h >= 7 && h < 12) { start = bump(start, 12); end = bump(end, 12); }
        out.push({ id: 'bbc_' + s.id + '_' + shala + '_' + start.replace(':', '') + '_' + si, start, end, who: slot.activity || 'Class', what: 'Bikini Bootcamp' + (slot.instructor ? ' — ' + slot.instructor : ''), shala: typeof dsShala === 'function' ? dsShala(shala) : shala, need: '' });
      });
    });
    return out;
  }
  const base = dsClasses;
  window.dsClasses = function (date) {
    const list = base.apply(this, arguments);
    try { return list.concat(bbcClasses(date)).sort((a, b) => String(a.start).localeCompare(String(b.start))); } catch (e) { console.warn('[daily-shalas-bbc]', e); return list; }
  };
})();
