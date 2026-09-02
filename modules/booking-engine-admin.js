// ===== booking-engine-admin.js — Booking Engine admin (Settings/Rates/Requests/Discounts/Emails) =====
// Loaded as a classic script; shares global scope (same pattern as cb-portal-sync.js).
// Adapted from Jorge's reference implementation onto our app_store-blob Supabase pattern.
// Room type Book/Extra/pricing fields (be_*) live directly on AppData.roomTypes entries
// and save through the existing saveAll() — same shared path every other room-type edit
// uses. The four new admin-only concepts (bookingEngineSettings, beRates, beDiscountCodes,
// beBookingRequests) are self-contained app_store keys with their own load/save here,
// matching the "separate additive system" pattern used by driver-portal.js/transport.js —
// they must never interfere with the shared AppData/saveAll() path.
// Cloudbeds sync is intentionally NOT wired up here (Darlene decided not to connect Cloudbeds).

let beTab = 'settings';
let beSettings = {};
let beRatesList = [];
let beDiscounts = [];
let beRequests = [];
let beEditRtId = null;
let beEditPhotos = [];
let beLoaded = false;

const BE_PUBLIC_URL = location.origin + '/book.html';
const BE_EXTRA_URL  = location.origin + '/extra-nights.html';

// ─── APP_STORE HELPERS (scoped to this module's 4 new keys) ──
async function beDbGet(key) {
  try {
    const { data, error } = await db.from('app_store').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    return data?.value ?? null;
  } catch (e) { console.warn('[booking-engine-admin] load', key, e.message); return null; }
}
async function beDbSet(key, value) {
  try {
    await db.from('app_store').upsert({ key, value, updated_at: new Date().toISOString() });
    return true;
  } catch (e) { console.warn('[booking-engine-admin] save', key, e.message); showToast('Save failed: ' + e.message); return false; }
}

// ─── ROOM TYPE SORT (matches rooms/teachers ordering elsewhere in the app) ────
const BE_RT_ORDER = ['rt1','rt2','rt3','rt4','rt5','rt6','bd1','rt7','bd2','rt8','bd3','rt9','bd4','cg1','cg2','cg3','cg4','cg5','cg6','csh1','csh2','c4b','c4c'];
function beRtSortKey(rt) {
  const i = BE_RT_ORDER.indexOf(rt.id);
  return i !== -1 ? i : 9999;
}

// ─── INIT / TAB SWITCH ─────────────────────────────────────────
async function beInit() {
  const root = document.getElementById('beRoot');
  if (!root) return;
  if (!beLoaded) {
    root.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted)">Loading Booking Engine…</div>`;
    const [s, r, d, rq] = await Promise.all([
      beDbGet('bookingEngineSettings'),
      beDbGet('beRates'),
      beDbGet('beDiscountCodes'),
      beDbGet('beBookingRequests'),
    ]);
    beSettings  = s ?? {};
    beRatesList = r ?? [];
    beDiscounts = d ?? [];
    // Backfill an id on any legacy discount codes that predate this admin screen.
    let needsIdBackfill = false;
    beDiscounts.forEach(dc => { if (!dc.id) { dc.id = 'dc_' + Math.random().toString(36).slice(2, 10); needsIdBackfill = true; } });
    if (needsIdBackfill) beDbSet('beDiscountCodes', beDiscounts);
    beRequests  = rq ?? [];
    beLoaded = true;
  }
  beRenderShell();
}

function beRenderShell() {
  const root = document.getElementById('beRoot');
  const paidCount = beRequests.filter(r => r.status === 'paid').length;
  root.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div style="background:#fff;border-bottom:1px solid var(--border);padding:14px 20px;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <h2 style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600;color:var(--dark);margin:0">Booking Engine</h2>
          <div style="flex:1"></div>
          <span style="font-size:11px;color:var(--muted);font-weight:600">Escape:</span>
          <code style="font-size:11px;background:var(--sand);padding:3px 8px;border-radius:6px;color:#0d9488">${BE_PUBLIC_URL}</code>
          <button onclick="beCopyLink('${BE_PUBLIC_URL}')" style="${beBtnS('#4db6ac','#fff')}">Copy</button>
          <a href="${BE_PUBLIC_URL}" target="_blank" style="${beBtnS('#f1f5f9','#374151')};text-decoration:none">Preview ↗</a>
          <span style="color:var(--border)">|</span>
          <span style="font-size:11px;color:var(--muted);font-weight:600">Extra Nights:</span>
          <code style="font-size:11px;background:var(--sand);padding:3px 8px;border-radius:6px;color:#8b5cf6">${BE_EXTRA_URL}</code>
          <button onclick="beCopyLink('${BE_EXTRA_URL}')" style="${beBtnS('#8b5cf6','#fff')}">Copy</button>
          <a href="${BE_EXTRA_URL}" target="_blank" style="${beBtnS('#f1f5f9','#374151')};text-decoration:none">Preview ↗</a>
        </div>
        <div style="display:flex;gap:2px;margin-top:12px">
          ${beTabBtn('settings','Settings')}
          ${beTabBtn('rates','Rates')}
          ${beTabBtn('requests',`Requests${paidCount ? ` <span style="background:#16a34a;color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:4px">${paidCount}</span>` : ''}`)}
          ${beTabBtn('discounts','Discounts')}
          ${beTabBtn('emails','Emails')}
        </div>
      </div>
      <div id="beBody" style="flex:1;overflow-y:auto;padding:20px"></div>
    </div>
    ${beRoomEditModalHtml()}`;
  beRenderBody();
}

function beTabBtn(id, label) {
  const active = beTab === id;
  const style = active
    ? `background:#fff;border:1px solid var(--border);border-bottom:none;padding:7px 16px;border-radius:8px 8px 0 0;font-size:13px;font-weight:600;color:var(--dark);cursor:pointer;font-family:'Jost',sans-serif`
    : `background:transparent;border:none;padding:7px 16px;border-radius:8px 8px 0 0;font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;font-family:'Jost',sans-serif`;
  return `<button onclick="beSetTab('${id}')" style="${style}">${label}</button>`;
}

