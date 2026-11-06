'use strict';

// maintenance-lib.js — maintenance tickets (Jorge 2026-11-06): a guest tells Lana (Visito) that something in the room does not
// work, or staff report it in the portal; the maintenance team gets a WhatsApp; when staff mark it Resolved the guest gets a
// WhatsApp right away. Tickets live in app_store 'maintenance_tickets' (newest first, saved compare-and-swap like the spa
// list); who is alerted in app_store 'maintenance_alert_numbers' = [{name, phone}].
const { sendUtility } = require('./wa-utility-lib');
const { sendMail } = require('./mail-lib');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const H = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const digits = s => String(s || '').replace(/\D/g, '');
const e164 = p => { const d = digits(p); if (!d) return ''; if (d.length === 10) return '52' + d; return d; };

async function readRow(key, k) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.${k}&select=value,updated_at`, { headers: H(key) });
  const [row] = r.ok ? await r.json() : [];
  return row || null;
}
async function listTickets(key) { const row = await readRow(key, 'maintenance_tickets'); return (row && Array.isArray(row.value)) ? row.value : []; }

// change the list without losing someone else's change made at the same moment
async function mutate(key, fn) {
  for (let i = 0; i < 12; i++) {
    const row = await readRow(key, 'maintenance_tickets');
    const cur = row && Array.isArray(row.value) ? row.value : [];
    const out = fn(cur.slice());
    if (out && out.abort) return out;
    const now = new Date().toISOString();
    let ok = false;
    if (row) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.maintenance_tickets&updated_at=eq.${encodeURIComponent(row.updated_at)}`, { method: 'PATCH', headers: { ...H(key), Prefer: 'return=representation' }, body: JSON.stringify({ value: out.list, updated_at: now }) });
      ok = r.ok && (await r.json()).length > 0;
    } else {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store`, { method: 'POST', headers: { ...H(key), Prefer: 'return=minimal' }, body: JSON.stringify({ key: 'maintenance_tickets', value: out.list, updated_at: now }) });
      ok = r.ok;
    }
    if (ok) return out;
    await new Promise(res => setTimeout(res, 80 + Math.random() * 220));
  }
  throw new Error('The maintenance list was busy, try again.');
}

const nextNumber = list => 'MT-' + (Math.max(1000, ...list.map(t => Number(String(t.id || '').replace(/\D/g, '')) || 0)) + 1);

// t: {room, guestName, guestPhone, guestEmail, regId, bookingId, problem, category, priority, source, reportedBy}
async function createTicket(key, t) {
  const now = new Date().toISOString();
  const out = await mutate(key, list => {
    const ticket = { id: nextNumber(list), createdAt: now, status: 'open', notes: [], ...t, category: CATEGORIES.includes(t.category) ? t.category : categorize(`${t.problem || ''} ${t.problemStaff || ''}`), priority: t.priority === 'urgent' ? 'urgent' : 'normal' };
    return { list: [ticket, ...list].slice(0, 2000), ticket };
  });
  // the WhatsApps go out from a background function: sending 11 of them one by one took more than Visito's 10 s and Lana
  // reported the action as failed (MT-1004, 2026-11-06) although the report and the alerts were done
  let alert = { queued: true };
  try { await fetch(`${process.env.URL || 'https://amansalaportal.com'}/.netlify/functions/maintenance-alert-background`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: out.ticket.id }) }); }
  catch (e) { alert = await alertMaintenance(key, out.ticket).catch(err => ({ error: err.message })); }
  return { ticket: out.ticket, alert };
}

async function alertMaintenance(key, t) {
  // Jorge 2026-11-06: the people in charge of following up -- app_store 'maintenance_alert_numbers' (Rubi, Melissa, Darlene,
  // Michelle, Hilario, Max, Jorge and the online team), set in Maintenance > "Maintenance WhatsApp". For a test,
  // app_store 'maintenance_alert_test' = {only: [{name, phone}]} sends ONLY to those.
  const [row, test] = await Promise.all([readRow(key, 'maintenance_alert_numbers'), readRow(key, 'maintenance_alert_test')]);
  const list = test && test.value && Array.isArray(test.value.only) && test.value.only.length ? test.value.only : (row && Array.isArray(row.value) ? row.value : []);
  const seen = new Set();
  const people = list.filter(p => p && digits(p.phone).length >= 10 && !seen.has(digits(p.phone).slice(-10)) && seen.add(digits(p.phone).slice(-10)));
  const what = String(t.problemStaff || t.problem || '').slice(0, 250), prio = t.priority === 'urgent' ? 'URGENTE' : 'Normal';
  const sent = await Promise.all(people.map(async p => {
    const link = teamLink(p);   // their own page to mark it In progress / Resolved (like the therapists' confirmations)
    const used = await sendUtility(e164(p.phone), [
      ['mantenimiento_reporte_link', [String(p.name || 'equipo').split(' ')[0], t.room || 'sin cuarto', t.guestName || '-', what, prio, t.id, link]],
      ['mantenimiento_nuevo_reporte', [t.room || 'sin cuarto', t.guestName || '-', what, prio, t.id]]], 'es_MX', 'mt-' + t.id);
    return { name: p.name || ('…' + digits(p.phone).slice(-4)), sent: !!used };
  }));
  // and a push notification on the phones that installed the maintenance app (maintenance-team.html)
  const push = await hkPush('send', { who: people.map(p => 'mt-' + digits(p.phone).slice(-10)), payload: { title: `${t.priority === 'urgent' ? '🚨 URGENT — ' : '🔧 '}Room ${t.room || '?'}`, body: `${what}${t.guestName ? ' · ' + t.guestName : ''} (${t.id})`, tag: 'mt-' + t.id, url: '/maintenance-team.html' } }).catch(() => ({}));
  sent.push({ name: 'push', sent: !!(push.data && push.data.sent), count: (push.data && push.data.sent) || 0 });
  return { people: people.length, sent, testOnly: list !== (row && row.value) };
}

// the guest's WhatsApp (English) when the ticket is resolved; email when there is no phone or WhatsApp fails
async function notifyGuestResolved(t) {
  const es = t.lang === 'es';   // the guest's language (Jorge 2026-11-06: Lana answered in Spanish, the confirmation came in English)
  const first = String(t.guestName || '').trim().split(/\s+/)[0] || (es ? 'hola' : 'there');
  const what = String(t.problem || (es ? 'el problema' : 'the issue')).replace(/\s+/g, ' ').replace(/[.\s]+$/, '').slice(0, 120);
  let wa = null, mail = null;
  if (digits(t.guestPhone).length >= 10) wa = await sendUtility(e164(t.guestPhone), es
    ? [['mantenimiento_resuelto_huesped', [first, t.room || '-', what]], ['maintenance_issue_resolved', [first, t.room || '-', what]]]
    : [['maintenance_issue_resolved', [first, t.room || '-', what]]], es ? 'es_MX' : 'en_US', 'mt-done-' + t.id);
  if (!wa && t.guestEmail) {
    mail = await sendMail({ to: t.guestEmail, replyTo: 'amansala.reservations@gmail.com', subject: 'The issue in your room has been taken care of',
      html: `<p>Hi ${first},</p><p>The issue you reported in room <b>${t.room || ''}</b> (${what}) has been taken care of by our maintenance team.</p><p>If anything still is not working, just reply to this email and we will help you right away.</p><p>Warm regards,<br>The Amansala Team</p>` }).catch(() => false);
  }
  return { whatsapp: wa ? 'sent' : (digits(t.guestPhone).length >= 10 ? 'failed' : 'no phone'), email: mail ? 'sent' : (t.guestEmail ? (wa ? 'not needed' : 'failed') : 'no email') };
}

// category from what the guest wrote (Jorge 2026-11-06: tickets by type, and how much each room breaks); staff can change it
const CATEGORIES = ['ac', 'door', 'safe', 'electricity', 'water', 'other'];
function categorize(text) {
  const t = String(text || '').toLowerCase();
  if (/caja fuerte|\bsafe\b|safety box|strongbox/.test(t)) return 'safe';
  if (/aire|a\/c|\ba\.?c\b|clima|minisplit|air ?con|cooling|enfr[ií]a|fan\b|ventilador|calor|heat(er)?\b(?! water)/.test(t)) return 'ac';
  if (/agua|water|regadera|shower|ducha|ba[ñn]o|toilet|inodoro|\bwc\b|leak|fuga|lavabo|sink|drain|drenaje|tuber|plumb|flush|caliente/.test(t)) return 'water';
  if (/puerta|door|lock|cerradura|chapa|llave|\bkey\b|ventana|window/.test(t)) return 'door';
  if (/luz|luces|light|power|electric|enchufe|contacto|outlet|foco|bulb|switch|apag[oó]n|corriente/.test(t)) return 'electricity';
  return 'other';
}

// the guest's language from what they wrote, and the problem in Spanish for the maintenance team
const looksSpanish = s => /[áéíóúñ¿¡]|\b(no sirve|no funciona|mi cuarto|mi habitaci|regadera|el aire|agua|luz|puerta|baño|caja fuerte|por favor|hola)\b/i.test(String(s || ''));
async function toSpanish(text) {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k || !text) return text;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': k, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 200, messages: [{ role: 'user', content: `Translate this hotel maintenance problem into short, plain Mexican Spanish. Reply with the translation only.\n\n${String(text).slice(0, 500)}` }] }) });
    const j = await r.json();
    const out = ((j.content || []).find(c => c.type === 'text') || {}).text;
    return out ? out.trim().slice(0, 500) : text;
  } catch (e) { return text; }
}

// ---- the maintenance team's own page (maintenance-team.html): a personal signed link, valid while their number is on the list
const crypto = require('crypto');
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const teamSecret = () => process.env.VISITO_TOOL_SECRET ? 'mt-team:' + process.env.VISITO_TOOL_SECRET : '';
function teamLink(p) {
  if (!teamSecret()) return 'https://amansalaportal.com';
  const body = b64u(JSON.stringify({ n: p.name || '', p: digits(p.phone).slice(-10) }));
  return `https://amansalaportal.com/maintenance-team.html?k=${body}.${b64u(crypto.createHmac('sha256', teamSecret()).update(body).digest()).slice(0, 22)}`;
}
async function verifyTeam(key, k) {
  const [body, sig] = String(k || '').split('.');
  if (!teamSecret() || !body || !sig) return null;
  const want = b64u(crypto.createHmac('sha256', teamSecret()).update(body).digest()).slice(0, 22);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  let c; try { c = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return null; }
  const row = await readRow(key, 'maintenance_alert_numbers');
  const still = (row && Array.isArray(row.value) ? row.value : []).some(x => digits(x.phone).slice(-10) === c.p);
  return still ? { name: c.n || 'Maintenance', phone: c.p } : null;   // taken off the list = the link stops working
}

