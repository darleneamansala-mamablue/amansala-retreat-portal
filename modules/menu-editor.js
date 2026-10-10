// ===== menu-editor.js — edit the weekly menu inside the portal (no code changes needed) =====
// Loaded as a classic script AFTER menu.js; shares global scope. Standalone: menu.js is not modified.
// How it works: the built-in menu (WEEKLY_MENU in menu.js) is the starting point. Edits are saved to
// Supabase app_store key 'menuOverride' = {days:{1..7}, dishes:{<spanish name>:{name,desc}}, updatedAt, updatedBy,
// history:[...]} and applied on top of WEEKLY_MENU / MENU_EN / MENU_DETAIL every time the portal loads, so the
// Menu tab, printed menus, kitchen sheets and cost panel all show the edited menu. Until something is saved,
// the built-in menu is used unchanged. "Restore built-in menu" deletes the override.

const ME_KEYS={menu1:'menuOverride',menu2:'menuOverride2'};
const ME_LSS={menu1:'amansala_menu_override',menu2:'amansala_menu_override2'};
const ME_DAYS={1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday',7:'Sunday'};
const ME_MEALS=[['lightBreakfast','Fruit, Coffee & Tea'],['brunch','Brunch'],['lunch','Lunch'],['snack','Snack']];
function meTarget(m){return m==='menu2'?MENU2:WEEKLY_MENU;}   // MENU2 comes from menu-variants.js
const ME_BUILTIN={menu1:JSON.parse(JSON.stringify(WEEKLY_MENU)),menu2:JSON.parse(JSON.stringify(MENU2))}; // before any override
const ME_BUILTIN_EN=Object.assign({},MENU_EN);
const ME_BUILTIN_DETAIL=Object.assign({},MENU_DETAIL);
const _meSaved={menu1:null,menu2:null};   // latest saved override per menu (for dictionary rebuilds)
let _meMenu='menu1',_meOv=null,_meDays=null,_meDish=null,_meDay=1,_meDirty=false,_meLoadedAt=null;

function meEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function meClean(s){return String(s||'').replace(' ★','').replace('★ ','').replace('★','').trim();}
function meUser(){try{return (typeof userName!=='undefined'&&userName)||'staff';}catch(e){return 'staff';}}

// ---------- apply saved override onto the live menu data ----------
function meApply(ov,m){
  if(!ov||!ov.days)return;
  _meSaved[m]=ov;
  const t=meTarget(m);
  Object.keys(ov.days).forEach(di=>{t[di]=JSON.parse(JSON.stringify(ov.days[di]));});
  Object.keys(ov.dishes||{}).forEach(es=>{
    const d=ov.dishes[es]||{};
    if(d.name)MENU_EN[es]=d.name;
    if(d.name||d.desc)MENU_DETAIL[es]={name:d.name||menuTrEn(es),desc:d.desc||''};
  });
}
function meReset(m){ // one menu back to its built-in days; dictionaries rebuilt from built-ins + the OTHER menu's edits
  const t=meTarget(m),b=ME_BUILTIN[m];
  Object.keys(b).forEach(di=>{t[di]=JSON.parse(JSON.stringify(b[di]));});
  _meSaved[m]=null;
  Object.keys(MENU_EN).forEach(k=>{if(!(k in ME_BUILTIN_EN))delete MENU_EN[k];});Object.assign(MENU_EN,ME_BUILTIN_EN);
  Object.keys(MENU_DETAIL).forEach(k=>{if(!(k in ME_BUILTIN_DETAIL))delete MENU_DETAIL[k];});Object.assign(MENU_DETAIL,ME_BUILTIN_DETAIL);
  ['menu1','menu2'].forEach(k=>{if(_meSaved[k]){const ov=_meSaved[k];Object.keys(ov.dishes||{}).forEach(es=>{const d=ov.dishes[es]||{};if(d.name)MENU_EN[es]=d.name;if(d.name||d.desc)MENU_DETAIL[es]={name:d.name||menuTrEn(es),desc:d.desc||''};});}});
}
async function meFetch(m){
  const {data,error}=await db.from('app_store').select('value').eq('key',ME_KEYS[m||_meMenu]).maybeSingle();
  if(error)throw error;
  return (data&&data.value&&data.value.days)?data.value:null;
}
async function meLoadAndApply(){
  for(const m of ['menu1','menu2']){
    try{
      const ov=await meFetch(m);
      if(ov){try{localStorage.setItem(ME_LSS[m],JSON.stringify(ov));}catch(e){}meApply(ov,m);}
      else{try{localStorage.removeItem(ME_LSS[m]);}catch(e){}}
    }catch(e){}
  }
  try{if(document.getElementById('menuGrid')&&menuCurrentMonday)menuRenderWeek();}catch(e){}
}
// apply cached copies immediately so the first render already shows edits, then refresh from Supabase
['menu1','menu2'].forEach(m=>{try{const c=JSON.parse(localStorage.getItem(ME_LSS[m])||'null');if(c)meApply(c,m);}catch(e){}});
meLoadAndApply();

// ---------- editor ----------
async function menuEditorRender(){
  const el=document.getElementById('menuEditorContent');if(!el)return;
  el.innerHTML='<div style="padding:40px;text-align:center;color:var(--muted)">Loading…</div>';
  try{_meOv=await meFetch();}catch(e){el.innerHTML='<div style="padding:40px;color:#b91c1c">Could not load: '+meEsc(e.message||e)+'</div>';return;}
  _meLoadedAt=_meOv?_meOv.updatedAt:null;
  // working copy = what the Menu tab shows right now (built-in or saved edits)
  _meDays=JSON.parse(JSON.stringify(meTarget(_meMenu)));
  _meDish={};_meDirty=false;
  meDraw();
}
function meSwitchMenu(m){
  if(_meDirty&&!confirm('You have unsaved changes. Switch menus without saving?'))return meDraw();
  _meMenu=m;menuEditorRender();
}
function meDetail(key){
  if(!_meDish[key]){const d=menuItemDetail(key);_meDish[key]={name:d.name||'',desc:d.desc||''};}
  return _meDish[key];
}
function meDraw(){
  const el=document.getElementById('menuEditorContent');if(!el)return;
  el.innerHTML=`<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
    <div class="panel-toolbar"><h2>Menu Editor</h2>
      <select onchange="meSwitchMenu(this.value)" style="padding:6px 10px;border:1.5px solid var(--teal,#2d6a6a);border-radius:8px;font-family:'Jost',sans-serif;font-size:13px;font-weight:600;color:var(--teal,#2d6a6a);background:#fff;margin-left:12px">${Object.keys(MENU_VARIANTS).map(k=>`<option value="${k}"${k===_meMenu?' selected':''}>${MENU_VARIANTS[k]}</option>`).join('')}</select>
      <div class="toolbar-right">${_meOv?`<span style="font-size:12px;color:#7f8c9a;align-self:center">Last saved ${meEsc(new Date(_meOv.updatedAt).toLocaleString())} by ${meEsc(_meOv.updatedBy||'?')}</span>`:'<span style="font-size:12px;color:#7f8c9a;align-self:center">Showing the original menu (nothing edited yet)</span>'}
        <button class="btn btn-secondary" onclick="meHistory()">History</button>
        <button class="btn btn-secondary" onclick="meRestoreBuiltin()">Restore original menu</button>
        <button class="btn btn-primary" id="meSaveBtn" onclick="meSave()">Save menu</button></div></div>
    <div style="display:flex;gap:6px;padding:10px 20px;background:#fff;border-bottom:1px solid var(--border);flex-wrap:wrap;align-items:center">
      ${Object.keys(ME_DAYS).map(d=>`<button class="btn ${+d===_meDay?'btn-primary':'btn-secondary'}" onclick="meDay(${d})">${ME_DAYS[d]}</button>`).join('')}
      <span id="meDirtyMsg" style="font-size:12px;color:#b45309;margin-left:10px">${_meDirty?'Unsaved changes':''}</span></div>
    <div id="meBody" style="flex:1;overflow-y:auto;padding:20px;background:#f0ece4"></div></div>`;
  meDrawDay();
}
function meDay(d){_meDay=d;meDraw();}
function meMark(){_meDirty=true;const m=document.getElementById('meDirtyMsg');if(m)m.textContent='Unsaved changes';}

const ME_INP="padding:7px 9px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12.5px;box-sizing:border-box;width:100%";
function meRow(list,i,item,withStar){
  // item is the Spanish name as shown on the menu; list = 'lightBreakfast' | ... | 'dinner.dishes'
  const key=meClean(item),det=meDetail(key),star=/★/.test(item);
  return `<div style="display:grid;grid-template-columns:1.3fr 1.1fr 2fr auto;gap:6px;align-items:start;margin-bottom:8px">
    <input value="${meEsc(key)}" oninput="meName('${list}',${i},this.value)" style="${ME_INP}" placeholder="Name on the menu (Spanish)">
    <input value="${meEsc(det.name)}" oninput="meDet('${list}',${i},'name',this.value)" style="${ME_INP}" placeholder="English name">
    <textarea rows="2" oninput="meDet('${list}',${i},'desc',this.value)" style="${ME_INP}" placeholder="Description (printed menu)">${meEsc(det.desc)}</textarea>
    <div style="display:flex;gap:4px;align-items:center;padding-top:3px">
      ${withStar?`<label title="Main dish of the meal (★)" style="font-size:12px;white-space:nowrap"><input type="checkbox" ${star?'checked':''} onchange="meStar('${list}',${i},this.checked)"> ★</label>`:''}
      <button class="btn-icon" onclick="meMove('${list}',${i},-1)">↑</button><button class="btn-icon" onclick="meMove('${list}',${i},1)">↓</button>
      <button class="btn-icon" onclick="meDel('${list}',${i})" style="color:#b91c1c">✕</button></div></div>`;
}
function meGet(path){ // returns the array for a list path on the current day
  const d=_meDays[_meDay];
  if(path==='dinner.dishes'){d.dinner=d.dinner||{dishes:[]};d.dinner.dishes=d.dinner.dishes||[];return d.dinner.dishes;}
  d[path]=d[path]||[];return d[path];
}
function meDrawDay(){
  const body=document.getElementById('meBody');if(!body)return;
  const d=_meDays[_meDay]||{};const din=d.dinner||{};
  const card=(title,inner,note)=>`<div style="background:#fff;border-radius:10px;padding:14px;margin-bottom:14px;max-width:1000px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#2d6a6a;margin-bottom:${note?4:10}px">${title}</div>${note?`<div style="font-size:11.5px;color:#7f8c9a;margin-bottom:10px">${note}</div>`:''}${inner}</div>`;
  const listCard=(key,title,note)=>card(title,(d[key]||[]).map((it,i)=>meRow(key,i,it,key==='brunch'||key==='lunch')).join('')+`<button class="btn btn-secondary" onclick="meAdd('${key}')">+ Add dish</button>`,note);
  body.innerHTML=
    listCard('lightBreakfast','Fruit, Coffee & Tea')+
    listCard('brunch','Brunch','Brunch and Lunch are separate lists. If you change a shared dish, change it in both.')+
    listCard('lunch','Lunch')+
    listCard('snack','Snack')+
    card('Dinner',
      `<div style="margin-bottom:10px"><label style="font-size:11px;color:#7f8c9a">Dinner main (★ line) — name on the menu / English name</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><input value="${meEsc(din.protein||'')}" oninput="meDinner('protein',this.value)" style="${ME_INP}"><input value="${meEsc(din.protein?meDetail(meClean(din.protein)).name:'')}" oninput="meDinnerEn('protein',this.value)" style="${ME_INP}" placeholder="English name"></div></div>`+
      (din.dishes||[]).map((it,i)=>meRow('dinner.dishes',i,it,false)).join('')+
      `<button class="btn btn-secondary" onclick="meAdd('dinner.dishes')" style="margin-bottom:10px">+ Add dish (soup, salad, side…)</button>
       <div><label style="font-size:11px;color:#7f8c9a">Dessert — name on the menu (separate two with ·) / English names</label><input value="${meEsc(din.dessert||'')}" oninput="meDinner('dessert',this.value)" style="${ME_INP};margin-bottom:6px">${(din.dessert||'').split('·').map(x=>x.trim()).filter(Boolean).map(x=>`<input value="${meEsc(meDetail(x).name)}" oninput="meDinnerEn('${meEsc(x).replace(/'/g,"\\'")}',this.value)" style="${ME_INP};margin-bottom:4px" placeholder="English name for ${meEsc(x)}">`).join('')}</div>`);
}
function meName(list,i,val){
  const arr=meGet(list),old=meClean(arr[i]),star=/★/.test(arr[i]);
  const nw=val.trim();
  if(old&&nw!==old&&_meDish[old]&&!_meDish[nw])_meDish[nw]=_meDish[old];
  arr[i]=nw+(star?' ★':'');meMark();
}
function meDet(list,i,f,val){const k=meClean(meGet(list)[i]);meDetail(k)[f]=val;meMark();}
function meStar(list,i,on){const a=meGet(list);a[i]=meClean(a[i])+(on?' ★':'');meMark();}
function meAdd(list){meGet(list).push('');meMark();meDrawDay();}
function meDel(list,i){const a=meGet(list);if(!confirm('Remove "'+meClean(a[i])+'" from '+ME_DAYS[_meDay]+'?'))return;a.splice(i,1);meMark();meDrawDay();}
function meMove(list,i,dir){const a=meGet(list),j=i+dir;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];meMark();meDrawDay();}
function meDinnerEn(k,v){const key=k==='protein'?meClean(_meDays[_meDay].dinner.protein):k;meDetail(key).name=v;meMark();}
function meDinner(f,v){_meDays[_meDay].dinner=_meDays[_meDay].dinner||{dishes:[]};_meDays[_meDay].dinner[f]=v;meMark();}

