'use strict';

// Adapted from Jorge's version onto our app_store blob pattern (see get-availability.js).
const SUPABASE_URL = 'https://fzresosiqafiyxfgeyvk.supabase.co';

async function readAppStore(key, hdrs) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.${encodeURIComponent(key)}&select=value`, { headers: hdrs });
  if (!res.ok) throw new Error(`${key} fetch failed`);
  const rows = await res.json();
  return rows[0]?.value ?? null;
}

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
    const [roomTypesRaw, settings, beRates] = await Promise.all([
      readAppStore('roomTypes', hdrs),
      readAppStore('bookingEngineSettings', hdrs),
      readAppStore('beRates', hdrs),
    ]);
    const roomTypes = (roomTypesRaw ?? []).filter(rt => (rt.rooms ?? []).length > 0);
    const rates = beRates ?? []; // manual per-room-type date-range overrides — none configured yet
    const weekendPct = settings?.weekend_premium ?? 0;
    const seasonal = settings?.seasonal_adjustments ?? {};

    const result = {};
    const startD = new Date(start + 'T12:00:00');
    const endD = new Date(end + 'T12:00:00');

    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const low = isLow(dateStr);
      const wknd = isWeekend(dateStr);
      const month = d.getMonth() + 1;
      let minPrice = null;

      roomTypes.forEach(rt => {
        const manualRate = rates.find(x =>
          x.roomTypeId === rt.id && x.startDate <= dateStr && x.endDate >= dateStr
        );
        let price;
        if (manualRate) {
          // Manual override: apply weekend premium only (manual range = intentional pricing)
          price = manualRate.priceSingle;
          if (wknd && weekendPct) price = Math.round(price * (1 + weekendPct / 100));
        } else {
          // Base rate: a Booking Engine override (set via the admin Rates tab) takes
          // priority; otherwise our existing real seasonal single-occupancy price.
          const base = rt.be_price_single ?? (low ? (rt.price1_low ?? rt.price1) : rt.price1);
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
