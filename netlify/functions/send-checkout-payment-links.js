'use strict';

// Scheduled (netlify.toml: every day 23:00 UTC = 6pm in Tulum) — the evening
// before check-out, sends every departing guest a WhatsApp thank-you with the
// link to their folio (guest-pay.html?token=…) so they can pay online, plus an
// invitation to tell us if they'd like to leave a tip for someone on staff
// (Jorge's ask 2026-09-30: all departing guests, not only ones with a balance).
//
// Sent through Visito's WhatsApp Templates API, so it goes out from the same
// WhatsApp number Lana answers on. Outside WhatsApp's 24h window only a
// Meta-approved template can be sent — the text lives in the template itself
// ({{1}} = guest first name, {{2}} = folio link), not here.
//
// Env:
//   VISITO_M2M_KEY                 visito_m2m_… with whatsapp_templates:send
//   VISITO_WA_CHANNEL_ID           Visito channel id of the WhatsApp number
//   VISITO_CHECKOUT_TEMPLATE       approved template name (e.g. checkout_payment_link)
//   VISITO_CHECKOUT_TEMPLATE_LANG  optional, default en_US
//   CHECKOUT_LINKS_ENABLED         must be "true" to actually send — anything
//                                  else is a dry run that only logs who would
//                                  get a message (safe to deploy before the
//                                  template is approved).

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const PORTAL_URL   = 'https://amansalaportal.com';
const VISITO_API   = 'https://platform-api.visitoai.com/m2m/v1';

// Hotel-local date (Tulum, UTC-5)
function localDate(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
}

// WhatsApp needs E.164. Stored phones are free-form: "+1 (630) 917-2783",
// "2506838198", "1-252-883-8501"… A bare 10-digit number is ambiguous
// (US/Canada vs Mexico); most guests are North American, so it's sent as +1 —
// store Mexican numbers with +52 to be safe. Returns null if unusable.
function toE164(raw) {
  const s = String(raw || '').replace(/[‪-‮]/g, '').trim();
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return digits.length >= 10 && digits.length <= 15 ? '+' + digits : null;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length === 12 && digits.startsWith('52')) return '+' + digits;
  if (digits.length === 13 && digits.startsWith('521')) return '+' + digits;
  return null;
}

function randomToken() {
  return Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
}

