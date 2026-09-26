// ===== menu-variety.js — Menu Variety Check (Darlene's ask 2026-09-26) =====
// Read-only report on the fixed 7-day rotation in WEEKLY_MENU (modules/menu.js):
// primary protein per brunch/dinner, same-day and back-to-back repeats, chicken
// frequency, weekly balance and similar preparations. It never changes the menu —
// the rotation repeats every week and guests arrive on any day, so the week is
// checked as a loop (Sunday dinner → Monday brunch).
// Classic script, loaded after menu.js; wraps menuRenderWeek so the report
// redraws with the week without touching menu.js itself.

// Explicit tags for dishes whose protein/preparation isn't obvious from the name.
const MENU_VARIETY_TAGS={
  'Poke Bowl':{protein:'salmon',prep:'bowl'},
  'Chicken Teriyaki Poke Bowl':{protein:'chicken',prep:'bowl'},
  'Kebabs Pollo/Tofu':{protein:'chicken',prep:'skewer'},
  'Grilled Lemon Kebabs Pollo':{protein:'chicken',prep:'skewer'},
  'Blackened Tacos':{protein:'whitefish',prep:'tortilla'},
  'Tinga de Pollo':{protein:'chicken',prep:'tortilla'},
  'Estofado de Garbanzos':{protein:'plant',prep:'stew'},
  'Pescado Congelado':{protein:'whitefish',prep:'grilled'},
  'Pescado en Hoja de Platano':{protein:'whitefish',prep:'wrapped'},
  'Bang Bang Chicken':{protein:'chicken',prep:'crispy'},
  'Pollo con Ajo Asado':{protein:'chicken',prep:'roasted'},
  'Salmon con Miel y Ajo':{protein:'salmon',prep:'glazed'},
  'Plant Based Night — Phad Thai':{protein:'plant',prep:'noodles'},
};
const MENU_VARIETY_LABEL={chicken:'Chicken',whitefish:'White fish',salmon:'Salmon',seafood:'Seafood',tofu:'Tofu',plant:'Plant-based',beef:'Beef'};
const MENU_VARIETY_COLOR={chicken:'#b45309',whitefish:'#1d4ed8',salmon:'#be123c',seafood:'#0e7490',tofu:'#15803d',plant:'#15803d',beef:'#991b1b'};
const MENU_VARIETY_DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function _mvClean(s){return (s||'').replace(/★/g,'').trim();}
function _mvProteinOf(text){
  const t=_mvClean(text);if(MENU_VARIETY_TAGS[t])return MENU_VARIETY_TAGS[t].protein;
  const s=t.toLowerCase();
  if(s.includes('plant')||s.includes('vegan'))return 'plant';
  if(s.includes('tofu'))return 'tofu';
  if(s.includes('salmon')||s.includes('salmón'))return 'salmon';
  if(s.includes('pollo')||s.includes('chicken'))return 'chicken';
  if(s.includes('camar')||s.includes('shrimp')||s.includes('pulpo')||s.includes('langosta'))return 'seafood';
  if(s.includes('pescado')||s.includes('fish')||s.includes('robalo')||s.includes('basa'))return 'whitefish';
  if(s.includes('arrachera')||s.includes('beef')||/\bres\b/.test(s))return 'beef';
  return null;
}
function _mvPrepOf(text,cats){
  const t=_mvClean(text);if(MENU_VARIETY_TAGS[t])return MENU_VARIETY_TAGS[t].prep;
  const s=(t+' '+(cats||[]).join(' ')).toLowerCase();
  if(/taco|tostada|tinga|tortilla|quesadilla/.test(s))return 'tortilla';
  if(/kebab|brocheta/.test(s))return 'skewer';
  if(/poke|bowl/.test(s))return 'bowl';
  if(/risotto/.test(s))return 'risotto';
  return 'plated';
}

// One entry per main meal: {day, meal, label, primary, proteins[], prep}
function menuVarietyMeals(){
  const out=[];
  for(let di=1;di<=7;di++){
    const m=WEEKLY_MENU[di]||{};
    // Brunch: the ★ dish is the featured protein, but any other protein dish in
    // the same brunch counts too (Sunday's Chicken Teriyaki Poke Bowl isn't ★).
    const bDishes=(m.brunch||[]).map(_mvClean);
    const star=(m.brunch||[]).find(d=>d.includes('★'));
    const bProt=bDishes.map(d=>({d,p:_mvProteinOf(d)})).filter(x=>x.p);
    const primary=star?_mvProteinOf(star):(bProt[0]?.p||null);
    out.push({day:di,meal:'brunch',label:star?_mvClean(star):(bProt[0]?.d||'—'),primary,dishes:bProt,prep:star?_mvPrepOf(star):'plated'});
    const dn=m.dinner||{};
    const dp=_mvProteinOf(dn.protein);
    out.push({day:di,meal:'dinner',label:_mvClean(dn.protein)||'—',primary:dp,dishes:dp?[{d:_mvClean(dn.protein),p:dp}]:[],prep:_mvPrepOf(dn.protein,dn.dishes)});
  }
  return out;
}

