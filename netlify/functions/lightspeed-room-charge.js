'use strict';

// POST /.netlify/functions/lightspeed-room-charge
// Called when a "room charge" payment is posted in Lightspeed L Series.
// Can be triggered by:
//   - Lightspeed webhook (if they support it)
//   - Our polling function (lightspeed-poll.js)
//   - Manual trigger from admin UI
//
// Body: { saleId, guestName, roomNumber, amount, description, items?, raw? }

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

function nameMatch(a, b) {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const tokA = norm(a).split(/\s+/).filter(Boolean);
  const tokB = norm(b).split(/\s+/).filter(Boolean);
  const [shorter, longer] = tokA.length <= tokB.length ? [tokA, tokB] : [tokB, tokA];
  return shorter.length > 0 && shorter.every(t => longer.includes(t));
}

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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return { statusCode: 500, body: 'Missing SUPABASE_SERVICE_KEY' };

  let body = {};
  try { body = JSON.parse(event.body ?? '{}'); } catch {}

  const { saleId, guestName, roomNumber, amount, description, items, raw } = body;

  if (!saleId)  return { statusCode: 400, body: JSON.stringify({ error: 'saleId required' }) };
  if (!amount || amount <= 0) return { statusCode: 400, body: JSON.stringify({ error: 'amount must be > 0' }) };

  // ── 1. Prevent duplicate charges ─────────────────────────────
  const dupRes = await supaFetch(supaKey, `lightspeed_charges?sale_id=eq.${encodeURIComponent(saleId)}&select=id,status&limit=1`);
  if (dupRes.ok && Array.isArray(dupRes.data) && dupRes.data.length) {
    return {
      statusCode: 200,
      body: JSON.stringify({ skipped: true, reason: 'already_charged', saleId, status: dupRes.data[0].status }),
    };
  }

  // ── 2. Find guest registration ────────────────────────────────
  const regsRes = await supaFetch(supaKey, 'registrations?select=id,booking_id,room,guests&limit=2000');
  const allRegs = regsRes.ok ? (regsRes.data ?? []) : [];

  let matchedReg  = null;
  let matchMethod = null;

  if (guestName) {
    const nameMatches = allRegs.filter(r =>
      (r.guests ?? []).some(g => g.name && nameMatch(g.name, guestName))
    );
    if (nameMatches.length === 1) {
      matchedReg  = nameMatches[0];
      matchMethod = 'name';
    } else if (nameMatches.length > 1) {
      // Multiple matches — try to narrow by room
      if (roomNumber) {
        const roomNarrow = nameMatches.filter(r =>
          r.room && r.room.toLowerCase().replace(/\s+/g, '') === roomNumber.toLowerCase().replace(/\s+/g, '')
        );
        if (roomNarrow.length === 1) { matchedReg = roomNarrow[0]; matchMethod = 'name+room'; }
      }
    }
  }

  // Fallback: match by room only
  if (!matchedReg && roomNumber) {
    const roomMatches = allRegs.filter(r =>
      r.room && r.room.toLowerCase().replace(/\s+/g, '') === roomNumber.toLowerCase().replace(/\s+/g, '')
    );
    if (roomMatches.length === 1) { matchedReg = roomMatches[0]; matchMethod = 'room'; }
  }

  if (!matchedReg) {
    await supaFetch(supaKey, 'lightspeed_charges', 'POST', {
      sale_id:     saleId,
      guest_name:  guestName  ?? null,
      room:        roomNumber ?? null,
      amount,
      description: description ?? 'Lightspeed charge',
      status:      'failed_no_guest',
      raw:         raw ?? body,
    });
    return {
      statusCode: 422,
      body: JSON.stringify({ error: 'guest_not_found', guestName, roomNumber }),
    };
  }

  // ── 3. Find or create folio ───────────────────────────────────
  const canonical = (matchedReg.guests ?? []).find(g => g.name)?.name ?? guestName ?? '';

  let folioId = null;
  const folioExact = await supaFetch(supaKey,
    `folios?select=id&registration_id=eq.${encodeURIComponent(matchedReg.id)}&guest_name=eq.${encodeURIComponent(canonical)}&status=eq.open&limit=1`
  );
  if (folioExact.ok && Array.isArray(folioExact.data) && folioExact.data.length) {
    folioId = folioExact.data[0].id;
  } else {
    const folioAny = await supaFetch(supaKey,
      `folios?select=id&registration_id=eq.${encodeURIComponent(matchedReg.id)}&status=eq.open&order=created_at.asc&limit=1`
    );
    if (folioAny.ok && Array.isArray(folioAny.data) && folioAny.data.length) {
      folioId = folioAny.data[0].id;
    } else {
      const newFolio = await supaFetch(supaKey, 'folios', 'POST', {
        registration_id: matchedReg.id,
        guest_name:      canonical,
        name:            canonical,
        payment_token:   crypto.randomUUID().replace(/-/g, ''),
        status:          'open',
      });
      const created = Array.isArray(newFolio.data) ? newFolio.data[0] : newFolio.data;
      folioId = created?.id;
    }
  }

  if (!folioId) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not find or create folio' }) };
  }

  // ── 4. Post charge to folio ───────────────────────────────────
  const itemDesc = description
    ?? (items?.length ? `Lightspeed — ${items.map(i => i.name ?? i.description).join(', ')}` : 'Lightspeed — Restaurant charge');

  const itemRes = await supaFetch(supaKey, 'folio_items', 'POST', {
    folio_id:    folioId,
    description: itemDesc,
    qty:         1,
    unit_price:  amount,
    tax_rate:    0,
  });
  if (!itemRes.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: 'folio_item_failed', detail: itemRes.data }) };
  }
  const folioItem = Array.isArray(itemRes.data) ? itemRes.data[0] : itemRes.data;

  // ── 5. Record in lightspeed_charges ──────────────────────────
  await supaFetch(supaKey, 'lightspeed_charges', 'POST', {
    sale_id:         saleId,
    guest_name:      guestName  ?? null,
    room:            roomNumber ?? null,
    amount,
    description:     itemDesc,
    registration_id: matchedReg.id,
    folio_item_id:   folioItem?.id ?? null,
    status:          'posted',
    match_method:    matchMethod,
    raw:             raw ?? null,
  });

  console.log(`[lightspeed-room-charge] posted $${amount} to folio of ${canonical} (${matchMethod})`);
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success:      true,
      folioItemId:  folioItem?.id,
      guestName:    canonical,
      matchMethod,
    }),
  };
};
