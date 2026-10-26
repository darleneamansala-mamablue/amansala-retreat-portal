// ===== spa-gcal.js — phone calls from Darlene's Google Calendar show on the Spa calendar (Darlene 2026-10-26) =====
// Loaded as a classic script AFTER spa-calendar.js and spa-time-blocks.js; shares global scope. Standalone: wraps spaCalPanelHtml and spaCalRenderToolbar (adds a "Google Calendar" button).
// The Google Calendar link is entered in the portal (Spa > Calendar > "📅 Google Calendar") and kept encrypted on the server by netlify/functions/gcal-feed.js, which also reads the calendar:
// the browser only ever receives the events' titles and times (never the link). The events appear read-only in the chosen therapist's column (Darlene by default) as blue 📞 boxes, refreshed every 3 minutes.
const SGC_FN = '/.netlify/functions/gcal-feed';
let sgcEvents = [], sgcStatus = { connected: false, filter: '', therapist: 'Darlene' }, sgcLoadedAt = 0, sgcLoading = false;
const sgcEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const sgcMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };

async function sgcLoad(force) {
  if (sgcLoading || (!force && Date.now() - sgcLoadedAt < 170000)) return; sgcLoading = true;
  try {
    const r = await fetch(SGC_FN, { cache: 'no-store' }), d = await r.json();
    sgcStatus = { connected: !!d.connected, filter: d.filter || '', therapist: d.therapist || 'Darlene' }; sgcEvents = d.events || []; sgcLoadedAt = Date.now();
    if (typeof spaCurView !== 'undefined' && spaCurView === 'calendar' && typeof spaCalRender === 'function') spaCalRender();
  } catch (e) { console.warn('[spa-gcal]', e); }
  sgcLoading = false;
}
(function () {
  if (typeof spaCalPanelHtml !== 'function' || typeof spaCalRenderToolbar !== 'function') return;
  const origPanel = window.spaCalPanelHtml, origToolbar = window.spaCalRenderToolbar;
  window.spaCalPanelHtml = function (cols, isTher, dateStr) {
    let html = origPanel.apply(this, arguments);
    if (!isTher) return html;
    try {
      sgcLoad(false);
      const want = String(sgcStatus.therapist || 'Darlene').trim().toLowerCase(), col = cols.find(c => { const t = (SpaData.therapists || []).find(x => x.id === c.id); return t && String(t.firstName || '').trim().toLowerCase() === want; });
      const evs = col ? sgcEvents.filter(e => e.date === dateStr && !e.allDay) : []; if (!evs.length) return html;
      const marker = `spaCalCellClick(event,'${col.id}')`, at = html.indexOf(marker); if (at < 0) return html;
      const open = html.indexOf('>', at) + 1;
      const boxes = evs.map(e => {
        const s0 = Math.max(sgcMin(e.start), spaCalViewStartH * 60), e0 = Math.min(Math.max(sgcMin(e.end), sgcMin(e.start) + 15), spaCalViewEndH * 60); if (e0 <= s0) return '';
        const top = (s0 - spaCalViewStartH * 60) * (SPA_CAL_PX_HR / 60), h = Math.max(24, (e0 - s0) * (SPA_CAL_PX_HR / 60));
        return `<div onclick="event.stopPropagation()" title="${sgcEsc(e.title)} (from Google Calendar)" style="position:absolute;top:${top}px;left:2px;right:2px;height:${h}px;z-index:2;overflow:hidden;border:1.5px solid #38bdf8;border-left:5px solid #0284c7;border-radius:8px;background:#e0f2fe;padding:2px 6px">
          <div style="font-size:11px;font-weight:700;color:#075985;line-height:1.2">📞 ${sgcEsc(e.title)}</div><div style="font-size:10px;color:#0369a1">${spaCalFmtT(e.start)} – ${spaCalFmtT(e.end)}</div></div>`;
      }).join('');
      html = html.slice(0, open) + boxes + html.slice(open);
    } catch (e) { console.warn('[spa-gcal] panel', e); }
    return html;
  };
  window.spaCalRenderToolbar = function () {
    const out = origToolbar.apply(this, arguments);
    try {
      sgcLoad(false);
      const wrap = document.getElementById('spaAddBtnWrap'), row = wrap && wrap.firstElementChild;
      if (row && !row.querySelector('#spaGcalBtn')) row.insertAdjacentHTML('beforeend', `<button id="spaGcalBtn" onclick="sgcOpen()" style="padding:6px 12px;font-size:12px;font-weight:600;border:1.5px solid #38bdf8;border-radius:8px;background:#e0f2fe;color:#075985;cursor:pointer;font-family:'Jost',sans-serif">📅 Google Calendar${sgcStatus.connected ? ' ✓' : ''}</button>`);
    } catch (e) {}
    return out;
  };
})();

