'use strict';

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'GET') return jsonErr(405, 'Method Not Allowed');

  const token = event.queryStringParameters?.token;
  if (!token) return jsonErr(400, 'Missing token');

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  const supaHdrs = {
    'apikey':        supaKey,
    'Authorization': `Bearer ${supaKey}`,
    'Content-Type':  'application/json',
  };

  // Fetch folio by payment_token
  const folioRes = await fetch(
    `${SUPABASE_URL}/rest/v1/folios?payment_token=eq.${encodeURIComponent(token)}&select=id,name,status,payment_token,booking_request_id,registration_id,guest_name,created_at&limit=1`,
    { headers: supaHdrs }
  );
  if (!folioRes.ok) return jsonErr(500, 'Could not fetch folio');
  const folioArr = await folioRes.json();
  if (!folioArr.length) return jsonErr(404, 'Folio not found');
  const folio = folioArr[0];

  // Fetch folio items
  const itemsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/folio_items?folio_id=eq.${encodeURIComponent(folio.id)}&order=created_at.asc`,
    { headers: supaHdrs }
  );
  if (!itemsRes.ok) return jsonErr(500, 'Could not fetch folio items');
  const items = await itemsRes.json();

  // Fetch booking info — either from registration or booking_request
  let booking = null;
  if (folio.registration_id) {
    // Registration folio — fetch registration joined with booking
    const regRes = await fetch(
      `${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(folio.registration_id)}&select=id,room,check_in,check_out,guests,booking_id,bookings(retreat_name,start_date,end_date)&limit=1`,
      { headers: supaHdrs }
    );
    if (regRes.ok) {
      const regArr = await regRes.json();
      const reg    = regArr[0] ?? null;
      if (reg) {
        const regBk = reg.bookings ?? {};
        booking = {
          first_name:     folio.guest_name ?? '',
          last_name:      '',
          check_in:       reg.check_in  || regBk.start_date || null,
          check_out:      reg.check_out || regBk.end_date   || null,
          room_type_name: reg.room      || null,
          adults:         1,
          retreat_name:   regBk.retreat_name || null,
        };
      }
    }
  } else if (folio.booking_request_id) {
    // Individual booking request folio — existing logic
    const bkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/booking_requests?id=eq.${encodeURIComponent(folio.booking_request_id)}&select=first_name,last_name,check_in,check_out,room_type_name,adults&limit=1`,
      { headers: supaHdrs }
    );
    if (bkRes.ok) {
      const bkArr = await bkRes.json();
      booking = bkArr[0] ?? null;
    }
  }

  const total = items.reduce((sum, i) => sum + Number(i.qty) * Number(i.unit_price) * (1 + (Number(i.tax_rate) || 0) / 100), 0);

  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ folio, items, booking, total }),
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
