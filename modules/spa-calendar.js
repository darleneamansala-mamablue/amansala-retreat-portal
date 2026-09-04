// ===== SPA MODULE — Phase 2: Calendar & Availability =====
// Own module file per project convention, separate from modules/spa.js
// (Phase 1: services/therapists/rooms). Admin-driven appointment calendar —
// day view, by therapist or by room, 15-minute grid, click-to-create,
// drag-to-reschedule. Persists to Supabase app_store under 'spa_appointments'.
//
// Guest self-service booking, Stripe, and Cloudbeds folio posting are later
// phases — appointments here are created/edited by staff.

const SPA_CAL_START_H = 7;
const SPA_CAL_END_H = 21;
const SPA_CAL_PX_HR = 72;
const SPA_CAL_COL_W = 170;
const SPA_CAL_TIME_W = 56;

let SpaAppointments = [];
let spaCalLoaded = false;
let spaCalDate = new Date(); spaCalDate.setHours(0, 0, 0, 0);
let spaCalMode = 'therapist';
let spaCalDragApptId = null;

// One-click filter to a wellness category — Darlene's revised ask: two
// groups, Body Workers on their own and everything else (Fitness, Yoga,
// Spirit, Pilates, Dance) combined under one "the rest" bucket, with a
// button to show that combined section on its own.
let spaCalGroupFilter = 'all';
const SPA_CAL_FILTER_BTNS = [
  { key: 'massage', label: '🪷 Body Workers' },
  { key: 'other', label: '🌿 Fitness, Yoga & Spirit' },
];
function spaCalGroupMatchesFilter(groupKey) {
  if (spaCalGroupFilter === 'all') return true;
  if (spaCalGroupFilter === 'other') return groupKey !== 'massage';
  return groupKey === spaCalGroupFilter;
}
function spaCalSetGroupFilter(key) {
  spaCalGroupFilter = (spaCalGroupFilter === key) ? 'all' : key;
  spaCalRenderToolbar();
  spaCalRender();
}

async function spaCalLoad() {
  try {
    const { data } = await db.from('app_store').select('value').eq('key', 'spa_appointments').single();
    SpaAppointments = (data && data.value) || [];
  } catch (e) {
    SpaAppointments = [];
  }
  spaCalLoaded = true;
}

async function spaCalSave() {
  try {
    await db.from('app_store').upsert({ key: 'spa_appointments', value: SpaAppointments, updated_at: new Date().toISOString() });
  } catch (e) {
    console.warn('[spa-calendar] save failed', e);
  }
}

