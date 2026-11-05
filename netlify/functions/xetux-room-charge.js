'use strict';

// xetux-room-charge.js — Xetux POS (restaurant / bar) posts a "room charge" straight onto the guest's folio (Jorge
// 2026-11-05, for Benix / Xetux). Until now the front desk typed each ticket in by hand ("consumo rest folio 174407",
// category Restaurant, +13% tax). Same fixed token as xetux-reservation-lookup.js (Authorization: Bearer XETUX_API_TOKEN).
//
// POST {action:'charge', folio, reservationID, ticketId, items?, subtotal, tip?, taxRate?, outlet?, waiter?}
//   Amounts in USD. subtotal = the ticket BEFORE tax; the folio adds taxRate (default 13 %, as the front desk does).
//   tip = its own line (no tax). ticketId makes it safe to retry: the same ticket is never posted twice.
// POST {action:'void', ticketId, reason?}
//   Takes a posted ticket back off the folio (a negative line of the same amount, so the folio keeps the history).
// Always HTTP 200 with success true/false (same convention as the lookup), except 401 for a wrong token.
const { findInHouse } = require('./xetux-reservation-lookup');

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const H = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const round2 = n => Math.round(Number(n) * 100) / 100;
const tag = id => `(Xetux #${id})`;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { success: false, error: 'METHOD_NOT_ALLOWED' });
  const expected = process.env.XETUX_API_TOKEN, key = process.env.SUPABASE_SERVICE_KEY;
  if (!expected || !key) return reply(500, { success: false, error: 'SERVER_CONFIG' });
  const auth = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth || auth !== expected) return reply(401, { success: false, error: 'UNAUTHORIZED' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(200, { success: false, error: 'INVALID_JSON' }); }
  const ticketId = String(b.ticketId || '').trim().slice(0, 60);
  if (!ticketId) return reply(200, { success: false, error: 'TICKET_ID_REQUIRED', message: 'ticketId is required' });
  const get = async p => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H(key) }); return r.ok ? r.json() : []; };
  const existing = await get(`folio_items?select=id,folio_id,description,qty,unit_price,tax_rate,category&description=ilike.*${encodeURIComponent(tag(ticketId))}*`);
  const posted = existing.filter(i => !/^VOID/.test(i.description));
  const voided = existing.some(i => /^VOID/.test(i.description));
  try {
    if ((b.action || 'charge') === 'void') {
      if (!posted.length) return reply(200, { success: false, error: 'TICKET_NOT_FOUND', message: `Ticket ${ticketId} was never posted` });
      if (voided) return reply(200, { success: true, alreadyVoided: true, ticketId });
      const reason = String(b.reason || '').trim().slice(0, 120);
      const lines = posted.map(i => ({ folio_id: i.folio_id, description: `VOID ${i.description}${reason ? ' · ' + reason : ''}`, qty: 1, unit_price: -round2(Number(i.qty) * Number(i.unit_price)), tax_rate: Number(i.tax_rate) || 0, category: i.category, staff_name: 'Xetux' }));
      const r = await fetch(`${SUPABASE_URL}/rest/v1/folio_items`, { method: 'POST', headers: { ...H(key), Prefer: 'return=minimal' }, body: JSON.stringify(lines) });
      if (!r.ok) return reply(200, { success: false, error: 'SAVE_FAILED', message: (await r.text()).slice(0, 200) });
      return reply(200, { success: true, voided: true, ticketId, folio: posted[0].folio_id, balance: await balanceOf(get, posted[0].folio_id) });
    }

    // charge
    if (posted.length) return reply(200, { success: true, alreadyPosted: true, ticketId, folio: posted[0].folio_id, balance: await balanceOf(get, posted[0].folio_id) });
    const subtotal = round2(b.subtotal), tip = round2(b.tip || 0);
    const taxRate = b.taxRate == null || b.taxRate === '' ? 13 : Number(b.taxRate);
    if (!(subtotal > 0) || subtotal > 20000) return reply(200, { success: false, error: 'INVALID_AMOUNT', message: 'subtotal must be a positive USD amount' });
    if (!(tip >= 0) || !(taxRate >= 0 && taxRate <= 30)) return reply(200, { success: false, error: 'INVALID_AMOUNT', message: 'tip / taxRate out of range' });
    const folioId = String(b.folio || '').trim(), resId = String(b.reservationID || '').trim();
    if (!folioId || !resId) return reply(200, { success: false, error: 'FOLIO_REQUIRED', message: 'folio and reservationID from the lookup are required' });
    // the guest must still be in the hotel, and the folio must be theirs and open
    const stays = await findInHouse(key, { reservationID: resId });
    const stay = stays.find(s => s.folio === folioId) || null;
    const [folio] = await get(`folios?select=id,status,registration_id,booking_request_id&id=eq.${encodeURIComponent(folioId)}`);
    const sameRes = folio && (String(folio.registration_id || '') === resId || String(folio.booking_request_id || '') === resId);
    if (!stays.length) return reply(200, { success: false, error: 'NO_ACTIVE_RESERVATION', message: 'The guest is not in the hotel (checked out or not staying today)' });
    if (!folio || !sameRes) return reply(200, { success: false, error: 'FOLIO_NOT_FOUND', message: 'That folio does not belong to this reservation — look the guest up again' });
    if (folio.status !== 'open') return reply(200, { success: false, error: 'FOLIO_CLOSED', message: 'The guest folio is closed — ask the front desk' });
    const outlet = String(b.outlet || 'Restaurant').trim().slice(0, 40), waiter = String(b.waiter || '').trim().slice(0, 40);
    const itemsText = Array.isArray(b.items) ? b.items.slice(0, 30).map(i => `${Number(i.quantity) || 1}× ${String(i.description || '').slice(0, 40)}`).join(', ') : '';
    const desc = `${outlet} ${tag(ticketId)}${waiter ? ' · ' + waiter : ''}${itemsText ? ' · ' + itemsText : ''}`.slice(0, 480);
    const day = new Date().toISOString();
    const lines = [{ folio_id: folioId, description: desc, qty: 1, unit_price: subtotal, tax_rate: taxRate, category: 'Restaurant', staff_name: 'Xetux', created_at: day }];
    if (tip > 0) lines.push({ folio_id: folioId, description: `Tip ${outlet} ${tag(ticketId)}${waiter ? ' · ' + waiter : ''}`, qty: 1, unit_price: tip, tax_rate: 0, category: 'Tip', staff_name: 'Xetux', created_at: day });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/folio_items`, { method: 'POST', headers: { ...H(key), Prefer: 'return=representation' }, body: JSON.stringify(lines) });
    if (!r.ok) return reply(200, { success: false, error: 'SAVE_FAILED', message: (await r.text()).slice(0, 200) });
    const saved = await r.json();
    return reply(200, {
      success: true, ticketId, folio: folioId, reservationID: resId, guestName: stay ? stay.guestName : null, roomNumber: stay ? stay.roomNumber : null,
      charged: round2(subtotal * (1 + taxRate / 100) + tip), chargeIds: saved.map(x => x.id), balance: await balanceOf(get, folioId),
    });
  } catch (e) {
    console.error('[xetux-room-charge]', e);
    return reply(200, { success: false, error: 'SERVER_ERROR', message: 'Please try again' });
  }
};

async function balanceOf(get, folioId) {
  const items = await get(`folio_items?select=qty,unit_price,tax_rate&folio_id=eq.${encodeURIComponent(folioId)}`);
  return round2(items.reduce((s, i) => s + Number(i.qty) * Number(i.unit_price) * (1 + (Number(i.tax_rate) || 0) / 100), 0));
}
function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }; }
function reply(code, body) { return { statusCode: code, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
