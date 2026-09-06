// Cloudbeds OAuth2 callback handler
// Redirect URI: https://amansala-staging.netlify.app/.netlify/functions/cloudbeds-setup

exports.handler = async (event) => {
  const code         = event.queryStringParameters?.code;
  const clientId     = process.env.CLOUDBEDS_CLIENT_ID     || "";
  const clientSecret = process.env.CLOUDBEDS_CLIENT_SECRET || "";

  if (!code) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html" },
      body: `<h2>Missing ?code param</h2>
             <p>This endpoint is the OAuth callback for Cloudbeds.</p>
             <p>Start the flow from Cloudbeds → API Credentials → click the refresh icon.</p>`,
    };
  }

  let tokens;
  try {
    const resp = await fetch("https://hotels.cloudbeds.com/api/v1.1/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "authorization_code",
        client_id:     clientId,
        client_secret: clientSecret,
        code,
        redirect_uri:  `https://${event.headers.host}/.netlify/functions/cloudbeds-setup`,
      }).toString(),
    });
    tokens = await resp.json();
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: `<h2>Token exchange failed</h2><pre>${e.message}</pre>`,
    };
  }

  if (!tokens.access_token) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html" },
      body: `<h2>Token exchange error</h2><pre>${JSON.stringify(tokens, null, 2)}</pre>`,
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Cloudbeds Setup — Tokens</title>
  <style>
    body { font-family: monospace; padding: 40px; background: #1a1a2e; color: #eee; }
    h2   { color: #4ade80; }
    .box { background: #16213e; border: 1px solid #0f3460; border-radius: 8px; padding: 20px; margin: 16px 0; }
    .label { color: #94a3b8; font-size: 12px; margin-bottom: 4px; }
    .val   { color: #fbbf24; font-size: 13px; word-break: break-all; }
    .note  { color: #f87171; margin-top: 24px; font-size: 14px; }
  </style>
</head>
<body>
  <h2>✅ Cloudbeds OAuth — Tokens obtenidos</h2>
  <p>Copia estos valores en Netlify → Site Configuration → Environment Variables:</p>

  <div class="box">
    <div class="label">CLOUDBEDS_API_KEY (access_token — deja vacío y usa solo REFRESH_TOKEN)</div>
    <div class="val">${tokens.access_token}</div>
  </div>

  <div class="box">
    <div class="label">CLOUDBEDS_REFRESH_TOKEN</div>
    <div class="val">${tokens.refresh_token || "(no refresh_token — revisa permisos)"}</div>
  </div>

  <div class="box">
    <div class="label">expires_in (segundos)</div>
    <div class="val">${tokens.expires_in || "N/A"}</div>
  </div>

  <div class="note">
    ⚠️ Importante: Actualiza CLOUDBEDS_REFRESH_TOKEN en Netlify con el valor de arriba.<br>
    Borra o deja vacío CLOUDBEDS_API_KEY para que el código use el refresh flow automático.<br>
    Luego haz Trigger Deploy en amansala-staging.
  </div>
</body>
</html>`,
  };
};
