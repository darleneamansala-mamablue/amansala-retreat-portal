// ===== daily-reports.js — "Daily Reports" page, "Today's Briefing" dashboard shortcut, carry-forward of unfinished tasks (Darlene 2026-10-18) =====
// Loaded after daily-briefing.js (shares its globals: dbReports, dbLoad, dbOpen, dbDate, dbData, dbSaveState, dbEsc, dbISO, dbAdd).
// Reports are saved by date by the Daily Briefing's "Save today's report". This page lists them and lets managers review them.
// Managers = role admin or manager. Staff hours inside reports are managers-only, so non-managers don't see the page, the saved-reports list or the hours.
function drIsManager() { try { const r = (typeof getCurrentSession === 'function' && getCurrentSession() || {}).role; return r === 'admin' || r === 'manager'; } catch (e) { return false; } }
function dbCanSeeHours() { return drIsManager(); }
let drOpenDate = null;

function drCard(d) {
  const r = dbReports[d], n = (r.tasksOpen || []).length;
  return `<div onclick="drView('${d}')" style="cursor:pointer;background:#fff;border:1.5px solid ${d === drOpenDate ? '#8a6d3b' : '#e8dfd4'};border-radius:10px;padding:10px 14px;margin-bottom:8px">
    <div style="font-weight:700">${new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
    <div style="font-size:12px;color:#6b7280">${n} unfinished task${n === 1 ? '' : 's'} · ${r.pending} pending · saved by ${dbEsc(r.savedBy)}${dbData[dbAdd(d, 1)] && (dbData[dbAdd(d, 1)].carried || []).some(c => c.from === d) ? ' · <b style="color:#166534">carried forward</b>' : ''}</div></div>`;
}
async function drRender() {
  const el = document.getElementById('drBody'); if (!el) return;
  if (!drIsManager()) { el.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280">Daily Reports are for managers and admins.</div>'; return; }
  if (!dbLoaded) await dbLoad();
  const dates = Object.keys(dbReports).sort().reverse();
  el.innerHTML = `<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
    <div style="width:290px;flex:none">${dates.length ? dates.map(drCard).join('') : '<div style="color:#9ca3af;padding:14px">No reports saved yet. Open Daily Briefing and press "Save today\'s report".</div>'}</div>
    <div id="drView" style="flex:1;min-width:300px"></div></div>`;
  if (drOpenDate && dbReports[drOpenDate]) drView(drOpenDate, true); else if (dates[0]) drView(dates[0], true);
}
function drView(d, keep) {
  const r = dbReports[d], box = document.getElementById('drView'); if (!r || !box) return;
  drOpenDate = d;
  const next = dbAdd(d, 1), open = r.tasksOpen || [], already = ((dbData[next] || {}).carried || []).filter(c => c.from === d).length;
  box.innerHTML = `<div style="background:#fff;border:1px solid #e8dfd4;border-radius:10px;padding:16px">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <b style="font-size:15px">${d}</b><span style="font-size:12px;color:#6b7280">saved ${dbEsc(new Date(r.savedAt).toLocaleString())} by ${dbEsc(r.savedBy)}</span>
      <span style="flex:1"></span>
      <button class="btn btn-secondary" onclick="drOpenBriefing('${d}')">Open that day's briefing</button>
      <button class="btn btn-primary" ${open.length ? '' : 'disabled'} onclick="dbCarry('${d}')">${already ? 'Carry again' : 'Carry'} ${open.length} unfinished task${open.length === 1 ? '' : 's'} to ${next}</button></div>
    ${open.length ? '<div style="margin-bottom:10px;font-size:13px"><b>Unfinished:</b><ul style="margin:4px 0 0 18px">' + open.map(t => `<li>${dbEsc(t.text)} — ${dbEsc(t.assignee || 'NOT ASSIGNED')}</li>`).join('') + '</ul></div>' : '<div style="color:#166534;font-weight:600;margin-bottom:10px">No unfinished tasks.</div>'}
    <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;margin:0">${dbEsc(r.text)}</pre></div>`;
  if (!keep) drRenderList();
}
function drRenderList() { const el = document.querySelector('#drBody > div > div'); if (el) el.innerHTML = Object.keys(dbReports).sort().reverse().map(drCard).join(''); }
function drOpenBriefing(d) { const b = document.getElementById('dailyBriefTabBtn'); dbDate = d; if (b) dbOpen(b); }
// Copies a report's unfinished tasks onto the next day's briefing as carried tasks (once each; "Carry again" skips ones already there).
async function dbCarry(d) {
  if (!drIsManager()) { showToast('Only managers can carry tasks forward.'); return; }
  const r = dbReports[d]; if (!r || !(r.tasksOpen || []).length) return;
  const next = dbAdd(d, 1), day = (dbData[next] = dbData[next] || {}); day.carried = day.carried || [];
  let added = 0;
  r.tasksOpen.forEach(t => {
    if (day.carried.some(c => c.from === d && c.text === t.text)) return;
    const id = 'carry:' + d + ':' + (day.carried.length + 1);
    day.carried.push({ id, text: t.text, from: t.from || d });
    if (t.assignee) { day.tasks = day.tasks || {}; day.tasks[id] = { assignee: t.assignee }; }
    added++;
  });
  await dbSaveState();
  showToast(added ? added + ' task' + (added === 1 ? '' : 's') + ' carried to ' + next + '.' : 'Those tasks are already on ' + next + '.');
  drView(d);
}
function drOpen(btn) {
  const prev = localStorage.getItem('ama_last_tab');
  switchTab('dailyreports', btn);
  try { localStorage.setItem('ama_last_tab', prev || 'dashboard'); } catch (e) {}
  drRender();
}
// non-managers don't get the saved-reports list in the briefing (reports hold staff hours)
const _drOrigRenderReports = dbRenderReports;
dbRenderReports = function () { _drOrigRenderReports(); const s = document.getElementById('dbriefPast'); if (s) s.style.display = drIsManager() ? '' : 'none'; };

(function () {
  try {
    if (!document.getElementById('tab-dailyreports')) {
      const brief = document.getElementById('tab-dailybrief'); if (!brief) return;
      const panel = document.createElement('div');
      panel.className = 'tab-panel'; panel.id = 'tab-dailyreports'; panel.style.flexDirection = 'column';
      panel.innerHTML = '<div class="panel-toolbar"><h2>Daily Reports</h2></div><div id="drBody" style="flex:1;overflow-y:auto;padding:20px;background:#f0ece4"></div>';
      brief.parentElement.insertBefore(panel, brief.nextSibling);
      const btn = document.createElement('button');
      btn.className = 'tab-btn'; btn.id = 'dailyReportsTabBtn'; btn.onclick = function () { drOpen(btn); };
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8"/></svg><span class="tab-label">Daily Reports</span>';
      const anchor = document.getElementById('dailyBriefTabBtn'); if (anchor) anchor.parentElement.insertBefore(btn, anchor.nextSibling);
    }
    // "Today's Briefing" shortcut at the top of the dashboard
    if (typeof buildDashboard === 'function' && !window._drDashWrapped) {
      window._drDashWrapped = true;
      const orig = buildDashboard;
      window.buildDashboard = buildDashboard = function () {
        const r = orig.apply(this, arguments);
        try {
          const el = document.getElementById('dbContent');
          if (el && !document.getElementById('drTodayCard')) {
            const c = document.createElement('div'); c.id = 'drTodayCard';
            c.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;align-items:center;background:#fff;border:1.5px solid #8a6d3b55;border-radius:12px;padding:12px 18px;margin-bottom:18px';
            c.innerHTML = `<div style="flex:1;min-width:220px"><div style="font-weight:700;font-size:15px">Today's Briefing</div><div style="font-size:12.5px;color:#6b7280">Arrivals, rooms, tours, tasks and who is working today.</div></div>
              <button class="btn btn-primary" onclick="dbDate=null;dbOpen(document.getElementById('dailyBriefTabBtn'))">Open Today's Briefing</button>` +
              (drIsManager() ? `<button class="btn btn-secondary" onclick="drOpen(document.getElementById('dailyReportsTabBtn'))">Daily Reports</button>` : '');
            el.insertBefore(c, el.firstChild);
          }
        } catch (e) { console.warn('[daily-reports]', e); }
        return r;
      };
    }
  } catch (e) { console.warn('[daily-reports]', e); }
})();
