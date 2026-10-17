// ===== schedule-guides.js — guides on the schedules (Darlene 2026-10-17) =====
// Loaded as a classic script AFTER teacher-portal.js, activity-sheet.js and activity-guides.js; shares global scope.
//  1. Review Schedule > Assigned Activities: every activity row gets a "Guide" dropdown (same names as the Activities page).
//  2. The retreat's schedule (teacher view, printed schedule, resident print) shows the guide next to the activity: "Grande Cenote · Guide: Sergio".
// The guide is the same one the Activities page uses (Guide 1 / Guide 2 in app_store 'act_ops', key "<activity id>|<date>"), so setting it in
// either place shows in both. teacher-portal.js only calls schedGuideSuffix(); everything else lives here.
function schedGuideTitle(n) { n = String(n || '').trim(); return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''; }
function schedGuideSuffix(bk, a) {
  try {
    const o = (typeof actOpsData !== 'undefined' && actOpsData[a.aoId + '|' + String(a.date || '').slice(0, 10)]) || {};
    const seen = new Set(), g = [];
    [o.leader, o.guide1, o.guide2].filter(Boolean).map(schedGuideTitle).forEach(n => { if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); g.push(n); } });
    return g.length ? ' · ' + (g.length > 1 ? 'Guides' : 'Guide') + ': ' + g.join(' & ') : '';
  } catch (e) { return ''; }
}
function schedSetGuide(bkId, idx, val, field) {
  field = field === 'guide2' ? 'guide2' : 'guide1';
  const bk = (AppData.bookings || []).find(b => b.id === bkId), a = bk && (bk.retreatActivities || [])[idx];
  if (!a) return;
  const key = a.aoId + '|' + String(a.date || '').slice(0, 10);
  if (!actOpsData[key]) actOpsData[key] = {};
  actOpsData[key][field] = String(val || '').toLowerCase();
  if (typeof actOpsSave === 'function') actOpsSave();
  if (typeof svRefreshActivityView === 'function') svRefreshActivityView(bkId);
  if (typeof showToast === 'function') showToast(val ? `Guide ${val} saved for this activity.` : 'Guide cleared.');
}
if (typeof svActivityEditorHtml === 'function') {
  const _orig = svActivityEditorHtml;
  svActivityEditorHtml = function (bk, bkId) {
    let html = _orig.apply(this, arguments);
    try {
      const names = typeof TOUR_GUIDE_NAMES !== 'undefined' ? TOUR_GUIDE_NAMES : [];
      html = html.replace(/(<input type="time"[^>]*svChangeActivityTime\('([^']+)',(\d+),this\.value\)[^>]*>)/g, (m, whole, id, idx) => {
        const a = (bk.retreatActivities || [])[+idx]; if (!a) return m;
        const o = (typeof actOpsData !== 'undefined' && actOpsData[a.aoId + '|' + String(a.date || '').slice(0, 10)]) || {};
        const mk = (field, cur, blank) => `<select onchange="schedSetGuide('${id}',${idx},this.value,'${field}')" title="Who guides or leads this (add a second person if needed)" style="padding:5px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12px;background:var(--sand)">` +
          ['', ...names].map(n => `<option value="${n}" ${n.toLowerCase() === cur ? 'selected' : ''}>${n || blank}</option>`).join('') + '</select>';
        return m + mk('guide1', o.guide1 || '', '— Guide 1 —') + mk('guide2', o.guide2 || '', '— Guide 2 —');
      });
    } catch (e) { console.warn('[schedule-guides]', e); }
    return html;
  };
}

// The Schedule calendar draws the guides too (teacher-portal.js calls schedGuideSuffix when it builds each activity block). The saved guide
// assignments are normally loaded only when the Activities page is opened, so load them once the first time the calendar draws, then draw again.
let _sgLoaded = false;
if (typeof skedBuild === 'function') {
  const _origSked = skedBuild;
  skedBuild = function () {
    const r = _origSked.apply(this, arguments);
    if (!_sgLoaded && typeof actOpsLoad === 'function') {
      _sgLoaded = true;
      Promise.resolve(actOpsLoad()).then(() => { try { _origSked.apply(window, []); } catch (e) {} }).catch(() => {});
    }
    return r;
  };
}
