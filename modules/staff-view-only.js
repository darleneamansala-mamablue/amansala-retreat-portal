// ===== staff-view-only.js — an "Admin — view only" access level next to "Admin full access" (Darlene 2026-10-26) =====
// Manage Staff > Edit has "Access level": Admin full access (as today) or Admin — view only. The choice is saved in app_store 'staff_view_only' = { "<staff id>": true }.
// A view-only login can open every section it is allowed to see (combine with "What this person can see" in staff-access.js) but nothing it does is saved: every write to the database from that
// browser (insert / update / upsert / delete / rpc, and direct non-GET calls to the data service) is refused with a toast, and buttons that add, save, delete or send are blocked with the same note.
// A blue "View only" bar shows at the top. The owner login (Darlene) can never be view-only. IMPORTANT: like staff-access.js this is enforced inside the portal page, not on the server, so it keeps
// honest users from changing things by accident; it is not protection against someone technical.
(function () {
  const KEY = 'staff_view_only';
  let voData = {}, voLoaded = false, voTried = false, voOn = false;
  const me = () => { try { return getCurrentSession(); } catch (e) { return null; } };
  const owner = s => !!s && (s.id === 'staff_001' || String(s.name || '').trim().toLowerCase() === 'darlene');
  const toast = m => { try { showToast(m); } catch (e) {} };
  let lastToast = 0; const nope = () => { const t = Date.now(); if (t - lastToast > 1500) { lastToast = t; toast("View only — this login can look but can't change anything."); } };

  // ---- data layer: refuse writes while view-only ----
  const blocked = () => { const r = { data: null, error: { message: 'View only login — changes are not allowed', code: 'VIEW_ONLY' } };
    const p = new Proxy(function () {}, { get(_, k) { if (k === 'then') return (res) => Promise.resolve(r).then(res); return () => p; }, apply() { return p; } }); return p; };
  try {
    if (typeof db !== 'undefined' && db && typeof db.from === 'function') {
      const of = db.from.bind(db);
      db.from = function (table) {
        const q = of(table); if (table === 'activity_log') return q;
        ['insert', 'update', 'upsert', 'delete'].forEach(m => { const om = q[m]; if (typeof om === 'function') q[m] = function () { if (voOn) { nope(); return blocked(); } return om.apply(this, arguments); }; });
        return q;
      };
      if (typeof db.rpc === 'function') { const orpc = db.rpc.bind(db); db.rpc = function () { if (voOn) { nope(); return blocked(); } return orpc.apply(this, arguments); }; }
    }
  } catch (e) { console.warn('[staff-view-only] db', e); }
  const of = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = String((input && input.url) || input || ''), method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (voOn && method !== 'GET' && method !== 'HEAD' && /supabase\.co\/rest\//.test(url) && !/activity_log/.test(url)) { nope(); return Promise.resolve(new Response(JSON.stringify({ message: 'View only' }), { status: 403 })); }
    } catch (e) {}
    return of.apply(this, arguments);
  };

  // ---- buttons that change things are blocked (navigation, printing, closing, date arrows stay usable) ----
  const CHANGE = /(^|\b)(save|add|\+|delete|remove|✕|✖|cancel booking|confirm|send|charge|create|new |edit|update|assign|move|swap|⇄|mark|complete|approve|check.?in|check.?out|import|upload|submit|apply|record|pay|refund|merge|archive|sort|lock|publish)/i;
  const SAFE = /(print|close|back|prev|next|today|‹|›|×|search|filter|show|hide|view|download|export|refresh|sign out|staff)/i;
  document.addEventListener('click', ev => {
    if (!voOn) return;
    const b = ev.target.closest && ev.target.closest('button,.btn,[role=button],input[type=button],input[type=submit]'); if (!b) return;
    if (b.closest('.tab-btn,#sideNav,.tab-bar,#mlBurger') || b.classList.contains('tab-btn')) return;
    if (/switchTab\(|closeModal|printDay|menuPrint|print\(/i.test(b.getAttribute('onclick') || '')) return;
    const t = (b.textContent || b.value || b.title || '').replace(/\s+/g, ' ').trim();
    if (CHANGE.test(t) && !SAFE.test(t.replace(CHANGE, ''))) { ev.stopPropagation(); ev.preventDefault(); nope(); }
  }, true);

  function bar() {
    let e = document.getElementById('voBar');
    if (voOn && !e) { e = document.createElement('div'); e.id = 'voBar'; e.textContent = '👁 View only — you can look around, but nothing you do will be saved.';
      e.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99998;background:#1e40af;color:#fff;text-align:center;font:600 13px Jost,sans-serif;padding:7px 10px;pointer-events:none'; document.body.appendChild(e); }
    if (!voOn && e) e.remove();
  }
  async function load() {
    try { const { data } = await db.from('app_store').select('value').eq('key', KEY).maybeSingle(); voData = (data && data.value && typeof data.value === 'object') ? data.value : {}; voLoaded = true; } catch (e) { console.warn('[staff-view-only]', e); }
    apply();
  }
  function apply() { const s = me(); voOn = !!s && !owner(s) && !!voData[s.id]; document.body.classList.toggle('vo-on', voOn); bar(); }
  setInterval(() => { if (me()) { if (!voLoaded && !voTried) { voTried = true; load(); } else apply(); } }, 1500);
  setTimeout(() => { if (me() && !voTried) { voTried = true; load(); } }, 800);

  // ---- Edit Staff form: "Access level" ----
  function box(staffId) {
    const m = document.getElementById('editStaffModal'); if (!m) return;
    let d = document.getElementById('voBox');
    if (!d) { const role = document.getElementById('esRole'), row = role && role.closest('.frow'); if (!row) return;
      d = document.createElement('div'); d.id = 'voBox'; d.className = 'frow'; row.insertAdjacentElement('afterend', d); }
    if (staffId === 'staff_001') { d.innerHTML = '<div class="fg"><label>Access level</label><div style="font-size:13px">The owner login always has full access.</div></div>'; return; }
    d.innerHTML = '<div class="fg"><label>Access level</label><select id="voSel"><option value="full">Admin full access — can change things</option><option value="view">Admin — view only (can see, cannot change)</option></select>' +
      '<div style="font-size:11.5px;color:#6b7280;margin-top:5px">Use with “What this person can see” below to pick the sections. Takes effect the next time they sign in or refresh.</div></div>';
    const sel = d.querySelector('#voSel'); if (sel) sel.value = voData[staffId] ? 'view' : 'full';
  }
  ['openEditStaff', 'openAddStaff'].forEach(fn => {
    const o = window[fn]; if (typeof o !== 'function') return;
    window[fn] = function (id) { const r = o.apply(this, arguments); try { if (!voLoaded) load(); setTimeout(() => box(fn === 'openEditStaff' ? id : ''), 0); } catch (e) {} return r; };
  });
  const sv = window.saveStaffMember;
  if (typeof sv === 'function') window.saveStaffMember = async function () {
    const sel = document.getElementById('voSel'), view = sel && sel.value === 'view';
    const username = ((document.getElementById('esUser') || {}).value || '').trim().toLowerCase(), prevId = (document.getElementById('esId') || {}).value || '';
    const r = await sv.apply(this, arguments);
    try {
      if (!sel) return r;
      const s = (typeof staffAccounts !== 'undefined' ? staffAccounts : []).find(a => (prevId && a.id === prevId) || a.username === username); if (!s || owner(s)) return r;
      const { data } = await db.from('app_store').select('value').eq('key', KEY).maybeSingle(); const cur = (data && data.value && typeof data.value === 'object') ? data.value : {};
      if (view) cur[s.id] = true; else delete cur[s.id];
      const { error } = await db.from('app_store').upsert({ key: KEY, value: cur, updated_at: new Date().toISOString() }); if (error) throw error;
      voData = cur; apply();
    } catch (e) { toast('Could not save the access level: ' + (e.message || e)); }
    return r;
  };
})();
