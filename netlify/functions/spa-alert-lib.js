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

async function sendWhatsApp(to, vars, idem, template) {
  const r = await fetch(`https://platform-api.visitoai.com/m2m/v1/whatsapp-templates/${encodeURIComponent(process.env.VISITO_WA_CHANNEL_ID)}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.VISITO_M2M_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem },
    body: JSON.stringify({ to, template: { name: template, language: { code: process.env.VISITO_SPA_ALERT_TEMPLATE_LANG || 'en_US' }, components: [{ type: 'body', parameters: vars.map(text => ({ type: 'text', text })) }] } }),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok && j.accepted !== false ? { ok: true } : { ok: false, reason: `${r.status} ${JSON.stringify(j).slice(0, 120)}` };
}

async function sendSms(to, body) {
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

const waReady = template => !!(template && process.env.VISITO_M2M_KEY && process.env.VISITO_WA_CHANNEL_ID);

module.exports = { SUPABASE_URL, TZ, supa, getKey, toE164, fmtTime, sendWhatsApp, sendSms, waReady };
