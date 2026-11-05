'use strict';

// guest-stay-kind.js — which rate an extension gets (Jorge 2026-11-05). A guest of a group retreat (with its yoga program)
// who adds nights right before/after it gets the Extra Night rate; a Room Only / Escape guest who extends pays the
// normal Escape rate. Lana used to decide by asking, and gave Melissa (Room Only, Superior) the Extra Night rate.
// stayKindForPhone() looks the WhatsApp number up in the portal: 'extra_night' when it is on a retreat registration
// within 3 days of the dates asked for, 'escape' when the number is on reservations but none is such a retreat, null when
// the number is not in the portal at all (then nobody can tell, and what Lana asked for stands).
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const digits = s => String(s || '').replace(/\D/g, '');
const samePhone = (a, b) => { const x = digits(a), y = digits(b); return x.length >= 8 && y.length >= 8 && x.slice(-10) === y.slice(-10); };
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// the conversation's phone, same as identify_guest: meta.conversationKey "amansala-2:whatsapp:529841055141:..."
function phoneOf(payload) {
  const ck = String(((payload && payload.meta) || {}).conversationKey || '');
  return ck.split(':').find(p => /^\d{8,15}$/.test(p)) || '';
}

async function stayKindForPhone(key, phone, checkIn, checkOut) {
  if (!phone || !checkIn || !checkOut) return null;
  const H = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async p => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H }); return r.ok ? r.json() : []; };
  const from = addDays(checkIn, -60), to = addDays(checkOut, 60);
  const bks = [];
  for (let off = 0; off < 20000; off += 1000) {
    const page = await get(`bookings?select=id,booking_type,start_date,end_date&status=neq.cancelled&end_date=gte.${from}&start_date=lte.${to}&order=id&limit=1000&offset=${off}`);
    bks.push(...page); if (page.length < 1000) break;
  }
  const byId = new Map(bks.map(b => [b.id, b]));
  let found = false, retreatNear = false;
  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length && !retreatNear; i += 80) {
    const regs = await get(`registrations?select=booking_id,guests,check_in,check_out,cancelled&booking_id=in.(${ids.slice(i, i + 80).map(encodeURIComponent).join(',')})&cancelled=not.is.true`);
    for (const r of regs) {
      if (!(r.guests || []).some(g => g && !g.cancelled && samePhone(g.phone, phone))) continue;
      found = true;
      const bk = byId.get(r.booking_id);
      if (!bk || bk.booking_type === 'room_only') continue;
      const s = r.check_in || bk.start_date, e = r.check_out || bk.end_date;
      // the extension touches the retreat stay (or overlaps it) give or take 3 days
      if (s && e && checkIn <= addDays(e, 3) && checkOut >= addDays(s, -3)) { retreatNear = true; break; }
    }
  }
  if (!found) {
    const reqs = await get(`booking_requests?select=phone&check_out=gte.${from}&status=neq.declined`);
    if (reqs.some(q => samePhone(q.phone, phone))) found = true;
  }
  if (!found) return null;
  return retreatNear ? 'extra_night' : 'escape';
}

module.exports = { stayKindForPhone, phoneOf };
