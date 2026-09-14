'use strict';

// Twilio StatusCallback webhook — called as a message moves through
// queued -> sent -> delivered (or failed/undelivered), so `messages.status`
// stays current instead of freezing at whatever send-message.js got back
// from the initial send.
// Configure in Twilio: send-message.js already passes this URL as the
// StatusCallback param on every outbound message, so no separate console
// setup is needed.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return { statusCode: 500, body: 'Supabase not configured' };

  const params = new URLSearchParams(event.body || '');
  const sid = params.get('MessageSid') || params.get('SmsSid') || '';
  const status = params.get('MessageStatus') || params.get('SmsStatus') || '';
  const errorCode = params.get('ErrorCode') || null;

  if (!sid || !status) return { statusCode: 200, body: '' };

  const hdrs = {
    apikey: supaKey,
    Authorization: `Bearer ${supaKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  await fetch(`${SUPABASE_URL}/rest/v1/messages?twilio_sid=eq.${encodeURIComponent(sid)}`, {
    method: 'PATCH',
    headers: hdrs,
    body: JSON.stringify({
      status,
      error_code: errorCode,
      status_updated_at: new Date().toISOString(),
    }),
  });

  return { statusCode: 200, body: '' };
};
