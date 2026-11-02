// ===== spa-booked-by-report.js — "Booked by" daily report on the spa calendar =====
// Loaded as a classic script AFTER spa-time-blocks.js; shares global scope. Standalone: wraps spaCalRenderToolbar to add a "📊 Booked by" button. The report counts spa services
// by who booked them, for the day they were BOOKED (not the day of the service): each staff member (the name stamped by spa-booked-by.js on every booking made in the admin
// calendar), "Online (guest booking page)" for guests who booked themselves, and "Not recorded" for older bookings made before names were stamped (before Oct 25, 2026).
// Pick one day or a range; click a name to see the services behind the number. Cancelled services are left out of the counts and mentioned underneath. Display only.
// Asked by Darlene 2026-11-02: "a way to run a report for spa that says daily report.. Max booked x, Michelle booked x, app booked x".
(function () {
  if (typeof window.spaCalRenderToolbar !== 'function') return;
  const origToolbar = window.spaCalRenderToolbar;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const tulum = d => new Date(Date.parse(d) - 5 * 3600 * 1000).toISOString().slice(0, 10);   // Tulum date (UTC-5, no daylight saving)
  const today = () => tulum(new Date().toISOString());
  const ONLINE = 'Online (guest booking page)', NONE = 'Not recorded (before names were saved)';
  const who = a => a.bookedBy ? String(a.bookedBy).trim() : (a.source === 'guest_booking' ? ONLINE : NONE);
  const fmtD = ds => { try { return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) { return ds; } };
  const fmtT = t => { try { const [h, m] = String(t).split(':').map(Number); return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + (h >= 12 ? ' PM' : ' AM'); } catch (e) { return t || ''; } };

  window.spaBbrOpen = function () {
    let m = document.getElementById('spaBbrModal');
    if (!m) {
      m = document.createElement('div'); m.id = 'spaBbrModal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99995;display:flex;align-items:center;justify-content:center;padding:16px';
      m.onclick = e => { if (e.target === m) m.style.display = 'none'; };
      document.body.appendChild(m);
    }
    m.style.display = 'flex';
    m.innerHTML = `<div style="background:#f5f1eb;border-radius:16px;max-width:620px;width:100%;max-height:90vh;overflow:auto;padding:20px 24px;box-shadow:0 12px 40px rgba(0,0,0,.3);font-family:'Jost',sans-serif;color:#2d2520">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><div style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700">Spa: who booked</div><button onclick="document.getElementById('spaBbrModal').style.display='none'" style="border:none;background:none;font-size:22px;cursor:pointer;color:#4b5563">✕</button></div>
      <div style="font-size:12.5px;color:#4b5563;margin-bottom:12px">Counts the services by the day they were booked, and by who booked them.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <label style="font-size:12.5px;font-weight:700">From <input type="date" id="spaBbrFrom" value="${today()}" onchange="spaBbrRun()" style="padding:5px 8px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:inherit"></label>
        <label style="font-size:12.5px;font-weight:700">To <input type="date" id="spaBbrTo" value="${today()}" onchange="spaBbrRun()" style="padding:5px 8px;border:1.5px solid #c8bfb5;border-radius:8px;font-family:inherit"></label>
        <button onclick="spaBbrQuick(0)" style="padding:5px 10px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;font-size:12.5px">Today</button>
        <button onclick="spaBbrQuick(1)" style="padding:5px 10px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;font-size:12.5px">Yesterday</button>
        <button onclick="spaBbrQuick(7)" style="padding:5px 10px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;font-size:12.5px">Last 7 days</button>
      </div><div id="spaBbrOut"></div></div>`;
    spaBbrRun();
  };
  window.spaBbrQuick = function (days) {
    const t = new Date(today() + 'T12:00:00'), set = (id, d) => { document.getElementById(id).value = d.toISOString().slice(0, 10); };
    const from = new Date(t); from.setDate(from.getDate() - (days === 1 ? 1 : days === 7 ? 6 : 0));
    const to = new Date(t); if (days === 1) to.setDate(to.getDate() - 1);
    set('spaBbrFrom', from); set('spaBbrTo', to); spaBbrRun();
  };
  window.spaBbrRun = function () {
    const out = document.getElementById('spaBbrOut'); if (!out) return;
    const from = document.getElementById('spaBbrFrom').value, to = document.getElementById('spaBbrTo').value || from;
    const all = (typeof SpaAppointments !== 'undefined' ? SpaAppointments : []).filter(a => a.createdAt && tulum(a.createdAt) >= from && tulum(a.createdAt) <= to);
    const live = all.filter(a => a.status !== 'CANCELLED'), cancelled = all.length - live.length;
    const groups = {}; live.forEach(a => (groups[who(a)] = groups[who(a)] || []).push(a));
    window._spaBbrGroups = groups;
    const names = Object.keys(groups).sort((x, y) => (x === NONE) - (y === NONE) || (x === ONLINE) - (y === ONLINE) || groups[y].length - groups[x].length);
    const therName = id => { const t = (typeof SpaData !== 'undefined' ? SpaData.therapists : []).find(x => x.id === id); return t ? t.firstName : ''; };
    const svcName = a => { try { const s = (SpaData.services || []).find(x => x.id === a.serviceId); return s ? s.name : 'Service'; } catch (e) { return 'Service'; } };
    out.innerHTML = names.length ? `<div style="background:#fff;border-radius:12px;padding:6px 14px">${names.map((n, i) => `<div style="border-top:${i ? '1px solid #efeae0' : 'none'};padding:8px 0"><div onclick="var d=document.getElementById('spaBbrD${i}');d.style.display=d.style.display==='none'?'block':'none'" style="display:flex;justify-content:space-between;cursor:pointer;font-size:14px"><b>${esc(n)}</b><span><b style="font-size:18px">${groups[n].length}</b> booked</span></div>
        <div id="spaBbrD${i}" style="display:none;margin-top:6px;font-size:12.5px;color:#4b5563">${groups[n].slice().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).map(a => `<div style="padding:2px 0">${esc(a.clientName || 'Guest')} · ${esc(svcName(a))} · ${fmtD(a.date)} ${fmtT(a.start)}${therName(a.therapistId) ? ' · ' + esc(therName(a.therapistId)) : ''}</div>`).join('')}</div></div>`).join('')}
        <div style="border-top:2px solid #2d2520;padding:8px 0;display:flex;justify-content:space-between;font-size:14px"><b>Total</b><b style="font-size:18px">${live.length}</b></div></div>`
      : '<div style="background:#fff;border-radius:12px;padding:14px;font-size:13px;color:#4b5563">No services were booked in this period.</div>';
    out.innerHTML += `<div style="font-size:11.5px;color:#4b5563;margin-top:8px">Booked ${from === to ? fmtD(from) : fmtD(from) + ' to ' + fmtD(to)}. Click a name to see the services.${cancelled ? ` ${cancelled} cancelled service${cancelled === 1 ? '' : 's'} not counted.` : ''} Bookings made before names were saved (before Oct 25) show as "Not recorded".</div>`;
  };

  window.spaCalRenderToolbar = function () {
    const out = origToolbar.apply(this, arguments);
    try {
      const wrap = document.getElementById('spaAddBtnWrap'), row = wrap && wrap.firstElementChild;
      if (row && !row.querySelector('#spaBbrBtn')) row.insertAdjacentHTML('beforeend', `<button id="spaBbrBtn" onclick="spaBbrOpen()" style="padding:6px 12px;font-size:12px;font-weight:600;border:1.5px solid #94a3b8;border-radius:8px;background:#f1f5f9;color:#475569;cursor:pointer;font-family:'Jost',sans-serif">📊 Who booked</button>`);
    } catch (e) {}
    return out;
  };
})();
