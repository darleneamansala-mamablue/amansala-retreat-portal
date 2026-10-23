// ===== spa-time-blocks.js — Block hours for therapists on the spa calendar =====
// Loaded as a classic script AFTER spa-calendar.js; shares global scope. Standalone: wraps spaCalRenderToolbar (adds a "Block time" button), spaCalPanelHtml
// (draws each block as a grey striped box in that therapist's column) and spaApptCheckAvailability (amber warning when the form's therapist/date/time falls in a
// block; the admin can still save, since a therapist can agree to an exception). Blocks live in app_store key spa_time_blocks as one row per therapist per day:
//   { id, therapistId, date, start 'HH:MM', end 'HH:MM', allDay, reason, by, at }
// The public booking page (spa-booking.html) reads the same key and treats a blocked time as taken. Saves re-read the list first so two people don't overwrite each other.
// Asked by Darlene 2026-10-23: "we need a way to block hours for our therapists ... where we can create an event block".
let SpaBlocks = [], spaBlkLoaded = false;
const SPA_BLK_KEY = 'spa_time_blocks';
const blkEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const blkMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };

async function spaBlkLoad() {
  try { const { data } = await db.from('app_store').select('value').eq('key', SPA_BLK_KEY).maybeSingle(); SpaBlocks = Array.isArray(data && data.value) ? data.value : []; spaBlkLoaded = true; } catch (e) {}
}
async function spaBlkSave(mutate) {
  await spaBlkLoad();   // re-read first so two people's changes don't overwrite each other
  const next = mutate(SpaBlocks.slice());
  const { error } = await db.from('app_store').upsert({ key: SPA_BLK_KEY, value: next, updated_at: new Date().toISOString() });
  if (error) { showToast('Could not save — try again.'); return false; }
  SpaBlocks = next; return true;
}
// Does this therapist have a block overlapping [startMin, endMin) on that date?
function spaBlkFind(therapistId, date, startMin, endMin) {
  return SpaBlocks.find(b => b.therapistId === therapistId && b.date === date && (b.allDay || (blkMin(b.start) < endMin && blkMin(b.end) > startMin)));
}

