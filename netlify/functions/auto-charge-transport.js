'use strict';

// Runs daily at 05:00 UTC (midnight Tulum, UTC-5) — called twice by pg_cron:
//   type=arrival   → charges tomorrow's arrivals (1 day ahead)
//   type=departure → charges departures 2 days ahead
// If booking has flag "teacher_pays_[arrival|departure]_transport" → charge teacher's folio the total.
// If not → charge each guest individually at the rate for their service group size.
// Marks each transport row with data.folioCharged.[arrival|departure]* to prevent double-charging.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const RATES = {
  cancun: [195, 100, 80, 65, 55, 45],
  tulum:  [145,  80, 65, 55, 45, 40],
};

function autoRate(airport, pax) {
  const tbl = RATES[airport];
  if (!tbl) return null;
  return tbl[Math.min(pax - 1, tbl.length - 1)];
}

async function supaFetch(key, path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      ...(method !== 'GET' ? { 'Prefer': 'return=representation' } : {}),
    },
  };
  if (body != null) opts.body = JSON.stringify(body);
  const res  = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

function toMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Replicate transport.js auto-cluster: same booking + airport + ≤20-min window
function clusterEntries(entries) {
  const clusters = [];
  for (const e of entries) {
    const mins = toMinutes(e.time);
    const key  = `${e.bookingId}|${e.airport}`;
    let joined = false;
    if (mins !== null) {
      for (const cl of clusters) {
        const f = cl[0];
        if (`${f.bookingId}|${f.airport}` !== key) continue;
        const fm = toMinutes(f.time);
        if (fm !== null && Math.abs(fm - mins) <= 20) { cl.push(e); joined = true; break; }
      }
    }
    if (!joined) clusters.push([e]);
  }
  return clusters;
}

// POST to create-folio-charge via direct Supabase (avoids internal HTTP round-trip)
async function chargeFolio(supaKey, { registrationId, guestName, description, unitPrice }) {
  // Look up canonical name
  const regLookup = await supaFetch(supaKey,
    `registrations?select=guests&id=eq.${encodeURIComponent(registrationId)}&limit=1`
  );
  const regRow = Array.isArray(regLookup.data) ? regLookup.data[0] : null;
  const canonical = regRow?.guests?.find(g => g.name)?.name ?? guestName ?? '';

  // Find or create folio
  let folioId = null;
  const exactRes = await supaFetch(supaKey,
    `folios?select=id&registration_id=eq.${encodeURIComponent(registrationId)}&guest_name=eq.${encodeURIComponent(canonical)}&limit=1`
  );
  if (exactRes.ok && Array.isArray(exactRes.data) && exactRes.data.length) {
    folioId = exactRes.data[0].id;
  } else {
    const anyRes = await supaFetch(supaKey,
      `folios?select=id&registration_id=eq.${encodeURIComponent(registrationId)}&status=eq.open&order=created_at.asc&limit=1`
    );
    if (anyRes.ok && Array.isArray(anyRes.data) && anyRes.data.length) {
      folioId = anyRes.data[0].id;
    }
  }
  if (!folioId) {
    const token = crypto.randomUUID().replace(/-/g, '');
    const createRes = await supaFetch(supaKey, 'folios', 'POST', {
      registration_id: registrationId,
      guest_name:      canonical,
      name:            canonical,
      payment_token:   token,
      status:          'open',
    });
    if (!createRes.ok) return { error: `folio_create_failed: ${JSON.stringify(createRes.data)}` };
    const created = Array.isArray(createRes.data) ? createRes.data[0] : createRes.data;
    folioId = created?.id;
    if (!folioId) return { error: 'folio_created_no_id' };
  }

  // Insert folio_item
  const itemRes = await supaFetch(supaKey, 'folio_items', 'POST', {
    folio_id:   folioId,
    description,
    qty:        1,
    unit_price: unitPrice,
    tax_rate:   13,
  });
  if (!itemRes.ok) return { error: `folio_item_failed: ${JSON.stringify(itemRes.data)}` };
  const saved = Array.isArray(itemRes.data) ? itemRes.data[0] : itemRes.data;
  return { folioItemId: saved?.id, folioId };
}

