// Same-origin booking backend (functions, rates, room photos).
const API_BASE = '';

// ─── STATE ───────────────────────────────────────────────────
let _available      = [];
let _settings       = {};
let _selectedRt     = null;
let _guestCount     = 2;
let _stripe         = null;
let _stripeElems    = null;
let _piAmount       = 0;
let _discountCode   = null;
let _discountAmount = 0;

// Calendar state
let _calIn       = null;   // selected check-in YYYY-MM-DD
let _calOut      = null;   // selected check-out YYYY-MM-DD
let _calHover    = null;   // hovered day during range selection
let _calMode     = 'in';   // 'in' | 'out'
let _calBase     = null;   // Date: first displayed month
let _rateCache   = {};     // { 'YYYY-MM-DD': minPrice }
let _rateFetching = false;

// ─── GUEST COUNTER ────────────────────────────────────────────
function changeGuests(delta) {
  _guestCount = Math.max(1, Math.min(6, _guestCount + delta));
  document.getElementById('guest-label').textContent = _guestCount + ' guest' + (_guestCount !== 1 ? 's' : '');
}

// ─── STATIC ROOM RENDER (from DB, be_enabled only) ───────────
let _allRoomTypes = [];  // populated on init from get-availability?listAll=true

function renderStaticRooms() {
  const arrowSvg   = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
  const arrowSvgLg = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;

  const sorted = sortRoomTypes(_allRoomTypes);
  let html = resultsBar('Our rooms', 'Pick your dates to see prices and availability') + `<div class="stay-list">`;

  sorted.forEach((rt, idx) => {
    const num      = String(idx + 1).padStart(2, '0');
    const eyebrow  = getRoomTag(rt);
    const desc     = rt.be_description || getDefaultDesc(rt);
    const features = (rt.be_amenities && rt.be_amenities.length) ? rt.be_amenities : getFeatures(rt);
    const photos   = rt.be_photos ?? [];
    const imgSrc   = photos[0] ?? getRoomImage(rt);

    html += `<article class="stay-card">
      <div class="stay-image-wrap" onclick="promptDates()" role="button" tabindex="0" aria-label="Select ${esc(rt.name)}">
        ${imgSrc
          ? `<img src="${esc(imgSrc)}" alt="${esc(rt.name)} at Amansala" loading="${idx===0?'eager':'lazy'}">`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#d8d1c5;color:rgba(31,43,39,.3);font-size:42px">🌴</div>`}
        <span class="image-count">${num}</span>
      </div>
      <div class="stay-content">
        <div class="stay-title-row">
          <div>
            ${eyebrow ? `<p class="stay-eyebrow">${esc(eyebrow)}</p>` : ''}
            <h3>${esc(rt.name)}</h3>
          </div>
          <div class="stay-price"></div>
        </div>
        ${desc ? `<p class="stay-description">${esc(desc)}</p>` : ''}
        ${features.length ? `<ul>${features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        <button class="select-button" type="button" onclick="(_calIn&&_calOut)?searchRooms():promptDates()">Select this room ${arrowSvgLg}</button>
      </div>
    </article>`;
  });

  html += `</div>`;
  showOutput(html);
}

// ─── SORT HELPER (same order as the app) ─────────────────────
const _RT_ORD = ['rt1','rt2','rt3','rt4','rt5','rt6','bd1','rt7','bd2','rt8','bd3','rt9','bd4','cg1','cg2','cg3','cg4','cg5','cg6','csh1','csh2','c4b','c4c'];
const _RT_PFX = [['beachfront king',0],['superior',1],['garden plus',2],['garden',3],['simple n small',4],['beachview double',5],['bed in beachview',6],['double',7],['bed in double',8],['triple',9],['bed in triple',10],['quad',11],['bed in quad',12],['casa master',12.5],['casa grande',13],['casa king downstairs',13.1],['casa grande up',13.2],['casa shanti',18.5],['casita 4 / 1',21.1],['casita 4 / 2',21.2],['casita 4',20.5]];
function _rtKey(rt) { const i=_RT_ORD.indexOf(rt.id); if(i!==-1)return i; const n=rt.name.toLowerCase().trim(); for(const[p,k]of _RT_PFX){if(n.startsWith(p))return k;} return 9999; }
function sortRoomTypes(rts) { return [...rts].sort((a,b)=>_rtKey(a)-_rtKey(b)); }

function promptDates() {
  if (!_calIn || !_calOut || _calOut <= _calIn) {
    document.querySelector('.booking-shell').scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => openCalendar(_calIn ? 'out' : 'in'), 300);
  }
}

// ─── INIT ─────────────────────────────────────────────────────
(async function init() {
  // Init calendar base to current month
  const now = new Date();
  _calBase = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const res  = await fetch(API_BASE + '/.netlify/functions/get-availability', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listAll: true }),
    });
    const data = await res.json();
    _allRoomTypes = data.roomTypes ?? [];
    _settings     = data.settings  ?? {};
    applySettings();
  } catch(e) { /* show page with empty list */ }
  renderStaticRooms();
})();

