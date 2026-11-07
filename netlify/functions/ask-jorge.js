'use strict';

// ask-jorge.js — the "Ask Jorge" assistant in the corner of every portal screen (Jorge 2026-11-05). Staff ask how to do
// something (move a room, add a charge, record a payment...) or a quick fact (which room is a guest in, what do they owe);
// Claude answers from the staff guide (ask-jorge-kb.js) and can look guests up READ-ONLY. When it cannot solve it, it sends
// the question to Jorge: WhatsApp (template amansala_pregunta_portal, once Meta approves it) + email, and keeps it in
// app_store 'ask_jorge_questions'.
// It can also DO things (Jorge 2026-11-05: "yo siempre quiero que haga cosas"), but only after the person confirms: the model
// proposes an action (propose_action) and the chat shows it as a card; nothing is written until the person presses Confirm,
// which sends {execute: action} here. Actions: add a charge to a folio, record a payment, check in, check out, add an internal
// note, A/C 24h on/off, move a guest to another room, book a spa service, create a Room Only reservation, send a folio's
// payment link. Moving rooms and new reservations run in the person's own portal tab (the same functions as the Rooms
// screen: Cloudbeds, rate freeze, pay-first), the rest here. Not here: refunds, deleting/cancelling, charging a card (Stripe).
// Every action is logged in the activity log under the person's name, "(Ask Jorge)".
// POST {token, messages:[{role:'user'|'assistant', content:string}], page}
const { staffAllowed, cors, reply } = require('./portal-auth-lib');
const { sendMail } = require('./mail-lib');
const KB = require('./ask-jorge-kb');
const T = require('./ask-jorge-tools');
const { sendUtility } = require('./wa-utility-lib');
const A = require('./ask-jorge-actions');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
// Sonnet, not Opus (Jorge 2026-11-06, credits): staff questions and the confirmed actions do not need the most expensive model
const MODEL = 'claude-sonnet-5-5';
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const JORGE_PHONE = '529844523336';

const SYSTEM = `You are "Ask Jorge", the help assistant inside the Amansala Portal (a hotel and retreat management system in Tulum).
Staff (front desk, housekeeping, spa, managers) ask you how to do things in the portal or quick questions about guests.

How to answer:
- Answer in the language the person writes in (usually Spanish or English). Short, clear, friendly; numbered steps for how-tos,
  using the exact button and screen names from the guide.
- Only state how the portal works from the guide below. If the guide does not cover it, or you are not sure, do not guess:
  call notify_jorge.
- You can look guests up with find_guest (read-only). Share only what the staff member needs.
- You CAN do these for them with propose_action (they confirm with a button before anything is saved): add a charge to a
  guest's folio, record a payment on a folio, check a guest in, check a guest out, add an internal note, turn A/C 24h on/off,
  move a guest to another room (move_room; check the room is free with room_availability first), book a spa service
  (spa_booking; use spa_services and spa_availability first, hotel guests are charged to their room, outside guests get a
  payment link), create a Room Only reservation (new_booking: room, dates, guest name, email/phone, number of guests, rate per
  night, type Walk-in/Direct/Booking.com/Expedia/Air BnB; check room_availability first; the guest gets a payment link and it is
  created in Cloudbeds), send a folio's payment link to the guest (send_payment_link).
  First find the guest with find_guest (to get regId and folioId); if several folios or guests match, ask which one. Then call
  propose_action with all the details and tell them to press Confirm on the card below. Never say it is done until they confirm.
- Also with propose_action: remove or correct a folio line (remove_charge / edit_charge: get the folioItemId from
  stay_folios), refund a Stripe card payment (refund_payment; only Jorge, Hilario and Melissa), cancel or move a spa appointment
  (spa_cancel / spa_move: get the apptId from spa_agenda; the room charge goes or moves with it), send a therapist the
  confirmation (therapist_confirm), change a transport's date / time / airport / flight (transport_change: rowId from
  transports), set a room clean / dirty / maintenance on the Housekeeping board (room_status), and make Cloudbeds match the
  portal's dates / room (cloudbeds_fix, after cloudbeds_compare; the portal is the truth).
- Reviews you do on your own (read-only): before a check-out, stay_folios = what is owed, odd lines (duplicates, spa charges
  without an appointment or after check-out), then offer send_payment_link; extra_nights = are the extra nights paid and who
  pays; arrivals_departures for today / tomorrow; reservation_problems = same guest twice, stays without a room; spa_agenda for
  a therapist's day; cloudbeds_compare when something looks different in Cloudbeds. Say clearly what is right and what is not.
- Things you cannot do (charging a new card with Stripe, deleting a reservation or a payment, discounts or comps): explain how
  they do it themselves, step by step, or send it to Jorge.
- If it needs a decision (money, refunds, discounts, comps, who pays) or looks like a system error, call notify_jorge with a
  request (what they asked) and reason (why it could not be done), and tell them you sent it to Jorge and he will reply.
- Spa: before booking, look the person up with find_guest for the appointment date. If they are a guest staying in the hotel
  that day, book it as guestType hotel with their room: it is charged to their room automatically and NO payment link is sent.
  Payment links are only for people who are not staying in the hotel (guestType offsite).
- Never invent prices, policies or reservation details.

STAFF GUIDE
${KB}`;

