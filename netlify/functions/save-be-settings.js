'use strict';

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let fields;
  try { fields = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const payload = { ...fields, updated_at: new Date().toISOString() };

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/booking_engine_settings?id=eq.1`,
    {
      method: 'PATCH',
      headers: {
        'apikey': supaKey,
        'Authorization': `Bearer ${supaKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return jsonErr(500, 'Supabase error: ' + err);
  }

  const rows = await res.json();
  if (!rows.length) {
    // Row doesn't exist — insert it
    const ins = await fetch(
      `${SUPABASE_URL}/rest/v1/booking_engine_settings`,
      {
        method: 'POST',
        headers: {
          'apikey': supaKey,
          'Authorization': `Bearer ${supaKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ id: 1, ...payload }),
      }
    );
    if (!ins.ok) {
      const err = await ins.text();
      return jsonErr(500, 'Insert error: ' + err);
    }
    const inserted = await ins.json();
    return ok(inserted[0] ?? {});
  }

  return ok(rows[0]);
};

function ok(data) {
  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  };
}
function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' };
}
function jsonErr(code, msg) {
  return {
    statusCode: code,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: msg }),
  };
}
