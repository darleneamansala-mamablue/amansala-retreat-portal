// ===== opening-circle-leader.js — who leads each retreat's opening circle (Darlene 2026-11-04) =====
// Loaded as a classic script AFTER daily-briefing.js and briefing-host-sync.js; shares global scope.
// Every opening circle is led by Max for now; the Teacher arrival checklist's "opening-circle leader" box on the Daily Briefing picks someone else.
// The choice is saved per retreat in app_store 'opening_circle_leaders' ({ bookingId: name }) and the Calendar (skedGetRetreatEvents) reads it through ocLeaderFor().
const OC_KEY = 'opening_circle_leaders', OC_DEFAULT = 'Max';
let ocData = {}, ocLoaded = false, ocLoading = false;
async function ocLoad() {
  if (ocLoading) return; ocLoading = true;
  try {
    const { data } = await db.from('app_store').select('value').eq('key', OC_KEY).maybeSingle();
    if (data && data.value && typeof data.value === 'object') { ocData = Object.assign({}, data.value, ocData); ocLoaded = true; }
    else if (data !== undefined) ocLoaded = true;
  } catch (e) {}
  ocLoading = false;
  if (ocLoaded) { try { if (typeof skedBuild === 'function') skedBuild(); } catch (e) {} try { if (typeof dbRender === 'function') dbRender(); } catch (e) {} }
}
function ocLeaderFor(bkId) {
  if (!ocLoaded && !ocLoading) ocLoad();
  return ocData[bkId] || OC_DEFAULT;
}
async function ocSetLeader(bkId, name) {
  ocData[bkId] = name || OC_DEFAULT;
  try {
    const { data } = await db.from('app_store').select('value').eq('key', OC_KEY).maybeSingle();
    const all = Object.assign({}, (data && data.value) || {}); all[bkId] = ocData[bkId];
    await db.from('app_store').upsert({ key: OC_KEY, value: all, updated_at: new Date().toISOString() });
  } catch (e) { if (typeof showToast === 'function') showToast('Could not save the opening-circle leader.'); }
  try { if (typeof skedBuild === 'function') skedBuild(); } catch (e) {}
  try { dbRender(); } catch (e) {}
}
if (typeof dbGet === 'function' && typeof dbSet === 'function') {
  const baseGet = dbGet, baseSet = dbSet, isCircle = p => /^checklist\.[^.]+\.circle\.leader$/.test(p || '');
  dbGet = function (path) { return isCircle(path) ? ocLeaderFor(path.split('.')[1]) : baseGet(path); };
  dbSet = function (path, val) { baseSet(path, val); if (isCircle(path)) ocSetLeader(path.split('.')[1], val); };
}