const TOOLS = [
  { name: 'find_guest', description: 'Find guests staying in the hotel (or arriving/leaving) on a date, by name, room, phone or email (names may be misspelled by one letter). Read-only. Returns room, dates, reservation/retreat, checked-in status and the balance still owed on their folios. When you are given a phone or email, pass it too.',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Guest name or part of it' }, room: { type: 'string', description: 'Room, e.g. 13b, GV16, CH2' }, phone: { type: 'string', description: 'Guest phone, any format' }, email: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD, default today (Tulum)' } } } },
  { name: 'room_availability', description: 'Free rooms for a date range (optionally only one room type or one room). Read-only.',
    input_schema: { type: 'object', properties: { checkIn: { type: 'string' }, checkOut: { type: 'string' }, roomType: { type: 'string' }, room: { type: 'string' } }, required: ['checkIn', 'checkOut'] } },
  { name: 'quote_room_rate', description: 'Price of a Room Only stay or extra nights for given dates: each available room type with its rate per night, taxes and total. stayType extra_night = the Extra Night rate (guests of a retreat adding nights before/after it); escape = the normal Escape rate. Read-only.',
    input_schema: { type: 'object', properties: { checkIn: { type: 'string' }, checkOut: { type: 'string' }, adults: { type: 'number' }, stayType: { type: 'string', enum: ['extra_night', 'escape'] } }, required: ['checkIn', 'checkOut'] } },
  { name: 'stay_folios', description: 'For one stay (regId from find_guest): its folios with charges, payments and balance; every line with its folioItemId, date, description, amount, category and who added it (stripe:true = card payment that can be refunded); and the spa appointments under the guest\'s name or room during the stay and the week after. Use it before check-out to review the bill, to find a line to remove / correct / refund, and to check spa charges against real appointments (duplicates, charge without appointment, appointment without charge, after check-out). Read-only.',
    input_schema: { type: 'object', properties: { regId: { type: 'string' } }, required: ['regId'] } },
  { name: 'extra_nights', description: 'For one stay (regId): the guest\'s dates vs the retreat dates, which nights are extra, folio lines and retreat charges that look like paying for them, notes. Use it to say if an extra night is paid and who pays it. Read-only.',
    input_schema: { type: 'object', properties: { regId: { type: 'string' } }, required: ['regId'] } },
  { name: 'arrivals_departures', description: 'Who arrives and/or leaves on a date (default today): room, reservation, checked-in status, A/C 24h, balance owed, internal notes. Read-only.',
    input_schema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD; tomorrow = the day after today' }, kind: { type: 'string', enum: ['arrivals', 'departures', 'both'] } } } },
  { name: 'reservation_problems', description: 'Reservation problems in a date range (default the next 14 days): the same guest on two stays with overlapping dates (possible duplicates) and stays with no room assigned. Read-only.',
    input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } } },
  { name: 'spa_agenda', description: 'Spa appointments (with apptId) for a day, optionally for one therapist, or for one guest by name (their recent and upcoming ones). Read-only.',
    input_schema: { type: 'object', properties: { date: { type: 'string' }, therapist: { type: 'string', description: 'First name' }, guest: { type: 'string' } } } },
  { name: 'transports', description: 'Airport transports (with rowId) for a date (arrivals and departures that day, default today) or for a guest by name: flight, date, time, airport, own transport, whether it was charged. Read-only.',
    input_schema: { type: 'object', properties: { date: { type: 'string' }, guest: { type: 'string' } } } },
  { name: 'cloudbeds_compare', description: 'Compare one stay (regId) in the portal with its Cloudbeds reservation: dates, room, guest name, status. The portal is the truth. Read-only.',
    input_schema: { type: 'object', properties: { regId: { type: 'string' } }, required: ['regId'] } },
  { name: 'find_reservation', description: 'Find a retreat / group / Room Only reservation by leader or retreat name (any date, past or future): bookingId, leader, dates, status, rooms with their guests (regId) and which room is the teacher room. Use it for future retreats, where find_guest needs the exact date. Read-only.',
    input_schema: { type: 'object', properties: { name: { type: 'string' }, date: { type: 'string', description: 'optional YYYY-MM-DD inside the stay' } }, required: ['name'] } },
  { name: 'spa_services', description: 'List the active spa services (id, name, duration, price). Read-only.', input_schema: { type: 'object', properties: {} } },
  { name: 'spa_availability', description: 'Free times for a spa service on a date (with therapist and spa room ids to book). Read-only.',
    input_schema: { type: 'object', properties: { serviceId: { type: 'string' }, date: { type: 'string' }, therapistPreference: { type: 'string', enum: ['none', 'male', 'female'] }, guestCount: { type: 'number' } }, required: ['serviceId', 'date'] } },
  { name: 'propose_action', description: 'Propose a change for the person to confirm with a button (nothing is saved until they confirm). Types: add_charge (folioId, description, category, qty, unitPrice USD before tax, taxRate %), record_payment (folioId, method, amount USD, reference), check_in (regId), check_out (regId), internal_note (regId, note), ac24 (regId, on true/false), move_room (regId, toRoom), spa_booking (serviceId, date, start HH:MM, therapistId, spaRoomId, firstName, lastName, email and/or phone -- one of the two is enough, guestType hotel|offsite, roomNumber for hotel guests, guestCount for groups), new_booking (room, checkIn, checkOut, guestName, email, phone, adults, ratePerNight, bookingType, notes), send_payment_link (folioId), remove_charge (folioItemId), edit_charge (folioItemId + description/qty/unitPrice/taxRate to change), refund_payment (folioItemId of a Stripe card payment, amount, reason; only Jorge, Hilario, Melissa), spa_cancel (apptId; removes its room charge), spa_move (apptId + new date/start/therapistId; the charge moves too), therapist_confirm (apptId), transport_change (rowId + arrivalDate/arrivalTime/arrivalAirport/departureDate/departureTime/departureAirport/flightNumber), room_status (room, status clean|dirty|maintenance, note), teacher_room (regId: mark the group leader / teacher room ★ in the Room List), set_leader (bookingId from find_reservation, leaderName: the reservation\'s leader name), cloudbeds_fix (regId: Cloudbeds dates/room set to the portal\'s).',
    input_schema: { type: 'object', properties: {
      type: { type: 'string', enum: ['add_charge', 'record_payment', 'check_in', 'check_out', 'internal_note', 'ac24', 'move_room', 'spa_booking', 'new_booking', 'send_payment_link', 'remove_charge', 'edit_charge', 'refund_payment', 'spa_cancel', 'spa_move', 'therapist_confirm', 'transport_change', 'room_status', 'cloudbeds_fix', 'teacher_room', 'set_leader'] },
      bookingId: { type: 'string' }, leaderName: { type: 'string' },
      folioItemId: { type: 'string' }, apptId: { type: 'string' }, rowId: { type: 'string' }, reason: { type: 'string' }, status: { type: 'string', enum: ['clean', 'dirty', 'maintenance'] },
      arrivalDate: { type: 'string' }, arrivalTime: { type: 'string' }, arrivalAirport: { type: 'string' }, departureDate: { type: 'string' }, departureTime: { type: 'string' }, departureAirport: { type: 'string' }, flightNumber: { type: 'string' },
      toRoom: { type: 'string' }, room: { type: 'string' }, checkIn: { type: 'string' }, checkOut: { type: 'string' }, guestName: { type: 'string' },
      adults: { type: 'number' }, ratePerNight: { type: 'number' }, bookingType: { type: 'string' },
      serviceId: { type: 'string' }, date: { type: 'string' }, start: { type: 'string' }, therapistId: { type: 'string' }, spaRoomId: { type: 'string' },
      firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' },
      guestType: { type: 'string', enum: ['hotel', 'offsite'] }, roomNumber: { type: 'string' }, guestCount: { type: 'number' },
      regId: { type: 'string' }, folioId: { type: 'string' },
      description: { type: 'string' }, category: { type: 'string', enum: ['Restaurant', 'Transport', 'Spa', 'Tour', 'Boutique', 'Gym', 'Room', 'Upgrade', 'Tip', 'Other'] },
      qty: { type: 'number' }, unitPrice: { type: 'number' }, taxRate: { type: 'number' },
      method: { type: 'string', enum: ['Cash', 'Zelle', 'Venmo', 'Paypal', 'Bank Transfer', 'Clip', 'Expedia Collect'] }, amount: { type: 'number' }, reference: { type: 'string' },
      note: { type: 'string' }, on: { type: 'boolean' } }, required: ['type'] } },
  { name: 'notify_jorge', description: 'Send this to Jorge by WhatsApp and email when you cannot solve it or it needs his decision.',
    input_schema: { type: 'object', properties: {
      request: { type: 'string', description: 'What the staff member asked for, in Spanish, with names / rooms / amounts' },
      reason: { type: 'string', description: 'Why you could not do or answer it, in Spanish (e.g. "es una decisión de dinero", "el asistente no puede hacer reembolsos", "falló: el cuarto está ocupado")' } }, required: ['request', 'reason'] } },
];

