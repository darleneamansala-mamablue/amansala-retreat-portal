'use strict';

// refund-folio-payment.js — refunds a card payment on a folio, in full or in part (Jorge 2026-11-04). Booking Detail
// shows "↩ Refund" on every Stripe payment line (its description carries the PaymentIntent id, "pi_..."); only Jorge,
// Hilario and Melissa may use it. Stripe is the truth for how much is still refundable. The refund goes on the same folio
// as a positive Payment line ("Refund — Credit Card (Stripe) (re_...)"), so the balance goes back up by that amount
// (remove or adjust the charge too when the refund is for a cancelled service). The guest gets an email and, once Meta
// approves the template, a WhatsApp (booking_refund_issued).
// POST {token, folioItemId, amount, reason}
const { staffFromEvent, cors, reply } = require('./portal-auth-lib');
const { sendMail } = require('./mail-lib');
const { contactHtml, esc } = require('./message-format');
const { dateRange } = require('./booking-payment-lib');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const STRIPE_API = 'https://api.stripe.com/v1';
const REFUNDERS = ['jorge', 'hilario', 'melissa'];
const money = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  const who = staffFromEvent(event, { names: REFUNDERS });
  if (!who) return reply(403, { error: 'Only Jorge, Hilario and Melissa can refund payments.' });
  const key = process.env.SUPABASE_SERVICE_KEY, stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!key || !stripeKey) return reply(500, { error: 'Server config error' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid request' }); }
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!(amount > 0)) return reply(400, { error: 'Enter the amount to refund.' });
  const reason = String(b.reason || '').trim().slice(0, 200);
  const H = { apikey: key, Authorization: `Bearer ${key}` };
  const S = { Authorization: `Bearer ${stripeKey}`, 'Stripe-Version': '2024-06-20' };
  const get = async p => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H }); return r.ok ? r.json() : []; };

  try {
    const [item] = await get(`folio_items?id=eq.${encodeURIComponent(String(b.folioItemId || ''))}&select=id,folio_id,description,unit_price,category`);
    if (!item || !(Number(item.unit_price) < 0)) return reply(400, { error: 'That line is not a payment.' });
    const piId = (String(item.description || '').match(/\bpi_[A-Za-z0-9]+/) || [])[0];
    if (!piId) return reply(400, { error: 'This payment was not made by card through Stripe, so it cannot be refunded here. Record the refund by hand.' });

    // how much of that card payment is still refundable (Stripe counts refunds made anywhere: here, the dashboard...)
    const pr = await fetch(`${STRIPE_API}/payment_intents/${encodeURIComponent(piId)}?expand[]=latest_charge`, { headers: S });
    const pi = await pr.json();
    if (!pr.ok || !pi.id || pi.status !== 'succeeded') return reply(400, { error: 'Stripe does not show this payment as completed.' });
    const ch = pi.latest_charge || {};
    const left = Math.max(0, (Number(ch.amount) || Number(pi.amount_received) || 0) - (Number(ch.amount_refunded) || 0)) / 100;
    if (amount > left + 0.001) return reply(400, { error: left > 0 ? `Only ${money(left)} of this payment can still be refunded.` : 'This payment is already fully refunded.' });

    const form = new URLSearchParams({ payment_intent: piId, amount: String(Math.round(amount * 100)), 'metadata[folio_item_id]': item.id, 'metadata[by]': String(who.name || ''), 'metadata[reason]': reason });
    const rr = await fetch(`${STRIPE_API}/refunds`, {
      method: 'POST', headers: { ...S, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `folio-refund-${item.id}-${Math.round(amount * 100)}-${String(b.requestId || '').slice(0, 40)}` },
      body: form.toString(),
    });
    const refund = await rr.json();
    if (!rr.ok || !refund.id) return reply(400, { error: (refund.error && refund.error.message) || 'Stripe did not accept the refund.' });

    // on the folio: a positive Payment line, so the payments total drops by what went back to the card
    const desc = `Refund — Credit Card (Stripe) (${refund.id}) of ${piId}${reason ? ' · ' + reason : ''}`;
    const ir = await fetch(`${SUPABASE_URL}/rest/v1/folio_items`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ folio_id: item.folio_id, description: desc, qty: 1, unit_price: amount, tax_rate: 0, category: 'Payment', staff_name: who.name || null }),
    });
    const saved = ir.ok ? await ir.json() : [];
    if (!saved[0]) console.error('[refund-folio-payment] refund done in Stripe but folio line not saved:', refund.id, item.folio_id);

    const notified = await notifyGuest(get, item.folio_id, amount).catch(e => { console.warn('[refund-folio-payment] notify failed:', e.message); return {}; });
    return reply(200, { ok: true, refundId: refund.id, amount, stillRefundable: Math.round((left - amount) * 100) / 100, folioLineSaved: !!saved[0], ...notified });
  } catch (e) {
    console.error('[refund-folio-payment]', e);
    return reply(500, { error: 'Something went wrong — check Stripe before trying again.' });
  }
};

