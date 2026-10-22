// ===== spa-last-minute.js — show last-minute spa bookings on the Spa Calendar =====
// Loaded as a classic script AFTER spa-calendar.js; shares global scope. Darlene 2026-10-22: "we need a way to show last minute spa bookings."
// Every appointment records when it was booked (createdAt), so a booking is "last minute" when it was made less than LM_HOURS before the service starts (a booking made
// after the start time, e.g. a walk-in typed in late, counts too). For today and future days only (past days are history):
//   - a ⚡ badge on the appointment block on the calendar (hover for how long before it was booked),
//   - a banner at the top of the calendar listing the last-minute bookings of the day being viewed,
//   - a notification card (stays about 15 seconds, can be dismissed) with a "ding ding ding" once per booking when a NEW last-minute booking appears (booked in the last
//     hour) while the calendar is open. Browsers only allow sound after the page has been clicked once, so the first click anywhere on the page switches the sound on.
//     The 🔔 button in the banner turns the sound off/on (remembered on that computer).
// Read-only: nothing is changed or blocked. Change LM_HOURS to change what counts as last minute.
const LM_HOURS = 24;
const LM_SEEN = 'amansala_lm_seen', LM_SOUND = 'amansala_lm_sound';
let lmAudio = null;
function lmSoundOn() { try { return localStorage.getItem(LM_SOUND) !== 'off'; } catch (e) { return true; } }
function lmUnlockAudio() { try { if (!lmAudio) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) lmAudio = new AC(); } if (lmAudio && lmAudio.state === 'suspended') lmAudio.resume(); } catch (e) {} }
try { document.addEventListener('click', lmUnlockAudio, { once: true }); document.addEventListener('keydown', lmUnlockAudio, { once: true }); } catch (e) {}
// "ding ding ding": three bell-like notes
function lmDing(force) {
  try {
    if (!force && !lmSoundOn()) return; lmUnlockAudio();
    if (!lmAudio || lmAudio.state !== 'running') return; // no click on the page yet: stay silent rather than error
    [0, 0.4, 0.8].forEach(off => {
      const t0 = lmAudio.currentTime + off, o = lmAudio.createOscillator(), g = lmAudio.createGain();
      o.type = 'sine'; o.frequency.value = 988; o.connect(g); g.connect(lmAudio.destination);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
      o.start(t0); o.stop(t0 + 0.75);
    });
  } catch (e) {}
}
function lmToggleSound() { try { localStorage.setItem(LM_SOUND, lmSoundOn() ? 'off' : 'on'); } catch (e) {} const b = document.getElementById('lmSoundBtn'); if (b) b.textContent = lmSoundOn() ? '🔔 Sound on' : '🔕 Sound off'; if (lmSoundOn()) lmDing(true); }
function lmNotify(html) {
  try {
    let box = document.getElementById('lmNotify');
    if (!box) { box = document.createElement('div'); box.id = 'lmNotify'; box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:100000;display:flex;flex-direction:column;gap:8px;max-width:360px;font-family:Jost,sans-serif'; document.body.appendChild(box); }
    const card = document.createElement('div');
    card.style.cssText = 'background:#fffbeb;border:2px solid #f59e0b;border-radius:12px;padding:12px 14px;box-shadow:0 6px 20px rgba(0,0,0,.2);font-size:13px;color:#78350f;line-height:1.45';
    card.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px"><b>⚡ Last-minute booking</b><span style="cursor:pointer;font-weight:700" onclick="this.closest('div[style*=border]').remove()">✕</span></div><div style="margin-top:4px">${html}</div>`;
    box.appendChild(card); setTimeout(() => { try { card.remove(); } catch (e) {} }, 15000);
  } catch (e) {}
}

function lmTulumToday() { return new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10); }
// Hours between booking and the start of the service (Tulum is UTC-5 all year). Negative = booked after it started.
function lmLeadHours(a) { try { return (new Date(a.date + 'T' + (a.start || '00:00') + ':00-05:00') - new Date(a.createdAt)) / 3600000; } catch (e) { return null; } }
function lmIsLastMinute(a) { const h = lmLeadHours(a); return h != null && !isNaN(h) && h < LM_HOURS && a.status !== 'CANCELLED' && (a.date || '') >= lmTulumToday(); }
function lmLabel(a) {
  const h = lmLeadHours(a), mins = Math.round(Math.abs(h) * 60), t = mins >= 90 ? Math.round(mins / 60) + ' hours' : mins + ' minutes';
  const when = (() => { try { return new Date(a.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Cancun' }); } catch (e) { return ''; } })();
  return h < 0 ? `booked at ${when}, ${t} after the start time` : `booked at ${when}, ${t} before the service`;
}
const lmEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

(function () {
  if (typeof spaCalPanelHtml === 'function') {
    const origPanel = window.spaCalPanelHtml;
    window.spaCalPanelHtml = function () {
      let html = origPanel.apply(this, arguments);
      try {
        (SpaAppointments || []).filter(lmIsLastMinute).forEach(a => {
          const re = new RegExp(`(<div draggable="true" ondragstart="spaCalDragStart\\(event,'${a.id}'\\)"[^>]*>)`);
          html = html.replace(re, `$1<span title="Last-minute booking — ${lmEsc(lmLabel(a))}" style="position:absolute;left:3px;bottom:2px;font-size:11px;line-height:1">⚡</span>`);
        });
      } catch (e) { console.warn('[last minute] badge', e); }
      return html;
    };
  }
  if (typeof spaCalRender === 'function') {
    const origRender = window.spaCalRender;
    window.spaCalRender = function () {
      const r = origRender.apply(this, arguments);
      try {
        if (typeof IS_SPA_STAFF_MODE !== 'undefined' && IS_SPA_STAFF_MODE) return r;
        const ds = spaCalFmtDateStr(spaCalDate), el = document.getElementById('spaContent');
        const list = (SpaAppointments || []).filter(a => a.date === ds && lmIsLastMinute(a)).sort((x, y) => String(x.start).localeCompare(String(y.start)));
        if (el && list.length) {
          const svcName = a => ((SpaData.services || []).find(s => s.id === a.serviceId) || {}).name || 'service';
          const therName = a => ((SpaData.therapists || []).find(t => t.id === a.therapistId) || {}).firstName || 'no therapist';
          el.insertAdjacentHTML('afterbegin', `<div id="lmBanner" style="margin:0 0 14px;padding:12px 16px;border-radius:12px;background:#fffbeb;border:1.5px solid #fde68a;text-align:left;font-family:'Jost',sans-serif">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:4px"><div style="font-weight:700;font-size:13.5px;color:#92400e">⚡ ${list.length} last-minute booking${list.length !== 1 ? 's' : ''} on this day</div>
              <button id="lmSoundBtn" onclick="lmToggleSound()" style="border:1.5px solid #fcd34d;background:#fff;border-radius:8px;padding:3px 9px;font-size:11.5px;font-weight:700;color:#92400e;cursor:pointer">${lmSoundOn() ? '🔔 Sound on' : '🔕 Sound off'}</button></div>
            ${list.map(a => `<div style="font-size:12.5px;color:#78350f;line-height:1.55">• <b>${lmEsc(a.clientName)}</b> — ${lmEsc(svcName(a))} with ${lmEsc(therName(a))} at ${spaCalFmtT(a.start)} (${lmEsc(lmLabel(a))}${a.source === 'guest_booking' ? ', online' : ''})</div>`).join('')}</div>`);
        }
        // pop-up once per new last-minute booking made in the last hour
        let seen = []; try { seen = JSON.parse(localStorage.getItem(LM_SEEN) || '[]'); } catch (e) {}
        const fresh = (SpaAppointments || []).filter(a => lmIsLastMinute(a) && Date.now() - new Date(a.createdAt) < 3600000 && !seen.includes(a.id));
        if (fresh.length) {
          try { localStorage.setItem(LM_SEEN, JSON.stringify([...new Set([...seen, ...fresh.map(a => a.id)])].slice(-300))); } catch (e) {}
          lmNotify(fresh.slice(0, 3).map(a => `<b>${lmEsc(a.clientName)}</b> — ${lmEsc(((SpaData.services || []).find(s => s.id === a.serviceId) || {}).name || 'service')} ${a.date === lmTulumToday() ? 'today' : a.date} at ${spaCalFmtT(a.start)}<br><span style="font-size:11.5px">${lmEsc(lmLabel(a))}</span>`).join('<hr style="border:none;border-top:1px solid #fde68a;margin:6px 0">') + (fresh.length > 3 ? `<br>+${fresh.length - 3} more` : ''));
          lmDing();
        }
      } catch (e) { console.warn('[last minute] banner', e); }
      return r;
    };
  }
})();
