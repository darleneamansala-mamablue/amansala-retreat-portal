'use strict';
// Shared by auto-charge-transport.js and adjust-transport-charge.js.
//
// 1. dedupeGuests(): the SAME one-row-per-guest view the Transport screen shows (modules/transport.js,
//    normalizedRows + dedupedRows + pickBetter). Both functions used to charge every raw transport row,
//    so a guest with a placeholder stub plus a real submission (or two submissions) was charged once per
//    row, and the extra rows also counted as extra passengers in the shared-van price.
//    Real case 2026-10-21/22: about ten folios charged twice for the 2026-10-23 departures.
// 2. reconcileCharges(): makes a registration's system transport charges for one direction + date match
//    what it should be. An existing charge is EDITED (price + text) instead of a new one being added next to
//    it, extra ones are deleted, and only a missing one is inserted. "Existing" = the folio items any of the
//    guest's rows point to, plus any item on the registration's folios whose text starts with
//    "<Arrival|Departure> Transport <date>" (the text both functions write), so a charge whose link on the
//    row was lost (or sits on the guest's other, duplicate row) is still found. Hand-entered charges
//    ("Departure Cancun airport 6 or + Sharing") never match that text and are left alone.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const DEFAULT_RATES = {
  cancun: [195, 100, 80, 65, 55, 45],
  tulum:  [145,  80, 65, 55, 45, 40],
};

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

// GET every row of a query (PostgREST hands back at most 1000 per request)
async function fetchAll(key, path) {
  const out = [];
  for (let off = 0; off < 50000; off += 1000) {
    const r = await supaFetch(key, `${path}${path.includes('?') ? '&' : '?'}limit=1000&offset=${off}`);
    if (!r.ok) return { error: JSON.stringify(r.data) };
    out.push(...(r.data || []));
    if ((r.data || []).length < 1000) break;
  }
  return { data: out };
}

// Staff-editable in Admin > Settings (app_store 'portal_settings'); the defaults only if never saved.
async function loadRates(key) {
  const r = await supaFetch(key, 'app_store?key=eq.portal_settings&select=value');
  const saved = r.ok && Array.isArray(r.data) && r.data[0]?.value?.transportRates;
  return saved || DEFAULT_RATES;
}
function autoRate(rates, airport, pax) {
  const tbl = rates[airport];
  if (!tbl) return null;
  return tbl[Math.min(pax - 1, tbl.length - 1)];
}

function toMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
// Same booking + airport + <=20-min window (transport.js auto-cluster)
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

// Fuzzy name match: all tokens of the shorter name appear in the longer name
function nameMatch(a, b) {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const tokA = norm(a).split(/\s+/).filter(Boolean);
  const tokB = norm(b).split(/\s+/).filter(Boolean);
  const [shorter, longer] = tokA.length <= tokB.length ? [tokA, tokB] : [tokB, tokA];
  return shorter.length > 0 && shorter.every(t => longer.includes(t));
}

// Looser, for names typed by hand in a charge line: each word may be cut short ("Alexandria Mirzaya" = Alexandria Mirzayan)
function nameLoose(a, b) {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().split(/\s+/).filter(Boolean);
  const [sh, lo] = [norm(a), norm(b)].sort((x, y) => x.length - y.length);
  return sh.length > 0 && sh.every(t => lo.some(u => u === t || (t.length >= 3 && u.length >= 3 && (u.startsWith(t) || t.startsWith(u)))));
}

