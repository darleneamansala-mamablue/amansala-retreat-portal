// ===== menu-allergies.js — allergies & diets from the Room List, shown at the top of the Menu (Darlene 2026-10-27) =====
// For the week on screen, lists every retreat/booking that has guest notes about food: dietary groups as counted chips (Veganos, Sin Gluten…) and every note that mentions an allergy
// word-for-word with the guest's name and room. Same source and same wording rules as the Dietary Sheet (dietary-report.js: reg.guests[].notes from the Room List), so nothing is retyped.
// Display only; nothing is saved. Hidden in teacher mode.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function weekRange() {
    const g = document.getElementById('menuGrid'); if (!g) return null;
    const dates = [...g.querySelectorAll('.menu-day-header')].map(h => (/menuPrintDay\('([^']+)'\)/.exec(h.getAttribute('onclick') || '') || [])[1]).filter(Boolean);
    return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
  }
  function paint() {
    try {
      if (typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE && !document.body.classList.contains('admin-preview')) return;
      const wrap = document.getElementById('menuGridWrap'), grid = document.getElementById('menuGrid'); if (!wrap || !grid || typeof dietBuildReport !== 'function') return;
      const r = weekRange(); if (!r) return;
      let box = document.getElementById('menuAllergyBar');
      if (!box) { box = document.createElement('div'); box.id = 'menuAllergyBar'; wrap.insertBefore(box, grid); }
      const rep = dietBuildReport(r.start, r.end);
      if (!rep.length) { box.innerHTML = '<div style="margin:0 0 12px;padding:8px 14px;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;font-size:12.5px;color:#166534;font-weight:700">✅ No allergies or special diets noted on the Room Lists this week.</div>'; return; }
      const label = bk => esc(bk.leaderName || bk.retreatName || 'Booking') + ' <span style="font-weight:600;color:#9a3412">' + String(bk.startDate).slice(5) + ' → ' + String(bk.endDate).slice(5) + '</span>';
      box.innerHTML = '<div style="margin:0 0 14px;padding:10px 14px;background:#fff7ed;border:2px solid #fb923c;border-radius:12px">'
        + '<div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#9a3412;margin-bottom:6px">⚠️ Allergies &amp; special diets this week <span style="font-weight:600;text-transform:none;letter-spacing:0">· from the Room Lists</span></div>'
        + rep.map(g => '<div style="padding:6px 0;border-top:1px solid #fed7aa"><div style="font-size:13px;font-weight:800;color:#7c2d12">' + label(g.bk) + '</div>'
          + (g.tallyList.length ? '<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:6px">' + g.tallyList.map(t => '<span style="background:#ffedd5;border:1px solid #fdba74;border-radius:9px;padding:1px 9px;font-size:12px;font-weight:700;color:#7c2d12">' + t.count + ' · ' + esc(t.label) + '</span>').join('') + '</div>' : '')
          + g.reviewNotes.map(n => '<div style="margin-top:3px;font-size:12.5px;color:#1f2937"><b>' + esc(n.name) + '</b>' + (n.room ? ' <span style="color:#6b7280">(' + esc(n.room) + ')</span>' : '') + ': ' + esc(n.note) + '</div>').join('')
          + '</div>').join('')
        + '</div>';
    } catch (e) { console.warn('[menu-allergies]', e); }
  }
  const o = window.menuRenderWeek;
  if (typeof o === 'function') window.menuRenderWeek = function () { const r = o.apply(this, arguments); setTimeout(paint, 30); return r; };
  setInterval(paint, 5000);
  setTimeout(paint, 500);
})();
