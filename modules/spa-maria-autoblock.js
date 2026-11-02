// ===== spa-maria-autoblock.js — Maria Luisa is blocked automatically when she has too many services =====
// Loaded as a classic script AFTER spa-time-blocks.js; shares global scope. Standalone: after the spa calendar draws, it looks at Maria Luisa's
// services for today and later and keeps "Auto" rows in app_store spa_time_blocks (the same blocks as the Block time button, so the calendar shows them and the guest
// booking page never offers those hours):
//   - she has her daily maximum (Auto-Assign setting, default 4): blocked from the end of her last service to the end of the day
//   - she has her first stage of services (default 2): blocked for the break after them (default 45 min), when nothing is booked in that window yet
// Rows have id 'auto_<therapistId>_<date>_cap|brk' and by 'Auto'; they are added and removed as her services change. Other therapists and hand-made blocks are untouched.
// Asked by Darlene 2026-11-02: "When she gets a lot of services the system should automatically block her".
(function () {
  if (typeof spaBlkSave !== 'function' || typeof window.spaCalRender !== 'function') return;
  const origRender = window.spaCalRender;
  let timer = null, busy = false;
  const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const isMaria = t => { const n = ((typeof sraRot !== 'undefined' && sraRot.mariaName) || 'Maria Luisa').trim().toLowerCase(); return !!t && ((t.firstName || '').trim().toLowerCase() === n || `${(t.firstName || '').trim()} ${(t.lastName || '').trim()}`.trim().toLowerCase() === n); };
  const today = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);   // Tulum date (UTC-5, close enough for a date boundary)

  function wanted() {
    const t = (SpaData.therapists || []).find(isMaria); if (!t || !Array.isArray(SpaAppointments)) return null;
    const R = typeof sraRot !== 'undefined' ? sraRot : {}, cap = parseInt(R.mariaDailyCap, 10) || 4, stage = parseInt(R.mariaStageSize, 10) || 2, brk = parseInt(R.mariaBreakMinutes, 10) || 45;
    const byDate = {};
    SpaAppointments.filter(a => a.therapistId === t.id && a.status !== 'CANCELLED' && a.date >= today()).forEach(a => (byDate[a.date] = byDate[a.date] || []).push(a));
    const out = [];
    Object.keys(byDate).forEach(date => {
      const L = byDate[date].sort((a, b) => blkMin(a.start) - blkMin(b.start)), end = a => blkMin(a.start) + (a.duration || 60);
      const mk = (kind, s, e, reason) => out.push({ id: `auto_${t.id}_${date}_${kind}`, therapistId: t.id, date, start: hm(s), end: hm(e), allDay: false, reason, by: 'Auto' });
      if (L.length >= stage) {
        const s = Math.max(...L.slice(0, stage).map(end)), e = s + brk;
        if (!L.slice(stage).some(a => blkMin(a.start) < e && end(a) > s)) mk('brk', s, e, `Auto: ${brk}-minute break`);
      }
      if (L.length >= cap) { const s = Math.max(...L.map(end)); if (s < 22 * 60) mk('cap', s, 22 * 60, `Auto: ${cap} services reached`); }
    });
    return { id: t.id, from: today(), rows: out };
  }

  async function sync() {
    if (busy) return; busy = true;
    try {
      const w = wanted(); if (!w) return;
      const sig = rows => rows.map(r => `${r.id}|${r.start}|${r.end}`).sort().join(';');
      const mine = b => b.by === 'Auto' && String(b.id).startsWith('auto_' + w.id + '_') && b.date >= w.from;
      if (sig(SpaBlocks.filter(mine)) === sig(w.rows)) return;
      await spaBlkSave(list => list.filter(b => !mine(b)).concat(w.rows.map(r => ({ ...r, at: new Date().toISOString() }))));
      try { origRender.apply(window, []); } catch (e) {}
    } catch (e) { /* the calendar must keep working if this fails */ } finally { busy = false; }
  }

  window.spaCalRender = function () {
    const out = origRender.apply(this, arguments);
    if (typeof spaBlkLoaded !== 'undefined' && spaBlkLoaded) { clearTimeout(timer); timer = setTimeout(sync, 1500); }
    return out;
  };
})();
