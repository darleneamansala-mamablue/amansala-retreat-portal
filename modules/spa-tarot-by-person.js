// ===== spa-tarot-by-person.js — Tarot Card Reading is never booked online; guests are sent to a person (Darlene 2026-11-12) =====
// The page still lists Tarot, but picking it shows "Please contact us" instead of going on to times. The server (netlify/functions/spa-public.js) refuses it too.
const STP_RE = /tarot/i;
function stpIsTarot(id) {
  const svc = (SpaData.services || []).find(s => s.id === id);
  return !!(svc && STP_RE.test(svc.name || ''));
}
const _stpOrigPick = window.sbPickService;
window.sbPickService = function (id) {
  if (!stpIsTarot(id)) return _stpOrigPick.apply(this, arguments);
  const dots = document.getElementById('stepDots'); if (dots) dots.style.display = 'none';
  document.getElementById('mainContent').innerHTML = `<button class="btn-back" onclick="setStep(2)">&#8249; Back</button><div class="msg"><div class="msg-icon">&#9742;&#65039;</div><div class="msg-title">Tarot Is Booked With a Person</div><div class="msg-sub">Tarot Card Reading is scheduled personally. Please contact us directly or ask our onsite hosts, and we will find a time with you.</div></div>`;
};