function spaCalFmtDateStr(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function spaCalMinToHHMM(min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
function spaCalHHMMToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function spaCalFmtT(t) { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + ap; }

// ── TOOLBAR ──────────────────────────────────────────────────────────────
function spaCalRenderToolbar() {
  const wrap = document.getElementById('spaAddBtnWrap');
  const dateLabel = spaCalDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div style="display:flex;gap:4px;background:#f5f1eb;border-radius:8px;padding:3px">
        <button onclick="spaCalSetMode('therapist')" id="spaCalModeTher" style="padding:6px 12px;font-size:12px;font-weight:600;border:none;border-radius:6px;cursor:pointer;font-family:'Jost',sans-serif">By Therapist</button>
        <button onclick="spaCalSetMode('room')" id="spaCalModeRoom" style="padding:6px 12px;font-size:12px;font-weight:600;border:none;border-radius:6px;cursor:pointer;font-family:'Jost',sans-serif">By Room</button>
      </div>
      <button onclick="spaCalNav(-1)" style="width:28px;height:28px;border:1px solid var(--border);border-radius:7px;background:#fff;cursor:pointer;font-size:16px">&#8249;</button>
      <span style="font-size:13px;font-weight:600;min-width:140px;text-align:center;font-family:'Jost',sans-serif">${dateLabel}</span>
      <button onclick="spaCalNav(1)" style="width:28px;height:28px;border:1px solid var(--border);border-radius:7px;background:#fff;cursor:pointer;font-size:16px">&#8250;</button>
      <button onclick="spaCalToday()" style="padding:6px 12px;font-size:12px;font-weight:600;border:1.5px solid var(--border);border-radius:7px;background:#fff;cursor:pointer;font-family:'Jost',sans-serif">Today</button>
      <button onclick="spaApptShowForm(null)" style="display:flex;align-items:center;gap:6px;padding:9px 16px;background:var(--teal,#2d6a6a);color:#fff;border:none;border-radius:10px;font-family:'Jost',sans-serif;font-size:13px;font-weight:600;cursor:pointer;margin-left:6px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Appointment
      </button>
    </div>
    ${spaCalMode === 'therapist' ? `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px">
      <span style="font-size:11px;font-weight:700;color:#8a7e74;text-transform:uppercase;letter-spacing:.4px">View:</span>
      ${SPA_CAL_FILTER_BTNS.map(f => `<button onclick="spaCalSetGroupFilter('${f.key}')" style="padding:7px 14px;min-height:32px;font-size:12.5px;font-weight:700;border-radius:99px;cursor:pointer;font-family:'Jost',sans-serif;border:1.5px solid ${spaCalGroupFilter === f.key ? 'var(--teal,#2d6a6a)' : '#e8dfd4'};background:${spaCalGroupFilter === f.key ? 'var(--teal,#2d6a6a)' : '#fff'};color:${spaCalGroupFilter === f.key ? '#fff' : 'var(--dark)'}" aria-pressed="${spaCalGroupFilter === f.key}">${f.label}</button>`).join('')}
      ${spaCalGroupFilter !== 'all' ? `<button onclick="spaCalSetGroupFilter('all')" style="padding:7px 14px;min-height:32px;font-size:12px;font-weight:600;border-radius:99px;cursor:pointer;font-family:'Jost',sans-serif;border:1.5px dashed var(--muted);background:none;color:var(--muted)">Show All</button>` : ''}
    </div>` : ''}`;
  const btnT = document.getElementById('spaCalModeTher'), btnR = document.getElementById('spaCalModeRoom');
  btnT.style.background = spaCalMode === 'therapist' ? 'var(--teal,#2d6a6a)' : 'transparent';
  btnT.style.color = spaCalMode === 'therapist' ? '#fff' : 'var(--dark)';
  btnR.style.background = spaCalMode === 'room' ? 'var(--teal,#2d6a6a)' : 'transparent';
  btnR.style.color = spaCalMode === 'room' ? '#fff' : 'var(--dark)';
}
function spaCalSetMode(m) { spaCalMode = m; spaCalRenderToolbar(); spaCalRender(); }
function spaCalNav(dir) { spaCalDate = new Date(spaCalDate.getTime() + dir * DAY_MS); spaCalRenderToolbar(); spaCalRender(); }
function spaCalToday() { spaCalDate = new Date(); spaCalDate.setHours(0, 0, 0, 0); spaCalRenderToolbar(); spaCalRender(); }

// ── GRID ─────────────────────────────────────────────────────────────────
function spaCalRender() {
  const el = document.getElementById('spaContent');
  const dateStr = spaCalFmtDateStr(spaCalDate);
  const isTher = spaCalMode === 'therapist';

  if (!isTher) {
    if (!SpaData.rooms.length) { el.innerHTML = '<p style="color:#9ca3af;font-style:italic;text-align:center;padding:40px">No rooms yet.</p>'; return; }
    el.innerHTML = spaCalPanelHtml(SpaData.rooms, false, dateStr);
    return;
  }

  const activeTher = SpaData.therapists.filter(t => t.active).sort((a, b) => a.firstName.localeCompare(b.firstName));
  const muted = SpaData.therapists.filter(t => !t.active);
  if (!activeTher.length) { el.innerHTML = '<p style="color:#9ca3af;font-style:italic;text-align:center;padding:40px">No active therapists yet — add one in the Therapists tab.</p>'; return; }

  let html = '';
  if (muted.length) {
    html += `<div style="margin-bottom:14px;font-size:12px;color:#9ca3af;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span>🔇 Muted:</span>
      ${muted.map(t => `<button onclick="spaCalMuteToggle('${t.id}')" style="border:1px solid #e0d8cc;background:#fff;border-radius:99px;padding:3px 10px;font-size:11.5px;color:#6b7280;cursor:pointer;font-family:'Jost',sans-serif">${t.firstName} · tap to unmute</button>`).join('')}
    </div>`;
  }
  const groups = spaTherGroupList(activeTher).filter(g => spaCalGroupMatchesFilter(g.key));
  if (!groups.length) {
    html += `<p style="color:#9ca3af;font-style:italic;text-align:center;padding:40px">No active therapists in this category yet.</p>`;
  } else {
    groups.forEach(g => { html += spaCalSectionHtml(g.label, g.list, dateStr); });
  }
  el.innerHTML = html;
}

function spaCalSectionHtml(title, cols, dateStr) {
  return `<div style="margin-bottom:22px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#a89a86;margin-bottom:8px">${title}</div>
    <div style="overflow-x:auto">${spaCalPanelHtml(cols, true, dateStr)}</div>
  </div>`;
}

function spaCalPanelHtml(cols, isTher, dateStr) {
  const gridH = (SPA_CAL_END_H - SPA_CAL_START_H) * SPA_CAL_PX_HR;
  let html = `<div style="display:flex;min-width:${SPA_CAL_TIME_W + cols.length * SPA_CAL_COL_W}px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e8dfd4">`;

  html += `<div style="width:${SPA_CAL_TIME_W}px;min-width:${SPA_CAL_TIME_W}px;flex-shrink:0;position:sticky;left:0;z-index:5;background:#fff;border-right:2px solid #e0d8cc">`;
  html += `<div style="height:40px;border-bottom:1px solid #e8dfd4"></div><div style="position:relative;height:${gridH}px">`;
  for (let h = SPA_CAL_START_H; h <= SPA_CAL_END_H; h++) {
    const top = (h - SPA_CAL_START_H) * SPA_CAL_PX_HR;
    const ap = h >= 12 ? 'PM' : 'AM';
    html += `<div style="position:absolute;top:${top - 7}px;right:6px;font-size:10.5px;color:#9ca3af;font-family:'Jost',sans-serif">${(h % 12) || 12} ${ap}</div>`;
  }
  html += `</div></div>`;

  cols.forEach(col => {
    const dayAppts = SpaAppointments.filter(a => a.date === dateStr && a.status !== 'CANCELLED' && (isTher ? a.therapistId === col.id : a.roomId === col.id));
    html += `<div style="width:${SPA_CAL_COL_W}px;min-width:${SPA_CAL_COL_W}px;border-right:1px solid #e8e8e8">`;
    html += `<div style="height:40px;display:flex;align-items:center;justify-content:center;gap:5px;font-size:12px;font-weight:700;color:#374151;border-bottom:1px solid #e8dfd4;background:#f9f7f4;text-align:center;padding:0 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">
      <span style="overflow:hidden;text-overflow:ellipsis">${isTher ? col.firstName + ' ' + (col.lastName || '') : col.name}</span>
      ${isTher ? `<span onclick="event.stopPropagation();spaCalMuteToggle('${col.id}')" title="Mute ${col.firstName}" style="cursor:pointer;opacity:.4;flex-shrink:0;font-size:12px" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='.4'">🔇</span>` : ''}
    </div>`;
    html += `<div class="spa-cal-col" style="position:relative;height:${gridH}px;background:repeating-linear-gradient(to bottom, transparent, transparent ${SPA_CAL_PX_HR - 1}px, #f1f5f9 ${SPA_CAL_PX_HR - 1}px, #f1f5f9 ${SPA_CAL_PX_HR}px)" onclick="spaCalCellClick(event,'${col.id}')" ondragover="event.preventDefault()" ondrop="spaCalDrop(event,'${col.id}')">`;
    dayAppts.forEach(a => {
      const svc = SpaData.services.find(s => s.id === a.serviceId);
      const top = (spaCalHHMMToMin(a.start) - SPA_CAL_START_H * 60) * (SPA_CAL_PX_HR / 60);
      const height = Math.max(20, a.duration * (SPA_CAL_PX_HR / 60));
      const statusColor = a.status === 'COMPLETED' ? '#059669' : a.status === 'NO_SHOW' ? '#dc2626' : '#2d6a6a';
      const otherLabel = isTher ? (SpaData.rooms.find(r => r.id === a.roomId)?.name || '') : (SpaData.therapists.find(t => t.id === a.therapistId)?.firstName || '');
      html += `<div draggable="true" ondragstart="spaCalDragStart(event,'${a.id}')" onclick="event.stopPropagation();spaApptShowForm('${a.id}')" style="position:absolute;top:${top}px;left:3px;right:3px;height:${height}px;background:${statusColor}18;border-left:3px solid ${statusColor};border-radius:6px;padding:4px 7px;overflow:hidden;cursor:grab;font-family:'Jost',sans-serif">
        ${isTher ? `<span onclick="event.stopPropagation();spaCalToggleApptConfirm('${a.id}')" title="${a.confirmed ? 'Confirmed by ' + (a.confirmedBy || 'staff') + ' — click to unconfirm' : 'Not yet confirmed by the therapist — click to confirm on their behalf'}" style="position:absolute;top:3px;right:5px;font-size:12px;cursor:pointer;line-height:1;z-index:2">${a.confirmed ? '✅' : '⏳'}</span>` : ''}
        <div style="font-size:11px;font-weight:700;color:#1a2332;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:${isTher ? '16px' : '0'}">${a.clientName}</div>
        <div style="font-size:10px;color:#4b5563;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${svc ? svc.name : ''}</div>
        ${height > 44 ? `<div style="font-size:9.5px;color:#9ca3af">${spaCalFmtT(a.start)}${otherLabel ? ' · ' + otherLabel : ''}</div>` : ''}
      </div>`;
    });
    html += `</div></div>`;
  });
  html += `</div>`;
  return html;
}

// Lets Darlene confirm/unconfirm a service on the therapist's behalf directly
// from the admin calendar — reuses the same toggle the therapist's own
// login uses (scConfirmSpa in staff-confirm-portal.js) so both sides always
// agree on one confirmed/confirmedAt/confirmedBy state per appointment.
async function spaCalToggleApptConfirm(apptId) {
  if (typeof scConfirmSpa !== 'function') return;
  await scConfirmSpa(apptId, getCurrentSession()?.name || 'Staff');
  spaCalRender();
}
function spaCalMuteToggle(therapistId) {
  const t = SpaData.therapists.find(x => x.id === therapistId);
  if (!t) return;
  t.active = !t.active;
  spaSave();
  spaCalRender();
}

function spaCalCellClick(evt, colId) {
  const rect = evt.currentTarget.getBoundingClientRect();
  const y = evt.clientY - rect.top;
  let minutesFromStart = Math.round((y / (SPA_CAL_PX_HR / 60)) / 15) * 15;
  minutesFromStart = Math.max(0, Math.min(minutesFromStart, (SPA_CAL_END_H - SPA_CAL_START_H) * 60 - 15));
  spaApptShowForm(null, { colId, start: spaCalMinToHHMM(SPA_CAL_START_H * 60 + minutesFromStart), mode: spaCalMode });
}

function spaCalDragStart(evt, apptId) { spaCalDragApptId = apptId; evt.dataTransfer.setData('text/plain', apptId); }

function spaCalDrop(evt, colId) {
  evt.preventDefault();
  const apptId = spaCalDragApptId || evt.dataTransfer.getData('text/plain');
  const appt = SpaAppointments.find(a => a.id === apptId);
  if (!appt) return;
  const rect = evt.currentTarget.getBoundingClientRect();
  const y = evt.clientY - rect.top;
  let minutesFromStart = Math.round((y / (SPA_CAL_PX_HR / 60)) / 15) * 15;
  minutesFromStart = Math.max(0, Math.min(minutesFromStart, (SPA_CAL_END_H - SPA_CAL_START_H) * 60 - appt.duration));
  const newStart = spaCalMinToHHMM(SPA_CAL_START_H * 60 + minutesFromStart);
  const newTherapistId = spaCalMode === 'therapist' ? colId : appt.therapistId;
  const newRoomId = spaCalMode === 'room' ? colId : appt.roomId;
  const conflict = spaCalCheckConflict({ ...appt, start: newStart, therapistId: newTherapistId, roomId: newRoomId }, appt.id);
  if (conflict) { alert("Can't move there — conflicts with " + conflict.clientName + ' at ' + spaCalFmtT(conflict.start) + '.'); return; }
  appt.start = newStart; appt.therapistId = newTherapistId; appt.roomId = newRoomId;
  spaCalSave();
  spaCalRender();
}

// Same therapist or same (non-null) room, same day, overlapping time — the two
// checks a physical calendar can't do on paper but a database update should
// never allow either. Revalidated here before every save/move.
function spaCalCheckConflict(appt, excludeId) {
  const startMin = spaCalHHMMToMin(appt.start);
  const endMin = startMin + (parseInt(appt.duration, 10) || 60);
  return SpaAppointments.find(a => {
    if (a.id === excludeId) return false;
    if (a.date !== appt.date) return false;
    if (a.status === 'CANCELLED') return false;
    const sameTherapist = a.therapistId && appt.therapistId && a.therapistId === appt.therapistId;
    const sameRoom = a.roomId && appt.roomId && a.roomId === appt.roomId;
    if (!sameTherapist && !sameRoom) return false;
    const aStart = spaCalHHMMToMin(a.start);
    const aEnd = aStart + (parseInt(a.duration, 10) || 60);
    return startMin < aEnd && endMin > aStart;
  });
}

// ── APPOINTMENT FORM ─────────────────────────────────────────────────────
function spaApptPopulateTherapistSelect(serviceId, selectedId) {
  const sel = document.getElementById('spaApptTherapist');
  const eligible = SpaData.therapists.filter(t => t.active && (!serviceId || (t.services || []).some(s => s.serviceId === serviceId)));
  sel.innerHTML = '<option value="">— Select —</option>' + eligible.map(t => `<option value="${t.id}" ${selectedId === t.id ? 'selected' : ''}>${t.firstName} ${t.lastName || ''}</option>`).join('');
}

function spaApptPopulateTimeSelect(selected) {
  const sel = document.getElementById('spaApptStart');
  let opts = '', found = false;
  for (let m = SPA_CAL_START_H * 60; m <= SPA_CAL_END_H * 60 - 15; m += 15) {
    const t = spaCalMinToHHMM(m);
    if (t === selected) found = true;
    opts += `<option value="${t}" ${selected === t ? 'selected' : ''}>${spaCalFmtT(t)}</option>`;
  }
  if (selected && !found) opts += `<option value="${selected}" selected>${spaCalFmtT(selected)}</option>`;
  sel.innerHTML = opts;
}

function spaApptOnServiceChange() {
  const svcId = document.getElementById('spaApptService').value;
  const svc = SpaData.services.find(s => s.id === svcId);
  spaApptPopulateTherapistSelect(svcId, document.getElementById('spaApptTherapist').value);
  if (svc?.duration) document.getElementById('spaApptDuration').value = svc.duration;
  spaApptUpdatePriceDisplay(svc);
}
function spaApptUpdatePriceDisplay(svc) {
  const el = document.getElementById('spaApptPriceDisplay');
  if (!el) return;
  if (!svc) { el.textContent = ''; return; }
  if (svc.groupPricing) { el.textContent = `Rate: from $${groupPriceFor(svc, svc.groupPricing.minGuests || 1)} (group pricing)`; return; }
  el.textContent = svc.price != null ? `Rate: $${svc.price}` : 'Rate: not set — add a price in Services';
}
function spaApptOnTherapistChange() {}

function spaApptShowForm(id, prefill) {
  prefill = prefill || {};
  const a = id ? SpaAppointments.find(x => x.id === id) : null;
  document.getElementById('spaApptModalTitle').textContent = a ? 'Edit Appointment' : 'New Appointment';
  document.getElementById('spaApptConflictWarn').style.display = 'none';
  document.getElementById('spaApptId').value = id || '';
  document.getElementById('spaApptClientName').value = a?.clientName || '';
  document.getElementById('spaApptGuestType').value = a?.guestType || 'hotel';
  document.getElementById('spaApptNotes').value = a?.notes || '';
  document.getElementById('spaApptStatus').value = a?.status || 'CONFIRMED';
  document.getElementById('spaApptPaymentStatus').value = a?.paymentStatus && ['PENDING', 'PAID', 'CONFIRMED'].includes(a.paymentStatus) ? a.paymentStatus : 'PENDING';
  document.getElementById('spaApptDate').value = a?.date || spaCalFmtDateStr(spaCalDate);

  const svcSel = document.getElementById('spaApptService');
  svcSel.innerHTML = '<option value="">— Select —</option>' + SpaData.services.filter(s => s.active).map(s => `<option value="${s.id}" ${a?.serviceId === s.id ? 'selected' : ''}>${s.name}</option>`).join('');
  spaApptUpdatePriceDisplay(SpaData.services.find(s => s.id === svcSel.value));

  const initTherapistId = a?.therapistId || (prefill.mode === 'therapist' ? prefill.colId : '') || '';
  spaApptPopulateTherapistSelect(svcSel.value, initTherapistId);

  const initRoomId = a?.roomId || (prefill.mode === 'room' ? prefill.colId : '') || '';
  document.getElementById('spaApptRoom').innerHTML = '<option value="">— None —</option>' + SpaData.rooms.map(r => `<option value="${r.id}" ${initRoomId === r.id ? 'selected' : ''}>${r.name}</option>`).join('');

  spaApptPopulateTimeSelect(a?.start || prefill.start || '10:00');

  const selectedSvc = SpaData.services.find(s => s.id === svcSel.value);
  document.getElementById('spaApptDuration').value = a?.duration || selectedSvc?.duration || 60;

  document.getElementById('spaApptDeleteWrap').style.display = a ? 'block' : 'none';
  spaApptRenderHistory(a);
  openModal('spaApptModal');
}

// Lets staff see the original booking details alongside anything changed
// afterward — Darlene's feedback: helpful for resolving discrepancies
// without having to trust memory of what the guest originally asked for.
function spaApptFieldLabels(f) {
  const svcName = id => SpaData.services.find(s => s.id === id)?.name || id || '—';
  const therName = id => id ? (SpaData.therapists.find(t => t.id === id)?.firstName || 'Unassigned') : 'Unassigned';
  const roomName = id => id ? (SpaData.rooms.find(r => r.id === id)?.name || id) : 'None';
  return {
    clientName: { label: 'Client', fmt: v => v || '—' },
    serviceId: { label: 'Service', fmt: svcName },
    therapistId: { label: 'Therapist', fmt: therName },
    roomId: { label: 'Room', fmt: roomName },
    date: { label: 'Date', fmt: v => v || '—' },
    start: { label: 'Start Time', fmt: v => v ? spaCalFmtT(v) : '—' },
    duration: { label: 'Duration', fmt: v => v ? v + ' min' : '—' },
    status: { label: 'Status', fmt: v => v || '—' },
    paymentStatus: { label: 'Payment Status', fmt: v => v || 'PENDING' },
  }[f];
}
function spaApptRenderHistory(a) {
  const wrap = document.getElementById('spaApptHistoryWrap');
  const body = document.getElementById('spaApptHistoryBody');
  if (!wrap || !body) return;
  if (!a || !a.originalDetails) { wrap.style.display = 'none'; body.innerHTML = ''; return; }
  const orig = a.originalDetails;
  const origLines = Object.keys(orig).map(f => {
    const meta = spaApptFieldLabels(f); if (!meta) return '';
    return `<div><b>${meta.label}:</b> ${meta.fmt(orig[f])}</div>`;
  }).join('');
  const changeLines = (a.editHistory || []).slice().reverse().map(h => {
    const when = new Date(h.at).toLocaleString('en-US', { timeZone: 'America/Cancun', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const changes = h.changes.map(c => `${c.label} changed from "${c.from}" to "${c.to}"`).join('; ');
    return `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #f0ebe0"><b>${when}</b>${h.by ? ' — ' + escHtml(h.by) : ''}<br>${escHtml(changes)}</div>`;
  }).join('');
  wrap.style.display = 'block';
  body.innerHTML = `<div style="background:#faf7f2;border-radius:8px;padding:10px 12px;margin-bottom:6px">
    <div style="font-weight:700;margin-bottom:4px">Original Booking</div>${origLines}
  </div>${changeLines || '<div style="color:#9ca3af;font-style:italic">No changes recorded since creation.</div>'}`;
}

