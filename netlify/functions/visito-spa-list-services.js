'use strict';

// Visito AI "Tool" — lets Lana see what spa services can be offered/booked.
// Mirrors spa-booking.html's Step 2 service picker exactly (same active/
// duration/price filters, same category grouping) so what Lana offers a
// guest always matches what the public booking page would show.

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const CAT_LABEL = {
  massage: 'Massage', bodywork: 'Bodywork', ceremony: 'Ceremony', spirit: 'Ceremony & Ritual',
  class: 'Classes & Readings', fitness: 'Fitness', yoga: 'Yoga', pilates: 'Pilates', dance: 'Dance',
};
const CATEGORY_ALIASES = {
  massage: 'massage', masaje: 'massage', masajes: 'massage',
  bodywork: 'bodywork',
  ceremony: 'ceremony & ritual', ritual: 'ceremony & ritual', ceremonia: 'ceremony & ritual', ceremonias: 'ceremony & ritual', rituales: 'ceremony & ritual',
  class: 'classes & readings', classes: 'classes & readings', reading: 'classes & readings', clase: 'classes & readings', clases: 'classes & readings', lectura: 'classes & readings', lecturas: 'classes & readings',
  fitness: 'fitness',
  yoga: 'yoga',
  pilates: 'pilates',
  dance: 'dance', danza: 'dance', baile: 'dance',
};
const CATEGORY_SUMMARY_THRESHOLD = 8;
const CATEGORY_PAGE_SIZE = 6;

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

  const args = payload.arguments || {};
  const sessionType = args.sessionType || null; // 'individual' | 'group' | null (both)
  const categoryFilter = (args.category || '').trim().toLowerCase() || null;
  const offset = Math.max(0, parseInt(args.offset) || 0);

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_store?key=eq.spa_data&select=value`, { headers: hdrs });
    if (!res.ok) throw new Error('spa_data fetch failed');
    const [row] = await res.json();
    const spaData = row?.value || {};

    const eligible = (spaData.services || [])
      .filter(s => s.active && s.duration != null && (s.groupPricing ? true : s.price != null))
      .filter(s => !sessionType || (s.sessionType || 'individual') === sessionType)
      .map(s => ({ ...s, _label: labelFor(s.category) }));

    // Kept deliberately minimal — a first version returning every service
    // at once (24+ items) made Lana's reply generation fail right after
    // this tool "succeeded" (0 tool errors logged, but no answer ever came
    // back) — confirmed real incident 2026-09-23, and NOT fixed by shrinking
    // each item's fields, only by shrinking the number of items. So: when
    // the guest hasn't narrowed it down yet and the full list is long,
    // return category counts instead and let Lana ask which one, then call
    // this again with `category` set for a short list.
    if (!categoryFilter && eligible.length > CATEGORY_SUMMARY_THRESHOLD) {
      const byCat = {};
      eligible.forEach(s => { (byCat[s._label] = byCat[s._label] || []).push(s); });
      const categories = Object.keys(byCat).map(label => {
        const items = byCat[label];
        const prices = items.map(s => s.groupPricing ? spaGroupPrice(s, s.groupPricing.minGuests || 1) : s.price).filter(p => p != null);
        return {
          category: label,
          count: items.length,
          priceRangeUSD: prices.length ? `${Math.min(...prices)}-${Math.max(...prices)}` : null,
        };
      });
      return ok({
        success: true,
        needsCategory: true,
        totalCount: eligible.length,
        categories,
        message: `Hay ${eligible.length} servicios de spa en total. Pregúntale al huésped qué tipo busca (una de las categorías en "categories") y vuelve a llamar a esta función con ese valor en "category" para ver la lista corta con precios.`,
      });
    }

    const normFilter = categoryFilter ? (CATEGORY_ALIASES[categoryFilter] || categoryFilter) : null;
    const filtered = normFilter
      ? eligible.filter(s => s._label.toLowerCase().includes(normFilter) || (s.category || '').toLowerCase().includes(normFilter) || normFilter.includes(s._label.toLowerCase()))
      : eligible;

    if (!filtered.length) return ok({ success: false, message: 'No encontré servicios de spa activos con ese filtro. Intenta sin category o revisa el valor.' });

    // Cap how many services go back in one reply — a full category (e.g.
    // 11 massages) with real prices reproduced the same silent
    // reply-generation failure as the original 24-item dump (confirmed
    // real test 2026-09-23), even though the 6-category summary above
    // worked fine. So: page it, and let Lana ask for more only if the
    // guest wants to see beyond the first few.
    const page = filtered.slice(offset, offset + CATEGORY_PAGE_SIZE);
    if (!page.length) return ok({ success: false, message: 'Ya no hay más servicios de spa en esa categoría.' });
    const services = page.map(s => {
      const out = { serviceId: s.id, name: s.name, category: s._label, durationMinutes: s.duration };
      if (s.description) out.description = s.description;
      if (s.genderPrefEnabled) out.genderPreferenceAvailable = true;
      if (s.groupPricing) {
        out.priceUSD = spaGroupPrice(s, s.groupPricing.minGuests || 1);
        out.priceVariesByGuestCount = true;
      } else {
        out.priceUSD = s.price;
      }
      return out;
    });

    const remaining = filtered.length - (offset + page.length);
    const result = { success: true, count: services.length, services };
    if (remaining > 0) {
      result.hasMore = true;
      result.remainingCount = remaining;
      result.nextOffset = offset + page.length;
      result.message = `Mostrando ${services.length} de ${filtered.length}. Si el huésped quiere ver más opciones de esta categoría, dile que hay ${remaining} más y pregúntale si quiere verlas — si dice que sí, vuelve a llamar con offset=${offset + page.length}.`;
    }
    return ok(result);
  } catch (err) {
    console.error('[visito-spa-list-services]', err.message);
    return jsonErr(500, err.message);
  }
};

function labelFor(raw) {
  const key = (raw || '').trim().toLowerCase();
  if (CAT_LABEL[key]) return CAT_LABEL[key];
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Other';
}

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
