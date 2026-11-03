// ===== daily-shalas.js — the Daily Shalas page, opened by the short link /dailyshalas =====
// Loaded as a classic script AFTER teacher-portal.js and daily-briefing.js; shares global scope.
// Standalone: adds a "Daily Shalas" button to the sidebar and its own page. It lists the day's classes in time order
// (the SAME skedGetRetreatEvents(date) the scheduler and the Daily Briefing draw from) with the shala, start and end time and
// the teacher's room-needs note. Whoever is signed in taps Start when they begin getting the shala ready and Finish when it is
// ready; the page keeps who did it and how long it took.
// Saved per day in app_store 'daily_shalas_YYYY-MM-DD' = { [eventId]: { startedBy, startedAt, finishedBy, finishedAt } }.
// One small key per day, re-read before every write, so two people ticking different classes at once do not overwrite each other.

let dsDate = null, dsState = {}, dsEvents = [];

function dsEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function dsISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dsAdd(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return dsISO(d); }
function dsFmtT(t) { if (!t) return ''; const [h, m] = String(t).split(':').map(Number); return ((h % 12) || 12) + ':' + String(m || 0).padStart(2, '0') + (h >= 12 ? ' pm' : ' am'); }
function dsClock(iso) { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
function dsWho() { try { const s = typeof getCurrentSession === 'function' && getCurrentSession(); return (s && s.name) || 'staff'; } catch (e) { return 'staff'; } }
function dsShala(id) { try { return (typeof SHALAS !== 'undefined' && (SHALAS.find(s => s.id === id) || {}).name) || String(id || '').replace(/_/g, ' '); } catch (e) { return String(id || ''); } }
function dsDur(a, b) {
  const min = Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
  return min < 60 ? min + ' min' : Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0') + ' min';
}
const dsKey = d => 'daily_shalas_' + d;
async function dsFetch(d) {
  try { const { data } = await db.from('app_store').select('value').eq('key', dsKey(d)).maybeSingle(); return (data && data.value) || {}; } catch (e) { return {}; }
}

// the day's classes, in time order (opening circles, tours and ceremonies are not shala set-ups)
function dsClasses(date) {
  let evs = []; try { evs = typeof skedGetRetreatEvents === 'function' ? skedGetRetreatEvents(date) : []; } catch (e) { console.warn('[daily-shalas]', e); }
  const needField = { morn: 'morningNotes', morn_arr: 'morningNotes', morn_dep: 'morningNotes', aft: 'afternoonNotes', arr: 'arrivalNotes', dep: 'departureNotes' };
  return evs.filter(e => {
    const id = String(e.id || '');
    return /_(morn|aft|arr|dep|sunrise|workshop|morn_arr|morn_dep)(_|$)/.test(id) && !/_opt_/.test(id) && !/optional/.test(String(e.resourceId || ''));
  }).map(e => {
    const m = /_(morn_arr|morn_dep|morn|aft|arr|dep)$/.exec(String(e.id)), bk = m && (AppData.bookings || []).find(b => b.id === e.bkId);
    return { id: String(e.id), start: e.startTime, end: e.endTime, who: e.title || '', what: e.subtitle || '', shala: dsShala(e.resourceId), need: bk ? String((bk.scheduleRequest || {})[needField[m[1]]] || '').trim() : '' };
  }).sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

async function dsRender() {
  const el = document.getElementById('dshalaBody'); if (!el) return;
  if (!dsDate) dsDate = dsISO(new Date());
  dsState = await dsFetch(dsDate);
  dsEvents = dsClasses(dsDate);
  const lab = document.getElementById('dshalaDate');
  if (lab) lab.textContent = new Date(dsDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (!dsEvents.length) { el.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;background:#fff;border-radius:10px">No classes scheduled this day.</div>'; return; }
  const done = dsEvents.filter(e => (dsState[e.id] || {}).finishedAt).length;
  const btn = 'padding:9px 18px;font-size:14px;font-weight:700;border:none;border-radius:8px;cursor:pointer;font-family:\'Jost\',sans-serif;color:#fff';
  el.innerHTML = `<div style="font-size:13px;color:#6b7280;margin:0 0 10px">${done} of ${dsEvents.length} shalas ready. Tap <b>Start</b> when you begin setting up a shala and <b>Finish</b> when it is ready.</div>` +
    dsEvents.map(e => {
      const r = dsState[e.id] || {}, id = dsEsc(e.id).replace(/'/g, "\\'");
      let action;
      if (r.finishedAt) action = `<div style="color:#166534;font-weight:700">&#10003; Ready · done by ${dsEsc(r.finishedBy)}</div><div style="font-size:12.5px;color:#4b5563">Started ${dsClock(r.startedAt)} by ${dsEsc(r.startedBy)} · finished ${dsClock(r.finishedAt)} · took <b>${dsDur(r.startedAt, r.finishedAt)}</b> <a href="#" onclick="dsUndo('${id}');return false" style="margin-left:6px">undo</a></div>`;
      else if (r.startedAt) action = `<div style="color:#92400e;font-weight:700">In progress · started ${dsClock(r.startedAt)} by ${dsEsc(r.startedBy)}</div><button onclick="dsAct('${id}','finish')" style="${btn};background:#166534;margin-top:6px">Finish</button> <a href="#" onclick="dsUndo('${id}');return false" style="font-size:12.5px;margin-left:6px">undo</a>`;
      else action = `<button onclick="dsAct('${id}','start')" style="${btn};background:#2d6a6a">Start</button>`;
      return `<div style="background:#fff;border:1px solid #e8dfd4;border-left:5px solid ${r.finishedAt ? '#16a34a' : r.startedAt ? '#d97706' : '#2d6a6a'};border-radius:10px;padding:12px 14px;margin-bottom:10px">
        <div style="font-size:15px;font-weight:700">${dsFmtT(e.start)}${e.end ? ' – ' + dsFmtT(e.end) : ''} · <span style="color:#2d6a6a">${dsEsc(e.shala)}</span></div>
        <div style="font-size:13.5px;margin:2px 0 6px">${dsEsc(e.who)} · ${dsEsc(e.what)}</div>
        ${e.need ? `<div style="font-size:13px;margin:0 0 8px;padding:6px 10px;background:#faf8f4;border-radius:7px"><b>Room needs:</b> ${dsEsc(e.need)}</div>` : ''}
        ${action}</div>`;
    }).join('');
}

// re-read the day, change this one class, write it back
async function dsAct(id, what) {
  const cur = await dsFetch(dsDate), r = cur[id] || {}, now = new Date().toISOString();
  if (what === 'start' && !r.startedAt) { r.startedAt = now; r.startedBy = dsWho(); }
  else if (what === 'finish' && !r.finishedAt) { if (!r.startedAt) { r.startedAt = now; r.startedBy = dsWho(); } r.finishedAt = now; r.finishedBy = dsWho(); }
  cur[id] = r;
  try { await db.from('app_store').upsert({ key: dsKey(dsDate), value: cur, updated_at: now }); } catch (e) { if (typeof showToast === 'function') showToast('Could not save. Check your connection and try again.'); return; }
  dsRender();
}
async function dsUndo(id) {
  if (!confirm('Clear this shala\'s start/finish times?')) return;
  const cur = await dsFetch(dsDate); delete cur[id];
  try { await db.from('app_store').upsert({ key: dsKey(dsDate), value: cur, updated_at: new Date().toISOString() }); } catch (e) { if (typeof showToast === 'function') showToast('Could not save.'); return; }
  dsRender();
}
function dsNav(n) { dsDate = n === 0 ? dsISO(new Date()) : dsAdd(dsDate || dsISO(new Date()), n); dsRender(); }
function dsOpen(btn) {
  const prev = localStorage.getItem('ama_last_tab');
  switchTab('dailyshalas', btn);
  try { localStorage.setItem('ama_last_tab', prev || 'dashboard'); } catch (e) {}
  dsRender();
}
(function () {
  try {
    if (document.getElementById('tab-dailyshalas')) return;
    const me = document.getElementById('tab-menueditor'); if (!me) return;
    const panel = document.createElement('div');
    panel.className = 'tab-panel'; panel.id = 'tab-dailyshalas'; panel.style.flexDirection = 'column';
    panel.innerHTML = `<div class="panel-toolbar"><h2>Daily Shalas</h2>
      <div class="toolbar-right" style="gap:8px">
        <button class="btn btn-secondary" onclick="dsNav(-1)">&#8249;</button><span id="dshalaDate" style="font-weight:700;font-size:13px;min-width:190px;text-align:center"></span><button class="btn btn-secondary" onclick="dsNav(1)">&#8250;</button>
        <button class="btn btn-secondary" onclick="dsNav(0)">Today</button></div></div>
      <div id="dshalaBody" style="flex:1;overflow-y:auto;padding:20px;background:#f0ece4"><div style="padding:40px;text-align:center;color:#9ca3af">Loading…</div></div>`;
    me.parentElement.insertBefore(panel, me.nextSibling);
    const btn = document.createElement('button');
    btn.className = 'tab-btn'; btn.id = 'dailyShalasTabBtn';
    btn.onclick = function () { dsOpen(btn); };
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M10 21v-6h4v6"/></svg><span class="tab-label">Daily Shalas</span>';
    const brief = document.getElementById('dailyBriefTabBtn');
    if (brief) brief.parentElement.insertBefore(btn, brief.nextSibling); else me.parentElement.appendChild(btn);
    // the short link /dailyshalas lands on booking-hub.html?go=dailyshalas: once someone is signed in, open this page
    if (new URLSearchParams(location.search).get('go') === 'dailyshalas') {
      let tries = 0;
      const t = setInterval(() => {
        const signedIn = typeof getCurrentSession === 'function' && getCurrentSession();
        if (signedIn && typeof switchTab === 'function' && typeof AppData !== 'undefined' && (AppData.bookings || []).length) { clearInterval(t); dsOpen(btn); }
        else if (++tries > 600) clearInterval(t);   // give up after ~5 minutes on the login screen
      }, 500);
    }
  } catch (e) { console.warn('[daily-shalas]', e); }
})();
