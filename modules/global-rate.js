// ===== global-rate.js — all-inclusive PACKAGE pricing for a single booking =====
// Loaded as a classic script AFTER contracts.js / room-blocking.js / teacher-portal.js; shares global scope.
// Turned on per booking (admin: Package Prices panel -> "Special Package Pricing"); stored at
// bk.packageCustomPrices.__cfg__.globalRate = {on,label,nights,includes,rates:{<roomTypeId>:{solo,shared}}}
// (no new database column). Bookings without it are completely unaffected. When on for a booking:
//   - each room is charged the package total for its room type (solo = private room, shared = per person) for the
//     whole stay. Internally that total is split over the package's nights and set as the room's custom nightly rate,
//     so every screen (admin, teacher portal, payments, reports) agrees.
//   - room tax = 0, tip = 0, package/add-on charges = 0 — the package price already includes them
//   - the room list shows the flat package price + a line "Package inclusive of: Cacao Ceremony, Grande Cenote, tip & tax"
//     (wording editable per booking) instead of rate + tax + tip
// The signed contract's wording is not affected (tip/tax shown there stay as signed).

let _grSuspend=0;
// Hard lock: package pricing exists ONLY for Melissa Masella's retreat (Oct 25–30, 2026). Every other booking
// ignores the setting entirely and shows no editor for it. To allow another booking, add its id here.
const GR_ALLOWED_BOOKING_IDS=['id_1784817790113_60kq'];
function grAllowed(bk){return !!bk&&GR_ALLOWED_BOOKING_IDS.includes(bk.id);}
// Starting prices (Darlene's 5-night package, WhatsApp 2026-06-17); editable per booking in the panel
const GR_DEFAULT_RATES={
  rt1:{solo:3620,shared:2373}, rt2:{solo:3040,shared:2054}, rt3:{solo:2547,shared:1793}, rt4:{solo:2286,shared:1677},
  rt5:{solo:1996,shared:''},   rt6:{solo:'',shared:2228},   rt7:{solo:'',shared:1880},   rt8:{solo:'',shared:1619}
};
const GR_DEFAULT_INCLUDES='Cacao Ceremony, Grande Cenote, tip & tax';

function bkGlobalRate(bk){
  if(!grAllowed(bk))return null;
  const g=bk&&bk.packageCustomPrices&&bk.packageCustomPrices.__cfg__&&bk.packageCustomPrices.__cfg__.globalRate;
  if(!(g&&g.on&&g.rates))return null;
  const nights=Number(g.nights)>0?Number(g.nights):(typeof getNights==='function'?getNights(bk):5)||5;
  return {label:g.label||'Package',nights,includes:g.includes||'',rates:g.rates};
}
(function(){
  const gt=getTip,gx=getBkTaxRate,cp=calcPkgCost,ca=calcCustomAoCost;
  getTip=function(bk){return(!_grSuspend&&bkGlobalRate(bk))?0:gt(bk);};
  getBkTaxRate=function(bk){return(!_grSuspend&&bkGlobalRate(bk))?0:gx(bk);};
  // all-in: selected packages and custom add-ons are already inside the package price
  calcPkgCost=function(bk,gc){return(!_grSuspend&&bkGlobalRate(bk))?0:cp.apply(this,arguments);};
  calcCustomAoCost=function(bk){return(!_grSuspend&&bkGlobalRate(bk))?0:ca.apply(this,arguments);};
  // contract text keeps the terms as signed
  ['generateContractHTML','generateContractText'].forEach(n=>{
    const f=window[n];if(typeof f!=='function')return;
    window[n]=function(){_grSuspend++;try{return f.apply(this,arguments);}finally{_grSuspend--;}};
  });
})();