function beSetTab(t) { beTab = t; beRenderShell(); }

function beRenderBody() {
  if      (beTab === 'settings')  beRenderSettings();
  else if (beTab === 'rates')     beRenderRates();
  else if (beTab === 'requests')  beRenderRequests();
  else if (beTab === 'discounts') beRenderDiscounts();
  else if (beTab === 'emails')    beRenderEmails();
}

function beCopyLink(url) { navigator.clipboard.writeText(url).then(() => showToast('Link copied!')); }

// ─── SETTINGS TAB ────────────────────────────────────────────
function beRenderSettings() {
  const s = beSettings;
  let html = `<div style="max-width:760px;margin:0 auto">
    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:20px">
      <h3 style="font-size:14px;font-weight:700;color:var(--dark);margin:0 0 16px">Global Settings</h3>
      <div class="frow">
        <div class="fg"><label>Tagline (shown under the title)</label><input type="text" id="be-tagline" value="${escHtml(s.tagline ?? '')}"></div>
        <div class="fg"><label>Hero image URL</label><input type="text" id="be-hero" value="${escHtml(s.hero_image ?? '')}"></div>
      </div>
      <div class="frow">
        <div class="fg"><label>Taxes (%)</label><input type="number" id="be-taxes" value="${s.taxes_pct ?? 0}" min="0" step="any"></div>
      </div>
      <div class="fg"><label>Terms & Conditions</label><textarea id="be-terms" rows="3">${escHtml(s.terms ?? '')}</textarea></div>
      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        <button onclick="beSaveSettings()" style="${beBtnS('#2d6a6a','#fff')}">Save</button>
      </div>
    </div>

    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border)">
        <h3 style="font-size:14px;font-weight:700;color:var(--dark);margin:0">Room Types</h3>
        <p style="font-size:12px;color:var(--muted);margin:4px 0 0">Turn on the rooms you want to offer, and set their photos/description/price. Anything left off here won't show to guests on either public page.</p>
      </div>
      <div>`;

  [...AppData.roomTypes].sort((a,b) => beRtSortKey(a) - beRtSortKey(b)).forEach(rt => {
    const enabled = !!rt.be_enabled;
    const extra   = !!rt.be_extra_nights;
    const photos  = rt.be_photos ?? [];
    html += `
      <div style="padding:14px 20px;border-bottom:1px solid #f8fafc;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="width:10px;height:10px;border-radius:50%;background:${rt.color || '#4db6ac'};flex-shrink:0"></div>
        <div style="flex:1;min-width:220px">
          <div style="font-size:13px;font-weight:600;color:var(--dark)">${escHtml(rt.name)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:1px">
            ${(rt.rooms ?? []).length} rooms · max ${rt.maxOcc ?? 2} guests
            ${photos.length ? ` · ${photos.length} photo${photos.length > 1 ? 's' : ''}` : ' · no photos'}
            ${rt.be_description ? ' · has description' : ''}
            ${rt.be_price_single != null ? ` · <span style="color:#0d9488;font-weight:600">Escape $${rt.be_price_single}/$${rt.be_price_double ?? rt.be_price_single}</span>` : ' · <span style="color:#f59e0b">no Escape rate</span>'}
          </div>
        </div>
        <button onclick="beOpenRoomEdit('${rt.id}')" style="${beBtnS('#f1f5f9','#374151')}">Edit</button>
        ${beToggle(enabled, `beToggleRoomType('${rt.id}',${!enabled})`, 'Book', '#4db6ac')}
        ${beToggle(extra,   `beToggleExtraNights('${rt.id}',${!extra})`, 'Extra', '#8b5cf6')}
      </div>`;
  });

  html += `</div></div></div>`;
  document.getElementById('beBody').innerHTML = html;
}

function beToggle(on, onClickFn, label, color) {
  return `<label style="display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;flex-shrink:0">
    <span style="font-size:9px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">${label}</span>
    <div onclick="${onClickFn}" style="width:38px;height:22px;border-radius:11px;background:${on ? color : '#d1d5db'};position:relative;cursor:pointer;transition:background .2s">
      <div style="width:18px;height:18px;border-radius:50%;background:#fff;position:absolute;top:2px;left:${on ? '18' : '2'}px;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.2)"></div>
    </div>
  </label>`;
}

async function beToggleRoomType(rtId, enabled) {
  const rt = AppData.roomTypes.find(r => r.id === rtId); if (!rt) return;
  rt.be_enabled = enabled;
  saveAll();
  showToast(enabled ? 'Room turned on for booking ✓' : 'Room turned off');
  beRenderSettings();
}
async function beToggleExtraNights(rtId, enabled) {
  const rt = AppData.roomTypes.find(r => r.id === rtId); if (!rt) return;
  rt.be_extra_nights = enabled;
  saveAll();
  showToast(enabled ? 'Visible on Extra Nights ✓' : 'Removed from Extra Nights');
  beRenderSettings();
}

