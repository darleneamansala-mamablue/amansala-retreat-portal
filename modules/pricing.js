// ===== pricing.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== ESTIMATED QUOTE =====
let estQuoteOpen=false;
function toggleEstQuote(){
  estQuoteOpen=!estQuoteOpen;
  const panel=document.getElementById('estQuotePanel');
  if(estQuoteOpen){renderEstQuote();panel.style.display='block';}
  else panel.style.display='none';
  document.getElementById('estQuoteBtn').style.background=estQuoteOpen?'#fef3c7':'';
  document.getElementById('estQuoteBtn').style.borderColor=estQuoteOpen?'#fcd34d':'';
}

function renderEstQuote(){
  if(!regSelBk)return;
  const nights=getNights(regSelBk);
  const blockedSet=new Set(regSelBk.blockedRooms||[]);
  const estPax=regSelBk.pax||10;
  const tipPer=getTip(regSelBk);
  const pkgTaxRate=getBkTaxRate(regSelBk);
  const roomTaxRate=pkgTaxRate===0?0:0.16;

  // Add-ons — use calcPkgCost for correct bundle/custom pricing
  const addOnItems=calcPkgItems(regSelBk);
  const addOnPerPerson=+(calcPkgCost(regSelBk,1)).toFixed(2);
  const addOnGroupTotal=+(addOnPerPerson*estPax).toFixed(2);

  // Room breakdown: actual registered guests where available, solo estimate for vacant
  const bkRegs=getRegsForBk(regSelBk.id);
  const regByRoom={};
  bkRegs.forEach(r=>{if(blockedSet.has(r.room))regByRoom[r.room]=r;});

  let roomRows=[];
  let totalRoomBase=0,totalTip=0,totalRoomTax=0,totalPkgTax=0,totalPkg=0;

  Array.from(blockedSet).forEach(room=>{
    const rt=AppData.roomTypes.find(t=>(t.rooms||[]).includes(room));
    if(!rt)return;
    const reg=regByRoom[room];
    const gc=reg?new Set((reg.guests||[]).filter(g=>g.name).map(g=>g.name.trim())).size:0;
    if(!gc)return;
    const _eCI=reg.checkIn||regSelBk.startDate;
    const _eNightsRaw=(reg.checkIn&&reg.checkOut)?Math.max(1,Math.round((pd(reg.checkOut)-pd(reg.checkIn))/DAY_MS)):nights;
    // custom_nights_override/custom_tip_nights_override/custom_tip_rate_override: an admin-set
    // billed-nights count for this registration, independent of the raw check-in/check-out span.
    const _eNights=reg.customNightsOverride!=null?Number(reg.customNightsOverride):_eNightsRaw;
    const _eTipNights=reg.customTipNightsOverride!=null?Number(reg.customTipNightsOverride):_eNights;
    const _eTipRate=reg.customTipRateOverride!=null?Number(reg.customTipRateOverride):tipPer;
    const _isBd1Extra=rt.id==='bd1'&&reg.customRateOverride==null&&(gc>=2||_getSharedBeds(room).some(s=>blockedSet.has(s)&&(regByRoom[s]?.guests||[]).filter(g=>g.name).length>=2));
    const rate=reg.customRateOverride!=null?reg.customRateOverride:(_isBd1Extra?(isLowSeason(_eCI,_eNights)?BD1_EXTRA_RATE_LOW:BD1_EXTRA_RATE_HIGH):getRoomRate(rt,gc,_eCI,_eNights));
    const base=+(rate*gc*_eNights).toFixed(2);
    const pkgCost=reg.customPkgPrice!=null?reg.customPkgPrice:(addOnItems.length?+(calcPkgCost(regSelBk,gc)).toFixed(2):0);
    const roomTax=+(base*roomTaxRate).toFixed(2);
    const pTax=+(pkgCost*pkgTaxRate).toFixed(2);
    const tax=+(roomTax+pTax).toFixed(2);
    const tip=+(_eTipRate*gc*_eTipNights).toFixed(2);
    const total=+(base+pkgCost+tax+tip).toFixed(2);
    const guestNames=[...new Set((reg.guests||[]).filter(g=>g.name).map(g=>g.name.trim()))].join(' & ');
    roomRows.push({room,rt,gc,rate,base,pkgCost,roomTax,pTax,tax,tip,total,guestNames,isTeacher:reg?.isTeacherRoom,regNights:_eNights});
    totalRoomBase+=base;totalTip+=tip;totalRoomTax+=roomTax;totalPkgTax+=pTax;totalPkg+=pkgCost;
  });

  const totalTax=+(totalRoomTax+totalPkgTax).toFixed(2);
  const grandEst=+(totalRoomBase+totalPkg+totalTax+totalTip).toFixed(2);
  document.getElementById('estQuoteLbl').textContent=`${estPax} est. guests · ${nights} nights · ${blockedSet.size} rooms · ${roomRows.length} registered`;

  // Left card: per-room itemized breakdown
  let roomHtml=`<div class="eq-card" style="display:flex;flex-direction:column;max-height:520px"><div class="eq-card-title">Room Breakdown</div><div style="overflow-y:auto;flex:1;padding-right:2px">`;
  if(roomRows.length===0){roomHtml+=`<div style="font-size:12.5px;color:#b45309;font-style:italic">No rooms blocked yet.</div>`;}
  roomRows.forEach(r=>{
    const dot=`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${r.rt.color};margin-right:5px;flex-shrink:0"></span>`;
    const teacherTag=r.isTeacher?` <span style="font-size:10px;background:#92400e;color:#fff;padding:1px 5px;border-radius:4px">Teacher</span>`:'';
    roomHtml+=`<div style="border:1px solid #fde68a;border-radius:8px;padding:10px 12px;margin-bottom:8px;background:#fffdf5">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="display:flex;align-items:center;font-weight:700;font-size:13px">${dot}Room ${r.room}${teacherTag}</span>
        <span style="font-weight:800;font-size:14px;color:var(--teal)">${fmt$(r.total)}</span>
      </div>
      <div style="font-size:11.5px;color:#6b7280;margin-bottom:5px">${r.guestNames} · ${r.gc} guest${r.gc>1?'s':''}</div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:2px 12px;font-size:11.5px;color:#78350f">
        <span>Rate (${fmt$(r.rate)}/nt × ${r.gc} × ${r.regNights}nt)</span><span>${fmt$(r.base)}</span>
        ${r.pkgCost>0?`<span>Add-ons</span><span>${fmt$(r.pkgCost)}</span>`:''}
        <span>ISH hab. (${roomTaxRate===0?'0%':'16%'})</span><span>${fmt$(r.roomTax)}</span>
        ${r.pTax>0?`<span>IVA extras (${Math.round(pkgTaxRate*100)}%)</span><span>${fmt$(r.pTax)}</span>`:''}
        <span>Gratuity ($${tipPer}×${r.gc}×${r.regNights}nt)</span><span>${fmt$(r.tip)}</span>
      </div>
    </div>`;
  });
  roomHtml+=`</div><div class="eq-total"><span>Total Room Revenue</span><span>${fmt$(grandEst)}</span></div></div>`;

  // Right card: add-ons + grand total
  const eqDiscountAmt=+(regSelBk.eqDiscountAmt||0);
  const grandEstAfterDisc=+(grandEst-eqDiscountAmt).toFixed(2);
  const totalPaid=(regSelBk.payments||[]).reduce((s,p)=>s+(p.amount||0),0);
  const estBalance=+(grandEstAfterDisc-totalPaid).toFixed(2);

  let addHtml=`<div style="display:flex;flex-direction:column;gap:14px">`;
  addHtml+=`<div class="eq-card"><div class="eq-card-title">Add-On Packages · ${estPax} guests</div>`;
  if(addOnItems.length===0){
    addHtml+=`<div style="font-size:12px;color:#b45309;font-style:italic">No add-ons selected in Retreat Builder.</div>`;
  } else {
    addOnItems.forEach(a=>{
      addHtml+=`<div class="eq-addon-row"><span>${a.name}</span><span>$${a.price}/person</span></div>`;
    });
    addHtml+=`<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0;color:#78350f;border-top:1px solid #fde68a;margin-top:6px;padding-top:6px"><span>Per person</span><span><b>${fmt$(addOnPerPerson)}</b></span></div>`;
    addHtml+=`<div class="eq-total"><span>Est. Add-On Revenue</span><span>${fmt$(addOnGroupTotal)}</span></div>`;
  }
  addHtml+=`</div>`;

  addHtml+=`<div class="eq-card" style="border-color:#fcd34d;background:#fffbf0">
    <div class="eq-card-title" style="color:#92400e">Estimated Grand Total</div>
    <div class="eq-row"><span>🏠 Room rates (base)</span><span>${fmt$(+totalRoomBase.toFixed(2))}</span></div>
    ${totalPkg>0?`<div class="eq-row"><span>📦 Packages</span><span>${fmt$(+totalPkg.toFixed(2))}</span></div>`:''}
    <div class="eq-row" style="color:#0891b2"><span>🤝 Gratuity ($${tipPer}/guest/night)</span><span>${fmt$(+totalTip.toFixed(2))}</span></div>
    ${totalRoomTax>0?`<div class="eq-row" style="color:#7c3aed"><span>🏛 ISH hab. (16%)</span><span>${fmt$(+totalRoomTax.toFixed(2))}</span></div>`:''}
    ${totalPkgTax>0?`<div class="eq-row" style="color:#7c3aed"><span>🏛 IVA extras (${Math.round(pkgTaxRate*100)}%)</span><span>${fmt$(+totalPkgTax.toFixed(2))}</span></div>`:''}
    ${IS_TEACHER_MODE?(eqDiscountAmt>0?`<div class="eq-row" style="color:#dc2626"><span>🏷 Discount</span><span style="color:#dc2626;font-weight:700">−${fmt$(eqDiscountAmt)}</span></div>`:''):`<div class="eq-row" style="color:#dc2626"><span style="display:flex;align-items:center;gap:6px">🏷 Discount $<input id="eqDiscountInput" type="number" min="0" step="0.01" value="${eqDiscountAmt||''}" placeholder="0" style="width:75px;padding:1px 5px;font-size:11px;border:1px solid #fca5a5;border-radius:4px;text-align:right;color:#dc2626;font-weight:700" onchange="setEqDiscountAmt(this.value)"></span><span style="color:#dc2626;font-weight:700">${eqDiscountAmt>0?`−${fmt$(eqDiscountAmt)}`:''}</span></div>`}
    <div style="border-top:2px solid #fcd34d;margin:8px 0"></div>
    <div class="eq-total" style="font-size:16px"><span>Est. Total Revenue</span><span style="color:var(--teal)">${fmt$(grandEstAfterDisc)}</span></div>
    ${totalPaid>0?`<div class="eq-row" style="color:#16a34a"><span>✅ Paid</span><span>−${fmt$(totalPaid)}</span></div>
    <div class="eq-total" style="font-size:15px;border-top:1px dashed #fcd34d;padding-top:6px"><span>Est. Balance Due</span><span style="color:${estBalance>0?'#dc2626':'#16a34a'}">${fmt$(estBalance)}</span></div>`:''}
  </div></div>`;

  document.getElementById('estQuoteBody').innerHTML=roomHtml+addHtml;
}

