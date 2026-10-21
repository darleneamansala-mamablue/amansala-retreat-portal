// ===== menu-kitchen-costing.js — Kitchen Costing view for the Menu tab =====
// Loaded as a classic script AFTER menu.js and menu-variants.js; shares global scope. Standalone: adds a "Kitchen Costing" button and
// its own panel next to the existing Cost view and wraps menuToggleCostView / menuRenderWeek so the two views never show together.
// Nothing in menu.js is edited and the old Cost panel is untouched.
// What it does: for the week being viewed, takes the dishes from the menu (menuDataForIdx), the guests per meal from menuSchedule,
// and a recipe sheet (grams per portion) plus a price list (pesos per kg / per piece), and works out food cost per day and per
// plate, kilos to buy, and a shopping list grouped by type. Prices and recipes are pasted in from a spreadsheet (Import) and stored
// in app_store under 'kitchenCosting' (also cached in localStorage). Dishes with no recipe are listed, never costed as $0 silently.
let kc = { ingredients: [], recipes: [] };   // ingredients:[{name,category,unit:'kg'|'pza',price,supplier}], recipes:[{dish,ingredient,qty}] qty = grams (kg items) or pieces (pza items)
let kcOpen = false, kcDay = 0, kcShowImport = false;
const KC_KEY = 'kitchenCosting', KC_LS = 'amansala_kitchen_costing';
const KC_CATS = ['Proteína', 'Verduras', 'Fruta', 'Lácteos', 'Abarrotes'];

const kcNorm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/★/g, '').replace(/\s+/g, ' ').trim();
const kcEsc = s => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kcMoney = n => '$' + Math.round(n || 0).toLocaleString('en-US');
function kcQty(q, unit) { return unit === 'pza' ? `${Math.round(q)} pza` : (q >= 1000 ? `${(q / 1000).toFixed(q >= 10000 ? 1 : 2).replace(/\.?0+$/, '')} kg` : `${Math.round(q)} g`); }
function kcAddDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; }

// ---- storage: every change re-reads the stored copy first, so one person's edit can't wipe another's ----
function kcLoadLocal() { try { const v = JSON.parse(localStorage.getItem(KC_LS) || 'null'); if (v && Array.isArray(v.ingredients)) kc = { ingredients: v.ingredients, recipes: v.recipes || [] }; } catch (e) {} }
async function kcPull() {
  try {
    const { data } = await db.from('app_store').select('value').eq('key', KC_KEY).maybeSingle();
    if (data && data.value && Array.isArray(data.value.ingredients)) { kc = { ingredients: data.value.ingredients, recipes: data.value.recipes || [] }; try { localStorage.setItem(KC_LS, JSON.stringify(kc)); } catch (e) {} }
  } catch (e) { console.warn('[kitchen costing] load failed', e); }
}
async function kcMutate(fn) {
  await kcPull();
  fn(kc);
  try { localStorage.setItem(KC_LS, JSON.stringify(kc)); } catch (e) {}
  try { const { error } = await db.from('app_store').upsert({ key: KC_KEY, value: kc, updated_at: new Date().toISOString() }); if (error) throw error; }
  catch (e) { console.warn('[kitchen costing] save failed', e); showToast('Could not save to the server — change is only on this computer.'); }
  kcRender();
}

// ---- costing ----
function kcIngredient(name) { const n = kcNorm(name); return kc.ingredients.find(i => kcNorm(i.name) === n); }
function kcDishLines(dish) { const n = kcNorm(dish); return kc.recipes.filter(r => kcNorm(r.dish) === n); }
// One portion of a dish → { cost, lines:[{ing,qty}], hasRecipe, missing:[ingredient names with no price] }
function kcDishPortion(dish) {
  const lines = kcDishLines(dish), out = { cost: 0, lines: [], hasRecipe: lines.length > 0, missing: [] };
  lines.forEach(l => {
    const ing = kcIngredient(l.ingredient);
    if (!ing || !(ing.price >= 0) || ing.price === '' || ing.price == null) { out.missing.push(l.ingredient); return; }
    const qty = Number(l.qty) || 0;
    out.cost += ing.price * (ing.unit === 'pza' ? qty : qty / 1000);
    out.lines.push({ ing, qty });
  });
  return out;
}
function kcPaxFor(dateStr, key) { return ((menuSchedule[dateStr] || {})[key] || []).reduce((n, r) => n + (parseInt(r.pax) || 0), 0); }

