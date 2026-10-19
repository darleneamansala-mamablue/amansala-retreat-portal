// ===== daily-briefing.js — the Daily Briefing page (Darlene 2026-10-18) =====
// Loaded as a classic script AFTER teacher-portal.js, activity-sheet.js, housekeeping.js, transport.js, activity-leader.js; shares global scope.
// Standalone: adds a "Daily Briefing" button to the sidebar and its own page. Reads, never rewrites, the portal's own data:
//   arrivals / departures      bookings (start / end date) and the Housekeeping occupancy
//   room readiness + A/C       Housekeeping room status (+ the A/C 24h flag on the room)
//   Salamon's arrivals         Transport (arrivals today, driver, flight, driver confirmation and last update)
//   classes, opening circles,  skedGetRetreatEvents(date), the SAME function the main scheduler draws from, so the briefing,
//   tours, extra activities    the main scheduler and a teacher's personal schedule can never disagree
//   tour preparation           driver (Activities page), participants (sign-ups / prepaid), special requests (teacher's schedule form)
// What the portal does not hold (attendance of Housekeeping / Cajeras / Kitchen / Restaurant Captain / Front Desk, allergies, the tour-snack
// note on the kitchen fridge, orientations, the arrival checklist) is typed here and saved per day in app_store 'daily_briefing'.
// Anything missing shows "Pending confirmation". Unfinished tasks are red. "Save today's report" stores a dated copy in 'daily_reports'.

const DB_KEY = 'daily_briefing', DB_REPORTS = 'daily_reports';
const DB_TOURS = ['ao1', 'ao2', 'ao3', 'ao6', 'ao7', 'ao16'], DB_CEREMONIES = ['ao4', 'ao5', 'ao9', 'ao10'];
const DB_DEPTS = ['Housekeeping', 'Cajeras', 'Kitchen', 'Restaurant Captain', 'Front Desk'];
const DB_CHECKLIST = [
  ['meet', 'Meet the teacher'], ['review', 'Review the schedule and special requests with the teacher'], ['allergies', 'Record allergies'],
  ['tip', 'Give the tip envelope'], ['sound', 'Do the sound check'], ['room', 'Check the room together'],
  ['departure', 'Confirm departure details'], ['spa', 'Explain the complimentary spa service'], ['circle', 'Assign the opening-circle leader'],
];
let dbDate = null, dbData = {}, dbReports = {}, dbLoaded = false, dbCtx = null;

function dbEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function dbISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dbAdd(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return dbISO(d); }
function dbFmtT(t) { if (!t) return ''; const [h, m] = String(t).split(':').map(Number); return ((h % 12) || 12) + ':' + String(m || 0).padStart(2, '0') + (h >= 12 ? ' pm' : ' am'); }
function dbName(id) { return ((typeof ADD_ONS !== 'undefined' ? ADD_ONS : []).find(a => a.id === id) || {}).name || id; }
function dbStaff() { try { if (typeof alStaff === 'function') return alStaff(''); } catch (e) {} return typeof TOUR_GUIDE_NAMES !== 'undefined' ? TOUR_GUIDE_NAMES.slice() : []; }
function dbWho() { try { return (typeof getCurrentSession === 'function' && getCurrentSession() && getCurrentSession().name) || (typeof userName !== 'undefined' && userName) || 'staff'; } catch (e) { return 'staff'; } }
const PENDING = '<span style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:99px;padding:1px 9px;font-size:11px;font-weight:700;white-space:nowrap">Pending confirmation</span>';

// ---------- saved state ----------
async function dbLoad() {
  try {
    const { data } = await db.from('app_store').select('value').eq('key', DB_KEY).maybeSingle(); if (data && data.value) dbData = data.value;
    const r = await db.from('app_store').select('value').eq('key', DB_REPORTS).maybeSingle(); if (r.data && r.data.value) dbReports = r.data.value;
  } catch (e) {}
  dbLoaded = true;
}
async function dbSaveState() { try { await db.from('app_store').upsert({ key: DB_KEY, value: dbData, updated_at: new Date().toISOString() }); } catch (e) {} }
function dbDay() { return (dbData[dbDate] = dbData[dbDate] || {}); }
function dbSet(path, val) {          // path like 'tasks.snack:ao6.done'
  const parts = path.split('.'); let o = dbDay();
  parts.slice(0, -1).forEach(p => { o = (o[p] = o[p] || {}); });
  o[parts[parts.length - 1]] = val; o._by = dbWho(); o._at = new Date().toISOString();
  dbSaveState();
}
function dbGet(path) { let o = dbDay(); for (const p of path.split('.')) { if (o == null) return undefined; o = o[p]; } return o; }

