'use strict';

// shala-briefing-lib.js — the WhatsApp shala schedule and tours/activities list (Jorge 2026-11-09/10).
//   1:00 PM Tulum: today's classes and activities from 4:00 PM on ("NOV 10 - PM")
//   9:00 PM Tulum: tomorrow's classes and activities before 4:00 PM ("NOV 11 - AM")
// One line per class, earliest first, with an icon for the shala / kind of activity:
//   "7:00–7:15 · 🧘 CHICA · Grand Rising — Meditation w/ Tara (BBC)"
//   "11:45–1:15 · 🚐 TOUR · Mangroves (Korina Vaynter, De la Sol) guide Yolanda"
// The retreat part is a server copy of the Schedule tab's skedGetRetreatEvents (modules/teacher-portal.js) with the wrappers
// that change it (extra-class.js, ice-bath-shala.js, fire-pit-schedule.js, schedule-no-arrival-morning.js); BBC comes from
// app_store bbc_schedules (confirmed only), like skedGetBbcEvents + bbc-workshops-cohosts.js. buildBriefing is pure (data in,
// lines out) so it can be checked against the portal's own calendar.
// Sent with the approved Visito templates amansala_shala_by_time_v2 (14 lines) and amansala_activity_by_time_v2 (10 lines).

const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const VISITO_SEND = 'https://platform-api.visitoai.com/m2m/v1/whatsapp-templates/6abd2154f6a6b5cd69232824/send';
const TPL_SHALA = 'amansala_shala_by_time_v2', TPL_ACTS = 'amansala_activity_by_time_v2';
const SHALA_LINES = 14, ACT_LINES = 10, BLANK = '⠀';   // Meta refuses an empty parameter: an unused line gets an invisible character
const NUMBERS_KEY = 'shala_briefing_numbers';

const SHALAS = { grande: 'Grande', casa_grande_living: 'Casa Grande Living Room', chica: 'Chica', chica_rooftop: 'Chica Rooftop', chica_lobby: 'Chica Lobby',
  beachfront: 'Beachfront', heaven: 'Heaven Shala', skye: 'Skye', shanti_living: 'Shanti Living Room' };
const ICON = { grande: '🧘 GRANDE', chica: '🧘 CHICA', beachfront: '🌊 BEACHFRONT', heaven: '☁️ HEAVEN', skye: '🌿 SKYE' };
const SUNRISE_LOC = { chica_beach: 'Chica Beach', grande_beach: 'Grande Beach', chica_rooftop: 'Chica Rooftop' };
const BBC_LOC = { beachfront: 'beachfront', grande: 'grande', heaven: 'heaven', chica: 'chica', skye: 'skye', 'meet on the beach': 'beachfront' };
const BBC_TOURS = new Set(['Tulum Ruins', 'Grande Cenote Tour', 'Mangroves Tour', 'Atik Cenote Tour', 'Muyil Float Tour', 'Excursion']);

