// ===== spa-maria-auto-block.js — Maria Luisa is automatically blocked once her day is full (Darlene 2026-11-02) =====
// Loaded as a classic script AFTER spa-calendar.js, spa-time-blocks.js and spa-rule-alerts.js; shares global scope. Standalone: wraps spaCalPanelHtml and spaApptCheckAvailability.
// Her day is FULL at her daily cap (Spa > Auto-Assign, 4) services, or at cap + 1 (5) when one of them is a Temazcal. Nothing is saved: once it is full, the rest of her day on the
// Spa Calendar shows as a striped "Full" block starting when her last service ends. It is a HARD stop (Darlene 2026-11-02: "absolutely impossible that she does more services"):
// saving a new booking to her, or dragging one onto her, on a full day is refused with a message. Editing a booking she already has that day is still allowed.
// The same goes for her BREAK (Spa > Auto-Assign, 45 min after every 3 services): it shows as a striped "Break" block right after her 3rd service and nothing can start inside it.
// Both are automatic and final: no question is asked and there is no override. The guest booking page (spa-booking.html) already applies both rules. Cancelled appointments never count. A Temazcal is any service or booking named "Temazcal".
const SMB_RE = /temazcal/i;
function smbIsMaria(t) {
  const S = (typeof sraRot !== 'undefined' && sraRot) || {}, mn = String(S.mariaName || 'Maria Luisa').trim().toLowerCase();
  return !!t && (String(t.firstName || '').trim().toLowerCase() === mn || `${t.firstName || ''} ${t.lastName || ''}`.trim().toLowerCase() === mn);
}
// { full, count, limit, temazcal, from } for a therapist on a date. from = minute her last service ends.
function smbDay(therapistId, dateStr, excludeId, newIsTemazcal) {
  const S = (typeof sraRot !== 'undefined' && sraRot) || {}, cap = parseInt(S.mariaDailyCap, 10) || 4;
  const appts = (SpaAppointments || []).filter(a => a.date === dateStr && a.status !== 'CANCELLED' && a.therapistId === therapistId && a.id !== excludeId);
  const temazcal = !!newIsTemazcal || appts.some(a => SMB_RE.test(a.clientName || '') || SMB_RE.test(((SpaData.services || []).find(s => s.id === a.serviceId) || {}).name || ''));
  const limit = cap + (temazcal ? 1 : 0), from = appts.reduce((m, a) => Math.max(m, blkMin(a.start) + (a.duration || 60)), 0);
  return { full: appts.length >= limit, count: appts.length, limit, temazcal, from };
}

// The break she must have after her stage-size-th service (3): { start, end, brk } in minutes, or null. Ignores excludeId (the booking being edited).
function smbBreak(therapistId, dateStr, excludeId) {
  const S = (typeof sraRot !== 'undefined' && sraRot) || {}, n = Math.max(1, parseInt(S.mariaStageSize, 10) || 3), brk = parseInt(S.mariaBreakMinutes, 10) || 0;
  if (!brk) return null;
  const appts = (SpaAppointments || []).filter(a => a.date === dateStr && a.status !== 'CANCELLED' && a.therapistId === therapistId && a.id !== excludeId).sort((a, b) => blkMin(a.start) - blkMin(b.start));
  if (appts.length < n) return null;
  const last = appts[n - 1], start = blkMin(last.start) + (last.duration || 60);
  return { start, end: start + brk, brk };
}
const smbHit = (b, startMin) => !!b && startMin >= b.start && startMin < b.end;   // a new service would start inside her break

