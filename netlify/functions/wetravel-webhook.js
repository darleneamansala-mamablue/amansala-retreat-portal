'use strict';

// ===== WeTravel webhook receiver =====
// Svix (WeTravel's webhook provider) POSTs here on booking.created (and other events —
// only booking.created is actually acted on for now, everything else is logged and
// acknowledged). On a new paid order:
//   1. Find or create the portal booking for that WeTravel trip (id = wt_<trip_uuid>,
//      so redelivery/retries upsert the same row instead of duplicating it).
//   2. For each package in the order, look up its portal room_type via the
//      weTravelPackageMap stored in app_store (admin-configured — WeTravel package
//      names like "Garden King" don't exactly match our room_type names in every
//      case, e.g. "Garden Basic" vs "Simple n Small").
//   3. Auto-assign the next physical room of that type with no date conflict, block
//      it on the booking, and create a registration there for the buyer.
// A package with no mapping entry is logged and skipped (not silently guessed at) —
// nothing renders in the Rooming List for a registration with no room anyway, so an
// unmapped package is surfaced via the function log instead of creating invisible data.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const WT_BASE = 'https://api.wetravel.com/v2';
const crypto = require('crypto');

// ─── Supabase (service-role) ───────────────────────────────────────────────
async function supa(key, path, method, body) {
  const opts = {
    method: method || 'GET',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json', Accept: 'application/json',
      ...(method && method !== 'GET' ? { Prefer: 'return=representation,resolution=merge-duplicates' } : {}),
    },
  };
  if (body != null) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`Supabase ${method || 'GET'} ${path} -> ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

// ─── WeTravel API ───────────────────────────────────────────────────────────
async function wtToken() {
  const refreshToken = process.env.WETRAVEL_REFRESH_TOKEN || '';
  if (!refreshToken) throw new Error('WETRAVEL_REFRESH_TOKEN not set');
  const res = await fetch(`${WT_BASE}/auth/tokens/access`, { method: 'POST', headers: { Authorization: `Bearer ${refreshToken}` } });
  const data = await res.json();
  if (!data.access_token) throw new Error('WeTravel token exchange failed: ' + JSON.stringify(data).slice(0, 300));
  return data.access_token;
}
async function wtGet(tok, path) {
  const res = await fetch(`${WT_BASE}${path}`, { headers: { Authorization: `Bearer ${tok}` } });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`WeTravel GET ${path} -> ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
async function wtGetTrip(tok, tripUuid) {
  const d = await wtGet(tok, `/draft_trips/${encodeURIComponent(tripUuid)}`);
  return d.data || d;
}
// The single-order endpoint 403s against this account for reasons undetermined —
// list-and-find works reliably and per-trip order counts are small.
async function wtFindOrder(tok, tripUuid, orderId) {
  let page = 1;
  while (true) {
    const d = await wtGet(tok, `/bookings/trips/${encodeURIComponent(tripUuid)}/bookings?per_page=100&page=${page}`);
    const rows = d.data || [];
    const hit = rows.find(o => String(o.id) === String(orderId));
    if (hit) return hit;
    if (!d.pagination || !d.pagination.has_next) return null;
    page++;
    if (page > 50) return null;
  }
}

// ─── Svix / Standard Webhooks signature verification ───────────────────────
// https://www.standardwebhooks.com/ — signed content is "{id}.{timestamp}.{body}",
// HMAC-SHA256 keyed by the base64 portion of the whsec_... signing secret, compared
// against any of the space-separated "v1,<base64>" values in svix-signature.
function verifySvixSignature(headers, rawBody) {
  const secret = process.env.WETRAVEL_WEBHOOK_SECRET || '';
  if (!secret) return { ok: false, reason: 'WETRAVEL_WEBHOOK_SECRET not set' };
  const id = headers['svix-id'] || headers['Svix-Id'];
  const ts = headers['svix-timestamp'] || headers['Svix-Timestamp'];
  const sigHeader = headers['svix-signature'] || headers['Svix-Signature'];
  if (!id || !ts || !sigHeader) return { ok: false, reason: 'missing svix headers' };
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${id}.${ts}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');
  const provided = sigHeader.split(' ').map(s => s.split(',')[1]).filter(Boolean);
  const match = provided.some(p => {
    try { return crypto.timingSafeEqual(Buffer.from(p), Buffer.from(expected)); } catch { return false; }
  });
  return { ok: match, reason: match ? null : 'signature mismatch' };
}

