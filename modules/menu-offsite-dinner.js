// ===== menu-offsite-dinner.js — Kitchen dinner count takes out groups that are dining offsite =====
// Loaded as a classic script AFTER menu.js; shares global scope. menu.js calls menuOffsiteDinnerPax() (one guarded line, where it adds a
// group's dinner row) and this file wraps menuPopulateFromRetreats to warn about offsite nights. Real incident 2026-10-21: a group that was
// out for the offsite (Gitano) dinner was still counted in full on the menu, and the kitchen nearly made about 35 extra portions of meat.
// Rules, for a group's DINNER on a date:
//  - Gitano is a prepaid package item for the whole group (or the schedule's offsite choice is "gitano" for that night): nobody eats on
//    site, dinner count = 0.
//  - Gitano as an optional activity (not prepaid): the people who signed up are out; dinner count = headcount minus sign-ups (when the
//    sign-ups are loaded; otherwise the full count is kept and the warning says to check).
//  - The offsite night is picked but the choice is still "undecided" (Darlene 2026-10-21): treated as OUT, so the group is NOT on that night's
//    dinner list — the chefs would rather wait for a decision than cook for a group that may be at Gitano. The warning says so.
//  - Any "onsite" choice: the group dines here, counted in full.
// The group still gets its row (with 0 pax when out), so re-running the menu keeps replacing it instead of duplicating it.
let menuOffsiteLog = {};   // 'bookingId|date' -> { group, date, kind: 'out'|'partial'|'undecided'|'check', out, head }

function menuOffsiteDateFor(bk) {
  const sr = bk.scheduleRequest || {}, n = parseInt(sr.offsiteNight);
  if (!n || !bk.startDate) return null;
  return fmtISO(new Date(pd(bk.startDate).getTime() + (n - 1) * DAY_MS));
}

function menuOffsiteDinnerPax(bk, dateStr, px) {
  try {
    const head = Number(px) || 0; if (!head) return px;
    const day = String(dateStr).slice(0, 10), sr = bk.scheduleRequest || {}, offDate = menuOffsiteDateFor(bk);
    const act = (bk.retreatActivities || []).find(a => a.aoId === 'ao13' && String(a.date || '').slice(0, 10) === day);
    const group = bk.leaderName || bk.retreatName || 'Group', key = bk.id + '|' + day;
    let out = 0, kind = '';
    if ((act && act.prepaid) || (offDate === day && sr.offsiteChoice === 'gitano')) { out = head; kind = 'out'; }
    else if (act) { // optional: only the people who signed up are out
      const sups = ((typeof actSheetSignups !== 'undefined' && actSheetSignups[bk.id]) || []).filter(s => (s.activities || []).includes('ao13')).length;
      if (sups) { out = Math.min(head, sups); kind = 'partial'; } else kind = 'check';
    } else if (offDate === day && (!sr.offsiteChoice || sr.offsiteChoice === 'undecided')) { out = head; kind = 'undecided'; }
    if (kind) menuOffsiteLog[key] = { group, date: day, kind, out, head }; else delete menuOffsiteLog[key];
    return String(Math.max(0, head - out));
  } catch (e) { console.warn('[menu offsite dinner] could not adjust', e); return px; }
}

function menuOffsiteMessages() {
  const msgs = [];
  Object.values(menuOffsiteLog).sort((a, b) => a.date.localeCompare(b.date)).forEach(x => {
    const d = new Date(x.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (x.kind === 'out') msgs.push(`${x.group} is out for the offsite dinner on ${d} — dinner count set to 0 (was ${x.head}).`);
    else if (x.kind === 'partial') msgs.push(`${x.group}: ${x.out} of ${x.head} are out for the offsite dinner on ${d} — dinner count is ${x.head - x.out}.`);
    else if (x.kind === 'check') msgs.push(`${x.group} has an optional Gitano dinner on ${d} and no sign-ups are loaded — dinner still counts all ${x.head}. Check the sign-ups.`);
    else if (x.kind === 'undecided') msgs.push(`${x.group} hasn't decided its offsite dinner on ${d} — kept OFF the dinner list (${x.head} people) until it is decided. Set it to onsite to cook for them.`);
  });
  return msgs;
}

(function () {
  if (typeof menuPopulateFromRetreats !== 'function') return;
  const orig = window.menuPopulateFromRetreats, shown = new Set();
  window.menuPopulateFromRetreats = function () {
    menuOffsiteLog = {};
    const r = orig.apply(this, arguments);
    try { // say it once per message per page load, so the silent auto-refreshes don't nag
      const fresh = menuOffsiteMessages().filter(m => !shown.has(m));
      fresh.forEach(m => shown.add(m));
      if (fresh.length && typeof showToast === 'function') showToast('🍽 ' + fresh.slice(0, 3).join(' ') + (fresh.length > 3 ? ` (+${fresh.length - 3} more)` : ''));
    } catch (e) {}
    return r;
  };
})();
