// ===== pending-charges.js — Daily list of charges still to be made: spa services and tours =====
// Loaded as a classic script AFTER spa.js, spa-calendar.js, spa-uncharged-report.js and activity-sheet.js; shares global scope.
// Standalone: adds a "Pending Charges" tab to the sidebar (same opener pattern as double-charges.js / daily-reports.js) with a red count.
// Two lists, grouped by day:
//  1. SPA services for Hotel Guests that are Confirmed/Completed but not posted to a room folio (online bookings stay PENDING when the room
//     number or name didn't match). Each shows why, with Charge / Edit buttons. Uses the same matching as the Charge button (spaUnchReason).
//  2. TOURS that went (guests pay per person; not Pre-Paid): front desk (Rubi, Rosy or Kike) marks "Charged" or "No charge needed". The mark
//     is saved with their name and time under app_store 'tourChargeMarks', so a tour that went and was never marked stays on the list.
// Asked by Darlene 2026-10-21 after spa tickets with a wrong room number / name went uncharged. Read-only for everything except the
// Charge button (existing spaChargeApptToRoom) and the tour marks.
let ppState = { days: 14, spa: [], tours: [], marks: {}, loading: false, loadedAt: 0, error: '' };
const PP_MARKS = 'tourChargeMarks', PP_SEEN = 'amansala_pp_seen';

const ppEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ppMoney = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const ppToday = () => { const d = new Date(Date.now() - 5 * 3600000); return d.toISOString().slice(0, 10); }; // Tulum date (UTC-5)
function ppDateLabel(ds) { try { return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }); } catch (e) { return ds; } }
function ppWhen(iso) { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Cancun' }); } catch (e) { return ''; } }

// ---- data ----
function ppSpaPending() {
  return (typeof SpaAppointments !== 'undefined' ? SpaAppointments : []).filter(a =>
    a.guestType === 'hotel' && !a.prepaid && !['POSTED', 'REVERSED', 'NOT_REQUIRED'].includes(a.folioStatus) && (a.status === 'CONFIRMED' || a.status === 'COMPLETED'))
    .map(a => ({ a, why: spaUnchReason(a) }));
}
function ppTours() {
  const today = ppToday(), from = new Date(Date.now() - 5 * 3600000 - ppState.days * 86400000).toISOString().slice(0, 10);
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
  ppRefresh(true); // recount
}
function ppMark(i, how) {
  const t = ppState.tours[i]; if (!t) return;
  ppSetMark(t.key, { by: (getCurrentSession() || {}).name || 'Staff', at: new Date().toISOString(), how, guests: t.guests, amount: t.amount });
}
function ppUnmark(i) { const t = ppState.tours[i]; if (t) ppSetMark(t.key, null); }

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
    }
    ppState.spa = ppSpaPending(); ppState.tours = ppTours(); ppState.loadedAt = Date.now();
  } catch (e) { console.warn('[pending charges] refresh failed', e); ppState.error = e.message || String(e); }
  ppState.loading = false; ppBadge(); ppRender();
  if (!background) return;
  const keys = [...ppState.spa.map(x => 's:' + x.a.id), ...ppState.tours.filter(t => !ppState.marks[t.key]).map(t => 't:' + t.key)];
  let seen = []; try { seen = JSON.parse(localStorage.getItem(PP_SEEN) || '[]'); } catch (e) {}
  const fresh = keys.filter(k => !seen.includes(k));
  if (fresh.length) {
    try { localStorage.setItem(PP_SEEN, JSON.stringify([...new Set([...seen, ...keys])].slice(-800))); } catch (e) {}
    showToast(`⚠ ${fresh.length} charge${fresh.length !== 1 ? 's' : ''} still to be made (${ppState.spa.length} spa, ${ppState.tours.filter(t => !ppState.marks[t.key]).length} tours) — see Pending Charges.`);
  }
}
const ppOpenCount = () => ppState.spa.length + ppState.tours.filter(t => !ppState.marks[t.key]).length;
function ppBadge() { const b = document.getElementById('ppBadge'); if (!b) return; const n = ppOpenCount(); b.textContent = n; b.style.display = n ? 'inline-block' : 'none'; }

