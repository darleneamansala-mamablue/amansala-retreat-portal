// ===== menu-gih.js — "GIH" (Guests In House) count on every day of the Menu (Darlene 2026-10-26) =====
// The kitchen needs one number per day = everybody who sleeps in house the night before and so needs breakfast that morning: retreat guests (registered guests, teacher room included),
// BBC / Bikini Bootcamp and other room-only guests (their pax), WeTravel groups. Cancelled, archived and not-yet-confirmed ('requested') bookings are not counted. Stay nights are
// start <= night < end, so a guest eats breakfast on the departure morning but not on the arrival morning. Display only; nothing is saved.
(function () {
  if (!document.getElementById('mgihCss')) {
    const st = document.createElement('style'); st.id = 'mgihCss';
    st.textContent = '.mgih{display:inline-block;margin-top:5px;padding:2px 9px;border-radius:10px;background:#fde68a;color:#78350f;font-size:11px;font-weight:800;letter-spacing:.3px}';
    document.head.appendChild(st);
  }
  function gihFor(ds) {
    let n = 0;
    try {
      const prev = new Date(ds + 'T12:00:00'); prev.setDate(prev.getDate() - 1); const night = prev.toISOString().slice(0, 10);
      (AppData.bookings || []).forEach(b => {
        if (!b || b.status === 'cancelled' || b.status === 'requested' || (b.flags || []).includes('archived')) return;
        const s = (b.startDate || '').slice(0, 10), e = (b.endDate || '').slice(0, 10);
        if (!s || !e || !(s <= night && night < e)) return;
        n += Number(b.bookingType === 'room_only' ? b.pax : (typeof menuHeadcount === 'function' ? menuHeadcount(b) : b.pax)) || 0;
      });
    } catch (e) { console.warn('[menu-gih]', e); }
    return n;
  }
  function mgihPaint() {
    try {
      document.querySelectorAll('#menuGrid .menu-day-header, #menuGrid .msd-head').forEach(h => {
        if (h.querySelector('.mgih')) return;
        const m = (h.getAttribute('onclick') || '').match(/menuPrintDay\('(\d{4}-\d{2}-\d{2})'\)/); if (!m) return;
        const d = document.createElement('div'); d.className = 'mgih'; d.textContent = 'GIH ' + gihFor(m[1]);
        d.title = 'Guests in house — everyone who slept here last night and needs breakfast'; h.appendChild(d);
      });
    } catch (e) { console.warn('[menu-gih]', e); }
  }
  const o = window.menuRenderWeek;
  if (typeof o === 'function') window.menuRenderWeek = function () { const r = o.apply(this, arguments); setTimeout(mgihPaint, 50); return r; };
  setTimeout(mgihPaint, 50);
})();
