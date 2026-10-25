// ===== room-move-sync.js — move a guest who is already checked in: their room updates on the arrival logs and the check-in stays =====
// Loaded as a classic script AFTER teacher-portal.js, venues.js, reservations.js, transport.js and checkin-by.js; shares global scope. Standalone: wraps regMoveGuest, regSplitGuestToRoom and
// rcMoveRoom (nothing in them is edited). What it fixes (Darlene 2026-10-24: "if someone is checked in can we move them and their room will update on the arrival log"):
//  1. After a move, the Transport log (its Room column is built from the registrations only when it loads) and the Reservations lists are refreshed, so the new room shows straight away.
//  2. Moving ONE guest out of a shared room starts a new registration for the destination room, and that new registration did not inherit the check-in, so the guest read as
//     NOT checked in after the move. The check-in (checkedInAt, and the "who checked in" record from checkin-by.js) now follows the guest to the destination registration.
// A whole-room move already kept the check-in (the same registration just gets a new room); it only needed the refresh.
function rmsRefresh() {
  try { if (typeof _resRender === 'function') _resRender(); } catch (e) {}
  try { if (typeof tr2LoadData === 'function' && document.getElementById('tr2-body')) tr2LoadData(); } catch (e) {}
}
function rmsSettle() { setTimeout(rmsRefresh, 150); setTimeout(rmsRefresh, 1200); }

(function () {
  if (typeof regMoveGuest === 'function') {
    const o = window.regMoveGuest;
    window.regMoveGuest = function () { const r = o.apply(this, arguments); rmsSettle(); return r; };
  }
  if (typeof regSplitGuestToRoom === 'function') {
    const o = window.regSplitGuestToRoom;
    window.regSplitGuestToRoom = function (reg, guestIdx, targetRoom, targetRtId) {
      const inAt = reg && reg.checkedInAt, srcId = reg && reg.id, bkId = reg && reg.bookingId, before = (AppData.regs || []).length;
      const r = o.apply(this, arguments);
      try {
        if (inAt) {
          const target = typeof resolvePhysicalRoomForGuest === 'function' ? resolvePhysicalRoomForGuest(bkId, targetRoom, targetRtId) : targetRoom;
          const dest = typeof getRegForRoom === 'function' ? getRegForRoom(bkId, target) : null;
          if (dest && dest.id !== srcId && !dest.checkedInAt) {
            dest.checkedInAt = inAt; dest.updatedAt = new Date().toISOString();
            if (typeof ciLog !== 'undefined' && ciLog[srcId] && typeof ciRecord === 'function') { const e = ciLog[srcId]; ciRecord(dest.id, true, inAt, { upgrade: e.upgrade, shown: e.shown, options: e.options, note: e.note }); }
            if (typeof saveAll === 'function') saveAll();
            if (typeof showToast === 'function') showToast('Their check-in moved with them ✓');
          }
        }
      } catch (e) { console.warn('[room-move-sync]', e); }
      rmsSettle();
      return r;
    };
  }
  if (typeof rcMoveRoom === 'function') {
    const o = window.rcMoveRoom;
    window.rcMoveRoom = function () { const r = o.apply(this, arguments); Promise.resolve(r).then(rmsSettle); rmsSettle(); return r; };
  }
})();
