'use strict';

// Runs at 8:00 PM Tulum (01:00 UTC; Jorge 2026-11-05). Sends each therapist, one message each, their booked services for TOMORROW:
// time, service and duration, client, hotel guest + room or Offsite -- WhatsApp template spa_resumen_terapeuta (Spanish).
// Before: 8:30 PM, English, only for the therapists in onlyTherapists.
// time, type of service, client name. Uses the same spa_text_alerts_config (enabled, onlyTherapists) as spa-text-alerts.js.
// WhatsApp template (VISITO_SPA_SUMMARY_TEMPLATE) takes 3 variables: {{1}} first name, {{2}} date, {{3}} the list (WhatsApp variables
// can't hold line breaks, so the list is joined with "   •   "). Falls back to Twilio SMS (with line breaks) when no template is set.
// Sent once per therapist per day (spa_text_alerts_sent key "summary|date|therapistId").

const { TZ, supa, getKey, toE164, fmtTime, sendWhatsApp, sendSms, waReady, esDate, guestLabel } = require('./spa-alert-lib');

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
  const pretty = esDate(day);
  let texted = 0;
  for (const t of therapists) {
    const sk = `summary|${day}|${t.id}`;
    if (!t.phone || sent[sk]) continue;
    if (only && !only.includes(String(t.firstName || '').toLowerCase())) continue;
    const mine = (appts || []).filter(a => a && a.therapistId === t.id && a.date === day && a.status !== 'CANCELLED' && a.status !== 'NO_SHOW').sort((x, y) => String(x.start).localeCompare(String(y.start)));
    if (!mine.length) continue;
    const lines = mine.map(a => { const sv = services.find(s => s.id === a.serviceId) || {}; return `${fmtTime(a.start)} · ${sv.name || 'Servicio'}${sv.duration || a.duration ? ' (' + (sv.duration || a.duration) + ' min)' : ''} · ${a.clientName || 'Cliente'} · ${guestLabel(a)}`; });
    const template = process.env.VISITO_SPA_SUMMARY_TEMPLATE_ES || 'spa_resumen_terapeuta';
    // Jorge 2026-11-05: one service per line. WhatsApp allows no line breaks inside a variable, so there is one template per count
    // (spa_resumen_terapeuta_uno, _2 ... _5); from the 5th on they share the last line. The old one-line template until Meta approves.
    const rows = lines.length > 5 ? [...lines.slice(0, 4), lines.slice(4).join('   •   ')] : lines;
    let res = waReady(template) ? await sendWhatsApp(toE164(t.phone), [t.firstName || 'equipo', pretty, ...rows], `spa-sum2-${day}-${t.id}`, rows.length === 1 ? 'spa_resumen_terapeuta_uno' : `spa_resumen_terapeuta_${rows.length}`, 'es_MX') : { ok: false };
    if (!res.ok && rows.length === 2 && waReady(template)) res = await sendWhatsApp(toE164(t.phone), [t.firstName || 'equipo', pretty, ...rows], `spa-sum2b-${day}-${t.id}`, 'spa_resumen_terapeuta_dos', 'es_MX');   // _2 stuck in review at Meta
    if (!res.ok) res = waReady(template)
      ? await sendWhatsApp(toE164(t.phone), [t.firstName || 'equipo', pretty, lines.join('   •   ')], `spa-sum-${day}-${t.id}`, template, 'es_MX')
      : await sendSms(toE164(t.phone), `Hola ${t.firstName || ''}, tus servicios de spa para mañana, ${pretty}:\n${lines.join('\n')}`);
    if (res.ok) { sent[sk] = new Date().toISOString(); texted++; } else if (res.reason !== 'twilio_not_configured') sent[sk] = 'failed: ' + res.reason;
  }
  await supa(key, 'app_store', 'POST', { key: 'spa_text_alerts_sent', value: sent });
  return { statusCode: 200, body: JSON.stringify({ day, texted }) };
};