function applySettings() {
  // Intro copy is intentionally fixed; the backend tagline setting is not applied here.
}

// ─── CALENDAR ────────────────────────────────────────────────
function openCalendar(mode) {
  _calMode = mode || 'in';
  // Re-opening for check-in resets checkout so user can pick fresh range
  if (mode === 'in') { _calOut = null; _calHover = null; }
  if (!_calBase) {
    const now = new Date();
    _calBase = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  document.getElementById('cal-popup').style.display = 'flex';
  renderCalendar();
  fetchCalRates();
}

function _doClose() {
  document.getElementById('cal-popup').style.display = 'none';
  _calHover = null;
  document.getElementById('booking-field-in')?.classList.remove('cal-active');
  document.getElementById('booking-field-out')?.classList.remove('cal-active');
}

// Safe close — won't close mid-selection (check-in set, no checkout yet)
function closeCalendar() {
  if (_calIn && !_calOut) {
    // Nudge the check-out field to remind user to pick it
    const f = document.getElementById('cal-field-out');
    if (f) { f.style.transition='none'; f.style.background='rgba(185,121,90,.12)'; setTimeout(()=>{ f.style.transition=''; f.style.background=''; },500); }
    return;
  }
  _doClose();
}

// Force close — used by X button, clears mid-selection state
function cancelCalendar() {
  _doClose();
}

function clearDates() {
  _calIn = null; _calOut = null; _calHover = null;
  updateDateDisplays();
  renderCalendar();
}

function navMonth(delta) {
  _calBase = new Date(_calBase.getFullYear(), _calBase.getMonth() + delta, 1);
  renderCalendar();
  fetchCalRates();
}

async function fetchCalRates() {
  if (_rateFetching) return;
  const y0 = _calBase.getFullYear(), m0 = _calBase.getMonth();
  const startStr = `${y0}-${String(m0+1).padStart(2,'0')}-01`;
  const endDate  = new Date(y0, m0 + 2, 0);
  const endStr   = endDate.toISOString().slice(0,10);
  const cacheKey = `${startStr}__${endStr}`;
  if (_rateCache[`__ok__${cacheKey}`]) return;
  _rateFetching = true;
  try {
    const res = await fetch(`${API_BASE}/.netlify/functions/get-rates?start=${startStr}&end=${endStr}`);
    if (res.ok) {
      const data = await res.json();
      if (!data.error) {
        Object.assign(_rateCache, data);
        _rateCache[`__ok__${cacheKey}`] = true;
        renderCalendar();
      }
    }
  } catch(e) {}
  _rateFetching = false;
}

function renderCalendar() {
  const todayStr = new Date().toISOString().slice(0,10);

  // Update the date values in the cal-top panel
  const ciValEl = document.getElementById('cal-ci-val');
  const coValEl = document.getElementById('cal-co-val');
  if (ciValEl) { ciValEl.textContent = _calIn  ? fmtDate(_calIn)  : 'Add date'; ciValEl.classList.toggle('empty', !_calIn); }
  if (coValEl) { coValEl.textContent = _calOut ? fmtDate(_calOut) : 'Add date'; coValEl.classList.toggle('empty', !_calOut); }

  // Highlight active step inside calendar top
  document.getElementById('cal-field-in')?.classList.toggle('cal-step-active',  _calMode === 'in');
  document.getElementById('cal-field-out')?.classList.toggle('cal-step-active', _calMode === 'out');

  const statusEl = document.getElementById('cal-status');
  if (statusEl) {
    statusEl.textContent = !_calIn ? 'Select your check-in date'
      : !_calOut ? 'Now select your check-out date'
      : `${nightsBetween(_calIn, _calOut)} night${nightsBetween(_calIn, _calOut)!==1?'s':''} selected`;
  }

  // Done button: disabled mid-selection, shows instruction
  const doneBtn = document.getElementById('cal-done-btn');
  if (doneBtn) {
    const midSel = !!(_calIn && !_calOut);
    doneBtn.disabled = midSel;
    doneBtn.textContent = midSel ? 'Pick check-out' : 'Done';
    doneBtn.style.opacity = midSel ? '.45' : '';
    doneBtn.style.cursor  = midSel ? 'default' : '';
  }

  // Highlight active booking bar field
  document.getElementById('booking-field-in')?.classList.toggle('cal-active',  _calMode === 'in');
  document.getElementById('booking-field-out')?.classList.toggle('cal-active', _calMode === 'out');

  // Disable prev if current month is today's month
  const prevBtn = document.getElementById('cal-prev');
  if (prevBtn) {
    const thisMonth = new Date().toISOString().slice(0,7);
    const baseMonth = `${_calBase.getFullYear()}-${String(_calBase.getMonth()+1).padStart(2,'0')}`;
    prevBtn.style.visibility = baseMonth <= thisMonth ? 'hidden' : '';
  }

  for (let mi = 0; mi < 2; mi++) {
    const container = document.getElementById(`cal-m${mi}`);
    if (!container) continue;

    const rawMonth = _calBase.getMonth() + mi;
    const year  = _calBase.getFullYear() + Math.floor(rawMonth / 12);
    const month = ((rawMonth % 12) + 12) % 12;

    const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstDow  = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = `<div class="cal-month-header">${monthName}</div>
      <div class="cal-weekdays">`;
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => { html += `<div class="cal-wd">${d}</div>`; });
    html += `</div><div class="cal-grid">`;

    for (let i = 0; i < firstDow; i++) html += `<div class="cal-day cal-empty" aria-hidden="true"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const isPast  = dateStr < todayStr;
      const isToday = dateStr === todayStr;
      const isIn    = dateStr === _calIn;
      const isOut   = dateStr === _calOut;
      const inRange = _calIn && _calOut && dateStr > _calIn && dateStr < _calOut;
      const price   = _rateCache[dateStr];

      let cls = 'cal-day';
      if (isPast) { cls += ' cal-dis'; }
      if (isToday) cls += ' cal-today';
      if (isIn && _calOut) cls += ' cal-sel-start';
      else if (isIn) cls += ' cal-sel-start cal-sel-end';
      if (isOut) cls += ' cal-sel-end';
      if (inRange) cls += ' cal-in-range';

      const priceStr = price ? `$${price}` : '';

      // data-date used by hover delegation — no onmouseenter/leave to avoid re-render on hover
      html += `<div class="${cls}" data-date="${dateStr}" role="button" tabindex="${isPast?-1:0}" aria-label="${fmtDate(dateStr)}${price?', from $'+price:''}" onclick="selectDay('${dateStr}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectDay('${dateStr}')}">
        <span class="cal-num">${day}</span>
        ${priceStr ? `<span class="cal-price">${priceStr}</span>` : ''}
      </div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
  }
}

