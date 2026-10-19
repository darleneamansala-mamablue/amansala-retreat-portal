// ===== staff-schedules.js — weekly staff schedules inside the portal (Darlene 2026-10-19) =====
// The managers keep one weekly grid per department (Reception, Cocina, Meseros, Camaristas, Mantenimiento) in a spreadsheet: a name, then one code per
// day. This page lets you COPY the grid from the spreadsheet and PASTE it here; the portal reads it, shows it back for checking, and saves it per week.
// The Staffing Forecast then compares what each day needs with who is actually working. Standalone; own sidebar page + app_store key 'staff_schedules'.
// Codes:  AM / PM = works that half of the day (hours not given)   9-5, 8-4, 1-9, 10-6, "9 a 5" = works those hours   FD / RSV next to a time = the post (front desk / reservations)
//         D, OFF = day off   PSG = unpaid leave   INC = sick leave   PERMISO = permission   VACACIONES = vacation.   Anything else is shown as "not recognised".
// Nothing is guessed: a week nobody has pasted is "not entered", and hours are only used where the sheet gives hours.
const SS_KEY = 'staff_schedules';
const SS_DEPTS = [['reception', 'Reception / Front Desk'], ['kitchen', 'Kitchen (Cocina)'], ['waitstaff', 'Restaurant (Meseros)'], ['housekeeping', 'Housekeeping (Camaristas)'], ['maintenance', 'Maintenance (Mantenimiento)']];
const SS_OFF = { D: 'Day off', OFF: 'Day off', PSG: 'Unpaid leave', INC: 'Sick leave', PERMISO: 'Permission', VACACIONES: 'Vacation' };
let ssData = {}, ssLoaded = false, ssWeek = null, ssDept = 'reception', ssPreview = null;

function ssEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function ssISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function ssAdd(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return ssISO(d); }
function ssMonday(iso) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ssISO(d); }
async function ssLoad() { try { const { data } = await db.from('app_store').select('value').eq('key', SS_KEY).maybeSingle(); ssData = (data && data.value) || {}; } catch (e) { console.warn('[staff-schedules] load', e); } ssLoaded = true; }

