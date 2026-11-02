// ===== staffing-bellboys.js — Staffing Forecast: "Arrival bell boy" and "Departure help (AM)" assign boxes (Darlene 2026-11-01) =====
// Every day with arrivals gets one Arrival bell boy box; busy days get a 2nd box and very busy days a 3rd (the Busy / Very busy numbers in the
// forecast's Rules). Departures work the same way with Departure help, which is the AM shift, using the Busy / Very busy check-out numbers.
// Choices: Teo, Seg, Roman, Noe, Chino (waiter). Box 1 is the forecast's own 'bellboy' / 'checkout' coverage (so gaps and the Dashboard still
// work); boxes 2 and 3 are saved beside it in 'staffing_coverage' as bellboy2/3 and checkout2/3.
// Hooks into staffing-forecast.js: sfBellboyNeed / sfDepartNeed (replace the single dropdown on that need) and sfBellboyRow / sfDepartRow
// (days with guests but no such need).
const SBB_PEOPLE = ['Teo', 'Seg', 'Roman', 'Noe', 'Chino'];
const SBB_LABEL = { Chino: 'Chino (waiter)' };
const SBB_KIND = {
  bellboy: { title: 'Arrival bell boy', pick: 'Bell boy', count: d => d.arrivals, busy: () => sfCfg.arrivalsBusy, very: () => sfCfg.arrivalsVeryBusy, info: d => d.arrivals + ' guest' + (d.arrivals === 1 ? '' : 's') + ' arriving', toast: ' will be the arrival bell boy.' },
  checkout: { title: 'Departure help (AM)', pick: 'Departure help', count: d => d.checkouts, busy: () => sfCfg.checkoutsBusy, very: () => sfCfg.checkoutsVeryBusy, info: d => d.checkouts + ' guest' + (d.checkouts === 1 ? '' : 's') + ' checking out', toast: ' will help with departures (AM).' },
};
function sbbKey(kind, idx) { return idx === 1 ? kind : kind + idx; }
function sbbBoxes(kind, d, gap, col) {
  const K = SBB_KIND[kind], v = K.count(d);
  let n = v >= K.very() ? 3 : v >= K.busy() ? 2 : 1;
  for (const k of [2, 3]) if (sfCovered(d.date, sbbKey(kind, k))) n = Math.max(n, k);   // never hide someone already assigned
  let h = '';
  for (let i = 1; i <= n; i++) {
    const cur = sfCovered(d.date, sbbKey(kind, i)), g = i === 1 && gap, opts = ['', ...SBB_PEOPLE, ...(cur && !SBB_PEOPLE.includes(cur) ? [cur] : [])];
    h += `<select onchange="sbbSet('${d.date}','${sbbKey(kind, i)}','${kind}',this.value)" style="padding:4px 7px;border:1.5px solid ${g ? col : '#d6cfc4'};border-radius:7px;font-size:12.5px;background:${g ? '#fef2f2' : '#fff'}" title="${K.pick} ${i}">${opts.map(o => `<option value="${sfEsc(o)}" ${o === cur ? 'selected' : ''}>${sfEsc(o ? (SBB_LABEL[o] || o) : K.pick + ' ' + i + ' — nobody yet')}</option>`).join('')}</select>`;
  }
  return h;
}
function sbbRow(kind, d, n, gap, col) {
  const K = SBB_KIND[kind];
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:3px 0"><b style="min-width:122px;color:${col}">${n && n.level === 'consider' ? '(maybe) ' : ''}${K.title}</b><span style="min-width:130px;font-size:12px;color:#6b7280">${sfEsc(n ? n.window : '')}</span>${sbbBoxes(kind, d, gap, col)}<span style="font-size:11.5px;color:#9ca3af">${sfEsc(n ? n.why : K.info(d))}</span></div>`;
}
window.sfBellboyNeed = (d, n, cov, gap, col) => sbbRow('bellboy', d, n, gap, col);
window.sfDepartNeed = (d, n, cov, gap, col) => sbbRow('checkout', d, n, gap, col);
window.sfBellboyRow = d => (!d.arrivals || d.needs.some(n => n.key === 'bellboy')) ? '' : sbbRow('bellboy', d, null, false, '#166534');
window.sfDepartRow = d => (!d.checkouts || d.needs.some(n => n.key === 'checkout')) ? '' : sbbRow('checkout', d, null, false, '#166534');
async function sbbSet(date, key, kind, name) {
  try {
    sfCov = await sfMutate(SF_COV_KEY, v => { v[date] = v[date] || {}; if (name) v[date][key] = name; else delete v[date][key]; return v; });
    showToast(name ? name + SBB_KIND[kind].toast : 'Cleared.');
  } catch (e) { showToast('Could not save. Try again.'); }
  sfRender();
}

