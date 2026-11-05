'use strict';

// ask-jorge-tools.js — read-only look-ups for the Ask Jorge assistant (ask-jorge.js), added 2026-11-05 ("haz todo eso"):
// a stay's folios (balance, every line with its id, spa appointments next to the spa charges), extra nights, arrivals /
// departures of a day, reservation problems (same guest twice, no room), a therapist's agenda, spa appointments by
// guest or day, and the questions log behind Jorge's daily summary.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const H = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&amp;/g, '&').trim();
const tulumDate = (plus = 0) => new Date(Date.now() + plus * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
const isDay = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const addDays = (d, n) => new Date(new Date(d + 'T12:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const r2 = n => Math.round(n * 100) / 100;
const lineTotal = x => Number(x.qty) * Number(x.unit_price) * (1 + (Number(x.tax_rate) || 0) / 100);
const getter = key => async p => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H(key) }); return r.ok ? r.json() : []; };
const appStore = async (key, k) => { const [row] = await getter(key)(`app_store?key=eq.${k}&select=value,updated_at`); return row || null; };
const guestNames = r => (r.guests || []).filter(g => g && g.name && !g.cancelled).map(g => g.name);

// every stay (registration) on the bookings that touch [from, to]
async function staysBetween(key, from, to) {
  const get = getter(key);
  const bks = await get(`bookings?select=id,retreat_name,leader_name,start_date,end_date,status,booking_type&status=neq.cancelled&start_date=lte.${to}&end_date=gte.${from}&limit=2000`);
  const byId = new Map(bks.map(b => [b.id, b])), ids = [...byId.keys()], out = [];
  for (let i = 0; i < ids.length; i += 80) {
    const regs = await get(`registrations?select=id,booking_id,room,guests,check_in,check_out,cancelled,checked_in_at,checked_out_at,ac_24h,internal_notes&booking_id=in.(${ids.slice(i, i + 80).map(encodeURIComponent).join(',')})`);
    regs.forEach(r => { if (r.cancelled) return; const bk = byId.get(r.booking_id); out.push({ r, bk, s: r.check_in || bk.start_date, e: r.check_out || bk.end_date }); });
  }
  return out;
}
const resLabel = bk => bk.booking_type === 'room_only' ? 'Room Only (' + (bk.retreat_name || '') + ')' : 'Retreat: ' + (bk.retreat_name || bk.leader_name);

async function balances(key, regIds) {
  const get = getter(key), out = {};
  for (let i = 0; i < regIds.length; i += 60) {
    const fo = await get(`folios?select=id,registration_id&registration_id=in.(${regIds.slice(i, i + 60).map(encodeURIComponent).join(',')})`);
    if (!fo.length) continue;
    const items = await get(`folio_items?select=folio_id,qty,unit_price,tax_rate&folio_id=in.(${fo.map(f => f.id).join(',')})&limit=10000`);
    const regOf = {}; fo.forEach(f => { regOf[f.id] = f.registration_id; });
    items.forEach(x => { const k = regOf[x.folio_id]; out[k] = (out[k] || 0) + lineTotal(x); });
  }
  Object.keys(out).forEach(k => { out[k] = r2(out[k]); });
  return out;
}

// who arrives / leaves on a day, with balance, A/C 24h and status
async function arrivalsDepartures(key, { date = '', kind = 'both' }) {
  const day = isDay(date) ? date : tulumDate();
  const stays = (await staysBetween(key, day, day)).filter(x => (kind !== 'departures' && x.s === day) || (kind !== 'arrivals' && x.e === day));
  const bal = await balances(key, stays.map(x => x.r.id));
  const row = x => ({ regId: x.r.id, guests: guestNames(x.r).join(' & '), room: x.r.room || '(no room)', checkIn: x.s, checkOut: x.e, reservation: resLabel(x.bk),
    status: x.r.checked_out_at ? 'checked out' : x.r.checked_in_at ? 'checked in' : 'not checked in', ac24h: !!x.r.ac_24h, balanceUSD: bal[x.r.id] || 0, internalNotes: String(x.r.internal_notes || '').slice(0, 160) });
  const by = (a, b) => String(a.room).localeCompare(String(b.room), undefined, { numeric: true });
  return { date: day, arrivals: kind === 'departures' ? undefined : stays.filter(x => x.s === day).map(row).sort(by), departures: kind === 'arrivals' ? undefined : stays.filter(x => x.e === day).map(row).sort(by) };
}

