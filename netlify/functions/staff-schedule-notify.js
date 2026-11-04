'use strict';

// staff-schedule-notify.js — WhatsApp to HR when a staff schedule is uploaded or changed (Jorge, 2026-11-04: Irving,
// recursos humanos). The Staff Schedules page calls it after a save (pasted or read from a photo) and after changes to
// single days (grouped: a burst of clicks goes out as one message). Numbers in app_store 'staff_schedule_alert'
// {enabled, numbers}; Visito template 'amansala_horario_staff' (es_MX, UTILITY):
//   📅 *Horario de staff – {{1}}*  {{2}}:  {{3}}  Puedes verlo en el portal, en Staff Schedules.
//   {{1}} department and week · {{2}} who did what · {{3}} the detail (one line: WhatsApp refuses line breaks in a parameter)
const { staffAllowed, cors, reply } = require('./portal-auth-lib');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const VISITO_API = 'https://platform-api.visitoai.com/m2m/v1';
const CHANNEL_ID = '6abd2154f6a6b5cd69232824';   // WhatsApp +52 1 984 879 5999
const TEMPLATE = 'amansala_horario_staff';
const DEPTS = { reception: 'Recepción', kitchen: 'Cocina', waitstaff: 'Meseros', housekeeping: 'Camaristas', maintenance: 'Mantenimiento' };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const clean = (s, n) => String(s || '').replace(/[\r\n\t]+/g, ' · ').replace(/\s{4,}/g, '   ').trim().slice(0, n) || '—';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid request' }); }
  const who = await staffAllowed({ headers: event.headers || {}, body: JSON.stringify({ token: b.token }) });
  if (!who) return reply(401, { error: 'Sign in again.' });
  const key = process.env.SUPABASE_SERVICE_KEY, m2m = process.env.VISITO_M2M_KEY;
  if (!key || !m2m) return reply(500, { error: 'Not configured' });
  let cfg = {};
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.staff_schedule_alert&select=value`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    cfg = ((await r.json())[0] || {}).value || {};
  } catch (e) {}
  const numbers = cfg.enabled === false ? [] : (cfg.numbers || []);
  if (!numbers.length) return reply(200, { sent: 0, note: 'no numbers' });
  const wk = /^\d{4}-\d{2}-\d{2}$/.test(b.week || '') ? b.week : null;
  const week = wk ? `semana del ${Number(wk.slice(8, 10))} de ${MONTHS[Number(wk.slice(5, 7)) - 1]}` : 'semana';
  const p1 = clean(`${DEPTS[b.dept] || b.dept || 'Staff'}, ${week}`, 120);
  const p2 = clean(`${who.name || 'Alguien'} ${b.kind === 'upload' ? 'subió el horario' : 'cambió el horario'}`, 120);
  const p3 = clean(b.detail, 900);
  let sent = 0, failed = 0;
  for (const to of numbers) {
    try {
      const r = await fetch(`${VISITO_API}/whatsapp-templates/${CHANNEL_ID}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${m2m}`, 'Content-Type': 'application/json', 'Idempotency-Key': `horario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${to}` },
        body: JSON.stringify({ to, template: { name: TEMPLATE, language: { code: 'es_MX' }, components: [{ type: 'body', parameters: [
          { type: 'text', text: p1 }, { type: 'text', text: p2 }, { type: 'text', text: p3 },
        ] }] } }),
      });
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
      sent++;
    } catch (e) { failed++; console.error('[staff-schedule-notify]', to, e.message); }
  }
  return reply(200, { sent, failed });
};
