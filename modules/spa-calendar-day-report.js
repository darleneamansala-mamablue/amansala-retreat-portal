// ===== spa-calendar-day-report.js — Daily sales / profit / who-to-pay report on the Spa Calendar =====
// Loaded as a classic script AFTER spa.js and spa-calendar.js; shares global scope. Standalone: wraps spaCalRenderToolbar to add one
// "Day Report" button next to New Appointment, and opens a pop-up for the day being viewed. Read-only; changes no appointment.
// Admin side only (hidden in the spa-staff view) and behind the same access code as the Payroll tab, since it shows revenue and pay.
// Money: guests are priced in USD, therapists are paid in pesos. Pay is worked out in pesos from each therapist's own rate row
// (a USD rate is converted at SPA_MXN_PER_USD). Only COMPLETED services count as earned; Confirmed-but-not-completed ones are shown
// separately so "who to pay" can't silently miss someone whose service was never marked Completed.
let spaDrDate = '';

function spaDrPayMXN(a) {
  if (!a.therapistId) return { mxn: 0, why: 'no therapist' };
  const ther = SpaData.therapists.find(t => t.id === a.therapistId), svc = SpaData.services.find(s => s.id === a.serviceId);
  const rate = ther && (ther.services || []).find(r => r.serviceId === a.serviceId);
  if (!rate || !svc || rate.compensationValue == null) return { mxn: 0, why: 'no rate set' };
  let v;
  if (rate.compensationType === 'FIXED') v = rate.compensationValue || 0;
  else if (rate.compensationType === 'PERCENTAGE') v = svc.price != null ? svc.price * (rate.compensationValue || 0) / 100 : null;
  else if (rate.compensationType === 'HOURLY') v = svc.duration ? (rate.compensationValue || 0) * svc.duration / 60 : null;
  else return { mxn: 0, why: 'no rate set' };
  if (v == null) return { mxn: 0, why: 'no price on service' };
  return { mxn: Math.round(rate.compensationCurrency === 'USD' ? v * SPA_MXN_PER_USD : v), why: '' };
}

function spaDrCompute(ds) {
  const day = (SpaAppointments || []).filter(a => a.date === ds && (a.status === 'CONFIRMED' || a.status === 'COMPLETED'));
  const done = day.filter(a => a.status === 'COMPLETED'), open = day.filter(a => a.status === 'CONFIRMED');
  const sum = (list, f) => list.reduce((s, a) => s + f(a), 0);
  const cost = a => { const svc = SpaData.services.find(s => s.id === a.serviceId); return svc ? spaSvcDirectCostTotal(svc) : 0; };
  const t = {
    salesBooked: sum(day, spaApptRevenue), salesDone: sum(done, spaApptRevenue), costDone: sum(done, cost),
    payDone: sum(done, a => spaDrPayMXN(a).mxn) / SPA_MXN_PER_USD, payOpen: sum(open, a => spaDrPayMXN(a).mxn) / SPA_MXN_PER_USD,
    costOpen: sum(open, cost), salesOpen: sum(open, spaApptRevenue),
  };
  t.profitDone = t.salesDone - t.costDone - t.payDone;
  t.profitIfAll = t.salesBooked - t.costDone - t.costOpen - t.payDone - t.payOpen;
  const people = {};
  const person = a => {
    const ther = SpaData.therapists.find(x => x.id === a.therapistId), key = ther ? ther.id : 'none';
    if (!people[key]) people[key] = { name: ther ? `${ther.firstName} ${ther.lastName || ''}`.trim() : 'No therapist assigned', done: [], open: [], tipsUSD: 0, tipCount: 0 };
    return people[key];
  };
  done.forEach(a => person(a).done.push(a)); open.forEach(a => person(a).open.push(a));
  spaCollectTipCharges().filter(c => c.date === ds).forEach(c => {
    const ther = SpaData.therapists.find(x => x.id === c.therapistId), key = ther ? ther.id : 'name:' + (c.therapistName || 'Unknown');
    if (!people[key]) people[key] = { name: ther ? `${ther.firstName} ${ther.lastName || ''}`.trim() : (c.therapistName || 'Unknown'), done: [], open: [], tipsUSD: 0, tipCount: 0 };
    people[key].tipsUSD += c.amount || 0; people[key].tipCount++;
  });
  Object.values(people).forEach(p => {
    p.payMXN = p.done.reduce((s, a) => s + spaDrPayMXN(a).mxn, 0);
    p.openMXN = p.open.reduce((s, a) => s + spaDrPayMXN(a).mxn, 0);
    p.tipsMXN = Math.round(p.tipsUSD * SPA_MXN_PER_USD);
    p.totalMXN = p.payMXN + p.tipsMXN;
  });
  return { t, people: Object.values(people).sort((a, b) => b.totalMXN - a.totalMXN), doneCount: done.length, openCount: open.length };
}

