// ===== menu-cooking-print.js — cooking classes on the PRINTED menu (Darlene 2026-10-29) =====
// Loaded as a classic script AFTER menu.js, teacher-portal.js and menu-cooking-classes.js; shares global scope. Standalone: it wraps the four menu print functions
// (menuPrintWeekReadable, menuPrintDailyRange, menuPrintDay, menuPrint) and, while one runs, adds the day's cooking class to the page it is about to print. Nothing else in
// the menu or in the saved menu data changes.
//   - Week (readable) and Daily prints: a "Cooking Class" block with the time on the day it happens (between Afternoon Snack and Dinner). The Kitchen copy also names the retreat.
//   - Compact print: a "Cooking classes" line under the heading for the printed range.
// The classes come from the same schedule data as the Schedule page (skedGetRetreatEvents).
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const fmtT = t => { if (!t || String(t).indexOf(':') < 0) return ''; const [h, m] = String(t).split(':').map(Number); return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM'); };
  const iso = d => d.toISOString().slice(0, 10);
  const range = (a, b, max) => { const out = [], d = new Date(a + 'T12:00:00'), e = new Date(b + 'T12:00:00'); while (d <= e && out.length < max) { out.push(iso(d)); d.setDate(d.getDate() + 1); } return out; };

  function classes(ds) {
    let ev = []; try { ev = skedGetRetreatEvents(ds) || []; } catch (e) {}
    return ev.filter(e => /cook/i.test(e.title || '')).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime))).map(e => {
      const bk = (AppData.bookings || []).find(x => x.id === e.bkId);
      return { t: fmtT(e.startTime) + (e.endTime ? ' – ' + fmtT(e.endTime) : ''), who: (bk && (bk.leaderName || bk.retreatName)) || String(e.subtitle || '').split(' · ')[0] || '' };
    });
  }

  // ---- page editors (each gets the parsed print document) ----
  function addReadable(doc, days, kitchen) {
    [...doc.querySelectorAll('.rw-day')].forEach((day, i) => {
      const cl = days[i] ? classes(days[i]) : []; if (!cl.length) return;
      const el = doc.createElement('div'); el.className = 'rw-meal';
      el.innerHTML = '<div class="rw-meal-hdr" style="background:#fef3c7;color:#92400e">Cooking Class</div><div class="rw-meal-body">' +
        cl.map(c => `<div class="rw-item">${esc(c.t)}</div>${kitchen && c.who ? `<div class="rw-item-desc">${esc(c.who)}</div>` : ''}`).join('') + '</div>';
      const dinner = [...day.querySelectorAll('.rw-meal')].find(m => /dinner/i.test((m.querySelector('.rw-meal-hdr') || {}).textContent || ''));
      if (dinner) dinner.parentNode.insertBefore(el, dinner); else day.appendChild(el);
    });
  }
  function posterSection(doc, cl, kitchen) {
    const s = doc.createElement('div'); s.className = 'menu-poster-section';
    s.innerHTML = '<div class="menu-poster-label">Cooking Class</div><div class="menu-poster-items">' +
      cl.map(c => `<div class="menu-poster-item">${esc(c.t)}</div>${kitchen && c.who ? `<div class="menu-poster-item-desc">${esc(c.who)}</div>` : ''}`).join('') + '</div>';
    return s;
  }
  function addPoster(doc, days, kitchen) {
    const pages = [...doc.querySelectorAll('.menu-poster-pg')];
    if (days.length === 1) {   // one day, possibly spread over several pages: put it before Dinner once
      const cl = classes(days[0]); if (!cl.length) return;
      const lab = [...doc.querySelectorAll('.menu-poster-label')].find(l => /dinner/i.test(l.textContent));
      const sec = posterSection(doc, cl, kitchen);
      if (lab && lab.parentNode) lab.parentNode.parentNode.insertBefore(sec, lab.parentNode);
      else if (pages.length) pages[pages.length - 1].appendChild(sec);
      return;
    }
    pages.forEach((pg, i) => {
      const cl = days[i] ? classes(days[i]) : []; if (!cl.length) return;
      const sec = posterSection(doc, cl, kitchen);
      const lab = [...pg.querySelectorAll('.menu-poster-label')].find(l => /dinner/i.test(l.textContent));
      if (lab && lab.parentNode) pg.insertBefore(sec, lab.parentNode); else pg.appendChild(sec);
    });
  }
  function addCompact(doc, days) {
    const lines = []; days.forEach(d => classes(d).forEach(c => lines.push(`${new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${c.t}${c.who ? ' · ' + c.who : ''}`)));
    if (!lines.length || !doc.body) return;
    const el = doc.createElement('div'); el.setAttribute('style', 'margin:0 0 10px;padding:6px 10px;border:1px solid #fcd34d;background:#fffbeb;border-radius:6px;font-size:10.5px;color:#92400e');
    el.innerHTML = '<b>Cooking classes:</b> ' + lines.map(esc).join(' &nbsp;|&nbsp; ');
    doc.body.insertBefore(el, doc.body.firstChild);
  }

  // Run a print function while the window it opens gets its HTML edited on the way in.
  function withEdit(fn, edit) {
    const realOpen = window.open;
    window.open = function () {
      const w = realOpen.apply(window, arguments);
      try {
        if (w && w.document) {
          const ow = w.document.write.bind(w.document);
          w.document.write = function (html) {
            try {
              if (typeof html === 'string' && /<html/i.test(html)) {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                edit(doc);
                html = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
              }
            } catch (e) { console.warn('[menu-cooking-print]', e); }
            return ow(html);
          };
        }
      } catch (e) {}
      return w;
    };
    try { return fn(); } finally { window.open = realOpen; }
  }
  const wrap = (name, mk) => {
    const prev = window[name];
    if (typeof prev !== 'function') return;
    window[name] = function () { const a = arguments, self = this; const edit = mk.apply(null, a); return withEdit(() => prev.apply(self, a), edit); };
  };
  wrap('menuPrintWeekReadable', (from, to, kitchen) => doc => addReadable(doc, range(from, to, 14), !!kitchen));
  wrap('menuPrintDailyRange', (from, to, kitchen) => doc => addPoster(doc, range(from, to, 31), !!kitchen));
  wrap('menuPrintDay', ds => doc => addPoster(doc, [ds], false));
  wrap('menuPrint', () => doc => { const f = (document.getElementById('menuPrintFrom') || {}).value, t = (document.getElementById('menuPrintTo') || {}).value; if (f && t) addCompact(doc, range(f, t, 14)); });
})();
