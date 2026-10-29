// ===== teacher-transport-edit.js — an Edit button on My Transportation, so the teacher (and admin) can fix a guest's transport info (Darlene 2026-10-29) =====
// Loaded as a classic script AFTER teacher-portal.js and transport.js; shares global scope. Standalone: it only wraps _renderTeacherTransportInner to add a ✏ Edit
// cell to each guest row, and saves the same flat entry the guest form and the admin Transport board use (localStorage 'amansala_transport' + the Supabase
// `transport` row, upsert by the entry's id; a guest with no entry yet gets a new one).
// LOCK: a teacher can change an arrival or a departure only until 24 hours before it (Tulum time), so drivers are never scheduled and then lose people.
// Inside that window (or for a charged leg) the leg is read-only and she is told to contact Amansala; admin logins are never locked.
// Changing an already-assigned leg re-opens driver reconfirmation, the same as a guest re-submitting the form does.
(function () {
  const LOCK_HOURS = 24;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let teBk = null, teGuests = [], teCur = null;

  const isAdmin = () => {
    try {
      if (typeof IS_TEACHER_MODE === 'undefined' || !IS_TEACHER_MODE) return true;
      return sessionStorage.getItem('ama_admin_viewing') === '1';
    } catch (e) { return false; }
  };
  const legMs = (date, time) => date ? Date.parse(date + 'T' + (time || '00:00') + ':00-05:00') : NaN;
  const legLocked = (date, time) => { const ms = legMs(date, time); return !isNaN(ms) && Date.now() >= ms - LOCK_HOURS * 3600000; };
  const charged = (tr, dir) => !!(tr && tr.folioCharged && tr.folioCharged[dir === 'arr' ? 'arrivalFolioItemId' : 'departureFolioItemId']);
  const lockedFor = (tr, dir) => {
    if (isAdmin()) return false;
    if (!tr) return false;
    if (charged(tr, dir)) return true;
    return dir === 'arr' ? legLocked(tr.arrivalDate, tr.arrivalTime) : legLocked(tr.departureDate, tr.departureTime);
  };

  // ---- decorate the table ----
  function decorate(bkId) {
    const wrap = document.getElementById('teacherTransportContent');
    if (!wrap) return;
    const bk = AppData.bookings.find(b => b.id === bkId);
    if (!bk) return;
    teBk = bk;
    teGuests = getTransportRoster(bkId).guestsWithTransport;
    const used = new Set();
    wrap.querySelectorAll('table').forEach((t, ti) => {
      t.dataset.k = 't' + ti;
      const rows = [...t.querySelectorAll('tr')];
      rows.forEach(tr => {
        const cells = tr.children;
        if (!cells.length) return;
        if (tr.querySelector('th')) { const th = document.createElement('th'); th.style.cssText = 'padding:9px 12px;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:#8a7e74;text-align:left;font-weight:700'; th.textContent = 'Edit'; tr.appendChild(th); return; }
        if (cells.length === 1 && cells[0].hasAttribute('colspan')) { cells[0].setAttribute('colspan', String(Number(cells[0].getAttribute('colspan')) + 1)); return; }
        if (cells.length < 5) return;
        const label = (cells[0].textContent || '').trim();
        const gi = teGuests.findIndex((g, i) => !used.has(t.dataset.k + i) && label.toLowerCase().startsWith(String(g.name).trim().toLowerCase()));
        const td = document.createElement('td');
        td.style.cssText = 'padding:10px 12px;font-size:12px;white-space:nowrap';
        if (gi >= 0) {
          used.add(t.dataset.k + gi);
          const g = teGuests[gi];
          const both = !isAdmin() && g.tr && lockedFor(g.tr, 'arr') && lockedFor(g.tr, 'dep');
          td.innerHTML = `<button type="button" onclick="teOpen(${gi})" title="${both ? 'Locked — within 24 hours' : 'Edit transportation'}" style="background:#f1f5f9;border:none;border-radius:7px;padding:5px 10px;cursor:pointer;font-family:'Jost',sans-serif;font-size:12px;font-weight:600;color:#374151">${both ? '🔒' : '✏'} Edit</button>`;
        }
        tr.appendChild(td);
      });
    });
  }

  // ---- modal ----
  const S_IN = 'width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Jost,sans-serif;font-size:13.5px';
  const S_LB = 'display:block;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px';
  const apOpts = v => [['cancun', 'CUN – Cancún'], ['tulum', 'TQO – Tulum']].map(([k, l]) => `<option value="${k}"${(v || 'cancun') === k ? ' selected' : ''}>${l}</option>`).join('');

  window.teOpen = function (gi) {
    const g = teGuests[gi];
    if (!g) return;
    teCur = g;
    const tr = g.tr || {};
    const aLock = lockedFor(g.tr, 'arr'), dLock = lockedFor(g.tr, 'dep');
    const dis = l => l ? ' disabled' : '';
    const lockNote = l => l ? `<div style="font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:7px 10px;margin-bottom:8px">🔒 Locked — changes close ${LOCK_HOURS} hours before ${l}, so our drivers can be scheduled. To change it now, please message Amansala.</div>` : '';
    const m = document.createElement('div');
    m.id = 'teModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px';
    m.innerHTML = `<div style="background:#fff;border-radius:14px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:Jost,sans-serif">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-size:17px;font-weight:700;color:#111827">Edit transportation</span><button type="button" onclick="teClose()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#6b7280">×</button></div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:14px"><b style="color:#111827">${esc(g.name)}</b>${g.room ? ' · Room ' + esc(g.room) : ''}</div>
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin:6px 0">Arrival</div>
      ${lockNote(aLock ? 'arrival' : '')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="${S_LB}">Date</label><input id="te-ad" type="date" value="${esc(tr.arrivalDate || '')}" style="${S_IN}"${dis(aLock)}></div>
        <div><label style="${S_LB}">Time</label><input id="te-at" type="time" value="${esc(tr.arrivalTime || '')}" style="${S_IN}"${dis(aLock)}></div>
        <div><label style="${S_LB}">Airport</label><select id="te-aa" style="${S_IN}"${dis(aLock)}>${apOpts(tr.arrivalAirport)}</select></div>
        <div><label style="${S_LB}">Airline &amp; flight</label><input id="te-fn" type="text" value="${esc(tr.flightNumber || '')}" placeholder="e.g. AA1234" style="${S_IN}"${dis(aLock)}></div>
        <div style="grid-column:1/-1"><label style="display:flex;gap:7px;align-items:center;font-size:13px"><input id="te-aot" type="checkbox" ${tr.arrivalOT ? 'checked' : ''}${dis(aLock)}> Own transport (no transfer needed)</label></div>
      </div>
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 6px">Departure</div>
      ${lockNote(dLock ? 'departure' : '')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="${S_LB}">Date</label><input id="te-dd" type="date" value="${esc(tr.departureDate || '')}" style="${S_IN}"${dis(dLock)}></div>
        <div><label style="${S_LB}">Flight time</label><input id="te-dt" type="time" value="${esc(tr.departureTime || '')}" style="${S_IN}"${dis(dLock)}></div>
        <div><label style="${S_LB}">Airport</label><select id="te-da" style="${S_IN}"${dis(dLock)}>${apOpts(tr.departureAirport)}</select></div>
        <div style="display:flex;align-items:flex-end"><label style="display:flex;gap:7px;align-items:center;font-size:13px"><input id="te-dot" type="checkbox" ${tr.departureOT ? 'checked' : ''}${dis(dLock)}> Own transport</label></div>
      </div>
      <div style="margin-top:16px"><label style="display:flex;gap:7px;align-items:center;font-size:13px"><input id="te-sh" type="checkbox" ${tr.willingToShare ? 'checked' : ''}> Happy to share a ride</label></div>
      <div style="margin-top:10px"><label style="${S_LB}">Notes</label><textarea id="te-nt" rows="2" style="${S_IN};resize:vertical">${esc(tr.notes || '')}</textarea></div>
      <div id="teErr" style="display:none;margin-top:10px;font-size:12.5px;color:#b91c1c;font-weight:600"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
        <button type="button" onclick="teClose()" style="padding:9px 16px;border-radius:9px;border:none;background:#f3f4f6;color:#374151;font-family:Jost,sans-serif;font-size:13.5px;font-weight:600;cursor:pointer">Cancel</button>
        <button type="button" id="teSave" onclick="teSave()" style="padding:9px 18px;border-radius:9px;border:none;background:#0f766e;color:#fff;font-family:Jost,sans-serif;font-size:13.5px;font-weight:700;cursor:pointer">Save</button>
      </div></div>`;
    document.body.appendChild(m);
  };
  window.teClose = function () { const m = document.getElementById('teModal'); if (m) m.remove(); teCur = null; };

  window.teSave = async function () {
    const g = teCur;
    if (!g) return;
    const v = id => (document.getElementById(id) || {}).value || '';
    const ck = id => !!(document.getElementById(id) || {}).checked;
    const err = msg => { const e = document.getElementById('teErr'); if (e) { e.textContent = msg; e.style.display = 'block'; } };
    const old = g.tr || null;
    const list = loadTransport();
    const base = old ? (list.find(s => s.id === old.id) || old) : null;
    const parts = String(g.name).trim().split(/\s+/);
    const entry = Object.assign({}, base || {
      id: 'tr_' + Date.now(), bookingId: teBk.id, firstName: parts[0] || '', lastName: parts.slice(1).join(' '), email: g.email || '', submittedAt: new Date().toISOString(), source: 'teacher_edit'
    });
    const aLock = lockedFor(old, 'arr'), dLock = lockedFor(old, 'dep');
    if (!aLock) { entry.arrivalDate = v('te-ad'); entry.arrivalTime = v('te-at'); entry.arrivalAirport = v('te-aa') || 'cancun'; entry.flightNumber = v('te-fn').trim(); entry.arrivalOT = ck('te-aot'); }
    if (!dLock) { entry.departureDate = v('te-dd'); entry.departureTime = v('te-dt'); entry.departureAirport = v('te-da') || 'cancun'; entry.departureOT = ck('te-dot'); }
    entry.willingToShare = ck('te-sh'); entry.notes = v('te-nt').trim();
    if (!isAdmin()) {
      // a leg can't be moved INTO the closed window either (unless it was left exactly as it was)
      const moved = (d, t, od, ot) => d && (d !== (od || '') || (t || '') !== (ot || '')) && legLocked(d, t);
      if (!aLock && !entry.arrivalOT && moved(entry.arrivalDate, entry.arrivalTime, old && old.arrivalDate, old && old.arrivalTime)) return err('That arrival is less than 24 hours away. Please message Amansala to arrange it.');
      if (!dLock && !entry.departureOT && moved(entry.departureDate, entry.departureTime, old && old.departureDate, old && old.departureTime)) return err('That departure is less than 24 hours away. Please message Amansala to arrange it.');
    }
    entry.lastEditedBy = isAdmin() ? 'admin' : 'teacher'; entry.lastEditedAt = new Date().toISOString();
    const btn = document.getElementById('teSave'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const i = list.findIndex(s => s.id === entry.id);
      if (i >= 0) list[i] = entry; else list.push(entry);
      localStorage.setItem(TRANSPORT_KEY, JSON.stringify(list));
      await saveTransportToSupabase(entry);
      // an already-assigned leg whose key details changed must be reconfirmed with the driver (same trigger as a guest re-submitting the form)
      try {
        if (old && typeof driverConfirmations !== 'undefined' && typeof trDrvCheckReconfirm === 'function') {
          const F = ['arrivalDate', 'arrivalTime', 'arrivalAirport', 'departureDate', 'departureTime', 'departureAirport', 'flightNumber'];
          if (F.some(f => (old[f] || '') !== (entry[f] || ''))) {
            if (entry.arrivalDate && entry.arrivalTime && entry.arrivalAirport) trDrvCheckReconfirm(entry, 'arrival', isAdmin() ? 'Admin edit' : 'Teacher edit');
            if (entry.departureDate && entry.departureTime && entry.departureAirport) trDrvCheckReconfirm(entry, 'departure', isAdmin() ? 'Admin edit' : 'Teacher edit');
            if (typeof saveDriverConfirmations === 'function') saveDriverConfirmations();
          }
        }
      } catch (e) { console.warn('[teacher-transport-edit] reconfirm', e); }
      try { logActivity('Transport edited', (isAdmin() ? 'Admin' : 'Teacher') + ' updated ' + g.name + "'s transportation", teBk.id); } catch (e) {}
      teClose();
      if (typeof showToast === 'function') showToast('Transportation updated ✓');
      _renderTeacherTransportInner(teBk.id);
    } catch (e) {
      err('Could not save: ' + (e.message || e));
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
  };

  const prev = window._renderTeacherTransportInner;
  if (typeof prev === 'function') {
    window._renderTeacherTransportInner = function (bkId) {
      const r = prev.apply(this, arguments);
      try { decorate(bkId); } catch (e) { console.warn('[teacher-transport-edit]', e); }
      return r;
    };
  }
})();
