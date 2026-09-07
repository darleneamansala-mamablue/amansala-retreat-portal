// ===== SPA MODULE — Phase 1: Services, Therapists, Rooms =====
// Own module file per project convention. Persists to Supabase app_store under
// key 'spa_data', same pattern as every other feature in this app (act_ops,
// wellness_schedule_live, etc.) — a single JSON blob, no separate relational
// tables, consistent with how the rest of this codebase is built.
//
// Scope: admin-facing foundation only (Phase 1 of the spa plan). Guest booking,
// the therapist portal, Stripe, and Cloudbeds folio posting are later phases.

let SpaData = { services: [], rooms: [], therapists: [] };
let spaLoaded = false;
let spaCurView = 'dashboard';

function spaNewId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Shared by the Therapists admin list and the Calendar view — grouping is
// derived from each therapist's actual assigned services, not a hardcoded
// name list, so it stays correct as services/assignments change. Someone
// who does both a massage and a private class (e.g. Thai Massage +
// Meditation) legitimately shows up in more than one group.
const SPA_THER_GROUPS = [
  { key: 'massage', label: 'Body Workers', icon: '🪷' },
  { key: 'spirit', label: 'Spirit Workers', icon: '🦋' },
  { key: 'fitness', label: 'Fitness', icon: '💪' },
  { key: 'yoga', label: 'Yoga', icon: '🧘' },
  { key: 'pilates', label: 'Pilates', icon: '🤸' },
  { key: 'dance', label: 'Dance', icon: '💃' },
];
const SPA_GROUP_ICON = Object.fromEntries(SPA_THER_GROUPS.map(g => [g.key, g.icon]));
function spaTherCategories(t) {
  // An explicit primaryCategory (set on the therapist's profile) means they
  // show under that one group only, even if their services span several —
  // otherwise falls back to every category their assigned services touch.
  if (t.primaryCategory) return new Set([t.primaryCategory]);
  return new Set((t.services || []).map(s => SpaData.services.find(sv => sv.id === s.serviceId)?.category).filter(Boolean));
}
function spaTherGroupList(therapists) {
  const groups = SPA_THER_GROUPS.map(g => ({ label: g.label, key: g.key, list: therapists.filter(t => spaTherCategories(t).has(g.key)) }));
  const classified = new Set(groups.flatMap(g => g.list.map(t => t.id)));
  const other = therapists.filter(t => !classified.has(t.id));
  if (other.length) groups.push({ label: 'Other', key: 'other', list: other });
  return groups.filter(g => g.list.length);
}

// Four categories drive both the service form and the therapist groupings
// (Body Workers / Spirit Workers / Fitness / Yoga) seen on the Calendar and
// Therapists views: massage = Body Work, spirit = Spirit Work, fitness, yoga.
const SPA_DEFAULT_SERVICES = [
  { name: 'Mayan Healing Service', duration: 90, price: 165, category: 'massage' },
  { name: '90 Minute Massage', duration: 90, price: 165, category: 'massage' },
  { name: '60 Minute Massage', duration: 60, price: 111, category: 'massage' },
  { name: 'Reflexology', duration: null, price: null, category: 'massage' },
  { name: 'Facial', duration: null, price: null, category: 'massage' },
  { name: 'Thai Massage', duration: null, price: 125, category: 'massage' },
  { name: 'Tarot Card Reading', duration: null, price: 95, category: 'spirit' },
  { name: 'Private Breathwork', duration: 45, price: 80, category: 'spirit' },
  { name: 'Aura Reading', duration: null, price: 85, category: 'spirit' },
  { name: 'Mayan Temazcal', duration: null, price: null, category: 'spirit', sessionType: 'group' },
  { name: 'Cacao and Sound Healing', duration: null, price: null, category: 'spirit', sessionType: 'group' },
  { name: 'Mayan Clay Ceremony', duration: null, price: null, category: 'spirit', sessionType: 'group' },
  { name: 'Ice Bath and Breathwork', duration: null, price: null, category: 'spirit', sessionType: 'group' },
  { name: 'Private Yoga', duration: null, price: 95, category: 'yoga' },
  { name: 'Private Fitness', duration: null, price: 95, category: 'fitness' },
  { name: 'Private Pilates', duration: null, price: 95, category: 'pilates' },
];
const SPA_DEFAULT_ROOMS = [
  'Spa Room 1', 'Spa Room 2', 'Spa Room 3', 'Spa Room 4', 'Spa Room 5', 'Spa Room 6',
  'Maria Luisa Room — Grande',
];

async function spaLoad() {
  try {
    const { data } = await db.from('app_store').select('value').eq('key', 'spa_data').maybeSingle();
    if (data && data.value && (data.value.services || []).length) {
      SpaData = data.value;
    } else {
      // First run — seed defaults so the tab isn't empty, matching prices/durations from spec.
      // Duration/price left blank where the spec marked them TBD — admin fills in via Edit.
      SpaData = {
        services: SPA_DEFAULT_SERVICES.map(s => ({
          id: spaNewId('sv'), name: s.name, description: '', duration: s.duration, buffer: 0,
          price: s.price, currency: 'USD', category: s.category, active: true,
          roomRequired: true, genderPrefEnabled: true, sessionType: s.sessionType || 'individual',
        })),
        rooms: SPA_DEFAULT_ROOMS.map(name => ({ id: spaNewId('rm'), name, location: '' })),
        therapists: [],
      };
      await spaSave();
    }
  } catch (e) {
    console.warn('[spa] load failed', e);
  }
  spaLoaded = true;
}

async function spaSave() {
  try {
    await db.from('app_store').upsert({ key: 'spa_data', value: SpaData, updated_at: new Date().toISOString() });
  } catch (e) {
    console.warn('[spa] save failed', e);
  }
}

async function spaInit() {
  if (!spaLoaded) await spaLoad();
  if (typeof spaCalLoad === 'function' && !spaCalLoaded) await spaCalLoad();
  spaRender();
}

function spaSetView(v) {
  spaCurView = v;
  ['dashboard', 'confirm', 'calendar', 'services', 'therapists', 'rooms', 'public', 'payroll'].forEach(id => {
    const btn = document.getElementById('spaView' + id.charAt(0).toUpperCase() + id.slice(1));
    if (btn) {
      btn.style.background = id === v ? 'var(--teal,#2d6a6a)' : 'transparent';
      btn.style.color = id === v ? '#fff' : 'var(--dark)';
    }
  });
  spaRender();
}

