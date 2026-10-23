// ===== departures-zero-last.js — Reservations > Departures: guests with a $0.00 balance go to the bottom =====
// Loaded as a classic script AFTER reservations.js; shares global scope. Standalone: wraps _resBuildMovementView only to know the Departures
// tab is being drawn, and _resAttachFolioBalances (which fills each row's .balance) to move every row at $0.00 to the end of the list afterwards.
// Everyone who still owes money (or has a credit, or no balance read) keeps the normal order at the top, so the guests to chase come first.
// Arrivals, In House and A/C 24hrs are not changed. Asked by Darlene 2026-10-22.
let drzDepartures = false;

(function () {
  if (typeof _resBuildMovementView !== 'function' || typeof _resAttachFolioBalances !== 'function') return;
  const origView = window._resBuildMovementView, origAttach = window._resAttachFolioBalances;
  window._resBuildMovementView = function (type) {
    drzDepartures = type === 'departures';   // read synchronously by _resAttachFolioBalances, which the view calls before its first await
    return origView.apply(this, arguments);
  };
  window._resAttachFolioBalances = async function (rows) {
    const onlyDepartures = drzDepartures; drzDepartures = false;
    const out = await origAttach.apply(this, arguments);
    if (onlyDepartures && Array.isArray(rows)) {
      const owing = rows.filter(r => r.balance !== 0), zero = rows.filter(r => r.balance === 0);
      rows.splice(0, rows.length, ...owing, ...zero);
    }
    return out;
  };
})();
