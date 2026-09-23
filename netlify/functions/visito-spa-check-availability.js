'use strict';

// Visito AI "Tool" — lets Lana check real spa appointment availability.
// Ports spa-booking.html's exact slot-finding logic (sbEligibleTherapists,
// sbIsTherapistAvailable, sbSlotFree, sbAllFreeAssignments) server-side —
// same 30-min grid between 10:00–19:00, same therapist day-of-week/
// unavailable-date rules (from staffConfirmAccounts), same room-conflict
// checks for services that require a treatment room — so a slot Lana offers
// a guest is always actually bookable.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const SB_START_H = 10, SB_END_H = 19;

function hhmmToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minToHHMM(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

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
function slotFree(therapistId, dateStr, startMin, duration, appts, ther, staffAccounts) {
  const endMin = startMin + duration;
  if (ther && !isTherapistAvailable(ther, dateStr, startMin < 720 ? 'AM' : 'PM', staffAccounts)) return false;
  return !appts.some(a => {
    if (a.date !== dateStr || a.status === 'CANCELLED') return false;
    if (a.therapistId !== therapistId) return false;
    const aStart = hhmmToMin(a.start), aEnd = aStart + (a.duration || 60);
    return startMin < aEnd && endMin > aStart;
  });
}
function roomFree(roomId, dateStr, startMin, duration, appts) {
  const endMin = startMin + duration;
  return !appts.some(a => a.date === dateStr && a.roomId === roomId && a.status !== 'CANCELLED'
    && startMin < hhmmToMin(a.start) + (a.duration || 60) && endMin > hhmmToMin(a.start));
}
// Mirrors sbAllFreeAssignments — every eligible+free therapist at this exact
// time (not just one auto-pick), each paired with their own dedicated room
// first before falling back to any other free room.
function allFreeAssignments(candidates, dateStr, startMin, duration, svc, appts, rooms, staffAccounts) {
  const free = candidates.filter(t => slotFree(t.id, dateStr, startMin, duration, appts, t, staffAccounts));
  if (!free.length) return [];
  if (!svc.roomRequired) return free.map(t => ({ therapist: t, room: null }));
  const freeRooms = rooms.filter(r => roomFree(r.id, dateStr, startMin, duration, appts));
  if (!freeRooms.length) return [];
  const dedicatedRoomIds = new Set(candidates.map(t => t.defaultRoomId).filter(Boolean));
  const usedRoomIds = new Set();
  const out = [];
  free.forEach(t => {
    const home = t.defaultRoomId && freeRooms.find(r => r.id === t.defaultRoomId);
    if (home) { out.push({ therapist: t, room: home }); usedRoomIds.add(home.id); }
  });
  free.forEach(t => {
    if (out.some(o => o.therapist.id === t.id)) return;
    const room = freeRooms.find(r => !usedRoomIds.has(r.id) && !dedicatedRoomIds.has(r.id)) || freeRooms.find(r => !usedRoomIds.has(r.id));
    if (room) { out.push({ therapist: t, room }); usedRoomIds.add(room.id); }
  });
  return out;
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

  const { serviceId, date, therapistPreference, guestCount } = payload.arguments || {};
  if (!serviceId || !date) return ok({ success: false, message: 'Necesito serviceId (de spa_list_services) y la fecha (date) para revisar disponibilidad.' });

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  try {
    const [sdRes, apRes, scRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_data&select=value`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_appointments&select=value`, { headers: hdrs }),
      fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.staffConfirmAccounts&select=value`, { headers: hdrs }),
    ]);
    const [sdRow] = sdRes.ok ? await sdRes.json() : [];
    const [apRow] = apRes.ok ? await apRes.json() : [];
    const [scRow] = scRes.ok ? await scRes.json() : [];
    const spaData = sdRow?.value || {};
    const appts = apRow?.value || [];
    const staffAccounts = Array.isArray(scRow?.value) ? scRow.value : [];

    const svc = (spaData.services || []).find(s => s.id === serviceId && s.active);
    if (!svc) return ok({ success: false, message: 'No encontré ese servicio — vuelve a llamar a spa_list_services para obtener un serviceId válido.' });

    let candidates = (spaData.therapists || []).filter(t => t.active && (t.services || []).some(s => s.serviceId === serviceId));
    if (therapistPreference === 'female' || therapistPreference === 'male') {
      candidates = candidates.filter(t => t.gender === therapistPreference);
    } else if (therapistPreference && therapistPreference !== 'none') {
      // Treat anything else as a specific therapist name.
      const norm = String(therapistPreference).trim().toLowerCase();
      candidates = candidates.filter(t => `${t.firstName} ${t.lastName || ''}`.trim().toLowerCase().includes(norm) || (t.firstName || '').toLowerCase() === norm);
    }
    if (!candidates.length) return ok({ success: false, message: 'No hay terapeutas disponibles para ese servicio con esa preferencia.' });

    const priceUSD = svc.groupPricing ? spaGroupPrice(svc, Math.max(1, parseInt(guestCount) || svc.groupPricing.minGuests || 1)) : svc.price;

    const rooms = spaData.rooms || [];
    const slots = [];
    for (let m = SB_START_H * 60; m <= SB_END_H * 60 - svc.duration; m += 30) {
      const assigns = allFreeAssignments(candidates, date, m, svc.duration, svc, appts, rooms, staffAccounts);
      if (assigns.length) {
        slots.push({
          start: minToHHMM(m),
          options: assigns.map(a => ({ therapistId: a.therapist.id, therapistName: `${a.therapist.firstName} ${a.therapist.lastName || ''}`.trim(), roomId: a.room ? a.room.id : null })),
        });
      }
    }

    if (!slots.length) return ok({ success: false, message: `No hay horarios disponibles para ${svc.name} el ${date}. Prueba otra fecha.` });

    return ok({
      success: true,
      serviceId, serviceName: svc.name, durationMinutes: svc.duration,
      priceUSD, date, slots,
    });
  } catch (err) {
    console.error('[visito-spa-check-availability]', err.message);
    return jsonErr(500, err.message);
  }
};

function spaGroupPrice(s, n) {
  if (!s.groupPricing || !n || n < 1) return null;
  const gp = s.groupPricing;
  if (gp.belowMin && gp.belowMin[n] != null) return gp.belowMin[n];
  if (gp.flatFee != null) return gp.flatFee + Math.max(0, n - (gp.flatFeeMax || 0)) * (gp.perPersonUSD || 0);
  if (n >= gp.minGroup) return gp.perPersonUSD * n;
  return null;
}

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: msg }) }; }
