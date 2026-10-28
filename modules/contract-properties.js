// ===== contract-properties.js — "Add Casita / Casa Grande" in the contract editor (Darlene 2026-10-28) =====
// Loaded as a classic script AFTER contracts.js and contract-library-link.js; shares global scope. Standalone: other modules are only wrapped.
// The choice is saved on the booking inside bk.contractOverrides.extraProps (list of property keys), so it lives with the retreat and survives reloads.
// It is staged in the editor and committed with the editor's own "Save for this retreat" button (so a signed contract is voided and re-signed exactly
// like any other wording change); "Cancel" throws the change away. Rates are NEVER typed here: every figure is read from the configured room types
// (AppData.roomTypes: price1 = single occupancy, price2 = per person when sharing, *_low = low season). A missing rate is flagged, not guessed.
(function () {
  const CP_PROPS = {
    casita4: { label: 'Casita 4', types: ['c4c', 'c4b'] },
    casagrande: { label: 'Casa Grande', types: ['cg1', 'cg2', 'cg3', 'cg4', 'cg5'] },
    shanti: { label: 'Casa Shanti', types: ['csh1', 'csh2'] },
  };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const usd = n => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const has = v => v != null && v !== '' && Number(v) > 0;
  let cpPending = null, cpBkId = null;

  const cpSaved = bk => { const a = bk && bk.contractOverrides && bk.contractOverrides.extraProps; return Array.isArray(a) ? a.filter(k => CP_PROPS[k]) : []; };
  const cpType = id => (typeof AppData !== 'undefined' ? (AppData.roomTypes || []) : []).find(t => t.id === id);

  // Rows for one property, season-aware. Each row: {name, basis, rate|null}
  function cpRows(key, isLow) {
    const P = CP_PROPS[key], out = [];
    const price = (rt, f) => rt ? (isLow ? (rt[f + '_low'] != null ? rt[f + '_low'] : rt[f]) : rt[f]) : null;
    if (key === 'casita4') {
      const dbl = cpType('c4c'), one = cpType('c4b');
      out.push({ name: 'Casita 4 — two double rooms', basis: 'Double occupancy', rate: has(price(dbl, 'price2')) ? usd(price(dbl, 'price2')) + ' per person, per night' : null });
      out.push({ name: 'Casita 4 — one single room (queen bed)', basis: 'Single occupancy', rate: has(price(one, 'price1')) ? usd(price(one, 'price1')) + ' per night' : null });
      return out;
    }
    if (key === 'casagrande') {
      // Casa Grande / Casa Master rates exactly as Darlene gave them (2026-10-28, from the Casa Master listing). Same figures all year (no separate low-season list was given).
      // Contract display only: the portal's own room rates / billing are unchanged.
      return [
        { name: 'Queen Room (2 beds, shared bathroom & lounge area) — 2 rooms available', basis: 'Per room', rate: '$275 per night' },
        { name: 'Garden Individual Room (individual bed, private bathroom, shared lounge area)', basis: 'Single occupancy', rate: '$275 per night' },
        { name: 'Garden King Room (also has a twin bed for another person)', basis: 'King bed', rate: '$345 per night; add $145 per night if the twin bed is used' },
        { name: 'Garden Double (2 beds)', basis: 'Per bed', rate: '$260 per bed, per night' },
        { name: 'Superior King Room (master room — a second bed can be added)', basis: 'One or two guests', rate: '$475 per night for one guest; $300 per person, per night for two' },
      ];
    }
    P.types.forEach(id => {
      const rt = cpType(id);
      if (!rt) { out.push({ name: id, basis: '', rate: null }); return; }
      const p1 = price(rt, 'price1'), p2 = price(rt, 'price2');
      const parts = [];
      if (has(p1)) parts.push(usd(p1) + ' per night, single occupancy');
      if ((rt.maxOcc || 1) >= 2 && has(p2)) parts.push(usd(p2) + ' per person, per night, double occupancy');
      out.push({ name: rt.name, basis: (rt.maxOcc || 1) >= 2 ? 'Up to ' + rt.maxOcc + ' guests' : 'Single occupancy', rate: parts.length ? parts.join(' · ') : null });
    });
    return out;
  }
  const cpMissing = (keys, isLow) => keys.some(k => cpRows(k, isLow).some(r => !r.rate));

  function cpSectionHtml(bk, isLow) {
    const keys = cpSaved(bk);
    if (!keys.length) return '';
    const th = 'padding:6px 10px;font-size:12px;border:1px solid #e5e7eb;background:#f3f4f6;text-align:left';
    const td = 'padding:5px 10px;border:1px solid #e5e7eb;font-size:12px';
    return `<h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;margin-bottom:4px">Additional Accommodations — ${isLow ? 'Low Season (Jun – Sep)' : 'High Season (Oct – May)'}</h3>` +
      keys.map(k => `<p style="font-size:13px;font-weight:700;margin:10px 0 4px">${esc(CP_PROPS[k].label)}</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 4px"><tr><th style="${th}">Room</th><th style="${th}">Occupancy</th><th style="${th}">Rate</th></tr>
        ${cpRows(k, isLow).map(r => `<tr><td style="${td}">${esc(r.name)}</td><td style="${td}">${esc(r.basis)}</td><td style="${td}">${r.rate ? esc(r.rate) : '<span style="color:#b91c1c;font-weight:700">Rate not configured — confirm before sending</span>'}</td></tr>`).join('')}</table>`).join('') +
      `<p style="font-size:11.5px;color:#7f8c9a;margin-top:6px">Same tax, gratuity and retreat add-on terms as the room rates above. Rates are per night.</p>`;
  }
  function cpSectionText(bk, isLow) {
    const keys = cpSaved(bk);
    if (!keys.length) return '';
    const dash = '─'.repeat(40);
    return 'ADDITIONAL ACCOMMODATIONS — ' + (isLow ? 'LOW SEASON (JUN – SEP)' : 'HIGH SEASON (OCT – MAY)') + '\n' + dash + '\n' +
      keys.map(k => CP_PROPS[k].label + '\n' + cpRows(k, isLow).map(r => `• ${r.name} (${r.basis}): ${r.rate || 'RATE NOT CONFIGURED — confirm before sending'}`).join('\n')).join('\n\n') +
      '\nSame tax, gratuity and retreat add-on terms as the room rates above. Rates are per night.\n\n';
  }

  // ---- contract output (screen, teacher portal, PDF/print and copied text all go through these two) ----
  const wrap = (name, build, finder) => {
    const prev = window[name];
    if (typeof prev !== 'function') return;
    window[name] = function (bk, isLow) {
      const out = prev.apply(this, arguments);
      try {
        const add = build(bk, isLow);
        if (!add || typeof out !== 'string') return out;
        const i = finder(out);
        if (i < 0) return out;
        return out.slice(0, i) + (name === 'generateContractHTML' ? add + '<hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0">' : add) + out.slice(i);
      } catch (e) { console.warn('[contract-properties]', e); return out; }
    };
  };
  wrap('generateContractHTML', cpSectionHtml, s => { const m = /<h3[^>]*>\s*Payment Terms/i.exec(s); return m ? m.index : -1; });
  wrap('generateContractText', cpSectionText, s => { const m = /(?:\n\d+\. )?PAYMENT TERMS/.exec(s); return m ? (s.charAt(m.index) === '\n' ? m.index + 1 : m.index) : -1; });

  // ---- editor panel ----
  function cpPanelHtml(bk) {
    const isLow = typeof isLowSeasonContract === 'function' ? isLowSeasonContract(bk.startDate) : false;
    const chosen = cpPending || [];
    const avail = Object.keys(CP_PROPS).filter(k => !chosen.includes(k));
    const warn = cpMissing(chosen, isLow);
    return `<div id="cpPanel" style="margin:0 0 18px;padding:12px 14px;border:1.5px solid #bae6fd;border-radius:10px;background:#f0f9ff">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;margin-bottom:8px">Additional Accommodations</div>
      ${chosen.length ? chosen.map(k => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #e0f2fe"><span style="font-weight:700;font-size:13px;flex:1">${esc(CP_PROPS[k].label)}${cpMissing([k], isLow) ? ' <span style="color:#b91c1c;font-size:11.5px">⚠ rate missing</span>' : ''}</span><button type="button" onclick="cpRemove('${k}')" style="border:none;background:none;color:#b91c1c;cursor:pointer;font-size:12px;font-family:'Jost',sans-serif">Remove</button></div>`).join('') : '<div style="font-size:12.5px;color:#6b7280;margin-bottom:4px">None added. Choose a casita or Casa Grande to list it, with its rates, in this contract.</div>'}
      ${warn ? '<div style="font-size:12px;color:#b91c1c;font-weight:600;margin-top:6px">⚠ A rate is not configured for one of these rooms. Set it in Rates before sending the contract.</div>' : ''}
      ${avail.length ? `<div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap"><select id="cpSel" style="padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:'Jost',sans-serif;font-size:13px">${avail.map(k => `<option value="${k}">${esc(CP_PROPS[k].label)}</option>`).join('')}</select><button type="button" class="btn btn-secondary" onclick="cpAdd()">+ Add Casita / Casa Grande</button></div>` : ''}
      <div style="font-size:11px;color:#6b7280;margin-top:8px">Rates come from the configured room rates. Click "Save for this retreat" below to apply.</div>
    </div>`;
  }
  function cpRefresh() {
    const bk = (typeof AppData !== 'undefined') ? AppData.bookings.find(b => b.id === cpBkId) : null;
    const el = document.getElementById('cpPanel');
    if (bk && el) el.outerHTML = cpPanelHtml(bk);
  }
  window.cpAdd = function () {
    const sel = document.getElementById('cpSel');
    if (!sel || !cpPending) return;
    if (!cpPending.includes(sel.value)) cpPending.push(sel.value);   // never a duplicate
    cpRefresh();
  };
  window.cpRemove = function (k) {
    if (!cpPending) return;
    cpPending = cpPending.filter(x => x !== k);
    cpRefresh();
  };

  const prevOpen = window.contractOpenEditor;
  if (typeof prevOpen === 'function') {
    window.contractOpenEditor = function () {
      const r = prevOpen.apply(this, arguments);
      try {
        const bk = AppData.bookings.find(b => b.id === _contractBkId);
        if (!bk) return r;
        cpBkId = bk.id; cpPending = cpSaved(bk).slice();
        const pv = document.getElementById('contractPreview');
        const inner = pv && pv.firstElementChild;
        if (inner) {
          const wrapEl = document.createElement('div');
          wrapEl.innerHTML = cpPanelHtml(bk);
          // after the info note and rates blocks, before the wording sections: put it right after the first (info) box
          inner.insertBefore(wrapEl.firstElementChild, inner.children[1] || null);
        }
      } catch (e) { console.warn('[contract-properties]', e); }
      return r;
    };
  }
  const prevClose = window.contractCloseEditor;
  if (typeof prevClose === 'function') window.contractCloseEditor = function () { cpPending = null; return prevClose.apply(this, arguments); };

  // The editor's save rebuilds bk.contractOverrides from its text boxes, which would drop this list, so put the staged choice back right after it.
  const prevSave = window.contractSaveEditor;
  if (typeof prevSave === 'function') {
    window.contractSaveEditor = function () {
      const staged = cpPending ? cpPending.slice() : null;
      const bkId = _contractBkId;
      const r = prevSave.apply(this, arguments);
      try {
        const bk = AppData.bookings.find(b => b.id === bkId);
        if (bk && staged) {
          const before = JSON.stringify(cpSaved(bk));
          // prevSave may have set contractOverrides to null (nothing else customised)
          const ov = Object.assign({}, bk.contractOverrides || {});
          if (staged.length) ov.extraProps = staged; else delete ov.extraProps;
          bk.contractOverrides = Object.keys(ov).length ? ov : null;
          saveAll();
          try { logActivity('Contract properties', staged.length ? 'Added to contract: ' + staged.map(k => CP_PROPS[k].label).join(', ') : 'No additional accommodations', bk.id); } catch (e) {}
          if (typeof contractRenderPreview === 'function') contractRenderPreview(bk);
        }
        cpPending = null;
      } catch (e) { console.warn('[contract-properties] save', e); }
      return r;
    };
  }

  // Est. Quote: when Casita 4 rooms are in the quote, say what each price is based on (the amounts themselves still come from the existing quote maths).
  const prevQuote = window.renderEstQuote;
  if (typeof prevQuote === 'function') {
    window.renderEstQuote = function (lblId, bodyId) {
      const r = prevQuote.apply(this, arguments);
      try {
        const bk = (typeof regSelBk !== 'undefined') ? regSelBk : null;
        const body = document.getElementById(bodyId || 'estQuoteBody');
        if (!bk || !body) return r;
        const c4 = new Set(['c4b', 'c4c'].flatMap(id => (cpType(id) || {}).rooms || []));
        if (!(bk.blockedRooms || []).some(x => c4.has(x))) return r;
        const n = document.createElement('div');
        n.style.cssText = 'margin-top:10px;padding:9px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#78350f';
        n.innerHTML = '<b>Casita 4:</b> the two double rooms are priced <b>per person, per night, double occupancy</b>; the single queen-bed room is priced <b>per night, single occupancy</b>. Tax, gratuity and add-ons are added as for every other room.';
        body.appendChild(n);
      } catch (e) {}
      return r;
    };
  }
})();
