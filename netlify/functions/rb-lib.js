'use strict';
// Shared helpers for the Retreat Booking page (retreat-booking.html): reading a retreat's booking config, working out how many
// rooms / beds are free in its room block, and the ONE place the price is calculated (never trust the browser's number).
// Config lives in app_store key 'retreat_booking_config' = { <bookingId>: cfg }. See modules/retreat-booking-setup.js.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const CFG_KEY = 'retreat_booking_config';
const ORDERS_KEY = 'retreat_booking_orders';
const SPA_KEY = 'retreat_spa_requests';
const BAL_KEY = 'retreat_balance_schedule';

const TEMPLATE_KEY = 'retreat_booking_template';
// Starting point for every "We take payment" retreat page (same as modules/retreat-booking-setup.js RBS_DEFAULTS).
const DEFAULT_CFG = {
  title: 'Your Retreat Name', bannerUrl: '', taxFeePct: 19, gratuityPerNight: 30, teachingFee: { on: false, amountPP: 0 },
  deposit: { on: true, pct: 50, monthsBefore: 2 },
  includes: ['Accommodations for your full stay', 'All meals, with the exception of one offsite dinner', 'Group Salsa dance class', 'Cooking demonstration'],
  notIncluded: 'Not included: the one offsite dinner, tours and spa treatments.',
  rooms: [
    { rtId: 'rt1', kind: 'king', label: 'Beachfront King', soloRate: 575, shareRate: 360, desc: 'An ocean-facing king room steps from the sand, with morning light and a private terrace.', imageUrl: '/images/rooms/beachfront-deluxe.jpg', tags: ['King bed', 'Ocean view', 'Terrace'] },
    { rtId: 'rt2', kind: 'king', label: 'Superior King', soloRate: 475, shareRate: 305, desc: 'A spacious king room on the garden side with a generous bathroom and a quiet sitting corner.', imageUrl: '/images/rooms/superior.jpg', tags: ['King bed', 'Garden side', 'Sitting area'] },
    { rtId: 'rt3', kind: 'king', label: 'Garden Plus King', soloRate: 390, shareRate: 260, desc: 'A calm, more spacious garden room with a king bed, the simplest way to stay close to everything.', imageUrl: '/images/rooms/garden-plus-king.jpg', tags: ['King bed', 'Garden', 'Quiet', 'More space'] },
    { rtId: 'rt4', kind: 'king', label: 'Garden King', soloRate: 345, shareRate: 240, desc: 'A calm garden room with a king bed, the simplest way to stay close to everything.', imageUrl: '/images/rooms/garden-king.jpg', tags: ['King bed', 'Garden', 'Quiet'] },
    { rtId: 'rt5', kind: 'single', label: 'Garden Basic (private)', soloRate: 295, desc: 'A simple private room for one guest.', imageUrl: '/images/rooms/super-simple.jpg', tags: ['Private', 'One guest'] },
    { rtId: 'bd1', kind: 'twin', label: 'Double Beachview', shareRate: 335, maxBeds: 2, desc: 'A bright room with two queen beds, a terrace and ocean views. Book one bed to be matched with another guest, or both beds to share with a friend.', imageUrl: '/images/rooms/beachview-double.jpg', tags: ['Two queen beds', 'Beach view', 'Terrace', 'Private bathroom'] },
    { rtId: 'bd2', kind: 'twin', label: 'Double Room', shareRate: 275, maxBeds: 2, desc: 'A bright room with two queen beds. Book one bed to be matched with another guest, or both beds to share with a friend.', imageUrl: '/images/rooms/garden-double.jpg', tags: ['Two queen beds', 'Private bathroom', 'Garden side'] },
    { rtId: 'bd3', kind: 'twin', label: 'Triple Room', shareRate: 235, maxBeds: 3, desc: 'A roomy room with three queen beds, ideal for a group of friends. Book one bed, two or all three.', imageUrl: '/images/rooms/family-room.jpg', tags: ['Three queen beds', 'Private bathroom', 'Garden side'] },
  ],
  services: [],   // spa pre-booking is off by default; turn it on per retreat in Teacher Reg > We Take Payment
};

