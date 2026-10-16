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
    const range = L.stayRange(cfg, bk, body.dates && body.dates.checkIn, body.dates && body.dates.checkOut);
    if (!range) return L.json(400, { error: 'Please choose valid check-in and check-out dates (check-out after check-in, not in the past).' });
    const nights = range.nights;
    const rm = (cfg.rooms || []).find((r) => r.rtId === cart.room.rtId);
    if (!rm) return L.json(400, { error: 'That room is not available.' });

    const priced = L.priceCart(cfg, nights, cart);
    const needed = rm.kind === 'twin' ? priced.guests : 1;
    // Everyone sharing the booking is named (both guests in one reservation); the booker is guest 1
    // Every other guest must have a full name, an email and a phone number (needed for the room list, Cloudbeds and their own confirmation)
    const others = (Array.isArray(guest.others) ? guest.others : []).map((o) => ({
      name: String((o && o.name) || '').trim().slice(0, 100), email: String((o && o.email) || '').trim().slice(0, 150), phone: String((o && o.phone) || '').trim().slice(0, 40),
    }));
    if (others.length !== priced.guests - 1) return L.json(400, { error: priced.guests > 1 ? 'Please enter the details of the other guest' + (priced.guests > 2 ? 's' : '') + '.' : 'Unexpected guests' });
    for (const o of others) {
      if (o.name.split(/\s+/).filter(Boolean).length < 2) return L.json(400, { error: 'Please enter the full name (first and last) of every guest.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) return L.json(400, { error: 'Please enter a valid email address for every guest.' });
      if (o.phone.replace(/\D/g, '').length < 7) return L.json(400, { error: 'Please enter a phone number for every guest.' });
    }
    // A shared room (double / triple) that the guest's own party does not fill: they say whether they travel with a friend (named; the
    // friend books their own bed) or alone (matched with a guest of the same gender, agreeing to pay for a private room if no match).
    const sharedOpen = rm.kind === 'twin' && priced.guests < (Number(rm.maxBeds) || 2);
    const shareChoice = sharedOpen ? String(acks.shareChoice || '') : '';
    const friendName = sharedOpen ? String(acks.friendName || '').trim().slice(0, 100) : '';
    if (sharedOpen) {
      if (shareChoice !== 'friend' && shareChoice !== 'alone') return L.json(400, { error: 'Please tell us whether you are sharing the room with a friend or travelling alone.' });
      if (shareChoice === 'friend' && friendName.split(/\s+/).filter(Boolean).length < 2) return L.json(400, { error: "Please enter your friend's first and last name." });
      if (shareChoice === 'alone' && acks.roommate !== true) return L.json(400, { error: 'Please read and agree to the roommate terms.' });
    }

    const prop = body.prop === 'chica' ? 'chica' : '';
    const av = L.onlyProperty(await L.applyStayAvailability(key, bk, await L.availability(key, bk, cfg, undefined, prop), range), prop);
    const isLeader = acks.leader === true;
    // Pick the room(s) the guest would get (leaders: Chica, else Grande; others: Grande first), then confirm with Cloudbeds that
    // each is still held. A room Cloudbeds says is gone is dropped and the next one is tried.
    let freeList = (av[rm.rtId] || { free: [] }).free.slice();
    const gOnly = L.grandeOnly(rm) && !prop;
    let choice = L.chooseUnits(freeList, needed, isLeader, gOnly);
    for (let tries = 0; tries < 4 && choice.units; tries++) {
      const gone = await L.cbGone(bk, choice.units);
      if (!gone.length) break;
      freeList = freeList.filter((u) => !gone.includes(u));
      choice = L.chooseUnits(freeList, needed, isLeader, gOnly);
    }
    if (!choice.units) return L.json(409, { error: isLeader ? 'Sorry, that room type is sold out. Please choose another room type.' : 'Sorry, that room was just taken. Please choose another option.' });
    const leaderPlacement = isLeader ? choice.property.toLowerCase() : null;

    // Reserve these exact unit(s) for the next HOLD_TTL_MIN minutes (comfortably longer than
    // filling out a card) so nobody else's availability check can pick them while this guest is
    // mid-payment -- the race this whole flow used to leave open (Jorge's ask 2026-10-14):
    // the room was only ever re-checked, never actually reserved, between intent and fulfillment.
    const holdId = 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await L.placeHold(key, bk.id, rm.rtId, choice.units, holdId);

    // Payment plan: pay everything now, or (when the retreat offers it) 50% now and the balance charged automatically on the
    // balance date to the card saved with this payment. Spa services are paid in full now.
    const offer = L.depositOffer(bk, cfg);
    const plan = body.plan === 'deposit' ? 'deposit' : 'full';
    let dueNow = priced.total, balance = 0;
    if (plan === 'deposit') {
      if (!offer.on || !offer.eligible) return L.json(400, { error: 'The 50% payment option is not available for this booking. Please pay in full.' });
      if (acks.balanceAuth !== true) return L.json(400, { error: 'Please authorize the remaining balance to be charged to your card.' });
      const sp = L.splitPayment(priced, offer.pct);
      dueNow = sp.dueNow; balance = sp.roomLater;
    }
    const amountCents = Math.round(dueNow * 100);
    if (amountCents < 50) return L.json(400, { error: 'Amount too small' });

    const roomLine = priced.lines.find((l) => l.type === 'room');
    const svcCompact = JSON.stringify((cart.services || []).map((s) => [s.id, Number(s.m), Math.max(1, Math.min(4, parseInt(s.q, 10) || 1))]));
    const params = {
      amount: String(amountCents),
      currency: 'usd',
      receipt_email: email,
      description: `Amansala Tulum · ${(cfg.title || bk.retreat_name || bk.leader_name || 'Retreat').slice(0, 80)} · ${roomLine.name}${plan === 'deposit' ? ' · 50% now' : ''} · ${range.checkIn} – ${range.checkOut}`.slice(0, 500),
      'metadata[source]': 'retreat_booking',
      'metadata[rbBookingId]': bk.id,
      'metadata[rbRoom]': JSON.stringify({ rtId: rm.rtId, mode: cart.room.mode || '', beds: priced.guests }).slice(0, 400),
      'metadata[rbSvc]': svcCompact.slice(0, 480),
      'metadata[rbName]': name.slice(0, 120),
      'metadata[rbEmail]': email.slice(0, 200),
      'metadata[rbPhone]': phone.slice(0, 50),
      'metadata[rbOthers]': JSON.stringify(others).slice(0, 480),
      'metadata[rbShare]': shareChoice ? (shareChoice === 'friend' ? 'friend:' + friendName : 'alone') : '',
      'metadata[rbAck]': `cancel=1${shareChoice === 'alone' && acks.roommate === true ? ';roommate=1' : ''}${isLeader ? ';leader=1' : ''}${plan === 'deposit' ? ';balanceauth=1' : ''}`,
      'metadata[rbTotal]': String(priced.total),
      'metadata[rbPlan]': plan,
      'metadata[rbDates]': `${range.checkIn}_${range.checkOut}`,
      'metadata[rbHoldId]': holdId,
      'metadata[rbProp]': prop,
    };
    if (plan === 'deposit') {
      // a Stripe customer + saving the card for later charges (off session), with the guest's explicit authorization
      const cust = await L.stripePost('/customers', { email, name, phone, 'metadata[rbBookingId]': bk.id });
      if (cust.error) { await L.releaseHold(key, holdId); return L.json(400, { error: cust.error.message || 'Could not set up the payment' }); }
      params.customer = cust.id;
      params.setup_future_usage = 'off_session';
      params['metadata[rbBalance]'] = String(balance);
      params['metadata[rbBalanceDate]'] = offer.balanceDate;
    }
    const pi = await L.stripePost('/payment_intents', params);
    if (pi.error) { await L.releaseHold(key, holdId); return L.json(400, { error: pi.error.message || 'Payment error' }); }

    // Proof of what this guest saw and agreed to, kept for the booking record PDF and in case of a dispute
    try {
      const now = new Date().toISOString();
      const agreements = [{ key: 'cancellation', text: L.AGREE_TEXT.cancellation, checked: true, at: now }];
      if (rm.kind === 'king' && priced.guests === 2) agreements.push({ key: 'king', text: L.AGREE_TEXT.king, checked: true, at: now, note: 'Shown on the room and in the cart (information)' });
      if (shareChoice === 'friend') agreements.push({ key: 'shareFriend', text: L.AGREE_TEXT.shareFriend, checked: true, at: now, note: `Friend's full name entered: ${friendName}` });
      if (shareChoice === 'alone') agreements.push({ key: 'shareAlone', text: L.AGREE_TEXT.shareAlone, checked: true, at: now });
      if (shareChoice === 'alone' && acks.roommate === true) agreements.push({ key: 'roommate', text: L.AGREE_TEXT.roommate, checked: true, at: now, shownNotice: L.AGREE_TEXT.roommateNotice });
      if (isLeader) agreements.push({ key: 'leader', text: L.AGREE_TEXT.leader, checked: true, at: now });
      if (plan === 'deposit') agreements.push({ key: 'balance', text: `I authorize Amansala to charge the remaining balance of $${balance.toFixed(2)} to this card on ${offer.balanceDate}.`, checked: true, at: now });
      const h = event.headers || {};
      await L.appStoreSet(key, 'rbconsent:' + pi.id, {
        v: 1, piId: pi.id, createdAt: now, status: 'awaiting_payment',
        ip: L.clientIp(event), userAgent: String(h['user-agent'] || '').slice(0, 300),
        retreat: cfg.title || bk.retreat_name || bk.leader_name, startDate: range.checkIn, endDate: range.checkOut, nights, stay: range,
        guest: { name, email, phone, others }, leader: isLeader, placementNotice: leaderPlacement === 'grande' ? 'Chica was out of this room type: leader placed at Grande' : '',
        lines: priced.lines, total: priced.total, plan, dueNow, balance, balanceDate: plan === 'deposit' ? offer.balanceDate : null,
        policy: cfg.policy || L.DEFAULT_POLICY, agreements, included: cfg.includes || [], notIncluded: cfg.notIncluded || '',
      });
    } catch (e) { console.warn('[retreat-booking-intent] consent record not saved:', e.message); }
    return L.json(200, { clientSecret: pi.client_secret, publishableKey: pubKey, amount: dueNow, plan, balance, balanceDate: plan === 'deposit' ? offer.balanceDate : null, total: priced.total, lines: priced.lines, leaderPlacement, recordUrl: L.recordUrl(pi.id) });
  } catch (e) {
    console.error('[retreat-booking-intent]', e.message);
    return L.json(400, { error: e.message && /not (priced|available)/.test(e.message) ? e.message : 'Could not start the payment. Please try again.' });
  }
};
