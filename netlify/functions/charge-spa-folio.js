'use strict';

// Charges a spa service to the guest's open folio.
// Uses SERVICE KEY so RLS is bypassed. Supports booking_requests and registrations.
// Body: { bookingRequestId?, registrationId?, room?, apptDate, svcName, svcPrice, taxRate? }

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { bookingRequestId, registrationId, room, apptDate, svcName, svcPrice, therapistName, taxRate = 13 } = body;
  if (!svcName || !svcPrice || !apptDate) return jsonErr(400, 'Missing: svcName, svcPrice, apptDate');
  if (!bookingRequestId && !registrationId && !room) return jsonErr(400, 'Provide bookingRequestId, registrationId, or room');

  const h = {
    'apikey':        supaKey,
    'Authorization': `Bearer ${supaKey}`,
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  };

  let folioId = null;
  let debug   = [];

  // ── 1. Direct lookup by bookingRequestId ──────────────────────────────────
  if (bookingRequestId && !folioId) {
    const url = `${SUPABASE_URL}/rest/v1/folios?select=id&booking_request_id=eq.${encodeURIComponent(bookingRequestId)}&status=eq.open&order=created_at.asc&limit=1`;
    const r = await fetch(url, { headers: h });
    const d = await r.json().catch(() => []);
    debug.push(`bkReq lookup(${bookingRequestId}): ${JSON.stringify(d)}`);
    folioId = Array.isArray(d) && d[0]?.id ? d[0].id : null;
  }

  // ── 2. Direct lookup by registrationId ───────────────────────────────────
  if (registrationId && !folioId) {
    const url = `${SUPABASE_URL}/rest/v1/folios?select=id&registration_id=eq.${encodeURIComponent(registrationId)}&status=eq.open&order=created_at.asc&limit=1`;
    const r = await fetch(url, { headers: h });
    const d = await r.json().catch(() => []);
    debug.push(`reg lookup(${registrationId}): ${JSON.stringify(d)}`);
    folioId = Array.isArray(d) && d[0]?.id ? d[0].id : null;
  }

  // ── 3. Room-based fallback — booking_requests ─────────────────────────────
  if (room && !folioId) {
    const bkUrl = `${SUPABASE_URL}/rest/v1/booking_requests?select=id,room,room_type_name&check_out=gte.${apptDate}&order=check_in.asc`;
    const bkRes = await fetch(bkUrl, { headers: h });
    const bkReqs = await bkRes.json().catch(() => []);
    debug.push(`room BK reqs total: ${Array.isArray(bkReqs) ? bkReqs.length : 'err'}`);
    const matched = (Array.isArray(bkReqs) ? bkReqs : []).filter(r =>
      (r.room && r.room === room) || (r.room_type_name && r.room_type_name === room)
    );
    debug.push(`room matched: ${matched.map(r => r.id + '(' + (r.room || r.room_type_name) + ')').join(',')}`);
    for (const req of matched) {
      const fUrl = `${SUPABASE_URL}/rest/v1/folios?select=id&booking_request_id=eq.${encodeURIComponent(req.id)}&status=eq.open&order=created_at.asc&limit=1`;
      const fRes = await fetch(fUrl, { headers: h });
      const fd   = await fRes.json().catch(() => []);
      debug.push(`folio for bkReq ${req.id}: ${JSON.stringify(fd)}`);
      if (Array.isArray(fd) && fd[0]?.id) { folioId = fd[0].id; break; }
    }
  }

  // ── 4. Room-based fallback — registrations ────────────────────────────────
  if (room && !folioId) {
    const regUrl = `${SUPABASE_URL}/rest/v1/registrations?select=id,bookings!inner(end_date,status)&room=eq.${encodeURIComponent(room)}`;
    const regRes = await fetch(regUrl, { headers: h });
    const regList = await regRes.json().catch(() => []);
    debug.push(`room registrations: ${Array.isArray(regList) ? regList.length : 'err'}`);
    const validRegs = (Array.isArray(regList) ? regList : []).filter(r =>
      r.bookings?.end_date >= apptDate && r.bookings?.status !== 'cancelled'
    ).sort((a, b) => (a.bookings?.start_date || '').localeCompare(b.bookings?.start_date || ''));
    for (const reg of validRegs) {
      const fUrl = `${SUPABASE_URL}/rest/v1/folios?select=id&registration_id=eq.${encodeURIComponent(reg.id)}&status=eq.open&order=created_at.asc&limit=1`;
      const fRes = await fetch(fUrl, { headers: h });
      const fd   = await fRes.json().catch(() => []);
      if (Array.isArray(fd) && fd[0]?.id) { folioId = fd[0].id; break; }
    }
  }

  if (!folioId) {
    return {
      statusCode: 404,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'No open folio found', debug }),
    };
  }

  // ── 5. Insert folio_item ───────────────────────────────────────────────────
  const itemRes = await fetch(`${SUPABASE_URL}/rest/v1/folio_items`, {
    method:  'POST',
    headers: { ...h, 'Prefer': 'return=representation' },
    body:    JSON.stringify({
      folio_id:    folioId,
      description: therapistName ? `Spa · ${svcName} — ${therapistName}` : `Spa · ${svcName}`,
      qty:         1,
      unit_price:  Number(svcPrice),
      tax_rate:    Number(taxRate),
    }),
  });
  const itemData = await itemRes.json().catch(() => null);
  if (!itemRes.ok) {
    return jsonErr(itemRes.status, 'folio_items insert failed: ' + JSON.stringify(itemData));
  }
  const item = Array.isArray(itemData) ? itemData[0] : itemData;

  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ folioId, folioItemId: item?.id || null }),
  };
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
