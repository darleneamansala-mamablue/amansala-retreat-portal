// ===== pending-charges.js — Daily list of charges still to be made: spa services and tours =====
// Loaded as a classic script AFTER spa.js, spa-calendar.js, spa-uncharged-report.js and activity-sheet.js; shares global scope.
// Standalone: adds a "Pending Charges" tab to the sidebar (same opener pattern as double-charges.js / daily-reports.js) with a red count.
// Two lists, grouped by day:
//  1. SPA services for Hotel Guests that are Confirmed/Completed but not posted to a room folio (online bookings stay PENDING when the room
//     number or name didn't match). Each shows why, with Charge / Edit buttons. Uses the same matching as the Charge button (spaUnchReason).
//     Front desk can also press "Mark charged" (or "No charge needed") when a service was charged some other way; the mark keeps their name and the
//     time, takes it off the list and out of the count, and can be undone. Marks live next to the tour marks (key 'spa|<appointment id>').
//     Already charged by hand? Front desk often charges a service straight on the guest's room account without touching the appointment, so the appointment
//     stays "not posted". The page looks at the guest's Spa lines (same reservation, within a day of the service, naming the same treatment) and, when it finds one, leaves the service OFF the list and the count and shows a small grey "already on the room account" note. The Charge
//     buttons (here, in the Not Charged tab and on the Spa dashboard) now ask before charging a service that already has such a line, and the automatic charge
//     when an appointment is saved skips it and links the existing line instead, so a service is never charged twice.
//  2. TOURS that went (guests pay per person; not Pre-Paid): front desk (Rubi, Rosy or Kike) marks "Charged" or "No charge needed". The mark
//     is saved with their name and time under app_store 'tourChargeMarks', so a tour that went and was never marked stays on the list.
// Asked by Darlene 2026-10-21 after spa tickets with a wrong room number / name went uncharged. Read-only for everything except the
// Charge button (existing spaChargeApptToRoom) and the tour marks.
let ppState = { days: 14, spa: [], spaLines: [], tours: [], marks: {}, loading: false, loadedAt: 0, error: '' };
const PP_MARKS = 'tourChargeMarks', PP_SEEN = 'amansala_pp_seen';

const ppEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ppMoney = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const ppToday = () => { const d = new Date(Date.now() - 5 * 3600000); return d.toISOString().slice(0, 10); }; // Tulum date (UTC-5)
function ppDateLabel(ds) { try { return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }); } catch (e) { return ds; } }
function ppWhen(iso) { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Cancun' }); } catch (e) { return ''; } }

// ---- data ----
// The day range at the top of the page applies to everything: spa services on or after the cut-off date, and tours that went since then (0 = all time).
function ppFromDate() { return ppState.days ? new Date(Date.now() - 5 * 3600000 - ppState.days * 86400000).toISOString().slice(0, 10) : '0000-00-00'; }
// ---- already on the room account? ----
const ppNormTxt = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
async function ppFetchAll(table, build) {
  const out = [];
  for (let from = 0; from < 20000; from += 1000) { const { data, error } = await build(db.from(table)).range(from, from + 999); if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) break; }
  return out;
}
async function ppLoadSpaLines() {
  const since = new Date(Date.now() - 125 * 86400000).toISOString();
  const [folios, items] = await Promise.all([
    ppFetchAll('folios', q => q.select('id,registration_id,guest_name').order('id')),
    ppFetchAll('folio_items', q => q.select('id,folio_id,description,qty,unit_price,created_at').eq('category', 'Spa').gte('created_at', since).order('created_at').order('id')),
  ]);
  const fm = {}; folios.forEach(f => { fm[f.id] = f; });
  ppState.spaLines = items.filter(i => fm[i.folio_id]).map(i => ({ id: i.id, regId: fm[i.folio_id].registration_id, guest: fm[i.folio_id].guest_name, date: String(i.created_at).slice(0, 10), desc: i.description, price: Number(i.unit_price) || 0 }));
}
function ppLineMatches(a, line, svc, ther) {
  if (Math.abs((new Date(line.date + 'T12:00:00') - new Date(a.date + 'T12:00:00')) / 86400000) > 1) return false;
  const desc = ppNormTxt(line.desc), s = ppNormTxt(svc && svc.name);
  return !!(s && desc.includes(s)); // the line must name the same treatment: matching on therapist + price could hide a different service that was never charged
}
// Looks through a list of lines ({regId,guest,date,desc,price,id}) for this appointment's guest; also the older charges kept on a Room Only booking.
function ppFindCharged(a, lines) {
  try {
    const svc = (SpaData.services || []).find(s => s.id === a.serviceId), ther = (SpaData.therapists || []).find(t => t.id === a.therapistId);
    const { match, bkMatch } = spaResolveGuestForAppt(a);
    if (match) {
      const names = new Set([ppNormTxt(a.clientName), ppNormTxt(match.guest && match.guest.name)]);
      return (lines || []).find(l => l.regId === match.reg.id && names.has(ppNormTxt(l.guest)) && ppLineMatches(a, l, svc, ther)) || null;
    }
    if (bkMatch) {
      const cl = (bkMatch.bk.charges || []).filter(c => c.source === 'spa' || c.category === 'Spa').map(c => ({ id: c.id, date: String(c.date || c.addedAt || '').slice(0, 10), desc: c.description, price: Number(c.amount) || 0 }));
      return cl.find(l => l.date && ppLineMatches(a, l, svc, ther)) || null;
    }
  } catch (e) { console.warn('[pending charges] already-charged check failed', e); }
  return null;
}
// Fresh look at one guest's room account right before charging (not the cached list)
async function ppFreshCharged(a) {
  try {
    const { match } = spaResolveGuestForAppt(a);
    if (!match) return ppFindCharged(a, []);
    const { data: fol } = await db.from('folios').select('id,guest_name,registration_id').eq('registration_id', match.reg.id);
    const ids = (fol || []).map(f => f.id); if (!ids.length) return null;
    const d0 = new Date(a.date + 'T12:00:00'), lo = new Date(d0.getTime() - 2 * 86400000).toISOString(), hi = new Date(d0.getTime() + 3 * 86400000).toISOString();
    const { data: its } = await db.from('folio_items').select('id,folio_id,description,qty,unit_price,created_at').in('folio_id', ids).eq('category', 'Spa').gte('created_at', lo).lte('created_at', hi);
    const fm = {}; (fol || []).forEach(f => { fm[f.id] = f; });
    return ppFindCharged(a, (its || []).map(i => ({ id: i.id, regId: fm[i.folio_id].registration_id, guest: fm[i.folio_id].guest_name, date: String(i.created_at).slice(0, 10), desc: i.description, price: Number(i.unit_price) || 0 })));
  } catch (e) { console.warn('[pending charges] fresh check failed', e); return null; }
}

function ppSpaPending() {
  const from = ppFromDate();
  return (typeof SpaAppointments !== 'undefined' ? SpaAppointments : []).filter(a => (a.date || '') >= from &&
    a.guestType === 'hotel' && !a.prepaid && !['POSTED', 'REVERSED', 'NOT_REQUIRED'].includes(a.folioStatus) && (a.status === 'CONFIRMED' || a.status === 'COMPLETED'))
    .map(a => ({ a, why: spaUnchReason(a), done: ppFindCharged(a, ppState.spaLines) }));
}
function ppTours() {
  const today = ppToday(), from = ppFromDate();
  const tourIds = new Set([...(typeof TOUR_AO_IDS !== 'undefined' ? TOUR_AO_IDS : ['ao1', 'ao2', 'ao3', 'ao6', 'ao7']), 'ao16']);
  const aoMap = {}; (typeof ADD_ONS !== 'undefined' ? ADD_ONS : []).forEach(x => { aoMap[x.id] = x; });
  const out = [];
  (AppData.bookings || []).filter(b => b.status !== 'cancelled').forEach(bk => {
    const seen = new Set();
    (bk.retreatActivities || []).forEach(act => {
      const ds = (act.date || '').slice(0, 10);
      if (!act.aoId || !tourIds.has(act.aoId) || act.prepaid || !ds || ds > today || ds < from) return; // only tours that already went; prepaid ones need no charge
      const key = bk.id + '|' + act.aoId + '|' + ds; if (seen.has(key)) return; seen.add(key);
      const ao = typeof actAoFor === 'function' ? actAoFor(bk, aoMap[act.aoId] || { id: act.aoId, name: act.aoId, price: 0 }) : (aoMap[act.aoId] || { name: act.aoId, price: 0 });
      if (!(ao.price > 0)) return; // complimentary
      const sups = ((typeof actSheetSignups !== 'undefined' && actSheetSignups[bk.id]) || []).filter(s => (s.activities || []).includes(act.aoId));
      const names = sups.map(s => ((s.firstName || '') + ' ' + (s.lastName || '')).trim()).filter(Boolean);
      out.push({ key, date: ds, bkId: bk.id, group: bk.leaderName || bk.retreatName || 'Group', ao, time: act.time || '', guests: names.length, names, amount: names.length * ao.price });
    });
  });
  return out;
}

