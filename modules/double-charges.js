// ===== double-charges.js — Report and alert for charges posted twice on a room =====
// Loaded as a classic script AFTER booking-detail.js and admin-staff.js; shares global scope. Standalone: adds a "Double Charges" tab
// to the sidebar (same opener pattern as daily-reports.js) and a red count on it. Read-only: it never deletes or edits a charge — staff
// open the booking and remove the extra one there, or press "It's correct" to hide a legitimate repeat.
// What counts as doubled: two or more lines on the SAME folio with the same text, the same total, and the same day (or, when the text
// carries a service date like "Departure Transport 2026-10-23", the same service date whatever day they were posted). Lines posted
// within 2 minutes of each other are marked "Likely mistake" (a system or double-click repeat); anything slower is "Check" because a
// guest can legitimately buy the same item twice. Looks at the folio_items table plus the older charges lists on registrations and
// bookings. Real case 2026-10-21: auto-charge-transport posted Departure Transport twice, seconds apart, on ten folios.
let dcState = { days: 30, showDismissed: false, groups: [], dismissed: {}, loading: false, loadedAt: 0, error: '' };
const DC_KEY = 'doubleChargesDismissed', DC_SEEN = 'amansala_dc_seen';

const dcEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dcNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const dcMoney = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
function dcTime(iso) { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'America/Cancun' }); } catch (e) { return iso || ''; } }

