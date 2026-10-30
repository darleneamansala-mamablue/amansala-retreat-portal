// ===== menu-row-notes.js — a note on a retreat's line in a meal (Darlene 2026-10-30) =====
// Loaded as a classic script AFTER menu.js and menu-click-edit.js; shares global scope. Standalone: menuRenderWeek and menuPopulateFromRetreats are only wrapped.
// Every retreat line under a meal (Hora · Grupo · #) gets a 📝 button. Press it and type what the kitchen needs for that group on that meal,
// e.g. "Phad Thai for Monica". The note shows under the line (amber), is saved with the menu schedule (row.note), and prints on the KITCHEN copies
// (menu.js prints it next to the group). The guest copies do not show it.
// The menu fills the retreat lines again whenever you open a week or pick a date; the notes are put back on the same retreat / day / meal each time.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const key = (ds, meal, g) => ds + '|' + meal + '|' + (g || '');

  // keep notes across the automatic refill of the retreat lines
  const prevPop = window.menuPopulateFromRetreats;
  if (typeof prevPop === 'function') {
    window.menuPopulateFromRetreats = function () {
      const keep = {};
      try { Object.keys(menuSchedule || {}).forEach(ds => Object.keys(menuSchedule[ds] || {}).forEach(meal => (menuSchedule[ds][meal] || []).forEach(r => { if (r && r.note) keep[key(ds, meal, r.group)] = r.note; }))); } catch (e) {}
      const r0 = prevPop.apply(this, arguments);
      try {
        let back = 0;
        Object.keys(keep).forEach(k => { const [ds, meal, g] = k.split('|'); const row = ((menuSchedule[ds] || {})[meal] || []).find(x => (x.group || '') === g && !x.note); if (row) { row.note = keep[k]; back++; } });
        if (back) { menuSaveSchedule(); if (typeof menuRenderWeek === 'function') menuRenderWeek(); }
      } catch (e) { console.warn('[menu-row-notes]', e); }
      return r0;
    };
  }

  function addr(tr) {
    const inp = tr.querySelector('input[onchange*="menuUpdateRow"]'); if (!inp) return null;
    const m = /menuUpdateRow\('([^']+)','([^']+)',(\d+),/.exec(inp.getAttribute('onchange') || ''); return m ? { ds: m[1], meal: m[2], i: +m[3] } : null;
  }
  function rowOf(a) { return ((menuSchedule[a.ds] || {})[a.meal] || [])[a.i]; }
  function noteRow(tr, a, open) {
    const r = rowOf(a); if (!r) return;
    const old = tr.nextElementSibling; if (old && old.classList.contains('mrn-row')) old.remove();
    if (!r.note && !open) return;
    const n = tr.children.length, nr = document.createElement('tr'); nr.className = 'mrn-row';
    nr.innerHTML = `<td colspan="${n}" style="padding:0 2px 3px"><input class="menu-inp mrn-in" placeholder="Note for the kitchen, e.g. Phad Thai for Monica" value="${esc(r.note || '')}" style="width:100%;box-sizing:border-box;font-size:11px;font-weight:700;color:#92400e;background:${r.note ? '#fef3c7' : '#fffbeb'};border:1px solid #fcd34d;border-radius:5px;padding:2px 5px"></td>`;
    tr.after(nr);
    const inp = nr.querySelector('input');
    inp.addEventListener('change', () => { const row = rowOf(a); if (!row) return; const v = inp.value.trim(); if (v) row.note = v; else delete row.note; menuSaveSchedule(); inp.style.background = v ? '#fef3c7' : '#fffbeb'; const b = tr.querySelector('.mrn-btn'); if (b) b.style.opacity = v ? '1' : '.45'; });
    if (open) inp.focus();
  }
  function decorate() {
    try {
      if (typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE && !document.body.classList.contains('admin-preview')) return;
      const g = document.getElementById('menuGrid'); if (!g) return;
      g.querySelectorAll('.menu-sched-tbl tbody tr').forEach(tr => {
        if (tr.dataset.mrn || tr.style.opacity === '0') return; const a = addr(tr); if (!a) return; tr.dataset.mrn = '1';
        const r = rowOf(a); const td = tr.children[1]; if (!td) return;
        const b = document.createElement('span'); b.className = 'mrn-btn'; b.textContent = '📝'; b.title = 'Add a note for this group on this meal';
        b.style.cssText = 'cursor:pointer;font-size:11px;margin-left:2px;opacity:' + (r && r.note ? '1' : '.45');
        b.addEventListener('click', ev => { ev.stopPropagation(); const nx = tr.nextElementSibling; if (nx && nx.classList.contains('mrn-row')) { const i = nx.querySelector('input'); if (i) i.focus(); } else noteRow(tr, a, true); });
        td.appendChild(b); noteRow(tr, a, false);
      });
    } catch (e) { console.warn('[menu-row-notes]', e); }
  }
  const prev = window.menuRenderWeek;
  if (typeof prev === 'function') window.menuRenderWeek = function () { const r = prev.apply(this, arguments); setTimeout(decorate, 160); return r; };
  setTimeout(decorate, 2800);
})();
