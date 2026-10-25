// ===== spa-reports.js — Spa > Reports: pick a date range and a therapist, see who does the most services and who is requested most (Darlene 2026-10-25) =====
// Loaded as a classic script AFTER spa.js and spa-therapist-done.js; shares global scope. Standalone: adds a "Reports" button to the Spa tab and wraps spaSetView / spaRender (spa.js is not edited).
// Everything is read from the appointments and services already in the portal (SpaAppointments, SpaData); nothing is written.
//   Counting: "Done" = completed, or its time has passed and it was not cancelled / no-show / payment-pending (the same rule as Payroll, spaIsDone). "Requested" = the guest asked for that
//   therapist by name when booking online (therapistPreference type "specific"). Revenue = the service's list price in USD (services without a price count as 0), so it is an estimate.
//   Team view: all therapists side by side (table + bar chart you can switch between Services done / Requested / Hours / Revenue); click a therapist for their own report (by service, by week,
//   busiest days and times, requests, cancellations). Print button prints the report.
const SPR_COLORS = ['#2d6a6a', '#c2410c', '#7c3aed', '#0369a1', '#be185d', '#4d7c0f', '#b45309', '#475569', '#0f766e', '#9d174d', '#1d4ed8', '#a16207'];
const sprState = { preset: 'month', from: '', to: '', metric: 'done', therapistId: '' };
const sprEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const sprToday = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);   // Tulum is UTC-5 all year
const sprAdd = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const sprFmtD = d => { try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; } };
const sprMonday = d => { const dt = new Date(d + 'T12:00:00Z'), k = (dt.getUTCDay() + 6) % 7; return sprAdd(d, -k); };
const sprMoney = n => '$' + Math.round(n).toLocaleString('en-US');
const sprTime = t => { const [h, m] = String(t || '0:0').split(':').map(Number), x = h >= 12 ? 'PM' : 'AM'; return ((h % 12) || 12) + (m ? ':' + String(m).padStart(2, '0') : '') + ' ' + x; };

function sprRange() {
  const t = sprToday(), p = sprState.preset;
  if (p === 'week') return [sprMonday(t), sprAdd(sprMonday(t), 6)];
  if (p === 'month') return [t.slice(0, 8) + '01', t];
  if (p === 'lastmonth') { const first = t.slice(0, 8) + '01', last = sprAdd(first, -1); return [last.slice(0, 8) + '01', last]; }
  if (p === '30') return [sprAdd(t, -29), t];
  if (p === 'all') return ['2000-01-01', '2999-12-31'];
  return [sprState.from || '2000-01-01', sprState.to || '2999-12-31'];
}
const sprDone = a => (typeof spaIsDone === 'function') ? spaIsDone(a) : a.status === 'COMPLETED';
function sprStats() {
  const [from, to] = sprRange(), svcs = (SpaData && SpaData.services) || [], ths = ((SpaData && SpaData.therapists) || []);
  const rows = {}; const mk = (id, name) => rows[id] = { id, name, done: 0, booked: 0, requested: 0, cancelled: 0, noshow: 0, hours: 0, revenue: 0, byService: {}, byWeek: {}, byDow: [0, 0, 0, 0, 0, 0, 0], byHour: {}, online: 0, total: 0 };
  ths.forEach(t => mk(t.id, t.name)); mk('_none', 'Unassigned');
  (SpaAppointments || []).forEach(a => {
    if (!a.date || a.date < from || a.date > to) return;
    const tid = a.therapistId && rows[a.therapistId] ? a.therapistId : '_none', r = rows[tid], svc = svcs.find(s => s.id === a.serviceId) || {};
    r.total++;
    const pref = a.therapistPreference || {};
    if (a.status === 'CANCELLED') { r.cancelled++; }
    else if (a.status === 'NO_SHOW') { r.noshow++; }
    else {
      r.booked++;
      if (a.source === 'guest_booking') r.online++;
      if (sprDone(a)) {
        r.done++; const mins = a.duration || svc.duration || 60; r.hours += mins / 60; r.revenue += Number(svc.price) || 0;
        const nm = svc.name || 'Other'; r.byService[nm] = (r.byService[nm] || 0) + 1;
        const wk = sprMonday(a.date); r.byWeek[wk] = (r.byWeek[wk] || 0) + 1;
        r.byDow[(new Date(a.date + 'T12:00:00Z').getUTCDay() + 6) % 7]++;
        const h = parseInt(String(a.start || '0').split(':')[0], 10); r.byHour[h] = (r.byHour[h] || 0) + 1;
      }
    }
    if (pref.type === 'specific' && pref.requestedTherapistId && rows[pref.requestedTherapistId] && a.status !== 'CANCELLED') rows[pref.requestedTherapistId].requested++;
  });
  return Object.values(rows).filter(r => r.total || r.requested || r.id !== '_none').filter(r => r.id !== '_none' || r.total);
}

