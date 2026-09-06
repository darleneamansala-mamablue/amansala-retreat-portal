const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return { statusCode: 500, body: 'Supabase not configured' };

  const hdrs = {
    'apikey':        supaKey,
    'Authorization': `Bearer ${supaKey}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal',
  };

  // Twilio sends form-encoded body
  const params   = new URLSearchParams(event.body || '');
  const from     = params.get('From')       || '';
  const body     = params.get('Body')       || '';
  const sid      = params.get('MessageSid') || '';
  const mediaUrl = params.get('MediaUrl0')  || null;

  if (!from) {
    return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: '<Response/>' };
  }

  const phone = from.replace(/^whatsapp:/i, '').trim();

  // Try to match guest by phone number stored in registrations.guests[]
  let guestName = null;
  let bookingId = null;
  let room      = null;

  const regsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/registrations?select=id,room,booking_id,guests&guests=not.is.null&limit=2000`,
    { headers: hdrs }
  );
  if (regsRes.ok) {
    const regs  = await regsRes.json();
    const digits = phone.replace(/\D/g, '');
    outer: for (const reg of regs) {
      for (const g of (reg.guests || [])) {
        const gDigits = (g.phone || '').replace(/\D/g, '');
        if (gDigits.length >= 7 && digits.endsWith(gDigits.slice(-10))) {
          guestName = g.name   || null;
          bookingId = reg.booking_id || null;
          room      = reg.room       || null;
          break outer;
        }
      }
    }
  }

  await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method:  'POST',
    headers: hdrs,
    body: JSON.stringify({
      direction:  'in',
      phone,
      guest_name: guestName,
      booking_id: bookingId,
      room,
      body:       body || null,
      media_url:  mediaUrl,
      twilio_sid: sid || null,
      sent_at:    new Date().toISOString(),
    }),
  });

  return {
    statusCode: 200,
    headers:    { 'Content-Type': 'text/xml' },
    body:       '<Response/>',
  };
};
