// Calendar Day view: a note above the grid that says which Bikini Bootcamp lines for that day are NOT drawn and why
// (no location, unreadable time, cancelled schedule), or that no Bikini Bootcamp schedule covers the day at all.
// Read-only; wraps skedBuild.
(function () {
  if (typeof skedBuild !== 'function') return;
  const orig = window.skedBuild;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function report(date) {
    const list = typeof bbcSchedules !== 'undefined' ? bbcSchedules : [];
    const drawn = {};
    try { (skedGetBbcEvents(date) || []).forEach(e => { drawn[e.title + '|' + e.startTime] = 1; }); } catch (e) {}
    const lines = [];
    let found = 0;
    list.forEach(s => {
      const day = (s.days || []).find(d => d.date === date);
      if (!day) return;
      found++;
      (day.slots || []).forEach(slot => {
        if (slot.type === 'meal' || !slot.activity) return;
        let why = '';
        if (s.status === 'cancelled') why = 'schedule is cancelled';
        else {
          const r = typeof bbcSlotTimeRange === 'function' ? bbcSlotTimeRange(slot.time, 45) : null;
          const tour = typeof BBC_TOUR_NAMES !== 'undefined' && BBC_TOUR_NAMES.has(slot.activity);
          if (!r) why = 'time "' + (slot.time || '') + '" not readable';
          else if (!tour && !slot.location) why = 'no location';
          else if (!tour && typeof bbcLocToShalaId === 'function' && !bbcLocToShalaId(slot.location)) why = 'location "' + slot.location + '" has no shala on the Calendar';
        }
        if (why) lines.push(esc(slot.time || '') + ' ' + esc(slot.activity) + ' — ' + why);
      });
    });
    if (!found) return list.length ? 'No Bikini Bootcamp schedule has a day for ' + esc(date) + '.' : 'No Bikini Bootcamp schedules are loaded.';
    return lines.length ? '<b>Bikini Bootcamp lines not on the Calendar today:</b><br>' + lines.join('<br>') : '';
  }

  window.skedBuild = function () {
    const r = orig.apply(this, arguments);
    try {
      const old = document.getElementById('skedBbcMissing'); if (old) old.remove();
      const wrap = document.getElementById('skedWrap');
      if (!wrap || typeof skedView === 'undefined' || skedView !== 'day' || typeof skedViewDate === 'undefined') return r;
      const html = report(fmtISO(skedViewDate));
      if (!html) return r;
      const d = document.createElement('div');
      d.id = 'skedBbcMissing';
      d.style.cssText = 'margin:8px 16px;padding:8px 12px;border:1px solid #f59e0b;background:#fffbeb;color:#92400e;border-radius:8px;font-size:12px;line-height:1.5';
      d.innerHTML = html;
      wrap.parentNode.insertBefore(d, wrap);
    } catch (e) { console.warn('[calendar-bbc-missing]', e); }
    return r;
  };
})();