function hoverDay(dateStr) {
  if (!_calIn || _calOut) return;
  _calHover = dateStr;
  _applyHoverClasses();
}

function _applyHoverClasses() {
  document.querySelectorAll('#cal-m0 [data-date], #cal-m1 [data-date]').forEach(el => {
    const d = el.dataset.date;
    const inHover = !!(_calHover && _calIn && !_calOut && _calHover > _calIn && d > _calIn && d < _calHover);
    el.classList.toggle('cal-hov-range', inHover);
  });
}

function selectDay(dateStr) {
  const todayStr = new Date().toISOString().slice(0,10);
  if (dateStr < todayStr) return;

  // _calMode==='in' always resets check-in; otherwise use date logic
  if (_calMode === 'in' || !_calIn || dateStr <= _calIn) {
    _calIn   = dateStr;
    _calOut  = null;
    _calHover = null;
    _calMode = 'out';
    updateDateDisplays();
    renderCalendar();
  } else {
    _calOut  = dateStr;
    _calHover = null;
    updateDateDisplays();
    renderCalendar();
    // Close and auto-search after brief visual confirmation
    setTimeout(() => { closeCalendar(); searchRooms(); }, 380);
  }
}

function updateDateDisplays() {
  setDateDisplay('ci-display', _calIn);
  setDateDisplay('co-display', _calOut);
  const n = _calIn && _calOut ? nightsBetween(_calIn, _calOut) : 0;
  const nEl = document.getElementById('nights-display');
  if (nEl) nEl.textContent = n ? `${n} night${n!==1?'s':''}` : '';
}

function setDateDisplay(id, dateStr) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('has-date', !!dateStr);
  if (!dateStr) { el.innerHTML = '<strong>Add date</strong><small>Tap to choose</small>'; return; }
  const d = new Date(dateStr + 'T12:00:00');
  const main = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  el.innerHTML = `<strong>${main}</strong><small>${d.getFullYear()}</small>`;
}

function nightsBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

function fmtRange(a, b) {
  if (!a || !b) return '';
  const n = nightsBetween(a, b);
  return `${fmtDate(a)} – ${fmtDate(b)} · ${n} night${n!==1?'s':''}`;
}

