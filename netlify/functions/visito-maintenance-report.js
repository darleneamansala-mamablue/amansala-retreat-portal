'use strict';

// Visito AI "Tool" (report_maintenance_issue) — Lana calls it when a guest says something in their room does not work
// (Jorge 2026-11-06): air conditioning, hot water, lights, shower, toilet, door, safe, wifi... It finds the guest's current
// stay from the conversation's WhatsApp number (same look-up as identify_guest), opens a ticket in the portal's Mantenimiento
// module and sends the maintenance team a WhatsApp. When staff mark it Resolved, the guest gets a WhatsApp confirmation.
// Visito POSTs {arguments: {problem, urgent?, room?, guestName?}, meta: {conversationKey}} with Bearer VISITO_TOOL_SECRET.
const identify = require('./visito-identify-guest');
const { createTicket } = require('./maintenance-lib');

const digits = s => String(s || '').replace(/\D/g, '');
const ok = body => ({ statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const expected = process.env.VISITO_TOOL_SECRET, key = process.env.SUPABASE_SERVICE_KEY;
  if (!expected || !key) return { statusCode: 500, body: 'Server config error' };
  const auth = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (auth !== expected) return { statusCode: 401, body: 'Unauthorized' };
  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, body: 'Invalid JSON' }; }
  const a = payload.arguments || {};
  const problem = String(a.problem || a.description || '').trim().slice(0, 500);
  if (!problem) return ok({ success: false, message: 'Ask the guest what is not working, then call this again with problem.' });
  const ck = String(((payload.meta || {}).conversationKey) || '');
  const phone = digits(a.phone) || (ck.split(':').find(p => /^\d{8,15}$/.test(p)) || '');

  // who and which room: the guest's stay in the portal (identify_guest), else the room the guest said
  let stay = null;
  try {
    const r = await identify.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + expected }, body: JSON.stringify({ arguments: { phone }, meta: payload.meta || {} }) });
    const d = JSON.parse(r.body || '{}');
    if (d.success && d.current) stay = d.current;
  } catch (e) {}
  const room = String(a.room || (stay && stay.room) || '').trim();
  if (!room || /not assigned/i.test(room)) return ok({ success: false, message: 'I could not find the guest\'s room from their phone number. Ask the guest for their room number and call this again with room.' });

  const urgent = a.urgent === true || /urgent|urgente|no hot water|no water|sin agua|leak|fuga|flood|inund|no power|sin luz|locked|cerrad/i.test(problem);
  const { ticket, alert } = await createTicket(key, {
    room, problem, priority: urgent ? 'urgent' : 'normal', source: 'lana', reportedBy: 'Lana (WhatsApp)',
    guestName: String(a.guestName || (stay && stay.guestName) || '').slice(0, 120), guestPhone: phone ? '+' + phone : '',
    reservation: stay ? stay.portalReservation : null,
  });
  return ok({ success: true, ticket: ticket.id, room, priority: ticket.priority, maintenanceAlerted: (alert && alert.sent || []).some(x => x.sent),
    instructions: `Tell the guest, warmly and briefly, that you have reported it to our maintenance team (report ${ticket.id}) and that someone will come to room ${room} as soon as possible. Do not promise an exact time. They will get a message when it is fixed.` });
};
