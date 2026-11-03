'use strict';

// room-list-check.js — the daily room check (Jorge's ask 2026-11-03, after Heather Rex's guests "disappeared" from her
// portal). Every morning at 7am Tulum (netlify.toml) it looks at every retreat that has not ended and finds:
//   1. a guest in a room that is not on their retreat's room list (the teacher portal, Transport and the room list
//      do not show them),
//   2. the same guest twice in one retreat (copies like Stephanie Cleary in CH7, Muffett Mayet in GV7),
//   3. a room given to guests of two different bookings on the same nights (GV7 Nov 4-6, room 10 Feb 6-9).
// When it finds something it sends one WhatsApp (template amansala_revision_cuartos, via Visito) to each number in
// app_store 'room_check_alert' = {numbers: ['+52...'], enabled: true}. Nothing found = nothing sent.
// room-list-check-now.js runs the same check on demand (admin pass) and can return the result without sending.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const VISITO_API = 'https://platform-api.visitoai.com/m2m/v1';
const CHANNEL_ID = '6abd2154f6a6b5cd69232824';   // WhatsApp +52 1 984 879 5999
const TEMPLATE_NAME = 'amansala_revision_cuartos';
const TEMPLATE_LANG = 'es_MX';
const MAX_DETAIL = 900;   // Meta caps a template body; the rest is summarised as "y N más"

const localDate = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
function fmtDateEsWeekday(d) {
  const s = new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const fmtShort = d => new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '');
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const names = r => (r.guests || []).map(g => String(g && g.name || '').trim()).filter(Boolean);

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
function findProblems(bookings, regs, today) {
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
  // 3. one room, two bookings, same nights (the same person on both sides is a Cloudbeds copy of the stay, not a clash)
  const byRoom = new Map();
  for (const r of active) {
    if (!r.room) continue;
    const b = live.get(String(r.booking_id));
    const ci = r.check_in || b.start_date, co = r.check_out || b.end_date;
    if (!ci || !co) continue;
    if (!byRoom.has(r.room)) byRoom.set(r.room, []);
    byRoom.get(r.room).push({ r, b, ci, co });
  }
  for (const [room, list] of byRoom) {
    list.sort((x, y) => x.ci.localeCompare(y.ci));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const x = list[i], y = list[j];
      if (y.ci >= x.co) break;
      if (String(x.b.id) === String(y.b.id)) continue;
      const nx = names(x.r).map(norm), ny = names(y.r).map(norm);
      if (nx.some(n => ny.some(m => n.includes(m) || m.includes(n)))) continue;
      const from = y.ci > x.ci ? y.ci : x.ci, to = y.co < x.co ? y.co : x.co;
      problems.push({ kind: 'clash', at: from, text: `${room} ${fmtShort(from)}–${fmtShort(to)}: ${names(x.r).join(' / ')} (${label(x.b)}) y ${names(y.r).join(' / ')} (${label(y.b)})` });
    }
  }
  const order = { clash: 0, outside: 1, duplicate: 2 };
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
  const problems = findProblems(bookings, regs, today);
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
