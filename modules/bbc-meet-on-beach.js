// ===== bbc-meet-on-beach.js — Bikini Bootcamp schedule: the Beach Walk says "Meet on the beach" (Darlene 2026-11-06) =====
// Loaded as a classic script AFTER bbc-schedule.js and bbc-room-availability.js; shares global scope. bbc-schedule.js is not edited.
// "Meet on the beach" is added to every Location list. A Morning Beach Walk still saved with the place "Beachfront" is switched to it when the day is shown (not on confirmed slots),
// so the schedule, the print and the copied text all say where to meet. The Calendar keeps showing the walk in the Beachfront column, exactly as before.
(function () {
  const MEET = 'Meet on the beach';
  if (typeof BBC_LOCATIONS_LIST !== 'undefined' && !BBC_LOCATIONS_LIST.includes(MEET)) BBC_LOCATIONS_LIST.push(MEET);
  if (typeof bbcLocToShalaId === 'function') {
    const baseLoc = bbcLocToShalaId;
    window.bbcLocToShalaId = function (loc) { return String(loc || '').trim().toLowerCase() === MEET.toLowerCase() ? 'beachfront' : baseLoc.apply(this, arguments); };
  }
  if (typeof bbcRenderSlotRow === 'function') {
    const baseRow = window.bbcRenderSlotRow;
    window.bbcRenderSlotRow = function (schedId, di, slot) {
      if (slot && !slot.confirmed && slot.type !== 'meal' && /beach\s*walk/i.test(slot.activity || '') && String(slot.location || '').toLowerCase() === 'beachfront') {
        slot.location = MEET;
        try { if (typeof bbcSaveData === 'function') bbcSaveData(); } catch (e) {}
      }
      return baseRow.apply(this, arguments);
    };
  }
})();
