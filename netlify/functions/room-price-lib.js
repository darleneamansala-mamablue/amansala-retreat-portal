'use strict';
// Shared helpers for the Revenue Manager ("our Room Price Genie" -- Jorge's ask 2026-10-17):
// a self-built, RoomPriceGenie-style dynamic pricing tool for Amansala's transient/direct
// ("Escape") room inventory. See revenue-manager.html + room-price-settings.js +
// room-price-apply.js + room-price-recalc.js. Plan: /Users/jcanales/.claude/plans/buzzing-gathering-taco.md
//
// Mirrors the SAME tables the live Escape booking engine already reads (get-rates.js,
// get-availability.js) -- this tool is a second writer into `be_rates`, not a parallel
// pricing system. `be_rates` is empty today; the first row this tool writes is also the
// first manual override Escape has ever had.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const SETTINGS_KEY = 'room_price_genie_settings';
const LOG_KEY = 'room_price_genie_log';
const RECS_KEY = 'room_price_genie_recommendations';

function hdrs(key) { return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }; }

async function sget(key, path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: hdrs(key) });
  if (!r.ok) throw new Error(`supabase GET ${path.split('?')[0]} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
// PostgREST caps an unpaginated GET at 1000 rows with no error/warning -- confirmed 2026-10-18
// as the root cause of be_rates growing to 12,585 duplicate rows: applyPriceChanges()'s
// `existing` lookup (via plain sget) silently saw only the first 1000 of 2000+ rows once
// be_rates grew past that, so every later recalc treated most already-written rows as new and
// POSTed a fresh duplicate instead of PATCHing. Any query that could plausibly return 1000+
// rows (be_rates in particular, which is one row per room-type/date and keeps growing) MUST use
// this instead of sget().
async function sgetAll(key, path) {
  const out = [];
  const sep = path.includes('?') ? '&' : '?';
  let offset = 0;
  const pageSize = 1000;
  for (;;) {
    const page = await sget(key, `${path}${sep}limit=${pageSize}&offset=${offset}`);
    out.push(...page);
    if (page.length < pageSize) return out;
    offset += pageSize;
  }
}
async function sreq(key, method, path, body, prefer) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method, headers: { ...hdrs(key), ...(prefer ? { Prefer: prefer } : {}) },
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

// Every lever the Pricing Strategy pages edit, with safe defaults so the engine runs
// sensibly before Jorge/Darlene ever touch a setting. referenceRoomTypeId defaults to
// whichever be_enabled room type has the highest be_price_single (usually the flagship
// room) the first time settings are loaded with none saved yet.
// Seeded with the real numbers from Jorge's RoomPriceGenie trial screenshots (2026-10-17) so
// this ships useful out of the box instead of flattening every room type to the same price
// until someone visits Rooms Setup. rt1 (Beachfront King) is the reference by Jorge's own
// setup -- deliberately NOT "whichever room type costs the most" (that would wrongly pick
// Casa Master, a whole-villa product, as the reference for regular room derivation).
const DEFAULT_SETTINGS = {
  referenceRoomTypeId: 'rt1',
  // 2026-10-17: updated to Jorge's exact RoomPriceGenie trial numbers (full Rooms Setup table,
  // not the earlier cropped screenshot) -- rt5 (Simple n Small) wasn't in that table, kept its
  // own numbers from Jorge's separate message. cm1/csh3 (Casa Master/Shanti) corrected from the
  // first message's "1900/2700" guess to the real table's $1,950 base (+239% derivation).
  derivationPct: { rt1: 0, rt2: -17, rt3: -41, rt4: -49, rt5: -49, rt6: 0, rt7: -13, rt8: 6, rt9: 4, c4a: 26, cm1: 239, csh3: 239 },
  // Price ceiling (Rooms Setup's "Price Ceiling" column, Jorge's report 2026-10-18): a type's
  // recommendation can never exceed its referenced type's recommendation on the same date --
  // smaller-inventory types swing harder on occupancy for the same booking count, which could
  // otherwise push a "lesser" category above one meant to always cost more. Jorge's intended
  // chain (2026-10-18): Simple n Small -> Garden -> Garden Plus -> Superior -> Beachfront King,
  // and separately Double -> Beachview Double. room-price-recalc.js's capping pass repeats until
  // stable so a chain this long propagates correctly regardless of processing order.
  priceCeilingRoomTypeId: { rt5: 'rt4', rt4: 'rt3', rt3: 'rt2', rt2: 'rt1', rt7: 'rt6' },
  // Linked groups (Jorge's ask 2026-10-18): Casa Master and Casa Shanti must always recommend
  // the EXACT same price, capped at their own (identical) Max Price -- not a one-way ceiling
  // like priceCeilingRoomTypeId above. Each sells as a single whole-villa unit, so its own
  // occupancy is always 0% or 100%, nothing in between -- without this, two villas with
  // identical settings could land on wildly different prices on the same day purely because
  // one happened to be booked that night and the other wasn't. room-price-recalc.js computes
  // ONE combined-occupancy price per group and applies it to every member.
  linkedRoomTypeGroups: [['cm1', 'csh3']],
  minPrice: { rt1: 345, rt2: 295, rt3: 245, rt4: 185, rt5: 140, rt6: 355, rt7: 320, rt8: 310, rt9: 375, c4a: 525, cm1: 1200, csh3: 1200 },
  maxPrice: { rt1: 975, rt2: 875, rt3: 685, rt4: 600, rt5: 695, rt6: 875, rt7: 900, rt8: 1200, rt9: 1350, c4a: 1200, cm1: 3400, csh3: 3400 },
  weekdayPct: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
  leadTimePct: { '6mo': 0, '3mo': 0, '6w': 0, '4w': 0, '2w': 0, '1w': 0, '7d': 0, '3d': 0, '0d': 0 },
  targetOccupancyPctByMonth: { 1: 80, 2: 80, 3: 80, 4: 80, 5: 80, 6: 80, 7: 80, 8: 80, 9: 80, 10: 80, 11: 80, 12: 80 },
  medianBookingWindowDays: 21, // "Standard" per RoomPriceGenie's own 14-30 day default band
  aggressiveness: 'standard',  // 'very_low' | 'low' | 'standard' -- RoomPriceGenie's own 3 levels
  dayOfWeekOwnedByTool: false, // once true, room-price-settings.js zeroes booking_engine_settings.weekend_premium so it's never double-applied
  roundTo: 5,
  autoApplyEnabled: false, // Jorge's ask 2026-10-17: once true, room-price-recalc.js pushes every recommendation straight into be_rates on each of its 3x/day runs -- no human review. Guardrails are min/max only (explicitly no rate-of-change cap, Jorge's call).
};
const AGGRESSIVENESS_FACTOR = { very_low: 0.25, low: 0.5, standard: 1 };

async function loadSettings(key) {
  const saved = await appStoreGet(key, SETTINGS_KEY);
  return saved ? deepMerge(DEFAULT_SETTINGS, saved) : { ...DEFAULT_SETTINGS };
}
function deepMerge(base, over) {
  const out = { ...base, ...over };
  for (const k of ['derivationPct', 'minPrice', 'maxPrice', 'weekdayPct', 'leadTimePct', 'targetOccupancyPctByMonth', 'priceCeilingRoomTypeId']) {
    out[k] = { ...(base[k] || {}), ...(over[k] || {}) };
  }
  return out;
}
async function saveSettings(key, settings) {
  await appStoreSet(key, SETTINGS_KEY, settings);
}

async function loadRoomTypes(key) {
  return sget(key, 'room_types?be_enabled=eq.true&select=id,name,rooms,be_price_single,price_single_high,price_single_low,max_occ&order=id');
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function dateToParts(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return { month: d.getMonth() + 1, weekdayKey: WEEKDAY_KEYS[d.getDay()] };
}
function daysBetween(aStr, bStr) {
  return Math.round((new Date(bStr + 'T12:00:00') - new Date(aStr + 'T12:00:00')) / 86400000);
}
function leadTimeBucket(daysOut) {
  if (daysOut >= 180) return '6mo';
  if (daysOut >= 90) return '3mo';
  if (daysOut >= 42) return '6w';
  if (daysOut >= 28) return '4w';
  if (daysOut >= 14) return '2w';
  if (daysOut >= 7) return '1w';
  if (daysOut >= 3) return '7d';
  if (daysOut >= 1) return '3d';
  return '0d';
}

// Reads every `bookings` row overlapping [start,end] once (cheap: one query for the whole
// window, same table/column shape get-availability.js already uses), so occupancy for every
// date/room-type pair can be computed in-memory afterward without one query per day.
async function loadBlocksInRange(key, start, end) {
  const rows = await sget(key, `bookings?select=id,start_date,end_date,blocked_rooms,status&status=neq.cancelled&start_date=lt.${end}&end_date=gt.${start}`);
  return rows.filter(r => Array.isArray(r.blocked_rooms) && r.blocked_rooms.length);
}

// Actual occupancy (0-1) for one room type on one date, from the blocks already loaded by
// loadBlocksInRange -- matches get-availability.js's core signal (bookings.blocked_rooms date
// overlap). Deliberately skips that function's secondary "orphaned registrations" cross-check:
// acceptable for a price SUGGESTION (a missed edge case skews one recommendation slightly) in a
// way it would not be for the live double-booking guard that function exists to protect.
function occupancyFor(dateStr, roomTypeRooms, blocks) {
  if (!roomTypeRooms.length) return 0;
  const taken = new Set();
  for (const b of blocks) {
    if (dateStr < b.start_date || dateStr >= b.end_date) continue;
    for (const room of b.blocked_rooms) if (roomTypeRooms.includes(room)) taken.add(room);
  }
  return taken.size / roomTypeRooms.length;
}

// Group/retreat nights specifically (a subset of `taken`) -- Amansala's improvement over stock
// RoomPriceGenie's manual "Room Nights Sold to Groups" monthly guess: every bookings row here IS
// the group/retreat/direct-booking block itself, so "how many of today's taken rooms came from a
// retreat" is just "how many came from a `bookings` row with more than one guest's worth of rooms
// blocked at once" -- approximated here as any block spanning 2+ rooms (a lone direct Escape
// booking blocks exactly 1 room; a retreat blocks many at once).
function groupTakenFor(dateStr, roomTypeRooms, blocks) {
  const taken = new Set();
  for (const b of blocks) {
    if (dateStr < b.start_date || dateStr >= b.end_date) continue;
    if (b.blocked_rooms.length < 2) continue;
    for (const room of b.blocked_rooms) if (roomTypeRooms.includes(room)) taken.add(room);
  }
  return taken.size;
}

// The core algorithm -- see plan's "The pricing algorithm" section for the worked example this
// reproduces (14-day median + 80% target => 40% expected occupancy at exactly 14 days out).
function expectedOccupancy(targetPct, medianWindowDays, daysOut) {
  const ratio = Math.max(0, Math.min(1, 1 - daysOut / (2 * medianWindowDays)));
  return (targetPct / 100) * ratio;
}

function round(n, to) { return Math.round(n / to) * to; }
// Same May-September low season window get-rates.js's isLow() uses.
function isLowSeasonMonth(month) { return month >= 5 && month <= 9; }

// Computes the recommended price for one room type on one date. `today` is the recalc's
// reference point (days-out is measured from here, not from "now" at call time) so a batch
// recompute is reproducible/testable.
function recommendPrice(opts) {
  const { settings, roomType, dateStr, today, actualOcc } = opts;
  const refId = settings.referenceRoomTypeId || roomType.id;
  const isReference = roomType.id === refId;
  const refBase = opts.referenceBasePrice ?? roomType.be_price_single;
  const derivationPct = isReference ? 0 : (settings.derivationPct[roomType.id] || 0);
  let price = refBase * (1 + derivationPct / 100);

  const { month, weekdayKey } = dateToParts(dateStr);
  const monthlyPct = Number(opts.seasonalAdjustments?.[String(month)] ?? 0);
  price *= (1 + monthlyPct / 100);

  if (settings.dayOfWeekOwnedByTool) {
    const weekdayPct = Number(settings.weekdayPct[weekdayKey] || 0);
    price *= (1 + weekdayPct / 100);
  }

  const daysOut = Math.max(0, daysBetween(today, dateStr));
  const leadPct = Number(settings.leadTimePct[leadTimeBucket(daysOut)] || 0);
  price *= (1 + leadPct / 100);

  const expectedOcc = expectedOccupancy(settings.targetOccupancyPctByMonth[String(month)] ?? 80, settings.medianBookingWindowDays, daysOut);
  const gap = actualOcc - expectedOcc; // >0: fuller than expected -> raise; <0: emptier -> lower
  const factor = AGGRESSIVENESS_FACTOR[settings.aggressiveness] ?? 1;
  price *= (1 + gap * factor);

  const min = settings.minPrice[roomType.id] ?? Math.round(refBase * 0.6);
  const max = settings.maxPrice[roomType.id] ?? Math.round(refBase * 1.7);
  price = Math.max(min, Math.min(max, price));

  return round(price, settings.roundTo || 5);
}

// Mirrors get-rates.js's exact precedence (manual be_rates > base + seasonal/weekend) so the
// Calendar's "current" price column matches what a guest on book.html actually sees today --
// this is a read-only mirror for display, never the source of truth (get-rates.js stays that).
function currentLivePrice(opts) {
  const { roomType, dateStr, beRatesForType, seasonalAdjustments, weekendPremiumPct, isLowSeason } = opts;
  const d = new Date(dateStr + 'T12:00:00');
  const isWeekend = [0, 5, 6].includes(d.getDay());
  const manual = (beRatesForType || []).find(r => r.start_date <= dateStr && r.end_date >= dateStr);
  if (manual) {
    let price = manual.price_single;
    if (isWeekend && weekendPremiumPct) price = Math.round(price * (1 + weekendPremiumPct / 100));
    return price;
  }
  const base = roomType.be_price_single != null ? roomType.be_price_single
    : (isLowSeason ? (roomType.price_single_low ?? roomType.price_single_high) : roomType.price_single_high);
  if (base == null) return null;
  const month = d.getMonth() + 1;
  const seasonalPct = Number(seasonalAdjustments?.[String(month)] ?? 0);
  return Math.round(base * (1 + seasonalPct / 100) * (isWeekend && weekendPremiumPct ? (1 + weekendPremiumPct / 100) : 1));
}

// Pushes a batch of {room_type_id, date, price_single} changes into `be_rates` (the real
// table Escape's checkout reads, netlify/functions/stripe.js) and appends an audit entry per
// change to app_store key LOG_KEY. Shared by room-price-apply.js (human clicks Upload Prices)
// and room-price-recalc.js's auto-apply path (Jorge's ask 2026-10-17) -- same code either way,
// only `staffName` differs ("Automatic (Revenue Manager bot)" for the latter).
// Runs `fn` over `items` with at most `limit` in flight at once -- a big settings change (or
// the Revenue Manager's first-ever run) can produce 1000+ be_rates writes, and doing those
// fully sequentially (as this used to) blew well past Netlify's 26s function timeout the first
// time Jorge turned on auto-apply with new Rooms Setup numbers (confirmed live 2026-10-17).
async function pMap(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function applyPriceChanges(key, changes, staffName) {
  if (!changes.length) return { applied: 0 };
  const existing = await sgetAll(key, `be_rates?select=room_type_id,start_date,end_date,price_single`);
  const log = (await appStoreGet(key, LOG_KEY)) || [];
  // PATCH an existing row (1 request) instead of DELETE+POST (2) when one's already there --
  // only a brand-new date/room-type combo needs an insert.
  await pMap(changes, 40, async (c) => {
    const prior = existing.find(r => r.room_type_id === c.room_type_id && r.start_date === c.date && r.end_date === c.date);
    if (prior) {
      await sreq(key, 'PATCH', `be_rates?room_type_id=eq.${encodeURIComponent(c.room_type_id)}&start_date=eq.${c.date}&end_date=eq.${c.date}`, { price_single: c.price_single }, 'return=minimal');
    } else {
      await sreq(key, 'POST', 'be_rates', { room_type_id: c.room_type_id, start_date: c.date, end_date: c.date, price_single: c.price_single }, 'return=minimal');
    }
  });
  for (const c of changes) {
    const prior = existing.find(r => r.room_type_id === c.room_type_id && r.start_date === c.date && r.end_date === c.date);
    log.push({ at: new Date().toISOString(), staffName, roomTypeId: c.room_type_id, date: c.date, oldPrice: prior ? prior.price_single : null, newPrice: c.price_single });
  }
  await appStoreSet(key, LOG_KEY, log.slice(-2000));
  return { applied: changes.length };
}

module.exports = {
  applyPriceChanges,
  currentLivePrice, isLowSeasonMonth,
  SUPABASE_URL, SETTINGS_KEY, LOG_KEY, RECS_KEY, DEFAULT_SETTINGS, AGGRESSIVENESS_FACTOR,
  sget, sgetAll, sreq, appStoreGet, appStoreSet,
  loadSettings, saveSettings, loadRoomTypes,
  dateToParts, daysBetween, leadTimeBucket, WEEKDAY_KEYS,
  loadBlocksInRange, occupancyFor, groupTakenFor,
  expectedOccupancy, recommendPrice, round,
};
