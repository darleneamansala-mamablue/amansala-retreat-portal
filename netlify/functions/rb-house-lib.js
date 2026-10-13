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

// The house is only offered when its unit (default "Casa Master") is blocked for this retreat and held in Cloudbeds;
// a room is free until a paid order has taken it.
async function houseAvailability(key, bk, cfg) {
  const house = cfg.house;
  const out = { open: false, taken: {} };
  if (!house || !house.on) return out;
  const unit = house.unit || 'Casa Master';
  const blocked = (bk.blocked_rooms || []).includes(unit);
  const held = cfg.requireCloudbeds === false ? blocked : blocked && !!(bk.cb_reservation_ids || {})[unit];
  out.open = held;
  const all = (await L.appStoreGet(key, HOUSE_ROOMS_KEY)) || {};
  out.taken = all[bk.id] || {};
  return out;
}

module.exports = { HOUSE_ROOMS_KEY, occupancyOptions, capacity, checkSelection, priceRoom, priceSelection, houseAvailability };
