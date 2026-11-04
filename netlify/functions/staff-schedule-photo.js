'use strict';

// staff-schedule-photo.js — read a weekly staff schedule from a PHOTO or screenshot (Jorge, 2026-11-04). The Staff
// Schedules page sends the picture (downscaled JPEG, base64); Claude reads the grid and returns it in the same shape the
// paste reader produces ({weekStart, rows: [{name, section, days: [7 codes]}]}). Nothing is saved here: the page shows
// the result for checking, and the person saves it as with a paste. Built on the maintenance sheet ("MANTENIMIENTO
// 15 DE NOVIEMBRE 2026": dates row, LUNES..DOMINGO, blue section bands, AM / PM / D / 10-6 / 12-8 cells) but any
// department's grid works.
const { staffAllowed, cors, reply } = require('./portal-auth-lib');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-5-5';

const PROMPT = `This is a photo or screenshot of a weekly staff schedule from a hotel (Amansala, Tulum). Read the grid exactly as written.

- weekStart: the date of the first day column (Monday) as YYYY-MM-DD, read from the dates row (dates are month/day/year, e.g. 11/2/2026 = 2026-11-02). If no dates are visible, null.
- rows: one per person, top to bottom. name = the name exactly as written. section = the band/heading the person sits under (e.g. "ENCARGADOS DE MANTENIMIENTO", "ÁREAS PÚBLICAS"), "" if none.
- days: exactly 7 cells, Monday to Sunday, copied as written: AM, PM, D, OFF, PSG, INC, PERMISO, VACACIONES, hours like 10-6 or 12-8, plus FD / RSV when written next to the hours (e.g. "9-5 FD"). An empty cell is "".
- Do not guess: a cell you cannot read is "?". Colors are only decoration; read the text.
- notes: anything unclear (a cell you could not read, a name that may be cut off), "" if nothing.`;

const SCHEMA = {
  type: 'object',
  properties: {
    weekStart: { type: ['string', 'null'] },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          section: { type: 'string' },
          days: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'section', 'days'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string' },
  },
  required: ['weekStart', 'rows', 'notes'],
  additionalProperties: false,
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid request' }); }
  const who = await staffAllowed({ headers: event.headers || {}, body: JSON.stringify({ token: b.token }) });
  if (!who) return reply(401, { error: 'Sign in again to read a photo.' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return reply(500, { error: 'Photo reading is not configured (missing ANTHROPIC_API_KEY).' });
  const mediaType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(b.mediaType) ? b.mediaType : 'image/jpeg';
  const data = String(b.image || '').replace(/^data:[^,]+,/, '');
  if (!data || data.length > 5_000_000) return reply(400, { error: 'The picture is missing or too big.' });
  try {
    const r = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: PROMPT },
        ] }],
      }),
    });
    const j = await r.json();
    if (!r.ok) { console.error('[staff-schedule-photo] api', r.status, JSON.stringify(j).slice(0, 300)); return reply(502, { error: 'Could not read the picture right now. Try again.' }); }
    if (j.stop_reason === 'refusal') return reply(200, { error: 'The picture could not be read.' });
    if (j.stop_reason === 'max_tokens') return reply(200, { error: 'The schedule is too long to read in one picture. Try half of it.' });
    const text = (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
    let out;
    try { out = JSON.parse(text); } catch (e) { return reply(502, { error: 'Could not read the picture. Try a clearer one.' }); }
    console.log('[staff-schedule-photo]', who.name, (out.rows || []).length, 'rows', JSON.stringify(j.usage || {}));
    return reply(200, out);
  } catch (e) {
    console.error('[staff-schedule-photo]', e.message);
    return reply(502, { error: 'Connection problem. Try again.' });
  }
};
