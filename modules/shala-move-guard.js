// ===== shala-move-guard.js — a class can't be moved into a shala another group already has at that time (Darlene 2026-10-30) =====
// Loaded as a classic script AFTER teacher-portal.js and shala-double-book-alert.js; shares global scope. Wraps skedSaveClassEdit (the form that opens when you click a class on the Schedule):
// when the new shala + time overlaps another retreat's class in that same shala on that day, a pop-up names that group and time and nothing is saved.
// Only a real shala clash blocks; activities, tours and groups sharing a time are untouched. Applies to "just this day" and to "whole retreat" changes (every day of the retreat is checked).
(function () {
  if (typeof skedSaveClassEdit !== 'function') return;
  const orig = window.skedSaveClassEdit;
  const mins = t => { if (!t || String(t).indexOf(':') < 0) return null; const [h, m] = String(t).split(':').map(Number); return isNaN(h) || isNaN(m) ? null : h * 60 + m; };
  const fmt = t => { const m = mins(t); if (m == null) return ''; const h = Math.floor(m / 60); return ((h % 12) || 12) + ':' + String(m % 60).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM'); };
  const nice = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  window.skedSaveClassEdit = function () {
    try {
      const bkId = document.getElementById('skedEditClassBkId').value, dateStr = document.getElementById('skedEditClassDate').value;
      const suffix = document.getElementById('skedEditClassSuffix').value, info = SKED_CLASS_SUFFIX_INFO[suffix];
      const bk = AppData.bookings.find(b => b.id === bkId);
      const shala = document.getElementById('skedEditClassShala').value || '', start = document.getElementById('skedEditClassTime').value;
      const dur = parseInt(document.getElementById('skedEditClassDur').value) || 60;
      if (bk && info && shala && mins(start) != null && typeof skedGetRetreatEvents === 'function') {
        let dates = [dateStr];
        const scope = (document.querySelector('input[name="skedEditScope"]:checked') || {}).value || 'once';
        if (info.kind !== 'oneoff' && scope === 'week') {
          dates = []; const s = String(bk.startDate).slice(0, 10), e = String(bk.endDate).slice(0, 10);
          for (let t = new Date(s + 'T12:00:00Z').getTime(); ; t += 86400000) { const d = new Date(t).toISOString().slice(0, 10); if (d > e) break; dates.push(d); }
        }
        const a0 = mins(start), a1 = a0 + dur, hits = [];
        dates.forEach(d => {
          skedGetRetreatEvents(d).forEach(ev => {
            if (!ev.isRetreat || !ev.bkId || ev.bkId === bkId || ev.resourceId !== shala) return;
            const b0 = mins(ev.startTime), b1 = mins(ev.endTime);
            if (b0 == null || b1 == null || !(a0 < b1 && b0 < a1)) return;
            const o = AppData.bookings.find(b => b.id === ev.bkId);
            hits.push({ d, who: (o && (o.leaderName || o.retreatName)) || ev.title || 'another group', t: fmt(ev.startTime) + ' – ' + fmt(ev.endTime) });
          });
        });
        if (hits.length) {
          const name = ((typeof SKED_SHALAS !== 'undefined' && SKED_SHALAS.find(s => s.id === shala)) || {}).name || shala;
          window.alert('⚠ ' + name + ' is already taken at that time — two groups can\'t be in the same shala:\n\n' +
            hits.slice(0, 6).map(h => '• ' + h.who + ' — ' + nice(h.d) + ', ' + h.t).join('\n') + (hits.length > 6 ? '\n• …and ' + (hits.length - 6) + ' more' : '') + '\n\nPlease pick another shala or time. Nothing was changed.');
          return;
        }
      }
    } catch (e) { console.warn('[shala-move-guard]', e); }
    return orig.apply(this, arguments);
  };
})();
