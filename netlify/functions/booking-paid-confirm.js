'use strict';

// booking-paid-confirm.js — Booking Detail's Record Payment calls this after a payment is saved on a folio: the first
// payment on a reservation waiting for one sends its booking confirmation (booking-payment-lib.js confirmIfPaid).
// POST {token, folioId, amount} -- amount = the payment just recorded (a partial one gets its "payment received" message)
const { staffAllowed, cors, reply } = require('./portal-auth-lib');
const { confirmIfPaid } = require('./booking-payment-lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid request' }); }
  const who = await staffAllowed({ headers: event.headers || {}, body: JSON.stringify({ token: b.token }) });
  if (!who) return reply(401, { error: 'Sign in again.' });
  try { return reply(200, await confirmIfPaid(process.env.SUPABASE_SERVICE_KEY, { folioId: String(b.folioId || ''), paid: Number(b.amount) || 0 })); }
  catch (e) { console.error('[booking-paid-confirm]', e); return reply(500, { error: 'Could not check' }); }
};
