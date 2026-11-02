// ===== spa-balance-notice.js — a notice on the Spa Calendar when one therapist has far more services than the others (Darlene 2026-11-02) =====
// Loaded as a classic script AFTER spa-calendar.js and spa-rule-alerts.js; shares global scope. Standalone: wraps spaCalRender to put an amber notice above the calendar
// for the day being viewed, plus a one-line look at the next 3 days. Admin calendar only. Read-only: it never blocks or changes a booking.
// Compared: active Body Workers (the 'massage' group) who are not blocked for most of that day (a day off). Cancelled appointments never count.
// Flagged when the busiest has at least SBN_MIN_TOP services and is SBN_GAP or more ahead of the least busy therapist who could take more. Maria Luisa has her own daily
// limit (Auto-Assign), so she is never named as the one with too few, and a therapist already at their own daily limit is never named as the one with too few either.
const SBN_GAP = 3, SBN_MIN_TOP = 3, SBN_DAYOFF_MINUTES = 6 * 60;

function sbnIssues(dateStr) {
  const blocks = (typeof SpaBlocks !== 'undefined' && SpaBlocks) || [], blkM = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const S = (typeof sraRot !== 'undefined' && sraRot) || {}, mn = String(S.mariaName || 'Maria Luisa').trim().toLowerCase();
  const people = (SpaData.therapists || []).filter(t => t.active && (typeof spaTherCategories === 'function' ? spaTherCategories(t).has('massage') : true)).map(t => {
    const blocked = blocks.filter(b => b.therapistId === t.id && b.date === dateStr).reduce((m, b) => m + (b.allDay ? 24 * 60 : Math.max(0, blkM(b.end) - blkM(b.start))), 0);
    const count = (SpaAppointments || []).filter(a => a.date === dateStr && a.status !== 'CANCELLED' && a.therapistId === t.id).length;
    const first = String(t.firstName || '').trim(), full = `${t.firstName || ''} ${t.lastName || ''}`.trim();
    return { t, name: first, count, off: blocked >= SBN_DAYOFF_MINUTES, maria: first.toLowerCase() === mn || full.toLowerCase() === mn };
  }).filter(p => !p.off);
  if (people.length < 2) return [];
  const top = people.slice().sort((a, b) => b.count - a.count)[0];
  if (top.count < SBN_MIN_TOP) return [];
  const low = people.filter(p => p !== top && !p.maria && top.count - p.count >= SBN_GAP && p.count < (parseInt(p.t.maxServicesPerDay, 10) || S.generalDailyCap || 7)).sort((a, b) => a.count - b.count);
  if (!low.length) return [];
  const n = c => `${c} service${c === 1 ? '' : 's'}`;
  return [{ text: `${top.name} has ${n(top.count)} while ${low.map(p => `${p.name} has ${p.count}`).join(', ').replace(/, ([^,]*)$/, ' and $1')}. Consider moving a service to even it out.` }];
}

function sbnBanner() {
  if (typeof IS_SPA_STAFF_MODE !== 'undefined' && IS_SPA_STAFF_MODE) return '';
  const d0 = new Date(spaCalDate.getTime()), key = d => spaCalFmtDateStr(d), now = sbnIssues(key(d0));
  const later = [1, 2, 3].map(n => { const d = new Date(d0.getTime() + n * 86400000); return { n, d, c: sbnIssues(key(d)).length }; }).filter(x => x.c);
  if (!now.length && !later.length) return '';
  const day = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<div id="sbnBanner" style="margin:0 0 14px;padding:12px 16px;border-radius:12px;background:#fffbeb;border:1.5px solid #fde68a;font-family:Jost,sans-serif">
    ${now.length ? `<div style="font-weight:700;font-size:13.5px;color:#92400e">⚖ Uneven workload on ${day(d0)}</div>${now.map(x => `<div style="font-size:12.5px;color:#78350f;line-height:1.55;padding-top:3px">• ${esc(x.text)}</div>`).join('')}` : ''}
    ${later.length ? `<div style="margin-top:${now.length ? '8px' : '0'};font-size:12px;color:#92400e">${now.length ? 'Coming up' : '⚖ Uneven workload coming up'}: ${later.map(x => `<a href="#" onclick="spaCalNav(${x.n});return false" style="color:#92400e;font-weight:700">${day(x.d)}</a>`).join(' · ')}</div>` : ''}
  </div>`;
}

(function () {
  if (typeof spaCalRender !== 'function') return;
  const orig = window.spaCalRender;
  window.spaCalRender = function () {
    const r = orig.apply(this, arguments);
    try {
      const el = document.getElementById('spaContent'), html = sbnBanner();
      if (el && html) { const sra = document.getElementById('sraBanner'); if (sra) sra.insertAdjacentHTML('afterend', html); else el.insertAdjacentHTML('afterbegin', html); }
    } catch (e) { console.warn('[spa balance notice]', e); }
    return r;
  };
})();