const H = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const tulumDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&amp;/g, '&').trim();

// one word of the name typed vs a word of the guest's name: contained, or one letter off for words of 4+ letters
// (Jorge 2026-11-07: Melissa's "Dianne Russel" for Dianne Russell, room 30, was booked as an outside guest)
function nameWordMatch(t, w) {
  if (!t || !w) return false;
  if (w.includes(t) || (t.length >= 4 && t.includes(w) && w.length >= 4)) return true;
  if (t.length < 4 || Math.abs(t.length - w.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < t.length && j < w.length) {
    if (t[i] === w[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (t.length > w.length) i++; else if (w.length > t.length) j++; else { i++; j++; }
  }
  return diff + (t.length - i) + (w.length - j) <= 1;
}
const nameMatches = (typed, full) => { const tw = norm(typed).split(/\s+/).filter(Boolean), gw = norm(full).split(/\s+/).filter(Boolean); return tw.length && tw.every(t => gw.some(w => nameWordMatch(t, w))); };
async function findGuest(key, { name = '', room = '', date = '', phone = '', email = '' }) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : tulumDate();
  const get = async p => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H(key) }); return r.ok ? r.json() : []; };
  const bks = await get(`bookings?select=id,retreat_name,leader_name,start_date,end_date,status,booking_type&status=neq.cancelled&start_date=lte.${day}&end_date=gte.${day}&limit=1000`);
  const byId = new Map(bks.map(b => [b.id, b])); const ids = [...byId.keys()]; const out = [];
  const n = norm(name), rm = norm(room).replace(/\s/g, '');
  for (let i = 0; i < ids.length && out.length < 15; i += 80) {
    const regs = await get(`registrations?select=id,booking_id,room,guests,check_in,check_out,cancelled,checked_in_at,checked_out_at&booking_id=in.(${ids.slice(i, i + 80).map(encodeURIComponent).join(',')})`);
    for (const r of regs) {
      if (r.cancelled) continue;
      const bk = byId.get(r.booking_id), s = r.check_in || bk.start_date, e = r.check_out || bk.end_date;
      if (!(s <= day && e >= day)) continue;
      if (rm && norm(r.room).replace(/\s/g, '') !== rm) continue;
      const guests = (r.guests || []).filter(g => g && g.name && !g.cancelled);
      // phone (last 10 digits) or email identify the guest on their own; else the name, allowing a one-letter slip
      const ph = String(phone || '').replace(/\D/g, '').slice(-10), em = String(email || '').trim().toLowerCase();
      const byContact = (ph.length >= 7 && guests.some(g => String(g.phone || '').replace(/\D/g, '').slice(-10) === ph)) || (em && guests.some(g => String(g.email || '').trim().toLowerCase() === em));
      if ((ph.length >= 7 || em) && !n && !byContact) continue;
      if (n && !byContact && !guests.some(g => norm(g.name).includes(n) || nameMatches(n, g.name))) continue;
      const fo = await get(`folios?select=id&registration_id=eq.${encodeURIComponent(r.id)}`);   // all folios (balance)
      const items = fo.length ? await get(`folio_items?select=qty,unit_price,tax_rate&folio_id=in.(${fo.map(f => f.id).join(',')})`) : [];
      const bal = items.reduce((t, x) => t + Number(x.qty) * Number(x.unit_price) * (1 + (Number(x.tax_rate) || 0) / 100), 0);
      const fs = fo.length ? await get(`folios?select=id,name,guest_name,status&registration_id=eq.${encodeURIComponent(r.id)}`) : [];
      out.push({ regId: r.id, guests: guests.map(g => g.name).join(' & '), room: r.room, checkIn: s, checkOut: e, reservation: bk.booking_type === 'room_only' ? 'Room Only (' + (bk.retreat_name || '') + ')' : 'Retreat: ' + (bk.retreat_name || bk.leader_name),
        status: r.checked_out_at ? 'checked out' : r.checked_in_at ? 'checked in' : 'not checked in yet', folioBalanceUSD: Math.round(bal * 100) / 100,
        folios: fs.map(f => ({ folioId: f.id, name: f.name || f.guest_name, status: f.status })) });
    }
  }
  return out.length ? out : { message: `No guest found for ${[name && 'name "' + name + '"', room && 'room ' + room, phone && 'phone ' + phone, email && 'email ' + email].filter(Boolean).join(' and ')} on ${day}.` };
}

