'use strict';

// Visito AI "Tool" — lets Lana move an EXISTING spa appointment to a new
// date/time, instead of creating a duplicate appointment (and duplicate
// folio charge) when a guest just wants a different time. There's no
// "list my appointments" tool, so the guest's original appointment is
// identified by name (+ optionally room/date/time to disambiguate), the
// same way visito-spa-create-booking.js identifies the guest's stay.
//
// Same 12-hour cutoff as the guest self-cancellation flow in
// spa-booking.html (Jorge's policy 2026-09-26): a change made less than 12
// hours before the ORIGINAL appointment time is refused here so staff can
// handle it manually instead of Lana silently moving it too close to call.
//
// The price/charge is never touched — only date/start (and, optionally,
// therapist/room if the guest is also switching those) change. Call
// spa_check_availability first to get a valid newDate/newStart (and
// newTherapistId/newRoomId if switching) before calling this.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const SB_START_H = 10, SB_END_H = 19;

function hhmmToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function fmtDateLong(ds) { return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
function fmtT(t) { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + ap; }
function esc(s) { return (s || '').replace(/</g, '&lt;'); }
function norm(s) { return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

function therapistAcct(ther, staffAccounts) {
  if (!ther) return null;
  const full = ((ther.firstName || '') + ' ' + (ther.lastName || '')).trim().toLowerCase();
  const first = (ther.firstName || '').trim().toLowerCase();
  return staffAccounts.find(a => { const an = (a.name || '').trim().toLowerCase(); return an === full || an === first; }) || null;
}
function isTherapistAvailable(ther, date, period, staffAccounts) {
  const acct = therapistAcct(ther, staffAccounts);
  if (!acct) return true;
  const dateBlocks = (acct.unavailableDates || []).map(d => typeof d === 'string' ? { date: d, period: 'ALL' } : d);
  if (dateBlocks.some(b => b.date === date && (b.period === 'ALL' || !period || b.period === period))) return false;
  const rules = acct.dayOfWeekRules || [];
  const covering = rules.filter(r => date >= r.start && (!r.end || date <= r.end));
  if (covering.length) {
    const dow = new Date(date + 'T12:00:00').getDay();
    const blockHit = covering.find(r => r.mode === 'block' && r.days.includes(dow) && (!r.period || r.period === 'ALL' || !period || r.period === period));
    if (blockHit) return false;
    const onlyRules = covering.filter(r => r.mode !== 'block');
    if (onlyRules.length) {
      const matchingDayRule = onlyRules.find(r => r.days.includes(dow));
      if (!matchingDayRule) return false;
      if (matchingDayRule.period && matchingDayRule.period !== 'ALL' && period && matchingDayRule.period !== period) return false;
    }
  }
  return true;
}
function slotFree(therapistId, dateStr, startMin, duration, appts, excludeApptId, ther, staffAccounts) {
  const endMin = startMin + duration;
  if (ther && !isTherapistAvailable(ther, dateStr, startMin < 720 ? 'AM' : 'PM', staffAccounts)) return false;
  return !appts.some(a => {
    if (a.id === excludeApptId) return false;
    if (a.date !== dateStr || a.status === 'CANCELLED') return false;
    if (a.therapistId !== therapistId) return false;
    const aStart = hhmmToMin(a.start), aEnd = aStart + (a.duration || 60);
    return startMin < aEnd && endMin > aStart;
  });
}
function roomFree(roomId, dateStr, startMin, duration, appts, excludeApptId) {
  const endMin = startMin + duration;
  return !appts.some(a => a.id !== excludeApptId && a.date === dateStr && a.roomId === roomId && a.status !== 'CANCELLED'
    && startMin < hhmmToMin(a.start) + (a.duration || 60) && endMin > hhmmToMin(a.start));
}

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
    newDate, newStart, newTherapistId, newRoomId,
  } = payload.arguments || {};

  const missing = ['firstName', 'lastName', 'currentDate', 'newDate', 'newStart']
    .filter(f => !({ firstName, lastName, currentDate, newDate, newStart }[f]));
  if (missing.length) return ok({ success: false, message: `Me faltan estos datos: ${missing.join(', ')}. currentDate es la fecha de la cita que quiere cambiar el huésped.` });

  const clientName = `${firstName} ${lastName}`.trim();
  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  try {
    const [apRes, sdRes, scRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_appointments&select=value`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_data&select=value`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.staffConfirmAccounts&select=value`, { headers: hdrs }),
    ]);
    const [apRow] = apRes.ok ? await apRes.json() : [];
    const [sdRow] = sdRes.ok ? await sdRes.json() : [];
    const [scRow] = scRes.ok ? await scRes.json() : [];
    const appts = apRow?.value || [];
    const spaData = sdRow?.value || {};
    const staffAccounts = Array.isArray(scRow?.value) ? scRow.value : [];

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

    // Same 12-hour cutoff as guest self-cancellation — a change too close to
    // the ORIGINAL appointment time needs a human, not an automatic move.
    const origDateTime = new Date(appt.date + 'T' + appt.start + ':00-05:00');
    const hoursLeft = (origDateTime - new Date()) / 3600000;
    if (hoursLeft < 12) {
      return ok({ success: false, message: `Esa cita es en menos de 12 horas — ya no se puede cambiar de hora automáticamente. Avisa al equipo del spa para que lo ayuden directamente.` });
    }

    const svc = (spaData.services || []).find(s => s.id === appt.serviceId);
    const therapistId = newTherapistId || appt.therapistId;
    const ther = (spaData.therapists || []).find(t => t.id === therapistId);
    if (!ther) return ok({ success: false, message: 'No encontré al terapeuta para validar el nuevo horario — vuelve a llamar a spa_check_availability para obtener un therapistId válido.' });
    const roomId = newRoomId !== undefined ? newRoomId : appt.roomId;

    const startMin = hhmmToMin(newStart);
    if (startMin < SB_START_H * 60 || startMin + (appt.duration || 60) > SB_END_H * 60) {
      return ok({ success: false, message: `Ese horario está fuera del horario del spa (${SB_START_H}:00–${SB_END_H}:00).` });
    }
    if (!slotFree(therapistId, newDate, startMin, appt.duration || 60, appts, appt.id, ther, staffAccounts)) {
      return ok({ success: false, message: `${ther.firstName} ya no está disponible el ${newDate} a las ${fmtT(newStart)} — vuelve a llamar a spa_check_availability con serviceId "${appt.serviceId}" y la fecha ${newDate} para ver otras opciones.` });
    }
    if (svc?.roomRequired && roomId && !roomFree(roomId, newDate, startMin, appt.duration || 60, appts, appt.id)) {
      return ok({ success: false, message: `Ese cuarto de tratamiento ya está ocupado el ${newDate} a las ${fmtT(newStart)} — vuelve a llamar a spa_check_availability para ver otras opciones.` });
    }

    const HIST_FIELDS = ['date', 'start', 'therapistId', 'roomId'];
    if (!appt.originalDetails) {
      appt.originalDetails = {};
      HIST_FIELDS.forEach(f => { appt.originalDetails[f] = appt[f]; });
    }
    const before = { date: appt.date, start: appt.start, therapistId: appt.therapistId, roomId: appt.roomId };
    appt.date = newDate;
    appt.start = newStart;
    appt.therapistId = therapistId;
    appt.roomId = roomId;
    if (!appt.editHistory) appt.editHistory = [];
    appt.editHistory.push({
      at: new Date().toISOString(), by: 'Visito AI (auto)',
      changes: HIST_FIELDS.filter(f => (before[f] || '') !== (appt[f] || '')).map(f => ({ field: f, from: before[f] || '', to: appt[f] || '' })),
    });

    const latest = appts.map(a => a.id === appt.id ? appt : a);
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, {
      method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'spa_appointments', value: latest, updated_at: new Date().toISOString() }),
    });
    if (!upsertRes.ok) throw new Error('Could not save the appointment: ' + await upsertRes.text());

    const therName = `${ther.firstName} ${ther.lastName || ''}`.trim();
    try {
      const cancelUrl = `${process.env.URL || 'https://amansalaportal.com'}/spa-booking.html?cancel=${appt.id}`;
      const rows = [
        emailRow('Service', esc(svc?.name || '')), emailRow('New Date', fmtDateLong(newDate)), emailRow('New Time', fmtT(newStart)),
        emailRow('Therapist', esc(therName)),
      ].join('');
      const body = `<p style="font-size:15px;color:#374151;margin:0 0 24px">Hi ${esc(firstName)}, your spa appointment has been moved:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px">${rows}</table>
        <div style="text-align:center;margin:28px 0 4px;padding-top:20px;border-top:1px solid #f0ede8">
          <a href="${cancelUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:700">Cancel My Appointment</a>
        </div>
        <p style="font-size:12px;color:#6b7280;text-align:center;line-height:1.5;margin:12px 0 0">
          <strong>Cancellation policy:</strong> appointments may be cancelled free of charge up to 12 hours before the scheduled start time.
          Cancelling 12 hours or more in advance will remove the charge from your room folio.
          Cancelling less than 12 hours in advance will not remove the charge.
        </p>`;
      if (appt.email) {
        await fetch(`${process.env.URL || 'https://amansalaportal.com'}/.netlify/functions/send-email`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: appt.email, subject: 'Spa Appointment Updated — Amansala', html: emailShell('Your Spa Appointment Has Been Rescheduled', body) }),
        });
      }
      if (ther.email) {
        const therBody = `<p style="font-size:15px;color:#374151;margin:0 0 24px">Hi ${esc(ther.firstName)}, an appointment on your schedule was just moved:</p>
          <table width="100%" cellpadding="0" cellspacing="0">${emailRow('Client', esc(clientName))}${emailRow('Service', esc(svc?.name || ''))}${emailRow('New Date', fmtDateLong(newDate))}${emailRow('New Time', fmtT(newStart))}</table>`;
        await fetch(`${process.env.URL || 'https://amansalaportal.com'}/.netlify/functions/send-email`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: ther.email, subject: 'Appointment Rescheduled — Amansala Spa', html: emailShell('Appointment Rescheduled', therBody) }),
        });
      }
    } catch (emailErr) { console.warn('[visito-spa-reschedule-booking] email failed (non-fatal):', emailErr.message); }

    return ok({
      success: true,
      appointmentId: appt.id,
      newDate, newStart, therapistName: therName,
      message: `Cita movida al ${newDate} a las ${fmtT(newStart)} con ${therName}. Correo de confirmación enviado.`,
    });
  } catch (err) {
    console.error('[visito-spa-reschedule-booking]', err.message);
    return jsonErr(500, err.message);
  }
};

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: msg }) }; }
