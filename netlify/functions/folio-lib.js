// folio-lib.js — shared, locked "find or create this guest's folio" for the server functions (sql/find_or_create_folio.sql).
// Look-up + insert happen inside one database call under a lock, so a cron job, a webhook and a staff screen asking for the
// same guest at the same moment all get the same folio (2026-11-01: 48 guests had 2+ folios, charges split across them).
// Returns { id, folio, created } -- or null when the database function is not installed yet or the call failed, and the
// caller then uses its own look-up, exactly as before.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
let missing = false;

async function findOrCreateFolioLocked(key, { registrationId = null, bookingRequestId = null, guestName = null, token = null,
  openOnly = false, reuseAnyOpen = false, reuseSingle = false, create = true } = {}) {
  if (missing || !key || (!registrationId && !bookingRequestId)) return null;
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

module.exports = { findOrCreateFolioLocked };