// ---- One row per guest, exactly as the Transport screen picks it ----
function levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  let prev = Array.from({ length: bl + 1 }, (_, i) => i);
  for (let i = 1; i <= al; i++) {
    const cur = [i];
    for (let j = 1; j <= bl; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    prev = cur;
  }
  return prev[bl];
}
const normDate = s => { if (!s) return ''; const p = String(s).trim().split('-'); return p.length === 3 ? `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}` : String(s).trim(); };
function pickBetter(cur, row) {
  const score = r => {
    const d = r.data || {};
    let s = (d.arrivalDate ? 2 : 0) + (d.flightNumber ? 1 : 0) + (d.departureDate ? 1 : 0) + (r.booking_id ? 1 : 0);
    if (d.roomOverride) s += 2;
    if (d.arrivalAirport) s += 1;
    if (d.departureAirport) s += 1;
    if (!(d.arrivalOT && d.departureOT)) s += 2;
    return s;
  };
  const sRow = score(row), sCur = score(cur);
  if (sRow > sCur) return row;
  if (sRow < sCur) return cur;
  const aRow = row.submitted_at || '', aCur = cur.submitted_at || '';
  if (aRow && aCur) return aRow > aCur ? row : cur;
  return String(row.id) > String(cur.id) ? row : cur;
}
// rows: transport rows (id, booking_id, submitted_at, data). regs: registrations (booking_id, guests, cancelled), used only
// to prefer the spelling that matches a real guest when merging name variants.
// Returns [{ row: the row the screen shows, members: every raw row of that guest (row included) }].
function dedupeGuests(rows, regs) {
  rows = [...(rows || [])].sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));
  const regName = new Set();
  (regs || []).forEach(r => { if (r.cancelled) return; (r.guests || []).forEach(g => { if (g.name && !g.cancelled) regName.add(`${r.booking_id}|${g.name.toLowerCase()}`); }); });
  const bkOf = r => r.booking_id || (r.data || {}).bookingId || '';

  // Name variants of one person (same email, or same booking): rewrite them to one spelling
  const rename = new Map();
  const fuzzyPart = (a, b) => a === b || levenshtein(a, b) <= 1 || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));
  const clusterAndRename = groups => groups.forEach(group => {
    if (group.length < 2) return;
    const clusters = [];
    group.forEach(row => {
      const d = row.data || {};
      const fn = (d.firstName || '').trim().toLowerCase(), ln = (d.lastName || '').trim().toLowerCase();
      if (!fn && !ln) return;
      const t = clusters.find(c => fuzzyPart(c.fn, fn) && fuzzyPart(c.ln, ln));
      if (t) t.rows.push(row); else clusters.push({ fn, ln, rows: [row] });
    });
    clusters.forEach(c => {
      if (c.rows.length < 2) return;
      const reg = c.rows.find(row => {
        const d = row.data || {}, full = `${(d.firstName || '').trim()} ${(d.lastName || '').trim()}`.trim().toLowerCase();
        return bkOf(row) && full && regName.has(`${bkOf(row)}|${full}`);
      });
      const best = reg || c.rows.reduce((a, b) => pickBetter(a, b));
      const bd = best.data || {};
      c.rows.forEach(row => { if (row.id !== best.id) rename.set(row.id, { firstName: bd.firstName, lastName: bd.lastName }); });
    });
  });
  const byEmail = new Map(), byBooking = new Map();
  rows.forEach(row => {
    const em = ((row.data || {}).email || '').toLowerCase().trim();
    if (em) { if (!byEmail.has(em)) byEmail.set(em, []); byEmail.get(em).push(row); }
  });
  clusterAndRename(byEmail);
  rows.forEach(row => {
    const bk = bkOf(row);
    if (bk) { if (!byBooking.has(bk)) byBooking.set(bk, []); byBooking.get(bk).push(row); }
  });
  clusterAndRename(byBooking);
  const norm = rows.map(row => { const rn = rename.get(row.id); return rn ? { ...row, data: { ...(row.data || {}), firstName: rn.firstName, lastName: rn.lastName } } : row; });

  const merge = (map, key, row, members) => {
    const cur = map.get(key);
    if (!cur) { map.set(key, { row, members }); return; }
    cur.row = pickBetter(cur.row, row); cur.members.push(...members);
  };
  const map = new Map();
  norm.forEach((row, i) => {
    const d = row.data || {};
    const em = (d.email || '').toLowerCase().trim(), fn = (d.firstName || '').toLowerCase().trim(), ln = (d.lastName || '').toLowerCase().trim();
    const key = em ? `email|${bkOf(row)}|${em}|${fn}_${ln}` : `name|${fn}_${ln}|${normDate(d.arrivalDate)}|${normDate(d.departureDate)}`;
    merge(map, key, row, [rows[i]]);
  });
  const map2 = new Map();
  for (const g of map.values()) {
    const d = g.row.data || {};
    merge(map2, `${bkOf(g.row)}|${(d.firstName || '').toLowerCase().trim()}_${(d.lastName || '').toLowerCase().trim()}`, g.row, g.members);
  }
  // `row` keeps the merged spelling (what the screen shows); members are the untouched raw rows (what gets PATCHed)
  return [...map2.values()].map(g => ({ row: g.row, members: g.members, raw: g.members.find(m => m.id === g.row.id) || g.row }));
}

