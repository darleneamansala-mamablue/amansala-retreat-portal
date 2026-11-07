'use strict';

// ask-jorge-requests.js — what staff asked Ask Jorge that it could not do (app_store 'ask_jorge_questions', written by
// ask-jorge.js notifyJorge) as a to-do list for Jorge (Jorge 2026-11-07: "asignármelo a mí, que yo dé Fixed y que reciban por
// WhatsApp o la notificación en su sesión que Jorge ya lo solucionó").
// POST {token, action}:
//   list                          -> Jorge: every request; anyone else: their own
//   resolve {id, status, reply}   -> Jorge only; status 'fixed' | 'declined'; the person gets a WhatsApp (portal_solicitud_resuelta)
//                                    and a notice in their portal session
//   mine                          -> the signed-in person's answered requests they have not seen yet (the in-session notice)
//   seen {ids}                    -> they closed the notice
//   delete {ids}                  -> Jorge only; removes requests
//   phones / setPhone {name, phone} -> Jorge: who gets the WhatsApp (staff accounts have no phone; falls back to the maintenance list)
const { staffAllowed, cors, reply } = require('./portal-auth-lib');
const { sendUtility } = require('./wa-utility-lib');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const H = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const digits = s => String(s || '').replace(/\D/g, '');
const first = s => String(s || '').trim().split(/\s+/)[0].toLowerCase();
const isJorge = who => /jorge/i.test(String(who && who.name || ''));