// every question, for Jorge's 9 PM summary (ask-jorge-daily.js)
async function logQuestion(key, who, page, q, tools, proposed, notified) {
  const g = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.ask_jorge_log&select=value`, { headers: H(key) });
  const [row] = g.ok ? await g.json() : [];
  const list = [{ at: new Date().toISOString(), by: who.name || '', page: page || '', q: String(q || '').slice(0, 300), tools: [...new Set(tools)], proposed, notified }, ...(((row && row.value) || []).slice(0, 799))];
  await fetch(`${SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, { method: 'POST', headers: { ...H(key), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'ask_jorge_log', value: list, updated_at: new Date().toISOString() }) });
}

// what Ask Jorge DID: WhatsApp (a Utility template), email when none is approved
async function tellJorgeDone(who, page, summary) {
  const name = who.name || 'Alguien del staff';
  // Utility templates only (Jorge 2026-11-06): Meta filed the amansala_ask_jorge_* / amansala_portal_* ones as Marketing and did
  // not deliver them -- wa-utility-lib skips any template that is not APPROVED + UTILITY
  if (await sendUtility(JORGE_PHONE, [['portal_cambio_registrado', [name, summary, page || 'Portal']], ['amansala_portal_accion', [name, summary, page || 'Portal']]], 'es_MX', 'askj')) return;
  const e = v => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  await sendMail({ to: 'Jorge@amansala.com', subject: `Ask Jorge — ${name} hizo: ${String(summary).slice(0, 70)}`,
    html: `<p style="font-size:16px"><b>Ask Jorge</b></p><p><b>${e(name)}</b> hizo en el portal: ${e(summary)}</p><p style="color:#6b7280">Pantalla: ${e(page || 'Portal')}</p>` }).catch(() => {});
}
async function notifyJorge(key, who, page, request, reason) {
  const req = String(request || '').replace(/\s+/g, ' ').trim().slice(0, 600), why = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  const text = `Pidió: ${req}\nNo se pudo porque: ${why}`;
  // keep it
  try {
    const g = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.ask_jorge_questions&select=value`, { headers: H(key) });
    const [row] = g.ok ? await g.json() : [];
    const old = (row && row.value) || [];
    // a numbered request with a status, so Jorge marks it Fixed in the portal and the person is told (ask-jorge-requests.js)
    const n = 1 + Math.max(1000, ...old.map(x => Number(String(x.id || '').replace(/\D/g, '')) || 0));
    const list = [{ id: 'AJ-' + n, status: 'open', at: new Date().toISOString(), by: who.name || '', byId: who.sub || who.id || '', page: page || '', request: req, reason: why, summary: text }, ...old.slice(0, 299)];
    await fetch(`${SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, { method: 'POST', headers: { ...H(key), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'ask_jorge_questions', value: list, updated_at: new Date().toISOString() }) });
  } catch (e) {}
  // WhatsApp first (Jorge 2026-11-05): the Ask Jorge template, else the first approved one; email only if WhatsApp did not go
  const name = who.name || 'Alguien del staff';
  // Utility templates only (Jorge 2026-11-06): Meta filed amansala_ask_jorge_v2 as Marketing and did not deliver it
  const wa = await sendUtility(JORGE_PHONE, [['portal_solicitud_pendiente', [name, req || '-', why || '-', page || 'Portal']], ['amansala_portal_pendiente', [name, req || '-', why || '-', page || 'Portal']],
    ['amansala_pregunta_portal', [name, `Ask Jorge — pidió: ${req || '-'} · No se pudo porque: ${why || '-'}`, page || 'Portal']]], 'es_MX', 'askj') ? 'sent' : 'failed';
  if (wa === 'sent') return { sent: true, whatsapp: wa, email: 'not needed' };
  const e = v => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const mail = await sendMail({ to: 'Jorge@amansala.com', subject: `Ask Jorge — ${who.name || 'staff'}: ${req.slice(0, 70)}`,
    html: `<p style="font-size:16px"><b>Ask Jorge</b></p><p><b>${e(who.name || 'Alguien del staff')}</b> pidió: ${e(req)}</p><p><b>No se pudo porque:</b> ${e(why)}</p><p style="color:#6b7280">Pantalla: ${e(page || 'Portal')}</p>` }).catch(() => false);
  return { sent: wa === 'sent' || mail, whatsapp: wa, email: mail ? 'sent' : 'failed' };
}

// the Lana (Visito) spa tools, called from here with their own secret
async function visitoTool(file, args) {
  const fn = require('./' + file);
  const r = await fn.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + (process.env.VISITO_TOOL_SECRET || '') }, body: JSON.stringify({ arguments: args || {} }) });
  try { return JSON.parse(r.body); } catch (e) { return { success: false, message: 'no answer' }; }
}
const rk = s => String(s || '').toLowerCase().replace(/[\s-]/g, '');
async function roomAvailability(key, { checkIn, checkOut, roomType = '', room = '' }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn || '') || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut || '') || checkOut <= checkIn) return { error: 'checkIn / checkOut as YYYY-MM-DD, checkOut after checkIn' };
  const get = async p => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H(key) }); return r.ok ? r.json() : []; };
  const [types, bks] = await Promise.all([get('room_types?select=id,name,rooms'), get(`bookings?select=id,blocked_rooms,start_date,end_date,retreat_name,leader_name&status=neq.cancelled&start_date=lt.${checkOut}&end_date=gt.${checkIn}&limit=2000`)]);
  const taken = new Map(); bks.forEach(b => (b.blocked_rooms || []).forEach(r => taken.set(rk(r), b.retreat_name || b.leader_name)));
  const out = [];
  for (const t of types) {
    if (roomType && !rk(t.name).includes(rk(roomType))) continue;
    for (const r of (t.rooms || [])) { if (room && rk(r) !== rk(room)) continue; out.push({ room: r, type: t.name, free: !taken.has(rk(r)), takenBy: taken.get(rk(r)) || null }); }
  }
  return room ? out : { free: out.filter(x => x.free).map(x => x.room + ' (' + x.type + ')').slice(0, 80), freeCount: out.filter(x => x.free).length };
}

