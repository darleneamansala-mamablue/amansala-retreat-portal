'use strict';

// Sends the same guest booking-confirmation (email + WhatsApp) that
// stripe-webhook.js sends for Escape/Lana bookings, but for a reservation
// created directly by staff in Rooms (Booking Engine → Rooms → New
// Reservation) -- there's no Stripe payment event to hang off of there, so
// venues.js's rmSaveNewBooking() calls this function right after saving a
// brand-new room-only booking. Jorge's ask 2026-10-05: the confirmation
// should go out no matter which of the three ways a reservation gets
// created (book.html, Lana/Visito, or a staff member in Rooms).
//
// Deliberately mirrors stripe-webhook.js's copy/vars/gating exactly (same
// booking_engine_settings columns, same ESCAPE_WA_CONFIRM_ENABLED gate, same
// Visito template) so there's only one confirmation message guests ever see,
// regardless of which path created their reservation.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const VISITO_API = 'https://platform-api.visitoai.com/m2m/v1';
const GUEST_BOOK_URL = 'https://amansalaportal.com/guest-book.html';
const WHATSAPP_CONTACT_URL = 'https://wa.me/529848795999';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + 'th';
  switch (n % 10) { case 1: return n + 'st'; case 2: return n + 'nd'; case 3: return n + 'rd'; default: return n + 'th'; }
}
function fmtDateRange(checkInStr, checkOutStr) {
  const a = new Date(checkInStr + 'T00:00:00');
  const b = new Date(checkOutStr + 'T00:00:00');
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const fromPart = `${MONTH_NAMES[a.getMonth()]} ${a.getDate()}`;
  const toPart = sameMonth ? ordinal(b.getDate()) : `${MONTH_NAMES[b.getMonth()]} ${ordinal(b.getDate())}`;
  return `from ${fromPart} to ${toPart}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { firstName, lastName, email, phone, checkIn, checkOut, roomType, bookingId } = body;
  if (!checkIn || !checkOut) return jsonErr(400, 'Missing checkIn/checkOut');
  if (!email && !phone) return jsonErr(400, 'Need an email or phone to send to');

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  const vars = {
    firstName: firstName || '',
    lastName:  lastName  || '',
    roomType:  roomType  || '',
    checkIn, checkOut,
    dateRange: fmtDateRange(checkIn, checkOut),
    nights:    String(Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000))),
    amount:    '',
    email:     email || '',
    phone:     phone || '',
    guestBookUrl: GUEST_BOOK_URL,
    whatsappUrl:  WHATSAPP_CONTACT_URL,
  };
  const applyVars = (tpl, v) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => v[k] ?? '');

  const results = { email: null, whatsapp: null };

  // ── Email (Resend) — reuses the same email_guest_* slot Escape uses ──────
  const resendKey = process.env.RESEND_API_KEY;
  if (email && resendKey && supaKey) {
    try {
      const settRes = await fetch(
        `${SUPABASE_URL}/rest/v1/booking_engine_settings?id=eq.1&select=email_guest_enabled,email_guest_subject,email_guest_body`,
        { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } }
      );
      const [sett] = settRes.ok ? await settRes.json() : [{}];
      if (sett?.email_guest_enabled !== false) {
        const defaultSubject = `Your Amansala reservation – ${vars.roomType}`;
        const defaultBody = `<p>Hi ${vars.firstName},</p><p>Thank you for your booking. We are looking forward to hosting you ${vars.dateRange} in a ${vars.roomType} room.</p><p>Should you need anything prior to arrival we are here to assist you, and in the meantime please take a look at our <a href="${vars.guestBookUrl}">guest book</a> with helpful info.</p><hr><p><strong>Contact Us</strong><br><a href="${vars.whatsappUrl}">💬 Message us on WhatsApp</a><br>Questions? <a href="mailto:amansala.reservations@gmail.com">amansala.reservations@gmail.com</a></p>`;
        const subj = applyVars(sett?.email_guest_subject || defaultSubject, vars);
        const html = applyVars(sett?.email_guest_body    || defaultBody,    vars);
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'Amansala <retreats@amansala.com>', to: [email], subject: subj, html }),
        });
        results.email = r.ok ? 'sent' : `failed (${r.status})`;
        if (!r.ok) console.warn('[send-booking-confirmation] email failed:', await r.text());
      } else {
        results.email = 'disabled';
      }
    } catch (e) {
      results.email = 'error: ' + e.message;
      console.warn('[send-booking-confirmation] email error (non-fatal):', e.message);
    }
  }

  // ── WhatsApp (Visito) — same template/gate as stripe-webhook.js ──────────
  if (phone && process.env.ESCAPE_WA_CONFIRM_ENABLED === 'true') {
    const visitoKey = process.env.VISITO_M2M_KEY;
    const channelId = process.env.VISITO_WA_CHANNEL_ID;
    const templateName = process.env.VISITO_BOOKING_CONFIRM_TEMPLATE || 'booking_confirmation';
    const templateLang = process.env.VISITO_BOOKING_CONFIRM_TEMPLATE_LANG || 'en_US';
    if (visitoKey && channelId) {
      try {
        const waRes = await fetch(`${VISITO_API}/whatsapp-templates/${encodeURIComponent(channelId)}/send`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${visitoKey}`, 'Content-Type': 'application/json',
            'Idempotency-Key': `room-confirm-${bookingId || phone}`,
          },
          body: JSON.stringify({
            to: phone,
            template: {
              name: templateName,
              language: { code: templateLang },
              components: [{ type: 'body', parameters: [
                { type: 'text', text: vars.firstName || 'there' },
                { type: 'text', text: vars.dateRange },
                { type: 'text', text: vars.roomType },
                { type: 'text', text: vars.guestBookUrl },
              ] }],
            },
          }),
        });
        const waBody = await waRes.json().catch(() => ({}));
        results.whatsapp = (waRes.ok && waBody.accepted !== false) ? 'sent' : `failed (${waRes.status})`;
        if (results.whatsapp !== 'sent') console.warn('[send-booking-confirmation] WhatsApp failed:', waRes.status, JSON.stringify(waBody).slice(0, 300));
      } catch (e) {
        results.whatsapp = 'error: ' + e.message;
        console.warn('[send-booking-confirmation] WhatsApp error (non-fatal):', e.message);
      }
    } else {
      results.whatsapp = 'not configured';
    }
  } else if (phone) {
    results.whatsapp = 'disabled';
  }

  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, results }),
  };
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
