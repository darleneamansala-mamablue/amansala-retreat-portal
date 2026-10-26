// ===== dashboard-room-only.js — "Room-only guests today" card at the top of the Dashboard (Darlene 2026-10-26) =====
// Counts individual room-only bookings (Cloudbeds / Direct / OTA): in house tonight, arriving today, departing today, plus the next 7 days.
// A booking counts when start <= night < end. Cancelled, archived and not-yet-confirmed ('requested') bookings are left out. Guests = each booking's guest number (pax).
// Display only; nothing is saved. Wraps buildDashboard() and adds one card above its content.
(function () {
  const iso = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
  const rooms = b => (b.blockedRooms || []).length || 1;
  const live = b => b && b.bookingType === 'room_only' && !kind(b) && b.status !== 'cancelled' && b.status !== 'requested' && !(b.flags || []).includes('archived');
  const esc = s => String(s == null ? '' : s).replace(/&amp;/g, '&').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const D = b => [(b.startDate || '').slice(0, 10), (b.endDate || '').slice(0, 10)];
  function stats(ds) {
    const inh = [], arr = [], dep = [];
    (AppData.bookings || []).filter(live).forEach(b => {
      const [s, e] = D(b); if (!s || !e) return;
      if (s <= ds && ds < e) inh.push(b);
      if (s === ds) arr.push(b);
      if (e === ds) dep.push(b);
    });
    const g = a => a.reduce((n, b) => n + (Number(b.pax) || 0), 0), r = a => a.reduce((n, b) => n + rooms(b), 0);
    return { inh, arr, dep, gIn: g(inh), gArr: g(arr), gDep: g(dep), rIn: r(inh), rArr: r(arr), rDep: r(dep) };
  }
  // BBC / RNR (incl. WeTravel) groups: in house today or arriving in the next 14 days. Guests = pax, else registered guests; "?" when neither is known yet.
  const kind = b => { const t = (b.retreatName || '') + ' ' + (b.leaderName || ''); return /\bBBC\b|bikini\s*boot/i.test(t) ? 'BBC' : (/\bRNR\b|restore\s*(&|and)?\s*renew/i.test(t) ? 'RNR' : ''); };
  function groups(todayIso, endIso) {
    const m = {};
    (AppData.bookings || []).forEach(b => {
      const k = kind(b); if (!k || b.status === 'cancelled' || b.status === 'requested' || (b.flags || []).includes('archived')) return;
      const [s, e] = D(b); if (!s || !e || e < todayIso || s > endIso) return;
      const key = k + s + e, x = m[key] = m[key] || { k, s, e, n: 0, r: 0, res: 0, wt: false, now: s <= todayIso && todayIso < e };
      let n = Number(b.pax) || 0; if (!n) { try { n = menuHeadcount(b); } catch (q) {} }
      x.n += n; x.r += rooms(b); x.res++; x.wt = x.wt || b.source === 'wetravel';
    });
    return Object.values(m).sort((a, c) => a.s.localeCompare(c.s));
  }
  function groupsHtml(todayIso, endIso) {
    const g = groups(todayIso, endIso);
    const rows = g.length ? g.map(x => '<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-top:1px solid #efeae0;font-size:12.5px"><span><b style="color:' + (x.k === 'BBC' ? '#b45309' : '#6d28d9') + '">' + x.k + '</b>' + (x.wt ? ' · WeTravel' : '') + (x.now ? ' <span style="color:#15803d;font-weight:700">in house now</span>' : ' <span style="color:#4b5563">upcoming</span>') + '</span><span style="color:#4b5563;white-space:nowrap">' + x.s.slice(5) + ' → ' + x.e.slice(5) + ' · ' + x.res + ' booking' + (x.res === 1 ? '' : 's') + ' · ' + x.r + ' room' + (x.r === 1 ? '' : 's') + ' · ' + (x.n ? x.n + ' guest' + (x.n === 1 ? '' : 's') : 'guests not entered yet') + '</span></div>').join('')
      : '<div style="font-size:12.5px;color:#4b5563;padding:5px 0;border-top:1px solid #efeae0">No BBC or RNR groups in house or arriving in the next 14 days.</div>';
    return '<div style="margin-top:14px"><div style="font-size:13px;font-weight:800;color:#1f2d2d;margin-bottom:2px">BBC / RNR groups (incl. WeTravel)</div>' + rows + '</div>';
  }
  function card() {
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const t = stats(iso(today));
    const tile = (n, sub, label, bg) => '<div style="flex:1;min-width:130px;background:' + bg + ';border-radius:10px;padding:12px 14px"><div style="font-size:30px;font-weight:800;color:#1f2d2d;line-height:1">' + n + '</div><div style="font-size:12.5px;font-weight:700;color:#1f2d2d;margin-top:4px">' + label + '</div><div style="font-size:11.5px;color:#4b5563">' + sub + '</div></div>';
    const bk = (n, r) => (n === 1 ? '1 booking' : n + ' bookings') + ' · ' + (r === 1 ? '1 room' : r + ' rooms');
    let strip = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const s = stats(iso(d));
      strip += '<div style="flex:1;min-width:58px;text-align:center;padding:6px 2px;border-radius:8px;background:' + (i ? '#f6f3ec' : '#e0f2fe') + '"><div style="font-size:10.5px;font-weight:700;color:#4b5563">' + d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + d.getDate() + '</div><div style="font-size:18px;font-weight:800;color:#1f2d2d">' + s.gIn + '</div></div>';
    }
    const names = t.inh.slice().sort((a, b) => (a.leaderName || '').localeCompare(b.leaderName || '')).map(b => {
      const [s, e] = D(b), ds = iso(today);
      const tag = s === ds ? ' <span style="color:#15803d;font-weight:700">arrives today</span>' : (e === ds ? ' <span style="color:#b45309;font-weight:700">departs today</span>' : '');
      return '<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-top:1px solid #efeae0;font-size:12.5px"><span>' + esc(b.leaderName || b.retreatName || 'Guest') + tag + '</span><span style="color:#4b5563;white-space:nowrap">' + s.slice(5) + ' → ' + e.slice(5) + ' · ' + (Number(b.pax) || 0) + ' guest' + ((Number(b.pax) || 0) === 1 ? '' : 's') + ' · ' + (rooms(b) === 1 ? '1 room' : rooms(b) + ' rooms') + '</span></div>';
    }).join('');
    return '<div id="droCard" style="background:#fff;border-radius:14px;padding:16px 18px;margin-bottom:18px;box-shadow:0 1px 4px rgba(0,0,0,.06)">'
      + '<div style="font-size:15px;font-weight:800;color:#1f2d2d;margin-bottom:10px">🏨 Room-only guests today &amp; BBC / RNR</div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap">' + tile(t.gIn, bk(t.inh.length, t.rIn), 'Guests in house tonight', '#dcfce7') + tile(t.gArr, bk(t.arr.length, t.rArr), 'Guests arriving today', '#e0f2fe') + tile(t.gDep, bk(t.dep.length, t.rDep), 'Guests departing today', '#fef3c7') + '</div>'
      + '<div style="font-size:11.5px;font-weight:700;color:#4b5563;margin:12px 0 4px">Guests in house, next 7 days</div><div style="display:flex;gap:6px;flex-wrap:wrap">' + strip + '</div>'
      + (names ? '<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:#2d6a6a">Who is in house tonight</summary><div style="margin-top:6px">' + names + '</div></details>' : '')
      + groupsHtml(iso(today), iso(new Date(today.getTime() + 14 * 864e5)))
      + '<div style="font-size:11px;color:#6b7280;margin-top:8px">Individual room-only bookings (Cloudbeds, Direct, OTA). The room-only numbers above do not include retreat groups, BBC, RNR or WeTravel. Requested (unconfirmed) bookings are not counted.</div></div>';
  }
  function paint() {
    try {
      const el = document.getElementById('dbContent'); if (!el) return;
      const old = document.getElementById('droCard'); if (old) old.remove();
      el.insertAdjacentHTML('afterbegin', card());
    } catch (e) { console.warn('[dashboard-room-only]', e); }
  }
  const orig = window.buildDashboard;
  if (typeof orig === 'function') window.buildDashboard = function () { const r = orig.apply(this, arguments); paint(); return r; };
})();
