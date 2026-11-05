// ===== spa-therapist-confirm.js — "📱 Send confirmation to therapist" in the Spa appointment window (Jorge 2026-11-05) =====
// Sends the appointment's therapist a WhatsApp (netlify/functions/spa-therapist-confirm.js) with date, time, service, duration,
// client and hotel guest + room / Offsite. Uses the saved appointment: save changes first. Standalone; classic script.
window.spaSendTherapistConfirm = async function () {
  const id = (document.getElementById('spaApptId') || {}).value;
  if (!id) { showToast('Save the appointment first.'); return; }
  const btn = document.getElementById('spaTherConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  let token = '';
  try { token = sessionStorage.getItem('amansala_staff_token') || ''; } catch (e) {}
  try {
    const r = await fetch('/.netlify/functions/spa-therapist-confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, apptId: id }) });
    const d = await r.json().catch(() => ({}));
    showToast(d.ok ? `Confirmation sent to ${d.therapist} by WhatsApp ✓` : '⚠ ' + (d.error || 'Not sent'));
  } catch (e) { showToast('Connection problem — not sent.'); }
  if (btn) { btn.disabled = false; btn.textContent = '📱 Send confirmation to therapist'; }
};