// ----- Tour guide and Yoga rows (Darlene 2026-11-01) -----
// Shown on every day a retreat is in house. One box, with "+ another" up to 3. Saved in 'staffing_coverage' as tourguide / tourguide2/3 and yoga / yoga2/3.
SBB_KIND.tourguide = { title: 'Tour guide', pick: 'Tour guide', people: ['Fernando', 'Sergio', 'Yolanda'], toast: ' will be the tour guide.' };
SBB_KIND.yoga = { title: 'Yoga', pick: 'Yoga teacher', people: ['Yolanda', 'Darlene', 'Kun', 'Sergio', 'Kike', 'Maya'], toast: ' will teach yoga.' };
SBB_KIND.icebath = { title: 'Ice Bath', pick: 'Ice Bath', people: ['Ryan', 'Sergio', 'Fernando'], toast: ' will run the ice bath.' };
SBB_KIND.fitness = { title: 'Fitness Classes', pick: 'Fitness teacher', people: ['Ryan', 'Fernando', 'Sergio'], toast: ' will teach fitness.' };
SBB_KIND.pilates = { title: 'Pilates', pick: 'Pilates teacher', people: ['Adele', 'Sergio', 'Michelle'], toast: ' will teach pilates.' };
SBB_KIND.mayanclay = { title: 'Mayan Clay', pick: 'Mayan Clay', people: ['Yolanda', 'Darlene', 'Sergio'], toast: ' will run Mayan Clay.' };
SBB_KIND.ac = { toast: ' will be the AC specialist.' };
SBB_KIND.csr = { title: 'CSR (restaurant)', pick: 'CSR', people: ['Max', 'Michelle'], toast: ' will be the CSR.' };
const sbbShow = {};   // boxes opened with "+ another" this visit
function sbbInHouse(date) {
  return (AppData.bookings || []).some(b => b && b.status !== 'cancelled' && !(b.flags || []).includes('archived') && b.bookingType !== 'room_only' && b.startDate && b.endDate && String(b.startDate).slice(0, 10) <= date && date <= String(b.endDate).slice(0, 10));
}
window.sfCrewDay = d => sbbInHouse(d.date);
function sbbCrewRow(kind, d) {
  const K = SBB_KIND[kind], key = i => sbbKey(kind, i);
  let n = sbbShow[d.date + kind] || 1;
  for (const k of [2, 3]) if (sfCovered(d.date, key(k))) n = Math.max(n, k);
  let h = '';
  for (let i = 1; i <= n; i++) {
    const cur = sfCovered(d.date, key(i)), opts = ['', ...K.people, ...(cur && !K.people.includes(cur) ? [cur] : [])];
    h += `<select onchange="sbbSet('${d.date}','${key(i)}','${kind}',this.value)" style="padding:4px 7px;border:1.5px solid #d6cfc4;border-radius:7px;font-size:12.5px;background:#fff" title="${K.pick} ${i}">${opts.map(o => `<option value="${sfEsc(o)}" ${o === cur ? 'selected' : ''}>${sfEsc(o || K.pick + ' ' + i + ' — nobody yet')}</option>`).join('')}</select>`;
  }
  if (n < 3) h += `<button onclick="sbbShow['${d.date}${kind}']=${n + 1};sfRender()" style="padding:3px 9px;border:1.5px dashed #b9b0a3;border-radius:7px;background:#fff;font-size:12px;font-weight:600;color:#4b5563;cursor:pointer">+ another</button>`;
  const when = kind === 'csr' ? sbbCsrWhen(d) : '';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:3px 0"><b style="min-width:122px;color:#166534">${K.title}</b><span style="min-width:130px;font-size:12px;color:#6b7280">${when}</span>${h}</div>`;
}
// CSR is tied to the arrivals: on an arrival day they work 2 pm – 10 pm with the arrivals; every day after that, while the retreat is in house, they are in the
// restaurant from the time brunch starts (the earliest brunch time of the retreats already in house, from the Menu's meal times).
function sbbBrunchStart(date) {
  let best = null;
  (AppData.bookings || []).forEach(b => {
    if (!b || b.status === 'cancelled' || b.bookingType === 'room_only' || !b.startDate || !b.endDate) return;
    if (!(String(b.startDate).slice(0, 10) < date && date <= String(b.endDate).slice(0, 10))) return;
    let t = ''; try { t = typeof menuMealTime === 'function' ? menuMealTime(b, 'brunch', date) : ''; } catch (e) {}
    if (/^\d{1,2}:\d{2}/.test(t || '') && (!best || t < best)) best = t;
  });
  return best || '';
}
function sbbCsrWhen(d) {
  const t = sbbBrunchStart(d.date), parts = [];
  if (t) parts.push('restaurant from brunch, ' + sfClock(sfMin(t)));
  if (d.arrivals) parts.push('then 2 pm – 10 pm with the ' + d.arrivals + ' arrival' + (d.arrivals === 1 ? '' : 's'));
  return parts.length ? parts.join(', ').replace(/^./, c => c.toUpperCase()) : 'from brunch start, in the restaurant';
}
function sbbCsrDay(d) { return !!d.arrivals || (AppData.bookings || []).some(b => b && b.status !== 'cancelled' && b.bookingType !== 'room_only' && b.startDate && b.endDate && String(b.startDate).slice(0, 10) < d.date && d.date <= String(b.endDate).slice(0, 10)); }
// AC specialist: Ivan is always on for the arrival night (shown as chosen unless someone changes it; "nobody" is saved as '-').
function sbbAcRow(d) {
  const saved = sfCovered(d.date, 'ac'), cur = saved || 'Ivan';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:3px 0"><b style="min-width:122px;color:#166534">AC specialist</b><span style="min-width:130px;font-size:12px;color:#6b7280">arrival night</span><select onchange="sbbSet('${d.date}','ac','ac',this.value||'-')" style="padding:4px 7px;border:1.5px solid #d6cfc4;border-radius:7px;font-size:12.5px;background:#fff" title="AC specialist"><option value="Ivan" ${cur === 'Ivan' ? 'selected' : ''}>Ivan</option><option value="-" ${cur === '-' ? 'selected' : ''}>— nobody this night —</option>${cur !== 'Ivan' && cur !== '-' ? `<option value="${sfEsc(cur)}" selected>${sfEsc(cur)}</option>` : ''}</select></div>`;
}
window.sfCrewRows = d => (d.arrivals ? sbbAcRow(d) : '') + (sbbInHouse(d.date) ? (sbbCsrDay(d) ? sbbCrewRow('csr', d) : '') + sbbCrewRow('tourguide', d) + sbbCrewRow('yoga', d) + sbbCrewRow('icebath', d) + sbbCrewRow('fitness', d) + sbbCrewRow('pilates', d) + sbbCrewRow('mayanclay', d) : '');
