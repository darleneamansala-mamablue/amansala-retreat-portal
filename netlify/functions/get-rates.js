'use strict';

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

function isLow(dateStr) {
  const m = new Date(dateStr + 'T12:00:00').getMonth() + 1;
  return m >= 5 && m <= 9;
}
function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T12:00:00').getDay(); // 0=Sun,6=Sat
  return d === 0 || d === 5 || d === 6; // Fri/Sat/Sun
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  const { start, end } = event.queryStringParameters ?? {};
  if (!start || !end) return jsonErr(400, 'Missing start or end');

  const hdrs = { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` };

  try {
    const [ratesRes, rtRes, settingsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/be_rates?start_date=lte.${end}&end_date=gte.${start}&select=*`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/room_types?be_enabled=eq.true&select=id,be_price_single,price_single_high,price_single_low`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/booking_engine_settings?id=eq.1&select=weekend_premium,seasonal_adjustments`, { headers: hdrs }),
    ]);

    const rates      = ratesRes.ok  ? await ratesRes.json()    : [];
    const roomTypes  = rtRes.ok     ? await rtRes.json()       : [];
    const settingsArr = settingsRes.ok ? await settingsRes.json() : [];
    const settings   = settingsArr[0] ?? {};
    const weekendPct  = settings.weekend_premium      ?? 0;
    const seasonal    = settings.seasonal_adjustments ?? {};

    const result = {};
    const startD = new Date(start + 'T12:00:00');
    const endD   = new Date(end   + 'T12:00:00');

    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const low     = isLow(dateStr);
      const wknd    = isWeekend(dateStr);
      const month   = d.getMonth() + 1;
      let minPrice  = null;

      roomTypes.forEach(rt => {
        const manualRate = rates.find(x =>
          x.room_type_id === rt.id && x.start_date <= dateStr && x.end_date >= dateStr
        );
        let price;
        if (manualRate) {
          // Manual be_rates: apply weekend premium only (manual range = intentional pricing)
          price = manualRate.price_single;
          if (wknd && weekendPct) price = Math.round(price * (1 + weekendPct / 100));
        } else {
          // Base rate: Escape → regular. Apply seasonal + weekend adjustments.
          const base = rt.be_price_single != null
            ? rt.be_price_single
            : low ? (rt.price_single_low ?? rt.price_single_high) : rt.price_single_high;
          if (base != null) {
            const seasonalPct = Number(seasonal[String(month)] ?? 0);
            price = Math.round(base * (1 + seasonalPct / 100) * (wknd && weekendPct ? (1 + weekendPct / 100) : 1));
          }
        }
        if (price != null && (minPrice === null || price < minPrice)) minPrice = price;
      });

      if (minPrice !== null) result[dateStr] = minPrice;
    }

    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err) {
    return jsonErr(500, err.message);
  }
};

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }; }
function jsonErr(c, m) { return { statusCode: c, headers: cors(), body: JSON.stringify({ error: m }) }; }