async function beSaveSettings() {
  const tagline   = document.getElementById('be-tagline')?.value.trim() || null;
  const heroImage = document.getElementById('be-hero')?.value.trim()    || null;
  const taxesPct  = parseFloat(document.getElementById('be-taxes')?.value) || 0;
  const terms     = document.getElementById('be-terms')?.value.trim()   || null;
  const ok = await beDbSet('bookingEngineSettings', { ...beSettings, tagline, taxes_pct: taxesPct, hero_image: heroImage, terms });
  if (!ok) return;
  beSettings = { ...beSettings, tagline, hero_image: heroImage, taxes_pct: taxesPct, terms };
  showToast('Settings saved ✓');
}

// ─── ROOM EDIT MODAL ─────────────────────────────────────────
function beRoomEditModalHtml() {
  return `
  <div class="modal-overlay" id="beRoomModal">
    <div class="modal wide">
      <div class="modal-hdr">
        <h2 id="beRoomModalTitle">Edit Room Type</h2>
        <button class="modal-x" onclick="closeModal('beRoomModal')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="fg" style="margin-bottom:12px"><label>Public description</label><textarea id="be-rt-desc" rows="3" placeholder="Describe this room type for guests..."></textarea></div>
        <div class="fg" style="margin-bottom:12px"><label>Amenities (comma-separated)</label><input type="text" id="be-rt-amenities" placeholder="e.g. AC, WiFi, Ocean View, Balcony"></div>
        <div class="price-box">
          <div class="pb-lbl">🏷️ Escape Rate (Booking Engine override)</div>
          <div class="frow">
            <div class="fg"><label>Single (1 guest/night)</label><input type="number" id="be-rt-price-single" placeholder="— uses regular rate" step="any" min="0"></div>
            <div class="fg"><label>Double (per person/night)</label><input type="number" id="be-rt-price-double" placeholder="— same as single" step="any" min="0"></div>
          </div>
          <div style="font-size:11px;color:var(--muted)">Leave blank to use this room's regular season rate.</div>
        </div>
        <div class="fg" style="margin-bottom:6px"><label>Photos</label></div>
        <div id="be-rt-photos-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px"></div>
        <div style="display:flex;gap:8px">
          <input type="text" id="be-rt-photo-input" placeholder="Paste a photo URL..." style="flex:1;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:'Jost',sans-serif;font-size:13.5px" onkeydown="if(event.key==='Enter'){event.preventDefault();beAddPhoto()}">
          <button onclick="beAddPhoto()" style="${beBtnS('#f1f5f9','#374151')}">+ Add</button>
        </div>
      </div>
      <div class="modal-foot">
        <div class="l"></div>
        <div class="r">
          <button onclick="closeModal('beRoomModal')" style="${beBtnS('#f3f4f6','#374151')}">Cancel</button>
          <button onclick="beSaveRoomEdit()" style="${beBtnS('#2d6a6a','#fff')}">Save</button>
        </div>
      </div>
    </div>
  </div>`;
}

function beOpenRoomEdit(rtId) {
  const rt = AppData.roomTypes.find(r => r.id === rtId); if (!rt) return;
  beEditRtId = rtId;
  beEditPhotos = [...(rt.be_photos ?? [])];
  document.getElementById('beRoomModalTitle').textContent = rt.name;
  document.getElementById('be-rt-desc').value = rt.be_description ?? '';
  document.getElementById('be-rt-amenities').value = (rt.be_amenities ?? []).join(', ');
  document.getElementById('be-rt-price-single').value = rt.be_price_single ?? '';
  document.getElementById('be-rt-price-double').value = rt.be_price_double ?? '';
  beRenderPhotosList();
  openModal('beRoomModal');
}

function beRenderPhotosList() {
  const el = document.getElementById('be-rt-photos-list'); if (!el) return;
  if (!beEditPhotos.length) { el.innerHTML = `<div style="font-size:11.5px;color:var(--muted);padding:4px 0">No photos yet</div>`; return; }
  el.innerHTML = beEditPhotos.map((url, i) => `
    <div style="display:flex;align-items:center;gap:8px;background:var(--sand);border-radius:8px;padding:6px 10px">
      <img src="${escHtml(url)}" alt="" style="width:48px;height:36px;object-fit:cover;border-radius:5px;border:1px solid var(--border)" onerror="this.style.display='none'">
      <span style="flex:1;font-size:11.5px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(url)}</span>
      <button onclick="beRemovePhoto(${i})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px">✕</button>
    </div>`).join('');
}
function beAddPhoto() {
  const input = document.getElementById('be-rt-photo-input');
  const url = input?.value.trim(); if (!url) return;
  beEditPhotos.push(url); input.value = ''; beRenderPhotosList();
}
function beRemovePhoto(i) { beEditPhotos.splice(1 * i, 1); beRenderPhotosList(); }