(function () {
  if (typeof spaCalPanelHtml !== 'function' || typeof spaCalRenderToolbar !== 'function') return;
  const origPanel = window.spaCalPanelHtml, origToolbar = window.spaCalRenderToolbar, origRender = window.spaCalRender, origCheck = window.spaApptCheckAvailability;

  window.spaCalRender = function () {
    const out = origRender.apply(this, arguments);
    if (!spaBlkLoaded) spaBlkLoad().then(() => { spaBlkLoaded = true; try { origRender.apply(window, []); } catch (e) {} });
    return out;
  };

  window.spaCalPanelHtml = function (cols, isTher, dateStr) {
    let html = origPanel.apply(this, arguments);
    if (!isTher) return html;
    try {
      cols.forEach(col => {
        const blocks = SpaBlocks.filter(b => b.therapistId === col.id && b.date === dateStr); if (!blocks.length) return;
        const marker = `spaCalCellClick(event,'${col.id}')`, at = html.indexOf(marker); if (at < 0) return;
        const open = html.indexOf('>', at) + 1;
        const boxes = blocks.map(b => {
          const s = b.allDay ? spaCalViewStartH * 60 : Math.max(blkMin(b.start), spaCalViewStartH * 60), e = b.allDay ? spaCalViewEndH * 60 : Math.min(blkMin(b.end), spaCalViewEndH * 60);
          if (e <= s) return '';
          const top = (s - spaCalViewStartH * 60) * (SPA_CAL_PX_HR / 60), h = Math.max(22, (e - s) * (SPA_CAL_PX_HR / 60));
          return `<div onclick="event.stopPropagation();spaBlkRemove('${b.id}')" title="${blkEsc(b.reason || 'Blocked')} — click to remove" style="position:absolute;top:${top}px;left:2px;right:2px;height:${h}px;z-index:2;cursor:pointer;border:1.5px solid #94a3b8;border-radius:8px;background:repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0 6px,#f1f5f9 6px,#f1f5f9 12px);padding:4px 6px;overflow:hidden">
            <div style="font-size:11px;font-weight:700;color:#475569">⛔ ${blkEsc(b.reason || 'Blocked')}</div>
            <div style="font-size:10px;color:#64748b">${b.allDay ? 'All day' : spaCalFmtT(b.start) + ' – ' + spaCalFmtT(b.end)}</div></div>`;
        }).join('');
        html = html.slice(0, open) + boxes + html.slice(open);
      });
    } catch (e) {}
    return html;
  };

  window.spaCalRenderToolbar = function () {
    const out = origToolbar.apply(this, arguments);
    try {
      const wrap = document.getElementById('spaAddBtnWrap'), row = wrap && wrap.firstElementChild;
      if (row && !row.querySelector('#spaBlkBtn')) row.insertAdjacentHTML('beforeend', `<button id="spaBlkBtn" onclick="spaBlkOpen()" style="padding:6px 12px;font-size:12px;font-weight:600;border:1.5px solid #94a3b8;border-radius:8px;background:#f1f5f9;color:#475569;cursor:pointer;font-family:'Jost',sans-serif">⛔ Block time</button>`);
    } catch (e) {}
    return out;
  };

  window.spaApptCheckAvailability = function () {
    const out = origCheck.apply(this, arguments);
    try {
      const warn = document.getElementById('spaApptAvailWarn'); if (!warn) return out;
      const therId = document.getElementById('spaApptTherapist')?.value, date = document.getElementById('spaApptDate')?.value, start = document.getElementById('spaApptStart')?.value;
      const dur = parseInt(document.getElementById('spaApptDuration')?.value, 10) || 60;
      if (!therId || !date || !start) return out;
      const hit = spaBlkFind(therId, date, blkMin(start), blkMin(start) + dur); if (!hit) return out;
      const ther = SpaData.therapists.find(t => t.id === therId);
      warn.textContent = `⛔ ${ther ? ther.firstName : 'This therapist'} is blocked ${hit.allDay ? 'all day' : spaCalFmtT(hit.start) + '–' + spaCalFmtT(hit.end)} on ${date}${hit.reason ? ' (' + hit.reason + ')' : ''} — you can still save if they have agreed to an exception.`;
      warn.style.display = 'block';
    } catch (e) {}
    return out;
  };
})();

