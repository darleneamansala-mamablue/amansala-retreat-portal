'use strict';

// Scheduled (netlify.toml: every day 00:00 UTC = 7pm in Tulum) -- Jorge's ask
// 2026-10-08: a daily WhatsApp report of tonight's occupied rooms to
// maintenance + security so they can raise the A/C before 9pm. WhatsApp
// Business has no concept of "group" messaging at the API level (confirmed
// with Jorge), so this sends the SAME message individually to every number
// in CLIMAS_REPORT_NUMBERS (comma-separated E.164), covering both teams.
//
// Template "amansala_climas_reporte" (es_MX, UTILITY) submitted via Visito's
// API 2026-10-08, PENDING Meta approval as of this writing -- sends are a
// no-op (dry run, logged only) until CLIMAS_REPORT_ENABLED=true, same
// pattern as send-checkout-payment-links.js's CHECKOUT_LINKS_ENABLED.
//
// Env:
//   SUPABASE_SERVICE_KEY
//   VISITO_M2M_KEY
//   CLIMAS_REPORT_NUMBERS   comma-separated E.164 numbers (maintenance + security)
//   CLIMAS_REPORT_ENABLED   must be "true" to actually send

const SUPABASE_URL  = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const PORTAL_URL    = 'https://amansalaportal.com';
const VISITO_API    = 'https://platform-api.visitoai.com/m2m/v1';
const CHANNEL_ID    = '6abd2154f6a6b5cd69232824'; // WhatsApp +52 1 984 879 5999, tenant amansala-2
const TEMPLATE_NAME = 'amansala_climas_reporte';
const TEMPLATE_LANG = 'es_MX';

// Hotel-local date (Tulum, UTC-5)
function localDate(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
}
function fmtDateEsLong(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

exports.handler = async () => {
  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) { console.error('[climas-report] SUPABASE_SERVICE_KEY missing'); return { statusCode: 500 }; }
  const enabled = process.env.CLIMAS_REPORT_ENABLED === 'true';
  const m2mKey  = process.env.VISITO_M2M_KEY;
  const numbers = (process.env.CLIMAS_REPORT_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (enabled && (!m2mKey || !numbers.length)) {
    console.error('[climas-report] enabled but VISITO_M2M_KEY / CLIMAS_REPORT_NUMBERS missing');
    return { statusCode: 500 };
  }

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json' };
  const get = async path => {
    const r = await fetch(SUPABASE_URL + path, { headers: hdrs });
    if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };

  const today = localDate(0);
  const occupied = new Set();

  // Jorge's ask 2026-10-08: "solo in house" -- a reservation whose dates
  // merely cover tonight isn't enough, staff has to have actually clicked
  // Check In (and not yet Checked Out). Mirrors _resBuildInHotelView's exact
  // filter (modules/reservations.js:356-357), the same one the admin's own
  // "In House" tab uses -- checked_in_at/checked_out_at are staff-driven
  // only (set by resCheckIn/resCheckOut, bdCheckIn/bdCheckOut), never
  // auto-flipped by date, so this is the sole reliable "who's really here
  // right now" signal.

  // Individual Room Only / Booking Engine stays, checked in and not yet out.
  const reqs = await get(`/rest/v1/booking_requests?select=room&room=not.is.null&check_in=lte.${today}&check_out=gt.${today}&checked_in_at=not.is.null&status=neq.checked_out`);
  reqs.forEach(r => r.room && occupied.add(r.room));

  // Retreat/group guests, checked in and not yet out -- cross-checked
  // against their booking (not cancelled, effective dates cover tonight).
  const regs = await get(`/rest/v1/registrations?select=room,cancelled,guests,check_in,check_out,booking_id&checked_in_at=not.is.null&checked_out_at=is.null`);
  if (regs.length) {
    const bkIds = [...new Set(regs.map(r => r.booking_id).filter(Boolean))];
    const bks = await get(`/rest/v1/bookings?select=id,status,start_date,end_date&id=in.(${bkIds.join(',')})`);
    const bkById = Object.fromEntries(bks.map(b => [b.id, b]));
    regs.forEach(r => {
      if (r.cancelled || !r.room) return;
      const bk = bkById[r.booking_id];
      if (!bk || bk.status === 'cancelled') return;
      if (!(r.guests || []).some(g => g.name && !g.cancelled)) return;
      const ci = r.check_in || bk.start_date, co = r.check_out || bk.end_date;
      if (!(ci <= today && co > today)) return;
      occupied.add(r.room);
    });
  }

  // A room booked directly in Cloudbeds, with no portal booking/registration
  // record at all, is still genuinely occupied -- Jorge's report 2026-10-08:
  // room 9 (Rose Guillemette) came from Cloudbeds only. Same raw-Cloudbeds
  // union rsComputeAvailability (modules/venues.js) already uses for
  // availability, via getExternalReservations -- but scoped here to CB's own
  // "checked_in" status (not just "confirmed"/not-yet-arrived), matching the
  // in-house-only rule above. Non-fatal: a Cloudbeds hiccup should never
  // block the rest of the report from going out.
  try {
    const extRes = await fetch(`${PORTAL_URL}/.netlify/functions/cloudbeds?action=getExternalReservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: today, endDate: localDate(1) }),
    });
    const extData = await extRes.json();
    (extData.reservations || []).forEach(r => {
      if ((r.status || '').toLowerCase() !== 'checked_in') return;
      if (!(r.startDate <= today && r.endDate > today)) return;
      (r.rooms || []).forEach(room => occupied.add(room));
    });
  } catch (e) {
    console.warn('[climas-report] Cloudbeds fetch failed (non-fatal):', e.message);
  }

  const roomList = [...occupied].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  console.log(`[climas-report] ${enabled ? 'SENDING' : 'DRY RUN'} for ${today} -- ${roomList.length} rooms: ${roomList.join(', ')}`);

  if (!roomList.length) {
    console.log('[climas-report] no occupied rooms tonight, skipping send');
    return { statusCode: 200, body: JSON.stringify({ date: today, rooms: 0 }) };
  }

  const dateStr  = fmtDateEsLong(today);
  // A real newline in a template PARAMETER (unlike the template's own static
  // body text) is rejected by Meta with a bare 500 -- confirmed empirically
  // 2026-10-08, several failed test sends. Visual bullets on one line is the
  // closest a parameter can get to a real list.
  const roomsStr = roomList.map(r => `• ${r}`).join('   ');

  if (!enabled) {
    console.log(`[climas-report] would send to ${numbers.length} numbers: ${roomsStr}`);
    return { statusCode: 200, body: JSON.stringify({ date: today, rooms: roomList.length, dryRun: true }) };
  }

  const results = { sent: 0, failed: 0 };
  for (const to of numbers) {
    try {
      const r = await fetch(`${VISITO_API}/whatsapp-templates/${CHANNEL_ID}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${m2mKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `climas-${today}-${to}` },
        body: JSON.stringify({
          to,
          template: {
            name: TEMPLATE_NAME,
            language: { code: TEMPLATE_LANG },
            components: [{ type: 'body', parameters: [{ type: 'text', text: dateStr }, { type: 'text', text: roomsStr }] }],
          },
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(data).slice(0, 200)}`);
      results.sent++;
    } catch (e) {
      results.failed++;
      console.error(`[climas-report] send failed for ${to}: ${e.message}`);
    }
  }

  console.log(`[climas-report] ${today} -- ${JSON.stringify(results)}`);
  return { statusCode: 200, body: JSON.stringify({ date: today, rooms: roomList.length, ...results }) };
};
