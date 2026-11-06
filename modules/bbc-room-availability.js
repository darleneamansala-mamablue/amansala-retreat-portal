// ===== bbc-room-availability.js — Bikini Bootcamp schedule: rooms in use are blocked, evening times read as evening (Darlene 2026-11-06) =====
// Loaded as a classic script AFTER bbc-schedule.js and bbc-workshops-cohosts.js; shares global scope. bbc-schedule.js is not edited.
// 1) The editor read an evening "7:00" Opening Circle as 7 AM, so it clashed with a retreat's morning class in Skye. A slot that comes after an afternoon slot of the same day
//    (e.g. after 4:45) and starts at 7-11 is now read as PM for the room check.
// 2) In each class's Location list, a room already used by a retreat at that time is marked 🔴 and greyed out with who has it ("Skye — in use: Heather Kasey"), and rooms that are free are marked 🟢 green, so only free rooms can be picked.
(function () {
  // 3) Times can be typed with AM / PM ("7:15 PM", "7:15pm", "715 pm"): the room check, the sort and the Calendar then use exactly that. Without AM/PM the old reading stays (7-11 AM, 12 noon, 1-6 PM).
  if (typeof bbcTimeTo24h === 'function') {
    const base24 = bbcTimeTo24h;
    window.bbcTimeTo24h = function (t) {
      const m = String(t || '').trim().match(/^(\d{1,2})[:.]?(\d{2})\s*([ap])\.?\s*m?\.?$/i);
      if (!m) return base24.apply(this, arguments);
      let h = +m[1]; const pm = m[3].toLowerCase() === 'p';
      if (h > 12 || +m[2] > 59) return null;
      if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0;
      return String(h).padStart(2, '0') + ':' + m[2];
    };
  }
  if (typeof bbcRenderSlotRow !== 'function' || typeof bbcGetShalaConflicts !== 'function') return;
  let ctx = null;
  const h24 = t => { const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] : null; };
  function pmTime(timeStr, slots, si) {
    const flagged = !!(slots && slots[si] && slots[si].pm);
    if (!timeStr || !slots || /[ap]\.?\s*m/i.test(timeStr)) return timeStr;
    const first = String(timeStr).split('–')[0], h = h24(first);
    if (h == null || h < 7 || h > 11) return timeStr;
    const afternoonBefore = slots.slice(0, si).some(s => { const p = h24(String(s.time || '').split('–')[0]); return p != null && (p >= 12 || p <= 6); });
    if (!afternoonBefore && !flagged) return timeStr;
    return String(timeStr).split('–').map(p => { p = p.trim(); const m = p.match(/^(\d{1,2}):(\d{2})$/); return m && +m[1] < 12 ? (+m[1] + 12) + ':' + m[2] : p; }).join('–');
  }
  const baseCfl = bbcGetShalaConflicts;
  window.bbcGetShalaConflicts = function (date, loc, timeStr) {
    let t = timeStr;
    if (ctx) { try { const s = bbcSchedules.find(x => x.id === ctx.schedId), slots = s && s.days[ctx.di] && s.days[ctx.di].slots; t = pmTime(timeStr, slots, ctx.si); } catch (e) {} }
    return baseCfl.call(this, date, loc, t);
  };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const baseRow = window.bbcRenderSlotRow;
  window.bbcRenderSlotRow = function (schedId, di, slot, si, dups, date) {
    ctx = { schedId, di, si };
    try {
      let html = baseRow.apply(this, arguments);
      if (!slot || slot.type === 'meal' || slot.type === 'tour' || slot.confirmed) return html;
      (typeof BBC_LOCATIONS_LIST !== 'undefined' ? BBC_LOCATIONS_LIST : []).forEach(l => {
        if (/^meet on/i.test(l)) return;
        const cf = window.bbcGetShalaConflicts(date, l, slot.time), mine = l === slot.location;
        const re = new RegExp('<option value="' + l + '"( selected)?>' + l + '</option>');
        if (!cf.length) html = html.replace(re, (m0, sel) => '<option value="' + l + '"' + (sel || '') + ' style="color:#15803d;font-weight:700">🟢 ' + l + '</option>');
        else html = html.replace(re, (m0, sel) => '<option value="' + l + '"' + (sel || '') + (mine ? '' : ' disabled') + ' style="color:#b91c1c">🔴 ' + esc(l + ' — in use: ' + String(cf[0]).split(' — ')[0]) + '</option>');
      });
      return html;
    } finally { ctx = null; }
  };
  if (typeof bbcCheckLocationConflict === 'function') {
    const baseChk = bbcCheckLocationConflict;
    window.bbcCheckLocationConflict = function (schedId, di, si) { ctx = { schedId, di, si }; try { return baseChk.apply(this, arguments); } finally { ctx = null; } };
  }
})();