// ---------- package price for a room type ----------
const _grNum=v=>(v===''||v==null||isNaN(Number(v)))?null:Number(v);
// total package price per person for this room type and occupancy (null = not priced)
function grPackageTotal(bk,rtId,gc){
  const g=bkGlobalRate(bk);if(!g)return null;
  const r=g.rates[rtId];if(!r)return null;
  const solo=_grNum(r.solo),shared=_grNum(r.shared);
  if(gc>=2)return shared;
  return solo!=null?solo:shared;     // rooms with only a per-person price use it for a single guest too
}
// nightly rate to store on the room so all screens add up to the package price
function grRateFor(bk,rtId,gc){
  const g=bkGlobalRate(bk),t=grPackageTotal(bk,rtId,gc);
  return (g&&t>0)?+(t/g.nights).toFixed(4):null;
}
// the room modal asks: use the package rate when this booking has one, else whatever was typed
function grResolveRate(bk,rtId,gc,typed){
  const r=grRateFor(bk,rtId,gc);
  return r!=null?r:typed;
}
function grPriceTag(bk,rt){
  const g=bkGlobalRate(bk);if(!g)return null;
  const f=n=>'$'+Number(n).toLocaleString('en-US');
  const r=g.rates[rt.id]||{},solo=_grNum(r.solo),shared=_grNum(r.shared);
  if(solo==null&&shared==null)return 'Package price not set';
  const parts=[];
  if(solo!=null)parts.push(`${shared!=null?'Private':'Per person'}: <b>${f(solo)}</b>`);
  if(shared!=null)parts.push(solo!=null?`Shared: <b>${f(shared)} per person</b>`:`<b>${f(shared)} per person</b>`);
  return parts.join(' &nbsp;·&nbsp; ');
}
function grIncludesText(g){return (g.includes||'').split('\n').map(x=>x.trim()).filter(Boolean).join(', ');}
function grBannerHtml(bk){
  const g=bkGlobalRate(bk);if(!g)return '';
  const txt=grIncludesText(g);if(!txt)return '';
  return `<div style="margin:0 0 14px;padding:12px 18px;background:#f0f9f6;border:1.5px solid #b7ddd2;border-radius:12px;font-size:14px;color:#1f4f4f"><b>Package inclusive of:</b> ${txt.replace(/</g,'&lt;')}</div>`;
}

