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
// The Teacher arrival checklist's "who" and opening-circle-leader dropdowns offer only these people (Darlene 2026-11-04). A name already saved on an item stays so it never disappears.
const DB_CHECKLIST_WHO = ['Rubi', 'Darlene', 'Jorge', 'Hilario', 'Max', 'Michelle', 'Melissa'];
// Who can lead an opening circle / orientation (Darlene 2026-11-05): only these four.
const DB_CIRCLE_LEADERS = ['Max', 'Ryan', 'Darlene', 'Michelle'];
const DB_DEPTS = ['Housekeeping', 'Cajeras', 'Kitchen', 'Restaurant Captain', 'Front Desk'];
const DB_CHECKLIST = [
  ['meet', 'Meet the teacher'], ['review', 'Review the schedule and special requests with the teacher'], ['allergies', 'Record allergies'],
  ['tip', 'Give the tip envelope'], ['sound', 'Do the sound check'], ['room', 'Check the room together'],
  ['departure', 'Confirm departure details'], ['spa', 'Explain the complimentary spa service'], ['circle', 'Assign the opening-circle leader'],
];
let dbTab = 'flow', dbCoLog = {};
const DB_BALANCE_FLAG = 500;       // a pending balance over this (USD) is flagged on the departure line
const DB_LATE_CO = /late\s*check[\s-]*out|check[\s-]*out\s*late|stay\s*(?:until|till)\s*\d/i;
let dbDate = null, dbData = {}, dbReports = {}, dbLoaded = false, dbCtx = null;

// Only what the room needs (Darlene 2026-11-04): a teacher's note is free text, so keep just the sentences about equipment and set-up
// (straps, pillows, mats, sound system...); the rest of the note (dates, music taste, comments) is not shown anywhere in the briefing.
const DB_ROOM_WORDS = /\b(straps?|pillows?|mats?|blocks?|bolsters?|blankets?|chairs?|props?|speakers?|sound system|mics?|microphones?|candles?|tables?|heaters?|fans?|lights?|lighting|set ?up|rugs?|towels?|cushions?|incense|altar|bells?|bowls?|projector|screen|whiteboard)\b/i;
function dbRoomNeedText(note) { return String(note || '').split(/(?<=[.!?])\s+|\n+/).filter(x => DB_ROOM_WORDS.test(x)).join(' ').trim(); }
// Shala names are bold and each has its own color (Darlene 2026-11-04): Beachfront blue, Grande orange, Chica purple, Heaven green.
const DB_SHALA_COLOR = { beachfront: '#1d4ed8', grande: '#ea580c', chica: '#7e22ce', heaven: '#15803d', skye: '#0e7490', casa_grande_living: '#7c4a21' };   // Casa Grande Living Room is brown
function dbPlace(id) {
  const sh = (typeof SKED_SHALAS !== 'undefined' ? SKED_SHALAS : []).find(x => x.id === id), c = DB_SHALA_COLOR[id];
  if (c) return `<b style="color:${c}">${dbEsc(sh ? sh.name : id)}</b>`;
  const ac = (typeof SKED_ACTIVITIES !== 'undefined' ? SKED_ACTIVITIES : []).find(x => x.id === id);
  return `<span style="color:#6b7280">${dbEsc(ac ? ac.name : (sh ? sh.name : id))}</span>`;
}
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
    try { const c = await db.from('app_store').select('value').eq('key', 'checkout_log').maybeSingle(); if (c.data && c.data.value) dbCoLog = c.data.value; } catch (e) {}
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

