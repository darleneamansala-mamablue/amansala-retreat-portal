// ===== briefing-host-sync.js — Daily Briefing arrival checklist <-> Host Checklist (Darlene 2026-11-04) =====
// Loaded as a classic script AFTER daily-briefing.js and host-checklist.js; shares global scope.
// The same task is ticked once: a tick on the Daily Briefing's Teacher arrival checklist is written to the retreat's Host Checklist
// (app_store 'host_checklists', same {by, at, note} entry), and a step already ticked on the Host Checklist shows ticked in the briefing.
const BHS_MAP = { meet: 'greet-teacher', review: 'review-schedule', tip: 'group-tip', sound: 'show-music' };
function bhsParse(path) { const m = /^checklist\.([^.]+)\.([^.]+)\.done$/.exec(path || ''); return m && BHS_MAP[m[2]] ? { bk: m[1], hc: BHS_MAP[m[2]] } : null; }

if (typeof dbGet === 'function' && typeof dbSet === 'function' && typeof hcMutate === 'function') {
  const baseGet = dbGet, baseSet = dbSet;
  dbGet = function (path) {
    const p = bhsParse(path);
    if (p) {
      if (typeof hcState !== 'undefined' && !hcState.loaded && !hcState.loading && !hcState.error && typeof hcLoad === 'function') hcLoad().then(() => { try { dbRender(); } catch (e) {} });
      const rec = (typeof hcState !== 'undefined' && hcState.data[p.bk]) || null;
      if (rec && rec.done && rec.done[p.hc]) return true;
    }
    return baseGet(path);
  };
  dbSet = function (path, val) {
    baseSet(path, val);
    const p = bhsParse(path); if (!p) return;
    const rec = hcState.data[p.bk] = hcState.data[p.bk] || { done: {}, extras: [] }; rec.done = rec.done || {};
    if (val) { if (!rec.done[p.hc]) rec.done[p.hc] = { by: hcMe(), at: new Date().toISOString(), note: '' }; } else delete rec.done[p.hc];   // shown at once; saved below
    hcMutate(p.bk, r => { if (val) { if (!r.done[p.hc]) r.done[p.hc] = { by: hcMe(), at: new Date().toISOString(), note: 'Ticked on the Daily Briefing' }; } else delete r.done[p.hc]; })
      .then(() => { try { dbRender(); } catch (e) {} });
  };
}
