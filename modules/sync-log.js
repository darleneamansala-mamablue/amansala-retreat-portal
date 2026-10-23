// ===== sync-log.js — "Sync Log" tab: saves the new compare-and-swap sync could not do, and its on/off switch =====
// Loaded as a classic script AFTER double-charges.js; shares global scope. Standalone: adds a "Sync Log" tab under Double Charges
// with a red count of entries nobody has reviewed yet.
// Reads app_store 'cas_log:<time>_<rand>' rows (written by casLogEvent() in booking-hub.html: a save that failed after every retry,
// or a row found deleted on another tab) and shows who, which booking / room, when and why. 'cas_log_reviewed' = { at, by } is
// shared, so once someone marks the list reviewed the count clears for everyone.
// Also the rollout switch (app_store 'cas_sync' = { mode }, see casSyncEnabled() in booking-hub.html): admins turn the new sync
// off (emergency) / on for browsers that opted in with ?cas=1 / on for everyone, without opening Supabase.
let slState = { rows: [], reviewed: null, mode: 'opt_in', modeBy: null, loading: false, loadedAt: 0, error: '' };
const SL_REVIEWED = 'cas_log_reviewed', SL_SWITCH = 'cas_sync';

const slEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function slTime(iso) { try { return new Date(iso).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Cancun' }); } catch (e) { return iso || ''; } }
const slIsAdmin = () => (typeof getCurrentSession === 'function' && getCurrentSession()?.role === 'admin');
const SL_KIND = {
  failed: { label: 'No se guardó', color: '#b91c1c', bg: '#fee2e2' },
  gone: { label: 'Ya estaba borrado', color: '#92400e', bg: '#fef3c7' },
};
const SL_REASON = r => r === 'exhausted' ? 'otra persona lo estaba editando al mismo tiempo y no se pudo guardar tras 10 intentos — el cambio sigue en su pantalla y se reintenta en su siguiente guardado'
  : r === 'gone' ? 'alguien lo borró en otra pestaña; se quitó también de la pantalla de esta persona'
  : r ? 'error de la base de datos: ' + r : '';
const SL_MODES = [
  { mode: 'off', label: 'Apagada', note: 'Todos usan el sistema anterior. Úsalo si algo falla.' },
  { mode: 'opt_in', label: 'Solo quien la activa', note: 'Solo los navegadores que abrieron el portal con ?cas=1.' },
  { mode: 'on', label: 'Todo el staff', note: 'Todos con la red de seguridad (un navegador puede salirse con ?cas=0).' },
];

async function slLoad() {
  const [logs, meta] = await Promise.all([
    db.from('app_store').select('key,value').like('key', 'cas_log:%').order('key', { ascending: false }).limit(500),
    db.from('app_store').select('key,value').in('key', [SL_REVIEWED, SL_SWITCH]),
  ]);
  if (logs.error) throw logs.error;
  slState.rows = (logs.data || []).map(r => ({ key: r.key, ...(r.value || {}) }));
  const m = k => ((meta.data || []).find(r => r.key === k) || {}).value;
  slState.reviewed = m(SL_REVIEWED) || null;
  const sw = m(SL_SWITCH) || {};
  slState.mode = (sw.mode === 'off' || sw.mode === 'on') ? sw.mode : 'opt_in';
  slState.modeBy = sw.by ? { by: sw.by, at: sw.at } : null;
  if (typeof _casSetRemote === 'function') _casSetRemote(sw);
}
const slUnreviewed = () => slState.rows.filter(r => !slState.reviewed || String(r.at || '') > String(slState.reviewed.at || ''));

function slBadge() {
  const b = document.getElementById('slBadge'); if (!b) return;
  const n = slUnreviewed().length; b.textContent = n; b.style.display = n ? 'inline-block' : 'none';
}
async function slRefresh() {
  if (slState.loading) return; slState.loading = true; slState.error = '';
  try { await slLoad(); slState.loadedAt = Date.now(); }
  catch (e) { console.warn('[sync log] load failed', e); slState.error = e.message || String(e); }
  slState.loading = false; slBadge(); slRender();
}
async function slMarkReviewed() {
  // Covers the newest entry even when this computer's clock is behind the one that wrote it
  const now = new Date().toISOString(), newest = slState.rows.reduce((m, r) => String(r.at || '') > m ? String(r.at) : m, '');
  const v = { at: newest > now ? newest : now, by: (getCurrentSession() || {}).name || 'Staff' };
  const { error } = await db.from('app_store').upsert({ key: SL_REVIEWED, value: v, updated_at: v.at });
  if (error) { showToast('No se pudo guardar — intenta otra vez.'); return; }
  slState.reviewed = v; slBadge(); slRender();
}
async function slSetMode(mode) {
  if (!slIsAdmin()) { showToast('Solo un admin puede cambiar esto.'); return; }
  const m = SL_MODES.find(x => x.mode === mode); if (!m) return;
  if (!confirm(`¿Cambiar la red de seguridad a "${m.label}"?\n\n${m.note}\n\nEntra en el siguiente guardado de cada persona.`)) return;
  const v = { mode, by: (getCurrentSession() || {}).name || 'Admin', at: new Date().toISOString() };
  const { error } = await db.from('app_store').upsert({ key: SL_SWITCH, value: v, updated_at: v.at });
  if (error) { showToast('No se pudo cambiar — intenta otra vez.'); return; }
  slState.mode = mode; slState.modeBy = { by: v.by, at: v.at };
  if (typeof _casSetRemote === 'function') _casSetRemote(v);
  if (typeof logActivity === 'function') logActivity('Sync safety net switched', m.label);
  showToast(`Red de seguridad: ${m.label}`);
  slRender();
}

function slRender() {
  const el = document.getElementById('slContent'); if (!el) return;
  const btn = 'padding:6px 12px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;font-size:12.5px';
  const admin = slIsAdmin(), here = typeof casSyncEnabled === 'function' && casSyncEnabled();
  const unrev = new Set(slUnreviewed().map(r => r.key));
  const sw = SL_MODES.map(m => {
    const on = m.mode === slState.mode;
    return `<button ${admin ? `onclick="slSetMode('${m.mode}')"` : 'disabled'} title="${slEsc(m.note)}" style="${btn};${on ? (m.mode === 'off' ? 'background:#b91c1c;border-color:#b91c1c;color:#fff' : 'background:var(--teal,#2d6a6a);border-color:var(--teal,#2d6a6a);color:#fff') : ''};${admin ? '' : 'cursor:default;opacity:' + (on ? 1 : .5)}">${on ? '● ' : ''}${slEsc(m.label)}</button>`;
  }).join('');
  el.innerHTML = `<div style="max-width:1150px;margin:0 auto;font-family:'Jost',sans-serif;color:#2d2520;text-align:left">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div><div style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600">Sync Log</div>
        <div style="font-size:12.5px;color:#6b7280">Cambios a reservas y registros que la red de seguridad no pudo guardar, o que ya estaban borrados. Si no hay nada aquí, todo se está guardando bien.</div></div>
      <div style="display:flex;gap:8px;align-items:center">
        ${unrev.size ? `<button onclick="slMarkReviewed()" style="${btn}">✓ Marcar todo como revisado</button>` : ''}
        <button onclick="slRefresh()" style="${btn}">${slState.loading ? 'Revisando…' : '↻ Revisar ahora'}</button></div></div>

    <div style="margin-top:14px;background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;padding:12px 14px">
      <div style="font-size:13px;font-weight:700">Red de seguridad al guardar</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${sw}</div>
      <div style="font-size:11.5px;color:#6b7280;margin-top:8px">${slEsc((SL_MODES.find(m => m.mode === slState.mode) || {}).note || '')}${slState.modeBy ? ` Último cambio: ${slEsc(slState.modeBy.by)}, ${slTime(slState.modeBy.at)}.` : ''}
        ${admin ? '' : ' Solo un admin puede cambiarlo.'}</div>
      <div style="font-size:11.5px;margin-top:4px">En este navegador: <b style="color:${here ? '#059669' : '#6b7280'}">${here ? 'encendida' : 'apagada'}</b>${slState.mode === 'opt_in' ? ` · <a href="?cas=${here ? 0 : 1}" style="color:var(--teal,#2d6a6a)">${here ? 'apagarla aquí' : 'encenderla aquí'}</a>` : ''}</div>
    </div>

    ${slState.error ? `<div style="margin-top:12px;padding:12px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:12.5px">No se pudo leer el registro: ${slEsc(slState.error)}</div>` : ''}
    <div style="margin-top:14px;font-size:13px;font-weight:700">${slState.rows.length ? `${slState.rows.length} registro${slState.rows.length !== 1 ? 's' : ''}${unrev.size ? ` · <span style="color:#dc2626">${unrev.size} sin revisar</span>` : ''}` : (slState.loadedAt ? '<span style="color:#059669">Sin fallos registrados.</span>' : 'Revisando…')}
      ${slState.reviewed ? `<span style="font-weight:400;color:#8a7e74;font-size:11.5px"> · revisado por ${slEsc(slState.reviewed.by)}, ${slTime(slState.reviewed.at)}</span>` : ''}</div>
    <div style="margin-top:10px">${slState.rows.map(r => {
      const k = SL_KIND[r.kind] || { label: r.kind || '?', color: '#374151', bg: '#e5e7eb' }, isNew = unrev.has(r.key);
      return `<div style="background:#fff;border:1.5px solid ${isNew ? '#fecaca' : '#e8dfd4'};border-radius:12px;padding:12px 14px;margin-bottom:10px;${isNew ? '' : 'opacity:.7'}">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline">
          <div><b style="font-size:14px">${slTime(r.at)}</b> · ${slEsc(r.user || 'sin usuario')} <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;margin-left:6px;background:${k.bg};color:${k.color}">${slEsc(k.label)}</span>${isNew ? ' <span style="font-size:11px;color:#dc2626;font-weight:700">nuevo</span>' : ''}</div>
          <div style="font-size:11.5px;color:#8a7e74">${r.table === 'bookings' ? 'Reserva' : 'Registro'}${(r.items || []).length > 1 ? ` · ${(r.items || []).length}` : ''}</div></div>
        ${(r.items || []).map(it => `<div style="font-size:12.5px;margin-top:6px">${it.room ? `<b>Cuarto ${slEsc(it.room)}</b> · ` : ''}${it.leader ? slEsc(it.leader) + ' · ' : ''}<span style="color:#8a7e74">${slEsc(it.id)}</span>
          <div style="font-size:11.5px;color:#6b7280">${slEsc(SL_REASON(it.reason || (r.kind === 'gone' ? 'gone' : '')))}</div>
          ${r.table === 'registrations' && typeof openBookingDetailForReg === 'function' ? `<button onclick="openBookingDetailForReg('${slEsc(it.id)}','')" style="${btn};margin-top:4px">Abrir reserva</button>` : ''}</div>`).join('')}
      </div>`;
    }).join('')}</div></div>`;
}

function slOpen(btn) {
  const prev = localStorage.getItem('ama_last_tab');
  switchTab('synclog', btn);
  try { localStorage.setItem('ama_last_tab', prev || 'dashboard'); } catch (e) {}
  slRender(); slRefresh();
}

(function () {
  const side = document.getElementById('staffSideBtn'), reports = document.getElementById('tab-reports');
  if (!side || !reports || document.getElementById('tab-synclog')) return;
  const panel = document.createElement('div');
  panel.className = 'tab-panel'; panel.id = 'tab-synclog'; panel.style.flexDirection = 'column';
  panel.innerHTML = '<div id="slContent" style="flex:1;overflow:auto;padding:28px 36px;background:#f5f1eb"></div>';
  reports.parentNode.insertBefore(panel, reports.nextSibling);
  const b = document.createElement('button');
  b.className = 'tab-btn tab-btn-sub'; b.id = 'synclogTabBtn'; b.setAttribute('onclick', 'slOpen(this)');
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><polyline points="21 3 21 8 16 8"/></svg><span class="tab-label">Sync Log</span><span id="slBadge" style="display:none;margin-left:6px;background:#dc2626;color:#fff;border-radius:99px;font-size:10.5px;font-weight:700;padding:1px 7px"></span>';
  side.parentNode.insertBefore(b, side);
  // Background check for the red count: staff on the admin portal only (not spa-staff, teacher or driver views)
  const adminOk = () => !(typeof IS_SPA_STAFF_MODE !== 'undefined' && IS_SPA_STAFF_MODE) && typeof getCurrentSession === 'function' && getCurrentSession();
  const tick = () => { if (adminOk()) slRefresh(); };
  setTimeout(tick, 15000); setInterval(tick, 10 * 60 * 1000);
})();
