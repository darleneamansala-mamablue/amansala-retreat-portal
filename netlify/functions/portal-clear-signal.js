'use strict';

// portal-clear-signal.js — the portal's "clear signal", sent at a quiet hour (Jorge, 2026-11-04). Runs every night at
// 10pm Tulum (netlify.toml) and does something only on a night someone asked for it: app_store 'clear_signal_scheduled'
// = {"date": "YYYY-MM-DD"} (Tulum date). It then writes app_store 'clear_signal' = now, which every open portal tab --
// staff or teacher, new code or old -- reads on its next refresh (every 2 minutes): the tab throws away the copy of
// bookings and guests it keeps in the browser, does not save until it has reloaded them from the database, and carries
// on with fresh data. Why: a teacher tab with an old copy saved over Heather Rex's retreat and dropped two Cloudbeds links.
// Anything someone had typed and not saved at that moment is lost, hence the night hour.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const localDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });

async function run({ force = false } = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return { error: 'SUPABASE_SERVICE_KEY missing' };
  const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const today = localDate();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.clear_signal_scheduled&select=value`, { headers: H });
  const want = ((await r.json().catch(() => []))[0] || {}).value || null;
  if (!force && !(want && want.date === today)) return { date: today, sent: false, scheduled: want };
  const at = new Date().toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: 'clear_signal', value: at, updated_at: at }),
  });
  await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.clear_signal_scheduled`, { method: 'DELETE', headers: H }).catch(() => {});
  await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ id: 'id_' + Date.now() + '_clrsig', action: 'Clear signal sent', detail: `Every open portal tab reloads its bookings and guests from the database (asked by ${(want && want.by) || 'admin'} for ${today})`, booking_id: null, user_name: 'System', user_role: 'system', created_at: at }),
  }).catch(() => {});
  console.log('[portal-clear-signal] sent', at);
  return { date: today, sent: true, at };
}

exports.handler = async () => { const r = await run(); return { statusCode: r.error ? 500 : 200, body: JSON.stringify(r) }; };
exports.run = run;
