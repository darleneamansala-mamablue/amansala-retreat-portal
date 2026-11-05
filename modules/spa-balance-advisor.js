// ===== spa-balance-advisor.js — "Balance the services" advice on the Spa Calendar (Darlene 2026-11-05) =====
// Loaded as a classic script AFTER spa-rule-alerts.js, spa-request-markers.js and spa-time-blocks.js; shares global scope. Standalone: wraps spaCalRender to put a panel
// under the rule-alerts banner for the day being viewed (admin calendar only). It ADVISES; nothing moves until someone presses a "Move to ..." button and confirms.
// What Darlene asked: services are not balanced (Laura has more than most and only 3 were requested for her). A service that is not a request for that therapist should not
// pile up on one person: say who has how many, and for a service that could move, offer the therapists with fewer (Gaby, Graciela, Julian, ...) so she can choose.
// Rules used:
//   - never suggested to move: a service the guest requested a specific therapist for (requestMarker / therapistPreference = specific), a Completed / No-show one, one that already started
//   - a request for a woman / a man only goes to a therapist of that gender; no request = any therapist (so Julian's gaps count too)
//   - the therapist must offer that service on their profile, have the time free (no other service, no time block / day off), and be under their daily limit
//   - a move is offered only when it really evens things out (the giver has at least 2 more services than the receiver)
//   - Mayan Healing goes to Gaby and Maria Luisa first; it is only left with Laura (or anyone else) when neither of them has the time free
const sbaCnt = {};
let sbaSugs = [];
const sbaMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const sbaFmt = m => { const h = Math.floor(m / 60); return ((h % 12) || 12) + ':' + String(m % 60).padStart(2, '0') + (h >= 12 ? ' PM' : ' AM'); };
const sbaEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const sbaFirst = t => String((t && t.firstName) || '').trim();
const sbaIsMaria = t => { const n = ((typeof sraRot !== 'undefined' && sraRot.mariaName) || 'Maria Luisa').trim().toLowerCase(); return !!t && (sbaFirst(t).toLowerCase() === n || `${sbaFirst(t)} ${(t.lastName || '').trim()}`.trim().toLowerCase() === n); };
const sbaIsGaby = t => /^gab/i.test(sbaFirst(t));
const sbaIsMayan = svc => !!svc && /mayan\s*healing/i.test(svc.name || '');
const sbaName = t => sbaIsMaria(t) ? `${sbaFirst(t)} ${(t.lastName || '').trim()}`.trim() : sbaFirst(t);

