// ===== contract-sections.js — "Add a section" in the contract editor (Darlene 2026-10-28) =====
// Loaded as a classic script AFTER contracts.js, contract-library-link.js and contract-properties.js; shares global scope. Standalone: other modules are only wrapped.
// A custom section = {title, body, pos}. They are saved on the booking inside bk.contractOverrides.customSections, so they belong to that retreat only.
// Like every edit in the contract editor they are staged until "Save for this retreat" (a signed contract is voided and must be re-signed); "Cancel" throws them away.
// They show wherever the contract does: screen, teacher portal, Download PDF / Print and the copied text.
(function () {
  const POS = { payment: 'Before Payment Terms', cancel: 'Before Cancellation Policy', end: 'At the end, before the signature' };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let pend = null, pendBk = null;

  const saved = bk => { const a = bk && bk.contractOverrides && bk.contractOverrides.customSections; return Array.isArray(a) ? a.filter(s => s && (s.title || s.body)) : []; };

  const htmlOf = s => `<h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;margin-bottom:10px">${esc(s.title || 'Additional Terms')}</h3>` +
    String(s.body || '').replace(/\r/g, '').split('\n\n').filter(p => p.trim()).map(p => `<p style="font-size:12.5px;line-height:1.85;color:#374151;margin-top:8px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const hr = '<hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0">';
  const textOf = s => (s.title || 'Additional Terms').toUpperCase() + '\n' + '─'.repeat(40) + '\n' + String(s.body || '').replace(/\r/g, '') + '\n\n';

  // ---- contract output ----
  const wrapGen = (name, find, piece, sep) => {
    const prev = window[name];
    if (typeof prev !== 'function') return;
    window[name] = function (bk) {
      let out = prev.apply(this, arguments);
      try {
        if (typeof out !== 'string') return out;
        const list = saved(bk);
        if (!list.length) return out;
        ['payment', 'cancel', 'end'].forEach(pos => {
          const these = list.filter(s => (s.pos || 'end') === pos);
          if (!these.length) return;
          const i = find(out, pos);
          if (i < 0) return;
          out = out.slice(0, i) + these.map(s => piece(s) + sep).join('') + out.slice(i);
        });
      } catch (e) { console.warn('[contract-sections]', e); }
      return out;
    };
  };
  const hFind = (s, pos) => {
    if (pos === 'payment') { const m = /<h3[^>]*>\s*Payment Terms/i.exec(s); return m ? m.index : -1; }
    if (pos === 'cancel') { const m = /<h3[^>]*>\s*Cancellation Policy/i.exec(s); return m ? m.index : -1; }
    const k = s.indexOf('Special Notes'); if (k < 0) return -1; return s.lastIndexOf('<h3', k);
  };
  const tFind = (s, pos) => {
    const re = pos === 'payment' ? /(?:\n\d+\. )?PAYMENT TERMS/ : pos === 'cancel' ? /(?:\n\d+\. )?CANCELLATION POLICY/ : null;
    if (re) { const m = re.exec(s); return m ? (s.charAt(m.index) === '\n' ? m.index + 1 : m.index) : -1; }
    const k = s.indexOf('SPECIAL NOTES'); if (k >= 0) return k;
    const dash = '─'.repeat(40), g = s.indexOf('Retreat Leader Signature'); return g < 0 ? -1 : s.lastIndexOf(dash, g);
  };
  wrapGen('generateContractHTML', hFind, htmlOf, hr);
  wrapGen('generateContractText', tFind, textOf, '');

  // ---- editor panel ----
  function rowHtml(s, i) {
    return `<div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:10px;background:#fff">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
        <input value="${esc(s.title)}" placeholder="Section title (e.g. Special Arrangements)" oninput="cseSet(${i},'title',this.value)" style="flex:1;min-width:200px;padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:'Jost',sans-serif;font-size:13px;font-weight:600">
        <select onchange="cseSet(${i},'pos',this.value)" style="padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:'Jost',sans-serif;font-size:12.5px">${Object.keys(POS).map(k => `<option value="${k}"${(s.pos || 'end') === k ? ' selected' : ''}>${POS[k]}</option>`).join('')}</select>
        <button type="button" onclick="cseRemove(${i})" style="border:none;background:none;color:#b91c1c;cursor:pointer;font-size:12px;font-family:'Jost',sans-serif">Remove</button>
      </div>
      <textarea oninput="cseSet(${i},'body',this.value)" placeholder="Write the section text. Leave a blank line between paragraphs." style="width:100%;box-sizing:border-box;min-height:110px;resize:vertical;border:1.5px solid #e5e7eb;border-radius:8px;padding:10px 12px;font-family:'Jost',sans-serif;font-size:13px;line-height:1.6">${esc(s.body)}</textarea>
    </div>`;
  }
  function panelHtml() {
    return `<div id="csePanel" style="margin:0 0 18px;padding:12px 14px;border:1.5px solid #bae6fd;border-radius:10px;background:#f0f9ff">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;margin-bottom:8px">Extra Sections for this retreat</div>
      ${(pend || []).length ? pend.map(rowHtml).join('') : '<div style="font-size:12.5px;color:#6b7280;margin-bottom:6px">None added. Add a section with its own title and text, and choose where it goes in the contract.</div>'}
      <button type="button" class="btn btn-secondary" onclick="cseAdd()">+ Add a section</button>
      <div style="font-size:11px;color:#6b7280;margin-top:8px">Only this retreat's contract changes. Click "Save for this retreat" below to apply.</div>
    </div>`;
  }
  function refresh() { const el = document.getElementById('csePanel'); if (el) el.outerHTML = panelHtml(); }
  window.cseAdd = function () { if (!pend) return; pend.push({ title: '', body: '', pos: 'end' }); refresh(); };
  window.cseRemove = function (i) { if (!pend) return; pend.splice(i, 1); refresh(); };
  window.cseSet = function (i, f, v) { if (pend && pend[i]) pend[i][f] = v; };   // no re-render, so typing never loses focus

  const prevOpen = window.contractOpenEditor;
  if (typeof prevOpen === 'function') {
    window.contractOpenEditor = function () {
      const r = prevOpen.apply(this, arguments);
      try {
        const bk = AppData.bookings.find(b => b.id === _contractBkId);
        if (!bk) return r;
        pendBk = bk.id; pend = saved(bk).map(s => ({ title: s.title || '', body: s.body || '', pos: s.pos || 'end' }));
        const host = document.getElementById('contractPreview');
        const inner = host && host.firstElementChild;
        if (inner) {
          const d = document.createElement('div');
          d.innerHTML = panelHtml();
          const after = document.getElementById('cpPanel');
          if (after && after.parentNode === inner) inner.insertBefore(d.firstElementChild, after.nextSibling);
          else inner.insertBefore(d.firstElementChild, inner.children[1] || null);
        }
      } catch (e) { console.warn('[contract-sections]', e); }
      return r;
    };
  }
  const prevClose = window.contractCloseEditor;
  if (typeof prevClose === 'function') window.contractCloseEditor = function () { pend = null; return prevClose.apply(this, arguments); };

  // The editor's own save rebuilds bk.contractOverrides from its text boxes (dropping this list), so put the staged sections back right after it.
  const prevSave = window.contractSaveEditor;
  if (typeof prevSave === 'function') {
    window.contractSaveEditor = function () {
      const staged = pend ? pend.map(s => ({ title: String(s.title || '').trim(), body: String(s.body || '').replace(/\r/g, '').trim(), pos: s.pos || 'end' })).filter(s => s.body) : null;
      const bkId = _contractBkId;
      const r = prevSave.apply(this, arguments);
      try {
        const bk = AppData.bookings.find(b => b.id === bkId);
        if (bk && staged) {
          const ov = Object.assign({}, bk.contractOverrides || {});
          if (staged.length) ov.customSections = staged; else delete ov.customSections;
          bk.contractOverrides = Object.keys(ov).length ? ov : null;
          saveAll();
          try { logActivity('Contract sections', staged.length ? 'Extra sections in contract: ' + staged.map(s => s.title || 'Additional Terms').join(', ') : 'No extra sections', bk.id); } catch (e) {}
          if (typeof contractRenderPreview === 'function') contractRenderPreview(bk);
        }
        pend = null;
      } catch (e) { console.warn('[contract-sections] save', e); }
      return r;
    };
  }
})();
