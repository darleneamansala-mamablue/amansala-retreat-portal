'use strict';

// integrity-check.js — every morning (netlify.toml, 11:00 UTC = 6 am Tulum) the portal's data is checked for the kinds of damage a lost
// or bad save leaves behind, and Jorge gets ONE WhatsApp only when something is found (Jorge 2026-11-07: "cubrir 100%"):
//   1. a room with two guests on overlapping nights (two stays in the same room, or a bed and its whole room), next 120 days
//   2. a guest in a room that is not on their retreat's room list
//   3. folio lines whose folio is gone; folios whose reservation is gone
//   4. the same person twice for an arrival or a departure on the same day (next 14 days)
//   5. spa settings with no therapists or no services; a therapist with two appointments at the same time (next 14 days)
//   6. the menu without the current week
//   7. mass deletions in the last 24 hours (History): 15+ rows of one table by one person, or 20+ records taken out of a list at once
// The full result is kept in app_store 'integrity_report' {at, issues}. Scheduled only; integrity-check-now.js runs it on demand (admins).
const { sendUtility } = require('./wa-utility-lib');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const JORGE_PHONE = '529844523336';   // same as ask-jorge.js
const H = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const today = (n = 0) => new Date(Date.now() - 5 * 3600000 + n * 864e5).toISOString().slice(0, 10);