// the guest of that folio: a retreat / Room Only registration (the guest named on the folio) or a Booking Engine request
async function guestOf(get, folioId) {
  const [f] = await get(`folios?id=eq.${encodeURIComponent(folioId)}&select=guest_name,registration_id,booking_request_id`);
  if (!f) return null;
  if (f.registration_id) {
    const [r] = await get(`registrations?id=eq.${encodeURIComponent(f.registration_id)}&select=guests,booking_id,check_in,check_out`);
    if (!r) return null;
    const [bk] = await get(`bookings?id=eq.${encodeURIComponent(r.booking_id)}&select=start_date,end_date,leader_email,leader_phone`);
    const gs = (r.guests || []).filter(g => g && g.name);
    const g = gs.find(x => String(x.name).trim().toLowerCase() === String(f.guest_name || '').trim().toLowerCase()) || gs[0] || {};
    return { name: g.name || f.guest_name, email: g.email || (bk && bk.leader_email), phone: g.phone || (bk && bk.leader_phone), start: r.check_in || (bk && bk.start_date), end: r.check_out || (bk && bk.end_date) };
  }
  if (f.booking_request_id) {
    const [q] = await get(`booking_requests?id=eq.${encodeURIComponent(f.booking_request_id)}&select=first_name,last_name,email,phone,check_in,check_out`);
    return q ? { name: [q.first_name, q.last_name].filter(Boolean).join(' '), email: q.email, phone: q.phone, start: q.check_in, end: q.check_out } : null;
  }
  return null;
}

async function notifyGuest(get, folioId, amount) {
  const g = await guestOf(get, folioId);
  if (!g) return { email: 'no guest', whatsapp: 'no guest' };
  const first = String(g.name || '').split(' ')[0] || 'there';
  const stay = g.start && g.end ? dateRange(g.start, g.end) : 'at Amansala';
  const out = {};
  out.email = g.email ? (await sendMail({ to: g.email, replyTo: 'amansala.reservations@gmail.com', subject: 'Your refund from Amansala',
    html: `<p>Hi ${esc(first)},</p>
<p>We have issued a refund of <strong>${money(amount)}</strong> to the card you paid with for your reservation <strong>${esc(stay)}</strong>.</p>
<p>Depending on your bank, it can take 5 to 10 business days to appear on your statement.</p>
${contactHtml()}` }) ? 'sent' : 'failed') : 'no email';
  const to = String(g.phone || '').replace(/\D/g, ''), visitoKey = process.env.VISITO_M2M_KEY, channelId = process.env.VISITO_WA_CHANNEL_ID;
  if (to.length >= 11 && visitoKey && channelId) {
    const r = await fetch(`https://platform-api.visitoai.com/m2m/v1/whatsapp-templates/${encodeURIComponent(channelId)}/send`, {
      method: 'POST', headers: { Authorization: `Bearer ${visitoKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `refund-${folioId}-${Math.round(amount * 100)}-${Date.now()}` },   // Visito refuses a send without it
      body: JSON.stringify({ to, template: { name: 'booking_refund_issued', language: { code: 'en_US' }, components: [{ type: 'body', parameters: [first, money(amount), stay].map(t => ({ type: 'text', text: t })) }] } }),
    });
    const body = await r.json().catch(() => ({}));
    out.whatsapp = r.ok && body.accepted !== false ? 'sent' : 'failed';
    if (out.whatsapp !== 'sent') console.warn('[refund-folio-payment] WhatsApp failed:', r.status, JSON.stringify(body).slice(0, 200));
  } else out.whatsapp = to ? 'phone without country code' : 'no phone';
  return out;
}
