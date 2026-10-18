'use strict';
// The "bot" half of the Revenue Manager, runs 3x/day (netlify.toml). Recomputes a recommended
// price for every be_enabled room type over a rolling window and stores it in app_store.
// Ships suggestion-only by default -- a human reviews revenue-manager.html's Calendar and
// clicks Upload Prices (room-price-apply.js). Jorge's ask 2026-10-17: when
// settings.autoApplyEnabled is on, this function pushes every recommendation straight into
// `be_rates` itself at the end of each run, no human review -- guardrailed only by each room
// type's min/max (explicitly no rate-of-change cap, Jorge's call).
const L = require('./room-price-lib');

const WINDOW_DAYS = 180;
const LOCK_KEY = 'room_price_genie_recalc_lock';
const LOCK_STALE_MS = 5 * 60 * 1000; // a real run finishes in well under a minute; 5min of staleness means something crashed, not that it's still working

// Found live 2026-10-17: a manual "Refresh recommendations" overlapping a still-running
// scheduled/earlier call (whose HTTP response had already timed out client-side, but kept
// executing server-side) produced duplicate be_rates rows -- each run's `existing` snapshot
// missed the other's in-flight inserts. This lock makes overlapping runs impossible instead of
// just less likely.
exports.runRecalc = async function runRecalc() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error('Server config error: missing SUPABASE_SERVICE_KEY');

  const lock = await L.appStoreGet(key, LOCK_KEY);
  if (lock && Date.now() - new Date(lock.startedAt).getTime() < LOCK_STALE_MS) {
    return { skipped: true, reason: 'another recalc is already running', startedAt: lock.startedAt };
  }
  await L.appStoreSet(key, LOCK_KEY, { startedAt: new Date().toISOString() });

  try {
    return await doRecalc(key);
  } finally {
    await L.appStoreSet(key, LOCK_KEY, null);
  }
};