// Fuzzy name match: all tokens of the shorter name appear in the longer name
// "hilario cen" matches "hilario cen ku" and vice versa
function nameMatch(a, b) {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const tokA = norm(a).split(/\s+/).filter(Boolean);
  const tokB = norm(b).split(/\s+/).filter(Boolean);
  const [shorter, longer] = tokA.length <= tokB.length ? [tokA, tokB] : [tokB, tokA];
  return shorter.length > 0 && shorter.every(t => longer.includes(t));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return { statusCode: 500, body: 'Missing SUPABASE_SERVICE_KEY' };

  // Accept optional date and type override via query param or POST body
  let tomorrow = event.queryStringParameters?.date ?? null;
  let type     = event.queryStringParameters?.type ?? 'arrival';
  if (event.body) {
    try {
      const b = JSON.parse(event.body);
      if (!tomorrow) tomorrow = b.date ?? null;
      if (b.type)    type     = b.type;
    } catch {}
  }
  const isArr       = type !== 'departure';
  if (!tomorrow) {
    const now  = new Date();
    const tulu = new Date(now.getTime() + (-5 * 60 - now.getTimezoneOffset()) * 60000);
    tulu.setDate(tulu.getDate() + (isArr ? 1 : 2));  // arrivals: 1 day ahead; departures: 2 days ahead
    tomorrow = tulu.toISOString().slice(0, 10);
  }
  const dateField   = isArr ? 'arrivalDate'         : 'departureDate';
  const otField     = isArr ? 'arrivalOT'           : 'departureOT';
  const timeField   = isArr ? 'arrivalTime'         : 'departureTime';
  const apField     = isArr ? 'arrivalAirport'      : 'departureAirport';
  const chargedF    = isArr ? 'arrivalFolioItemId'  : 'departureFolioItemId';
  const amountF     = isArr ? 'arrivalAmount'       : 'departureAmount';
  const chargedAtF  = isArr ? 'arrivalChargedAt'    : 'departureChargedAt';
  const paidByF     = isArr ? 'arrivalPaidBy'       : 'departurePaidBy';
  const tFlag       = isArr ? 'teacher_pays_arrival_transport' : 'teacher_pays_departure_transport';
  const dirPrefix   = isArr ? 'arrival' : 'departure';
  const descLabel   = isArr ? 'Arrival' : 'Departure';
  console.log(`[auto-charge-transport] processing ${type}s for ${tomorrow}`);

  // 1. All transport rows
  const trRes = await supaFetch(supaKey, 'transport?select=id,booking_id,data&order=id');
  if (!trRes.ok) return { statusCode: 500, body: `transport fetch failed: ${JSON.stringify(trRes.data)}` };

  const rows = (trRes.data ?? []).filter(r => {
    const d = r.data ?? {};
    return d[dateField] === tomorrow && !d[otField];
  });
  if (!rows.length) {
    console.log(`[auto-charge-transport] no ${type}s for ${tomorrow}`);
    return { statusCode: 200, body: JSON.stringify({ date: tomorrow, type, charged: [], skipped: [], errors: [] }) };
  }

  // 2. Bookings — need flags
  const bookingIds = [...new Set(rows.map(r => r.booking_id).filter(Boolean))];
  const bkMap = {};
  if (bookingIds.length) {
    const bkFilter = bookingIds.map(id => `id.eq.${id}`).join(',');
    const bkRes = await supaFetch(supaKey, `bookings?select=id,flags,leader_name&or=(${bkFilter})`);
    (Array.isArray(bkRes.data) ? bkRes.data : []).forEach(b => { bkMap[b.id] = b; });
  }

  // 3. Registrations for bookings with retreat assigned
  const regsByBk = {};
  if (bookingIds.length) {
    const regFilter = bookingIds.map(id => `booking_id.eq.${id}`).join(',');
    const regRes = await supaFetch(supaKey,
      `registrations?select=id,booking_id,room,guests,is_teacher_room&or=(${regFilter})`
    );
    (Array.isArray(regRes.data) ? regRes.data : []).forEach(r => { (regsByBk[r.booking_id] ??= []).push(r); });
  }

  // 3b. All registrations — used as fallback for entries without a retreat (extra nights, escapes, etc.)
  const allRegsRes = await supaFetch(supaKey, 'registrations?select=id,booking_id,room,guests&limit=2000');
  const allRegs = allRegsRes.ok ? (allRegsRes.data ?? []) : [];
  // Fuzzy name search across all registrations
  const findRegByName = (fullName, excludeTeacher = true) => {
    const matches = [];
    for (const r of allRegs) {
      if (excludeTeacher && r.is_teacher_room) continue;
      if ((r.guests ?? []).some(g => g.name && nameMatch(g.name, fullName))) {
        matches.push(r);
      }
    }
    return matches;
  };

  // 4. Load user-defined transport groups from settings
  const grpRes = await supaFetch(supaKey, 'settings?select=value&key=eq.transport_groups&limit=1');
  const savedGroups = (grpRes.ok && Array.isArray(grpRes.data) && grpRes.data[0]?.value) ? grpRes.data[0].value : [];
  const userGroupMap = new Map(savedGroups); // "arrival|rowId" or "departure|rowId" → "ug_N"

  // 5. Build entry list
  const entries = rows.map(r => {
    const d = r.data ?? {};
    return {
      rowId:          r.id,
      bookingId:      r.booking_id,
      time:           d[timeField] ?? '',
      airport:        d[apField]   ?? 'cancun',
      firstName:      d.firstName  ?? '',
      lastName:       d.lastName   ?? '',
      alreadyCharged: !!d.folioCharged?.[chargedF],
      data:           d,
    };
  });

  // 6. Build direction-scoped group map
  const groupKeyMap = new Map();
  entries.forEach(e => {
    const dirKey = `${dirPrefix}|${e.rowId}`;
    if (userGroupMap.has(dirKey)) groupKeyMap.set(dirKey, userGroupMap.get(dirKey));
  });
  const ungrouped = entries.filter(e => !groupKeyMap.has(`${dirPrefix}|${e.rowId}`));
  clusterEntries(ungrouped).forEach((cl, i) => {
    const key = `auto_${i}`;
    cl.forEach(e => groupKeyMap.set(`${dirPrefix}|${e.rowId}`, key));
  });
  entries.forEach(e => {
    const dk = `${dirPrefix}|${e.rowId}`;
    if (!groupKeyMap.has(dk)) groupKeyMap.set(dk, `solo_${e.rowId}`);
  });

  // groupKey → [entries]
  const groups = new Map();
  entries.forEach(e => {
    const gk = groupKeyMap.get(`${dirPrefix}|${e.rowId}`);
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(e);
  });

  const results = { date: tomorrow, charged: [], skipped: [], errors: [] };
  const now_iso = new Date().toISOString();

  // 7. Process each booking
  for (const bkId of bookingIds) {
    const bk   = bkMap[bkId];
    if (!bk) continue;
    const flags       = bk.flags ?? [];
    const teacherPays = flags.includes(tFlag);
    const regs        = regsByBk[bkId] ?? [];
    const teacherReg  = regs.find(r => r.is_teacher_room);
    const bkEntries   = entries.filter(e => e.bookingId === bkId);

    if (teacherPays) {
      if (!teacherReg) { results.errors.push({ bkId, reason: 'no_teacher_registration' }); continue; }
      if (bkEntries.some(e => e.alreadyCharged)) { results.skipped.push({ bkId, reason: 'already_charged_teacher' }); continue; }

      let total = 0;
      bkEntries.forEach(e => {
        const gk  = groupKeyMap.get(`${dirPrefix}|${e.rowId}`) ?? `solo_${e.rowId}`;
        const pax = (groups.get(gk) ?? [e]).length;
        total += autoRate(e.airport, pax) ?? 0;
      });
      if (total <= 0) { results.skipped.push({ bkId, reason: 'zero_total' }); continue; }

      const teacherName = (teacherReg.guests ?? []).find(g => g.name)?.name ?? bk.leader_name ?? '';
      const { folioItemId, error } = await chargeFolio(supaKey, {
        registrationId: teacherReg.id,
        guestName:      teacherName,
        description:    `${descLabel} Transport ${tomorrow} — ${bkEntries.length} guest${bkEntries.length !== 1 ? 's' : ''}`,
        unitPrice:      total,
      });
      if (error) { results.errors.push({ bkId, reason: error }); continue; }

      for (const e of bkEntries) {
        const updatedData = {
          ...e.data,
          folioCharged: {
            ...(e.data.folioCharged ?? {}),
            [chargedF]:   folioItemId,
            [amountF]:    total / bkEntries.length,
            [chargedAtF]: now_iso,
            [paidByF]:    'teacher',
          },
        };
        await supaFetch(supaKey, `transport?id=eq.${e.rowId}`, 'PATCH', { data: updatedData });
      }
      results.charged.push({ bkId, paidBy: 'teacher', total, guests: bkEntries.length, folioItemId });

    } else {
      for (const e of bkEntries) {
        if (e.alreadyCharged) { results.skipped.push({ rowId: e.rowId, reason: 'already_charged' }); continue; }

        const gk  = groupKeyMap.get(`${dirPrefix}|${e.rowId}`) ?? `solo_${e.rowId}`;
        const pax = (groups.get(gk) ?? [e]).length;
        const rate = autoRate(e.airport, pax);
        if (!rate) { results.skipped.push({ rowId: e.rowId, reason: 'no_rate' }); continue; }

        const fullName = `${e.firstName} ${e.lastName}`.trim().toLowerCase();
        const reg = regs.find(r =>
          !r.is_teacher_room &&
          (r.guests ?? []).some(g => g.name && nameMatch(g.name, fullName))
        ) ?? (() => {
          const matches = findRegByName(fullName);
          return matches.length === 1 ? matches[0] : null;
        })();
        if (!reg) { results.errors.push({ rowId: e.rowId, name: fullName, reason: 'no_registration' }); continue; }

        const { folioItemId, error } = await chargeFolio(supaKey, {
          registrationId: reg.id,
          guestName:      (reg.guests ?? []).find(g => g.name)?.name ?? '',
          description:    `${descLabel} Transport ${tomorrow} — ${e.airport?.toUpperCase()} ${e.time ?? ''}`,
          unitPrice:      rate,
        });
        if (error) { results.errors.push({ rowId: e.rowId, name: fullName, reason: error }); continue; }

        const updatedData = {
          ...e.data,
          folioCharged: {
            ...(e.data.folioCharged ?? {}),
            [chargedF]:   folioItemId,
            [amountF]:    rate,
            [chargedAtF]: now_iso,
            [paidByF]:    'guest',
          },
        };
        await supaFetch(supaKey, `transport?id=eq.${e.rowId}`, 'PATCH', { data: updatedData });
        results.charged.push({ rowId: e.rowId, name: fullName, amount: rate, folioItemId });
      }
    }
  }

  // 8. Entries with no booking_id (extra nights, escapes, walk-ins)
  const noRetiroEntries = entries.filter(e => !e.bookingId);
  for (const e of noRetiroEntries) {
    if (e.alreadyCharged) { results.skipped.push({ rowId: e.rowId, reason: 'already_charged' }); continue; }

    const gk   = groupKeyMap.get(`${dirPrefix}|${e.rowId}`) ?? `solo_${e.rowId}`;
    const pax  = (groups.get(gk) ?? [e]).length;
    const rate = autoRate(e.airport, pax);
    if (!rate) { results.skipped.push({ rowId: e.rowId, reason: 'no_rate' }); continue; }

    const fullName = `${e.firstName} ${e.lastName}`.trim().toLowerCase();
    const matches  = findRegByName(fullName);
    if (!matches.length) { results.errors.push({ rowId: e.rowId, name: fullName, reason: 'no_registration' }); continue; }
    if (matches.length > 1) { results.errors.push({ rowId: e.rowId, name: fullName, reason: 'ambiguous_name_multiple_retreats' }); continue; }
    const reg = matches[0];

    const { folioItemId, error } = await chargeFolio(supaKey, {
      registrationId: reg.id,
      guestName:      (reg.guests ?? []).find(g => g.name)?.name ?? '',
      description:    `${descLabel} Transport ${tomorrow} — ${e.airport?.toUpperCase()} ${e.time ?? ''}`,
      unitPrice:      rate,
    });
    if (error) { results.errors.push({ rowId: e.rowId, name: fullName, reason: error }); continue; }

    const updatedData = {
      ...e.data,
      folioCharged: {
        ...(e.data.folioCharged ?? {}),
        [chargedF]:   folioItemId,
        [amountF]:    rate,
        [chargedAtF]: now_iso,
        [paidByF]:    'guest',
      },
    };
    await supaFetch(supaKey, `transport?id=eq.${e.rowId}`, 'PATCH', { data: updatedData });
    results.charged.push({ rowId: e.rowId, name: fullName, amount: rate, folioItemId, source: 'name_lookup' });
  }

  console.log('[auto-charge-transport] done:', JSON.stringify(results));
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify(results),
  };
};
