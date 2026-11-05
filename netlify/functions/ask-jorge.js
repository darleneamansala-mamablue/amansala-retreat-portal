'use strict';

// ask-jorge.js — the "Ask Jorge" assistant in the corner of every portal screen (Jorge 2026-11-05). Staff ask how to do
// something (move a room, add a charge, record a payment...) or a quick fact (which room is a guest in, what do they owe);
// Claude answers from the staff guide (ask-jorge-kb.js) and can look guests up READ-ONLY. When it cannot solve it, it sends
// the question to Jorge: WhatsApp (template amansala_pregunta_portal, once Meta approves it) + email, and keeps it in
// app_store 'ask_jorge_questions'. It never changes anything in the portal.
// POST {token, messages:[{role:'user'|'assistant', content:string}], page}
const { staffAllowed, cors, reply } = require('./portal-auth-lib');
const { sendMail } = require('./mail-lib');
const KB = require('./ask-jorge-kb');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-5-5';
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const JORGE_PHONE = '529844523336';

const SYSTEM = `You are "Ask Jorge", the help assistant inside the Amansala Portal (a hotel and retreat management system in Tulum).
Staff (front desk, housekeeping, spa, managers) ask you how to do things in the portal or quick questions about guests.

How to answer:
- Answer in the language the person writes in (usually Spanish or English). Short, clear, friendly; numbered steps for how-tos,
  using the exact button and screen names from the guide.
- Only state how the portal works from the guide below. If the guide does not cover it, or you are not sure, do not guess:
  call notify_jorge.
- You can look guests up with find_guest (read-only). Share only what the staff member needs.
- You cannot change anything in the portal. If they ask you to do something (move, charge, refund, cancel), explain how they do
  it themselves, step by step. If it needs a decision (money, refunds, discounts, comps, who pays) or looks like a system
  error, call notify_jorge with a clear one-paragraph summary and tell them you sent it to Jorge and he will reply by WhatsApp.
- Never invent prices, policies or reservation details.

STAFF GUIDE
${KB}`;

const TOOLS = [
  { name: 'find_guest', description: 'Find guests staying in the hotel (or arriving/leaving) on a date, by name and/or room. Read-only. Returns room, dates, reservation/retreat, checked-in status and the balance still owed on their folios.',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Guest name or part of it' }, room: { type: 'string', description: 'Room, e.g. 13b, GV16, CH2' }, date: { type: 'string', description: 'YYYY-MM-DD, default today (Tulum)' } } } },
  { name: 'notify_jorge', description: 'Send this question to Jorge by WhatsApp and email when you cannot solve it or it needs his decision.',
    input_schema: { type: 'object', properties: { summary: { type: 'string', description: 'What the staff member needs, in Spanish, one short paragraph, with names/rooms/amounts involved' } }, required: ['summary'] } },
];

const H = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const tulumDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&amp;/g, '&').trim();

async function findGuest(key, { name = '', room = '', date = '' }) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : tulumDate();
  const get = async p => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H(key) }); return r.ok ? r.json() : []; };
  const bks = await get(`bookings?select=id,retreat_name,leader_name,start_date,end_date,status,booking_type&status=neq.cancelled&start_date=lte.${day}&end_date=gte.${day}&limit=1000`);
  const byId = new Map(bks.map(b => [b.id, b])); const ids = [...byId.keys()]; const out = [];
  const n = norm(name), rm = norm(room).replace(/\s/g, '');
  for (let i = 0; i < ids.length && out.length < 15; i += 80) {
    const regs = await get(`registrations?select=id,booking_id,room,guests,check_in,check_out,cancelled,checked_in_at,checked_out_at&booking_id=in.(${ids.slice(i, i + 80).map(encodeURIComponent).join(',')})`);
    for (const r of regs) {
      if (r.cancelled) continue;
      const bk = byId.get(r.booking_id), s = r.check_in || bk.start_date, e = r.check_out || bk.end_date;
      if (!(s <= day && e >= day)) continue;
      if (rm && norm(r.room).replace(/\s/g, '') !== rm) continue;
      const guests = (r.guests || []).filter(g => g && g.name && !g.cancelled);
      if (n && !guests.some(g => norm(g.name).includes(n) || n.split(/\s+/).every(t => norm(g.name).includes(t)))) continue;
      const fo = await get(`folios?select=id&registration_id=eq.${encodeURIComponent(r.id)}`);
      const items = fo.length ? await get(`folio_items?select=qty,unit_price,tax_rate&folio_id=in.(${fo.map(f => f.id).join(',')})`) : [];
      const bal = items.reduce((t, x) => t + Number(x.qty) * Number(x.unit_price) * (1 + (Number(x.tax_rate) || 0) / 100), 0);
      out.push({ guests: guests.map(g => g.name).join(' & '), room: r.room, checkIn: s, checkOut: e, reservation: bk.booking_type === 'room_only' ? 'Room Only (' + (bk.retreat_name || '') + ')' : 'Retreat: ' + (bk.retreat_name || bk.leader_name),
        status: r.checked_out_at ? 'checked out' : r.checked_in_at ? 'checked in' : 'not checked in yet', folioBalanceUSD: Math.round(bal * 100) / 100 });
    }
  }
  return out.length ? out : { message: `No guest found for ${[name && 'name "' + name + '"', room && 'room ' + room].filter(Boolean).join(' and ')} on ${day}.` };
}

