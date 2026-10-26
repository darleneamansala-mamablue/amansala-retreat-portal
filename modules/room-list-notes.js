// ===== room-list-notes.js — visible "Special notes" box on the Room List, shared with the Host Checklist (Darlene 2026-10-26) =====
// Staff only: retreat leaders (teacher mode) never see it. One note per retreat, stored in app_store 'host_checklists' [bookingId].notes (+ notesBy / notesAt): exactly the record the checklist's own notes box reads and writes,
// so what is typed here shows on the checklist (tab, retreat window, pop-up) and the other way round. Only that retreat's notes fields are changed, never its ticks.
(function () {
  const KEY = 'host_checklists';
  let cur = null, last = '', loadedAt = 0;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const me = () => (typeof getCurrentSession === 'function' && (getCurrentSession() || {}).name) || 'Staff';
  async function readAll() { const { data } = await db.from('app_store').select('value').eq('key', KEY).maybeSingle(); return (data && data.value && typeof data.value === 'object') ? data.value : {}; }
  function bar() {
    let el = document.getElementById('rlNotesBar'); if (el) return el;
    const anchor = document.getElementById('regStatsBar'); if (!anchor || !anchor.parentNode) return null;
    el = document.createElement('div'); el.id = 'rlNotesBar'; el.style.cssText = 'display:none;padding:8px 24px;background:#fffbeb;border-bottom:1px solid #fcd34d;flex-shrink:0';
    anchor.parentNode.insertBefore(el, anchor.nextSibling); return el;
  }
  function draw(rec) {
    const el = bar(); if (!el) return;
    const n = (rec && rec.notes) || '', by = rec && rec.notesBy ? 'Last updated by ' + esc(rec.notesBy) + (rec.notesAt ? ' · ' + new Date(rec.notesAt).toLocaleString('en-US', { timeZone: 'America/Cancun', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '') : 'Type and click outside the box. It saves and also shows on the Host Checklist.';
    el.innerHTML = '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#92400e;margin-bottom:4px">📝 Special notes for this retreat <span style="font-weight:600;text-transform:none;letter-spacing:0;color:#b45309">· also on the Host Checklist</span></div>'
      + '<textarea id="rlNotesBox" rows="' + (n ? Math.min(6, Math.max(2, n.split('\n').length + 1)) : 2) + '" placeholder="Anything the team must know for this retreat (allergies, VIPs, special requests, changes…)" style="width:100%;box-sizing:border-box;padding:7px 10px;border:1.5px solid #fcd34d;border-radius:8px;background:#fff;font-family:inherit;font-size:13px;resize:vertical">' + esc(n) + '</textarea>'
      + '<div id="rlNotesBy" style="font-size:11px;color:#92400e;margin-top:3px">' + by + '</div>';
    el.style.display = 'block'; last = n;
    const ta = document.getElementById('rlNotesBox'); if (ta) ta.onchange = () => save(ta.value);
  }
  async function save(text) {
    const id = cur; if (!id) return;
    try {
      const all = await readAll(); const r = all[id] = all[id] || { done: {}, extras: [] }; r.done = r.done || {}; r.extras = r.extras || [];
      r.notes = String(text || '').trim(); r.notesBy = me(); r.notesAt = new Date().toISOString();
      const { error } = await db.from('app_store').upsert({ key: KEY, value: all, updated_at: new Date().toISOString() }); if (error) throw error;
      try { if (typeof hcState !== 'undefined') { hcState.data = all; if (typeof hcRender === 'function') hcRender(); if (typeof hcRenderBox === 'function') hcRenderBox(); } } catch (e) {}
      draw(r); try { showToast('Notes saved'); } catch (e) {}
    } catch (e) { try { showToast('Could not save notes: ' + (e.message || e)); } catch (x) {} }
  }
  async function refresh() {
    try {
      const bk = typeof regSelBk !== 'undefined' ? regSelBk : null, el = bar(); if (!el) return;
      if (!bk || bk.bookingType === 'room_only' || (typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE) || document.getElementById('regStatsBar').style.display === 'none') { el.style.display = 'none'; cur = null; return; }
      const ta = document.getElementById('rlNotesBox');
      if (ta && document.activeElement === ta) return;   // never overwrite while typing
      if (cur === bk.id && ta && Date.now() - loadedAt < 15000) return;
      cur = bk.id; loadedAt = Date.now();
      const all = await readAll(); if (cur !== bk.id) return;
      const t = document.getElementById('rlNotesBox'); if (t && document.activeElement === t) return;
      draw(all[bk.id]);
    } catch (e) { console.warn('[room-list-notes]', e); }
  }
  const orig = window.regRender;
  if (typeof orig === 'function') window.regRender = function () { const r = orig.apply(this, arguments); try { const bk = typeof regSelBk !== 'undefined' ? regSelBk : null; if (!bk || bk.id !== cur) loadedAt = 0; refresh(); } catch (e) {} return r; };
  setInterval(refresh, 5000);
})();
