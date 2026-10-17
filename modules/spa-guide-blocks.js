// ===== spa-guide-blocks.js — a guide chosen for a tour or ceremony is blocked on their Spa calendar (Darlene 2026-10-17) =====
// Loaded as a classic script AFTER spa-calendar.js, spa-tours-group.js and activity-sheet.js; shares global scope. Standalone: no other module is edited.
// Whoever is picked as Guide 1 / 2 / 3, Led by, Shaman or Fire keeper for a tour or ceremony (Tours & Ceremonies page, Review Schedule,
// Activities page) gets a striped "busy" block at that time in their Spa > Calendar column, for the tour's length (Temazcal: both groups'
// times). Clicking a block says what it is instead of booking a treatment on top of it. The person is matched by first name, so
// "Fernando" blocks both of his columns. With "Hide hours" on, the visible hours stretch to include a block.
const SGB_IDS = ['ao1', 'ao2', 'ao3', 'ao6', 'ao7', 'ao16', 'ao4', 'ao5', 'ao9', 'ao10'];
const SGB_FIELDS = ['guide1', 'guide2', 'guide3', 'leader', 'shaman', 'fireKeeper'];
function sgbFlat(x) { return String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(); }
function sgbName(id) { return ((typeof ADD_ONS !== 'undefined' ? ADD_ONS : []).find(a => a.id === id) || {}).name || id; }
function sgbMin(t) { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); }
function sgbFmt(t) { const [h, m] = String(t).split(':').map(Number); return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + (h >= 12 ? ' pm' : ' am'); }
// [{ person (flat first name), role, label, start (min), dur }] for one date
function sgbBlocks(ds) {
  const out = [];
  try {
    (AppData.bookings || []).forEach(bk => {
      if (bk.status === 'cancelled' || (bk.flags || []).includes('archived')) return;
      (bk.retreatActivities || []).forEach(a => {
        if (!a || String(a.date || '').slice(0, 10) !== ds || !SGB_IDS.includes(a.aoId) || !a.time) return;
        const ops = (typeof actOpsData !== 'undefined' && actOpsData[a.aoId + '|' + ds]) || {};
        const dur = (typeof ACTS_DUR !== 'undefined' && ACTS_DUR[a.aoId]) || 90;
        SGB_FIELDS.forEach(f => {
          const nm = ops[f]; if (!nm) return;
          const role = f === 'shaman' ? 'Shaman' : f === 'fireKeeper' ? 'Fire keeper' : f === 'leader' ? 'Leading' : 'Guide';
          const key = sgbFlat(nm) + '|' + a.aoId + '|' + a.time;
          if (out.some(b => b.key === key)) return;                 // a retreat sharing the same tour at the same time: one block
          out.push({ key, person: sgbFlat(nm), role, label: sgbName(a.aoId), time: a.time, start: sgbMin(a.time), dur });
        });
      });
    });
  } catch (e) { /* never break the calendar */ }
  return out;
}
function sgbDecorate() {
  try {
    const el = document.getElementById('spaContent'); if (!el || typeof spaCalDate === 'undefined' || typeof SpaData === 'undefined') return;
    const ds = spaCalFmtDateStr(spaCalDate), blocks = sgbBlocks(ds); if (!blocks.length) return;
    const byId = {}; (SpaData.therapists || []).forEach(t => { byId[t.id] = sgbFlat(t.firstName); });
    el.querySelectorAll('.spa-cal-col').forEach(col => {
      if (col.dataset.sgb) return; col.dataset.sgb = '1';
      const m = /spaCalCellClick\(event,\s*'([^']+)'/.exec(col.getAttribute('onclick') || ''); if (!m) return;
      const who = byId[m[1]]; if (!who) return;
      blocks.filter(b => b.person === who).forEach(b => {
        const top = (b.start - spaCalViewStartH * 60) * (SPA_CAL_PX_HR / 60), height = Math.max(24, b.dur * (SPA_CAL_PX_HR / 60));
        if (top + height <= 0 || top >= (spaCalViewEndH - spaCalViewStartH) * SPA_CAL_PX_HR) return;
        const d = document.createElement('div');
        const range = sgbFmt(b.time) + ' – ' + sgbFmt(spaCalMinToHHMM(b.start + b.dur));
        d.title = b.role + ' for ' + b.label + ', ' + range + '. Busy: not available for treatments.';
        d.style.cssText = `position:absolute;top:${top}px;left:3px;right:3px;height:${height}px;box-sizing:border-box;border:1.5px solid #94a3b8;border-radius:6px;padding:3px 6px;overflow:hidden;z-index:2;cursor:not-allowed;` +
          'background:repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0 6px,#f1f5f9 6px,#f1f5f9 12px);color:#334155;font-size:10.5px;line-height:1.25';
        d.innerHTML = `<div style="font-weight:700">🧭 ${b.role}: ${b.label.replace(/</g, '&lt;')}</div><div>${range}</div>`;
        d.addEventListener('click', ev => { ev.stopPropagation(); if (typeof showToast === 'function') showToast(`Busy: ${b.role.toLowerCase()} for ${b.label}, ${range}.`); });
        col.appendChild(d);
      });
    });
  } catch (e) { console.warn('[spa-guide-blocks]', e); }
}
(function () {
  const orig = window.spaCalRender;
  if (typeof orig === 'function') window.spaCalRender = function () { const r = orig.apply(this, arguments); setTimeout(sgbDecorate, 0); return r; };
  // "Hide hours": make sure the visible hours include a block
  const oc = window.spaCalComputeView;
  if (typeof oc === 'function') window.spaCalComputeView = function (ds) {
    oc.apply(this, arguments);
    try {
      if (typeof spaCalHideHours !== 'undefined' && spaCalHideHours) {
        const bl = sgbBlocks(ds);
        if (bl.length) {
          const lo = Math.floor(Math.min(...bl.map(b => b.start)) / 60), hi = Math.ceil(Math.max(...bl.map(b => b.start + b.dur)) / 60);
          const noAppts = !SpaAppointments.some(a => a.date === ds && a.status !== 'CANCELLED');
          spaCalViewStartH = noAppts ? Math.max(SPA_CAL_START_H, lo) : Math.min(spaCalViewStartH, Math.max(SPA_CAL_START_H, lo));
          spaCalViewEndH = noAppts ? Math.min(SPA_CAL_END_H, hi) : Math.max(spaCalViewEndH, Math.min(SPA_CAL_END_H, hi));
        }
      }
    } catch (e) {}
  };
  // the saved guide choices are normally loaded only on the Activities page: load them once, then draw again
  let loaded = false;
  const prev = window.spaCalRender;
  window.spaCalRender = function () {
    const r = prev.apply(this, arguments);
    if (!loaded && typeof actOpsLoad === 'function') { loaded = true; Promise.resolve(actOpsLoad()).then(() => { try { prev.apply(window, []); } catch (e) {} }).catch(() => {}); }
    return r;
  };
})();