function spaRender() {
  const contentEl = document.getElementById('spaContent');
  contentEl.style.padding = '';
  contentEl.style.textAlign = '';
  const addWrap = document.getElementById('spaAddBtnWrap');
  const addBtn = (label, onclick) => `<button onclick="${onclick}" style="display:flex;align-items:center;gap:6px;padding:9px 18px;background:var(--teal,#2d6a6a);color:#fff;border:none;border-radius:10px;font-family:'Jost',sans-serif;font-size:13px;font-weight:600;cursor:pointer">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>${label}</button>`;
  if (spaCurView === 'dashboard') { addWrap.innerHTML = ''; spaRenderDashboard(); }
  if (spaCurView === 'confirm') { addWrap.innerHTML = ''; spaRenderConfirmations(); }
  if (spaCurView === 'calendar') { spaCalRenderToolbar(); spaCalRender(); }
  if (spaCurView === 'services') { addWrap.innerHTML = addBtn('New Service', 'spaShowServiceForm(null)'); spaRenderServices(); }
  if (spaCurView === 'therapists') { addWrap.innerHTML = addBtn('New Therapist', 'spaShowTherapistForm(null)'); spaRenderTherapists(); }
  if (spaCurView === 'rooms') { addWrap.innerHTML = addBtn('New Room', 'spaShowRoomForm(null)'); spaRenderRooms(); }
  if (spaCurView === 'public') { addWrap.innerHTML = ''; spaRenderPublicPage(); }
  if (spaCurView === 'payroll') { addWrap.innerHTML = ''; spaRenderPayroll(); }
}

// ── DASHBOARD — today's services at a glance, confirmed vs pending ────────
let spaDashDate = new Date(); spaDashDate.setHours(0, 0, 0, 0);
function spaDashNav(dir) { spaDashDate = new Date(spaDashDate.getTime() + dir * DAY_MS); spaRenderDashboard(); }
function spaDashToday() { spaDashDate = new Date(); spaDashDate.setHours(0, 0, 0, 0); spaRenderDashboard(); }
async function spaDashToggleConfirm(apptId) {
  if (typeof spaCalLoad === 'function') await spaCalLoad();
  const a = SpaAppointments.find(x => x.id === apptId);
  if (!a) return;
  a.confirmed = !a.confirmed;
  a.confirmedAt = a.confirmed ? new Date().toISOString() : null;
  a.confirmedBy = a.confirmed ? 'Admin' : null;
  await spaCalSave();
  spaRenderDashboard();
}
// Guest price for one appointment — group-priced services use the locked-in
// group total from booking time, everything else uses the service's price.
function spaApptRevenue(a) {
  const svc = SpaData.services.find(s => s.id === a.serviceId);
  if (!svc) return 0;
  if (svc.groupPricing) return a.groupTotalPriceUSD ?? svc.price ?? 0;
  return svc.price ?? 0;
}
// The assigned therapist's actual take for one appointment, in USD —
// reuses their per-service compensation row (spaTherapistCompAmount), 0 if
// unassigned or no rate is set for that service.
function spaApptTherapistPay(a) {
  if (!a.therapistId) return 0;
  const ther = SpaData.therapists.find(t => t.id === a.therapistId);
  const svc = SpaData.services.find(s => s.id === a.serviceId);
  if (!ther || !svc) return 0;
  const rate = (ther.services || []).find(s => s.serviceId === a.serviceId);
  return spaTherapistCompAmount(rate, svc) || 0;
}
// Daily Report — Darlene's ask: profit of the day, services sold, services
// completed, at the top of the single-day Dashboard view. Profit is based
// on COMPLETED services only (realized revenue), not everything booked —
// "sold" separately counts everything booked that day regardless of status.
function spaDailyReportHtml(todays) {
  const completed = todays.filter(a => a.status === 'COMPLETED');
  let revenue = 0, directCosts = 0, therapistPay = 0;
  completed.forEach(a => {
    const svc = SpaData.services.find(s => s.id === a.serviceId);
    revenue += spaApptRevenue(a);
    directCosts += svc ? spaSvcDirectCostTotal(svc) : 0;
    therapistPay += spaApptTherapistPay(a);
  });
  const profit = revenue - directCosts - therapistPay;
  const tile = (label, value, color, sub) => `<div style="flex:1;min-width:140px;background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;padding:14px 16px">
    <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#8a7e74">${label}</div>
    <div style="font-size:22px;font-weight:800;color:${color || '#2d2520'};margin-top:4px">${value}</div>
    ${sub ? `<div style="font-size:10px;color:#9ca3af;margin-top:2px">${sub}</div>` : ''}
  </div>`;
  return `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">
    ${tile('Services Sold', todays.length)}
    ${tile('Services Completed', completed.length)}
    ${tile('Revenue (Completed)', '$' + revenue.toFixed(0))}
    ${tile('Profit of the Day', '$' + profit.toFixed(0), profit >= 0 ? '#059669' : '#dc2626', 'after costs &amp; therapist pay')}
  </div>`;
}
function spaRenderDashboard() {
  const el = document.getElementById('spaContent');
  const dateStr = spaCalFmtDateStr(spaDashDate);
  const todays = (SpaAppointments || []).filter(a => a.date === dateStr && a.status !== 'CANCELLED').sort((a, b) => spaCalHHMMToMin(a.start) - spaCalHHMMToMin(b.start));
  const svcName = id => SpaData.services.find(s => s.id === id)?.name || 'Service';
  const therName = id => id ? (SpaData.therapists.find(t => t.id === id)?.firstName || 'Unknown') : null;
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dateLabel = `${DAY_NAMES[spaDashDate.getDay()]}, ${MON_NAMES[spaDashDate.getMonth()]} ${spaDashDate.getDate()}`;
  const confirmedCount = todays.filter(a => a.confirmed).length;

  const row = a => {
    const confirmed = !!a.confirmed;
    const unassigned = !a.therapistId;
    const pref = a.therapistPreference?.type;
    const prefLabel = unassigned ? (pref === 'male' ? 'Any male therapist' : pref === 'female' ? 'Any female therapist' : 'Unassigned') : therName(a.therapistId);
    const svc = SpaData.services.find(s => s.id === a.serviceId);
    const match = spaFindGuestRegForAppt(a);
    const bkMatch = !match ? spaFindGuestBookingForAppt(a) : null;
    const chargeGuestLabel = match ? match.guest.name : bkMatch?.bk.leaderName;
    const chargeBtn = a.folioStatus === 'POSTED'
      ? `<span style="font-size:10.5px;font-weight:700;color:#15803d;white-space:nowrap">✓ Charged to Room</span>`
      : (chargeGuestLabel
        ? `<button onclick="spaChargeApptToRoom('${a.id}')" title="Charge this service to ${escHtml(chargeGuestLabel)}'s room folio" style="font-size:10.5px;font-weight:700;padding:4px 9px;border-radius:6px;border:1.5px solid #0d9488;background:#f0fdfa;color:#0f766e;cursor:pointer;white-space:nowrap">🧾 Charge to Room</button>`
        : '');
    return `<div style="display:grid;grid-template-columns:90px 1fr 1fr 160px 140px 130px;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #f0ebe0;background:${confirmed ? '#fff' : '#fffbeb'}">
      <div style="font-weight:700;color:#2d2520;font-size:13px">${spaCalFmtT(a.start)}</div>
      <div style="font-size:13px;color:#2d2520">${menuEsc(svcName(a.serviceId))}</div>
      <div style="font-size:12.5px;color:#6b7280">${menuEsc(a.clientName || '')}</div>
      <div style="font-size:12.5px;${unassigned ? 'color:#dc2626;font-weight:700' : 'color:#4a4038'}">${menuEsc(prefLabel)}</div>
      <div style="text-align:right">
        <button onclick="spaDashToggleConfirm('${a.id}')" style="font-size:11.5px;font-weight:700;padding:5px 12px;border-radius:20px;border:1.5px solid ${confirmed ? '#86efac' : '#fde68a'};background:${confirmed ? '#dcfce7' : '#fef3c7'};color:${confirmed ? '#15803d' : '#92400e'};cursor:pointer">${confirmed ? '✓ Confirmed' : 'Pending'}</button>
      </div>
      <div style="text-align:right">${chargeBtn}</div>
    </div>`;
  };

  el.innerHTML = `<div style="max-width:1020px;margin:0 auto">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap">
      <button onclick="spaDashNav(-1)" style="padding:7px 12px;border:1.5px solid #e8dfd4;background:#fff;border-radius:8px;cursor:pointer;font-size:13px">‹</button>
      <div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:#2d2520;min-width:220px">${dateLabel}</div>
      <button onclick="spaDashNav(1)" style="padding:7px 12px;border:1.5px solid #e8dfd4;background:#fff;border-radius:8px;cursor:pointer;font-size:13px">›</button>
      <button onclick="spaDashToday()" style="padding:7px 14px;border:1.5px solid #e8dfd4;background:#fff;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:600">Today</button>
      ${todays.length ? `<span style="margin-left:auto;font-size:12.5px;color:#6b7280">${confirmedCount} of ${todays.length} confirmed</span>` : ''}
    </div>
    ${spaDailyReportHtml(todays)}
    <div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;overflow:hidden">
      ${todays.length ? `<div style="display:grid;grid-template-columns:90px 1fr 1fr 160px 140px 130px;gap:10px;padding:10px 16px;background:#f8f5f0;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#8a7e74"><div>Time</div><div>Service</div><div>Client</div><div>Therapist</div><div style="text-align:right">Status</div><div></div></div>${todays.map(row).join('')}` : '<div style="padding:40px;text-align:center;color:#9ca3af;font-style:italic">No services booked for this day.</div>'}
    </div>
  </div>`;
}

