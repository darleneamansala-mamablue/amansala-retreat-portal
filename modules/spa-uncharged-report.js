// ===== spa-uncharged-report.js — Spa services that never got charged to a room =====
// Loaded as a classic script AFTER spa.js and spa-calendar.js; shares global scope. Standalone: adds one "Not Charged" tab to the Spa
// view and wraps spaSetView / spaRender so that tab renders. Read-only except the per-row Charge button, which calls the existing
// spaChargeApptToRoom. Matching uses spaResolveGuestForAppt / spaFindGuestByRoom, the same rules the charge button uses, so this
// report can never disagree with what a click on Charge would do.
// Already-charged check (Darlene 2026-10-22: "it is showing ones that are charged"): front desk often charges a service straight on the room account without
// updating the appointment, so about half of what this list used to show was already charged. Each service is now checked against the guest's Spa lines
// (ppFindCharged / ppLoadSpaLines in pending-charges.js) and the ones already on an account are left out of the list, with a summary line and a folded
// list so you can see which ones and what the line says.
// Why: Hotel Guest + Confirmed appointments auto-charge on save, but when the room number or name doesn't line up the charge is
// silently skipped, and nobody sees it until checkout (Darlene's ask 2026-10-21).
let spaUnchView = { upcoming: false, days: 14, linesReady: false, loading: false };

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
    .filter(a => !/\btest\b/i.test(a.clientName || '')) // practice bookings ("TEST CYAN", "Rubi Test") are never real charges
    .filter(a => !spaUnchView.days || (a.date || '') >= new Date(Date.now() - 5 * 3600000 - spaUnchView.days * 86400000).toISOString().slice(0, 10))
    .filter(a => spaUnchView.upcoming || (a.date || '') <= today)
    .sort((x, y) => (x.date || '').localeCompare(y.date || '') || (x.time || '').localeCompare(y.time || ''));
}

function spaUnchToggleUpcoming(on) { spaUnchView.upcoming = !!on; spaRenderUncharged(); }
async function spaUnchCharge(id) { await spaChargeApptToRoom(id); spaRenderUncharged(); }

