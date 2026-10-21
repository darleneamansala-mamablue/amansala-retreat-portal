// ===== spa-payroll-range.js — From / To date range for the Spa Payroll tab =====
// Loaded as a classic script AFTER spa.js; shares global scope. Standalone: wraps spaRenderPayrollTable and spaCollectTipCharges
// and edits nothing in spa.js. Before: Payroll summed every Completed appointment ever. Now a From / To bar (inclusive, by service
// date) filters both the therapist cards and the tips section; blank dates mean no limit, so "All time" is the old behaviour.
// Tips are folio charges with a `date`; any tip with no date can't be placed in a range, so it is left out and counted in a note.
let spaPrRange = { from: '', to: '' };
let spaPrUndatedTips = 0;

function spaPrInRange(d) { return !!d && (!spaPrRange.from || d >= spaPrRange.from) && (!spaPrRange.to || d <= spaPrRange.to); }
function spaPrIso(d) { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }

function spaPrPreset(kind) {
  const now = new Date(); now.setHours(12, 0, 0, 0);
  if (kind === 'today') spaPrRange = { from: spaPrIso(now), to: spaPrIso(now) };
  else if (kind === 'week') { // Monday to Sunday
    const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    spaPrRange = { from: spaPrIso(mon), to: spaPrIso(sun) };
  } else if (kind === 'month') spaPrRange = { from: spaPrIso(new Date(now.getFullYear(), now.getMonth(), 1)), to: spaPrIso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  else spaPrRange = { from: '', to: '' };
  spaRenderPayrollTable();
}
function spaPrApply() {
  spaPrRange = { from: document.getElementById('spaPrFrom').value, to: document.getElementById('spaPrTo').value };
  if (spaPrRange.from && spaPrRange.to && spaPrRange.from > spaPrRange.to) { showToast('"From" is after "To" — swap the dates.'); return; }
  spaRenderPayrollTable();
}

(function () {
  if (typeof spaRenderPayrollTable !== 'function' || typeof spaCollectTipCharges !== 'function') return;
  const origTable = window.spaRenderPayrollTable, origTips = window.spaCollectTipCharges;
  window.spaCollectTipCharges = function () {
    const all = origTips();
    if (!spaPrRange.from && !spaPrRange.to) { spaPrUndatedTips = 0; return all; }
    spaPrUndatedTips = all.filter(c => !c.date).length;
    return all.filter(c => spaPrInRange(c.date));
  };
  window.spaRenderPayrollTable = function () {
    // The original reads the global SpaAppointments directly, so hand it a filtered list for the duration of the call.
    const saved = SpaAppointments;
    try {
      if (spaPrRange.from || spaPrRange.to) SpaAppointments = saved.filter(a => spaPrInRange(a.date));
      origTable();
    } finally { SpaAppointments = saved; }
    const el = document.getElementById('spaContent'); if (!el) return;
    const inp = 'padding:6px 8px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:Jost,sans-serif;font-size:12.5px';
    const chip = 'font-size:12px;padding:6px 12px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:Jost,sans-serif';
    const label = (spaPrRange.from || spaPrRange.to) ? `${spaPrRange.from || 'the beginning'} to ${spaPrRange.to || 'today and beyond'}` : 'All time';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:14px;text-align:left';
    bar.innerHTML = `<label style="font-size:12px;color:#2d2520">From <input type="date" id="spaPrFrom" value="${spaPrRange.from}" style="${inp}"></label>
      <label style="font-size:12px;color:#2d2520">To <input type="date" id="spaPrTo" value="${spaPrRange.to}" style="${inp}"></label>
      <button onclick="spaPrApply()" style="${chip};background:var(--teal,#2d6a6a);color:#fff;border-color:var(--teal,#2d6a6a)">Run Report</button>
      <button onclick="spaPrPreset('today')" style="${chip}">Today</button>
      <button onclick="spaPrPreset('week')" style="${chip}">This Week</button>
      <button onclick="spaPrPreset('month')" style="${chip}">This Month</button>
      <button onclick="spaPrPreset('all')" style="${chip}">All Time</button>
      <span style="font-size:12px;font-weight:700;color:#1a2332;margin-left:6px">Showing: ${label}</span>
      ${spaPrUndatedTips ? `<span style="font-size:11.5px;color:#b45309">${spaPrUndatedTips} tip${spaPrUndatedTips !== 1 ? 's' : ''} with no date not included</span>` : ''}`;
    el.insertBefore(bar, el.firstChild);
  };
})();