const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const toTime = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const fmt = t => { const [h, m] = String(t).split(':').map(Number); return (h % 12 || 12) + ':' + String(m).padStart(2, '0'); };
const titleCase = s => String(s || '').replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
const cap = s => { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
const kindOf = n => /tour|ruins|cenote|mangrove|muyil|atik|excursion/i.test(n) ? '🚐 TOUR' : /temazcal|cacao|clay|ice ?bath|breath|ceremon|sound healing/i.test(n) ? '🔥 CEREMONY' : '✨ ACTIVITY';

function effLabel(sr, period, fallback) {
  const ov = (sr && sr.adminOverride) || {};
  const label = String(ov[period + 'Label'] || (sr && sr[period + 'Label']) || '').trim(), co = String(ov[period + 'CoTeacher'] || (sr && sr[period + 'CoTeacher']) || '').trim();
  return (label ? titleCase(label) : fallback) + (co ? ' — with ' + co : '');
}
function effLabelDay(sr, bk, ds, ovPeriod, key, fallback) {
  const o = (bk.schedule_time_overrides || []).find(x => x.date === ds && x.period === ovPeriod);
  if (o && o.label) return titleCase(o.label) + (o.coTeacher ? ' — with ' + o.coTeacher : '');
  return effLabel(sr, key, fallback);
}
function usualMorning(bk) {
  const ovs = bk.schedule_time_overrides || [];
  const o = ovs.find(x => x.period === 'morn' && x.start) || ovs.find(x => x.period === 'morn');
  return o ? { start: o.start, dur: o.dur || 60 } : { start: '', dur: 60 };
}

// The retreats' classes (shala events) and activities for one date — same rules as the Schedule tab
function retreatEvents(d, ds) {
  const out = [], name = bk => bk.leader_name || bk.retreat_name || 'Retreat';
  const confirmed = (d.bookings || []).filter(b => b.status !== 'cancelled' && b.schedule_request && b.schedule_request.adminStatus === 'confirmed');
  const opt = {};   // optional / prepaid activities of several retreats at the same time are one line
  const guideOf = (aoId, date) => {
    const o = (d.actOps || {})[aoId + '|' + date] || {};
    if (aoId === 'ao5') return [o.shaman ? 'shaman ' + o.shaman : '', o.fireKeeper ? 'fire keeper ' + o.fireKeeper : ''].filter(Boolean).join(', ');
    const g = []; [o.leader, o.guide1, o.guide2, o.guide3].filter(Boolean).map(cap).forEach(n => { if (!g.some(x => x.toLowerCase() === n.toLowerCase())) g.push(n); });
    return g.length ? (g.length > 1 ? 'guides ' : 'guide ') + g.join(' & ') : '';
  };
  confirmed.forEach(bk => {
    if (ds < bk.start_date || ds > bk.end_date) return;
    const sr = bk.schedule_request, ov = sr.adminOverride || {}, title = name(bk), skips = bk.schedule_skips || [], ovs = bk.schedule_time_overrides || [];
    const um = usualMorning(bk);
    const mStart = ov.morningStart || um.start, mDur = ov.morningDur || um.dur || 90, mShala = ov.morningShala1 || sr.morningShala1;
    const aSlot = ov.afternoonStart || sr.afternoonSlot || sr.afternoonStart, aDur = ov.afternoonDur || sr.afternoonDur || 75;
    const aShala = ov.afternoonShala1 || sr.afternoonShala1 || sr.morningShala1;
    const music = (Array.isArray(sr.music) ? sr.music : [sr.music]).includes('system') ? ' 🎵' : '';
    const mornSkipped = skips.some(s => s.date === ds && s.period === 'morn');
    const cls = (shala, start, end, what) => out.push({ type: 'class', shala, start, end, what, who: title });
    if (ds === bk.start_date) {
      const leader = (d.ocLeaders || {})[bk.id] || 'Max';
      const arrSkipped = skips.some(s => s.date === ds && s.period === 'arr');
      if (sr.hasArrivalClass && sr.arrivalSlot) {
        const arShala = sr.arrivalShala1 || mShala, arrLabel = effLabel(sr, 'arrival', 'Arrival Evening Class');
        const arrIsOrientation = /orientation/i.test(arrLabel) && arShala && !arrSkipped;
        if (!arrIsOrientation) cls(arShala || 'grande', toTime(toMin(sr.arrivalSlot) - 15), sr.arrivalSlot, 'Orientation with Amansala — ' + leader);
        if (arShala && !arrSkipped) cls(arShala, sr.arrivalSlot, toTime(toMin(sr.arrivalSlot) + (sr.arrivalDur || 60)), arrLabel + (arrIsOrientation ? ' — opening circle with ' + leader : ''));
      } else {
        cls('grande', '20:30', '20:45', 'Orientation with Amansala — ' + leader);
        // a morning class on the arrival day only when an admin set one on purpose (schedule-no-arrival-morning.js)
        const arrOv = ovs.find(o => o.date === ds && o.period === 'morn');
        if (arrOv && mStart && mShala && !mornSkipped) {
          const st = arrOv.start || mStart;
          cls(arrOv.shala1 || mShala, st, toTime(toMin(st) + (arrOv.dur || mDur)), effLabel(sr, 'arrival', 'Opening Class') + music);
        }
      }
    } else if (ds === bk.end_date) {
      const depSkipped = skips.some(s => s.date === ds && s.period === 'dep');
      if (sr.hasDepartureClass && sr.departureSlot) {
        const depShala = sr.departureShala1 || mShala;
        if (depShala && !depSkipped) cls(depShala, sr.departureSlot, toTime(toMin(sr.departureSlot) + (sr.departureDur || 60)), effLabel(sr, 'departure', 'Departure Morning Class'));
      } else if (mStart && mShala && !mornSkipped) {
        const o = ovs.find(x => x.date === ds && x.period === 'morn'), st = (o && o.start) || mStart;
        cls((o && o.shala1) || mShala, st, toTime(toMin(st) + ((o && o.dur) || mDur)), effLabel(sr, 'departure', 'Morning Class') + music);
      }
    } else {
      if (sr.hasSunrise && sr.sunriseStart && (sr.sunriseDates || []).includes(ds)) {
        const loc = SUNRISE_LOC[sr.sunriseLocation] || sr.sunriseLocation || '';
        out.push({ type: 'act', start: sr.sunriseStart, end: toTime(toMin(sr.sunriseStart) + (sr.sunriseDur || 45)), what: 'Sunrise Activity' + (loc ? ' — ' + loc : '') + ' (no music)', groups: [title], guide: '' });
      }
      const aftSkipped = skips.some(s => s.date === ds && s.period === 'aft');
      const mo = ovs.find(o => o.date === ds && o.period === 'morn'), ao = ovs.find(o => o.date === ds && o.period === 'aft');
      const dmStart = (mo && mo.start) || mStart, dmDur = mo ? (mo.dur || mDur) : mDur, dmShala = (mo && mo.shala1) || mShala;
      if (dmStart && dmShala && !mornSkipped) cls(dmShala, dmStart, toTime(toMin(dmStart) + dmDur), effLabelDay(sr, bk, ds, 'morn', 'morning', 'Morning Class') + music);
      const hasAf = sr.hasAfternoon || (ov.afternoonStart && (ov.afternoonShala1 || sr.afternoonShala1 || sr.morningShala1));
      const daSlot = (ao && ao.start) || aSlot, daDur = ao ? (ao.dur || aDur) : aDur, daShala = (ao && ao.shala1) || aShala;
      if (hasAf && daSlot && daShala && !aftSkipped) cls(daShala, daSlot, toTime(toMin(daSlot) + daDur), effLabelDay(sr, bk, ds, 'aft', 'afternoon', 'Evening Class'));
    }
    if (sr.hasWorkshop && sr.workshops) {
      sr.workshops.filter(w => w.enabled && w.date === ds && w.shala1 && w.start && !(ds === bk.start_date && w.start < '15:00'))
        .forEach(w => cls(w.shala1, w.start, toTime(toMin(w.start) + (w.dur || 90)), 'Mid-Afternoon Class' + (w.notes ? ' — ' + String(w.notes).slice(0, 24) : '')));
    }
    // activities -- never on the arrival day (Fire Pit only, below)
    (bk.retreat_activities || []).filter(a => String(a.date || '').slice(0, 10) === ds && ds !== bk.start_date && a.aoId !== 'ao21').forEach(a => {
      const ao = (d.addOns || {})[a.aoId]; if (!ao) return;
      const st = a.time || '09:00', key = ao.name + '|' + st;
      if (!opt[key]) opt[key] = { type: 'act', start: st, end: toTime(toMin(st) + 90), what: ao.name, groups: [], guide: guideOf(a.aoId, ds), signups: {} };
      if (!opt[key].groups.includes(title)) opt[key].groups.push(title);
      // an optional activity counts who signed up for it (app_store act_signups_<booking>); a pre-paid one is the whole group
      if (!a.prepaid) opt[key].signups[title] = ((d.signups || {})[bk.id] || []).filter(x => (x.activities || []).includes(a.aoId)).length;
      // ice bath: the 30-minute breathwork part holds a shala (ice-bath-shala.js)
      if (a.aoId === 'ao10' && a.shala && a.time) cls(a.shala, a.time, toTime(toMin(a.time) + 30), 'Breathwork — Ice Bath & Breathwork');
    });
  });
  // Fire Pit: one line per time, every retreat that has it (fire-pit-schedule.js; also on arrival day)
  const fire = {};
  (d.bookings || []).filter(b => b.status !== 'cancelled').forEach(bk => (bk.retreat_activities || []).filter(a => a.aoId === 'ao21' && String(a.date || '').slice(0, 10) === ds).forEach(a => {
    const t = a.time || '20:00'; (fire[t] = fire[t] || []); if (!fire[t].includes(name(bk))) fire[t].push(name(bk));
  }));
  Object.entries(fire).forEach(([t, groups]) => out.push({ type: 'act', start: t, end: toTime(toMin(t) + 90), what: 'Fire Pit', groups, guide: '' }));
  // extra classes added by the team (extra-class.js) -- every retreat staying that day, confirmed or not
  (d.bookings || []).filter(b => b.status !== 'cancelled' && b.start_date && ds >= b.start_date && ds <= b.end_date).forEach(bk =>
    (bk.schedule_time_overrides || []).filter(x => x.period === 'extra' && x.date === ds && x.start && x.shala1)
      .forEach(x => out.push({ type: 'class', shala: x.shala1, start: x.start, end: toTime(toMin(x.start) + (x.dur || 60)), what: (x.label || 'Extra Class') + (x.coTeacher ? ' — with ' + x.coTeacher : ''), who: name(bk) })));
  return out.concat(Object.values(opt));
}

// BBC / RNR: confirmed schedules' slots for the date (12-hour times without am/pm, as the BBC tab writes them)
function bbcTime(t) {
  const m = String(t || '').trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/); if (!m) return null;
  let h = parseInt(m[1], 10); if (m[3] === 'pm' && h < 12) h += 12; else if (m[3] === 'am' && h === 12) h = 0; else if (!m[3] && h < 7) h += 12;
  return String(h).padStart(2, '0') + ':' + m[2];
}
// slot.pm: an evening line typed with "pm" and stored as a plain time ("7:15 – 8:30", bbc-auto-sort.js bbcPlainTime)
function bbcRange(s, pm) {
  const parts = String(s || '').split(/\s*[–-]\s*/).filter(Boolean); let start = bbcTime(parts[0]); if (!start) return null;
  if (pm && toMin(start) >= 7 * 60 && toMin(start) < 12 * 60) start = toTime(toMin(start) + 12 * 60);
  let end = parts[1] ? bbcTime(parts[1]) : null;
  // "7:15 pm-8:30" style: an end without am/pm after a pm start is pm too
  if (end && end < start && !/am|pm/i.test(parts[1] || '')) { const e = toMin(end) + 12 * 60; if (e > toMin(start)) end = toTime(e); }
  return { start, end: end || toTime(toMin(start) + 45) };
}
function bbcEvents(d, ds) {
  const out = [];
  (d.bbc || []).filter(s => s.status === 'confirmed').forEach(s => {
    const day = (s.days || []).find(x => x.date === ds); if (!day) return;
    (day.slots || []).forEach(x => {
      if (x.type === 'meal') return;
      const r = bbcRange(x.time, x.pm); if (!r) return;
      let what = String(x.activity || '').trim(); if (!what) return;
      if (x.workshop && !/^workshop/i.test(what)) what = 'Workshop: ' + what;
      const inst = x.instructor ? ' w/ ' + x.instructor + (x.coHost ? ' & ' + x.coHost : '') : '', loc = String(x.location || '').trim();
      const sid = BBC_LOC[loc.toLowerCase()], kind = kindOf(what);
      if (sid && kind === '✨ ACTIVITY' && !BBC_TOURS.has(what)) out.push({ type: 'class', shala: sid, start: r.start, end: r.end, what: what + inst, who: 'BBC', note: loc.toLowerCase() === sid || loc.toLowerCase() === (SHALAS[sid] || '').toLowerCase() ? '' : loc });
      else out.push({ type: 'act', start: r.start, end: r.end, what: what + inst, groups: ['BBC'], guide: '', place: loc });
    });
  });
  return out;
}

