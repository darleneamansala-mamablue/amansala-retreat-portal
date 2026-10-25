// ===== fire-pit.js — Fire Pit nights for a retreat =====
// Loaded as a classic script AFTER teacher-portal.js and host-checklist.js; shares global scope. Standalone. Adds:
//  1. "Fire Pit" (id ao21, price $0) to the add-on list, kept there after the add-ons reload from Supabase, so schedules know its name; 90 minutes long.
//  2. A "Fire Pit" tab in the admin sidebar: pick a retreat, tick the nights it wants the fire pit (every night if they like, the arrival night included) and set the time
//     for each (default 8:00 PM). Saving writes one retreat-activity line per ticked night ({ aoId: 'ao21', date, time }), the same lines the rest of the portal already reads, so
//     the day-by-day schedule, printed schedule and activity sheet show "Fire Pit" with that date and time. Un-ticking a night removes its line.
// The few existing schedule screens that skip the arrival day now let ao21 through (see teacher-portal.js). Asked by Darlene 2026-10-24.
const FP_ID = 'ao21', FP_DEFAULT_TIME = '20:00';
let fpState = { bookingId: '' };

function fpEnsureAddOn() {
  try { if (typeof ADD_ONS !== 'undefined' && !ADD_ONS.some(a => a.id === FP_ID)) ADD_ONS.push({ id: FP_ID, name: 'Fire Pit', desc: 'Evening fire pit gathering', price: 0, category: 'ceremony', cat: 'ceremony' }); } catch (e) {}
  try { if (typeof ACTS_DUR !== 'undefined' && !ACTS_DUR[FP_ID]) ACTS_DUR[FP_ID] = 90; } catch (e) {}
}
fpEnsureAddOn();
// The add-on list reloads from Supabase a moment after the page opens (and the first reload happens before this file loads), which dropped ao21 and made the schedule read
// "Optional ao21" (Darlene's screenshot 2026-10-24). So keep checking that it is there.
setInterval(fpEnsureAddOn, 1500);
(function () {
  if (typeof syncAddOnsFromSupabase !== 'function') return;
  const orig = window.syncAddOnsFromSupabase;
  window.syncAddOnsFromSupabase = async function () { const r = await orig.apply(this, arguments); fpEnsureAddOn(); return r; };
})();

const fpEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const fpToday = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);   // Tulum is UTC-5 all year
const fpAdd = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const fpFmt = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

function fpNights(bk) { const s = String(bk.startDate).slice(0, 10), e = String(bk.endDate).slice(0, 10), out = []; for (let d = s; d < e && out.length < 31; d = fpAdd(d, 1)) out.push(d); return out; }   // arrival night through the last night
function fpRetreats() { const t = fpToday(); return (AppData.bookings || []).filter(b => b.status !== 'cancelled' && b.startDate && b.endDate && (b.bookingType || '') !== 'room_only' && String(b.endDate).slice(0, 10) >= fpAdd(t, -3)).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate))); }
const fpEntries = bk => (bk.retreatActivities || []).filter(a => a.aoId === FP_ID);

