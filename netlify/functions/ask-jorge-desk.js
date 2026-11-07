'use strict';

// ask-jorge-desk.js — more Ask Jorge abilities (Jorge 2026-11-07). Money / cash reports were left out on purpose (not for all staff).
// Front desk (any staff login):
//   missing_transport (read-only)    arrivals of the next days with no transport form, or without flight / time
//   send_transport_reminders         email + WhatsApp (guest_transport_form_reminder) with the group's transport form link
//   resend_confirmation              the booking confirmation again (Room Only / walk-in stays)
//   lost_item                        a lost & found item, written in the Housekeeping app (hk-push-external lostItem)
// Jorge only:
//   room_list_gaps (read-only)       upcoming retreats with rooms that still have no guest names
//   teacher_room_list_reminder       email + WhatsApp (teacher_room_list_reminder) to the leader with the link to the room list
//   retreat_status (read-only)       one retreat: contract, payments received, room list progress, deadlines
//   history_search (read-only) + restore_change   the change history (data_history) and its one-click restore
const T = require('./ask-jorge-tools');
const { sendUtility } = require('./wa-utility-lib');
const { sendMail } = require('./mail-lib');
const { getter, H, SUPABASE_URL, norm, tulumDate, addDays } = T;
const SITE = 'https://amansalaportal.com';
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const isJorge = who => /jorge/i.test(String((who && who.name) || ''));
const TYPES = ['send_transport_reminders', 'resend_confirmation', 'lost_item', 'teacher_room_list_reminder', 'restore_change'];
const JORGE_ONLY = ['teacher_room_list_reminder', 'restore_change'];
const longDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
const e164 = p => { const d = String(p || '').replace(/\D/g, ''); if (d.length < 10) return ''; if (d.length === 10) return '1' + d; return d; };
const esc = v => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ---------- front desk ----------
async function missingTransport(key, { days = 3 } = {}) {
  const get = getter(key);
  const n = Math.min(Math.max(parseInt(days, 10) || 3, 1), 10), out = [];
  const allTr = await get(`transport?select=id,booking_id,data&or=(data->>arrivalDate.gte.${tulumDate()},data->>arrivalDate.is.null)&limit=1000`);
  for (let i = 0; i < n; i++) {
    const day = addDays(tulumDate(), i);
    const arr = (await T.arrivalsDepartures(key, { date: day, kind: 'arrivals' })).arrivals || [];
    for (const a of arr) {
      const [r] = await get(`registrations?select=id,booking_id,guests&id=eq.${encodeURIComponent(a.regId)}`);
      if (!r) continue;
      const [bk] = await get(`bookings?select=booking_type,retreat_name&id=eq.${encodeURIComponent(r.booking_id)}`);
      if (bk && bk.booking_type === 'room_only') continue;   // walk-ins / online stays arrange their own rides
      (r.guests || []).filter(g => g && g.name && !g.cancelled).forEach(g => {
        const mine = allTr.filter(t => t.booking_id === r.booking_id && (norm(`${(t.data || {}).firstName || ''} ${(t.data || {}).lastName || ''}`) === norm(g.name) || (g.email && norm((t.data || {}).email) === norm(g.email))));
        const d = mine.length ? mine[0].data || {} : null;
        let why = null;
        if (!d) why = 'no transport form';
        else if (!d.arrivalOT && (!d.arrivalTime || !(d.flightNumber || '').trim())) why = 'form without flight number or time';
        if (why) out.push({ guest: g.name, email: g.email || '', phone: g.phone || '', room: a.room, arrival: day, bookingId: r.booking_id, retreat: (bk && bk.retreat_name) || a.reservation, why });
      });
    }
  }
  return { from: tulumDate(), days: n, missing: out, note: 'To remind them, propose send_transport_reminders with these guests (name, email, phone, arrival, bookingId).' };
}

