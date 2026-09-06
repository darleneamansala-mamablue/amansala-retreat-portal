'use strict';

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { firstName, lastName, email } = body;
  if (!firstName || !lastName || !email) return jsonErr(400, 'Missing required fields');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonErr(400, 'Invalid email');

  const today = new Date().toISOString().slice(0, 10);

  // Fetch registrations for active/upcoming bookings (not cancelled, end_date >= today)
  // Paginate in batches of 1000 to avoid Supabase row limit
  const supaHdrs = {
    'apikey':        supaKey,
    'Authorization': `Bearer ${supaKey}`,
    'Content-Type':  'application/json',
  };

  const PAGE = 1000;
  let regs = [];
  let from = 0;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/registrations`
      + `?select=id,room,guests,booking_id,bookings!inner(start_date,end_date,status,retreat_name)`
      + `&bookings.end_date=gte.${today}`
      + `&bookings.status=neq.cancelled`
      + `&order=booking_id.asc`;
    const res = await fetch(url, {
      headers: { ...supaHdrs, 'Range': `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
    });
    if (!res.ok) return jsonErr(500, 'Could not fetch registrations');
    const page = await res.json();
    if (!Array.isArray(page) || !page.length) break;
    regs = regs.concat(page);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const f = norm(firstName);
  const l = norm(lastName);
  const e = email.trim().toLowerCase();

  // Find best match — email is authoritative; name is fallback
  let match = null;

  for (const reg of regs) {
    if (!reg.room || !Array.isArray(reg.guests)) continue;
    for (const g of reg.guests) {
      if (!g.name) continue;
      const emailMatch = g.email && g.email.trim().toLowerCase() === e;
      const gNorm      = norm(g.name);
      const nameMatch  = gNorm.includes(f) && gNorm.includes(l);

      if (emailMatch && nameMatch) {
        // Perfect match — return immediately
        match = { reg, g, score: 2 };
        break;
      }
      if (emailMatch && !match) {
        match = { reg, g, score: 1 };
      }
      if (nameMatch && !match) {
        match = { reg, g, score: 0 };
      }
    }
    if (match?.score === 2) break;
  }

  if (!match) {
    return {
      statusCode: 404,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ found: false }),
    };
  }

  const bk = match.reg.bookings;
  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      found:          true,
      room:           match.reg.room,
      registrationId: match.reg.id,
      guestName:      match.g.name,
      retreatName:    bk?.retreat_name || null,
      checkIn:        bk?.start_date   || null,
      checkOut:       bk?.end_date     || null,
    }),
  };
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonErr(code, msg) {
  return {
    statusCode: code,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: msg }),
  };
}