const DEFAULT_POLICY =
  'More than 6 weeks prior to the start date: two (2) nights will be charged according to the occupancy type booked.\n' +
  '6 weeks or less prior to the start date: non-refundable and non-transferable.';

function hdrs(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}
async function sget(key, path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: hdrs(key) });
  if (!r.ok) throw new Error(`supabase ${path.split('?')[0]} ${r.status}`);
  return r.json();
}
async function sreq(key, method, path, body, prefer) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...hdrs(key), ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`supabase ${method} ${path.split('?')[0]} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
}
async function appStoreGet(key, k) {
  const rows = await sget(key, `app_store?key=eq.${encodeURIComponent(k)}&select=value`);
  return rows[0] ? rows[0].value : null;
}
async function appStoreSet(key, k, value) {
  await sreq(key, 'POST', 'app_store?on_conflict=key', { key: k, value, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
}

async function loadRetreat(key, bookingId) {
  const bks = await sget(key, `bookings?id=eq.${encodeURIComponent(bookingId)}&select=id,leader_name,retreat_name,leader_email,start_date,end_date,status,blocked_rooms,cb_reservation_ids,cb_guest_ids`);
  const bk = bks[0];
  if (!bk) return null;
  const all = (await appStoreGet(key, CFG_KEY)) || {};
  return { bk, cfg: all[bookingId] || null };
}

function nightsOf(bk) {
  return Math.max(1, Math.round((new Date(bk.end_date + 'T12:00:00') - new Date(bk.start_date + 'T12:00:00')) / 86400000));
}

// Free rooms / beds of each configured room type inside this retreat's room block.
// A unit is free when its registration row has no named guest. Type membership comes from room_types.rooms.
// excludeHoldId: when fulfillment re-checks availability for the hold IT placed, pass that hold's id so its
// own held units don't count as "taken by someone else" and block it from using them.
async function availability(key, bk, cfg, excludeHoldId, prop) {
  const rts = await sget(key, 'room_types?select=id,rooms');
  const rtRooms = {};
  rts.forEach((t) => { rtRooms[t.id] = new Set(t.rooms || []); });
  const regs = await sget(key, `registrations?booking_id=eq.${encodeURIComponent(bk.id)}&select=id,room,room_type_id,guests,cancelled`);
  const taken = new Set();
  regs.forEach((r) => {
    if (r.cancelled) return;
    if ((r.guests || []).some((g) => g && g.name)) taken.add(r.room);
  });
  // Units another guest's checkout already has a short-lived hold on -- placed the moment
  // Stripe charges them (placeHold below), released as soon as rb-fulfil.js finishes with it,
  // otherwise left to expire on its own (HOLD_TTL_MIN). Without this, two guests paying within
  // the same few minutes for the last unit of a room type could both be charged for it (Jorge's
  // ask 2026-10-14: prevent that race instead of just emailing staff after the fact).
  const checkoutHeld = await activeHoldUnits(key, bk.id, excludeHoldId);
  const blocked = bk.blocked_rooms || [];
  const out = {};
  (cfg.rooms || []).forEach((rm) => {
    // Chica-only link: a retreat can list exactly which Chica rooms belong to each room type for that link (cfg.chicaUnits = { rtId: [units] }),
    // without touching the shared room types other retreats use. No list for this type = the shared room type's rooms.
    const own = prop === 'chica' && cfg.chicaUnits && Array.isArray(cfg.chicaUnits[rm.rtId]) ? new Set(cfg.chicaUnits[rm.rtId]) : null;
    const units = blocked.filter((room) => own ? own.has(room) : (rtRooms[rm.rtId] && rtRooms[rm.rtId].has(room)));
    // A room is only offered when Cloudbeds holds it for this retreat (the room has its placeholder reservation there), so the
    // page and the hotel inventory cannot disagree. Turn off per retreat with cfg.requireCloudbeds = false.
    const cbIds = bk.cb_reservation_ids || {};
    const held = cfg.requireCloudbeds === false ? units : units.filter((u) => cbIds[u]);
    out[rm.rtId] = { units, notHeld: units.length - held.length, free: held.filter((u) => !taken.has(u) && !checkoutHeld.has(u)) };
  });
  return out;
}

// ---- Short-lived unit holds, closing the "paid before a room was ever reserved" race ----
// A guest filling out their card can take minutes; without reserving the unit(s) the moment
// they start paying, a second guest could pick the same (last) unit and both get charged for
// it. placeHold is called right after retreat-booking-intent.js settles on which unit(s) a
// guest will get, tagged with a holdId carried in the PaymentIntent's metadata; rb-fulfil.js
// releases it once the booking is actually recorded (or abandoned), and availability() above
// always excludes any still-active hold so nobody else can choose the same unit meanwhile.
// Requires the `rb_holds` table (id, hold_id, booking_id, rt_id, unit, expires_at, created_at).
// Staff-editable in Admin > Settings (Jorge's ask 2026-10-15) -- this default is only
// used if that screen was never saved (app_store key 'portal_settings').
const HOLD_TTL_MIN_DEFAULT = 20;
async function holdTtlMinutes(key) {
  try {
    const rows = await sget(key, `app_store?key=eq.portal_settings&select=value`);
    const v = rows[0] && rows[0].value && rows[0].value.holdTtlMinutes;
    return (typeof v === 'number' && v > 0) ? v : HOLD_TTL_MIN_DEFAULT;
  } catch (e) { return HOLD_TTL_MIN_DEFAULT; }
}
async function activeHoldUnits(key, bookingId, excludeHoldId) {
  // Opportunistic cleanup -- correctness never depends on this running (every read here also
  // filters by expires_at), it just keeps the table from growing with dead rows forever.
  sreq(key, 'DELETE', `rb_holds?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, undefined, 'return=minimal').catch(() => {});
  let path = `rb_holds?booking_id=eq.${encodeURIComponent(bookingId)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=unit,hold_id`;
  const rows = await sget(key, path);
  const set = new Set();
  rows.forEach((r) => { if (r.hold_id !== excludeHoldId) set.add(r.unit); });
  return set;
}
async function placeHold(key, bookingId, rtId, units, holdId) {
  const ttl = await holdTtlMinutes(key);
  const expiresAt = new Date(Date.now() + ttl * 60000).toISOString();
  const rows = units.map((u) => ({ id: `${holdId}:${u}`, hold_id: holdId, booking_id: bookingId, rt_id: rtId, unit: u, expires_at: expiresAt }));
  await sreq(key, 'POST', 'rb_holds', rows, 'return=minimal');
}
async function releaseHold(key, holdId) {
  if (!holdId) return;
  try { await sreq(key, 'DELETE', `rb_holds?hold_id=eq.${encodeURIComponent(holdId)}`, undefined, 'return=minimal'); } catch (e) { /* expires on its own either way */ }
}