// ---- reading one cell ----
function ssShift(code) {
  const c = String(code || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (c === 'AM' || c === 'PM') return { working: true, half: c };
  const m = /^(\d{1,2})(?::\d{2})?\s*(?:-|–|A)\s*(\d{1,2})(?::\d{2})?$/.exec(c);
  if (m) { let s = Number(m[1]), e = Number(m[2]); if (s < 7) s += 12; if (e <= s) e += 12; return { working: true, start: s, end: e }; }
  if (SS_OFF[c]) return { working: false, reason: SS_OFF[c] };
  return { working: false, reason: 'Not recognised', unknown: true };
}
const SS_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function ssDate(t, yearHint) {
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t); if (m) return m[3] + '-' + String(m[1]).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0');
  m = /^([A-Za-z]+)\s+(\d{1,2})$/.exec(t); if (m) { const i = SS_MONTHS.indexOf(m[1].toLowerCase()); if (i >= 0) return yearHint + '-' + String((i % 12) + 1).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0'); }
  return null;
}
// the pasted grid -> { weekStart|null, rows:[{name, section, days:[{code, tag}]}], skipped:[...] }
function ssParse(text, yearHint) {
  const out = { weekStart: null, rows: [], skipped: [] }, WD = /^(mon|tue|wed|thu|fri|sat|sun|lun|mar|mie|mié|jue|vie|sab|sáb|dom)/i;
  let section = '';
  String(text || '').split(/\r?\n/).forEach(line => {
    const ne = line.split('\t').map(x => x.trim()).filter(Boolean); if (!ne.length) return;
    const dates = ne.map(t => ssDate(t, yearHint)).filter(Boolean);
    if (dates.length >= 5) { if (!out.weekStart) out.weekStart = dates[0]; return; }
    if (ne.length >= 5 && ne.filter(t => WD.test(t)).length >= 5) return;
    if (/^(salidas|llegadas?|hab\.?|staff|nombre|name|%)/i.test(ne[0])) return;
    if (ne.length === 1) { section = ne[0]; return; }
    const name = ne[0], days = [];
    ne.slice(1).forEach(t => { if (/^(FD|RSV)$/i.test(t) && days.length) days[days.length - 1].tag = t.toUpperCase(); else days.push({ code: t }); });
    if (days.length < 7) { out.skipped.push(name + ' (found ' + days.length + ' days, need 7)'); return; }
    out.rows.push({ name, section, days: days.slice(0, 7) });
  });
  return out;
}
// everyone on the schedule for a date: { reception: [..]|null, kitchen: [..]|null, ... } (null = that week was never entered)
function ssWorkersOn(date) {
  const wk = ssMonday(date), i = Math.round((new Date(date + 'T12:00:00') - new Date(wk + 'T12:00:00')) / 86400000), res = {};
  SS_DEPTS.forEach(([k]) => {
    const rows = ((ssData[wk] || {})[k] || {}).rows;
    res[k] = rows ? rows.map(r => { const d = r.days[i] || {}; return { name: r.name, section: r.section, code: d.code, tag: d.tag || '', ...ssShift(d.code) }; }) : null;
  });
  return res;
}
function ssSummary(w) { const on = (w || []).filter(x => x.working); return { total: on.length, am: on.filter(x => x.half === 'AM').length, pm: on.filter(x => x.half === 'PM').length }; }

// ---- page ----
async function ssSave() {
  if (!ssPreview || !ssPreview.rows.length) return;
  const wk = ssMonday(ssPreview.weekStart || ssWeek), p = ssPreview;
  for (let i = 0; i < 8; i++) {
    const { data: row } = await db.from('app_store').select('value,updated_at').eq('key', SS_KEY).maybeSingle();
    const next = row && row.value ? JSON.parse(JSON.stringify(row.value)) : {};
    next[wk] = next[wk] || {}; next[wk][ssDept] = { rows: p.rows, savedAt: new Date().toISOString(), savedBy: (typeof getCurrentSession === 'function' && getCurrentSession() && getCurrentSession().name) || 'staff' };
    let ok = false;
    if (row) { const { data: upd, error } = await db.from('app_store').update({ value: next, updated_at: new Date().toISOString() }).eq('key', SS_KEY).eq('updated_at', row.updated_at).select('key'); if (error) { showToast('Could not save.'); return; } ok = !!(upd && upd.length); }
    else { const { error } = await db.from('app_store').insert({ key: SS_KEY, value: next, updated_at: new Date().toISOString() }); if (error) { showToast('Could not save.'); return; } ok = true; }
    if (ok) { ssData = next; ssPreview = null; ssWeek = wk; showToast('Schedule saved for the week of ' + wk + '.'); ssRender(); return; }
    await new Promise(r => setTimeout(r, 80 + Math.random() * 200));
  }
  showToast('Could not save. Try again.');
}
function ssRead() {
  const t = document.getElementById('ssPaste').value, yr = (ssWeek || ssISO(new Date())).slice(0, 4);
  ssPreview = ssParse(t, yr);
  if (!ssPreview.weekStart) ssPreview.weekStart = ssWeek;
  ssRender();
}
function ssGrid(rows, wk) {
  const days = Array.from({ length: 7 }, (_, i) => ssAdd(wk, i)), th = 'padding:5px 7px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;border-bottom:1.5px solid #e8dfd4;text-align:center;white-space:nowrap';
  let html = `<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:12.5px;width:100%"><thead><tr><th style="${th};text-align:left">Name</th>${days.map(d => `<th style="${th}">${new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</th>`).join('')}</tr></thead><tbody>`, sec = null;
  rows.forEach(r => {
    if (r.section !== sec) { sec = r.section; if (sec) html += `<tr><td colspan="8" style="padding:5px 7px;background:#f5f1eb;font-weight:700;font-size:12px">${ssEsc(sec)}</td></tr>`; }
    html += `<tr style="border-top:1px solid #f0ebe0"><td style="padding:5px 7px;font-weight:600;white-space:nowrap">${ssEsc(r.name)}</td>${r.days.map(d => { const s = ssShift(d.code); return `<td style="padding:4px 6px;text-align:center;${s.working ? 'background:#ecfdf5;color:#166534' : s.unknown ? 'background:#fffbeb;color:#92400e' : 'background:#fef2f2;color:#991b1b'};font-weight:600" title="${ssEsc(s.working ? 'Working' : s.reason)}">${ssEsc(d.code)}${d.tag ? ' <span style="font-size:10px;color:#6b7280">' + d.tag + '</span>' : ''}</td>`; }).join('')}</tr>`;
  });
  return html + '</tbody></table></div>';
}
async function ssRender() {
  const el = document.getElementById('ssBody'); if (!el) return;
  if (!ssLoaded) await ssLoad();
  if (!ssWeek) ssWeek = ssMonday(ssISO(new Date()));
  const saved = (ssData[ssWeek] || {})[ssDept], card = 'background:#fff;border:1px solid #e8dfd4;border-radius:10px;padding:14px 16px;margin-bottom:14px';
  let html = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
    <button class="btn btn-secondary" onclick="ssWeek=ssAdd(ssWeek,-7);ssPreview=null;ssRender()">&#8249;</button>
    <b style="min-width:200px;text-align:center">Week of ${new Date(ssWeek + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (Mon to Sun)</b>
    <button class="btn btn-secondary" onclick="ssWeek=ssAdd(ssWeek,7);ssPreview=null;ssRender()">&#8250;</button>
    <button class="btn btn-secondary" onclick="ssWeek=ssMonday(ssISO(new Date()));ssPreview=null;ssRender()">This week</button>
    <span style="width:10px"></span>${SS_DEPTS.map(([k, l]) => { const has = !!((ssData[ssWeek] || {})[k]); return `<button onclick="ssDept='${k}';ssPreview=null;ssRender()" style="padding:6px 12px;border-radius:99px;border:1.5px solid ${ssDept === k ? '#2d6a6a' : '#d6cfc4'};background:${ssDept === k ? '#2d6a6a' : '#fff'};color:${ssDept === k ? '#fff' : '#374151'};font-weight:700;font-size:12px;cursor:pointer">${l} ${has ? '&#10003;' : ''}</button>`; }).join('')}</div>`;
  html += `<div style="${card}"><div style="font-weight:700;margin-bottom:4px">1. Paste this department's schedule</div><div style="font-size:12.5px;color:#6b7280;margin-bottom:8px">In your spreadsheet, select the whole grid for ${ssEsc(SS_DEPTS.find(d => d[0] === ssDept)[1])} (names and the 7 days, including the date row if you can), copy it, and paste it here. Pick the right week above first.</div>
    <textarea id="ssPaste" rows="6" placeholder="Paste here" style="width:100%;padding:9px;border:1.5px solid #d6cfc4;border-radius:8px;font-family:monospace;font-size:12px"></textarea>
    <div style="margin-top:8px"><button class="btn btn-primary" onclick="ssRead()">Read it</button></div></div>`;
  if (ssPreview) {
    const p = ssPreview, unk = p.rows.reduce((n, r) => n + r.days.filter(d => ssShift(d.code).unknown).length, 0);
    html += `<div style="${card};border-color:#2d6a6a"><div style="font-weight:700;margin-bottom:6px">2. Check it, then save for the week of ${ssEsc(ssMonday(p.weekStart || ssWeek))}</div>
      ${p.weekStart && ssMonday(p.weekStart) !== ssWeek ? `<div style="color:#b45309;font-size:12.5px;margin-bottom:6px">The dates in your paste start ${ssEsc(p.weekStart)}, so it will be saved to that week, not the one on screen.</div>` : ''}
      ${p.rows.length ? ssGrid(p.rows, ssMonday(p.weekStart || ssWeek)) : '<div style="color:#991b1b;font-weight:600">I could not find any staff rows. Each row needs a name followed by 7 days.</div>'}
      ${p.skipped.length ? `<div style="margin-top:8px;color:#b45309;font-size:12.5px">Skipped rows: ${p.skipped.map(ssEsc).join('; ')}</div>` : ''}
      ${unk ? `<div style="margin-top:6px;color:#b45309;font-size:12.5px">${unk} cell${unk === 1 ? ' was' : 's were'} not recognised (yellow). They count as not working until fixed in the spreadsheet.</div>` : ''}
      <div style="margin-top:10px;display:flex;gap:8px"><button class="btn btn-primary" ${p.rows.length ? '' : 'disabled'} onclick="ssSave()">Save this schedule</button><button class="btn btn-secondary" onclick="ssPreview=null;ssRender()">Cancel</button></div></div>`;
  }
  html += `<div style="${card}"><div style="font-weight:700;margin-bottom:6px">Saved: ${ssEsc(SS_DEPTS.find(d => d[0] === ssDept)[1])}, this week</div>${saved ? ssGrid(saved.rows, ssWeek) + `<div style="font-size:11.5px;color:#9ca3af;margin-top:6px">Saved ${ssEsc(new Date(saved.savedAt).toLocaleString())} by ${ssEsc(saved.savedBy)}. Pasting again for this week replaces it.</div>` : '<div style="color:#9ca3af">Not entered for this week. The Staffing Forecast shows this as not connected, never as zero staff.</div>'}</div>`;
  el.innerHTML = html;
}
function ssOpen(btn) {
  const prev = localStorage.getItem('ama_last_tab');
  switchTab('staffsched', btn);
  try { localStorage.setItem('ama_last_tab', prev || 'dashboard'); } catch (e) {}
  ssLoad().then(ssRender);
}
(function () {
  try {
    if (document.getElementById('tab-staffsched')) return;
    const anchorPanel = document.getElementById('tab-staffingfc') || document.getElementById('tab-dailyreports') || document.getElementById('tab-dailybrief') || document.getElementById('tab-menueditor'); if (!anchorPanel) return;
    const panel = document.createElement('div');
    panel.className = 'tab-panel'; panel.id = 'tab-staffsched'; panel.style.flexDirection = 'column';
    panel.innerHTML = '<div class="panel-toolbar"><h2>Staff Schedules</h2><div class="toolbar-right"><span style="font-size:12px;color:#7f8c9a">Paste each week\'s schedule from your spreadsheet.</span></div></div><div id="ssBody" style="flex:1;overflow-y:auto;padding:20px;background:#f0ece4"></div>';
    anchorPanel.parentElement.insertBefore(panel, anchorPanel.nextSibling);
    const btn = document.createElement('button');
    btn.className = 'tab-btn'; btn.id = 'staffSchedTabBtn'; btn.onclick = function () { ssOpen(btn); };
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg><span class="tab-label">Staff Schedules</span>';
    const a = document.getElementById('staffingFcTabBtn') || document.getElementById('dailyReportsTabBtn') || document.getElementById('dailyBriefTabBtn');
    if (a) a.parentElement.insertBefore(btn, a.nextSibling); else anchorPanel.parentElement.appendChild(btn);
  } catch (e) { console.warn('[staff-schedules]', e); }
})();