// ── CONFIRMATIONS — every upcoming service across all days, pending vs
// confirmed, filterable by category — a dedicated cross-date view since the
// Dashboard above only shows one day at a time. This is the place to check
// "did we confirm everything booked this week/month" in one look. ─────────
let spaConfirmFilter = 'all';    // 'all' | 'pending' | 'confirmed'
let spaConfirmCatFilter = 'all'; // 'all' | 'massage' | 'spirit' | 'yogafit'
let spaConfirmSearchText = '';   // free-text search by guest, therapist, or service
function spaConfirmSearchMatches(a) {
  if (!spaConfirmSearchText) return true;
  const q = spaConfirmSearchText.toLowerCase();
  const svcName = (SpaData.services.find(s => s.id === a.serviceId)?.name || '').toLowerCase();
  const therName = (SpaData.therapists.find(t => t.id === a.therapistId)?.firstName || '').toLowerCase();
  const clientName = (a.clientName || '').toLowerCase();
  return svcName.includes(q) || therName.includes(q) || clientName.includes(q);
}
function spaConfirmSetSearch(val) {
  spaConfirmSearchText = val;
  // Re-rendering rebuilds the input itself (innerHTML swap), which would
  // otherwise steal focus after every keystroke — restore focus + cursor
  // position so typing a search term doesn't require re-clicking the box.
  const cursorPos = val.length;
  spaRenderConfirmations();
  const input = document.querySelector('#spaContent input[placeholder*="Search by guest"]');
  if (input) { input.focus(); input.setSelectionRange(cursorPos, cursorPos); }
}
function spaConfirmCatMatches(a) {
  if (spaConfirmCatFilter === 'all') return true;
  const cat = SpaData.services.find(s => s.id === a.serviceId)?.category;
  if (spaConfirmCatFilter === 'other') return cat !== 'massage';
  return cat === spaConfirmCatFilter;
}
function spaConfirmSetCatFilter(key) {
  spaConfirmCatFilter = (spaConfirmCatFilter === key) ? 'all' : key;
  spaRenderConfirmations();
}
function spaConfirmSetStatusFilter(key) {
  spaConfirmFilter = key;
  spaRenderConfirmations();
}
function spaRenderConfirmations() {
  const el = document.getElementById('spaContent');
  const today = spaCalFmtDateStr(new Date());
  const svcName = id => SpaData.services.find(s => s.id === id)?.name || 'Service';
  const therName = id => id ? (SpaData.therapists.find(t => t.id === id)?.firstName || 'Unknown') : null;

  const allUpcoming = (SpaAppointments || []).filter(a => a.status !== 'CANCELLED' && a.date >= today);
  const pendingCount = allUpcoming.filter(a => !a.confirmed).length;
  const upcoming = allUpcoming
    .filter(spaConfirmCatMatches)
    .filter(spaConfirmSearchMatches)
    .filter(a => spaConfirmFilter === 'all' ? true : spaConfirmFilter === 'pending' ? !a.confirmed : !!a.confirmed)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  const statusFilters = [{ key: 'all', label: 'All' }, { key: 'pending', label: 'Pending' }, { key: 'confirmed', label: 'Confirmed' }];

  const row = a => {
    const confirmed = !!a.confirmed;
    const unassigned = !a.therapistId;
    const pref = a.therapistPreference?.type;
    const prefLabel = unassigned ? (pref === 'male' ? 'Any male therapist' : pref === 'female' ? 'Any female therapist' : 'Unassigned') : therName(a.therapistId);
    const match = spaFindGuestRegForAppt(a);
    const bkMatch = !match ? spaFindGuestBookingForAppt(a) : null;
    const chargeGuestLabel = match ? match.guest.name : bkMatch?.bk.leaderName;
    const chargeBtn = a.folioStatus === 'POSTED'
      ? `<span style="font-size:10.5px;font-weight:700;color:#15803d;white-space:nowrap">✓ Charged</span>`
      : (chargeGuestLabel
        ? `<button onclick="spaChargeApptToRoom('${a.id}')" style="font-size:10.5px;font-weight:700;padding:4px 9px;border-radius:6px;border:1.5px solid #0d9488;background:#f0fdfa;color:#0f766e;cursor:pointer;white-space:nowrap">🧾 Charge</button>`
        : '');
    const dateLabel = new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return `<div style="display:grid;grid-template-columns:120px 76px 1fr 1fr 150px 120px 96px;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #f0ebe0;background:${confirmed ? '#fff' : '#fffbeb'}">
      <div style="font-weight:700;color:#2d2520;font-size:12.5px">${dateLabel}</div>
      <div style="font-weight:700;color:#2d2520;font-size:12.5px">${spaCalFmtT(a.start)}</div>
      <div style="font-size:13px;color:#2d2520">${menuEsc(svcName(a.serviceId))}</div>
      <div style="font-size:12.5px;color:#6b7280">${menuEsc(a.clientName || '')}</div>
      <div style="font-size:12.5px;${unassigned ? 'color:#dc2626;font-weight:700' : 'color:#4a4038'}">${menuEsc(prefLabel)}</div>
      <div style="text-align:right">
        <button onclick="spaDashToggleConfirm('${a.id}');spaRenderConfirmations()" style="font-size:11.5px;font-weight:700;padding:5px 12px;border-radius:20px;border:1.5px solid ${confirmed ? '#86efac' : '#fde68a'};background:${confirmed ? '#dcfce7' : '#fef3c7'};color:${confirmed ? '#15803d' : '#92400e'};cursor:pointer">${confirmed ? '✓ Confirmed' : 'Pending'}</button>
      </div>
      <div style="text-align:right">${chargeBtn}</div>
    </div>`;
  };

  el.innerHTML = `<div style="max-width:1100px;margin:0 auto">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:#2d2520">Upcoming Confirmations</div>
      ${pendingCount ? `<span style="background:#fef3c7;color:#92400e;border-radius:99px;padding:3px 12px;font-size:12px;font-weight:700">${pendingCount} pending</span>` : `<span style="background:#dcfce7;color:#15803d;border-radius:99px;padding:3px 12px;font-size:12px;font-weight:700">All caught up ✓</span>`}
      <input type="text" value="${escHtml(spaConfirmSearchText)}" oninput="spaConfirmSetSearch(this.value)" placeholder="Search by guest, therapist, or service…" style="margin-left:auto;min-width:220px;padding:7px 12px;border:1.5px solid #e8dfd4;border-radius:8px;font-family:'Jost',sans-serif;font-size:12.5px">
    </div>
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      <span style="font-size:11px;font-weight:700;color:#8a7e74;text-transform:uppercase;letter-spacing:.4px">Status:</span>
      ${statusFilters.map(f => `<button onclick="spaConfirmSetStatusFilter('${f.key}')" style="padding:6px 13px;font-size:12px;font-weight:700;border-radius:99px;cursor:pointer;font-family:'Jost',sans-serif;border:1.5px solid ${spaConfirmFilter === f.key ? 'var(--teal,#2d6a6a)' : '#e8dfd4'};background:${spaConfirmFilter === f.key ? 'var(--teal,#2d6a6a)' : '#fff'};color:${spaConfirmFilter === f.key ? '#fff' : 'var(--dark)'}">${f.label}</button>`).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:18px">
      <span style="font-size:11px;font-weight:700;color:#8a7e74;text-transform:uppercase;letter-spacing:.4px">Category:</span>
      ${SPA_CAL_FILTER_BTNS.map(f => `<button onclick="spaConfirmSetCatFilter('${f.key}')" style="padding:6px 13px;font-size:12px;font-weight:700;border-radius:99px;cursor:pointer;font-family:'Jost',sans-serif;border:1.5px solid ${spaConfirmCatFilter === f.key ? 'var(--teal,#2d6a6a)' : '#e8dfd4'};background:${spaConfirmCatFilter === f.key ? 'var(--teal,#2d6a6a)' : '#fff'};color:${spaConfirmCatFilter === f.key ? '#fff' : 'var(--dark)'}">${f.label}</button>`).join('')}
      ${spaConfirmCatFilter !== 'all' ? `<button onclick="spaConfirmSetCatFilter('all')" style="padding:6px 13px;font-size:11.5px;font-weight:600;border-radius:99px;cursor:pointer;font-family:'Jost',sans-serif;border:1.5px dashed var(--muted);background:none;color:var(--muted)">Show All</button>` : ''}
    </div>
    <div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;overflow:hidden">
      ${upcoming.length ? `<div style="display:grid;grid-template-columns:120px 76px 1fr 1fr 150px 120px 96px;gap:10px;padding:10px 16px;background:#f8f5f0;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#8a7e74"><div>Date</div><div>Time</div><div>Service</div><div>Client</div><div>Therapist</div><div style="text-align:right">Status</div><div></div></div>${upcoming.map(row).join('')}` : '<div style="padding:40px;text-align:center;color:#9ca3af;font-style:italic">Nothing in this view.</div>'}
    </div>
  </div>`;
}

