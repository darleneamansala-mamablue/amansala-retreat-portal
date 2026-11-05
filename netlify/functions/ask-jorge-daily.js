'use strict';

// ask-jorge-daily.js — 9 PM Tulum (netlify.toml): Jorge gets a WhatsApp summary of Ask Jorge's day (Jorge 2026-11-05): what it
// did (activity log lines marked "(Ask Jorge)"), what it could not do and sent to him (app_store ask_jorge_questions), and what
// people asked most (app_store ask_jorge_log), so he sees what to teach it next. Template amansala_ask_jorge_resumen; email
// while Meta has not approved it.
const { sendMail } = require('./mail-lib');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const JORGE_PHONE = '529844523336';
const H = key => ({ apikey: key, Authorization: `Bearer ${key}` });
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

exports.handler = async () => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return { statusCode: 500, body: 'no key' };
  const day = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);   // Tulum is UTC-5 all year
  const from = new Date(day + 'T05:00:00Z').toISOString(), to = new Date(new Date(from).getTime() + 864e5).toISOString();
  const inDay = at => at >= from && at < to;
  const get = async p => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H(key) }); return r.ok ? r.json() : []; };
  const [acts, qRow, lRow] = await Promise.all([
    get(`activity_log?select=action,detail,user_name,created_at&detail=like.${encodeURIComponent("*(Ask Jorge)*")}&created_at=gte.${from}&created_at=lt.${to}&order=created_at&limit=200`),
    get('app_store?key=eq.ask_jorge_questions&select=value'), get('app_store?key=eq.ask_jorge_log&select=value')]);
  const failed = (((qRow[0] || {}).value) || []).filter(x => x && inDay(x.at));
  const asked = (((lRow[0] || {}).value) || []).filter(x => x && inDay(x.at));
  if (!acts.length && !failed.length && !asked.length) return { statusCode: 200, body: 'nothing today' };

  const done = acts.length ? `${acts.length}: ` + acts.slice(0, 6).map(a => `${a.user_name} — ${cut(String(a.detail).replace(' (Ask Jorge)', ''), 70)}`).join('; ') + (acts.length > 6 ? `; y ${acts.length - 6} más` : '') : 'nada';
  const nope = failed.length ? `${failed.length}: ` + failed.slice(0, 4).map(f => `${f.by} — ${cut(String(f.summary).replace(/^Pidió:\s*/, '').split('\n')[0], 70)}`).join('; ') + (failed.length > 4 ? `; y ${failed.length - 4} más` : '') : 'nada';
  // what they asked about most: the look-ups / actions used, and who asked most
  const count = {}; asked.forEach(x => (x.tools && x.tools.length ? x.tools : ['solo explicación']).forEach(t => { count[t] = (count[t] || 0) + 1; }));
  const LABEL = { find_guest: 'buscar huésped', stay_folios: 'cuentas / folios', propose_action: 'hacer cambios', spa_agenda: 'agenda spa', spa_availability: 'horarios spa', spa_services: 'servicios spa', room_availability: 'cuartos libres', quote_room_rate: 'precios', extra_nights: 'noches extra', arrivals_departures: 'llegadas / salidas', reservation_problems: 'reservas repetidas', transports: 'transporte', cloudbeds_compare: 'Cloudbeds', notify_jorge: 'te lo mandó' };
  const top = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => `${LABEL[t] || t} (${n})`).join(', ');
  const people = {}; asked.forEach(x => { people[x.by] = (people[x.by] || 0) + 1; });
  const most = `${asked.length} preguntas. Temas: ${top || '-'}. Quién: ${Object.entries(people).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([p, n]) => `${p} ${n}`).join(', ') || '-'}`;
  const pretty = new Date(day + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const params = [pretty, cut(done, 300), cut(nope, 250), cut(most, 250)];

  let sent = false;
  if (process.env.VISITO_M2M_KEY && process.env.VISITO_WA_CHANNEL_ID) {
    const r = await fetch(`https://platform-api.visitoai.com/m2m/v1/whatsapp-templates/${encodeURIComponent(process.env.VISITO_WA_CHANNEL_ID)}/send`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.VISITO_M2M_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `askj-daily-${day}` },
      body: JSON.stringify({ to: JORGE_PHONE, template: { name: 'amansala_ask_jorge_resumen', language: { code: 'es_MX' }, components: [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: t })) }] } }),
    });
    const j = await r.json().catch(() => ({})); sent = r.ok && j.accepted !== false;
    if (!sent) console.error('[ask-jorge-daily] WhatsApp', r.status, JSON.stringify(j).slice(0, 200));
  }
  if (!sent) {
    const e = v => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    await sendMail({ to: 'Jorge@amansala.com', subject: `Ask Jorge — resumen del ${pretty}`,
      html: `<p><b>Lo que hizo</b><br>${acts.map(a => e(a.user_name + ' — ' + String(a.detail).replace(' (Ask Jorge)', ''))).join('<br>') || 'nada'}</p><p><b>Lo que no pudo</b><br>${failed.map(f => e(f.by + ' — ' + f.summary)).join('<br>') || 'nada'}</p><p><b>Preguntas</b><br>${e(most)}</p>` }).catch(() => {});
  }
  return { statusCode: 200, body: JSON.stringify({ day, actions: acts.length, failed: failed.length, asked: asked.length, whatsapp: sent }) };
};
