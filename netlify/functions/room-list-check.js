'use strict';

// room-list-check.js — the daily room check (Jorge's ask 2026-11-03, after Heather Rex's guests "disappeared" from her
// portal). Every morning at 7am Tulum (netlify.toml) it looks at every retreat that has not ended and finds:
//   1. a guest in a room that is not on their retreat's room list (the teacher portal, Transport and the room list
//      do not show them),
//   2. the same guest twice in one retreat (copies like Stephanie Cleary in CH7, Muffett Mayet in GV7),
//   3. a room given to guests of two different bookings on the same nights (GV7 Nov 4-6, room 10 Feb 6-9),
//   4. the same guest's transport form twice in one retreat (Lisa de Saxe Zerden, Heather Kasey),
//   5. a ride that should already be on the guest's folio and is not: today's arrivals (charged the night before) and the
//      departures of today and tomorrow (charged two days ahead). Real case: the 2026-11-02 night run left the Nov 3 arrivals
//      of Heather Kasey and Kathleen Railey uncharged, found only by hand.
// When it finds something it sends one WhatsApp (template amansala_revision_cuartos, via Visito) to each number in
// app_store 'room_check_alert' = {numbers: ['+52...'], enabled: true}. Nothing found = nothing sent.
// room-list-check-now.js runs the same check on demand (admin pass) and can return the result without sending.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const VISITO_API = 'https://platform-api.visitoai.com/m2m/v1';
const CHANNEL_ID = '6abd2154f6a6b5cd69232824';   // WhatsApp +52 1 984 879 5999
const TEMPLATE_NAME = 'amansala_revision_cuartos';
const TEMPLATE_LANG = 'es_MX';
const MAX_DETAIL = 900;
const { runCharges } = require('./transport-charge-lib');   // Meta caps a template body; the rest is summarised as "y N más"

const localDate = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
function fmtDateEsWeekday(d) {
  const s = new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const fmtShort = d => new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '');
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const PLACEHOLDER = /^(hold|student|tbd|tba|guest|staff|teacher|blocked?|reserved?|n\/?a|-+|\?+)\s*\d*$/i;   // slot fillers, not people
const names = r => (r.guests || []).map(g => String(g && g.name || '').trim()).filter(n => n && !PLACEHOLDER.test(n));

async function getAll(key, path) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}&limit=1000&offset=${off}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(path.split('?')[0] + ' ' + r.status);
    const rows = await r.json(); out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