function setEqDiscountAmt(val){
  if(!regSelBk)return;
  const amt=Math.max(0,parseFloat(val)||0);
  regSelBk.eqDiscountAmt=amt;
  saveAll();
  renderEstQuote();
}


// ===== PRICE TOOLTIP =====
function showPriceTip(e,rtId){
  e.stopPropagation();
  document.getElementById('priceTipEl')?.remove();
  const rt=AppData.roomTypes.find(t=>t.id===rtId);if(!rt)return;
  const nights=regSelBk?getNights(regSelBk):1;
  let html=`<div class="price-tip-hdr">${rt.name} · ${nights} Night${nights!==1?'s':''}</div>`;
  for(let gc=1;gc<=rt.maxOcc;gc++){
    const rate=gc>=2?rt.price2:rt.price1;
    const base=+(rate*gc*nights).toFixed(2);
    const _tip=getTip(regSelBk);const dip=_tip*gc*nights;
    const sub=+(base+dip).toFixed(2);
    const tax=+(base*0.16).toFixed(2);
    const total=+(sub+tax).toFixed(2);
    html+=`<div class="pt-section">
      <div class="pt-title">${gc===1?'1 Guest':`${gc} Guests`}</div>
      <div class="pt-row"><span>Rate (${fmt$(rate)}/person/night)</span><span>${fmt$(base)}</span></div>
      <div class="pt-row"><span>Tip fee ($${_tip}×${gc}×${nights})</span><span>${fmt$(dip)}</span></div>
      <div class="pt-row divider"><span>Subtotal</span><span>${fmt$(sub)}</span></div>
      <div class="pt-row"><span>Tax (16%)</span><span>${fmt$(tax)}</span></div>
      <div class="pt-row grand"><span>Grand Total</span><span>${fmt$(total)}</span></div>
    </div>`;
  }
  html+=`<div class="pt-note">Low Season · USD · ${nights} night${nights!==1?'s':''}</div>`;
  const tip=document.createElement('div');tip.id='priceTipEl';tip.className='price-tip';tip.innerHTML=html;
  document.body.appendChild(tip);
  const r=e.currentTarget.getBoundingClientRect();
  let left=r.left,top=r.bottom+8;
  if(left+330>window.innerWidth)left=window.innerWidth-340;
  if(top+500>window.innerHeight)top=r.top-tip.offsetHeight-8;
  tip.style.left=left+'px';tip.style.top=top+'px';
  setTimeout(()=>{document.addEventListener('click',function cl(ev){if(!tip.contains(ev.target)){tip.remove();document.removeEventListener('click',cl);}});},80);
}


