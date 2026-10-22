'use strict';

// Runs at 8:30 PM Tulum (01:30 UTC). Texts each therapist their booked services for TOMORROW:
// time, type of service, client name. Uses the same spa_text_alerts_config (enabled, onlyTherapists) as spa-text-alerts.js.
// WhatsApp template (VISITO_SPA_SUMMARY_TEMPLATE) takes 3 variables: {{1}} first name, {{2}} date, {{3}} the list (WhatsApp variables
// can't hold line breaks, so the list is joined with "   •   "). Falls back to Twilio SMS (with line breaks) when no template is set.
// Sent once per therapist per day (spa_text_alerts_sent key "summary|date|therapistId").

const { TZ, supa, getKey, toE164, fmtTime, sendWhatsApp, sendSms, waReady } = require('./spa-alert-lib');

const tulumDate = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: TZ });

exports.handler = async () => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return { statusCode: 500, body: 'no key' };
  const cfg = await getKey(key, 'spa_text_alerts_config');
  if (!cfg || !cfg.enabled) return { statusCode: 200, body: 'off' };
  const [appts, spa, sentRaw] = await Promise.all([getKey(key, 'spa_appointments'), getKey(key, 'spa_data'), getKey(key, 'spa_text_alerts_sent')]);
  const sent = sentRaw && typeof sentRaw === 'object' ? sentRaw : {};
  const services = (spa && spa.services) || [], therapists = (spa && spa.therapists) || [];
  const only = Array.isArray(cfg.onlyTherapists) && cfg.onlyTherapists.length ? cfg.onlyTherapists.map(s => s.toLowerCase()) : null;
  const day = tulumDate(1);
  const pretty = new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  let texted = 0;
  for (const t of therapists) {
    const sk = `summary|${day}|${t.id}`;
    if (!t.phone || sent[sk]) continue;
    if (only && !only.includes(String(t.firstName || '').toLowerCase())) continue;
    const mine = (appts || []).filter(a => a && a.therapistId === t.id && a.date === day && a.status !== 'CANCELLED' && a.status !== 'NO_SHOW').sort((x, y) => String(x.start).localeCompare(String(y.start)));
    if (!mine.length) continue;
    const lines = mine.map(a => { const sv = services.find(s => s.id === a.serviceId) || {}; return `${fmtTime(a.start)} | ${sv.name || 'Service'}${sv.duration ? ' ' + sv.duration + ' min' : ''} | ${a.clientName || 'Guest'}`; });
    const template = process.env.VISITO_SPA_SUMMARY_TEMPLATE;
    const res = waReady(template)
      ? await sendWhatsApp(toE164(t.phone), [t.firstName || 'there', pretty, lines.join('   •   ')], `spa-sum-${day}-${t.id}`, template)
      : await sendSms(toE164(t.phone), `Hi ${t.firstName || 'there'}, your services booked for tomorrow, ${pretty}, are:\n${lines.join('\n')}\nPlease confirm all your services through the portal: https://amansalaportal.com/booking-hub.html?mode=confirm\nIf you can't provide any of them, contact the Spa Concierge so we can arrange coverage.`);
    if (res.ok) { sent[sk] = new Date().toISOString(); texted++; } else if (res.reason !== 'twilio_not_configured') sent[sk] = 'failed: ' + res.reason;
  }
  await supa(key, 'app_store', 'POST', { key: 'spa_text_alerts_sent', value: sent });
  return { statusCode: 200, body: JSON.stringify({ day, texted }) };
};