// a phone written without its country code: 10 digits (984 452 3336, or "+9844523336") is Mexico, +52 (Jorge 2026-11-05)
function mxPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) return '+52' + d;
  if (d.length === 12 && d.startsWith('52')) return '+' + d;
  if (d.length === 13 && d.startsWith('521')) return '+52' + d.slice(3);
  return d ? '+' + d : '';
}
const PAY_METHODS = ['Cash', 'Zelle', 'Venmo', 'Paypal', 'Bank Transfer', 'Clip', 'Expedia Collect'];
const money = n => '$' + Number(n).toFixed(2);
// Checks a proposed action against the database and returns it complete (with a human summary), or {error}
async function checkAction(key, a, who = {}) {
  const get = async p => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H(key) }); return r.ok ? r.json() : []; };
  const t = String(a.type || '');
  const more = await A.check(key, a, who); if (more) return more;
  const regOf = async id => { const [r] = await get(`registrations?select=id,room,guests,booking_id,checked_in_at,checked_out_at,cancelled,internal_notes,ac_24h&id=eq.${encodeURIComponent(String(id || ''))}`); return r && !r.cancelled ? r : null; };
  const names = r => (r.guests || []).filter(g => g && g.name && !g.cancelled).map(g => g.name).join(' & ') || 'guest';
  if (t === 'add_charge' || t === 'record_payment') {
    const [f] = await get(`folios?select=id,name,guest_name,status,registration_id,booking_request_id&id=eq.${encodeURIComponent(String(a.folioId || ''))}`);
    if (!f) return { error: 'That folio was not found — look the guest up again.' };
    if (f.status !== 'open') return { error: 'That folio is closed; it cannot take more lines.' };
    const reg = f.registration_id ? await regOf(f.registration_id) : null;
    const where = `${f.name || f.guest_name || 'folio'}${reg ? ' · room ' + reg.room : ''}`;
    if (t === 'add_charge') {
      const qty = Math.max(1, Math.round(Number(a.qty) || 1)), price = Math.round(Number(a.unitPrice) * 100) / 100, tax = a.taxRate == null ? 0 : Number(a.taxRate);
      const desc = String(a.description || '').trim().slice(0, 200), cat = String(a.category || 'Other');
      if (!desc || !(price > 0) || price > 50000 || !(tax >= 0 && tax <= 30)) return { error: 'The charge needs a description, a positive price and a tax between 0 and 30%.' };
      const total = qty * price * (1 + tax / 100);
      return { action: { type: t, folioId: f.id, regId: reg && reg.id, bookingId: reg && reg.booking_id, description: desc, category: cat, qty, unitPrice: price, taxRate: tax },
        summary: `Add charge "${desc}" (${cat}) ${qty} × ${money(price)}${tax ? ' + ' + tax + '% tax' : ''} = ${money(total)} to ${where}` };
    }
    const amt = Math.round(Number(a.amount) * 100) / 100, method = String(a.method || '');
    if (!PAY_METHODS.includes(method)) return { error: 'Payment method must be one of: ' + PAY_METHODS.join(', ') + ' (card payments through Stripe are done in the folio screen).' };
    if (!(amt > 0) || amt > 100000) return { error: 'The payment needs a positive amount.' };
    return { action: { type: t, folioId: f.id, regId: reg && reg.id, bookingId: reg && reg.booking_id, method, amount: amt, reference: String(a.reference || '').trim().slice(0, 120) },
      summary: `Record payment ${money(amt)} by ${method}${a.reference ? ' (' + String(a.reference).slice(0, 60) + ')' : ''} on ${where}` };
  }
  const other = await checkOtherAction(key, a); if (other) return other;
  const reg = await regOf(a.regId);
  if (!reg) return { error: 'That guest/registration was not found — look the guest up again.' };
  const base = { regId: reg.id, bookingId: reg.booking_id };
  if (t === 'check_in') { if (reg.checked_in_at) return { error: names(reg) + ' is already checked in.' }; return { action: { type: t, ...base }, summary: `Check in ${names(reg)} · room ${reg.room}` }; }
  if (t === 'check_out') { if (reg.checked_out_at) return { error: names(reg) + ' is already checked out.' }; return { action: { type: t, ...base }, summary: `Check out ${names(reg)} · room ${reg.room}` }; }
  if (t === 'internal_note') { const note = String(a.note || '').trim().slice(0, 500); if (!note) return { error: 'Write the note.' }; return { action: { type: t, ...base, note }, summary: `Add internal note to ${names(reg)} · room ${reg.room}: "${note}"` }; }
  if (t === 'ac24') { const on = !!a.on; return { action: { type: t, ...base, on }, summary: `${on ? 'Turn ON' : 'Turn OFF'} A/C 24 horas · ${names(reg)} · room ${reg.room}` }; }
  if (t === 'move_room') {
    const to = String(a.toRoom || '').trim();
    const [bk] = await get(`bookings?select=id,start_date,end_date,blocked_rooms&id=eq.${encodeURIComponent(reg.booking_id)}`);
    const av = await roomAvailability(key, { checkIn: bk.start_date, checkOut: bk.end_date, room: to });
    const hit = Array.isArray(av) ? av[0] : null;
    if (!hit) return { error: `Room ${to} does not exist.` };
    if (!hit.free && !(bk.blocked_rooms || []).some(r => rk(r) === rk(to))) return { error: `Room ${to} is taken by ${hit.takenBy} on those dates.` };
    if (rk(to) === rk(reg.room)) return { error: 'The guest is already in that room.' };
    return { action: { type: t, ...base, fromRoom: reg.room, toRoom: hit.room, client: true }, summary: `Move ${names(reg)} from room ${reg.room} to ${hit.room} (${hit.type}) — rate kept, Cloudbeds updated` };
  }
  return { error: 'That action is not available here.' };
}
// actions that do not start from a guest registration
async function checkOtherAction(key, a) {
  const t = String(a.type || '');
  const get = async p => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H(key) }); return r.ok ? r.json() : []; };
  if (t === 'send_payment_link') {
    const [f] = await get(`folios?select=id,name,guest_name,status,payment_token,registration_id,booking_request_id&id=eq.${encodeURIComponent(String(a.folioId || ''))}`);
    if (!f || !f.payment_token) return { error: 'That folio was not found.' };
    let email = '', phone = '', manual = false, bookingId = null;
    if (f.registration_id) {
      const [r] = await get(`registrations?select=guests,booking_id&id=eq.${encodeURIComponent(f.registration_id)}`);
      const gs = ((r && r.guests) || []).filter(g => g && g.name);
      const g = gs.find(x => norm(x.name) === norm(f.guest_name)) || gs[0] || {};
      const [bk] = r ? await get(`bookings?select=leader_email,leader_phone,booking_type&id=eq.${encodeURIComponent(r.booking_id)}`) : [];
      email = g.email || (bk && bk.leader_email) || ''; phone = g.phone || (bk && bk.leader_phone) || ''; manual = !!(bk && bk.booking_type === 'room_only'); bookingId = r && r.booking_id;
    } else if (f.booking_request_id) { const [q] = await get(`booking_requests?select=email,phone&id=eq.${encodeURIComponent(f.booking_request_id)}`); email = (q && q.email) || ''; phone = (q && q.phone) || ''; }
    if (!email && !phone) return { error: 'The guest has no email or phone on the reservation — add one first.' };
    return { action: { type: t, folioId: f.id, token: f.payment_token, guestName: f.guest_name || f.name, email, phone, manual, bookingId }, summary: `Send the payment link of folio "${f.name || f.guest_name}" to ${[email, phone].filter(Boolean).join(' and ')}` };
  }
  if (t === 'spa_booking') {
    // phone OR email is enough (Jorge 2026-11-07)
    const need = ['serviceId', 'date', 'start', 'therapistId', 'firstName', 'lastName', 'guestType'].filter(k => !a[k]);
    if (!a.email && !a.phone) need.push('email or phone');
    if (need.length) return { error: 'Missing: ' + need.join(', ') };
    // a guest staying in the hotel that day is always charged to the room (no payment link), whatever was asked
    try {
      let stays = await findGuest(key, { name: `${a.firstName} ${a.lastName}`, date: a.date });
      if (!Array.isArray(stays) && (a.phone || a.email)) stays = await findGuest(key, { phone: a.phone || '', email: a.email || '', date: a.date });
      const st = Array.isArray(stays) ? stays.find(x => x.status !== 'checked out') : null;
      if (st) { a.guestType = 'hotel'; a.roomNumber = st.room; }
    } catch (e) {}
    if (a.guestType === 'hotel' && !a.roomNumber) return { error: 'For a hotel guest I need their room number.' };
    a.phone = a.phone ? mxPhone(a.phone) : '';
    const [row] = await get('app_store?key=eq.spa_data&select=value');
    const svc = (((row && row.value) || {}).services || []).find(x => x && x.id === a.serviceId && x.active);
    if (!svc) return { error: 'That spa service was not found — list the services again.' };
    const sname = svc.name;
    return { action: { type: t, serviceId: a.serviceId, date: a.date, start: a.start, therapistId: a.therapistId, roomId: a.spaRoomId || null, firstName: a.firstName, lastName: a.lastName, email: a.email, phone: a.phone, guestType: a.guestType, roomNumber: a.roomNumber || null, guestCount: a.guestCount || null },
      summary: `Book ${sname} for ${a.firstName} ${a.lastName} on ${a.date} at ${a.start}${a.guestType === 'hotel' ? ' (room ' + a.roomNumber + ', charged to the room)' : ' (outside guest: payment link by email/WhatsApp)'}` };
  }
  if (t === 'new_booking') {
    const room = String(a.room || '').trim(), ci = String(a.checkIn || ''), co = String(a.checkOut || ''), name = String(a.guestName || '').trim();
    a.phone = mxPhone(a.phone);
    if (!room || !name) return { error: 'I need the room and the guest name.' };
    const av = await roomAvailability(key, { checkIn: ci, checkOut: co, room });
    if (av.error) return av;
    const hit = Array.isArray(av) ? av[0] : null;
    if (!hit) return { error: `Room ${room} does not exist.` };
    if (!hit.free) return { error: `Room ${room} is taken by ${hit.takenBy} on those dates.` };
    const rate = Math.round(Number(a.ratePerNight) * 100) / 100, adults = Math.max(1, Math.round(Number(a.adults) || 1));
    if (!(rate >= 0)) return { error: 'I need the rate per night.' };
    const nights = Math.round((Date.parse(co) - Date.parse(ci)) / 86400000);
    const type = ['Walk-in', 'Direct', 'Booking.com', 'Expedia', 'Air BnB', 'OTA'].includes(a.bookingType) ? a.bookingType : 'Walk-in';
    return { action: { type: t, room: hit.room, checkIn: ci, checkOut: co, guestName: name, email: String(a.email || '').trim(), phone: String(a.phone || '').trim(), adults, rate, bookingType: type, notes: String(a.notes || '').slice(0, 400), client: true },
      summary: `New ${type} reservation: ${name}, room ${hit.room} (${hit.type}), ${ci} → ${co} (${nights} night${nights === 1 ? '' : 's'}), ${adults} guest${adults === 1 ? '' : 's'}, $${rate.toFixed(2)}/night${a.email || a.phone ? ' — payment link to the guest' : ''}; also created in Cloudbeds` };
  }
  return null;
}
async function runAction(key, who, a, token) {
  const chk = await checkAction(key, a, who);
  if (chk.error) return { ok: false, message: chk.error };
  const x = chk.action, now = new Date().toISOString();
  if (x.client) return { ok: false, message: 'This one runs in the portal screen — press Confirm again after reloading.' };
  if (A.TYPES.includes(x.type)) chk.summary += await A.run(key, who, x, token);
  else {
  const send = async (method, path, body) => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers: { ...H(key), Prefer: 'return=minimal' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error((await r.text()).slice(0, 200)); };
  if (x.type === 'add_charge') await send('POST', 'folio_items', { folio_id: x.folioId, description: x.description, qty: x.qty, unit_price: x.unitPrice, tax_rate: x.taxRate, category: x.category, staff_name: who.name || null });
  else if (x.type === 'record_payment') await send('POST', 'folio_items', { folio_id: x.folioId, description: `Payment — ${x.method}${x.reference ? ': ' + x.reference : ''}`, qty: 1, unit_price: -x.amount, tax_rate: 0, category: 'Payment', staff_name: who.name || null });
  else if (x.type === 'send_payment_link') {
    const fn = require('./send-folio-payment-link');
    const r = await fn.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ token: x.token, guestName: x.guestName, email: x.email, phone: x.phone, manual: x.manual }) });
    const d = JSON.parse(r.body || '{}'); if (r.statusCode >= 300 || d.error) throw new Error(d.error || 'not sent');
    chk.summary += ` (email: ${(d.results || {}).email || '-'}, WhatsApp: ${(d.results || {}).whatsapp || '-'})`; x.bookingId = x.bookingId || null;
  }
  else if (x.type === 'spa_booking') {
    const { type, ...args } = x; const d = await visitoTool('visito-spa-create-booking', args);
    if (!d || d.success === false || d.error) throw new Error((d && (d.message || d.error)) || 'not booked');
    if (d.paymentUrl) {
      // the spa tool (made for Lana, who pastes the link in the chat) only emails it: send it by WhatsApp too (Jorge 2026-11-05,
      // Hilario got no WhatsApp), with the approved template manual_booking_payment_link
      const to = String(x.phone || '').replace(/\D/g, '');
      let waOk = false;
      if (to.length >= 11 && process.env.VISITO_M2M_KEY && process.env.VISITO_WA_CHANNEL_ID) {
        try {
          // formal, in English, with the treatment, duration, date, time and total -- never the therapist (Jorge 2026-11-05):
          // template spa_payment_request; the short manual_booking_payment_link while Meta has not approved it
          const send = async (name, params) => {
            const r = await fetch(`https://platform-api.visitoai.com/m2m/v1/whatsapp-templates/${encodeURIComponent(process.env.VISITO_WA_CHANNEL_ID)}/send`, {
              method: 'POST', headers: { Authorization: `Bearer ${process.env.VISITO_M2M_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `spa-link-${name}-${to}-${x.date}-${x.start}-${Date.now()}` },
              body: JSON.stringify({ to, template: { name, language: { code: 'en_US' }, components: [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: String(t) })) }] } }),
            });
            const j = await r.json().catch(() => ({})); return r.ok && j.accepted !== false;
          };
          const dateLong = new Date(x.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
          const [hh, mm] = String(x.start).split(':').map(Number), time = `${((hh % 12) || 12)}:${String(mm || 0).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
          const price = Number(d.priceUSD) || 0, total = `$${(price * 1.13).toFixed(2)} USD (13% tax included)`;
          const mins = d.durationMinutes ? `${d.durationMinutes} minutes` : 'see your email';
          waOk = await send('spa_payment_request', [x.firstName || 'Guest', d.serviceName || 'Spa treatment', mins, dateLong, time, total, d.paymentUrl])
            || await send('manual_booking_payment_link', [x.firstName || 'there', d.paymentUrl]);
        } catch (e) {}
      }
      const byMail = !!x.email;
      chk.summary += ` — payment link sent${byMail ? ' by email' : ''}${waOk ? (byMail ? ' and' : ' by') + ' WhatsApp' : (to ? ' (WhatsApp could not be sent' + (to.length < 11 ? ': the phone needs its country code' : '') + ')' : '')}${!byMail && !waOk ? ' — nothing could be sent, share this link: ' + d.paymentUrl : ''}`;
    } else chk.summary += ' — charged to the room';
  }
  else if (x.type === 'check_in') await send('PATCH', `registrations?id=eq.${encodeURIComponent(x.regId)}`, { checked_in_at: now });
  else if (x.type === 'check_out') await send('PATCH', `registrations?id=eq.${encodeURIComponent(x.regId)}`, { checked_out_at: now });
  else if (x.type === 'internal_note') {
    const [r] = await (await fetch(`${SUPABASE_URL}/rest/v1/registrations?select=internal_notes&id=eq.${encodeURIComponent(x.regId)}`, { headers: H(key) })).json();
    const prev = String((r && r.internal_notes) || '').trim();
    await send('PATCH', `registrations?id=eq.${encodeURIComponent(x.regId)}`, { internal_notes: (prev ? prev + '\n' : '') + x.note + ' — ' + (who.name || 'staff') });
  } else if (x.type === 'ac24') await send('PATCH', `registrations?id=eq.${encodeURIComponent(x.regId)}`, { ac_24h: x.on });
  }
  const label = { add_charge: 'Charge added', record_payment: 'Payment recorded', check_in: 'Checked in', check_out: 'Checked out', internal_note: 'Internal note', ac24: 'A/C 24h', send_payment_link: 'Payment link sent', spa_booking: 'Spa booking', remove_charge: 'Charge removed', edit_charge: 'Charge corrected', refund_payment: 'Payment refunded', spa_cancel: 'Spa appointment cancelled', spa_move: 'Spa appointment moved', therapist_confirm: 'Spa confirmation sent to therapist', transport_change: 'Transport changed', room_status: 'Room status', cloudbeds_fix: 'Cloudbeds fixed', teacher_room: 'Group leader marked', set_leader: 'Reservation leader changed' }[x.type];
  await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, { method: 'POST', headers: { ...H(key), Prefer: 'return=minimal' },
    body: JSON.stringify({ id: 'id_' + Date.now() + '_askj', action: label, detail: chk.summary + ' (Ask Jorge)', booking_id: x.bookingId || null, user_name: who.name || 'Staff', user_role: who.role || 'staff', created_at: now }) }).catch(() => {});
  return { ok: true, message: '✓ ' + chk.summary };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid request' }); }
  const who = await staffAllowed({ headers: event.headers || {}, body: JSON.stringify({ token: b.token }) });
  if (!who) return reply(401, { error: 'Sign in again.' });
  const apiKey = process.env.ANTHROPIC_API_KEY, key = process.env.SUPABASE_SERVICE_KEY;
  if (!apiKey || !key) return reply(500, { error: 'The assistant is not configured.' });
  const page = String(b.page || '').slice(0, 60);
  if (b.clientFailed) {   // a move / new reservation that failed in the person's tab
    await notifyJorge(key, who, page, `Confirmó una acción: ${String(b.clientFailed.summary || '')}`, `falló — ${String(b.clientFailed.message || '')}`).catch(() => {});
    return reply(200, { ok: true });
  }
  if (b.logClient) {   // a move / new reservation done in the person's tab: write it in the activity log
    const x = b.logClient;
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, { method: 'POST', headers: { ...H(key), Prefer: 'return=minimal' },
      body: JSON.stringify({ id: 'id_' + Date.now() + '_askj', action: x.type === 'move_room' ? 'Room moved' : 'Room-only booking created', detail: String(x.summary || '').slice(0, 900) + ' (Ask Jorge)', booking_id: x.bookingId || null, user_name: who.name || 'Staff', user_role: who.role || 'staff', created_at: new Date().toISOString() }) }).catch(() => {});
    await tellJorgeDone(who, page, String(x.summary || '')).catch(() => {});
    return reply(200, { ok: true });
  }
  if (b.execute) {   // the person pressed Confirm on a proposed action
    let res;
    try { res = await runAction(key, who, b.execute, b.token); }
    catch (e) { console.error('[ask-jorge] action', e.message); res = { ok: false, message: 'It could not be saved: ' + e.message }; }
    if (!res.ok) await notifyJorge(key, who, page, `Confirmó una acción: ${String(b.summary || b.execute.type || '')}`, `falló — ${res.message}`).catch(() => {});
    else if (b.execute.type !== 'record_payment') await tellJorgeDone(who, page, String(res.message || '').replace(/^✓\s*/, '')).catch(() => {});   // staff-recorded payments: no alert (Jorge 2026-11-06)
    return reply(200, { ...res, notifiedJorge: !res.ok });
  }
  const history = (Array.isArray(b.messages) ? b.messages : []).slice(-16)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!history.length || history[history.length - 1].role !== 'user') return reply(400, { error: 'Write a question.' });
  const messages = history.slice(); let notified = null; const proposals = [];
  const memo = (Array.isArray(b.memo) ? b.memo : []).slice(-8).map(m => String(m).slice(0, 300));
  const system = [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `The person asking: ${who.name || 'staff'}. Screen they are on: ${page || 'unknown'}. Today (Tulum): ${tulumDate()}.` + (memo.length ? `\nGuests already looked up in this chat (use these ids; "she", "him", "that guest" means the last one): ${memo.join(' | ')}` : '') }];
  const found = [], used = [];
  try {
    for (let turn = 0; turn < 5; turn++) {
      const r = await fetch(ANTHROPIC_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1500, output_config: { effort: 'low' }, system, tools: TOOLS, messages }),
      });
      const j = await r.json();
      if (!r.ok) { console.error('[ask-jorge] api', r.status, JSON.stringify(j).slice(0, 300)); return reply(502, { error: 'The assistant is busy, try again in a moment.' }); }
      if (j.stop_reason === 'refusal') return reply(200, { answer: 'No puedo ayudar con eso. Si es algo del portal, pregúntaselo a Jorge directamente.' });
      const content = j.content || [];
      const uses = content.filter(c => c.type === 'tool_use');
      if (j.stop_reason !== 'tool_use' || !uses.length) {
        const answer = content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
        console.log('[ask-jorge]', who.name, page, JSON.stringify(j.usage || {}));
        await logQuestion(key, who, page, history[history.length - 1].content, used, proposals.length, !!notified).catch(() => {});
        return reply(200, { answer: answer || '…', notified, proposals, memo: found });
      }
      messages.push({ role: 'assistant', content });
      const results = [];
      for (const u of uses) {
        let out; used.push(u.name);
        try {
          if (u.name === 'find_guest') { out = await findGuest(key, u.input || {}); if (Array.isArray(out)) out.slice(0, 3).forEach(g => found.push(`${g.guests} · room ${g.room} · ${g.checkIn}→${g.checkOut} · regId ${g.regId} · folios ${(g.folios || []).map(f => f.folioId).join(',')}`)); }
          else if (u.name === 'room_availability') out = await roomAvailability(key, u.input || {});
          else if (u.name === 'quote_room_rate') out = await visitoTool('visito-check-availability', { adults: 1, stayType: 'extra_night', ...(u.input || {}) });
          else if (u.name === 'stay_folios') out = await T.stayFolios(key, (u.input || {}).regId);
          else if (u.name === 'extra_nights') out = await T.extraNights(key, (u.input || {}).regId);
          else if (u.name === 'arrivals_departures') out = await T.arrivalsDepartures(key, u.input || {});
          else if (u.name === 'reservation_problems') out = await T.reservationProblems(key, u.input || {});
          else if (u.name === 'spa_agenda') out = await T.spaAgenda(key, u.input || {});
          else if (u.name === 'find_reservation') out = await T.findReservation(key, u.input || {});
          else if (u.name === 'transports') out = await A.transports(key, u.input || {});
          else if (u.name === 'cloudbeds_compare') out = await A.cloudbedsCompare(key, (u.input || {}).regId);
          else if (u.name === 'spa_services') {
            const [row] = await (await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_data&select=value`, { headers: H(key) })).json();
            out = (((row && row.value) || {}).services || []).filter(x => x && x.active).map(x => ({ serviceId: x.id, name: x.name, minutes: x.duration, priceUSD: x.price, group: x.sessionType === 'group', category: x.category }));
          }
          else if (u.name === 'spa_availability') out = await visitoTool('visito-spa-check-availability', u.input || {});
          else if (u.name === 'propose_action') { const c = await checkAction(key, u.input || {}, who); if (c.error) out = { error: c.error }; else { proposals.push(c); out = { proposed: true, waitingForTheirConfirmation: true, summary: c.summary }; } }
          else if (u.name === 'notify_jorge') { if (notified) out = { already: true }; else { notified = await notifyJorge(key, who, page, (u.input || {}).request || (u.input || {}).summary, (u.input || {}).reason); out = { sentToJorge: !!notified.sent }; } }
          else out = { error: 'unknown tool' };
        } catch (e) { out = { error: e.message }; }
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out).slice(0, 8000) });
      }
      messages.push({ role: 'user', content: results });
    }
    return reply(200, { answer: 'Me tardé demasiado en responder. Intenta otra vez con una pregunta más corta.', notified, proposals });
  } catch (e) {
    console.error('[ask-jorge]', e);
    return reply(502, { error: 'Connection problem, try again.' });
  }
};
