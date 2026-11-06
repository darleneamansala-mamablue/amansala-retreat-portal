'use strict';

// wa-utility-lib.js — WhatsApp to Jorge only through templates Meta approved as UTILITY (Jorge 2026-11-06). Meta filed the
// Ask Jorge templates as MARKETING (twice) and silently did not deliver them, while Visito still answered "accepted". So the
// template list is read from Visito once per run, and the first template in the caller's preference list that is APPROVED
// and UTILITY is used; none -> false (the caller emails instead).
const CH = () => process.env.VISITO_WA_CHANNEL_ID, KEY = () => process.env.VISITO_M2M_KEY;
const API = 'https://platform-api.visitoai.com/m2m/v1/whatsapp-templates/';
let cache = null, cachedAt = 0;

async function templates() {
  if (cache && Date.now() - cachedAt < 10 * 60e3) return cache;
  try {
    const r = await fetch(API + encodeURIComponent(CH()), { headers: { Authorization: `Bearer ${KEY()}` } });
    const d = await r.json();
    const items = Array.isArray(d) ? d : (d.data || d.templates || d.items || []);
    cache = {}; items.forEach(t => { cache[t.name] = { status: t.status, category: t.category }; }); cachedAt = Date.now();
  } catch (e) { cache = cache || {}; }
  return cache;
}

// choices: [[templateName, params], ...] in order of preference. Returns the template name used, or null.
async function sendUtility(to, choices, lang = 'es_MX', idemPrefix = 'wa') {
  if (!KEY() || !CH()) return null;
  const list = await templates();
  for (const [name, params] of choices) {
    const t = list[name];
    if (!t || t.status !== 'APPROVED' || t.category !== 'UTILITY') continue;
    try {
      const r = await fetch(API + encodeURIComponent(CH()) + '/send', {
        method: 'POST', headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json', 'Idempotency-Key': `${idemPrefix}-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
        body: JSON.stringify({ to, template: { name, language: { code: lang }, components: [{ type: 'body', parameters: params.map(x => ({ type: 'text', text: String(x).replace(/\s*\n\s*/g, ' ').slice(0, 300) })) }] } }),
      });
      const j = await r.json().catch(() => ({}));
      console.log('[wa-utility] to', to, name, r.status, j.status || '', j.replyId || '', j.error ? JSON.stringify(j.error).slice(0, 160) : '');
      if (r.ok && j.accepted !== false) return name;
    } catch (e) { console.error('[wa-utility]', name, e.message); }
  }
  return null;
}

module.exports = { sendUtility, templates };
