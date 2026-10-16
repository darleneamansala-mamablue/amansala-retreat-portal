'use strict';
// Daily job (see netlify.toml schedule): charges the remaining balance of every retreat booking that was paid 50% up front, on
// its balance date, to the card the guest saved at booking (off-session charge; the guest authorized this at checkout).
//   success -> the room's paid amount in the room list goes up, the guest and staff get an email
//   failure -> retried once 3 days later; after the second failure staff get an ACTION NEEDED email and the guest is asked to
//              contact us. Nothing is retried more than twice and a charge is never duplicated (Stripe idempotency key per try).
// Schedule items live in app_store 'retreat_balance_schedule'. Staff can cancel one in the Guest booking page screen.
const L = require('./rb-lib');

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return;
  try {
    await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Amansala <retreats@amansala.com>', to: Array.isArray(to) ? to : [to], subject, html, reply_to: 'retreats@amansala.com' }) });
  } catch (e) { console.warn('[rb-charge-balances] email failed', e.message); }
}
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

async function runDue({ today, dryRun } = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key || !process.env.STRIPE_SECRET_KEY) return { error: 'not configured' };
  today = today || new Date().toISOString().slice(0, 10);
  const list = (await L.appStoreGet(key, L.BAL_KEY)) || [];
  const due = list.filter((it) => (it.status === 'scheduled' && it.dueDate <= today) || (it.status === 'retry' && (it.nextTry || today) <= today));
  const summary = { due: due.length, charged: 0, failed: 0, retry: 0 };
  if (dryRun) return { ...summary, items: due.map((d) => ({ id: d.id, name: d.name, amount: d.amount, dueDate: d.dueDate })) };

  for (const it of due) {
    const amountCents = Math.round(Number(it.amount) * 100);
    let pi = null, err = '';
    try {
      if (!it.customerId || !it.paymentMethodId) throw new Error('No saved card for this booking');
      if (amountCents < 50) throw new Error('Amount too small');
      pi = await L.stripePost('/payment_intents', {
        amount: String(amountCents), currency: 'usd', customer: it.customerId, payment_method: it.paymentMethodId,
        off_session: 'true', confirm: 'true', receipt_email: it.email || '',
        description: `Amansala Tulum · ${String(it.retreat || 'Retreat').slice(0, 80)} · remaining balance`,
        'metadata[source]': 'retreat_balance', 'metadata[rbBalanceId]': it.id, 'metadata[rbBookingId]': it.bookingId,
      }, `rb_bal_${it.id}_${it.tries || 0}`);
      if (pi.error) throw new Error(pi.error.message || 'Card declined');
      if (pi.status !== 'succeeded') throw new Error(`Payment needs the cardholder's action (${pi.status})`);
    } catch (e) { err = e.message || String(e); }

    if (!err) {
      it.status = 'paid'; it.paidAt = new Date().toISOString(); it.chargeId = pi.id;
      for (const [unit, amt] of Object.entries(it.rowAmounts || {})) {
        try {
          const rows = await L.sget(key, `registrations?booking_id=eq.${encodeURIComponent(it.bookingId)}&room=eq.${encodeURIComponent(unit)}&select=id,amount_paid,notes`);
          if (rows[0]) await L.sreq(key, 'PATCH', `registrations?id=eq.${rows[0].id}`, { amount_paid: Math.round(((Number(rows[0].amount_paid) || 0) + Number(amt)) * 100) / 100, notes: (rows[0].notes || '') + ` — balance ${money(amt)} charged ${today}` }, 'return=minimal');
          await L.addRegPayment(key, it.bookingId, unit, amt, `Payment — Credit Card (Stripe) remaining balance (${pi.id})`);
        } catch (e) { console.warn('[rb-charge-balances] room list update failed', unit, e.message); }
      }
      summary.charged++;
      await sendEmail(it.email, `Your remaining balance was charged — ${it.retreat || 'your retreat'}`,
        `<div style="font-family:Arial,sans-serif;color:#1f2b27;max-width:540px"><h2 style="font-weight:400">Balance paid</h2><p>Hi ${esc((it.name || '').split(' ')[0])}, as you authorized when you booked, the remaining <b>${money(it.amount)}</b> for <b>${esc(it.retreat || 'your retreat')}</b> was charged to your card today. Your room is paid in full. Thank you!</p><p>Amansala · Tulum</p></div>`);
      await sendEmail('retreats@amansala.com', `Balance charged — ${it.name} · ${it.retreat || ''}`, `<p>${esc(it.name)} (${esc(it.email)}): ${money(it.amount)} charged. Room list updated (${esc((it.units || []).join(', '))}). Stripe ${esc(pi.id)}</p>`);
    } else {
      it.tries = (it.tries || 0) + 1; it.lastError = err.slice(0, 300); it.lastTryAt = new Date().toISOString();
      if (it.tries < 2) {
        it.status = 'retry'; it.nextTry = addDays(today, 3); summary.retry++;
        await sendEmail('retreats@amansala.com', `Balance charge failed (will retry ${it.nextTry}) — ${it.name}`, `<p>${esc(it.name)} (${esc(it.email)}, ${esc(it.phone)}): the ${money(it.amount)} balance for ${esc(it.retreat || '')} could not be charged: <b>${esc(err)}</b>. It will be retried on ${esc(it.nextTry)}.</p>`);
        await sendEmail(it.email, `We could not charge your remaining balance — ${it.retreat || 'your retreat'}`, `<div style="font-family:Arial,sans-serif;color:#1f2b27;max-width:540px"><p>Hi ${esc((it.name || '').split(' ')[0])}, we tried to charge the remaining ${money(it.amount)} for ${esc(it.retreat || 'your retreat')} to the card you used when you booked, but it was not accepted. We will try again on ${esc(it.nextTry)}. If your card has changed, please write to retreats@amansala.com.</p><p>Amansala · Tulum</p></div>`);
      } else {
        it.status = 'failed'; summary.failed++;
        await sendEmail('retreats@amansala.com', `ACTION NEEDED: balance could not be charged — ${it.name}`, `<p><b>${esc(it.name)}</b> (${esc(it.email)}, ${esc(it.phone)}): the ${money(it.amount)} balance for ${esc(it.retreat || '')} failed twice: <b>${esc(err)}</b>. Please contact the guest. Room(s): ${esc((it.units || []).join(', '))}.</p>`);
        await sendEmail(it.email, `Action needed: your remaining balance — ${it.retreat || 'your retreat'}`, `<div style="font-family:Arial,sans-serif;color:#1f2b27;max-width:540px"><p>Hi ${esc((it.name || '').split(' ')[0])}, we could not charge the remaining ${money(it.amount)} for ${esc(it.retreat || 'your retreat')} to your card. Please contact us at retreats@amansala.com so we can arrange payment and keep your room.</p><p>Amansala · Tulum</p></div>`);
      }
    }
  }
  if (due.length) await L.appStoreSet(key, L.BAL_KEY, list);
  return summary;
}

exports.handler = async () => {
  try { const r = await runDue(); console.log('[rb-charge-balances]', JSON.stringify(r)); return { statusCode: 200, body: JSON.stringify(r) }; }
  catch (e) { console.error('[rb-charge-balances]', e.message); return { statusCode: 500, body: e.message }; }
};
exports.runDue = runDue;
