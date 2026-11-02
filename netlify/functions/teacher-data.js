'use strict';

// teacher-data.js — everything the teacher portal needs for ONE retreat (security plan, teacher step 1, 2026-11-02).
// The teacher portal (booking-hub.html?mode=teacher&bk=<id>, or the /<leadername> link) used to download every booking,
// guest and payment of every retreat and pick its own in the browser. Now it asks this function, which returns:
//   - the teacher's booking, its registrations and payments (full rows), room types;
//   - of the OTHER retreats only what the availability checks need, with no names: dates, status, rooms taken, shala
//     times, activity slots, and whether a room has a named guest (not the name);
//   - transport times of the other retreats for ride sharing (no names, no flights);
//   - the app_store settings the page reads (sync switches, deleted-id lists, portal settings, issue acks);
//   - the link's short name, the highest deposit invoice number in use, and a database pass for this retreat.
// The old links keep working: the booking id is what identifies the retreat, as before.
const { SUPABASE_URL, hdrs, signDbPass, cors, reply } = require('./portal-auth-lib');

const STORE_KEYS = ['cas_sync', 'db_pass', 'clear_signal', 'deletedBookingIds', 'deletedRegIds', 'deletedPaymentIds', 'portal_settings', 'issueAcks'];
const SCHED_KEYS = ['adminStatus', 'adminOverride', 'morningStart', 'morningDur', 'hasAfternoon', 'afternoonSlot', 'afternoonStart', 'afternoonDur',
  'hasArrivalClass', 'arrivalSlot', 'arrivalDur', 'hasDepartureClass', 'departureSlot', 'departureDur',
  'morningShala1', 'morningShala2', 'afternoonShala1', 'afternoonShala2', 'arrivalShala1', 'arrivalShala2', 'departureShala1', 'departureShala2'];
const TR_KEYS = ['arrivalOT', 'arrivalDate', 'arrivalTime', 'arrivalAirport', 'departureOT', 'departureDate', 'departureTime', 'departureAirport'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const pick = (o, keys) => { const r = {}; keys.forEach(k => { if (o && o[k] !== undefined) r[k] = o[k]; }); return r; };
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

// same rule as shortlink.js / computeShortSlug in teacher-portal.js
function shortSlug(all, bkId) {
  const slugify = n => (n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const groups = {};
  all.filter(b => b.status !== 'cancelled').forEach(b => { const base = slugify(b.leader_name || b.retreat_name || ''); (groups[base] = groups[base] || []).push(b); });
  for (const base in groups) {
    const items = groups[base].slice().sort((a, b) => (a.start_date || '').localeCompare(b.start_date || '') || a.id.localeCompare(b.id));
    if (items.length === 1) { if (items[0].id === bkId) return base; continue; }
    const final = { [base]: items[0] }, seen = new Set([base]);
    items.slice(1).forEach(b => {
      const [y, m] = (b.start_date || '').split('-');
      let s = `${base}-${b.start_date ? MONTHS[parseInt(m, 10) - 1] + y.slice(2) : ''}`;
      if (seen.has(s) || final[s]) s = `${s}-${(b.id || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(-4)}`;
      seen.add(s); final[s] = b;
    });
    const hit = Object.entries(final).find(([, b]) => b.id === bkId);
    if (hit) return hit[0];
  }
  return null;
}

async function getAll(key, path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { ...hdrs(key), Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(path.split('?')[0] + ' ' + r.status);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return reply(500, { error: 'Server config error' });
  let bk = (event.queryStringParameters || {}).bk;
  if (!bk && event.body) { try { bk = JSON.parse(event.body).bk; } catch (e) {} }
  bk = String(bk || '').trim();
  if (!bk || bk.length > 80) return reply(400, { error: 'Missing retreat' });
  try {
    const enc = encodeURIComponent(bk);
    const [own] = await getAll(key, `bookings?id=eq.${enc}&select=*`);
    if (!own) return reply(404, { error: 'Retreat not found' });
    const from = addDays(own.start_date || new Date().toISOString().slice(0, 10), -2), to = addDays(own.end_date || own.start_date || from, 2);
    const [regs, payments, roomTypes, store, names, others, invoices] = await Promise.all([
      getAll(key, `registrations?booking_id=eq.${enc}&select=*`),
      getAll(key, `payments?booking_id=eq.${enc}&select=*`),
      getAll(key, `room_types?select=*`),
      getAll(key, `app_store?key=in.(${STORE_KEYS.join(',')})&select=key,value,updated_at`),
      getAll(key, `bookings?select=id,leader_name,retreat_name,start_date,status`),
      getAll(key, `bookings?id=neq.${enc}&start_date=lte.${to}&end_date=gte.${from}&select=id,status,start_date,end_date,blocked_rooms,booking_type,flags,pax,packages,retreat_activities,schedule_request`),
      getAll(key, `bookings?deposit_invoice=not.is.null&select=deposit_invoice`),
    ]);
    const otherIds = others.map(o => o.id);
    const [otherRegs, otherTransport] = otherIds.length ? await Promise.all([
      getAll(key, `registrations?booking_id=in.(${otherIds.map(encodeURIComponent).join(',')})&select=booking_id,room,guests,cancelled`),
      getAll(key, `transport?booking_id=in.(${otherIds.map(encodeURIComponent).join(',')})&select=id,booking_id,data`),
    ]) : [[], []];
    const year = new Date().getFullYear(), pre = `AMN-${year}-`;
    const maxInvoice = invoices.reduce((m, r) => { const n = r.deposit_invoice && r.deposit_invoice.number; const v = typeof n === 'string' && n.startsWith(pre) ? parseInt(n.slice(pre.length), 10) : 0; return v > m ? v : m; }, 0);
    return reply(200, {
      booking: own, regs, payments, roomTypes, store,
      occupancy: {
        bookings: others.map(o => ({
          id: o.id, status: o.status, start_date: o.start_date, end_date: o.end_date, blocked_rooms: o.blocked_rooms, booking_type: o.booking_type,
          flags: Array.isArray(o.flags) && o.flags.includes('archived') ? ['archived'] : [], pax: o.pax, packages: o.packages,
          retreat_activities: (o.retreat_activities || []).map(a => pick(a, ['aoId', 'date', 'prepaid'])),
          schedule_request: o.schedule_request ? pick(o.schedule_request, SCHED_KEYS) : null,
        })),
        regs: otherRegs.map(r => ({ booking_id: r.booking_id, room: r.room, cancelled: r.cancelled, named: (r.guests || []).some(g => g && String(g.name || '').trim()) })),
        transport: otherTransport.map(t => ({ id: t.id, bookingId: t.booking_id, ...pick(t.data, TR_KEYS) })),
      },
      slug: shortSlug(names, own.id),
      maxInvoice,
      dbPass: signDbPass({ sub: 'teacher:' + own.id, app_role: 'teacher', booking_id: own.id }),
    });
  } catch (e) {
    console.error('[teacher-data]', e);
    return reply(500, { error: 'Could not load the retreat' });
  }
};