(function () {
  if (typeof spaCalPanelHtml !== 'function' || typeof blkMin !== 'function') return;
  const origPanel = window.spaCalPanelHtml, origCheck = window.spaApptCheckAvailability;

  window.spaCalPanelHtml = function (cols, isTher, dateStr) {
    let html = origPanel.apply(this, arguments);
    if (!isTher) return html;
    try {
      cols.forEach(col => {
        const t = (SpaData.therapists || []).find(x => x.id === col.id); if (!smbIsMaria(t)) return;
        const br = smbBreak(col.id, dateStr), d = smbDay(col.id, dateStr);
        if (br) {
          const mk = `spaCalCellClick(event,'${col.id}')`, p0 = html.indexOf(mk);
          const bs = Math.max(br.start, spaCalViewStartH * 60), be = Math.min(br.end, spaCalViewEndH * 60);
          if (p0 >= 0 && be > bs) {
            const o0 = html.indexOf('>', p0) + 1;
            html = html.slice(0, o0) + `<div title="Her ${br.brk} minute break" style="position:absolute;top:${(bs - spaCalViewStartH * 60) * (SPA_CAL_PX_HR / 60)}px;left:2px;right:2px;height:${Math.max(18, (be - bs) * (SPA_CAL_PX_HR / 60))}px;z-index:2;pointer-events:none;border-radius:8px;border:1.5px dashed #d97706;background:repeating-linear-gradient(45deg,#fffbeb,#fffbeb 8px,#fef3c7 8px,#fef3c7 16px);padding:4px 8px;overflow:hidden"><div style="font-size:11px;font-weight:700;color:#92400e">☕ Break — ${br.brk} min</div></div>` + html.slice(o0);
          }
        }
        if (!d.full) return;
        const marker = `spaCalCellClick(event,'${col.id}')`, at = html.indexOf(marker); if (at < 0) return;
        const open = html.indexOf('>', at) + 1;
        const s = Math.max(d.from, spaCalViewStartH * 60), e = spaCalViewEndH * 60; if (e <= s) return;
        const top = (s - spaCalViewStartH * 60) * (SPA_CAL_PX_HR / 60), h = Math.max(22, (e - s) * (SPA_CAL_PX_HR / 60));
        const box = `<div title="Full for the day: ${d.count} services${d.temazcal ? ' including a Temazcal' : ''}. She cannot take any more that day." style="position:absolute;top:${top}px;left:2px;right:2px;height:${h}px;z-index:2;pointer-events:none;border-radius:8px;border:1.5px dashed #94a3b8;background:repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 8px,#e2e8f0 8px,#e2e8f0 16px);padding:6px 8px;overflow:hidden">
          <div style="font-size:11px;font-weight:700;color:#475569">⛔ Full — ${d.count} services</div><div style="font-size:10px;color:#64748b">${d.temazcal ? 'Limit is ' + d.limit + ' with a Temazcal' : 'Limit is ' + d.limit + ' (' + (d.limit + 1) + ' with a Temazcal)'}</div></div>`;
        html = html.slice(0, open) + box + html.slice(open);
      });
    } catch (e) {}
    return html;
  };

  const refuse = (t, d, date) => alert(`${t.firstName} is already full on ${date}: ${d.count} services${d.temazcal ? ' including a Temazcal' : ''} (the limit is ${d.limit}). She cannot take any more that day. Pick another therapist or another day.`);

  const fmt = m => spaCalFmtT(spaCalMinToHHMM(m));
  const refuseBreak = (t, br, date) => alert(`${t.firstName} is on her ${br.brk} minute break after 3 services on ${date}, from ${fmt(br.start)} to ${fmt(br.end)}. Nothing can start in that time. Pick ${fmt(br.end)} or later, or another therapist.`);

  // new booking saved to her on a full day (or an existing one moved to her / to that day)
  const origSave = window.spaApptSave;
  if (typeof origSave === 'function') window.spaApptSave = function () {
    try {
      const v = i => (document.getElementById(i) || {}).value || '';
      const id = v('spaApptId'), therId = v('spaApptTherapist'), date = v('spaApptDate'), t = (SpaData.therapists || []).find(x => x.id === therId);
      if (t && smbIsMaria(t) && date && v('spaApptStatus') !== 'CANCELLED') {
        const svc = ((SpaData.services || []).find(s => s.id === v('spaApptService')) || {}).name || '';
        const d = smbDay(therId, date, id, SMB_RE.test(svc) || SMB_RE.test(v('spaApptClientName')));
        if (d.full) { refuse(t, d, date); return; }
        const br = smbBreak(therId, date, id), st = v('spaApptStart');
        if (st && smbHit(br, blkMin(st))) { refuseBreak(t, br, date); return; }
      }
    } catch (e) {}
    return origSave.apply(this, arguments);
  };

  // dragging a booking onto her column
  const origDrop = window.spaCalDrop;
  if (typeof origDrop === 'function') window.spaCalDrop = function (evt, colId) {
    try {
      const apptId = spaCalDragApptId || evt.dataTransfer.getData('text/plain'), a = (SpaAppointments || []).find(x => x.id === apptId), t = (SpaData.therapists || []).find(x => x.id === colId);
      if (a && t && spaCalMode === 'therapist' && smbIsMaria(t) && a.therapistId !== colId) {
        const svc = ((SpaData.services || []).find(s => s.id === a.serviceId) || {}).name || '';
        const d = smbDay(colId, a.date, a.id, SMB_RE.test(svc) || SMB_RE.test(a.clientName || ''));
        if (d.full) { evt.preventDefault(); refuse(t, d, a.date); return; }
      }
      if (a && t && spaCalMode === 'therapist' && smbIsMaria(t)) {
        const rect = evt.currentTarget.getBoundingClientRect();
        let m = Math.round(((evt.clientY - rect.top) / (SPA_CAL_PX_HR / 60)) / 15) * 15; m = Math.max(0, Math.min(m, (spaCalViewEndH - spaCalViewStartH) * 60 - a.duration));
        const br = smbBreak(colId, a.date, a.id);
        if (smbHit(br, spaCalViewStartH * 60 + m)) { evt.preventDefault(); refuseBreak(t, br, a.date); return; }
      }
    } catch (e) {}
    return origDrop.apply(this, arguments);
  };

  // heads-up in the booking form as soon as she is picked on a full day
  window.spaApptCheckAvailability = function () {
    const out = origCheck.apply(this, arguments);
    try {
      const warn = document.getElementById('spaApptAvailWarn'); if (!warn) return out;
      const therId = document.getElementById('spaApptTherapist')?.value, date = document.getElementById('spaApptDate')?.value, id = document.getElementById('spaApptId')?.value;
      const t = (SpaData.therapists || []).find(x => x.id === therId); if (!date || !smbIsMaria(t)) return out;
      const d = smbDay(therId, date, id);
      const br = smbBreak(therId, date, id), st = document.getElementById('spaApptStart')?.value;
      if (br && st && smbHit(br, blkMin(st))) { warn.textContent = `☕ ${t.firstName} is on her ${br.brk} minute break from ${fmt(br.start)} to ${fmt(br.end)}. Nothing can start in that time.`; warn.style.display = 'block'; return out; }
      if (!d.full) return out;
      warn.textContent = `⛔ ${t.firstName} is full on ${date}: ${d.count} services${d.temazcal ? ' including a Temazcal' : ''} (limit ${d.limit}). She cannot take another one that day.`;
      warn.style.display = 'block';
    } catch (e) {}
    return out;
  };
})();