function beSaveRoomEdit() {
  if (!beEditRtId) return;
  const rt = AppData.roomTypes.find(r => r.id === beEditRtId); if (!rt) return;
  const desc = document.getElementById('be-rt-desc')?.value.trim() || null;
  const amenities = (document.getElementById('be-rt-amenities')?.value.trim() ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const rawSingle = parseFloat(document.getElementById('be-rt-price-single')?.value);
  const rawDouble = parseFloat(document.getElementById('be-rt-price-double')?.value);
  rt.be_description  = desc;
  rt.be_amenities    = amenities;
  rt.be_photos       = beEditPhotos;
  rt.be_price_single = isNaN(rawSingle) ? null : rawSingle;
  rt.be_price_double = isNaN(rawDouble) ? null : rawDouble;
  saveAll();
  showToast('Room updated ✓');
  closeModal('beRoomModal');
  beEditRtId = null;
  beRenderSettings();
}

// ─── RATES TAB ───────────────────────────────────────────────
function beRenderRates() {
  const s = beSettings;
  const rows = [...AppData.roomTypes].filter(rt => !['bd','cg'].some(p => rt.id.startsWith(p))).sort((a,b) => beRtSortKey(a)-beRtSortKey(b));
  let html = `<div style="max-width:820px;margin:0 auto">
    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:20px">
      <h3 style="font-size:14px;font-weight:700;color:var(--dark);margin:0 0 4px">Base Rates</h3>
      <p style="font-size:12px;color:var(--muted);margin:0 0 16px">Escape rate per room type. "Pricing Rules" below adjusts on top of these.</p>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="border-bottom:2px solid #f3f4f6">
            <th style="text-align:left;padding:6px 8px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase">Room</th>
            <th style="text-align:center;padding:6px 8px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase">Single</th>
            <th style="text-align:center;padding:6px 8px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase">Double (pp)</th>
            <th style="text-align:center;padding:6px 8px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase">Max occ.</th>
          </tr></thead>
          <tbody>
            ${rows.map(rt => `
            <tr style="border-bottom:1px solid #f9fafb">
              <td style="padding:8px;color:var(--dark);font-weight:600">${escHtml(rt.name)}</td>
              <td style="padding:8px;text-align:center"><input type="number" id="br-single-${rt.id}" value="${rt.be_price_single ?? ''}" placeholder="—" min="0" step="any" style="width:90px;padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;font-family:'Jost',sans-serif;text-align:center"></td>
              <td style="padding:8px;text-align:center"><input type="number" id="br-double-${rt.id}" value="${rt.be_price_double ?? ''}" placeholder="= single" min="0" step="any" style="width:90px;padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;font-family:'Jost',sans-serif;text-align:center"></td>
              <td style="padding:8px;text-align:center"><input type="number" id="br-maxocc-${rt.id}" value="${rt.maxOcc ?? ''}" placeholder="—" min="1" max="20" step="1" style="width:65px;padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;font-family:'Jost',sans-serif;text-align:center"></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        <button onclick="beSaveBaseRates()" style="${beBtnS('#2d6a6a','#fff')}">Save base rates</button>
      </div>
    </div>

    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:20px 24px">
      <h3 style="font-size:14px;font-weight:700;color:var(--dark);margin:0 0 4px">Pricing Rules</h3>
      <p style="font-size:12px;color:var(--muted);margin:0 0 16px">Adjust the base rate by season and weekend.</p>
      <div class="fg" style="max-width:280px;margin-bottom:16px">
        <label>Weekend premium (Fri/Sat/Sun) %</label>
        <input type="number" id="be-weekend-pct" value="${s.weekend_premium ?? 0}" min="0" max="200" step="1">
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px">Monthly adjustment vs. base rate (%)</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:16px">
        ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i) => `
          <label style="display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;font-weight:700;color:var(--text)">
            ${m}
            <input type="number" id="be-month-${i+1}" value="${Number((s.seasonal_adjustments ?? {})[String(i+1)] ?? 0)}" min="-100" max="300" step="1" style="width:56px;padding:5px 4px;border:1.5px solid var(--border);border-radius:7px;font-size:12px;font-family:'Jost',sans-serif;text-align:center">
          </label>`).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end">
        <button onclick="beSavePricingRules()" style="${beBtnS('#2d6a6a','#fff')}">Save rules</button>
      </div>
    </div>
  </div>`;
  document.getElementById('beBody').innerHTML = html;
}

async function beSaveBaseRates() {
  let changed = 0;
  for (const rt of AppData.roomTypes) {
    const sEl = document.getElementById(`br-single-${rt.id}`); if (!sEl) continue;
    const sVal = sEl.value.trim();
    const dVal = document.getElementById(`br-double-${rt.id}`)?.value.trim() ?? '';
    const mVal = document.getElementById(`br-maxocc-${rt.id}`)?.value.trim() ?? '';
    const priceSingle = sVal !== '' ? parseFloat(sVal) : null;
    const priceDouble = dVal !== '' ? parseFloat(dVal) : null;
    const maxOcc = mVal !== '' ? parseInt(mVal) : (rt.maxOcc ?? null);
    if (priceSingle === (rt.be_price_single ?? null) && priceDouble === (rt.be_price_double ?? null) && maxOcc === (rt.maxOcc ?? null)) continue;
    rt.be_price_single = priceSingle;
    rt.be_price_double = priceDouble;
    rt.maxOcc = maxOcc;
    changed++;
  }
  if (!changed) { showToast('No changes'); return; }
  saveAll();
  showToast(`Base rates saved (${changed} room${changed > 1 ? 's' : ''}) ✓`);
  beRenderRates();
}

async function beSavePricingRules() {
  const weekendPct = parseInt(document.getElementById('be-weekend-pct')?.value) || 0;
  const seasonal = {};
  for (let m = 1; m <= 12; m++) {
    const v = parseInt(document.getElementById(`be-month-${m}`)?.value);
    if (!isNaN(v) && v !== 0) seasonal[String(m)] = v;
  }
  const ok = await beDbSet('bookingEngineSettings', { ...beSettings, weekend_premium: weekendPct, seasonal_adjustments: seasonal });
  if (!ok) return;
  beSettings = { ...beSettings, weekend_premium: weekendPct, seasonal_adjustments: seasonal };
  showToast('Pricing rules saved ✓');
  beRenderRates();
}

// ─── REQUESTS TAB ────────────────────────────────────────────
function beFmtUSD(n) { return '$' + Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// Finds a real registration whose guest name/email matches this request and whose
// booking sits immediately before/after the request's dates — i.e. "this Extra Night
// belongs right next to an existing retreat guest's room." Mirrors the reference tool's
// matcher, adapted to AppData.regs/AppData.bookings.
function beFindRoomMatch(r) {
  if (!r.checkIn || !r.checkOut) return null;
  const nameNorm = `${r.firstName ?? ''} ${r.lastName ?? ''}`.toLowerCase().trim();
  const emailNorm = (r.email ?? '').toLowerCase().trim();
  for (const reg of AppData.regs) {
    if (!reg.room) continue;
    if (r.roomTypeId && reg.roomTypeId && reg.roomTypeId !== r.roomTypeId) continue;
    const hasMatch = (reg.guests ?? []).some(g => {
      if (!g.name) return false;
      const gName = g.name.toLowerCase().trim();
      const gEmail = (g.email ?? '').toLowerCase().trim();
      return (emailNorm && gEmail && gEmail === emailNorm) || (nameNorm && gName && gName === nameNorm);
    });
    if (!hasMatch) continue;
    const bk = AppData.bookings.find(b => b.id === reg.bookingId);
    if (!bk?.startDate || !bk?.endDate) continue;
    const adjBefore = r.checkOut === bk.startDate;
    const adjAfter  = r.checkIn  === bk.endDate;
    if (!adjBefore && !adjAfter) continue;
    return { bk, room: reg.room, adjBefore };
  }
  return null;
}

function beRenderRequests() {
  const paid = beRequests.filter(r => r.status === 'paid');
  const totalRevenue = paid.reduce((s, r) => s + (r.amountPaid ?? 0), 0);
  const withDiscount = paid.filter(r => r.discountCode).length;

  let html = `<div style="max-width:1000px;margin:0 auto">`;

  if (!paid.length) {
    html += `<div style="text-align:center;padding:60px;color:var(--muted);background:#fff;border:1px solid var(--border);border-radius:12px">
      <div style="font-size:32px;margin-bottom:12px">💳</div>
      <div style="font-size:15px;font-weight:600;color:var(--text)">No payments yet</div>
      <div style="font-size:13px;margin-top:6px">Booking Engine payments will show up here automatically.</div>
    </div>`;
  } else {
    html += `<div style="display:flex;gap:12px;margin-bottom:20px">
      ${beStatCard('Payments received', paid.length, '#f0fdf4', '#065f46')}
      ${beStatCard('Total collected', beFmtUSD(totalRevenue), '#eff6ff', '#1e40af')}
      ${beStatCard('With discount', withDiscount, '#fef3c7', '#92400e')}
    </div>`;

    html += `<div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--sand);border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:10px 14px;font-size:11px;font-weight:700;color:var(--muted)">GUEST</th>
          <th style="text-align:left;padding:10px 14px;font-size:11px;font-weight:700;color:var(--muted)">ROOM TYPE</th>
          <th style="text-align:left;padding:10px 14px;font-size:11px;font-weight:700;color:var(--muted)">DATES</th>
          <th style="text-align:right;padding:10px 14px;font-size:11px;font-weight:700;color:var(--muted)">PAID</th>
          <th style="text-align:left;padding:10px 14px;font-size:11px;font-weight:700;color:var(--muted)">ROOM</th>
        </tr></thead>
        <tbody>${paid.slice().reverse().map(beRequestRow).join('')}</tbody>
      </table>
    </div>`;
  }

  html += `</div>`;
  document.getElementById('beBody').innerHTML = html;
}

function beRequestRow(r) {
  const nights = r.checkIn && r.checkOut ? Math.round((new Date(r.checkOut) - new Date(r.checkIn)) / 86400000) : '—';
  const received = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const match = beFindRoomMatch(r);
  const alreadyAssigned = match && r.room && r.room === match.room;
  const matchRow = match ? `
    <tr style="background:${alreadyAssigned ? '#f0fdf4' : '#fffbeb'};border-bottom:2px solid ${alreadyAssigned ? '#bbf7d0' : '#fde68a'}">
      <td colspan="5" style="padding:5px 14px 9px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span>${alreadyAssigned ? '✅' : '🔗'}</span>
          <span style="font-weight:700;font-size:11.5px;color:${alreadyAssigned ? '#15803d' : '#92400e'}">${alreadyAssigned ? 'Room assigned' : 'Match found'}</span>
          <span style="font-size:11.5px;color:var(--text)">→ room <strong>${escHtml(match.room)}</strong></span>
          <span style="font-size:11px;color:var(--muted)">${match.adjBefore ? 'night before' : 'night after'} ${escHtml(match.bk.leaderName || match.bk.retreatName || '')}'s retreat · ${fmtDate(match.bk.startDate)} – ${fmtDate(match.bk.endDate)}</span>
          ${alreadyAssigned ? '' : `<button onclick="beAssignRoom('${escHtml(r.id)}','${escHtml(match.room)}')" style="background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:2px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">Assign room</button>`}
        </div>
      </td>
    </tr>` : '';
  return `
    <tr style="border-bottom:${match ? '0' : '1px solid #f3f4f6'}">
      <td style="padding:10px 14px">
        <div style="font-size:13px;font-weight:600;color:var(--dark)">${escHtml(r.firstName)} ${escHtml(r.lastName)}</div>
        <div style="font-size:11px;color:var(--muted)">${escHtml(r.email)}${r.phone ? ' · ' + escHtml(r.phone) : ''}</div>
      </td>
      <td style="padding:10px 14px;font-size:12px;color:var(--text)">
        ${escHtml(r.roomTypeName ?? '—')}
        <div style="font-size:11px;color:var(--muted);margin-top:1px">${r.adults ?? 1} pax · ${nights} nights · ${escHtml(r.source ?? '—')}</div>
      </td>
      <td style="padding:10px 14px;font-size:12px;color:var(--text);white-space:nowrap">${fmtDate(r.checkIn)}<br><span style="color:var(--muted)">→ ${fmtDate(r.checkOut)}</span></td>
      <td style="padding:10px 14px;text-align:right">
        <div style="font-size:14px;font-weight:700;color:var(--dark)">${beFmtUSD(r.amountPaid)}</div>
        ${r.discountCode ? `<div style="font-size:10.5px;color:#16a34a;font-weight:600;margin-top:2px">${escHtml(r.discountCode)} -${beFmtUSD(r.discountAmount)}</div>` : ''}
        <div style="font-size:10px;color:var(--muted);margin-top:2px">${received}</div>
      </td>
      <td style="padding:10px 14px">
        ${r.room
          ? `<span style="font-size:11px;font-weight:700;color:#065f46">${escHtml(r.room)}</span>`
          : `<div style="display:flex;gap:4px;align-items:center">
               <input type="text" id="be-room-manual-${escHtml(r.id)}" placeholder="e.g. 22" style="width:70px;padding:5px 7px;border:1.5px solid var(--border);border-radius:6px;font-size:12px;font-family:'Jost',sans-serif">
               <button onclick="beAssignRoomManual('${escHtml(r.id)}')" style="${beBtnS('#f1f5f9','#374151')};padding:4px 9px;font-size:11px">Set</button>
             </div>`}
      </td>
    </tr>${matchRow}`;
}

async function beAssignRoom(id, room) {
  const r = beRequests.find(x => x.id === id); if (!r) return;
  r.room = room;
  const ok = await beDbSet('beBookingRequests', beRequests);
  if (!ok) return;
  showToast(`Room ${room} assigned ✓`);
  beRenderRequests();
}
async function beAssignRoomManual(id) {
  const input = document.getElementById(`be-room-manual-${id}`);
  const room = input?.value.trim();
  if (!room) { showToast('Enter a room number first'); return; }
  await beAssignRoom(id, room);
}

// ─── DISCOUNTS TAB ───────────────────────────────────────────
function beRenderDiscounts() {
  let html = `<div style="max-width:820px;margin:0 auto">
    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:20px">
      <h3 style="font-size:14px;font-weight:700;color:var(--dark);margin:0 0 4px">New Discount Code</h3>
      <p style="font-size:12px;color:var(--muted);margin:0 0 16px">Create a code guests can apply on the Booking Engine.</p>
      <div class="frow">
        <div class="fg"><label>Code (uppercase, no spaces)</label><input type="text" id="dc-code" placeholder="AMANSALA20" maxlength="30" style="text-transform:uppercase"></div>
        <div class="fg"><label>Type</label><select id="dc-type"><option value="pct">Percentage (%)</option><option value="fixed">Fixed amount (USD)</option></select></div>
        <div class="fg"><label>Value</label><input type="number" id="dc-value" placeholder="10" min="0" step="any"></div>
        <div class="fg"><label>Applies to</label><select id="dc-appliesto"><option value="all">Both pages</option><option value="escape">Book a Stay only</option><option value="extra_nights">Extra Nights only</option></select></div>
        <div class="fg"><label>Max uses (blank = unlimited)</label><input type="number" id="dc-maxuses" placeholder="—" min="1" step="1"></div>
        <div class="fg"><label>Expires on (blank = never)</label><input type="date" id="dc-expires"></div>
        <div class="fg" style="grid-column:span 2"><label>Description (shown to guest)</label><input type="text" id="dc-desc" placeholder="10% off your stay"></div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        <button onclick="beSaveDiscount()" style="${beBtnS('#2d6a6a','#fff')}">Create code</button>
      </div>
    </div>`;

  if (beDiscounts.length) {
    html += `<div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <div style="padding:14px 20px;border-bottom:1px solid var(--border)"><h3 style="font-size:14px;font-weight:700;color:var(--dark);margin:0">Codes</h3></div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--sand);border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:9px 14px;font-size:11px;font-weight:700;color:var(--muted)">CODE</th>
          <th style="text-align:left;padding:9px 14px;font-size:11px;font-weight:700;color:var(--muted)">DISCOUNT</th>
          <th style="text-align:left;padding:9px 14px;font-size:11px;font-weight:700;color:var(--muted)">USES</th>
          <th style="text-align:left;padding:9px 14px;font-size:11px;font-weight:700;color:var(--muted)">EXPIRES</th>
          <th style="text-align:left;padding:9px 14px;font-size:11px;font-weight:700;color:var(--muted)">STATUS</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${beDiscounts.map(dc => `
          <tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:10px 14px">
              <span style="font-size:13px;font-weight:700;color:var(--dark);font-family:monospace;letter-spacing:.5px">${escHtml(dc.code)}</span>
              ${dc.description ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${escHtml(dc.description)}</div>` : ''}
              ${dc.appliesTo === 'extra_nights' ? `<div style="margin-top:3px"><span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;background:#ede9fe;color:#6d28d9">Extra Nights only</span></div>` : dc.appliesTo === 'escape' ? `<div style="margin-top:3px"><span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;background:#ccfbf1;color:#0f766e">Book a Stay only</span></div>` : ''}
            </td>
            <td style="padding:10px 14px;font-size:13px;color:var(--text)">${dc.type === 'pct' ? `${dc.value}%` : `$${dc.value} USD`}</td>
            <td style="padding:10px 14px;font-size:12px;color:var(--muted)">${dc.usedCount ?? 0}${dc.maxUses != null ? ` / ${dc.maxUses}` : ' / ∞'}</td>
            <td style="padding:10px 14px;font-size:12px;color:var(--muted)">${dc.expiresAt ? fmtDate(dc.expiresAt) : '—'}</td>
            <td style="padding:10px 14px">${dc.active ? `<span style="font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:5px;background:#d1fae5;color:#065f46">Active</span>` : `<span style="font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:5px;background:#f3f4f6;color:var(--muted)">Inactive</span>`}</td>
            <td style="padding:10px 10px;text-align:right;white-space:nowrap">
              <button onclick="beToggleDiscount('${dc.id}',${!dc.active})" style="${beBtnS(dc.active ? '#fef3c7' : '#d1fae5', dc.active ? '#92400e' : '#065f46')};font-size:11px;padding:3px 9px;margin-right:4px">${dc.active ? 'Deactivate' : 'Activate'}</button>
              <button onclick="beDeleteDiscount('${dc.id}')" style="${beBtnS('#fee2e2','#dc2626')};font-size:11px;padding:3px 9px">Delete</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  } else {
    html += `<div style="text-align:center;padding:40px;color:var(--muted);background:#fff;border:1px solid var(--border);border-radius:12px">
      <div style="font-size:28px;margin-bottom:10px">🏷️</div>
      <div style="font-size:14px;font-weight:600;color:var(--text)">No codes yet</div>
      <div style="font-size:12px;margin-top:4px">Create your first discount code above.</div>
    </div>`;
  }
  html += `</div>`;
  document.getElementById('beBody').innerHTML = html;
}

