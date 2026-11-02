'use strict';

// public-content.js — app_store settings that are public by design, read through the server instead of the public
// database key (security plan phase 3, 2026-11-02). Only the keys in the list can be read.
//   GET ?key=guestBookConfig   (guest-book.html)
const PUBLIC_KEYS = ['guestBookConfig'];

exports.handler = async (event) => {
  const k = String((event.queryStringParameters || {}).key || '');
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' };
  if (!PUBLIC_KEYS.includes(k)) return { statusCode: 404, headers, body: JSON.stringify({ error: 'not found' }) };
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server config error' }) };
  try {
    const r = await fetch(`https://vnttlpqkssihbmcynxvo.supabase.co/rest/v1/app_store?key=eq.${encodeURIComponent(k)}&select=value`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const [row] = r.ok ? await r.json() : [];
    return { statusCode: 200, headers, body: JSON.stringify({ value: row ? row.value : null }) };
  } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not load' }) }; }
};
