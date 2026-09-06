'use strict';

// Voids an existing transport folio charge and re-runs charging with current groupings.
// Called automatically when admin edits a transport row (time/airport/OT changed) or
// changes grouping (drag-to-share / split) AFTER a charge has already been applied.
// Accepts: { rowId, direction } — direction = 'arrival' | 'departure'

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

async function chargeFolio(supaKey, { registrationId, guestName, description, unitPrice }) {
  const regLookup = await supaFetch(supaKey,
    `registrations?select=guests&id=eq.${encodeURIComponent(registrationId)}&limit=1`
  );
  const regRow   = Array.isArray(regLookup.data) ? regLookup.data[0] : null;
  const canonical = regRow?.guests?.find(g => g.name)?.name ?? guestName ?? '';

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

function nameMatch(a, b) {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const tokA = norm(a).split(/\s+/).filter(Boolean);
  const tokB = norm(b).split(/\s+/).filter(Boolean);
  const [shorter, longer] = tokA.length <= tokB.length ? [tokA, tokB] : [tokB, tokA];
  return shorter.length > 0 && shorter.every(t => longer.includes(t));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return { statusCode: 500, body: 'Missing SUPABASE_SERVICE_KEY' };

  let rowId, direction;
  try {
    const parsed = event.body ? JSON.parse(event.body) : {};
    rowId     = String(event.queryStringParameters?.rowId     ?? parsed.rowId     ?? '');
    direction = String(event.queryStringParameters?.direction ?? parsed.direction ?? 'arrival');
  } catch {
    rowId = ''; direction = 'arrival';
  }
  if (!rowId) return { statusCode: 400, body: JSON.stringify({ error: 'rowId required' }) };
  if (!['arrival', 'departure'].includes(direction)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'direction must be arrival or departure' }) };
  }

  // 1. Fetch the trigger row
  const rowRes = await supaFetch(supaKey, `transport?select=id,booking_id,data&id=eq.${rowId}&limit=1`);
  if (!rowRes.ok) return { statusCode: 500, body: JSON.stringify({ error: 'transport fetch failed', detail: rowRes.data }) };
  const triggerRow = Array.isArray(rowRes.data) ? rowRes.data[0] : null;
  if (!triggerRow) return { statusCode: 404, body: JSON.stringify({ error: 'transport row not found' }) };

  const bkId    = triggerRow.booking_id;
  const td      = triggerRow.data ?? {};
  const dateKey  = direction === 'arrival' ? 'arrivalDate'    : 'departureDate';
  const otKey    = direction === 'arrival' ? 'arrivalOT'      : 'departureOT';
  const date     = td[dateKey];
  if (!date) return { statusCode: 400, body: JSON.stringify({ error: `no ${direction}Date on row` }) };

  // 2. Fetch rows for this booking (void + recharge scope)
  let allRows;
  if (bkId) {
    const allRes = await supaFetch(supaKey, `transport?select=id,booking_id,data&booking_id=eq.${bkId}&order=id`);
    allRows = (allRes.ok ? (allRes.data ?? []) : [triggerRow]).filter(r => {
      const rd = r.data ?? {};
      return rd[dateKey] === date && !rd[otKey];
    });
  } else {
    allRows = [triggerRow];
  }
  if (!allRows.length) allRows = [triggerRow];

  // 2b. Fetch ALL rows for that date+direction across all bookings — needed for
  //     correct cross-booking group sizes (e.g. Hilario+Jorge share van with María)
  const allDateRes  = await supaFetch(supaKey, `transport?select=id,booking_id,data&order=id`);
  const allDateRows = (allDateRes.ok ? (allDateRes.data ?? []) : allRows).filter(r => {
    const rd = r.data ?? {};
    return rd[dateKey] === date && !rd[otKey];
  });

  // 3. Void existing folio charges for this direction
  const itemIdKey    = direction === 'arrival' ? 'arrivalFolioItemId'  : 'departureFolioItemId';
  const amountKey    = direction === 'arrival' ? 'arrivalAmount'       : 'departureAmount';
  const chargedAtKey = direction === 'arrival' ? 'arrivalChargedAt'    : 'departureChargedAt';
  const paidByKey    = direction === 'arrival' ? 'arrivalPaidBy'       : 'departurePaidBy';

  const voided      = [];
  const seenItemIds = new Set();

  for (const r of allRows) {
    const itemId = r.data?.folioCharged?.[itemIdKey];
    if (itemId && !seenItemIds.has(itemId)) {
      seenItemIds.add(itemId);
      const delRes = await supaFetch(supaKey, `folio_items?id=eq.${itemId}`, 'DELETE');
      voided.push({ rowId: r.id, itemId, deleted: delRes.ok });
    }
  }

  // Clear direction-specific fields from folioCharged on all affected rows
  for (const r of allRows) {
    const fc = { ...(r.data?.folioCharged ?? {}) };
    if (!fc[itemIdKey]) continue;
    delete fc[itemIdKey];
    delete fc[amountKey];
    delete fc[chargedAtKey];
    delete fc[paidByKey];
    const newData = { ...r.data };
    if (Object.keys(fc).length) newData.folioCharged = fc;
    else delete newData.folioCharged;
    await supaFetch(supaKey, `transport?id=eq.${r.id}`, 'PATCH', { data: newData });
    r.data = newData;
  }

  // 4. Load current transport groups from settings
  const grpRes      = await supaFetch(supaKey, 'settings?select=value&key=eq.transport_groups&limit=1');
  const savedGroups = (grpRes.ok && Array.isArray(grpRes.data) && grpRes.data[0]?.value) ? grpRes.data[0].value : [];
  const userGroupMap = new Map(savedGroups);

  // 5. Build group map from ALL date rows so cross-booking pax is counted correctly.
  //     entries = booking's rows only (what we charge); groups = full composition.
  const dirPfx     = direction;
  const timeKey    = direction === 'arrival' ? 'arrivalTime'    : 'departureTime';
  const airportKey = direction === 'arrival' ? 'arrivalAirport' : 'departureAirport';

  const toEntry = r => {
    const rd = r.data ?? {};
    return {
      rowId:     r.id,
      bookingId: r.booking_id,
      time:      rd[timeKey]    ?? '',
      airport:   rd[airportKey] ?? 'cancun',
      firstName: rd.firstName   ?? '',
      lastName:  rd.lastName    ?? '',
      data:      rd,
    };
  };

  // Full set — used only for group size calculation
  const allEntries = allDateRows.map(toEntry);
  // Booking scope — used for void/recharge
  const bkRowIds   = new Set(allRows.map(r => r.id));
  const entries    = allEntries.filter(e => bkRowIds.has(e.rowId));

  const groupKeyMap = new Map();
  allEntries.forEach(e => {
    const dk = `${dirPfx}|${e.rowId}`;
    if (userGroupMap.has(dk)) groupKeyMap.set(dk, userGroupMap.get(dk));
  });
  const ungrouped = allEntries.filter(e => !groupKeyMap.has(`${dirPfx}|${e.rowId}`));
  clusterEntries(ungrouped).forEach((cl, i) => {
    cl.forEach(e => groupKeyMap.set(`${dirPfx}|${e.rowId}`, `auto_${i}`));
  });
  allEntries.forEach(e => {
    const dk = `${dirPfx}|${e.rowId}`;
    if (!groupKeyMap.has(dk)) groupKeyMap.set(dk, `solo_${e.rowId}`);
  });

  // groups contains ALL members per group key (including cross-booking rows)
  const groups = new Map();
  allEntries.forEach(e => {
    const gk = groupKeyMap.get(`${dirPfx}|${e.rowId}`);
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(e);
  });

  // 6. Load booking flags + registrations
  const bkMap    = {};
  const regsByBk = {};
  if (bkId) {
    const [bkRes, regRes] = await Promise.all([
      supaFetch(supaKey, `bookings?select=id,flags,leader_name&id=eq.${bkId}&limit=1`),
      supaFetch(supaKey, `registrations?select=id,booking_id,room,guests,is_teacher_room&booking_id=eq.${bkId}`),
    ]);
    (Array.isArray(bkRes.data)  ? bkRes.data  : []).forEach(b => { bkMap[b.id]                 = b; });
    (Array.isArray(regRes.data) ? regRes.data : []).forEach(r => { (regsByBk[r.booking_id] ??= []).push(r); });
  }

  const results  = { date, direction, voided, recharged: [], skipped: [], errors: [] };
  const now_iso  = new Date().toISOString();

  // 7. Re-run charging
  if (bkId) {
    const bk = bkMap[bkId];
    if (!bk) {
      results.errors.push({ reason: 'booking_not_found' });
    } else {
      const flagKey     = direction === 'arrival' ? 'teacher_pays_arrival_transport' : 'teacher_pays_departure_transport';
      const teacherPays = (bk.flags ?? []).includes(flagKey);
      const regs        = regsByBk[bkId] ?? [];
      const teacherReg  = regs.find(r => r.is_teacher_room);

      if (teacherPays) {
        if (!teacherReg) {
          results.errors.push({ reason: 'no_teacher_registration' });
        } else {
          let total = 0;
          entries.forEach(e => {
            const gk  = groupKeyMap.get(`${dirPfx}|${e.rowId}`) ?? `solo_${e.rowId}`;
            const pax = (groups.get(gk) ?? [e]).length;
            total += autoRate(e.airport, pax) ?? 0;
          });
          if (total <= 0) {
            results.skipped.push({ reason: 'zero_total' });
          } else {
            const teacherName = (teacherReg.guests ?? []).find(g => g.name)?.name ?? bk.leader_name ?? '';
            const gc = entries.length;
            const { folioItemId, error } = await chargeFolio(supaKey, {
              registrationId: teacherReg.id,
              guestName:      teacherName,
              description:    `${direction === 'arrival' ? 'Arrival' : 'Departure'} Transport ${date} — ${gc} guest${gc !== 1 ? 's' : ''} (adjusted)`,
              unitPrice:      total,
            });
            if (error) {
              results.errors.push({ reason: error });
            } else {
              for (const e of entries) {
                const newData = {
                  ...e.data,
                  folioCharged: {
                    ...(e.data.folioCharged ?? {}),
                    [itemIdKey]:    folioItemId,
                    [amountKey]:    total / entries.length,
                    [chargedAtKey]: now_iso,
                    [paidByKey]:    'teacher',
                  },
                };
                await supaFetch(supaKey, `transport?id=eq.${e.rowId}`, 'PATCH', { data: newData });
              }
              results.recharged.push({ paidBy: 'teacher', total, guests: entries.length, folioItemId });
            }
          }
        }
      } else {
        for (const e of entries) {
          const gk   = groupKeyMap.get(`${dirPfx}|${e.rowId}`) ?? `solo_${e.rowId}`;
          const pax  = (groups.get(gk) ?? [e]).length;
          const rate = autoRate(e.airport, pax);
          if (!rate) { results.skipped.push({ rowId: e.rowId, reason: 'no_rate' }); continue; }

          const fullName = `${e.firstName} ${e.lastName}`.trim().toLowerCase();
          const reg = regs.find(r =>
            !r.is_teacher_room &&
            (r.guests ?? []).some(g => g.name && nameMatch(g.name, fullName))
          );
          if (!reg) { results.errors.push({ rowId: e.rowId, name: fullName, reason: 'no_registration' }); continue; }

          const { folioItemId, error } = await chargeFolio(supaKey, {
            registrationId: reg.id,
            guestName:      (reg.guests ?? []).find(g => g.name)?.name ?? '',
            description:    `${direction === 'arrival' ? 'Arrival' : 'Departure'} Transport ${date} — ${e.airport?.toUpperCase()} ${e.time ?? ''} (adjusted)`,
            unitPrice:      rate,
          });
          if (error) { results.errors.push({ rowId: e.rowId, name: fullName, reason: error }); continue; }

          const newData = {
            ...e.data,
            folioCharged: {
              ...(e.data.folioCharged ?? {}),
              [itemIdKey]:    folioItemId,
              [amountKey]:    rate,
              [chargedAtKey]: now_iso,
              [paidByKey]:    'guest',
            },
          };
          await supaFetch(supaKey, `transport?id=eq.${e.rowId}`, 'PATCH', { data: newData });
          results.recharged.push({ rowId: e.rowId, name: fullName, amount: rate, folioItemId });
        }
      }
    }
  } else {
    // No booking_id: fall back to name-lookup across all registrations
    const allRegsRes = await supaFetch(supaKey, 'registrations?select=id,booking_id,room,guests&limit=2000');
    const allRegs    = allRegsRes.ok ? (allRegsRes.data ?? []) : [];
    const findReg    = name => allRegs.filter(r => (r.guests ?? []).some(g => g.name && nameMatch(g.name, name)));

    for (const e of entries) {
      const gk   = groupKeyMap.get(`${dirPfx}|${e.rowId}`) ?? `solo_${e.rowId}`;
      const pax  = (groups.get(gk) ?? [e]).length;
      const rate = autoRate(e.airport, pax);
      if (!rate) { results.skipped.push({ rowId: e.rowId, reason: 'no_rate' }); continue; }

      const fullName = `${e.firstName} ${e.lastName}`.trim().toLowerCase();
      const matches  = findReg(fullName);
      if (!matches.length) { results.errors.push({ rowId: e.rowId, name: fullName, reason: 'no_registration' }); continue; }
      if (matches.length > 1) { results.errors.push({ rowId: e.rowId, name: fullName, reason: 'ambiguous_name' }); continue; }
      const reg = matches[0];

      const { folioItemId, error } = await chargeFolio(supaKey, {
        registrationId: reg.id,
        guestName:      (reg.guests ?? []).find(g => g.name)?.name ?? '',
        description:    `${direction === 'arrival' ? 'Arrival' : 'Departure'} Transport ${date} — ${e.airport?.toUpperCase()} ${e.time ?? ''} (adjusted)`,
        unitPrice:      rate,
      });
      if (error) { results.errors.push({ rowId: e.rowId, name: fullName, reason: error }); continue; }

      const newData = {
        ...e.data,
        folioCharged: {
          ...(e.data.folioCharged ?? {}),
          [itemIdKey]:    folioItemId,
          [amountKey]:    rate,
          [chargedAtKey]: now_iso,
          [paidByKey]:    'guest',
        },
      };
      await supaFetch(supaKey, `transport?id=eq.${e.rowId}`, 'PATCH', { data: newData });
      results.recharged.push({ rowId: e.rowId, name: fullName, amount: rate, folioItemId, source: 'name_lookup' });
    }
  }

  console.log('[adjust-transport-charge] done:', JSON.stringify(results));
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify(results),
  };
};
