'use strict';

// Visito AI "Tool" — lets Lana see what spa services can be offered/booked.
// Mirrors spa-booking.html's Step 2 service picker exactly (same active/
// duration/price filters, same category grouping) so what Lana offers a
// guest always matches what the public booking page would show.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const CAT_LABEL = { massage: 'Massage', bodywork: 'Bodywork', ceremony: 'Ceremony', class: 'Classes & Readings', fitness: 'Fitness' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonErr(405, 'Method Not Allowed');

  const expectedToken = process.env.VISITO_TOOL_SECRET;
  if (!expectedToken) return jsonErr(500, 'Server config error');
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  if (authHeader.replace(/^Bearer\s+/i, '').trim() !== expectedToken) return jsonErr(401, 'Unauthorized');

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const sessionType = (payload.arguments || {}).sessionType || null; // 'individual' | 'group' | null (both)

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_data&select=value`, { headers: hdrs });
    if (!res.ok) throw new Error('spa_data fetch failed');
    const [row] = await res.json();
    const spaData = row?.value || {};
    const services = (spaData.services || [])
      .filter(s => s.active && s.duration != null && (s.groupPricing ? true : s.price != null))
      .filter(s => !sessionType || (s.sessionType || 'individual') === sessionType)
      .map(s => ({
        serviceId: s.id,
        name: s.name,
        category: CAT_LABEL[s.category] || s.category,
        sessionType: s.sessionType || 'individual',
        durationMinutes: s.duration,
        description: s.description || null,
        genderPreferenceAvailable: !!s.genderPrefEnabled,
        ...(s.groupPricing
          ? { groupPricing: true, minGuests: s.groupPricing.minGuests || 1, minGroupForDiscount: s.groupPricing.minGroup, perPersonUSD: s.groupPricing.perPersonUSD, priceNote: `From $${spaGroupPrice(s, s.groupPricing.minGuests || 1)} USD depending on guest count — call spa_check_availability with guestCount to get an exact price.` }
          : { priceUSD: s.price }),
      }));

    if (!services.length) return ok({ success: false, message: 'No hay servicios de spa activos ahora mismo.' });
    return ok({ success: true, services });
  } catch (err) {
    console.error('[visito-spa-list-services]', err.message);
    return jsonErr(500, err.message);
  }
};

function spaGroupPrice(s, n) {
  if (!s.groupPricing || !n || n < 1) return null;
  const gp = s.groupPricing;
  if (gp.belowMin && gp.belowMin[n] != null) return gp.belowMin[n];
  if (gp.flatFee != null) return gp.flatFee + Math.max(0, n - (gp.flatFeeMax || 0)) * (gp.perPersonUSD || 0);
  if (n >= gp.minGroup) return gp.perPersonUSD * n;
  return null;
}

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonErr(code, msg) { return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: msg }) }; }
