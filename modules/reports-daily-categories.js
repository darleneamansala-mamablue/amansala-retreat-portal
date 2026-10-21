// ===== reports-daily-categories.js — "Sales by category" on the Daily Report =====
// Loaded as a classic script AFTER reports.js; shares global scope. Standalone: wraps _rptRenderDailyView and adds one card above
// "Payments by User"; reports.js is not edited. Uses the same rows, user filter and date range as the cards above it, so the
// total here equals Room Sales + Folio Charges exactly (credits net against their own category, tax is included like everywhere
// else in this report). Everything is by the date the charge was POSTED (Tulum day), same as the Room Sales card.
// ROOMS are different: Darlene 2026-10-21 — posting a whole stay on the day it was booked "throws off the numbers", so Rooms here is
// what the stays EARN each night: for every booking that has a guest sleeping that night, its total room revenue (the portal's own
// _calcRoomRevenue, the same figure the Financial Summary uses, so it includes packages, tax and gratuity) divided evenly across its
// nights; Room Only bookings use roomRateTotal the same way. Room charges posted on the day are NOT added again (shown as a note).
// MEAL PLAN (Darlene 2026-10-21): "should show all our yoga people that are here — our meals are about 75 usd per person per day".
// Meals are part of the retreat price (there is no separate meal charge on the folio), so for every night: retreat guests in the house
// (named, not cancelled, check-in <= night < check-out) x the meal rate = Meal Plan, and that same amount is taken OUT of Rooms for that
// booking, so the day's total is unchanged. The rate is editable on the card (default $75, saved for everyone).
// TIPS (Darlene 2026-10-21: "the tip we collect is 30 usd per person per day"): collected inside the retreat price too, so each night
// guests in the house x that booking's tip per night (the portal's getTip, normally $30) is taken out of Rooms and shown as its own
// "Tips collected" line, together with any Tip / Yoga Gratuity charges posted on folios. Tips go to staff, so they are NOT in the income total.
// ONLY CONFIRMED BOOKINGS earn Rooms: a booking still at status "requested" (a new request nobody has confirmed) is left out and listed
// in a note under the table (Darlene 2026-10-21: "these are 5 new bookings that came in").
// TAX (Darlene 2026-10-21: "separate tax"): every row shows Before tax, Tax and Amount. Folio charges are exact (each charge's own tax
// rate). Rooms and Meal Plan come from booking totals that include tax, so their tax is ESTIMATED at the booking's own room tax rate
// (getBkTaxRate) — tips are never taxed.
// TIPS are split by kind, below the total and never counted as income: yoga tip ($30/person/night, worked out from the guests in the house),
// staff gratuity already posted on folios (online bookings, yoga gratuity), restaurant / waiter tips (Tip charges that mention the
// restaurant, waiter, mesero or propina) and spa / other staff tips.
// Categories asked for by Darlene 2026-10-21: Rooms, Meal Plan, Boutique, Spa, Transport, Bar, Restaurant, Tours, Rituals.
// Folio items today only carry Room, Spa, Restaurant, Transport/Transportation, Tour, Boutique (+ Tip, Credit, Upgrade...), so
// Meal Plan, Bar and Rituals are recognised from the category OR the wording of the description; anything not recognised lands in
// "Other" with its original category names listed, so nothing is hidden and the total always ties out.
const RDC_MEAL_KEY = 'dailyReportMealRate';
let rdcMealRate = (() => { try { const v = parseFloat(localStorage.getItem('amansala_meal_rate')); return v >= 0 ? v : 75; } catch (e) { return 75; } })();
(async () => { try { const { data } = await db.from('app_store').select('value').eq('key', RDC_MEAL_KEY).maybeSingle(); const v = data && parseFloat(data.value); if (v >= 0) { rdcMealRate = v; try { localStorage.setItem('amansala_meal_rate', String(v)); } catch (e) {} } } catch (e) {} })();
async function rdcSetMealRate(v) {
  const n = parseFloat(v); if (!(n >= 0)) { showToast('Enter a number, like 75.'); return; }
  rdcMealRate = n; try { localStorage.setItem('amansala_meal_rate', String(n)); } catch (e) {}
  try { await db.from('app_store').upsert({ key: RDC_MEAL_KEY, value: n, updated_at: new Date().toISOString() }); } catch (e) { showToast('Saved on this computer only.'); }
  if (typeof _rptRenderDailyView === 'function') _rptRenderDailyView();
}
const RDC_ROWS = ['Rooms', 'Meal Plan', 'Boutique', 'Spa', 'Transport', 'Bar', 'Restaurant', 'Tours', 'Rituals'];

