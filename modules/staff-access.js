// ===== staff-access.js — choose which sections each login can see (Darlene 2026-10-25) =====
// Loaded as a classic script AFTER admin-staff.js and the sidebar scripts; shares global scope. Standalone: admin-staff.js is not edited.
// Manage Staff > Edit now has "What this person can see": leave "Everything" ticked for no limit (as today), or untick it and tick only the sections that matter to them (for example just Menu
// and Transport). The choice is saved in app_store 'staff_access' = { "<staff id>": [sidebar button ids] } (separate from the old 'permissions' column, which is left alone).
// A limited login only sees its sections in the sidebar, cannot open the others, and does not get the team's floating buttons or alerts. Darlene's own login can never be limited.
// IMPORTANT: this controls what the portal SHOWS. It is not data security — the portal's data is readable by anyone who can run the page — so it is for keeping each person's screen focused, not for secrets.
const SA_KEY = 'staff_access';
let saData = {}, saLoaded = false, saTried = false;
const saEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const saKey = b => b.id || ((/switchTab\('([a-z-]+)'/.exec(b.getAttribute('onclick') || '') || [])[1] ? 'tab:' + /switchTab\('([a-z-]+)'/.exec(b.getAttribute('onclick'))[1] : '');   // buttons without an id are known by their section
function saTabs() {                                         // every sidebar section: button id + label
  const seen = new Set(), out = [];
  document.querySelectorAll('.tab-bar .tab-btn, #appBody .tab-btn').forEach(b => {
    const k = saKey(b); if (!k || seen.has(k) || k === 'staffSideBtn' || b.classList.contains('tab-btn-sub') && !/switchTab|hcOpen/.test(b.getAttribute('onclick') || '')) return; seen.add(k);
    const lab = (b.querySelector('.tab-label') || b).textContent.replace(/\s+/g, ' ').trim(); if (lab) out.push({ id: k, label: lab });
  });
  return out;
}
const saMe = () => { try { return getCurrentSession(); } catch (e) { return null; } };
const saIsOwner = s => !!s && (s.id === 'staff_001' || String(s.name || '').trim().toLowerCase() === 'darlene');
function saAllowed() {                                      // Set of allowed button ids for the signed-in person, or null = no limit
  const me = saMe(); if (!me || saIsOwner(me)) return null;
  const a = saData[me.id]; return Array.isArray(a) && a.length ? new Set(a) : null;
}
async function saLoad() {
  try { const { data } = await db.from('app_store').select('value').eq('key', SA_KEY).maybeSingle(); saData = (data && data.value && typeof data.value === 'object') ? data.value : {}; saLoaded = true; } catch (e) { console.warn('[staff-access]', e); }
  saApply();
}
function saBtnFor(tabId) { return [...document.querySelectorAll('.tab-btn')].find(b => (b.getAttribute('onclick') || '').includes("'" + tabId + "'") || b.id === tabId + 'TabBtn'); }
function saApply() {
  try {
    const allowed = saAllowed(); document.body.classList.toggle('sa-limited', !!allowed);
    if (!allowed) return;
    let firstOk = null;
    document.querySelectorAll('.tab-btn').forEach(b => { if (allowed.has(saKey(b))) { b.style.display = ''; if (!firstOk) firstOk = b; } else b.style.display = 'none'; });
    ['staffManageBtn', 'staffSideBtn', 'actClearBtn', 'adminSideSection'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
    const act = document.querySelector('.tab-panel.active'), actBtn = act && document.querySelector('.tab-btn.active');
    if (firstOk && (!actBtn || !allowed.has(saKey(actBtn)))) firstOk.click();
  } catch (e) { console.warn('[staff-access] apply', e); }
}
(function () {
  if (!document.getElementById('saCss')) { const st = document.createElement('style'); st.id = 'saCss'; st.textContent = 'body.sa-limited #qpBar,body.sa-limited #hcAlertChip,body.sa-limited #sdbChip{display:none!important}'; document.head.appendChild(st); }
  if (typeof switchTab === 'function') {
    const o = window.switchTab;
    window.switchTab = function (id, btn) {
      const allowed = saAllowed();
      if (allowed) { const b = btn && saKey(btn) ? btn : saBtnFor(id); if (!b || !allowed.has(saKey(b))) { try { showToast("This login can't open that section."); } catch (e) {} return; } }
      return o.apply(this, arguments);
    };
  }
  setInterval(() => { if (saMe()) { if (!saLoaded && !saTried) { saTried = true; saLoad(); } else saApply(); } }, 1500);
  setTimeout(() => { if (saMe() && !saTried) { saTried = true; saLoad(); } }, 800);

  // ---- the Edit Staff form ----
  function box() {
    const m = document.getElementById('editStaffModal'); if (!m || document.getElementById('saBox')) return;
    const role = document.getElementById('esRole'), row = role && role.closest('.frow'); if (!row) return;
    const d = document.createElement('div'); d.id = 'saBox'; d.className = 'frow';
    d.innerHTML = '<div class="fg"><label>What this person can see</label><div id="saBody" style="border:1.5px solid #e8dfd4;border-radius:10px;padding:10px 12px;font-size:13px"></div></div>';
    row.insertAdjacentElement('afterend', d);
  }
  function draw(staffId) {
    box(); const body = document.getElementById('saBody'); if (!body) return;
    const cur = Array.isArray(saData[staffId]) && saData[staffId].length ? saData[staffId] : null, owner = staffId === 'staff_001';
    if (owner) { body.innerHTML = 'The owner login always sees everything.'; return; }
    body.innerHTML = `<label style="display:flex;gap:8px;align-items:center;font-weight:700;cursor:pointer"><input type="checkbox" id="saAll" ${cur ? '' : 'checked'} onchange="document.getElementById('saList').style.display=this.checked?'none':'grid'"> Everything (no limit)</label>
      <div id="saList" style="display:${cur ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:4px 12px;margin-top:8px;max-height:220px;overflow:auto">${saTabs().map(t => `<label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" class="saTab" value="${saEsc(t.id)}" ${cur && cur.includes(t.id) ? 'checked' : ''}> ${saEsc(t.label)}</label>`).join('')}</div>
      <div style="font-size:11.5px;color:#6b7280;margin-top:8px">They sign in as usual and only see the ticked sections. Takes effect the next time they sign in or refresh.</div>`;
  }
  ['openEditStaff', 'openAddStaff'].forEach(fn => {
    const o = window[fn]; if (typeof o !== 'function') return;
    window[fn] = function (id) { const r = o.apply(this, arguments); try { if (!saLoaded) saLoad(); draw(fn === 'openEditStaff' ? id : ''); } catch (e) {} return r; };
  });
  const sv = window.saveStaffMember;
  if (typeof sv === 'function') window.saveStaffMember = async function () {
    const all = document.getElementById('saAll'), picked = all && !all.checked ? [...document.querySelectorAll('#saBody .saTab:checked')].map(i => i.value) : null;
    const hadBox = !!all, username = ((document.getElementById('esUser') || {}).value || '').trim().toLowerCase(), prevId = (document.getElementById('esId') || {}).value || '';
    if (hadBox && picked && !picked.length) { try { showToast('Tick at least one section, or choose Everything.'); } catch (e) {} return; }
    const r = await sv.apply(this, arguments);
    try {
      if (!hadBox) return r;
      const s = (typeof staffAccounts !== 'undefined' ? staffAccounts : []).find(a => (prevId && a.id === prevId) || a.username === username); if (!s || saIsOwner(s)) return r;
      const { data } = await db.from('app_store').select('value').eq('key', SA_KEY).maybeSingle(); const cur = (data && data.value && typeof data.value === 'object') ? data.value : {};
      if (picked) cur[s.id] = picked; else delete cur[s.id];
      const { error } = await db.from('app_store').upsert({ key: SA_KEY, value: cur, updated_at: new Date().toISOString() }); if (error) throw error;
      saData = cur;
    } catch (e) { try { showToast('Could not save what they can see: ' + (e.message || e)); } catch (x) {} }
    return r;
  };
})();