// ---------- save / history / restore ----------
async function meSave(){
  const btn=document.getElementById('meSaveBtn');
  // drop blank dish rows
  Object.values(_meDays).forEach(d=>{['lightBreakfast','brunch','lunch','snack'].forEach(k=>{if(d[k])d[k]=d[k].filter(x=>meClean(x));});if(d.dinner&&d.dinner.dishes)d.dinner.dishes=d.dinner.dishes.filter(x=>meClean(x));});
  const names=new Set();
  Object.values(_meDays).forEach(d=>{['lightBreakfast','brunch','lunch','snack'].forEach(k=>(d[k]||[]).forEach(x=>names.add(meClean(x))));(d.dinner&&d.dinner.dishes||[]).forEach(x=>names.add(meClean(x)));if(d.dinner&&d.dinner.dessert)d.dinner.dessert.split('·').forEach(x=>names.add(x.trim()));});
  const dishes={};
  Object.values(_meDays).forEach(d=>{if(d.dinner&&d.dinner.protein)names.add(meClean(d.dinner.protein));});
  names.forEach(n=>{if(n&&_meDish[n]&&(_meDish[n].name||_meDish[n].desc))dishes[n]={name:_meDish[n].name||'',desc:_meDish[n].desc||''};});
  if(btn){btn.disabled=true;btn.textContent='Saving…';}
  try{
    const fresh=await meFetch();
    if(fresh&&fresh.updatedAt&&fresh.updatedAt!==_meLoadedAt&&!confirm('Someone else saved the menu since you opened it. Saving now will replace their changes. Save anyway?')){
      if(btn){btn.disabled=false;btn.textContent='Save menu';}return;}
    const hist=(fresh&&fresh.history)||[];
    if(fresh)hist.unshift({savedAt:fresh.updatedAt,savedBy:fresh.updatedBy,days:fresh.days,dishes:fresh.dishes});
    const ov={days:_meDays,dishes,updatedAt:new Date().toISOString(),updatedBy:meUser(),history:hist.slice(0,10)};
    const {error}=await db.from('app_store').upsert({key:ME_KEYS[_meMenu],value:ov,updated_at:ov.updatedAt});
    if(error)throw error;
    _meOv=ov;_meLoadedAt=ov.updatedAt;_meDirty=false;
    try{localStorage.setItem(ME_LSS[_meMenu],JSON.stringify(ov));}catch(e){}
    meApply(ov,_meMenu);
    showToast(MENU_VARIANTS[_meMenu]+' saved ✓ — it now shows everywhere in the portal');
    meDraw();
  }catch(e){showToast('Save failed: '+(e.message||e));if(btn){btn.disabled=false;btn.textContent='Save menu';}}
}
async function meRestoreBuiltin(){
  if(!confirm('Restore the ORIGINAL '+MENU_VARIANTS[_meMenu]+'? All your menu edits will be removed (the last 10 saves stay in History).'))return;
  try{
    const fresh=await meFetch();
    if(fresh){ // keep it recoverable: store as history inside a backup key before deleting
      await db.from('app_store').upsert({key:ME_KEYS[_meMenu]+'Backup',value:fresh,updated_at:new Date().toISOString()});
      await db.from('app_store').delete().eq('key',ME_KEYS[_meMenu]);
    }
    try{localStorage.removeItem(ME_LSS[_meMenu]);}catch(e){}
    meReset(_meMenu);showToast('Original menu restored ✓');menuEditorRender();
    if(document.getElementById('menuGrid')&&menuCurrentMonday)menuRenderWeek();
  }catch(e){showToast('Could not restore: '+(e.message||e));}
}
function meHistory(){
  const h=(_meOv&&_meOv.history)||[];
  if(!h.length){showToast('No earlier saves yet');return;}
  let ov=document.getElementById('meHistOv');if(ov)ov.remove();
  ov=document.createElement('div');ov.id='meHistOv';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML=`<div style="background:#fff;border-radius:12px;width:min(480px,100%);max-height:80vh;overflow-y:auto;padding:18px"><div style="display:flex;align-items:center;margin-bottom:10px"><b style="flex:1">Earlier saves</b><button class="btn btn-secondary" onclick="document.getElementById('meHistOv').remove()">Close</button></div>
    ${h.map((v,i)=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #e5e7eb"><div style="flex:1;font-size:12.5px">${meEsc(new Date(v.savedAt).toLocaleString())}<div style="font-size:11px;color:#7f8c9a">by ${meEsc(v.savedBy||'?')}</div></div><button class="btn btn-secondary" onclick="meLoadHistory(${i})">Load</button></div>`).join('')}</div>`;
  document.body.appendChild(ov);
}
function meLoadHistory(i){
  const v=_meOv.history[i];if(!v)return;
  if(!confirm('Load this earlier version into the editor? Nothing changes until you press Save menu.'))return;
  _meDays=JSON.parse(JSON.stringify(v.days));_meDish=JSON.parse(JSON.stringify(v.dishes||{}));
  document.getElementById('meHistOv').remove();_meDirty=true;meDraw();
}