// ---- Folio charges ----
// The folio a charge goes on: that guest's own folio when they have one (two guests in a room often each have theirs), else the
// first guest's folio, else the oldest open one, else a new one.
async function findOrCreateFolio(key, registrationId, guestName, forGuest) {
  const regLookup = await supaFetch(key, `registrations?select=guests&id=eq.${encodeURIComponent(registrationId)}&limit=1`);
  const regRow = Array.isArray(regLookup.data) ? regLookup.data[0] : null;
  const canonical = regRow?.guests?.find(g => g.name)?.name ?? guestName ?? '';
  if (forGuest && forGuest !== canonical) {
    const own = await supaFetch(key, `folios?select=id&registration_id=eq.${encodeURIComponent(registrationId)}&guest_name=eq.${encodeURIComponent(forGuest)}&limit=1`);
    if (own.ok && Array.isArray(own.data) && own.data.length) return { folioId: own.data[0].id };
  }
  const exactRes = await supaFetch(key, `folios?select=id&registration_id=eq.${encodeURIComponent(registrationId)}&guest_name=eq.${encodeURIComponent(canonical)}&limit=1`);
  if (exactRes.ok && Array.isArray(exactRes.data) && exactRes.data.length) return { folioId: exactRes.data[0].id };
  const anyRes = await supaFetch(key, `folios?select=id&registration_id=eq.${encodeURIComponent(registrationId)}&status=eq.open&order=created_at.asc&limit=1`);
  if (anyRes.ok && Array.isArray(anyRes.data) && anyRes.data.length) return { folioId: anyRes.data[0].id };
  const createRes = await supaFetch(key, 'folios', 'POST', {
    registration_id: registrationId, guest_name: canonical, name: canonical,
    payment_token: crypto.randomUUID().replace(/-/g, ''), status: 'open',
  });
  if (!createRes.ok) return { error: `folio_create_failed: ${JSON.stringify(createRes.data)}` };
  const created = Array.isArray(createRes.data) ? createRes.data[0] : createRes.data;
  return created?.id ? { folioId: created.id } : { error: 'folio_created_no_id' };
}

