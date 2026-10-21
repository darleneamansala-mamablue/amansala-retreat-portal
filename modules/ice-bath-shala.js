// ===== ice-bath-shala.js — Assign a shala for the breathwork part of an Ice Bath & Breathwork =====
// Loaded as a classic script AFTER activity-sheet.js and teacher-portal.js; shares global scope. Standalone: wraps actSheetRenderWeek and
// actSheetActCard so every Ice Bath & Breathwork (ao10) card on the weekly Activity Sheet gets a "Shala for breathwork" dropdown
// (the shala list is the portal's own SHALAS). The choice is saved on that retreat's own activity entry
// (bk.retreatActivities[i].shala), the same place its date and time live, and goes out with the normal save.
// An ice bath with no shala yet shows an amber "Assign shala" warning so none gets forgotten. Choosing a shala that another group's
// ice bath already uses within 90 minutes the same day shows a warning (it still saves — two small groups can share a shala).
// Asked by Darlene 2026-10-21. Teacher-facing schedules are NOT changed here (they say ice bath has no shala, by an earlier decision).
const IBS_AO = 'ao10';
let ibsQueue = {};   // per booking: the ice bath entries (array index) in the week being drawn, in the order their cards are drawn

function ibsShalaName(id) { const s = (typeof SHALAS !== 'undefined' ? SHALAS : []).find(x => x.id === id); return s ? s.name : id; }

function ibsMin(t) { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); }

function ibsSet(bkId, idx, shalaId) {
  const bk = AppData.bookings.find(b => b.id === bkId), act = bk && (bk.retreatActivities || [])[idx];
  if (!act || act.aoId !== IBS_AO) { showToast('Could not find that ice bath — refresh and try again.'); return; }
  if (shalaId) act.shala = shalaId; else delete act.shala;
  bk.retreatActivitiesUpdatedAt = bk.updatedAt = new Date().toISOString();
  saveAll();
  if (shalaId) {
    const mine = ibsMin(act.time), clash = AppData.bookings.some(o => o.id !== bk.id && o.status !== 'cancelled' && (o.retreatActivities || []).some(a =>
      a.aoId === IBS_AO && a.shala === shalaId && (a.date || '').slice(0, 10) === (act.date || '').slice(0, 10) && (mine == null || ibsMin(a.time) == null || Math.abs(ibsMin(a.time) - mine) < 90)));
    showToast(clash ? `⚠ ${ibsShalaName(shalaId)} is already used by another group's ice bath around that time. Saved anyway.` : `Breathwork shala saved: ${ibsShalaName(shalaId)}.`);
  } else showToast('Breathwork shala cleared.');
  if (typeof actSheetRenderWeek === 'function') actSheetRenderWeek();
}

(function () {
  if (typeof actSheetRenderWeek !== 'function' || typeof actSheetActCard !== 'function') return;
  const origWeek = window.actSheetRenderWeek, origCard = window.actSheetActCard;
  window.actSheetRenderWeek = function () {
    ibsQueue = {};
    try {
      const first = actSheetMonday, last = new Date(new Date(first + 'T12:00:00').getTime() + 6 * 86400000).toISOString().split('T')[0];
      AppData.bookings.filter(b => b.status !== 'cancelled').forEach(bk => {
        (bk.retreatActivities || []).map((a, i) => ({ a, i })).filter(x => x.a.aoId === IBS_AO && (x.a.date || '').slice(0, 10) >= first && (x.a.date || '').slice(0, 10) <= last)
          .sort((p, q) => (p.a.date || '').localeCompare(q.a.date || '') || (p.a.time || '').localeCompare(q.a.time || '')).forEach(x => (ibsQueue[bk.id] = ibsQueue[bk.id] || []).push(x));
      });
    } catch (e) { console.warn('[ice bath shala] could not prepare', e); }
    return origWeek.apply(this, arguments);
  };
  window.actSheetActCard = function (a) {
    const html = origCard.apply(this, arguments);
    if (!a || a.aoId !== IBS_AO) return html;
    try {
      const q = ibsQueue[a.bkId], pick = q && q.shift(); if (!pick) return html;
      const cur = pick.a.shala || '', opts = (typeof SHALAS !== 'undefined' ? SHALAS : []).map(s => `<option value="${s.id}"${s.id === cur ? ' selected' : ''}>${s.name}</option>`).join('');
      const box = `<div style="margin-top:5px;padding:4px 5px;border-radius:5px;background:${cur ? '#ecfdf5' : '#fef3c7'};border:1px solid ${cur ? '#a7f3d0' : '#fcd34d'}">
        <div style="font-size:9.5px;font-weight:700;color:${cur ? '#065f46' : '#92400e'};margin-bottom:2px">${cur ? '📍 Breathwork shala' : '⚠ Assign shala for breathwork'}</div>
        <select onchange="ibsSet('${String(a.bkId).replace(/'/g, "\\'")}',${pick.i},this.value)" style="width:100%;font-size:11px;padding:2px 3px;border:1px solid #d6cfc4;border-radius:4px;background:#fff"><option value="">— choose shala —</option>${opts}</select></div>`;
      return html.replace(/<\/div>\s*$/, box + '</div>');
    } catch (e) { console.warn('[ice bath shala] could not add dropdown', e); return html; }
  };
})();
