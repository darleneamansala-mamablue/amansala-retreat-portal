// ===== we-travel-summary.js — see how many people are We Travel (Darlene 2026-11-06) =====
// Loaded as a classic script AFTER venues.js and menu-wetravel-group.js; shares global scope.
// 1) Venues Gantt: a "We Travel" row under Amansala Programs (next to Bikini Bootcamp and Restore & Renew) that totals the We Travel guests,
//    one block per We Travel booking, labelled with its program.
// 2) Menu: the single "We Travel" row says who is Bikini Bootcamp, who is Restore & Renew and who is We Travel only, e.g. "We Travel — Bikini Bootcamp 12 · Restore & Renew 8".
// A booking counts as We Travel with the same test the menu already uses (mwtIs); its program comes from its name.
function wtsKind(b) {
  const nm = String((b.retreatName || '') + ' ' + (b.leaderName || ''));
  if (/bikini|\bbbc\b/i.test(nm)) return 'Bikini Bootcamp';
  if (/restore|renew|\brnr\b/i.test(nm)) return 'Restore & Renew';
  return 'We Travel';
}
function wtsBookings() {
  const is = typeof mwtIs === 'function' ? mwtIs : b => b && b.status !== 'cancelled' && (b.mealPlan === 'weTravel' || /we\s*travel/i.test(String(b.retreatName || '') + ' ' + String(b.leaderName || '')));
  return (AppData.bookings || []).filter(b => is(b) && b.startDate && b.endDate);
}
function wtsBreakdown(list, dateStr) {
  const out = {};
  list.forEach(b => { if (dateStr && !(b.startDate <= dateStr && dateStr <= b.endDate)) return; const k = wtsKind(b); out[k] = (out[k] || 0) + (parseInt(b.pax, 10) || 0); });
  return Object.keys(out).filter(k => out[k] > 0).map(k => k + ' ' + out[k]).join(' · ');
}
// ---- Venues Gantt row ----
function wtsAddRow() {
  const body = document.querySelector('.g-row [class~="g-lbl"]') && document.querySelector('.g-row').parentElement;
  if (!body || document.getElementById('wtsRow')) return;
  const labels = Array.from(body.querySelectorAll('.g-row > .g-lbl'));
  const rnr = labels.find(l => /Restore\s*&(amp;)?\s*Renew/i.test(l.textContent));
  if (!rnr) return;
  const rnrRow = rnr.parentElement, rnrTrack = rnrRow.querySelector('.g-track');
  const list = wtsBookings(), soy = new Date(venYear, 0, 1), eoy = new Date(venYear, 11, 31);
  const inYear = list.filter(b => pd(b.startDate) <= eoy && pd(b.endDate) >= soy);
  const row = document.createElement('div'); row.className = 'g-row'; row.id = 'wtsRow'; row.style.height = '48px';
  const lbl = document.createElement('div'); lbl.className = 'g-lbl'; lbl.style.cssText = 'width:180px;background:#fafff9;';
  const today = new Date().toISOString().slice(0, 10);
  const now = wtsBreakdown(list, today);
  lbl.innerHTML = '<span style="font-size:11.5px;font-weight:700;color:#374151">We Travel</span>' + (now ? '<span style="margin-left:auto;font-size:10px;color:#6b7280;text-align:right;line-height:1.2">in house: ' + now + '</span>' : '');
  row.appendChild(lbl);
  const track = document.createElement('div'); track.className = 'g-track'; track.style.cssText = rnrTrack ? rnrTrack.style.cssText : '';
  inYear.forEach(b => {
    const sd = pd(b.startDate), ed = pd(b.endDate);
    const cs = Math.max(sd.getTime(), soy.getTime()), ce = Math.min(ed.getTime(), eoy.getTime());
    const li = Math.floor((cs - soy.getTime()) / DAY_MS), wi = Math.floor((ce - cs) / DAY_MS);
    if (wi <= 0) return;
    const blk = document.createElement('div');
    blk.style.cssText = 'position:absolute;left:' + (li * 36 + 2) + 'px;width:' + (wi * 36 - 4) + 'px;top:4px;height:40px;background:#dbeafe;border:2px solid #3b82f6;color:#1e3a8a;border-radius:6px;display:flex;align-items:center;padding:0 8px;cursor:pointer;overflow:hidden;white-space:nowrap';
    const pax = parseInt(b.pax, 10) || 0;
    blk.innerHTML = '<span style="font-size:11.5px;font-weight:600">' + pax + ' guests</span><span style="font-size:10.5px;opacity:.75;margin-left:5px">' + wtsKind(b) + '</span>';
    blk.title = (b.retreatName || b.leaderName || 'We Travel') + ' · ' + pax + ' guests · ' + wtsKind(b);
    blk.addEventListener('click', () => { if (typeof showAvailPreview === 'function') showAvailPreview(b.id); });
    track.appendChild(blk);
  });
  row.appendChild(track);
  rnrRow.after(row);
}
if (typeof venBuild === 'function') {
  const baseBuild = venBuild;
  venBuild = function () { const r = baseBuild.apply(this, arguments); try { wtsAddRow(); } catch (e) { console.warn('We Travel row', e); } return r; };
}
// ---- Menu breakdown ----
if (typeof menuPopulateFromRetreats === 'function') {
  const basePop = menuPopulateFromRetreats;
  menuPopulateFromRetreats = function (silent) {
    const r = basePop.apply(this, arguments);
    try {
      const list = wtsBookings();
      if (typeof menuCurrentMonday !== 'undefined' && menuCurrentMonday) {
        for (let i = 0; i < 7; i++) {
          const d = new Date(menuCurrentMonday + 'T12:00:00'); d.setDate(d.getDate() + i);
          const ds = d.toISOString().split('T')[0], day = menuSchedule[ds]; if (!day) continue;
          const txt = wtsBreakdown(list, ds);
          Object.keys(day).forEach(m => { if (Array.isArray(day[m])) day[m].forEach(row => { if (row.group === 'We Travel') row.note = txt; }); });
        }
      }
      menuSaveSchedule(); menuRenderWeek();
    } catch (e) { console.warn('We Travel menu breakdown', e); }
    return r;
  };
}
// the editing grid shows the breakdown under the We Travel name too (the kitchen view and the print already show a row's note)
function wtsDecorateMenu() {
  document.querySelectorAll('input.menu-inp[onchange*="\'group\'"]').forEach(inp => {
    const m = /menuUpdateRow\('([^']+)','([^']+)',(\d+),'group'/.exec(inp.getAttribute('onchange') || '');
    if (!m || inp.value !== 'We Travel' || inp.parentElement.querySelector('.wts-note')) return;
    const row = ((menuSchedule[m[1]] || {})[m[2]] || [])[+m[3]];
    if (!row || !row.note) return;
    const s = document.createElement('div'); s.className = 'wts-note'; s.style.cssText = 'font-size:11px;font-weight:700;color:#1d4ed8;margin-top:2px;white-space:nowrap';
    s.textContent = row.note; inp.after(s);
  });
}
if (typeof menuRenderWeek === 'function') {
  const baseRender = menuRenderWeek;
  menuRenderWeek = function () { const r = baseRender.apply(this, arguments); try { wtsDecorateMenu(); } catch (e) {} return r; };
}
