// ===== bbc-add-tour.js — Bikini Bootcamp schedule: "+ Add tour" on each day (Darlene 2026-11-06) =====
// Loaded as a classic script AFTER bbc-schedule.js and bbc-workshops-cohosts.js; shares global scope. A plain "+ Add Slot" makes a class line, which is not a tour (a tour has no teacher or shala).
// "+ Add tour" asks which tour and adds it as a real tour line at the usual bus time (11:45 – 2:15). The time can be changed in the line afterwards.
function bbcAddTour(schedId, di) {
  const s = bbcSchedules.find(x => x.id === schedId); if (!s || !s.days[di]) return;
  const names = Object.values(BBC_TOUR_AOID_NAME);
  const pick = prompt('Which tour? Type its number:\n' + names.map((n, i) => (i + 1) + '. ' + n).join('\n'));
  const idx = parseInt(pick, 10) - 1; if (!(idx >= 0 && idx < names.length)) return;
  s.days[di].slots.push(bbcMakeSlot('11:45 – 2:15', names[idx], '', '', false, 'event'));
  bbcSaveData(); bbcWorkshopRerender(schedId, di);
}
(function () {
  if (typeof bbcRenderDayCard !== 'function') return;
  const o = window.bbcRenderDayCard;
  window.bbcRenderDayCard = function (s, day, di) {
    const html = o.apply(this, arguments);
    const at = html.indexOf("onclick=\"bbcAddWorkshop('" + s.id + "'," + di + ")\""); if (at < 0) return html;
    const end = html.indexOf('</button>', at) + 9;
    return html.slice(0, end) + '<button onclick="bbcAddTour(\'' + s.id + "'," + di + ')" style="margin-top:8px;width:100%;padding:8px;background:#eff6ff;color:#1d4ed8;border:1.5px dashed #93c5fd;border-radius:8px;font-family:\'Jost\',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer">🚐 + Add tour</button>' + html.slice(end);
  };
})();
