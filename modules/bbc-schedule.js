// ===== bbc-schedule.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ==================== BBC SCHEDULE MODULE ====================
// Instructor rotations per Bikini Bootcamp spec
// Darlene's spec (2026-08-29): Kun PM + Darlene AM start the camp (arrival
// evening + day 1 morning, both already fixed below), then alternates so no
// one teaches two calendar days in a row. Day 4 AM was Yolanda in her literal
// sequence, which put her on days 4 and 5 back-to-back — swapped to Kiki
// per her follow-up to fix that.
// Darlene's spec (2026-08-29), evened out: Kun opens the camp (arrival PM,
// already fixed below) and closes out at 2 AM + 2 PM total; Darlene gets 3
// AM total (2 here + the departure morning, also fixed below); Maya gets 2
// PM; Yolanda caps at 3 (1 AM + 2 PM). No one teaches two calendar days in a
// row. Doesn't need Kiki/Noelia — only bring them in if a specific week's
// mix of durations/excursion days creates a real back-to-back conflict.
const BBC_MORNING_YOGA_ROTATION=['Darlene','Kun','Yolanda','Darlene','Kun']; // index = full-day index (0-based)
const BBC_EVENING_YOGA_ROTATION=['Maya','Kun','Yolanda','Maya','Yolanda'];   // index = full-day index (0-based)
const BBC_DANCE_ROTATION=[
  {activity:'Latin Grooves',instructor:'Sergio',location:'Heaven'},
  {activity:'AfroBeats',    instructor:'Sergio',location:'Grande'},
  {activity:'Bollywood',    instructor:'Sergio',location:'Heaven'},
];
const BBC_INSTRUCTORS_LIST=['Ryan','Darlene','Adele','Sergio','Yolanda','Kun','Maya','Kiki','Fernando','Marco'];
const BBC_LOCATIONS_LIST=['Beachfront','Grande','Heaven','Chica','Skye'];
// Pilates every 2nd day; the days in between alternate Absolution/Boxing.
// Clamped (not cycled) past the 7th full day, same as the other rotations.
const BBC_AFTERNOON_STRENGTH_ROTATION=[
  {activity:'Pilates',   instructor:'Adele'},
  {activity:'Absolution',instructor:'Sergio'},
  {activity:'Pilates',   instructor:'Adele'},
  {activity:'Boxing',    instructor:'Fernando'},
  {activity:'Pilates',   instructor:'Adele'},
  {activity:'Absolution',instructor:'Sergio'},
  {activity:'Boxing',    instructor:'Fernando'},
];
// Groups under 3 guests get ONE afternoon fitness slot instead of two —
// rotates Dance / Pilates / Boxing day to day (plus Gentle Yoga, unchanged).
function bbcSmallGroupAfternoon(fullIdx,dance){
  switch(((fullIdx%3)+3)%3){
    case 0:return{activity:dance.activity,instructor:dance.instructor};
    case 1:return{activity:'Pilates',instructor:'Adele'};
    default:return{activity:'Boxing',instructor:'Fernando'};
  }
}

// Default excursion order when there's no yoga retreat running the same
// week to match against — 1st tour day = Tulum Ruins, 2nd = Grande Cenote,
// 3rd = Mangroves, then repeats.
const BBC_DEFAULT_TOUR_ORDER=['Tulum Ruins','Grande Cenote Tour','Mangroves Tour'];
// aoIds recognized as "tours" for cross-referencing a concurrent yoga
// retreat's own scheduled activities (modules/teacher-portal.js ADD_ONS).
const BBC_TOUR_AOID_NAME={ao1:'Tulum Ruins',ao6:'Grande Cenote Tour',ao7:'Mangroves Tour',ao3:'Atik Cenote Tour',ao2:'Muyil Float Tour'};
// Tours are off-site — no Amansala shala to assign, so the location field
// is hidden for these rows instead of showing an always-empty input.
const BBC_TOUR_NAMES=new Set([...Object.values(BBC_TOUR_AOID_NAME),'Excursion']);
// Ceremonies/rituals BBC can offer alongside tours — same set as the general
// retreat add-ons list, so names/aoIds line up across both systems. Unlike
// tours these happen on property, so they keep an editable location field.
const BBC_CEREMONY_AOID_NAME={ao5:'Temazcal',ao4:'Sound Healing & Cacao Ceremony',ao9:'Mayan Clay Ceremony',ao10:'Ice Bath & Breathwork'};
// Combined picker list for Custom mode — tours first, then ceremonies.
const BBC_SPECIAL_ACTIVITY_OPTIONS=[...Object.values(BBC_TOUR_AOID_NAME),...Object.values(BBC_CEREMONY_AOID_NAME)];

// The two modules talk to each other here: if a yoga retreat is on the
// books for this date with a tour already scheduled, BBC's excursion uses
// that same tour (so both groups can go out together) instead of picking
// independently from the default order.
function bbcFindConcurrentTour(date){
  const bookings=(typeof AppData!=='undefined'&&AppData.bookings)?AppData.bookings:[];
  for(const bk of bookings){
    if(bk.status==='cancelled')continue;
    if(!bk.startDate||!bk.endDate)continue;
    if(date<bk.startDate||date>bk.endDate)continue;
    const match=(bk.retreatActivities||[]).find(a=>a.date===date&&BBC_TOUR_AOID_NAME[a.aoId]);
    if(match)return BBC_TOUR_AOID_NAME[match.aoId];
  }
  return null;
}

function bbcLocToShalaId(loc){
  if(!loc)return null;
  const m={'beachfront':'beachfront','grande':'grande','heaven':'heaven','chica':'chica','skye':'skye'};
  return m[loc.toLowerCase().trim()]||null;
}

// ── SHALA/ACTIVITY CALENDAR INTEGRATION ──
// Confirmed BBC schedules show up as blocks on the Schedule tab's master
// calendar (modules/teacher-portal.js skedBuild()), same as yoga retreat
// classes and tours — so room usage is visible in one place either way.
// Draft schedules stay BBC-tab-only until Darlene clicks Confirm Schedule.
const BBC_SKED_AOID_TO_COL={ao1:'ruins',ao6:'cenote',ao7:'mangroves',ao2:'muyil',ao3:'atik',ao4:'cacao',ao5:'temazcal',ao9:'clay',ao10:'icebath'};
function bbcActivityNameToSkedCol(name){
  const all={...BBC_TOUR_AOID_NAME,...BBC_CEREMONY_AOID_NAME};
  for(const aoId in all){if(all[aoId]===name)return BBC_SKED_AOID_TO_COL[aoId]||null;}
  return null;
}
// BBC slot times are a contextual 12-hour clock with no am/pm marker — every
// time string the generator produces falls in one of two bands: 7,8,9,10,11
// are always morning; 12,1,2,3,4,5,6 are always afternoon/evening (nothing
// runs before 7am, and nothing uses a bare "12:xx" as an event start).
function bbcTimeTo24h(t){
  const m=(t||'').trim().match(/^(\d{1,2}):(\d{2})$/);
  if(!m)return null;
  let h=parseInt(m[1],10);const mins=m[2];
  if(h<7)h+=12;
  return String(h).padStart(2,'0')+':'+mins;
}
function bbcSlotTimeRange(timeStr,defaultDurMin){
  if(!timeStr)return null;
  const parts=timeStr.split('–').map(s=>s.trim());
  const start=bbcTimeTo24h(parts[0]);
  if(!start)return null;
  let end=parts[1]?bbcTimeTo24h(parts[1]):null;
  if(!end){
    const[h,m]=start.split(':').map(Number);
    const total=h*60+m+(defaultDurMin||45);
    end=String(Math.floor(total/60)%24).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
  }
  return{start,end};
}
function skedGetBbcEvents(dateStr){
  const evs=[];
  (typeof bbcSchedules!=='undefined'?bbcSchedules:[]).forEach(s=>{
    if(s.status!=='confirmed')return;
    const day=(s.days||[]).find(d=>d.date===dateStr);
    if(!day)return;
    (day.slots||[]).forEach(slot=>{
      if(slot.type==='meal')return;
      const range=bbcSlotTimeRange(slot.time,45);
      if(!range)return;
      const isTour=BBC_TOUR_NAMES.has(slot.activity);
      const isCeremony=Object.values(BBC_CEREMONY_AOID_NAME).includes(slot.activity);
      const resourceId=(isTour||isCeremony)?bbcActivityNameToSkedCol(slot.activity):bbcLocToShalaId(slot.location);
      if(!resourceId)return;
      evs.push({
        id:'bbc_'+s.id,resourceId,date:dateStr,startTime:range.start,endTime:range.end,
        title:slot.activity,subtitle:'Bikini Bootcamp'+(slot.instructor?' — '+slot.instructor:''),
        color:'#0e9494',bg:'#0e949422',textColor:'#0e7c7c',isRetreat:false,bkId:s.id,
      });
    });
  });
  return evs;
}

