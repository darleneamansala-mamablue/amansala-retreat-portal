'use strict';
// Creates the Stripe PaymentIntent for a Retreat Booking cart. The amount is recalculated HERE from the saved retreat config
// (rb-lib.priceCart); whatever total the browser shows is ignored. Availability is checked again, and the guest's agreements
// (cancellation policy; single-bed roommate agreement) are required. The PaymentIntent deliberately does NOT carry the
// email / checkIn / checkOut metadata keys the hotel-booking webhook looks for, so that flow never touches these payments;
// stripe-webhook.js hands source=retreat_booking payments to rb-fulfil.js instead.
const L = require('./rb-lib');
const STRIPE_API = 'https://api.stripe.com/v1';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: L.cors(), body: '' };
  if (event.httpMethod !== 'POST') return L.json(405, { error: 'Method Not Allowed' });
  const stripeKey = process.env.STRIPE_SECRET_KEY, pubKey = process.env.STRIPE_PUBLISHABLE_KEY, key = process.env.SUPABASE_SERVICE_KEY;
  if (!stripeKey || !pubKey) return L.json(500, { error: 'Payments are not configured' });
  if (!key) return L.json(500, { error: 'Server config error' });

  let body;
  try { body = JSON.parse(event.body); } catch { return L.json(400, { error: 'Invalid request' }); }
  const { bookingId, cart, guest, acks } = body || {};
  if (!bookingId || !cart || !cart.room || !guest) return L.json(400, { error: 'Missing details' });

  const name = String(guest.name || '').trim(), email = String(guest.email || '').trim(), phone = String(guest.phone || '').trim();
  if (name.split(/\s+/).filter(Boolean).length < 2) return L.json(400, { error: 'Please enter your full name (first and last).' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return L.json(400, { error: 'Please enter a valid email address.' });
  if (phone.replace(/\D/g, '').length < 7) return L.json(400, { error: 'Please enter your phone number.' });
  if (!acks || acks.cancellation !== true) return L.json(400, { error: 'Please agree to the cancellation policy.' });

  try {
    const found = await L.loadRetreat(key, bookingId);
    if (!found || !found.cfg || !found.cfg.enabled || found.bk.status === 'cancelled') return L.json(404, { error: 'This booking page is not open.' });
    const { bk, cfg } = found;
    const nights = L.nightsOf(bk);
    const rm = (cfg.rooms || []).find((r) => r.rtId === cart.room.rtId);
    if (!rm) return L.json(400, { error: 'That room is not available.' });

    const priced = L.priceCart(cfg, nights, cart);
    const needed = rm.kind === 'twin' ? priced.guests : 1;
    // Everyone sharing the booking is named (both guests in one reservation); the booker is guest 1
    const others = (Array.isArray(guest.others) ? guest.others : []).map((n) => String(n || '').trim()).filter(Boolean);
    if (others.length !== priced.guests - 1) return L.json(400, { error: priced.guests > 1 ? `Please enter the full name of the ${priced.guests - 1 > 1 ? 'other guests' : 'other guest'}.` : 'Unexpected guests' });
    if (rm.kind === 'twin' && priced.guests < (Number(rm.maxBeds) || 2) && acks.roommate !== true) return L.json(400, { error: 'Please read and agree to the roommate terms.' });

    const av = await L.availability(key, bk, cfg);
    const isLeader = acks.leader === true;
    // Pick the room(s) the guest would get (leaders: Chica, else Grande; others: Grande first), then confirm with Cloudbeds that
    // each is still held. A room Cloudbeds says is gone is dropped and the next one is tried.
    let freeList = (av[rm.rtId] || { free: [] }).free.slice();
    let choice = L.chooseUnits(freeList, needed, isLeader);
    for (let tries = 0; tries < 4 && choice.units; tries++) {
      const gone = await L.cbGone(bk, choice.units);
      if (!gone.length) break;
      freeList = freeList.filter((u) => !gone.includes(u));
      choice = L.chooseUnits(freeList, needed, isLeader);
    }
    if (!choice.units) return L.json(409, { error: isLeader ? 'Sorry, that room type is sold out. Please choose another room type.' : 'Sorry, that room was just taken. Please choose another option.' });
    const leaderPlacement = isLeader ? choice.property.toLowerCase() : null;

    const amountCents = Math.round(priced.total * 100);
    if (amountCents < 50) return L.json(400, { error: 'Amount too small' });

    const roomLine = priced.lines.find((l) => l.type === 'room');
    const svcCompact = JSON.stringify((cart.services || []).map((s) => [s.id, Number(s.m), Math.max(1, Math.min(4, parseInt(s.q, 10) || 1))]));
    const params = new URLSearchParams({
      amount: String(amountCents),
      currency: 'usd',
      receipt_email: email,
      description: `Amansala Tulum · ${(cfg.title || bk.retreat_name || bk.leader_name || 'Retreat').slice(0, 80)} · ${roomLine.name} · ${bk.start_date} – ${bk.end_date}`.slice(0, 500),
      'metadata[source]': 'retreat_booking',
      'metadata[rbBookingId]': bk.id,
      'metadata[rbRoom]': JSON.stringify({ rtId: rm.rtId, mode: cart.room.mode || '', beds: priced.guests }).slice(0, 400),
      'metadata[rbSvc]': svcCompact.slice(0, 480),
      'metadata[rbName]': name.slice(0, 120),
      'metadata[rbEmail]': email.slice(0, 200),
      'metadata[rbPhone]': phone.slice(0, 50),
      'metadata[rbOthers]': JSON.stringify(others).slice(0, 480),
      'metadata[rbAck]': `cancel=1${acks.roommate === true ? ';roommate=1' : ''}${isLeader ? ';leader=1' : ''}`,
      'metadata[rbTotal]': String(priced.total),
    });
    const piRes = await fetch(`${STRIPE_API}/payment_intents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
      body: params.toString(),
    });
    const pi = await piRes.json();
    if (pi.error) return L.json(400, { error: pi.error.message || 'Payment error' });
    return L.json(200, { clientSecret: pi.client_secret, publishableKey: pubKey, amount: priced.total, lines: priced.lines, leaderPlacement });
  } catch (e) {
    console.error('[retreat-booking-intent]', e.message);
    return L.json(400, { error: e.message && /not (priced|available)/.test(e.message) ? e.message : 'Could not start the payment. Please try again.' });
  }
};
