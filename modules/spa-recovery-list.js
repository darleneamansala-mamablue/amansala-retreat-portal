// ===== spa-recovery-list.js — see the day's spa appointments even when the therapist list is missing (Darlene 2026-11-05) =====
// Loaded as a classic script AFTER spa-calendar.js; shares global scope. Read-only. On 2026-11-05 (8:03 AM Tulum) the spa settings were re-created with no therapists, so the Spa Calendar
// (which draws one column per therapist) showed "No active therapists yet" and every appointment looked gone, although the appointments themselves were untouched. While there are
// no active therapists, this puts the day's appointments in a plain list under the calendar so the team can keep working: time, guest, room, service, status and notes.
// Appointments of a missing therapist are grouped under "Therapist ... (missing)" so the same person's services stay together. Changes nothing.
const srlEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const srlMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const srlFmt = m => { const h = Math.floor(m / 60); return ((h % 12) || 12) + ':' + String(m % 60).padStart(2, '0') + (h >= 12 ? ' PM' : ' AM'); };
function srlPanel() {
  if (typeof SpaData === 'undefined' || typeof SpaAppointments === 'undefined' || typeof spaCalDate === 'undefined') return '';
  if ((SpaData.therapists || []).some(t => t.active !== false)) return '';
  const day = spaCalFmtDateStr(spaCalDate), list = (SpaAppointments || []).filter(a => a.date === day).sort((a, b) => (a.status === 'CANCELLED') - (b.status === 'CANCELLED') || srlMin(a.start) - srlMin(b.start));
  const ids = [...new Set((SpaAppointments || []).map(a => a.therapistId).filter(Boolean))], label = id => 'Therapist ' + (ids.indexOf(id) + 1) + ' (missing)';
  const svc = a => { const s = (SpaData.services || []).find(x => x.id === a.serviceId); return s ? s.name : (a.duration || 60) + ' min service'; };
  const room = a => { const r = (SpaData.rooms || []).find(x => x.id === a.roomId); return r ? r.name : ''; };
  const rows = list.map(a => `<tr style="border-top:1px solid #e8dfd4;${a.status === 'CANCELLED' ? 'color:#9ca3af;text-decoration:line-through' : ''}"><td style="padding:6px 10px;white-space:nowrap"><b>${srlFmt(srlMin(a.start))}</b> · ${a.duration || 60} min</td><td style="padding:6px 10px"><b>${srlEsc(a.clientName || 'Guest')}</b>${a.guestRoom ? ' · room ' + srlEsc(a.guestRoom) : ''}</td><td style="padding:6px 10px">${srlEsc(svc(a))}</td><td style="padding:6px 10px">${srlEsc(a.therapistId ? label(a.therapistId) : 'no therapist')}</td><td style="padding:6px 10px">${srlEsc(a.status || '')}${a.paymentStatus ? ' · ' + srlEsc(String(a.paymentStatus).toLowerCase().replace(/_/g, ' ')) : ''}</td><td style="padding:6px 10px;font-size:12.5px;color:#4b5563">${srlEsc(a.notes || '')}</td></tr>`).join('');
  return `<div id="srlPanel" style="margin:14px 0;padding:14px 16px;border-radius:12px;background:#fff;border:2px solid #fca5a5;font-family:'Jost',sans-serif">
    <div style="font-weight:700;font-size:14px;color:#b91c1c;margin-bottom:4px">The therapist list is missing, so here are the appointments for this day (${list.filter(a => a.status !== 'CANCELLED').length} active, ${list.length} in all)</div>
    <div style="font-size:12.5px;color:#6b7280;margin-bottom:8px">Your appointments are safe. Read-only list. Use the arrows above to change the day. Please do not add therapists by hand: the real ones are being restored.</div>
    ${list.length ? `<div style="overflow:auto"><table style="border-collapse:collapse;width:100%;font-size:13.5px"><thead><tr style="text-align:left;color:#6b7280;font-size:11.5px;text-transform:uppercase"><th style="padding:4px 10px">Time</th><th style="padding:4px 10px">Guest</th><th style="padding:4px 10px">Service</th><th style="padding:4px 10px">Therapist</th><th style="padding:4px 10px">Status</th><th style="padding:4px 10px">Notes</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div style="padding:10px;color:#9ca3af">No appointments on this day.</div>'}</div>`;
}
(function () {
  if (typeof spaCalRender !== 'function') return;
  const orig = window.spaCalRender;
  window.spaCalRender = function () {
    const r = orig.apply(this, arguments);
    try { const el = document.getElementById('spaContent'), html = srlPanel(); if (el && html && !document.getElementById('srlPanel')) el.insertAdjacentHTML('beforeend', html); } catch (e) { console.warn('[spa recovery list]', e); }
    return r;
  };
})();
