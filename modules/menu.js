// ===== menu.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== MENU TAB =====
let menuSchedule = {};       // { 'YYYY-MM-DD': { lightBreakfast:[{time,group,pax}], brunch:[], snack:[], dinner:[] } }
let menuCurrentMonday = null;

const WEEKLY_MENU = {
  1: { // Lunes (Monday) — Day 1
    lightBreakfast: ['Fruta · Granola · Chia · Pan de Platano'],
    brunch: ['Chilaquiles','Omelette de Espinaca','Protein Pancakes','Tinga de Pollo ★','Ensalada Amansala','Tostada Bar'],
    lunch:  ['Tinga de Pollo ★','Ensalada Amansala'],
    snack:  ['Summer Rolls con Gazpacho'],
    dinner: {protein:'Grilled Lemon Kebabs Pollo',dishes:['Grilled Eggplant con Tahini'],dessert:'Deconstructed Cheesecake'}
  },
  2: { // Martes (Tuesday) — Day 2
    lightBreakfast: ['Fruta · Granola · Chia · Pan de Zucchini'],
    brunch: ['Huevos Rancheros','Avocado Toast','Pan de Platano','Salmon con Miel y Ajo ★','Ensalada Edamame','Poke Bowl'],
    lunch:  ['Salmon con Miel y Ajo ★','Ensalada Edamame','Poke Bowl'],
    snack:  ['Guacamole con Veggies y Chips'],
    dinner: {protein:'Pescado',dishes:['Sopa de Calabaza','Quinoa Verduras'],dessert:'Vegan Choco Mouse'}
  },
  3: { // Miércoles (Wednesday) — Day 3
    lightBreakfast: ['Fruta · Granola · Chia · Pan de Platano'],
    brunch: ['Chilaquiles','Huevos Verdes','Pan de Frances','Blackened Tacos ★','Ensalada Mexicana'],
    lunch:  ['Blackened Tacos ★','Ensalada Mexicana'],
    snack:  ['Hummus con Veggies y Chips'],
    dinner: {protein:'Pollo',dishes:['Ensalada Verde','Risotto de Espinaca'],dessert:'Flan de Cafe'}
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
  // Unlike week-arrow navigation (which stays Sunday-anchored to match the
  // kitchen's weekly spreadsheet), jumping to a specific date should show
  // exactly that date as the first day — not snap back to that week's Sunday.
  menuCurrentMonday=val;
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

// Color-code each protein type so the week's spread is scannable at a
// glance — chicken, salmon, and other fish/seafood each get their own color;
// a plant-based night (or any day with no protein) gets its own too.
function menuProteinColor(text){
  const s=(text||'').toLowerCase();
  if(!s||s.includes('plant')||s.includes('phad thai')||s.includes('vegan')||s.includes('tofu'))return{bg:'#dcfce7',color:'#166534',border:'#86efac'};
  if(s.includes('salmon')||s.includes('salmón'))return{bg:'#ffe4e6',color:'#9f1239',border:'#fda4af'};
  if(s.includes('pollo')||s.includes('chicken')||s.includes('kebab'))return{bg:'#fef3c7',color:'#92400e',border:'#fde68a'};
  if(s.includes('pescado')||s.includes('camaron')||s.includes('camarón')||s.includes('robalo')||s.includes('basa')||s.includes('fish')||s.includes('shrimp'))return{bg:'#dbeafe',color:'#1e40af',border:'#93c5fd'};
  if(s.includes('res')||s.includes('beef')||s.includes('arrachera'))return{bg:'#fee2e2',color:'#991b1b',border:'#fca5a5'};
  return{bg:'#fef9e7',color:'#78350f',border:'#fde8c8'};
}

function menuRenderMealSection(dateStr,mealKey,dishes,rows,padTo=0,dishPadTo=0){
  const cfg=MENU_MEAL_CFG[mealKey]||{label:mealKey,bg:'#f5f3ee',color:'#555'};
  const total=rows.reduce((n,r)=>n+(parseInt(r.pax)||0),0);
  const dishesHtml=dishes.map((d,i)=>{
    const isProtein=(mealKey==='brunch'||mealKey==='lunch')&&d.includes('★');
    const label=d.replace(' ★','');
    if(!isProtein)return`<div class="menu-dish">${d}</div>`;
    const pc=menuProteinColor(label);
    return `<div class="menu-dish" style="font-weight:700;color:${pc.color};background:${pc.bg};margin:-5px -8px 3px;padding:4px 8px;border-bottom:1px solid ${pc.border}">★ ${label}</div>`;
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
  const dpc=menuProteinColor(dinner.protein);
  const proteinHtml=dinner.protein?`<div class="menu-dish" style="font-weight:700;color:${dpc.color};background:${dpc.bg};margin:-5px -8px 3px;padding:4px 8px;border-bottom:1px solid ${dpc.border}">★ ${dinner.protein}</div>`:'';
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

  const itemHtml=(s)=>{
    const clean=s.replace(' ★','').replace('★ ','');
    const {name,desc}=menuItemDetail(clean);
    return `<div class="menu-poster-item">${name}</div>${desc?`<div class="menu-poster-item-desc">${desc}</div>`:''}`;
  };

  const section=(label,items)=>{
    if(!items||!items.length)return'';
    return `<div class="menu-poster-section">
      <div class="menu-poster-label">${label}</div>
      <div class="menu-poster-items">${items.map(it=>itemHtml(it)).join('')}</div>
    </div>`;
  };

  const dinnerHtml=mData.dinner?`<div class="menu-poster-section">
    <div class="menu-poster-label">Dinner</div>
    <div class="menu-poster-items">
      ${mData.dinner.protein?itemHtml(mData.dinner.protein):''}
      ${(mData.dinner.dishes||[]).map(d2=>itemHtml(d2)).join('')}
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
    .menu-poster-page2{page-break-before:always;padding-top:40px}
    @media print{body{padding:20px 40px}.menu-poster-page2{padding-top:20px}}
  </style></head>
  <body>
    <div class="menu-poster-brand">Amansala</div>
    <div class="menu-poster-day">${dayName}</div>
    <div class="menu-poster-date">${dateFmt}</div>
    <div class="menu-poster-divider"></div>
    ${section('Brunch',mData.brunch)}
    ${section('Afternoon Snack',mData.snack)}
    ${dinnerHtml?`<div class="menu-poster-page2">
      <div class="menu-poster-brand">Amansala</div>
      <div class="menu-poster-day">${dayName}</div>
      <div class="menu-poster-date">${dateFmt}</div>
      <div class="menu-poster-divider"></div>
      ${dinnerHtml}
    </div>`:''}
    <div class="menu-poster-footer">Please let the front desk know if you'll be dining off-site tonight.<br>For specific requests, please see your waiter. Please confirm any severe allergies with your host.</div>
  </body></html>`;

  const w=window.open('','_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(()=>w.print(),500);
}

// ===== MENU COSTS =====
// Raw protein pricing (from Darlene's supplier price list, pesos/kg) and a
// growing library of full recipe costs (marinades, sides, dressings, breads —
// from the kitchen's own costing sheet). Together these give a per-day food
// cost estimate. Both lists are starting points she'll keep filling in over
// time, so everything here is editable and persists like any other admin data.
const DEF_MENU_PROTEIN_PRICES=[
  {id:'pollo',     name:'Pechuga de Pollo sin Hueso',        unit:'KG', price:104, portionG:220},
  {id:'res',       name:'Arrachera de Res Marinado Texana',  unit:'KG', price:390, portionG:220},
  {id:'robalo',    name:'Filete Fresco de Róbalo Nacional',  unit:'KG', price:440, portionG:220},
  {id:'basa',      name:'Filete Congelado de Basa',          unit:'KG', price:98,  portionG:220},
  {id:'salmon',    name:'Filete de Salmón Natural',          unit:'KG', price:350, portionG:220},
  {id:'camaron15', name:'Camarón U15',                       unit:'KG', price:450, portionG:220},
  {id:'camaronpz', name:'Camarón Pelado y Desvenado 21/25',  unit:'PZA',price:250, portionG:null},
  {id:'entero',    name:'Pescado Fresco Entero',             unit:'KG', price:310, portionG:220}, // June 2026 catalog lists no price for this cut — worth reconfirming with the supplier
  // Added from the June 2026 supplier catalog (CATALOGO JUNIO2026 ACT):
  {id:'salmonlonja',name:'Salmón Fresco Lonja',              unit:'KG', price:340, portionG:220},
  {id:'arracheraCh',name:'Arrachera Choice',                 unit:'KG', price:368, portionG:220},
  {id:'pulpo',     name:'Pulpo',                             unit:'KG', price:230, portionG:220},
  {id:'camaronsc',  name:'Camarón 21-25 Sin Cabeza Con Cáscara',unit:'KG',price:270, portionG:220},
  {id:'langosta',  name:'Cola de Langosta',                  unit:'KG', price:1300,portionG:220},
  {id:'molida',    name:'Carne Molida 80/20',                unit:'KG', price:225, portionG:220},
  {id:'ribeye',    name:'Rib Eye Sterling',                  unit:'KG', price:606, portionG:220},
  {id:'chicharra', name:'Chicharra',                         unit:'KG', price:350, portionG:220},
];
const DEF_MENU_RECIPE_COSTS=[
  {name:'Pan de Plátano',                portions:48, totalCost:417.48},
  {name:'Brownie Vegano',                portions:24, totalCost:359.60},
  {name:'Hot Cakes Veganos',             portions:12, totalCost:135.90},
  {name:'Aderezo Mediterráneo',          portions:25, totalCost:104.50},
  {name:'Green Goddess',                 portions:35, totalCost:58.00},
  {name:'Aderezo Tahini',                portions:30, totalCost:158.00},
  {name:'Pesto',                         portions:60, totalCost:403.50},
  {name:'Aderezo Curry',                 portions:30, totalCost:88.95},
  {name:'Aderezo Comensal',              portions:40, totalCost:108.50},
  {name:'Marinación Pollo',              portions:20, totalCost:110.85},
  {name:'Marinación Pescado',            portions:20, totalCost:107.53},
  {name:'Curry Rojo',                    portions:20, totalCost:1172.00},
  {name:'Arroz Con Coco',                portions:20, totalCost:1025.00},
  {name:'Ensalada Bang Bang',            portions:20, totalCost:567.20},
  {name:'Aderezo de Cacahuate',          portions:20, totalCost:259.20},
  {name:'Pescado en Hoja de Plátano',    portions:20, totalCost:1931.80},
  {name:'Ensalada de Pepino',            portions:20, totalCost:207.30},
  {name:'Ensalada China',                portions:20, totalCost:226.50},
  {name:'Aderezo Asiático',              portions:20, totalCost:229.50},
  {name:'Masa para Pizza Napolitana',    portions:20, totalCost:112.45},
  {name:'Salsa de Tomate para Pizza',    portions:20, totalCost:136.65},
  {name:'Aderezo para Poke Bowl',        portions:20, totalCost:129.84},
];
// Best-guess mapping of each day's ★ protein to a priced product — clearly
// editable in the panel since some of these (e.g. plain "Pescado") are
// genuinely ambiguous until Darlene confirms which fish is actually used.
const DEF_MENU_PROTEIN_ASSIGN={
  1:{midday:'pollo',  dinner:'pollo'},
  2:{midday:'salmon', dinner:'entero'},   // Tue dinner is now "Pescado" after the Tue/Wed swap
  3:{midday:'pollo',  dinner:'pollo'},    // Wed dinner is now "Pollo" after the Tue/Wed swap
  4:{midday:'basa',   dinner:'pollo'},
  5:{midday:'pollo',  dinner:'salmon'},
  6:{midday:'pollo',  dinner:'entero'},
  7:{midday:'pollo',  dinner:''},         // Sunday dinner is plant-based — no protein cost
};
const MENU_DAY_NAMES={1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday',7:'Sunday'};
// Full supplier catalog (June 2026) — a growing reference for costing more
// recipes over time; not everything here is used in the menu yet.
const DEF_MENU_INGREDIENT_CATALOG=[
  {category:'Pantry & Dry Goods',name:'ACEITE VEGETAL PATRONA 20 Lt',price:692},
  {category:'Pantry & Dry Goods',name:'ACEITE DE AJONJOLI LATA DE 1.657',price:779},
  {category:'Pantry & Dry Goods',name:'ACEITE DE TRUFA BLANCA DE 100 ML ROLAND',price:353},
  {category:'Pantry & Dry Goods',name:'ACEITE OLIVA BLEND PET 1/3.785 L GLOSS',price:396.9},
  {category:'Pantry & Dry Goods',name:'ACEITUNAS EX LARGE KALAMATA 3.3KGS WHOL ACEITUNAS',price:503.04},
  {category:'Pantry & Dry Goods',name:'ARROZ ARBORIO KG',price:179},
  {category:'Pantry & Dry Goods',name:'ARROZ P/SUSHI 2.270 KG KOKUHO',price:119},
  {category:'Pantry & Dry Goods',name:'ARROZ SUPER EXTRA GRANO 1KG DE ORO',price:34},
  {category:'Pantry & Dry Goods',name:'AZUCAR DOLCHE KG',price:30.72},
  {category:'Pantry & Dry Goods',name:'AZUCAR ESTANDAR 1 KG PREVE',price:38},
  {category:'Pantry & Dry Goods',name:'AZUCAR MASCABADO 1/1 KG METCO',price:59},
  {category:'Pantry & Dry Goods',name:'AZUCAR SPLENDA CAJA 700 SOBRES',price:275.1},
  {category:'Pantry & Dry Goods',name:'BEBIDA DE AVENA 1L GUD',price:73},
  {category:'Pantry & Dry Goods',name:'CHICHAROS HERDEZ LATA DE 400 GRS',price:22.6},
  {category:'Pantry & Dry Goods',name:'CHILES JALAPEÑOS EN RODAJAS 2.8 KG CLEMENTE JACQ',price:129},
  {category:'Pantry & Dry Goods',name:'CHILE MACHACADO CRUSHED 1/340.2 G BADIA',price:138.7},
  {category:'Pantry & Dry Goods',name:'CHOCOLATE BLANCO WAFER 1 KG SICAO',price:415.8},
  {category:'Pantry & Dry Goods',name:'CHOCOLATE SEMIAMARGO 52% WAFER 1KG SICAO',price:415.8},
  {category:'Pantry & Dry Goods',name:'COCOA BOLSA 1 KG HERSHEYS',price:318.06},
  {category:'Pantry & Dry Goods',name:'CONCENTRADO D/HORCHATA 1.890L DELICIOSA',price:151.2},
  {category:'Pantry & Dry Goods',name:'CONCENTRADO D/TAMARINDO 1.890L DELICIOSA',price:175.8},
  {category:'Pantry & Dry Goods',name:'CREMA DE CACAHUATE 1.13 KG SKIPPY',price:224.53},
  {category:'Pantry & Dry Goods',name:'CREMA DE COCO 1 LT CALAHUA',price:64},
  {category:'Pantry & Dry Goods',name:'FIDEOS ARROZ NOODLES-HSINCH 396GR ROLAND',price:160.8},
  {category:'Pantry & Dry Goods',name:'FRIJOL BAYO 1 KG EL LABRADOR',price:48},
  {category:'Pantry & Dry Goods',name:'FRIJOL NEGRO BOLA 1 KG GRANO DE ORO',price:48},
  {category:'Pantry & Dry Goods',name:'GALLETA MARIAS 18 PAQ 3.06 KG GAMESA',price:19.44},
  {category:'Pantry & Dry Goods',name:'GALLETAS SALADAS 200/12GR GAMESA',price:271.2},
  {category:'Pantry & Dry Goods',name:'GARBANZOS EN LATA DE 400 GR HERD',price:22.6},
  {category:'Pantry & Dry Goods',name:'HARINA GLUTEN FREE ROLLS Y PIZZA BOLSA 3 KG (TENDENCIA GAS)',price:781},
  {category:'Pantry & Dry Goods',name:'HARINA GLUTEN FREE BROWNIE 3 kg BOLSA(TENDENCIA GASTRONOMICA)',price:694},
  {category:'Pantry & Dry Goods',name:'HARINA P/ HOT CAKES 4.53KG KRUSTEAZ',price:220},
  {category:'Pantry & Dry Goods',name:'HIERBAS DE PROVENZA 1/224 G BADIA',price:109.4},
  {category:'Pantry & Dry Goods',name:'JALAPEÑOS ROD/NACHOS 2.8KG CLEM JACQ',price:null},
  {category:'Pantry & Dry Goods',name:'JAMON VIRGINIA DE PAVO 3.95KG FUD (PIEZA DE 3.95 KG)',price:600.4},
  {category:'Pantry & Dry Goods',name:'JARABE AGAVE CLARO ORGAN 0.33GR AGAVICA',price:64},
  {category:'Pantry & Dry Goods',name:'JARABE NAT 1/1 L MADRILEÑA',price:62.06},
  {category:'Pantry & Dry Goods',name:'JUGO DE MANZANA JUMEX 960 ML',price:35},
  {category:'Pantry & Dry Goods',name:'JUGO MAGGI SAZONADOR 1/1.9 L NESTLE',price:421.8},
  {category:'Pantry & Dry Goods',name:'CAFE AMERICANO MOLIDO 1KG',price:345},
  {category:'Pantry & Dry Goods',name:'CAFÉ CLASICO EN GRANO KG',price:355},
  {category:'Pantry & Dry Goods',name:'CAFÉ DESCAFEINADO MOLIDO KG',price:405},
  {category:'Pantry & Dry Goods',name:'KNORR SUIZA BOTE 3.5 KG',price:423},
  {category:'Pantry & Dry Goods',name:'LECHE CONDENSADA LATA 375GR LA LECHERA',price:33.8},
  {category:'Pantry & Dry Goods',name:'LECHE DE ALMENDRA 1L GUD',price:68.1},
  {category:'Pantry & Dry Goods',name:'LECHE DE COCO 400 ML ROLAND',price:62},
  {category:'Pantry & Dry Goods',name:'LECHE DE COCO SIN AZUCAR 1/1 L GUD',price:55},
  {category:'Pantry & Dry Goods',name:'LECHE DE SOYA ADES NATURAL',price:48.7},
  {category:'Pantry & Dry Goods',name:'LECHE ENTERA 1L LALA',price:38},
  {category:'Pantry & Dry Goods',name:'LECHE EVAPORADA CARNATION 360 ML',price:24.5},
  {category:'Pantry & Dry Goods',name:'LENTEJA 1KG EL LABRADOR',price:41},
  {category:'Pantry & Dry Goods',name:'MASA P/ROLLO PRIMAVERA 25CT WEI CHUAN',price:59.3},
  {category:'Pantry & Dry Goods',name:'MAYONESA 3.4 KG McCORMICK',price:350.2},
  {category:'Pantry & Dry Goods',name:'MAYONESA 1GALON KEMPIE',price:630.16},
  {category:'Pantry & Dry Goods',name:'MEDIA CREMA 1 LT NESTLE',price:92.5},
  {category:'Pantry & Dry Goods',name:'MERMELADA FRESA 980GRS McCORMICK',price:96.34},
  {category:'Pantry & Dry Goods',name:'MIEL MAPLE 1/3.6 L KARO',price:404.35},
  {category:'Pantry & Dry Goods',name:'MIEL MAPLE DE 3.78 LTS H& H',price:185.7},
  {category:'Pantry & Dry Goods',name:'NUTELLA 950 GR',price:194.94},
  {category:'Pantry & Dry Goods',name:'PALITOS ARROZ PAD THAI 1/0.395 KG ROLAND',price:160.8},
  {category:'Pantry & Dry Goods',name:'PAN BLANCO 640GR BIMBO',price:51.2},
  {category:'Pantry & Dry Goods',name:'PAN PITA GRIEGO 7IN 1-12 CT OLYMPIA',price:95},
  {category:'Pantry & Dry Goods',name:'PAN INTEGRAL 675GR BIMBO PAN INTEGRAL 675GR BIMBO',price:57.9},
  {category:'Pantry & Dry Goods',name:'PAPA FRANCESA C/CASC 3/8" 2.27KG LW #32L',price:173.7},
  {category:'Pantry & Dry Goods',name:'PAPEL ARRZ ROL PRIMA8"22CM 44PZA CIRC',price:92},
  {category:'Pantry & Dry Goods',name:'PAPRIKA MOLIDA ESPAÑOLA Bote 454 GR BADIA',price:168.9},
  {category:'Pantry & Dry Goods',name:'PASTA PENNE RIGATE 500GRS BARILLA',price:28.5},
  {category:'Pantry & Dry Goods',name:'PASTA DE CURRY ROJO MAE PLOY KG',price:191.24},
  {category:'Pantry & Dry Goods',name:'PIMIENTA NEGRA ENTERA 1/454 G BADIA',price:null},
  {category:'Pantry & Dry Goods',name:'PLUMA PENNE RIGATE 500GRS BARILLA',price:28.5},
  {category:'Pantry & Dry Goods',name:'SAL MARINA DE MESA REF 1KG SOL',price:23.5},
  {category:'Pantry & Dry Goods',name:'SALCHICHA PAVO 2.16 KG',price:152.3},
  {category:'Pantry & Dry Goods',name:'SALSA CATSUP PET 1/3.23KG HEINZ SALSA CATSUP PET',price:216.4},
  {category:'Pantry & Dry Goods',name:'SALSA DE CHILE 1 /0.920 KG MAE PLOY',price:98.66},
  {category:'Pantry & Dry Goods',name:'SALSA DE SOYA 1/3.79 L KIKKOMAN',price:431.5},
  {category:'Pantry & Dry Goods',name:'SALSA SIRACHA 12/28 OZ ROLAND',price:127},
  {category:'Pantry & Dry Goods',name:'SALSA TERIYAKI 1/3.79 L KIKKOMAN',price:513},
  {category:'Pantry & Dry Goods',name:'SALSA TIPO INGLESA CROSSE & BLACKWELL 4',price:264},
  {category:'Pantry & Dry Goods',name:'SAZONADOR CAJUN 1/652 G BADIA',price:216.5},
  {category:'Pantry & Dry Goods',name:'SYRUP CHOCOLATE 24/589 G',price:73.3},
  {category:'Pantry & Dry Goods',name:'TE MENTA 40 GRS C/20 SOBRES',price:76},
  {category:'Pantry & Dry Goods',name:'TE ENGLISH BREAKFAST 50 GRS C/25 SOBRES',price:78},
  {category:'Pantry & Dry Goods',name:'TE CAMOMILE 30 GRS. C/20 SOBRES',price:76},
  {category:'Pantry & Dry Goods',name:'TE VERDE 30 GRS. C/20 SOBRES',price:76},
  {category:'Pantry & Dry Goods',name:'TOMATE ENTERO PELADO 2.5KG ITALIA MIA',price:140.3},
  {category:'Pantry & Dry Goods',name:'TORTILLA HARINA NATU 30CM 12" 12PZS TACOMEX PARA BURRITO',price:131.1},
  {category:'Pantry & Dry Goods',name:'VAINILLA LT GARY',price:33},
  {category:'Pantry & Dry Goods',name:'VINAGRE BALSAMICO ROLAND 1 LT',price:86},
  {category:'Pantry & Dry Goods',name:'VINAGRE BLANCO GALON 3.8 LT',price:45},
  {category:'Pantry & Dry Goods',name:'VINAGRE DE ARROZ 3.785L ROLAND',price:367.1},
  {category:'Ice Cream (Helados)',name:'HELADO DE FERRERO 4 lTS',price:750},
  {category:'Ice Cream (Helados)',name:'HELADO DE MAIZ 4 LTS.',price:750},
  {category:'Ice Cream (Helados)',name:'HELADO DE MANDARINA 4 LTS.',price:750},
  {category:'Ice Cream (Helados)',name:'HELADO DE COCO 4 LTS',price:750},
  {category:'Ice Cream (Helados)',name:'HELADO DE VAINILLA 4 LTS',price:750},
  {category:'Ice Cream (Helados)',name:'HELADO DE PIESTACHE 4 LTS',price:750},
  {category:'Dairy (Lácteos)',name:'MANTEQUILLA SIN SAL GLORIA KG',price:227},
  {category:'Dairy (Lácteos)',name:'QUESO FETA NAT CUB 1.81KG ODYSSEY',price:541.14},
  {category:'Dairy (Lácteos)',name:'QUESO MANCHEGO GRANEL LVI PZA',price:648},
  {category:'Dairy (Lácteos)',name:'QUESO MOZARELLA BELGIOSO 454GR',price:170},
  {category:'Dairy (Lácteos)',name:'QUESO MOZZAR BARRA 1/2.3 KG APROX AWIPAC (PRECIO XKG)',price:175},
  {category:'Dairy (Lácteos)',name:'QUESO MOZZARELLA FRES 2/454G BELGIOSO',price:231},
  {category:'Dairy (Lácteos)',name:'QUESO OAXACA PZA 3 KG',price:465},
  {category:'Dairy (Lácteos)',name:'QUESO PARMESANO CERA AMARILLA KG',price:222},
  {category:'Dairy (Lácteos)',name:'QUESO SOPERO FRESCO SANTA CECILIA 850 GR',price:63.8},
  {category:'Dairy (Lácteos)',name:'TOCINO REBANADO FUD',price:423.6},
  {category:'Dairy (Lácteos)',name:'TOFU FIRM EXTRA FIRME 349GR MORI',price:41},
  {category:'Dairy (Lácteos)',name:'TOFU 280GR (TENDENCIA GAS)',price:97},
  {category:'Dairy (Lácteos)',name:'YOGHURT BATIDO NATURAL 1 KG YPT',price:null},
  {category:'Proteins (Proteínas)',name:'PULPO 2/4',price:230},
  {category:'Proteins (Proteínas)',name:'CAMARON 21-25 SIN CABEZA CON CASCARA',price:270},
  {category:'Proteins (Proteínas)',name:'CAMARON U15',price:450},
  {category:'Proteins (Proteínas)',name:'COLA DE LANGOSTA KG',price:1300},
  {category:'Proteins (Proteínas)',name:'SALMON FRESCO LONJA',price:340},
  {category:'Proteins (Proteínas)',name:'FILETE ROBALO FRESCO',price:440},
  {category:'Proteins (Proteínas)',name:'FILETE BASA',price:98},
  {category:'Proteins (Proteínas)',name:'PESCADO FRESCO (ENTERO)',price:null},
  {category:'Proteins (Proteínas)',name:'PECHUGA DE POLLO PREMIUM',price:104},
  {category:'Proteins (Proteínas)',name:'ARRACHERA CHOICE',price:368},
  {category:'Proteins (Proteínas)',name:'CARNE MOLIDA 80/20',price:225},
  {category:'Proteins (Proteínas)',name:'RIB EYE STERLING KG',price:606},
  {category:'Proteins (Proteínas)',name:'CHICHARRA',price:350},
  {category:'Produce (Frutas y Verduras)',name:'AGUACATE HAAS',price:102},
  {category:'Produce (Frutas y Verduras)',name:'AJO MACHO',price:350},
  {category:'Produce (Frutas y Verduras)',name:'ALBAHACAR ITALIANA',price:200},
  {category:'Produce (Frutas y Verduras)',name:'APIO',price:17},
  {category:'Produce (Frutas y Verduras)',name:'BETABEL',price:15},
  {category:'Produce (Frutas y Verduras)',name:'BROCOLI',price:25},
  {category:'Produce (Frutas y Verduras)',name:'CALABAZA ITALIANA',price:20},
  {category:'Produce (Frutas y Verduras)',name:'CALABAZA LOCAL',price:45},
  {category:'Produce (Frutas y Verduras)',name:'CEBOLLA BLANCA',price:29},
  {category:'Produce (Frutas y Verduras)',name:'CEBOLLA CAMBRAY',price:12},
  {category:'Produce (Frutas y Verduras)',name:'CEBOLLA MORADA',price:20},
  {category:'Produce (Frutas y Verduras)',name:'CEBOLLINA',price:160},
  {category:'Produce (Frutas y Verduras)',name:'CHAMPIÑON BLANCO',price:125},
  {category:'Produce (Frutas y Verduras)',name:'CHAYOTE LISO',price:14},
  {category:'Produce (Frutas y Verduras)',name:'CHILA HABANERO',price:126},
  {category:'Produce (Frutas y Verduras)',name:'CHILE ANCHO',price:245},
  {category:'Produce (Frutas y Verduras)',name:'CHILE CHIPOTLE',price:31},
  {category:'Produce (Frutas y Verduras)',name:'CHILE DE ARBOL',price:200},
  {category:'Produce (Frutas y Verduras)',name:'CHILE GUAJILLO',price:212},
  {category:'Produce (Frutas y Verduras)',name:'CHILE JALAPEÑO',price:80},
  {category:'Produce (Frutas y Verduras)',name:'CHILE POBLANO',price:125},
  {category:'Produce (Frutas y Verduras)',name:'CHILE SERRANO',price:75},
  {category:'Produce (Frutas y Verduras)',name:'CHILE XCATIC',price:115},
  {category:'Produce (Frutas y Verduras)',name:'CHILES PASILLA',price:360},
  {category:'Produce (Frutas y Verduras)',name:'CHIPOTLE LATA 220GR',price:31},
  {category:'Produce (Frutas y Verduras)',name:'CHOCO MILK 350GR',price:68},
  {category:'Produce (Frutas y Verduras)',name:'CHOCO MILK 350GR',price:68},
  {category:'Produce (Frutas y Verduras)',name:'CHOCO MILK 350GR',price:38},
  {category:'Produce (Frutas y Verduras)',name:'CILANTRO',price:45},
  {category:'Produce (Frutas y Verduras)',name:'COCO RAYADO',price:150},
  {category:'Produce (Frutas y Verduras)',name:'COL BLANCA',price:10},
  {category:'Produce (Frutas y Verduras)',name:'COL MORADA',price:25},
  {category:'Produce (Frutas y Verduras)',name:'COLIFLOR',price:35},
  {category:'Produce (Frutas y Verduras)',name:'ESPINACA',price:38},
  {category:'Produce (Frutas y Verduras)',name:'FRIJOL NEGRO',price:40},
  {category:'Produce (Frutas y Verduras)',name:'FRIJOL NEGRO',price:40},
  {category:'Produce (Frutas y Verduras)',name:'GALLETAS MARIAS',price:25.002},
  {category:'Produce (Frutas y Verduras)',name:'HOJA DE AGUACATILLO',price:115},
  {category:'Produce (Frutas y Verduras)',name:'JAMAICA',price:136},
  {category:'Produce (Frutas y Verduras)',name:'JAMON VIRGINIA FUD',price:205},
  {category:'Produce (Frutas y Verduras)',name:'JENGIBRE',price:140},
  {category:'Produce (Frutas y Verduras)',name:'JICAMA',price:20},
  {category:'Produce (Frutas y Verduras)',name:'KIWI',price:120},
  {category:'Produce (Frutas y Verduras)',name:'LECHUGA ARUGULA',price:85},
  {category:'Produce (Frutas y Verduras)',name:'LECHUGA OREJONA',price:28},
  {category:'Produce (Frutas y Verduras)',name:'LECHUGA ROMANA',price:24},
  {category:'Produce (Frutas y Verduras)',name:'LECHUGA SANGRIA',price:21},
  {category:'Produce (Frutas y Verduras)',name:'LIMON',price:20},
  {category:'Produce (Frutas y Verduras)',name:'MANGO ATAULFO',price:50},
  {category:'Produce (Frutas y Verduras)',name:'MANGO ATAULFO',price:50},
  {category:'Produce (Frutas y Verduras)',name:'MANTECA DE CERDO',price:108},
  {category:'Produce (Frutas y Verduras)',name:'MANTEQUILLA GLORIA 90 GR',price:31},
  {category:'Produce (Frutas y Verduras)',name:'MANZANA GALA',price:88},
  {category:'Produce (Frutas y Verduras)',name:'MANZANA VERDE',price:74},
  {category:'Produce (Frutas y Verduras)',name:'MARACUYA',price:135},
  {category:'Produce (Frutas y Verduras)',name:'MAYONESA 3.4KG',price:425},
  {category:'Produce (Frutas y Verduras)',name:'MEDIA CREMA LALA 480 ML',price:35},
  {category:'Produce (Frutas y Verduras)',name:'MELON CHINO',price:39},
  {category:'Produce (Frutas y Verduras)',name:'MENTA',price:75},
  {category:'Produce (Frutas y Verduras)',name:'MORRON AMARILLO',price:100},
  {category:'Produce (Frutas y Verduras)',name:'MORRON ROJO',price:104},
  {category:'Produce (Frutas y Verduras)',name:'MORRON VERDE',price:120},
  {category:'Produce (Frutas y Verduras)',name:'NARANJA DULCE',price:30},
  {category:'Produce (Frutas y Verduras)',name:'PAPA',price:63},
  {category:'Produce (Frutas y Verduras)',name:'PAPAYA MARADOL',price:35},
  {category:'Produce (Frutas y Verduras)',name:'PASITAS',price:95},
  {category:'Produce (Frutas y Verduras)',name:'PEPINO VERDE',price:45},
  {category:'Produce (Frutas y Verduras)',name:'PEPITA PELADA',price:141},
  {category:'Produce (Frutas y Verduras)',name:'PEREJIL LISO',price:60},
  {category:'Produce (Frutas y Verduras)',name:'PILONCILLO',price:38},
  {category:'Produce (Frutas y Verduras)',name:'PIMIENTA MOLIDA NEGRA',price:305},
  {category:'Produce (Frutas y Verduras)',name:'PIÑA',price:50},
  {category:'Produce (Frutas y Verduras)',name:'PLATANO TABASCO',price:29},
  {category:'Produce (Frutas y Verduras)',name:'QUESO MANCHEGO',price:285},
  {category:'Produce (Frutas y Verduras)',name:'QUESO OAXACA',price:160},
  {category:'Produce (Frutas y Verduras)',name:'RABANO CAMBRAY',price:56},
  {category:'Produce (Frutas y Verduras)',name:'ROMERO FRESCO',price:130},
  {category:'Produce (Frutas y Verduras)',name:'SANDIA',price:15},
  {category:'Produce (Frutas y Verduras)',name:'TOMATE GUAJE',price:31},
  {category:'Produce (Frutas y Verduras)',name:'TOMATE VERDE',price:25},
  {category:'Produce (Frutas y Verduras)',name:'TOMILLO',price:175},
  {category:'Produce (Frutas y Verduras)',name:'TORONJA',price:24},
  {category:'Produce (Frutas y Verduras)',name:'VINAGRE BLANCO LT',price:20},
  {category:'Produce (Frutas y Verduras)',name:'ZANAHORIA',price:20},
];

let menuProteinPrices=[];
let menuRecipeCosts=[];
let menuProteinAssign={};
let menuIngredientCatalog=[];
let menuCatalogFilter='';

function menuLoadCostData(){
  try{menuProteinPrices=JSON.parse(localStorage.getItem('amansala_menu_protein_prices')||'null')||DEF_MENU_PROTEIN_PRICES.map(p=>({...p}));}catch{menuProteinPrices=DEF_MENU_PROTEIN_PRICES.map(p=>({...p}));}
  try{menuRecipeCosts=JSON.parse(localStorage.getItem('amansala_menu_recipe_costs')||'null')||DEF_MENU_RECIPE_COSTS.map(r=>({...r}));}catch{menuRecipeCosts=DEF_MENU_RECIPE_COSTS.map(r=>({...r}));}
  try{menuProteinAssign=JSON.parse(localStorage.getItem('amansala_menu_protein_assign')||'null')||JSON.parse(JSON.stringify(DEF_MENU_PROTEIN_ASSIGN));}catch{menuProteinAssign=JSON.parse(JSON.stringify(DEF_MENU_PROTEIN_ASSIGN));}
  try{menuIngredientCatalog=JSON.parse(localStorage.getItem('amansala_menu_ingredient_catalog')||'null')||DEF_MENU_INGREDIENT_CATALOG.map(c=>({...c}));}catch{menuIngredientCatalog=DEF_MENU_INGREDIENT_CATALOG.map(c=>({...c}));}
}
async function menuSyncCostDataFromSupabase(){
  try{
    const{data}=await db.from('app_store').select('key,value').in('key',['menuProteinPrices','menuRecipeCosts','menuProteinAssign','menuIngredientCatalog']);
    (data||[]).forEach(row=>{
      if(row.key==='menuProteinPrices'&&Array.isArray(row.value))menuProteinPrices=row.value;
      if(row.key==='menuRecipeCosts'&&Array.isArray(row.value))menuRecipeCosts=row.value;
      if(row.key==='menuProteinAssign'&&row.value)menuProteinAssign=row.value;
      if(row.key==='menuIngredientCatalog'&&Array.isArray(row.value))menuIngredientCatalog=row.value;
    });
  }catch(e){}
}
function menuSaveProteinPrices(){
  localStorage.setItem('amansala_menu_protein_prices',JSON.stringify(menuProteinPrices));
  (async()=>{try{await db.from('app_store').upsert({key:'menuProteinPrices',value:menuProteinPrices,updated_at:new Date().toISOString()});}catch(e){}})();
}
function menuSaveRecipeCosts(){
  localStorage.setItem('amansala_menu_recipe_costs',JSON.stringify(menuRecipeCosts));
  (async()=>{try{await db.from('app_store').upsert({key:'menuRecipeCosts',value:menuRecipeCosts,updated_at:new Date().toISOString()});}catch(e){}})();
}
function menuSaveProteinAssign(){
  localStorage.setItem('amansala_menu_protein_assign',JSON.stringify(menuProteinAssign));
  (async()=>{try{await db.from('app_store').upsert({key:'menuProteinAssign',value:menuProteinAssign,updated_at:new Date().toISOString()});}catch(e){}})();
}
function menuSaveCatalog(){
  localStorage.setItem('amansala_menu_ingredient_catalog',JSON.stringify(menuIngredientCatalog));
  (async()=>{try{await db.from('app_store').upsert({key:'menuIngredientCatalog',value:menuIngredientCatalog,updated_at:new Date().toISOString()});}catch(e){}})();
}
function menuFilterCatalog(val){
  menuCatalogFilter=val;
  menuRenderCatalogBody();
}
function menuRenderCatalogBody(){
  const body=document.getElementById('menuCatalogBody');if(!body)return;
  const q=menuCatalogFilter.trim().toLowerCase();
  const groups=[];
  menuIngredientCatalog.forEach((item,idx)=>{
    if(q&&!item.name.toLowerCase().includes(q))return;
    let g=groups.find(x=>x.category===item.category);
    if(!g){g={category:item.category,items:[]};groups.push(g);}
    g.items.push({...item,idx});
  });
  if(!groups.length){body.innerHTML='<div style="color:#8a7e74;font-size:12.5px;padding:16px 0;text-align:center">No matches.</div>';return;}
  body.innerHTML=groups.map(g=>`
    <details${q?' open':''} style="margin-bottom:8px;border:1px solid #f0ece4;border-radius:8px;overflow:hidden">
      <summary style="padding:8px 12px;background:#faf7f2;cursor:pointer;font-weight:700;font-size:12px;color:var(--dark)">${menuEsc(g.category)} <span style="color:#8a7e74;font-weight:400">(${g.items.length})</span></summary>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tbody>${g.items.map(it=>`
          <tr style="border-top:1px solid #f5f1eb">
            <td style="padding:5px 12px;color:#3a332c">${menuEsc(it.name)}</td>
            <td style="padding:5px 12px;white-space:nowrap">$<input type="number" step="0.01" value="${it.price==null?'':it.price}" placeholder="—" onchange="menuIngredientCatalog[${it.idx}].price=this.value===''?null:(parseFloat(this.value)||0);menuSaveCatalog()" style="width:80px;border:1px solid var(--border);border-radius:6px;padding:3px 6px;font-family:'Jost',sans-serif;font-size:12px"></td>
          </tr>`).join('')}</tbody>
      </table>
    </details>`).join('');
}

function menuNormalizeDishName(s){return(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/★/g,'').trim();}
function menuFindRecipeCostPerPortion(dishName){
  const norm=menuNormalizeDishName(dishName);
  const found=menuRecipeCosts.find(r=>menuNormalizeDishName(r.name)===norm);
  return found&&found.portions?found.totalCost/found.portions:null;
}
function menuProteinCost(id){
  const p=menuProteinPrices.find(x=>x.id===id);
  if(!p||!p.portionG)return null;
  return p.price*(p.portionG/1000);
}

function menuToggleCostView(){
  const grid=document.getElementById('menuGridWrap');
  const panel=document.getElementById('menuCostPanel');
  const btn=document.getElementById('menuCostBtn');
  if(!grid||!panel)return;
  const showingCosts=panel.style.display==='none'||!panel.style.display;
  grid.style.display=showingCosts?'none':'block';
  panel.style.display=showingCosts?'block':'none';
  if(btn){btn.style.background=showingCosts?'var(--teal,#2d6a6a)':'#f0f9f9';btn.style.color=showingCosts?'#fff':'var(--teal,#2d6a6a)';}
  if(showingCosts){
    menuLoadCostData();
    menuRenderCostPanel();
    menuSyncCostDataFromSupabase().then(()=>menuRenderCostPanel());
  }
}

function menuRenderCostPanel(){
  const panel=document.getElementById('menuCostPanel');if(!panel)return;

  const proteinRows=menuProteinPrices.map((p,i)=>`
    <tr style="border-bottom:1px solid #f0ece4">
      <td style="padding:7px 10px"><input value="${menuEsc(p.name)}" onchange="menuProteinPrices[${i}].name=this.value;menuSaveProteinPrices()" style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-family:'Jost',sans-serif;font-size:12.5px"></td>
      <td style="padding:7px 10px"><select onchange="menuProteinPrices[${i}].unit=this.value;menuSaveProteinPrices();menuRenderCostPanel()" style="border:1px solid var(--border);border-radius:6px;padding:5px 6px;font-family:'Jost',sans-serif;font-size:12.5px"><option value="KG"${p.unit==='KG'?' selected':''}>KG</option><option value="PZA"${p.unit==='PZA'?' selected':''}>PZA</option></select></td>
      <td style="padding:7px 10px;white-space:nowrap">$<input type="number" step="0.01" value="${p.price}" onchange="menuProteinPrices[${i}].price=parseFloat(this.value)||0;menuSaveProteinPrices();menuRenderCostPanel()" style="width:80px;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-family:'Jost',sans-serif;font-size:12.5px"></td>
      <td style="padding:7px 10px">${p.unit==='KG'?`<input type="number" value="${p.portionG||220}" onchange="menuProteinPrices[${i}].portionG=parseInt(this.value)||220;menuSaveProteinPrices();menuRenderCostPanel()" style="width:70px;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-family:'Jost',sans-serif;font-size:12.5px"> g`:'<span style="color:#bbb;font-size:12px">— (per piece)</span>'}</td>
      <td style="padding:7px 10px;font-weight:700;color:var(--teal,#2d6a6a)">${p.unit==='KG'?('$'+menuProteinCost(p.id).toFixed(2)+'/person'):'—'}</td>
      <td style="padding:7px 10px"><button onclick="menuProteinPrices.splice(${i},1);menuSaveProteinPrices();menuRenderCostPanel()" style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:15px" title="Remove">&times;</button></td>
    </tr>`).join('');

  const recipeRows=menuRecipeCosts.map((r,i)=>`
    <tr style="border-bottom:1px solid #f0ece4">
      <td style="padding:7px 10px"><input value="${menuEsc(r.name)}" onchange="menuRecipeCosts[${i}].name=this.value;menuSaveRecipeCosts()" style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-family:'Jost',sans-serif;font-size:12.5px"></td>
      <td style="padding:7px 10px"><input type="number" value="${r.portions}" onchange="menuRecipeCosts[${i}].portions=parseInt(this.value)||1;menuSaveRecipeCosts();menuRenderCostPanel()" style="width:70px;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-family:'Jost',sans-serif;font-size:12.5px"></td>
      <td style="padding:7px 10px;white-space:nowrap">$<input type="number" step="0.01" value="${r.totalCost}" onchange="menuRecipeCosts[${i}].totalCost=parseFloat(this.value)||0;menuSaveRecipeCosts();menuRenderCostPanel()" style="width:90px;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-family:'Jost',sans-serif;font-size:12.5px"></td>
      <td style="padding:7px 10px;font-weight:700;color:var(--teal,#2d6a6a)">$${(r.totalCost/(r.portions||1)).toFixed(2)}/portion</td>
      <td style="padding:7px 10px"><button onclick="menuRecipeCosts.splice(${i},1);menuSaveRecipeCosts();menuRenderCostPanel()" style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:15px" title="Remove">&times;</button></td>
    </tr>`).join('');

  const proteinOptions=(selId)=>`<option value="">— none —</option>`+menuProteinPrices.filter(p=>p.unit==='KG').map(p=>`<option value="${p.id}"${p.id===selId?' selected':''}>${menuEsc(p.name)}</option>`).join('');

  let weeklyTotal=0;
  const dayRows=[1,2,3,4,5,6,7].map(di=>{
    const day=WEEKLY_MENU[di]||{};
    const assign=menuProteinAssign[di]||{};
    const middayCost=assign.midday?menuProteinCost(assign.midday):null;
    const dinnerCost=assign.dinner?menuProteinCost(assign.dinner):null;

    // Every non-protein dish across brunch/snack/dinner that has a matching recipe cost
    const otherDishes=[...(day.brunch||[]).filter(d=>!d.includes('★')&&d!=='Tostada Bar'),...(day.snack||[]),...(day.dinner?.dishes||[])];
    let matchedTotal=0;const matchedList=[];const unmatchedList=[];
    otherDishes.forEach(name=>{
      const c=menuFindRecipeCostPerPortion(name);
      if(c!=null){matchedTotal+=c;matchedList.push(`${name} ($${c.toFixed(2)})`);}
      else unmatchedList.push(name);
    });
    if(day.dinner?.dessert){
      const c=menuFindRecipeCostPerPortion(day.dinner.dessert);
      if(c!=null){matchedTotal+=c;matchedList.push(`${day.dinner.dessert} ($${c.toFixed(2)})`);}
      else unmatchedList.push(day.dinner.dessert);
    }

    const dayTotal=(middayCost||0)+(dinnerCost||0)+matchedTotal;
    weeklyTotal+=dayTotal;

    const middayLabel=((day.lunch||[]).find(d=>d.includes('★'))||day.brunch?.find(d=>d.includes('★'))||'—').replace(' ★','');
    const dinnerLabel=day.dinner?.protein||'—';
    const middayPc=menuProteinColor(middayLabel);
    const dinnerPc=menuProteinColor(dinnerLabel);

    return `<tr style="border-bottom:1px solid #f0ece4;vertical-align:top">
      <td style="padding:9px 10px;font-weight:700;color:var(--dark)">${MENU_DAY_NAMES[di]}</td>
      <td style="padding:9px 10px">
        <div style="display:inline-block;font-size:11.5px;font-weight:700;color:${middayPc.color};background:${middayPc.bg};border:1px solid ${middayPc.border};border-radius:6px;padding:2px 8px;margin-bottom:4px">${menuEsc(middayLabel)}</div>
        <div><select onchange="menuProteinAssign[${di}]=menuProteinAssign[${di}]||{};menuProteinAssign[${di}].midday=this.value;menuSaveProteinAssign();menuRenderCostPanel()" style="border:1px solid var(--border);border-radius:6px;padding:4px 6px;font-family:'Jost',sans-serif;font-size:12px;max-width:170px">${proteinOptions(assign.midday)}</select></div>
        <div style="font-size:12px;font-weight:700;color:var(--teal,#2d6a6a);margin-top:3px">${middayCost!=null?'$'+middayCost.toFixed(2):'—'}</div>
      </td>
      <td style="padding:9px 10px">
        <div style="display:inline-block;font-size:11.5px;font-weight:700;color:${dinnerPc.color};background:${dinnerPc.bg};border:1px solid ${dinnerPc.border};border-radius:6px;padding:2px 8px;margin-bottom:4px">${menuEsc(dinnerLabel)}</div>
        <div><select onchange="menuProteinAssign[${di}]=menuProteinAssign[${di}]||{};menuProteinAssign[${di}].dinner=this.value;menuSaveProteinAssign();menuRenderCostPanel()" style="border:1px solid var(--border);border-radius:6px;padding:4px 6px;font-family:'Jost',sans-serif;font-size:12px;max-width:170px">${proteinOptions(assign.dinner)}</select></div>
        <div style="font-size:12px;font-weight:700;color:var(--teal,#2d6a6a);margin-top:3px">${dinnerCost!=null?'$'+dinnerCost.toFixed(2):'—'}</div>
      </td>
      <td style="padding:9px 10px;font-size:11.5px;color:#5a5048;max-width:220px">
        ${matchedList.length?matchedList.join('<br>'):'<span style="color:#bbb">none matched</span>'}
        ${unmatchedList.length?`<div style="margin-top:4px;color:#c8a468;font-style:italic">no cost yet: ${unmatchedList.map(menuEsc).join(', ')}</div>`:''}
      </td>
      <td style="padding:9px 10px;font-weight:800;color:var(--dark);white-space:nowrap">$${dayTotal.toFixed(2)}</td>
    </tr>`;
  }).join('');

  panel.innerHTML=`
    <div style="max-width:1100px;margin:0 auto">
      <div style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:10px;padding:10px 16px;margin-bottom:18px;font-size:12.5px;color:#92400e;font-weight:600">All prices on this page are in Mexican pesos (MXN), matching your supplier price lists — not USD.</div>

      <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:22px">
        <div style="padding:12px 18px;background:#f8f5f0;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:700;font-size:13.5px;color:var(--dark)">Weekly Menu Cost Estimate — per person (MXN)</span>
          <span style="font-size:12.5px;font-weight:700;color:var(--teal,#2d6a6a)">Week total: $${weeklyTotal.toFixed(2)} MXN</span>
        </div>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead><tr style="background:#faf7f2">
            <th style="padding:8px 10px;text-align:left;color:#5a5048">Day</th>
            <th style="padding:8px 10px;text-align:left;color:#5a5048">Midday Protein</th>
            <th style="padding:8px 10px;text-align:left;color:#5a5048">Dinner Protein</th>
            <th style="padding:8px 10px;text-align:left;color:#5a5048">Other Costed Dishes</th>
            <th style="padding:8px 10px;text-align:left;color:#5a5048">Day Total</th>
          </tr></thead>
          <tbody>${dayRows}</tbody>
        </table></div>
        <div style="padding:10px 18px;font-size:11.5px;color:#8a7e74;background:#faf7f2;border-top:1px solid var(--border)">Protein assignments are best guesses from the dish names — double-check the dropdowns above match what's actually served, especially generic "Pescado" days.</div>
      </div>

      <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:22px">
        <div style="padding:12px 18px;background:#f8f5f0;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:700;font-size:13.5px;color:var(--dark)">Protein Prices (MXN)</span>
          <button onclick="menuProteinPrices.push({id:'p'+Date.now(),name:'New Product',unit:'KG',price:0,portionG:220});menuSaveProteinPrices();menuRenderCostPanel()" style="border:1.5px solid var(--teal,#2d6a6a);background:#fff;color:var(--teal,#2d6a6a);border-radius:7px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif">+ Add Product</button>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead><tr style="background:#faf7f2"><th style="padding:7px 10px;text-align:left;color:#5a5048">Product</th><th style="padding:7px 10px;text-align:left;color:#5a5048">Unit</th><th style="padding:7px 10px;text-align:left;color:#5a5048">Price</th><th style="padding:7px 10px;text-align:left;color:#5a5048">Portion</th><th style="padding:7px 10px;text-align:left;color:#5a5048">Cost/person</th><th></th></tr></thead>
          <tbody>${proteinRows}</tbody>
        </table>
      </div>

      <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <div style="padding:12px 18px;background:#f8f5f0;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:700;font-size:13.5px;color:var(--dark)">Recipe Costs (MXN)</span>
          <button onclick="menuRecipeCosts.push({name:'New Recipe',portions:20,totalCost:0});menuSaveRecipeCosts();menuRenderCostPanel()" style="border:1.5px solid var(--teal,#2d6a6a);background:#fff;color:var(--teal,#2d6a6a);border-radius:7px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif">+ Add Recipe</button>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead><tr style="background:#faf7f2"><th style="padding:7px 10px;text-align:left;color:#5a5048">Recipe</th><th style="padding:7px 10px;text-align:left;color:#5a5048">Portions</th><th style="padding:7px 10px;text-align:left;color:#5a5048">Total Cost</th><th style="padding:7px 10px;text-align:left;color:#5a5048">Cost/portion</th><th></th></tr></thead>
          <tbody>${recipeRows}</tbody>
        </table>
        <div style="padding:10px 18px;font-size:11.5px;color:#8a7e74;background:#faf7f2;border-top:1px solid var(--border)">We'll keep adding recipes here over time — anything not yet costed shows as "no cost yet" below.</div>
      </div>

      <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <div style="padding:12px 18px;background:#f8f5f0;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <span style="font-weight:700;font-size:13.5px;color:var(--dark)">Ingredient Catalog (MXN, reference)</span>
          <input type="text" placeholder="Search ingredients…" oninput="menuFilterCatalog(this.value)" style="padding:5px 10px;border:1px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12px;min-width:220px">
        </div>
        <div id="menuCatalogBody" style="padding:14px 18px;max-height:480px;overflow-y:auto"></div>
        <div style="padding:10px 18px;font-size:11.5px;color:#8a7e74;background:#faf7f2;border-top:1px solid var(--border)">Full supplier price list — a growing reference for costing more recipes over time. Not all of it is used in the menu yet.</div>
      </div>
    </div>`;
  menuRenderCatalogBody();
}

