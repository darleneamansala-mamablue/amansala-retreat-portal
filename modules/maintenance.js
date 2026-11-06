// ===== maintenance.js — "Mantenimiento": room problems reported by guests (through Lana on WhatsApp) or by staff (Jorge 2026-11-06) =====
// Each report is a ticket: Abierto -> En proceso -> Resuelto. The maintenance team gets a WhatsApp when one is opened
// (numbers set here, "📱 Maintenance WhatsApp"); marking it Resuelto sends the guest a WhatsApp confirmation at once.
// Data and sends: netlify/functions/maintenance.js. Standalone; classic script, adds its own tab next to Housekeeping.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let tickets = [], numbers = [], filter = 'open', timer = null, catFilter = 'all', roomFilter = '';
  // categories (Jorge 2026-11-06): set from what the guest wrote, staff can change them on each report
  const CAT = { ac: { l: 'Air Conditioning', i: '❄️' }, door: { l: 'Door / Lock', i: '🚪' }, safe: { l: 'Safe', i: '🔒' }, electricity: { l: 'Electricity', i: '💡' }, water: { l: 'Water / Plumbing', i: '🚿' }, other: { l: 'Other', i: '🔧' } };
  const ST = { open: { l: 'Open', bg: '#fef2f2', c: '#b91c1c' }, in_progress: { l: 'In progress', bg: '#fffbeb', c: '#92400e' }, resolved: { l: 'Resolved', bg: '#ecfdf5', c: '#047857' } };
  const tok = () => { try { return sessionStorage.getItem('amansala_staff_token') || ''; } catch (e) { return ''; } };
  const call = async (action, extra) => {
    const r = await fetch('/.netlify/functions/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok(), action, ...(extra || {}) }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Error');
    return d;
  };
  const when = t => { try { return new Date(t).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  const ago = t => { const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d`; };

  function mount() {
    if (document.getElementById('maintenanceTabBtn')) return;
    const hk = document.getElementById('housekeepingTabBtn'); if (!hk) return;
    const btn = document.createElement('button');
    btn.className = 'tab-btn'; btn.id = 'maintenanceTabBtn';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg><span class="tab-label">Maintenance</span><span id="mtBadge" style="display:none;margin-left:4px;background:#dc2626;color:#fff;border-radius:10px;font-size:10px;padding:0 6px;font-weight:700"></span>';
    btn.onclick = () => switchTab('maintenance', btn);
    hk.after(btn);
    const panel = document.createElement('div');
    panel.className = 'tab-panel'; panel.id = 'tab-maintenance'; panel.style.flexDirection = 'column';
    panel.innerHTML = `<div style="flex:1;overflow-y:auto;padding:28px 36px;background:#f5f1eb">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap">
        <div><h2 style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:600;color:#2d2520;margin:0">Maintenance</h2>
        <p style="font-size:12.5px;color:#8a7e74;margin:4px 0 0">Reports from guests (WhatsApp with Lana) and from staff. When it is marked Resolved, the guest gets a confirmation.</p></div>
        <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="mtNumbers()">📱 Maintenance WhatsApp</button>
          <button class="btn btn-primary btn-sm" onclick="mtNew()">+ New report</button></div></div>
      <div id="mtFilters" style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap"></div>
      <div id="mtCats" style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;align-items:center"></div>
      <div id="mtRoomSummary"></div>
      <div id="mtList"></div></div>`;
    const hkPanel = document.getElementById('tab-housekeeping');
    (hkPanel ? hkPanel.parentNode : document.body).insertBefore(panel, hkPanel ? hkPanel.nextSibling : null);
    const prev = window.switchTab;
    window.switchTab = function (id, b) {
      if (id === 'maintenance') {
        localStorage.setItem('ama_last_tab', id);
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
        panel.classList.add('active'); (b || btn).classList.add('active');
        load(); clearInterval(timer); timer = setInterval(() => { if (panel.classList.contains('active')) load(true); }, 60000);
        return;
      }
      return prev.apply(this, arguments);
    };
    if (localStorage.getItem('ama_last_tab') === 'maintenance') setTimeout(() => window.switchTab('maintenance', btn), 300);
    badge(); setInterval(badge, 120000);
  }

  async function badge() {
    try { const d = await call('list'); tickets = d.tickets || []; numbers = d.numbers || []; } catch (e) { return; }
    const n = tickets.filter(t => t.status !== 'resolved').length, b = document.getElementById('mtBadge');
    if (b) { b.textContent = n; b.style.display = n ? 'inline-block' : 'none'; }
  }
  async function load(quiet) {
    const box = document.getElementById('mtList');
    if (!quiet && box) box.innerHTML = '<div style="padding:30px;text-align:center;color:#9ca3af">Loading…</div>';
    try { const d = await call('list'); tickets = d.tickets || []; numbers = d.numbers || []; } catch (e) { if (box) box.innerHTML = `<div style="padding:30px;color:#b91c1c">${esc(e.message)}</div>`; return; }
    render();
  }
  function render() {
    const open = tickets.filter(t => t.status !== 'resolved');
    const b = document.getElementById('mtBadge'); if (b) { b.textContent = open.length; b.style.display = open.length ? 'inline-block' : 'none'; }
    const f = document.getElementById('mtFilters');
    const fb = (k, l, n) => `<button class="btn btn-sm ${filter === k ? 'btn-primary' : 'btn-secondary'}" onclick="mtFilter('${k}')">${l} (${n})</button>`;
    if (f) f.innerHTML = fb('open', 'Pending', open.length) + fb('resolved', 'Resolved', tickets.length - open.length) + fb('all', 'All', tickets.length)
      + '<span style="margin-left:8px;align-self:center;font-size:12px;color:#6b7280">The WhatsApp goes to everyone on the daily A/C report' + (numbers.length ? ` and ${numbers.length} more number(s)` : '') + '.</span>';
    const byStatus = tickets.filter(t => filter === 'all' || (filter === 'open' ? t.status !== 'resolved' : t.status === 'resolved'));
    const byRoom = byStatus.filter(t => !roomFilter || String(t.room) === roomFilter);
    // category chips with counts (inside Pending / Resolved / All and the room picked) + the room picker
    const rooms = [...new Set(tickets.map(t => String(t.room || '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const cc = k => byRoom.filter(t => (t.category || 'other') === k).length;
    const cb = (k, l, n) => `<button class="btn btn-sm ${catFilter === k ? 'btn-primary' : 'btn-secondary'}" onclick="mtCat('${k}')" style="font-size:12px">${l} (${n})</button>`;
    const cats = document.getElementById('mtCats');
    if (cats) cats.innerHTML = cb('all', 'All categories', byRoom.length) + Object.entries(CAT).map(([k, c]) => cb(k, c.i + ' ' + c.l, cc(k))).join('')
      + `<select onchange="mtRoom(this.value)" style="margin-left:auto;padding:6px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:12.5px"><option value="">All rooms</option>${rooms.map(r => `<option value="${esc(r)}"${r === roomFilter ? ' selected' : ''}>Room ${esc(r)}</option>`).join('')}</select>`;
    // one room picked: its whole history, every status, by category
    const sum = document.getElementById('mtRoomSummary');
    if (sum) {
      if (!roomFilter) sum.innerHTML = '';
      else {
        const all = tickets.filter(t => String(t.room) === roomFilter), byCat = {};
        all.forEach(t => { const k = t.category || 'other'; byCat[k] = (byCat[k] || 0) + 1; });
        const last = all.map(t => t.createdAt).sort().pop();
        sum.innerHTML = `<div style="background:#fff;border-radius:12px;padding:12px 16px;margin-bottom:10px;font-size:13px"><b>Room ${esc(roomFilter)}</b>: ${all.length} report${all.length === 1 ? '' : 's'} in total (${all.filter(t => t.status !== 'resolved').length} pending) — ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${(CAT[k] || CAT.other).i} ${(CAT[k] || CAT.other).l} ${n}`).join(' · ')}${last ? ' · last one ' + esc(when(last)) : ''}</div>`;
      }
    }
    const list = byRoom.filter(t => catFilter === 'all' || (t.category || 'other') === catFilter)
      .sort((a, b) => filter === 'open' ? ((a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1)) || String(a.createdAt).localeCompare(String(b.createdAt)) : String(b.createdAt).localeCompare(String(a.createdAt)));
    const box = document.getElementById('mtList'); if (!box) return;
    if (!list.length) { box.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;background:#fff;border-radius:12px">No reports here.</div>'; return; }
    box.innerHTML = list.map(t => {
      const s = ST[t.status] || ST.open;
      const notes = (t.notes || []).slice(-4).map(n => `<div style="font-size:11.5px;color:#6b7280">${esc(when(n.at))} · <b>${esc(n.by)}</b>: ${esc(n.text)}</div>`).join('');
      const gn = t.guestNotified ? `<div style="font-size:11.5px;color:#047857;margin-top:4px">Guest notified: WhatsApp ${esc(t.guestNotified.whatsapp || '-')} · email ${esc(t.guestNotified.email || '-')}</div>` : '';
      return `<div style="background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:10px;border-left:5px solid ${t.priority === 'urgent' ? '#dc2626' : '#94a3b8'}">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <span style="font-weight:700;font-size:15px">Room ${esc(t.room)}</span>
          <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;background:${s.bg};color:${s.c}">${s.l}</span>
          <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;background:#f1f5f9;color:#334155">${(CAT[t.category] || CAT.other).i} ${(CAT[t.category] || CAT.other).l}</span>
          ${t.priority === 'urgent' ? '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;background:#dc2626;color:#fff">URGENT</span>' : ''}
          <span style="font-size:12px;color:#6b7280">${esc(t.id)} · ${esc(when(t.createdAt))}${t.status !== 'resolved' ? ' · ' + ago(t.createdAt) + ' ago' : ''} · ${t.source === 'lana' ? '💬 Guest via WhatsApp' : '👤 ' + esc(t.reportedBy || 'Staff')}</span></div>
        <div style="font-size:14px;margin:8px 0 4px">${esc(t.problem)}</div>
        <div style="font-size:12px;color:#6b7280">${t.guestName ? 'Guest: ' + esc(t.guestName) : ''}${t.guestPhone ? ' · ' + esc(t.guestPhone) : ''}${t.assignedTo ? ' · Assigned to <b>' + esc(t.assignedTo) + '</b>' : ''}${t.resolvedAt ? ' · Resolved ' + esc(when(t.resolvedAt)) + ' by ' + esc(t.resolvedBy || '') : ''}</div>
        ${notes ? `<div style="margin-top:6px">${notes}</div>` : ''}${gn}
        ${t.status !== 'resolved' ? `<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          ${t.status === 'open' ? `<button class="btn btn-secondary btn-sm" onclick="mtSet('${t.id}','in_progress')">🔧 In progress</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="mtAssign('${t.id}')">👤 Assign</button>
          <button class="btn btn-secondary btn-sm" onclick="mtNote('${t.id}')">📝 Note</button>
          <select onchange="mtSetCat('${t.id}',this.value)" title="Category" style="padding:4px 8px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:12px">${Object.entries(CAT).map(([k, c]) => `<option value="${k}"${(t.category || 'other') === k ? ' selected' : ''}>${c.i} ${c.l}</option>`).join('')}</select>
          <button class="btn btn-primary btn-sm" onclick="mtSet('${t.id}','resolved')">✓ Resolved</button></div>` : ''}
      </div>`;
    }).join('');
  }
  async function update(id, extra, msg) {
    try { const d = await call('update', { id, ...extra }); showToast(msg || 'Saved ✓'); if (d.guest) showToast(`Resolved ✓ — guest notified: WhatsApp ${d.guest.whatsapp}, email ${d.guest.email}`); await load(true); }
    catch (e) { showToast('Not saved: ' + e.message); }
  }
  window.mtFilter = k => { filter = k; render(); };
  window.mtCat = k => { catFilter = k; render(); };
  window.mtRoom = r => { roomFilter = r; render(); };
  window.mtSetCat = (id, category) => update(id, { category }, 'Category saved ✓');
  window.mtSet = (id, status) => {
    const t = tickets.find(x => x.id === id); if (!t) return;
    if (status === 'resolved' && !confirm(`Mark room ${t.room} as Resolved?${t.guestPhone || t.guestEmail ? '\n\nThe guest gets the confirmation right now.' : ''}`)) return;
    update(id, { status });
  };
  window.mtAssign = id => { const t = tickets.find(x => x.id === id); const v = prompt('Assign to:', (t && t.assignedTo) || ''); if (v != null) update(id, { assignedTo: v }); };
  window.mtNote = id => { const v = prompt('Note:'); if (v && v.trim()) update(id, { note: v }); };
  window.mtNew = async () => {
    const room = prompt('Room:'); if (!room || !room.trim()) return;
    const problem = prompt('What is not working?'); if (!problem || !problem.trim()) return;
    const urgent = confirm('Is it URGENT? (OK = urgent, Cancel = normal)');
    try { const d = await call('create', { room, problem, priority: urgent ? 'urgent' : 'normal' }); showToast(`Report ${d.ticket.id} created — maintenance WhatsApp sent to ${(d.alert && d.alert.sent || []).filter(x => x.sent).length}`); filter = 'open'; await load(true); }
    catch (e) { showToast('Not created: ' + e.message); }
  };
  window.mtNumbers = async () => {
    const cur = numbers.map(p => `${p.name}: ${p.phone}`).join(', ');
    const v = prompt('Extra people who get the maintenance WhatsApp (besides the A/C report list), separated by commas.\nExample: Pedro: +52 984 123 4567, Luis: +52 984 765 4321', cur);
    if (v == null) return;
    const list = v.split(',').map(x => x.trim()).filter(Boolean).map(x => { const m = x.split(':'); return m.length > 1 ? { name: m[0].trim(), phone: m.slice(1).join(':').trim() } : { name: '', phone: x }; });
    try { const d = await call('numbers', { numbers: list }); numbers = d.numbers; showToast(`Saved: ${numbers.length} number(s)`); render(); } catch (e) { showToast('Not saved: ' + e.message); }
  };

  let tries = 0; const t = setInterval(() => { mount(); if (document.getElementById('maintenanceTabBtn') || ++tries > 60) clearInterval(t); }, 1000);
})();
