'use strict';

// ONE-OFF: creates the new 'manual_booking_payment_link' WhatsApp template via
// Visito's M2M API (POST /whatsapp-templates/{channelId}), since the real
// VISITO_M2M_KEY value can't be read back out of Netlify once it's stored as
// a sensitive env var (not even by us, from the CLI) -- only a deployed
// function actually has it in process.env. Meant to be called exactly once
// then deleted; see send-folio-payment-link.js for where this template gets
// used once Meta approves it.
const VISITO_API = 'https://platform-api.visitoai.com/m2m/v1';

exports.handler = async () => {
  const m2mKey = process.env.VISITO_M2M_KEY;
  const channelId = process.env.VISITO_WA_CHANNEL_ID;
  if (!m2mKey || !channelId) return { statusCode: 500, body: JSON.stringify({ error: 'VISITO_M2M_KEY / VISITO_WA_CHANNEL_ID missing' }) };

  const r = await fetch(`${VISITO_API}/whatsapp-templates/${encodeURIComponent(channelId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${m2mKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template: {
        name: 'manual_booking_payment_link',
        language: 'en_US',
        category: 'UTILITY',
        components: [{
          type: 'BODY',
          text: 'Hi {{1}}, thanks for booking with us directly. Pay your booking or extras here: {{2}}.',
          example: { body_text: [['Jorge', 'https://amansalaportal.com/guest-pay.html?token=abc123']] },
        }],
      },
    }),
  });
  const body = await r.text();
  return { statusCode: r.status, headers: { 'Content-Type': 'application/json' }, body };
};
