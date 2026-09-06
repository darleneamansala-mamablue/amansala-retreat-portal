const SUPABASE_URL  = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const supaKey      = process.env.SUPABASE_SERVICE_KEY;
  const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const WA_FROM      = process.env.TWILIO_WHATSAPP_NUMBER;
  const SMS_FROM     = process.env.TWILIO_SMS_NUMBER;

  if (!supaKey) return { statusCode: 500, body: JSON.stringify({ error: 'Supabase not configured' }) };

  const hdrs = {
    'apikey':        supaKey,
    'Authorization': `Bearer ${supaKey}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
  };

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { to, body, channel = 'whatsapp', guestName, bookingId, room } = payload;
  if (!to || !body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing to or body' }) };
  }

  const row = {
    direction:  'out',
    phone:      to,
    channel,
    guest_name: guestName || null,
    booking_id: bookingId || null,
    room:       room      || null,
    body,
    sent_at:    new Date().toISOString(),
  };

  // If Twilio not yet configured, save as pending
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    row.status = 'pending_twilio';
    const r = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: 'POST', headers: hdrs, body: JSON.stringify(row),
    });
    const data = await r.json();
    return { statusCode: 200, body: JSON.stringify({ id: data?.[0]?.id, status: 'pending_twilio' }) };
  }

  // Send via Twilio
  const twilioTo   = channel === 'whatsapp' ? `whatsapp:${to}` : to;
  const twilioFrom = channel === 'whatsapp' ? WA_FROM : SMS_FROM;

  const auth   = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const twRes  = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method:  'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ From: twilioFrom, To: twilioTo, Body: body }).toString(),
    }
  );

  const tw = await twRes.json();
  if (!twRes.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: tw.message || 'Twilio error' }) };
  }

  row.twilio_sid = tw.sid;
  row.status     = tw.status || 'sent';

  const r    = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: 'POST', headers: hdrs, body: JSON.stringify(row),
  });
  const data = await r.json();

  return { statusCode: 200, body: JSON.stringify({ id: data?.[0]?.id, sid: tw.sid }) };
};
