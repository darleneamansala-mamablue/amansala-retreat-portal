'use strict';

// restore-backup.js — puts a backup (the daily email's .json.gz, backup-lib.js) back into the database, for Settings >
// Backup & Restore (modules/backup-restore.js). Jorge only. The page reads the file in the browser and sends it here in
// pieces (a function takes at most ~6 MB per call):
//   POST {token, action:'upsert', table, rows}   rows of the backup written back by their primary key (new or changed)
//   POST {token, action:'pks', table, offset}    the primary keys the table has NOW, 5000 at a time (to find rows the
//                                                backup does not have, for an exact restore)
//   POST {token, action:'delete', table, ids}    removes those rows (single-column primary keys only)
//   POST {token, action:'image', path, contentType, base64}   an image back into the storage bucket
//   POST {token, action:'backup-now'}            emails a fresh full backup first (send-backup-background.js)
const { staffFromEvent, cors, reply } = require('./portal-auth-lib');
const { schemaOf, SUPABASE_URL, BUCKET } = require('./backup-lib');

let schemaCache = null;
const hdrs = key => ({ apikey: key, Authorization: `Bearer ${key}` });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  const who = staffFromEvent(event, { names: ['jorge'] });
  if (!who) return reply(403, { error: 'Only Jorge can restore a backup.' });
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid request' }); }
  try {
    if (b.action === 'backup-now') {
      const secret = process.env.BACKUP_SECRET;
      const r = await fetch(`${process.env.URL || 'https://amansalaportal.com'}/.netlify/functions/send-backup-background`, { method: 'POST', headers: secret ? { 'x-backup-secret': secret } : {} });
      return reply(200, { ok: r.status === 202 || r.ok });
    }
    if (b.action === 'image') {
      const path = String(b.path || '').replace(/^\/+/, '');
      if (!path || /\.\./.test(path)) return reply(400, { error: 'Bad path' });
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST', headers: { ...hdrs(key), 'Content-Type': String(b.contentType || 'application/octet-stream'), 'x-upsert': 'true' },
        body: Buffer.from(String(b.base64 || ''), 'base64'),
      });
      return r.ok ? reply(200, { ok: true }) : reply(400, { error: `image ${r.status}: ${(await r.text()).slice(0, 200)}` });
    }
    schemaCache = schemaCache || await schemaOf(key);
    const table = String(b.table || '');
    const sc = schemaCache[table];
    if (!sc) return reply(400, { error: `Unknown table ${table}` });
    if (!sc.pk.length) return reply(400, { error: `${table} has no primary key: it cannot be restored row by row` });
    const T = encodeURIComponent(table);

    if (b.action === 'upsert') {
      const rows = Array.isArray(b.rows) ? b.rows : [];
      if (!rows.length) return reply(200, { ok: true, n: 0 });
      // only the columns the table still has (a column dropped since the backup would make the whole call fail)
      const cols = new Set(sc.columns);
      const clean = rows.map(r => Object.fromEntries(Object.entries(r).filter(([c]) => cols.has(c))));
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${T}?on_conflict=${sc.pk.join(',')}`, {
        method: 'POST', headers: { ...hdrs(key), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(clean),
      });
      return r.ok ? reply(200, { ok: true, n: clean.length }) : reply(400, { error: `${r.status}: ${(await r.text()).slice(0, 300)}` });
    }
    if (b.action === 'pks') {
      if (sc.pk.length !== 1) return reply(200, { ok: true, composite: true, ids: [] });
      const pk = sc.pk[0], off = Math.max(0, parseInt(b.offset, 10) || 0);
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${T}?select=${pk}&order=${pk}&limit=5000&offset=${off}`, { headers: hdrs(key) });
      if (!r.ok) return reply(400, { error: `${r.status}` });
      return reply(200, { ok: true, pk, ids: (await r.json()).map(x => x[pk]) });
    }
    if (b.action === 'delete') {
      if (sc.pk.length !== 1) return reply(400, { error: 'composite key' });
      const ids = (Array.isArray(b.ids) ? b.ids : []).slice(0, 200);
      if (!ids.length) return reply(200, { ok: true, n: 0 });
      const list = ids.map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(',');
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${T}?${sc.pk[0]}=in.(${encodeURIComponent(list)})`, { method: 'DELETE', headers: { ...hdrs(key), Prefer: 'return=minimal' } });
      return r.ok ? reply(200, { ok: true, n: ids.length }) : reply(400, { error: `${r.status}: ${(await r.text()).slice(0, 300)}` });
    }
    return reply(400, { error: 'Unknown action' });
  } catch (e) {
    console.error('[restore-backup]', e);
    return reply(500, { error: e.message });
  }
};
