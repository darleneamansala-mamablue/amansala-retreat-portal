// ===== teacher-transport-no-prices.js — teachers no longer see transportation prices (Darlene 2026-10-29) =====
// Loaded as a classic script AFTER teacher-transport-edit.js and teacher-transport-note.js; shares global scope. Standalone: only wraps _renderTeacherTransportInner.
// In a teacher's view (not an admin, not an admin previewing as the teacher) it removes the "Est. Cost" column, the dollar totals in the "Teacher paying transportation"
// banner, the "Transfer Pricing Reference" card at the bottom, and the transport total in the Room List stats. Admin logins keep every price. Nothing is deleted or changed in the data.
(function () {
  const isAdmin = () => { try { return typeof IS_TEACHER_MODE === 'undefined' || !IS_TEACHER_MODE || sessionStorage.getItem('ama_admin_viewing') === '1'; } catch (e) { return true; } };

  function hideRoomListTotal() {
    let st = document.getElementById('tntpStyle');
    if (isAdmin()) { if (st) st.remove(); return; }
    if (!st) { st = document.createElement('style'); st.id = 'tntpStyle'; st.textContent = '#rstatTransportWrap{display:none !important}'; document.head.appendChild(st); }
  }

  function strip(wrap) {
    wrap.querySelectorAll('table').forEach(t => {
      const head = t.querySelector('tr');
      if (!head) return;
      const ths = [...head.children];
      const idx = ths.findIndex(th => /est\.?\s*cost|price|cost/i.test(th.textContent));
      if (idx < 0) return;
      t.querySelectorAll('tr').forEach(tr => {
        const c = tr.children;
        if (c.length === 1 && c[0].hasAttribute('colspan')) { c[0].setAttribute('colspan', String(Math.max(1, Number(c[0].getAttribute('colspan')) - 1))); return; }
        if (c[idx]) c[idx].remove();
      });
    });
    // "Teacher paying transportation" banner: keep the message, drop the dollar amounts
    [...wrap.querySelectorAll('div')].forEach(d => {
      if (d.children.length === 0 && /Arrivals|Departures/.test(d.textContent) && /\$|pending submissions/.test(d.textContent) && d.parentElement && /Teacher paying transportation/.test(d.parentElement.textContent)) {
        const parts = [];
        if (/Arrivals/.test(d.textContent)) parts.push('🛬 Arrivals');
        if (/Departures/.test(d.textContent)) parts.push('🛫 Departures');
        d.innerHTML = parts.join(' &nbsp;·&nbsp; ');
      }
    });
  }

  // the teal "Transfer Pricing Reference" card at the bottom of the page
  const prevCard = window._trPricingCardHtml;
  if (typeof prevCard === 'function') window._trPricingCardHtml = function () { return isAdmin() ? prevCard.apply(this, arguments) : ''; };

  const prev = window._renderTeacherTransportInner;
  if (typeof prev === 'function') {
    window._renderTeacherTransportInner = function (bkId) {
      const r = prev.apply(this, arguments);
      try { hideRoomListTotal(); if (!isAdmin()) { const w = document.getElementById('teacherTransportContent'); if (w) strip(w); } } catch (e) { console.warn('[teacher-transport-no-prices]', e); }
      return r;
    };
  }
  setInterval(() => { try { hideRoomListTotal(); } catch (e) {} }, 5000);
  setTimeout(hideRoomListTotal, 1500);
})();