// ===== ROOM TYPE HOVER TOOLTIP (teacher view) =====
let _rtTipTimer=null;
function showRtTooltip(e,rtId){
  clearTimeout(_rtTipTimer);
  document.getElementById('priceTipEl')?.remove();
  const rt=AppData.roomTypes.find(t=>t.id===rtId);if(!rt)return;
  const nights=regSelBk?getNights(regSelBk):1;
  const _ls=regSelBk&&isLowSeason(regSelBk.startDate,nights);
  const _tip=getTip(regSelBk);
  const pkgTaxRate=getBkTaxRate(regSelBk);
  const season=_ls?'Low Season (May–Sep)':'High Season (Oct–Apr)';
  let html=`<div class="price-tip-hdr">${rt.name} · ${nights} night${nights!==1?'s':''} · ${season}</div>`;
  const maxShow=rt.maxOcc===1?1:Math.min(rt.maxOcc,2);
  for(let gc=1;gc<=maxShow;gc++){
    const rate=gc>=2?(_ls?(rt.price2_low||rt.price2):rt.price2):(_ls?(rt.price1_low||rt.price1):rt.price1);
    const base=+(rate*gc*nights).toFixed(2);
    const dip=+(_tip*gc*nights).toFixed(2);
    const pkg=+(calcPkgCost(regSelBk,gc)).toFixed(2);
    const pkgTax=+(pkg*pkgTaxRate).toFixed(2);
    const roomTax=+(base*0.16).toFixed(2);
    const total=+(base+dip+pkg+pkgTax+roomTax).toFixed(2);
    const lbl=rt.maxOcc===1?'Private (1 guest)':gc===1?'Solo (1 guest)':'Sharing (2 guests)';
    html+=`<div class="pt-section">
      <div class="pt-title">${lbl}</div>
      <div class="pt-row"><span>Rate (${fmt$(rate)}/person/night × ${gc}${nights>1?' × '+nights+'nt':''})</span><span>${fmt$(base)}</span></div>
      ${pkg>0?`<div class="pt-row"><span>Add-ons (${gc} guest${gc>1?'s':''})</span><span>${fmt$(pkg)}</span></div>`:''}
      <div class="pt-row"><span>Gratuity ($${_tip}/person/night × ${gc}${nights>1?' × '+nights+'nt':''})</span><span>${fmt$(dip)}</span></div>
      <div class="pt-row"><span>Tax hab. (16%)</span><span>${fmt$(roomTax)}</span></div>
      ${pkgTax>0?`<div class="pt-row"><span>IVA extras (${Math.round(pkgTaxRate*100)}%)</span><span>${fmt$(pkgTax)}</span></div>`:''}
      <div class="pt-row grand"><span>Total</span><span>${fmt$(total)}</span></div>
    </div>`;
  }
  const tip=document.createElement('div');tip.id='priceTipEl';tip.className='price-tip';tip.innerHTML=html;
  tip.addEventListener('mouseenter',()=>clearTimeout(_rtTipTimer));
  tip.addEventListener('mouseleave',()=>{_rtTipTimer=setTimeout(()=>tip.remove(),150);});
  document.body.appendChild(tip);
  const r=e.currentTarget.getBoundingClientRect();
  let left=r.left,top=r.bottom+8;
  if(left+330>window.innerWidth)left=window.innerWidth-340;
  if(top+520>window.innerHeight)top=r.top-8-tip.scrollHeight;
  tip.style.left=left+'px';tip.style.top=top+'px';
}
function hideRtTooltip(){_rtTipTimer=setTimeout(()=>document.getElementById('priceTipEl')?.remove(),150);}