// Price of a cart, in dollars, from the saved config only.
//   cart.room    = { rtId, mode: 'share'|'solo'|'beds', beds }
//   cart.services = [{ id, m, q }]
function priceCart(cfg, nights, cart) {
  const taxFee = (Number(cfg.taxFeePct) || 0) / 100;
  const grat = Number(cfg.gratuityPerNight) || 0;
  const teach = cfg.teachingFee && cfg.teachingFee.on ? Number(cfg.teachingFee.amountPP) || 0 : 0;
  const lines = [];
  let total = 0;
  let guests = 0;
  if (cart.room) {
    const rm = (cfg.rooms || []).find((r) => r.rtId === cart.room.rtId);
    if (!rm) throw new Error('Room type not available');
    let rate, n;
    if (rm.kind === 'house') {
      // Whole house, flat nightly price. Booked by one person (the booker); gratuity is charged for the house's guest count.
      const hg = Math.max(1, Number(rm.houseGuests) || 1);
      if (!(Number(rm.houseRate) > 0)) throw new Error('This room option is not priced');
      const amount = Math.round(((Number(rm.houseRate) * nights + teach * hg) * (1 + taxFee) + grat * nights * hg) * 100) / 100;
      lines.push({ type: 'room', rtId: rm.rtId, name: rm.label, guests: 1, perPerson: amount, amount });
      total += amount;
      guests = 1;
    } else if (rm.kind === 'king' && cart.room.mode === 'trio' && Number(rm.extraGuestRate) > 0) {
      // King bed plus an individual bed: two guests at the shared rate, the third guest at the extra-guest rate
      const pp = (r) => Math.round(((r * nights + teach) * (1 + taxFee) + grat * nights) * 100) / 100;
      const amount = Math.round((pp(Number(rm.shareRate)) * 2 + pp(Number(rm.extraGuestRate))) * 100) / 100;
      lines.push({ type: 'room', rtId: rm.rtId, name: rm.label, guests: 3, perPerson: Math.round(amount / 3 * 100) / 100, amount });
      total += amount;
      guests = 3;
    } else if (rm.kind === 'king') {
      if (cart.room.mode === 'share') { rate = Number(rm.shareRate); n = 2; }
      else { rate = Number(rm.soloRate); n = 1; }
    } else if (rm.kind === 'twin') {
      rate = Number(rm.shareRate);
      n = Math.max(1, Math.min(Number(rm.maxBeds) || 2, parseInt(cart.room.beds, 10) || 1));
    } else { // single, private only
      rate = Number(rm.soloRate); n = 1;
    }
    if (rm.kind !== 'house' && !(rm.kind === 'king' && cart.room.mode === 'trio' && Number(rm.extraGuestRate) > 0)) {
      if (!(rate > 0)) throw new Error('This room option is not priced');
      const perPerson = Math.round(((rate * nights + teach) * (1 + taxFee) + grat * nights) * 100) / 100;
      lines.push({ type: 'room', rtId: rm.rtId, name: rm.label, guests: n, perPerson, amount: Math.round(perPerson * n * 100) / 100 });
      total += perPerson * n;
      guests = n;
    }
  }
  (cart.services || []).forEach((it) => {
    const sv = (cfg.services || []).find((s) => s.id === it.id);
    if (!sv) throw new Error('Service not available');
    const opt = (sv.opts || []).find((o) => Number(o.m) === Number(it.m));
    if (!opt) throw new Error('Service option not available');
    const q = Math.max(1, Math.min(4, parseInt(it.q, 10) || 1));
    const amount = Math.round(Number(opt.p) * q * 100) / 100;
    lines.push({ type: 'service', id: sv.id, name: sv.name, minutes: opt.m, qty: q, amount });
    total += amount;
  });
  total = Math.round(total * 100) / 100;
  return { lines, total, guests };
}

