'use strict';

// Creates a Stripe PaymentIntent for the EXACT stored amount on an existing
// room-only booking (staff-set rate, possibly manually overridden) -- unlike
// stripe.js (used by book.html/extra-nights.html) this never recomputes price
// from room-type/season data, since that could silently drift from what staff
// actually agreed with the guest.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const STRIPE_API = 'https://api.stripe.com/v1';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const pubKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!stripeKey || !pubKey) return jsonErr(500, 'Stripe not configured');
  if (!supaKey) return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  let { bookingId, token } = body;
  if (!bookingId && !token) return jsonErr(400, 'Missing bookingId or token');

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  let bk;
  try {
    // Prefer the secure token (Phase 2 "Send to Guest" links) — falls back to the
    // raw id for any link sent before tokens existed. Resolved server-side so the
    // client never needs read access to the bookings table directly.
    const filter = token ? `guest_res_token=eq.${encodeURIComponent(token)}` : `id=eq.${encodeURIComponent(bookingId)}`;
    const bkRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings?${filter}&select=*`, { headers: hdrs });
    if (!bkRes.ok) throw new Error('bookings fetch failed');
    [bk] = await bkRes.json();
  } catch (err) {
    return jsonErr(500, 'Could not fetch booking');
  }

  if (!bk) return jsonErr(404, 'Booking not found');
  bookingId = bk.id;

  let payments;
  try {
    const payRes = await fetch(`${SUPABASE_URL}/rest/v1/payments?booking_id=eq.${encodeURIComponent(bookingId)}&select=amount`, { headers: hdrs });
    payments = payRes.ok ? await payRes.json() : [];
  } catch (err) {
    payments = [];
  }

  if (bk.booking_type !== 'room_only' || !bk.room_rate_total || bk.room_rate_total <= 0) {
    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notSetUp: true, leaderName: bk.leader_name || '' }),
    };
  }

  // Charge the REMAINING balance, not the full total — a guest returning to
  // pay off a balance after an earlier deposit/payment must never be
  // charged the whole reservation amount again.
  const chargesTotal = (bk.charges || []).reduce((s, c) => s + (c.amount || 0), 0);
  const alreadyPaid = (payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const balanceDue = Math.round((bk.room_rate_total + chargesTotal - alreadyPaid) * 100) / 100;
  if (balanceDue <= 0) {
    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ alreadyPaidInFull: true, leaderName: bk.leader_name || '' }),
    };
  }

  const amountCents = Math.round(balanceDue * 100);
  if (amountCents < 50) return jsonErr(400, 'Amount too small');

  const room = (bk.blocked_rooms || [])[0] || '';
  const params = new URLSearchParams({
    amount: String(amountCents),
    currency: 'usd',
    description: `Amansala Tulum · Room ${room} · ${bk.start_date} – ${bk.end_date}`.slice(0, 500),
    ...(bk.leader_email ? { receipt_email: bk.leader_email } : {}),
    'metadata[bookingId]': bookingId,
    'metadata[source]': 'room_booking',
    'metadata[leaderName]': (bk.leader_name || '').slice(0, 100),
    'metadata[room]': room.slice(0, 50),
  });

  let pi;
  try {
    const piRes = await fetch(`${STRIPE_API}/payment_intents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2024-06-20',
      },
      body: params.toString(),
    });
    pi = await piRes.json();
    if (pi.error) return jsonErr(400, pi.error.message ?? 'Stripe error');
  } catch (err) {
    return jsonErr(500, 'Stripe request failed');
  }

  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      publishableKey: pubKey,
      bookingId,
      amount: balanceDue,
      alreadyPaid,
      leaderName: bk.leader_name || '',
      room,
      startDate: bk.start_date,
      endDate: bk.end_date,
    }),
  };
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
