// portal-gate.js — the portal program (booking-hub.html and modules/*) is only handed to a browser that signed in
// (2026-11-10: the accountant could read the whole portal's code without an account). Signing in (staff-login / portal-login)
// sets the ama_gate cookie; a teacher's link (?mode=teacher&bk=<a real booking>) gets one here. Anyone else gets the sign-in
// page (login.html) at the same address, and after signing in that address loads the portal.
// The cookie is checked with the same HMAC as netlify/functions/portal-auth-lib.js gateCookie().
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmacKey(secret) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('amansala-gate|' + secret));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function sign(body, secret) { return b64u(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body))); }
async function valid(tok, secret) {
  const [body, sig] = String(tok || '').split('.');
  if (!body || !sig) return false;
  if ((await sign(body, secret)) !== sig) return false;
  try { const c = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))); return c.exp > Date.now(); } catch (e) { return false; }
}
const cookieOf = (req, name) => { const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)')); return m ? m[1] : ''; };

export default async (request, context) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  // the public special-event inquiry form has its own page now
  if (mode === 'event') return Response.redirect(new URL('/special-event.html', url).toString(), 302);
  const secret = Netlify.env.get('SUPABASE_SERVICE_KEY');
  if (!secret) return context.next();   // not configured: as before rather than locking everyone out
  if (await valid(cookieOf(request, 'ama_gate'), secret)) return context.next();
  // a teacher's link: let it in when the booking is real, and remember it on this browser
  const bk = url.searchParams.get('bk');
  if (mode === 'teacher' && bk && /^[\w-]{3,80}$/.test(bk)) {
    try {
      const r = await fetch(`https://vnttlpqkssihbmcynxvo.supabase.co/rest/v1/bookings?id=eq.${encodeURIComponent(bk)}&select=id`, { headers: { apikey: secret, Authorization: 'Bearer ' + secret } });
      const rows = r.ok ? await r.json() : [];
      if (rows.length) {
        const body = b64u(enc.encode(JSON.stringify({ kind: 'teacher', bk, exp: Date.now() + 30 * 86400e3 })));
        const res = await context.next();
        const out = new Response(res.body, res);
        out.headers.append('Set-Cookie', `ama_gate=${body}.${await sign(body, secret)}; Path=/; Max-Age=${30 * 86400}; HttpOnly; Secure; SameSite=Lax`);
        return out;
      }
    } catch (e) { /* fall through to the sign-in page */ }
  }
  if (url.pathname.startsWith('/modules/')) return new Response('Sign in first', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const page = await fetch(new URL('/login.html', url).toString());
  return new Response(page.body, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
};

export const config = {
  path: ['/booking-hub.html', '/modules/*', '/dailyshalas', '/schedule-daily', '/dashboard', '/venues', '/pipeline', '/booking-engine', '/reservations',
    '/calendar', '/teachers', '/teacher-profiles', '/builder', '/date-finder', '/activity-log', '/items', '/menu-editor', '/contracts', '/commissions',
    '/reports', '/settings', '/bot-log', '/schedule', '/housekeeping', '/transport', '/events', '/spa-admin', '/menu', '/activity-sheet', '/bbc-schedule',
    '/confirmations', '/we-travel', '/guest-chat', '/spa-staff'],
  excludedPath: ['/modules/spa-booking-flow.js', '/modules/kitchen-week.js'],
};
