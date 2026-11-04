'use strict';

// send-booking-payment-request.js — called by Rooms (modules/venues.js rmSaveNewBooking) right after staff save a new
// reservation: asks the guest to pay first (booking-payment-lib.js requestPayment); the booking confirmation follows
// the first payment. POST {token, bookingId}; an admin can pass force:true to try it while the switch is still off
const { staffAllowed, cors, reply } = require('./portal-auth-lib');
const { requestPayment } = require('./booking-payment-lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid request' }); }
  const who = await staffAllowed({ headers: event.headers || {}, body: JSON.stringify({ token: b.token }) });
  if (!who) return reply(401, { error: 'Sign in again.' });
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key || !b.bookingId) return reply(400, { error: 'Missing booking' });
  try { return reply(200, await requestPayment(key, String(b.bookingId), { force: b.force === true && who.role === 'admin' })); }
  catch (e) { console.error('[send-booking-payment-request]', e); return reply(500, { error: 'Could not send' }); }
};
