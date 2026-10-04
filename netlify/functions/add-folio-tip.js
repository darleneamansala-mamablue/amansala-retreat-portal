'use strict';

// Lets a guest add a tip to their own folio from guest-pay.html before paying
// (Jorge's ask 2026-10-04: an "Add Tip" button on the payment link, amount +
// description, repeatable, no tax). Inserted with category 'Tip Tarjeta' --
// the same category booking-detail.js already uses for card-paid tips, since
// this always goes out through Stripe -- so it shows on the folio and in the
// admin folio editor like any other charge, no new reporting wiring needed.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { token, description } = body;
  const amount = Number(body.amount);
  if (!token) return jsonErr(400, 'Missing token');
  if (!Number.isFinite(amount) || amount <= 0) return jsonErr(400, 'Invalid tip amount');
  if (amount > 5000) return jsonErr(400, 'Amount too large');

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json' };

  const folioRes = await fetch(
    `${SUPABASE_URL}/rest/v1/folios?payment_token=eq.${encodeURIComponent(token)}&select=id&limit=1`,
    { headers: hdrs }
  );
  if (!folioRes.ok) return jsonErr(500, 'Could not fetch folio');
  const folioArr = await folioRes.json();
  if (!folioArr.length) return jsonErr(404, 'Folio not found');
  const folioId = folioArr[0].id;

  const desc = String(description || '').trim().slice(0, 200);
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/folio_items`, {
    method: 'POST',
    headers: { ...hdrs, Prefer: 'return=representation' },
    body: JSON.stringify({
      folio_id: folioId,
      description: desc ? `Tip — ${desc}` : 'Tip',
      qty: 1,
      unit_price: +amount.toFixed(2),
      tax_rate: 0,
      category: 'Tip Tarjeta',
    }),
  });
  if (!insertRes.ok) {
    const errBody = await insertRes.text();
    return jsonErr(500, 'Could not add tip: ' + errBody.slice(0, 300));
  }

  // Return the full updated item list + total so guest-pay.html can re-render
  // without a second round trip.
  const itemsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/folio_items?folio_id=eq.${encodeURIComponent(folioId)}&order=created_at.asc`,
    { headers: hdrs }
  );
  const items = itemsRes.ok ? await itemsRes.json() : [];
  const total = items.reduce((sum, i) => sum + Number(i.qty) * Number(i.unit_price) * (1 + (Number(i.tax_rate) || 0) / 100), 0);

  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, items, total }),
  };
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
function jsonErr(code, msg) {
  return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}