// ----- the "Block time" form -----
function spaBlkOpen() {
  const act = SpaData.therapists.filter(t => t.active).sort((a, b) => a.firstName.localeCompare(b.firstName)), today = spaCalFmtDateStr(spaCalDate);
  const inp = 'padding:7px 9px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:inherit;font-size:13px';
  let m = document.getElementById('spaBlkModal'); if (m) m.remove();
  m = document.createElement('div'); m.id = 'spaBlkModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Jost,sans-serif';
  m.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:460px;width:100%;max-height:92vh;overflow:auto;padding:22px 24px;box-shadow:0 12px 40px rgba(0,0,0,.25)">
    <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;margin-bottom:2px">⛔ Block time</div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:14px">The blocked hours show on the calendar and can't be booked on the guest booking page.</div>
    <div style="font-size:12px;font-weight:700;margin-bottom:6px">Who <label style="font-weight:600;margin-left:8px;cursor:pointer"><input type="checkbox" onchange="document.querySelectorAll('.spaBlkT').forEach(c=>c.checked=this.checked)"> Everyone</label></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;margin-bottom:14px">${act.map(t => `<label style="font-size:13px;cursor:pointer"><input type="checkbox" class="spaBlkT" value="${t.id}"> ${blkEsc(t.firstName)}</label>`).join('')}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <label style="font-size:12px;font-weight:700">From<br><input type="date" id="spaBlkFrom" value="${today}" style="${inp}"></label>
      <label style="font-size:12px;font-weight:700">To (optional)<br><input type="date" id="spaBlkTo" style="${inp}"></label></div>
    <label style="font-size:13px;cursor:pointer;display:block;margin-bottom:10px"><input type="checkbox" id="spaBlkAll" onchange="document.getElementById('spaBlkTimes').style.display=this.checked?'none':'flex'"> All day</label>
    <div id="spaBlkTimes" style="display:flex;gap:10px;margin-bottom:12px">
      <label style="font-size:12px;font-weight:700">Start<br><input type="time" id="spaBlkStart" value="14:00" step="900" style="${inp}"></label>
      <label style="font-size:12px;font-weight:700">End<br><input type="time" id="spaBlkEnd" value="16:00" step="900" style="${inp}"></label></div>
    <label style="font-size:12px;font-weight:700;display:block;margin-bottom:16px">Reason<br><input type="text" id="spaBlkReason" placeholder="e.g. Event, Staff meeting, Doctor" style="${inp};width:100%"></label>
    <div id="spaBlkErr" style="color:#dc2626;font-size:12.5px;min-height:16px;margin-bottom:8px"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end"><button onclick="document.getElementById('spaBlkModal').remove()" style="padding:9px 16px;border:1.5px solid #c8bfb5;border-radius:9px;background:#fff;cursor:pointer;font-family:inherit">Cancel</button>
      <button onclick="spaBlkSubmit()" style="padding:9px 18px;border:none;border-radius:9px;background:#2d6a6a;color:#fff;font-weight:700;cursor:pointer;font-family:inherit">Block</button></div></div>`;
  document.body.appendChild(m);
}

async function spaBlkSubmit() {
  const err = t => { document.getElementById('spaBlkErr').textContent = t; };
  const ids = [...document.querySelectorAll('.spaBlkT:checked')].map(c => c.value);
  const from = document.getElementById('spaBlkFrom').value, to = document.getElementById('spaBlkTo').value || from, allDay = document.getElementById('spaBlkAll').checked;
  const start = document.getElementById('spaBlkStart').value, end = document.getElementById('spaBlkEnd').value, reason = document.getElementById('spaBlkReason').value.trim();
  if (!ids.length) return err('Pick at least one therapist.');
  if (!from) return err('Pick a date.');
  if (to < from) return err('"To" is before "From".');
  if (!allDay && (!start || !end || blkMin(end) <= blkMin(start))) return err('The end time must be after the start time.');
  const days = []; for (let d = new Date(from + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= to && days.length < 62; d = new Date(d.getTime() + 86400000)) days.push(d.toISOString().slice(0, 10));
  const by = (typeof getCurrentSession === 'function' && (getCurrentSession() || {}).name) || 'Staff', at = new Date().toISOString();
  const rows = []; ids.forEach(tid => days.forEach(date => rows.push({ id: 'blk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), therapistId: tid, date, start: allDay ? '' : start, end: allDay ? '' : end, allDay, reason, by, at })));
  if (!(await spaBlkSave(list => list.concat(rows)))) return;
  document.getElementById('spaBlkModal').remove();
  // Appointments already inside the new block: tell the admin so they can move them
  const clash = SpaAppointments.filter(a => a.status !== 'CANCELLED' && rows.some(r => r.therapistId === a.therapistId && r.date === a.date && (r.allDay || (blkMin(r.start) < blkMin(a.start) + (a.duration || 60) && blkMin(r.end) > blkMin(a.start)))));
  showToast(`Blocked ${rows.length} slot${rows.length !== 1 ? 's' : ''} ✓${clash.length ? ` — ${clash.length} booked appointment${clash.length !== 1 ? 's are' : ' is'} inside it` : ''}`);
  if (clash.length) alert('These bookings are inside the blocked time. Move or cancel them if needed:\n\n' + clash.slice(0, 12).map(a => `${a.date} ${a.start} — ${a.clientName} (${(SpaData.therapists.find(t => t.id === a.therapistId) || {}).firstName || ''})`).join('\n'));
  spaCalRender();
}

async function spaBlkRemove(id) {
  const b = SpaBlocks.find(x => x.id === id); if (!b) return;
  if (!confirm(`Remove this block (${b.reason || 'Blocked'}, ${b.allDay ? 'all day' : b.start + '–' + b.end})?`)) return;
  if (await spaBlkSave(list => list.filter(x => x.id !== id))) { showToast('Block removed ✓'); spaCalRender(); }
}