function resultsBar(title, sub) {
  return `<div class="results-bar"><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
}

// Backdrop click: safe close (won't fire mid-selection)
document.getElementById('cal-popup').addEventListener('click', e => {
  if (e.target === document.getElementById('cal-popup')) closeCalendar();
});
// Stop clicks inside the card from reaching the backdrop
document.querySelector('.cal-inner').addEventListener('click', e => e.stopPropagation());

// Hover delegation on stable parent — no re-render on hover, just class updates
(function() {
  const wrap = document.querySelector('.cal-months-wrap');
  if (!wrap) return;
  wrap.addEventListener('mouseover', e => {
    const day = e.target.closest('[data-date]');
    if (day && _calIn && !_calOut) {
      const d = day.dataset.date;
      if (d !== _calHover) { _calHover = d; _applyHoverClasses(); }
    }
  });
  wrap.addEventListener('mouseleave', () => {
    if (_calHover) { _calHover = null; _applyHoverClasses(); }
  });
})();

// ─── SEARCH ───────────────────────────────────────────────────
async function searchRooms() {
  const checkIn  = _calIn;
  const checkOut = _calOut;
  if (!checkIn || !checkOut || checkOut <= checkIn) { openCalendar('in'); return; }

  showOutput(resultsBar('Checking availability', fmtRange(checkIn, checkOut)) + `<div class="state-box"><div class="state-icon" style="font-size:40px;margin-bottom:12px">⏳</div><div class="state-title">Checking availability</div></div>`);

  try {
    const res = await fetch(API_BASE + '/.netlify/functions/get-availability', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkIn, checkOut }),
    });
    const { available, settings } = await res.json();
    _available = available ?? [];
    _settings  = settings ?? _settings;
    renderRooms();
  } catch (err) {
    showOutput(`<div class="state-box"><div class="state-icon">😔</div><div class="state-title">Something went wrong</div><div class="state-sub">${esc(err.message)}</div></div>`);
  }
}

// ─── RENDER ROOMS ─────────────────────────────────────────────
function renderRooms() {
  const checkIn  = _calIn;
  const checkOut = _calOut;
  const nights   = checkIn && checkOut ? Math.round((new Date(checkOut)-new Date(checkIn))/86400000) : 0;
  const gc       = _guestCount;

  if (!_available.length) {
    showOutput(resultsBar('No rooms available', fmtRange(checkIn, checkOut)) + `<div class="state-box"><div class="state-icon">😔</div><div class="state-title">No availability</div><div class="state-sub">No rooms open for those dates.<br>Try different dates or email <a href="mailto:amansala.reservations@gmail.com" style="color:var(--clay)">amansala.reservations@gmail.com</a></div></div>`);
    return;
  }

  const sorted = sortRoomTypes(_available);
  const taxes  = _settings.taxes_pct ?? 0;
  const dateStr = checkIn && checkOut ? `${fmtDate(checkIn)} – ${fmtDate(checkOut)} · ${nights} night${nights!==1?'s':''}` : '';

  let html = resultsBar(`${sorted.length} room${sorted.length!==1?'s':''} available`, dateStr) + `<div class="stay-list">`;

  sorted.forEach((rt, idx) => {
    const cardNum = String(idx + 1).padStart(2, '0');
    const eyebrow = getRoomTag(rt);
    const desc    = rt.be_description ?? getDefaultDesc(rt);
    const feats   = getFeatures(rt);
    const rate    = getRatePerPerson(rt, gc);
    const { price: adjRate, original: origRate, isOffer } = applyRules(rate, checkIn, isManualRate(rt));
    const img     = getRoomImage(rt);
    const photos  = rt.be_photos ?? [];
    const imgSrc  = photos[0] ?? img;

    html += `<article class="stay-card">
      <div class="stay-image-wrap" onclick="openBooking('${rt.id}')" role="button" tabindex="0" aria-label="Select ${esc(rt.name)}">
        ${imgSrc ? `<img src="${esc(imgSrc)}" alt="${esc(rt.name)} at Amansala" loading="${idx===0?'eager':'lazy'}" onerror="this.parentElement.style.background='#d8d1c5'">` : ''}
        <span class="image-count">${cardNum}</span>
      </div>
      <div class="stay-content">
        <div class="stay-title-row">
          <div>
            ${eyebrow ? `<p class="stay-eyebrow">${esc(eyebrow)}</p>` : ''}
            <h3>${esc(rt.name)}</h3>
          </div>
          <div class="stay-price"></div>
        </div>
        ${desc ? `<p class="stay-description">${esc(desc)}</p>` : ''}
        ${feats.length ? `<ul>${feats.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        ${rt.available_rooms ? `<span class="avail-badge">✓ ${rt.available_rooms} available</span>` : ''}
        ${adjRate ? `<div class="room-rate-row">
          <span class="room-rate-price">${isOffer && origRate ? `<span class="price-original">$${origRate}</span> ` : ''}$${adjRate}<span class="room-rate-unit"> / night</span></span>
          <span class="room-rate-total">${nights} night${nights!==1?'s':''} · $${adjRate * nights}${taxes>0?` +${taxes}% taxes`:''}</span>
        </div>` : ''}
        <button class="select-button" type="button" onclick="openBooking('${rt.id}')">
          Select this room
          <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
      </div>
    </article>`;
  });

  html += `</div>`;
  showOutput(html);
  document.getElementById('stays').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getRoomTag(rt) {
  const n = rt.name.toLowerCase();
  if (n.includes('beachfront')) return 'Best category';
  if (n.includes('beachview') || n.includes('bed in beachview')) return 'Great for sharing';
  if (n.includes('superior')) return 'Steps to the sea';
  if (n.includes('garden plus')) return 'Peaceful retreat';
  if (n.includes('garden king')) return 'Peaceful retreat';
  if (n.includes('garden double') || n.includes('bed in double')) return 'Great for sharing';
  if (n.includes('simple') || n.includes('small')) return 'Budget friendly';
  if (n.includes('triple') || n.includes('quad') || n.includes('family')) return 'Groups & families';
  if (n.includes('casa')) return 'Exclusive villa';
  return '';
}

