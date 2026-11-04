// ===== teacher-contacts.js — edit every participant's email and phone at once (Jorge 2026-11-04) =====
// Teacher portal → My Transport → "✎ Edit emails & phones": one list with every guest of the retreat (room, name, email,
// phone, all editable) and one Save for all of them. Writes the same fields the room list's guest edit does (guests[].email
// / .phone on the registration) and saves the usual way (saveAll). A locked room (or a retreat locked by Amansala) is shown
// but cannot be changed from the teacher's side, same as the room list. Standalone; classic script, shares global scope.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const okEmail = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  function rows(bkId) {
    const bk = AppData.bookings.find(b => b.id === bkId);
    const locked = r => !!(r.locked || (typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE && bk && bk.allLocked));
    const out = [];
    AppData.regs.filter(r => r.bookingId === bkId && !r.cancelled).forEach(r => (r.guests || []).forEach((g, gi) => {
      if (!g || !g.name || g.cancelled) return;
      out.push({ regId: r.id, gi, room: r.room || '', name: g.name, email: g.email || '', phone: g.phone || '', locked: locked(r) });
    }));
    const key = room => (typeof _resRoomSortKey === 'function' ? _resRoomSortKey(room) : room);
    return out.sort((a, b) => String(key(a.room)).localeCompare(String(key(b.room)), 'en', { numeric: true }) || a.name.localeCompare(b.name));
  }

  window.tcOpenContacts = function (bkId) {
    const list = rows(bkId);
    let ov = document.getElementById('tcContactsModal');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'tcContactsModal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(30,25,20,.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px';
    const inp = 'width:100%;padding:6px 8px;border:1.5px solid #e8dfd4;border-radius:7px;font-family:Jost,sans-serif;font-size:12.5px';
    ov.innerHTML = `<div style="background:#fff;border-radius:14px;max-width:900px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.25);font-family:Jost,sans-serif">
      <div style="padding:16px 20px;border-bottom:1px solid #f0ebe0;display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div><div style="font-size:16px;font-weight:700;color:#2d2520">Participants' emails & phones</div>
          <div style="font-size:12px;color:#8a7e74">${list.length} guests · change any email or phone, then Save all. Include the country code in phones (+1, +52…).</div></div>
        <button onclick="document.getElementById('tcContactsModal').remove()" style="border:none;background:none;font-size:20px;cursor:pointer;color:#8a7e74">✕</button>
      </div>
      <div style="overflow:auto;padding:4px 20px">
        <table style="width:100%;border-collapse:collapse"><thead><tr style="font-size:10.5px;color:#8a7e74;text-transform:uppercase;letter-spacing:.4px">
          <th style="text-align:left;padding:8px 6px;width:70px">Room</th><th style="text-align:left;padding:8px 6px">Guest</th><th style="text-align:left;padding:8px 6px">Email</th><th style="text-align:left;padding:8px 6px;width:190px">Phone</th></tr></thead>
        <tbody>${list.map((x, i) => `<tr style="border-top:1px solid #f5f0e8">
          <td style="padding:6px;font-size:12px;color:#8a7e74;white-space:nowrap">${esc(x.room)}</td>
          <td style="padding:6px;font-size:13px;font-weight:600;color:#2d2520">${esc(x.name)}${x.locked ? ' <span title="Locked by Amansala" style="font-size:11px">🔒</span>' : ''}</td>
          <td style="padding:6px"><input id="tc-em-${i}" type="email" value="${esc(x.email)}" ${x.locked ? 'disabled' : ''} style="${inp}"></td>
          <td style="padding:6px"><input id="tc-ph-${i}" type="tel" value="${esc(x.phone)}" ${x.locked ? 'disabled' : ''} style="${inp}"></td>
        </tr>`).join('') || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#8a7e74">No guests on the room list yet.</td></tr>'}</tbody></table>
      </div>
      <div style="padding:14px 20px;border-top:1px solid #f0ebe0;display:flex;justify-content:flex-end;gap:8px;align-items:center">
        <span id="tcContactsErr" style="font-size:12px;color:#b91c1c;margin-right:auto"></span>
        <button onclick="document.getElementById('tcContactsModal').remove()" style="padding:8px 16px;border:1px solid #e8dfd4;border-radius:8px;background:#fff;cursor:pointer;font-family:Jost,sans-serif">Cancel</button>
        <button onclick="tcSaveContacts('${esc(bkId)}')" style="padding:8px 18px;border:none;border-radius:8px;background:#0e9494;color:#fff;font-weight:700;cursor:pointer;font-family:Jost,sans-serif">Save all</button>
      </div></div>`;
    ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    ov._rows = list;
  };

  window.tcSaveContacts = function (bkId) {
    const ov = document.getElementById('tcContactsModal'); if (!ov) return;
    const list = ov._rows || [], changed = [], bad = [];
    list.forEach((x, i) => {
      if (x.locked) return;
      const em = (document.getElementById('tc-em-' + i)?.value || '').trim(), ph = (document.getElementById('tc-ph-' + i)?.value || '').trim();
      if (!okEmail(em)) { bad.push(x.name); return; }
      if (em !== x.email || ph !== x.phone) changed.push({ ...x, em, ph });
    });
    if (bad.length) { document.getElementById('tcContactsErr').textContent = 'Check the email of: ' + bad.join(', '); return; }
    if (!changed.length) { ov.remove(); showToast('Nothing changed.'); return; }
    const ts = new Date().toISOString();
    changed.forEach(c => {
      const reg = AppData.regs.find(r => r.id === c.regId); if (!reg || !reg.guests || !reg.guests[c.gi]) return;
      reg.guests[c.gi] = { ...reg.guests[c.gi], email: c.em, phone: c.ph };
      reg.updatedAt = ts;
    });
    saveAll();
    try { logActivity('Guest contacts updated', `${changed.length} guest${changed.length !== 1 ? 's' : ''}: ${changed.map(c => c.name).join(', ')}`.slice(0, 900), bkId); } catch (e) {}
    ov.remove();
    showToast(`Saved ${changed.length} contact${changed.length !== 1 ? 's' : ''} ✓`);
    try { if (typeof renderTeacherTransport === 'function' && document.getElementById('teacherTransportContent')) renderTeacherTransport(bkId); } catch (e) {}
    try { if (typeof regRender === 'function') regRender(); } catch (e) {}
  };
})();
