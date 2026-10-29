// ===== alert-chip-stack.js — the three red/orange alert chips sit in one tidy, equal-width column (Darlene 2026-10-29) =====
// Loaded as a classic script AFTER tour-match-alert.js, shala-double-book-alert.js and transport-no-reservation-alert.js; shares global scope. Layout only.
// Each of those modules creates its own chip (fixed position, its own width). This puts the existing chips into one bottom-right column so they line up on the left and right edges,
// share the width of the widest one, and are evenly spaced. The chips' own counting, showing/hiding and click actions are untouched.
(function () {
  const IDS = ['sdbChip', 'tmaChip', 'tnrChip'];   // top to bottom
  // "Hide for this work session" (Darlene 2026-10-29): a small button above the chips hides the whole column until the browser tab is closed; a small "⚠ alerts" pill brings it back.
  const HKEY = 'ama_alerts_hidden';
  const hidden = () => { try { return sessionStorage.getItem(HKEY) === '1'; } catch (e) { return false; } };
  // When hidden, the column stays out of the way — but it pops back up by itself if MORE things are not done than when it was hidden (new alerts); the same alerts stay hidden.
  const total = () => IDS.reduce((s, id) => { const c = document.getElementById(id); return s + (c && c.style.display !== 'none' && c.style.display !== '' ? (parseInt((c.textContent.match(/\d+/) || [0])[0], 10) || 0) : 0); }, 0);
  const setHidden = v => { try { if (v) { sessionStorage.setItem(HKEY, '1'); sessionStorage.setItem(HKEY + '_n', String(total())); } else { sessionStorage.removeItem(HKEY); sessionStorage.removeItem(HKEY + '_n'); } } catch (e) {} stack(); };
  const hiddenN = () => { try { return parseInt(sessionStorage.getItem(HKEY + '_n') || '0', 10) || 0; } catch (e) { return 0; } };
  window.alertStackHide = () => setHidden(true);
  window.alertStackShow = () => setHidden(false);
  const visibleCount = () => IDS.filter(id => { const c = document.getElementById(id); return c && c.style.display !== 'none' && c.style.display !== ''; }).length;
  function stack() {
    let box = document.getElementById('alertStack');
    if (!box) {
      if (!document.body) return;
      box = document.createElement('div'); box.id = 'alertStack';
      box.style.cssText = 'position:fixed;right:14px;bottom:60px;z-index:99990;display:flex;flex-direction:column;align-items:stretch;gap:8px;pointer-events:none';
      document.body.appendChild(box);
    }
    // hide button (top of the column) and the little restore pill
    let hb = document.getElementById('alertHideBtn');
    if (!hb) { hb = document.createElement('button'); hb.id = 'alertHideBtn'; hb.type = 'button'; hb.onclick = window.alertStackHide; hb.textContent = 'Hide alerts for this session ✕'; hb.style.cssText = "pointer-events:auto;align-self:flex-end;padding:3px 10px;border-radius:99px;border:1.5px solid #d6cfc4;background:#fff;color:#6b7280;font-family:'Jost',sans-serif;font-size:11px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15)"; box.insertBefore(hb, box.firstChild); }
    let sp = document.getElementById('alertShowPill');
    if (!sp) { sp = document.createElement('button'); sp.id = 'alertShowPill'; sp.type = 'button'; sp.onclick = window.alertStackShow; sp.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:99990;display:none;padding:4px 12px;border-radius:99px;border:1.5px solid #fca5a5;background:#fff;color:#b91c1c;font-family:'Jost',sans-serif;font-size:11.5px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15)"; document.body.appendChild(sp); }
    if (hidden() && total() > hiddenN()) { try { sessionStorage.removeItem(HKEY); sessionStorage.removeItem(HKEY + '_n'); } catch (e) {} }   // new alerts: pop back up
    const n = visibleCount(), hide = hidden();
    box.style.display = hide ? 'none' : 'flex';
    hb.style.display = n ? '' : 'none';
    sp.style.display = (hide && n) ? 'block' : 'none';
    sp.textContent = '⚠ ' + n + ' alert' + (n !== 1 ? 's' : '');
    IDS.forEach(id => {
      const c = document.getElementById(id); if (!c) return;
      if (c.parentNode !== box) {
        c.style.position = 'static'; c.style.right = ''; c.style.bottom = ''; c.style.left = '';
        c.style.pointerEvents = 'auto'; c.style.textAlign = 'center'; c.style.boxSizing = 'border-box'; c.style.width = '100%';
      }
      box.appendChild(c);   // keeps the order above
    });
  }
  setInterval(stack, 1500); setTimeout(stack, 3000); setTimeout(stack, 9000); setTimeout(stack, 14000);
})();
