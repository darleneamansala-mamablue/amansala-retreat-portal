'use strict';

// backup-lib.js — the whole system in one file (Jorge 2026-11-05: "que llegue con todo... solo le de restore y todo este
// ahi"). buildBackup() reads EVERY table the database API serves (app_store included: spa, settings, staff schedules,
// accounts...), page by page, plus each table's primary key (so a restore knows which row is which) and the images in
// the 'public-images' storage bucket (as base64, while they fit in the email). The portal's Settings > Backup & Restore
// (modules/backup-restore.js + restore-backup.js) puts it back.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const BUCKET = 'public-images';
const PAGE = 1000;
const IMAGES_MAX_BYTES = 12 * 1048576;   // the email (Resend) takes 40 MB in all, base64 included

const hdrs = key => ({ apikey: key, Authorization: `Bearer ${key}` });

// table -> primary key columns, from the API's own description ("<pk/>" on each key column)
async function schemaOf(key) {
  const spec = await (await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { ...hdrs(key), Accept: 'application/openapi+json' } })).json();
  const out = {};
  for (const [t, def] of Object.entries(spec.definitions || {})) {
    const props = def.properties || {};
    out[t] = { pk: Object.keys(props).filter(c => /<pk\/>/.test(String(props[c].description || ''))), columns: Object.keys(props) };
  }
  return out;
}

async function readTable(key, t, cols) {
  const order = cols.pk && cols.pk.length ? `&order=${cols.pk.join(',')}` : '';
  const rows = [];
  for (let off = 0; ; off += PAGE) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(t)}?select=*${order}&limit=${PAGE}&offset=${off}`, { headers: hdrs(key) });
    if (!r.ok) throw new Error(String(r.status));
    const page = await r.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

async function listImages(key, prefix = '') {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST', headers: { ...hdrs(key), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  });
  if (!r.ok) return [];
  const out = [];
  for (const o of await r.json()) {
    const path = prefix ? `${prefix}/${o.name}` : o.name;
    if (o.id == null) out.push(...await listImages(key, path));   // a folder
    else out.push({ path, size: (o.metadata && o.metadata.size) || 0, contentType: (o.metadata && o.metadata.mimetype) || 'application/octet-stream' });
  }
  return out;
}

async function buildBackup(key) {
  const schema = await schemaOf(key);
  const tables = {}, counts = {}, failed = [];
  for (const t of Object.keys(schema).sort()) {
    try { tables[t] = await readTable(key, t, schema[t]); counts[t] = tables[t].length; }
    catch (e) { failed.push(`${t} (${e.message})`); }
  }
  // images, while they fit
  const images = [], imagesSkipped = [];
  let bytes = 0;
  try {
    for (const f of await listImages(key)) {
      if (bytes + f.size > IMAGES_MAX_BYTES) { imagesSkipped.push(f.path); continue; }
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${f.path.split('/').map(encodeURIComponent).join('/')}`, { headers: hdrs(key) });
      if (!r.ok) { imagesSkipped.push(f.path); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      bytes += buf.length;
      images.push({ bucket: BUCKET, path: f.path, contentType: f.contentType, base64: buf.toString('base64') });
    }
  } catch (e) { failed.push('images (' + e.message + ')'); }
  return {
    backup: { format: 'amansala-full-backup-v2', exportedAt: new Date().toISOString(), schema, tables, images, imagesSkipped },
    counts, failed, images: images.length, imagesSkipped: imagesSkipped.length,
  };
}

module.exports = { buildBackup, schemaOf, SUPABASE_URL, BUCKET };
