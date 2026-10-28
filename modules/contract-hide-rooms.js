// ===== contract-hide-rooms.js — leave certain room types out of ONE retreat's contract (Darlene 2026-10-28) =====
// Loaded as a classic script AFTER contracts.js, contract-library-link.js, contract-properties.js and contract-sections.js. Standalone: other modules are only wrapped.
// In the contract editor a "Room types in this contract" box lists every room type of the rates table with a tick; un-tick one and it is left out of that
// retreat's contract (screen, teacher portal, Download PDF / Print and copied text). Saved on the booking in bk.contractOverrides.hideRooms (list of room names),
// staged until "Save for this retreat" like every other editor change. Nothing in the template or in prices changes.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let pend = null, pendBk = null, allNames = [];

  const saved = bk => { const a = bk && bk.contractOverrides && bk.contractOverrides.hideRooms; return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x) : []; };

  // ---- contract output ----
  const htmlHide = (html, hidden) => hidden.reduce((h, name) => {
    const n = reEsc(esc(name)).replace(/&quot;/g, '(?:&quot;|")');
    return h.replace(new RegExp('<tr[^>]*>\\s*<td[^>]*>\\s*' + n + '\\s*</td>[\\s\\S]*?</tr>', 'g'), '');
  }, html);
  const textHide = (txt, hidden) => hidden.reduce((t, name) => t.replace(new RegExp('^[•\\-*]\\s*' + reEsc(name) + '\\s*:.*\\n?', 'gm'), ''), txt);
  const wrapGen = (name, fn) => {
    const prev = window[name];
    if (typeof prev !== 'function') return;
    window[name] = function (bk) {
      const out = prev.apply(this, arguments);
      try { const h = saved(bk); return (h.length && typeof out === 'string') ? fn(out, h) : out; } catch (e) { console.warn('[contract-hide-rooms]', e); return out; }
    };
  };
  wrapGen('generateContractHTML', htmlHide);
  wrapGen('generateContractText', textHide);

  // ---- editor panel ----
  // Room names of the rates table(s) as the contract would draw them with nothing hidden.
  function rateNames(bk) {
    const keep = bk.contractOverrides;
    let html = '';
    try {
      bk.contractOverrides = keep ? Object.assign({}, keep, { hideRooms: [] }) : null;
      const isLow = typeof isLowSeasonContract === 'function' ? isLowSeasonContract(bk.startDate) : false;
      html = generateContractHTML(bk, isLow, new Date());
    } finally { bk.contractOverrides = keep; }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const names = [];
    doc.querySelectorAll('table').forEach(t => {
      const head = (t.querySelector('tr') || {}).textContent || '';
      if (!/Room Type/i.test(head)) return;
      t.querySelectorAll('tr').forEach((tr, i) => { if (!i) return; const c = tr.querySelector('td'); const n = c && c.textContent.trim(); if (n && !names.includes(n)) names.push(n); });
    });
    return names;
  }
  function panelHtml() {
    return `<div id="chrPanel" style="margin:0 0 18px;padding:12px 14px;border:1.5px solid #bae6fd;border-radius:10px;background:#f0f9ff">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;margin-bottom:8px">Room types in this contract</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:8px">Untick a room type to leave it out of this retreat's contract. Other retreats and the rates themselves don't change.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px 14px">
        ${allNames.map((n, i) => `<label style="display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer"><input type="checkbox" ${(pend || []).includes(n) ? '' : 'checked'} onchange="chrToggle(${i},this.checked)"> ${esc(n)}</label>`).join('') || '<span style="font-size:12.5px;color:#6b7280">No rates table in this contract.</span>'}
      </div>
      <div style="font-size:11px;color:#6b7280;margin-top:8px">Click "Save for this retreat" below to apply.</div>
    </div>`;
  }
  window.chrToggle = function (i, on) {
    if (!pend) return;
    const n = allNames[i];
    pend = pend.filter(x => x !== n);
    if (!on) pend.push(n);
  };

  const prevOpen = window.contractOpenEditor;
  if (typeof prevOpen === 'function') {
    window.contractOpenEditor = function () {
      const r = prevOpen.apply(this, arguments);
      try {
        const bk = AppData.bookings.find(b => b.id === _contractBkId);
        if (!bk) return r;
        pendBk = bk.id; pend = saved(bk).slice();
        allNames = rateNames(bk);
        saved(bk).forEach(n => { if (!allNames.includes(n)) allNames.push(n); });
        const host = document.getElementById('contractPreview');
        const inner = host && host.firstElementChild;
        if (inner) {
          const d = document.createElement('div');
          d.innerHTML = panelHtml();
          const after = document.getElementById('csePanel') || document.getElementById('cpPanel');
          if (after && after.parentNode === inner) inner.insertBefore(d.firstElementChild, after.nextSibling);
          else inner.insertBefore(d.firstElementChild, inner.children[1] || null);
        }
      } catch (e) { console.warn('[contract-hide-rooms]', e); }
      return r;
    };
  }
  const prevClose = window.contractCloseEditor;
  if (typeof prevClose === 'function') window.contractCloseEditor = function () { pend = null; return prevClose.apply(this, arguments); };

  // The editor's own save rebuilds bk.contractOverrides (dropping this list), so put the staged choice back right after it.
  const prevSave = window.contractSaveEditor;
  if (typeof prevSave === 'function') {
    window.contractSaveEditor = function () {
      const staged = pend ? pend.slice() : null;
      const bkId = _contractBkId;
      const r = prevSave.apply(this, arguments);
      try {
        const bk = AppData.bookings.find(b => b.id === bkId);
        if (bk && staged) {
          const ov = Object.assign({}, bk.contractOverrides || {});
          if (staged.length) ov.hideRooms = staged; else delete ov.hideRooms;
          bk.contractOverrides = Object.keys(ov).length ? ov : null;
          saveAll();
          try { logActivity('Contract room types', staged.length ? 'Left out of contract: ' + staged.join(', ') : 'All room types shown', bk.id); } catch (e) {}
          if (typeof contractRenderPreview === 'function') contractRenderPreview(bk);
        }
        pend = null;
      } catch (e) { console.warn('[contract-hide-rooms] save', e); }
      return r;
    };
  }
})();
