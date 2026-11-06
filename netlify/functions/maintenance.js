'use strict';

// maintenance.js — the portal's Mantenimiento screen (modules/maintenance.js), staff only (Jorge 2026-11-06).
// POST {token, action}:
//   list                                   -> {tickets, numbers}
//   create {room, problem, priority, guestName?, guestPhone?, guestEmail?}  -> new ticket + WhatsApp to maintenance
//   update {id, status?, assignedTo?, note?} -> when it becomes "resolved" the guest gets the WhatsApp confirmation at once
//   numbers {numbers:[{name, phone}]}       -> who gets the maintenance WhatsApp
const { staffAllowed, cors, reply } = require('./portal-auth-lib');
const M = require('./maintenance-lib');

const STATUSES = ['open', 'in_progress', 'resolved'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid request' }); }
  const who = await staffAllowed({ headers: event.headers || {}, body: JSON.stringify({ token: b.token }) });
  if (!who) return reply(401, { error: 'Sign in again.' });
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  const me = who.name || 'Staff';
  const log = (action, detail) => fetch(`${M.SUPABASE_URL}/rest/v1/activity_log`, { method: 'POST', headers: { ...M.H(key), Prefer: 'return=minimal' },
    body: JSON.stringify({ id: 'id_' + Date.now() + '_mt', action, detail, booking_id: null, user_name: me, user_role: who.role || 'staff', created_at: new Date().toISOString() }) }).catch(() => {});
  try {
    if (b.action === 'list') {
      const [tickets, nums] = await Promise.all([M.listTickets(key), M.readRow(key, 'maintenance_alert_numbers')]);
      tickets.forEach(t => { if (t && !t.category) t.category = M.categorize(`${t.problem || ''} ${t.problemStaff || ''}`); });   // reports from before categories
      return reply(200, { tickets, numbers: ((nums && nums.value) || []).map(p => ({ ...p, link: M.teamLink(p) })) });
    }
    if (b.action === 'create') {
      const room = String(b.room || '').trim().slice(0, 40), problem = String(b.problem || '').trim().slice(0, 500);
      if (!room || !problem) return reply(400, { error: 'Write the room and the problem.' });
      const r = await M.createTicket(key, { room, problem, priority: b.priority, category: b.category, guestName: String(b.guestName || '').slice(0, 120), guestPhone: String(b.guestPhone || '').slice(0, 40),
        guestEmail: String(b.guestEmail || '').slice(0, 160), regId: b.regId || null, source: 'staff', reportedBy: me });
      await log('Maintenance ticket created', `${r.ticket.id} · room ${room}: ${problem}`);
      return reply(200, { ok: true, ticket: r.ticket, alert: r.alert });
    }
    if (b.action === 'update') {
      const out = await M.updateTicket(key, b.id, b, me);
      if (out.abort) return reply(404, { error: out.error });
      const guest = out.guest;
      await log('Maintenance ticket updated', `${out.ticket.id} · room ${out.ticket.room}: ${b.status ? 'status ' + b.status : ''}${b.assignedTo != null ? ' assigned ' + b.assignedTo : ''}${b.category ? ' category ' + b.category : ''}${b.note ? ' note' : ''}${guest ? ` · guest WhatsApp ${guest.whatsapp}, email ${guest.email}` : ''}`);
      return reply(200, { ok: true, ticket: out.ticket, guest });
    }
    if (b.action === 'numbers') {
      const list = (Array.isArray(b.numbers) ? b.numbers : []).map(p => ({ name: String(p.name || '').trim().slice(0, 60), phone: String(p.phone || '').trim().slice(0, 30) })).filter(p => p.phone.replace(/\D/g, '').length >= 10).slice(0, 20);
      await fetch(`${M.SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, { method: 'POST', headers: { ...M.H(key), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'maintenance_alert_numbers', value: list, updated_at: new Date().toISOString() }) });
      await log('Maintenance WhatsApp numbers', list.map(p => `${p.name} ${p.phone}`).join(', ') || 'none');
      return reply(200, { ok: true, numbers: list });
    }
    return reply(400, { error: 'Unknown action' });
  } catch (e) {
    console.error('[maintenance]', e.message);
    return reply(500, { error: e.message });
  }
};