function spaApptSave() {
  const id = document.getElementById('spaApptId').value;
  const clientName = document.getElementById('spaApptClientName').value.trim();
  if (!clientName) { alert('Please enter a client name.'); return; }
  const serviceId = document.getElementById('spaApptService').value;
  const therapistId = document.getElementById('spaApptTherapist').value;
  if (!serviceId || !therapistId) { alert('Please select a service and therapist.'); return; }
  const duration = parseInt(document.getElementById('spaApptDuration').value, 10) || 60;
  if (duration % 15 !== 0) { alert('Duration must be in 15-minute increments.'); return; }
  const start = document.getElementById('spaApptStart').value;
  if (spaCalHHMMToMin(start) % 15 !== 0) { alert('Start time must be on a 15-minute boundary.'); return; }
  const fields = {
    clientName, guestType: document.getElementById('spaApptGuestType').value,
    serviceId, therapistId, roomId: document.getElementById('spaApptRoom').value || null,
    date: document.getElementById('spaApptDate').value, start, duration,
    status: document.getElementById('spaApptStatus').value,
    paymentStatus: document.getElementById('spaApptPaymentStatus').value,
    notes: document.getElementById('spaApptNotes').value.trim(),
  };
  const conflict = fields.status !== 'CANCELLED' ? spaCalCheckConflict(fields, id || null) : null;
  if (conflict) {
    const warn = document.getElementById('spaApptConflictWarn');
    warn.textContent = 'Conflicts with ' + conflict.clientName + ' at ' + spaCalFmtT(conflict.start) + ' — pick another time, therapist, or room.';
    warn.style.display = 'block';
    return;
  }
  if (id) {
    const appt = SpaAppointments.find(x => x.id === id);
    if (!appt.originalDetails) {
      const HIST_FIELDS = ['clientName', 'serviceId', 'therapistId', 'roomId', 'date', 'start', 'duration', 'status', 'paymentStatus'];
      appt.originalDetails = {};
      HIST_FIELDS.forEach(f => { appt.originalDetails[f] = appt[f]; });
    }
    const before = { ...appt };
    Object.assign(appt, fields);
    const HIST_FIELDS = ['clientName', 'serviceId', 'therapistId', 'roomId', 'date', 'start', 'duration', 'status', 'paymentStatus'];
    const changes = HIST_FIELDS.filter(f => (before[f] || '') !== (appt[f] || '')).map(f => {
      const meta = spaApptFieldLabels(f);
      return { field: f, label: meta.label, from: meta.fmt(before[f]), to: meta.fmt(appt[f]) };
    });
    if (changes.length) {
      if (!appt.editHistory) appt.editHistory = [];
      appt.editHistory.push({ at: new Date().toISOString(), by: (typeof getCurrentSession === 'function' ? getCurrentSession()?.name : null) || 'Staff', changes });
    }
  } else {
    SpaAppointments.push({ id: spaNewId('ap'), createdAt: new Date().toISOString(), ...fields });
  }
  spaCalSave();
  closeModal('spaApptModal');
  spaCalRender();
}

function spaApptDelete() {
  const id = document.getElementById('spaApptId').value;
  if (!id || !confirm('Delete this appointment? This cannot be undone.')) return;
  SpaAppointments = SpaAppointments.filter(x => x.id !== id);
  spaCalSave();
  closeModal('spaApptModal');
  spaCalRender();
}
