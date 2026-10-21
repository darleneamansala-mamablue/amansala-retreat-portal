// ===== spa-uncharged-report.js — Spa services that never got charged to a room =====
// Loaded as a classic script AFTER spa.js and spa-calendar.js; shares global scope. Standalone: adds one "Not Charged" tab to the Spa
// view and wraps spaSetView / spaRender so that tab renders. Read-only except the per-row Charge button, which calls the existing
// spaChargeApptToRoom. Matching uses spaResolveGuestForAppt / spaFindGuestByRoom, the same rules the charge button uses, so this
// report can never disagree with what a click on Charge would do.
// Why: Hotel Guest + Confirmed appointments auto-charge on save, but when the room number or name doesn't line up the charge is
// silently skipped, and nobody sees it until checkout (Darlene's ask 2026-10-21).
let spaUnchView = { upcoming: false };

function spaUnchReason(a) {
  const { match, bkMatch, roomHint } = spaResolveGuestForAppt(a);
  const svc = (SpaData.services || []).find(s => s.id === a.serviceId);
  const price = svc ? (svc.groupPricing ? (a.groupTotalPriceUSD ?? svc.price) : svc.price) : null;
  if (!(match || bkMatch)) {
    if (!roomHint) return { text: 'No room number on the appointment, and the name matches no guest', fixable: false };
    const byRoom = spaFindGuestByRoom(roomHint);
    if (!byRoom) return { text: `Room ${roomHint} has no guest — check the room number`, fixable: false };
    const who = byRoom.reg ? byRoom.guest.name : byRoom.bk.leaderName;
    return { text: `Room ${roomHint} is ${who}, which doesn't match "${a.clientName}" — wrong room or name`, fixable: false };
  }
  if (price == null) return { text: 'Guest found, but the service has no price set', fixable: false };
  return { text: 'Guest found, not posted yet — click Charge', fixable: true };
}

function spaUnchCollect() {
  const today = new Date().toISOString().slice(0, 10);
  return (SpaAppointments || [])
    .filter(a => a.guestType === 'hotel' && !a.prepaid && a.folioStatus !== 'POSTED' && (a.status === 'CONFIRMED' || a.status === 'COMPLETED'))
    .filter(a => spaUnchView.upcoming || (a.date || '') <= today)
    .sort((x, y) => (x.date || '').localeCompare(y.date || '') || (x.time || '').localeCompare(y.time || ''));
}

function spaUnchToggleUpcoming(on) { spaUnchView.upcoming = !!on; spaRenderUncharged(); }
async function spaUnchCharge(id) { await spaChargeApptToRoom(id); spaRenderUncharged(); }

function spaRenderUncharged() {
  const el = document.getElementById('spaContent'); if (!el) return;
  const rows = spaUnchCollect();
  const btn = 'font-size:10.5px;font-weight:700;padding:4px 9px;border-radius:6px;cursor:pointer;white-space:nowrap;';
  const row = a => {
    const svc = (SpaData.services || []).find(s => s.id === a.serviceId);
    const ther = (SpaData.therapists || []).find(t => t.id === a.therapistId);
    const r = spaUnchReason(a);
    const room = a.guestRoom || a.roomNumber || '—';
    return `<div style="display:grid;grid-template-columns:96px 1.2fr 1.2fr 70px 1.6fr 170px;gap:10px;padding:10px 16px;border-top:1px solid #f0ebe0;align-items:center;font-size:12.5px;color:#2d2520;text-align:left">
      <div>${escHtml(a.date || '')}<div style="font-size:11px;color:#8a7e74">${escHtml(a.time || '')}</div></div>
      <div style="font-weight:600">${escHtml(a.clientName || '(no name)')}</div>
      <div>${escHtml(svc?.name || 'Service')}${ther ? `<div style="font-size:11px;color:#8a7e74">${escHtml(ther.firstName)}</div>` : ''}</div>
      <div>${escHtml(String(room))}</div>
      <div style="color:${r.fixable ? '#0f766e' : '#b45309'}">${escHtml(r.text)}</div>
      <div style="display:flex;gap:6px;justify-content:flex-end">
        <button onclick="spaApptShowForm('${a.id}')" style="${btn}border:1.5px solid #c8bfb5;background:#fff;color:#2d2520">Edit</button>
        ${r.fixable ? `<button onclick="spaUnchCharge('${a.id}')" style="${btn}border:1.5px solid #0d9488;background:#f0fdfa;color:#0f766e">🧾 Charge</button>` : ''}
      </div></div>`;
  };
  const total = rows.reduce((s, a) => {
    const svc = (SpaData.services || []).find(x => x.id === a.serviceId);
    const p = svc ? (svc.groupPricing ? (a.groupTotalPriceUSD ?? svc.price) : svc.price) : 0;
    return s + (p || 0);
  }, 0);
  el.innerHTML = `<div style="text-align:left">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">
      <div><div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600;color:#2d2520">Not Charged to a Room</div>
        <div style="font-size:12px;color:#6b7280">Hotel Guest services that are Confirmed or Completed but never posted to a folio. Pre-Paid ones are left out.</div></div>
      <label style="font-size:12px;color:#2d2520;cursor:pointer"><input type="checkbox" ${spaUnchView.upcoming ? 'checked' : ''} onchange="spaUnchToggleUpcoming(this.checked)"> Include upcoming dates</label>
    </div>
    <div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;overflow:hidden">
      ${rows.length ? `<div style="display:grid;grid-template-columns:96px 1.2fr 1.2fr 70px 1.6fr 170px;gap:10px;padding:10px 16px;background:#f8f5f0;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#8a7e74"><div>Date</div><div>Client</div><div>Service</div><div>Room</div><div>Why not charged</div><div></div></div>${rows.map(row).join('')}`
        : '<div style="padding:40px;text-align:center;color:#6b7280">Everything is charged. Nothing to fix.</div>'}
    </div>
    ${rows.length ? `<div style="margin-top:14px;text-align:right;font-size:13px;font-weight:700;color:#1a2332">${rows.length} service${rows.length !== 1 ? 's' : ''} · $${total.toFixed(0)} not yet charged</div>` : ''}
  </div>`;
}

(function () {
  if (typeof spaSetView !== 'function' || typeof spaRender !== 'function') return;
  const origSetView = window.spaSetView, origRender = window.spaRender;
  window.spaSetView = function (v) {
    origSetView(v);
    const b = document.getElementById('spaViewUncharged');
    if (b) { b.style.background = v === 'uncharged' ? 'var(--teal,#2d6a6a)' : 'transparent'; b.style.color = v === 'uncharged' ? '#fff' : 'var(--dark)'; }
  };
  window.spaRender = function () {
    if (spaCurView !== 'uncharged') return origRender();
    const wrap = document.getElementById('spaAddBtnWrap'); if (wrap) wrap.innerHTML = '';
    const c = document.getElementById('spaContent'); if (c) { c.style.padding = ''; c.style.textAlign = ''; }
    spaRenderUncharged();
  };
  const payroll = document.getElementById('spaViewPayroll');
  if (payroll && !document.getElementById('spaViewUncharged')) {
    const b = payroll.cloneNode(false);
    b.id = 'spaViewUncharged';
    b.setAttribute('onclick', "spaSetView('uncharged')");
    b.textContent = '⚠ Not Charged';
    payroll.parentNode.insertBefore(b, payroll);
  }
})();
