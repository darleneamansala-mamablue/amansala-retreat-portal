// ===== bbc-schedule.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ==================== BBC SCHEDULE MODULE ====================
// Instructor rotations per Bikini Bootcamp spec
const BBC_MORNING_YOGA_ROTATION=['Darlene','Kun','Yolanda','Kun','Kun']; // index = full-day index (0-based)
const BBC_EVENING_YOGA_ROTATION=['Kun','Maya','Kun','Yolanda','Maya'];   // index = full-day index (0-based)
const BBC_DANCE_ROTATION=[
  {activity:'Latin Grooves',instructor:'Sergio',location:'Heaven'},
  {activity:'AfroBeats',    instructor:'Sergio',location:'Grande'},
  {activity:'Bollywood',    instructor:'Sergio',location:'Heaven'},
];
const BBC_INSTRUCTORS_LIST=['Ryan','Darlene','Adele','Sergio','Yolanda','Kun','Maya','Kiki','Fernando','Marco'];
const BBC_LOCATIONS_LIST=['Beachfront','Grande','Heaven','Chica','Skye'];

function bbcLocToShalaId(loc){
  if(!loc)return null;
  const m={'beachfront':'beachfront','grande':'grande','heaven':'heaven','chica':'chica','skye':'skye'};
  return m[loc.toLowerCase().trim()]||null;
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
function bbcLoadData(){try{bbcSchedules=JSON.parse(localStorage.getItem('bbc_schedules')||'[]');}catch(e){bbcSchedules=[];}}
function bbcSaveData(){
  localStorage.setItem('bbc_schedules',JSON.stringify(bbcSchedules));
  try{db.from('app_store').upsert({key:'bbc_schedules',value:bbcSchedules},true);}catch(e){}
}
function bbcFmtDate(d){const dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});}
function bbcAddDays(ds,n){const d=new Date(ds+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().split('T')[0];}
function bbcDayCount(s,e){return Math.round((new Date(e+'T12:00:00')-new Date(s+'T12:00:00'))/86400000)+1;}
function bbcMakeSlot(time,activity,instructor,location,fixed,type){return{id:bbcUid(),time,activity,instructor:instructor||'',location:location||'',fixed:!!fixed,type:type||'class'};}

function bbcGenDaySlots(di,total,excursionDays){
  const isFirst=di===0,isLast=di===total-1;
  const fullIdx=di-1; // 0-based index for full days (negative for arrival day)
  // Activation alternates by full-day index
  const activation=isFirst?'Breathwork':isLast?'Meditation':(fullIdx%2===0?'Breathwork':'Meditation');
  // Yoga instructors from spec rotations; arrival/departure always Darlene
  const morningYoga=(isFirst||isLast)?'Darlene':BBC_MORNING_YOGA_ROTATION[Math.min(fullIdx,BBC_MORNING_YOGA_ROTATION.length-1)];
  const eveningYoga=isFirst?'Kun':BBC_EVENING_YOGA_ROTATION[Math.min(fullIdx,BBC_EVENING_YOGA_ROTATION.length-1)];
  // Dance cycles Latin → Afro → Bollywood, always Sergio
  const dance=BBC_DANCE_ROTATION[(isFirst?0:fullIdx)%BBC_DANCE_ROTATION.length];
  const yogaLabel=(isFirst||isLast)?'Yoga Mala':'Yoga';
  const circuitLabel=(isFirst||isLast)?'BBC 20':'Circuit Training';
  const aftLoc=isFirst?'Heaven':'Grande';
  const hasExcursion=!isFirst&&!isLast&&excursionDays&&excursionDays.includes(di);

  // Arrival day is a half day — starts at 4:45 with Sculpt & Tone
  if(isFirst){
    const slots=[
      bbcMakeSlot('4:45 – 5:30','Sculpt & Tone','Ryan','Grande',false,'class'),
      bbcMakeSlot('5:45 – 6:45','Gentle Yoga','Kun','Heaven',false,'class'),
      bbcMakeSlot('7:00','Opening Circle','Ryan','Heaven',false,'event'),
      bbcMakeSlot('7:45','Dinner','','',true,'meal'),
    ];
    return slots;
  }

  const slots=[
    bbcMakeSlot('7:00','Coffee | Tea & Morning Pages','','',true,'meal'),
    bbcMakeSlot('7:00 – 7:15','Grand Rising — '+activation,'Ryan','Beachfront',false,'class'),
    bbcMakeSlot('7:30 – 8:15','Morning Beach Walk','Ryan','Beachfront',false,'class'),
    bbcMakeSlot('8:30 – 9:30',yogaLabel,morningYoga,isLast?'Beachfront':'Grande',false,'class'),
    bbcMakeSlot('9:30','Breakfast','','',true,'meal'),
    bbcMakeSlot('10:45 – 11:30',circuitLabel,'Ryan','Grande',false,'class'),
  ];

  if(hasExcursion){
    slots.push(bbcMakeSlot('1:30 – 5:30','Excursion','','',false,'event'));
    slots.push(bbcMakeSlot('6:00','Late Lunch','','',true,'meal'));
  } else {
    slots.push(bbcMakeSlot('1:30','Lunch','','',true,'meal'));
    if(!isLast){
      slots.push(bbcMakeSlot('4:00 – 4:45',dance.activity,dance.instructor,aftLoc,false,'class'));
      slots.push(bbcMakeSlot('4:45 – 5:30','Pilates','Adele',aftLoc,false,'class'));
      slots.push(bbcMakeSlot('5:45 – 6:45','Gentle Yoga',eveningYoga,isFirst?'Heaven':'Beachfront',false,'class'));
    }
  }

  if(isFirst){
    slots.push(bbcMakeSlot('7:00','Opening Circle','Ryan','Heaven',false,'event'));
    slots.push(bbcMakeSlot('7:45','Dinner','','',true,'meal'));
  } else if(isLast){
    slots.push(bbcMakeSlot('7:00','Closing Circle','Ryan','Heaven',false,'event'));
    slots.push(bbcMakeSlot('7:30','Offsite Dinner','','',true,'meal'));
  } else {
    slots.push(bbcMakeSlot('7:30','Dinner','','',true,'meal'));
  }
  return slots;
}

function bbcGenSchedule(name,start,nights,excursionDays){
  const total=nights+1; // arrival day + N nights; last day = departure morning
  const end=bbcAddDays(start,nights);
  const days=[];
  for(let i=0;i<total;i++){
    const prompt=BBC_MORNING_PAGES[Math.min(i,BBC_MORNING_PAGES.length-1)];
    days.push({date:bbcAddDays(start,i),prompt,note:'',slots:bbcGenDaySlots(i,total,excursionDays||[])});
  }
  return{id:bbcUid(),name,startDate:start,endDate:end,nights,status:'draft',createdAt:new Date().toISOString(),days};
}

function bbcDupInstructors(slots){
  const c={};
  slots.forEach(s=>{if(!s.instructor||s.instructor.trim()==='Ryan'||s.type==='meal')return;const k=s.instructor.trim();c[k]=(c[k]||0)+1;});
  return Object.keys(c).filter(k=>c[k]>1);
}

function bbcInit(){bbcLoadData();bbcShowList();}

function bbcShowList(){
  bbcCurrentId=null;
  document.getElementById('bbcListView').style.display='';
  document.getElementById('bbcNewView').style.display='none';
  document.getElementById('bbcEditorView').style.display='none';
  const bb=document.getElementById('bbcBackBtn'),pb=document.getElementById('bbcPrintBtn'),sb=document.getElementById('bbcStatusBtn'),nb=document.getElementById('bbcNewBtn');
  if(bb)bb.style.display='none';if(pb)pb.style.display='none';if(sb)sb.style.display='none';if(nb)nb.style.display='flex';
  bbcRenderList();
}

function bbcShowNewForm(){
  document.getElementById('bbcListView').style.display='none';
  document.getElementById('bbcNewView').style.display='';
  document.getElementById('bbcEditorView').style.display='none';
  const bb=document.getElementById('bbcBackBtn'),pb=document.getElementById('bbcPrintBtn'),sb=document.getElementById('bbcStatusBtn'),nb=document.getElementById('bbcNewBtn');
  if(bb)bb.style.display='flex';if(pb)pb.style.display='none';if(sb)sb.style.display='none';if(nb)bb&&(nb.style.display='none');
  document.getElementById('bbcNewName').value='';
  document.getElementById('bbcNewStart').value='';
  document.getElementById('bbcNewDayCount').style.display='none';
  document.getElementById('bbcExcursionSection').style.display='none';
  const r=document.querySelector('input[name="bbcNights"][value="5"]');if(r)r.checked=true;
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
  const el=document.getElementById('bbcNewDayCount');
  const excSec=document.getElementById('bbcExcursionSection');
  const excDays=document.getElementById('bbcExcursionDays');
  if(!start){el.style.display='none';excSec.style.display='none';return;}
  const end=bbcAddDays(start,nights);
  const total=nights+1;
  el.style.display='block';
  el.innerHTML='<span style="color:var(--teal);font-weight:700">'+total+' days / '+nights+' nights</span> &middot; '+bbcFmtDate(start)+' &rarr; '+bbcFmtDate(end);
  bbcAutoName();
  let html='';
  for(let i=1;i<total-1;i++){
    const date=bbcAddDays(start,i);
    html+='<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Jost\',sans-serif;font-size:12.5px;color:var(--dark)">'
      +'<input type="checkbox" data-di="'+i+'" style="accent-color:var(--teal)"> Day '+i+' &mdash; '+bbcFmtDate(date)+'</label>';
  }
  excDays.innerHTML=html;
  excSec.style.display=total>2?'':'none';
}

function bbcCreate(){
  const name=document.getElementById('bbcNewName').value.trim();
  const start=document.getElementById('bbcNewStart').value;
  const nights=parseInt((document.querySelector('input[name="bbcNights"]:checked')||{value:5}).value);
  if(!name||!start){alert('Please fill in all required fields.');return;}
  const excursionDays=[];
  document.querySelectorAll('#bbcExcursionDays input[type=checkbox]:checked').forEach(cb=>{excursionDays.push(parseInt(cb.dataset.di));});
  const sched=bbcGenSchedule(name,start,nights,excursionDays);
  bbcSchedules.unshift(sched);
  bbcSaveData();
  bbcOpenEditor(sched.id);
}

function bbcOpenEditor(id){
  bbcCurrentId=id;
  document.getElementById('bbcListView').style.display='none';
  document.getElementById('bbcNewView').style.display='none';
  document.getElementById('bbcEditorView').style.display='';
  const bb=document.getElementById('bbcBackBtn'),pb=document.getElementById('bbcPrintBtn'),sb=document.getElementById('bbcStatusBtn'),nb=document.getElementById('bbcNewBtn');
  if(bb)bb.style.display='flex';if(pb)pb.style.display='flex';if(sb)sb.style.display='';if(nb)nb.style.display='none';
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

function bbcDeleteSched(id){
  if(!confirm('Delete this BBC schedule?'))return;
  bbcSchedules=bbcSchedules.filter(s=>s.id!==id);
  bbcSaveData();bbcRenderList();
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
    +'<span><b style="color:var(--dark)">Duration:</b> '+s.days.length+' day'+(s.days.length!==1?'s':'')+'</span></div></div>'
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
    +(isMeal?'<span style="font-size:11px;color:#d1d5db;padding-left:2px">—</span>':(function(){
      const cfls=bbcGetShalaConflicts(date,slot.location);
      const cfBorder=cfls.length?'#f87171':'#e5e7eb';
      const cfBg=cfls.length?'#fff5f5':'#fff';
      const cfHtml=cfls.length?'<div title="'+cfls.join(' | ').replace(/"/g,'&quot;')+'" style="font-size:9.5px;color:#dc2626;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:help">⚠ '+cfls[0].substring(0,28)+(cfls[0].length>28||cfls.length>1?'…':'')+'</div>':'';
      return'<input value="'+slot.location+'" oninput="bbcSlotField(\''+schedId+'\','+di+','+si+',\'location\',this.value)" list="bbcLocDl-'+schedId+'-'+di+'" style="width:100%;border:1px solid '+cfBorder+';border-radius:6px;padding:4px 7px;font-family:\'Jost\',sans-serif;font-size:12px;color:var(--dark);background:'+cfBg+';outline:none" placeholder="Location...">'+cfHtml;
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
  const dayHtml=s.days.map(function(day,di){
    const total=s.days.length,isFirst=di===0,isLast=di===total-1;
    const noteH=day.note?'<div style="font-size:17px;font-weight:700;text-align:center;color:#2d6a6a;margin-bottom:12px;font-family:Georgia,serif">'+day.note+'</div>':'';
    const promptH=day.prompt?'<div style="font-size:14px;font-style:italic;color:#4a6a6a;margin-bottom:18px;line-height:1.7;border-left:3px solid #b2d8d8;padding-left:12px">'+day.prompt+'</div>':'';
    const slotsH=day.slots.map(function(slot){
      const isMeal=slot.type==='meal',isEvent=slot.type==='event';
      let line='<b>'+slot.time+'</b>  '+slot.activity;
      if(slot.instructor)line+=' w/ '+slot.instructor;
      if(slot.location)line+=' | '+slot.location;
      const st=isMeal?'font-weight:700;color:#2d6a6a;':isEvent?'font-weight:600;color:#7c3aed;':'';
      return'<div style="padding:6px 0;border-bottom:1px solid #f0ece4;font-size:14px;line-height:1.4;'+st+'">'+line+'</div>';
    }).join('');
    const bgC=isFirst||isLast?'#f0f9f9':'#fff';
    const bdC=isFirst?'#0ea5e9':isLast?'#8b5cf6':'#e5e7eb';
    return'<div style="margin-bottom:32px;padding:20px 24px;background:'+bgC+';border-radius:10px;border-left:4px solid '+bdC+';page-break-inside:avoid">'
      +'<h2 style="margin:0 0 10px;font-size:20px;font-family:Georgia,serif;color:#1a3333">'+bbcFmtDate(day.date)+'</h2>'
      +noteH+promptH+'<div>'+slotsH+'</div></div>';
  }).join('');
  win.document.write('<!DOCTYPE html><html><head><link rel="icon" type="image/png" href="/favicon.png"><title>'+s.name+'</title><style>body{font-family:Helvetica Neue,Arial,sans-serif;margin:0;padding:32px 40px;color:#1a2332;max-width:720px;margin:0 auto}@media print{body{padding:20px}}</style></head><body>'
    +'<div style="text-align:center;margin-bottom:36px;padding-bottom:24px;border-bottom:2px solid #2d6a6a">'
    +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#2d6a6a;margin-bottom:8px">Amansala · Tulum</div>'
    +'<h1 style="margin:0;font-size:28px;font-family:Georgia,serif;color:#1a3333">'+s.name+'</h1>'
    +'<div style="font-size:14px;color:#6b7280;margin-top:8px">'+bbcFmtDate(s.startDate)+' – '+bbcFmtDate(s.endDate)+' · '+s.days.length+' Days</div>'
    +(s.status==='confirmed'?'<div style="display:inline-block;background:#ecfdf5;color:#059669;border-radius:20px;padding:4px 16px;font-size:12px;font-weight:700;margin-top:10px">✓ Confirmed</div>':'')
    +'</div>'+dayHtml
    +'<div style="text-align:center;padding:24px;color:#9ca3af;font-size:13px;font-style:italic">With Love, Team Amansala 💙</div>'
    +'</body></html>');
  win.document.close();
  setTimeout(function(){win.print();},500);
}

// Wrap switchTab to initialize BBC on first open
(function(){
  var _origST=window.switchTab;
  window.switchTab=function(id,btn){_origST&&_origST(id,btn);if(id==='bbcsched')setTimeout(bbcInit,50);};
})();
// ==================== END BBC SCHEDULE MODULE ====================