async function dcFetchAll(table, build) {
  const out = [];
  for (let from = 0; from < 30000; from += 1000) {
    const { data, error } = await build(db.from(table)).range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function dcGroupKey(owner, desc, total, createdIso) {
  const d = dcNorm(desc), hasServiceDate = /\d{4}-\d{2}-\d{2}/.test(d);
  return [owner, d, total, hasServiceDate ? '' : String(createdIso || '').slice(0, 10)].join('|');
}
function dcAdd(map, key, base, line) { (map[key] = map[key] || { base, lines: [] }).lines.push(line); }

async function dcScan() {
  const since = new Date(Date.now() - dcState.days * 86400000).toISOString();
  const [items, folios] = await Promise.all([
    dcFetchAll('folio_items', q => q.select('*').gte('created_at', since).order('created_at', { ascending: false }).order('id')),
    dcFetchAll('folios', q => q.select('id,registration_id,guest_name,status').order('id')),
  ]);
  const folioById = {}; folios.forEach(f => { folioById[f.id] = f; });
  const regById = {}; (AppData.regs || []).forEach(r => { regById[r.id] = r; });
  const map = {};
  items.forEach(i => {
    const total = Math.round((Number(i.qty) || 1) * (Number(i.unit_price) || 0) * 100) / 100; if (!total) return;
    const f = folioById[i.folio_id] || {}, reg = regById[f.registration_id];
    dcAdd(map, dcGroupKey('f:' + i.folio_id, i.description, total, i.created_at), { src: 'folio', total, desc: i.description, category: i.category, regId: f.registration_id, guest: f.guest_name, room: reg ? reg.room : '?' }, { at: i.created_at, staff: i.staff_name || '' });
  });
  // Older charge lists kept on the registration / booking itself
  const legacy = (owner, list, base) => (list || []).forEach(c => {
    const total = Math.round((Number(c.amount) || 0) * 100) / 100, at = c.addedAt || (c.date ? c.date + 'T12:00:00Z' : ''); if (!total || (at && at < since)) return;
    dcAdd(map, dcGroupKey(owner, c.description, total, at || c.date), Object.assign({ src: 'legacy', total, desc: c.description, category: c.category }, base), { at, staff: c.addedBy || '' });
  });
  (AppData.regs || []).forEach(r => legacy('r:' + r.id, r.charges, { regId: r.id, guest: ((r.guests || []).find(g => g.name) || {}).name || '', room: r.room }));
  (AppData.bookings || []).forEach(b => legacy('b:' + b.id, b.charges, { regId: null, guest: b.leaderName || '', room: (b.blockedRooms || [])[0] || '' }));
  const groups = [];
  Object.entries(map).forEach(([key, g]) => {
    if (g.lines.length < 2) return;
    const times = g.lines.map(l => Date.parse(l.at)).filter(t => !isNaN(t)), gap = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 1000 : null;
    groups.push(Object.assign({ key, count: g.lines.length, extra: Math.round(g.base.total * (g.lines.length - 1) * 100) / 100, lines: g.lines.sort((a, b) => String(a.at).localeCompare(String(b.at))), gap, likely: gap != null && gap <= 120 }, g.base));
  });
  // Transport charged more times than the room has guests (Arrival / Departure, per folio). The same-text check above misses these because the lines
  // read differently ("Departure Cancun airport 6 or + Sharing" 2 x $45 plus two "Departure Transport 2026-10-23 — CANCUN 14:25 (adjusted)" lines, or two
  // adjusted lines at different times and prices). Real case 2026-10-22: a regroup at 7:10 PM posted a second departure charge on about ten folios.
  const tByKey = {};
  items.forEach(i => {
    const d = String(i.description || '');
    ['Departure', 'Arrival'].forEach(dir => { if (/^transport/i.test(i.category || '') && d.startsWith(dir)) (tByKey[i.folio_id + '|' + dir] = tByKey[i.folio_id + '|' + dir] || []).push(i); });
  });
  Object.entries(tByKey).forEach(([k, v]) => {
    const [fid, dir] = k.split('|'), f = folioById[fid] || {}, reg = regById[f.registration_id], guests = Math.max(1, ((reg && reg.guests) || []).filter(g => g.name).length);
    const qty = v.reduce((s, i) => s + (Number(i.qty) || 1), 0); if (qty <= guests) return;
    const amounts = v.flatMap(i => Array.from({ length: Math.round(Number(i.qty) || 1) }, () => Number(i.unit_price) || 0)).sort((a, b) => a - b), excess = qty - guests;
    const extra = Math.round(amounts.slice(0, excess).reduce((s, x) => s + x, 0) * 100) / 100, total = Math.round(v.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unit_price) || 0), 0) * 100) / 100;
    const lines = v.map(i => ({ at: i.created_at, staff: '', note: `${i.description} (${Number(i.qty) || 1} × ${dcMoney(Number(i.unit_price) || 0)})` })).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const times = lines.map(l => Date.parse(l.at)).filter(t => !isNaN(t));
    groups.push({ key: 't:' + fid + '|' + dir, count: v.length, extra, lines, gap: times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 1000 : null, likely: false, src: 'folio', total,
      desc: `${dir} transport charged ${qty} time${qty !== 1 ? 's' : ''} for ${guests} guest${guests !== 1 ? 's' : ''}`, category: 'Transport', regId: f.registration_id, guest: f.guest_name, room: reg ? reg.room : '?' });
  });
  // The same restaurant ticket number ("consumo restaurante folio:172246") charged more than once, on one room or on two. Equal amounts = the same bill posted twice
  // (Likely mistake); different amounts usually mean a mistyped ticket number (Check).
  const byTicket = {};
  items.forEach(i => { const m = /^restaurant/i.test(i.category || '') && String(i.description || '').match(/folio\D{0,3}(\d{5,6})/i); if (m) (byTicket[m[1]] = byTicket[m[1]] || []).push(i); });
  Object.entries(byTicket).forEach(([ticket, v]) => {
    if (v.length < 2) return;
    const amt = i => Math.round((Number(i.qty) || 1) * (Number(i.unit_price) || 0) * 100) / 100, first = v.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
    const f = folioById[first.folio_id] || {}, reg = regById[f.registration_id], same = v.every(i => amt(i) === amt(first));
    const lines = v.map(i => { const fo = folioById[i.folio_id] || {}, r = regById[fo.registration_id]; return { at: i.created_at, staff: '', note: `Room ${r ? r.room : '?'} ${fo.guest_name || ''} ${dcMoney(amt(i))}` }; }).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const times = lines.map(l => Date.parse(l.at)).filter(t => !isNaN(t));
    groups.push({ key: 'k:' + ticket, count: v.length, extra: Math.min(...v.map(amt)) * (v.length - 1), lines, gap: times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 1000 : null, likely: same, src: 'folio', total: amt(first),
      desc: `Restaurant ticket ${ticket} charged ${v.length} times${same ? '' : ' (amounts differ — check the ticket number)'}`, category: 'Restaurant', regId: f.registration_id, guest: f.guest_name, room: reg ? reg.room : '?' });
  });
  groups.sort((a, b) => (b.likely - a.likely) || b.extra - a.extra);
  return groups;
}

