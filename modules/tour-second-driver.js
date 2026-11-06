// Second driver for tours (Darlene 2026-11-06): with more than 13 people a tour needs two cars, so each tour gets an optional "Driver 2".
// Saved as ops.driver2 on the same actOpsData record as the first driver. Adds the box to the Activities page and to Tours & Ceremonies by
// inserting it next to the existing Driver box after each render; nothing in those modules is edited.
function tsdNames(extra) {
  const base = typeof TOUR_DRIVER_NAMES !== 'undefined' ? TOUR_DRIVER_NAMES : [];
  const cap = n => n ? n.charAt(0).toUpperCase() + n.slice(1) : '';
  const list = ['', ...base];
  if (extra && !base.some(n => n.toLowerCase() === extra)) list.push(cap(extra));
  return list;
}
function tsdSelect(key, cur, borderColor) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const opts = tsdNames(cur).map(n => `<option value="${esc(n.toLowerCase())}" ${n.toLowerCase() === cur ? 'selected' : ''}>${esc(n || '— Driver 2 (second car) —')}</option>`).join('');
  return `<select onchange="tsdSet('${esc(key).replace(/'/g, "\\'")}',this.value)" style="padding:7px 10px;border:${borderColor || '1.5px solid #e0dbd2'};border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;color:#2a2a2a;background:#f5f5f0;outline:none;min-width:150px">${opts}</select>`;
}
function tsdSet(key, val) {
  if (typeof actOpsData === 'undefined') return;
  const o = actOpsData[key] = actOpsData[key] || {};
  o.driver2 = String(val || '').toLowerCase();
  if (typeof actOpsSave === 'function') actOpsSave();
  if (typeof showToast === 'function') showToast(o.driver2 ? 'Second driver saved.' : 'Second driver cleared.');
}
function tsdInsert(root, selector, keyOf) {
  (root || document).querySelectorAll(selector).forEach(sel => {
    const holder = sel.parentElement;
    if (!holder || holder.dataset.tsd) return;
    holder.dataset.tsd = '1';
    const key = keyOf(sel);
    if (!key) return;
    const o = (typeof actOpsData !== 'undefined' && actOpsData[key]) || {};
    const box = document.createElement('div');
    const isSheet = /actOpsSet/.test(sel.getAttribute('onchange') || '');
    box.innerHTML = (isSheet
      ? '<label style="font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:5px">Driver 2</label>'
      : '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Driver 2</div>')
      + tsdSelect(key, String(o.driver2 || '').toLowerCase());
    holder.after(box);
  });
}
function tsdDecorate() {
  tsdInsert(document, 'select[onchange*="\'driver\',"]', s => (/actOpsSet\('([^']+)','driver'/.exec(s.getAttribute('onchange')) || [])[1]);
  tsdInsert(document, 'select[onchange^="tcwSetDriver("]', s => (/tcwSetDriver\('([^']+)'/.exec(s.getAttribute('onchange')) || [])[1]);
}
(function () {
  if (typeof actSheetRenderSummary === 'function') {
    const orig = actSheetRenderSummary;
    actSheetRenderSummary = function () { const r = orig.apply(this, arguments); try { tsdDecorate(); } catch (e) {} return r; };
  }
  if (typeof tcwRender === 'function') {
    const orig = tcwRender;
    tcwRender = async function () { const r = await orig.apply(this, arguments); try { tsdDecorate(); } catch (e) {} return r; };
  }
})();
