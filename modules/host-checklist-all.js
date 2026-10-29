// ===== host-checklist-all.js — "Not done yet" list for ALL upcoming retreats, same look as the red-chip pop-up (Darlene 2026-10-29) =====
// Loaded as a classic script AFTER host-checklist.js; shares global scope. Standalone and read-only: the chip's own pop-up keeps showing only retreats arriving in the next
// 3 days; this adds a "All upcoming retreats" button to that pop-up and to the Host Checklist tab, opening the same kind of list for every retreat that has not ended.
// It uses the host checklist's own data (hcItemsFor), so ticks made anywhere show here. Admin logins only (hcTeam).
// Default view keeps it readable: retreats arriving in the next 45 days (or already here) and only the steps whose due date has come (or that have no due date).
// Two switches in the pop-up widen it to every upcoming retreat and/or every step.
let hcAllWin = 7, hcAllEvery = false;   // window in days: 7 (this week, default) | 45 | 0 = every upcoming retreat
function hcAllScan() {
  const today = hcToday(), out = [], lim = hcAdd(today, hcAllWin || 99999);
  hcRetreats().forEach(bk => {
    if (String(bk.endDate).slice(0, 10) < today) return;
    if (hcAllWin && String(bk.startDate).slice(0, 10) > lim) return;
    const steps = hcItemsFor(bk).filter(i => !i.done && (hcAllEvery || !i.due || i.due <= today));
    if (steps.length) out.push({ bk, steps });
  });
  return out;
}
function hcAllToggle(k) { if (k === 'win') hcAllWin = hcAllWin === 7 ? 45 : hcAllWin === 45 ? 0 : 7; else hcAllEvery = !hcAllEvery; hcAllShow(); }
function hcAllShow() {
  if (!hcTeam()) return;
  const go = () => {
    const list = hcAllScan(), total = list.reduce((s, x) => s + x.steps.length, 0);
    const m0 = document.getElementById('hcAlertModal'); if (m0) m0.style.display = 'none';
    let m = document.getElementById('hcAllModal');
    if (!m) { m = document.createElement('div'); m.id = 'hcAllModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Jost,sans-serif'; document.body.appendChild(m); }
    m.style.display = 'flex';
    m.innerHTML = `<div style="background:#f5f1eb;border-radius:16px;max-width:720px;width:100%;max-height:90vh;overflow:auto;padding:20px 24px;box-shadow:0 12px 40px rgba(0,0,0,.3)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:#92400e">📋 Host checklist: not done yet — ${hcAllWin === 7 ? 'this week' : hcAllWin === 45 ? 'next 45 days' : 'all upcoming retreats'}</div><button onclick="document.getElementById('hcAllModal').style.display='none'" style="background:none;border:none;font-size:24px;cursor:pointer;color:#6b7280">×</button></div>
      <div style="font-size:12.5px;color:#6b7280;margin-bottom:12px">${list.length} retreat${list.length !== 1 ? 's' : ''} · ${total} step${total !== 1 ? 's' : ''} not done. ${hcAllWin === 0 ? 'Every retreat that has not ended' : hcAllWin === 7 ? 'Retreats arriving in the next 7 days (or already here)' : 'Retreats arriving in the next 45 days (or already here)'}, soonest first. ${hcAllEvery ? 'Every step not done.' : 'Steps whose due date has come.'}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button onclick="hcAllToggle('win')" style="padding:5px 11px;border:1.5px solid #fde68a;border-radius:8px;background:#fffbeb;color:#92400e;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">${hcAllWin === 7 ? 'Widen to the next 45 days' : hcAllWin === 45 ? 'Widen to all upcoming retreats' : 'Back to this week'}</button><button onclick="hcAllToggle('every')" style="padding:5px 11px;border:1.5px solid #fde68a;border-radius:8px;background:#fffbeb;color:#92400e;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">${hcAllEvery ? 'Only steps due now' : 'Include steps not due yet'}</button></div>
      ${list.length ? list.map(x => `<div style="background:#fff;border:1.5px solid #fde68a;border-radius:12px;padding:10px 14px;margin-bottom:10px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><b style="font-size:15px">${hcEsc(x.bk.leaderName || x.bk.retreatName || 'Retreat')}</b> <span style="font-size:12px;color:#6b7280">arrives ${hcFmt(String(x.bk.startDate).slice(0, 10))} · ${x.steps.length} not done</span></div>
        <button onclick="document.getElementById('hcAllModal').style.display='none';hcOpenFor('${hcEsc(x.bk.id)}')" style="padding:4px 12px;border:1.5px solid #6ee7b7;border-radius:8px;background:#ecfdf5;color:#065f46;font-weight:700;font-size:12px;cursor:pointer">Open checklist</button></div>
        ${x.steps.map(i => `<div style="font-size:13px;margin-top:4px">☐ ${hcEsc(i.text)}${i.due && i.due < hcToday() ? ` <span style="color:#b91c1c;font-weight:700;font-size:11.5px">overdue since ${hcFmt(i.due)}</span>` : ''}</div>`).join('')}</div>`).join('') : '<div style="font-size:13px;color:#15803d;font-weight:600;padding:8px 0">Everything is done ✓</div>'}
    </div>`;
  };
  if (typeof hcState !== 'undefined' && !hcState.loaded && typeof hcLoad === 'function') { Promise.resolve(hcLoad()).then(go, go); } else go();
}
(function () {
  const BTN = 'padding:6px 12px;border:1.5px solid #fde68a;border-radius:8px;background:#fffbeb;color:#92400e;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer';
  // button inside the red chip's pop-up
  const prevShow = window.hcAlertShow;
  if (typeof prevShow === 'function') {
    window.hcAlertShow = function () {
      const r = prevShow.apply(this, arguments);
      try {
        const m = document.getElementById('hcAlertModal');
        if (m && !m.querySelector('#hcAllBtn')) {
          const sub = [...m.querySelectorAll('div')].find(d => /Retreats arriving in the next 3 days/.test(d.textContent) && d.children.length === 0);
          if (sub) sub.insertAdjacentHTML('afterend', `<div style="margin-bottom:10px"><button id="hcAllBtn" onclick="hcAllShow()" style="${BTN}">See this week's retreats →</button></div>`);
        }
      } catch (e) {}
      return r;
    };
  }
  // button at the top of the Host Checklist tab
  const prevRender = window.hcRender;
  if (typeof prevRender === 'function') {
    window.hcRender = function () {
      const r = prevRender.apply(this, arguments);
      try {
        const el = document.getElementById('hcContent');
        if (el && !el.querySelector('#hcAllTabBtn') && hcTeam()) {
          const wrap = el.firstElementChild;
          if (wrap) wrap.insertAdjacentHTML('afterbegin', `<div style="margin-bottom:10px"><button id="hcAllTabBtn" onclick="hcAllShow()" style="${BTN}">📋 Not done yet — this week's retreats</button></div>`);
        }
      } catch (e) {}
      return r;
    };
  }
})();