async function ppLoadMarks() { try { const { data } = await db.from('app_store').select('value').eq('key', PP_MARKS).maybeSingle(); ppState.marks = (data && data.value) || {}; } catch (e) {} }
async function ppSetMark(key, mark) {
  await ppLoadMarks(); // re-read first so two people marking different tours don't overwrite each other
  if (mark) ppState.marks[key] = mark; else delete ppState.marks[key];
  try { const { error } = await db.from('app_store').upsert({ key: PP_MARKS, value: ppState.marks, updated_at: new Date().toISOString() }); if (error) throw error; }
  catch (e) { showToast('Could not save — try again.'); return; }
  await ppRefresh(true); // recount
}
function ppMark(i, how) {
  const t = ppState.tours[i]; if (!t) return;
  return ppSetMark(t.key, { by: (getCurrentSession() || {}).name || 'Staff', at: new Date().toISOString(), how, guests: t.guests, amount: t.amount });
}
function ppUnmark(i) { const t = ppState.tours[i]; if (t) return ppSetMark(t.key, null); }
function ppSpaMark(id, how) { const x = ppState.spa.find(y => y.a.id === id); return ppSetMark('spa|' + id, { by: (getCurrentSession() || {}).name || 'Staff', at: new Date().toISOString(), how, client: x ? x.a.clientName : '' }); }
function ppSpaUnmark(id) { return ppSetMark('spa|' + id, null); }

async function ppRefresh(skipLoad, background) {
  if (ppState.loading) return; ppState.loading = true; ppState.error = '';
  try {
    if (!skipLoad) {
      const spaTabOpen = document.getElementById('tab-spa') && document.getElementById('tab-spa').classList.contains('active');
      await ppLoadMarks();
      if (!(background && spaTabOpen)) { // don't swap the appointment list under someone who is working in the spa calendar
        if (typeof spaLoad === 'function') await spaLoad();
        if (typeof spaCalLoad === 'function') await spaCalLoad();
      }
      if (typeof actSheetLoadSignups === 'function') await actSheetLoadSignups();
      try { await ppLoadSpaLines(); } catch (e) { console.warn('[pending charges] could not read room accounts', e); }
    }
    ppState.spa = ppSpaPending(); ppState.tours = ppTours(); ppState.loadedAt = Date.now();
  } catch (e) { console.warn('[pending charges] refresh failed', e); ppState.error = e.message || String(e); }
  ppState.loading = false; ppBadge(); ppRender();
  if (!background) return;
  const keys = [...ppSpaOpen().map(x => 's:' + x.a.id), ...ppState.tours.filter(t => !ppState.marks[t.key]).map(t => 't:' + t.key)];
  let seen = []; try { seen = JSON.parse(localStorage.getItem(PP_SEEN) || '[]'); } catch (e) {}
  const fresh = keys.filter(k => !seen.includes(k));
  if (fresh.length) {
    try { localStorage.setItem(PP_SEEN, JSON.stringify([...new Set([...seen, ...keys])].slice(-800))); } catch (e) {}
    showToast(`⚠ ${fresh.length} charge${fresh.length !== 1 ? 's' : ''} still to be made (${ppSpaOpen().length} spa, ${ppState.tours.filter(t => !ppState.marks[t.key]).length} tours) — see Pending Charges.`);
  }
}
const ppSpaOpen = () => ppState.spa.filter(x => !x.done && !ppState.marks['spa|' + x.a.id]);
const ppOpenCount = () => ppSpaOpen().length + ppState.tours.filter(t => !ppState.marks[t.key]).length;
function ppBadge() { const b = document.getElementById('ppBadge'); if (!b) return; const n = ppOpenCount(); b.textContent = n; b.style.display = n ? 'inline-block' : 'none'; }

