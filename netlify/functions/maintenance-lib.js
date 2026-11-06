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
    const ticket = { id: nextNumber(list), createdAt: now, status: 'open', notes: [], ...t, priority: t.priority === 'urgent' ? 'urgent' : 'normal' };
    return { list: [ticket, ...list].slice(0, 2000), ticket };
  });
  const alert = await alertMaintenance(key, out.ticket).catch(e => ({ error: e.message }));
  return { ticket: out.ticket, alert };
}

async function alertMaintenance(key, t) {
  // Jorge 2026-11-06: the same people who get the daily A/C (climas) report -- Netlify CLIMAS_REPORT_NUMBERS + app_store
  // 'climas_report_numbers' -- plus anyone added in Mantenimiento > "WhatsApp a mantenimiento"
  // testing (Jorge 2026-11-06): app_store 'maintenance_alert_test' = {only: [{name, phone}]} sends ONLY to those, no one else
  const test = await readRow(key, 'maintenance_alert_test');
  if (test && test.value && Array.isArray(test.value.only) && test.value.only.length) {
    const sent = [];
    for (const p of test.value.only) sent.push({ name: p.name, sent: !!(await sendUtility(e164(p.phone), [['mantenimiento_nuevo_reporte', [t.room || 'sin cuarto', t.guestName || '-', String(t.problemStaff || t.problem || '').slice(0, 250), t.priority === 'urgent' ? 'URGENTE' : 'Normal', t.id]]], 'es_MX', 'mt-' + t.id)) });
    return { people: sent.length, sent, testOnly: true };
  }
  const row = await readRow(key, 'maintenance_alert_numbers'), cl = await readRow(key, 'climas_report_numbers');
  const climas = [...(process.env.CLIMAS_REPORT_NUMBERS || '').split(','), ...((cl && cl.value && Array.isArray(cl.value.numbers)) ? cl.value.numbers : [])].map(p => ({ name: '', phone: p }));
  const seen = new Set();
  const people = [...(row && Array.isArray(row.value) ? row.value : []), ...climas].filter(p => p && digits(p.phone).length >= 10 && !seen.has(digits(p.phone).slice(-10)) && seen.add(digits(p.phone).slice(-10)));
  const sent = [];
  for (const p of people) {
    const used = await sendUtility(e164(p.phone), [['mantenimiento_nuevo_reporte', [t.room || 'sin cuarto', t.guestName || '-', String(t.problemStaff || t.problem || '').slice(0, 250), t.priority === 'urgent' ? 'URGENTE' : 'Normal', t.id]]], 'es_MX', 'mt-' + t.id);
    sent.push({ name: p.name || ('…' + digits(p.phone).slice(-4)), sent: !!used });
  }
  return { people: people.length, sent };
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

module.exports = { looksSpanish, toSpanish, SUPABASE_URL, H, readRow, listTickets, mutate, createTicket, alertMaintenance, notifyGuestResolved };
