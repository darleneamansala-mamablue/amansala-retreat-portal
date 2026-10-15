'use strict';

// Visito AI "Tool" — lets Lana quote the REAL private-transfer price instead of inventing
// one (Jorge's report 2026-10-15: she was saying "USD 168.15, impuestos incluidos" for a
// Tulum airport transfer, a number that doesn't match anything in this system at all).
// Rate table and tax % are staff-editable in Admin > Settings (Jorge's ask 2026-10-15),
// read live from Supabase app_store key 'portal_settings' -- these are just the fallback
// defaults if that screen was never saved. Same table auto-charge-transport.js uses to
// bill hotel guests' folios the night before their transfer. Per-person rate drops as
// more guests share the same van (same table, same logic).
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const DEFAULT_RATES = { cancun: [195, 100, 80, 65, 55, 45], tulum: [145, 80, 65, 55, 45, 40] };
const DEFAULT_TAX_RATE_PCT = 13;

function autoRate(rates, airport, pax) {
  const tbl = rates[airport];
  if (!tbl) return null;
  return tbl[Math.min(Math.max(pax, 1) - 1, tbl.length - 1)];
}

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: msg }) }; }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const expectedToken = process.env.VISITO_TOOL_SECRET;
  if (!expectedToken) return jsonErr(500, 'Server config error');
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  if (authHeader.replace(/^Bearer\s+/i, '').trim() !== expectedToken) return jsonErr(401, 'Unauthorized');

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { airport, pax } = payload.arguments || {};
  const ap = String(airport || '').trim().toLowerCase();
  const n = Math.round(Number(pax));

  let rates = DEFAULT_RATES, TAX_RATE_PCT = DEFAULT_TAX_RATE_PCT;
  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (supaKey) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.portal_settings&select=value`, { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } });
      const [row] = r.ok ? await r.json() : [];
      if (row?.value?.transportRates) rates = row.value.transportRates;
      if (row?.value?.spaTransportTaxPct != null) TAX_RATE_PCT = row.value.spaTransportTaxPct;
    } catch (e) { /* non-fatal — use defaults */ }
  }

  if (!rates[ap]) return ok({ success: false, message: 'El aeropuerto debe ser "cancun" o "tulum".' });
  if (!(n >= 1) || n > 20) return ok({ success: false, message: 'Dame un número de pasajeros válido (1 o más).' });

  const perPersonUSD = autoRate(rates, ap, n);
  const subtotalUSD = Math.round(perPersonUSD * n * 100) / 100;
  const taxAmount = Math.round(subtotalUSD * TAX_RATE_PCT) / 100;
  const totalUSD = Math.round((subtotalUSD + taxAmount) * 100) / 100;
  const priceDisplay = n === 1
    ? `$${perPersonUSD} USD + ${TAX_RATE_PCT}% tax`
    : `$${perPersonUSD} USD por persona ($${subtotalUSD.toFixed(2)} USD subtotal para ${n} pasajeros) + ${TAX_RATE_PCT}% tax`;

  return ok({
    success: true,
    airport: ap, pax: n,
    perPersonUSD, subtotalUSD, taxRatePct: TAX_RATE_PCT, taxAmount, totalUSD,
    priceDisplay,
    message: `Traslado privado ${ap === 'cancun' ? 'Cancún' : 'Tulum'} ↔ Amansala para ${n} pasajero${n > 1 ? 's' : ''}: ${priceDisplay} = $${totalUSD.toFixed(2)} USD total.`,
  });
};
