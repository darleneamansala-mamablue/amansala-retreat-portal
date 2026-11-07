'use strict';

// Nightly (netlify.toml): the change history (sql/data_history.sql) keeps 120 days; older rows are deleted here.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async () => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return { statusCode: 500 };
  const before = new Date(Date.now() - 120 * 864e5).toISOString();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/data_history?at=lt.${encodeURIComponent(before)}`, { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' } });
  console.log('[data-history-cleanup] older than', before, r.status);
  return { statusCode: 200 };
};