// the same guest twice on overlapping dates, and stays with no room, in a date range (default: today + 14 days)
async function reservationProblems(key, { from = '', to = '' }) {
  const a = isDay(from) ? from : tulumDate(), b = isDay(to) ? to : addDays(a, 14);
  const stays = (await staysBetween(key, a, b)).filter(x => x.e > a && x.s <= b);
  const noRoom = stays.filter(x => !String(x.r.room || '').trim()).map(x => ({ regId: x.r.id, guests: guestNames(x.r).join(' & '), dates: `${x.s} → ${x.e}`, reservation: resLabel(x.bk) }));
  const byName = {};
  stays.forEach(x => guestNames(x.r).forEach(n => { const k = norm(n).replace(/\s+/g, ' '); if (k.length > 3) (byName[k] = byName[k] || []).push(x); }));
  const dups = [];
  Object.entries(byName).forEach(([n, xs]) => {
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
      const p = xs[i], q = xs[j];
      if (p.r.id !== q.r.id && p.s < q.e && q.s < p.e) dups.push({ guest: n, first: { regId: p.r.id, room: p.r.room, dates: `${p.s} → ${p.e}`, reservation: resLabel(p.bk) }, second: { regId: q.r.id, room: q.r.room, dates: `${q.s} → ${q.e}`, reservation: resLabel(q.bk) } });
    }
  });
  return { from: a, to: b, sameGuestTwice: dups.slice(0, 40), noRoom: noRoom.slice(0, 40), note: 'Two stays can be right (a couple in two rooms, a guest moving rooms mid-stay): check before changing anything. The room list is the truth.' };
}

// a stay's folios: every line with its id (to remove / correct / refund), totals, and the spa appointments to compare
async function stayFolios(key, regId) {
  const get = getter(key);
  const [r] = await get(`registrations?id=eq.${encodeURIComponent(String(regId || ''))}&select=id,booking_id,room,check_in,check_out,guests`);
  if (!r) return { message: 'Stay not found — use find_guest first.' };
  const [bk] = await get(`bookings?id=eq.${encodeURIComponent(r.booking_id)}&select=start_date,end_date,retreat_name,leader_name,booking_type`);
  const ci = r.check_in || (bk && bk.start_date), co = r.check_out || (bk && bk.end_date);
  const fo = await get(`folios?select=id,name,guest_name,status&registration_id=eq.${encodeURIComponent(r.id)}`);
  const items = fo.length ? await get(`folio_items?select=id,folio_id,description,qty,unit_price,tax_rate,category,staff_name,created_at&folio_id=in.(${fo.map(f => f.id).join(',')})&order=created_at`) : [];
  const [ap, sd] = await Promise.all([appStore(key, 'spa_appointments'), appStore(key, 'spa_data')]);
  const th = {}, sv = {}; (((sd && sd.value) || {}).therapists || []).forEach(t => { th[t.id] = t.firstName; }); (((sd && sd.value) || {}).services || []).forEach(x => { sv[x.id] = x; });
  const names = guestNames(r).map(norm), room = norm(r.room).replace(/\s/g, ''), until = addDays(co, 7);
  const appts = ((ap && ap.value) || []).filter(a => a && a.date >= ci && a.date <= until && (names.some(n => n && norm(a.clientName).includes(n)) || (room && norm(a.roomNumber || '').replace(/\s/g, '') === room)))
    .sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start))
    .map(a => ({ apptId: a.id, date: a.date, time: a.start, client: a.clientName, service: (sv[a.serviceId] || {}).name, priceUSD: (sv[a.serviceId] || {}).price, therapist: th[a.therapistId], status: a.status, afterCheckOut: a.date >= co, bookedAt: a.createdAt }));
  const folios = fo.map(f => {
    const mine = items.filter(i => i.folio_id === f.id), charges = mine.filter(i => Number(i.unit_price) > 0 && i.category !== 'Payment'), pays = mine.filter(i => !(Number(i.unit_price) > 0 && i.category !== 'Payment'));
    return { folioId: f.id, name: f.name || f.guest_name, status: f.status, chargesUSD: r2(charges.reduce((t, x) => t + lineTotal(x), 0)), paymentsUSD: r2(-pays.reduce((t, x) => t + lineTotal(x), 0)), balanceUSD: r2(mine.reduce((t, x) => t + lineTotal(x), 0)) };
  });
  return { regId: r.id, room: r.room, checkIn: ci, checkOut: co, reservation: bk ? resLabel(bk) : '', guests: guestNames(r), folios, totalBalanceUSD: r2(folios.reduce((t, f) => t + f.balanceUSD, 0)),
    lines: items.map(i => ({ folioItemId: i.id, folio: (fo.find(f => f.id === i.folio_id) || {}).name, date: String(i.created_at).slice(0, 10), description: i.description, qty: i.qty, unitUSD: i.unit_price, taxPct: i.tax_rate, totalUSD: r2(lineTotal(i)), category: i.category, addedBy: i.staff_name, stripe: /\bpi_[A-Za-z0-9]+/.test(String(i.description || '')) && Number(i.unit_price) < 0 })),
    spaAppointments: appts,
    note: 'Spa charges made automatically by the calendar are dated on the service day; ones typed by hand are dated when typed. Tips are not services. A negative line is a payment or credit; a payment with stripe:true can be refunded.' };
}

