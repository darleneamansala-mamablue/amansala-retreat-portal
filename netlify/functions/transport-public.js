'use strict';

// transport-public.js — the guests' transport form (transport-form.html), on the server (security plan phase 3,
// 2026-11-02). The form used to read every booking and every guest (emails) with the public key, save by REPLACING the
// whole transport row (wiping office fields like folioCharged / upgradeConfirmed / flightLabel on every guest update),
// and its "update my info" link was the row id alone ('tr_' + a timestamp: guessable).
//   GET  ?action=retreats                 upcoming retreats for the picker (id, names, dates)
//   GET  ?action=entry&tr=<id>&k=<key>     the guest's own entry, guest fields only (k required on new entries)
//   POST {action:'submit', tr?, k?, bookingId|'individual', firstName, lastName, email, flightNumber, arrival*, departure*,
//         notes, willingToShare}         merges ONLY the guest fields into the row, matches an individual guest to a
//                                        retreat on the server, emails the confirmation; returns {id, k}
const crypto = require('crypto');
// The retreat list of the public form carries a form-only code, not the booking id (Jorge 2026-11-10, security review: the id is
// also what opens a teacher's link, and the list handed out every one of them). The form sends the code back; the server turns
// it into the booking. A booking id still works (old ?bk= links, entries saved before this).
const pubId = id => 'r_' + crypto.createHmac('sha256', process.env.SUPABASE_SERVICE_KEY || '').update('transport-form:' + id).digest('hex').slice(0, 16);
async function realBookingId(key, v) {
  if (!/^r_[0-9a-f]{16}$/.test(v)) return v;
  const since = new Date(Date.now() - 400 * 86400e3).toISOString().slice(0, 10);
  const bks = await getAll(key, `bookings?end_date=gte.${since}&select=id`);
  return (bks.find(b => pubId(b.id) === v) || {}).id || '';
}
const { sendMail } = require('./mail-lib');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const SITE = process.env.URL || 'https://amansalaportal.com';
const hdrs = key => ({ apikey: key, Authorization: `Bearer ${key}` });
const reply = (code, data) => ({ statusCode: code, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const GUEST_KEYS = ['bookingId', 'isIndividual', 'firstName', 'lastName', 'email', 'phone', 'flightNumber', 'arrivalDate', 'arrivalTime', 'arrivalAirport', 'arrivalOT',
  'departureDate', 'departureTime', 'departureAirport', 'departureOT', 'notes', 'willingToShare'];

async function getAll(key, path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { ...hdrs(key), Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(path.split('?')[0] + ' ' + r.status);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
const keyOk = (data, k) => !data.editKey || (typeof k === 'string' && k.length === data.editKey.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(data.editKey)));
const normName = n => String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, '').trim().split(/\s+/).sort().join(' ');

// an individual guest (no retreat picked): by email, then by name, among retreats ending in the last 30 days or later --
// same rules the form used to run in the browser
async function autoMatch(key, email, firstName, lastName) {
  const cutoff = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
  const bks = await getAll(key, `bookings?end_date=gte.${cutoff}&select=id`);
  const ids = bks.map(b => b.id), regs = [];
  for (let i = 0; i < ids.length; i += 80) regs.push(...await getAll(key, `registrations?booking_id=in.(${ids.slice(i, i + 80).map(encodeURIComponent).join(',')})&select=booking_id,guests`));
  const em = String(email || '').toLowerCase().trim();
  if (em) for (const r of regs) if ((r.guests || []).some(g => g && g.email && g.email.toLowerCase().trim() === em)) return r.booking_id;
  const full = normName(`${firstName} ${lastName}`), f = normName(firstName), l = normName(lastName);
  if (full) for (const r of regs) for (const g of r.guests || []) {
    if (!g || !g.name) continue;
    const k = normName(g.name);
    if (k === full || (f.length > 2 && l.length > 2 && k.includes(f) && k.includes(l))) return r.booking_id;
  }
  return null;
}

function emailHtml(e, isUpdate, editUrl) {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const airport = a => a === 'cancun' ? 'Cancún (CUN)' : a === 'tulum' ? 'Tulum (TQO)' : '—';
  const fmtDate = d => { if (!d) return '—'; const [y, m, dy] = d.split('-'); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]} ${+dy}, ${y}`; };
  const fmtTime = t => { if (!t) return '—'; const [h, mn] = t.split(':'); const hr = +h; return `${hr % 12 || 12}:${mn} ${hr < 12 ? 'AM' : 'PM'}`; };
  const arr = e.arrivalOT ? 'Own transport / not using Amansala transfer' : `${fmtDate(e.arrivalDate)} at ${fmtTime(e.arrivalTime)} · ${airport(e.arrivalAirport)}`;
  const dep = e.departureOT ? 'Own transport / not using Amansala transfer' : `${fmtDate(e.departureDate)} at ${fmtTime(e.departureTime)} · ${airport(e.departureAirport)}`;
  const row = (label, value) => `<tr><td style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:13px;color:#6b7280;width:130px;vertical-align:top">${label}</td><td style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:14px;color:#1a2332;font-weight:500">${value}</td></tr>`;
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f0ea;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0ea;padding:32px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <tr><td style="background:#2d6a6a;padding:28px 36px;text-align:center">
    <div style="font-size:11px;letter-spacing:.15em;color:#a7d7d7;text-transform:uppercase;margin-bottom:6px">Amansala Eco-Chic Resort + Retreat</div>
    <div style="font-size:22px;font-weight:700;color:#fff">${isUpdate ? 'Transport Info Updated' : 'Transport Info Received'}</div>
  </td></tr>
  <tr><td style="padding:32px 36px">
    <p style="font-size:15px;color:#374151;margin:0 0 24px">Hi ${esc(e.firstName)}, ${isUpdate ? 'your transport details have been updated.' : "we've received your transportation information."} Here's a summary:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
      ${e.flightNumber ? row('Flight', esc(e.flightNumber)) : ''}
      ${row('Arrival', arr)}
      ${row('Departure', dep)}
      ${e.willingToShare ? row('Sharing', 'Willing to share a ride') : ''}
      ${e.notes ? row('Notes', esc(e.notes).replace(/\n/g, '<br>')) : ''}
    </table>
    <p style="font-size:13.5px;color:#6b7280;margin:0 0 20px">If your flight details change, you can update your info anytime using the button below — no login required.</p>
    <div style="text-align:center;margin-bottom:8px">
      <a href="${editUrl}" style="display:inline-block;background:#2d6a6a;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:.3px">Update My Transport Info</a>
    </div>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin:8px 0 0">Or copy this link: <span style="color:#2d6a6a">${editUrl}</span></p>
  </td></tr>
  <tr><td style="background:#f5f0ea;padding:20px 36px;text-align:center;border-top:1px solid #e8e3dc">
    <p style="font-size:12px;color:#9ca3af;margin:0">Amansala Eco-Chic Resort · Tulum, México · retreats@amansala.com</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  try {
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};
      if (q.action === 'retreats') {
        const since = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
        const bks = await getAll(key, `bookings?end_date=gte.${since}&status=neq.cancelled&select=id,leader_name,retreat_name,start_date,end_date,status,booking_type`);
        // retreats only: a Room Only booking's "leader" is the guest's own name (those guests choose "Individual")
        return reply(200, { retreats: bks.filter(b => b.booking_type !== 'room_only').map(b => ({ id: pubId(b.id), leaderName: b.leader_name, retreatName: b.retreat_name, startDate: b.start_date, endDate: b.end_date, status: b.status })) });
      }
      if (q.action === 'retreat') {   // a direct ?bk= link to a retreat that may have ended already
        const [b] = await getAll(key, `bookings?id=eq.${encodeURIComponent(String(q.bk || ''))}&select=id,leader_name,retreat_name,start_date,end_date,status`);
        return reply(200, { retreat: b && b.status !== 'cancelled' ? { id: b.id, leaderName: b.leader_name, retreatName: b.retreat_name, startDate: b.start_date, endDate: b.end_date, status: b.status } : null });
      }
      if (q.action === 'entry') {
        const [row] = await getAll(key, `transport?id=eq.${encodeURIComponent(String(q.tr || ''))}&select=id,data`);
        if (!row || !row.data || !keyOk(row.data, q.k)) return reply(404, { error: 'not found' });
        const e = { id: row.id };
        GUEST_KEYS.forEach(k => { if (row.data[k] !== undefined) e[k] = row.data[k]; });
        if (e.bookingId && e.bookingId !== 'individual') e.bookingId = pubId(e.bookingId);   // same code as the retreat list
        return reply(200, { entry: e, k: row.data.editKey || null });
      }
      return reply(400, { error: 'Unknown action' });
    }
    if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
    let b;
    try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
    if (b.action !== 'submit') return reply(400, { error: 'Unknown action' });
    const s = v => String(v == null ? '' : v).trim();
    const firstName = s(b.firstName).slice(0, 80), lastName = s(b.lastName).slice(0, 80), email = s(b.email).slice(0, 200);
    if (!firstName || !lastName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: 'Please fill in your name and a valid email.' });
    const date = v => /^\d{4}-\d{2}-\d{2}$/.test(s(v)) ? s(v) : '', time = v => /^\d{2}:\d{2}$/.test(s(v)) ? s(v) : '', ap = v => ['cancun', 'tulum'].includes(s(v)) ? s(v) : '';
    let bookingId = s(b.bookingId) || 'individual';
    if (bookingId !== 'individual') bookingId = (await realBookingId(key, bookingId)) || 'individual';
    if (bookingId !== 'individual') {
      const [bk] = await getAll(key, `bookings?id=eq.${encodeURIComponent(bookingId)}&select=id`);
      if (!bk) bookingId = 'individual';
    }
    const guest = {
      bookingId, isIndividual: bookingId === 'individual' || undefined, firstName, lastName, email, flightNumber: s(b.flightNumber).slice(0, 40),
      phone: /^\+\d{7,15}$/.test(s(b.phone)) ? s(b.phone) : '',   // WhatsApp number with its country code (2026-11-04)
      arrivalDate: date(b.arrivalDate), arrivalTime: time(b.arrivalTime), arrivalOT: !!b.arrivalOT, arrivalAirport: b.arrivalOT ? '' : ap(b.arrivalAirport),
      departureDate: date(b.departureDate), departureTime: time(b.departureTime), departureOT: !!b.departureOT, departureAirport: b.departureOT ? '' : ap(b.departureAirport),
      notes: s(b.notes).slice(0, 2000), willingToShare: !!b.willingToShare,
    };
    // an update: only with the entry's key; merged into the row as it is now (office fields kept)
    let id = s(b.tr), prev = null;
    if (id) {
      const [row] = await getAll(key, `transport?id=eq.${encodeURIComponent(id)}&select=id,booking_id,data`);
      if (row && !keyOk(row.data || {}, b.k)) return reply(403, { error: 'This link is not valid any more — please submit the form again.' });
      prev = row || null;
      if (!row) id = '';
    }
    if (bookingId === 'individual') { const m = await autoMatch(key, email, firstName, lastName); if (m) guest.bookingId = m; }
    // the same guest sending the form again from the general link (not their update link) updates their entry instead
    // of adding a second one (Lisa de Saxe Zerden, Heather Kasey: Aug 21 and again Sep 6, same flights -> twice on
    // Transport). Same retreat + same email + same first name; couples sharing one email keep separate entries.
    if (!prev && guest.bookingId !== 'individual') {
      const em = email.toLowerCase(), fn = normName(firstName);
      const rows = await getAll(key, `transport?booking_id=eq.${encodeURIComponent(guest.bookingId)}&select=id,booking_id,data`);
      const same = rows.filter(r => r.data && String(r.data.email || '').toLowerCase().trim() === em && normName(r.data.firstName) === fn)
        .sort((x, y) => String(x.data.submittedAt || '').localeCompare(String(y.data.submittedAt || '')));
      if (same.length) { prev = same[0]; id = prev.id; }
    }
    if (!id) id = 'tr_' + Date.now() + Math.random().toString(36).slice(2, 5);
    const editKey = (prev && prev.data && prev.data.editKey) || crypto.randomBytes(12).toString('hex');
    const now = new Date().toISOString();
    const data = { ...((prev && prev.data) || {}), ...guest, id, editKey, submittedAt: now };
    // who filled it / changed it last, shown in the staff's Edit window (Jorge 2026-11-06)
    if (!data.filledBy) data.filledBy = { by: 'guest', at: now };
    data.lastEditBy = { by: 'guest', name: `${firstName} ${lastName}`.trim(), at: now };
    if (data.isIndividual === undefined) delete data.isIndividual;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/transport?on_conflict=id`, {
      method: 'POST', headers: { ...hdrs(key), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id, booking_id: data.bookingId, data, submitted_at: data.submittedAt }),
    });
    if (!r.ok) throw new Error('save ' + r.status + ' ' + (await r.text()).slice(0, 120));
    // a ride whose date the nightly charge already went over is charged now (Jorge 2026-11-11)
    await require('./transport-charge-lib').chargeIfLate(key, id);
    const editUrl = `${SITE}/transport-form.html?tr=${encodeURIComponent(id)}&k=${editKey}`;
    try { await sendMail({ to: email, subject: prev ? 'Transport Info Updated — Amansala' : 'Transport Info Received — Amansala', html: emailHtml(data, !!prev, editUrl) }); } catch (e) {}
    const entry = { id }; GUEST_KEYS.forEach(k => { if (data[k] !== undefined) entry[k] = data[k]; });
    return reply(200, { ok: true, id, k: editKey, entry });
  } catch (e) {
    console.error('[transport-public]', e);
    return reply(500, { error: 'Could not save — please try again.' });
  }
};
