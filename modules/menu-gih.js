// ===== menu-gih.js — "GIH" (Guests In House) as a row in the Breakfast group table, on screen and in the kitchen prints (Darlene 2026-10-26) =====
// GIH sits in the Breakfast box's Hora / Grupo / # table, the same spot as a retreat group such as Patricia: Grupo = "GIH", # = how many individual guests are in house and need breakfast.
// Retreat groups (Patricia, Melissa, Bikini Bootcamp, WeTravel…) already have their own rows, so GIH counts only the OTHER in-house guests: room-only bookings (Cloudbeds / Direct / OTA).
// A guest eats breakfast on the morning after a night they slept here: stay nights are start <= night < end, so departure morning counts and arrival morning doesn't. Cancelled, archived and
// not-yet-confirmed ('requested') bookings are not counted, and the count is each booking's guest number (pax). Shown only under Breakfast (tick "Breakfast" in "Meals shown this week").
// Display only; nothing is saved. menuGihRow(date) and menuGihLine(date) are used by the printouts in menu.js.
(function () {
  if (!document.getElementById('mgihCss')) {
    const st = document.createElement('style'); st.id = 'mgihCss';
    st.textContent = '.mgih-row td{background:#fde68a!important;color:#78350f;font-weight:800;font-size:12px!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}';
    document.head.appendChild(st);
  }
  const isGroup = b => b.retreatName === 'Bikini Bootcamp' || b.mealPlan === 'weTravel';   // these have their own kitchen rows
  function gihFor(ds) {
    let n = 0;
    try {
      const prev = new Date(ds + 'T12:00:00'); prev.setDate(prev.getDate() - 1); const night = prev.toISOString().slice(0, 10);
      (AppData.bookings || []).forEach(b => {
        if (!b || b.bookingType !== 'room_only' || isGroup(b) || b.status === 'cancelled' || b.status === 'requested' || (b.flags || []).includes('archived')) return;
        const s = (b.startDate || '').slice(0, 10), e = (b.endDate || '').slice(0, 10);
        if (s && e && s <= night && night < e) n += Number(b.pax) || 0;
      });
    } catch (e) { console.warn('[menu-gih]', e); }
    return n;
  }
  window.menuGihCount = gihFor;
  window.menuGihRow = ds => '<tr class="mgih-row"><td style="padding:3px 4px;background:#fde68a;border-top:1px solid #f2efe8"></td><td style="padding:3px 4px;background:#fde68a;border-top:1px solid #f2efe8;font-weight:800;font-size:11.5px;color:#78350f">GIH</td><td style="padding:3px 4px;background:#fde68a;border-top:1px solid #f2efe8;text-align:center;font-weight:800;font-size:11.5px;color:#78350f">' + gihFor(ds) + '</td></tr>';
  window.menuGihLine = ds => '<div class="rw-groups"><div class="rw-group-row" style="font-weight:800;color:#78350f">GIH · ' + gihFor(ds) + '</div></div>';
  function mgihPaint() {
    try {
      const grid = document.getElementById('menuGrid'); if (!grid) return;
      grid.querySelectorAll('.mgih').forEach(e => e.remove());   // earlier versions drew a yellow bar under the dishes
      const dates = [...grid.querySelectorAll('.menu-day-header')].map(h => (/menuPrintDay\('([^']+)'\)/.exec(h.getAttribute('onclick') || '') || [])[1]);
      if (dates.length !== 7 || dates.some(d => !d)) return;
      const cells = [...grid.querySelectorAll('.menu-grid-cell')];
      const weekHasLunch = dates.some(ds => (menuSchedule[ds] && menuSchedule[ds].lunch || []).length > 0);
      const weekHasBreakfast = dates.some(ds => (menuSchedule[ds] && menuSchedule[ds].breakfast || []).length > 0);
      const meals = (a => typeof menuMealsFor === 'function' ? menuMealsFor(dates, a) : a)(['lightBreakfast', ...(weekHasBreakfast ? ['breakfast'] : []), 'brunch', ...(weekHasLunch ? ['lunch'] : []), 'snack', 'dinner']);
      if (cells.length !== meals.length * 7) return;
      const row = meals.indexOf('breakfast'); if (row < 0) return;
      for (let c = 0; c < 7; c++) {
        const cell = cells[row * 7 + c], tb = cell && cell.querySelector('.menu-sched-tbl tbody'); if (!tb) continue;
        const html = menuGihRow(dates[c]).replace('<td style', '<td title="Guests in house: individual guests (not in a retreat group) who need breakfast" style').replace(/(<td[^>]*><\/td>)(<td[^>]*>GIH)/, '$1$2');
        let r = tb.querySelector('.mgih-row');
        if (!r) { tb.insertAdjacentHTML('afterbegin', html); r = tb.querySelector('.mgih-row'); if (r) r.insertAdjacentHTML('beforeend', '<td style="background:#fde68a"></td>'); }
        else { const n = r.children[2]; const v = String(gihFor(dates[c])); if (n && n.textContent !== v) n.textContent = v; }
        // the box's Total counts the GIH guests too (Darlene 2026-10-26): groups' pax + GIH
        const tot = cell.querySelector('.menu-total-row b');
        if (tot) { const rows = (menuSchedule[dates[c]] && menuSchedule[dates[c]].breakfast) || []; const sum = rows.reduce((n, x) => n + (parseInt(x.pax) || 0), 0) + gihFor(dates[c]); const v = sum ? String(sum) : '—'; if (tot.textContent !== v) tot.textContent = v; }
      }
    } catch (e) { console.warn('[menu-gih]', e); }
  }
  const o = window.menuRenderWeek;
  if (typeof o === 'function') window.menuRenderWeek = function () { const r = o.apply(this, arguments); setTimeout(mgihPaint, 50); return r; };
  setTimeout(mgihPaint, 50);
  setInterval(mgihPaint, 4000); // the bookings load after the first draw, so keep the count current
})();
