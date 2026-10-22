'use strict';

// Runs every 5 minutes. Texts a therapist when a same-day booking (made today for today) or a last-minute booking (made less than
// LM_HOURS before the service) is assigned to them. OFF until app_store key
// spa_text_alerts_config is {"enabled":true}. Only bookings made after "enabledAt" are
// texted, so switching it on never blasts old bookings. Each booking is texted once
// (ids kept in spa_text_alerts_sent). Needs a phone number on the therapist profile.
// Goes out on WhatsApp through Visito's template API (same as checkout-payment links) when VISITO_SPA_ALERT_TEMPLATE is set;
// otherwise falls back to Twilio SMS. Template body needs 3 variables: {{1}} guest, {{2}} service, {{3}} "4:00 PM on 2026-10-22".
// Env: VISITO_M2M_KEY, VISITO_WA_CHANNEL_ID, VISITO_SPA_ALERT_TEMPLATE, VISITO_SPA_ALERT_TEMPLATE_LANG (default en_US).
// Also texts the therapist when a future booking is removed (cancelled, deleted, or moved to another therapist);
// first run only records what exists. WhatsApp template for that: VISITO_SPA_CANCEL_TEMPLATE (same 3 variables).
//   spa_text_alerts_config: { enabled, notifyAllBookings (true = text every new booking, not only last-minute), enabledAt, onlyTherapists: ['Rubi Test'] (optional test list), lastMinuteHours }

const { TZ, supa, getKey, toE164, fmtTime, sendWhatsApp, sendSms, waReady } = require('./spa-alert-lib');

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
    const sameDay = a.date === new Date(created - 5 * 3600000).toISOString().slice(0, 10); // booked today for today (Tulum)
    if ((!cfg.notifyAllBookings && !sameDay && (start - created) / 3600000 >= hours) || start < Date.now()) continue;
    const t = therapists.find(x => x.id === a.therapistId);
    if (!t || !t.phone) { skipped++; continue; }
    if (only && !only.includes(String(t.firstName || '').toLowerCase())) continue;
    const svc = (services.find(s => s.id === a.serviceId) || {}).name || 'Service';
    const when = new Date(created).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
    const useWa = waReady(process.env.VISITO_SPA_ALERT_TEMPLATE);
    const res = useWa ? await sendWhatsApp(toE164(t.phone), [a.clientName || 'Guest', svc, `${fmtTime(a.start)} on ${a.date}`], `spa-lm-${a.id}`, process.env.VISITO_SPA_ALERT_TEMPLATE) : await sendSms(toE164(t.phone), `Amansala spa: new same-day booking for you. ${a.clientName || 'Guest'}, ${svc} at ${fmtTime(a.start)} on ${a.date} (booked at ${when}).`);
    if (res.ok) { sent[a.id] = new Date().toISOString(); texted++; } else console.error(`[spa-text-alerts] send failed for ${a.id}: ${res.reason}`);
  }
  // A future booking that was on a therapist's page last run and is now cancelled, deleted, or moved to someone else: tell that therapist.
  const seenRaw = await getKey(key, 'spa_text_alerts_seen'), seen = seenRaw && typeof seenRaw === 'object' ? seenRaw : null, nowSeen = {}, today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  (appts || []).forEach(a => { if (a && a.id && a.status !== 'CANCELLED' && a.status !== 'NO_SHOW' && (a.date || '') >= today) nowSeen[a.id] = { t: a.therapistId, d: a.date, s: a.start, v: a.serviceId, c: a.clientName }; });
  let removed = 0;
  if (seen) for (const id of Object.keys(seen)) {
    const was = seen[id], now = nowSeen[id], nk = `cancel|${id}|${was.t}`;
    if ((now && now.t === was.t) || sent[nk] || new Date(`${was.d}T${was.s || '00:00'}:00-05:00`).getTime() < Date.now()) continue;
    const t = therapists.find(x => x.id === was.t);
    if (!t || !t.phone || (only && !only.includes(String(t.firstName || '').toLowerCase()))) { sent[nk] = 'skipped'; continue; }
    const svc = (services.find(x => x.id === was.v) || {}).name || 'Service', tpl = process.env.VISITO_SPA_CANCEL_TEMPLATE;
    const res = waReady(tpl) ? await sendWhatsApp(toE164(t.phone), [was.c || 'Guest', svc, `${fmtTime(was.s)} on ${was.d}`], `spa-cx-${id}-${was.t}`, tpl) : await sendSms(toE164(t.phone), `Amansala spa: REMOVED from your page. ${was.c || 'Guest'}, ${svc} at ${fmtTime(was.s)} on ${was.d}.`);
    if (res.ok) { sent[nk] = new Date().toISOString(); removed++; } else console.error(`[spa-text-alerts] removal text failed for ${id}: ${res.reason}`);
  }
  // keep ones whose removal text failed so they are retried next run
  if (seen) Object.keys(seen).forEach(id => { if (!nowSeen[id] && !sent[`cancel|${id}|${seen[id].t}`] && new Date(`${seen[id].d}T${seen[id].s || '00:00'}:00-05:00`).getTime() >= Date.now()) nowSeen[id] = seen[id]; });
  await supa(key, 'app_store', 'POST', { key: 'spa_text_alerts_seen', value: nowSeen });
  if (texted || removed || Object.keys(sent).length !== Object.keys(sentRaw || {}).length) await supa(key, 'app_store', 'POST', { key: 'spa_text_alerts_sent', value: sent });
  return { statusCode: 200, body: JSON.stringify({ texted, removed, skipped }) };
};