function sgcOpen() {
  const act = (SpaData.therapists || []).filter(t => t.active).sort((a, b) => a.firstName.localeCompare(b.firstName));
  const inp = 'width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:inherit;font-size:13px';
  let m = document.getElementById('sgcModal'); if (m) m.remove();
  m = document.createElement('div'); m.id = 'sgcModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Jost,sans-serif';
  m.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:92vh;overflow:auto;padding:22px 24px;box-shadow:0 12px 40px rgba(0,0,0,.25)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700">📅 Google Calendar</div><button onclick="document.getElementById('sgcModal').remove()" style="border:none;background:none;font-size:22px;cursor:pointer;color:#6b7280">✕</button></div>
    <div style="font-size:12.5px;color:#6b7280;margin-bottom:12px">${sgcStatus.connected ? '<b style="color:#059669">Connected ✓</b> — your booked calls show in the calendar below as blue 📞 boxes.' : 'Show the phone calls people book through your Google Calendar on this calendar.'}</div>
    <div style="font-size:12px;background:#f0f9ff;border-radius:10px;padding:10px 12px;margin-bottom:12px;line-height:1.5"><b>Get the link (on a computer):</b> Google Calendar → gear → <b>Settings</b> → click your calendar on the left → <b>Integrate calendar</b> → copy <b>Secret address in iCal format</b>. It is read-only and kept hidden on the server, but treat it like a password.</div>
    <label style="font-size:12px;font-weight:700">Secret address in iCal format<br><input id="sgcUrl" type="password" autocomplete="off" placeholder="${sgcStatus.connected ? '•••••• (saved — paste a new one to replace it)' : 'https://calendar.google.com/calendar/ical/…/basic.ics'}" style="${inp}"></label>
    <label style="font-size:12px;font-weight:700;display:block;margin-top:10px">Only show events whose title contains (optional)<br><input id="sgcFilter" value="${sgcEsc(sgcStatus.filter)}" placeholder="e.g. phone" style="${inp}"></label>
    <label style="font-size:12px;font-weight:700;display:block;margin-top:10px">Show them in the column of<br><select id="sgcTher" style="${inp}">${act.map(t => `<option value="${sgcEsc(t.firstName)}"${String(t.firstName).toLowerCase() === String(sgcStatus.therapist).toLowerCase() ? ' selected' : ''}>${sgcEsc(t.firstName)}</option>`).join('')}</select></label>
    <div id="sgcMsg" style="font-size:12.5px;margin-top:10px;min-height:18px"></div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button id="sgcSave" onclick="sgcSave()" style="padding:9px 16px;border:none;border-radius:8px;background:#0284c7;color:#fff;font-weight:700;font-family:inherit;cursor:pointer">Save and check</button>
      ${sgcStatus.connected ? '<button onclick="sgcDisconnect()" style="padding:9px 16px;border:1.5px solid #fca5a5;border-radius:8px;background:#fff;color:#dc2626;font-weight:700;font-family:inherit;cursor:pointer">Disconnect</button>' : ''}</div></div>`;
  document.body.appendChild(m);
}
async function sgcSave() {
  const url = document.getElementById('sgcUrl').value.trim(), msg = document.getElementById('sgcMsg'), btn = document.getElementById('sgcSave');
  const filter = document.getElementById('sgcFilter').value.trim(), therapist = document.getElementById('sgcTher').value;
  if (!url && !sgcStatus.connected) { msg.style.color = '#b91c1c'; msg.textContent = 'Paste the link first.'; return; }
  if (!url) {                                                   // only the filter / column changed: the saved link is kept on the server, so ask for it again to resave
    msg.style.color = '#b91c1c'; msg.textContent = 'To change the filter or column, paste the link again (it is not stored where this page can read it).'; return;
  }
  btn.disabled = true; msg.style.color = '#6b7280'; msg.textContent = 'Checking the calendar…';
  try {
    const r = await fetch(SGC_FN, { method: 'POST', body: JSON.stringify({ action: 'save', url, filter, therapist }) }), d = await r.json();
    if (!d.ok) { msg.style.color = '#b91c1c'; msg.textContent = d.error || 'That did not work.'; btn.disabled = false; return; }
    msg.style.color = '#059669'; msg.textContent = `Connected ✓ — found ${d.count} events in the next 60 days${filter ? `, ${d.matching} match “${filter}”` : ''}.`;
    document.getElementById('sgcUrl').value = ''; await sgcLoad(true); if (typeof spaCalRenderToolbar === 'function') { const b = document.getElementById('spaGcalBtn'); if (b) b.remove(); spaCalRenderToolbar(); }
  } catch (e) { msg.style.color = '#b91c1c'; msg.textContent = 'Network error — try again.'; }
  btn.disabled = false;
}
async function sgcDisconnect() {
  if (!confirm('Disconnect your Google Calendar? The blue call boxes will disappear.')) return;
  try { await fetch(SGC_FN, { method: 'POST', body: JSON.stringify({ action: 'disconnect' }) }); } catch (e) {}
  sgcStatus.connected = false; sgcEvents = []; document.getElementById('sgcModal').remove(); const b = document.getElementById('spaGcalBtn'); if (b) b.remove();
  if (typeof spaCalRender === 'function') spaCalRender(); if (typeof spaCalRenderToolbar === 'function') spaCalRenderToolbar(); showToast('Google Calendar disconnected.');
}