function sprBars(items, color, fmt) {                       // horizontal bars: items = [{label, value, color?}]
  const max = Math.max(1, ...items.map(i => i.value));
  return items.map(i => `<div style="display:flex;align-items:center;gap:10px;margin:5px 0"><div style="width:130px;font-size:12.5px;text-align:right;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${sprEsc(i.label)}">${sprEsc(i.label)}</div><div style="flex:1;background:#f3efe8;border-radius:6px;height:22px;position:relative"><div style="width:${Math.max(i.value ? 2 : 0, i.value / max * 100)}%;background:${i.color || color};height:100%;border-radius:6px"></div></div><div style="width:70px;font-size:12.5px;font-weight:700">${fmt ? fmt(i.value) : i.value}</div></div>`).join('');
}
function sprColumns(items, color) {                         // vertical columns: items = [{label, value}]
  const max = Math.max(1, ...items.map(i => i.value)), w = 100 / Math.max(items.length, 1);
  return `<div style="display:flex;align-items:flex-end;gap:6px;height:150px;border-bottom:1.5px solid #e8dfd4;padding-top:16px">${items.map(i => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;min-width:0"><div style="font-size:11.5px;font-weight:700">${i.value || ''}</div><div style="width:70%;max-width:46px;background:${color};border-radius:5px 5px 0 0;height:${i.value / max * 100 * 0.78}%"></div></div>`).join('')}</div>
    <div style="display:flex;gap:6px">${items.map(i => `<div style="flex:1;font-size:10.5px;text-align:center;color:#6b7280;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sprEsc(i.label)}</div>`).join('')}</div>`;
}
const SPR_METRICS = { done: ['Services done', r => r.done, n => n], requested: ['Requested by name', r => r.requested, n => n], hours: ['Hours worked', r => r.hours, n => (Math.round(n * 10) / 10) + ' h'], revenue: ['Est. revenue (list price)', r => r.revenue, n => sprMoney(n)] };

function sprRender() {
  const el = document.getElementById('spaContent'); if (!el) return;
  const [from, to] = sprRange(), stats = sprStats(), th = sprState.therapistId, one = th && stats.find(r => r.id === th);
  const btn = (on) => `padding:6px 12px;border:1.5px solid ${on ? '#2d6a6a' : '#c8bfb5'};border-radius:8px;background:${on ? '#2d6a6a' : '#fff'};color:${on ? '#fff' : 'var(--dark)'};cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:600`;
  const presets = [['week', 'This week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['30', 'Last 30 days'], ['all', 'All time']];
  const inp = 'padding:6px 9px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:inherit;font-size:12.5px';
  const head = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px">
    ${presets.map(p => `<button onclick="sprSet('preset','${p[0]}')" style="${btn(sprState.preset === p[0])}">${p[1]}</button>`).join('')}
    <span style="color:#9ca3af;font-size:12px">or</span><input type="date" value="${sprState.preset === 'custom' ? from : ''}" onchange="sprCustom('from',this.value)" style="${inp}"><span>→</span><input type="date" value="${sprState.preset === 'custom' ? to : ''}" onchange="sprCustom('to',this.value)" style="${inp}">
    <button onclick="window.print()" style="${btn(false)};margin-left:auto">🖨 Print report</button></div>
    <div style="font-size:12px;color:#6b7280;margin:-6px 0 14px">${from.startsWith('2000') ? 'All dates' : sprFmtD(from) + ' → ' + sprFmtD(to)} · "Done" = completed, or its time has passed and it was not cancelled · "Requested" = the guest asked for that therapist by name when booking online.</div>`;
  const chips = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px"><button onclick="sprPick('')" style="${btn(!th)}">Everyone</button>${stats.filter(r => r.id !== '_none').map((r, i) => `<button onclick="sprPick('${sprEsc(r.id)}')" style="${btn(th === r.id)}">${sprEsc(r.name)}</button>`).join('')}</div>`;
  let body = '';
  if (!one) {
    const ordered = stats.slice().sort((a, b) => SPR_METRICS[sprState.metric][1](b) - SPR_METRICS[sprState.metric][1](a));
    const tot = stats.reduce((s, r) => { s.done += r.done; s.requested += r.requested; s.cancelled += r.cancelled + r.noshow; s.hours += r.hours; s.revenue += r.revenue; return s; }, { done: 0, requested: 0, cancelled: 0, hours: 0, revenue: 0 });
    const card = (t, v) => `<div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;padding:12px 16px;min-width:130px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#a89a86">${t}</div><div style="font-size:24px;font-weight:700;font-family:'Cormorant Garamond',serif">${v}</div></div>`;
    body = `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">${card('Services done', tot.done)}${card('Requested by name', tot.requested)}${card('Hours', Math.round(tot.hours * 10) / 10)}${card('Est. revenue', sprMoney(tot.revenue))}${card('Cancelled / no-show', tot.cancelled)}</div>
      <div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;padding:14px 18px;margin-bottom:16px"><div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px"><b style="margin-right:8px">Who is leading</b>${Object.entries(SPR_METRICS).map(([k, m]) => `<button onclick="sprSet('metric','${k}')" style="${btn(sprState.metric === k)}">${m[0]}</button>`).join('')}</div>
      ${sprBars(ordered.map((r, i) => ({ label: r.name, value: SPR_METRICS[sprState.metric][1](r), color: SPR_COLORS[stats.indexOf(r) % SPR_COLORS.length] })), '#2d6a6a', SPR_METRICS[sprState.metric][2])}</div>
      <div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f5f1eb;text-align:left"><th style="padding:9px 12px">Therapist (click for report)</th><th>Done</th><th>Requested</th><th>% requested</th><th>Hours</th><th>Est. revenue</th><th>Online-booked</th><th>Cancelled / no-show</th></tr></thead><tbody>
      ${ordered.map(r => `<tr onclick="sprPick('${sprEsc(r.id)}')" style="border-top:1px solid #f0ebe0;cursor:${r.id === '_none' ? 'default' : 'pointer'}"><td style="padding:9px 12px;font-weight:700">${sprEsc(r.name)}</td><td>${r.done}</td><td>${r.requested}</td><td>${r.booked ? Math.round(r.requested / r.booked * 100) + '%' : '—'}</td><td>${Math.round(r.hours * 10) / 10}</td><td>${sprMoney(r.revenue)}</td><td>${r.online}</td><td>${r.cancelled + r.noshow}</td></tr>`).join('')}</tbody></table></div>`;
  } else {
    const r = one, svcItems = Object.entries(r.byService).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v })), weeks = Object.keys(r.byWeek).sort();
    const weekItems = []; if (weeks.length) for (let w = weeks[0]; w <= weeks[weeks.length - 1] && weekItems.length < 40; w = sprAdd(w, 7)) weekItems.push({ label: sprFmtD(w), value: r.byWeek[w] || 0 });
    const hrs = Object.keys(r.byHour).map(Number).sort((a, b) => a - b), hourItems = hrs.length ? Array.from({ length: hrs[hrs.length - 1] - hrs[0] + 1 }, (_, i) => ({ label: sprTime((hrs[0] + i) + ':00'), value: r.byHour[hrs[0] + i] || 0 })) : [];
    const rank = k => stats.filter(x => x.id !== '_none').slice().sort((a, b) => SPR_METRICS[k][1](b) - SPR_METRICS[k][1](a)).findIndex(x => x.id === r.id) + 1;
    const card = (t, v, sub) => `<div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;padding:12px 16px;min-width:130px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#a89a86">${t}</div><div style="font-size:24px;font-weight:700;font-family:'Cormorant Garamond',serif">${v}</div>${sub ? `<div style="font-size:11.5px;color:#6b7280">${sub}</div>` : ''}</div>`;
    const panel = (t, inner) => `<div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;padding:14px 18px;margin-bottom:14px"><div style="font-weight:700;margin-bottom:8px">${t}</div>${inner || '<div style="color:#9ca3af">Nothing in this period.</div>'}</div>`;
    body = `<div style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:700;margin-bottom:10px">${sprEsc(r.name)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">${card('Services done', r.done, '#' + rank('done') + ' of ' + stats.filter(x => x.id !== '_none').length)}${card('Requested by name', r.requested, '#' + rank('requested') + ' · ' + (r.booked ? Math.round(r.requested / r.booked * 100) : 0) + '% of bookings')}${card('Hours', Math.round(r.hours * 10) / 10)}${card('Est. revenue', sprMoney(r.revenue))}${card('Online-booked', r.online)}${card('Cancelled / no-show', r.cancelled + r.noshow)}</div>
      ${panel('By service', svcItems.length ? sprBars(svcItems, '#2d6a6a') : '')}
      ${panel('Services done per week (week starting)', weekItems.length ? sprColumns(weekItems, '#2d6a6a') : '')}
      ${panel('Busiest days', r.done ? sprColumns(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => ({ label: d, value: r.byDow[i] })), '#c2410c') : '')}
      ${panel('Busiest start times', hourItems.length ? sprColumns(hourItems, '#7c3aed') : '')}`;
  }
  el.style.padding = '20px 24px'; el.innerHTML = head + chips + body;
}
function sprSet(k, v) { sprState[k] = v; sprRender(); }
function sprCustom(k, v) { sprState.preset = 'custom'; sprState[k] = v; sprRender(); }
function sprPick(id) { if (id === '_none') return; sprState.therapistId = id; sprRender(); }

