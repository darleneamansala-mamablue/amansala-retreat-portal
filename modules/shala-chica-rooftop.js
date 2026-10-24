// ===== shala-chica-rooftop.js — "Chica Rooftop" as a shala choice for a class =====
// Loaded as a classic script AFTER teacher-portal.js; shares global scope. Standalone: adds one entry, right after Chica, to SHALAS (the shala pick-lists for the morning,
// afternoon and arrival/departure classes, the teacher's shala cards, the Ice Bath shala dropdown) and SKED_SHALAS (the Schedule grid gets a Chica Rooftop column).
// Id 'chica_rooftop'. No photo yet, so its card shows none. The capacity (20) is a placeholder for the "Up to N people" line; nothing in the portal enforces it.
// Asked by Darlene 2026-10-24: "we also need to add on for the shala choice Chica Rooftop ... for a class".
(function () {
  const addAfterChica = (list, entry) => {
    if (!Array.isArray(list) || list.some(s => s.id === entry.id)) return;
    const at = list.findIndex(s => s.id === 'chica');
    list.splice(at >= 0 ? at + 1 : list.length, 0, entry);
  };
  if (typeof SHALAS !== 'undefined') addAfterChica(SHALAS, { id: 'chica_rooftop', name: 'Chica Rooftop', capacity: 20, tags: ['Rooftop', 'Open air', 'Ocean view'], desc: 'Open-air rooftop at our Chica property, with a view of the ocean.', warn: 'Weather dependent — open air.', photos: [] });
  if (typeof SKED_SHALAS !== 'undefined') addAfterChica(SKED_SHALAS, { id: 'chica_rooftop', name: 'Chica Rooftop' });
})();
