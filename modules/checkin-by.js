// ===== checkin-by.js — who checked each guest in, by the account that was signed in =====
// Loaded as a classic script AFTER reservations.js, booking-detail.js and transport.js; shares global scope. Standalone. The portal only saved WHEN a guest was checked in
// (checked_in_at), never who did it. This wraps the three places a check-in happens (Reservations: resCheckIn, the booking screen: bdCheckIn, the Transport log: tr2ToggleCheckIn),
// and after each one saves { by, at } for that guest in app_store key checkin_log ({ [registration or request id]: { by, at } }). It then shows "Checked in by Cyan" under the guest's
// name on the Reservations lists, on the booking screen's Checked In badge, and as the hover text of the Transport log's check-in tick. Guests checked in before today have no
// record and read "who not recorded". Nothing about check-in itself changes. Asked by Darlene 2026-10-24: "we need to see who checked the person in ... based on how they are in the system".
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
async function ciRecord(id, on, at) {
  try {
    const { data } = await db.from('app_store').select('value').eq('key', CI_KEY).maybeSingle();
    const all = (data && data.value && typeof data.value === 'object') ? data.value : {};
    if (on) all[id] = { by: ciMe() || 'Staff', at: at || new Date().toISOString() }; else delete all[id];
    const { error } = await db.from('app_store').upsert({ key: CI_KEY, value: all, updated_at: new Date().toISOString() }); if (error) throw error;
    ciLog = all; ciLoadedAt = Date.now();
  } catch (e) { console.warn('[checkin-by] could not save who checked in', e); }
}
const ciLabel = (id, checkedInAt) => { const r = ciLog[id]; return r ? `Checked in by ${r.by}` : (checkedInAt ? 'Checked in · who not recorded' : ''); };

(function () {
  // 1. Record who, right after each check-in succeeds
  if (typeof resCheckIn === 'function') { const o = window.resCheckIn; window.resCheckIn = async function (type, id) {
    const r = await o.apply(this, arguments);
    try { const ent = type === 'individual' ? (typeof _resRequests !== 'undefined' ? _resRequests.find(x => x.id === id) : null) : AppData.regs.find(x => x.id === id); if (ent && ent.checkedInAt) { await ciRecord(id, true, ent.checkedInAt); setTimeout(ciDecorateRes, 50); } } catch (e) {}
    return r; }; }
  if (typeof bdCheckIn === 'function') { const o = window.bdCheckIn; window.bdCheckIn = async function () {
    const id = typeof _bdId !== 'undefined' ? _bdId : '';
    const r = await o.apply(this, arguments);
    try { const reg = AppData.regs.find(x => x.id === id), at = reg ? reg.checkedInAt : (typeof _bdReqCache !== 'undefined' && _bdReqCache ? _bdReqCache.checkedInAt : null); if (id && at) { await ciRecord(id, true, at); setTimeout(ciDecorateBd, 50); } } catch (e) {}
    return r; }; }
  if (typeof tr2ToggleCheckIn === 'function') { const o = window.tr2ToggleCheckIn; window.tr2ToggleCheckIn = async function (regId, on) {
    const r = await o.apply(this, arguments);
    try { const reg = AppData.regs.find(x => x.id === regId); if (reg) { if (on && reg.checkedInAt) await ciRecord(regId, true, reg.checkedInAt); else if (!on && !reg.checkedInAt) await ciRecord(regId, false); if (typeof tr2BuildView === 'function') tr2BuildView(); } } catch (e) {}
    return r; }; }

  // 2. Show it: Reservations lists, the booking screen badge, the Transport tick
  if (typeof _resRender === 'function') { const o = window._resRender; window._resRender = function () { const r = o.apply(this, arguments); ciLoad().then(() => { setTimeout(ciDecorateRes, 150); setTimeout(ciDecorateRes, 800); }); return r; }; }
  if (typeof _bdRender === 'function') { const o = window._bdRender; window._bdRender = function () { const r = o.apply(this, arguments); ciLoad().then(() => setTimeout(ciDecorateBd, 120)); return r; }; }
  if (typeof tr2RenderRow === 'function') { const o = window.tr2RenderRow; window.tr2RenderRow = function (e) {
    const html = o.apply(this, arguments);
    try { return e && e.regId && e.checkedIn ? html.replace('Checked in -- click to undo', ciEsc(ciLabel(e.regId, true)) + ' -- click to undo') : html; } catch (err) { return html; } }; }
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
    s.textContent = ciLabel(id, true) + (ciLog[id] ? ' · ' + ciWhen(ciLog[id].at) : '');
    badge.parentNode.insertBefore(s, badge.nextSibling);
  } catch (e) {}
}
