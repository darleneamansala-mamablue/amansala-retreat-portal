// ===== spa-rule-alerts.js — banner at the top of the Spa Calendar when the auto-assign rules are being broken =====
// Loaded as a classic script AFTER spa.js, spa-calendar.js and spa-rotation-settings.js; shares global scope. Standalone: wraps spaCalRender to put a banner above the
// calendar grid for the day being viewed (admin calendar only), plus a one-line look at the next 3 days. Read-only: it never blocks or changes a booking.
// Darlene 2026-10-22: "when the Auto assign rules are being broke we need notification on the top of the spa calendar ... Laura has too many, Maria Luisa does not
// have a break, so we can be notified when we have to change things."
// The limits are the same ones the guest booking page uses (staff-editable in Spa > Auto-Assign, saved as 'spa_rotation_settings'):
//   Maria Luisa : a break of mariaBreakMinutes after every mariaStageSize services; at most mariaDailyCap services a day.
//   Everyone else: a break of generalBreakMinutes after generalBreakAfter back-to-back services; at most generalDailyCap a day
//                  (a therapist's own "max services per day" / "break after each service" on their profile win over those).
// Also flagged: a therapist booked twice at overlapping times. Cancelled appointments never count.
let sraRot = { mariaName: 'Maria Luisa', mariaStageSize: 2, mariaBreakMinutes: 45, mariaDailyCap: 4, generalBreakAfter: 3, generalBreakMinutes: 30, generalDailyCap: 7 };
let sraLoaded = false;

async function sraLoadSettings() {
  try { const { data } = await db.from('app_store').select('value').eq('key', 'spa_rotation_settings').maybeSingle(); if (data && data.value) sraRot = { ...sraRot, ...data.value }; } catch (e) {}
  sraLoaded = true;
}
const sraMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const sraFmt = m => { const h = Math.floor(m / 60); return ((h % 12) || 12) + ':' + String(m % 60).padStart(2, '0') + (h >= 12 ? ' PM' : ' AM'); };

// Returns [{ who, text }] for one date
function sraIssues(dateStr) {
  const out = [], S = sraRot;
  (SpaData.therapists || []).forEach(t => {
    const appts = (SpaAppointments || []).filter(a => a.date === dateStr && a.status !== 'CANCELLED' && a.therapistId === t.id)
      .map(a => ({ s: sraMin(a.start), e: sraMin(a.start) + (a.duration || 60), name: a.clientName || 'a guest' })).sort((x, y) => x.s - y.s);
    if (!appts.length) return;
    const who = (t.firstName || 'A therapist').trim(), isMaria = who === String(S.mariaName || '').trim();
    const cap = isMaria ? S.mariaDailyCap : (parseInt(t.maxServicesPerDay, 10) || S.generalDailyCap);
    if (appts.length > cap) out.push({ who, text: `${who} has ${appts.length} services (the limit is ${cap}).` });
    for (let i = 1; i < appts.length; i++) if (appts[i].s < appts[i - 1].e) out.push({ who, text: `${who} is double-booked at ${sraFmt(appts[i].s)} (${appts[i - 1].name} and ${appts[i].name}).` });
    if (isMaria) {
      const n = Math.max(1, parseInt(S.mariaStageSize, 10) || 1);
      if (appts.length > n) { const gap = appts[n].s - appts[n - 1].e; if (gap < S.mariaBreakMinutes) out.push({ who, text: `${who} has no break: service ${n + 1} (${sraFmt(appts[n].s)}) starts ${Math.max(gap, 0)} minutes after service ${n} ends. A ${S.mariaBreakMinutes}-minute break is needed after ${n} services.` }); }
    } else {
      const own = parseInt(t.breakMinutes, 10) || 0;
      if (own) { for (let i = 1; i < appts.length; i++) { const gap = appts[i].s - appts[i - 1].e; if (gap >= 0 && gap < own) out.push({ who, text: `${who} has only ${gap} minutes between ${appts[i - 1].name} and ${appts[i].name} (the profile asks for ${own}).` }); } }
      else { // a break of generalBreakMinutes is needed after generalBreakAfter services that run back to back
        let chain = 1;
        for (let i = 1; i < appts.length; i++) {
          const gap = appts[i].s - appts[i - 1].e;
          if (gap >= 0 && chain >= S.generalBreakAfter && gap < S.generalBreakMinutes)
            out.push({ who, text: `${who} gets ${gap === 0 ? 'no break' : 'only ' + gap + ' minutes'} after ${chain} back-to-back services (next one ${sraFmt(appts[i].s)}); a ${S.generalBreakMinutes}-minute break is needed.` });
          chain = gap === 0 ? chain + 1 : 1;
        }
      }
    }
  });
  return out;
}

function sraBanner() {
  if (typeof IS_SPA_STAFF_MODE !== 'undefined' && IS_SPA_STAFF_MODE) return '';
  const d0 = new Date(spaCalDate.getTime()), key = d => spaCalFmtDateStr(d), today = sraIssues(key(d0));
  const later = [1, 2, 3].map(n => { const d = new Date(d0.getTime() + n * 86400000); return { n, d, c: sraIssues(key(d)).length }; }).filter(x => x.c);
  if (!today.length && !later.length) return '';
  const day = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `<div id="sraBanner" style="margin:0 0 14px;padding:12px 16px;border-radius:12px;background:${today.length ? '#fef2f2' : '#fffbeb'};border:1.5px solid ${today.length ? '#fecaca' : '#fde68a'};text-align:left;font-family:'Jost',sans-serif">
    ${today.length ? `<div style="font-weight:700;font-size:13.5px;color:#b91c1c;margin-bottom:4px">⚠ ${today.length} auto-assign rule${today.length !== 1 ? 's' : ''} to check on ${day(d0)}</div>
      ${today.map(x => `<div style="font-size:12.5px;color:#7f1d1d;line-height:1.55">• ${x.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`).join('')}` : `<div style="font-weight:700;font-size:13px;color:#92400e">No rules broken on ${day(d0)}.</div>`}
    ${later.length ? `<div style="margin-top:${today.length ? '8px' : '2px'};font-size:12px;color:#92400e">Coming up: ${later.map(x => `<a href="#" onclick="spaCalNav(${x.n});return false" style="color:#92400e;font-weight:700">${day(x.d)} — ${x.c} to check</a>`).join(' · ')}</div>` : ''}
  </div>`;
}

(function () {
  if (typeof spaCalRender !== 'function') return;
  const orig = window.spaCalRender;
  window.spaCalRender = function () {
    const r = orig.apply(this, arguments);
    try {
      if (!sraLoaded) { sraLoaded = true; sraLoadSettings().then(() => { try { window.spaCalRender(); } catch (e) {} }); }
      const el = document.getElementById('spaContent'), html = sraBanner();
      if (el && html) el.insertAdjacentHTML('afterbegin', html);
    } catch (e) { console.warn('[spa rule alerts]', e); }
    return r;
  };
})();