async function beSaveDiscount() {
  const code = (document.getElementById('dc-code')?.value ?? '').trim().toUpperCase();
  const type = document.getElementById('dc-type')?.value ?? 'pct';
  const value = parseFloat(document.getElementById('dc-value')?.value);
  const appliesTo = document.getElementById('dc-appliesto')?.value ?? 'all';
  const maxUses = document.getElementById('dc-maxuses')?.value.trim();
  const expires = document.getElementById('dc-expires')?.value.trim();
  const desc = document.getElementById('dc-desc')?.value.trim();

  if (!code) { showToast('Code cannot be empty'); return; }
  if (!/^[A-Z0-9_-]+$/.test(code)) { showToast('Letters, numbers, hyphen, underscore only'); return; }
  if (isNaN(value) || value <= 0) { showToast('Value must be greater than 0'); return; }
  if (type === 'pct' && value > 100) { showToast('Percentage cannot exceed 100'); return; }
  if (beDiscounts.some(d => d.code === code)) { showToast('That code already exists'); return; }

  const dc = {
    id: 'dc_' + Math.random().toString(36).slice(2, 10),
    code, type, value, appliesTo,
    maxUses: maxUses ? parseInt(maxUses) : null,
    expiresAt: expires || null,
    description: desc || null,
    active: true,
    usedCount: 0,
  };
  beDiscounts.unshift(dc);
  const ok = await beDbSet('beDiscountCodes', beDiscounts);
  if (!ok) { beDiscounts.shift(); return; }
  showToast('Code created ✓');
  beRenderDiscounts();
}

