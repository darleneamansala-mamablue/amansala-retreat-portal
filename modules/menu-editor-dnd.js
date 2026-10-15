// ===== menu-editor-dnd.js — drag and drop whole menu sections between days (and swap sections within a day) =====
// Loaded as a classic script AFTER menu-editor.js; shares global scope. Standalone: menu-editor.js is not modified. It decorates the
// editor after each draw and edits the editor's working copy (_meDays) in memory; nothing is saved until "Save menu" is pressed, so the
// existing history / "Restore original menu" keep working as before.
// How to use: every section card (Fruit, Coffee & Tea / Brunch / Lunch / Snack / Dinner) gets a drag handle. Drag it onto
//   - a DAY button at the top (Monday … Sunday): a small window asks "Swap" or "Copy here" for that same section on that day
//   - another section card on the same day: swaps the two sections (Brunch <-> Lunch, etc.; the Dinner only swaps between days)
// Each card also has a "Move to…" menu that does the same without dragging (works on touch screens).
// A section moves as a whole (every dish, with its English name and description, since those follow the dish name).

const MDND_SECTIONS = [['lightBreakfast', 'Fruit, Coffee & Tea'], ['brunch', 'Brunch'], ['lunch', 'Lunch'], ['snack', 'Snack'], ['dinner', 'Dinner']];
let _mdndDrag = null;   // { day, key }

function mdndClone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
function mdndEmpty(key) { return key === 'dinner' ? { dishes: [] } : []; }
function mdndLabel(key) { return (MDND_SECTIONS.find(s => s[0] === key) || [])[1] || key; }
function mdndDay(d) { _meDays[d] = _meDays[d] || {}; return _meDays[d]; }

// Swap one section between two days, or two list sections within one day
function mdndSwap(dayA, keyA, dayB, keyB) {
  const A = mdndDay(dayA), B = mdndDay(dayB);
  const a = A[keyA] != null ? A[keyA] : mdndEmpty(keyA), b = B[keyB] != null ? B[keyB] : mdndEmpty(keyB);
  A[keyA] = b; B[keyB] = a;
  meMark(); meDrawDay(); mdndDecorate();
  showToast(`${mdndLabel(keyA)} ${dayA === dayB ? '↔ ' + mdndLabel(keyB) : 'swapped: ' + ME_DAYS[dayA] + ' ↔ ' + ME_DAYS[dayB]}. Press Save menu to keep it.`);
}
// Copy one section onto another day (replaces that day's same section)
function mdndCopy(dayA, key, dayB) {
  const A = mdndDay(dayA), B = mdndDay(dayB);
  B[key] = mdndClone(A[key] != null ? A[key] : mdndEmpty(key));
  meMark(); meDrawDay(); mdndDecorate();
  showToast(`${mdndLabel(key)} copied: ${ME_DAYS[dayA]} → ${ME_DAYS[dayB]}. Press Save menu to keep it.`);
}

// The Swap / Copy / Cancel window
function mdndAsk(dayA, key, dayB) {
  if (dayA === dayB) return;
  let ov = document.getElementById('mdndOv'); if (ov) ov.remove();
  ov = document.createElement('div'); ov.id = 'mdndOv';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const lbl = mdndLabel(key), a = ME_DAYS[dayA], b = ME_DAYS[dayB];
  ov.innerHTML = `<div style="background:#fff;border-radius:12px;width:min(440px,100%);padding:20px;font-family:'Jost',sans-serif">
    <div style="font-size:16px;font-weight:700;margin-bottom:4px">${meEsc(lbl)}: ${meEsc(a)} → ${meEsc(b)}</div>
    <div style="font-size:12.5px;color:#6b7280;margin-bottom:14px">Nothing is saved until you press <b>Save menu</b>.</div>
    <button class="btn btn-primary" style="width:100%;margin-bottom:8px" onclick="mdndDo('swap',${dayA},'${key}',${dayB})">Swap: ${meEsc(a)}'s ${meEsc(lbl)} ↔ ${meEsc(b)}'s ${meEsc(lbl)}</button>
    <button class="btn btn-secondary" style="width:100%;margin-bottom:8px" onclick="mdndDo('copy',${dayA},'${key}',${dayB})">Copy ${meEsc(a)}'s ${meEsc(lbl)} to ${meEsc(b)} (replaces ${meEsc(b)}'s)</button>
    <button class="btn btn-secondary" style="width:100%" onclick="document.getElementById('mdndOv').remove()">Cancel</button></div>`;
  document.body.appendChild(ov);
}
function mdndDo(mode, dayA, key, dayB) {
  const ov = document.getElementById('mdndOv'); if (ov) ov.remove();
  if (mode === 'swap') mdndSwap(dayA, key, dayB, key); else mdndCopy(dayA, key, dayB);
}

