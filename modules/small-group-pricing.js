// ===== small-group-pricing.js — price tours/ceremonies for a group smaller than the minimum =====
// Loaded as a classic script AFTER tour-settings.js and global-rate.js; shares global scope.
// Rule: a tour is priced per person assuming a MINIMUM group (default 6). If fewer guests come, the tour still has
// to bring in the same total, so each guest pays  price × minimum ÷ guests  (e.g. $95 × 6 ÷ 4 = $142.50).
// - "👥 Small-group prices" button in the Manage Tours window opens a table for every tour with the price for a
//   group of N (2–5, default 4). Prices can be edited; optional rounding (exact / up to $1 / up to $5).
// - Settings + edited prices are saved in Supabase app_store key 'smallGroupPricing' (no database change).
// - In a retreat's Edit package box, "Use small-group prices" fills that retreat's package prices for N guests
//   (it only fills the boxes — nothing changes until you press Save package).

const SGP_KEY='smallGroupPricing';
// individual services / restaurant meals: not a "minimum group" tour — excluded unless you tick them
const SGP_DEFAULT_EXCLUDE=['ao8','ao11','ao13'];   // Massage, Offsite Dinner Onsite, Gitano Dinner
let _sgp={minPax:6,size:4,round:'exact',exclude:null,overrides:{}};   // overrides: {'4':{ao1:142.5}}
let _sgpLoaded=false;

function sgpEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}
function sgpMoney(n){return '$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function sgpExcluded(id){return (_sgp.exclude||SGP_DEFAULT_EXCLUDE).includes(id);}
function sgpTours(){return (typeof ADD_ONS!=='undefined'?ADD_ONS:[]).filter(a=>(a.price||0)>0).slice().sort((a,b)=>a.name.localeCompare(b.name));}
function sgpRound(v,mode){
  if(mode==='up1')return Math.ceil(v-1e-9);
  if(mode==='up5')return Math.ceil(v/5-1e-9)*5;
  return Math.round(v*100)/100;
}
// price per person for a group of n (n < minPax); n >= minPax is just the regular price
function sgpPrice(ao,n){
  const ov=(_sgp.overrides[String(n)]||{})[ao.id];
  if(ov!=null&&ov!=='')return Number(ov);
  if(n>=_sgp.minPax)return Number(ao.price);
  return sgpRound(Number(ao.price)*_sgp.minPax/n,_sgp.round);
}

async function sgpLoad(){
  try{
    const {data}=await db.from('app_store').select('value').eq('key',SGP_KEY).maybeSingle();
    if(data&&data.value&&typeof data.value==='object')_sgp={..._sgp,...data.value,overrides:data.value.overrides||{}};
  }catch(e){}
  _sgpLoaded=true;
}
async function sgpSave(){
  try{ // merge into the freshest stored copy so two people's edits don't erase each other
    const {data}=await db.from('app_store').select('value').eq('key',SGP_KEY).maybeSingle();
    const cur=(data&&data.value&&typeof data.value==='object')?data.value:{};
    const out={...cur,minPax:_sgp.minPax,size:_sgp.size,round:_sgp.round,exclude:_sgp.exclude||SGP_DEFAULT_EXCLUDE,
      overrides:{...(cur.overrides||{}),..._sgp.overrides}};
    const {error}=await db.from('app_store').upsert({key:SGP_KEY,value:out,updated_at:new Date().toISOString()});
    if(error)throw error;
    _sgp={..._sgp,...out};return true;
  }catch(e){showToast('Could not save: '+(e.message||e));return false;}
}

// ---------- window ----------
async function sgpOpen(){
  if(!_sgpLoaded)await sgpLoad();
  if(!_sgp.exclude)_sgp.exclude=SGP_DEFAULT_EXCLUDE.slice();
  let ov=document.getElementById('sgpOv');if(ov)ov.remove();
  ov=document.createElement('div');ov.id='sgpOv';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML='<div id="sgpBox" style="background:#fff;border-radius:12px;width:min(780px,100%);max-height:90vh;overflow-y:auto;padding:20px"></div>';
  document.body.appendChild(ov);
  sgpDraw();
}
function sgpDraw(){
  const box=document.getElementById('sgpBox');if(!box)return;
  const n=_sgp.size,min=_sgp.minPax;
  const inp="padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;box-sizing:border-box";
  const rows=sgpTours().map(a=>{
    const on=!sgpExcluded(a.id),p=sgpPrice(a,n),ovv=(_sgp.overrides[String(n)]||{})[a.id];
    return `<tr style="${on?'':'opacity:.5'}">
      <td style="padding:6px 8px;border-bottom:1px solid var(--border)"><label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" ${on?'checked':''} onchange="sgpToggle('${a.id}',this.checked)" style="accent-color:#0e9494"> ${sgpEsc(a.name)}</label></td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--border);text-align:right;font-size:13px">${sgpMoney(a.price)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--border);text-align:right;font-size:12px;color:#7f8c9a">${sgpMoney(a.price*min)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--border);text-align:right"><input type="number" min="0" step="0.01" value="${on?+p.toFixed(2):''}" ${on?'':'disabled'} onchange="sgpEdit('${a.id}',this.value)" style="${inp};width:100px;text-align:right;font-weight:700;${ovv!=null&&ovv!==''?'border-color:#0e9494':''}"></td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--border);text-align:right;font-size:12px;color:#7f8c9a">${on?sgpMoney(p*n):''}</td></tr>`;
  }).join('');
  box.innerHTML=`<div style="display:flex;align-items:center;margin-bottom:6px"><b style="font-size:17px;flex:1">Small-group tour prices</b><button onclick="document.getElementById('sgpOv').remove()" style="border:none;background:none;font-size:22px;cursor:pointer">&times;</button></div>
    <div style="font-size:12.5px;color:#5a5048;line-height:1.6;margin-bottom:12px">A tour is priced for a group of <b>${min}</b> or more. With fewer guests it must still bring in the same total, so each guest pays <b>price × ${min} ÷ guests</b>. Example: $95 × ${min} ÷ ${n} = <b>${sgpMoney(95*min/n)}</b> each.</div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <label style="font-size:12.5px">Guests in the group <select onchange="sgpSetSize(this.value)" style="${inp};margin-left:4px">${[2,3,4,5].map(x=>`<option value="${x}"${x===n?' selected':''}>${x}</option>`).join('')}</select></label>
      <label style="font-size:12.5px">Minimum group <input type="number" min="2" max="20" value="${min}" onchange="sgpSetMin(this.value)" style="${inp};width:64px;margin-left:4px"></label>
      <label style="font-size:12.5px">Rounding <select onchange="sgpSetRound(this.value)" style="${inp};margin-left:4px"><option value="exact"${_sgp.round==='exact'?' selected':''}>Exact (to the cent)</option><option value="up1"${_sgp.round==='up1'?' selected':''}>Up to the next $1</option><option value="up5"${_sgp.round==='up5'?' selected':''}>Up to the next $5</option></select></label></div>
    <table style="width:100%;border-collapse:collapse"><thead><tr style="font-size:11px;color:#7f8c9a;text-transform:uppercase;letter-spacing:.4px">
      <th style="text-align:left;padding:6px 8px;border-bottom:2px solid var(--border)">Tour</th><th style="text-align:right;padding:6px 8px;border-bottom:2px solid var(--border)">Regular (${min}+) per person</th><th style="text-align:right;padding:6px 8px;border-bottom:2px solid var(--border)">Needs to bring in</th><th style="text-align:right;padding:6px 8px;border-bottom:2px solid var(--border)">Price per person for ${n}</th><th style="text-align:right;padding:6px 8px;border-bottom:2px solid var(--border)">Group total</th></tr></thead><tbody>${rows}</tbody></table>
    <div style="font-size:11.5px;color:#8a7e74;margin-top:8px">Massage and dinners are left out because they aren't minimum-group tours. Tick them if you want them included. Type in a price box to set your own price for that tour (it turns teal).</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px">
      <button onclick="sgpResetSize()" style="padding:8px 14px;border:1.5px solid #d1d5db;background:#fff;border-radius:8px;cursor:pointer">Reset my edited prices for ${n} guests</button>
      <button onclick="sgpCopy()" style="padding:8px 14px;border:1.5px solid #0e9494;color:#0e9494;background:#fff;border-radius:8px;cursor:pointer;font-weight:600">Copy list</button>
      <button onclick="sgpSaveClick()" style="padding:8px 18px;background:#0e9494;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">Save</button></div>`;
}
function sgpToggle(id,on){const ex=new Set(_sgp.exclude||SGP_DEFAULT_EXCLUDE);if(on)ex.delete(id);else ex.add(id);_sgp.exclude=[...ex];sgpDraw();}
function sgpEdit(id,v){
  const k=String(_sgp.size);_sgp.overrides[k]=_sgp.overrides[k]||{};
  const n=parseFloat(v);
  if(isNaN(n)||n<0)delete _sgp.overrides[k][id];else _sgp.overrides[k][id]=n;
  sgpDraw();
}
function sgpSetSize(v){_sgp.size=parseInt(v,10)||4;sgpDraw();}
function sgpSetMin(v){const n=parseInt(v,10);if(n>=2&&n<=20){_sgp.minPax=n;sgpDraw();}}
function sgpSetRound(v){_sgp.round=v;sgpDraw();}
function sgpResetSize(){delete _sgp.overrides[String(_sgp.size)];sgpDraw();}
async function sgpSaveClick(){if(await sgpSave())showToast('Small-group prices saved ✓');}
function sgpCopy(){
  const n=_sgp.size;
  const lines=['Tour\tRegular ('+_sgp.minPax+'+)\tFor '+n+' guests (per person)'].concat(sgpTours().filter(a=>!sgpExcluded(a.id)).map(a=>`${a.name}\t${sgpMoney(a.price)}\t${sgpMoney(sgpPrice(a,n))}`));
  try{navigator.clipboard.writeText(lines.join('\n')).then(()=>showToast('List copied ✓'));}catch(e){showToast('Could not copy');}
}

// ---------- button inside Manage Tours ----------
(function(){
  const orig=openTourSettings;
  openTourSettings=function(){
    const r=orig.apply(this,arguments);
    try{
      const hdr=document.querySelector('#tourSettingsModal .modal-hdr');
      if(hdr&&!document.getElementById('sgpBtn')){
        const b=document.createElement('button');b.id='sgpBtn';b.textContent='👥 Small-group prices';
        b.style.cssText="margin-left:auto;margin-right:12px;padding:6px 12px;font-size:12.5px;font-weight:600;font-family:'Jost',sans-serif;color:#0e9494;background:#fff;border:1.5px solid #0e9494;border-radius:8px;cursor:pointer";
        b.onclick=sgpOpen;
        hdr.insertBefore(b,hdr.querySelector('.modal-x'));
      }
    }catch(e){}
    return r;
  };
})();

// ---------- in a retreat's Edit package box: fill that retreat's package prices for a small group ----------
(function(){
  if(typeof grOpenPackageEditor!=='function')return;
  const orig=grOpenPackageEditor;
  grOpenPackageEditor=function(){
    const r=orig.apply(this,arguments);
    try{sgpDecorateEditor();}catch(e){}
    return r;
  };
})();
async function sgpDecorateEditor(){
  const ov=document.getElementById('grPkgOv');if(!ov)return;
  if(!_sgpLoaded)await sgpLoad();
  const stdWrap=ov.querySelector('[data-gr-std]')?.parentElement;
  if(!stdWrap||document.getElementById('sgpFillBar'))return;
  const bar=document.createElement('div');bar.id='sgpFillBar';
  bar.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px dashed #d6cdb8;font-size:12.5px';
  const guests=(typeof regSelBk!=='undefined'&&regSelBk&&regSelBk.pax)||'';
  bar.innerHTML=`<span>Small group?</span> <select id="sgpFillN" style="padding:5px 8px;border:1.5px solid #d6cdb8;border-radius:7px">${[2,3,4,5].map(x=>`<option value="${x}"${x===_sgp.size?' selected':''}>${x} guests</option>`).join('')}</select>
    <button type="button" onclick="sgpFillEditor()" style="padding:5px 12px;border:1.5px solid #0e9494;color:#0e9494;background:#fff;border-radius:7px;font-weight:600;cursor:pointer">Use small-group prices</button>
    <button type="button" onclick="sgpFillEditor(true)" style="padding:5px 12px;border:1.5px solid #d1d5db;background:#fff;border-radius:7px;cursor:pointer">Back to regular prices</button>
    <span style="color:#8a7e74;font-size:11.5px">Fills the boxes only — press Save package to apply.</span>`;
  stdWrap.appendChild(bar);
}
function sgpFillEditor(regular){
  const n=parseInt(document.getElementById('sgpFillN')?.value,10)||4;
  // remembered on the window so Save package also stores "prices based on all N guests joining" (0 = regular prices)
  const _ov=document.getElementById('grPkgOv');if(_ov)_ov.dataset.sgpGuests=regular?'0':String(n);
  let filled=0;
  document.querySelectorAll('#grPkgOv [data-gr-std]').forEach(r=>{
    const ao=(typeof ADD_ONS!=='undefined'?ADD_ONS:[]).find(a=>a.id===r.dataset.grStd);if(!ao)return;
    const inp=r.querySelector('[data-f="stdprice"]');if(!inp)return;
    if(regular){inp.value=ao.price;filled++;return;}
    if(sgpExcluded(ao.id)||!(ao.price>0))return;     // leave massage/dinners/free items at their price
    inp.value=+sgpPrice(ao,n).toFixed(2);filled++;
  });
  showToast(filled?(regular?'Regular prices filled in — press Save package':`Prices for ${n} guests filled in — press Save package`):'No tours to fill in for this retreat');
}
sgpLoad();
