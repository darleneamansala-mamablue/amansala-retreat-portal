'use strict';
// Revenue Manager settings (GET/POST) -- see room-price-lib.js for shape and defaults.
// GET returns the saved settings merged over defaults, plus the live room_types list so
// revenue-manager.html's Pricing Strategy pages never have to guess which rooms exist.
// POST saves settings; when `dayOfWeekOwnedByTool` turns on, booking_engine_settings.
// weekend_premium is zeroed in the same request so Escape's existing flat weekend bump is
// never double-applied on top of this tool's own Day-of-the-Week Adjustments (flagged as an
// explicit decision in the plan, not a bug to find later).
const L = require('./room-price-lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return jsonErr(500, 'Server config error');

  try {
    if (event.httpMethod === 'GET') {
      const [settings, roomTypes, besRows] = await Promise.all([
        L.loadSettings(key), L.loadRoomTypes(key),
        L.sget(key, 'booking_engine_settings?id=eq.1&select=weekend_premium,seasonal_adjustments'),
      ]);
      const bes = besRows[0] || {};
      return ok({ settings, roomTypes, seasonalAdjustments: bes.seasonal_adjustments || {}, weekendPremiumPct: bes.weekend_premium ?? 0 });
    }
    if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch { return jsonErr(400, 'Invalid JSON'); }
      if (!body.settings) return jsonErr(400, 'Missing settings');
      await L.saveSettings(key, body.settings);
      // Monthly Adjustments edits the SAME column Escape already reads (booking_engine_settings.
      // seasonal_adjustments) rather than a parallel copy -- one source of truth either way.
      const besPatch = {};
      if (body.seasonalAdjustments) besPatch.seasonal_adjustments = body.seasonalAdjustments;
      if (body.settings.dayOfWeekOwnedByTool) besPatch.weekend_premium = 0;
      if (Object.keys(besPatch).length) await L.sreq(key, 'PATCH', 'booking_engine_settings?id=eq.1', besPatch, 'return=minimal');
      return ok({ success: true });
    }
    return jsonErr(405, 'Method Not Allowed');
  } catch (err) {
    return jsonErr(500, err.message);
  }
};

function ok(data) { return { statusCode: 200, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(data) }; }
function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) }; }
