'use strict';

// activity-public.js — the retreat guests' activity sign-up page (activity-signup.html?id=<bookingId>), on the server
// (security plan phase 3, 2026-11-02). The page used to read the WHOLE booking row (leader email and phone, charges,
// notes...) and the sign-up list with every other guest's name and room, and rewrote that list from the browser (two
// guests at once lost one; anyone could wipe it).
//   GET  ?id=<bookingId>   the retreat's name, dates, activities, package ids and tour prices -- nothing else
//   POST {id, firstName, lastName, room, activities:[aoId]}   replaces this guest's own sign-up (same name), compare-and-swap
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const hdrs = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const reply = (code, data) => ({ statusCode: code, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

async function getBooking(key, id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(id)}&select=id,retreat_name,leader_name,start_date,end_date,retreat_activities,packages,package_custom_prices,status`, { headers: hdrs(key) });
  const [b] = r.ok ? await r.json() : [];
  return b && b.status !== 'cancelled' ? b : null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  try {
    if (event.httpMethod === 'GET') {
      const b = await getBooking(key, String((event.queryStringParameters || {}).id || ''));
      if (!b) return reply(404, { error: 'not found' });
      const pcp = b.package_custom_prices || {}, prices = {};
      // tour prices only (a number per activity id) and the small-group note; the rest of that column is staff settings
      Object.keys(pcp).forEach(k => { if (/^ao\d+$/.test(k) && typeof pcp[k] === 'number') prices[k] = pcp[k]; });
      const sg = pcp.__cfg__ && Number(pcp.__cfg__.smallGroupGuests);
      return reply(200, { retreat: {
        id: b.id, retreatName: b.retreat_name, leaderName: b.leader_name, startDate: b.start_date, endDate: b.end_date,
        retreatActivities: (b.retreat_activities || []).map(a => ({ aoId: a.aoId, date: a.date, time: a.time, prepaid: a.prepaid })),
        packages: b.packages || [], customPrices: { ...prices, ...(sg > 0 ? { __cfg__: { smallGroupGuests: sg } } : {}) },
      } });
    }
    if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
    let p;
    try { p = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
    const id = String(p.id || ''), first = String(p.firstName || '').trim().slice(0, 80), last = String(p.lastName || '').trim().slice(0, 80);
    if (!first || !last) return reply(400, { error: 'Please enter your first and last name.' });
    const b = await getBooking(key, id);
    if (!b) return reply(404, { error: 'Retreat not found' });
    const offered = new Set((b.retreat_activities || []).map(a => a.aoId));
    const acts = [...new Set((Array.isArray(p.activities) ? p.activities : []).map(String))].filter(a => offered.has(a));
    if (!acts.length) return reply(400, { error: 'Please select at least one activity.' });
    const k = 'act_signups_' + id, mine = s => String(s.firstName || '').toLowerCase() === first.toLowerCase() && String(s.lastName || '').toLowerCase() === last.toLowerCase();
    const entry = { id: 'su_' + Date.now(), bookingId: id, firstName: first, lastName: last, roomNumber: String(p.room || '').trim().slice(0, 20), activities: acts, submittedAt: new Date().toISOString() };
    for (let i = 0; i < 10; i++) {
      const g = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.${encodeURIComponent(k)}&select=value,updated_at`, { headers: hdrs(key) });
      const [row] = g.ok ? await g.json() : [];
      const now = new Date().toISOString();
      if (!row) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store`, { method: 'POST', headers: { ...hdrs(key), Prefer: 'return=minimal' }, body: JSON.stringify({ key: k, value: [entry], updated_at: now }) });
        if (r.ok) return reply(200, { ok: true, updated: false });
      } else {
        const list = Array.isArray(row.value) ? row.value : [];
        const had = list.some(mine);
        const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.${encodeURIComponent(k)}&updated_at=eq.${encodeURIComponent(row.updated_at)}`, { method: 'PATCH', headers: { ...hdrs(key), Prefer: 'return=representation' }, body: JSON.stringify({ value: [...list.filter(s => !mine(s)), entry], updated_at: now }) });
        if (r.ok && (await r.json()).length) return reply(200, { ok: true, updated: had });
      }
      await new Promise(res => setTimeout(res, 100 + Math.random() * 200));
    }
    return reply(503, { error: 'Busy — please try again.' });
  } catch (e) {
    console.error('[activity-public]', e);
    return reply(500, { error: 'Error saving. Please try again.' });
  }
};
