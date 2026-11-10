'use strict';

// cb-room-sync.js — the portal is the truth for rooms (Jorge, 2026-11-03): every morning (netlify.toml, 6:30am Tulum, before
// the 7am room check) each Cloudbeds reservation the portal has linked (bookings.cb_reservation_ids = {portal room: id}) for
// a stay between today and the next 30 days is looked up in Cloudbeds; when Cloudbeds has it in another room it is moved to
// the portal's room. Real case: Wendy Klein (Karsyn Morse) was moved to CH0 directly in Cloudbeds while the portal had GV24.
// What was moved and what could not be (the portal's room taken in Cloudbeds, a stale link) is saved in app_store
// 'cb_room_sync_last' and goes in the 7am WhatsApp (room-list-check.js). Extra nights and Cloudbeds-only reservations are
// never touched: only reservations the portal itself links to one of its rooms.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const SITE = process.env.URL || 'https://amansalaportal.com';
const DAYS = 30;

const localDate = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
const rk = s => String(s || '').toLowerCase().replace(/\s+/g, '');
const sameRoom = (a, b) => a === b || (rk(a) === rk(b) && !/^\d+[ab]$/i.test(String(a).trim()));   // "1b" (bed) is not "1B" (room)

async function cb(action, body) {
  const r = await fetch(`${SITE}/.netlify/functions/cloudbeds?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...require('./portal-auth-lib').internalHeaders() }, body: JSON.stringify(body) });
  return r.json().catch(() => ({}));
}
async function getAll(key, path) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}&limit=1000&offset=${off}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(path.split('?')[0] + ' ' + r.status);
    const rows = await r.json(); out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

// The work list: [{bk, room, id}] for linked reservations of stays overlapping [today, today + DAYS)
function linkedInWindow(bookings, today, until) {
  const list = [];
  for (const b of bookings) {
    if (b.status === 'cancelled' || !(b.end_date > today && b.start_date < until)) continue;
    const ids = b.cb_reservation_ids || {};
    const counts = {};
    Object.values(ids).forEach(v => { counts[String(v)] = (counts[String(v)] || 0) + 1; });
    for (const [room, id] of Object.entries(ids)) {
      if (!id || counts[String(id)] > 1) continue;                       // one reservation linked to two rooms: unclear, skip
      if (!(b.blocked_rooms || []).some(r => r === room)) continue;      // only rooms the booking still holds
      list.push({ bookingId: b.id, bk: b.retreat_name || b.leader_name || 'Reserva', room, id: String(id) });
    }
  }
  return list;
}

async function run({ dryRun = false } = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return { error: 'SUPABASE_SERVICE_KEY missing' };
  const today = localDate(), until = localDate(DAYS);
  const bookings = await getAll(key, `bookings?select=id,retreat_name,leader_name,start_date,end_date,status,blocked_rooms,cb_reservation_ids&end_date=gt.${today}&start_date=lt.${until}`);
  const work = linkedInWindow(bookings, today, until);
  const detail = {};
  for (let i = 0; i < work.length; i += 120) Object.assign(detail, (await cb('getReservationRooms', { reservationIds: work.slice(i, i + 120).map(w => w.id) })).reservations || {});
  const out = { date: today, checked: work.length, moved: [], failed: [], stale: [], dryRun };
  for (const w of work) {
    const d = detail[w.id];
    if (!d || d.error) continue;                                          // Cloudbeds did not answer for this one: try tomorrow
    if (/cancel|no_show|void/i.test(d.status || '')) { out.stale.push(`${w.bk}: ${w.room} ligado a una reserva cancelada en Cloudbeds`); continue; }
    if (d.endDate && d.endDate <= today) continue;
    if ((d.rooms || []).some(r => sameRoom(r, w.room))) continue;
    const from = (d.rooms || []).join(',') || 'sin cuarto';
    const who = String(d.guest || '').replace(/&amp;/g, '&');
    if (dryRun) { out.moved.push(`${who} (${w.bk}): ${from} → ${w.room}`); continue; }
    const mv = await cb('moveReservationRoom', { reservationId: w.id, newRoomName: w.room });
    const now = ((await cb('getReservationRooms', { reservationIds: [w.id] })).reservations || {})[w.id] || {};
    if ((now.rooms || []).some(r => sameRoom(r, w.room))) out.moved.push(`${who} (${w.bk}): ${from} → ${w.room}`);
    else out.failed.push(`${who} (${w.bk}): Cloudbeds en ${from}, portal ${w.room} — ${(mv.data && mv.data.message) || 'no se pudo mover'}`);
  }
  if (!dryRun) {
    await fetch(`${SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'cb_room_sync_last', value: { ...out, at: new Date().toISOString() }, updated_at: new Date().toISOString() }),
    }).catch(() => {});
    if (out.moved.length || out.failed.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
        method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ id: 'id_' + Date.now() + '_cbsync', action: 'Cloudbeds room sync', detail: `Moved to the portal room: ${out.moved.join(' · ') || '—'}${out.failed.length ? ` | Could not move: ${out.failed.join(' · ')}` : ''}`.slice(0, 1900), booking_id: null, user_name: 'System', user_role: 'system', created_at: new Date().toISOString() }),
      }).catch(() => {});
    }
  }
  console.log('[cb-room-sync]', JSON.stringify({ date: today, checked: out.checked, moved: out.moved.length, failed: out.failed.length, stale: out.stale.length }));
  return out;
}

exports.handler = async () => { const r = await run(); return { statusCode: r.error ? 500 : 200, body: JSON.stringify(r) }; };
exports.run = run;
exports.linkedInWindow = linkedInWindow;
exports.sameRoom = sameRoom;
