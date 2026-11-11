// Calendar (Schedule tab): shows ALL Bikini Bootcamp classes, not only the ones on a Confirmed schedule.
// Draft schedules (not yet confirmed) are drawn too, marked "(draft)"; cancelled ones stay hidden.
// Evening lines typed as 7-11 pm (slot.pm) are drawn in the evening. Wraps skedGetBbcEvents; nothing is saved.
(function () {
  if (typeof skedGetBbcEvents !== 'function') return;
  const orig = window.skedGetBbcEvents;
  window.skedGetBbcEvents = function (dateStr) {
    const list = typeof bbcSchedules !== 'undefined' ? bbcSchedules : [];
    const undo = [];
    try {
      list.forEach(s => {
        if (!s || s.status === 'cancelled') return;
        const day = (s.days || []).find(d => d.date === dateStr);
        if (!day) return;
        if (s.status !== 'confirmed') { const prev = s.status; undo.push(() => { s.status = prev; }); s.status = 'confirmed'; s.__draftCal = true; }
        (day.slots || []).forEach(slot => {
          const m = slot && slot.pm && /^\s*(\d{1,2}):(\d{2})/.exec(slot.time || '');
          if (m && +m[1] >= 7 && +m[1] <= 11) {
            const t = slot.time;
            slot.time = t.replace(/(\d{1,2}):(\d{2})/g, (x, h, mi) => (+h >= 7 && +h <= 11 ? String(+h + 12) : h) + ':' + mi);
            undo.push(() => { slot.time = t; });
          }
        });
      });
      const evs = orig.apply(this, arguments);
      const drafts = {};
      list.forEach(s => { if (s && s.__draftCal) drafts[s.id] = 1; });
      return (evs || []).map(e => drafts[e.bkId] ? Object.assign({}, e, { subtitle: String(e.subtitle || '') + ' (draft)' }) : e);
    } finally {
      undo.reverse().forEach(f => { try { f(); } catch (e) {} });
      list.forEach(s => { if (s) delete s.__draftCal; });
    }
  };

  // The Bikini Bootcamp schedules were only loaded when the BBC Schedule tab was opened, so the Calendar saw an empty list
  // until then. Load them when the Calendar is built (at most once a minute) and redraw when they arrive.
  if (typeof bbcLoadData === 'function' && typeof skedBuild === 'function') {
    const build = window.skedBuild;
    let last = 0, busy = false;
    window.skedBuild = function () {
      const r = build.apply(this, arguments);
      if (!busy && Date.now() - last > 60000) {
        busy = true; last = Date.now();
        Promise.resolve(bbcLoadData()).catch(() => {}).then(() => {
          busy = false;
          if (document.getElementById('skedWrap')) window.skedBuild();
        });
      }
      return r;
    };
  }
})();
