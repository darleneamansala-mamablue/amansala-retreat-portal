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

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-5-5';
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
- Things you cannot do (refunds, cancelling, deleting, charging a card with Stripe): explain how they do it
  themselves, step by step.
- If it needs a decision (money, refunds, discounts, comps, who pays) or looks like a system error, call notify_jorge with a
  clear one-paragraph summary and tell them you sent it to Jorge and he will reply by WhatsApp.
- Never invent prices, policies or reservation details.

STAFF GUIDE
${KB}`;

const TOOLS = [
  { name: 'find_guest', description: 'Find guests staying in the hotel (or arriving/leaving) on a date, by name and/or room. Read-only. Returns room, dates, reservation/retreat, checked-in status and the balance still owed on their folios.',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Guest name or part of it' }, room: { type: 'string', description: 'Room, e.g. 13b, GV16, CH2' }, date: { type: 'string', description: 'YYYY-MM-DD, default today (Tulum)' } } } },
  { name: 'room_availability', description: 'Free rooms for a date range (optionally only one room type or one room). Read-only.',
    input_schema: { type: 'object', properties: { checkIn: { type: 'string' }, checkOut: { type: 'string' }, roomType: { type: 'string' }, room: { type: 'string' } }, required: ['checkIn', 'checkOut'] } },
  { name: 'spa_services', description: 'List the active spa services (id, name, duration, price). Read-only.', input_schema: { type: 'object', properties: {} } },
  { name: 'spa_availability', description: 'Free times for a spa service on a date (with therapist and spa room ids to book). Read-only.',
    input_schema: { type: 'object', properties: { serviceId: { type: 'string' }, date: { type: 'string' }, therapistPreference: { type: 'string', enum: ['none', 'male', 'female'] }, guestCount: { type: 'number' } }, required: ['serviceId', 'date'] } },
  { name: 'propose_action', description: 'Propose a change for the person to confirm with a button (nothing is saved until they confirm). Types: add_charge (folioId, description, category, qty, unitPrice USD before tax, taxRate %), record_payment (folioId, method, amount USD, reference), check_in (regId), check_out (regId), internal_note (regId, note), ac24 (regId, on true/false), move_room (regId, toRoom), spa_booking (serviceId, date, start HH:MM, therapistId, spaRoomId, firstName, lastName, email, phone, guestType hotel|offsite, roomNumber for hotel guests, guestCount for groups), new_booking (room, checkIn, checkOut, guestName, email, phone, adults, ratePerNight, bookingType, notes), send_payment_link (folioId).',
    input_schema: { type: 'object', properties: {
      type: { type: 'string', enum: ['add_charge', 'record_payment', 'check_in', 'check_out', 'internal_note', 'ac24', 'move_room', 'spa_booking', 'new_booking', 'send_payment_link'] },
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
  { name: 'notify_jorge', description: 'Send this question to Jorge by WhatsApp and email when you cannot solve it or it needs his decision.',
    input_schema: { type: 'object', properties: { summary: { type: 'string', description: 'What the staff member needs, in Spanish, one short paragraph, with names/rooms/amounts involved' } }, required: ['summary'] } },
];

const H = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const tulumDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&amp;/g, '&').trim();

async function findGuest(key, { name = '', room = '', date = '' }) {
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
      if (n && !guests.some(g => norm(g.name).includes(n) || n.split(/\s+/).every(t => norm(g.name).includes(t)))) continue;
      const fo = await get(`folios?select=id&registration_id=eq.${encodeURIComponent(r.id)}`);   // all folios (balance)
      const items = fo.length ? await get(`folio_items?select=qty,unit_price,tax_rate&folio_id=in.(${fo.map(f => f.id).join(',')})`) : [];
      const bal = items.reduce((t, x) => t + Number(x.qty) * Number(x.unit_price) * (1 + (Number(x.tax_rate) || 0) / 100), 0);
      const fs = fo.length ? await get(`folios?select=id,name,guest_name,status&registration_id=eq.${encodeURIComponent(r.id)}`) : [];
      out.push({ regId: r.id, guests: guests.map(g => g.name).join(' & '), room: r.room, checkIn: s, checkOut: e, reservation: bk.booking_type === 'room_only' ? 'Room Only (' + (bk.retreat_name || '') + ')' : 'Retreat: ' + (bk.retreat_name || bk.leader_name),
        status: r.checked_out_at ? 'checked out' : r.checked_in_at ? 'checked in' : 'not checked in yet', folioBalanceUSD: Math.round(bal * 100) / 100,
        folios: fs.map(f => ({ folioId: f.id, name: f.name || f.guest_name, status: f.status })) });
    }
  }
  return out.length ? out : { message: `No guest found for ${[name && 'name "' + name + '"', room && 'room ' + room].filter(Boolean).join(' and ')} on ${day}.` };
}

async function notifyJorge(key, who, page, summary) {
  const text = String(summary || '').slice(0, 900);
  // keep it
  try {
    const g = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.ask_jorge_questions&select=value`, { headers: H(key) });
    const [row] = g.ok ? await g.json() : [];
    const list = [{ at: new Date().toISOString(), by: who.name || '', page: page || '', summary: text }, ...(((row && row.value) || []).slice(0, 199))];
    await fetch(`${SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, { method: 'POST', headers: { ...H(key), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'ask_jorge_questions', value: list, updated_at: new Date().toISOString() }) });
  } catch (e) {}
  let wa = 'skipped';
  const visitoKey = process.env.VISITO_M2M_KEY, channelId = process.env.VISITO_WA_CHANNEL_ID;
  if (visitoKey && channelId) {
    try {
      const r = await fetch(`https://platform-api.visitoai.com/m2m/v1/whatsapp-templates/${encodeURIComponent(channelId)}/send`, {
        method: 'POST', headers: { Authorization: `Bearer ${visitoKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: JORGE_PHONE, template: { name: 'amansala_pregunta_portal', language: { code: 'es_MX' }, components: [{ type: 'body', parameters: [who.name || 'Alguien del staff', text, page || 'Portal'].map(t => ({ type: 'text', text: String(t).replace(/\s*\n\s*/g, ' ').slice(0, 900) })) }] } }),
      });
      const j = await r.json().catch(() => ({})); wa = r.ok && j.accepted !== false ? 'sent' : 'failed';
    } catch (e) { wa = 'failed'; }
  }
  const mail = await sendMail({ to: 'Jorge@amansala.com', subject: `Ask Jorge — pregunta de ${who.name || 'staff'}`,
    html: `<p><b>${(who.name || 'Alguien del staff')}</b> preguntó en el portal (${page || 'Portal'}) y el asistente no pudo resolverlo:</p><p style="white-space:pre-wrap">${text.replace(/</g, '&lt;')}</p>` }).catch(() => false);
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

const PAY_METHODS = ['Cash', 'Zelle', 'Venmo', 'Paypal', 'Bank Transfer', 'Clip', 'Expedia Collect'];
const money = n => '$' + Number(n).toFixed(2);
// Checks a proposed action against the database and returns it complete (with a human summary), or {error}
async function checkAction(key, a) {
  const get = async p => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H(key) }); return r.ok ? r.json() : []; };
  const t = String(a.type || '');
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
    const need = ['serviceId', 'date', 'start', 'therapistId', 'firstName', 'lastName', 'email', 'phone', 'guestType'].filter(k => !a[k]);
    if (need.length) return { error: 'Missing: ' + need.join(', ') };
    if (a.guestType === 'hotel' && !a.roomNumber) return { error: 'For a hotel guest I need their room number.' };
    const svcs = await visitoTool('visito-spa-list-services', {});
    const svc = ((svcs && (svcs.services || svcs.data)) || []).find(x => x.id === a.serviceId || x.serviceId === a.serviceId);
    const sname = svc ? (svc.name || svc.serviceName) : a.serviceId;
    return { action: { type: t, serviceId: a.serviceId, date: a.date, start: a.start, therapistId: a.therapistId, roomId: a.spaRoomId || null, firstName: a.firstName, lastName: a.lastName, email: a.email, phone: a.phone, guestType: a.guestType, roomNumber: a.roomNumber || null, guestCount: a.guestCount || null },
      summary: `Book ${sname} for ${a.firstName} ${a.lastName} on ${a.date} at ${a.start}${a.guestType === 'hotel' ? ' (room ' + a.roomNumber + ', charged to the room)' : ' (outside guest: payment link by email/WhatsApp)'}` };
  }
  if (t === 'new_booking') {
    const room = String(a.room || '').trim(), ci = String(a.checkIn || ''), co = String(a.checkOut || ''), name = String(a.guestName || '').trim();
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
async function runAction(key, who, a) {
  const chk = await checkAction(key, a);
  if (chk.error) return { ok: false, message: chk.error };
  const x = chk.action, now = new Date().toISOString();
  if (x.client) return { ok: false, message: 'This one runs in the portal screen — press Confirm again after reloading.' };
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
    chk.summary += d.paymentUrl ? ' — payment link sent to the guest' : (d.folioCharged || d.charged ? ' — charged to the room' : '');
  }
  else if (x.type === 'check_in') await send('PATCH', `registrations?id=eq.${encodeURIComponent(x.regId)}`, { checked_in_at: now });
  else if (x.type === 'check_out') await send('PATCH', `registrations?id=eq.${encodeURIComponent(x.regId)}`, { checked_out_at: now });
  else if (x.type === 'internal_note') {
    const [r] = await (await fetch(`${SUPABASE_URL}/rest/v1/registrations?select=internal_notes&id=eq.${encodeURIComponent(x.regId)}`, { headers: H(key) })).json();
    const prev = String((r && r.internal_notes) || '').trim();
    await send('PATCH', `registrations?id=eq.${encodeURIComponent(x.regId)}`, { internal_notes: (prev ? prev + '\n' : '') + x.note + ' — ' + (who.name || 'staff') });
  } else if (x.type === 'ac24') await send('PATCH', `registrations?id=eq.${encodeURIComponent(x.regId)}`, { ac_24h: x.on });
  const label = { add_charge: 'Charge added', record_payment: 'Payment recorded', check_in: 'Checked in', check_out: 'Checked out', internal_note: 'Internal note', ac24: 'A/C 24h', send_payment_link: 'Payment link sent', spa_booking: 'Spa booking' }[x.type];
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
  if (b.logClient) {   // a move / new reservation done in the person's tab: write it in the activity log
    const x = b.logClient;
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, { method: 'POST', headers: { ...H(key), Prefer: 'return=minimal' },
      body: JSON.stringify({ id: 'id_' + Date.now() + '_askj', action: x.type === 'move_room' ? 'Room moved' : 'Room-only booking created', detail: String(x.summary || '').slice(0, 900) + ' (Ask Jorge)', booking_id: x.bookingId || null, user_name: who.name || 'Staff', user_role: who.role || 'staff', created_at: new Date().toISOString() }) }).catch(() => {});
    return reply(200, { ok: true });
  }
  if (b.execute) {   // the person pressed Confirm on a proposed action
    try { return reply(200, await runAction(key, who, b.execute)); }
    catch (e) { console.error('[ask-jorge] action', e.message); return reply(200, { ok: false, message: 'It could not be saved: ' + e.message }); }
  }
  const history = (Array.isArray(b.messages) ? b.messages : []).slice(-16)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!history.length || history[history.length - 1].role !== 'user') return reply(400, { error: 'Write a question.' });
  const messages = history.slice(); let notified = null; const proposals = [];
  const system = [{ type: 'text', text: SYSTEM + `\n\nThe person asking: ${who.name || 'staff'}. Screen they are on: ${page || 'unknown'}. Today (Tulum): ${tulumDate()}.`, cache_control: { type: 'ephemeral' } }];
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
        return reply(200, { answer: answer || '…', notified, proposals });
      }
      messages.push({ role: 'assistant', content });
      const results = [];
      for (const u of uses) {
        let out;
        try {
          if (u.name === 'find_guest') out = await findGuest(key, u.input || {});
          else if (u.name === 'room_availability') out = await roomAvailability(key, u.input || {});
          else if (u.name === 'spa_services') out = await visitoTool('visito-spa-list-services', {});
          else if (u.name === 'spa_availability') out = await visitoTool('visito-spa-check-availability', u.input || {});
          else if (u.name === 'propose_action') { const c = await checkAction(key, u.input || {}); if (c.error) out = { error: c.error }; else { proposals.push(c); out = { proposed: true, waitingForTheirConfirmation: true, summary: c.summary }; } }
          else if (u.name === 'notify_jorge') { if (notified) out = { already: true }; else { notified = await notifyJorge(key, who, page, (u.input || {}).summary); out = { sentToJorge: !!notified.sent }; } }
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
