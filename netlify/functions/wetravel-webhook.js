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

// ─── Dashboard "We Travel" activity notifications ──────────────────────────
// Stored in app_store (key='weTravelPaymentLog') as a small append-only log —
// booking-hub.html's notification loader reads this the same way it already
// reads bot_log/booking_requests, and computeActivityNotifs() in
// retreat-builder.js turns each entry into a dismissible Dashboard notification.
// Deduped by id (the Svix delivery id when available) so retries don't double up.
async function logWeTravelNotif(key, entry) {
  try {
    const rows = await supa(key, `app_store?select=value&key=eq.weTravelPaymentLog`, 'GET');
    let log = (rows && rows[0] && rows[0].value) || [];
    if (log.some(e => e.id === entry.id)) return;
    log = [...log, entry].slice(-200);
    await supa(key, 'app_store', 'POST', [{ key: 'weTravelPaymentLog', value: log, updated_at: new Date().toISOString() }]);
  } catch (e) {
    console.warn('[wetravel-webhook] could not log dashboard notification:', e.message);
  }
}

// A package with no room_type mapping is logged and skipped (see pickFreeRoom
// callsite) so nothing invisible gets created — but that log line only lives in
// Netlify's function logs. Mirroring it into app_store lets the We Travel admin
// tab (modules/wetravel-admin.js) surface "these packages still need mapping"
// without anyone having to go spelunking through logs.
async function recordUnmappedPackage(key, pkgName, tripUuid, orderId) {
  try {
    const rows = await supa(key, `app_store?select=value&key=eq.weTravelUnmappedPackages`, 'GET');
    const map = (rows && rows[0] && rows[0].value) || {};
    map[pkgName] = { tripUuid, orderId, lastSeenAt: new Date().toISOString() };
    await supa(key, 'app_store', 'POST', [{ key: 'weTravelUnmappedPackages', value: map, updated_at: new Date().toISOString() }]);
  } catch (e) {
    console.warn('[wetravel-webhook] could not record unmapped package:', e.message);
  }
}

