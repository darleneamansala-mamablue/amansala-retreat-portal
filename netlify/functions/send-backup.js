const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Verify secret so only pg_cron (or manual trigger) can call this
  const secret = process.env.BACKUP_SECRET;
  if (secret && (event.headers['x-backup-secret'] || '') !== secret) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const resendKey = process.env.RESEND_API_KEY;
  const supaKey  = process.env.SUPABASE_SERVICE_KEY;
  if (!resendKey || !supaKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing RESEND_API_KEY or SUPABASE_SERVICE_KEY' }) };
  }

  try {
    const hdrs = { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` };
    const get = async (table, select = '*') => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}`, { headers: hdrs });
      if (!r.ok) throw new Error(`${table} read failed: ${r.status}`);
      return r.json();
    };

    const [bookings, registrations, roomTypes, addOns, payments, transport] = await Promise.all([
      get('bookings'),
      get('registrations'),
      get('room_types'),
      get('add_ons'),
      get('payments'),
      get('transport'),
    ]);

    const dateStr = new Date().toISOString().slice(0, 10);
    const backup = {
      exportedAt:    new Date().toISOString(),
      source:        'auto-backup',
      bookings,
      registrations,
      roomTypes,
      addOns,
      payments,
      transport,
    };

    const jsonStr  = JSON.stringify(backup, null, 2);
    const base64   = Buffer.from(jsonStr).toString('base64');
    const bkCount  = bookings.length;
    const regCount = registrations.length;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Amansala <retreats@amansala.com>',
        to:   ['Jorge@amansala.com'],
        subject: `Amansala Backup — ${dateStr}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
            <div style="background:#1a2332;padding:20px;text-align:center;border-radius:8px 8px 0 0">
              <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:1px">AMANSALA</span>
            </div>
            <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
              <p style="color:#1a2332;font-size:15px">Backup automático del <strong>${dateStr}</strong></p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr style="background:#f9fafb"><td style="padding:8px 12px;color:#6b7280;font-size:13px">Retiros</td><td style="padding:8px 12px;font-weight:600;font-size:13px">${bkCount}</td></tr>
                <tr><td style="padding:8px 12px;color:#6b7280;font-size:13px">Registros de huéspedes</td><td style="padding:8px 12px;font-weight:600;font-size:13px">${regCount}</td></tr>
                <tr style="background:#f9fafb"><td style="padding:8px 12px;color:#6b7280;font-size:13px">Room types</td><td style="padding:8px 12px;font-weight:600;font-size:13px">${backup.roomTypes.length}</td></tr>
                <tr><td style="padding:8px 12px;color:#6b7280;font-size:13px">Pagos</td><td style="padding:8px 12px;font-weight:600;font-size:13px">${backup.payments.length}</td></tr>
              </table>
              <p style="color:#6b7280;font-size:12px">Archivo adjunto: <code>amansala-backup-${dateStr}.json</code></p>
            </div>
          </div>`,
        attachments: [{
          filename: `amansala-backup-${dateStr}.json`,
          content:  base64
        }]
      })
    });

    const emailData = await emailRes.json();
    if (!emailRes.ok) {
      console.error('[send-backup] Resend error:', emailData);
      return { statusCode: emailRes.status, body: JSON.stringify(emailData) };
    }

    console.log(`[send-backup] Backup sent for ${dateStr} — ${bkCount} retreats, ${regCount} regs`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, date: dateStr, retreats: bkCount, regs: regCount }) };

  } catch (err) {
    console.error('[send-backup] Exception:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