function sbaCap(t) {
  const S = (typeof sraRot !== 'undefined' && sraRot) || { mariaDailyCap: 4, generalDailyCap: 7 };
  return sbaIsMaria(t) ? S.mariaDailyCap : (parseInt(t.maxServicesPerDay, 10) || S.generalDailyCap);
}
function sbaAdvise(dateStr) {
  const therapists = (SpaData.therapists || []).filter(t => t.active !== false);
  const services = SpaData.services || [], svcOf = id => services.find(s => s.id === id);
  const appts = (SpaAppointments || []).filter(a => a.date === dateStr && a.status !== 'CANCELLED' && a.therapistId);
  const now = new Date(Date.now() - 5 * 3600000), today = now.toISOString().slice(0, 10), nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const count = {}, asked = {}; therapists.forEach(t => { count[t.id] = 0; asked[t.id] = 0; });
  appts.forEach(a => { if (a.therapistId in count) { count[a.therapistId]++; if (srmOf(a) === 'therapist') asked[a.therapistId]++; } });
  const movable = a => {
    if (srmOf(a) === 'therapist') return false;
    if (a.status === 'COMPLETED' || a.status === 'NO_SHOW') return false;
    if (dateStr < today || (dateStr === today && sbaMin(a.start) <= nowMin)) return false;
    const s = svcOf(a.serviceId); if (!s || s.sessionType === 'group') return false;
    return true;
  };
  const genderOK = (t, a) => { const m = srmOf(a); return m === 'female' ? t.gender === 'female' : m === 'male' ? t.gender === 'male' : true; };
  const canDo = (t, a) => (t.services || []).some(x => x.serviceId === a.serviceId);
  const moved = {};   // appointment id -> therapist id, for moves already suggested in this pass
  const effTher = a => moved[a.id] || a.therapistId;
  const isFree = (t, a) => {
    const s = sbaMin(a.start), e = s + (parseInt(a.duration, 10) || 60);
    if (appts.some(x => x.id !== a.id && effTher(x) === t.id && sbaMin(x.start) < e && sbaMin(x.start) + (parseInt(x.duration, 10) || 60) > s)) return false;
    try { if (typeof spaBlkFind === 'function' && spaBlkFind(t.id, dateStr, s, e)) return false; } catch (e2) {}
    return true;
  };
  const sugs = [];
  const total = Object.values(count).reduce((n, x) => n + x, 0);
  const order = appts.filter(movable).sort((a, b) => (count[b.therapistId] || 0) - (count[a.therapistId] || 0) || sbaMin(a.start) - sbaMin(b.start));
  order.forEach(a => {
    if (sugs.length >= 12) return;
    const from = therapists.find(t => t.id === a.therapistId); if (!from) return;
    const svc = svcOf(a.serviceId), mayan = sbaIsMayan(svc);
    let cands = therapists.filter(t => t.id !== from.id && canDo(t, a) && genderOK(t, a) && isFree(t, a) && count[t.id] < sbaCap(t));
    let why = '';
    if (mayan && !(sbaIsGaby(from) || sbaIsMaria(from))) {
      const first = cands.filter(t => sbaIsGaby(t) || sbaIsMaria(t));
      if (!first.length) return;                                   // Gaby and Maria Luisa have no time: it stays where it is
      cands = first; why = 'Mayan Healing goes to Gaby and Maria Luisa first.';
    } else {
      cands = cands.filter(t => count[from.id] - count[t.id] >= 2);
      if (!cands.length) return;
    }
    cands.sort((x, y) => count[x.id] - count[y.id] || sbaFirst(x).localeCompare(sbaFirst(y)));
    const top = cands.slice(0, 3);
    sugs.push({ id: a.id, fromId: from.id, from: sbaName(from), client: a.clientName || 'a guest', svc: svc ? svc.name : 'service', start: sbaMin(a.start), req: srmOf(a), why, to: top.map(t => ({ id: t.id, name: sbaName(t), n: count[t.id] })) });
    count[from.id]--; moved[a.id] = top[0].id; count[top[0].id]++;
  });
  const orig = {}; appts.forEach(a => { orig[a.therapistId] = (orig[a.therapistId] || 0) + 1; });
  const rows = therapists.map(t => ({ id: t.id, name: sbaName(t), n: orig[t.id] || 0, asked: asked[t.id] || 0 })).filter(r => r.n > 0 || sugs.some(s => s.to.some(x => x.id === r.id))).sort((a, b) => b.n - a.n);
  return { rows, sugs, total };
}
function sbaToggle() { try { localStorage.setItem('amansala_sba_collapsed', localStorage.getItem('amansala_sba_collapsed') === '1' ? '0' : '1'); } catch (e) {} spaCalRender(); }
function sbaPanel() {
  if (typeof IS_SPA_STAFF_MODE !== 'undefined' && IS_SPA_STAFF_MODE) return '';
  if (typeof SpaData === 'undefined' || typeof SpaAppointments === 'undefined' || typeof spaCalDate === 'undefined') return '';
  const dateStr = spaCalFmtDateStr(spaCalDate), adv = sbaAdvise(dateStr); sbaSugs = adv.sugs;
  if (!adv.rows.length) return '';
  let closed = false; try { closed = localStorage.getItem('amansala_sba_collapsed') === '1'; } catch (e) {}
  const btn = 'border:1.5px solid #6d28d9;background:#fff;color:#5b21b6;border-radius:8px;padding:3px 10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit';
  const chips = adv.rows.map(r => `<span style="display:inline-block;margin:0 6px 4px 0;padding:2px 10px;border-radius:99px;background:#fff;border:1.5px solid #ddd6fe;font-size:12.5px"><b>${sbaEsc(r.name)}</b> ${r.n}${r.asked ? ` <span style="color:#6b7280">(${r.asked} requested)</span>` : ''}</span>`).join('');
  const reqIcon = r => r === 'female' ? ' 👗 asked for a woman' : r === 'male' ? ' 🤠 asked for a man' : '';
  const list = adv.sugs.map((s, i) => `<div style="padding:6px 0;border-top:1px solid #ede9fe;font-size:13px;line-height:1.5"><b>${sbaEsc(s.client)}</b> · ${sbaEsc(s.svc)} · ${sbaFmt(s.start)}${reqIcon(s.req)} is with <b>${sbaEsc(s.from)}</b>. ${s.why ? `<i>${sbaEsc(s.why)}</i> ` : ''}You can offer it to: ${s.to.map(t => `<button onclick="sbaMove(${i},'${t.id}')" style="${btn};margin:0 4px 2px 0">${sbaEsc(t.name)} (${t.n} today)</button>`).join('')}</div>`).join('');
  const msg = adv.sugs.length ? `${adv.sugs.length} service${adv.sugs.length === 1 ? '' : 's'} could be shared out` : 'Services look balanced';
  return `<div id="sbaPanel" style="margin:0 0 14px;padding:12px 16px;border-radius:12px;background:#f5f3ff;border:1.5px solid #ddd6fe;text-align:left;font-family:'Jost',sans-serif">
    <div onclick="sbaToggle()" style="cursor:pointer;display:flex;justify-content:space-between;gap:10px;user-select:none"><div style="font-weight:700;font-size:13.5px;color:#5b21b6">⚖ Balance the services · ${sbaEsc(msg)}</div><div style="font-size:12px;font-weight:700;color:#6b7280">${closed ? '▸ Show' : '▾ Hide'}</div></div>
    <div style="display:${closed ? 'none' : 'block'};margin-top:6px"><div style="font-size:12px;color:#6b7280;margin-bottom:4px">Services today (${adv.total}): a request for that therapist is never moved. Advice only: nothing changes until you press a name. It assumes the therapist is working that day (a day off is a time block).</div>${chips}${list}</div></div>`;
}
async function sbaMove(i, toId) {
  const s = sbaSugs[i]; if (!s) return;
  const a = SpaAppointments.find(x => x.id === s.id), to = (SpaData.therapists || []).find(t => t.id === toId); if (!a || !to) return;
  if (!confirm(`Move ${s.client} (${s.svc}, ${sbaFmt(s.start)}) from ${s.from} to ${sbaName(to)}?`)) return;
  const conflict = spaCalCheckConflict({ ...a, therapistId: toId }, a.id);
  if (conflict) { alert(`Can't move: it clashes with ${conflict.clientName} at ${spaCalFmtT(conflict.start)}.`); return; }
  a.therapistId = toId;
  spaCalSave(); spaCalRender();
  if (typeof showToast === 'function') showToast(`Moved to ${sbaName(to)}.`);
}
(function () {
  if (typeof spaCalRender !== 'function') return;
  const orig = window.spaCalRender;
  window.spaCalRender = function () {
    const r = orig.apply(this, arguments);
    try {
      const el = document.getElementById('spaContent'), html = sbaPanel();
      if (el && html) { const b = document.getElementById('sraBanner'); if (b) b.insertAdjacentHTML('afterend', html); else el.insertAdjacentHTML('afterbegin', html); }
    } catch (e) { console.warn('[spa balance advisor]', e); }
    return r;
  };
})();