(function () {
  const side = document.getElementById('spaViewPayroll'); if (side && !document.getElementById('spaViewReports')) {
    const b = document.createElement('button'); b.id = 'spaViewReports'; b.setAttribute('onclick', "spaSetView('reports')"); b.textContent = '📊 Reports'; b.style.cssText = side.getAttribute('style');
    side.insertAdjacentElement('afterend', b);
  }
  if (typeof spaSetView === 'function') {
    const o = window.spaSetView;
    window.spaSetView = function (v) {
      if (v !== 'reports') { const rb = document.getElementById('spaViewReports'); if (rb) { rb.style.background = 'transparent'; rb.style.color = 'var(--dark)'; } return o.apply(this, arguments); }
      spaCurView = 'reports';
      document.querySelectorAll('[id^="spaView"]').forEach(x => { const on = x.id === 'spaViewReports'; x.style.background = on ? 'var(--teal,#2d6a6a)' : 'transparent'; x.style.color = on ? '#fff' : 'var(--dark)'; });
      const aw = document.getElementById('spaAddBtnWrap'); if (aw) aw.innerHTML = ''; sprRender();
    };
  }
  if (typeof spaRender === 'function') {
    const o = window.spaRender;
    window.spaRender = function () { if (typeof spaCurView !== 'undefined' && spaCurView === 'reports') { const aw = document.getElementById('spaAddBtnWrap'); if (aw) aw.innerHTML = ''; return sprRender(); } return o.apply(this, arguments); };
  }
})();
