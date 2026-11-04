'use strict';

// booking-payment-reminders.js — every morning at 10am Tulum (netlify.toml): reservations made in Rooms that are still
// waiting for payment get their daily reminder (email + WhatsApp) with what is left, until the 6-day due date; any
// paid in full meanwhile is confirmed (booking-payment-lib.js sendReminders).
const { sendReminders } = require('./booking-payment-lib');

exports.handler = async () => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return { statusCode: 500, body: 'SUPABASE_SERVICE_KEY missing' };
  const out = await sendReminders(key);
  console.log('[booking-payment-reminders]', JSON.stringify(out));
  return { statusCode: 200, body: JSON.stringify(out) };
};
