// folio-lib.js — shared, locked "find or create this guest's folio" for the server functions (sql/find_or_create_folio.sql).
// Look-up + insert happen inside one database call under a lock, so a cron job, a webhook and a staff screen asking for the
// same guest at the same moment all get the same folio (2026-11-01: 48 guests had 2+ folios, charges split across them).
// Returns { id, folio, created } -- or null when the database function is not installed yet or the call failed, and the
// caller then uses its own look-up, exactly as before.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
let missing = false;

// The same person written another way (Jorge 2026-11-06: "Leanne McCoy", "Patricia Leanne Harrell McCoy" and "Leanne
// Harrell-McCoy" were three folios of one guest in Shanti 6b): one name's words all inside the other's, or same first and
// last word. In a room with one guest, every folio not filed under another guest's name is theirs.
const words = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
function samePerson(a, b) {
  const A = words(a), B = words(b);
  if (!A.length || !B.length) return false;
  if (A.join(' ') === B.join(' ')) return true;
  const [small, big] = A.length <= B.length ? [A, B] : [B, A];
  if (small.length >= 2 && small.every(w => big.includes(w))) return true;
  return A.length >= 2 && B.length >= 2 && A[0] === B[0] && A[A.length - 1] === B[B.length - 1];
}
// the guest_name of the folio this person already has in that room (open ones first), or null to keep the name as given
function folioNameFor(folios, regGuests, name, openOnly) {
  if (!name || !folios || !folios.length) return null;
  if (folios.some(f => words(f.guest_name).join(' ') === words(name).join(' ') && (!openOnly || f.status === 'open'))) return null;
  const guests = (regGuests || []).filter(g => g && g.name && !g.cancelled).map(g => g.name);
  const others = guests.filter(g => !samePerson(g, name));
  const mine = folios.filter(f => samePerson(f.guest_name, name) || (guests.length <= 1 && !others.some(o => samePerson(o, f.guest_name))));
  const onList = f => guests.some(g => words(g).join(' ') === words(f.guest_name).join(' ')) ? 0 : 1;   // the name on the room list first, then the oldest
  const pick = mine.filter(f => f.status === 'open').sort((x, y) => onList(x) - onList(y) || String(x.created_at).localeCompare(String(y.created_at)))[0] || (openOnly ? null : mine[0]);
  return pick ? pick.guest_name : null;
}

async function findOrCreateFolioLocked(key, { registrationId = null, bookingRequestId = null, guestName = null, token = null,
  openOnly = false, reuseAnyOpen = false, reuseSingle = false, create = true } = {}) {
  if (missing || !key || (!registrationId && !bookingRequestId)) return null;
  if (registrationId && guestName) try {
    const h = { apikey: key, Authorization: `Bearer ${key}` };
    const [fr, rr] = await Promise.all([fetch(`${SUPABASE_URL}/rest/v1/folios?registration_id=eq.${encodeURIComponent(registrationId)}&select=guest_name,status,created_at`, { headers: h }), fetch(`${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(registrationId)}&select=guests`, { headers: h })]);
    const folios = fr.ok ? await fr.json() : [], [reg] = rr.ok ? await rr.json() : [];
    const n = folioNameFor(folios, reg && reg.guests, guestName, openOnly);
    if (n) guestName = n;
  } catch (e) {}
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/find_or_create_folio`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ p_registration_id: registrationId, p_booking_request_id: bookingRequestId, p_guest_name: guestName,
        p_payment_token: token, p_open_only: openOnly, p_reuse_any_open: reuseAnyOpen, p_reuse_single: reuseSingle, p_create: create }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 404 || (data && data.code === 'PGRST202')) missing = true;
      return null;
    }
    return data && data.folio ? { id: data.folio.id, folio: data.folio, created: !!data.created } : null;
  } catch (e) { return null; }
}

module.exports = { findOrCreateFolioLocked, samePerson, folioNameFor };