function menuVarietyCheck(){
  const meals=menuVarietyMeals();const issues=[];
  const D=i=>MENU_VARIETY_DAYS[i-1];
  const isSea=p=>p==='whitefish'||p==='salmon'||p==='seafood';
  // Two chicken (or two of the same protein) main dishes inside one meal
  meals.forEach(m=>{
    const counts={};m.dishes.forEach(x=>counts[x.p]=(counts[x.p]||0)+1);
    Object.entries(counts).forEach(([p,n])=>{if(n>1)issues.push({sev:p==='chicken'?'high':'mid',text:`${D(m.day)} ${m.meal}: ${n} ${MENU_VARIETY_LABEL[p]} dishes in the same meal (${m.dishes.filter(x=>x.p===p).map(x=>x.d).join(' + ')})`});});
  });
  // Consecutive meals in order (brunch → dinner → next brunch …, looping)
  for(let i=0;i<meals.length;i++){
    const a=meals[i],b=meals[(i+1)%meals.length];
    if(!a.primary||a.primary!==b.primary)continue;
    const sameDay=a.day===b.day;
    issues.push({sev:a.primary==='chicken'?'high':'mid',text:`${MENU_VARIETY_LABEL[a.primary]} ${sameDay?'at brunch and dinner on '+D(a.day):'twice in a row: '+D(a.day)+' dinner → '+D(b.day)+' brunch'} (${a.label} → ${b.label})`});
  }
  // Chicken on consecutive days
  const chickenDay=d=>meals.some(m=>m.day===d&&m.primary==='chicken');
  const chickenDays=[1,2,3,4,5,6,7].filter(chickenDay);
  const runs=chickenDays.filter(d=>chickenDay(d%7+1));
  if(runs.length)issues.push({sev:'high',text:`Chicken on consecutive days: ${runs.map(d=>D(d)+'→'+D(d%7+1)).join(', ')}`});
  // Same protein at the same meal on consecutive days (e.g. chicken dinner
  // three nights running) — the streak guests actually notice.
  ['brunch','dinner'].forEach(meal=>{
    const seq=[1,2,3,4,5,6,7].map(d=>meals.find(m=>m.day===d&&m.meal===meal).primary);
    for(let d=0;d<7;d++){
      const p=seq[d];if(!p||seq[(d+6)%7]===p)continue; // only report from the start of a streak
      let n=1;while(n<7&&seq[(d+n)%7]===p)n++;
      if(n>=2)issues.push({sev:n>=3?'high':(p==='chicken'?'mid':'low'),text:`${MENU_VARIETY_LABEL[p]} at ${meal} ${n} days in a row (${D(d+1)}–${D((d+n-1)%7+1)})`});
    }
  });
  // Similar preparation on consecutive days (same meal slot)
  ['brunch','dinner'].forEach(meal=>{
    for(let d=1;d<=7;d++){
      const a=meals.find(m=>m.day===d&&m.meal===meal),b=meals.find(m=>m.day===d%7+1&&m.meal===meal);
      if(a.prep!=='plated'&&a.prep===b.prep)issues.push({sev:'low',text:`Similar preparation (${a.prep}) at ${meal} ${D(d)} → ${D(d%7+1)}: ${a.label} → ${b.label}`});
    }
  });
  // Seafood three meals in a row
  for(let i=0;i<meals.length;i++){
    const t=[0,1,2].map(k=>meals[(i+k)%meals.length]);
    if(t.every(m=>isSea(m.primary)))issues.push({sev:'low',text:`Seafood three meals in a row from ${D(t[0].day)} ${t[0].meal}`});
  }
  const counts={};meals.forEach(m=>{if(m.primary)counts[m.primary]=(counts[m.primary]||0)+1;});
  const chicken=counts.chicken||0;
  if(chicken>3)issues.push({sev:'mid',text:`Chicken is the main protein in ${chicken} of 14 meals — more than 3 means some guests get chicken every day`});
  const plant=(counts.plant||0)+(counts.tofu||0);
  if(plant<2)issues.push({sev:'mid',text:`Only ${plant} featured plant-based/tofu meal${plant===1?'':'s'} this week (aim for at least 2)`});
  return {meals,issues,counts,chickenDays:chickenDays.length};
}

