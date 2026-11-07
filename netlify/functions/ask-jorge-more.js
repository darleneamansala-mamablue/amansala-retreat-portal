'use strict';

// ask-jorge-more.js — three more things Ask Jorge does (Jorge 2026-11-07: "haz 1, 2 y 3"):
//   1. maintenance_report: "the A/C in 21 does not work, give it to Hilario" -> a ticket in the Maintenance module (the team is told as
//      always; if a person is named, it is assigned to them: only they see it on their phone, with a WhatsApp + push)
//   2. day_summary (read-only): "what's happening today?" -> arrivals, departures with what they owe, spa, transports, housekeeping,
//      open maintenance reports and requests waiting for Jorge
//   3. balances_due (read-only) + send_payment_links: who leaves today / tomorrow still owing, and every one of them gets their
//      payment link (email + WhatsApp) after ONE Confirm
const T = require('./ask-jorge-tools');
const M = require('./maintenance-lib');
const { getter, H, SUPABASE_URL, lineTotal, norm, tulumDate, addDays } = T;
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const money = n => '$' + Number(n).toFixed(2);
const first = s => norm(String(s || '').trim().split(/\s+/)[0]);
const TYPES = ['maintenance_report', 'send_payment_links'];

// ---------- 2. the day at a glance ----------
async function daySummary(key, { date = '' } = {}) {
  const day = isDay(date) ? date : tulumDate();
  const get = getter(key);
  const [ad, spa, tr, tickets, rs, ajq] = await Promise.all([
    T.arrivalsDepartures(key, { date: day, kind: 'both' }),
    T.spaAgenda(key, { date: day }),
    get(`transport?select=data&or=(data->>arrivalDate.eq.${day},data->>departureDate.eq.${day})&limit=300`),
    M.listTickets(key).catch(() => []),
    get('room_status?select=room_name,status'),
    T.appStore(key, 'ask_jorge_questions').catch(() => null),
  ]);
  const arr = ad.arrivals || [], dep = ad.departures || [];
  const legs = { arrivals: [], departures: [] };
  (tr || []).forEach(r => { const d = r.data || {}, n = `${d.firstName || ''} ${d.lastName || ''}`.trim();
    if (d.arrivalDate === day && !d.arrivalOT) legs.arrivals.push(`${d.arrivalTime || '?'} ${n}`);
    if (d.departureDate === day && !d.departureOT) legs.departures.push(`${d.departureTime || '?'} ${n}`); });
  const status = {}; (rs || []).forEach(x => { const s = String(x.status || 'unknown').toLowerCase(); status[s] = (status[s] || 0) + 1; });
  const openTickets = (tickets || []).filter(t => t && t.status !== 'resolved');
  const owing = dep.filter(x => Number(x.balanceUSD) > 0.5);
  return {
    date: day,
    arrivals: { count: arr.length, notCheckedIn: arr.filter(x => x.status === 'not checked in').length, list: arr.slice(0, 40).map(x => `${x.room} ${x.guests} (${x.status})`) },
    departures: { count: dep.length, stillHere: dep.filter(x => x.status !== 'checked out').length, owingCount: owing.length, owingTotalUSD: Math.round(owing.reduce((s, x) => s + Number(x.balanceUSD), 0) * 100) / 100,
      list: dep.slice(0, 40).map(x => `${x.room} ${x.guests} (${x.status}${Number(x.balanceUSD) > 0.5 ? ', owes ' + money(x.balanceUSD) : ''})`) },
    spa: { count: (spa.appointments || []).length, list: (spa.appointments || []).slice(0, 30).map(a => `${a.time} ${a.client} — ${a.service || ''} (${a.therapist || ''})`) },
    transports: { arrivals: legs.arrivals.sort(), departures: legs.departures.sort() },
    housekeeping: status,
    maintenanceOpen: openTickets.slice(0, 15).map(t => `${t.id} room ${t.room}: ${String(t.problemStaff || t.problem || '').slice(0, 80)}${t.assignedTo ? ' → ' + t.assignedTo : ' (unassigned)'}${t.status === 'in_progress' ? ' [in progress]' : ''}`),
    requestsWaitingForJorge: ((ajq && ajq.value) || []).filter(x => x && x.status === 'open').length,
  };
}

