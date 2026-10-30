// ===== activity-conflict-popup.js — Pop-up when another group already has Sound Healing that night =====
// Loaded as a classic script AFTER teacher-portal.js; shares global scope. Darlene 2026-10-21: "if another group has sound healing that night then
// I would get a pop up." Wraps the two places an admin sets the date of an activity in a retreat's Schedule box (svChangeActivityDate when a day is
// picked in an assigned activity's dropdown, svAddActivity when a new one is added). If any OTHER current retreat that has it PREPAID (or in its package) already has Sound Healing & Cacao on
// that same date, a pop-up names the group, the time and the headcount and says it can't be booked that night; the date is left as it was (Darlene:
// "you can not book that"). Nothing else about editing activities is blocked.
// The ceremony exists as two catalog entries (ao4 and ao19), so both count. To get the same pop-up for another activity, add its id below.
const ACP_WATCH = new Set(['ao4', 'ao19']);   // Sound Healing & Cacao Ceremony

function acpName(aoId) { try { return ((typeof ADD_ONS !== 'undefined' ? ADD_ONS : []).find(a => a.id === aoId) || {}).name || 'Sound Healing & Cacao Ceremony'; } catch (e) { return 'Sound Healing & Cacao Ceremony'; } }
function acpFmtTime(t) { if (!t) return ''; const [h, m] = String(t).split(':').map(Number); return ' at ' + ((h % 12) || 12) + ':' + String(m || 0).padStart(2, '0') + (h >= 12 ? ' PM' : ' AM'); }
function acpFmtDate(ds) { try { return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); } catch (e) { return ds; } }

// Other retreats that already have this ceremony on that date
function acpConflicts(bk, aoId, date) {
  if (!bk || !ACP_WATCH.has(aoId) || !date) return [];
  // a group that did NOT prepay Cacao is simply put at the same time as the others, so it is never blocked (Darlene 2026-10-30)
  if (!((bk.packages || []).some(p => ACP_WATCH.has(p)) || (bk.retreatActivities || []).some(a => ACP_WATCH.has(a.aoId) && a.prepaid))) return [];
  const day = String(date).slice(0, 10), out = [];
  (AppData.bookings || []).forEach(b => {
    if (b.id === bk.id || b.status === 'cancelled') return;
    (b.retreatActivities || []).forEach(a => {
      // only a group that has it PREPAID / included in its package holds the night; groups without it can share a night (Darlene 2026-10-30)
      if (ACP_WATCH.has(a.aoId) && String(a.date || '').slice(0, 10) === day && (a.prepaid || (b.packages || []).some(p => ACP_WATCH.has(p))))
        out.push({ group: b.leaderName || b.retreatName || 'Another group', time: a.time || '', pax: (typeof menuHeadcount === 'function' ? menuHeadcount(b) : 0) || b.pax || 0 });
    });
  });
  return out;
}
function acpAsk(aoId, date, conflicts) {
  const lines = conflicts.map(c => `• ${c.group}${c.pax ? ` (${c.pax} people)` : ''}${acpFmtTime(c.time)}`).join('\n');
  return `⚠ You can't book ${acpName(aoId)} on ${acpFmtDate(date)} — another group already has it that night:\n\n${lines}\n\nPlease pick a different night. Nothing was changed.`;
}

(function () {
  if (typeof svChangeActivityDate === 'function') {
    const origChange = window.svChangeActivityDate;
    window.svChangeActivityDate = function (bkId, idx, newDate) {
      try {
        const bk = AppData.bookings.find(b => b.id === bkId), act = bk && (bk.retreatActivities || [])[idx];
        if (bk && act && newDate && newDate !== bk.startDate && newDate !== bk.endDate && String(act.date || '').slice(0, 10) !== newDate) {
          const c = acpConflicts(bk, act.aoId, newDate);
          if (c.length) { window.alert(acpAsk(act.aoId, newDate, c)); if (typeof svRefreshActivityView === 'function') svRefreshActivityView(bkId); return; }
        }
      } catch (e) { console.warn('[activity conflict popup]', e); }
      return origChange.apply(this, arguments);
    };
  }
  if (typeof svAddActivity === 'function') {
    const origAdd = window.svAddActivity;
    window.svAddActivity = function (bkId) {
      try {
        const bk = AppData.bookings.find(b => b.id === bkId);
        const aoId = (document.getElementById('svAddAoId') || {}).value, date = (document.getElementById('svAddAoDate') || {}).value;
        if (bk && aoId && date && date !== bk.startDate && date !== bk.endDate) {
          const c = acpConflicts(bk, aoId, date);
          if (c.length) { window.alert(acpAsk(aoId, date, c)); return; }
        }
      } catch (e) { console.warn('[activity conflict popup]', e); }
      return origAdd.apply(this, arguments);
    };
  }
})();