function menuVarietyRender(){
  const grid=document.getElementById('menuGrid');if(!grid)return;
  let panel=document.getElementById('menuVarietyPanel');
  if(!panel){panel=document.createElement('div');panel.id='menuVarietyPanel';grid.parentNode.insertBefore(panel,grid);}
  const r=menuVarietyCheck();
  let open=false;try{open=localStorage.getItem('amansala_menu_variety_open')==='1';}catch(e){}
  const high=r.issues.filter(i=>i.sev==='high').length;
  const status=!r.issues.length?{t:'Menu variety looks good',bg:'#f0fdf4',bd:'#86efac',c:'#166534'}
    :high?{t:`Menu Variety Check — ${r.issues.length} issue${r.issues.length===1?'':'s'} (${high} important)`,bg:'#fff7ed',bd:'#fdba74',c:'#9a3412'}
    :{t:`Menu Variety Check — ${r.issues.length} minor issue${r.issues.length===1?'':'s'}`,bg:'#fefce8',bd:'#fde047',c:'#854d0e'};
  const chip=p=>p?`<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11.5px;font-weight:700;color:#fff;background:${MENU_VARIETY_COLOR[p]||'#374151'}">${MENU_VARIETY_LABEL[p]||p}</span>`:'<span style="color:#374151">—</span>';
  // Sunday first, matching the Menu grid's week (menuGetSunday)
  const rows=[7,1,2,3,4,5,6].map(d=>{
    const b=r.meals.find(m=>m.day===d&&m.meal==='brunch'),dn=r.meals.find(m=>m.day===d&&m.meal==='dinner');
    return `<tr><td style="padding:5px 10px;font-weight:700">${MENU_VARIETY_DAYS[d-1]}</td>
      <td style="padding:5px 10px">${chip(b.primary)} <span style="font-size:12px;color:#1f2937">${menuEsc(b.label)}</span></td>
      <td style="padding:5px 10px">${chip(dn.primary)} <span style="font-size:12px;color:#1f2937">${menuEsc(dn.label)}</span></td></tr>`;
  }).join('');
  const sevC={high:'#b91c1c',mid:'#b45309',low:'#374151'},sevL={high:'Important',mid:'Watch',low:'Minor'};
  const issuesHtml=r.issues.length?r.issues.map(i=>`<li style="margin:3px 0;font-size:12.5px;color:#1f2937"><b style="color:${sevC[i.sev]}">${sevL[i.sev]}:</b> ${menuEsc(i.text)}</li>`).join(''):'<li style="font-size:12.5px;color:#166534">No repetition problems found.</li>';
  const totals=Object.entries(r.counts).sort((a,b)=>b[1]-a[1]).map(([p,n])=>`${chip(p)} <b style="font-size:12.5px">${n}</b>`).join('&nbsp;&nbsp; ');
  panel.style.cssText=`margin-bottom:14px;border:1.5px solid ${status.bd};background:${status.bg};border-radius:10px;font-family:'Jost',sans-serif`;
  panel.innerHTML=`<div onclick="menuVarietyToggle()" style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 14px">
      <span style="font-weight:800;font-size:13.5px;color:${status.c}">${status.t}</span>
      <span style="font-size:12.5px;color:#1f2937">· Chicken on ${r.chickenDays} of 7 days</span>
      <span style="margin-left:auto;font-size:12.5px;font-weight:700;color:${status.c}">${open?'Hide ▲':'Details ▼'}</span></div>
    ${open?`<div style="padding:0 14px 12px;display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start">
      <table style="border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;font-size:12.5px">
        <thead><tr style="background:#f5f1eb"><th style="padding:5px 10px;text-align:left">Day</th><th style="padding:5px 10px;text-align:left">Brunch protein</th><th style="padding:5px 10px;text-align:left">Dinner protein</th></tr></thead>
        <tbody>${rows}</tbody></table>
      <div style="flex:1;min-width:280px">
        <div style="font-size:12.5px;font-weight:800;color:#1f2937;margin-bottom:4px">Weekly protein balance</div>
        <div style="margin-bottom:10px;line-height:2">${totals}</div>
        <div style="font-size:12.5px;font-weight:800;color:#1f2937;margin-bottom:2px">What to look at</div>
        <ul style="margin:0;padding-left:18px">${issuesHtml}</ul>
        <div style="font-size:12px;color:#374151;margin-top:8px">Checks the repeating 7-day menu as a loop, since guests arrive on any day. Report only — it doesn't change the menu.</div>
      </div></div>`:''}`;
}
function menuVarietyToggle(){
  try{localStorage.setItem('amansala_menu_variety_open',localStorage.getItem('amansala_menu_variety_open')==='1'?'0':'1');}catch(e){}
  menuVarietyRender();
}
if(typeof menuRenderWeek==='function'){
  const _mvOrigRenderWeek=menuRenderWeek;
  menuRenderWeek=function(){const r=_mvOrigRenderWeek.apply(this,arguments);try{menuVarietyRender();}catch(e){console.warn('[menu-variety]',e);}return r;};
}
