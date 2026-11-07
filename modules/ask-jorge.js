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
    try { reqMount(); } catch (e) {}
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
    if (!msgs.length) addBubble('assistant', 'Hola 👋 Pregúntame cómo hacer algo en el portal o algo de un huésped. Prueba también: “¿qué pasa hoy?”, “¿quién se va hoy debiendo?” (y les mando el link de pago a todos) o “el aire del 21 no sirve, asígnalo a Hilario”, “anula el cargo duplicado de…”, “pasa el folio de X a su noche extra” o “crea el transporte de llegada de…”, “¿quién llega sin datos de vuelo?” (y les mando el recordatorio), “reenvía la confirmación de…” o “se encontró una cartera en el 21”. También lo hago por ti: cargos (agregar, quitar, corregir), pagos y reembolsos, check-in / check-out, mover de cuarto, reservas nuevas, spa (reservar, cancelar, mover, confirmar a la terapeuta), transporte, links de pago, notas internas, A/C 24h, estado de cuartos y Cloudbeds — tú confirmas antes de guardar. También reviso cuentas antes del check-out, noches extra, llegadas y salidas, y reservas repetidas. Si no lo sé, le mando tu pregunta a Jorge.');
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
      if (d.notified && d.notified.sent) addBubble('assistant', '📨 Le envié tu solicitud a Jorge. Cuando la resuelva te llega un aviso aquí en el portal y por WhatsApp.');
      (d.proposals || []).forEach(addCard);
    } catch (e) { if (thinking) thinking.remove(); addBubble('assistant', 'Problema de conexión, intenta otra vez.'); }
    busy = false; if (btn) btn.textContent = 'Send';
  };

  // ---- requests it could not do: Jorge's to-do list + the person's notice when he marks it done (Jorge 2026-11-07) ----
  // netlify/functions/ask-jorge-requests.js. Jorge sees "📋 Requests" next to the Ask Jorge button; whoever asked gets a notice
  // in their portal session (and a WhatsApp) when he marks it Fixed / Won't do.
  const tok = () => { try { return sessionStorage.getItem('amansala_staff_token') || ''; } catch (e) { return ''; } };
  const me = () => { try { return JSON.parse(sessionStorage.getItem('amansala_staff_session') || '{}'); } catch (e) { return {}; } };
  const reqCall = async (action, extra) => {
    const r = await fetch('/.netlify/functions/ask-jorge-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok(), action, ...(extra || {}) }) });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Error'); return d;
  };
  const when = t => { try { return new Date(t).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  let reqs = [], reqView = 'open', reqJorge = false, reqStarted = false;
  const isJorgeMe = () => /jorge/i.test(me().name || '');
  // Jorge: "📋 Requests" (everyone's, to do). Anyone else: "📋 My requests" once they have one (what is pending with Jorge / answered)
  function reqMount() {
    if (!staffOn() || reqStarted) return;
    reqStarted = true; reqLoad(); setInterval(reqLoad, 120000);
  }
  function reqButton() {
    let b = document.getElementById('ajReqBtn');
    if (!reqJorge && !reqs.length) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement('button'); b.id = 'ajReqBtn'; b.type = 'button';
    b.style.cssText = 'position:fixed;right:150px;bottom:74px;z-index:8500;background:#fff;color:#0e7490;border:1.5px solid #0e7490;border-radius:22px;padding:9px 14px;font:700 13px Jost,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.15);cursor:pointer';
    b.innerHTML = `📋 ${reqJorge ? 'Requests' : 'My requests'} <span id="ajReqN" style="display:none;background:#dc2626;color:#fff;border-radius:10px;padding:0 6px;font-size:11px;margin-left:2px"></span>`;
    b.onclick = reqOpen; document.body.appendChild(b);
  }
  async function reqLoad() {
    try { const d = await reqCall('list'); reqs = (d.requests || []).filter(x => x.status !== 'old'); reqJorge = !!d.jorge; } catch (e) { return; }
    reqButton();
    const n = reqs.filter(x => x.status === 'open').length, el = document.getElementById('ajReqN');
    if (el) { el.textContent = n; el.style.display = n ? 'inline-block' : 'none'; }
    if (document.getElementById('ajReqPanel')) reqRender();
  }
  function reqOpen() {
    let p = document.getElementById('ajReqPanel'); if (p) { p.remove(); return; }
    p = document.createElement('div'); p.id = 'ajReqPanel';
    p.style.cssText = 'position:fixed;right:18px;bottom:122px;z-index:8600;width:min(460px,calc(100vw - 36px));max-height:min(600px,calc(100vh - 160px));background:#fff;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden;font-family:Jost,sans-serif';
    document.body.appendChild(p); reqRender(); reqLoad();
  }
  function reqRender() {
    const p = document.getElementById('ajReqPanel'); if (!p) return;
    const open = reqs.filter(x => x.status === 'open'), done = reqs.filter(x => x.status === 'fixed' || x.status === 'declined');
    const list = reqView === 'open' ? open : done;
    const tab = (k, l, n) => `<button onclick="ajReqView('${k}')" style="flex:1;padding:7px;border:none;border-radius:8px;font:700 12.5px Jost,sans-serif;cursor:pointer;${reqView === k ? 'background:#0e7490;color:#fff' : 'background:#f1f5f9;color:#334155'}">${l} (${n})</button>`;
    p.innerHTML = `<div style="background:#0e7490;color:#fff;padding:12px 14px;display:flex;align-items:center;justify-content:space-between"><div><div style="font-weight:700;font-size:14.5px">${reqJorge ? 'Requests for Jorge' : 'My requests to Jorge'}</div><div style="font-size:11px;opacity:.85">${reqJorge ? 'What staff asked Ask Jorge that it could not do' : 'What Ask Jorge sent to Jorge for you, and his answer'}</div></div><button onclick="document.getElementById('ajReqPanel').remove()" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer">✕</button></div>
      <div style="display:flex;gap:6px;padding:10px 12px 0">${tab('open', 'Pending', open.length)}${tab('done', 'Done', done.length)}</div>
      <div style="flex:1;overflow:auto;padding:10px 12px 14px">${list.length ? list.map(x => `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:12.5px">
        <div style="display:flex;justify-content:space-between;gap:8px;color:#6b7280;font-size:11.5px"><span><b style="color:#1f2937">${esc(x.by || 'Staff')}</b> · ${esc(x.page || '')}</span><span>${esc(x.id)} · ${esc(when(x.at))}</span></div>
        <div style="margin-top:4px;color:#1f2937">${esc(x.request || String(x.summary || '').split('\n')[0].replace(/^Pidió:\s*/, ''))}</div>
        ${x.reason || /No se pudo porque/.test(x.summary || '') ? `<div style="margin-top:3px;color:#92400e;font-size:11.5px">Why it could not: ${esc(x.reason || String(x.summary).split('No se pudo porque:')[1] || '')}</div>` : ''}
        ${x.status === 'open' ? (reqJorge ? `<div style="display:flex;gap:6px;margin-top:8px"><button onclick="ajReqResolve('${x.id}','fixed')" style="background:#16a34a;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer">✓ Fixed</button><button onclick="ajReqResolve('${x.id}','declined')" style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 12px;cursor:pointer">✕ Won't do</button><button onclick="ajReqDelete('${x.id}')" title="Delete" style="margin-left:auto;background:#fff;border:1px solid #fecaca;color:#b91c1c;border-radius:8px;padding:6px 10px;cursor:pointer">🗑</button></div>` : `<div style="margin-top:6px;font-size:11.5px;color:#92400e;font-weight:600">⏳ Pending with Jorge</div>`)
          : `<div style="margin-top:6px;font-size:11.5px;color:${x.status === 'fixed' ? '#047857' : '#6b7280'}">${x.status === 'fixed' ? '✓ Fixed' : '✕ Won\'t do'} · ${esc(when(x.resolvedAt))}${x.reply ? ' — ' + esc(x.reply) : ''}${x.notified ? ` · WhatsApp ${esc(x.notified.whatsapp)}` : ''}${x.seenAt ? ' · seen ✓' : ''}</div>`}
      </div>`).join('') : `<div style="padding:30px;text-align:center;color:#9ca3af">${reqView === 'open' ? 'Nothing pending 🎉' : 'Nothing marked yet.'}</div>`}</div>`;
  }
  window.ajReqView = k => { reqView = k; reqRender(); };
  window.ajReqDelete = async id => {
    if (!confirm(`Delete ${id}? It is removed for good and nobody is told.`)) return;
    try { await reqCall('delete', { ids: [id] }); showToast(`${id} deleted`); await reqLoad(); } catch (e) { showToast('Not deleted: ' + e.message); }
  };
  window.ajReqResolve = async (id, status) => {
    const note = prompt(status === 'fixed' ? 'Reply to the person (optional) — e.g. "Done, moved to room 14":' : "Why it won't be done (optional):", '');
    if (note === null) return;
    try { const d = await reqCall('resolve', { id, status, reply: note }); showToast(`${id} ${status === 'fixed' ? 'fixed' : "won't do"} ✓ — notice sent${d.item && d.item.notified ? ', WhatsApp ' + d.item.notified.whatsapp : ''}`); await reqLoad(); }
    catch (e) { showToast('Not saved: ' + e.message); }
  };
  // the person who asked: a notice in their session once Jorge marks it
  async function reqNotice() {
    if (!staffOn() || document.getElementById('ajNotice')) return;
    let d; try { d = await reqCall('mine'); } catch (e) { return; }
    const a = d.answered || []; if (!a.length) return;
    // a pop-up in the middle of the screen with a chime (Jorge 2026-11-07) -- the sound plays once the person has clicked
    // anywhere on the page since it opened (browser rule); the pop-up shows either way
    const veil = document.createElement('div'); veil.id = 'ajNoticeVeil';
    veil.style.cssText = 'position:fixed;inset:0;z-index:8690;background:rgba(15,23,42,.35)';
    document.body.appendChild(veil);
    const box = document.createElement('div'); box.id = 'ajNotice';
    box.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:8700;width:min(420px,calc(100vw - 36px));background:#ecfdf5;border:2px solid #10b981;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.3);padding:16px 18px;font-family:Jost,sans-serif;font-size:14px;color:#064e3b';
    try { const C = new (window.AudioContext || window.webkitAudioContext)(); [[880, 0], [1175, .18], [1568, .36]].forEach(([f, t]) => { const o = C.createOscillator(), g = C.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(.0001, C.currentTime + t); g.gain.exponentialRampToValueAtTime(.25, C.currentTime + t + .03); g.gain.exponentialRampToValueAtTime(.0001, C.currentTime + t + .5); o.connect(g).connect(C.destination); o.start(C.currentTime + t); o.stop(C.currentTime + t + .55); }); } catch (e) {}
    box.innerHTML = `<div style="font-weight:800;font-size:16px;margin-bottom:6px">🔔 ${a.length === 1 ? 'Jorge answered your request' : `Jorge answered ${a.length} of your requests`}</div>${a.map(x => `<div style="margin:6px 0;padding-top:6px;border-top:1px solid #a7f3d0"><b>${x.status === 'fixed' ? '✅ Fixed' : "✕ Won't do"}</b> · ${esc(x.request || String(x.summary || '').split('\n')[0].replace(/^Pidió:\s*/, ''))}${x.reply ? `<div style="margin-top:2px;color:#065f46">“${esc(x.reply)}”</div>` : ''}</div>`).join('')}
      <div style="text-align:right;margin-top:6px"><button id="ajNoticeOk" style="background:#059669;color:#fff;border:none;border-radius:8px;padding:6px 14px;font-weight:700;cursor:pointer">OK</button></div>`;
    document.body.appendChild(box);
    document.getElementById('ajNoticeOk').onclick = async () => { box.remove(); veil.remove(); try { await reqCall('seen', { ids: a.map(x => x.id) }); } catch (e) {} reqLoad(); };
  }
  setInterval(() => { reqMount(); reqNotice(); }, 60000); setTimeout(() => { reqMount(); reqNotice(); }, 4000);

  // the staff login happens after this script loads: check again a few times, and on every sign-in
  mount(); let tries = 0; const t = setInterval(() => { mount(); if (document.getElementById('ajBtn') || ++tries > 120) clearInterval(t); }, 1500);
})();
