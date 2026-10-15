'use strict';
// Casa Master (house) rooms on the Retreat Booking page. Separate from rb-lib.js on purpose: the single-room checkout is not touched.
// Config lives in the retreat's booking config: cfg.house = { on, label, intro, unit, rooms: [ ... ] }, one entry per bedroom:
//   { id, label, beds, desc, images[], kind: 'single'|'twin'|'king'|'kingx', soloRate, shareRate, extraRate, max, note }
//   single: private only (1 guest at soloRate)               twin: exactly 2 guests, shareRate each
//   king:   1 guest at soloRate, or 2 sharing at shareRate   kingx: as king, plus a 3rd guest on the individual bed at extraRate
// Price per room = (room charges + teaching fee) x (1 + tax) + gratuity per guest per night, calculated here and nowhere else.
const L = require('./rb-lib');

const HOUSE_ROOMS_KEY = 'retreat_house_rooms';   // { [bookingId]: { [roomId]: { piId, at } } }  rooms already sold
const r2 = (n) => Math.round(n * 100) / 100;

// Which house a request is about: the retreat's main house (cfg.house, Casa Master) or one of cfg.houses[] (e.g. Casita 4, id 'casita4').
// Returns a copy of cfg whose .house is that house, so every function below works unchanged; null when the id is unknown.
function cfgFor(cfg, houseId) {
  if (!houseId) return cfg;
  const h = (cfg.houses || []).find((x) => x.id === houseId);
  return h ? { ...cfg, house: h } : null;
}

function occupancyOptions(room) {
  if (room.kind === 'single') return [1];
  if (room.kind === 'twin') return [2];
  if (room.kind === 'kingx') return [1, 2, 3];
  return [1, 2];
}
function capacity(room) { return Math.max(...occupancyOptions(room)); }

// Validates one selected room and its guests. Returns { room, n, guests } or throws an Error with a guest-friendly message.
function checkSelection(cfg, sel) {
  const house = cfg.house;
  const room = house && (house.rooms || []).find((r) => r.id === String(sel && sel.id));
  if (!room) throw new Error('One of the rooms you chose is not available.');
  const raw = Array.isArray(sel.guests) ? sel.guests : [];
  const n = raw.length;
  if (!occupancyOptions(room).includes(n)) {
    throw new Error(room.kind === 'twin' ? `${room.label} is booked for two guests.` : `${room.label} sleeps up to ${capacity(room)} guest${capacity(room) > 1 ? "s" : ""}.`);
  }
  const guests = raw.map((g) => {
    const name = String((g && g.name) || '').trim().slice(0, 100);
    const type = g && g.type === 'child' ? 'child' : 'adult';
    const age = type === 'child' ? parseInt(g.age, 10) : null;
    if (name.split(/\s+/).filter(Boolean).length < 2) throw new Error(`Please enter the full name (first and last) of every guest in ${room.label}.`);
    if (type === 'child' && !(age >= 0 && age <= 17)) throw new Error(`Please enter the age of each child in ${room.label}.`);
    return { name, type, age };
  });
  if (!guests.some((g) => g.type === 'adult')) throw new Error(`${room.label} needs at least one adult.`);
  return { room, n, guests };
}

