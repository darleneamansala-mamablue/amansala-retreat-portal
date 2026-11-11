// Order of the shalas on the Calendar grid (and the shala pick-lists): Grande, Chica, Beachfront, Heaven, Skye, Chica Rooftop,
// Casa Grande Living Room, Shanti Living Room (Casa Shanti), Chica Lobby. Any other space keeps its place after these.
// Loaded AFTER shala-living-rooms.js; sorts SKED_SHALAS and SHALAS in place. Nothing is saved.
(function () {
  const ORDER = ['grande', 'chica', 'beachfront', 'heaven', 'skye', 'chica_rooftop', 'casa_grande_living', 'shanti_living', 'chica_lobby'];
  const rank = s => { const i = ORDER.indexOf(s.id); return i < 0 ? ORDER.length : i; };
  [typeof SKED_SHALAS !== 'undefined' ? SKED_SHALAS : null, typeof SHALAS !== 'undefined' ? SHALAS : null].forEach(list => {
    if (!Array.isArray(list)) return;
    const sorted = list.map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
    list.splice(0, list.length, ...sorted);
  });
})();
