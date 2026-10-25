// ===== shala-double-book-alert.js — red alert whenever two retreats hold the same shala at overlapping times =====
// Loaded as a classic script AFTER teacher-portal.js (and fire-pit-schedule.js); shares global scope. Standalone, read-only. shala-guard.js only checks each retreat's own request
// (morning / afternoon / arrival / departure picks). It never saw the DAY-BY-DAY classes (bk.scheduleTimeOverrides, e.g. Melissa Masella's Kick Fit in Grande 8:00-9:15 on top of Patricia
// Martel's Hatha class in Grande), so those could be double-booked without a word. This checks what the Schedule grid actually draws: for each of the next 21 days it takes the
// retreat events (skedGetRetreatEvents), and any two events from DIFFERENT retreats in the same shala whose times overlap are reported. A red chip "⚠ N shala double-bookings" shows at the
// bottom-left for the team (admin portal, or the preview-as-teacher on an admin device); click it for the list. A real teacher never sees it. Asked by Darlene 2026-10-24.
const SDB_DAYS = 21;
let sdbList = [];

function sdbTeam() { try { return (typeof IS_TEACHER_MODE === 'undefined' || !IS_TEACHER_MODE) || sessionStorage.getItem('ama_admin_viewing') === '1' || !!localStorage.getItem('ama_admin_device'); } catch (e) { return false; } }
const sdbMin = t => { if (!t || String(t).indexOf(':') < 0) return null; const [h, m] = String(t).split(':').map(Number); return isNaN(h) || isNaN(m) ? null : h * 60 + m; };
const sdbFmt = t => { const m = sdbMin(t); if (m == null) return '?'; const h = Math.floor(m / 60); return ((h % 12) || 12) + ':' + String(m % 60).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM'); };
const sdbName = id => { try { return (SKED_SHALAS.find(s => s.id === id) || {}).name || id; } catch (e) { return id; } };

function sdbScan() {
  const out = [];
  try {
    if (typeof skedGetRetreatEvents !== 'function' || typeof SKED_SHALAS === 'undefined') return out;
    const shalaIds = new Set(SKED_SHALAS.map(s => s.id));
    const t0 = Date.now() - 5 * 3600000;
    for (let i = 0; i < SDB_DAYS; i++) {
      const date = new Date(t0 + i * 86400000).toISOString().slice(0, 10);
      const evs = skedGetRetreatEvents(date).filter(e => e.isRetreat && shalaIds.has(e.resourceId) && e.bkId && sdbMin(e.startTime) != null && sdbMin(e.endTime) != null);
      for (let a = 0; a < evs.length; a++) for (let b = a + 1; b < evs.length; b++) {
        const x = evs[a], y = evs[b];
        if (x.resourceId !== y.resourceId || x.bkId === y.bkId) continue;
        if (sdbMin(x.startTime) < sdbMin(y.endTime) && sdbMin(y.startTime) < sdbMin(x.endTime)) out.push({ date, shala: x.resourceId, a: x, b: y });
      }
    }
  } catch (e) { console.warn('[shala-double-book-alert]', e); }
  return out;
}
const sdbWho = e => String(e.title || 'Retreat').replace(/</g, '&lt;') + (e.subtitle ? ' — ' + String(e.subtitle).split(' · ')[0].replace(/</g, '&lt;') : '');
const sdbDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

function sdbChip() {
  let chip = document.getElementById('sdbChip');
  if (!chip) { chip = document.createElement('button'); chip.id = 'sdbChip'; chip.onclick = sdbShow; chip.style.cssText = 'position:fixed;left:14px;bottom:62px;z-index:99989;display:none;padding:8px 14px;border-radius:99px;border:2px solid #fca5a5;background:#fef2f2;color:#b91c1c;font-weight:800;font-size:12.5px;cursor:pointer;font-family:Jost,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25)'; document.body.appendChild(chip); }
  return chip;
}
function sdbTick() {
  try {
    if (!document.body) return;
    const chip = sdbChip();
    if (!sdbTeam()) { chip.style.display = 'none'; return; }
    sdbList = sdbScan();
    chip.style.display = sdbList.length ? 'block' : 'none';
    chip.textContent = `⚠ ${sdbList.length} shala double-booking${sdbList.length !== 1 ? 's' : ''}`;
  } catch (e) {}
}
function sdbShow() {
  sdbList = sdbScan();
  let m = document.getElementById('sdbModal');
  if (!m) { m = document.createElement('div'); m.id = 'sdbModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Jost,sans-serif'; document.body.appendChild(m); }
  m.style.display = 'flex';
  m.innerHTML = `<div style="background:#f5f1eb;border-radius:16px;max-width:680px;width:100%;max-height:90vh;overflow:auto;padding:20px 24px;box-shadow:0 12px 40px rgba(0,0,0,.3)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:#b91c1c">⚠ Shala double-bookings</div><button onclick="document.getElementById('sdbModal').style.display='none'" style="border:none;background:none;font-size:22px;cursor:pointer;color:#6b7280">✕</button></div>
    <div style="font-size:12.5px;color:#6b7280;margin-bottom:12px">Next ${SDB_DAYS} days, from what the Schedule shows. Change one of each pair (move the time or the shala) to clear it.</div>
    ${sdbList.length ? sdbList.map(c => `<div style="background:#fff;border:1.5px solid #fecaca;border-radius:12px;padding:10px 14px;margin-bottom:10px"><div style="font-weight:800">${sdbName(c.shala)} · ${sdbDay(c.date)}</div>
      <div style="font-size:13px;margin-top:4px">${sdbWho(c.a)} <b>${sdbFmt(c.a.startTime)}–${sdbFmt(c.a.endTime)}</b></div><div style="font-size:13px">${sdbWho(c.b)} <b>${sdbFmt(c.b.startTime)}–${sdbFmt(c.b.endTime)}</b></div></div>`).join('') : '<div style="color:#059669;font-weight:700">No double-bookings in the next 21 days. ✓</div>'}</div>`;
}
setInterval(sdbTick, 60000); setTimeout(sdbTick, 6000);
