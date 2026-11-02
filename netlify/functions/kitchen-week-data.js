'use strict';

// kitchen-week-data.js — what the kitchen's Staffing page (staffing.html + modules/kitchen-week.js) needs, on the server
// (security plan phase 3, 2026-11-02). The page used to read every booking and every registration (all guests' names,
// emails, phones) with the public key just to count heads. Now: the groups (name, dates, meal plan, offsite dinner night)
// and, per room, how many guests -- each guest only as "a named guest, cancelled or not".
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const reply = (code, data) => ({ statusCode: code, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

async function getAll(key, path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(path.split('?')[0] + ' ' + r.status);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

exports.handler = async () => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  try {
    const since = new Date(Date.now() - 120 * 86400e3).toISOString().slice(0, 10);   // the month view goes back a few months at most
    const bookings = await getAll(key, `bookings?end_date=gte.${since}&select=id,leader_name,retreat_name,start_date,end_date,pax,status,booking_type,cancelled_at,meal_plan,schedule_request&order=id`);
    const ids = bookings.map(b => b.id), regs = [];
    for (let i = 0; i < ids.length; i += 80) regs.push(...await getAll(key, `registrations?booking_id=in.(${ids.slice(i, i + 80).map(encodeURIComponent).join(',')})&select=id,booking_id,guests,check_in,check_out,cancelled&order=id`));
    return reply(200, {
      bookings: bookings.map(b => ({ ...b, schedule_request: b.schedule_request ? { offsiteChoice: b.schedule_request.offsiteChoice, offsiteNight: b.schedule_request.offsiteNight } : null })),
      registrations: regs.map(r => ({ id: r.id, booking_id: r.booking_id, check_in: r.check_in, check_out: r.check_out, cancelled: r.cancelled,
        guests: (r.guests || []).filter(g => g && String(g.name || '').trim()).map(g => ({ name: 'Guest', cancelled: !!g.cancelled })) })),
    });
  } catch (e) {
    console.error('[kitchen-week-data]', e);
    return reply(500, { error: 'Could not load the week' });
  }
};
