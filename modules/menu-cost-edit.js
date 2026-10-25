// ===== menu-cost-edit.js — update prices right inside Menu > Menu Costs (Darlene 2026-10-25) =====
// Loaded as a classic script AFTER menu.js; shares global scope. Standalone: menu.js is not edited; it decorates the cost panel after every draw. Prices are saved with the same functions the lower
// "Protein Prices" and "Recipe Costs" lists already use (menuSaveProteinPrices / menuSaveRecipeCosts), so those lists, the totals and Kitchen Costing all stay in step. All amounts are MXN pesos.
//   1. "Add an item and its price" box at the top: a product by weight (price per kilo + grams per person), a product by the piece, or a dish (cost per person, or a batch cost divided by its portions).
//      The price can be typed in pesos or US dollars (dollars are converted at the portal's 18 pesos per dollar).
//   2. Under each day's protein: the price PER KILO, editable on the spot (it changes that product everywhere it is used).
//   3. "Other costed dishes": every dish of the day with its cost per person next to it, editable; dishes with no cost yet show an empty box, type the cost and it is saved.
const MCC_USD = 18;
const mccEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const mccInp = 'border:1px solid var(--border);border-radius:6px;padding:4px 6px;font-family:inherit;font-size:12px';
function mccToPesos(v, cur) { return Math.round((parseFloat(v) || 0) * (cur === 'USD' ? MCC_USD : 1) * 100) / 100; }
function mccAdd() {
  const g = id => (document.getElementById(id) || {}).value, name = String(g('mccName') || '').trim(), kind = g('mccKind'), cur = g('mccCur'), price = mccToPesos(g('mccPrice'), cur);
  if (!name) { showToast('Type the name of the item.'); return; } if (!(price > 0)) { showToast('Type the price.'); return; }
  if (kind === 'kg') { menuProteinPrices.push({ id: 'p' + Date.now(), name, unit: 'KG', price, portionG: parseInt(g('mccG')) || 220 }); menuSaveProteinPrices(); }
  else if (kind === 'pza') { menuProteinPrices.push({ id: 'p' + Date.now(), name, unit: 'PZA', price, portionG: 0 }); menuSaveProteinPrices(); }
  else { const portions = kind === 'batch' ? (parseInt(g('mccPortions')) || 1) : 1; menuRecipeCosts.push({ name, portions, totalCost: price }); menuSaveRecipeCosts(); }
  showToast('Added ' + name + ' ✓'); menuRenderCostPanel();
}
function mccSetKg(i, v, cur) { const p = menuProteinPrices[i]; if (!p) return; p.price = mccToPesos(v, cur || 'MXN'); menuSaveProteinPrices(); menuRenderCostPanel(); }
function mccSetDish(encName, v) {
  const name = decodeURIComponent(encName), val = parseFloat(v); if (isNaN(val) || val < 0) return;
  const norm = menuNormalizeDishName(name), r = menuRecipeCosts.find(x => menuNormalizeDishName(x.name) === norm);
  if (r) r.totalCost = Math.round(val * (r.portions || 1) * 100) / 100; else menuRecipeCosts.push({ name, portions: 1, totalCost: val });
  menuSaveRecipeCosts(); menuRenderCostPanel();
}
function mccDishes(di) {                                    // the dishes the cost table looks up for that day (same rule as menu.js)
  const day = menuDataForIdx(di), out = [...(day.brunch || []).filter(d => !d.includes('★') && d !== 'Tostada Bar'), ...(day.snack || []), ...((day.dinner || {}).dishes || [])];
  if (day.dinner && day.dinner.dessert) out.push(day.dinner.dessert); return out;
}
function mccDecorate() {
  try {
    const panel = document.getElementById('menuCostPanel'); if (!panel || !panel.firstElementChild || panel.querySelector('#mccBox')) return;
    const root = panel.firstElementChild, tbl = panel.querySelector('table'), rows = tbl ? [...tbl.querySelectorAll('tbody tr')] : [];
    // 1. add-an-item box
    const lab = 'font-size:11px;font-weight:700;color:#6b7280;display:block;margin-bottom:3px';
    const box = document.createElement('div'); box.id = 'mccBox'; box.style.cssText = 'background:#fff;border:1.5px solid #fdba74;border-radius:12px;padding:12px 16px;margin-bottom:18px';
    box.innerHTML = `<div style="font-weight:700;margin-bottom:8px">💲 Add an item and its price</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">
        <div><label style="${lab}">Item</label><input id="mccName" placeholder="e.g. Camarón U15" style="${mccInp};width:190px"></div>
        <div><label style="${lab}">Priced</label><select id="mccKind" style="${mccInp}" onchange="document.getElementById('mccGW').style.display=this.value==='kg'?'':'none';document.getElementById('mccPW').style.display=this.value==='batch'?'':'none'"><option value="kg">Per kilo (a protein / product by weight)</option><option value="pza">Per piece</option><option value="dish">Dish: cost per person</option><option value="batch">Dish: batch cost ÷ portions</option></select></div>
        <div><label style="${lab}">Price</label><input id="mccPrice" type="number" step="0.01" min="0" placeholder="0.00" style="${mccInp};width:100px"></div>
        <div><label style="${lab}">In</label><select id="mccCur" style="${mccInp}"><option value="MXN">Pesos (MXN)</option><option value="USD">US dollars (×${MCC_USD})</option></select></div>
        <div id="mccGW"><label style="${lab}">Grams per person</label><input id="mccG" type="number" value="220" style="${mccInp};width:80px"></div>
        <div id="mccPW" style="display:none"><label style="${lab}">Portions</label><input id="mccPortions" type="number" value="20" style="${mccInp};width:80px"></div>
        <button onclick="mccAdd()" style="padding:7px 16px;border:none;border-radius:8px;background:#2d6a6a;color:#fff;font-weight:700;font-family:inherit;cursor:pointer">Add</button></div>
      <div style="font-size:11.5px;color:#6b7280;margin-top:6px">Everything is stored in pesos. To change a price you already have, edit it in the table below (price per kilo under each protein, cost per person beside each dish).</div>`;
    root.insertBefore(box, root.children[1] || null);
    // 2 + 3. inline prices in the weekly table
    rows.forEach((tr, k) => {
      const di = k + 1, tds = tr.children; if (tds.length < 6) return;
      const assign = menuAssignForIdx(di) || {};
      [['midday', 1], ['dinner', 2]].forEach(([meal, col]) => {
        const id = assign[meal], i = id ? menuProteinPrices.findIndex(p => p.id === id) : -1, p = menuProteinPrices[i]; if (!p) return;
        const w = document.createElement('div'); w.style.cssText = 'margin-top:4px;font-size:11.5px;color:#5a5048;white-space:nowrap';
        w.innerHTML = `$<input type="number" step="0.01" min="0" value="${p.price}" onchange="mccSetKg(${i},this.value)" style="${mccInp};width:72px"> ${p.unit === 'KG' ? 'per kilo' : 'each'}`;
        tds[col].appendChild(w);
      });
      const cell = tds[3], dishes = mccDishes(di); if (!dishes.length) return;
      cell.innerHTML = dishes.map(n => { const c = menuFindRecipeCostPerPortion(n); return `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;${c == null ? 'color:#b45309;font-style:italic' : ''}"><span style="flex:1;min-width:0">${mccEsc(n)}</span>$<input type="number" step="0.01" min="0" value="${c == null ? '' : c.toFixed(2)}" placeholder="cost" onchange="mccSetDish('${encodeURIComponent(n).replace(/'/g, '%27')}',this.value)" style="${mccInp};width:64px"></div>`; }).join('');
    });
  } catch (e) { console.warn('[menu-cost-edit]', e); }
}
(function () {
  const o = window.menuRenderCostPanel;
  if (typeof o === 'function') window.menuRenderCostPanel = function () { const r = o.apply(this, arguments); try { mccDecorate(); } catch (e) {} return r; };
})();