// Delete an appointment from this list (stray test bookings, duplicates). It removes the appointment from the calendar, reports and payroll, never a charge on a room account.
async function spaApptDeleteFromList(id) {
  const a = (SpaAppointments || []).find(x => x.id === id); if (!a) return false;
  const svc = (SpaData.services || []).find(s => s.id === a.serviceId);
  if (!window.confirm(`Delete this appointment?\n\n${a.clientName || '(no name)'} — ${svc ? svc.name : 'service'} — ${a.date} ${a.time || ''}\n\nThis removes it from the calendar, the reports and payroll. It does NOT remove any charge already on a room account.\n\nIf the service really happened and was charged, press "Mark charged" instead, so the therapist is still paid.`)) return false;
  SpaAppointments = SpaAppointments.filter(x => x.id !== id);
  if (typeof spaCalSave === 'function') await spaCalSave();
  try { if (typeof logActivity === 'function') logActivity('Spa appointment deleted', `${a.clientName || ''} — ${svc ? svc.name : ''} — ${a.date} ${a.time || ''} (from the Not Charged list)`); } catch (e) {}
  if (typeof showToast === 'function') showToast('Appointment deleted.');
  return true;
}
async function spaUnchDelete(id) { if (await spaApptDeleteFromList(id)) spaRenderUncharged(); }
async function spaUnchMark(id, how) { if (typeof ppSpaMark === 'function') { await ppSpaMark(id, how); spaRenderUncharged(); } }
function spaUnchRecheck() { spaUnchView.linesReady = false; spaRenderUncharged(); }
function spaRenderUncharged() {
  const el = document.getElementById('spaContent'); if (!el) return;
  if (typeof ppLoadSpaLines === 'function' && !spaUnchView.linesReady) { // read the room accounts first, so nothing already charged is shown as missing
    if (!spaUnchView.loading) {
      spaUnchView.loading = true;
      ppLoadSpaLines().catch(e => console.warn('[not charged] could not read room accounts', e)).finally(() => { spaUnchView.linesReady = true; spaUnchView.loading = false; spaRenderUncharged(); });
    }
    el.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280">Checking the room accounts…</div>';
    return;
  }
  const all = spaUnchCollect();
  const lineOf = a => { try { if (typeof ppFindCharged !== 'function' || typeof ppState === 'undefined') return null; const m = ppState.marks && ppState.marks['spa|' + a.id]; return ppFindCharged(a, ppState.spaLines) || (m ? { desc: 'marked ' + (m.how === 'none' ? 'no charge needed' : 'charged') + ' by ' + m.by, price: 0 } : null); } catch (e) { return null; } };
  const doneRows = all.map(a => ({ a, line: lineOf(a) })).filter(x => x.line);
  const rows = all.filter(a => !doneRows.some(x => x.a.id === a.id));
  const btn = 'font-size:10.5px;font-weight:700;padding:4px 9px;border-radius:6px;cursor:pointer;white-space:nowrap;';
  const row = a => {
    const svc = (SpaData.services || []).find(s => s.id === a.serviceId);
    const ther = (SpaData.therapists || []).find(t => t.id === a.therapistId);
    const r = spaUnchReason(a);
    const room = a.guestRoom || a.roomNumber || '—';
    return `<div style="display:grid;grid-template-columns:96px 1.1fr 1.1fr 60px 1.4fr 330px;gap:10px;padding:10px 16px;border-top:1px solid #f0ebe0;align-items:center;font-size:12.5px;color:#2d2520;text-align:left">
      <div>${escHtml(a.date || '')}<div style="font-size:11px;color:#8a7e74">${escHtml(a.time || '')}</div></div>
      <div style="font-weight:600">${escHtml(a.clientName || '(no name)')}</div>
      <div>${escHtml(svc?.name || 'Service')}${ther ? `<div style="font-size:11px;color:#8a7e74">${escHtml(ther.firstName)}</div>` : ''}</div>
      <div>${escHtml(String(room))}</div>
      <div style="color:${r.fixable ? '#0f766e' : '#b45309'}">${escHtml(r.text)}</div>
      <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
        <button onclick="spaApptShowForm('${a.id}')" style="${btn}border:1.5px solid #c8bfb5;background:#fff;color:#2d2520">Edit</button>
        <button onclick="spaUnchCharge('${a.id}')" title="${r.fixable ? 'Post this service to the guest\'s room account' : 'The guest can\'t be matched yet — this will tell you why. Fix the room or name with Edit first.'}" style="${btn}border:1.5px solid ${r.fixable ? '#0d9488' : '#fcd34d'};background:${r.fixable ? '#f0fdfa' : '#fffbeb'};color:${r.fixable ? '#0f766e' : '#92400e'}">🧾 Charge to Room</button>
        ${typeof ppSpaMark === 'function' ? `<button onclick="spaUnchMark('${a.id}','charged')" style="${btn}border:1.5px solid #c8bfb5;background:#fff;color:#2d2520">✓ Mark charged</button>` : ''}
        <button onclick="spaUnchDelete('${a.id}')" style="${btn}border:1.5px solid #fca5a5;background:#fff;color:#b91c1c">🗑 Delete</button>
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
      <div style="display:flex;gap:12px;align-items:center"><select onchange="spaUnchView.days=+this.value;spaRenderUncharged()" style="${btn}border:1.5px solid #c8bfb5;background:#fff;color:#2d2520">${[7, 14, 30, 60, 0].map(d => `<option value="${d}"${d === spaUnchView.days ? ' selected' : ''}>${d ? 'Last ' + d + ' days' : 'All time'}</option>`).join('')}</select><label style="font-size:12px;color:#2d2520;cursor:pointer"><input type="checkbox" ${spaUnchView.upcoming ? 'checked' : ''} onchange="spaUnchToggleUpcoming(this.checked)"> Include upcoming dates</label>
        <button onclick="spaUnchRecheck()" style="${btn}border:1.5px solid #c8bfb5;background:#fff;color:#2d2520">↻ Check again</button></div>
    </div>
    ${doneRows.length ? `<div style="margin-bottom:14px;padding:12px 16px;border-radius:12px;background:#f0fdf4;border:1.5px solid #bbf7d0;font-size:13px;color:#14532d;line-height:1.5">
      <b>✓ ${doneRows.length} of ${all.length}</b> services that looked uncharged are <b>actually already charged</b> on the guest's room account (charged by hand before the appointment was updated), so they are not listed below.
      <b>${rows.length}</b> ${rows.length === 1 ? 'really still needs' : 'really still need'} charging.
      <details style="margin-top:6px"><summary style="cursor:pointer;font-weight:600">Show the ${doneRows.length} already charged</summary><div style="margin-top:6px;font-size:12px;line-height:1.7">${doneRows.map(x => `${escHtml(x.a.date)} ${escHtml(x.a.time || '')} · <b>${escHtml(x.a.clientName || '')}</b> — ${escHtml(x.line.desc || '')}${x.line.price ? ' $' + x.line.price : ''}`).join('<br>')}</div></details></div>` : ''}
    <div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;overflow:hidden">
      ${rows.length ? `<div style="display:grid;grid-template-columns:96px 1.1fr 1.1fr 60px 1.4fr 330px;gap:10px;padding:10px 16px;background:#f8f5f0;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#8a7e74"><div>Date</div><div>Client</div><div>Service</div><div>Room</div><div>Why not charged</div><div></div></div>${rows.map(row).join('')}`
        : `<div style="padding:40px;text-align:center;color:#6b7280">${doneRows.length ? 'Nothing left to charge — everything listed above is already on a room account.' : 'Everything is charged. Nothing to fix.'}</div>`}
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
