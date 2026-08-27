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
let spaCurView = 'services';

function spaNewId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const SPA_DEFAULT_SERVICES = [
  { name: 'Mayan Healing Service', duration: 90, price: 165, category: 'massage' },
  { name: '90 Minute Massage', duration: 90, price: 145, category: 'massage' },
  { name: '60 Minute Massage', duration: 60, price: 95, category: 'massage' },
  { name: 'Reflexology', duration: null, price: null, category: 'massage' },
  { name: 'Facial', duration: null, price: null, category: 'spa' },
  { name: 'Thai Massage', duration: null, price: 125, category: 'massage' },
  { name: 'Tarot Card Reading', duration: null, price: 95, category: 'wellness' },
  { name: 'Private Breathwork', duration: 45, price: 80, category: 'wellness' },
  { name: 'Aura Reading', duration: null, price: 85, category: 'wellness' },
  { name: 'Private Yoga', duration: null, price: 95, category: 'fitness' },
  { name: 'Private Fitness', duration: null, price: 95, category: 'fitness' },
  { name: 'Private Pilates', duration: null, price: 95, category: 'fitness' },
];
const SPA_DEFAULT_ROOMS = [
  'Spa Room 1', 'Spa Room 2', 'Spa Room 3', 'Spa Room 4', 'Spa Room 5', 'Spa Room 6',
  'Maria Luisa Room — Grande',
];

