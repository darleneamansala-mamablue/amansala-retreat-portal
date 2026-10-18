'use strict';

// Scheduled (netlify.toml: every day 00:00 UTC = 7pm in Tulum) -- Jorge's ask
// 2026-10-08: a daily WhatsApp report of tonight's occupied rooms to
// maintenance + security so they can raise the A/C before 9pm. WhatsApp
// Business has no concept of "group" messaging at the API level (confirmed
// with Jorge), so this sends the SAME message individually to every number
// in CLIMAS_REPORT_NUMBERS (comma-separated E.164), covering both teams.
//
// Template "amansala_climas_reporte_v2" (es_MX, UTILITY) submitted via Visito's
// API 2026-10-18 -- replaces the original single-line "amansala_climas_reporte"
// (never actually launched) with Darlene's 4-section design: a header line,
// then AMANSALA / SHANTI room lists grouped by room_types.property, then an
// "A/C 24 HORAS -- NO APAGAR" section for rooms with registrations.ac_24h set
// (booking-detail.js's new checkbox) -- those rooms are excluded from the two
// property lists above them so they're never told to use the normal 9pm rule.
// PENDING Meta approval as of this writing -- sends are a no-op (dry run,
// logged only) until CLIMAS_REPORT_ENABLED=true, same pattern as
// send-checkout-payment-links.js's CHECKOUT_LINKS_ENABLED.
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
const TEMPLATE_NAME = 'amansala_climas_reporte_v2';
const TEMPLATE_LANG = 'es_MX';

// Hotel-local date (Tulum, UTC-5)
function localDate(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
}
// "Sábado 17 de octubre" -- weekday + day + month, no year (Darlene's design,
// matches the header line in her WhatsApp mockup). Capitalized manually since
// toLocaleDateString('es-MX') lowercases weekday names.
function fmtDateEsWeekday(dateStr) {
  const s = new Date(dateStr + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// Casa Grande is physically part of the main Amansala complex (unlike Casa
// Shanti, a separate property across the street) -- grouped under AMANSALA
// here, same as the Room Calendar's own property banding (modules/venues.js
// RC_PROP_COLORS).
function climasGroupFor(property) {
  return property === 'CASA SHANTI' ? 'SHANTI' : 'AMANSALA';
}

async function run() {
  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) { console.error('[climas-report] SUPABASE_SERVICE_KEY missing'); return { statusCode: 500 }; }
  // Staff-editable in Admin > Settings (Jorge's ask 2026-10-15) instead of the
  // CLIMAS_REPORT_ENABLED env var -- defaults to on (matching the env var's prior
  // production value) if that screen was never saved.
  let enabled = true;
  try {
    const sres = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.portal_settings&select=value`, { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } });
    const [srow] = sres.ok ? await sres.json() : [];
    if (srow && srow.value && srow.value.notifications && srow.value.notifications.climasReportEnabled != null) enabled = !!srow.value.notifications.climasReportEnabled;
  } catch (e) { /* non-fatal — defaults to enabled */ }
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
  const ac24hRooms = new Set();

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
  const regs = await get(`/rest/v1/registrations?select=room,cancelled,guests,check_in,check_out,booking_id,ac_24h&checked_in_at=not.is.null&checked_out_at=is.null`);
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
      if (r.ac_24h) ac24hRooms.add(r.room);
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

  // Property lookup for the AMANSALA/SHANTI split -- ac_24h rooms are pulled out
  // of both lists first (they get their own section, not the 9pm reminder).
  const roomTypes = await get('/rest/v1/room_types?select=property,rooms');
  const propertyByRoom = {};
  roomTypes.forEach(rt => (rt.rooms || []).forEach(r => { propertyByRoom[r] = rt.property || 'AMANSALA'; }));
  const groups = { AMANSALA: [], SHANTI: [] };
  roomList.forEach(room => {
    if (ac24hRooms.has(room)) return;
    groups[climasGroupFor(propertyByRoom[room])].push(room);
  });
  const ac24hList = roomList.filter(r => ac24hRooms.has(r));

  // Neither a real "\n" (U+000A, rejected by Meta with a bare 500) nor the
  // Unicode LINE SEPARATOR (U+2028, accepted by Meta but rendered as a
  // mojibake replacement character on Jorge's actual WhatsApp client --
  // confirmed 2026-10-08) survive as a real line break inside a template
  // PARAMETER -- a single "·"-separated line per section is the one format
  // confirmed to render correctly everywhere (it still wraps naturally on a
  // phone screen, just not at a hard-coded line break). A section with no
  // rooms still needs some text -- Meta rejects an empty parameter value.
  const dateStr    = fmtDateEsWeekday(today);
  const amansalaStr = groups.AMANSALA.length ? groups.AMANSALA.join(' · ') : '—';
  const shantiStr   = groups.SHANTI.length ? groups.SHANTI.join(' · ') : '—';
  const ac24hStr    = ac24hList.length ? ac24hList.join(' · ') : '—';

  if (!enabled) {
    console.log(`[climas-report] would send to ${numbers.length} numbers -- AMANSALA: ${amansalaStr} | SHANTI: ${shantiStr} | 24H: ${ac24hStr}`);
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
            components: [{ type: 'body', parameters: [
              { type: 'text', text: dateStr },
              { type: 'text', text: amansalaStr },
              { type: 'text', text: shantiStr },
              { type: 'text', text: ac24hStr },
            ] }],
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
}

exports.handler = async () => run();
exports.run = run;