// ---- screen ----
async function ppCharge(apptId) { await spaChargeApptToRoom(apptId); await ppRefresh(true); }
function ppRender() {
  const el = document.getElementById('ppContent'); if (!el) return;
  const today = ppToday(), btn = 'padding:6px 12px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;font-size:12.5px';
  const days = {};
  const day = d => (days[d] = days[d] || { spa: [], done: [], tours: [] });
  ppState.spa.forEach(x => (x.done ? day(x.a.date || 'No date').done : day(x.a.date || 'No date').spa).push(x));
  ppState.tours.forEach((t, i) => day(t.date).tours.push({ t, i }));
  const order = Object.keys(days).sort((a, b) => (a === today ? -1 : b === today ? 1 : (a > today) === (b > today) ? (a > today ? a.localeCompare(b) : b.localeCompare(a)) : (a > today ? 1 : -1)));
  const openTours = ppState.tours.filter(t => !ppState.marks[t.key]);
  const spaRow = x => { const a = x.a, svc = (SpaData.services || []).find(s => s.id === a.serviceId), ther = (SpaData.therapists || []).find(t => t.id === a.therapistId), m = ppState.marks['spa|' + a.id];
    const act = m
      ? `<span style="color:#15803d;font-weight:700">✓ ${m.how === 'none' ? 'No charge needed' : 'Charged'} — ${ppEsc(m.by)}</span> <span style="font-size:11px;color:#6b7280">${ppWhen(m.at)}</span> <button onclick="ppSpaUnmark('${ppEsc(a.id)}')" style="${btn};padding:2px 8px;font-size:11px">Undo</button>`
      : `<button onclick="spaApptShowForm('${ppEsc(a.id)}')" style="${btn};padding:4px 9px;font-size:11px">Edit</button>${x.why.fixable ? ` <button onclick="ppCharge('${ppEsc(a.id)}')" style="${btn};padding:4px 9px;font-size:11px;border-color:#0d9488;background:#f0fdfa;color:#0f766e;font-weight:700">🧾 Charge</button>` : ''} <button onclick="ppSpaMark('${ppEsc(a.id)}','charged')" style="${btn};padding:4px 9px;font-size:11px;font-weight:700">✓ Mark charged</button> <button onclick="ppSpaMark('${ppEsc(a.id)}','none')" style="${btn};padding:4px 9px;font-size:11px">No charge needed</button>`;
    return `<div style="display:grid;grid-template-columns:60px 1.1fr 1.1fr 60px 1.5fr 300px;gap:10px;align-items:center;padding:8px 14px;border-top:1px solid #f0ebe0;font-size:12.5px;${m ? 'background:#f0fdf4' : ''}">
      <span>${ppEsc(a.time || '')}</span><b>${ppEsc(a.clientName || '(no name)')}</b><span>${ppEsc(svc ? svc.name : 'Service')}${ther ? `<div style="font-size:11px;color:#8a7e74">${ppEsc(ther.firstName)}</div>` : ''}</span>
      <span>${ppEsc(a.guestRoom || a.roomNumber || '—')}</span><span style="color:${m ? '#6b7280' : x.why.fixable ? '#0f766e' : '#b45309'}">${m ? '' : ppEsc(x.why.text)}</span>
      <span style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;align-items:center">${act}</span></div>`; };
  const tourRow = ({ t, i }) => { const m = ppState.marks[t.key];
    return `<div style="display:grid;grid-template-columns:1.3fr 1.2fr 1.6fr 230px;gap:10px;align-items:center;padding:8px 14px;border-top:1px solid #f0ebe0;font-size:12.5px;${m ? 'background:#f0fdf4' : ''}">
      <b>${ppEsc(t.ao.name)}</b><span>${ppEsc(t.group)}${t.time ? ` <span style="color:#8a7e74">${ppEsc(t.time)}</span>` : ''}</span>
      <span>${t.guests ? `${t.guests} guest${t.guests !== 1 ? 's' : ''} × ${ppMoney(t.ao.price)} = <b>${ppMoney(t.amount)}</b><div style="font-size:11px;color:#8a7e74">${ppEsc(t.names.slice(0, 4).join(', '))}${t.names.length > 4 ? ' +' + (t.names.length - 4) + ' more' : ''}</div>` : '<span style="color:#b45309">no sign-ups recorded</span>'}</span>
      <span style="text-align:right">${m ? `<span style="color:#15803d;font-weight:700">✓ ${m.how === 'none' ? 'No charge needed' : 'Charged'} — ${ppEsc(m.by)}</span> <span style="font-size:11px;color:#6b7280">${ppWhen(m.at)}</span> <button onclick="ppUnmark(${i})" style="${btn};padding:2px 8px;font-size:11px">Undo</button>`
        : `<button onclick="ppMark(${i},'charged')" style="${btn};padding:4px 10px;font-size:11.5px;border-color:#0d9488;background:#f0fdfa;color:#0f766e;font-weight:700">✓ Mark charged</button> <button onclick="ppMark(${i},'none')" style="${btn};padding:4px 10px;font-size:11.5px">No charge needed</button>`}</span></div>`; };
  el.innerHTML = `<div style="max-width:1150px;margin:0 auto;font-family:'Jost',sans-serif;color:#2d2520;text-align:left">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div><div style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600">Pending Charges</div>
        <div style="font-size:12.5px;color:#6b7280">What still needs to be charged, day by day, so nothing is missed. Spa services not yet on a room, and tours that went. Rubi, Rosy or Kike: mark each tour once it's charged.</div></div>
      <div style="display:flex;gap:8px;align-items:center"><select onchange="ppState.days=+this.value;ppRefresh(true)" style="${btn}">${[7, 14, 30, 60, 0].map(d => `<option value="${d}"${d === ppState.days ? ' selected' : ''}>${d ? 'Last ' + d + ' days' : 'All time'}</option>`).join('')}</select>
        <button onclick="ppRefresh()" style="${btn}">${ppState.loading ? 'Checking…' : '↻ Refresh'}</button></div></div>
    ${ppState.error ? `<div style="margin-top:12px;padding:12px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:12.5px">Could not load: ${ppEsc(ppState.error)}</div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
      <div style="flex:1;min-width:200px;background:#fff;border:1.5px solid ${ppSpaOpen().length ? '#fcd34d' : '#e8dfd4'};border-radius:12px;padding:12px 16px"><div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#8a7e74">Spa not charged</div><div style="font-size:22px;font-weight:800;color:${ppSpaOpen().length ? '#b45309' : '#059669'}">${ppSpaOpen().length}</div></div>
      <div style="flex:1;min-width:200px;background:#fff;border:1.5px solid ${ppState.spa.some(x => x.done) ? '#bbf7d0' : '#e8dfd4'};border-radius:12px;padding:12px 16px"><div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#8a7e74">Spa already charged</div><div style="font-size:22px;font-weight:800;color:#059669">${ppState.spa.filter(x => x.done).length}</div><div style="font-size:11.5px;color:#6b7280">on room accounts, not counted</div></div>
      <div style="flex:1;min-width:200px;background:#fff;border:1.5px solid ${openTours.length ? '#fcd34d' : '#e8dfd4'};border-radius:12px;padding:12px 16px"><div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#8a7e74">Tours not marked charged</div><div style="font-size:22px;font-weight:800;color:${openTours.length ? '#b45309' : '#059669'}">${openTours.length}</div><div style="font-size:11.5px;color:#6b7280">${openTours.length ? ppMoney(openTours.reduce((s, t) => s + t.amount, 0)) + ' to charge' : ''}</div></div></div>
    ${ppState.spa.some(x => x.done) ? `<div style="margin-top:12px;padding:10px 14px;border-radius:10px;background:#f0fdf4;border:1.5px solid #bbf7d0;font-size:13px;color:#14532d"><b>✓ ${ppState.spa.filter(x => x.done).length} spa services</b> in this period <b>are actually already charged</b> on the room accounts (charged by hand before the appointment was updated), so they are not counted. They show in grey under each day.</div>` : ''}
    ${order.length ? order.map(d => { const g = days[d];
      return `<div style="margin-top:18px"><div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;border-bottom:1.5px solid #e8dfd4;padding-bottom:4px">${d === today ? 'Today · ' : (d > today ? 'Upcoming · ' : '')}${ppDateLabel(d)}</div>
        ${g.spa.length ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#8a7e74;margin:8px 0 2px">Spa services to charge</div><div style="background:#fff;border:1px solid #e8dfd4;border-radius:10px;overflow:hidden">${g.spa.map(spaRow).join('')}</div>` : ''}
        ${g.done.length ? `<div style="font-size:11.5px;color:#6b7280;margin:6px 2px 0">✓ Already on the room account (not counted): ${g.done.map(x => `${ppEsc(x.a.clientName)} — ${ppEsc(x.done.desc)}${x.done.price ? ' $' + x.done.price : ''}`).join(' · ')}</div>` : ''}
        ${g.tours.length ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#8a7e74;margin:8px 0 2px">Tours that went</div><div style="background:#fff;border:1px solid #e8dfd4;border-radius:10px;overflow:hidden">${g.tours.map(tourRow).join('')}</div>` : ''}</div>`; }).join('')
      : `<div style="margin-top:20px;padding:30px;text-align:center;color:#059669;background:#fff;border-radius:12px;border:1px solid #e8dfd4">${ppState.loadedAt ? 'Nothing pending — every spa service is on a room and every tour is marked.' : 'Checking…'}</div>`}</div>`;
}

function ppOpen(btn) {
  const prev = localStorage.getItem('ama_last_tab');
  switchTab('pendingcharges', btn);
  try { localStorage.setItem('ama_last_tab', prev || 'dashboard'); } catch (e) {}
  ppRender(); ppRefresh();
}

// ---- never charge a service twice ----
// Wraps the existing Charge action (Pending Charges, Not Charged tab, Spa dashboard, the automatic charge after saving a Confirmed hotel appointment).
// A manual click asks first; the automatic charge skips it and links the line that is already there.
(function () {
  if (typeof spaChargeApptToRoom !== 'function') return;
  const origCharge = window.spaChargeApptToRoom;
  window.spaChargeApptToRoom = async function (apptId, opts) {
    opts = opts || {};
    try {
      const a = (typeof SpaAppointments !== 'undefined' ? SpaAppointments : []).find(x => x.id === apptId);
      if (a && !a.prepaid && a.folioStatus !== 'POSTED') {
        const dup = await ppFreshCharged(a);
        if (dup) {
          if (opts.silent) { // automatic charge right after saving: do not post again, record the line that already exists
            a.folioStatus = 'POSTED'; a.folioItemId = dup.id; a.folioChargeId = dup.id;
            const m = spaResolveGuestForAppt(a).match; if (m) { a.folioRegId = m.reg.id; }
            if (typeof spaCalSave === 'function') await spaCalSave();
            if (typeof showToast === 'function') showToast(`Already on ${a.clientName}'s room account (${dup.desc}) — not charged again.`);
            return;
          }
          const svc = (SpaData.services || []).find(s => s.id === a.serviceId);
          if (!window.confirm(`⚠ ${a.clientName}'s room account already has "${dup.desc}"${dup.price ? ' ($' + dup.price + ')' : ''} for this day.\n\nCharge ${svc ? svc.name : 'this service'} AGAIN?\n\nOK = charge again anyway     Cancel = don't charge (it's already there)`)) {
            if (typeof showToast === 'function') showToast('Not charged — it is already on the room account. Use "Mark charged" to clear it from the list.');
            return;
          }
        }
      }
    } catch (e) { console.warn('[pending charges] duplicate check failed, charging as usual', e); }
    return origCharge.apply(this, arguments);
  };
})();

