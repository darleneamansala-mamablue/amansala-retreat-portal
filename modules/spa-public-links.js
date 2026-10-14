// ===== spa-public-links.js — the public booking links, with Copy buttons, at the top of the spa portal's Public tab =====
// Loaded as a classic script AFTER spa.js; shares global scope. Standalone: it only adds a bar above the Public page preview.
const SPL_LINKS = [
  { label: 'Spa booking page (all services)', path: '/spa', note: 'Guests choose any service and book. No login.' },
  { label: 'Crystal Balancing, 60 min, $111', path: '/crystal', note: 'Goes straight to this one service.' },
  { label: 'Spa information page', path: '/spa-landing.html', note: 'Menu, therapists and a Book button.' },
];
function splCopy(path, btn) {
  const url = location.origin + path;
  const done = () => { const old = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = old; }, 1600); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done).catch(() => { prompt('Copy this link:', url); });
  else prompt('Copy this link:', url);
}
function splDecorate() {
  try {
    const el = document.getElementById('spaContent');
    if (!el || spaCurView !== 'public' || el.querySelector('.spl-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'spl-bar';
    bar.style.cssText = 'text-align:left;padding:14px 16px;margin:0 0 12px;background:#fffaf0;border:1.5px solid #fcd34d;border-radius:12px;font-family:\'Jost\',sans-serif';
    bar.innerHTML = `<div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#92400e;margin-bottom:8px">Links to send to guests (open to everyone, no login)</div>` +
      SPL_LINKS.map((l, i) => `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 0;${i ? 'border-top:1px solid #f3e8c8' : ''}">
        <div style="flex:1;min-width:220px"><div style="font-weight:700;font-size:13px;color:#2d2520">${l.label}</div><div style="font-size:11.5px;color:#7a705c">${l.note}</div></div>
        <a href="${l.path}" target="_blank" rel="noopener" style="font-size:13px;color:#0f766e;word-break:break-all">${location.origin}${l.path}</a>
        <button onclick="splCopy('${l.path}',this)" style="padding:6px 14px;border:1.5px solid #2d6a6a;background:#2d6a6a;color:#fff;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:600">Copy link</button>
      </div>`).join('');
    el.insertBefore(bar, el.firstChild);
  } catch (e) {}
}
(function () {
  const orig = window.spaRenderPublicPage;
  if (typeof orig !== 'function') return;
  window.spaRenderPublicPage = function () { const r = orig.apply(this, arguments); setTimeout(splDecorate, 0); return r; };
})();
