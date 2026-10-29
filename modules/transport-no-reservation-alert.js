// ===== transport-no-reservation-alert.js — admin alert: "X is on the transport log for <date> but does not have a reservation" (Darlene 2026-10-29) =====
// Loaded as a classic script AFTER transport.js; shares global scope. Standalone, read-only: it never changes data.
// Rule: a guest (teachers included) has a transport entry whose ARRIVAL date is before the day their room reservation starts (their own check-in, else the retreat's
// start date), and no reservation anywhere (another booking's room list, e.g. an "Extra Night" booking) has that same guest staying that night. One red chip
// "⚠ N on transport log without a reservation" (admin logins only, bottom-right) opens the list. Rooms booked only in Cloudbeds and not linked to the portal can't be seen here.
let tnrList = [];
function tnrAdmin() {
  try {
    if (typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE && sessionStorage.getItem('ama_admin_viewing') !== '1') return false;
    let s = null; try { s = (typeof getCurrentSession === 'function') ? getCurrentSession() : JSON.parse(sessionStorage.getItem('amansala_staff_session') || 'null'); } catch (e) {}
    if (s && s.role) return s.role === 'admin';
    return sessionStorage.getItem('ama_admin_viewing') === '1' || !!localStorage.getItem('ama_admin_device');
  } catch (e) { return false; }
}
const tnrEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const tnrNorm = s => String(s || '').toLowerCase().replace(/\|.*$/, '').replace(/\(.*?\)/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
const tnrDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

function tnrScan() {
  const out = [];
  try {
    if (typeof getTransportRoster !== 'function' || typeof AppData === 'undefined') return out;
    const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const live = (AppData.bookings || []).filter(b => b.status !== 'cancelled' && b.startDate && b.endDate);
    // every named guest's stay (check-in inclusive, check-out exclusive) in any live booking
    const stays = [];
    (AppData.regs || []).forEach(r => {
      const bk = live.find(b => b.id === r.bookingId); if (!bk || r.cancelled) return;
      (r.guests || []).filter(g => g.name && !g.cancelled).forEach(g => stays.push({ n: tnrNorm(g.name), a: g.checkIn || r.checkIn || bk.startDate, b: g.checkOut || r.checkOut || bk.endDate }));
    });
    live.forEach(bk => {
      if (bk.bookingType === 'room_only' && !/teacher/i.test(bk.leaderName || '')) { /* a room-only/extra-night booking is itself a reservation; handled via regs above */ }
      if (String(bk.endDate) < today || /zzz|\btest\b/i.test((bk.retreatName || '') + ' ' + (bk.leaderName || ''))) return;
      let roster; try { roster = getTransportRoster(bk.id).guestsWithTransport; } catch (e) { return; }
      roster.forEach(g => {
        const tr = g.tr; if (!tr || tr.arrivalOT || !tr.arrivalDate) return;
        const reg = (AppData.regs || []).find(r => r.bookingId === bk.id && r.room === g.room);
        const gst = reg && (reg.guests || []).find(x => tnrNorm(x.name) === tnrNorm(g.name));
        const start = (gst && gst.checkIn) || (reg && reg.checkIn) || bk.startDate;
        const d = tr.arrivalDate;
        if (!(d < start) || d < today) return;
        const n = tnrNorm(g.name);
        const covered = stays.some(s => s.n === n && s.a <= d && d < s.b);
        if (covered) return;
        out.push({ name: g.name, date: d, start, retreat: bk.retreatName || bk.leaderName || '', bkId: bk.id, teacher: !!(reg && reg.isTeacherRoom) || tnrNorm(bk.leaderName) === n });
      });
    });
  } catch (e) { console.warn('[transport-no-reservation-alert]', e); }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
function tnrChip() {
  let chip = document.getElementById('tnrChip');
  if (!chip) {
    chip = document.createElement('button'); chip.id = 'tnrChip'; chip.onclick = tnrShow;
    chip.style.cssText = 'position:fixed;right:14px;bottom:218px;z-index:99987;display:none;padding:8px 14px;border-radius:99px;border:2px solid #fca5a5;background:#fef2f2;color:#b91c1c;font-family:Jost,sans-serif;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18)';
    document.body.appendChild(chip);
  }
  return chip;
}
function tnrTick() {
  try {
    if (!document.body) return;
    const chip = tnrChip();
    if (!tnrAdmin()) { chip.style.display = 'none'; return; }
    tnrList = tnrScan();
    chip.style.display = tnrList.length ? 'block' : 'none';
    chip.textContent = `⚠ ${tnrList.length} on transport log without a reservation`;
  } catch (e) {}
}
function tnrShow() {
  tnrList = tnrScan();
  let m = document.getElementById('tnrModal');
  if (!m) { m = document.createElement('div'); m.id = 'tnrModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px'; document.body.appendChild(m); }
  m.style.display = 'flex';
  m.innerHTML = `<div style="background:#f5f1eb;border-radius:16px;max-width:640px;width:100%;max-height:90vh;overflow:auto;padding:20px 24px;box-shadow:0 12px 40px rgba(0,0,0,.3)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:#b91c1c">⚠ On the transport log without a reservation</div><button onclick="document.getElementById('tnrModal').style.display='none'" style="background:none;border:none;font-size:24px;cursor:pointer;color:#6b7280">×</button></div>
    <div style="font-size:12.5px;color:#6b7280;margin-bottom:12px">Guests whose transport arrival is before their room reservation starts, with no reservation for that night. Add the extra night, or fix the arrival date.</div>
    ${tnrList.length ? tnrList.map(a => `<div style="background:#fff;border:1.5px solid #fecaca;border-radius:12px;padding:10px 14px;margin-bottom:10px;font-size:13.5px;line-height:1.5"><b>Alert:</b> ${tnrEsc(a.name)}${a.teacher ? ' <span style="font-size:10.5px;font-weight:800;background:#92400e;color:#fff;padding:1px 6px;border-radius:5px">Teacher</span>' : ''} is on the transport log for <b>${tnrDay(a.date)}</b> but does not have a reservation.<div style="font-size:12px;color:#6b7280;margin-top:2px">${tnrEsc(a.retreat)} · room reservation starts ${tnrDay(a.start)}</div></div>`).join('') : '<div style="font-size:13px;color:#15803d;font-weight:600;padding:8px 0">Nothing to check right now ✓</div>'}
  </div>`;
}
setInterval(tnrTick, 60000); setTimeout(tnrTick, 9000);
