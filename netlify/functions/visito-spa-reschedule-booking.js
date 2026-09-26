'use strict';

// Visito AI "Tool" — a guest asking Lana to change their spa appointment
// time is logged and routed to a human; Lana NEVER moves the appointment
// herself. Jorge's boss's ask 2026-09-26: "que siempre lo asigne a un
// humano y que el huésped no pueda hacerlo por si solo con visito... con
// eso se cometerían muchos menos errores" — this replaces an earlier
// version of this same tool that moved the appointment automatically.
//
// Still finds the guest's existing appointment (by name + its current
// date/time) so the request that reaches staff is concrete and
// unambiguous, not just "someone wants to change something." Emails the
// assigned therapist with the requested new date/time so a real person
// makes the actual change in the admin Spa Calendar (which still emails
// the guest once THEY move it — see spaNotifyGuestRescheduled in
// modules/spa-calendar.js). Nothing here ever writes to spa_appointments.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

function fmtDateLong(ds) { return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
function fmtT(t) { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + ap; }
function esc(s) { return (s || '').replace(/</g, '&lt;'); }
function norm(s) { return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

function emailShell(headline, bodyHtml) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f0ea;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0ea;padding:32px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <tr><td style="background:#2d6a6a;padding:28px 36px;text-align:center">
    <div style="font-size:11px;letter-spacing:.15em;color:#a7d7d7;text-transform:uppercase;margin-bottom:6px">Amansala Eco-Chic Resort + Retreat</div>
    <div style="font-size:22px;font-weight:700;color:#fff">${headline}</div>
  </td></tr>
  <tr><td style="padding:32px 36px">${bodyHtml}</td></tr>
  <tr><td style="background:#f5f0ea;padding:20px 36px;text-align:center;border-top:1px solid #e8e3dc">
    <p style="font-size:12px;color:#9ca3af;margin:0">Amansala Eco-Chic Resort · Tulum, México · retreats@amansala.com</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}
function emailRow(label, value) {
  return `<tr><td style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:13px;color:#6b7280;width:130px;vertical-align:top">${label}</td><td style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:14px;color:#1a2332;font-weight:500">${value}</td></tr>`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const expectedToken = process.env.VISITO_TOOL_SECRET;
  if (!expectedToken) return jsonErr(500, 'Server config error');
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  if (authHeader.replace(/^Bearer\s+/i, '').trim() !== expectedToken) return jsonErr(401, 'Unauthorized');

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const {
    firstName, lastName, roomNumber, currentDate, currentStart,
    requestedDate, requestedStart,
  } = payload.arguments || {};

  const missing = ['firstName', 'lastName', 'currentDate', 'requestedDate', 'requestedStart']
    .filter(f => !({ firstName, lastName, currentDate, requestedDate, requestedStart }[f]));
  if (missing.length) return ok({ success: false, message: `Me faltan estos datos: ${missing.join(', ')}. currentDate es la fecha de la cita que ya tiene el huésped.` });

  const clientName = `${firstName} ${lastName}`.trim();
  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  try {
    const [apRes, sdRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_appointments&select=value`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_data&select=value`, { headers: hdrs }),
    ]);
    const [apRow] = apRes.ok ? await apRes.json() : [];
    const [sdRow] = sdRes.ok ? await sdRes.json() : [];
    const appts = apRow?.value || [];
    const spaData = sdRow?.value || {};

    const nameKey = norm(clientName);
    const rnKey = norm(roomNumber);
    let matches = appts.filter(a => a.status !== 'CANCELLED' && norm(a.clientName) === nameKey && a.date === currentDate);
    if (currentStart) matches = matches.filter(a => a.start === currentStart);
    if (rnKey) {
      const roomFiltered = matches.filter(a => norm(a.roomNumber) === rnKey);
      if (roomFiltered.length) matches = roomFiltered;
    }

    if (!matches.length) {
      return ok({ success: false, message: `No encontré ninguna cita activa de "${clientName}" el ${currentDate}${currentStart ? ` a las ${currentStart}` : ''}. Confirma el nombre completo y la fecha/hora de la cita actual.` });
    }
    if (matches.length > 1) {
      return ok({ success: false, message: `Encontré más de una cita de "${clientName}" el ${currentDate} — pídele la hora exacta de la cita que quiere cambiar y vuelve a llamar con currentStart.` });
    }
    const appt = matches[0];
    const svc = (spaData.services || []).find(s => s.id === appt.serviceId);
    const ther = appt.therapistId ? (spaData.therapists || []).find(t => t.id === appt.therapistId) : null;

    // Best-effort notice to a human — never blocks the guest-facing response,
    // and never itself changes the appointment.
    try {
      if (ther?.email) {
        const rows = [
          emailRow('Client', esc(clientName)), emailRow('Service', esc(svc?.name || '')),
          emailRow('Current', `${fmtDateLong(appt.date)} at ${fmtT(appt.start)}`),
          emailRow('Requested', `${fmtDateLong(requestedDate)} at ${fmtT(requestedStart)}`),
          ...(appt.roomNumber ? [emailRow('Guest room', esc(appt.roomNumber))] : []),
        ].join('');
        const body = `<p style="font-size:15px;color:#374151;margin:0 0 24px">A guest asked our AI assistant to change the time of their appointment. This has NOT been changed yet — please confirm availability and update it directly in the Spa Calendar:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">${rows}</table>
          <p style="font-size:13px;color:#6b7280;margin-top:16px">Once you update it in the Spa Calendar, the guest is emailed automatically with the new time.</p>`;
        await fetch(`${process.env.URL || 'https://amansalaportal.com'}/.netlify/functions/send-email`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: ther.email, subject: 'Guest Requested a Time Change — Amansala Spa', html: emailShell('Time Change Requested', body) }),
        });
      }
    } catch (emailErr) { console.warn('[visito-spa-reschedule-booking] staff notice failed (non-fatal):', emailErr.message); }

    return ok({
      success: true,
      message: `Anota la solicitud y dile al huésped que NO se ha movido la cita todavía — nuestro equipo del spa confirma disponibilidad y hace el cambio directamente, y le llegará un correo de confirmación con la nueva hora en cuanto lo hagan. No intentes reservar una cita nueva ni llames a spa_create_booking para esto.`,
    });
  } catch (err) {
    console.error('[visito-spa-reschedule-booking]', err.message);
    return jsonErr(500, err.message);
  }
};

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: msg }) }; }
