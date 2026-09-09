"use strict";
const { request } = require("https");

// ─── Module-level state (survives warm Lambda invocations) ───────────────────
let _token              = null; // { access_token, expires_at_ms }
let _roomLookup         = {};   // { roomName → Cloudbeds roomID }
let _roomTypeLookup     = {};   // { roomName → Cloudbeds roomTypeID }
let _roomIdToTypeLookup = {};   // { roomID   → Cloudbeds roomTypeID } (reverse)
let _roomTypeToRooms    = {};   // { roomTypeID → [{name, id}] } (fallback by type)
let _cbTypeNameLookup   = {};   // { typeName.toLowerCase() → roomTypeID }
let _maxOcc             = {};   // { roomName → maxGuests }
let _roomsCache         = null; // { data, expires_at_ms } — 1h TTL
let _itemsCache         = null; // { data, expires_at_ms } — 5min TTL

const CB_BASE  = "https://api.cloudbeds.com/api/v1.3"; // v2
const CB_TOKEN = "https://api.cloudbeds.com/api/v1.2/access_token";

// Colors keyed to actual Cloudbeds room type names (lowercase)
const COLOR_MAP = {
  "beachfront king":           "#0891b2",
  "beachview double":          "#2563eb",
  "bed in a beachview double": "#2563eb",
  "superior":                  "#7c3aed",
  "garden plus":               "#16a34a",
  "garden":                    "#2d6a6a",
  "simple n small":            "#ca8a04",
  "double":                    "#dc2626",
  "bed in a double room":      "#dc2626",
  "triple":                    "#9333ea",
  "bed in a triple room":      "#9333ea",
  "quad":                      "#e11d48",
  "bed in a quad room":        "#e11d48",
  "casa master":               "#b45309",
  "casa shanti":               "#0369a1",
  "shanti king":               "#0369a1",
  "shanti 2 bed":              "#0284c7",
  "casita 4":                  "#78350f",
  "casita 4 / 1 bed":          "#f59e0b",
  "casita 4 / 2 beds":         "#fbbf24",
};

