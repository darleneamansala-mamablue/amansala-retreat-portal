// ===== menu-editor-dish-move.js — move a single dish anywhere in the Menu Editor (Darlene 2026-10-17) =====
// Loaded as a classic script AFTER menu-editor.js and menu-editor-dnd.js; shares global scope. Standalone: no other module is edited. Like the
// section drag-and-drop it works on the editor's working copy (_meDays) in memory; nothing is saved until "Save menu" is pressed, so history and
// "Restore original menu" keep working as before.
// Every dish row gets, next to its up/down/delete buttons:
//   - a "⠿" drag handle: drop it on another dish (it goes in front of that dish), on another meal card of the same day (it goes at the end),
//     or on a day button at the top (a small window asks which meal of that day)
//   - a "Move to…" menu: this day's meals first, then every other day's meals (works on touch screens too)
// A dish moves with its English name and description (they follow the dish name). The ★ main-dish mark only stays in Brunch and Lunch.

const MDM_TARGETS = [['lightBreakfast', 'Fruit, Coffee & Tea'], ['brunch', 'Brunch'], ['lunch', 'Lunch'], ['snack', 'Snack'], ['dinner.dishes', 'Dinner (soup, salad, side…)']];
let _mdmDrag = null;   // { day, path, i }

function mdmList(day, path) {
  const d = (_meDays[day] = _meDays[day] || {});
  if (path === 'dinner.dishes') { d.dinner = d.dinner || { dishes: [] }; d.dinner.dishes = d.dinner.dishes || []; return d.dinner.dishes; }
  d[path] = d[path] || []; return d[path];
}
function mdmLabel(path) { return (MDM_TARGETS.find(t => t[0] === path) || [])[1] || path; }
// move one dish: toIndex null = end of the list
function mdmMove(fromDay, fromPath, i, toDay, toPath, toIndex) {
  const src = mdmList(fromDay, fromPath);
  if (i < 0 || i >= src.length) return;
  let item = src[i];
  if (fromDay === toDay && fromPath === toPath && (toIndex == null ? i === src.length - 1 : (toIndex === i || toIndex === i + 1))) return;   // dropped where it already is
  src.splice(i, 1);
  const dst = mdmList(toDay, toPath);
  if (!(toPath === 'brunch' || toPath === 'lunch')) item = meClean(item);                 // the ★ mark only belongs to Brunch / Lunch
  let at = toIndex == null ? dst.length : toIndex;
  if (fromDay === toDay && fromPath === toPath && toIndex != null && toIndex > i) at -= 1;  // the list shrank by one before the insert point
  dst.splice(Math.max(0, Math.min(at, dst.length)), 0, item);
  meMark(); meDrawDay(); mdmDecorate();
  showToast(`"${meClean(item)}" moved to ${fromDay === toDay ? '' : ME_DAYS[toDay] + ' · '}${mdmLabel(toPath)}. Press Save menu to keep it.`);
}
// window that asks which meal of a day (after dropping a dish on a day button)
function mdmAsk(fromDay, fromPath, i, toDay) {
  let ov = document.getElementById('mdmOv'); if (ov) ov.remove();
  ov = document.createElement('div'); ov.id = 'mdmOv';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const name = meClean(mdmList(fromDay, fromPath)[i] || '');
  ov.innerHTML = `<div style="background:#fff;border-radius:12px;width:min(420px,100%);padding:20px;font-family:'Jost',sans-serif">
    <div style="font-size:16px;font-weight:700;margin-bottom:4px">Move "${meEsc(name)}" to ${meEsc(ME_DAYS[toDay])}</div>
    <div style="font-size:12.5px;color:#6b7280;margin-bottom:14px">Which meal? Nothing is saved until you press <b>Save menu</b>.</div>
    ${MDM_TARGETS.map(t => `<button class="btn btn-secondary" style="width:100%;margin-bottom:8px" onclick="mdmDo(${fromDay},'${fromPath}',${i},${toDay},'${t[0]}')">${meEsc(t[1])}</button>`).join('')}
    <button class="btn btn-secondary" style="width:100%" onclick="document.getElementById('mdmOv').remove()">Cancel</button></div>`;
  document.body.appendChild(ov);
}
function mdmDo(fromDay, fromPath, i, toDay, toPath) { const ov = document.getElementById('mdmOv'); if (ov) ov.remove(); mdmMove(fromDay, fromPath, i, toDay, toPath, null); }

