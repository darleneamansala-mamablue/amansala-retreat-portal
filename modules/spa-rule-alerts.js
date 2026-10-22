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
// The rules may be broken when the therapist agrees (Darlene 2026-10-22: "we can break the rules if we need to, it would be the therapist authorized it"): each alert has a
// "Therapist authorized" button that records who noted it and when (app_store 'spaRuleAuth'); authorized alerts move to a quiet list, are not counted, and can be undone.
// An authorization belongs to that exact situation (same day, same therapist, same service count or time), so if more is added later the alert comes back.
let sraRot = { mariaName: 'Maria Luisa', mariaStageSize: 2, mariaBreakMinutes: 45, mariaDailyCap: 4, generalBreakAfter: 3, generalBreakMinutes: 30, generalDailyCap: 7 };
let sraLoaded = false, sraAuth = {}, sraKeys = [];

async function sraLoadSettings() {
  try { const { data } = await db.from('app_store').select('value').eq('key', 'spa_rotation_settings').maybeSingle(); if (data && data.value) sraRot = { ...sraRot, ...data.value }; } catch (e) {}
  sraLoaded = true;
}
async function sraLoadAuth() { try { const { data } = await db.from('app_store').select('value').eq('key', 'spa_rule_auth').maybeSingle(); sraAuth = (data && data.value) || {}; } catch (e) {} }
async function sraSetAuth(key, on, who) { // re-read first so two people's clicks don't overwrite each other
  await sraLoadAuth();
  if (on) sraAuth[key] = { by: (typeof getCurrentSession === 'function' && (getCurrentSession() || {}).name) || 'Staff', at: new Date().toISOString(), therapist: who || '' }; else delete sraAuth[key];
  try { const { error } = await db.from('app_store').upsert({ key: 'spa_rule_auth', value: sraAuth, updated_at: new Date().toISOString() }); if (error) throw error; }
  catch (e) { if (typeof showToast === 'function') showToast('Could not save — try again.'); return; }
  try { window.spaCalRender(); } catch (e) {}
}
function sraAuthorize(i) { const x = sraKeys[i]; if (x) return sraSetAuth(x.key, true, x.who); }
function sraUndo(i) { const x = sraKeys[i]; if (x) return sraSetAuth(x.key, false); }
const sraMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const sraFmt = m => { const h = Math.floor(m / 60); return ((h % 12) || 12) + ':' + String(m % 60).padStart(2, '0') + (h >= 12 ? ' PM' : ' AM'); };

// Returns [{ who, text }] for one date
function sraIssues(dateStr) {
  const out = [], S = sraRot;
  (SpaData.therapists || []).forEach(t => {
    const appts = (SpaAppointments || []).filter(a => a.date === dateStr && a.status !== 'CANCELLED' && a.therapistId === t.id)
      .map(a => ({ s: sraMin(a.start), e: sraMin(a.start) + (a.duration || 60), name: a.clientName || 'a guest' })).sort((x, y) => x.s - y.s);
    if (!appts.length) return;
    // Maria's record is first name "Maria", last name "Luisa", while the Auto-Assign setting says "Maria Luisa": match the full name as well as the first name
    const first = (t.firstName || 'A therapist').trim(), full = `${t.firstName || ''} ${t.lastName || ''}`.trim(), mn = String(S.mariaName || '').trim().toLowerCase();
    const isMaria = !!mn && (first.toLowerCase() === mn || full.toLowerCase() === mn), who = isMaria ? full : first;
    const cap = isMaria ? S.mariaDailyCap : (parseInt(t.maxServicesPerDay, 10) || S.generalDailyCap);
    if (appts.length > cap) out.push({ who, tid: t.id, key: `${dateStr}|${t.id}|cap|${appts.length}`, text: `${who} has ${appts.length} services (the limit is ${cap}).` });
    for (let i = 1; i < appts.length; i++) if (appts[i].s < appts[i - 1].e) out.push({ who, tid: t.id, key: `${dateStr}|${t.id}|double|${appts[i].s}`, text: `${who} is double-booked at ${sraFmt(appts[i].s)} (${appts[i - 1].name} and ${appts[i].name}).` });
    if (isMaria) {
      const n = Math.max(1, parseInt(S.mariaStageSize, 10) || 1);
      if (appts.length > n) { const gap = appts[n].s - appts[n - 1].e; if (gap < S.mariaBreakMinutes) out.push({ who, tid: t.id, key: `${dateStr}|${t.id}|break|${appts[n].s}`, text: `${who} has no break: service ${n + 1} (${sraFmt(appts[n].s)}) starts ${Math.max(gap, 0)} minutes after service ${n} ends. A ${S.mariaBreakMinutes}-minute break is needed after ${n} services.` }); }
    } else {
      const own = parseInt(t.breakMinutes, 10) || 0;
      if (own) { for (let i = 1; i < appts.length; i++) { const gap = appts[i].s - appts[i - 1].e; if (gap >= 0 && gap < own) out.push({ who, tid: t.id, key: `${dateStr}|${t.id}|pair|${appts[i].s}`, text: `${who} has only ${gap} minutes between ${appts[i - 1].name} and ${appts[i].name} (the profile asks for ${own}).` }); } }
      else { // a break of generalBreakMinutes is needed after generalBreakAfter services that run back to back
        let chain = 1;
        for (let i = 1; i < appts.length; i++) {
          const gap = appts[i].s - appts[i - 1].e;
          if (gap >= 0 && chain >= S.generalBreakAfter && gap < S.generalBreakMinutes)
            out.push({ who, tid: t.id, key: `${dateStr}|${t.id}|chain|${appts[i].s}`, text: `${who} gets ${gap === 0 ? 'no break' : 'only ' + gap + ' minutes'} after ${chain} back-to-back services (next one ${sraFmt(appts[i].s)}); a ${S.generalBreakMinutes}-minute break is needed.` });
          chain = gap === 0 ? chain + 1 : 1;
        }
      }
    }
  });
  return out;
}

