'use strict';

const SUPABASE_URL   = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const ANTHROPIC_API  = 'https://api.anthropic.com/v1/messages';
const MODEL          = 'claude-haiku-4-5-20251001';
const MAX_TOOL_LOOPS = 6;

// Room types that are just individual-bed views of physical rooms — skip in type summaries
const SKIP_RT_IDS = new Set(['bd1','bd2','bd3','bd4','c4b','c4c']);

function cors() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function ok(body)        { return { statusCode: 200, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(c, msg) { return { statusCode: c,   headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) }; }

async function supaGet(key, path) {
  const res  = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Accept': 'application/json' },
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}
async function supaPatch(key, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': `Bearer ${key}`, 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status };
}
async function supaPost(key, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': `Bearer ${key}`, 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status };
}

async function logAction(key, bookingId, userMessage, toolName, toolInput, toolResult) {
  await supaPost(key, 'bot_log', {
    booking_id:   bookingId,
    user_message: userMessage,
    tool_name:    toolName,
    tool_input:   toolInput,
    tool_result:  toolResult,
  }).catch(() => {});
}

// Container rt → bed rt (for sub-bed expansion)
const CONT_TO_BED = { rt6: 'bd1', rt7: 'bd2', rt8: 'bd3', rt9: 'bd4' };

// ─── Shared data loader ───────────────────────────────────────
async function loadBaseData(key, bookingId) {
  const [bkR, rtR, otherR] = await Promise.all([
    supaGet(key, `bookings?id=eq.${encodeURIComponent(bookingId)}&select=*&limit=1`),
    supaGet(key, `room_types?select=id,name,rooms&order=name`),
    supaGet(key, `bookings?id=neq.${encodeURIComponent(bookingId)}&select=blocked_rooms,start_date,end_date&status=neq.cancelled`),
  ]);
  const bk      = Array.isArray(bkR.data) ? bkR.data[0] : null;
  const allRts  = Array.isArray(rtR.data) ? rtR.data : [];
  const rts     = allRts.filter(rt => !SKIP_RT_IDS.has(rt.id));
  const others  = Array.isArray(otherR.data) ? otherR.data : [];
  if (!bk) return null;

  const conflictSet = new Set(
    others
      .filter(b => b.start_date < bk.end_date && b.end_date > bk.start_date)
      .flatMap(b => b.blocked_rooms ?? [])
  );

  // Map room name → its type (includes bed types for sub-bed lookups)
  const roomToType = {};
  allRts.forEach(rt => (rt.rooms ?? []).forEach(r => { roomToType[r] = rt; }));

  // Build sub-bed lookup: parentRoom → [bedNames]
  const bedRoomSet = {};
  Object.entries(CONT_TO_BED).forEach(([contId, bedId]) => {
    const bedRt = allRts.find(rt => rt.id === bedId);
    bedRoomSet[contId] = new Set(bedRt?.rooms ?? []);
  });
  function getSubBeds(parentRoom, contRtId) {
    const names = bedRoomSet[contRtId];
    if (!names) return [];
    return [
      parentRoom+'a', parentRoom+'b', parentRoom+'c', parentRoom+'d',
      parentRoom+'-a', parentRoom+'-b', parentRoom+'-c',
      parentRoom+' -a', parentRoom+' -b', parentRoom+' -c',
    ].filter(s => names.has(s));
  }

  return { bk, rts, conflictSet, roomToType, getSubBeds };
}

// ─── Tool definitions ─────────────────────────────────────────
const TOOLS = [
  {
    name: 'get_retreat_info',
    description: 'Get details about this retreat: name, dates, teacher, group size, status.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_my_room_types',
    description: 'Get a summary of room TYPES currently assigned to this retreat (e.g. "2 Beachfront King, 1 Superior"). Never shows individual room numbers.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_available_room_types',
    description: 'Get which room types have rooms available during this retreat\'s dates, with the count available per type. Use this to answer availability questions.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'add_room_by_type',
    description: 'Add one room of a specific type to this retreat. Automatically selects an available room — the teacher never sees the room number.',
    input_schema: {
      type: 'object',
      properties: {
        type_name: { type: 'string', description: 'Room type name as shown to the teacher, e.g. "Superior", "Garden Plus", "Double", "Beachfront King"' },
      },
      required: ['type_name'],
    },
  },
  {
    name: 'remove_room_by_type',
    description: 'Remove one room of a specific type from this retreat.',
    input_schema: {
      type: 'object',
      properties: {
        type_name: { type: 'string', description: 'Room type name, e.g. "Superior", "Double"' },
      },
      required: ['type_name'],
    },
  },
  {
    name: 'get_rooming_list',
    description: 'Get the rooming list: which guests are assigned to which room TYPE (not room number), and who is unassigned.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_pricing_info',
    description: 'Get room rates (solo/sharing, high/low season) and available add-on packages with prices. Use this when a teacher asks about pricing, costs, packages, activities, or how much rooms cost.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_estimated_quote',
    description: 'Calculate an estimated quote for this retreat based on current blocked rooms, number of guests, and season. Use when a teacher asks about total cost, estimate, or budget.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

// ─── Fuzzy type match ─────────────────────────────────────────
function matchType(typeName, rts) {
  const q = typeName.toLowerCase().trim();
  // Exact match first
  let match = rts.find(rt => rt.name.toLowerCase() === q);
  if (match) return match;
  // Contains match
  match = rts.find(rt => rt.name.toLowerCase().includes(q) || q.includes(rt.name.toLowerCase()));
  if (match) return match;
  // Word overlap
  const qWords = q.split(/\s+/);
  match = rts.find(rt => {
    const rtWords = rt.name.toLowerCase().split(/\s+/);
    return qWords.some(w => rtWords.includes(w));
  });
  return match || null;
}

// ─── Tool execution ───────────────────────────────────────────
async function executeTool(name, input, bookingId, supaKey) {
  switch (name) {

    case 'get_retreat_info': {
      const d = await loadBaseData(supaKey, bookingId);
      if (!d) return { error: 'Booking not found' };
      const { bk } = d;
      return {
        retreat_name: bk.retreat_name,
        leader_name:  bk.leader_name,
        start_date:   bk.start_date,
        end_date:     bk.end_date,
        pax:          bk.pax,
        status:       bk.status,
      };
    }

    case 'get_my_room_types': {
      const d = await loadBaseData(supaKey, bookingId);
      if (!d) return { error: 'Booking not found' };
      const { bk, roomToType } = d;
      const blocked = bk.blocked_rooms ?? [];
      // Count by type
      const counts = {};
      blocked.forEach(r => {
        const rt = roomToType[r];
        const label = rt?.name ?? 'Unknown';
        counts[label] = (counts[label] ?? 0) + 1;
      });
      if (Object.keys(counts).length === 0) return { message: 'No rooms blocked yet for this retreat.' };
      return { room_types: counts, total: blocked.length };
    }

    case 'get_available_room_types': {
      const d = await loadBaseData(supaKey, bookingId);
      if (!d) return { error: 'Booking not found' };
      const { bk, rts, conflictSet } = d;
      const blocked = new Set(bk.blocked_rooms ?? []);

      const result = [];
      rts.forEach(rt => {
        const rooms = rt.rooms ?? [];
        const available = rooms.filter(r => !blocked.has(r) && !conflictSet.has(r));
        const myCount   = rooms.filter(r => blocked.has(r)).length;
        if (available.length > 0 || myCount > 0) {
          result.push({
            type:           rt.name,
            available_count: available.length,
            already_in_retreat: myCount,
          });
        }
      });
      return { room_types: result };
    }

    case 'add_room_by_type': {
      const d = await loadBaseData(supaKey, bookingId);
      if (!d) return { error: 'Booking not found' };
      const { bk, rts, conflictSet, getSubBeds } = d;

      const rt = matchType(input.type_name, rts);
      if (!rt) return { error: `No room type found matching "${input.type_name}". Available types: ${rts.map(r => r.name).join(', ')}` };

      // These types are managed exclusively by the Amansala team — never via bot
      const rtLower = rt.name.toLowerCase();
      if (rtLower.includes('beachfront king') || rtLower.includes('beachview double')) {
        return { success: false, reason: `${rt.name} rooms must be requested directly with the Amansala team at +52 55 9225 2190.` };
      }

      const blocked   = new Set(bk.blocked_rooms ?? []);
      const available = (rt.rooms ?? []).filter(r => !blocked.has(r) && !conflictSet.has(r));
      if (available.length === 0) {
        return { success: false, reason: `No ${rt.name} rooms are available for your retreat dates.` };
      }

      // For container types (Double, Triple, Quad, Beachview Double), add individual sub-beds
      const bedRtId = CONT_TO_BED[rt.id];
      let toAdd = [];
      if (bedRtId) {
        for (const parentRoom of available) {
          const subs          = getSubBeds(parentRoom, rt.id);
          const availableSubs = subs.filter(s => !blocked.has(s) && !conflictSet.has(s));
          if (availableSubs.length > 0) { toAdd = availableSubs; break; }
        }
        if (toAdd.length === 0) toAdd = [available[0]]; // fallback: add parent
      } else {
        // For direct room types (e.g. Beachfront King), prefer rooms whose base name
        // is not already blocked — avoid adding '3B' when '3A' is blocked (same physical room).
        const getBase = r => r.replace(/[-\s]*[a-zA-Z]+$/, '');
        const blockedBases = new Set([...(bk.blocked_rooms ?? [])].map(getBase));
        const soloRoom = available.find(r => !blockedBases.has(getBase(r)));
        toAdd = [soloRoom ?? available[0]];
      }

      const updated = [...(bk.blocked_rooms ?? []), ...toAdd];
      const patch   = await supaPatch(supaKey, `bookings?id=eq.${encodeURIComponent(bookingId)}`, { blocked_rooms: updated });
      if (!patch.ok) return { error: 'Failed to update blocked rooms' };

      return { success: true, type_added: rt.name, message: `A ${rt.name} room has been added to your retreat.` };
    }

    case 'remove_room_by_type': {
      const d = await loadBaseData(supaKey, bookingId);
      if (!d) return { error: 'Booking not found' };
      const { bk, rts, roomToType, getSubBeds } = d;

      const rt = matchType(input.type_name, rts);
      if (!rt) return { error: `No room type found matching "${input.type_name}"` };

      const blocked  = bk.blocked_rooms ?? [];
      let   toRemove = [];

      // Container types (Double/Triple/Quad/Beachview) were added as sub-beds, not parent rooms
      const bedRtId = CONT_TO_BED[rt.id];
      if (bedRtId) {
        for (const parentRoom of (rt.rooms ?? [])) {
          const subs        = getSubBeds(parentRoom, rt.id);
          const blockedSubs = subs.filter(s => blocked.includes(s));
          if (blockedSubs.length > 0) { toRemove = blockedSubs; break; }
        }
        // Fallback: parent room was added directly
        if (toRemove.length === 0) {
          const direct = blocked.find(r => roomToType[r]?.id === rt.id);
          if (direct) toRemove = [direct];
        }
      } else {
        const direct = blocked.find(r => roomToType[r]?.id === rt.id);
        if (direct) toRemove = [direct];
      }

      if (toRemove.length === 0) return { success: false, reason: `No ${rt.name} rooms are currently in your retreat.` };

      const updated = blocked.filter(r => !toRemove.includes(r));
      const patch   = await supaPatch(supaKey, `bookings?id=eq.${encodeURIComponent(bookingId)}`, { blocked_rooms: updated });
      if (!patch.ok) return { error: 'Failed to update blocked rooms' };

      return { success: true, type_removed: rt.name, message: `A ${rt.name} room has been removed from your retreat.` };
    }

    case 'get_rooming_list': {
      const d = await loadBaseData(supaKey, bookingId);
      if (!d) return { error: 'Booking not found' };
      const { roomToType } = d;

      const r    = await supaGet(supaKey, `registrations?booking_id=eq.${encodeURIComponent(bookingId)}&select=room,guests`);
      const regs = Array.isArray(r.data) ? r.data : [];

      return {
        assigned: regs
          .filter(reg => reg.room && (reg.guests ?? []).some(g => g.name))
          .map(reg => ({
            room_type: roomToType[reg.room]?.name ?? reg.room,
            guests:    (reg.guests ?? []).filter(g => g.name).map(g => g.name),
          })),
        unassigned: regs
          .filter(reg => !reg.room)
          .flatMap(reg => (reg.guests ?? []).filter(g => g.name).map(g => g.name)),
      };
    }

    case 'get_pricing_info': {
      const [rtR, aoR] = await Promise.all([
        supaGet(supaKey, `room_types?select=id,name,price1,price2,price1_low,price2_low,max_occ&order=name`),
        supaGet(supaKey, `add_ons?select=name,price,category&order=name`),
      ]);
      const rts = (Array.isArray(rtR.data) ? rtR.data : []).filter(rt => !SKIP_RT_IDS.has(rt.id));
      const aos = Array.isArray(aoR.data) ? aoR.data : [];

      const rates = rts
        .filter(rt => rt.price1 || rt.price2)
        .map(rt => ({
          type:          rt.name,
          solo_high:     rt.price1    ? `$${rt.price1}/night`     : null,
          sharing_high:  rt.price2    ? `$${rt.price2}pp/night`   : null,
          solo_low:      rt.price1_low ? `$${rt.price1_low}/night` : null,
          sharing_low:   rt.price2_low ? `$${rt.price2_low}pp/night` : null,
          max_occ:       rt.max_occ,
        }));

      return {
        room_rates: rates,
        packages:   aos.map(a => ({ name: a.name, price: a.price ? `$${a.price}/person` : 'included', category: a.category })),
        note: 'High season roughly Dec–Apr; Low season May–Nov. Sharing rates are per person when two guests share a room.',
      };
    }

    case 'get_estimated_quote': {
      const d = await loadBaseData(supaKey, bookingId);
      if (!d) return { error: 'Booking not found' };
      const { bk, rts, roomToType } = d;

      const nights = bk.start_date && bk.end_date
        ? Math.round((new Date(bk.end_date+'T12:00:00') - new Date(bk.start_date+'T12:00:00')) / 86400000)
        : 0;

      // Determine season from start_date month
      const month = bk.start_date ? new Date(bk.start_date+'T12:00:00').getMonth() + 1 : 0;
      const isLow = month >= 5 && month <= 11;

      const blocked = bk.blocked_rooms ?? [];
      const rtR = await supaGet(supaKey, `room_types?select=id,name,price1,price2,price1_low,price2_low&order=name`);
      const allRts = Array.isArray(rtR.data) ? rtR.data : [];
      const rtById = Object.fromEntries(allRts.map(rt => [rt.id, rt]));

      // Count rooms by type with their rates
      const lineItems = [];
      const counted = {};
      blocked.forEach(r => {
        const rt = roomToType[r];
        if (!rt) return;
        const pricing = rtById[rt.id];
        if (!pricing) return;
        const label = rt.name;
        if (!counted[label]) {
          counted[label] = { count: 0, rt: pricing };
        }
        counted[label].count++;
      });

      let totalLow = 0, totalHigh = 0;
      Object.entries(counted).forEach(([name, { count, rt }]) => {
        const soloH = rt.price1 ?? 0;
        const soloL = rt.price1_low ?? soloH;
        lineItems.push({ type: name, count, rate_high: `$${soloH}/night`, rate_low: `$${soloL}/night` });
        totalHigh += soloH * count * nights;
        totalLow  += soloL  * count * nights;
      });

      return {
        nights,
        season:      isLow ? 'Low (May–Nov)' : 'High (Dec–Apr)',
        pax:         bk.pax,
        line_items:  lineItems,
        estimated_total_high: `$${totalHigh.toLocaleString()}`,
        estimated_total_low:  `$${totalLow.toLocaleString()}`,
        note: 'Estimate based on solo rates × rooms × nights. Sharing rate applies when 2 guests share a room.',
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── System prompt ────────────────────────────────────────────
function buildSystem(bookingId) {
  return `You are a helpful assistant for retreat leaders at Amansala Tulum, Mexico.
You help teachers manage their retreat rooms using simple, friendly language.

IMPORTANT RULES:
- Respond in the same language the teacher uses (Spanish or English).
- NEVER mention room numbers or internal room codes to the teacher. Only use room TYPE names (e.g. "Superior", "Garden Plus", "Beachfront King").
- When a teacher asks about available rooms, always call get_available_room_types first and present the results by type name only.
- When a teacher asks what rooms they have, call get_my_room_types and present by type name.
- If a teacher asks to add a room WITHOUT specifying a type, ask which type they prefer first. Do not assume.
- If a teacher specifies a type, call add_room_by_type directly.

ROOM LIMITS:
- UNAVAILABLE VIA CHAT — Beachfront King AND Beachview Double (also called "Bed in Beachview Double"): you may NEVER add these types, even if the teacher asks. Politely explain that these room types must be requested directly with the Amansala team: +52 55 9225 2190 (WhatsApp/phone).
- ALL OTHER TYPES: you may add rooms of those types as long as they are available — 1 room per request (one at a time), up to what is available.
- When adding/removing rooms, confirm with the type name only (e.g. "I've added a Superior room to your retreat").
- If a teacher needs many changes, also mention they can contact the team at +52 55 9225 2190.

BALANCE / BILL:
- When a teacher asks how much they owe, what the total is, or what their balance is, do NOT call get_estimated_quote automatically. Instead, tell them: "You can see your estimated quote by clicking the 'Est Quote' button in your portal, or tap 'My Rooming List' for a detailed view with a full breakdown."
- Only call get_estimated_quote if they explicitly ask for an estimate from the assistant.

HOW TO ADD GUESTS TO THE ROOMING LIST:
- When a teacher asks how to add people, guests, or participants to their rooming list or rooms, explain: "Click the + button in the room where you want to add them, then fill in all their details — including email address and phone number."

GENERAL:
- Be warm, concise, and professional.
- Never act on bookings other than the one assigned to this session.
- When a teacher asks about pricing, packages, or costs, always call get_pricing_info first.
- When a teacher asks for an estimate or total cost (and they want the assistant to calculate it), call get_estimated_quote.
- Seasons: High season is roughly December–April, Low season is May–November.
- Sharing rate applies when 2 guests share a room (per person price, usually lower than solo).

INCLUDED ACTIVITIES BY SEASON (contract inclusions — do NOT say other activities are included):
- Low season (May–November): Mayan Clay, Mangroves, and Cooking Class OR Salsa Class are included.
- High season (December–April): Cooking Class OR Salsa Class only are included.
- Any activity NOT listed above is an optional add-on with an extra cost.
- When someone asks about packages or add-ons, call get_pricing_info to get the cost per package and individual activity prices for their retreat, then present both options clearly.

ROOM TYPES at Amansala (use these exact names):
Beachfront King, Superior, Garden Plus, Garden, Simple n Small,
Beachview Double, Double, Triple, Quad,
Casa Master, Casa King Downstairs, Casa Grande Up King,
Casa Shanti, Shanti King, Shanti 2 Bed, Casita 4

TRANSPORT:
- Amansala offers its own airport transport service. Guests book via this link:
  https://amansala-staging.netlify.app/transport-form.html
- Present the link as plain text only — do NOT wrap it in markdown bold (**), italics (*), or backticks.
- When asked about transport prices, share the rates below. Prices are per person (USD, +16% tax). Arrival and departure rates are the same.
- IMPORTANT: Always say "private transport" — NEVER say "private van", "van", or any vehicle type.

  FROM CANCUN AIRPORT:
  1 person private: $195 | 2 sharing: $100/person | 3 sharing: $80/person | 4 sharing: $65/person | 5 sharing: $55/person | 6+: $45/person

  FROM TULUM AIRPORT:
  1 person private: $145 | 2 sharing: $80/person | 3 sharing: $65/person | 4 sharing: $55/person | 5 sharing: $45/person | 6 sharing: $40/person

- If a leader asks how guests can update their flight information: "When a guest fills out the transport form, they receive a confirmation email. That email has an 'Update Info' button they can use to update their flight details anytime."

AMENITIES & FACILITIES:
- Hair dryer: YES, available in rooms
- Iron: YES, available
- Bicycles: NO, not available at Amansala
- Weights: YES, available — but guests should specify what they need as inventory is limited
- Pool: YES, open 8:00am – 9:00pm
- Restaurant: YES, open 7:30am – 10:00pm
- Beach club: YES, open 8:00am – 7:00pm

OFFSITE DINNER OPTIONS:
- If a leader asks about the offsite dinner or dinner options, respond with exactly this structure — do NOT change the order:
  "For your offsite dinner night, here are your options:
  1. Dinner at Amansala — $40/person + tax & gratuity. Stay right here and enjoy a special dinner on property.
  2. Gitano — Amazing vibe, great atmosphere and delicious food. One of the most popular spots in Tulum.
  3. Mateos Mexican Grill — Perfect if you want something different and authentically Mexican."
- Amansala also offers transport service to Gitano and Mateos. Mention this at the end, and clarify: to coordinate transport and get pricing, the leader can contact the staff through their WhatsApp group — the leader handles all coordination for the group. The transport form is only for airport pickups.

YOGA STUDIOS:
- Equipment available: yoga mats, blocks, cushions, straps, incense, candles
- Sound system: YES, available in all yoga studios
- Water: YES, available in all yoga studios

SPA / TREATMENTS:
- Cold facials: YES, available
- Regular facials: YES, available

SPA SERVICES:
- Questions about spa treatments (what they are, descriptions, prices) must be answered DIRECTLY from the information below — do NOT call get_pricing_info for spa questions.
- If asked about spa treatments, their descriptions, or prices, use the information below (USD, +16% tax):

  Mayan Healing Massage (Sobada) — 1hr $111 / 80min $165
    Traditional Mayan massage releasing tension, supporting digestion, and restoring the body's natural balance through intuitive touch.

  Massage — 1hr $95 / 90min $145
    Relaxation or therapeutic massage adapted to the guest's needs.

  Thai Massage — 1hr $125
    Traditional stretching and pressure-point bodywork performed on a mat, fully clothed.

  Crystal Balance Massage — 80min $145
    Therapeutic bodywork combined with crystal energy placement for restoring the body and subtle energy fields.

  Reflexology — 1hr $95
    Pressure-point foot therapy designed to stimulate balance, improve circulation, and activate the body's own healing response.

  Facial Massage — 1hr $95
    Gentle facial treatment using mineral-rich Mayan clay and botanical extracts to purify, hydrate, and revive skin.

  Head & Face Massage — 1hr $95
    Deeply calming combined massage of the scalp, head, and face, soothing the nervous system.

  Scalp & Foot Massage — 1hr $95
    Combined massage of scalp and feet, deeply calming and grounding.

  Prenatal Massage — 1hr $95
    Gentle massage adapted for expectant mothers to relieve tension and support wellbeing.

  Mayan Clay Treatment — $65
    Natural clay body treatment on the beach using mineral-rich Mayan clay.

  Mayan Egg Ritual — 1hr $111
    Ancient energy-clearing ceremony using eggs for intuitive reading and spiritual cleansing of the energetic body.

  Ice Bath — $45
    Cold plunge ice bath for recovery and invigoration.

  Ice Bath & Breathwork — $75
    Cold plunge ice bath combined with guided breathwork meditation session.

  Cacao & Sound Healing — $85
    Traditional heart-opening cacao ceremony with live sound healing.

  Aura Reading — $85
    Intuitive energy reading of the aura and subtle body.

  Tarot — 1hr $95
    Intuitive guidance session offering clarity, perspective, and deeper connection to inner knowing.

  Temazcal — $95
    Traditional Maya sweat lodge ceremony for purification and spiritual renewal.`;
}

// ─── Main handler ─────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST')    return jsonErr(405, 'Method Not Allowed');

  const supaKey      = process.env.SUPABASE_SERVICE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!supaKey)      return jsonErr(500, 'Server config error: missing SUPABASE_SERVICE_KEY');
  if (!anthropicKey) return jsonErr(500, 'Server config error: missing ANTHROPIC_API_KEY');

  let body;
  try { body = JSON.parse(event.body); } catch { return jsonErr(400, 'Invalid JSON'); }

  const { bookingId, messages } = body;
  if (!bookingId)                                          return jsonErr(400, 'Missing bookingId');
  if (!Array.isArray(messages) || messages.length === 0)  return jsonErr(400, 'Missing messages');

  // Verify booking exists
  const verify = await supaGet(supaKey, `bookings?id=eq.${encodeURIComponent(bookingId)}&select=id&limit=1`);
  if (!verify.ok || !(Array.isArray(verify.data) && verify.data.length > 0)) return jsonErr(404, 'Booking not found');

  const userMessage = messages[messages.length - 1]?.content ?? '';
  const msgs        = [...messages.slice(-20)];
  const actions     = [];
  let   finalText   = '';

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    let claudeRes, claudeData;
    try {
      claudeRes  = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: buildSystem(bookingId), messages: msgs, tools: TOOLS }),
      });
      claudeData = await claudeRes.json();
    } catch (e) {
      return jsonErr(502, 'Failed to reach Anthropic API: ' + e.message);
    }

    if (!claudeRes.ok) return jsonErr(502, claudeData?.error?.message ?? 'Anthropic API error');

    const stopReason = claudeData.stop_reason;
    const content    = claudeData.content ?? [];

    if (stopReason === 'end_turn') {
      finalText = content.find(c => c.type === 'text')?.text ?? '';
      break;
    }

    if (stopReason === 'tool_use') {
      msgs.push({ role: 'assistant', content });
      const toolResults = [];
      for (const block of content) {
        if (block.type !== 'tool_use') continue;
        const result = await executeTool(block.name, block.input, bookingId, supaKey);
        logAction(supaKey, bookingId, userMessage, block.name, block.input, result);
        actions.push({ tool: block.name, input: block.input, result });
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      }
      msgs.push({ role: 'user', content: toolResults });
      continue;
    }

    finalText = content.find(c => c.type === 'text')?.text ?? 'Unexpected state. Please try again.';
    break;
  }

  return ok({ response: finalText, actions });
};