// The week's meals: [{day, date, meals:[{label, pax, dishes:[{name, plates, star}]}]}]
function kcWeek() {
  const days = [];
  for (let di = 1; di <= 7; di++) {
    const date = kcAddDays(menuCurrentMonday, di - 1), d = menuDataForIdx(di) || {}, meals = [];
    const lbPax = kcPaxFor(date, 'lightBreakfast');
    const light = ((d.lightBreakfast || []).join(' · ')).split(/\s*·\s*/).filter(Boolean);
    if (lbPax && light.length) meals.push({ label: 'Fruit, Coffee & Tea', pax: lbPax, dishes: light.map(n => ({ name: n, plates: lbPax })) });
    const bf = d.breakfast || [];
    if (lbPax && bf.length) { // the first three are served to everyone, the rest are choices split evenly
      const choices = Math.max(bf.length - 3, 0);
      meals.push({ label: 'Breakfast', pax: lbPax, dishes: bf.map((n, i) => ({ name: n, plates: i >= 3 ? lbPax / choices : lbPax, choice: i >= 3 })) });
    }
    const brPax = kcPaxFor(date, 'brunch'), inBf = new Set(bf.map(kcNorm));
    const br = (d.brunch || []).filter(n => !inBf.has(kcNorm(n)));
    if (brPax && br.length) meals.push({ label: 'Brunch', pax: brPax, dishes: br.map(n => ({ name: n, plates: brPax, star: n.includes('★') })) });
    const snPax = kcPaxFor(date, 'snack');
    if (snPax && (d.snack || []).length) meals.push({ label: 'Snack', pax: snPax, dishes: d.snack.map(n => ({ name: n, plates: snPax })) });
    const dnPax = kcPaxFor(date, 'dinner'), dn = d.dinner || {};
    if (dnPax && (dn.protein || (dn.dishes || []).length)) {
      const names = [dn.protein && { name: dn.protein, star: true }, ...(dn.dishes || []).map(n => ({ name: n })), dn.dessert && { name: dn.dessert, dessert: true }].filter(Boolean);
      meals.push({ label: 'Dinner', pax: dnPax, dishes: names.map(x => ({ ...x, plates: dnPax })) });
    }
    days.push({ di, date, meals });
  }
  return days;
}

function kcCompute() {
  const week = kcWeek(), noRecipe = new Set(), noPrice = new Set(), dishTotals = {}, ing = {};
  let cost = 0, guestDays = 0;
  week.forEach(day => {
    day.cost = 0;
    day.maxPax = Math.max(0, ...day.meals.map(m => m.pax));
    day.meals.forEach(m => m.dishes.forEach(dish => {
      const p = kcDishPortion(dish.name);
      dish.portion = p; dish.total = p.cost * dish.plates;
      if (!p.hasRecipe) noRecipe.add(dish.name.replace(/\s*★/g, ''));
      p.missing.forEach(x => noPrice.add(x));
      day.cost += dish.total;
      const key = dish.name.replace(/\s*★/g, '');
      dishTotals[key] = (dishTotals[key] || 0) + dish.total;
      p.lines.forEach(l => {
        const k = kcNorm(l.ing.name);
        if (!ing[k]) ing[k] = { ing: l.ing, plates: 0, qty: 0, cost: 0 };
        ing[k].plates += dish.plates; ing[k].qty += l.qty * dish.plates;
        ing[k].cost += l.ing.price * (l.ing.unit === 'pza' ? l.qty : l.qty / 1000) * dish.plates;
      });
    }));
  });
  return { week, noRecipe: [...noRecipe], noPrice: [...noPrice], dishTotals, ing, sel: day => (day ? week.filter(w => w.di === day) : week) };
}

