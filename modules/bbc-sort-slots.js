// ===== bbc-sort-slots.js — "Sort by time" for each day of a BBC schedule (Darlene 2026-10-25: a slot added at 11:00 landed at the bottom, after Dinner) =====
// Loaded as a classic script AFTER bbc-schedule.js; shares global scope. Standalone: bbc-schedule.js is not edited. Puts a "Sort by time" button next to "+ Add Slot" in every day; pressing it
// puts that day's lines in clock order (morning to evening, using the same reading of times as the Schedule grid: 1:30 is 1:30 PM, 7:00 is 7:00 AM). Lines with no time stay at the end in
// their current order. Nothing else changes: classes, teachers, locations and teacher confirmations stay on the same lines.
// Times carry no am/pm: the portal reads 1:00–6:59 as afternoon and 7:00–12:59 as morning, so "7:30 Dinner" (and "7:00 Opening Circle" on arrival day) are evenings that must be moved to PM here.
function bssortKey(slot, firstDay) {
  const r = typeof bbcSlotTimeRange === 'function' ? bbcSlotTimeRange(slot.time, 45) : null; if (!r) return '99:99';
  let [h, m] = r.start.split(':').map(Number);
  const evening = /dinner|offsite|opening circle|cacao|sound|temazcal|salsa|bonfire|fire pit/i.test(slot.activity || '') || (firstDay && h < 12 && slot.type !== 'meal' && h >= 7 && /circle/i.test(slot.activity || ''));
  if (evening && h >= 7 && h < 12) h += 12;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
function bbcSortDay(schedId, di) {
  const s = bbcSchedules.find(x => x.id === schedId); if (!s || !s.days[di]) return;
  const slots = s.days[di].slots, keyed = slots.map((x, i) => ({ x, i, k: bssortKey(x, di === 0) }));
  keyed.sort((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i);
  if (keyed.every((e, i) => e.i === i)) { showToast('Already in time order ✓'); return; }
  s.days[di].slots = keyed.map(e => e.x);
  bbcSaveData(); bbcRenderEditor();
  const nb = document.getElementById('bbcDayBody-' + schedId + '-' + di);
  if (nb) { nb.style.display = 'block'; const ch = document.getElementById('bbcChev-' + schedId + '-' + di); if (ch) ch.style.transform = 'rotate(90deg)'; }
  showToast('Sorted by time ✓');
}
(function () {
  if (typeof bbcRenderDayCard !== 'function') return;
  const o = window.bbcRenderDayCard;
  window.bbcRenderDayCard = function (s, day, di) {
    const html = o.apply(this, arguments);
    const btn = '<button onclick="bbcSortDay(\'' + s.id + '\',' + di + ')" style="margin-top:8px;width:100%;padding:7px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:8px;font-family:\'Jost\',sans-serif;font-size:12px;font-weight:600;cursor:pointer">↕ Sort this day by time</button>';
    const i = html.lastIndexOf('+ Add Slot</button>');
    return i < 0 ? html : html.slice(0, i + 19) + btn + html.slice(i + 19);
  };
})();