function getDefaultDesc(rt) {
  const n = rt.name.toLowerCase();
  if (n.includes('beachfront')) return 'Our finest rooms face directly toward the sea, with a large private terrace and unobstructed ocean views.';
  if (n.includes('beachview') && !n.includes('bed in')) return 'A bright room with two beds and a private terrace, sea breezes, and the beach just a few steps away.';
  if (n.includes('superior')) return 'A lovely, extra-comfortable room close to the water, filled with natural light and coastal air.';
  if (n.includes('garden plus')) return 'A large, airy garden room with a king bed and plenty of space to settle into the rhythm of Tulum.';
  if (n.includes('garden king')) return 'A charming king room facing the lush garden at the back of the property, still just steps from the beach.';
  if (n.includes('garden double') || n.includes('bed in double')) return 'A comfortable, well-appointed room with two beds for friends or family sharing a relaxed beach stay.';
  if (n.includes('simple') || n.includes('small')) return 'Simple and cozy at the back of the property — the smart choice for an easy, budget-conscious beach stay.';
  if (n.includes('triple') || n.includes('quad')) return 'A large, open room with multiple beds for friends or family traveling together, close to the sea.';
  if (n.includes('casa')) return 'A private villa with exclusive amenities for groups seeking a premium Tulum experience.';
  return rt.be_description ?? '';
}

// Every room card ends with the breakfast line (Darlene 2026-11-12).
const BREAKFAST_LINE = 'Full breakfast served beachfront';
function getFeatures(rt) {
  const list = getBaseFeatures(rt);
  return list.length && !list.some(f => /breakfast/i.test(f)) ? [...list, BREAKFAST_LINE] : list;
}
function getBaseFeatures(rt) {
  if (rt.be_amenities && rt.be_amenities.length) return rt.be_amenities;
  const n = rt.name.toLowerCase();
  if (n.includes('beachfront')) return ['King bed','Large terrace','Direct sea view','Private bathroom','Closet'];
  if (n.includes('beachview') && !n.includes('bed in')) return ['2 queen beds','Private terrace','Beach view','Private bathroom','Closet'];
  if (n.includes('superior')) return ['King bed','Private bathroom','Closet','Safety deposit box'];
  if (n.includes('garden plus')) return ['King bed','Garden view','Private bathroom','Closet','Safety deposit box'];
  if (n.includes('garden king')) return ['King bed','Garden view','Private bathroom','Closet','Safety deposit box'];
  if (n.includes('garden double') || n.includes('bed in double')) return ['2 queen beds','Private bathroom','Closet','Safety deposit box'];
  if (n.includes('simple') || n.includes('small')) return ['Queen bed','Private bathroom','Closet','Safety deposit box'];
  if (n.includes('triple')) return ['3 beds','Private bathroom','Closet'];
  if (n.includes('quad')) return ['4 beds','Private bathroom','Closet'];
  return [];
}

function getRoomImage(rt) {
  const n = rt.name.toLowerCase();
  if (n.includes('beachfront')) return API_BASE + '/images/rooms/beachfront-deluxe.jpg';
  if (n.includes('beachview') || n.includes('bed in beachview')) return API_BASE + '/images/rooms/beachview-double.jpg';
  if (n.includes('superior')) return API_BASE + '/images/rooms/superior.jpg';
  if (n.includes('garden plus')) return API_BASE + '/images/rooms/garden-plus.jpg';
  if (n.includes('garden king')) return API_BASE + '/images/rooms/garden-king.jpg';
  if (n.includes('garden double') || n.includes('bed in double')) return API_BASE + '/images/rooms/garden-double.jpg';
  if (n.includes('shanti')) return API_BASE + '/images/rooms/casa-shanti.jpg';
  if (n.includes('casa grande') || n.includes('casa king')) return API_BASE + '/images/rooms/casa-grande.jpg';
  if (n.includes('garden')) return API_BASE + '/images/rooms/garden-king.jpg';
  if (n.includes('double')) return API_BASE + '/images/rooms/garden-double.jpg';
  if (n.includes('casa master')) return API_BASE + '/images/rooms/casa-master.jpg';
  if (n.includes('simple') || n.includes('small')) return API_BASE + '/images/rooms/super-simple.jpg';
  if (n.includes('triple') || n.includes('quad') || n.includes('family')) return API_BASE + '/images/rooms/family-room.jpg';
  if (n.includes('casita')) return API_BASE + '/images/rooms/casita-4.jpg';
  return '';
}

