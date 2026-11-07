// ===== data-history.js — "History": every change the database kept (sql/data_history.sql), and Restore (Jorge 2026-11-07) =====
// Who changed what and when, on reservations, guests, folios, charges, payments, transport, online stays, commissions and the
// portal's saved data (spa appointments, menu, settings...). "View" shows each field before → after; "Restore" puts back what
// that change replaced or deleted (and is kept in the history too). Admin logins only. Data: netlify/functions/data-history.js.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tok = () => { try { return sessionStorage.getItem('amansala_staff_token') || ''; } catch (e) { return ''; } };
  const isAdmin = () => { try { return JSON.parse(sessionStorage.getItem('amansala_staff_session') || '{}').role === 'admin'; } catch (e) { return false; } };
  const call = async (action, extra) => {
    const r = await fetch('/.netlify/functions/data-history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok(), action, ...(extra || {}) }) });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Error'); return d;
  };
  const when = t => { try { return new Date(t).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' }); } catch (e) { return ''; } };
  const TBL = { '': 'Everything', bookings: 'Reservations', registrations: 'Guests / rooms', folios: 'Folios', folio_items: 'Charges & payments (folio lines)', payments: 'Retreat payments', transport: 'Transport', booking_requests: 'Online stays', commissions: 'Commissions', app_store: 'Saved data (spa, menu, settings…)', room_types: 'Room types & rates', be_rates: 'Revenue Manager prices', booking_engine_settings: 'Booking Engine settings', be_discount_codes: 'Discount codes', restaurant_layouts: 'Restaurant layouts', payment_shortlinks: 'Payment links' };
  let items = [], f = { tbl: '', q: '' }, openId = null, detail = null;

  function mount() {
    if (document.getElementById('historyTabBtn') || !isAdmin()) return;
    const anchor = document.getElementById('maintenanceTabBtn') || document.getElementById('housekeepingTabBtn'); if (!anchor) return;
    const btn = document.createElement('button'); btn.className = 'tab-btn'; btn.id = 'historyTabBtn';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg><span class="tab-label">History</span>';
    btn.onclick = () => switchTab('history', btn);
    anchor.after(btn);
    const panel = document.createElement('div'); panel.className = 'tab-panel'; panel.id = 'tab-history'; panel.style.flexDirection = 'column';
    panel.innerHTML = `<div style="flex:1;overflow-y:auto;padding:28px 36px;background:#f5f1eb">
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:600;color:#2d2520;margin:0">History</h2>
      <p style="font-size:12.5px;color:#8a7e74;margin:4px 0 16px">Every change kept by the database — who, when and what was there before. Restore puts back what a change replaced or deleted.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <select id="dhTbl" style="padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">${Object.entries(TBL).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
        <input id="dhQ" placeholder="Search: guest, room, description, key…" style="flex:1;min-width:220px;padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">
        <button class="btn btn-primary btn-sm" onclick="dhSearch()">Search</button></div>
      <div id="dhList"></div></div>`;
    const hk = document.getElementById('tab-housekeeping');
    (hk ? hk.parentNode : document.body).appendChild(panel);
    panel.querySelector('#dhQ').addEventListener('keydown', e => { if (e.key === 'Enter') window.dhSearch(); });
    const prev = window.switchTab;
    window.switchTab = function (id, b) {
      if (id === 'history') {
        localStorage.setItem('ama_last_tab', id);
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
        panel.classList.add('active'); (b || btn).classList.add('active');
        load(); return;
      }
      return prev.apply(this, arguments);
    };
    if (localStorage.getItem('ama_last_tab') === 'history') setTimeout(() => window.switchTab('history', btn), 400);
  }
  async function load() {
    const box = document.getElementById('dhList'); if (!box) return;
    box.innerHTML = '<div style="padding:30px;text-align:center;color:#9ca3af">Loading…</div>';
    try {
      const d = await call('list', f);
      if (d.notInstalled) { box.innerHTML = '<div style="padding:20px;background:#fff7ed;border-radius:12px;color:#9a3412">The history is not switched on yet — run <b>sql/data_history.sql</b> in Supabase.</div>'; return; }
      items = d.items || []; render();
    } catch (e) { box.innerHTML = `<div style="padding:20px;color:#b91c1c">${esc(e.message)}</div>`; }
  }
  const short = v => { if (v == null) return '<i style="color:#9ca3af">empty</i>'; const s = typeof v === 'string' ? v : JSON.stringify(v, null, 1); return esc(s.length > 1500 ? s.slice(0, 1500) + ' …' : s); };
  function render() {
    const box = document.getElementById('dhList'); if (!box) return;
    if (!items.length) { box.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;background:#fff;border-radius:12px">No changes found.</div>'; return; }
    box.innerHTML = items.map(h => `<div style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px;border-left:4px solid ${h.op === 'DELETE' ? '#dc2626' : '#94a3b8'}">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12.5px">
        <span style="color:#6b7280;min-width:150px">${esc(when(h.at))}</span>
        <b style="color:#1f2937">${esc(/^(postgres|service_role|authenticator|supabase_admin)$/.test(h.who || '') ? 'System' : (h.who || '?'))}</b>
        <span style="font-size:11px;font-weight:700;padding:1px 8px;border-radius:10px;${h.op === 'DELETE' ? 'background:#fef2f2;color:#b91c1c' : 'background:#f1f5f9;color:#334155'}">${h.op === 'DELETE' ? 'Deleted' : 'Changed'}</span>
        <span style="color:#6b7280">${esc(TBL[h.tbl] || h.tbl)}</span>
        <span style="color:#1f2937">${esc(h.label)}</span>
        <span style="color:#9ca3af">${h.op === 'DELETE' ? '' : esc((h.changed || []).join(', '))}</span>
        <span style="margin-left:auto;display:flex;gap:6px"><button class="btn btn-secondary btn-sm" onclick="dhView(${h.id})">${openId === h.id ? 'Hide' : 'View'}</button><button class="btn btn-secondary btn-sm" style="color:#b45309" onclick="dhRestore(${h.id})">↩ Restore</button></span></div>
      ${openId === h.id && detail ? `<div style="margin-top:10px;font-size:12px">${detail.fields.map(x => `<div style="display:grid;grid-template-columns:140px 1fr 1fr;gap:8px;padding:6px 0;border-top:1px solid #f1f5f9"><b>${esc(x.field)}</b><pre style="margin:0;white-space:pre-wrap;background:#fef2f2;padding:6px;border-radius:6px;max-height:220px;overflow:auto">${short(x.before)}</pre><pre style="margin:0;white-space:pre-wrap;background:#ecfdf5;padding:6px;border-radius:6px;max-height:220px;overflow:auto">${short(x.after)}</pre></div>`).join('')}
        <div style="font-size:11px;color:#9ca3af;margin-top:4px">Red = before · green = after this change${detail.tbl === 'app_store' ? ' (only the records that changed)' : ''}</div></div>` : ''}
    </div>`).join('');
  }
  window.dhSearch = () => { f = { tbl: document.getElementById('dhTbl').value, q: document.getElementById('dhQ').value }; openId = null; load(); };
  window.dhView = async id => {
    if (openId === id) { openId = null; detail = null; render(); return; }
    try { detail = (await call('get', { id })).item; openId = id; render(); } catch (e) { showToast('Could not open: ' + e.message); }
  };
  window.dhRestore = async id => {
    const h = items.find(x => x.id === id); if (!h) return;
    if (!confirm(`Restore what this change replaced?\n\n${h.label}\n${h.op === 'DELETE' ? 'It was deleted — it comes back.' : 'Fields: ' + (h.changed || []).join(', ')}\nChanged by ${h.who || '?'} on ${when(h.at)}.\n\nThe restore is kept in the History too.`)) return;
    try { const d = await call('restore', { id }); showToast('Restored ✓ — ' + d.done + '. Refresh the screen to see it.'); load(); } catch (e) { showToast('Not restored: ' + e.message); }
  };
  let tries = 0; const t = setInterval(() => { mount(); if (document.getElementById('historyTabBtn') || ++tries > 60) clearInterval(t); }, 1000);
})();
