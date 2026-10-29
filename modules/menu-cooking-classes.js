// ===== menu-cooking-classes.js — "Cooking classes this week" strip above the weekly Menu (Darlene 2026-10-29) =====
// Loaded as a classic script AFTER menu.js and teacher-portal.js; shares global scope. Standalone and read-only: it wraps menuRenderWeek and puts a strip above the grid.
// It lists every Cooking Class on the week being shown (day, time, retreat), taken from the same schedule data the Schedule and the daily briefing use
// (skedGetRetreatEvents), and below it the retreats that are in the house that week but have NO cooking class scheduled yet, so the kitchen can plan for it.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const fmtT = t => { if (!t || String(t).indexOf(':') < 0) return ''; const [h, m] = String(t).split(':').map(Number); return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM'); };
  const fmtD = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });

  function strip(days) {
    const rows = [], hasClass = new Set();
    days.forEach(d => {
      let ev = []; try { ev = skedGetRetreatEvents(d) || []; } catch (e) {}
      ev.filter(e => /cook/i.test(e.title || '')).forEach(e => {
        const bk = (AppData.bookings || []).find(b => b.id === e.bkId);
        const who = (bk && (bk.leaderName || bk.retreatName)) || String(e.subtitle || '').split(' · ')[0] || '';
        if (bk) hasClass.add(bk.id);
        rows.push({ d, t: fmtT(e.startTime) + (e.endTime ? ' – ' + fmtT(e.endTime) : ''), who, st: e.startTime || '' });
      });
    });
    rows.sort((a, b) => a.d.localeCompare(b.d) || a.st.localeCompare(b.st));
    const first = days[0], last = days[days.length - 1];
    const missing = (AppData.bookings || []).filter(b => b.status !== 'cancelled' && b.startDate && b.endDate && (b.bookingType || '') !== 'room_only' && !/\bBBC\b|bikini\s*boot|zzz|\btest\b/i.test((b.retreatName || '') + ' ' + (b.leaderName || '')) &&
      String(b.startDate).slice(0, 10) <= last && String(b.endDate).slice(0, 10) > first && !hasClass.has(b.id))
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
    return `<div id="mccBox" style="margin:0 0 14px;padding:12px 16px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:12px;font-family:'Jost',sans-serif;color:#2d2520">
      <div style="font-size:13px;font-weight:800;color:#92400e;margin-bottom:6px">👩‍🍳 Cooking classes this week</div>
      ${rows.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${rows.map(r => `<div style="background:#fff;border:1.5px solid #fde68a;border-radius:10px;padding:6px 12px;font-size:13px"><b>${fmtD(r.d)}</b> · ${esc(r.t)} · ${esc(r.who)}</div>`).join('')}</div>` : '<div style="font-size:13px;color:#6b7280">No cooking class is scheduled this week.</div>'}
      ${missing.length ? `<div style="font-size:12px;color:#b45309;margin-top:8px"><b>In the house this week with no cooking class scheduled yet:</b> ${missing.map(b => esc(b.leaderName || b.retreatName)).join(', ')}</div>` : ''}
    </div>`;
  }

  const prev = window.menuRenderWeek;
  if (typeof prev === 'function') {
    window.menuRenderWeek = function () {
      const r = prev.apply(this, arguments);
      try {
        const grid = document.getElementById('menuGrid'); if (!grid || typeof menuCurrentMonday === 'undefined') return r;
        const days = []; for (let i = 0; i < 7; i++) { const d = new Date(menuCurrentMonday + 'T12:00:00'); d.setDate(d.getDate() + i); days.push(d.toISOString().slice(0, 10)); }
        const old = document.getElementById('mccBox'); if (old) old.remove();
        grid.insertAdjacentHTML('beforebegin', strip(days));
      } catch (e) { console.warn('[menu-cooking-classes]', e); }
      return r;
    };
  }
})();