// extra nights: the guest's own dates vs the retreat's, and what on the folios / reservation looks like paying for them
async function extraNights(key, regId) {
  const get = getter(key);
  const [r] = await get(`registrations?id=eq.${encodeURIComponent(String(regId || ''))}&select=id,booking_id,room,check_in,check_out,guests,notes,internal_notes,charges`);
  if (!r) return { message: 'Stay not found — use find_guest first.' };
  const [bk] = await get(`bookings?id=eq.${encodeURIComponent(r.booking_id)}&select=start_date,end_date,retreat_name,leader_name,booking_type,charges,notes`);
  const ci = r.check_in || bk.start_date, co = r.check_out || bk.end_date, nights = [];
  for (let d = ci; d < co; d = addDays(d, 1)) if (d < bk.start_date || d >= bk.end_date) nights.push(d);
  const st = await stayFolios(key, r.id);
  const looksNight = s => /night|noche|room|cuarto|extension|extra/i.test(String(s || ''));
  const nameHits = guestNames(r).map(norm);
  const bkCharges = (Array.isArray(bk.charges) ? bk.charges : []).filter(c => c && (looksNight(c.description || c.name) || nameHits.some(n => norm(JSON.stringify(c)).includes(n)))).slice(0, 20);
  return { retreat: resLabel(bk), retreatDates: `${bk.start_date} → ${bk.end_date}`, guestDates: `${ci} → ${co}`, room: r.room, extraNights: nights,
    folioLinesAboutNights: (st.lines || []).filter(l => looksNight(l.description) || l.category === 'Room' || l.category === 'Upgrade'),
    retreatChargesAboutThem: bkCharges, notes: [r.notes, r.internal_notes].filter(Boolean).join(' | ').slice(0, 400),
    rules: 'An extra night added from the retreat (Room List) goes on the teacher\'s bill; one the guest books themselves goes on their own folio. "Extra night paid" in the notes means it was paid. Use quote_room_rate (extra_night) for the price.' };
}

// a therapist's appointments (or everyone's) for a day; spa appointments of a guest
async function spaAgenda(key, { therapist = '', date = '', guest = '' }) {
  const [ap, sd] = await Promise.all([appStore(key, 'spa_appointments'), appStore(key, 'spa_data')]);
  const ths = ((sd && sd.value) || {}).therapists || [], sv = {}; (((sd && sd.value) || {}).services || []).forEach(x => { sv[x.id] = x; });
  const day = isDay(date) ? date : (guest ? '' : tulumDate());
  const t = therapist ? ths.find(x => norm(`${x.firstName} ${x.lastName || ''}`).includes(norm(therapist))) : null;
  if (therapist && !t) return { message: `No therapist called "${therapist}". Therapists: ${ths.map(x => x.firstName).join(', ')}` };
  const thName = id => { const x = ths.find(y => y.id === id); return x ? x.firstName : 'unassigned'; };
  const list = ((ap && ap.value) || []).filter(a => a && (!day || a.date === day) && (!t || a.therapistId === t.id) && (!guest || norm(a.clientName).includes(norm(guest))) && (guest ? a.date >= tulumDate(-30) : true))
    .sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start)).slice(0, 60)
    .map(a => ({ apptId: a.id, date: a.date, time: a.start, service: (sv[a.serviceId] || {}).name, minutes: (sv[a.serviceId] || {}).duration || a.duration, client: a.clientName, guest: a.guestType === 'hotel' ? 'hotel guest, room ' + (a.roomNumber || '?') : 'offsite', therapist: thName(a.therapistId), status: a.status, payment: a.paymentStatus }));
  return { date: day || 'last 30 days and later', therapist: t ? t.firstName : 'all', appointments: list };
}

module.exports = { arrivalsDepartures, reservationProblems, stayFolios, extraNights, spaAgenda, appStore, getter, tulumDate, addDays, norm, H, SUPABASE_URL, lineTotal, r2 };
