'use strict';

// Runs hourly via pg_cron. Checks Airlabs for updated arrival times on all
// transport rows with a flight number arriving today or tomorrow.
//
// Logic:
//   CANCELLED  → update row status + label, store alert, NO auto charge adjustment
//   DELAYED    → if arrival time changed >5 min, update row + adjust charges
//   ON TIME    → update monitoring timestamp + label, no alert, no charge change

const SUPABASE_URL  = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const AIRLABS_URL   = 'https://airlabs.co/api/v9/flight';
const TZ_OFFSET_MIN = -5 * 60; // Cancun/Tulum UTC-5

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

function tulumDateStr(offsetDays = 0) {
  const now  = new Date();
  const tulu = new Date(now.getTime() + (TZ_OFFSET_MIN + now.getTimezoneOffset()) * 60000);
  tulu.setDate(tulu.getDate() + offsetDays);
  return tulu.toISOString().slice(0, 10);
}

function buildLabel(status, delayedMin, timeDiffMin) {
  if (status === 'cancelled') return 'CANCELLED';
  const delay = delayedMin ?? (timeDiffMin > 0 ? timeDiffMin : null);
  if (delay && delay > 5)    return `DELAYED +${delay}min`;
  if (timeDiffMin < -5)      return `EARLY ${timeDiffMin}min`;
  return 'ON TIME';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' }, body: '' };
  }

  const supaKey    = process.env.SUPABASE_SERVICE_KEY;
  const airlabsKey = process.env.AIRLABS_API_KEY;
  if (!supaKey)    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SUPABASE_SERVICE_KEY' }) };
  if (!airlabsKey) return { statusCode: 500, body: JSON.stringify({ error: 'Missing AIRLABS_API_KEY' }) };

  const today    = tulumDateStr(0);
  const tomorrow = tulumDateStr(1);
  console.log(`[monitor-flights] checking arrivals for ${today} and ${tomorrow}`);

  // 1. Fetch transport rows with flight numbers arriving today or tomorrow
  const trRes = await supaFetch(supaKey, 'transport?select=id,booking_id,data&order=id');
  const rows  = (trRes.ok ? (trRes.data ?? []) : []).filter(r => {
    const d = r.data ?? {};
    return d.flightNumber &&
           !d.arrivalOT &&
           d.arrivalDate &&
           (d.arrivalDate === today || d.arrivalDate === tomorrow);
  });

  if (!rows.length) {
    console.log('[monitor-flights] no rows with flight numbers for today/tomorrow');
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ today, tomorrow, checked: 0, updated: [], errors: [] }),
    };
  }

  // 2. Group rows by flight number (avoid duplicate API calls)
  const flightMap = new Map(); // "AA154" → [row, row, ...]
  for (const r of rows) {
    const fn = (r.data.flightNumber ?? '').trim().toUpperCase().replace(/\s+/g, '');
    if (!fn) continue;
    if (!flightMap.has(fn)) flightMap.set(fn, []);
    flightMap.get(fn).push(r);
  }

  const results  = { today, tomorrow, checked: flightMap.size, updated: [], unchanged: 0, errors: [] };
  const siteUrl  = process.env.URL ?? 'https://amansala-staging.netlify.app';
  const alertList = []; // collect alerts to store in settings

  // 3. Check each flight with Airlabs
  for (const [flightIata, flightRows] of flightMap) {
    try {
      const apiRes  = await fetch(`${AIRLABS_URL}?flight_iata=${encodeURIComponent(flightIata)}&api_key=${airlabsKey}`);
      const apiJson = await apiRes.json().catch(() => null);

      if (!apiRes.ok || !apiJson?.response) {
        const errMsg = apiJson?.error?.message ?? apiJson?.error ?? `HTTP ${apiRes.status}`;
        results.errors.push({ flight: flightIata, reason: errMsg });
        continue;
      }

      const fl          = apiJson.response;
      const status      = fl.status ?? 'unknown'; // scheduled | en-route | landed | cancelled
      const delayed     = fl.delayed ?? null;      // delay in minutes (if reported by Airlabs)
      const isCancelled = status === 'cancelled';

      // Airlabs returns arr_time in local destination time (CUN = same as Tulum)
      // Prefer actual over estimated: arr_time > arr_estimated
      const rawTime  = fl.arr_time ?? fl.arr_estimated ?? null;
      let newTime    = null;
      let newMins    = null;

      if (!isCancelled) {
        if (!rawTime) {
          results.errors.push({ flight: flightIata, reason: 'no_arrival_time_in_response' });
          continue;
        }
        const timePart = rawTime.includes(' ') ? rawTime.split(' ')[1] : rawTime;
        newTime = timePart.slice(0, 5);
        newMins = toMinutes(newTime);
        if (newMins === null) {
          results.errors.push({ flight: flightIata, reason: `bad_time_format: ${rawTime}` });
          continue;
        }
      }

      // 4. Process each row for this flight
      for (const r of flightRows) {
        const oldTime      = r.data.arrivalTime ?? '';
        const oldMins      = toMinutes(oldTime);
        const prevStatus   = r.data.flightStatus ?? null;
        const diffMin      = (!isCancelled && oldMins !== null && newMins !== null) ? (newMins - oldMins) : null;

        // Compute human-readable label
        const label = buildLabel(status, delayed, diffMin ?? 0);

        // Determine what changed
        const timeChanged   = !isCancelled && oldMins !== null && Math.abs(diffMin) > 5;
        const statusChanged = prevStatus !== status;
        const needsUpdate   = timeChanged || statusChanged || isCancelled;

        if (!needsUpdate) {
          results.unchanged++;
          continue;
        }

        console.log(`[monitor-flights] ${flightIata} rowId=${r.id}: status=${status} label=${label}${diffMin !== null ? ` time ${oldTime||'none'}→${newTime} (${diffMin > 0 ? '+' : ''}${diffMin}min)` : ''}`);

        // Build updated data — only update arrivalTime if NOT cancelled and time actually changed
        const newData = {
          ...r.data,
          flightStatus:      status,
          flightLabel:       label,
          flightDelayMin:    delayed,
          flightMonitoredAt: new Date().toISOString(),
          ...(timeChanged ? {
            arrivalTime:    newTime,
            flightPrevTime: oldTime || null,
          } : {}),
        };

        const patchRes = await supaFetch(supaKey, `transport?id=eq.${r.id}`, 'PATCH', { data: newData });
        if (!patchRes.ok) {
          results.errors.push({ flight: flightIata, rowId: r.id, reason: 'patch_failed', detail: JSON.stringify(patchRes.data) });
          continue;
        }

        const hasCharge = !!r.data.folioCharged?.arrivalFolioItemId;
        let chargeAdjusted = null;

        if (isCancelled) {
          // CANCELLED: never auto-adjust — admin must review and decide
          chargeAdjusted = hasCharge ? 'pending_admin_review' : null;
          console.log(`[monitor-flights] ${flightIata} rowId=${r.id}: CANCELLED — charge adjustment skipped, admin review required`);
        } else if (timeChanged && hasCharge) {
          // DELAYED/EARLY with significant time change: auto-adjust charge
          try {
            const adjRes  = await fetch(`${siteUrl}/.netlify/functions/adjust-transport-charge`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ rowId: String(r.id), direction: 'arrival' }),
            });
            const adjJson = await adjRes.json().catch(() => ({}));
            chargeAdjusted = adjRes.ok
              ? (adjJson.recharged?.length > 0 ? 'recharged' : 'voided')
              : `error_${adjRes.status}`;
          } catch (e) {
            chargeAdjusted = `exception: ${e.message}`;
          }
        }

        const entry = {
          flight:         flightIata,
          rowId:          r.id,
          guest:          `${r.data.firstName ?? ''} ${r.data.lastName ?? ''}`.trim(),
          date:           r.data.arrivalDate,
          label,
          status,
          oldTime:        oldTime || null,
          newTime:        isCancelled ? null : newTime,
          delayMin:       diffMin,
          chargeAdjusted,
        };
        results.updated.push(entry);

        // Only store alerts for CANCELLED or significant DELAY (not status-only updates)
        if (isCancelled || (timeChanged && Math.abs(diffMin) > 5)) {
          alertList.push(entry);
        }
      }
    } catch (e) {
      results.errors.push({ flight: flightIata, reason: e.message });
    }
  }

  // 5. Store alerts in settings for dashboard notifications
  if (alertList.length) {
    const alertsRes = await supaFetch(supaKey, 'settings?select=value&key=eq.flight_alerts&limit=1');
    const existing  = (alertsRes.ok && Array.isArray(alertsRes.data) && alertsRes.data[0]?.value) ? alertsRes.data[0].value : [];
    const newAlerts = alertList.map(u => ({
      id:             `flight_${u.flight}_${u.rowId}_${Date.now()}`,
      flight:         u.flight,
      guest:          u.guest,
      date:           u.date,
      label:          u.label,
      status:         u.status,
      oldTime:        u.oldTime,
      newTime:        u.newTime,
      delayMin:       u.delayMin,
      chargeAdjusted: u.chargeAdjusted,
      detectedAt:     new Date().toISOString(),
      dismissed:      false,
    }));
    const merged = [...newAlerts, ...existing].slice(0, 50);
    await supaFetch(supaKey, 'settings?key=eq.flight_alerts', 'PATCH', { value: merged });
  }

  console.log('[monitor-flights] done:', JSON.stringify(results));
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify(results),
  };
};
