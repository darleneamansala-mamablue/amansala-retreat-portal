// ===== spa-request-markers.js — "Requested" markers on spa appointments (Darlene 2026-10-19) =====
// The appointment window gets a "Requested" choice: nothing / this therapist (😊) / a male therapist (🤠) / a female therapist (👗).
// The symbol shows on the appointment block in the spa calendar (both By Therapist and By Room). It is saved on the appointment as
// requestMarker ('therapist' | 'male' | 'female'). Guests who chose a therapist or a gender on the online booking page already carry
// that choice (therapistPreference), so they get the symbol automatically. Standalone: wraps spaApptShowForm, spaApptSave, spaCalRender.
const SRM = {
  therapist: { icon: '😊', label: 'Requested this therapist' },
  male: { icon: '🤠', label: 'Requested a male therapist' },
  female: { icon: '👗', label: 'Requested a female therapist' },
};
function srmOf(a) {
  if (!a) return '';
  if (a.requestMarker === '') return '';   // staff cleared a guest-chosen request on purpose
  if (a.requestMarker && SRM[a.requestMarker]) return a.requestMarker;
  const t = a.therapistPreference && a.therapistPreference.type;
  return t === 'specific' ? 'therapist' : (t === 'male' || t === 'female') ? t : '';
}
function srmInject() {
  if (document.getElementById('spaApptRequested')) return;
  const ther = document.getElementById('spaApptTherapist'); if (!ther) return;
  const grid = ther.parentElement && ther.parentElement.parentElement; if (!grid) return;
  const d = document.createElement('div');
  d.innerHTML = `<label style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8a7e74;display:block;margin-bottom:5px">Requested</label>
    <select id="spaApptRequested" style="width:100%;padding:9px 12px;border:1.5px solid #c8bfb5;border-radius:9px;font-family:'Jost',sans-serif;font-size:13px;background:#fff">
      <option value="">No request</option>${Object.keys(SRM).map(k => `<option value="${k}">${SRM[k].icon} ${SRM[k].label}</option>`).join('')}</select>`;
  d.style.marginTop = '12px';
  grid.parentNode.insertBefore(d, grid.nextSibling);
}
const _srm_origShow = spaApptShowForm;
spaApptShowForm = function (id, prefill) {
  const r = _srm_origShow.apply(this, arguments);
  try {
    srmInject();
    const a = id ? (SpaAppointments || []).find(x => x.id === id) : null, el = document.getElementById('spaApptRequested');
    if (el) el.value = a ? srmOf(a) : '';
  } catch (e) { console.warn('[spa-request-markers]', e); }
  return r;
};
const _srm_origSave = spaApptSave;
spaApptSave = function () {
  const el = document.getElementById('spaApptRequested'), val = el ? el.value : null, idEl = document.getElementById('spaApptId');
  const editId = idEl && idEl.value, before = (SpaAppointments || []).length;
  const r = _srm_origSave.apply(this, arguments);
  try {
    const modal = document.getElementById('spaApptModal');
    if (val !== null && !(modal && modal.classList.contains('open'))) {   // the window closed, so the save went through
      const a = editId ? SpaAppointments.find(x => x.id === editId) : (SpaAppointments.length > before ? SpaAppointments[SpaAppointments.length - 1] : null);
      if (a && srmOf(a) !== val) {
        if (val) a.requestMarker = val; else delete a.requestMarker;
        if (!val && a.therapistPreference && srmOf({ therapistPreference: a.therapistPreference })) a.requestMarker = '';   // staff cleared a guest-chosen request on purpose
        spaCalSave(); spaCalRender();
      }
    }
  } catch (e) { console.warn('[spa-request-markers]', e); }
  return r;
};
function srmDecorate() {
  try {
    document.querySelectorAll('#spaContent [onclick]').forEach(b => {
      const m = /spaApptShowForm\('([^']+)'/.exec(b.getAttribute('onclick') || ''); if (!m || b.querySelector('.srm-icon')) return;
      const k = srmOf((SpaAppointments || []).find(x => x.id === m[1]));
      if (!k) return;
      const name = b.querySelector('div'); if (!name) return;
      const s = document.createElement('span'); s.className = 'srm-icon'; s.title = SRM[k].label; s.textContent = SRM[k].icon + ' '; s.style.cssText = 'font-size:12px';
      name.insertBefore(s, name.firstChild);
    });
  } catch (e) { console.warn('[spa-request-markers]', e); }
}
const _srm_origRender = spaCalRender;
spaCalRender = function () { const r = _srm_origRender.apply(this, arguments); srmDecorate(); return r; };
