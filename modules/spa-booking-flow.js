// ===== spa-booking-flow.js — new guest booking flow for spa-booking.html (Darlene 2026-10-22) =====
// Loaded by spa-booking.html AFTER its main script and BEFORE init(); it replaces a few step functions of that page and leaves the rest alone.
// The flow:
//  1. Name + "Are you staying at Amansala?"
//       Yes  -> only massages are offered (no ceremonies); charged to the room as before.
//       No   -> "What would you like to book?" Massage or Ceremony; advance payment as before.
//  2. Treatment.   3. (the old "are you staying?" page is skipped, we already know)   4. Details (name is pre-filled).
//  5. Therapist preference (unchanged: hotel guests may pick a specific therapist; everyone can pick female / male / no preference).
//  6. "Choose your desired time": the guest TYPES the time they want, with am or pm (e.g. "2:30 pm"; 24-hour like 14:30 also works). If it is free they get it; if not they are offered the times CLOSEST to it.
//     Which therapist gets the booking: among those free at that time, the one whose day it fits best, i.e. a therapist who already has
//     appointments that day and would have the least idle time left around it (so gaps get filled); therapists with an empty day come last.
//     Ties fall back to the staff-set rotation order (sbRotationOrder). A specifically requested therapist is always honoured.
//     Breaks, daily caps, rooms and availability still come from the page's own sbSlotFree / sbAllFreeAssignments, so none of those rules change.
// Treatment list as FOLDERS (Darlene 2026-10-22), for massage / one-on-one bookings: Body Work (60 and 90 minute massage, Reflexology, Foot & Scalp),
// Mayan Healing (60 and 90 minute Mayan Healing, Crystal Balancing Massage, Mayan Egg Ritual) and Spirit Work (Tarot Card Reading, Aura Reading).
// Each folder opens when clicked. "60 minute Deep Tissue" is not offered (it is the same as the 60 minute massage). Anything else that is bookable
// and is a massage (e.g. Facial, Thai Massage) is not dropped silently: it sits in a "More Treatments" folder until staff decide. Ceremonies and
// special offer links (?offer=...) keep the page's original lists and first steps.
const SBF = { desired: null, text: '' };