// ─── Main handler ────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const h = corsHeaders();

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: h, body: "" };
  }

  const qs     = event.queryStringParameters || {};
  const action = qs.action;
  const body   = event.body ? safeJSON(event.body) : {};

  try {
    const tok = await getToken();

    switch (action) {
      case "getRooms":
        return ok(h, await getRooms(tok));

      case "getRates":
        return ok(h, await getRates(tok));

      case "getAvailability":
        if (!qs.start || !qs.end)
          return ok(h, { error: "start and end are required" }, 400);
        return ok(h, await getAvailability(tok, qs.start, qs.end));

      case "createReservation":
        return ok(h, await createReservation(tok, body));

      case "createReservationByType":
        return ok(h, await createReservationByType(tok, body));

      case "cancelReservation":
        return ok(h, await cancelReservation(tok, body.reservationId));

      case "updateReservationDates": {
        // Change an existing, still-active reservation's checkin/checkout — e.g. a
        // retreat's whole date range shifting or shortening. Unlike restoreReservation
        // (which re-submits whatever dates Cloudbeds already has, only to un-cancel),
        // this takes the NEW dates from the caller.
        const { reservationId: udrId, checkinDate: udrIn, checkoutDate: udrOut } = body;
        if (!udrId || (!udrIn && !udrOut)) return ok(h, { error: "reservationId and at least one of checkinDate/checkoutDate required" }, 400);
        const CB_V1u = "https://hotels.cloudbeds.com/api/v1.1";
        const udrForm = new URLSearchParams({ propertyID: process.env.CLOUDBEDS_PROPERTY_ID, reservationID: udrId, status: "confirmed" });
        if (udrIn)  udrForm.append("checkinDate",  udrIn);
        if (udrOut) udrForm.append("checkoutDate", udrOut);
        const udrRes = await httpJSON("PUT", `${CB_V1u}/putReservation`, udrForm.toString(), {
          Authorization: `Bearer ${tok}`, "X-PROPERTY-ID": process.env.CLOUDBEDS_PROPERTY_ID, "Content-Type": "application/x-www-form-urlencoded"
        });
        console.log("[CB updateReservationDates]", udrId, udrIn, udrOut, JSON.stringify(udrRes).slice(0, 200));
        return ok(h, { success: !!(udrRes.success), raw: udrRes });
      }

      case "restoreReservation": {
        const { reservationId: rstId } = body;
        if (!rstId) return ok(h, { error: "reservationId required" }, 400);
        const rstData = await cbGet(tok, "/getReservation", { reservationID: rstId }).catch(() => null);
        const rstCheckin  = rstData?.data?.startDate  || rstData?.data?.checkinDate  || null;
        const rstCheckout = rstData?.data?.endDate    || rstData?.data?.checkoutDate || null;
        const CB_V1r = "https://hotels.cloudbeds.com/api/v1.1";
        const rstForm = new URLSearchParams({ propertyID: process.env.CLOUDBEDS_PROPERTY_ID, reservationID: rstId, status: "confirmed" });
        if (rstCheckin)  rstForm.append("checkinDate",  rstCheckin);
        if (rstCheckout) rstForm.append("checkoutDate", rstCheckout);
        const rstRes = await httpJSON("PUT", `${CB_V1r}/putReservation`, rstForm.toString(), {
          Authorization: `Bearer ${tok}`, "X-PROPERTY-ID": process.env.CLOUDBEDS_PROPERTY_ID, "Content-Type": "application/x-www-form-urlencoded"
        });
        console.log("[CB restoreReservation]", rstId, JSON.stringify(rstRes).slice(0, 200));
        return ok(h, { success: !!(rstRes.success), raw: rstRes });
      }

      case "checkReservation": {
        const res = await cbGet(tok, "/getReservation", { reservationID: body.reservationId }).catch(() => null);
        const status = (res?.data?.status || res?.data?.reservationStatus || "").toLowerCase();
        // checked_out and closed are COMPLETED stays — keep them as valid (not stale)
        const inactiveStatuses = ["canceled","cancelled","no_show","void","deleted"];
        const active = !!(res?.success && status && !inactiveStatuses.includes(status));
        console.log("[CB checkReservation]", body.reservationId, "success:", res?.success, "status:", status, "active:", active, "raw:", JSON.stringify(res?.data||res).slice(0,200));
        return ok(h, { active, status });
      }

      case "updateReservationGuest":
        return ok(h, await replaceReservation(tok, body));

      case "updateReservationNotes":
        return ok(h, await updateReservationNotes(tok, body));

      case "moveReservationRoom": {
        const { reservationId: mvResId, newCbRoomId: _rawCbId, newRoomName } = body;
        if (Object.keys(_roomLookup).length === 0) await getRooms(tok);
        const newCbRoomId = _rawCbId ?? (newRoomName ? _roomLookup[newRoomName] : null);
        if (!mvResId || !newCbRoomId) return ok(h, { error: "reservationId and newCbRoomId (or newRoomName) required" }, 400);
        if (Object.keys(_roomIdToTypeLookup).length === 0) await getRooms(tok);
        const mvRoomTypeId = _roomIdToTypeLookup[newCbRoomId];
        if (!mvRoomTypeId) return ok(h, { success: false, error: `Room not found: ${newCbRoomId}` });
        const mvRes = await cbGet(tok, "/getReservation", { reservationID: mvResId }).catch(() => null);
        const _mvRawA = mvRes?.data?.assigned;
        const _mvRawU = mvRes?.data?.unassigned;
        const mvSlot = (Array.isArray(_mvRawA) ? _mvRawA[0] : Object.values(_mvRawA || {})[0])
                    || (Array.isArray(_mvRawU) ? _mvRawU[0] : Object.values(_mvRawU || {})[0]);
        const mvResRoomId = mvSlot?.reservationRoomID || mvSlot?.roomReservationID;
        const mvCurRoomId = mvRes?.data?.assigned?.[0]?.roomID || null;
        if (!mvResRoomId) return ok(h, { success: false, error: "reservationRoomID not found" });
        const mvForm = new URLSearchParams({
          propertyID: process.env.CLOUDBEDS_PROPERTY_ID, reservationID: mvResId,
          newRoomID: String(newCbRoomId), roomTypeID: String(mvRoomTypeId), reservationRoomID: String(mvResRoomId),
        });
        if (mvCurRoomId) mvForm.append("oldRoomID", String(mvCurRoomId));
        const mvResult = await cbPost(tok, "/postRoomAssign", mvForm.toString()).catch(e => ({ error: e.message }));
        console.log("[CB moveReservationRoom]", newCbRoomId, JSON.stringify(mvResult).slice(0, 200));
        return ok(h, { success: !!(mvResult?.success), data: mvResult });
      }

      case "getSources":
        return ok(h, await cbGet(tok, "/getSources"));

      case "getReservationBlock": {
        const resId = body.reservationId;
        if (!resId) return ok(h, { allotmentBlockCode: null, groupCode: null });
        const rd = await cbGet(tok, "/getReservation", { reservationID: resId }).catch(() => null);
        const blockCode = rd?.data?.allotmentBlockCode || null;
        const groupCode = rd?.data?.groupCode || null;
        return ok(h, { allotmentBlockCode: blockCode, groupCode });
      }

      case "getRatePlans":
        return ok(h, await cbGet(tok, "/getRatePlans", {
          startDate: qs.start || "2026-06-10",
          endDate:   qs.end   || "2026-06-11",
          adults: 1,
        }));

      case "gethotels":
        return ok(h, await cbGet(tok, "/getHotels"));

      case "getExternalReservations":
        if (!body.startDate || !body.endDate)
          return ok(h, { error: "startDate and endDate are required" }, 400);
        return ok(h, await getExternalReservations(tok, body.startDate, body.endDate, body.viewStart));

      case "createGroupEvent":
        return ok(h, await createGroupEvent(tok, body));

      case "recoverCbIds": {
        const { bookingId, startDate, endDate, allotmentBlockCode, blockedRooms } = body;
        if (!bookingId || !startDate || !endDate)
          return ok(h, { error: "bookingId, startDate, endDate required" }, 400);

        // Ensure room lookup is populated so we can reverse-map roomID → portal room name
        if (Object.keys(_roomLookup).length === 0) await getRooms(tok);
        // Build reverse map: cbRoomId → portal room name (e.g. "678804" → "Casa King Downstairs")
        const roomIdToName = {};
        for (const [name, id] of Object.entries(_roomLookup)) roomIdToName[String(id)] = name;

        // Normalize portal room names for loose matching (lowercase, no spaces/dashes)
        const portalRooms = new Set((blockedRooms || []).map(r => r.toLowerCase()));
        const norm = s => s.toLowerCase().replace(/[\s_-]/g, "");
        const portalRoomsNorm = new Set((blockedRooms || []).map(norm));

        let allRes = [];
        let pageNumber = 1;
        while (true) {
          const res = await cbGet(tok, "/getReservations", { startDate, endDate, pageNumber, pageSize: 100 });
          if (!res.success) break;
          const page = res.data || [];
          allRes = allRes.concat(page);
          if (allRes.length >= (res.total || 0) || page.length === 0) break;
          pageNumber++;
          if (pageNumber > 20) break;
        }
        const cbIds = {};
        const cbGuestIds = {};
        // Collect all active candidates per room key, then resolve duplicates by modification date
        const cbIdsCandidates = {}; // key → [{resId, guestId, fetchedData}]
        const _fetchedResData = {}; // resId → getReservation data (avoid double-fetching)

        for (const r of allRes) {
          // checked_out and closed are COMPLETED stays — keep them so pre-verify doesn't
          // falsely treat checked-out rooms as stale and recreate their reservations.
          const _inactSt = new Set(["canceled","cancelled","no_show","void","deleted"]);
          if (_inactSt.has((r.status || "").toLowerCase())) continue;
          const resId = r.reservationID || r.id;
          const email = (r.guestEmail || "").toLowerCase();
          const blockMatch = allotmentBlockCode && r.allotmentBlockCode === allotmentBlockCode;
          const emailMatch = email.startsWith(bookingId.toLowerCase() + "-");

          // Get assigned physical rooms from this Cloudbeds reservation
          let rooms = r.assignedRooms || r.rooms || r.accommodation || [];
          let roomList = Array.isArray(rooms) ? rooms : Object.values(rooms);
          let fetchedData = null;

          // getReservations list returns rooms:[] — fetch individual reservation for room detail
          if ((blockMatch || emailMatch) && roomList.length === 0) {
            try {
              const singleRes = await cbGet(tok, "/getReservation", { reservationID: resId }).catch(() => null);
              fetchedData = singleRes?.data || null;
              _fetchedResData[resId] = fetchedData;
              const _asgn  = fetchedData?.assigned   || {};
              const _unasgn = fetchedData?.unassigned || {};
              roomList = [
                ...(Array.isArray(_asgn)  ? _asgn  : Object.values(_asgn)),
                ...(Array.isArray(_unasgn) ? _unasgn : Object.values(_unasgn)),
              ];
              console.log("[CB recoverCbIds] individual fetch for", resId, "→ rooms:", roomList.length);
            } catch(e) { console.warn("[CB recoverCbIds] individual fetch failed:", resId, e.message); }
          }

          for (const slot of roomList) {
            const cbRoomId = String(slot?.roomID || slot?.id || "");
            const cbRoomName = slot?.roomName || slot?.name || "";
            const guestId = slot?.guestID || r.guestID || null;

            // Strategy 1: email or allotmentBlock match → collect candidates (resolve duplicates later)
            if (emailMatch || blockMatch) {
              const portalName = (cbRoomId && roomIdToName[cbRoomId]) || null;
              const rawKey = portalName || cbRoomName;
              // Exact then case-insensitive match against blocked rooms
              const directMatch = rawKey
                ? ((blockedRooms || []).find(r => r === rawKey) ||
                   (blockedRooms || []).find(r => r.toLowerCase() === rawKey.toLowerCase()))
                : null;

              // Helper: extract portal room name from email (email encodes exact room name at push time)
              // Normalizes dashes↔spaces so "garden-1" matches "Garden 1", "6a" matches "6a", etc.
              const extractEmailRoom = () => {
                if (!emailMatch) return null;
                const afterBkId = email.slice(bookingId.length + 1);
                const atIdx     = afterBkId.indexOf("@");
                const withSuf   = afterBkId.slice(0, atIdx);
                const lastDash  = withSuf.lastIndexOf("-");
                const raw       = lastDash >= 0 ? withSuf.slice(0, lastDash) : withSuf;
                if (!raw) return null;
                const normFn = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
                return (blockedRooms || []).find(r => normFn(r) === normFn(raw)) || null;
              };

              let key;
              if (directMatch) {
                key = directMatch;
              } else if (emailMatch) {
                // directMatch failed — CB room name doesn't match portal name (e.g. triple beds
                // 6a/6b/6c all share one CB room "Triple"). Email reliably encodes which portal
                // room this reservation was pushed as — use it as the key.
                key = extractEmailRoom() || rawKey || undefined;
              } else {
                // blockMatch only, no email — use CB room name as key.
                // Without email we can't distinguish individual beds in shared rooms (6a/6b/6c),
                // so rawKey is the best we can do; dedup will resolve duplicates by modify date.
                if (rawKey) key = rawKey;
              }

              if (key) {
                if (!cbIdsCandidates[key]) cbIdsCandidates[key] = [];
                cbIdsCandidates[key].push({ resId, guestId, fetchedData });
              }
              continue;
            }

            // Strategy 2: match by physical room ID or name against the booking's blockedRooms list
            if (portalRooms.size === 0) continue;
            // Try exact portal room name match (case-insensitive)
            if (cbRoomName && portalRooms.has(cbRoomName.toLowerCase())) {
              cbIds[cbRoomName] = resId; if (guestId) cbGuestIds[cbRoomName] = guestId; continue;
            }
            // Try via reverse roomId lookup
            const lookedUpName = cbRoomId ? roomIdToName[cbRoomId] : null;
            if (lookedUpName && portalRooms.has(lookedUpName.toLowerCase())) {
              cbIds[lookedUpName] = resId; if (guestId) cbGuestIds[lookedUpName] = guestId; continue;
            }
            // Try normalized match (ignores spaces and dashes: "14 a" == "14a")
            if (cbRoomName && portalRoomsNorm.has(norm(cbRoomName))) {
              const origName = (blockedRooms || []).find(pr => norm(pr) === norm(cbRoomName));
              const key = origName || cbRoomName;
              cbIds[key] = resId; if (guestId) cbGuestIds[key] = guestId;
            }
          }
        }

        // Resolve blockMatch/emailMatch candidates: single → use directly; duplicates → pick most recently modified
        for (const [key, candidates] of Object.entries(cbIdsCandidates)) {
          if (candidates.length === 1) {
            cbIds[key] = candidates[0].resId;
            if (candidates[0].guestId) cbGuestIds[key] = candidates[0].guestId;
            continue;
          }
          // Multiple active reservations for same room — pick the one most recently modified
          console.log("[CB recoverCbIds] duplicates for room", key, "→", candidates.map(c => c.resId));
          let best = null;
          let bestMod = "0";
          for (const c of candidates) {
            let fd = c.fetchedData || _fetchedResData[c.resId] || null;
            if (!fd) {
              try {
                const sr = await cbGet(tok, "/getReservation", { reservationID: c.resId }).catch(() => null);
                fd = sr?.data || null;
                if (fd) _fetchedResData[c.resId] = fd;
              } catch(e) { /* keep as-is */ }
            }
            // Log actual fields available (first time only, for debugging)
            if (!best) console.log("[CB recoverCbIds] fetchedData keys for", c.resId, ":", JSON.stringify(Object.keys(fd||{})), "| sample:", JSON.stringify(fd||{}).slice(0,400));
            // Cloudbeds returns date fields under various names — try all known variants
            const modDate = fd?.modifiedDate || fd?.lastModified || fd?.reservationModifiedDate
                          || fd?.updatedAt   || fd?.reservation?.modifiedDate
                          || fd?.createdDate || fd?.reservationCreatedDate || fd?.dateCreated || "0";
            console.log("[CB recoverCbIds]   candidate", c.resId, "modDate:", modDate, "fields:", JSON.stringify(Object.keys(fd||{})));
            if (!best || modDate > bestMod) { best = c; bestMod = modDate; }
          }
          if (best) { cbIds[key] = best.resId; if (best.guestId) cbGuestIds[key] = best.guestId; }
        }

        console.log("[CB recoverCbIds] bookingId="+bookingId+" found="+JSON.stringify(cbIds));
        return ok(h, { success: true, cbIds, cbGuestIds, count: Object.keys(cbIds).length });
      }

      case "getCbGuestNames": {
        // For each room→reservationId, fetch reservation and extract guest name
        const { reservationIds, groupName: grpName } = body; // { room: resId }
        if (!reservationIds || typeof reservationIds !== 'object')
          return ok(h, { error: "reservationIds required" }, 400);
        const guestNames = {};
        const normalizedGroup = (grpName || '').trim().toLowerCase();
        for (const [room, resId] of Object.entries(reservationIds)) {
          if (!resId) continue;
          try {
            const res = await cbGet(tok, "/getReservation", { reservationID: resId }).catch(() => null);
            const guestList = res?.data?.guestList || {};
            const firstKey = typeof guestList === 'object' && !Array.isArray(guestList) ? Object.keys(guestList)[0] : null;
            const g = firstKey ? guestList[firstKey] : null;
            if (!g) continue;
            // Only use guestFirstName — lastName is always the group/retreat placeholder
            const full = (g.guestFirstName || '').trim();
            const lc = full.toLowerCase();
            if (!full || lc === normalizedGroup || lc === 'guest' || lc === 'amansala') continue;
            guestNames[room] = full;
          } catch(e) { /* skip */ }
        }
        return ok(h, { success: true, guestNames });
      }

      case "getItems": {
        if (_itemsCache && _itemsCache.expires_at_ms > Date.now()) return ok(h, _itemsCache.data);
        const itemsRes = await cbGet(tok, "/getItems");
        if (!itemsRes.success) return ok(h, { error: "getItems failed: " + (itemsRes.message || JSON.stringify(itemsRes).slice(0, 200)) }, 502);
        const items = Array.isArray(itemsRes.data) ? itemsRes.data : Object.values(itemsRes.data || {});
        const result = { items };
        _itemsCache = { data: result, expires_at_ms: Date.now() + 5 * 60 * 1000 };
        return ok(h, result);
      }

      case "getAdjustmentTypes": {
        const typesRes = await cbGet(tok, "/getAdjustmentTypes", { propertyID: process.env.CLOUDBEDS_PROPERTY_ID });
        console.log("[CB getAdjustmentTypes] raw:", JSON.stringify(typesRes).slice(0, 500));
        return ok(h, typesRes);
      }

      case "postItem": {
        const { reservationID, itemID, itemQuantity } = body;
        if (!reservationID || !itemID) return ok(h, { error: "reservationID and itemID are required" }, 400);
        const itemForm = new URLSearchParams({
          propertyID:    process.env.CLOUDBEDS_PROPERTY_ID,
          reservationID: String(reservationID),
          itemID:        String(itemID),
          itemQuantity:  String(itemQuantity || 1),
        }).toString();
        const itemRes = await cbPost(tok, "/postItem", itemForm);
        console.log("[CB postItem] reservationID:", reservationID, "itemID:", itemID, "qty:", itemQuantity, JSON.stringify(itemRes).slice(0, 200));
        return ok(h, { success: !!(itemRes.success), message: itemRes.message || null, data: itemRes.data || null });
      }

      case "postAdjustment": {
        const { reservationID, amount, description, type } = body;
        if (!reservationID)                    return ok(h, { error: "reservationID is required" }, 400);
        if (amount === undefined || amount === null || amount === '') return ok(h, { error: "amount is required" }, 400);
        const parsedAmt = parseFloat(amount);
        if (isNaN(parsedAmt))                  return ok(h, { error: "amount must be a number" }, 400);

        if (parsedAmt < 0) {
          // Credit: use the "Credit Spa Service" item (categoryName: Credit) with custom price.
          // postItem adds to the primary folio without creating a new folio.
          const creditForm = new URLSearchParams({
            propertyID:    process.env.CLOUDBEDS_PROPERTY_ID,
            reservationID: String(reservationID),
            itemID:        "1305597",
            itemQuantity:  "1",
            itemUnitPrice: String(Math.abs(parsedAmt)),
          });
          if (description) creditForm.set("notes", description);
          const creditRes = await cbPost(tok, "/postItem", creditForm.toString());
          console.log("[CB postItem credit] resID:", reservationID, "amount:", parsedAmt, JSON.stringify(creditRes).slice(0, 300));
          return ok(h, { success: !!(creditRes.success), message: creditRes.message || null, data: creditRes.data || null });
        }

        // Debit/cargo: postAdjustment with type "rate" (the only confirmed valid type for this property)
        const adjParams = new URLSearchParams({
          propertyID:    process.env.CLOUDBEDS_PROPERTY_ID,
          reservationID: String(reservationID),
          type:          type || "rate",
          amount:        String(parsedAmt),
        });
        if (description) adjParams.set("notes", description);
        const adjRes = await cbPost(tok, "/postAdjustment", adjParams.toString());
        console.log("[CB postAdjustment debit] resID:", reservationID, "type:", adjParams.get("type"), "amount:", parsedAmt, "full_response:", JSON.stringify(adjRes).slice(0, 500));
        return ok(h, { success: !!(adjRes.success), message: adjRes.message || null, data: adjRes.data || null });
      }

      default:
        return ok(h, { error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[cloudbeds]", action, err.message);
    return ok(h, { error: err.message, action }, 502);
  }
};

// ─── Auth: OAuth2 with refresh_token → api_key ───────────────────────────────
async function getToken() {
  // API key takes priority — no OAuth2 exchange needed
  const apiKey = process.env.CLOUDBEDS_API_KEY || "";
  if (apiKey) return apiKey;

  const now = Date.now();
  if (_token && _token.expires_at_ms > now + 60_000) return _token.access_token;

  const clientId     = process.env.CLOUDBEDS_CLIENT_ID     || "";
  const clientSecret = process.env.CLOUDBEDS_CLIENT_SECRET || "";
  const refreshToken = process.env.CLOUDBEDS_REFRESH_TOKEN || "";

  if (!refreshToken) throw new Error(
    "CLOUDBEDS_API_KEY or CLOUDBEDS_REFRESH_TOKEN must be set."
  );

  const body = new URLSearchParams({
    grant_type:    "refresh_token",
    client_id:     clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  }).toString();

  const res = await httpJSON("POST", CB_TOKEN, body, {
    "Content-Type": "application/x-www-form-urlencoded",
  });

  if (!res.access_token)
    throw new Error("Token refresh failed: " + JSON.stringify(res));

  _token = {
    access_token:  res.access_token,
    expires_at_ms: now + (res.expires_in || 28800) * 1000,
  };
  return _token.access_token;
}

// ─── API actions ─────────────────────────────────────────────────────────────

async function getRooms(tok) {
  // Return cached data if still fresh (1h TTL — survives warm Lambda invocations)
  if (_roomsCache && _roomsCache.expires_at_ms > Date.now()) return _roomsCache.data;

  // Fetch all pages (v1.3 returns max 100 per page; total can be 183+)
  let allRooms = [];
  let pageNumber = 1;
  while (true) {
    const res = await cbGet(tok, "/getRooms", { pageNumber, pageSize: 200 });
    if (!res.success) throw new Error("getRooms failed: " + JSON.stringify(res));
    // v1.3 nests rooms under data[].rooms (one entry per property)
    const prevLen = allRooms.length;
    for (const prop of (res.data || [])) {
      allRooms = allRooms.concat(prop.rooms || []);
    }
    const newThisPage = allRooms.length - prevLen;
    if (newThisPage === 0 || newThisPage < 200) break; // last page
    pageNumber++;
    if (pageNumber > 10) break; // safety limit
  }

  const types  = {};
  const lookup = {};
  _roomTypeToRooms    = {};
  _roomTypeLookup     = {};
  _roomIdToTypeLookup = {};
  _cbTypeNameLookup   = {};

  for (const r of allRooms) {
    lookup[r.roomName] = r.roomID;
    // No lowercase entries — "5B" (Beachfront) and "5b" (shared bed) are different rooms.
    // A lowercase alias would overwrite whichever gets processed last.
    _roomTypeLookup[r.roomName] = r.roomTypeID;
    _roomIdToTypeLookup[r.roomID] = r.roomTypeID; // reverse: roomID → roomTypeID
    if (!_roomTypeToRooms[r.roomTypeID]) _roomTypeToRooms[r.roomTypeID] = [];
    _roomTypeToRooms[r.roomTypeID].push({ name: r.roomName, id: r.roomID });
    if (r.roomTypeName) _cbTypeNameLookup[(r.roomTypeName).toLowerCase().trim()] = r.roomTypeID;

    if (!types[r.roomTypeID]) {
      const nameLow = (r.roomTypeName || "").toLowerCase().trim();
      types[r.roomTypeID] = {
        id:       r.roomTypeID,
        name:     r.roomTypeName,
        property: deriveProperty(r.roomTypeName),
        color:    COLOR_MAP[nameLow] || "#607D8B",
        maxOcc:   parseInt(r.maxGuests, 10) || 2,
        rooms:    [],
        price1: 0, price2: 0, price1_low: 0, price2_low: 0,
      };
    }
    types[r.roomTypeID].rooms.push(r.roomName);
    _maxOcc[r.roomName] = parseInt(r.maxGuests, 10) || 2;
  }

  _roomLookup = lookup;
  // _roomTypeLookup is populated inline above during the loop
  const data = { roomTypes: Object.values(types), roomLookup: lookup };
  _roomsCache = { data, expires_at_ms: Date.now() + 60 * 60 * 1000 };
  return data;
}

async function getRates(tok) {
  // Two seasons: Regular (Jan 15–May 31, Oct 2–Dec 20) and Low (Jun 1–Oct 1)
  // Query with adults=1 for solo rate and adults=2 to derive sharing rate
  const [reg1, reg2, low1, low2] = await Promise.all([
    cbGet(tok, "/getRatePlans", { startDate: "2027-03-01", endDate: "2027-03-02", adults: 1 }),
    cbGet(tok, "/getRatePlans", { startDate: "2027-03-01", endDate: "2027-03-02", adults: 2 }),
    cbGet(tok, "/getRatePlans", { startDate: "2026-08-01", endDate: "2026-08-02", adults: 1 }),
    cbGet(tok, "/getRatePlans", { startDate: "2026-08-01", endDate: "2026-08-02", adults: 2 }),
  ]);

  const rates = {};

  // Log all unique rate plans for debugging
  const plansSeen = {};
  const apply = (data, key) => {
    for (const entry of (data || [])) {
      const rtId = entry.roomTypeID;
      const rate = Math.round(entry.roomRate || 0);
      if (!rtId || !rate) continue;
      if (!rates[rtId]) rates[rtId] = {};
      if (!rates[rtId][key] || rate > rates[rtId][key]) {
        rates[rtId][key] = rate;
      }
      const pid = entry.ratePlanID || entry.ratePlanId;
      if (pid && !plansSeen[pid]) {
        plansSeen[pid] = { name: entry.ratePlanName || entry.ratePlanNamePublic || "", rate, key };
      }
    }
  };

  apply(reg1.data, "price1");
  apply(reg2.data, "_reg2");
  apply(low1.data, "price1_low");
  apply(low2.data, "_low2");

  console.log("[CB ratePlans]", JSON.stringify(plansSeen));
  return { rates, plansSeen };
}

async function getAvailability(tok, start, end) {
  // getAvailabilityReport returns HTML; derive availability from getReservations instead
  let allRes = [];
  let pageNumber = 1;
  while (true) {
    const res = await cbGet(tok, "/getReservations", {
      startDate:  start,
      endDate:    end,
      pageNumber,
      pageSize:   100,
    });
    if (!res.success) throw new Error("getReservations failed: " + JSON.stringify(res).slice(0, 300));
    const page = res.data || [];
    allRes = allRes.concat(page);
    if (allRes.length >= (res.total || 0) || page.length === 0) break;
    pageNumber++;
    if (pageNumber > 20) break;
  }

  const unavailable = {};
  const DAY_MS  = 86400000;
  const startMs = new Date(start).getTime();
  const endMs   = new Date(end).getTime();

  for (const r of allRes) {
    if (r.status === "canceled" || r.status === "no_show") continue;
    // rooms may appear as r.assignedRooms, r.rooms, or r.accommodation
    const rooms = r.assignedRooms || r.rooms || r.accommodation || [];
    const resStart = new Date(r.startDate || r.arrivalDate).getTime();
    const resEnd   = new Date(r.endDate   || r.departureDate).getTime();

    for (const room of (Array.isArray(rooms) ? rooms : Object.values(rooms))) {
      const name = room.roomName || room.name || room;
      if (!name || typeof name !== "string") continue;
      if (!unavailable[name]) unavailable[name] = [];
      for (let ms = Math.max(resStart, startMs); ms < Math.min(resEnd, endMs); ms += DAY_MS) {
        const d = new Date(ms).toISOString().slice(0, 10);
        if (!unavailable[name].includes(d)) unavailable[name].push(d);
      }
    }
  }

  return { unavailable };
}

async function expandAllotmentBlock(tok, allotmentBlockCode, roomTypeId, startDate, endDate) {
  const datesInRange = [];
  let d = new Date(startDate + "T00:00:00Z");
  const dEnd = new Date(endDate + "T00:00:00Z");
  while (d < dEnd) {
    datesInRange.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const parts = [
    `allotmentBlockCode=${encodeURIComponent(allotmentBlockCode)}`,
    `allotmentIntervals[0][roomTypeId]=${encodeURIComponent(roomTypeId)}`,
  ];
  datesInRange.forEach((dateStr, j) => {
    parts.push(`allotmentIntervals[0][availability][${j}][date]=${dateStr}`);
    parts.push(`allotmentIntervals[0][availability][${j}][blockAllotted]=10`);
  });
  const bodyStr = parts.join("&");
  console.log("[CB expandAllotmentBlock] code:", allotmentBlockCode, "rtId:", roomTypeId, "dates:", datesInRange.length);
  const hdrs = {
    Authorization:   `Bearer ${tok}`,
    "X-PROPERTY-ID": process.env.CLOUDBEDS_PROPERTY_ID,
    "Content-Type":  "application/x-www-form-urlencoded",
  };
  // Try POST v1.1 first — CB "put" endpoints sometimes use POST, not PUT
  let res = await httpJSON("POST", "https://hotels.cloudbeds.com/api/v1.1/putAllotmentBlock", bodyStr, hdrs, 15000)
    .catch(e => ({ success: false, _error: e.message }));
  if (!res.success && res.raw) console.warn("[CB expandAllotmentBlock] POST v1.1 returned HTML");
  // Try PUT v1.1
  if (!res.success) {
    res = await httpJSON("PUT", "https://hotels.cloudbeds.com/api/v1.1/putAllotmentBlock", bodyStr, hdrs, 15000)
      .catch(e => ({ success: false, _error: e.message }));
  }
  // Try POST v1.3
  if (!res.success) {
    res = await httpJSON("POST", `${CB_BASE}/putAllotmentBlock`, bodyStr, hdrs, 15000)
      .catch(e => ({ success: false, _error: e.message }));
  }
  // Try PUT v1.3
  if (!res.success) {
    res = await httpJSON("PUT", `${CB_BASE}/putAllotmentBlock`, bodyStr, hdrs, 15000)
      .catch(e => ({ success: false, _error: e.message }));
  }
  console.log("[CB expandAllotmentBlock] result:", JSON.stringify(res).slice(0, 200));
  return !!(res.success);
}

async function createReservationByType(tok, body) {
  const { roomTypeName, startDate, endDate, guestFullName, guestEmail, guestPhone, adults, dailyRate } = body;
  await getRooms(tok);
  const rtId  = _cbTypeNameLookup[(roomTypeName || "").toLowerCase().trim()];
  const rooms = (rtId && _roomTypeToRooms[rtId]) ? _roomTypeToRooms[rtId] : [];
  if (!rooms.length) throw new Error(`No rooms found for type: ${roomTypeName} (rtId: ${rtId})`);
  // Pick first room — CB validates availability; guest already checked before booking
  const roomName = rooms[0].name;
  console.log("[CB createReservationByType] type:", roomTypeName, "→ room:", roomName);

  // Look up "Escape" source ID so these booking-engine reservations are tagged correctly
  let escapeSourceId = "";
  try {
    const sourcesRes = await cbGet(tok, "/getSources").catch(() => ({ data: [] }));
    const list = Array.isArray((sourcesRes.data || [])[0]) ? (sourcesRes.data || [])[0] : (sourcesRes.data || []);
    const escSrc = list.find(s => (s.sourceName || "").toLowerCase().includes("escape / non refundable"))
                || list.find(s => (s.sourceName || "").toLowerCase().includes("escape"));
    if (escSrc?.sourceID) escapeSourceId = String(escSrc.sourceID);
  } catch (e) {
    console.warn("[CB createReservationByType] Could not fetch sources:", e.message);
  }

  return createReservation(tok, {
    roomName, startDate, endDate,
    guestFullName, guestEmail, guestPhone,
    adults: adults ?? 1,
    dailyRate: dailyRate ?? 0,
    ...(escapeSourceId ? { sourceIdOverride: escapeSourceId } : {}),
  });
}

async function createReservation(tok, body) {
  const { roomName, startDate, endDate, groupName, leaderName, adults,
          guestFullName, guestEmail: gEmail, guestPhone, dailyRate, bookingId,
          sourceIdOverride } = body;
  if (!roomName || !startDate || !endDate)
    throw new Error("roomName, startDate, endDate are required");

  // Always go through getRooms — it has a 1h internal cache so this is cheap,
  // but ensures stale warm-instance data never causes wrong room lookups.
  await getRooms(tok);

  // Only use cbRoomId from portal mapping if it's a known Cloudbeds room ID.
  // If it's stale/wrong data (e.g. old "668000-3" format), fall through to name lookup.
  const rawCbRoomId = body.cbRoomId || null;
  const cbRoomId = (rawCbRoomId && _roomIdToTypeLookup[rawCbRoomId]) ? rawCbRoomId : null;
  if (rawCbRoomId && !cbRoomId) {
    console.warn(`[CB createRes] cbRoomId "${rawCbRoomId}" not in known rooms — falling back to name lookup`);
  }

  // Room ID: validated cbRoomId first, then name-based lookup
  // Normalize variants: "4B-a"→"4B -a" (Cloudbeds uses space before dash), strip suffix "4B-a"→"4B"
  // Also handles no-dash sub-bed rooms like "26a"→"26 -a" (digit directly followed by letter).
  // NOTE: dash is required in _roomBase so "5B" stays "5B" (B = Beachfront), not stripped to "5"
  const _roomSpaced    = roomName.replace(/-([a-d])$/i, ' -$1');   // "4B-a" → "4B -a"
  const _roomBase      = roomName.replace(/ ?-[a-d]$/i, '');        // "4B-a" or "4B -a" → "4B" (dash required)
  // No-dash sub-bed: "26a" (digit+lowercase letter, no dash) → "26 -a" / "26"
  // Only lowercase a-d qualifies; uppercase like "4B" or "19B" are room designators, not sub-beds.
  const _roomNoDashSpaced = roomName.replace(/^(.*\d)([a-d])$/, '$1 -$2'); // "26a"→"26 -a"
  const _roomNoDashBase   = roomName.replace(/^(.*\d)[a-d]$/, '$1');        // "26a"→"26"
  const _hasNoDashSuffix  = _roomNoDashBase !== roomName && /\d[a-d]$/.test(roomName);
  // Case-insensitive fallbacks are intentionally NOT used here.
  // "5B" (Beachfront single) and "5b" (shared bed) are DIFFERENT rooms in Cloudbeds —
  // lowercase/uppercase variants must NOT be confused. If exact name fails, rely on
  // the cbRoomTypeId type-scoped fallback below, which searches only within the correct type.
  let roomId = cbRoomId
    || _roomLookup[roomName]
    || _roomLookup[_roomSpaced]                                       // "4B-a" → "4B -a"
    || (_roomBase !== roomName && _roomLookup[_roomBase])             // "4B -a" → "4B"
    || (_hasNoDashSuffix && _roomLookup[_roomNoDashSpaced])           // "26a" → "26 -a"
    // Only fall back to parent room when cbRoomTypeId is NOT set — prevents CH3a mapping
    // to parent CH3 (already reserved) instead of using the type-fallback to find CH3a in CB
    || (_hasNoDashSuffix && !body.cbRoomTypeId && _roomLookup[_roomNoDashBase]);  // "26a" → "26"
  // Fallback by cbRoomTypeId — covers sub-bed rooms (dash suffix) AND named rooms with case
  // mismatches (e.g. "Casa King Downstairs" vs CB "Casa king Downstairs"). Safe because the
  // lookup is already scoped to the correct type; normalized comparison handles casing.
  const _hasDashSuffix = (_roomBase !== roomName) || _hasNoDashSuffix;
  if (!roomId && body.cbRoomTypeId) {
    const roomsOfType = _roomTypeToRooms[String(body.cbRoomTypeId)] || [];
    console.log(`[CB type-fallback] roomName="${roomName}" cbRoomTypeId=${body.cbRoomTypeId} → ${roomsOfType.length} rooms: [${roomsOfType.map(r => `"${r.name}"`).join(', ')}]`);
    const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normRoom = norm(roomName);
    // 1. Exact normalized match
    let selected = roomsOfType.find(r => norm(r.name) === normRoom);
    // 2. Suffix match — for sub-room letter (a/b/c/d) with or without dash separator
    if (!selected && roomsOfType.length > 1) {
      const dashSuffix = roomName.match(/-([a-d])$/i) || roomName.match(/\d([a-d])$/);
      if (dashSuffix) {
        const lastCh = dashSuffix[1].toUpperCase();
        selected = roomsOfType.find(r => r.name.trim().toUpperCase().endsWith(lastCh));
      }
    }
    // 3. Single room in type — use it directly
    if (!selected && roomsOfType.length === 1) selected = roomsOfType[0];
    if (selected) {
      console.log(`[CB createRes] type-fallback: "${roomName}" → CB "${selected.name}" (${selected.id}) via cbRoomTypeId=${body.cbRoomTypeId}`);
      roomId = selected.id;
    }
  }
  if (!roomId) {
    // Log rooms known under the requested type for diagnosis
    const typeRooms = body.cbRoomTypeId ? (_roomTypeToRooms[String(body.cbRoomTypeId)] || []).map(r => r.name).join(', ') : 'no cbRoomTypeId sent';
    throw new Error(`Room not found: ${roomName} (cbRoomTypeId=${body.cbRoomTypeId}, rooms in type: [${typeRooms}])`);
  }

  const retreatName = (groupName || leaderName || "Amansala").trim();
  const guestName   = (guestFullName || "").trim();
  const firstName   = guestName || retreatName;
  // Avoid "Jeff Bennet Jeff Bennet" when no real guest name — lastName becomes group marker
  const lastName    = guestName ? retreatName : "Group";
  // Include a short random suffix so each push attempt gets a fresh guest record
  // (avoids Cloudbeds deduplication returning old/cancelled reservations)
  const emailSuffix = Math.random().toString(36).slice(2, 6);
  const guestEmail  = gEmail ||
    (bookingId
      ? `${(`${bookingId}-${roomName}-${emailSuffix}`).toLowerCase().replace(/[^a-z0-9.-]/g, "-").slice(0, 60)}@groups.amansala.com`
      : "groups@amansala.com");

  // roomTypeID: resolved from the roomId we already found (most reliable),
  // then exact name lookup, then the cbRoomTypeId from the request.
  // No case-insensitive variants — room names are case-sensitive.
  const roomTypeID = (roomId && _roomIdToTypeLookup[roomId])
    || _roomTypeLookup[roomName]
    || body.cbRoomTypeId
    || roomId;
  const maxGuests  = _maxOcc[roomName] || _maxOcc[_roomSpaced] || 2;
  // Normally min 2 adults so postGuest doesn't fail ("Max guests exceeded" with adults=1).
  // singlePax:true bypasses that minimum — used when recreating a reservation for exactly 1 pax.
  const adultMin   = body.singlePax ? 1 : 2;
  const adultCount = Math.min(Math.max(adults || 1, adultMin), maxGuests);

  const yogaRatePlanId = process.env.CLOUDBEDS_RATE_PLAN_ID || "440507";
  console.log(`[CB createRes] room=${roomName} roomId=${roomId} roomTypeID=${roomTypeID} ratePlan=${yogaRatePlanId} dailyRate=${dailyRate}`);

  const form = new URLSearchParams();
  form.append("propertyID",              process.env.CLOUDBEDS_PROPERTY_ID);
  form.append("startDate",               startDate);
  form.append("endDate",                 endDate);
  form.append("ratePlanID",              yogaRatePlanId);
  form.append("rooms[0][roomTypeID]",    roomTypeID);
  form.append("rooms[0][quantity]",      "1");
  form.append("adults[0][roomTypeID]",   roomTypeID);
  form.append("adults[0][quantity]",     String(adultCount));
  form.append("children[0][roomTypeID]", roomTypeID);
  form.append("children[0][quantity]",   "0");
  form.append("guestFirstName", firstName);
  form.append("guestLastName",  lastName);
  form.append("guestEmail",     guestEmail);
  form.append("guestCountry",   "MX");
  form.append("guestZip",       "77780");
  form.append("paymentMethod",  "cash");
  form.append("notes",          `Group: ${groupName || ""} · Leader: ${leaderName || ""}`);
  if (body.allotmentBlockCode) form.append("allotmentBlockCode", body.allotmentBlockCode);
  const sourceId  = sourceIdOverride || process.env.CLOUDBEDS_SOURCE_ID || "";
  if (sourceId) form.append("sourceID", sourceId);

  const formStr = form.toString().replace(/%5B/gi, "[").replace(/%5D/gi, "]");

  // Clean form strings for fallback retries
  const formStrNoSrc   = formStr.replace(/&sourceID=[^&]*/g, "");
  const formStrNoBlock = formStr.replace(/&allotmentBlockCode=[^&]*/g, "");
  const formStrClean   = formStrNoBlock.replace(/&sourceID=[^&]*/g, "");

  let res = await cbPost(tok, "/postReservation", formStr);
  if (!res.success && res.message && res.message.includes("Source not found")) {
    console.warn("[CB] Source not found, retrying without sourceID");
    res = await cbPost(tok, "/postReservation", formStrNoSrc);
  }
  // If allotmentBlockCode caused rejection, try to expand the allotment first, then retry
  if (!res.success && body.allotmentBlockCode) {
    console.warn("[CB] allotmentBlockCode rejected, trying to expand allotment:", res.message);
    const blockRejectedMsg = res.message;
    const roomTypeId = (roomId && _roomIdToTypeLookup[roomId])
      || _roomTypeLookup[roomName]
      || _roomTypeLookup[(roomName || "").toLowerCase()]
      || body.cbRoomTypeId
      || null;
    let expandedOk = false;
    if (roomTypeId) {
      try {
        expandedOk = await expandAllotmentBlock(tok, body.allotmentBlockCode, roomTypeId, startDate, endDate);
        if (expandedOk) {
          console.log("[CB] Allotment expanded successfully, retrying reservation with block code");
          res = await cbPost(tok, "/postReservation", formStr);
        }
      } catch (e) {
        console.warn("[CB] expandAllotmentBlock threw:", e.message);
      }
    }
    // If expand failed or reservation still fails, fall back to creating outside group
    if (!expandedOk || !res.success) {
      console.warn("[CB] Falling back to creating outside group");
      res = await cbPost(tok, "/postReservation", formStrNoBlock);
      if (res.success) res._createdOutsideGroup = true;
      if (res.success) res._blockRejectedMsg = blockRejectedMsg;
    }
  }
  // If still failing (e.g. allotmentBlockCode conflict), retry clean without it
  if (!res.success && res.message && res.message.includes("could not accommodate")) {
    console.warn("[CB] Still failing after retries — retrying clean (no block, no source):", res.message);
    res = await cbPost(tok, "/postReservation", formStrClean);
    if (!res.success) console.warn("[CB] Clean retry also failed:", res.message);
  }
  if (!res.success) {
    if (res.message && res.message.includes("No rate found")) {
      console.warn(`[CB] No rate for room ${roomName} — skipping`);
      return { reservationId: null, roomName, skipped: true };
    }
    if (res.message && res.message.includes("could not accommodate")) {
      console.warn(`[CB] Room not available ${roomName} — skipping`);
      return { reservationId: null, roomName, skipped: true, reason: "not_available" };
    }
    throw new Error("postReservation failed: " + JSON.stringify(res));
  }

  const reservationId = res.reservationID;

  // Fetch reservation so we have the room slot ID (reservationRoomID) for assignment.
  // Retry up to 3x with 1.5s delay — CB sometimes returns incomplete data immediately after postReservation.
  // Wrap in try/catch: if post-processing crashes, we still return reservationId (don't lose it)
  let guestId = null;
  try {
  let resData     = null;
  let slot0       = null;
  let assigned0   = null;
  let unassigned0 = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
    resData = await cbGet(tok, "/getReservation", { reservationID: reservationId }).catch(() => null);
    const _rawAss  = resData?.data?.assigned;
    const _rawUnas = resData?.data?.unassigned;
    assigned0   = Array.isArray(_rawAss)  ? _rawAss[0]  : Object.values(_rawAss  || {})[0];
    unassigned0 = Array.isArray(_rawUnas) ? _rawUnas[0] : Object.values(_rawUnas || {})[0];
    slot0 = assigned0 || unassigned0;
    const slotRoomId = slot0?.reservationRoomID || slot0?.roomReservationID;
    console.log(`[CB getReservation attempt ${attempt+1}] resRoomId=${slotRoomId} keys=${slot0 ? Object.keys(slot0).join(",") : "null"}`);
    if (slotRoomId) break;
  }
  guestId    = extractGuestId(resData);
  const resRate   = slot0?.dailyRates?.[0]?.rate ?? null;
  // reservationRoomID is the room *slot* ID within the reservation — required by putRoomAssignment
  const resRoomId = slot0?.reservationRoomID || slot0?.roomReservationID || null;
  console.log("[CB slot0]", JSON.stringify(slot0));

  // Assign specific physical room via postRoomAssign (v1.3 POST, newRoomID param)
  let roomAssign = null;
  if (roomId && resRoomId) {
    const curRoomId = assigned0?.roomID || null;
    if (curRoomId && String(curRoomId) === String(roomId)) {
      // Cloudbeds already auto-assigned the correct room — no need to call postRoomAssign
      roomAssign = { success: true, auto: true };
      console.log("[CB postRoomAssign] skipped — already assigned to", roomId);
    } else {
      const assignForm = new URLSearchParams({
        propertyID:        process.env.CLOUDBEDS_PROPERTY_ID,
        reservationID:     reservationId,
        newRoomID:         String(roomId),
        roomTypeID:        String(roomTypeID),
        reservationRoomID: String(resRoomId),
      });
      if (curRoomId) assignForm.append("oldRoomID", String(curRoomId));
      roomAssign = await cbPost(tok, "/postRoomAssign", assignForm.toString()).catch(e => ({ error: e.message }));
      console.log("[CB postRoomAssign]", roomName, roomId, "cur:", curRoomId, JSON.stringify(roomAssign).slice(0, 200));
    }
  } else {
    console.warn("[CB room assign] skipped — roomId:", roomId, "resRoomId:", resRoomId);
  }

  // Verify rate after creation; if wrong, patch via putReservation as fallback
  let rateOverride = null;
  if (dailyRate && dailyRate > 0 && resRoomId) {
    if (resRate && Math.round(resRate) === Math.round(dailyRate)) {
      rateOverride = { ok: true, approach: "postReservation", target: dailyRate, was: resRate };
    } else {
      try {
        const putHdrs = {
          Authorization:  `Bearer ${tok}`,
          "X-PROPERTY-ID": process.env.CLOUDBEDS_PROPERTY_ID,
          "Content-Type": "application/x-www-form-urlencoded",
        };

        const d0 = new Date(startDate + "T12:00:00Z");
        const d1 = new Date(endDate   + "T12:00:00Z");
        const dates = [];
        for (let d = new Date(d0); d < d1; d.setUTCDate(d.getUTCDate() + 1)) {
          dates.push(d.toISOString().slice(0, 10));
        }

        const rtId = assigned0?.roomTypeID || roomTypeID;

        // Try A: v1.1 API with bracket params (v1.3 rejects brackets in PUT)
        const CB_V1 = "https://hotels.cloudbeds.com/api/v1.1";
        const formA = new URLSearchParams();
        formA.append("propertyID",    process.env.CLOUDBEDS_PROPERTY_ID);
        formA.append("reservationID", reservationId);
        formA.append("checkinDate",   startDate);
        formA.append("checkoutDate",  endDate);
        formA.append(`rooms[0][reservationRoomID]`, resRoomId);
        formA.append(`rooms[0][roomTypeID]`, rtId);
        for (const dt of dates) {
          formA.append(`rooms[0][customDailyRates][${dt}]`, String(dailyRate));
        }
        const pA = formA.toString().replace(/%5B/gi, "[").replace(/%5D/gi, "]");
        const rA = await httpJSON("PUT", `${CB_V1}/putReservation`, pA, putHdrs).catch(e => ({ error: e.message }));
        console.log("[CB putRes v1.1]", JSON.stringify(rA));

        if (rA?.success) {
          rateOverride = { ok: true, approach: "v1.1_customDailyRates", resRoomId, target: dailyRate, was: resRate };
        } else {
          // Fallback: flat ratePlanID on v1.3 (confirmed success but may not change display)
          const pB = new URLSearchParams({
            propertyID:    process.env.CLOUDBEDS_PROPERTY_ID,
            reservationID: reservationId,
            checkinDate:   startDate,
            checkoutDate:  endDate,
            ratePlanID:    yogaRatePlanId,
          }).toString();
          const rB = await httpJSON("PUT", `${CB_BASE}/putReservation`, pB, putHdrs).catch(e => ({ error: e.message }));
          console.log("[CB putRes ratePlan]", JSON.stringify(rB));
          rateOverride = {
            ok: !!rB?.success,
            msgA: rA?.message || rA?.error,
            msgB: rB?.message || rB?.error,
            approach: rA?.success ? "v1.1" : rB?.success ? "v1.3_ratePlan" : "failed",
            resRoomId, target: dailyRate, was: resRate,
          };
        }
      } catch (e) {
        rateOverride = { ok: false, msg: e.message, approach: "exception", target: dailyRate, was: resRate };
      }
    }
  }

  // Zero the rate if dailyRate is 0 — portal handles billing separately, not Cloudbeds.
  // Prefer putReservation customDailyRates=0 (no negative folio entry); fall back to postAdjustment.
  // NOTE: resRoomId may be null for BED types — in that case skip putReservation and go straight to postAdjustment.
  let adjustmentId = null;
  if ((!dailyRate || dailyRate === 0) && reservationId) {
    try {
      let zeroOk = false;
      if (resRoomId) {
        const d0 = new Date(startDate + "T12:00:00Z");
        const d1 = new Date(endDate   + "T12:00:00Z");
        const datesZ = [];
        for (let d = new Date(d0); d < d1; d.setUTCDate(d.getUTCDate() + 1)) {
          datesZ.push(d.toISOString().slice(0, 10));
        }
        const rtIdZ = assigned0?.roomTypeID || roomTypeID;
        const CB_V1 = "https://hotels.cloudbeds.com/api/v1.1";
        const putHdrsZ = {
          Authorization:   `Bearer ${tok}`,
          "X-PROPERTY-ID": process.env.CLOUDBEDS_PROPERTY_ID,
          "Content-Type":  "application/x-www-form-urlencoded",
        };
        const formZ = new URLSearchParams();
        formZ.append("propertyID",    process.env.CLOUDBEDS_PROPERTY_ID);
        formZ.append("reservationID", reservationId);
        formZ.append("checkinDate",   startDate);
        formZ.append("checkoutDate",  endDate);
        formZ.append(`rooms[0][reservationRoomID]`, resRoomId);
        formZ.append(`rooms[0][roomTypeID]`,        rtIdZ);
        for (const dt of datesZ) {
          formZ.append(`rooms[0][customDailyRates][${dt}]`, "0");
        }
        const pZ = formZ.toString().replace(/%5B/gi, "[").replace(/%5D/gi, "]");
        const rZ = await httpJSON("PUT", `${CB_V1}/putReservation`, pZ, putHdrsZ).catch(e => ({ error: e.message }));
        console.log("[CB putRes zero-rate]", JSON.stringify(rZ).slice(0, 200));
        if (rZ?.success) zeroOk = true;
        else console.log("[CB zero-rate] putRes failed, trying postAdjustment:", rZ?.message || rZ?.error);
      } else {
        console.log("[CB zero-rate] no resRoomId (BED type?) — skipping putReservation, using postAdjustment");
      }
      if (!zeroOk) {
        const balance = parseFloat(slot0?.roomTotal || "0") || 0;
        console.log("[CB zero-rate postAdjustment] balance:", balance, "resRoomId:", resRoomId);
        if (balance > 0) {
          const adjForm = new URLSearchParams({
            propertyID:    process.env.CLOUDBEDS_PROPERTY_ID,
            reservationID: reservationId,
            type:          "rate",
            amount:        String(balance),
          }).toString();
          const adjRes = await cbPost(tok, "/postAdjustment", adjForm).catch(e => ({ error: e.message }));
          console.log("[CB postAdjustment zero-rate]", JSON.stringify(adjRes).slice(0, 200));
          adjustmentId = adjRes?.data?.id || adjRes?.data?.adjustmentID || adjRes?.id || null;
        }
      }
    } catch (e) {
      console.warn("[CB zero-rate error]", e.message);
    }
  }

  return { reservationId, guestId, roomName, rateOverride, roomAssign, adjustmentId };
  } catch (e) {
    console.warn("[CB createRes post-processing error]", e.message);
    return { reservationId, guestId, roomName };
  }
}

function extractGuestId(res) {
  const data = res?.data || res || {};
  if (data.guestID) return data.guestID;
  if (data.guest?.guestID) return data.guest.guestID;
  if (Array.isArray(data.guests) && data.guests[0]?.guestID) return data.guests[0].guestID;
  // Cloudbeds v1.3 getReservation returns guestList as object keyed by guestID
  const list = data.guestList || data.guests;
  if (list && typeof list === "object" && !Array.isArray(list)) {
    const firstKey = Object.keys(list)[0];
    if (firstKey) return list[firstKey]?.guestID || firstKey;
  }
  return null;
}

function extractAssignedRoomId(res) {
  const data = res?.data || res;
  // v1.3 getReservation returns assigned/unassigned arrays
  const assigned = data?.assigned || data?.rooms || data?.roomsDetails || [];
  const list = Array.isArray(assigned) ? assigned : Object.values(assigned || {});
  if (list[0]) return list[0].roomID || list[0].assignedRoomID || list[0].id || null;
  if (data?.roomID) return data.roomID;
  return null;
}

async function getGuestIdForReservation(tok, reservationId) {
  const res = await cbGet(tok, "/getReservation", { reservationID: reservationId });
  return extractGuestId(res);
}

async function cancelReservation(tok, reservationId) {
  if (!reservationId) throw new Error("reservationId is required");

  // Fetch reservation to get checkinDate/checkoutDate (v1.1 putReservation requires them for status changes)
  const resData = await cbGet(tok, "/getReservation", { reservationID: reservationId }).catch(() => null);
  const checkinDate  = resData?.data?.startDate  || resData?.data?.checkinDate  || null;
  const checkoutDate = resData?.data?.endDate    || resData?.data?.checkoutDate || null;

  const form = new URLSearchParams({
    propertyID:    process.env.CLOUDBEDS_PROPERTY_ID,
    reservationID: reservationId,
    status:        "canceled",
  });
  if (checkinDate)  form.append("checkinDate",  checkinDate);
  if (checkoutDate) form.append("checkoutDate", checkoutDate);

  const hdrs = {
    Authorization:   `Bearer ${tok}`,
    "X-PROPERTY-ID": process.env.CLOUDBEDS_PROPERTY_ID,
    "Content-Type":  "application/x-www-form-urlencoded",
  };
  // Try v1.3 first, fall back to v1.1
  let res = await httpJSON("PUT", `${CB_BASE}/putReservation`, form.toString(), hdrs, 15000)
    .catch(e => ({ success: false, _err: e.message }));
  console.log("[CB cancelReservation v1.3]", reservationId, JSON.stringify(res).slice(0, 200));
  if (!res.success) {
    const CB_V1 = "https://hotels.cloudbeds.com/api/v1.1";
    res = await httpJSON("PUT", `${CB_V1}/putReservation`, form.toString(), hdrs, 15000)
      .catch(e => ({ success: false, _err: e.message }));
    console.log("[CB cancelReservation v1.1]", reservationId, JSON.stringify(res).slice(0, 200));
  }
  return { success: !!(res.success), raw: res, reservationId };
}

async function replaceReservation(tok, body) {
  const { reservationId, guestId, roomName, startDate, endDate,
          guestFirstName, guestEmail, guestPhone, groupName, leaderName, adults, dailyRate,
          noAdultsReduction } = body;

  const retreatName = (groupName || leaderName || "Amansala").trim();
  // Keep combined name as-is ("Name1 & Name2") — do NOT split
  const firstName = (guestFirstName || "").trim() || retreatName;
  // Adults count: explicit param, or infer from " & " separator, minimum 1
  const adultCount = Math.max(1, adults || (firstName.includes(" & ") ? 2 : 1));

  if (reservationId) {
    try {
      const CB_V1 = "https://hotels.cloudbeds.com/api/v1.1";

      // Fetch reservation to get primary guest's CB email and current guestId
      const resData = await cbGet(tok, "/getReservation", { reservationID: reservationId }).catch(() => null);
      const guestList = resData?.data?.guestList;
      let resolvedGuestId = guestId;
      let resolvedEmail   = null; // CB-stored email (auto-generated @groups.amansala.com)

      if (guestList && typeof guestList === "object" && !Array.isArray(guestList)) {
        const firstKey = Object.keys(guestList)[0];
        const g = firstKey ? guestList[firstKey] : null;
        if (g) {
          if (g.guestID || firstKey) resolvedGuestId = g.guestID || firstKey;
          resolvedEmail = g.guestEmail || null;
        }
      }

      // Real guest email from portal (may differ from CB auto-generated email)
      const realEmail = guestEmail && !guestEmail.includes('@groups.amansala.com') ? guestEmail : null;

      console.log("[CB replaceRes] guestId:", resolvedGuestId, "cbEmail:", resolvedEmail, "realEmail:", realEmail, "name:", firstName, "adults:", adultCount);

      // Update primary guest name + real email.
      // Phase 1: try with real guest email (updates name + syncs real email to CB).
      // Phase 2 fallback: if CB rejects (email conflict with another guest), retry name-only with CB email.
      let nameUpdated = false;
      if (resolvedGuestId) {
        const _putGuest = async (emailForCb) => {
          const gForm = new URLSearchParams({
            propertyID:     process.env.CLOUDBEDS_PROPERTY_ID,
            guestID:        String(resolvedGuestId),
            guestFirstName: firstName,
            guestLastName:  retreatName,
          });
          if (emailForCb) gForm.append("guestEmail", emailForCb);
          if (guestPhone) { gForm.append("guestPhone", guestPhone); gForm.append("guestCellPhone", guestPhone); }
          return httpJSON("PUT", `${CB_V1}/putGuest`, gForm.toString(), {
            Authorization:   `Bearer ${tok}`,
            "X-PROPERTY-ID": process.env.CLOUDBEDS_PROPERTY_ID,
            "Content-Type":  "application/x-www-form-urlencoded",
          });
        };

        // Try with real email first (so CB gets updated with guest's real email)
        const emailToTry = realEmail || resolvedEmail;
        const gRes = await _putGuest(emailToTry);
        console.log("[CB putGuest]", firstName, emailToTry ? `email=${emailToTry}` : 'no-email', JSON.stringify(gRes).slice(0, 200));
        if (gRes.success) {
          nameUpdated = true;
        } else if (realEmail) {
          // Fallback: email conflict — retry name-only with CB-stored email (keeps name sync even if email can't update)
          console.warn("[CB putGuest with real email failed]", gRes.message, "— retrying with CB email");
          const gRes2 = await _putGuest(resolvedEmail);
          console.log("[CB putGuest fallback]", firstName, JSON.stringify(gRes2).slice(0, 200));
          nameUpdated = !!(gRes2.success);
          if (!nameUpdated) console.warn("[CB putGuest fallback failed]", gRes2.message || gRes2);
        } else {
          console.warn("[CB putGuest name failed]", gRes.message || gRes);
        }
      }

      // putGuest fallback: cancel+recreate guarantees correct name since createReservation always sets guestFullName
      // Use passed-in startDate (always present) so fallback works even when getReservation returned null
      if (!nameUpdated && (startDate || resData?.data?.startDate)) {
        console.warn("[CB namefix] putGuest failed — falling back to cancel+recreate for", firstName);
        const allotmentCode = resData?.data?.allotmentBlockCode || null;
        await cancelReservation(tok, reservationId).catch(e => console.warn("[CB namefix cancel]", e.message));
        const newRes = await createReservation(tok, {
          roomName,
          startDate:         startDate || resData?.data?.startDate,
          endDate:           endDate   || resData?.data?.endDate,
          guestFullName:     firstName,
          groupName,
          leaderName,
          adults:            adultCount,
          dailyRate:         dailyRate || 0,
          allotmentBlockCode: allotmentCode,
          singlePax:         adultCount === 1,
        });
        console.log("[CB namefix recreate]", JSON.stringify(newRes).slice(0, 300));
        if (newRes.reservationId) {
          return {
            reservationId: newRes.reservationId,
            guestId:       newRes.guestId,
            roomName,
            updated:       true,
            adultsCount:   adultCount,
            adjustmentId:  newRes.adjustmentId || null,
          };
        }
      }

      // Update adults count via putReservation
      // Manage adult count via postGuest/deleteGuest.
      // putReservation v1.1 silently ignores flat adults=N and rejects bracket adults[0][quantity] params.
      // Pax count can only be reduced by deleting a 2nd guest profile (deleteGuest).
      const currentGuestCount = Object.keys(resData?.data?.guestList || {}).length || 1;
      console.log("[CB guest count] current:", currentGuestCount, "target:", adultCount);

      if (adultCount >= 2 && currentGuestCount < 2) {
        const g2Form = new URLSearchParams({
          propertyID:     process.env.CLOUDBEDS_PROPERTY_ID,
          reservationID:  reservationId,
          guestFirstName: "2nd",
          guestLastName:  retreatName,
          guestEmail:     `${reservationId}-g2@groups.amansala.com`,
          guestCountry:   "MX",
        }).toString();
        const g2Res = await cbPost(tok, "/postGuest", g2Form).catch(e => ({ error: e.message }));
        console.log("[CB postGuest 2nd]", JSON.stringify(g2Res).slice(0, 200));
        if (g2Res?.data?.guestID || g2Res?.guestID) nameUpdated = true;
      } else if (adultCount === 1 && currentGuestCount >= 2 && !noAdultsReduction) {
        // deleteGuest via API always returns HTML (Cloudbeds blocks DELETE on API-created guests).
        // Workaround: cancel the reservation and recreate it with adults=1 so Cloudbeds shows 1 pax.
        // Skip this when noAdultsReduction=true (e.g. room moves — just rename, don't cancel).
        const allotmentCode  = resData?.data?.allotmentBlockCode || null;
        const resStartDate = startDate || resData?.data?.startDate;
        const resEndDate   = endDate   || resData?.data?.endDate;
        console.log("[CB repax] cancel+recreate adults=1 allotment:", allotmentCode, "room:", roomName);
        await cancelReservation(tok, reservationId).catch(e => console.warn("[CB repax cancel]", e.message));
        const newRes = await createReservation(tok, {
          roomName,
          startDate:          resStartDate,
          endDate:            resEndDate,
          guestFullName:      firstName || retreatName,
          groupName,
          leaderName,
          adults:             1,
          dailyRate:          dailyRate || 0,
          allotmentBlockCode: allotmentCode,
          singlePax:          true,
        });
        console.log("[CB repax] new reservationId:", newRes.reservationId, "guestId:", newRes.guestId);
        if (newRes.reservationId) {
          return {
            reservationId: newRes.reservationId,
            guestId:       newRes.guestId,
            roomName,
            updated:       true,
            adultsCount:   1,
            adjustmentId:  newRes.adjustmentId || null,
          };
        }
      }

      // Update reservation dates if they differ from current
      // Normalize Cloudbeds date format (may return MM/DD/YYYY) to YYYY-MM-DD for comparison
      function _normDate(d) {
        if (!d) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
        const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
        return d;
      }
      const _curStart = _normDate(resData?.data?.startDate || '');
      const _curEnd   = _normDate(resData?.data?.endDate   || '');
      // Only check dates when we have confirmed reservation data — avoids cancel+recreate on getReservation failure
      const _datesChanged = !!(resData?.data && startDate && endDate && (_normDate(startDate) !== _curStart || _normDate(endDate) !== _curEnd));
      console.log("[CB dates check] cur:", _curStart, _curEnd, "new:", startDate, endDate, "changed:", _datesChanged);
      if (_datesChanged) {
        try {
          // putReservation cannot change dates (returns success but does nothing, or fails with bracket notation).
          // Only reliable approach: cancel + recreate with new dates, same pax.
          const _allotmentCodeD = resData?.data?.allotmentBlockCode || null;
          console.log("[CB updateDates] cancel+recreate:", _curStart, "->", startDate, "adults:", adultCount, "allotment:", _allotmentCodeD);
          await cancelReservation(tok, reservationId).catch(e => console.warn("[CB updateDates cancel]", e.message));
          const _newResD = await createReservation(tok, {
            roomName,
            startDate,
            endDate,
            guestFullName:      firstName,
            groupName,
            leaderName,
            adults:             adultCount,
            dailyRate:          dailyRate || 0,
            allotmentBlockCode: _allotmentCodeD,
            singlePax:          adultCount === 1,
          });
          console.log("[CB updateDates] new reservationId:", _newResD.reservationId, "guestId:", _newResD.guestId);
          if (_newResD.reservationId) {
            return {
              reservationId: _newResD.reservationId,
              guestId:       _newResD.guestId,
              roomName,
              updated:       true,
              adultsCount:   adultCount,
              adjustmentId:  _newResD.adjustmentId || null,
            };
          }
        } catch(e) { console.warn("[CB updateDates error]", e.message); }
      }

      return { reservationId, guestId: resolvedGuestId || guestId, roomName, updated: nameUpdated, adultsCount: adultCount };
    } catch (e) {
      console.warn("[CB replaceReservation error]", e.message);
      return { reservationId, guestId, roomName, updated: false, error: e.message };
    }
  }

  // No existing reservation — create one
  return createReservation(tok, {
    roomName, startDate, endDate,
    guestFullName: guestFirstName || undefined,
    groupName, leaderName, adults, dailyRate,
  });
}

async function getExternalReservations(tok, startDate, endDate, viewStart) {
  // Ensure room lookup is populated so we can resolve roomID → portal room name
  if (Object.keys(_roomLookup).length === 0) await getRooms(tok);
  const roomIdToName = {};
  for (const [name, id] of Object.entries(_roomLookup)) roomIdToName[String(id)] = name;

  // Normalize CB date strings (may be MM/DD/YYYY or YYYY-MM-DD) to YYYY-MM-DD
  function normDate(d) {
    if (!d) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
    return d;
  }

  let allRes = [];
  let pageNumber = 1;
  while (true) {
    const res = await cbGet(tok, "/getReservations", { startDate, endDate, pageNumber, pageSize: 100 });
    if (!res.success) throw new Error("getReservations failed: " + JSON.stringify(res).slice(0, 200));
    const page = res.data || [];
    allRes = allRes.concat(page);
    if (allRes.length >= (res.total || 0) || page.length === 0) break;
    pageNumber++;
    if (pageNumber > 20) break;
  }

  // De-duplicate by reservationID — CB list API can return the same ID on multiple pages
  const seenIds = new Set();
  allRes = allRes.filter(r => {
    const id = r.reservationID || r.id;
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  console.log("[getExternalReservations] fetched", allRes.length, "reservations (deduped) for", startDate, "-", endDate);

  // Helper: extract slots from a CB reservation row (list API or detail)
  function extractSlots(r) {
    const raw   = r.assignedRooms || r.rooms || r.accommodation || {};
    const slots = Array.isArray(raw) ? raw : Object.values(raw);
    return slots.filter(Boolean);
  }

  // Helper: resolve portal room name from a CB slot (room name is just a number like "20")
  // CB roomID format is "{roomTypeID}-{index}" — use it to map back to a portal name
  function slotToRoomName(s) {
    if (!s || typeof s === 'string') return s || null;
    if (s.roomName) return s.roomName; // CB name like "20" — only useful if portal also uses it
    if (s.name)     return s.name;
    const rid = s.roomID || s.roomId || s.id;
    return rid ? (roomIdToName[String(rid)] || null) : null;
  }

  function slotToTypeId(s) {
    if (!s || typeof s === 'string') return null;
    return String(s.roomTypeID || s.roomTypeId || '');
  }

  // First pass: collect all, flag which need individual detail fetch
  const reservations = [];
  const needDetail   = [];

  for (const r of allRes) {
    const st = (r.status || "").toLowerCase();
    if (["canceled","cancelled","no_show","void","deleted"].includes(st)) continue;
    const slots    = extractSlots(r);
    const roomNames  = slots.map(slotToRoomName).filter(Boolean);
    const typeIds    = [...new Set(slots.map(slotToTypeId).filter(Boolean))];
    // Flat-field fallbacks
    if (!roomNames.length && r.roomName) roomNames.push(r.roomName);
    if (!typeIds.length   && r.roomTypeID) typeIds.push(String(r.roomTypeID));
    const guest = r.guestName || r.guest?.guestName
      || [r.guestFirstName, r.guestLastName].filter(Boolean).join(" ")
      || "Guest";
    const entry = {
      reservationID: r.reservationID || r.id,
      guestName:     guest,
      startDate:     normDate(r.startDate || r.arrivalDate || ''),
      endDate:       normDate(r.endDate   || r.departureDate || ''),
      status:        r.status,
      rooms:         roomNames,
      roomTypeIDs:   typeIds,
      _email:        r.guestEmail || r.email || '',
      _blockCode:    r.allotmentBlockCode || '',
    };
    reservations.push(entry);
    if (!typeIds.length) needDetail.push(entry);
  }

  // Second pass: fetch individual reservations that had no room info.
  // Skip ONLY portal-managed groups (@groups.amansala.com) — those already appear as portal blocks.
  // Direct CB bookings (even under allotment blocks) should show on the calendar.
  // Only fetch those whose stay overlaps today or the future (skip already checked-out).
  // Batch at 10 concurrent, capped to stay within 26s Lambda timeout.
  if (needDetail.length) {
    const today = new Date().toISOString().slice(0, 10);
    // windowStart = the actual view window the user navigated to (e.g. Nov 1 when viewing November).
    // Falls back to startDate (lookback start) if not provided.
    // Reservations whose startDate falls within the view window get priority so future months
    // always fetch those rooms first before being capped out.
    const windowStart = viewStart || startDate;
    const toFetch = needDetail
      .filter(e => !e._email.endsWith('@groups.amansala.com'))
      .filter(e => !e.endDate || e.endDate >= today)    // skip already checked-out
      .sort((a, b) => {
        // Priority: reservations that START on or after the view window first (closest first),
        // then checked-in guests (startDate <= today), then past-window sorted ascending.
        const aInWindow = a.startDate >= windowStart ? 0 : 1;
        const bInWindow = b.startDate >= windowStart ? 0 : 1;
        if (aInWindow !== bInWindow) return aInWindow - bInWindow;
        return a.startDate.localeCompare(b.startDate);
      })
      .slice(0, 300); // cap at 300 — batches of 10 ≈ 30 rounds ≈ 15s, within 26s Lambda timeout
    console.log("[getExternal] roomIdToName size:", Object.keys(roomIdToName).length, "sample:", Object.entries(roomIdToName).slice(0,3).map(([k,v])=>`${k}→${v}`).join(', '));
    console.log("[getExternalReservations] needDetail:", needDetail.length, "→ toFetch:", toFetch.length, "current:", toFetch.filter(e=>e.startDate<=today).length, "future:", toFetch.filter(e=>e.startDate>today).length);
    let loggedCount = 0;
    for (let i = 0; i < toFetch.length; i += 10) {
      const batch = toFetch.slice(i, i + 10);
      await Promise.all(batch.map(async entry => {
        try {
          const detail = await cbGet(tok, "/getReservation", { reservationID: entry.reservationID });
          if (!detail.success || !detail.data) {
            console.log("[getExternalReservations] detail fetch failed for", entry.guestName, entry.reservationID, JSON.stringify(detail).slice(0,300));
            return;
          }
          const d = detail.data;
          const assigned   = d.assigned   || {};
          const unassigned = d.unassigned || {};
          // Also try rooms/accommodation/assignedRooms fields
          const rawRooms = d.assignedRooms || d.accommodation || d.rooms || {};
          const rawSlots = Array.isArray(rawRooms) ? rawRooms : Object.values(rawRooms);
          const slots = [
            ...(Array.isArray(assigned)   ? assigned   : Object.values(assigned)),
            ...(Array.isArray(unassigned) ? unassigned : Object.values(unassigned)),
            ...rawSlots,
          ];
          entry.rooms      = slots.map(slotToRoomName).filter(Boolean);
          entry.roomTypeIDs = [...new Set(slots.map(slotToTypeId).filter(Boolean))];
          // Flat-field fallbacks
          if (!entry.rooms.length && d.roomName)     entry.rooms = [d.roomName];
          if (!entry.roomTypeIDs.length && d.roomTypeID) entry.roomTypeIDs = [String(d.roomTypeID)];
          console.log(`[CBdetail] ${entry.guestName} typeIDs=${entry.roomTypeIDs} rooms=${entry.rooms}`);
        } catch(e) {
          console.log("[getExternalReservations] detail fetch error for", entry.guestName, e.message);
        }
      }));
    }
  }

  // Exclude portal-managed reservations — they appear as colored blocks via Supabase blocked_rooms.
  // Returning them here would duplicate them as confusing yellow blocks.
  let external = reservations.filter(e => !e._email.endsWith('@groups.amansala.com'));
  external.forEach(e => {
    delete e._email;
    delete e._blockCode;
    // Reservations with no room after detail fetch must not show via type fallback —
    // that would render them in every room of the same type (false overbookings).
    if (!e.rooms.length) e.roomTypeIDs = [];
  });

  // De-duplicate by room+startDate+endDate: staging tests may have created duplicate CB reservations
  // with different IDs but same room/dates. Prefer the one with the most specific guest name
  // (individual > group), then keep earliest by reservationID as tiebreak.
  const roomDateSeen = new Map();
  const deduped = [];
  for (const e of external) {
    const rooms = (e.rooms || []).sort();
    if (!rooms.length) { deduped.push(e); continue; } // no room assigned — keep as-is
    for (const room of rooms) {
      const key = `${room}|${e.startDate}|${e.endDate}`;
      const existing = roomDateSeen.get(key);
      if (!existing) {
        roomDateSeen.set(key, e);
      } else {
        // Keep the one with a more specific (individual) guest name — shorter = more generic
        const existingIsGroup = /group$/i.test(existing.guestName);
        const newIsGroup      = /group$/i.test(e.guestName);
        if (existingIsGroup && !newIsGroup) roomDateSeen.set(key, e); // prefer individual
        // else keep existing
      }
    }
  }
  // Rebuild: include each entry only once (may be referenced by multiple room keys)
  const keptIds = new Set([...roomDateSeen.values()].map(e => e.reservationID));
  // Also keep any entries with no rooms (they weren't de-duped above)
  const finalResult = external.filter(e => !e.rooms?.length || keptIds.has(e.reservationID));

  console.log("[getExternalReservations] result:", finalResult.length, "external (deduped from", external.length, ") /", reservations.length, "total");
  return { success: true, reservations: finalResult };
}

async function createGroupEvent(tok, body) {
  const { retreatName, leaderName, startDate, endDate, rooms } = body;
  const propId = process.env.CLOUDBEDS_PROPERTY_ID;
  const eventName = [retreatName || leaderName || "Retreat", startDate].filter(Boolean).join(" · ");

  let eventId   = null;
  let eventCode = body.eventCode || null; // provided in extend mode

  if (eventCode) {
    // Extend mode: reuse existing event, skip creation
    eventId = eventCode; // use eventCode as reference (allotmentBlock only needs eventCode)
    console.log("[CB createGroupEvent] extend mode, reusing event:", eventCode);
  } else {
    // 1–2. Try to create Event via Events v2 API — non-fatal if it fails
    try {
      // 1. Get source ID — data is [[{sourceID, ...}, ...]] (doubly nested)
      const sourcesRes = await cbGet(tok, "/getSources").catch(() => ({ data: [] }));
      const sourcesList = Array.isArray((sourcesRes.data || [])[0]) ? (sourcesRes.data || [])[0] : (sourcesRes.data || []);
      const sourceId = String(sourcesList[0]?.sourceID || process.env.CLOUDBEDS_SOURCE_ID || "s-1");

      // 2. Create Event via Events v2 API
      const eventRes = await httpJSON("POST",
        "https://api.cloudbeds.com/events/v2/events",
        JSON.stringify({ name: eventName, sourceId, startDate: startDate || null, endDate: endDate || null, status: "definite" }),
        { Authorization: `Bearer ${tok}`, "x-property-id": propId, "Content-Type": "application/json" }
      );
      console.log("[CB createGroupEvent] event:", JSON.stringify(eventRes).slice(0, 300));
      eventId   = eventRes.id   || eventRes.data?.id;
      eventCode = eventRes.eventCode || eventRes.data?.eventCode;
      if (!eventId) console.warn("[CB createGroupEvent] event returned no ID, continuing without event:", JSON.stringify(eventRes).slice(0, 200));
    } catch (e) {
      console.warn("[CB createGroupEvent] event creation failed, continuing with allotment only:", e.message);
    }
  }

  // 3. Ensure room lookup populated
  if (Object.keys(_roomLookup).length === 0) await getRooms(tok);

  // 4. Group rooms by type → quantity (from requested rooms)
  const roomTypeCounts = {};
  for (const roomName of (rooms || [])) {
    const rtId = _roomTypeLookup[roomName] || _roomTypeLookup[(roomName||"").toLowerCase()];
    if (rtId) roomTypeCounts[rtId] = (roomTypeCounts[rtId] || 0) + 1;
  }
  // Include ALL known room types so any room can be added later without allotment rejection
  for (const rtId of Object.keys(_roomTypeToRooms)) {
    if (!roomTypeCounts[rtId]) roomTypeCounts[rtId] = 0;
  }

  // 5. Create AllotmentBlock via v1.3 — X-PROPERTY-ID sent via header, NOT in body
  // rateType enum: "base_rate" | "rate_plan" | "custom"
  // allotmentType enum: "allotment" | "based_on_availability"
  // allotmentBlockStatus enum: "definite" | "tentative" | "lead"
  // Dates go into allotmentIntervals[i][availability][j][date], not top-level fields
  const blockParts = [
    `allotmentBlockName=${encodeURIComponent(eventName)}`,
    `allotmentBlockStatus=definite`,
    `allotmentType=based_on_availability`,
    `rateType=base_rate`,
  ];
  if (eventCode) blockParts.push(`eventCode=${encodeURIComponent(eventCode)}`);

  // Generate date array [startDate, endDate)
  const datesInRange = [];
  if (startDate && endDate) {
    let d = new Date(startDate + "T00:00:00Z");
    const dEnd = new Date(endDate + "T00:00:00Z");
    while (d < dEnd) { datesInRange.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  }

  let i = 0;
  for (const [rtId, qty] of Object.entries(roomTypeCounts)) {
    blockParts.push(`allotmentIntervals[${i}][roomTypeId]=${encodeURIComponent(rtId)}`);
    let j = 0;
    for (const dateStr of datesInRange) {
      blockParts.push(`allotmentIntervals[${i}][availability][${j}][date]=${dateStr}`);
      blockParts.push(`allotmentIntervals[${i}][availability][${j}][blockAllotted]=${qty + 10}`);
      j++;
    }
    i++;
  }

  const blockStr = blockParts.join("&");
  console.log("[CB createAllotmentBlock] body:", blockStr.slice(0, 500));
  const blockRes = await httpJSON("POST", `${CB_BASE}/createAllotmentBlock`, blockStr, {
    Authorization:   `Bearer ${tok}`,
    "X-PROPERTY-ID": process.env.CLOUDBEDS_PROPERTY_ID,
    "Content-Type":  "application/x-www-form-urlencoded",
  }, 25000);
  console.log("[CB createGroupEvent] allotmentBlock:", JSON.stringify(blockRes).slice(0, 400));

  // Response: { success, data: [{ allotmentBlockCode, ... }] }
  const allotmentBlockCode =
    (Array.isArray(blockRes.data) ? blockRes.data[0]?.allotmentBlockCode : null)
    || blockRes.data?.allotmentBlockCode
    || blockRes.allotmentBlockCode;
  if (!allotmentBlockCode) throw new Error("AllotmentBlock creation failed: " + JSON.stringify(blockRes).slice(0, 400));

  return { eventId, eventCode, allotmentBlockCode };
}

async function updateReservationNotes(tok, body) {
  const { reservationId, notes, noteId } = body;
  if (!reservationId) return { error: "reservationId required" };
  const CB_V1 = "https://hotels.cloudbeds.com/api/v1.1";
  const hdrs  = { Authorization: `Bearer ${tok}`, "X-PROPERTY-ID": process.env.CLOUDBEDS_PROPERTY_ID, "Content-Type": "application/x-www-form-urlencoded" };

  if (!notes && noteId) {
    const res = await httpJSON("DELETE", `${CB_V1}/deleteNote?propertyID=${encodeURIComponent(process.env.CLOUDBEDS_PROPERTY_ID)}&noteID=${encodeURIComponent(noteId)}`, null, hdrs).catch(e => ({ error: e.message }));
    console.log("[CB deleteNote]", noteId, JSON.stringify(res).slice(0, 200));
    return { deleted: true };
  }
  if (!notes) return { noteId: null };

  if (noteId) {
    const form = new URLSearchParams({ propertyID: process.env.CLOUDBEDS_PROPERTY_ID, noteID: noteId, notes }).toString();
    const res  = await httpJSON("PUT", `${CB_V1}/putNote`, form, hdrs).catch(e => ({ error: e.message }));
    console.log("[CB putNote]", noteId, JSON.stringify(res).slice(0, 200));
    return { noteId: res?.data?.noteID || res?.noteID || noteId };
  }

  const form = new URLSearchParams({ propertyID: process.env.CLOUDBEDS_PROPERTY_ID, reservationID: reservationId, notes, noteType: "info" }).toString();
  const res  = await cbPost(tok, "/postNote", form).catch(e => ({ error: e.message }));
  console.log("[CB postNote]", JSON.stringify(res).slice(0, 200));
  return { noteId: res?.data?.noteID || res?.data?.id || null };
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function cbGet(tok, path, params = {}) {
  const qs = new URLSearchParams({
    propertyID: process.env.CLOUDBEDS_PROPERTY_ID,
    ...params,
  }).toString();
  return httpJSON("GET", `${CB_BASE}${path}?${qs}`, null, {
    Authorization:  `Bearer ${tok}`,
    "X-PROPERTY-ID": process.env.CLOUDBEDS_PROPERTY_ID,
  }, 18000); // was the httpJSON default (9000ms) — too tight against Cloudbeds' occasional slow responses, was causing spurious 502s
}

function cbPost(tok, path, formBody, timeoutMs = 22000) {
  return httpJSON("POST", `${CB_BASE}${path}`, formBody, {
    Authorization:  `Bearer ${tok}`,
    "X-PROPERTY-ID": process.env.CLOUDBEDS_PROPERTY_ID,
    "Content-Type": "application/x-www-form-urlencoded",
  }, timeoutMs);
}

function httpJSON(method, url, body, headers = {}, timeoutMs = 9000) {
  return new Promise((resolve, reject) => {
    const u   = new URL(url);
    const buf = body ? Buffer.from(body) : null;
    const hdrs = { ...headers };
    if (buf) hdrs["Content-Length"] = buf.length;
    const opts = {
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method,
      headers:  hdrs,
      timeout:  timeoutMs,
    };
    const req = request(opts, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error(`Cloudbeds API timeout after ${timeoutMs}ms (${method} ${u.pathname})`));
    });
    if (buf) req.write(buf);
    req.end();
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function deriveProperty(roomTypeName) {
  const n = (roomTypeName || "").toUpperCase();
  if (n.includes("SHANTI"))   return "CASA SHANTI";
  if (n.includes("MOJAVE"))   return "MOJAVE";
  if (n.includes("CHIKA"))    return "CHIKA";
  return "AMANSALA";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type":                 "application/json",
  };
}

function ok(headers, data, statusCode = 200) {
  return { statusCode, headers, body: JSON.stringify(data) };
}

function safeJSON(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

// Low season: Jun 1 – Oct 1
function isLowSeason(dateStr) {
  const d = new Date(dateStr);
  const m = d.getUTCMonth() + 1; // 1-12
  const day = d.getUTCDate();
  return (m === 6 || m === 7 || m === 8 || m === 9 || (m === 10 && day === 1));
}