function fpRender() {
  const el = document.getElementById('fpContent'); if (!el) return;
  const btn = 'padding:6px 12px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;font-size:12.5px';
  const head = `<div style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600">🔥 Fire Pit</div><div style="font-size:12.5px;color:#6b7280;margin-bottom:14px">Tick the nights a retreat has the fire pit and set the time. It then shows on their schedule as "Fire Pit".</div>`;
  const bk = (AppData.bookings || []).find(b => b.id === fpState.bookingId);
  if (!bk) {
    el.innerHTML = `<div style="max-width:900px;margin:0 auto;font-family:'Jost',sans-serif;color:#2d2520;text-align:left">${head}<div style="display:grid;gap:10px">${fpRetreats().map(b => { const n = fpEntries(b).length;
      return `<div onclick="fpPick('${fpEsc(b.id)}')" style="cursor:pointer;background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;padding:12px 16px;display:flex;justify-content:space-between;gap:12px;align-items:center"><div><b style="font-size:15px">${fpEsc(b.leaderName || b.retreatName)}</b><div style="font-size:12px;color:#6b7280">${fpFmt(String(b.startDate).slice(0, 10))} → ${fpFmt(String(b.endDate).slice(0, 10))}</div></div><div style="font-size:13px;font-weight:700;color:${n ? '#d97706' : '#9ca3af'}">${n ? `🔥 ${n} night${n !== 1 ? 's' : ''}` : 'No fire pit'}</div></div>`; }).join('') || '<div style="color:#9ca3af">No current or upcoming retreats.</div>'}</div></div>`;
    return;
  }
  el.innerHTML = `<div style="max-width:900px;margin:0 auto;font-family:'Jost',sans-serif;color:#2d2520;text-align:left">${head}
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px"><button onclick="fpPick('')" style="${btn}">← All retreats</button><div><b style="font-size:17px">${fpEsc(bk.leaderName || bk.retreatName)}</b> <span style="color:#6b7280;font-size:12.5px">${fpFmt(String(bk.startDate).slice(0, 10))} → ${fpFmt(String(bk.endDate).slice(0, 10))}</span></div></div>
    ${fpPickerHtml(bk)}</div>`;
}
// The nights picker itself (shared by the Fire Pit tab and the inline version in the retreat window)
function fpPickerHtml(bk) {
  const btn = 'padding:6px 12px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;font-size:12.5px';
  const have = {}; fpEntries(bk).forEach(a => { have[String(a.date).slice(0, 10)] = a.time || FP_DEFAULT_TIME; });
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><button onclick="fpAll(true)" style="${btn}">Every night</button><button onclick="fpAll(false)" style="${btn}">Clear</button>
      <span style="font-size:12.5px;color:#6b7280">Set all to</span><input type="time" id="fpAllTime" value="${FP_DEFAULT_TIME}" onchange="fpSetAllTime(this.value)" style="padding:5px 8px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:inherit"></div>
    <div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;overflow:hidden">${fpNights(bk).map((d, i) => `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-top:${i ? '1px solid #f0ebe0' : '0'};${have[d] ? 'background:#fffbeb' : ''}">
      <input type="checkbox" class="fpNight" data-date="${d}" ${have[d] ? 'checked' : ''} style="width:20px;height:20px;cursor:pointer"><div style="flex:1;font-weight:600">${fpFmt(d)}${d === String(bk.startDate).slice(0, 10) ? ' <span style="font-size:11px;color:#9ca3af;font-weight:500">arrival night</span>' : ''}</div>
      <input type="time" class="fpTime" data-date="${d}" value="${fpEsc(have[d] || FP_DEFAULT_TIME)}" style="padding:5px 8px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:inherit"></div>`).join('')}</div>
    <div style="margin-top:12px"><button onclick="fpSave()" style="${btn};background:#d97706;color:#fff;border-color:#d97706;font-weight:700">Save Fire Pit nights</button></div>`;
}
function fpPick(id) { fpState.bookingId = id; fpRender(); }
function fpOpenFor(id) {
  const b = document.getElementById('firepitTabBtn');
  if (b) { fpOpen(b); fpPick(id); return; }
  // no admin sidebar on this screen (e.g. the teacher preview): open the picker inline inside the Fire Pit box
  fpState.bookingId = id; const bk = (AppData.bookings || []).find(x => x.id === id), box = document.getElementById('regFirePitBox'); if (!bk || !box) return;
  box.innerHTML = fpBoxHtml(bk) + '<div style="margin-top:10px">' + fpPickerHtml(bk) + '</div>';
}
function fpAll(on) { document.querySelectorAll('.fpNight').forEach(c => { c.checked = on; }); }
function fpSetAllTime(v) { document.querySelectorAll('.fpTime').forEach(t => { t.value = v; }); }
// The same night can end up saved twice (an older copy of the retreat merged back in). Keep one line per fire pit night.
function fpDedupe(bk) {
  const seen = new Set(), before = (bk.retreatActivities || []).length;
  bk.retreatActivities = (bk.retreatActivities || []).filter(a => { if (a.aoId !== FP_ID) return true; const k = String(a.date || '').slice(0, 10); if (seen.has(k)) return false; seen.add(k); return true; });
  return before !== bk.retreatActivities.length;
}
function fpCleanDuplicates() {
  try {
    if (typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE && !localStorage.getItem('ama_admin_device') && sessionStorage.getItem('ama_admin_viewing') !== '1') return;   // team devices only
    let changed = false;
    (AppData.bookings || []).forEach(bk => { if (fpDedupe(bk)) { bk.retreatActivitiesUpdatedAt = bk.updatedAt = new Date().toISOString(); changed = true; } });
    if (changed) saveAll();
  } catch (e) {}
}
setInterval(fpCleanDuplicates, 20000); setTimeout(fpCleanDuplicates, 4000);