function rdcCategory(i) {
  const cat = String(i.category || '').toLowerCase().trim(), desc = String(i.description || '').toLowerCase();
  if (cat === 'room') return 'Rooms';
  if (cat === 'tip' || cat === 'yoga gratuity') return 'Tips';
  if (/meal ?plan|plan de comida/.test(cat) || /meal ?plan|plan de comida/.test(desc)) return 'Meal Plan';
  if (/ritual/.test(cat) || /ritual|temazcal|ceremon|cacao/.test(desc)) return 'Rituals';
  if (cat === 'bar' || /\bbar\b/.test(desc)) return 'Bar';
  if (cat === 'boutique') return 'Boutique';
  if (cat === 'spa' || cat === 'massage') return 'Spa';
  if (cat === 'transport' || cat === 'transportation') return 'Transport';
  if (cat === 'restaurant') return 'Restaurant';
  if (cat === 'tour' || cat === 'tours') return 'Tours';
  return 'Other';
}

// Nights in [from, to] (inclusive ISO dates) → [ISO date, ...]
function rdcDays(from, to) { const out = []; for (let d = pd(from); d <= pd(to) && out.length < 400; d = new Date(d.getTime() + DAY_MS)) out.push(fmtISO(d)); return out; }
function rdcRoomsEarned() {
  const days = rdcDays(_dailyFrom, _dailyTo); let rooms = 0, roomNights = 0, meals = 0, mealDays = 0, tips = 0, roomsTax = 0, mealsTax = 0; const by = {}, skipped = [];
  (AppData.bookings || []).forEach(bk => {
    if (bk.status === 'cancelled' || bk.status === 'declined' || !bk.startDate || !bk.endDate) return;
    const nights = getNights(bk); if (!nights) return;
    const inHouse = days.filter(d => d >= bk.startDate && d < bk.endDate); if (!inHouse.length) return;
    if (bk.status === 'requested' || bk.status === 'inquiry') { skipped.push(bk.leaderName || bk.retreatName || 'Booking'); return; }
    const isRoomOnly = bk.bookingType === 'room_only';
    let total = 0;
    try { total = isRoomOnly ? (bk.roomRateTotal || 0) : (typeof _calcRoomRevenue === 'function' ? _calcRoomRevenue(bk) : 0); } catch (e) { total = 0; }
    if (!total) return;
    const perNight = total / nights;
    inHouse.forEach(d => {
      let heads = 0;
      if (!isRoomOnly) (typeof getRegsForBk === 'function' ? getRegsForBk(bk.id) : []).forEach(r => {
        if (r.cancelled) return;
        const ci = r.checkIn || bk.startDate, co = r.checkOut || bk.endDate;
        if (d >= ci && d < co) heads += new Set((r.guests || []).filter(g => g.name && !g.cancelled).map(g => g.name.trim())).size;
      });
      const meal = Math.min(perNight, heads * rdcMealRate); // never take out more than the night is worth
      const tipRate = typeof getTip === 'function' ? (Number(getTip(bk)) || 0) : 30, tip = isRoomOnly ? 0 : Math.min(perNight - meal, heads * tipRate);
      const tr = (() => { try { const r = typeof getBkTaxRate === 'function' ? Number(getBkTaxRate(bk)) : 0.16; return r >= 0 && r < 1 ? r : 0; } catch (e) { return 0; } })();
      meals += meal; mealDays += heads; tips += tip; rooms += perNight - meal - tip; roomNights++;
      mealsTax += meal * tr / (1 + tr); roomsTax += (perNight - meal - tip) * tr / (1 + tr);
      if (heads) { const b = by[bk.id] = by[bk.id] || { name: bk.leaderName || bk.retreatName || 'Retreat', heads: 0, meal: 0, tip: 0, tipRate }; b.heads += heads; b.meal += meal; b.tip += tip; }
    });
  });
  const r2 = n => Math.round(n * 100) / 100;
  return { amt: r2(rooms), roomsTax: r2(roomsTax), mealsTax: r2(mealsTax), skipped: [...new Set(skipped)], nights: roomNights, meals: r2(meals), mealDays, tips: r2(tips), retreats: Object.values(by).sort((a, b) => b.heads - a.heads) };
}

