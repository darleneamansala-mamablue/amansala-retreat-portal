// ===== menu-swap-days.js — a small ⇄ arrow between two neighbouring days of the same meal swaps those two days' dishes (Darlene 2026-10-26) =====
// The 7-day layout is untouched: each meal box gets a little arrow on its right edge. Click it, confirm, and the meal (all its dishes; for dinner the main, sides and dessert) trades places
// with the next day's. It uses the Menu Editor's own load/save (menu-click-edit.js helpers), so history, "someone else saved" checks and Menu 1/Menu 2 all work as for any other dish edit.
// Like every Menu edit it changes that weekday in the weekly pattern, not just this one date.
(function () {
  if (!document.getElementById('msw2Css')) {
    const st = document.createElement('style'); st.id = 'msw2Css';
    st.textContent = '.menu-grid-cell{position:relative}' +
      '.msw2-btn{position:absolute;top:9px;right:-11px;z-index:6;width:22px;height:22px;border-radius:50%;border:1.5px solid #c8bfb5;background:#fff;color:#7a6a58;font-size:13px;line-height:18px;padding:0;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.15)}' +
      '.msw2-btn:hover{background:#1a2332;color:#fff;border-color:#1a2332}' +
      '@media print{.msw2-btn{display:none}}';
    document.head.appendChild(st);
  }
  const LABEL = { lightBreakfast: 'Fruit, Coffee & Tea', breakfast: 'Breakfast', brunch: 'Brunch', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };
  function paint() {
    try {
      if (typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE && !document.body.classList.contains('admin-preview')) return;
      const grid = document.getElementById('menuGrid'); if (!grid) return;
      const dates = [...grid.querySelectorAll('.menu-day-header')].map(h => (/menuPrintDay\('([^']+)'\)/.exec(h.getAttribute('onclick') || '') || [])[1]);
      if (dates.length !== 7 || dates.some(d => !d)) return;
      const cells = [...grid.querySelectorAll('.menu-grid-cell')];
      const weekHasLunch = dates.some(ds => (menuSchedule[ds] && menuSchedule[ds].lunch || []).length > 0);
      const weekHasBreakfast = dates.some(ds => (menuSchedule[ds] && menuSchedule[ds].breakfast || []).length > 0);
      const meals = (a => typeof menuMealsFor === 'function' ? menuMealsFor(dates, a) : a)(['lightBreakfast', ...(weekHasBreakfast ? ['breakfast'] : []), 'brunch', ...(weekHasLunch ? ['lunch'] : []), 'snack', 'dinner']);
      if (cells.length !== meals.length * 7) return;
      cells.forEach((cell, n) => {
        const col = n % 7; if (col === 6 || cell.querySelector('.msw2-btn')) return;
        const meal = meals[Math.floor(n / 7)];
        const b = document.createElement('button'); b.type = 'button'; b.className = 'msw2-btn'; b.textContent = '⇄';
        b.title = 'Swap this ' + LABEL[meal] + ' with the next day';
        b.addEventListener('click', ev => { ev.stopPropagation(); swap(dates[col], dates[col + 1], meal); });
        cell.appendChild(b);
      });
    } catch (e) { console.warn('[menu-swap-days]', e); }
  }
  async function swap(dsA, dsB, meal) {
    try {
      const a = menuDayIndex(dsA), b = menuDayIndex(dsB), nm = i => (typeof mceDayName === 'function' ? mceDayName(i) : 'Day ' + i);
      if (!confirm('Swap ' + LABEL[meal] + ' between ' + nm(a) + ' and ' + nm(b) + '?\n\nThis changes the weekly menu, so every ' + nm(a) + ' and ' + nm(b) + ' follows it.')) return;
      await mceLoadState();
      const da = (_meDays[a] = _meDays[a] || {}), db = (_meDays[b] = _meDays[b] || {});
      const x = da[meal], y = db[meal];
      if (y === undefined) delete da[meal]; else da[meal] = y;
      if (x === undefined) delete db[meal]; else db[meal] = x;
      await mceCommit();
      showToast(LABEL[meal] + ' swapped ⇄');
    } catch (e) { console.warn('[menu-swap-days]', e); showToast('Could not swap — refresh the page and try again.'); }
  }
  const o = window.menuRenderWeek;
  if (typeof o === 'function') window.menuRenderWeek = function () { const r = o.apply(this, arguments); setTimeout(paint, 20); return r; };
  setTimeout(paint, 20);
})();