// Price of one room for n guests. Third guest in a kingx room uses the individual bed (extraRate); nobody else pays it.
function priceRoom(cfg, nights, room, n) {
  const taxFee = (Number(cfg.taxFeePct) || 0) / 100;
  const grat = Number(cfg.gratuityPerNight) || 0;
  const teach = cfg.teachingFee && cfg.teachingFee.on ? Number(cfg.teachingFee.amountPP) || 0 : 0;
  const parts = [];                                   // [{ label, guests, rate }]
  if (room.kind === 'single') parts.push({ label: 'private', guests: 1, rate: Number(room.soloRate) });
  else if (room.kind === 'twin') parts.push({ label: 'sharing', guests: 2, rate: Number(room.shareRate) });
  else if (n === 1) parts.push({ label: 'private', guests: 1, rate: Number(room.soloRate) });
  else parts.push({ label: 'sharing the king bed', guests: 2, rate: Number(room.shareRate) });
  let supplement = null;
  if (room.kind === 'kingx' && n === 3) supplement = { label: 'individual bed', rate: Number(room.extraRate) };
  if (parts.some((p) => !(p.rate > 0)) || (supplement && !(supplement.rate > 0))) throw new Error('This room is not priced yet.');
  let roomCharges = 0;
  parts.forEach((p) => { roomCharges += p.rate * nights * p.guests; });
  const baseRate = parts[0].rate;
  let supplementAmount = 0;
  if (supplement) { supplementAmount = supplement.rate * nights; roomCharges += supplementAmount; }
  const teaching = teach * n;
  const taxable = roomCharges + teaching;
  const taxes = r2(taxable * taxFee);
  const gratuity = r2(grat * nights * n);
  const total = r2(taxable + taxes + gratuity);
  return {
    nights, guests: n, rateLabel: parts[0].label, nightlyRate: baseRate,
    supplement: supplement ? { label: supplement.label, nightlyRate: supplement.rate, amount: r2(supplementAmount) } : null,
    roomSubtotal: r2(roomCharges), teaching: r2(teaching), taxes, gratuity, total,
  };
}

// Prices a whole selection: [{ id, guests:[{name,type,age}] }] -> { rooms:[line], total, guests }
function priceSelection(cfg, nights, selections) {
  if (!Array.isArray(selections) || !selections.length) throw new Error('Please choose at least one room.');
  if (selections.length > 12) throw new Error('Too many rooms selected.');
  const seen = new Set();
  const rooms = selections.map((s) => {
    const { room, n, guests } = checkSelection(cfg, s);
    if (seen.has(room.id)) throw new Error(`${room.label} was chosen twice.`);
    seen.add(room.id);
    const p = priceRoom(cfg, nights, room, n);
    return { id: room.id, label: room.label, beds: room.beds || '', guestList: guests, ...p };
  });
  const total = r2(rooms.reduce((a, r) => a + r.total, 0));
  return { rooms, total, guests: rooms.reduce((a, r) => a + r.guests, 0) };
}

// A house bedroom is bookable when EVERY real room (unit) it maps to is blocked for this retreat, held in Cloudbeds, has no named guest
// yet, and has not been sold through this page. cfg.house.rooms[i].units = the room names in the room list (e.g. 'Queen Downstairs A').
// A bedroom without units falls back to the old rule: the whole 'Casa Master' unit is blocked and held for the retreat.
// Open dates (cfg.house.openDates): the guest picks check-in / check-out; anything outside the retreat dates is an extra night at the same
// rates (meals included). Returns { checkIn, checkOut, nights, custom } or null when the dates are not valid / not allowed.
function parseRange(cfg, bk, ci, co) {
  const house = cfg.house || {};
  const retreat = { checkIn: bk.start_date, checkOut: bk.end_date, nights: L.nightsOf(bk), custom: false };
  if (!house.openDates || !ci || !co) return retreat;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(ci) || !re.test(co)) return null;
  const a = new Date(ci + 'T12:00:00'), b = new Date(co + 'T12:00:00');
  const nights = Math.round((b - a) / 86400000);
  if (!(nights >= 1) || nights > 60) return null;
  if (ci < new Date().toISOString().slice(0, 10)) return null;
  return { checkIn: ci, checkOut: co, nights, custom: ci !== bk.start_date || co !== bk.end_date };
}

