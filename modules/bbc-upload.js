// ===== bbc-upload.js — build a BBC schedule from one you typed out (upload a file or paste it) (Darlene 2026-10-25) =====
// Loaded as a classic script AFTER bbc-schedule.js; shares global scope. Standalone: bbc-schedule.js is not edited. Adds a box to the "New BBC Schedule" form.
// The typed schedule becomes an ordinary BBC schedule (any number of days — a 2-day retreat is fine), saved as a Draft. Open it, fix anything, press "Confirm Schedule", and every
// teacher then confirms their own classes from their login (?mode=confirm), exactly like a generated schedule. Teachers are matched by the name written on each line.
// Understood layout (the same one "Copy as text" produces; tables pasted from Word work too):
//   a day line:      "Saturday, October 31"  /  "Day 1"  /  "Friday"        (days are dated from the Arrival date on the form, in order)
//   a class line:    "7:00 – 7:15  Grand Rising with Ryan | Beachfront"   or   "4:45 PM | Sculpt & Tone | Ryan | Grande"
//   meals (Breakfast, Brunch, Lunch, Dinner, Snack, Coffee/Tea) are listed but need no teacher; any other line under a day becomes that day's note.
// Files: .txt / .csv / .md and Word .docx are read here; for a PDF or Pages file, copy the text and paste it in the box.

const BU_MONTHS = 'january february march april may june july august september october november december'.split(' ');
const BU_DAYS = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i;
const BU_TIME = /^\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:(?:[-–—]|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?)?/i;
const BU_MEAL = /^(breakfast|brunch|lunch|dinner|snack|coffee|tea|fruit|welcome drink)\b/i;

function buTime(h, m, ap) {                       // the BBC editor shows 12-hour times without am/pm ("4:45 – 5:30"); 7–11 are mornings, 12–6 afternoons
  h = parseInt(h, 10); m = m == null || m === '' ? '00' : String(m).padStart(2, '0');
  if (ap) ap = ap[0].toLowerCase();
  if (h > 12) h -= 12; else if (h === 0) h = 12;
  return h + ':' + m;
}
function buHeader(line) {
  if (BU_TIME.test(line) && /^\s*\d{1,2}\s*([:.]\d{2}|a\.?m|p\.?m)/i.test(line)) return false;     // starts with a clock time
  const l = line.trim();
  if (/^day\s*\d+/i.test(l)) return true;
  if (BU_DAYS.test(l) && l.length < 60) return true;
  const low = l.toLowerCase();
  return l.length < 50 && BU_MONTHS.some(mo => low.indexOf(mo) >= 0) && /\d/.test(l);
}
function buKnown(list, s) { s = String(s || '').trim().toLowerCase(); return list.find(x => x.toLowerCase() === s) || ''; }

