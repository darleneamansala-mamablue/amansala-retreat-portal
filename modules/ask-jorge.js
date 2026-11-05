// ===== ask-jorge.js — "Ask Jorge" help chat in the corner of every portal screen (Jorge 2026-11-05) =====
// Staff ask how to do something or a quick fact about a guest; netlify/functions/ask-jorge.js answers (Claude + the staff
// guide, guest look-ups). When it cannot solve it, the question goes to Jorge by WhatsApp + email. It can also do things
// (add a charge, record a payment, check in/out, internal note, A/C 24h) but only after the person presses Confirm on its card. Standalone; classic script, shares global scope. Staff logins only (not teachers).
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // light formatting: **bold**, line breaks, numbered/bulleted lines
  const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  let msgs = [], busy = false, memo = [];   // memo: guests looked up in this chat, sent back so it remembers who "she" is
  const staffOn = () => { try { return !!sessionStorage.getItem('amansala_staff_token') && !(typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE); } catch (e) { return false; } };
  const page = () => { try { const p = location.pathname.replace(/^\//, '') || 'dashboard'; return p.charAt(0).toUpperCase() + p.slice(1); } catch (e) { return ''; } };

  function mount() {
    if (document.getElementById('ajBtn') || !staffOn()) return;
    const btn = document.createElement('button');
    btn.id = 'ajBtn'; btn.type = 'button'; btn.textContent = '💬 Ask Jorge';
    btn.style.cssText = 'position:fixed;right:18px;bottom:74px;z-index:8500;background:#0e7490;color:#fff;border:none;border-radius:22px;padding:10px 16px;font:700 13px Jost,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.2);cursor:pointer';
    btn.onclick = toggle;
    document.body.appendChild(btn);
  }
  function toggle() {
    let p = document.getElementById('ajPanel');
    if (p) { p.remove(); return; }
    p = document.createElement('div'); p.id = 'ajPanel';
    p.style.cssText = 'position:fixed;right:18px;bottom:122px;z-index:8600;width:min(380px,calc(100vw - 36px));height:min(520px,calc(100vh - 160px));background:#fff;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.25);display:flex;flex-direction:column;font-family:Jost,sans-serif;overflow:hidden';
    p.innerHTML = `<div style="background:#0e7490;color:#fff;padding:12px 14px;display:flex;align-items:center;justify-content:space-between">
        <div><div style="font-weight:700;font-size:14.5px">Ask Jorge</div><div style="font-size:11px;opacity:.85">How do I…? · Where is…? · ¿Cómo hago…?</div></div>
        <button onclick="document.getElementById('ajPanel').remove()" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer">✕</button></div>
      <div id="ajLog" style="flex:1;overflow:auto;padding:12px;background:#f8fafc;font-size:13px;line-height:1.5"></div>
      <div style="display:flex;gap:6px;padding:10px;border-top:1px solid #e5e7eb">
        <textarea id="ajIn" rows="2" placeholder="Ej: ¿Cómo muevo a un huésped de cuarto?" style="flex:1;resize:none;padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:10px;font:13px Jost,sans-serif"></textarea>
        <button id="ajSend" onclick="ajSend()" style="background:#0e7490;color:#fff;border:none;border-radius:10px;padding:0 14px;font-weight:700;cursor:pointer">Send</button></div>`;
    document.body.appendChild(p);
    const inp = document.getElementById('ajIn');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.ajSend(); } });
    render();
    if (!msgs.length) addBubble('assistant', 'Hola 👋 Pregúntame cómo hacer algo en el portal o algo de un huésped. También lo hago por ti: cargos (agregar, quitar, corregir), pagos y reembolsos, check-in / check-out, mover de cuarto, reservas nuevas, spa (reservar, cancelar, mover, confirmar a la terapeuta), transporte, links de pago, notas internas, A/C 24h, estado de cuartos y Cloudbeds — tú confirmas antes de guardar. También reviso cuentas antes del check-out, noches extra, llegadas y salidas, y reservas repetidas. Si no lo sé, le mando tu pregunta a Jorge.');
    inp.focus();
  }
  function addBubble(role, text) {
    const log = document.getElementById('ajLog'); if (!log) return;
    const mine = role === 'user';
    const d = document.createElement('div');
    d.style.cssText = `margin:6px 0;display:flex;${mine ? 'justify-content:flex-end' : ''}`;
    d.innerHTML = `<div style="max-width:85%;padding:8px 11px;border-radius:12px;${mine ? 'background:#0e7490;color:#fff' : 'background:#fff;border:1px solid #e5e7eb;color:#1f2937'}">${fmt(text)}</div>`;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  }
  // Moves and new reservations run here, in the person's own tab, through the same functions as the Rooms screen
  // (rcMoveRoom: room list, rate freeze, Cloudbeds move; New booking: Cloudbeds + pay-first link)
  async function runClient(x) {
    if (x.type === 'move_room') {
      const reg = AppData.regs.find(r => r.id === x.regId); if (!reg) return { ok: false, message: 'Guest not found in this screen — reload and try again.' };
      const bk = AppData.bookings.find(b => b.id === reg.bookingId); if (!bk) return { ok: false, message: 'Reservation not found.' };
      try { rcMoveRoom(bk.id, reg.room, x.toRoom); } catch (e) { console.warn('[ask-jorge] move', e); }
      const moved = AppData.regs.find(r => r.id === x.regId);
      return moved && String(moved.room) === String(x.toRoom) ? { ok: true, bookingId: bk.id } : { ok: false, message: 'The move could not be done (the room may be taken).' };
    }
    if (x.type === 'new_booking') {
      const conflict = AppData.bookings.some(b => b.status !== 'cancelled' && roomListBlocks(b.blockedRooms, x.room) && datesOverlap(x.checkIn, x.checkOut, b.startDate, b.endDate));
      if (conflict) return { ok: false, message: `Room ${x.room} is already booked for part of these dates.` };
      const rt = AppData.roomTypes.find(t => (t.rooms || []).includes(x.room));
      const nights = Math.round((pd(x.checkOut) - pd(x.checkIn)) / DAY_MS), newId = uid(), ts = new Date().toISOString();
      AppData.bookings.push({ id: newId, bookingType: 'room_only', leaderName: x.guestName, leaderEmail: x.email || '', leaderPhone: x.phone || '', notes: x.notes || '', mealPlan: 'none', retreatName: x.bookingType,
        startDate: x.checkIn, endDate: x.checkOut, row: findAvailableRow(x.checkIn, x.checkOut, null), pax: x.adults || 1, status: 'confirmed', docLink: '', roomAssignments: [], roomTypeId: rt ? rt.id : '',
        blockedRooms: [x.room], roomRateTotal: (x.rate || 0) * nights, roomRateNights: nights, charges: [], payments: [], cbReservationIds: {}, createdAt: ts, updatedAt: ts });
      AppData.regs.push({ id: uid(), bookingId: newId, room: x.room, roomTypeId: rt ? rt.id : '', guests: [{ name: x.guestName, email: x.email || '', phone: x.phone || '', notes: '' }], charges: [], notes: '', createdAt: ts, updatedAt: ts });
      await saveAll();
      try { if (typeof rmPushNewToCloudbeds === 'function') rmPushNewToCloudbeds(newId, x.room, x.checkIn, x.checkOut, { type: x.bookingType, leader: x.guestName, leaderEmail: x.email, leaderPhone: x.phone, adults: x.adults, rate: x.rate }); } catch (e) {}
      if (x.email || x.phone) {
        let token = ''; try { token = sessionStorage.getItem('amansala_staff_token') || ''; } catch (e) {}
        fetch('/.netlify/functions/send-booking-payment-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, bookingId: newId }) }).catch(() => {});
      }
      try { if (typeof venBuild === 'function') venBuild(); if (typeof rcBuild === 'function') rcBuild(); } catch (e) {}
      return { ok: true, bookingId: newId };
    }
    return { ok: false, message: 'Unknown action.' };
  }
  // a proposed change: nothing is saved until Confirm
  function addCard(p) {
    const log = document.getElementById('ajLog'); if (!log || !p || !p.action) return;
    const d = document.createElement('div');
    d.style.cssText = 'margin:8px 0;padding:10px 12px;border:1.5px solid #f59e0b;background:#fffbeb;border-radius:12px';
    d.innerHTML = `<div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:4px">CONFIRM THIS CHANGE</div><div style="font-size:13px;color:#1f2937">${esc(p.summary)}</div>
      <div style="display:flex;gap:6px;margin-top:8px"><button class="ajOk" style="background:#0e7490;color:#fff;border:none;border-radius:8px;padding:6px 14px;font-weight:700;cursor:pointer">Confirm</button>
      <button class="ajNo" style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 12px;cursor:pointer">Cancel</button></div>`;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
    const done = (txt, color) => { d.querySelectorAll('button').forEach(b => b.remove()); const s = document.createElement('div'); s.style.cssText = `margin-top:6px;font-size:12.5px;font-weight:600;color:${color}`; s.textContent = txt; d.appendChild(s); };
    d.querySelector('.ajNo').onclick = () => { done('Cancelled — nothing was changed.', '#6b7280'); msgs.push({ role: 'user', content: '(I cancelled: ' + p.summary + ')' }); };
    d.querySelector('.ajOk').onclick = async () => {
      d.querySelectorAll('button').forEach(b => b.disabled = true);
      let token = ''; try { token = sessionStorage.getItem('amansala_staff_token') || ''; } catch (e) {}
      try {
        let x;
        if (p.action.client) {
          x = await runClient(p.action);
          if (!x.ok) fetch('/.netlify/functions/ask-jorge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, clientFailed: { summary: p.summary, message: x.message }, page: page() }) }).catch(() => {});
          if (x.ok) { x.message = '✓ ' + p.summary; fetch('/.netlify/functions/ask-jorge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, logClient: { type: p.action.type, summary: p.summary, bookingId: x.bookingId } }) }).catch(() => {}); }
        } else {
          const r = await fetch('/.netlify/functions/ask-jorge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, execute: p.action, summary: p.summary, page: page() }) });
          x = await r.json().catch(() => ({}));
        }
        if (x.ok) { done(x.message + ' — refresh the screen to see it.', '#047857'); msgs.push({ role: 'assistant', content: 'Done: ' + p.summary }); }
        else { done('Not saved: ' + (x.message || x.error || 'error') + ' — Jorge was told.', '#b91c1c'); msgs.push({ role: 'assistant', content: 'Could not do it: ' + (x.message || '') }); }
      } catch (e) { done('Connection problem — nothing was saved.', '#b91c1c'); }
    };
  }
  function render() { const log = document.getElementById('ajLog'); if (!log) return; log.innerHTML = ''; msgs.forEach(m => addBubble(m.role, m.content)); }

  window.ajSend = async function () {
    const inp = document.getElementById('ajIn'); if (!inp || busy) return;
    const q = inp.value.trim(); if (!q) return;
    inp.value = ''; msgs.push({ role: 'user', content: q }); addBubble('user', q);
    busy = true; const btn = document.getElementById('ajSend'); if (btn) btn.textContent = '…';
    addBubble('assistant', 'Pensando…'); const log = document.getElementById('ajLog'); const thinking = log && log.lastChild;
    let token = ''; try { token = sessionStorage.getItem('amansala_staff_token') || ''; } catch (e) {}
    try {
      const r = await fetch('/.netlify/functions/ask-jorge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, messages: msgs.slice(-16), page: page(), memo }) });
      const d = await r.json().catch(() => ({}));
      if (thinking) thinking.remove();
      (d.memo || []).forEach(m => { memo = memo.filter(x => x !== m); memo.push(m); }); memo = memo.slice(-8);
      const ans = d.answer || d.error || 'No pude responder ahora, intenta otra vez.';
      msgs.push({ role: 'assistant', content: ans }); addBubble('assistant', ans);
      if (d.notified && d.notified.sent) addBubble('assistant', '📨 Le envié tu pregunta a Jorge. Te va a responder directamente.');
      (d.proposals || []).forEach(addCard);
    } catch (e) { if (thinking) thinking.remove(); addBubble('assistant', 'Problema de conexión, intenta otra vez.'); }
    busy = false; if (btn) btn.textContent = 'Send';
  };

  // the staff login happens after this script loads: check again a few times, and on every sign-in
  mount(); let tries = 0; const t = setInterval(() => { mount(); if (document.getElementById('ajBtn') || ++tries > 120) clearInterval(t); }, 1500);
})();
