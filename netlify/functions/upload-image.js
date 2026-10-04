'use strict';

// Generic image upload endpoint, using the Supabase service key (never sent
// to the browser) to write to Supabase Storage. First built for the Guest
// Book admin editor (Booking Engine → Guest Book) so non-technical staff can
// add/replace photos by picking a file, instead of needing an already-hosted
// image URL.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const BUCKET = 'public-images';

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
function ok(body) {
  return { statusCode: 200, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function ensureBucket(supaKey) {
  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json' };
  const check = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers: hdrs });
  if (check.ok) return;
  await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST', headers: hdrs,
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  }).catch(() => {});
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { filename, contentType, dataBase64, folder } = body;
  if (!filename || !contentType || !dataBase64) return jsonErr(400, 'Missing filename, contentType or dataBase64');
  if (!contentType.startsWith('image/')) return jsonErr(400, 'Only image uploads are allowed');

  let buf;
  try { buf = Buffer.from(dataBase64, 'base64'); }
  catch { return jsonErr(400, 'Invalid base64 data'); }
  if (buf.length > 8 * 1024 * 1024) return jsonErr(400, 'Image too large (max 8MB)');

  await ensureBucket(supaKey);

  const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80);
  const folderPath = folder ? String(folder).replace(/[^a-zA-Z0-9_-]/g, '-') + '/' : '';
  const path = `${folderPath}${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: supaKey, Authorization: `Bearer ${supaKey}`,
      'Content-Type': contentType, 'x-upsert': 'true',
    },
    body: buf,
  });
  if (!upRes.ok) {
    const txt = await upRes.text().catch(() => '');
    return jsonErr(upRes.status, 'Upload failed: ' + txt.slice(0, 300));
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  return ok({ url: publicUrl });
};
