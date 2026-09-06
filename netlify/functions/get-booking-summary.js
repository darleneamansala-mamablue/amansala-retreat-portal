'use strict';

// Guest-facing reservation summary, looked up by a long random token (never by
// the booking's internal id) -- returns only the fields this page renders, never
// the full row (staff notes, other internal fields never leave the server).
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let token;
  try { ({ token } = JSON.parse(event.body || '{}')); }
  catch { return jsonErr(400, 'Invalid JSON'); }
  if (!token) return jsonErr(400, 'Missing token');

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  try {
    const bkRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings?guest_res_token=eq.${encodeURIComponent(token)}&select=*`, { headers: hdrs });
    if (!bkRes.ok) throw new Error('bookings fetch failed');
    const [bk] = await bkRes.json();
    if (!bk) return jsonErr(404, 'Booking not found');

    const payRes = await fetch(`${SUPABASE_URL}/rest/v1/payments?booking_id=eq.${encodeURIComponent(bk.id)}&select=amount`, { headers: hdrs });
    const payments = payRes.ok ? await payRes.json() : [];

    const roomTotal = bk.room_rate_total || 0;
    const chargesTotal = (bk.charges || []).reduce((s, c) => s + (c.amount || 0), 0);
    const total = +(roomTotal + chargesTotal).toFixed(2);
    const paid = (payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    const additionalGuests = (bk.folio_split?.mode === 'separate') ? (bk.folio_split.guestNames || []).slice(1) : [];

    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaderName: bk.leader_name || '',
        additionalGuests,
        startDate: bk.start_date,
        endDate: bk.end_date,
        nights: bk.room_rate_nights || 0,
        total,
        paid: +paid.toFixed(2),
        confirmationNumber: bk.confirmation_number || '',
        guestNotes: bk.guest_notes || '',
      }),
    };
  } catch (err) {
    return jsonErr(500, err.message);
  }
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
