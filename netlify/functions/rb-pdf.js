'use strict';
// Minimal, dependency-free PDF writer (Letter, Helvetica) used for the booking record. Text only: headings, wrapped paragraphs,
// rules. Characters outside Latin-1 become "?" (WinAnsi). Exports makePdf(blocks) -> Buffer.
// blocks: [{t:'h1'|'h2'|'p'|'small'|'kv'|'rule'|'space', text, k, v, bold}]

const W = 612, H = 792, M = 54;
// Helvetica advance widths (1/1000 em) for ASCII 32..126
const HW = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
function clean(s) {
  return String(s == null ? '' : s)
    .replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/·|•/g, '-').replace(/…/g, '...').replace(/→/g, '->').replace(/ /g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
}
function width(s, size, bold) {
  let w = 0;
  for (const ch of s) { const c = ch.charCodeAt(0); w += (c >= 32 && c <= 126 ? HW[c - 32] : 556); }
  return (w / 1000) * size * (bold ? 1.06 : 1);
}
function wrap(text, size, maxW, bold) {
  const out = [];
  String(text).split('\n').forEach((para) => {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); return; }
    let line = '';
    words.forEach((w) => {
      const t = line ? line + ' ' + w : w;
      if (width(t, size, bold) <= maxW) line = t; else { if (line) out.push(line); line = w; }
    });
    if (line) out.push(line);
  });
  return out;
}
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

function makePdf(blocks) {
  const pages = [[]];
  let y = H - M;
  const cur = () => pages[pages.length - 1];
  const need = (h) => { if (y - h < M + 18) { pages.push([]); y = H - M; } };
  const text = (s, x, size, bold, color) => cur().push(`${color || '0.12 0.17 0.15'} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y.toFixed(1)} Td (${esc(clean(s))}) Tj ET`);
  const maxW = W - 2 * M;

  blocks.forEach((b) => {
    if (b.t === 'space') { y -= b.h || 8; return; }
    if (b.t === 'rule') { need(26); y -= 6; cur().push(`0.75 0.72 0.68 RG 0.6 w ${M} ${y.toFixed(1)} m ${W - M} ${y.toFixed(1)} l S`); y -= 20; return; }
    if (b.t === 'kv') {
      const lines = wrap(clean(b.v), 10, maxW - 130, false);
      need(lines.length * 13 + 2);
      text(b.k, M, 9, true, '0.40 0.34 0.28');
      lines.forEach((l, i) => { text(l, M + 130, 10, false); y -= 13; });
      if (!lines.length) y -= 13;
      return;
    }
    const style = { h1: [20, true, 26], h2: [12, true, 17], p: [10, false, 14], small: [8.5, false, 11.5] }[b.t] || [10, false, 14];
    const [size, bold, lead] = style;
    const lines = wrap(clean(b.text), size, maxW - (b.indent || 0), b.bold || bold);
    need(lines.length * lead + 2);
    lines.forEach((l) => { text(l, M + (b.indent || 0), size, b.bold || bold, b.color); y -= lead; });
  });

  // ---- assemble ----
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('PAGES');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  pages.forEach((ops, i) => {
    const footer = `0.5 0.5 0.5 rg BT /F1 8 Tf ${M} ${M - 22} Td (${esc(clean('Amansala Tulum - booking record - page ' + (i + 1) + ' of ' + pages.length))}) Tj ET`;
    const stream = ops.concat([footer]).join('\n');
    const c = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    const pg = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${c} 0 R >>`);
    kids.push(`${pg} 0 R`);
  });
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}
module.exports = { makePdf };