// What kind of tip is this folio Tip charge?
function rdcTipKind(i) {
  const t = (String(i.category || '') + ' ' + String(i.description || '')).toLowerCase();
  if (/gratuity/.test(t)) return 'gratuity';
  if (/restaurant|waiter|mesero|propina|consumo|comida/.test(t)) return 'restaurant';
  return 'other';
}
function rdcSummary() {
  const rows = _rptDailyFolioCharges(), out = {}, tipKinds = { gratuity: { n: 0, amt: 0 }, restaurant: { n: 0, amt: 0 }, other: { n: 0, amt: 0, names: {} } };
  rows.forEach(i => {
    const k = rdcCategory(i); if (k === 'Rooms') return; // rooms come from the nights stayed, below
    const amt = Number(i.amount) || 0, pre = (Number(i.qty) || 0) * (Number(i.unit_price) || 0);
    if (k === 'Tips') { const t = tipKinds[rdcTipKind(i)]; t.n++; t.amt += amt; if (t.names) t.names[i.description || 'Tip'] = 1; return; }
    const o = out[k] = out[k] || { n: 0, amt: 0, tax: 0, names: {} };
    o.n++; o.amt += amt; o.tax += amt - pre;
    if (k === 'Other') { const nm = i.category || 'No category'; o.names[nm] = (o.names[nm] || 0) + amt; }
  });
  const re = rdcRoomsEarned(); out.Rooms = { n: re.nights, amt: re.amt, tax: re.roomsTax };
  const mp = out['Meal Plan'] = out['Meal Plan'] || { n: 0, amt: 0, tax: 0, names: {} }; mp.n += re.mealDays; mp.amt += re.meals; mp.tax += re.mealsTax;
  out._tips = { yoga: { n: re.mealDays, amt: re.tips }, ...tipKinds }; out._skipped = re.skipped;
  return out;
}

// "Retreats in the house": per retreat, how many people and the meal plan / tip maths behind the two rows above (Darlene 2026-10-21:
// "if we have 55 ppl here it would show Retreat Tip today 30 x 55 ppl"). For a range of days, people = person-days.
function rdcRetreatsHtml() {
  const re = rdcRoomsEarned(), one = _dailyFrom === _dailyTo; if (!re.retreats.length) return '';
  const unit = one ? 'ppl' : 'person-days';
  return `<div style="margin-top:14px;max-width:620px;background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
    <div style="padding:10px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;border-bottom:2px solid var(--border);background:#f8fafc">Retreats in the house</div>
    ${re.retreats.map(b => `<div style="padding:10px 14px;border-bottom:1px solid #f3f4f6"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#111827"><span>${escHtml(b.name)}</span><span>${b.heads} ${unit}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#374151;margin-top:3px"><span>Meal plan: $${rdcMealRate} × ${b.heads} ${unit}</span><b>${fmt$(b.meal)}</b></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#374151;margin-top:2px"><span>Retreat Tip${one ? ' today' : ''}: $${b.tipRate} × ${b.heads} ${unit}</span><b>${fmt$(b.tip)}</b></div></div>`).join('')}</div>`;
}