// The check itself, on plain rows (also used by the test).
function findProblems(bookings, regs, today, transport = []) {
  const live = new Map(bookings.filter(b => b.status !== 'cancelled' && (b.end_date || '') >= today).map(b => [String(b.id), b]));
  const problems = [];
  const active = regs.filter(r => live.has(String(r.booking_id)) && r.cancelled !== true && names(r).length);
  const label = b => b.retreat_name || b.leader_name || 'Reserva';
  // 1. outside the room list (rooms not assigned yet, like WeTravel guests, are not a problem)
  for (const r of active) {
    const b = live.get(String(r.booking_id));
    if (r.room && !(b.blocked_rooms || []).includes(r.room)) problems.push({ kind: 'outside', at: b.start_date, text: `${r.room} fuera de la lista de ${label(b)}: ${names(r).join(' / ')}` });
  }
  // 2. the same guest in two rows of one retreat
  const byBk = new Map();
  for (const r of active) { const k = String(r.booking_id); if (!byBk.has(k)) byBk.set(k, []); byBk.get(k).push(r); }
  for (const [k, rs] of byBk) {
    const seen = new Map();
    for (const r of rs) for (const n of new Set(names(r).map(norm))) { if (!seen.has(n)) seen.set(n, []); seen.get(n).push(r.room || 'sin cuarto'); }
    for (const [n, rooms] of seen) if (rooms.length > 1) {
      const b = live.get(k), shown = names(rs.find(r => names(r).map(norm).includes(n)))[0] || n;
      problems.push({ kind: 'duplicate', at: b.start_date, text: `${shown} repetida en ${label(b)} (${rooms.join(', ')})` });
    }
  }
  // 3. one room, two bookings, same nights (the same person on both sides is a Cloudbeds copy of the stay, not a clash).
  //    A whole room also clashes with its own beds: "4B" with "4B -a"/"4B -b", "1" with "1a"/"1b" (Hayden Bedsole in 4B over
  //    Wendy Oberg's 4B -a/-b, 2026-11-03). A capital letter is its own room ("1B", "19B"), only a lowercase one or " -a" is a bed.
  const bedOf = room => { const m = /^(.+?)\s*-\s*[a-d]$/i.exec(room) || /^(.*\d)([a-d])$/.exec(room); return m ? m[1].trim() : null; };
  const physical = room => bedOf(room) || room;
  const clashes = (a, b) => a === b || (bedOf(a) === null && bedOf(b) === a) || (bedOf(b) === null && bedOf(a) === b);
  const byRoom = new Map();
  for (const r of active) {
    if (!r.room) continue;
    const b = live.get(String(r.booking_id));
    const ci = r.check_in || b.start_date, co = r.check_out || b.end_date;
    if (!ci || !co) continue;
    const k = physical(r.room);
    if (!byRoom.has(k)) byRoom.set(k, []);
    byRoom.get(k).push({ r, b, ci, co });
  }
  for (const [, list] of byRoom) {
    list.sort((x, y) => x.ci.localeCompare(y.ci));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const x = list[i], y = list[j];
      if (y.ci >= x.co) break;
      if (!clashes(x.r.room, y.r.room)) continue;
      const sameRoom = x.r.room === y.r.room;
      if (sameRoom && String(x.b.id) === String(y.b.id)) continue;
      const nx = names(x.r).map(norm), ny = names(y.r).map(norm);
      if (nx.some(n => ny.some(m => n.includes(m) || m.includes(n)))) continue;
      const from = y.ci > x.ci ? y.ci : x.ci, to = y.co < x.co ? y.co : x.co;
      const where = sameRoom ? x.r.room : `${x.r.room} / ${y.r.room}`;
      problems.push({ kind: 'clash', at: from, text: `${where} ${fmtShort(from)}–${fmtShort(to)}: ${names(x.r).join(' / ')} (${label(x.b)}) y ${names(y.r).join(' / ')} (${label(y.b)})` });
    }
  }
  // 4. the same guest's transport form twice in one retreat (same email + first name, or same full name) -- shows
  //    twice on Transport (Lisa de Saxe Zerden, Heather Kasey, 2026-11-03); rides that are already over are left out
  const trBy = new Map();
  for (const t of transport) {
    const d = t.data || {}, b = live.get(String(t.booking_id || d.bookingId));
    if (!b || !d.firstName) continue;
    const last = [d.arrivalDate, d.departureDate].filter(Boolean).sort().pop();
    if (last && last < today) continue;
    const first = norm(d.firstName), full = norm(`${d.firstName} ${d.lastName || ''}`), em = norm(d.email);
    for (const k of [em && `e|${b.id}|${em}|${first}`, `n|${b.id}|${full}`].filter(Boolean)) {
      if (!trBy.has(k)) trBy.set(k, []);
      trBy.get(k).push({ b, name: `${d.firstName} ${d.lastName || ''}`.trim(), id: t.id });
    }
  }
  const trSeen = new Set();
  for (const list of trBy.values()) {
    if (list.length < 2) continue;
    const key = list.map(x => x.id).sort().join(',');
    if (trSeen.has(key)) continue;
    trSeen.add(key);
    problems.push({ kind: 'transport', at: list[0].b.start_date, text: `Transporte repetido en ${label(list[0].b)}: ${list.map(x => x.name).join(' / ')}` });
  }
  const order = { clash: 0, nocharge: 1, outside: 2, duplicate: 3, transport: 4 };
  problems.sort((a, b) => order[a.kind] - order[b.kind] || String(a.at).localeCompare(String(b.at)));
  return problems;
}

function message(problems) {
  const count = problems.length === 1 ? '1 pendiente' : `${problems.length} pendientes`;
  let detail = '', used = 0;
  for (const p of problems) {
    const next = (detail ? ' · ' : '') + p.text;
    if (detail.length + next.length > MAX_DETAIL) break;
    detail += next; used++;
  }
  if (used < problems.length) detail += ` · y ${problems.length - used} más`;
  return { count, detail };
}