// Decorate the cards and the day buttons after the editor draws
function mdndDecorate() {
  try {
    const body = document.getElementById('meBody'); if (!body) return;
    const cards = [...body.children];
    MDND_SECTIONS.forEach(([key, title], i) => {
      const card = cards[i]; if (!card) return;
      card.dataset.mdndSec = key;
      const head = card.firstElementChild; if (!head || head.querySelector('.mdnd-handle')) return;
      head.style.display = 'flex'; head.style.alignItems = 'center'; head.style.gap = '8px';
      const handle = document.createElement('span');
      handle.className = 'mdnd-handle'; handle.draggable = true; handle.title = 'Drag this whole section onto a day button above (or onto another section)';
      handle.textContent = '⠿ drag';
      handle.style.cssText = 'cursor:grab;font-size:11px;font-weight:700;color:#8a7e74;background:#f3efe7;border:1px solid #e0d8cc;border-radius:6px;padding:2px 8px;letter-spacing:0;text-transform:none;user-select:none';
      handle.addEventListener('dragstart', ev => {
        _mdndDrag = { day: _meDay, key };
        ev.dataTransfer.effectAllowed = 'copyMove'; try { ev.dataTransfer.setData('text/plain', key); ev.dataTransfer.setDragImage(card, 20, 20); } catch (e) {}
        card.style.opacity = '.5'; mdndHighlight(true);
      });
      handle.addEventListener('dragend', () => { card.style.opacity = ''; _mdndDrag = null; mdndHighlight(false); });
      head.insertBefore(handle, head.firstChild);
      // non-drag alternative (touch screens)
      const sel = document.createElement('select');
      sel.className = 'mdnd-move'; sel.style.cssText = 'margin-left:auto;font-size:11.5px;padding:3px 6px;border:1px solid #d6cfc4;border-radius:6px;background:#fff;text-transform:none;letter-spacing:0;font-weight:400;color:#4a4038';
      sel.innerHTML = '<option value="">Move to…</option>' + Object.keys(ME_DAYS).filter(d => +d !== _meDay).map(d => `<option value="${d}">${ME_DAYS[d]}</option>`).join('');
      sel.addEventListener('change', () => { const d = +sel.value; sel.value = ''; if (d) mdndAsk(_meDay, key, d); });
      head.appendChild(sel);
      // other cards on this day accept a drop to swap two list sections
      if (key !== 'dinner') {
        card.addEventListener('dragover', ev => { if (_mdndDrag && _mdndDrag.day === _meDay && _mdndDrag.key !== 'dinner' && _mdndDrag.key !== key) { ev.preventDefault(); card.style.outline = '2px dashed #2d6a6a'; } });
        card.addEventListener('dragleave', () => { card.style.outline = ''; });
        card.addEventListener('drop', ev => { card.style.outline = ''; if (!_mdndDrag || _mdndDrag.day !== _meDay || _mdndDrag.key === 'dinner' || _mdndDrag.key === key) return; ev.preventDefault(); const from = _mdndDrag.key; _mdndDrag = null; mdndSwap(_meDay, from, _meDay, key); });
      }
    });
    // day buttons are drop targets
    document.querySelectorAll('button[onclick^="meDay("]').forEach(btn => {
      if (btn.dataset.mdndBound) return; btn.dataset.mdndBound = '1';
      const d = +/meDay\((\d+)\)/.exec(btn.getAttribute('onclick'))[1];
      btn.addEventListener('dragover', ev => { if (_mdndDrag && d !== _mdndDrag.day) { ev.preventDefault(); btn.style.outline = '2px dashed #2d6a6a'; } });
      btn.addEventListener('dragleave', () => { btn.style.outline = ''; });
      btn.addEventListener('drop', ev => { btn.style.outline = ''; if (!_mdndDrag || d === _mdndDrag.day) return; ev.preventDefault(); const { day, key } = _mdndDrag; _mdndDrag = null; mdndAsk(day, key, d); });
    });
  } catch (e) { /* never break the editor */ }
}
function mdndHighlight(on) {
  document.querySelectorAll('button[onclick^="meDay("]').forEach(btn => { btn.style.boxShadow = on ? '0 0 0 2px #fcd34d' : ''; });
}
(function () {
  ['meDrawDay', 'meDraw'].forEach(n => {
    const orig = window[n];
    if (typeof orig !== 'function') return;
    window[n] = function () { const r = orig.apply(this, arguments); setTimeout(mdndDecorate, 0); return r; };
  });
})();