// 'Tours for this group' (tour-picker.js) keeps a per-retreat list of activities turned OFF and removes them on every save; the Fire Pit must never be on it while it has nights.
function fpClearOff(bk) { try { const off = typeof tpGetOff === 'function' ? tpGetOff(bk) : null; if (off && off.has(FP_ID)) { off.delete(FP_ID); tpSetOff(bk, off); } } catch (e) {} }
function fpSave() {
  const bk = (AppData.bookings || []).find(b => b.id === fpState.bookingId); if (!bk) return;
  const times = {}; document.querySelectorAll('.fpTime').forEach(t => { times[t.dataset.date] = t.value || FP_DEFAULT_TIME; });
  const picked = [...document.querySelectorAll('.fpNight')].filter(c => c.checked).map(c => c.dataset.date);
  const keep = (bk.retreatActivities || []).filter(a => a.aoId !== FP_ID);
  bk.retreatActivities = keep.concat(picked.map(d => ({ aoId: FP_ID, date: d, time: times[d], prepaid: false }))); fpDedupe(bk);
  fpClearOff(bk);
  bk.retreatActivitiesUpdatedAt = bk.updatedAt = new Date().toISOString();
  try { saveAll(); } catch (e) { showToast('Could not save: ' + e.message); return; }
  try { if (typeof svRefreshActivityView === 'function' && document.getElementById('scheduleViewerModal')?.classList.contains('open')) svRefreshActivityView(bk.id); } catch (e) {}
  showToast(picked.length ? `🔥 Fire Pit saved for ${picked.length} night${picked.length !== 1 ? 's' : ''} ✓` : 'Fire Pit removed ✓');
  fpRender(); fpRenderBox();
}

function fpOpen(btn) {
  const prev = localStorage.getItem('ama_last_tab');
  switchTab('firepit', btn);
  try { localStorage.setItem('ama_last_tab', prev || 'dashboard'); } catch (e) {}
  fpRender();
}
// ---- Fire Pit line inside the retreat's own window (Teachers tab, the booking you pick there), so it is visible while you work on that retreat ----
function fpBoxHtml(bk) {
  const e = fpEntries(bk).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const nights = e.map(a => `${fpFmt(String(a.date).slice(0, 10))}${a.time ? ' ' + new Date('2000-01-01T' + a.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}`).join(' · ');
  return `<span style="font-weight:800;color:#c2410c">🔥 Fire Pit</span> <span style="color:#6b7280">${e.length ? e.length + ' night' + (e.length !== 1 ? 's' : '') + ': ' + fpEsc(nights) : 'none set'}</span> <button onclick="fpOpenFor('${fpEsc(bk.id)}')" style="margin-left:8px;padding:4px 12px;border:1.5px solid #fdba74;border-radius:8px;background:#fff7ed;color:#9a3412;font-weight:700;font-family:inherit;font-size:12px;cursor:pointer">${e.length ? 'Change nights' : 'Set nights'}</button>`;
}
function fpRenderBox() {
  try {
    // team only: hidden for a real teacher, shown in the admin portal and in the preview-as-teacher on an admin device
    if (typeof IS_TEACHER_MODE !== 'undefined' && IS_TEACHER_MODE && !localStorage.getItem('ama_admin_device')) return;
    const bk = typeof regSelBk !== 'undefined' ? regSelBk : null; let box = document.getElementById('regFirePitBox');
    if (!bk || !bk.id) { if (box) box.style.display = 'none'; return; }
    if (!box) {
      box = document.createElement('div'); box.id = 'regFirePitBox';
      box.style.cssText = 'margin:10px 0;padding:9px 14px;background:#fff7ed;border:1.5px solid #fed7aa;border-radius:10px;font-size:13px;font-family:Jost,sans-serif';
      const anchor = document.getElementById('regGitanoNotice') || document.getElementById('pkgBarBody');
      if (!anchor || !anchor.parentNode) return;
      anchor.parentNode.insertBefore(box, anchor.nextSibling);
    }
    box.style.display = 'block'; box.innerHTML = fpBoxHtml(bk);
  } catch (e) {}
}
(function () {
  if (typeof regRender !== 'function') return;
  const orig = window.regRender;
  window.regRender = function () { const out = orig.apply(this, arguments); fpRenderBox(); return out; };
})();

