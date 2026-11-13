'use strict';

// guest-book-lib.js — two days before arriving, every guest gets the Guest Book (guest-book.html: room info, housekeeping, tours,
// spa, room service, wifi, activity schedule) by email and WhatsApp (Jorge 2026-11-12). One per guest of each stay that starts
// that day (retreats and Room Only); cancelled guests and the groups' placeholder emails are left out; an email or phone that is
// on two stays gets it once. Switch: app_store 'guest_book_pre_arrival' = {enabled, sent:{'YYYY-MM-DD': [keys]}} -- the keys
// already sent for an arrival date, so a second run the same day sends nobody twice.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const SITE = 'https://amansalaportal.com', LINK = SITE + '/guest-book.html';
const CFG_KEY = 'guest_book_pre_arrival', TPL = 'guest_book_pre_arrival';
const VISITO_SEND = `https://platform-api.visitoai.com/m2m/v1/whatsapp-templates/${process.env.VISITO_WA_CHANNEL_ID || '6abd2154f6a6b5cd69232824'}/send`;
const { sendMail } = require('./mail-lib');

const H = key => ({ apikey: key, Authorization: `Bearer ${key}` });
const esc = v => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const e164 = p => { const d = String(p || '').replace(/\D/g, ''); if (d.length < 10) return ''; return '+' + (d.length === 10 ? '1' + d : d); };
const okEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '').trim()) && !/@groups\.amansala\.com$|@guest\.booking\.com$|@m\.expediapartnercentral\.com$/i.test(String(e).trim());
const longDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const addDays = (d, n) => new Date(new Date(d + 'T12:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);

async function get(key, path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H(key) });
  if (!r.ok) throw new Error(path.split('?')[0] + ' ' + r.status);
  return r.json();
}

async function cbContact(reservationId) {
  try {
    const r = await fetch(`${SITE}/.netlify/functions/cloudbeds?action=getReservationContact`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...require('./portal-auth-lib').internalHeaders() }, body: JSON.stringify({ reservationId }) });
    const d = await r.json(); return d && d.success && !/cancel/i.test(d.status || '') ? d : {};
  } catch (e) { return {}; }
}

// the guests arriving on ds: [{name, firstName, email, phone, room, bookingId}]
async function arrivals(key, ds) {
  const bks = await get(key, `bookings?select=id,start_date,end_date,status,booking_type,leader_email,leader_phone,cb_reservation_ids&status=neq.cancelled&start_date=lte.${ds}&end_date=gte.${ds}&limit=2000`);
  const byId = new Map(bks.map(b => [b.id, b])), ids = [...byId.keys()], out = [], seen = new Set();
  for (let i = 0; i < ids.length; i += 80) {
    const regs = await get(key, `registrations?select=id,booking_id,room,guests,check_in,cancelled&booking_id=in.(${ids.slice(i, i + 80).map(encodeURIComponent).join(',')})`);
    for (const r of regs) {
      if (r.cancelled || (r.check_in || byId.get(r.booking_id).start_date) !== ds) continue;
      const bk = byId.get(r.booking_id), live = (r.guests || []).filter(g => g && String(g.name || '').trim() && !g.cancelled);
      for (const g of live) {
        const name = String(g.name).trim();
        let email = okEmail(g.email) ? String(g.email).trim().toLowerCase() : '', phone = e164(g.phone);
        // a Room Only stay (Direct/OTA, walk-in) keeps its contact on the booking or only in Cloudbeds: the first guest of the room gets it
        if (!email && !phone && bk.booking_type === 'room_only' && g === live[0]) {
          email = okEmail(bk.leader_email) ? String(bk.leader_email).trim().toLowerCase() : ''; phone = e164(bk.leader_phone);
          const ids = bk.cb_reservation_ids || {}, rid = ids[r.room] || (Object.keys(ids).length === 1 ? Object.values(ids)[0] : '');
          if (!email && !phone && rid) { const c = await cbContact(rid); email = okEmail(c.email) ? String(c.email).trim().toLowerCase() : ''; phone = e164(c.phone); }
        }
        if (!email && !phone) continue;
        const k = email || phone;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ name, firstName: name.split(/\s+/)[0], email, phone, room: r.room || '', bookingId: r.booking_id, key: k });
      }
    }
  }
  return out;
}

