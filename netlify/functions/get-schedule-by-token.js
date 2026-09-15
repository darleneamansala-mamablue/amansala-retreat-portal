'use strict';

// Public, read-only retreat schedule, looked up by a long random token (never
// by the booking's internal id) — mirrors get-booking-summary.js's pattern.
// Uses the service key server-side so RLS/anon restrictions don't apply, and
// returns only a pre-built, render-ready `days` array — never the full
// booking row (payments, guest PII, staff notes never leave the server).
//
// This is a deliberately simplified port of the day-by-day builder in
// modules/teacher-portal.js (openPrintSchedule/buildScheduleDays) — the admin/
// teacher print view is the source of truth for exact business rules. Kept
// out of this port on purpose (to avoid pulling in extra tables/complexity
// for a public summary page):
//  - Welcome Snack always shows at the default 3:00 PM (the admin view can
//    suppress it if every guest's flight lands later — this page always
//    shows the default, safe fallback instead of querying transport data).
//  - Sunrise activity and Mid-Afternoon workshop ARE included (no extra data
//    source needed — both live directly on schedule_request).
const SUPABASE_URL = 'https://vnttlpqkssihbmcynxvo.supabase.co';
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MON_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const SHALA_NAMES = { grande:'Grande', chica:'Chica', beachfront:'Beachfront', heaven:'Heaven Shala', skye:'Skye' };
const SUNRISE_LOCATIONS = { chica_beach:'Chica Beach', grande_beach:'Grande Beach', chica_rooftop:'Chica Rooftop' };
const ACTS_DUR = { ao3:180, ao4:120, ao5:90, ao9:90, ao10:60 };

function pd(dateStr){ return new Date(dateStr+'T00:00:00'); }
function fmtT(t){ if(!t) return ''; const [h,m]=t.split(':').map(Number); const ap=h>=12?'PM':'AM'; return `${h%12||12}:${String(m).padStart(2,'0')} ${ap}`; }
function addMin(t,mins){ if(!t) return ''; const [h,m]=t.split(':').map(Number); const tot=h*60+m+mins; const hh=Math.floor(tot/60)%24; return `${String(hh).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}`; }
function shalaName(id){ return id ? (SHALA_NAMES[id]||id) : ''; }
function effClassLabel(sr,period,fallback){
  const ov=(sr&&sr.adminOverride)||{};
  const label=(ov[period+'Label']||(sr&&sr[period+'Label'])||'').trim();
  const co=(ov[period+'CoTeacher']||(sr&&sr[period+'CoTeacher'])||'').trim();
  return (label||fallback)+(co?' — with '+co:'');
}
function effClassLabelDay(sr,bk,dateStr,ovPeriod,labelKey,fallback){
  const dayOv=(bk.schedule_time_overrides||[]).find(o=>o.date===dateStr&&o.period===ovPeriod);
  if(dayOv&&dayOv.label) return dayOv.label+(dayOv.coTeacher?' — with '+dayOv.coTeacher:'');
  return effClassLabel(sr,labelKey,fallback);
}
function usualMorning(bk,sr){
  const ov=(sr&&sr.adminOverride)||{};
  return { start: ov.morningStart||(sr&&sr.morningStart)||'', dur: parseInt(ov.morningDur||(sr&&sr.morningDur)||90) };
}

