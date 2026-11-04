'use strict';

// Visito AI "Tool" (identify_guest) — tells Lana WHO she is talking to, from the WhatsApp number of the conversation
// (Jorge, 2026-11-04: Visito's own Reservations panel only shows Cloudbeds; we want the portal's reservation). Visito
// POSTs {arguments, meta}; meta.conversationKey carries the phone ("amansala-2:whatsapp:529841055141:..."). The guest's
// current or next stay in the portal comes back: name, portal reservation number, room, room type, dates, retreat or
// group, checked in or not, and what is still to pay on their folio. Only that guest's own stay (the phone must be on the
// reservation) -- never the rest of their group.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

const digits = s => String(s || '').replace(/\D/g, '');
// same person if the last 10 digits match (+52 1 984..., 984..., 52984... all the same number)
const samePhone = (a, b) => { const x = digits(a), y = digits(b); return x.length >= 8 && y.length >= 8 && x.slice(-10) === y.slice(-10); };
const localDate = (n = 0) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');
  const expected = process.env.VISITO_TOOL_SECRET;
  if (!expected) return jsonErr(500, 'Server config error');
  const auth = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (auth !== expected) return jsonErr(401, 'Unauthorized');
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return jsonErr(500, 'Server config error');
  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return jsonErr(400, 'Invalid JSON'); }
  const ck = String(((payload.meta || {}).conversationKey) || '');
  const phone = digits((payload.arguments || {}).phone) || (ck.split(':').find(p => /^\d{8,15}$/.test(p)) || '');
  if (!phone) return ok({ success: false, message: 'No phone number for this conversation.' });

  const H = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async p => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H }); return r.ok ? r.json() : []; };
  try {
    const since = localDate(-1);
    const bks = await get(`bookings?select=id,retreat_name,leader_name,start_date,end_date,status,booking_type,confirmation_number&status=neq.cancelled&end_date=gte.${since}&order=start_date&limit=1000`);
    const byId = new Map(bks.map(b => [b.id, b]));
    const regs = [];
    for (let off = 0; off < 20000; off += 1000) {   // paged: PostgREST returns 1000 rows at most
      const page = await get(`registrations?select=id,booking_id,room,room_type_id,guests,check_in,check_out,cancelled,checked_in_at,checked_out_at&cancelled=is.false&order=id&limit=1000&offset=${off}`);
      regs.push(...page.filter(r => byId.has(r.booking_id)));
      if (page.length < 1000) break;
    }
    const hits = [];
    regs.forEach(r => (r.guests || []).forEach(g => { if (g && g.name && !g.cancelled && samePhone(g.phone, phone)) hits.push({ r, g, bk: byId.get(r.booking_id) }); }));
    const reqs = await get(`booking_requests?select=id,first_name,last_name,phone,room,room_type_name,check_in,check_out,status,cb_reservation_id,checked_in_at&check_out=gte.${since}&status=neq.declined`);
    const reqHits = reqs.filter(q => samePhone(q.phone, phone));
    if (!hits.length && !reqHits.length) return ok({ success: false, message: 'No current or upcoming reservation in the portal for this phone number.' });

    const rts = await get('room_types?select=id,name');
    const rtName = id => (rts.find(t => t.id === id) || {}).name || '';
    const balanceOf = async (col, id) => {
      const fs = await get(`folios?${col}=eq.${encodeURIComponent(id)}&select=id`);
      if (!fs.length) return null;
      const items = await get(`folio_items?folio_id=in.(${fs.map(f => f.id).join(',')})&select=qty,unit_price,tax_rate`);
      return Math.round(items.reduce((s, i) => s + Number(i.qty) * Number(i.unit_price) * (1 + (Number(i.tax_rate) || 0) / 100), 0) * 100) / 100;
    };
    const stays = [];
    for (const { r, g, bk } of hits) {
      const checkIn = r.check_in || bk.start_date, checkOut = r.check_out || bk.end_date;
      if (checkOut < since) continue;
      stays.push({
        guestName: g.name, portalReservation: bk.confirmation_number || bk.id, room: r.room || 'not assigned yet', roomType: rtName(r.room_type_id),
        checkIn, checkOut, group: bk.booking_type === 'room_only' ? 'Room only' : (bk.retreat_name || bk.leader_name || 'Retreat'),
        status: r.checked_out_at ? 'checked out' : r.checked_in_at ? 'in house (checked in)' : 'not checked in yet',
        balanceDue: await balanceOf('registration_id', r.id),
      });
    }
    for (const q of reqHits) {
      stays.push({
        guestName: [q.first_name, q.last_name].filter(Boolean).join(' '), portalReservation: q.cb_reservation_id || q.id, room: q.room || 'not assigned yet', roomType: q.room_type_name || '',
        checkIn: q.check_in, checkOut: q.check_out, group: 'Room only (booking engine)',
        status: q.checked_in_at ? 'in house (checked in)' : q.status, balanceDue: await balanceOf('booking_request_id', q.id),
      });
    }
    stays.sort((a, b) => String(a.checkIn).localeCompare(String(b.checkIn)));
    return ok({ success: true, phone: '+' + phone, current: stays[0], others: stays.slice(1) });
  } catch (err) {
    console.error('[visito-identify-guest]', err.message);
    return jsonErr(500, err.message);
  }
};

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: msg }) }; }
