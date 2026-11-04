// ===== teacher-contacts.js — edit every participant's email and phone at once (Jorge 2026-11-04) =====
// Teacher portal → My Transport → "✎ Edit emails & phones": one list with every guest of the retreat (room, name, email,
// phone, all editable) and one Save for all of them. Writes the same fields the room list's guest edit does (guests[].email
// / .phone on the registration) and saves the usual way (saveAll). A locked room (or a retreat locked by Amansala) is shown
// but cannot be changed from the teacher's side, same as the room list. Standalone; classic script, shares global scope.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const okEmail = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  // WhatsApp (Visito) needs the full number with its country code (Jorge 2026-11-04). Each phone gets a country picker; a
  // number already written with "+" keeps its code, a bare 10-digit number is taken as US/Canada (+1, most of our guests)
  // and highlighted so the teacher can check it. Saved as "+<code><number>".
  const CODES = [['1', 'US / Canada +1'], ['52', 'Mexico +52'], ['44', 'UK +44'], ['61', 'Australia +61'], ['64', 'New Zealand +64'], ['353', 'Ireland +353'],
    ['49', 'Germany +49'], ['33', 'France +33'], ['34', 'Spain +34'], ['39', 'Italy +39'], ['31', 'Netherlands +31'], ['41', 'Switzerland +41'], ['46', 'Sweden +46'],
    ['47', 'Norway +47'], ['45', 'Denmark +45'], ['351', 'Portugal +351'], ['972', 'Israel +972'], ['971', 'UAE +971'], ['55', 'Brazil +55'], ['54', 'Argentina +54'],
    ['57', 'Colombia +57'], ['56', 'Chile +56'], ['51', 'Peru +51'], ['506', 'Costa Rica +506'], ['63', 'Philippines +63'], ['91', 'India +91'], ['27', 'South Africa +27'],
    ['81', 'Japan +81'], ['86', 'China +86'], ['65', 'Singapore +65']];
  function splitPhone(raw) {
    const t = String(raw || '').trim(), d = t.replace(/\D/g, '');
    if (!d) return { code: '1', num: '', guessed: false };
    if (t.startsWith('+') || t.startsWith('00')) {
      const dd = t.startsWith('00') ? d.slice(2) : d;
      const hit = CODES.map(c => c[0]).sort((a, b) => b.length - a.length).find(c => dd.startsWith(c));
      if (hit) return { code: hit, num: dd.slice(hit.length), guessed: false };
      return { code: 'other', num: dd, guessed: false };
    }
    if (d.length === 11 && d.startsWith('1')) return { code: '1', num: d.slice(1), guessed: false };
    if (d.length === 12 && d.startsWith('52')) return { code: '52', num: d.slice(2), guessed: false };
    return { code: '1', num: d, guessed: true };   // no code written: assume +1, flag it
  }

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
          <div style="font-size:12px;color:#8a7e74">${list.length} guests · change any email or phone, then Save all. Pick each phone's country so WhatsApp messages reach them. Orange = no country code was saved, please check.</div></div>
        <button onclick="document.getElementById('tcContactsModal').remove()" style="border:none;background:none;font-size:20px;cursor:pointer;color:#8a7e74">✕</button>
      </div>
      <div style="overflow:auto;padding:4px 20px">
        <table style="width:100%;border-collapse:collapse"><thead><tr style="font-size:10.5px;color:#8a7e74;text-transform:uppercase;letter-spacing:.4px">
          <th style="text-align:left;padding:8px 6px;width:70px">Room</th><th style="text-align:left;padding:8px 6px">Guest</th><th style="text-align:left;padding:8px 6px">Email</th><th style="text-align:left;padding:8px 6px;width:290px">Phone (country + number)</th></tr></thead>
        <tbody>${list.map((x, i) => `<tr style="border-top:1px solid #f5f0e8">
          <td style="padding:6px;font-size:12px;color:#8a7e74;white-space:nowrap">${esc(x.room)}</td>
          <td style="padding:6px;font-size:13px;font-weight:600;color:#2d2520">${esc(x.name)}${x.locked ? ' <span title="Locked by Amansala" style="font-size:11px">🔒</span>' : ''}</td>
          <td style="padding:6px"><input id="tc-em-${i}" type="email" value="${esc(x.email)}" ${x.locked ? 'disabled' : ''} style="${inp}"></td>
          <td style="padding:6px;white-space:nowrap">${(() => { const sp = splitPhone(x.phone); return `<select id="tc-cc-${i}" ${x.locked ? 'disabled' : ''} title="Country code" style="padding:6px 4px;border:1.5px solid ${sp.guessed ? '#f59e0b' : '#e8dfd4'};background:${sp.guessed ? '#fffbeb' : '#fff'};border-radius:7px;font-size:12px;max-width:120px">${CODES.map(c => `<option value="${c[0]}" ${c[0] === sp.code ? 'selected' : ''}>${c[1]}</option>`).join('')}<option value="other" ${sp.code === 'other' ? 'selected' : ''}>Other (type +code)</option></select> <input id="tc-ph-${i}" type="tel" value="${esc(sp.code === 'other' ? '+' + sp.num : sp.num)}" ${x.locked ? 'disabled' : ''} placeholder="number" style="${inp};width:130px">${sp.guessed && sp.num ? '<div style="font-size:10px;color:#b45309;margin-top:2px">No country code was saved — check it</div>' : ''}`; })()}</td>
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
      const em = (document.getElementById('tc-em-' + i)?.value || '').trim(), cc = document.getElementById('tc-cc-' + i)?.value || '1';
      const rawPh = (document.getElementById('tc-ph-' + i)?.value || '').trim(), digits = rawPh.replace(/\D/g, '');
      const ph = !digits ? '' : (cc === 'other' || rawPh.startsWith('+')) ? '+' + digits : '+' + cc + digits;
      if (digits && digits.length < 6) { bad.push(x.name + ' (phone)'); return; }
      if (!okEmail(em)) { bad.push(x.name); return; }
      if (em !== x.email || ph !== x.phone) changed.push({ ...x, em, ph });
    });
    if (bad.length) { document.getElementById('tcContactsErr').textContent = 'Check: ' + bad.join(', '); return; }
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