// ---------- Jorge only ----------
async function roomListGaps(key, { days = 45 } = {}) {
  const get = getter(key);
  const until = addDays(tulumDate(), Math.min(Math.max(parseInt(days, 10) || 45, 1), 180));
  const bks = await get(`bookings?select=id,leader_name,retreat_name,leader_email,leader_phone,start_date,end_date,status,blocked_rooms,booking_type&status=neq.cancelled&start_date=gte.${tulumDate()}&start_date=lte.${until}&order=start_date`);
  const out = [];
  for (const b of bks.filter(x => x.booking_type !== 'room_only' && (x.blocked_rooms || []).length)) {
    const regs = await get(`registrations?select=room,guests,cancelled&booking_id=eq.${encodeURIComponent(b.id)}`);
    const named = new Set(regs.filter(r => !r.cancelled && (r.guests || []).some(g => g && g.name && !g.cancelled)).map(r => r.room));
    const empty = (b.blocked_rooms || []).filter(r => !named.has(r));
    if (empty.length) out.push({ bookingId: b.id, leader: b.leader_name || b.retreat_name, starts: b.start_date, status: b.status, rooms: b.blocked_rooms.length, withoutNames: empty.length, email: b.leader_email || '', phone: b.leader_phone || '', link: `${SITE}/booking-hub.html?mode=teacher&bk=${b.id}&view=rooms` });
  }
  return { until, retreats: out };
}
async function retreatStatus(key, { bookingId = '', name = '' } = {}) {
  const get = getter(key);
  let b = null;
  if (bookingId) [b] = await get(`bookings?select=*&id=eq.${encodeURIComponent(bookingId)}`);
  else if (name) { const w = norm(name).split(/\s+/).pop(); const c = await get(`bookings?select=*&status=neq.cancelled&or=(leader_name.ilike.*${encodeURIComponent(w)}*,retreat_name.ilike.*${encodeURIComponent(w)}*)&order=start_date.desc&limit=5`); b = c.find(x => x.end_date >= tulumDate()) || c[0]; }
  if (!b) return { message: 'Retreat not found — give the leader or retreat name.' };
  const [pays, regs] = await Promise.all([get(`payments?select=amount,date,method,note&booking_id=eq.${encodeURIComponent(b.id)}&order=date`), get(`registrations?select=room,guests,cancelled&booking_id=eq.${encodeURIComponent(b.id)}`)]);
  const named = regs.filter(r => !r.cancelled && (r.guests || []).some(g => g && g.name && !g.cancelled));
  const paid = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return { bookingId: b.id, leader: b.leader_name, retreat: b.retreat_name, dates: `${b.start_date} → ${b.end_date}`, status: b.status, pax: b.pax,
    contract: { sent: b.contract_sent_at || null, signed: b.contract_signed_at || null },
    payments: { count: pays.length, totalUSD: Math.round(paid * 100) / 100, list: pays.slice(-10).map(p => `${p.date} ${p.method || ''} $${p.amount}${p.note ? ' — ' + p.note : ''}`), finalPaymentDate: b.final_payment_date || null, finalInvoicePaid: !!b.final_invoice_paid },
    roomList: { rooms: (b.blocked_rooms || []).length, withNames: named.length, sentToTeacher: b.room_list_sent_at || null, locked: !!b.all_locked },
    teacherLastSeen: b.teacher_last_seen || null };
}
async function historySearch(key, { q = '', tbl = '' } = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/data_history_search`, { method: 'POST', headers: H(key), body: JSON.stringify({ p_tbl: tbl || '', p_q: String(q || '').slice(0, 80), p_since: null, p_limit: 25 }) });
  if (!r.ok) return { message: 'History is not available.' };
  const rows = await r.json();
  return { changes: rows.map(h => ({ historyId: h.id, at: h.at, table: h.tbl, op: h.op === 'DELETE' ? 'deleted' : 'changed', by: h.who, fields: h.changed,
    what: h.tbl === 'app_store' ? `data ${h.row_id}` : String((h.old_data || {}).description || (h.old_data || {}).leader_name || (h.old_data || {}).name || (h.old_data || {}).room || h.row_id || '').slice(0, 80) })) };
}

// ---------- check ----------
async function check(key, a, who) {
  const t = String(a.type || '');
  if (!TYPES.includes(t)) return null;
  if (JORGE_ONLY.includes(t) && !isJorge(who)) return { error: 'Only Jorge can do this.' };
  const get = getter(key);
  if (t === 'send_transport_reminders') {
    const list = (Array.isArray(a.guests) ? a.guests : []).slice(0, 40).filter(g => g && g.name && (g.email || g.phone) && g.bookingId);
    if (!list.length) return { error: 'Which guests? Use missing_transport first and pass each guest (name, email, phone, arrival, bookingId).' };
    return { action: { type: t, guests: list.map(g => ({ name: String(g.name), email: String(g.email || ''), phone: String(g.phone || ''), arrival: String(g.arrival || ''), bookingId: String(g.bookingId) })) },
      summary: `Send the transport form reminder (email + WhatsApp) to ${list.length} guest${list.length === 1 ? '' : 's'}: ${list.map(g => g.name).join(', ')}` };
  }
  if (t === 'resend_confirmation') {
    const [r] = await get(`registrations?select=id,room,guests,booking_id,check_in,check_out&id=eq.${encodeURIComponent(String(a.regId || ''))}`);
    if (!r) return { error: 'Which stay? Use find_guest and pass the regId.' };
    const [b] = await get(`bookings?select=start_date,end_date,booking_type,leader_name,leader_email,leader_phone,room_type_id&id=eq.${encodeURIComponent(r.booking_id)}`);
    if (!b || b.booking_type !== 'room_only') return { error: 'This works for Room Only / walk-in reservations. Retreat guests get their information from the retreat.' };
    const g = (r.guests || []).find(x => x && x.name && !x.cancelled) || {};
    const email = g.email || b.leader_email || '', phone = g.phone || b.leader_phone || '';
    if (!email && !phone) return { error: 'No email or phone on the reservation — add one first.' };
    const [rt] = b.room_type_id ? await get(`room_types?select=name&id=eq.${encodeURIComponent(b.room_type_id)}`) : [];
    const parts = String(g.name || b.leader_name || '').trim().split(/\s+/);
    return { action: { type: t, bookingId: r.booking_id, firstName: parts[0] || '', lastName: parts.slice(1).join(' '), email, phone, checkIn: r.check_in || b.start_date, checkOut: r.check_out || b.end_date, roomType: (rt && rt.name) || '' },
      summary: `Send the booking confirmation again to ${g.name || b.leader_name} (${[email, phone].filter(Boolean).join(' and ')}), ${r.check_in || b.start_date} → ${r.check_out || b.end_date}` };
  }
  if (t === 'lost_item') {
    const room = String(a.room || '').trim().slice(0, 40), description = String(a.description || '').trim().slice(0, 500);
    if (!room || !description) return { error: 'Which room and what was found?' };
    return { action: { type: t, room, description }, summary: `Register a lost item found in room ${room}: "${description}" (Housekeeping → Lost & found)` };
  }
  if (t === 'teacher_room_list_reminder') {
    const ids = [...new Set((Array.isArray(a.bookingIds) ? a.bookingIds : [a.bookingId]).filter(Boolean).map(String))].slice(0, 20);
    if (!ids.length) return { error: 'Which retreats? Use room_list_gaps first.' };
    const gaps = (await roomListGaps(key, { days: 180 })).retreats.filter(x => ids.includes(x.bookingId) && (x.email || x.phone));
    if (!gaps.length) return { error: 'Those retreats have no empty rooms, or no email / phone for the leader.' };
    return { action: { type: t, retreats: gaps.map(x => ({ bookingId: x.bookingId, leader: x.leader, starts: x.starts, withoutNames: x.withoutNames, email: x.email, phone: x.phone, link: x.link })) },
      summary: `Remind ${gaps.length} teacher${gaps.length === 1 ? '' : 's'} to complete the room list (email + WhatsApp): ${gaps.map(x => `${x.leader} (${x.withoutNames} rooms without names, starts ${x.starts})`).join(', ')}` };
  }
  if (t === 'restore_change') {
    const [h] = await get(`data_history?select=id,at,tbl,op,who,changed,row_id,old_data&id=eq.${encodeURIComponent(String(a.historyId || ''))}`);
    if (!h) return { error: 'That change was not found — use history_search.' };
    const what = h.tbl === 'app_store' ? `data "${h.row_id}"` : String((h.old_data || {}).description || (h.old_data || {}).leader_name || (h.old_data || {}).name || h.row_id).slice(0, 80);
    return { action: { type: t, historyId: h.id }, summary: `Restore ${h.op === 'DELETE' ? 'what was deleted' : 'the previous version'}: ${h.tbl} · ${what}${h.op === 'DELETE' ? '' : ' (' + (h.changed || []).join(', ') + ')'} — changed by ${h.who} on ${String(h.at).slice(0, 16).replace('T', ' ')}` };
  }
  return null;
}

// ---------- run ----------
async function run(key, who, x, token) {
  const log = (action, detail, bookingId) => fetch(`${SUPABASE_URL}/rest/v1/activity_log`, { method: 'POST', headers: { ...H(key), Prefer: 'return=minimal' }, body: JSON.stringify({ id: 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), action, detail: (detail + ' (Ask Jorge)').slice(0, 1500), booking_id: bookingId || null, user_name: who.name || 'Staff', user_role: who.role || 'staff', created_at: new Date().toISOString() }) }).catch(() => {});
  if (x.type === 'send_transport_reminders') {
    const res = [];
    for (const g of x.guests || []) {
      const link = `${SITE}/transport-form.html?bk=${encodeURIComponent(g.bookingId)}`, firstName = g.name.split(' ')[0], when = g.arrival ? longDate(g.arrival) : 'your arrival';
      let mail = false, wa = false;
      if (g.email) mail = !!(await sendMail({ to: g.email, replyTo: 'amansala.reservations@gmail.com', subject: 'Your airport transfer to Amansala',
        html: `<p>Hi ${esc(firstName)},</p><p>We are looking forward to welcoming you to Amansala on <b>${esc(when)}</b>.</p><p>To arrange your airport transfer, please share your flight details here:<br><a href="${link}">${link}</a></p><p>If you are arranging your own transport, you can also tell us in the form.</p><p>Warm regards,<br>The Amansala Team</p>` }).catch(() => false));
      if (e164(g.phone)) wa = !!(await sendUtility(e164(g.phone), [['guest_transport_form_reminder', [firstName, when, link]]], 'en_US', 'trrem-' + g.bookingId));
      res.push(`${g.name} (email ${mail ? 'sent' : g.email ? 'failed' : '-'}, WhatsApp ${wa ? 'sent' : e164(g.phone) ? 'not yet (template pending)' : '-'})`);
    }
    await log('Transport form reminders sent', res.join('; '));
    return ' — ' + res.join('; ');
  }
  if (x.type === 'resend_confirmation') {
    const fn = require('./send-booking-confirmation');
    const r = await fn.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(x) });
    const d = JSON.parse(r.body || '{}'); if (r.statusCode >= 300 || d.error) throw new Error(d.error || 'not sent');
    await log('Booking confirmation sent again', `${x.firstName} ${x.lastName} · ${x.checkIn} → ${x.checkOut}`, x.bookingId);
    return ' — confirmation sent';
  }
  if (x.type === 'lost_item') {
    const sec = process.env.HK_PORTAL_SECRET;
    const r = await fetch('https://amansala-housekeeping.netlify.app/.netlify/functions/hk-push-external', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hk-secret': sec || '' }, body: JSON.stringify({ action: 'lostItem', room: x.room, description: x.description, by: who.name || 'Staff' }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || 'the Housekeeping app did not save it');
    await log('Lost item registered', `room ${x.room}: ${x.description}`);
    return ' — saved in Housekeeping → Lost & found';
  }
  if (x.type === 'teacher_room_list_reminder') {
    const res = [];
    for (const t of x.retreats || []) {
      const firstName = String(t.leader || '').split(' ')[0] || 'there';
      let mail = false, wa = false;
      if (t.email) mail = !!(await sendMail({ to: t.email, replyTo: 'amansala.reservations@gmail.com', subject: `Your room list for Amansala — ${t.withoutNames} room${t.withoutNames === 1 ? '' : 's'} still without names`,
        html: `<p>Hi ${esc(firstName)},</p><p>This is a reminder about your retreat at Amansala starting <b>${esc(longDate(t.starts))}</b>.</p><p><b>${t.withoutNames}</b> of your rooms do not have guest names yet. Please complete your room list here:<br><a href="${t.link}">${t.link}</a></p><p>Thank you!<br>The Amansala Team</p>` }).catch(() => false));
      if (e164(t.phone)) wa = !!(await sendUtility(e164(t.phone), [['teacher_room_list_reminder', [firstName, longDate(t.starts), String(t.withoutNames), t.link]]], 'en_US', 'rlrem-' + t.bookingId));
      res.push(`${t.leader} (email ${mail ? 'sent' : t.email ? 'failed' : '-'}, WhatsApp ${wa ? 'sent' : e164(t.phone) ? 'not yet (template pending)' : '-'})`);
      await log('Room list reminder sent to teacher', `${t.leader}: ${t.withoutNames} rooms without names`, t.bookingId);
    }
    return ' — ' + res.join('; ');
  }
  if (x.type === 'restore_change') {
    const fn = require('./data-history');
    const r = await fn.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ token, action: 'restore', id: x.historyId }) });
    const d = JSON.parse(r.body || '{}'); if (r.statusCode >= 300 || d.error) throw new Error(d.error || 'not restored');
    return ' — ' + (d.done || 'restored');
  }
  return '';
}

module.exports = { TYPES, JORGE_ONLY, check, run, missingTransport, roomListGaps, retreatStatus, historySearch, isJorge };
