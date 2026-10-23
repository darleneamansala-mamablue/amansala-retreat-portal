// ===== checkout-balances.js — Who is checking out, and who still owes =====
// Loaded as a classic script AFTER double-charges.js; shares global scope. Standalone: adds a "Checkout Balances" tab to the sidebar (same opener
// pattern as double-charges.js). Read-only: it only reads folios/folio_items and the registrations already loaded in AppData.
// For the chosen window (checking out today / tomorrow / next 3 days / staying now) it lists every registered guest with their bill: Paid in full
// (balance $0), Owes money, Overpaid (credit), or No bill yet. A bill is every folio on the registration: sum of qty x price plus its tax rate,
// payments being negative lines (the same sum guest-pay.html charges). Registrations of retreats and groups only; not individual booking requests.
// Asked by Darlene 2026-10-22.
let cbState = { window: 'today', filter: 'all', rows: [], loading: false, loadedAt: 0, error: '' };

const cbEsc = s => String(s == null ? '' : s).replace(/&amp;/g, '&').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cbMoney = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cbToday = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);   // Tulum is UTC-5 all year
const cbAddDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);

function cbRange() {
  const t = cbToday();
  return { today: [t, t], tomorrow: [cbAddDays(t, 1), cbAddDays(t, 1)], next3: [t, cbAddDays(t, 3)], staying: null }[cbState.window];
}

async function cbFetchIn(table, col, ids, select) {
  const out = [];
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await db.from(table).select(select).in(col, chunk).order('id').range(from, from + 999);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}

async function cbScan() {
  const today = cbToday(), range = cbRange(), bks = {};
  (AppData.bookings || []).forEach(b => { bks[b.id] = b; });
  const regs = (AppData.regs || []).filter(r => {
    const b = bks[r.bookingId] || {};
    if (b.status === 'cancelled' || r.cancelled) return false;
    const ci = r.checkIn || b.startDate, co = r.checkOut || b.endDate;
    if (!ci || !co) return false;
    return range ? (co >= range[0] && co <= range[1]) : (ci <= today && co >= today);
  });
  const ids = regs.map(r => r.id);
  const folios = ids.length ? await cbFetchIn('folios', 'registration_id', ids, 'id,registration_id,guest_name') : [];
  const items = folios.length ? await cbFetchIn('folio_items', 'folio_id', folios.map(f => f.id), 'id,folio_id,qty,unit_price,tax_rate') : [];
  const bal = {}; items.forEach(i => { bal[i.folio_id] = (bal[i.folio_id] || 0) + (Number(i.qty) || 1) * (Number(i.unit_price) || 0) * (1 + (Number(i.tax_rate) || 0) / 100); });
  const byReg = {}; folios.forEach(f => { (byReg[f.registration_id] = byReg[f.registration_id] || []).push(f); });
  return regs.map(r => {
    const b = bks[r.bookingId] || {}, fs = byReg[r.id] || [], total = Math.round(fs.reduce((s, f) => s + (bal[f.id] || 0), 0) * 100) / 100;
    const guest = (fs[0] && fs[0].guest_name) || ((r.guests || []).find(g => g.name) || {}).name || '';
    const status = !fs.length ? 'nobill' : Math.abs(total) < 0.5 ? 'zero' : total > 0 ? 'owes' : 'credit';
    return { regId: r.id, room: r.room || '—', guest: guest.replace(/&amp;/g, '&'), retreat: b.retreatName || b.leaderName || '', checkOut: r.checkOut || b.endDate, balance: total, status, checkedOut: !!r.checkedOutAt };
  }).sort((a, b) => String(a.checkOut).localeCompare(String(b.checkOut)) || String(a.room).localeCompare(String(b.room), undefined, { numeric: true }));
}

async function cbRefresh() {
  if (cbState.loading) return;
  cbState.loading = true; cbState.error = ''; cbRender();
  try { cbState.rows = await cbScan(); cbState.loadedAt = Date.now(); } catch (e) { cbState.error = e.message || String(e); }
  cbState.loading = false; cbRender();
}

const CB_LABEL = { zero: ['Paid in full', '#059669', '#d1fae5'], owes: ['Owes money', '#b91c1c', '#fee2e2'], credit: ['Overpaid', '#92400e', '#fef3c7'], nobill: ['No bill yet', '#4b5563', '#e5e7eb'] };

