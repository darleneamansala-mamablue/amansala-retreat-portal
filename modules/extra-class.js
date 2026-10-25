// ===== extra-class.js — add another class to a retreat's day (a second morning class, a workshop, anything with its own time and shala) =====
// Loaded as a classic script AFTER teacher-portal.js, team-quick-panel.js and shala-double-book-alert.js; shares global scope. Asked by Darlene 2026-10-25: "Melissa Masella will do two classes for her
// morning ... we need an option to add another class". A retreat had only one morning class per day. Extra classes are saved as extra lines in the retreat's own day-by-day list
// (bk.scheduleTimeOverrides, period 'extra', any number per day: { date, period:'extra', start, dur, shala1, label, coTeacher, notes }), the field that already saves with the retreat.
// Shown on: the teacher's day-by-day schedule, the printed schedule and the teacher's own link (small hooks in teacher-portal.js / get-schedule-by-token.js), the Schedule grid
// (this file wraps skedGetRetreatEvents, so the shala is held for that time and the double-booking alert sees it). Added from the "➕ Add class" button (bottom-left, team only).
const EC_PERIOD = 'extra';
const ecEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const ecMin = t => { if (!t || String(t).indexOf(':') < 0) return null; const [h, m] = String(t).split(':').map(Number); return isNaN(h) ? null : h * 60 + (m || 0); };
const ecFmt = t => { const m = ecMin(t); if (m == null) return ''; const h = Math.floor(m / 60); return ((h % 12) || 12) + ':' + String(m % 60).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM'); };
const ecDay = d => { try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; } };
const ecShalaName = id => { try { return (SHALAS.find(s => s.id === id) || {}).name || id || '—'; } catch (e) { return id || '—'; } };
const ecList = bk => (bk.scheduleTimeOverrides || []).filter(o => o.period === EC_PERIOD).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.start).localeCompare(String(b.start)));
function ecDays(bk) { const out = [], s = String(bk.startDate).slice(0, 10), e = String(bk.endDate).slice(0, 10); for (let d = s; d <= e && out.length < 32; d = new Date(Date.parse(d + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)) out.push(d); return out; }

// The pop-up body (called from team-quick-panel.js)
function ecHtml(bk) {
  const inp = 'padding:7px 9px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:inherit;font-size:13px', btn = 'padding:6px 12px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;font-size:12.5px';
  const list = ecList(bk), shalas = (typeof SHALAS !== 'undefined' ? SHALAS : []);
  return `<div style="font-size:12.5px;color:#6b7280;margin-bottom:10px">Another class on a day, in addition to the usual morning and afternoon classes. It shows on the teacher's schedule, the printed schedule and the Schedule grid.</div>
    ${list.length ? `<div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;overflow:hidden;margin-bottom:14px">${list.map((o, i) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:${i ? '1px solid #f0ebe0' : '0'}"><div style="flex:1"><b>${ecDay(o.date)}</b> · ${ecFmt(o.start)}–${ecFmt(String(Math.floor((ecMin(o.start) + (o.dur || 60)) / 60)).padStart(2, '0') + ':' + String((ecMin(o.start) + (o.dur || 60)) % 60).padStart(2, '0'))} · ${ecEsc(ecShalaName(o.shala1))}<div style="font-size:12px;color:#6b7280">${ecEsc(o.label || 'Extra Class')}${o.coTeacher ? ' · with ' + ecEsc(o.coTeacher) : ''}</div></div><button onclick="ecRemove('${ecEsc(bk.id)}','${ecEsc(o.id || '')}',${i})" title="Remove" style="border:none;background:none;color:#dc2626;font-size:18px;cursor:pointer">&times;</button></div>`).join('')}</div>` : '<div style="color:#9ca3af;margin-bottom:12px">No extra classes yet.</div>'}
    <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#a89a86;margin-bottom:6px">Add a class</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <select id="ecDate" style="${inp}">${ecDays(bk).map(d => `<option value="${d}">${ecDay(d)}</option>`).join('')}</select>
      <input id="ecStart" type="time" value="09:30" style="${inp}">
      <select id="ecDur" style="${inp}">${[30, 45, 60, 75, 90, 105, 120].map(m => `<option value="${m}"${m === 60 ? ' selected' : ''}>${m} min</option>`).join('')}</select>
      <select id="ecShala" style="${inp}"><option value="">Shala…</option>${shalas.map(s => `<option value="${s.id}">${ecEsc(s.name)}</option>`).join('')}</select></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><input id="ecLabel" type="text" placeholder="Class name (e.g. Kick Fit)" style="${inp};flex:2;min-width:180px"><input id="ecCo" type="text" placeholder="Co-teacher (optional)" style="${inp};flex:1;min-width:140px"></div>
    <button onclick="ecAdd('${ecEsc(bk.id)}')" style="${btn};background:#2d6a6a;color:#fff;border-color:#2d6a6a;font-weight:700">Add class</button>`;
}
function ecAdd(bkId) {
  const bk = (AppData.bookings || []).find(b => b.id === bkId); if (!bk) return;
  const date = document.getElementById('ecDate').value, start = document.getElementById('ecStart').value, dur = parseInt(document.getElementById('ecDur').value, 10) || 60, shala = document.getElementById('ecShala').value;
  const label = document.getElementById('ecLabel').value.trim(), co = document.getElementById('ecCo').value.trim();
  if (!date || !start) { showToast('Pick the day and the start time.'); return; }
  if (!shala) { showToast('Pick the shala.'); return; }
  // Is that shala free then? (every retreat's classes as the Schedule draws them)
  try {
    const s0 = ecMin(start), busy = typeof skedGetRetreatEvents === 'function' ? skedGetRetreatEvents(date).find(e => e.resourceId === shala && ecMin(e.startTime) != null && ecMin(e.endTime) != null && ecMin(e.startTime) < s0 + dur && s0 < ecMin(e.endTime)) : null;
    if (busy && !confirm(`${ecShalaName(shala)} is already in use then: ${busy.title}${busy.subtitle ? ' — ' + String(busy.subtitle).split(' · ')[0] : ''} (${ecFmt(busy.startTime)}–${ecFmt(busy.endTime)}).\n\nAdd the class anyway? It will show in the double-booking list.`)) return;
  } catch (e) {}
  (bk.scheduleTimeOverrides = bk.scheduleTimeOverrides || []).push({ id: 'ec' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date, period: EC_PERIOD, start, dur, shala1: shala, label, coTeacher: co, notes: '' });
  bk.updatedAt = new Date().toISOString(); saveAll();
  showToast('Class added ✓'); if (typeof qpDraw === 'function') qpDraw(); try { if (typeof sdbTick === 'function') sdbTick(); } catch (e) {}
}
function ecRemove(bkId, id, idx) {
  const bk = (AppData.bookings || []).find(b => b.id === bkId); if (!bk || !confirm('Remove this class?')) return;
  const list = ecList(bk), target = (id && list.find(o => o.id === id)) || list[idx]; if (!target) return;
  bk.scheduleTimeOverrides = bk.scheduleTimeOverrides.filter(o => o !== target);
  bk.updatedAt = new Date().toISOString(); saveAll();
  showToast('Class removed ✓'); if (typeof qpDraw === 'function') qpDraw(); try { if (typeof sdbTick === 'function') sdbTick(); } catch (e) {}
}

// The Schedule grid: hold the shala for each extra class
(function () {
  if (typeof skedGetRetreatEvents !== 'function') return;
  const o = window.skedGetRetreatEvents;
  window.skedGetRetreatEvents = function (dateStr) {
    const evs = o.apply(this, arguments);
    try {
      (AppData.bookings || []).filter(b => b.status !== 'cancelled' && b.startDate && dateStr >= b.startDate && dateStr <= b.endDate).forEach(bk => {
        const title = bk.leaderName || bk.retreatName || 'Retreat';
        (bk.scheduleTimeOverrides || []).filter(x => x.period === EC_PERIOD && x.date === dateStr && x.start).forEach(x => {
          const end = String(Math.floor((ecMin(x.start) + (x.dur || 60)) / 60)).padStart(2, '0') + ':' + String((ecMin(x.start) + (x.dur || 60)) % 60).padStart(2, '0');
          evs.push({ id: 'ret_' + bk.id + '_extra_' + (x.id || x.start), resourceId: x.shala1, date: dateStr, startTime: x.start, endTime: end, title, subtitle: (x.label || 'Extra Class') + (x.coTeacher ? ' — with ' + x.coTeacher : ''), color: '#7c3aed', bg: '#ede9fe', textColor: '#5b21b6', isRetreat: true, bkId: bk.id });
        });
      });
    } catch (e) { console.warn('[extra-class]', e); }
    return evs;
  };
})();
