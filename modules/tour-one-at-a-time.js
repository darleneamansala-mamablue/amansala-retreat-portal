// ===== tour-one-at-a-time.js — the rules: never two tours on the same DAY, and an activity already booked/prepaid is never offered again on another day =====
// Loaded as a classic script AFTER teacher-portal.js and tour-settings.js; shares global scope. Standalone: wraps svChangeActivityDate / svChangeActivityTime / svAddActivity (the retreat's
// Activities editor) and skedTemplateForDay (the weekday auto-assign). Darlene 2026-10-24: "we have a rule where we do not offer two tours at the same time" (Melissa Masella, Beth Stuart
// and Wendy Oberg each got a Tulum Ruins AND a Mangrove at 11:45 on the same day, and Muyil Float with Gran Cenote, because Tour Settings had a second set of tours (ao16-ao20) on the same weekdays).
//  - Updated 2026-10-24 ("it should NEVER put two tours on the same day. If a person prepays for Cacao it would not offer it again on another day"): at most ONE tour per retreat per day, and an
//    activity that exists twice in the catalog (original + ao16-ao20 copy: Cacao ao4/ao19, Mayan Clay ao9/ao20, Ruins ao1/ao16, Grande Cenote ao6/ao17, Mangroves ao7/ao18) can be on a retreat only ONCE.
//  - In the editor: a change or an add that would put a second tour on the same day, or a second copy of an activity the retreat already has, is refused with a message.
//  - Weekday auto-assign: when two tours land in the same slot, only the first (lowest id, so the original tours win over the ao16+ copies) is kept.
//  - tourClashes() lists the retreats that already have two tours at once (shown in the red alert chip's list, click to open that retreat's schedule).
// A "tour" = Tulum Ruins, Muyil Float, Atik Cenote, Grande/Gran Cenote, Mangroves (by id ao1/2/3/6/7, or any add-on whose name says so). Ceremonies, Ice Bath, Cooking Class and the rest are not tours.
const TOT_IDS = ['ao1', 'ao2', 'ao3', 'ao6', 'ao7'], TOT_YES = /(ruins|cenote|mangrove|muyil|atik)/i, TOT_NO = /(ceremony|temazcal|combo|clay|sound|cacao|breath|ice)/i;
const TOT_FAMILIES = [['ao4', 'ao19'], ['ao9', 'ao20'], ['ao1', 'ao16'], ['ao6', 'ao17'], ['ao7', 'ao18']];   // the same activity under its original id and its copy
const totFamily = id => (TOT_FAMILIES.find(f => f.includes(id)) || [id]);
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
  return (bk.retreatActivities || []).find((a, i) => i !== ignoreIdx && a.date === date && totIsTour(a.aoId)) || null;   // any other tour that day
}
// The retreat already has this activity (or its copy) on some day: { entry }. Prepaid or not, it is never offered a second time.
function totRepeat(bk, aoId, ignoreIdx) {
  const fam = totFamily(aoId);
  return (bk && (bk.retreatActivities || []).find((a, i) => i !== ignoreIdx && fam.includes(a.aoId))) || null;
}
function totMessage(bk, aoId, date, other) {
  const d = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${totName(other.aoId)} is already scheduled on ${d} at ${totFmt(other.time || (typeof tourDefaultTime === 'function' ? tourDefaultTime(other.aoId) : ''))}.\n\nWe never put two tours on the same day, so ${totName(aoId)} can't go on that day. Pick another day, or remove the other tour first.`;
}
function totRepeatMessage(aoId, other) {
  const d = other.date ? new Date(other.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  return `${totName(aoId)} is already on this retreat${d ? ' on ' + d : ''}${other.prepaid ? ' (prepaid)' : ''}.\n\nWe don't offer it a second time on another day. To move it, change the day of the existing one instead.`;
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
    const rep2 = aoId && totRepeat(bk, aoId, -1);
    if (rep2) { alert(totRepeatMessage(aoId, rep2)); return; }
    const other = aoId && date && totClash(bk, aoId, date, time, -1);
    if (other) { alert(totMessage(bk, aoId, date, other)); return; }
    return o.apply(this, arguments); }; }
  if (typeof skedTemplateForDay === 'function') { const o = window.skedTemplateForDay; window.skedTemplateForDay = function (dow) {
    const list = o.apply(this, arguments), keep = [], tours = [];
    const idNum = a => parseInt(String(a.aoId).replace(/\D/g, ''), 10) || 0;
    list.slice().sort((a, b) => idNum(a) - idNum(b)).forEach(t => {
      if (!totIsTour(t.aoId)) { keep.push(t); return; }
      if (tours.length) return;   // a tour is already on this day: never two on one day (the original id wins over its copy)
      tours.push(t.aoId); keep.push(t);
    });
    return list.filter(t => keep.includes(t)); }; }
})();