function bbcGetShalaConflicts(date,location){
  if(!date||!location)return[];
  const shalaId=bbcLocToShalaId(location);
  if(!shalaId)return[];
  const conflicts=[];
  (typeof AppData.bookings!=='undefined'?AppData.bookings:[]).forEach(bk=>{
    if(!bk.scheduleRequest)return;
    if(bk.startDate>date||bk.endDate<date)return;
    const sr=bk.scheduleRequest;
    const grp=bk.leaderName||bk.retreatName||'Group';
    const ov=sr.adminOverride||{};
    // Morning class
    const mShala=ov.morningShala1||sr.morningShala1;
    if(mShala===shalaId)conflicts.push(grp+' — morning class');
    // Afternoon class
    if(sr.hasAfternoon){const aShala=ov.afternoonShala1||sr.afternoonShala1||sr.morningShala1;if(aShala===shalaId)conflicts.push(grp+' — afternoon class');}
    // Workshops on this exact date
    (sr.workshops||[]).forEach(w=>{if(w.enabled&&w.date===date&&(w.shala1===shalaId))conflicts.push(grp+' — workshop'+(w.label?' ('+w.label+')':''));});
    // Arrival class
    if(sr.hasArrivalClass&&bk.startDate===date){const aShala=ov.arrivalShala1||sr.arrivalShala1||sr.morningShala1;if(aShala===shalaId)conflicts.push(grp+' — arrival class');}
    // Departure class
    if(sr.hasDepartureClass&&bk.endDate===date){const dShala=ov.departureShala1||sr.departureShala1||sr.morningShala1;if(dShala===shalaId)conflicts.push(grp+' — departure class');}
  });
  return conflicts;
}
const BBC_MORNING_PAGES=[
  'What am I here to release this week? What am I ready to leave behind?',
  'What does my body need most right now — rest, movement, nourishment, or stillness?',
  'Where in my life am I playing small? What would it look like to show up fully?',
  'What am I most grateful for in my body? Write a love letter to the parts you usually criticize.',
  'What habits and patterns serve me — and which ones no longer do?',
  'What have I discovered about myself this week? What surprised me?',
  'What commitment am I making to myself as I head home today?',
];
const BBC_EVENING_PROMPTS=[
  'How did today feel in your body? Where did you feel ease and where did you notice tension?',
  'What moment today made you feel most alive?',
  'What is one thing you did for yourself today that you are proud of?',
  'What story about yourself are you ready to rewrite?',
  'If your body could speak, what would it ask for more of?',
  'What will you carry home from this week? What will you leave behind?',
  'How do you feel right now compared to when you arrived?',
];
let bbcSchedules=[];
let bbcCurrentId=null;

