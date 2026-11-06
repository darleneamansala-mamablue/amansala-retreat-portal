'use strict';
// maintenance-team.js — the maintenance team's phone page (maintenance-team.html), opened from the personal link in their
// WhatsApp (Jorge 2026-11-06: "un lugar donde mantenimiento pueda click resolve como los terapeutas confirman servicios").
// GET ?k=<link>  -> {me, tickets}: every open report + the ones resolved in the last 3 days
// POST {k, id, status?, note?} -> In progress / Resolved (the guest gets the confirmation at once) / a note
const M = require('./maintenance-lib');
const reply = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  let b = {};
  if (event.httpMethod === 'POST') { try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid request' }); } }
  const k = b.k || (event.queryStringParameters || {}).k;
  const me = await M.verifyTeam(key, k);
  if (!me) return reply(401, { error: 'This link is not valid any more. Ask the office for a new one.' });
  try {
    if (event.httpMethod === 'GET') {
      const since = Date.now() - 3 * 864e5;
      const tickets = (await M.listTickets(key)).filter(t => t && (t.status !== 'resolved' || Date.parse(t.resolvedAt || t.createdAt) > since))
        .map(t => ({ id: t.id, room: t.room, problem: t.problemStaff || t.problem, guestName: t.guestName, priority: t.priority, category: t.category || M.categorize(t.problem), status: t.status,
          createdAt: t.createdAt, alertedAt: t.alertedAt || null, startedAt: t.startedAt || null, assignedTo: t.assignedTo || '', resolvedAt: t.resolvedAt || null, resolvedBy: t.resolvedBy || '', notes: (t.notes || []).slice(-8) }));
      return reply(200, { me: me.name, tickets });
    }
    if (event.httpMethod === 'POST' && b.action === 'subscribe') {   // this phone wants push notifications (maintenance-sw.js)
      const r = await M.hkPush('subscribe', { who: 'mt-' + me.phone, subscription: b.subscription });
      if (b.test) await M.hkPush('send', { who: ['mt-' + me.phone], payload: { title: '🔔 Notifications on', body: 'You will get new maintenance reports here.', tag: 'mt-test', url: '/maintenance-team.html' } });
      return reply(r.ok ? 200 : 500, r.ok ? { ok: true } : { error: 'Could not save the notifications' });
    }
    if (event.httpMethod === 'POST') {
      const out = await M.updateTicket(key, String(b.id || ''), { status: b.status, note: b.note }, me.name);
      if (out.abort) return reply(404, { error: out.error });
      await fetch(`${M.SUPABASE_URL}/rest/v1/activity_log`, { method: 'POST', headers: { ...M.H(key), Prefer: 'return=minimal' },
        body: JSON.stringify({ id: 'id_' + Date.now() + '_mtt', action: 'Maintenance ticket updated', detail: `${out.ticket.id} · room ${out.ticket.room}: ${b.status || 'note'} (maintenance phone page)${out.guest ? ` · guest WhatsApp ${out.guest.whatsapp}` : ''}`, booking_id: null, user_name: me.name, user_role: 'maintenance', created_at: new Date().toISOString() }) }).catch(() => {});
      return reply(200, { ok: true, status: out.ticket.status, guest: out.guest });
    }
    return reply(405, { error: 'Method Not Allowed' });
  } catch (e) { console.error('[maintenance-team]', e.message); return reply(500, { error: e.message }); }
};
