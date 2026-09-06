'use strict';

// OAuth2 callback for Lightspeed L Series
// Lightspeed redirects here after user authorizes:
//   /.netlify/functions/lightspeed-oauth-callback?code=XXX
//
// TODO when credentials arrive — set these env vars in Netlify:
//   LIGHTSPEED_CLIENT_ID
//   LIGHTSPEED_CLIENT_SECRET
//   LIGHTSPEED_TOKEN_URL      (e.g. https://cloud.lightspeedapp.com/oauth/access_token)
//   LIGHTSPEED_REDIRECT_URI   (this function's URL on staging/prod)

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

async function supaFetch(key, path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      ...(method !== 'GET' ? { 'Prefer': 'return=representation' } : {}),
    },
  };
  if (body != null) opts.body = JSON.stringify(body);
  const res  = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

exports.handler = async (event) => {
  const code  = event.queryStringParameters?.code;
  const error = event.queryStringParameters?.error;

  if (error) {
    console.error('[lightspeed-oauth] denied:', error);
    return { statusCode: 302, headers: { Location: '/?lightspeed=denied' } };
  }
  if (!code) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing code' }) };
  }

  const supaKey      = process.env.SUPABASE_SERVICE_KEY;
  const clientId     = process.env.LIGHTSPEED_CLIENT_ID;
  const clientSecret = process.env.LIGHTSPEED_CLIENT_SECRET;
  const tokenUrl     = process.env.LIGHTSPEED_TOKEN_URL;
  const redirectUri  = process.env.LIGHTSPEED_REDIRECT_URI;

  if (!supaKey)      return { statusCode: 500, body: 'Missing SUPABASE_SERVICE_KEY' };
  if (!clientId || !clientSecret || !tokenUrl) {
    return { statusCode: 500, body: 'Missing Lightspeed env vars — set LIGHTSPEED_CLIENT_ID, LIGHTSPEED_CLIENT_SECRET, LIGHTSPEED_TOKEN_URL' };
  }

  // Exchange code for access + refresh tokens
  const tokenRes = await fetch(tokenUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     clientId,
      client_secret: clientSecret,
      code,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    }),
  });

  let tokenData;
  try { tokenData = await tokenRes.json(); } catch { tokenData = {}; }

  if (!tokenRes.ok || !tokenData.access_token) {
    console.error('[lightspeed-oauth] token exchange failed:', tokenData);
    return { statusCode: 500, body: JSON.stringify({ error: 'Token exchange failed', detail: tokenData }) };
  }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  const tokenRow = {
    access_token:  tokenData.access_token,
    refresh_token: tokenData.refresh_token ?? null,
    expires_at:    expiresAt,
    // Lightspeed may return account/location info — adjust field names to match actual response
    account_id:    tokenData.account_id ?? tokenData.accountID ?? null,
    location_id:   tokenData.location_id ?? tokenData.locationID ?? null,
    updated_at:    new Date().toISOString(),
  };

  // Upsert — one row only, always overwrite
  const existing = await supaFetch(supaKey, 'lightspeed_tokens?select=id&limit=1');
  if (existing.ok && Array.isArray(existing.data) && existing.data.length) {
    await supaFetch(supaKey, `lightspeed_tokens?id=eq.${existing.data[0].id}`, 'PATCH', tokenRow);
  } else {
    await supaFetch(supaKey, 'lightspeed_tokens', 'POST', tokenRow);
  }

  console.log('[lightspeed-oauth] connected, account:', tokenRow.account_id);
  return { statusCode: 302, headers: { Location: '/?lightspeed=connected' } };
};
