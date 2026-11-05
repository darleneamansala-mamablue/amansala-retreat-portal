'use strict';
// backup-lib.js + restore-backup.js against a fake database API: the backup carries every table, its primary key and the
// images; a restore writes rows back by key, finds the rows created after the backup, removes them; Jorge only.
const assert = require('assert');
process.env.SUPABASE_SERVICE_KEY = 'k';
const db = { app_store: [{ key: 'spa_data', value: { therapists: [1] } }], folio_items: [{ id: 'a', unit_price: 1 }, { id: 'b', unit_price: 2 }] };
const calls = [];
global.fetch = async (url, opt = {}) => {
  const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => Buffer.from('IMG') });
  const u = new URL(url); const m = opt.method || 'GET';
  if (u.pathname === '/rest/v1/') return res(200, { definitions: {
    app_store: { properties: { key: { description: 'Note:\nThis is a Primary Key.<pk/>' }, value: {}, updated_at: {} } },
    folio_items: { properties: { id: { description: 'Note:\nThis is a Primary Key.<pk/>' }, unit_price: {} } } } });
  if (u.pathname.startsWith('/storage/v1/object/list/')) { const p = JSON.parse(opt.body).prefix; return res(200, p ? [{ id: 'x', name: 'a.png', metadata: { size: 3, mimetype: 'image/png' } }] : [{ id: null, name: 'spa' }]); }
  if (u.pathname.startsWith('/storage/v1/object/')) { calls.push(m + ' ' + u.pathname); return res(200, {}); }
  const t = u.pathname.split('/').pop();
  if (m === 'GET') { const sel = u.searchParams.get('select'); const rows = db[t]; return res(200, sel === '*' ? JSON.parse(JSON.stringify(rows)).slice(+u.searchParams.get('offset') || 0, (+u.searchParams.get('offset') || 0) + 1000) : rows.map(r => ({ [sel]: r[sel] }))); }
  if (m === 'POST') { JSON.parse(opt.body).forEach(r => { const pk = t === 'app_store' ? 'key' : 'id'; const i = db[t].findIndex(x => x[pk] === r[pk]); if (i >= 0) db[t][i] = r; else db[t].push(r); }); calls.push('upsert ' + t + ' ' + u.searchParams.get('on_conflict')); return res(201, null); }
  if (m === 'DELETE') { const v = decodeURIComponent(u.search).match(/in\.\((.*)\)/)[1].split(',').map(s => s.replace(/"/g, '')); db[t] = db[t].filter(r => !v.includes(r.id)); calls.push('delete ' + v); return res(204, null); }
};
const { buildBackup } = require('../netlify/functions/backup-lib');
const { signToken } = require('../netlify/functions/portal-auth-lib');
const fn = require('../netlify/functions/restore-backup');
const call = (name, body) => fn.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ token: signToken({ kind: 'staff', name, role: 'admin' }), ...body }) }).then(r => ({ code: r.statusCode, ...JSON.parse(r.body) }));
(async () => {
  const { backup, counts, images } = await buildBackup('k');
  assert.deepStrictEqual(counts, { app_store: 1, folio_items: 2 }); assert.strictEqual(images, 1);
  assert.deepStrictEqual(backup.schema.folio_items.pk, ['id']); assert.strictEqual(backup.images[0].path, 'spa/a.png');
  // damage: spa wiped, a row changed, a new row added
  db.app_store[0].value = { therapists: [] }; db.folio_items[0].unit_price = 99; db.folio_items.push({ id: 'c', unit_price: 3 });
  assert.strictEqual((await call('Melissa', { action: 'upsert', table: 'app_store', rows: [] })).code, 403);
  let r = await call('Jorge Canales', { action: 'upsert', table: 'app_store', rows: backup.tables.app_store }); assert.ok(r.ok);
  r = await call('Jorge Canales', { action: 'upsert', table: 'folio_items', rows: backup.tables.folio_items.map(x => ({ ...x, gone_col: 1 })) }); assert.ok(r.ok);
  assert.deepStrictEqual(db.app_store[0].value, { therapists: [1] }); assert.strictEqual(db.folio_items[0].unit_price, 1); assert.ok(!('gone_col' in db.folio_items[0]));
  r = await call('Jorge Canales', { action: 'pks', table: 'folio_items', offset: 0 }); assert.deepStrictEqual(r.ids, ['a', 'b', 'c']);
  r = await call('Jorge Canales', { action: 'delete', table: 'folio_items', ids: ['c'] }); assert.ok(r.ok); assert.strictEqual(db.folio_items.length, 2);
  r = await call('Jorge Canales', { action: 'image', path: 'spa/a.png', contentType: 'image/png', base64: backup.images[0].base64 }); assert.ok(r.ok);
  assert.strictEqual((await call('Jorge Canales', { action: 'image', path: '../x' })).code, 400);
  console.log('backup-restore: ok');
})().catch(e => { console.error(e); process.exit(1); });
