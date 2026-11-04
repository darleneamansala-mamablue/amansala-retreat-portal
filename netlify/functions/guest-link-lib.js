'use strict';
// Personal guest links (Jorge 2026-11-04): Lana (Visito identify_guest) sends a guest who is chatting from the phone on
// their reservation a spa link that already knows who they are -- /spa?g=<token>. The token names the registration and
// the guest, is signed (HMAC with the Visito tool secret, server side only) and runs out the day after check-out, so a
// changed or made-up link opens the normal page.
const crypto = require('crypto');
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const secret = () => process.env.VISITO_TOOL_SECRET ? 'guest-link:' + process.env.VISITO_TOOL_SECRET : '';

function signGuestLink(regId, guestName, checkOut) {
  if (!secret() || !regId) return null;
  const exp = Date.parse(String(checkOut || '').slice(0, 10) + 'T23:59:59-05:00') + 86400000;
  const body = b64u(JSON.stringify({ r: regId, n: guestName, x: Number.isFinite(exp) ? exp : Date.now() + 7 * 86400000 }));
  return body + '.' + b64u(crypto.createHmac('sha256', secret()).update(body).digest());
}
function verifyGuestLink(tok) {
  const [body, sig] = String(tok || '').split('.');
  if (!secret() || !body || !sig) return null;
  const want = b64u(crypto.createHmac('sha256', secret()).update(body).digest());
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const c = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); return c.x > Date.now() ? c : null; } catch (e) { return null; }
}
module.exports = { signGuestLink, verifyGuestLink };