// How many registered guests each group has staying that day: retreats by their name on the schedule, BBC / RNR together as 'BBC'
function paxByGroup(d, ds) {
  const out = {}, bks = {}; (d.bookings || []).forEach(b => { bks[b.id] = b; });
  (d.regs || []).forEach(r => {
    const b = bks[r.booking_id]; if (!b || r.cancelled) return;
    const ci = r.check_in || b.start_date, co = r.check_out || b.end_date; if (!(ci <= ds && co > ds)) return;
    const n = (r.guests || []).filter(g => g && g.name && !g.cancelled).length; if (!n) return;
    const isBbc = /bikini|bbc|restore|rnr/i.test(`${b.retreat_name || ''} ${b.leader_name || ''}`);
    const k = isBbc ? 'BBC' : (b.leader_name || b.retreat_name || 'Retreat');
    out[k] = (out[k] || 0) + n;
  });
  return out;
}

// { head: 'NOV 10 - AM', classes: [...lines], acts: [...lines] } — part 'AM' = starts before 4:00 PM, 'PM' = from 4:00 PM
function buildBriefing(d, ds, part) {
  const inPart = t => part === 'AM' ? t < '16:00' : t >= '16:00';
  const evs = [...retreatEvents(d, ds), ...bbcEvents(d, ds)].filter(e => e.start && inPart(e.start));
  const sort = a => a.sort((x, y) => x.start.localeCompare(y.start) || x.end.localeCompare(y.end));
  const t = e => fmt(e.start) + '–' + fmt(e.end);
  const what = e => String(e.what).replace(/\s*🎵/g, '').replace(/\s+/g, ' ').trim();
  const pax = paxByGroup(d, ds), withPax = g => pax[g] ? `${g} · ${pax[g]} pax` : g;
  const classes = sort(evs.filter(e => e.type === 'class')).map(e => `${t(e)} · ${ICON[e.shala] || '📍 ' + String(SHALAS[e.shala] || e.shala).toUpperCase()} · ${what(e)} (${withPax(e.who)})${e.note ? ' | ' + e.note : ''}`);
  // activities: an optional one shows how many signed up; a pre-paid one (or Fire Pit / sunrise) the group; a BBC optional
  // one has no sign-up list, so no number
  const actGroup = (e, g) => e.signups && g in e.signups ? `${g} · ${e.signups[g]} signed up` : g === 'BBC' && /optional/i.test(e.what) ? g : withPax(g);
  const acts = sort(evs.filter(e => e.type === 'act')).map(e => `${t(e)} · ${kindOf(e.what)} · ${e.what} (${e.groups.map(g => actGroup(e, g)).join(', ')})${e.guide ? ' ' + e.guide : ''}${e.place ? ' | ' + e.place : ''}`);
  const head = new Date(ds + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase() + ' - ' + part;
  return { head, classes, acts };
}

// lines -> exactly n template values (more lines than n: the last value holds the rest)
function toParams(head, lines, n, empty) {
  const l = lines.length ? lines : [empty];
  const vals = l.length > n ? [...l.slice(0, n - 1), l.slice(n - 1).join(' · ')] : [...l, ...Array(n - l.length).fill(BLANK)];
  return [head, ...vals].map(v => ({ type: 'text', text: String(v).slice(0, 1000) }));
}

async function loadData(key) {
  const H = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async p => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(p.split('?')[0] + ' ' + r.status); return r.json(); };
  const [bookings, addOns, store] = await Promise.all([
    get('bookings?select=id,leader_name,retreat_name,status,start_date,end_date,schedule_request,schedule_time_overrides,schedule_skips,retreat_activities&status=neq.cancelled&end_date=gte.' + new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10) + '&limit=2000'),
    get('add_ons?select=id,name,price'),
    get('app_store?select=key,value&key=in.(bbc_schedules,act_ops,opening_circle_leaders,' + NUMBERS_KEY + ')'),
  ]);
  const st = k => ((store.find(r => r.key === k) || {}).value);
  // who signed up for the optional activities (activity-signup.html / the Activities page), per booking
  const signups = {};
  try { (await get('app_store?select=key,value&key=like.act_signups_*')).forEach(r => { signups[r.key.replace('act_signups_', '')] = Array.isArray(r.value) ? r.value : []; }); } catch (e) {}
  // the guests of the groups staying in the next days, for "(Korina Vaynter · 14 pax)" (Jorge 2026-11-11)
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), near = bookings.filter(b => b.start_date <= soon).map(b => b.id), regs = [];
  for (let i = 0; i < near.length; i += 60) regs.push(...await get(`registrations?select=booking_id,guests,check_in,check_out,cancelled&booking_id=in.(${near.slice(i, i + 60).map(encodeURIComponent).join(',')})`));
  const ao = {}; addOns.forEach(a => { ao[a.id] = a; });
  if (!ao.ao12) ao.ao12 = { id: 'ao12', name: 'Group Salsa Class' };
  return { bookings, regs, signups, addOns: ao, bbc: st('bbc_schedules') || [], actOps: st('act_ops') || {}, ocLeaders: st('opening_circle_leaders') || {}, numbers: st(NUMBERS_KEY) };
}