// ---------- admin panel (rendered inside the Package Prices editor) ----------
function globalRatePanelHtml(bk){
  if(!grAllowed(bk))return '';
  const raw=(bk&&bk.packageCustomPrices&&bk.packageCustomPrices.__cfg__&&bk.packageCustomPrices.__cfg__.globalRate)||{};
  const rates=raw.rates||GR_DEFAULT_RATES;
  const inp="padding:6px 8px;border:1.5px solid #d6cdb8;border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;box-sizing:border-box";
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const rts=(AppData.roomTypes||[]).filter(rt=>!(typeof VIRTUAL_GROUP_RT_IDS!=='undefined'&&VIRTUAL_GROUP_RT_IDS.has(rt.id))&&rt.id&&!/^bd/.test(rt.id));
  const rows=rts.map(rt=>{const r=rates[rt.id]||{};return `<tr><td style="padding:3px 8px 3px 0;font-size:12.5px">${esc(rt.name)}</td>
    <td><input type="number" min="0" step="0.01" data-gr-rt="${rt.id}" data-gr-f="solo" value="${esc(r.solo)}" placeholder="—" style="${inp};width:110px"></td>
    <td><input type="number" min="0" step="0.01" data-gr-rt="${rt.id}" data-gr-f="shared" value="${esc(r.shared)}" placeholder="—" style="${inp};width:110px"></td></tr>`;}).join('');
  return `<div id="grPanel" style="margin-bottom:14px;padding:12px 14px;background:#fff;border:1.5px solid #e8dfd4;border-radius:9px">
    <div style="font-size:11.5px;font-weight:700;color:#5a5048;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Special Package Pricing <span style="font-weight:400;text-transform:none;letter-spacing:0">(this retreat only)</span></div>
    <label style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;margin-bottom:10px;cursor:pointer"><input type="checkbox" id="grOn" ${raw.on?'checked':''} style="width:15px;height:15px;accent-color:#0e9494"> Show an all-inclusive package price instead of room + tax + tip</label>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
      <div><div style="font-size:11px;color:#8a7e74">Package name</div><input id="grLabel" value="${esc(raw.label||'5-Night Package')}" style="${inp};width:190px"></div>
      <div><div style="font-size:11px;color:#8a7e74">Nights in the package</div><input id="grNights" type="number" min="1" value="${esc(raw.nights||getNights(bk)||5)}" style="${inp};width:90px"></div></div>
    <table style="border-collapse:collapse;margin-bottom:10px"><thead><tr style="font-size:11px;color:#8a7e74;text-align:left"><th style="padding-right:8px">Room type</th><th>Private room — total $</th><th>Shared — $ per person</th></tr></thead><tbody>${rows}</tbody></table>
    <div style="font-size:11px;color:#8a7e74;margin-bottom:3px">Shown to guests as "Package inclusive of: …"</div>
    <input id="grIncludes" style="${inp};width:100%;max-width:440px" value="${esc(raw.includes!=null?grIncludesText({includes:raw.includes}):GR_DEFAULT_INCLUDES)}">
    <div style="margin-top:10px"><button onclick="grSave()" style="padding:8px 16px;background:#0e9494;color:#fff;border:none;border-radius:8px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer">Save &amp; apply to all rooms</button></div>
    <div style="margin-top:7px;font-size:11.5px;color:#8a7e74">Prices are the full total for the stay. Saving sets them on every room in this retreat and removes tax, tip and add-on charges from those rooms' prices. Untick and save to go back to normal pricing. You can come back here any time to change the prices.</div></div>`;
}
function grSave(){
  const bk=regSelBk;if(!bk)return;
  const on=document.getElementById('grOn').checked;
  const rates={};
  document.querySelectorAll('#grPanel input[data-gr-rt]').forEach(i=>{
    const id=i.dataset.grRt;rates[id]=rates[id]||{solo:'',shared:''};
    rates[id][i.dataset.grF]=i.value.trim()===''?'':Number(i.value);
  });
  const cfgIn={on,label:(document.getElementById('grLabel').value||'').trim()||'Package',
    nights:Number(document.getElementById('grNights').value)||getNights(bk)||5,
    includes:document.getElementById('grIncludes').value.trim(),rates};
  const regs=AppData.regs.filter(r=>r.bookingId===bk.id);
  bk.packageCustomPrices=bk.packageCustomPrices||{};
  const was=bkGlobalRate(bk);
  if(on){
    if(!Object.values(rates).some(r=>_grNum(r.solo)>0||_grNum(r.shared)>0)){alert('Enter at least one package price.');return;}
    if(!confirm(`Apply the all-inclusive package prices to ${regs.length} room registration${regs.length===1?'':'s'} for ${bk.leaderName||bk.retreatName}, with no tax, tip or add-on charges on top?\n\nThis changes what these guests owe.`))return;
    bk.packageCustomPrices.__cfg__={...(bk.packageCustomPrices.__cfg__||{}),globalRate:cfgIn};
    let unpriced=0;
    regs.forEach(r=>{
      const gc=Math.max(1,(r.guests||[]).filter(g=>g.name).length);
      const rate=grRateFor(bk,r.roomTypeId,gc);
      if(rate!=null)r.customRateOverride=rate;else unpriced++;
    });
    saveAll();try{regRender();}catch(e){}
    showToast(unpriced?`Package applied ✓ — ${unpriced} room${unpriced===1?'':'s'} have no package price (room type left blank)`:'Package pricing applied ✓');
  }else{
    if(!confirm('Turn off the special package pricing? Rooms go back to their regular rates, and tax and tip are charged again.'))return;
    if(was)regs.forEach(r=>{const gc=Math.max(1,(r.guests||[]).filter(g=>g.name).length);if(r.customRateOverride!=null&&Math.abs(Number(r.customRateOverride)-(grRateFor(bk,r.roomTypeId,gc)||-1))<0.01)r.customRateOverride=null;});
    bk.packageCustomPrices.__cfg__={...(bk.packageCustomPrices.__cfg__||{}),globalRate:{...cfgIn,on:false}};
    saveAll();try{regRender();}catch(e){}
    showToast('Package pricing turned off');
  }
}

// ---------- price box tweaks (admin room modal) ----------
function grAdjustPriceBox(bk,gc,bd){
  grPkgTaxSelect(bk);
  const g=bkGlobalRate(bk);
  const taxRow=document.getElementById('pbc-tax-lbl')?.parentElement,tipRow=document.getElementById('pbc-dip-lbl')?.parentElement;
  const baseRow=document.getElementById('pbc-base')?.parentElement;
  if(taxRow)taxRow.style.display=g?'none':'';
  if(tipRow)tipRow.style.display=g?'none':'';
  if(baseRow&&baseRow.firstElementChild)baseRow.firstElementChild.textContent=g?`${g.label} (inclusive)`:'Room subtotal';
  if(!g)return;
  const s=document.getElementById('pbSeasonLbl');if(s){const t=grIncludesText(g);s.textContent=t?`Package inclusive of ${t}`:`${g.label} — inclusive`;}
  const t=document.getElementById('pbc-type');if(t)t.textContent=`${gc} guest${gc>1?'s':''} · ${bd.nights} night${bd.nights!==1?'s':''}`;
  const r=document.getElementById('pbc-rate');if(r)r.textContent='';
}