// ─── BOOKING MODAL ────────────────────────────────────────────
function openBooking(rtId) {
  const checkIn  = _calIn;
  const checkOut = _calOut;
  if (!checkIn || !checkOut || checkOut <= checkIn) { promptDates(); return; }
  _selectedRt     = _available.find(r => r.id === rtId);
  _stripe         = null;
  _stripeElems    = null;
  _piAmount       = 0;
  _discountCode   = null;
  _discountAmount = 0;
  if (!_selectedRt) return;

  const gc       = _guestCount;
  const nights   = Math.round((new Date(checkOut)-new Date(checkIn))/86400000);
  const rate     = getRatePerPerson(_selectedRt, gc);
  const { price: adjRate } = applyRules(rate, checkIn, isManualRate(_selectedRt));
  const taxes    = _settings.taxes_pct ?? 0;
  const subtotal = adjRate * nights;
  const taxAmt   = Math.round(subtotal * taxes) / 100;
  const total    = subtotal + taxAmt;

  document.getElementById('modal-title').textContent    = _selectedRt.name;
  document.getElementById('modal-subtitle').textContent = `${fmtDate(checkIn)} – ${fmtDate(checkOut)} · ${nights} night${nights!==1?'s':''}`;

  document.getElementById('modal-body').innerHTML = `
    <div class="form-summary" id="fm-summary"></div>
    <div class="form-grid" id="fm-grid">
      <div class="form-field">
        <label>First Name *</label>
        <input type="text" id="fm-first" placeholder="Maria" autocomplete="given-name">
      </div>
      <div class="form-field">
        <label>Last Name *</label>
        <input type="text" id="fm-last" placeholder="Garcia" autocomplete="family-name">
      </div>
      <div class="form-field full">
        <label>Email *</label>
        <input type="email" id="fm-email" placeholder="maria@email.com" autocomplete="email">
      </div>
      <div class="form-field full">
        <label>Phone / WhatsApp *</label>
        <input type="tel" id="fm-phone" placeholder="+52 984 000 0000" autocomplete="tel">
      </div>
      <div class="form-field">
        <label>Number of guests</label>
        <select id="fm-adults">
          ${[1,2,3,4].slice(0, _selectedRt.max_occ ?? 2).map(n => `<option value="${n}" ${n===gc?'selected':''}>${n}</option>`).join('')}
        </select>
      </div>
      <div class="form-field">
        <label>Dietary restrictions</label>
        <input type="text" id="fm-dietary" placeholder="Vegan, gluten-free…">
      </div>
      <div class="form-field full">
        <label>Additional notes</label>
        <textarea id="fm-notes" rows="2" placeholder="Anything we should know…"></textarea>
      </div>
      <div class="form-field full" id="fm-discount-wrap">
        <label>Discount Code</label>
        <div style="display:flex;gap:8px">
          <input type="text" id="fm-discount" placeholder="Enter code…" maxlength="30"
            style="flex:1;text-transform:uppercase"
            onkeydown="if(event.key==='Enter'){event.preventDefault();applyDiscount()}">
          <button type="button" id="btn-apply-discount" onclick="applyDiscount()"
            style="padding:0 16px;background:var(--clay);color:#fff;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;white-space:nowrap">
            Apply
          </button>
        </div>
        <div id="fm-discount-msg" style="font-size:11.5px;margin-top:5px;min-height:16px"></div>
      </div>
    </div>
    <div id="stripe-wrap" style="display:none">
      <div class="stripe-section">
        <div class="stripe-section-label">Payment Details</div>
        <div id="stripe-element"></div>
        <div class="stripe-lock">🔒 Secured by Stripe</div>
      </div>
      <button class="btn-back" onclick="resetToForm()">← Change guest info</button>
    </div>
    <div id="fm-err" class="form-err"></div>
    <button class="btn-submit" id="btn-continue" onclick="proceedToPayment()">
      Continue to payment
      <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
    </button>
    <button class="btn-submit" id="btn-pay" style="display:none" onclick="confirmPayment()">
      Pay <span id="pay-amount"></span>
      <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
    </button>
    ${_settings.terms ? `<p style="font-size:11px;opacity:.5;margin-top:12px;line-height:1.6">${esc(_settings.terms)}</p>` : ''}`;

  _refreshSummary();
  document.getElementById('booking-modal').classList.add('open');
  setTimeout(() => document.getElementById('fm-first')?.focus(), 100);
}

function closeModal() {
  document.getElementById('booking-modal').classList.remove('open');
  _selectedRt = null; _stripe = null; _stripeElems = null; _piAmount = 0;
  _discountCode = null; _discountAmount = 0;
}

