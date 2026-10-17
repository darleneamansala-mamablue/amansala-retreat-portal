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
    L.sget(key, 'be_rates?select=room_type_id,start_date,end_date,price_single'),
    L.sget(key, 'booking_engine_settings?id=eq.1&select=weekend_premium,seasonal_adjustments'),
  ]);
  const bes = settingsRow[0] || {};
  const seasonalAdjustments = bes.seasonal_adjustments || {};
  const weekendPremiumPct = bes.weekend_premium ?? 0;
  const reference = roomTypes.find(rt => rt.id === settings.referenceRoomTypeId) || roomTypes[0];

  const byRoomType = {};
  const changes = [];
  let datesProcessed = 0;

  for (const rt of roomTypes) {
    const byDate = {};
    const beRatesForType = beRates.filter(r => r.room_type_id === rt.id);
    for (let d = new Date(today + 'T12:00:00'); d <= endD; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const occPct = Math.round(L.occupancyFor(dateStr, rt.rooms, blocks) * 100);
      const groupTaken = L.groupTakenFor(dateStr, rt.rooms, blocks);
      const current = L.currentLivePrice({
        roomType: rt, dateStr, beRatesForType, seasonalAdjustments, weekendPremiumPct,
        isLowSeason: L.isLowSeasonMonth(d.getMonth() + 1),
      });
      const recommended = L.recommendPrice({
        settings, roomType: rt, dateStr, today,
        actualOcc: occPct / 100,
        referenceBasePrice: reference ? reference.be_price_single : rt.be_price_single,
        seasonalAdjustments,
      });
      byDate[dateStr] = { occPct, groupTaken, totalRooms: rt.rooms.length, current, recommended };
      if (recommended !== current) changes.push({ room_type_id: rt.id, date: dateStr, price_single: recommended });
      datesProcessed++;
    }
    byRoomType[rt.id] = { name: rt.name, byDate };
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