function cbRender() {
  const el = document.getElementById('cbContent'); if (!el) return;
  const rows = cbState.rows, count = s => rows.filter(r => r.status === s).length, show = rows.filter(r => cbState.filter === 'all' || r.status === cbState.filter);
  const owed = rows.filter(r => r.status === 'owes').reduce((s, r) => s + r.balance, 0);
  const btn = 'padding:6px 12px;border:1.5px solid #c8bfb5;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;font-size:12.5px';
  const chip = (k, label, n) => `<button onclick="cbState.filter='${k}';cbRender()" style="${btn};${cbState.filter === k ? 'background:#2d6a6a;color:#fff;border-color:#2d6a6a' : ''}">${label} · ${n}</button>`;
  const winLabel = { today: 'checking out today', tomorrow: 'checking out tomorrow', next3: 'checking out in the next 3 days', staying: 'staying in the house today' }[cbState.window];
  el.innerHTML = `<div style="max-width:1150px;margin:0 auto;font-family:'Jost',sans-serif;color:#2d2520;text-align:left">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div><div style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600">Checkout Balances</div>
        <div style="font-size:12.5px;color:#6b7280">Every guest ${winLabel}, with what their bill shows. Retreat and group guests only.</div></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select onchange="cbState.window=this.value;cbRefresh()" style="${btn}">${[['today', 'Checking out today'], ['tomorrow', 'Checking out tomorrow'], ['next3', 'Checking out in 3 days'], ['staying', 'Staying now']].map(([v, l]) => `<option value="${v}"${cbState.window === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <button onclick="cbRefresh()" style="${btn}">${cbState.loading ? 'Checking…' : '↻ Refresh'}</button>
        <button onclick="cbDownload()" style="${btn}">⬇ Excel</button>
      </div></div>
    ${cbState.error ? `<div style="margin-top:12px;padding:12px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:12.5px">Could not read the bills: ${cbEsc(cbState.error)}</div>` : ''}
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">${chip('all', 'All', rows.length)}${chip('zero', 'Paid in full', count('zero'))}${chip('owes', 'Owes money', count('owes'))}${chip('credit', 'Overpaid', count('credit'))}${chip('nobill', 'No bill yet', count('nobill'))}</div>
    <div style="margin-top:10px;font-size:13px;font-weight:700">${cbState.loadedAt ? `${rows.length} guest${rows.length !== 1 ? 's' : ''} ${winLabel} · <span style="color:#b91c1c">${cbMoney(owed)} still owed</span>` : 'Checking…'}</div>
    <div style="margin-top:10px;background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;overflow:hidden"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#f5f1eb;text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280"><th style="padding:9px 12px">Check-out</th><th style="padding:9px 12px">Room</th><th style="padding:9px 12px">Guest</th><th style="padding:9px 12px">Retreat</th><th style="padding:9px 12px;text-align:right">Balance</th><th style="padding:9px 12px">Status</th><th></th></tr>
      ${show.map(r => { const [lab, fg, bg] = CB_LABEL[r.status]; return `<tr style="border-top:1px solid #f0ebe0"><td style="padding:8px 12px;white-space:nowrap">${cbEsc(r.checkOut)}${r.checkedOut ? ' <span style="font-size:11px;color:#059669">✓ out</span>' : ''}</td><td style="padding:8px 12px">${cbEsc(r.room)}</td><td style="padding:8px 12px"><b>${cbEsc(r.guest || '—')}</b></td><td style="padding:8px 12px;color:#6b7280">${cbEsc(r.retreat)}</td><td style="padding:8px 12px;text-align:right;font-weight:700">${r.status === 'nobill' ? '—' : cbMoney(r.balance)}</td><td style="padding:8px 12px"><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;color:${fg};background:${bg}">${lab}</span></td><td style="padding:8px 12px;text-align:right"><button onclick="openBookingDetailForReg('${cbEsc(r.regId)}','${cbEsc(r.guest).replace(/'/g, "\\'")}')" style="${btn}">Open</button></td></tr>`; }).join('') || `<tr><td colspan="7" style="padding:18px;text-align:center;color:#9ca3af">${cbState.loadedAt ? 'Nobody in this list.' : ''}</td></tr>`}
    </table></div></div>`;
}

function cbDownload() {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [['Check-out', 'Room', 'Guest', 'Retreat', 'Balance', 'Status'].join(',')].concat(cbState.rows.filter(r => cbState.filter === 'all' || r.status === cbState.filter).map(r => [r.checkOut, r.room, r.guest, r.retreat, r.status === 'nobill' ? '' : r.balance, CB_LABEL[r.status][0]].map(q).join(',')));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' })); a.download = `checkout-balances-${cbToday()}.csv`; a.click();
}

function cbOpen(btn) {
  const prev = localStorage.getItem('ama_last_tab');
  switchTab('checkoutbalances', btn);
  try { localStorage.setItem('ama_last_tab', prev || 'dashboard'); } catch (e) {}
  cbRender(); cbRefresh();
}

(function () {
  const side = document.getElementById('staffSideBtn'), after = document.getElementById('tab-doublecharges');
  if (!side || !after || document.getElementById('tab-checkoutbalances')) return;
  const panel = document.createElement('div');
  panel.className = 'tab-panel'; panel.id = 'tab-checkoutbalances'; panel.style.flexDirection = 'column';
  panel.innerHTML = '<div id="cbContent" style="flex:1;overflow:auto;padding:28px 36px;background:#f5f1eb"></div>';
  after.parentNode.insertBefore(panel, after.nextSibling);
  const b = document.createElement('button');
  b.className = 'tab-btn tab-btn-sub'; b.id = 'checkoutbalancesTabBtn'; b.setAttribute('onclick', 'cbOpen(this)'); b.style.color = '#0d9488';
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 15 11 17 15 13"/></svg> Checkout Balances';
  side.parentNode.insertBefore(b, side);
})();
