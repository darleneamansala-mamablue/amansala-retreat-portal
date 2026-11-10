// ===== spa-activity-blocks.js — a therapist who is teaching or guiding is blocked in the spa (Darlene 2026-11-10) =====
// Loaded as a classic script AFTER spa-time-blocks.js and spa-booked-by.js; shares global scope. Nothing in the spa files is edited.
// "She should not be able to be booked for an aura reading while she has a Mayan Clay; tours should show up as the therapist being blocked."
// Whenever a therapist's name is on something else, the same grey "Blocked" box the spa calendar already uses (app_store spa_time_blocks, which the public booking page also treats as taken) appears for that time:
//   - a Bikini Bootcamp line (class, Mayan Clay, workshop...) where she is the instructor or co-host (confirmed schedules; evening times read as PM)
//   - a tour or ceremony (Activities page) where she is Guide 1, Guide 2, Driver or Driver 2: from the tour's start for its length (default 4 hours when no time is set)
// These blocks carry auto:true and an id built from what they come from, so the list is re-made from the schedules every few minutes: a change on the schedule moves or removes the block, and a block removed
// by hand comes back while the schedule still has her on it. Hand-made blocks are never touched. Names are matched on the therapist's first name (or full name); a first name shared by two therapists is skipped.
(function () {
  const DAYS = 30, EVERY = 3 * 60 * 1000, DEFAULT_TOUR_MIN = 240;
  const pad = n => String(n).padStart(2, '0'), toHHMM = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60), toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h).toString(36); };

  function therapistIndex() {
    const first = {}, full = {};
    ((typeof SpaData !== 'undefined' && SpaData.therapists) || []).filter(t => t.active !== false).forEach(t => {
      const f = String(t.firstName || '').trim().toLowerCase(); if (!f) return;
      first[f] = first[f] === undefined ? t.id : null;
      full[(f + ' ' + String(t.lastName || '').trim().toLowerCase()).trim()] = t.id;
    });
    return n => { const k = String(n || '').trim().toLowerCase(); return k ? (full[k] || first[k] || first[k.split(/\s+/)[0]] || null) : null; };
  }
  function desired(from, to) {
    const who = therapistIndex(), out = new Map();
    const add = (thId, date, start, end, why, src) => {
      if (!thId || !date || date < from || date > to || end <= start) return;
      const id = 'auto_' + thId + '_' + date + '_' + start.replace(':', '') + '_' + hash(src);
      out.set(id, { id, therapistId: thId, date, start, end, allDay: false, reason: why, auto: true, by: 'schedule', at: new Date().toISOString() });
    };
    // Bikini Bootcamp lines
    (typeof bbcSchedules !== 'undefined' ? bbcSchedules : []).forEach(s => {
      if (s.status !== 'confirmed') return;
      (s.days || []).forEach(d => (d.slots || []).forEach(slot => {
        if (slot.type === 'meal') return;
        const r = typeof bbcSlotTimeRange === 'function' ? bbcSlotTimeRange(slot.time, 45) : null; if (!r) return;
        let a = toMin(r.start), b = toMin(r.end);
        if (slot.pm && a >= 7 * 60 && a < 12 * 60) { a += 720; b += 720; }
        const names = [slot.instructor].concat(String(slot.coHost || '').split(',')).map(x => String(x || '').trim()).filter(Boolean);
        const isTour = typeof BBC_TOUR_NAMES !== 'undefined' && BBC_TOUR_NAMES.has(slot.activity);
        if (isTour) return;   // the guides and drivers of a tour come from the Activities page below
        names.forEach(n => add(who(n), d.date, toHHMM(a), toHHMM(b), (slot.activity || 'Class') + ' (Bikini Bootcamp)', s.id + slot.id));
      }));
    });
    // Tours and ceremonies with people assigned
    const ops = typeof actOpsData !== 'undefined' ? actOpsData : {};
    Object.keys(ops).forEach(key => {
      const [aoId, date] = key.split('|'), o = ops[key] || {};
      if (!aoId || !date || o.status === 'cancelled') return;
      const names = [o.guide1, o.guide2, o.driver, o.driver2].filter(Boolean); if (!names.length) return;
      let time = '', dur = 0;
      try { (AppData.bookings || []).some(bk => (bk.retreatActivities || []).some(a => { if (a.aoId === aoId && String(a.date || '').slice(0, 10) === date && a.time) { time = a.time; return true; } return false; })); } catch (e) {}
      try { const ao = (typeof ADD_ONS !== 'undefined' ? ADD_ONS : []).find(x => x.id === aoId); dur = (ao && ao.dur) || 0; } catch (e) {}
      const name = (() => { try { return ((typeof ADD_ONS !== 'undefined' ? ADD_ONS : []).find(x => x.id === aoId) || {}).name || aoId; } catch (e) { return aoId; } })();
      const a = time ? toMin(time) : 10 * 60, b = a + (dur || DEFAULT_TOUR_MIN);
      names.forEach(n => add(who(n), date, toHHMM(a), toHHMM(Math.min(b, 23 * 60 + 59)), name, key));
    });
    return out;
  }
  let running = false;
  async function sync() {
    if (running) return; running = true;
    try {
      if (typeof spaBlkSave !== 'function' || typeof SpaData === 'undefined' || !(SpaData.therapists || []).length || !document.getElementById('spaApptModal')) return;
      const from = iso(new Date()), to = iso(new Date(Date.now() + DAYS * 86400000)), want = desired(from, to);
      if (typeof spaBlkLoad === 'function') await spaBlkLoad();
      const have = (SpaBlocks || []).filter(b => b.auto && b.date >= from && b.date <= to);
      const haveIds = new Set(have.map(b => b.id));
      // a block is only taken away when both schedules are loaded, so a slow load can never wipe the list
      const loaded = typeof bbcSchedules !== 'undefined' && bbcSchedules.length > 0 && typeof actOpsData !== 'undefined' && Object.keys(actOpsData).length > 0;
      const stale = loaded ? have.filter(b => !want.has(b.id)) : [], fresh = [...want.values()].filter(b => !haveIds.has(b.id));
      if (!stale.length && !fresh.length) return;
      const staleIds = new Set(stale.map(b => b.id));
      const ok = await spaBlkSave(list => list.filter(b => !staleIds.has(b.id)).concat(fresh.filter(f => !list.some(b => b.id === f.id))));
      if (ok && typeof spaCalRender === 'function' && document.getElementById('tab-spa') && document.getElementById('tab-spa').classList.contains('active')) { try { spaCalRender(); } catch (e) {} }
    } catch (e) { console.warn('[spa-activity-blocks]', e); }
    finally { running = false; }
  }
  window.spaActivityBlocksSync = sync;
  let timer = null; const soon = () => { clearTimeout(timer); timer = setTimeout(sync, 4000); };
  ['bbcSaveData', 'actOpsSave'].forEach(n => { const fn = window[n]; if (typeof fn === 'function') window[n] = function () { const r = fn.apply(this, arguments); soon(); return r; }; });
  setTimeout(sync, 15000); setInterval(sync, EVERY);
})();
