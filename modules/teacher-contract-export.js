// ===== teacher-contract-export.js — "Download PDF" and "Print" for the contract a teacher sees in her portal (Darlene 2026-10-28) =====
// Wraps renderTeacherContract: after it draws the contract, a small button bar is put above it (only when the contract is actually shown).
// It copies what is on screen at click time (so the signature block is included once she has signed). Nothing is saved or changed.
(function () {
  const BAR_ID = 'tceBar';

  function tceName() {
    let bk = null;
    try { const id = localStorage.getItem('teacher_bk_id') || sessionStorage.getItem('teacher_bk_id'); bk = (AppData.bookings || []).find(b => b.id === id); } catch (e) {}
    const n = (bk && (bk.leaderName || bk.retreatName)) || 'retreat';
    return n.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') + '-contract';
  }

  function tceClone() {
    const src = document.getElementById('tcContractBody');
    if (!src || src.style.display === 'none') return null;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#fff;color:#1a2332;font-family:Jost,Arial,sans-serif;padding:0;width:720px';
    wrap.innerHTML = src.innerHTML;
    return wrap;
  }

  window.tceDownload = async function () {
    const el = tceClone();
    if (!el) return;
    if (typeof html2pdf === 'undefined') { if (typeof showToast === 'function') showToast('PDF library failed to load — check your connection and try again.'); return; }
    if (typeof showToast === 'function') showToast('Preparing your contract PDF…');
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-10000px;top:0';
    holder.appendChild(el);
    document.body.appendChild(holder);
    try {
      await html2pdf().set({ margin: 10, filename: tceName() + '.pdf', image: { type: 'jpeg', quality: .95 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] } }).from(el).save();
    } catch (e) {
      if (typeof showToast === 'function') showToast('Could not make the PDF: ' + e.message);
    }
    holder.remove();
  };

  window.tcePrint = function () {
    const el = tceClone();
    if (!el) return;
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    const d = f.contentWindow.document;
    d.open();
    d.write('<!doctype html><html><head><meta charset="utf-8"><title>' + tceName() + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&family=Cormorant+Garamond:wght@500;600;700&display=swap" rel="stylesheet">' +
      '<style>@page{size:letter;margin:14mm}body{margin:0;font-family:Jost,Arial,sans-serif;color:#1a2332}</style></head><body>' + el.innerHTML + '</body></html>');
    d.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(() => f.remove(), 2000); }, 600);
  };

  function tceBar() {
    const body = document.getElementById('tcContractBody');
    if (!body) return;
    let bar = document.getElementById(BAR_ID);
    const shown = body.style.display !== 'none';
    if (!shown) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = BAR_ID;
      bar.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin:0 0 10px';
      const btn = 'padding:9px 16px;border-radius:10px;border:1.5px solid #2d6a6a;background:#fff;color:#2d6a6a;font-family:Jost,sans-serif;font-size:13.5px;font-weight:700;cursor:pointer';
      bar.innerHTML = '<button type="button" onclick="tceDownload()" style="' + btn + '">⬇ Download PDF</button><button type="button" onclick="tcePrint()" style="' + btn + '">🖨 Print</button>';
      body.parentNode.insertBefore(bar, body);
    }
  }

  if (typeof renderTeacherContract === 'function') {
    const orig = renderTeacherContract;
    window.renderTeacherContract = renderTeacherContract = function () {
      const r = orig.apply(this, arguments);
      try { tceBar(); } catch (e) { console.warn('[tce]', e); }
      return r;
    };
  }
})();
