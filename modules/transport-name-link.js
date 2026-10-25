// ===== transport-name-link.js — Transport log: click a guest's name to open their booking =====
// Loaded as a classic script AFTER transport.js, transport-balances.js and checkin-by.js; shares global scope. Standalone: wraps tr2RenderRow and makes the guest name on every row that is matched
// to a registration a link (blue, underlined) that opens that guest's booking (openBookingDetailForReg, the same screen the Reservations lists open). A guest who isn't matched to a registration yet
// stays plain text. Clicking the name does not start the row's drag or edit. Asked by Darlene 2026-10-24.
(function () {
  if (typeof tr2RenderRow !== 'function') return;
  const o = window.tr2RenderRow, esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  window.tr2RenderRow = function (e) {
    const html = o.apply(this, arguments);
    try {
      if (!e || !e.regId || typeof openBookingDetailForReg !== 'function') return html;
      return html.replace(/<div style="font-weight:700;color:#111827">([^<]*)<\/div>/, (m, name) =>
        `<div data-reg="${esc(e.regId)}" data-name="${esc(e.guest || '')}" onclick="event.stopPropagation();openBookingDetailForReg(this.dataset.reg,this.dataset.name)" title="Open ${esc(e.guest || 'their')} booking" style="font-weight:700;color:#1d4ed8;text-decoration:underline;text-underline-offset:2px;cursor:pointer">${name}</div>`);
    } catch (err) { return html; }
  };
})();