function sraToggle() { try { localStorage.setItem('amansala_sra_collapsed', localStorage.getItem('amansala_sra_collapsed') === '1' ? '0' : '1'); } catch (e) {} const b = document.getElementById('sraBanner'); if (b) b.outerHTML = sraBanner(); }
function sraBanner() {
  if (typeof IS_SPA_STAFF_MODE !== 'undefined' && IS_SPA_STAFF_MODE) return '';
  const d0 = new Date(spaCalDate.getTime()), key = d => spaCalFmtDateStr(d), all = sraIssues(key(d0));
  const open = all.filter(x => !sraAuth[x.key]), okd = all.filter(x => sraAuth[x.key]);
  const later = [1, 2, 3].map(n => { const d = new Date(d0.getTime() + n * 86400000); return { n, d, c: sraIssues(key(d)).filter(x => !sraAuth[x.key]).length }; }).filter(x => x.c);
  if (!all.length && !later.length) return '';
  sraKeys = [...open, ...okd]; // button handlers refer to these by number
  let closed = false; try { closed = localStorage.getItem('amansala_sra_collapsed') === '1'; } catch (e) {}
  const day = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const btn = 'border:1.5px solid #c8bfb5;background:#fff;border-radius:8px;padding:2px 9px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;font-family:inherit';
  const when = iso => { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Cancun' }); } catch (e) { return ''; } };
  const red = open.length > 0;
  return `<div id="sraBanner" style="margin:0 0 14px;padding:12px 16px;border-radius:12px;background:${red ? '#fef2f2' : (okd.length ? '#f0fdf4' : '#fffbeb')};border:1.5px solid ${red ? '#fecaca' : (okd.length ? '#bbf7d0' : '#fde68a')};text-align:left;font-family:'Jost',sans-serif">
    <div onclick="sraToggle()" title="Click to ${closed ? 'open' : 'close'}" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;user-select:none">
      <div style="font-weight:700;font-size:13.5px;color:${red ? '#b91c1c' : (okd.length ? '#15803d' : '#92400e')}">${red ? `⚠ ${open.length} auto-assign rule${open.length !== 1 ? 's' : ''} to check on ${day(d0)}` : (okd.length ? `✓ ${okd.length} rule break${okd.length !== 1 ? 's' : ''} on ${day(d0)}, all authorized by the therapist` : `No rules broken on ${day(d0)}`)}${closed && later.length ? ` <span style="font-weight:600;font-size:12px">· coming up: ${later.map(x => x.c + ' on ' + day(x.d)).join(', ')}</span>` : ''}</div>
      <div style="font-size:12px;font-weight:700;color:#6b7280;white-space:nowrap">${closed ? '▸ Show' : '▾ Hide'}</div></div>
    <div style="display:${closed ? 'none' : 'block'};margin-top:4px">
      ${open.map((x, i) => `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:12.5px;color:#7f1d1d;line-height:1.55;padding:2px 0"><span>• ${esc(x.text)}</span><button onclick="sraAuthorize(${i})" title="The therapist agreed to this. It moves to the authorized list." style="${btn};color:#15803d">✓ Therapist authorized</button></div>`).join('')}
      ${okd.length ? `<div style="margin-top:${open.length ? '8px' : '0'};font-size:11.5px;font-weight:700;color:#15803d">Authorized by the therapist</div>${okd.map((x, j) => { const a = sraAuth[x.key], i = open.length + j; return `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:12px;color:#166534;line-height:1.5;padding:1px 0"><span>• ${esc(x.text)} <i style="color:#6b7280">— noted by ${esc(a.by)}, ${when(a.at)}</i></span><button onclick="sraUndo(${i})" style="${btn};color:#6b7280">Undo</button></div>`; }).join('')}` : ''}
      ${later.length ? `<div style="margin-top:8px;font-size:12px;color:#92400e">Coming up: ${later.map(x => `<a href="#" onclick="spaCalNav(${x.n});return false" style="color:#92400e;font-weight:700">${day(x.d)} — ${x.c} to check</a>`).join(' · ')}</div>` : ''}
    </div>
  </div>`;
}

(function () {
  if (typeof spaCalRender !== 'function') return;
  const orig = window.spaCalRender;
  window.spaCalRender = function () {
    const r = orig.apply(this, arguments);
    try {
      if (!sraLoaded) { sraLoaded = true; Promise.all([sraLoadSettings(), sraLoadAuth()]).then(() => { try { window.spaCalRender(); } catch (e) {} }); }
      const el = document.getElementById('spaContent'), html = sraBanner();
      if (el && html) el.insertAdjacentHTML('afterbegin', html);
    } catch (e) { console.warn('[spa rule alerts]', e); }
    return r;
  };
})();
