'use strict';

// cb-dup-scan.js — copies in Cloudbeds (Jorge, 2026-11-03): every morning at 6:40am Tulum (netlify.toml), the Cloudbeds
// reservations arriving in the next 30 days are fetched by check-in date (the way that also returns the ones the
// date-window list leaves out), and any guest with two or more ACTIVE reservations for the same dates is reported --
// Tiffany Anderson twice in 10, Nanibah Chacon and Marie Sena twice in CH11a/CH11b, Sheila Story in 1a and 7a (Angela
// Wagner, Todd Zinda). Each candidate is re-read one by one (the list can still say "confirmed" for a cancelled one).
// Nothing is cancelled here: the result is saved in app_store 'cb_dup_scan_last' and goes in the 7am WhatsApp.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const SITE = process.env.URL || 'https://amansalaportal.com';
const DAYS = 30;
const localDate = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
const shift = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const norm = s => String(s || '').replace(/&amp;/g, '&').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const isHold = g => /group$/.test(norm(g));   // "Todd Zinda Group": a room held for the retreat, not a guest

async function cb(action, body) {
  const r = await fetch(`${SITE}/.netlify/functions/cloudbeds?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...require('./portal-auth-lib').internalHeaders() }, body: JSON.stringify(body) });
  return r.json().catch(() => ({}));
}

// Candidates from the list rows: the same guest (not a group hold) with the same arrival and departure, 2+ times
function candidates(rows) {
  const by = new Map();
  for (const r of rows) {
    if (!r.guest || isHold(r.guest) || /cancel|no_show|void/i.test(r.status || '')) continue;
    const k = `${norm(r.guest)}|${r.start}|${r.end}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  return [...by.values()].filter(list => list.length > 1);
}

async function run() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return { error: 'SUPABASE_SERVICE_KEY missing' };
  const today = localDate(), until = localDate(DAYS);
  const s = await cb('searchReservations', { checkInFrom: today, checkInTo: until, checkOutFrom: today, checkOutTo: shift(until, 90) });
  if (!s.success) return { error: 'search failed: ' + (s.message || '') };
  const groups = candidates(s.reservations || []);
  const ids = groups.flat().map(r => r.id);
  const detail = {};
  for (let i = 0; i < ids.length; i += 100) Object.assign(detail, (await cb('getReservationRooms', { reservationIds: ids.slice(i, i + 100) })).reservations || {});
  const copies = [];
  for (const g of groups) {
    const active = g.filter(r => /confirm|checked/i.test((detail[r.id] || {}).status || ''));
    if (active.length < 2) continue;
    const who = String(active[0].guest).replace(/&amp;/g, '&');
    copies.push(`${who} ${active[0].start.slice(5)}–${active[0].end.slice(5)}: ${active.map(r => `${((detail[r.id] || {}).rooms || []).join(',') || 'sin cuarto'} #${r.id}`).join(' y ')}`);
  }
  const out = { date: today, scanned: (s.reservations || []).length, copies };
  await fetch(`${SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: 'cb_dup_scan_last', value: { ...out, at: new Date().toISOString() }, updated_at: new Date().toISOString() }),
  }).catch(() => {});
  console.log('[cb-dup-scan]', JSON.stringify({ date: today, scanned: out.scanned, copies: copies.length }));
  return out;
}

exports.handler = async () => { const r = await run(); return { statusCode: r.error ? 500 : 200, body: JSON.stringify(r) }; };
exports.run = run;
exports.candidates = candidates;
