// ===== tour-one-at-a-time.js — the rule: we never offer two tours at the same time =====
// Loaded as a classic script AFTER teacher-portal.js and tour-settings.js; shares global scope. Standalone: wraps svChangeActivityDate / svChangeActivityTime / svAddActivity (the retreat's
// Activities editor) and skedTemplateForDay (the weekday auto-assign). Darlene 2026-10-24: "we have a rule where we do not offer two tours at the same time" (Melissa Masella, Beth Stuart
// and Wendy Oberg each got a Tulum Ruins AND a Mangrove at 11:45 on the same day, and Muyil Float with Gran Cenote, because Tour Settings had a second set of tours (ao16-ao20) on the same weekdays).
//  - In the editor: a change or an add that would put a tour on top of another tour (same retreat, same day, times overlapping, each tour's usual length) is refused with a message.
//  - Weekday auto-assign: when two tours land in the same slot, only the first (lowest id, so the original tours win over the ao16+ copies) is kept.
//  - tourClashes() lists the retreats that already have two tours at once (shown in the red alert chip's list, click to open that retreat's schedule).
// A "tour" = Tulum Ruins, Muyil Float, Atik Cenote, Grande/Gran Cenote, Mangroves (by id ao1/2/3/6/7, or any add-on whose name says so). Ceremonies, Ice Bath, Cooking Class and the rest are not tours.
const TOT_IDS = ['ao1', 'ao2', 'ao3', 'ao6', 'ao7'], TOT_YES = /(ruins|cenote|mangrove|muyil|atik)/i, TOT_NO = /(ceremony|temazcal|combo|clay|sound|cacao|breath|ice)/i;
const totMin = t => { if (!t || String(t).indexOf(':') < 0) return null; const [h, m] = String(t).split(':').map(Number); return isNaN(h) ? null : h * 60 + (m || 0); };
const totFmt = t => { const m = totMin(t); if (m == null) return ''; const h = Math.floor(m / 60); return ((h % 12) || 12) + ':' + String(m % 60).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM'); };
function totName(aoId) { try { return ((ADD_ONS || []).find(a => a.id === aoId) || {}).name || aoId; } catch (e) { return aoId; } }
function totIsTour(aoId) {
  if (TOT_IDS.includes(aoId)) return true;
  try { const n = totName(aoId); return n !== aoId && TOT_YES.test(n) && !TOT_NO.test(n); } catch (e) { return false; }
}
function totRange(aoId, time) {
  const s = totMin(time) != null ? totMin(time) : totMin(typeof tourDefaultTime === 'function' ? tourDefaultTime(aoId) : '11:45');
  const dur = (typeof ACTS_DUR !== 'undefined' && ACTS_DUR[aoId]) || 150;
  return s == null ? null : [s, s + dur];
}
const totOverlap = (a, b) => !!a && !!b && a[0] < b[1] && b[0] < a[1];
// The other tour on the same retreat and day that this one (aoId at date/time) would overlap, or null. ignoreIdx = the entry being edited.
function totClash(bk, aoId, date, time, ignoreIdx) {
  if (!bk || !date || !totIsTour(aoId)) return null;
  const mine = totRange(aoId, time);
  return (bk.retreatActivities || []).find((a, i) => i !== ignoreIdx && a.date === date && totIsTour(a.aoId) && totOverlap(mine, totRange(a.aoId, a.time))) || null;
}
function totMessage(bk, aoId, date, other) {
  const d = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${totName(other.aoId)} is already scheduled on ${d} at ${totFmt(other.time || (typeof tourDefaultTime === 'function' ? tourDefaultTime(other.aoId) : ''))}.\n\nWe don't offer two tours at the same time, so ${totName(aoId)} can't go on top of it. Change the day or time of one of them first.`;
}

(function () {
  const bkOf = id => (AppData.bookings || []).find(b => b.id === id);
  if (typeof svChangeActivityDate === 'function') { const o = window.svChangeActivityDate; window.svChangeActivityDate = function (bkId, idx, newDate) {
    const bk = bkOf(bkId), act = bk && (bk.retreatActivities || [])[idx], other = act && totClash(bk, act.aoId, newDate, act.time, idx);
    if (other) { alert(totMessage(bk, act.aoId, newDate, other)); if (typeof svRefreshActivityView === 'function') svRefreshActivityView(bkId); return; }
    return o.apply(this, arguments); }; }
  if (typeof svChangeActivityTime === 'function') { const o = window.svChangeActivityTime; window.svChangeActivityTime = function (bkId, idx, newTime) {
    const bk = bkOf(bkId), act = bk && (bk.retreatActivities || [])[idx], other = act && totClash(bk, act.aoId, act.date, newTime, idx);
    if (other) { alert(totMessage(bk, act.aoId, act.date, other)); if (typeof svRefreshActivityView === 'function') svRefreshActivityView(bkId); return; }
    return o.apply(this, arguments); }; }
  if (typeof svAddActivity === 'function') { const o = window.svAddActivity; window.svAddActivity = function (bkId) {
    const bk = bkOf(bkId), aoId = document.getElementById('svAddAoId')?.value, date = document.getElementById('svAddAoDate')?.value, time = document.getElementById('svAddAoTime')?.value || '';
    const other = aoId && date && totClash(bk, aoId, date, time, -1);
    if (other) { alert(totMessage(bk, aoId, date, other)); return; }
    return o.apply(this, arguments); }; }
  if (typeof skedTemplateForDay === 'function') { const o = window.skedTemplateForDay; window.skedTemplateForDay = function (dow) {
    const list = o.apply(this, arguments), keep = [], tours = [];
    const idNum = a => parseInt(String(a.aoId).replace(/\D/g, ''), 10) || 0;
    list.slice().sort((a, b) => idNum(a) - idNum(b)).forEach(t => {
      if (!totIsTour(t.aoId)) { keep.push(t); return; }
      const r = totRange(t.aoId, t.time);
      if (tours.some(x => totOverlap(x, r))) return;   // a tour is already in that slot: skip the copy
      tours.push(r); keep.push(t);
    });
    return list.filter(t => keep.includes(t)); }; }
})();

// Retreats that already have two tours at once (upcoming only)
function tourClashes() {
  const out = [], today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  try {
    (AppData.bookings || []).filter(b => b.status !== 'cancelled' && String(b.endDate || '') >= today).forEach(bk => {
      const tours = (bk.retreatActivities || []).filter(a => a.date && a.date >= today && totIsTour(a.aoId));
      for (let i = 0; i < tours.length; i++) for (let j = i + 1; j < tours.length; j++) {
        const a = tours[i], b = tours[j];
        if (a.date === b.date && totOverlap(totRange(a.aoId, a.time), totRange(b.aoId, b.time))) out.push({ bk, date: a.date, a, b });
      }
    });
  } catch (e) {}
  return out.sort((x, y) => x.date.localeCompare(y.date));
}