function resetToForm() {
  _stripe = null; _stripeElems = null; _piAmount = 0;
  document.getElementById('stripe-wrap').style.display  = 'none';
  document.getElementById('btn-pay').style.display      = 'none';
  document.getElementById('btn-continue').style.display = '';
  document.getElementById('fm-err').textContent = '';
  ['fm-first','fm-last','fm-email','fm-phone','fm-adults','fm-dietary','fm-notes','fm-discount','btn-apply-discount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
}

function _refreshSummary() {
  if (!_selectedRt || !_calIn || !_calOut) return;
  const nights    = Math.round((new Date(_calOut) - new Date(_calIn)) / 86400000);
  const gc        = parseInt(document.getElementById('fm-adults')?.value) || _guestCount;
  const rate      = getRatePerPerson(_selectedRt, gc);
  const { price: adjRate } = applyRules(rate, _calIn, isManualRate(_selectedRt));
  const taxes     = _settings.taxes_pct ?? 0;
  const subtotal  = adjRate * nights;
  const discAmt   = Math.min(_discountAmount, subtotal);
  const taxAmt    = Math.round((subtotal - discAmt) * taxes) / 100;
  const total     = Math.max(0, subtotal - discAmt + taxAmt);

  const el = document.getElementById('fm-summary');
  if (!el) return;
  el.innerHTML = `
    <div class="line"><span>${_selectedRt.name}</span><span>${fmtUSD(adjRate)}/night</span></div>
    <div class="line"><span>${nights} night${nights!==1?'s':''}</span><span>${fmtUSD(subtotal)}</span></div>
    ${taxes > 0 ? `<div class="line"><span>Taxes (${taxes}%)</span><span>${fmtUSD(taxAmt)}</span></div>` : ''}
    ${discAmt > 0 ? `<div class="line" style="color:#16a34a"><span>Discount (${esc(_discountCode ?? '')})</span><span>-${fmtUSD(discAmt)}</span></div>` : ''}
    <div class="line total"><span>Estimated Total</span><span>${fmtUSD(total)}</span></div>
  `;
}

async function applyDiscount() {
  const codeEl = document.getElementById('fm-discount');
  const msgEl  = document.getElementById('fm-discount-msg');
  const btn    = document.getElementById('btn-apply-discount');
  const code   = (codeEl?.value ?? '').trim().toUpperCase();

  if (!code) { msgEl.textContent = 'Enter a discount code'; msgEl.style.color = '#dc2626'; return; }

  btn.disabled = true; btn.textContent = '…';
  msgEl.textContent = ''; msgEl.style.color = '';

  try {
    const res = await fetch(API_BASE + '/.netlify/functions/validate-discount', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, source: 'Escape', checkIn: _calIn, checkOut: _calOut }),
    });
    const data = await res.json();

    if (!res.ok || !data.valid) {
      msgEl.textContent = data.error ?? 'Invalid code';
      msgEl.style.color = '#dc2626';
      _discountCode = null; _discountAmount = 0;
      _refreshSummary();
      return;
    }

    const nights   = Math.round((new Date(_calOut) - new Date(_calIn)) / 86400000);
    const gc       = parseInt(document.getElementById('fm-adults')?.value) || _guestCount;
    const rate     = getRatePerPerson(_selectedRt, gc);
    const { price: adjRate } = applyRules(rate, _calIn, isManualRate(_selectedRt));
    const subtotal = adjRate * nights;

    _discountCode   = data.code;
    _discountAmount = data.type === 'pct'
      ? Math.round(subtotal * data.value) / 100
      : Math.min(data.value, subtotal);

    msgEl.textContent = (data.description ?? data.code) + ' applied!';
    msgEl.style.color = '#16a34a';
    _refreshSummary();
  } catch (e) {
    msgEl.textContent = 'Error validating code';
    msgEl.style.color = '#dc2626';
  } finally {
    btn.disabled = false; btn.textContent = 'Apply';
  }
}

async function proceedToPayment() {
  const first   = document.getElementById('fm-first')?.value.trim();
  const last    = document.getElementById('fm-last')?.value.trim();
  const email   = document.getElementById('fm-email')?.value.trim();
  const phone   = document.getElementById('fm-phone')?.value.trim();
  const adults  = parseInt(document.getElementById('fm-adults')?.value) || 1;
  const dietary = document.getElementById('fm-dietary')?.value.trim();
  const notes   = document.getElementById('fm-notes')?.value.trim();
  const checkIn  = _calIn;
  const checkOut = _calOut;
  const errEl = document.getElementById('fm-err');
  errEl.textContent = '';

  if (!first || !last) { errEl.textContent = 'First and last name are required'; return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = 'Invalid email address'; return; }
  if (!phone) { errEl.textContent = 'Phone number is required'; return; }

  const btn = document.getElementById('btn-continue');
  btn.disabled = true; btn.childNodes[0].textContent = 'Loading… ';

  try {
    const res = await fetch(API_BASE + '/.netlify/functions/stripe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomTypeId:   _selectedRt?.id, roomTypeName: _selectedRt?.name,
        checkIn, checkOut, adults, firstName: first, lastName: last,
        email, phone: phone || null, dietary: dietary || null, notes: notes || null,
        discountCode: _discountCode || null,
        source: 'Escape',
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error ?? 'Error creating payment');

    _piAmount    = data.amount;
    _stripe      = Stripe(data.publishableKey);
    _stripeElems = _stripe.elements({
      clientSecret: data.clientSecret,
      appearance: { theme: 'stripe', variables: { fontFamily: 'Lato, sans-serif', borderRadius: '12px', colorPrimary: '#574b3f' } },
    });
    _stripeElems.create('payment').mount('#stripe-element');

    ['fm-first','fm-last','fm-email','fm-phone','fm-adults','fm-dietary','fm-notes','fm-discount','btn-apply-discount'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = true;
    });

    document.getElementById('stripe-wrap').style.display = 'block';
    const payBtn = document.getElementById('btn-pay');
    document.getElementById('pay-amount').textContent = fmtUSD(data.amount);
    payBtn.style.display = '';
    btn.style.display    = 'none';
  } catch (e) {
    errEl.textContent = e.message;
    btn.disabled = false; btn.childNodes[0].textContent = 'Continue to payment ';
  }
}