// ─── Handle a payment-plan installment on an already-synced booking ────────
// booking.created already recorded the deposit (registrations.amount_paid,
// an open Room Charges folio charging the full price with only the deposit
// logged as a payment). When a later installment lands, this brings that
// registration/folio up to date instead of leaving it stuck showing the
// original deposit forever: bumps amount_paid to the new total, logs the
// *difference* as a new "Payment — We Travel" folio line (so it doesn't
// double-count the deposit already logged), and — only once total_due_amount
// hits zero — closes the Room Charges folio and confirms the booking.
// Naturally idempotent against Svix retries: re-processing the same event
// recomputes the same delta as 0 once amount_paid already matches.
async function handleWeTravelPaymentUpdate(key, tripUuid, orderId, d, eventType, svixId) {
  try {
    const bkId = `wt_${tripUuid}`;
    const totalDueAmount = d.total_due_amount != null ? d.total_due_amount / 100 : null;
    const totalPaidAmount = d.total_paid_amount != null ? d.total_paid_amount / 100 : null;
    const isFullyPaid = totalDueAmount != null ? totalDueAmount <= 0 : null;

    if (totalPaidAmount != null) {
      const regs = await supa(key, `registrations?select=id,amount_paid,guests&booking_id=eq.${bkId}`, 'GET');
      for (const reg of regs) {
        const prevPaid = Number(reg.amount_paid) || 0;
        const delta = totalPaidAmount - prevPaid;
        if (Math.abs(delta) < 0.005) continue; // already up to date (e.g. a Svix retry)
        await supa(key, `registrations?id=eq.${reg.id}`, 'PATCH', { amount_paid: totalPaidAmount });
        const guestNames = [...new Set((reg.guests || []).map(g => g.name).filter(Boolean))];
        if (!guestNames.length) continue;
        const perGuestDelta = delta / guestNames.length;
        for (const gName of guestNames) {
          const folios = await supa(key, `folios?select=id,status&registration_id=eq.${reg.id}&guest_name=eq.${encodeURIComponent(gName)}&name=eq.${encodeURIComponent('Room Charges')}`, 'GET');
          const folio = folios[0];
          if (!folio) continue;
          await supa(key, 'folio_items', 'POST', [{ folio_id: folio.id, description: 'Payment — We Travel', qty: 1, unit_price: -perGuestDelta, tax_rate: 0 }]);
          if (isFullyPaid && folio.status !== 'closed') {
            await supa(key, `folios?id=eq.${folio.id}`, 'PATCH', { status: 'closed' });
          }
        }
      }
      if (isFullyPaid) await supa(key, `bookings?id=eq.${bkId}`, 'PATCH', { status: 'confirmed' });
    }

    await logWeTravelNotif(key, {
      id: svixId || `${eventType}_${orderId || tripUuid || Date.now()}`,
      ts: new Date().toISOString(),
      kind: isFullyPaid ? 'paid_in_full' : 'payment',
      bookingId: bkId,
      guestName: (d.buyer && (d.buyer.full_name || [d.buyer.first_name, d.buyer.last_name].filter(Boolean).join(' '))) || '',
      amount: totalPaidAmount != null ? totalPaidAmount : (d.amount ?? d.paid_amount ?? 0) / 100,
    });
    console.log(`[wetravel-webhook] applied payment update for ${bkId} from event type ${eventType}`);
  } catch (e) {
    console.warn('[wetravel-webhook] payment update failed:', e.message);
  }
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

  const svixId = (event.headers && (event.headers['svix-id'] || event.headers['Svix-Id'])) || null;

  if (eventType !== 'booking.created') {
    // WeTravel accounts on a payment plan fire further events as installments
    // come in — the exact event name isn't confirmed yet (only booking.created
    // has been seen live), so rather than silently drop anything that looks
    // payment-related, treat it as an update to an already-synced booking.
    // Safe to broaden/tighten this match once a real installment event is logged
    // (the full raw payload is always logged above for that).
    const isPaymentish = supaKey && tripUuid && (/payment/i.test(eventType) || eventType === 'booking.updated');
    if (isPaymentish) {
      await handleWeTravelPaymentUpdate(supaKey, tripUuid, orderId, d, eventType, svixId);
    } else {
      console.log('[wetravel-webhook] ignoring event type:', eventType);
    }
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

    // WeTravel supports payment plans, so a booking.created event doesn't always
    // mean the guest paid in full — the webhook payload itself (not the orders
    // API, which only exposes paid_amount) carries the real total/due amounts.
    // When total_due_amount is missing (older payload shape) fall back to
    // treating whatever's paid as paid-in-full, same as before this fix.
    const totalPriceAmount = d.total_price_amount != null ? d.total_price_amount / 100 : null;
    const totalDueAmount = d.total_due_amount != null ? d.total_due_amount / 100 : null;
    const totalPaidAmount = (d.total_paid_amount != null ? d.total_paid_amount : order.paid_amount || 0) / 100;
    const isFullyPaid = totalDueAmount != null ? totalDueAmount <= 0 : true;

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
      status: existing[0] ? undefined : (isFullyPaid ? 'confirmed' : 'deposit_paid'),
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
    // booking-detail.js's "Room Total" line multiplies nights × a per-night rate
    // (custom_rate_override when set) — without an override it falls back to the
    // room_type's published nightly rate, which has nothing to do with what the
    // guest actually paid on WeTravel. Deriving the override from the real paid
    // amount makes that line reconcile with the closed Room Charges folio instead
    // of showing an unrelated number.
    const tripNights = Math.max(1, Math.round((new Date(trip.end_date) - new Date(trip.start_date)) / 86400000));

    for (const pkg of packages) {
      const roomTypeId = pkgMap[pkg.name];
      if (!roomTypeId) {
        console.warn(`[wetravel-webhook] no room_type mapping for WeTravel package "${pkg.name}" — skipping, needs admin mapping`);
        await recordUnmappedPackage(supaKey, pkg.name, tripUuid, orderId);
        continue;
      }
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
      // Room Total should reconcile with the full package price, not just what's
      // paid so far — a deposit-only order otherwise shows a tiny Room Total that
      // grows unpredictably as installments come in. Falls back to whatever's
      // paid when WeTravel didn't report a total (older payload shape).
      const regChargeTotal = totalPriceAmount != null ? totalPriceAmount : totalPaidAmount;
      newRegs.push({
        id: regId,
        booking_id: bkId,
        room,
        room_type_id: roomTypeId,
        guests: finalGuests.map(g => ({ ...g, notes: `WeTravel order #${order.id} — package: ${pkg.name}` })),
        amount_paid: totalPaidAmount,
        custom_rate_override: +(regChargeTotal / tripNights).toFixed(2),
      });

      const perGuestCharge = regChargeTotal / finalGuests.length;
      const perGuestPaid = totalPaidAmount / finalGuests.length;
      finalGuests.forEach(g => folioPlan.push({
        registrationId: regId,
        guestName: g.name,
        description: `${pkg.name} (order #${order.id})`,
        chargeAmount: perGuestCharge,
        paidAmount: perGuestPaid,
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
            // Only closed (PAID) when the order is actually paid in full — a
            // deposit-only booking leaves this open so the unpaid remainder
            // correctly shows up in Balance Due, same as any other room charge.
            { registration_id: f.registrationId, guest_name: f.guestName, name: 'Room Charges', payment_token: rcToken, status: isFullyPaid ? 'closed' : 'open' },
            { registration_id: f.registrationId, guest_name: f.guestName, name: 'Extras', payment_token: exToken, status: 'open' },
          ];
        });
        const createdFolios = await supa(supaKey, 'folios', 'POST', folioRows);
        const folioByToken = new Map((createdFolios || []).map(f => [f.payment_token, f]));
        const items = [];
        toCreate.forEach(f => {
          const key = `${f.registrationId}::${f.guestName}`;
          const rcFolio = folioByToken.get(roomChargesTokenOf.get(key));
          if (rcFolio) {
            items.push({ folio_id: rcFolio.id, description: f.description, qty: 1, unit_price: f.chargeAmount, tax_rate: 0 });
            if (f.paidAmount > 0) items.push({ folio_id: rcFolio.id, description: 'Payment — We Travel', qty: 1, unit_price: -f.paidAmount, tax_rate: 0 });
          }
          // Every WeTravel booking (BBC or RNR) includes two spa credits as part of
          // the package price — logged as a single credit line each in the open
          // Extras folio (negative unit_price, same convention the folio UI already
          // uses for payments) so they read as value already given to the guest,
          // not a charge they still owe on.
          const exFolio = folioByToken.get(extrasTokenOf.get(key));
          if (exFolio) {
            for (let n = 1; n <= 2; n++) {
              items.push({ folio_id: exFolio.id, description: `Spa Credit (included – WeTravel)`, qty: 1, unit_price: -95, tax_rate: 13 });
            }
          }
        });
        if (items.length) await supa(supaKey, 'folio_items', 'POST', items);
        foliosCreated = toCreate.length;
      }
    }

    console.log(`[wetravel-webhook] order ${order.id}: created ${newRegs.length} registration(s), ${foliosCreated} folio pair(s) on booking ${bkId}`);

    if (newRegs.length) {
      await logWeTravelNotif(supaKey, {
        id: svixId || `booking_created_${order.id}`,
        ts: new Date().toISOString(),
        kind: isFullyPaid ? 'created' : 'deposit',
        bookingId: bkId,
        guestName: guestList.map(g => g.name).filter(Boolean).join(', '),
        amount: totalPaidAmount,
      });
    }

    return ok(200, { received: true, processed: true, bookingId: bkId, registrations: newRegs.length, folios: foliosCreated });
  } catch (e) {
    console.error('[wetravel-webhook] processing failed:', e.message);
    // 200 anyway — a 4xx/5xx makes Svix retry the same event repeatedly; the full
    // payload is already logged above for manual recovery if this keeps happening.
    return ok(200, { received: true, processed: false, error: e.message });
  }
};