// Retreats that already break a rule (upcoming only): two tours on one day, or the same activity (or its copy) on more than one day. Each item: { bk, date, a, b, kind }
function tourClashes() {
  const out = [], today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  try {
    (AppData.bookings || []).filter(b => b.status !== 'cancelled' && String(b.endDate || '') >= today).forEach(bk => {
      const acts = (bk.retreatActivities || []).filter(a => a.date && a.date >= today);
      const tours = acts.filter(a => totIsTour(a.aoId));
      for (let i = 0; i < tours.length; i++) for (let j = i + 1; j < tours.length; j++) if (tours[i].date === tours[j].date) out.push({ bk, date: tours[i].date, a: tours[i], b: tours[j], kind: 'day' });
      TOT_FAMILIES.forEach(f => { const inFam = acts.filter(a => f.includes(a.aoId)); for (let i = 1; i < inFam.length; i++) out.push({ bk, date: inFam[i].date, a: inFam[0], b: inFam[i], kind: 'repeat' }); });
    });
  } catch (e) {}
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

// Keep the rules true automatically: on team devices, remove the extra OPTIONAL lines that break them (prepaid lines are never removed). A copy of an activity the retreat already has goes
// (the prepaid one stays, else the earliest day); on a day with two tours the prepaid one stays, else the original id. Upcoming days only, never the arrival or departure day's other lines.
function totEnforce() {
  try {
    if (typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE && !localStorage.getItem('ama_admin_device') && sessionStorage.getItem('ama_admin_viewing') !== '1') return;
    const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10), idNum = id => parseInt(String(id).replace(/\D/g, ''), 10) || 0;
    let removed = 0;
    (AppData.bookings || []).filter(b => b.status !== 'cancelled' && String(b.endDate || '') >= today && (b.retreatActivities || []).length).forEach(bk => {
      let acts = bk.retreatActivities, drop = new Set();
      const better = (x, y) => (x.prepaid ? 1 : 0) - (y.prepaid ? 1 : 0) || String(y.date).localeCompare(String(x.date)) || idNum(y.aoId) - idNum(x.aoId);   // > 0: x is the one to keep
      TOT_FAMILIES.forEach(f => {
        const inFam = acts.filter(a => f.includes(a.aoId) && a.date >= today && !drop.has(a)); if (inFam.length < 2) return;
        const keep = inFam.slice().sort((x, y) => better(y, x))[0];
        inFam.forEach(a => { if (a !== keep && !a.prepaid) drop.add(a); });
      });
      const byDay = {};
      acts.filter(a => a.date >= today && totIsTour(a.aoId) && !drop.has(a)).forEach(a => { (byDay[a.date] = byDay[a.date] || []).push(a); });
      Object.values(byDay).forEach(list => { if (list.length < 2) return; const keep = list.slice().sort((x, y) => (y.prepaid ? 1 : 0) - (x.prepaid ? 1 : 0) || idNum(x.aoId) - idNum(y.aoId))[0]; list.forEach(a => { if (a !== keep && !a.prepaid) drop.add(a); }); });
      if (drop.size) { bk.retreatActivities = acts.filter(a => !drop.has(a)); bk.retreatActivitiesUpdatedAt = bk.updatedAt = new Date().toISOString(); removed += drop.size; }
    });
    if (removed) { if (typeof saveAll === 'function') saveAll(); if (typeof showToast === 'function') showToast(`Removed ${removed} extra tour/ceremony line${removed !== 1 ? 's' : ''} (never two tours a day; no repeat of a booked activity)`); }
  } catch (e) { console.warn('[tour-one-at-a-time]', e); }
}
setInterval(totEnforce, 25000); setTimeout(totEnforce, 5000);

// Why removed tours kept coming back (Darlene 2026-10-24, Melissa Masella): pressing "Confirm" on a retreat's schedule (tsAdminStatus 'confirmed', auto mode) EMPTIES its activities and rebuilds
// them from the weekly pattern, so every tour you had removed was put straight back (the log shows "Schedule confirmed" + "Activities auto-assigned" twice at 8:08 PM). Now: if the retreat
// already has activities, it asks first whether to keep them (nothing is rebuilt) or rebuild; a rebuild is cleaned up by the rules above straight away.
(function () {
  if (typeof tsAdminStatus !== 'function') return;
  const o = window.tsAdminStatus;
  window.tsAdminStatus = function (bkId, status) {
    const bk = (AppData.bookings || []).find(b => b.id === bkId);
    if (bk && status === 'confirmed' && bk.scheduleRequest && (bk.scheduleRequest.tourMode || 'auto') === 'auto' && (bk.retreatActivities || []).length) {
      const keep = confirm(`${bk.leaderName || bk.retreatName} already has ${(bk.retreatActivities || []).length} tours, ceremonies and activities set.\n\nConfirming the schedule again would REBUILD them from the weekly pattern and bring back anything you removed.\n\nOK = keep the activities exactly as they are\nCancel = rebuild them`);
      if (keep) { const prev = bk.scheduleRequest.tourMode; bk.scheduleRequest.tourMode = 'custom'; try { return o.apply(this, arguments); } finally { if (prev === undefined) delete bk.scheduleRequest.tourMode; else bk.scheduleRequest.tourMode = prev; } }
    }
    const r = o.apply(this, arguments);
    setTimeout(totEnforce, 50);
    return r;
  };
})();
