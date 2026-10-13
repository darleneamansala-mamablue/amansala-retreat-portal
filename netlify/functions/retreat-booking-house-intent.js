'use strict';
// Creates the Stripe PaymentIntent for a Casa Master (house) booking: one or more bedrooms, each with its own guests, paid together on
// one card. The amount is recalculated HERE from the saved config (rb-house-lib.priceSelection); the browser's total is ignored.
// The separate room bookings, guests and prices are saved under app_store 'rbhouse:<piId>' (and as the booking record 'rbconsent:<piId>').
// stripe-webhook.js hands source=retreat_booking_house payments to rb-fulfil-house.js. The single-room checkout is not involved.
const L = require('./rb-lib');
const H = require('./rb-house-lib');

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: L.cors(), body: '' };
  if (event.httpMethod !== 'POST') return L.json(405, { error: 'Method Not Allowed' });
  const stripeKey = process.env.STRIPE_SECRET_KEY, pubKey = process.env.STRIPE_PUBLISHABLE_KEY, key = process.env.SUPABASE_SERVICE_KEY;
  if (!stripeKey || !pubKey) return L.json(500, { error: 'Payments are not configured' });
  if (!key) return L.json(500, { error: 'Server config error' });

  let body;
  try { body = JSON.parse(event.body); } catch { return L.json(400, { error: 'Invalid request' }); }
  const { bookingId, rooms, booker, acks } = body || {};
  if (!bookingId || !Array.isArray(rooms) || !booker) return L.json(400, { error: 'Missing details' });

  const name = String(booker.name || '').trim(), email = String(booker.email || '').trim(), phone = String(booker.phone || '').trim();
  if (name.split(/\s+/).filter(Boolean).length < 2) return L.json(400, { error: 'Please enter your full name (first and last).' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return L.json(400, { error: 'Please enter a valid email address.' });
  if (phone.replace(/\D/g, '').length < 7) return L.json(400, { error: 'Please enter your phone number.' });
  if (!acks || acks.cancellation !== true) return L.json(400, { error: 'Please agree to the cancellation policy.' });

  try {
    const found = await L.loadRetreat(key, bookingId);
    if (!found || !found.cfg || !found.cfg.enabled || found.bk.status === 'cancelled') return L.json(404, { error: 'This booking page is not open.' });
    const { bk, cfg } = found;
    if (!cfg.house || !cfg.house.on) return L.json(404, { error: 'Casa Master is not available for this retreat.' });
    const nights = L.nightsOf(bk);

    let priced;
    try { priced = H.priceSelection(cfg, nights, rooms); } catch (e) { return L.json(400, { error: e.message }); }

    const av = await H.houseAvailability(key, bk, cfg);
    if (!av.open) return L.json(409, { error: 'Casa Master is not available for this retreat.' });
    const takenNow = priced.rooms.filter((r) => av.taken[r.id]);
    if (takenNow.length) return L.json(409, { error: `Sorry, ${takenNow.map((r) => r.label).join(' and ')} ${takenNow.length > 1 ? 'were' : 'was'} just taken. Please choose another room.` });

    // Payment plan: pay everything now, or (when the retreat offers it) a percentage now and the balance charged automatically later
    const offer = L.depositOffer(bk, cfg);
    const plan = body.plan === 'deposit' ? 'deposit' : 'full';
    let dueNow = priced.total, balance = 0;
    if (plan === 'deposit') {
      if (!offer.on || !offer.eligible) return L.json(400, { error: 'The 50% payment option is not available for this booking. Please pay in full.' });
      if (acks.balanceAuth !== true) return L.json(400, { error: 'Please authorize the remaining balance to be charged to your card.' });
      const sp = L.splitPayment({ lines: [{ type: 'room', amount: priced.total }], total: priced.total }, offer.pct);
      dueNow = sp.dueNow; balance = sp.roomLater;
    }
    const amountCents = Math.round(dueNow * 100);
    if (amountCents < 50) return L.json(400, { error: 'Amount too small' });

    const title = cfg.title || bk.retreat_name || bk.leader_name || 'Retreat';
    const params = {
      amount: String(amountCents),
      currency: 'usd',
      receipt_email: email,
      description: `Amansala Tulum · ${title.slice(0, 80)} · Casa Master (${priced.rooms.length} room${priced.rooms.length > 1 ? 's' : ''})${plan === 'deposit' ? ' · 50% now' : ''} · ${bk.start_date} – ${bk.end_date}`.slice(0, 500),
      'metadata[source]': 'retreat_booking_house',
      'metadata[rbBookingId]': bk.id,
      'metadata[rbName]': name.slice(0, 120),
      'metadata[rbEmail]': email.slice(0, 200),
      'metadata[rbPhone]': phone.slice(0, 50),
      'metadata[rbRooms]': priced.rooms.map((r) => r.id).join(',').slice(0, 400),
      'metadata[rbTotal]': String(priced.total),
      'metadata[rbPlan]': plan,
    };
    if (plan === 'deposit') {
      const cust = await L.stripePost('/customers', { email, name, phone, 'metadata[rbBookingId]': bk.id });
      if (cust.error) return L.json(400, { error: cust.error.message || 'Could not set up the payment' });
      params.customer = cust.id;
      params.setup_future_usage = 'off_session';
      params['metadata[rbBalance]'] = String(balance);
      params['metadata[rbBalanceDate]'] = offer.balanceDate;
    }
    const pi = await L.stripePost('/payment_intents', params);
    if (pi.error) return L.json(400, { error: pi.error.message || 'Payment error' });

    const now = new Date().toISOString();
    const lineName = (r) => `Casa Master - ${r.label}${r.beds ? ' (' + r.beds + ')' : ''}: ${r.guestList.map((g) => g.name + (g.type === 'child' ? ` [child, ${g.age}]` : '')).join(', ')}${r.supplement ? ` - includes individual bed at ${money(r.supplement.nightlyRate)} per night` : ''}`;
    const lines = priced.rooms.map((r) => ({ type: 'room', rtId: r.id, name: lineName(r), guests: r.guests, perPerson: r2(r.total / r.guests), amount: r.total }));
    // Everything the guest saw and agreed to; the full room-by-room detail lives in 'rbhouse:<pi>'
    const agreements = [{ key: 'cancellation', text: L.AGREE_TEXT.cancellation, checked: true, at: now }];
    if (plan === 'deposit') agreements.push({ key: 'balance', text: `I authorize Amansala to charge the remaining balance of $${balance.toFixed(2)} to this card on ${offer.balanceDate}.`, checked: true, at: now });
    const h = event.headers || {};
    try {
      await L.appStoreSet(key, 'rbhouse:' + pi.id, {
        v: 1, piId: pi.id, bookingId: bk.id, createdAt: now, status: 'awaiting_payment',
        booker: { name, email, phone }, nights, plan, dueNow, balance, balanceDate: plan === 'deposit' ? offer.balanceDate : null,
        rooms: priced.rooms, total: priced.total, guests: priced.guests,
      });
      await L.appStoreSet(key, 'rbconsent:' + pi.id, {
        v: 1, piId: pi.id, createdAt: now, status: 'awaiting_payment',
        ip: L.clientIp(event), userAgent: String(h['user-agent'] || '').slice(0, 300),
        retreat: `${title} - Casa Master`, startDate: bk.start_date, endDate: bk.end_date, nights,
        guest: { name, email, phone, others: priced.rooms.flatMap((r) => r.guestList.map((g) => `${g.name}${g.type === 'child' ? ` (child, age ${g.age})` : ''}  |  ${r.label}`)) },
        leader: false, placementNotice: '',
        lines, total: priced.total, plan, dueNow, balance, balanceDate: plan === 'deposit' ? offer.balanceDate : null,
        policy: cfg.policy || L.DEFAULT_POLICY, agreements, included: cfg.includes || [], notIncluded: cfg.notIncluded || '',
      });
    } catch (e) {
      console.error('[retreat-booking-house-intent] could not save the booking record:', e.message);
      return L.json(500, { error: 'Could not start the payment. Please try again.' });
    }
    return L.json(200, { clientSecret: pi.client_secret, publishableKey: pubKey, amount: dueNow, plan, balance, balanceDate: plan === 'deposit' ? offer.balanceDate : null, total: priced.total, rooms: priced.rooms, recordUrl: L.recordUrl(pi.id) });
  } catch (e) {
    console.error('[retreat-booking-house-intent]', e.message);
    return L.json(400, { error: 'Could not start the payment. Please try again.' });
  }
};

function r2(n) { return Math.round(n * 100) / 100; }