// one change to a ticket (status, assignee, category, note) by `me`; Resolved notifies the guest right away
async function updateTicket(key, id, b, me) {
  const STATUSES = ['open', 'in_progress', 'resolved'], now = new Date().toISOString();
  let before = null;
  const out = await mutate(key, list => {
    const i = list.findIndex(t => t && t.id === id);
    if (i < 0) return { abort: true, error: 'Report not found' };
    before = list[i];
    const t = { ...list[i], notes: [...(list[i].notes || [])] };
    if (b.status && STATUSES.includes(b.status) && b.status !== t.status) {
      t.status = b.status;
      if (b.status === 'resolved') { t.resolvedAt = now; t.resolvedBy = me; }
      if (b.status === 'in_progress' && !t.startedAt) { t.startedAt = now; if (!t.assignedTo) t.assignedTo = me; }
      t.notes.push({ at: now, by: me, text: `Status: ${b.status}` });
    }
    if (b.assignedTo != null && String(b.assignedTo).trim() !== String(t.assignedTo || '')) { t.assignedTo = String(b.assignedTo).trim().slice(0, 80); t.notes.push({ at: now, by: me, text: `Assigned to ${t.assignedTo || '—'}` }); }
    if (b.category && CATEGORIES.includes(b.category) && b.category !== t.category) { t.notes.push({ at: now, by: me, text: `Category: ${b.category}` }); t.category = b.category; }
    if (b.note && String(b.note).trim()) t.notes.push({ at: now, by: me, text: String(b.note).trim().slice(0, 500) });
    list[i] = t;
    return { list, ticket: t };
  });
  if (out.abort) return out;
  let guest = null;
  if (out.ticket.status === 'resolved' && before.status !== 'resolved') {
    guest = await notifyGuestResolved(out.ticket).catch(e => ({ error: e.message }));
    const stamp = { at: new Date().toISOString(), ...guest };
    await mutate(key, list => ({ list: list.map(t => t && t.id === id ? { ...t, guestNotified: stamp } : t) })).catch(() => {});
    out.ticket.guestNotified = stamp;
  }
  return { ticket: out.ticket, guest };
}

// push goes through the housekeeping app's push service (its keys, netlify/functions/hk-push-external.js), shared secret
async function hkPush(action, body) {
  const sec = process.env.HK_PORTAL_SECRET;
  if (!sec) return { ok: false };
  const r = await fetch('https://amansala-housekeeping.netlify.app/.netlify/functions/hk-push-external', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hk-secret': sec }, body: JSON.stringify({ action, ...body }) });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}

module.exports = { hkPush, teamLink, verifyTeam, updateTicket, CATEGORIES, categorize, looksSpanish, toSpanish, SUPABASE_URL, H, readRow, listTickets, mutate, createTicket, alertMaintenance, notifyGuestResolved };