async function dcLoadDismissed() {
  try { const { data } = await db.from('app_store').select('value').eq('key', DC_KEY).maybeSingle(); dcState.dismissed = (data && data.value) || {}; } catch (e) {}
}
async function dcSetDismissed(key, on) {
  await dcLoadDismissed(); // re-read first so two people's clicks don't overwrite each other
  if (on) dcState.dismissed[key] = { by: (getCurrentSession() || {}).name || 'Staff', at: new Date().toISOString(), n: ((dcState.groups.find(g => g.key === key) || {}).count) || null }; else delete dcState.dismissed[key];
  try { const { error } = await db.from('app_store').upsert({ key: DC_KEY, value: dcState.dismissed, updated_at: new Date().toISOString() }); if (error) throw error; }
  catch (e) { showToast('Could not save — try again.'); return; }
  dcBadge(); dcRender();
}
function dcDismiss(i, on) { const g = dcVisibleAll()[i]; if (g) dcSetDismissed(g.key, on); }
// "It's correct" only covers the lines that existed when it was pressed. A dismissal remembers how many lines the group had (n); if another
// identical line is posted later the group comes back. Older dismissals (no n) hide only groups whose lines were all posted before that click
// (future-dated lines such as spa charges are ignored). Real case 2026-10-22: dismissals made earlier in the day kept hiding brand-new double
// Departure Transport lines because the dismissal key is the same text on the same folio.
function dcIsDismissed(g) {
  const d = dcState.dismissed[g.key]; if (!d) return false;
  if (d.n != null) return g.count <= d.n;
  const now = Date.now(), t = g.lines.map(l => Date.parse(l.at)).filter(x => !isNaN(x) && x <= now);
  return !t.length || Math.max(...t) <= Date.parse(d.at || 0);
}
const dcVisibleAll = () => dcState.groups.filter(g => dcState.showDismissed || !dcIsDismissed(g));
const dcOpenCount = () => dcState.groups.filter(g => !dcIsDismissed(g)).length;

function dcBadge() {
  const b = document.getElementById('dcBadge'); if (!b) return;
  const n = dcOpenCount(); b.textContent = n; b.style.display = n ? 'inline-block' : 'none';
}
async function dcRefresh(quiet) {
  if (dcState.loading) return; dcState.loading = true; dcState.error = '';
  try { await dcLoadDismissed(); dcState.groups = await dcScan(); dcState.loadedAt = Date.now(); }
  catch (e) { console.warn('[double charges] scan failed', e); dcState.error = e.message || String(e); }
  dcState.loading = false; dcBadge(); dcRender();
  if (!quiet) return;
  // Alert once per new doubled charge, so the same one doesn't pop up every half hour
  let seen = []; try { seen = JSON.parse(localStorage.getItem(DC_SEEN) || '[]'); } catch (e) {}
  const fresh = dcState.groups.filter(g => !dcIsDismissed(g) && !seen.includes(g.key + '#' + g.count));
  if (fresh.length) {
    try { localStorage.setItem(DC_SEEN, JSON.stringify([...new Set([...seen, ...fresh.map(g => g.key + '#' + g.count)])].slice(-500))); } catch (e) {}
    showToast(`⚠ ${fresh.length} possible double charge${fresh.length !== 1 ? 's' : ''} on rooms (${fresh.slice(0, 3).map(g => 'Room ' + g.room).join(', ')}${fresh.length > 3 ? '…' : ''}) — see Double Charges.`);
  }
}