async function getAll(key, path) {
  const out = [];
  for (let from = 0; from < 50000; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { ...H(key), Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
    if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
const appStore = async (key, k) => { const [r] = await getAll(key, `app_store?key=eq.${encodeURIComponent(k)}&select=value`); return r ? r.value : null; };

// the same physical space: the same room, or a whole room and one of its beds ("26" / "26a", "4B" / "4B -a")
function sameSpace(a, b) {
  if (a === b) return true;
  const bedOf = (bed, room) => bed.length > room.length && bed.startsWith(room) && /^( -)?[a-d]$/.test(bed.slice(room.length));
  return bedOf(a, b) || bedOf(b, a);
}
const overlap = (s1, e1, s2, e2) => s1 < e2 && s2 < e1;

async function run(key) {
  const issues = [];
  const add = (kind, text) => issues.push({ kind, text });
  const t0 = today(), t14 = today(14), t120 = today(120);

  // ---- stays ----
  const bookings = await getAll(key, `bookings?select=id,leader_name,retreat_name,start_date,end_date,status,blocked_rooms,booking_type&status=neq.cancelled&end_date=gte.${t0}`);
  const bkById = Object.fromEntries(bookings.map(b => [b.id, b]));
  const regs = [];
  const ids = bookings.map(b => b.id);
  for (let i = 0; i < ids.length; i += 60) regs.push(...await getAll(key, `registrations?select=id,booking_id,room,guests,check_in,check_out,cancelled&booking_id=in.(${ids.slice(i, i + 60).map(encodeURIComponent).join(',')})`));
  const stays = [];
  regs.forEach(r => {
    if (r.cancelled || !r.room) return;
    const names = (r.guests || []).filter(g => g && g.name && !g.cancelled).map(g => g.name);
    if (!names.length) return;
    const b = bkById[r.booking_id]; if (!b) return;
    const s = r.check_in || b.start_date, e = r.check_out || b.end_date;
    if (!(e > t0) || s > t120) return;
    stays.push({ room: r.room, s, e, who: names.join(' & '), where: b.leader_name || b.retreat_name || 'reservation', bk: b.id });
    // 2. a guest in a room that is not on the room list
    if (b.booking_type !== 'room_only' && !(b.blocked_rooms || []).includes(r.room)) add('room list', `${names.join(' & ')} is in room ${r.room} but ${b.leader_name || b.retreat_name}'s room list does not have it`);
  });
  const reqs = await getAll(key, `booking_requests?select=id,first_name,last_name,room,check_in,check_out,status&check_out=gt.${t0}&room=not.is.null`);
  reqs.filter(q => !['cancelled', 'pending', 'requested'].includes(q.status)).forEach(q => stays.push({ room: q.room, s: q.check_in, e: q.check_out, who: `${q.first_name || ''} ${q.last_name || ''}`.trim(), where: 'online stay', bk: 'rq_' + q.id }));
  // 1. two guests in the same space on overlapping nights
  const seenPair = new Set();
  for (let i = 0; i < stays.length; i++) for (let j = i + 1; j < stays.length; j++) {
    const a = stays[i], b = stays[j];
    if (a.bk === b.bk || !sameSpace(a.room, b.room) || !overlap(a.s, a.e, b.s, b.e)) continue;
    const k = [a.room, b.room, a.who, b.who].sort().join('|'); if (seenPair.has(k)) continue; seenPair.add(k);
    add('double booking', `Room ${a.room}${a.room !== b.room ? '/' + b.room : ''}: ${a.who} (${a.where}, ${a.s}→${a.e}) and ${b.who} (${b.where}, ${b.s}→${b.e})`);
  }

  // ---- folios ----
  const folios = await getAll(key, 'folios?select=id,name,registration_id,booking_request_id');
  const folioIds = new Set(folios.map(f => f.id));
  const allRegIds = new Set((await getAll(key, 'registrations?select=id')).map(r => r.id));
  const allReqIds = new Set((await getAll(key, 'booking_requests?select=id')).map(r => r.id));
  const orphanFolios = folios.filter(f => (f.registration_id && !allRegIds.has(f.registration_id)) || (f.booking_request_id && !allReqIds.has(f.booking_request_id)));
  if (orphanFolios.length) add('folios', `${orphanFolios.length} folio(s) whose reservation no longer exists: ${orphanFolios.slice(0, 5).map(f => `"${f.name}"`).join(', ')}${orphanFolios.length > 5 ? '…' : ''}`);
  const items = await getAll(key, 'folio_items?select=id,folio_id,description');
  const orphanItems = items.filter(i => !folioIds.has(i.folio_id));
  if (orphanItems.length) add('folios', `${orphanItems.length} charge/payment line(s) whose folio no longer exists: ${orphanItems.slice(0, 4).map(i => `"${String(i.description || '').slice(0, 40)}"`).join(', ')}`);

  // ---- transport (next 14 days) ----
  const tr = await getAll(key, 'transport?select=id,booking_id,data');
  const legs = {};
  tr.forEach(row => {
    // name AND email: one person often fills the forms of friends with her own email (McClelland family, Rachel Nolan)
    const d = row.data || {}, who = `${d.firstName || ''} ${d.lastName || ''}|${d.email || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
    if (who === '|') return;
    [['arrival', d.arrivalDate, d.arrivalOT], ['departure', d.departureDate, d.departureOT]].forEach(([leg, date, ot]) => {
      if (!date || ot || date < t0 || date > t14) return;
      const k = `${leg}|${date}|${who}`; (legs[k] = legs[k] || []).push(`${d.firstName || ''} ${d.lastName || ''}`.trim());
    });
  });
  Object.entries(legs).filter(([, v]) => v.length > 1).forEach(([k, v]) => { const [leg, date] = k.split('|'); add('transport', `${v[0]} has ${v.length} ${leg}s on ${date} in Transport`); });

  // ---- spa ----
  const spa = await appStore(key, 'spa_data') || {};
  if (!(spa.therapists || []).length) add('spa', 'Spa settings have NO therapists (the settings may have been overwritten — check History)');
  if (!(spa.services || []).length) add('spa', 'Spa settings have NO services (the settings may have been overwritten — check History)');
  const appts = (await appStore(key, 'spa_appointments')) || [];
  const thName = Object.fromEntries((spa.therapists || []).map(t => [t.id, `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.name || t.id]));
  const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const live = appts.filter(a => a && a.date >= t0 && a.date <= t14 && a.therapistId && !/CANCEL|NO_SHOW/i.test(a.status || ''));
  const seenAp = new Set();
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (a.date !== b.date || a.therapistId !== b.therapistId) continue;
    const as = toMin(a.start), ae = as + (Number(a.duration) || 60), bs = toMin(b.start), be = bs + (Number(b.duration) || 60);
    if (!(as < be && bs < ae)) continue;
    if ((a.groupId && a.groupId === b.groupId) || a.sessionType === 'group' || b.sessionType === 'group') continue;
    const k = [a.id, b.id].sort().join('|'); if (seenAp.has(k)) continue; seenAp.add(k);
    add('spa', `${thName[a.therapistId] || 'A therapist'} has two appointments at the same time on ${a.date}: ${a.clientName} ${a.start} and ${b.clientName} ${b.start}`);
  }

  // ---- menu ----
  const menu = await appStore(key, 'menuSchedule') || {};
  const week = [...Array(7)].map((_, i) => today(i));
  if (!week.some(d => menu[d] && Object.values(menu[d]).some(v => Array.isArray(v) && v.length))) add('menu', 'The menu has no meal rows for the coming 7 days (it may have been overwritten — check History / Past menus)');

  // ---- mass deletions (History, last 24 h) ----
  try {
    const since = new Date(Date.now() - 864e5).toISOString();
    const hist = await getAll(key, `data_history?select=tbl,op,who,row_id,old_data&at=gte.${encodeURIComponent(since)}`);
    const dels = {};
    hist.filter(h => h.op === 'DELETE').forEach(h => { const k = `${h.tbl}|${h.who}`; dels[k] = (dels[k] || 0) + 1; });
    Object.entries(dels).filter(([, n]) => n >= 15).forEach(([k, n]) => { const [tbl, who] = k.split('|'); add('deletions', `${who} deleted ${n} rows of ${tbl} in the last 24 hours (they can be restored from History)`); });
    hist.filter(h => h.tbl === 'app_store' && h.op === 'UPDATE' && Array.isArray(h.old_data && h.old_data.value) && h.old_data.value.length >= 20)
      .forEach(h => add('deletions', `"${h.row_id}" lost or changed ${h.old_data.value.length} records in one save by ${h.who} (check History)`));
  } catch (e) { /* the history is optional */ }

  return issues;
}

async function check({ dry } = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return { statusCode: 500, body: 'Server config error' };
  try {
    const issues = await run(key);
    const at = new Date().toISOString();
    await fetch(`${SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, { method: 'POST', headers: { ...H(key), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'integrity_report', value: { at, issues }, updated_at: at }) });
    let sent = false;
    if (issues.length && !dry) {
      const kinds = [...new Set(issues.map(i => i.kind))];
      const summary = `${issues.length} posible(s) problema(s) — ${kinds.join(', ')}: ` + issues.slice(0, 4).map(i => i.text).join(' · ').replace(/\s+/g, ' ').slice(0, 700);
      sent = !!(await sendUtility(JORGE_PHONE, [['portal_solicitud_pendiente', ['Revisión automática de datos', summary, 'El detalle completo está en app_store integrity_report', 'Portal']]], 'es_MX', 'integrity-' + at.slice(0, 10)));
    }
    console.log('[integrity-check]', issues.length, 'issue(s)', sent ? 'WhatsApp sent' : '');
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ at, count: issues.length, issues, sent }) };
  } catch (e) {
    console.error('[integrity-check]', e.message);
    return { statusCode: 500, body: e.message };
  }
}
exports.check = check;
exports.handler = async () => check();