// ---------- 3. who leaves owing ----------
async function balancesDue(key, { date = '' } = {}) {
  const day = isDay(date) ? date : tulumDate();
  const get = getter(key);
  const dep = (await T.arrivalsDepartures(key, { date: day, kind: 'departures' })).departures || [];
  const owing = dep.filter(x => Number(x.balanceUSD) > 0.5);
  const out = [];
  for (const x of owing) {
    const fo = await get(`folios?select=id,name,guest_name,status,payment_token&registration_id=eq.${encodeURIComponent(x.regId)}`);
    const items = fo.length ? await get(`folio_items?select=folio_id,qty,unit_price,tax_rate&folio_id=in.(${fo.map(f => f.id).join(',')})`) : [];
    const folios = fo.map(f => ({ folioId: f.id, name: f.name || f.guest_name, balanceUSD: Math.round(items.filter(i => i.folio_id === f.id).reduce((s, i) => s + lineTotal(i), 0) * 100) / 100 })).filter(f => f.balanceUSD > 0.5);
    out.push({ regId: x.regId, room: x.room, guests: x.guests, status: x.status, balanceUSD: x.balanceUSD, folios });
  }
  return { date: day, owing: out, note: 'To send each of them their payment link, propose send_payment_links with the folioIds (one Confirm sends them all).' };
}

// who the payment link of a folio goes to (same rules as send_payment_link in ask-jorge.js)
async function linkTarget(key, folioId) {
  const get = getter(key);
  const [f] = await get(`folios?select=id,name,guest_name,status,payment_token,registration_id,booking_request_id&id=eq.${encodeURIComponent(String(folioId || ''))}`);
  if (!f || !f.payment_token) return null;
  let email = '', phone = '', manual = false;
  if (f.registration_id) {
    const [r] = await get(`registrations?select=guests,booking_id&id=eq.${encodeURIComponent(f.registration_id)}`);
    const gs = ((r && r.guests) || []).filter(g => g && g.name);
    const g = gs.find(x => norm(x.name) === norm(f.guest_name)) || gs[0] || {};
    const [bk] = r ? await get(`bookings?select=leader_email,leader_phone,booking_type&id=eq.${encodeURIComponent(r.booking_id)}`) : [];
    email = g.email || (bk && bk.leader_email) || ''; phone = g.phone || (bk && bk.leader_phone) || ''; manual = !!(bk && bk.booking_type === 'room_only');
  } else if (f.booking_request_id) { const [q] = await get(`booking_requests?select=email,phone&id=eq.${encodeURIComponent(f.booking_request_id)}`); email = (q && q.email) || ''; phone = (q && q.phone) || ''; }
  const items = await get(`folio_items?select=qty,unit_price,tax_rate&folio_id=eq.${encodeURIComponent(f.id)}`);
  return { folioId: f.id, token: f.payment_token, guestName: f.guest_name || f.name, email, phone, manual, balanceUSD: Math.round(items.reduce((s, i) => s + lineTotal(i), 0) * 100) / 100 };
}