// The system transport charges already on a registration for one direction + date (see the header).
async function existingCharges(key, registrationId, label, date, linkedIds) {
  const fr = await supaFetch(key, `folios?select=id&registration_id=eq.${encodeURIComponent(registrationId)}`);
  const folioIds = (Array.isArray(fr.data) ? fr.data : []).map(f => f.id);
  const byId = new Map();
  if (folioIds.length) {
    const ir = await supaFetch(key, `folio_items?select=id,folio_id,description,unit_price,qty,created_at&folio_id=in.(${folioIds.join(',')})&description=like.${encodeURIComponent(`${label} Transport ${date}*`)}&order=created_at.asc`);
    (Array.isArray(ir.data) ? ir.data : []).forEach(i => byId.set(i.id, i));
  }
  const missing = [...new Set(linkedIds || [])].filter(id => id && !byId.has(id));
  if (missing.length) {
    const lr = await supaFetch(key, `folio_items?select=id,folio_id,description,unit_price,qty,created_at,category&id=in.(${missing.join(',')})`);
    (Array.isArray(lr.data) ? lr.data : []).forEach(i => { if (/^transport/i.test(i.category || 'transport')) byId.set(i.id, i); });
  }
  return [...byId.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

// Make one registration's charges for this direction + date equal `wanted` ([{ description, unitPrice }]).
// mode 'insertOnly' (the nightly run): never edits or deletes, only adds what is missing.
// Returns the item id for each wanted charge (same order) plus what was done.
async function reconcileCharges(key, { registrationId, guestName, label, date, wanted, linkedIds, mode, dryRun }) {
  const have = await existingCharges(key, registrationId, label, date, linkedIds);
  const out = { itemIds: [], updated: [], inserted: [], deleted: [], kept: [] };
  const pool = [...have];
  // Pair each wanted charge with the existing one that is already that guest's (linked on their row, or on their own folio at
  // that price), then any at the same price, so nothing changes needlessly
  const take = (pred) => { const i = pool.findIndex(pred); return i >= 0 ? pool.splice(i, 1)[0] : null; };
  const pairs = wanted.map(() => null);
  wanted.forEach((w, n) => { pairs[n] = take(h => (w.linked || []).includes(h.id)); });
  wanted.forEach((w, n) => { if (!pairs[n] && w.folioId) pairs[n] = take(h => h.folio_id === w.folioId && Number(h.unit_price) === Number(w.unitPrice)); });
  wanted.forEach((w, n) => { if (!pairs[n]) pairs[n] = take(h => Number(h.unit_price) === Number(w.unitPrice)); });
  const insertOnly = mode === 'insertOnly';
  const folioFor = new Map();
  for (let n = 0; n < wanted.length; n++) {
    const w = wanted[n];
    const h = pairs[n] || pool.shift() || null;
    if (h) {
      out.itemIds.push(h.id);
      // Same price and same ride (the " (adjusted)" tag aside): nothing to change
      const base = t => String(t || '').replace(/ \(adjusted\)$/, '');
      const same = Number(h.unit_price) === Number(w.unitPrice) && base(h.description) === base(w.description);
      if (same || insertOnly) { out.kept.push(h.id); continue; }
      if (!dryRun) {
        const r = await supaFetch(key, `folio_items?id=eq.${h.id}`, 'PATCH', { description: w.description, unit_price: w.unitPrice, qty: 1 });
        if (!r.ok) return { error: `folio_item_update_failed: ${JSON.stringify(r.data)}` };
      }
      out.updated.push({ id: h.id, from: Number(h.unit_price), to: w.unitPrice });
      continue;
    }
    if (dryRun) { out.itemIds.push('(new)'); out.inserted.push({ unitPrice: w.unitPrice }); continue; }
    const fk = w.guestName || '';
    if (!folioFor.has(fk)) { const f = await findOrCreateFolio(key, registrationId, guestName, w.guestName); if (f.error) return f; folioFor.set(fk, f.folioId); }
    const r = await supaFetch(key, 'folio_items', 'POST', { folio_id: folioFor.get(fk), description: w.description, qty: 1, unit_price: w.unitPrice, tax_rate: 13, category: 'Transport' });
    if (!r.ok) return { error: `folio_item_failed: ${JSON.stringify(r.data)}` };
    const saved = Array.isArray(r.data) ? r.data[0] : r.data;
    out.itemIds.push(saved?.id); out.inserted.push({ id: saved?.id, unitPrice: w.unitPrice });
  }
  // Whatever is left over is a duplicate of a system charge -- removed (never in the nightly run)
  if (!insertOnly) {
    for (const h of pool) {
      if (!dryRun) await supaFetch(key, `folio_items?id=eq.${h.id}`, 'DELETE');
      out.deleted.push({ id: h.id, amount: Number(h.unit_price) * (Number(h.qty) || 1) });
    }
  }
  return out;
}

// Point a guest's rows at their charge: the shown row gets the link, the guest's other rows lose any stale one.
async function linkRows(key, guest, f, link, dryRun) {
  for (const m of guest.members) {
    const fc = { ...(m.data?.folioCharged ?? {}) };
    if (m.id === guest.raw.id && link) { if (fc[f.itemId] === link[f.itemId] && fc[f.amount] === link[f.amount]) continue; Object.assign(fc, link); }
    else if (fc[f.itemId]) { delete fc[f.itemId]; delete fc[f.amount]; delete fc[f.chargedAt]; delete fc[f.paidBy]; }
    else continue;
    const data = { ...m.data };
    if (Object.keys(fc).length) data.folioCharged = fc; else delete data.folioCharged;
    if (!dryRun) await supaFetch(key, `transport?id=eq.${encodeURIComponent(m.id)}`, 'PATCH', { data });
    m.data = data;
  }
}

function fields(direction) {
  const a = direction === 'arrival';
  return {
    date: a ? 'arrivalDate' : 'departureDate', ot: a ? 'arrivalOT' : 'departureOT', time: a ? 'arrivalTime' : 'departureTime',
    airport: a ? 'arrivalAirport' : 'departureAirport', itemId: a ? 'arrivalFolioItemId' : 'departureFolioItemId',
    amount: a ? 'arrivalAmount' : 'departureAmount', chargedAt: a ? 'arrivalChargedAt' : 'departureChargedAt',
    paidBy: a ? 'arrivalPaidBy' : 'departurePaidBy', teacherFlag: a ? 'teacher_pays_arrival_transport' : 'teacher_pays_departure_transport',
    label: a ? 'Arrival' : 'Departure',
  };
}

// The ride groups for one direction + date over the deduped guests: saved drag-to-share groups first, else the auto-cluster.
function rideGroups(guests, direction, savedGroups) {
  const userGroupMap = new Map(savedGroups || []);
  const groupKeyMap = new Map();
  guests.forEach(e => { const dk = `${direction}|${e.rowId}`; if (userGroupMap.has(dk)) groupKeyMap.set(dk, userGroupMap.get(dk)); });
  clusterEntries(guests.filter(e => !groupKeyMap.has(`${direction}|${e.rowId}`))).forEach((cl, i) => cl.forEach(e => groupKeyMap.set(`${direction}|${e.rowId}`, `auto_${i}`)));
  const size = new Map();
  guests.forEach(e => { const gk = groupKeyMap.get(`${direction}|${e.rowId}`) || `solo_${e.rowId}`; size.set(gk, (size.get(gk) || 0) + 1); });
  return e => size.get(groupKeyMap.get(`${direction}|${e.rowId}`) || `solo_${e.rowId}`) || 1;
}

// Transport charges staff posted by hand for this direction ("Departure Cancun airport 6 or + Sharing", "Arrival Tulum airport private"),
// i.e. any Transport line starting with Arrival/Departure that is not the system's "<label> Transport <date>" text. A name in
// parentheses means it is for that guest ("Departure Cancun (Molly Maclean)" on the friend who pays); otherwise it is for the
// registration's own guests, one per qty. Looked at from 45 days before the ride (a registration only arrives / leaves once).
// Real case 2026-10-22: Carter Foxworth's departure posted by hand, which a system charge would have doubled.
async function handCharges(key, label, date) {
  const since = new Date(new Date(date + 'T12:00:00Z').getTime() - 45 * 86400000).toISOString();
  const ir = await fetchAll(key, `folio_items?select=id,folio_id,description,qty&category=ilike.transport*&description=like.${encodeURIComponent(label + '*')}&created_at=gte.${encodeURIComponent(since)}&order=id`);
  const items = (ir.data || []).filter(i => !new RegExp(`^${label} Transport \\d{4}-\\d{2}-\\d{2}`).test(i.description || ''));
  const named = [], ownByReg = new Map();
  const folioIds = [...new Set(items.map(i => i.folio_id))];
  const regOfFolio = new Map();
  for (let i = 0; i < folioIds.length; i += 100) {
    const fr = await supaFetch(key, `folios?select=id,registration_id&id=in.(${folioIds.slice(i, i + 100).join(',')})`);
    (Array.isArray(fr.data) ? fr.data : []).forEach(x => regOfFolio.set(x.id, x.registration_id));
  }
  items.forEach(i => {
    const m = String(i.description).match(/\(([^)]+)\)\s*$/);
    const q = Math.max(1, Math.round(Number(i.qty) || 1));
    if (m && /[a-z]{2,}\s+[a-z]/i.test(m[1])) { for (let n = 0; n < q; n++) named.push(m[1].trim()); return; }
    const reg = regOfFolio.get(i.folio_id);
    if (reg) ownByReg.set(reg, (ownByReg.get(reg) || 0) + q);
  });
  return { named, ownByReg };
}

// ---- The whole charge run, shared by both functions ----
// opts: { direction, date, mode: 'insertOnly' (nightly auto-charge: only add what is missing) | 'sync' (adjust: edit / remove too),
//         bookingId: limit to one booking (adjust), triggerRowId: the row whose edit caused the adjust (always in scope, even when it
//         is no longer eligible -- e.g. switched to Own Transport -- so its old charge goes away), suffix: added to new descriptions,
//         dryRun: plan only, write nothing }
async function runCharges(key, opts) {
  const { direction, date, mode, dryRun } = opts;
  const f = fields(direction);
  const suffix = opts.suffix || '';
  const res = { date, direction, mode, dryRun: !!dryRun, charged: [], updated: [], kept: [], deleted: [], skipped: [], errors: [] };

  const [rates, rowsR, regsR, grpRes] = await Promise.all([
    loadRates(key),
    fetchAll(key, 'transport?select=id,booking_id,submitted_at,data&order=id'),
    fetchAll(key, 'registrations?select=id,booking_id,room,guests,is_teacher_room,cancelled&order=id'),
    supaFetch(key, 'settings?select=value&key=eq.transport_groups&limit=1'),
  ]);
  if (rowsR.error) throw new Error('transport fetch failed: ' + rowsR.error);
  if (regsR.error) throw new Error('registrations fetch failed: ' + regsR.error);
  const allRegs = regsR.data;
  const savedGroups = (grpRes.ok && Array.isArray(grpRes.data) && grpRes.data[0]?.value) ? grpRes.data[0].value : [];
  const regsByBk = {};
  allRegs.forEach(r => { (regsByBk[r.booking_id] ??= []).push(r); });

  const entries = dedupeGuests(rowsR.data, allRegs).map(g => {
    const d = g.row.data || {};
    return { rowId: g.row.id, bookingId: g.row.booking_id || d.bookingId || null, time: d[f.time] ?? '', airport: d[f.airport] ?? 'cancun',
      name: `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim(), data: d, guest: g };
  });
  // Cancelled guests never travel: not charged and not counted in anyone's van (Jorge's ask 2026-09-26)
  const isCancelled = e => {
    if (!e.name) return false;
    const cand = e.bookingId ? (regsByBk[e.bookingId] ?? []) : allRegs;
    return cand.some(r => (r.guests ?? []).some(g => g.name && nameMatch(g.name, e.name) && (g.cancelled || r.cancelled)));
  };
  // The guest's room in their own retreat (a guest room before the teacher's), else the one registration anywhere with that name.
  // The teacher's own seat is charged to the teacher room, as before (e.g. Marcia Hoffheins 2026-10-24).
  const has = e => r => (r.guests ?? []).some(g => g.name && nameMatch(g.name, e.name));
  const regMemo = new Map();
  const findReg = e => {
    if (regMemo.has(e)) return regMemo.get(e);
    const mine = e.bookingId ? (regsByBk[e.bookingId] ?? []) : [];
    let reg = mine.find(r => !r.is_teacher_room && has(e)(r)) || mine.find(has(e));
    if (!reg) { const m = allRegs.filter(has(e)); reg = m.length === 1 ? m[0] : (m.length > 1 ? 'ambiguous' : null); }
    regMemo.set(e, reg);
    return reg;
  };
  const linkedOf = list => list.flatMap(e => e.guest.members.map(m => m.data?.folioCharged?.[f.itemId]).filter(Boolean));
  // One seat per registration guest: the same person can still have rows on two retreats (real case: Amanda Becker / Mary Bandish
  // submitted for both back-to-back Wendy Oberg weeks). Keep the row of the retreat their room is in; the other neither pays nor
  // counts as a passenger.
  const onDay = e => e.data[f.date] === date && !e.data[f.ot] && !isCancelled(e);
  const seatKey = e => { const r = findReg(e); return r && r !== 'ambiguous' ? `${r.id}|${(r.guests ?? []).findIndex(g => g.name && nameMatch(g.name, e.name))}` : null; };
  const seatBest = new Map();
  entries.filter(onDay).forEach(e => {
    const k = seatKey(e); if (!k) return;
    const r = findReg(e), score = x => (x.bookingId === r.booking_id ? 2 : 0) + (linkedOf([x]).length ? 1 : 0);
    const cur = seatBest.get(k); if (!cur || score(e) > score(cur)) seatBest.set(k, e);
  });
  const eligible = e => onDay(e) && (!seatKey(e) || seatBest.get(seatKey(e)) === e);
  const onDate = entries.filter(eligible);
  const paxOf = rideGroups(onDate, direction, savedGroups);
  const byHand = await handCharges(key, f.label, date);

  const trigger = opts.triggerRowId ? entries.find(e => e.guest.members.some(m => String(m.id) === String(opts.triggerRowId))) : null;
  // nightly run: everyone on that date. adjust: that booking's guests on that date (no booking: just the edited guest), plus the edited guest
  let scope = opts.bookingId === undefined ? onDate : opts.bookingId ? onDate.filter(e => e.bookingId === opts.bookingId) : [];
  if (trigger && !scope.includes(trigger)) scope = scope.concat(trigger);

  const bkIds = [...new Set(scope.map(e => e.bookingId).filter(Boolean))];
  const bkMap = {};
  if (bkIds.length) {
    const bkRes = await supaFetch(key, `bookings?select=id,flags,leader_name&id=in.(${bkIds.map(encodeURIComponent).join(',')})`);
    (Array.isArray(bkRes.data) ? bkRes.data : []).forEach(b => { bkMap[b.id] = b; });
  }
  const now = new Date().toISOString();
  const report = (out, ctx) => {
    out.inserted.forEach(x => res.charged.push({ ...ctx, amount: x.unitPrice, folioItemId: x.id }));
    out.updated.forEach(x => res.updated.push({ ...ctx, ...x }));
    out.kept.forEach(id => res.kept.push({ ...ctx, folioItemId: id }));
    out.deleted.forEach(x => res.deleted.push({ ...ctx, ...x }));
  };

  const byBooking = new Map();
  scope.forEach(e => { const k = e.bookingId || ''; if (!byBooking.has(k)) byBooking.set(k, []); byBooking.get(k).push(e); });
  const teacherPays = bkId => { const bk = bkMap[bkId]; return !!(bk && (bk.flags ?? []).includes(f.teacherFlag)); };
  const guestPays = [];
  for (const [bkId, list] of byBooking) {
    if (bkId && !bkMap[bkId]) { res.errors.push({ bkId, reason: 'booking_not_found' }); continue; }
    if (!teacherPays(bkId)) { guestPays.push(...list); continue; }
    const bk = bkMap[bkId], travel = list.filter(eligible);
    const teacherReg = (regsByBk[bkId] ?? []).find(r => r.is_teacher_room);
    if (!teacherReg) { res.errors.push({ bkId, reason: 'no_teacher_registration' }); continue; }
    const total = travel.reduce((s, e) => s + (autoRate(rates, e.airport, paxOf(e)) ?? 0), 0);
    const wanted = total > 0 ? [{ description: `${f.label} Transport ${date} — ${travel.length} guest${travel.length !== 1 ? 's' : ''}${suffix}`, unitPrice: total }] : [];
    const out = await reconcileCharges(key, { registrationId: teacherReg.id, guestName: (teacherReg.guests ?? []).find(g => g.name)?.name ?? bk.leader_name ?? '',
      label: f.label, date, wanted, linkedIds: linkedOf(list), mode, dryRun });
    if (out.error) { res.errors.push({ bkId, reason: out.error }); continue; }
    report(out, { bkId, paidBy: 'teacher', guests: travel.length, total });
    for (const e of list) {
      const link = travel.includes(e) && out.itemIds[0] ? { [f.itemId]: out.itemIds[0], [f.amount]: total / travel.length, [f.chargedAt]: now, [f.paidBy]: 'teacher' } : null;
      await linkRows(key, e.guest, f, link, dryRun);
    }
  }

  // Each guest pays their own seat: one reconcile per registration (two guests in a king room share one)
  const byReg = new Map();
  for (const e of guestPays) {
    const reg = findReg(e);
    if (!reg) { if (eligible(e)) res.errors.push({ rowId: e.rowId, name: e.name, reason: 'no_registration' }); continue; }
    if (reg === 'ambiguous') { if (eligible(e)) res.errors.push({ rowId: e.rowId, name: e.name, reason: 'ambiguous_name_multiple_retreats' }); continue; }
    if (!byReg.has(reg.id)) byReg.set(reg.id, { reg, list: [] });
    byReg.get(reg.id).list.push(e);
  }
  // A registration's charges are reconciled as a whole, so every guest of it travelling that day is included even when outside
  // the scope (else a roommate's charge would look like a leftover and be removed)
  if (byReg.size) for (const e of onDate) {
    const r = findReg(e);
    if (r && r !== 'ambiguous' && byReg.has(r.id) && !teacherPays(e.bookingId) && !byReg.get(r.id).list.includes(e)) byReg.get(r.id).list.push(e);
  }
  const folioOf = new Map();
  const regIds = [...byReg.keys()];
  for (let i = 0; i < regIds.length; i += 100) {
    const fr = await supaFetch(key, `folios?select=id,registration_id,guest_name&registration_id=in.(${regIds.slice(i, i + 100).map(encodeURIComponent).join(',')})`);
    (Array.isArray(fr.data) ? fr.data : []).forEach(x => { if (!folioOf.has(`${x.registration_id}|${x.guest_name}`)) folioOf.set(`${x.registration_id}|${x.guest_name}`, x.id); });
  }
  for (const { reg, list: rl } of byReg.values()) {
    const go = [];
    const regGuests = (reg.guests ?? []).filter(g => g.name && !g.cancelled);
    const guestOf = e => (regGuests.find(g => nameMatch(g.name, e.name)) || {}).name || e.name;
    let ownHand = byHand.ownByReg.get(reg.id) || 0;
    rl.filter(eligible).forEach(e => {
      // Already charged by hand (staff posted this ride themselves): never add a system charge next to it
      const named = byHand.named.findIndex(n => nameLoose(n, e.name));
      if (named >= 0 || ownHand > 0) {
        if (named >= 0) byHand.named.splice(named, 1); else ownHand--;
        res.skipped.push({ rowId: e.rowId, name: e.name, room: reg.room, reason: 'charged_by_hand' });
        return;
      }
      const rate = autoRate(rates, e.airport, paxOf(e));
      if (!rate) { res.skipped.push({ rowId: e.rowId, name: e.name, reason: 'no_rate' }); return; }
      // Two or more guests in one room: the guest's name in the text, so their two lines never look like the same charge twice
      // (real case 2026-10-22: staff deleted the second guest's line as a "double" in three rooms)
      const who = regGuests.length > 1 ? ` — ${guestOf(e)}` : '';
      go.push({ e, rate, guestName: guestOf(e), description: `${f.label} Transport ${date} — ${e.airport?.toUpperCase()} ${e.time ?? ''}${who}${suffix}` });
    });
    const out = await reconcileCharges(key, { registrationId: reg.id, guestName: (reg.guests ?? []).find(g => g.name)?.name ?? '',
      label: f.label, date, wanted: go.map(x => ({ description: x.description, unitPrice: x.rate, guestName: x.guestName, linked: linkedOf([x.e]), folioId: folioOf.get(`${reg.id}|${x.guestName}`) })),
      linkedIds: linkedOf(rl), mode, dryRun });
    if (out.error) { res.errors.push({ room: reg.room, reason: out.error }); continue; }
    report(out, { room: reg.room, names: go.map(x => x.e.name).join(' & ') });
    for (const e of rl) {
      const i = go.findIndex(x => x.e === e);
      const link = i >= 0 && out.itemIds[i] ? { [f.itemId]: out.itemIds[i], [f.amount]: go[i].rate, [f.chargedAt]: now, [f.paidBy]: 'guest' } : null;
      await linkRows(key, e.guest, f, link, dryRun);
    }
  }
  return res;
}

module.exports = { runCharges, SUPABASE_URL, supaFetch, fetchAll, loadRates, autoRate, nameMatch, dedupeGuests, reconcileCharges, existingCharges, linkRows, fields, rideGroups };
