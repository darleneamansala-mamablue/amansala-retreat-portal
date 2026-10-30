// ===== menu-grid-dnd.js — drag and drop dishes on the Menu grid (Darlene 2026-10-30) =====
// Loaded as a classic script AFTER menu-click-edit.js and menu-inline-edit.js; shares global scope. Standalone: uses the addresses menu-click-edit.js puts on each cell and dish.
//   - Drag a dish onto another day or meal to move it there (same as "Move to…" in the dish window).
//   - Drop it ON another dish of that meal to put it just before that dish (this also re-orders dishes inside one meal).
//   - Whole sections: the ⠿ grip in the corner of a meal box drags the entire meal (all its dishes) onto another meal box and the two swap. Drag a day's heading onto another day's heading and the two whole days swap.
//   - The dinner main (★) and the dessert can be dragged to another day's dinner: the two swap.
// Saved straight away through the same path as every other click-edit: it is the weekly pattern of the menu in use. The page stays where it is.
(function () {
  let drag = null, busy = false;
  const css = document.createElement('style');
  css.textContent = '#menuGrid .menu-grid-cell{position:relative}#menuGrid .mie-grip{position:absolute;top:2px;right:3px;z-index:2;cursor:grab;font-size:13px;line-height:1;color:#8a7e74;opacity:.55;padding:1px 3px;border-radius:4px;background:rgba(255,255,255,.7)}#menuGrid .mie-grip:hover{opacity:1;background:#fff7ed}#menuGrid .menu-day-header[data-mie-day]{cursor:grab}#menuGrid .mie-drop-h{outline:3px dashed #2d6a6a!important;outline-offset:-3px}#menuGrid .menu-dish[data-mce-ds]{cursor:grab}#menuGrid .mie-drop{outline:2px dashed #2d6a6a!important;outline-offset:-2px;background:#ecfdf5!important}#menuGrid .menu-dish.mie-drag{opacity:.4}#menuGrid .menu-dish.mie-before{box-shadow:0 -3px 0 #2d6a6a}';
  document.head.appendChild(css);
  const grid = () => document.getElementById('menuGrid');
  const single = p => p === 'dinner.protein' || p === 'dinner.dessert';
  const pathOfCell = cell => cell.dataset.mceMeal === 'dinner' ? 'dinner.dishes' : cell.dataset.mceMeal;
  const clean = s => (typeof meClean === 'function' ? meClean(s) : String(s || '').replace(/★/g, '').trim());

  function arm() {
    const g = grid(); if (!g) return;
    g.querySelectorAll('.menu-dish[data-mce-ds]').forEach(el => { el.draggable = true; });
    g.querySelectorAll('.menu-grid-cell[data-mce-ds]').forEach(c => {
      if (c.querySelector('.mie-grip')) return;
      const gp = document.createElement('span'); gp.className = 'mie-grip'; gp.textContent = '⠿'; gp.draggable = true; gp.title = 'Drag this whole meal onto another meal to swap them';
      c.appendChild(gp);
    });
    g.querySelectorAll('.menu-day-header').forEach(h => {
      const d = (/menuPrintDay\('([^']+)'\)/.exec(h.getAttribute('onclick') || '') || [])[1]; if (!d || h.dataset.mieDay) return;
      h.dataset.mieDay = d; h.draggable = true; h.title = 'Click to print this day. Drag onto another day to swap the two whole days.';
    });
  }
  // ---- whole sections: a meal box, or a whole day ----
  let sec = null;
  const dayName = ds => (typeof mceDayName === 'function' ? mceDayName(menuDayIndex(ds)) : ds);
  document.addEventListener('dragstart', e => {
    const gp = e.target.closest && e.target.closest('#menuGrid .mie-grip');
    if (gp) { const c = gp.closest('.menu-grid-cell'); sec = { kind: 'meal', ds: c.dataset.mceDs, meal: c.dataset.mceMeal }; }
    else { const h = e.target.closest && e.target.closest('#menuGrid .menu-day-header[data-mie-day]'); if (!h || e.target.closest('.menu-dish')) return; sec = { kind: 'day', ds: h.dataset.mieDay }; }
    try { e.dataTransfer.setData('text/plain', 'menu-section'); e.dataTransfer.effectAllowed = 'move'; } catch (x) {}
  });
  const secTarget = e => sec && (sec.kind === 'meal' ? (e.target.closest && e.target.closest('#menuGrid .menu-grid-cell[data-mce-ds]')) : (e.target.closest && e.target.closest('#menuGrid .menu-day-header[data-mie-day]')));
  document.addEventListener('dragover', e => {
    const t = secTarget(e); if (!t) return;
    if (sec.kind === 'meal' && (t.dataset.mceMeal === 'dinner') !== (sec.meal === 'dinner')) return;   // dinner swaps only with dinner
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('#menuGrid .mie-drop,#menuGrid .mie-drop-h').forEach(n => n.classList.remove('mie-drop', 'mie-drop-h')); t.classList.add(sec.kind === 'meal' ? 'mie-drop' : 'mie-drop-h');
  });
  document.addEventListener('dragend', () => { sec = null; document.querySelectorAll('#menuGrid .mie-drop,#menuGrid .mie-drop-h').forEach(n => n.classList.remove('mie-drop', 'mie-drop-h')); });
  document.addEventListener('drop', async e => {
    const t = secTarget(e); if (!t) return; e.preventDefault();
    const src = sec; sec = null; document.querySelectorAll('#menuGrid .mie-drop,#menuGrid .mie-drop-h').forEach(n => n.classList.remove('mie-drop', 'mie-drop-h'));
    const toDs = src.kind === 'meal' ? t.dataset.mceDs : t.dataset.mieDay, toMeal = src.kind === 'meal' ? t.dataset.mceMeal : null;
    if (src.kind === 'meal' && (toMeal === 'dinner') !== (src.meal === 'dinner')) return;
    if (src.ds === toDs && (src.kind === 'day' || src.meal === toMeal)) return;
    const labelMeal = m => ({ lightBreakfast: 'Fruit, Coffee & Tea', breakfast: 'Breakfast', brunch: 'Brunch', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' }[m] || m);
    const wk = 'This is the weekly menu, so it changes every ' + dayName(src.ds) + ' and ' + dayName(toDs) + ' that use ' + ((typeof MENU_VARIANTS !== 'undefined' && MENU_VARIANTS[mceVariantNow()]) || 'this menu') + '.';
    const q = src.kind === 'day' ? 'Swap the whole ' + dayName(src.ds) + ' menu with ' + dayName(toDs) + '?\n\n' + wk : 'Swap ' + labelMeal(src.meal) + ' on ' + dayName(src.ds) + ' with ' + labelMeal(toMeal) + ' on ' + dayName(toDs) + '?\n\n' + wk;
    if (!confirm(q)) return;
    if (busy) return; busy = true; const y = window.scrollY;
    try {
      await mceLoadState();
      const a = menuDayIndex(src.ds), b = menuDayIndex(toDs);
      _meDays[a] = _meDays[a] || {}; _meDays[b] = _meDays[b] || {};
      if (src.kind === 'day') { const t0 = _meDays[a]; _meDays[a] = _meDays[b]; _meDays[b] = t0; }
      else {
        const k1 = src.meal === 'dinner' ? 'dinner' : src.meal, k2 = toMeal === 'dinner' ? 'dinner' : toMeal;
        const v1 = _meDays[a][k1], v2 = _meDays[b][k2];
        if (v2 === undefined) delete _meDays[a][k1]; else _meDays[a][k1] = v2;
        if (v1 === undefined) delete _meDays[b][k2]; else _meDays[b][k2] = v1;
      }
      await mceCommit();
      setTimeout(() => window.scrollTo(0, y), 0); setTimeout(() => window.scrollTo(0, y), 150);
    } catch (err) { if (typeof showToast === 'function') showToast('Could not swap: ' + (err.message || err)); }
    busy = false;
  });
  document.addEventListener('dragstart', e => {
    const el = e.target.closest && e.target.closest('#menuGrid .menu-dish[data-mce-ds]'); if (!el) return;
    drag = { ds: el.dataset.mceDs, path: el.dataset.mcePath, i: el.dataset.mceI === '' ? null : +el.dataset.mceI, el };
    el.classList.add('mie-drag'); try { e.dataTransfer.setData('text/plain', 'menu-dish'); e.dataTransfer.effectAllowed = 'move'; } catch (x) {}
  });
  const clear = () => { document.querySelectorAll('#menuGrid .mie-drop,#menuGrid .mie-before,#menuGrid .mie-drag').forEach(n => n.classList.remove('mie-drop', 'mie-before', 'mie-drag')); };
  document.addEventListener('dragend', () => { clear(); drag = null; });
  document.addEventListener('dragover', e => {
    if (!drag) return; const cell = e.target.closest && e.target.closest('#menuGrid .menu-grid-cell[data-mce-ds]'); if (!cell) return;
    if (single(drag.path) && cell.dataset.mceMeal !== 'dinner') return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('#menuGrid .mie-drop,#menuGrid .mie-before').forEach(n => { if (n !== cell) n.classList.remove('mie-drop'); n.classList.remove('mie-before'); });
    cell.classList.add('mie-drop');
    const t = e.target.closest('.menu-dish[data-mce-ds]'); if (t && t !== drag.el && !single(t.dataset.mcePath) && !single(drag.path)) t.classList.add('mie-before');
  });
  document.addEventListener('drop', async e => {
    if (!drag) return; const cell = e.target.closest && e.target.closest('#menuGrid .menu-grid-cell[data-mce-ds]'); if (!cell) return;
    e.preventDefault();
    const src = drag, toDs = cell.dataset.mceDs, toPath = pathOfCell(cell), onDish = e.target.closest('.menu-dish[data-mce-ds]');
    const before = onDish && !single(onDish.dataset.mcePath) && onDish !== src.el && onDish.dataset.mcePath === toPath && onDish.dataset.mceDs === toDs ? +onDish.dataset.mceI : null;
    clear(); drag = null;
    if (busy) return;
    if (single(src.path) && cell.dataset.mceMeal !== 'dinner') return;
    if (src.ds === toDs && src.path === toPath && before == null && !single(src.path)) return;
    if (single(src.path) && src.ds === toDs) return;
    busy = true;
    const y = window.scrollY;
    try {
      await mceLoadState();
      const fromDi = menuDayIndex(src.ds), toDi = menuDayIndex(toDs);
      if (single(src.path)) {   // swap the dinner main / dessert with the other day's
        const k = src.path === 'dinner.protein' ? 'protein' : 'dessert';
        const a = (_meDays[fromDi].dinner = _meDays[fromDi].dinner || { dishes: [] }), b = (_meDays[toDi].dinner = _meDays[toDi].dinner || { dishes: [] });
        const t = a[k]; if (b[k]) a[k] = b[k]; else delete a[k]; if (t) b[k] = t; else delete b[k];
      } else {
        const from = mceListOf(fromDi, src.path); let item = from[src.i]; if (item == null) { busy = false; return; }
        from.splice(src.i, 1);
        if (!(toPath === 'brunch' || toPath === 'lunch')) item = clean(item);
        const to = mceListOf(toDi, toPath);
        let at = before == null ? to.length : before;
        if (before != null && src.ds === toDs && src.path === toPath && src.i < before) at = before - 1;   // the list shrank by one before the insert
        to.splice(Math.max(0, Math.min(at, to.length)), 0, item);
      }
      await mceCommit();
      setTimeout(() => window.scrollTo(0, y), 0); setTimeout(() => window.scrollTo(0, y), 150);
    } catch (err) { if (typeof showToast === 'function') showToast('Could not move it: ' + (err.message || err)); }
    busy = false;
  });
  const prev = window.menuRenderWeek;
  if (typeof prev === 'function') window.menuRenderWeek = function () { const r = prev.apply(this, arguments); setTimeout(arm, 150); return r; };
  setTimeout(arm, 2800);
})();
