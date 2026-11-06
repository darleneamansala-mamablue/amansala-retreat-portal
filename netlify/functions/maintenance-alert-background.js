'use strict';
// maintenance-alert-background.js — sends a new maintenance report's WhatsApp to the team, outside the request that created it
// (Lana's action has 10 s; 11 WhatsApps one by one took longer -- MT-1004, 2026-11-06). Each report is alerted once
// (alertedAt), so calling this again for the same report sends nothing.
const M = require('./maintenance-lib');

exports.handler = async (event) => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  let id = ''; try { id = JSON.parse(event.body || '{}').id; } catch (e) {}
  if (!key || !id) return { statusCode: 202, body: '' };
  let ticket = null;
  await M.mutate(key, list => {
    const i = list.findIndex(t => t && t.id === id);
    if (i < 0 || list[i].alertedAt) return { abort: true };
    ticket = list[i] = { ...list[i], alertedAt: new Date().toISOString() };
    return { list };
  }).catch(() => {});
  if (!ticket) return { statusCode: 202, body: '' };
  const r = await M.alertMaintenance(key, ticket).catch(e => ({ error: e.message }));
  await M.mutate(key, list => ({ list: list.map(t => t && t.id === id ? { ...t, alert: r } : t) })).catch(() => {});
  console.log('[maintenance-alert]', id, JSON.stringify(r).slice(0, 300));
  return { statusCode: 202, body: '' };
};
