'use strict';
// Chat assistant for the Energy vs Generator page (energy.html). The page sends the conversation plus a snapshot of the report it is
// showing (dates, generators, appliances, daily numbers). Claude answers questions about that report only. Read-only: this function
// never touches bookings or any other data, and stores nothing.
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-5-5';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (code, body) => ({ statusCode: code, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const SYSTEM = `You are the energy assistant for Amansala, a boutique wellness hotel in Tulum, Mexico. You answer questions about the "Energy vs Generator" report that the user is looking at. The report data is in the REPORT block below (JSON the page generated).

How the report works (use this to explain it):
- Rooms in use each night come from the portal's bookings (rooms held for retreats and room-only reservations). A booking counts from its first night up to the night before checkout. Held rooms count as occupied even if not every guest is named yet.
- Guest AC units run only from 9 pm to 9 am (12 hours). During the day the AC is off unless a guest pays for it (paidDaytimeAcRooms and daytimeAcHours in the report, 0 by default). Each unit draws about 1 kW when running (5 A at 220 V), and the compressor runs only part of the time (the "duty": low / likely / high). Some rooms have more than one AC unit (see acMap); rooms not listed have 1. Casa rooms count one unit per occupied bedroom plus the living room.
- Other loads (kitchen cold room, fridges, freezer, espresso machine, blenders, extractor, pool pump and lights, parking lot lights, yoga room speakers and dim lights, boutique AC, water pumps, modems, phone and laptop charging per occupied room, etc.) are in the appliance list with quantity, kW each, hours per day and duty. kWh per day = qty x kW x hours x duty%.
- Peak kW assumes every listed unit runs at the same moment, plus a safety margin for start-up surges. kVA = kW / power factor. Generator capacity in kW = kVA x power factor. The 100 kVA and 250 kVA plants can be used alone or together.
- Diesel: the generators run on diesel. Diesel liters = kWh x litersPerKwh; cost = liters x price per liter (Mexican pesos, MXN). Both numbers are editable in the report (dieselPricePerLiterMxn, dieselLitersPerKwh). Lightly loaded generators burn more diesel per kWh than these figures.
- Status: OK under 60% of capacity, Watch 60-85%, Over above 85%.

Rules:
- Answer from the REPORT numbers. Quote real figures (dates, kWh, kW, kVA, percentages). If the question needs data the report does not contain, say what is missing instead of guessing.
- These are estimates built on assumed wattages (some typed from nameplate amps, some typical values). Say so when it matters, and name which assumptions drive the answer.
- Do not invent facts about the property. Items not listed (laundry, kitchen equipment, water heaters, spa, other buildings) are not counted, so the real peak may be higher.
- You can do simple what-if arithmetic (for example "what if 10 more rooms are occupied" or "what if the AC only runs 8 hours"). Show the calculation briefly.
- Use plain language for a hotel owner, not an engineer. Short answers. Reply in the same language the user writes in (English or Spanish).
- You cannot change the page or any data. If asked to change something, tell them which field on the page to edit.`;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return reply(500, { error: 'The assistant is not configured yet (missing ANTHROPIC_API_KEY).' });

  let body;
  try { body = JSON.parse(event.body); } catch { return reply(400, { error: 'Invalid request' }); }
  const raw = Array.isArray(body.messages) ? body.messages : [];
  const msgs = raw.slice(-16)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return reply(400, { error: 'Please type a question.' });
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();

  let report = '';
  try { report = JSON.stringify(body.report || {}).slice(0, 30000); } catch { report = '{}'; }

  try {
    const r = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        output_config: { effort: 'low' },
        system: `${SYSTEM}\n\nREPORT (today is ${new Date().toISOString().slice(0, 10)}):\n${report}`,
        messages: msgs,
      }),
    });
    const j = await r.json();
    if (!r.ok) { console.error('[energy-chat] api error', r.status, JSON.stringify(j).slice(0, 300)); return reply(502, { error: 'The assistant could not answer right now. Please try again.' }); }
    if (j.stop_reason === 'refusal') return reply(200, { answer: 'I cannot help with that question. Please ask something about the energy report.' });
    const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return reply(200, { answer: text || 'I could not find an answer. Could you rephrase the question?' });
  } catch (e) {
    console.error('[energy-chat]', e.message);
    return reply(502, { error: 'Connection problem. Please try again.' });
  }
};