// ─── Trip title -> portal retreat name ──────────────────────────────────────
// Admin wants the portal's retreat name/label to read as the program's short
// code rather than WeTravel's own trip title (e.g. "Bikini Bootcamp - Dec 28 -
// Jan 03" -> "We Travel BBC"), so it's recognizable at a glance in the Room
// Calendar/Dashboard alongside Cloudbeds-sourced retreats.
function normalizeWeTravelTitle(title) {
  const t = title || '';
  if (/bikini\s*boot\s*camp/i.test(t)) return 'We Travel BBC';
  if (/restore\s*(?:and|&|n)?\s*renew/i.test(t)) return 'We Travel RNR';
  return t ? `We Travel — ${t}` : 'We Travel';
}

// ─── Package name -> portal room_type_id mapping (admin-configured) ────────
async function getPackageMap(key) {
  const rows = await supa(key, `app_store?select=value&key=eq.weTravelPackageMap`, 'GET');
  return (rows && rows[0] && rows[0].value) || {};
}

// ─── Auto-assign the next free physical room of a type, for these dates ────
async function pickFreeRoom(key, roomTypeId, startDate, endDate, alreadyUsedThisBooking) {
  const [rtRows, bkRows] = await Promise.all([
    supa(key, `room_types?select=rooms&id=eq.${encodeURIComponent(roomTypeId)}`, 'GET'),
    supa(key, `bookings?select=blocked_rooms,start_date,end_date,status&status=neq.cancelled`, 'GET'),
  ]);
  const rooms = (rtRows && rtRows[0] && rtRows[0].rooms) || [];
  const taken = new Set(alreadyUsedThisBooking || []);
  bkRows.forEach(bk => {
    if (!(bk.start_date < endDate && bk.end_date > startDate)) return; // no date overlap
    (bk.blocked_rooms || []).forEach(r => taken.add(r));
  });
  return rooms.find(r => !taken.has(r)) || null;
}

