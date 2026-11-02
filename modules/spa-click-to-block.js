// ===== spa-click-to-block.js — click an empty space on a therapist's column to block it (Darlene 2026-11-02) =====
// Loaded as a classic script AFTER spa-calendar.js and spa-time-blocks.js; shares global scope. Standalone: wraps spaCalCellClick (admin calendar, therapist view only).
// Clicking empty space now asks "Book appointment" or "Block time". Block time opens the existing Block time form (spa-time-blocks.js) with that therapist, the day
// and the clicked time (1 hour) already filled in. Blocks are saved, drawn and respected by the booking page exactly like blocks made from the Block time button.
// The New Appointment form also gets a "Block this time" button: it blocks the therapist / date / start time / duration chosen in the form instead of booking a guest.
(function () {
  if (typeof spaCalCellClick !== 'function' || typeof spaBlkOpen !== 'function') return;
  const orig = window.spaCalCellClick;
  const close = () => { const m = document.getElementById('spaCtbMenu'); if (m) m.remove(); };
  document.addEventListener('click', e => { if (!e.target.closest || !e.target.closest('#spaCtbMenu')) close(); }, true);

  window.spaCalCellClick = function (evt, colId) {
    if (spaCalMode !== 'therapist') return orig.apply(this, arguments);
    const rect = evt.currentTarget.getBoundingClientRect(), x = evt.clientX, y = evt.clientY;
    let mins = Math.round(((y - rect.top) / (SPA_CAL_PX_HR / 60)) / 15) * 15;
    mins = Math.max(0, Math.min(mins, (spaCalViewEndH - spaCalViewStartH) * 60 - 15));
    const startMin = spaCalViewStartH * 60 + mins, start = spaCalMinToHHMM(startMin), end = spaCalMinToHHMM(Math.min(startMin + 60, 24 * 60 - 1));
    const args = arguments, self = this;
    close();
    const m = document.createElement('div'); m.id = 'spaCtbMenu';
    m.style.cssText = `position:fixed;left:${Math.min(x, innerWidth - 190)}px;top:${Math.min(y, innerHeight - 110)}px;z-index:99999;background:#fff;border:1.5px solid #c8bfb5;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.22);padding:6px;font-family:Jost,sans-serif;min-width:170px`;
    const btn = 'display:block;width:100%;text-align:left;padding:9px 12px;border:none;background:none;font:600 13px Jost,sans-serif;cursor:pointer;border-radius:7px';
    m.innerHTML = `<div style="font-size:11px;color:#6b7280;padding:4px 12px 2px">${spaCalFmtT(start)}</div>
      <button id="spaCtbBook" style="${btn}" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='none'">📅 Book appointment</button>
      <button id="spaCtbBlock" style="${btn}" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='none'">⛔ Block time</button>`;
    document.body.appendChild(m);
    document.getElementById('spaCtbBook').onclick = () => { close(); orig.apply(self, args); };
    document.getElementById('spaCtbBlock').onclick = () => {
      close(); spaBlkOpen();
      const box = document.querySelector('.spaBlkT[value="' + colId + '"]'); if (box) box.checked = true;
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      set('spaBlkFrom', spaCalFmtDateStr(spaCalDate)); set('spaBlkStart', start); set('spaBlkEnd', end);
    };
  };

  // ----- "Block this time" inside the New Appointment form -----
  const origShow = window.spaApptShowForm;
  if (typeof origShow === 'function') window.spaApptShowForm = function (id) {
    const out = origShow.apply(this, arguments);
    try {
      const save = document.querySelector('#spaApptModal button[onclick="spaApptSave()"]'); if (!save) return out;
      let b = document.getElementById('spaCtbFormBtn');
      if (!b) {
        b = document.createElement('button'); b.id = 'spaCtbFormBtn'; b.type = 'button'; b.textContent = '⛔ Block this time';
        b.title = 'Block the therapist, date, start time and duration above instead of booking a guest';
        b.style.cssText = 'padding:10px 18px;background:#fff;color:#475569;border:1.5px solid #94a3b8;border-radius:10px;font-family:Jost,sans-serif;font-size:14px;font-weight:600;cursor:pointer;margin-right:10px';
        b.onclick = blockFromForm; save.parentNode.insertBefore(b, save);
      }
      b.style.display = id ? 'none' : '';
    } catch (e) {}
    return out;
  };

  async function blockFromForm() {
    const v = i => (document.getElementById(i) || {}).value || '';
    const therapistId = v('spaApptTherapist'), date = v('spaApptDate'), start = v('spaApptStart'), dur = parseInt(v('spaApptDuration'), 10) || 60;
    if (!therapistId) return alert('Pick a therapist first. The block is made for that therapist.');
    if (!date || !start) return alert('Pick a date and a start time first.');
    const reason = prompt('Reason for the block (optional), for example Event, Meeting, Day off:', '');
    if (reason === null) return;
    const startMin = blkMin(start), end = spaCalMinToHHMM(Math.min(startMin + dur, 24 * 60 - 1));
    const by = (typeof getCurrentSession === 'function' && (getCurrentSession() || {}).name) || 'Staff';
    const row = { id: 'blk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), therapistId, date, start, end, allDay: false, reason: reason.trim(), by, at: new Date().toISOString() };
    if (!(await spaBlkSave(list => list.concat([row])))) return;
    closeModal('spaApptModal');
    const t = SpaData.therapists.find(x => x.id === therapistId);
    showToast(`Blocked ${t ? t.firstName : ''} ${spaCalFmtT(start)} – ${spaCalFmtT(end)} ✓`);
    spaCalRender();
  }
})();