// Match a spa appointment's clientName against registered guests (name-only —
// spa appointments have no email) to find the guest's room/folio to charge.
function spaFindGuestRegForAppt(a) {
  const key = (a.clientName || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!key) return null;
  for (const reg of (AppData.regs || [])) {
    const idx = (reg.guests || []).findIndex(g => (g.name || '').toLowerCase().replace(/\s+/g, ' ').trim() === key);
    if (idx >= 0) return { reg, guest: reg.guests[idx], guestIdx: idx };
  }
  return null;
}
// Room Only / BBC / Restore & Renew guests have no reg — their room and
// charges live directly on the booking. Without this fallback, a spa charge
// for one of these guests has no folio to attach to and "Charge to Room"
// never even appears.
function spaFindGuestBookingForAppt(a) {
  const key = (a.clientName || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!key) return null;
  for (const bk of (AppData.bookings || [])) {
    if (bk.bookingType !== 'room_only') continue;
    if ((bk.leaderName || '').toLowerCase().replace(/\s+/g, ' ').trim() === key) return { bk };
  }
  return null;
}
async function spaChargeApptToRoom(apptId) {
  const a = (SpaAppointments || []).find(x => x.id === apptId); if (!a) return;
  if (a.folioStatus === 'POSTED') { showToast('Already charged to this room.'); return; }
  const match = spaFindGuestRegForAppt(a);
  const bkMatch = !match ? spaFindGuestBookingForAppt(a) : null;
  if (!match && !bkMatch) { showToast('No matching registered guest found.'); return; }
  const svc = SpaData.services.find(s => s.id === a.serviceId);
  const name = svc?.name || 'Spa Service';
  const price = svc?.groupPricing ? (a.groupTotalPriceUSD ?? svc.price) : svc?.price;
  if (price == null) { showToast('This service has no price set — add one in Services first.'); return; }
  const category = /massage/i.test(name) ? 'Massage' : 'Spa';
  const guestLabel = match ? match.guest.name : bkMatch.bk.leaderName;
  if (!confirm(`Charge ${guestLabel}'s room folio ${fmt$(price)} for "${name}"?`)) return;
  const chargeId = uid();
  if (match) {
    if (!match.reg.charges) match.reg.charges = [];
    match.reg.charges.push({ id: chargeId, date: a.date, category, description: name, amount: price, guestName: match.guest.name, addedAt: new Date().toISOString(), addedBy: getCurrentSession()?.name || 'Staff', source: 'spa' });
    a.folioRegId = match.reg.id;
  } else {
    if (!bkMatch.bk.charges) bkMatch.bk.charges = [];
    bkMatch.bk.charges.push({ id: chargeId, date: a.date, category, description: name, amount: price, guestName: bkMatch.bk.leaderName, addedAt: new Date().toISOString(), addedBy: getCurrentSession()?.name || 'Staff', source: 'spa' });
    a.folioBkId = bkMatch.bk.id;
  }
  saveAll();
  a.folioStatus = 'POSTED';
  a.folioChargeId = chargeId;
  if (typeof spaCalSave === 'function') await spaCalSave();
  logActivity('Charge added', `${fmt$(price)} — ${name} — ${guestLabel} (from Spa)`, match ? match.reg.bookingId : bkMatch.bk.id);
  showToast(`Charged ${fmt$(price)} to ${guestLabel}'s folio ✓`);
  spaRenderDashboard();
}

