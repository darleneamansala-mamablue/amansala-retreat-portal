// ===== shala-living-rooms.js — Casa Grande Living Room, Chica Lobby and Shanti Living Room as spaces =====
// Loaded as a classic script AFTER shala-chica-rooftop.js; shares global scope. Standalone: adds three entries to SHALAS (class shala pick-lists) and SKED_SHALAS (the
// Calendar / Schedule grid gets a column for each). Ids 'casa_grande_living', 'chica_lobby', 'shanti_living'. No photos yet; capacity is a placeholder.
// Asked by Darlene 2026-11-02: "It is still not showing Shanti Living Room, Casa Grande Living Room, Chica Lobby".
(function () {
  const addAfter = (list, afterIds, entry) => {
    if (!Array.isArray(list) || list.some(s => s.id === entry.id)) return;
    let at = -1;
    for (const id of afterIds) { at = list.findIndex(s => s.id === id); if (at >= 0) break; }
    list.splice(at >= 0 ? at + 1 : list.length, 0, entry);
  };
  const SPACES = [
    { id: 'casa_grande_living', name: 'Casa Grande Living Room', after: ['grande'] },
    { id: 'chica_lobby', name: 'Chica Lobby', after: ['chica_rooftop', 'chica'] },
    { id: 'shanti_living', name: 'Shanti Living Room', after: ['skye', 'heaven'] },
  ];
  SPACES.forEach(s => {
    if (typeof SHALAS !== 'undefined') addAfter(SHALAS, s.after, { id: s.id, name: s.name, capacity: 20, tags: ['Indoor'], desc: s.name + '.', warn: '', photos: [] });
    if (typeof SKED_SHALAS !== 'undefined') addAfter(SKED_SHALAS, s.after, { id: s.id, name: s.name });
  });
})();
