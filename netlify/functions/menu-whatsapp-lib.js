'use strict';

// menu-whatsapp-lib.js — the groups' meals of a day by WhatsApp to the restaurant and kitchen team (Jorge 2026-11-12): for each
// meal the time, the group, how many people eat and the dishes. Template amansala_comidas_grupos (es_MX, UTILITY, 13 params).
// Groups / times / pax: app_store 'menuSchedule' (the Menu tab, filled from the retreats). Dishes: app_store 'menu_whatsapp_days',
// published by the portal (modules/menu-whatsapp.js) from the weekly menu with Darlene's edits and the week's Menu 1/2 -- that
// menu only exists in the browser. Who gets it: app_store 'menu_whatsapp_numbers' = {enabled, people:[{name, phone}]}.
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const VISITO_SEND = `https://platform-api.visitoai.com/m2m/v1/whatsapp-templates/${process.env.VISITO_WA_CHANNEL_ID || '6abd2154f6a6b5cd69232824'}/send`;
const TPL = 'amansala_comidas_grupos';
const NUMBERS_KEY = 'menu_whatsapp_numbers', DISHES_KEY = 'menu_whatsapp_days';
const DAYS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

async function loadData(key) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_store?select=key,value&key=in.(menuSchedule,${DISHES_KEY},${NUMBERS_KEY})`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error('app_store ' + r.status);
  const rows = await r.json(), st = k => ((rows.find(x => x.key === k) || {}).value);
  return { schedule: st('menuSchedule') || {}, dishes: (st(DISHES_KEY) || {}).days || {}, numbers: st(NUMBERS_KEY) || {} };
}

const clean = s => String(s || '').replace(/★/g, '').replace(/\s+/g, ' ').trim();
const fit = s => (s.length > 300 ? s.slice(0, 297) + '…' : s);
const groupName = g => (/^all groups$/i.test(String(g || '').trim()) ? 'Todos los grupos' : clean(g) || 'Grupo');

function rowsLine(rows) {
  const list = (rows || []).filter(r => r && (r.group || r.pax)).slice().sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  if (!list.length) return { text: 'Sin grupos', pax: 0, groups: [] };
  const text = list.map(r => `${r.time || '--:--'} · ${groupName(r.group)}${r.note ? ` (${clean(r.note)})` : ''} · ${parseInt(r.pax, 10) || 0} pax`).join(' / ');
  return { text, pax: list.reduce((s, r) => s + (parseInt(r.pax, 10) || 0), 0), groups: list.map(r => groupName(r.group)) };
}

function dishesLine(meal, d) {
  if (!d) return 'Platillos: ver el menú en el portal';
  if (meal === 'dinner') {
    const parts = [];
    if (d.protein) parts.push('Proteína: ' + clean(d.protein));
    if ((d.dishes || []).length) parts.push(d.dishes.map(clean).join(', '));
    if (d.dessert) parts.push('Postre: ' + clean(d.dessert));
    return parts.length ? parts.join(' · ') : 'Platillos: ver el menú en el portal';
  }
  const list = (Array.isArray(d) ? d : [d]).map(clean).filter(Boolean);
  return list.length ? 'Platillos: ' + list.join(', ') : 'Platillos: ver el menú en el portal';
}

// the 13 template parameters for one day (YYYY-MM-DD)
function buildDay(data, ds) {
  const day = data.schedule[ds] || {}, dishes = data.dishes[ds] || null;
  const dt = new Date(ds + 'T12:00:00Z');
  const head = `${DAYS[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
  const lb = rowsLine(day.lightBreakfast);
  const lbDishes = dishes && dishes.lightBreakfast ? (Array.isArray(dishes.lightBreakfast) ? dishes.lightBreakfast : [dishes.lightBreakfast]).map(s => clean(s).replace(/\s*·\s*/g, ', ')).join(', ') : '';
  const params = [head, fit(lb.text + (lb.pax && lbDishes ? ' — ' + lbDishes : ''))];
  let pax = lb.pax; const groups = new Set(lb.groups);
  for (const meal of ['breakfast', 'brunch', 'lunch', 'snack', 'dinner']) {
    const r = rowsLine(day[meal]);
    pax += r.pax; r.groups.forEach(g => groups.add(g));
    params.push(fit(r.text), fit(r.pax ? dishesLine(meal, dishes && dishes[meal]) : '⠀'));
  }
  groups.delete('Todos los grupos');
  params.push(pax ? `${pax} comidas · ${groups.size} grupo${groups.size === 1 ? '' : 's'}` : 'Sin comidas de grupos este día');
  return { ds, head, params, pax, groups: [...groups], hasDishes: !!dishes };
}

async function sendTo(phone, params, idem) {
  const r = await fetch(VISITO_SEND, { method: 'POST', headers: { Authorization: `Bearer ${process.env.VISITO_M2M_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem },
    body: JSON.stringify({ to: phone, template: { name: TPL, language: { code: 'es_MX' }, components: [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: t })) }] } }) });
  const txt = await r.text();
  return r.ok && /"accepted":true/.test(txt) ? 'sent' : 'failed ' + r.status + ' ' + txt.slice(0, 120);
}

// opts.date (default: tomorrow in Tulum), opts.dryRun (build only), opts.only (one phone, a test)
async function runMenuWhatsapp(opts = {}) {
  const data = await loadData(process.env.SUPABASE_SERVICE_KEY);
  const tulumToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
  const ds = opts.date || new Date(new Date(tulumToday + 'T12:00:00Z').getTime() + 864e5).toISOString().slice(0, 10);
  const b = buildDay(data, ds);
  if (opts.dryRun) return b;
  const cfg = data.numbers;
  if (!opts.only && cfg.enabled === false) return { ds, skipped: 'switched off' };
  const people = opts.only ? [{ name: 'test', phone: opts.only }] : (cfg.people || []).filter(p => p && String(p.phone || '').replace(/\D/g, '').length >= 10);
  // everyone at once, then whoever Visito could not queue once or twice more, same idempotency key so nobody gets it twice
  const jobs = people.map(p => ({ p, key: `comidas-${ds}-${String(p.phone).replace(/\D/g, '')}${opts.only ? '-' + Date.now() : ''}` }));
  await Promise.all(jobs.map(async j => { j.r = await sendTo(j.p.phone, b.params, j.key); }));
  for (let round = 0; round < 2 && jobs.some(j => j.r !== 'sent'); round++) {
    await new Promise(x => setTimeout(x, 4000));
    await Promise.all(jobs.filter(j => j.r !== 'sent').map(async j => { j.r = await sendTo(j.p.phone, b.params, j.key); if (j.r === 'sent') j.retried = true; }));
  }
  return { ds, pax: b.pax, groups: b.groups, hasDishes: b.hasDishes, results: jobs.map(j => ({ name: j.p.name, r: j.r + (j.retried ? ' (retry)' : '') })) };
}

module.exports = { buildDay, runMenuWhatsapp, NUMBERS_KEY, DISHES_KEY };