// ---- screen ----
async function ppCharge(apptId) { await spaChargeApptToRoom(apptId); await ppRefresh(true); }
function ppRender() {
  const el = document.getElementById('ppContent'); if (!el) return;
  const today = ppToday(), btn = 'padding:6px 12px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;font-size:12.5px';
  const days = {};
  const day = d => (days[d] = days[d] || { spa: [], tours: [] });
  ppState.spa.forEach(x => day(x.a.date || 'No date').spa.push(x));
  ppState.tours.forEach((t, i) => day(t.date).tours.push({ t, i }));
  const order = Object.keys(days).sort((a, b) => (a === today ? -1 : b === today ? 1 : (a > today) === (b > today) ? (a > today ? a.localeCompare(b) : b.localeCompare(a)) : (a > today ? 1 : -1)));
  const openTours = ppState.tours.filter(t => !ppState.marks[t.key]);
  const spaRow = x => { const a = x.a, svc = (SpaData.services || []).find(s => s.id === a.serviceId), ther = (SpaData.therapists || []).find(t => t.id === a.therapistId);
    return `<div style="display:grid;grid-template-columns:70px 1.2fr 1.2fr 70px 1.8fr 150px;gap:10px;align-items:center;padding:8px 14px;border-top:1px solid #f0ebe0;font-size:12.5px">
      <span>${ppEsc(a.time || '')}</span><b>${ppEsc(a.clientName || '(no name)')}</b><span>${ppEsc(svc ? svc.name : 'Service')}${ther ? `<div style="font-size:11px;color:#8a7e74">${ppEsc(ther.firstName)}</div>` : ''}</span>
      <span>${ppEsc(a.guestRoom || a.roomNumber || '—')}</span><span style="color:${x.why.fixable ? '#0f766e' : '#b45309'}">${ppEsc(x.why.text)}</span>
      <span style="display:flex;gap:6px;justify-content:flex-end"><button onclick="spaApptShowForm('${ppEsc(a.id)}')" style="${btn};padding:4px 9px;font-size:11px">Edit</button>${x.why.fixable ? `<button onclick="ppCharge('${ppEsc(a.id)}')" style="${btn};padding:4px 9px;font-size:11px;border-color:#0d9488;background:#f0fdfa;color:#0f766e;font-weight:700">🧾 Charge</button>` : ''}</span></div>`; };
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
      <div style="display:flex;gap:8px;align-items:center"><select onchange="ppState.days=+this.value;ppRefresh(true)" style="${btn}">${[7, 14, 30, 60].map(d => `<option value="${d}"${d === ppState.days ? ' selected' : ''}>Tours: last ${d} days</option>`).join('')}</select>
        <button onclick="ppRefresh()" style="${btn}">${ppState.loading ? 'Checking…' : '↻ Refresh'}</button></div></div>
    ${ppState.error ? `<div style="margin-top:12px;padding:12px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:12.5px">Could not load: ${ppEsc(ppState.error)}</div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
      <div style="flex:1;min-width:200px;background:#fff;border:1.5px solid ${ppState.spa.length ? '#fcd34d' : '#e8dfd4'};border-radius:12px;padding:12px 16px"><div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#8a7e74">Spa not on a room</div><div style="font-size:22px;font-weight:800;color:${ppState.spa.length ? '#b45309' : '#059669'}">${ppState.spa.length}</div></div>
      <div style="flex:1;min-width:200px;background:#fff;border:1.5px solid ${openTours.length ? '#fcd34d' : '#e8dfd4'};border-radius:12px;padding:12px 16px"><div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#8a7e74">Tours not marked charged</div><div style="font-size:22px;font-weight:800;color:${openTours.length ? '#b45309' : '#059669'}">${openTours.length}</div><div style="font-size:11.5px;color:#6b7280">${openTours.length ? ppMoney(openTours.reduce((s, t) => s + t.amount, 0)) + ' to charge' : ''}</div></div></div>
    ${order.length ? order.map(d => { const g = days[d];
      return `<div style="margin-top:18px"><div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;border-bottom:1.5px solid #e8dfd4;padding-bottom:4px">${d === today ? 'Today · ' : (d > today ? 'Upcoming · ' : '')}${ppDateLabel(d)}</div>
        ${g.spa.length ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#8a7e74;margin:8px 0 2px">Spa services to charge to a room</div><div style="background:#fff;border:1px solid #e8dfd4;border-radius:10px;overflow:hidden">${g.spa.map(spaRow).join('')}</div>` : ''}
        ${g.tours.length ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#8a7e74;margin:8px 0 2px">Tours that went</div><div style="background:#fff;border:1px solid #e8dfd4;border-radius:10px;overflow:hidden">${g.tours.map(tourRow).join('')}</div>` : ''}</div>`; }).join('')
      : `<div style="margin-top:20px;padding:30px;text-align:center;color:#059669;background:#fff;border-radius:12px;border:1px solid #e8dfd4">${ppState.loadedAt ? 'Nothing pending — every spa service is on a room and every tour is marked.' : 'Checking…'}</div>`}</div>`;
}

function ppOpen(btn) {
  const prev = localStorage.getItem('ama_last_tab');
  switchTab('pendingcharges', btn);
  try { localStorage.setItem('ama_last_tab', prev || 'dashboard'); } catch (e) {}
  ppRender(); ppRefresh();
}

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
