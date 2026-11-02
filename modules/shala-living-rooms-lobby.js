// ===== shala-living-rooms-lobby.js — "Shanti Living Room", "Casa Grande Living Room" and "Chica Lobby" as places on the Schedule =====
// Loaded as a classic script AFTER shala-chica-rooftop.js; shares global scope. Standalone: adds three entries to SHALAS (the shala pick-lists for classes, the teacher's
// shala cards, the Ice Bath shala dropdown) and SKED_SHALAS (the Schedule grid gets a column for each). Same approach as shala-chica-rooftop.js.
// Ids: shanti_living_room, grande_living_room, chica_lobby. No photos yet, so their cards show none. Capacity is a placeholder for the "Up to N people" line; nothing enforces it.
// Asked by Darlene 2026-11-02: "add on our schedule areas... Shanti Living Room, Casa Grande Living Room, Chica Lobby".
(function () {
  const AREAS = [
    { id: 'shanti_living_room', name: 'Shanti Living Room', capacity: 15, tags: ['Indoor', 'Casa Shanti'], desc: 'Living room at Casa Shanti.', warn: '', photos: [] },
    { id: 'grande_living_room', name: 'Casa Grande Living Room', capacity: 15, tags: ['Indoor', 'Casa Grande'], desc: 'Living room at Casa Grande.', warn: '', photos: [] },
    { id: 'chica_lobby', name: 'Chica Lobby', capacity: 15, tags: ['Indoor', 'Chica'], desc: 'Lobby at our Chica property.', warn: '', photos: [] },
  ];
  const addAll = (list, full) => {
    if (!Array.isArray(list)) return;
    for (const a of AREAS) if (!list.some(s => s.id === a.id)) list.push(full ? a : { id: a.id, name: a.name });
  };
  if (typeof SHALAS !== 'undefined') addAll(SHALAS, true);
  if (typeof SKED_SHALAS !== 'undefined') addAll(SKED_SHALAS, false);
})();
