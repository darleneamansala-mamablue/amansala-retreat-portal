'use strict';

// Short payment hold for offsite spa bookings made by Lana / Ask Jorge (Jorge 2026-11-09, after Melissa's question about Chris Pilaro
// and Conny Arellano): the appointment holds the slot as PAYMENT_PENDING for HOLD_MINUTES. Unpaid by then, the slot counts as free
// everywhere and spa-expire-holds.js cancels it. Paid (stripe-webhook, source 'visito_spa'), it becomes CONFIRMED / PAID -- and if the
// hold had already expired, it comes back only when that therapist and room are still free, else the payment is refunded.
// Therapists are told nothing about a hold until it is paid.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const STRIPE_API = 'https://api.stripe.com/v1';
const HOLD_MINUTES = 10;

const hhmmToMin = t => { const [h, m] = String(t || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const holdExpiresAt = (from = Date.now()) => new Date(from + HOLD_MINUTES * 60000).toISOString();
// A hold without holdExpiresAt (made before 2026-11-09) never expires on its own -- staff decide those.
const holdExpired = (a, now = Date.now()) => !!(a && a.status === 'PAYMENT_PENDING' && a.holdExpiresAt && Date.parse(a.holdExpiresAt) < now);
const isOpenHold = a => !!(a && a.status === 'PAYMENT_PENDING');
// The appointments that really take a slot right now: expired holds left out.
const liveAppts = (list, now = Date.now()) => (list || []).filter(a => a && !holdExpired(a, now));

const hdrs = key => ({ apikey: key, Authorization: `Bearer ${key}` });

// Compare-and-swap on spa_appointments (same as spa-public's mutateAppts): fn gets the current list and returns the new one, or null to
// write nothing.
async function mutateAppts(key, fn) {
  let lastErr = '';
  for (let i = 0; i < 12; i++) {
    const r0 = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_appointments&select=value,updated_at`, { headers: hdrs(key) });
    if (!r0.ok) { lastErr = 'read ' + r0.status; await new Promise(r => setTimeout(r, 400)); continue; }
    const [row] = await r0.json();
    if (!row) return { list: [] };
    const next = fn(Array.isArray(row.value) ? row.value.slice() : []);
    if (!next) return { list: row.value, unchanged: true };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_appointments&updated_at=eq.${encodeURIComponent(row.updated_at)}`, {
      method: 'PATCH', headers: { ...hdrs(key), 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ value: next, updated_at: new Date().toISOString() }),
    });
    if (r.ok && (await r.json()).length) return { list: next };
    lastErr = 'busy ' + r.status;
    await new Promise(res => setTimeout(res, 80 + Math.random() * 220));
  }
  throw new Error('Could not save spa_appointments: ' + lastErr);
}

// Cancels every expired hold. Returns the cancelled appointments.
async function expireHolds(key) {
  let cancelled = [];
  await mutateAppts(key, list => {
    const now = Date.now(), at = new Date().toISOString();
    cancelled = [];
    const next = list.map(a => {
      if (!holdExpired(a, now)) return a;
      const c = { ...a, status: 'CANCELLED', cancelledAt: at, cancelReason: 'unpaid_hold_expired', cancelledBy: 'Payment hold (10 min)' };
      cancelled.push(c);
      return c;
    });
    return cancelled.length ? next : null;
  });
  return cancelled;
}

// Is the slot of appointment `a` free of every other live appointment (same therapist, or same room)?
function slotFree(list, a) {
  const s = hhmmToMin(a.start), e = s + (a.duration || 60);
  return !liveAppts(list).some(x => x.id !== a.id && x.date === a.date && x.status !== 'CANCELLED' && x.status !== 'NO_SHOW'
    && (x.therapistId === a.therapistId || (a.roomId && x.roomId === a.roomId))
    && s < hhmmToMin(x.start) + (x.duration || 60) && e > hhmmToMin(x.start));
}

async function stripeRefund(piId) {
  try {
    const r = await fetch(`${STRIPE_API}/refunds`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
      body: new URLSearchParams({ payment_intent: piId, reason: 'requested_by_customer' }).toString(),
    });
    const d = await r.json(); return d.error ? null : d.id;
  } catch (e) { return null; }
}

