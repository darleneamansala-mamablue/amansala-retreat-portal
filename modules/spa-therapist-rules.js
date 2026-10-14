// ===== spa-therapist-rules.js — booking rules: per-therapist max services per day / break, and a service's "always assign to" therapist =====
// Loaded as a classic script AFTER spa.js; shares global scope. Standalone: it adds a small "Booking rules" block to the existing
// Edit/New Therapist form and saves two optional fields on the therapist record (SpaData.therapists[i]):
//   maxServicesPerDay  (whole number, blank = no limit)
//   breakMinutes       (minutes left free AFTER each service, blank/0 = back to back)
// spa-booking.html (the public booking page) reads both when deciding which times to offer. The admin calendar is NOT blocked by them
// (staff can still book, assign and move services as needed).
function sprInject(t) {
  const wrap = document.getElementById('spaTherServicesWrap');
  if (!wrap) return;
  let box = document.getElementById('sprBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'sprBox';
    box.style.cssText = 'margin:0 0 14px;padding:12px 14px;background:#faf7f2;border:1.5px solid #e8dfd4;border-radius:10px';
    box.innerHTML = `<label style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8a7e74;display:block;margin-bottom:8px">Booking rules <span style="font-weight:400;text-transform:none;letter-spacing:0">(used by the public booking page; leave blank for no limit)</span></label>
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        <div><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:3px">Max services per day</label>
          <input type="number" min="0" step="1" id="sprMax" placeholder="No limit" style="width:120px;padding:8px 10px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:'Jost',sans-serif;font-size:13px"></div>
        <div><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:3px">Break after each service (minutes)</label>
          <input type="number" min="0" step="5" id="sprBreak" placeholder="0 = back to back" style="width:150px;padding:8px 10px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:'Jost',sans-serif;font-size:13px"></div>
      </div>`;
    wrap.parentNode.parentNode.insertBefore(box, wrap.parentNode);
  }
  document.getElementById('sprMax').value = t && t.maxServicesPerDay ? t.maxServicesPerDay : '';
  document.getElementById('sprBreak').value = t && t.breakMinutes ? t.breakMinutes : '';
}
(function () {
  const origShow = window.spaShowTherapistForm;
  if (typeof origShow === 'function') {
    window.spaShowTherapistForm = function (id) {
      const r = origShow.apply(this, arguments);
      try { sprInject(id ? SpaData.therapists.find(x => x.id === id) : null); } catch (e) {}
      return r;
    };
  }
  const saveName = typeof window.spaSaveTherapist === 'function' ? 'spaSaveTherapist' : null;
  const origSave = saveName ? window[saveName] : null;
  if (origSave) {
    window[saveName] = function () {
      let max = '', brk = '', id = '';
      try { max = document.getElementById('sprMax').value; brk = document.getElementById('sprBreak').value; id = document.getElementById('spaTherId').value; } catch (e) {}
      const before = new Set(SpaData.therapists.map(t => t.id));
      const r = origSave.apply(this, arguments);
      try {
        const t = id ? SpaData.therapists.find(x => x.id === id) : SpaData.therapists.find(x => !before.has(x.id));
        if (t) {
          const m = parseInt(max, 10), b = parseInt(brk, 10);
          t.maxServicesPerDay = m > 0 ? m : null;
          t.breakMinutes = b > 0 ? b : null;
          if (typeof spaSave === 'function') spaSave();
        }
      } catch (e) {}
      return r;
    };
  }
})();

// ---- Service form: "Always assign to" (service.fixedTherapistId) ----
// When set, the public booking page offers and assigns ONLY that therapist for this service (e.g. Mayan Healing -> Maria Luisa).
function sprInjectService(svc) {
  const gp = document.getElementById('spaSvcGenderPref');
  if (!gp) return;
  const anchor = gp.closest('label') || gp.parentNode;
  let box = document.getElementById('sprSvcBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'sprSvcBox';
    box.style.cssText = 'margin-top:12px';
    anchor.parentNode.insertBefore(box, anchor.nextSibling);
  }
  const therapists = (SpaData.therapists || []).filter(t => t.active !== false);
  const cur = svc && svc.fixedTherapistId ? svc.fixedTherapistId : '';
  box.innerHTML = `<label style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8a7e74;display:block;margin-bottom:5px">Always assign to <span style="font-weight:400;text-transform:none;letter-spacing:0">(public booking page)</span></label>
    <select id="sprFixedTher" style="width:100%;padding:9px 12px;border:1.5px solid #c8bfb5;border-radius:9px;font-family:'Jost',sans-serif;font-size:13px;background:#fff">
      <option value="">Any available therapist</option>
      ${therapists.map(t => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>${(t.firstName || '') + ' ' + (t.lastName || '')}</option>`).join('')}
    </select>
    <div style="font-size:11.5px;color:#9ca3af;margin-top:4px">If a therapist is chosen here, guests are only ever booked with them for this service. Staff can still reassign it on the calendar.</div>`;
}
(function () {
  const origShow = window.spaShowServiceForm;
  if (typeof origShow === 'function') {
    window.spaShowServiceForm = function (id) {
      const r = origShow.apply(this, arguments);
      try { sprInjectService(id ? SpaData.services.find(x => x.id === id) : null); } catch (e) {}
      return r;
    };
  }
  const origSave = window.spaSaveService;
  if (typeof origSave === 'function') {
    window.spaSaveService = function () {
      let ther = '', id = '', name = '';
      try { ther = document.getElementById('sprFixedTher').value; id = document.getElementById('spaSvcId').value; name = document.getElementById('spaSvcName').value.trim(); } catch (e) {}
      const before = new Set(SpaData.services.map(x => x.id));
      const r = origSave.apply(this, arguments);
      try {
        const svc = id ? SpaData.services.find(x => x.id === id) : SpaData.services.find(x => !before.has(x.id) && x.name === name);
        if (svc) { svc.fixedTherapistId = ther || null; if (typeof spaSave === 'function') spaSave(); }
      } catch (e) {}
      return r;
    };
  }
})();
