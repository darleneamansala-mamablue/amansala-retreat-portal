// ===== folio-live.js — the folio open in Booking Detail refreshes itself when its charges change =====
// Loaded as a classic script AFTER booking-detail.js; shares global scope. Standalone: every 15 s, while Booking Detail is open and
// the page is visible, it compares the folio lines on screen with the database and reloads the folios when a line was added or
// removed somewhere else -- a Xetux restaurant ticket, a spa charge, another person at the front desk.
// Why (Jorge 2026-11-09): a Xetux ticket reached the folio but did not show until he closed and reopened the reservation.
// Never while someone is editing here (Edit / + Add manually / edit mode open, or typing in a field), so nothing typed is lost.
const FL_EVERY_MS = 15000;
let _flBusy = false;

function _flEditing() {
  try {
    if (typeof _bdDetailEditMode !== 'undefined' && _bdDetailEditMode) return true;
    if (Object.values(_bdAddOpen || {}).some(Boolean) || Object.values(_bdEditOpen || {}).some(Boolean)) return true;
    const a = document.activeElement, body = document.getElementById('bdBody');
    return !!(a && body && body.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  } catch (e) { return true; }
}

async function _flCheck() {
  if (_flBusy || document.hidden) return;
  const modal = document.getElementById('bookingDetailModal');
  if (!modal || !modal.classList.contains('open') || !Array.isArray(_bdFolios) || !_bdFolios.length || _flEditing()) return;
  _flBusy = true;
  try {
    const ids = _bdFolios.map(f => f.folio.id);
    const { data, error } = await db.from('folio_items').select('id,folio_id').in('folio_id', ids);
    if (error || !data) return;
    const now = data.map(i => i.id).sort().join(','), shown = _bdFolios.flatMap(f => f.items.map(i => i.id)).sort().join(',');
    // still the same reservation, still nobody editing, and something really changed
    if (now === shown || !modal.classList.contains('open') || _flEditing() || ids.join() !== _bdFolios.map(f => f.folio.id).join()) return;
    const scroller = modal.querySelector('.modal') || modal, top = scroller.scrollTop;
    await _bdLoadFolios();
    scroller.scrollTop = top;
    if (typeof showToast === 'function') showToast('Folio updated ✓');
  } catch (e) { /* never break the screen */ }
  finally { _flBusy = false; }
}

setInterval(_flCheck, FL_EVERY_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) _flCheck(); });
