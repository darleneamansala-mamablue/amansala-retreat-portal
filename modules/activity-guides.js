// ===== activity-guides.js — the Guide 1 / Guide 2 choices on the Activity Sheet follow the Tours guides (Darlene 2026-10-17) =====
// Loaded as a classic script AFTER activity-sheet.js and spa.js; shares global scope. Standalone: activity-sheet.js is not edited.
// The Activity Sheet's guide dropdowns used a fixed list (TOUR_GUIDE_NAMES = Marco, Yolanda, Sergio, Ryan). This keeps that list but adds
//   - everyone in the Spa calendar's Tours section (therapists whose primary category is "Tours (guides)": Yolanda, Sergio, Fernando), and
//   - anyone already assigned as a guide on any activity (so an existing assignment never disappears from its dropdown).
// The list is filled in place, so the sheet's dropdowns pick it up the next time they are drawn.
function agTitle(n) { n = String(n || '').trim(); return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''; }
function agRefreshGuides() {
  try {
    if (typeof TOUR_GUIDE_NAMES === 'undefined') return;
    const have = new Map();
    const flat = x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();   // Maria / María count as the same person
    const add = n => { const t = agTitle(n); if (t && !have.has(flat(t))) have.set(flat(t), t); };
    TOUR_GUIDE_NAMES.forEach(add);
    _agExtra.forEach(add);
    add('Fernando'); add('Ignacia'); add('Kun'); add('Darlene'); add('Yolanda'); add('Ryan'); add('Gabby'); add('Golloy'); add('María Luisa'); add('Francisco');   // Darlene 2026-10-17: these four are guides too
    try { ((typeof SpaData !== 'undefined' && SpaData.therapists) || []).filter(t => t.primaryCategory === 'tours' && t.active !== false).forEach(t => add(t.firstName)); } catch (e) {}
    try { Object.values(typeof actOpsData !== 'undefined' ? actOpsData : {}).forEach(o => { add(o && o.guide1); add(o && o.guide2); }); } catch (e) {}
    const names = [...have.values()];
    if (names.length !== TOUR_GUIDE_NAMES.length || names.some((n, i) => n !== TOUR_GUIDE_NAMES[i])) TOUR_GUIDE_NAMES.splice(0, TOUR_GUIDE_NAMES.length, ...names);
  } catch (e) { /* never break the Activity Sheet */ }
}
// Guides added from the Tours & Ceremonies page ("+ Add a guide") are kept in app_store 'tour_guide_names' and join every guide dropdown.
const AG_KEY = 'tour_guide_names';
let _agExtra = [];
async function agLoadExtra() {
  try {
    const { data } = await db.from('app_store').select('value').eq('key', AG_KEY).maybeSingle();
    if (data && Array.isArray(data.value)) _agExtra = data.value.map(agTitle).filter(Boolean);
  } catch (e) {}
  agRefreshGuides();
}
async function agSaveExtra() {
  try { await db.from('app_store').upsert({ key: AG_KEY, value: _agExtra, updated_at: new Date().toISOString() }); return true; } catch (e) { return false; }
}
async function agAddGuide(name) {
  name = agTitle(String(name || '').trim().replace(/\s+/g, ' ').split(' ').map(agTitle).join(' '));
  if (!name) return { ok: false, msg: 'Type the name first.' };
  const known = (typeof TOUR_GUIDE_NAMES !== 'undefined' ? TOUR_GUIDE_NAMES : []).some(n => n.toLowerCase() === name.toLowerCase());
  if (known) return { ok: true, msg: name + ' is already on the list.' };
  _agExtra.push(name); agRefreshGuides();
  const saved = await agSaveExtra();
  return { ok: saved, msg: saved ? name + ' added to the guides.' : 'Could not save ' + name + ' — try again.' };
}
async function agRemoveGuide(name) {
  _agExtra = _agExtra.filter(n => n.toLowerCase() !== String(name).toLowerCase());
  if (typeof TOUR_GUIDE_NAMES !== 'undefined') { const i = TOUR_GUIDE_NAMES.findIndex(n => n.toLowerCase() === String(name).toLowerCase()); if (i >= 0) TOUR_GUIDE_NAMES.splice(i, 1); }
  return agSaveExtra();
}
agRefreshGuides();
agLoadExtra();
// the spa data and the saved assignments load a moment after the page: refresh a few times while they arrive
let _agTries = 0;
const _agTimer = setInterval(() => { agRefreshGuides(); if (++_agTries > 12) clearInterval(_agTimer); }, 1500);
// and just before the sheet draws its cards
(function () {
  ['actSheetRenderSummary', 'actSheetRenderWeek', 'actByRetreatRender'].forEach(n => {
    const orig = window[n]; if (typeof orig !== 'function') return;
    window[n] = function () { agRefreshGuides(); return orig.apply(this, arguments); };
  });
})();
