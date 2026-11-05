'use strict';

// send-backup-background.js — the daily backup emailed to Jorge (Jorge 2026-11-05: "que incluya todo"). It used to carry only
// bookings, registrations, room_types, add_ons, payments and transport, so when the spa settings (app_store 'spa_data':
// therapists, services, rooms) were wiped on 2026-11-05 the email could not bring them back. Now it is EVERY table of the
// database, app_store included (spa, settings, staff schedules...), gzipped JSON. A background function (up to 15 min):
// send-backup.js, which pg_cron calls, only starts it.
const zlib = require('zlib');
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const PAGE = 1000;

exports.handler = async (event) => {
  const secret = process.env.BACKUP_SECRET;
  if (secret && ((event.headers || {})['x-backup-secret'] || '') !== secret) return { statusCode: 401 };
  const resendKey = process.env.RESEND_API_KEY, supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!resendKey || !supaKey) { console.error('[send-backup] missing env'); return { statusCode: 500 }; }
  const H = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };
  try {
    // every table and view the API serves (its OpenAPI description)
    const spec = await (await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { ...H, Accept: 'application/openapi+json' } })).json();
    const tables = Object.keys(spec.definitions || {}).sort();
    const data = {}, counts = {}, failed = [];
    for (const t of tables) {
      const rows = [];
      try {
        const cols = Object.keys(((spec.definitions[t] || {}).properties) || {});
        const order = cols.includes('id') ? '&order=id' : cols.includes('key') ? '&order=key' : '';
        for (let off = 0; ; off += PAGE) {
          const r = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(t)}?select=*${order}&limit=${PAGE}&offset=${off}`, { headers: H });
          if (!r.ok) throw new Error(String(r.status));
          const page = await r.json();
          rows.push(...page);
          if (page.length < PAGE) break;
        }
        data[t] = rows; counts[t] = rows.length;
      } catch (e) { failed.push(`${t} (${e.message})`); }
    }
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
    const backup = { exportedAt: new Date().toISOString(), source: 'auto-backup-full', tables: data };
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(backup)));
    const rowsHtml = tables.filter(t => t in counts).map((t, i) => `<tr${i % 2 ? '' : ' style="background:#f9fafb"'}><td style="padding:5px 12px;color:#6b7280;font-size:12.5px">${t}</td><td style="padding:5px 12px;font-weight:600;font-size:12.5px;text-align:right">${counts[t]}</td></tr>`).join('');
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Amansala <retreats@amansala.com>', to: ['Jorge@amansala.com'], subject: `Amansala Backup — ${dateStr}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
          <div style="background:#1a2332;padding:20px;text-align:center;border-radius:8px 8px 0 0"><span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:1px">AMANSALA</span></div>
          <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
            <p style="color:#1a2332;font-size:15px">Backup automático completo del <strong>${dateStr}</strong>: ${Object.keys(counts).length} tablas, toda la base (incluye spa, settings y horarios).</p>
            ${failed.length ? `<p style="color:#b91c1c;font-size:13px">No se pudieron leer: ${failed.join(', ')}</p>` : ''}
            <table style="width:100%;border-collapse:collapse;margin:12px 0">${rowsHtml}</table>
            <p style="color:#6b7280;font-size:12px">Archivo adjunto: <code>amansala-backup-${dateStr}.json.gz</code> (${(gz.length / 1048576).toFixed(1)} MB comprimido)</p>
          </div></div>`,
        attachments: [{ filename: `amansala-backup-${dateStr}.json.gz`, content: gz.toString('base64') }],
      }),
    });
    if (!emailRes.ok) console.error('[send-backup] Resend error:', emailRes.status, (await emailRes.text()).slice(0, 300));
    else console.log(`[send-backup] full backup sent ${dateStr}: ${Object.keys(counts).length} tables, ${(gz.length / 1048576).toFixed(1)} MB`);
  } catch (err) { console.error('[send-backup] Exception:', err); }
  return { statusCode: 200 };
};
