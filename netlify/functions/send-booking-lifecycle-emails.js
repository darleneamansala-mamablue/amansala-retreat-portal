'use strict';

// Runs once daily via pg_cron (Jorge's ask 2026-09-22: editable reminder/
// in-hotel/checkout-day emails for Room Only bookings, same {{variable}}
// template system as the existing Confirmation/Staff emails in
// Booking Engine → Emails). Templates live in booking_engine_settings;
// each booking_requests row gets a *_email_sent_at timestamp so a booking
// is never emailed twice even if this runs more than once on the same day.
//
//   Reminder   → check_in is 3 days from today
//   In Hotel   → check_in was yesterday ("how's your stay so far?")
//   Check-out  → check_out is today
//
// Only status='paid' bookings are eligible — a pending/declined request
// never actually happened for the guest.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const TZ_OFFSET_MIN = -5 * 60; // Cancun/Tulum UTC-5, no DST

const REMINDER_DAYS_BEFORE = 3;

function tulumDateStr(daysFromNow) {
  const now = new Date(Date.now() + TZ_OFFSET_MIN * 60000);
  now.setUTCDate(now.getUTCDate() + daysFromNow);
  return now.toISOString().slice(0, 10);
}

function applyVars(tpl, v) {
  return (tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => v[k] ?? '');
}

const DEFAULTS = {
  reminder: {
    subject: 'Your Amansala stay is coming up — {{checkIn}}',
    body: `<p>Hi {{firstName}},</p><p>Just a friendly reminder — your stay at <strong>Amansala Tulum</strong> is in ${REMINDER_DAYS_BEFORE} days!</p><p><strong>Room type:</strong> {{roomType}}<br><strong>Check-in:</strong> {{checkIn}}<br><strong>Check-out:</strong> {{checkOut}}</p><p>We can't wait to welcome you. Safe travels!</p>`,
  },
  inhotel: {
    subject: 'How is your stay so far?',
    body: `<p>Hi {{firstName}},</p><p>We hope you're settling in and enjoying your stay at <strong>Amansala Tulum</strong>! Is there anything you need, or anything we can do to make your stay even better?</p><p>Just reply to this email and we'll take care of it.</p>`,
  },
  checkout: {
    subject: 'Safe travels — thank you for staying with us',
    body: `<p>Hi {{firstName}},</p><p>Today is your check-out day — thank you so much for staying with us at <strong>Amansala Tulum</strong>! We hope you had a wonderful time.</p><p>Safe travels, and we hope to welcome you back soon.</p>`,
  },
};

async function supaFetch(key, path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(method !== 'GET' ? { Prefer: 'return=minimal' } : {}),
    },
  };
  if (body != null) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (!res.ok) throw new Error(`${path} ${method} failed: ${res.status} ${await res.text()}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return null; }
}

exports.handler = async (event) => {
  // Optional shared secret, same soft-auth pattern as send-backup.js — only
  // enforced once BE_LIFECYCLE_SECRET is actually configured in Netlify.
  const secret = process.env.BE_LIFECYCLE_SECRET;
  if (secret && (event.headers['x-cron-secret'] || '') !== secret) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!supaKey) return { statusCode: 500, body: JSON.stringify({ error: 'Server config error' }) };
  if (!resendKey) return { statusCode: 500, body: JSON.stringify({ error: 'RESEND_API_KEY not configured' }) };

  const sendResend = (to, subject, html) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Amansala <retreats@amansala.com>', to: [to], subject, html }),
  });

  const results = { reminder: 0, inhotel: 0, checkout: 0, errors: [] };

  try {
    const [settingsArr] = await Promise.all([supaFetch(supaKey, 'booking_engine_settings?id=eq.1&select=*')]);
    const s = settingsArr[0] || {};

    const jobs = [
      {
        key: 'reminder',
        enabled: s.email_reminder_enabled !== false,
        subject: s.email_reminder_subject || DEFAULTS.reminder.subject,
        body: s.email_reminder_body || DEFAULTS.reminder.body,
        dateField: 'check_in',
        targetDate: tulumDateStr(REMINDER_DAYS_BEFORE),
        sentField: 'reminder_email_sent_at',
      },
      {
        key: 'inhotel',
        enabled: s.email_inhotel_enabled !== false,
        subject: s.email_inhotel_subject || DEFAULTS.inhotel.subject,
        body: s.email_inhotel_body || DEFAULTS.inhotel.body,
        dateField: 'check_in',
        targetDate: tulumDateStr(-1),
        sentField: 'inhotel_email_sent_at',
      },
      {
        key: 'checkout',
        enabled: s.email_checkout_enabled !== false,
        subject: s.email_checkout_subject || DEFAULTS.checkout.subject,
        body: s.email_checkout_body || DEFAULTS.checkout.body,
        dateField: 'check_out',
        targetDate: tulumDateStr(0),
        sentField: 'checkout_email_sent_at',
      },
    ];

    for (const job of jobs) {
      if (!job.enabled) continue;
      const rows = await supaFetch(
        supaKey,
        `booking_requests?status=eq.paid&${job.dateField}=eq.${job.targetDate}&${job.sentField}=is.null`
          + '&select=id,first_name,last_name,email,room_type_name,check_in,check_out,adults,amount_paid'
      );
      for (const bk of rows || []) {
        if (!bk.email) continue;
        const nights = Math.max(1, Math.round((new Date(bk.check_out) - new Date(bk.check_in)) / 86400000));
        const vars = {
          firstName: bk.first_name || '',
          lastName: bk.last_name || '',
          roomType: bk.room_type_name || '',
          checkIn: bk.check_in || '',
          checkOut: bk.check_out || '',
          nights: String(nights),
          amount: bk.amount_paid != null ? `$${Number(bk.amount_paid).toFixed(2)} USD` : '',
          email: bk.email || '',
          phone: bk.phone || '',
        };
        try {
          const r = await sendResend(bk.email, applyVars(job.subject, vars), applyVars(job.body, vars));
          if (!r.ok) throw new Error(await r.text());
          await supaFetch(supaKey, `booking_requests?id=eq.${bk.id}`, 'PATCH', { [job.sentField]: new Date().toISOString() });
          results[job.key]++;
        } catch (e) {
          results.errors.push(`${job.key} → ${bk.id}: ${e.message}`);
        }
      }
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(results) };
  } catch (err) {
    console.error('[send-booking-lifecycle-emails]', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message, ...results }) };
  }
};