// ---------- gather today's information ----------
function dbBookingsOn(field, date) { return (AppData.bookings || []).filter(b => b.status !== 'cancelled' && !(b.flags || []).includes('archived') && String(b[field] || '').slice(0, 10) === date); }
function dbInHouse(date) { return (AppData.bookings || []).filter(b => b.status !== 'cancelled' && !(b.flags || []).includes('archived') && b.startDate <= date && date <= b.endDate && b.bookingType !== 'room_only'); }
function dbGuestNames(bk) {
  const out = [];
  (AppData.regs || []).filter(r => r.bookingId === bk.id && !r.cancelled).forEach(r => (r.guests || []).forEach(g => { if (g && g.name && !g.cancelled) out.push(g.name); }));
  return out;
}
function dbParticipants(bk, aoId) {
  const act = (bk.retreatActivities || []).find(a => a.aoId === aoId);
  if (act && act.prepaid) return { names: dbGuestNames(bk), basis: 'included for the whole group' };
  const sups = (typeof actSheetSignups !== 'undefined' && actSheetSignups[bk.id]) || [];
  const names = sups.filter(s => (s.activities || []).includes(aoId)).map(s => ((s.firstName || '') + ' ' + (s.lastName || '')).trim()).filter(Boolean);
  return { names, basis: 'signed up' };
}
async function dbGather(date) {
  const g = { date, arrivals: [], departures: [], rooms: [], transport: [], events: [], tours: [], special: [], notReady: [], ac: [] };
  g.arrivals = dbBookingsOn('startDate', date); g.departures = dbBookingsOn('endDate', date);
  // room readiness (Housekeeping) — only meaningful for today
  g.hkOk = false;
  try {
    if (date === dbISO(new Date()) && typeof hkOccupancyToday === 'function') {
      if (typeof hkDate !== 'undefined' && !hkDate) hkDate = dbISO(new Date());
      try { if (typeof hkLoadCleanLog === 'function') await hkLoadCleanLog(); } catch (e) {}
      const occ = hkOccupancyToday();
      Object.keys(occ).forEach(room => {
        const o = occ[room]; if (o.type !== 'arriving' && o.type !== 'turnover') return;
        const arr = o.type === 'turnover' ? o.arriving : o;
        const st = hkEffectiveStatus(room, occ);
        const reg = (AppData.regs || []).find(r => r.room === room && (AppData.bookings || []).some(b => b.id === r.bookingId && b.startDate === date));
        g.rooms.push({ room, status: st, who: arr.retreatName || '', ac24h: !!(reg && reg.ac24h), turnover: o.type === 'turnover' });
      });
      g.hkOk = true;
    }
  } catch (e) { console.warn('[daily-briefing] housekeeping', e); }
  g.rooms.sort((a, b) => String(a.room).localeCompare(String(b.room), undefined, { numeric: true }));
  // transport
  try {
    const subs = typeof loadTransport === 'function' ? loadTransport() : [];
    subs.filter(s => s.arrivalDate === date).forEach(s => g.transport.push({ kind: 'arrival', sub: s, name: trDrvAssignedName(s, 'arrival'), rec: typeof trDrvRec === 'function' ? trDrvRec(s, 'arrival') : null }));
    subs.filter(s => s.departureDate === date).forEach(s => g.transport.push({ kind: 'departure', sub: s, name: trDrvAssignedName(s, 'departure'), rec: typeof trDrvRec === 'function' ? trDrvRec(s, 'departure') : null }));
  } catch (e) { console.warn('[daily-briefing] transport', e); }
  // the main scheduler's own events
  try { g.events = typeof skedGetRetreatEvents === 'function' ? skedGetRetreatEvents(date) : []; } catch (e) { console.warn('[daily-briefing] scheduler', e); }
  return g;
}
function dbClassify(ev) {
  const id = String(ev.id || '');
  if (/_opencircle$/.test(id)) return 'circle';
  if (/_prepaid_opt_/.test(id) || /_opt_/.test(id)) return 'skip';              // duplicate "optional" columns of the same activity
  const m = /_ao_(ao\d+)/.exec(id);
  if (m) return DB_TOURS.includes(m[1]) ? 'tour' : 'extra';
  if (/_(morn|aft|arr|dep|sunrise|workshop|morn_arr|morn_dep)(_|$)/.test(id)) return 'class';
  return 'other';
}

// ---------- tasks (everything someone still has to do today) ----------
function dbBuildTasks(g) {
  const T = [];
  const add = (id, text, auto) => T.push({ id, text, auto: auto || null });
  g.rooms.filter(r => r.status !== 'clean').forEach(r => add('room:' + r.room, `Room ${r.room} (${r.who || 'arriving'}) is not ready: ${r.status}`));
  if (g.arrivals.length) add('ac:' + g.date, 'Turn the A/C on in the arriving rooms before the guests get there');
  g.tours.forEach(t => {
    add('snack:' + t.aoId, `Tour snack request for ${t.name} posted on the kitchen fridge`);
    add('driver:' + t.aoId, `Driver for ${t.name}`, t.driver ? { done: true, note: t.driver } : null);
  });
  g.special.forEach(s => add('special:' + s.id, `${s.who}: ${s.text}`));
  (dbDay().carried || []).forEach(c => add(c.id, `Carried from ${c.from}: ${c.text}`));   // unfinished tasks a manager carried in from an earlier day (daily-reports.js)
  return T;
}

