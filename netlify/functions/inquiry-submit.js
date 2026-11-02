'use strict';

// inquiry-submit.js — the public lead forms (leader-inquiry.html, event-inquiry.html), on the server (security plan
// phase 3, 2026-11-02). They used to insert into `bookings` with the public key (any status, any column) and the event
// form re-wrote the whole app_store crm_inquiries list from the browser (two submissions at once lost one; anyone could
// read or wipe every lead). Now the server sets the id, status 'requested' and source 'inquiry', takes only the form's
// fields, and appends the event lead with compare-and-swap.
//   POST {kind:'leader', name, email, phone, retreatName, startDate, endDate, pax, retreatType, isReturnGuest,
//         previousVisit, datesFlexible, notes, chica}
//   POST {kind:'event', type:'wedding'|'bachelorette', name, email, phone, honoree, date, guestCount, notes, referral}
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const hdrs = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const reply = (code, data) => ({ statusCode: code, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const date = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;

async function insertBooking(key, row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, { method: 'POST', headers: { ...hdrs(key), Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  if (!r.ok) throw new Error('bookings ' + r.status + ' ' + (await r.text()).slice(0, 160));
}
async function appendInquiry(key, entry) {
  for (let i = 0; i < 10; i++) {
    const g = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.crm_inquiries&select=value,updated_at`, { headers: hdrs(key) });
    const [row] = g.ok ? await g.json() : [];
    const now = new Date().toISOString();
    if (!row) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store`, { method: 'POST', headers: { ...hdrs(key), Prefer: 'return=minimal' }, body: JSON.stringify({ key: 'crm_inquiries', value: [entry], updated_at: now }) });
      if (r.ok) return;
    } else {
      const list = Array.isArray(row.value) ? row.value : [];
      const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.crm_inquiries&updated_at=eq.${encodeURIComponent(row.updated_at)}`, { method: 'PATCH', headers: { ...hdrs(key), Prefer: 'return=representation' }, body: JSON.stringify({ value: [...list, entry], updated_at: now }) });
      if (r.ok && (await r.json()).length) return;
    }
    await new Promise(res => setTimeout(res, 100 + Math.random() * 200));
  }
  throw new Error('crm_inquiries busy');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
  if (b.website) return reply(200, { ok: true });   // honeypot field the forms leave empty: bots fill it
  const name = s(b.name, 120), email = s(b.email, 200), phone = s(b.phone, 40);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: 'Please enter your name and a valid email.' });
  try {
    if (b.kind === 'leader') {
      const start = date(b.startDate), end = date(b.endDate) || start;
      await insertBooking(key, {
        id: uid(), venue_row: b.chica ? 'CHICA' : 'RETREAT 1', leader_name: name, retreat_name: s(b.retreatName, 160) || `${name}'s Retreat`,
        leader_email: email, leader_phone: phone, start_date: start, end_date: end, pax: Math.max(1, Math.min(500, parseInt(b.pax, 10) || 10)),
        status: 'requested', source: 'inquiry', retreat_type: s(b.retreatType, 80) || null, is_return_guest: b.isReturnGuest === true,
        previous_visit: s(b.previousVisit, 80) || null, dates_flexible: b.datesFlexible === true, notes: s(b.notes, 4000), doc_link: '', blocked_rooms: [],
      });
      return reply(200, { ok: true });
    }
    if (b.kind === 'event') {
      const type = b.type === 'bachelorette' ? 'bachelorette' : 'wedding', d = date(b.date), honoree = s(b.honoree, 120);
      const guestCount = parseInt(b.guestCount, 10) || null;
      const entry = { id: 'ci_' + uid(), type, name, email, phone, honoree, date: d, guestCount, notes: s(b.notes, 4000), referral: s(b.referral, 120), status: 'new', submittedAt: new Date().toISOString() };
      await appendInquiry(key, entry);
      await insertBooking(key, {
        id: 'bk_' + uid(), event_type: type, leader_name: name, retreat_name: `${honoree} ${type === 'wedding' ? 'Wedding' : 'Bachelorette'}`,
        leader_email: email, leader_phone: phone, start_date: d, end_date: d, pax: guestCount, notes: entry.notes, source: 'inquiry', status: 'requested',
      });
      return reply(200, { ok: true });
    }
    return reply(400, { error: 'Unknown form' });
  } catch (e) {
    console.error('[inquiry-submit]', e);
    return reply(500, { error: 'Could not send — please try again.' });
  }
};
