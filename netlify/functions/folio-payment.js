'use strict';

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const STRIPE_API   = 'https://api.stripe.com/v1';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const pubKey    = process.env.STRIPE_PUBLISHABLE_KEY;
  const supaKey   = process.env.SUPABASE_SERVICE_KEY;

  if (!stripeKey || !pubKey) return jsonErr(500, 'Stripe not configured');
  if (!supaKey)              return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { token } = body;
  if (!token) return jsonErr(400, 'Missing token');

  const supaHdrs = {
    'apikey':        supaKey,
    'Authorization': `Bearer ${supaKey}`,
    'Content-Type':  'application/json',
  };

  // Fetch folio by payment_token
  const folioRes = await fetch(
    `${SUPABASE_URL}/rest/v1/folios?payment_token=eq.${encodeURIComponent(token)}&select=id,name,status,payment_token,booking_request_id,registration_id,guest_name&limit=1`,
    { headers: supaHdrs }
  );
  if (!folioRes.ok) return jsonErr(500, 'Could not fetch folio');
  const folioArr = await folioRes.json();
  if (!folioArr.length) return jsonErr(404, 'Folio not found');
  const folio = folioArr[0];

  if (folio.status === 'paid') return jsonErr(400, 'Folio already paid');

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
      `${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(folio.registration_id)}&select=id,room,check_in,check_out,booking_id,bookings(retreat_name,start_date,end_date)&limit=1`,
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
          email:          null,   // registrations don't store individual guest email
        };
      }
    }
  } else if (folio.booking_request_id) {
    // Individual booking request folio — existing logic
    const bkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/booking_requests?id=eq.${encodeURIComponent(folio.booking_request_id)}&select=first_name,last_name,check_in,check_out,room_type_name,adults,email&limit=1`,
      { headers: supaHdrs }
    );
    if (bkRes.ok) {
      const bkArr = await bkRes.json();
      booking = bkArr[0] ?? null;
    }
  }

  // Per-item tax to match guest-pay.html display exactly:
  //   extras (tax_rate=16) → 16% IVA; room charges (tax_rate=21) → 21% IVA+ISH
  const subtotal = +items.reduce((sum, i) => sum + Number(i.qty) * Number(i.unit_price), 0).toFixed(2);
  const taxAmt   = +items.reduce((sum, i) => {
    const rate = i.tax_rate != null ? Number(i.tax_rate) : 0;
    return sum + Number(i.qty) * Number(i.unit_price) * rate / 100;
  }, 0).toFixed(2);
  const totalUSD    = +(subtotal + taxAmt).toFixed(2);
  const amountCents = Math.round(totalUSD * 100);

  if (amountCents < 50) return jsonErr(400, 'Amount too small to charge');

  const guestName = folio.guest_name
    ?? (booking ? `${booking.first_name ?? ''} ${booking.last_name ?? ''}`.trim() : '');
  const desc      = `Amansala Tulum · ${folio.name} · ${guestName}`.slice(0, 300);

  const params = new URLSearchParams({
    amount:           String(amountCents),
    currency:         'usd',
    description:      desc,
    'metadata[folioId]':    folio.id,
    'metadata[folioName]':  folio.name.slice(0, 200),
    'metadata[guestName]':  guestName.slice(0, 200),
    'metadata[checkIn]':    (booking?.check_in  ?? '').slice(0, 20),
    'metadata[checkOut]':   (booking?.check_out ?? '').slice(0, 20),
    'metadata[roomType]':   (booking?.room_type_name ?? '').slice(0, 200),
  });

  if (booking?.email) params.set('receipt_email', booking.email.slice(0, 254));

  const piRes = await fetch(`${STRIPE_API}/payment_intents`, {
    method:  'POST',
    headers: {
      'Authorization':  `Bearer ${stripeKey}`,
      'Content-Type':   'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body: params.toString(),
  });
  const pi = await piRes.json();
  if (pi.error) return jsonErr(400, pi.error.message ?? 'Stripe error');

  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientSecret:    pi.client_secret,
      publishableKey:  pubKey,
      amount:          totalUSD,
      subtotal,
      taxAmt,
      folio:   { id: folio.id, name: folio.name, status: folio.status },
      booking,
      items,
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