async function beToggleDiscount(id, active) {
  const dc = beDiscounts.find(d => d.id === id); if (!dc) return;
  const prev = dc.active; dc.active = active;
  const ok = await beDbSet('beDiscountCodes', beDiscounts);
  if (!ok) { dc.active = prev; return; }
  beRenderDiscounts();
}
async function beDeleteDiscount(id) {
  if (!confirm('Delete this discount code?')) return;
  const prev = beDiscounts;
  beDiscounts = beDiscounts.filter(d => d.id !== id);
  const ok = await beDbSet('beDiscountCodes', beDiscounts);
  if (!ok) { beDiscounts = prev; return; }
  showToast('Code deleted');
  beRenderDiscounts();
}

// ─── EMAILS TAB ──────────────────────────────────────────────
const BE_DEFAULT_GUEST_SUBJECT = 'Your Amansala reservation – {{roomType}}';
const BE_DEFAULT_GUEST_BODY = `<p>Hi {{firstName}},</p>\n<p>Your reservation at <strong>Amansala Tulum</strong> is confirmed!</p>\n<p><strong>Room type:</strong> {{roomType}}<br><strong>Check-in:</strong> {{checkIn}}<br><strong>Check-out:</strong> {{checkOut}}<br><strong>Nights:</strong> {{nights}}<br><strong>Amount paid:</strong> {{amount}}</p>\n<p>Questions? <a href="mailto:amansala.reservations@gmail.com">amansala.reservations@gmail.com</a></p>`;
const BE_DEFAULT_STAFF_SUBJECT = 'New booking: {{firstName}} {{lastName}} – {{roomType}}';
const BE_DEFAULT_STAFF_BODY = `<p><strong>New booking received!</strong></p>\n<p><strong>Guest:</strong> {{firstName}} {{lastName}}<br><strong>Email:</strong> {{email}}<br><strong>Phone:</strong> {{phone}}<br><strong>Room type:</strong> {{roomType}}<br><strong>Check-in:</strong> {{checkIn}}<br><strong>Check-out:</strong> {{checkOut}}<br><strong>Nights:</strong> {{nights}}<br><strong>Amount paid:</strong> {{amount}}</p>`;

