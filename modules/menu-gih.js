// ===== menu-gih.js — "GIH" (Guests In House) under Breakfast on the Menu, on screen and in the kitchen prints (Darlene 2026-10-26) =====
// Breakfast is the included breakfast for everybody sleeping in house, so the kitchen needs one number there: GIH = everyone who slept here the night before — retreat guests (registered guests,
// teacher room included), BBC / Bikini Bootcamp and other room-only guests (their pax) and WeTravel groups. Cancelled, archived and not-yet-confirmed ('requested') bookings are not counted. Stay
// nights are start <= night < end, so a guest eats breakfast on the departure morning but not on the arrival morning. It is shown ONLY in the Breakfast box (tick "Breakfast" in "Meals shown this
// week"), not under the day name and not in any other meal. Display only; nothing is saved. menuGihLine(date) is also used by the printouts in menu.js.
(function () {
  if (!document.getElementById('mgihCss')) {
    const st = document.createElement('style'); st.id = 'mgihCss';
    st.textContent = '.mgih{margin:4px 6px;padding:3px 8px;border-radius:8px;background:#fde68a;color:#78350f;font-size:12px;font-weight:800;letter-spacing:.3px;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}';
    document.head.appendChild(st);
  }
  function gihFor(ds) {
    let n = 0;
    try {
      const prev = new Date(ds + 'T12:00:00'); prev.setDate(prev.getDate() - 1); const night = prev.toISOString().slice(0, 10);
      (AppData.bookings || []).forEach(b => {
        if (!b || b.status === 'cancelled' || b.status === 'requested' || (b.flags || []).includes('archived')) return;
        const s = (b.startDate || '').slice(0, 10), e = (b.endDate || '').slice(0, 10);
        if (!s || !e || !(s <= night && night < e)) return;
        n += Number(b.bookingType === 'room_only' ? b.pax : (typeof menuHeadcount === 'function' ? menuHeadcount(b) : b.pax)) || 0;
      });
    } catch (e) { console.warn('[menu-gih]', e); }
    return n;
  }
  window.menuGihLine = ds => '<div class="mgih" style="margin:4px 6px;padding:3px 8px;border-radius:8px;background:#fde68a;color:#78350f;font-size:12px;font-weight:800;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact">GIH · guests in house ' + gihFor(ds) + '</div>';
  function mgihPaint() {
    try {
      const grid = document.getElementById('menuGrid'); if (!grid) return;
      grid.querySelectorAll('.menu-day-header .mgih, .msd-head .mgih').forEach(e => e.remove());   // the first version put it under the day name
      document.querySelectorAll('#menuGrid .msd-head .mgih').forEach(e => e.remove());
      const dates = [...grid.querySelectorAll('.menu-day-header')].map(h => (/menuPrintDay\('([^']+)'\)/.exec(h.getAttribute('onclick') || '') || [])[1]);
      if (dates.length !== 7 || dates.some(d => !d)) return;
      const cells = [...grid.querySelectorAll('.menu-grid-cell')];
      const weekHasLunch = dates.some(ds => (menuSchedule[ds] && menuSchedule[ds].lunch || []).length > 0);
      const weekHasBreakfast = dates.some(ds => (menuSchedule[ds] && menuSchedule[ds].breakfast || []).length > 0);
      const meals = (a => typeof menuMealsFor === 'function' ? menuMealsFor(dates, a) : a)(['lightBreakfast', ...(weekHasBreakfast ? ['breakfast'] : []), 'brunch', ...(weekHasLunch ? ['lunch'] : []), 'snack', 'dinner']);
      if (cells.length !== meals.length * 7) return;
      const row = meals.indexOf('breakfast'); if (row < 0) return;
      for (let c = 0; c < 7; c++) {
        const cell = cells[row * 7 + c], list = cell && cell.querySelector('.menu-dish-list'); if (!list) continue;
        let d = cell.querySelector('.mgih');
        if (!d) { d = document.createElement('div'); d.className = 'mgih'; d.title = 'Guests in house — everyone who slept here last night and needs breakfast'; list.insertAdjacentElement('afterend', d); }
        d.textContent = 'GIH · guests in house ' + gihFor(dates[c]);
      }
    } catch (e) { console.warn('[menu-gih]', e); }
  }
  const o = window.menuRenderWeek;
  if (typeof o === 'function') window.menuRenderWeek = function () { const r = o.apply(this, arguments); setTimeout(mgihPaint, 50); return r; };
  setTimeout(mgihPaint, 50);
  setInterval(mgihPaint, 4000); // the bookings load after the first draw, so keep the count current
})();
