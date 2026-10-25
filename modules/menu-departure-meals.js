// ===== menu-departure-meals.js — guests who have already left for the airport are not counted at that meal =====
// Loaded as a classic script AFTER menu.js; shares global scope. menu.js calls menuDepartureMealPax() (one guarded line, where it adds a group's meal row) and this file wraps
// menuRenderMealSection to say who was taken off. Darlene 2026-10-22: "what we need in the menu is that we have to read the transportation section. If someone is leaving on the
// departure day before the brunch is served they [should not] show up on the brunch menu." (Counting them is how it already worked, so the rule is read as "not counted".)
// Rule: on a group's DEPARTURE day, for each meal (breakfast, brunch, lunch), every guest whose Transportation row says they leave that day, with a pickup time at or before the
// time that meal is served, is taken off that row's count. Pickup time = the manual override if one was typed, otherwise the flight time minus 3 h 30 (Cancún) or 2 h 30 (Tulum),
// the same default the Transport tab shows. Guests on their own transport use the same default from their flight time. The row is hidden when nobody is left. Dinner has its own
// rule (menu-offsite-dinner.js). Guests are matched by the booking on their Transportation row; rows with no booking are not used.
let mdRows = [], mdSig = '', mdLog = {};   // mdLog: 'bookingId|date|meal' -> { group, meal, names:[...], from, to }

function mdMin(t) { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function mdFmt(m) { const h = Math.floor(m / 60) % 24; return ((h % 12) || 12) + ':' + String(m % 60).padStart(2, '0') + (h >= 12 ? ' PM' : ' AM'); }
function mdPickup(d) { // minutes since midnight, or null
  const ov = mdMin(d.departurePickupOverride); if (ov != null) return ov;
  const f = mdMin(d.departureTime); if (f == null) return null;
  return f - (d.departureAirport === 'tulum' ? 150 : 210);
}
async function mdLoad() {
  try {
    const { data, error } = await db.from('transport').select('id,booking_id,data'); if (error) throw error;
    const rows = (data || []).filter(r => r.booking_id && r.data && r.data.departureDate && r.data.departureTime);
    const sig = JSON.stringify(rows.map(r => [r.id, r.booking_id, r.data.departureDate, r.data.departureTime, r.data.departureAirport, r.data.departurePickupOverride, r.data.firstName, r.data.lastName]));
    const changed = sig !== mdSig; mdRows = rows; mdSig = sig; return changed;
  } catch (e) { console.warn('[menu departures] could not read Transportation', e); return false; }
}
function menuDepartureMealPax(bk, dateStr, meal, timeStr, px) {
  try {
    const head = Number(px) || 0, mealMin = mdMin(timeStr), day = String(dateStr).slice(0, 10);
    if (!head || mealMin == null || day !== String(bk.endDate || '').slice(0, 10) || !['lightBreakfast', 'breakfast', 'brunch', 'lunch'].includes(meal)) return px;
    const seen = new Set(), gone = [];
    mdRows.forEach(r => {
      const d = r.data; if (r.booking_id !== bk.id || d.departureDate !== day) return;
      const p = mdPickup(d); if (p == null || p > mealMin) return;
      const name = `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'a guest', key = name.toLowerCase();
      if (seen.has(key)) return; seen.add(key); gone.push(`${name} (${mdFmt(p)})`);
    });
    const key = `${bk.id}|${day}|${meal}`;
    if (!gone.length) { delete mdLog[key]; return px; }
    const left = Math.max(0, head - gone.length);
    mdLog[key] = { group: bk.leaderName || bk.retreatName || 'Group', meal, names: gone, from: head, to: left, time: mealMin };
    return String(left);
  } catch (e) { console.warn('[menu departures] could not adjust', e); return px; }
}
function mdNoteHtml(dateStr, mealKey) {
  const day = String(dateStr).slice(0, 10);
  const items = Object.entries(mdLog).filter(([k]) => { const p = k.split('|'); return p[1] === day && p[2] === mealKey; }).map(([, v]) => v);
  if (!items.length) return '';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // just the numbers on one short line (Darlene 2026-10-25: the names took too much room)
  return `<div style="margin-top:4px;font-size:10.5px;line-height:1.3;color:#1e3a8a" title="Left for the airport before this meal — not counted">🚐 ${items.map(x => `${x.names.length} left (${x.from} → ${x.to})`).join(' · ')}</div>`;
}
(function () {
  if (typeof menuRenderMealSection === 'function') {
    const orig = window.menuRenderMealSection;
    window.menuRenderMealSection = function (dateStr, mealKey) {
      const html = orig.apply(this, arguments);
      try { const note = mdNoteHtml(dateStr, mealKey); return note ? String(html).replace(/<\/div>\s*$/, note + '</div>') : html; } catch (e) { return html; }
    };
  }
  if (typeof menuPopulateFromRetreats === 'function') {
    const orig = window.menuPopulateFromRetreats;
    window.menuPopulateFromRetreats = function () { mdLog = {}; return orig.apply(this, arguments); };
  }
  // read Transportation now and every 5 minutes; when it has changed, recalculate the week
  const refresh = () => mdLoad().then(changed => { if (changed && typeof menuPopulateFromRetreats === 'function' && typeof menuCurrentMonday !== 'undefined' && menuCurrentMonday) { try { menuPopulateFromRetreats(true); } catch (e) {} } });
  try { refresh(); setInterval(refresh, 5 * 60 * 1000); } catch (e) {}
})();