// text -> [{ note, slots:[{time, activity, instructor, location, type}] }, ...]
function buParse(text) {
  const insts = typeof BBC_INSTRUCTORS_LIST !== 'undefined' ? BBC_INSTRUCTORS_LIST : [], locs = (typeof BBC_LOCATIONS_LIST !== 'undefined' ? BBC_LOCATIONS_LIST : []).concat(['Chica Rooftop', 'Rooftop']);
  const days = []; let cur = null;
  String(text || '').split(/\r?\n/).forEach(raw => {
    const line = raw.replace(/\s+$/, '').trim(); if (!line) return;
    if (/^with love/i.test(line)) return;
    const tm = BU_TIME.exec(line), startsWithTime = tm && /^\s*\d{1,2}\s*([:.]\d{2}|a\.?m|p\.?m)/i.test(line);
    if (!startsWithTime) {
      if (buHeader(line)) { cur = { note: '', slots: [], title: line }; days.push(cur); return; }
      if (cur) cur.note = (cur.note ? cur.note + ' · ' : '') + line.replace(/^prompt:\s*/i, '');
      return;
    }
    if (!cur) { cur = { note: '', slots: [], title: '' }; days.push(cur); }
    let time = buTime(tm[1], tm[2], tm[3] || tm[6]);
    if (tm[4]) time += ' – ' + buTime(tm[4], tm[5], tm[6] || tm[3]);
    const rest = line.slice(tm[0].length).replace(/^[\s\-–—:|\t]+/, '');
    const fields = rest.split(/\s*\|\s*|\t+/).map(s => s.trim()).filter(Boolean);
    let activity = '', instructor = '', location = '';
    const leftovers = [];
    fields.forEach(f => {
      const k = buKnown(locs, f);
      if (k) { location = k === 'Rooftop' ? 'Chica Rooftop' : k; return; }
      const i = buKnown(insts, f); if (i) { instructor = i; return; }
      leftovers.push(f);
    });
    activity = leftovers.shift() || '';
    if (!location) { const L = locs.find(l => new RegExp('\\s(?:@|at|in)?\\s*' + l + '\\s*$', 'i').test(activity)); if (L) { activity = activity.replace(new RegExp('\\s*(?:@|at|in)?\\s*' + L + '\\s*$', 'i'), '').trim(); location = L === 'Rooftop' ? 'Chica Rooftop' : L; } }
    if (!instructor) { const w = / (?:w\/|with|con) +([A-Za-zÀ-ÿ.' ]+?)\s*$/i.exec(activity); if (w) { instructor = w[1].trim(); activity = activity.slice(0, w.index).trim(); } }
    if (!instructor && leftovers.length) instructor = leftovers.shift();
    if (!instructor) { const p = /\(([A-Za-zÀ-ÿ.' ]+)\)\s*$/.exec(activity); if (p && buKnown(insts, p[1])) { instructor = p[1].trim(); activity = activity.slice(0, p.index).trim(); } }
    instructor = buKnown(insts, instructor) || instructor.replace(/^(?:with|w\/)\s*/i, '').trim();
    if (leftovers.length) activity += ' — ' + leftovers.join(' ');
    const isMeal = BU_MEAL.test(activity);
    cur.slots.push({ time, activity, instructor: isMeal ? '' : instructor, location: isMeal ? '' : location, type: isMeal ? 'meal' : 'class' });
  });
  return days.filter(d => d.slots.length);
}

// Word .docx -> text (a .docx is a zip; read word/document.xml with the browser's own inflate). Table rows become "cell | cell | cell".
async function buDocx(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let end = u8.length - 22; while (end >= 0 && dv.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a Word file');
  let p = dv.getUint32(end + 16, true); const n = dv.getUint16(end + 10, true);
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.slice(p + 46, p + 46 + nl));
    if (name === 'word/document.xml') {
      const lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true), data = u8.slice(off + 30 + lnl + lel, off + 30 + lnl + lel + csize);
      let xml;
      if (method === 0) xml = new TextDecoder().decode(data);
      else xml = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      const para = s => (s.match(/<w:t[^>]*>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g) || []).map(t => t.indexOf('<w:t') === 0 ? t.replace(/<[^>]+>/g, '') : ' ').join('');
      const dec = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      xml = xml.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, row => (row.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) || []).map(c => (c.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [c]).map(para).join(' ').trim()).join(' | ') + '</w:p>');
      return dec(xml.split(/<\/w:p>/).map(x => x.indexOf('|') >= 0 && x.indexOf('<w:') < 0 ? x : para(x)).join('\n'));
    }
    p += 46 + nl + el + cl;
  }
  throw new Error('no text found in that Word file');
}

function buAddDays(ds, n) { return typeof bbcAddDays === 'function' ? bbcAddDays(ds, n) : ds; }

function buBox() {
  const v = document.getElementById('bbcNewView'); if (!v || document.getElementById('buBox')) return;
  const card = v.firstElementChild, h = card && card.querySelector('h3'); if (!card || !h) return;
  const lab = 'font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);display:block;margin-bottom:5px';
  const box = document.createElement('div'); box.id = 'buBox';
  box.style.cssText = 'border:1.5px dashed #b2d8d8;background:#f0f9f9;border-radius:12px;padding:14px 16px;margin:-6px 0 20px';
  box.innerHTML = `<div style="font-weight:700;color:var(--dark);font-size:14px;margin-bottom:4px">Or use a schedule you typed</div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:10px">Any length, even a 2-day retreat. Fill in the <b>Schedule name</b> and <b>Arrival date</b> below (the number of days comes from your schedule). It saves as a Draft: check it, press <b>Confirm Schedule</b>, and each teacher confirms their own classes from their login.</div>
    <label style="${lab}">Upload (Word .docx, .txt, .csv)</label>
    <input type="file" id="buFile" accept=".docx,.txt,.csv,.md,text/plain" onchange="buLoadFile(this)" style="font-size:12.5px;margin-bottom:10px">
    <label style="${lab}">…or paste it here</label>
    <textarea id="buText" rows="8" placeholder="Saturday, Oct 31&#10;7:00 – 7:15  Grand Rising with Ryan | Beachfront&#10;9:00  Breakfast&#10;4:45 – 5:30  Sculpt & Tone with Ryan | Grande&#10;&#10;Sunday, Nov 1&#10;..." style="width:100%;box-sizing:border-box;padding:9px 11px;border:1.5px solid var(--border);border-radius:9px;font-family:'Jost',sans-serif;font-size:12.5px"></textarea>
    <button onclick="buCreate()" style="margin-top:10px;width:100%;padding:11px;background:#2d6a6a;color:#fff;border:none;border-radius:9px;font-family:'Jost',sans-serif;font-size:13.5px;font-weight:700;cursor:pointer">Create schedule from my typed schedule</button>`;
  h.insertAdjacentElement('afterend', box);
}
async function buLoadFile(inp) {
  const f = inp.files && inp.files[0]; if (!f) return;
  try {
    const text = /\.docx$/i.test(f.name) ? await buDocx(await f.arrayBuffer()) : await f.text();
    document.getElementById('buText').value = text;
    showToast('Read ' + f.name + ' — check the text, then press Create.');
  } catch (e) { showToast("Couldn't read that file (" + (e.message || e) + '). Open it, copy the text and paste it into the box.'); }
}
function buCreate() {
  const text = (document.getElementById('buText') || {}).value || '';
  const name = (document.getElementById('bbcNewName').value || '').trim(), start = document.getElementById('bbcNewStart').value;
  const guests = parseInt(document.getElementById('bbcNewGuests').value, 10) || null;
  if (!text.trim()) { showToast('Upload your schedule or paste it in the box first.'); return; }
  if (!start) { showToast('Pick the Arrival date first (the first day of your schedule).'); return; }
  if (!name) { showToast('Fill in the Schedule name first.'); return; }
  const parsed = buParse(text);
  if (!parsed.length) { showToast('I could not find any times in that text. Each class needs a time at the start of its line, like "7:00 – 7:15  Yoga with Kun".'); return; }
  const days = parsed.map((d, i) => ({ date: buAddDays(start, i), prompt: '', note: d.note || '', slots: d.slots.map(s => bbcMakeSlot(s.time, s.activity, s.instructor, s.location, false, s.type)) }));
  const sched = { id: bbcUid(), name, startDate: start, endDate: days[days.length - 1].date, nights: days.length - 1, guestCount: guests, tourMode: 'none', status: 'draft', uploaded: true, createdAt: new Date().toISOString(), days };
  bbcSchedules.unshift(sched); bbcSaveData(); bbcOpenEditor(sched.id);
  // teachers named in the schedule who have no Staff Confirmations login can't confirm
  try {
    const logins = (typeof staffConfirmAccounts !== 'undefined' ? staffConfirmAccounts : []).map(a => String(a.name || '').trim().toLowerCase());
    const names = [...new Set(days.flatMap(d => d.slots.map(s => s.instructor)).filter(Boolean))];
    const missing = names.filter(n => !logins.some(l => l === n.toLowerCase() || l.split(' ')[0] === n.toLowerCase()));
    const n = days.reduce((a, d) => a + d.slots.length, 0);
    showToast(`Created: ${days.length} day${days.length > 1 ? 's' : ''}, ${n} lines (Draft).` + (missing.length ? ` No confirmation login yet for: ${missing.join(', ')} — add them in the Confirmations tab.` : ''));
  } catch (e) {}
}
(function () {
  if (typeof bbcShowNewForm !== 'function') return;
  const o = window.bbcShowNewForm;
  window.bbcShowNewForm = function () { const r = o.apply(this, arguments); try { buBox(); const t = document.getElementById('buText'), f = document.getElementById('buFile'); if (t) t.value = ''; if (f) f.value = ''; } catch (e) { console.warn('[bbc-upload]', e); } return r; };
})();
