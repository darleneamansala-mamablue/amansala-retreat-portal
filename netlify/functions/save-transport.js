'use strict';

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

function cors() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
function ok(body) {
  return { statusCode: 200, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let entry;
  try { entry = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  if (!entry?.id) return jsonErr(400, 'Missing entry id');

  const row = {
    id:           entry.id,
    booking_id:   entry.bookingId ?? null,
    data:         entry,
    submitted_at: entry.submittedAt ?? new Date().toISOString(),
  };

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/transport?on_conflict=id`,
    {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        supaKey,
        'Authorization': `Bearer ${supaKey}`,
        'Prefer':        'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(row),
    }
  );

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) return jsonErr(res.status, typeof data === 'object' ? (data[0]?.message ?? JSON.stringify(data)) : text);
  const saved = Array.isArray(data) ? data[0] : data;
  return ok({ id: saved?.id ?? entry.id });
};