async function readRow(key, k) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.${k}&select=value,updated_at`, { headers: H(key) });
  const [row] = r.ok ? await r.json() : [];
  return row || null;
}
async function writeRow(key, k, value) {
  await fetch(`${SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, { method: 'POST', headers: { ...H(key), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: k, value, updated_at: new Date().toISOString() }) });
}
// change the list compare-and-swap, so a request Ask Jorge adds at the same moment is not lost
async function mutate(key, fn) {
  for (let i = 0; i < 10; i++) {
    const row = await readRow(key, 'ask_jorge_questions');
    const cur = row && Array.isArray(row.value) ? row.value : [];
    const out = fn(cur.map(x => ({ ...x })));
    if (!out || out.abort) return out;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.ask_jorge_questions&updated_at=eq.${encodeURIComponent(row.updated_at)}`, { method: 'PATCH', headers: { ...H(key), Prefer: 'return=representation' }, body: JSON.stringify({ value: out.list, updated_at: new Date().toISOString() }) });
    if (r.ok && (await r.json()).length) return out;
    await new Promise(res => setTimeout(res, 80 + Math.random() * 200));
  }
  throw new Error('The list was busy, try again.');
}
// requests saved before they had numbers (2026-11-07) get one by their position, oldest = lowest; the ones older than 3 days
// count as 'old' (already handled by WhatsApp back then), not as pending
// (counted from the oldest, so the number does not change when new requests are added on top; saved on the first change)
const withIds = list => list.map((x, i, a) => x.id ? x : { ...x, id: 'AJ-0' + (a.length - i), status: x.status || (Date.now() - Date.parse(x.at || 0) < 3 * 864e5 ? 'open' : 'old') });
const mineOf = (x, who) => (x.byId && x.byId === who.sub) || (!x.byId && first(x.by) && first(x.by) === first(who.name));

async function phoneFor(key, name) {
  const [own, mt] = await Promise.all([readRow(key, 'staff_phones'), readRow(key, 'maintenance_alert_numbers')]);
  const map = (own && own.value) || {};
  const f = first(name);
  if (map[f]) return map[f];
  const hit = ((mt && mt.value) || []).find(p => first(p.name) === f);
  return hit ? hit.phone : '';
}
const e164 = p => { const d = digits(p); if (!d) return ''; if (d.length === 10) return '52' + d; return d; };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid request' }); }
  const who = await staffAllowed({ headers: event.headers || {}, body: JSON.stringify({ token: b.token }) });
  if (!who) return reply(401, { error: 'Sign in again.' });
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  try {
    if (b.action === 'list') {
      const row = await readRow(key, 'ask_jorge_questions');
      const list = withIds((row && row.value) || []);
      return reply(200, { jorge: isJorge(who), requests: isJorge(who) ? list : list.filter(x => mineOf(x, who)) });
    }
    if (b.action === 'mine') {
      const row = await readRow(key, 'ask_jorge_questions');
      return reply(200, { answered: withIds((row && row.value) || []).filter(x => mineOf(x, who) && (x.status === 'fixed' || x.status === 'declined') && !x.seenAt).slice(0, 10) });
    }
    if (b.action === 'seen') {
      const ids = new Set((Array.isArray(b.ids) ? b.ids : []).map(String));
      await mutate(key, list => ({ list: withIds(list).map(x => ids.has(x.id) && mineOf(x, who) ? { ...x, seenAt: new Date().toISOString() } : x) }));
      return reply(200, { ok: true });
    }
    if (!isJorge(who)) return reply(403, { error: 'Only Jorge can do this.' });
    if (b.action === 'resolve') {
      const status = b.status === 'declined' ? 'declined' : 'fixed', note = String(b.reply || '').trim().slice(0, 400);
      const out = await mutate(key, list => {
        list = withIds(list);
        const i = list.findIndex(x => x.id === String(b.id || ''));
        if (i < 0) return { abort: true, error: 'Request not found' };
        list[i] = { ...list[i], status, reply: note, resolvedAt: new Date().toISOString(), resolvedBy: who.name || 'Jorge', seenAt: null };
        return { list, item: list[i] };
      });
      if (out.abort) return reply(404, { error: out.error });
      const x = out.item;
      // WhatsApp to the person (Utility template only -- wa-utility-lib skips it until Meta approves it); the in-session notice works either way
      let whatsapp = 'no phone';
      const phone = await phoneFor(key, x.by);
      if (digits(phone).length >= 10) {
        const req = String(x.request || x.summary || '').replace(/\s+/g, ' ').replace(/^Pidió:\s*/i, '').split(' No se pudo porque:')[0].slice(0, 300) || '-';
        const sent = await sendUtility(e164(phone), [['portal_solicitud_resuelta', [first(x.by) ? x.by.split(' ')[0] : 'equipo', req, status === 'fixed' ? 'Resuelta ✅' : 'No se va a hacer', note || (status === 'fixed' ? 'Listo' : '-')]]], 'es_MX', 'ajr-' + x.id);
        whatsapp = sent ? 'sent' : 'not sent (template not approved yet or no WhatsApp)';
      }
      await mutate(key, list => ({ list: withIds(list).map(y => y.id === x.id ? { ...y, notified: { at: new Date().toISOString(), whatsapp } } : y) })).catch(() => {});
      await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, { method: 'POST', headers: { ...H(key), Prefer: 'return=minimal' }, body: JSON.stringify({ id: 'id_' + Date.now() + '_ajr', action: 'Ask Jorge request ' + status, detail: `${x.id} · ${x.by}: ${String(x.request || x.summary || '').slice(0, 160)}${note ? ' — ' + note : ''} · WhatsApp ${whatsapp}`, booking_id: null, user_name: who.name || 'Jorge', user_role: who.role || 'admin', created_at: new Date().toISOString() }) }).catch(() => {});
      return reply(200, { ok: true, item: { ...x, notified: { whatsapp } } });
    }
    if (b.action === 'delete') {   // Jorge 2026-11-07: remove requests he does not need (numbers of the others stay as they are)
      const ids = new Set((Array.isArray(b.ids) ? b.ids : [b.id]).map(String));
      const out = await mutate(key, list => { const all = withIds(list); return { list: all.filter(x => !ids.has(x.id)), removed: all.filter(x => ids.has(x.id)).length }; });
      return reply(200, { ok: true, removed: out.removed });
    }
    if (b.action === 'phones') {
      const row = await readRow(key, 'staff_phones');
      return reply(200, { phones: (row && row.value) || {} });
    }
    if (b.action === 'setPhone') {
      const row = await readRow(key, 'staff_phones'), map = { ...((row && row.value) || {}) }, f = first(b.name);
      if (!f) return reply(400, { error: 'Name required' });
      if (digits(b.phone).length >= 10) map[f] = String(b.phone).trim(); else delete map[f];
      await writeRow(key, 'staff_phones', map);
      return reply(200, { ok: true, phones: map });
    }
    return reply(400, { error: 'Unknown action' });
  } catch (e) {
    console.error('[ask-jorge-requests]', e.message);
    return reply(500, { error: e.message });
  }
};
