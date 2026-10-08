'use strict';

// ===== Payment WhatsApp notification (shared helper) =====
// Jorge's ask 2026-10-08: whenever a payment happens anywhere in the system
// (We Travel, Booking Engine/Escape/Extra Night, or an individual guest
// folio), he wants a WhatsApp alert with the reservation's dates, guest name,
// amount, and whether it succeeded or failed -- via an approved Meta
// template, so it's reliable even outside any 24h free-form conversation
// window (unlike send-message.js's plain WhatsApp send, which needs a recent
// inbound message from the recipient).
//
// Template "amansala_payment_notification" (es_MX, UTILITY category) was
// submitted via Visito's API 2026-10-08 and is PENDING Meta approval as of
// this writing -- sendPaymentNotification() below will just log a warning
// and no-op until Meta approves it (Visito returns an error for an
// unapproved template, caught and swallowed here so a slow/failed
// notification never blocks the actual payment flow that calls this).
//
// Exported as a plain function so other Netlify functions can
// `require('./notify-payment').sendPaymentNotification(...)` directly
// (same pattern wetravel.js already exports getToken/wtGet for reuse) --
// also has its own exports.handler for direct HTTP testing.

const VISITO_API    = 'https://platform-api.visitoai.com/m2m/v1';
const CHANNEL_ID    = '6abd2154f6a6b5cd69232824'; // WhatsApp +52 1 984 879 5999, tenant amansala-2
const TEMPLATE_NAME = 'amansala_payment_notification';
const TEMPLATE_LANG = 'es_MX';

// status: 'recibido' | 'FALLIDO' (any short Spanish status word works -- it's
// just {{1}} in the template, not validated against a fixed enum).
// source: 'We Travel' | 'Booking Engine' | 'Folio' (free text, {{3}}).
// dates: display string, e.g. "8 nov – 14 nov 2026" ({{4}}).
// amount: display string, e.g. "$2,100.00" ({{5}}).
//
// Recipients: Jorge always gets every payment alert. Jorge's ask
// 2026-10-08: a second number (WETRAVEL_ALERT_EXTRA_NUMBER) should ALSO get
// alerts, but ONLY for We Travel payments -- not Booking Engine, not Folios.
async function sendPaymentNotification({ status, guestName, source, dates, amount }) {
  const key = process.env.VISITO_M2M_KEY;
  const recipients = new Set();
  if (process.env.JORGE_WHATSAPP_NUMBER) recipients.add(process.env.JORGE_WHATSAPP_NUMBER);
  if (source === 'We Travel' && process.env.WETRAVEL_ALERT_EXTRA_NUMBER) recipients.add(process.env.WETRAVEL_ALERT_EXTRA_NUMBER);

  if (!recipients.size || !key) {
    console.warn('[notify-payment] missing recipient(s) or VISITO_M2M_KEY -- skipping WhatsApp alert');
    return { skipped: true, reason: 'not configured' };
  }

  const parameters = [
    { type: 'text', text: String(status || 'recibido').slice(0, 60) },
    { type: 'text', text: String(guestName || 'Huésped').slice(0, 60) },
    { type: 'text', text: String(source || 'Portal').slice(0, 60) },
    { type: 'text', text: String(dates || '—').slice(0, 60) },
    { type: 'text', text: String(amount || '—').slice(0, 60) },
  ];

  const results = [];
  for (const to of recipients) {
    try {
      const res = await fetch(`${VISITO_API}/whatsapp-templates/${CHANNEL_ID}/send`, {
        method: 'POST',
        headers: {
          Authorization:     `Bearer ${key}`,
          'Content-Type':    'application/json',
          'Idempotency-Key': `pay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        },
        body: JSON.stringify({ to, template: { name: TEMPLATE_NAME, language: { code: TEMPLATE_LANG }, components: [{ type: 'body', parameters }] } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('[notify-payment] send failed:', to, res.status, JSON.stringify(data).slice(0, 400));
        results.push({ to, error: true, status: res.status, data });
      } else {
        results.push({ to, ...data });
      }
    } catch (e) {
      console.warn('[notify-payment] send error:', to, e.message);
      results.push({ to, error: true, message: e.message });
    }
  }
  return { results };
}

exports.sendPaymentNotification = sendPaymentNotification;

// Direct-HTTP entrypoint, mainly for manual testing once the template is approved:
//   curl -X POST .../notify-payment -d '{"status":"recibido","guestName":"...","source":"We Travel","dates":"...","amount":"$1.00"}'
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  const result = await sendPaymentNotification(body);
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
};