// ── PAYROLL (code-gated) ─────────────────────────────────────────────────
// Not real per-user authentication — a separate access code from the
// general staff login, same lightweight-gate pattern used elsewhere in this
// app (driver logins, schedule-editor password). Share it only with people
// who should see pay data. Change it any time by editing this constant.
const SPA_PAYROLL_CODE = 'amansala-pay-2026';

function spaRenderPayroll() {
  const el = document.getElementById('spaContent');
  if (sessionStorage.getItem('spa_payroll_unlocked') === '1') { spaRenderPayrollTable(); return; }
  el.innerHTML = `<div style="max-width:360px;margin:60px auto;text-align:center;background:#fff;border:1.5px solid #e8dfd4;border-radius:14px;padding:32px 28px">
    <div style="font-size:32px;margin-bottom:10px">🔒</div>
    <div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600;color:#2d2520;margin-bottom:6px">Payroll Access</div>
    <div style="font-size:12.5px;color:#8a7e74;margin-bottom:18px">This shows what each therapist earns. Enter the access code to continue.</div>
    <input type="password" id="spaPayrollCode" placeholder="Access code" style="width:100%;padding:10px 12px;border:1.5px solid #c8bfb5;border-radius:9px;font-family:'Jost',sans-serif;font-size:13px;box-sizing:border-box;margin-bottom:10px" onkeydown="if(event.key==='Enter')spaUnlockPayroll()">
    <button onclick="spaUnlockPayroll()" style="width:100%;padding:10px;background:var(--teal,#2d6a6a);color:#fff;border:none;border-radius:9px;font-family:'Jost',sans-serif;font-size:13px;font-weight:600;cursor:pointer">Unlock</button>
    <div id="spaPayrollErr" style="display:none;color:#dc2626;font-size:12px;margin-top:10px">Incorrect code.</div>
  </div>`;
}

function spaUnlockPayroll() {
  const val = document.getElementById('spaPayrollCode').value;
  if (val === SPA_PAYROLL_CODE) {
    sessionStorage.setItem('spa_payroll_unlocked', '1');
    spaRenderPayrollTable();
  } else {
    document.getElementById('spaPayrollErr').style.display = 'block';
  }
}

// Real earnings from completed appointments only (not confirmed-but-not-yet-
// performed) -- each appointment keeps the service+rate it actually used, so
// this stays accurate even if prices/rates change later.
function spaRenderPayrollTable() {
  const el = document.getElementById('spaContent');
  const completed = (typeof SpaAppointments !== 'undefined' ? SpaAppointments : []).filter(a => a.status === 'COMPLETED');
  const rows = SpaData.therapists.map(t => {
    const own = completed.filter(a => a.therapistId === t.id);
    let total = 0;
    const bySvc = {};
    own.forEach(a => {
      const svc = SpaData.services.find(s => s.id === a.serviceId);
      const rate = (t.services || []).find(r => r.serviceId === a.serviceId);
      const pay = spaTherapistCompAmount(rate, svc) || 0;
      total += pay;
      const name = svc?.name || a.serviceId;
      bySvc[name] = (bySvc[name] || 0) + pay;
    });
    return { t, count: own.length, total, bySvc };
  }).filter(r => r.count > 0).sort((a, b) => b.total - a.total);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:14px">
    <button onclick="sessionStorage.removeItem('spa_payroll_unlocked');spaRenderPayroll()" style="font-size:12px;padding:6px 12px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:'Jost',sans-serif">Lock</button>
  </div>`;
  if (!rows.length) {
    html += `<p style="color:#9ca3af;font-style:italic;text-align:center;padding:40px">No completed appointments yet — payroll fills in as services are marked Completed on the calendar.</p>`;
  } else {
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">`;
    rows.forEach(r => {
      html += `<div style="background:#fff;border:1.5px solid #e8dfd4;border-radius:14px;padding:16px 18px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <div style="font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:600;color:#2d2520">${r.t.firstName} ${r.t.lastName || ''}</div>
          <div style="font-size:16px;font-weight:700;color:#059669">$${r.total}</div>
        </div>
        <div style="font-size:11.5px;color:#9ca3af;margin-bottom:8px">${r.count} completed</div>
        ${Object.entries(r.bySvc).map(([name, amt]) => `<div style="display:flex;justify-content:space-between;font-size:12px;color:#6b7280;padding:2px 0"><span>${name}</span><span>$${amt}</span></div>`).join('')}
      </div>`;
    });
    html += `</div>
    <div style="margin-top:18px;text-align:right;font-size:14px;font-weight:700;color:#1a2332">Total owed: $${grandTotal}</div>`;
  }
  el.innerHTML = html;
}

// Live preview of the guest-facing landing page, right inside the admin —
// fully interactive (it's a real iframe), so a booking made in here is a
// real booking, same as if a guest did it from the actual link.
function spaRenderPublicPage() {
  const el = document.getElementById('spaContent');
  const url = location.origin + '/spa-landing.html';
  el.style.padding = '0';
  el.style.textAlign = 'left';
  el.innerHTML = `<iframe src="${url}" style="width:100%;height:calc(100vh - 160px);border:1px solid #e8dfd4;border-radius:12px;background:#fff"></iframe>`;
}

// ── COSTS & PROFIT ───────────────────────────────────────────────────────
// Non-therapist direct costs (laundry, supplies, staff meals, other) live on
// the service. Therapist pay varies per therapist, so it's factored in
// separately wherever a specific therapist+service rate is shown, not baked
// into a single service-level "profit" number.
function spaSvcDirectCostTotal(s) {
  const c = s.costs || {};
  return (c.laundry || 0) + (c.supplies || 0) + (c.staffMeals || 0) + (c.other || 0);
}
function spaSvcMarginHtml(s) {
  const cost = spaSvcDirectCostTotal(s);
  if (!cost) return '';
  const hasPrice = s.price != null;
  const margin = hasPrice ? s.price - cost : null;
  return `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #f0ebe0;font-size:11.5px;color:#6b7280;display:flex;gap:12px">
    <span>Costs: <b style="color:#a05a35">$${cost}</b></span>
    ${hasPrice ? `<span>Margin before therapist pay: <b style="color:${margin >= 0 ? '#059669' : '#dc2626'}">$${margin}</b></span>` : '<span style="color:#d97706;font-style:italic">— set a price to see margin</span>'}
  </div>`;
}
// Staff are paid in pesos, guests are priced in dollars — this rate is
// approximate and only used to fold MXN pay into the USD margin math; it's
// not a live feed. Update SPA_MXN_PER_USD if it drifts noticeably.
const SPA_MXN_PER_USD = 17;

// A therapist's actual take for one service, given their compensation row —
// converted to USD so it can be compared against the (USD) service price.
function spaTherapistCompAmount(rate, service) {
  if (!rate || !service) return null;
  let amountLocal;
  if (rate.compensationType === 'FIXED') amountLocal = rate.compensationValue || 0;
  else if (rate.compensationType === 'PERCENTAGE') amountLocal = service.price != null ? service.price * (rate.compensationValue || 0) / 100 : null;
  else if (rate.compensationType === 'HOURLY') amountLocal = service.duration ? (rate.compensationValue || 0) * service.duration / 60 : null;
  else return null;
  if (amountLocal == null) return null;
  // PERCENTAGE/HOURLY are always computed in the same currency as the input rate value.
  const isMXN = rate.compensationCurrency === 'MXN';
  return Math.round(isMXN ? amountLocal / SPA_MXN_PER_USD : amountLocal);
}

