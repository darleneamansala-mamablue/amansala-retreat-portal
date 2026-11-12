// ===== activity-time-edit.js — change a tour's time right on Activities > By Retreat (Darlene 2026-11-12) =====
// Each tour card gets a time box. Changing it saves bk.retreatActivities[i].time for THAT retreat only (same field Review Schedule edits).
function ateCards(wrap) {
  return [...wrap.querySelectorAll('div')].filter(d => /margin-bottom:12px/.test(d.getAttribute('style') || '') && /overflow:hidden/.test(d.getAttribute('style') || ''));
}
function ateDecorate() {
  const wrap = document.getElementById('actSheetByRetreat');
  if (!wrap || typeof actByRetreatBkId === 'undefined' || !actByRetreatBkId) return;
  const bk = AppData.bookings.find(b => b.id === actByRetreatBkId);
  if (!bk) return;
  const entries = actByRetreatBuildEntries(actByRetreatBkId);
  const ordered = [...entries.filter(e => e.prepaid), ...entries.filter(e => !e.prepaid)];   // the order the cards are drawn in
  const cards = ateCards(wrap);
  if (!ordered.length || cards.length !== ordered.length) return;
  cards.forEach((card, i) => {
    const e = ordered[i];
    const idx = (bk.retreatActivities || []).findIndex(a => a.aoId === e.aoId && (a.date || '') === (e.date || ''));
    if (idx < 0) return;
    const head = card.firstElementChild;
    if (!head || head.querySelector('.ateTime')) return;
    const box = document.createElement('label');
    box.className = 'ateTime';
    box.style.cssText = 'font-size:11px;font-weight:700;color:#6b7280;display:flex;align-items:center;gap:6px';
    box.innerHTML = `Time <input type="time" value="${(e.time || '').slice(0, 5)}" style="padding:5px 8px;border:1.5px solid #d4cfca;border-radius:7px;font-size:12.5px">`;
    box.querySelector('input').addEventListener('change', ev => ateSave(bk.id, idx, ev.target.value));
    head.insertBefore(box, head.lastElementChild);
  });
}
function ateSave(bkId, idx, val) {
  const bk = AppData.bookings.find(b => b.id === bkId);
  const act = bk && (bk.retreatActivities || [])[idx];
  if (!act) return;
  act.time = val;
  bk.retreatActivitiesUpdatedAt = bk.updatedAt = new Date().toISOString();
  saveAll();
  if (typeof showToast === 'function') showToast('Time saved');
  actByRetreatRender();
}
const _ateOrigRender = window.actByRetreatRender;
window.actByRetreatRender = function () {
  const r = _ateOrigRender.apply(this, arguments);
  try { ateDecorate(); } catch (e) {}
  return r;
};