// Amansala Chica rooms are the CH... rooms (CH02, CH11, CH3a ...); the Casa properties (CSH-, CG-, C4-) are not Chica
function isChica(room) { return /^ch/i.test(String(room)) && !/^(csh|cg|c4)/i.test(String(room)); }

// Grande = the main Amansala property: regular rooms that are neither Chica (CH...) nor a Casa (CSH-, CG-, C4-)
function isGrande(room) { return !isChica(room) && !/^(csh|cg|c4)/i.test(String(room)); }

function baseOf(unit) { return String(unit).replace(/\s*-?\s*[a-z]$/i, ''); }
// Choose n free units, preferring beds of one room
function pickUnits(free, n) {
  if (free.length < n) return null;
  if (n === 1) return [free[0]];
  const groups = {};
  free.forEach((u) => { (groups[baseOf(u)] = groups[baseOf(u)] || []).push(u); });
  const best = Object.values(groups).filter((g) => g.length >= n).sort((a, b) => a.length - b.length)[0];
  return best ? best.slice(0, n) : free.slice(0, n);
}
// Room types whose Chica rooms are never sold to regular guests (only the Grande rooms of the retreat's block are offered; Chica ones
// stay for leaders). Override per room in the retreat's booking config with rooms[i].grandeOnly = true / false.
const GRANDE_ONLY_TYPES = ['rt1'];   // Beachfront King
// Property-only link (?p=chica): keep only that property's rooms in what availability() returned, so the page, the price check and the
// room assignment after payment all see the same smaller inventory. No prop = nothing changes.
function onlyProperty(av, prop) {
  if (prop !== 'chica') return av;
  const out = {};
  Object.keys(av || {}).forEach((k) => { const a = av[k]; out[k] = Object.assign({}, a, { units: (a.units || []).filter(isChica), free: (a.free || []).filter(isChica) }); });
  return out;
}
function grandeOnly(rm) { return rm && rm.grandeOnly !== undefined ? !!rm.grandeOnly : !!(rm && GRANDE_ONLY_TYPES.includes(rm.rtId)); }
// Leaders: Chica first, Grande when Chica is out of this room type. Everyone else: Grande first (keeps Chica free for leaders);
// for a Grande-only room type everyone else gets Grande rooms only.
function chooseUnits(free, n, isLeader, grandeOnlyType) {
  const chica = free.filter(isChica), grande = free.filter(isGrande);
  if (isLeader) {
    const c = pickUnits(chica, n); if (c) return { units: c, property: 'Chica' };
    const g = pickUnits(grande, n) || pickUnits(free, n); return g ? { units: g, property: 'Grande' } : { units: null, property: '' };
  }
  if (grandeOnlyType) return { units: pickUnits(grande, n), property: '' };
  const u = pickUnits(grande, n) || pickUnits(chica, n) || pickUnits(free, n);
  return { units: u, property: '' };
}

