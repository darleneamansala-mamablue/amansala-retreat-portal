'use strict';

// spa-alerts-now-background.js — runs the spa WhatsApp alerts (spa-text-alerts.js) right after an appointment is saved, so the
// therapist and the spa front desk (Rubi, Kike, Rosi) hear about a last-minute booking within seconds (Jorge 2026-11-05).
// Background function: the caller gets 202 at once. Safe to call any time: each alert goes out once (sent list + Idempotency-Key).
const { run } = require('./spa-text-alerts');

exports.handler = async () => {
  try { await run(); } catch (e) { console.error('[spa-alerts-now]', e.message); }
  return { statusCode: 202, body: '' };
};
