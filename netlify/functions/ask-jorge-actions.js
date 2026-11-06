'use strict';

// ask-jorge-actions.js — the actions Ask Jorge (ask-jorge.js) gained on 2026-11-05 ("haz todo eso"), each checked first
// (check -> {action, summary} or {error}) and run only after the person presses Confirm (run). Remove or correct a folio
// line, refund a card payment (only Jorge, Hilario, Melissa), cancel or move a spa appointment (the room charge goes or
// moves with it), send the therapist the confirmation, change a transport (date, time, flight, airport; the charge is
// re-priced), set a room's housekeeping status, and fix a reservation's dates / room in Cloudbeds to match the portal.
// Plus two read-only look-ups: transports and the portal-vs-Cloudbeds comparison of one stay.
const { appStore, getter, H, SUPABASE_URL, lineTotal, r2, norm, tulumDate, addDays } = require('./ask-jorge-tools');

const SITE = process.env.URL || 'https://amansalaportal.com';
const money = n => '$' + Number(n).toFixed(2);
const REFUNDERS = ['jorge', 'hilario', 'melissa'];
const TYPES = ['remove_charge', 'edit_charge', 'refund_payment', 'spa_cancel', 'spa_move', 'therapist_confirm', 'transport_change', 'room_status', 'cloudbeds_fix', 'teacher_room', 'set_leader'];
const send = async (key, method, path, body) => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers: { ...H(key), Prefer: 'return=minimal' }, body: body ? JSON.stringify(body) : undefined }); if (!r.ok) throw new Error((await r.text()).slice(0, 200)); };
// static requires (not require('./' + name)): a dynamic one makes Netlify pack the whole folder, so this file's bundle came out
// identical to ask-jorge.js's and ask-jorge was left without its function (500 on every call, 2026-11-05)
const FNS = { 'refund-folio-payment': require('./refund-folio-payment'), 'spa-therapist-confirm': require('./spa-therapist-confirm') };
const fnCall = async (file, body, headers = {}) => { const r = await FNS[file].handler({ httpMethod: 'POST', headers, body: JSON.stringify(body) }); let d = {}; try { d = JSON.parse(r.body || '{}'); } catch (e) {} return { status: r.statusCode, d }; };
const cb = async (action, body) => { const r = await fetch(`${SITE}/.netlify/functions/cloudbeds?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json().catch(() => ({})); };
const fmt12 = hm => { const [h, m] = String(hm || '').split(':').map(Number); return isNaN(h) ? hm : `${(h % 12) || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };

async function lineOf(key, id) {
  const get = getter(key);
  const [i] = await get(`folio_items?id=eq.${encodeURIComponent(String(id || ''))}&select=id,folio_id,description,qty,unit_price,tax_rate,category,created_at,staff_name`);
  if (!i) return null;
  const [f] = await get(`folios?id=eq.${encodeURIComponent(i.folio_id)}&select=id,name,guest_name,status,registration_id`);
  let bookingId = null;
  if (f && f.registration_id) { const [r] = await get(`registrations?id=eq.${encodeURIComponent(f.registration_id)}&select=booking_id,room`); bookingId = r && r.booking_id; if (r) f.room = r.room; }
  return { i, f: f || {}, bookingId };
}
const lineText = (i, f) => `"${i.description}" ${i.qty} × ${money(i.unit_price)}${Number(i.tax_rate) ? ' + ' + i.tax_rate + '%' : ''} = ${money(lineTotal(i))} (${String(i.created_at).slice(0, 10)}) on ${f.name || f.guest_name || 'folio'}${f.room ? ' · room ' + f.room : ''}`;

// ---- spa appointments: compare-and-swap like spa-public.js mutateAppts ----
async function mutateAppts(key, fn) {
  for (let i = 0; i < 12; i++) {
    const row = await appStore(key, 'spa_appointments');
    const cur = row && Array.isArray(row.value) ? row.value : [];
    const next = fn(cur.slice());
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_appointments&updated_at=eq.${encodeURIComponent(row.updated_at)}`, {
      method: 'PATCH', headers: { ...H(key), Prefer: 'return=representation' }, body: JSON.stringify({ value: next, updated_at: new Date().toISOString() }) });
    if (r.ok && (await r.json()).length) { fetch(`${SITE}/.netlify/functions/spa-alerts-now-background`, { method: 'POST' }).catch(() => {}); return true; }
    await new Promise(res => setTimeout(res, 80 + Math.random() * 220));
  }
  throw new Error('the spa calendar was busy, try again');
}
async function apptOf(key, id) {
  const [ap, sd] = await Promise.all([appStore(key, 'spa_appointments'), appStore(key, 'spa_data')]);
  const a = ((ap && ap.value) || []).find(x => x && x.id === String(id || ''));
  const spa = (sd && sd.value) || {};
  return { a, spa, sv: a ? (spa.services || []).find(s => s.id === a.serviceId) || {} : {}, th: id2 => (spa.therapists || []).find(t => t.id === id2) };
}
const apptChargeId = a => a && a.folioStatus === 'POSTED' ? (a.folioItemId || a.folioChargeId) : null;

// ---- transports ----
async function transports(key, { date = '', guest = '' }) {
  const get = getter(key);
  let q = 'transport?select=id,booking_id,data&order=submitted_at.desc&limit=200';
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) q += `&or=(data->>arrivalDate.eq.${date},data->>departureDate.eq.${date})`;
  else if (guest) { const w = String(guest).trim().split(/\s+/).pop(); q += `&or=(data->>lastName.ilike.*${encodeURIComponent(w)}*,data->>firstName.ilike.*${encodeURIComponent(w)}*)`; }
  else q += `&or=(data->>arrivalDate.eq.${tulumDate()},data->>departureDate.eq.${tulumDate()})`;
  const rows = await get(q);
  const n = norm(guest);
  return rows.filter(t => !n || norm(`${t.data.firstName} ${t.data.lastName}`).includes(n) || n.split(/\s+/).every(w => norm(`${t.data.firstName} ${t.data.lastName}`).includes(w))).slice(0, 60).map(t => {
    const d = t.data || {}, fc = d.folioCharged || {};
    return { rowId: t.id, bookingId: t.booking_id, guest: `${d.firstName || ''} ${d.lastName || ''}`.trim(), flight: d.flightNumber || '',
      arrival: d.arrivalOT ? `${d.arrivalDate} own transport` : `${d.arrivalDate || '-'} ${d.arrivalTime || ''} ${d.arrivalAirport || ''}`.trim(),
      departure: d.departureOT ? `${d.departureDate} own transport` : `${d.departureDate || '-'} ${d.departureTime || ''} ${d.departureAirport || ''}`.trim(),
      charged: { arrival: fc.arrivalFolioItemId ? money(fc.arrivalAmount || 0) : null, departure: fc.departureFolioItemId ? money(fc.departureAmount || 0) : null }, notes: d.notes || '' };
  });
}

// ---- Cloudbeds: one stay, portal vs Cloudbeds ----
async function cloudbedsCompare(key, regId) {
  const get = getter(key);
  const [r] = await get(`registrations?id=eq.${encodeURIComponent(String(regId || ''))}&select=id,booking_id,room,check_in,check_out,guests,cancelled`);
  if (!r) return { error: 'Stay not found — use find_guest first.' };
  const [bk] = await get(`bookings?id=eq.${encodeURIComponent(r.booking_id)}&select=start_date,end_date,cb_reservation_ids,status`);
  const ci = r.check_in || bk.start_date, co = r.check_out || bk.end_date;
  const portal = { room: r.room, checkIn: ci, checkOut: co, guest: ((r.guests || []).find(g => g && g.name) || {}).name || '' };
  const ids = (bk && bk.cb_reservation_ids) || {};
  const resId = Object.entries(ids).find(([room, id]) => id && norm(room).replace(/\s/g, '') === norm(r.room).replace(/\s/g, ''));
  if (!resId) return { regId: r.id, portal, cloudbeds: null, problems: ['Not linked to a Cloudbeds reservation (it may not be in Cloudbeds, or the link is missing): tell Jorge.'] };
  const d = await cb('getReservationRooms', { reservationIds: [resId[1]] });
  const c = (d && (d.results || d.reservations || d)[resId[1]]) || null;
  if (!c) return { regId: r.id, portal, cloudbedsReservationId: resId[1], cloudbeds: null, problems: ['Cloudbeds did not answer for this reservation — try again later.'] };
  const sameRoom = (x, y) => norm(x).replace(/\s/g, '') === norm(y).replace(/\s/g, '');
  const problems = [];
  if (/cancel|no_show|void/i.test(c.status || '')) problems.push(`Cancelled in Cloudbeds (${c.status}) but active in the portal`);
  if (c.startDate !== ci || c.endDate !== co) problems.push(`Dates differ: portal ${ci} → ${co}, Cloudbeds ${c.startDate} → ${c.endDate}`);
  if (!(c.rooms || []).some(x => sameRoom(x, r.room))) problems.push(`Room differs: portal ${r.room}, Cloudbeds ${(c.rooms || []).join(', ') || 'unassigned'}`);
  const gn = norm(portal.guest).split(/\s+/).pop();
  if (gn && c.guest && !norm(c.guest).includes(gn)) problems.push(`Guest name differs: portal ${portal.guest}, Cloudbeds ${c.guest}`);
  return { regId: r.id, cloudbedsReservationId: resId[1], portal, cloudbeds: { status: c.status, checkIn: c.startDate, checkOut: c.endDate, rooms: c.rooms, guest: c.guest }, problems, matches: !problems.length };
}

// ================= check: {action, summary} | {error} | null (not one of these) =================
async function check(key, a, who) {
  const t = String(a.type || '');
  if (!TYPES.includes(t)) return null;
  if (t === 'remove_charge' || t === 'edit_charge' || t === 'refund_payment') {
    const L = await lineOf(key, a.folioItemId);
    if (!L) return { error: 'That folio line was not found — look at the folio again (stay_folios).' };
    const { i, f } = L;
    if (f.status && f.status !== 'open') return { error: 'That folio is closed.' };
    const isPay = Number(i.unit_price) < 0 || i.category === 'Payment';
    if (t === 'refund_payment') {
      if (!REFUNDERS.some(n => String(who.name || '').toLowerCase().includes(n))) return { error: 'Only Jorge, Hilario and Melissa can refund payments.' };
      if (!isPay || !/\bpi_[A-Za-z0-9]+/.test(String(i.description || ''))) return { error: 'That line is not a card payment made through Stripe; a refund of cash / transfer is recorded by hand.' };
      const amt = r2(Number(a.amount) || -Number(i.unit_price));
      if (!(amt > 0) || amt > -Number(i.unit_price) + 0.001) return { error: `The refund must be between $0.01 and ${money(-i.unit_price)}.` };
      return { action: { type: t, folioItemId: i.id, amount: amt, reason: String(a.reason || '').slice(0, 200), bookingId: L.bookingId }, summary: `Refund ${money(amt)} to the card of payment ${lineText(i, f)}${a.reason ? ' — ' + String(a.reason).slice(0, 80) : ''}. The guest gets an email and WhatsApp.` };
    }
    if (isPay) return { error: 'That line is a payment: payments are not removed or edited here (a card payment can be refunded).' };
    if (t === 'remove_charge') return { action: { type: t, folioItemId: i.id, bookingId: L.bookingId, was: lineText(i, f) }, summary: `Remove charge ${lineText(i, f)}` };
    const ch = {};
    if (a.description != null && String(a.description).trim()) ch.description = String(a.description).trim().slice(0, 200);
    if (a.qty != null) ch.qty = Math.max(1, Math.round(Number(a.qty) || 1));
    if (a.unitPrice != null) ch.unit_price = r2(Number(a.unitPrice));
    if (a.taxRate != null) ch.tax_rate = Number(a.taxRate);
    if (!Object.keys(ch).length) return { error: 'Say what to change: description, qty, unitPrice or taxRate.' };
    if (ch.unit_price != null && !(ch.unit_price > 0)) return { error: 'The price must be positive (to remove it, use remove_charge).' };
    if (ch.tax_rate != null && !(ch.tax_rate >= 0 && ch.tax_rate <= 30)) return { error: 'Tax between 0 and 30%.' };
    const after = { ...i, ...ch };
    return { action: { type: t, folioItemId: i.id, changes: ch, bookingId: L.bookingId, was: lineText(i, f) }, summary: `Correct charge ${lineText(i, f)} → "${after.description}" ${after.qty} × ${money(after.unit_price)}${Number(after.tax_rate) ? ' + ' + after.tax_rate + '%' : ''} = ${money(lineTotal(after))}` };
  }
  if (t === 'spa_cancel' || t === 'spa_move' || t === 'therapist_confirm') {
    const { a: ap, sv, th } = await apptOf(key, a.apptId);
    if (!ap) return { error: 'That spa appointment was not found — look it up with spa_agenda.' };
    if (ap.status === 'CANCELLED') return { error: 'That appointment is already cancelled.' };
    const who2 = `${ap.clientName || 'client'} · ${sv.name || 'service'} · ${ap.date} ${fmt12(ap.start)} with ${(th(ap.therapistId) || {}).firstName || 'no therapist'}`;
    if (t === 'therapist_confirm') { const tt = th(ap.therapistId); if (!tt) return { error: 'The appointment has no therapist.' }; if (!tt.phone) return { error: `${tt.firstName} has no phone in Spa > Therapists.` }; return { action: { type: t, apptId: ap.id }, summary: `Send ${tt.firstName} the WhatsApp confirmation of ${who2}` }; }
    const chargeId = apptChargeId(ap);
    if (t === 'spa_cancel') return { action: { type: t, apptId: ap.id }, summary: `Cancel spa appointment ${who2}${chargeId ? ' and remove its room charge' : ''}. The therapist is told by WhatsApp.` };
    const date = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : ap.date, start = /^\d{1,2}:\d{2}$/.test(a.start || '') ? a.start.padStart(5, '0') : ap.start;
    const therapistId = a.therapistId || ap.therapistId, tt = th(therapistId);
    if (!tt) return { error: 'That therapist was not found.' };
    if (date === ap.date && start === ap.start && therapistId === ap.therapistId) return { error: 'Nothing changes: give a new date, time or therapist.' };
    // the new slot must be free for that therapist (spa_availability lists free times)
    const appts = ((await appStore(key, 'spa_appointments')) || {}).value || [];
    const dur = Number(sv.duration || ap.duration || 60), toMin = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + (m || 0); };
    const clash = appts.find(x => x && x.id !== ap.id && x.status !== 'CANCELLED' && x.date === date && x.therapistId === therapistId && toMin(x.start) < toMin(start) + dur && toMin(start) < toMin(x.start) + Number(x.duration || 60));
    if (clash) return { error: `${tt.firstName} already has ${clash.clientName} at ${fmt12(clash.start)} that day — pick another time or therapist (spa_availability).` };
    return { action: { type: t, apptId: ap.id, date, start, therapistId }, summary: `Move spa appointment ${who2} → ${date} ${fmt12(start)} with ${tt.firstName}${chargeId ? ' (the room charge moves with it)' : ''}. The therapist${therapistId !== ap.therapistId ? 's are' : ' is'} told by WhatsApp.` };
  }
  if (t === 'transport_change') {
    const get = getter(key);
    const [row] = await get(`transport?id=eq.${encodeURIComponent(String(a.rowId || ''))}&select=id,booking_id,data`);
    if (!row) return { error: 'That transport was not found — look it up with transports.' };
    const F = ['arrivalDate', 'arrivalTime', 'arrivalAirport', 'departureDate', 'departureTime', 'departureAirport', 'flightNumber'];
    const ch = {};
    for (const k of F) if (a[k] != null && String(a[k]).trim() !== '' && String(a[k]).trim() !== String(row.data[k] || '')) ch[k] = String(a[k]).trim();
    for (const k of ['arrivalDate', 'departureDate']) if (ch[k] && !/^\d{4}-\d{2}-\d{2}$/.test(ch[k])) return { error: 'Dates as YYYY-MM-DD.' };
    for (const k of ['arrivalTime', 'departureTime']) if (ch[k] && !/^\d{1,2}:\d{2}$/.test(ch[k])) return { error: 'Times as HH:MM (24h).' };
    for (const k of ['arrivalAirport', 'departureAirport']) if (ch[k] && !['cancun', 'tulum'].includes(ch[k].toLowerCase())) return { error: 'Airport is cancun or tulum.' }; else if (ch[k]) ch[k] = ch[k].toLowerCase();
    if (!Object.keys(ch).length) return { error: 'Nothing changes — give the new date, time, airport or flight.' };
    const d = row.data || {};
    return { action: { type: t, rowId: row.id, bookingId: row.booking_id, changes: ch }, summary: `Change transport of ${d.firstName || ''} ${d.lastName || ''}: ${Object.entries(ch).map(([k, v]) => `${k} ${d[k] || '-'} → ${v}`).join(', ')}${(d.folioCharged || {}).arrivalFolioItemId || (d.folioCharged || {}).departureFolioItemId ? ' (the transport charge is re-priced)' : ''}` };
  }
  if (t === 'room_status') {
    const room = String(a.room || '').trim(), status = String(a.status || '').toLowerCase();
    if (!room || !['clean', 'dirty', 'maintenance'].includes(status)) return { error: 'Give the room and a status: clean, dirty or maintenance.' };
    return { action: { type: t, room, status, note: String(a.note || '').slice(0, 300) }, summary: `Mark room ${room} as ${status}${a.note ? ': "' + String(a.note).slice(0, 120) + '"' : ''} on the Housekeeping board` };
  }
  if (t === 'teacher_room') {   // Melissa 2026-11-05: mark the group leader in the Room List (the teacher star)
    const get = getter(key);
    const [r] = await get(`registrations?id=eq.${encodeURIComponent(String(a.regId || ''))}&select=id,booking_id,room,guests,is_teacher_room,cancelled`);
    if (!r || r.cancelled) return { error: 'That room was not found — look the guest up again (find_guest works for any date).' };
    const others = await get(`registrations?booking_id=eq.${encodeURIComponent(r.booking_id)}&is_teacher_room=eq.true&select=id,room,guests`);
    const prev = others.filter(o => o.id !== r.id);
    if (r.is_teacher_room && !prev.length) return { error: `Room ${r.room} (${(r.guests || []).map(g => g && g.name).filter(Boolean).join(' & ')}) is already the leader / teacher room ★.` };
    return { action: { type: t, regId: r.id, bookingId: r.booking_id, unset: prev.map(o => o.id) }, summary: `Mark ${(r.guests || []).map(g => g && g.name).filter(Boolean).join(' & ') || 'room ' + r.room} (room ${r.room}) as the group leader / teacher room ★${prev.length ? ` (instead of room ${prev.map(o => o.room).join(', ')})` : ''}. The teacher room counts as the leader's room on the retreat bill.` };
  }
  if (t === 'set_leader') {   // the reservation's leader name (Booking Detail), Melissa 2026-11-05
    const [b] = await getter(key)(`bookings?id=eq.${encodeURIComponent(String(a.bookingId || ''))}&select=id,leader_name,retreat_name,start_date`);
    const nm = String(a.leaderName || '').trim().slice(0, 120);
    if (!b) return { error: 'That reservation was not found — use find_reservation.' };
    if (!nm) return { error: 'Give the new leader name.' };
    if (norm(nm) === norm(b.leader_name)) return { error: `${nm} is already the leader.` };
    return { action: { type: t, bookingId: b.id, leaderName: nm, was: b.leader_name }, summary: `Change the leader of the reservation "${b.retreat_name || b.leader_name}" (${b.start_date}) from ${b.leader_name || '-'} to ${nm}` };
  }
  if (t === 'cloudbeds_fix') {
    const c = await cloudbedsCompare(key, a.regId);
    if (c.error) return c;
    if (!c.cloudbeds) return { error: c.problems.join(' ') };
    const fixDates = c.cloudbeds.checkIn !== c.portal.checkIn || c.cloudbeds.checkOut !== c.portal.checkOut;
    const fixRoom = !(c.cloudbeds.rooms || []).some(x => norm(x).replace(/\s/g, '') === norm(c.portal.room).replace(/\s/g, ''));
    if (/cancel|no_show|void/i.test(c.cloudbeds.status || '')) return { error: 'It is cancelled in Cloudbeds: Jorge decides whether to bring it back.' };
    if (!fixDates && !fixRoom) return { error: 'Dates and room already match Cloudbeds.' };
    return { action: { type: t, regId: c.regId, reservationId: c.cloudbedsReservationId, checkIn: fixDates ? c.portal.checkIn : null, checkOut: fixDates ? c.portal.checkOut : null, room: fixRoom ? c.portal.room : null },
      summary: `Fix Cloudbeds reservation ${c.cloudbedsReservationId} (${c.portal.guest}) to match the portal:${fixDates ? ` dates ${c.cloudbeds.checkIn} → ${c.cloudbeds.checkOut} become ${c.portal.checkIn} → ${c.portal.checkOut}` : ''}${fixRoom ? ` room ${(c.cloudbeds.rooms || []).join(', ') || 'unassigned'} becomes ${c.portal.room}` : ''}` };
  }
  return null;
}

// ================= run (after Confirm). Returns extra text for the summary =================
async function run(key, who, x, token) {
  const get = getter(key);
  if (x.type === 'remove_charge') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/folio_items?id=eq.${encodeURIComponent(x.folioItemId)}`, { method: 'DELETE', headers: { ...H(key), Prefer: 'return=representation' } });
    if (!r.ok || !(await r.json()).length) throw new Error('the line was already gone');
    await fetch(`${SUPABASE_URL}/rest/v1/commissions?folio_item_id=eq.${encodeURIComponent(x.folioItemId)}`, { method: 'DELETE', headers: H(key) }).catch(() => {});
    // a spa appointment that pointed at this line no longer has a charge
    try { const ap = await appStore(key, 'spa_appointments'); if (((ap && ap.value) || []).some(a => a && (a.folioItemId === x.folioItemId || a.folioChargeId === x.folioItemId))) await mutateAppts(key, l => l.map(a => a && (a.folioItemId === x.folioItemId || a.folioChargeId === x.folioItemId) ? { ...a, folioStatus: 'REVERSED' } : a)); } catch (e) {}
    return '';
  }
  if (x.type === 'edit_charge') { await send(key, 'PATCH', `folio_items?id=eq.${encodeURIComponent(x.folioItemId)}`, x.changes); return ` (before: ${x.was})`; }
  if (x.type === 'refund_payment') {
    const { status, d } = await fnCall('refund-folio-payment', { token, folioItemId: x.folioItemId, amount: x.amount, reason: x.reason, requestId: 'askj-' + Date.now() });
    if (status >= 300 || !d.ok) throw new Error(d.error || 'Stripe did not accept the refund');
    return ` — refund ${d.refundId}, guest email: ${d.email || '-'}, WhatsApp: ${d.whatsapp || '-'}`;
  }
  if (x.type === 'therapist_confirm') {
    const { d } = await fnCall('spa-therapist-confirm', { token, apptId: x.apptId });
    if (!d.ok) throw new Error(d.error || 'not sent');
    return '';
  }
  if (x.type === 'spa_cancel') {
    const { a } = await apptOf(key, x.apptId);
    const chargeId = apptChargeId(a);
    let removed = false;
    if (chargeId) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/folio_items?id=eq.${encodeURIComponent(chargeId)}`, { method: 'DELETE', headers: { ...H(key), Prefer: 'return=representation' } });
      removed = r.ok && (await r.json()).length > 0;
      if (a.folioTipId) await fetch(`${SUPABASE_URL}/rest/v1/folio_items?id=eq.${encodeURIComponent(a.folioTipId)}`, { method: 'DELETE', headers: H(key) }).catch(() => {});
      for (const [table, id] of [['registrations', a.folioRegId], ['bookings', a.folioBkId]]) {   // Room Only guests: the charge lives on the reservation
        if (!id || removed) continue;
        const [row] = await get(`${table}?id=eq.${encodeURIComponent(id)}&select=charges`);
        if (row && Array.isArray(row.charges)) { const next = row.charges.filter(c => c.id !== a.folioChargeId && c.id !== a.folioChargeId + 't'); if (next.length !== row.charges.length) { await send(key, 'PATCH', `${table}?id=eq.${encodeURIComponent(id)}`, { charges: next }); removed = true; } }
      }
    }
    await mutateAppts(key, l => l.map(y => y && y.id === x.apptId ? { ...y, status: 'CANCELLED', cancelledAt: new Date().toISOString(), cancelledBy: (who.name || 'staff') + ' (Ask Jorge)', folioStatus: removed ? 'REVERSED' : y.folioStatus } : y));
    return chargeId ? (removed ? ' — room charge removed' : ' — the room charge was NOT found: check the folio') : '';
  }
  if (x.type === 'spa_move') {
    const { a, sv, th } = await apptOf(key, x.apptId);
    await mutateAppts(key, l => l.map(y => y && y.id === x.apptId ? { ...y, date: x.date, start: x.start, therapistId: x.therapistId } : y));
    const chargeId = apptChargeId(a);
    if (chargeId && !a.folioBkId) {   // the folio line follows: service day and therapist name
      const t = th(x.therapistId) || {};
      await send(key, 'PATCH', `folio_items?id=eq.${encodeURIComponent(chargeId)}`, { created_at: `${x.date}T17:00:00Z`, description: `${t.firstName || 'Spa'} - ${sv.name || 'Spa service'}` }).catch(() => {});
    }
    return '';
  }
  if (x.type === 'transport_change') {
    const [row] = await get(`transport?id=eq.${encodeURIComponent(x.rowId)}&select=id,booking_id,data`);
    if (!row) throw new Error('the transport is gone');
    const before = row.data || {}, data = { ...before, ...x.changes };
    await send(key, 'PATCH', `transport?id=eq.${encodeURIComponent(x.rowId)}`, { data });   // the whole object: never drop folioCharged / office fields
    const L = require('./transport-charge-lib'), fc = before.folioCharged || {}, notes = [];
    for (const dir of ['arrival', 'departure']) {
      if (!fc[dir + 'FolioItemId']) continue;
      const touched = ['Date', 'Time', 'Airport'].some(k => x.changes[dir + k] != null);
      if (!touched) continue;
      for (const date of [...new Set([data[dir + 'Date'], before[dir + 'Date']].filter(Boolean))]) {
        try { await L.runCharges(key, { direction: dir, date, mode: 'sync', bookingId: row.booking_id, triggerRowId: row.id }); } catch (e) { notes.push(`${dir} charge not re-priced: ${e.message}`); }
      }
      notes.push(`${dir} charge re-priced`);
    }
    return notes.length ? ' — ' + notes.join('; ') : '';
  }
  if (x.type === 'room_status') {
    const row = await appStore(key, 'roomStatus');
    const map = { ...((row && row.value) || {}), [x.room]: { status: x.status, notes: x.note || null, updated_at: new Date().toISOString() } };
    await fetch(`${SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, { method: 'POST', headers: { ...H(key), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'roomStatus', value: map, updated_at: new Date().toISOString() }) });
    return '';
  }
  if (x.type === 'set_leader') { await send(key, 'PATCH', `bookings?id=eq.${encodeURIComponent(x.bookingId)}`, { leader_name: x.leaderName, updated_at: new Date().toISOString() }); return ` (before: ${x.was || '-'})`; }
  if (x.type === 'teacher_room') {
    for (const id of x.unset || []) await send(key, 'PATCH', `registrations?id=eq.${encodeURIComponent(id)}`, { is_teacher_room: false });
    await send(key, 'PATCH', `registrations?id=eq.${encodeURIComponent(x.regId)}`, { is_teacher_room: true });
    return ' — reload the Room List to see the star';
  }
  if (x.type === 'cloudbeds_fix') {
    const out = [];
    if (x.checkIn && x.checkOut) { const d = await cb('updateReservationDates', { reservationId: x.reservationId, checkinDate: x.checkIn, checkoutDate: x.checkOut }); if (d && (d.success === false || d.error)) throw new Error('Cloudbeds dates: ' + (d.message || d.error)); out.push('dates'); }
    if (x.room) { const d = await cb('moveReservationRoom', { reservationId: x.reservationId, newRoomName: x.room }); if (d && (d.success === false || d.error)) throw new Error('Cloudbeds room: ' + (d.message || d.error)); out.push('room'); }
    const after = await cloudbedsCompare(key, x.regId);
    return after.matches ? ` — Cloudbeds now matches (${out.join(' + ')})` : ` — Cloudbeds still differs: ${(after.problems || []).join('; ')}`;
  }
  throw new Error('unknown action');
}

module.exports = { TYPES, check, run, transports, cloudbedsCompare };
