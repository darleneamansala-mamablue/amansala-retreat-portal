'use strict';
const crypto = require('crypto');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig    = event.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set');
    return { statusCode: 500, body: 'Webhook secret not configured' };
  }

  // Netlify may base64-encode the body for binary requests
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
    const pi   = stripeEvent.data.object;
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

    const record = {
      room_type_id:      meta.roomTypeId  || null,
      room_type_name:    meta.roomTypeName || null,
      check_in:          meta.checkIn,
      check_out:         meta.checkOut,
      adults:            parseInt(meta.adults) || 1,
      first_name:        meta.firstName  || '',
      last_name:         meta.lastName   || '',
      email:             meta.email,
      phone:             meta.phone    || null,
      dietary:           meta.dietary  || null,
      notes:             meta.notes    || null,
      status:            'paid',
      payment_intent_id: pi.id,
      amount_paid:       pi.amount / 100,
      discount_code:     meta.discountCode   || null,
      discount_amount:   parseFloat(meta.discountAmount) || null,
      source:            meta.source         || null,
    };

    let insertedId = null;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/booking_requests`, {
        method:  'POST',
        headers: {
          'apikey':        supaKey,
          'Authorization': `Bearer ${supaKey}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=representation',
        },
        body: JSON.stringify(record),
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.error('[stripe-webhook] Supabase insert failed:', res.status, errBody);
      } else {
        const rows = await res.json();
        insertedId = rows[0]?.id ?? null;
        console.log('[stripe-webhook] Booking saved — PI:', pi.id, 'Email:', meta.email, 'id:', insertedId);
      }
    } catch (err) {
      console.error('[stripe-webhook] Fetch error:', err.message);
    }

    // Auto-assign physical room
    if (insertedId && meta.roomTypeId) {
      try {
        const hdrs = { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` };
        // Get physical rooms for this room type
        const rtRes = await fetch(
          `${SUPABASE_URL}/rest/v1/room_types?id=eq.${encodeURIComponent(meta.roomTypeId)}&select=rooms`,
          { headers: hdrs }
        );
        const [rt] = rtRes.ok ? await rtRes.json() : [{}];
        const physicalRooms = rt?.rooms ?? [];

        if (physicalRooms.length) {
          // Find rooms occupied for overlapping dates from booking_requests
          const brOcc = await fetch(
            `${SUPABASE_URL}/rest/v1/booking_requests?room=not.is.null&check_in=lt.${encodeURIComponent(meta.checkOut)}&check_out=gt.${encodeURIComponent(meta.checkIn)}&status=not.in.(declined,cancelled)&select=room`,
            { headers: hdrs }
          );
          const occupied = new Set((brOcc.ok ? await brOcc.json() : []).map(r => r.room));

          // Also check group bookings blocked_rooms
          const bkOcc = await fetch(
            `${SUPABASE_URL}/rest/v1/bookings?start_date=lt.${encodeURIComponent(meta.checkOut)}&end_date=gt.${encodeURIComponent(meta.checkIn)}&status=neq.cancelled&select=blocked_rooms`,
            { headers: hdrs }
          );
          (bkOcc.ok ? await bkOcc.json() : []).forEach(b => (b.blocked_rooms ?? []).forEach(r => occupied.add(r)));

          const assignedRoom = physicalRooms.find(r => !occupied.has(r)) ?? null;
          if (assignedRoom) {
            await fetch(`${SUPABASE_URL}/rest/v1/booking_requests?id=eq.${insertedId}`, {
              method:  'PATCH',
              headers: { ...hdrs, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
              body:    JSON.stringify({ room: assignedRoom }),
            });
            console.log('[stripe-webhook] Auto-assigned room:', assignedRoom, 'to booking', insertedId);
          } else {
            console.warn('[stripe-webhook] No available room found for type', meta.roomTypeId, 'on', meta.checkIn, '–', meta.checkOut);
          }
        }
      } catch (roomErr) {
        console.error('[stripe-webhook] Room assignment error (non-fatal):', roomErr.message);
      }
    }

    // Send confirmation emails via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (insertedId && resendKey) {
      try {
        const supaHdrs = { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` };
        const settRes  = await fetch(
          `${SUPABASE_URL}/rest/v1/booking_engine_settings?id=eq.1&select=email_guest_enabled,email_guest_subject,email_guest_body,email_staff_enabled,email_staff_to,email_staff_subject,email_staff_body`,
          { headers: supaHdrs }
        );
        const [sett] = settRes.ok ? await settRes.json() : [{}];

        const nights = Math.max(1, Math.round((new Date(meta.checkOut) - new Date(meta.checkIn)) / 86400000));
        const amount = `$${(pi.amount / 100).toFixed(2)} USD`;
        const vars   = {
          firstName: meta.firstName   || '',
          lastName:  meta.lastName    || '',
          roomType:  meta.roomTypeName || '',
          checkIn:   meta.checkIn     || '',
          checkOut:  meta.checkOut    || '',
          nights:    String(nights),
          amount,
          email:     meta.email       || '',
          phone:     meta.phone       || '',
        };
        const applyVars = (tpl, v) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => v[k] ?? '');

        const defaultGuestSubject = `Your Amansala reservation – ${vars.roomType}`;
        const defaultGuestBody    = `<p>Hi ${vars.firstName},</p><p>Your reservation at <strong>Amansala Tulum</strong> is confirmed!</p><p><strong>Room type:</strong> ${vars.roomType}<br><strong>Check-in:</strong> ${vars.checkIn}<br><strong>Check-out:</strong> ${vars.checkOut}<br><strong>Nights:</strong> ${vars.nights}<br><strong>Amount paid:</strong> ${vars.amount}</p><p>Questions? <a href="mailto:amansala.reservations@gmail.com">amansala.reservations@gmail.com</a></p>`;
        const defaultStaffSubject = `New booking: ${vars.firstName} ${vars.lastName} – ${vars.roomType}`;
        const defaultStaffBody    = `<p><strong>New booking received!</strong></p><p><strong>Guest:</strong> ${vars.firstName} ${vars.lastName}<br><strong>Email:</strong> ${vars.email}<br><strong>Phone:</strong> ${vars.phone}<br><strong>Room type:</strong> ${vars.roomType}<br><strong>Check-in:</strong> ${vars.checkIn}<br><strong>Check-out:</strong> ${vars.checkOut}<br><strong>Nights:</strong> ${vars.nights}<br><strong>Amount paid:</strong> ${vars.amount}</p>`;

        const sendResend = (to, subject, html) => fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ from: 'Amansala <retreats@amansala.com>', to: [to], subject, html }),
        });

        // Guest confirmation
        if (sett?.email_guest_enabled !== false) {
          const subj = applyVars(sett?.email_guest_subject || defaultGuestSubject, vars);
          const body = applyVars(sett?.email_guest_body    || defaultGuestBody,    vars);
          const gr   = await sendResend(meta.email, subj, body);
          if (!gr.ok) console.warn('[stripe-webhook] Guest email failed:', await gr.text());
          else        console.log('[stripe-webhook] Guest email sent to', meta.email);
        }

        // Staff notification
        if (sett?.email_staff_enabled !== false) {
          const staffTo = sett?.email_staff_to || 'amansala.reservations@gmail.com';
          const subj    = applyVars(sett?.email_staff_subject || defaultStaffSubject, vars);
          const body    = applyVars(sett?.email_staff_body    || defaultStaffBody,    vars);
          const sr      = await sendResend(staffTo, subj, body);
          if (!sr.ok) console.warn('[stripe-webhook] Staff email failed:', await sr.text());
          else        console.log('[stripe-webhook] Staff notification sent to', staffTo);
        }
      } catch (emailErr) {
        console.error('[stripe-webhook] Email error (non-fatal):', emailErr.message);
      }
    }

    // Create CB reservation after successful Supabase insert
    if (insertedId && meta.roomTypeName) {
      try {
        const siteUrl = process.env.URL || 'https://amansala-staging.netlify.app';
        const cbRes = await fetch(`${siteUrl}/.netlify/functions/cloudbeds?action=createReservationByType`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            roomTypeName: meta.roomTypeName,
            startDate:    meta.checkIn,
            endDate:      meta.checkOut,
            guestFullName: `${meta.firstName || ''} ${meta.lastName || ''}`.trim(),
            guestEmail:   meta.email,
            guestPhone:   meta.phone || null,
            adults:       parseInt(meta.adults) || 1,
            dailyRate:    0,
          }),
        });
        const cbData = await cbRes.json();
        const cbReservationId = cbData?.reservationId ?? cbData?.reservation_id ?? null;
        if (cbReservationId) {
          console.log('[stripe-webhook] CB reservation created:', cbReservationId);
          // Save CB reservation ID back to booking_requests
          await fetch(`${SUPABASE_URL}/rest/v1/booking_requests?id=eq.${insertedId}`, {
            method:  'PATCH',
            headers: {
              'apikey':        supaKey,
              'Authorization': `Bearer ${supaKey}`,
              'Content-Type':  'application/json',
              'Prefer':        'return=minimal',
            },
            body: JSON.stringify({ cb_reservation_id: cbReservationId }),
          });
          // Post Stripe payment note to CB reservation
          try {
            const noteLines = [
              `Paid via Stripe: $${(pi.amount / 100).toFixed(2)} USD`,
              `Payment Intent: ${pi.id}`,
              meta.discountCode ? `Discount code: ${meta.discountCode} (-$${parseFloat(meta.discountAmount || 0).toFixed(2)})` : null,
              `Source: ${meta.source || 'Escape'}`,
            ].filter(Boolean).join(' | ');
            await fetch(`${siteUrl}/.netlify/functions/cloudbeds?action=updateReservationNotes`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ reservationId: cbReservationId, notes: noteLines }),
            });
          } catch (noteErr) {
            console.warn('[stripe-webhook] CB note error (non-fatal):', noteErr.message);
          }
        } else {
          console.warn('[stripe-webhook] CB reservation not created:', JSON.stringify(cbData));
        }
      } catch (cbErr) {
        console.error('[stripe-webhook] CB create error (non-fatal):', cbErr.message);
      }
    }

    // Increment discount code usage count
    if (meta.discountCode) {
      try {
        const dcFetch = await fetch(
          `${SUPABASE_URL}/rest/v1/be_discount_codes?code=eq.${encodeURIComponent(meta.discountCode)}&select=id,used_count`,
          { headers: { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` } }
        );
        if (dcFetch.ok) {
          const dcRows = await dcFetch.json();
          const dc = dcRows[0];
          if (dc) {
            await fetch(`${SUPABASE_URL}/rest/v1/be_discount_codes?id=eq.${dc.id}`, {
              method: 'PATCH',
              headers: {
                'apikey':        supaKey,
                'Authorization': `Bearer ${supaKey}`,
                'Content-Type':  'application/json',
                'Prefer':        'return=minimal',
              },
              body: JSON.stringify({ used_count: (dc.used_count ?? 0) + 1 }),
            });
          }
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
    if (k === 't')  acc.timestamp   = v;
    if (k === 'v1') acc.signatures.push(v);
    return acc;
  }, { timestamp: null, signatures: [] });

  if (!parts.timestamp)          throw new Error('No timestamp in signature');
  if (!parts.signatures.length)  throw new Error('No v1 signatures found');

  const ts = parseInt(parts.timestamp, 10);
  if (isNaN(ts)) throw new Error('Invalid timestamp');
  if (Math.abs(Date.now() / 1000 - ts) > 300) throw new Error('Timestamp too old');

  const signedPayload = `${parts.timestamp}.${payload}`;
  const expected      = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  const expectedBuf   = Buffer.from(expected, 'hex');

  const valid = parts.signatures.some(sig => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expectedBuf);
    } catch { return false; }
  });

  if (!valid) throw new Error('Signature mismatch');

  return JSON.parse(payload);
}