// ---------- edit a booking's packages in place (any booking, admin only) ----------
// Price, nights and tax can be changed on each existing custom add-on row, without deleting and re-adding it.
function grCustomAoTaxSelect(bk,i,c){
  if(!bk||!grIsAdminView())return '';
  const cur=String(Number(c.taxRate||0));
  const opt=(v,l)=>`<option value="${v}"${cur===v?' selected':''}>${l}</option>`;
  const box="padding:5px 6px;border:1.5px solid #c8bfb5;border-radius:7px;font-family:'Jost',sans-serif;font-size:12px";
  return `<span style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:#8a7e74;white-space:nowrap">
    $<input type="number" min="0" step="0.01" value="${Number(c.price||0)}" onchange="grSetCustomAo(${i},'price',this.value)" title="Price per night per guest" style="${box};width:74px"> ×
    <input type="number" min="1" step="1" value="${Number(c.nights||1)}" onchange="grSetCustomAo(${i},'nights',this.value)" title="Nights" style="${box};width:46px;text-align:center"> nt
    <select onchange="grSetCustomAo(${i},'taxRate',this.value)" title="Tax on this package" style="${box}">${opt('0','No tax')}${opt('0.13','13% tax')}${opt('0.16','16% tax')}</select></span>`;
}
async function grSetCustomAo(i,field,v){
  const bk=regSelBk;if(!bk||!grIsAdminView())return;
  const list=(bk.packageCustomPrices&&bk.packageCustomPrices.__custom__)||[];
  if(!list[i])return;
  const n=parseFloat(v);
  if(field==='price'){if(isNaN(n)||n<0){showToast('Enter a price');return;}list[i].price=n;}
  else if(field==='nights'){if(isNaN(n)||n<1){showToast('Nights must be 1 or more');return;}list[i].nights=Math.round(n);}
  else if(field==='taxRate'){list[i].taxRate=n||0;}
  else return;
  saveAll();regRender();
  pkgTogglePriceEditor();
  try{await db.from('bookings').update({package_custom_prices:bk.packageCustomPrices}).eq('id',bk.id);}catch(e){}
  showToast('Package updated ✓');
}