// excludeHoldId: pass the caller's own hold id when it's re-checking availability for a
// selection it already placed a hold on, so that hold doesn't count as "someone else has it".
async function houseAvailability(key, bk, cfg, range, excludeHoldId) {
  const house = cfg.house;
  const out = { open: false, taken: {}, rooms: {} };
  if (!house || !house.on) return out;
  out.open = true;
  const blocked = new Set(bk.blocked_rooms || []);
  const cb = bk.cb_reservation_ids || {};
  const heldOk = (u) => cfg.requireCloudbeds === false || !!cb[u];
  const all = (await L.appStoreGet(key, HOUSE_ROOMS_KEY)) || {};
  out.taken = all[bk.id] || {};
  const regs = await L.sget(key, `registrations?booking_id=eq.${encodeURIComponent(bk.id)}&select=room,guests,cancelled`);
  const named = new Set();
  regs.forEach((r) => { if (!r.cancelled && (r.guests || []).some((g) => g && g.name)) named.add(r.room); });
  // A bedroom someone else is actively mid-checkout for (placed in retreat-booking-house-intent.js
  // the moment Stripe charges them) is reserved the same way a single-room checkout's unit is --
  // shares rb_holds with the single-room flow (bedroom ids like "cm-gd" never collide with real
  // room codes like "19a", so this is safe without a separate table). Jorge's ask 2026-10-14:
  // prevent two guests paying for the same Casa Master bedroom at once, same as the single rooms.
  const checkoutHeld = await L.activeHoldUnits(key, bk.id, excludeHoldId);
  const unit = house.unit || 'Casa Master';
  (house.rooms || []).forEach((r) => {
    const units = Array.isArray(r.units) ? r.units : [];
    let free, reason = '';
    if (out.taken[r.id]) { free = false; reason = 'sold'; }
    else if (checkoutHeld.has(r.id)) { free = false; reason = 'being booked by someone else right now'; }
    else if (units.length) {
      const notBlocked = units.filter((u) => !blocked.has(u));
      const notHeld = units.filter((u) => blocked.has(u) && !heldOk(u));
      const hasGuest = units.filter((u) => named.has(u));
      free = !notBlocked.length && !notHeld.length && !hasGuest.length;
      reason = notBlocked.length ? 'not in the retreat room list' : notHeld.length ? 'not held in Cloudbeds' : hasGuest.length ? 'already has a guest' : '';
    } else { free = blocked.has(unit) && heldOk(unit); reason = free ? '' : 'not in the retreat room list'; }
    out.rooms[r.id] = { free, reason, units };
  });
  // Open dates: the units must also be free of other retreats / reservations on the nights the guest chose
  if (range && house.openDates && range.custom) {
    const others = await L.sget(key, `bookings?id=neq.${encodeURIComponent(bk.id)}&status=neq.cancelled&start_date=lt.${range.checkOut}&end_date=gt.${range.checkIn}&select=blocked_rooms`);
    const busy = new Set(); others.forEach((o) => (o.blocked_rooms || []).forEach((u) => busy.add(u)));
    (house.rooms || []).forEach((r) => {
      const x = out.rooms[r.id]; if (!x || !x.free) return;
      const clash = (x.units && x.units.length ? x.units : [house.unit || 'Casa Master']).filter((u) => busy.has(u));
      if (clash.length) { x.free = false; x.reason = 'booked by another group on those dates'; }
    });
  }
  // Whole house only (cfg.house.wholeHouseOnly): the house is offered only when EVERY bedroom is available; one missing room hides all
  out.whole = !!house.wholeHouseOnly;
  if (house.wholeHouseOnly && Object.values(out.rooms).some((x) => !x.free)) {
    Object.values(out.rooms).forEach((x) => { x.free = false; x.reason = x.reason || ((house.label || 'This house') + ' is booked as a whole house and is not fully available'); });
  }
  return out;
}

// Whole-house rule: the selection must contain every bedroom of the house
function missingRooms(cfg, selections) {
  const have = new Set((selections || []).map((s) => String(s && s.id)));
  return ((cfg.house && cfg.house.rooms) || []).filter((r) => !have.has(r.id));
}

module.exports = { cfgFor, parseRange, missingRooms, HOUSE_ROOMS_KEY, occupancyOptions, capacity, checkSelection, priceRoom, priceSelection, houseAvailability };
