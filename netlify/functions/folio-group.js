// folio-group.js — the guest's whole bill for the check-out pay link (?all=1): the folio the link points to plus the same
// guest's other folios on the same room / booking request (duplicates left by the old race, WeTravel's 'Room Charges' +
// 'Extras'...). Before this, the link covered one folio only, so a guest with two could leave with the other unpaid.
// A link staff send for one specific folio (no ?all=1) keeps paying that folio alone.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';

async function folioGroup(hdrs, folio) {
  const col = folio.registration_id ? 'registration_id' : folio.booking_request_id ? 'booking_request_id' : null;
  if (!col) return [folio];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/folios?${col}=eq.${encodeURIComponent(folio[col])}&select=id,name,status,payment_token,booking_request_id,registration_id,guest_name,created_at&order=created_at.asc`, { headers: hdrs });
  const all = res.ok ? await res.json() : [];
  // Jorge 2026-11-06 (option B): the whole room, not just this guest -- two people sharing a room each have a folio, and
  // one paying only their own left the other's balance open (Kelleye & Jason Rhein, 1B). Shared beds sold to strangers are
  // separate registrations (one per bed), so they never land in the same group.
  const same = all.filter(f => f.id !== folio.id);
  return [folio, ...same];
}
async function groupItems(hdrs, folioIds) {
  if (!folioIds.length) return [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/folio_items?folio_id=in.(${folioIds.map(encodeURIComponent).join(',')})&order=created_at.asc`, { headers: hdrs });
  return res.ok ? await res.json() : null;
}
const lineTotal = i => Number(i.qty) * Number(i.unit_price) * (1 + (Number(i.tax_rate) || 0) / 100);
// Splits one card payment over the folios of the group: each folio with a balance gets a Payment row for (up to) its
// balance, oldest first; anything left over (a rounding cent, a tip added meanwhile) goes on the folio the link points to.
function allocatePayment(amount, folioIds, items, mainId) {
  const out = []; let left = +amount.toFixed(2);
  for (const id of folioIds) {
    if (left <= 0) break;
    const bal = +items.filter(i => i.folio_id === id).reduce((s, i) => s + lineTotal(i), 0).toFixed(2);
    if (bal <= 0) continue;
    const pay = +Math.min(bal, left).toFixed(2);
    out.push({ folioId: id, amount: pay }); left = +(left - pay).toFixed(2);
  }
  if (left > 0) { const m = out.find(o => o.folioId === mainId); if (m) m.amount = +(m.amount + left).toFixed(2); else out.push({ folioId: mainId, amount: left }); }
  return out;
}
module.exports = { folioGroup, groupItems, allocatePayment, lineTotal };