const spaDrMx = n => '$' + Math.round(n).toLocaleString('en-US') + ' MXN';
const spaDrUs = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const spaDrEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function spaDrOpen() {
  spaDrDate = spaCalFmtDateStr(spaCalDate);
  let ov = document.getElementById('spaDayReport');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'spaDayReport';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto';
    ov.onclick = e => { if (e.target === ov) spaDrClose(); };
    document.body.appendChild(ov);
  }
  ov.style.display = 'flex'; spaDrRender();
}
function spaDrClose() { const ov = document.getElementById('spaDayReport'); if (ov) ov.style.display = 'none'; }
function spaDrNav(n) { const d = new Date(spaDrDate + 'T12:00:00'); d.setDate(d.getDate() + n); spaDrDate = spaCalFmtDateStr(d); spaDrRender(); }
function spaDrSetDate(v) { if (v) { spaDrDate = v; spaDrRender(); } }
function spaDrUnlock() {
  if (document.getElementById('spaDrCode').value === SPA_PAYROLL_CODE) { sessionStorage.setItem('spa_payroll_unlocked', '1'); spaDrRender(); }
  else document.getElementById('spaDrErr').style.display = 'block';
}

function spaDrRender() {
  const ov = document.getElementById('spaDayReport'); if (!ov) return;
  const box = c => `<div style="background:#fff;border-radius:14px;width:min(860px,100%);padding:20px 22px;font-family:'Jost',sans-serif;color:#2d2520;text-align:left">${c}</div>`;
  if (sessionStorage.getItem('spa_payroll_unlocked') !== '1') {
    ov.innerHTML = box(`<div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600">Day Report Access</div>
      <div style="font-size:12.5px;color:#6b7280;margin:6px 0 12px">This shows sales, profit and what each therapist is owed. Enter the payroll access code.</div>
      <input type="password" id="spaDrCode" placeholder="Access code" onkeydown="if(event.key==='Enter')spaDrUnlock()" style="width:100%;padding:10px 12px;border:1.5px solid #c8bfb5;border-radius:9px;box-sizing:border-box;margin-bottom:10px">
      <div style="display:flex;gap:8px"><button onclick="spaDrUnlock()" style="flex:1;padding:10px;background:var(--teal,#2d6a6a);color:#fff;border:none;border-radius:9px;font-weight:600;cursor:pointer">Unlock</button><button onclick="spaDrClose()" style="padding:10px 16px;border:1.5px solid #c8bfb5;background:#fff;border-radius:9px;cursor:pointer">Cancel</button></div>
      <div id="spaDrErr" style="display:none;color:#dc2626;font-size:12px;margin-top:10px">Incorrect code.</div>`);
    return;
  }
  const r = spaDrCompute(spaDrDate), t = r.t;
  const nice = new Date(spaDrDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const tile = (label, v, sub, color) => `<div style="flex:1;min-width:150px;background:#faf7f2;border:1.5px solid #e8dfd4;border-radius:12px;padding:12px 14px"><div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#8a7e74">${label}</div><div style="font-size:21px;font-weight:800;color:${color || '#2d2520'}">${v}</div><div style="font-size:10.5px;color:#6b7280">${sub}</div></div>`;
  const btn = 'padding:6px 12px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;font-size:12.5px';
  const peopleHtml = r.people.length ? r.people.map(p => {
    const lines = {}; p.done.forEach(a => { const s = SpaData.services.find(x => x.id === a.serviceId), k = s ? s.name : 'Service', pay = spaDrPayMXN(a); (lines[k] = lines[k] || { n: 0, mxn: 0, why: '' }); lines[k].n++; lines[k].mxn += pay.mxn; if (pay.why) lines[k].why = pay.why; });
    return `<div style="border:1.5px solid #e8dfd4;border-radius:12px;padding:12px 14px;margin-top:10px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><b style="font-family:'Cormorant Garamond',serif;font-size:17px">${spaDrEsc(p.name)}</b><b style="font-size:17px;color:#059669">${spaDrMx(p.totalMXN)}</b></div>
      ${Object.entries(lines).map(([k, l]) => `<div style="display:flex;justify-content:space-between;font-size:12.5px;color:#4b5563;padding:2px 0"><span>${l.n} × ${spaDrEsc(k)}${l.why ? ` <span style="color:#b45309">⚠ ${l.why} — pays $0</span>` : ''}</span><span>${spaDrMx(l.mxn)}</span></div>`).join('')}
      ${p.tipCount ? `<div style="display:flex;justify-content:space-between;font-size:12.5px;color:#4b5563;padding:2px 0"><span>${p.tipCount} tip${p.tipCount !== 1 ? 's' : ''} (${spaDrUs(p.tipsUSD)} USD)</span><span>${spaDrMx(p.tipsMXN)}</span></div>` : ''}
      ${p.open.length ? `<div style="font-size:11.5px;color:#b45309;margin-top:4px">⚠ ${p.open.length} more Confirmed but not marked Completed (${spaDrMx(p.openMXN)}) — mark them Completed on the calendar to include them.</div>` : ''}
    </div>`;
  }).join('') : '<div style="padding:24px;text-align:center;color:#8a7e74">No confirmed or completed services on this day.</div>';
  ov.innerHTML = box(`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600">Day Report · ${nice}</div>
      <div style="display:flex;gap:6px;align-items:center"><button onclick="spaDrNav(-1)" style="${btn}">&#8249;</button><input type="date" value="${spaDrDate}" onchange="spaDrSetDate(this.value)" style="${btn}"><button onclick="spaDrNav(1)" style="${btn}">&#8250;</button><button onclick="spaDrClose()" style="${btn}">Close</button></div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px">
      ${tile('Sales (booked)', spaDrUs(t.salesBooked), `${r.doneCount + r.openCount} services, USD`)}
      ${tile('Sales (completed)', spaDrUs(t.salesDone), `${r.doneCount} completed`)}
      ${tile('Therapist pay', spaDrMx(t.payDone * SPA_MXN_PER_USD), `${spaDrUs(t.payDone)} USD at ${SPA_MXN_PER_USD} MXN/USD`)}
      ${tile('Profit (completed)', spaDrUs(t.profitDone), 'after service costs &amp; therapist pay', t.profitDone >= 0 ? '#059669' : '#dc2626')}
    </div>
    ${r.openCount ? `<div style="font-size:12px;color:#6b7280;margin-top:8px">If the ${r.openCount} Confirmed service${r.openCount !== 1 ? 's' : ''} still open get completed, profit becomes <b>${spaDrUs(t.profitIfAll)}</b>.</div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px"><div style="font-family:'Cormorant Garamond',serif;font-size:19px;font-weight:600">Who to pay</div><button onclick="spaDrCopy()" style="${btn};background:var(--teal,#2d6a6a);color:#fff;border-color:var(--teal,#2d6a6a)">Copy for WhatsApp</button></div>
    ${peopleHtml}
    ${r.people.length > 1 ? `<div style="text-align:right;font-size:14px;font-weight:700;margin-top:12px">Total to pay: ${spaDrMx(r.people.reduce((s, p) => s + p.totalMXN, 0))}</div>` : ''}`);
}
function spaDrCopy() {
  const r = spaDrCompute(spaDrDate);
  const txt = `Spa pay · ${spaDrDate}\n` + r.people.filter(p => p.totalMXN).map(p => `• ${p.name} — ${spaDrMx(p.totalMXN)}${p.tipsMXN ? ` (incl. tips ${spaDrMx(p.tipsMXN)})` : ''}`).join('\n') + `\nTotal: ${spaDrMx(r.people.reduce((s, p) => s + p.totalMXN, 0))}`;
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => showToast('Copied — paste it into WhatsApp.'), () => window.prompt('Copy this:', txt));
}

(function () {
  if (typeof spaCalRenderToolbar !== 'function') return;
  const orig = window.spaCalRenderToolbar;
  window.spaCalRenderToolbar = function () {
    const r = orig.apply(this, arguments);
    if ((typeof IS_SPA_STAFF_MODE !== 'undefined' && IS_SPA_STAFF_MODE) || (typeof getSpaStaffSession === 'function' && getSpaStaffSession())) return r;
    const newBtn = document.querySelector('#spaAddBtnWrap button[onclick="spaApptShowForm(null)"]');
    if (newBtn && !document.getElementById('spaDrBtn')) {
      const b = document.createElement('button');
      b.id = 'spaDrBtn'; b.onclick = spaDrOpen; b.textContent = '📊 Day Report';
      b.style.cssText = "padding:6px 12px;font-size:12px;font-weight:600;border:1.5px solid var(--border);border-radius:7px;background:#fff;cursor:pointer;font-family:'Jost',sans-serif";
      newBtn.parentNode.insertBefore(b, newBtn);
    }
    return r;
  };
})();