(function () {
  const side = document.getElementById('staffSideBtn'), after = document.getElementById('tab-hostchecklist') || document.getElementById('tab-checkoutbalances') || document.getElementById('tab-doublecharges');
  if (!side || !after || document.getElementById('tab-firepit')) return;
  const panel = document.createElement('div');
  panel.className = 'tab-panel'; panel.id = 'tab-firepit'; panel.style.flexDirection = 'column';
  panel.innerHTML = '<div id="fpContent" style="flex:1;overflow:auto;padding:28px 36px;background:#f5f1eb"></div>';
  after.parentNode.insertBefore(panel, after.nextSibling);
  const b = document.createElement('button');
  b.className = 'tab-btn tab-btn-sub'; b.id = 'firepitTabBtn'; b.setAttribute('onclick', 'fpOpen(this)'); b.style.color = '#ea580c';
  b.innerHTML = '🔥 Fire Pit';
  side.parentNode.insertBefore(b, side);
})();

// ---- The Assigned Activities editor (a retreat's Schedule window) ----
// Why Fire Pit could not be chosen there (Darlene 2026-10-24, Melissa Masella): the editor allows each activity ONCE per retreat ("already scheduled - edit its existing date/time"), never on the arrival
// night, and its day list starts the day after arrival. A Fire Pit can be on several nights, arrival night included. So for Fire Pit only: adding it adds another night (unless that night already
// has one), its day dropdown also offers the arrival night, and moving it to the arrival night is allowed. Everything else about the editor is unchanged.
(function () {
  const bkOf = id => (AppData.bookings || []).find(b => b.id === id);
  const nightOk = (bk, d) => !!d && d >= String(bk.startDate).slice(0, 10) && d < String(bk.endDate).slice(0, 10);   // arrival night through the last night
  const stamp = bk => { bk.retreatActivitiesUpdatedAt = bk.updatedAt = new Date().toISOString(); };

  if (typeof svAddActivity === 'function') {
    const o = window.svAddActivity;
    window.svAddActivity = function (bkId) {
      const aoId = document.getElementById('svAddAoId')?.value;
      if (aoId !== FP_ID) return o.apply(this, arguments);
      const bk = bkOf(bkId); if (!bk) return;
      const date = document.getElementById('svAddAoDate')?.value, time = document.getElementById('svAddAoTime')?.value || FP_DEFAULT_TIME;
      if (!date) { showToast('Pick the night for the Fire Pit first.'); return; }
      if (!nightOk(bk, date)) { showToast('The Fire Pit can be on any night of the stay, not the departure day.'); return; }
      if (fpEntries(bk).some(a => String(a.date).slice(0, 10) === date)) { showToast('This retreat already has the Fire Pit that night.'); return; }
      (bk.retreatActivities = bk.retreatActivities || []).push({ aoId: FP_ID, date, time, prepaid: false });
      fpClearOff(bk); stamp(bk); saveAll(); if (typeof svRefreshActivityView === 'function') svRefreshActivityView(bkId);
      showToast('🔥 Fire Pit night added ✓');
    };
  }
  if (typeof svChangeActivityDate === 'function') {
    const o = window.svChangeActivityDate;
    window.svChangeActivityDate = function (bkId, idx, newDate) {
      const bk = bkOf(bkId), act = bk && (bk.retreatActivities || [])[idx];
      if (!act || act.aoId !== FP_ID) return o.apply(this, arguments);
      if (!nightOk(bk, newDate)) { showToast('The Fire Pit can be on any night of the stay, not the departure day.'); if (typeof svRefreshActivityView === 'function') svRefreshActivityView(bkId); return; }
      if (fpEntries(bk).some(a => a !== act && String(a.date).slice(0, 10) === newDate)) { showToast('This retreat already has the Fire Pit that night.'); if (typeof svRefreshActivityView === 'function') svRefreshActivityView(bkId); return; }
      act.date = newDate; stamp(bk); saveAll(); if (typeof svRefreshActivityView === 'function') svRefreshActivityView(bkId);
    };
  }
  if (typeof svActivityEditorHtml === 'function') {
    const o = window.svActivityEditorHtml;
    window.svActivityEditorHtml = function (bk, bkId) {
      fpEnsureAddOn();   // so "Fire Pit" is in the Add list even if the add-on list just reloaded
      let html = o.apply(this, arguments);
      try {
        const start = String(bk.startDate).slice(0, 10), lbl = new Date(start + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' (arrival night)';
        const opt = sel => `<option value="${start}"${sel ? ' selected' : ''}>${lbl}</option>`;
        // each Fire Pit row's day dropdown: add the arrival night as the first choice (selected when that is the saved date)
        (bk.retreatActivities || []).forEach((a, idx) => {
          if (a.aoId !== FP_ID) return;
          const m = `onchange="svChangeActivityDate('${bkId}',${idx},this.value)"`, at = html.indexOf(m); if (at < 0) return;
          const gt = html.indexOf('>', at) + 1; html = html.slice(0, gt) + opt(a.date === start) + html.slice(gt);
        });
        // the Add row's day dropdown: the arrival night is offered too (it only works for the Fire Pit; any other activity is still refused with the usual message)
        const addAt = html.indexOf('id="svAddAoDate"'); if (addAt >= 0) { const gt = html.indexOf('>', addAt) + 1; html = html.slice(0, gt) + opt(false) + html.slice(gt); }
      } catch (e) {}
      return html;
    };
  }
})();
(function () {
  if (typeof svAoTimeAutofill !== 'function') return;
  const o = window.svAoTimeAutofill;
  window.svAoTimeAutofill = function () { const r = o.apply(this, arguments); try { if (document.getElementById('svAddAoId')?.value === FP_ID) { const t = document.getElementById('svAddAoTime'); if (t) t.value = FP_DEFAULT_TIME; } } catch (e) {} return r; };   // evenings, not the 11:45 tour default
})();

// ---- "Tours for this group" checklist (tour-picker.js): ticking Fire Pit there did nothing, because it only adds an activity on a day it "normally runs" (weekday rotation) and the Fire Pit has none.
// Now ticking it opens the Fire Pit nights pop-up for that retreat (tick the nights and times, Save); unticking removes every Fire Pit night (the picker's own behaviour). ----
(function () {
  if (typeof tpToggle !== 'function') return;
  const o = window.tpToggle;
  window.tpToggle = function (bkId, aoId, checked) {
    if (aoId !== FP_ID) return o.apply(this, arguments);
    const bk = (AppData.bookings || []).find(b => b.id === bkId); if (!bk) return;
    if (!checked) return o.apply(this, arguments);
    fpClearOff(bk);
    try { if (typeof svRefreshActivityView === 'function') svRefreshActivityView(bkId); } catch (e) {}   // the box stays unticked until nights are saved
    if (typeof qpShow === 'function') { fpState.bookingId = bkId; qpShow('fire', bkId); }
    else showToast('Open the 🔥 Fire Pit button to choose the nights.');
  };
})();
