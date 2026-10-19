// ===== spa-calendar-autorefresh.js — the spa calendar always shows the latest bookings (Darlene 2026-10-19) =====
// A calendar left open used to keep showing the list it loaded hours ago, so a slot someone had just booked looked free. Now, while the Spa tab is
// open on the Calendar, it re-reads the saved appointments every 30 seconds (and the moment the browser tab is looked at again) and redraws if anything
// changed. It does NOT refresh while an appointment window is open or while this tab has changes that are still saving. Standalone.
const SAR_EVERY_MS = 30000;
let _sar_busy = false;
function _sar_idle() {
  const panel = document.getElementById('tab-spa'), modal = document.getElementById('spaApptModal');
  return !!(panel && panel.classList.contains('active')) && typeof spaCurView !== 'undefined' && spaCurView === 'calendar' && !document.hidden && !(modal && modal.classList.contains('open'));
}
async function sarRefresh() {
  if (_sar_busy || !_sar_idle() || typeof SpaAppointments === 'undefined') return;
  _sar_busy = true;
  try {
    const { data } = await db.from('app_store').select('value').eq('key', 'spa_appointments').maybeSingle();
    const server = data && Array.isArray(data.value) ? data.value : null;
    if (!server) return;
    // don't touch the screen if this tab has unsaved changes of its own
    if (typeof _sam_base !== 'undefined') {
      const ids = new Set(SpaAppointments.map(a => a && a.id));
      if (SpaAppointments.some(a => a && a.id && _sam_base[a.id] !== JSON.stringify(a)) || Object.keys(_sam_base).some(id => !ids.has(id))) return;
    }
    if (!_sar_idle()) return;
    if (JSON.stringify(server) === JSON.stringify(SpaAppointments)) return;
    const el = document.getElementById('spaContent'), top = el ? el.scrollTop : 0, left = el ? el.scrollLeft : 0;
    const inner = el ? [...el.querySelectorAll('*')].find(n => n.scrollHeight > n.clientHeight + 20 && n.scrollTop > 0) : null, itop = inner ? inner.scrollTop : 0;
    SpaAppointments.length = 0; server.forEach(a => SpaAppointments.push(a));
    if (typeof _sam_snap === 'function') _sam_base = _sam_snap(SpaAppointments);
    spaCalRender();
    if (el) { el.scrollTop = top; el.scrollLeft = left; const n2 = [...el.querySelectorAll('*')].find(n => n.scrollHeight > n.clientHeight + 20); if (n2 && itop) n2.scrollTop = itop; }
  } catch (e) { console.warn('[spa-autorefresh]', e); }
  finally { _sar_busy = false; }
}
setInterval(sarRefresh, SAR_EVERY_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) sarRefresh(); });
