// ===== spa-rebuild-wizard.js — put the therapists, services and rooms back under the appointments' own ids (Darlene 2026-11-05) =====
// Loaded as a classic script AFTER spa-recovery-list.js; shares global scope. On 2026-11-05 (8:03 AM Tulum) the spa settings were re-created with default services and rooms and NO therapists.
// The appointments were untouched and still point at the ORIGINAL therapist, service and room ids. This wizard (admin only, shown only while there are no active therapists) lists those ids, with the
// guests and times behind each one so you can tell who is who, and lets you name them: each therapist is created with its original id (so every appointment reattaches), and each old service /
// room id is given to the default service / room you pick for it. Pay rates are NOT known and are left empty: set them in Spa > Therapists. A real database backup of 'spa_data' is still the
// best fix; this is the way to get the calendar working without waiting for it. Before it writes it saves a copy of the current 'spa_data' as 'spa_data_before_rebuild_<time>'.
let srwStaff = [];
const srwEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const srwFmt = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return ((h % 12) || 12) + ':' + String(m || 0).padStart(2, '0') + (h >= 12 ? ' pm' : ' am'); };
function srwGather() {
  const appts = (SpaAppointments || []), th = {}, sv = {}, rm = {};
  const note = (map, id, a) => { if (!id) return; const x = map[id] = map[id] || { id, n: 0, active: 0, durs: {}, sample: [] }; x.n++; if (a.status !== 'CANCELLED') x.active++; x.durs[a.duration || 60] = (x.durs[a.duration || 60] || 0) + 1; if (a.status !== 'CANCELLED' && x.sample.length < 4) x.sample.push(a); };
  appts.forEach(a => { note(th, a.therapistId, a); note(sv, a.serviceId, a); note(rm, a.roomId, a); });
  const have = (list, id) => (list || []).some(x => x.id === id);
  return {
    therapists: Object.values(th).filter(x => !have(SpaData.therapists, x.id)).sort((a, b) => b.active - a.active),
    services: Object.values(sv).filter(x => !have(SpaData.services, x.id)).sort((a, b) => b.n - a.n),
    rooms: Object.values(rm).filter(x => !have(SpaData.rooms, x.id)).sort((a, b) => b.n - a.n),
  };
}
async function srwOpen() {
  if (typeof SpaData === 'undefined') return;
  try { const { data } = await db.from('app_store').select('value').eq('key', 'staffConfirmAccounts').maybeSingle(); srwStaff = ((data && data.value) || []).map(a => a.name).filter(Boolean); } catch (e) {}
  const g = srwGather();
  const ov = document.createElement('div'); ov.id = 'srwOv'; ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;overflow:auto;padding:24px';
  const dl = `<datalist id="srwNames">${[...new Set(srwStaff)].map(n => `<option value="${srwEsc(n)}">`).join('')}</datalist>`;
  const inp = 'padding:6px 9px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:inherit;font-size:13.5px';
  const thRows = g.therapists.map((t, i) => `<div style="padding:10px 0;border-top:1px solid #e8dfd4"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><b>Therapist ${i + 1}</b> <span style="color:#6b7280;font-size:12.5px">${t.active} active service${t.active === 1 ? '' : 's'} (${t.n} in all)</span>
      <input class="srwThName" data-id="${srwEsc(t.id)}" list="srwNames" placeholder="Who is this? (name)" style="${inp};min-width:200px">
      <select class="srwThGender" data-id="${srwEsc(t.id)}" style="${inp}"><option value="female">Female</option><option value="male">Male</option></select></div>
      <div style="font-size:12.5px;color:#4b5563;margin-top:4px">${t.sample.map(a => `${srwEsc(a.date)} ${srwFmt(a.start)} ${srwEsc(a.clientName || '')}`).join(' · ')}</div></div>`).join('');
  const svOpts = (SpaData.services || []).map((s, k) => `<option value="${srwEsc(s.id)}">${srwEsc(s.name)}${s.duration ? ' (' + s.duration + ' min)' : ''}</option>`).join('');
  const svRows = g.services.map(x => { const d = Object.entries(x.durs).sort((a, b) => b[1] - a[1])[0][0], guess = (SpaData.services || []).find(s => String(s.duration) === String(d) && s.sessionType !== 'group' && s.category === 'massage') || (SpaData.services || []).find(s => String(s.duration) === String(d));
    return `<div style="padding:7px 0;border-top:1px solid #e8dfd4;display:flex;gap:10px;flex-wrap:wrap;align-items:center"><span>${x.n} appointment${x.n === 1 ? '' : 's'}, usually ${d} min →</span><select class="srwSv" data-id="${srwEsc(x.id)}" style="${inp}"><option value="">(leave it)</option>${svOpts.replace(guess ? `value="${srwEsc(guess.id)}"` : 'value="#"', guess ? `value="${srwEsc(guess.id)}" selected` : 'value="#"')}</select></div>`; }).join('');
  const rmOpts = (SpaData.rooms || []).map(r => `<option value="${srwEsc(r.id)}">${srwEsc(r.name)}</option>`).join('');
  const rmRows = g.rooms.map((x, i) => `<div style="padding:7px 0;border-top:1px solid #e8dfd4;display:flex;gap:10px;flex-wrap:wrap;align-items:center"><span>Room ${i + 1}: ${x.n} appointment${x.n === 1 ? '' : 's'} →</span><select class="srwRm" data-id="${srwEsc(x.id)}" style="${inp}"><option value="">(leave it)</option>${rmOpts}</select></div>`).join('');
  ov.innerHTML = `<div style="max-width:860px;margin:0 auto;background:#fff;border-radius:14px;padding:22px 26px;font-family:'Jost',sans-serif">${dl}
    <div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:20px;font-weight:700">Rebuild the spa therapists</div><button onclick="document.getElementById('srwOv').remove()" style="${inp};cursor:pointer">Close</button></div>
    <div style="font-size:13px;color:#4b5563;margin:6px 0 12px">Each person below is a therapist your appointments still point at. Use the guests and times to tell who is who, type their name, and pick male or female. Pay rates are not known: set them in Spa &gt; Therapists afterwards. A copy of the current spa settings is saved first. If a database backup is restored later, it replaces all of this.</div>
    <div style="font-weight:700;margin-top:8px">Therapists (${g.therapists.length})</div>${thRows || '<div style="color:#9ca3af">None missing.</div>'}
    <div style="font-weight:700;margin-top:16px">Services the appointments use (${g.services.length}): pick which service each one was</div>${svRows || '<div style="color:#9ca3af">None missing.</div>'}
    <div style="font-weight:700;margin-top:16px">Rooms (${g.rooms.length})</div>${rmRows || '<div style="color:#9ca3af">None missing.</div>'}
    <div style="margin-top:18px;text-align:right"><button onclick="srwApply()" style="padding:10px 22px;background:#2d6a6a;color:#fff;border:none;border-radius:10px;font-weight:700;font-family:inherit;font-size:14px;cursor:pointer">Rebuild now</button></div></div>`;
  document.body.appendChild(ov);
}
async function srwApply() {
  const ths = [...document.querySelectorAll('.srwThName')].map(e => ({ id: e.dataset.id, name: e.value.trim(), gender: document.querySelector(`.srwThGender[data-id="${e.dataset.id}"]`).value }));
  const named = ths.filter(t => t.name), skipped = ths.length - named.length;
  const svMap = [...document.querySelectorAll('.srwSv')].filter(e => e.value).map(e => ({ oldId: e.dataset.id, tpl: e.value }));
  const rmMap = [...document.querySelectorAll('.srwRm')].filter(e => e.value).map(e => ({ oldId: e.dataset.id, tpl: e.value }));
  if (!named.length) { alert('Type at least one therapist name first.'); return; }
  if (!confirm(`Rebuild ${named.length} therapist${named.length === 1 ? '' : 's'}${skipped ? ` (${skipped} left unnamed)` : ''}, ${svMap.length} service${svMap.length === 1 ? '' : 's'} and ${rmMap.length} room${rmMap.length === 1 ? '' : 's'}?\n\nA copy of the current spa settings is saved first.`)) return;
  try {
    const { data, error } = await db.from('app_store').select('value,updated_at').eq('key', 'spa_data').maybeSingle(); if (error) throw error;
    const cur = JSON.parse(JSON.stringify((data && data.value) || SpaData)), stamp = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 16).replace(/[-:T]/g, '');
    await db.from('app_store').upsert({ key: 'spa_data_before_rebuild_' + stamp, value: cur, updated_at: new Date().toISOString() });
    cur.services = cur.services || []; cur.rooms = cur.rooms || []; cur.therapists = cur.therapists || [];
    svMap.forEach(m => { const s = cur.services.find(x => x.id === m.tpl); if (s && !cur.services.some(x => x.id === m.oldId)) s.id = m.oldId; });   // the default service takes the id the appointments use
    rmMap.forEach(m => { const r = cur.rooms.find(x => x.id === m.tpl); if (r && !cur.rooms.some(x => x.id === m.oldId)) r.id = m.oldId; });
    const offer = cur.services.filter(s => s.sessionType !== 'group').map(s => ({ serviceId: s.id, compensationType: 'percent', compensationValue: 0, compensationCurrency: 'MXN', effectiveFrom: new Date().toISOString() }));
    named.forEach(t => { if (cur.therapists.some(x => x.id === t.id)) return; const [first, ...rest] = t.name.split(/\s+/);
      cur.therapists.push({ id: t.id, firstName: first, lastName: rest.join(' '), email: '', phone: '', gender: t.gender, primaryCategory: 'massage', defaultRoomId: null, notes: 'Rebuilt 2026-11-05 from the appointments: check services and set the pay rates.', bio: '', photoDataUrl: null, active: true, services: offer.map(o => ({ ...o })) }); });
    const { error: e2 } = await db.from('app_store').upsert({ key: 'spa_data', value: cur, updated_at: new Date().toISOString() }); if (e2) throw e2;
    SpaData = cur;
    document.getElementById('srwOv').remove();
    if (typeof showToast === 'function') showToast('Spa therapists rebuilt. Set their services and pay rates in Spa > Therapists.');
    try { window.spaCalRender(); } catch (e) {}
  } catch (e) { alert('Could not rebuild: ' + (e.message || e)); }
}
(function () {
  if (typeof spaCalRender !== 'function') return;
  const orig = window.spaCalRender;
  window.spaCalRender = function () {
    const r = orig.apply(this, arguments);
    try {
      const p = document.getElementById('srlPanel');
      if (p && !document.getElementById('srwBtn') && !(typeof IS_SPA_STAFF_MODE !== 'undefined' && IS_SPA_STAFF_MODE)) p.insertAdjacentHTML('afterbegin', '<div style="margin-bottom:10px"><button id="srwBtn" onclick="srwOpen()" style="padding:9px 18px;background:#b91c1c;color:#fff;border:none;border-radius:10px;font-weight:700;font-family:inherit;font-size:13.5px;cursor:pointer">Rebuild the therapists from the appointments</button></div>');
    } catch (e) { console.warn('[spa rebuild wizard]', e); }
    return r;
  };
})();
