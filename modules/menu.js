// ===== menu.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== MENU TAB =====
let menuSchedule = {};       // { 'YYYY-MM-DD': { lightBreakfast:[{time,group,pax}], brunch:[], snack:[], dinner:[] } }
let menuCurrentMonday = null;

const WEEKLY_MENU = {
  1: { // Lunes (Monday) — Day 1
    lightBreakfast: ['Fruta · Granola · Chia · Pan de Platano'],
    brunch: ['Chilaquiles','Omelette de Espinaca','Protein Pancakes','Tinga de Pollo ★','Ensalada Amansala'],
    lunch:  ['Tinga de Pollo ★','Ensalada Amansala'],
    snack:  ['Summer Rolls con Gazpacho'],
    dinner: {protein:'Grilled Lemon Kebabs Pollo',dishes:['Grilled Eggplant con Tahini','Tostada Bar'],dessert:'Deconstructed Cheesecake'}
  },
  2: { // Martes (Tuesday) — Day 2
    lightBreakfast: ['Fruta · Granola · Chia · Pan de Zucchini'],
    brunch: ['Huevos Rancheros','Avocado Toast','Pan de Platano','Salmon con Miel y Ajo ★','Ensalada Edamame','Poke Bowl'],
    lunch:  ['Salmon con Miel y Ajo ★','Ensalada Edamame','Poke Bowl'],
    snack:  ['Guacamole con Veggies y Chips'],
    dinner: {protein:'Pollo',dishes:['Ensalada Verde','Risotto de Espinaca'],dessert:'Flan de Cafe'}
  },
  3: { // Miércoles (Wednesday) — Day 3
    lightBreakfast: ['Fruta · Granola · Chia · Pan de Platano'],
    brunch: ['Chilaquiles','Huevos Verdes','Pan de Frances','Blackened Tacos ★','Ensalada Mexicana'],
    lunch:  ['Blackened Tacos ★','Ensalada Mexicana'],
    snack:  ['Hummus con Veggies y Chips'],
    dinner: {protein:'Pescado',dishes:['Sopa de Calabaza','Quinoa Verduras'],dessert:'Vegan Choco Mouse'}
  },
  4: { // Jueves (Thursday) — Day 4 (swapped with what was Friday's menu)
    lightBreakfast: ['Fruta · Granola · Chia · Pan de Platano'],
    brunch: ['Chilaquiles','Huevos Duros','Pan de Platano','Pescado Congelado ★','Ensalada Mexicana'],
    lunch:  ['Pescado Congelado ★','Ensalada Mexicana'],
    snack:  ['Protein Balls con Fruta Fresca'],
    dinner: {protein:'Pollo',dishes:['Corn Ribs','Sopa de Tortilla','Tostada Bar'],dessert:'Pay de Manzana · Brownie'}
  },
  5: { // Viernes (Friday) — Day 5 (swapped with what was Thursday's menu)
    lightBreakfast: ['Fruta · Granola · Chia · Pan de Zucchini'],
    brunch: ['Huevos Rancheros','Omelette de Espinaca','Protein Pancakes','Kebabs Pollo/Tofu ★','Ensalada Griega','Babaganoush Tostada'],
    lunch:  ['Kebabs Pollo/Tofu ★','Ensalada Griega','Babaganoush Tostada'],
    snack:  ['Quesadillas con Brócoli y Queso'],
    dinner: {protein:'Salmon',dishes:['Cabbage Steak con Tahini','Camote al Horno'],dessert:'Pie de Manzana'}
  },
  6: { // Sábado (Saturday) — Day 6
    lightBreakfast: ['Fruta · Granola · Chia · Pan de Zucchini'],
    brunch: ['Huevos Rancheros','Huevos Revueltos','Protein Pancakes','Bang Bang Chicken ★','Crispy Rice Salad'],
    lunch:  ['Bang Bang Chicken ★','Crispy Rice Salad'],
    snack:  ['Guacamole con Veggies y Chips'],
    dinner: {protein:'Pescado en Hoja de Platano',dishes:['Ensalada de Pepino','Spinach con Ajo'],dessert:'Brownie'}
  },
  7: { // Domingo (Sunday) — Day 7
    lightBreakfast: ['Fruta · Granola · Chia · Pan de Zucchini'],
    brunch: ['Huevos Rancheros','Fritatta','Pan de Frances con Coco','Pollo con Ajo Asado ★','Chicken Teriyaki Poke Bowl','Fruta'],
    lunch:  ['Pollo con Ajo Asado ★','Chicken Teriyaki Poke Bowl','Fruta'],
    snack:  ['Protein Balls con Fruta Fresca'],
    dinner: {protein:'Plant Based Night — Phad Thai',dishes:['Thai Slaw'],dessert:'Coconut Ice Cream'}
  }
};

const MENU_MEAL_CFG = {
  lightBreakfast: {label:'Fruit, Coffee &amp; Tea', bg:'#f5deb3', color:'#7c5a1e'},
  brunch:         {label:'Brunch',          bg:'#fef3c7', color:'#78350f'},
  lunch:          {label:'Lunch',           bg:'#fed7aa', color:'#7c2d12'},
  snack:          {label:'Snack',           bg:'#d1fae5', color:'#065f46'},
  dinner:         {label:'Dinner',          bg:'#dbeafe', color:'#1e3a5f'}
};

function menuJumpToDate(val){
  if(!val)return;
  menuCurrentMonday=menuGetSunday(new Date(val+'T12:00:00'));
  menuRenderWeek();
}

function menuJumpToMonth(){
  const m=parseInt(document.getElementById('menuMonthSel').value);
  const y=parseInt(document.getElementById('menuYearSel').value);
  if(isNaN(m)||isNaN(y))return;
  const d=new Date(y,m,1);
  menuCurrentMonday=menuGetSunday(d);
  menuRenderWeek();
}

function menuGetSunday(date){
  // Returns the Sunday that starts the week (Domingo first, matching kitchen spreadsheet)
  const d=new Date(typeof date==='string'?date+'T12:00:00':date);
  d.setDate(d.getDate()-d.getDay()); // getDay() 0=Sun, so subtract 0 for Sun, 1 for Mon, etc.
  return d.toISOString().split('T')[0];
}

