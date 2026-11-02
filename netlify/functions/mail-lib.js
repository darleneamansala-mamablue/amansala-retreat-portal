'use strict';

// mail-lib.js — sends an email from Amansala <retreats@amansala.com> through Resend, from server code. Functions that
// email guests or staff (spa-public.js...) use this directly instead of calling send-email over the internet, which is
// what let any page -- or anyone -- send any message from that address.
async function sendMail({ to, subject, html, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to || !subject || !html) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Amansala <retreats@amansala.com>', to: Array.isArray(to) ? to : [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!r.ok) console.warn('[mail] Resend refused:', r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) { console.warn('[mail] send failed:', e.message); return false; }
}

module.exports = { sendMail };
