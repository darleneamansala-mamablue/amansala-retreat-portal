// ===== bbc-workshops-cohosts.js — Bikini Bootcamp schedule: add workshops and co-hosts (Darlene 2026-11-06) =====
// Loaded as a classic script AFTER bbc-schedule.js; shares global scope. Standalone: bbc-schedule.js is not edited, its render functions are wrapped.
//   Co-host: every class / event slot gets a "Co-host" list under it (pick a teacher from the list; the slot\'s own instructor is not offered). It is saved on the slot as slot.coHost and shown wherever the
//            slot is shown: the printed schedule, the copied text and the Calendar read "Instructor & Co-host". The instructor alone is still what duplicate-instructor warnings and staff confirmations use.
//   Workshop: an "+ Add workshop" button under "+ Add slot" on each day asks for the workshop's name and adds a slot flagged slot.workshop (time, who leads it and the place are filled in like any slot). Any
//             slot can also be switched to or from a workshop with its "Workshop" tick. Workshops show as "Workshop: name" in the print, the text and the Calendar.
// Slots that staff already confirmed stay locked: their co-host / workshop tick is locked too until Unlock.
(function () {
  if (typeof bbcRenderSlotRow !== 'function' || typeof bbcRenderDayCard !== 'function') return;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  // Jessy Crystal joins the teacher list (Darlene 2026-11-06): she shows in the Instructor suggestions and the Co-host list.
  if (typeof BBC_INSTRUCTORS_LIST !== 'undefined' && !BBC_INSTRUCTORS_LIST.includes('Jessy Crystal')) BBC_INSTRUCTORS_LIST.push('Jessy Crystal');
  // The Co-host is picked from the teacher list; the slot's own instructor is left out of it. A name saved earlier that is not on the list stays as its own option.
  function coHostOptions(slot) {
    const cur = String(slot.coHost || ''), main = String(slot.instructor || '').trim().toLowerCase();
    const names = (typeof BBC_INSTRUCTORS_LIST !== 'undefined' ? BBC_INSTRUCTORS_LIST : []).filter(n => n.toLowerCase() !== main);
    if (cur && !names.includes(cur)) names.unshift(cur);
    return '<option value="">— none —</option>' + names.map(n => '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>').join('');
  }
  const origRow = window.bbcRenderSlotRow;
  window.bbcRenderSlotRow = function (schedId, di, slot, si) {
    const html = origRow.apply(this, arguments);
    if (!slot || slot.type === 'meal') return html;
    const locked = !!slot.confirmed, dl = 'bbcInstDl-' + schedId + '-' + di, f = "bbcSlotField('" + schedId + "'," + di + "," + si + ",";
    const inp = 'padding:4px 8px;border:1.5px solid #e5e7eb;border-radius:7px;font-family:\'Jost\',sans-serif;font-size:12px;min-width:230px;background:' + (locked ? '#f3f4f6' : '#fff');
    return html + '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:3px 10px 7px 130px;border-top:1px dashed #eee;background:' + (slot.workshop ? '#fff7ed' : '#fcfbfa') + '">'
      + '<label style="font-size:11.5px;font-weight:700;color:#7c2d12;display:flex;gap:5px;align-items:center;cursor:' + (locked ? 'default' : 'pointer') + '"><input type="checkbox" ' + (slot.workshop ? 'checked ' : '') + (locked ? 'disabled ' : '') + 'onchange="' + f + "'workshop',this.checked);bbcWorkshopRerender('" + schedId + "'," + di + ')"> 🎓 Workshop</label>'
      + '<label style="font-size:11.5px;font-weight:700;color:#6b7280;display:flex;gap:6px;align-items:center">Co-host'
      + '<select ' + (locked ? 'disabled ' : '') + 'onchange="' + f + "'coHost',this.value)\" style=\"" + inp + '">' + coHostOptions(slot) + '</select></label></div>';
  };

  const origDay = window.bbcRenderDayCard;
  window.bbcRenderDayCard = function (s, day, di) {
    let html = origDay.apply(this, arguments);
    const at = html.indexOf("onclick=\"bbcAddSlot('" + s.id + "'," + di + ")\"");
    if (at < 0) return html;
    const end = html.indexOf('</button>', at) + '</button>'.length;
    return html.slice(0, end) + '<button onclick="bbcAddWorkshop(\'' + s.id + "'," + di + ')" style="margin-top:8px;width:100%;padding:8px;background:#fff7ed;color:#9a3412;border:1.5px dashed #fdba74;border-radius:8px;font-family:\'Jost\',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer">🎓 + Add workshop</button>' + html.slice(end);
  };

  window.bbcWorkshopRerender = function (schedId, di) {
    const wasOpen = document.getElementById('bbcDayBody-' + schedId + '-' + di) && document.getElementById('bbcDayBody-' + schedId + '-' + di).style.display === 'block';
    bbcRenderEditor();
    const nb = document.getElementById('bbcDayBody-' + schedId + '-' + di);
    if (nb && wasOpen) { nb.style.display = 'block'; const ch = document.getElementById('bbcChev-' + schedId + '-' + di); if (ch) ch.style.transform = 'rotate(90deg)'; }
  };
  window.bbcAddWorkshop = function (schedId, di) {
    const s = bbcSchedules.find(x => x.id === schedId); if (!s || !s.days[di]) return;
    const name = prompt('Name of the workshop (for example "Vision Board Workshop"):'); if (!name || !name.trim()) return;
    const slot = bbcMakeSlot('', name.trim(), '', '', false, 'class'); slot.workshop = true; slot.coHost = '';
    s.days[di].slots.push(slot);
    bbcSaveData(); bbcWorkshopRerender(schedId, di);
  };

  // Everywhere a slot is shown outside the editor, the co-host rides along with the instructor and a workshop says so.
  function withExtras(fn) {
    const saved = [];
    try {
      (typeof bbcSchedules !== 'undefined' ? bbcSchedules : []).forEach(s => (s.days || []).forEach(d => (d.slots || []).forEach(sl => {
        if (!sl.coHost && !sl.workshop) return;
        saved.push([sl, sl.instructor, sl.activity]);
        if (sl.coHost) sl.instructor = (sl.instructor ? sl.instructor + ' & ' : '') + sl.coHost;
        if (sl.workshop && !/^workshop/i.test(sl.activity || '')) sl.activity = 'Workshop: ' + (sl.activity || '');
      })));
      return fn();
    } finally { saved.forEach(([sl, i, a]) => { sl.instructor = i; sl.activity = a; }); }
  }
  ['skedGetBbcEvents', 'bbcScheduleAsText', 'bbcPrint'].forEach(n => {
    const o = window[n]; if (typeof o !== 'function') return;
    window[n] = function () { const a = arguments, t = this; return withExtras(() => o.apply(t, a)); };
  });
})();