// ── SERVICES ─────────────────────────────────────────────────────────────
function spaRenderServices() {
  const el = document.getElementById('spaContent');
  const active = SpaData.services.filter(s => s.active);
  const inactive = SpaData.services.filter(s => !s.active);
  if (!active.length) { el.innerHTML = '<p style="color:#9ca3af;font-style:italic;text-align:center;padding:40px">No services yet.</p>'; return; }
  const catColors = { massage: '#2d6a6a', spa: '#a855f7', wellness: '#c084fc', fitness: '#f59e0b' };
  // Group-priced services (Temazcal, Cacao, Private Yoga, etc.) have no flat
  // s.price -- their real price lives in s.groupPricing, so the "missing
  // price" check and display need to account for that or every group
  // service falsely shows as unpriced.
  const groupPriceFor = (s, n) => {
    if (!s.groupPricing || !n || n < 1) return null;
    const gp = s.groupPricing;
    if (gp.belowMin && gp.belowMin[n] != null) return gp.belowMin[n];
    if (gp.flatFee != null) return gp.flatFee + Math.max(0, n - (gp.flatFeeMax || 0)) * (gp.perPersonUSD || 0);
    if (n >= gp.minGroup) return gp.perPersonUSD * n;
    return null;
  };
  const card = s => {
    const missing = !s.duration || (s.price == null && !s.groupPricing);
    const color = catColors[s.category] || '#6b7280';
    return `<div onclick="spaShowServiceForm('${s.id}')" style="background:#fff;border:1.5px solid ${missing ? '#fbbf24' : '#e8dfd4'};border-radius:14px;padding:16px 18px;cursor:pointer;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.08)'" onmouseout="this.style.boxShadow='none'">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:#2d2520">${s.name}</div>
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:${color};background:${color}18;border-radius:6px;padding:2px 8px;flex-shrink:0">${s.category}</span>
      </div>
      ${s.description ? `<div style="font-size:12px;color:#8a7e74;margin-top:4px">${s.description}</div>` : ''}
      <div style="display:flex;gap:14px;margin-top:10px;font-size:12.5px;color:#4a4038">
        <span>${s.duration ? s.duration + ' min' : '<span style="color:#d97706;font-weight:600">Duration TBD</span>'}</span>
        <span>${s.price != null ? '$' + s.price : (s.groupPricing ? 'from $' + groupPriceFor(s, s.groupPricing.minGuests || 1) + ' <span style="color:#9ca3af;font-weight:400">(group)</span>' : '<span style="color:#d97706;font-weight:600">Price TBD</span>')}</span>
        ${s.roomRequired ? '<span style="color:#9ca3af">Room required</span>' : ''}
        ${s.sessionType === 'group' ? '<span style="color:#7c3aed;font-weight:600">Group Ceremony</span>' : ''}
      </div>
      ${spaSvcMarginHtml(s)}
    </div>`;
  };
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">${active.map(card).join('')}</div>` +
    (inactive.length ? `<div style="margin-top:26px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;margin-bottom:10px">Deactivated (${inactive.length})</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;opacity:.55">${inactive.map(card).join('')}</div></div>` : '');
}

function spaShowServiceForm(id) {
  const s = id ? SpaData.services.find(x => x.id === id) : null;
  document.getElementById('spaServiceModalTitle').textContent = s ? 'Edit Service' : 'New Service';
  document.getElementById('spaSvcId').value = id || '';
  document.getElementById('spaSvcName').value = s?.name || '';
  document.getElementById('spaSvcDesc').value = s?.description || '';
  document.getElementById('spaSvcDuration').value = s?.duration || '';
  document.getElementById('spaSvcBuffer').value = s?.buffer || 0;
  document.getElementById('spaSvcPrice').value = s?.price ?? '';
  document.getElementById('spaSvcCategory').value = s?.category || 'massage';
  document.getElementById('spaSvcRoomRequired').value = s ? (s.roomRequired ? '1' : '0') : '1';
  document.getElementById('spaSvcSessionType').value = s?.sessionType || 'individual';
  document.getElementById('spaSvcGenderPref').checked = s ? !!s.genderPrefEnabled : true;
  document.getElementById('spaSvcCostLaundry').value = s?.costs?.laundry ?? '';
  document.getElementById('spaSvcCostSupplies').value = s?.costs?.supplies ?? '';
  document.getElementById('spaSvcCostMeals').value = s?.costs?.staffMeals ?? '';
  document.getElementById('spaSvcCostOther').value = s?.costs?.other ?? '';
  const delWrap = document.getElementById('spaSvcDeleteWrap');
  delWrap.style.display = s ? 'block' : 'none';
  delWrap.querySelector('button').textContent = s?.active === false ? 'Reactivate Service' : 'Deactivate Service';
  openModal('spaServiceModal');
}

function spaSaveService() {
  const id = document.getElementById('spaSvcId').value;
  const name = document.getElementById('spaSvcName').value.trim();
  if (!name) { alert('Please enter a service name.'); return; }
  const duration = parseInt(document.getElementById('spaSvcDuration').value, 10) || null;
  if (duration && duration % 15 !== 0) { alert('Duration must be in 15-minute increments (15, 30, 45, 60…).'); return; }
  const priceRaw = document.getElementById('spaSvcPrice').value;
  const fields = {
    name,
    description: document.getElementById('spaSvcDesc').value.trim(),
    duration,
    buffer: parseInt(document.getElementById('spaSvcBuffer').value, 10) || 0,
    price: priceRaw === '' ? null : parseFloat(priceRaw),
    currency: 'USD',
    category: document.getElementById('spaSvcCategory').value,
    roomRequired: document.getElementById('spaSvcRoomRequired').value === '1',
    genderPrefEnabled: document.getElementById('spaSvcGenderPref').checked,
    sessionType: document.getElementById('spaSvcSessionType').value,
    costs: {
      laundry: parseFloat(document.getElementById('spaSvcCostLaundry').value) || 0,
      supplies: parseFloat(document.getElementById('spaSvcCostSupplies').value) || 0,
      staffMeals: parseFloat(document.getElementById('spaSvcCostMeals').value) || 0,
      other: parseFloat(document.getElementById('spaSvcCostOther').value) || 0,
    },
  };
  if (id) {
    const s = SpaData.services.find(x => x.id === id);
    Object.assign(s, fields);
  } else {
    SpaData.services.push({ id: spaNewId('sv'), active: true, ...fields });
  }
  spaSave();
  closeModal('spaServiceModal');
  spaRenderServices();
}

function spaDeleteService(id) {
  const s = SpaData.services.find(x => x.id === id);
  if (!s) return;
  s.active = !s.active;
  spaSave();
  closeModal('spaServiceModal');
  spaRenderServices();
}