function menuDayIndex(dateStr){
  const day=new Date(dateStr+'T12:00:00').getDay();
  return day===0?7:day; // 0=Sun→7, 1=Mon→1 … 6=Sat→6
}

function menuBuild(){
  if(!menuCurrentMonday) menuCurrentMonday=menuGetSunday(new Date());
  menuRenderWeek();
  // Auto-populate retreat meal rows for the current week (silently)
  menuPopulateFromRetreats(true);
}

function menuNavWeek(dir){
  const d=new Date(menuCurrentMonday+'T12:00:00');
  d.setDate(d.getDate()+dir*7);
  menuCurrentMonday=d.toISOString().split('T')[0];
  menuRenderWeek();
}

function menuGoToday(){
  menuCurrentMonday=menuGetSunday(new Date());
  menuRenderWeek();
}

function menuRenderWeek(){
  const lbl=document.getElementById('menuWeekLabel');
  const grid=document.getElementById('menuGrid');
  if(!lbl||!grid)return;
  const weekStart=new Date(menuCurrentMonday+'T12:00:00');
  // Sync month/year selectors
  const mSel=document.getElementById('menuMonthSel');
  const ySel=document.getElementById('menuYearSel');
  if(mSel&&ySel){
    const curY=weekStart.getFullYear();
    const thisYear=new Date().getFullYear();
    if(!ySel.options.length||!Array.from(ySel.options).some(o=>parseInt(o.value)===curY)){
      ySel.innerHTML='';
      for(let y=thisYear;y<=thisYear+4;y++){const o=document.createElement('option');o.value=y;o.textContent=y;ySel.appendChild(o);}
    }
    mSel.value=weekStart.getMonth();
    ySel.value=curY;
  }
  const weekEnd=new Date(weekStart);weekEnd.setDate(weekEnd.getDate()+6);
  const fmt=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  lbl.textContent=`${fmt(weekStart)} – ${fmt(weekEnd)}`;
  const today=new Date().toISOString().split('T')[0];
  const todayWeek=menuGetSunday(new Date());
  // Lock date picker minimum to today and disable back-arrow when already at/before today's week
  const dp=document.getElementById('menuDatePick');
  if(dp) dp.min=today;
  const backBtn=document.querySelector('#tab-menu button[onclick="menuNavWeek(-1)"]');
  if(backBtn) backBtn.disabled=menuCurrentMonday<=todayWeek;
  // Sync print date range pickers to current week whenever the week changes
  const pf=document.getElementById('menuPrintFrom');
  const pt=document.getElementById('menuPrintTo');
  if(pf){pf.min=today;pf.value=weekStart.toISOString().split('T')[0];}
  if(pt){const we=new Date(weekStart);we.setDate(we.getDate()+6);pt.min=today;pt.value=we.toISOString().split('T')[0];}
  const days=[];
  for(let i=0;i<7;i++){const d=new Date(weekStart);d.setDate(d.getDate()+i);days.push(d.toISOString().split('T')[0]);}
  // Only show Lunch row if at least one day this week has lunch scheduled
  const weekHasLunch=days.some(ds=>(menuSchedule[ds]?.lunch||[]).length>0);
  const meals=['lightBreakfast','brunch',...(weekHasLunch?['lunch']:[]),'snack','dinner'];
  // Row-based layout: all 7 cells for each meal go in the SAME grid row,
  // so CSS grid forces identical height across columns — sections stay aligned.
  let html='<div style="min-width:980px"><div class="menu-week-grid">';
  // Row 1: day headers
  days.forEach(ds=>{
    const mi=menuDayIndex(ds);
    const d=new Date(ds+'T12:00:00');
    const isToday=ds===today;
    html+=`<div class="menu-day-header${isToday?' menu-day-today':''}" onclick="menuPrintDay('${ds}')" title="Click to print today's menu for the wall" style="cursor:pointer;position:relative">
      <div class="menu-day-name">${d.toLocaleDateString('en-US',{weekday:'long'})}</div>
      <div class="menu-day-date">${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
      <div style="font-size:9px;opacity:.6;margin-top:2px">Day ${mi}</div>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;top:6px;right:6px;opacity:.55"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
    </div>`;
  });
  // Pre-compute max schedule rows per meal so every cell gets padded to the same height
  const maxRows={};
  meals.forEach(m=>{
    maxRows[m]=Math.max(0,...days.map(ds=>(menuSchedule[ds]?.[m]||[]).length));
  });
  // Pre-compute max dish-list line count per meal too — otherwise the Hora/Grupo/#
  // table starts at a different height in every column, since brunches/dinners
  // don't all have the same number of dish lines above it.
  const dinnerLineCount=dinner=>(dinner?.protein?1:0)+(dinner?.dishes||[]).length+(dinner?.dessert?2:0);
  const maxDishLines={};
  meals.forEach(meal=>{
    maxDishLines[meal]=Math.max(0,...days.map(ds=>{
      const mData=WEEKLY_MENU[menuDayIndex(ds)]||{};
      if(meal==='dinner')return dinnerLineCount(mData.dinner);
      if(meal==='lunch'&&(menuSchedule[ds]?.lunch||[]).length===0)return 0;
      return (mData[meal]||[]).length;
    }));
  });
  // One full row per meal (7 cells per row)
  meals.forEach(meal=>{
    days.forEach(ds=>{
      const mi=menuDayIndex(ds);
      const mData=WEEKLY_MENU[mi]||{};
      const sData=menuSchedule[ds]||{};
      // For lunch: only show dishes on days that actually have lunch scheduled
      const dayHasLunch=meal==='lunch'&&(sData.lunch||[]).length===0;
      const dishes=dayHasLunch?[]:mData[meal]||[];
      const content=meal==='dinner'
        ?menuRenderDinner(ds,mData.dinner||{},sData.dinner||[],maxRows.dinner,maxDishLines.dinner)
        :menuRenderMealSection(ds,meal,dishes,sData[meal]||[],maxRows[meal],maxDishLines[meal]);
      html+=`<div class="menu-grid-cell">${content}</div>`;
    });
  });
  html+='</div></div>';
  grid.innerHTML=html;
}