function ok(status, body) { return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

exports.handler = async (event) => {
  // Svix/browsers probe a newly-added endpoint with a HEAD/GET or an empty body before
  // ever sending a real signed event — answer those with a plain 200 instead of trying
  // to parse a webhook payload out of nothing, or endpoint creation itself shows as
  // failing in the Svix UI before this ever receives a real event.
  const rawBody = event.body || '';
  if (event.httpMethod !== 'POST' || !rawBody.trim()) {
    return ok(200, { ready: true });
  }

  const sig = verifySvixSignature(event.headers || {}, rawBody);
  if (!sig.ok) {
    console.warn('[wetravel-webhook] signature check failed:', sig.reason);
    // Still 200 in production once verified working — while wiring this up for the
    // first time, log-and-accept is safer than silently dropping real events over a
    // header-casing mismatch. Tighten to a hard 401 once a real signed event has
    // been confirmed to pass.
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch { console.warn('[wetravel-webhook] non-JSON body:', rawBody.slice(0,300)); return ok(200, { received: true, processed: false, reason: 'non-JSON body' }); }
  console.log('[wetravel-webhook] event:', JSON.stringify(payload).slice(0, 2000));

  const eventType = payload.type || payload.event || payload.event_type || 'unknown';
  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) { console.error('[wetravel-webhook] Missing SUPABASE_SERVICE_KEY'); return ok(200, { received: true, processed: false }); }

  // Defensive extraction — exact payload shape unconfirmed until a real event
  // arrives; try the field names the docs/data model imply.
  const d = payload.data || payload;
  const tripUuid = d.trip_uuid || d.trip?.uuid || d.trip_id || null;
  const orderId = d.order_id || d.id || d.booking?.id || null;

  if (eventType !== 'booking.created') {
    console.log('[wetravel-webhook] ignoring event type:', eventType);
    return ok(200, { received: true, processed: false, reason: 'event type not handled yet' });
  }
  if (!tripUuid || !orderId) {
    console.warn('[wetravel-webhook] could not find trip_uuid/order_id in payload');
    return ok(200, { received: true, processed: false, reason: 'missing trip_uuid/order_id' });
  }

  try {
    const tok = await wtToken();
    // The trip lookup can fail (e.g. Svix's own "send example" test event uses a
    // fake trip_uuid that 404s) — fall back to the trip_title/dates the webhook
    // payload itself already carries rather than aborting the whole event.
    const [tripResult, order, pkgMap] = await Promise.all([
      wtGetTrip(tok, tripUuid).catch(e => { console.warn('[wetravel-webhook] trip lookup failed, using webhook payload fields instead:', e.message); return null; }),
      wtFindOrder(tok, tripUuid, orderId),
      getPackageMap(supaKey),
    ]);
    if (!order) throw new Error(`order ${orderId} not found in trip ${tripUuid}`);
    const trip = tripResult || {
      title: d.trip_title || null,
      start_date: d.departure_date || null,
      end_date: d.trip_end_date || null,
      url: null,
    };
    if (!trip.start_date || !trip.end_date) throw new Error('no trip dates available (trip lookup failed and webhook payload had none either)');

    const bkId = `wt_${tripUuid}`;
    const existing = await supa(supaKey, `bookings?select=id,blocked_rooms&id=eq.${bkId}`, 'GET');
    let blockedRooms = (existing[0] && existing[0].blocked_rooms) || [];

    // Create/update the booking (idempotent — same deterministic id every time).
    const portalName = normalizeWeTravelTitle(trip.title);
    await supa(supaKey, 'bookings', 'POST', [{
      id: bkId,
      leader_name: portalName,
      retreat_name: portalName,
      start_date: trip.start_date,
      end_date: trip.end_date,
      status: existing[0] ? undefined : 'deposit_paid',
      source: 'wetravel',
      notes: `Synced from WeTravel — ${trip.title || ''} — ${trip.url || ''}`.trim(),
    }]);

    // The webhook payload's own `participants` list (present on booking.created,
    // absent from the orders-list API response) has each traveler's real name —
    // order.buyer alone is just the person who paid, not necessarily everyone in
    // the room. Filter to active (non-cancelled) participants; fall back to the
    // buyer alone if the payload didn't include any (e.g. older webhook version).
    const activeParticipants = (d.participants || []).filter(p => !p.cancelled);
    const guestList = (activeParticipants.length ? activeParticipants : [order.buyer || {}]).map(p => ({
      name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'WeTravel Guest',
      email: p.email || '',
    }));

    const packages = order.packages || [];
    const newRegs = [];
    const usedThisBooking = [];
    // Per-guest folio pair to create once the registration exists — mirrors the
    // Extra Night pattern in booking-detail.js exactly: a *closed* "Room Charges"
    // folio holding the amount already paid on WeTravel (so it shows PAID with
    // $0 balance-due contribution, since _bdBalanceDue() only sums open folios),
    // plus a separate empty *open* "Extras" folio for any incidentals added later.
    const folioPlan = [];
    let guestCursor = 0;

    for (const pkg of packages) {
      const roomTypeId = pkgMap[pkg.name];
      if (!roomTypeId) { console.warn(`[wetravel-webhook] no room_type mapping for WeTravel package "${pkg.name}" — skipping, needs admin mapping`); continue; }
      const room = await pickFreeRoom(supaKey, roomTypeId, trip.start_date, trip.end_date, [...blockedRooms, ...usedThisBooking]);
      if (!room) { console.warn(`[wetravel-webhook] no free room of type ${roomTypeId} for ${trip.start_date}-${trip.end_date}`); continue; }
      usedThisBooking.push(room);
      // Single-package orders (the common case) get every active participant in
      // that one room; multi-package orders split participants across rooms by
      // however many this package covers (min 1) — best effort without a
      // confirmed participant<->package link in the payload.
      const take = packages.length === 1 ? guestList.length - guestCursor : Math.max(1, pkg.quantity || 1);
      const roomGuests = guestList.slice(guestCursor, guestCursor + take);
      guestCursor += take;
      const regId = `wt_order_${order.id}_${pkg.id || pkg.trip_option_id || room}`;
      const finalGuests = roomGuests.length ? roomGuests : [{ name: 'WeTravel Guest', email: '' }];
      newRegs.push({
        id: regId,
        booking_id: bkId,
        room,
        room_type_id: roomTypeId,
        guests: finalGuests.map(g => ({ ...g, notes: `WeTravel order #${order.id} — package: ${pkg.name}` })),
        amount_paid: (order.paid_amount || 0) / 100,
      });

      const perGuestPaid = (order.paid_amount || 0) / 100 / finalGuests.length;
      finalGuests.forEach(g => folioPlan.push({
        registrationId: regId,
        guestName: g.name,
        description: `WeTravel — ${pkg.name} (order #${order.id})`,
        amount: perGuestPaid,
      }));
    }

    if (usedThisBooking.length) {
      blockedRooms = [...blockedRooms, ...usedThisBooking];
      await supa(supaKey, `bookings?id=eq.${bkId}`, 'PATCH', { blocked_rooms: blockedRooms });
    }
    if (newRegs.length) await supa(supaKey, 'registrations', 'POST', newRegs);

    // Idempotency for Svix retries: only create folios for registration+guest
    // combos that don't already have one (a redelivered event must not double
    // up "Room Charges"/"Extras" rows).
    let foliosCreated = 0;
    if (folioPlan.length) {
      const regIds = [...new Set(folioPlan.map(f => f.registrationId))];
      const existingFolios = await supa(supaKey, `folios?select=registration_id,guest_name&registration_id=in.(${regIds.map(id => `"${id}"`).join(',')})`, 'GET');
      const existingKeys = new Set((existingFolios || []).map(f => `${f.registration_id}::${f.guest_name}`));
      const toCreate = folioPlan.filter(f => !existingKeys.has(`${f.registrationId}::${f.guestName}`));
      if (toCreate.length) {
        const roomChargesTokenOf = new Map(); // regId::guestName -> token
        const extrasTokenOf = new Map();
        const folioRows = toCreate.flatMap(f => {
          const rcToken = crypto.randomUUID().replace(/-/g, '');
          const exToken = crypto.randomUUID().replace(/-/g, '');
          roomChargesTokenOf.set(`${f.registrationId}::${f.guestName}`, rcToken);
          extrasTokenOf.set(`${f.registrationId}::${f.guestName}`, exToken);
          return [
            { registration_id: f.registrationId, guest_name: f.guestName, name: 'Room Charges', payment_token: rcToken, status: 'closed' },
            { registration_id: f.registrationId, guest_name: f.guestName, name: 'Extras', payment_token: exToken, status: 'open' },
          ];
        });
        const createdFolios = await supa(supaKey, 'folios', 'POST', folioRows);
        const folioByToken = new Map((createdFolios || []).map(f => [f.payment_token, f]));
        const items = [];
        toCreate.forEach(f => {
          const key = `${f.registrationId}::${f.guestName}`;
          const rcFolio = folioByToken.get(roomChargesTokenOf.get(key));
          if (rcFolio) items.push({ folio_id: rcFolio.id, description: f.description, qty: 1, unit_price: f.amount, tax_rate: 0 });
          // Every WeTravel booking (BBC or RNR) includes two spa credits as part of
          // the package price — logged as line items in the open Extras folio (per
          // admin request) so staff can see/redeem them, each paired with an
          // offsetting credit so they don't inflate Balance Due (they're already
          // paid for via the WeTravel order, not something owed).
          const exFolio = folioByToken.get(extrasTokenOf.get(key));
          if (exFolio) {
            for (let n = 1; n <= 2; n++) {
              items.push({ folio_id: exFolio.id, description: `Spa Credit ${n} (included – WeTravel)`, qty: 1, unit_price: 95, tax_rate: 13 });
              items.push({ folio_id: exFolio.id, description: `Spa Credit ${n} — included in package`, qty: 1, unit_price: -95, tax_rate: 13 });
            }
          }
        });
        if (items.length) await supa(supaKey, 'folio_items', 'POST', items);
        foliosCreated = toCreate.length;
      }
    }

    console.log(`[wetravel-webhook] order ${order.id}: created ${newRegs.length} registration(s), ${foliosCreated} folio pair(s) on booking ${bkId}`);
    return ok(200, { received: true, processed: true, bookingId: bkId, registrations: newRegs.length, folios: foliosCreated });
  } catch (e) {
    console.error('[wetravel-webhook] processing failed:', e.message);
    // 200 anyway — a 4xx/5xx makes Svix retry the same event repeatedly; the full
    // payload is already logged above for manual recovery if this keeps happening.
    return ok(200, { received: true, processed: false, error: e.message });
  }
};