// ── THERAPISTS ───────────────────────────────────────────────────────────
function spaTherapistCardHtml(t, groupKey) {
  const svcCount = (t.services || []).length;
  const roomName = t.defaultRoomId ? (SpaData.rooms.find(r => r.id === t.defaultRoomId)?.name || '') : '';
  const placeholderIcon = SPA_GROUP_ICON[groupKey] || '🧑';
  const photo = t.photoDataUrl
    ? `<img src="${t.photoDataUrl}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0">`
    : `<div style="width:44px;height:44px;border-radius:50%;background:#f0ebe0;color:#c8bfb5;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${placeholderIcon}</div>`;
  return `<div onclick="spaShowTherapistForm('${t.id}')" style="background:#fff;border:1.5px solid #e8dfd4;border-radius:14px;padding:16px 18px;cursor:pointer;opacity:${t.active ? 1 : .55};transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.08)'" onmouseout="this.style.boxShadow='none'">
    <div style="display:flex;gap:12px;align-items:flex-start">
      ${photo}
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:#2d2520">${t.firstName} ${t.lastName || ''}</div>
          ${!t.active ? '<span style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;background:#f3f4f6;border-radius:6px;padding:2px 8px;flex-shrink:0">Inactive</span>' : ''}
        </div>
        <div style="font-size:12px;color:#8a7e74;margin-top:2px;text-transform:capitalize">${t.gender || ''}</div>
      </div>
    </div>
    ${t.bio ? `<div style="font-size:12px;color:#6b7280;margin-top:10px;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${t.bio}</div>` : ''}
    <div style="display:flex;gap:14px;margin-top:10px;font-size:12.5px;color:#4a4038">
      <span>${svcCount} service${svcCount === 1 ? '' : 's'}</span>
      ${roomName ? `<span style="color:#9ca3af">${roomName}</span>` : ''}
    </div>
  </div>`;
}

function spaRenderTherapists() {
  const el = document.getElementById('spaContent');
  if (!SpaData.therapists.length) { el.innerHTML = '<p style="color:#9ca3af;font-style:italic;text-align:center;padding:40px">No therapists yet — add your first one.</p>'; return; }
  const active = SpaData.therapists.filter(t => t.active).sort((a, b) => a.firstName.localeCompare(b.firstName));
  const inactive = SpaData.therapists.filter(t => !t.active).sort((a, b) => a.firstName.localeCompare(b.firstName));
  const grid = (list, groupKey) => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">${list.map(t => spaTherapistCardHtml(t, groupKey)).join('')}</div>`;
  let html = spaTherGroupList(active).map(g => `
    <div style="margin-bottom:26px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#a89a86;margin-bottom:10px">${SPA_GROUP_ICON[g.key] || ''} ${g.label}</div>
      ${grid(g.list, g.key)}
    </div>`).join('');
  if (inactive.length) {
    html += `<div style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#a89a86;margin-bottom:10px">Inactive / Muted</div>
      ${grid(inactive)}
    </div>`;
  }
  el.innerHTML = html;
}

function spaTherapistServicesHtml(t) {
  if (!SpaData.services.filter(s => s.active).length) return '<p style="font-size:12px;color:#9ca3af;font-style:italic">Add services first.</p>';
  const rates = {};
  (t?.services || []).forEach(r => { rates[r.serviceId] = r; });
  return SpaData.services.filter(s => s.active).map(s => {
    const r = rates[s.id];
    const checked = !!r;
    return `<div style="padding:8px 10px;background:#f5f1eb;border-radius:8px">
      <div style="display:flex;align-items:center;gap:10px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#2d2520;flex:1;cursor:pointer">
          <input type="checkbox" class="spa-ther-svc-chk" data-svc="${s.id}" ${checked ? 'checked' : ''} onchange="spaToggleTherSvcRow('${s.id}')">
          ${s.name}
        </label>
        <select id="spaTherRateType_${s.id}" onchange="spaUpdateTherProfitDisplay('${s.id}')" style="padding:5px 8px;font-size:12px;border:1.5px solid #c8bfb5;border-radius:6px;font-family:'Jost',sans-serif;background:#fff" ${checked ? '' : 'disabled'}>
          <option value="FIXED" ${r?.compensationType === 'FIXED' ? 'selected' : ''}>Fixed</option>
          <option value="PERCENTAGE" ${r?.compensationType === 'PERCENTAGE' ? 'selected' : ''}>% of price</option>
          <option value="HOURLY" ${r?.compensationType === 'HOURLY' ? 'selected' : ''}>Hourly</option>
        </select>
        <input id="spaTherRateVal_${s.id}" type="number" min="0" step="1" placeholder="rate" value="${r?.compensationValue ?? ''}" oninput="spaUpdateTherProfitDisplay('${s.id}')" style="width:70px;padding:5px 8px;font-size:12px;border:1.5px solid #c8bfb5;border-radius:6px;font-family:'Jost',sans-serif" ${checked ? '' : 'disabled'}>
        <select id="spaTherRateCur_${s.id}" onchange="spaUpdateTherProfitDisplay('${s.id}')" style="padding:5px 6px;font-size:12px;border:1.5px solid #c8bfb5;border-radius:6px;font-family:'Jost',sans-serif;background:#fff" ${checked ? '' : 'disabled'}>
          <option value="MXN" ${(r?.compensationCurrency || 'MXN') === 'MXN' ? 'selected' : ''}>MXN</option>
          <option value="USD" ${r?.compensationCurrency === 'USD' ? 'selected' : ''}>USD</option>
        </select>
      </div>
      <div id="spaTherProfit_${s.id}" style="font-size:11px;color:#6b7280;margin-top:5px;padding-left:2px"></div>
    </div>`;
  }).join('');
}

function spaToggleTherSvcRow(svcId) {
  const chk = document.querySelector(`.spa-ther-svc-chk[data-svc="${svcId}"]`);
  const on = chk.checked;
  document.getElementById('spaTherRateType_' + svcId).disabled = !on;
  document.getElementById('spaTherRateVal_' + svcId).disabled = !on;
  document.getElementById('spaTherRateCur_' + svcId).disabled = !on;
  spaUpdateTherProfitDisplay(svcId);
}

function spaUpdateTherProfitDisplay(svcId) {
  const el = document.getElementById('spaTherProfit_' + svcId);
  if (!el) return;
  const chk = document.querySelector(`.spa-ther-svc-chk[data-svc="${svcId}"]`);
  const s = SpaData.services.find(x => x.id === svcId);
  if (!chk.checked || !s || s.price == null) { el.textContent = ''; return; }
  const rateVal = parseFloat(document.getElementById('spaTherRateVal_' + svcId).value) || 0;
  const rateCur = document.getElementById('spaTherRateCur_' + svcId).value;
  const rate = { compensationType: document.getElementById('spaTherRateType_' + svcId).value, compensationValue: rateVal, compensationCurrency: rateCur };
  const payUSD = spaTherapistCompAmount(rate, s);
  if (payUSD == null) { el.textContent = ''; return; }
  const payLabel = rateCur === 'MXN' ? `$${rateVal} MXN (≈$${payUSD} USD)` : `$${payUSD} USD`;
  const otherCosts = spaSvcDirectCostTotal(s);
  const profit = s.price - payUSD - otherCosts;
  el.innerHTML = `Price $${s.price} − pay ${payLabel}${otherCosts ? ' − other costs $' + otherCosts : ''} = <b style="color:${profit >= 0 ? '#059669' : '#dc2626'}">$${profit} profit</b>`;
}

