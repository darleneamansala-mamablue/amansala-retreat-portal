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
