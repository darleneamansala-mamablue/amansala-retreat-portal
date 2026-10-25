// ===== tab-urls.js — every portal section has its own web address, e.g. amansalaportal.com/menu (Darlene 2026-10-25) =====
// Loaded as a classic script AFTER the portal's own scripts; shares global scope. Nothing else is edited except the _redirects file (each address below is served by booking-hub.html).
//   - Opening a section changes the address bar to its name (Menu -> /menu, Schedule -> /schedule ...); the back and forward buttons move between sections.
//   - Opening a link such as amansalaportal.com/menu goes to the login if needed, then straight to that section (it sets the portal's "last tab" before the login restores it).
// Admin portal only: teacher, spa-staff and other ?mode= pages keep their own links untouched. Spa is /spa-admin because /spa is the public spa booking page.
const TU_ROUTES = { dashboard: 'dashboard', venues: 'venues', pipeline: 'pipeline', 'booking-engine': 'booking-engine', reservations: 'reservations', roomcal: 'calendar', teacherreg: 'teachers', teacherprofiles: 'teacher-profiles', builder: 'builder', datefinder: 'date-finder', activity: 'activity-log', items: 'items', menueditor: 'menu-editor', contractlib: 'contracts', commissions: 'commissions', reports: 'reports', settings: 'settings', botlogadmin: 'bot-log', skedda: 'schedule', housekeeping: 'housekeeping', transport: 'transport', events: 'events', spa: 'spa-admin', menu: 'menu', actsheet: 'activity-sheet', bbcsched: 'bbc-schedule', confirmations: 'confirmations', wetravel: 'we-travel', guestchat: 'guest-chat' };
const TU_SLUGS = Object.fromEntries(Object.entries(TU_ROUTES).map(([id, slug]) => [slug, id]));
const tuOn = () => !/[?&]mode=/.test(location.search) && !/booking-hub\.local/.test(location.pathname);
const tuSlugNow = () => location.pathname.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');
let tuTarget = tuOn() ? TU_SLUGS[tuSlugNow()] || '' : '';
if (tuTarget) { try { localStorage.setItem('ama_last_tab', tuTarget); } catch (e) {} }   // the login restores this tab as soon as it opens the portal
function tuBtn(id) { return [...document.querySelectorAll('.tab-btn')].find(b => (b.getAttribute('onclick') || '').includes("switchTab('" + id + "'")); }
function tuGo(id) { const b = tuBtn(id), p = document.getElementById('tab-' + id); if (b && p && typeof switchTab === 'function' && !p.classList.contains('active')) switchTab(id, b); }
(function () {
  if (!tuOn() || typeof switchTab !== 'function') return;
  const o = window.switchTab;
  window.switchTab = function (id) {
    const r = o.apply(this, arguments);
    try { const slug = TU_ROUTES[id]; if (slug && tuSlugNow() !== slug) history.pushState({ tab: id }, '', '/' + slug); } catch (e) {}
    return r;
  };
  window.addEventListener('popstate', () => { const id = TU_SLUGS[tuSlugNow()]; if (id) tuGo(id); });
  // fallback if the login restored a different tab than the address says: switch once the portal is open
  let tries = 0; const t = setInterval(() => {
    if (!tuTarget || ++tries > 60) { clearInterval(t); return; }
    const ov = document.getElementById('staffLoginOverlay'), open = !ov || ov.style.display === 'none' || !ov.offsetParent;
    const p = document.getElementById('tab-' + tuTarget);
    if (open && p && tuBtn(tuTarget)) { clearInterval(t); setTimeout(() => tuGo(tuTarget), 700); }
  }, 500);
})();
