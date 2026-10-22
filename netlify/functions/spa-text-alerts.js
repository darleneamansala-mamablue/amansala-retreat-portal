'use strict';

// Runs every 5 minutes. Texts a therapist when a last-minute booking (made less than
// LM_HOURS before the service) is assigned to them. OFF until app_store key
// spa_text_alerts_config is {"enabled":true}. Only bookings made after "enabledAt" are
// texted, so switching it on never blasts old bookings. Each booking is texted once
// (ids kept in spa_text_alerts_sent). Needs a phone number on the therapist profile.
// Goes out on WhatsApp through Visito's template API (same as checkout-payment links) when VISITO_SPA_ALERT_TEMPLATE is set;
// otherwise falls back to Twilio SMS. Template body needs 3 variables: {{1}} guest, {{2}} service, {{3}} "4:00 PM on 2026-10-22".
// Env: VISITO_M2M_KEY, VISITO_WA_CHANNEL_ID, VISITO_SPA_ALERT_TEMPLATE, VISITO_SPA_ALERT_TEMPLATE_LANG (default en_US).
//   spa_text_alerts_config: { enabled, enabledAt, onlyTherapists: ['Rubi Test'] (optional test list), lastMinuteHours }

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

async function sendWhatsApp(to, vars, idem) {
  const r = await fetch(`https://platform-api.visitoai.com/m2m/v1/whatsapp-templates/${encodeURIComponent(process.env.VISITO_WA_CHANNEL_ID)}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.VISITO_M2M_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem },
    body: JSON.stringify({ to, template: { name: process.env.VISITO_SPA_ALERT_TEMPLATE, language: { code: process.env.VISITO_SPA_ALERT_TEMPLATE_LANG || 'en_US' }, components: [{ type: 'body', parameters: vars.map(text => ({ type: 'text', text })) }] } }),
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

exports.handler = async () => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return { statusCode: 500, body: 'no key' };
  const cfg = await getKey(key, 'spa_text_alerts_config');
  if (!cfg || !cfg.enabled) return { statusCode: 200, body: 'off' };
  const [appts, spa, sentRaw] = await Promise.all([getKey(key, 'spa_appointments'), getKey(key, 'spa_data'), getKey(key, 'spa_text_alerts_sent')]);
  const sent = sentRaw && typeof sentRaw === 'object' ? sentRaw : {};
  const services = (spa && spa.services) || [], therapists = (spa && spa.therapists) || [];
  const hours = cfg.lastMinuteHours || 2, since = cfg.enabledAt ? new Date(cfg.enabledAt).getTime() : Date.now();
  const only = Array.isArray(cfg.onlyTherapists) && cfg.onlyTherapists.length ? cfg.onlyTherapists.map(s => s.toLowerCase()) : null;
  let texted = 0, skipped = 0;
  for (const a of (appts || [])) {
    if (!a || a.status === 'CANCELLED' || a.status === 'NO_SHOW' || sent[a.id] || !a.createdAt) continue;
    const created = new Date(a.createdAt).getTime();
    if (isNaN(created) || created < since) continue;
    const start = new Date(`${a.date}T${a.start || '00:00'}:00-05:00`).getTime();
    if ((start - created) / 3600000 >= hours || start < Date.now()) continue;
    const t = therapists.find(x => x.id === a.therapistId);
    if (!t || !t.phone) { skipped++; continue; }
    if (only && !only.includes(String(t.firstName || '').toLowerCase())) continue;
    const svc = (services.find(s => s.id === a.serviceId) || {}).name || 'Service';
    const when = new Date(created).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
    const useWa = process.env.VISITO_SPA_ALERT_TEMPLATE && process.env.VISITO_M2M_KEY && process.env.VISITO_WA_CHANNEL_ID;
    const res = useWa ? await sendWhatsApp(toE164(t.phone), [a.clientName || 'Guest', svc, `${fmtTime(a.start)} on ${a.date}`], `spa-lm-${a.id}`) : await sendSms(toE164(t.phone), `Amansala spa: last-minute booking for you. ${a.clientName || 'Guest'}, ${svc} at ${fmtTime(a.start)} on ${a.date} (booked at ${when}).`);
    if (res.ok) { sent[a.id] = new Date().toISOString(); texted++; } else if (res.reason !== 'twilio_not_configured') { sent[a.id] = 'failed: ' + res.reason; }
  }
  if (texted || Object.keys(sent).length !== Object.keys(sentRaw || {}).length) await supa(key, 'app_store', 'POST', { key: 'spa_text_alerts_sent', value: sent });
  return { statusCode: 200, body: JSON.stringify({ texted, skipped }) };
};
