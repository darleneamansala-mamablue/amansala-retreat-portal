// ===== staffing-forecast.js — "Staffing Forecast": see weeks ahead when we will be short on staff (Darlene 2026-10-19) =====
// Replaces the Daily Staffing Alerts spreadsheet with a page inside the portal that reads the portal's own data:
//   arrivals / check-outs  = guests on the room list (registrations; each room's own check-in / check-out, else the booking's dates)
//   arrival HOUR at hotel  = the guest's landing time from the transport form + the transfer time (Cancun 2h20, Tulum 1h20, settings can change it)
//   guests with no flight time yet are counted as "time unknown" and flagged, never guessed
// From those it works out what each day NEEDS (extra bellboy, 2nd receptionist, check-out help, off-hours cover) using the rules in Settings, and each
// need has a "Covered by" box. A need nobody is covering is a GAP: red inside 14 days, amber inside 30. Gaps also show on the Dashboard.
// The rules start as my reading of the old sheet; every number is editable in Settings on the page. Standalone; own sidebar page + own app_store keys:
// 'staffing_forecast_cfg' (rules) and 'staffing_coverage' (who covers what, by date).
const SF_CFG_KEY = 'staffing_forecast_cfg', SF_COV_KEY = 'staffing_coverage';
const SF_DEFAULTS = {
  transferCancunMin: 140, transferTulumMin: 80,
  arrivalsBusy: 8, arrivalsVeryBusy: 15, checkoutsBusy: 10, checkoutsVeryBusy: 18,
  lateCutoffHour: 15, bellboyOverAfterCutoff: 12, receptionistOverPerHour: 4,
  offHoursBefore: 6, offHoursAfter: 21,
  redWithinDays: 14, amberWithinDays: 30, horizonDays: 60,
};
const SF_NEEDS = { bellboy: 'Extra bellboy', receptionist: '2nd receptionist', checkout: 'Check-out help', offhours: 'Off-hours cover' };
let sfCfg = { ...SF_DEFAULTS }, sfCov = {}, sfLoaded = false, sfShowQuiet = false, sfHorizon = null, sfSettingsOpen = false;

function sfEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function sfISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function sfAdd(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return sfISO(d); }
function sfHr(h) { h = ((h % 24) + 24) % 24; return ((h % 12) || 12) + (h >= 12 ? ' pm' : ' am'); }
function sfClock(min) { min = ((min % 1440) + 1440) % 1440; const h = Math.floor(min / 60), m = min % 60; return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM'); }
function sfMin(t) { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }

async function sfLoad() {
  try {
    const { data } = await db.from('app_store').select('key,value').in('key', [SF_CFG_KEY, SF_COV_KEY]);
    (data || []).forEach(r => { if (r.key === SF_CFG_KEY && r.value) sfCfg = { ...SF_DEFAULTS, ...r.value }; if (r.key === SF_COV_KEY && r.value) sfCov = r.value; });
  } catch (e) { console.warn('[staffing-forecast] load', e); }
  sfLoaded = true;
}
// read the latest, change one thing, write back (small keys; two people editing different dates never overwrite each other)
async function sfMutate(key, fn) {
  for (let i = 0; i < 8; i++) {
    const { data: row } = await db.from('app_store').select('value,updated_at').eq('key', key).maybeSingle();
    const next = fn(row && row.value && typeof row.value === 'object' ? JSON.parse(JSON.stringify(row.value)) : {});
    if (row) {
      const { data: upd, error } = await db.from('app_store').update({ value: next, updated_at: new Date().toISOString() }).eq('key', key).eq('updated_at', row.updated_at).select('key');
      if (error) throw error; if (upd && upd.length) return next;
    } else { const { error } = await db.from('app_store').insert({ key, value: next, updated_at: new Date().toISOString() }); if (error) throw error; return next; }
    await new Promise(r => setTimeout(r, 80 + Math.random() * 200));
  }
  throw new Error('busy');
}

// ---------- the numbers for one day ----------
function sfIndex() {
  const arrN = {}, outN = {}, subs = typeof loadTransport === 'function' ? loadTransport() : [];
  const bkById = {}; (AppData.bookings || []).forEach(b => { bkById[b.id] = b; });
  (AppData.regs || []).forEach(r => {
    if (r.cancelled) return;
    const bk = bkById[r.bookingId]; if (!bk || bk.status === 'cancelled' || (bk.flags || []).includes('archived')) return;
    const n = Math.max(1, (r.guests || []).length), a = String(r.checkIn || bk.startDate || '').slice(0, 10), o = String(r.checkOut || bk.endDate || '').slice(0, 10);
    if (a) arrN[a] = (arrN[a] || 0) + n; if (o) outN[o] = (outN[o] || 0) + n;
  });
  return { arrN, outN, subs: subs.filter(s => s.status !== 'cancelled') };
}
function sfDay(date, ix) {
  const c = sfCfg, hours = new Array(24).fill(0), d = { date, arrivals: ix.arrN[date] || 0, checkouts: ix.outN[date] || 0, hours, unknown: 0, firstPickup: null, off: [], needs: [], notes: [] };
  let known = 0, lastHr = -1, firstHr = 99;
  ix.subs.filter(s => s.arrivalDate === date).forEach(s => {
    const m = s.arrivalOT ? null : sfMin(s.arrivalTime); if (m == null) return;
    const t = m + (String(s.arrivalAirport || '').toLowerCase() === 'tulum' ? c.transferTulumMin : c.transferCancunMin), hr = Math.floor((((t % 1440) + 1440) % 1440) / 60);
    hours[hr]++; known++; if (t >= c.offHoursAfter * 60 || t < c.offHoursBefore * 60) d.off.push('Arrival ' + sfClock(t));
  });
  d.unknown = Math.max(0, d.arrivals - known);
  ix.subs.filter(s => s.departureDate === date).forEach(s => { const m = sfMin(s.departureTime); if (m != null) { if (d.firstPickup == null || m < d.firstPickup) d.firstPickup = m; } });
  if (d.firstPickup != null && d.firstPickup < c.offHoursBefore * 60) d.off.push('Pickup ' + sfClock(d.firstPickup));
  hours.forEach((n, h) => { if (n) { firstHr = Math.min(firstHr, h); lastHr = Math.max(lastHr, h); } });
  const afterCut = hours.slice(c.lateCutoffHour).reduce((a, b) => a + b, 0), maxHr = Math.max(0, ...hours), peak = hours.indexOf(maxHr);
  d.afterCut = afterCut; d.peakHour = maxHr ? peak : null; d.peakCount = maxHr;
  const need = (key, level, window, why) => d.needs.push({ key, level, window, why });
  const lateHrs = hours.map((n, h) => (n && h >= c.lateCutoffHour ? h : -1)).filter(h => h >= 0), bbWin = lateHrs.length ? sfHr(lateHrs[0]) + ' – ' + sfHr(lateHrs[lateHrs.length - 1] + 1) : (lastHr >= 0 ? sfHr(firstHr) + ' – ' + sfHr(lastHr + 1) : '');
  if (afterCut > c.bellboyOverAfterCutoff || d.arrivals >= c.arrivalsVeryBusy) need('bellboy', 'required', bbWin, d.arrivals >= c.arrivalsVeryBusy ? d.arrivals + ' guests arriving' : afterCut + ' guests arriving after ' + sfHr(c.lateCutoffHour));
  else if (afterCut === c.bellboyOverAfterCutoff || d.arrivals >= c.arrivalsBusy) need('bellboy', 'consider', bbWin, afterCut === c.bellboyOverAfterCutoff ? 'exactly ' + afterCut + ' after ' + sfHr(c.lateCutoffHour) + ' (rule is over ' + c.bellboyOverAfterCutoff + ')' : d.arrivals + ' guests arriving');
  if (maxHr > c.receptionistOverPerHour) { const hot = hours.map((n, h) => n > c.receptionistOverPerHour ? h : -1).filter(h => h >= 0); need('receptionist', 'required', sfHr(hot[0]) + ' – ' + sfHr(hot[hot.length - 1] + 1), maxHr + ' guests in one hour (' + sfHr(peak) + ')'); }
  else if (d.arrivals >= c.arrivalsBusy) need('receptionist', 'consider', lastHr >= 0 ? sfHr(firstHr) + ' – ' + sfHr(lastHr + 1) : '', d.arrivals + ' guests arriving');
  if (d.checkouts >= c.checkoutsVeryBusy) need('checkout', 'required', d.firstPickup != null ? 'from ' + sfClock(d.firstPickup) : '', d.checkouts + ' guests checking out');
  else if (d.checkouts >= c.checkoutsBusy) need('checkout', 'consider', d.firstPickup != null ? 'from ' + sfClock(d.firstPickup) : '', d.checkouts + ' guests checking out');
  if (d.off.length) need('offhours', 'required', d.off.join(', '), 'arrival or pickup outside ' + sfHr(c.offHoursBefore) + ' – ' + sfHr(c.offHoursAfter));
  if (d.arrivals && d.checkouts >= c.checkoutsBusy) d.notes.push('Crossover: ' + d.checkouts + ' check-outs and ' + d.arrivals + ' arrivals');
  if (d.unknown) d.notes.push(d.unknown + ' arriving guest' + (d.unknown === 1 ? ' has' : 's have') + ' no flight time yet, so the hours above are incomplete');
  d.level = lvl => (lvl === 'a' ? (d.arrivals >= c.arrivalsVeryBusy ? 2 : d.arrivals >= c.arrivalsBusy ? 1 : 0) : (d.checkouts >= c.checkoutsVeryBusy ? 2 : d.checkouts >= c.checkoutsBusy ? 1 : 0));
  return d;
}
function sfCovered(date, key) { return ((sfCov[date] || {})[key] || '').trim(); }
// every uncovered need ("required" ones are gaps; "consider" ones are shown but not counted)
function sfGaps(daysAhead) {
  const ix = sfIndex(), today = sfISO(new Date()), out = [];
  for (let i = 0; i <= daysAhead; i++) { const d = sfDay(sfAdd(today, i), ix); d.needs.filter(n => n.level === 'required' && !sfCovered(d.date, n.key)).forEach(n => out.push({ date: d.date, in: i, key: n.key, window: n.window })); }
  return out;
}

// ---------- page ----------
const SF_LV = ['', 'background:#fde7c7;color:#92400e', 'background:#fecaca;color:#991b1b'];
const SF_CV = ['', 'background:#dbeafe;color:#1e40af', 'background:#bfdbfe;color:#1e3a8a'];
function sfStaffList(cur) {
  try { if (typeof alStaff === 'function') return alStaff(cur); } catch (e) {}
  return cur ? [cur] : [];
}
async function sfRender() {
  const el = document.getElementById('sfBody'); if (!el) return;
  if (!sfLoaded) await sfLoad();
  const c = sfCfg, horizon = sfHorizon || c.horizonDays, today = sfISO(new Date()), ix = sfIndex(), days = [];
  for (let i = 0; i <= horizon; i++) days.push(sfDay(sfAdd(today, i), ix));
  const gaps = sfGaps(c.amberWithinDays), red = gaps.filter(g => g.in <= c.redWithinDays).length, amber = gaps.length - red;
  const unk = days.filter(d => d.unknown).reduce((n, d) => n + d.unknown, 0);
  const card = (n, l, col) => `<div style="background:#fff;border:1.5px solid ${col}55;border-radius:10px;padding:8px 16px;min-width:130px"><div style="font-size:22px;font-weight:700;color:${col}">${n}</div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7280">${l}</div></div>`;
  let html = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${card(red, 'Gaps in next ' + c.redWithinDays + ' days', red ? '#b91c1c' : '#166534')}${card(amber, 'More gaps to day ' + c.amberWithinDays, amber ? '#b45309' : '#166534')}${card(unk, 'Arrivals w/o flight time', unk ? '#b45309' : '#166534')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;font-size:13px">
      <span style="font-weight:700">Look ahead:</span>${[28, 60, 90, 180].map(n => `<button onclick="sfHorizon=${n};sfRender()" style="padding:5px 12px;border-radius:99px;border:1.5px solid ${horizon === n ? '#2d6a6a' : '#d6cfc4'};background:${horizon === n ? '#2d6a6a' : '#fff'};color:${horizon === n ? '#fff' : '#374151'};font-weight:700;font-size:12px;cursor:pointer">${n / 7 | 0} weeks</button>`).join('')}
      <label style="margin-left:10px"><input type="checkbox" ${sfShowQuiet ? 'checked' : ''} onchange="sfShowQuiet=this.checked;sfRender()"> show quiet days too</label>
      <span style="flex:1"></span><button onclick="sfSettingsOpen=!sfSettingsOpen;sfRender()" style="padding:5px 12px;border-radius:7px;border:1.5px solid #d6cfc4;background:#fff;font-weight:700;font-size:12px;cursor:pointer">${sfSettingsOpen ? 'Close' : 'Rules and settings'}</button></div>`;
  if (sfSettingsOpen) {
    const f = (k, l) => `<label style="display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:12.5px">${l}<input type="number" value="${c[k]}" onchange="sfSaveCfg('${k}',this.value)" style="width:70px;padding:5px 7px;border:1.5px solid #d6cfc4;border-radius:7px"></label>`;
    html += `<div style="background:#fff;border:1px solid #e8dfd4;border-radius:10px;padding:14px 16px;margin-bottom:14px"><div style="font-weight:700;margin-bottom:8px">Rules (these start as my reading of the old sheet, so please check them)</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:8px 24px">
      ${f('transferCancunMin', 'Cancun airport to hotel (minutes)')}${f('transferTulumMin', 'Tulum airport to hotel (minutes)')}
      ${f('arrivalsBusy', 'Busy arrival day (guests)')}${f('arrivalsVeryBusy', 'Very busy arrival day (guests) = extra bellboy')}
      ${f('checkoutsBusy', 'Busy check-out day (guests)')}${f('checkoutsVeryBusy', 'Very busy check-out day (guests) = check-out help')}
      ${f('lateCutoffHour', 'Bellboy: afternoon starts at (24h)')}${f('bellboyOverAfterCutoff', 'Bellboy needed if MORE than this many arrive after that')}
      ${f('receptionistOverPerHour', '2nd receptionist if MORE than this many arrive in one hour')}${f('offHoursBefore', 'Off-hours: before (24h)')}${f('offHoursAfter', 'Off-hours: after (24h)')}
      ${f('redWithinDays', 'Gap is RED within (days)')}${f('amberWithinDays', 'Gap is AMBER within (days)')}</div></div>`;
  }
  const rows = days.filter(d => sfShowQuiet || d.needs.length || d.notes.length || d.arrivals || d.checkouts);
  if (!rows.length) html += '<div style="padding:40px;text-align:center;color:#9ca3af;background:#fff;border-radius:10px">Nothing is booked in this period.</div>';
  const th = 'padding:7px 8px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7280;border-bottom:1.5px solid #e8dfd4;white-space:nowrap';
  html += `<div style="overflow-x:auto;background:#fff;border:1px solid #e8dfd4;border-radius:10px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th style="${th}">Date</th><th style="${th}">Arrivals</th><th style="${th}">Check-outs</th><th style="${th}">Arrivals by hour at hotel</th><th style="${th}">What we need and who covers it</th></tr></thead><tbody>`;
  rows.forEach((d, idx) => {
    const wd = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), inDays = Math.round((new Date(d.date + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000);
    const hrs = d.hours.map((n, h) => n ? `<span style="display:inline-block;margin:1px 3px 1px 0;padding:1px 7px;border-radius:6px;font-size:11.5px;font-weight:600;${n > c.receptionistOverPerHour ? 'background:#fed7aa;color:#9a3412' : 'background:#fef9c3;color:#854d0e'}">${sfHr(h)} · ${n}</span>` : '').join('') || '<span style="color:#9ca3af">—</span>';
    const needs = d.needs.map(n => {
      const cov = sfCovered(d.date, n.key), gap = n.level === 'required' && !cov, col = gap ? (inDays <= c.redWithinDays ? '#b91c1c' : inDays <= c.amberWithinDays ? '#b45309' : '#6b7280') : '#166534';
      const opts = ['', ...sfStaffList(cov)].filter((v, i, a) => a.indexOf(v) === i);
      return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:3px 0"><b style="min-width:122px;color:${col}">${n.level === 'consider' ? '(maybe) ' : ''}${SF_NEEDS[n.key]}</b><span style="min-width:130px;font-size:12px;color:#6b7280">${sfEsc(n.window)}</span>
        <select onchange="sfCover('${d.date}','${n.key}',this.value)" style="padding:4px 7px;border:1.5px solid ${gap ? col : '#d6cfc4'};border-radius:7px;font-size:12.5px;background:${gap ? '#fef2f2' : '#fff'}">${opts.map(o => `<option value="${sfEsc(o)}" ${o === cov ? 'selected' : ''}>${sfEsc(o || (n.level === 'required' ? '— nobody yet —' : '— not needed / nobody —'))}</option>`).join('')}</select>
        <span style="font-size:11.5px;color:#9ca3af">${sfEsc(n.why)}</span></div>`;
    }).join('');
    html += `<tr style="border-top:1px solid #f0ebe0;vertical-align:top"><td style="padding:8px;font-weight:700;white-space:nowrap">${sfEsc(wd)}<div style="font-size:11px;font-weight:500;color:#9ca3af">${inDays === 0 ? 'today' : 'in ' + inDays + ' days'}</div></td>
      <td style="padding:8px"><span style="padding:2px 9px;border-radius:99px;font-weight:700;${SF_LV[d.level('a')]}">${d.arrivals}</span></td><td style="padding:8px"><span style="padding:2px 9px;border-radius:99px;font-weight:700;${SF_CV[d.level('o')]}">${d.checkouts}</span>${d.firstPickup != null ? `<div style="font-size:11px;color:#6b7280">first pickup ${sfClock(d.firstPickup)}</div>` : ''}</td>
      <td style="padding:8px;min-width:200px">${hrs}${d.unknown ? `<div style="font-size:11.5px;color:#b45309;font-weight:600">+ ${d.unknown} time unknown</div>` : ''}</td>
      <td style="padding:8px;min-width:420px">${needs || '<span style="color:#9ca3af">Normal day, no extra staff needed</span>'}${d.notes.map(x => `<div style="font-size:11.5px;color:#92400e;margin-top:2px">&#9888; ${sfEsc(x)}</div>`).join('')}</td></tr>`;
  });
  el.innerHTML = html + '</tbody></table></div><div style="font-size:11.5px;color:#9ca3af;margin-top:10px">Guest counts come from the room list. Arrival hours come from guests\' transport forms (flight landing time + transfer time). Nobody is counted as arriving at an hour unless they gave a flight time. Who is actually scheduled to work is not connected to the portal yet, so "covered" means someone was named here.</div>';
}
async function sfCover(date, key, name) {
  try { sfCov = await sfMutate(SF_COV_KEY, v => { v[date] = v[date] || {}; if (name) v[date][key] = name; else delete v[date][key]; return v; }); showToast(name ? name + ' covers ' + SF_NEEDS[key] + '.' : 'Cleared.'); }
  catch (e) { showToast('Could not save. Try again.'); }
  sfRender();
}
async function sfSaveCfg(k, v) {
  const n = Number(v); if (!isFinite(n) || n < 0) return;
  try { sfCfg = { ...SF_DEFAULTS, ...(await sfMutate(SF_CFG_KEY, c => { c[k] = n; return c; })) }; showToast('Saved.'); } catch (e) { showToast('Could not save. Try again.'); }
  sfRender();
}
function sfOpen(btn) {
  const prev = localStorage.getItem('ama_last_tab');
  switchTab('staffingfc', btn);
  try { localStorage.setItem('ama_last_tab', prev || 'dashboard'); } catch (e) {}
  sfLoad().then(sfRender);
}
(function () {
  try {
    if (document.getElementById('tab-staffingfc')) return;
    const anchorPanel = document.getElementById('tab-dailyreports') || document.getElementById('tab-dailybrief') || document.getElementById('tab-menueditor'); if (!anchorPanel) return;
    const panel = document.createElement('div');
    panel.className = 'tab-panel'; panel.id = 'tab-staffingfc'; panel.style.flexDirection = 'column';
    panel.innerHTML = '<div class="panel-toolbar"><h2>Staffing Forecast</h2><div class="toolbar-right"><span style="font-size:12px;color:#7f8c9a">Weeks ahead: what each day needs, and who covers it.</span></div></div><div id="sfBody" style="flex:1;overflow-y:auto;padding:20px;background:#f0ece4"></div>';
    anchorPanel.parentElement.insertBefore(panel, anchorPanel.nextSibling);
    const btn = document.createElement('button');
    btn.className = 'tab-btn'; btn.id = 'staffingFcTabBtn'; btn.onclick = function () { sfOpen(btn); };
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><span class="tab-label">Staffing Forecast</span>';
    const a = document.getElementById('dailyReportsTabBtn') || document.getElementById('dailyBriefTabBtn');
    if (a) a.parentElement.insertBefore(btn, a.nextSibling); else anchorPanel.parentElement.appendChild(btn);
    // dashboard banner: uncovered needs in the next 14 days
    if (typeof buildDashboard === 'function' && !window._sfDashWrapped) {
      window._sfDashWrapped = true; const orig = buildDashboard;
      window.buildDashboard = buildDashboard = function () {
        const r = orig.apply(this, arguments);
        try {
          const el = document.getElementById('dbContent'); if (!el) return r;
          const old = document.getElementById('sfDashCard'); if (old) old.remove();
          if (!sfLoaded) { sfLoad().then(() => { try { buildDashboard(); } catch (e) {} }); return r; }
          const g = sfGaps(sfCfg.redWithinDays), c = document.createElement('div'); c.id = 'sfDashCard';
          c.style.cssText = `display:flex;gap:12px;flex-wrap:wrap;align-items:center;background:${g.length ? '#fef2f2' : '#f0fdf4'};border:1.5px solid ${g.length ? '#fca5a5' : '#bbf7d0'};border-radius:12px;padding:12px 18px;margin-bottom:18px`;
          c.innerHTML = `<div style="flex:1;min-width:220px"><div style="font-weight:700;font-size:15px;color:${g.length ? '#991b1b' : '#166534'}">${g.length ? g.length + ' staffing gap' + (g.length === 1 ? '' : 's') + ' in the next ' + sfCfg.redWithinDays + ' days' : 'Staffing covered for the next ' + sfCfg.redWithinDays + ' days'}</div>
            <div style="font-size:12.5px;color:#6b7280">${g.slice(0, 4).map(x => new Date(x.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + SF_NEEDS[x.key]).join(' · ')}${g.length > 4 ? ' · …' : ''}</div></div>
            <button class="btn btn-secondary" onclick="sfOpen(document.getElementById('staffingFcTabBtn'))">Open Staffing Forecast</button>`;
          el.insertBefore(c, el.firstChild);
        } catch (e) { console.warn('[staffing-forecast]', e); }
        return r;
      };
    }
  } catch (e) { console.warn('[staffing-forecast]', e); }
})();
