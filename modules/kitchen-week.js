// ===== kitchen-week.js — Staffing tab: Kitchen Week View =====
// Weekly Mon–Sun printable view for the kitchen: how many retreat groups and
// room-only guests are on site each day, who has meals included, and which
// groups are dining offsite. Read-only — never writes to bookings or regs.
// Own module; adds one "Staffing" tab (button + panel) to the main tab bar — visible to every
// logged-in staff role — and touches no other module.
(function(){
const KW_CONFIRMED=['confirmed','deposit_paid','contract_signed','room_list_sent'];
const KW_PENDING=['contract_sent','requested'];
// Same plans as menu.js MEAL_PLANS
const KW_PLANS={
  standard:['lightBreakfast','brunch','snack','dinner'],
  full:['lightBreakfast','lunch','dinner'],
  bld:['breakfast','lunch','dinner'],
  blsd:['breakfast','lunch','snack','dinner'],
  lbbld:['lightBreakfast','breakfast','lunch','dinner'],
  breakfast:['breakfast'],
  weTravel:['lightBreakfast','breakfast','brunch','lunch','snack','dinner']
};

// ---- Language (English / Spanish): ?lang=es, or the EN | ES switch; remembered on this device ----
const KW_T={
  en:{title:'Kitchen Week View',pending:'Include unconfirmed groups',prev:'← Prev Week',today:'This Week',next:'Next Week →',jump:'Jump to the week of this date',
    copy:'Copy Staff Link',copied:'Link Copied',print:'Print',printHead:'Amansala - Groups On Site This Week',retreat:'Retreat',retreats:'Retreats',onSite:'On Site',
    slow:'Empty',normal:'Light',some:'Moderate',busy:'Busy',retGuests:'Retreat guests',roGuests:'Room Only guests',mealsInc:'Meals included',guests:'guests',
    dinnerAt:'Dinner at Amansala',offsite:'offsite',arrives:'Arrives',departs:'Departs',dinnerOff:'Dinner Offsite',noMealsInc:'No meals included',noMealsToday:'No meals today',
    group:'group',groups:'groups',viewWeek:'Week',viewMonth:'Month',prevM:'← Prev Month',todayM:'This Month',nextM:'Next Month →',more:'more',mealsShort:'Meals',guestsShort:'guests',offDot:'Dinner offsite',monthTitle:'Kitchen Month View',printHeadM:'Amansala - Groups On Site This Month',
    roomOnly:'Room Only',mealsFor:'Meals included for',allMeals:'All meals',allExDinner:'All meals except dinner',
    leg1:'Empty: 0 retreats',leg2:'Light: 1 retreat',leg3:'Moderate: 2-3 retreats',leg4:'Busy: 4+ retreats',loading:'Loading the week...',loadErr:'Could not load. Check your connection and refresh.',
    meal:{lightBreakfast:'Light Breakfast',breakfast:'Breakfast',brunch:'Brunch',lunch:'Lunch',snack:'Snack',dinner:'Dinner'},loc:'en-US'},
  es:{title:'Vista Semanal de Cocina',pending:'Incluir grupos sin confirmar',prev:'← Semana Anterior',today:'Esta Semana',next:'Semana Siguiente →',jump:'Ir a la semana de esta fecha',
    copy:'Copiar Enlace',copied:'Enlace Copiado',print:'Imprimir',printHead:'Amansala - Grupos en el Hotel Esta Semana',retreat:'Retiro',retreats:'Retiros',onSite:'en el Hotel',
    slow:'Vacío',normal:'Ligero',some:'Moderado',busy:'Ocupado',retGuests:'Huéspedes de retiro',roGuests:'Huéspedes solo habitación',mealsInc:'Comidas incluidas',guests:'huéspedes',
    dinnerAt:'Cena en Amansala',offsite:'cena fuera',arrives:'Llega',departs:'Sale',dinnerOff:'Cena Fuera del Hotel',noMealsInc:'Sin comidas incluidas',noMealsToday:'Sin comidas hoy',
    group:'grupo',groups:'grupos',viewWeek:'Semana',viewMonth:'Mes',prevM:'← Mes Anterior',todayM:'Este Mes',nextM:'Mes Siguiente →',more:'más',mealsShort:'Comidas',guestsShort:'huéspedes',offDot:'Cena fuera',monthTitle:'Vista Mensual de Cocina',printHeadM:'Amansala - Grupos en el Hotel Este Mes',
    roomOnly:'Solo Habitación',mealsFor:'Comidas incluidas para',allMeals:'Todas las comidas',allExDinner:'Todas las comidas excepto la cena',
    leg1:'Vacío: 0 retiros',leg2:'Ligero: 1 retiro',leg3:'Moderado: 2-3 retiros',leg4:'Ocupado: 4 o más retiros',loading:'Cargando la semana...',loadErr:'No se pudo cargar. Revisa tu conexión y actualiza.',
    meal:{lightBreakfast:'Desayuno ligero',breakfast:'Desayuno',brunch:'Brunch',lunch:'Comida',snack:'Snack',dinner:'Cena'},loc:'es-MX'}
};
let kwLang=(function(){
  try{const q=new URLSearchParams(location.search).get('lang');if(q==='es'||q==='en'){localStorage.setItem('kwLang',q);return q;}}catch(e){}
  try{return localStorage.getItem('kwLang')==='es'?'es':'en';}catch(e){return 'en';}
})();
const kwT=()=>KW_T[kwLang];
let kwStart=kwMonday(new Date()),kwIncludePending=false;
let kwView=(function(){try{return localStorage.getItem('kwView')==='month'?'month':'week';}catch(e){return 'week';}})();
let kwMonth=(function(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1);})();

function kwMonday(d){d=new Date(d.getFullYear(),d.getMonth(),d.getDate());d.setDate(d.getDate()-((d.getDay()+6)%7));return d}
function kwIso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function kwEsc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function kwName(b){return b.retreatName||b.leaderName||'Group'}
function kwIsTest(b){return /zzz|\btest\b/i.test((b.retreatName||'')+' '+(b.leaderName||''))}
function kwIsRoomOnly(b){return b.bookingType==='room_only'||/^(extra night|walk-in|room only)/i.test(kwName(b))}
function kwActive(b){
  if(!b.startDate||!b.endDate||kwIsTest(b)||b.cancelledAt)return false;
  const s=b.status||'';
  return KW_CONFIRMED.includes(s)||(kwIncludePending&&KW_PENDING.includes(s));
}
// Guests on a given day, from the room list (named, non-cancelled guests; per-room dates if set).
function kwHeadcount(b,k){
  const regs=(AppData.regs||[]).filter(r=>r.bookingId===b.id&&!r.cancelled);
  let any=false,n=0;
  regs.forEach(r=>{
    const c=(r.guests||[]).filter(g=>g&&g.name&&!g.cancelled).length;
    if(!c)return;
    any=true;
    if((r.checkIn||b.startDate)<=k&&k<=(r.checkOut||b.endDate))n+=c;
  });
  return any?n:(+b.pax||0);
}
// Does this booking get kitchen meals? Mirrors menu.js (room-only only for Bikini Bootcamp / WeTravel).
function kwHasMeals(b){
  if(b.mealPlan==='none')return false;
  if(kwIsRoomOnly(b))return b.retreatName==='Bikini Bootcamp'||b.mealPlan==='weTravel';
  return true;
}
// Meals served on a day — same arrival/departure rules as menu.js; dinner removed on an offsite night.
function kwMeals(b,k){
  if(!kwHasMeals(b))return [];
  const plan=(KW_PLANS[b.mealPlan]||KW_PLANS.standard).slice();
  const s=b.startDate,e=b.endDate;
  const arrival=k===s&&s!==e,departure=k===e&&s!==e;
  let meals=plan.filter(m=>{
    if(arrival&&!['snack','dinner'].includes(m))return false;
    if(departure){
      if(!['lightBreakfast','breakfast','brunch','lunch'].includes(m))return false;
      if(m==='lunch'&&(plan.includes('breakfast')||plan.includes('brunch')))return false;
    }
    return true;
  });
  if(kwOffsiteDate(b)===k)meals=meals.filter(m=>m!=='dinner');
  return meals;
}
// Offsite dinner night (Gitano): night N of the stay → the date that evening.
function kwOffsiteDate(b){
  const sr=b.scheduleRequest||{};
  if(sr.offsiteChoice!=='gitano'||!sr.offsiteNight)return null;
  const d=new Date(b.startDate+'T12:00:00');d.setDate(d.getDate()+parseInt(sr.offsiteNight)-1);
  return kwIso(d);
}

// "All meals" on a full day; "All meals except dinner" on the offsite night; arrival/departure days list the actual meals.
function kwMealText(b,k){
  const t=kwT();
  if(!kwHasMeals(b))return t.noMealsInc;
  const meals=kwMeals(b,k);
  if(!meals.length)return t.noMealsToday;
  const plan=KW_PLANS[b.mealPlan]||KW_PLANS.standard;
  const arrival=k===b.startDate&&b.startDate!==b.endDate,departure=k===b.endDate&&b.startDate!==b.endDate;
  if(!arrival&&!departure){
    if(meals.length===plan.length)return t.allMeals;
    if(kwOffsiteDate(b)===k&&meals.length===plan.length-1&&!meals.includes('dinner'))return t.allExDinner;
  }
  return meals.map(m=>t.meal[m]).join(' · ');
}

function kwRenderPanel(){
  const panel=document.getElementById('tab-staffing-body');if(!panel)return;
  if(kwView==='month')return kwRenderMonth(panel);
  const t=kwT();
  const days=[...Array(7)].map((_,i)=>{const d=new Date(kwStart);d.setDate(d.getDate()+i);return d});
  const f=d=>d.toLocaleDateString(t.loc,{month:'long',day:'numeric'});
  const range=f(days[0])+' - '+f(days[6])+', '+days[6].getFullYear();
  const all=(AppData.bookings||[]).filter(kwActive);
  const cards=days.map(d=>{
    const k=kwIso(d);
    const on=all.filter(b=>b.startDate<=k&&k<=b.endDate);
    const retreats=on.filter(b=>!kwIsRoomOnly(b)),roomOnly=on.filter(kwIsRoomOnly);
    const n=retreats.length,cls=kwLevel(n),lbl=t[cls==='slow'?'slow':cls==='normal'?'normal':cls==='some'?'some':'busy'];
    const rg=retreats.reduce((a,b)=>a+kwHeadcount(b,k),0);
    const rog=roomOnly.reduce((a,b)=>a+kwHeadcount(b,k),0);
    const withMeals=[...retreats,...roomOnly].filter(kwHasMeals).reduce((a,b)=>a+kwHeadcount(b,k),0);
    const offsite=retreats.filter(b=>kwOffsiteDate(b)===k);
    const dinnerCount=[...retreats,...roomOnly].filter(b=>kwMeals(b,k).includes('dinner')).reduce((a,b)=>a+kwHeadcount(b,k),0);
    const groupLis=retreats.map(b=>{
      const off=kwOffsiteDate(b)===k;
      return '<li><b>'+kwEsc(kwName(b))+'</b> ('+kwHeadcount(b,k)+')'
        +(b.startDate===k?'<span class="kw-tag">'+t.arrives+'</span>':'')+(b.endDate===k?'<span class="kw-tag">'+t.departs+'</span>':'')
        +(off?'<span class="kw-tag kw-off">'+t.dinnerOff+'</span>':'')
        +'<div class="kw-meals">'+kwEsc(kwMealText(b,k))+'</div></li>';
    }).join('');
    const roLi=roomOnly.length?'<li><b>'+t.roomOnly+'</b> ('+rog+' '+t.guests+')<div class="kw-meals">'
      +(roomOnly.some(kwHasMeals)?t.mealsFor+' '+roomOnly.filter(kwHasMeals).reduce((a,b)=>a+kwHeadcount(b,k),0):t.noMealsInc)+'</div></li>':'';
    return '<div class="kw-day '+cls+'"><div class="kw-dn">'+d.toLocaleDateString(t.loc,{weekday:'long'})+'</div><div class="kw-dd">'+f(d)+'</div>'
      +'<div class="kw-count">'+n+'</div><div class="kw-lbl">'+(n===1?t.retreat:t.retreats)+' '+t.onSite+' - '+lbl+'</div>'
      +'<div class="kw-stats"><div>'+t.retGuests+': <b>'+rg+'</b></div><div>'+t.roGuests+': <b>'+rog+'</b></div>'
      +'<div class="kw-meal-total">'+t.mealsInc+': <b>'+withMeals+'</b> '+t.guests+'</div>'
      +(offsite.length?'<div class="kw-offnote">'+t.dinnerAt+': <b>'+dinnerCount+'</b> ('+offsite.map(b=>kwEsc(kwName(b))).join(', ')+' - '+t.offsite+')</div>':'')
      +'</div><ul>'+groupLis+roLi+'</ul></div>';
  }).join('');
  panel.innerHTML='<style>'+KW_CSS+'</style>'
    +kwBarHtml()
    +'<div class="kw-range">'+range+'</div><div class="kw-grid" id="kwGrid">'+cards+'</div>'
    +'<div class="kw-legend"><span class="l1">'+t.leg1+'</span><span class="l2">'+t.leg2+'</span><span class="l3">'+t.leg3+'</span><span class="l4">'+t.leg4+'</span></div>';
}


function kwOrd(d){if(kwLang==='es')return String(d);const m=d%100;if(m>=11&&m<=13)return d+'th';return d+(['th','st','nd','rd'][d%10]||'th');}
function kwLevel(n){return n>=4?'busy':n>=2?'some':n===1?'normal':'slow';}
function kwBarHtml(){
  const t=kwT(),m=kwView==='month';
  return '<div class="kw-bar"><div class="kw-title">'+(m?t.monthTitle:t.title)+'</div>'
    +'<span class="kw-lang"><button class="'+(!m?'on':'')+'" onclick="kwSetView(\'week\')">'+t.viewWeek+'</button><button class="'+(m?'on':'')+'" onclick="kwSetView(\'month\')">'+t.viewMonth+'</button></span>'
    +'<span class="kw-lang"><button class="'+(kwLang==='en'?'on':'')+'" onclick="kwSetLang(\'en\')">EN</button><button class="'+(kwLang==='es'?'on':'')+'" onclick="kwSetLang(\'es\')">ES</button></span>'
    +'<label class="kw-opt"><input type="checkbox" id="kwPend"'+(kwIncludePending?' checked':'')+' onchange="kwTogglePending(this.checked)"> '+t.pending+'</label>'
    +'<button onclick="kwNav(-1)">'+(m?t.prevM:t.prev)+'</button><button onclick="kwNav(0)">'+(m?t.todayM:t.today)+'</button><button onclick="kwNav(1)">'+(m?t.nextM:t.next)+'</button>'
    +'<input type="date" onchange="kwJump(this.value)" title="'+t.jump+'">'
    +'<button onclick="kwCopyLink(this)">'+t.copy+'</button>'
    +'<button class="kw-primary" onclick="kwPrint()">'+t.print+'</button></div>';
}

function kwRenderMonth(panel){
  const t=kwT();
  const first=new Date(kwMonth.getFullYear(),kwMonth.getMonth(),1);
  const gridStart=kwMonday(first);
  const last=new Date(kwMonth.getFullYear(),kwMonth.getMonth()+1,0);
  const weeks=Math.ceil(((last-gridStart)/86400000+1)/7);
  const title=first.toLocaleDateString(t.loc,{month:'long',year:'numeric'});
  const all=(AppData.bookings||[]).filter(kwActive);
  const wd=[...Array(7)].map((_,i)=>{const d=new Date(gridStart);d.setDate(d.getDate()+i);return d.toLocaleDateString(t.loc,{weekday:'long'})});
  let cells='';
  for(let i=0;i<weeks*7;i++){
    const d=new Date(gridStart);d.setDate(d.getDate()+i);
    if(d.getMonth()!==first.getMonth()){cells+='<div class="kw-mc kw-out"></div>';continue;}
    const k=kwIso(d);
    const on=all.filter(b=>b.startDate<=k&&k<=b.endDate);
    const retreats=on.filter(b=>!kwIsRoomOnly(b)),roomOnly=on.filter(kwIsRoomOnly);
    const n=retreats.length,cls=kwLevel(n);
    const rg=retreats.reduce((a,b)=>a+kwHeadcount(b,k),0),rog=roomOnly.reduce((a,b)=>a+kwHeadcount(b,k),0);
    const withMeals=[...retreats,...roomOnly].filter(kwHasMeals).reduce((a,b)=>a+kwHeadcount(b,k),0);
    const off=retreats.filter(b=>kwOffsiteDate(b)===k);
    const names=retreats.slice(0,4).map(b=>'<div class="kw-mn">'+kwEsc(kwName(b))+' ('+kwHeadcount(b,k)+')'+(b.startDate===k?' ▲':'')+(b.endDate===k?' ▼':'')+'</div>').join('');
    cells+='<div class="kw-mc kw-day '+cls+'"><div class="kw-mh"><span class="kw-mdn">'+kwOrd(d.getDate())+'</span> - <span class="kw-mhs">'+n+' '+(n===1?t.group:t.groups)+' - '+rg+' pax</span></div>'
      +(rog?'<div class="kw-ms"><b>'+rog+'</b> '+t.roomOnly.toLowerCase()+'</div>':'')
      +'<div class="kw-ms kw-mm">'+t.mealsShort+': <b>'+withMeals+'</b></div>'
      +(off.length?'<div class="kw-ms kw-offnote">'+t.offDot+': '+off.map(b=>kwEsc(kwName(b))).join(', ')+'</div>':'')
      +names+(retreats.length>4?'<div class="kw-mn">+'+(retreats.length-4)+' '+t.more+'</div>':'')+'</div>';
  }
  panel.innerHTML='<style>'+KW_CSS+'</style>'+kwBarHtml()
    +'<div class="kw-range">'+title.charAt(0).toUpperCase()+title.slice(1)+'</div>'
    +'<div class="kw-mgrid">'+wd.map(w=>'<div class="kw-mwd">'+w+'</div>').join('')+cells+'</div>'
    +'<div class="kw-legend"><span class="l1">'+t.leg1+'</span><span class="l2">'+t.leg2+'</span><span class="l3">'+t.leg3+'</span><span class="l4">'+t.leg4+'</span><span>▲ '+t.arrives+' · ▼ '+t.departs+'</span></div>';
}

const KW_CSS=`
.kw-mgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.kw-mwd{font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:1px;text-align:center;color:#1a2332;padding:2px 0}
.kw-day.kw-mc,.kw-mc{min-height:118px;padding:6px 7px;border-radius:10px}
.kw-mc.kw-out{background:transparent;border:0}
.kw-mh{font-size:13.5px;font-weight:600;margin-bottom:3px;line-height:1.25}
.kw-mdn{font-weight:700}
.kw-mcount{font-family:'Jost',sans-serif;font-size:26px;font-weight:600;line-height:1}
.kw-mc.slow .kw-mhs{color:#1f6b3a}.kw-mc.normal .kw-mhs{color:#7a5a00}.kw-mc.some .kw-mhs{color:#b34a00}.kw-mc.busy .kw-mhs{color:#a12a1a}
.kw-ms{font-size:11.5px;line-height:1.3}.kw-mm{font-weight:500}
.kw-mn{font-size:11px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kw-mc .kw-offnote{font-size:11px}
.kw-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.kw-title{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:700;color:#1a2332;margin-right:auto}
.kw-bar button,.kw-bar input[type=date]{font:500 13px 'Jost',sans-serif;padding:8px 13px;border:1.5px solid #d9d3c7;border-radius:9px;background:#fff;color:#1a2332;cursor:pointer}
.kw-bar .kw-primary{background:#2d6a6a;border-color:#2d6a6a;color:#fff}
.kw-lang{display:inline-flex}.kw-lang button{border-radius:0!important}.kw-lang button:first-child{border-radius:9px 0 0 9px!important}.kw-lang button:last-child{border-radius:0 9px 9px 0!important;border-left:0!important}.kw-lang button.on{background:#2d6a6a!important;color:#fff!important;border-color:#2d6a6a!important}
.kw-opt{font-size:13px;display:flex;gap:6px;align-items:center}
.kw-range{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700;margin-bottom:10px;color:#1a2332}
.kw-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:10px}
.kw-day{background:#fff;border:2px solid #d9d3c7;border-radius:12px;padding:12px;display:flex;flex-direction:column;color:#1a2332;font-family:'Jost',sans-serif}
.kw-dn{font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:1px}
.kw-dd{font-size:13px;margin-bottom:6px}
.kw-count{font-family:'Jost',sans-serif;font-size:52px;font-weight:600;line-height:1}
.kw-lbl{font-size:12.5px;font-weight:600;margin-bottom:8px}
.kw-stats{font-size:13px;margin-bottom:8px;display:grid;gap:2px}
.kw-meal-total{margin-top:4px;padding:4px 6px;background:rgba(255,255,255,.75);border-radius:6px;font-size:13.5px}
.kw-offnote{font-size:12.5px;font-weight:600;color:#7a2a8a;margin-top:2px}
.kw-day ul{list-style:none;font-size:13px;border-top:1px solid rgba(0,0,0,.2);padding-top:8px}
.kw-day li{margin-bottom:8px;line-height:1.3}
.kw-meals{font-size:12px;color:#1a2332;opacity:.9}
.kw-tag{display:inline-block;font-size:10.5px;font-weight:600;padding:0 5px;border-radius:5px;background:#fff;border:1px solid currentColor;margin-left:4px}
.kw-off{color:#7a2a8a}
.kw-day.slow{background:#dcefe3;border-color:#1f6b3a}.kw-day.slow .kw-count,.kw-day.slow .kw-lbl{color:#1f6b3a}
.kw-day.normal{background:#fff3b0;border-color:#8a6d00}.kw-day.normal .kw-count,.kw-day.normal .kw-lbl{color:#7a5a00}
.kw-day.some{background:#fcd9b0;border-color:#b34a00}.kw-day.some .kw-count,.kw-day.some .kw-lbl{color:#b34a00}
.kw-day.busy{background:#f8d6d0;border-color:#a12a1a}.kw-day.busy .kw-count,.kw-day.busy .kw-lbl{color:#a12a1a}
.kw-legend{display:flex;gap:18px;margin-top:12px;font-size:13px;flex-wrap:wrap}
.kw-legend span::before{content:"";display:inline-block;width:14px;height:14px;border-radius:4px;margin-right:6px;vertical-align:-2px;border:2px solid}
.kw-legend .l1::before{background:#dcefe3;border-color:#1f6b3a}.kw-legend .l2::before{background:#fff3b0;border-color:#8a6d00}.kw-legend .l3::before{background:#fcd9b0;border-color:#b34a00}.kw-legend .l4::before{background:#f8d6d0;border-color:#a12a1a}
@media(max-width:1100px){.kw-grid{grid-template-columns:repeat(2,1fr)}}
`;

window.kwNav=function(dir){
  if(kwView==='month')kwMonth=dir===0?new Date(new Date().getFullYear(),new Date().getMonth(),1):new Date(kwMonth.getFullYear(),kwMonth.getMonth()+dir,1);
  else kwStart=dir===0?kwMonday(new Date()):new Date(kwStart.getFullYear(),kwStart.getMonth(),kwStart.getDate()+7*dir);
  kwRenderPanel();
};
window.kwJump=function(v){if(v){const d=new Date(v+'T12:00:00');kwStart=kwMonday(d);kwMonth=new Date(d.getFullYear(),d.getMonth(),1);kwRenderPanel();}};
window.kwSetView=function(v){kwView=v==='month'?'month':'week';try{localStorage.setItem('kwView',kwView);}catch(e){}kwRenderPanel();};
window.kwTogglePending=function(v){kwIncludePending=!!v;kwRenderPanel();};
window.kwPrintDoc=function(){
  const grid=document.getElementById('tab-staffing-body');if(!grid)return '';
  const body=grid.cloneNode(true);body.querySelectorAll('.kw-bar,input,button').forEach(e=>e.remove());
  // Page content area (landscape, 8mm margins): ~990 x 725 CSS px on Letter, a touch more on A4.
  // The block is laid out at that width, then zoomed down until everything fits on ONE page.
  return '<!DOCTYPE html><html lang="'+kwLang+'"><head><meta charset="utf-8"><title>Amansala - '+(kwView==='month'?kwT().monthTitle:kwT().title)+'</title>'
    +'<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Jost:wght@400;500;600&display=swap" rel="stylesheet">'
    +'<style>@page{size:landscape;margin:8mm}html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    +'#kwfit{width:990px;box-sizing:border-box}body{display:flex;justify-content:center}'
    +'.kw-ph{font-family:"Cormorant Garamond",serif;font-size:24px;font-weight:700;margin-bottom:2px;color:#1a2332}'
    +'#tab-staffing-body{padding:0!important;background:#fff!important}.kw-range{font-size:20px!important;margin-bottom:6px!important}'
    +'*{box-sizing:border-box}.kw-day ul{margin:0;padding:8px 0 0}.kw-day{margin:0}.kw-grid{grid-template-columns:repeat(7,1fr)!important}.kw-grid,.kw-mgrid{gap:5px}.kw-day{padding:7px;break-inside:avoid}.kw-count{font-size:40px}.kw-day.kw-mc,.kw-mc{min-height:0}.kw-legend{margin-top:6px}</style></head><body>'
    +'<div id="kwfit"><div class="kw-ph">'+(kwView==='month'?kwT().printHeadM:kwT().printHead)+'</div>'+body.innerHTML+'</div>'
    +'<script>(function(){function fit(){var el=document.getElementById("kwfit"),H=700;var h=el.offsetHeight;'
    +'if(h>H){el.style.zoom=(H/h).toFixed(4);}'
    +'if(!window.__kwNoPrint)setTimeout(function(){window.focus();window.print();},300);}'
    +'(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(fit,150);});})();<\/script></body></html>';
};
window.kwPrint=function(){
  const w=window.open('','_blank');if(!w)return;
  w.document.write(kwPrintDoc());w.document.close();
};
window.kwSetLang=function(l){kwLang=l==='es'?'es':'en';try{localStorage.setItem('kwLang',kwLang);}catch(e){}document.documentElement.lang=kwLang;kwRenderPanel();};
window.kwGetLang=()=>kwLang;
window.kwText=k=>kwT()[k];
window.kwRefresh=function(){kwRenderPanel();};
window.kwCopyLink=function(btn){
  const url=location.origin+'/staffing'+(kwLang==='es'?'?lang=es':'');
  const done=()=>{const t=btn.textContent;btn.textContent=kwT().copied;setTimeout(()=>btn.textContent=t,1800);};
  try{navigator.clipboard.writeText(url).then(done,()=>prompt('Copy this link:',url));}catch(e){prompt('Copy this link:',url);}
};
window.kwOpenStaffing=function(btn){
  switchTab('staffing',btn);
  kwRenderPanel();
};

function kwInit(){
  if(document.getElementById('staffingTabBtn'))return;
  const after=document.getElementById('housekeepingTabBtn')||document.getElementById('menuTabBtn');
  const menuPanel=document.getElementById('tab-menu');
  if(!after||!menuPanel)return;
  const btn=document.createElement('button');
  btn.className='tab-btn';btn.id='staffingTabBtn';
  btn.setAttribute('onclick','kwOpenStaffing(this)');
  btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><span class="tab-label">Staffing</span>';
  after.parentNode.insertBefore(btn,after.nextSibling);
  const panel=document.createElement('div');
  panel.className='tab-panel';panel.id='tab-staffing';panel.style.flexDirection='column';
  panel.innerHTML='<div id="tab-staffing-body" style="flex:1;overflow:auto;padding:20px;background:#f5f1eb"></div>';
  menuPanel.parentNode.insertBefore(panel,menuPanel.nextSibling);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',kwInit);else kwInit();
})();