// ===== PRICE LIST =====
function openPriceList(){
  if(!regSelBk)return;
  const nights=getNights(regSelBk);
  const blockedSet=new Set(regSelBk.blockedRooms||[]);
  document.getElementById('priceListSub').textContent=`${regSelBk.leaderName||regSelBk.retreatName} · ${fmtDate(regSelBk.startDate)} – ${fmtDate(regSelBk.endDate)} · ${nights} nights`;
  let html=`<div class="pl-retreat-hdr">${regSelBk.leaderName||regSelBk.retreatName} &nbsp;|&nbsp; ${fmtDate(regSelBk.startDate)} – ${fmtDate(regSelBk.endDate)} &nbsp;|&nbsp; ${nights} nights</div>`;
  const plTaxLbl='Taxes (16%)';
  html+=`<table class="pl-table"><thead><tr><th>Guests in Room</th><th>Tip Fee</th><th>Nightly Rate</th><th>Subtotal</th><th>${plTaxLbl}</th><th>Grand Total</th></tr></thead><tbody>`;
  AppData.roomTypes.forEach(rt=>{
    if(blockedSet.size>0&&!rt.rooms.some(r=>blockedSet.has(r)))return;
    html+=`<tr class="pl-type-row"><td colspan="6"><div style="display:flex;align-items:flex-start;gap:8px;flex-direction:column"><div style="display:flex;align-items:center;gap:8px"><div style="width:10px;height:10px;border-radius:50%;background:${rt.color};flex-shrink:0"></div><span style="font-weight:700">${rt.name}</span><span style="color:#8a7e74;font-size:11.5px">· ${rt.maxOcc===1?'Private, 1 max':'Up to '+rt.maxOcc+' guests'}</span></div>${rt.desc?`<div style="font-size:11.5px;color:#6b7280;font-style:italic;padding-left:18px;line-height:1.5">${rt.desc}</div>`:''}</div></td></tr>`;
    for(let gc=1;gc<=rt.maxOcc;gc++){
      const rate=gc>=2?rt.price2:rt.price1;
      const base=+(rate*gc*nights).toFixed(2);
      const _tipR=getTip(regSelBk);const dip=_tipR*gc*nights;
      const sub=+(base+dip).toFixed(2);
      const tax=+(base*0.16).toFixed(2);
      const total=+(sub+tax).toFixed(2);
      const lbl=rt.maxOcc===1?'1 person (private)':gc===1?'1 person':gc===rt.maxOcc?`${gc} people (max)`:gc+' people';
      html+=`<tr><td>${lbl}</td><td>${fmt$(dip)}</td><td>${fmt$(base)} <span style="color:#aaa;font-size:11px">(${fmt$(rate)}/person/night)</span></td><td>${fmt$(sub)}</td><td>${fmt$(tax)}</td><td class="pl-grand-td">${fmt$(total)}</td></tr>`;
    }
  });
  html+=`</tbody></table>`;
  document.getElementById('priceListBody').innerHTML=html;
  openModal('priceListModal');
}