// ---------- "Edit package" button + editor: works in the admin view AND when admin previews the teacher portal ----------
function grIsAdminView(){
  try{return !IS_TEACHER_MODE||sessionStorage.getItem('ama_admin_viewing')==='1'||!!localStorage.getItem('ama_admin_device');}catch(e){return false;}
}
function grInjectEditBtn(){
  const bar=document.getElementById('pkgBar');
  const hdr=bar&&bar.querySelector('.pkg-bar-hdr');
  const bk=(typeof regSelBk!=='undefined')?regSelBk:null;
  const old=document.getElementById('grEditPkgBtn');
  const want=!!(hdr&&bk&&grIsAdminView()&&bar.style.display!=='none');
  if(old&&(!want||!hdr.contains(old)))old.remove();
  if(!want||hdr.querySelector('#grEditPkgBtn'))return;
  const b=document.createElement('button');b.id='grEditPkgBtn';b.textContent='✎ Edit package';
  b.style.cssText="padding:3px 10px;font-size:11px;font-weight:700;color:#0e9494;background:#fff;border:1.5px solid #0e9494;border-radius:7px;cursor:pointer;font-family:'Jost',sans-serif";
  b.onclick=e=>{e.stopPropagation();grOpenPackageEditor();};
  hdr.appendChild(b);
}
(function(){
  const rr=regRender;
  regRender=function(){const r=rr.apply(this,arguments);try{grInjectEditBtn();}catch(e){}return r;};
})();
function grOpenPackageEditor(){
  const bk=regSelBk;if(!bk||!grIsAdminView())return;
  bk.packageCustomPrices=bk.packageCustomPrices||{};
  const list=(bk.packageCustomPrices.__custom__=bk.packageCustomPrices.__custom__||[]);
  let ov=document.getElementById('grPkgOv');if(ov)ov.remove();
  ov=document.createElement('div');ov.id='grPkgOv';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const esc=x=>String(x==null?'':x).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const box="padding:7px 9px;border:1.5px solid #c8bfb5;border-radius:7px;font-family:'Jost',sans-serif;font-size:13px;box-sizing:border-box";
  const selStd=[...(typeof ADD_ONS!=='undefined'?ADD_ONS:[]),...(bk.extraPackages||[])].filter(a=>(bk.packages||[]).includes(a.id)&&a.price>=0);
  const stdPrices=bk.packageCustomPrices||{};
  const stdHtml=selStd.length?`<div style="margin-bottom:16px;padding:12px;background:#f9f5f0;border-radius:9px"><div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Packages selected for this retreat</div>${selStd.map(a=>`<div data-gr-std="${a.id}" data-gr-default="${a.price}" style="display:grid;grid-template-columns:1.6fr 130px;gap:8px;align-items:center;margin-bottom:6px"><span style="font-size:13px">${esc(a.name)} <span style="color:#a89e94;font-size:11px">(list $${a.price})</span></span><input data-f="stdprice" type="number" min="0" step="0.01" value="${esc(stdPrices[a.id]!=null?stdPrices[a.id]:a.price)}" style="${box}" placeholder="$ per guest"></div>`).join('')}</div>`:'';
  const row=(c,i)=>`<div data-gr-row="${i}" style="display:grid;grid-template-columns:1.6fr 130px 110px auto;gap:8px;align-items:center;margin-bottom:8px">
      <input data-f="name" value="${esc(c.name)}" style="${box}" placeholder="Package name">
      <input data-f="price" type="number" min="0" step="0.01" value="${c.price===''?'':esc(+(Number(c.price||0)*Number(c.nights||1)).toFixed(2))}" style="${box}" placeholder="$ per guest">
      <select data-f="taxRate" style="${box}">${[['0','No tax'],['0.13','13% tax'],['0.16','16% tax']].map(([v,l])=>`<option value="${v}"${String(Number(c.taxRate||0))===v?' selected':''}>${l}</option>`).join('')}</select>
      <button onclick="this.closest('[data-gr-row]').remove()" style="background:none;border:none;color:#dc2626;font-size:18px;cursor:pointer" title="Remove">×</button></div>`;
  ov.innerHTML=`<div style="background:#fff;border-radius:12px;width:min(720px,100%);max-height:88vh;overflow-y:auto;padding:20px">
    <div style="font-size:16px;font-weight:700;margin-bottom:4px">Package — ${esc(bk.leaderName||bk.retreatName)}</div>
    ${stdHtml}
    <div style="font-size:12px;color:#7f8c9a;margin-bottom:14px">Custom packages — type the package price per guest, then choose No tax, 13% or 16%. Applies to this retreat only.</div>
    <div style="display:grid;grid-template-columns:1.6fr 130px 110px auto;gap:8px;font-size:11px;color:#7f8c9a;margin-bottom:4px"><span>Package name</span><span>Price per guest ($)</span><span>Tax</span><span></span></div>
    <div id="grPkgRows">${list.map(row).join('')||'<div style="font-size:12px;color:#a89e94;margin-bottom:8px">No package yet — add one below.</div>'}</div>
    <button onclick="grPkgAddRow()" style="padding:6px 12px;border:1.5px solid #0e9494;color:#0e9494;background:#fff;border-radius:7px;font-weight:600;cursor:pointer;margin:4px 0 16px">+ Add package</button>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button onclick="document.getElementById('grPkgOv').remove()" style="padding:8px 16px;border:1.5px solid #d1d5db;background:#fff;border-radius:8px;cursor:pointer">Cancel</button>
      <button onclick="grPkgSave()" style="padding:8px 18px;background:#0e9494;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">Save package</button></div></div>`;
  document.body.appendChild(ov);
  ov._rowHtml=row({name:'',price:'',nights:1,taxRate:0},'new');
}
function grPkgAddRow(){
  const ov=document.getElementById('grPkgOv'),wrap=document.getElementById('grPkgRows');if(!ov||!wrap)return;
  if(!wrap.querySelector('[data-gr-row]'))wrap.innerHTML='';
  wrap.insertAdjacentHTML('beforeend',ov._rowHtml);
}
async function grPkgSave(){
  const bk=regSelBk;if(!bk||!grIsAdminView())return;
  const out=[];
  for(const r of document.querySelectorAll('#grPkgRows [data-gr-row]')){
    const g=f=>r.querySelector(`[data-f="${f}"]`).value;
    const name=g('name').trim(),price=parseFloat(g('price')),nights=1;
    if(!name&&isNaN(price))continue;
    if(!name||isNaN(price)||price<0){showToast('Each package needs a name and a price');return;}
    out.push({name,price,nights,taxRate:parseFloat(g('taxRate'))||0});
  }
  bk.packageCustomPrices=bk.packageCustomPrices||{};
  // standard packages selected on the retreat: per-package price override + one tax rate for them
  document.querySelectorAll('#grPkgOv [data-gr-std]').forEach(r=>{
    const id=r.dataset.grStd,def=parseFloat(r.dataset.grDefault),v=parseFloat(r.querySelector('[data-f="stdprice"]').value);
    if(isNaN(v)||v<0||v===def)delete bk.packageCustomPrices[id];else bk.packageCustomPrices[id]=v;
  });
  if(out.length)bk.packageCustomPrices.__custom__=out;else delete bk.packageCustomPrices.__custom__;
  { const rs=[...new Set(out.map(o=>o.taxRate))]; if(rs.length===1)bk.packageCustomPrices.__cfg__={...(bk.packageCustomPrices.__cfg__||{}),pkgTaxRate:rs[0]}; }
  saveAll();
  document.getElementById('grPkgOv')?.remove();
  try{regRender();}catch(e){}
  try{await db.from('bookings').update({package_custom_prices:bk.packageCustomPrices}).eq('id',bk.id);}catch(e){}
  showToast('Package saved ✓');
}

