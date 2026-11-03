'use strict';

// Signed-in portal sessions only (2026-11-02): this used to send any message, to anyone, from retreats@amansala.com for
// whoever called it. The portal sends its staff-login pass (X-Portal-Token) and/or its database pass (Authorization:
// staff, spa, driver, confirm, or a teacher's pass for their own retreat). Public pages and server functions email through
// their own functions (mail-lib.js) instead.
const { staffFromEvent, verifyDbPass } = require('./portal-auth-lib');
function signedIn(event) {
  if (staffFromEvent(event)) return true;
  const h = event.headers || {}, auth = String(h.authorization || h.Authorization || '');
  return !!verifyDbPass(auth.replace(/^Bearer\s+/i, ''));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  if (!signedIn(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Sign out of the portal and sign in again to send emails.' }) };
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

  const { to, subject, html, replyTo, attachments, cc } = payload;
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
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(cc ? { cc: Array.isArray(cc) ? cc : [cc] } : {}),
        // Resend accepts {filename, content} where content is base64 — used by
        // "Email PDF" (Share Schedule) to send a real .pdf attachment instead
        // of just a link. Only filename/content are forwarded; any other
        // fields the caller sent (e.g. contentType, which Resend infers from
        // the filename extension) are ignored.
        ...(Array.isArray(attachments) && attachments.length
          ? { attachments: attachments.map(a => ({ filename: a.filename, content: a.content })) }
          : {})
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
