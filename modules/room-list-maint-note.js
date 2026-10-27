// ===== room-list-maint-note.js — "Retoque y check de mantenimiento" note on the Room List (Darlene 2026-10-27) =====
// Staff only: retreat leaders (teacher mode) never see it. One note per retreat (touch-ups and the maintenance check before the group arrives), plus a "Hecho" tick,
// stored in app_store 'room_maint_notes' [bookingId] = { note, done, by, at }. Separate from the Special notes box, so nothing else is read or changed.
(function () {
  const KEY = 'room_maint_notes';
  let cur = null, loadedAt = 0;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const me = () => (typeof getCurrentSession === 'function' && (getCurrentSession() || {}).name) || 'Staff';
  async function readAll() { const { data } = await db.from('app_store').select('value').eq('key', KEY).maybeSingle(); return (data && data.value && typeof data.value === 'object') ? data.value : {}; }
  function bar() {
    let el = document.getElementById('rlMaintBar'); if (el) return el;
    const anchor = document.getElementById('rlNotesBar') || document.getElementById('regStatsBar'); if (!anchor || !anchor.parentNode) return null;
    el = document.createElement('div'); el.id = 'rlMaintBar'; el.style.cssText = 'display:none;padding:8px 24px;background:#eff6ff;border-bottom:1px solid #93c5fd;flex-shrink:0';
    anchor.parentNode.insertBefore(el, anchor.nextSibling); return el;
  }
  function draw(rec) {
    const el = bar(); if (!el) return;
    const n = (rec && rec.note) || '', done = !!(rec && rec.done);
    const by = rec && rec.by ? 'Última actualización: ' + esc(rec.by) + (rec.at ? ' · ' + new Date(rec.at).toLocaleString('es-MX', { timeZone: 'America/Cancun', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '') : '';
    el.innerHTML = '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:4px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#1e40af">🛠 Retoque y check de mantenimiento <span style="font-weight:600;text-transform:none;letter-spacing:0;color:#2563eb">· solo el equipo</span></div>'
      + '<label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:' + (done ? '#047857' : '#1e40af') + ';cursor:pointer"><input type="checkbox" id="rlMaintDone" ' + (done ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:#047857"> Hecho</label></div>'
      + '<textarea id="rlMaintBox" rows="' + (n ? Math.min(6, Math.max(2, n.split('\n').length + 1)) : 2) + '" placeholder="Qué hay que retocar o revisar antes de que llegue el grupo (pintura, aire, luz, plomería…)" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #93c5fd;border-radius:8px;font-family:Jost,sans-serif;font-size:14px;background:#fff;resize:vertical">' + esc(n) + '</textarea>'
      + '<div style="font-size:11px;color:#1e40af;margin-top:3px">' + by + '</div>';
    el.style.display = 'block';
    const ta = document.getElementById('rlMaintBox'), ck = document.getElementById('rlMaintDone');
    if (ta) ta.onchange = () => save();
    if (ck) ck.onchange = () => save();
  }
  async function save() {
    const id = cur; if (!id) return;
    const ta = document.getElementById('rlMaintBox'), ck = document.getElementById('rlMaintDone');
    try {
      const all = await readAll(); const r = all[id] = all[id] || {};
      r.note = String((ta && ta.value) || '').trim(); r.done = !!(ck && ck.checked); r.by = me(); r.at = new Date().toISOString();
      const { error } = await db.from('app_store').upsert({ key: KEY, value: all, updated_at: new Date().toISOString() }); if (error) throw error;
      draw(r); try { showToast('Guardado'); } catch (e) {}
    } catch (e) { try { showToast('No se pudo guardar: ' + (e.message || e)); } catch (x) {} }
  }
  async function refresh() {
    try {
      const bk = typeof regSelBk !== 'undefined' ? regSelBk : null, el = bar(); if (!el) return;
      if (!bk || bk.bookingType === 'room_only' || (typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE) || document.getElementById('regStatsBar').style.display === 'none') { el.style.display = 'none'; cur = null; return; }
      const ta = document.getElementById('rlMaintBox');
      if (ta && document.activeElement === ta) return;   // never overwrite while typing
      if (cur === bk.id && ta && Date.now() - loadedAt < 15000) return;
      cur = bk.id; loadedAt = Date.now();
      const all = await readAll(); if (cur !== bk.id) return;
      const t = document.getElementById('rlMaintBox'); if (t && document.activeElement === t) return;
      draw(all[bk.id]);
    } catch (e) { console.warn('[room-list-maint-note]', e); }
  }
  const orig = window.regRender;
  if (typeof orig === 'function') window.regRender = function () { const r = orig.apply(this, arguments); try { const bk = typeof regSelBk !== 'undefined' ? regSelBk : null; if (!bk || bk.id !== cur) loadedAt = 0; refresh(); } catch (e) {} return r; };
  setInterval(refresh, 5000);
})();