function spaShowTherapistForm(id) {
  const t = id ? SpaData.therapists.find(x => x.id === id) : null;
  document.getElementById('spaTherModalTitle').textContent = t ? 'Edit Therapist' : 'New Therapist';
  document.getElementById('spaTherId').value = id || '';
  document.getElementById('spaTherFirst').value = t?.firstName || '';
  document.getElementById('spaTherLast').value = t?.lastName || '';
  document.getElementById('spaTherEmail').value = t?.email || '';
  document.getElementById('spaTherPhone').value = t?.phone || '';
  document.getElementById('spaTherGender').value = t?.gender || 'female';
  document.getElementById('spaTherCategory').value = t?.primaryCategory || '';
  document.getElementById('spaTherNotes').value = t?.notes || '';
  document.getElementById('spaTherActive').checked = t ? t.active !== false : true;
  document.getElementById('spaTherBio').value = t?.bio || '';
  spaTherPhotoValue = t?.photoDataUrl || null;
  spaTherRenderPhotoPreview();
  const roomSel = document.getElementById('spaTherDefaultRoom');
  roomSel.innerHTML = '<option value="">— None —</option>' + SpaData.rooms.map(r => `<option value="${r.id}" ${t?.defaultRoomId === r.id ? 'selected' : ''}>${r.name}</option>`).join('');
  document.getElementById('spaTherServicesWrap').innerHTML = spaTherapistServicesHtml(t);
  (t?.services || []).forEach(r => spaUpdateTherProfitDisplay(r.serviceId));
  openModal('spaTherapistModal');
}

// Resized client-side and stored inline as a data URI (same pattern as every
// other value in this record) rather than standing up Supabase Storage for
// what's currently ~15 headshots — capped small enough to keep spa_data light.
let spaTherPhotoValue = null;
function spaTherRenderPhotoPreview() {
  const img = document.getElementById('spaTherPhotoPreview');
  const placeholder = document.getElementById('spaTherPhotoPlaceholder');
  const removeBtn = document.getElementById('spaTherPhotoRemoveBtn');
  if (spaTherPhotoValue) {
    img.src = spaTherPhotoValue; img.style.display = 'block'; placeholder.style.display = 'none'; removeBtn.style.display = 'inline-block';
  } else {
    img.style.display = 'none'; placeholder.style.display = 'flex'; removeBtn.style.display = 'none';
  }
}
function spaTherPhotoSelected(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const size = 300; // square headshot, capped so the JSON blob stays small
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      spaTherPhotoValue = canvas.toDataURL('image/jpeg', 0.82);
      spaTherRenderPhotoPreview();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  input.value = '';
}
function spaTherPhotoRemove() { spaTherPhotoValue = null; spaTherRenderPhotoPreview(); }

function spaSaveTherapist() {
  const id = document.getElementById('spaTherId').value;
  const firstName = document.getElementById('spaTherFirst').value.trim();
  if (!firstName) { alert('Please enter a first name.'); return; }
  const services = [];
  document.querySelectorAll('.spa-ther-svc-chk').forEach(chk => {
    if (!chk.checked) return;
    const svcId = chk.dataset.svc;
    const compensationType = document.getElementById('spaTherRateType_' + svcId).value;
    const compensationValue = parseFloat(document.getElementById('spaTherRateVal_' + svcId).value) || 0;
    const compensationCurrency = document.getElementById('spaTherRateCur_' + svcId).value;
    services.push({ serviceId: svcId, compensationType, compensationValue, compensationCurrency, effectiveFrom: new Date().toISOString() });
  });
  const fields = {
    firstName, lastName: document.getElementById('spaTherLast').value.trim(),
    email: document.getElementById('spaTherEmail').value.trim(),
    phone: document.getElementById('spaTherPhone').value.trim(),
    gender: document.getElementById('spaTherGender').value,
    primaryCategory: document.getElementById('spaTherCategory').value || null,
    defaultRoomId: document.getElementById('spaTherDefaultRoom').value || null,
    notes: document.getElementById('spaTherNotes').value.trim(),
    bio: document.getElementById('spaTherBio').value.trim(),
    photoDataUrl: spaTherPhotoValue,
    active: document.getElementById('spaTherActive').checked,
    services,
  };
  if (id) {
    const t = SpaData.therapists.find(x => x.id === id);
    Object.assign(t, fields);
  } else {
    SpaData.therapists.push({ id: spaNewId('th'), ...fields });
  }
  spaSave();
  closeModal('spaTherapistModal');
  spaRenderTherapists();
}

// ── ROOMS ────────────────────────────────────────────────────────────────
function spaRenderRooms() {
  const el = document.getElementById('spaContent');
  if (!SpaData.rooms.length) { el.innerHTML = '<p style="color:#9ca3af;font-style:italic;text-align:center;padding:40px">No rooms yet.</p>'; return; }
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px">${SpaData.rooms.map(r => {
    const dedicatedTo = SpaData.therapists.find(t => t.defaultRoomId === r.id);
    return `<div onclick="spaShowRoomForm('${r.id}')" style="background:#fff;border:1.5px solid #e8dfd4;border-radius:14px;padding:16px 18px;cursor:pointer;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.08)'" onmouseout="this.style.boxShadow='none'">
      <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:#2d2520">${r.name}</div>
      ${r.location ? `<div style="font-size:12px;color:#8a7e74;margin-top:4px">${r.location}</div>` : ''}
      ${dedicatedTo ? `<div style="font-size:11.5px;color:var(--teal,#2d6a6a);margin-top:8px;font-weight:600">★ ${dedicatedTo.firstName}'s default room</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function spaShowRoomForm(id) {
  const r = id ? SpaData.rooms.find(x => x.id === id) : null;
  document.getElementById('spaRoomModalTitle').textContent = r ? 'Edit Room' : 'New Room';
  document.getElementById('spaRoomId').value = id || '';
  document.getElementById('spaRoomName').value = r?.name || '';
  document.getElementById('spaRoomLocation').value = r?.location || '';
  document.getElementById('spaRoomDeleteWrap').style.display = r ? 'block' : 'none';
  openModal('spaRoomModal');
}

function spaSaveRoom() {
  const id = document.getElementById('spaRoomId').value;
  const name = document.getElementById('spaRoomName').value.trim();
  if (!name) { alert('Please enter a room name.'); return; }
  const fields = { name, location: document.getElementById('spaRoomLocation').value.trim() };
  if (id) {
    const r = SpaData.rooms.find(x => x.id === id);
    Object.assign(r, fields);
  } else {
    SpaData.rooms.push({ id: spaNewId('rm'), ...fields });
  }
  spaSave();
  closeModal('spaRoomModal');
  spaRenderRooms();
}

function spaDeleteRoom(id) {
  if (!confirm('Delete this room? This cannot be undone.')) return;
  SpaData.rooms = SpaData.rooms.filter(x => x.id !== id);
  SpaData.therapists.forEach(t => { if (t.defaultRoomId === id) t.defaultRoomId = null; });
  spaSave();
  closeModal('spaRoomModal');
  spaRenderRooms();
}
