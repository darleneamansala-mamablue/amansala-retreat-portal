// ===== menu-swap-days.js — a small ⇄ arrow between two neighbouring days of the same meal swaps those two days' dishes (Darlene 2026-10-26) =====
// The 7-day layout is untouched: each meal box gets a little arrow on its right edge. Click it, confirm, and the meal (all its dishes; for dinner the main, sides and dessert) trades places
// with the next day's. It uses the Menu Editor's own load/save (menu-click-edit.js helpers), so history, "someone else saved" checks and Menu 1/Menu 2 all work as for any other dish edit.
// Like every Menu edit it changes that weekday in the weekly pattern, not just this one date.
(function () {
  if (!document.getElementById('msw2Css')) {
    const st = document.createElement('style'); st.id = 'msw2Css';
    st.textContent = '.menu-grid-cell{position:relative}' +
      '.msw2-btn{position:absolute;top:9px;right:-13px;z-index:6;width:26px;height:26px;border-radius:50%;border:1.5px solid #c8bfb5;background:#fff;color:#7a6a58;font-size:13px;line-height:22px;padding:0;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.15)}' +
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
  // In-page confirmation (the browser's own confirm box can be blocked or silently dismissed, which made the arrow look dead)
  function ask(title, body) {
    return new Promise(res => {
      const w = document.createElement('div'); w.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px';
      w.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:420px;width:100%;padding:20px 22px;font-family:inherit;box-shadow:0 10px 40px rgba(0,0,0,.3)"><div style="font-size:16px;font-weight:800;color:#1a2332;margin-bottom:8px"></div><div style="font-size:13px;color:#4b5563;line-height:1.5;margin-bottom:16px"></div><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" data-n style="padding:8px 14px;border:1px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit">Cancel</button><button type="button" data-y style="padding:8px 16px;border:none;border-radius:8px;background:#1a2332;color:#fff;font-weight:700;cursor:pointer;font-family:inherit">Swap</button></div></div>';
      w.firstChild.children[0].textContent = title; w.firstChild.children[1].innerText = body;
      const done = v => { w.remove(); res(v); };
      w.querySelector('[data-y]').onclick = () => done(true); w.querySelector('[data-n]').onclick = () => done(false); w.addEventListener('click', e => { if (e.target === w) done(false); });
      document.body.appendChild(w);
    });
  }
  let busy = false;
  async function swap(dsA, dsB, meal) {
    if (busy) { showToast('Still saving the last swap…'); return; }
    try {
      const a = menuDayIndex(dsA), b = menuDayIndex(dsB), nm = i => (typeof mceDayName === 'function' ? mceDayName(i) : 'Day ' + i);
      if (!await ask('Swap ' + LABEL[meal] + ': ' + nm(a) + ' ⇄ ' + nm(b), nm(a) + ' and ' + nm(b) + ' trade their ' + LABEL[meal].toLowerCase() + ' dishes.\n\nThis changes the weekly menu, so every ' + nm(a) + ' and ' + nm(b) + ' follows it.')) return;
      busy = true; showToast('Swapping…');
      await mceLoadState();
      const da = (_meDays[a] = _meDays[a] || {}), dbb = (_meDays[b] = _meDays[b] || {});
      const x = da[meal], y = dbb[meal];
      if (y === undefined) delete da[meal]; else da[meal] = y;
      if (x === undefined) delete dbb[meal]; else dbb[meal] = x;
      await mceCommit();
      showToast(LABEL[meal] + ' swapped ⇄');
    } catch (e) { console.warn('[menu-swap-days]', e); showToast('Could not swap: ' + (e && e.message ? e.message : 'refresh the page (Cmd+Shift+R) and try again.')); }
    busy = false;
  }
  const o = window.menuRenderWeek;
  if (typeof o === 'function') window.menuRenderWeek = function () { const r = o.apply(this, arguments); setTimeout(paint, 20); return r; };
  setTimeout(paint, 20);
})();