// Arrival: the retreat's own special requests. Departure: a large pending balance, or a late check-out request (found in the booking / teacher notes).
// A box with a tick once guests are marked as arrived (checked in on Reservations / the booking screen / the Transport log); it fills as more of the group arrives.
function dbArrivedBox(b) {
  const regs = (AppData.regs || []).filter(r => r.bookingId === b.id && !r.cancelled), n = regs.length, k = regs.filter(r => r.checkedInAt).length;
  if (!n) return '';
  const all = k === n, some = k > 0;
  return `<span title="${k} of ${n} marked as arrived" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin-right:8px;vertical-align:middle;border:2px solid ${all ? '#15803d' : some ? '#d97706' : '#9ca3af'};border-radius:5px;background:${all ? '#15803d' : '#fff'};color:#fff;font-size:14px;font-weight:800;line-height:1">${all ? '✓' : ''}</span><span style="font-size:12px;font-weight:700;margin-right:8px;color:${all ? '#15803d' : some ? '#b45309' : '#6b7280'}">${all ? 'Arrived' : k + ' of ' + n + ' arrived'}</span>`;
}
// Anyone who has been checked in is marked as arrived (Darlene 2026-11-04): a ticked box on each airport arrival. The Transport log's own check-in is used when it is loaded,
// otherwise the guest's name is matched to the room list's checked-in registrations.
function dbTick(on) { return `<span title="${on ? 'Marked as arrived' : 'Not marked as arrived yet'}" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin-right:8px;vertical-align:middle;border:2px solid ${on ? '#15803d' : '#9ca3af'};border-radius:5px;background:${on ? '#15803d' : '#fff'};color:#fff;font-size:14px;font-weight:800;line-height:1">${on ? '✓' : ''}</span>`; }
function dbSubArrived(sub) {
  try {
    const e = (typeof tr2AllEntries !== 'undefined' ? tr2AllEntries : []).find(x => x.rowId === sub.id && x.type === 'arrival'); if (e && e.checkedIn) return true;
    const nm = ((sub.firstName || '') + ' ' + (sub.lastName || '')).trim().toLowerCase(); if (!nm) return false;
    return (AppData.regs || []).some(r => r.checkedInAt && (!sub.bookingId || r.bookingId === sub.bookingId) && (r.guests || []).some(g => String(g.name || '').trim().toLowerCase() === nm));
  } catch (err) { return false; }
}
// Departures: the guests who are really leaving today (their own check-out date), not the retreat's contracted headcount. Guests already checked out earlier are not counted.
function dbDepCount(b) {
  const regs = (AppData.regs || []).filter(r => r.bookingId === b.id && !r.cancelled);
  if (!regs.length) return (b.pax || '?') + ' guests';
  let n = 0;
  regs.forEach(r => {
    const co = String(r.checkOut || b.endDate || '').slice(0, 10), out = r.checkedOutAt ? String(r.checkedOutAt).slice(0, 10) : '';
    if (co !== dbDate || (out && out < dbDate)) return;
    n += new Set((r.guests || []).filter(g => g.name).map(g => g.name.trim().toLowerCase())).size || 1;
  });
  return n + ' guest' + (n === 1 ? '' : 's') + ' leaving';
}
// The retreat a transport request belongs to, shown after the guest's name (Darlene 2026-11-04).
function dbRetreatTag(sub) {
  const bk = (AppData.bookings || []).find(x => x.id === sub.bookingId); if (!bk) return '';
  const nm = bk.retreatName || bk.leaderName; return nm ? ` <span style="color:#0f766e;font-weight:600">· ${dbEsc(nm)}</span>` : '';
}
// An extra night or a room-only stay before a retreat is not the retreat starting: its opening circle is on the retreat's own start day (Darlene 2026-11-05, Katherine McClelland and Korina start on the 6th).
function dbIsRetreatStart(b) { return b.bookingType !== 'room_only' && !/extra\s*night/i.test((b.retreatName || '') + ' ' + (b.leaderName || '')); }
// Opening circle leader (Max unless someone else is picked here); saved per retreat by opening-circle-leader.js and read by the Calendar.
function dbCircleLeader(b) {
  if (typeof ocLeaderFor !== 'function' || !dbIsRetreatStart(b)) return '';
  const cur = ocLeaderFor(b.id);
  return `<span style="font-size:12px;color:#6b7280;margin-right:6px">Opening circle:</span><select onchange="ocSetLeader('${b.id}',this.value)" style="padding:3px 6px;border:1.5px solid #d6cfc4;border-radius:7px;font-size:12.5px;margin-right:10px">${[...new Set([...DB_CIRCLE_LEADERS, cur])].map(n => `<option value="${dbEsc(n)}" ${n === cur ? 'selected' : ''}>${dbEsc(n)}</option>`).join('')}</select>`;
}
const dbInitials = n => { const w = String(n || '').trim().split(/\s+/).filter(Boolean); return (w.length > 1 ? w.map(x => x[0]).join('') : (w[0] || '?').slice(0, 2)).slice(0, 3).toUpperCase(); };
// Check a guest out from the briefing (same registration update as Reservations), and record WHO did it for the initials.
async function dbToggleOut(regId) {
  const reg = (AppData.regs || []).find(r => r.id === regId); if (!reg) return;
  if (reg.checkedOutAt && !confirm('Undo this check-out?')) return;
  const now = reg.checkedOutAt ? null : new Date().toISOString();
  const { error } = await db.from('registrations').update({ checked_out_at: now }).eq('id', regId);
  if (error) { showToast('Error: ' + error.message); return; }
  reg.checkedOutAt = now;
  try { const { data } = await db.from('app_store').select('value').eq('key', 'checkout_log').maybeSingle(); const all = Object.assign({}, (data && data.value) || {}); if (now) all[regId] = { by: dbWho(), at: now }; else delete all[regId]; await db.from('app_store').upsert({ key: 'checkout_log', value: all, updated_at: now || new Date().toISOString() }); dbCoLog = all; } catch (e) {}
  try { if (typeof _resLogStay === 'function') _resLogStay(now ? 'Checked out' : 'Check-out undone', 'group', regId); } catch (e) {}
  showToast(now ? 'Checked out ✓' : 'Check-out removed'); dbRender();
}
// How many people are in an activity today, so the front desk knows what is already booked and what they can still sell (Darlene 2026-11-05).
// Pre-paid / included for a group = the whole group; otherwise the guests signed up on the activity sheet. Counted across every retreat that has it today.
function dbActPeople(e) {
  const id = String(e.id || ''); let aoId = (/_ao_(ao\d+)/.exec(id) || [])[1];
  if (!aoId) { const ao = (typeof ADD_ONS !== 'undefined' ? ADD_ONS : []).find(x => x.name === e.title); aoId = ao && ao.id; }
  if (!aoId) return '';
  let signed = 0, included = 0;
  (AppData.bookings || []).filter(b => b.status !== 'cancelled').forEach(bk => {
    const act = (bk.retreatActivities || []).find(a => a.aoId === aoId && String(a.date).slice(0, 10) === dbDate); if (!act) return;
    const p = dbParticipants(bk, aoId);
    if (act.prepaid) included += p.names.length; else signed += p.names.length;
  });
  const bits = [];
  if (included) bits.push(`<b style="color:#166534">${included} included</b>`);
  bits.push(signed ? `<b style="color:#7c3aed">${signed} signed up</b>` : (included ? '' : '<span style="color:#9ca3af">nobody signed up yet</span>'));
  return ' <span style="margin-left:6px;font-size:12.5px">· ' + bits.filter(Boolean).join(' · ') + '</span>';
}
// The room a transport guest is in, from the room list (matched by name, inside the same booking when the request names one); blank when no registered guest matches
function dbRegOf(sub) {
  const nm = ((sub.firstName || '') + ' ' + (sub.lastName || '')).trim().toLowerCase(); if (!nm) return null;
  return (AppData.regs || []).find(r => !r.cancelled && (!sub.bookingId || r.bookingId === sub.bookingId) && (r.guests || []).some(g => String(g.name || '').trim().toLowerCase() === nm))
    || (AppData.regs || []).find(r => !r.cancelled && (r.guests || []).some(g => String(g.name || '').trim().toLowerCase() === nm)) || null;
}
function dbRoomOf(sub) { const hit = dbRegOf(sub); return hit && hit.room ? 'Room <b>' + dbEsc(hit.room) + '</b> · ' : ''; }
// An arriving booking shows its room(s) and, when one can be sold, the upgrade (Darlene 2026-11-05): the same options the Transport tab offers (the room type's upgrade path, a free room of that type
// for the whole stay, and the nightly price difference). Nothing is sold here.
function dbRoomUpgrade(b) {
  try {
    const regs = (AppData.regs || []).filter(r => r.bookingId === b.id && !r.cancelled && r.room), rooms = [...new Set([...regs.map(r => r.room), ...(regs.length ? [] : (b.blockedRooms || []))])];
    if (!rooms.length) return '<div style="margin-top:3px;font-size:12.5px;color:#92400e">Room not assigned yet</div>';
    return rooms.map(room => {
      const byList = (AppData.roomTypes || []).find(x => (x.rooms || []).includes(room)), rtId = (typeof tr2LookupRtId === 'function' && tr2LookupRtId(room)) || (byList && byList.id) || null, rt = rtId && (AppData.roomTypes || []).find(x => x.id === rtId);
      const reg = regs.find(r => r.room === room), who = reg ? (reg.guests || []).map(g => g.name).filter(Boolean)[0] : '';
      let up = '';
      if (rtId && typeof TR2_UPGRADE_PATH !== 'undefined' && typeof tr2AvailableRoomsOfType === 'function') {
        const high = typeof tr2IsHighSeason === 'function' ? tr2IsHighSeason(b.startDate) : true, fromP = rt ? (high ? rt.price1 : rt.price1_low) : null, opts = [];
        (TR2_UPGRADE_PATH[rtId] || []).forEach(toId => {
          const to = (AppData.roomTypes || []).find(x => x.id === toId); if (!to) return;
          const avail = tr2AvailableRoomsOfType(toId, b.startDate, b.endDate, b.id); if (!avail.length) return;
          const toP = high ? to.price1 : to.price1_low, diff = fromP != null && toP != null ? toP - fromP : null;
          opts.push(`<b style="color:#7c3aed">${dbEsc(to.name)}</b>${diff != null ? ' +$' + Math.round(diff) + '/night' : ''} <span style="color:#6b7280">(${avail.length} free: ${avail.slice(0, 3).map(dbEsc).join(', ')})</span>`);
        });
        up = opts.length ? ` · <b style="color:#7c3aed">Upgrade to sell:</b> ${opts.join(' · ')}` : ' · <span style="color:#9ca3af">no upgrade available</span>';
      }
      return `<div style="margin-top:3px;font-size:12.5px;color:#374151">Room <b>${dbEsc(room)}</b>${rt ? ' · ' + dbEsc(rt.name) : ''}${who && regs.length > 1 ? ' · ' + dbEsc(who) : ''}${up}</div>`;
    }).join('');
  } catch (e) { return ''; }
}
function dbArrNote(b) { const sr = b.scheduleRequest || {}; return dbEsc(String(sr.specialRequests || '').trim()); }
function dbDepNote(b) {
  const out = [];
  try { const bal = typeof calcBkBalance === 'function' ? calcBkBalance(b).balance : 0; if (bal > DB_BALANCE_FLAG) out.push('Pending balance $' + Math.round(bal).toLocaleString('en-US')); } catch (e) {}
  const sr = b.scheduleRequest || {}, txt = [b.notes, b.guestNotes, sr.specialRequests, sr.departureNotes].filter(Boolean).join(' ');
  if (DB_LATE_CO.test(txt)) out.push('Late check-out requested');
  return dbEsc(out.join(' · '));
}
// ---------- gather today's information ----------
function dbBookingsOn(field, date) { return (AppData.bookings || []).filter(b => b.status !== 'cancelled' && !(b.flags || []).includes('archived') && String(b[field] || '').slice(0, 10) === date); }
function dbInHouse(date) { return (AppData.bookings || []).filter(b => b.status !== 'cancelled' && !(b.flags || []).includes('archived') && b.startDate <= date && date <= b.endDate && b.bookingType !== 'room_only'); }
function dbGuestNames(bk) {
  const out = [];
  (AppData.regs || []).filter(r => r.bookingId === bk.id && !r.cancelled).forEach(r => (r.guests || []).forEach(g => { if (g && g.name && !g.cancelled) out.push(g.name); }));
  return out;
}
// Somebody who lands AFTER the activity starts is not there for it (Darlene 2026-11-05: Katherine McClelland arrives at 5:00 pm, so she cannot do the 3:00 pm Mayan Clay): her transfer's arrival time today is later than the activity time.
function dbNotThereYet(name, time) {
  try {
    if (!time || typeof loadTransport !== 'function') return false;
    const nm = String(name || '').trim().toLowerCase(), t = String(time).slice(0, 5);
    return loadTransport().some(s => s.arrivalDate === dbDate && s.arrivalTime && String(s.arrivalTime).slice(0, 5) > t && ((s.firstName || '') + ' ' + (s.lastName || '')).trim().toLowerCase() === nm);
  } catch (e) { return false; }
}
function dbParticipants(bk, aoId) {
  const act = (bk.retreatActivities || []).find(a => a.aoId === aoId && String(a.date).slice(0, 10) === dbDate) || (bk.retreatActivities || []).find(a => a.aoId === aoId);
  const here = r => ({ ...r, names: r.names.filter(n => !dbNotThereYet(n, act && act.time)) });
  // A pre-paid tour that is not part of the group's package is just for that person, the leader: nobody else is added (Darlene 2026-11-05, Jodi's Tulum Ruins).
  if (act && act.prepaid && !(bk.packages || []).includes(aoId)) return here({ names: [bk.leaderName || bk.retreatName || 'Leader'], basis: 'pre-paid for the leader only' });
  if (act && act.prepaid) return here({ names: dbGuestNames(bk), basis: 'included for the whole group' });
  const sups = (typeof actSheetSignups !== 'undefined' && actSheetSignups[bk.id]) || [];
  const names = sups.filter(s => (s.activities || []).includes(aoId)).map(s => ((s.firstName || '') + ' ' + (s.lastName || '')).trim()).filter(Boolean);
  return here({ names, basis: 'signed up' });
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
  if (/_opencircle$/.test(id) || (/_arr$/.test(id) && /opening circle/i.test(ev.subtitle || ''))) return 'circle';
  if (/_prepaid_opt_/.test(id) || /_opt_/.test(id)) return 'skip';              // duplicate "optional" columns of the same activity
  // An activity that is NOT pre-paid reaches the scheduler as one merged "Optional" block (id opt_merged_<name>_<time>_<date>, no ao id in it): it still happens that day, so it is listed too
  if (/^opt_merged_/.test(id)) {
    const ao = (typeof ADD_ONS !== 'undefined' ? ADD_ONS : []).find(x => x.name === ev.title);
    // Only the retreats that really have somebody signed up are named; a retreat with nobody signed up is taken out (Darlene 2026-11-05, Heather Kasey), and an activity nobody joined is not listed at all.
    if (ao) {
      const groups = [];
      // If it is included (pre-paid) for a retreat it is not optional for them (Darlene 2026-11-05), so that retreat is not listed here.
      (AppData.bookings || []).filter(b => b.status !== 'cancelled' && (b.retreatActivities || []).some(x => x.aoId === ao.id && String(x.date).slice(0, 10) === dbDate) && !(b.retreatActivities || []).some(x => x.aoId === ao.id && String(x.date).slice(0, 10) === dbDate && x.prepaid)).forEach(b => {
        const n = ((typeof actSheetSignups !== 'undefined' && actSheetSignups[b.id]) || []).filter(x => (x.activities || []).includes(ao.id) && !dbNotThereYet(((x.firstName || '') + ' ' + (x.lastName || '')).trim(), (b.retreatActivities.find(y => y.aoId === ao.id && String(y.date).slice(0, 10) === dbDate) || {}).time)).length; if (n) groups.push((b.leaderName || b.retreatName || 'Retreat') + ' (' + n + ' signed up)');
      });
      if (!groups.length) return 'skip';
      ev.subtitle = groups.join(' · ') + ' · ' + (String(ev.subtitle || '').match(/Optional.*$/) || ['Optional'])[0];
    }
    return ao && DB_TOURS.includes(ao.id) ? 'tour' : 'extra';
  }
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
  g.tours.filter(t => !t.cancelled).forEach(t => {
    add('snack:' + t.aoId, `Tour snack request for ${t.name} posted on the kitchen fridge`);
    add('driver:' + t.aoId, `Driver for ${t.name}`, t.driver ? { done: true, note: t.driver } : null);
  });
  // special notes are not tasks (Darlene 2026-11-04): acknowledged on the schedule, shown under the class / in the Special notes tab
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
// Every card folds up when you click its title, and stays folded (per device) until you open it again (Darlene 2026-11-04).
const DB_FOLD = 'db_folded_cards';
const dbFolded = () => { try { return JSON.parse(localStorage.getItem(DB_FOLD) || '[]'); } catch (e) { return []; } };
function dbToggleCard(h) {
  const key = h.getAttribute('data-key'), body = h.nextElementSibling, open = body.style.display === 'none';
  body.style.display = open ? '' : 'none'; h.querySelector('.db-chev').textContent = open ? '▾' : '▸';
  try { const f = dbFolded().filter(k => k !== key); if (!open) f.push(key); localStorage.setItem(DB_FOLD, JSON.stringify(f)); } catch (e) {}
}
const dbCard = (title, inner, count) => {
  const key = String(title).replace(/<[^>]*>/g, '').split(' —')[0].trim(), shut = dbFolded().includes(key);
  return `<div style="background:#fff;border-radius:10px;margin-bottom:14px;overflow:hidden;border:1px solid #e8dfd4"><div data-key="${dbEsc(key)}" onclick="dbToggleCard(this)" title="Click to fold or open" style="cursor:pointer;user-select:none;padding:9px 14px;background:#f5f1eb;font-weight:700;font-size:13.5px;display:flex;justify-content:space-between;gap:10px"><span><span class="db-chev" style="display:inline-block;width:16px;color:#6b7280">${shut ? '▸' : '▾'}</span>${title}</span>${count != null ? `<span style="font-weight:600;color:#6b7280">${count}</span>` : ''}</div><div${shut ? ' style="display:none"' : ''}>${inner}</div></div>`;
};
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
  // Every retreat arriving today has an opening circle (Darlene 2026-11-05: Katherine McClelland and Korina had none). The scheduler only draws one for a retreat whose schedule is confirmed, so a
  // retreat arriving today with none gets one here: 15 minutes before its arrival class, or 8:30 pm after dinner, in Grande, led by Max unless another leader was picked.
  const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); }, fromMin = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  g.arrivals.filter(dbIsRetreatStart).forEach(bk => {
    const has = [...buckets.circle, ...buckets.class].some(e => e.bkId === bk.id && (/_opencircle$/.test(String(e.id || '')) || /opening circle/i.test(e.subtitle || '')));
    if (has) return;
    const sr = bk.scheduleRequest || {}, slot = sr.hasArrivalClass && sr.arrivalSlot ? sr.arrivalSlot : '';
    const st = slot ? fromMin(toMin(slot) - 15) : '20:30', en = slot || '20:45', who = typeof ocLeaderFor === 'function' ? ocLeaderFor(bk.id) : 'Max';
    buckets.circle.push({ id: 'ret_' + bk.id + '_opencircle', bkId: bk.id, resourceId: sr.arrivalShala1 || 'grande', startTime: st, endTime: en, title: bk.leaderName || bk.retreatName || 'Retreat', subtitle: 'Orientation with Amansala — ' + who + (sr.adminStatus === 'confirmed' ? '' : ' (schedule not confirmed yet)') });
  });
  Object.keys(buckets).forEach(k => buckets[k].sort((a, b) => String(a.startTime).localeCompare(String(b.startTime))));
  // A tour or ceremony marked Cancelled on Tours & Ceremonies (with its reason, e.g. not enough sign-ups) shows as cancelled here too.
  const cancelOf = id => { const m = /_ao_(ao\d+)/.exec(String(id || '')), o = m && typeof actOpsData !== 'undefined' && actOpsData[m[1] + '|' + dbDate]; return o && o.status === 'cancelled' ? String(o.cancelReason || '').trim().replace(/^./, c => c.toUpperCase()) || 'No reason given' : null; };
  const cancelTag = why => `<span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:700;padding:1px 9px;border-radius:9px;background:#fee2e2;color:#991b1b">CANCELLED — ${dbEsc(why)}</span>`;
  const evLine = ev => { const why = cancelOf(ev.id), line = evLineBase(ev); return why === null ? line : `<span style="text-decoration:line-through;color:#6b7280">${line}</span>${cancelTag(why)}`; };
  const evLineBase = ev => `<b>${dbFmtT(ev.startTime)}</b>${ev.endTime ? ' – ' + dbFmtT(ev.endTime) : ''} · ${dbEsc(ev.title || '')} · ${dbEsc(ev.subtitle || '')}${ev.resourceId && !/optional/.test(ev.resourceId) ? ' · ' + dbPlace(ev.resourceId) : ''}`;
  // tours today (one entry per tour; the scheduler may list several retreats)
  const tourMap = {};
  (AppData.bookings || []).filter(b => b.status !== 'cancelled' && !(b.flags || []).includes('archived')).forEach(bk => (bk.retreatActivities || []).forEach(a => {
    if (String(a.date).slice(0, 10) !== dbDate || !DB_TOURS.includes(a.aoId)) return;
    const t = tourMap[a.aoId] = tourMap[a.aoId] || { aoId: a.aoId, name: dbName(a.aoId), time: a.time, groups: [] };
    const p = dbParticipants(bk, a.aoId);
    if (p.names.length) t.groups.push({ bk, names: p.names, basis: p.basis });   // a retreat with nobody signed up (and nothing pre-paid) is not listed on the tour (Darlene 2026-11-05)
  }));
  g.tours = Object.values(tourMap).map(t => { const ops = (typeof actOpsData !== 'undefined' && actOpsData[t.aoId + '|' + dbDate]) || {}; t.driver = ops.driver ? String(ops.driver).replace(/^./, c => c.toUpperCase()) : ''; t.guides = [ops.guide1, ops.guide2, ops.guide3].filter(Boolean).map(n => n.replace(/^./, c => c.toUpperCase())); t.cancelled = ops.status === 'cancelled'; t.why = String(ops.cancelReason || '').trim().replace(/^./, c => c.toUpperCase()) || 'No reason given'; return t; }).sort((a, b) => String(a.time).localeCompare(String(b.time)));
  // special instructions from each retreat in house
  dbInHouse(dbDate).forEach(bk => {
    const sr = bk.scheduleRequest || {}; const who = bk.leaderName || bk.retreatName || 'Retreat';
    [['Morning class note', sr.morningNotes], ['Afternoon class note', sr.afternoonNotes], ['Arrival class note', sr.arrivalNotes], ['Departure class note', sr.departureNotes]].forEach(([lab, txt], i) => {
      const need = dbRoomNeedText(txt); if (need) g.special.push({ id: bk.id + ':' + i, who, label: 'Room needs (' + lab.replace(/ note$/, '').toLowerCase() + ')', text: need });
    });
  });
  const tasks = dbBuildTasks(g);

  // ----- header counts
  const openTasks = tasks.filter(t => !(t.auto ? t.auto.done : dbGet('tasks.' + t.id + '.done')));
  let html = '';
  // 0. The whole day in time order: classes, opening circles, tours, ceremonies and extra activities together
  const tagOf = { class: ['Class', '#e0f2fe', '#0369a1'], circle: ['Opening circle', '#fef3c7', '#92400e'], tour: ['Tour', '#fee2e2', '#b91c1c'], extra: ['Ceremony / activity', '#fee2e2', '#b91c1c'] };
  const dayAll = ['circle', 'class', 'tour', 'extra'].flatMap(k => buckets[k].map(e => ({ e, k }))).sort((a, b) => String(a.e.startTime).localeCompare(String(b.e.startTime)));
  // Under a class: ONLY what the room needs (Darlene 2026-11-04). The teacher's note is free text, so keep just the sentences about equipment and set-up
  // (straps, pillows, mats, sound system...); anything else in the note (dates, music taste, comments) is not shown.
  const needField = { morn: 'morningNotes', morn_arr: 'morningNotes', morn_dep: 'morningNotes', aft: 'afternoonNotes', arr: 'arrivalNotes', dep: 'departureNotes' };
  const roomNeed = e => {
    const m = /_(morn_arr|morn_dep|morn|aft|arr|dep)$/.exec(String(e.id || '')), bk = m && (AppData.bookings || []).find(b => b.id === e.bkId);
    const note = bk && String((bk.scheduleRequest || {})[needField[m[1]]] || '').trim();
    const t = note && dbRoomNeedText(note);
    return t ? `<div style="margin:3px 0 0 120px;font-size:12.5px;color:#374151"><b>Room needs:</b> ${dbEsc(t)}</div>` : '';
  };
  // Two sections, each in time order (Darlene 2026-11-04): Classes (with the opening circles), and Tours and activities (tours, ceremonies, extras)
  const glanceRows = list => list.map(({ e, k }) => dbRow(`<span style="display:inline-block;min-width:112px;margin-right:8px;text-align:center;font-size:10.5px;font-weight:700;padding:1px 8px;border-radius:9px;background:${tagOf[k][1]};color:${tagOf[k][2]}">${tagOf[k][0]}</span>` + (k === 'tour' || k === 'extra' ? `<span style="color:#b91c1c;font-weight:600">${evLine(e)}</span>${dbActPeople(e)}` : evLine(e)) + roomNeed(e))).join('');   // tours and activities are red (Darlene 2026-11-04)
  const dayClasses = dayAll.filter(x => x.k === 'class' || x.k === 'circle'), dayTours = dayAll.filter(x => x.k === 'tour' || x.k === 'extra');
  // The page has four views of the day, picked at the top (Darlene 2026-11-04): Daily flow (everything together in time order), Classes, Tours, Special notes
  // Only what is scheduled today is listed (Darlene 2026-11-04); a tour appears here as soon as its day and time are filled in on the Activities page.
  const notesRows = (g.special.length ? g.special.map(x => dbRow(`<b>${dbEsc(x.who)}</b> · ${dbEsc(x.label)}: ${dbEsc(x.text)}`)).join('') : '') +
    g.arrivals.map(b => { const n = dbArrNote(b); return n ? dbRow(`<b>${dbEsc(b.leaderName || b.retreatName)}</b> · arriving: ${n}`) : ''; }).join('') +
    g.departures.map(b => { const n = dbDepNote(b); return n ? dbRow(`<b>${dbEsc(b.leaderName || b.retreatName)}</b> · departing: ${n}`) : ''; }).join('');
  const tabBtn = (k, label) => `<button onclick="dbTab='${k}';dbRender()" style="padding:8px 18px;border:1.5px solid ${dbTab === k ? '#2d6a6a' : '#d6cfc4'};background:${dbTab === k ? '#2d6a6a' : '#fff'};color:${dbTab === k ? '#fff' : '#1f2937'};border-radius:99px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer">${label}</button>`;
  html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px">${tabBtn('flow', 'Daily flow')}${tabBtn('classes', 'Classes')}${tabBtn('tours', 'Tours')}${tabBtn('notes', 'Special notes')}</div>`;
  if (dbTab === 'classes') html += dbCard('Classes', dayClasses.length ? glanceRows(dayClasses) : dbNone('No classes today.'), dayClasses.length);
  else if (dbTab === 'tours') html += dbCard('Tours and activities', dayTours.length ? glanceRows(dayTours) : dbNone('No tours or activities scheduled today.'), dayTours.length + ' scheduled');
  else if (dbTab === 'notes') html += dbCard('Special notes', notesRows || dbNone('No special notes today.'));
  else html += dbCard('Daily flow <span style="font-weight:500;color:#6b7280">— classes, circles, tours and activities together, in time order</span>', dayAll.length ? glanceRows(dayAll) : dbNone('Nothing scheduled today.'), dayAll.length);
  // 1. Arrivals
  const arrBody = g.arrivals.length ? g.arrivals.map(b => dbRow(`${dbArrivedBox(b)}${dbCircleLeader(b)}<b>${dbEsc(b.leaderName || b.retreatName)}</b>${b.retreatName && b.retreatName !== b.leaderName ? ' <span style="color:#0f766e;font-weight:600">(' + dbEsc(b.retreatName) + ')</span>' : ''} · ${b.pax || '?'} guests · ${(b.blockedRooms || []).length} rooms · ${dbFmtT((b.scheduleRequest || {}).arrivalSlot) || ''}${dbRoomUpgrade(b)}${dbArrNote(b) ? '<div style="margin-top:3px;font-size:12.5px;color:#374151"><b>Special notes:</b> ' + dbArrNote(b) + '</div>' : ''}`)).join('') : dbNone('No retreat arrivals today.');
  html += dbCard('Arrivals', arrBody + (g.hkOk ? dbRow(`${g.rooms.length} room${g.rooms.length === 1 ? '' : 's'} arriving today (all guests)`) : ''), g.arrivals.length + ' retreat' + (g.arrivals.length === 1 ? '' : 's'));
  // 2. A/C sits right under the arrivals (Darlene 2026-11-05); the room readiness (rooms still to clean) goes at the end of the page
  let rr, acRows = '';
  if (!g.hkOk) { rr = dbRow(PENDING + ' Room readiness comes from Housekeeping and is shown for today only.'); pend.push('Room readiness'); }
  else {
    const ready = g.rooms.filter(r => r.status === 'clean').length, ac = g.rooms.filter(r => r.ac24h);
    rr = dbRow(`<b>${ready}</b> of <b>${g.rooms.length}</b> arriving rooms are clean and ready.`, ready < g.rooms.length) +
      (g.rooms.filter(r => r.status !== 'clean').map(r => dbRow(`<span style="color:#991b1b;font-weight:600">Room ${dbEsc(r.room)}</span> · ${dbEsc(r.who)} · <b>${dbEsc(r.status)}</b>${r.turnover ? ' (same-day turnover)' : ''}`, true)).join(''));
    acRows = dbRow(ac.length ? `A/C 24h rooms: ${ac.map(r => dbEsc(r.room)).join(', ')}` : 'No arriving room is flagged A/C 24h.') +
      dbRow('A/C turned on in the arriving rooms: ' + ((dbGet('tasks.ac:' + dbDate + '.done')) ? '<b style="color:#166534">Done</b>' : PENDING));
    if (!dbGet('tasks.ac:' + dbDate + '.done') && g.arrivals.length) pend.push('A/C in arriving rooms');
  }
  if (acRows) html += dbCard('A/C for the arriving rooms', acRows);
  const roomCard = dbCard('Room readiness', rr);   // placed last: rooms that still need cleaning go at the end of the page (Darlene 2026-11-04)
  // 3. Salamon's arrivals
  const arrT = g.transport.filter(t => t.kind === 'arrival').sort((a, b) => String(a.sub.arrivalTime).localeCompare(String(b.sub.arrivalTime)));
  const sal = arrT.filter(t => /salamon/i.test(t.name)), oth = arrT.filter(t => !/salamon/i.test(t.name));
  const tLine = t => {
    const s = t.sub, st = t.rec ? t.rec.status : 'pending', here = dbSubArrived(s), up = typeof tr2ConfirmedUpgrades !== 'undefined' ? tr2ConfirmedUpgrades.get(s.id) : null;
    return dbRow(`${dbTick(here)}<b>${dbFmtT(s.arrivalTime) || PENDING}</b> · ${dbEsc((typeof trTransportFullName === 'function' ? trTransportFullName(s) : '') || 'Guest')}${dbRetreatTag(s)} · driver <b>${dbEsc(t.name)}</b> · <span style="color:${here ? '#166534' : '#92400e'};font-weight:700">${here ? 'Arrived' : 'Pending to arrive'}</span>${up ? ' · <b style="color:#7c3aed">Upgrade: room ' + dbEsc(up.newRoom) + '</b>' : ''}`, !here);
  };
  html += dbCard("Salamon's arrivals", (sal.length ? sal.map(tLine).join('') : dbNone('No airport arrivals for Salamon today.')) + (oth.length ? `<div style="padding:6px 14px;background:#faf8f4;font-size:11px;font-weight:700;color:#8a7e74;text-transform:uppercase">Other drivers</div>` + oth.map(tLine).join('') : ''), arrT.length + ' arrival' + (arrT.length === 1 ? '' : 's'));
  // 4. Departures
  const depT = g.transport.filter(t => t.kind === 'departure');
  const depBal = {};
  if (g.departures.length && typeof cbScan === 'function' && typeof cbState !== 'undefined' && typeof cbToday === 'function' && dbDate === cbToday()) {
    const w = cbState.window; cbState.window = 'today'; try { (await cbScan()).forEach(r => { depBal[r.regId] = r; }); } catch (e) {} cbState.window = w;
  }
  // Every guest whose own check-out is today, whichever retreat or booking they are on (a guest who shortened or extended a stay leaves on a different day from the retreat: Darlene 2026-11-05)
  const depGuests = (AppData.regs || []).filter(r => { const b = (AppData.bookings || []).find(x => x.id === r.bookingId); return b && b.status !== 'cancelled' && !(b.flags || []).includes('archived') && !r.cancelled && String(r.checkOut || b.endDate || '').slice(0, 10) === dbDate; })
    .sort((a, b) => (!!a.checkedOutAt - !!b.checkedOutAt) || String(a.room).localeCompare(String(b.room), undefined, { numeric: true }));
  const balPill = r => { if (!r) return ''; const m = typeof cbMoney === 'function' ? cbMoney(Math.abs(r.balance)) : '$' + Math.abs(r.balance).toFixed(2);
    return r.status === 'owes' ? `<b style="color:#b91c1c">Owes ${m}</b>` : r.status === 'zero' ? '<b style="color:#166534">Paid</b>' : r.status === 'credit' ? `<b style="color:#1d4ed8">Credit ${m}</b>` : '<span style="color:#9ca3af">No bill yet</span>'; };
  // A guest who is already checked out is no longer listed (Darlene 2026-11-05): one grey line says how many, with their names. Their airport line is dropped too.
  const depLeft = depGuests.filter(r => !r.checkedOutAt), depDone = depGuests.filter(r => r.checkedOutAt);
  const doneNote = depDone.length ? dbRow(`<span style="color:#6b7280;font-size:12.5px">✓ ${depDone.length} already checked out: ${depDone.map(r => dbEsc((r.guests || []).map(x => x.name).filter(Boolean)[0] || 'Room ' + r.room)).join(', ')}</span>`) : '';
  const depRows = depLeft.map(r => {
    const nm = (r.guests || []).map(x => x.name).filter(Boolean).join(' & ') || 'Guest', out = !!r.checkedOutAt, rec = dbCoLog[r.id];
    return dbRow(`<span onclick="dbToggleOut('${r.id}')" title="${out ? 'Checked out (click to undo)' : 'Click when checked out'}" style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin-right:8px;vertical-align:middle;border:2px solid ${out ? '#15803d' : '#9ca3af'};border-radius:5px;background:${out ? '#15803d' : '#fff'};color:#fff;font-size:14px;font-weight:800;line-height:1">${out ? '✓' : ''}</span>Room <b>${dbEsc(r.room || '—')}</b> · ${dbEsc(nm)}${(() => { const bk = (AppData.bookings || []).find(x => x.id === r.bookingId); return bk && !g.departures.some(d => d.id === bk.id) ? ' <span style="color:#0f766e;font-weight:600">· ' + dbEsc(bk.retreatName || bk.leaderName || '') + '</span>' : ''; })()} · ${balPill(depBal[r.id])} · ${out ? `<b style="color:#166534">Checked out</b>${rec ? ` <span title="${dbEsc(rec.by)}" style="display:inline-block;background:#dcfce7;color:#166534;border-radius:99px;padding:1px 8px;font-size:11.5px;font-weight:800">${dbEsc(dbInitials(rec.by))}</span>` : ''}` : '<span style="color:#92400e;font-weight:600">Not checked out</span>'}`, !out && depBal[r.id] && depBal[r.id].status === 'owes');
  }).join('');
  html += dbCard('Departures', (g.departures.length ? g.departures.map(b => dbRow(`<b>${dbEsc(b.leaderName || b.retreatName)}</b> · ${dbDepCount(b)} · checking out today${dbDepNote(b) ? '<div style="margin-top:3px;font-size:12.5px;color:#991b1b;font-weight:600">' + dbDepNote(b) + '</div>' : ''}`)).join('') + depRows + doneNote : dbNone('No retreat departures today.')) +
    depT.filter(t => { const rg = dbRegOf(t.sub); return !(rg && rg.checkedOutAt); }).map(t => dbRow(`Airport departure <b>${dbFmtT(t.sub.departureTime) || PENDING}</b> · ${dbRoomOf(t.sub)}${dbEsc((typeof trTransportFullName === 'function' ? trTransportFullName(t.sub) : '') || 'Guest')}${dbRetreatTag(t.sub)} · driver ${dbEsc(t.name)}`)).join(''), g.departures.length + ' retreat' + (g.departures.length === 1 ? '' : 's'));
  // 5. Classes, opening circles, tours, extra activities
  const evCard = (title, list, empty) => dbCard(title, list.length ? list.map(e => dbRow(evLine(e))).join('') : dbNone(empty), list.length);
  html += evCard('Classes', buckets.class, 'No classes today.') + evCard('Opening circles / orientations', buckets.circle, 'No opening circle today.') + evCard('Tours', buckets.tour, 'No tours today.') + evCard('Extra activities and ceremonies', buckets.extra, 'No extra activities today.');
  // 6. Tour preparation
  let prep = g.tours.length ? g.tours.map(t => {
    if (t.cancelled) return `<div style="padding:10px 14px;border-top:1px solid #f0ebe0;font-weight:700;font-size:14px;color:#6b7280"><span style="text-decoration:line-through">${dbEsc(t.name)} · ${dbFmtT(t.time)}</span>${cancelTag(t.why)}<div style="font-size:12.5px;font-weight:400;margin-top:2px">No driver, guides or snack needed.</div></div>`;
    const total = t.groups.reduce((n, x) => n + x.names.length, 0);
    return `<div style="padding:10px 14px;border-top:1px solid #f0ebe0"><div style="font-weight:700;font-size:14px">${dbEsc(t.name)} · ${dbFmtT(t.time)}</div>
      <div style="font-size:13px;margin-top:3px">Driver: ${t.driver ? '<b>' + dbEsc(t.driver) + '</b>' : PENDING}${t.guides.length ? ' · Guides: <b>' + t.guides.map(dbEsc).join(' & ') + '</b>' : ' · Guides: ' + PENDING}</div>
      <div style="font-size:13px;margin-top:3px">Guests (${total}): ${t.groups.map(x => `<b>${dbEsc(x.bk.leaderName || x.bk.retreatName)}</b> — ${/^pre-paid|^included/.test(x.basis) ? '<span style="color:#166534;font-weight:600">pre-paid' + (/whole group/.test(x.basis) ? ', ' + x.names.length + ' guest' + (x.names.length === 1 ? '' : 's') : ', leader only') + '</span>' : (x.names.length ? dbEsc(x.names.join(', ')) : PENDING + ' (' + x.basis + ')')}`).join(' · ')}</div>
      <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-top:5px;color:${dbGet('tasks.snack:' + t.aoId + '.done') ? '#166534' : '#991b1b'};font-weight:600"><input type="checkbox" ${dbGet('tasks.snack:' + t.aoId + '.done') ? 'checked' : ''} onchange="dbSet('tasks.snack:${t.aoId}.done',this.checked);dbRender()"> Tour snack request is posted on the kitchen fridge</label></div>`;
  }).join('') : dbNone('No tours to prepare today.');
  g.tours.filter(t => !t.cancelled).forEach(t => { if (!t.driver) pend.push('Driver for ' + t.name); if (!t.guides.length) pend.push('Guides for ' + t.name); if (!dbGet('tasks.snack:' + t.aoId + '.done')) pend.push('Snack request for ' + t.name); });
  html += dbCard('Tour and class preparation', prep);
  // 7. Rooms ready to show, and upgrades (replaces the task list, Darlene 2026-11-04)
  const readyRooms = (g.rooms || []).filter(r => r.status === 'clean');
  html += dbCard('Rooms ready to show', g.hkOk ? (readyRooms.length ? readyRooms.map(r => dbRow(`<b style="color:#166534">Room ${dbEsc(r.room)}</b> · ${dbEsc(r.who)} · ready`)).join('') : dbNone('No arriving room is ready yet.')) : dbRow(PENDING + ' Room readiness comes from Housekeeping and is shown for today only.'), g.hkOk ? readyRooms.length + ' of ' + g.rooms.length : null);
  // Upgrades for the day (Darlene 2026-11-05): each one sold with who sold it and for how much (the commission record made when the upgrade is confirmed on the Transport tab: guest, rooms, price, seller),
  // free room moves, and how many were declined (the answer staff give on the check-in form).
  let sold = [], answers = { accepted: 0, declined: 0, none: 0 }, declinedNames = [];
  try { const { data } = await db.from('commissions').select('staff_name,guest_name,room_from,room_to,upgrade_pretax,upgrade_total,date,type').eq('type', 'upgrade').eq('date', dbDate); sold = data || []; } catch (e) {}
  try {
    if (typeof ciLoad === 'function') await ciLoad(true);
    Object.entries(typeof ciLog !== 'undefined' ? ciLog : {}).forEach(([id, r]) => {
      if (!r || !r.upgrade || !r.at) return;
      const day = new Date(new Date(r.at).getTime() - 5 * 3600000).toISOString().slice(0, 10); if (day !== dbDate) return;
      if (answers[r.upgrade] != null) answers[r.upgrade]++;
      if (r.upgrade === 'declined') { const reg = (AppData.regs || []).find(x => x.id === id); declinedNames.push(reg ? ((reg.guests || []).map(g => g.name).filter(Boolean)[0] || 'Room ' + reg.room) : 'a guest'); }
    });
  } catch (e) {}
  const freeMoves = g.transport.filter(t => t.kind === 'arrival' && typeof tr2ConfirmedUpgrades !== 'undefined' && tr2ConfirmedUpgrades.get(t.sub.id) && (tr2ConfirmedUpgrades.get(t.sub.id).lateral || !sold.some(x => String(x.room_to) === String(tr2ConfirmedUpgrades.get(t.sub.id).newRoom))));
  const money = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const soldRows = sold.map(x => dbRow(`<b>${dbEsc(x.guest_name || 'Guest')}</b> · room ${dbEsc(x.room_from)} → <b style="color:#7c3aed">${dbEsc(x.room_to)}</b> · <b style="color:#166534">${money(x.upgrade_total != null ? x.upgrade_total : x.upgrade_pretax)}</b>${x.upgrade_total != null && x.upgrade_pretax != null ? ` <span style="color:#6b7280;font-size:12px">(${money(x.upgrade_pretax)} before tax)</span>` : ''} · sold by <b>${dbEsc(x.staff_name || 'no seller recorded')}</b>`)).join('');
  const freeRows = freeMoves.map(t => { const u = tr2ConfirmedUpgrades.get(t.sub.id); return dbRow(`<b>${dbEsc((typeof trTransportFullName === 'function' ? trTransportFullName(t.sub) : '') || 'Guest')}</b>${dbRetreatTag(t.sub)} · moved to room <b style="color:#7c3aed">${dbEsc(u.newRoom)}</b> · ${u.lateral ? 'free move' : 'upgrade'}${u.staffName ? ' · by ' + dbEsc(u.staffName) : ''}`); }).join('');
  const total = sold.reduce((n, x) => n + Number(x.upgrade_total != null ? x.upgrade_total : x.upgrade_pretax || 0), 0);
  const summary = dbRow(`<b>${sold.length}</b> sold${sold.length ? ` for <b style="color:#166534">${money(total)}</b>` : ''} · <b>${answers.declined}</b> declined${declinedNames.length ? ' (' + declinedNames.map(dbEsc).join(', ') + ')' : ''} · <b>${answers.accepted}</b> accepted at check-in · <b>${answers.none}</b> not offered`);
  html += dbCard('Upgrades', summary + (soldRows || freeRows ? soldRows + freeRows : dbNone('No upgrades sold or confirmed for this day.')), sold.length + freeMoves.length);
  // 8. After-dinner orientations
  const needOr = g.arrivals.filter(dbIsRetreatStart).map(bk => {   // an extra night before a retreat has no orientation of its own: it is on the retreat's start day
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
        <select id="dbOrP_${x.bk.id}" style="padding:6px 8px;border:1.5px solid #d6cfc4;border-radius:7px"><option value="">— who leads it —</option>${[...new Set([...DB_CIRCLE_LEADERS, x.o.leader].filter(Boolean))].map(n => `<option value="${dbEsc(n)}" ${n === x.o.leader ? 'selected' : ''}>${dbEsc(n)}</option>`).join('')}</select>
        <button onclick="dbSaveOrient('${x.bk.id}')" class="btn btn-primary" style="font-size:12.5px">Schedule it</button></div></div>`;
  }).join('') : dbNone('No retreat arrives today.');
  html += dbCard('After-dinner orientations', orBody);
  // (The Teacher arrival checklist was removed from the briefing, Darlene 2026-11-04: the Host Checklist is the only checklist.)
  // 10. Attendance
  // Only the host matters here (Darlene 2026-11-04): who is working as the host today, and their hours. The other departments are no longer asked.
  // The host comes from the Staff Schedules page (the Reception / Front Desk grid for this week), so nobody types it twice (Darlene 2026-11-05).
  // Anything typed here wins over the schedule; clearing the box goes back to the schedule.
  if (typeof ssLoad === 'function' && typeof ssLoaded !== 'undefined' && !ssLoaded) await ssLoad();
  let autoWho = '', autoHours = '', autoNote = '';
  try {
    if (typeof ssWorkersOn === 'function') {
      const w = ssWorkersOn(dbDate).reception;
      if (!w) autoNote = 'The Reception schedule for this week is not entered on the Staff Schedules page.';
      else {
        // the host: a row in a Host section (or marked Host); else the front desk post (FD); else everyone working on Reception
        let on = w.filter(x => x.working); const hostRows = on.filter(x => /host/i.test((x.section || '') + ' ' + (x.tag || ''))), fd = on.filter(x => /FD/i.test(x.tag)); if (hostRows.length) on = hostRows; else if (fd.length) on = fd;
        const t12 = h => ((h % 12) || 12) + (h >= 12 && h < 24 ? ' pm' : ' am');
        const hrs = x => x.start != null ? t12(x.start) + ' – ' + t12(x.end) : (x.half ? x.half + ' shift' : '');
        autoWho = on.map(x => x.name).join(' & ');
        autoHours = on.length === 1 ? hrs(on[0]) : on.map(x => x.name + ' ' + hrs(x)).join(' · ');
        if (!on.length) autoNote = 'Nobody on the Reception schedule is working today.';
      }
    }
  } catch (e) {}
  const savedWho = dbGet('attendance.Host.present') || '', savedHours = dbGet('attendance.Host.hours') || '';
  const hostWho = savedWho || autoWho, hostHours = savedHours || autoHours;
  if (!hostWho) pend.push('Host today'); else if (!hostHours) pend.push('Host hours');
  const hostIn = (path, val, ph, w) => `<input type="text" value="${dbEsc(val)}" placeholder="${ph}" onchange="dbSet('${path}',this.value);dbRender()" style="padding:6px 10px;border:1.5px solid ${val ? '#d6cfc4' : '#fca5a5'};border-radius:7px;min-width:${w}px">`;
  const fromSched = (!savedWho && autoWho) || (!savedHours && autoHours);
  html += dbCard('Host today', dbRow(`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><b style="min-width:70px">Host</b>${hostIn('attendance.Host.present', hostWho, 'Who is the host today', 220)}${hostIn('attendance.Host.hours', hostHours, 'Hours (e.g. 8 am – 4 pm)', 190)}${hostWho && hostHours ? '' : PENDING}</div>` + (fromSched ? '<div style="margin-top:4px;font-size:12px;color:#6b7280">Filled in from the Reception schedule on the Staff Schedules page. Type over it to change today.</div>' : '') + ((savedWho || savedHours) && (autoWho || autoHours) ? `<div style="margin-top:4px;font-size:12px"><a href="#" onclick="dbSet('attendance.Host.present','');dbSet('attendance.Host.hours','');dbRender();return false" style="color:#2d6a6a;font-weight:700">Use the schedule again</a> <span style="color:#6b7280">(the box has typed text that hides it)</span></div>` : '') + (autoNote && !hostWho ? `<div style="margin-top:4px;font-size:12px;color:#92400e">${dbEsc(autoNote)}</div>` : '')));
  // (The Staff hours card and its warnings were removed from the briefing, Darlene 2026-11-05: only the host and the host's hours are needed.)
  let hours = null;
  html += roomCard;
  // summary strip on top
  const strip = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${[['Arrivals', g.arrivals.length, '#1d4ed8'], ['Departures', g.departures.length, '#475569'], ['Tours', g.tours.filter(t => !t.cancelled).length, '#0d9488'], ['Pending confirmation', [...new Set(pend)].length, pend.length ? '#b45309' : '#166534']].map(([l, n, c]) => `<div style="background:#fff;border:1.5px solid ${c}55;border-radius:10px;padding:8px 16px;min-width:110px"><div style="font-size:22px;font-weight:700;color:${c}">${n}</div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7280">${l}</div></div>`).join('')}</div>`;
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
  const dayList = ['circle', 'class', 'tour', 'extra'].flatMap(k => c.buckets[k]).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
  const sec = (title, list) => { lines.push('', title.toUpperCase()); (list.length ? list : ['none']).forEach(e => lines.push(typeof e === 'string' ? e : `${dbFmtT(e.startTime)} ${e.title || ''} · ${e.subtitle || ''}`)); };
  sec('Day at a glance', dayList); sec('Classes', c.buckets.class); sec('Opening circles', c.buckets.circle); sec('Tours', c.buckets.tour); sec('Extra activities', c.buckets.extra);
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