function dcRender() {
  const el = document.getElementById('dcContent'); if (!el) return;
  const rows = dcVisibleAll(), open = rows.filter(g => !dcIsDismissed(g)), extra = open.reduce((s, g) => s + g.extra, 0);
  const btn = 'padding:6px 12px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;font-size:12.5px';
  el.innerHTML = `<div style="max-width:1150px;margin:0 auto;font-family:'Jost',sans-serif;color:#2d2520;text-align:left">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div><div style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600">Double Charges</div>
        <div style="font-size:12.5px;color:#6b7280">Charges posted more than once on the same room. Open the booking to remove the extra one. Checked every 30 minutes.</div></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select onchange="dcState.days=+this.value;dcRefresh()" style="${btn}">${[7, 14, 30, 60, 90].map(d => `<option value="${d}"${d === dcState.days ? ' selected' : ''}>Last ${d} days</option>`).join('')}</select>
        <label style="font-size:12px;cursor:pointer"><input type="checkbox" ${dcState.showDismissed ? 'checked' : ''} onchange="dcState.showDismissed=this.checked;dcRender()"> Show hidden</label>
        <button onclick="dcRefresh()" style="${btn}">${dcState.loading ? 'Checking…' : '↻ Check now'}</button>
      </div></div>
    ${dcState.error ? `<div style="margin-top:12px;padding:12px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:12.5px">Could not read the charges: ${dcEsc(dcState.error)}</div>` : ''}
    <div style="margin-top:14px;font-size:13px;font-weight:700">${open.length ? `${open.length} possible double charge${open.length !== 1 ? 's' : ''} · <span style="color:#dc2626">${dcMoney(extra)} charged extra</span>` : (dcState.loadedAt ? '<span style="color:#059669">No double charges found.</span>' : 'Checking…')}</div>
    <div style="margin-top:10px">${rows.map((g, i) => {
      const hidden = dcIsDismissed(g);
      return `<div style="background:#fff;border:1.5px solid ${g.likely && !hidden ? '#fecaca' : '#e8dfd4'};border-radius:12px;padding:12px 14px;margin-bottom:10px;${hidden ? 'opacity:.55' : ''}">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline">
          <div><b style="font-size:15px">Room ${dcEsc(g.room)}</b> · ${dcEsc(g.guest)} <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;margin-left:6px;${g.likely ? 'background:#fee2e2;color:#b91c1c' : 'background:#fef3c7;color:#92400e'}">${g.likely ? 'Likely mistake' : 'Check'}</span></div>
          <div style="font-weight:800;color:#dc2626">${/^[tk]:/.test(g.key) ? `charged ${dcMoney(g.total)}` : `${g.count} × ${dcMoney(g.total)}`} · extra ${dcMoney(g.extra)}</div></div>
        <div style="font-size:13px;margin-top:4px">${dcEsc(g.desc)}${g.category ? ` <span style="color:#8a7e74">(${dcEsc(g.category)})</span>` : ''}</div>
        <div style="font-size:11.5px;color:#6b7280;margin-top:4px">${g.lines.map(l => l.note ? `${dcTime(l.at)} · ${dcEsc(l.note)}` : `${dcTime(l.at)} · ${l.staff ? dcEsc(l.staff) : 'automatic'}`).join('  |  ')}${g.gap != null ? ` — ${g.gap < 120 ? Math.round(g.gap) + ' seconds apart' : (g.gap < 7200 ? Math.round(g.gap / 60) + ' minutes apart' : Math.round(g.gap / 3600) + ' hours apart')}` : ''}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          ${g.regId ? `<button onclick="openBookingDetailForReg('${dcEsc(g.regId)}','${dcEsc(g.guest).replace(/'/g, "\\'")}')" style="${btn};background:var(--teal,#2d6a6a);color:#fff;border-color:var(--teal,#2d6a6a)">Open booking</button>` : ''}
          <button onclick="dcDismiss(${i},${hidden ? 'false' : 'true'})" style="${btn}">${hidden ? 'Show again' : "It's correct — hide"}</button></div></div>`;
    }).join('')}</div></div>`;
}

function dcOpen(btn) {
  const prev = localStorage.getItem('ama_last_tab');
  switchTab('doublecharges', btn);
  try { localStorage.setItem('ama_last_tab', prev || 'dashboard'); } catch (e) {}
  dcRender(); dcRefresh();
}

(function () {
  const side = document.getElementById('staffSideBtn'), reports = document.getElementById('tab-reports');
  if (!side || !reports || document.getElementById('tab-doublecharges')) return;
  const panel = document.createElement('div');
  panel.className = 'tab-panel'; panel.id = 'tab-doublecharges'; panel.style.flexDirection = 'column';
  panel.innerHTML = '<div id="dcContent" style="flex:1;overflow:auto;padding:28px 36px;background:#f5f1eb"></div>';
  reports.parentNode.insertBefore(panel, reports.nextSibling);
  const b = document.createElement('button');
  b.className = 'tab-btn tab-btn-sub'; b.id = 'doublechargesTabBtn'; b.setAttribute('onclick', 'dcOpen(this)'); b.style.color = '#ef4444';
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span class="tab-label">Double Charges</span><span id="dcBadge" style="display:none;margin-left:6px;background:#dc2626;color:#fff;border-radius:99px;font-size:10.5px;font-weight:700;padding:1px 7px"></span>';
  side.parentNode.insertBefore(b, side);
  // Background check: staff on the admin portal only (not spa-staff, teacher or driver views); first run after the data has loaded
  const adminOk = () => !(typeof IS_SPA_STAFF_MODE !== 'undefined' && IS_SPA_STAFF_MODE) && typeof getCurrentSession === 'function' && getCurrentSession();
  const tick = () => { if (adminOk() && (AppData.regs || []).length) dcRefresh(true); };
  setTimeout(tick, 12000); setInterval(tick, 30 * 60 * 1000);
})();