function emailHtml(firstName, when) {
  const sec = (icon, t, d) => `<tr><td style="padding:6px 0;font-size:15px;color:#3d3d3d"><span style="font-size:18px">${icon}</span>&nbsp; <b>${t}</b> — ${d}</td></tr>`;
  return `<div style="background:#f1ece6;padding:24px 12px;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td><img src="${SITE}/shala-images/beachfront.jpg" alt="Amansala beachfront" width="560" style="display:block;width:100%;height:auto;max-height:260px;object-fit:cover"></td></tr>
<tr><td style="padding:28px 28px 8px">
<div style="font-family:Georgia,serif;font-size:28px;color:#1a4a4a">Welcome to Amansala, ${esc(firstName)} 🌴</div>
<p style="font-size:16px;color:#3d3d3d;line-height:1.55">We are so excited to welcome you in two days, on <b>${esc(when)}</b>!</p>
<p style="font-size:16px;color:#3d3d3d;line-height:1.55">To help you get ready, we put everything you need to know about your stay in one place — your Amansala Guest Book:</p>
</td></tr>
<tr><td style="padding:0 28px"><table role="presentation" width="100%">
${sec('🛏️', 'Your room', 'drinking water, A/C and what you will find in your room')}
${sec('🧹', 'Housekeeping', 'when your room is cleaned')}
${sec('🚐', 'Adventures', 'cenotes, ruins and the tours we offer')}
${sec('💆', 'Spa and rituals', 'treatments, temazcal and ceremonies')}
${sec('🍽️', 'Room service', 'what you can order and how')}
${sec('📶', 'Wifi', 'how to connect')}
${sec('🧘', 'Activity schedule', 'classes, tours and rituals day by day')}
</table></td></tr>
<tr><td align="center" style="padding:26px 28px 10px"><a href="${LINK}" style="background:#2d6a6a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 30px;border-radius:30px;display:inline-block">Open your Guest Book</a></td></tr>
<tr><td style="padding:14px 28px 28px">
<p style="font-size:15px;color:#3d3d3d;line-height:1.55">If you have any question before you arrive, just reply to this email or write to us on WhatsApp at <a href="https://wa.me/529848795999" style="color:#2d6a6a">+52 984 879 5999</a> — our team will be happy to help.</p>
<p style="font-size:15px;color:#3d3d3d">See you very soon!<br><b>The Amansala Team</b></p>
</td></tr></table>
<p style="text-align:center;font-size:12px;color:#8a7e74;margin-top:14px">Amansala · Tulum, Quintana Roo, México</p></div>`;
}

async function sendWa(phone, params, idem) {
  if (!process.env.VISITO_M2M_KEY) return 'no key';
  const r = await fetch(VISITO_SEND, { method: 'POST', headers: { Authorization: `Bearer ${process.env.VISITO_M2M_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem },
    body: JSON.stringify({ to: phone, template: { name: TPL, language: { code: 'en_US' }, components: [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: t })) }] } }) });
  const txt = await r.text();
  return r.ok && /"accepted":true/.test(txt) ? 'sent' : 'failed ' + r.status + ' ' + txt.slice(0, 120);
}

async function sendOne(g, ds, idemSuffix = '') {
  const when = longDate(ds);
  const mail = g.email ? !!(await sendMail({ to: g.email, replyTo: 'amansala.reservations@gmail.com', subject: `Your Amansala Guest Book — see you on ${when} 🌴`, html: emailHtml(g.firstName, when) }).catch(() => false)) : null;
  let wa = g.phone ? await sendWa(g.phone, [g.firstName, when, LINK], `gbook-${ds}-${g.phone.replace(/\D/g, '')}${idemSuffix}`) : null;
  if (wa && wa !== 'sent') { await new Promise(x => setTimeout(x, 3000)); wa = await sendWa(g.phone, [g.firstName, when, LINK], `gbook-${ds}-${g.phone.replace(/\D/g, '')}${idemSuffix}`); }
  return { email: mail === null ? '-' : mail ? 'sent' : 'failed', whatsapp: wa === null ? '-' : wa };
}

// opts.date = arrival date (default: two days from today in Tulum), opts.dryRun = who would get it, opts.only = {email, phone, name} (a test)
async function runGuestBook(opts = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const tulumToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
  const ds = opts.date || addDays(tulumToday, 2);
  if (opts.only) {
    const g = { name: opts.only.name || 'Jorge', firstName: String(opts.only.name || 'Jorge').split(/\s+/)[0], email: okEmail(opts.only.email) ? opts.only.email : '', phone: e164(opts.only.phone) };
    return { ds, test: true, ...(await sendOne(g, ds, '-' + Date.now())) };
  }
  const [cfgRow] = await get(key, `app_store?select=value&key=eq.${CFG_KEY}`);
  const cfg = (cfgRow && cfgRow.value) || {};
  const guests = await arrivals(key, ds);
  if (opts.dryRun) return { ds, enabled: !!cfg.enabled, guests: guests.map(g => ({ name: g.name, room: g.room, email: !!g.email, whatsapp: !!g.phone })) };
  if (!cfg.enabled) return { ds, skipped: 'switched off', guests: guests.length };
  const sent = new Set(((cfg.sent || {})[ds]) || []), results = [];
  for (const g of guests) {
    if (sent.has(g.key)) continue;
    const r = await sendOne(g, ds);
    if (r.email === 'sent' || r.whatsapp === 'sent') sent.add(g.key);
    results.push({ name: g.name, room: g.room, ...r });
  }
  // keep the last 10 arrival dates in the log
  const log = { ...(cfg.sent || {}), [ds]: [...sent] };
  Object.keys(log).sort().slice(0, -10).forEach(k => delete log[k]);
  await fetch(`${SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, { method: 'POST', headers: { ...H(key), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: CFG_KEY, value: { ...cfg, sent: log }, updated_at: new Date().toISOString() }) });
  return { ds, sent: results.length, results };
}

module.exports = { runGuestBook, arrivals, emailHtml, CFG_KEY };
