// ===== host-checklist.js — Host checklist for every retreat (staff only) =====
// Loaded as a classic script AFTER checkout-balances.js; shares global scope. Standalone: adds a "Host Checklist" tab to the admin sidebar (same opener pattern as
// double-charges.js / checkout-balances.js). It lives only in the staff portal, so teachers (who use the teacher portal and their own links) never see it.
// One list for every retreat (HC_ITEMS below, Darlene's list 2026-10-24), each step with a due date worked out from the retreat's dates: 3 days before, 1 day before
// (2 days if the retreat starts on a Sunday), the first day, the first morning, the day before check-out, the last night, check-out day. Each retreat can also get its own extra steps.
// Ticks are saved with who and when, in app_store key host_checklists: { [bookingId]: { done: { [itemId]: {by, at, note} }, extras: [{ id, text, due }] } }.
// Hints on a step come from data the portal already holds (who pays for transport, balance owed, offsite dinner night); they never tick anything by themselves.
let hcState = { bookingId: '', data: {}, loaded: false, loading: false, error: '' };
const HC_KEY = 'host_checklists';

// when: how the due date is worked out. 'S-3' = 3 days before start, 'S1' = 1 day before start (2 if it starts on a Sunday), 'S0' = start day, 'S+1' = day after start, 'E-1' = day before check-out, 'E0' = check-out day.
const HC_ITEMS = [
  // Retreat Admin: set up once per retreat, above the host steps (Darlene 2026-10-24). No due date: tick them when done. "assign" = can be handed to someone (default shown).
  { id: 'adm-massage-credit', when: null, group: 'Retreat Admin', text: 'Massage credit added to the teacher\'s room' },
  { id: 'adm-teacher-room', when: null, group: 'Retreat Admin', text: 'Teacher is in a nice room' },
  { id: 'adm-best-rooms', when: null, group: 'Retreat Admin', text: 'All students are in the best possible room for their room type' },
  { id: 'adm-whatsapp', when: null, group: 'Retreat Admin', text: 'WhatsApp chat made', assign: 'Online team' },
  { id: 'transport-folder', when: 'S-3', group: '3 days prior to retreat', text: 'Folder with transport information, printed 3 days in advance. Note if TEACHER PAYS or STUDENTS PAY for transport', hint: 'transport' },
  { id: 'schedule-printed', when: 'S-1', group: '1 day prior to retreat', text: 'Schedule printed, ready for teacher review' },
  { id: 'activity-sheet', when: 'S-1', group: '1 day prior to retreat', text: 'Activity sheet drafted' },
  { id: 'firepit-nights', when: 'S-1', group: '1 day prior to retreat', text: 'Fire Pit: confirm with the teacher which nights they want it, and set them with the 🔥 Fire Pit button', hint: 'firepit' },
  { id: 'menu-fridge', when: 'S1', group: '1 day prior (2 days if the retreat starts on a Sunday)', text: 'Menu on the fridge, and meet with the kitchen', hint: 'offsite' },
  { id: 'review-menu', when: 'S1', group: '1 day prior (2 days if the retreat starts on a Sunday)', text: 'Review the menu, meal times and the offsite dinner', hint: 'offsite' },
  { id: 'allergies-fridge', when: 'S1', group: '1 day prior (2 days if the retreat starts on a Sunday)', text: 'Note with allergies and preferences on the fridge' },
  { id: 'shala-ready', when: 'S0', group: 'Day of retreat: AM shift', text: 'Yoga shala is ready' },
  { id: 'staff-meeting', when: 'S0', group: 'Day of retreat: AM and PM shift', text: 'Staff meeting: kitchen, reception, greeters' },
  { id: 'greet-teacher', when: 'S0', group: 'Meeting with the teacher', text: 'Greet the teacher and take them on a tour: show them the shala options, and show them how to use the music of each shala you show them' },
  { id: 'review-schedule', when: 'S0', group: 'Meeting with the teacher', text: 'Review the schedule' },
  { id: 'review-balance', when: 'S0', group: 'Meeting with the teacher', text: 'Review if a balance is owed', hint: 'balance' },
  { id: 'welcome-orientation', when: 'S0', group: 'Check-in during dessert', text: 'Welcome orientation' },
  { id: 'final-schedule', when: 'S0', group: 'Check-in during dessert', text: 'Update and print the finalised schedule and activity sheets' },
  { id: 'announce-transport', when: 'S+1', group: '1st morning', text: 'Announcement about transport' },
  { id: 'announce-checkout', when: 'E-1', group: 'Lunch, day before check-out', text: 'Announcement about self-service check-out and luggage' },
  { id: 'checkout-stations', when: 'E-1', group: 'Lunch, day before check-out', text: 'Check-out stations and staff ready' },
  { id: 'closing-statement', when: 'E-1', group: 'Dinner, last night', text: 'Closing statement, thank you with staff' },
  { id: 'mention-tips', when: 'E-1', group: 'Dinner, last night', text: 'Mention tips' },
  { id: 'tip-signoff', when: 'E0', group: 'Check-out day', text: 'Tip sign-off, 3 reps' },
];

const hcEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hcToday = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);   // Tulum is UTC-5 all year
const hcAdd = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const hcFmt = d => { try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; } };

function hcDue(bk, when) {
  const s = String(bk.startDate || '').slice(0, 10), e = String(bk.endDate || '').slice(0, 10); if (!s || !e) return '';
  const sunday = new Date(s + 'T12:00:00Z').getUTCDay() === 0;
  return { 'S-3': hcAdd(s, -3), 'S-1': hcAdd(s, -1), 'S1': hcAdd(s, sunday ? -2 : -1), 'S0': s, 'S+1': hcAdd(s, 1), 'E-1': hcAdd(e, -1), 'E0': e }[when] || '';
}
function hcItemsFor(bk) {
  const rec = hcState.data[bk.id] || {}, done = rec.done || {};
  const assign = rec.assign || {};
  const items = HC_ITEMS.map(it => ({ ...it, due: hcDue(bk, it.when), done: done[it.id] || null, assignee: it.assign !== undefined ? (assign[it.id] !== undefined ? assign[it.id] : it.assign) : undefined }));
  // One step for every Fire Pit night saved on this retreat (Fire Pit button / tab): set up, light and put out on that night
  (bk.retreatActivities || []).filter(a => a.aoId === 'ao21' && a.date).sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(a => {
    const d = String(a.date).slice(0, 10), t = a.time ? ' ' + new Date('2000-01-01T' + a.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    items.push({ id: 'fp-' + d, text: `Fire Pit ready and staffed: ${hcFmt(d)}${t}`, group: 'Fire Pit nights', due: d, done: done['fp-' + d] || null });
  });
  (rec.extras || []).forEach(x => items.push({ id: x.id, text: x.text, group: 'Extra for this retreat', due: x.due || '', done: done[x.id] || null, extra: true }));
  return items;
}
function hcRetreats() {
  const today = hcToday();
  return (AppData.bookings || []).filter(b => b.status !== 'cancelled' && b.startDate && b.endDate && (b.bookingType || '') !== 'room_only' && String(b.endDate).slice(0, 10) >= hcAdd(today, -3))
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
}
function hcProgress(bk) { const it = hcItemsFor(bk), n = it.filter(i => i.done).length, over = it.filter(i => !i.done && i.due && i.due < hcToday()).length; return { n, total: it.length, over }; }

async function hcLoad() {
  if (hcState.loading) return; hcState.loading = true;
  try { const { data, error } = await db.from('app_store').select('value').eq('key', HC_KEY).maybeSingle(); if (error) throw error; hcState.data = (data && data.value && typeof data.value === 'object') ? data.value : {}; hcState.loaded = true; hcState.error = ''; }
  catch (e) { hcState.error = e.message || String(e); }
  hcState.loading = false; hcRender(); hcRenderBox();
}
// Re-read the saved copy, change only this retreat's record, write it back: two people ticking different steps never overwrite each other.
async function hcMutate(bookingId, fn) {
  try {
    const { data } = await db.from('app_store').select('value').eq('key', HC_KEY).maybeSingle();
    const all = (data && data.value && typeof data.value === 'object') ? data.value : {};
    all[bookingId] = all[bookingId] || { done: {}, extras: [] }; all[bookingId].done = all[bookingId].done || {}; all[bookingId].extras = all[bookingId].extras || [];
    fn(all[bookingId]);
    const { error } = await db.from('app_store').upsert({ key: HC_KEY, value: all, updated_at: new Date().toISOString() }); if (error) throw error;
    hcState.data = all; hcRender(); hcRenderBox(); return true;
  } catch (e) { showToast('Could not save: ' + (e.message || e)); return false; }
}
const hcMe = () => (typeof getCurrentSession === 'function' && (getCurrentSession() || {}).name) || 'Staff';
function hcToggle(itemId) { return hcMutate(hcState.bookingId, r => { if (r.done[itemId]) delete r.done[itemId]; else r.done[itemId] = { by: hcMe(), at: new Date().toISOString(), note: '' }; }); }
function hcNote(itemId, text) { return hcMutate(hcState.bookingId, r => { r.done[itemId] = Object.assign({ by: hcMe(), at: new Date().toISOString() }, r.done[itemId] || {}, { note: text }); }); }
function hcAssign(itemId, who) { return hcMutate(hcState.bookingId, r => { r.assign = r.assign || {}; r.assign[itemId] = String(who || '').trim(); }); }
function hcAddExtra() {
  const text = (document.getElementById('hcExtraText') || {}).value || '', due = (document.getElementById('hcExtraDue') || {}).value || '';
  if (!text.trim()) { showToast('Type the step first.'); return; }
  return hcMutate(hcState.bookingId, r => { r.extras.push({ id: 'x' + Date.now().toString(36), text: text.trim(), due }); });
}
function hcRemoveExtra(id) { if (!confirm('Remove this extra step?')) return; hcMutate(hcState.bookingId, r => { r.extras = r.extras.filter(x => x.id !== id); delete r.done[id]; }); }
function hcPick(id) { hcState.bookingId = id; hcRender(); }

function hcHint(bk, kind) {
  try {
    if (kind === 'transport') { const f = bk.flags || [], a = f.includes('teacher_pays_arrival_transport'), d = f.includes('teacher_pays_departure_transport'); return `Arrival: ${a ? 'TEACHER PAYS' : 'students pay'} · Departure: ${d ? 'TEACHER PAYS' : 'students pay'}`; }
    if (kind === 'balance' && typeof calcBkBalance === 'function') { const b = calcBkBalance(bk).balance; return b > 0.5 ? `Balance owed: $${b.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'No balance owed'; }
    if (kind === 'firepit') { const n = (bk.retreatActivities || []).filter(a => a.aoId === 'ao21').length; return n ? `${n} fire pit night${n !== 1 ? 's' : ''} set` : 'No fire pit nights set yet'; }
    if (kind === 'offsite') { const sr = bk.scheduleRequest || {}, n = parseInt(sr.offsiteNight); return n && bk.startDate ? `Offsite night: night ${n}, ${hcFmt(hcAdd(String(bk.startDate).slice(0, 10), n - 1))} · choice: ${sr.offsiteChoice || 'undecided'}` : 'Offsite dinner night not picked yet'; }
  } catch (e) {}
  return '';
}

function hcRender() {
  const el = document.getElementById('hcContent'); if (!el) return;
  const btn = 'padding:6px 12px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;font-size:12.5px';
  const head = `<div style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600">Host Checklist</div><div style="font-size:12.5px;color:#6b7280;margin-bottom:14px">For the Amansala team only. Teachers never see this. Tick each step as it is done.</div>`;
  if (hcState.error) { el.innerHTML = `<div style="max-width:1000px;margin:0 auto;font-family:'Jost',sans-serif">${head}<div style="padding:12px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:12.5px">Could not read the checklists: ${hcEsc(hcState.error)} <button onclick="hcLoad()" style="${btn}">Try again</button></div></div>`; return; }
  const bk = (AppData.bookings || []).find(b => b.id === hcState.bookingId);
  if (!bk) {
    const rows = hcRetreats();
    el.innerHTML = `<div style="max-width:1000px;margin:0 auto;font-family:'Jost',sans-serif;color:#2d2520;text-align:left">${head}
      ${!hcState.loaded ? '<div style="color:#9ca3af">Loading…</div>' : ''}
      <div style="display:grid;gap:10px">${rows.map(b => { const p = hcProgress(b), pct = p.total ? Math.round(p.n / p.total * 100) : 0;
        return `<div onclick="hcPick('${hcEsc(b.id)}')" style="cursor:pointer;background:#fff;border:1.5px solid ${p.over ? '#fecaca' : '#e8dfd4'};border-radius:12px;padding:12px 16px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
          <div><b style="font-size:15px">${hcEsc(b.leaderName || b.retreatName || 'Retreat')}</b><div style="font-size:12px;color:#6b7280">${hcFmt(String(b.startDate).slice(0, 10))} → ${hcFmt(String(b.endDate).slice(0, 10))}${b.retreatName && b.leaderName && b.retreatName !== b.leaderName ? ' · ' + hcEsc(b.retreatName) : ''}</div></div>
          <div style="text-align:right"><b>${p.n}/${p.total}</b> done${p.over ? ` <span style="color:#b91c1c;font-weight:700">· ${p.over} overdue</span>` : ''}<div style="height:6px;width:140px;background:#f0ebe0;border-radius:99px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct === 100 ? '#059669' : '#2d6a6a'}"></div></div></div></div>`; }).join('') || '<div style="color:#9ca3af">No current or upcoming retreats.</div>'}</div></div>`;
    return;
  }
  const items = hcItemsFor(bk), p = hcProgress(bk), today = hcToday(), groups = [];
  items.forEach(i => { let g = groups.find(x => x.label === i.group); if (!g) groups.push(g = { label: i.group, list: [] }); g.list.push(i); });
  el.innerHTML = `<div style="max-width:1000px;margin:0 auto;font-family:'Jost',sans-serif;color:#2d2520;text-align:left">${head}
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px"><button onclick="hcPick('')" style="${btn}">← All retreats</button>
      <div><b style="font-size:17px">${hcEsc(bk.leaderName || bk.retreatName)}</b> <span style="color:#6b7280;font-size:12.5px">${hcFmt(String(bk.startDate).slice(0, 10))} → ${hcFmt(String(bk.endDate).slice(0, 10))}</span></div>
      <div><b>${p.n}/${p.total}</b> done${p.over ? ` <span style="color:#b91c1c;font-weight:700">· ${p.over} overdue</span>` : ''}</div></div>
    ${hcBodyHtml(bk)}</div>`;
}


// The steps and the "add an extra step" form for one retreat; used by the Host Checklist tab and by the inline checklist in the retreat window.
function hcBodyHtml(bk) {
  const btn = 'padding:6px 12px;border:1px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;font-size:12.5px';
  const items = hcItemsFor(bk), today = hcToday(), groups = [];
  items.forEach(i => { let g = groups.find(x => x.label === i.group); if (!g) groups.push(g = { label: i.group, list: [] }); g.list.push(i); });
  return `${groups.map(g => `<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#a89a86;margin-bottom:6px">${hcEsc(g.label)}</div>
      <div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;overflow:hidden">${g.list.map(i => { const over = !i.done && i.due && i.due < today, hint = i.hint ? hcHint(bk, i.hint) : '';
        return `<div style="padding:10px 14px;border-top:1px solid #f0ebe0;display:flex;gap:10px;align-items:flex-start;${i.done ? 'background:#f0fdf4' : ''}">
          <input type="checkbox" ${i.done ? 'checked' : ''} onchange="hcToggle('${hcEsc(i.id)}')" style="width:20px;height:20px;margin-top:2px;cursor:pointer;flex-shrink:0">
          <div style="flex:1;min-width:0"><div style="font-size:13.5px;${i.done ? 'color:#6b7280;text-decoration:line-through' : 'font-weight:600'}">${hcEsc(i.text)}</div>
            ${hint ? `<div style="font-size:12px;color:#7c3aed;font-weight:600;margin-top:2px">${hcEsc(hint)}</div>` : ''}
            ${i.assignee !== undefined ? `<div style="margin-top:3px;font-size:11.5px;color:#6b7280">Assigned to <input type="text" value="${hcEsc(i.assignee)}" placeholder="e.g. Online team" onchange="hcAssign('${hcEsc(i.id)}',this.value)" style="padding:2px 8px;border:1px solid #d6cfc4;border-radius:6px;font-family:inherit;font-size:11.5px;width:160px"></div>` : ''}
            <div style="font-size:11.5px;color:${over ? '#b91c1c' : '#9ca3af'};margin-top:2px">${i.due ? (over ? 'Overdue · was due ' : 'Due ') + hcFmt(i.due) : ''}${i.done ? ` · ✓ ${hcEsc(i.done.by)}, ${new Date(i.done.at).toLocaleString('en-US', { timeZone: 'America/Cancun', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}</div>
            ${i.done ? `<input type="text" value="${hcEsc(i.done.note || '')}" placeholder="Add a note" onchange="hcNote('${hcEsc(i.id)}',this.value)" style="margin-top:4px;width:100%;max-width:420px;padding:4px 8px;border:1px solid #e0d8cc;border-radius:6px;font-family:inherit;font-size:12px">` : ''}</div>
          ${i.extra ? `<button onclick="hcRemoveExtra('${hcEsc(i.id)}')" style="${btn};padding:2px 8px">✕</button>` : ''}</div>`; }).join('')}</div></div>`).join('')}
    <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input id="hcExtraText" placeholder="Add an extra step for this retreat" style="flex:1;min-width:220px;padding:7px 10px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:inherit;font-size:13px">
      <input id="hcExtraDue" type="date" style="padding:6px 8px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:inherit;font-size:13px"><button onclick="hcAddExtra()" style="${btn};background:#2d6a6a;color:#fff;border-color:#2d6a6a">Add</button></div>`;
}

function hcOpen(btn) {
  const prev = localStorage.getItem('ama_last_tab');
  switchTab('hostchecklist', btn);
  try { localStorage.setItem('ama_last_tab', prev || 'dashboard'); } catch (e) {}
  hcRender(); hcLoad();
}

// ---- The checklist inside the retreat's own window (Teachers tab, or the preview-as-teacher on an admin device), so it is right there with that teacher's booking ----
let hcInline = false;
function hcBoxHtml(bk) {
  const p = hcProgress(bk);
  return `<span style="font-weight:800;color:#065f46">✅ Host checklist</span> <span style="color:#6b7280">${hcState.loaded ? `${p.n}/${p.total} done` : 'loading…'}${p.over ? ` <b style="color:#b91c1c">· ${p.over} overdue</b>` : ''}</span> <button onclick="hcOpenFor('${hcEsc(bk.id)}')" style="margin-left:8px;padding:4px 12px;border:1.5px solid #6ee7b7;border-radius:8px;background:#ecfdf5;color:#065f46;font-weight:700;font-family:inherit;font-size:12px;cursor:pointer">${hcInline ? 'Hide' : 'Open checklist'}</button> <span style="font-size:11px;color:#9ca3af">Team only: teachers can't see this</span>`;
}
function hcRenderBox() {
  try {
    if (typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE && !localStorage.getItem('ama_admin_device')) return;   // team only
    const bk = typeof regSelBk !== 'undefined' ? regSelBk : null; let box = document.getElementById('regChecklistBox');
    if (!bk || !bk.id) { if (box) box.style.display = 'none'; return; }
    if (!box) {
      box = document.createElement('div'); box.id = 'regChecklistBox';
      box.style.cssText = 'margin:10px 0;padding:9px 14px;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;font-size:13px;font-family:Jost,sans-serif';
      const anchor = document.getElementById('regGitanoNotice') || document.getElementById('pkgBarBody');
      if (!anchor || !anchor.parentNode) return;
      anchor.parentNode.insertBefore(box, anchor.nextSibling);
    }
    if (!hcState.loaded && !hcState.loading) hcLoad();
    box.style.display = 'block';
    box.innerHTML = hcBoxHtml(bk) + (hcInline && hcState.bookingId === bk.id ? `<div style="margin-top:12px">${hcBodyHtml(bk)}</div>` : '');
  } catch (e) {}
}
function hcOpenFor(id) {
  const b = document.getElementById('hostchecklistTabBtn');
  if (b) { hcOpen(b); hcPick(id); return; }   // admin portal: the Host Checklist tab, on this retreat
  hcState.bookingId = id; hcInline = !hcInline; hcRenderBox();   // no sidebar here (teacher preview): open it right inside the box
}
(function () {
  if (typeof regRender !== 'function') return;
  const orig = window.regRender;
  window.regRender = function () { const out = orig.apply(this, arguments); hcRenderBox(); return out; };
})();

(function () {
  const side = document.getElementById('staffSideBtn'), after = document.getElementById('tab-checkoutbalances') || document.getElementById('tab-doublecharges');
  if (!side || !after || document.getElementById('tab-hostchecklist')) return;
  const panel = document.createElement('div');
  panel.className = 'tab-panel'; panel.id = 'tab-hostchecklist'; panel.style.flexDirection = 'column';
  panel.innerHTML = '<div id="hcContent" style="flex:1;overflow:auto;padding:28px 36px;background:#f5f1eb"></div>';
  after.parentNode.insertBefore(panel, after.nextSibling);
  const b = document.createElement('button');
  b.className = 'tab-btn tab-btn-sub'; b.id = 'hostchecklistTabBtn'; b.setAttribute('onclick', 'hcOpen(this)'); b.style.color = '#d97706';
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><polyline points="8 9 10 11 14 7"/><line x1="8" y1="16" x2="16" y2="16"/></svg> Host Checklist';
  side.parentNode.insertBefore(b, side);
})();
