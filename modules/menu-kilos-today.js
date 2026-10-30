// ===== menu-kilos-today.js — "Kilos to order" box + the Menu opens on today's week (Darlene 2026-10-30) =====
// Loaded as a classic script AFTER menu.js and menu-portion-rule.js; shares global scope. Standalone: menuBuild and menuRenderWeek are only wrapped.
//   1. Opening the Menu tab always lands on the week that has TODAY in it, and today's day is marked. (Arrows / jump-to-date still work while you are on the tab.)
//   2. A "Kilos to order" box above the week: for every day, the protein of the Brunch, the Lunch and the Dinner, how many guests are on that meal's list (the # column),
//      and the kilos to order at the portion rule (Brunch and Lunch 200 g, Dinner 250 g) — plus the week total for each protein.
//   2b. Choosing a date, a month, today or the week arrows adds that week's retreats to the menu automatically (same as when the tab opens). Opening the Menu also scrolls to today.
//   3. In the Dinner Kg boxes, a row that has a # shows its kilos (# × 250 g) in grey until you type your own number.
// Guests come from the # column of each meal (the rows on the menu). Nothing is saved by this module.
(function () {
  let boxOpen = true;
  const G = { brunch: 200, lunch: 200, dinner: 250 };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const kg = n => (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const todayStr = () => ymd(new Date());
  const pax = rows => (rows || []).reduce((n, r) => n + (parseInt(r.pax) || 0), 0);

  // 1. open on today's week
  const prevBuild = window.menuBuild;
  if (typeof prevBuild === 'function') {
    window.menuBuild = function () { try { menuCurrentMonday = menuGetSunday(new Date()); } catch (e) {} return prevBuild.apply(this, arguments); };
  }

  // choosing a date / month / today / arrows puts that week's retreats on the menu, like opening the tab does
  ['menuJumpToDate', 'menuJumpToMonth', 'menuGoToday', 'menuNavWeek'].forEach(n => {
    const f = window[n]; if (typeof f !== 'function') return;
    window[n] = function () { const r = f.apply(this, arguments); try { if (typeof menuPopulateFromRetreats === 'function') menuPopulateFromRetreats(true); } catch (e) { console.warn('[menu-kilos-today] populate', e); } return r; };
  });
  let scrollNext = false;
  if (typeof window.menuBuild === 'function') { const b2 = window.menuBuild; window.menuBuild = function () { scrollNext = true; return b2.apply(this, arguments); }; }

  function weekDates(mon) {
    const out = [], d0 = new Date((mon || menuCurrentMonday) + 'T12:00:00');
    for (let i = 0; i < 7; i++) { const d = new Date(d0); d.setDate(d0.getDate() + i); out.push(ymd(d)); }
    return out;
  }
  const peso = n => 'MX$ ' + Math.round(n).toLocaleString('en-US');
  // price per kilo of the protein for that day's meal (same prices as the Menu Costs panel)
  function priceFor(ds, meal) {
    try {
      const a = (typeof menuAssignForIdx === 'function' && menuAssignForIdx(menuDayIndex(ds))) || {};
      const id = meal === 'dinner' ? a.dinner : a.midday, p = (menuProteinPrices || []).find(x => x.id === id);
      return p && p.unit === 'KG' ? Number(p.price) || 0 : 0;
    } catch (e) { return 0; }
  }
  function lines(dates, from, to) {
    const rows = [];
    (dates || weekDates()).forEach(ds => {
      if ((from && ds < from) || (to && ds > to)) return;
      const md = (typeof menuDataFor === 'function' && menuDataFor(ds)) || {}, sc = menuSchedule[ds] || {};
      const star = list => ((list || []).find(x => /★/.test(x)) || '').replace(/★/g, '').trim();
      const add = (meal, label, protein) => {
        if (!protein) return; const n = pax(sc[meal]), k = n * G[meal] / 1000, pr = priceFor(ds, meal);
        const used = (sc[meal] || []).reduce((t, r) => t + (parseFloat(r.kg) || 0), 0);
        rows.push({ ds, meal, label, protein, n, kg: k, price: pr, cost: k * pr, used });
      };
      add('brunch', 'Brunch', star(md.brunch));
      if ((sc.lunch || []).length) add('lunch', 'Lunch', star(md.lunch));
      add('dinner', 'Dinner', (md.dinner && md.dinner.protein) || '');
    });
    return rows;
  }
  // a chosen From–To (up to 62 days): each week is filled with its retreats the way the Menu does, read, then the screen is put back exactly as it was (nothing is saved)
  let range = null, rangeRows = [];
  function rangeLines() {
    const snap = JSON.stringify(menuSchedule), mon = menuCurrentMonday, saveFn = window.menuSaveSchedule, rows = [];
    try {
      window.menuSaveSchedule = function () {};
      let cur = menuGetSunday(new Date(range.from + 'T12:00:00'));
      for (let i = 0; i < 10; i++) {
        menuCurrentMonday = cur; try { menuPopulateFromRetreats(true); } catch (e) {}
        rows.push.apply(rows, lines(weekDates(cur), range.from, range.to));
        const nx = new Date(cur + 'T12:00:00'); nx.setDate(nx.getDate() + 7); cur = ymd(nx); if (cur > range.to) break;
      }
    } catch (e) { console.warn('[menu-kilos-today] range', e); }
    finally {
      window.menuSaveSchedule = saveFn; menuCurrentMonday = mon;
      try { const back = JSON.parse(snap); Object.keys(menuSchedule).forEach(k => delete menuSchedule[k]); Object.assign(menuSchedule, back); } catch (e) {}
    }
    return rows;
  }
  window.mkoSetRange = function () {
    const f = (document.getElementById('mkoFrom') || {}).value, t = (document.getElementById('mkoTo') || {}).value;
    if (!f || !t) { try { showToast('Pick both dates.'); } catch (e) {} return; }
    if (t < f) { try { showToast('The end date is before the start date.'); } catch (e) {} return; }
    if ((new Date(t) - new Date(f)) / 86400000 > 62) { try { showToast('Please pick 62 days or fewer.'); } catch (e) {} return; }
    range = { from: f, to: t }; rangeRows = rangeLines(); decorate();
  };
  window.mkoThisWeek = function () { range = null; decorate(); };
  function boxHtml() {
    const L = range ? rangeRows : lines(), tot = {};
    L.forEach(r => { const k = r.protein.toLowerCase(); const t = (tot[k] = tot[k] || { name: r.protein, kg: 0, cost: 0 }); t.kg += r.kg; t.cost += r.cost; });
    const td = 'padding:5px 9px;border-top:1px solid #f0e6c8;font-size:12.5px';
    const body = L.map(r => {
      const d = new Date(r.ds + 'T12:00:00'), today = r.ds === todayStr();
      return `<tr style="${today ? 'background:#fef3c7' : ''}"><td style="${td};font-weight:700">${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${today ? ' · today' : ''}</td><td style="${td}">${r.label}</td><td style="${td}">${esc(r.protein)}</td><td style="${td};text-align:center">${r.n || '—'}</td><td style="${td};text-align:right;font-weight:800">${r.kg ? kg(r.kg) + ' kg' : '—'}</td><td style="${td};text-align:right">${r.price ? peso(r.price) + '/kg' : '<span style="color:#b45309">no price</span>'}</td><td style="${td};text-align:right;font-weight:800">${r.cost ? peso(r.cost) : '—'}</td><td style="${td};text-align:right">${r.used ? kg(r.used) + ' kg' : '—'}</td></tr>`;
    }).join('');
    const totHtml = Object.values(tot).filter(t => t.kg > 0).map(t => `<span style="background:#fff;border:1.5px solid #fcd34d;border-radius:99px;padding:3px 11px;font-size:12.5px"><b>${esc(t.name)}</b> ${kg(t.kg)} kg${t.cost ? ' · ' + peso(t.cost) : ''}</span>`).join(' ');
    const sum = Object.values(tot).reduce((n, t) => n + t.kg, 0), sumCost = Object.values(tot).reduce((n, t) => n + t.cost, 0);
    const lab = range ? `${range.from} → ${range.to}` : 'this week';
    const inp = 'padding:4px 6px;border:1.5px solid #fcd34d;border-radius:7px;font-family:inherit;font-size:12.5px;background:#fff';
    const btn = 'padding:5px 12px;border:none;border-radius:7px;background:#92400e;color:#fff;font-weight:700;font-family:inherit;font-size:12.5px;cursor:pointer';
    const dFrom = range ? range.from : (menuCurrentMonday || ''), dTo = range ? range.to : (weekDates()[6] || '');
    return `<details open style="margin:0 0 14px;padding:10px 14px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:12px;font-family:'Jost',sans-serif;color:#2d2520">
      <summary style="cursor:pointer;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#92400e">🛒 Kilos to order ${lab}${sum ? ' · ' + kg(sum) + ' kg of protein' + (sumCost ? ' · ' + peso(sumCost) : '') : ''}</summary>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12.5px"><b>From</b> <input type="date" id="mkoFrom" value="${dFrom}" style="${inp}"> <b>to</b> <input type="date" id="mkoTo" value="${dTo}" style="${inp}"> <button type="button" onclick="mkoSetRange()" style="${btn}">Show these dates</button>${range ? `<button type="button" onclick="mkoThisWeek()" style="${btn};background:#6b7280">Back to the week on screen</button>` : ''}</div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${totHtml || '<span style="font-size:13px;color:#6b7280">No guests are on the meal lists yet, so there is nothing to order.</span>'}</div>
      ${L.length ? `<table style="border-collapse:collapse;margin-top:8px;width:100%;max-width:980px"><thead><tr style="text-align:left;font-size:10.5px;text-transform:uppercase;color:#8a7e74"><th style="padding:3px 9px">Day</th><th style="padding:3px 9px">Meal</th><th style="padding:3px 9px">Protein</th><th style="padding:3px 9px;text-align:center">Guests</th><th style="padding:3px 9px;text-align:right">To order</th><th style="padding:3px 9px;text-align:right">Price</th><th style="padding:3px 9px;text-align:right">Cost</th><th style="padding:3px 9px;text-align:right" title="The Kg you typed on the dinner lines">Kg used</th></tr></thead><tbody>${body}</tbody></table>` : ''}
      <div style="font-size:11.5px;color:#92400e;margin-top:6px">Guests = the # on each meal's list. Brunch and Lunch 200 g, Dinner 250 g per person. Price = the price per kilo in Menu Costs (pesos); "no price" = set it there. Kg used = what you typed in the dinner Kg boxes.</div></details>`;
  }
  let costReady = false;   // the price list is only loaded once the Menu Costs panel is opened, so load it here too
  function ensureCost() {
    if (costReady) return; costReady = true;
    try { if (!menuProteinPrices.length && typeof menuLoadCostData === 'function') menuLoadCostData(); } catch (e) {}
    try { if (typeof menuSyncCostDataFromSupabase === 'function') menuSyncCostDataFromSupabase().then(() => { try { if (range) rangeRows = rangeLines(); decorate(); } catch (e) {} }); } catch (e) {}
  }
  function decorate() {
    try {
      ensureCost();
      const grid = document.getElementById('menuGrid'); if (!grid || typeof menuSchedule === 'undefined' || !menuCurrentMonday) return;
      let box = document.getElementById('mkoBox');
      const html = boxHtml();
      if (!box) { box = document.createElement('div'); box.id = 'mkoBox'; grid.parentNode.insertBefore(box, grid); }
      box.innerHTML = html; const dt = box.querySelector('details'); if (dt) { dt.open = boxOpen; dt.addEventListener('toggle', () => { boxOpen = dt.open; }); }
      // today's day header
      const ts = todayStr();
      grid.querySelectorAll('.menu-day-header').forEach(h => {
        const d = (/menuPrintDay\('([^']+)'\)/.exec(h.getAttribute('onclick') || '') || [])[1];
        if (d === ts && !h.dataset.mkoToday) { h.dataset.mkoToday = '1'; h.style.outline = '3px solid #f59e0b'; h.style.outlineOffset = '-3px'; h.insertAdjacentHTML('beforeend', '<div style="font-size:10px;font-weight:800;color:#f59e0b;letter-spacing:.6px">TODAY</div>'); }
      });
      if (scrollNext) { scrollNext = false; const th = grid.querySelector('[data-mko-today]'); if (th) { try { th.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) {} } }
      // dinner Kg boxes show # × 250 g until you type your own
      grid.querySelectorAll('input[placeholder="Kg"], input.mko-kg').forEach(inp => {
        const tr = inp.closest('tr'); if (!tr) return; const ins = tr.querySelectorAll('input');
        const n = parseInt(ins[2] && ins[2].value) || 0; inp.classList.add('mko-kg');
        if (n && !inp.value) inp.placeholder = kg(n * G.dinner / 1000);
      });
    } catch (e) { console.warn('[menu-kilos-today]', e); }
  }
  const prevRender = window.menuRenderWeek;
  if (typeof prevRender === 'function') window.menuRenderWeek = function () { const r = prevRender.apply(this, arguments); setTimeout(decorate, 120); return r; };
  setTimeout(decorate, 2500);
})();
