// ===== teacher-transport-note.js — note at the top of the teacher's My Transportation page (Darlene 2026-10-29) =====
// Loaded as a classic script AFTER teacher-transport-edit.js; shares global scope. Standalone: it only wraps _renderTeacherTransportInner to put a note box at the top.
// The note has two parts: (1) how the teacher edits a guest's transportation (the ✏ Edit button, and the 24-hour lock), and (2) where to meet the driver at Cancún (CUN)
// and Tulum (TQO). The meeting-point wording is typed by the team, not built in: an admin sees an "Edit" button on the note, types the text for each airport, and it is
// saved in app_store 'transport_meeting_points' ({cancun, tulum, by, at}) for every teacher. An airport with no text yet is hidden from teachers (admins see a prompt to fill it in).
(function () {
  const KEY = 'transport_meeting_points';
  let cache = null, cacheAt = 0, loading = null;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const isAdmin = () => { try { return typeof IS_TEACHER_MODE === 'undefined' || !IS_TEACHER_MODE || sessionStorage.getItem('ama_admin_viewing') === '1'; } catch (e) { return false; } };

  async function load(force) {
    if (!force && cache && Date.now() - cacheAt < 60000) return cache;
    if (loading) return loading;
    loading = (async () => {
      try { const { data } = await db.from('app_store').select('value').eq('key', KEY).maybeSingle(); cache = (data && data.value && typeof data.value === 'object') ? data.value : {}; }
      catch (e) { cache = cache || {}; }
      cacheAt = Date.now(); loading = null; return cache;
    })();
    return loading;
  }
  const para = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n\n').filter(p => p.trim()).map(p => `<div style="margin-top:4px">${p.replace(/\n/g, '<br>')}</div>`).join('');

  function noteHtml(v) {
    const adm = isAdmin();
    const airport = (k, label) => {
      const t = (v[k] || '').trim();
      if (!t && !adm) return '';
      return `<div style="flex:1;min-width:240px;background:#fff;border:1px solid #e8dfd4;border-radius:10px;padding:10px 12px"><div style="font-size:12px;font-weight:800;color:#0f766e;text-transform:uppercase;letter-spacing:.5px">${label}</div>${t ? `<div style="font-size:13px;color:#2d2520;line-height:1.6">${para(t)}</div>` : '<div style="font-size:12.5px;color:#b45309;margin-top:4px">Not filled in yet — click “Edit meeting points” to add it. Teachers don’t see this airport until it has text.</div>'}</div>`;
    };
    const meet = airport('cancun', 'Cancún (CUN)') + airport('tulum', 'Tulum (TQO)');
    return `<div id="ttnBox" style="text-align:left;margin:0 0 18px;padding:14px 18px;background:#f0fdfa;border:1.5px solid #99f6e4;border-radius:12px;font-family:Jost,sans-serif;color:#134e4a">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px"><div style="font-size:15px;font-weight:800">📌 Before you start — transportation</div>${adm ? '<button type="button" onclick="ttnEdit()" style="padding:5px 11px;border:1.5px solid #5eead4;border-radius:8px;background:#fff;color:#0f766e;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">✏ Edit meeting points</button>' : ''}</div>
      <div style="font-size:13px;line-height:1.65"><b>Changing a guest’s times:</b> click <b>✏ Edit</b> at the end of the guest’s row, change the arrival or departure date, time, airport or flight, and press <b>Save</b>. If they are arranging their own ride, tick “Own transport”.
        <br>Changes close <b>24 hours before</b> each arrival or departure so our drivers can be scheduled — after that the row shows 🔒 and you’ll need to message the Amansala team.</div>
      ${meet ? `<div style="font-size:13px;font-weight:800;margin:12px 0 6px">Where to meet your driver</div><div style="display:flex;gap:10px;flex-wrap:wrap">${meet}</div>` : ''}
      ${(v.help || '').trim() ? `<div style="font-size:13px;line-height:1.6;margin-top:10px"><b>Need assistance?</b>${para(v.help)}</div>` : ''}
    </div>`;
  }

  async function put(bkId) {
    const wrap = document.getElementById('teacherTransportContent'); if (!wrap) return;
    const v = await load();
    const old = document.getElementById('ttnBox'); if (old) old.remove();
    // only on a rendered roster (not the "no guests yet" message)
    if (!wrap.querySelector('table') && !wrap.querySelector('div')) return;
    wrap.insertAdjacentHTML('afterbegin', noteHtml(v));
  }

  window.ttnEdit = async function () {
    if (!isAdmin()) return;
    const v = await load(true);
    const m = document.createElement('div'); m.id = 'ttnModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px';
    const ta = (id, val) => `<textarea id="${id}" rows="5" style="width:100%;box-sizing:border-box;padding:9px 11px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:Jost,sans-serif;font-size:13.5px;line-height:1.55;resize:vertical">${esc(val || '')}</textarea>`;
    m.innerHTML = `<div style="background:#fff;border-radius:14px;width:100%;max-width:560px;max-height:90vh;overflow:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:Jost,sans-serif">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:17px">Where teachers meet the driver</b><button type="button" onclick="document.getElementById('ttnModal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#6b7280">×</button></div>
      <div style="font-size:12.5px;color:#6b7280;margin-bottom:12px">Shown at the top of every teacher’s My Transportation page. Leave a blank line between paragraphs; **word** makes bold. An airport with no text is hidden from teachers.</div>
      <label style="display:block;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:3px">Cancún (CUN)</label>${ta('ttn-c', v.cancun)}
      <label style="display:block;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin:12px 0 3px">Tulum (TQO)</label>${ta('ttn-t', v.tulum)}
      <label style="display:block;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin:12px 0 3px">Need assistance? (shown under both airports)</label>${ta('ttn-h', v.help)}
      <div id="ttnErr" style="display:none;color:#b91c1c;font-size:12.5px;font-weight:600;margin-top:8px"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button type="button" onclick="document.getElementById('ttnModal').remove()" style="padding:9px 16px;border-radius:9px;border:none;background:#f3f4f6;color:#374151;font-family:inherit;font-size:13.5px;font-weight:600;cursor:pointer">Cancel</button><button type="button" id="ttnSave" onclick="ttnSave()" style="padding:9px 18px;border-radius:9px;border:none;background:#0f766e;color:#fff;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer">Save</button></div></div>`;
    document.body.appendChild(m);
  };
  window.ttnSave = async function () {
    const btn = document.getElementById('ttnSave'), err = document.getElementById('ttnErr');
    const val = { cancun: (document.getElementById('ttn-c').value || '').trim(), tulum: (document.getElementById('ttn-t').value || '').trim(), help: (document.getElementById('ttn-h').value || '').trim() };
    val.by = (() => { try { const s = getCurrentSession(); return (s && s.name) || 'Admin'; } catch (e) { return 'Admin'; } })(); val.at = new Date().toISOString();
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const { error } = await db.from('app_store').upsert({ key: KEY, value: val, updated_at: val.at });
      if (error) throw error;
      cache = val; cacheAt = Date.now();
      document.getElementById('ttnModal').remove();
      if (typeof showToast === 'function') showToast('Meeting points saved ✓');
      const old = document.getElementById('ttnBox'); if (old) old.outerHTML = noteHtml(val);
    } catch (e) { err.textContent = 'Could not save: ' + (e.message || e); err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Save'; }
  };

  const prev = window._renderTeacherTransportInner;
  if (typeof prev === 'function') {
    window._renderTeacherTransportInner = function (bkId) {
      const r = prev.apply(this, arguments);
      try { put(bkId); } catch (e) { console.warn('[teacher-transport-note]', e); }
      return r;
    };
  }
})();
