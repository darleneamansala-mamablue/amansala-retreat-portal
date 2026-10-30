// ===== menu-kilos-today.js — "Kilos to order" box + the Menu opens on today's week (Darlene 2026-10-30) =====
// Loaded as a classic script AFTER menu.js and menu-portion-rule.js; shares global scope. Standalone: menuBuild and menuRenderWeek are only wrapped.
//   1. Opening the Menu tab always lands on the week that has TODAY in it, and today's day is marked. (Arrows / jump-to-date still work while you are on the tab.)
//   2. A "Kilos to order" box above the week: for every day, the protein of the Brunch, the Lunch and the Dinner, how many guests are on that meal's list (the # column),
//      and the kilos to order at the portion rule (Brunch and Lunch 200 g, Dinner 250 g) — plus the week total for each protein.
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

  function weekDates() {
    const out = [], d0 = new Date(menuCurrentMonday + 'T12:00:00');
    for (let i = 0; i < 7; i++) { const d = new Date(d0); d.setDate(d0.getDate() + i); out.push(ymd(d)); }
    return out;
  }
  function lines() {
    const rows = [];
    weekDates().forEach(ds => {
      const md = (typeof menuDataFor === 'function' && menuDataFor(ds)) || {}, sc = menuSchedule[ds] || {};
      const star = list => ((list || []).find(x => /★/.test(x)) || '').replace(/★/g, '').trim();
      const add = (meal, label, protein) => { if (!protein) return; const n = pax(sc[meal]); rows.push({ ds, meal, label, protein, n, kg: n * G[meal] / 1000 }); };
      add('brunch', 'Brunch', star(md.brunch));
      if ((sc.lunch || []).length) add('lunch', 'Lunch', star(md.lunch));
      add('dinner', 'Dinner', (md.dinner && md.dinner.protein) || '');
    });
    return rows;
  }
  function boxHtml() {
    const L = lines(), tot = {};
    L.forEach(r => { const k = r.protein.toLowerCase(); (tot[k] = tot[k] || { name: r.protein, kg: 0 }).kg += r.kg; });
    const td = 'padding:5px 9px;border-top:1px solid #f0e6c8;font-size:12.5px';
    const body = L.map(r => {
      const d = new Date(r.ds + 'T12:00:00'), today = r.ds === todayStr();
      return `<tr style="${today ? 'background:#fef3c7' : ''}"><td style="${td};font-weight:700">${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${today ? ' · today' : ''}</td><td style="${td}">${r.label}</td><td style="${td}">${esc(r.protein)}</td><td style="${td};text-align:center">${r.n || '—'}</td><td style="${td};text-align:center;color:#6b7280">${G[r.meal]} g</td><td style="${td};text-align:right;font-weight:800">${r.n ? kg(r.kg) + ' kg' : '—'}</td></tr>`;
    }).join('');
    const totHtml = Object.values(tot).filter(t => t.kg > 0).map(t => `<span style="background:#fff;border:1.5px solid #fcd34d;border-radius:99px;padding:3px 11px;font-size:12.5px"><b>${esc(t.name)}</b> ${kg(t.kg)} kg</span>`).join(' ');
    const sum = Object.values(tot).reduce((n, t) => n + t.kg, 0);
    return `<details open style="margin:0 0 14px;padding:10px 14px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:12px;font-family:'Jost',sans-serif;color:#2d2520">
      <summary style="cursor:pointer;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#92400e">🛒 Kilos to order this week${sum ? ' · ' + kg(sum) + ' kg of protein' : ''}</summary>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${totHtml || '<span style="font-size:13px;color:#6b7280">No guests are on the meal lists yet, so there is nothing to order.</span>'}</div>
      ${L.length ? `<table style="border-collapse:collapse;margin-top:8px;width:100%;max-width:720px"><thead><tr style="text-align:left;font-size:10.5px;text-transform:uppercase;color:#8a7e74"><th style="padding:3px 9px">Day</th><th style="padding:3px 9px">Meal</th><th style="padding:3px 9px">Protein</th><th style="padding:3px 9px;text-align:center">Guests</th><th style="padding:3px 9px;text-align:center">Per person</th><th style="padding:3px 9px;text-align:right">To order</th></tr></thead><tbody>${body}</tbody></table>` : ''}
      <div style="font-size:11.5px;color:#92400e;margin-top:6px">Guests = the # on each meal's list. Brunch and Lunch 200 g, Dinner 250 g per person. Add or change a group's # and this updates.</div></details>`;
  }
  function decorate() {
    try {
      const grid = document.getElementById('menuGrid'); if (!grid || typeof menuSchedule === 'undefined') return;
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
