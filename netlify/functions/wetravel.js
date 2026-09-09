'use strict';

// ===== WeTravel Partner API proxy =====
// Mirrors the pattern in cloudbeds.js: refresh token (WETRAVEL_REFRESH_TOKEN) is
// exchanged for a short-lived access token, cached in-memory between invocations
// on a warm Lambda. Used by the admin-facing package-mapping screen (list trips /
// packages) and reusable from wetravel-webhook.js for the same lookups.
//
// Base URLs confirmed against the live account 2026-09-09:
//   Trip Builder API : https://api.wetravel.com/v2/draft_trips
//   Booking API      : https://api.wetravel.com/v2/bookings/trips/{trip_uuid}/bookings
// (the docs' own examples for these two groups disagree on prefix — verified by
// direct trial against the real account rather than trusting either verbatim.)

const WT_BASE = 'https://api.wetravel.com/v2';

let _token = null; // { access_token, expires_at_ms }

async function getToken() {
  const now = Date.now();
  if (_token && _token.expires_at_ms > now + 30_000) return _token.access_token;
  const refreshToken = process.env.WETRAVEL_REFRESH_TOKEN || '';
  if (!refreshToken) throw new Error('WETRAVEL_REFRESH_TOKEN not set');
  const res = await fetch(`${WT_BASE}/auth/tokens/access`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${refreshToken}` },
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('WeTravel token exchange failed: ' + JSON.stringify(data).slice(0, 300));
  // Access tokens are documented as 1h-lived — refresh a little early.
  _token = { access_token: data.access_token, expires_at_ms: now + 55 * 60 * 1000 };
  return _token.access_token;
}

async function wtGet(path) {
  const tok = await getToken();
  const res = await fetch(`${WT_BASE}${path}`, { headers: { Authorization: `Bearer ${tok}` } });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`WeTravel GET ${path} -> ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

// List every draft_trip page (small account — a handful of trips, no need to
// paginate lazily) so the mapping UI can show trip titles for context.
async function listAllTrips() {
  let all = [], page = 1;
  while (true) {
    const d = await wtGet(`/draft_trips?per_page=100&page=${page}`);
    const rows = d.data || [];
    all = all.concat(rows);
    if (!d.pagination || !d.pagination.has_next) break;
    page++;
    if (page > 20) break;
  }
  return all;
}

async function listPackages(tripUuid) {
  const d = await wtGet(`/draft_trips/${encodeURIComponent(tripUuid)}/packages`);
  return d.data || [];
}

// The single-order endpoint 403s against this account for reasons undetermined —
// list-and-find works reliably, and per-trip order counts are small enough that
// paging the whole list is cheap.
async function listOrders(tripUuid) {
  let all = [], page = 1;
  while (true) {
    const d = await wtGet(`/bookings/trips/${encodeURIComponent(tripUuid)}/bookings?per_page=100&page=${page}`);
    const rows = d.data || [];
    all = all.concat(rows);
    if (!d.pagination || !d.pagination.has_next) break;
    page++;
    if (page > 50) break;
  }
  return all;
}
async function findOrder(tripUuid, orderId) {
  const orders = await listOrders(tripUuid);
  return orders.find(o => String(o.id) === String(orderId)) || null;
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function ok(body, status) { return { statusCode: status || 200, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors() };
  try {
    const qs = event.queryStringParameters || {};
    const action = qs.action;
    switch (action) {
      case 'listTrips':
        return ok({ trips: await listAllTrips() });
      case 'listPackages':
        if (!qs.tripUuid) return ok({ error: 'tripUuid required' }, 400);
        return ok({ packages: await listPackages(qs.tripUuid) });
      case 'listOrders':
        if (!qs.tripUuid) return ok({ error: 'tripUuid required' }, 400);
        return ok({ orders: await listOrders(qs.tripUuid) });
      default:
        return ok({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error('[wetravel]', e.message);
    return ok({ error: e.message }, 502);
  }
};

module.exports.getToken = getToken;
module.exports.wtGet = wtGet;
module.exports.listAllTrips = listAllTrips;
module.exports.listPackages = listPackages;
module.exports.listOrders = listOrders;
module.exports.findOrder = findOrder;
