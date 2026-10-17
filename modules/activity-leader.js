// ===== activity-leader.js — "Led by" and "Who does what" on every activity card (Darlene 2026-10-17) =====
// Loaded as a classic script AFTER activity-sheet.js and activity-guides.js; shares global scope. Standalone: activity-sheet.js is not edited.
// The Activities > Summary cards had Guide 1 / Guide 2 / Driver / Van, but nowhere to say who leads a ceremony, the cooking class or salsa.
// Every card's Operations area now starts with
//   - "Led by": a dropdown of all the staff (tour guides, class instructors, spa therapists, fire keepers, ceremony leaders)
//   - "Who does what": a short note (e.g. "Maria Luisa leads, Gaby plays music")
// Both are saved with the card's other assignments (app_store 'act_ops', fields leader and staffNote) through the sheet's own actOpsSet.
const AL_EXTRA = ['María Luisa', 'Gabby', 'Golloy', 'Francisco', 'Ignacia'];       // ceremony leads and fire keepers
function alTitle(n) { n = String(n || '').trim(); return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''; }
function alStaff(current) {
  const have = new Map();
  const flat = x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();   // Maria / María count as the same person
  const add = n => { const t = alTitle(n); if (t && !have.has(flat(t))) have.set(flat(t), t); };
  [typeof TOUR_GUIDE_NAMES !== 'undefined' ? TOUR_GUIDE_NAMES : [], typeof BBC_INSTRUCTORS_LIST !== 'undefined' ? BBC_INSTRUCTORS_LIST : [],
   typeof TEMAZCAL_FIRE_KEEPER_NAMES !== 'undefined' ? TEMAZCAL_FIRE_KEEPER_NAMES : [], AL_EXTRA].forEach(l => (l || []).forEach(add));
  try { ((typeof SpaData !== 'undefined' && SpaData.therapists) || []).filter(t => t.active !== false).forEach(t => add(t.firstName)); } catch (e) {}
  add(current);
  return [...have.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
function alEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function alDecorate() {
  try {
    document.querySelectorAll('select[onchange*="\',\'guide1\'"]').forEach(g1 => {
      const wrap = g1.parentElement, row = wrap && wrap.parentElement;
      if (!row || row.dataset.alDone) return; row.dataset.alDone = '1';
      const m = /actOpsSet\('([^']+)','guide1'/.exec(g1.getAttribute('onchange') || ''); if (!m) return;
      const key = m[1], ops = (typeof actOpsData !== 'undefined' && actOpsData[key]) || {};
      const lab = 'font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:3px';
      const box = "padding:7px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;color:var(--dark);background:var(--sand,#f5f1eb)";
      const names = alStaff(ops.leader);
      const div = document.createElement('div');
      div.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;flex:1 1 100%;margin-bottom:2px';
      const g3 = String(ops.guide3 || '').toLowerCase(), g3names = alStaff(g3 ? alTitle(g3) : '');
      div.innerHTML = `<div><label style="${lab}">Guide 3</label><select style="${box}" onchange="actOpsSet(${JSON.stringify(key).replace(/"/g, '&quot;')},'guide3',this.value)"><option value="">— optional —</option>${g3names.map(n => `<option value="${alEsc(n.toLowerCase())}" ${g3 === n.toLowerCase() ? 'selected' : ''}>${alEsc(n)}</option>`).join('')}</select></div>` +
        `<div><label style="${lab}">Led by</label><select style="${box}" onchange="actOpsSet(${JSON.stringify(key).replace(/"/g, '&quot;')},'leader',this.value)">` +
        `<option value="">— Who leads this? —</option>${names.map(n => `<option value="${alEsc(n)}" ${ops.leader === n ? 'selected' : ''}>${alEsc(n)}</option>`).join('')}</select></div>` +
        `<div style="flex:1;min-width:220px"><label style="${lab}">Who does what</label><input type="text" value="${alEsc(ops.staffNote || '')}" placeholder="e.g. Maria Luisa leads, Gaby plays music" style="${box};width:100%;box-sizing:border-box" onchange="actOpsSet(${JSON.stringify(key).replace(/"/g, '&quot;')},'staffNote',this.value)"></div>`;
      row.insertBefore(div, row.firstChild);
    });
  } catch (e) { /* never break the Activity Sheet */ }
}
(function () {
  ['actSheetRenderSummary'].forEach(n => {
    const orig = window[n]; if (typeof orig !== 'function') return;
    window[n] = function () { const r = orig.apply(this, arguments); setTimeout(alDecorate, 0); return r; };
  });
  setTimeout(alDecorate, 0);
})();
