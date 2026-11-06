// ===== i18n.js — EN / ES switch for the portal (Jorge 2026-11-06) =====
// The portal is written in English; staff who don't speak English pick "ES" in the side menu and the screen text is
// swapped for a reviewed Spanish version. Only UI text in the dictionaries below is ever changed (exact matches of a
// whole text node, button title or placeholder, plus a few patterns with numbers) -- guest names, notes, rooms and
// retreat names are data and are never in a dictionary, so they always stay as typed.
// Dictionaries: this file (menu + shared words) and modules/i18n-es-*.js (one per screen), each calling i18nAdd().
// The choice is per browser (localStorage 'portal_lang'); EN never runs any of this, so English is exactly as before.
const I18N_ES = Object.create(null);
const I18N_ES_RX = [];   // [RegExp, replacement] -- for text with numbers/names in it ("3 rooms blocked", "Room 12")
function i18nAdd(map) { for (const k in map) if (map[k]) I18N_ES[k.trim()] = map[k]; }
function i18nAddRx(rules) { (rules || []).forEach(r => { if (r && r[0] instanceof RegExp) I18N_ES_RX.push(r); }); }
function portalLang() { try { return localStorage.getItem('portal_lang') === 'es' ? 'es' : 'en'; } catch (e) { return 'en'; } }
// Translate one string (used for alert/confirm/prompt and by screens that want it). Unknown text comes back unchanged.
function tr(s) {
  if (portalLang() !== 'es' || s == null) return s;
  const str = String(s), key = str.trim();
  if (!key) return str;
  const hit = I18N_ES[key];
  if (hit) return str.replace(key, () => hit);   // a function, so a '$' in the Spanish text is kept as is
  for (const [rx, rep] of I18N_ES_RX) { rx.lastIndex = 0; if (rx.test(key)) { rx.lastIndex = 0; const out = key.replace(rx, rep); return str.replace(key, () => out); } }
  return str;
}

