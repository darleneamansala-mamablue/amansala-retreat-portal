// ===== bbc-auto-sort.js — Bikini Bootcamp schedule: lines fall into clock order by themselves (Darlene 2026-11-06) =====
// Loaded as a classic script AFTER bbc-schedule.js and bbc-sort-slots.js; shares global scope. Uses that module's bbcSortDay (the "Sort by time" button), so the order is the same one.
// A day re-sorts when a time box is finished (clicking away from it, not while typing) and right after a slot, workshop or tour is added.
// Times typed with a plain hyphen ("12:00-1:30") or "to" are read like the long dash, so they sort and are checked for room clashes like any other time.
(function () {
  if (typeof bbcSlotTimeRange !== 'function') return;
  const base = bbcSlotTimeRange;
  window.bbcSlotTimeRange = function (timeStr, dur) {
    const t = typeof timeStr === 'string' ? timeStr.replace(/\s*(?:-|\u2013|\u2014|\bto\b)\s*/gi, ' \u2013 ') : timeStr;
    return base.call(this, t, dur);
  };
})();
// Plain times (Darlene 2026-11-06: "I do not want pm showing"): "7:15 pm" or "3:00pm-4:15pm" is stored as "7:15" / "3:00 – 4:15". An evening time at 7-11 (which the portal would read as morning) is remembered on the line
// as slot.pm so the sort order and the room check still treat it as evening; nothing about it shows on screen.
function bbcPlainTime(str) {
  const raw = String(str || '').trim();
  if (!raw || !(/[ap]\.?\s*m\b/i.test(raw) || /\s*(?:-|—|\bto\b)\s*/i.test(raw))) return null;
  const parts = raw.split(/\s*(?:-|–|—|\bto\b)\s*/i).filter(Boolean);
  const clean = parts.map(p => p.replace(/\s*[ap]\.?\s*m\.?$/i, '').replace(/^(\d{1,2})(\d{2})$/, '$1:$2').trim());
  const first = /^(\d{1,2}):(\d{2})/.exec(clean[0] || '');
  const pm = !!first && /p\.?\s*m/i.test(parts[0]) && +first[1] >= 7 && +first[1] <= 11;
  return { text: clean.join(' – '), pm };
}
function bbcApplyPlainTime(slot) {
  if (!slot || slot.confirmed || slot.type === 'meal') return false;
  const r = bbcPlainTime(slot.time); if (!r) return false;
  const changed = r.text !== slot.time || (r.pm && !slot.pm);
  slot.time = r.text; if (r.pm) slot.pm = true;
  return changed;
}
(function () {
  if (typeof bssortKey === 'function') {
    const baseKey = bssortKey;
    window.bssortKey = function (slot, firstDay) {
      const k = baseKey.apply(this, arguments), h = +k.slice(0, 2);
      return slot && slot.pm && h >= 7 && h < 12 ? String(h + 12).padStart(2, '0') + k.slice(2) : k;
    };
  }
  if (typeof bbcRenderSlotRow === 'function') {
    const baseRow = window.bbcRenderSlotRow;
    window.bbcRenderSlotRow = function (schedId, di, slot) {
      try { if (bbcApplyPlainTime(slot) && typeof bbcSaveData === 'function') bbcSaveData(); } catch (e) {}
      return baseRow.apply(this, arguments);
    };
  }
})();
// Print and Copy as Text always show plain times, also for older or confirmed lines that were typed with pm (the stored time is put back right after).
(function () {
  ['bbcPrint', 'bbcScheduleAsText'].forEach(name => {
    const fn = window[name]; if (typeof fn !== 'function') return;
    window[name] = function () {
      const saved = [];
      try {
        (typeof bbcSchedules !== 'undefined' ? bbcSchedules : []).forEach(sc => (sc.days || []).forEach(d => (d.slots || []).forEach(sl => {
          const r = sl && sl.type !== 'meal' ? bbcPlainTime(sl.time) : null;
          if (r) { saved.push([sl, sl.time]); sl.time = r.text; }
        })));
        return fn.apply(this, arguments);
      } finally { saved.forEach(([sl, t]) => { sl.time = t; }); }
    };
  });
})();
(function () {
  if (typeof bbcSortDay !== 'function') return;
  let quiet = false;
  const sortQuiet = (schedId, di) => { const t = window.showToast; quiet = true; try { window.showToast = function (m) { if (!/time/i.test(String(m))) return t.apply(this, arguments); }; bbcSortDay(schedId, di); } finally { window.showToast = t; quiet = false; } };
  document.addEventListener('change', e => {
    const el = e.target, on = el && el.getAttribute && el.getAttribute('oninput');
    const m = on && /bbcSlotField\('([^']+)',(\d+),(\d+),'time'/.exec(on);
    if (m) {
      const sc = bbcSchedules.find(x => x.id === m[1]), sl = sc && sc.days[+m[2]] && sc.days[+m[2]].slots[+m[3]];
      let fixed = false; try { fixed = bbcApplyPlainTime(sl); } catch (er) {}
      if (fixed && typeof bbcSaveData === 'function') bbcSaveData();
      sortQuiet(m[1], +m[2]);
      if (fixed && typeof bbcWorkshopRerender === 'function') bbcWorkshopRerender(m[1], +m[2]);
    }
  }, true);
  ['bbcAddSlot', 'bbcAddWorkshop', 'bbcAddTour'].forEach(name => {
    const fn = window[name]; if (typeof fn !== 'function') return;
    window[name] = function (schedId, di) { const r = fn.apply(this, arguments); setTimeout(() => { try { sortQuiet(schedId, di); } catch (e) {} }, 0); return r; };
  });
})();
