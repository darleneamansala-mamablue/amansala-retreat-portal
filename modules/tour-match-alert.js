// ===== tour-match-alert.js — red alert when groups on site together do not have their optional tours on the same day (Darlene 2026-10-27) =====
// Loaded as a classic script AFTER tour-one-at-a-time.js and shala-double-book-alert.js; shares global scope. Standalone and read-only: it never changes a schedule.
// Optional tours (Tulum Ruins, Muyil Float, Atik Cenote, Grande/Gran Cenote, Mangroves; copies counted as the same tour) are shared trips, so groups that are at Amansala at the same time
// should have each tour on the same day. This lists every tour where overlapping groups have it on DIFFERENT days: "Tulum Ruins: Wendy Oberg Wed Nov 4 · Heather Kasey Thu Nov 5 ...".
// A red chip "⚠ N tours not matching" shows bottom-left for the team (admin portal, or the preview-as-teacher on an admin device); click it for the list, click a group to open its schedule.
// A real teacher never sees it.
let tmaList = [];
function tmaTeam() { try { return (typeof IS_TEACHER_MODE === 'undefined' || !IS_TEACHER_MODE) || sessionStorage.getItem('ama_admin_viewing') === '1' || !!localStorage.getItem('ama_admin_device'); } catch (e) { return false; } }
const tmaEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const tmaDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
function tmaScan() {
  const out = [];
  try {
    if (typeof totIsTour !== 'function' || typeof totFamily !== 'function') return out;
    const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const bks = (AppData.bookings || []).filter(b => b.status !== 'cancelled' && b.bookingType !== 'room_only' && b.startDate && b.endDate && String(b.endDate) >= today && !/zzz|\btest\b/i.test((b.retreatName || '') + ' ' + (b.leaderName || '')));
    const byTour = {};
    bks.forEach(bk => (bk.retreatActivities || []).filter(a => a.date && a.date >= today && !a.prepaid && totIsTour(a.aoId)).forEach(a => {
      const fam = totFamily(a.aoId)[0]; (byTour[fam] = byTour[fam] || []).push({ bk, date: a.date, time: a.time });
    }));
    const overlap = (x, y) => x.startDate < y.endDate && y.startDate < x.endDate;
    Object.keys(byTour).forEach(fam => {
      const list = byTour[fam], parent = list.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
      // Two groups mismatch when their stays overlap, their tour days differ, and one group's tour day is a night the other group is also here (so the other could have joined that day).
      const here = (bk, d) => d >= bk.startDate && d < bk.endDate, flagged = new Set();
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const x = list[i], y = list[j];
        if (x.bk.id === y.bk.id || x.date === y.date || !overlap(x.bk, y.bk)) continue;
        if (here(y.bk, x.date) || here(x.bk, y.date)) { parent[find(i)] = find(j); flagged.add(i); flagged.add(j); }
      }
      const clusters = {}; list.forEach((e, i) => { if (flagged.has(i)) (clusters[find(i)] = clusters[find(i)] || []).push(e); });
      Object.values(clusters).forEach(c => {
        const ids = new Set(c.map(e => e.bk.id));
        if (ids.size < 2 || new Set(c.map(e => e.date)).size < 2) return;
        out.push({ fam, entries: c.sort((a, b) => a.date.localeCompare(b.date)) });
      });
    });
  } catch (e) { console.warn('[tour-match-alert]', e); }
  return out.sort((a, b) => a.entries[0].date.localeCompare(b.entries[0].date));
}
function tmaChip() {
  let chip = document.getElementById('tmaChip');
  if (!chip) { chip = document.createElement('button'); chip.id = 'tmaChip'; chip.onclick = tmaShow; chip.style.cssText = 'position:fixed;left:14px;bottom:108px;z-index:99988;display:none;padding:8px 14px;border-radius:99px;border:2px solid #fdba74;background:#fff7ed;color:#c2410c;font:700 13px Jost,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18)'; document.body.appendChild(chip); }
  return chip;
}
function tmaTick() {
  try {
    if (!document.body) return;
    const chip = tmaChip();
    if (!tmaTeam()) { chip.style.display = 'none'; return; }
    tmaList = tmaScan();
    chip.style.display = tmaList.length ? 'block' : 'none';
    chip.textContent = `⚠ ${tmaList.length} tour${tmaList.length !== 1 ? 's' : ''} not matching`;
  } catch (e) {}
}
function tmaOpen(bkId) { const m = document.getElementById('tmaModal'); if (m) m.style.display = 'none'; try { openScheduleViewer(bkId); } catch (e) { if (m) m.style.display = 'flex'; } }
function tmaShow() {
  tmaList = tmaScan();
  let m = document.getElementById('tmaModal');
  if (!m) { m = document.createElement('div'); m.id = 'tmaModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Jost,sans-serif'; document.body.appendChild(m); }
  m.style.display = 'flex';
  const name = fam => { try { return totName(fam); } catch (e) { return fam; } };
  m.innerHTML = `<div style="background:#f5f1eb;border-radius:16px;max-width:680px;width:100%;max-height:90vh;overflow:auto;padding:20px 24px;box-shadow:0 12px 40px rgba(0,0,0,.3)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:#c2410c">⚠ Tours not matching</div><button onclick="document.getElementById('tmaModal').style.display='none'" style="border:none;background:none;font-size:22px;cursor:pointer">✕</button></div>
    <div style="font-size:12.5px;color:#6b7280;margin-bottom:12px">Groups that are at Amansala at the same time but have the same optional tour on different days. Click a group to open its schedule and change the day.</div>
    ${tmaList.length ? tmaList.map(c => `<div style="background:#fff;border:1.5px solid #fed7aa;border-radius:12px;padding:10px 14px;margin-bottom:10px"><div style="font-weight:800;margin-bottom:4px">${tmaEsc(name(c.fam))}</div>
      ${c.entries.map(e => `<div onclick="tmaOpen('${String(e.bk.id).replace(/'/g, '')}')" title="Open this group's schedule" style="font-size:13px;padding:5px 8px;margin-top:3px;border-radius:8px;cursor:pointer;background:#fff7ed;display:flex;justify-content:space-between;gap:10px"><span><b>${tmaEsc(e.bk.leaderName || e.bk.retreatName)}</b> <span style="color:#6b7280">${tmaEsc(tmaDay(e.bk.startDate))} – ${tmaEsc(tmaDay(e.bk.endDate))}</span></span><b>${tmaEsc(tmaDay(e.date))}</b></div>`).join('')}</div>`).join('') : '<div style="color:#059669;font-weight:700">All optional tours match. ✓</div>'}</div>`;
}
setInterval(tmaTick, 60000); setTimeout(tmaTick, 7000);
