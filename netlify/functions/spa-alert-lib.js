'use strict';

// Shared helpers for spa-text-alerts.js and spa-daily-summary.js (Supabase reads, phone format, WhatsApp via Visito, Twilio SMS fallback).

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const TZ = 'America/Cancun';

async function supa(key, path, method = 'GET', body = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  try { return JSON.parse(t); } catch (e) { return t; }
}
const getKey = async (key, k) => { const r = await supa(key, `app_store?key=eq.${k}&select=value`); return Array.isArray(r) && r[0] ? r[0].value : null; };

function toE164(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return null;
  if (String(p).trim().startsWith('+')) return '+' + d;
  if (d.length === 10) return '+52' + d;
  if (d.length === 12 && d.startsWith('52')) return '+' + d;
  return '+' + d;
}
const fmtTime = t => { const [h, m] = String(t || '00:00').split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };

async function sendWhatsApp(to, vars, idem, template, lang) {
  const r = await fetch(`https://platform-api.visitoai.com/m2m/v1/whatsapp-templates/${encodeURIComponent(process.env.VISITO_WA_CHANNEL_ID)}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.VISITO_M2M_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem },
    body: JSON.stringify({ to, template: { name: template, language: { code: lang || process.env.VISITO_SPA_ALERT_TEMPLATE_LANG || 'en_US' }, components: [{ type: 'body', parameters: vars.map(text => ({ type: 'text', text })) }] } }),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok && j.accepted !== false ? { ok: true } : { ok: false, reason: `${r.status} ${JSON.stringify(j).slice(0, 120)}` };
}

async function sendSms(to, body) {
  // Twilio SMS is off: spa alerts go out through Visito WhatsApp only (Darlene 2026-10-22). Set SPA_ALERTS_SMS=true to bring the fallback back.
  if (process.env.SPA_ALERTS_SMS !== 'true') return { ok: false, reason: 'twilio_not_configured' };
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_SMS_NUMBER;
  if (!sid || !tok || !from) return { ok: false, reason: 'twilio_not_configured' };
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
  });
  const j = await r.json();
  return r.ok ? { ok: true, sid: j.sid } : { ok: false, reason: j.message || 'twilio_error' };
}

// Spanish, for the staff messages (Jorge 2026-11-05): "viernes 6 de noviembre"; and who the client is: hotel guest + room, or Offsite
const esDate = day => new Date(day + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const guestLabel = a => a && a.guestType === 'hotel' ? `Huésped, cuarto ${a.roomNumber || a.guestRoom || '?'}` : 'Offsite';
// the "Huésped:" line of the front-desk / therapist messages: "Sí, cuarto 12a" or "No (Offsite)"
const guestYesNo = a => a && a.guestType === 'hotel' ? `Sí, cuarto ${a.roomNumber || a.guestRoom || '?'}` : 'No (Offsite)';
// front desk of the spa: last-minute bookings go to them (app_store 'spa_desk_alert_numbers' can replace this list)
const DESK_DEFAULT = [{ name: 'Rubi', phone: '+529841168801' }, { name: 'Kike', phone: '+529842391572' }, { name: 'Rosi', phone: '+529841367205' }];
const waReady = template => !!(template && process.env.VISITO_M2M_KEY && process.env.VISITO_WA_CHANNEL_ID);

module.exports = { SUPABASE_URL, TZ, supa, getKey, toE164, fmtTime, sendWhatsApp, sendSms, waReady, esDate, guestLabel, guestYesNo, DESK_DEFAULT };
