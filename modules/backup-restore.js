// ===== backup-restore.js — Settings > Backup & Restore (Jorge 2026-11-05) =====
// "que un dia se dane algo solo le de restore y todo este ahi": upload the daily backup email's .json.gz and the whole
// system (every table of every module, plus the uploaded images) goes back to how it was that day. Jorge only (checked
// again on the server, restore-backup.js). Two ways:
//   Bring back   rows of the backup are written back (missing ones come back, changed ones return to the backup's
//                version); anything created after the backup stays.
//   Exact copy   the same, and rows created after the backup are removed: the system is left exactly as in the file.
// After a restore everyone is signed out (session_revocations '*'), so no open tab saves its old copy over it.
// Loaded as a classic script AFTER portal-settings.js; shares global scope; only wraps portalSettingsRender.
(function () {
  const isJorge = () => /jorge/i.test(String((typeof getCurrentSession === 'function' && getCurrentSession() || {}).name || ''));
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const tok = () => { try { return sessionStorage.getItem('amansala_staff_token') || ''; } catch (e) { return ''; } };
  const call = async body => {
    const r = await fetch('/.netlify/functions/restore-backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok(), ...body }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || ('HTTP ' + r.status));
    return d;
  };
  let BR = null;   // the loaded backup: {tables:{name:rows}, images:[...], exportedAt}

  const prev = window.portalSettingsRender;
  if (typeof prev !== 'function') return;
  window.portalSettingsRender = function () {
    prev.apply(this, arguments);
    if (!isJorge()) return;
    const el = document.getElementById('portalSettingsContent');
    if (!el || document.getElementById('brSection')) return;
    const box = document.createElement('div');
    box.id = 'brSection';
    box.style.cssText = 'background:#fff;border-radius:14px;padding:24px 28px;margin-bottom:20px;border:2px solid #fde68a';
    box.innerHTML = `<div style="font-size:15px;font-weight:700;margin-bottom:4px">Backup &amp; Restore</div>
      <div style="font-size:12px;color:#8a7e74;margin-bottom:14px">Every day a full backup of the system (every table of every module and the uploaded images) is emailed to Jorge@amansala.com. To go back to that day, upload its <b>.json.gz</b> file here.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <button class="btn btn-secondary btn-sm" onclick="brBackupNow()">✉ Email me a backup now</button>
        <label class="btn btn-secondary btn-sm" style="cursor:pointer">📂 Choose backup file<input type="file" accept=".gz,.json,application/gzip,application/json" onchange="brLoadFile(this.files[0])" style="display:none"></label>
        <span id="brFileInfo" style="font-size:12.5px;color:#6b7280"></span>
      </div>
      <div id="brPlan"></div>
      <div id="brLog" style="font-family:monospace;font-size:11.5px;white-space:pre-wrap;max-height:260px;overflow:auto;background:#f8fafc;border-radius:8px;padding:0 10px;margin-top:10px"></div>`;
    el.appendChild(box);
  };

  const log = s => { const l = document.getElementById('brLog'); if (l) { l.style.padding = '8px 10px'; l.textContent += s + '\n'; l.scrollTop = l.scrollHeight; } };

  window.brBackupNow = async function () {
    try { await call({ action: 'backup-now' }); showToast('Backup started — it arrives by email in a few minutes ✓'); }
    catch (e) { showToast('Could not start the backup: ' + e.message); }
  };

  window.brLoadFile = async function (file) {
    if (!file) return;
    const info = document.getElementById('brFileInfo');
    info.textContent = 'Reading ' + file.name + '…';
    try {
      const text = /\.gz$/i.test(file.name)
        ? await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text()
        : await file.text();
      const j = JSON.parse(text);
      // v2 (backup-lib.js): {tables, images}; v1 (before 2026-11-05): the tables at the top level
      const V1 = { bookings: 'bookings', registrations: 'registrations', roomTypes: 'room_types', addOns: 'add_ons', payments: 'payments', transport: 'transport' };
      const tables = j.tables || Object.fromEntries(Object.entries(V1).filter(([k]) => Array.isArray(j[k])).map(([k, t]) => [t, j[k]]));
      BR = { tables, images: j.images || [], exportedAt: j.exportedAt || '' };
      const when = BR.exportedAt ? new Date(BR.exportedAt).toLocaleString('en-US', { timeZone: 'America/Cancun', dateStyle: 'medium', timeStyle: 'short' }) : '?';
      info.innerHTML = `<b>${esc(file.name)}</b> — backup of <b>${esc(when)}</b> (Tulum), ${Object.keys(tables).length} tables, ${BR.images.length} images`;
      const names = Object.keys(tables).sort();
      document.getElementById('brPlan').innerHTML = `
        <div style="display:flex;gap:8px;margin:6px 0"><button class="btn btn-secondary btn-sm" onclick="document.querySelectorAll('.brT').forEach(c=>c.checked=true)">All</button><button class="btn btn-secondary btn-sm" onclick="document.querySelectorAll('.brT').forEach(c=>c.checked=false)">None</button>
          <label style="font-size:12.5px;display:flex;align-items:center;gap:6px;margin-left:8px"><input type="checkbox" id="brImgs" ${BR.images.length ? 'checked' : 'disabled'}> Images (${BR.images.length})</label></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:2px 14px;max-height:260px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px 10px">
          ${names.map(t => `<label style="font-size:12.5px;display:flex;gap:6px;align-items:center"><input type="checkbox" class="brT" value="${esc(t)}" checked> ${esc(t)} <span style="color:#9ca3af">(${tables[t].length})</span></label>`).join('')}
        </div>
        <div style="margin:12px 0 6px;font-size:13px">
          <label style="display:block;margin-bottom:4px"><input type="radio" name="brMode" value="bring" checked> <b>Bring back</b> — rows from the backup come back as they were; anything created after the backup stays.</label>
          <label style="display:block"><input type="radio" name="brMode" value="exact"> <b>Exact copy</b> — also removes everything created after the backup: the system is left exactly as in the file.</label>
        </div>
        <div style="font-size:12px;color:#92400e;background:#fffbeb;border-radius:8px;padding:8px 10px;margin:8px 0">Before restoring, press <b>Email me a backup now</b> so today's state is saved too. After the restore everyone is signed out and signs in again with the restored data.</div>
        <div style="display:flex;gap:8px;align-items:center"><input id="brConfirm" placeholder="Type RESTORE" style="padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;width:150px"><button id="brGo" class="btn btn-danger btn-sm" onclick="brRun()">Restore</button></div>`;
    } catch (e) { info.textContent = 'This file could not be read: ' + e.message; BR = null; }
  };

  // pieces small enough for one function call
  function chunks(rows) {
    const out = []; let cur = [], size = 0;
    for (const r of rows) {
      const n = JSON.stringify(r).length;
      if (cur.length && (size + n > 1500000 || cur.length >= 500)) { out.push(cur); cur = []; size = 0; }
      cur.push(r); size += n;
    }
    if (cur.length) out.push(cur);
    return out;
  }

  window.brRun = async function () {
    if (!BR) return;
    if ((document.getElementById('brConfirm').value || '').trim() !== 'RESTORE') { showToast('Type RESTORE to confirm.'); return; }
    const picked = [...document.querySelectorAll('.brT')].filter(c => c.checked).map(c => c.value);
    const exact = (document.querySelector('input[name="brMode"]:checked') || {}).value === 'exact';
    const withImgs = document.getElementById('brImgs') && document.getElementById('brImgs').checked;
    if (!picked.length && !withImgs) { showToast('Pick at least one table.'); return; }
    if (!confirm(`${exact ? 'EXACT COPY' : 'Bring back'}: ${picked.length} tables${withImgs ? ' + images' : ''} from the backup of ${BR.exportedAt.slice(0, 10)}. Continue?`)) return;
    const btn = document.getElementById('brGo'); btn.disabled = true; btn.textContent = 'Restoring…';
    document.getElementById('brLog').textContent = '';
    const problems = [];
    // 1. write the backup's rows back; a table that fails (a row pointing at a table not restored yet) is tried again after the others
    let queue = picked.slice();
    for (let pass = 1; pass <= 3 && queue.length; pass++) {
      const again = [];
      for (const t of queue) {
        try {
          let n = 0;
          for (const c of chunks(BR.tables[t] || [])) { await call({ action: 'upsert', table: t, rows: c }); n += c.length; }
          log(`✓ ${t}: ${n} rows`);
        } catch (e) { again.push(t); if (pass === 3) { problems.push(`${t}: ${e.message}`); log(`✗ ${t}: ${e.message}`); } }
      }
      queue = again;
      if (queue.length && pass < 3) log(`… trying again: ${queue.join(', ')}`);
    }
    // 2. exact copy: remove the rows the backup does not have
    if (exact) {
      let delQueue = picked.slice();
      for (let pass = 1; pass <= 3 && delQueue.length; pass++) {
        const again = [];
        for (const t of delQueue) {
          try {
            let ids = [], pk = null, composite = false;
            for (let off = 0; ; off += 5000) { const d = await call({ action: 'pks', table: t, offset: off }); if (d.composite) { composite = true; break; } pk = d.pk; ids.push(...d.ids); if (d.ids.length < 5000) break; }
            if (composite) { log(`· ${t}: kept newer rows (composite key)`); continue; }
            const keep = new Set((BR.tables[t] || []).map(r => String(r[pk])));
            const extra = ids.filter(id => !keep.has(String(id)));
            for (let i = 0; i < extra.length; i += 200) await call({ action: 'delete', table: t, ids: extra.slice(i, i + 200) });
            if (extra.length) log(`− ${t}: removed ${extra.length} rows created after the backup`);
          } catch (e) { again.push(t); if (pass === 3) { problems.push(`${t} (removing newer rows): ${e.message}`); log(`✗ ${t} removing: ${e.message}`); } }
        }
        delQueue = again;
      }
    }
    // 3. images
    if (withImgs) {
      let n = 0;
      for (const im of BR.images) { try { await call({ action: 'image', path: im.path, contentType: im.contentType, base64: im.base64 }); n++; } catch (e) { problems.push(`image ${im.path}: ${e.message}`); } }
      log(`✓ images: ${n} of ${BR.images.length}`);
    }
    // 4. sign everyone out so no open tab saves its old copy over the restored data
    try {
      const now = new Date().toISOString();
      const { data: row } = await db.from('app_store').select('value').eq('key', 'session_revocations').maybeSingle();
      await db.from('app_store').upsert({ key: 'session_revocations', value: { ...((row && row.value) || {}), '*': now }, updated_at: now });
      log('✓ everyone is being signed out (within 3 minutes)');
    } catch (e) { problems.push('sign everyone out: ' + e.message); }
    try { logActivity('Backup restored', `${exact ? 'Exact copy' : 'Bring back'} of ${BR.exportedAt}: ${picked.length} tables${withImgs ? ', images' : ''}${problems.length ? ' · problems: ' + problems.join(' | ').slice(0, 600) : ''}`, null); } catch (e) {}
    log(problems.length ? `\nDone with ${problems.length} problem(s) — see above.` : '\nDone. Everything in the backup is back.');
    btn.disabled = false; btn.textContent = 'Restore';
  };
})();