// ---- rendering ----
const KC_CARD = 'background:#fff;border:1.5px solid #e8dfd4;border-radius:14px;padding:14px 16px';
const KC_H = "font-family:'Cormorant Garamond',serif;font-size:19px;font-weight:600;color:#2d2520";
function kcRender() {
  const el = document.getElementById('menuKitchenPanel'); if (!el || !kcOpen) return;
  const c = kcCompute(), days = c.sel(kcDay), D = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekCost = c.week.reduce((s, d) => s + d.cost, 0);
  const selCost = days.reduce((s, d) => s + d.cost, 0), selGuestDays = days.reduce((s, d) => s + d.maxPax, 0);
  const dayIng = {};
  days.forEach(day => day.meals.forEach(m => m.dishes.forEach(dish => dish.portion.lines.forEach(l => {
    const k = kcNorm(l.ing.name); if (!dayIng[k]) dayIng[k] = { ing: l.ing, plates: 0, qty: 0, cost: 0 };
    dayIng[k].plates += dish.plates; dayIng[k].qty += l.qty * dish.plates; dayIng[k].cost += l.ing.price * (l.ing.unit === 'pza' ? l.qty : l.qty / 1000) * dish.plates;
  }))));
  const shop = Object.values(dayIng), kgTotal = shop.filter(x => x.ing.unit !== 'pza').reduce((s, x) => s + x.qty / 1000, 0);
  const eggs = shop.filter(x => x.ing.unit === 'pza' && /huevo/i.test(x.ing.name)).reduce((s, x) => s + x.qty, 0);
  const dishAgg = {}; days.forEach(d => d.meals.forEach(m => m.dishes.forEach(x => { const k = x.name.replace(/\s*★/g, ''); dishAgg[k] = (dishAgg[k] || 0) + x.total; })));
  const top = Object.entries(dishAgg).sort((a, b) => b[1] - a[1])[0];
  const tile = (label, big, sub, color) => `<div style="${KC_CARD}"><div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#8a7e74">${label}</div><div style="font-size:22px;font-weight:700;color:${color || '#2d2520'}">${big}</div><div style="font-size:11.5px;color:#6b7280">${sub}</div></div>`;
  const dayBtn = (v, label, amt) => `<button onclick="kcSetDay(${v})" style="padding:8px 14px;border-radius:10px;border:1.5px solid ${kcDay === v ? 'var(--teal,#2d6a6a)' : '#e8dfd4'};background:${kcDay === v ? 'var(--teal,#2d6a6a)' : '#fff'};color:${kcDay === v ? '#fff' : '#2d2520'};cursor:pointer;font-family:'Jost',sans-serif;text-align:left"><div style="font-size:11.5px;font-weight:700">${label}</div><div style="font-size:13px;font-weight:700">${kcMoney(amt)}</div></button>`;
  const maxDay = Math.max(1, ...c.week.map(d => d.cost));

  const menuHtml = days.map(day => `<div style="margin-top:16px"><div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1.5px solid #e8dfd4;padding-bottom:4px"><div style="${KC_H}">${D[day.di]} · ${day.date} <span style="font-size:12px;color:#8a7e74;font-family:Jost,sans-serif">Day ${day.di}</span></div><div style="font-weight:700;color:#059669">${kcMoney(day.cost)}</div></div>
    ${day.meals.length ? day.meals.map(m => `<div style="margin-top:8px"><div style="font-size:12px;font-weight:700;color:#2d2520">${m.label} <span style="color:#8a7e74;font-weight:400">· ${m.pax} pax</span></div>
      ${m.dishes.map(x => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:2px 0;color:#3a332c"><span>${x.star ? '★ ' : ''}${kcEsc(x.name.replace(/\s*★/g, ''))}${x.choice ? ' <i style="color:#8a7e74">choice</i>' : ''} <span style="color:#8a7e74">${+x.plates.toFixed(1)} × ${x.portion.hasRecipe ? kcMoney(x.portion.cost) : '—'}</span></span><span style="font-weight:600;white-space:nowrap">${x.portion.hasRecipe ? kcMoney(x.total) : '<span style="color:#b45309">no recipe</span>'}</span></div>`).join('')}</div>`).join('')
      : '<div style="font-size:12px;color:#8a7e74;padding:6px 0">No guest counts for this day in the Menu tab, so nothing is costed.</div>'}</div>`).join('');

  const cats = [...KC_CATS, ...[...new Set(shop.map(x => x.ing.category))].filter(x => x && !KC_CATS.includes(x)).sort()];
  const shopHtml = cats.map(cat => {
    const rows = shop.filter(x => x.ing.category === cat).sort((a, b) => b.cost - a.cost); if (!rows.length) return '';
    return `<div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-weight:700;font-size:13px;background:#f8f5f0;padding:6px 10px;border-radius:8px"><span>${kcEsc(cat)}</span><span>${kcMoney(rows.reduce((s, x) => s + x.cost, 0))}</span></div>
      ${rows.map(x => { const idx = kc.ingredients.indexOf(x.ing); return `<div style="display:grid;grid-template-columns:1.6fr 60px 90px 120px 110px 80px;gap:8px;align-items:center;font-size:12.5px;padding:5px 10px;border-bottom:1px solid #f0ebe0"><span>${kcEsc(x.ing.name)}</span><span style="color:#8a7e74">${Math.round(x.plates)}</span><span style="font-weight:600">${kcQty(x.qty, x.ing.unit)}</span><span>$<input type="number" step="0.01" value="${x.ing.price}" onchange="kcSetPrice(${idx},this.value)" style="width:70px;padding:3px 5px;border:1px solid #c8bfb5;border-radius:6px"> /${x.ing.unit === 'pza' ? 'pza' : 'kg'}</span><span style="color:#6b7280">${kcEsc(x.ing.supplier || '')}</span><span style="text-align:right;font-weight:700">${kcMoney(x.cost)}</span></div>`; }).join('')}</div>`;
  }).join('');

  const warn = [c.noRecipe.length ? `<b>No recipe yet (not costed):</b> ${c.noRecipe.map(kcEsc).join(', ')}` : '', c.noPrice.length ? `<b>No price for:</b> ${c.noPrice.map(kcEsc).join(', ')}` : ''].filter(Boolean);
  el.innerHTML = `<div style="max-width:1100px;margin:0 auto;text-align:left;font-family:'Jost',sans-serif;color:#2d2520">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div><div style="${KC_H};font-size:24px">Kitchen Costing</div><div style="font-size:12.5px;color:#6b7280">Week of ${menuCurrentMonday} · pesos MXN · pick a day or the whole week</div></div>
      <button onclick="kcToggleImport()" style="padding:7px 14px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:600">${kcShowImport ? 'Close Import' : '⬆ Import prices & recipes'}</button>
    </div>
    ${kcShowImport ? kcImportHtml() : ''}
    ${!kc.ingredients.length || !kc.recipes.length ? `<div style="${KC_CARD};margin-top:14px;background:#fff7ed;border-color:#fdba74;font-size:13px">No ${!kc.ingredients.length ? 'price list' : 'recipes'} loaded yet, so everything shows $0. Open <b>Import prices &amp; recipes</b> and paste in the spreadsheet.</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">${dayBtn(0, 'Whole week', weekCost)}${c.week.map(d => dayBtn(d.di, D[d.di] + ' ' + d.date.slice(8), d.cost)).join('')}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;margin-top:14px">
      ${tile('Food cost', kcMoney(selCost), kcDay ? D[kcDay] : 'whole week', '#059669')}
      ${tile('Per guest per day', selGuestDays ? kcMoney(selCost / selGuestDays) : '—', selGuestDays + ' guest-days (largest meal each day)')}
      ${tile('To buy', Math.round(kgTotal) + ' kg', eggs ? '+ ' + Math.round(eggs) + ' eggs' : 'plus pieces listed below')}
      ${tile('Most expensive dish', top && top[1] > 0 ? kcEsc(top[0]) : '—', top && top[1] > 0 ? kcMoney(top[1]) + ' · ' + Math.round(top[1] / (selCost || 1) * 100) + '% of the cost' : '')}
    </div>
    ${warn.length ? `<div style="${KC_CARD};margin-top:12px;font-size:12.5px;color:#b45309;background:#fffbeb;border-color:#fde68a">${warn.join('<br>')}</div>` : ''}
    <div style="${KC_H};margin-top:24px">Menu &amp; guests</div><div style="font-size:12px;color:#6b7280">Guests per meal come from the Menu tab. Breakfast uses the Fruit, Coffee &amp; Tea count; hot breakfast choices are split evenly.</div>${menuHtml}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:28px"><div><div style="${KC_H}">Shopping list</div><div style="font-size:12px;color:#6b7280">People = plates that use it. Change a price and it saves for everyone.</div></div>
      <button onclick="kcCopyList()" style="padding:7px 14px;border:none;border-radius:8px;background:var(--teal,#2d6a6a);color:#fff;cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:600">Copy list for WhatsApp</button></div>
    <div style="${KC_CARD};margin-top:8px;padding:6px 6px 12px">${shop.length ? shopHtml : '<div style="padding:24px;text-align:center;color:#8a7e74">Nothing to buy yet — it fills in once recipes and guest counts are in.</div>'}</div>
    <div style="${KC_H};margin-top:28px">Where the money goes</div>
    <div style="${KC_CARD};margin-top:8px">${c.week.map(d => `<div onclick="kcSetDay(${d.di})" style="display:grid;grid-template-columns:90px 1fr 80px;gap:10px;align-items:center;margin:5px 0;cursor:pointer;font-size:12.5px"><span>${D[d.di]} ${d.date.slice(5)}</span><span style="background:#f0ebe0;border-radius:6px;height:14px"><span style="display:block;height:14px;border-radius:6px;background:#0d9488;width:${(d.cost / maxDay * 100).toFixed(1)}%"></span></span><b style="text-align:right">${kcMoney(d.cost)}</b></div>`).join('')}</div>
  </div>`;
}

function kcImportHtml() {
  const ta = 'width:100%;height:120px;box-sizing:border-box;padding:8px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:monospace;font-size:12px';
  return `<div style="${KC_CARD};margin-top:14px">
    <div style="font-size:12.5px;margin-bottom:8px">Copy rows from the spreadsheet and paste here (tab or comma separated, a header row is fine). Importing <b>replaces</b> that whole list.</div>
    <div style="font-weight:700;font-size:12.5px">1 · Prices — <span style="font-weight:400">name, category, unit (kg or pza), price in pesos, supplier</span></div>
    <textarea id="kcImpPrices" style="${ta}" placeholder="Salmón&#9;Proteína&#9;kg&#9;480&#9;Estimate"></textarea>
    <div style="font-weight:700;font-size:12.5px;margin-top:10px">2 · Recipes — <span style="font-weight:400">dish, ingredient, grams per portion (or pieces for pza items)</span></div>
    <textarea id="kcImpRecipes" style="${ta}" placeholder="Avocado Toast c/Poche&#9;Aguacate&#9;80"></textarea>
    <button onclick="kcDoImport()" style="margin-top:10px;padding:8px 16px;border:none;border-radius:8px;background:var(--teal,#2d6a6a);color:#fff;cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:600">Import</button></div>`;
}
function kcParseRows(text) {
  return (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const d = l.includes('\t') ? '\t' : ',', out = []; let cur = '', q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === d && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; }
    out.push(cur.trim()); return out;
  });
}
const kcNum = s => { const n = parseFloat(String(s).replace(/[$,\s]/g, '')); return isNaN(n) ? null : n; };
function kcDoImport() {
  const pRows = kcParseRows(document.getElementById('kcImpPrices').value).filter(r => kcNum(r[3]) != null);
  const rRows = kcParseRows(document.getElementById('kcImpRecipes').value).filter(r => kcNum(r[2]) != null && r[0] && r[1]);
  if (!pRows.length && !rRows.length) { showToast('Nothing to import — check each row has a number in the price / grams column.'); return; }
  const ingredients = pRows.map(r => ({ name: r[0], category: r[1] || 'Otros', unit: /^(pza|pz|pieza|piezas)$/i.test(r[2]) ? 'pza' : 'kg', price: kcNum(r[3]), supplier: r[4] || '' }));
  const recipes = rRows.map(r => ({ dish: r[0], ingredient: r[1], qty: kcNum(r[2]) }));
  kcMutate(k => { if (ingredients.length) k.ingredients = ingredients; if (recipes.length) k.recipes = recipes; }).then(() => {
    const names = new Set((ingredients.length ? ingredients : kc.ingredients).map(i => kcNorm(i.name)));
    const unknown = [...new Set(kc.recipes.map(r => r.ingredient).filter(n => !names.has(kcNorm(n))))];
    showToast(`Imported ${ingredients.length} prices and ${recipes.length} recipe lines.` + (unknown.length ? ` ${unknown.length} recipe ingredient(s) have no price: ${unknown.slice(0, 4).join(', ')}` : ''));
    kcShowImport = false; kcRender();
  });
}
function kcSetPrice(idx, v) { const val = kcNum(v); if (val == null || !kc.ingredients[idx]) return; const name = kc.ingredients[idx].name; kcMutate(k => { const i = k.ingredients.find(x => kcNorm(x.name) === kcNorm(name)); if (i) i.price = val; }); }
function kcSetDay(v) { kcDay = v; kcRender(); }
function kcToggleImport() { kcShowImport = !kcShowImport; kcRender(); }
function kcCopyList() {
  const c = kcCompute(), days = c.sel(kcDay), agg = {};
  days.forEach(d => d.meals.forEach(m => m.dishes.forEach(x => x.portion.lines.forEach(l => { const k = kcNorm(l.ing.name); if (!agg[k]) agg[k] = { ing: l.ing, qty: 0 }; agg[k].qty += l.qty * x.plates; }))));
  const rows = Object.values(agg), cats = [...new Set(rows.map(r => r.ing.category))];
  const txt = `Compras de cocina · ${kcDay ? days[0].date : menuCurrentMonday + ' (week)'}\n` + cats.map(cat => `\n*${cat}*\n` + rows.filter(r => r.ing.category === cat).map(r => `• ${r.ing.name} — ${kcQty(r.qty, r.ing.unit)}${r.ing.supplier ? ' (' + r.ing.supplier + ')' : ''}`).join('\n')).join('\n');
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => showToast('List copied — paste it into WhatsApp.'), () => window.prompt('Copy this list:', txt));
}

