// ===== spa-click-to-block.js — click an empty space on a therapist's column to block it (Darlene 2026-11-02) =====
// Loaded as a classic script AFTER spa-calendar.js and spa-time-blocks.js; shares global scope. Standalone: wraps spaCalCellClick (admin calendar, therapist view only).
// Clicking empty space now asks "Book appointment" or "Block time". Block time opens the existing Block time form (spa-time-blocks.js) with that therapist, the day
// and the clicked time (1 hour) already filled in. Blocks are saved, drawn and respected by the booking page exactly like blocks made from the Block time button.
// The New Appointment form also gets an "Appointment | Blocked" switch: Blocked hides the guest fields and saves a block for the therapist / date / start time / duration chosen.
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

  // ----- "Appointment | Blocked" switch at the top of the New Appointment form -----
  // Blocked hides every guest field (name, room, service, payment, notes, anything other modules add) and keeps therapist, date, start time and duration plus a Reason box.
  const keepIds = ['spaApptTherapist', 'spaApptDate', 'spaApptStart', 'spaApptDuration'];
  const bodyOf = () => document.querySelector('#spaApptModal .modal-body');
  const topChild = (body, id) => { let el = document.getElementById(id); while (el && el.parentElement !== body) el = el.parentElement; return el; };
  function setMode(blocked) {
    const body = bodyOf(), save = document.querySelector('#spaApptModal button[onclick="spaApptSave()"]'); if (!body) return;
    const keep = new Set(keepIds.map(i => topChild(body, i)).filter(Boolean));
    ['spaCtbSwitch', 'spaCtbReasonWrap'].forEach(i => { const el = document.getElementById(i); if (el) keep.add(el); });
    [...body.children].forEach(c => {
      if (keep.has(c) || c.tagName === 'INPUT') return;
      if (blocked) { if (c.dataset.ctbDisp === undefined) c.dataset.ctbDisp = c.style.display; c.style.display = 'none'; }
      else if (c.dataset.ctbDisp !== undefined) { c.style.display = c.dataset.ctbDisp; delete c.dataset.ctbDisp; }
    });
    // the Room dropdown shares a row with Therapist, so hide just its own half
    const room = document.getElementById('spaApptRoom'); if (room && room.parentElement) room.parentElement.style.display = blocked ? 'none' : '';
    document.getElementById('spaCtbReasonWrap').style.display = blocked ? '' : 'none';
    document.getElementById('spaCtbBlockBtn').style.display = blocked ? '' : 'none';
    if (save) save.style.display = blocked ? 'none' : '';
    const title = document.getElementById('spaApptModalTitle'); if (title) title.textContent = blocked ? 'Block time' : 'New Appointment';
    document.querySelectorAll('#spaCtbSwitch button').forEach(b => {
      const on = (b.dataset.m === 'blocked') === blocked;
      b.style.background = on ? (blocked ? '#475569' : 'var(--teal,#2d6a6a)') : '#fff'; b.style.color = on ? '#fff' : '#475569';
    });
  }
  window.spaCtbSetMode = setMode;

  const origShow = window.spaApptShowForm;
  if (typeof origShow === 'function') window.spaApptShowForm = function (id) {
    const out = origShow.apply(this, arguments);
    try {
      const body = bodyOf(), save = document.querySelector('#spaApptModal button[onclick="spaApptSave()"]'); if (!body || !save) return out;
      if (!document.getElementById('spaCtbSwitch')) {
        const btn = 'flex:1;padding:9px 12px;border:none;font:600 13px Jost,sans-serif;cursor:pointer';
        const sw = document.createElement('div'); sw.id = 'spaCtbSwitch';
        sw.style.cssText = 'display:flex;border:1.5px solid #94a3b8;border-radius:10px;overflow:hidden';
        sw.innerHTML = `<button type="button" data-m="appt" style="${btn}" onclick="spaCtbSetMode(false)">📅 Appointment</button><button type="button" data-m="blocked" style="${btn}" onclick="spaCtbSetMode(true)">⛔ Blocked</button>`;
        body.insertBefore(sw, body.firstChild);
        const rw = document.createElement('div'); rw.id = 'spaCtbReasonWrap'; rw.style.display = 'none';
        rw.innerHTML = `<label style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8a7e74;display:block;margin-bottom:5px">Reason (optional)</label><input id="spaCtbReason" type="text" placeholder="e.g. Event, Staff meeting, Day off" style="width:100%;padding:9px 12px;border:1.5px solid #c8bfb5;border-radius:9px;font-family:'Jost',sans-serif;font-size:14px;box-sizing:border-box">`;
        body.appendChild(rw);
        const bb = document.createElement('button'); bb.id = 'spaCtbBlockBtn'; bb.type = 'button'; bb.textContent = '⛔ Save block'; bb.onclick = blockFromForm;
        bb.style.cssText = 'padding:10px 24px;background:#475569;color:#fff;border:none;border-radius:10px;font-family:Jost,sans-serif;font-size:14px;font-weight:700;cursor:pointer;display:none';
        save.parentNode.insertBefore(bb, save);
      }
      document.getElementById('spaCtbReason').value = '';
      document.getElementById('spaCtbSwitch').style.display = id ? 'none' : 'flex';   // only for a new entry, not when editing a booking
      setMode(false);
    } catch (e) {}
    return out;
  };

  async function blockFromForm() {
    const v = i => (document.getElementById(i) || {}).value || '';
    const therapistId = v('spaApptTherapist'), date = v('spaApptDate'), start = v('spaApptStart'), dur = parseInt(v('spaApptDuration'), 10) || 60, reason = v('spaCtbReason').trim();
    if (!therapistId) return alert('Pick a therapist first. The block is made for that therapist.');
    if (!date || !start) return alert('Pick a date and a start time first.');
    const startMin = blkMin(start), end = spaCalMinToHHMM(Math.min(startMin + dur, 24 * 60 - 1));
    const by = (typeof getCurrentSession === 'function' && (getCurrentSession() || {}).name) || 'Staff';
    const row = { id: 'blk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), therapistId, date, start, end, allDay: false, reason, by, at: new Date().toISOString() };
    if (!(await spaBlkSave(list => list.concat([row])))) return;
    closeModal('spaApptModal');
    const t = SpaData.therapists.find(x => x.id === therapistId);
    showToast(`Blocked ${t ? t.firstName : ''} ${spaCalFmtT(start)} – ${spaCalFmtT(end)} ✓`);
    spaCalRender();
  }
})();