function openSettings(){
  const tbody=document.getElementById('settingsTbody');tbody.innerHTML='';
  const inp=s=>`style="width:72px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-family:'Jost',sans-serif;font-size:13px;"`;
  const PROP_COLORS={'AMANSALA':'#e0f2fe','CASA SHANTI':'#e0f7fa','CASA GRANDE':'#fef3c7'};
  let lastProp=null;
  AppData.roomTypes.forEach(rt=>{
    const prop=rt.property||'AMANSALA';
    if(prop!==lastProp){
      lastProp=prop;
      const hdr=document.createElement('tr');
      hdr.innerHTML=`<td colspan="4" style="padding:8px 12px 6px;background:${PROP_COLORS[prop]||'#f5f5f5'};font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#374151;border-bottom:1px solid var(--border)">${prop}</td>`;
      tbody.appendChild(hdr);
    }
    const tr=document.createElement('tr');
    const hiddenHalves=isDoubleRoomType(rt)?rt.rooms.filter(r=>isUiHiddenPhysicalRoom(r)):[];
    const chips=buildUiRoomEntries(rt).map(e=>{
      const cat=roomCatLabel(e.display);const cls=cat==='CH'?'rm-chip ch':cat==='CASA'?'rm-chip casa':'rm-chip';
      const sub=e.merged?` <span style="font-size:9px;opacity:.65" title="Cloudbeds: ${e.physical.join(', ')}">CB: ${e.physical.join('+')}</span>`:'';
      const delBtn=e.merged
        ?e.physical.map(p=>`<button onclick="settingDelRoom('${rt.id}','${p}')" title="Remove ${p}">×${p}</button>`).join('')
        :`<button onclick="settingDelRoom('${rt.id}','${e.display}')" title="Remove room">×</button>`;
      return`<span class="${cls}">${e.display}${sub}${delBtn}</span>`;
    }).join('');
    const hiddenNote=hiddenHalves.length?`<div style="font-size:10px;color:#9ca3af;margin-top:6px;font-style:italic">Cloudbeds split halves (hidden in portal UI): ${hiddenHalves.join(', ')}</div>`:'';
    tr.innerHTML=`
      <td style="padding:9px 12px;border-bottom:1px solid var(--border);white-space:nowrap"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${rt.color};margin-right:6px;vertical-align:middle"></span><b>${rt.name}</b><button onclick="deleteRoomType('${rt.id}')" title="Delete room type" style="margin-left:8px;padding:1px 6px;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;border-radius:5px;font-size:11px;cursor:pointer;vertical-align:middle">✕</button></td>
      <td style="padding:9px 10px;border-bottom:1px solid var(--border)"><input type="number" value="${rt.price1}" data-id="${rt.id}" data-f="price1" ${inp()}></td>
      <td style="padding:9px 10px;border-bottom:1px solid var(--border)"><input type="number" value="${rt.price1_low||''}" placeholder="—" data-id="${rt.id}" data-f="price1_low" ${inp()}></td>
      <td style="padding:9px 10px;border-bottom:1px solid var(--border)"><input type="number" value="${rt.price2}" data-id="${rt.id}" data-f="price2" ${inp()}></td>
      <td style="padding:9px 10px;border-bottom:1px solid var(--border)"><input type="number" value="${rt.price2_low||''}" placeholder="—" data-id="${rt.id}" data-f="price2_low" ${inp()}></td>
      <td style="padding:9px 10px 9px 12px;border-bottom:1px solid var(--border)">
        <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
          ${chips}
          ${hiddenNote}
          <span style="display:inline-flex;gap:4px;align-items:center;margin-left:2px">
            <input type="text" id="rm-add-${rt.id}" placeholder="Room #" style="width:72px;padding:3px 7px;border:1.5px solid var(--border);border-radius:6px;font-size:12px;font-family:'Jost',sans-serif" onkeydown="if(event.key==='Enter')settingAddRoom('${rt.id}')">
            <button onclick="settingAddRoom('${rt.id}')" style="padding:3px 9px;background:var(--teal);color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-family:'Jost',sans-serif">+ Add</button>
          </span>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
  openModal('settingsModal');
}
function saveSettings(){
  document.querySelectorAll('#settingsTbody input[data-id]').forEach(inp=>{const rt=AppData.roomTypes.find(r=>r.id===inp.dataset.id);if(rt)rt[inp.dataset.f]=parseFloat(inp.value)||0;});
  saveAll();closeModal('settingsModal');regRender();showToast('Prices saved.');
}
function settingAddRoom(rtId){
  const inp=document.getElementById('rm-add-'+rtId);if(!inp)return;
  const room=inp.value.trim();if(!room){inp.focus();return;}
  const rt=AppData.roomTypes.find(r=>r.id===rtId);if(!rt)return;
  if(rt.rooms.includes(room)){showToast('Room already exists in this type.');return;}
  rt.rooms.push(room);saveAll();openSettings();showToast(`Room ${room} added to ${rt.name}.`);
}
async function resetRoomLists(){
  if(!confirm('Reset all room lists to the default inventory?\n\nThis will restore missing rooms (like 2B) and fix misassigned rooms. Your custom prices are kept.\nThis cannot be undone.'))return;
  const defRoomToRtId=new Map();
  DEF_ROOM_TYPES.forEach(defRt=>defRt.rooms.forEach(r=>defRoomToRtId.set(r,defRt.id)));
  DEF_ROOM_TYPES.forEach(defRt=>{
    const stored=AppData.roomTypes.find(rt=>rt.id===defRt.id);
    if(stored)defRt.rooms.forEach(r=>{if(!stored.rooms.includes(r))stored.rooms.push(r);});
  });
  AppData.roomTypes.forEach(storedRt=>{
    storedRt.rooms=storedRt.rooms.filter(r=>{const c=defRoomToRtId.get(r);return!c||c===storedRt.id;});
  });
  // Write roomTypes to Supabase FIRST — so that when saveAll()'s realtime event fires and
  // calls loadFromSupabase(), Supabase already has the correct room lists and won't overwrite them.
  await syncRoomTypesToSupabase();
  saveAll();
  openSettings();
  if(typeof rcBuild==='function')rcBuild();
  showToast('Room lists reset to defaults and synced.');
}
function deleteRoomType(rtId){
  const rt=AppData.roomTypes.find(r=>r.id===rtId);if(!rt)return;
  if(!confirm(`Delete room type "${rt.name}"?\n\nThis will remove the type and all its room assignments from the portal.`))return;
  AppData.roomTypes=AppData.roomTypes.filter(r=>r.id!==rtId);
  saveAll();openSettings();showToast(`Room type "${rt.name}" deleted.`);
}
function settingDelRoom(rtId,room){
  if(!confirm(`Remove room "${room}" from inventory?\n\nThis will also remove any existing guest assignments for this room.`))return;
  const rt=AppData.roomTypes.find(r=>r.id===rtId);if(!rt)return;
  rt.rooms=rt.rooms.filter(r=>r!==room);
  AppData.regs.filter(r=>r.room===room).forEach(r=>deletedRegIds.add(r.id));
  AppData.regs=AppData.regs.filter(r=>r.room!==room);
  saveAll();openSettings();showToast(`Room ${room} removed.`);
}

// Reg copy
function openRegCopyModal(){
  if(!regSelBk)return;
  const nights=getNights(regSelBk);
  let text=`ROOM LIST — ${(regSelBk.leaderName||regSelBk.retreatName).toUpperCase()}\n`;
  text+=`${fmtDate(regSelBk.startDate)} – ${fmtDate(regSelBk.endDate)} · ${nights} Nights\n${'─'.repeat(48)}\n\n`;
  let gt=0,tp=0;
  AppData.roomTypes.forEach(rt=>{
    const entries=buildUiRoomEntries(rt).filter(e=>e.physical.some(p=>getRegForRoom(regSelBk.id,p)));
    if(!entries.length)return;
    text+=`[ ${rt.name.toUpperCase()} ]\n`;
    entries.forEach(entry=>{
      entry.physical.forEach(room=>{
        const reg=getRegForRoom(regSelBk.id,room);if(!reg)return;
        const gc=(reg.guests||[]).filter(g=>g.name).length;
        const price=reg.customPrice!=null?reg.customPrice:calcPrice(rt,gc,nights,regSelBk.startDate,regSelBk);
        const paid=reg.amountPaid||0;gt+=price;tp+=paid;
        const rmLbl=entry.merged?entry.display:room;
        (reg.guests||[]).filter(g=>g.name).forEach((g,i)=>{text+=`  ${('Rm '+rmLbl).padEnd(10)}${g.name.padEnd(26)}${i===0?fmt$(price):''}\n`;});
      });
    });
    text+='\n';
  });
  text+=`${'─'.repeat(48)}\n${'GRAND TOTAL'.padEnd(44)}${fmt$(gt)}\n${'AMOUNT PAID'.padEnd(44)}${fmt$(tp)}\n${'BALANCE DUE'.padEnd(44)}${fmt$(gt-tp)}\n`;
  document.getElementById('copyModalTitle').textContent=`Room List — ${regSelBk.leaderName||regSelBk.retreatName}`;
  document.getElementById('copyPrev').textContent=text;
  openModal('copyModal');
}

function doCopy(){const t=document.getElementById('copyPrev').textContent;navigator.clipboard.writeText(t).then(()=>showToast('Copied!')).catch(()=>{const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast('Copied!');});}

