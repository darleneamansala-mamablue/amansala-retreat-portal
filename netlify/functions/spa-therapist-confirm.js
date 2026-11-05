'use strict';

// spa-therapist-confirm.js — "Send confirmation to therapist" in the Spa calendar's appointment window (Jorge 2026-11-05):
// a WhatsApp to the appointment's therapist with the date, time, service, duration, client, and whether the client is a hotel
// guest (with the room) or Offsite. Template spa_confirmacion_terapeuta (Spanish). Staff only.
// POST {token, apptId}
const { staffAllowed, cors, reply } = require('./portal-auth-lib');
const { getKey, toE164, fmtTime, sendWhatsApp, esDate } = require('./spa-alert-lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid request' }); }
  const who = await staffAllowed({ headers: event.headers || {}, body: JSON.stringify({ token: b.token }) });
  if (!who) return reply(401, { error: 'Sign in again.' });
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  const [appts, spa] = await Promise.all([getKey(key, 'spa_appointments'), getKey(key, 'spa_data')]);
  const a = (appts || []).find(x => x && x.id === String(b.apptId || ''));
  if (!a) return reply(404, { error: 'Appointment not found — save it first.' });
  if (a.status === 'CANCELLED') return reply(200, { ok: false, error: 'This appointment is cancelled.' });
  const t = ((spa && spa.therapists) || []).find(x => x.id === a.therapistId);
  if (!t) return reply(200, { ok: false, error: 'The appointment has no therapist yet.' });
  if (!t.phone) return reply(200, { ok: false, error: `${t.firstName} has no phone number: add it in Spa > Therapists.` });
  const sv = ((spa && spa.services) || []).find(x => x.id === a.serviceId) || {};
  const mins = sv.duration || a.duration;
  const guest = a.guestType === 'hotel' ? `Sí, cuarto ${a.roomNumber || a.guestRoom || '?'}` : 'No (Offsite)';
  const r = await sendWhatsApp(toE164(t.phone), [t.firstName || 'equipo', esDate(a.date), fmtTime(a.start), sv.name || 'Servicio', mins ? `${mins} minutos` : '-', a.clientName || 'Cliente', guest],
    `spa-tconf-${a.id}-${Date.now()}`, 'spa_confirmacion_terapeuta', 'es_MX');
  if (!r.ok) return reply(200, { ok: false, error: 'WhatsApp not sent: ' + r.reason });
  try {
    await fetch('https://vnttlpqkssihbmcynxvo.supabase.co/rest/v1/activity_log', { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ id: 'id_' + Date.now() + '_stc', action: 'Spa confirmation sent to therapist', detail: `${t.firstName}: ${sv.name || 'service'} · ${a.date} ${a.start} · ${a.clientName || ''} (${guest})`, booking_id: null, user_name: who.name || 'Staff', user_role: who.role || 'staff', created_at: new Date().toISOString() }) });
  } catch (e) {}
  return reply(200, { ok: true, therapist: t.firstName });
};
