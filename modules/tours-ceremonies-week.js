// ===== tours-ceremonies-week.js — one page: the week's tours and ceremonies, click to choose the guides (Darlene 2026-10-17) =====
// Loaded as a classic script AFTER activity-sheet.js, activity-guides.js, activity-leader.js and schedule-guides.js; shares global scope.
// Standalone: adds a "Tours & Ceremonies" button to the sidebar (under Menu Editor) and its own page; nothing else is edited.
// The page lists, for the week on screen (‹ This week ›), every tour and ceremony scheduled for ANY retreat, day by day: time, activity, which
// retreats are on it (and how many guests), and Guide 1 / Guide 2 dropdowns plus a "Who does what" note. Picking a name saves straight away
// to the same place the Activities page and Review Schedule use (app_store 'act_ops', key "<activity id>|<date>"), so the guides then show on
// the retreat schedules, the printouts and the Schedule calendar. One row per activity per day: a tour two retreats share has one guide row.
const TCW_TOURS = ['ao1', 'ao2', 'ao3', 'ao6', 'ao7', 'ao16'];
const TCW_CEREMONIES = ['ao4', 'ao5', 'ao9', 'ao10'];
const TCW_SHAMANS = ['María Luisa', 'Gabby'];   // every Temazcal needs one shaman and one fire keeper
function tcwFireKeepers() { return typeof TEMAZCAL_FIRE_KEEPER_NAMES !== 'undefined' ? TEMAZCAL_FIRE_KEEPER_NAMES : ['Golloy', 'Francisco']; }
let tcwWeek = null;          // ISO date of the Sunday of the week on screen
let tcwFilter = 'all';       // all | tours | ceremonies

function tcwEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function tcwISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function tcwSunday(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - x.getDay()); return x; }
function tcwAdd(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return tcwISO(d); }
function tcwFmtT(t) { if (!t) return ''; const [h, m] = t.split(':').map(Number); return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + (h >= 12 ? ' pm' : ' am'); }
function tcwStaff(cur) {
  try { if (typeof alStaff === 'function') return alStaff(cur); } catch (e) {}
  const a = typeof TOUR_GUIDE_NAMES !== 'undefined' ? TOUR_GUIDE_NAMES.slice() : [];
  return a;
}
function tcwBuildRows() {
  const days = Array.from({ length: 7 }, (_, i) => tcwAdd(tcwWeek, i));
  const ids = tcwFilter === 'tours' ? TCW_TOURS : tcwFilter === 'ceremonies' ? TCW_CEREMONIES : [...TCW_TOURS, ...TCW_CEREMONIES];
  const map = {};   // "aoId|date" -> row
  (AppData.bookings || []).forEach(bk => {
    if (bk.status === 'cancelled' || (bk.flags || []).includes('archived')) return;
    (bk.retreatActivities || []).forEach(a => {
      const d = String(a.date || '').slice(0, 10);
      if (!a || !ids.includes(a.aoId) || !days.includes(d)) return;
      const k = a.aoId + '|' + d;
      const r = map[k] = map[k] || { key: k, aoId: a.aoId, date: d, times: [], groups: [] };
      if (a.time) r.times.push(a.time);
      r.groups.push({ name: bk.leaderName || bk.retreatName || 'Retreat', pax: Number(bk.pax) || 0, prepaid: !!a.prepaid, session: a.session });
    });
  });
  return { days, rows: Object.values(map).sort((x, y) => x.date.localeCompare(y.date) || (x.times[0] || '99').localeCompare(y.times[0] || '99')) };
}
async function tcwRender() {
  const el = document.getElementById('tcwBody'); if (!el) return;
  try { if (typeof actOpsLoad === 'function') await actOpsLoad(); } catch (e) {}
  if (!tcwWeek) tcwWeek = tcwISO(tcwSunday(new Date()));
  const { days, rows } = tcwBuildRows();
  const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const wk = new Date(days[0] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' + new Date(days[6] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const nm = id => ((typeof ADD_ONS !== 'undefined' ? ADD_ONS : []).find(a => a.id === id) || {}).name || id;
  const chip = (k, l) => `<button onclick="tcwSetFilter('${k}')" style="padding:6px 14px;font-size:12px;font-weight:700;border-radius:99px;cursor:pointer;font-family:'Jost',sans-serif;border:1.5px solid ${tcwFilter === k ? '#2d6a6a' : '#d6cfc4'};background:${tcwFilter === k ? '#2d6a6a' : '#fff'};color:${tcwFilter === k ? '#fff' : '#4a4038'}">${l}</button>`;
  const sel = (r, field, blank) => {
    const cur = ((typeof actOpsData !== 'undefined' && actOpsData[r.key]) || {})[field] || '';
    const names = tcwStaff(cur);
    return `<select onchange="tcwSet('${r.key}','${field}',this.value)" style="padding:7px 8px;border:1.5px solid #d6cfc4;border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;background:#fff;min-width:130px">` +
      ['', ...names].map(n => `<option value="${tcwEsc(n)}" ${n.toLowerCase() === String(cur).toLowerCase() ? 'selected' : ''}>${tcwEsc(n || blank)}</option>`).join('') + '</select>';
  };
  let html = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px">
    <button onclick="tcwNav(-7)" style="width:30px;height:30px;border:1px solid #d6cfc4;border-radius:7px;background:#fff;cursor:pointer;font-size:16px">&#8249;</button>
    <span style="font-size:15px;font-weight:700;min-width:210px;text-align:center;font-family:'Jost',sans-serif">${tcwEsc(wk)}</span>
    <button onclick="tcwNav(7)" style="width:30px;height:30px;border:1px solid #d6cfc4;border-radius:7px;background:#fff;cursor:pointer;font-size:16px">&#8250;</button>
    <button onclick="tcwNav(0)" style="padding:6px 12px;font-size:12px;font-weight:700;border:1.5px solid #d6cfc4;border-radius:7px;background:#fff;cursor:pointer;font-family:'Jost',sans-serif">This week</button>
    <span style="width:14px"></span>${chip('all', 'All')}${chip('tours', 'Tours')}${chip('ceremonies', 'Ceremonies')}</div>`;
  const missing = rows.filter(r => r.aoId === 'ao5').filter(r => { const o = (typeof actOpsData !== 'undefined' && actOpsData[r.key]) || {}; return !o.shaman || !o.fireKeeper; });
  if (missing.length) html += `<div style="margin:0 0 14px;padding:10px 14px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;color:#991b1b;font-size:13px;font-weight:600">${missing.length} Temazcal${missing.length > 1 ? 's' : ''} this week still need${missing.length > 1 ? '' : 's'} a shaman and a fire keeper: ${missing.map(r => tcwEsc(fmtDay(r.date))).join(' · ')}. Every Temazcal needs one of each.</div>`;
  const custom = typeof _agExtra !== 'undefined' ? _agExtra : [];
  html += `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-4px 0 14px;padding:10px 12px;background:#fff;border:1px solid #e8dfd4;border-radius:10px">
    <span style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">Add a guide</span>
    <input id="tcwNewGuide" type="text" placeholder="Type a name" onkeydown="if(event.key==='Enter')tcwAddGuide()" style="padding:7px 10px;border:1.5px solid #d6cfc4;border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;width:170px">
    <button onclick="tcwAddGuide()" style="padding:7px 14px;font-size:12.5px;font-weight:700;border:none;border-radius:7px;background:#2d6a6a;color:#fff;cursor:pointer;font-family:'Jost',sans-serif">+ Add</button>
    ${custom.length ? '<span style="font-size:11.5px;color:#6b7280;margin-left:8px">Added by you:</span>' + custom.map(n => `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 4px 3px 10px;border-radius:99px;background:#f0ebe0;font-size:12.5px">${tcwEsc(n)}<button title="Remove ${tcwEsc(n)} from the list" onclick="tcwRemoveGuide('${tcwEsc(n).replace(/'/g, "\\'")}')" style="border:none;background:none;cursor:pointer;color:#b91c1c;font-size:15px;line-height:1;padding:0 4px">&times;</button></span>`).join('') : ''}
  </div>`;
  if (!rows.length) html += '<div style="padding:40px;text-align:center;color:#9ca3af;background:#fff;border-radius:10px">No tours or ceremonies are scheduled this week.</div>';
  days.forEach(d => {
    const dr = rows.filter(r => r.date === d); if (!dr.length) return;
    html += `<div style="background:#fff;border-radius:10px;margin-bottom:14px;overflow:hidden;border:1px solid #e8dfd4"><div style="padding:9px 14px;background:#f5f1eb;font-weight:700;font-size:13px">${tcwEsc(fmtDay(d))}</div>`;
    dr.forEach(r => {
      const ops = (typeof actOpsData !== 'undefined' && actOpsData[r.key]) || {};
      const tour = TCW_TOURS.includes(r.aoId);
      const times = [...new Set(r.times)].sort().map(tcwFmtT).join(' & ');
      const who = r.groups.map(g => tcwEsc(g.name) + (g.pax ? ' (' + g.pax + ')' : '')).join(', ');
      const temaz = r.aoId === 'ao5';
      const reqSel = (field, blank, list) => {
        const cur = ops[field] || '';
        return `<select onchange="tcwSet('${r.key}','${field}',this.value)" style="padding:7px 8px;border:2px solid ${cur ? '#d6cfc4' : '#dc2626'};border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;background:${cur ? '#fff' : '#fef2f2'};min-width:150px">` +
          ['', ...list, ...(cur && !list.includes(cur) ? [cur] : [])].map(n => `<option value="${tcwEsc(n)}" ${n === cur ? 'selected' : ''}>${tcwEsc(n || blank)}</option>`).join('') + '</select>';
      };
      const lbl = 'font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px';
      const people = temaz
        ? `<div><div style="${lbl}">Shaman <span style="color:#dc2626">*</span></div>${reqSel('shaman', '— choose the shaman —', TCW_SHAMANS)}</div>
           <div><div style="${lbl}">Fire keeper <span style="color:#dc2626">*</span></div>${reqSel('fireKeeper', '— choose the fire keeper —', tcwFireKeepers())}</div>`
        : `<div><div style="${lbl}">Guide 1</div>${sel(r, 'guide1', '— choose —')}</div>
           <div><div style="${lbl}">Guide 2</div>${sel(r, 'guide2', '— optional —')}</div>
           <div><div style="${lbl}">Guide 3</div>${sel(r, 'guide3', '— optional —')}</div>`;
      html += `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:12px 14px;border-top:1px solid #f0ebe0">
        <div style="min-width:210px;flex:1"><div style="font-weight:700;font-size:14px">${tcwEsc(nm(r.aoId))} <span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:9px;background:${tour ? '#dbeafe' : '#fae8ff'};color:${tour ? '#1d4ed8' : '#86198f'}">${tour ? 'Tour' : 'Ceremony'}</span></div>
          <div style="font-size:12px;color:#6b7280">${tcwEsc(times)} · ${who}</div></div>
        ${people}
        <div style="flex:1;min-width:200px"><div style="font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">Who does what</div><input type="text" value="${tcwEsc(ops.staffNote || '')}" placeholder="e.g. María Luisa leads, Gaby plays music" onchange="tcwSet('${r.key}','staffNote',this.value)" style="width:100%;box-sizing:border-box;padding:7px 10px;border:1.5px solid #d6cfc4;border-radius:7px;font-family:'Jost',sans-serif;font-size:13px"></div>
      </div>`;
    });
    html += '</div>';
  });
  el.innerHTML = html;
}
async function tcwAddGuide() {
  const inp = document.getElementById('tcwNewGuide'); if (!inp) return;
  if (typeof agAddGuide !== 'function') { showToast('The guide list is still loading, try again in a moment.'); return; }
  const r = await agAddGuide(inp.value);
  showToast(r.msg);
  if (r.ok) tcwRender();
}
async function tcwRemoveGuide(name) {
  if (!confirm('Remove ' + name + ' from the guide list? Their past assignments stay on the schedules.')) return;
  await agRemoveGuide(name); tcwRender();
}
function tcwNav(n) { tcwWeek = n === 0 ? tcwISO(tcwSunday(new Date())) : tcwAdd(tcwWeek, n); tcwRender(); }
function tcwSetFilter(f) { tcwFilter = f; tcwRender(); }
function tcwSet(key, field, val) {
  if (typeof actOpsData === 'undefined') return;
  if (!actOpsData[key]) actOpsData[key] = {};
  actOpsData[key][field] = (field === 'staffNote' || field === 'shaman' || field === 'fireKeeper') ? String(val || '') : String(val || '').toLowerCase();   // guides are stored lowercase like the Activities page; shaman and fire keeper keep their exact name
  if (typeof actOpsSave === 'function') actOpsSave();
  if (typeof showToast === 'function') showToast(field === 'staffNote' ? 'Saved.' : (val ? 'Guide ' + val + ' saved.' : 'Guide cleared.'));
}
function tcwOpen(btn) {
  const prev = localStorage.getItem('ama_last_tab');
  switchTab('tourscer', btn);
  try { localStorage.setItem('ama_last_tab', prev || 'dashboard'); } catch (e) {}   // a reload still opens the page you were on before
  tcwRender();
}
(function () {
  try {
    if (document.getElementById('tab-tourscer')) return;
    const me = document.getElementById('tab-menueditor'); if (!me) return;
    const panel = document.createElement('div');
    panel.className = 'tab-panel'; panel.id = 'tab-tourscer'; panel.style.flexDirection = 'column';
    panel.innerHTML = `<div class="panel-toolbar"><h2>Tours &amp; Ceremonies</h2><div class="toolbar-right"><span style="font-size:12px;color:#7f8c9a">Choose the guides for each tour and ceremony this week. They show on the schedules and the calendar.</span></div></div>
      <div id="tcwBody" style="flex:1;overflow-y:auto;padding:20px;background:#f0ece4"></div>`;
    me.parentElement.insertBefore(panel, me.nextSibling);
    const sub = [...document.querySelectorAll('button.tab-btn-sub')].find(b => /switchTab\('menueditor'/.test(b.getAttribute('onclick') || ''));
    const btn = document.createElement('button');
    btn.className = 'tab-btn tab-btn-sub'; btn.id = 'toursCerTabBtn'; btn.style.color = '#0d9488';
    btn.onclick = function () { tcwOpen(btn); };
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/><circle cx="12" cy="12" r="10"/></svg><span class="tab-label">Tours &amp; Ceremonies</span>';
    // right under "Activities" in the main list (easy to find); falls back to the lower group under Menu Editor
    const act = [...document.querySelectorAll('button.tab-btn')].find(b => /switchTab\('actsheet'/.test(b.getAttribute('onclick') || ''));
    btn.classList.remove('tab-btn-sub'); btn.style.color = '';
    if (act) act.parentElement.insertBefore(btn, act.nextSibling);
    else { btn.classList.add('tab-btn-sub'); btn.style.color = '#0d9488'; if (sub) sub.parentElement.insertBefore(btn, sub.nextSibling); else me.parentElement.appendChild(btn); }
  } catch (e) { console.warn('[tours-ceremonies-week]', e); }
})();