async function doRecalc(key) {
  const today = new Date().toISOString().slice(0, 10);
  const endD = new Date(); endD.setDate(endD.getDate() + WINDOW_DAYS);
  const end = endD.toISOString().slice(0, 10);

  const [settings, roomTypes, blocks, beRates, settingsRow] = await Promise.all([
    L.loadSettings(key),
    L.loadRoomTypes(key),
    L.loadBlocksInRange(key, today, end),
    L.sgetAll(key, 'be_rates?select=room_type_id,start_date,end_date,price_single'),
    L.sget(key, 'booking_engine_settings?id=eq.1&select=weekend_premium,seasonal_adjustments'),
  ]);
  const bes = settingsRow[0] || {};
  const seasonalAdjustments = bes.seasonal_adjustments || {};
  const weekendPremiumPct = bes.weekend_premium ?? 0;
  const reference = roomTypes.find(rt => rt.id === settings.referenceRoomTypeId) || roomTypes[0];

  const byRoomType = {};
  let datesProcessed = 0;

  for (const rt of roomTypes) {
    const byDate = {};
    const beRatesForType = beRates.filter(r => r.room_type_id === rt.id);
    for (let d = new Date(today + 'T12:00:00'); d <= endD; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const takenRooms = L.occupancyFor(dateStr, rt.rooms, blocks) * rt.rooms.length;
      const occPct = Math.round(takenRooms / rt.rooms.length * 100);
      const groupTaken = L.groupTakenFor(dateStr, rt.rooms, blocks);
      const current = L.currentLivePrice({
        roomType: rt, dateStr, beRatesForType, seasonalAdjustments, weekendPremiumPct,
        isLowSeason: L.isLowSeasonMonth(d.getMonth() + 1),
      });
      // Occupancy-driven pricing must react to TRANSIENT demand only -- a retreat/group block
      // (already counted separately in groupTaken) isn't a direct guest competing for the room,
      // it's inventory that was never for sale to one in the first place. Previously `occPct`
      // (every taken room, group included) drove the price directly, so a retreat holding 100%
      // of a type pushed it straight to max even though zero rooms were ever actually available
      // to price-test against a transient guest (Jorge's "revisa profundamente tarifas" audit,
      // 2026-10-18: Garden/Garden Plus/Superior all hit max purely on group-held nights). Sellable
      // rooms = total minus group-held; when a group holds EVERY room of a type, there's no
      // transient signal to react to at all -- treat that as neutral (gap=0, same as the
      // occupancy curve's own expected value) rather than forcing it to read as "sold out".
      const sellableRooms = rt.rooms.length - groupTaken;
      let transientOcc;
      if (sellableRooms > 0) {
        transientOcc = (takenRooms - groupTaken) / sellableRooms;
      } else {
        const { month } = L.dateToParts(dateStr);
        const daysOut = Math.max(0, L.daysBetween(today, dateStr));
        transientOcc = L.expectedOccupancy(settings.targetOccupancyPctByMonth[String(month)] ?? 80, settings.medianBookingWindowDays, daysOut);
      }
      const recommended = L.recommendPrice({
        settings, roomType: rt, dateStr, today,
        actualOcc: transientOcc,
        referenceBasePrice: reference ? reference.be_price_single : rt.be_price_single,
        seasonalAdjustments,
      });
      byDate[dateStr] = { occPct, groupTaken, totalRooms: rt.rooms.length, current, recommended };
      datesProcessed++;
    }
    byRoomType[rt.id] = { name: rt.name, byDate };
  }

  // Linked-group pass (settings.linkedRoomTypeGroups, default [['cm1','csh3']], Jorge's ask
  // 2026-10-18): Casa Master and Casa Shanti must always recommend the exact same price. Each
  // sells as a single whole-villa unit, so its own occupancy is always 0% or 100% -- combine
  // the group's rooms into one shared occupancy signal, run recommendPrice() ONCE per date using
  // the first member's settings (derivation/min/max are meant to be identical across a linked
  // group by convention), and overwrite every member's recommendation with that one number.
  for (const group of (settings.linkedRoomTypeGroups || [])) {
    const members = group.map(id => roomTypes.find(rt => rt.id === id)).filter(Boolean);
    if (members.length < 2) continue;
    const combinedRooms = members.reduce((n, rt) => n + rt.rooms.length, 0);
    if (!combinedRooms) continue;
    const lead = members[0];
    for (let d = new Date(today + 'T12:00:00'); d <= endD; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const combinedTaken = members.reduce((n, rt) => n + Math.round(L.occupancyFor(dateStr, rt.rooms, blocks) * rt.rooms.length), 0);
      const sharedPrice = L.recommendPrice({
        settings, roomType: lead, dateStr, today,
        actualOcc: combinedTaken / combinedRooms,
        referenceBasePrice: reference ? reference.be_price_single : lead.be_price_single,
        seasonalAdjustments,
      });
      for (const rt of members) {
        if (byRoomType[rt.id] && byRoomType[rt.id].byDate[dateStr]) byRoomType[rt.id].byDate[dateStr].recommended = sharedPrice;
      }
    }
  }

  // Price ceiling pass (Rooms Setup's "Price Ceiling" column -- settings.priceCeilingRoomTypeId,
  // default rt5 (Simple n Small) -> rt4 (Garden), Jorge's report 2026-10-18): runs AFTER every
  // room type's own recommendation is computed above, so a capped type's final price can never
  // exceed its referenced type's recommendation on the same date, regardless of its own
  // occupancy-driven swing. Supports a CHAIN of ceilings (Jorge's ask 2026-10-18: Simple n
  // Small -> Garden -> Garden Plus -> Superior -> Beachfront King, and Double -> Beachview
  // Double) -- repeats the full pass once per room type so a cap propagates down an arbitrarily
  // long chain regardless of what order the referenced types happen to be processed in, not
  // just when the configured chain happens to match roomTypes' own iteration order. A
  // misconfigured cycle (A ceils to B, B ceils to A) can't loop since the repeat count is fixed
  // (roomTypes.length), not "until stable" -- it just stops converging on a cycle, no crash.
  for (let pass = 0; pass < roomTypes.length; pass++) {
    let changed = false;
    for (const rt of roomTypes) {
      const ceilId = settings.priceCeilingRoomTypeId && settings.priceCeilingRoomTypeId[rt.id];
      const ceilType = ceilId && byRoomType[ceilId];
      if (!ceilType) continue;
      const byDate = byRoomType[rt.id].byDate;
      for (const dateStr of Object.keys(byDate)) {
        const ceilPrice = ceilType.byDate[dateStr] && ceilType.byDate[dateStr].recommended;
        if (ceilPrice != null && byDate[dateStr].recommended > ceilPrice) { byDate[dateStr].recommended = ceilPrice; changed = true; }
      }
    }
    if (!changed) break;
  }

  const changes = [];
  for (const rt of roomTypes) {
    const byDate = byRoomType[rt.id].byDate;
    for (const dateStr of Object.keys(byDate)) {
      const { current, recommended } = byDate[dateStr];
      if (recommended !== current) changes.push({ room_type_id: rt.id, date: dateStr, price_single: recommended });
    }
  }

  let applied = 0;
  if (settings.autoApplyEnabled && changes.length) {
    const r = await L.applyPriceChanges(key, changes, 'Automatic (Revenue Manager bot)');
    applied = r.applied;
    // The snapshot should reflect what's now actually live, not what was live before this run.
    for (const c of changes) byRoomType[c.room_type_id].byDate[c.date].current = c.price_single;
  }

  const result = { generatedAt: new Date().toISOString(), windowDays: WINDOW_DAYS, referenceRoomTypeId: settings.referenceRoomTypeId, autoApplied: applied, byRoomType };
  await L.appStoreSet(key, L.RECS_KEY, result);
  return { roomTypes: roomTypes.length, datesProcessed, autoApplied: applied };
};

exports.handler = async () => {
  try {
    const r = await exports.runRecalc();
    console.log('[room-price-recalc]', JSON.stringify(r));
    return { statusCode: 200, body: JSON.stringify(r) };
  } catch (e) {
    console.error('[room-price-recalc]', e.message);
    return { statusCode: 500, body: e.message };
  }
};