function mdmDecorate() {
  try {
    const body = document.getElementById('meBody'); if (!body) return;
    const cards = [...body.children];
    // every dish row: the grid row that holds the meName(...) input
    body.querySelectorAll('input[oninput^="meName("]').forEach(inp => {
      const m = /meName\('([^']+)',(\d+),/.exec(inp.getAttribute('oninput')); if (!m) return;
      const path = m[1], i = +m[2];
      const row = inp.parentElement; if (!row || row.dataset.mdmRow) return; row.dataset.mdmRow = '1';
      const tools = row.lastElementChild; if (!tools) return;
      const handle = document.createElement('span');
      handle.className = 'mdm-handle'; handle.draggable = true; handle.textContent = '⠿'; handle.title = 'Drag this dish onto another dish, another meal, or a day button above';
      handle.style.cssText = 'cursor:grab;font-size:15px;color:#8a7e74;padding:0 4px;user-select:none';
      handle.addEventListener('dragstart', ev => {
        _mdmDrag = { day: _meDay, path, i };
        ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', 'dish'); ev.dataTransfer.setDragImage(row, 20, 20); } catch (e) {}
        row.style.opacity = '.5'; mdmHighlight(true);
      });
      handle.addEventListener('dragend', () => { row.style.opacity = ''; _mdmDrag = null; mdmHighlight(false); });
      tools.insertBefore(handle, tools.firstChild);
      const sel = document.createElement('select');
      sel.className = 'mdm-move'; sel.title = 'Move this dish';
      sel.style.cssText = 'font-size:11px;padding:2px 4px;border:1px solid #d6cfc4;border-radius:6px;background:#fff;color:#4a4038;max-width:84px';
      let opts = '<option value="">Move to…</option><optgroup label="This day">' + MDM_TARGETS.filter(t => t[0] !== path).map(t => `<option value="${_meDay}|${t[0]}">${meEsc(t[1])}</option>`).join('') + '</optgroup>';
      Object.keys(ME_DAYS).filter(d => +d !== _meDay).forEach(d => { opts += `<optgroup label="${meEsc(ME_DAYS[d])}">` + MDM_TARGETS.map(t => `<option value="${d}|${t[0]}">${meEsc(t[1])}</option>`).join('') + '</optgroup>'; });
      sel.innerHTML = opts;
      sel.addEventListener('change', () => { const v = sel.value; sel.value = ''; if (!v) return; const [d, p] = v.split('|'); mdmMove(_meDay, path, i, +d, p, null); });
      tools.insertBefore(sel, tools.children[1] || null);
      // drop on this dish: the dragged dish goes in front of it
      row.addEventListener('dragover', ev => { if (_mdmDrag && _mdmDrag.day === _meDay) { ev.preventDefault(); ev.stopPropagation(); row.style.boxShadow = '0 -3px 0 #2d6a6a'; } });
      row.addEventListener('dragleave', () => { row.style.boxShadow = ''; });
      row.addEventListener('drop', ev => { row.style.boxShadow = ''; if (!_mdmDrag || _mdmDrag.day !== _meDay) return; ev.preventDefault(); ev.stopPropagation(); const d = _mdmDrag; _mdmDrag = null; mdmMove(d.day, d.path, d.i, _meDay, path, i); });
    });
    // meal cards: drop at the end of that meal (same day)
    const keys = ['lightBreakfast', 'brunch', 'lunch', 'snack', 'dinner.dishes'];
    cards.forEach((card, ci) => {
      const path = keys[ci]; if (!path || card.dataset.mdmCard) return; card.dataset.mdmCard = '1';
      card.addEventListener('dragover', ev => { if (_mdmDrag && _mdmDrag.day === _meDay) { ev.preventDefault(); card.style.outline = '2px dashed #2d6a6a'; } });
      card.addEventListener('dragleave', () => { card.style.outline = ''; });
      card.addEventListener('drop', ev => { card.style.outline = ''; if (!_mdmDrag || _mdmDrag.day !== _meDay) return; ev.preventDefault(); const d = _mdmDrag; _mdmDrag = null; mdmMove(d.day, d.path, d.i, _meDay, path, null); });
    });
    // day buttons: drop a dish to ask which meal of that day
    document.querySelectorAll('button[onclick^="meDay("]').forEach(btn => {
      if (btn.dataset.mdmBound) return; btn.dataset.mdmBound = '1';
      const d = +/meDay\((\d+)\)/.exec(btn.getAttribute('onclick'))[1];
      btn.addEventListener('dragover', ev => { if (_mdmDrag && d !== _mdmDrag.day) { ev.preventDefault(); btn.style.outline = '2px dashed #2d6a6a'; } });
      btn.addEventListener('dragleave', () => { btn.style.outline = ''; });
      btn.addEventListener('drop', ev => { btn.style.outline = ''; if (!_mdmDrag || d === _mdmDrag.day) return; ev.preventDefault(); const x = _mdmDrag; _mdmDrag = null; mdmAsk(x.day, x.path, x.i, d); });
    });
  } catch (e) { /* never break the editor */ }
}
function mdmHighlight(on) { document.querySelectorAll('button[onclick^="meDay("]').forEach(btn => { btn.style.boxShadow = on ? '0 0 0 2px #93c5fd' : ''; }); }
(function () {
  ['meDrawDay', 'meDraw'].forEach(n => {
    const orig = window[n];
    if (typeof orig !== 'function') return;
    window[n] = function () { const r = orig.apply(this, arguments); setTimeout(mdmDecorate, 0); return r; };
  });
})();