// A paid Lana / Ask Jorge spa link (stripe-webhook, metadata source 'visito_spa'). Returns { result, appt }:
// 'confirmed' | 'restored' (paid after the hold ran out, slot still free) | 'refunded' (slot taken) | 'already' | 'missing'.
async function markPaid(key, pi) {
  const apptId = (pi.metadata || {}).apptId;
  let result = 'missing', appt = null;
  await mutateAppts(key, list => {
    const i = list.findIndex(a => a && a.id === apptId);
    if (i < 0) { result = 'missing'; return null; }
    const a = list[i];
    if (a.paymentStatus === 'PAID' || a.paymentIntentId === pi.id) { result = 'already'; appt = a; return null; }
    const paid = { ...a, paymentStatus: 'PAID', paymentIntentId: pi.id, paidAt: new Date().toISOString(), holdExpiresAt: null };
    if (a.status === 'PAYMENT_PENDING' && !holdExpired(a)) { result = 'confirmed'; appt = { ...paid, status: 'CONFIRMED' }; }
    else if ((a.status === 'PAYMENT_PENDING' || (a.status === 'CANCELLED' && a.cancelReason === 'unpaid_hold_expired')) && slotFree(list, a)) {
      result = 'restored'; appt = { ...paid, status: 'CONFIRMED', cancelledAt: null, cancelReason: null, cancelledBy: null, restoredAfterLatePayment: true };
    } else if (a.status === 'PAYMENT_PENDING' || a.cancelReason === 'unpaid_hold_expired') {
      result = 'refunded'; appt = { ...a, status: 'CANCELLED', cancelledAt: a.cancelledAt || new Date().toISOString(), cancelReason: 'unpaid_hold_expired', paymentIntentId: pi.id, paymentStatus: 'REFUNDED', latePaymentAt: new Date().toISOString() };
    } else { result = 'already'; appt = a; return null; }   // staff already changed it by hand (e.g. confirmed or cancelled it): leave it
    list[i] = appt;
    return list;
  });
  if (result === 'refunded') {
    const refundId = await stripeRefund(pi.id);
    if (refundId) await mutateAppts(key, list => { const i = list.findIndex(a => a && a.id === apptId); if (i < 0) return null; list[i] = { ...list[i], refundId }; return list; });
    else { console.error('[spa-hold] late payment refund FAILED for', pi.id, apptId); result = 'refund_failed'; }
  }
  return { result, appt };
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtT = t => { const m = hhmmToMin(t), h = Math.floor(m / 60); return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const shell = (title, body) => `<div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f0ea;padding:28px 0"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden"><div style="background:#2d6a6a;padding:24px 32px;text-align:center;color:#fff;font-size:20px">${title}</div><div style="padding:28px 32px;font-size:14.5px;color:#374151;line-height:1.6">${body}</div></div></div>`;

// stripe-webhook entry point: mark the appointment paid, then tell whoever needs to know.
async function onPaid(key, pi) {
  const { sendMail } = require('./mail-lib');
  const { result, appt } = await markPaid(key, pi);
  console.log('[spa-hold] visito_spa payment', pi.id, (pi.metadata || {}).apptId, result);
  const r0 = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_data&select=value`, { headers: hdrs(key) });
  const spa = ((r0.ok ? await r0.json() : [])[0] || {}).value || {};
  const a = appt || {}, svc = (spa.services || []).find(s => s.id === a.serviceId) || {}, ther = (spa.therapists || []).find(t => t.id === a.therapistId) || {};
  const therName = `${ther.firstName || ''} ${ther.lastName || ''}`.trim();
  const line = `${esc(a.clientName || (pi.metadata || {}).clientName || 'Guest')} · ${esc(svc.name || (pi.metadata || {}).serviceName || 'Spa')} · ${esc(a.date || '')} ${a.start ? fmtT(a.start) : ''}`;
  try {
    if (result === 'confirmed' || result === 'restored') {
      try { await fetch(`${process.env.URL || 'https://amansalaportal.com'}/.netlify/functions/spa-alerts-now-background`, { method: 'POST' }); } catch (e) {}
      if (a.email) await sendMail({ to: a.email, subject: 'Spa Appointment Confirmed — Amansala', html: shell('Your Spa Appointment is Confirmed', `<p>Hi ${esc(String(a.clientName || '').split(' ')[0])}, we received your payment — you're booked!</p><p><b>${esc(svc.name || '')}</b><br>${esc(a.date)} at ${fmtT(a.start)}${therName ? `<br>Therapist: ${esc(therName)}` : ''}</p><p style="font-size:12.5px;color:#6b7280">Appointments may be cancelled free of charge up to 12 hours before the start time.</p>`) });
      if (ther.email) await sendMail({ to: ther.email, subject: 'New Appointment — Amansala Spa', html: shell('New Appointment Booked', `<p>Hi ${esc(ther.firstName)}, a new appointment was just booked with you:</p><p>${line}</p><p style="font-size:13px;color:#6b7280">It's on your schedule.</p>`) });
    } else if (result !== 'already') {
      const why = result === 'refunded' ? 'The guest paid after the 10-minute hold ran out and the slot was already taken, so the payment was <b>refunded automatically</b>.'
        : result === 'refund_failed' ? 'The guest paid after the 10-minute hold ran out and the slot was already taken. The automatic refund <b>FAILED</b> — please refund it in Stripe or rebook the guest.'
        : 'A spa payment arrived for an appointment that no longer exists in the portal. Please find the guest a slot or refund it in Stripe.';
      await sendMail({ to: 'retreats@amansala.com', subject: `Spa payment needs a look — ${a.clientName || (pi.metadata || {}).clientName || ''}`, html: shell('Spa payment after the hold', `<p>${why}</p><p>${line}</p><p>Stripe ${esc(pi.id)} · $${(pi.amount / 100).toFixed(2)} USD</p>`) });
      if (result === 'refunded' && a.email) await sendMail({ to: a.email, subject: 'Your spa payment was refunded — Amansala', html: shell('Payment Refunded', `<p>Hi ${esc(String(a.clientName || '').split(' ')[0])}, the time you chose (${esc(a.date)} at ${fmtT(a.start)}) was held for 10 minutes and was taken before your payment arrived, so we refunded it in full. Message us on WhatsApp and we'll find you another time.</p>`) });
    }
  } catch (e) { console.warn('[spa-hold] notice failed:', e.message); }
  return result;
}

module.exports = { HOLD_MINUTES, holdExpiresAt, holdExpired, isOpenHold, liveAppts, expireHolds, markPaid, onPaid, mutateAppts };
