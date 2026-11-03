// ===== calendar-type-colors.js — the Calendar page colors events by TYPE, not by retreat =====
// Loaded as a classic script AFTER teacher-portal.js; shares global scope.
// So maintenance can read the Calendar at a glance: every shala class one color, every tour another, the cooking class a third.
// teacher-portal.js's Calendar views (Day / Week / List) call skedTypeStyle(ev) when they draw an event; an event that is none
// of the three (ceremonies, other activities, manual and BBC events) returns null and keeps its own color. The scheduler's event
// data is NOT changed, so the Daily Briefing, teachers' schedules and every other screen keep the retreat colors they had.

const CTC_STYLES = {
  shala:   { color: '#0f766e', bg: '#ccfbf1', text: '#115e59' },   // teal   — shala classes
  tour:    { color: '#1d4ed8', bg: '#dbeafe', text: '#1e40af' },   // blue   — tours
  cooking: { color: '#c2410c', bg: '#ffedd5', text: '#9a3412' },   // orange — cooking class
};
function skedTypeKind(ev) {
  const id = String((ev && ev.id) || '');
  if (!ev || !ev.isRetreat) return null;
  const m = /_ao_(ao\d+)/.exec(id);
  if (m) {
    if (m[1] === 'ao14') return 'cooking';
    const tours = typeof TOUR_AO_IDS !== 'undefined' ? TOUR_AO_IDS : ['ao1', 'ao2', 'ao6', 'ao7'];
    return tours.includes(m[1]) || m[1] === 'ao16' ? 'tour' : null;
  }
  return 'shala';   // everything else a retreat puts on the scheduler is a class or circle in a shala
}
function skedTypeStyle(ev) { const k = skedTypeKind(ev); return k ? CTC_STYLES[k] : null; }
