'use strict';
// The booking record: a PDF with the guest's booking summary, the cancellation policy as it was shown, and every box they ticked
// (with wording, time, IP address and browser). The link is signed (rb-lib.sign) so only the guest and staff, who get it by email
// and in the portal, can open it. It reads the saved consent record, so it is the same document months later; the balance status
// is looked up live.
const L = require('./rb-lib');
const { makePdf } = require('./rb-pdf');

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function tulum(iso) {
  try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Cancun', dateStyle: 'medium', timeStyle: 'short' }) + ' (Tulum time)'; } catch (e) { return iso; }
}
function fmtDay(d) { try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } catch (e) { return d; } }

exports.handler = async (event) => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const qs = event.queryStringParameters || {};
  const pi = qs.pi || '';
  if (!key || !pi || qs.k !== L.sign(pi)) return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Not found' };
  try {
    const rec = await L.appStoreGet(key, 'rbconsent:' + pi);
    if (!rec) return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Record not found' };
    const sched = ((await L.appStoreGet(key, L.BAL_KEY)) || []).find((x) => x.piId === pi);
    const g = rec.guest || {};
    const B = [];
    B.push({ t: 'h1', text: 'Amansala Tulum' });
    B.push({ t: 'h2', text: 'Booking record' });
    B.push({ t: 'small', text: `Reference ${pi.slice(-10).toUpperCase()}  |  created ${tulum(rec.createdAt)}` });
    B.push({ t: 'rule' });
    B.push({ t: 'h2', text: 'Retreat' });
    B.push({ t: 'kv', k: 'Retreat', v: rec.retreat });
    B.push({ t: 'kv', k: 'Dates', v: `${fmtDay(rec.startDate)} to ${fmtDay(rec.endDate)} (${rec.nights} nights)` });
    B.push({ t: 'space', h: 4 });
    B.push({ t: 'h2', text: 'Guest' });
    B.push({ t: 'kv', k: 'Name', v: g.name });
    B.push({ t: 'kv', k: 'Email', v: g.email });
    B.push({ t: 'kv', k: 'Phone', v: g.phone });
    (g.others || []).forEach((o, i) => B.push({ t: 'kv', k: (g.others.length > 1 ? 'Guest ' + (i + 2) : 'Other guest'), v: typeof o === 'string' ? o : `${o.name}  |  ${o.email}  |  ${o.phone}` }));
    if (rec.leader) B.push({ t: 'kv', k: 'Leader', v: 'Yes. Leaders are placed at Amansala Chica.' + (rec.placementNotice ? ' ' + rec.placementNotice + '.' : '') });
    B.push({ t: 'space', h: 4 });
    B.push({ t: 'h2', text: 'Booking summary' });
    (rec.lines || []).forEach((l) => {
      const d = l.type === 'service' ? `${l.name}, ${l.minutes === 60 ? '1 hour' : l.minutes + ' min'}${l.qty > 1 ? ' x ' + l.qty : ''}` : `${l.name}${l.guests > 1 ? ' (' + l.guests + ' guests)' : ''}, ${rec.nights} nights, taxes, fees and gratuity included`;
      B.push({ t: 'kv', k: l.type === 'service' ? 'Spa service' : 'Room', v: `${d}  -  ${money(l.amount)}` });
    });
    B.push({ t: 'kv', k: 'Total', v: money(rec.total) });
    B.push({ t: 'space', h: 4 });
    B.push({ t: 'h2', text: 'Payment' });
    if (rec.plan === 'deposit') {
      B.push({ t: 'kv', k: 'Plan', v: '50% of the room now; spa services paid in full now; remaining balance charged automatically to the same card.' });
      B.push({ t: 'kv', k: 'Paid at booking', v: money(rec.dueNow) });
      B.push({ t: 'kv', k: 'Remaining balance', v: `${money(rec.balance)} on ${fmtDay(rec.balanceDate)}` + (sched ? `  (status: ${sched.status}${sched.paidAt ? ', charged ' + tulum(sched.paidAt) : ''})` : '') });
    } else {
      B.push({ t: 'kv', k: 'Plan', v: 'Paid in full at booking.' });
      B.push({ t: 'kv', k: 'Paid at booking', v: money(rec.dueNow) });
    }
    B.push({ t: 'kv', k: 'Payment status', v: rec.status === 'paid' ? `Paid ${tulum(rec.paidAt)}` : 'Awaiting payment' });
    B.push({ t: 'kv', k: 'Payment id', v: pi });
    B.push({ t: 'rule' });
    if ((rec.included || []).length) {
      B.push({ t: 'h2', text: "What's included" });
      rec.included.forEach((i) => B.push({ t: 'p', text: '-  ' + i }));
      if (rec.notIncluded) B.push({ t: 'small', text: rec.notIncluded });
      B.push({ t: 'rule' });
    }
    B.push({ t: 'h2', text: 'Cancellation policy' });
    B.push({ t: 'small', text: 'As shown to the guest when booking:' });
    B.push({ t: 'p', text: rec.policy });
    B.push({ t: 'rule' });
    B.push({ t: 'h2', text: 'What the guest agreed to' });
    B.push({ t: 'small', text: 'Each box below was ticked by the guest before payment. The wording is exactly what the guest saw.' });
    (rec.agreements || []).forEach((a) => {
      B.push({ t: 'p', text: `[x]  ${a.text}`, bold: true });
      if (a.shownNotice) B.push({ t: 'small', text: `Shown with it: ${a.shownNotice}`, indent: 18 });
      if (a.note) B.push({ t: 'small', text: a.note, indent: 18 });
      B.push({ t: 'small', text: `Agreed ${tulum(a.at)}`, indent: 18 });
      B.push({ t: 'space', h: 3 });
    });
    B.push({ t: 'rule' });
    B.push({ t: 'h2', text: 'Record of the booking' });
    B.push({ t: 'kv', k: 'Date and time', v: `${rec.createdAt} (UTC)` });
    B.push({ t: 'kv', k: 'IP address', v: rec.ip || 'not recorded' });
    B.push({ t: 'kv', k: 'Browser', v: rec.userAgent || 'not recorded' });
    B.push({ t: 'space', h: 6 });
    B.push({ t: 'small', text: 'This record was generated automatically by the Amansala booking system from the details saved at the time of booking.' });
    const pdf = makePdf(B);
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Amansala-booking-record-${pi.slice(-8)}.pdf"`, 'Cache-Control': 'private, no-store' },
      body: pdf.toString('base64'),
    };
  } catch (e) {
    console.error('[retreat-booking-record]', e.message);
    return { statusCode: 500, headers: { 'Content-Type': 'text/plain' }, body: 'Could not build the record' };
  }
};
