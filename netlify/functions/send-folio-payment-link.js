'use strict';

// "Send to Guest" button on a folio (modules/booking-detail.js) -- sends the
// guest their guest-pay.html?token=... link by email and/or WhatsApp, instead
// of only copying it to the clipboard like it used to. Jorge's ask
// 2026-10-14: "me gustaria que pueda enviar por email y por whatsapp...pay
// your booking or extras here y que tenga un hiperenlace para que puedan
// pagar". Mirrors send-booking-confirmation.js's email+WhatsApp shape, but
// for an existing folio's payment link rather than a brand-new reservation.
//
// WhatsApp goes out through a Meta-approved template -- outside the 24h
// window only a pre-approved template can be sent, so the WhatsApp wording
// itself is whatever that template's approved body text says (first name +
// link are the only parts filled in here); the phrase "Pay your booking or
// extras here" is used verbatim in the email, which has no such restriction.
// Jorge's ask 2026-10-14: a reservation entered manually by staff (Walk-in/
// Direct/OTA, booking.bookingType==='room_only') should say so ("thanks for
// booking with us directly") rather than the generic checkout-reminder
// template every other folio uses -- pass manual:true for those.
const VISITO_API = 'https://platform-api.visitoai.com/m2m/v1';

function toE164(raw) {
  const s = String(raw || '').replace(/[‎-‏]/g, '').trim();
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return digits.length >= 10 && digits.length <= 15 ? '+' + digits : null;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length === 12 && digits.startsWith('52')) return '+' + digits;
  if (digits.length === 13 && digits.startsWith('521')) return '+' + digits;
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { token, guestName, email, phone, manual, force } = body;
  if (!token) return jsonErr(400, 'Missing token');
  if (!email && !phone) return jsonErr(400, 'Need an email or phone to send to');

  // Jorge 2026-11-06: Sue Elliot got the same WhatsApp 6 times in 2 minutes (the button pressed again and again). The same
  // folio link goes once per 15 minutes: a repeat answers "already sent" unless the person confirms (force); the WhatsApp
  // Idempotency-Key is per 15-minute window too, so even a double click at the same instant sends one.
  const SB = 'https://vnttlpqkssihbmcynxvo.supabase.co', sk = process.env.SUPABASE_SERVICE_KEY, H = { apikey: sk, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json' };
  const win = Math.floor(Date.now() / (15 * 60e3));
  let sentLog = {};
  if (sk) try { const r = await fetch(`${SB}/rest/v1/app_store?key=eq.folio_link_sent&select=value`, { headers: H }); const [row] = r.ok ? await r.json() : []; sentLog = (row && row.value) || {}; } catch (e) {}
  const last = sentLog[token];
  if (!force && last && Date.now() - Date.parse(last) < 15 * 60e3) {
    return { statusCode: 200, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ alreadySent: true, sentAt: last }) };
  }
  if (sk) try {
    const keep = Object.fromEntries(Object.entries(sentLog).filter(([, t]) => Date.now() - Date.parse(t) < 864e5));
    keep[token] = new Date().toISOString();
    await fetch(`${SB}/rest/v1/app_store?on_conflict=key`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'folio_link_sent', value: keep, updated_at: new Date().toISOString() }) });
  } catch (e) {}

  const link = `https://amansalaportal.com/guest-pay.html?token=${encodeURIComponent(token)}`;
  const firstName = String(guestName || '').trim().split(/\s+/)[0] || 'there';
  const results = { email: null, whatsapp: null };

  // ── Email (Resend) ────────────────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;
  if (email) {
    if (!resendKey) {
      results.email = 'not configured';
    } else {
      try {
        const html = `<p>Hi ${firstName},</p><p>Pay your booking or extras here:</p><p><a href="${link}" style="display:inline-block;background:#2f4733;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Pay Now</a></p><p>Or copy this link: <a href="${link}">${link}</a></p>`;
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'Amansala <retreats@amansala.com>', to: [email], subject: 'Amansala Tulum · Pay your booking or extras here', html }),
        });
        results.email = r.ok ? 'sent' : `failed (${r.status})`;
        if (!r.ok) console.warn('[send-folio-payment-link] email failed:', await r.text());
      } catch (e) {
        results.email = 'error: ' + e.message;
        console.warn('[send-folio-payment-link] email error (non-fatal):', e.message);
      }
    }
  }

  // ── WhatsApp (Visito template) ──────────────────────────────────────────
  if (phone) {
    const to = toE164(phone);
    const visitoKey = process.env.VISITO_M2M_KEY;
    const channelId = process.env.VISITO_WA_CHANNEL_ID;
    const templateName = manual
      ? (process.env.VISITO_MANUAL_BOOKING_TEMPLATE || 'manual_booking_payment_link')
      : process.env.VISITO_CHECKOUT_TEMPLATE;
    const templateLang = (manual ? process.env.VISITO_MANUAL_BOOKING_TEMPLATE_LANG : process.env.VISITO_CHECKOUT_TEMPLATE_LANG) || 'en_US';
    if (!to) {
      results.whatsapp = 'no usable phone';
    } else if (!visitoKey || !channelId || !templateName) {
      results.whatsapp = 'not configured';
    } else {
      try {
        const waRes = await fetch(`${VISITO_API}/whatsapp-templates/${encodeURIComponent(channelId)}/send`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${visitoKey}`, 'Content-Type': 'application/json',
            'Idempotency-Key': force ? `folio-pay-${token}-${Date.now()}` : `folio-pay-${token}-${to}-${win}`,
          },
          body: JSON.stringify({
            to,
            template: {
              name: templateName,
              language: { code: templateLang },
              components: [{ type: 'body', parameters: [{ type: 'text', text: firstName }, { type: 'text', text: link }] }],
            },
          }),
        });
        const waBody = await waRes.json().catch(() => ({}));
        results.whatsapp = (waRes.ok && waBody.accepted !== false) ? 'sent' : `failed (${waRes.status})`;
        if (results.whatsapp !== 'sent') console.warn('[send-folio-payment-link] WhatsApp failed:', waRes.status, JSON.stringify(waBody).slice(0, 300));
      } catch (e) {
        results.whatsapp = 'error: ' + e.message;
        console.warn('[send-folio-payment-link] WhatsApp error (non-fatal):', e.message);
      }
    }
  }

  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, results, link }),
  };
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
