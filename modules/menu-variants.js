// ===== menu-variants.js — Menu 1 and Menu Más Carne (Menu 2), chosen per week =====
// Loaded as a classic script AFTER menu.js and BEFORE menu-editor.js; shares global scope.
// menu.js reads every day's menu through menuDataFor(dateStr) / menuDataForIdx(dayIndex) (defined here), so the
// Menu tab / printed menus / kitchen sheets / cost panel all follow the week's choice. The choice is stored in
// Supabase app_store key 'menuWeekVariants' as {'<week Sunday YYYY-MM-DD>':'menu2'}; weeks with no entry use Menu 1.
// Menu 2's wording is edited in the Menu Editor tab (saved under app_store 'menuOverride2'); MENU2 below is only
// its starting point: Menu 1 with the two protein-heavy changes Darlene gave on 2026-10-09.

const MENU_VARIANTS={menu1:'Menu 1',menu2:'Menu 2 (Más Carne)'};
const MV_KEY='menuWeekVariants';
let menuWeekVariants={};
try{menuWeekVariants=JSON.parse(localStorage.getItem('amansala_menu_week_variants')||'{}')||{};}catch(e){}

Object.assign(MENU_EN,{
  'Hamburguesa':'Hamburger',
  'Papas Fritas':'French Fries',
  'Phad Thai con Pollo':'Chicken Pad Thai',
  'Slow Cooked Ribs':'Slow-Cooked Ribs',
  'Rosemary Sweet Potato Mash':'Rosemary Sweet Potato Mash'
});
Object.assign(MENU_DETAIL,{
  'Hamburguesa':{name:'Hamburger',desc:''},
  'Slow Cooked Ribs':{name:'Slow-Cooked Ribs',desc:''},
  'Rosemary Sweet Potato Mash':{name:'Rosemary Sweet Potato Mash',desc:''},
  'Papas Fritas':{name:'French Fries',desc:''},
  'Phad Thai con Pollo':{name:'Chicken Pad Thai',desc:((MENU_DETAIL['Plant Based Night — Phad Thai']||{}).desc||'').replace(/tofu/i,'chicken')}
});

const MENU2=JSON.parse(JSON.stringify(WEEKLY_MENU));
// Monday dinner replaced with Hamburger · French Fries · Salad (soup and dessert kept — change in Menu Editor)
MENU2[1].dinner={protein:'Hamburguesa',dishes:['Sopa de Zanahoria','Papas Fritas','Ensalada Verde'],dessert:'Flan de Cafe'};
// Saturday dinner replaced with slow-cooked ribs (soup stays Mushroom as in Menu 1)
MENU2[6].dinner={protein:'Slow Cooked Ribs',dishes:['Sopa de Champiñones','Rosemary Sweet Potato Mash','Ensalada Verde'],dessert:'Coconut Ice Cream'};
// Sunday: chicken added to the Phad Thai
MENU2[7].dinner={protein:'Phad Thai con Pollo',dishes:['Thai Slaw'],dessert:'Coconut Ice Cream'};
// Costing for Menu 2's changed dinners (ids from the protein catalog in menu.js)
const MV_MENU2_ASSIGN={1:'molida',6:'',7:'pollo'}; // 6: ribs aren't in the protein catalog yet, so no (wrong) chicken cost

function menuVariantForWeek(sundayISO){return menuWeekVariants[sundayISO]==='menu2'?'menu2':'menu1';}
function menuDataFor(dateStr){
  const src=menuVariantForWeek(menuGetSunday(dateStr))==='menu2'?MENU2:WEEKLY_MENU;
  return src[menuDayIndex(dateStr)]||{};
}
// Cost panel works on the week being viewed
function menuDataForIdx(di){
  return ((menuVariantForWeek(menuCurrentMonday)==='menu2')?MENU2:WEEKLY_MENU)[di]||{};
}
function menuAssignForIdx(di){
  const base=menuProteinAssign[di]||{};
  if(menuVariantForWeek(menuCurrentMonday)==='menu2'&&(di in MV_MENU2_ASSIGN))return Object.assign({},base,{dinner:MV_MENU2_ASSIGN[di]});
  return base;
}

// ---------- shared storage ----------
async function mvLoad(){
  try{
    const {data}=await db.from('app_store').select('value').eq('key',MV_KEY).maybeSingle();
    if(data&&data.value&&typeof data.value==='object'){
      menuWeekVariants=data.value;
      try{localStorage.setItem('amansala_menu_week_variants',JSON.stringify(menuWeekVariants));}catch(e){}
      if(document.getElementById('menuGrid')&&menuCurrentMonday)menuRenderWeek();
    }
  }catch(e){}
}
async function mvSetWeek(v){
  const wk=menuCurrentMonday;if(!wk)return;
  try{ // merge into the freshest copy so another device's week choices aren't wiped
    const {data}=await db.from('app_store').select('value').eq('key',MV_KEY).maybeSingle();
    const cur=(data&&data.value&&typeof data.value==='object')?data.value:{};
    if(v==='menu2')cur[wk]='menu2';else delete cur[wk];
    menuWeekVariants=cur;
    try{localStorage.setItem('amansala_menu_week_variants',JSON.stringify(cur));}catch(e){}
    const {error}=await db.from('app_store').upsert({key:MV_KEY,value:cur,updated_at:new Date().toISOString()});
    if(error)throw error;
    showToast((MENU_VARIANTS[v]||v)+' set for this week ✓');
  }catch(e){showToast('Could not save menu choice: '+(e.message||e));}
  menuRenderWeek();
}

// ---------- selector in the Menu toolbar ----------
function mvInjectSelector(){
  const lbl=document.getElementById('menuWeekLabel');if(!lbl||!lbl.parentNode)return;
  let sel=document.getElementById('menuVariantSel');
  if(!sel){
    sel=document.createElement('select');sel.id='menuVariantSel';
    sel.title='Which menu is served this week';
    sel.style.cssText="padding:4px 8px;font-size:12px;font-weight:600;font-family:'Jost',sans-serif;border:1.5px solid var(--teal,#2d6a6a);border-radius:7px;background:#fff;color:var(--teal,#2d6a6a);cursor:pointer";
    sel.innerHTML=Object.keys(MENU_VARIANTS).map(k=>`<option value="${k}">${MENU_VARIANTS[k]}</option>`).join('');
    sel.onchange=()=>mvSetWeek(sel.value);
    lbl.parentNode.appendChild(sel);
  }
  sel.value=menuVariantForWeek(menuCurrentMonday);
}
(function(){
  const orig=menuRenderWeek;
  menuRenderWeek=function(){const r=orig.apply(this,arguments);try{mvInjectSelector();}catch(e){}return r;};
})();
mvLoad();
