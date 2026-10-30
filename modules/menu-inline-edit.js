// ===== menu-inline-edit.js — add and edit dishes right inside the menu cell (Darlene 2026-10-30) =====
// Loaded as a classic script AFTER menu-click-edit.js and menu-options.js; shares global scope. Standalone: only wraps mceOpen.
// "+ add dish" now shows in every meal cell all the time (no need to switch on edit mode). The red ✕ (take a dish off) shows all the time too.
// Inline lines:
//   - "+ add dish" opens a line right in the cell (type the name, Enter). Your options for that meal show as suggestions; picking one brings its English name and description.
//   - clicking a dish turns it into a line you can type over (Enter saves, Esc cancels).
//   - "More…" on that line opens the full window (English name, description, move, remove) as before.
// The page stays where it is: no jump back to the top of the week. Saves go through the same path as the full window (weekly pattern of the menu in use).
(function () {
  // "+ add dish" is always showing on the menu, not only in edit mode (Darlene 2026-10-30)
  if (!document.getElementById('mieCss')) { const st = document.createElement('style'); st.id = 'mieCss'; st.textContent = '#menuGrid:not(.mce-editing) .mce-add{display:block!important;opacity:.9;font-weight:700;font-size:11px}#menuGrid:not(.mce-editing) .mce-x{display:inline!important}'; document.head.appendChild(st); }
  const orig = window.mceOpen;
  if (typeof orig !== 'function') return;
  let lastEl = null, busy = false;
  document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('.mce-add, .menu-dish[data-mce]'); if (t && !e.target.closest('.mce-x')) lastEl = t; }, true);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const clean = s => (typeof meClean === 'function' ? meClean(s) : String(s || '').replace(/★/g, '').trim());

  function close() { document.querySelectorAll('.mie-row').forEach(r => { if (r._restore) r._restore(); r.remove(); }); }
  async function commit(c, name, opt) {
    if (busy) return; busy = true;
    const y = window.scrollY, sc = document.scrollingElement ? document.scrollingElement.scrollTop : 0;
    try {
      await mceLoadState();
      const day = (_meDays[c.di] = _meDays[c.di] || {});
      const single = /^dinner\.(protein|dessert)$/.test(c.path);
      let oldRaw = '';
      if (c.path === 'dinner.protein') { day.dinner = day.dinner || { dishes: [] }; oldRaw = day.dinner.protein || ''; day.dinner.protein = name; }
      else if (c.path === 'dinner.dessert') { day.dinner = day.dinner || { dishes: [] }; oldRaw = day.dinner.dessert || ''; day.dinner.dessert = name; }
      else {
        const l = mceListOf(c.di, c.path); if (c.i != null) oldRaw = l[c.i] || '';
        const star = /★/.test(oldRaw) && (c.path === 'brunch' || c.path === 'lunch');
        const val = name + (star ? ' ★' : '');
        if (c.i == null) l.push(val); else l[c.i] = val;
      }
      if (opt) { const d = meDetail(name); d.name = opt.en || ''; d.desc = opt.desc || ''; }
      else if (oldRaw && clean(oldRaw) !== name) {   // renamed: the dish keeps its English name and description
        const od = menuItemDetail(clean(oldRaw)) || {}; const d = meDetail(name);
        if (!d.name && od.name && od.name !== clean(oldRaw)) d.name = od.name; if (!d.desc && od.desc) d.desc = od.desc;
      }
      if (opt && typeof mopTake === 'function') await mopTake(c.path, name);
      await mceCommit();
      setTimeout(() => window.scrollTo(0, y), 0); setTimeout(() => window.scrollTo(0, y), 120);
    } catch (e) { if (typeof showToast === 'function') showToast('Could not save: ' + (e.message || e)); }
    busy = false;
  }

  window.mceOpen = async function (ds, path, i) {
    const el = lastEl; lastEl = null;
    if (!el || !el.isConnected || !document.getElementById('menuGrid')) return orig.apply(this, arguments);
    close();
    const c = { ds, di: menuDayIndex(ds), path, i };
    let opts = []; try { if (typeof mopOptionsFor === 'function') opts = await mopOptionsFor(path); } catch (e) {}
    const isNew = i == null;
    let cur = '';
    if (!isNew) { try { cur = clean(el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild.textContent : el.textContent.replace(/✕/g, '')); } catch (e) {} }
    const row = document.createElement('div'); row.className = 'mie-row';
    row.style.cssText = 'display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin:3px 0;padding:4px;background:#fff7ed;border:1.5px solid #fdba74;border-radius:7px';
    const lid = 'mieL' + Date.now();
    row.innerHTML = `<input class="mie-in" list="${lid}" placeholder="${isNew ? 'Dish name…' : ''}" value="${esc(cur)}" style="flex:1;min-width:110px;padding:4px 6px;border:1.5px solid #d6cfc4;border-radius:6px;font:inherit;font-size:12px;box-sizing:border-box">
      <datalist id="${lid}">${opts.map(o => `<option value="${esc(o.name)}">${esc(o.en || '')}</option>`).join('')}</datalist>
      <button type="button" class="mie-ok" style="padding:3px 8px;border:none;border-radius:6px;background:#2d6a6a;color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer">✔</button>
      <button type="button" class="mie-no" style="padding:3px 7px;border:1.5px solid #d6cfc4;border-radius:6px;background:#fff;font:inherit;font-size:12px;cursor:pointer">✕</button>
      <button type="button" class="mie-more" style="padding:3px 6px;border:none;background:none;color:#9a3412;font:inherit;font-size:11px;text-decoration:underline;cursor:pointer">More…</button>`;
    if (isNew) { el.style.display = 'none'; row._restore = () => { el.style.display = ''; }; el.after(row); }
    else { el.style.display = 'none'; row._restore = () => { el.style.display = ''; }; el.after(row); }
    const inp = row.querySelector('.mie-in'); inp.focus(); inp.select();
    const go = () => {
      const name = clean(inp.value); if (!name) { if (typeof showToast === 'function') showToast('Type the name of the dish first.'); return; }
      if (!isNew && name === cur) { close(); return; }
      const opt = opts.find(o => clean(o.name).toLowerCase() === name.toLowerCase()) || null;
      commit(c, opt ? clean(opt.name) : name, opt);
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } else if (e.key === 'Escape') close(); });
    row.querySelector('.mie-ok').onclick = go;
    row.querySelector('.mie-no').onclick = close;
    row.querySelector('.mie-more').onclick = () => { close(); lastEl = null; orig.call(window, ds, path, i); };
    row.addEventListener('click', e => e.stopPropagation());
  };
})();
