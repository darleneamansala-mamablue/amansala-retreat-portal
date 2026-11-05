'use strict';
// Scheduled every 2 hours (see netlify.toml): saves a copy of the whole spa appointment list in app_store as 'spa_appts_bk_<YYYYMMDD>_<HH>'
// (Tulum time), keeps 7 days of copies, and compares each copy with the previous one. Any appointment that was in the previous copy and is
// gone now is written to 'spa_appts_missing' (id, guest, date, start, when noticed) so a lost booking can be found and restored.
// The spa settings (app_store 'spa_data': therapists, services, rooms) get the same copy, 'spa_data_bk_<YYYYMMDD>_<HH>', but only while
// they still have therapists -- on 2026-11-05 they were wiped to defaults with no therapists and no copy existed (Jorge).
// Deleted appointments show up there too; the list only says "this one is no longer on the calendar", it never changes the calendar.
const L = require('./rb-lib');
const KEEP_DAYS = 7;

function tulumStamp(d) {
  const t = new Date(d.getTime() - 5 * 3600000);   // Quintana Roo is UTC-5 all year
  const p = (n) => String(n).padStart(2, '0');
  return { day: `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}`, hour: p(t.getUTCHours()) };
}

async function run() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return { error: 'not configured' };
  const now0 = tulumStamp(new Date());
  let sdSaved = false;
  try {
    const sd = await L.appStoreGet(key, 'spa_data');
    if (sd && Array.isArray(sd.therapists) && sd.therapists.length) { await L.appStoreSet(key, `spa_data_bk_${now0.day}_${now0.hour}`, sd); sdSaved = true; }
  } catch (e) { console.warn('[spa-appointments-backup] spa_data copy failed:', e.message); }
  const list = (await L.appStoreGet(key, 'spa_appointments')) || [];
  if (!Array.isArray(list) || !list.length) return { skipped: 'no appointments to back up' };
  const now = new Date(), { day, hour } = tulumStamp(now);
  const prevRows = await L.sget(key, `app_store?key=like.spa_appts_bk_*&select=key,value&order=key.desc&limit=1`);
  const prev = prevRows[0] && Array.isArray(prevRows[0].value) ? prevRows[0].value : null;
  await L.appStoreSet(key, `spa_appts_bk_${day}_${hour}`, list);
  let missing = [];
  if (prev) {
    const have = new Set(list.map((a) => a.id));
    missing = prev.filter((a) => a && a.id && !have.has(a.id) && a.status !== 'CANCELLED')
      .map((a) => ({ id: a.id, guest: a.clientName, date: a.date, start: a.start, createdAt: a.createdAt, noticed: now.toISOString() }));
    if (missing.length) {
      const old = (await L.appStoreGet(key, 'spa_appts_missing')) || [];
      await L.appStoreSet(key, 'spa_appts_missing', [...missing, ...old].slice(0, 300));
    }
  }
  // prune copies older than KEEP_DAYS
  const cut = tulumStamp(new Date(now.getTime() - KEEP_DAYS * 86400000)).day;
  const keys = await L.sget(key, 'app_store?or=(key.like.spa_appts_bk_*,key.like.spa_data_bk_*)&select=key');
  const old = keys.map((r) => r.key).filter((k) => k.replace(/^spa_(appts|data)_bk_/, '').slice(0, 8) < cut);
  for (const k of old) await L.sreq(key, 'DELETE', `app_store?key=eq.${encodeURIComponent(k)}`);
  return { saved: list.length, spaDataCopy: sdSaved, key: `spa_appts_bk_${day}_${hour}`, missingSincePrevious: missing.length, pruned: old.length };
}

exports.handler = async () => {
  try { const r = await run(); console.log('[spa-appointments-backup]', JSON.stringify(r)); return { statusCode: 200, body: JSON.stringify(r) }; }
  catch (e) { console.error('[spa-appointments-backup]', e.message); return { statusCode: 500, body: e.message }; }
};
exports.run = run;