// ---------- step 1: name + staying here ----------
const _sbfOrigStep1 = window.renderStep1_SessionType;
window.renderStep1_SessionType = function (el) {
  if (SB_OFFER) return _sbfOrigStep1(el);
  renderDots(7);
  el.innerHTML = `<div class="card">
    <div class="section-title">Book Your Spa Experience</div>
    <div class="section-sub">First, tell us who you are.</div>
    <div class="form-row">
      <div><label class="form-label">First Name *</label><input class="form-input" id="sbfFirst" value="${esc(SB.firstName)}"></div>
      <div><label class="form-label">Last Name *</label><input class="form-input" id="sbfLast" value="${esc(SB.lastName)}"></div>
    </div>
    <div class="section-title" style="font-size:17px;margin-top:18px">Are you staying at Amansala?</div>
    <div class="choice-btn" onclick="sbfStay(true)">Yes, I am staying at Amansala<div class="cd">Massages, charged to your room</div></div>
    <div class="choice-btn" onclick="sbfStay(false)">No, I am not staying at Amansala<div class="cd">Massages and ceremonies · advance payment to reserve your spot</div></div>
  </div>`;
};
function sbfStay(staying) {
  const first = (document.getElementById('sbfFirst') || {}).value || '', last = (document.getElementById('sbfLast') || {}).value || '';
  if (!first.trim() || !last.trim()) { showToast('Please enter your first and last name.'); return; }
  SB.firstName = first.trim(); SB.lastName = last.trim();
  SB.guestType = staying ? 'hotel' : 'offsite';
  SB.serviceId = null; SB.prefType = 'none'; SB.requestedTherapistId = null; SB.date = null; SB.start = null; SBF.desired = null;
  if (staying) { SB.sessionType = 'individual'; SB.onlyMassage = true; setStep(2); }
  else { SB.step = 1.5; renderStep(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
}

// ---------- step 1.5 (not staying): massage or ceremony ----------
const _sbfOrigRenderStep = window.renderStep;
window.renderStep = function () {
  if (SB.step === 1.5) return sbfRenderKind(document.getElementById('mainContent'));
  return _sbfOrigRenderStep.apply(this, arguments);
};
function sbfRenderKind(el) {
  renderDots(7);
  el.innerHTML = `<button class="btn-back" onclick="setStep(1)">&#8249; Back</button>
    <div class="card">
      <div class="section-title">What Would You Like to Book?</div>
      <div class="section-sub">Hi ${esc(SB.firstName)}, are you looking for a massage or a ceremony?</div>
      <div class="choice-btn" onclick="sbfPickKind('massage')">A Massage<div class="cd">One-on-one body work, just for you</div></div>
      <div class="choice-btn" onclick="sbfPickKind('ceremony')">A Ceremony<div class="cd">Temazcal, Cacao &amp; Sound Healing and other shared experiences</div></div>
    </div>`;
}
function sbfPickKind(kind) { SB.onlyMassage = kind === 'massage'; SB.sessionType = kind === 'massage' ? 'individual' : 'group'; setStep(2); }

// ---------- step 2: only massages when asked; back goes to the right page ----------
const SBF_FOLDERS = [
  { label: 'Body Work', names: ['60 Minute Massage', '90 Minute Massage', 'Reflexology', 'Foot & Scalp'] },
  { label: 'Mayan Healing', names: ['60 minute Mayan Healing massage', '90 minute Mayan Healing Massage', 'Crystal Balancing massage', 'Mayan Egg ritual'] },
  { label: 'Spirit Work', names: ['Tarot Card Reading', 'Aura Reading'] },
];
const SBF_HIDDEN = ['60 minute Deep Tissue'];
const sbfNorm = n => String(n || '').toLowerCase().replace(/\s+/g, ' ').trim();
function sbfRenderFolders(el) {
  const bookable = SpaData.services.filter(s => s.active && s.duration != null && (s.groupPricing ? true : s.price != null) && (s.sessionType || 'individual') === 'individual' && sbOfferFilter(s));
  const byName = n => bookable.find(s => sbfNorm(s.name) === sbfNorm(n));
  const used = new Set([...SBF_HIDDEN.map(sbfNorm)]);
  const card = s => `<div class="svc-card" onclick="sbPickService('${s.id}')"><div class="svc-name">${esc(s.name)}</div>${s.description ? `<div class="svc-desc">${esc(s.description)}</div>` : ''}<div class="svc-meta"><span>${s.duration} min</span><span class="svc-price">$${s.price} USD</span></div></div>`;
  const folders = SBF_FOLDERS.map(f => ({ label: f.label, list: f.names.map(n => { used.add(sbfNorm(n)); return byName(n); }).filter(Boolean) }));
  const more = bookable.filter(s => s.category === 'massage' && !used.has(sbfNorm(s.name)));
  if (more.length) folders.push({ label: 'More Treatments', list: more });
  const back = SB.guestType === 'hotel' ? 'setStep(1)' : 'sbfBackToKind()';
  el.innerHTML = `<button class="btn-back" onclick="${back}">&#8249; Back</button><div class="card"><div class="section-title">Choose a Treatment</div><div class="section-sub">Open a folder to see the treatments.</div>
    ${folders.filter(f => f.list.length).map(f => `<details class="cat-fold"><summary class="cat-label cat-sum">${esc(f.label)}</summary>${f.list.map(card).join('')}</details>`).join('')
      || '<div class="no-slots">Nothing here is ready to book yet — please check back soon or contact us directly.</div>'}</div>`;
}
const _sbfOrigStep2 = window.renderStep2_Service;
window.renderStep2_Service = function (el) {
  if (SB.sessionType === 'individual' && !SB_OFFER) return sbfRenderFolders(el);
  const all = SpaData.services;
  if (SB.onlyMassage) SpaData.services = all.filter(s => s.category === 'massage'); // only body work for a massage booking
  try { _sbfOrigStep2(el); } finally { SpaData.services = all; }
  const back = el.querySelector('.btn-back');
  if (back) back.setAttribute('onclick', SB.guestType === 'hotel' ? 'setStep(1)' : 'sbfBackToKind()');
};
function sbfBackToKind() { SB.step = 1.5; renderStep(); }

// ---------- step 3 skipped: we already asked at the start ----------
const _sbfOrigStep3 = window.renderStep3_GuestType;
window.renderStep3_GuestType = function (el) {
  if (!SB.guestType) return _sbfOrigStep3(el);
  SB.step = 4; renderStep();
};
function sbfFixBack(el) { const b = el.querySelector('.btn-back'); if (b) { const svc = SpaData.services.find(s => s.id === SB.serviceId); b.setAttribute('onclick', `setStep(${svc && svc.groupPricing ? 2.5 : 2})`); } }
['renderStep4_Hotel', 'renderStep4_Offsite'].forEach(n => { const o = window[n]; window[n] = function (el) { o(el); sbfFixBack(el); }; });

// ---------- step 6: desired time, gap-filling, closest times ----------
const _sbfOrigStep6 = window.renderStep6_DateTime;
function sbfGapScore(t, dateStr, startMin, dur) {
  const appts = SpaAppointments.filter(a => a.date === dateStr && a.status !== 'CANCELLED' && a.therapistId === t.id)
    .map(a => ({ s: hhmmToMin(a.start), e: hhmmToMin(a.start) + (a.duration || 60) })).sort((x, y) => x.s - y.s);
  if (!appts.length) return { busy: false, idle: 0 };
  const prev = [...appts].reverse().find(a => a.e <= startMin), next = appts.find(a => a.s >= startMin + dur);
  return { busy: true, idle: (prev ? startMin - prev.e : 0) + (next ? next.s - (startMin + dur) : 0) };
}
function sbfChoose(assigns, startMin, dur) {
  if (SB.prefType === 'specific') return assigns[0];
  let order = []; try { order = sbRotationOrder().map(r => r.name); } catch (e) {}
  const rank = a => { const i = order.indexOf((a.therapist.firstName || '').trim()); return i < 0 ? 999 : i; };
  const scored = assigns.map(a => ({ a, g: sbfGapScore(a.therapist, SB.date, startMin, dur) }));
  scored.sort((x, y) => (y.g.busy - x.g.busy) || (x.g.idle - y.g.idle) || (rank(x.a) - rank(y.a)) || String(x.a.therapist.firstName).localeCompare(String(y.a.therapist.firstName)));
  return scored[0].a;
}
function sbfOpenSlots(candidates, svc) {
  const tn = sbTulumNow(), out = [];
  for (let m = SB_START_H * 60; m <= SB_END_H * 60 - svc.duration; m += 30) {
    if (SB.date === tn.dateStr && m <= tn.minutes) continue;
    if (sbAllFreeAssignments(candidates, SB.date, m, svc.duration).length) out.push(m);
  }
  return out;
}
window.renderStep6_DateTime = function (el) {
  const days = sbBookableDays();
  if (!days.length) return _sbfOrigStep6(el); // the page's own "outside your stay" message
  renderDots(7);
  const svc = SpaData.services.find(s => s.id === SB.serviceId);
  if (!SB.date || !days.some(d => d.toISOString().slice(0, 10) === SB.date)) SB.date = days[0].toISOString().slice(0, 10);
  el.innerHTML = `<button class="btn-back" onclick="setStep(5)">&#8249; Back</button>
    <div class="card">
      <div class="section-title">Choose Your Desired Time</div>
      <div class="section-sub">${esc(svc.name)} · ${svc.duration} min</div>
      <div class="date-scroller" id="sbDateScroller">${days.map(d => { const ds = d.toISOString().slice(0, 10); return `<div class="date-pill ${ds === SB.date ? 'on' : ''}" onclick="sbfPickDate('${ds}')"><div class="dow">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div><div class="dnum">${d.getDate()}</div></div>`; }).join('')}</div>
      <div class="form-group" style="margin-top:12px"><label class="form-label">What time would you like?</label>
        <div style="display:flex;gap:8px"><input class="form-input" id="sbfDesiredTxt" placeholder="Type a time, for example 2:30 pm" value="${esc(SBF.text)}" onkeydown="if(event.key==='Enter')sbfCheckTime()" autocomplete="off"><button class="slot-btn" style="width:auto;padding:10px 18px;white-space:nowrap" onclick="sbfCheckTime()">Check</button></div>
        <div class="cd" style="font-size:12px;color:#8a7e74;margin-top:4px">Please include am or pm. We are open ${fmtT(minToHHMM(SB_START_H * 60))} to ${fmtT(minToHHMM(SB_END_H * 60))}.</div></div>
      <div id="sbfResults"></div>
    </div>`;
  sbfRenderResults();
};
function sbfPickDate(ds) { SB.date = ds; renderStep6_DateTime(document.getElementById('mainContent')); }
// "2pm", "2:30 pm", "2.30PM", "14:30", "noon" -> minutes since midnight; null if it can't be read; 'ampm' if am/pm is missing
function sbfParseTime(txt) {
  const t = String(txt || '').trim().toLowerCase();
  if (!t) return null;
  if (/^(noon|midday|12 noon)$/.test(t)) return 720;
  const m = /^(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?\s*([ap])?\.?\s*(?:m\.?)?$/.exec(t);
  if (!m) return null;
  let h = parseInt(m[1], 10); const min = m[2] ? parseInt(m[2], 10) : 0;
  if (min > 59 || h > 24) return null;
  if (m[3]) { if (h < 1 || h > 12) return null; h = h % 12 + (m[3] === 'p' ? 12 : 0); }
  else if (h > 12) { /* 24-hour clock like 14:30 */ }
  else return 'ampm';
  return h * 60 + min;
}
function sbfCheckTime() {
  const inp = document.getElementById('sbfDesiredTxt'), wrap = document.getElementById('sbfResults');
  SBF.text = inp ? inp.value : SBF.text;
  const v = sbfParseTime(SBF.text);
  if (v === 'ampm') { SBF.desired = null; if (wrap) wrap.innerHTML = '<div class="no-slots">Please add am or pm to your time, for example <b>2:30 pm</b>.</div>'; return; }
  if (v == null) { SBF.desired = null; if (wrap) wrap.innerHTML = SBF.text.trim() ? '<div class="no-slots">We could not read that time. Please type it like <b>2:30 pm</b>.</div>' : '<div class="section-sub" style="margin-top:6px">Type the time you would like, with am or pm, and we will check it for you.</div>'; return; }
  SBF.desired = v; sbfRenderResults();
}
function sbfRenderResults() {
  const wrap = document.getElementById('sbfResults'); if (!wrap) return;
  const svc = SpaData.services.find(s => s.id === SB.serviceId), candidates = sbCandidateTherapists();
  if (!candidates.length) { wrap.innerHTML = '<div class="no-slots">No therapists available for this service yet. Please try a different preference or contact us directly.</div>'; return; }
  if (SBF.desired == null) { wrap.innerHTML = '<div class="section-sub" style="margin-top:6px">Type the time you would like, with am or pm, and we will check it for you.</div>'; return; }
  const open = sbfOpenSlots(candidates, svc), want = SBF.desired;
  if (!open.length) { wrap.innerHTML = '<div class="no-slots">No open times on this day — try another date.</div>'; return; }
  const exact = open.includes(want);
  const near = open.filter(m => m !== want).sort((a, b) => Math.abs(a - want) - Math.abs(b - want) || a - b).slice(0, exact ? 3 : 4).sort((a, b) => a - b);
  const btn = (m, primary) => `<button class="${primary ? 'btn-primary' : 'slot-btn'}" style="${primary ? '' : 'width:auto;padding:10px 16px'}" onclick="sbfPick(${m})">${primary ? 'Book ' : ''}${fmtT(minToHHMM(m))}</button>`;
  wrap.innerHTML = (exact
    ? `<div style="margin:8px 0;font-weight:700;color:#15803d">✓ ${fmtT(minToHHMM(want))} is available.</div>${btn(want, true)}`
    : `<div class="no-slots" style="margin:8px 0">${fmtT(minToHHMM(Math.max(0, Math.min(want, 1439))))} isn't available on ${fmtDateLong(SB.date)}. Here are the closest times:</div>`)
    + (near.length ? `<div class="section-sub" style="margin:${exact ? '14px' : '0'} 0 8px">${exact ? 'Other times close to it:' : ''}</div><div style="display:flex;flex-wrap:wrap;gap:8px">${near.map(m => btn(m, false)).join('')}</div>` : '');
}
function sbfPick(startMin) {
  const svc = SpaData.services.find(s => s.id === SB.serviceId), candidates = sbCandidateTherapists();
  const assigns = sbAllFreeAssignments(candidates, SB.date, startMin, svc.duration); // re-checked now, in case someone just booked it
  if (!assigns.length) { alert('Sorry, that time was just taken. Please choose another time.'); sbfRenderResults(); return; }
  const picked = sbfChoose(assigns, startMin, svc.duration);
  SB.rotationGroup = null; SB.rotationName = null; // gap-filling chose the therapist, so this booking does not advance the rotation count
  sbPickSlot(startMin, picked.therapist.id, picked.room ? picked.room.id : '');
}