function bbcUid(){return 'bbc'+Math.random().toString(36).substr(2,9);}
let bbcLoaded=false;
function bbcLoadLocal(){try{bbcSchedules=JSON.parse(localStorage.getItem('bbc_schedules')||'[]');}catch(e){bbcSchedules=[];}}
// Previously local-only: read localStorage but never actually fetched from
// Supabase, so schedules made on one device/browser never showed up on
// another — including a teacher's own confirmation of their classes.
async function bbcLoadData(){
  bbcLoadLocal();
  const localCount=bbcSchedules.length;
  try{
    const{data}=await db.from('app_store').select('value').eq('key','bbc_schedules').maybeSingle();
    if(data?.value&&Array.isArray(data.value)&&data.value.length){
      bbcSchedules=data.value;
      localStorage.setItem('bbc_schedules',JSON.stringify(bbcSchedules));
    } else if(localCount>0){
      // Supabase has nothing yet but this browser has real schedules —
      // likely made before the sync fix. Push them up now so other
      // devices/teachers can actually see them.
      bbcSaveData();
    }
  }catch(e){}
  bbcLoaded=true;
}
async function bbcSaveData(){
  localStorage.setItem('bbc_schedules',JSON.stringify(bbcSchedules));
  try{await db.from('app_store').upsert({key:'bbc_schedules',value:bbcSchedules,updated_at:new Date().toISOString()});}catch(e){console.warn('BBC schedule sync failed:',e);}
}
function bbcFmtDate(d){const dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});}
function bbcAddDays(ds,n){const d=new Date(ds+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().split('T')[0];}
function bbcDayCount(s,e){return Math.round((new Date(e+'T12:00:00')-new Date(s+'T12:00:00'))/86400000)+1;}
function bbcMakeSlot(time,activity,instructor,location,fixed,type){return{id:bbcUid(),time,activity,instructor:instructor||'',location:location||'',fixed:!!fixed,type:type||'class'};}

// Availability check (from the Staff Confirmations login, modules/
// staff-confirm-portal.js) — no account on file for that name, or no date,
// means "assume available" since there's nothing on record saying otherwise.
// period: 'AM'|'PM' for the specific class slot, so a staff member who's
// only blocked out mornings (or afternoons) still gets picked for the half
// of the day they ARE available.
function bbcCheckAvail(name,date,period){
  return !date||typeof scIsAvailable!=='function'||scIsAvailable(name,date,period);
}
// Tries the rotation's usual pick first; falls back through the rest of the
// pool (in order) for anyone else marked unavailable that date/period; if
// literally everyone in the pool is unavailable, flags it instead of guessing.
function bbcPickAvailable(preferred,pool,date,period){
  if(bbcCheckAvail(preferred,date,period))return preferred;
  for(const p of pool){if(p!==preferred&&bbcCheckAvail(p,date,period))return p;}
  return '⚠ Needs Instructor';
}
const BBC_YOGA_POOL=['Darlene','Kun','Yolanda'];
const BBC_CLAY_MEDITATION_POOL=['Darlene','Yolanda'];

function bbcGenDaySlots(di,total,excursionDays,tourName,guestCount,date){
  const smallGroup=!!guestCount&&guestCount<3;
  const isFirst=di===0,isLast=di===total-1;
  const fullIdx=di-1; // 0-based index for full days (negative for arrival day)
  // Activation alternates by full-day index
  const activation=isFirst?'Breathwork':isLast?'Meditation':(fullIdx%2===0?'Breathwork':'Meditation');
  // Yoga instructors from spec rotations; arrival/departure always Darlene —
  // each pick falls back to another pool member if the rotation's usual
  // choice marked themselves unavailable that date.
  const morningYogaPick=(isFirst||isLast)?'Darlene':BBC_MORNING_YOGA_ROTATION[Math.min(fullIdx,BBC_MORNING_YOGA_ROTATION.length-1)];
  const morningYoga=bbcPickAvailable(morningYogaPick,BBC_YOGA_POOL,date,'AM');
  const eveningYogaPick=isFirst?'Kun':BBC_EVENING_YOGA_ROTATION[Math.min(fullIdx,BBC_EVENING_YOGA_ROTATION.length-1)];
  const eveningYoga=bbcPickAvailable(eveningYogaPick,BBC_YOGA_POOL,date,'PM');
  // Dance cycles Latin → Afro → Bollywood, always Sergio — no substitute pool
  // defined, so an unavailable Sergio just flags the slot for a manual fix.
  const danceRaw=BBC_DANCE_ROTATION[(isFirst?0:fullIdx)%BBC_DANCE_ROTATION.length];
  const dance=bbcCheckAvail(danceRaw.instructor,date,'PM')?danceRaw:{...danceRaw,instructor:'⚠ Needs Instructor'};
  // Strength rotation ties the activity to the person's specialty (Adele=
  // Pilates, Sergio=Absolution, Fernando=Boxing) — if today's pick is
  // unavailable, swap to whichever of the other two specialties IS
  // available rather than guessing a name for the wrong activity.
  const strengthRaw=BBC_AFTERNOON_STRENGTH_ROTATION[Math.min(Math.max(fullIdx,0),BBC_AFTERNOON_STRENGTH_ROTATION.length-1)];
  const strength=bbcCheckAvail(strengthRaw.instructor,date,'PM')?strengthRaw
    :(BBC_AFTERNOON_STRENGTH_ROTATION.find(s=>s.instructor!==strengthRaw.instructor&&bbcCheckAvail(s.instructor,date,'PM'))||{...strengthRaw,instructor:'⚠ Needs Instructor'});
  const yogaLabel=(isFirst||isLast)?'Yoga Mala':'Yoga';
  const circuitLabel=(isFirst||isLast)?'BBC 20':'Circuit Training';
  // Default locations unless told otherwise for a specific booking: yoga at
  // Beachfront, fitness at Grande.
  const aftLoc='Grande';
  const hasExcursion=!isFirst&&!isLast&&excursionDays&&excursionDays.includes(di);

  // Arrival day is a half day — starts at 4:45 with Sculpt & Tone.
  // Yoga and Orientation (Opening Circle) default to Beachfront — only fall
  // back to Heaven if Beachfront is already booked by a concurrent yoga
  // retreat that day.
  if(isFirst){
    const arrivalLoc=(date&&bbcGetShalaConflicts(date,'Beachfront').length)?'Heaven':'Beachfront';
    const slots=[
      bbcMakeSlot('4:45 – 5:30','Sculpt & Tone','Ryan','Grande',false,'class'),
      bbcMakeSlot('5:45 – 6:45','Gentle Yoga','Kun',arrivalLoc,false,'class'),
      bbcMakeSlot('7:00','Opening Circle','Ryan',arrivalLoc,false,'event'),
      bbcMakeSlot('7:45','Dinner','','',true,'meal'),
    ];
    return slots;
  }

  // Departure day is also a half day — ends at breakfast, then guests leave.
  // No circuit training, lunch, or closing dinner (that already happened
  // the night before, on the 2nd-to-last night).
  if(isLast){
    return[
      bbcMakeSlot('7:00','Coffee | Tea & Morning Pages','','',true,'meal'),
      bbcMakeSlot('7:00 – 7:15','Grand Rising — '+activation,'Ryan','Beachfront',false,'class'),
      bbcMakeSlot('7:30 – 8:15','Morning Beach Walk','Ryan','Beachfront',false,'class'),
      bbcMakeSlot('8:30 – 9:30',yogaLabel,morningYoga,'Beachfront',false,'class'),
      bbcMakeSlot('9:30','Breakfast','','',true,'meal'),
      bbcMakeSlot('','Departures — we hope you had a great week! We will miss you.','','',true,'event'),
    ];
  }

  const slots=[
    bbcMakeSlot('7:00','Coffee | Tea & Morning Pages','','',true,'meal'),
    bbcMakeSlot('7:00 – 7:15','Grand Rising — '+activation,'Ryan','Beachfront',false,'class'),
    bbcMakeSlot('7:30 – 8:15','Morning Beach Walk','Ryan','Beachfront',false,'class'),
    bbcMakeSlot('8:30 – 9:30',yogaLabel,morningYoga,'Beachfront',false,'class'),
    bbcMakeSlot('9:30','Breakfast','','',true,'meal'),
    bbcMakeSlot('10:45 – 11:30',circuitLabel,'Ryan','Grande',false,'class'),
  ];

  // isFirst/isLast both early-return above, so every day reaching here is a
  // regular full day.
  if(hasExcursion){
    // Excursion buses leave 11:45, return 2:15 — this used to block the whole
    // afternoon (old placeholder was 1:30-5:30), silently dropping the
    // dance/Pilates/Gentle Yoga block every excursion day. Real return time
    // leaves plenty of afternoon, so those classes still happen afterward.
    slots.push(bbcMakeSlot('11:45 – 2:15',tourName||'Excursion','','',false,'event'));
    slots.push(bbcMakeSlot('2:30','Late Lunch','','',true,'meal'));
    // Groups under 3 guests get ONE rotating fitness slot (Dance/Pilates/
    // Boxing) instead of a Dance + Strength double-header — plus Gentle Yoga.
    if(smallGroup){
      const sg=bbcSmallGroupAfternoon(fullIdx,dance);
      slots.push(bbcMakeSlot('4:00 – 4:45',sg.activity,sg.instructor,aftLoc,false,'class'));
    } else {
      slots.push(bbcMakeSlot('4:00 – 4:45',dance.activity,dance.instructor,aftLoc,false,'class'));
      slots.push(bbcMakeSlot('4:45 – 5:30',strength.activity,strength.instructor,aftLoc,false,'class'));
    }
    slots.push(bbcMakeSlot('5:45 – 6:45','Gentle Yoga',eveningYoga,'Beachfront',false,'class'));
  } else {
    // Every non-tour day gets a Mayan Clay Meditation at 12:15, led by
    // whichever of Darlene/Yolanda isn't already stretched thin that day —
    // alternates day to day since either can lead it.
    slots.push(bbcMakeSlot('12:15','Mayan Clay Meditation',bbcPickAvailable(fullIdx%2===0?'Darlene':'Yolanda',BBC_CLAY_MEDITATION_POOL,date,'PM'),'Beachfront',false,'class'));
    slots.push(bbcMakeSlot('1:30','Lunch','','',true,'meal'));
    if(smallGroup){
      const sg=bbcSmallGroupAfternoon(fullIdx,dance);
      slots.push(bbcMakeSlot('4:00 – 4:45',sg.activity,sg.instructor,aftLoc,false,'class'));
    } else {
      slots.push(bbcMakeSlot('4:00 – 4:45',dance.activity,dance.instructor,aftLoc,false,'class'));
      slots.push(bbcMakeSlot('4:45 – 5:30',strength.activity,strength.instructor,aftLoc,false,'class'));
    }
    slots.push(bbcMakeSlot('5:45 – 6:45','Gentle Yoga',eveningYoga,'Beachfront',false,'class'));
  }

  // Offsite dinner defaults to the 2nd-to-last night (departure day itself
  // is a half day ending at breakfast, so it can't host a dinner) —
  // editable per retreat from the schedule editor if the night needs to move.
  // Default to the 3rd-to-last night, not the 2nd-to-last — e.g. a camp
  // ending Nov 27 defaults Offsite Dinner to Nov 25, not Nov 26. Editable
  // per schedule from the day editor if a specific week needs it moved.
  const isOffsiteDinnerNight=di===total-3;
  slots.push(bbcMakeSlot('7:30',isOffsiteDinnerNight?'Offsite Dinner':'Dinner','','',true,'meal'));
  return slots;
}

function bbcGenSchedule(name,start,nights,excursionDays,guestCount,tourMode,customPicks){
  const total=nights+1; // arrival day + N nights; last day = departure morning
  const end=bbcAddDays(start,nights);
  const days=[];
  const mode=tourMode||'auto';
  // 'none' = no tours/ceremonies at all, regardless of what days were picked.
  const excDays=mode==='none'?[]:(excursionDays||[]);
  const tourByDay={};
  if(mode==='custom'){
    // She picks the exact tour/ceremony per day — no auto-matching or
    // default order involved.
    excDays.forEach(di=>{tourByDay[di]=(customPicks&&customPicks[di])||null;});
  } else {
    // Match each excursion day to a concurrent yoga retreat's tour where one
    // exists; otherwise fall back to the default Tulum Ruins -> Grande Cenote
    // -> Mangroves order (repeating past the 3rd excursion day). Auto mode
    // only ever picks real tours — there's no established default order for
    // ceremonies, so those are Custom-only.
    let defaultTourIdx=0;
    excDays.forEach(di=>{
      const date=bbcAddDays(start,di);
      const matched=bbcFindConcurrentTour(date);
      tourByDay[di]=matched||BBC_DEFAULT_TOUR_ORDER[defaultTourIdx++%BBC_DEFAULT_TOUR_ORDER.length];
    });
  }
  for(let i=0;i<total;i++){
    const prompt=BBC_MORNING_PAGES[Math.min(i,BBC_MORNING_PAGES.length-1)];
    const date=bbcAddDays(start,i);
    days.push({date,prompt,note:'',slots:bbcGenDaySlots(i,total,excDays,tourByDay[i],guestCount,date)});
  }
  return{id:bbcUid(),name,startDate:start,endDate:end,nights,guestCount:guestCount||null,tourMode:mode,status:'draft',createdAt:new Date().toISOString(),days};
}

function bbcDupInstructors(slots){
  const c={};
  slots.forEach(s=>{if(!s.instructor||s.instructor.trim()==='Ryan'||s.type==='meal')return;const k=s.instructor.trim();c[k]=(c[k]||0)+1;});
  return Object.keys(c).filter(k=>c[k]>1);
}

async function bbcInit(){await bbcLoadData();bbcShowList();}

function bbcShowList(){
  bbcCurrentId=null;
  document.getElementById('bbcListView').style.display='';
  document.getElementById('bbcNewView').style.display='none';
  document.getElementById('bbcEditorView').style.display='none';
  const bb=document.getElementById('bbcBackBtn'),pb=document.getElementById('bbcPrintBtn'),cb=document.getElementById('bbcCopyBtn'),sb=document.getElementById('bbcStatusBtn'),nb=document.getElementById('bbcNewBtn');
  if(bb)bb.style.display='none';if(pb)pb.style.display='none';if(cb)cb.style.display='none';if(sb)sb.style.display='none';if(nb)nb.style.display='flex';
  bbcRenderList();
  // Refresh again once Supabase confirms current data, in case another
  // device/teacher changed something since this browser last loaded it.
  bbcLoadData().then(()=>{if(document.getElementById('bbcListView').style.display!=='none')bbcRenderList();});
}

function bbcShowNewForm(){
  document.getElementById('bbcListView').style.display='none';
  document.getElementById('bbcNewView').style.display='';
  document.getElementById('bbcEditorView').style.display='none';
  const bb=document.getElementById('bbcBackBtn'),pb=document.getElementById('bbcPrintBtn'),cb=document.getElementById('bbcCopyBtn'),sb=document.getElementById('bbcStatusBtn'),nb=document.getElementById('bbcNewBtn');
  if(bb)bb.style.display='flex';if(pb)pb.style.display='none';if(cb)cb.style.display='none';if(sb)sb.style.display='none';if(nb)bb&&(nb.style.display='none');
  document.getElementById('bbcNewName').value='';
  document.getElementById('bbcNewStart').value='';
  document.getElementById('bbcNewGuests').value='';
  document.getElementById('bbcNewDayCount').style.display='none';
  document.getElementById('bbcExcursionSection').style.display='none';
  const r=document.querySelector('input[name="bbcNights"][value="5"]');if(r)r.checked=true;
  const tm=document.querySelector('input[name="bbcTourMode"][value="auto"]');if(tm)tm.checked=true;
}

function bbcAutoName(){
  const type=document.getElementById('bbcNewType').value;
  const start=document.getElementById('bbcNewStart').value;
  const nameEl=document.getElementById('bbcNewName');
  if(!start){nameEl.placeholder='e.g. '+type+' | August 2026';return;}
  const dt=new Date(start+'T12:00:00');
  const mo=dt.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  if(!nameEl.value||nameEl.dataset.autoset==='1')nameEl.value=type+' | '+mo;
  nameEl.dataset.autoset='1';
}

function bbcUpdateNights(){
  const start=document.getElementById('bbcNewStart').value;
  const nights=parseInt((document.querySelector('input[name="bbcNights"]:checked')||{value:5}).value);
  const tourMode=(document.querySelector('input[name="bbcTourMode"]:checked')||{value:'auto'}).value;
  const el=document.getElementById('bbcNewDayCount');
  const excSec=document.getElementById('bbcExcursionSection');
  const excDays=document.getElementById('bbcExcursionDays');
  const excLabel=document.getElementById('bbcExcursionLabel');
  if(!start){el.style.display='none';excSec.style.display='none';return;}
  const end=bbcAddDays(start,nights);
  const total=nights+1;
  el.style.display='block';
  el.innerHTML='<span style="color:var(--teal);font-weight:700">'+total+' days / '+nights+' nights</span> &middot; '+bbcFmtDate(start)+' &rarr; '+bbcFmtDate(end);
  bbcAutoName();
  if(tourMode==='none'){
    excSec.style.display='none';
    return;
  }
  const recNote=nights===4?' — 2 tours recommended for a 4-night camp':'';
  if(excLabel)excLabel.innerHTML='Special Activity Days <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:10px">'
    +(tourMode==='custom'?'(pick the tour or ceremony for each day)':'(auto-assigned; lunch served later on return)')+recNote+'</span>';
  let html='';
  for(let i=1;i<total-1;i++){
    const date=bbcAddDays(start,i);
    const picker=tourMode==='custom'
      ?'<select id="bbcCustomPick_'+i+'" onclick="event.stopPropagation()" style="display:none;margin-left:6px;padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;font-family:\'Jost\',sans-serif;font-size:12px;color:var(--dark)"><option value="">— choose —</option>'
        +BBC_SPECIAL_ACTIVITY_OPTIONS.map(n=>'<option value="'+n+'">'+n+'</option>').join('')+'</select>'
      :'';
    html+='<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Jost\',sans-serif;font-size:12.5px;color:var(--dark)">'
      +'<input type="checkbox" data-di="'+i+'"'+(tourMode==='custom'?' onchange="this.nextElementSibling.style.display=this.checked?\'inline-block\':\'none\'"':'')+' style="accent-color:var(--teal)"> Day '+i+' &mdash; '+bbcFmtDate(date)+picker+'</label>';
  }
  excDays.innerHTML=html;
  excSec.style.display=total>2?'':'none';
}

function bbcCreate(){
  const name=document.getElementById('bbcNewName').value.trim();
  const start=document.getElementById('bbcNewStart').value;
  const nights=parseInt((document.querySelector('input[name="bbcNights"]:checked')||{value:5}).value);
  const guestCount=parseInt(document.getElementById('bbcNewGuests').value)||0;
  if(!name||!start||!guestCount){alert('Please fill in all required fields.');return;}
  const tourMode=(document.querySelector('input[name="bbcTourMode"]:checked')||{value:'auto'}).value;
  const excursionDays=[];
  const customPicks={};
  if(tourMode!=='none'){
    document.querySelectorAll('#bbcExcursionDays input[type=checkbox]:checked').forEach(cb=>{
      const di=parseInt(cb.dataset.di);
      excursionDays.push(di);
      if(tourMode==='custom'){
        const sel=document.getElementById('bbcCustomPick_'+di);
        if(sel&&sel.value)customPicks[di]=sel.value;
      }
    });
  }
  const sched=bbcGenSchedule(name,start,nights,excursionDays,guestCount,tourMode,customPicks);
  bbcSchedules.unshift(sched);
  bbcSaveData();
  bbcOpenEditor(sched.id);
}

// Jump straight to a schedule's editor from outside the BBC tab (e.g. a
// calendar click) — switches the panel WITHOUT going through switchTab's
// bbcInit(), which is async and would call bbcShowList() moments later and
// clobber the editor view this just opened.
function bbcJumpToSchedule(schedId){
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  const panel=document.getElementById('tab-bbcsched');if(panel)panel.classList.add('active');
  const btn=document.getElementById('bbcSchedTabBtn');if(btn)btn.classList.add('active');
  localStorage.setItem('ama_last_tab','bbcsched');
  bbcOpenEditor(schedId);
}

function bbcOpenEditor(id){
  bbcCurrentId=id;
  document.getElementById('bbcListView').style.display='none';
  document.getElementById('bbcNewView').style.display='none';
  document.getElementById('bbcEditorView').style.display='';
  const bb=document.getElementById('bbcBackBtn'),pb=document.getElementById('bbcPrintBtn'),cb=document.getElementById('bbcCopyBtn'),sb=document.getElementById('bbcStatusBtn'),nb=document.getElementById('bbcNewBtn');
  if(bb)bb.style.display='flex';if(pb)pb.style.display='flex';if(cb)cb.style.display='flex';if(sb)sb.style.display='';if(nb)nb.style.display='none';
  bbcRenderEditor();
}

function bbcRenderList(){
  bbcLoadData();
  const el=document.getElementById('bbcListContent');if(!el)return;
  const ce=document.getElementById('bbcSchedCount');
  if(ce){ce.textContent=bbcSchedules.length+' schedule'+(bbcSchedules.length!==1?'s':'');ce.style.display=bbcSchedules.length?'':'none';}
  if(!bbcSchedules.length){
    el.innerHTML='<div style="text-align:center;padding:70px 20px"><div style="font-size:42px;margin-bottom:16px;opacity:.3">📋</div><div style="font-size:16px;font-weight:700;color:var(--dark);margin-bottom:8px;font-family:\'Cormorant Garamond\',serif">No BBC Schedules Yet</div><div style="font-size:13px;color:var(--muted);margin-bottom:24px">Create your first schedule to generate a full day-by-day program</div><button onclick="bbcShowNewForm()" style="background:var(--teal);color:#fff;border:none;border-radius:9px;padding:11px 24px;font-family:\'Jost\',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer">+ New Schedule</button></div>';
    return;
  }
  el.innerHTML=bbcSchedules.map(s=>{
    const n=s.days?s.days.length:0,sc=s.status==='confirmed';
    return'<div onclick="bbcOpenEditor(\''+s.id+'\')" style="background:#fff;border:1.5px solid var(--border);border-radius:12px;padding:18px 22px;margin-bottom:12px;cursor:pointer;transition:border-color .15s;display:flex;align-items:center;justify-content:space-between;gap:16px" onmouseover="this.style.borderColor=\'var(--teal)\'" onmouseout="this.style.borderColor=\'var(--border)\'">'
      +'<div style="min-width:0"><div style="font-size:16px;font-weight:700;color:var(--dark);margin-bottom:5px;font-family:\'Cormorant Garamond\',serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+s.name+'</div>'
      +'<div style="font-size:12px;color:var(--muted)">'+bbcFmtDate(s.startDate)+' – '+bbcFmtDate(s.endDate)+' · '+n+' day'+(n!==1?'s':'')+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">'
      +'<span style="background:'+(sc?'#ecfdf5':'#fffbeb')+';color:'+(sc?'#059669':'#d97706')+';border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700">'+(sc?'Confirmed':'Draft')+'</span>'
      +'<button onclick="event.stopPropagation();bbcDeleteSched(\''+s.id+'\')" style="background:none;border:none;cursor:pointer;color:#d1c8c0;font-size:18px;line-height:1;border-radius:6px;padding:2px 6px" onmouseover="this.style.color=\'#ef4444\'" onmouseout="this.style.color=\'#d1c8c0\'">&#x2715;</button>'
      +'</div></div>';
  }).join('');
}

async function bbcDeleteSched(id){
  if(!confirm('Delete this BBC schedule?'))return;
  bbcSchedules=bbcSchedules.filter(s=>s.id!==id);
  // Must land in Supabase BEFORE any reload happens — bbcRenderList() (and
  // bbcShowList() right after it) both re-fetch from Supabase, and if that
  // read won the race against this write, the "deleted" schedule would
  // silently come right back.
  await bbcSaveData();
  bbcRenderList();
}

function bbcGetCurrent(){return bbcSchedules.find(s=>s.id===bbcCurrentId);}

function bbcToggleStatus(){
  const s=bbcGetCurrent();if(!s)return;
  s.status=s.status==='confirmed'?'draft':'confirmed';
  bbcSaveData();
  showToast('Schedule '+(s.status==='confirmed'?'confirmed ✓':'marked as draft'));
  bbcRenderEditor();
}

function bbcRenderEditor(){
  const s=bbcGetCurrent();if(!s)return;
  const sb=document.getElementById('bbcStatusBtn');
  if(sb){sb.textContent=s.status==='confirmed'?'Unconfirm':'Confirm Schedule';sb.style.background=s.status==='confirmed'?'#6b7280':'var(--teal)';}
  const sc=s.status==='confirmed';
  document.getElementById('bbcEditorContent').innerHTML=
    '<div style="max-width:820px;margin:0 auto">'
    +'<div style="background:#fff;border:1.5px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:20px">'
    +'<div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap">'
    +'<div style="flex:1;min-width:200px"><label style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:5px">Schedule Name</label>'
    +'<input value="'+s.name.replace(/"/g,'&quot;')+'" oninput="bbcUpdateName(this.value)" style="font-size:18px;font-weight:700;font-family:\'Cormorant Garamond\',serif;border:none;border-bottom:2px solid var(--border);width:100%;padding:3px 0;color:var(--dark);background:transparent;outline:none"></div>'
    +'<div style="flex-shrink:0;padding-top:18px"><span style="background:'+(sc?'#ecfdf5':'#fffbeb')+';color:'+(sc?'#059669':'#d97706')+';border-radius:20px;padding:4px 14px;font-size:12px;font-weight:700">'+(sc?'✓ Confirmed':'Draft')+'</span></div></div>'
    +'<div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:14px;font-size:12.5px;color:var(--muted)">'
    +'<span><b style="color:var(--dark)">Dates:</b> '+bbcFmtDate(s.startDate)+' – '+bbcFmtDate(s.endDate)+'</span>'
    +'<span><b style="color:var(--dark)">Duration:</b> '+s.days.length+' day'+(s.days.length!==1?'s':'')+'</span>'
    +(s.guestCount?'<span><b style="color:var(--dark)">Guests:</b> '+s.guestCount+'</span>':'')+'</div></div>'
    +s.days.map(function(day,di){return bbcRenderDayCard(s,day,di);}).join('')
    +'<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px;font-style:italic;font-family:\'Cormorant Garamond\',serif;letter-spacing:.3px">With Love, Team Amansala 💙</div>'
    +'</div>';
}

function bbcRenderDayCard(s,day,di){
  const total=s.days.length,isFirst=di===0,isLast=di===total-1;
  const dups=bbcDupInstructors(day.slots),hasDup=dups.length>0;
  const dtc=isFirst?'#0ea5e9':isLast?'#8b5cf6':'#6b7280';
  const dtag=isFirst?'Opening Day':isLast?'Closing Day':'Day '+(di+1)+' of '+total;
  const instDl='<datalist id="bbcInstDl-'+s.id+'-'+di+'">'+BBC_INSTRUCTORS_LIST.map(i=>'<option value="'+i+'">').join('')+'</datalist>';
  const locDl='<datalist id="bbcLocDl-'+s.id+'-'+di+'">'+BBC_LOCATIONS_LIST.map(l=>'<option value="'+l+'">').join('')+'</datalist>';
  const dupWarn=hasDup?'<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:9px 14px;font-size:12px;color:#92400e;margin-bottom:12px;display:flex;align-items:center;gap:8px">⚠ <b>Duplicate instructor'+(dups.length>1?'s':'')+':</b> '+dups.join(', ')+' — assign different teachers for these sessions</div>':'';
  const slotRows=day.slots.map(function(slot,si){return bbcRenderSlotRow(s.id,di,slot,si,dups,day.date);}).join('');
  return'<div style="background:#fff;border:1.5px solid '+(hasDup?'#fcd34d':(isFirst||isLast)?'#b2d8d8':'var(--border)')+';border-radius:12px;margin-bottom:14px;overflow:hidden">'
    +'<div onclick="bbcToggleDay(\''+s.id+'\','+di+')" style="padding:14px 20px;cursor:pointer;display:flex;align-items:center;gap:12px;background:'+(isFirst||isLast?'#f0f9f9':'#fafaf9')+';border-bottom:1px solid var(--border);user-select:none">'
    +'<svg id="bbcChev-'+s.id+'-'+di+'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transition:transform .2s;flex-shrink:0;color:var(--muted)"><polyline points="9 18 15 12 9 6"/></svg>'
    +'<div style="flex:1"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
    +'<span style="font-size:14.5px;font-weight:700;color:var(--dark);font-family:\'Cormorant Garamond\',serif">'+bbcFmtDate(day.date)+'</span>'
    +'<span style="background:'+dtc+'20;color:'+dtc+';border-radius:20px;padding:2px 10px;font-size:10.5px;font-weight:700">'+dtag+'</span>'
    +(hasDup?'<span style="background:#fef3c7;color:#92400e;border-radius:20px;padding:2px 10px;font-size:10.5px;font-weight:700">⚠ '+dups.join(', ')+'</span>':'')
    +'</div>'+(day.prompt?'<div style="font-size:11px;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:500px">'+day.prompt.substring(0,90)+(day.prompt.length>90?'…':'')+'</div>':'<div style="font-size:11px;color:#ccc;margin-top:2px">No prompt set</div>')
    +'</div><span style="font-size:11px;color:var(--muted);flex-shrink:0">'+day.slots.length+' slot'+(day.slots.length!==1?'s':'')+'</span></div>'
    +'<div id="bbcDayBody-'+s.id+'-'+di+'" style="display:none;padding:18px 20px">'
    +'<div style="margin-bottom:12px"><label style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Header Note <span style="font-weight:400;text-transform:none;letter-spacing:0">(optional — e.g. ✨ Happy New Years Eve ✨)</span></label>'
    +'<input value="'+(day.note||'').replace(/"/g,'&quot;')+'" oninput="bbcUpdateDay(\''+s.id+'\','+di+',\'note\',this.value)" placeholder="Special header or theme for this day..." style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Jost\',sans-serif;font-size:13px;color:var(--dark);box-sizing:border-box;outline:none"></div>'
    +'<div style="margin-bottom:16px"><label style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Daily Prompt</label>'
    +'<textarea oninput="bbcUpdateDay(\''+s.id+'\','+di+',\'prompt\',this.value)" placeholder="Enter the daily reflection question for this day..." style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Jost\',sans-serif;font-size:13px;color:var(--dark);box-sizing:border-box;min-height:64px;resize:vertical;line-height:1.55">'+(day.prompt||'')+'</textarea></div>'
    +dupWarn+instDl+locDl
    +'<div style="border:1.5px solid var(--border);border-radius:9px;overflow:hidden">'
    +'<div style="display:grid;grid-template-columns:120px 1fr 145px 125px 36px;background:#f8f7f5;padding:7px 10px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid var(--border)">'
    +'<span>Time</span><span style="padding-left:2px">Activity</span><span>Instructor</span><span>Location</span><span></span></div>'
    +slotRows+'</div>'
    +'<button onclick="bbcAddSlot(\''+s.id+'\','+di+')" style="margin-top:10px;width:100%;padding:8px;background:#f5f1eb;color:var(--teal);border:1.5px dashed #b2d8d8;border-radius:8px;font-family:\'Jost\',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer" onmouseover="this.style.background=\'#e8f4f4\'" onmouseout="this.style.background=\'#f5f1eb\'">+ Add Slot</button>'
    +'</div></div>';
}

function bbcRenderSlotRow(schedId,di,slot,si,dups,date){
  const isMeal=slot.type==='meal',isEvent=slot.type==='event';
  const isTour=isEvent&&BBC_TOUR_NAMES.has(slot.activity);
  const isDup=slot.instructor&&slot.instructor.trim()!=='Ryan'&&slot.instructor.trim()!==''&&dups.includes(slot.instructor.trim());
  const bg=isMeal?'#fafaf9':isEvent?'#fdf4ff':'#fff';
  const actStyle=isMeal?'font-weight:600;color:var(--teal)':isEvent?'font-weight:600;color:#7c3aed':'color:var(--dark)';
  return'<div style="display:grid;grid-template-columns:120px 1fr 145px 125px 36px;align-items:stretch;border-top:1px solid var(--border);background:'+bg+'">'
    +'<div style="padding:5px 10px;display:flex;align-items:center;border-right:1px solid var(--border)">'
    +'<input value="'+slot.time+'" oninput="bbcSlotField(\''+schedId+'\','+di+','+si+',\'time\',this.value)" style="width:100%;border:none;background:transparent;font-family:\'Jost\',sans-serif;font-size:11.5px;color:#6b7280;outline:none" placeholder="Time"></div>'
    +'<div style="padding:5px 10px;display:flex;align-items:center;border-right:1px solid var(--border)">'
    +'<input value="'+slot.activity.replace(/"/g,'&quot;')+'" oninput="bbcSlotField(\''+schedId+'\','+di+','+si+',\'activity\',this.value)" style="width:100%;border:none;background:transparent;font-family:\'Jost\',sans-serif;font-size:12.5px;'+actStyle+';outline:none" placeholder="Activity..."></div>'
    +'<div style="padding:5px 8px;display:flex;align-items:center;border-right:1px solid var(--border)">'
    +(isMeal?'<span style="font-size:11px;color:#d1d5db;padding-left:2px">—</span>':'<input value="'+slot.instructor+'" oninput="bbcSlotField(\''+schedId+'\','+di+','+si+',\'instructor\',this.value)" list="bbcInstDl-'+schedId+'-'+di+'" style="width:100%;border:1px solid '+(isDup?'#f59e0b':'#e5e7eb')+';border-radius:6px;padding:4px 7px;font-family:\'Jost\',sans-serif;font-size:12px;color:var(--dark);background:'+(isDup?'#fffbeb':'#fff')+';outline:none" placeholder="Instructor...">')
    +'</div><div style="padding:5px 8px;display:flex;flex-direction:column;justify-content:center;border-right:1px solid var(--border)">'
    +(isMeal||isTour?'<span style="font-size:11px;color:#d1d5db;padding-left:2px">—</span>':(function(){
      const cfls=bbcGetShalaConflicts(date,slot.location);
      const cfBorder=cfls.length?'#f87171':'#e5e7eb';
      const cfBg=cfls.length?'#fff5f5':'#fff';
      const cfHtml=cfls.length?'<div title="'+cfls.join(' | ').replace(/"/g,'&quot;')+'" style="font-size:9.5px;color:#dc2626;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:help">⚠ '+cfls[0].substring(0,28)+(cfls[0].length>28||cfls.length>1?'…':'')+'</div>':'';
      return'<input value="'+slot.location+'" oninput="bbcSlotField(\''+schedId+'\','+di+','+si+',\'location\',this.value)" onchange="bbcCheckLocationConflict(\''+schedId+'\','+di+','+si+',this.value,\''+slot.location.replace(/'/g,"\\'")+'\')" list="bbcLocDl-'+schedId+'-'+di+'" style="width:100%;border:1px solid '+cfBorder+';border-radius:6px;padding:4px 7px;font-family:\'Jost\',sans-serif;font-size:12px;color:var(--dark);background:'+cfBg+';outline:none" placeholder="Location...">'+cfHtml;
    })())
    +'</div><div style="display:flex;align-items:center;justify-content:center;padding:4px">'
    +(slot.fixed?'<span style="font-size:10px;color:#d1d5db" title="Fixed slot">⚓</span>':'<button onclick="bbcRemoveSlot(\''+schedId+'\','+di+','+si+')" style="background:none;border:none;cursor:pointer;color:#d1d5db;font-size:15px;width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center" onmouseover="this.style.color=\'#ef4444\';this.style.background=\'#fef2f2\'" onmouseout="this.style.color=\'#d1d5db\';this.style.background=\'none\'" title="Remove">&#x2715;</button>')
    +'</div></div>';
}

function bbcToggleDay(schedId,di){
  const body=document.getElementById('bbcDayBody-'+schedId+'-'+di);
  const chev=document.getElementById('bbcChev-'+schedId+'-'+di);
  if(!body)return;
  const open=body.style.display==='block';
  body.style.display=open?'none':'block';
  if(chev)chev.style.transform=open?'':'rotate(90deg)';
}

function bbcUpdateName(val){const s=bbcGetCurrent();if(!s)return;s.name=val;bbcSaveData();}

function bbcUpdateDay(schedId,di,field,val){
  const s=bbcSchedules.find(x=>x.id===schedId);
  if(!s||!s.days[di])return;
  s.days[di][field]=val;
  bbcSaveData();
  clearTimeout(window._bbcDayTimer);
  window._bbcDayTimer=setTimeout(function(){
    const wasOpen=document.getElementById('bbcDayBody-'+schedId+'-'+di)&&document.getElementById('bbcDayBody-'+schedId+'-'+di).style.display==='block';
    bbcRenderEditor();
    const nb=document.getElementById('bbcDayBody-'+schedId+'-'+di);
    if(nb&&wasOpen){nb.style.display='block';const ch=document.getElementById('bbcChev-'+schedId+'-'+di);if(ch)ch.style.transform='rotate(90deg)';}
  },700);
}

function bbcSlotField(schedId,di,si,field,val){
  const s=bbcSchedules.find(x=>x.id===schedId);
  if(!s||!s.days[di]||!s.days[di].slots[si])return;
  s.days[di].slots[si][field]=val;
  bbcSaveData();
  if(field==='instructor'){
    clearTimeout(window._bbcSlotTimer);
    window._bbcSlotTimer=setTimeout(function(){
      const wasOpen=document.getElementById('bbcDayBody-'+schedId+'-'+di)&&document.getElementById('bbcDayBody-'+schedId+'-'+di).style.display==='block';
      bbcRenderEditor();
      const nb=document.getElementById('bbcDayBody-'+schedId+'-'+di);
      if(nb&&wasOpen){nb.style.display='block';const ch=document.getElementById('bbcChev-'+schedId+'-'+di);if(ch)ch.style.transform='rotate(90deg)';}
    },900);
  }
}

// Hard block, not just a warning: if a yoga retreat already has this shala
// booked for this date, the location edit is rejected and reverted rather
// than silently allowed (the red-border+tooltip on the input is a live
// indicator of the same check, but this is what actually stops the save).
function bbcCheckLocationConflict(schedId,di,si,val,prevVal){
  const s=bbcSchedules.find(x=>x.id===schedId);
  if(!s||!s.days[di]||!s.days[di].slots[si])return;
  const cfls=bbcGetShalaConflicts(s.days[di].date,val);
  if(cfls.length){
    alert('That shala is already booked for this date:\n\n'+cfls.join('\n')+'\n\nPlease choose a different location.');
    s.days[di].slots[si].location=prevVal||'';
    bbcSaveData();
    bbcRenderEditor();
  }
}

function bbcAddSlot(schedId,di){
  const s=bbcSchedules.find(x=>x.id===schedId);if(!s||!s.days[di])return;
  s.days[di].slots.push(bbcMakeSlot('','','','',false,'class'));
  bbcSaveData();
  bbcRenderEditor();
  const nb=document.getElementById('bbcDayBody-'+schedId+'-'+di);
  if(nb){nb.style.display='block';const ch=document.getElementById('bbcChev-'+schedId+'-'+di);if(ch)ch.style.transform='rotate(90deg)';}
}

function bbcRemoveSlot(schedId,di,si){
  const s=bbcSchedules.find(x=>x.id===schedId);if(!s||!s.days[di])return;
  s.days[di].slots.splice(si,1);
  bbcSaveData();
  const wasOpen=document.getElementById('bbcDayBody-'+schedId+'-'+di)&&document.getElementById('bbcDayBody-'+schedId+'-'+di).style.display==='block';
  bbcRenderEditor();
  const nb=document.getElementById('bbcDayBody-'+schedId+'-'+di);
  if(nb&&wasOpen){nb.style.display='block';const ch=document.getElementById('bbcChev-'+schedId+'-'+di);if(ch)ch.style.transform='rotate(90deg)';}
}

function bbcPrint(){
  const s=bbcGetCurrent();if(!s)return;
  const win=window.open('','_blank');if(!win)return;
  const total=s.days.length;
  const dayHtml=s.days.map(function(day,di){
    const isFirst=di===0,isLast=di===total-1;
    const dtc=isFirst?'#0e9494':isLast?'#8b5cf6':'#6b7280';
    const dtag=isFirst?'Arrival Day':isLast?'Departure Day':'Day '+(di+1)+' of '+total;
    const noteH=day.note?'<div style="font-size:16px;font-weight:700;color:#2d6a6a;margin-bottom:14px;font-family:\'Cormorant Garamond\',serif">'+day.note+'</div>':'';
    const promptH=day.prompt?'<div style="font-size:13.5px;font-style:italic;color:#5a5048;margin-bottom:20px;line-height:1.7;background:#faf7f2;border-radius:8px;padding:12px 16px;border-left:3px solid #b2d8d8">'+day.prompt+'</div>':'';
    const slotsH=day.slots.map(function(slot){
      const isMeal=slot.type==='meal',isEvent=slot.type==='event';
      if(isMeal){
        return'<div style="display:flex;align-items:baseline;gap:10px;padding:7px 0;color:#a8998a;font-style:italic;font-size:12.5px">'
          +'<span style="width:80px;flex-shrink:0;white-space:nowrap;font-variant-numeric:tabular-nums">'+(slot.time||'')+'</span><span>'+slot.activity+'</span></div>';
      }
      const nameColor=isEvent?'#7c3aed':'#2d2520';
      const pill=slot.location?'<span style="font-size:10.5px;font-weight:700;color:#2d6a6a;background:#eaf4f2;border-radius:20px;padding:2px 9px;white-space:nowrap;margin-left:auto">'+slot.location+'</span>':'';
      return'<div style="display:flex;align-items:baseline;gap:10px;padding:9px 0;border-bottom:1px solid #f0ece4">'
        +'<span style="width:80px;flex-shrink:0;white-space:nowrap;font-size:12px;font-weight:700;color:#2d6a6a;font-variant-numeric:tabular-nums">'+(slot.time||'')+'</span>'
        +'<div style="flex:1;display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 10px">'
        +'<span style="font-size:15px;font-weight:700;color:'+nameColor+';font-family:\'Cormorant Garamond\',serif">'+slot.activity+'</span>'
        +(slot.instructor?'<span style="font-size:12px;color:#8a7e74">w/ '+slot.instructor+'</span>':'')
        +pill+'</div></div>';
    }).join('');
    return'<div style="margin-bottom:26px;padding:22px 26px;background:#fff;border:1.5px solid #ede7db;border-radius:14px;page-break-inside:avoid">'
      +'<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">'
      +'<h2 style="margin:0;font-size:21px;font-family:\'Cormorant Garamond\',serif;color:#2d2520">'+bbcFmtDate(day.date)+'</h2>'
      +'<span style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:'+dtc+';background:'+dtc+'18;border-radius:20px;padding:3px 11px">'+dtag+'</span>'
      +'</div>'
      +noteH+promptH+'<div>'+slotsH+'</div></div>';
  }).join('');
  win.document.write('<!DOCTYPE html><html><head><link rel="icon" type="image/png" href="/favicon.png"><title>'+s.name+'</title>'
    +'<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;700&family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">'
    +'<style>body{font-family:\'Jost\',Helvetica,Arial,sans-serif;margin:0;padding:36px 20px;color:#2d2520;background:#f5f1eb}'
    +'.sheet{max-width:700px;margin:0 auto}@media print{body{padding:16px;background:#fff}.sheet{max-width:none}}</style></head><body><div class="sheet">'
    +'<div style="text-align:center;margin-bottom:32px;padding-bottom:22px;border-bottom:2px solid #2d6a6a">'
    +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:#2d6a6a;margin-bottom:10px">Amansala · Tulum</div>'
    +'<h1 style="margin:0;font-size:32px;font-family:\'Cormorant Garamond\',serif;font-weight:700;color:#2d2520">'+s.name+'</h1>'
    +'<div style="font-size:13.5px;color:#8a7e74;margin-top:8px">'+bbcFmtDate(s.startDate)+' – '+bbcFmtDate(s.endDate)+' · '+s.days.length+' Days</div>'
    +(s.status==='confirmed'?'<div style="display:inline-block;background:#ecfdf5;color:#059669;border-radius:20px;padding:4px 16px;font-size:12px;font-weight:700;margin-top:12px">✓ Confirmed</div>':'')
    +'</div>'+dayHtml
    +'<div style="text-align:center;padding:26px 0 10px;color:#a8998a;font-size:13px;font-style:italic;font-family:\'Cormorant Garamond\',serif">With Love, Team Amansala 💙</div>'
    +'</div></body></html>');
  win.document.close();
  setTimeout(function(){win.print();},500);
}

// Whole schedule as plain text (name, dates, every day, every slot) for
// pasting into another program — no HTML/formatting, just readable lines.
function bbcScheduleAsText(s){
  const lines=[];
  s.days.forEach(function(day){
    lines.push(bbcFmtDate(day.date).toUpperCase());
    if(day.note)lines.push(day.note);
    if(day.prompt)lines.push('Prompt: '+day.prompt);
    day.slots.forEach(function(slot){
      let line=(slot.time||'').padEnd(14)+slot.activity;
      if(slot.instructor)line+=' w/ '+slot.instructor;
      if(slot.location)line+=' | '+slot.location;
      lines.push(line);
    });
    lines.push('');
  });
  lines.push('With Love, Team Amansala');
  return lines.join('\n');
}

function bbcCopyAsText(){
  const s=bbcGetCurrent();if(!s)return;
  const text=bbcScheduleAsText(s);
  navigator.clipboard.writeText(text).then(function(){
    showToast('Schedule copied — paste it anywhere.');
  }).catch(function(){
    // Clipboard API can be blocked (permissions, non-HTTPS, etc.) — fall
    // back to a selectable textarea so the text is still reachable.
    const win=window.open('','_blank','width=600,height=700');
    if(!win)return;
    win.document.write('<textarea style="width:100%;height:95vh;font-family:monospace;font-size:13px;padding:12px;box-sizing:border-box">'+text.replace(/</g,'&lt;')+'</textarea>');
    win.document.close();
  });
}

// Wrap switchTab to initialize BBC on first open
(function(){
  var _origST=window.switchTab;
  window.switchTab=function(id,btn){_origST&&_origST(id,btn);if(id==='bbcsched')setTimeout(bbcInit,50);};
})();
// ==================== END BBC SCHEDULE MODULE ====================