exports.handler = async () => {
  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) { console.error('[checkout-links] SUPABASE_SERVICE_KEY missing'); return { statusCode: 500 }; }
  const enabled = process.env.CHECKOUT_LINKS_ENABLED === 'true';
  const m2mKey = process.env.VISITO_M2M_KEY;
  const channelId = process.env.VISITO_WA_CHANNEL_ID;
  const templateName = process.env.VISITO_CHECKOUT_TEMPLATE;
  const templateLang = process.env.VISITO_CHECKOUT_TEMPLATE_LANG || 'en_US';
  if (enabled && (!m2mKey || !channelId || !templateName)) {
    console.error('[checkout-links] enabled but VISITO_M2M_KEY / VISITO_WA_CHANNEL_ID / VISITO_CHECKOUT_TEMPLATE missing');
    return { statusCode: 500 };
  }

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json' };
  const get = async path => {
    const r = await fetch(SUPABASE_URL + path, { headers: hdrs });
    if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };

  const checkOut = localDate(1); // guests leaving tomorrow
  console.log(`[checkout-links] ${enabled ? 'SENDING' : 'DRY RUN'} for check-out ${checkOut}`);

  // ── Who leaves tomorrow ────────────────────────────────────────────────────
  // Each recipient: { kind:'reg'|'req', anchorId, guestName, phone }
  const recipients = [];

  // Room Only (booking engine / Cloudbeds) reservations
  const reqs = await get(`/rest/v1/booking_requests?select=id,first_name,last_name,phone,status&check_out=eq.${checkOut}&status=in.(paid,in_house,confirmed)`);
  reqs.forEach(r => recipients.push({ kind: 'req', anchorId: r.id, guestName: [r.first_name, r.last_name].filter(Boolean).join(' '), phone: r.phone }));

  // Retreat registrations — a reg's own check_out, else its booking's end_date.
  // Same guards as the portal/housekeeping: skip rooms no longer in the
  // booking's blocked_rooms and guests marked cancelled.
  const bks = await get(`/rest/v1/bookings?select=id,end_date,blocked_rooms&status=neq.cancelled&start_date=lte.${checkOut}&end_date=gte.${checkOut}`);
  if (bks.length) {
    const bkById = Object.fromEntries(bks.map(b => [b.id, b]));
    const regs = await get(`/rest/v1/registrations?select=id,room,booking_id,cancelled,check_out,guests&booking_id=in.(${bks.map(b => b.id).join(',')})`);
    regs.forEach(reg => {
      const bk = bkById[reg.booking_id];
      if (reg.cancelled || (reg.check_out || bk.end_date) !== checkOut) return;
      if (bk.blocked_rooms?.length && !bk.blocked_rooms.includes(reg.room)) return;
      (reg.guests || []).filter(g => g.name && !g.cancelled).forEach(g => {
        recipients.push({ kind: 'reg', anchorId: reg.id, guestName: g.name, phone: g.phone });
      });
    });
  }

  // A re-run the same day is deduped by Visito's Idempotency-Key; within one
  // run, a couple sharing a phone on the same folio only gets one message.
  const seen = new Set();

  const results = { sent: 0, skipped: 0, failed: 0 };
  for (const rc of recipients) {
    const to = toE164(rc.phone);
    const dedupeKey = `${rc.kind}:${rc.anchorId}:${to}`;
    if (!to) { console.log(`[checkout-links] skip ${rc.guestName}: no usable phone (${rc.phone || 'none'})`); results.skipped++; continue; }
    if (seen.has(dedupeKey)) { results.skipped++; continue; }
    seen.add(dedupeKey);

    // The guest's folio link — reuse their folio (by guest name if the room
    // has several), or open one so there's always something to pay into.
    const col = rc.kind === 'reg' ? 'registration_id' : 'booking_request_id';
    const folios = await get(`/rest/v1/folios?${col}=eq.${rc.anchorId}&select=id,guest_name,payment_token,created_at&order=created_at`);
    let folio = folios.find(f => (f.guest_name || '').trim().toLowerCase() === rc.guestName.trim().toLowerCase()) || folios[0];
    if (!folio && enabled) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/folios`, {
        method: 'POST', headers: { ...hdrs, Prefer: 'return=representation' },
        body: JSON.stringify({ [col]: rc.anchorId, guest_name: rc.guestName, name: rc.guestName, payment_token: randomToken(), status: 'open' }),
      });
      if (!r.ok) { console.error(`[checkout-links] folio create failed for ${rc.guestName}: ${(await r.text()).slice(0, 200)}`); results.failed++; continue; }
      [folio] = await r.json();
    }
    const link = folio ? `${PORTAL_URL}/guest-pay.html?token=${folio.payment_token}` : `${PORTAL_URL}/guest-pay.html?token=(new folio)`;
    const firstName = rc.guestName.split(/\s+/)[0] || 'there';

    if (!enabled) { console.log(`[checkout-links] would send → ${rc.guestName} ${to} ${link}`); continue; }

    try {
      const r = await fetch(`${VISITO_API}/whatsapp-templates/${encodeURIComponent(channelId)}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${m2mKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `checkout-${checkOut}-${dedupeKey}` },
        body: JSON.stringify({
          to,
          template: {
            name: templateName,
            language: { code: templateLang },
            components: [{ type: 'body', parameters: [{ type: 'text', text: firstName }, { type: 'text', text: link }] }],
          },
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || body.accepted === false) throw new Error(`${r.status} ${JSON.stringify(body).slice(0, 200)}`);
      results.sent++;
      console.log(`[checkout-links] sent → ${rc.guestName} ${to}`);
    } catch (e) {
      results.failed++;
      console.error(`[checkout-links] send failed for ${rc.guestName} ${to}: ${e.message}`);
    }
  }

  console.log(`[checkout-links] ${recipients.length} departing guests → ${JSON.stringify(results)}`);
  return { statusCode: 200, body: JSON.stringify({ checkOut, recipients: recipients.length, ...results }) };
};