// ---------- check: {action, summary} | {error} | null ----------
async function check(key, a, who) {
  const t = String(a.type || '');
  if (!TYPES.includes(t)) return null;
  if (t === 'maintenance_report') {
    const room = String(a.room || '').trim().slice(0, 40), problem = String(a.problem || a.description || '').trim().slice(0, 500);
    if (!room || !problem) return { error: 'I need the room and what is not working.' };
    let assign = null;
    if (a.assignTo) {
      const row = await M.readRow(key, 'maintenance_alert_numbers');
      const team = ((row && row.value) || []).filter(p => p && p.phone);
      const hits = team.filter(p => first(p.name) === first(a.assignTo) || norm(p.name) === norm(a.assignTo));
      const uniq = [...new Map(hits.map(p => [String(p.phone).replace(/\D/g, '').slice(-10), p])).values()];
      if (!uniq.length) return { error: `"${a.assignTo}" is not on the maintenance team. Team: ${[...new Set(team.map(p => p.name))].join(', ')}` };
      if (uniq.length > 1) return { error: `More than one "${a.assignTo}" on the team — say the full name.` };
      assign = { name: uniq[0].name, phone: String(uniq[0].phone).replace(/\D/g, '').slice(-10) };
    }
    const priority = a.priority === 'urgent' ? 'urgent' : 'normal';
    return { action: { type: t, room, problem, priority, assignPhone: assign ? assign.phone : '', assignName: assign ? assign.name : '' },
      summary: `Maintenance report for room ${room}: "${problem}"${priority === 'urgent' ? ' — URGENT' : ''}${assign ? ` · assigned to ${assign.name} (only they see it, WhatsApp to them)` : ' · the whole team is told'}` };
  }
  if (t === 'send_payment_links') {
    const ids = [...new Set((Array.isArray(a.folioIds) ? a.folioIds : []).map(String))].slice(0, 40);
    if (!ids.length) return { error: 'Which folios? Use balances_due first, then pass their folioIds.' };
    const targets = [], skipped = [];
    for (const id of ids) {
      const x = await linkTarget(key, id);
      if (!x) skipped.push(`${id.slice(0, 8)} (folio not found)`);
      else if (x.balanceUSD <= 0.5) skipped.push(`${x.guestName} (nothing owed)`);
      else if (!x.email && !x.phone) skipped.push(`${x.guestName} (no email or phone)`);
      else targets.push(x);
    }
    if (!targets.length) return { error: 'Nobody to send to: ' + skipped.join(', ') };
    return { action: { type: t, targets },
      summary: `Send the payment link to ${targets.length} guest${targets.length === 1 ? '' : 's'}: ${targets.map(x => `${x.guestName} ${money(x.balanceUSD)}`).join(', ')}${skipped.length ? ` · skipped: ${skipped.join(', ')}` : ''}` };
  }
  return null;
}

// ---------- run (after Confirm): returns text added to the summary ----------
async function run(key, who, x) {
  if (x.type === 'maintenance_report') {
    const r = await M.createTicket(key, { room: x.room, problem: x.problem, priority: x.priority, source: 'staff', reportedBy: `${who.name || 'Staff'} (Ask Jorge)` });
    if (x.assignPhone) await M.updateTicket(key, r.ticket.id, { assignedPhone: x.assignPhone }, `${who.name || 'Staff'} (Ask Jorge)`);
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, { method: 'POST', headers: { ...H(key), Prefer: 'return=minimal' }, body: JSON.stringify({ id: 'id_' + Date.now() + '_ajm', action: 'Maintenance ticket created', detail: `${r.ticket.id} · room ${x.room}: ${x.problem}${x.assignName ? ' → ' + x.assignName : ''} (Ask Jorge)`, booking_id: null, user_name: who.name || 'Staff', user_role: who.role || 'staff', created_at: new Date().toISOString() }) }).catch(() => {});
    return ` — report ${r.ticket.id} created${x.assignName ? `, assigned to ${x.assignName}` : ''}`;
  }
  if (x.type === 'send_payment_links') {
    const fn = require('./send-folio-payment-link');
    const done = [], failed = [];
    for (const t of x.targets || []) {
      try {
        const r = await fn.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ token: t.token, guestName: t.guestName, email: t.email, phone: t.phone, manual: t.manual }) });
        const d = JSON.parse(r.body || '{}');
        if (r.statusCode >= 300 || d.error) failed.push(`${t.guestName} (${d.error || 'not sent'})`);
        else done.push(`${t.guestName} (email ${(d.results || {}).email || '-'}, WhatsApp ${(d.results || {}).whatsapp || '-'})`);
      } catch (e) { failed.push(`${t.guestName} (${e.message})`); }
    }
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, { method: 'POST', headers: { ...H(key), Prefer: 'return=minimal' }, body: JSON.stringify({ id: 'id_' + Date.now() + '_ajl', action: 'Payment links sent (Ask Jorge)', detail: `${done.length} sent${failed.length ? ', ' + failed.length + ' failed' : ''}: ${[...done, ...failed].join('; ')}`.slice(0, 1500), booking_id: null, user_name: who.name || 'Staff', user_role: who.role || 'staff', created_at: new Date().toISOString() }) }).catch(() => {});
    return ` — sent: ${done.join('; ') || 'none'}${failed.length ? ' · NOT sent: ' + failed.join('; ') : ''}`;
  }
  return '';
}

module.exports = { TYPES, check, run, daySummary, balancesDue };
