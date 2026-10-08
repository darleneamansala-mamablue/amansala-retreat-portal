'use strict';

// ===== Visito webhook: inbound "Completado" confirmation on the climas report =====
// Jorge's ask 2026-10-08: the daily climas (occupied-rooms) WhatsApp report
// (send-climas-report.js) should let maintenance/security tap a button to
// confirm the A/C task is done -- a real WhatsApp poll isn't possible (no
// such endpoint on the WhatsApp Business Platform), but a Quick Reply
// button on the template is. This webhook receives the resulting inbound
// message when someone taps it.
//
// Registered as a Visito webhook subscription (POST /m2m/v1/webhooks,
// subscriptionId 339b93f4-508f-4a15-ae49-61cbd2e88fb1, events:
// ["message.created"]) -- separate from the AI agent ("Lana")'s own
// tool-calling flow (visito-*.js functions), which only fires when the AI
// decides to call a registered tool. A raw button tap is just a normal
// inbound WhatsApp message and would otherwise just go to Lana.
//
// UNCONFIRMED pending a real event (same caveat as wetravel-webhook.js's
// isFailedPaymentEvent): the message.created payload's `data` is documented
// as only {messageId, conversationId, direction, channel, requestEventId}
// (no message text), so this re-fetches the conversation (for the sender's
// phone) and the message list (for its actual text) via separate API calls
// -- and assumes a tapped Quick Reply button arrives as a plain inbound
// text message equal to the button's label ("Completado"), the standard
// WhatsApp Business Platform behavior. Logged verbosely so this can be
// corrected once a real tap is observed.
//
// Template "amansala_climas_confirmacion" (es_MX, UTILITY, BODY + a
// QUICK_REPLY "Completado" button) submitted via Visito's API 2026-10-08,
// PENDING Meta approval as of this writing.

const crypto = require('crypto');

const VISITO_API    = 'https://platform-api.visitoai.com/m2m/v1';
const SUPABASE_URL  = 'https://vnttlpqkssihbmcynxvo.supabase.co';

function verifySignature(rawBody, sigHeader, secret) {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map(kv => {
    const i = kv.indexOf('=');
    return [kv.slice(0, i), kv.slice(i + 1)];
  }));
  const ts = parts.t, sig = parts.v1;
  if (!ts || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
  } catch {
    return false;
  }
}

async function supa(key, path, method, body) {
  const opts = {
    method: method || 'GET',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json', Accept: 'application/json',
      ...(method && method !== 'GET' ? { Prefer: 'return=representation,resolution=merge-duplicates' } : {}),
    },
  };
  if (body != null) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`Supabase ${method || 'GET'} ${path} -> ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function logClimasConfirm(supaKey, entry) {
  const rows = await supa(supaKey, 'app_store?select=value&key=eq.climasConfirmLog', 'GET');
  let log = (rows && rows[0] && rows[0].value) || [];
  if (log.some(e => e.id === entry.id)) return;
  log = [...log, entry].slice(-200);
  await supa(supaKey, 'app_store', 'POST', [{ key: 'climasConfirmLog', value: log, updated_at: new Date().toISOString() }]);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const secret = process.env.VISITO_WEBHOOK_SECRET;
  const rawBody = event.body || '';
  const sigHeader = event.headers['x-visito-signature'] || event.headers['X-Visito-Signature'];
  if (!secret || !verifySignature(rawBody, sigHeader, secret)) {
    console.warn('[visito-webhook] signature verification failed');
    return { statusCode: 401, body: 'Invalid signature' };
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }
  console.log('[visito-webhook] event:', JSON.stringify(payload).slice(0, 1000));

  if (payload.type !== 'message.created') return { statusCode: 200, body: 'ignored (not message.created)' };

  const d = payload.data || {};
  if (d.direction !== 'inbound') return { statusCode: 200, body: 'ignored (not inbound)' };

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  const m2mKey  = process.env.VISITO_M2M_KEY;
  if (!supaKey || !m2mKey) { console.error('[visito-webhook] SUPABASE_SERVICE_KEY or VISITO_M2M_KEY missing'); return { statusCode: 500 }; }

  try {
    const convRes  = await fetch(`${VISITO_API}/conversations/${encodeURIComponent(d.conversationId)}`, { headers: { Authorization: `Bearer ${m2mKey}` } });
    const convData = await convRes.json();
    const phone    = convData?.conversation?.participant?.id || '';
    const name     = convData?.conversation?.participant?.displayName || phone;

    const climasNumbers = (process.env.CLIMAS_REPORT_NUMBERS || '').split(',').map(s => s.trim().replace(/\D/g, '')).filter(Boolean);
    if (!climasNumbers.includes(phone.replace(/\D/g, ''))) {
      console.log('[visito-webhook] inbound from a non-climas number, ignoring:', phone);
      return { statusCode: 200, body: 'ignored (not a climas recipient)' };
    }

    const msgsRes  = await fetch(`${VISITO_API}/conversations/${encodeURIComponent(d.conversationId)}/messages?limit=20`, { headers: { Authorization: `Bearer ${m2mKey}` } });
    const msgsData = await msgsRes.json();
    const msg  = (msgsData.messages || []).find(m => m.messageId === d.messageId);
    const text = (msg?.text || '').trim().toLowerCase();

    if (!text.includes('completado')) {
      console.log('[visito-webhook] inbound text was not the confirmation button:', text.slice(0, 100));
      return { statusCode: 200, body: 'ignored (not a confirmation)' };
    }

    await logClimasConfirm(supaKey, {
      id:   `climas_confirm_${d.messageId}`,
      ts:   payload.occurredAt || new Date().toISOString(),
      phone, name,
    });
    console.log('[visito-webhook] logged climas confirmation from', phone);
  } catch (e) {
    console.error('[visito-webhook] error handling message.created:', e.message);
  }

  return { statusCode: 200, body: 'ok' };
};