// ---- wiring ----
function kcToggle() {
  const grid = document.getElementById('menuGridWrap'), cost = document.getElementById('menuCostPanel'), panel = document.getElementById('menuKitchenPanel'), btn = document.getElementById('menuKitchenBtn');
  if (!grid || !panel) return;
  kcOpen = !kcOpen;
  grid.style.display = kcOpen ? 'none' : 'block'; if (cost) cost.style.display = 'none';
  panel.style.display = kcOpen ? 'block' : 'none';
  if (btn) { btn.style.background = kcOpen ? 'var(--teal,#2d6a6a)' : '#f0f9f9'; btn.style.color = kcOpen ? '#fff' : 'var(--teal,#2d6a6a)'; }
  if (kcOpen) { kcLoadLocal(); kcRender(); kcPull().then(kcRender); }
}
(function () {
  const costBtn = document.getElementById('menuCostBtn'), costPanel = document.getElementById('menuCostPanel');
  if (!costBtn || !costPanel || document.getElementById('menuKitchenBtn')) return;
  const btn = costBtn.cloneNode(false);
  btn.id = 'menuKitchenBtn'; btn.setAttribute('onclick', 'kcToggle()'); btn.textContent = '🥘 Kitchen Costing';
  costBtn.parentNode.insertBefore(btn, costBtn.nextSibling);
  const panel = document.createElement('div');
  panel.id = 'menuKitchenPanel'; panel.style.cssText = 'display:none;flex:1;overflow:auto;padding:20px;background:#f5f1eb';
  costPanel.parentNode.insertBefore(panel, costPanel.nextSibling);
  if (typeof menuToggleCostView === 'function') {
    const orig = window.menuToggleCostView;
    window.menuToggleCostView = function () { if (kcOpen) kcToggle(); return orig.apply(this, arguments); }; // close ours first, then the old Cost view opens normally
  }
  if (typeof menuRenderWeek === 'function') {
    const origWeek = window.menuRenderWeek;
    window.menuRenderWeek = function () { const r = origWeek.apply(this, arguments); if (kcOpen) kcRender(); return r; };
  }
})();
