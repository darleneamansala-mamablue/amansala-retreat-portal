// ===== bbc-meet-on-beach.js — Bikini Bootcamp schedule: where to meet (Darlene 2026-11-06) =====
// The Beach Walk and Mayan Clay say "Meet on the beach"; tours say "Meet in reception".
// Loaded as a classic script AFTER bbc-schedule.js and bbc-room-availability.js; shares global scope. bbc-schedule.js is not edited.
// "Meet on the beach" is added to every Location list. A Morning Beach Walk still saved with the place "Beachfront" is switched to it when the day is shown (not on confirmed slots),
// so the schedule, the print and the copied text all say where to meet. The Calendar keeps showing the walk in the Beachfront column, exactly as before.
(function () {
  const MEET = 'Meet on the beach', RECEPTION = 'Meet in reception';
  if (typeof BBC_LOCATIONS_LIST !== 'undefined' && !BBC_LOCATIONS_LIST.includes(MEET)) BBC_LOCATIONS_LIST.push(MEET);
  if (typeof bbcLocToShalaId === 'function') {
    const baseLoc = bbcLocToShalaId;
    window.bbcLocToShalaId = function (loc) { return String(loc || '').trim().toLowerCase() === MEET.toLowerCase() ? 'beachfront' : baseLoc.apply(this, arguments); };
  }
  if (typeof bbcRenderSlotRow === 'function') {
    const baseRow = window.bbcRenderSlotRow;
    window.bbcRenderSlotRow = function (schedId, di, slot) {
      if (slot && !slot.confirmed && slot.type !== 'meal') {
        const isTour = typeof BBC_TOUR_NAMES !== 'undefined' && BBC_TOUR_NAMES.has(slot.activity);
        const want = isTour ? RECEPTION : (/beach\s*walk|mayan\s*clay/i.test(slot.activity || '') && String(slot.location || '').toLowerCase() === 'beachfront') ? MEET : null;
        if (want && slot.location !== want) { slot.location = want; try { if (typeof bbcSaveData === 'function') bbcSaveData(); } catch (e) {} }
        if (isTour) {
          const html = baseRow.apply(this, arguments), at = html.indexOf('padding-left:2px">\u2014</span>');
          return at < 0 ? html : html.slice(0, at) + 'padding-left:2px;color:#374151;font-size:12px">' + RECEPTION + html.slice(at + 'padding-left:2px">\u2014'.length);
        }
      }
      return baseRow.apply(this, arguments);
    };
  }
})();