async function spaLoad() {
  try {
    const { data } = await db.from('app_store').select('value').eq('key', 'spa_data').single();
    if (data && data.value && (data.value.services || []).length) {
      SpaData = data.value;
    } else {
      // First run — seed defaults so the tab isn't empty, matching prices/durations from spec.
      // Duration/price left blank where the spec marked them TBD — admin fills in via Edit.
      SpaData = {
        services: SPA_DEFAULT_SERVICES.map(s => ({
          id: spaNewId('sv'), name: s.name, description: '', duration: s.duration, buffer: 0,
          price: s.price, currency: 'USD', category: s.category, active: true,
          roomRequired: true, genderPrefEnabled: true,
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
  spaRender();
}

function spaSetView(v) {
  spaCurView = v;
  ['services', 'therapists', 'rooms'].forEach(id => {
    const btn = document.getElementById('spaView' + id.charAt(0).toUpperCase() + id.slice(1));
    if (btn) {
      btn.style.background = id === v ? 'var(--teal,#2d6a6a)' : 'transparent';
      btn.style.color = id === v ? '#fff' : 'var(--dark)';
    }
  });
  spaRender();
}

function spaRender() {
  const addWrap = document.getElementById('spaAddBtnWrap');
  const addBtn = (label, onclick) => `<button onclick="${onclick}" style="display:flex;align-items:center;gap:6px;padding:9px 18px;background:var(--teal,#2d6a6a);color:#fff;border:none;border-radius:10px;font-family:'Jost',sans-serif;font-size:13px;font-weight:600;cursor:pointer">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>${label}</button>`;
  if (spaCurView === 'services') { addWrap.innerHTML = addBtn('New Service', 'spaShowServiceForm(null)'); spaRenderServices(); }
  if (spaCurView === 'therapists') { addWrap.innerHTML = addBtn('New Therapist', 'spaShowTherapistForm(null)'); spaRenderTherapists(); }
  if (spaCurView === 'rooms') { addWrap.innerHTML = addBtn('New Room', 'spaShowRoomForm(null)'); spaRenderRooms(); }
}

// ── SERVICES ─────────────────────────────────────────────────────────────
function spaRenderServices() {
  const el = document.getElementById('spaContent');
  const active = SpaData.services.filter(s => s.active);
  const inactive = SpaData.services.filter(s => !s.active);
  if (!active.length) { el.innerHTML = '<p style="color:#9ca3af;font-style:italic;text-align:center;padding:40px">No services yet.</p>'; return; }
  const catColors = { massage: '#2d6a6a', spa: '#a855f7', wellness: '#c084fc', fitness: '#f59e0b' };
  const card = s => {
    const missing = !s.duration || !s.price;
    const color = catColors[s.category] || '#6b7280';
    return `<div onclick="spaShowServiceForm('${s.id}')" style="background:#fff;border:1.5px solid ${missing ? '#fbbf24' : '#e8dfd4'};border-radius:14px;padding:16px 18px;cursor:pointer;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.08)'" onmouseout="this.style.boxShadow='none'">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:#2d2520">${s.name}</div>
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:${color};background:${color}18;border-radius:6px;padding:2px 8px;flex-shrink:0">${s.category}</span>
      </div>
      ${s.description ? `<div style="font-size:12px;color:#8a7e74;margin-top:4px">${s.description}</div>` : ''}
      <div style="display:flex;gap:14px;margin-top:10px;font-size:12.5px;color:#4a4038">
        <span>${s.duration ? s.duration + ' min' : '<span style="color:#d97706;font-weight:600">Duration TBD</span>'}</span>
        <span>${s.price != null ? '$' + s.price : '<span style="color:#d97706;font-weight:600">Price TBD</span>'}</span>
        ${s.roomRequired ? '<span style="color:#9ca3af">Room required</span>' : ''}
      </div>
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
  document.getElementById('spaSvcGenderPref').checked = s ? !!s.genderPrefEnabled : true;
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
function spaRenderTherapists() {
  const el = document.getElementById('spaContent');
  if (!SpaData.therapists.length) { el.innerHTML = '<p style="color:#9ca3af;font-style:italic;text-align:center;padding:40px">No therapists yet — add your first one.</p>'; return; }
  const list = SpaData.therapists.slice().sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1) || a.firstName.localeCompare(b.firstName));
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">${list.map(t => {
    const svcCount = (t.services || []).length;
    const roomName = t.defaultRoomId ? (SpaData.rooms.find(r => r.id === t.defaultRoomId)?.name || '') : '';
    return `<div onclick="spaShowTherapistForm('${t.id}')" style="background:#fff;border:1.5px solid #e8dfd4;border-radius:14px;padding:16px 18px;cursor:pointer;opacity:${t.active ? 1 : .55};transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.08)'" onmouseout="this.style.boxShadow='none'">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:#2d2520">${t.firstName} ${t.lastName || ''}</div>
        ${!t.active ? '<span style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;background:#f3f4f6;border-radius:6px;padding:2px 8px">Inactive</span>' : ''}
      </div>
      <div style="font-size:12px;color:#8a7e74;margin-top:4px;text-transform:capitalize">${t.gender || ''}</div>
      <div style="display:flex;gap:14px;margin-top:10px;font-size:12.5px;color:#4a4038">
        <span>${svcCount} service${svcCount === 1 ? '' : 's'}</span>
        ${roomName ? `<span style="color:#9ca3af">${roomName}</span>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;
}

function spaTherapistServicesHtml(t) {
  if (!SpaData.services.filter(s => s.active).length) return '<p style="font-size:12px;color:#9ca3af;font-style:italic">Add services first.</p>';
  const rates = {};
  (t?.services || []).forEach(r => { rates[r.serviceId] = r; });
  return SpaData.services.filter(s => s.active).map(s => {
    const r = rates[s.id];
    const checked = !!r;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#f5f1eb;border-radius:8px">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#2d2520;flex:1;cursor:pointer">
        <input type="checkbox" class="spa-ther-svc-chk" data-svc="${s.id}" ${checked ? 'checked' : ''} onchange="spaToggleTherSvcRow('${s.id}')">
        ${s.name}
      </label>
      <select id="spaTherRateType_${s.id}" style="padding:5px 8px;font-size:12px;border:1.5px solid #c8bfb5;border-radius:6px;font-family:'Jost',sans-serif;background:#fff" ${checked ? '' : 'disabled'}>
        <option value="FIXED" ${r?.compensationType === 'FIXED' ? 'selected' : ''}>Fixed $</option>
        <option value="PERCENTAGE" ${r?.compensationType === 'PERCENTAGE' ? 'selected' : ''}>% of price</option>
        <option value="HOURLY" ${r?.compensationType === 'HOURLY' ? 'selected' : ''}>Hourly $</option>
      </select>
      <input id="spaTherRateVal_${s.id}" type="number" min="0" step="1" placeholder="rate" value="${r?.compensationValue ?? ''}" style="width:80px;padding:5px 8px;font-size:12px;border:1.5px solid #c8bfb5;border-radius:6px;font-family:'Jost',sans-serif" ${checked ? '' : 'disabled'}>
    </div>`;
  }).join('');
}

function spaToggleTherSvcRow(svcId) {
  const chk = document.querySelector(`.spa-ther-svc-chk[data-svc="${svcId}"]`);
  const on = chk.checked;
  document.getElementById('spaTherRateType_' + svcId).disabled = !on;
  document.getElementById('spaTherRateVal_' + svcId).disabled = !on;
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
  document.getElementById('spaTherNotes').value = t?.notes || '';
  document.getElementById('spaTherActive').checked = t ? t.active !== false : true;
  const roomSel = document.getElementById('spaTherDefaultRoom');
  roomSel.innerHTML = '<option value="">— None —</option>' + SpaData.rooms.map(r => `<option value="${r.id}" ${t?.defaultRoomId === r.id ? 'selected' : ''}>${r.name}</option>`).join('');
  document.getElementById('spaTherServicesWrap').innerHTML = spaTherapistServicesHtml(t);
  openModal('spaTherapistModal');
}

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
    services.push({ serviceId: svcId, compensationType, compensationValue, effectiveFrom: new Date().toISOString() });
  });
  const fields = {
    firstName, lastName: document.getElementById('spaTherLast').value.trim(),
    email: document.getElementById('spaTherEmail').value.trim(),
    phone: document.getElementById('spaTherPhone').value.trim(),
    gender: document.getElementById('spaTherGender').value,
    defaultRoomId: document.getElementById('spaTherDefaultRoom').value || null,
    notes: document.getElementById('spaTherNotes').value.trim(),
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
