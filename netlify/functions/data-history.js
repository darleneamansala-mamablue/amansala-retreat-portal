'use strict';

// data-history.js — the History screen (modules/data-history.js): every change the database kept in data_history
// (sql/data_history.sql) and a one-click restore (Jorge 2026-11-07: "cubrir 100% errores de reescritura perdida y datos").
// Admin logins only. POST {token, action}:
//   list {tbl?, q?, since?}  -> newest 150 changes: when, who, what (a readable label), fields changed
//   get {id}                 -> one change with the before / after of each field
//   restore {id}             -> puts back what that change replaced or deleted (the restore is itself kept in the history)
const { staffAllowed, cors, reply } = require('./portal-auth-lib');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const H = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const TABLES = ['bookings', 'registrations', 'folios', 'folio_items', 'payments', 'transport', 'booking_requests', 'commissions', 'app_store', 'room_types', 'be_rates', 'booking_engine_settings', 'be_discount_codes', 'restaurant_layouts', 'payment_shortlinks'];

// what the row is, in words
function label(tbl, d) {
  d = d || {};
  const g = Array.isArray(d.guests) ? d.guests.filter(x => x && x.name).map(x => x.name).join(' & ') : '';
  switch (tbl) {
    case 'bookings': return `${d.leader_name || d.retreat_name || 'Reservation'}${d.start_date ? ` · ${d.start_date} → ${d.end_date || ''}` : ''}`;
    case 'registrations': return `Room ${d.room || '?'}${g ? ' · ' + g : ' · (no guest)'}`;
    case 'folios': return `Folio "${d.name || d.guest_name || ''}"`;
    case 'folio_items': return `${d.description || 'Charge'}${d.unit_price != null ? ` · $${(Number(d.qty || 1) * Number(d.unit_price)).toFixed(2)}` : ''}`;
    case 'payments': return `Payment${d.amount != null ? ' $' + d.amount : ''}${d.method ? ' · ' + d.method : ''}${d.guest_name ? ' · ' + d.guest_name : ''}`;
    case 'transport': { const x = d.data || {}; return `Transport · ${[x.firstName, x.lastName].filter(Boolean).join(' ') || '?'}${x.arrivalDate ? ' · arr ' + x.arrivalDate : ''}${x.departureDate ? ' · dep ' + x.departureDate : ''}`; }
    case 'booking_requests': return `Online stay · ${[d.first_name, d.last_name].filter(Boolean).join(' ')} · ${d.room || ''} ${d.check_in || ''}`;
    case 'commissions': return `Commission ${d.type || ''} ${d.commission_amount != null ? '$' + d.commission_amount : ''}`;
    case 'app_store': return `Data: ${d.key || ''}`;
    case 'room_types': return `Room type ${d.name || d.id || ''}`;
    case 'be_rates': return `Price ${d.room_type_id || ''} ${d.start_date || ''}${d.end_date && d.end_date !== d.start_date ? '→' + d.end_date : ''}${d.price_single != null ? ' · $' + d.price_single : ''}`;
    case 'booking_engine_settings': return 'Booking Engine settings';
    case 'be_discount_codes': return `Discount code ${d.code || ''}`;
    case 'restaurant_layouts': return `Restaurant layout ${d.name || d.id || ''}`;
    case 'payment_shortlinks': return `Payment link ${d.code || d.id || ''}`;
    default: return tbl;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid request' }); }
  const who = await staffAllowed({ headers: event.headers || {}, body: JSON.stringify({ token: b.token }) }, { admin: true });
  if (!who) return reply(401, { error: 'Admins only — sign in again.' });
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  const get = async p => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H(key) }); if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`); return r.json(); };
  try {
    if (b.action === 'list') {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/data_history_search`, { method: 'POST', headers: H(key),
        body: JSON.stringify({ p_tbl: TABLES.includes(b.tbl) ? b.tbl : '', p_q: String(b.q || '').trim().slice(0, 80), p_since: b.since || null, p_limit: 150 }) });
      if (!r.ok) {
        const t = await r.text();
        if (/data_history_search|does not exist|Could not find/i.test(t)) return reply(200, { notInstalled: true, items: [] });
        throw new Error(t.slice(0, 200));
      }
      const rows = await r.json();
      return reply(200, { items: rows.map(h => ({ id: h.id, at: h.at, tbl: h.tbl, op: h.op, rowId: h.row_id, who: h.who, changed: h.changed || [],
        label: label(h.tbl, h.tbl === 'app_store' ? { key: h.row_id } : (h.old_data || {})) })) });
    }
    if (b.action === 'get') {
      const [h] = await get(`data_history?id=eq.${encodeURIComponent(b.id)}&select=*`);
      if (!h) return reply(404, { error: 'Not found' });
      const fields = h.tbl === 'app_store'
        ? [{ field: 'value', before: (h.old_data || {}).value, after: (h.new_data || {}).value }]
        : (h.op === 'DELETE' ? Object.keys(h.old_data || {}).map(k => ({ field: k, before: h.old_data[k], after: null }))
          : (h.changed || []).map(k => ({ field: k, before: (h.old_data || {})[k], after: (h.new_data || {})[k] })));
      return reply(200, { item: { id: h.id, at: h.at, tbl: h.tbl, op: h.op, rowId: h.row_id, who: h.who, label: label(h.tbl, h.tbl === 'app_store' ? { key: h.row_id } : h.old_data), fields } });
    }
    if (b.action === 'restore') {
      const [h] = await get(`data_history?id=eq.${encodeURIComponent(b.id)}&select=*`);
      if (!h) return reply(404, { error: 'Not found' });
      const now = new Date().toISOString();
      let done = '';
      if (h.tbl !== 'app_store') {
        const idCol = 'id';
        const [cur] = await get(`${h.tbl}?${idCol}=eq.${encodeURIComponent(h.row_id)}&select=*`);
        if (h.op === 'DELETE') {
          if (cur) return reply(409, { error: 'That row exists again — nothing to bring back.' });
          const row = { ...h.old_data };
          const r = await fetch(`${SUPABASE_URL}/rest/v1/${h.tbl}`, { method: 'POST', headers: { ...H(key), Prefer: 'return=minimal' }, body: JSON.stringify(row) });
          if (!r.ok) throw new Error((await r.text()).slice(0, 200));
          done = 'brought back';
        } else {
          if (!cur) return reply(409, { error: 'That row was deleted after this change — restore its deletion first.' });
          const patch = {};
          (h.changed || []).filter(k => k !== 'updated_at').forEach(k => { patch[k] = (h.old_data || {})[k] === undefined ? null : h.old_data[k]; });
          if ('updated_at' in cur) patch.updated_at = now;   // so open screens (CAS) see the change
          const r = await fetch(`${SUPABASE_URL}/rest/v1/${h.tbl}?${idCol}=eq.${encodeURIComponent(h.row_id)}`, { method: 'PATCH', headers: { ...H(key), Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
          if (!r.ok) throw new Error((await r.text()).slice(0, 200));
          done = `${Object.keys(patch).filter(k => k !== 'updated_at').join(', ')} put back`;
        }
      } else {
        // app_store: undo just what that change did inside the value, on top of whatever is there now
        const [cur] = await get(`app_store?key=eq.${encodeURIComponent(h.row_id)}&select=value,updated_at`);
        let value;
        if (h.op === 'DELETE' || !cur) value = (h.old_data || {}).value;
        else {
          const before = (h.old_data || {}).value, after = (h.new_data || {}).value, now0 = cur.value;
          if (Array.isArray(now0) && Array.isArray(before)) {
            const idOf = e => (e && typeof e === 'object' && e.id != null) ? String(e.id) : null;
            const oldIds = new Set(before.map(idOf).filter(Boolean));
            const addedIds = new Set((Array.isArray(after) ? after : []).map(idOf).filter(id => id && !oldIds.has(id)));
            value = now0.filter(e => !addedIds.has(idOf(e)));
            before.forEach(e => { const id = idOf(e); const i = id ? value.findIndex(x => idOf(x) === id) : value.findIndex(x => JSON.stringify(x) === JSON.stringify(e)); if (i >= 0) value[i] = e; else value.push(e); });
          } else if (now0 && typeof now0 === 'object' && before && typeof before === 'object' && !Array.isArray(before)) {
            value = { ...now0 };
            Object.keys(before).forEach(k => { value[k] = before[k]; });
            Object.keys(after && typeof after === 'object' ? after : {}).forEach(k => { if (!(k in before)) delete value[k]; });
          } else value = before;
        }
        const url = cur ? `${SUPABASE_URL}/rest/v1/app_store?key=eq.${encodeURIComponent(h.row_id)}&updated_at=eq.${encodeURIComponent(cur.updated_at)}` : `${SUPABASE_URL}/rest/v1/app_store`;
        const r = await fetch(url, { method: cur ? 'PATCH' : 'POST', headers: { ...H(key), Prefer: 'return=representation' }, body: JSON.stringify(cur ? { value, updated_at: now } : { key: h.row_id, value, updated_at: now }) });
        if (!r.ok || (cur && !(await r.json()).length)) return reply(409, { error: 'It changed just now — open it again and retry.' });
        done = 'previous version put back';
      }
      await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, { method: 'POST', headers: { ...H(key), Prefer: 'return=minimal' }, body: JSON.stringify({ id: 'id_' + Date.now() + '_dhr', action: 'Restored from History', detail: `${label(h.tbl, h.tbl === 'app_store' ? { key: h.row_id } : h.old_data)} — ${done} (change #${h.id} of ${h.at}, by ${h.who || '?'})`, booking_id: h.tbl === 'bookings' ? h.row_id : ((h.old_data || {}).booking_id || null), user_name: who.name || 'Admin', user_role: who.role || 'admin', created_at: now }) }).catch(() => {});
      return reply(200, { ok: true, done });
    }
    return reply(400, { error: 'Unknown action' });
  } catch (e) {
    console.error('[data-history]', e.message);
    return reply(500, { error: e.message });
  }
};
