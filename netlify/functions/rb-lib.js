'use strict';
// Shared helpers for the Retreat Booking page (retreat-booking.html): reading a retreat's booking config, working out how many
// rooms / beds are free in its room block, and the ONE place the price is calculated (never trust the browser's number).
// Config lives in app_store key 'retreat_booking_config' = { <bookingId>: cfg }. See modules/retreat-booking-setup.js.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const CFG_KEY = 'retreat_booking_config';
const ORDERS_KEY = 'retreat_booking_orders';
const SPA_KEY = 'retreat_spa_requests';

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
  const bks = await sget(key, `bookings?id=eq.${encodeURIComponent(bookingId)}&select=id,leader_name,retreat_name,leader_email,start_date,end_date,status,blocked_rooms`);
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
async function availability(key, bk, cfg) {
  const rts = await sget(key, 'room_types?select=id,rooms');
  const rtRooms = {};
  rts.forEach((t) => { rtRooms[t.id] = new Set(t.rooms || []); });
  const regs = await sget(key, `registrations?booking_id=eq.${encodeURIComponent(bk.id)}&select=id,room,room_type_id,guests,cancelled`);
  const taken = new Set();
  regs.forEach((r) => {
    if (r.cancelled) return;
    if ((r.guests || []).some((g) => g && g.name)) taken.add(r.room);
  });
  const blocked = bk.blocked_rooms || [];
  const out = {};
  (cfg.rooms || []).forEach((rm) => {
    const units = blocked.filter((room) => rtRooms[rm.rtId] && rtRooms[rm.rtId].has(room));
    out[rm.rtId] = { units, free: units.filter((u) => !taken.has(u)) };
  });
  return out;
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
    if (rm.kind === 'king') {
      if (cart.room.mode === 'share') { rate = Number(rm.shareRate); n = 2; }
      else { rate = Number(rm.soloRate); n = 1; }
    } else if (rm.kind === 'twin') {
      rate = Number(rm.shareRate);
      n = Math.max(1, Math.min(Number(rm.maxBeds) || 2, parseInt(cart.room.beds, 10) || 1));
    } else { // single, private only
      rate = Number(rm.soloRate); n = 1;
    }
    if (!(rate > 0)) throw new Error('This room option is not priced');
    const perPerson = Math.round(((rate * nights + teach) * (1 + taxFee) + grat * nights) * 100) / 100;
    lines.push({ type: 'room', rtId: rm.rtId, name: rm.label, guests: n, perPerson, amount: Math.round(perPerson * n * 100) / 100 });
    total += perPerson * n;
    guests = n;
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

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}
function json(code, body) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

module.exports = { isChica, isGrande, SUPABASE_URL, CFG_KEY, ORDERS_KEY, SPA_KEY, DEFAULT_POLICY, sget, sreq, appStoreGet, appStoreSet, loadRetreat, nightsOf, availability, priceCart, cors, json };
