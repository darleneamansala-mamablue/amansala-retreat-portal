'use strict';

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let code, source, checkIn, checkOut;
  try { ({ code, source, checkIn, checkOut } = JSON.parse(event.body || '{}')); }
  catch { return jsonErr(400, 'Invalid JSON'); }
  if (!code) return jsonErr(400, 'Missing code');

  const hdrs = {
    'apikey':        supaKey,
    'Authorization': `Bearer ${supaKey}`,
  };

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/be_discount_codes?code=eq.${encodeURIComponent(code.toUpperCase().trim())}&active=eq.true&select=*`,
      { headers: hdrs }
    );
    if (!res.ok) return jsonErr(500, 'DB error');
    const rows = await res.json();
    const dc = rows[0];

    if (!dc) return jsonErr(404, 'Código no válido');
    if (dc.expires_at && new Date(dc.expires_at + 'T23:59:59') < new Date()) {
      return jsonErr(400, 'El código ha expirado');
    }
    if (dc.max_uses != null && dc.used_count >= dc.max_uses) {
      return jsonErr(400, 'El código ha alcanzado su límite de uso');
    }
    const pageKey = source === 'Extra Night' ? 'extra_nights' : 'escape';
    if (dc.applies_to && dc.applies_to !== 'all' && dc.applies_to !== pageKey) {
      return jsonErr(404, 'Código no válido');
    }
    // Blackout stay dates — the code simply doesn't apply if the guest's stay
    // overlaps this range at all (e.g. Scouting 50% off, blocked Dec27–Jan15).
    if (dc.blackout_start && dc.blackout_end && checkIn && checkOut) {
      const overlaps = checkIn < dc.blackout_end && checkOut > dc.blackout_start;
      if (overlaps) return jsonErr(400, 'Ese código no aplica para esas fechas');
    }

    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valid:       true,
        code:        dc.code,
        type:        dc.type,
        value:       dc.value,
        description: dc.description ?? null,
      }),
    };
  } catch (err) {
    return jsonErr(500, err.message);
  }
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
