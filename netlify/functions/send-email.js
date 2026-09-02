exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'RESEND_API_KEY not configured' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { to, subject, html, replyTo } = payload;
  if (!to || !subject || !html) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing to, subject, or html' }) };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Amansala <retreats@amansala.com>',
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {})
      })
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[send-email] Resend error:', data);
      return { statusCode: res.status, body: JSON.stringify(data) };
    }
    return { statusCode: 200, body: JSON.stringify({ id: data.id }) };
  } catch (err) {
    console.error('[send-email] Exception:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
