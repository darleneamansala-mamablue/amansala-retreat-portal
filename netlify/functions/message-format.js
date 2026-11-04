'use strict';

// message-format.js — the formal layout shared by the guest messages (Jorge, 2026-11-04): payment request, daily payment
// reminder and booking confirmation, each with the SAME text by email and by WhatsApp, in short paragraphs and with a
// "Contact Us" block (not one run-on paragraph). The new booking confirmation (email + WhatsApp template
// 'booking_confirmation_v2') is used once app_store 'message_format_v2' = {enabled: true} -- switched on when Meta
// approves the template; until then the old confirmation goes out.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const WHATSAPP_URL = 'https://wa.me/529848795999';
const CONFIRM_TEMPLATE_V2 = 'booking_confirmation_v2';

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// same lines as the WhatsApp templates' closing:  *Contact Us* / WhatsApp / Email / We look forward... / Warm regards
const contactHtml = () => `<p><strong>Contact Us</strong><br>WhatsApp: <a href="${WHATSAPP_URL}">+52 1 984 879 5999</a><br>Email: <a href="mailto:amansala.reservations@gmail.com">amansala.reservations@gmail.com</a></p>
<p>We look forward to welcoming you to Tulum!</p>
<p>Warm regards,<br>The Amansala Team</p>`;

function confirmEmailHtml({ firstName, dateRange, roomType, guestBookUrl }) {
  return `<p>Hi ${esc(firstName || 'there')},</p>
<p>Thank you for your booking! We are looking forward to hosting you <strong>${esc(dateRange)}</strong> in a <strong>${esc(roomType)}</strong> room.</p>
<p>Should you need anything prior to arrival, we are here to assist you. In the meantime, please take a look at our Guest Book with helpful info:<br><a href="${esc(guestBookUrl)}">${esc(guestBookUrl)}</a></p>
${contactHtml()}`;
}

async function formatV2(supaKey) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.message_format_v2&select=value`, { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } });
    const [row] = r.ok ? await r.json() : [];
    return !!(row && row.value && row.value.enabled);
  } catch (e) { return false; }
}

module.exports = { contactHtml, confirmEmailHtml, formatV2, CONFIRM_TEMPLATE_V2, WHATSAPP_URL, esc };