function buildScheduleDays(bk, addOnMap){
  const sr = bk.schedule_request || {};
  const nights = Math.max(1, Math.round((pd(bk.end_date) - pd(bk.start_date)) / DAY_MS));
  const mShala = shalaName(sr.morningShala1);
  const skips = bk.schedule_skips || [];
  const days = [];

  for (let i = 0; i <= nights; i++) {
    const d = new Date(pd(bk.start_date).getTime() + i * DAY_MS);
    const dateStr = d.toISOString().slice(0, 10);
    const dnum = d.getDate();
    const ord = (dnum%10===1&&dnum!==11)?'st':(dnum%10===2&&dnum!==12)?'nd':(dnum%10===3&&dnum!==13)?'rd':'th';
    const dayLabel = `${DAY_NAMES[d.getDay()]}, ${MON_NAMES[d.getMonth()]} ${dnum}${ord}`;
    const rows = [];

    if (i === 0) {
      rows.push({ time:'3:00 PM', desc:'Check-in' });
      rows.push({ time:'3:00 PM', desc:'Welcome Snack' });
      if (sr.hasArrivalClass && sr.arrivalSlot) {
        const end = fmtT(addMin(sr.arrivalSlot, sr.arrivalDur||60));
        rows.push({ time:`${fmtT(sr.arrivalSlot)} – ${end}`, desc: effClassLabel(sr,'arrival','Opening Class'), shala: mShala });
      }
      rows.push({ time:'7:30 PM', desc:'Dinner' });
    } else if (i === nights) {
      rows.push({ time:'7:00 AM', desc:'Fruit, Coffee & Tea — Closing Comments' });
      if (sr.hasDepartureClass && sr.departureSlot) {
        const depShala = shalaName(sr.departureShala1||sr.morningShala1);
        const end = fmtT(addMin(sr.departureSlot, sr.departureDur||60));
        rows.push({ time:`${fmtT(sr.departureSlot)} – ${end}`, desc: effClassLabel(sr,'departure','Departure Morning Class'), shala: depShala });
      } else {
        const usual = usualMorning(bk,sr);
        if (usual.start) {
          const end = fmtT(addMin(usual.start, usual.dur||60));
          rows.push({ time:`${fmtT(usual.start)} – ${end}`, desc: effClassLabel(sr,'morning','Morning Class'), shala: mShala });
        }
      }
      rows.push({ time:'9:30 AM', desc:'Full Breakfast' });
      rows.push({ time:'', desc:'Departures' });
    } else {
      const mornSkipped = skips.some(s=>s.date===dateStr&&s.period==='morn');
      const aftSkipped = skips.some(s=>s.date===dateStr&&s.period==='aft');
      if (sr.hasSunrise && sr.sunriseStart && (sr.sunriseDates||[]).includes(dateStr)) {
        const end = fmtT(addMin(sr.sunriseStart, sr.sunriseDur||45));
        rows.push({ time:`${fmtT(sr.sunriseStart)} – ${end}`, desc:'Sunrise Activity'+(sr.sunriseLocation?' — '+(SUNRISE_LOCATIONS[sr.sunriseLocation]||sr.sunriseLocation):'')+' (no shala, no music — quiet hours)' });
      }
      rows.push({ time:'7:00 AM', desc:'Fruit, Coffee & Tea' });
      const timeOvs = bk.schedule_time_overrides || [];
      const mornOv = timeOvs.find(o=>o.date===dateStr&&o.period==='morn');
      const aftOv = timeOvs.find(o=>o.date===dateStr&&o.period==='aft');
      const usual = usualMorning(bk,sr);
      if (!mornSkipped) {
        const dayMornStart = mornOv ? mornOv.start : usual.start;
        const dayMornDur = mornOv ? (mornOv.dur||usual.dur||60) : (usual.dur||60);
        const dayMornShala = shalaName((mornOv&&mornOv.shala1)||sr.morningShala1);
        if (dayMornStart) {
          const end = fmtT(addMin(dayMornStart, dayMornDur));
          rows.push({ time:`${fmtT(dayMornStart)} – ${end}`, desc: effClassLabelDay(sr,bk,dateStr,'morn','morning','Morning Class')+(mornOv?' (time changed)':''), shala: dayMornShala });
        }
      }
      const ov = sr.adminOverride || {};
      const mStart = ov.morningStart||usual.start||'';
      const mDur = parseInt(ov.morningDur||usual.dur||90);
      const brunchT = mStart ? addMin(mStart, mDur+15) : '09:45';
      rows.push({ time: fmtT(brunchT), desc: brunchT<'09:45'?'Breakfast':'Brunch' });
      rows.push({ time:'3:00 PM', desc:'Snack' });
      if (sr.workshops) {
        const ws = (sr.workshops||[]).find(w=>w.enabled&&w.date===dateStr);
        if (ws) {
          const end = fmtT(addMin(ws.start, ws.dur||90));
          rows.push({ time:`${fmtT(ws.start)} – ${end}`, desc:'Mid-Afternoon Class'+(ws.notes?' — '+ws.notes:''), shala: shalaName(ws.shala1) });
        }
      }
      if (!aftSkipped) {
        const dayAfSlot = aftOv ? aftOv.start : (sr.afternoonSlot||sr.afternoonStart);
        const dayAfDur = aftOv ? (aftOv.dur||sr.afternoonDur||60) : (sr.afternoonDur||60);
        const dayAfShala = shalaName((aftOv&&aftOv.shala1)||sr.afternoonShala1);
        if (sr.hasAfternoon && dayAfSlot) {
          const end = fmtT(addMin(dayAfSlot, dayAfDur));
          rows.push({ time:`${fmtT(dayAfSlot)} – ${end}`, desc: effClassLabelDay(sr,bk,dateStr,'aft','afternoon','Afternoon Class')+(aftOv?' (time changed)':''), shala: dayAfShala });
        }
      }
      const isOffsite = sr.offsiteNight && Math.abs(d.getTime() - (pd(bk.start_date).getTime()+(parseInt(sr.offsiteNight)-1)*DAY_MS)) < DAY_MS/2;
      const hasGitano = (bk.retreat_activities||[]).some(a=>a.aoId==='ao13'&&a.date===dateStr);
      if (!hasGitano) rows.push({ time:'7:30 PM', desc: isOffsite?'Dinner | Off-site':'Dinner' });
    }

    (bk.retreat_activities||[]).filter(a=>a.date===dateStr&&dateStr!==bk.start_date).forEach(a=>{
      const ao = addOnMap[a.aoId] || { name:a.aoId, price:0 };
      const dur = ACTS_DUR[a.aoId] || 90;
      const timeRange = a.time ? `${fmtT(a.time)} – ${fmtT(addMin(a.time,dur))}` : '';
      const desc = a.prepaid ? (ao.name+(a.requestedTime?' (requested this time)':'')) : (`Optional ${ao.name}`+(ao.price?` — $${ao.price} USD per person`:''));
      rows.push({ time:timeRange, desc });
    });

    days.push({ label:dayLabel, rows });
  }
  return days;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:cors(), body:'' };
  if (event.httpMethod !== 'POST') return { statusCode:405, body:'Method Not Allowed' };

  const supaKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaKey) return jsonErr(500, 'Server config error');

  let token;
  try { ({ token } = JSON.parse(event.body || '{}')); }
  catch { return jsonErr(400, 'Invalid JSON'); }
  if (!token) return jsonErr(400, 'Missing token');

  const hdrs = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  try {
    const filter = `package_custom_prices->__cfg__->>scheduleShareToken=eq.${encodeURIComponent(token)}`;
    const bkRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings?${filter}&select=leader_name,retreat_name,start_date,end_date,status,schedule_request,schedule_time_overrides,schedule_skips,retreat_activities`, { headers: hdrs });
    if (!bkRes.ok) throw new Error('bookings fetch failed');
    const [bk] = await bkRes.json();
    if (!bk) return jsonErr(404, 'Schedule not found');

    const aoRes = await fetch(`${SUPABASE_URL}/rest/v1/add_ons?select=id,name,price`, { headers: hdrs });
    const addOns = aoRes.ok ? await aoRes.json() : [];
    const addOnMap = {}; addOns.forEach(a=>addOnMap[a.id]=a);
    addOnMap['ao12'] = { id:'ao12', name:'Group Salsa Class', price:0 };

    const days = buildScheduleDays(bk, addOnMap);

    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type':'application/json' },
      body: JSON.stringify({
        leaderName: bk.leader_name || '',
        retreatName: bk.retreat_name || '',
        startDate: bk.start_date,
        endDate: bk.end_date,
        days,
      }),
    };
  } catch (err) {
    return jsonErr(500, err.message);
  }
};

function cors(){ return { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type' }; }
function jsonErr(code,msg){ return { statusCode:code, headers:{...cors(),'Content-Type':'application/json'}, body:JSON.stringify({error:msg}) }; }
