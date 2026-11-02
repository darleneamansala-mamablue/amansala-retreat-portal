// ===== spa-maria-auto-block.js — Maria Luisa is automatically blocked once her day is full (Darlene 2026-11-02) =====
// Loaded as a classic script AFTER spa-calendar.js, spa-time-blocks.js and spa-rule-alerts.js; shares global scope. Standalone: wraps spaCalPanelHtml and spaApptCheckAvailability.
// Her day is FULL at her daily cap (Spa > Auto-Assign, 4) services, or at cap + 1 (5) when one of them is a Temazcal. Nothing is saved: once it is full, the rest of her day on the
// Spa Calendar shows as a striped "Full" block starting when her last service ends, and a booking form that lands inside it shows an amber warning (staff can still save, like any block).
// The guest booking page (spa-booking.html) uses the same rule through sbMariaFull. Cancelled appointments never count. A Temazcal is any service or booking named "Temazcal".
const SMB_RE = /temazcal/i;
function smbIsMaria(t) {
  const S = (typeof sraRot !== 'undefined' && sraRot) || {}, mn = String(S.mariaName || 'Maria Luisa').trim().toLowerCase();
  return !!t && (String(t.firstName || '').trim().toLowerCase() === mn || `${t.firstName || ''} ${t.lastName || ''}`.trim().toLowerCase() === mn);
}
// { full, count, cap, from } for a therapist on a date. from = minute her last service ends.
function smbDay(therapistId, dateStr) {
  const S = (typeof sraRot !== 'undefined' && sraRot) || {}, cap = parseInt(S.mariaDailyCap, 10) || 4;
  const appts = (SpaAppointments || []).filter(a => a.date === dateStr && a.status !== 'CANCELLED' && a.therapistId === therapistId);
  const temazcal = appts.some(a => SMB_RE.test(a.clientName || '') || SMB_RE.test(((SpaData.services || []).find(s => s.id === a.serviceId) || {}).name || ''));
  const limit = cap + (temazcal ? 1 : 0), from = appts.reduce((m, a) => Math.max(m, blkMin(a.start) + (a.duration || 60)), 0);
  return { full: appts.length >= limit, count: appts.length, limit, temazcal, from };
}

(function () {
  if (typeof spaCalPanelHtml !== 'function' || typeof blkMin !== 'function') return;
  const origPanel = window.spaCalPanelHtml, origCheck = window.spaApptCheckAvailability;

  window.spaCalPanelHtml = function (cols, isTher, dateStr) {
    let html = origPanel.apply(this, arguments);
    if (!isTher) return html;
    try {
      cols.forEach(col => {
        const t = (SpaData.therapists || []).find(x => x.id === col.id); if (!smbIsMaria(t)) return;
        const d = smbDay(col.id, dateStr); if (!d.full) return;
        const marker = `spaCalCellClick(event,'${col.id}')`, at = html.indexOf(marker); if (at < 0) return;
        const open = html.indexOf('>', at) + 1;
        const s = Math.max(d.from, spaCalViewStartH * 60), e = spaCalViewEndH * 60; if (e <= s) return;
        const top = (s - spaCalViewStartH * 60) * (SPA_CAL_PX_HR / 60), h = Math.max(22, (e - s) * (SPA_CAL_PX_HR / 60));
        const box = `<div title="Full for the day: ${d.count} services${d.temazcal ? ' including a Temazcal' : ''}. Staff can still book her by hand." style="position:absolute;top:${top}px;left:2px;right:2px;height:${h}px;z-index:2;pointer-events:none;border-radius:8px;border:1.5px dashed #94a3b8;background:repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 8px,#e2e8f0 8px,#e2e8f0 16px);padding:6px 8px;overflow:hidden">
          <div style="font-size:11px;font-weight:700;color:#475569">⛔ Full — ${d.count} services</div><div style="font-size:10px;color:#64748b">${d.temazcal ? 'Limit is ' + d.limit + ' with a Temazcal' : 'Limit is ' + d.limit + ' (' + (d.limit + 1) + ' with a Temazcal)'}</div></div>`;
        html = html.slice(0, open) + box + html.slice(open);
      });
    } catch (e) {}
    return html;
  };

  window.spaApptCheckAvailability = function () {
    const out = origCheck.apply(this, arguments);
    try {
      const warn = document.getElementById('spaApptAvailWarn'); if (!warn) return out;
      const therId = document.getElementById('spaApptTherapist')?.value, date = document.getElementById('spaApptDate')?.value, start = document.getElementById('spaApptStart')?.value, id = document.getElementById('spaApptId')?.value;
      const t = (SpaData.therapists || []).find(x => x.id === therId); if (!date || !start || !smbIsMaria(t)) return out;
      const d = smbDay(therId, date);
      if (!d.full || id) return out;   // an existing booking being edited already counts toward her day
      warn.textContent = `⛔ ${t.firstName} is already full on ${date}: ${d.count} services${d.temazcal ? ' including a Temazcal' : ''} (limit ${d.limit}). You can still save, but she would be over her limit.`;
      warn.style.display = 'block';
    } catch (e) {}
    return out;
  };
})();
