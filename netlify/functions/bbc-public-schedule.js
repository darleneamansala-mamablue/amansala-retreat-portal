'use strict';

// bbc-public-schedule.js — the Bikini Bootcamp schedule for the public "Our Schedule" page (amansala.com/ourschedule and
// amansalaportal.com/ourschedule). ONLY the schedule leaves here: name, dates, and per day the note, prompt and lines
// (time, activity, teacher, co-host, place, kind). No ids, no guests, no bookings, no other portal data.
// Shows the confirmed schedule that is running today, else the next confirmed one; drafts and cancelled ones are never shown.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const reply = (code, data) => ({
  statusCode: code,
  headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
  body: JSON.stringify(data),
});
const str = v => (v == null ? '' : String(v).slice(0, 300));

exports.handler = async () => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.bbc_schedules&select=value`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error('app_store ' + r.status);
    const rows = await r.json();
    const all = (rows[0] && Array.isArray(rows[0].value)) ? rows[0].value : [];
    // today in Tulum (UTC-5, no DST)
    const today = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
    const ok = all.filter(s => s && s.status === 'confirmed' && s.startDate && s.endDate && String(s.endDate).slice(0, 10) >= today)
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
    const s = ok.find(x => String(x.startDate).slice(0, 10) <= today) || ok[0];
    if (!s) return reply(200, { schedule: null });
    return reply(200, {
      schedule: {
        name: str(s.name), startDate: str(s.startDate).slice(0, 10), endDate: str(s.endDate).slice(0, 10),
        days: (s.days || []).map(d => ({
          date: str(d.date).slice(0, 10), note: str(d.note), prompt: str(d.prompt),
          slots: (d.slots || []).map(l => ({
            time: str(l.time), activity: str(l.activity), instructor: str(l.instructor), coHost: str(l.coHost),
            location: str(l.location), type: l.type === 'meal' ? 'meal' : l.type === 'event' ? 'event' : 'class', workshop: !!l.workshop,
          })),
        })),
      },
    });
  } catch (e) {
    console.error('[bbc-public-schedule]', e);
    return reply(500, { error: 'Could not load the schedule' });
  }
};
