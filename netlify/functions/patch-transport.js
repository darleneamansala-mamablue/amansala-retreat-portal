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

  let fields;
  try { fields = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { id, data } = fields;
  if (!id || data == null) return jsonErr(400, 'Missing required fields: id, data');

  // PATCH — updates only existing rows, never inserts
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/transport?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        supaKey,
        'Authorization': `Bearer ${supaKey}`,
      },
      body: JSON.stringify({ data }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    let d; try { d = JSON.parse(text); } catch { d = text; }
    return jsonErr(res.status, typeof d === 'object' ? (d[0]?.message ?? JSON.stringify(d)) : text);
  }
  return ok({ ok: true });
};