async function sendTo(phone, tpl, params, idem) {
  const r = await fetch(VISITO_SEND, { method: 'POST', headers: { Authorization: `Bearer ${process.env.VISITO_M2M_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem },
    body: JSON.stringify({ to: phone, template: { name: tpl, language: { code: 'en_US' }, components: [{ type: 'body', parameters: params }] } }) });
  const txt = await r.text();
  return r.ok && /"accepted":true/.test(txt) ? 'sent' : 'failed ' + r.status + ' ' + txt.slice(0, 120);
}

// part 'PM' (1 PM: today) or 'AM' (9 PM: tomorrow). opts.only = one phone (a test), opts.dryRun = build only
async function runBriefing(part, opts = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const d = await loadData(key);
  const tulumToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
  const ds = opts.date || (part === 'AM' ? new Date(new Date(tulumToday + 'T12:00:00Z').getTime() + 864e5).toISOString().slice(0, 10) : tulumToday);
  const b = buildBriefing(d, ds, part);
  const cfg = d.numbers || {};
  if (opts.dryRun) return { ds, part, ...b };
  if (!opts.only && cfg.enabled === false) return { ds, part, skipped: 'switched off' };
  // a person with parts ['PM'] gets only the 1 PM messages, ['AM'] only the 9 PM ones; no parts = both (Jorge 2026-11-11: Noe, afternoons)
  const people = opts.only ? [{ name: 'test', phone: opts.only }] : (cfg.people || []).filter(p => !Array.isArray(p.parts) || !p.parts.length || p.parts.includes(part));
  const sh = toParams(b.head, b.classes, SHALA_LINES, 'No classes in the shalas'), ac = toParams(b.head, b.acts, ACT_LINES, 'No tours or activities');
  // everyone at once, then the ones Visito could not queue ("Failed to queue", Rosi and Tricia 2026-11-10) once more, same
  // idempotency key so nobody gets it twice -- all inside the scheduled function's 30 s
  const jobs = [];
  people.forEach(p => {
    const idem = `shala-${ds}-${part}-${String(p.phone).replace(/\D/g, '')}${opts.only ? '-' + Date.now() : ''}`;
    jobs.push({ p, kind: 'shala', tpl: TPL_SHALA, params: sh, key: idem + '-s' }, { p, kind: 'acts', tpl: TPL_ACTS, params: ac, key: idem + '-a' });
  });
  await Promise.all(jobs.map(async j => { j.r = await sendTo(j.p.phone, j.tpl, j.params, j.key); }));
  for (let round = 0; round < 2 && jobs.some(j => j.r !== 'sent'); round++) {
    await new Promise(x => setTimeout(x, 4000));
    await Promise.all(jobs.filter(j => j.r !== 'sent').map(async j => { j.r = await sendTo(j.p.phone, j.tpl, j.params, j.key); if (j.r === 'sent') j.retried = true; }));
  }
  const results = people.map(p => { const mine = jobs.filter(j => j.p === p), r = k => { const j = mine.find(x => x.kind === k); return j.r + (j.retried ? ' (retry)' : ''); }; return { name: p.name, shala: r('shala'), acts: r('acts') }; });
  return { ds, part, classes: b.classes.length, acts: b.acts.length, results };
}

module.exports = { buildBriefing, retreatEvents, bbcEvents, toParams, runBriefing, NUMBERS_KEY };