// keep the button on screen whenever the add-on bar is rebuilt (several actions redraw it without calling regRender)
(function(){
  let t=null;
  const kick=()=>{clearTimeout(t);t=setTimeout(()=>{try{grInjectEditBtn();}catch(e){}},60);};
  const start=()=>{if(document.body)new MutationObserver(kick).observe(document.body,{childList:true,subtree:true});};
  if(document.body)start();else document.addEventListener('DOMContentLoaded',start);
})();

// ---------- package tax choice next to the Package line in the room pricing box ----------
// No tax / 13% / 16%. Tax on packages is a retreat-wide setting (same one as Package Prices -> Tax Rate),
// so choosing it here applies to every room's package in this retreat.
function grPkgTaxSelect(bk){
  const row=document.getElementById('pbc-pkg-row');
  let sel=document.getElementById('pbc-pkg-tax');
  const show=!!(row&&row.style.display!=='none'&&bk&&grIsAdminView());
  if(!show){if(sel)sel.style.display='none';return;}
  if(!sel){
    sel=document.createElement('select');sel.id='pbc-pkg-tax';
    sel.title='Tax on the package only — room tax is not changed. Applies to every room in this retreat.';
    sel.style.cssText="padding:4px 6px;border:1.5px solid #d6cdb8;border-radius:7px;font-family:'Jost',sans-serif;font-size:12px";
    sel.innerHTML='<option value="0">Package: no tax</option><option value="0.13">Package: 13% tax</option><option value="0.16">Package: 16% tax</option>';
    sel.onchange=()=>grSetPkgTax(sel.value);
    const box=row.querySelector('input')?.parentElement||row.lastElementChild;
    box.appendChild(sel);
  }
  sel.style.display='';
  const cur=String(getBkPkgTaxRate(bk));
  if(document.activeElement!==sel)sel.value=['0','0.13','0.16'].includes(cur)?cur:'0.16';
}
function grSetPkgTax(v){
  const bk=regSelBk;if(!bk||!grIsAdminView())return;
  const tr=parseFloat(v);if(isNaN(tr))return;
  bk.packageCustomPrices=bk.packageCustomPrices||{};
  bk.packageCustomPrices.__cfg__={...(bk.packageCustomPrices.__cfg__||{}),pkgTaxRate:tr};   // package tax only
  (bk.packageCustomPrices.__custom__||[]).forEach(c=>{c.taxRate=tr;});
  saveAll();
  try{db.from('bookings').update({package_custom_prices:bk.packageCustomPrices}).eq('id',bk.id).then(()=>{},()=>{});}catch(e){}
  try{gUpdatePrice();}catch(e){}
  try{regRender();}catch(e){}
  showToast(tr===0?'Package: no tax (room tax unchanged)':`Package: ${Math.round(tr*100)}% tax (room tax unchanged)`);
}

// ---------- tax on the PACKAGE, separate from room tax ----------
// bk.packageCustomPrices.__cfg__.pkgTaxRate (0 | 0.13 | 0.16). When a booking has it, the package is taxed at that rate
// on every screen while room tax stays 16%. Bookings without it keep the old behavior (package taxed at the
// retreat Tax Rate). Fixes: a per-room package price override was taxed at the retreat rate even when the
// package itself was set to No tax.
function getBkPkgTaxRate(bk){
  const r=bk&&bk.packageCustomPrices&&bk.packageCustomPrices.__cfg__&&bk.packageCustomPrices.__cfg__.pkgTaxRate;
  if(r===0||r===0.13||r===0.16)return(!_grSuspend&&bkGlobalRate(bk))?0:r;
  return getBkTaxRate(bk);
}
