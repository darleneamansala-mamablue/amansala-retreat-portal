'use strict';

// Google Calendar -> Spa calendar (Darlene 2026-10-26: phone calls people book through her Google Calendar booking page should show on the Spa calendar).
// Darlene pastes her calendar's "Secret address in iCal format" into Spa > Calendar > "Google Calendar". The link is a read-only key to her whole calendar, so it is NEVER sent back to the
// browser: it is encrypted here (AES-256-GCM, key derived from the server's own Supabase service key) and stored in app_store 'gcal_phone_feed'; only this function can decrypt it.
//   GET  ?status=1          -> { connected, filter, therapist }                    (no link)
//   GET                     -> { events:[{ id, title, date, start, end, allDay }] }  (title + time only; local Tulum time; from 7 days ago to 60 days ahead; filter applied)
//   POST { action:'save', url, filter, therapist } -> checks the link works, stores it encrypted -> { ok, count }
//   POST { action:'disconnect' }
const crypto = require('crypto');
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const KEY = 'gcal_phone_feed', TZ = 'America/Cancun';

const hdrs = k => ({ apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' });
const secret = k => crypto.createHash('sha256').update(k + '|gcal-feed').digest();
function enc(text, k) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', secret(k), iv), ct = Buffer.concat([c.update(text, 'utf8'), c.final()]); return [iv, c.getAuthTag(), ct].map(b => b.toString('base64')).join('.'); }
function dec(s, k) { const [iv, tag, ct] = s.split('.').map(x => Buffer.from(x, 'base64')), d = crypto.createDecipheriv('aes-256-gcm', secret(k), iv); d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]).toString('utf8'); }
const ok = (data, code = 200) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) });

async function loadCfg(k) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.${KEY}&select=value`, { headers: hdrs(k) });
  const rows = r.ok ? await r.json() : []; return rows[0] && rows[0].value || null;
}
// ---- iCal reading ----
function unfold(text) { return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/); }
function tzOffsetMin(utcMs, tz) {                              // minutes the zone is ahead of UTC at that instant
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs)).reduce((a, x) => (a[x.type] = x.value, a), {});
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs) / 60000;
}
function toTulum(utcMs) { const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(utcMs)).reduce((a, x) => (a[x.type] = x.value, a), {}); return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }; }
function parseDt(line) {                                       // "DTSTART;TZID=X:2026..." / "...:20261027T150000Z" / ";VALUE=DATE:20261027"
  const i = line.indexOf(':'), head = line.slice(0, i), val = line.slice(i + 1).trim(), tzid = (/TZID=([^;:]+)/.exec(head) || [])[1];
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(val); if (!m) return null;
  if (m[4] == null) return { allDay: true, date: `${m[1]}-${m[2]}-${m[3]}`, time: '00:00' };
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  let utc; if (m[7]) utc = guess; else { const tz = tzid || TZ; try { utc = guess - tzOffsetMin(guess, tz) * 60000; utc = guess - tzOffsetMin(utc, tz) * 60000; } catch (e) { utc = guess - tzOffsetMin(guess, TZ) * 60000; } }
  return Object.assign({ allDay: false, utc }, toTulum(utc));
}
const unesc = s => String(s || '').replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\').trim();
function parseIcs(text) {
  const out = [], lines = unfold(text); let ev = null;
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (l === 'END:VEVENT') { if (ev && ev.start) out.push(ev); ev = null; continue; }
    if (!ev) continue;
    const name = l.slice(0, l.search(/[;:]/)).toUpperCase();
    if (name === 'SUMMARY') ev.title = unesc(l.slice(l.indexOf(':') + 1));
    else if (name === 'DESCRIPTION') ev.desc = unesc(l.slice(l.indexOf(':') + 1));
    else if (name === 'UID') ev.id = l.slice(l.indexOf(':') + 1).trim();
    else if (name === 'STATUS') ev.status = l.slice(l.indexOf(':') + 1).trim().toUpperCase();
    else if (name === 'DTSTART') ev.start = parseDt(l);
    else if (name === 'DTEND') ev.end = parseDt(l);
  }
  return out.filter(e => e.status !== 'CANCELLED');
}
async function fetchEvents(url, filter) {
  const r = await fetch(url, { headers: { 'User-Agent': 'amansala-portal' } }); if (!r.ok) throw new Error('Google answered ' + r.status);
  const text = await r.text(); if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('That link is not a calendar (iCal) link');
  const now = Date.now(), from = now - 7 * 864e5, to = now + 60 * 864e5, f = String(filter || '').trim().toLowerCase();
  return parseIcs(text).filter(e => { const t = e.start.allDay ? Date.parse(e.start.date + 'T12:00:00Z') : e.start.utc; return t >= from && t <= to; })
    .filter(e => !f || ((e.title || '') + ' ' + (e.desc || '')).toLowerCase().includes(f))
    .map(e => ({ id: e.id || (e.title + e.start.date + e.start.time), title: e.title || 'Phone call', date: e.start.date, start: e.start.time, end: e.end && !e.end.allDay ? e.end.time : e.start.time, endDate: e.end ? e.end.date : e.start.date, allDay: !!e.start.allDay }))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return ok({});
  const k = process.env.SUPABASE_SERVICE_KEY; if (!k) return ok({ error: 'Server config error' }, 500);
  try {
    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      if (b.action === 'disconnect') { await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.${KEY}`, { method: 'DELETE', headers: hdrs(k) }); return ok({ ok: true }); }
      if (b.action === 'save') {
        const url = String(b.url || '').trim().replace(/^webcal:/i, 'https:');
        if (!/^https:\/\/calendar\.google\.com\//i.test(url)) return ok({ ok: false, error: 'Paste the "Secret address in iCal format" from Google Calendar (it starts with https://calendar.google.com/…).' });
        let events; try { events = await fetchEvents(url, ''); } catch (e) { return ok({ ok: false, error: String(e.message || e) }); }
        const val = { enc: enc(url, k), filter: String(b.filter || '').trim(), therapist: String(b.therapist || 'Darlene').trim(), savedAt: new Date().toISOString() };
        const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store`, { method: 'POST', headers: { ...hdrs(k), Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: KEY, value: val, updated_at: new Date().toISOString() }) });
        if (!r.ok) return ok({ ok: false, error: 'Could not save (' + r.status + ')' });
        const f = val.filter.toLowerCase(); return ok({ ok: true, count: events.length, matching: f ? events.filter(e => e.title.toLowerCase().includes(f)).length : events.length });
      }
      return ok({ error: 'unknown action' }, 400);
    }
    const cfg = await loadCfg(k);
    if (event.queryStringParameters && event.queryStringParameters.status) return ok({ connected: !!(cfg && cfg.enc), filter: cfg ? cfg.filter : '', therapist: cfg ? cfg.therapist : 'Darlene' });
    if (!cfg || !cfg.enc) return ok({ connected: false, events: [] });
    const events = await fetchEvents(dec(cfg.enc, k), cfg.filter);
    return ok({ connected: true, therapist: cfg.therapist, filter: cfg.filter, events });
  } catch (e) { console.error('[gcal-feed]', e); return ok({ error: String(e.message || e) }, 500); }
};