function rdcHtml() {
  const s = rdcSummary(), tips = s._tips, posted = _rptDailyFolioCharges().filter(i => rdcCategory(i) === 'Rooms').reduce((t, i) => t + (Number(i.amount) || 0), 0);
  const rowsIn = [...RDC_ROWS, ...(s.Other ? ['Other'] : [])].filter(n => s[n] || RDC_ROWS.includes(n));
  const tot = rowsIn.reduce((t, n) => ({ amt: t.amt + ((s[n] || {}).amt || 0), tax: t.tax + ((s[n] || {}).tax || 0) }), { amt: 0, tax: 0 });
  const th = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;padding:8px 14px;border-bottom:2px solid var(--border)';
  const tdn = 'padding:9px 14px;text-align:right;font-size:13px;color:#374151';
  const est = n => (n === 'Rooms' || n === 'Meal Plan') ? '≈ ' : '';
  const row = (name, o, note, key) => `<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:9px 14px;font-size:13px;font-weight:600;color:#111827">${name}${note ? `<div style="font-size:11px;font-weight:400;color:#9ca3af">${note}</div>` : ''}</td><td style="padding:9px 14px;text-align:center;font-size:12px;color:#6b7280">${o ? o.n : 0}</td><td style="${tdn}">${fmt$((o ? o.amt - (o.tax || 0) : 0))}</td><td style="${tdn}">${est(key)}${fmt$(o ? (o.tax || 0) : 0)}</td><td style="padding:9px 14px;text-align:right;font-size:14px;font-weight:700;color:${o && o.amt < 0 ? '#16a34a' : '#111827'}">${fmt$(o ? o.amt : 0)}</td></tr>`;
  const other = s.Other, otherNote = other ? Object.entries(other.names).map(([k, v]) => `${escHtml(k)} ${fmt$(v)}`).join(' · ') : '';
  const tipRow = (label, o, note) => `<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:8px 14px;font-size:12.5px;color:#374151">${label}${note ? `<div style="font-size:11px;color:#9ca3af">${note}</div>` : ''}</td><td style="padding:8px 14px;text-align:center;font-size:12px;color:#6b7280">${o.n}</td><td colspan="2"></td><td style="padding:8px 14px;text-align:right;font-size:13px;font-weight:700;color:#374151">${fmt$(o.amt)}</td></tr>`;
  const tipTotal = tips.yoga.amt + tips.gratuity.amt + tips.restaurant.amt + tips.other.amt;
  const otherTipNames = Object.keys(tips.other.names || {}).slice(0, 4).map(escHtml).join(', ');
  return `<div id="rdcCard" style="margin-bottom:24px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:8px">Income by Category — for the day</div>
    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden;max-width:820px"><table style="width:100%;border-collapse:collapse">
      <thead style="background:#f8fafc"><tr><th style="${th};text-align:left">Category</th><th style="${th};text-align:center">Charges</th><th style="${th};text-align:right">Before tax</th><th style="${th};text-align:right">Tax</th><th style="${th};text-align:right">Amount</th></tr></thead>
      <tbody>${rowsIn.map(n => row(n, s[n], n === 'Rooms' ? 'Confirmed bookings, earned by nights stayed (spread evenly per night, incl. packages), minus the meal plan and tips'
        : n === 'Meal Plan' ? `Retreat guests in the house × <input type="number" min="0" step="1" value="${rdcMealRate}" onchange="rdcSetMealRate(this.value)" style="width:56px;padding:1px 4px;border:1px solid #c8bfb5;border-radius:5px;font-size:11px"> per person per day — "Charges" is person-days`
        : n === 'Other' ? otherNote : '', n)).join('')}
        <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:800;font-size:13px">Total income for the day</td><td></td><td style="padding:10px 14px;text-align:right;font-weight:700;font-size:13px">${fmt$(tot.amt - tot.tax)}</td><td style="padding:10px 14px;text-align:right;font-weight:700;font-size:13px">${fmt$(tot.tax)}</td><td style="padding:10px 14px;text-align:right;font-weight:800;font-size:15px">${fmt$(tot.amt)}</td></tr>
        <tr><td colspan="5" style="padding:10px 14px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af">Tips collected — goes to staff, not income (${fmt$(tipTotal)})</td></tr>
        ${tipRow('Yoga tip', tips.yoga, 'Retreat guests in the house × the retreat tip per night (usually $30). "Charges" is person-days.')}
        ${tipRow('Restaurant / waiter tips', tips.restaurant, tips.restaurant.n ? '' : 'None found — no Tip charge mentions the restaurant, a waiter or propina.')}
        ${tipRow('Staff gratuity posted on folios', tips.gratuity, 'Online-booking "$30 per guest, per night" and Yoga Gratuity charges.')}
        ${tipRow('Spa &amp; other staff tips', tips.other, otherTipNames)}</tbody></table></div>
    ${rdcRetreatsHtml()}
    <div style="font-size:11.5px;color:#6b7280;margin-top:6px;max-width:820px">Tax on Rooms and Meal Plan (≈) is estimated at each booking's tax rate; tax on everything else is exact from each charge. Rooms = nights stayed in the range; room charges posted in the same range (${fmt$(posted)}, the Room Sales card) are not added again. Everything else = charged on the day.${s._skipped.length ? `<br><b>Not counted — requested, not confirmed:</b> ${s._skipped.map(escHtml).join(', ')}.` : ''}</div></div>`;
}

(function () {
  if (typeof _rptRenderDailyView !== 'function' || typeof _rptDailyFolioCharges !== 'function') return;
  const orig = window._rptRenderDailyView;
  window._rptRenderDailyView = function () {
    const r = orig.apply(this, arguments);
    try {
      const el = document.getElementById('reportsContent'); if (!el || document.getElementById('rdcCard')) return r;
      const label = [...el.querySelectorAll('div')].find(d => d.children.length === 0 && /^payments by user$/i.test(d.textContent.trim()));
      const anchor = label ? label.parentElement : (el.querySelector('div[style*="grid-template-columns:repeat(5"]') || {}).nextElementSibling;
      const holder = document.createElement('div'); holder.innerHTML = rdcHtml();
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(holder.firstElementChild, anchor);
      else (el.firstElementChild || el).appendChild(holder.firstElementChild);
    } catch (e) { console.warn('[daily categories] could not render', e); }
    return r;
  };
})();
