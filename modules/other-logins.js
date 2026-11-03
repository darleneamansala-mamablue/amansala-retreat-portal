// ===== other-logins.js — set the passwords of the spa staff and driver logins (Manage Staff), 2026-11-03 =====
// Loaded as a classic script AFTER admin-staff.js, spa-staff-portal.js and driver-portal.js; shares global scope.
// Those logins (?mode=spa-staff, ?mode=driver) had no screen to change their password, and their old ones were public.
// Passwords are saved on the server (netlify/functions/portal-accounts.js, admin pass) and never shown; setting a new
// one signs that person out everywhere. Staff confirmation passwords stay in Staff Confirm > accounts ("Set password").
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const groups = () => [
    { kind: 'spa', title: 'Spa staff login', link: '/spa-staff', list: typeof DEF_SPA_STAFF !== 'undefined' ? DEF_SPA_STAFF : [] },
    { kind: 'driver', title: 'Driver login', link: '/booking-hub.html?mode=driver', list: typeof DEF_DRIVERS !== 'undefined' ? DEF_DRIVERS : [] },
  ];
  window.olSetPassword = async function (kind, id, username, name) {
    const pw = (prompt('New password for ' + name + ' (@' + username + '), at least 10 characters:') || '').trim();
    if (!pw) return;
    if (pw.length < 10) { alert('Use at least 10 characters.'); return; }
    let token = ''; try { token = sessionStorage.getItem('amansala_staff_token') || ''; } catch (e) {}
    try {
      const r = await fetch('/.netlify/functions/portal-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'setPassword', kind, accountId: id, username, name, password: pw }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) { alert(d.error || 'The password was not saved.'); return; }
      showToast('Password saved for ' + name + ' — signed out of every device.');
    } catch (e) { alert('Network error — the password was not saved.'); }
  };
  function render() {
    const body = document.querySelector('#manageStaffModal .modal-body');
    if (!body) return;
    let box = document.getElementById('olBox');
    if (!box) { box = document.createElement('div'); box.id = 'olBox'; box.style.cssText = 'margin-top:24px;padding-top:16px;border-top:1.5px solid var(--border)'; body.appendChild(box); }
    box.innerHTML = groups().map(g => `
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#8a7e74;margin:10px 0 8px">${esc(g.title)} <span style="text-transform:none;letter-spacing:0;font-weight:500">· ${esc(g.link)}</span></div>
      ${g.list.map(a => `<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;border:1.5px solid var(--border);border-radius:9px;margin-bottom:6px">
        <div style="flex:1;font-weight:700;font-size:13px">${esc(a.name)} <span style="font-weight:500;color:var(--muted)">@${esc(a.username)}</span></div>
        <button onclick="olSetPassword('${g.kind}','${esc(a.id)}','${esc(a.username)}','${esc(a.name)}')" style="font-size:11.5px;font-weight:600;padding:5px 11px;border-radius:8px;border:1.5px solid #e8dfd4;background:#fff;cursor:pointer">🔑 Set password</button>
      </div>`).join('')}`).join('') +
      '<div style="font-size:12px;color:var(--muted);margin-top:8px">Staff confirmation passwords: Staff Confirm → accounts → Set password.</div>';
  }
  // draw it whenever Manage Staff opens
  const o = window.openManageStaff;
  if (typeof o === 'function') window.openManageStaff = function () { const r = o.apply(this, arguments); try { render(); } catch (e) {} return r; };
  else document.addEventListener('click', () => setTimeout(() => { const m = document.getElementById('manageStaffModal'); if (m && getComputedStyle(m).display !== 'none') render(); }, 50));
})();
