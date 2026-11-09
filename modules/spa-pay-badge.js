// ===== spa-pay-badge.js — how each spa appointment is paid, on the calendar card and in the appointment window =====
// Loaded as a classic script AFTER spa-calendar.js, spa-confirm-label.js and spa-booked-by.js; shares global scope. Standalone: wraps
// spaCalRender (decorates the cards afterwards), spaApptShowForm (adds a "Payment" box) and spaApptSave (records how a payment marked
// Paid by hand was taken, and who marked it). Nothing else is edited.
// Why (Jorge 2026-11-09, Melissa's question): the ✅ on a card only means the therapist saw it -- nobody could tell from the calendar
// whether a guest is offsite, whether they paid, or how.
// One line per card:
//   🏨 Room 12 · charged to folio / 🏨 Room 12 · not charged yet   hotel guest
//   ✦ Pre-paid package                                              hotel guest, included in the retreat package
//   💳 Paid · Stripe   💵 Paid · Cash   💳 Paid (how not recorded)   offsite guest
//   ⏳ Held · awaiting payment                                       Lana / Ask Jorge 10-minute hold (spa-hold-lib.js)
//   🔴 NOT PAID   ↩ Refunded                                        offsite guest

const SPB_METHODS = ['Cash', 'Card terminal', 'Bank transfer', 'Charged to a retreat / group', 'Other'];
const spbEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function spbAppt(id) { try { return (SpaAppointments || []).find(x => x.id === id); } catch (e) { return null; } }
function spbWhen(iso) { try { return iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Cancun', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; } catch (e) { return ''; } }

// { icon, text, color, detail } -- detail is the longer explanation for the appointment window and the card's hover text
function spbInfo(a) {
  if (!a) return null;
  const room = a.roomNumber || a.guestRoom || '';
  if (a.guestType === 'hotel' || (!a.guestType && (room || a.folioStatus === 'POSTED'))) {
    // Tricia books outside guests as Hotel Guest with "OS-" before the name (Jorge 2026-11-09: that is how it is done, keep it) --
    // there is no room to charge, so it is not a missing room charge
    if (/^\s*os\b/i.test(a.clientName || '') && a.folioStatus !== 'POSTED') return { icon: '🧾', text: 'OS · outside guest', color: '#6b7280', detail: 'Outside guest booked with "OS" before the name — no room folio; paid at the spa.' };
    if (a.prepaid) return { icon: '✦', text: 'Pre-paid package', color: '#15803d', detail: 'Hotel guest — included in the guest\'s retreat package, not charged to the room.' };
    if (a.folioStatus === 'POSTED') return { icon: '🏨', text: `${room ? 'Room ' + room : 'Room'} · charged to folio`, color: '#15803d', detail: `Hotel guest — charged to the room folio${room ? ' (room ' + room + ')' : ''}. The guest pays it with the rest of the folio; see Booking Detail → Folios.` };
    if (a.folioStatus === 'REVERSED') return { icon: '🏨', text: 'Room charge removed', color: '#6b7280', detail: 'Hotel guest — the charge was taken off the folio (cancelled).' };
    return { icon: '🏨', text: `${room ? 'Room ' + room : 'Room'} · not charged yet`, color: '#b45309', detail: 'Hotel guest — not on the room folio yet. Use "Charge to Room" on the Spa Dashboard.' };
  }
  if (a.guestType !== 'offsite') return { icon: '❔', text: 'Guest type not set', color: '#6b7280', detail: 'This appointment does not say whether the guest is a hotel guest or offsite.' };
  if (a.status === 'PAYMENT_PENDING') {
    const exp = a.holdExpiresAt ? ` until ${spbWhen(a.holdExpiresAt)}` : '';
    return { icon: '⏳', text: 'Held · awaiting payment', color: '#d97706', detail: `Offsite guest — payment link sent; the time is held${exp}. It is confirmed by itself when the guest pays, and released if they do not.` };
  }
  if (a.paymentStatus === 'REFUNDED') return { icon: '↩', text: 'Refunded', color: '#6b7280', detail: `Offsite guest — payment refunded${a.refundId ? ' (Stripe ' + a.refundId + ')' : ''}.` };
  if (a.paymentStatus === 'PAID' || a.paymentStatus === 'CONFIRMED') {
    if (a.paymentIntentId) return { icon: '💳', text: 'Paid · Stripe', color: '#15803d', stripe: a.paymentIntentId, detail: `Offsite guest — paid online by card (Stripe)${a.paidAt ? ' on ' + spbWhen(a.paidAt) : ''}.` };
    if (a.paidMethod) return { icon: a.paidMethod === 'Cash' ? '💵' : '💳', text: `Paid · ${a.paidMethod}`, color: '#15803d', detail: `Offsite guest — paid by ${a.paidMethod}, marked by ${a.paidMarkedBy || 'staff'}${a.paidMarkedAt ? ' on ' + spbWhen(a.paidMarkedAt) : ''}.` };
    return { icon: '💳', text: 'Paid (how not recorded)', color: '#15803d', detail: 'Offsite guest — marked Paid, but how it was paid and who marked it was not recorded (marked before 2026-11-09).' };
  }
  return { icon: '🔴', text: 'NOT PAID', color: '#dc2626', detail: 'Offsite guest — no payment recorded. Collect it and mark it Paid with how it was paid.' };
}

function spbDecorate() {
  try {
    document.querySelectorAll('[ondragstart^="spaCalDragStart"]').forEach(box => {
      const m = /spaCalDragStart\(event,'([^']+)'\)/.exec(box.getAttribute('ondragstart') || '');
      const a = m && spbAppt(m[1]), info = spbInfo(a);
      box.querySelectorAll('.spb-label').forEach(x => x.remove());
      if (!info || a.status === 'CANCELLED') return;
      const d = document.createElement('div');
      d.className = 'spb-label';
      d.title = info.detail;
      d.style.cssText = `font-size:9.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${info.color}`;
      d.textContent = `${info.icon} ${info.text}`;
      // right under the service line, so it still shows on a short card
      const lines = box.querySelectorAll(':scope > div');
      if (lines.length >= 2) lines[1].after(d); else box.appendChild(d);
    });
  } catch (e) { /* never break the screen */ }
}

// The "Payment" box in the appointment window, plus "Paid how?" when an offsite payment is marked Paid by hand
function spbFormBox(a) {
  const wrap = document.getElementById('spaApptPaymentStatusWrap');
  if (!wrap) return;
  let box = document.getElementById('spbPayBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'spbPayBox';
    box.style.cssText = 'grid-column:1/-1;border:1.5px solid #e5ded4;border-radius:9px;padding:9px 12px;font-size:12.5px;color:#374151;background:#faf8f5;margin-top:6px';
    wrap.parentNode.after(box);
  }
  const info = spbInfo(a);
  box.style.display = info ? '' : 'none';
  if (info) box.innerHTML = `<div style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8a7e74;margin-bottom:4px">Payment</div>
    <div style="font-weight:700;color:${info.color}">${info.icon} ${spbEsc(info.text)}</div>
    <div style="margin-top:2px">${spbEsc(info.detail)}</div>
    ${info.stripe ? `<a href="https://dashboard.stripe.com/payments/${encodeURIComponent(info.stripe)}" target="_blank" rel="noopener" style="color:#0e7490;font-weight:600">Open the payment in Stripe ↗</a>` : ''}`;

  let how = document.getElementById('spbPaidHowWrap');
  if (!how) {
    how = document.createElement('div');
    how.id = 'spbPaidHowWrap';
    how.innerHTML = `<label style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8a7e74;display:block;margin:8px 0 5px">Paid how?</label>
      <select id="spbPaidHow" style="width:100%;padding:9px 12px;border:1.5px solid #c8bfb5;border-radius:9px;font-family:'Jost',sans-serif;font-size:13px;background:#fff">
        <option value="">— Select —</option>${SPB_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}</select>`;
    wrap.appendChild(how);
    document.getElementById('spaApptPaymentStatus').addEventListener('change', spbToggleHow);
  }
  document.getElementById('spbPaidHow').value = (a && a.paidMethod) || '';
  spbToggleHow();
}
function spbToggleHow() {
  const how = document.getElementById('spbPaidHowWrap'), sel = document.getElementById('spaApptPaymentStatus');
  const a = spbAppt((document.getElementById('spaApptId') || {}).value);
  if (how && sel) how.style.display = sel.value === 'PAID' && !(a && a.paymentIntentId) ? '' : 'none';
}

(function () {
  const wrapAfter = (name, fn) => {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () { const r = orig.apply(this, arguments); try { fn.apply(this, arguments); } catch (e) {} return r; };
  };
  ['spaCalRender'].forEach(n => wrapAfter(n, () => setTimeout(spbDecorate, 0)));
  wrapAfter('spaApptShowForm', id => spbFormBox(id ? spbAppt(id) : null));

  // Saving: an offsite payment newly marked Paid by hand needs how it was paid; record it with who marked it
  const origSave = window.spaApptSave;
  if (typeof origSave === 'function') {
    window.spaApptSave = function () {
      const id = (document.getElementById('spaApptId') || {}).value || '';
      const before = id ? spbAppt(id) : null;
      const type = (document.getElementById('spaApptGuestType') || {}).value;
      const pay = (document.getElementById('spaApptPaymentStatus') || {}).value;
      const method = (document.getElementById('spbPaidHow') || {}).value || '';
      const byHand = type === 'offsite' && pay === 'PAID' && !(before && before.paymentIntentId);
      if (byHand && !method && !(before && before.paymentStatus === 'PAID' && !before.paidMethod)) { alert('Choose how the guest paid (Paid how?).'); return; }
      const started = Date.now();
      const res = origSave.apply(this, arguments);
      if (byHand && method) setTimeout(() => {
        try {
          const a = id ? spbAppt(id) : (SpaAppointments || []).filter(x => x.createdAt && Date.parse(x.createdAt) >= started - 2000).pop();
          if (!a || a.paymentStatus !== 'PAID' || a.paidMethod === method) return;
          const me = (typeof getCurrentSession === 'function' && (getCurrentSession() || {}).name) || 'staff';
          a.paidMethod = method; a.paidMarkedBy = me; a.paidMarkedAt = new Date().toISOString();
          if (typeof spaCalSave === 'function') spaCalSave();
          spbDecorate();
        } catch (e) {}
      }, 600);
      return res;
    };
  }
  setTimeout(spbDecorate, 0);
})();