function menuRenderDay(dateStr,today){
  const mi=menuDayIndex(dateStr);
  const menu=WEEKLY_MENU[mi]||{};
  const sched=menuSchedule[dateStr]||{};
  const d=new Date(dateStr+'T12:00:00');
  const dayName=d.toLocaleDateString('en-US',{weekday:'long'});
  const dayDate=d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const isToday=dateStr===today;
  return `<div class="menu-day-col${isToday?' menu-day-today':''}">
    <div class="menu-day-header">
      <div class="menu-day-name">${dayName}</div>
      <div class="menu-day-date">${dayDate}</div>
      <div style="font-size:9px;opacity:.6;margin-top:2px">Day ${mi}</div>
    </div>
    ${menuRenderMealSection(dateStr,'lightBreakfast',menu.lightBreakfast||[],sched.lightBreakfast||[])}
    ${menuRenderMealSection(dateStr,'breakfast',menu.breakfast||[],sched.breakfast||[])}
    ${menuRenderMealSection(dateStr,'brunch',menu.brunch||[],sched.brunch||[])}
    ${menuRenderMealSection(dateStr,'snack',menu.snack||[],sched.snack||[])}
    ${menuRenderDinner(dateStr,menu.dinner||{},sched.dinner||[])}
  </div>`;
}

function menuRenderMealSection(dateStr,mealKey,dishes,rows,padTo=0,dishPadTo=0){
  const cfg=MENU_MEAL_CFG[mealKey]||{label:mealKey,bg:'#f5f3ee',color:'#555'};
  const total=rows.reduce((n,r)=>n+(parseInt(r.pax)||0),0);
  const dishesHtml=dishes.map((d,i)=>{
    const isProtein=(mealKey==='brunch'||mealKey==='lunch')&&d.includes('★');
    const label=d.replace(' ★','');
    return isProtein
      ?`<div class="menu-dish" style="font-weight:700;color:#78350f;background:#fef9e7;margin:-5px -8px 3px;padding:4px 8px;border-bottom:1px solid #fde8c8">★ ${label}</div>`
      :`<div class="menu-dish">${d}</div>`;
  }).join('');
  // Invisible spacer lines so the Hora/Grupo/# table starts at the same height
  // in every column, regardless of how many dishes this particular day has.
  const dishSpacers='<div class="menu-dish" style="visibility:hidden">—</div>'.repeat(Math.max(0,dishPadTo-dishes.length));
  const rowsHtml=rows.map((r,i)=>`<tr>
    <td><input class="menu-inp" style="width:42px" value="${menuEsc(r.time)}" placeholder="--:--" onchange="menuUpdateRow('${dateStr}','${mealKey}',${i},'time',this.value)"></td>
    <td><input class="menu-inp" style="min-width:60px" value="${menuEsc(r.group)}" placeholder="Grupo" onchange="menuUpdateRow('${dateStr}','${mealKey}',${i},'group',this.value)"></td>
    <td><input class="menu-inp" style="width:28px;text-align:center" value="${menuEsc(r.pax)}" placeholder="#" onchange="menuUpdateRow('${dateStr}','${mealKey}',${i},'pax',this.value)"></td>
    <td><button class="menu-del-btn" onclick="menuRemoveRow('${dateStr}','${mealKey}',${i})">×</button></td>
  </tr>`).join('');
  const ghostRow=`<tr style="opacity:0;pointer-events:none"><td><input class="menu-inp" style="width:42px" tabindex="-1"></td><td><input class="menu-inp" style="min-width:60px" tabindex="-1"></td><td><input class="menu-inp" style="width:28px" tabindex="-1"></td><td></td></tr>`;
  const spacers=ghostRow.repeat(Math.max(0,padTo-rows.length));
  return `<div class="menu-section">
    <div class="menu-sec-hdr" style="background:${cfg.bg};color:${cfg.color}">${cfg.label}</div>
    <div class="menu-dish-list">${dishesHtml||'<div class="menu-dish" style="color:#aaa">—</div>'}${dishSpacers}</div>
    <table class="menu-sched-tbl"><thead><tr><th>Hora</th><th>Grupo</th><th>#</th><th></th></tr></thead><tbody>${rowsHtml}${spacers}</tbody></table>
    <div class="menu-total-row"><span>Total: <b>${total||'—'}</b></span><button class="menu-add-btn" onclick="menuAddRow('${dateStr}','${mealKey}')">+ Add</button></div>
  </div>`;
}

function menuRenderDinner(dateStr,dinner,rows,padTo=0,dishPadTo=0){
  const cfg=MENU_MEAL_CFG.dinner;
  const total=rows.reduce((n,r)=>n+(parseInt(r.pax)||0),0);
  const proteinHtml=dinner.protein?`<div class="menu-dish" style="font-weight:700;color:#1e3a5f;background:#eff6ff;margin:-5px -8px 3px;padding:4px 8px;border-bottom:1px solid #bfdbfe">★ ${dinner.protein}</div>`:'';
  const sidesHtml=(dinner.dishes||[]).map(d=>`<div class="menu-dish">${d}</div>`).join('');
  const dessertHtml=dinner.dessert?`<div class="menu-dinner-sub">Postre</div><div class="menu-dish">${dinner.dessert}</div>`:'';
  const dinnerLines=(dinner.protein?1:0)+(dinner.dishes||[]).length+(dinner.dessert?2:0);
  const dishSpacers='<div class="menu-dish" style="visibility:hidden">—</div>'.repeat(Math.max(0,dishPadTo-dinnerLines));
  const parts=proteinHtml+sidesHtml+dessertHtml+dishSpacers;
  const rowsHtml=rows.map((r,i)=>`<tr>
    <td><input class="menu-inp" style="width:36px" value="${menuEsc(r.time)}" placeholder="--:--" onchange="menuUpdateRow('${dateStr}','dinner',${i},'time',this.value)"></td>
    <td><input class="menu-inp" style="min-width:52px" value="${menuEsc(r.group)}" placeholder="Grupo" onchange="menuUpdateRow('${dateStr}','dinner',${i},'group',this.value)"></td>
    <td><input class="menu-inp" style="width:24px;text-align:center" value="${menuEsc(r.pax)}" placeholder="#" onchange="menuUpdateRow('${dateStr}','dinner',${i},'pax',this.value)"></td>
    <td><input class="menu-inp" style="width:28px;text-align:center" value="${menuEsc(r.kg)}" placeholder="Kg" onchange="menuUpdateRow('${dateStr}','dinner',${i},'kg',this.value)"></td>
    <td><button class="menu-del-btn" onclick="menuRemoveRow('${dateStr}','dinner',${i})">×</button></td>
  </tr>`).join('');
  const ghostRowD=`<tr style="opacity:0;pointer-events:none"><td><input class="menu-inp" style="width:36px" tabindex="-1"></td><td><input class="menu-inp" style="min-width:52px" tabindex="-1"></td><td><input class="menu-inp" style="width:24px" tabindex="-1"></td><td><input class="menu-inp" style="width:28px" tabindex="-1"></td><td></td></tr>`;
  const spacers=ghostRowD.repeat(Math.max(0,padTo-rows.length));
  return `<div class="menu-section">
    <div class="menu-sec-hdr" style="background:${cfg.bg};color:${cfg.color}">Dinner</div>
    <div class="menu-dish-list">${parts||'<div class="menu-dish" style="color:#aaa">—</div>'}</div>
    <table class="menu-sched-tbl"><thead><tr><th>Hora</th><th>Grupo</th><th>#</th><th>Kg</th><th></th></tr></thead><tbody>${rowsHtml}${spacers}</tbody></table>
    <div class="menu-total-row"><span>Total: <b>${total||'—'}</b></span><button class="menu-add-btn" onclick="menuAddRow('${dateStr}','dinner')">+ Add</button></div>
  </div>`;
}

