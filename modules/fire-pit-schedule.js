// ===== fire-pit-schedule.js — Fire Pit on the Schedule grid, in its own column =====
// Loaded as a classic script AFTER teacher-portal.js and fire-pit.js; shares global scope. Standalone. The Schedule tab (Skedda-style grid) only lists a retreat once its schedule is
// confirmed, and showed any not-prepaid activity such as the Fire Pit inside the generic "Pre-Paid Activity" column. Now: a "Fire Pit" column (SKED_ACTIVITIES gets one entry before
// "Pre-Paid Activity"), and every Fire Pit night saved on any current retreat (Fire Pit button / tab) is drawn there at its time, 90 minutes, whether or not that retreat's schedule has been
// confirmed yet: the nights are set by the team directly. Retreats with a Fire Pit at the same time share one block, named together. Asked by Darlene 2026-10-24.
(function () {
  if (typeof SKED_ACTIVITIES === 'undefined' || typeof skedGetRetreatEvents !== 'function') return;
  if (!SKED_ACTIVITIES.some(a => a.id === 'firepit')) {
    const at = SKED_ACTIVITIES.findIndex(a => a.id === 'optional');
    SKED_ACTIVITIES.splice(at >= 0 ? at : SKED_ACTIVITIES.length, 0, { id: 'firepit', name: '🔥 Fire Pit' });
  }
  const orig = window.skedGetRetreatEvents;
  window.skedGetRetreatEvents = function (dateStr) {
    const evs = orig.apply(this, arguments).filter(e => !(e.title === 'Fire Pit' && (e.resourceId === 'optional' || e.resourceId === 'firepit')));
    try {
      const byTime = {};
      (AppData.bookings || []).filter(b => b.status !== 'cancelled').forEach(bk => {
        (bk.retreatActivities || []).filter(a => a.aoId === 'ao21' && String(a.date || '').slice(0, 10) === dateStr).forEach(a => {
          const t = a.time || '20:00';
          (byTime[t] = byTime[t] || []).push(bk);
        });
      });
      Object.entries(byTime).forEach(([t, list]) => {
        const names = [...new Set(list.map(b => b.leaderName || b.retreatName || 'Retreat'))];
        evs.push({ id: 'ret_firepit_' + dateStr + '_' + t.replace(':', ''), resourceId: 'firepit', date: dateStr, startTime: t, endTime: skedMinToTime(skedTimeToMin(t) + 90), title: 'Fire Pit', subtitle: names.join(', '),
          color: '#ea580c', bg: '#ffedd5', textColor: '#9a3412', isRetreat: true, bkId: list[0].id });
      });
    } catch (e) { console.warn('[fire-pit-schedule]', e); }
    return evs;
  };
})();
