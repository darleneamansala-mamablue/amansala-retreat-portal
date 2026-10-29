// ===== contract-room-counts.js — "how many rooms of each type we are offering" on ONE retreat's contract (Darlene 2026-10-29) =====
// Loaded as a classic script AFTER contract-hide-rooms.js; shares global scope. Standalone: other modules are only wrapped.
// In the contract editor a "Rooms offered" box lists each room type of the rates table with an optional number. Leave every box empty and the contract is exactly as before
// (most contracts). Fill some in and the rates table gets a "Rooms" column showing that number (a "—" for types left empty). Saved on the booking in
// bk.contractOverrides.roomCounts ({room type name: number}), staged until "Save for this retreat" like the other editor boxes. A "Fill from this retreat's rooms" button
// counts the rooms already blocked for the retreat, per type, as a starting point to edit. Nothing in the template, prices or room list changes.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // rates-table row name -> portal room type id (used only by the "Fill from this retreat's rooms" button)
  const TYPE_OF = { 'Beachfront King': 'rt1', 'Superior King': 'rt2', 'Garden Plus King': 'rt3', 'Garden King': 'rt4', 'Garden Basic (private)': 'rt5', 'Double Beachview': 'rt6', 'Double Room': 'rt7', 'Triple Room': 'rt8' };
  let pend = null, names = [];

  const saved = bk => { const o = bk && bk.contractOverrides && bk.contractOverrides.roomCounts; return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; };
  const has = o => Object.keys(o).some(k => Number(o[k]) > 0);

  // ---- contract output ----
  function htmlAdd(html, counts) {
    const doc = new DOMParser().parseFromString('<div id="r">' + html + '</div>', 'text/html');
    doc.querySelectorAll('table').forEach(t => {
      const first = t.querySelector('tr'); if (!first || !/Room Type/i.test(first.textContent)) return;
      const th0 = first.children[0], td = 'padding:5px 10px;border:1px solid #e5e7eb;text-align:center;font-size:12px';
      const th = doc.createElement('th'); th.setAttribute('style', th0.getAttribute('style') || 'padding:6px 10px;font-size:12px;border:1px solid #e5e7eb'); th.style.textAlign = 'center'; th.textContent = 'Rooms';
      th0.after(th);
      [...t.querySelectorAll('tr')].slice(1).forEach(tr => {
        const c = tr.children[0]; if (!c) return;
        const n = Number(counts[c.textContent.trim()]);
        const cell = doc.createElement('td'); cell.setAttribute('style', td); cell.textContent = n > 0 ? String(n) : '—';
        c.after(cell);
      });
    });
    return doc.getElementById('r').innerHTML;
  }
  function textAdd(txt, counts) {
    return Object.keys(counts).filter(k => Number(counts[k]) > 0).reduce((t, name) => {
      const n = Number(counts[name]), base = name.replace(/\s*\(.*\)\s*$/, ''), lab = ` (${n} room${n !== 1 ? 's' : ''})`;
      return t.replace(new RegExp('^([•\\-*]?\\s*)(' + reEsc(name) + '|' + reEsc(base) + ')(\\s*:)', 'gm'), '$1$2' + lab + '$3');
    }, txt);
  }
  const wrap = (name, fn) => {
    const prev = window[name];
    if (typeof prev !== 'function') return;
    window[name] = function (bk) {
      const out = prev.apply(this, arguments);
      try { const c = saved(bk); return (has(c) && typeof out === 'string') ? fn(out, c) : out; } catch (e) { console.warn('[contract-room-counts]', e); return out; }
    };
  };
  wrap('generateContractHTML', htmlAdd);
  wrap('generateContractText', textAdd);

  // ---- editor box ----
  function rateNames(bk) {
    const keep = bk.contractOverrides;
    let html = '';
    try {
      bk.contractOverrides = keep ? Object.assign({}, keep, { roomCounts: {} }) : null;
      html = generateContractHTML(bk, typeof isLowSeasonContract === 'function' ? isLowSeasonContract(bk.startDate) : false, new Date());
    } finally { bk.contractOverrides = keep; }
    const doc = new DOMParser().parseFromString(html, 'text/html'), out = [];
    doc.querySelectorAll('table').forEach(t => {
      const head = (t.querySelector('tr') || {}).textContent || ''; if (!/Room Type/i.test(head)) return;
      [...t.querySelectorAll('tr')].slice(1).forEach(tr => { const c = tr.querySelector('td'), n = c && c.textContent.trim(); if (n && !out.includes(n)) out.push(n); });
    });
    return out;
  }
  function panelHtml() {
    return `<div id="crcPanel" style="margin:0 0 18px;padding:12px 14px;border:1.5px solid #bae6fd;border-radius:10px;background:#f0f9ff">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a">Rooms offered (optional)</div><button type="button" onclick="crcFill()" style="padding:5px 11px;border:1.5px solid #7dd3fc;border-radius:8px;background:#fff;color:#0369a1;font-family:'Jost',sans-serif;font-size:12px;font-weight:700;cursor:pointer">Fill from this retreat's rooms</button></div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:8px">Type how many rooms of each type you are offering this retreat. Leave them all empty and the contract shows no counts. Types left empty show “—”.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px 14px">
        ${names.map((n, i) => `<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input id="crc-${i}" type="number" min="0" step="1" value="${pend && Number(pend[n]) > 0 ? Number(pend[n]) : ''}" oninput="crcSet(${i},this.value)" style="width:64px;padding:5px 7px;border:1.5px solid #e5e7eb;border-radius:7px;font-family:'Jost',sans-serif;font-size:13px"> ${esc(n)}</label>`).join('') || '<span style="font-size:12.5px;color:#6b7280">No rates table in this contract.</span>'}
      </div>
      <div style="font-size:11px;color:#6b7280;margin-top:8px">Click "Save for this retreat" below to apply.</div></div>`;
  }
  window.crcSet = function (i, v) { if (!pend) return; const n = names[i], x = parseInt(v, 10); if (x > 0) pend[n] = x; else delete pend[n]; };
  window.crcFill = function () {
    if (!pend) return;
    const bk = AppData.bookings.find(b => b.id === _contractBkId); if (!bk) return;
    const seen = new Set(), byType = {};
    (bk.blockedRooms || []).forEach(r => {
      let owner = (AppData.roomTypes || []).find(t => (t.rooms || []).includes(r)); if (!owner) return;
      let unit = r;
      if (/^bd[1-4]$/.test(owner.id)) { const s = splitDoubleHalf(r); if (s && s.base) { unit = String(s.base).trim(); owner = (AppData.roomTypes || []).find(t => (t.rooms || []).includes(unit) && !/^bd/.test(t.id)) || owner; } }
      if (seen.has(unit)) return; seen.add(unit);
      byType[owner.id] = (byType[owner.id] || 0) + 1;
    });
    names.forEach((n, i) => { const id = TYPE_OF[n]; const c = id ? byType[id] : 0; if (c > 0) pend[n] = c; else delete pend[n]; const el = document.getElementById('crc-' + i); if (el) el.value = c > 0 ? c : ''; });
  };

  const prevOpen = window.contractOpenEditor;
  if (typeof prevOpen === 'function') {
    window.contractOpenEditor = function () {
      const r = prevOpen.apply(this, arguments);
      try {
        const bk = AppData.bookings.find(b => b.id === _contractBkId); if (!bk) return r;
        pend = Object.assign({}, saved(bk)); names = rateNames(bk);
        const host = document.getElementById('contractPreview'), inner = host && host.firstElementChild;
        if (inner) {
          const d = document.createElement('div'); d.innerHTML = panelHtml();
          const after = document.getElementById('chrPanel') || document.getElementById('csePanel') || document.getElementById('cpPanel');
          if (after && after.parentNode === inner) inner.insertBefore(d.firstElementChild, after.nextSibling); else inner.insertBefore(d.firstElementChild, inner.children[1] || null);
        }
      } catch (e) { console.warn('[contract-room-counts]', e); }
      return r;
    };
  }
  const prevClose = window.contractCloseEditor;
  if (typeof prevClose === 'function') window.contractCloseEditor = function () { pend = null; return prevClose.apply(this, arguments); };

  // The editor's own save rebuilds bk.contractOverrides (dropping this), so put the staged numbers back right after it.
  const prevSave = window.contractSaveEditor;
  if (typeof prevSave === 'function') {
    window.contractSaveEditor = function () {
      const staged = pend ? Object.assign({}, pend) : null, bkId = _contractBkId;
      const r = prevSave.apply(this, arguments);
      try {
        const bk = AppData.bookings.find(b => b.id === bkId);
        if (bk && staged) {
          const clean = {}; Object.keys(staged).forEach(k => { if (Number(staged[k]) > 0) clean[k] = Number(staged[k]); });
          const ov = Object.assign({}, bk.contractOverrides || {});
          if (Object.keys(clean).length) ov.roomCounts = clean; else delete ov.roomCounts;
          bk.contractOverrides = Object.keys(ov).length ? ov : null;
          saveAll();
          try { logActivity('Contract room counts', Object.keys(clean).length ? 'Rooms offered shown: ' + Object.keys(clean).map(k => k + ' ' + clean[k]).join(', ') : 'No room counts', bk.id); } catch (e) {}
          if (typeof contractRenderPreview === 'function') contractRenderPreview(bk);
        }
        pend = null;
      } catch (e) { console.warn('[contract-room-counts] save', e); }
      return r;
    };
  }
})();
