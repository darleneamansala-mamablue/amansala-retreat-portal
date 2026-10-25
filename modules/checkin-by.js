// ===== checkin-by.js — who checked each guest in, by the account that was signed in =====
// Loaded as a classic script AFTER reservations.js, booking-detail.js and transport.js; shares global scope. Standalone. The portal only saved WHEN a guest was checked in
// (checked_in_at), never who did it. This wraps the three places a check-in happens (Reservations: resCheckIn, the booking screen: bdCheckIn, the Transport log: tr2ToggleCheckIn),
// and after each one saves { by, at } for that guest in app_store key checkin_log ({ [registration or request id]: { by, at } }). It then shows "Checked in by Cyan" under the guest's
// name on the Reservations lists, on the booking screen's Checked In badge, and as the hover text of the Transport log's check-in tick. Guests checked in before today have no
// record and read "who not recorded". At check-in a small form also asks whether an upgrade was offered (accepted / declined / not offered), whether the guest was shown options (and which), and a note; it is saved with the who/when and shown when you hover over the "Checked in by ..." line or the Transport tick. Nothing else about check-in changes. Asked by Darlene 2026-10-24: "we need to see who checked the person in ... based on how they are in the system".
let ciLog = {}, ciLoadedAt = 0, ciLoading = false;
const CI_KEY = 'checkin_log';
const ciEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const ciMe = () => (typeof getCurrentSession === 'function' && (getCurrentSession() || {}).name) || '';
const ciWhen = iso => { try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Cancun', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };

async function ciLoad(force) {
  if (ciLoading || (!force && Date.now() - ciLoadedAt < 30000)) return;
  ciLoading = true;
  try { const { data } = await db.from('app_store').select('value').eq('key', CI_KEY).maybeSingle(); ciLog = (data && data.value && typeof data.value === 'object') ? data.value : {}; ciLoadedAt = Date.now(); } catch (e) {}
  ciLoading = false;
}
// Re-read the saved log, change only this guest's entry, write it back (two people checking in different guests never overwrite each other)
async function ciRecord(id, on, at, info) {
  try {
    const { data } = await db.from('app_store').select('value').eq('key', CI_KEY).maybeSingle();
    const all = (data && data.value && typeof data.value === 'object') ? data.value : {};
    if (on) all[id] = Object.assign({ by: ciMe() || 'Staff', at: at || new Date().toISOString() }, info || {}); else delete all[id];
    const { error } = await db.from('app_store').upsert({ key: CI_KEY, value: all, updated_at: new Date().toISOString() }); if (error) throw error;
    ciLog = all; ciLoadedAt = Date.now();
  } catch (e) { console.warn('[checkin-by] could not save who checked in', e); }
}
const CI_UP = { accepted: 'accepted', declined: 'declined', none: 'not offered' };
function ciDetail(id) {
  const r = ciLog[id]; if (!r) return '';
  const parts = [];
  if (r.upgrade) parts.push('Upgrade: ' + (CI_UP[r.upgrade] || r.upgrade));
  if (r.shown) parts.push('Options shown: ' + (r.shown === 'yes' ? 'yes' : 'no') + (r.options ? ' (' + r.options + ')' : ''));
  if (r.note) parts.push('Note: ' + r.note);
  return parts.join(' · ');
}
// The check-in form: upgrade offered?, options shown (which?), note. Resolves { upgrade, shown, options, note } or null when cancelled.
function ciAsk(name) {
  return new Promise(resolve => {
    const m = document.createElement('div');
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100001;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Jost,sans-serif';
    const radio = (n, v, l) => `<label style="margin-right:14px;font-size:13px;cursor:pointer"><input type="radio" name="${n}" value="${v}"> ${l}</label>`;
    const inp = 'width:100%;padding:8px 10px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:inherit;font-size:13px';
    m.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:460px;width:100%;max-height:92vh;overflow:auto;padding:22px 24px;box-shadow:0 12px 40px rgba(0,0,0,.3)">
      <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;margin-bottom:2px">Check in ${ciEsc(name || 'guest')}</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:14px">Optional. Saved with who checked them in; hover over the check-in later to read it.</div>
      <div style="font-size:12px;font-weight:700;margin-bottom:5px">Was an upgrade offered?</div><div style="margin-bottom:12px">${radio('ciUp', 'accepted', 'Accepted')}${radio('ciUp', 'declined', 'Declined')}${radio('ciUp', 'none', 'Not offered')}</div>
      <div style="font-size:12px;font-weight:700;margin-bottom:5px">Were they shown room options?</div><div style="margin-bottom:6px">${radio('ciShown', 'yes', 'Yes')}${radio('ciShown', 'no', 'No')}</div>
      <input id="ciOptions" type="text" placeholder="Which options (e.g. Beachfront King +$80, Garden Plus)" style="${inp};margin-bottom:12px">
      <div style="font-size:12px;font-weight:700;margin-bottom:5px">Note</div><input id="ciNote" type="text" placeholder="e.g. declined the upgrade, wants a late checkout" style="${inp};margin-bottom:16px">
      <div style="display:flex;gap:10px;justify-content:flex-end"><button id="ciCancel" style="padding:9px 16px;border:1.5px solid #c8bfb5;border-radius:9px;background:#fff;cursor:pointer;font-family:inherit">Cancel</button><button id="ciGo" style="padding:9px 18px;border:none;border-radius:9px;background:#0d9488;color:#fff;font-weight:700;cursor:pointer;font-family:inherit">Check in</button></div></div>`;
    document.body.appendChild(m);
    const val = n => (m.querySelector(`input[name="${n}"]:checked`) || {}).value || '';
    m.querySelector('#ciCancel').onclick = () => { m.remove(); resolve(null); };
    m.querySelector('#ciGo').onclick = () => { const info = {}, u = val('ciUp'), sh = val('ciShown'), o = (m.querySelector('#ciOptions').value || '').trim(), n = (m.querySelector('#ciNote').value || '').trim(); if (u) info.upgrade = u; if (sh) info.shown = sh; else if (o) info.shown = 'yes'; if (o) info.options = o; if (n) info.note = n; m.remove(); resolve(info); };
  });
}
const ciGuestName = id => { try { const r = AppData.regs.find(x => x.id === id); if (r) return (((r.guests || []).find(g => g.name) || {}).name) || ''; const q = typeof _resRequests !== 'undefined' ? _resRequests.find(x => x.id === id) : null; return q ? (q.name || [q.firstName, q.lastName].filter(Boolean).join(' ')) : ''; } catch (e) { return ''; } };
const ciLabel = (id, checkedInAt) => { const r = ciLog[id]; return r ? `Checked in by ${r.by}` : (checkedInAt ? 'Checked in · who not recorded' : ''); };

(function () {
  // 1. Record who, right after each check-in succeeds
  if (typeof resCheckIn === 'function') { const o = window.resCheckIn; window.resCheckIn = async function (type, id) {
    const info = await ciAsk(ciGuestName(id)); if (info === null) return;   // cancelled
    const r = await o.apply(this, arguments);
    try { const ent = type === 'individual' ? (typeof _resRequests !== 'undefined' ? _resRequests.find(x => x.id === id) : null) : AppData.regs.find(x => x.id === id); if (ent && ent.checkedInAt) { await ciRecord(id, true, ent.checkedInAt, info); setTimeout(ciDecorateRes, 50); } } catch (e) {}
    return r; }; }
  if (typeof bdCheckIn === 'function') { const o = window.bdCheckIn; window.bdCheckIn = async function () {
    const id = typeof _bdId !== 'undefined' ? _bdId : '';
    const info = await ciAsk(ciGuestName(id)); if (info === null) return;   // cancelled
    const r = await o.apply(this, arguments);
    try { const reg = AppData.regs.find(x => x.id === id), at = reg ? reg.checkedInAt : (typeof _bdReqCache !== 'undefined' && _bdReqCache ? _bdReqCache.checkedInAt : null); if (id && at) { await ciRecord(id, true, at, info); setTimeout(ciDecorateBd, 50); } } catch (e) {}
    return r; }; }
  if (typeof tr2ToggleCheckIn === 'function') { const o = window.tr2ToggleCheckIn; window.tr2ToggleCheckIn = async function (regId, on) {
    const info = on ? await ciAsk(ciGuestName(regId)) : {}; if (info === null) return;   // cancelled
    const r = await o.apply(this, arguments);
    try { const reg = AppData.regs.find(x => x.id === regId); if (reg) { if (on && reg.checkedInAt) await ciRecord(regId, true, reg.checkedInAt, info); else if (!on && !reg.checkedInAt) await ciRecord(regId, false); if (typeof tr2BuildView === 'function') tr2BuildView(); } } catch (e) {}
    return r; }; }

  // 2. Show it: Reservations lists, the booking screen badge, the Transport tick
  if (typeof _resRender === 'function') { const o = window._resRender; window._resRender = function () { const r = o.apply(this, arguments); ciLoad().then(() => { setTimeout(ciDecorateRes, 150); setTimeout(ciDecorateRes, 800); }); return r; }; }
  if (typeof _bdRender === 'function') { const o = window._bdRender; window._bdRender = function () { const r = o.apply(this, arguments); ciLoad().then(() => setTimeout(ciDecorateBd, 120)); return r; }; }
  if (typeof tr2RenderRow === 'function') { const o = window.tr2RenderRow; window.tr2RenderRow = function (e) {
    const html = o.apply(this, arguments);
    try { return e && e.regId && e.checkedIn ? html.replace('Checked in -- click to undo', ciEsc(ciLabel(e.regId, true) + (ciDetail(e.regId) ? ' · ' + ciDetail(e.regId) : '')) + ' -- click to undo') : html; } catch (err) { return html; } }; }
  setTimeout(() => ciLoad(true), 2500);
})();

function ciDecorateRes() {
  try {
    const rows = (typeof _resLastRows !== 'undefined' && _resLastRows) || [];
    document.querySelectorAll('tr[onclick*="_resOpenRowAt("]').forEach(tr => {
      if (tr.querySelector('.ciLine')) return;
      const m = (tr.getAttribute('onclick') || '').match(/_resOpenRowAt\((\d+)\)/); if (!m) return;
      const r = rows[+m[1]]; if (!r || !r.checkedInAt) return;
      const td = tr.children[2]; if (!td) return;
      const d = document.createElement('div'); d.className = 'ciLine';
      d.style.cssText = 'font-size:10.5px;font-weight:600;text-decoration:none;color:' + (ciLog[r.id] ? '#047857' : '#9ca3af');
      d.textContent = (ciLog[r.id] ? ciLabel(r.id, true) + ' · ' + ciWhen(ciLog[r.id].at) : ciLabel(r.id, true));
      if (ciDetail(r.id)) d.title = ciDetail(r.id);   // hover: upgrade / options / note
      td.appendChild(d);
    });
  } catch (e) {}
}
function ciDecorateBd() {
  try {
    const id = typeof _bdId !== 'undefined' ? _bdId : ''; if (!id) return;
    const subjCheckedIn = (AppData.regs.find(x => x.id === id) || {}).checkedInAt || (typeof _bdReqCache !== 'undefined' && _bdReqCache ? _bdReqCache.checkedInAt : null); if (!subjCheckedIn) return;
    const badge = [...document.querySelectorAll('span,div')].find(el => el.children.length === 0 && /^\s*Checked In\s*$/i.test(el.textContent || ''));
    if (!badge || badge.parentNode.querySelector('.ciLine')) return;
    const s = document.createElement('span'); s.className = 'ciLine'; s.style.cssText = 'margin-left:8px;font-size:11.5px;font-weight:600;opacity:.9';
    s.textContent = ciLabel(id, true) + (ciLog[id] ? ' · ' + ciWhen(ciLog[id].at) : ''); if (ciDetail(id)) s.title = ciDetail(id);
    badge.parentNode.insertBefore(s, badge.nextSibling);
  } catch (e) {}
}
