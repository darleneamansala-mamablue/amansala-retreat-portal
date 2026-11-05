// ===== ask-jorge.js — "Ask Jorge" help chat in the corner of every portal screen (Jorge 2026-11-05) =====
// Staff ask how to do something or a quick fact about a guest; netlify/functions/ask-jorge.js answers (Claude + the staff
// guide, read-only guest look-ups). When it cannot solve it, the question goes to Jorge by WhatsApp + email. It never
// changes anything in the portal. Standalone; classic script, shares global scope. Staff logins only (not teachers).
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // light formatting: **bold**, line breaks, numbered/bulleted lines
  const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  let msgs = [], busy = false;
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
    if (!msgs.length) addBubble('assistant', 'Hola 👋 Pregúntame cómo hacer algo en el portal (mover un cuarto, agregar un cargo, registrar un pago, check-in…) o algo de un huésped (¿en qué cuarto está?, ¿cuánto debe?). Si no lo sé, le mando tu pregunta a Jorge.');
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
  function render() { const log = document.getElementById('ajLog'); if (!log) return; log.innerHTML = ''; msgs.forEach(m => addBubble(m.role, m.content)); }

  window.ajSend = async function () {
    const inp = document.getElementById('ajIn'); if (!inp || busy) return;
    const q = inp.value.trim(); if (!q) return;
    inp.value = ''; msgs.push({ role: 'user', content: q }); addBubble('user', q);
    busy = true; const btn = document.getElementById('ajSend'); if (btn) btn.textContent = '…';
    addBubble('assistant', 'Pensando…'); const log = document.getElementById('ajLog'); const thinking = log && log.lastChild;
    let token = ''; try { token = sessionStorage.getItem('amansala_staff_token') || ''; } catch (e) {}
    try {
      const r = await fetch('/.netlify/functions/ask-jorge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, messages: msgs.slice(-16), page: page() }) });
      const d = await r.json().catch(() => ({}));
      if (thinking) thinking.remove();
      const ans = d.answer || d.error || 'No pude responder ahora, intenta otra vez.';
      msgs.push({ role: 'assistant', content: ans }); addBubble('assistant', ans);
      if (d.notified && d.notified.sent) addBubble('assistant', '📨 Le envié tu pregunta a Jorge. Te va a responder directamente.');
    } catch (e) { if (thinking) thinking.remove(); addBubble('assistant', 'Problema de conexión, intenta otra vez.'); }
    busy = false; if (btn) btn.textContent = 'Send';
  };

  // the staff login happens after this script loads: check again a few times, and on every sign-in
  mount(); let tries = 0; const t = setInterval(() => { mount(); if (document.getElementById('ajBtn') || ++tries > 120) clearInterval(t); }, 1500);
})();
