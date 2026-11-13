// ===== transport-room-notes.js — the Transport log's Notes column: Room notes, Internal notes and the guest's form notes, each on its own labeled line, kept short (Darlene 2026-10-30; Jorge 2026-11-04) =====
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

  // the same text twice ("Isabel Fry · Isabel Fry", e.g. room note + guest note, or different capitals/spaces) is shown once
  const dedupe = str => { const seen = new Set(); return String(str || '').split(/\s*[·\n]\s*/).map(x => x.trim()).filter(x => { const k = x.toLowerCase().replace(/\s+/g, ' '); if (!x || seen.has(k)) return false; seen.add(k); return true; }).join(' · '); };
  window.trDedupeNote = dedupe;
  function roomNote(e) {
    try {
      const regs = (AppData.regs || []).filter(r => r.bookingId === e.retreatId && !r.cancelled && sameRoom(r.room, e.room));
      const parts = [];
      regs.forEach(r => {
        if (r.notes && String(r.notes).trim()) parts.push(String(r.notes).trim());
        const g = (r.guests || []).find(x => x && x.name && norm(x.name) === norm(e.guest));
        if (g && g.notes && String(g.notes).trim()) parts.push(String(g.notes).trim());
      });
      return dedupe(parts.join(' · ').replace(/\s+/g, ' '));
    } catch (err) { return ''; }
  }
  // the room's staff-only Internal Notes (Booking Detail → Internal Notes), on arrivals and departures (Jorge 2026-11-04)
  function internalNote(e) {
    try {
      return dedupe((AppData.regs || []).filter(r => r.bookingId === e.retreatId && !r.cancelled && sameRoom(r.room, e.room))
        .map(r => String(r.internalNotes || '').trim()).filter(Boolean).join(' · ').replace(/\s+/g, ' '));
    } catch (err) { return ''; }
  }
  window.tnExpand = function (el) { const full = el.getAttribute('data-full'); if (!full) return; const open = el.getAttribute('data-open') === '1'; el.textContent = open ? full.slice(0, MAX).trim() + '…' : full; el.setAttribute('data-open', open ? '0' : '1'); };
  window.trRoomNoteHtml = function (full) {
    if (!full) return '';
    if (full.length <= MAX) return `<span style="font-size:11px;color:#dc2626;font-weight:700">${esc(full)}</span>`;
    return `<span title="${esc(full)}" data-full="${esc(full)}" data-open="0" onclick="event.stopPropagation();tnExpand(this)" style="font-size:11px;color:#dc2626;font-weight:700;cursor:pointer">${esc(full.slice(0, MAX).trim())}…</span>`;
  };

  // Jorge 2026-11-04: the notes one under the other, each with its label, never run together --
  //   Room notes     = the Room List / teacher's notes for the room and the guest (Booking Detail "Notes")
  //   Internal notes = staff-only (Booking Detail "Internal Notes")
  //   Guest form     = what the guest wrote on the transport form
  function noteParts(e, guestNote) {
    // the transport entry's own notes (what the guest wrote or the office typed) have their own Transport Notes column now (Jorge 2026-11-13)
    return [['Room notes', roomNote(e)], ['Internal notes', internalNote(e)]].filter(p => p[1]);
  }
  const label = t => `<span style="font-size:9.5px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.3px;margin-right:4px">${t}</span>`;
  // the printed sheet (Imprimir): same parts, in full
  window.trNotesPrintHtml = function (e) {
    return noteParts(e, e && e.notes).map(p => `<div style="margin:1px 0">${label(p[0])}${esc(p[1])}</div>`).join('');
  };
  window.trCombinedNotes = function (e) { return noteParts(e, e && e.notes).map(p => p[0] + ': ' + p[1]).join('\n'); };

  const prev = window.tr2RenderRow;
  if (typeof prev !== 'function') return;
  const MARK = '__trnotes__';
  window.tr2RenderRow = function (e) {
    const keep = e.notes;
    const parts = noteParts(e, keep);
    e.notes = parts.length ? MARK : '';
    // the original draws e.notes inside <span>…</span>; swap that span for the labeled lines (each shortened, click to read all)
    try {
      let html = prev.apply(this, arguments);
      if (parts.length) {
        const mine = parts.map(p => `<div style="margin:1px 0;line-height:1.35">${label(p[0])}${window.trRoomNoteHtml(p[1])}</div>`).join('');
        html = html.replace(/<span[^>]*>__trnotes__<\/span>/, () => mine);
      }
      return html;
    } finally { e.notes = keep; }
  };
})();