function menuEsc(v){return (v||'').toString().replace(/"/g,'&quot;').replace(/</g,'&lt;');}

function menuEnsure(dateStr,meal){
  if(!menuSchedule[dateStr])menuSchedule[dateStr]={};
  if(!Array.isArray(menuSchedule[dateStr][meal]))menuSchedule[dateStr][meal]=[];
}

function menuAddRow(dateStr,meal){
  menuEnsure(dateStr,meal);
  menuSchedule[dateStr][meal].push({time:'',group:'',pax:''});
  menuSaveSchedule();
  menuRenderWeek();
}

function menuRemoveRow(dateStr,meal,idx){
  menuEnsure(dateStr,meal);
  menuSchedule[dateStr][meal].splice(idx,1);
  menuSaveSchedule();
  menuRenderWeek();
}

function menuUpdateRow(dateStr,meal,idx,field,val){
  menuEnsure(dateStr,meal);
  if(!menuSchedule[dateStr][meal][idx])menuSchedule[dateStr][meal][idx]={time:'',group:'',pax:''};
  menuSchedule[dateStr][meal][idx][field]=val;
  menuSaveSchedule();
}

function menuSaveSchedule(){
  if(typeof db!=='undefined'){
    (async()=>{try{await db.from('app_store').upsert({key:'menuSchedule',value:menuSchedule,updated_at:new Date().toISOString()});}catch(e){}})();
  }
}

function menuMealTime(bk,meal,dateStr){
  const sr=bk.scheduleRequest||{};
  const ov=sr.adminOverride||{};
  function addMin(t,m){if(!t)return '';const[h,mn]=t.split(':').map(Number);const tot=h*60+mn+m;return String(Math.floor(tot/60)%24).padStart(2,'0')+':'+String(tot%60).padStart(2,'0');}

  const isArrival   = dateStr && bk.startDate && dateStr===bk.startDate.slice(0,10);
  const isDeparture = dateStr && bk.endDate   && dateStr===bk.endDate.slice(0,10);

  // Fruit, Coffee &amp; Tea: always 7:00 AM
  if(meal==='lightBreakfast') return '07:00';

  // Brunch: 15 min after morning class ends
  // Uses departure-day class if applicable; arrival day has no morning class → fall through to '09:30'
  if(meal==='brunch'){
    let mStart='', mDur=90;
    const mornSkipped=(bk.scheduleSkips||[]).some(s=>s.date===dateStr&&s.period==='morn');
    if(isDeparture && sr.hasDepartureClass && sr.departureSlot){
      mStart=sr.departureSlot;
      mDur=parseInt(sr.departureDur||60);
    } else if(!isArrival && !mornSkipped){
      // Regular day — admin override takes priority
      mStart=ov.morningStart||sr.morningStart||'';
      mDur=parseInt(ov.morningDur||sr.morningDur||90);
    }
    return mStart ? addMin(mStart,mDur+15)||'09:30' : '09:30';
  }

  // Lunch: fixed 1:00 PM
  if(meal==='lunch') return '13:00';
  // Snack: always 3:00 PM
  if(meal==='snack') return '15:00';

  // Dinner: 45 min after evening class ends
  if(meal==='dinner'){
    // Arrival day: may have an arrival evening class
    if(isArrival && sr.hasArrivalClass && sr.arrivalSlot){
      const afDur=parseInt(sr.arrivalDur||60);
      return addMin(sr.arrivalSlot,afDur+45)||'19:30';
    }
    const aftSkipped=(bk.scheduleSkips||[]).some(s=>s.date===dateStr&&s.period==='aft');
    const afStart=ov.afternoonStart||sr.afternoonSlot||sr.afternoonStart||'';
    const afDur=parseInt(ov.afternoonDur||sr.afternoonDur||60);
    if(sr.hasAfternoon&&afStart&&!aftSkipped) return addMin(afStart,afDur+45)||'19:30';
    return '19:30';
  }
  return '';
}


function menuPopulateFromRetreats(silent=false){
  if(!menuCurrentMonday)return;
  try{
  const weekDays=[];
  for(let i=0;i<7;i++){
    const d=new Date(menuCurrentMonday+'T12:00:00');
    d.setDate(d.getDate()+i);
    weekDays.push(d.toISOString().split('T')[0]);
  }
  const wFirst=weekDays[0], wLast=weekDays[6];

  const allActive=AppData.bookings.filter(b=>b.status!=='cancelled');
  const hits=allActive.filter(b=>{
    const s=(b.startDate||'').slice(0,10), e=(b.endDate||'').slice(0,10);
    return s&&e&&s<=wLast&&e>=wFirst;
  });

  if(!hits.length){
    const sample=allActive.slice(0,5).map(b=>`${b.leaderName||b.retreatName||'?'}: ${(b.startDate||'—').slice(0,10)}`).join(' | ');
    showToast(`No retreats for ${wFirst}→${wLast}. ${allActive.length} in system: ${sample||'none'}`);
    return;
  }

  const MEAL_PLANS={
    standard:['lightBreakfast','brunch','snack','dinner'],
    full:['lightBreakfast','lunch','dinner']
  };
  // Brunch ≤ 11:45; 12:15–14:30 → lunch
  const routeMeal=(meal,t)=>{
    if(meal==='brunch'&&t){
      if(t<'09:45') return 'lightBreakfast';
      if(t>='12:15'&&t<='14:30') return 'lunch';
    }
    return meal;
  };
  const allMeals=['lightBreakfast','brunch','lunch','snack','dinner'];

  // Clear ALL existing rows for these retreat groups across this week first,
  // so re-running always refreshes with the current meal plan rules
  const grpSet=new Set(hits.map(b=>b.leaderName||b.retreatName||'Group'));
  weekDays.forEach(dateStr=>{
    allMeals.forEach(meal=>{
      if(menuSchedule[dateStr]?.[meal])
        menuSchedule[dateStr][meal]=menuSchedule[dateStr][meal].filter(r=>!grpSet.has(r.group));
    });
  });

  // Re-add with correct meal plan + time routing
  let added=0;
  weekDays.forEach(dateStr=>{
    hits.forEach(bk=>{
      const s=(bk.startDate||'').slice(0,10), e=(bk.endDate||'').slice(0,10);
      if(dateStr<s||dateStr>e) return;
      const grp=bk.leaderName||bk.retreatName||'Group';
      const px=String(bk.pax||'');
      const planMeals=MEAL_PLANS[bk.mealPlan]||MEAL_PLANS.standard;
      planMeals.forEach(meal=>{
        const t=menuMealTime(bk,meal,dateStr);
        const actualMeal=routeMeal(meal,t);
        // If brunch routes back to lightBreakfast, skip — LB is already
        // being added separately and brunch was too early to serve.
        if(meal==='brunch'&&actualMeal==='lightBreakfast') return;
        menuEnsure(dateStr,actualMeal);
        menuSchedule[dateStr][actualMeal].push({time:t,group:grp,pax:px});
        added++;
      });
    });
    allMeals.forEach(meal=>{
      if(menuSchedule[dateStr]?.[meal])
        menuSchedule[dateStr][meal].sort((a,b)=>(a.time||'').localeCompare(b.time||''));
    });
  });

  menuSaveSchedule();
  menuRenderWeek();
  if(!silent){
    const names=[...new Set(hits.map(b=>b.leaderName||b.retreatName||'Group'))];
    showToast(`Populated ${names.join(', ')} · ${added} meal rows`);
  }
  }catch(err){if(!silent)showToast('Error: '+(err&&err.message||String(err)));}
}

function menuSyncPrintTo(){
  const f=document.getElementById('menuPrintFrom');
  const t=document.getElementById('menuPrintTo');
  if(!f||!t||!f.value)return;
  t.min=f.value;
  // If To is before From, or To is in a different month/year, jump To to From+6 days
  if(!t.value||t.value<f.value||t.value.slice(0,7)!==f.value.slice(0,7)){
    const d=new Date(f.value+'T00:00:00');
    d.setDate(d.getDate()+6);
    t.value=d.toISOString().split('T')[0];
  }
}

function menuPrint(){
  const fromVal=document.getElementById('menuPrintFrom')?.value;
  const toVal=document.getElementById('menuPrintTo')?.value;
  if(!fromVal||!toVal){showToast('Please select a From and To date first.');return;}
  if(toVal<fromVal){showToast('End date must be after start date.');return;}
  // Build list of days in range (max 31)
  const days=[];
  const d=new Date(fromVal+'T12:00:00');
  const end=new Date(toVal+'T12:00:00');
  while(d<=end&&days.length<31){
    days.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate()+1);
  }
  const printHasLunch=days.some(ds=>(menuSchedule[ds]?.lunch||[]).length>0);
  const meals=['lightBreakfast','brunch',...(printHasLunch?['lunch']:[]),'snack','dinner'];
  const mealCfg={lightBreakfast:{label:'Fruit, Coffee &amp; Tea',bg:'#f5deb3',color:'#7c5a1e'},brunch:{label:'Brunch',bg:'#fef3c7',color:'#78350f'},lunch:{label:'Lunch',bg:'#fed7aa',color:'#7c2d12'},snack:{label:'Snack',bg:'#d1fae5',color:'#065f46'},dinner:{label:'Dinner',bg:'#dbeafe',color:'#1e3a5f'}};
  const fmtD=ds=>{const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});};
  // Pre-compute max schedule rows per meal across all selected days
  const maxR={};
  meals.forEach(m=>{maxR[m]=Math.max(0,...days.map(ds=>(menuSchedule[ds]?.[m]||[]).length));});
  const colW=`repeat(${days.length},1fr)`;
  // Build grid HTML
  let gridHtml=`<div style="display:grid;grid-template-columns:${colW};gap:1px;background:#ccc;border:1px solid #ccc;border-radius:4px;overflow:hidden">`;
  // Day headers
  days.forEach(ds=>{
    const mi=menuDayIndex(ds);
    const d=new Date(ds+'T12:00:00');
    gridHtml+=`<div style="background:#1a2332;color:#fff;padding:6px 4px;text-align:center"><div style="font-size:7px;text-transform:uppercase;opacity:.7">${d.toLocaleDateString('en-US',{weekday:'long'})}</div><div style="font-size:11px;font-weight:600;margin-top:1px">${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div><div style="font-size:8px;opacity:.5;margin-top:1px">Day ${mi}</div></div>`;
  });
  // Meal rows
  meals.forEach(meal=>{
    const cfg=mealCfg[meal];
    days.forEach(ds=>{
      const mi=menuDayIndex(ds);
      const mData=WEEKLY_MENU[mi]||{};
      const sData=menuSchedule[ds]||{};
      const rows=sData[meal]||[];
      const total=rows.reduce((n,r)=>n+(parseInt(r.pax)||0),0);
      // Dishes
      let dishesHtml='';
      if(meal==='dinner'){
        const din=mData.dinner||{};
        if(din.protein) dishesHtml+=`<div style="font-weight:700;font-size:8.5px;color:#1e3a5f;padding:2px 0;border-bottom:1px dotted #cde">★ ${din.protein}</div>`;
        (din.dishes||[]).forEach(d2=>{ dishesHtml+=`<div style="font-size:8px;padding:1px 0;border-bottom:1px dotted #e0dbd2">${d2}</div>`; });
        if(din.dessert) dishesHtml+=`<div style="font-size:7px;font-weight:700;text-transform:uppercase;color:#888;margin-top:3px">Postre</div><div style="font-size:8px;padding:1px 0">${din.dessert}</div>`;
      } else {
        (mData[meal]||[]).forEach(d2=>{
          const isProt=(meal==='brunch'||meal==='lunch')&&d2.includes('★');
          dishesHtml+=isProt
            ?`<div style="font-weight:700;font-size:8.5px;color:#78350f;padding:2px 0;border-bottom:1px dotted #fde">★ ${d2.replace(' ★','')}</div>`
            :`<div style="font-size:8px;padding:1px 0;border-bottom:1px dotted #e0dbd2">${d2}</div>`;
        });
      }
      // Schedule rows
      let schedHtml='<table style="width:100%;border-collapse:collapse;font-size:8px"><thead><tr><th style="padding:2px 3px;background:#f0ece4;font-size:7px;font-weight:700;text-transform:uppercase;color:#888;border-top:1px solid #ddd">Hora</th><th style="padding:2px 3px;background:#f0ece4;font-size:7px;font-weight:700;text-transform:uppercase;color:#888;border-top:1px solid #ddd">Grupo</th><th style="padding:2px 3px;background:#f0ece4;font-size:7px;font-weight:700;text-transform:uppercase;color:#888;border-top:1px solid #ddd">#</th></tr></thead><tbody>';
      rows.forEach(r=>{schedHtml+=`<tr><td style="padding:2px 3px;border-top:1px solid #f2efe8">${r.time||''}</td><td style="padding:2px 3px;border-top:1px solid #f2efe8">${r.group||''}</td><td style="padding:2px 3px;border-top:1px solid #f2efe8;text-align:center">${r.pax||''}</td></tr>`;});
      // Spacer rows for alignment
      for(let p=rows.length;p<maxR[meal];p++) schedHtml+=`<tr><td colspan="3" style="padding:2px 3px;border-top:1px solid #f2efe8">&nbsp;</td></tr>`;
      schedHtml+='</tbody></table>';
      gridHtml+=`<div style="background:#fff"><div style="padding:3px 5px;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;background:${cfg.bg};color:${cfg.color};text-align:center">${cfg.label}</div><div style="padding:4px 5px;background:#fafaf7">${dishesHtml||'<div style="font-size:8px;color:#aaa">—</div>'}</div>${schedHtml}<div style="padding:2px 5px;font-size:8px;color:#888;background:#f5f2ec;border-top:1px solid #e8e2d8;text-align:right">Total: ${total||'—'}</div></div>`;
    });
  });
  gridHtml+='</div>';
  const fromFmt=fmtD(fromVal), toFmt=fmtD(toVal);
  const title=fromVal===toVal?`Menu — ${fromFmt}`:`Menu — ${fromFmt} to ${toFmt}`;
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head>
  <link rel="icon" type="image/png" href="/favicon.png"><meta charset="utf-8"><title>${title}</title><style>body{font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:16px;font-size:11px;}h1{font-size:15px;margin:0 0 10px;text-align:center;}@media print{@page{size:landscape}}</style></head><body><h1>${title}</h1>${gridHtml}</body></html>`);
  w.document.close();
  setTimeout(()=>w.print(),400);
}

// Guest-facing poster for a single day — put up each morning so guests can see
// the day's dinner ahead of time and let us know if they'll go off-site instead.
// English translations for the guest-facing poster — the kitchen's working
// list (WEEKLY_MENU, above) stays in Spanish; only the printed poster is
// translated. Well-known dish names (Chilaquiles, Huevos Rancheros, etc.)
// are kept as-is, matching how they'd read on any English menu.
const MENU_EN={
  'Chilaquiles':'Chilaquiles',
  'Omelette de Espinaca':'Spinach Omelette',
  'Tinga de Pollo':'Chicken Tinga',
  'Ensalada Amansala':'Amansala Salad',
  'Summer Rolls con Gazpacho':'Summer Rolls with Gazpacho',
  'Grilled Lemon Kebabs Pollo':'Grilled Lemon Chicken Kebabs',
  'Grilled Eggplant con Tahini':'Grilled Eggplant with Tahini',
  'Deconstructed Cheesecake':'Deconstructed Cheesecake',
  'Huevos Rancheros':'Huevos Rancheros',
  'Pan de Platano':'Banana Bread',
  'Salmon con Miel y Ajo':'Honey Garlic Salmon',
  'Ensalada Edamame':'Edamame Salad',
  'Guacamole con Veggies y Chips':'Guacamole with Veggies & Chips',
  'Pollo':'Chicken',
  'Ensalada Verde':'Green Salad',
  'Risotto de Espinaca':'Spinach Risotto',
  'Flan de Cafe':'Coffee Flan',
  'Huevos Verdes':'Eggs in Green Salsa',
  'Pan de Frances':'French Toast',
  'Ensalada Mexicana':'Mexican Salad',
  'Hummus con Veggies y Chips':'Hummus with Veggies & Chips',
  'Pescado':'Fish',
  'Sopa de Calabaza':'Pumpkin Soup',
  'Quinoa Verduras':'Quinoa with Vegetables',
  'Vegan Choco Mouse':'Vegan Chocolate Mousse',
  'Kebabs Pollo/Tofu':'Chicken/Tofu Kebabs',
  'Ensalada Griega':'Greek Salad',
  'Babaganoush Tostada':'Baba Ganoush Tostada',
  'Quesadillas con Brócoli y Queso':'Broccoli & Cheese Quesadillas',
  'Cabbage Steak con Tahini':'Cabbage Steak with Tahini',
  'Camote al Horno':'Roasted Sweet Potato',
  'Pie de Manzana':'Apple Pie',
  'Huevos Duros':'Hard-Boiled Eggs',
  'Pescado Congelado':'Fish',
  'Protein Balls con Fruta Fresca':'Protein Balls with Fresh Fruit',
  'Sopa de Tortilla':'Tortilla Soup',
  'Pay de Manzana · Brownie':'Apple Pie · Brownie',
  'Huevos Revueltos':'Scrambled Eggs',
  'Pescado en Hoja de Platano':'Fish in Banana Leaf',
  'Ensalada de Pepino':'Cucumber Salad',
  'Spinach con Ajo':'Garlic Spinach',
  'Fritatta':'Frittata',
  'Pan de Frances con Coco':'Coconut French Toast',
  'Pollo con Ajo Asado':'Roasted Garlic Chicken',
  'Fruta':'Fresh Fruit',
  'Plant Based Night — Phad Thai':'Plant-Based Night — Pad Thai',
  'Fruta · Granola · Chia · Pan de Platano':'Fruit · Granola · Chia · Banana Bread',
  'Fruta · Granola · Chia · Pan de Zucchini':'Fruit · Granola · Chia · Zucchini Bread',
};
function menuTrEn(s){return MENU_EN[s]||s;}

// Nicer English names + a short guest-facing description for each dish
// currently on the app's 7-day brunch/snack/dinner rotation, matched from the
// real menu wording provided — the app's own dish list is unchanged, this
// only dresses up how each existing item reads on the printed poster.
const MENU_DETAIL={
  'Chilaquiles':{name:'Chilaquiles',desc:'Tortilla chips, salsa, cream, cheese.'},
  'Protein Pancakes':{name:'Hotcakes',desc:'Hotcakes, fresh fruit, honey.'},
  'Tinga de Pollo':{name:'Chicken Tinga',desc:'Shredded chicken, chipotle, tomato.'},
  'Ensalada Amansala':{name:'Amansala Salad',desc:'Mixed greens, seeds, citrus vinaigrette.'},
  'Huevos Rancheros':{name:'Huevos Rancheros',desc:'Eggs, tortilla, ranchero salsa, fresh cheese.'},
  'Avocado Toast':{name:'Avocado Toast',desc:'Bread, avocado, lime, chili.'},
  'Pan de Platano':{name:'Banana Bread',desc:'Banana bread.'},
  'Ensalada Edamame':{name:'Edamame & Avocado Salad',desc:'Edamame, avocado.'},
  'Poke Bowl':{name:'Salmon Poke Bowl',desc:'Salmon, sushi rice, vegetables.'},
  'Huevos Verdes':{name:'Green Eggs',desc:'Eggs, green herbs, salsa verde.'},
  'Blackened Tacos':{name:'Blackened Fish Tacos',desc:'Fish, tortillas, cabbage slaw, lime.'},
  'Ensalada Mexicana':{name:'Mexican Salad',desc:'Lettuce, tomato, avocado, corn, lime.'},
  'Kebabs Pollo/Tofu':{name:'Chicken & Tofu Kebabs',desc:'Chicken, tofu, spices.'},
  'Ensalada Griega':{name:'Greek Salad',desc:'Cucumber, tomato, red onion, olives, feta.'},
  'Babaganoush Tostada':{name:'Baba Ganoush',desc:'Eggplant, olive oil, flatbread.'},
  'Pescado Congelado':{name:'Grilled Fish',desc:'Fish, herbs, lime.'},
  'Fritatta':{name:'Frittata',desc:'Eggs, vegetables.'},
  'Pan de Frances con Coco':{name:'Coconut French Bread',desc:'French bread, coconut.'},
  'Pollo con Ajo Asado':{name:'Grilled Chicken',desc:'Chicken breast.'},
  'Fruta':{name:'Fresh Fruit',desc:'Seasonal fruit.'},
  'Protein Balls con Fruta Fresca':{name:'Cacao Energy Bites',desc:'Mixed nuts, raw cacao, dates, coconut & Mayan honey.'},
  'Huevos Revueltos':{name:'Scrambled Eggs',desc:'Eggs.'},
  'Pan de Frances':{name:'French Bread',desc:'French bread.'},

  'Grilled Lemon Kebabs Pollo':{name:'Grilled Lemon Chicken Kebabs',desc:'Tender pieces of chicken marinated in fresh lemon juice, olive oil, and herbs, then perfectly grilled to achieve a juicy texture and a bright, zesty flavor.'},
  'Grilled Eggplant con Tahini':{name:'Grilled Eggplant with Tahini',desc:'Char-grilled eggplant, smoky and soft, finished with a creamy tahini drizzle.'},
  'Tostada Bar':{name:'Tostada Bar',desc:'A vibrant build-your-own tostada station with crunchy tostadas and flavorful beans, allowing guests to create their perfect bite with fresh toppings and bold Mexican flavors.'},

  'Ensalada Verde':{name:'Green Salad',desc:'Mixed greens with a light house dressing.'},
  'Risotto de Espinaca':{name:'Spinach Risotto',desc:'Slow-cooked to perfection, infused with fresh spinach, a touch of Parmesan cheese, and bright notes of fresh lemon zest.'},
  'Flan de Cafe':{name:'Coffee Flan',desc:'Silky coffee-infused flan with a rich caramel finish.'},

  'Sopa de Calabaza':{name:'Pumpkin Soup',desc:'Creamy roasted pumpkin soup with a hint of warm spices.'},
  'Quinoa Verduras':{name:'Quinoa with Seasonal Vegetables',desc:'Nutritious quinoa tossed with fresh seasonal vegetables for a wholesome, colorful side.'},
  'Vegan Choco Mouse':{name:'Vegan Chocolate Mousse',desc:'Cocoa, avocado, and coconut milk mousse — rich and creamy, naturally dairy-free.'},

  'Cabbage Steak con Tahini':{name:'Cabbage Steak with Tahini & Nut Sauce',desc:'Thick-cut roasted cabbage steak, caramelized and topped with a creamy tahini and nut sauce.'},
  'Camote al Horno':{name:'Roasted Sweet Potato',desc:'Sweet potato.'},
  'Pie de Manzana':{name:'Apple Pie',desc:'A classic apple pie made with warmly spiced apples in a buttery crust.'},

  'Corn Ribs':{name:'Charred Corn Ribs with Chili-Lime Butter',desc:'Grilled corn cut into rib-style pieces, charred and brushed with a zesty chili-lime butter.'},
  'Sopa de Tortilla':{name:'Tortilla Soup',desc:'Tomato-based soup with crispy tortilla strips, jicama, and avocado.'},
  'Pay de Manzana · Brownie':{name:'Apple Pie · Gluten-Free Chocolate Brownie',desc:''},

  'Pescado en Hoja de Platano':{name:'Banana Leaf-Wrapped Fish',desc:'Fresh fish fillet delicately seasoned and wrapped in a fragrant banana leaf, then gently steamed to lock in moisture and subtle herbal aromas.'},
  'Ensalada de Pepino':{name:'Cucumber Salad with Sesame',desc:'Crisp cucumber slices tossed in a light sesame dressing, finished with toasted sesame seeds for a nutty aroma and delicate crunch.'},
  'Spinach con Ajo':{name:'Garlic Spinach',desc:'Fresh spinach lightly sautéed with garlic and olive oil for a simple, nourishing balance.'},

  'Plant Based Night — Phad Thai':{name:'Plant-Based Night — Pad Thai',desc:'Classic Thai stir-fried rice noodles with tofu, egg, and fresh vegetables, tossed in a sweet and tangy tamarind sauce, topped with crushed peanuts, bean sprouts, and fresh lime.'},
  'Thai Slaw':{name:'Thai Slaw',desc:'Fresh shredded cabbage tossed with cilantro, sesame, and a light tangy dressing.'},
  'Coconut Ice Cream':{name:'Coconut Ice Cream',desc:'Cool, creamy coconut ice cream — a refreshing finish to the evening.'},

  'Pollo':{name:'Grilled Chicken',desc:'Tender grilled chicken, seasoned with herbs and spices and cooked to juicy perfection.'},
  'Pescado':{name:'Fish Fillet with Pineapple & Red Pepper Salsa',desc:'Fresh fish fillet topped with a vibrant pineapple and red pepper salsa, bringing a bright and tropical balance to every bite.'},
  'Salmon':{name:'Salmon',desc:'Fresh salmon fillet, simply seasoned and perfectly cooked to highlight its natural flavor.'},
  'Brownie':{name:'Brownie',desc:'A rich, fudgy chocolate brownie with deep cocoa flavor.'},
};
function menuItemDetail(s){return MENU_DETAIL[s]||{name:menuTrEn(s),desc:''};}

function menuPrintDay(dateStr){
  const mi=menuDayIndex(dateStr);
  const mData=WEEKLY_MENU[mi]||{};
  const d=new Date(dateStr+'T12:00:00');
  const dayName=d.toLocaleDateString('en-US',{weekday:'long'});
  const dateFmt=d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});

  const itemHtml=(s,starred)=>{
    const isStar=s.includes('★');
    const clean=s.replace(' ★','').replace('★ ','');
    const {name,desc}=menuItemDetail(clean);
    return `<div class="menu-poster-item${(starred||isStar)?' starred':''}">${name}</div>${desc?`<div class="menu-poster-item-desc">${desc}</div>`:''}`;
  };

  const section=(label,items)=>{
    if(!items||!items.length)return'';
    return `<div class="menu-poster-section">
      <div class="menu-poster-label">${label}</div>
      <div class="menu-poster-items">${items.map(it=>itemHtml(it,false)).join('')}</div>
    </div>`;
  };

  const dinnerHtml=mData.dinner?`<div class="menu-poster-section">
    <div class="menu-poster-label">Dinner</div>
    <div class="menu-poster-items">
      ${mData.dinner.protein?itemHtml(mData.dinner.protein,true):''}
      ${(mData.dinner.dishes||[]).map(d2=>itemHtml(d2,false)).join('')}
      ${mData.dinner.dessert?`<div class="menu-poster-dessert">Dessert · ${menuItemDetail(mData.dinner.dessert).name}</div>`:''}
    </div>
  </div>`:'';

  const html=`<!DOCTYPE html><html><head><meta charset="utf-8">
  <link rel="icon" type="image/png" href="/favicon.png">
  <title>Menu — ${dayName}, ${dateFmt}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Jost:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    @page{size:portrait;margin:0.6in}
    *{box-sizing:border-box}
    body{font-family:'Jost',sans-serif;margin:0;padding:56px 64px;color:#2d2520;background:#fdfbf7}
    .menu-poster-brand{text-align:center;font-family:'Cormorant Garamond',serif;font-size:22px;letter-spacing:4px;text-transform:uppercase;color:#8a7e74;margin-bottom:4px}
    .menu-poster-day{text-align:center;font-family:'Cormorant Garamond',serif;font-size:52px;font-weight:600;color:#2d2520;margin:0 0 2px}
    .menu-poster-date{text-align:center;font-size:15px;letter-spacing:1px;color:#8a7e74;text-transform:uppercase;margin-bottom:44px}
    .menu-poster-divider{width:60px;height:2px;background:#c9a876;margin:0 auto 44px}
    .menu-poster-section{margin-bottom:36px}
    .menu-poster-label{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600;color:#8a5a2e;letter-spacing:.5px;border-bottom:1.5px solid #e8dfd4;padding-bottom:8px;margin-bottom:14px;text-align:center}
    .menu-poster-items{display:flex;flex-direction:column;gap:4px}
    .menu-poster-item{font-size:18px;color:#3a332c;text-align:center;margin-top:6px}
    .menu-poster-item.starred{font-weight:700;color:#2d2520;font-size:20px}
    .menu-poster-item-desc{font-size:12.5px;color:#9a8f83;text-align:center;font-style:italic;line-height:1.55;max-width:480px;margin:2px auto 0}
    .menu-poster-dessert{margin-top:10px;font-size:15px;font-style:italic;color:#8a7e74;text-align:center}
    .menu-poster-footer{text-align:center;margin-top:50px;font-size:12px;color:#b8ab9e;letter-spacing:.4px;line-height:1.7}
    @media print{body{padding:20px 40px}}
  </style></head>
  <body>
    <div class="menu-poster-brand">Amansala</div>
    <div class="menu-poster-day">${dayName}</div>
    <div class="menu-poster-date">${dateFmt}</div>
    <div class="menu-poster-divider"></div>
    ${section('Brunch',mData.brunch)}
    ${section('Afternoon Snack',mData.snack)}
    ${dinnerHtml}
    <div class="menu-poster-footer">Please let the front desk know if you'll be dining off-site tonight.<br>For specific requests, please see your waiter. Please confirm any severe allergies with your host.</div>
  </body></html>`;

  const w=window.open('','_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(()=>w.print(),500);
}

