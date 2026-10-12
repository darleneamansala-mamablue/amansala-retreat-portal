// ===== activity-poster.js — printable "Join us this week" activities sheet for all guests (room-only too) =====
// Loaded as a classic script AFTER activity-sheet.js and retreat-builder.js; shares global scope. Standalone module:
// nothing in activity-sheet.js is modified — the button is injected next to Refresh on the Activity Sheet tab.
// Lists the tours and ceremonies that are on a retreat's schedule during the week shown on the Activity Sheet, by day
// and time, with the list price per person, so a guest who is only booked room-only can see what they are able to join.
// No group names are shown. Same activity + same day + same time from two retreats is listed once.

// Tours + ceremonies only (same ids as TOUR_AO_IDS / CEREMONY_AO_IDS in teacher-portal.js). Meals, massage, the
// included salsa class and the hidden Cooking Class are not joinable extras.
const APOSTER_IDS=['ao1','ao2','ao3','ao6','ao7','ao4','ao5','ao9','ao10'];
const APOSTER_SIGNUP_KEY='ama_activity_poster_signup';

function apEsc(x){return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function apFmtT(t){if(!t)return '';const[h,m]=t.split(':').map(Number);return((h%12)||12)+':'+String(m).padStart(2,'0')+(h>=12?' PM':' AM');}
function apAddMin(t,min){const[h,m]=t.split(':').map(Number);const tot=h*60+m+min;return String(Math.floor(tot/60)%24).padStart(2,'0')+':'+String(tot%60).padStart(2,'0');}
function apMoney(p){p=Number(p)||0;return Number.isInteger(p)?String(p):p.toFixed(2);}

// { 'YYYY-MM-DD': [ {aoId,name,desc,price,time,end} ] } for the week starting at monday (YYYY-MM-DD)
function apCollectWeek(monday){
  const days=[];
  for(let i=0;i<7;i++){const d=new Date(monday+'T12:00:00');d.setDate(d.getDate()+i);days.push(d.toISOString().split('T')[0]);}
  const aoMap={};(typeof ADD_ONS!=='undefined'?ADD_ONS:[]).forEach(a=>{aoMap[a.id]=a;});
  const byDay={};days.forEach(d=>{byDay[d]=[];});
  const seen=new Set();
  AppData.bookings.filter(b=>b.status!=='cancelled').forEach(bk=>{
    (bk.retreatActivities||[]).forEach(act=>{
      if(!APOSTER_IDS.includes(act.aoId))return;
      const ds=(act.date||'').slice(0,10);
      if(!byDay[ds])return;
      const key=act.aoId+'|'+ds+'|'+(act.time||'');
      if(seen.has(key))return;seen.add(key);
      const ao=aoMap[act.aoId];if(!ao)return;
      const dur=(typeof ACTS_DUR!=='undefined'&&ACTS_DUR[act.aoId])||0;
      byDay[ds].push({aoId:act.aoId,name:ao.name,desc:ao.desc||'',price:ao.price,time:act.time||'',end:(act.time&&dur)?apAddMin(act.time,dur):''});
    });
  });
  days.forEach(d=>byDay[d].sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')));
  return {days,byDay};
}

function apPrint(){
  if(typeof actSheetMonday==='undefined'||!actSheetMonday){showToast('Open a week first');return;}
  const {days,byDay}=apCollectWeek(actSheetMonday);
  const withActs=days.filter(d=>byDay[d].length);
  if(!withActs.length){showToast('No tours or ceremonies are scheduled this week');return;}
  let signup='';
  try{signup=localStorage.getItem(APOSTER_SIGNUP_KEY)||'';}catch(e){}
  const ans=prompt('How should guests sign up? This line is printed at the bottom of the sheet (leave empty for none).',signup||'To join an activity, please ask at the front desk.');
  if(ans===null)return;
  try{localStorage.setItem(APOSTER_SIGNUP_KEY,ans);}catch(e){}

  const fmtD=d=>new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric'});
  const range=fmtD(days[0])+' – '+fmtD(days[6])+', '+days[0].slice(0,4);
  const sections=withActs.map(d=>{
    const dt=new Date(d+'T12:00:00');
    const cards=byDay[d].map(a=>`<div class="card">
        <div class="time">${a.time?apEsc(apFmtT(a.time))+(a.end?' – '+apEsc(apFmtT(a.end)):''):'Time to be confirmed'}</div>
        <div class="main"><div class="name">${apEsc(a.name)}</div>${a.desc?`<div class="desc">${apEsc(a.desc)}</div>`:''}</div>
        <div class="price">$${apMoney(a.price)}<span> per person</span></div>
      </div>`).join('');
    return `<section><h2>${apEsc(dt.toLocaleDateString('en-US',{weekday:'long'}))} <small>${apEsc(fmtD(d))}</small></h2>${cards}</section>`;
  }).join('');

  const w=window.open('','_blank');
  if(!w){showToast('Allow pop-ups to print the sheet');return;}
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>This Week's Activities</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page{size:letter portrait;margin:.5in}
    *{box-sizing:border-box}
    body{margin:0;font-family:'Jost',sans-serif;color:#2d2520;font-size:14px;line-height:1.35;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    header{text-align:center;border-bottom:3px solid #2d6a6a;padding-bottom:12px;margin-bottom:12px}
    header img{height:58px;display:block;margin:0 auto 8px}
    h1{font-family:'Cormorant Garamond',serif;font-size:42px;font-weight:700;margin:0;color:#2d2520;line-height:1.05}
    .lead{font-size:17px;font-weight:600;color:#2d6a6a;margin:6px 0 2px}
    .range{font-size:14px;font-weight:600;color:#5a4a3a}
    section{margin-bottom:10px;break-inside:avoid}
    h2{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:700;color:#8a5a2e;margin:0 0 4px;border-bottom:1.5px solid #e8dfd4;padding-bottom:2px}
    h2 small{font-family:'Jost',sans-serif;font-size:14px;font-weight:600;color:#5a4a3a;margin-left:6px}
    .card{display:flex;align-items:center;gap:14px;border:1.5px solid #d9cdbd;border-radius:10px;padding:8px 12px;margin-bottom:6px;background:#fbf8f3;break-inside:avoid}
    .time{flex:0 0 178px;font-weight:700;font-size:14px;color:#2d6a6a}
    .main{flex:1}
    .name{font-size:17px;font-weight:700}
    .desc{font-size:13px;color:#4a3f35}
    .price{flex:0 0 auto;text-align:right;font-size:20px;font-weight:700;color:#8a5a2e}
    .price span{display:block;font-size:11px;font-weight:600;color:#5a4a3a}
    footer{margin-top:12px;border-top:3px solid #2d6a6a;padding-top:10px;text-align:center;font-size:15px;font-weight:600}
  </style></head><body>
  <header>
    <img src="${location.origin}/logo-amansala-retreats-black.png" alt="Amansala">
    <h1>This Week's Activities</h1>
    <div class="lead">Open to all guests — even if you are staying room only!</div>
    <div class="range">${apEsc(range)}</div>
  </header>
  ${sections}
  ${ans.trim()?`<footer>${apEsc(ans.trim())}</footer>`:''}
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},700);});<\/script>
  </body></html>`);
  w.document.close();
}

// Button next to Refresh on the Activity Sheet toolbar
function apInjectButton(){
  const refresh=document.querySelector('button[onclick="actSheetPopulate()"]');
  if(!refresh||document.getElementById('apPosterBtn'))return;
  const b=document.createElement('button');b.id='apPosterBtn';b.type='button';
  b.textContent='🖨 Guest activities sheet';
  b.title='Print a sheet of this week\'s tours and ceremonies that any guest, including room-only, can join';
  b.style.cssText="display:flex;align-items:center;gap:6px;padding:7px 14px;background:#fff;color:#2d6a6a;border:1.5px solid #b2d8d8;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Jost',sans-serif";
  b.onclick=apPrint;
  refresh.insertAdjacentElement('afterend',b);
}
(function(){
  const orig=actSheetRenderWeek;
  actSheetRenderWeek=function(){const r=orig.apply(this,arguments);try{apInjectButton();}catch(e){}return r;};
})();