async function notifyJorge(key, who, page, summary) {
  const text = String(summary || '').slice(0, 900);
  // keep it
  try {
    const g = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.ask_jorge_questions&select=value`, { headers: H(key) });
    const [row] = g.ok ? await g.json() : [];
    const list = [{ at: new Date().toISOString(), by: who.name || '', page: page || '', summary: text }, ...(((row && row.value) || []).slice(0, 199))];
    await fetch(`${SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, { method: 'POST', headers: { ...H(key), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'ask_jorge_questions', value: list, updated_at: new Date().toISOString() }) });
  } catch (e) {}
  let wa = 'skipped';
  const visitoKey = process.env.VISITO_M2M_KEY, channelId = process.env.VISITO_WA_CHANNEL_ID;
  if (visitoKey && channelId) {
    try {
      const r = await fetch(`https://platform-api.visitoai.com/m2m/v1/whatsapp-templates/${encodeURIComponent(channelId)}/send`, {
        method: 'POST', headers: { Authorization: `Bearer ${visitoKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: JORGE_PHONE, template: { name: 'amansala_pregunta_portal', language: { code: 'es_MX' }, components: [{ type: 'body', parameters: [who.name || 'Alguien del staff', text, page || 'Portal'].map(t => ({ type: 'text', text: String(t).replace(/\s*\n\s*/g, ' ').slice(0, 900) })) }] } }),
      });
      const j = await r.json().catch(() => ({})); wa = r.ok && j.accepted !== false ? 'sent' : 'failed';
    } catch (e) { wa = 'failed'; }
  }
  const mail = await sendMail({ to: 'Jorge@amansala.com', subject: `Ask Jorge — pregunta de ${who.name || 'staff'}`,
    html: `<p><b>${(who.name || 'Alguien del staff')}</b> preguntó en el portal (${page || 'Portal'}) y el asistente no pudo resolverlo:</p><p style="white-space:pre-wrap">${text.replace(/</g, '&lt;')}</p>` }).catch(() => false);
  return { sent: wa === 'sent' || mail, whatsapp: wa, email: mail ? 'sent' : 'failed' };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid request' }); }
  const who = await staffAllowed({ headers: event.headers || {}, body: JSON.stringify({ token: b.token }) });
  if (!who) return reply(401, { error: 'Sign in again.' });
  const apiKey = process.env.ANTHROPIC_API_KEY, key = process.env.SUPABASE_SERVICE_KEY;
  if (!apiKey || !key) return reply(500, { error: 'The assistant is not configured.' });
  const page = String(b.page || '').slice(0, 60);
  const history = (Array.isArray(b.messages) ? b.messages : []).slice(-16)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!history.length || history[history.length - 1].role !== 'user') return reply(400, { error: 'Write a question.' });
  const messages = history.slice(); let notified = null;
  const system = [{ type: 'text', text: SYSTEM + `\n\nThe person asking: ${who.name || 'staff'}. Screen they are on: ${page || 'unknown'}. Today (Tulum): ${tulumDate()}.`, cache_control: { type: 'ephemeral' } }];
  try {
    for (let turn = 0; turn < 5; turn++) {
      const r = await fetch(ANTHROPIC_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1500, output_config: { effort: 'low' }, system, tools: TOOLS, messages }),
      });
      const j = await r.json();
      if (!r.ok) { console.error('[ask-jorge] api', r.status, JSON.stringify(j).slice(0, 300)); return reply(502, { error: 'The assistant is busy, try again in a moment.' }); }
      if (j.stop_reason === 'refusal') return reply(200, { answer: 'No puedo ayudar con eso. Si es algo del portal, pregúntaselo a Jorge directamente.' });
      const content = j.content || [];
      const uses = content.filter(c => c.type === 'tool_use');
      if (j.stop_reason !== 'tool_use' || !uses.length) {
        const answer = content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
        console.log('[ask-jorge]', who.name, page, JSON.stringify(j.usage || {}));
        return reply(200, { answer: answer || '…', notified });
      }
      messages.push({ role: 'assistant', content });
      const results = [];
      for (const u of uses) {
        let out;
        try {
          if (u.name === 'find_guest') out = await findGuest(key, u.input || {});
          else if (u.name === 'notify_jorge') { if (notified) out = { already: true }; else { notified = await notifyJorge(key, who, page, (u.input || {}).summary); out = notified; } }
          else out = { error: 'unknown tool' };
        } catch (e) { out = { error: e.message }; }
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out).slice(0, 8000) });
      }
      messages.push({ role: 'user', content: results });
    }
    return reply(200, { answer: 'Me tardé demasiado en responder. Intenta otra vez con una pregunta más corta.', notified });
  } catch (e) {
    console.error('[ask-jorge]', e);
    return reply(502, { error: 'Connection problem, try again.' });
  }
};