function beRenderEmails() {
  const s = beSettings;
  const gOn = s.email_guest_enabled !== false;
  const sOn = s.email_staff_enabled !== false;
  document.getElementById('beBody').innerHTML = `
    <div style="max-width:760px;margin:0 auto">
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:10px 16px;margin-bottom:20px;font-size:12px;color:#0369a1">
        <strong>Available variables:</strong> {{firstName}}, {{lastName}}, {{roomType}}, {{checkIn}}, {{checkOut}}, {{nights}}, {{amount}}, {{email}}, {{phone}}
      </div>
      <div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;margin-bottom:16px">
          <h3 style="font-size:14px;font-weight:700;color:var(--dark);margin:0">Confirmation Email to Guest</h3>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-left:auto"><input type="checkbox" id="be-eg-on" ${gOn ? 'checked' : ''}><span style="font-size:12px;font-weight:600;color:var(--text)">Enabled</span></label>
        </div>
        <div class="fg" style="margin-bottom:12px"><label>Subject</label><input id="be-eg-subject" type="text" value="${escHtml(s.email_guest_subject ?? BE_DEFAULT_GUEST_SUBJECT)}"></div>
        <div class="fg"><label>Body (HTML)</label><textarea id="be-eg-body" rows="9" style="font-family:monospace;font-size:12px">${escHtml(s.email_guest_body ?? BE_DEFAULT_GUEST_BODY)}</textarea></div>
      </div>
      <div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;margin-bottom:16px">
          <h3 style="font-size:14px;font-weight:700;color:var(--dark);margin:0">Staff Notification Email</h3>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-left:auto"><input type="checkbox" id="be-es-on" ${sOn ? 'checked' : ''}><span style="font-size:12px;font-weight:600;color:var(--text)">Enabled</span></label>
        </div>
        <div class="fg" style="margin-bottom:12px"><label>Notify email</label><input id="be-es-to" type="email" value="${escHtml(s.email_staff_to ?? 'amansala.reservations@gmail.com')}"></div>
        <div class="fg" style="margin-bottom:12px"><label>Subject</label><input id="be-es-subject" type="text" value="${escHtml(s.email_staff_subject ?? BE_DEFAULT_STAFF_SUBJECT)}"></div>
        <div class="fg"><label>Body (HTML)</label><textarea id="be-es-body" rows="9" style="font-family:monospace;font-size:12px">${escHtml(s.email_staff_body ?? BE_DEFAULT_STAFF_BODY)}</textarea></div>
      </div>
      <div style="display:flex;justify-content:flex-end">
        <button onclick="beSaveEmailSettings()" style="${beBtnS('#111827','#fff')}">Save email settings</button>
      </div>
    </div>`;
}

