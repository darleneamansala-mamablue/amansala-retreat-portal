'use strict';

// Polls Lightspeed L Series API for new "room charge" sales and posts them to guest folios.
// Called every 5 minutes via pg_cron (or manually from admin UI).
//
// TODO when credentials/docs arrive — confirm these env vars:
//   LIGHTSPEED_CLIENT_ID
//   LIGHTSPEED_CLIENT_SECRET
//   LIGHTSPEED_API_BASE       e.g. https://api.lightspeedapp.com/api/2.0
//   LIGHTSPEED_TOKEN_URL      e.g. https://cloud.lightspeedapp.com/oauth/access_token
//
// TODO: confirm exact API endpoints for L Series:
//   - GET sales/orders
//   - Filter by payment type = "room_charge"
//   - Field names in response (saleId, guestName, roomNumber, amount, etc.)
//
// Until confirmed, this function is a ready-to-wire skeleton.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

async function supaFetch(key, path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      ...(method !== 'GET' ? { 'Prefer': 'return=representation' } : {}),
    },
  };
  if (body != null) opts.body = JSON.stringify(body);
  const res  = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

// Refresh access token using refresh_token
async function refreshToken(supaKey, tokenRow) {
  const clientId     = process.env.LIGHTSPEED_CLIENT_ID;
  const clientSecret = process.env.LIGHTSPEED_CLIENT_SECRET;
  const tokenUrl     = process.env.LIGHTSPEED_TOKEN_URL;
  if (!clientId || !clientSecret || !tokenUrl) return null;

  const res = await fetch(tokenUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: tokenRow.refresh_token,
    }),
  });
  let data;
  try { data = await res.json(); } catch { return null; }
  if (!res.ok || !data.access_token) return null;

  const updated = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token ?? tokenRow.refresh_token,
    expires_at:    data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
    updated_at:    new Date().toISOString(),
  };
  await supaFetch(supaKey, `lightspeed_tokens?id=eq.${tokenRow.id}`, 'PATCH', updated);
  return updated.access_token;
}

// Get valid access token (refresh if needed)
async function getAccessToken(supaKey) {
  const res = await supaFetch(supaKey, 'lightspeed_tokens?select=*&limit=1');
  if (!res.ok || !Array.isArray(res.data) || !res.data.length) return null;
  const row = res.data[0];
  if (!row.access_token) return null;

  // Refresh if expires within 5 minutes
  if (row.expires_at) {
    const expiresAt = new Date(row.expires_at).getTime();
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      if (!row.refresh_token) return null;
      return refreshToken(supaKey, row);
    }
  }
  return row.access_token;
}

// Call our own room-charge handler to post a sale to the folio
async function postRoomCharge(saleId, guestName, roomNumber, amount, description, raw) {
  const origin = process.env.URL ?? 'https://amansala-staging.netlify.app';
  const res = await fetch(`${origin}/.netlify/functions/lightspeed-room-charge`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ saleId, guestName, roomNumber, amount, description, raw }),
  });
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  const supaKey  = process.env.SUPABASE_SERVICE_KEY;
  const apiBase  = process.env.LIGHTSPEED_API_BASE;
  if (!supaKey)  return { statusCode: 500, body: 'Missing SUPABASE_SERVICE_KEY' };
  if (!apiBase)  return { statusCode: 500, body: 'Missing LIGHTSPEED_API_BASE — set when credentials arrive' };

  const token = await getAccessToken(supaKey);
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Lightspeed not connected or token expired' }) };
  }

  // ── Fetch recent room-charge sales from Lightspeed ────────────
  // TODO: Replace with actual L Series endpoint and filters.
  //   Likely: GET /api/2.0/accounts/{accountId}/sales?payment_type=room_charge&since=...
  //   Or:     GET /api/2.0/accounts/{accountId}/orders?status=closed&payment=room_charge
  //
  // Poll window: last 10 minutes (cron runs every 5 min, overlap for safety)
  const since    = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const endpoint = `${apiBase}/TODO_REPLACE_WITH_ACTUAL_ENDPOINT?since=${encodeURIComponent(since)}`;

  const lsRes = await fetch(endpoint, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
  });

  if (!lsRes.ok) {
    const errText = await lsRes.text();
    console.error('[lightspeed-poll] API error:', lsRes.status, errText.slice(0, 200));
    return { statusCode: lsRes.status, body: JSON.stringify({ error: 'Lightspeed API error', detail: errText.slice(0, 200) }) };
  }

  let lsData;
  try { lsData = await lsRes.json(); } catch { lsData = {}; }

  // ── Map Lightspeed sale objects to our format ─────────────────
  // TODO: Adjust field mapping to match actual L Series response structure.
  //   These are placeholder field names — confirm with Lightspeed docs.
  const sales = lsData.sales ?? lsData.orders ?? lsData.data ?? [];

  const results = { processed: 0, skipped: 0, errors: [] };

  for (const sale of sales) {
    // TODO: Confirm actual field names from L Series API response
    const saleId      = String(sale.id ?? sale.saleID ?? sale.sale_id ?? '');
    const guestName   = sale.customer?.name ?? sale.customer_name ?? sale.guestName ?? null;
    const roomNumber  = sale.room ?? sale.room_number ?? sale.roomNumber ?? null;
    const amount      = parseFloat(sale.total ?? sale.total_price ?? sale.amount ?? 0);
    const description = sale.note ?? sale.description ?? `Lightspeed sale ${saleId}`;

    if (!saleId || amount <= 0) continue;

    try {
      const result = await postRoomCharge(saleId, guestName, roomNumber, amount, description, sale);
      if (result.skipped) results.skipped++;
      else if (result.success) results.processed++;
      else results.errors.push({ saleId, error: result.error });
    } catch (e) {
      results.errors.push({ saleId, error: e.message });
    }
  }

  console.log('[lightspeed-poll] done:', JSON.stringify(results));
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify(results),
  };
};
