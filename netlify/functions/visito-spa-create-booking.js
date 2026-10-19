'use strict';

// Visito AI "Tool" — lets Lana book a spa appointment end to end, with ZERO
// staff involvement: determines whether the guest is currently staying at
// the hotel (charges the service straight to their room folio, same as
// spa-booking.html's live flow) or is offsite (creates a Stripe Checkout
// Session and hands back a short payment link instead of spa-booking.html's
// current "our team will reach out to collect payment" — Jorge's ask
// 2026-09-23: "revise si es huésped que haga cargo a habitación o enviar
// stripe si es offsite").
//
// Mirrors spa-booking.html's sbFinalConfirm() as closely as possible so an
// appointment Lana creates is indistinguishable from one a guest books
// themselves: same spa_appointments row shape, same registrations.charges/
// bookings.charges posting, same confirmation + therapist-notification
// emails.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const STRIPE_API = 'https://api.stripe.com/v1';

// Posts a charge to the guest's OWN folio (folios/folio_items) -- the same
// tables modules/booking-detail.js's Rate and Folios section and
// modules/reservations.js's Balance column actually read. Charges posted
// straight to registrations.charges (the old way this function used to work)
// are invisible there and, worse, silently inflate the retreat's shared
// master balance (calcBkBalance in modules/payments.js) -- a per-guest spa
// charge should never touch that (Jorge's report 2026-09-26: Jay Z's spa
// charge "not showing up" in his folio). Mirrors auto-charge-transport.js's
// chargeFolio() helper.
async function chargeFolio(hdrs, { registrationId, guestName, description, unitPrice, category, serviceDate }) {
  let folioId = null;
  const exactRes = await fetch(`${SUPABASE_URL}/rest/v1/folios?select=id&registration_id=eq.${encodeURIComponent(registrationId)}&guest_name=eq.${encodeURIComponent(guestName)}&limit=1`, { headers: hdrs });
  const exact = exactRes.ok ? await exactRes.json() : [];
  if (exact.length) folioId = exact[0].id;
  else {
    const anyRes = await fetch(`${SUPABASE_URL}/rest/v1/folios?select=id&registration_id=eq.${encodeURIComponent(registrationId)}&status=eq.open&order=created_at.asc&limit=1`, { headers: hdrs });
    const any = anyRes.ok ? await anyRes.json() : [];
    if (any.length) folioId = any[0].id;
  }
  if (!folioId) {
    const token = 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/folios`, {
      method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ registration_id: registrationId, guest_name: guestName, name: guestName, payment_token: token, status: 'open' }),
    });
    if (!createRes.ok) return { error: 'folio_create_failed: ' + await createRes.text() };
    const [created] = await createRes.json();
    folioId = created?.id;
    if (!folioId) return { error: 'folio_created_no_id' };
  }

  const itemRes = await fetch(`${SUPABASE_URL}/rest/v1/folio_items`, {
    method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    // created_at = the service day (noon Tulum) so the folio's Date column shows
    // when the treatment was given, like Cloudbeds.
    body: JSON.stringify({ folio_id: folioId, description, qty: 1, unit_price: unitPrice, tax_rate: 13, category: category || null, ...(serviceDate ? { created_at: `${serviceDate}T17:00:00Z` } : {}) }),
  });
  if (!itemRes.ok) return { error: 'folio_item_failed: ' + await itemRes.text() };
  const [saved] = await itemRes.json();
  return { folioItemId: saved?.id, folioId };
}

function hhmmToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function fmtDateLong(ds) { return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
function fmtT(t) { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + ap; }
function esc(s) { return (s || '').replace(/</g, '&lt;'); }
function spaGroupPrice(s, n) {
  if (!s.groupPricing || !n || n < 1) return null;
  const gp = s.groupPricing;
  if (gp.belowMin && gp.belowMin[n] != null) return gp.belowMin[n];
  if (gp.flatFee != null) return gp.flatFee + Math.max(0, n - (gp.flatFeeMax || 0)) * (gp.perPersonUSD || 0);
  if (n >= gp.minGroup) return gp.perPersonUSD * n;
  return null;
}
function normName(s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function findGuestReg(regs, clientName, roomNumber) {
  const key = (clientName || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!key) return null;
  const rn = (roomNumber || '').toLowerCase().replace(/\s+/g, ' ').trim();
  let fallback = null;
  for (const reg of regs) {
    const idx = (reg.guests || []).findIndex(g => (g.name || '').toLowerCase().replace(/\s+/g, ' ').trim() === key);
    if (idx >= 0) {
      const match = { reg, guest: reg.guests[idx] };
      if (rn && (reg.room || '').toLowerCase().replace(/\s+/g, ' ').trim() === rn) return match;
      if (!fallback) fallback = match;
    }
  }
  return fallback;
}
function findGuestBooking(bookings, clientName, roomNumber) {
  const key = (clientName || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!key) return null;
  const rn = (roomNumber || '').toLowerCase().replace(/\s+/g, ' ').trim();
  let fallback = null;
  for (const bk of bookings) {
    if (bk.booking_type !== 'room_only') continue;
    if ((bk.leader_name || '').toLowerCase().replace(/\s+/g, ' ').trim() !== key) continue;
    const rooms = (bk.blocked_rooms || []).map(r => (r || '').toLowerCase().replace(/\s+/g, ' ').trim());
    if (rn && rooms.includes(rn)) return { bk };
    if (!fallback) fallback = { bk };
  }
  return fallback;
}

// ── Automatic therapist assignment (Darlene's spec 2026-10-15) ───────────────────
// Server-side port of spa-booking.html's sbIsTherapistAvailable/sbSlotFree/
// sbRotationOrder, so a guest booked via Lana ("no preference, please assign for
// me") gets the exact same treatment as one who books through the web page
// themselves. Keep both in sync if the rules or data shape ever change.
// `rot` (rotation settings) is read from app_store key 'spa_rotation_settings' --
// staff edit these in booking-hub.html's Spa > Auto-Assign screen (modules/
// spa-rotation-settings.js); this default is only ever used until they save that
// screen once.
const SPA_ROTATION_DEFAULTS = {
  femaleOrder: ['Laura', 'Laura', 'Gabby', 'Graciela'], femaleFallback: 'Rosario',
  malePrimary: 'Julian', malePrimaryCap: 4, maleSecondary: 'Miguel',
  noPreferenceFirst: 'male',
  mariaName: 'Maria Luisa', mariaStageSize: 2, mariaBreakMinutes: 45, mariaDailyCap: 4,
  generalBreakAfter: 3, generalBreakMinutes: 30, generalDailyCap: 7,
};

function therapistAcct(ther, staffAccounts) {
  const full = `${ther.firstName || ''} ${ther.lastName || ''}`.trim().toLowerCase();
  const first = (ther.firstName || '').trim().toLowerCase();
  return staffAccounts.find(a => { const an = (a.name || '').trim().toLowerCase(); return an === full || an === first; }) || null;
}
function isTherapistAvailable(ther, dateStr, period, staffAccounts) {
  const acct = therapistAcct(ther, staffAccounts);
  if (!acct) return true;
  const dateBlocks = (acct.unavailableDates || []).map(d => typeof d === 'string' ? { date: d, period: 'ALL' } : d);
  if (dateBlocks.some(b => b.date === dateStr && (b.period === 'ALL' || !period || b.period === period))) return false;
  const rules = acct.dayOfWeekRules || [];
  const covering = rules.filter(r => dateStr >= r.start && (!r.end || dateStr <= r.end));
  if (covering.length) {
    const dow = new Date(dateStr + 'T12:00:00').getDay();
    if (covering.find(r => r.mode === 'block' && r.days.includes(dow) && (!r.period || r.period === 'ALL' || !period || r.period === period))) return false;
    const onlyRules = covering.filter(r => r.mode !== 'block');
    if (onlyRules.length) {
      const matchingDayRule = onlyRules.find(r => r.days.includes(dow));
      if (!matchingDayRule) return false;
      if (matchingDayRule.period && matchingDayRule.period !== 'ALL' && period && matchingDayRule.period !== period) return false;
    }
  }
  return true;
}
// Mirrors sbSlotFree's per-therapist break/cap logic exactly (Maria Luisa's staged
// 2-then-45min-break-then-2, cap 4; everyone else: 30-min break after 3 consecutive
// back-to-back services, cap 7 unless staff set an explicit override on her profile).
function therapistSlotFree(ther, appts, dateStr, startMin, duration, staffAccounts, rot) {
  if (!isTherapistAvailable(ther, dateStr, startMin < 720 ? 'AM' : 'PM', staffAccounts)) return false;
  const todaysSorted = appts.filter(a => a.date === dateStr && a.status !== 'CANCELLED' && a.therapistId === ther.id).sort((a, b) => hhmmToMin(a.start) - hhmmToMin(b.start));
  let brk = 0;
  if ((ther.firstName || '').trim() === rot.mariaName) {
    if (todaysSorted.length >= rot.mariaDailyCap) return false;
    if (todaysSorted.length === rot.mariaStageSize) {
      const last = todaysSorted[todaysSorted.length - 1];
      if (startMin < hhmmToMin(last.start) + (last.duration || 60) + rot.mariaBreakMinutes) return false;
    }
  } else {
    const cap = parseInt(ther.maxServicesPerDay, 10) || rot.generalDailyCap;
    if (todaysSorted.length >= cap) return false;
    let consecutive = 0, cursorEnd = startMin;
    for (let i = todaysSorted.length - 1; i >= 0; i--) {
      const aStart = hhmmToMin(todaysSorted[i].start), aEnd = aStart + (todaysSorted[i].duration || 60);
      if (aEnd === cursorEnd) { consecutive++; cursorEnd = aStart; } else break;
    }
    const explicitBreak = Math.max(0, parseInt(ther.breakMinutes, 10) || 0);
    brk = explicitBreak || (consecutive >= rot.generalBreakAfter ? rot.generalBreakMinutes : 0);
  }
  const endMin = startMin + duration;
  return !appts.some(a => {
    if (a.date !== dateStr || a.status === 'CANCELLED') return false;
    if (a.therapistId !== ther.id) return false;
    const aStart = hhmmToMin(a.start), aEnd = aStart + (a.duration || 60);
    return startMin < aEnd + brk && endMin + brk > aStart;
  });
}
function resolveRoom(spaData, ther, svc, appts, dateStr, startMin, duration) {
  if (!svc.roomRequired) return null;
  const endMin = startMin + duration;
  const freeRooms = (spaData.rooms || []).filter(r => !appts.some(a => a.date === dateStr && a.roomId === r.id && a.status !== 'CANCELLED' && startMin < hhmmToMin(a.start) + (a.duration || 60) && endMin > hhmmToMin(a.start)));
  if (!freeRooms.length) return undefined; // no room at all -- candidate is not actually bookable
  const home = ther.defaultRoomId && freeRooms.find(r => r.id === ther.defaultRoomId);
  return (home || freeRooms[0]).id;
}
// Named priority order — identical rules to spa-booking.html's sbRotationOrder():
// female: Laura×2, Gabby, Graciela, repeat; Rosario only as last resort.
// male: Julian until 4/day, then alternates with Miguel.
// "No gender preference" tries the male rotation first (Jorge's confirmation
// 2026-10-15), falling through to the female rotation, then to a generic
// least-busy-first fallback, so a booking is never left unfilled.
function rotationOrder(appts, dateStr, genderPreference, rot) {
  const apptsToday = appts.filter(a => a.date === dateStr && a.status !== 'CANCELLED');
  const maleBlock = () => {
    const primaryToday = apptsToday.filter(a => a.rotationGroup === 'male' && a.rotationName === rot.malePrimary).length;
    const totalMale = apptsToday.filter(a => a.rotationGroup === 'male').length;
    if (primaryToday < rot.malePrimaryCap) return [{ name: rot.malePrimary, group: 'male' }, { name: rot.maleSecondary, group: 'male' }];
    const alt = totalMale - primaryToday;
    return [{ name: alt % 2 === 0 ? rot.maleSecondary : rot.malePrimary, group: 'male' }, { name: alt % 2 === 0 ? rot.malePrimary : rot.maleSecondary, group: 'male' }];
  };
  const femaleBlock = () => {
    const totalFemale = apptsToday.filter(a => a.rotationGroup === 'female').length;
    const pattern = rot.femaleOrder;
    const primary = pattern[totalFemale % pattern.length];
    const out = [primary, ...pattern.filter(n => n !== primary)].map(n => ({ name: n, group: 'female' }));
    out.push({ name: rot.femaleFallback, group: 'female' });
    return out;
  };
  if (genderPreference === 'female') return femaleBlock();
  if (genderPreference === 'male') return maleBlock();
  return rot.noPreferenceFirst === 'female' ? [...femaleBlock(), ...maleBlock()] : [...maleBlock(), ...femaleBlock()];
}
function pickTherapistByRotation(spaData, appts, staffAccounts, svc, dateStr, startMin, genderPreference, rot) {
  let eligible = (spaData.therapists || []).filter(t => t.active && (t.services || []).some(s => s.serviceId === svc.id));
  if (svc.fixedTherapistId) { const fixed = eligible.filter(t => t.id === svc.fixedTherapistId); if (fixed.length) eligible = fixed; }
  if (genderPreference === 'female' || genderPreference === 'male') eligible = eligible.filter(t => t.gender === genderPreference);

  for (const r of rotationOrder(appts, dateStr, genderPreference, rot)) {
    const ther = eligible.find(t => (t.firstName || '').trim() === r.name);
    if (!ther) continue;
    if (!therapistSlotFree(ther, appts, dateStr, startMin, svc.duration, staffAccounts, rot)) continue;
    const roomId = resolveRoom(spaData, ther, svc, appts, dateStr, startMin, svc.duration);
    if (roomId === undefined) continue; // room required but none free
    return { therapist: ther, roomId, rotationGroup: r.group, rotationName: r.name };
  }
  // Nobody from either named rotation is eligible/free (e.g. only a specialist like
  // Eva qualifies for this service) — fall back to least-busy-first among everyone
  // else eligible, rather than leaving the booking unfilled.
  const free = eligible.filter(t => therapistSlotFree(t, appts, dateStr, startMin, svc.duration, staffAccounts, rot));
  const withRoom = free.map(t => ({ t, roomId: resolveRoom(spaData, t, svc, appts, dateStr, startMin, svc.duration) })).filter(x => x.roomId !== undefined);
  if (!withRoom.length) return null;
  const liveCount = t => appts.filter(a => a.therapistId === t.id && a.status !== 'CANCELLED').length;
  withRoom.sort((a, b) => liveCount(a.t) - liveCount(b.t) || String(a.t.firstName).localeCompare(String(b.t.firstName)));
  return { therapist: withRoom[0].t, roomId: withRoom[0].roomId, rotationGroup: null, rotationName: null };
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
    firstName, lastName, email, phone, guestType, roomNumber,
    serviceId, date, start, therapistId, roomId, guestCount, genderPreference,
  } = payload.arguments || {};

  const missing = ['firstName', 'lastName', 'email', 'phone', 'guestType', 'serviceId', 'date', 'start']
    .filter(f => !({ firstName, lastName, email, phone, guestType, serviceId, date, start }[f]));
  if (missing.length) return ok({ success: false, message: `Me faltan estos datos: ${missing.join(', ')}.` });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ok({ success: false, message: 'El correo no parece válido.' });
  if (guestType !== 'hotel' && guestType !== 'offsite') return ok({ success: false, message: 'guestType debe ser "hotel" u "offsite".' });

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };
  const clientName = `${firstName} ${lastName}`.trim();

  try {
    const [sdRes, apRes, scRes, rotRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_data&select=value`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_appointments&select=value`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.staffConfirmAccounts&select=value`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_rotation_settings&select=value`, { headers: hdrs }),
    ]);
    const [sdRow] = sdRes.ok ? await sdRes.json() : [];
    const spaData = sdRow?.value || {};
    const svc = (spaData.services || []).find(s => s.id === serviceId && s.active);
    if (!svc) return ok({ success: false, message: 'No encontré ese servicio — vuelve a llamar a spa_list_services.' });

    const [apRow] = apRes.ok ? await apRes.json() : [];
    const appts = apRow?.value || [];
    const [scRow] = scRes.ok ? await scRes.json() : [];
    const staffAccounts = scRow?.value || [];
    const [rotRow] = rotRes.ok ? await rotRes.json() : [];
    const rot = { ...SPA_ROTATION_DEFAULTS, ...(rotRow?.value || {}) };
    const startMin = hhmmToMin(start), endMin0 = startMin + svc.duration;

    let ther = null, resolvedRoomId = roomId || null, rotationGroup = null, rotationName = null;
    if (therapistId) {
      ther = (spaData.therapists || []).find(t => t.id === therapistId);
      if (!ther) return ok({ success: false, message: 'No encontré ese terapeuta — vuelve a llamar a spa_check_availability para obtener un therapistId válido.' });
    } else {
      // "No preference — please assign for me" (Darlene's spec 2026-10-15): same named
      // rotation as the guest booking page (spa-booking.html's sbRotationOrder), so a
      // guest booked through Lana gets picked the exact same way one booked themselves
      // would. Shares the SAME spa_appointments rows (rotationGroup/rotationName), so
      // whichever channel books first, the other's rotation count is still accurate.
      const pick = pickTherapistByRotation(spaData, appts, staffAccounts, svc, date, startMin, genderPreference, rot);
      if (!pick) return ok({ success: false, message: 'No hay terapeutas disponibles para ese servicio a esa hora — prueba otra hora o fecha.' });
      ther = pick.therapist; resolvedRoomId = pick.roomId; rotationGroup = pick.rotationGroup; rotationName = pick.rotationName;
    }

    // Re-verify the slot is still free right before writing — same
    // conflict check as sbFinalConfirm's revalidation.
    const endMin = endMin0;
    const conflict = appts.some(a => {
      if (a.date !== date || a.status === 'CANCELLED') return false;
      if (a.therapistId !== ther.id) return false;
      const aStart = hhmmToMin(a.start), aEnd = aStart + (a.duration || 60);
      return startMin < aEnd && endMin > aStart;
    });
    if (conflict) return ok({ success: false, message: 'Justo se acaba de ocupar ese horario — vuelve a llamar a spa_check_availability para ver opciones actuales.' });

    const priceUSD = svc.groupPricing ? spaGroupPrice(svc, Math.max(1, parseInt(guestCount) || svc.groupPricing.minGuests || 1)) : svc.price;
    if (priceUSD == null) return ok({ success: false, message: 'No pude calcular el precio para ese número de invitados — pregúntale al huésped un número distinto o avisa al equipo.' });

    const isHotel = guestType === 'hotel';
    let stayStart = null, stayEnd = null, regMatch = null, bkMatch = null, matchedRoomNumber = roomNumber || null;
    if (isHotel) {
      const [regRes, bkRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/registrations?select=id,booking_id,room,guests,charges`, { headers: hdrs }),
        fetch(`${SUPABASE_URL}/rest/v1/bookings?select=id,leader_name,booking_type,blocked_rooms,charges,start_date,end_date`, { headers: hdrs }),
      ]);
      const regsAll = regRes.ok ? await regRes.json() : [];
      const bookingsAll = bkRes.ok ? await bkRes.json() : [];

      // Only ever match against a stay that actually covers the appointment
      // date -- matching a name against a past or future stay is how you'd
      // charge (or fail to charge) the wrong person.
      const activeBookings = bookingsAll.filter(b => b.start_date && b.end_date && date >= b.start_date && date <= b.end_date);
      const activeBookingIds = new Set(activeBookings.map(b => b.id));
      const activeRegs = regsAll.filter(r => activeBookingIds.has(r.booking_id));
      const activeRoomOnlyBookings = activeBookings.filter(b => b.booking_type === 'room_only');

      if (roomNumber) {
        regMatch = findGuestReg(activeRegs, clientName, roomNumber);
        bkMatch = !regMatch ? findGuestBooking(activeRoomOnlyBookings, clientName, roomNumber) : null;
      } else {
        // Name-only: auto-match the room if there's exactly one guest with
        // this name staying right now; otherwise ask instead of guessing.
        const regNameMatches = activeRegs.filter(r => (r.guests || []).some(g => normName(g.name) === normName(clientName)));
        const bkNameMatches = activeRoomOnlyBookings.filter(b => normName(b.leader_name) === normName(clientName));
        const totalMatches = regNameMatches.length + bkNameMatches.length;
        if (totalMatches > 1) {
          return ok({ success: false, needsRoomNumber: true, message: `Hay más de un huésped registrado con el nombre "${clientName}" — pídele su número de cuarto para confirmar a quién cobrar y vuelve a llamar con roomNumber.` });
        }
        if (regNameMatches.length === 1) {
          const reg = regNameMatches[0];
          regMatch = { reg, guest: (reg.guests || []).find(g => normName(g.name) === normName(clientName)) };
        } else if (bkNameMatches.length === 1) {
          bkMatch = { bk: bkNameMatches[0] };
        }
      }

      if (!regMatch && !bkMatch) {
        return ok({ success: false, message: `No encontré a "${clientName}" como huésped con estancia activa el ${date}${roomNumber ? ` en el cuarto ${roomNumber}` : ''}. Confirma el nombre completo (como está en la reservación) ${roomNumber ? 'y el número de cuarto' : 'o pídele su número de cuarto'}.` });
      }

      matchedRoomNumber = roomNumber || (regMatch ? regMatch.reg.room : (bkMatch.bk.blocked_rooms || [])[0]) || null;
      const parentBk = regMatch ? activeBookings.find(b => b.id === regMatch.reg.booking_id) : bkMatch.bk;
      if (parentBk?.start_date && parentBk?.end_date) { stayStart = parentBk.start_date; stayEnd = parentBk.end_date; }
      if ((stayStart && date < stayStart) || (stayEnd && date > stayEnd)) {
        return ok({ success: false, message: `Esa fecha está fuera de la estancia del huésped (${stayStart} – ${stayEnd}) — pídele una fecha dentro de su estadía.` });
      }
    }

    const apptId = 'ap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const appt = {
      id: apptId,
      clientName, guestType, sessionType: svc.sessionType || 'individual',
      email, phone, roomNumber: matchedRoomNumber,
      serviceId, therapistId: ther.id, roomId: resolvedRoomId,
      date, start, duration: svc.duration,
      status: isHotel ? 'CONFIRMED' : 'PAYMENT_PENDING',
      paymentStatus: isHotel ? 'NOT_REQUIRED' : 'PENDING',
      folioStatus: isHotel ? 'PENDING' : 'NOT_REQUIRED',
      therapistPreference: therapistId ? { type: 'specific', requestedTherapistId: therapistId } : { type: genderPreference === 'female' || genderPreference === 'male' ? genderPreference : 'none', requestedTherapistId: null },
      // Set only when auto-picked via the named rotation (not a guest's "specific therapist"
      // request) -- mirrors spa-booking.html's sbRotationOrder()/rotationGroup exactly, and
      // both read/write the SAME spa_appointments rows, so the rotation count is shared and
      // accurate regardless of whether the guest booked via Lana or the web page themselves.
      rotationGroup, rotationName,
      source: 'guest_booking',
      guestCount: svc.groupPricing ? (parseInt(guestCount) || svc.groupPricing.minGuests || 1) : null,
      groupTotalPriceUSD: svc.groupPricing ? priceUSD : null,
      notes: svc.groupPricing ? `${parseInt(guestCount) || svc.groupPricing.minGuests || 1} guests · $${priceUSD} USD total` : '',
      createdAt: new Date().toISOString(),
    };

    let folioPosted = false;
    const therName = `${ther.firstName} ${ther.lastName || ''}`.trim();
    if (isHotel) {
      const category = /massage/i.test(svc.name) ? 'Massage' : 'Spa';
      try {
        if (regMatch) {
          const { folioItemId, error } = await chargeFolio(hdrs, {
            registrationId: regMatch.reg.id, guestName: clientName,
            description: therName ? `${therName} - ${svc.name}` : svc.name, serviceDate: date, unitPrice: priceUSD, category,
          });
          if (folioItemId) { appt.folioStatus = 'POSTED'; appt.folioChargeId = folioItemId; appt.folioRegId = regMatch.reg.id; folioPosted = true; }
          else console.warn('[visito-spa-create-booking] folio charge failed:', error);
        } else if (bkMatch) {
          // Legacy fallback for a room_only booking somehow still without a
          // registrations row (pre-2026-09-25 bookings that never got
          // backfilled) -- folios has no generic booking_id anchor, so this
          // one path still posts to bookings.charges rather than a folio.
          const chargeId = 'chg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
          const charge = { id: chargeId, date, category, description: svc.name, amount: priceUSD, guestName: clientName, therapistName: therName, therapistId: ther.id, addedAt: new Date().toISOString(), addedBy: 'Visito AI (auto)', source: 'spa' };
          const newCharges = [...(bkMatch.bk.charges || []), charge];
          const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${bkMatch.bk.id}`, {
            method: 'PATCH', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ charges: newCharges }),
          });
          if (patchRes.ok) { appt.folioStatus = 'POSTED'; appt.folioChargeId = chargeId; appt.folioBkId = bkMatch.bk.id; folioPosted = true; }
          else console.warn('[visito-spa-create-booking] bookings charge PATCH failed:', await patchRes.text());
        }
      } catch (chErr) { console.warn('[visito-spa-create-booking] folio post failed (non-fatal):', chErr.message); }
    }

    // Offsite: create a Stripe Checkout Session + short payment link instead
    // of leaving it for staff to chase down manually (Jorge's ask).
    let paymentUrl = null;
    if (!isHotel) {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) return jsonErr(500, 'Stripe not configured');
      const siteUrl = process.env.URL || 'https://amansalaportal.com';
      // Base price + 13% tax as TWO separate line items -- same tax the hotel
      // folio path already adds (chargeFolio's tax_rate:13) -- so the offsite
      // Stripe charge actually matches what's quoted instead of silently
      // charging the base price alone with no tax (Jorge's report 2026-10-13:
      // the text Lana sends should say "$X + tax", and what's actually charged
      // at payment needs to show and be that same "$X + tax" breakdown, not a
      // single inclusive number nor a tax-free charge).
      const amountCents = Math.round(priceUSD * 100);
      const taxCents = Math.round(priceUSD * 0.13 * 100);
      if (amountCents >= 50) {
        const params = new URLSearchParams({
          mode: 'payment',
          success_url: `${siteUrl}/?visito_spa=success`,
          cancel_url: `${siteUrl}/?visito_spa=cancelled`,
          customer_email: email,
          'line_items[0][price_data][currency]': 'usd',
          'line_items[0][price_data][product_data][name]': `Amansala Spa · ${svc.name} · ${date} ${start}`.slice(0, 250),
          'line_items[0][price_data][unit_amount]': String(amountCents),
          'line_items[0][quantity]': '1',
          'line_items[1][price_data][currency]': 'usd',
          'line_items[1][price_data][product_data][name]': 'Tax (13%)',
          'line_items[1][price_data][unit_amount]': String(taxCents),
          'line_items[1][quantity]': '1',
          'payment_intent_data[metadata][source]': 'visito_spa',
          'payment_intent_data[metadata][apptId]': apptId,
          'payment_intent_data[metadata][serviceName]': svc.name.slice(0, 200),
          'payment_intent_data[metadata][clientName]': clientName.slice(0, 100),
        });
        const csRes = await fetch(`${STRIPE_API}/checkout/sessions`, {
          method: 'POST', headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' }, body: params.toString(),
        });
        const cs = await csRes.json();
        if (cs.error) { console.warn('[visito-spa-create-booking] Stripe error (non-fatal):', cs.error.message); }
        else {
          paymentUrl = cs.url;
          try {
            const shortId = Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
            const slRes = await fetch(`${SUPABASE_URL}/rest/v1/payment_shortlinks`, {
              method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ id: shortId, target_url: cs.url }),
            });
            if (slRes.ok) paymentUrl = `https://amansalaportal.com/pay/${shortId}`;
          } catch (slErr) { console.warn('[visito-spa-create-booking] shortlink failed (non-fatal):', slErr.message); }
        }
      }
    }

    // Write the appointment last, once payment link (if any) is ready.
    // Compare-and-swap append (Darlene 2026-10-19): re-read the saved list right now and add ONLY this appointment, writing it back only if
    // updated_at is unchanged since we read it; if someone else saved in between, re-read and redo. Never overwrites with an older copy.
    let saved = false, lastErr = '';
    for (let i = 0; i < 12 && !saved; i++) {
      const gr = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_appointments&select=value,updated_at`, { headers: hdrs });
      if (!gr.ok) { lastErr = 'read ' + gr.status; await new Promise((r) => setTimeout(r, 400)); continue; }
      const [row] = await gr.json();
      const cur = row && Array.isArray(row.value) ? row.value : [];
      const next = cur.some((a) => a.id === appt.id) ? cur : [...cur, appt];
      if (row) {
        const pr = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_appointments&updated_at=eq.${encodeURIComponent(row.updated_at)}`, {
          method: 'PATCH', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ value: next, updated_at: new Date().toISOString() }),
        });
        if (!pr.ok) { lastErr = 'write ' + pr.status + ' ' + (await pr.text()).slice(0, 120); await new Promise((r) => setTimeout(r, 400)); continue; }
        const done = await pr.json();
        if (Array.isArray(done) && done.length) saved = true; else await new Promise((r) => setTimeout(r, 80 + Math.random() * 220));
      } else {
        const ir = await fetch(`${SUPABASE_URL}/rest/v1/app_store`, { method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ key: 'spa_appointments', value: next, updated_at: new Date().toISOString() }) });
        if (ir.ok) saved = true; else lastErr = 'insert ' + ir.status;
      }
    }
    if (!saved) throw new Error('Could not save the appointment: ' + lastErr);

    // Confirmation + therapist-notification emails (best-effort, non-fatal).
    const roomLoc = (spaData.rooms || []).find(r => r.id === roomId);
    const meetAt = roomLoc ? (roomLoc.location ? `${roomLoc.name} — ${roomLoc.location}` : roomLoc.name) : 'Our spa reception';
    try {
      const rows = [
        emailRow('Service', esc(svc.name)), emailRow('Date', fmtDateLong(date)), emailRow('Time', fmtT(start)),
        emailRow('Therapist', esc(therName)), emailRow('Meet at', esc(meetAt)),
        ...(matchedRoomNumber ? [emailRow('Your room', esc(matchedRoomNumber))] : []),
        ...(folioPosted ? [emailRow('Payment', 'Charged to your room folio')] : []),
        // Offsite guests pay via the Stripe link below, which itself shows this
        // same base+tax breakdown as two line items -- state it here too so the
        // email and the actual charge always agree (Jorge's report 2026-10-13).
        ...(!isHotel ? [emailRow('Price', `$${priceUSD.toFixed(2)} + 13% tax = $${(priceUSD * 1.13).toFixed(2)} USD`)] : []),
      ].join('');
      const payBlock = paymentUrl
        ? `<div style="text-align:center;margin:24px 0"><a href="${paymentUrl}" style="display:inline-block;background:#0e9494;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:700">Pay for Your Appointment</a></div><p style="font-size:12.5px;color:#6b7280;text-align:center">Or copy this link: ${paymentUrl}</p>`
        : (!isHotel ? '<p style="font-size:13.5px;color:#374151">Our team will follow up shortly to collect payment.</p>' : '');
      const cancelUrl = `${process.env.URL || 'https://amansalaportal.com'}/spa-booking.html?cancel=${apptId}`;
      const cancelBlock = `<div style="text-align:center;margin:28px 0 4px;padding-top:20px;border-top:1px solid #f0ede8">
        <a href="${cancelUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:700">Cancel My Appointment</a>
      </div>
      <p style="font-size:12px;color:#6b7280;text-align:center;line-height:1.5;margin:12px 0 0">
        <strong>Cancellation policy:</strong> appointments may be cancelled free of charge up to 12 hours before the scheduled start time.
        Cancelling 12 hours or more in advance will remove the charge from your room folio.
        Cancelling less than 12 hours in advance will not remove the charge.
      </p>`;
      const body = `<p style="font-size:15px;color:#374151;margin:0 0 24px">Hi ${esc(firstName)}, you're booked! Here are your appointment details:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px">${rows}</table>
        ${payBlock}
        ${cancelBlock}`;
      await fetch(`${process.env.URL || 'https://amansalaportal.com'}/.netlify/functions/send-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, subject: 'Spa Appointment Confirmed — Amansala', html: emailShell('Your Spa Appointment is Confirmed', body) }),
      });
      if (ther.email) {
        const therBody = `<p style="font-size:15px;color:#374151;margin:0 0 24px">Hi ${esc(ther.firstName)}, a new appointment was just booked with you:</p>
          <table width="100%" cellpadding="0" cellspacing="0">${emailRow('Client', esc(clientName))}${emailRow('Service', esc(svc.name))}${emailRow('Date', fmtDateLong(date))}${emailRow('Time', fmtT(start))}</table>
          <p style="font-size:13.5px;color:#6b7280;margin:20px 0 0">It's on your schedule.</p>`;
        await fetch(`${process.env.URL || 'https://amansalaportal.com'}/.netlify/functions/send-email`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: ther.email, subject: 'New Appointment — Amansala Spa', html: emailShell('New Appointment Booked', therBody) }),
        });
      }
    } catch (emailErr) { console.warn('[visito-spa-create-booking] email failed (non-fatal):', emailErr.message); }

    // Jorge's report 2026-10-13/2026-10-15: Lana's confirmation message was saying just
    // "Precio: $95 USD" (the base price, from priceUSD below) with no mention of the 13%
    // tax that's actually added at payment -- even after visito-spa-check-availability.js /
    // visito-spa-list-services.js already got a tax-aware priceDisplay field, this booking-
    // creation response (what Lana actually echoes right after booking) didn't have one.
    // Offsite guests only: a hotel guest's price is charged to their folio, not quoted here.
    const taxRatePct = !isHotel ? 13 : undefined;
    const priceDisplay = !isHotel ? `$${priceUSD} USD + 13% tax` : undefined;
    return ok({
      success: true,
      appointmentId: apptId,
      serviceName: svc.name, therapistName: therName, date, start, durationMinutes: svc.duration,
      priceUSD, taxRatePct, priceDisplay, guestType, folioPosted, roomNumber: matchedRoomNumber,
      paymentUrl,
      message: isHotel
        ? `Cita creada y cargada al cuarto ${matchedRoomNumber || ''} (${clientName}). Correo de confirmación enviado.`
        : (paymentUrl
          ? `Cita creada — comparte este link de pago con el huésped para confirmarla (precio: ${priceDisplay}, también se le mandó por correo): ${paymentUrl}`
          : `Cita creada, pero no se pudo generar el link de pago automático — avísale al equipo que necesita cobrarle a ${clientName} (precio: ${priceDisplay}) manualmente.`),
    });
  } catch (err) {
    console.error('[visito-spa-create-booking]', err.message);
    return jsonErr(500, err.message);
  }
};

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: msg }) }; }
