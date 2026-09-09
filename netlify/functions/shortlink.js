'use strict';

// Resolves a short teacher-view link (e.g. /carolefrey) to the real
// booking-hub.html?mode=teacher&bk=<id> URL and redirects there.
//
// Computed live from Supabase on every request instead of a static list, so
// a brand-new event gets a working short link immediately — nothing to
// regenerate. Slug = the leader's name, lowercased, letters/digits only.
// When two active events share a leader, month+year is appended
// (e.g. /heatherrex-feb27); if that still collides (same month), a 4-char
// id suffix is added on top — same scheme used everywhere else in the app.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZudHRscHFrc3NpaGJtY3lueHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjU1NjEsImV4cCI6MjEwMDg0MTU2MX0.ZCnXPWFLmH1ysDZJm_evEIapYhPZubzKZFLadKvqr6A';

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function slugify(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function dateSuffix(startDate) {
  if (!startDate) return '';
  const [y, m] = startDate.split('-');
  return MONTHS[parseInt(m, 10) - 1] + y.slice(2);
}
function idSuffix(id) {
  return (id || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(-4);
}

exports.handler = async (event) => {
  const fromQuery = (event.queryStringParameters && event.queryStringParameters.slug) || '';
  // event.path is /.netlify/functions/shortlink/<slug> when reached via the
  // /:slug -> /.netlify/functions/shortlink/:slug rewrite — fall back to the
  // last path segment if the query param isn't populated.
  const fromPath = (event.path || '').split('/').filter(Boolean).pop() || '';
  const raw = fromQuery || (fromPath !== 'shortlink' ? fromPath : '');
  const slug = raw.toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!slug) return { statusCode: 404, body: 'Not found' };

  let bookings;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?select=id,leader_name,retreat_name,start_date&status=neq.cancelled`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) throw new Error('Supabase lookup failed: ' + res.status);
    bookings = await res.json();
  } catch (e) {
    return { statusCode: 502, body: 'Lookup failed: ' + e.message };
  }

  // Group by base slug, then disambiguate exactly like the generator script does.
  const groups = {};
  bookings.forEach(b => {
    const base = slugify(b.leader_name || b.retreat_name || '');
    (groups[base] = groups[base] || []).push(b);
  });

  const final = {};
  Object.keys(groups).forEach(base => {
    const items = groups[base];
    if (items.length === 1) { final[base] = items[0]; return; }
    const seenHere = new Set();
    items.forEach(b => {
      let s = `${base}-${dateSuffix(b.start_date)}`;
      if (seenHere.has(s) || final[s]) s = `${s}-${idSuffix(b.id)}`;
      seenHere.add(s);
      final[s] = b;
    });
  });

  const match = final[slug];
  if (!match) return { statusCode: 404, body: 'No active event matches this link.' };

  return {
    statusCode: 302,
    headers: { Location: `/booking-hub.html?mode=teacher&bk=${encodeURIComponent(match.id)}` },
  };
};
