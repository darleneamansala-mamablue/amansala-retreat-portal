'use strict';

// send-backup-background.js — the daily backup emailed to Jorge (Jorge 2026-11-05: "que llegue con todo... solo le de
// restore y todo este ahi"). It used to carry only bookings, registrations, room_types, add_ons, payments and transport,
// so when the spa settings (app_store 'spa_data') were wiped on 2026-11-05 the email could not bring them back. Now it is
// the whole system (backup-lib.js: every table, their primary keys, and the uploaded images), gzipped JSON, and the
// portal's Settings > Backup & Restore puts it back. A background function (up to 15 min): send-backup.js, which pg_cron
// calls, only starts it; restore-backup.js can start it too ("back up now").
const zlib = require('zlib');
const { buildBackup } = require('./backup-lib');

exports.handler = async (event) => {
  const secret = process.env.BACKUP_SECRET;
  if (secret && ((event.headers || {})['x-backup-secret'] || '') !== secret) return { statusCode: 401 };
  const resendKey = process.env.RESEND_API_KEY, supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!resendKey || !supaKey) { console.error('[send-backup] missing env'); return { statusCode: 500 }; }
  try {
    const { backup, counts, failed, images, imagesSkipped } = await buildBackup(supaKey);
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(backup)));
    const tables = Object.keys(counts).sort();
    const rowsHtml = tables.map((t, i) => `<tr${i % 2 ? '' : ' style="background:#f9fafb"'}><td style="padding:5px 12px;color:#6b7280;font-size:12.5px">${t}</td><td style="padding:5px 12px;font-weight:600;font-size:12.5px;text-align:right">${counts[t]}</td></tr>`).join('');
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Amansala <retreats@amansala.com>', to: ['Jorge@amansala.com'], subject: `Amansala Backup — ${dateStr}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
          <div style="background:#1a2332;padding:20px;text-align:center;border-radius:8px 8px 0 0"><span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:1px">AMANSALA</span></div>
          <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
            <p style="color:#1a2332;font-size:15px">Respaldo completo del <strong>${dateStr}</strong>: todo el sistema, ${tables.length} tablas de todos los módulos y ${images} imágenes.</p>
            <p style="color:#374151;font-size:13px">Para restaurar: Portal &gt; Settings &gt; <b>Backup &amp; Restore</b> y sube el archivo adjunto.</p>
            ${failed.length ? `<p style="color:#b91c1c;font-size:13px">No se pudieron leer: ${failed.join(', ')}</p>` : ''}
            ${imagesSkipped ? `<p style="color:#92400e;font-size:12.5px">${imagesSkipped} imágenes no cupieron en el correo (siguen guardadas en Supabase).</p>` : ''}
            <table style="width:100%;border-collapse:collapse;margin:12px 0">${rowsHtml}</table>
            <p style="color:#6b7280;font-size:12px">Archivo adjunto: <code>amansala-backup-${dateStr}.json.gz</code> (${(gz.length / 1048576).toFixed(1)} MB)</p>
          </div></div>`,
        attachments: [{ filename: `amansala-backup-${dateStr}.json.gz`, content: gz.toString('base64') }],
      }),
    });
    if (!emailRes.ok) console.error('[send-backup] Resend error:', emailRes.status, (await emailRes.text()).slice(0, 300));
    else console.log(`[send-backup] full backup sent ${dateStr}: ${tables.length} tables, ${images} images, ${(gz.length / 1048576).toFixed(1)} MB`);
  } catch (err) { console.error('[send-backup] Exception:', err); }
  return { statusCode: 200 };
};