async function run({ send = true, numbers: only } = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return { error: 'SUPABASE_SERVICE_KEY missing' };
  const today = localDate();
  const bookings = await getAll(key, `bookings?select=id,retreat_name,leader_name,start_date,end_date,status,blocked_rooms&end_date=gte.${today}`);
  const ids = new Set(bookings.map(b => String(b.id)));
  const regs = (await getAll(key, 'registrations?select=id,booking_id,room,guests,check_in,check_out,cancelled&order=id')).filter(r => ids.has(String(r.booking_id)));
  const transport = (await getAll(key, 'transport?select=id,booking_id,data&order=id')).filter(t => ids.has(String(t.booking_id || (t.data || {}).bookingId)));
  const problems = findProblems(bookings, regs, today, transport);
  // 5. rides that should be charged by now: what the nightly run would still add (a dry run, nothing written)
  for (const [direction, date] of [['arrival', today], ['departure', today], ['departure', localDate(1)]]) {
    try {
      const res = await runCharges(key, { direction, date, mode: 'insertOnly', dryRun: true });
      for (const c of res.charged) problems.push({ kind: 'nocharge', at: date, text: `Sin cobro de transporte: ${c.names || c.room || 'grupo'}${c.room ? ` (${c.room})` : ''}, ${direction === 'arrival' ? 'llegada' : 'salida'} ${fmtShort(date)}` });
    } catch (e) { console.warn('[room-list-check] charge check', direction, date, e.message); }
  }
  // 6. this morning's portal -> Cloudbeds room sync (cb-room-sync.js, 6:30am): what it moved and what it could not
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.cb_room_sync_last&select=value`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const last = ((await r.json())[0] || {}).value || null;
    if (last && last.date === today) {
      for (const t of last.failed || []) problems.push({ kind: 'cbsync', at: today, text: `Cloudbeds no se pudo ajustar al portal: ${t}` });
      if ((last.moved || []).length) problems.push({ kind: 'cbmoved', at: today, text: `Cloudbeds ajustado al portal (${last.moved.length}): ${last.moved.join(' · ')}` });
    }
  } catch (e) { console.warn('[room-list-check] cb sync', e.message); }
  // 7. this morning's scan for copies in Cloudbeds (cb-dup-scan.js, 6:40am)
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.cb_dup_scan_last&select=value`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const last = ((await r.json())[0] || {}).value || null;
    if (last && last.date === today) for (const t of last.copies || []) problems.push({ kind: 'cbcopy', at: today, text: `Copia en Cloudbeds: ${t}` });
  } catch (e) { console.warn('[room-list-check] cb copies', e.message); }
  // 8. Cloudbeds links the database put back since yesterday's check (sql/cb_links_guard.sql): some screen saved an old
  //    copy that would have dropped them. Who / which page tells us where it comes from.
  try {
    const since = new Date(Date.now() - 86400000).toISOString();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/cb_links_log?select=booking_id,at,who,page,restored&restored=not.is.null&at=gte.${since}&order=at.asc`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const rows = r.ok ? await r.json() : [];
    const byId = new Map(bookings.map(b => [String(b.id), b]));
    for (const l of rows) {
      const b = byId.get(String(l.booking_id));
      const page = String(l.page || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0] || '?';
      problems.push({ kind: 'cblink', at: today, text: `Liga a Cloudbeds salvada: ${b ? (b.retreat_name || b.leader_name || 'Reserva') : l.booking_id} ${Object.keys(l.restored || {}).join(', ')} (guardó ${l.who || '?'} desde ${page})` });
    }
  } catch (e) { console.warn('[room-list-check] cb links', e.message); }
  const rank = { clash: 0, nocharge: 1, cbsync: 2, cbcopy: 3, cblink: 4, outside: 5, duplicate: 6, transport: 7, cbmoved: 8 };
  problems.sort((a, b) => rank[a.kind] - rank[b.kind] || String(a.at).localeCompare(String(b.at)));
  const msg = message(problems);
  const out = { date: today, bookings: bookings.length, problems: problems.map(p => p.text), sent: 0, failed: 0 };
  if (!problems.length || !send) return out;
  let cfg = {};
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.room_check_alert&select=value`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    cfg = ((await r.json())[0] || {}).value || {};
  } catch (e) { console.warn('[room-list-check] settings', e.message); }
  const numbers = only || (cfg.enabled === false ? [] : (cfg.numbers || []));
  const m2m = process.env.VISITO_M2M_KEY;
  if (!m2m || !numbers.length) { out.note = 'no numbers or no Visito key — nothing sent'; return out; }
  for (const to of numbers) {
    try {
      const r = await fetch(`${VISITO_API}/whatsapp-templates/${CHANNEL_ID}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${m2m}`, 'Content-Type': 'application/json', 'Idempotency-Key': `room-check-${today}-${to}-${problems.length}` },
        body: JSON.stringify({ to, template: { name: TEMPLATE_NAME, language: { code: TEMPLATE_LANG }, components: [{ type: 'body', parameters: [
          { type: 'text', text: fmtDateEsWeekday(today) }, { type: 'text', text: msg.count }, { type: 'text', text: msg.detail },
        ] }] } }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(data).slice(0, 200)}`);
      out.sent++;
    } catch (e) { out.failed++; console.error('[room-list-check] send failed', to, e.message); }
  }
  console.log('[room-list-check]', JSON.stringify({ date: today, problems: problems.length, sent: out.sent, failed: out.failed }));
  return out;
}

exports.handler = async () => { const r = await run(); return { statusCode: r.error ? 500 : 200, body: JSON.stringify(r) }; };
exports.run = run;
exports.findProblems = findProblems;
exports.message = message;
