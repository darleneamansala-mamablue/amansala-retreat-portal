'use strict';
const crypto = require('crypto');

// Adapted from Jorge's version onto our app_store blob pattern (see get-availability.js).
// Fulfillment target is a new app_store key `beBookingRequests` (Jorge's version used
// a real `booking_requests` table) — read-modify-write the whole array, same pattern
// used throughout this app for list-shaped data.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

async function readAppStore(key, hdrs) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.${encodeURIComponent(key)}&select=value`, { headers: hdrs });
  if (!res.ok) throw new Error(`${key} fetch failed`);
  const rows = await res.json();
  return rows[0]?.value ?? null;
}
async function writeAppStore(key, value, hdrs) {
  await fetch(`${SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, {
    method: 'POST',
    headers: { ...hdrs, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set');
    return { statusCode: 500, body: 'Webhook secret not configured' };
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  let stripeEvent;
  try {
    stripeEvent = verifyStripeSignature(rawBody, sig, secret);
  } catch (err) {
    console.error('[stripe-webhook] Signature error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'payment_intent.succeeded') {
    const pi = stripeEvent.data.object;
    const meta = pi.metadata ?? {};

    if (!meta.email || !meta.checkIn || !meta.checkOut) {
      console.warn('[stripe-webhook] Missing metadata on PI:', pi.id);
      return { statusCode: 200, body: JSON.stringify({ received: true }) };
    }

    const supaKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supaKey) {
      console.error('[stripe-webhook] SUPABASE_SERVICE_KEY not set');
      return { statusCode: 200, body: JSON.stringify({ received: true }) };
    }
    const hdrs = { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}`, 'Content-Type': 'application/json' };

    const record = {
      id: 'bebk_' + pi.id,
      roomTypeId: meta.roomTypeId || null,
      roomTypeName: meta.roomTypeName || null,
      checkIn: meta.checkIn,
      checkOut: meta.checkOut,
      adults: parseInt(meta.adults) || 1,
      firstName: meta.firstName || '',
      lastName: meta.lastName || '',
      email: meta.email,
      phone: meta.phone || null,
      dietary: meta.dietary || null,
      notes: meta.notes || null,
      status: 'paid',
      paymentIntentId: pi.id,
      amountPaid: pi.amount / 100,
      discountCode: meta.discountCode || null,
      discountAmount: parseFloat(meta.discountAmount) || null,
      source: meta.source || null,
      room: null,
      createdAt: new Date().toISOString(),
    };

    let bookingRequests = [];
    try {
      bookingRequests = (await readAppStore('beBookingRequests', hdrs)) ?? [];
      if (bookingRequests.some(b => b.paymentIntentId === pi.id)) {
        // Stripe retried this event — already recorded, don't duplicate.
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
      }
    } catch (err) {
      console.error('[stripe-webhook] Load booking requests failed:', err.message);
    }

    // Auto-assign a physical room
    if (record.roomTypeId) {
      try {
        const roomTypes = (await readAppStore('roomTypes', hdrs)) ?? [];
        const rt = roomTypes.find(r => r.id === record.roomTypeId);
        const physicalRooms = rt?.rooms ?? [];

        if (physicalRooms.length) {
          const occupied = new Set();
          // Rooms held by overlapping paid Extra Nights bookings
          bookingRequests
            .filter(b => b.room && b.status !== 'declined' && b.status !== 'cancelled' &&
                         b.checkIn < record.checkOut && b.checkOut > record.checkIn)
            .forEach(b => occupied.add(b.room));
          // Rooms held by overlapping group/retreat bookings
          const bookings = (await readAppStore('bookings', hdrs)) ?? [];
          bookings
            .filter(bk => bk.status !== 'cancelled' && bk.startDate < record.checkOut && bk.endDate > record.checkIn)
            .forEach(bk => (bk.blockedRooms ?? []).forEach(r => occupied.add(r)));

          const assignedRoom = physicalRooms.find(r => !occupied.has(r)) ?? null;
          if (assignedRoom) {
            record.room = assignedRoom;
            console.log('[stripe-webhook] Auto-assigned room:', assignedRoom, 'to booking', record.id);
          } else {
            console.warn('[stripe-webhook] No available room found for type', record.roomTypeId, 'on', record.checkIn, '–', record.checkOut);
          }
        }
      } catch (roomErr) {
        console.error('[stripe-webhook] Room assignment error (non-fatal):', roomErr.message);
      }
    }

    try {
      bookingRequests.push(record);
      await writeAppStore('beBookingRequests', bookingRequests, hdrs);
      console.log('[stripe-webhook] Booking saved — PI:', pi.id, 'Email:', meta.email, 'id:', record.id);
    } catch (err) {
      console.error('[stripe-webhook] Save failed:', err.message);
    }

    // Send confirmation emails via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const sett = (await readAppStore('bookingEngineSettings', hdrs)) ?? {};

        const nights = Math.max(1, Math.round((new Date(meta.checkOut) - new Date(meta.checkIn)) / 86400000));
        const amount = `$${(pi.amount / 100).toFixed(2)} USD`;
        const vars = {
          firstName: meta.firstName || '',
          lastName: meta.lastName || '',
          roomType: meta.roomTypeName || '',
          checkIn: meta.checkIn || '',
          checkOut: meta.checkOut || '',
          nights: String(nights),
          amount,
          email: meta.email || '',
          phone: meta.phone || '',
        };
        const applyVars = (tpl, v) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => v[k] ?? '');

        const defaultGuestSubject = `Your Amansala reservation – ${vars.roomType}`;
        const defaultGuestBody = `<p>Hi ${vars.firstName},</p><p>Your reservation at <strong>Amansala Tulum</strong> is confirmed!</p><p><strong>Room type:</strong> ${vars.roomType}<br><strong>Check-in:</strong> ${vars.checkIn}<br><strong>Check-out:</strong> ${vars.checkOut}<br><strong>Nights:</strong> ${vars.nights}<br><strong>Amount paid:</strong> ${vars.amount}</p><p>Questions? <a href="mailto:amansala.reservations@gmail.com">amansala.reservations@gmail.com</a></p>`;
        const defaultStaffSubject = `New booking: ${vars.firstName} ${vars.lastName} – ${vars.roomType}`;
        const defaultStaffBody = `<p><strong>New booking received!</strong></p><p><strong>Guest:</strong> ${vars.firstName} ${vars.lastName}<br><strong>Email:</strong> ${vars.email}<br><strong>Phone:</strong> ${vars.phone}<br><strong>Room type:</strong> ${vars.roomType}<br><strong>Check-in:</strong> ${vars.checkIn}<br><strong>Check-out:</strong> ${vars.checkOut}<br><strong>Nights:</strong> ${vars.nights}<br><strong>Amount paid:</strong> ${vars.amount}</p>`;

        const sendResend = (to, subject, html) => fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'Amansala <retreats@amansala.com>', to: [to], subject, html }),
        });

        if (sett?.email_guest_enabled !== false) {
          const subj = applyVars(sett?.email_guest_subject || defaultGuestSubject, vars);
          const html = applyVars(sett?.email_guest_body || defaultGuestBody, vars);
          const gr = await sendResend(meta.email, subj, html);
          if (!gr.ok) console.warn('[stripe-webhook] Guest email failed:', await gr.text());
          else console.log('[stripe-webhook] Guest email sent to', meta.email);
        }

        if (sett?.email_staff_enabled !== false) {
          const staffTo = sett?.email_staff_to || 'amansala.reservations@gmail.com';
          const subj = applyVars(sett?.email_staff_subject || defaultStaffSubject, vars);
          const html = applyVars(sett?.email_staff_body || defaultStaffBody, vars);
          const sr = await sendResend(staffTo, subj, html);
          if (!sr.ok) console.warn('[stripe-webhook] Staff email failed:', await sr.text());
          else console.log('[stripe-webhook] Staff notification sent to', staffTo);
        }
      } catch (emailErr) {
        console.error('[stripe-webhook] Email error (non-fatal):', emailErr.message);
      }
    }

    // Optional Cloudbeds sync — no-ops safely today since /.netlify/functions/cloudbeds
    // isn't deployed on this site yet; left wired up for when it is.
    if (record.roomTypeName) {
      try {
        const siteUrl = process.env.URL || 'https://amansala-portal.netlify.app';
        const cbRes = await fetch(`${siteUrl}/.netlify/functions/cloudbeds?action=createReservationByType`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomTypeName: meta.roomTypeName,
            startDate: meta.checkIn,
            endDate: meta.checkOut,
            guestFullName: `${meta.firstName || ''} ${meta.lastName || ''}`.trim(),
            guestEmail: meta.email,
            guestPhone: meta.phone || null,
            adults: parseInt(meta.adults) || 1,
            dailyRate: 0,
          }),
        });
        const cbData = await cbRes.json().catch(() => null);
        const cbReservationId = cbData?.reservationId ?? cbData?.reservation_id ?? null;
        if (cbReservationId) {
          console.log('[stripe-webhook] CB reservation created:', cbReservationId);
          record.cbReservationId = cbReservationId;
          const idx = bookingRequests.findIndex(b => b.id === record.id);
          if (idx !== -1) bookingRequests[idx] = record;
          await writeAppStore('beBookingRequests', bookingRequests, hdrs);
        }
      } catch (cbErr) {
        console.error('[stripe-webhook] CB create error (non-fatal):', cbErr.message);
      }
    }

    // Increment discount code usage count
    if (meta.discountCode) {
      try {
        const codes = (await readAppStore('beDiscountCodes', hdrs)) ?? [];
        const idx = codes.findIndex(c => (c.code || '').toUpperCase().trim() === meta.discountCode.toUpperCase().trim());
        if (idx !== -1) {
          codes[idx].usedCount = (codes[idx].usedCount ?? 0) + 1;
          await writeAppStore('beDiscountCodes', codes, hdrs);
        }
      } catch (dcErr) {
        console.error('[stripe-webhook] discount increment error (non-fatal):', dcErr.message);
      }
    }
  }

  // Always return 200 so Stripe stops retrying
  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

// Verifies Stripe-Signature header using crypto (no SDK needed)
function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader) throw new Error('Missing stripe-signature header');

  const parts = sigHeader.split(',').reduce((acc, part) => {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) return acc;
    const k = part.slice(0, eqIdx);
    const v = part.slice(eqIdx + 1);
    if (k === 't') acc.timestamp = v;
    if (k === 'v1') acc.signatures.push(v);
    return acc;
  }, { timestamp: null, signatures: [] });

  if (!parts.timestamp) throw new Error('No timestamp in signature');
  if (!parts.signatures.length) throw new Error('No v1 signatures found');

  const ts = parseInt(parts.timestamp, 10);
  if (isNaN(ts)) throw new Error('Invalid timestamp');
  if (Math.abs(Date.now() / 1000 - ts) > 300) throw new Error('Timestamp too old');

  const signedPayload = `${parts.timestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  const valid = parts.signatures.some(sig => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expectedBuf);
    } catch { return false; }
  });

  if (!valid) throw new Error('Signature mismatch');

  return JSON.parse(payload);
}