(function () {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'CODE', 'PRE']);
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const skipEl = el => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { if (SKIP.has(e.tagName) || e.isContentEditable || e.hasAttribute('data-no-i18n')) return true; } return false; };
  function doText(n) {
    const v = n.nodeValue;
    if (!v || v === n.__i18nSet || !/[A-Za-z]/.test(v)) return;
    if (skipEl(n.parentElement)) return;
    const out = tr(v);
    if (out !== v) { n.__i18nSet = out; n.nodeValue = out; }
  }
  function doAttrs(el) {
    if (skipEl(el)) return;
    for (const a of ATTRS) { const v = el.getAttribute(a); if (v && /[A-Za-z]/.test(v)) { const out = tr(v); if (out !== v) el.setAttribute(a, out); } }
    if (el.tagName === 'INPUT' && /^(button|submit)$/i.test(el.type) && el.value) { const out = tr(el.value); if (out !== el.value) el.value = out; }
    if (el.tagName === 'OPTION' && el.firstChild) doText(el.firstChild);
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || SKIP.has(root.tagName)) return;
    doAttrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  // Batch what changed into one pass per frame -- the Rooms calendar can add thousands of nodes at once.
  let pending = new Set(), scheduled = false;
  function flush() { scheduled = false; const list = [...pending]; pending = new Set(); list.forEach(n => { if (n.isConnected) walk(n); }); }
  function queue(n) { pending.add(n); if (!scheduled) { scheduled = true; requestAnimationFrame(flush); } }

  function start() {
    if (portalLang() !== 'es') return;
    document.documentElement.lang = 'es';
    walk(document.body);
    new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'characterData') { if (m.target.nodeValue !== m.target.__i18nSet) queue(m.target); }
        else if (m.type === 'attributes') queue(m.target);
        else m.addedNodes.forEach(queue);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    // pop-ups staff click through
    const wrap = fn => function (msg, ...rest) { return fn.call(window, tr(msg), ...rest); };
    window.alert = wrap(window.alert); window.confirm = wrap(window.confirm); window.prompt = wrap(window.prompt);
  }

  // The EN / ES switch, at the bottom of the side menu. Changing it reloads so every screen redraws in that language.
  function addSwitch() {
    const nav = document.getElementById('sideNav');
    if (!nav || document.getElementById('langSwitch')) return;
    const lang = portalLang();
    const box = document.createElement('div');
    box.id = 'langSwitch'; box.setAttribute('data-no-i18n', '');
    box.style.cssText = 'display:flex;gap:4px;padding:10px 14px;margin-top:auto;';
    box.innerHTML = ['en', 'es'].map(l => `<button type="button" data-lang="${l}" title="${l === 'en' ? 'English' : 'Español'}" style="flex:1;padding:5px 0;border-radius:6px;border:1px solid rgba(255,255,255,.35);font:700 11px 'Jost',sans-serif;cursor:pointer;letter-spacing:.5px;${l === lang ? 'background:#fff;color:#1f2937' : 'background:transparent;color:#fff'}">${l.toUpperCase()}</button>`).join('');
    box.addEventListener('click', e => {
      const b = e.target.closest('button[data-lang]'); if (!b || b.dataset.lang === portalLang()) return;
      try { localStorage.setItem('portal_lang', b.dataset.lang); } catch (_) {}
      location.reload();
    });
    nav.appendChild(box);
  }

  const boot = () => { addSwitch(); start(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

// ----- side menu + words used on every screen -----
i18nAdd({
  // side menu
  'Dashboard': 'Inicio', 'Sales Pipeline': 'Ventas', 'Booking Engine': 'Motor de reservas', 'Reservations': 'Reservaciones',
  'Menu': 'Menú', 'Activities': 'Actividades', 'Tours & Ceremonies': 'Tours y ceremonias', 'Daily Briefing': 'Resumen del día',
  'Daily Reports': 'Reportes diarios', 'Staffing Forecast': 'Pronóstico de personal', 'Staff Schedules': 'Horarios del staff',
  'Daily Shalas': 'Shalas del día', 'Venues': 'Espacios', 'Rooms': 'Cuartos', 'Teachers': 'Maestros', 'Teacher Profiles': 'Perfiles de maestros',
  'Builder': 'Constructor', 'Dates': 'Fechas', 'Schedule': 'Horario', 'Transport': 'Transporte', 'Housekeeping': 'Housekeeping',
  'Spa': 'Spa', 'Reports': 'Reportes', 'Settings': 'Configuración', 'Maintenance': 'Mantenimiento', 'Room Calendar': 'Calendario de cuartos',
  // shared buttons and words
  'Save': 'Guardar', 'Cancel': 'Cancelar', 'Close': 'Cerrar', 'Edit': 'Editar', 'Delete': 'Eliminar', 'Remove': 'Quitar', 'Add': 'Agregar',
  'Back': 'Atrás', 'Next': 'Siguiente', 'Next ›': 'Siguiente ›', '‹ Prev': '‹ Anterior', 'Prev': 'Anterior', 'Today': 'Hoy', 'Tomorrow': 'Mañana', 'Yesterday': 'Ayer',
  'Search': 'Buscar', 'Search…': 'Buscar…', 'Search...': 'Buscar...', 'Print': 'Imprimir', 'Refresh': 'Actualizar', 'Refresh Now': 'Actualizar ahora',
  'Dismiss': 'Descartar', 'Confirm': 'Confirmar', 'Yes': 'Sí', 'No': 'No', 'OK': 'OK', 'Done': 'Listo', 'Send': 'Enviar', 'Loading…': 'Cargando…', 'Loading...': 'Cargando...',
  'All': 'Todos', 'None': 'Ninguno', 'Name': 'Nombre', 'Guest': 'Huésped', 'Guests': 'Huéspedes', 'Room': 'Cuarto', 'Notes': 'Notas', 'Note': 'Nota',
  'Date': 'Fecha', 'Time': 'Hora', 'Status': 'Estado', 'Total': 'Total', 'Balance': 'Saldo', 'Paid': 'Pagado', 'Open': 'Abierto', 'Email': 'Correo', 'Phone': 'Teléfono',
  'Check In': 'Check In', 'Check Out': 'Check Out', 'Arrival': 'Llegada', 'Departure': 'Salida', 'Arrivals': 'Llegadas', 'Departures': 'Salidas',
  'Nights': 'Noches', 'nights': 'noches', 'Pending': 'Pendiente', 'Resolved': 'Resuelto', 'Cancelled': 'Cancelado', 'Confirmed': 'Confirmado',
  'Hide controls': 'Ocultar controles', 'Show controls': 'Mostrar controles', 'Book a Room': 'Reservar cuarto', 'Block Rooms': 'Bloquear cuartos',
  'A newer version of this page is available — refresh when you have a moment to avoid working on out-of-date data.': 'Hay una versión nueva de esta página — actualiza cuando puedas para no trabajar con datos viejos.',
  'Saved.': 'Guardado.', 'Updated.': 'Actualizado.', 'Sign in again.': 'Vuelve a iniciar sesión.',
});
// dates as fmtDate writes them on their own ("Nov 6, 2026", "Nov 6") -> "6 nov 2026"
const I18N_MON = { Jan: 'ene', Feb: 'feb', Mar: 'mar', Apr: 'abr', May: 'may', Jun: 'jun', Jul: 'jul', Aug: 'ago', Sep: 'sep', Oct: 'oct', Nov: 'nov', Dec: 'dic' };
i18nAddRx([
  [/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})$/, (m, mo, d, y) => `${d} ${I18N_MON[mo]} ${y}`],
  [/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})$/, (m, mo, d) => `${d} ${I18N_MON[mo]}`],
]);