async function beSaveEmailSettings() {
  const fields = {
    email_guest_enabled: document.getElementById('be-eg-on')?.checked ?? true,
    email_guest_subject: document.getElementById('be-eg-subject')?.value.trim() ?? '',
    email_guest_body:    document.getElementById('be-eg-body')?.value ?? '',
    email_staff_enabled: document.getElementById('be-es-on')?.checked ?? true,
    email_staff_to:      document.getElementById('be-es-to')?.value.trim() ?? '',
    email_staff_subject: document.getElementById('be-es-subject')?.value.trim() ?? '',
    email_staff_body:    document.getElementById('be-es-body')?.value ?? '',
  };
  const ok = await beDbSet('bookingEngineSettings', { ...beSettings, ...fields });
  if (!ok) return;
  beSettings = { ...beSettings, ...fields };
  showToast('Email settings saved ✓');
}

// ─── SHARED HELPERS ────────────────────────────────────────────
function beStatCard(label, n, bg, color) {
  return `<div style="flex:1;background:${bg};border-radius:10px;padding:14px 16px;text-align:center">
    <div style="font-size:24px;font-weight:800;color:${color}">${n}</div>
    <div style="font-size:12px;font-weight:600;color:${color};margin-top:2px">${label}</div>
  </div>`;
}
function beBtnS(bg, c) { return `background:${bg};color:${c};border:none;padding:7px 14px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif`; }
