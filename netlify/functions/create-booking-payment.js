'use strict';

// Creates a Stripe PaymentIntent for the EXACT stored amount on an existing
// room-only booking (staff-set rate, possibly manually overridden) -- unlike
// stripe.js (used by book.html/extra-nights.html) this never recomputes price
// from room-type/season data, since that could silently drift from what staff
// actually agreed with the guest.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const STRIPE_API = 'https://api.stripe.com/v1';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZudHRscHFrc3NpaGJtY3lueHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjU1NjEsImV4cCI6MjEwMDg0MTU2MX0.ZCnXPWFLmH1ysDZJm_evEIapYhPZubzKZFLadKvqr6A';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const pubKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!stripeKey || !pubKey) return jsonErr(500, 'Stripe not configured');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { bookingId } = body;
  if (!bookingId) return jsonErr(400, 'Missing bookingId');

  let bk;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.bookings&select=value`, {
      headers: { apikey: ANON_KEY },
    });
    if (!res.ok) throw new Error('bookings fetch failed');
    const rows = await res.json();
    const bookings = rows[0]?.value ?? [];
    bk = bookings.find(b => b.id === bookingId);
  } catch (err) {
    return jsonErr(500, 'Could not fetch booking');
  }

  if (!bk) return jsonErr(404, 'Booking not found');
  if (bk.bookingType !== 'room_only') return jsonErr(400, 'Not a room-only booking');
  if (!bk.roomRateTotal || bk.roomRateTotal <= 0) return jsonErr(400, 'Booking has no rate set');

  // Charge the REMAINING balance, not the full total — a guest returning to
  // pay off a balance after an earlier deposit/payment must never be
  // charged the whole reservation amount again.
  const chargesTotal = (bk.charges || []).reduce((s, c) => s + (c.amount || 0), 0);
  const alreadyPaid = (bk.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const balanceDue = Math.round((bk.roomRateTotal + chargesTotal - alreadyPaid) * 100) / 100;
  if (balanceDue <= 0) return jsonErr(400, 'This reservation is already paid in full');

  const amountCents = Math.round(balanceDue * 100);
  if (amountCents < 50) return jsonErr(400, 'Amount too small');

  const room = (bk.blockedRooms || [])[0] || '';
  const params = new URLSearchParams({
    amount: String(amountCents),
    currency: 'usd',
    description: `Amansala Tulum · Room ${room} · ${bk.startDate} – ${bk.endDate}`.slice(0, 500),
    ...(bk.leaderEmail ? { receipt_email: bk.leaderEmail } : {}),
    'metadata[bookingId]': bookingId,
    'metadata[source]': 'room_booking',
    'metadata[leaderName]': (bk.leaderName || '').slice(0, 100),
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
      amount: balanceDue,
      leaderName: bk.leaderName || '',
      room,
      startDate: bk.startDate,
      endDate: bk.endDate,
    }),
  };
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