// ---------- rendering ----------
function dbAssign(taskId) {
  const cur = dbGet('tasks.' + taskId + '.assignee') || '';
  return `<select onchange="dbSet('tasks.${taskId}.assignee',this.value);dbRender()" style="padding:5px 8px;border:1.5px solid ${cur ? '#d6cfc4' : '#fca5a5'};border-radius:7px;font-size:12.5px;background:${cur ? '#fff' : '#fef2f2'}"><option value="">— assign someone —</option>${[...new Set([...dbStaff(), cur].filter(Boolean))].map(n => `<option value="${dbEsc(n)}" ${n === cur ? 'selected' : ''}>${dbEsc(n)}</option>`).join('')}</select>`;
}
function dbTaskRow(t) {
  const done = t.auto ? t.auto.done : !!dbGet('tasks.' + t.id + '.done');
  const assignee = dbGet('tasks.' + t.id + '.assignee');
  const bad = !done;
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:9px 12px;border-top:1px solid #f0ebe0;background:${bad ? '#fff7f7' : '#f7fdf9'}">
    <label style="display:flex;align-items:center;gap:8px;flex:1;min-width:260px;font-size:13.5px;font-weight:600;color:${bad ? '#991b1b' : '#166534'}">
      <input type="checkbox" ${done ? 'checked' : ''} ${t.auto ? 'disabled' : ''} onchange="dbSet('tasks.${t.id}.done',this.checked);dbRender()"> ${dbEsc(t.text)}${t.auto && t.auto.note ? ' — ' + dbEsc(t.auto.note) : ''}</label>
    ${done ? (assignee ? `<span style="font-size:12px;color:#166534">${dbEsc(assignee)}</span>` : '') : dbAssign(t.id)}</div>`;
}
const dbCard = (title, inner, count) => `<div style="background:#fff;border-radius:10px;margin-bottom:14px;overflow:hidden;border:1px solid #e8dfd4"><div style="padding:9px 14px;background:#f5f1eb;font-weight:700;font-size:13.5px;display:flex;justify-content:space-between;gap:10px">${title}${count != null ? `<span style="font-weight:600;color:#6b7280">${count}</span>` : ''}</div>${inner}</div>`;
const dbRow = (inner, bad) => `<div style="padding:8px 14px;border-top:1px solid #f0ebe0;font-size:13.5px;${bad ? 'background:#fff7f7' : ''}">${inner}</div>`;
const dbNone = t => `<div style="padding:12px 14px;color:#9ca3af;font-size:13px">${t}</div>`;

async function dbRender() {
  const el = document.getElementById('dbriefBody'); if (!el) return;
  if (!dbLoaded) await dbLoad();
  try { if (typeof actSheetLoadSignups === 'function') await actSheetLoadSignups(); } catch (e) {}
  try { if (typeof actOpsLoad === 'function') await actOpsLoad(); } catch (e) {}
  if (!dbDate) dbDate = dbISO(new Date());
  const g = await dbGather(dbDate);
  const pend = [];                    // what is still "Pending confirmation"
  const fmtLong = new Date(dbDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  // classify scheduler events
  const buckets = { circle: [], class: [], tour: [], extra: [] };
  g.events.forEach(ev => { const c = dbClassify(ev); if (buckets[c]) buckets[c].push(ev); });
  Object.keys(buckets).forEach(k => buckets[k].sort((a, b) => String(a.startTime).localeCompare(String(b.startTime))));
  const evLine = ev => `<b>${dbFmtT(ev.startTime)}</b>${ev.endTime ? ' – ' + dbFmtT(ev.endTime) : ''} · ${dbEsc(ev.title || '')} · ${dbEsc(ev.subtitle || '')}${ev.resourceId && !/optional/.test(ev.resourceId) ? ' · <span style="color:#6b7280">' + dbEsc(ev.resourceId) + '</span>' : ''}`;
  // tours today (one entry per tour; the scheduler may list several retreats)
  const tourMap = {};
  (AppData.bookings || []).filter(b => b.status !== 'cancelled' && !(b.flags || []).includes('archived')).forEach(bk => (bk.retreatActivities || []).forEach(a => {
    if (String(a.date).slice(0, 10) !== dbDate || !DB_TOURS.includes(a.aoId)) return;
    const t = tourMap[a.aoId] = tourMap[a.aoId] || { aoId: a.aoId, name: dbName(a.aoId), time: a.time, groups: [] };
    const p = dbParticipants(bk, a.aoId);
    t.groups.push({ bk, names: p.names, basis: p.basis });
  }));
  g.tours = Object.values(tourMap).map(t => { const ops = (typeof actOpsData !== 'undefined' && actOpsData[t.aoId + '|' + dbDate]) || {}; t.driver = ops.driver ? String(ops.driver).replace(/^./, c => c.toUpperCase()) : ''; t.guides = [ops.guide1, ops.guide2, ops.guide3].filter(Boolean).map(n => n.replace(/^./, c => c.toUpperCase())); return t; }).sort((a, b) => String(a.time).localeCompare(String(b.time)));
  // special instructions from each retreat in house
  dbInHouse(dbDate).forEach(bk => {
    const sr = bk.scheduleRequest || {}; const who = bk.leaderName || bk.retreatName || 'Retreat';
    [['Special request', sr.specialReq], ['Morning class note', sr.morningNotes], ['Afternoon class note', sr.afternoonNotes], ['Arrival class note', sr.arrivalNotes], ['Departure class note', sr.departureNotes]].forEach(([lab, txt], i) => {
      if (txt && String(txt).trim()) g.special.push({ id: bk.id + ':' + i, who, label: lab, text: String(txt).trim() });
    });
  });
  const tasks = dbBuildTasks(g);

  // ----- header counts
  const openTasks = tasks.filter(t => !(t.auto ? t.auto.done : dbGet('tasks.' + t.id + '.done')));
  let html = '';
  // 1. Arrivals
  const arrBody = g.arrivals.length ? g.arrivals.map(b => dbRow(`<b>${dbEsc(b.leaderName || b.retreatName)}</b> · ${b.pax || '?'} guests · ${(b.blockedRooms || []).length} rooms · ${dbFmtT((b.scheduleRequest || {}).arrivalSlot) || ''}`)).join('') : dbNone('No retreat arrivals today.');
  html += dbCard('Arrivals', arrBody + (g.hkOk ? dbRow(`${g.rooms.length} room${g.rooms.length === 1 ? '' : 's'} arriving today (all guests)`) : ''), g.arrivals.length + ' retreat' + (g.arrivals.length === 1 ? '' : 's'));
  // 2. Room readiness & A/C
  let rr;
  if (!g.hkOk) { rr = dbRow(PENDING + ' Room readiness comes from Housekeeping and is shown for today only.'); pend.push('Room readiness'); }
  else {
    const ready = g.rooms.filter(r => r.status === 'clean').length, ac = g.rooms.filter(r => r.ac24h);
    rr = dbRow(`<b>${ready}</b> of <b>${g.rooms.length}</b> arriving rooms are clean and ready.`, ready < g.rooms.length) +
      (g.rooms.filter(r => r.status !== 'clean').map(r => dbRow(`<span style="color:#991b1b;font-weight:600">Room ${dbEsc(r.room)}</span> · ${dbEsc(r.who)} · <b>${dbEsc(r.status)}</b>${r.turnover ? ' (same-day turnover)' : ''}`, true)).join('')) +
      dbRow(ac.length ? `A/C 24h rooms: ${ac.map(r => dbEsc(r.room)).join(', ')}` : 'No arriving room is flagged A/C 24h.') +
      dbRow('A/C turned on in the arriving rooms: ' + ((dbGet('tasks.ac:' + dbDate + '.done')) ? '<b style="color:#166534">Done</b>' : PENDING));
    if (!dbGet('tasks.ac:' + dbDate + '.done') && g.arrivals.length) pend.push('A/C in arriving rooms');
  }
  html += dbCard('Room readiness and A/C', rr);
  // 3. Salamon's arrivals
  const arrT = g.transport.filter(t => t.kind === 'arrival').sort((a, b) => String(a.sub.arrivalTime).localeCompare(String(b.sub.arrivalTime)));
  const sal = arrT.filter(t => /salamon/i.test(t.name)), oth = arrT.filter(t => !/salamon/i.test(t.name));
  const tLine = t => {
    const s = t.sub, st = t.rec ? t.rec.status : 'pending', last = t.rec && t.rec.history && t.rec.history.length ? t.rec.history[t.rec.history.length - 1] : null;
    const missing = !s.flightNumber || !s.arrivalTime;
    if (missing) pend.push('Flight details: ' + ((typeof trTransportFullName === 'function' ? trTransportFullName(s) : '') || 'guest'));
    return dbRow(`<b>${dbFmtT(s.arrivalTime) || PENDING}</b> · ${dbEsc((typeof trTransportFullName === 'function' ? trTransportFullName(s) : '') || 'Guest')} · ${s.flightNumber ? 'Flight ' + dbEsc(s.flightNumber) : PENDING + ' flight'} · ${dbEsc(s.arrivalAirport || '')} · driver <b>${dbEsc(t.name)}</b> · <span style="color:${st === 'confirmed' ? '#166534' : '#92400e'};font-weight:600">${dbEsc(st)}</span>${last ? ` · <span style="color:#6b7280">last update: ${dbEsc(last.event)}${last.detail ? ' (' + dbEsc(last.detail) + ')' : ''}</span>` : ''}`, missing || st !== 'confirmed');
  };
  html += dbCard("Salamon's arrivals", (sal.length ? sal.map(tLine).join('') : dbNone('No airport arrivals for Salamon today.')) + (oth.length ? `<div style="padding:6px 14px;background:#faf8f4;font-size:11px;font-weight:700;color:#8a7e74;text-transform:uppercase">Other drivers</div>` + oth.map(tLine).join('') : ''), arrT.length + ' arrival' + (arrT.length === 1 ? '' : 's'));
  // 4. Departures
  const depT = g.transport.filter(t => t.kind === 'departure');
  html += dbCard('Departures', (g.departures.length ? g.departures.map(b => dbRow(`<b>${dbEsc(b.leaderName || b.retreatName)}</b> · ${b.pax || '?'} guests · checking out today`)).join('') : dbNone('No retreat departures today.')) +
    depT.map(t => dbRow(`Airport departure <b>${dbFmtT(t.sub.departureTime) || PENDING}</b> · ${dbEsc((typeof trTransportFullName === 'function' ? trTransportFullName(t.sub) : '') || 'Guest')} · driver ${dbEsc(t.name)}`)).join(''), g.departures.length + ' retreat' + (g.departures.length === 1 ? '' : 's'));
  // 5. Classes, opening circles, tours, extra activities
  const evCard = (title, list, empty) => dbCard(title, list.length ? list.map(e => dbRow(evLine(e))).join('') : dbNone(empty), list.length);
  html += evCard('Classes', buckets.class, 'No classes today.') + evCard('Opening circles / orientations', buckets.circle, 'No opening circle today.') + evCard('Tours', buckets.tour, 'No tours today.') + evCard('Extra activities and ceremonies', buckets.extra, 'No extra activities today.');
  // 6. Tour preparation
  let prep = g.tours.length ? g.tours.map(t => {
    const total = t.groups.reduce((n, x) => n + x.names.length, 0);
    return `<div style="padding:10px 14px;border-top:1px solid #f0ebe0"><div style="font-weight:700;font-size:14px">${dbEsc(t.name)} · ${dbFmtT(t.time)}</div>
      <div style="font-size:13px;margin-top:3px">Driver: ${t.driver ? '<b>' + dbEsc(t.driver) + '</b>' : PENDING}${t.guides.length ? ' · Guides: <b>' + t.guides.map(dbEsc).join(' & ') + '</b>' : ' · Guides: ' + PENDING}</div>
      <div style="font-size:13px;margin-top:3px">Guests (${total}): ${t.groups.map(x => `<b>${dbEsc(x.bk.leaderName || x.bk.retreatName)}</b> — ${x.names.length ? dbEsc(x.names.join(', ')) : PENDING + ' (' + x.basis + ')'}`).join(' · ')}</div>
      <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-top:5px;color:${dbGet('tasks.snack:' + t.aoId + '.done') ? '#166534' : '#991b1b'};font-weight:600"><input type="checkbox" ${dbGet('tasks.snack:' + t.aoId + '.done') ? 'checked' : ''} onchange="dbSet('tasks.snack:${t.aoId}.done',this.checked);dbRender()"> Tour snack request is posted on the kitchen fridge</label></div>`;
  }).join('') : dbNone('No tours to prepare today.');
  g.tours.forEach(t => { if (!t.driver) pend.push('Driver for ' + t.name); if (!t.guides.length) pend.push('Guides for ' + t.name); if (!dbGet('tasks.snack:' + t.aoId + '.done')) pend.push('Snack request for ' + t.name); });
  prep += g.special.length ? `<div style="padding:8px 14px;background:#faf8f4;font-size:11px;font-weight:700;color:#8a7e74;text-transform:uppercase;border-top:1px solid #f0ebe0">Special instructions</div>` + g.special.map(s => dbRow(`<b>${dbEsc(s.who)}</b> · ${dbEsc(s.label)}: ${dbEsc(s.text)}`)).join('') : '';
  html += dbCard('Tour and class preparation', prep);
  // 7. Outstanding tasks with an assignee
  html += dbCard('Tasks for today <span style="font-weight:500;color:#6b7280">— every open task needs someone</span>', tasks.length ? tasks.map(dbTaskRow).join('') : dbNone('Nothing to do today.'), openTasks.length + ' open');
  openTasks.forEach(t => { if (!dbGet('tasks.' + t.id + '.assignee')) pend.push('Nobody assigned: ' + t.text); });
  // 8. After-dinner orientations
  const needOr = g.arrivals.map(bk => {
    const sr = bk.scheduleRequest || {}, o = dbGet('orientation.' + bk.id) || {};
    const hasWelcome = !!sr.hasArrivalClass && !!sr.arrivalSlot;
    return { bk, sr, o, hasWelcome, scheduled: !!(o.time && o.location && o.leader) };
  });
  const orBody = needOr.length ? needOr.map(x => {
    const nm = dbEsc(x.bk.leaderName || x.bk.retreatName);
    if (x.hasWelcome) return dbRow(`<b>${nm}</b> · welcome class at ${dbFmtT(x.sr.arrivalSlot)}. No separate orientation needed.`);
    if (x.scheduled) return dbRow(`<b>${nm}</b> · after-dinner orientation <b>${dbFmtT(x.o.time)}</b> · ${dbEsc(x.o.location)} · led by <b>${dbEsc(x.o.leader)}</b> <a href="#" onclick="dbEditOrient('${x.bk.id}');return false" style="font-size:12px;margin-left:8px">change</a>`);
    pend.push('Orientation for ' + (x.bk.leaderName || 'retreat'));
    return `<div style="padding:10px 14px;border-top:1px solid #f0ebe0;background:#fff7f7"><div style="font-weight:700;color:#991b1b">${nm}: no welcome class and no orientation scheduled. Needs scheduling.</div>
      <div id="dbOr_${x.bk.id}" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">
        <input type="time" id="dbOrT_${x.bk.id}" value="${x.o.time || '20:30'}" style="padding:6px 8px;border:1.5px solid #d6cfc4;border-radius:7px">
        <input type="text" id="dbOrL_${x.bk.id}" value="${dbEsc(x.o.location || '')}" placeholder="Location (e.g. Grande shala)" style="padding:6px 8px;border:1.5px solid #d6cfc4;border-radius:7px;min-width:190px">
        <select id="dbOrP_${x.bk.id}" style="padding:6px 8px;border:1.5px solid #d6cfc4;border-radius:7px"><option value="">— who leads it —</option>${dbStaff().map(n => `<option value="${dbEsc(n)}" ${n === x.o.leader ? 'selected' : ''}>${dbEsc(n)}</option>`).join('')}</select>
        <button onclick="dbSaveOrient('${x.bk.id}')" class="btn btn-primary" style="font-size:12.5px">Schedule it</button></div></div>`;
  }).join('') : dbNone('No retreat arrives today.');
  html += dbCard('After-dinner orientations', orBody);
  // 9. Teacher arrival checklist
  const chk = g.arrivals.length ? g.arrivals.map(bk => {
    const base = 'checklist.' + bk.id, nm = dbEsc(bk.leaderName || bk.retreatName);
    const doneN = DB_CHECKLIST.filter(([k]) => dbGet(base + '.' + k + '.done')).length;
    const items = DB_CHECKLIST.map(([k, label]) => {
      const done = !!dbGet(base + '.' + k + '.done'), who = dbGet(base + '.' + k + '.assignee') || '';
      let extra = '';
      if (k === 'allergies') { const a = dbGet(base + '.allergies.text'); extra = `<input type="text" value="${dbEsc(a || '')}" placeholder="Allergies (write 'none' if none)" onchange="dbSet('${base}.allergies.text',this.value);dbRender()" style="padding:5px 8px;border:1.5px solid ${a ? '#d6cfc4' : '#fca5a5'};border-radius:7px;min-width:220px">${a ? '' : PENDING}`; if (!a) pend.push('Allergies: ' + (bk.leaderName || 'teacher')); }
      if (k === 'circle') { const l = dbGet(base + '.circle.leader') || ''; extra = `<select onchange="dbSet('${base}.circle.leader',this.value);dbRender()" style="padding:5px 8px;border:1.5px solid ${l ? '#d6cfc4' : '#fca5a5'};border-radius:7px"><option value="">— opening-circle leader —</option>${dbStaff().map(n => `<option value="${dbEsc(n)}" ${n === l ? 'selected' : ''}>${dbEsc(n)}</option>`).join('')}</select>${l ? '' : PENDING}`; if (!l) pend.push('Opening-circle leader: ' + (bk.leaderName || 'teacher')); }
      const sel = k === 'circle' ? '' : `<select onchange="dbSet('${base}.${k}.assignee',this.value);dbRender()" style="padding:5px 8px;border:1.5px solid ${(done || who) ? '#d6cfc4' : '#fca5a5'};border-radius:7px;font-size:12.5px"><option value="">— who —</option>${[...new Set([...dbStaff(), who].filter(Boolean))].map(n => `<option value="${dbEsc(n)}" ${n === who ? 'selected' : ''}>${dbEsc(n)}</option>`).join('')}</select>`;
      return `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:7px 14px;border-top:1px solid #f0ebe0;background:${done ? '#f7fdf9' : '#fff7f7'}"><label style="display:flex;gap:8px;align-items:center;flex:1;min-width:250px;font-size:13.5px;font-weight:600;color:${done ? '#166534' : '#991b1b'}"><input type="checkbox" ${done ? 'checked' : ''} onchange="dbSet('${base}.${k}.done',this.checked);dbRender()"> ${dbEsc(label)}</label>${extra}${sel}</div>`;
    }).join('');
    return `<div style="padding:8px 14px;background:#faf8f4;font-weight:700;border-top:1px solid #e8dfd4">${nm} <span style="color:${doneN === DB_CHECKLIST.length ? '#166534' : '#991b1b'};font-weight:600">· ${doneN} of ${DB_CHECKLIST.length} done</span></div>${items}`;
  }).join('') : dbNone('No teacher arrives today.');
  html += dbCard('Teacher arrival checklist', chk);
  // 10. Attendance
  html += dbCard('Staff attendance', DB_DEPTS.map(d => {
    const v = dbGet('attendance.' + d.replace(/\s+/g, '_') + '.present') || '';
    if (!v) pend.push('Attendance: ' + d);
    return dbRow(`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><b style="min-width:150px">${d}</b><input type="text" value="${dbEsc(v)}" placeholder="Who is working today" onchange="dbSet('attendance.${d.replace(/\s+/g, '_')}.present',this.value);dbRender()" style="padding:6px 10px;border:1.5px solid ${v ? '#d6cfc4' : '#fca5a5'};border-radius:7px;min-width:300px;flex:1">${v ? '' : PENDING}</div>`);
  }).join(''));
  // 11. Staff hours (from the Team Pendings staff records; managers and admins only, nothing invented)
  let hours = null;
  if (typeof dbCanSeeHours === 'function' && dbCanSeeHours() && typeof shLoad === 'function') {
    hours = await shLoad(dbDate);
    html += dbCard('Staff hours <span style="font-weight:500;color:#6b7280">— scheduled and actual are shown separately</span>', shHtml(hours), hours.ok ? hours.rows.length + ' staff' : 'not connected');
  }
  // summary strip on top
  const strip = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${[['Arrivals', g.arrivals.length, '#1d4ed8'], ['Departures', g.departures.length, '#475569'], ['Tours', g.tours.length, '#0d9488'], ['Open tasks', openTasks.length, openTasks.length ? '#b91c1c' : '#166534'], ['Pending confirmation', [...new Set(pend)].length, pend.length ? '#b45309' : '#166534']].map(([l, n, c]) => `<div style="background:#fff;border:1.5px solid ${c}55;border-radius:10px;padding:8px 16px;min-width:110px"><div style="font-size:22px;font-weight:700;color:${c}">${n}</div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7280">${l}</div></div>`).join('')}</div>`;
  dbCtx = { g, tasks, openTasks, pend: [...new Set(pend)], buckets, fmtLong, hours };
  el.innerHTML = `<div style="font-size:12px;color:#6b7280;margin:0 0 10px">${dbEsc(fmtLong)}. Pulled from the portal; classes, circles, tours and activities are the main scheduler's own list.</div>` + strip + html;
  const lab = document.getElementById('dbriefDate'); if (lab) lab.textContent = fmtLong;
}
// ---------- orientation form ----------
function dbSaveOrient(id) {
  const t = document.getElementById('dbOrT_' + id).value, l = document.getElementById('dbOrL_' + id).value.trim(), p = document.getElementById('dbOrP_' + id).value;
  if (!t || !l || !p) { showToast('Enter the time, the location and who leads the orientation.'); return; }
  dbSet('orientation.' + id, { time: t, location: l, leader: p });
  showToast('Orientation scheduled.'); dbRender();
}
function dbEditOrient(id) { const d = dbDay(); if (d.orientation) delete d.orientation[id]; dbSaveState(); dbRender(); }
// ---------- dated report ----------
async function dbSaveReport() {
  if (!dbCtx) return;
  const c = dbCtx, lines = [];
  lines.push(`DAILY BRIEFING — ${c.fmtLong}`, `Saved ${new Date().toLocaleString()} by ${dbWho()}`, '');
  lines.push(`Arrivals: ${c.g.arrivals.map(b => (b.leaderName || b.retreatName) + ' (' + (b.pax || '?') + ')').join(', ') || 'none'}`);
  lines.push(`Departures: ${c.g.departures.map(b => (b.leaderName || b.retreatName) + ' (' + (b.pax || '?') + ')').join(', ') || 'none'}`);
  lines.push(`Rooms arriving: ${c.g.rooms.length} · ready: ${c.g.rooms.filter(r => r.status === 'clean').length}`);
  const sec = (title, list) => { lines.push('', title.toUpperCase()); (list.length ? list : ['none']).forEach(e => lines.push(typeof e === 'string' ? e : `${dbFmtT(e.startTime)} ${e.title || ''} · ${e.subtitle || ''}`)); };
  sec('Classes', c.buckets.class); sec('Opening circles', c.buckets.circle); sec('Tours', c.buckets.tour); sec('Extra activities', c.buckets.extra);
  sec('Tasks', c.tasks.map(t => `[${(t.auto ? t.auto.done : dbGet('tasks.' + t.id + '.done')) ? 'x' : ' '}] ${t.text} — ${dbGet('tasks.' + t.id + '.assignee') || 'NOT ASSIGNED'}`));
  sec('Pending confirmation', c.pend);
  if (c.hours) sec('Staff hours', typeof shLines === 'function' ? shLines(c.hours) : []);
  const tasksOpen = c.openTasks.map(t => ({ text: t.text.replace(/^Carried from \d{4}-\d{2}-\d{2}: /, ''), assignee: dbGet('tasks.' + t.id + '.assignee') || '', from: (dbDay().carried || []).filter(x => x.id === t.id).map(x => x.from)[0] || dbDate }));
  dbReports[dbDate] = { savedAt: new Date().toISOString(), savedBy: dbWho(), text: lines.join('\n'), openTasks: c.openTasks.length, pending: c.pend.length, tasksOpen, staffHours: c.hours ? { ok: c.hours.ok, rows: c.hours.rows, flags: c.hours.flags } : null, state: dbDay() };
  try { await db.from('app_store').upsert({ key: DB_REPORTS, value: dbReports, updated_at: new Date().toISOString() }); showToast('Report for ' + dbDate + ' saved.'); } catch (e) { showToast('Could not save the report.'); }
  dbRenderReports();
}
function dbRenderReports() {
  const s = document.getElementById('dbriefPast'); if (!s) return;
  const dates = Object.keys(dbReports).sort().reverse();
  s.innerHTML = '<option value="">Saved reports…</option>' + dates.map(d => `<option value="${d}">${d} · ${dbReports[d].openTasks} open · ${dbReports[d].pending} pending</option>`).join('');
}
function dbShowReport(d) {
  if (!d || !dbReports[d]) return;
  let ov = document.getElementById('dbOv'); if (ov) ov.remove();
  ov = document.createElement('div'); ov.id = 'dbOv'; ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = `<div style="background:#fff;border-radius:12px;width:min(720px,100%);max-height:90vh;overflow:auto;padding:20px"><pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;margin:0 0 14px">${dbEsc(dbReports[d].text)}</pre><button class="btn btn-secondary" onclick="document.getElementById('dbOv').remove()">Close</button></div>`;
  document.body.appendChild(ov);
}
function dbNav(n) { dbDate = n === 0 ? dbISO(new Date()) : dbAdd(dbDate || dbISO(new Date()), n); dbRender(); }
function dbOpen(btn) {
  const prev = localStorage.getItem('ama_last_tab');
  switchTab('dailybrief', btn);
  try { localStorage.setItem('ama_last_tab', prev || 'dashboard'); } catch (e) {}
  dbRender().then(dbRenderReports);
}
(function () {
  try {
    if (document.getElementById('tab-dailybrief')) return;
    const me = document.getElementById('tab-menueditor'); if (!me) return;
    const panel = document.createElement('div');
    panel.className = 'tab-panel'; panel.id = 'tab-dailybrief'; panel.style.flexDirection = 'column';
    panel.innerHTML = `<div class="panel-toolbar"><h2>Daily Briefing</h2>
      <div class="toolbar-right" style="gap:8px">
        <button class="btn btn-secondary" onclick="dbNav(-1)">&#8249;</button><span id="dbriefDate" style="font-weight:700;font-size:13px;min-width:230px;text-align:center"></span><button class="btn btn-secondary" onclick="dbNav(1)">&#8250;</button>
        <button class="btn btn-secondary" onclick="dbNav(0)">Today</button>
        <select id="dbriefPast" onchange="dbShowReport(this.value);this.value=''" style="padding:7px 10px;border:1.5px solid #d6cfc4;border-radius:8px"><option value="">Saved reports…</option></select>
        <button class="btn btn-secondary" onclick="window.print()">Print</button>
        <button class="btn btn-primary" onclick="dbSaveReport()">Save today's report</button></div></div>
      <div id="dbriefBody" style="flex:1;overflow-y:auto;padding:20px;background:#f0ece4"><div style="padding:40px;text-align:center;color:#9ca3af">Loading…</div></div>`;
    me.parentElement.insertBefore(panel, me.nextSibling);
    const btn = document.createElement('button');
    btn.className = 'tab-btn'; btn.id = 'dailyBriefTabBtn';
    btn.onclick = function () { dbOpen(btn); };
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span class="tab-label">Daily Briefing</span>';
    const tours = document.getElementById('toursCerTabBtn'), act = [...document.querySelectorAll('button.tab-btn')].find(b => /switchTab\('actsheet'/.test(b.getAttribute('onclick') || ''));
    const anchor = tours || act;
    if (anchor) anchor.parentElement.insertBefore(btn, anchor.nextSibling); else me.parentElement.appendChild(btn);
  } catch (e) { console.warn('[daily-briefing]', e); }
})();