// ---- Cloudbeds (through the portal's own cloudbeds function) ----
async function cbCall(action, body, ms) {
  const base = process.env.URL || 'https://amansalaportal.com';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 12000);
  try {
    const r = await fetch(`${base}/.netlify/functions/cloudbeds?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: ctrl.signal });
    return await r.json();
  } finally { clearTimeout(t); }
}
// Live check that Cloudbeds still holds each room's placeholder reservation. Returns the units that are confirmed gone
// (cancelled/missing). A Cloudbeds outage or timeout never blocks a guest: unknown counts as fine.
async function cbGone(bk, units) {
  const ids = bk.cb_reservation_ids || {};
  const gone = [];
  await Promise.all(units.map(async (u) => {
    if (!ids[u]) return;
    try { const r = await cbCall('checkReservation', { reservationId: ids[u] }, 9000); if (r && r.active === false) gone.push(u); }
    catch (e) { /* unknown: allow */ }
  }));
  return gone;
}

// ---- 50% now, balance auto-charged later ----
// cfg.deposit = { on, pct (default 50), monthsBefore (default 2) }. Offered only when the balance date is still at least a week away;
// otherwise the guest pays in full. Spa services are always paid in full today; the split applies to the room amount.
function balanceDateOf(bk, cfg) {
  const months = Number(cfg.deposit && cfg.deposit.monthsBefore) || 2;
  const d = new Date(bk.start_date + 'T12:00:00');
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}
function depositOffer(bk, cfg, todayStr) {
  const dep = cfg.deposit || {};
  if (!dep.on) return { on: false };
  const balanceDate = balanceDateOf(bk, cfg);
  const today = todayStr || new Date().toISOString().slice(0, 10);
  const minDate = new Date(today + 'T12:00:00'); minDate.setDate(minDate.getDate() + 7);
  const eligible = balanceDate >= minDate.toISOString().slice(0, 10);
  return { on: true, eligible, pct: Number(dep.pct) || 50, monthsBefore: Number(dep.monthsBefore) || 2, balanceDate };
}
function splitPayment(priced, pct) {
  const room = priced.lines.filter((l) => l.type === 'room').reduce((a, l) => a + l.amount, 0);
  const svc = priced.lines.filter((l) => l.type === 'service').reduce((a, l) => a + l.amount, 0);
  const roomNow = Math.round(room * pct) / 100;
  const roomLater = Math.round((room - roomNow) * 100) / 100;
  return { roomNow, roomLater, svc, dueNow: Math.round((roomNow + svc) * 100) / 100 };
}
async function stripePost(path, params, idemKey) {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20', ...(idemKey ? { 'Idempotency-Key': idemKey } : {}) },
    body: new URLSearchParams(params).toString(),
  });
  return r.json();
}

// ---- consent record + signed record link ----
// The exact wording of every box a guest can tick (must match retreat-booking.html). A copy of the wording, the time, IP address
// and browser is stored for every booking (app_store key 'rbconsent:<paymentIntentId>') and printed on the booking record PDF.
const AGREE_TEXT = {
  cancellation: 'I have read and agree to the cancellation policy.',
  roommate: 'I agree that if there is no one to match me up with, I will pay the fee of a private room and will be moved to a garden room with a king or queen bed, and there will be a fee.',
  roommateNotice: 'Please note: if we cannot match you up with anyone, you will be required to pay an upgrade fee to have a private room. Someone from our team will reach out 8 weeks prior to your booking if we cannot match you up.',
  leader: 'I am a leader. Leaders are placed at Amansala Chica.',
  shareFriend: "I'm travelling with a friend and would like to share a room with them. (Your friend must also book a shared room.)",
  shareAlone: "I'm travelling alone and agree to be matched with another guest of the same gender. If no suitable roommate is available, I agree to pay the additional cost for a private room.",
  king: 'Sharing a king bed? Please book together. Both guests must be included in one reservation, with payment made using a single credit card. Individual spaces in a king bed cannot be booked separately.',
};
const crypto = require('crypto');
function sign(piId) { return crypto.createHmac('sha256', process.env.SUPABASE_SERVICE_KEY || 'x').update(String(piId)).digest('hex').slice(0, 32); }
function recordUrl(piId) {
  const base = process.env.URL || 'https://amansalaportal.com';
  return `${base}/.netlify/functions/retreat-booking-record?pi=${encodeURIComponent(piId)}&k=${sign(piId)}`;
}
function clientIp(event) {
  const h = event.headers || {};
  return h['x-nf-client-connection-ip'] || h['client-ip'] || String(h['x-forwarded-for'] || '').split(',')[0].trim() || '';
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function json(code, body) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

// Open dates for the regular rooms (cfg.openDatesRooms): the guest picks check-in / check-out; nights outside the retreat are extra nights at the
// same rates (all meals included). Returns { checkIn, checkOut, nights, custom } or null when the dates are not allowed.
function stayRange(cfg, bk, ci, co) {
  const retreat = { checkIn: bk.start_date, checkOut: bk.end_date, nights: nightsOf(bk), custom: false };
  if (!cfg.openDatesRooms || !ci || !co) return retreat;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(ci) || !re.test(co)) return null;
  const nights = Math.round((new Date(co + 'T12:00:00') - new Date(ci + 'T12:00:00')) / 86400000);
  if (!(nights >= 1) || nights > 60) return null;
  if (ci < new Date().toISOString().slice(0, 10)) return null;
  return { checkIn: ci, checkOut: co, nights, custom: ci !== bk.start_date || co !== bk.end_date };
}
// Take out of the free rooms any room another group / reservation holds on the nights the guest chose
async function applyStayAvailability(key, bk, av, range) {
  if (!range || !range.custom) return av;
  const others = await sget(key, `bookings?id=neq.${encodeURIComponent(bk.id)}&status=neq.cancelled&start_date=lt.${range.checkOut}&end_date=gt.${range.checkIn}&select=blocked_rooms`);
  const busy = new Set(); others.forEach((o) => (o.blocked_rooms || []).forEach((u) => busy.add(u)));
  Object.values(av).forEach((x) => { x.free = x.free.filter((u) => !busy.has(u)); });
  return av;
}

module.exports = { onlyProperty, stayRange, applyStayAvailability, grandeOnly, AGREE_TEXT, sign, recordUrl, clientIp, BAL_KEY, balanceDateOf, depositOffer, splitPayment, stripePost, TEMPLATE_KEY, DEFAULT_CFG, pickUnits, chooseUnits, cbCall, cbGone, isChica, isGrande, SUPABASE_URL, CFG_KEY, ORDERS_KEY, SPA_KEY, DEFAULT_POLICY, sget, sreq, appStoreGet, appStoreSet, loadRetreat, nightsOf, availability, priceCart, cors, json, placeHold, releaseHold, activeHoldUnits };
