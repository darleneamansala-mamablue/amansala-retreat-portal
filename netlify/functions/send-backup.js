'use strict';
// send-backup.js — pg_cron calls this every day. It starts send-backup-background.js, which reads EVERY table of the
// database (app_store included) and emails it to Jorge as gzipped JSON (Jorge 2026-11-05). Background, because reading
// everything takes longer than a normal function may run.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const secret = process.env.BACKUP_SECRET;
  if (secret && (event.headers['x-backup-secret'] || '') !== secret) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  const site = process.env.URL || 'https://amansalaportal.com';
  const r = await fetch(`${site}/.netlify/functions/send-backup-background`, { method: 'POST', headers: secret ? { 'x-backup-secret': secret } : {} });
  return { statusCode: 200, body: JSON.stringify({ ok: r.status === 202 || r.ok, started: r.status }) };
};
