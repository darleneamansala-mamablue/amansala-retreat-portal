'use strict';

// Resolves a short payment link (/pay/<id>) to the real Stripe Checkout URL
// and redirects there. Stripe Checkout URLs are ~600 characters — unusable
// pasted into a WhatsApp message from Visito — so visito-create-reservation.js
// stores the real URL under a short random id here instead of handing that
// raw URL to Lana (Jorge's ask 2026-09-23).

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return { statusCode: 500, body: 'Server config error' };

  // event.path is /.netlify/functions/pay-redirect/<id> via the /pay/:id
  // rewrite in _redirects.
  const id = (event.path || '').split('/').filter(Boolean).pop() || '';
  if (!id || id === 'pay-redirect') return { statusCode: 404, body: 'Not found' };

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/payment_shortlinks?id=eq.${encodeURIComponent(id)}&select=target_url`,
      { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } }
    );
    if (!res.ok) throw new Error('lookup failed: ' + res.status);
    const [row] = await res.json();
    if (!row) return { statusCode: 404, body: 'This payment link is invalid or has expired.' };
    return { statusCode: 302, headers: { Location: row.target_url } };
  } catch (e) {
    return { statusCode: 502, body: 'Lookup failed: ' + e.message };
  }
};
