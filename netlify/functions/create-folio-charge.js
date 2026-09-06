'use strict';

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

function cors() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
function ok(body) {
  return { statusCode: 200, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function supaGet(supaKey, path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey':        supaKey,
      'Authorization': `Bearer ${supaKey}`,
      'Accept':        'application/json',
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function supaPost(supaKey, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        supaKey,
      'Authorization': `Bearer ${supaKey}`,
      'Prefer':        'return=representation',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

function genToken() {
  return crypto.randomUUID().replace(/-/g, '');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let fields;
  try { fields = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { registrationId, guestName, description, amount, qty, unitPrice, taxRate } = fields;
  if (!registrationId || !description) {
    return jsonErr(400, 'Missing required fields: registrationId, description');
  }
  const resolvedUnitPrice = Number(unitPrice ?? amount ?? 0);
  const resolvedQty       = qty ?? 1;
  const resolvedTaxRate   = taxRate ?? 0;

  // 0. Fetch canonical guest name from registration — must match what the admin panel uses
  //    (loadFolios filters by guest_name from reg.guests[0].name, not from the transport form)
  const regLookup = await supaGet(
    supaKey,
    `registrations?select=guests&id=eq.${encodeURIComponent(registrationId)}&limit=1`
  );
  const regRow      = Array.isArray(regLookup.data) ? regLookup.data[0] : null;
  const canonicalName = regRow?.guests?.find(g => g.name)?.name ?? guestName ?? '';

  // 1. Look up existing folio using the canonical name (same as admin panel)
  //    Fall back to any open folio for this registration.
  let folioId = null;

  // Try exact match with canonical name
  const exactLookup = await supaGet(
    supaKey,
    `folios?select=id&registration_id=eq.${encodeURIComponent(registrationId)}&guest_name=eq.${encodeURIComponent(canonicalName)}&limit=1`
  );
  if (!exactLookup.ok) return jsonErr(exactLookup.status, 'Error looking up folio');

  if (Array.isArray(exactLookup.data) && exactLookup.data.length > 0) {
    folioId = exactLookup.data[0].id;
  } else {
    // Fall back: any open folio for this registration (covers cases where folio exists with slight name variation)
    const anyLookup = await supaGet(
      supaKey,
      `folios?select=id,guest_name&registration_id=eq.${encodeURIComponent(registrationId)}&status=eq.open&order=created_at.asc&limit=1`
    );
    if (!anyLookup.ok) return jsonErr(anyLookup.status, 'Error looking up folio');

    if (Array.isArray(anyLookup.data) && anyLookup.data.length > 0) {
      folioId = anyLookup.data[0].id;
    }
  }

  // 2. Create folio if none exists — use canonical name so admin panel can find it
  if (!folioId) {
    const createRes = await supaPost(supaKey, 'folios', {
      registration_id: registrationId,
      guest_name:      canonicalName,
      name:            canonicalName,
      payment_token:   genToken(),
      status:          'open',
    });
    if (!createRes.ok) {
      const d = createRes.data;
      return jsonErr(createRes.status, typeof d === 'object' ? (d[0]?.message ?? JSON.stringify(d)) : String(d));
    }
    const created = Array.isArray(createRes.data) ? createRes.data[0] : createRes.data;
    folioId = created?.id;
    if (!folioId) return jsonErr(500, 'Folio created but no id returned');
  }

  // 3. Insert folio_item
  const itemRes = await supaPost(supaKey, 'folio_items', {
    folio_id:   folioId,
    description,
    qty:        resolvedQty,
    unit_price: resolvedUnitPrice,
    tax_rate:   resolvedTaxRate,
  });
  if (!itemRes.ok) {
    const d = itemRes.data;
    return jsonErr(itemRes.status, typeof d === 'object' ? (d[0]?.message ?? JSON.stringify(d)) : String(d));
  }
  const saved = Array.isArray(itemRes.data) ? itemRes.data[0] : itemRes.data;
  return ok({ data: saved, folioId });
};