async function confirmPayment() {
  const errEl = document.getElementById('fm-err');
  errEl.textContent = '';
  const btn = document.getElementById('btn-pay');
  btn.disabled = true; btn.childNodes[0].textContent = 'Processing… ';

  try {
    const { error } = await _stripe.confirmPayment({
      elements: _stripeElems,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });
    if (error) {
      errEl.textContent = error.message;
      btn.disabled = false;
      document.getElementById('pay-amount').textContent = fmtUSD(_piAmount);
      btn.childNodes[0].textContent = 'Pay ';
      return;
    }
    const email = document.getElementById('fm-email')?.value.trim() ?? '';
    document.getElementById('modal-body').innerHTML = `
      <div class="success-screen">
        <div class="success-icon">✅</div>
        <h3>Confirmed</h3>
        <p>Your payment of <strong>${fmtUSD(_piAmount)}</strong> was successful.<br>
           <strong>${esc(_selectedRt?.name ?? '')}</strong> is reserved for you.<br>
           A receipt was sent to <strong>${esc(email)}</strong>.<br><br>
           Questions? <a href="mailto:amansala.reservations@gmail.com" style="color:var(--clay)">amansala.reservations@gmail.com</a></p>
      </div>`;
  } catch (e) {
    errEl.textContent = e.message;
    btn.disabled = false;
    document.getElementById('pay-amount').textContent = fmtUSD(_piAmount);
    btn.childNodes[0].textContent = 'Pay ';
  }
}

// ─── HELPERS ──────────────────────────────────────────────────
// A manual be_rates row (set via the admin Rates tab, or the Revenue Manager's Upload Prices)
// takes priority over the seasonal/weekend formula -- same precedence get-rates.js and
// stripe.js already use. Found 2026-10-17: this card's displayed price was computed here from
// rt.be_price_single alone, completely ignoring be_rates (get-availability.js now attaches
// manualRateSingle per room type for checkIn's date) -- the guest saw the OLD seasonal price on
// this page but was correctly charged the manual one at checkout, a confusing mismatch.
function applyRules(baseRate, dateStr, isManual) {
  if (!baseRate || !dateStr) return { price: baseRate ?? 0, original: null, isOffer: false };
  const d          = new Date(dateStr + 'T12:00:00');
  const dow        = d.getDay();
  const isWeekend  = dow === 0 || dow === 5 || dow === 6;
  const weekendPct = isWeekend ? Number(_settings.weekend_premium ?? 0) : 0;
  if (isManual) {
    const adjusted = Math.round(baseRate * (weekendPct ? (1 + weekendPct / 100) : 1));
    return { price: adjusted, original: null, isOffer: false };
  }
  const month       = d.getMonth() + 1;
  const seasonalPct = Number((_settings.seasonal_adjustments ?? {})[String(month)] ?? 0);
  const adjusted    = Math.round(baseRate * (1 + seasonalPct / 100) * (weekendPct ? (1 + weekendPct / 100) : 1));
  return { price: adjusted, original: adjusted < baseRate ? baseRate : null, isOffer: adjusted < baseRate };
}

function getRatePerPerson(rt, gc) {
  // A manual be_rates override wins outright (checked separately via isManualRate(rt) at each
  // call site, since applyRules needs to know to skip the seasonal % for it).
  if (rt.manualRateSingle != null) return rt.manualRateSingle;
  // be_price_single = flat room rate configured in Booking Engine
  // be_price_double is used for occupancy counts in this property, not a price
  if (rt.be_price_single != null) return rt.be_price_single;
  return rt.price_single_high ?? 0;
}
function isManualRate(rt) { return rt.manualRateSingle != null; }

function fmtDate(s) {
  if (!s) return '';
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtUSD(n) {
  const v = Number(n);
  const decimals = v % 1 === 0 ? 0 : 2;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: 2 });
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showOutput(html) {
  document.getElementById('rooms-output').innerHTML = html;
}

document.getElementById('booking-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('booking-modal')) closeModal();
});

