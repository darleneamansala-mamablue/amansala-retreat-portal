'use strict';
// The nightly "bot" half of the Revenue Manager. Recomputes a recommended price for every
// be_enabled room type over a rolling window and stores it in app_store (does NOT touch
// `be_rates` -- v1 ships in suggestion mode; a human reviews revenue-manager.html's Calendar
// and clicks Upload Prices, which calls room-price-apply.js). Scheduled via netlify.toml, same
// pattern as rb-charge-balances.js.
const L = require('./room-price-lib');

const WINDOW_DAYS = 180;

exports.runRecalc = async function runRecalc() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error('Server config error: missing SUPABASE_SERVICE_KEY');

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
      datesProcessed++;
    }
    byRoomType[rt.id] = { name: rt.name, byDate };
  }

  const result = { generatedAt: new Date().toISOString(), windowDays: WINDOW_DAYS, referenceRoomTypeId: settings.referenceRoomTypeId, byRoomType };
  await L.appStoreSet(key, L.RECS_KEY, result);
  return { roomTypes: roomTypes.length, datesProcessed };
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
