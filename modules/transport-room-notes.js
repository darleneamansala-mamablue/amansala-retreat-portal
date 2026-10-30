// ===== transport-room-notes.js — the Transport log's Notes column shows the ROOM LIST notes (not what the guest wrote), kept short (Darlene 2026-10-30) =====
// Loaded as a classic script AFTER transport.js; shares global scope. Standalone: tr2RenderRow is only wrapped, nothing is saved or changed.
// On the team's Transport log, the Notes column used to show whatever the guest typed on the transport form (often long, e.g. "Happy to share a ride and wait up to 30 minutes…").
// It now shows the internal notes from the retreat's Room List for that guest's room — the room's note plus that guest's own note ("Request ground floor", "W/ Extra Night: Nov 6-7"…) —
// on ARRIVAL rows. Departure rows keep the column empty. A note longer than about 70 characters is cut short with "…"; click it to read it all (it is also the hover text).
// The guest's own words are still on the guest's transport entry (Edit button) — they are just not printed in the log.
(function () {
  const MAX = 70;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const norm = s => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const sameRoom = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

  function roomNote(e) {
    try {
      const regs = (AppData.regs || []).filter(r => r.bookingId === e.retreatId && !r.cancelled && sameRoom(r.room, e.room));
      const parts = [];
      regs.forEach(r => {
        if (r.notes && String(r.notes).trim()) parts.push(String(r.notes).trim());
        const g = (r.guests || []).find(x => x && x.name && norm(x.name) === norm(e.guest));
        if (g && g.notes && String(g.notes).trim()) parts.push(String(g.notes).trim());
      });
      return [...new Set(parts)].join(' · ').replace(/\s+/g, ' ');
    } catch (err) { return ''; }
  }
  window.tnExpand = function (el) { const full = el.getAttribute('data-full'); if (!full) return; const open = el.getAttribute('data-open') === '1'; el.textContent = open ? full.slice(0, MAX).trim() + '…' : full; el.setAttribute('data-open', open ? '0' : '1'); };
  window.trRoomNoteHtml = function (full) {
    if (!full) return '';
    if (full.length <= MAX) return `<span style="font-size:11px;color:#6b7280;font-style:italic">${esc(full)}</span>`;
    return `<span title="${esc(full)}" data-full="${esc(full)}" data-open="0" onclick="event.stopPropagation();tnExpand(this)" style="font-size:11px;color:#6b7280;font-style:italic;cursor:pointer">${esc(full.slice(0, MAX).trim())}…</span>`;
  };

  const prev = window.tr2RenderRow;
  if (typeof prev !== 'function') return;
  window.tr2RenderRow = function (e) {
    const keep = e.notes;
    const isArr = e.type === 'arrival';
    e.notes = isArr ? roomNote(e) : '';
    // the original draws e.notes inside <span>…</span>; swap that for the short, click-to-expand version
    try {
      let html = prev.apply(this, arguments);
      if (isArr && e.notes) {
        const orig = `<span style="font-size:11px;color:#6b7280;font-style:italic">${String(e.notes).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</span>`;
        const alt = `<span style="font-size:11px;color:#6b7280;font-style:italic">${esc(e.notes)}</span>`;
        const mine = window.trRoomNoteHtml(e.notes);
        html = html.indexOf(orig) >= 0 ? html.replace(orig, () => mine) : html.indexOf(alt) >= 0 ? html.replace(alt, () => mine) : html;
      }
      return html;
    } finally { e.notes = keep; }
  };
})();