(function () {
  const side = document.getElementById('staffSideBtn'), reports = document.getElementById('tab-reports');
  if (!side || !reports || document.getElementById('tab-pendingcharges')) return;
  const panel = document.createElement('div');
  panel.className = 'tab-panel'; panel.id = 'tab-pendingcharges'; panel.style.flexDirection = 'column';
  panel.innerHTML = '<div id="ppContent" style="flex:1;overflow:auto;padding:28px 36px;background:#f5f1eb"></div>';
  reports.parentNode.insertBefore(panel, reports.nextSibling);
  const b = document.createElement('button');
  b.className = 'tab-btn tab-btn-sub'; b.id = 'pendingchargesTabBtn'; b.setAttribute('onclick', 'ppOpen(this)'); b.style.color = '#f59e0b';
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span class="tab-label">Pending Charges</span><span id="ppBadge" style="display:none;margin-left:6px;background:#d97706;color:#fff;border-radius:99px;font-size:10.5px;font-weight:700;padding:1px 7px"></span>';
  side.parentNode.insertBefore(b, side);
  const adminOk = () => !(typeof IS_SPA_STAFF_MODE !== 'undefined' && IS_SPA_STAFF_MODE) && typeof getCurrentSession === 'function' && getCurrentSession();
  const tick = () => { if (adminOk() && (AppData.bookings || []).length) ppRefresh(false, true); };
  setTimeout(tick, 15000); setInterval(tick, 30 * 60 * 1000);
})();
