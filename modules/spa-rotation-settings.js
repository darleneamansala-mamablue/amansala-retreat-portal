// ===== SPA AUTO-ASSIGN RULES (staff-only settings) =====
// Jorge's ask 2026-10-15: Darlene's automatic therapist-assignment spec (rotation order,
// Maria Luisa's staged break, general break/cap defaults) was built with these numbers
// hardcoded in spa-booking.html and visito-spa-create-booking.js. This gives staff a real
// screen to change them without a code change -- stored in Supabase app_store under key
// 'spa_rotation_settings', read by both the guest booking page and Lana's tool (each falls
// back to these SAME defaults if the row doesn't exist yet, so behavior never changes
// silently just because this hasn't been saved once).
//
// Lives inside the Spa tab (new "Auto-Assign" pill, booking-hub.html) -- i.e. only reachable
// through the main staff/admin login. A therapist's own login (modules/staff-confirm-
// portal.js, ?mode=confirm) is a completely separate rendering tree that never loads this
// module or touches switchTab()/spaSetView() at all, so therapists have no path to it.
const SPA_ROTATION_KEY = 'spa_rotation_settings';
function spaRotationDefaults() {
  return {
    femaleOrder: ['Laura', 'Laura', 'Gabby', 'Graciela'],
    femaleFallback: 'Rosario',
    malePrimary: 'Julian', malePrimaryCap: 4, maleSecondary: 'Miguel',
    noPreferenceFirst: 'male',
    mariaName: 'Maria Luisa', mariaStageSize: 2, mariaBreakMinutes: 45, mariaDailyCap: 4,
    generalBreakAfter: 3, generalBreakMinutes: 30, generalDailyCap: 7,
  };
}
let _spaRotationCache = null;
async function spaLoadRotationSettings() {
  try {
    const { data } = await db.from('app_store').select('value').eq('key', SPA_ROTATION_KEY).maybeSingle();
    _spaRotationCache = { ...spaRotationDefaults(), ...(data && data.value ? data.value : {}) };
  } catch (e) { _spaRotationCache = spaRotationDefaults(); }
  return _spaRotationCache;
}
async function spaRenderRotationSettings() {
  const el = document.getElementById('spaContent');
  el.innerHTML = '<div style="color:#8a7e74;font-size:13px;text-align:center;padding:40px 0">Loading…</div>';
  const s = await spaLoadRotationSettings();
  const row = (label, inputHtml, hint) => `<div style="display:grid;grid-template-columns:220px 1fr;gap:16px;align-items:start;padding:10px 0;border-bottom:1px solid var(--border)">
    <div style="font-size:13px;font-weight:600;color:var(--dark)">${label}${hint ? `<div style="font-size:11.5px;font-weight:400;color:#8a7e74;margin-top:2px">${hint}</div>` : ''}</div>
    <div>${inputHtml}</div>
  </div>`;
  const inp = (id, val, type = 'text', w = '100%') => `<input id="${id}" type="${type}" value="${String(val).replace(/"/g, '&quot;')}" style="width:${w};padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:'Jost',sans-serif">`;
  el.innerHTML = `
    <div style="max-width:720px">
      <div style="background:#fff;border-radius:14px;padding:24px 28px;margin-bottom:20px">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px">Female rotation</div>
        <div style="font-size:12px;color:#8a7e74;margin-bottom:14px">Order "no preference"/"female" bookings cycle through — repeat a name for extra turns (e.g. Laura twice in a row).</div>
        ${row('Rotation (in order)', inp('sprFemaleOrder', s.femaleOrder.join(', ')), 'Comma-separated, e.g. "Laura, Laura, Gabby, Graciela"')}
        ${row('Last resort', inp('sprFemaleFallback', s.femaleFallback), 'Only used when nobody above can take the booking')}
      </div>
      <div style="background:#fff;border-radius:14px;padding:24px 28px;margin-bottom:20px">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px">Male rotation</div>
        <div style="font-size:12px;color:#8a7e74;margin-bottom:14px">Primary therapist gets priority up to the cap below, then alternates with the secondary.</div>
        ${row('Primary', inp('sprMalePrimary', s.malePrimary))}
        ${row('Primary\'s priority cap / day', inp('sprMalePrimaryCap', s.malePrimaryCap, 'number', '100px'))}
        ${row('Secondary (alternates after cap)', inp('sprMaleSecondary', s.maleSecondary))}
      </div>
      <div style="background:#fff;border-radius:14px;padding:24px 28px;margin-bottom:20px">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px">No gender preference</div>
        ${row('Try first', `<select id="sprNoPrefFirst" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:'Jost',sans-serif"><option value="male"${s.noPreferenceFirst === 'male' ? ' selected' : ''}>Male rotation</option><option value="female"${s.noPreferenceFirst === 'female' ? ' selected' : ''}>Female rotation</option></select>`, 'Falls through to the other if nobody is free')}
      </div>
      <div style="background:#fff;border-radius:14px;padding:24px 28px;margin-bottom:20px">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px">Maria Luisa (Mayan healing)</div>
        <div style="font-size:12px;color:#8a7e74;margin-bottom:14px">She's already the only one offered Mayan-healing services (set per-service). This is just her staged break pattern.</div>
        ${row('Her name (must match Therapists tab)', inp('sprMariaName', s.mariaName))}
        ${row('Services before a break', inp('sprMariaStageSize', s.mariaStageSize, 'number', '100px'))}
        ${row('Break length (minutes)', inp('sprMariaBreakMinutes', s.mariaBreakMinutes, 'number', '100px'))}
        ${row('Daily cap (automatic bookings)', inp('sprMariaDailyCap', s.mariaDailyCap, 'number', '100px'), 'Staff can still book her past this by hand in the Calendar')}
      </div>
      <div style="background:#fff;border-radius:14px;padding:24px 28px;margin-bottom:20px">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px">Everyone else (default)</div>
        <div style="font-size:12px;color:#8a7e74;margin-bottom:14px">Applies to any therapist without their own override on the Therapists tab.</div>
        ${row('Break after this many in a row', inp('sprGeneralBreakAfter', s.generalBreakAfter, 'number', '100px'))}
        ${row('Break length (minutes)', inp('sprGeneralBreakMinutes', s.generalBreakMinutes, 'number', '100px'))}
        ${row('Daily cap (automatic bookings)', inp('sprGeneralDailyCap', s.generalDailyCap, 'number', '100px'))}
      </div>
      <button onclick="spaSaveRotationSettings()" style="padding:11px 24px;background:var(--teal,#2d6a6a);color:#fff;border:none;border-radius:10px;font-family:'Jost',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer">Save Rules</button>
      <span id="sprSaveMsg" style="margin-left:12px;font-size:13px;color:#2d6a6a"></span>
    </div>`;
}
async function spaSaveRotationSettings() {
  const g = id => document.getElementById(id).value.trim();
  const settings = {
    femaleOrder: g('sprFemaleOrder').split(',').map(s => s.trim()).filter(Boolean),
    femaleFallback: g('sprFemaleFallback'),
    malePrimary: g('sprMalePrimary'),
    malePrimaryCap: Math.max(0, parseInt(g('sprMalePrimaryCap'), 10) || 0),
    maleSecondary: g('sprMaleSecondary'),
    noPreferenceFirst: document.getElementById('sprNoPrefFirst').value === 'female' ? 'female' : 'male',
    mariaName: g('sprMariaName'),
    mariaStageSize: Math.max(1, parseInt(g('sprMariaStageSize'), 10) || 1),
    mariaBreakMinutes: Math.max(0, parseInt(g('sprMariaBreakMinutes'), 10) || 0),
    mariaDailyCap: Math.max(0, parseInt(g('sprMariaDailyCap'), 10) || 0),
    generalBreakAfter: Math.max(1, parseInt(g('sprGeneralBreakAfter'), 10) || 1),
    generalBreakMinutes: Math.max(0, parseInt(g('sprGeneralBreakMinutes'), 10) || 0),
    generalDailyCap: Math.max(0, parseInt(g('sprGeneralDailyCap'), 10) || 0),
  };
  if (!settings.femaleOrder.length) { showToast('The female rotation needs at least one name.'); return; }
  if (!settings.malePrimary || !settings.maleSecondary) { showToast('Both male rotation names are required.'); return; }
  try {
    const { error } = await db.from('app_store').upsert({ key: SPA_ROTATION_KEY, value: settings, updated_at: new Date().toISOString() });
    if (error) throw error;
    _spaRotationCache = settings;
    document.getElementById('sprSaveMsg').textContent = 'Saved ✓';
    setTimeout(() => { const m = document.getElementById('sprSaveMsg'); if (m) m.textContent = ''; }, 2500);
  } catch (e) { showToast('Could not save: ' + (e.message || e)); }
}
