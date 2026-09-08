// ===== teacher-portal.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== TEACHER REGISTRATION =====
// Transport rows for the currently-selected retreat, fetched once on retreat select
// (matches Staging's own selectBooking() — not on every regRender(), just when the
// retreat changes) — feeds the "★ Teacher Pays Transport" banner below.
let regTransportRows=[];
const _TR_RATES={cancun:[195,100,80,65,55,45],tulum:[145,80,65,55,45,40]};
function _calcTransportTotal(rows,direction){
  let total=0,isCharged=false;
  for(const r of rows){
    const d=r.data||{};
    const hasTrip=direction==='arrival'?(d.arrivalDate&&d.arrivalTime&&!d.arrivalOT):(d.departureDate&&d.departureTime&&!d.departureOT);
    if(!hasTrip)continue;
    if(direction==='arrival'&&d.folioCharged?.arrivalFolioItemId){total+=d.folioCharged.arrivalAmount||0;isCharged=true;}
    else if(direction==='departure'&&d.folioCharged?.departureFolioItemId){total+=d.folioCharged.departureAmount||0;isCharged=true;}
    else{
      const airport=direction==='arrival'?(d.arrivalAirport||''):(d.departureAirport||'');
      const c=d.serviceCost!=null?Number(d.serviceCost):(_TR_RATES[airport]?.[0]||0);
      total+=c;
    }
  }
  return total>0?{total,exact:isCharged}:null;
}
function regInitSel(){
  const srch=document.getElementById('regRetreatSearch');
  const hid=document.getElementById('regRetreatSel');
  if(srch)srch.value='';
  if(hid)hid.value='';
  regSelBk=null;
}

function regSearchInput(){
  const q=(document.getElementById('regRetreatSearch').value||'').toLowerCase().trim();
  const drop=document.getElementById('regRetreatDrop');
  if(!q){
    const hid=document.getElementById('regRetreatSel');
    if(hid&&hid.value){hid.value='';regSelBk=null;regOnRetreat();}
  }
  const opts=AppData.bookings.filter(b=>b.status!=='cancelled').sort((a,b)=>(a.startDate||'').localeCompare(b.startDate||'')).filter(bk=>{
    const label=`${(bk.leaderName||bk.retreatName||'')} ${fmtDate(bk.startDate)} ${fmtDate(bk.endDate)}`.toLowerCase();
    return label.includes(q);
  });
  drop.innerHTML=opts.length?opts.map(bk=>{
    const label=`${bk.leaderName||bk.retreatName}`;
    const dates=`${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}`;
    return`<div class="reg-drop-item" data-id="${bk.id}" onmousedown="regSelectRetreat('${bk.id}')"
      style="padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-family:'Jost',sans-serif"
      onmouseover="this.style.background='#f0f9f9'" onmouseout="this.style.background=''">
      <div style="font-size:13px;font-weight:600;color:var(--dark)">${label}</div>
      <div style="font-size:11.5px;color:var(--muted)">${dates}</div>
    </div>`;
  }).join(''):`<div style="padding:12px 16px;font-size:12.5px;color:var(--muted);font-style:italic">No retreats found</div>`;
  drop.style.display='block';
}

function regSearchFocus(){
  regSearchInput();
}

function regSearchBlur(){
  document.getElementById('regRetreatDrop').style.display='none';
}

let _regSearchIdx=-1;
function regSearchKey(e){
  const drop=document.getElementById('regRetreatDrop');
  const items=drop.querySelectorAll('.reg-drop-item');
  if(e.key==='ArrowDown'){e.preventDefault();_regSearchIdx=Math.min(_regSearchIdx+1,items.length-1);items.forEach((el,i)=>el.style.background=i===_regSearchIdx?'#f0f9f9':'');}
  else if(e.key==='ArrowUp'){e.preventDefault();_regSearchIdx=Math.max(_regSearchIdx-1,0);items.forEach((el,i)=>el.style.background=i===_regSearchIdx?'#f0f9f9':'');}
  else if(e.key==='Enter'&&_regSearchIdx>=0){items[_regSearchIdx].dispatchEvent(new MouseEvent('mousedown'));}
  else if(e.key==='Escape'){drop.style.display='none';}
}

function regSelectRetreat(bkId){
  if(bkId)localStorage.setItem('ama_last_reg_bk',bkId);
  const bk=AppData.bookings.find(b=>b.id===bkId);
  const srch=document.getElementById('regRetreatSearch');
  const hid=document.getElementById('regRetreatSel');
  const drop=document.getElementById('regRetreatDrop');
  if(srch&&bk)srch.value=`${bk.leaderName||bk.retreatName} · ${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}`;
  if(hid)hid.value=bkId||'';
  if(drop)drop.style.display='none';
  _regSearchIdx=-1;
  regOnRetreat();
}

function _updateLockAllBtn(){
  const btn=document.getElementById('regLockAllBtn');
  if(!btn)return;
  btn.style.display=regSelBk?'inline-flex':'none';
  const locked=!!regSelBk?.allLocked;
  btn.innerHTML=locked?'🔒 Locked for Teacher':'🔓 Lock for Teacher';
  btn.classList.toggle('all-locked',locked);
}
function toggleRetreatLock(){
  if(!regSelBk)return;
  regSelBk.allLocked=!regSelBk.allLocked;
  saveAll();
  _updateLockAllBtn();
  regRender();
  showToast(regSelBk.allLocked?'Retreat locked — teachers cannot move guests.':'Retreat unlocked.');
}
async function regOnRetreat(){
  const id=document.getElementById('regRetreatSel').value;
  // Cancel any pending watch when user picks a different retreat
  if(_watchLockChannel){try{db.removeChannel(_watchLockChannel);}catch(e){}_watchLockChannel=null;}
  if(!id){
    localStorage.removeItem('ama_last_reg_bk');
    await _releaseRetreatLock();
    regSelBk=null;
    _updateRegButtons(null);
    document.getElementById('regTeacherCodeWrap').style.display='none';
    document.getElementById('estQuotePanel').style.display='none';
    regRender();
    return;
  }
  const bk=AppData.bookings.find(b=>b.id===id)||null;
  if(!bk)return;
  regSelBk=bk;
  _updateRegButtons(bk);
  document.getElementById('regTeacherCodeWrap').style.display='none';
  document.getElementById('estQuotePanel').style.display='none';
  regTransportRows=[];
  regRender();
  try{
    const{data}=await db.from('transport').select('id,booking_id,data').eq('booking_id',bk.id);
    if(regSelBk&&regSelBk.id===bk.id){regTransportRows=data||[];regRender();}
  }catch(e){}
}

function regRender(){
  if(!regSelBk){
    document.getElementById('regStatsBar').style.display='none';
    document.getElementById('regPanel').innerHTML=`<div class="reg-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg><p>Select a retreat above to manage room assignments.</p></div>`;
    return;
  }
  document.body.classList.toggle('retreat-locked',!!(IS_TEACHER_MODE&&regSelBk?.allLocked));
  const _teacherLocked=IS_TEACHER_MODE&&!!regSelBk?.allLocked;
  // Real Rooms → "Room #s Hidden/Visible" toggle (packageCustomPrices.__cfg__.hideRoomNumbers,
  // defaults true) — only actually hide the real room number from a teacher when this
  // per-retreat setting says to; matches staging exactly instead of always substituting
  // "Room N" whenever IS_TEACHER_MODE is true.
  const _hideRoomNums=IS_TEACHER_MODE&&(regSelBk?.packageCustomPrices?.__cfg__?.hideRoomNumbers??true);
  const nights=getNights(regSelBk);
  const allRegs=getRegsForBk(regSelBk.id);
  const _blockedSetEarly=new Set(regSelBk.blockedRooms||[]);
  let totalGuests=0,grandTotal=0,pkgBillTotal=0;
  const _regedRooms=new Set();
  // Mirror renderEstQuote exactly: one reg per room, rt from physical room, fresh calc.
  // When a room has more than one registration (e.g. a stale empty placeholder left behind
  // after a guest was added via a separate row), prefer whichever has more named guests
  // instead of "whoever the fetch happened to return last" — matches staging's
  // _billRegByRoom fix (js/modules/teachers.js), which no longer silently drops a named
  // guest to an empty duplicate depending on unordered fetch results.
  const _regByRoom={};
  allRegs.forEach(r=>{
    if(!_blockedSetEarly.has(r.room))return;
    const prev=_regByRoom[r.room];
    if(!prev){_regByRoom[r.room]=r;return;}
    if((r.guests||[]).filter(g=>g.name).length>(prev.guests||[]).filter(g=>g.name).length)_regByRoom[r.room]=r;
  });
  const _pkgTxR=getBkTaxRate(regSelBk),_rmTxR=_pkgTxR===0?0:0.16,_tipPer=getTip(regSelBk);
  const _billAddOns=calcPkgItems(regSelBk);
  Array.from(_blockedSetEarly).forEach(room=>{
    const rt=AppData.roomTypes.find(t=>(t.rooms||[]).includes(room));
    if(!rt)return;
    const reg=_regByRoom[room];
    const gc=reg?new Set((reg.guests||[]).filter(g=>g.name).map(g=>g.name.trim())).size:0;
    if(!gc)return;
    const _bECI=reg.checkIn||regSelBk.startDate;
    const _bECO=reg.checkOut||regSelBk.endDate;
    // Independent per-side fallback (matches staging's getRegNights) — a registration
    // with only check_in set (e.g. an early arrival) must still extend the nights count,
    // not silently fall back to the booking's full-retreat nights just because check_out
    // is unset.
    const _bNightsRaw=Math.max(1,Math.round((pd(_bECO)-pd(_bECI))/DAY_MS));
    // custom_nights_override/custom_tip_nights_override/custom_tip_rate_override: an admin-set
    // billed-nights count for this registration, independent of the raw check-in/check-out span.
    const _bNights=reg.customNightsOverride!=null?Number(reg.customNightsOverride):_bNightsRaw;
    const _bTipNights=reg.customTipNightsOverride!=null?Number(reg.customTipNightsOverride):_bNights;
    const _bTipRate=reg.customTipRateOverride!=null?Number(reg.customTipRateOverride):_tipPer;
    const _isBd1ExtraB=rt.id==='bd1'&&reg.customRateOverride==null&&(gc>=2||_getSharedBeds(room).some(s=>_blockedSetEarly.has(s)&&(_regByRoom[s]?.guests||[]).filter(g=>g.name).length>=2));
    const rate=reg.customRateOverride!=null?reg.customRateOverride:(_isBd1ExtraB?(isLowSeason(_bECI,_bNights)?BD1_EXTRA_RATE_LOW:BD1_EXTRA_RATE_HIGH):getRoomRate(rt,gc,_bECI,_bNights));
    const base=rate*gc*_bNights;
    const pkgCost=reg.customPkgPrice!=null?reg.customPkgPrice:(_billAddOns.length?calcPkgCost(regSelBk,gc):0);
    // calcCustomAoCost already returns a tax-inclusive $ total (each item taxed at its
    // own rate, which can differ from _pkgTxR) — add it directly, don't run it through
    // _pkgTxR again.
    const cao=calcCustomAoCost(regSelBk,gc,reg);
    const total=+(base+pkgCost+base*_rmTxR+pkgCost*_pkgTxR+_bTipRate*gc*_bTipNights+cao).toFixed(2);
    grandTotal+=total;
    // Pure display sub-total (packages + their tax + custom add-ons) — not a separate
    // calculation, just breaking out what's already folded into `total` above so the
    // compact info bar can show a "PKG" figure like staging does.
    pkgBillTotal+=+(pkgCost+pkgCost*_pkgTxR+cao).toFixed(2);
    _regedRooms.add(room);totalGuests+=gc;
  });
  grandTotal=+(grandTotal-(regSelBk.eqDiscountAmt||0)).toFixed(2);
  // Use booking-level payments (bk.payments) — that's where admin records actual money received
  const totalPaid=(regSelBk.payments||[]).reduce((s,p)=>s+(p.amount||0),0);
  // Packages bar
  const pkgBar=document.getElementById('pkgBar');
  if(pkgBar){
    const selPkgs=regSelBk.packages||[];
    const pkgTotal=calcPkgItems(regSelBk).reduce((s,a)=>s+a.price,0);
    const fromContract=regSelBk.addOnsConfirmedAt&&selPkgs.length>0;
    pkgBar.style.display='block';
    const customPrices=regSelBk.packageCustomPrices||{};
    const _cfgBundle=customPrices.__cfg__?.bundle;
    const hasBundle=regSelBk.pkgBundle?.price!=null||regSelBk.pkgBundlePrice!=null||_cfgBundle?.price!=null;
    const hasCustom=hasBundle||Object.keys(customPrices).some(k=>selPkgs.includes(k));
    const bundleDisplayPrice=regSelBk.pkgBundle?.price??regSelBk.pkgBundlePrice??_cfgBundle?.price;
    const customBadge=hasBundle
      ?`<span style="background:#e0f2fe;color:#0e5a5a;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:4px">bundle $${bundleDisplayPrice}/person</span>`
      :hasCustom?`<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:4px">custom pricing</span>`:'';
    const effectivePkgTotal=+calcPkgCost(regSelBk,1).toFixed(2);
    // Auto-expand whenever this retreat already has add-ons selected — matches staging's
    // always-visible chip list; collapsed-by-default only makes sense for an empty selection.
    const _pkgShowOpen=_pkgBarOpen||selPkgs.length>0||!!(regSelBk.packageCustomPrices?.__custom__||[]).length;
    const staffPriceBtn=!IS_TEACHER_MODE?`<button onclick="pkgTogglePriceEditor()" style="padding:3px 10px;font-size:11px;font-weight:600;color:#0e9494;background:#fff;border:1.5px solid #0e9494;border-radius:6px;cursor:pointer;font-family:inherit;margin-left:auto">✏ Custom Prices</button>`:'';
    // Extra (per-booking custom) packages
    const extraPkgs=regSelBk.extraPackages||[];
    const extraChips=extraPkgs.map(ep=>{const on=selPkgs.includes(ep.id);return`<button class="pkg-chip${on?' on':''}" onclick="togglePkg('${ep.id}')" style="position:relative">${on?'<span class="pkg-check">✓</span>':''}${ep.name}<span class="pkg-price custom-price">$${ep.price}</span>${!IS_TEACHER_MODE?`<span onclick="event.stopPropagation();removeExtraPkg('${ep.id}')" title="Remove custom package" style="margin-left:5px;color:#dc2626;font-size:12px;font-weight:700;line-height:1">×</span>`:''}</button>`;}).join('');
    // packageCustomPrices.__custom__: one-off ad-hoc add-ons entered in Staging (e.g.
    // "3 Drink per day"), always applied to every guest — not gated by selPkgs like the
    // ADD_ONS/extraPackages chips above. calcPkgItems() already folds their $ into every
    // total; show them here too so staff/teachers can see what they're paying for.
    const customAoChips=(regSelBk.packageCustomPrices?.__custom__||[]).map(c=>{
      const price=+(Number(c.price||0)*Number(c.nights||1)).toFixed(2);
      return`<div class="pkg-chip on" style="cursor:default" title="Custom add-on entered in Staging — always applied">✓ ${c.name||'Custom add-on'}<span class="pkg-price custom-price">$${price}</span></div>`;
    }).join('');
    const addCustomBtn='';
    const addCustomForm=!IS_TEACHER_MODE?`<div id="extraPkgForm" style="display:none;align-items:center;gap:8px;margin-top:10px;padding:10px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;flex-wrap:wrap">
      <input id="extraPkgName" type="text" placeholder="Package name" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12.5px;width:180px;outline:none">
      <div style="display:flex;align-items:center;gap:4px"><span style="font-size:13px;color:var(--muted)">$</span><input id="extraPkgPrice" type="number" placeholder="0" min="0" step="0.01" style="padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12.5px;width:80px;outline:none" onkeydown="if(event.key==='Enter')addExtraPkg()"></div>
      <span style="font-size:11.5px;color:var(--muted)">/person</span>
      <button onclick="addExtraPkg()" style="padding:6px 14px;background:#0e9494;color:#fff;border:none;border-radius:7px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer">Add</button>
      <button onclick="document.getElementById('extraPkgForm').style.display='none'" style="padding:6px 10px;background:#fff;color:#6b7280;border:1.5px solid #d1d5db;border-radius:7px;font-family:'Jost',sans-serif;font-size:12.5px;cursor:pointer">Cancel</button>
    </div>`:'';
    // Teachers can never add/remove packages — only admin can manage packages
    const lockedForTeacher=IS_TEACHER_MODE;
    if(lockedForTeacher){
      const contractBadgeHtml=fromContract?`<span style="background:#d1fae5;color:#065f46;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:4px">from contract</span>`:'';
      const lockedChips=ADD_ONS.filter(ao=>selPkgs.includes(ao.id)).map(ao=>{const cp=customPrices[ao.id];const dispPrice=cp!=null?cp:ao.price;return`<div class="pkg-chip on" style="cursor:default;pointer-events:none"><span class="pkg-check">✓</span>${ao.name}<span class="pkg-price${cp!=null?' custom-price':''}">$${dispPrice}</span></div>`;}).join('');
      pkgBar.innerHTML=`<div class="pkg-bar-hdr" style="display:flex;align-items:center;gap:8px">
        <span class="pkg-bar-title">Add-on Packages</span>
        <span class="pkg-bar-sub">${selPkgs.length?`${selPkgs.length} selected · $${effectivePkgTotal}/person`:'No add-on packages selected'}${contractBadgeHtml}${customBadge}</span>
        <button id="pkgBarToggleBtn" onclick="pkgBarToggle()" title="View add-ons" style="margin-left:auto;background:${_pkgShowOpen?'#fef3c7':'#0e9494'};border:none;border-radius:7px;cursor:pointer;font-size:12px;font-weight:700;color:${_pkgShowOpen?'#92400e':'#fff'};padding:6px 12px;font-family:'Jost',sans-serif;white-space:nowrap">${_pkgShowOpen?'▴ Hide Add-ons':'+ Add-ons'}</button>
      </div>
      <div id="pkgBarBody" style="max-height:${_pkgShowOpen?'600px':'0'};overflow:${_pkgShowOpen?'visible':'hidden'}">
        ${(selPkgs.length||customAoChips)?`<div class="pkg-chips">${lockedChips}${customAoChips}</div>`:''}
      </div>`;
    }else{
      const contractBadge=fromContract?`<span style="background:#d1fae5;color:#065f46;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:4px">from contract</span>`:'';
      pkgBar.innerHTML=`<div class="pkg-bar-hdr" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="pkg-bar-title">Add-on Packages</span>
        <span class="pkg-bar-sub">${selPkgs.length?`${selPkgs.length} selected · $${effectivePkgTotal}/person added to all rooms`:'Select packages — they will apply to every guest in this retreat'}${contractBadge}${customBadge}</span>
        ${staffPriceBtn}
        ${addCustomBtn}
        <button id="pkgBarToggleBtn" onclick="pkgBarToggle()" title="View add-ons" style="background:${_pkgShowOpen?'#fef3c7':'#0e9494'};border:none;border-radius:7px;cursor:pointer;font-size:12px;font-weight:700;color:${_pkgShowOpen?'#92400e':'#fff'};padding:6px 12px;font-family:'Jost',sans-serif;white-space:nowrap">${_pkgShowOpen?'▴ Hide Add-ons':'+ Add-ons'}</button>
      </div>
      <div id="pkgBarBody" style="max-height:${_pkgShowOpen?'600px':'0'};overflow:${_pkgShowOpen?'visible':'hidden'}">
        <div class="pkg-chips">${ADD_ONS.filter(ao=>ao.price>0).map(ao=>{const on=selPkgs.includes(ao.id);const cp=customPrices[ao.id];const dispPrice=cp!=null?cp:ao.price;return`<button class="pkg-chip${on?' on':''}" onclick="togglePkg('${ao.id}')">${on?'<span class="pkg-check">✓</span>':''}${ao.name}<span class="pkg-price${cp!=null?' custom-price':''}">$${dispPrice}</span></button>`;}).join('')}${extraChips}${customAoChips}</div>
        ${addCustomForm}
        <div id="pkgPriceEditor" style="display:none"></div>
      </div>`;
    }
  }
  // Gitano dinner notice from teacher schedule
  const gitanoNotice=document.getElementById('regGitanoNotice');
  if(gitanoNotice){
    const isGitano=regSelBk.scheduleRequest?.offsiteChoice==='gitano';
    const offsiteNightNum=regSelBk.scheduleRequest?.offsiteNight;
    // Convert night number (e.g. "3") to actual ISO date
    const offsiteISODate=offsiteNightNum&&regSelBk.startDate
      ?fmtISO(new Date(pd(regSelBk.startDate).getTime()+(parseInt(offsiteNightNum)-1)*DAY_MS))
      :null;
    gitanoNotice.style.display=isGitano?'block':'none';
    if(isGitano){
      // Add to retreatActivities as optional (not prepaid) — does NOT go into packages
      if(offsiteISODate&&offsiteISODate!==regSelBk.startDate){
        if(!regSelBk.retreatActivities)regSelBk.retreatActivities=[];
        // Remove stale entries where date is a night-number instead of ISO date
        const before=regSelBk.retreatActivities.length;
        regSelBk.retreatActivities=regSelBk.retreatActivities.filter(a=>!(a.aoId==='ao13'&&!String(a.date).includes('-')));
        let changed=regSelBk.retreatActivities.length<before;
        const hasGitanoAct=regSelBk.retreatActivities.some(a=>a.aoId==='ao13');
        if(!hasGitanoAct){regSelBk.retreatActivities.push({aoId:'ao13',date:offsiteISODate,time:'19:30',prepaid:false});changed=true;}
        if(changed)saveAll();
      }
      gitanoNotice.innerHTML=`<div style="padding:10px 14px;background:#fef3c7;border:1.5px solid #f59e0b;border-radius:9px;font-size:12.5px;color:#92400e;display:flex;align-items:center;gap:10px"><span style="font-size:16px">🌮</span><span><b>Gitano Dinner Selected</b> by teacher${offsiteISODate?' for '+fmtDate(offsiteISODate):''} — $75/person + 15% tip + $15 transport. Shows as optional activity in the schedule.</span></div>`;
    }
  }
  const bal=grandTotal-totalPaid;

  document.getElementById('regStatsBar').style.display='flex';
  document.getElementById('rstatName').textContent=regSelBk.leaderName||regSelBk.retreatName;
  document.getElementById('rstatDates').textContent=`${fmtDate(regSelBk.startDate)} – ${fmtDate(regSelBk.endDate)} · ${nights} nights`;
  const tipEl=document.getElementById('rstatTip');if(tipEl)tipEl.value=getTip(regSelBk);
  const estPaxEl=document.getElementById('rstatPax');
  const bkPax=regSelBk.pax||0;
  const hasRoomsNow=(regSelBk.blockedRooms||[]).length>0;
  if(bkPax){
    const roomsNeeded=Math.ceil(bkPax/2);
    const assignedRooms=(regSelBk.blockedRooms||[]).length;
    const hint=!hasRoomsNow?`<span style="font-size:10px;color:#b45309;font-weight:600;background:#fef3c7;border-radius:4px;padding:1px 5px">~${roomsNeeded} rooms needed</span>`:`<span style="font-size:10px;color:#14532d;font-weight:600;background:#dcfce7;border-radius:4px;padding:1px 5px">${assignedRooms} assigned</span>`;
    estPaxEl.innerHTML=`<b>${bkPax}</b>${hint}`;
  }else{
    estPaxEl.innerHTML='<span style="color:var(--muted);font-size:12px">not set</span>';
  }
  document.getElementById('rstatGuests').textContent=totalGuests;
  document.getElementById('rstatTotal').textContent=fmt$(grandTotal);
  document.getElementById('rstatPaid').textContent=fmt$(totalPaid);
  const _balPos=bal>0,_balNeg=bal<0;
  const rstatBalEl=document.getElementById('rstatBal');
  rstatBalEl.textContent=_balPos?`BAL DUE ${fmt$(bal)}`:_balNeg?`CREDIT ${fmt$(Math.abs(bal))}`:'PAID ✓';
  rstatBalEl.className='rstat-pill';
  rstatBalEl.style.background=_balPos?'#fef2f2':_balNeg?'#fff7ed':'#f0fdf4';
  rstatBalEl.style.color=_balPos?'#dc2626':_balNeg?'#c2410c':'#16a34a';
  const rstatPkgWrap=document.getElementById('rstatPkgWrap');
  if(rstatPkgWrap){
    rstatPkgWrap.style.display=pkgBillTotal>0?'':'none';
    const rstatPkgEl=document.getElementById('rstatPkg');if(rstatPkgEl)rstatPkgEl.textContent=fmt$(pkgBillTotal);
  }
  const taxSel=document.getElementById('rstatTaxRate');if(taxSel)taxSel.value=String(getBkTaxRate(regSelBk));
  const rstatTrWrap=document.getElementById('rstatTransportWrap');
  if(rstatTrWrap){
    const _trFlags=regSelBk.flags||[];
    const _paysArr=_trFlags.includes('teacher_pays_arrival_transport');
    const _paysDep=_trFlags.includes('teacher_pays_departure_transport');
    const _arrInfo=_paysArr?_calcTransportTotal(regTransportRows,'arrival'):null;
    const _depInfo=_paysDep?_calcTransportTotal(regTransportRows,'departure'):null;
    const _trParts=[];
    if(_arrInfo)_trParts.push(`🛬 ${fmt$(_arrInfo.total)}${_arrInfo.exact?'':' est.'}`);
    if(_depInfo)_trParts.push(`🛫 ${fmt$(_depInfo.total)}${_depInfo.exact?'':' est.'}`);
    if(_trParts.length){rstatTrWrap.style.display='';document.getElementById('rstatTransport').textContent=_trParts.join(' · ');}
    else rstatTrWrap.style.display='none';
  }
  // Room-list completion — named/registered guests vs the retreat's expected
  // pax count. bkPax is the leader's original headcount estimate; without
  // it there's nothing to measure completion against.
  const rlStatusEl=document.getElementById('rstatRoomListStatus');
  if(rlStatusEl){
    rlStatusEl.className='rstat-pill';
    if(bkPax>0){
      const pct=Math.min(100,Math.round(totalGuests/bkPax*100));
      const complete=totalGuests>=bkPax;
      rlStatusEl.textContent=`${totalGuests}/${bkPax} roomed (${pct}%)`;
      rlStatusEl.style.background=complete?'#f0fdf4':totalGuests>0?'#fff7ed':'#fef2f2';
      rlStatusEl.style.color=complete?'#16a34a':totalGuests>0?'#c2410c':'#dc2626';
    }else{
      rlStatusEl.textContent=`${totalGuests} roomed`;
      rlStatusEl.style.background='#f0fdf4';
      rlStatusEl.style.color='#16a34a';
    }
  }

  const panel=document.getElementById('regPanel');
  panel.innerHTML='';

  // DISABLED 2026-09-06: auto-injects a new "Garden Basic" registration + blocks a room every
  // time this view loads, for any retreat whose real teacher registration isn't flagged
  // is_teacher_room=true (true for most retreats created via the current app, which doesn't
  // set that flag the same way) — was silently corrupting real bookings on every page view
  // (confirmed: created a comped-in-name-only phantom room that still billed at full rate,
  // since calcBD never checks reg.customPrice for teacher rooms). Needs a real fix before
  // re-enabling — do not just uncomment this.
  // autoAssignTeacherRoom(regSelBk);
  const blockedSet=new Set(regSelBk.blockedRooms||[]);
  // If a virtual-group parent room (rt8/rt9) is in blockedRooms, also add its sub-rooms so bd3/bd4 entries pass the filter
  AppData.roomTypes.forEach(vrt=>{if(!VIRTUAL_GROUP_RT_IDS.has(vrt.id))return;(vrt.rooms||[]).forEach(r=>{if(blockedSet.has(r))_getSharedBeds(r).forEach(s=>blockedSet.add(s));});});
  if(blockedSet.size===0){
    panel.innerHTML=`<div class="reg-empty" style="padding:60px 20px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:44px;height:44px;opacity:.3;margin:0 auto 12px;display:block"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <p style="font-size:14px;color:var(--muted)">No rooms blocked yet.</p>
      <p style="font-size:12.5px;color:#bbb;margin-top:6px">Click <b style="color:var(--teal)">Block Rooms</b> above to assign rooms to this retreat.</p>
    </div>`;
    return;
  }

  // Pre-compute global sequential indices across all room types
  const _allRtData=[];let _gSeqCtr=0;
  AppData.roomTypes.forEach(rt=>{
    if(VIRTUAL_GROUP_RT_IDS.has(rt.id))return; // skip virtual parents (rt8/rt9) — beds shown via bd3/bd4
    const ents=buildUiRoomEntries(rt).filter(e=>{
      if(!e.physical.some(p=>blockedSet.has(p)))return false;
      return true;
    });
    if(!ents.length)return;
    _allRtData.push({rt,withSeq:ents.map(e=>({entry:e,gSeq:++_gSeqCtr}))});
  });

  _allRtData.forEach(({rt,withSeq})=>{
    const uiEntries=withSeq.map(x=>x.entry);
    if(uiEntries.length===0)return;
    let occ=0;
    uiEntries.forEach(e=>{
      if(e.physical.some(p=>{const reg=getRegForRoom(regSelBk.id,p);return reg&&(reg.guests||[]).some(g=>g.name);}))occ++;
    });
    const badge=occ===uiEntries.length?'occ-full':occ>0?'occ-half':'occ-empty';
    const badgeText=occ===uiEntries.length?'Full':occ>0?`${occ}/${uiEntries.length}`:'Vacant';
    const card=document.createElement('div');card.className='rt-card';
    const _ls=isLowSeason(regSelBk?.startDate,nights);const _p1=_ls?(rt.price1_low||rt.price1):rt.price1;const _p2=_ls?(rt.price2_low||rt.price2):rt.price2;
    const priceTag=rt.maxOcc===1
      ?`Private: <b>${fmt$(_p1)}/night</b>`
      :`Solo: <b>${fmt$(_p1)}/night</b> &nbsp;·&nbsp; Sharing: <b>${fmt$(_p2)}/person/night</b>`;
    card.innerHTML=`
      <div class="rt-card-hdr">
        <div class="rt-card-dot" style="background:${rt.color}"></div>
        <span class="rt-card-name" ${IS_TEACHER_MODE?`onmouseenter="showRtTooltip(event,'${rt.id}')" onmouseleave="hideRtTooltip()" style="cursor:help"`:''}>${rt.name}</span>
        <span class="rt-card-occ">${rt.maxOcc===1?(/^Bed in a /i.test(rt.name)?'Shared room':'Private only'):`Up to ${rt.maxOcc} guests`} · ${nights} nights</span>
        <span class="occ-badge ${badge}" style="margin-left:4px">${badgeText}</span>
        <span class="rt-card-price">${priceTag} &nbsp;<span style="color:#aaa;font-size:10.5px">+16% tax +$30/night tip</span></span>
        <button class="rt-info-btn" onclick="showPriceTip(event,'${rt.id}')" title="View pricing breakdown">ℹ</button>
      </div>
      <table class="reg-table">
        <thead><tr>
          <th style="width:62px">#</th>
          <th style="width:38px"></th>
          <th style="width:24px"></th>
          <th>Guest</th>
          <th style="width:110px"></th>
          <th style="width:160px">Dates</th>
          <th style="text-align:right;width:100px">Price</th>
          <th style="min-width:180px">Notes</th>
          <th style="width:62px"></th>
        </tr></thead>
        <tbody id="rtb_${rt.id}"></tbody>
      </table>`;
    panel.appendChild(card);

    const tbody=document.getElementById('rtb_'+rt.id);
    const abbr=roomAbbrev(rt);
    withSeq.forEach(({entry,gSeq},roomIdx)=>{
      const room=entry.display;
      const roomRegs=entry.physical.map(p=>getRegForRoom(regSelBk.id,p)).filter(Boolean);
      const guests=roomRegs.flatMap(reg=>(reg.guests||[]).filter(g=>g.name).map(g=>({...g,_reg:reg,_physical:reg.room,_guestIdx:reg.guests.indexOf(g)})));
      const gc=Math.max(1,guests.length);
      const totalPrice=roomRegs.reduce((s,reg)=>{const gcn=(reg.guests||[]).filter(g=>g.name).length||1;return s+(reg.customPrice!=null?reg.customPrice:calcPrice(rt,gcn,nights,regSelBk.startDate,regSelBk,reg));},0);
      const perPrice=+(totalPrice/gc).toFixed(2);

      // Per-bed rendering for merged bd* entries: one row per physical bed
      if(isBedRoomType(rt)&&entry.merged){
        entry.physical.forEach((physRoom,pi)=>{
          const bedReg=getRegForRoom(regSelBk.id,physRoom);
          const bedG=(bedReg?.guests||[]).filter(g=>g.name);
          const g=bedG[0]||null;
          const tr=document.createElement('tr');
          tr.dataset.room=physRoom;tr.dataset.rtid=rt.id;
          tr.addEventListener('dragover',e=>{e.preventDefault();tr.classList.add('drag-over');});
          tr.addEventListener('dragleave',()=>tr.classList.remove('drag-over'));
          tr.addEventListener('drop',e=>{e.preventDefault();tr.classList.remove('drag-over');regMoveGuest(e.dataTransfer.getData('text/plain'),physRoom,rt.id);});
          if(g&&!_teacherLocked){
            tr.draggable=true;
            tr.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',bedReg.id);setTimeout(()=>tr.classList.add('dragging'),0);});
            tr.addEventListener('dragend',()=>tr.classList.remove('dragging'));
          }
          if(pi===0){
            const numTd=document.createElement('td');numTd.className='r-num';numTd.rowSpan=entry.physical.length;
            if(_hideRoomNums)numTd.innerHTML=`Room`;
            else numTd.innerHTML=`${room}`;
            if(!IS_TEACHER_MODE){
              entry.physical.forEach(p=>{
                const _pReg=getRegForRoom(regSelBk.id,p);
                const _pG=(_pReg?.guests||[]).filter(g=>g.name);
                if(_pG.length===1&&rt.id==='bd1'){
                  const _xBtn=document.createElement('button');
                  _xBtn.title=`Add extra guest to bed ${p}`;
                  _xBtn.style.cssText='display:block;margin:3px auto 0;font-size:10px;font-weight:700;color:#2d6a6a;background:none;border:1px dashed #2d6a6a;border-radius:4px;padding:1px 5px;cursor:pointer;line-height:1.4;white-space:nowrap;';
                  _xBtn.textContent='+1 '+p;
                  _xBtn.onclick=()=>gOpenAddExtraGuest(p,rt.id);
                  numTd.appendChild(_xBtn);
                }
              });
            }
            tr.appendChild(numTd);
          }
          const addTd=document.createElement('td');addTd.className='r-add';
          addTd.innerHTML=g
            ?`<button class="add-btn" onclick="gOpenEdit('${physRoom}','${rt.id}')" title="Edit guest">+</button>`
            :`<button class="add-btn" onclick="gOpenAdd('${physRoom}','${rt.id}')" title="Add guest">+</button>`;
          tr.appendChild(addTd);
          if(!g){
            const vacTd=document.createElement('td');vacTd.colSpan=4;vacTd.className='r-vacant';
            vacTd.textContent='Vacant — click + to add guest';tr.appendChild(vacTd);
            const _vBd=calcBD(rt,1,nights,regSelBk.startDate,regSelBk);
            const vacPriceTd=document.createElement('td');vacPriceTd.className='r-price';
            vacPriceTd.style.cssText='text-align:right;color:#aaa;font-size:12px;';
            vacPriceTd.innerHTML=`${fmt$(_vBd.total)}<span style="font-size:10px;margin-left:2px">/solo</span>`;
            tr.appendChild(vacPriceTd);
            const vacNotesTd=document.createElement('td');vacNotesTd.className='r-notes';tr.appendChild(vacNotesTd);
            const actTd=document.createElement('td');actTd.className='r-action';tr.appendChild(actTd);
          }else{
            if(bedReg?.isTeacherRoom)tr.classList.add('r-teacher-row');
            const dragTd=document.createElement('td');dragTd.className='r-drag';
            dragTd.innerHTML='<span class="drag-handle">&#8801;</span>';tr.appendChild(dragTd);
            const g2=bedG[1]||null;
            const nameTd=document.createElement('td');nameTd.className='r-guest';
            const _bdTeacherStar=bedReg?.isTeacherRoom?`<span style="color:#b45309;font-size:13px;margin-right:4px" title="Teacher Room">★</span>`:'';
            const _bdTeacherStyle=bedReg?.isTeacherRoom?'color:#92400e;font-weight:700;':'';
            nameTd.innerHTML=`<div class="r-gname" style="${_bdTeacherStyle}cursor:pointer" title="Click to open ${escHtml(g.name)}'s folio" onclick="event.stopPropagation();openGuestFolio('${bedReg.id}',0)">${_bdTeacherStar}${g.name}</div>${g2?`<div class="r-gname" style="font-size:11px;color:#6b7280;font-weight:400;cursor:pointer" title="Click to open ${escHtml(g2.name)}'s folio" onclick="event.stopPropagation();openGuestFolio('${bedReg.id}',1)">+ ${g2.name}</div>`:''}`;tr.appendChild(nameTd);
            const retTd=document.createElement('td');retTd.style.cssText='white-space:nowrap;padding:0 8px;';
            const isRet=g.returning||false;const yrs=g.yearsAttending||'';
            retTd.innerHTML=`<button class="ret-toggle${isRet?' ret-on':''}" onclick="regToggleReturning('${bedReg.id}',0)">${isRet?'↩ Returning':'✦ New'}</button>${isRet?`<input class="ret-years" type="number" min="1" max="30" value="${yrs}" placeholder="yrs" title="Years attending" onchange="regSaveYears('${bedReg.id}',0,this.value)">`:''}`;
            tr.appendChild(retTd);
            const _bdEffCI=bedReg?.checkIn||regSelBk.startDate;const _bdEffCO=bedReg?.checkOut||regSelBk.endDate;
            const _bdNights=Math.max(1,Math.round((pd(_bdEffCO)-pd(_bdEffCI))/DAY_MS));
            const datesTd=document.createElement('td');datesTd.className='r-dates';
            datesTd.textContent=`${fmtDate(_bdEffCI)} – ${fmtDate(_bdEffCO)}`;tr.appendChild(datesTd);
            const priceTd=document.createElement('td');priceTd.className='r-price';
            priceTd.style.cssText='text-align:right;vertical-align:top;padding:10px 12px;min-width:160px;width:160px;';
            const _bdGc=bedG.length||1;
            const _bdSibHasExtra=rt.id==='bd1'&&_bdGc<2&&_getSharedBeds(physRoom).some(s=>(getRegForRoom(regSelBk.id,s)?.guests||[]).filter(g=>g.name).length>=2);
            const _bdExtraRate=(rt.id==='bd1'&&(_bdGc>=2||_bdSibHasExtra)&&bedReg?.customRateOverride==null)?(isLowSeason(_bdEffCI||regSelBk?.startDate,_bdNights)?BD1_EXTRA_RATE_LOW:BD1_EXTRA_RATE_HIGH):null;
            const _bdRegCalc=_bdExtraRate!=null?{...bedReg,customRateOverride:_bdExtraRate}:bedReg;
            const bd1=calcBD(rt,_bdGc,_bdNights,_bdEffCI,regSelBk,_bdRegCalc);
            const nRate1=_bdExtraRate!=null?_bdExtraRate:(bedReg?.customRateOverride!=null?bedReg.customRateOverride:getRoomRate(rt,_bdGc,_bdEffCI,_bdNights));
            const pkgLine1=bd1.pkg>0?`<div class="pb-row addon"><span>Add-ons</span><span>${fmt$(bd1.pkg)}</span></div>`:'';
            const rateCell1=IS_TEACHER_MODE?`$${nRate1}`:`$<input type="number" class="rate-inline-input" value="${nRate1}" title="Override nightly rate" onclick="event.stopPropagation()" onchange="regSaveRateOverride('${bedReg.id}',this.value)" style="width:46px;padding:0 3px;border:1px solid var(--border);border-radius:3px;font-size:11px;text-align:right;font-family:inherit;">`;
            priceTd.innerHTML=`<details class="price-details"><summary><span class="price-summary-total">${fmt$(bd1.total)}</span><span class="price-toggle-arrow">&#9658;</span></summary><div class="price-breakdown-rows"><div class="pb-row"><span>Room (${rateCell1}/nt)</span><span>${fmt$(bd1.base)}</span></div>${pkgLine1}<div class="pb-row"><span>Tax (16%)</span><span>${fmt$(bd1.tax)}</span></div><div class="pb-row"><span>Tip ($30×${_bdNights}nt)</span><span>${fmt$(bd1.dip)}</span></div></div></details>`;
            tr.appendChild(priceTd);
            const notesTd=document.createElement('td');notesTd.className='r-notes';
            const _bdRoomNoteHtml=bedReg?.notes?`<div style="font-size:9px;color:#b45309;font-style:italic;line-height:1.3;margin-bottom:2px">${bedReg.notes.replace(/</g,'&lt;')}</div>`:'';
            notesTd.innerHTML=`${_bdRoomNoteHtml}<input class="r-notes-input" value="${(g.notes||'').replace(/"/g,'&quot;')}" placeholder="Add note…" onchange="regSaveGuestNote('${bedReg.id}',0,this.value)">`;
            tr.appendChild(notesTd);
            const actionTd=document.createElement('td');actionTd.className='r-action';
            actionTd.innerHTML=`<button class="edit-btn" onclick="gOpenEdit('${physRoom}','${rt.id}')">Edit</button>`;
            tr.appendChild(actionTd);
          }
          tbody.appendChild(tr);
        });
        return;
      }

      if(!guests.length){
        const vReg=getRegForRoom(regSelBk.id,room);
        const tr=document.createElement('tr');
        tr.dataset.room=room;tr.dataset.rtid=rt.id;
        tr.addEventListener('dragover',e=>{e.preventDefault();tr.classList.add('drag-over');});
        tr.addEventListener('dragleave',()=>tr.classList.remove('drag-over'));
        tr.addEventListener('drop',e=>{e.preventDefault();tr.classList.remove('drag-over');regMoveGuest(e.dataTransfer.getData('text/plain'),room,rt.id);});
        const sub=entry.merged?` <span style="font-size:10px;color:#8a7e74">(${entry.physical.join(' · ')})</span>`:'';
        const numLblV=_hideRoomNums?`Room`:`${room}`;
        const _vNoteHtml=vReg?.notes?`<div style="font-size:9px;color:#b45309;font-style:italic;line-height:1.3">${(vReg.notes).replace(/</g,'&lt;')}</div>`:'';
        const _vBd2=calcBD(rt,1,nights,regSelBk.startDate,regSelBk);
        tr.innerHTML=`<td class="r-num">${numLblV}</td><td class="r-add"><button class="add-btn" onclick="gOpenAdd('${room}','${rt.id}')" title="Add guest">+</button></td><td colspan="4" class="r-vacant">Vacant — click + to add guest${sub}</td><td class="r-price" style="text-align:right;color:#aaa;font-size:12px">${fmt$(_vBd2.total)}<span style="font-size:10px;margin-left:2px">/solo</span></td><td class="r-notes">${_vNoteHtml}</td><td class="r-action"></td>`;
        tbody.appendChild(tr);
        return;
      }

      guests.forEach((g,gi)=>{
        const reg=g._reg;
        const tr=document.createElement('tr');
        tr.dataset.room=room;tr.dataset.rtid=rt.id;
        if(!_teacherLocked)tr.draggable=true;
        tr.addEventListener('dragover',e=>{e.preventDefault();tr.classList.add('drag-over');});
        tr.addEventListener('dragleave',()=>tr.classList.remove('drag-over'));
        tr.addEventListener('drop',e=>{e.preventDefault();tr.classList.remove('drag-over');regMoveGuest(e.dataTransfer.getData('text/plain'),room,rt.id);});
        if(!_teacherLocked){
          tr.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',reg.id);setTimeout(()=>tr.classList.add('dragging'),0);});
          tr.addEventListener('dragend',()=>tr.classList.remove('dragging'));
        }

        if(gi===0){
          const numTd=document.createElement('td');
          numTd.className='r-num';numTd.rowSpan=guests.length;
          if(_hideRoomNums){numTd.innerHTML=`Room`;}
          else{numTd.innerHTML=`${room}`;}
          tr.appendChild(numTd);
          const addTd=document.createElement('td');
          addTd.className='r-add';addTd.rowSpan=guests.length;
          addTd.innerHTML=`<button class="add-btn" onclick="gOpenEdit('${guests[0]._physical||room}','${rt.id}')" title="Edit / add guest">+</button>`;
          tr.appendChild(addTd);
        }

        const dragTd=document.createElement('td');
        dragTd.className='r-drag';dragTd.innerHTML='<span class="drag-handle">&#8801;</span>';
        tr.appendChild(dragTd);

        if(reg.isTeacherRoom)tr.classList.add('r-teacher-row');
        const nameTd=document.createElement('td');
        nameTd.className='r-guest';
        const _teacherStar=reg.isTeacherRoom?`<span style="color:#b45309;font-size:13px;margin-right:4px" title="Teacher Room">★</span>`:'';
        const _teacherStyle=reg.isTeacherRoom?'color:#92400e;font-weight:700;':'';
        nameTd.innerHTML=`<div class="r-gname" style="${_teacherStyle}cursor:pointer" title="Click to open ${escHtml(g.name)}'s folio" onclick="event.stopPropagation();openGuestFolio('${g._reg.id}',${g._guestIdx})">${_teacherStar}${g.name}${entry.merged&&entry.physical.length>1?` <span style="font-size:10px;color:#8a7e74">(${g._physical})</span>`:''}</div>`;
        tr.appendChild(nameTd);

        const retTd=document.createElement('td');
        retTd.style.cssText='white-space:nowrap;padding:0 8px;';
        const isRet=g.returning||false;
        const yrs=g.yearsAttending||'';
        retTd.innerHTML=`<button class="ret-toggle${isRet?' ret-on':''}" onclick="regToggleReturning('${reg.id}',${gi})">${isRet?'↩ Returning':'✦ New'}</button>${isRet?`<input class="ret-years" type="number" min="1" max="30" value="${yrs}" placeholder="yrs" title="Years attending" onchange="regSaveYears('${reg.id}',${gi},this.value)">`:''}`;
        tr.appendChild(retTd);

        const _effCI=reg.checkIn||regSelBk.startDate;const _effCO=reg.checkOut||regSelBk.endDate;
        const _regNights=Math.max(1,Math.round((pd(_effCO)-pd(_effCI))/DAY_MS));
        const datesTd=document.createElement('td');
        datesTd.className='r-dates';
        datesTd.textContent=`${fmtDate(_effCI)} – ${fmtDate(_effCO)}`;
        tr.appendChild(datesTd);

        const priceTd=document.createElement('td');
        priceTd.className='r-price';
        priceTd.style.cssText='text-align:right;vertical-align:top;padding:10px 12px;min-width:160px;width:160px;';
        if(reg.customPrice!=null&&!reg.isTeacherRoom){
          const perCustom=+(reg.customPrice/gc).toFixed(2);
          priceTd.innerHTML=`<div style="font-weight:700;font-size:13px;color:var(--dark)">${fmt$(perCustom)}</div><div style="font-size:10.5px;color:#8a7e74;margin-top:2px">custom price${gc>1?' (per person)':''}</div>`;
        } else {
          const bd=calcBD(rt,gc,_regNights,_effCI,regSelBk,reg);
          const nRate=reg.customRateOverride!=null?reg.customRateOverride:getRoomRate(rt,gc,_effCI,_regNights);
          const pkgItems=calcPkgItems(regSelBk);
          const pkgLine=bd.pkg>0?`<div class="pb-row addon"><span>Add-ons (${pkgItems.map(p=>p.name).join(', ')})</span><span>${fmt$(+(bd.pkg/gc).toFixed(2))}</span></div>`:'';
          const perTotal=+(bd.total/gc).toFixed(2);
          const perBase=+(bd.base/gc).toFixed(2);
          const perTax=+(bd.tax/gc).toFixed(2);
          const perTip=+(bd.dip/gc).toFixed(2);
          const rateCell=IS_TEACHER_MODE?`$${nRate}`:`$<input type="number" class="rate-inline-input" value="${nRate}" title="Override nightly rate" onclick="event.stopPropagation()" onchange="regSaveRateOverride('${reg.id}',this.value)" style="width:46px;padding:0 3px;border:1px solid var(--border);border-radius:3px;font-size:11px;text-align:right;font-family:inherit;">`;
          priceTd.innerHTML=`<details class="price-details">
            <summary><span class="price-summary-total">${fmt$(perTotal)}</span>${gc>1?`<span style="font-size:10px;color:#9ca3af;margin-left:4px">/person</span>`:''}<span class="price-toggle-arrow">&#9658;</span></summary>
            <div class="price-breakdown-rows">
              <div class="pb-row"><span>Room (${rateCell}/nt)</span><span>${fmt$(perBase)}</span></div>
              ${pkgLine}
              <div class="pb-row"><span>Tax (${bd.pkg>0&&getBkTaxRate(regSelBk)!==0.16?`16% rm / ${getBkTaxRate(regSelBk)===0?'0%':Math.round(getBkTaxRate(regSelBk)*100)+'%'} ext`:'16%'})</span><span>${fmt$(perTax)}</span></div>
              <div class="pb-row"><span>Tip ($30×${_regNights}nt)</span><span>${fmt$(perTip)}</span></div>
            </div>
          </details>`;
        }
        tr.appendChild(priceTd);

        const notesTd=document.createElement('td');
        notesTd.className='r-notes';
        const _roomNoteHtml=reg?.notes?`<div style="font-size:9px;color:#b45309;font-style:italic;line-height:1.3;margin-bottom:2px">${reg.notes.replace(/</g,'&lt;')}</div>`:'';
        notesTd.innerHTML=`${_roomNoteHtml}<input class="r-notes-input" value="${(g.notes||'').replace(/"/g,'&quot;')}" placeholder="Add note…" onchange="regSaveGuestNote('${reg.id}',${gi},this.value)">`;
        tr.appendChild(notesTd);

        const actionTd=document.createElement('td');
        actionTd.className='r-action';
        if(gi===0){actionTd.innerHTML=`<button class="edit-btn" onclick="gOpenEdit('${g._physical}','${rt.id}')">Edit</button>`;}
        tr.appendChild(actionTd);

        tbody.appendChild(tr);
      });
    });
  });
  // Est. Quote panel (pricing.js) only recomputes when opened/closed — if it's
  // already open while a tip/room/guest edit happens here, it goes stale and
  // shows pre-edit numbers (e.g. old tip rate), making its total look wrong
  // vs. the just-updated Bill Total above. Keep it live.
  if(typeof estQuoteOpen!=='undefined'&&estQuoteOpen)renderEstQuote();
  // Keep the Actions ▾ menu's lock label / room-list label in sync — regRender() runs
  // after almost every edit (e.g. toggleRetreatLock()), but _updateRegButtons() (which
  // builds this menu) only runs when the retreat is first selected.
  if(typeof regBuildActionsMenu==='function')regBuildActionsMenu(regSelBk);
}

function regSaveNote(regId,val){const r=AppData.regs.find(x=>x.id===regId);if(r){r.notes=val;r.updatedAt=new Date().toISOString();saveAll();syncNotesToCloudbeds(r);}}
async function regSetTip(val){
  if(!regSelBk)return;
  const t=parseFloat(val);
  regSelBk.tipPerNight=(isNaN(t)||t<0)?0:t;
  saveAll(); // fire-and-forget bulk sync, as usual — kept for every other field
  regRender();
  // saveAll()'s bulk sync doesn't await Supabase before returning, so a refresh
  // moments after editing could beat it there and load the old value back in —
  // write this specific field directly and immediately so it's durable right away.
  try{await db.from('bookings').update({tip_per_night:regSelBk.tipPerNight}).eq('id',regSelBk.id);}catch(e){}
  showToast(`Tip updated to $${regSelBk.tipPerNight}/person/night`);
}
function regSaveGuestNote(regId,guestIdx,val){const r=AppData.regs.find(x=>x.id===regId);if(r&&r.guests&&r.guests[guestIdx]){r.guests[guestIdx].notes=val;r.updatedAt=new Date().toISOString();saveAll();syncNotesToCloudbeds(r);}}

// Inline nightly-rate edit directly from the room list price breakdown (e.g. a teacher
// upgrades rooms but keeps their original rate) — same reg.customRateOverride field the
// full guest-edit modal's rate override uses, just editable without opening that modal.
function regSaveRateOverride(regId,val){
  if(IS_TEACHER_MODE)return;
  const r=AppData.regs.find(x=>x.id===regId);if(!r)return;
  const parsed=parseFloat(val);
  r.customRateOverride=(val!==''&&!isNaN(parsed))?parsed:null;
  r.updatedAt=new Date().toISOString();
  saveAll();regRender();buildDashboard();
}

function regToggleReturning(regId,guestIdx){const r=AppData.regs.find(x=>x.id===regId);if(r&&r.guests&&r.guests[guestIdx]){r.guests[guestIdx].returning=!r.guests[guestIdx].returning;if(!r.guests[guestIdx].returning)r.guests[guestIdx].yearsAttending=null;r.updatedAt=new Date().toISOString();saveAll();regRender();buildDashboard();}}
function regSaveYears(regId,guestIdx,val){const r=AppData.regs.find(x=>x.id===regId);if(r&&r.guests&&r.guests[guestIdx]){r.guests[guestIdx].yearsAttending=parseInt(val)||null;r.updatedAt=new Date().toISOString();saveAll();buildDashboard();}}

function regMoveGuest(regId,targetRoom,targetRtId){
  if(IS_TEACHER_MODE&&regSelBk?.allLocked){showToast('El retiro está bloqueado por el admin.');return;}
  const reg=AppData.regs.find(r=>r.id===regId);
  const physicalTarget=resolvePhysicalRoomForGuest(reg.bookingId,targetRoom,targetRtId);
  if(!reg||reg.room===physicalTarget)return;
  if(reg.locked){showToast('This room is locked — unlock it first.');return;}
  const existing=getRegForRoom(reg.bookingId,physicalTarget);
  if(existing&&existing.locked){showToast(`Room ${targetRoom} is locked — unlock it first.`);return;}
  const bk=AppData.bookings.find(b=>b.id===reg.bookingId);
  const guestNames=(reg.guests||[]).filter(g=>g.name).map(g=>g.name).join(' & ')||'';
  const fromRoom=reg.room;
  const _moveTs=new Date().toISOString();
  if(existing){
    const existingNames=(existing.guests||[]).filter(g=>g.name).map(g=>g.name).join(' & ')||'a guest';
    if(!confirm(`Room ${physicalTarget} already has ${existingNames}. Swap with room ${reg.room}?`))return;
    const oldRoom=reg.room,oldRtId=reg.roomTypeId;
    existing.room=oldRoom;existing.roomTypeId=oldRtId;existing.customPrice=null;existing.updatedAt=_moveTs;
  }
  reg.room=physicalTarget;reg.roomTypeId=targetRtId;reg.customPrice=null;reg.updatedAt=_moveTs;
  saveAll();regRender();
  logActivity('Room moved',`${bk?.leaderName||bk?.retreatName} — ${guestNames||'guest'}: Room ${fromRoom} → ${physicalTarget}`,reg.bookingId);
  showToast(`Moved to room ${targetRoom} — syncing with Cloudbeds…`);

  // ── Cloudbeds sync ───────────────────────────────────────────────────────────
  // Each physical room has a permanent Cloudbeds reservation from the block.
  // Moving a guest = update the guest name on each room's existing reservation:
  //   destination room → set to moved guest's name
  //   source room      → revert to group placeholder (or swap guest's name)
  // cbReservationIds never change — they stay tied to physical rooms.
  if(bk){
    const cbResIds  =bk.cbReservationIds||{};
    const cbAdjIds  =bk.cbAdjustmentIds||{};
    const cbNoteIds =bk.cbNoteIds||{};

    const _cbName=async(cbResId,room,guestName,adults,adjId)=>{
      if(!cbResId)return null;
      const r=await fetch(`${CLOUDBEDS_PROXY}?action=updateReservationGuest`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          reservationId:cbResId,
          roomName:room,
          guestFirstName:guestName||'',
          groupName:bk.groupName||bk.retreatName||bk.leaderName||'',
          leaderName:bk.leaderName||'',
          adults,
          startDate:bk.startDate,
          endDate:bk.endDate,
          adjustmentId:adjId||null,
        })
      });
      return r.json();
    };

    // Names and adult counts after the move (reg/existing already updated in portal)
    const movedName  =(reg.guests||[]).find(g=>g.name)?.name||'';
    const movedAdults=Math.max(1,(reg.guests||[]).filter(g=>g.name).length);
    const swapName   =existing?((existing.guests||[]).find(g=>g.name)?.name||''):'';
    const swapAdults =existing?Math.max(1,(existing.guests||[]).filter(g=>g.name).length):1;

    console.log('[CB move] from:',fromRoom,'→ to:',physicalTarget,'movedName:',movedName,'swapName:',swapName);
    console.log('[CB move] cbResIds:',JSON.stringify(cbResIds));
    const tasks=[];
    // Destination room: set to moved guest (or swapped guest's name)
    if(cbResIds[physicalTarget])
      tasks.push({room:physicalTarget,
        p:_cbName(cbResIds[physicalTarget],physicalTarget,movedName,movedAdults,cbAdjIds[physicalTarget]||null)});
    else console.warn('[CB move] no cbResId for destination room:',physicalTarget);
    // Source room: revert to group placeholder, or set to swapped guest
    if(cbResIds[fromRoom])
      tasks.push({room:fromRoom,
        p:_cbName(cbResIds[fromRoom],fromRoom,swapName,swapAdults,cbAdjIds[fromRoom]||null)});
    else console.warn('[CB move] no cbResId for source room:',fromRoom);
    console.log('[CB move] tasks:',tasks.length,'rooms:',tasks.map(t=>t.room));

    Promise.all(tasks.map(t=>t.p)).then(results=>{
      if(!bk.cbAdjustmentIds)bk.cbAdjustmentIds={};
      results.forEach((res,i)=>{
        if(!res)return;
        const room=tasks[i].room;
        if(res.adultsUpdate){
          if(res.adjustmentId)bk.cbAdjustmentIds[room]=res.adjustmentId;
          else delete bk.cbAdjustmentIds[room];
        }
      });
      saveAll();
      const ok=results.every(r=>!r||r.updated!==false);
      if(ok)showToast(`Cloudbeds: nombre actualizado en cuarto ${targetRoom}`);
      else{showToast('Movido localmente — revisa Cloudbeds si el nombre no cambió.');console.warn('[CB move]',results);}
    }).catch(e=>{
      console.warn('[CB move]',e);
      showToast('Movido localmente — error al sincronizar con Cloudbeds.');
    });
  }
}



// ===== REGISTERED COUNT =====
function registeredCount(bkId){
  return AppData.regs.filter(r=>r.bookingId===bkId&&!r.isTeacherRoom).reduce((s,r)=>s+new Set((r.guests||[]).filter(g=>g.name).map(g=>g.name.trim())).size,0);
}


// ===== FEMALE NAME DETECTION =====
const FEMALE_NAMES=new Set(['emma','olivia','ava','isabella','sophia','mia','charlotte','amelia','harper','evelyn','abigail','emily','elizabeth','mila','ella','avery','sofia','camila','aria','scarlett','victoria','madison','luna','grace','chloe','penelope','layla','riley','zoey','nora','lily','eleanor','hannah','lillian','addison','aubrey','ellie','stella','natalie','zoe','leah','hazel','violet','aurora','savannah','audrey','brooklyn','bella','claire','skylar','lucy','paisley','everly','anna','caroline','nova','emilia','kennedy','samantha','maya','willow','kinsley','naomi','aaliyah','elena','sarah','ariana','allison','gabriella','alice','madelyn','cora','ruby','eva','serenity','autumn','adeline','hailey','gianna','valentina','isla','eliana','quinn','nevaeh','ivy','sadie','piper','lydia','alexa','josephine','emery','julia','delilah','arianna','vivian','kaylee','sophie','brielle','isabelle','jocelyn','natalia','jasmine','mariana','molly','diana','reagan','ashley','katelyn','megan','brittany','jessica','jennifer','amanda','melissa','laura','rachel','stephanie','kayla','amber','heather','natasha','tanya','tamara','wendy','donna','linda','lisa','barbara','maria','karen','patricia','nancy','betty','helen','sandra','carol','sharon','ruth','diane','angela','frances','margaret','virginia','kathleen','amy','pamela','martha','debra','paula','ann','jean','rosa','beverly','gloria','theresa','sara','janice','marie','marilyn','crystal','denise','janet','robin','kelly','tiffany','dawn','cynthia','cheryl','michelle','andrea','tammy','kimberly','nikki','brooke','courtney','danielle','alyssa','vanessa','alicia','jenna','sierra','kristen','paige','alexis','sydney','marissa','taylor','morgan','brianna','tara','valerie','melanie','miranda','monique','sheila','gina','connie','christy','lori','tracy','stacy','penny','sherry','joan','teresa','deborah','peggy','carrie','holly','lorraine','yvonne','leanne','alison','gillian','fiona','kate','katie','nadia','irina','tatiana','svetlana','olga','vera','nina','daria','oksana','fatima','aisha','zainab','mariam','hana','leila','rania','lina','yasmin','amira','zahra','salma','dina','rana','yara','lara','valentina','camila','catalina','lucia','paola','daniela','alejandra','gabriela','fernanda','monica','leticia','silvia','adriana','veronica','norma','esmeralda','xiomara','yolanda','blanca','renee','denise','jacqueline','marie','diane','carolyn','sandra','robin','lisa','patricia','linda','barbara','helen','sharon','ruth','mary','elizabeth','beverly','frances','virginia','margaret','nancy','betty','alice','jean','bonnie','cheryl','tina','dawn','melinda','stacey','bethany','brittni','lacey','courtney','shelby','haley','destiny','alexia','caitlin','meghan','erin','jamie','alyson','kelsie','joanna','julianna','serena','ingrid','astrid','freya','sigrid','helga','maja','nina','kirsten','annika','britta','solveig','dagmar','elise','britt','agneta','cecilia','petra','monika','karin','margareta','katarina','birgitta','annette','marlene','brigitte','manuela','gabriele','sabine','ursula','claudia','hannelore','hildegard','inge','waltraud','elfriede','erika','gerda','hilde','ilse','ingeborg','irene','isolde','johanna','lieselotte','lotte','luise','margot','ottilie','renate','rosemarie','ruth','trudi','wilhelmine']);
function likelyFemale(fullName){
  if(!fullName)return false;
  const first=fullName.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g,'');
  if(!first||first.length<2)return false;
  if(FEMALE_NAMES.has(first))return true;
  // Common female name endings (conservative to avoid false positives on male names)
  if(/(?:ella|belle|ette|enne|ine|lyn|lynn|zie|alie|sia|lia|nia|mia|ria|via|pia|tia|gia|fia|dia|bia|xia|kia|eia|oia|uia|lea|nea|bea|dea|kea|rea|sea|tea|vea)$/.test(first))return true;
  if(/(?:essa|issa|assa|ossa|assa|issa|essa)$/.test(first))return true;
  return false;
}


// ===== AUTO FLAGS =====
function getAutoFlags(bk){
  const flags=[];
  const today=new Date();today.setHours(0,0,0,0);
  const startDate=pd(bk.startDate);
  const daysUntil=Math.floor((startDate-today)/DAY_MS);
  const blockedSet=new Set(bk.blockedRooms||[]);
  if(blockedSet.size===0)return flags;
  const acks=getIssueAcks();

  // Unpartnered guest: within 8 weeks of start
  // Only applies to true multi-bed shared rooms (unrelated guests paired as roommates).
  // King-bed room types (Beachfront King, Superior, Garden Plus, Garden, Shanti King) have
  // maxOcc:2 for couples, but a lone guest there is normal and should NOT be flagged.
  if(daysUntil<=56){
    AppData.roomTypes.forEach(rt=>{
      if(rt.maxOcc<2||!SHARED_ROOM_TYPE_IDS.has(rt.id))return;
      rt.rooms.filter(r=>blockedSet.has(r)).forEach(room=>{
        const reg=getRegForRoom(bk.id,room);
        if(reg){
          const gc=(reg.guests||[]).filter(g=>g.name).length;
          if(gc===1)flags.push({type:'unpartnered',severity:'red',key:`unpartnered_${room}`,message:`Room ${room} (${rt.name}) has 1 guest in a shared room — needs roommate or reassignment`});
        }
      });
    });
  }

  // Two apparent females sharing a king bed
  AppData.roomTypes.filter(rt=>rt.name.toLowerCase().includes('king')).forEach(rt=>{
    rt.rooms.filter(r=>blockedSet.has(r)).forEach(room=>{
      const key=`king_females_${room}`;
      const ack=acks[bk.id+'__'+key];
      if(ack&&(ack.status==='couple'||ack.status==='done'))return; // dismissed
      const reg=getRegForRoom(bk.id,room);
      if(!reg)return;
      const namedGuests=(reg.guests||[]).filter(g=>g.name);
      if(namedGuests.length!==2)return;
      if(namedGuests.every(g=>likelyFemale(g.name))){
        flags.push({type:'king_two_females',severity:'orange',key,
          message:`Room ${room} (${rt.name}): ${namedGuests.map(g=>g.name).join(' & ')} — 2 women sharing a king bed`});
      }
    });
  });

  // Sold out room types
  AppData.roomTypes.forEach(rt=>{
    const blocked=rt.rooms.filter(r=>blockedSet.has(r));
    if(!blocked.length)return;
    const filled=blocked.filter(room=>getRegForRoom(bk.id,room));
    if(filled.length===blocked.length)flags.push({type:'sold_out',severity:'orange',key:`sold_out_${rt.id}`,message:`${rt.name} — all ${blocked.length} blocked room${blocked.length>1?'s are':' is'} filled (sold out)`});
  });

  return flags;
}


// ===== FLAGS MODAL =====
let flagsBkId=null;
function openFlagsModal(bkId){
  flagsBkId=bkId;
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  document.getElementById('flagsModalSub').textContent=`${bk.leaderName||bk.retreatName} · ${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}`;
  renderFlagsModal(bk);
  openModal('flagsModal');
}

function getIssueAcks(){return JSON.parse(localStorage.getItem('amansala_issue_acks')||'{}');}
function saveIssueAcks(acks){localStorage.setItem('amansala_issue_acks',JSON.stringify(acks));}
function ackIssue(bkId,key,status){
  const acks=getIssueAcks();
  const ak=acks[bkId+'__'+key]||{};
  ak.status=status;ak.date=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  if(!ak.note)ak.note='';
  acks[bkId+'__'+key]=ak;saveIssueAcks(acks);
  const bk=AppData.bookings.find(b=>b.id===bkId);if(bk)renderFlagsModal(bk);
}
function clearIssueAck(bkId,key){
  const acks=getIssueAcks();delete acks[bkId+'__'+key];saveIssueAcks(acks);
  const bk=AppData.bookings.find(b=>b.id===bkId);if(bk)renderFlagsModal(bk);
}
function saveIssueNote(bkId,key){
  const el=document.getElementById('iack_note_'+bkId+'__'+key);if(!el)return;
  const acks=getIssueAcks();
  const ak=acks[bkId+'__'+key]||{};ak.note=el.value.trim();acks[bkId+'__'+key]=ak;saveIssueAcks(acks);
  showToast('Note saved');
}
function toggleIssueDetail(id){
  const el=document.getElementById('idet_'+id);if(!el)return;
  el.style.display=el.style.display==='none'?'block':'none';
}

function renderFlagsModal(bk){
  const autoFlags=getAutoFlags(bk);
  const manualFlags=bk.flags||[];
  const acks=getIssueAcks();

  // Auto flags section
  let autoHtml='';
  if(autoFlags.length){
    autoHtml+=`<div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#dc2626;margin-bottom:8px">Auto-Detected Issues</div>`;
    autoFlags.forEach(f=>{
      const col=f.severity==='red'?'#fee2e2':'#fff7ed';
      const border=f.severity==='red'?'#fca5a5':'#fed7aa';
      const dotClr=f.severity==='red'?'#dc2626':'#f97316';
      const ackId=bk.id+'__'+f.key;
      const ack=acks[ackId];
      const statusBadge=ack?(ack.status==='couple'
        ?`<span style="background:#fdf4ff;border:1px solid #e9d5ff;color:#7e22ce;border-radius:99px;font-size:10px;font-weight:700;padding:2px 9px;flex-shrink:0">♥ Couple confirmed</span>`
        :ack.status==='done'
        ?`<span style="background:#f0fdf4;border:1px solid #86efac;color:#15803d;border-radius:99px;font-size:10px;font-weight:700;padding:2px 9px;flex-shrink:0">✓ Done</span>`
        :`<span style="background:#f8fafc;border:1px solid #cbd5e1;color:#64748b;border-radius:99px;font-size:10px;font-weight:700;padding:2px 9px;flex-shrink:0">~ Recognized</span>`):'';
      const meta=f.type==='unpartnered'?'Action needed: find roommate, reassign, or add another guest'
        :f.type==='king_two_females'?'Confirm if they are a couple sharing the bed — or reassign to a double room'
        :'Info: category fully booked';
      const coupleBtn=f.type==='king_two_females'?`<button class="btn btn-secondary btn-sm" style="${ack&&ack.status==='couple'?'background:#fdf4ff;border-color:#e9d5ff;color:#7e22ce;':''}" onclick="ackIssue('${bk.id}','${f.key}','couple')">♥ Confirmed Couple</button>`:'';
      autoHtml+=`<div class="flag-item flag-open" style="background:${col};border-color:${border};cursor:pointer;flex-direction:column;padding:0" onclick="toggleIssueDetail('${ackId}')">
        <div style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;width:100%;box-sizing:border-box">
          <div class="flag-dot" style="background:${dotClr};margin-top:4px;flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <div class="flag-msg" style="flex:1">🚩 ${f.message}</div>
              ${statusBadge}
              <span style="font-size:11px;color:${dotClr};font-weight:600;flex-shrink:0">▾</span>
            </div>
            <div class="flag-meta" style="margin-top:2px">${meta}${ack&&ack.date?` · ${ack.status==='couple'?'Couple confirmed':ack.status==='done'?'Done':'Recognized'} ${ack.date}`:''}${ack&&ack.note?` · "${ack.note}"`:''}  — click to ${ack?'update':'respond'}</div>
          </div>
        </div>
        <div id="idet_${ackId}" style="display:none;border-top:1px solid ${border};padding:10px 12px;background:rgba(255,255,255,.6);width:100%;box-sizing:border-box" onclick="event.stopPropagation()">
          <div style="display:flex;gap:7px;margin-bottom:8px;flex-wrap:wrap">
            ${coupleBtn}
            <button class="btn btn-secondary btn-sm" style="${ack&&ack.status==='done'?'background:#f0fdf4;border-color:#86efac;color:#15803d;':''}" onclick="ackIssue('${bk.id}','${f.key}','done')">✓ Mark Done</button>
            <button class="btn btn-secondary btn-sm" style="${ack&&ack.status==='recognized'?'background:#f8fafc;border-color:#cbd5e1;color:#64748b;':''}" onclick="ackIssue('${bk.id}','${f.key}','recognized')">~ Recognized</button>
            ${ack?`<button class="btn btn-secondary btn-sm" style="color:#dc2626;border-color:#fca5a5" onclick="clearIssueAck('${bk.id}','${f.key}')">× Clear</button>`:''}
          </div>
          <div style="display:flex;gap:7px;align-items:center">
            <input type="text" id="iack_note_${ackId}" value="${ack&&ack.note?ack.note.replace(/"/g,'&quot;'):''}" placeholder="Add a note for this issue…" onclick="event.stopPropagation()"
              style="flex:1;padding:6px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12.5px;outline:none">
            <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();saveIssueNote('${bk.id}','${f.key}')">Save Note</button>
          </div>
        </div>
      </div>`;
    });
  } else {
    autoHtml=`<div style="font-size:12.5px;color:var(--muted);font-style:italic;margin-bottom:12px">No auto-detected issues.</div>`;
  }
  document.getElementById('flagsAutoSection').innerHTML=autoHtml;

  // Manual flags section
  let manHtml=`<div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin:14px 0 8px">Notes & Manual Flags</div>`;
  if(!manualFlags.length){manHtml+=`<div style="font-size:12.5px;color:var(--muted);font-style:italic">No notes yet.</div>`;}
  manualFlags.forEach((f,i)=>{
    manHtml+=`<div class="flag-item ${f.resolved?'':'flag-open'}" style="${f.resolved?'opacity:.5':''}">
      <div class="flag-dot" style="background:${f.resolved?'#9ca3af':'#dc2626'}"></div>
      <div style="flex:1">
        <div class="flag-msg">${f.resolved?'<s>':''}${f.message}${f.resolved?'</s>':''}</div>
        <div class="flag-meta">${f.created||''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        ${!f.resolved?`<button class="btn btn-secondary btn-sm" onclick="ackFlag(${i})">✓ Resolved</button>`:''}
        <button class="btn btn-danger btn-sm" onclick="delFlag(${i})">×</button>
      </div>
    </div>`;
  });
  document.getElementById('flagsManualSection').innerHTML=manHtml;
}

function addManualFlag(){
  const inp=document.getElementById('flagNoteInput');
  const msg=inp.value.trim();if(!msg)return;
  const bk=AppData.bookings.find(b=>b.id===flagsBkId);if(!bk)return;
  if(!bk.flags)bk.flags=[];
  bk.flags.unshift({id:uid(),message:msg,resolved:false,created:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})});
  inp.value='';saveAll();renderFlagsModal(bk);venBuild();
}

function ackFlag(idx){
  const bk=AppData.bookings.find(b=>b.id===flagsBkId);if(!bk||!bk.flags)return;
  bk.flags[idx].resolved=true;saveAll();renderFlagsModal(bk);venBuild();
}

function delFlag(idx){
  const bk=AppData.bookings.find(b=>b.id===flagsBkId);if(!bk||!bk.flags)return;
  bk.flags.splice(idx,1);saveAll();renderFlagsModal(bk);venBuild();
}


// ===== TEACHER SCHEDULE =====
const SHALAS=[
  {id:'grande',   name:'Grande',        capacity:70,  tags:['Largest shala'],                      desc:'Our largest shala — ideal for big groups and high-energy classes.',                                        warn:'You may hear noises from other classes.', photos:['shala-images/grande.jpg']},
  {id:'chica',    name:'Chica',         capacity:35,  tags:['Beachfront','Ocean view'],            desc:'Located at our Chica property, spacious with a view of the ocean.',                                       warn:'', photos:['shala-images/chica-1.jpg']},
  {id:'beachfront',name:'Beachfront',   capacity:28,  tags:['Ocean view','Wooden floor'],          desc:'Beautiful ocean-view shala with a warm wooden floor.',                                                    warn:'No jumping or fitness classes. Noise from nearby shalas.', photos:['shala-images/beachfront.jpg']},
  {id:'heaven',   name:'Heaven Shala',  capacity:24,  tags:['Open air','Shaded','Ocean view'],     desc:'Open-air shala with shade and a breathtaking view of the ocean.',                                         warn:'', photos:['shala-images/heaven.jpg']},
  {id:'skye',     name:'Skye',          capacity:13,  tags:['Smallest shala','Treehouse feel'],    desc:'Our most intimate shala — nestled among the trees, it feels like a treehouse. Perfect for small groups.', warn:'You may hear noises from other classes.', photos:['shala-images/skye.jpg']},
];

const TS_SUNRISE_LOCATIONS={chica_beach:'Chica Beach',grande_beach:'Grande Beach',chica_rooftop:'Chica Rooftop'};

const TS_WINDOWS=[
  {id:'1',label:'7:45 – 9:20 AM', start:'07:45',end:'09:20'},
  // Open-ended — start any time from 9:20 on, and the class can run as long as
  // needed (the end here is just a generous outer bound, not a real cutoff).
  {id:'2',label:'9:30 AM onward',start:'09:30',end:'14:30'},
];

const TS_SPECIAL_TIME_SLOTS=(()=>{
  const slots=[];
  const startM=7*60+30; // 7:30 AM
  const endM=21*60;     // 9:00 PM
  for(let m=startM;m<=endM;m+=15){
    const hh=String(Math.floor(m/60)).padStart(2,'0');
    const mm=String(m%60).padStart(2,'0');
    const h=Math.floor(m/60);
    const disp=(h%12===0?12:h%12)+':'+mm+' '+(h<12?'AM':'PM');
    slots.push({val:`${hh}:${mm}`,label:disp});
  }
  return slots;
})();

let _ts={window:'',morningStart:'',morningDur:90,morningDurRequest:'',morningSpecialReason:'',morningLabel:'',morningCoTeacher:'',hasAfternoon:false,afternoonStart:'16:00',afternoonDur:75,afternoonDurRequest:'',afternoonLabel:'',afternoonCoTeacher:'',morningShala1:'',morningShala2:'',afternoonShala1:'',afternoonShala2:'',music:[],specialReq:'',hasArrivalClass:false,arrivalSlot:'16:00',arrivalDur:60,arrivalDurRequest:'',arrivalShala1:'',arrivalShala2:'',arrivalNotes:'',arrivalLabel:'',arrivalCoTeacher:'',hasDepartureClass:false,departureSlot:'08:00',departureDur:60,departureDurRequest:'',departureShala1:'',departureShala2:'',departureNotes:'',departureLabel:'',departureCoTeacher:'',hasSunrise:false,sunriseDates:[],sunriseStart:'',sunriseDur:45,sunriseLocation:''};
let _tsBkId=null;
let _tsPrepaidMode='choice'; // 'choice' | 'manual' — for the pre-paid activities assignment card

// Lets a teacher rename a generic class ("Morning Class") to whatever it
// actually is (Pilates, Dance, a named workshop) and credit a co-teacher —
// used everywhere a class label renders: the teacher's own itinerary, the
// printed schedule, the admin schedule viewer/list, and the master calendar.
// adminOverride wins over the teacher's own value, same precedence as time.
function tsEffClassLabel(sr,period,fallback){
  const ov=sr?.adminOverride||{};
  const label=(ov[period+'Label']||sr?.[period+'Label']||'').trim();
  const co=(ov[period+'CoTeacher']||sr?.[period+'CoTeacher']||'').trim();
  return (label||fallback)+(co?' — with '+co:'');
}
// Day-specific version — checks that one date's scheduleTimeOverrides entry
// (morn/aft only; arrival & departure are inherently single-day already)
// before falling back to the retreat-wide label above.
// Welcome Snack defaults to 3pm on arrival day — but if every guest's actual
// property-arrival time (flight time + transfer buffer: 2h from Cancún,
// 1h from Tulum) lands after 3pm, nobody would be there yet, so skip it
// entirely rather than putting out a snack no one eats. Returns the snack's
// 24h start time to show it, or null to skip it for that retreat.
function tsArrivalSnackTime(bk){
  if(typeof loadTransport!=='function')return'15:00';
  const subs=loadTransport().filter(s=>s.bookingId===bk.id&&s.status!=='cancelled'&&s.arrivalDate===bk.startDate&&s.arrivalTime&&s.arrivalAirport);
  if(!subs.length)return'15:00'; // no flight info submitted yet — default to showing it
  const bufferMin=s=>s.arrivalAirport==='cancun'?120:60;
  const earliestPropertyArrival=Math.min(...subs.map(s=>trTimeToMins(s.arrivalTime)+bufferMin(s)));
  return earliestPropertyArrival<=15*60?'15:00':null;
}

function tsEffClassLabelDay(sr,bk,dateStr,ovPeriod,labelKey,fallback){
  const dayOv=(bk?.scheduleTimeOverrides||[]).find(o=>o.date===dateStr&&o.period===ovPeriod);
  if(dayOv?.label)return dayOv.label+(dayOv.coTeacher?' — with '+dayOv.coTeacher:'');
  return tsEffClassLabel(sr,labelKey,fallback);
}

function tsRenderSetupDays(){
  const wrap=document.getElementById('tsSetupDaysWrap');
  const list=document.getElementById('tsSetupDaysList');
  if(!wrap||!list)return;
  wrap.style.display=_ts.setupService?'block':'none';
  if(!_ts.setupService)return;
  const bk=AppData.bookings.find(b=>b.id===_tsBkId);
  if(!bk||!bk.startDate){list.innerHTML='';return;}
  const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const nights=Math.max(1,Math.round((pd(bk.endDate)-pd(bk.startDate))/DAY_MS));
  if(!_ts.setupDays)_ts.setupDays=[];
  // Migrate old string-array format to object format
  if(_ts.setupDays.length&&typeof _ts.setupDays[0]==='string'){
    _ts.setupDays=_ts.setupDays.map(d=>({date:d,am:true,pm:false}));
  }
  const existing=_ts.setupDays.reduce((m,e)=>{m[e.date]=e;return m;},{});
  list.innerHTML='';
  for(let i=0;i<nights;i++){
    const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
    const dateStr=d.toISOString().slice(0,10);
    const label=DAYS[d.getDay()]+', '+MONTHS[d.getMonth()]+' '+d.getDate();
    const e=existing[dateStr]||{date:dateStr,am:false,pm:false};
    const hasAM=_ts.hasAfternoon;// only show PM option if they have afternoon class
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:14px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:#fff;';
    row.innerHTML=`
      <span style="font-size:13px;color:#1e4f4f;font-weight:500;min-width:160px">${label}</span>
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12.5px;color:#1e4f4f;font-weight:600">
        <input type="checkbox" ${e.am?'checked':''} style="width:13px;height:13px;accent-color:var(--teal)" onchange="tsToggleSetupDay('${dateStr}','am',this.checked)"> AM Class
      </label>
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12.5px;color:#1e4f4f;font-weight:600">
        <input type="checkbox" ${e.pm?'checked':''} style="width:13px;height:13px;accent-color:var(--teal)" onchange="tsToggleSetupDay('${dateStr}','pm',this.checked)"> PM Class
      </label>`;
    list.appendChild(row);
  }
}

function tsToggleSetupDay(dateStr,period,on){
  if(!_ts.setupDays)_ts.setupDays=[];
  let entry=_ts.setupDays.find(e=>e.date===dateStr);
  if(!entry){entry={date:dateStr,am:false,pm:false};_ts.setupDays.push(entry);}
  entry[period]=on;
  // Remove entry if both unchecked
  if(!entry.am&&!entry.pm)_ts.setupDays=_ts.setupDays.filter(e=>e.date!==dateStr);
}

function tsBowlUpdate(){
  const sec=document.getElementById('tsBowlSection');
  if(sec)sec.style.display=_ts.bowlRental?'block':'none';
  if(!_ts.bowlRental)return;
  tsBowlRenderDays();
  tsBowlCalcTotal();
}

function tsBowlRenderDays(){
  const list=document.getElementById('tsBowlDaysList');if(!list)return;
  const bk=AppData.bookings.find(b=>b.id===_tsBkId);
  if(!bk||!bk.startDate){list.innerHTML='';return;}
  const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const nights=Math.max(1,Math.round((pd(bk.endDate)-pd(bk.startDate))/DAY_MS));
  if(!_ts.bowlDays)_ts.bowlDays=[];
  const existing=_ts.bowlDays.reduce((m,e)=>{m[e.date]=e;return m;},{});
  list.innerHTML='';
  for(let i=0;i<nights;i++){
    const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
    const dateStr=d.toISOString().slice(0,10);
    const label=DAYS[d.getDay()]+', '+MONTHS[d.getMonth()]+' '+d.getDate();
    const e=existing[dateStr]||{date:dateStr,am:false,pm:false};
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:14px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:#fff;';
    row.innerHTML=`
      <span style="font-size:13px;color:var(--dark);font-weight:500;min-width:160px">${label}</span>
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12.5px;color:var(--teal);font-weight:600">
        <input type="checkbox" ${e.am?'checked':''} style="width:13px;height:13px;accent-color:var(--teal)" onchange="tsBowlToggleDay('${dateStr}','am',this.checked)"> AM Class
      </label>
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12.5px;color:var(--teal);font-weight:600">
        <input type="checkbox" ${e.pm?'checked':''} style="width:13px;height:13px;accent-color:var(--teal)" onchange="tsBowlToggleDay('${dateStr}','pm',this.checked)"> PM Class
      </label>`;
    list.appendChild(row);
  }
}

function tsBowlToggleDay(dateStr,period,on){
  if(!_ts.bowlDays)_ts.bowlDays=[];
  let entry=_ts.bowlDays.find(e=>e.date===dateStr);
  if(!entry){entry={date:dateStr,am:false,pm:false};_ts.bowlDays.push(entry);}
  entry[period]=on;
  if(!entry.am&&!entry.pm)_ts.bowlDays=_ts.bowlDays.filter(e=>e.date!==dateStr);
  tsBowlCalcTotal();
}

function tsBowlCalcTotal(){
  const el=document.getElementById('tsBowlTotal');if(!el)return;
  const qty=_ts.bowlQty||1;
  const classSlots=(_ts.bowlDays||[]).reduce((n,e)=>n+(e.am?1:0)+(e.pm?1:0),0);
  if(!classSlots){el.textContent='Select the classes above to see your total.';return;}
  const total=qty*classSlots*15;
  el.textContent=`${qty} bowl${qty>1?'s':''} × ${classSlots} class${classSlots>1?'es':''} × $15 = $${total} USD added to your room account`;
}

// Fills a time <select> with every 15-min slot in a range, so teachers aren't
// limited to a handful of fixed preset times (e.g. a requested 5:45 PM class
// used to have no matching option).
function tsPopulateTimeSlots(selId,startTime,endTime){
  const sel=document.getElementById(selId);if(!sel)return;
  const startM=tsT2M(startTime),endM=tsT2M(endTime);
  const opts=[];
  for(let m=startM;m<=endM;m+=15){const t=tsM2T(m);opts.push(`<option value="${t}">${tsFmt(t)}</option>`);}
  sel.innerHTML=opts.join('');
}

function tsPopulateNights(bk){
  const sel=document.getElementById('tsOffsiteNight');if(!sel)return;
  sel.innerHTML='<option value="">— Select a night —</option>';
  sel.disabled=false;
  if(!bk||!bk.startDate||!bk.endDate)return;
  const start=pd(bk.startDate);
  const nights=Math.max(1,Math.round((pd(bk.endDate)-start)/DAY_MS));
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // Start at i=1 — night 1 is the arrival night; guests are still arriving
  // throughout the day, and an offsite dinner (or any activity) never gets
  // scheduled on the arrival day.
  for(let i=1;i<nights;i++){
    const d=new Date(start.getTime()+i*DAY_MS);
    const label=days[d.getDay()]+', '+months[d.getMonth()]+' '+d.getDate();
    const opt=document.createElement('option');
    opt.value=String(i+1);
    opt.textContent=label;
    sel.appendChild(opt);
  }
  // A 1-night retreat has no night besides the arrival night — there's
  // nothing to offer, so say so instead of leaving a mysteriously empty
  // dropdown that's also not required to submit.
  if(nights<=1){
    sel.innerHTML='<option value="">— Not applicable (1-night retreat) —</option>';
    sel.disabled=true;
  }
}

// Activities the retreat already paid for as part of a package (tours, ice bath,
// cooking class, etc.) that aren't already handled by the Offsite Dinner section.
// Massage (ao8) is also excluded — clients book those onsite individually rather
// than the teacher scheduling one slot for the whole group.
const TS_PREPAID_EXCLUDE=new Set(['ao11','ao13','ao8']);

function tsRenderPrepaidActivities(bk){
  const wrap=document.getElementById('tsPrepaidSection');if(!wrap)return;
  const pkgs=(bk.packages||[]).filter(id=>!TS_PREPAID_EXCLUDE.has(id));
  const hasMassage=(bk.packages||[]).includes('ao8');
  const massageNote=hasMassage?`<div class="ts-card" style="background:#f0fdf4;border-color:#6ee7b7;margin-bottom:${pkgs.length?'16px':'0'}">
    <div style="font-size:13px;color:#065f46;line-height:1.6">✦ Your clients can book their massages once onsite. We look forward to hosting your group!</div>
  </div>`:'';
  if(!pkgs.length){
    if(hasMassage){wrap.style.display='block';wrap.innerHTML=massageNote;}
    else{wrap.style.display='none';wrap.innerHTML='';}
    return;
  }
  const assignedIds=new Set((bk.retreatActivities||[]).map(a=>a.aoId));
  const unassigned=pkgs.filter(id=>!assignedIds.has(id));
  const addOns=loadAddOns();
  const nameOf=id=>addOns.find(a=>a.id===id)?.name||id;
  wrap.style.display='block';
  if(!unassigned.length){
    wrap.innerHTML=massageNote+`<div class="ts-card" style="background:#f0fdf4;border-color:#6ee7b7">
      <div style="font-size:13px;color:#065f46;line-height:1.6">✓ Your pre-paid activities (${pkgs.map(nameOf).join(', ')}) are already placed on your schedule.</div>
    </div>`;
    return;
  }
  if(_tsPrepaidMode==='manual'){
    wrap.innerHTML=massageNote+`<div class="ts-card">
      <div class="ts-card-title">Assign Your Pre-Paid Activities</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:14px">Pick a day and time for each — we'll lock it into your printed schedule.</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${unassigned.map(id=>{
          const ao=addOns.find(a=>a.id===id);
          const tmpl=Object.values(SKED_AUTO_TEMPLATE).flat().find(t=>t.aoId===id);
          return`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;background:var(--sand);border-radius:9px">
            <div style="flex:1;min-width:160px;font-weight:600;font-size:13.5px">${ao?ao.name:id}</div>
            <input type="date" id="tsPrepaidDate_${id}" min="${fmtISO(new Date(pd(bk.startDate).getTime()+DAY_MS))}" max="${bk.endDate}" style="padding:7px 9px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12.5px">
            <input type="time" id="tsPrepaidTime_${id}" value="${tmpl?.time||'11:45'}" style="padding:7px 9px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12.5px">
            <button class="btn btn-secondary" style="padding:7px 16px;font-size:12.5px" onclick="tsSaveManualActivity('${id}')">Save</button>
          </div>`;
        }).join('')}
      </div>
      <button class="btn btn-secondary" style="margin-top:14px;font-size:12.5px" onclick="tsPrepaidMode('choice')">← Back</button>
    </div>`;
    return;
  }
  wrap.innerHTML=massageNote+`<div class="ts-card" style="background:#fffbeb;border-color:#fbbf24">
    <div style="font-size:13.5px;color:#92400e;line-height:1.7">
      <b>⚠ Attention:</b> You've pre-paid for <b>${unassigned.map(nameOf).join(', ')}</b>. Would you like us to assign ${unassigned.length>1?'them':'it'} where ${unassigned.length>1?'they':'it'} best fit${unassigned.length>1?'':'s'} your schedule, or would you rather choose the day/time yourself?
    </div>
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
      <button class="btn btn-primary" style="font-size:12.5px" onclick="tsAutoAssignPrepaid()">Assign automatically for me</button>
      <button class="btn btn-secondary" style="font-size:12.5px" onclick="tsPrepaidMode('manual')">I'll choose the day/time</button>
    </div>
  </div>`;
}

function tsPrepaidMode(mode){
  _tsPrepaidMode=mode;
  const bk=AppData.bookings.find(b=>b.id===_tsBkId);
  if(bk)tsRenderPrepaidActivities(bk);
}

function tsAutoAssignPrepaid(){
  const bk=AppData.bookings.find(b=>b.id===_tsBkId);if(!bk)return;
  const pkgs=(bk.packages||[]).filter(id=>!TS_PREPAID_EXCLUDE.has(id));
  const assignedIds=new Set((bk.retreatActivities||[]).map(a=>a.aoId));
  const nights=getNights(bk);
  if(!bk.retreatActivities)bk.retreatActivities=[];
  let added=0;
  pkgs.filter(id=>!assignedIds.has(id)).forEach(id=>{
    // Start at i=1 — arrival day never gets tours/ceremonies, only check-in/snack/arrival class.
    for(let i=1;i<nights;i++){
      const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
      const tmpl=(SKED_AUTO_TEMPLATE[d.getDay()]||[]).find(t=>t.aoId===id);
      if(tmpl){bk.retreatActivities.push({aoId:id,date:fmtISO(d),time:tmpl.time,prepaid:true});added++;return;}
    }
    // No day-of-week template covers this add-on — fall back to the first full day
    const d=new Date(pd(bk.startDate).getTime()+DAY_MS);
    bk.retreatActivities.push({aoId:id,date:fmtISO(d),time:'11:45',prepaid:true});
    added++;
  });
  bk.retreatActivitiesUpdatedAt=new Date().toISOString();
  saveAll();
  showToast(added?`Assigned ${added} activit${added!==1?'ies':'y'} to your schedule.`:'Nothing to assign.');
  tsRenderPrepaidActivities(bk);
}

function tsSaveManualActivity(aoId){
  const bk=AppData.bookings.find(b=>b.id===_tsBkId);if(!bk)return;
  const dateEl=document.getElementById('tsPrepaidDate_'+aoId),timeEl=document.getElementById('tsPrepaidTime_'+aoId);
  if(!dateEl?.value){showToast('Please pick a date first.');return;}
  if(dateEl.value===bk.startDate){showToast('Activities can\'t be scheduled on the arrival day — please pick a later date.');return;}
  if(!bk.retreatActivities)bk.retreatActivities=[];
  bk.retreatActivities=bk.retreatActivities.filter(a=>a.aoId!==aoId);
  bk.retreatActivities.push({aoId,date:dateEl.value,time:timeEl?.value||'11:45',prepaid:true,requestedTime:true});
  bk.retreatActivitiesUpdatedAt=new Date().toISOString();
  saveAll();
  showToast('Saved.');
  tsRenderPrepaidActivities(bk);
}

function tsInit(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  // Already editing this booking's schedule — don't reset the in-progress draft
  // back to the last-saved database value. But still fall through and re-run
  // every render call below unconditionally: this function also gets called
  // whenever the Schedule tab is shown again (e.g. navigating away and back),
  // and if the DOM was ever rebuilt in the meantime, skipping the renders here
  // would leave the shala grids/day-by-day fields permanently blank even
  // though the underlying data (_ts) is fine.
  const isFreshBooking=_tsBkId!==bkId;
  _tsBkId=bkId;
  if(isFreshBooking){
    _tsPrepaidMode='choice';
    _ts=bk.scheduleRequest
      ?{..._ts,...bk.scheduleRequest}
      :{window:'',morningStart:'',morningDurRequest:'',morningSpecialReason:'',morningDur:60,morningNotes:'',morningFlags:[],morningLabel:'',morningCoTeacher:'',hasAfternoon:false,afternoonSlot:'16:30',afternoonDurRequest:'',afternoonDur:60,afternoonNotes:'',afternoonFlags:[],afternoonLabel:'',afternoonCoTeacher:'',morningShala1:'',morningShala2:'',afternoonShala1:'',afternoonShala2:'',hasWorkshop:false,workshops:[],offsiteNight:'',offsiteChoice:'',bowlRental:false,bowlQty:1,bowlDays:[],setupService:false,setupDays:[],music:[],specialReq:'',shalaFlexibility:'',hasArrivalClass:false,arrivalSlot:'16:00',arrivalDur:60,arrivalDurRequest:'',arrivalShala1:'',arrivalShala2:'',arrivalNotes:'',arrivalLabel:'',arrivalCoTeacher:'',hasDepartureClass:false,departureSlot:'08:00',departureDur:60,departureDurRequest:'',departureShala1:'',departureShala2:'',departureNotes:'',departureLabel:'',departureCoTeacher:'',hasSunrise:false,sunriseDates:[],sunriseStart:'',sunriseDur:45,sunriseLocation:''};
    // Migrate old field name: afternoonStart → afternoonSlot
    if(!_ts.afternoonSlot&&_ts.afternoonStart)_ts.afternoonSlot=_ts.afternoonStart;
    // Load any day-specific overrides (start/duration/type/co-teacher) that
    // already exist for this retreat — whether set by the teacher previously
    // or by admin via the master calendar's per-day edit — into the draft so
    // the daily schedule editor below shows what's actually there.
    // Only true middle days — arrival/departure have their own dedicated
    // sections and are never part of this daily list, so an old orphaned
    // override for either (e.g. from before an arrival class existed) must
    // not get pulled back in here.
    _ts.dailyMorning={};_ts.dailyAfternoon={};
    (bk.scheduleTimeOverrides||[]).forEach(o=>{
      if(o.date<=bk.startDate||o.date>=bk.endDate)return;
      if(o.period==='morn')_ts.dailyMorning[o.date]={start:o.start,dur:o.dur,label:o.label||'',coTeacher:o.coTeacher||'',shala1:o.shala1||'',flags:o.flags||[]};
      else if(o.period==='aft')_ts.dailyAfternoon[o.date]={start:o.start,dur:o.dur,label:o.label||'',coTeacher:o.coTeacher||'',shala1:o.shala1||'',flags:o.flags||[]};
    });
  }
  tsRenderPrepaidActivities(bk);
  tsRenderBrowseGrid();
  tsRenderWindows();
  tsBuildMorningFields();
  tsBuildDailySchedule();
  tsRenderShalaGrid('morning');
  tsRenderShalaGrid('afternoon');
  // Restore sunrise activity
  const srCb=document.getElementById('tsHasSunrise');if(srCb)srCb.checked=!!_ts.hasSunrise;
  const srSec=document.getElementById('tsSunriseSection');if(srSec)srSec.style.display=_ts.hasSunrise?'block':'none';
  tsPopulateTimeSlots('tsSunriseStart','06:30','07:45');
  const srStart=document.getElementById('tsSunriseStart');if(srStart)srStart.value=_ts.sunriseStart||'06:30';
  const srDur=document.getElementById('tsSunriseDur');if(srDur)srDur.value=String(_ts.sunriseDur||45);
  const srLoc=document.getElementById('tsSunriseLocation');if(srLoc)srLoc.value=_ts.sunriseLocation||'';
  if(_ts.hasSunrise)tsRenderSunriseDays();
  // Restore arrival class
  const arrCb=document.getElementById('tsHasArrivalClass');if(arrCb)arrCb.checked=!!_ts.hasArrivalClass;
  const arrSec=document.getElementById('tsArrivalSection');if(arrSec)arrSec.style.display=_ts.hasArrivalClass?'block':'none';
  tsPopulateTimeSlots('tsArrivalSlot','12:00','21:00');
  const arrSlot=document.getElementById('tsArrivalSlot');if(arrSlot)arrSlot.value=_ts.arrivalSlot||'16:00';
  const arrDur=document.getElementById('tsArrivalDur');if(arrDur)arrDur.value=_ts.arrivalDurRequest?'custom':String(_ts.arrivalDur||60);
  const arrDurC=document.getElementById('tsArrivalDurCustom');if(arrDurC){arrDurC.value=_ts.arrivalDurRequest||'';arrDurC.style.display=_ts.arrivalDurRequest?'block':'none';}
  const arrNotes=document.getElementById('tsArrivalNotes');if(arrNotes)arrNotes.value=_ts.arrivalNotes||'';
  const arrLbl=document.getElementById('tsArrivalLabel');if(arrLbl)arrLbl.value=_ts.arrivalLabel||'';
  const arrCoT=document.getElementById('tsArrivalCoTeacher');if(arrCoT)arrCoT.value=_ts.arrivalCoTeacher||'';
  if(_ts.hasArrivalClass)tsRenderShalaGrid('arrival');
  // Restore departure class
  const depCb=document.getElementById('tsHasDepartureClass');if(depCb)depCb.checked=!!_ts.hasDepartureClass;
  const depSec=document.getElementById('tsDepartureSection');if(depSec)depSec.style.display=_ts.hasDepartureClass?'block':'none';
  tsPopulateTimeSlots('tsDepartureSlot','05:30','10:30');
  const depSlot=document.getElementById('tsDepartureSlot');if(depSlot)depSlot.value=_ts.departureSlot||'08:00';
  const depDur=document.getElementById('tsDepartureDur');if(depDur)depDur.value=_ts.departureDurRequest?'custom':String(_ts.departureDur||60);
  const depDurC=document.getElementById('tsDepartureDurCustom');if(depDurC){depDurC.value=_ts.departureDurRequest||'';depDurC.style.display=_ts.departureDurRequest?'block':'none';}
  const depNotes=document.getElementById('tsDepartureNotes');if(depNotes)depNotes.value=_ts.departureNotes||'';
  const depLbl=document.getElementById('tsDepartureLabel');if(depLbl)depLbl.value=_ts.departureLabel||'';
  const depCoT=document.getElementById('tsDepartureCoTeacher');if(depCoT)depCoT.value=_ts.departureCoTeacher||'';
  if(_ts.hasDepartureClass)tsRenderShalaGrid('departure');
  // Restore form values
  const hasCb=document.getElementById('tsHasAfternoon');if(hasCb)hasCb.checked=!!_ts.hasAfternoon;
  const afSec=document.getElementById('tsAfternoonSection');if(afSec)afSec.style.display=_ts.hasAfternoon?'block':'none';
  tsPopulateTimeSlots('tsAfternoonSlot','13:00','19:45');
  const afSlot=document.getElementById('tsAfternoonSlot');if(afSlot)afSlot.value=_ts.afternoonSlot||'16:30';
  const afDur=document.getElementById('tsAfternoonDur');if(afDur)afDur.value=_ts.afternoonDurRequest?'custom':String(_ts.afternoonDur||60);
  const afDurC=document.getElementById('tsAfternoonDurCustom');if(afDurC){afDurC.value=_ts.afternoonDurRequest||'';afDurC.style.display=_ts.afternoonDurRequest?'block':'none';}
  const afNotes=document.getElementById('tsAfternoonNotes');if(afNotes)afNotes.value=_ts.afternoonNotes||'';
  const afLbl=document.getElementById('tsAfternoonLabel');if(afLbl)afLbl.value=_ts.afternoonLabel||'';
  const afCoT=document.getElementById('tsAfternoonCoTeacher');if(afCoT)afCoT.value=_ts.afternoonCoTeacher||'';
  tsBuildAfternoonFlags();
  // Restore workshop
  const wsCb=document.getElementById('tsHasWorkshop');if(wsCb)wsCb.checked=!!_ts.hasWorkshop;
  const wsSec=document.getElementById('tsWorkshopSection');if(wsSec)wsSec.style.display=_ts.hasWorkshop?'block':'none';
  if(_ts.hasWorkshop){tsInitWorkshopDays();tsRenderWorkshopDays();}
  // Restore offsite dinner
  tsPopulateNights(bk);
  const ofNight=document.getElementById('tsOffsiteNight');if(ofNight)ofNight.value=_ts.offsiteNight||'';
  tsRenderOffsiteChoice();
  // Restore singing bowl rental
  const bowlCb=document.getElementById('tsBowlRental');if(bowlCb)bowlCb.checked=!!_ts.bowlRental;
  const bowlQtyEl=document.getElementById('tsBowlQty');if(bowlQtyEl)bowlQtyEl.value=String(_ts.bowlQty||1);
  tsBowlUpdate();
  const req=document.getElementById('tsSpecialReq');if(req)req.value=_ts.specialReq||'';
  const _musicVals=Array.isArray(_ts.music)?_ts.music:(_ts.music?[_ts.music]:[]);
  document.querySelectorAll('.tsMusic').forEach(el=>el.checked=_musicVals.includes(el.value));
  document.querySelectorAll('input[name="tsShalaFlex"]').forEach(el=>el.checked=(el.value===(_ts.shalaFlexibility||'')));
  const setupCb=document.getElementById('tsSetupService');if(setupCb)setupCb.checked=!!_ts.setupService;
  tsRenderSetupDays();
  tsRenderStatus(bk);
  // If schedule confirmed but activities not yet assigned, auto-assign now
  if(bk.scheduleRequest?.adminStatus==='confirmed'&&!(bk.retreatActivities||[]).length){
    const prepaidMap={};
    bk.retreatActivities=[];
    const nights=getNights(bk);
    // Start at i=1 — arrival day never gets tours/ceremonies, only check-in/snack/arrival class.
    for(let i=1;i<nights;i++){
      const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
      const tmpls=SKED_AUTO_TEMPLATE[d.getDay()];
      if(!tmpls)continue;
      const ds=fmtISO(d);
      tmpls.forEach(t=>bk.retreatActivities.push({aoId:t.aoId,date:ds,time:t.time,prepaid:!!(bk.packages||[]).includes(t.aoId)}));
    }
    bk.retreatActivitiesUpdatedAt=new Date().toISOString();
    saveAll();
  }
  tsRenderCalSection(bk);
}

function tsRenderWindows(){
  const el=document.getElementById('tsWindowRow');if(!el)return;
  el.innerHTML=TS_WINDOWS.map(w=>`
    <div class="ts-window-card${_ts.window===w.id?' active':''}" onclick="tsPickWindow('${w.id}')">
      <div class="ts-window-label">${w.label}</div>
      <div class="ts-window-sub">Choose your start time within this window</div>
    </div>`).join('')+`
    <div class="ts-window-card${_ts.window==='special'?' active':''}" onclick="tsPickWindow('special')" style="border-style:dashed">
      <div class="ts-window-label">Special Request</div>
      <div class="ts-window-sub">My class doesn't start during either window above</div>
    </div>`;
}

// The whole morning-class fill-in section (window picker, times, shala grid)
// stays locked/dimmed until the guest checks "I understand" on the AM-blocks
// note above it — they can't start filling anything in before that.
function tsToggleMorningLock(understood){
  const wrap=document.getElementById('tsMorningLockWrap');if(!wrap)return;
  wrap.style.pointerEvents=understood?'auto':'none';
  wrap.style.opacity=understood?'1':'.4';
  wrap.style.filter=understood?'none':'grayscale(.3)';
}
function tsToggleAfternoonLock(understood){
  const wrap=document.getElementById('tsAfternoonLockWrap');if(!wrap)return;
  wrap.style.pointerEvents=understood?'auto':'none';
  wrap.style.opacity=understood?'1':'.4';
  wrap.style.filter=understood?'none':'grayscale(.3)';
}
function tsPickWindow(id){_ts.window=id;_ts.morningStart='';tsRenderWindows();tsBuildMorningFields();tsBuildDailySchedule();tsRenderShalaGrid('morning');}
function tsToggleFlag(period,val,on){
  const k=period==='morning'?'morningFlags':'afternoonFlags';
  if(!_ts[k])_ts[k]=[];
  if(on){if(!_ts[k].includes(val))_ts[k].push(val);}
  else{_ts[k]=_ts[k].filter(v=>v!==val);}
  // If jumping or fitness toggled on, auto-clear beachfront from that period's shala choices
  if(on&&(val==='jumping'||val==='fitness')){
    const k1=period==='morning'?'morningShala1':'afternoonShala1';
    const k2=period==='morning'?'morningShala2':'afternoonShala2';
    if(_ts[k1]==='beachfront'){_ts[k1]=_ts[k2]||'';_ts[k2]='';}
    else if(_ts[k2]==='beachfront'){_ts[k2]='';}
    tsRenderShalaGrid(period);
  }
  // Re-render when unchecking jumping/fitness so beachfront becomes available again
  if(!on&&(val==='jumping'||val==='fitness')){
    tsRenderShalaGrid(period);
  }
}
function tsToggleMusic(val,on){
  if(!Array.isArray(_ts.music))_ts.music=_ts.music?[_ts.music]:[];
  if(on){if(!_ts.music.includes(val))_ts.music.push(val);}
  else{_ts.music=_ts.music.filter(v=>v!==val);}
}
function tsToggleWorkshop(){
  const cb=document.getElementById('tsHasWorkshop');
  const sec=document.getElementById('tsWorkshopSection');
  _ts.hasWorkshop=cb?.checked||false;
  if(sec)sec.style.display=_ts.hasWorkshop?'block':'none';
  if(_ts.hasWorkshop){tsInitWorkshopDays();tsRenderWorkshopDays();}
}
function tsToggleSunrise(){
  _ts.hasSunrise=document.getElementById('tsHasSunrise')?.checked||false;
  const sec=document.getElementById('tsSunriseSection');if(sec)sec.style.display=_ts.hasSunrise?'block':'none';
  // Turning it on fresh (nothing picked yet) defaults to every eligible day,
  // since that's the common case — restoring a previously-saved request with
  // specific days already chosen must NOT be overwritten by this default.
  if(_ts.hasSunrise&&(!_ts.sunriseDates||!_ts.sunriseDates.length)){
    const bk=AppData.bookings.find(b=>b.id===_tsBkId);
    if(bk&&bk.startDate){
      const nights=Math.max(1,Math.round((pd(bk.endDate)-pd(bk.startDate))/DAY_MS));
      _ts.sunriseDates=[];
      for(let i=1;i<nights;i++)_ts.sunriseDates.push(new Date(pd(bk.startDate).getTime()+i*DAY_MS).toISOString().slice(0,10));
    }
  }
  if(_ts.hasSunrise)tsRenderSunriseDays();
}
// Some teachers hold a sunrise activity every day, others just once or twice
// a week — so which days it happens is picked per retreat day, same pattern
// as the bowl-rental/class-setup day pickers. Pure render only — defaulting
// to "every day" happens once, in tsToggleSunrise, not here.
function tsRenderSunriseDays(){
  const list=document.getElementById('tsSunriseDaysList');if(!list)return;
  const bk=AppData.bookings.find(b=>b.id===_tsBkId);
  if(!bk||!bk.startDate){list.innerHTML='';return;}
  const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const nights=Math.max(1,Math.round((pd(bk.endDate)-pd(bk.startDate))/DAY_MS));
  if(!_ts.sunriseDates)_ts.sunriseDates=[];
  list.innerHTML='';
  for(let i=1;i<nights;i++){ // skip arrival (0) and departure (nights) days -- no sunrise those days
    const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
    const dateStr=d.toISOString().slice(0,10);
    const label=DAYS[d.getDay()]+', '+MONTHS[d.getMonth()]+' '+d.getDate();
    const checked=_ts.sunriseDates.includes(dateStr);
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:10px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:#fff;';
    row.innerHTML=`<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#1e4f4f;font-weight:600;width:100%">
      <input type="checkbox" ${checked?'checked':''} style="width:14px;height:14px;accent-color:var(--teal)" onchange="tsToggleSunriseDay('${dateStr}',this.checked)"> ${label}
    </label>`;
    list.appendChild(row);
  }
}
function tsToggleSunriseDay(dateStr,on){
  if(!_ts.sunriseDates)_ts.sunriseDates=[];
  if(on){if(!_ts.sunriseDates.includes(dateStr))_ts.sunriseDates.push(dateStr);}
  else{_ts.sunriseDates=_ts.sunriseDates.filter(d=>d!==dateStr);}
}
function tsToggleArrivalClass(){
  _ts.hasArrivalClass=document.getElementById('tsHasArrivalClass')?.checked||false;
  const sec=document.getElementById('tsArrivalSection');if(sec)sec.style.display=_ts.hasArrivalClass?'block':'none';
  if(_ts.hasArrivalClass)tsRenderShalaGrid('arrival');
}
function tsToggleDepartureClass(){
  _ts.hasDepartureClass=document.getElementById('tsHasDepartureClass')?.checked||false;
  const sec=document.getElementById('tsDepartureSection');if(sec)sec.style.display=_ts.hasDepartureClass?'block':'none';
  if(_ts.hasDepartureClass)tsRenderShalaGrid('departure');
}

function tsInitWorkshopDays(){
  const bk=AppData.bookings.find(b=>b.id===_tsBkId);if(!bk||!bk.startDate)return;
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const nights=Math.max(1,Math.round((pd(bk.endDate)-pd(bk.startDate))/DAY_MS));
  const existing=(_ts.workshops||[]).reduce((m,w)=>{m[w.date]=w;return m;},{});
  _ts.workshops=[];
  for(let i=0;i<nights;i++){
    const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
    const dateStr=d.toISOString().slice(0,10);
    const label=days[d.getDay()]+', '+months[d.getMonth()]+' '+d.getDate();
    const prev=existing[dateStr];
    _ts.workshops.push({date:dateStr,label,enabled:prev?.enabled||false,start:prev?.start||'11:30',dur:prev?.dur||90,notes:prev?.notes||'',shala1:prev?.shala1||'',shala2:prev?.shala2||''});
  }
}

const WS_TIME_SLOTS=(()=>{
  const slots=[];
  const startM=9*60+45; // 9:45 AM
  const endM=21*60+45;  // 9:45 PM
  for(let m=startM;m<=endM;m+=30){
    const hh=String(Math.floor(m/60)).padStart(2,'0');
    const mm=String(m%60).padStart(2,'0');
    const h=Math.floor(m/60);
    const disp=(h%12===0?12:h%12)+':'+mm+' '+(h<12||h===24?'AM':'PM');
    slots.push({val:`${hh}:${mm}`,label:disp});
  }
  return slots;
})();

// 15-minute-increment options for the day-by-day schedule editor, scoped to
// the actual window each period runs in (morning classes 7:30–8:45 AM,
// afternoon/evening classes 4:00–6:30 PM) rather than the whole day.
function tsDailyTimeSlots(startM,endM){
  const slots=[];
  for(let m=startM;m<=endM;m+=15){
    const hh=String(Math.floor(m/60)).padStart(2,'0');
    const mm=String(m%60).padStart(2,'0');
    const h=Math.floor(m/60);
    const disp=(h%12===0?12:h%12)+':'+mm+' '+(h<12?'AM':'PM');
    slots.push({val:`${hh}:${mm}`,label:disp});
  }
  return slots;
}
const TS_DAILY_MORNING_TIME_SLOTS=tsDailyTimeSlots(7*60+30,10*60);   // 7:30 – 10:00 AM
const TS_DAILY_AFTERNOON_TIME_SLOTS=tsDailyTimeSlots(15*60+30,21*60); // 3:30 – 9:00 PM (covers both the 3:30–5:30 and 5:45-onward blocks, back to back in 15-min steps)

function tsRenderWorkshopDays(){
  const el=document.getElementById('tsWorkshopDaysList');if(!el)return;
  const timeOpts=WS_TIME_SLOTS.map(s=>`<option value="${s.val}">${s.label}</option>`).join('');
  el.innerHTML=(_ts.workshops||[]).map((w,i)=>`
    <div style="border:1.5px solid ${w.enabled?'var(--teal)':'var(--border)'};border-radius:12px;padding:14px 16px;margin-bottom:10px;transition:border-color .15s;background:${w.enabled?'#f0f9f9':'#fff'}">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none">
        <input type="checkbox" ${w.enabled?'checked':''} style="width:16px;height:16px;accent-color:var(--teal);flex-shrink:0" onchange="tsToggleWorkshopDay(${i},this.checked)">
        <span style="font-size:14px;font-weight:${w.enabled?700:500};color:${w.enabled?'var(--teal)':'var(--dark)'}">${w.label}</span>
      </label>
      ${w.enabled?`
      <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <div class="ts-section-lbl" style="margin-bottom:6px">Start Time</div>
          <select style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:9px;font-family:'Jost',sans-serif;font-size:13px;background:var(--sand);outline:none" onchange="tsUpdateWorkshop(${i},'start',this.value)">
            ${WS_TIME_SLOTS.map(s=>`<option value="${s.val}"${w.start===s.val?' selected':''}>${s.label}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="ts-section-lbl" style="margin-bottom:6px">Duration</div>
          <select style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:9px;font-family:'Jost',sans-serif;font-size:13px;background:var(--sand);outline:none" onchange="tsUpdateWorkshop(${i},'dur',parseInt(this.value))">
            <option value="60"${w.dur===60?' selected':''}>60 min</option>
            <option value="90"${w.dur===90?' selected':''}>90 min</option>
            <option value="120"${w.dur===120?' selected':''}>2 hours</option>
            <option value="150"${w.dur===150?' selected':''}>2.5 hours</option>
            <option value="180"${w.dur===180?' selected':''}>3 hours</option>
          </select>
        </div>
      </div>
      <div style="margin-top:12px">
        <div class="ts-section-lbl" style="margin-bottom:6px">Shala Preference</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${SHALAS.map(s=>{
            const rank=w.shala1===s.id?'1st':w.shala2===s.id?'2nd':'';
            return`<button onclick="tsWorkshopShalaClick(${i},'${s.id}')" style="padding:6px 12px;border-radius:8px;font-family:'Jost',sans-serif;font-size:12px;font-weight:${rank?700:500};cursor:pointer;border:1.5px solid ${rank?'var(--teal)':'var(--border)'};background:${rank?'#f0f9f9':'#fff'};color:${rank?'var(--teal)':'var(--dark)'};transition:all .15s">${s.name}${rank?' ('+rank+')':''}</button>`;
          }).join('')}
        </div>
      </div>
      <div style="margin-top:12px">
        <div class="ts-section-lbl" style="margin-bottom:6px">Notes</div>
        <textarea placeholder="Topic, equipment, setup needs..." style="width:100%;height:70px;padding:9px 12px;border:1.5px solid var(--border);border-radius:9px;font-family:'Jost',sans-serif;font-size:13px;line-height:1.6;background:var(--sand);outline:none;resize:vertical;box-sizing:border-box" onchange="tsUpdateWorkshop(${i},'notes',this.value)">${w.notes||''}</textarea>
      </div>`:''}
    </div>`).join('');
}

function tsToggleWorkshopDay(i,on){
  if(!_ts.workshops[i])return;
  _ts.workshops[i].enabled=on;
  tsRenderWorkshopDays();
}

function tsUpdateWorkshop(i,field,val){
  if(!_ts.workshops[i])return;
  _ts.workshops[i][field]=val;
}

function tsWorkshopShalaClick(i,shalaId){
  const w=_ts.workshops[i];if(!w)return;
  if(w.shala1===shalaId){w.shala1=w.shala2;w.shala2='';}
  else if(w.shala2===shalaId){w.shala2='';}
  else if(!w.shala1){w.shala1=shalaId;}
  else if(!w.shala2){w.shala2=shalaId;}
  else{w.shala1=shalaId;w.shala2='';}
  tsRenderWorkshopDays();
}

function tsSetOffsiteChoice(choice){
  if(!_ts.offsiteNight){showToast('Please select which night first.');return;}
  _ts.offsiteChoice=choice;
  tsRenderOffsiteChoice();
}

function tsRenderOffsiteChoice(){
  ['onsite','gitano','undecided'].forEach(c=>{
    const opt=document.getElementById('tsOffsiteOpt_'+c);
    const btn=document.getElementById('tsOffsiteBtn_'+c);
    const sel=_ts.offsiteChoice===c;
    if(opt)opt.classList.toggle('selected',sel);
    if(btn)btn.classList.toggle('selected',sel);
    if(btn)btn.textContent=sel?(c==='onsite'?'✓ Added':'✓ Selected'):(c==='onsite'?'Add to Package':c==='gitano'?'Add Gitano':'');
  });
}

function tsBuildAfternoonFlags(){
  const c=document.getElementById('tsAfternoonFlagsContainer');if(!c)return;
  const flags=[['standard','Your standard yoga class'],['loud_music','I use very loud music'],['fitness','This is a fitness class'],['jumping','We will be jumping'],['quiet','I prefer quiet']];
  c.innerHTML=flags.map(([val,lbl])=>{
    const chk=(_ts.afternoonFlags||[]).includes(val);
    return`<label style="display:flex;align-items:center;gap:9px;cursor:pointer;font-size:13px;color:var(--dark)"><input type="checkbox" value="${val}"${chk?' checked':''} style="width:15px;height:15px;accent-color:var(--teal)" onchange="tsToggleFlag('afternoon','${val}',this.checked)">${lbl}</label>`;
  }).join('');
}

function tsDurSelect(type,value){
  const cap=type.charAt(0).toUpperCase()+type.slice(1);
  const customEl=document.getElementById('ts'+cap+'DurCustom');
  if(value==='custom'){
    if(customEl)customEl.style.display='block';
    return;
  }
  if(customEl){customEl.style.display='none';customEl.value='';}
  _ts[type+'DurRequest']='';
  _ts[type+'Dur']=parseInt(value);
  tsRenderShalaGrid(type);
  tsBuildDailySchedule();
}

function tsMorningDurSelect(value){
  const customEl=document.getElementById('tsMorningDurCustom');
  if(value==='custom'){
    if(customEl)customEl.style.display='block';
    return;
  }
  if(customEl){customEl.style.display='none';customEl.value='';}
  _ts.morningDurRequest='';
  _ts.morningDur=parseInt(value);
  tsCapMorningDur();
  tsBuildMorningFields();
  tsBuildDailySchedule();
}
// A late start time can't always fit every duration within the standard
// window (e.g. an 8:30 start with 90 minutes selected would run past the
// window's 9:20 end) — rather than blocking the start time, silently
// shorten the class so it always ends right at the window's edge.
function tsCapMorningDur(){
  _ts._morningDurCapped=false;
  if(_ts.window==='special'||!_ts.morningStart)return;
  const win=TS_WINDOWS.find(w=>w.id===_ts.window);if(!win)return;
  const maxDur=tsT2M(win.end)-tsT2M(_ts.morningStart);
  if((_ts.morningDur||60)>maxDur&&maxDur>0){_ts.morningDur=maxDur;_ts._morningDurCapped=true;}
}

function tsBuildMorningFields(){
  const el=document.getElementById('tsMorningFields');if(!el)return;
  // The retreat-wide time window / start time / duration / class type /
  // co-teacher / class characteristics pickers were removed — the
  // day-by-day schedule below is now the only place a teacher sets those,
  // per individual day. Only the general Notes field stays here.
  el.innerHTML=`<div style="margin-top:16px">
    <div class="ts-section-lbl">Notes <span style="font-size:11px;font-weight:400;color:var(--muted)">(special requests for your morning class)</span></div>
    <textarea id="tsMorningNotes" placeholder="Any special requests for your morning class..." style="width:100%;height:80px;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;font-family:'Jost',sans-serif;font-size:13px;line-height:1.6;background:var(--sand);outline:none;resize:vertical;box-sizing:border-box;margin-top:6px" onchange="_ts.morningNotes=this.value">${_ts.morningNotes||''}</textarea>
  </div>
  `;
}

// Per-day schedule — some teachers teach something different every day
// rather than the same class at the same time all retreat. This lists each
// middle day (arrival/departure have their own dedicated sections above)
// with its own Start Time, Duration, Class Type & Co-Teacher, defaulting to
// the retreat-wide values above but individually editable. Saved into
// bk.scheduleTimeOverrides on submit — the same array admin's own per-day
// edit (on the master calendar) reads and writes, so either side can
// customize a day and both see the result.
function tsBuildDailySchedule(){
  const el=document.getElementById('tsDailyScheduleFields');if(!el)return;
  const elAft=document.getElementById('tsDailyScheduleFieldsAfternoon');
  const bk=AppData.bookings.find(b=>b.id===_tsBkId);
  if(!bk||!bk.startDate||!bk.endDate){el.innerHTML='';if(elAft)elAft.innerHTML='';return;}
  const nights=Math.max(1,Math.round((pd(bk.endDate)-pd(bk.startDate))/DAY_MS));
  if(nights<2){el.innerHTML='<div style="font-size:12.5px;color:var(--muted);font-style:italic">Not enough nights for a day-by-day schedule.</div>';if(elAft)elAft.innerHTML='';return;}
  const DAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MON_NAMES=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if(!_ts.dailyMorning)_ts.dailyMorning={};
  if(!_ts.dailyAfternoon)_ts.dailyAfternoon={};
  const durOpts=[30,45,60,75,90,120,150];
  const row=(period,dateStr,dayLbl)=>{
    const store=period==='morn'?_ts.dailyMorning:_ts.dailyAfternoon;
    if(!store[dateStr])store[dateStr]={};
    const o=store[dateStr];
    const defStart=period==='morn'?(TS_DAILY_MORNING_TIME_SLOTS[0].val):(TS_DAILY_AFTERNOON_TIME_SLOTS[0].val);
    const defDur=period==='morn'?(_ts.morningDur||60):(_ts.afternoonDur||60);
    const defShala=period==='morn'?_ts.morningShala1:_ts.afternoonShala1;
    // Morning/afternoon start time now lives entirely day-by-day (no
    // retreat-wide default to fall back to) — write a concrete value into
    // the draft the moment a day first renders, so what's showing in the
    // dropdown is always actually saved, not just a visual placeholder.
    if(o.start===undefined)o.start=defStart;
    if(o.dur===undefined)o.dur=defDur;
    const startVal=o.start;
    const durVal=o.dur;
    const dayFlags=o.flags||[];
    // Beachfront has no jumping/fitness classes — same rule the retreat-wide
    // shala grid enforces, applied per day since the characteristics are now
    // set per day too.
    const dayBfBlocked=dayFlags.includes('jumping')||dayFlags.includes('fitness');
    const shalaVal=(dayBfBlocked&&(o.shala1==='beachfront'||(!o.shala1&&defShala==='beachfront')))?'':(o.shala1!==undefined&&o.shala1!==''?o.shala1:(defShala||''));
    const shalaOpts=`<option value="">— Same as above —</option>`+SHALAS.map(s=>{
      const blocked=dayBfBlocked&&s.id==='beachfront';
      return `<option value="${s.id}"${shalaVal===s.id?' selected':''}${blocked?' disabled':''}>${s.name}${blocked?' — unavailable (jumping/fitness)':''}</option>`;
    }).join('');
    const flagBoxes=['standard:Your standard yoga class','loud_music:I use very loud music','fitness:This is a fitness class','jumping:We will be jumping','quiet:I prefer quiet'].map(f=>{
      const[val,lbl]=f.split(':');const chk=dayFlags.includes(val);
      return `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--dark)"><input type="checkbox" value="${val}"${chk?' checked':''} style="width:13px;height:13px;accent-color:var(--teal)" onchange="tsToggleDailyFlag('${period}','${dateStr}','${val}',this.checked)">${lbl}</label>`;
    }).join('');
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
      <div style="min-width:130px;font-size:12.5px;font-weight:700;color:var(--dark)">${dayLbl}</div>
      <div><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">Start</label><select onchange="tsSetDaily('${period}','${dateStr}','start',this.value)" style="padding:7px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12.5px;background:var(--sand)">${(period==='morn'?TS_DAILY_MORNING_TIME_SLOTS:TS_DAILY_AFTERNOON_TIME_SLOTS).map(s=>`<option value="${s.val}"${startVal===s.val?' selected':''}>${s.label}</option>`).join('')}</select></div>
      <div><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">Duration</label><select onchange="tsSetDaily('${period}','${dateStr}','dur',parseInt(this.value))" style="padding:7px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12.5px;background:var(--sand)">${durOpts.map(m=>`<option value="${m}"${durVal===m?' selected':''}>${m} min</option>`).join('')}</select></div>
      <div><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">Shala</label><select onchange="tsSetDaily('${period}','${dateStr}','shala1',this.value)" style="padding:7px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12.5px;background:var(--sand);max-width:150px">${shalaOpts}</select></div>
      <div style="flex:1;min-width:150px"><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">Class Type</label><input type="text" value="${o.label||''}" placeholder="e.g. Pilates" onchange="tsSetDaily('${period}','${dateStr}','label',this.value)" style="width:100%;box-sizing:border-box;padding:7px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12.5px;background:var(--sand)"></div>
      <div style="flex:1;min-width:130px"><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">Co-Teacher</label><input type="text" value="${o.coTeacher||''}" placeholder="optional" onchange="tsSetDaily('${period}','${dateStr}','coTeacher',this.value)" style="width:100%;box-sizing:border-box;padding:7px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12.5px;background:var(--sand)"></div>
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px">${flagBoxes}</div>
    </div>`;
  };
  let morningRows='',afternoonRows='';
  for(let i=1;i<nights;i++){
    const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
    const dateStr=fmtISO(d);
    const dayLbl=DAY_NAMES[d.getDay()]+', '+MON_NAMES[d.getMonth()]+' '+d.getDate();
    morningRows+=row('morn',dateStr,dayLbl);
    if(_ts.hasAfternoon)afternoonRows+=row('aft',dateStr,dayLbl);
  }
  el.innerHTML=`<div style="margin-top:16px;padding:16px;background:#f8f5f0;border:1.5px solid var(--border);border-radius:12px">
    <div class="ts-section-lbl">Day-by-Day Schedule <span style="font-size:11px;font-weight:400;color:var(--muted)">(set the time, shala, and class type for each day — some teachers don't do the same class every day)</span></div>
    ${morningRows}
  </div>`;
  if(elAft){
    elAft.innerHTML=_ts.hasAfternoon?`<div style="margin-top:16px;padding:16px;background:#f8f5f0;border:1.5px solid var(--border);border-radius:12px">
      <div class="ts-section-lbl">Day-by-Day Schedule <span style="font-size:11px;font-weight:400;color:var(--muted)">(set the time, shala, and class type for each day — some teachers don't do the same class every day)</span></div>
      ${afternoonRows}
    </div>`:'';
  }
}
function tsSetDaily(period,dateStr,field,val){
  const store=period==='morn'?(_ts.dailyMorning||(_ts.dailyMorning={})):(_ts.dailyAfternoon||(_ts.dailyAfternoon={}));
  if(!store[dateStr])store[dateStr]={};
  store[dateStr][field]=val;
}
function tsToggleDailyFlag(period,dateStr,val,on){
  const store=period==='morn'?(_ts.dailyMorning||(_ts.dailyMorning={})):(_ts.dailyAfternoon||(_ts.dailyAfternoon={}));
  if(!store[dateStr])store[dateStr]={};
  if(!store[dateStr].flags)store[dateStr].flags=[];
  if(on){if(!store[dateStr].flags.includes(val))store[dateStr].flags.push(val);}
  else{store[dateStr].flags=store[dateStr].flags.filter(v=>v!==val);}
  // Jumping/fitness affects which shala this day can use (no Beachfront) —
  // always re-render on either toggle direction so the Shala dropdown's
  // disabled state updates immediately, whether Beachfront was this day's
  // own explicit pick or just inherited from the retreat-wide default (the
  // dropdown showed "Beachfront" either way, but only an explicit pick had
  // anything to clear — the inherited case needs a re-render too, since
  // that's what actually recomputes and disables the option).
  if(val==='jumping'||val==='fitness'){
    if(store[dateStr].shala1==='beachfront')store[dateStr].shala1='';
    tsBuildDailySchedule();
  }
}

function tsT2M(t){const[h,m]=t.split(':').map(Number);return h*60+m;}
function tsM2T(m){return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
// Every valid 15-min start time across the two allotted morning windows — used to
// stop a per-day time override from landing in the gap between windows.
function tsAllMorningSlots(){
  const out=new Set();
  TS_WINDOWS.forEach(w=>{
    const startM=tsT2M(w.start),endM=tsT2M(w.end);
    for(let m=startM;m<endM;m+=15)out.add(tsM2T(m));
  });
  return [...out].sort();
}
function tsFmt(t){const[h,m]=t.split(':').map(Number);const ap=h>=12?'PM':'AM';return `${h%12||12}:${String(m).padStart(2,'0')} ${ap}`;}

function tsCheckConflict(shalaId,period,bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return null;
  const overlapping=AppData.bookings.filter(b=>{
    if(b.id===bkId||!b.scheduleRequest)return false;
    return b.startDate<bk.endDate&&b.endDate>bk.startDate;
  });
  // Build this teacher's requested time range
  function getMyRange(){
    if(period==='afternoon'){
      const s=tsT2M(_ts.afternoonSlot||'16:30');
      return{s,e:s+(_ts.afternoonDur||60)};
    }
    if(_ts.morningStart){const s=tsT2M(_ts.morningStart);return{s,e:s+(_ts.morningDur||60)};}
    if(_ts.window){const w=TS_WINDOWS.find(w=>w.id===_ts.window);if(w)return{s:tsT2M(w.start),e:tsT2M(w.end)};}
    return null;
  }
  // Build another retreat's time range for this period
  function getOtherRange(sr){
    if(period==='morning'){if(!sr.morningStart)return null;const s=tsT2M(sr.morningStart);return{s,e:s+(sr.morningDur||60)};}
    if(period==='afternoon'){const _as=sr.afternoonSlot||sr.afternoonStart;if(!_as)return null;const s=tsT2M(_as);return{s,e:s+(sr.afternoonDur||60)};}
    return null;
  }
  function overlapsTime(sr){
    const my=getMyRange(),other=getOtherRange(sr);
    if(!my||!other)return true; // conservative
    return my.s<other.e+15&&my.e>other.s; // 15-min buffer after confirmed booking ends
  }
  function fmtRange(r){if(!r)return'';return tsFmt(tsM2T(r.s))+' – '+tsFmt(tsM2T(r.e));}
  function uses1st(sr){return period==='morning'?sr.morningShala1===shalaId:sr.afternoonShala1===shalaId;}
  function uses2nd(sr){return period==='morning'?sr.morningShala2===shalaId:sr.afternoonShala2===shalaId;}

  // Check all confirmed 1st-choice bookings for this shala
  const confirmed1=overlapping.filter(b=>b.scheduleRequest.adminStatus==='confirmed'&&uses1st(b.scheduleRequest));
  if(confirmed1.length){
    const otherRange=getOtherRange(confirmed1[0].scheduleRequest);
    const rangeLabel=fmtRange(otherRange);
    if(overlapsTime(confirmed1[0].scheduleRequest)){
      return{level:'blocked',message:`Booked by another group${rangeLabel?' at '+rangeLabel:''}`,bookedLabel:rangeLabel};
    } else {
      // Different time — still selectable but show the booked hours as info
      return{level:'info',message:`Another group uses this shala${rangeLabel?' at '+rangeLabel:''} — your selected time is clear`,bookedLabel:rangeLabel};
    }
  }
  // Confirmed 2nd-choice with overlapping time
  const confirmed2=overlapping.filter(b=>b.scheduleRequest.adminStatus==='confirmed'&&uses2nd(b.scheduleRequest)&&overlapsTime(b.scheduleRequest));
  if(confirmed2.length)return{level:'second',message:'Another group\'s 2nd choice at this time — likely still available, Amansala will confirm'};
  // Pending 1st-choice with overlapping time
  const pending=overlapping.filter(b=>b.scheduleRequest.adminStatus!=='confirmed'&&uses1st(b.scheduleRequest)&&overlapsTime(b.scheduleRequest));
  if(pending.length)return{level:'warn',message:'Requested by another group at this time — pending Amansala approval'};
  return null;
}

function tsRenderBrowseGrid(){
  const el=document.getElementById('tsShalaBrowseGrid');if(!el)return;
  el.innerHTML=SHALAS.map(s=>{
    const tags=s.tags.map(t=>`<span class="ts-shala-tag">${t}</span>`).join('');
    const warn=s.warn?`<div class="ts-shala-warn">${s.warn}</div>`:'';
    const photos=s.photos&&s.photos.length?`<div class="ts-shala-photos"><img src="${s.photos[0]}" alt="${s.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div style=&quot;height:110px;display:flex;align-items:center;justify-content:center;background:#f0f9f6;color:#9ca3af;font-size:12px&quot;>📷 Photo coming soon</div>'"></div>`:`<div class="ts-shala-photos"><div style="height:110px;display:flex;align-items:center;justify-content:center;background:#f0f9f6;color:#9ca3af;font-size:12px">📷 Photo coming soon</div></div>`;
    return `<div class="ts-shala-card" style="cursor:default">
      ${photos}
      <div class="ts-shala-content">
        <div class="ts-shala-name">${s.name}</div>
        <div class="ts-shala-cap">${s.capacity?`Up to ${s.capacity} people`:'Intimate group'}</div>
        <div class="ts-shala-tags">${tags}</div>
        <div class="ts-shala-desc">${s.desc}</div>
        ${warn}
      </div>
    </div>`;
  }).join('');
}

function tsBeachfrontBlocked(period){
  const flags=period==='morning'?(_ts.morningFlags||[]):(_ts.afternoonFlags||[]);
  return flags.includes('jumping')||flags.includes('fitness');
}

function tsRenderShalaGrid(period){
  const gridId=period==='morning'?'tsMorningShalaGrid':period==='workshop'?'tsWorkshopShalaGrid':period==='arrival'?'tsArrivalShalaGrid':period==='departure'?'tsDepartureShalaGrid':'tsAfternoonShalaGrid';
  const el=document.getElementById(gridId);if(!el)return;
  const k1=period==='morning'?'morningShala1':period==='workshop'?'workshopShala1':period==='arrival'?'arrivalShala1':period==='departure'?'departureShala1':'afternoonShala1';
  const k2=period==='morning'?'morningShala2':period==='workshop'?'workshopShala2':period==='arrival'?'arrivalShala2':period==='departure'?'departureShala2':'afternoonShala2';
  const bfBlocked=tsBeachfrontBlocked(period);
  el.innerHTML=SHALAS.map(s=>{
    const bfBlock=s.id==='beachfront'&&bfBlocked;
    const isC1=_ts[k1]===s.id,isC2=_ts[k2]===s.id;
    const conflict=_tsBkId?tsCheckConflict(s.id,period,_tsBkId):null;
    const hardBlocked=bfBlock||(conflict&&conflict.level==='blocked');
    if(bfBlock){
      return `<button disabled title="Not available — no jumping or fitness classes" style="padding:7px 14px;border-radius:99px;border:2px solid #fca5a5;background:#fff0f0;color:#dc2626;font-size:12.5px;font-weight:600;cursor:not-allowed;opacity:.6;text-decoration:line-through">${s.name} — unavailable</button>`;
    }
    if(conflict&&conflict.level==='blocked'){
      const bl=conflict.bookedLabel?` (${conflict.bookedLabel})`:'';
      return `<button disabled title="${conflict.message}" style="padding:7px 14px;border-radius:99px;border:2px solid #fca5a5;background:#fff0f0;color:#dc2626;font-size:12.5px;font-weight:600;cursor:not-allowed;opacity:.7">${s.name} — booked${bl} ✕</button>`;
    }
    let style='padding:7px 14px;border-radius:99px;border:2px solid var(--border);background:#fff;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .15s;';
    let label=s.name;
    if(isC1){style='padding:7px 14px;border-radius:99px;border:2px solid var(--teal);background:var(--teal);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;';label='1st · '+s.name;}
    else if(isC2){style='padding:7px 14px;border-radius:99px;border:2px solid #7c3aed;background:#7c3aed;color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;';label='2nd · '+s.name;}
    // 'second' and 'info' levels — treat as open, just show tooltip
    if(conflict&&conflict.level==='info'&&!isC1&&!isC2){
      // Booked by another group at a different time — show in yellow to draw attention
      label=s.name+(conflict.bookedLabel?' · booked '+conflict.bookedLabel:'');
      style='padding:7px 14px;border-radius:99px;border:2px solid #f59e0b;background:#fef9c3;color:#92400e;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .15s;';
    }
    if(conflict&&conflict.level==='warn'&&!isC1&&!isC2){
      // Another teacher has already requested this shala at this time — block it
      return `<button disabled title="${conflict.message}" style="padding:7px 14px;border-radius:99px;border:2px solid #fdba74;background:#fff7ed;color:#c2410c;font-size:12.5px;font-weight:600;cursor:not-allowed;opacity:.8">${s.name} ✕</button>`;
    }
    const tip=conflict?` title="${conflict.message}"`:'';
    return `<button style="${style}" onclick="tsPickShala('${period}','${s.id}')"${tip}>${label}</button>`;
  }).join('');
}

function tsPickShala(period,id){
  if(id==='beachfront'&&tsBeachfrontBlocked(period)){showToast('Beachfront is not available for jumping or fitness classes.');return;}
  const conflict=_tsBkId?tsCheckConflict(id,period,_tsBkId):null;
  if(conflict&&(conflict.level==='blocked'||conflict.level==='warn')){showToast(conflict.message);return;}
  const k1=period==='morning'?'morningShala1':period==='arrival'?'arrivalShala1':period==='departure'?'departureShala1':'afternoonShala1';
  const k2=period==='morning'?'morningShala2':period==='arrival'?'arrivalShala2':period==='departure'?'departureShala2':'afternoonShala2';
  if(_ts[k1]===id){_ts[k1]=_ts[k2];_ts[k2]=id;} // shift: 1st→2nd, clicked→2nd
  else if(_ts[k2]===id){_ts[k2]='';} // deselect 2nd
  else if(!_ts[k1]){_ts[k1]=id;} // set as 1st
  else if(!_ts[k2]){_ts[k2]=id;} // set as 2nd
  else{_ts[k2]=_ts[k1];_ts[k1]=id;} // replace 1st, bump old 1st to 2nd
  tsRenderShalaGrid(period);
}

function tsToggleAfternoon(){
  const cb=document.getElementById('tsHasAfternoon');
  _ts.hasAfternoon=cb?.checked||false;
  const sec=document.getElementById('tsAfternoonSection');
  if(sec)sec.style.display=_ts.hasAfternoon?'block':'none';
  tsBuildDailySchedule();
}

function tsRenderStatus(bk){
  const bar=document.getElementById('tsStatusBar');
  const noteEl=document.getElementById('tsAdminNote');
  const noticeEl=document.getElementById('tsSubmitNotice');
  if(!bar)return;
  if(!bk.scheduleRequest?.submittedAt){bar.style.display='none';if(noteEl)noteEl.style.display='none';if(noticeEl)noticeEl.style.display='none';return;}
  bar.style.display='flex';
  const d=new Date(bk.scheduleRequest.submittedAt);
  document.getElementById('tsStatusDate').textContent=`Submitted ${d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}`;
  const st=bk.scheduleRequest.adminStatus||'pending';
  const labels={pending:'Pending Review',confirmed:'Confirmed',changes:'Changes Requested'};
  document.getElementById('tsStatusBadge').innerHTML=`<span class="ts-status-badge ${st}">${labels[st]||'Pending'}</span>`;
  if(noteEl&&bk.scheduleRequest.adminNote){noteEl.style.display='block';noteEl.textContent='Note from Amansala: '+bk.scheduleRequest.adminNote;}
  else if(noteEl){noteEl.style.display='none';}
  if(noticeEl)noticeEl.style.display=(st==='pending')?'block':'none';
  // Show admin override suggestion banner if changes requested with override
  let suggEl=document.getElementById('tsAdminSuggestions');
  if(st==='changes'&&bk.scheduleRequest.adminOverride){
    const ov=bk.scheduleRequest.adminOverride;
    const shalaName=id=>id?(SHALAS.find(s=>s.id===id)?.name||id):'—';
    let suggHtml='<div id="tsAdminSuggestions" style="background:#f0fdf4;border:1.5px solid #6ee7b7;border-radius:10px;padding:14px 16px;margin-top:10px">';
    suggHtml+='<div style="font-size:12.5px;font-weight:700;color:#065f46;margin-bottom:8px">&#128161; Amansala Suggested Times — review and apply if you agree</div>';
    suggHtml+='<div style="font-size:12.5px;color:#065f46;margin-bottom:4px"><b>Morning:</b> '+tsFmt(ov.morningStart)+(ov.morningDur?' · '+ov.morningDur+' min':'')+' · '+shalaName(ov.morningShala1)+(ov.morningShala2?' / '+shalaName(ov.morningShala2):'')+'</div>';
    if(ov.afternoonStart)suggHtml+='<div style="font-size:12.5px;color:#065f46;margin-bottom:8px"><b>Afternoon:</b> '+tsFmt(ov.afternoonStart)+(ov.afternoonDur?' · '+ov.afternoonDur+' min':'')+' · '+shalaName(ov.afternoonShala1)+(ov.afternoonShala2?' / '+shalaName(ov.afternoonShala2):'')+'</div>';
    suggHtml+='<button onclick="tsApplySuggestedTimes()" style="padding:8px 18px;background:#059669;color:#fff;border:none;border-radius:7px;font-family:\'Jost\',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer;margin-top:6px">Apply Suggested Times</button>';
    suggHtml+='</div>';
    if(suggEl){suggEl.outerHTML=suggHtml;}
    else{if(noteEl&&noteEl.parentNode){const div=document.createElement('div');div.innerHTML=suggHtml;noteEl.parentNode.insertBefore(div.firstChild,noteEl.nextSibling);}}
  } else {
    if(suggEl)suggEl.remove();
  }
  // Edit button — lockout logic
  const editWrap=document.getElementById('tsEditBtnWrap');
  if(editWrap&&bk.startDate){
    const todayStr=new Date().toISOString().slice(0,10);
    const isPast=bk.endDate&&todayStr>bk.endDate;
    if(IS_TEACHER_MODE&&isPast){
      editWrap.innerHTML=`<span style="font-size:11.5px;color:#6b7280;font-weight:600;white-space:nowrap">Retreat completed</span>`;
    } else if(!IS_TEACHER_MODE&&isPast){
      editWrap.innerHTML=`<button onclick="tsScrollToForm()" style="padding:7px 16px;background:#fff;border:1.5px solid #7c3aed;border-radius:8px;color:#7c3aed;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap">✏ Admin Edit</button>`;
    } else {
      editWrap.innerHTML=`<button onclick="tsScrollToForm()" style="padding:7px 16px;background:#fff;border:1.5px solid var(--teal);border-radius:8px;color:var(--teal);font-family:'Jost',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap">✏ Edit Schedule</button>`;
    }
  }
  // Hide schedule form cards for teachers viewing a past retreat
  if(IS_TEACHER_MODE&&bk.endDate&&new Date().toISOString().slice(0,10)>bk.endDate){
    document.querySelectorAll('.ts-wrap .ts-card').forEach(c=>c.style.display='none');
    const existingNotice=document.getElementById('tsPastRetreatNotice');
    if(!existingNotice){
      const notice=document.createElement('div');notice.id='tsPastRetreatNotice';
      notice.style.cssText='margin-top:20px;padding:20px 24px;background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:14px;text-align:center;color:#6b7280;font-size:13px;line-height:1.7';
      notice.innerHTML='<div style="font-size:22px;margin-bottom:8px">🗓</div><div style="font-weight:600;color:#374151;margin-bottom:4px">Your retreat has passed</div>If you need to update your schedule, please contact Amansala directly at <a href="mailto:retreats@amansala.com" style="color:var(--teal)">retreats@amansala.com</a>.';
      const wrap=document.querySelector('.ts-wrap');if(wrap)wrap.appendChild(notice);
    }
  } else {
    document.querySelectorAll('.ts-wrap .ts-card').forEach(c=>c.style.display='');
    const notice=document.getElementById('tsPastRetreatNotice');if(notice)notice.remove();
  }
}

function tsScrollToForm(){
  const el=document.getElementById('tsWindowSection')||document.querySelector('.ts-wrap');
  if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
  showToast('Make your changes below and click Save Schedule Request when done.');
}

function tsApplySuggestedTimes(){
  const savedId=(localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id'));
  const bk=AppData.bookings.find(b=>b.id===savedId);if(!bk||!bk.scheduleRequest?.adminOverride)return;
  const ov=bk.scheduleRequest.adminOverride;
  if(ov.morningStart){const el=document.getElementById('tsMorningStart');if(el)el.value=ov.morningStart;}
  if(ov.morningDur){const el=document.getElementById('tsMorningDur');if(el)el.value=String(ov.morningDur);}
  if(ov.morningShala1){_ts.morningShala1=ov.morningShala1;tsRenderShalaGrid('morning');}
  if(ov.morningShala2){_ts.morningShala2=ov.morningShala2;}
  if(ov.afternoonStart){const el=document.getElementById('tsAfternoonSlot');if(el)el.value=ov.afternoonStart;}
  if(ov.afternoonDur){const el=document.getElementById('tsAfternoonDur');if(el)el.value=String(ov.afternoonDur);}
  if(ov.afternoonShala1){_ts.afternoonShala1=ov.afternoonShala1;tsRenderShalaGrid('afternoon');}
  if(ov.afternoonShala2){_ts.afternoonShala2=ov.afternoonShala2;}
  showToast('Suggested times applied — review and save your schedule.');
}

// Scrolls to and briefly highlights a missing required field so a blocked
// submit is impossible to miss — clicking Save on a long form otherwise just
// shows a toast the teacher may not be looking at.
function tsFlagRequired(elId,message){
  showToast(message);
  const el=document.getElementById(elId);
  if(!el)return;
  el.scrollIntoView({behavior:'smooth',block:'center'});
  el.style.transition='outline .15s';
  el.style.outline='3px solid #dc2626';
  el.style.outlineOffset='3px';
  setTimeout(()=>{el.style.outline='';el.style.outlineOffset='';},2500);
}

function tsSubmitSchedule(){
  const savedId=(localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id'));
  const bk=AppData.bookings.find(b=>b.id===savedId);if(!bk)return;
  // Block teachers from submitting for past retreats (admin can still create via admin tools)
  if(IS_TEACHER_MODE&&bk.endDate&&new Date().toISOString().slice(0,10)>bk.endDate){showToast('Your retreat has passed. Please contact Amansala if you need schedule changes.');return;}
  const ackEl=document.getElementById('tsMorningBlocksAck');
  if(ackEl&&!ackEl.checked){showToast('Please check the box confirming you understand the morning time blocks.');ackEl.closest('div').scrollIntoView({behavior:'smooth',block:'center'});return;}
  const hasAfternoonEl=document.getElementById('tsHasAfternoon');
  const afternoonAckEl=document.getElementById('tsAfternoonBlocksAck');
  if(hasAfternoonEl?.checked&&afternoonAckEl&&!afternoonAckEl.checked){showToast('Please check the box confirming you understand the afternoon/evening time blocks.');afternoonAckEl.closest('div').scrollIntoView({behavior:'smooth',block:'center'});return;}
  const srCbEl=document.getElementById('tsHasSunrise');if(srCbEl)_ts.hasSunrise=srCbEl.checked;
  const srStartEl=document.getElementById('tsSunriseStart');if(srStartEl)_ts.sunriseStart=srStartEl.value;
  const srDurEl=document.getElementById('tsSunriseDur');if(srDurEl)_ts.sunriseDur=parseInt(srDurEl.value);
  const srLocEl=document.getElementById('tsSunriseLocation');if(srLocEl)_ts.sunriseLocation=srLocEl.value;
  const arrCbEl=document.getElementById('tsHasArrivalClass');if(arrCbEl)_ts.hasArrivalClass=arrCbEl.checked;
  const arrSlotEl=document.getElementById('tsArrivalSlot');if(arrSlotEl)_ts.arrivalSlot=arrSlotEl.value;
  const arrDurEl=document.getElementById('tsArrivalDur');if(arrDurEl&&arrDurEl.value!=='custom')_ts.arrivalDur=parseInt(arrDurEl.value);
  const arrDurCEl=document.getElementById('tsArrivalDurCustom');if(arrDurCEl)_ts.arrivalDurRequest=arrDurEl&&arrDurEl.value==='custom'?arrDurCEl.value.trim():'';
  const arrNotesEl=document.getElementById('tsArrivalNotes');if(arrNotesEl)_ts.arrivalNotes=arrNotesEl.value.trim();
  const arrLblEl=document.getElementById('tsArrivalLabel');if(arrLblEl)_ts.arrivalLabel=arrLblEl.value.trim();
  const arrCoTEl=document.getElementById('tsArrivalCoTeacher');if(arrCoTEl)_ts.arrivalCoTeacher=arrCoTEl.value.trim();
  const depCbEl=document.getElementById('tsHasDepartureClass');if(depCbEl)_ts.hasDepartureClass=depCbEl.checked;
  const depSlotEl=document.getElementById('tsDepartureSlot');if(depSlotEl)_ts.departureSlot=depSlotEl.value;
  const depDurEl=document.getElementById('tsDepartureDur');if(depDurEl&&depDurEl.value!=='custom')_ts.departureDur=parseInt(depDurEl.value);
  const depDurCEl=document.getElementById('tsDepartureDurCustom');if(depDurCEl)_ts.departureDurRequest=depDurEl&&depDurEl.value==='custom'?depDurCEl.value.trim():'';
  const depNotesEl=document.getElementById('tsDepartureNotes');if(depNotesEl)_ts.departureNotes=depNotesEl.value.trim();
  const depLblEl=document.getElementById('tsDepartureLabel');if(depLblEl)_ts.departureLabel=depLblEl.value.trim();
  const depCoTEl=document.getElementById('tsDepartureCoTeacher');if(depCoTEl)_ts.departureCoTeacher=depCoTEl.value.trim();
  const mStartEl=document.getElementById('tsMorningStart');if(mStartEl)_ts.morningStart=mStartEl.value;
  const mDurEl=document.getElementById('tsMorningDur');if(mDurEl&&mDurEl.value!=='custom')_ts.morningDur=parseInt(mDurEl.value);
  const mDurCEl=document.getElementById('tsMorningDurCustom');if(mDurCEl)_ts.morningDurRequest=mDurEl&&mDurEl.value==='custom'?mDurCEl.value.trim():'';
  const mLblEl=document.getElementById('tsMorningLabel');if(mLblEl)_ts.morningLabel=mLblEl.value.trim();
  const mCoTEl=document.getElementById('tsMorningCoTeacher');if(mCoTEl)_ts.morningCoTeacher=mCoTEl.value.trim();
  const afSlotEl=document.getElementById('tsAfternoonSlot');if(afSlotEl)_ts.afternoonSlot=afSlotEl.value;
  const afDurEl=document.getElementById('tsAfternoonDur');if(afDurEl&&afDurEl.value!=='custom')_ts.afternoonDur=parseInt(afDurEl.value);
  const afDurCEl=document.getElementById('tsAfternoonDurCustom');if(afDurCEl)_ts.afternoonDurRequest=afDurEl&&afDurEl.value==='custom'?afDurCEl.value.trim():'';
  const afNotesEl=document.getElementById('tsAfternoonNotes');if(afNotesEl)_ts.afternoonNotes=afNotesEl.value.trim();
  const afLblEl=document.getElementById('tsAfternoonLabel');if(afLblEl)_ts.afternoonLabel=afLblEl.value.trim();
  const afCoTEl=document.getElementById('tsAfternoonCoTeacher');if(afCoTEl)_ts.afternoonCoTeacher=afCoTEl.value.trim();
  const mNotesEl=document.getElementById('tsMorningNotes');if(mNotesEl)_ts.morningNotes=mNotesEl.value.trim();
  const mSpecialEl=document.getElementById('tsMorningSpecialReason');if(mSpecialEl)_ts.morningSpecialReason=mSpecialEl.value.trim();
  const hasCb=document.getElementById('tsHasAfternoon');if(hasCb)_ts.hasAfternoon=hasCb.checked;
  _ts.music=Array.from(document.querySelectorAll('.tsMusic:checked')).map(el=>el.value);
  const shalaFlexEl=document.querySelector('input[name="tsShalaFlex"]:checked');if(shalaFlexEl)_ts.shalaFlexibility=shalaFlexEl.value;
  const reqEl=document.getElementById('tsSpecialReq');if(reqEl)_ts.specialReq=reqEl.value.trim();
  const setupCb=document.getElementById('tsSetupService');if(setupCb)_ts.setupService=setupCb.checked;
  if(!_ts.setupService)_ts.setupDays=[];
  // Save workshop
  const wsCb=document.getElementById('tsHasWorkshop');if(wsCb)_ts.hasWorkshop=wsCb.checked;
  // Save offsite dinner
  const ofNight=document.getElementById('tsOffsiteNight');if(ofNight)_ts.offsiteNight=ofNight.value;
  // Save singing bowl rental
  const bowlCb=document.getElementById('tsBowlRental');if(bowlCb)_ts.bowlRental=bowlCb.checked;
  const bowlQtyEl=document.getElementById('tsBowlQty');if(bowlQtyEl)_ts.bowlQty=parseInt(bowlQtyEl.value)||1;
  if(!_ts.bowlRental)_ts.bowlDays=[];
  if(!_ts.morningShala1){tsFlagRequired('tsMorningShalaGrid','Please select at least a 1st choice shala.');return;}
  // Morning start time is now set entirely day-by-day (no retreat-wide
  // default) — every middle day needs its own start time before submitting.
  {
    const missingDay=svValidActivityDays(bk).find(d=>!_ts.dailyMorning?.[d.date]?.start);
    if(missingDay){tsFlagRequired('tsDailyScheduleFields',`Please set a morning start time for ${missingDay.label}.`);return;}
  }
  if(_ts.hasSunrise&&(!_ts.sunriseDates||!_ts.sunriseDates.length)){showToast('Please check at least one day for your sunrise activity, or turn it off.');return;}
  if(_ts.hasSunrise&&!_ts.sunriseStart){tsFlagRequired('tsSunriseStart','Please select a start time for your sunrise activity.');return;}
  if(_ts.hasSunrise&&!_ts.sunriseLocation){tsFlagRequired('tsSunriseLocation','Please select a location for your sunrise activity.');return;}
  // A 1-night retreat has no night that isn't the arrival night, so there's
  // no valid offsite-dinner night to offer — don't require the impossible.
  if(getNights(bk)>1){
    if(!_ts.offsiteNight){tsFlagRequired('tsOffsiteNight','Please select which night your group will dine offsite — this is required.');return;}
    if(!_ts.offsiteChoice){tsFlagRequired('tsOffsiteChoiceWrap','Please select your offsite dinner preference (Onsite, Gitano, or Undecided).');return;}
  }
  // Fold the day-by-day overrides into bk.scheduleTimeOverrides — the same
  // array admin's own per-day edit modal reads/writes — replacing whatever
  // was there before for this retreat's morn/aft days. Only keep an entry
  // when it actually differs from the retreat-wide default just submitted,
  // or carries a custom type/co-teacher, so unedited days don't clutter it.
  // Morning (and afternoon, if enabled) time/shala/type now live entirely
  // day-by-day — every middle day gets a real override entry, not just the
  // days that differ from some retreat-wide default (there isn't one for
  // start time anymore).
  const keepOvs=(bk.scheduleTimeOverrides||[]).filter(o=>o.date<bk.startDate||o.date>=bk.endDate||(o.period!=='morn'&&o.period!=='aft'));
  const newOvs=[];
  svValidActivityDays(bk).forEach(({date:dateStr})=>{
    const o=_ts.dailyMorning?.[dateStr];
    if(!o||!o.start)return;
    newOvs.push({date:dateStr,period:'morn',start:o.start,dur:o.dur||60,label:o.label||'',coTeacher:o.coTeacher||'',shala1:o.shala1||'',flags:o.flags||[]});
  });
  if(_ts.hasAfternoon)svValidActivityDays(bk).forEach(({date:dateStr})=>{
    const o=_ts.dailyAfternoon?.[dateStr];
    if(!o||!o.start)return;
    newOvs.push({date:dateStr,period:'aft',start:o.start,dur:o.dur||60,label:o.label||'',coTeacher:o.coTeacher||'',shala1:o.shala1||'',flags:o.flags||[]});
  });
  bk.scheduleTimeOverrides=[...keepOvs,...newOvs];
  const{dailyMorning,dailyAfternoon,...srWithoutDaily}=_ts;
  bk.scheduleRequest={...srWithoutDaily,submittedAt:new Date().toISOString(),adminStatus:'pending',adminNote:bk.scheduleRequest?.adminNote||''};
  saveAll();
  // Auto-populate tours & ceremonies on first submission only
  if(!bk.retreatActivities||!bk.retreatActivities.length){
    bk.retreatActivities=[];
    const nts=getNights(bk);
    // Start at i=1 — arrival day never gets tours/ceremonies, only check-in/snack/arrival class.
    for(let i=1;i<nts;i++){
      const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
      const tmpls=SKED_AUTO_TEMPLATE[d.getDay()];
      if(!tmpls)continue;
      const ds=fmtISO(d);
      tmpls.forEach(t=>bk.retreatActivities.push({aoId:t.aoId,date:ds,time:t.time,prepaid:!!(bk.packages||[]).includes(t.aoId)}));
    }
    // Auto-add Gitano dinner activity if teacher selected it, and add to packages so it applies to all guests
    if(_ts.offsiteChoice==='gitano'&&_ts.offsiteNight&&bk.startDate){
      const gitanoDate=fmtISO(new Date(pd(bk.startDate).getTime()+(parseInt(_ts.offsiteNight)-1)*DAY_MS));
      const alreadyHas=(bk.retreatActivities||[]).some(a=>a.aoId==='ao13');
      if(!alreadyHas&&gitanoDate!==bk.startDate)bk.retreatActivities.push({aoId:'ao13',date:gitanoDate,time:'19:30',prepaid:true});
      if(!bk.packages)bk.packages=[];
      if(!bk.packages.includes('ao13'))bk.packages.push('ao13');
    } else {
      // Teacher chose onsite or undecided — remove Gitano from packages
      if(bk.packages)bk.packages=bk.packages.filter(p=>p!=='ao13');
    }
    bk.retreatActivitiesUpdatedAt=new Date().toISOString();
    saveAll();
  }
  tsRenderStatus(bk);
  tsRenderCalSection(bk);
  // Show confirmation popup
  const confEl=document.getElementById('tsSubmitConfirmModal');
  if(confEl){confEl.style.display='flex';}else{showToast('Schedule request saved! Amansala will confirm your times and shalas.');}
}

function tsRenderCalSection(bk){
  const sec=document.getElementById('tsCalSection');
  const content=document.getElementById('tsCalContent');
  if(!sec||!content||!bk)return;
  const sr=bk.scheduleRequest;
  if(!sr?.submittedAt){sec.style.display='none';return;}
  sec.style.display='block';
  const DAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MON_NAMES=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const snm=id=>id?(SHALAS.find(s=>s.id===id)?.name||id):'';
  const mShala=snm(sr.morningShala1);
  const aShala=snm(sr.afternoonShala1);
  const fmtT=t=>{if(!t)return'';const[h,m]=t.split(':').map(Number);const ap=h>=12?'PM':'AM';return`${h%12||12}:${String(m).padStart(2,'0')} ${ap}`;};
  const addMin=(t,mins)=>{if(!t)return'';const[h,m]=t.split(':').map(Number);const tot=h*60+m+mins;const hh=Math.floor(tot/60)%24;return`${String(hh).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}`;};
  const nights=Math.max(1,Math.round((pd(bk.endDate)-pd(bk.startDate))/DAY_MS));
  // Activity lookup including extras not in ADD_ONS
  const ALL_ACTS_MAP={};
  ADD_ONS.forEach(a=>ALL_ACTS_MAP[a.id]=a);
  ALL_ACTS_MAP['ao12']={id:'ao12',name:'Group Salsa Class',price:0,cat:'entertainment'};
  const getAct=id=>ALL_ACTS_MAP[id]||{id,name:id,price:0,cat:'ceremony'};
  const TOUR_IDS=['ao1','ao2','ao3','ao6','ao7'];
  const CEREMONY_IDS=['ao4','ao5','ao9','ao10'];
  const days=[];
  // Loop nights+1 days: day 0 = arrival, days 1..nights-1 = middle, day nights = departure (endDate)
  for(let i=0;i<=nights;i++){
    const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
    const dateStr=d.toISOString().slice(0,10);
    const sfx=i===0?'st':i===1?'nd':i===2?'rd':'th';
    const lbl=DAY_NAMES[d.getDay()]+' · '+MON_NAMES[d.getMonth()]+' '+d.getDate()+sfx;
    const rows=[];
    const prepaidActs=[]; // prepaid activities shown in their own section per day
    const sk=t=>t||'99:99'; // sort key: raw 24h time, empty items sort to end
    if(i===0){
      // Arrival day — no morning classes
      const snackTime=tsArrivalSnackTime(bk);
      if(snackTime)rows.push({time:fmtT(snackTime),desc:'Welcome Snack',shala:'',cat:'meal',sk:snackTime});
      if(sr.hasArrivalClass&&sr.arrivalSlot){
        const arShala=snm(sr.arrivalShala1||sr.morningShala1);
        rows.push({time:fmtT(sr.arrivalSlot)+' – '+fmtT(addMin(sr.arrivalSlot,sr.arrivalDur||60)),desc:tsEffClassLabel(sr,'arrival','Opening Class'),shala:arShala,cat:'yoga',sk:sr.arrivalSlot});
      }
      rows.push({time:'7:30 PM',desc:'Dinner',shala:'',cat:'meal',sk:'19:30'});
    } else if(i===nights){
      // Departure day (endDate)
      rows.push({time:'7:00 AM',desc:'Fruit, Coffee &amp; Tea',shala:'',cat:'meal',sk:'07:00'});
      if(sr.hasDepartureClass&&sr.departureSlot){
        const depShala=snm(sr.departureShala1||sr.morningShala1);
        rows.push({time:fmtT(sr.departureSlot)+' – '+fmtT(addMin(sr.departureSlot,sr.departureDur||60)),desc:tsEffClassLabel(sr,'departure','Departure Morning Class'),shala:depShala,cat:'yoga',sk:sr.departureSlot});
      } else {
        const _usualMorn=tsUsualMorning(bk);
        rows.push({time:fmtT(_usualMorn.start)+' – '+fmtT(addMin(_usualMorn.start,_usualMorn.dur)),desc:tsEffClassLabel(sr,'morning','Morning Class'),shala:mShala,cat:'yoga',sk:_usualMorn.start||'08:00'});
      }
      rows.push({time:'9:30 AM',desc:'Brunch &amp; Departures',shala:'',cat:'meal',sk:'09:30'});
    } else {
      if(sr.hasSunrise&&sr.sunriseStart&&(sr.sunriseDates||[]).includes(dateStr)){
        rows.push({time:fmtT(sr.sunriseStart)+' – '+fmtT(addMin(sr.sunriseStart,sr.sunriseDur||45)),desc:'Sunrise Activity'+(sr.sunriseLocation?' — '+(TS_SUNRISE_LOCATIONS[sr.sunriseLocation]||sr.sunriseLocation):'')+' (no shala, no music — quiet hours)',shala:'',cat:'yoga',sk:sr.sunriseStart});
      }
      rows.push({time:'7:00 AM',desc:'Fruit, Coffee &amp; Tea',shala:'',cat:'meal',sk:'07:00'});
      // Retreat-wide admin override, then a per-day override on top of that —
      // must be applied here too, not just on the admin's own master calendar,
      // or the teacher's itinerary goes stale the moment either one is used.
      const _ov=sr.adminOverride||{};
      const _usualMorn2=tsUsualMorning(bk);
      const _effMornStart=_ov.morningStart||_usualMorn2.start;
      const _effMornDur=_ov.morningDur||_usualMorn2.dur||60;
      const _effAfSlot=_ov.afternoonStart||sr.afternoonSlot||sr.afternoonStart;
      const _effAfDur=_ov.afternoonDur||sr.afternoonDur||60;
      const _timeOvs=bk.scheduleTimeOverrides||[];
      const _mornOv=_timeOvs.find(o=>o.date===dateStr&&o.period==='morn');
      const _aftOv=_timeOvs.find(o=>o.date===dateStr&&o.period==='aft');
      const dayMornStart=_mornOv?_mornOv.start:_effMornStart;
      const dayMornDur=_mornOv?(_mornOv.dur||_effMornDur):_effMornDur;
      const dayAfSlot=_aftOv?_aftOv.start:_effAfSlot;
      const dayAfDur=_aftOv?(_aftOv.dur||_effAfDur):_effAfDur;
      const dayMornShala=snm(_mornOv?.shala1||sr.morningShala1);
      rows.push({time:fmtT(dayMornStart)+' – '+fmtT(addMin(dayMornStart,dayMornDur)),desc:tsEffClassLabelDay(sr,bk,dateStr,'morn','morning','Morning Class'),shala:dayMornShala,cat:'yoga',sk:dayMornStart||'08:00'});
      const _bMStart=dayMornStart||'';const _bMDur=dayMornDur;const _brunchT=_bMStart?addMin(_bMStart,_bMDur+15):'09:45';
      rows.push({time:fmtT(_brunchT),desc:_brunchT<'09:45'?'Breakfast':'Brunch',shala:'',cat:'meal',sk:_brunchT});
      rows.push({time:'3:00 PM',desc:'Snack',shala:'',cat:'meal',sk:'15:00'});
      const ws=(sr.workshops||[]).find(w=>w.enabled&&w.date===dateStr);
      if(ws)rows.push({time:fmtT(ws.start)+' – '+fmtT(addMin(ws.start,ws.dur||90)),desc:'Mid-Afternoon Class'+(ws.notes?' — '+ws.notes:''),shala:snm(ws.shala1),cat:'yoga',sk:ws.start||'16:00'});
      const dayAfShala=snm(_aftOv?.shala1||sr.afternoonShala1);
      if(sr.hasAfternoon&&dayAfSlot)rows.push({time:fmtT(dayAfSlot)+' – '+fmtT(addMin(dayAfSlot,dayAfDur)),desc:tsEffClassLabelDay(sr,bk,dateStr,'aft','afternoon','Afternoon Class'),shala:dayAfShala,cat:'yoga',sk:dayAfSlot});
      const isOffsite=sr.offsiteNight&&(()=>{const ofNight=pd(bk.startDate).getTime()+(parseInt(sr.offsiteNight)-1)*DAY_MS;return Math.abs(d.getTime()-ofNight)<DAY_MS/2;})();
      const hasGitanoToday=(bk.retreatActivities||[]).some(a=>a.aoId==='ao13'&&a.date===dateStr);
      if(!hasGitanoToday)rows.push({time:'7:30 PM',desc:isOffsite?'Dinner (Off-site)':'Dinner',shala:'',cat:'meal',sk:'19:30'});
    }
    // Tours/ceremonies/prepaid activities can land on any day EXCEPT the arrival
    // day — hard backstop here regardless of how a stale/mis-dated entry got
    // into bk.retreatActivities (e.g. dates shifting after the retreat's
    // startDate was edited without re-running auto-assign).
    (bk.retreatActivities||[]).filter(a=>a.date===dateStr&&dateStr!==bk.startDate).forEach(a=>{
      const ao=getAct(a.aoId);
      const cat=TOUR_IDS.includes(a.aoId)?'tour':CEREMONY_IDS.includes(a.aoId)?'ceremony':(ao.cat||'ceremony');
      const tag=cat==='tour'?'Tour':cat==='entertainment'?'Group Salsa Class':'Ceremony';
      const dur=ACTS_DUR[a.aoId]||90;
      const timeRange=a.time?(fmtT(a.time)+' – '+fmtT(addMin(a.time,dur))):'';
      if(a.prepaid){
        prepaidActs.push({time:timeRange,name:ao.name,cat,tag,shala:ACT_SHALA[a.aoId]||'',requestedTime:!!a.requestedTime});
      } else {
        rows.push({time:timeRange,desc:ao.name+(ao.price?' — $'+ao.price+'/person':''),shala:ACT_SHALA[a.aoId]||'',cat,actTag:'Optional',prepaid:false,sk:a.time||'99:99'});
      }
    });
    rows.sort((a,b)=>sk(a.sk).localeCompare(sk(b.sk)));
    days.push({lbl,dayName:DAY_NAMES[d.getDay()],dateNum:d.getDate(),month:MON_NAMES[d.getMonth()],rows,prepaidActs});
  }
  const st=sr.adminStatus||'pending';
  const stLabel={pending:'Pending Confirmation',confirmed:'Confirmed',changes:'Changes Requested'}[st]||'Pending';
  const stColor={pending:'#92400e',confirmed:'#15803d',changes:'#dc2626'}[st];
  const stBg={pending:'#fef3c7',confirmed:'#dcfce7',changes:'#fee2e2'}[st];
  const mShala2=snm(sr.morningShala2);
  const aShala2=snm(sr.afternoonShala2);
  const shalaNote=mShala?('Morning shala: <b>'+mShala+'</b>'+(aShala?' &nbsp;·&nbsp; Afternoon: <b>'+aShala+'</b>':'')):'Shala to be confirmed by Amansala';
  const shala2Parts=[];
  if(mShala2)shala2Parts.push('Morning 2nd choice: <b>'+mShala2+'</b>');
  if(aShala2)shala2Parts.push('Afternoon 2nd choice: <b>'+aShala2+'</b>');
  const shala2Note=shala2Parts.length?`<div style="margin-top:20px;padding:10px 14px;background:#f0f9f9;border:1px solid #b2d8d8;border-radius:8px;font-size:12px;color:#4b7070;line-height:1.7"><span style="font-weight:700">Shala 2nd Choice:</span> ${shala2Parts.join(' &nbsp;·&nbsp; ')} — we will assign this shala if your first preference is unavailable.</div>`:'';
  // Prepaid package banner
  const prepaidIds=[...new Set([...(bk.packages||[]),...(bk.retreatActivities||[]).filter(a=>a.prepaid).map(a=>a.aoId)])];
  const prepaidItems=ADD_ONS.filter(a=>prepaidIds.includes(a.id));
  const prepaidHtml=prepaidItems.length?`<div style="background:#f0fdf4;border:1.5px solid #6ee7b7;border-radius:12px;padding:14px 18px;margin-bottom:24px">
    <div style="font-size:11.5px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">✦ Prepaid Package</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">${prepaidItems.map(ao=>`<span style="background:#dcfce7;color:#15803d;border:1px solid #6ee7b7;padding:5px 14px;border-radius:99px;font-size:12.5px;font-weight:600;font-family:'Jost',sans-serif">${ao.name}</span>`).join('')}</div>
    <div style="font-size:11.5px;color:#4b7070;font-style:italic">These activities are included in your retreat — Amansala will coordinate the exact timing on your schedule below.</div>
  </div>`:'';


  const renderRow=r=>{
    const catCls=r.cat?'cat-'+r.cat:'';
    const tagHtml=r.actTag?`<span class="sched-act-tag ${r.prepaid?'prepaid':r.cat}">${r.actTag}</span>`:'';
    const shalaHtml=r.shala?`<span class="sched-shala">📍 SHALA: ${r.shala.toUpperCase()}</span>`:(r.cat&&r.cat!=='meal'?`<span class="sched-shala" style="background:#fef3c7;color:#92400e">⚠ SHALA TO BE CONFIRMED</span>`:'');
    return`<div class="sched-item-row ${catCls}"><span class="sched-time">${r.time}</span><span class="sched-desc">${r.desc}</span>${tagHtml}${shalaHtml}</div>`;
  };

  content.innerHTML=`
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:26px">
      <div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:700;color:#1a2332;margin-bottom:5px;letter-spacing:-.3px">Your Retreat Schedule</div>
        <div style="font-size:12.5px;color:#6b7280;line-height:1.7">${shalaNote}<br><span style="font-style:italic">Shala assignments are based on your first preference — Amansala will confirm availability.</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;flex-wrap:wrap">
        <span style="display:inline-flex;align-items:center;padding:5px 16px;border-radius:99px;font-size:12px;font-weight:700;background:${stBg};color:${stColor};font-family:'Jost',sans-serif">${stLabel}</span>
        <button onclick="openPrintSchedule('${bk.id}')" style="padding:7px 16px;background:var(--teal);color:#fff;border:none;border-radius:8px;font-family:'Jost',sans-serif;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">Print / Save PDF</button>
      </div>
    </div>
    ${prepaidHtml}
    <div class="sched-days-grid" style="grid-template-columns:1fr 1fr 1fr">
      ${(()=>{
        const renderDayBlock=day=>`<div class="sched-day-block">
          <div class="sched-day-hdr-label">${day.dayName}</div>
          <div class="sched-day-hdr">${day.month} ${day.dateNum}</div>
          <div class="sched-day-divider"></div>
          ${day.rows.map(renderRow).join('')}
          ${day.prepaidActs&&day.prepaidActs.length?`<div style="margin-top:10px;background:#f0fdf4;border:1.5px solid #6ee7b7;border-radius:9px;padding:8px 10px">
            <div style="font-size:10px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">✦ Pre-Paid Activity</div>
            ${day.prepaidActs.map((a,ai)=>`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;${ai>0?'border-top:1px solid #d1fae5;':''}">
              ${a.time?`<span style="min-width:95px;flex-shrink:0;font-size:11px;color:#4b7070;font-weight:600;font-family:'Jost',sans-serif">${a.time}</span>`:''}
              <span style="flex:1;font-size:12.5px;color:#15803d;font-weight:600">${a.name}${a.requestedTime?' <span style="font-weight:600;font-style:italic;color:#4b7070">(requested this time)</span>':''}</span>
              ${a.shala?`<span class="sched-shala" style="flex-shrink:0">📍 SHALA: ${a.shala.toUpperCase()}</span>`:''}
              <span class="sched-act-tag prepaid" style="flex-shrink:0">${a.tag}</span>
            </div>`).join('')}
          </div>`:''}
        </div>`;
        const third=Math.ceil(days.length/3);
        const col1=days.slice(0,third);
        const col2=days.slice(third,third*2);
        const col3=days.slice(third*2);
        return`<div style="display:flex;flex-direction:column;gap:32px">${col1.map(renderDayBlock).join('')}</div>
               <div style="display:flex;flex-direction:column;gap:32px">${col2.map(renderDayBlock).join('')}</div>
               <div style="display:flex;flex-direction:column;gap:32px">${col3.map(renderDayBlock).join('')}</div>`;
      })()}
    </div>
    ${shala2Note}
    ${(()=>{
      const extras=[];
      if(sr.bowlRental&&sr.bowlQty&&sr.bowlDays&&sr.bowlDays.length){
        const slots=(sr.bowlDays||[]).reduce((n,e)=>n+(e.am?1:0)+(e.pm?1:0),0);
        const total=sr.bowlQty*slots*15;
        const detail=sr.bowlDays.map(e=>{const dt=pd(e.date);const p=[];if(e.am)p.push('AM');if(e.pm)p.push('PM');return`${MON_NAMES[dt.getMonth()]} ${dt.getDate()} (${p.join(' & ')})`;}).join(', ');
        extras.push(`<div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px solid #ede9e3"><span><span style="font-size:15px;margin-right:6px">🎵</span><b>Singing Bowl Rental</b> &nbsp;<span style="font-size:12px;color:#6b7280">${sr.bowlQty} bowl${sr.bowlQty>1?'s':''} · ${slots} class${slots!==1?'es':''} · ${detail}</span></span><span style="font-weight:700;color:#1a2332">$${total} USD</span></div>`);
      }
      if(sr.setupService&&sr.setupDays&&sr.setupDays.length){
        const sessions=(sr.setupDays||[]).reduce((n,e)=>n+(e.am?1:0)+(e.pm?1:0),0);
        const total=sessions*25;
        const detail=sr.setupDays.map(e=>{const dt=pd(e.date);const p=[];if(e.am)p.push('AM');if(e.pm)p.push('PM');return`${MON_NAMES[dt.getMonth()]} ${dt.getDate()} (${p.join(' & ')})`;}).join(', ');
        extras.push(`<div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px solid #ede9e3"><span><span style="font-size:15px;margin-right:6px">🛠</span><b>Class Setup Service</b> &nbsp;<span style="font-size:12px;color:#6b7280">${sessions} session${sessions!==1?'s':''} · ${detail}</span></span><span style="font-weight:700;color:#1a2332">$${total} USD</span></div>`);
      }
      if(!extras.length)return'';
      const grandTotal=(()=>{let t=0;if(sr.bowlRental&&sr.bowlQty&&sr.bowlDays){const s=(sr.bowlDays||[]).reduce((n,e)=>n+(e.am?1:0)+(e.pm?1:0),0);t+=sr.bowlQty*s*15;}if(sr.setupService&&sr.setupDays){const s=(sr.setupDays||[]).reduce((n,e)=>n+(e.am?1:0)+(e.pm?1:0),0);t+=s*25;}return t;})();
      return`<div style="margin-top:24px;background:#faf7f2;border:1.5px solid #e2d9cc;border-radius:12px;padding:16px 20px">
        <div style="font-size:11.5px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">Teacher Add-Ons — Charged to Your Account</div>
        ${extras.join('')}
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0 0"><span style="font-size:12.5px;font-weight:700;color:#1a2332">Total Add-On Charges</span><span style="font-size:15px;font-weight:700;color:#92400e">$${grandTotal} USD</span></div>
        <div style="font-size:11.5px;color:#9ca3af;margin-top:6px;font-style:italic">These charges will be added to your room account balance.</div>
      </div>`;
    })()}`;
}

function tsActivityDateChange(idx,newDate){
  const savedId=(localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id'));
  const bk=AppData.bookings.find(b=>b.id===savedId);if(!bk||!bk.retreatActivities)return;
  if(bk.retreatActivities[idx])bk.retreatActivities[idx].date=newDate;
  saveAll();
  showToast('Day updated — Amansala will see your preference.');
}

// Admin: view schedule request for a booking
function openScheduleViewer(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);
  if(!bk){showToast('Booking not found — try refreshing the page.');return;}
  if(!bk.scheduleRequest||!bk.scheduleRequest.submittedAt){showToast('No schedule submitted yet for this retreat.');return;}
  const sr=bk.scheduleRequest;
  const win=TS_WINDOWS.find(w=>w.id===sr.window);
  const shalaName=id=>SHALAS.find(s=>s.id===id)?.name||'—';
  const dur=n=>n?`${n} min`:'—';
  const fmtT=t=>t?tsFmt(t):'—';
  const durReq=txt=>txt?`<br><span style="color:#b45309;font-weight:700">⚠️ Requested longer: ${txt} — adjust the schedule to match</span>`:'';
  let html=`<div style="font-size:13px;line-height:1.8;color:var(--dark)">`;
  if(sr.hasArrivalClass&&sr.arrivalSlot){html+=`<div style="margin-bottom:14px"><b>${tsEffClassLabel(sr,'arrival','Arrival Evening Class')}</b><br>
    Start: ${fmtT(sr.arrivalSlot)} · Duration: ${dur(sr.arrivalDur)}<br>
    Shala: ${shalaName(sr.arrivalShala1)}${sr.arrivalNotes?'<br><span style="color:var(--muted)">'+sr.arrivalNotes+'</span>':''}${durReq(sr.arrivalDurRequest)}
  </div>`;}
  {
    const mornOvs=(bk.scheduleTimeOverrides||[]).filter(o=>o.period==='morn').sort((a,b)=>a.date.localeCompare(b.date));
    const fmtD=ds=>{const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});};
    html+=`<div style="margin-bottom:14px"><b>Morning Class — Day by Day</b><br>
      ${mornOvs.length?mornOvs.map(o=>`${fmtD(o.date)}: ${fmtT(o.start)} · ${dur(o.dur)} · ${shalaName(o.shala1||sr.morningShala1)}${o.label?' · '+o.label:''}${o.coTeacher?' · with '+o.coTeacher:''}`).join('<br>'):'<span style="color:var(--muted)">Not yet set</span>'}
    </div>`;
  }
  if(sr.hasAfternoon){
    const aftOvs=(bk.scheduleTimeOverrides||[]).filter(o=>o.period==='aft').sort((a,b)=>a.date.localeCompare(b.date));
    const fmtD=ds=>{const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});};
    html+=`<div style="margin-bottom:14px"><b>Afternoon Class — Day by Day</b><br>
    ${aftOvs.length?aftOvs.map(o=>`${fmtD(o.date)}: ${fmtT(o.start)} · ${dur(o.dur)} · ${shalaName(o.shala1||sr.afternoonShala1)}${o.label?' · '+o.label:''}${o.coTeacher?' · with '+o.coTeacher:''}`).join('<br>'):'<span style="color:var(--muted)">Not yet set</span>'}
  </div>`;}
  if(sr.hasDepartureClass&&sr.departureSlot){html+=`<div style="margin-bottom:14px"><b>${tsEffClassLabel(sr,'departure','Departure Morning Class')}</b><br>
    Start: ${fmtT(sr.departureSlot)} · Duration: ${dur(sr.departureDur)}<br>
    Shala: ${shalaName(sr.departureShala1)}${sr.departureNotes?'<br><span style="color:var(--muted)">'+sr.departureNotes+'</span>':''}${durReq(sr.departureDurRequest)}
  </div>`;}
  // 2nd-choice note for admin
  const sv2Parts=[];
  if(sr.hasArrivalClass&&sr.arrivalShala2)sv2Parts.push('Arrival: <b>'+shalaName(sr.arrivalShala2)+'</b>');
  if(sr.morningShala2)sv2Parts.push('Morning: <b>'+shalaName(sr.morningShala2)+'</b>');
  if(sr.hasAfternoon&&sr.afternoonShala2)sv2Parts.push('Afternoon: <b>'+shalaName(sr.afternoonShala2)+'</b>');
  if(sr.hasDepartureClass&&sr.departureShala2)sv2Parts.push('Departure: <b>'+shalaName(sr.departureShala2)+'</b>');
  if(sv2Parts.length){html+=`<div style="margin-bottom:14px;padding:8px 12px;background:#f0f9f9;border:1px solid #b2d8d8;border-radius:8px;font-size:12px;color:#4b7070"><span style="font-weight:700">Shala 2nd Choice:</span> ${sv2Parts.join(' · ')} — assign if 1st preference unavailable.</div>`;}
  if(sr.hasWorkshop&&sr.workshops&&sr.workshops.some(w=>w.enabled)){
    const activeWs=sr.workshops.filter(w=>w.enabled);
    html+=`<div style="margin-bottom:14px"><b>Mid-Afternoon Classes (${activeWs.length} day${activeWs.length>1?'s':''})</b><br>`;
    activeWs.forEach(w=>{
      const fmtSlot=t=>{if(!t)return'—';const[h,m]=t.split(':').map(Number);const ampm=h<12?'AM':'PM';return(h>12?h-12:h)+':'+(String(m).padStart(2,'0'))+' '+ampm;};
      html+=`<div style="margin-top:6px;padding:8px 10px;background:#f0f9f9;border-radius:6px;font-size:12.5px">${w.label} · ${fmtSlot(w.start)} · ${w.dur} min${w.shala1?' · Shala: '+shalaName(w.shala1)+(w.shala2?' / '+shalaName(w.shala2):''):''}${w.notes?'<br><span style="color:var(--muted)">'+w.notes+'</span>':''}</div>`;
    });
    html+=`</div>`;
  }
  const _mLabels={system:'Uses music (Amansala system)',own:'Travels with own mic',none:'Quiet classes — no music',av:'Needs audio visual (fee may apply)'};
  const _mArr=Array.isArray(sr.music)?sr.music:(sr.music?[sr.music]:[]);
  html+=`<div style="margin-bottom:14px"><b>Music:</b> ${_mArr.length?_mArr.map(m=>_mLabels[m]||m).join(', '):'Not specified'}</div>`;
  if(sr.shalaFlexibility){html+=`<div style="margin-bottom:14px"><b>Shala Preference:</b> ${sr.shalaFlexibility==='flexible'?'Happy to move around — any favourite shala works':'Prefers not to move around — keep same shala each day'}</div>`;}
  if(sr.bowlRental&&sr.bowlQty&&sr.bowlDays&&sr.bowlDays.length){
    const DAYS2=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];const MONTHS2=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const slots=(sr.bowlDays||[]).reduce((n,e)=>n+(e.am?1:0)+(e.pm?1:0),0);
    const bowlTotal=sr.bowlQty*slots*15;
    const bowlLines=sr.bowlDays.map(e=>{const dt=pd(e.date);const parts=[];if(e.am)parts.push('AM');if(e.pm)parts.push('PM');return `${DAYS2[dt.getDay()]} ${MONTHS2[dt.getMonth()]} ${dt.getDate()} (${parts.join(' & ')})`;}).join(', ');
    html+=`<div style="margin-bottom:14px;padding:10px 14px;background:#f0f9f9;border:1px solid #b2d8d8;border-radius:8px"><b style="color:var(--teal)">🎵 Singing Bowl Rental:</b> ${sr.bowlQty} bowl${sr.bowlQty>1?'s':''} · ${bowlLines} · <b>$${bowlTotal} USD</b></div>`;
  }
  if(sr.specialReq)html+=`<div style="margin-bottom:14px"><b>Special Requests:</b><br>${sr.specialReq}</div>`;
  const actCount=(bk.retreatActivities||[]).length;
  const tourMode=sr.tourMode||'auto';
  html+=`<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:8px">Tours &amp; Ceremonies</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;border:1.5px solid ${tourMode==='none'?'var(--teal)':'var(--border)'};border-radius:8px;font-size:12px;font-weight:600;color:var(--dark)">
        <input type="radio" name="svTourMode_${bkId}" ${tourMode==='none'?'checked':''} onchange="svSetTourMode('${bkId}','none')" style="accent-color:var(--teal)"> Do Not Assign Any Tours
      </label>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;border:1.5px solid ${tourMode==='custom'?'var(--teal)':'var(--border)'};border-radius:8px;font-size:12px;font-weight:600;color:var(--dark)">
        <input type="radio" name="svTourMode_${bkId}" ${tourMode==='custom'?'checked':''} onchange="svSetTourMode('${bkId}','custom')" style="accent-color:var(--teal)"> Custom — I'll Pick Each One
      </label>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;border:1.5px solid ${tourMode==='auto'?'var(--teal)':'var(--border)'};border-radius:8px;font-size:12px;font-weight:600;color:var(--dark)">
        <input type="radio" name="svTourMode_${bkId}" ${tourMode==='auto'?'checked':''} onchange="svSetTourMode('${bkId}','auto')" style="accent-color:var(--teal)"> Auto-Assign
      </label>
    </div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    <span style="font-size:12.5px;color:var(--muted);flex:1">${actCount?`${actCount} tour${actCount!==1?'s/ceremonies':'/ceremony'} assigned to retreat days`:'No activities assigned yet'}</span>
    ${actCount?`<button class="btn" style="font-size:12px;white-space:nowrap;background:#fff;border:1.5px solid #7c3aed;color:#7c3aed" onclick="svSyncPrepaidFlags('${bkId}')">✓ Sync Prepaid</button>`:''}
    <button class="btn btn-primary" style="font-size:12px;white-space:nowrap;background:#059669;border-color:#059669" onclick="svAutoAssignActivities('${bkId}')">⚡ Auto-Assign Activities</button>
    </div>
  </div>`;
  html+=svActivityEditorHtml(bk,bkId);
  html+=`</div>
  <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--border)">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:8px">Status</div>
    ${(()=>{
      const st=sr.adminStatus||'pending';
      const cfg={confirmed:{bg:'#dcfce7',color:'#15803d',icon:'✓',label:'Schedule Confirmed'},changes:{bg:'#fef3c7',color:'#92400e',icon:'⚠',label:'Changes Requested'},pending:{bg:'#f1f5f9',color:'#475569',icon:'○',label:'Pending Review'}};
      const c=cfg[st]||cfg.pending;
      return `<div style="display:inline-flex;align-items:center;gap:8px;background:${c.bg};border:1.5px solid ${c.color}40;border-radius:8px;padding:7px 14px;margin-bottom:12px;font-size:13px;font-weight:700;color:${c.color}">${c.icon} ${c.label}</div>`;
    })()}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <button class="btn btn-secondary" style="font-size:12px${(sr.adminStatus||'pending')==='pending'?';background:#f1f5f9;font-weight:700':''}" onclick="tsAdminStatus('${bkId}','pending')">○ Pending</button>
      <button class="btn btn-primary" style="font-size:12px;background:${(sr.adminStatus==='confirmed')?'#15803d':'#16a34a'};border-color:${(sr.adminStatus==='confirmed')?'#15803d':'#16a34a'}" onclick="tsAdminStatus('${bkId}','confirmed')">✓ Confirm Schedule</button>
      <button class="btn btn-secondary" style="font-size:12px;color:#dc2626;border-color:#fca5a5" onclick="svToggleChangesForm('${bkId}')">✎ Request Changes</button>
    </div>

    <!-- Admin Editable Changes Form -->
    <div id="svChangesForm" style="display:${sr.adminStatus==='changes'?'block':'none'};background:#fff8f0;border:1.5px solid #fdba74;border-radius:10px;padding:16px;margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;color:#c2410c;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px">&#9999;&#65039; Admin Schedule Adjustments — will be sent to teacher</div>

      <!-- Morning -->
      <div style="margin-bottom:12px">
        <div style="font-size:11.5px;font-weight:700;color:#1e4f4f;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Morning Class</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:120px">
            <label style="font-size:11px;color:var(--muted);font-weight:600;display:block;margin-bottom:3px">Start Time</label>
            <input type="time" id="svAdjMorningStart" class="finp" value="${sr.adminOverride?.morningStart||tsUsualMorning(bk).start||''}" style="width:100%">
          </div>
          <div style="flex:1;min-width:120px">
            <label style="font-size:11px;color:var(--muted);font-weight:600;display:block;margin-bottom:3px">Duration (min)</label>
            <input type="number" id="svAdjMorningDur" class="finp" value="${sr.adminOverride?.morningDur||tsUsualMorning(bk).dur||90}" min="30" max="180" step="15" style="width:100%">
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
          <div style="flex:1;min-width:120px">
            <label style="font-size:11px;color:var(--muted);font-weight:600;display:block;margin-bottom:3px">Assigned Shala</label>
            <select id="svAdjMorningShala1" class="finp" style="width:100%">
              <option value="">— No change —</option>
              ${SHALAS.map(s=>'<option value="'+s.id+'" '+((sr.adminOverride?.morningShala1||sr.morningShala1)===s.id?'selected':'')+'>'+s.name+'</option>').join('')}
            </select>
          </div>
          <div style="flex:1;min-width:120px">
            <label style="font-size:11px;color:var(--muted);font-weight:600;display:block;margin-bottom:3px">2nd Shala (optional)</label>
            <select id="svAdjMorningShala2" class="finp" style="width:100%">
              <option value="">— None —</option>
              ${SHALAS.map(s=>'<option value="'+s.id+'" '+((sr.adminOverride?.morningShala2||sr.morningShala2)===s.id?'selected':'')+'>'+s.name+'</option>').join('')}
            </select>
          </div>
        </div>
      </div>

      ${sr.hasAfternoon?`
      <!-- Afternoon -->
      <div style="margin-bottom:12px">
        <div style="font-size:11.5px;font-weight:700;color:#1e4f4f;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Afternoon Class</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:120px">
            <label style="font-size:11px;color:var(--muted);font-weight:600;display:block;margin-bottom:3px">Start Time</label>
            <input type="time" id="svAdjAfternoonStart" class="finp" value="${sr.adminOverride?.afternoonStart||sr.afternoonSlot||sr.afternoonStart||''}" style="width:100%">
          </div>
          <div style="flex:1;min-width:120px">
            <label style="font-size:11px;color:var(--muted);font-weight:600;display:block;margin-bottom:3px">Duration (min)</label>
            <input type="number" id="svAdjAfternoonDur" class="finp" value="${sr.adminOverride?.afternoonDur||sr.afternoonDur||75}" min="30" max="180" step="15" style="width:100%">
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
          <div style="flex:1;min-width:120px">
            <label style="font-size:11px;color:var(--muted);font-weight:600;display:block;margin-bottom:3px">Assigned Shala</label>
            <select id="svAdjAfternoonShala1" class="finp" style="width:100%">
              <option value="">— No change —</option>
              ${SHALAS.map(s=>'<option value="'+s.id+'" '+((sr.adminOverride?.afternoonShala1||sr.afternoonShala1)===s.id?'selected':'')+'>'+s.name+'</option>').join('')}
            </select>
          </div>
          <div style="flex:1;min-width:120px">
            <label style="font-size:11px;color:var(--muted);font-weight:600;display:block;margin-bottom:3px">2nd Shala (optional)</label>
            <select id="svAdjAfternoonShala2" class="finp" style="width:100%">
              <option value="">— None —</option>
              ${SHALAS.map(s=>'<option value="'+s.id+'" '+((sr.adminOverride?.afternoonShala2||sr.afternoonShala2)===s.id?'selected':'')+'>'+s.name+'</option>').join('')}
            </select>
          </div>
        </div>
      </div>`:''}
    </div>

    <label style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);display:block;margin-bottom:6px">Note to Teacher</label>
    <textarea id="tsAdminNoteInput" style="width:100%;height:80px;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:'Jost',sans-serif;font-size:13px;background:var(--sand);outline:none;resize:vertical;box-sizing:border-box" placeholder="Explain what needs to change...">${sr.adminNote||''}</textarea>

    <!-- Send Changes btn -->
    <button id="svSendChangesBtn" onclick="tsSendAdminChanges('${bkId}')" style="display:${sr.adminStatus==='changes'?'flex':'none'};margin-top:10px;width:100%;justify-content:center;padding:10px;background:#ea580c;color:#fff;border:none;border-radius:8px;font-family:'Jost',sans-serif;font-size:13px;font-weight:600;cursor:pointer">Send Changes to Teacher</button>
  </div>`;
  // Teacher room & charge breakdown
  const teacherReg=AppData.regs.find(r=>r.bookingId===bkId&&r.isTeacherRoom);
  const trType=teacherReg?AppData.roomTypes.find(t=>t.id===teacherReg.roomTypeId):null;
  const nights=getNights(bk);
  html+=`<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:10px">Teacher Room &amp; Charges</div>`;
  if(teacherReg){
    const roomRate=trType?trType.price1:0;
    const roomTotal=teacherReg.customPrice||roomRate*nights;
    const sr2=bk.scheduleRequest;
    let chargeRows=`<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px solid #f1f5f9"><span>Room ${teacherReg.room} — ${trType?.name||'?'} (${nights} nights × $${roomRate})</span><span style="font-weight:700">${fmt$(roomTotal)}</span></div>`;
    if(sr2?.bowlRental&&sr2.bowlQty&&sr2.bowlDays?.length){const slots=(sr2.bowlDays||[]).reduce((n,e)=>n+(e.am?1:0)+(e.pm?1:0),0);const bt=sr2.bowlQty*slots*15;chargeRows+=`<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px solid #f1f5f9"><span>Singing Bowl Rental (${sr2.bowlQty} bowl${sr2.bowlQty>1?'s':''} × ${slots} class${slots>1?'es':''})</span><span style="font-weight:700">${fmt$(bt)}</span></div>`;}
    if(sr2?.setupService&&sr2.setupDays?.length){const setupDays=sr2.setupDays.reduce((n,e)=>n+(e.am?1:0)+(e.pm?1:0),0);const st=setupDays*25;chargeRows+=`<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px solid #f1f5f9"><span>Class Setup Service (${setupDays} session${setupDays>1?'s':''})</span><span style="font-weight:700">${fmt$(st)}</span></div>`;}
    const{charged}=calcBkBalance(bk);
    chargeRows+=`<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:6px 0;color:var(--teal)"><span>Total</span><span>${fmt$(charged)}</span></div>`;
    html+=chargeRows;
  }else{
    html+=`<div style="font-size:12.5px;color:var(--muted);font-style:italic">No teacher room assigned yet — will be auto-assigned when room list is sent.</div>`;
  }
  html+='</div>';
  // Conflict check — prepend warning if any shala conflicts found
  const svConflicts=svGetConflicts(bkId);
  if(svConflicts.length){
    const conflictHtml='<div style="background:#fef3c7;border:1.5px solid #fcd34d;border-radius:10px;padding:14px 16px;margin-bottom:16px">'
      +'<div style="font-size:12.5px;font-weight:700;color:#92400e;margin-bottom:8px">&#9888;&#65039; Shala Conflict Detected</div>'
      +svConflicts.map(c=>{
        const shalaNames=c.shalas.map(id=>SHALAS.find(s=>s.id===id)?.name||id).join(', ');
        return '<div style="font-size:12px;color:#78350f;margin-bottom:8px;padding:8px 10px;background:#fffbeb;border-radius:6px">'
          +'<b>'+(c.otherBk.leaderName||c.otherBk.retreatName)+'</b> has the <b>'+shalaNames+'</b> during '+c.period+' class (their time: '+(c.otherTime?tsFmt(c.otherTime):'—')+')'+'.'
          +'<button onclick="svNotifyConflict(\''+c.otherBk.id+'\',\''+bkId+'\',\''+c.shalas.join(',')+'\',\''+c.period+'\')" '
          +'style="display:block;margin-top:6px;font-size:11px;padding:3px 10px;background:#fff;border:1px solid #fcd34d;border-radius:5px;cursor:pointer;color:#92400e;font-family:\'Jost\',sans-serif">'
          +'&#128231; Notify '+(c.otherBk.leaderName||'Teacher')+' of Conflict'
          +'</button>'
          +'</div>';
      }).join('')
      +'</div>';
    html=conflictHtml+html;
  }
  document.getElementById('svBody').innerHTML=html;
  document.getElementById('svTitle').textContent=`Schedule — ${bk.leaderName||bk.retreatName}`;
  document.getElementById('svSub').textContent=`${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}`;
  document.getElementById('_svBkId').value=bkId;
  openModal('scheduleViewerModal');
}

function tsAdminStatus(bkId,status){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk||!bk.scheduleRequest)return;
  bk.scheduleRequest.adminStatus=status;
  bk.scheduleRequest.adminNote=document.getElementById('tsAdminNoteInput')?.value||'';
  // Auto-assign tours & ceremonies when schedule is confirmed — unless the
  // admin chose "Do Not Assign" or "Custom" (manual editor) for this retreat.
  const tourModeOnConfirm=bk.scheduleRequest.tourMode||'auto';
  if(status==='confirmed'&&tourModeOnConfirm==='auto'){
    const prepaidMap={};
    (bk.retreatActivities||[]).forEach(a=>{if(a.prepaid)prepaidMap[a.aoId+':'+a.date]=true;});
    bk.retreatActivities=[];
    const nights=getNights(bk);
    const sr=bk.scheduleRequest;
    const gitanoNight=sr?.offsiteChoice==='gitano'&&sr.offsiteNight&&bk.startDate
      ?fmtISO(new Date(pd(bk.startDate).getTime()+(parseInt(sr.offsiteNight)-1)*DAY_MS)):null;
    const addedAoIds=new Set();
    // Start at i=1 — arrival day never gets tours/ceremonies, only check-in/snack/arrival class.
    for(let i=1;i<nights;i++){
      const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
      const tmpls=SKED_AUTO_TEMPLATE[d.getDay()];
      if(!tmpls)continue;
      const ds=fmtISO(d);
      tmpls.forEach(t=>{
        if(addedAoIds.has(t.aoId))return;
        if(gitanoNight&&ds===gitanoNight&&(t.time||'')>='18:00')return;
        bk.retreatActivities.push({aoId:t.aoId,date:ds,time:t.time,prepaid:!!(prepaidMap[t.aoId+':'+ds])||(bk.packages||[]).includes(t.aoId)});
        addedAoIds.add(t.aoId);
      });
    }
    // Add Gitano as optional activity (not prepaid) — admin must explicitly add to packages if charging
    if(sr.offsiteChoice==='gitano'&&sr.offsiteNight&&bk.startDate){
      const gitanoDate=fmtISO(new Date(pd(bk.startDate).getTime()+(parseInt(sr.offsiteNight)-1)*DAY_MS));
      const alreadyHasGitano=(bk.retreatActivities||[]).some(a=>a.aoId==='ao13');
      if(!alreadyHasGitano&&gitanoDate!==bk.startDate)bk.retreatActivities.push({aoId:'ao13',date:gitanoDate,time:'19:30',prepaid:false});
    }
    // Honor specific date requests for prepaid activities
    const reqDates=parseRequestedDates(sr.specialReq,bk);
    const pkgs=bk.packages||[];
    Object.entries(reqDates).forEach(([aoId,reqDate])=>{
      if(!pkgs.includes(aoId))return;
      const existing=bk.retreatActivities.find(a=>a.aoId===aoId);
      if(existing){existing.date=reqDate;}
      else{const tmpl=Object.values(SKED_AUTO_TEMPLATE).flat().find(t=>t.aoId===aoId);bk.retreatActivities.push({aoId,date:reqDate,time:tmpl?.time||'',prepaid:true});}
    });
    logActivity('Activities auto-assigned',`${bk.leaderName||bk.retreatName} — tours & ceremonies set`,bkId);
    bk.retreatActivitiesUpdatedAt=new Date().toISOString();
  }
  saveAll();buildDashboard();venBuild();
  logActivity('Schedule '+(status==='confirmed'?'confirmed':status==='changes'?'changes requested':'marked pending'),`${bk.leaderName||bk.retreatName}`,bkId);
  closeModal('scheduleViewerModal');
  showToast(status==='confirmed'?'✓ Schedule confirmed — tours & ceremonies assigned!':status==='changes'?'Changes requested.':'Marked as pending.');
  // Re-open viewer so the updated status badge is visible immediately
  if(status==='confirmed'||status==='changes') openScheduleViewer(bkId);
  // Auto-update menu schedule for every week of this retreat
  if(status==='confirmed'&&bk.startDate&&bk.endDate){
    const savedMonday=menuCurrentMonday;
    let cur=new Date(menuGetSunday(bk.startDate)+'T12:00:00');
    const endD=new Date(bk.endDate+'T12:00:00');
    while(cur<=endD){
      menuCurrentMonday=cur.toISOString().split('T')[0];
      menuPopulateFromRetreats(true);
      cur.setDate(cur.getDate()+7);
    }
    menuCurrentMonday=savedMonday||menuGetSunday(new Date());
  }
}

// ── Activity management inside schedule viewer ──
// Every day of the retreat EXCEPT arrival and departure — the only days a
// tour/ceremony/optional activity may ever be scheduled on, matching the
// day-of-week auto-assign template and the hard arrival-day backstops
// enforced everywhere else in the app.
function svValidActivityDays(bk){
  if(!bk?.startDate||!bk?.endDate)return[];
  const DAY_NAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MON_NAMES=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const nights=Math.max(1,Math.round((pd(bk.endDate)-pd(bk.startDate))/DAY_MS));
  const out=[];
  for(let i=1;i<nights;i++){
    const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
    out.push({date:fmtISO(d),label:DAY_NAMES[d.getDay()]+' '+MON_NAMES[d.getMonth()]+' '+d.getDate()});
  }
  return out;
}
// Morning start time now lives entirely day-by-day (no retreat-wide
// default) — arrival/departure days that don't have their own explicit
// class fall back to "the usual morning time," which we derive from the
// first day-by-day entry rather than a now-nonexistent sr.morningStart.
function tsUsualMorning(bk){
  const ov=(bk.scheduleTimeOverrides||[]).find(o=>o.period==='morn');
  if(ov)return{start:ov.start,dur:ov.dur||60,shala1:ov.shala1||''};
  return{start:'',dur:60,shala1:''};
}
function svActivityEditorHtml(bk,bkId){
  const acts=bk.retreatActivities||[];
  const days=svValidActivityDays(bk);
  const dayOptions=(selected)=>days.map(d=>`<option value="${d.date}"${d.date===selected?' selected':''}>${d.label}</option>`).join('');
  const sorted=acts.map((a,idx)=>({a,idx})).sort((x,y)=>(x.a.date+x.a.time).localeCompare(y.a.date+y.a.time));
  const rows=sorted.map(({a,idx})=>{
    const ao=(typeof ADD_ONS!=='undefined'?ADD_ONS:[]).find(x=>x.id===a.aoId);
    const name=ao?.name||a.aoId;
    const invalidDay=a.date===bk.startDate||a.date===bk.endDate;
    return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid var(--border)">
      <span style="flex:1;min-width:140px;font-size:12.5px;font-weight:600;color:var(--dark)">${escHtml(name)}</span>
      <select onchange="svChangeActivityDate('${bkId}',${idx},this.value)" style="padding:5px 8px;border:1.5px solid ${invalidDay?'#dc2626':'var(--border)'};border-radius:7px;font-family:'Jost',sans-serif;font-size:12px;background:var(--sand)">
        ${invalidDay?`<option value="${a.date}" selected>⚠ Invalid day — pick one</option>`:''}
        ${dayOptions(a.date)}
      </select>
      <input type="time" value="${a.time||''}" onchange="svChangeActivityTime('${bkId}',${idx},this.value)" style="padding:5px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12px;background:var(--sand)">
      <label style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--muted);cursor:pointer;white-space:nowrap"><input type="checkbox" ${a.prepaid?'checked':''} onchange="svToggleActivityPrepaid('${bkId}',${idx})">Prepaid</label>
      <button onclick="svRemoveActivity('${bkId}',${idx})" title="Remove" style="border:none;background:none;color:#dc2626;font-size:16px;cursor:pointer;line-height:1;padding:2px 6px">&times;</button>
    </div>`;
  }).join('');
  const aoOptions=(typeof ADD_ONS!=='undefined'?ADD_ONS:[]).map(a=>`<option value="${a.id}">${escHtml(a.name)}</option>`).join('');
  return `<div style="margin-top:14px;border:1.5px solid var(--border);border-radius:10px;overflow:hidden">
    <div style="padding:8px 10px;background:#f8f5f0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)">Assigned Activities — edit day, time, or remove</div>
    ${rows||'<div style="padding:14px;text-align:center;color:var(--muted);font-size:12.5px">None assigned yet.</div>'}
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px">
      <select id="svAddAoId" style="flex:1;min-width:150px;padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12px;background:#fff"><option value="">+ Add an activity…</option>${aoOptions}</select>
      <select id="svAddAoDate" style="padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12px;background:#fff">${dayOptions()}</select>
      <input type="time" id="svAddAoTime" value="11:45" style="padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:'Jost',sans-serif;font-size:12px;background:#fff">
      <button class="btn btn-primary" style="font-size:12px;white-space:nowrap" onclick="svAddActivity('${bkId}')">+ Add</button>
    </div>
  </div>`;
}
function svAddActivity(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const aoId=document.getElementById('svAddAoId')?.value;
  const date=document.getElementById('svAddAoDate')?.value;
  const time=document.getElementById('svAddAoTime')?.value||'';
  if(!aoId){showToast('Please select an activity.');return;}
  if(!date){showToast('Please pick a day — activities can\'t be scheduled on the arrival or departure day.');return;}
  if(date===bk.startDate||date===bk.endDate){showToast('Activities can\'t be scheduled on the arrival or departure day.');return;}
  if(!bk.retreatActivities)bk.retreatActivities=[];
  if(bk.retreatActivities.some(a=>a.aoId===aoId)){
    const name=(typeof ADD_ONS!=='undefined'?ADD_ONS.find(a=>a.id===aoId)?.name:null)||'This activity';
    showToast(`${name} is already scheduled for this retreat — edit its existing date/time instead of adding it again.`);
    return;
  }
  const isGitano=aoId==='ao13';
  const defaultTime=isGitano?'19:30':time;
  bk.retreatActivities.push({aoId,date,time:defaultTime,prepaid:isGitano});
  if(isGitano){
    if(!bk.packages)bk.packages=[];
    if(!bk.packages.includes('ao13'))bk.packages.push('ao13');
    if(bk.scheduleRequest&&!bk.scheduleRequest.offsiteChoice){
      bk.scheduleRequest.offsiteChoice='gitano';
      if(date&&bk.startDate){
        const nightNum=Math.round((pd(date)-pd(bk.startDate))/DAY_MS)+1;
        bk.scheduleRequest.offsiteNight=String(nightNum);
      }
    }
  }
  bk.retreatActivitiesUpdatedAt=new Date().toISOString();
  saveAll();openScheduleViewer(bkId);
}
function svRemoveActivity(bkId,idx){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk||!bk.retreatActivities)return;
  bk.retreatActivities.splice(idx,1);
  bk.retreatActivitiesUpdatedAt=new Date().toISOString();
  saveAll();openScheduleViewer(bkId);
}
function svChangeActivityDate(bkId,idx,newDate){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk||!bk.retreatActivities)return;
  const act=bk.retreatActivities[idx];if(!act)return;
  if(!newDate||newDate===bk.startDate||newDate===bk.endDate){showToast('Activities can\'t be scheduled on the arrival or departure day.');openScheduleViewer(bkId);return;}
  act.date=newDate;
  bk.retreatActivitiesUpdatedAt=new Date().toISOString();
  saveAll();openScheduleViewer(bkId);
}
function svChangeActivityTime(bkId,idx,newTime){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk||!bk.retreatActivities)return;
  const act=bk.retreatActivities[idx];if(!act)return;
  act.time=newTime;
  bk.retreatActivitiesUpdatedAt=new Date().toISOString();
  saveAll();openScheduleViewer(bkId);
}
function svToggleActivityPrepaid(bkId,idx){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk||!bk.retreatActivities)return;
  const act=bk.retreatActivities[idx];if(!act)return;
  act.prepaid=!act.prepaid;
  bk.retreatActivitiesUpdatedAt=new Date().toISOString();
  saveAll();openScheduleViewer(bkId);
}

// Duration in minutes for each activity (used to calculate end time on schedule)
const ACTS_DUR={
  ao1:150, // Tulum Ruins — 2.5 hrs
  ao2:180, // Muyil Float Tour — 3 hrs
  ao3:150, // Atik Cenote — 2.5 hrs
  ao4:60,  // Sound Healing & Cacao Ceremony — 1 hr
  ao5:90,  // Temazcal — 1.5 hrs
  ao6:150, // Grande Cenote — 2.5 hrs
  ao7:150, // Mangrove Tour — 2.5 hrs
  ao9:45,  // Mayan Clay — 45 min
  ao10:60, // Ice Bath & Breathwork — 1 hr
  ao12:90, // Salsa Night — 1.5 hrs
  ao13:120, // Gitano Dinner — 2 hrs
  ao14:90,  // Cooking Class — 1.5 hrs
};
const ACT_SHALA={ao4:'Grande',ao12:'Grande'};

const SKED_AUTO_TEMPLATE={
  0:[ // Sunday
    {aoId:'ao7',  time:'11:45'}, // Mangrove Tour, 11:45 AM
    {aoId:'ao10', time:'15:00'}, // Ice Bath & Breathwork, 3:00 PM
    {aoId:'ao12', time:'20:30'}, // Salsa Night, post-dinner
  ],
  1:[ // Monday
    {aoId:'ao1',  time:'11:45'}, // Tulum Ruins, 11:45 AM
    {aoId:'ao4',  time:'19:15'}, // Cacao & Sound Healing, 7:15 PM
  ],
  2:[ // Tuesday
    {aoId:'ao6',  time:'11:45'}, // Grande Cenote, 11:45 AM
    {aoId:'ao14', time:'17:00'}, // Cooking Class, 5:00 PM
    {aoId:'ao5',  time:'19:15'}, // Temazcal, 7:15 PM
  ],
  3:[ // Wednesday
    {aoId:'ao3',  time:'11:45'}, // Atik Cenote, 11:45 AM
    {aoId:'ao9',  time:'15:00'}, // Mayan Clay, 3:00 PM
    {aoId:'ao12', time:'20:30'}, // Salsa Night, post-dinner
  ],
  4:[ // Thursday
    {aoId:'ao2',  time:'10:30'}, // Muyil Float Tour, 10:30 AM
    {aoId:'ao10', time:'15:00'}, // Ice Bath & Breathwork, 3:00 PM
  ],
  5:[ // Friday
    {aoId:'ao3',  time:'11:45'}, // Atik Cenote, 11:45 AM
    {aoId:'ao14', time:'17:00'}, // Cooking Class, 5:00 PM
    {aoId:'ao4',  time:'19:15'}, // Cacao & Sound Healing, 7:15 PM
  ],
  6:[ // Saturday
    {aoId:'ao6',  time:'11:45'}, // Grande Cenote, 11:45 AM
    {aoId:'ao9',  time:'15:00'}, // Mayan Clay, 3:00 PM
    {aoId:'ao5',  time:'19:15'}, // Temazcal, 7:15 PM
  ],
};

function parseRequestedDates(specialReq,bk){
  if(!specialReq||!bk.startDate)return{};
  const KW={
    ao1:['ruins','tulum ruins'],
    ao2:['muyil','float tour','float'],
    ao3:['atik cenote','atik'],
    ao4:['sound heal','cacao'],
    ao5:['temazcal','temaz'],
    ao6:['grande cenote'],
    ao7:['mangrove'],
    ao9:['mayan clay','clay ceremony','clay'],
    ao10:['ice bath','breathwork'],
    ao12:['salsa'],
    ao13:['gitano'],
    ao14:['cooking'],
  };
  const MO={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  const year=new Date(bk.startDate).getFullYear();
  const result={};
  specialReq.toLowerCase().split(/[,;]+/).forEach(part=>{
    let aoId=null;
    for(const[id,kws]of Object.entries(KW)){if(kws.some(k=>part.includes(k))){aoId=id;break;}}
    if(!aoId)return;
    const m=part.match(/([a-z]+)\s+(\d{1,2})/);
    if(!m)return;
    const mon=MO[m[1].slice(0,3)];
    if(mon===undefined)return;
    const date=new Date(year,mon,parseInt(m[2]));
    if(date>pd(bk.startDate)&&date<=pd(bk.endDate))result[aoId]=fmtISO(date);
  });
  return result;
}

function svAutoAssignActivities(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  // Preserve any manually marked prepaid flags, then reset auto-assigned entries
  const prepaidMap={};
  (bk.retreatActivities||[]).forEach(a=>{if(a.prepaid)prepaidMap[a.aoId+':'+a.date]=true;});
  bk.retreatActivities=[];
  const nights=getNights(bk);
  let added=0;
  const sr=bk.scheduleRequest;
  const gitanoNight=sr?.offsiteChoice==='gitano'&&sr.offsiteNight&&bk.startDate
    ?fmtISO(new Date(pd(bk.startDate).getTime()+(parseInt(sr.offsiteNight)-1)*DAY_MS)):null;
  const addedAoIds=new Set();
  // Start at i=1 — arrival day never gets tours/ceremonies, only check-in/snack/arrival class.
  for(let i=1;i<nights;i++){
    const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
    const dow=d.getDay();
    const tmpls=SKED_AUTO_TEMPLATE[dow];
    if(!tmpls)continue;
    const ds=fmtISO(d);
    tmpls.forEach(tmpl=>{
      if(addedAoIds.has(tmpl.aoId))return;
      if(gitanoNight&&ds===gitanoNight&&(tmpl.time||'')>='18:00')return;
      const prepaid=!!(prepaidMap[tmpl.aoId+':'+ds])||(bk.packages||[]).includes(tmpl.aoId);
      bk.retreatActivities.push({aoId:tmpl.aoId,date:ds,time:tmpl.time,prepaid});
      addedAoIds.add(tmpl.aoId);
      added++;
    });
  }
  // Add Gitano as optional activity (not prepaid) — admin must explicitly add to packages if charging
  if(sr?.offsiteChoice==='gitano'&&sr.offsiteNight&&bk.startDate){
    const gitanoDate=fmtISO(new Date(pd(bk.startDate).getTime()+(parseInt(sr.offsiteNight)-1)*DAY_MS));
    const alreadyHasGitano=(bk.retreatActivities||[]).some(a=>a.aoId==='ao13');
    if(!alreadyHasGitano&&gitanoDate!==bk.startDate){bk.retreatActivities.push({aoId:'ao13',date:gitanoDate,time:'19:30',prepaid:false});added++;}
  }
  // Honor specific date requests for prepaid activities
  const reqDates=parseRequestedDates(sr?.specialReq,bk);
  const pkgs=bk.packages||[];
  Object.entries(reqDates).forEach(([aoId,reqDate])=>{
    if(!pkgs.includes(aoId))return;
    const existing=bk.retreatActivities.find(a=>a.aoId===aoId);
    if(existing){existing.date=reqDate;}
    else{const tmpl=Object.values(SKED_AUTO_TEMPLATE).flat().find(t=>t.aoId===aoId);bk.retreatActivities.push({aoId,date:reqDate,time:tmpl?.time||'',prepaid:true});added++;}
  });
  bk.retreatActivitiesUpdatedAt=new Date().toISOString();
  saveAll();
  showToast(`Activities assigned — ${added} tour${added!==1?'s/ceremonies':'/ceremony'} across retreat dates.`);
  openScheduleViewer(bkId);
}

function svSetTourMode(bkId,mode){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk||!bk.scheduleRequest)return;
  bk.scheduleRequest.tourMode=mode;
  saveAll();
  openScheduleViewer(bkId);
}

function svSyncPrepaidFlags(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const pkgs=new Set(bk.packages||[]);
  let changed=0;
  (bk.retreatActivities||[]).forEach(a=>{
    const shouldBe=pkgs.has(a.aoId);
    if(a.prepaid!==shouldBe){a.prepaid=shouldBe;changed++;}
  });
  if(changed)bk.retreatActivitiesUpdatedAt=new Date().toISOString();
  saveAll();
  openScheduleViewer(bkId);
  showToast(changed?`Prepaid flags updated — ${changed} activit${changed!==1?'ies':'y'} corrected.`:'All prepaid flags already match packages.');
}


// ===== TEACHER MODE =====
// ?admin=1 escape hatch — clears teacher flags and reloads as admin
if(new URLSearchParams(window.location.search).get('admin')==='1'){localStorage.removeItem('ama_teacher_persist');localStorage.removeItem('teacher_bk_id');localStorage.setItem('ama_admin_device','1');location.replace(location.pathname);}
// Admin devices are permanently marked — teacher persistence is always cleared on admin devices
if(localStorage.getItem('ama_admin_device')==='1'){localStorage.removeItem('ama_teacher_persist');localStorage.removeItem('teacher_bk_id');}
const IS_TEACHER_MODE=new URLSearchParams(window.location.search).get('mode')==='teacher'||sessionStorage.getItem('ama_teacher_mode')==='1'||(!localStorage.getItem('ama_admin_device')&&localStorage.getItem('ama_teacher_persist')==='1');
const IS_EVENT_MODE=new URLSearchParams(window.location.search).get('mode')==='event';


// ===== TEACHER FAQ =====
const FAQ_DATA=[
  {cat:'Rooms',items:[
    {q:'How many rooms do I have allocated of each type?',a:'We typically allocate a variety of room types unless you specify otherwise. If you\'re planning a couples\' retreat or prefer only doubles, just let us know and we\'ll tailor the room assignments to suit your group. Otherwise, we\'ll provide a balanced mix to accommodate different preferences and budgets.'},
    {q:'What is the difference between the rooms?',a:'We have rooms of varying sizes, layouts, and locations throughout the property, which determine their category. Please refer to our official room descriptions and avoid creating your own, as this helps ensure accurate expectations and avoids over-promising or under-delivering. Our descriptions are the most up-to-date and reliable.'},
    {q:'How do I use my room list?',a:'We will go over how to use your room list in our phone call, but basically you choose the category your client booked and simply click the plus sign and add their name, email, and phone number as well as any notes you think are important.'},
    {q:'When do I need to complete my room list?',a:'Add your guest reservations as you receive them, knowing that adjustments can be made up until the six-week deadline.'},
    {q:'Can I delete a name from my room list?',a:'Unfortunately, once a name has been added to the system, it can\'t be deleted manually. However, you do have the option to edit the name if needed. If you\'d like the name permanently removed and your retreat is more than 6 weeks away, you can contact our online support agents, and they\'ll be happy to assist with the deletion.'},
    {q:'What if I get less than 15 people?',a:'If you have fewer than 15 paying guests, we\'ll provide a $20 USD credit per guest per day, which can be applied toward your own room and board. For example, if you bring 10 guests, you\'ll receive a $200 USD daily credit to offset your stay.'},
    {q:'Can guests arrive early or stay longer?',a:'Yes! Guests can certainly book extra nights at the beginning or end of your retreat. We have a special rate for our yogis.'},
    {q:'What if I sell a double and cannot find a roommate?',a:'Rooms must be filled to capacity. If no roommate is found for shared room, the guest will be placed in a private room and the guest will be required to pay the difference.'},
    {q:'Can two people share a basic?',a:'No. Shared options are only offered on rooms with king beds or two beds.'},
    {q:'What if a guest cancels?',a:'Any cancellation from your attendees after your final payment due date, 3 weeks to your start date, two nights will be charged according to the occupancy type of the booking. For any cancellation with less than 3 weeks to your start date, there is no refund, nor is it transferable.'},
    {q:'Can my student bring their partner if they are not participating?',a:'If you have a student who would like to bring a partner or friend who would not participate in the program, the cost is the same as you see on your retreat document for 2 people sharing a king bed. It is between $130–$150 more per night plus tip and tax depending on the room type.'},
  ]},
  {cat:'Meals',items:[
    {q:'Can I request special meals for my group?',a:'We offer a delicious set menu with a mix of healthy and hearty options. While we stick to this menu, we\'re happy to accommodate food allergies or special dietary needs. Just let us know in advance so we can prepare something your guests will enjoy.'},
    {q:'Do you have a recommendation for our offsite dinner?',a:'<b>Off-Site Dinner at Gitano – A Tulum Favorite</b><br><br>We highly recommend Gitano Tulum for your off-site dinner experience.<br><br><b>Cost:</b> $75 USD per person + 15% tip<br><b>Transportation:</b> $15 USD per person for round trip from Amansala to Gitano<br><br><b>Menu Style:</b> Family-style service with a variety of fresh, local, and flavorful dishes<br><br><b>Sample Menu Highlights:</b><br>• Guacamole with crudités<br>• Green salad with almonds<br>• Black truffle Mexican corn tortilla "pizza" with goat cheese<br>• Shrimp tacos<br>• White local fish steamed in banana leaf<br>• Grilled ribeye (sliced to share)<br>• Smoked sweet potato<br>• Mole cauliflower<br>• Dessert: Churros and baked chocolate topped with vanilla ice cream<br><br><b>Logistics:</b> Meet at the front desk 5 minutes before departure time. We\'ll give you a tip to pass to the manager at Gitano upon arrival. When ready to return, simply message us 30 minutes before pick-up.'},
    {q:'What if I have someone with a severe allergy?',a:'If you have a guest with a severe allergy, we will do our best to accommodate any special dietary needs or requests. However, if the allergy is life-threatening and requires an EpiPen, we kindly require that the guest brings their own EpiPen as a safety precaution.'},
    {q:'Are meal times flexible?',a:'Yes, meal times are flexible! We recommend a flow of: Fruit, Coffee &amp; Tea, Brunch, Afternoon Snack, and Dinner. As a guideline: Plan Brunch about 15 minutes after your morning class. Plan Dinner around 30 minutes to 1 hour after your evening class finishes. This helps your guests refuel and enjoy each meal without feeling rushed.'},
    {q:'Can you accommodate a vegan menu for my group?',a:'Yes! We do recommend checking in with your guests first to ensure they\'re all comfortable with a fully vegan menu for the week. In our past experience, many guests appreciate having some protein options (like eggs or lean fish), especially during active retreats. While our brunch buffet typically includes eggs and other light proteins, if you prefer a fully vegan menu, we would need to serve your group plated rather than buffet-style. Let us know your preference and we\'ll be happy to accommodate!'},
    {q:'Can guests order off the menu?',a:'The food we provide is fresh, healthy, and delicious, and most guests love our set retreat menu. However, if any of your clients are craving something off the menu, we do have other great à la carte options available. These items would be an additional charge and can be signed to their room.'},
    {q:'We do not want to go offsite. Is there an alternative?',a:'No problem at all! We\'re happy to offer your group a special set dinner menu at Amansala for just $30 USD per person per day. Let us know if you\'d like to reserve this option!'},
  ]},
  {cat:'Schedule & Shalas',items:[
    {q:'Do you provide yoga teachers?',a:'We have a team of amazing yoga instructors, and if you prefer to use one of our teachers instead of bringing your own, the rate is: $200 USD per class for up to 8 guests, plus $20 USD per person for each additional guest. For example, if you have 14 guests, the total cost per class would be $320 USD.'},
    {q:'What shala will I be assigned?',a:'Shalas are assigned based on group size and preference. For first-time groups, we recommend being open to trying different spaces if the schedule allows. For groups of 10 during peak season, the Skye Shala is typically assigned unless you\'re flexible with start times. Let us know your preferences and we\'ll do our best to accommodate!'},
    {q:'What equipment do you provide?',a:'We provide yoga mats, blocks, straps, and Mexican blankets for savasana, as well as hand weights, kettlebells, and resistance bands. All shalas are stocked with yoga props so you don\'t need to bring your own. We also have an onsite gym available at $20 USD per person per day (group rate for a private 1-hour session available).'},
    {q:'Do you provide mics?',a:'We do not provide microphones, so if you typically use one in your classes, please bring your own. Some of our shalas have Bluetooth connections that can support both music and a mic simultaneously, but if you have a specific setup, we recommend bringing it with you to ensure compatibility.'},
    {q:'How do I organize excursions and add-on experiences?',a:'There is a 10-person minimum to qualify for group rates. We recommend building activities into your pricing as we offer discounts on pre-booked bundle packages. For groups with over 15 paying guests you can request private ceremonies, though tours will still be shared with other retreats onsite.'},
    {q:'How can I customize my retreat experience?',a:'We highly recommend building an activity package into your retreat pricing. Our spiritual ceremonies are a beautiful way to personalize your retreat and create a powerful group connection. Guest favorites include the Cacao & Sound Healing Ceremony and Mayan Clay Ritual. Many teachers also choose to add beach walks, special workshops, or other custom experiences to enhance the week.'},
    {q:'Can I set up an altar in my shala and have it reserved just for me?',a:'We host multiple retreats each week and have five yoga shalas plus a rooftop deck, all shared among groups onsite. While we can\'t reserve a shala exclusively all day, you\'ll have your assigned space during your scheduled class times. If you\'d like to set up an altar or special décor, we recommend starting 30 minutes early to allow time for setup and cleanup. To keep the schedule running smoothly for everyone, classes must start and finish on time, and most instructors teach 75-minute sessions. For special requests reach out to our retreat team.'},
    {q:'Can I swap out the included Salsa or Cooking for something else?',a:'You cannot replace the cooking class, but you can choose between Salsa or Afro Beats for your included dance class.'},
  ]},
  {cat:'Money & Tipping',items:[
    {q:'What is the Yoga Gratuity?',a:'The $30 USD per person per day yoga gratuity on your rooming list is a mandatory service tip that covers restaurant and kitchen staff. This does not cover housekeeping, bellboys, tour guides, massage therapists, or extra restaurant orders — guests should tip those separately.'},
    {q:'What is the tipping policy in Mexico?',a:'Restaurants & Bars: 15–20% of the bill. Spa Services: 10–20%. Housekeeping: $3–$5 USD per day. Bellboys / Porters: $3–$5 USD per bag. Guides: $5–$10 USD per person. Anyone special: at your discretion. Tipping is always appreciated and can be in pesos or USD (small bills).'},
    {q:'Do restaurants accept USD and pesos?',a:'Yes, both USD and pesos are widely accepted, as well as all major credit cards.'},
    {q:'Can I make my final payment with a credit card?',a:'We do not accept credit card payment for your deposit or final payment. We accept bank wire only.'},
  ]},
  {cat:'Transportation & Logistics',items:[
    {q:'How does transportation work?',a:'Share the transportation link with your attendees (one link per retreat). After a guest submits, they receive a personal link with their own ID — they should save that link to update flight details later. The shared retreat link alone opens a blank form for new submissions. We recommend sending the retreat link 2 months before your dates. The cut-off is 2 weeks before your retreat.'},
    {q:'Where else can I advertise?',a:'<b>1. Instagram (Organic + Paid)</b><br>Use reels and stories showing the beach, yoga shala, and group circles. Collaborate with micro-influencers in the wellness space. Run Meta ads targeting yoga lovers, spiritual travelers, retreat seekers, and digital nomads. Hashtags: #YogaRetreat #TulumYoga #WellnessRetreat #BikiniBootcamp #RetreatYourself<br><br><b>2. Facebook Ads</b><br>Great for targeting travelers over 30, especially women interested in self-development, yoga, and wellness. Target by interest (yoga, meditation, wellness, retreats, self-care). Use lookalike audiences from past guests or your mailing list. Include testimonials and limited-time offers ("Only 3 spots left!").<br><br><b>3. Google Search Ads</b><br>People searching with intent — bid on keywords like "Best yoga retreats Mexico 2025," "Beach yoga retreat January," or "Spiritual retreats in Tulum."<br><br><b>4. BookRetreats.com</b><br>One of the top marketplaces specifically for retreats. Create a listing with high-quality images, clear program details, pricing, and reviews. SEO-boosted visibility and global reach.<br><br><b>5. RetreatGuru.com</b><br>Another strong global retreat directory with serious searchers. Listings allow you to describe your brand philosophy — great for Amansala or Bikini Bootcamp style.<br><br><b>6. Yoga Trade</b><br>Niche site for traveling yogis and retreat organizers. Post your retreat in the events section and recruit guest facilitators or karma yogis for cross-promotion.<br><br><b>7. Wellness &amp; Yoga Influencers</b><br>They drive trust and community-based bookings. Invite influencers (5K–50K followers) in exchange for partial trade or affiliate commissions — and build user-generated content for future promotions.<br><br><b>8. Email Marketing</b><br>One of the highest ROI channels. Build a list via lead magnets (e.g., "Download our 3-day self-care at home retreat plan"). Use Flodesk, Mailchimp, or ConvertKit and send early bird and last chance series.<br><br><b>9. Local Digital Boards</b><br>Tulum Noticeboard (Facebook Group), Tulum Expats &amp; Locals, Yoga in Mexico (Facebook), Spiritual Events Mexico (Telegram &amp; WhatsApp).'},
    {q:'Who do I contact for last-minute requests or questions?',a:'We have a full team that will answer all your questions via email. You can always <a href="https://calendly.com/darlene-amansala/discovery-call-retreats" target="_blank" style="color:#2d6a6a;font-weight:600">book a call with our retreat specialist</a> for more complicated questions. We also offer a discovery call when you first book your retreat.'},
  ]},
];

function faqRender(){
  const container=document.getElementById('faqContent');if(!container)return;
  container.innerHTML=FAQ_DATA.map((section,si)=>`
    <div class="faq-section" data-si="${si}" style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#2d6a6a;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #b2d8d8">${section.cat}</div>
      ${section.items.map((item,ii)=>`
        <div class="faq-item" data-si="${si}" data-ii="${ii}" style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:8px;overflow:hidden;background:#fff">
          <button onclick="faqToggle(${si},${ii})" style="width:100%;text-align:left;background:none;border:none;padding:13px 16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;font-family:'Jost',sans-serif">
            <span class="faq-q" style="font-size:13px;font-weight:600;color:#2d3a3a;line-height:1.5">${item.q}</span>
            <span class="faq-arrow" style="font-size:11px;color:#9a8f82;flex-shrink:0;transition:transform .15s">▸</span>
          </button>
          <div class="faq-ans" style="display:none;padding:0 16px 14px;font-size:13px;color:#5a6a6a;line-height:1.75;border-top:1px solid #f1f5f9">${item.a}</div>
        </div>`).join('')}
    </div>`).join('');
}

function faqToggle(si,ii){
  const item=document.querySelector(`.faq-item[data-si="${si}"][data-ii="${ii}"]`);if(!item)return;
  const ans=item.querySelector('.faq-ans');
  const arrow=item.querySelector('.faq-arrow');
  const open=ans.style.display==='none';
  ans.style.display=open?'block':'none';
  if(arrow)arrow.style.transform=open?'rotate(90deg)':'';
  item.style.borderColor=open?'#b2d8d8':'#e5e7eb';
}

function faqFilter(){
  const raw=(document.getElementById('faqSearch')?.value||'').toLowerCase().trim();
  const container=document.getElementById('faqContent');if(!container)return;
  if(!raw){faqRender();return;}
  const STOP=new Set(['do','does','did','you','your','i','my','we','our','is','are','was','were','be','been','have','has','had','can','could','will','would','should','a','an','the','in','on','at','of','to','for','and','or','but','not','if','it','its','what','when','where','how','why','who','which','this','that','there','about','with','from','so','just','also','any','get','all','need','use']);
  const words=raw.split(/\s+/).filter(w=>w.length>1&&!STOP.has(w));
  // Fall back to all words if nothing meaningful after stop-word removal
  const terms=words.length?words:raw.split(/\s+/).filter(w=>w.length>1);
  if(!terms.length){faqRender();return;}
  // Score every FAQ item by how many terms appear in question + answer
  const scored=[];
  FAQ_DATA.forEach(section=>{
    section.items.forEach(item=>{
      const text=(item.q+' '+item.a).toLowerCase();
      const score=terms.reduce((s,w)=>s+(text.includes(w)?1:0),0);
      if(score>0)scored.push({item,cat:section.cat,score});
    });
  });
  scored.sort((a,b)=>b.score-a.score);
  if(!scored.length){
    container.innerHTML='<p style="color:var(--muted);font-style:italic;font-size:13px">No results found. Try different keywords or email us below.</p>';
    return;
  }
  // Highlight matched terms in the answer text
  const highlight=(text,terms)=>{
    let out=text;
    terms.forEach(w=>{
      const re=new RegExp('('+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
      out=out.replace(re,'<mark style="background:#d1fae5;color:#065f46;border-radius:3px;padding:0 2px">$1</mark>');
    });
    return out;
  };
  container.innerHTML=scored.map(({item,cat})=>`
    <div style="border:1.5px solid #b2d8d8;border-radius:10px;margin-bottom:10px;background:#fff;overflow:hidden">
      <div style="padding:4px 14px;background:#f0f9f9;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#2d6a6a">${cat}</div>
      <div style="padding:12px 16px">
        <div style="font-size:13px;font-weight:600;color:#2d3a3a;margin-bottom:6px">${highlight(item.q,terms)}</div>
        <div style="font-size:13px;color:#5a6a6a;line-height:1.75">${highlight(item.a,terms)}</div>
      </div>
    </div>`).join('');
}
function enterTeacherModeDirectly(bkId){
  sessionStorage.setItem('ama_teacher_mode','1');
  sessionStorage.setItem('teacher_bk_id',bkId);
  sessionStorage.setItem('ama_admin_viewing','1');
  const _bk=AppData.bookings.find(b=>b.id===bkId);
  if(_bk?.allLocked)sessionStorage.setItem('ama_preview_locked_bk',bkId);
  else sessionStorage.removeItem('ama_preview_locked_bk');
  location.reload();
}
// Opens a booking's teacher portal in a NEW tab instead of taking over this
// one — used by every "Teacher Portal"/"Preview as Teacher" button so admin
// keeps their dashboard tab open. window.open() creates an auxiliary
// browsing context that inherits a COPY of this tab's sessionStorage at the
// moment it opens, so briefly setting the same admin-preview flags
// enterTeacherModeDirectly uses (then clearing them back out of this tab
// right after) hands the new tab a real admin-preview session without ever
// touching localStorage (which IS shared across tabs and would otherwise
// leak into "always reopen as teacher X" on this admin's next reload).
function openTeacherPortal(bkId){
  if(!bkId)return;
  sessionStorage.setItem('ama_admin_viewing','1');
  // Also clone ama_teacher_mode into the new tab — it's what drives the
  // "← Back to Admin" button's visibility (enterTeacherView checks it).
  sessionStorage.setItem('ama_teacher_mode','1');
  const bk=AppData.bookings.find(b=>b.id===bkId);
  if(bk?.allLocked)sessionStorage.setItem('ama_preview_locked_bk',bkId);
  else sessionStorage.removeItem('ama_preview_locked_bk');
  window.open(`${location.origin}/booking-hub.html?mode=teacher&bk=${bkId}`,'_blank');
  sessionStorage.removeItem('ama_admin_viewing');
  sessionStorage.removeItem('ama_teacher_mode');
  sessionStorage.removeItem('ama_preview_locked_bk');
}
function exitTeacherModeFully(){
  const returnBkId=(localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id'))||localStorage.getItem('teacher_bk_id');
  sessionStorage.removeItem('ama_teacher_mode');
  sessionStorage.removeItem('teacher_bk_id');
  sessionStorage.removeItem('ama_admin_viewing');
  sessionStorage.removeItem('ama_preview_locked_bk');
  localStorage.removeItem('teacher_bk_id');
  localStorage.removeItem('ama_teacher_persist');
  if(returnBkId)sessionStorage.setItem('ama_admin_return_bk',returnBkId);
  location.href=location.pathname;
}

function initTeacherMode(){
  if(!IS_TEACHER_MODE){return;}
  document.getElementById('teacherLoginScreen').style.display='flex';
  const params=new URLSearchParams(window.location.search);
  const urlBkId=params.get('bk');
  const persistedId=!sessionStorage.getItem('ama_admin_viewing')?(localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id')):sessionStorage.getItem('teacher_bk_id');
  const _loginWith=(bk)=>{
    if(!sessionStorage.getItem('ama_admin_viewing')){localStorage.setItem('teacher_bk_id',bk.id);localStorage.setItem('ama_teacher_persist','1');}
    // Admin preview — never persist to localStorage (would "stick" on this
    // admin's next real reload), but DO persist to sessionStorage, scoped to
    // just this preview tab. Every nav-tab click (Schedule, Room List,
    // Transport, Financial, Activities, Contract) looks up the booking via
    // localStorage.teacher_bk_id||sessionStorage.teacher_bk_id — without this,
    // that lookup comes back empty and those tabs silently render nothing.
    else{sessionStorage.setItem('teacher_bk_id',bk.id);}
    enterTeacherView(bk.id);
  };
  const _findLocal=()=>{
    if(urlBkId)return AppData.bookings.find(b=>b.id===urlBkId)||null;
    if(persistedId)return AppData.bookings.find(b=>b.id===persistedId)||null;
    return null;
  };
  let bk=_findLocal();
  if(bk){_loginWith(bk);return;}
  if(!urlBkId&&!persistedId){document.getElementById('teacherLoginErr').textContent='No portal link found. Please use the link from your email or contact retreats@amansala.com.';return;}
  // Load all data from Supabase (same method used by admin — proven to work)
  loadFromSupabase().then(loaded=>{
    const lookupId=urlBkId||persistedId;
    const found=AppData.bookings.find(b=>b.id===lookupId);
    if(found){_loginWith(found);return;}
    localStorage.removeItem('teacher_bk_id');localStorage.removeItem('ama_teacher_persist');
    document.getElementById('teacherLoginErr').textContent='Unable to load your portal. Please use the link from your email or contact retreats@amansala.com.';
  }).catch(()=>{
    document.getElementById('teacherLoginErr').textContent='Connection error. Please try again or contact retreats@amansala.com.';
  });
}


// ===== TEACHER DASHBOARD =====
const CL_ITEMS=[
  {id:'cl1',text:'Book your planning call with Amansala',sub:'Covers room list, schedule, transport & add-ons'},
  {id:'cl2',text:'Add all guest reservations to your room list',sub:'Name, email & phone — adjustments allowed until 6 weeks before',deadlineDays:42,deadlineLabel:'Deadline'},
  {id:'cl3',text:'Submit your class schedule',sub:'Include start/end times, music preference & special requests'},
  {id:'cl4',text:'Share the transportation link with your guests',sub:'Send at least 2 months before your retreat dates',deadlineDays:60,deadlineLabel:'Send by',copyLink:true},
  {id:'cl5',text:'Send the Welcome Letter to your yogis',sub:'Use the template below — copy and personalise it'},
  {id:'cl7',text:'Select add-on packages for your group',sub:'Tulum Ruins, Cenote, Temazcal, Cacao & more'},
  {id:'cl8',text:'Finalise your room list',sub:'Last chance for edits — contact support after this point',deadlineDays:42,deadlineLabel:'Deadline'},
  {id:'cl9',text:'Final payment submitted',sub:'Bank wire only — no credit cards accepted',deadlineDays:42,deadlineLabel:'Due by'},
];
function getChecklist(bkId){return JSON.parse(localStorage.getItem('amansala_cl_'+bkId)||'{}');}
function saveChecklist(bkId,obj){localStorage.setItem('amansala_cl_'+bkId,JSON.stringify(obj));}
function toggleCheck(bkId,key){const c=getChecklist(bkId);c[key]=!c[key];saveChecklist(bkId,c);renderChecklist(bkId);}
// Shown on the teacher's own Dashboard whenever their retreat is within 6
// weeks and their guests haven't all submitted travel details yet.
function tdRenderTransportReminder(bkId){
  const el=document.getElementById('tdTransportReminder');if(!el)return;
  const bk=AppData.bookings.find(b=>b.id===bkId);
  if(!bk||!bk.startDate){el.style.display='none';return;}
  const today=new Date();today.setHours(0,0,0,0);
  const daysUntil=Math.floor((pd(bk.startDate)-today)/DAY_MS);
  if(daysUntil>42||daysUntil<0){el.style.display='none';return;}
  const ros=(typeof getTransportRoster==='function')?getTransportRoster(bkId):null;
  if(!ros||!ros.missing.length){el.style.display='none';return;}
  const link=location.origin+'/transport-form.html?bk='+bkId;
  const n=ros.missing.length;
  el.style.display='block';
  el.innerHTML=`<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:12px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
    <div style="font-size:22px">⚠️</div>
    <div style="flex:1;min-width:220px">
      <div style="font-weight:700;color:#991b1b;font-size:14px">Transportation Reminder</div>
      <div style="font-size:13px;color:#7f1d1d;margin-top:2px">Your retreat is ${daysUntil<=0?'about to start':`in ${daysUntil} day${daysUntil!==1?'s':''}`} and <b>${n} guest${n!==1?'s':''}</b> ${n!==1?"haven't":"hasn't"} submitted their travel details yet.</div>
    </div>
    <button onclick="navigator.clipboard&&navigator.clipboard.writeText('${link}');showToast('Link copied!')" style="padding:9px 16px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap">Copy Transport Link</button>
  </div>`;
}

function renderChecklist(bkId){
  const c=getChecklist(bkId);
  const bk=AppData.bookings.find(b=>b.id===bkId);
  // Auto-complete add-ons item when teacher has confirmed their selections
  if(bk&&bk.addOnsConfirmedAt&&!c.cl7){c.cl7=true;saveChecklist(bkId,c);}
  const start=bk&&bk.startDate?pd(bk.startDate):null;
  const done=CL_ITEMS.filter(i=>c[i.id]).length;
  const prog=document.getElementById('cl-progress');
  if(prog)prog.textContent=`${done}/${CL_ITEMS.length} done`;
  const body=document.getElementById('clBody');if(!body)return;
  body.innerHTML=CL_ITEMS.map(i=>{
    let deadline='';
    if(i.deadlineDays&&start){
      const dl=new Date(start);dl.setDate(dl.getDate()-i.deadlineDays);
      deadline=`<span style="display:inline-block;margin-top:3px;font-size:11px;font-weight:700;color:#b45309;background:#fef3c7;border-radius:4px;padding:1px 7px">${i.deadlineLabel}: ${fmtDate(dl.toISOString().slice(0,10))}</span>`;
    }
    const copyBtn=i.copyLink?`<button onclick="event.stopPropagation();const u=location.origin+'/transport-form.html?bk=${bkId}';navigator.clipboard&&navigator.clipboard.writeText(u).then(()=>{this.textContent='✓ Copied!';setTimeout(()=>this.textContent='Copy Link',2000)});this.textContent='✓ Copied!'" style="margin-top:8px;display:inline-block;padding:6px 14px;background:#2d6a6a;color:#fff;border:none;border-radius:6px;font-family:'Jost',sans-serif;font-size:12px;font-weight:600;cursor:pointer">Copy Link</button>`:'';
    return `<div class="cl-item${c[i.id]?' done':''}" onclick="toggleCheck('${bkId}','${i.id}')">
      <div class="cl-box"></div>
      <div><div class="cl-text">${i.text}</div><div class="cl-sub">${i.sub}</div>${deadline}${copyBtn}</div>
    </div>`;
  }).join('');
}
function renderYogiLetter(bk){
  const el=document.getElementById('yogiLetter');if(!el)return;
  const retreat=bk.retreatName||bk.leaderName||'our upcoming retreat';
  const dates=`${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}`;
  const nights=getNights(bk);
  el.textContent=`Dear Yogis,

I am so excited to welcome you to ${retreat} at Amansala Eco-Chic Resort in Tulum, Mexico — ${dates} (${nights} nights).

Amansala is a beautifully intimate beachfront property nestled along the Caribbean coast of Tulum. It will be the backdrop for our practice, our meals, and our connection as a community.

A few important things to know before you arrive:

ROOMS
You will receive your room type confirmation once all reservations are finalised. Please review your booking details carefully. If you have any questions about your room or would like to request an upgrade, reach out to me directly.

WHAT'S INCLUDED
· Daily yoga & movement classes
· Breakfast, brunch & dinner (set retreat menu)
· Welcome ceremony
· Use of all resort facilities (pool, beach, shalas)
· Gratuity for restaurant & kitchen staff ($30 USD/person/day)

WHAT TO BRING
· Yoga mat (mats are provided, but you're welcome to bring your own)
· Comfortable workout clothing + resort wear
· Sunscreen (reef-safe please — we're on the Caribbean!)
· Small amount of cash in USD for tips, off-site activities & extras
· Any medications or personal items you need

MEALS
Our chef prepares a fresh, healthy set menu for each meal. Please let me know of any dietary restrictions or severe allergies in advance so I can inform the team.

TRANSPORT
I will be sending a transport link closer to your dates. Please fill in your flight details as soon as possible so we can coordinate group arrivals.

I cannot wait to share this experience with you. If you have any questions in the meantime, please don't hesitate to reach out.

With love & gratitude,
[Your Name]

For resort questions: retreats@amansala.com`;
}
function renderPlanningGuide(){
  const body=document.getElementById('tdPlanningBody');if(!body)return;
  const sections=[
    {title:'Your Room List',content:`<ul>
      <li>Place each guest in the room type they reserved.</li>
      <li><b>10 paying guests</b> = one complimentary room in the most basic category. 20 guests = two teacher rooms complimentary.</li>
      <li>Fewer than 10 guests = <b>$20 USD credit per guest per day</b> toward your own room & board.</li>
      <li>Add guests by clicking the <b>+</b> sign — enter name, phone & email.</li>
      <li>Adjustments are allowed until the <b>6-week deadline</b>.</li>
      <li>Rooms must be filled to capacity. If a shared room guest has no roommate, they pay the private rate difference.</li>
    </ul>`},
    {title:'Schedule',content:`<ul>
      <li>Shalas are assigned by group size. Classes must start and finish on time — 75-minute sessions standard.</li>
      <li>Equipment provided: mats, blocks, straps, blankets, hand weights, kettlebells, resistance bands.</li>
      <li>Microphones are not provided — bring your own if needed.</li>
    </ul>`},
    {title:'Meals',content:`<ul>
      <li>Recommended flow: <b>Fruit, Coffee &amp; Tea → Brunch → Afternoon Snack → Dinner</b>.</li>
      <li>Plan Brunch ~15 min after morning class; Dinner 30–60 min after evening class.</li>
      <li>Dietary restrictions must be communicated in advance.</li>
      <li>Off-site dinner option: <b>Gitano Tulum</b> — $75/person + 15% tip + $15 transport.</li>
      <li>Stay on-site dinner option: <b>$40 USD per person</b>.</li>
    </ul>`},
    {title:'Gratuity & Payments',content:`<ul>
      <li>Mandatory <b>$30 USD/person/day yoga gratuity</b> covers restaurant & kitchen staff.</li>
      <li>Housekeeping, bellboys, guides & spa therapists are tipped separately.</li>
      <li><b>Final payment: bank wire only</b> — no credit cards.</li>
      <li>Cancellations within 3 weeks of start: <b>no refund</b>.</li>
    </ul>`},
    {title:'Cancellations & Policies',content:`<ul>
      <li>Cancellations after final payment due date (3 weeks before): two nights charged per occupancy type.</li>
      <li>Non-participating partners/friends: same rate as 2 people sharing a king ($130–$150 extra/night + tip & tax).</li>
      <li>Guests may book extra nights before/after at a special yogi rate.</li>
    </ul>`},
  ];
  body.innerHTML=sections.map(s=>`
    <div class="td-planning-section">
      <h4>${s.title}</h4>
      ${s.content}
    </div>`).join('');
}
function copyLetter(){
  const el=document.getElementById('yogiLetter');if(!el)return;
  navigator.clipboard.writeText(el.textContent).then(()=>showToast('Letter copied!')).catch(()=>showToast('Select the text above and copy manually.'));
}
function saveWhatsapp(){
  const bkId=(localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id'));
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const num=(document.getElementById('tdWhatsappInput').value||'').trim();
  if(!num){showToast('Please enter your WhatsApp number.');return;}
  bk.whatsappNumber=num;
  saveAll();
  const saved=document.getElementById('tdWhatsappSaved');
  if(saved){saved.style.display='block';}
}
function loadWhatsappField(bk){
  const inp=document.getElementById('tdWhatsappInput');
  const saved=document.getElementById('tdWhatsappSaved');
  if(!inp)return;
  if(bk.whatsappNumber){
    inp.value=bk.whatsappNumber;
    if(saved)saved.style.display='block';
  }
}
function renderTeacherUpgrades(bk){
  const panel=document.getElementById('tcUpgradesPanel');
  const list=document.getElementById('tcUpgradesList');
  if(!panel||!list)return;
  const items=[];
  const chip=(icon,text,color)=>`<div style="display:inline-flex;align-items:center;gap:6px;background:#fff;border:1.5px solid ${color||'#b2d8d8'};border-radius:99px;padding:5px 13px;font-size:12.5px;font-weight:600;color:${color||'var(--teal)'}">
    ${icon?`<span>${icon}</span>`:''}${text}</div>`;
  // Add-on packages
  const pkgs=calcPkgItems(bk);
  pkgs.forEach(p=>items.push(chip('✓',p.name,'#2d6a6a')));
  // Schedule request add-ons
  const sr=bk.scheduleRequest;
  if(sr){
    if(sr.bowlRental&&sr.bowlQty&&sr.bowlDays&&sr.bowlDays.length){
      const dnames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];const mnames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const slots=(sr.bowlDays||[]).reduce((n,e)=>n+(e.am?1:0)+(e.pm?1:0),0);
      const t=sr.bowlQty*slots*15;
      const detail=sr.bowlDays.map(e=>{const dt=pd(e.date);const p=[];if(e.am)p.push('AM');if(e.pm)p.push('PM');return `${dnames[dt.getDay()]} ${mnames[dt.getMonth()]} ${dt.getDate()} ${p.join('/')}`;}).join(', ');
      items.push(chip('🎵',`Singing Bowls — ${sr.bowlQty} bowl${sr.bowlQty>1?'s':''} · ${detail} · $${t}`,'#7c3aed'));
    }
    if(sr.setupService&&sr.setupDays&&sr.setupDays.length){
      const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const labels=sr.setupDays.map(d=>{const dt=pd(d);return days[dt.getDay()]+' '+months[dt.getMonth()]+' '+dt.getDate();});
      items.push(chip('🧘',`Class Setup Service — ${labels.join(', ')} (+$25/day)`,'#b45309'));
    } else if(sr.setupService){
      items.push(chip('🧘','Class Setup Service (+$25/day)','#b45309'));
    }
    if((Array.isArray(sr.music)?sr.music:[sr.music]).includes('av'))items.push(chip('📽','Audio Visual Requested','#0369a1'));
  }
  if(!items.length){panel.style.display='none';return;}
  panel.style.display='block';
  list.innerHTML=items.join('');
}

function teacherShowView(view){
  const isDash=view==='dash',isContract=view==='contract',isSched=view==='schedule',isRooms=view==='rooms',isTransport=view==='transport',isFinancial=view==='financial',isFaq=view==='faq',isActs=view==='activities';
  document.getElementById('teacherDashboard').style.display=isDash?'flex':'none';
  document.getElementById('teacherContractView').style.display=isContract?'flex':'none';
  document.getElementById('teacherScheduleView').style.display=isSched?'flex':'none';
  document.getElementById('roomListView').style.display=isRooms?'flex':'none';
  document.getElementById('teacherTransportView').style.display=isTransport?'flex':'none';
  document.getElementById('teacherFinancialView').style.display=isFinancial?'flex':'none';
  document.getElementById('teacherFaqView').style.display=isFaq?'flex':'none';
  document.getElementById('teacherActivitiesView').style.display=isActs?'flex':'none';
  document.getElementById('tnBtnDash').classList.toggle('active',isDash);
  document.getElementById('tnBtnContract').classList.toggle('active',isContract);
  document.getElementById('tnBtnSchedule').classList.toggle('active',isSched);
  document.getElementById('tnBtnRooms').classList.toggle('active',isRooms);
  document.getElementById('tnBtnTransport').classList.toggle('active',isTransport);
  document.getElementById('tnBtnFinancial').classList.toggle('active',isFinancial);
  document.getElementById('tnBtnFaq').classList.toggle('active',isFaq);
  document.getElementById('tnBtnActivities').classList.toggle('active',isActs);
  if(isFaq)faqRender();
  if(isActs){const savedId=(localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id'));if(savedId)renderTeacherActivities(savedId);}
  if(isTransport){const savedId=(localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id'));if(savedId)renderTeacherTransport(savedId);}
  if(isFinancial){const savedId=(localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id'));if(savedId){loadFromSupabase().then(()=>{const bkr=AppData.bookings.find(b=>b.id===savedId);if(bkr&&bkr.depositInvoice&&bkr.depositInvoice.status==='pending'){const isPaidStatus=['deposit_paid','room_list_sent','confirmed'].includes(bkr.status);const hasPayment=(bkr.payments||[]).length>0;if(isPaidStatus||hasPayment){bkr.depositInvoice.status='paid';bkr.depositInvoice.paidAt=bkr.depositInvoice.paidAt||(bkr.payments?.[0]?.ts||new Date().toISOString());}}renderTeacherInvoice(savedId);const bkr2=AppData.bookings.find(b=>b.id===savedId);if(bkr2)renderTeacherFinalPayment(bkr2);});}}
  if(isRooms){
    const rlMsg=document.getElementById('rlNotSentMsg');
    const savedId=(localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id'));
    const bkr=savedId?AppData.bookings.find(b=>b.id===savedId):null;
    if(bkr&&!(bkr.blockedRooms||[]).length){
      if(rlMsg)rlMsg.style.display='flex';
      document.getElementById('regStatsBar').style.display='none';
      document.getElementById('regPanel').style.display='none';
      const pkgBar=document.getElementById('pkgBar');if(pkgBar)pkgBar.style.display='none';
      const up=document.getElementById('tcUpgradesPanel');if(up)up.style.display='none';
    }else{
      if(rlMsg)rlMsg.style.display='none';
      const rp=document.getElementById('regPanel');if(rp)rp.style.display='';
      regRender();
      if(bkr)renderTeacherUpgrades(bkr);
    }
    // Show final payment banner if within 6 weeks and balance outstanding
    if(bkr)renderFinalPaymentBanner(bkr);
  }
  if(isContract){const savedId=(localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id'));if(savedId)renderTeacherContract(savedId);}
  if(isSched){const savedId=(localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id'));if(savedId)tsInit(savedId);}
}

function renderTeacherActivities(bkId){
  const wrap=document.getElementById('teacherActivitiesContent');if(!wrap)return;
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk){wrap.innerHTML='';return;}
  const acts=bk.retreatActivities||[];
  const pkgIds=new Set(bk.packages||[]);
  const allIds=new Set([...acts.map(a=>a.aoId),...pkgIds]);
  const signupUrl='https://amansala-portal.netlify.app/activity-signup.html?id='+bkId;
  const copyBannerHtml=`<div style="background:linear-gradient(135deg,#2d6a6a,#3d8080);border-radius:14px;padding:18px 22px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
    <div>
      <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:3px">Share Activity Sign-Up With Your Guests</div>
      <div style="font-size:12px;color:#b2d8d8;line-height:1.5">Send this link so your guests can choose their optional activities &amp; tours.</div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button onclick="navigator.clipboard.writeText('${signupUrl}').then(()=>showToast('Link copied!')).catch(()=>showToast('Copy failed'))" style="padding:9px 18px;background:#fff;color:#2d6a6a;border:none;border-radius:9px;font-family:'Jost',sans-serif;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">📋 Copy Link</button>
      <a href="mailto:?subject=Activity%20Sign-Up%20for%20Your%20Retreat&body=Hi%20everyone%2C%0A%0APlease%20use%20the%20link%20below%20to%20sign%20up%20for%20optional%20activities%20during%20our%20retreat%3A%0A%0A${encodeURIComponent(signupUrl)}%0A%0ASee%20you%20soon!" style="padding:9px 18px;background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,.5);border-radius:9px;font-family:'Jost',sans-serif;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;text-decoration:none;display:inline-block">✉ Email Guests</a>
    </div>
  </div>`;
  if(!allIds.size){
    wrap.innerHTML=copyBannerHtml+`<div style="color:#8a7e74;font-size:13px;text-align:center;padding:40px 0;line-height:1.65">No activities have been scheduled yet.<br>Amansala will coordinate your activity schedule.</div>`;
    return;
  }
  const fmtT=t=>{if(!t)return'';const[h,m]=t.split(':').map(Number);const ap=h>=12?'PM':'AM';return`${h%12||12}:${String(m).padStart(2,'0')} ${ap}`;};
  const addMin=(t,mins)=>{if(!t)return'';const[h,m]=t.split(':').map(Number);const tot=h*60+m+mins;return`${Math.floor(tot/60)%24}:${String(tot%60).padStart(2,'0')}`;};
  const MON_NAMES=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtDate=d=>{if(!d)return'TBC';const dt=new Date(d+'T12:00:00');return MON_NAMES[dt.getMonth()]+' '+dt.getDate();};
  const ACTS_MAP={};ADD_ONS.forEach(a=>ACTS_MAP[a.id]=a);ACTS_MAP['ao12']={id:'ao12',name:'Group Salsa Class',price:0,cat:'entertainment'};
  // Build unified list
  const rows=[];
  const seen=new Set();
  acts.forEach(a=>{
    if(seen.has(a.aoId))return;seen.add(a.aoId);
    const ao=ACTS_MAP[a.aoId]||{id:a.aoId,name:a.aoId,price:0};
    const dur=ACTS_DUR?.[a.aoId]||90;
    const timeStr=a.time?(fmtT(a.time)+' – '+fmtT(addMin(a.time,dur))):'Time TBC';
    rows.push({ao,date:a.date,timeStr,prepaid:a.prepaid||pkgIds.has(a.aoId)});
  });
  pkgIds.forEach(id=>{
    if(seen.has(id))return;
    const ao=ACTS_MAP[id]||{id,name:id,price:0};
    rows.push({ao,date:null,timeStr:'Time TBC',prepaid:true});
  });
  rows.sort((a,b)=>(a.date||'9999')>(b.date||'9999')?1:-1);
  const prepaid=rows.filter(r=>r.prepaid);
  const optional=rows.filter(r=>!r.prepaid);
  let html=copyBannerHtml;
  const card=(r,badge,badgeBg,badgeColor)=>`
    <div style="background:#fff;border:1.5px solid #ddd8cf;border-radius:12px;padding:16px 20px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div>
        <div style="font-size:15px;font-weight:600;color:#2d2520;font-family:'Jost',sans-serif;margin-bottom:4px">${r.ao.name}</div>
        <div style="font-size:12.5px;color:#8a7e74">${fmtDate(r.date)}${r.date?' · ':' · '}${r.timeStr}</div>
      </div>
      <span style="background:${badgeBg};color:${badgeColor};border-radius:99px;padding:4px 12px;font-size:11.5px;font-weight:700;white-space:nowrap">${badge}</span>
    </div>`;
  if(prepaid.length){
    html+=`<div style="font-size:10.5px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;margin-top:4px">✦ Included in Your Package</div>`;
    html+=`<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px">${prepaid.map(r=>card(r,'Prepaid','#dcfce7','#15803d')).join('')}</div>`;
  }
  if(optional.length){
    html+=`<div style="font-size:10.5px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">Optional Add-Ons</div>`;
    html+=`<div style="display:flex;flex-direction:column;gap:10px">${optional.map(r=>card(r,r.ao.price?'$'+r.ao.price+'/person':'Optional','#dbeafe','#1d4ed8')).join('')}</div>`;
  }
  wrap.innerHTML=html;
}

// Groups a same-airport/date list of subs into ride groups, honoring any manual
// grouping the admin Transport board saved (tr2UserGroupMap, shared via
// settings.transport_groups — same map driver-view.html reads) before falling
// back to auto-clustering the rest by a 30-min window, same as before this existed.
// A manual admin group (drag-and-drop in the Transport tab) can span retreats — this
// booking's "My Transport" only ever loads its OWN guests, so a group's visible pax
// count undercounts the real ride size whenever it's been combined with another
// retreat. Scans the full transport list to find the true combined headcount for
// pricing purposes.
function _trGlobalGroupPax(type,groupKey,allTr){
  if(!groupKey||typeof tr2UserGroupMap==='undefined')return null;
  let n=0;
  allTr.forEach(s=>{
    if(type==='arrival'){if(s.arrivalOT||!s.arrivalDate||!s.arrivalTime||!s.arrivalAirport)return;}
    else{if(s.departureOT||!s.departureDate||!s.departureTime)return;}
    if(tr2UserGroupMap.get(`${type}|${s.id}`)===groupKey)n++;
  });
  return n;
}
function _trMinsToTime(m){const w=((m%1440)+1440)%1440;return String(Math.floor(w/60)).padStart(2,'0')+':'+String(w%60).padStart(2,'0');}
function _trPickupTime(airport,flightTime){
  if(!flightTime)return null;
  const lead=(airport||'').toLowerCase()==='tulum'?150:240;
  return _trMinsToTime(trTimeToMins(flightTime)-lead);
}
// Ported from staging's retreat-portal.html Transport tab: a single flat table per
// direction (not per-airport cards) with unsubmitted guests shown inline instead of
// in a separate list. Groups: a manual admin override (tr2UserGroupMap) always wins;
// otherwise guests who opted in to sharing auto-cluster within 30 min at the same
// airport/date, and everyone else gets their own private-rate row.
function _trAssignRideGroups(guests,type,allTr){
  const isArr=type==='arr';
  const info=guests.map((g,idx)=>{
    const tr=g.tr;
    const ot=isArr?tr?.arrivalOT:tr?.departureOT;
    const date=isArr?tr?.arrivalDate:tr?.departureDate;
    const time=isArr?tr?.arrivalTime:tr?.departureTime;
    const ap=((isArr?tr?.arrivalAirport:tr?.departureAirport)||'').toLowerCase();
    const ugKey=(tr?.id&&typeof tr2UserGroupMap!=='undefined')?tr2UserGroupMap.get(`${isArr?'arrival':'departure'}|${tr.id}`):null;
    return{idx,hasTr:!!tr,ot:!!ot,date:date||'',ap,mins:trTimeToMins(time),share:!!tr?.willingToShare,ugKey};
  });
  const groups=[];
  const groupOf=new Array(guests.length).fill(null);
  const ugAssigned=new Map();
  for(const e of info){
    if(!e.hasTr||e.ot||!e.date||e.mins===null)continue;
    if(e.ugKey){
      if(ugAssigned.has(e.ugKey)){
        const gi=ugAssigned.get(e.ugKey);
        groups[gi].idxs.push(e.idx);groups[gi].minMins=Math.min(groups[gi].minMins,e.mins);
        groupOf[e.idx]=gi;
      }else{
        const gi=groups.length;
        ugAssigned.set(e.ugKey,gi);
        groups.push({ap:e.ap,date:e.date,idxs:[e.idx],userGroup:true,ugKey:e.ugKey,minMins:e.mins});
        groupOf[e.idx]=gi;
      }
      continue;
    }
    if(!e.share){
      groupOf[e.idx]=groups.length;
      groups.push({ap:e.ap,date:e.date,idxs:[e.idx],priv:true,minMins:e.mins});
      continue;
    }
    let joined=false;
    for(let gi=0;gi<groups.length;gi++){
      const grp=groups[gi];
      if(grp.priv||grp.userGroup||grp.ap!==e.ap||grp.date!==e.date)continue;
      if(grp.idxs.some(mi=>Math.abs(info[mi].mins-e.mins)<=30)){
        grp.idxs.push(e.idx);grp.minMins=Math.min(grp.minMins,e.mins);groupOf[e.idx]=gi;joined=true;break;
      }
    }
    if(!joined){groupOf[e.idx]=groups.length;groups.push({ap:e.ap,date:e.date,idxs:[e.idx],minMins:e.mins});}
  }
  const PASTEL=['#eff6ff','#f0fdf4','#faf5ff','#fffbeb','#fdf2f8','#f0fdfa','#fff7ed','#f0f9ff'];
  let colorIdx=0;
  const prices=new Array(guests.length).fill(null);
  groups.forEach(grp=>{
    const globalPax=grp.userGroup?_trGlobalGroupPax(isArr?'arrival':'departure',grp.ugKey,allTr):null;
    const payCount=globalPax!=null?globalPax:grp.idxs.length;
    grp.color=PASTEL[colorIdx++%PASTEL.length];
    grp.combinedExtra=(globalPax!=null&&globalPax>grp.idxs.length)?(globalPax-grp.idxs.length):0;
    grp.pax=payCount;
    grp.priv=grp.priv||payCount===1;
    const pp=trGetPrice(grp.ap,payCount);
    grp.idxs.forEach(idx=>{prices[idx]={pp,pax:payCount,priv:grp.priv,ap:grp.ap,combinedExtra:grp.combinedExtra};});
  });
  return{groups,groupOf,prices};
}
// Compact teal pricing-reference card, styled after staging's "TRANSFER PRICING
// REFERENCE" panel — placed at the very bottom of the page, below everything else.
function _trPricingCardHtml(){
  const block=(label,tiers)=>{
    const rows=tiers.map((price,i)=>{
      const rowLabel=i===0?'Private transfer':(i===tiers.length-1?`${i+1}+ sharing`:`${i+1} sharing`);
      const priceHtml=i===0?`<b>$${price}</b>`:`<b>$${price}</b> <span style="opacity:.65;font-weight:400">each</span>`;
      return`<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 10px;background:rgba(255,255,255,${i===0?0.16:0.08});border-radius:6px;margin-bottom:3px;font-size:11px;color:#fff">
        <span>${rowLabel}</span><span>${priceHtml}</span>
      </div>`;
    }).join('');
    return`<div style="flex:1;min-width:150px;background:rgba(255,255,255,.06);border-radius:9px;padding:10px">
      <div style="font-size:11.5px;font-weight:700;color:#fff;margin-bottom:6px">✈️ ${label}</div>
      ${rows}
    </div>`;
  };
  return`<div style="background:linear-gradient(135deg,#2d6a6a,#3d8080);border-radius:12px;padding:14px 16px;margin-top:20px">
    <div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;color:rgba(255,255,255,.75);margin-bottom:8px;text-transform:uppercase">Transfer Pricing Reference</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${block('Cancún Airport (CUN)',_TR_RATES.cancun)}
      ${block('Tulum Airport (TQO)',_TR_RATES.tulum)}
    </div>
    <div style="text-align:center;font-size:10px;color:rgba(255,255,255,.65);margin-top:8px">Prices are per person · Amansala coordinates all shared ride groupings</div>
  </div>`;
}
function _trBuildTransportTable(guests,type,result){
  const{prices,groupOf,groups}=result;
  const isArr=type==='arr';
  if(!guests.length)return`<div style="padding:28px;text-align:center;color:#8a7e74;font-size:12px">No guests registered yet.</div>`;
  const thS=`padding:9px 12px;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:#8a7e74;text-align:left;font-weight:700`;
  const dash=`<span style="color:#d1c9bd">—</span>`;

  const indexed=guests.map((g,i)=>({g,i,gi:groupOf[i]??-1}));
  indexed.sort((a,b)=>{if(a.gi!==b.gi)return(a.gi===-1?999:a.gi)-(b.gi===-1?999:b.gi);return 0;});

  let lastGi;
  const rows=indexed.map(({g,i})=>{
    const tr=g.tr;
    const ot=isArr?tr?.arrivalOT:tr?.departureOT;
    const date=isArr?tr?.arrivalDate:tr?.departureDate;
    const time=isArr?tr?.arrivalTime:tr?.departureTime;
    const ap=isArr?tr?.arrivalAirport:tr?.departureAirport;
    const p=prices[i];
    const grp=(groupOf[i]!=null&&groupOf[i]>=0)?groups[groupOf[i]]:null;
    const rowBg=grp?.color?grp.color:'#fff';

    const dot=tr
      ?`<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#15803d;margin-right:6px;vertical-align:middle"></span>`
      :`<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#e5e0d6;margin-right:6px;vertical-align:middle"></span>`;
    const driverBadge=tr?.driver_confirmed
      ?`<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;background:#d1fae5;color:#065f46;margin-left:6px;white-space:nowrap">✓ Driver confirmed</span>`
      :'';

    let dateCell=dash;
    if(ot)dateCell=`<span style="font-size:11px;color:#8a7e74;font-style:italic">Own transport</span>`;
    else if(date)dateCell=`<span style="font-weight:600">${date}</span>`;

    const timeCell=time?`<span style="color:#2d2520">${tsFmt(time)}</span>`:dash;
    const apLabel=ap==='cancun'?'CUN':ap==='tulum'?'TQO':(ap||'').toUpperCase();
    const apCell=ap?`<span style="font-size:11px;font-weight:700;background:#f2f0ea;padding:2px 6px;border-radius:4px;color:#5a5048">${apLabel}</span>`:dash;

    let flightCell=dash;
    if(tr&&ot)flightCell=`<span style="font-size:11px;color:#8a7e74">—</span>`;
    else if(tr)flightCell=tr.flightNumber
      ?`<span style="font-weight:600;color:#2d2520">${escHtml(tr.flightNumber)}</span>`
      :`<span style="font-size:10px;font-weight:700;background:#fef9c3;color:#92400e;border-radius:5px;padding:2px 7px;white-space:nowrap">Missing Flight Info</span>`;

    let priceCell=dash;
    if(ot)priceCell=`<span style="font-size:11px;color:#8a7e74">Own</span>`;
    else if(p?.pp!=null){
      const shared=!p.priv&&p.pax>1;
      const bg=shared?'#f0fdf9':'#f8f6f2';
      const cl=shared?'#065f46':'#5a5048';
      const tag=shared?` · ${p.pax}✕`:'';
      priceCell=`<span style="font-size:12px;font-weight:700;padding:2px 8px;border-radius:6px;background:${bg};color:${cl}">$${p.pp}${tag}</span>${p.combinedExtra?`<div style="font-size:9.5px;color:#065f46;margin-top:2px">🔗 +${p.combinedExtra} from another retreat</div>`:''}`;
    }

    const shareCell=isArr
      ?`<td style="padding:10px 12px;font-size:12px">${tr?.willingToShare?`<span style="font-size:11px;font-weight:600;color:#0e9494">✓</span>`:dash}</td>`
      :'';

    const puFlight=(!isArr&&grp&&grp.minMins!=null)?_trMinsToTime(grp.minMins):time;
    const pu=(!isArr&&!ot&&puFlight)?_trPickupTime(ap,puFlight):null;
    const pickupCell=!isArr
      ?`<td style="padding:10px 12px;font-size:12px">${pu?`<span style="font-weight:700;color:#b45309">${tsFmt(pu)}</span>`:dash}</td>`
      :'';

    const curGi=groupOf[i]??-1;
    const sep=(lastGi!==undefined&&curGi!==lastGi)
      ?`<tr><td colspan="8" style="padding:6px;background:#fff;border:none"></td></tr>`
      :'';
    lastGi=curGi;

    return sep+`<tr style="border-bottom:1px solid #f0ece4;background:${rowBg}">
      <td style="padding:10px 12px;font-size:13px;font-weight:600;white-space:nowrap">${dot}${escHtml(g.name)}${driverBadge}</td>
      <td style="padding:10px 12px;font-size:12px;color:#8a7e74;white-space:nowrap">${g.room?escHtml(g.room):'—'}</td>
      <td style="padding:10px 12px;font-size:12px">${dateCell}</td>
      <td style="padding:10px 12px;font-size:12px">${timeCell}</td>
      <td style="padding:10px 12px;font-size:12px">${apCell}</td>
      <td style="padding:10px 12px;font-size:12px">${flightCell}</td>
      ${pickupCell}
      <td style="padding:10px 12px;font-size:12px">${priceCell}</td>
      ${shareCell}
    </tr>`;
  }).join('');

  return`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
    <thead><tr style="background:#faf7f2">
      <th style="${thS}">Guest</th>
      <th style="${thS}">Room</th>
      <th style="${thS}">Date</th>
      <th style="${thS}">Time</th>
      <th style="${thS}">Airport</th>
      <th style="${thS}">Flight</th>
      ${!isArr?`<th style="${thS}">Pickup</th>`:''}
      <th style="${thS}">Est. Cost</th>
      ${isArr?`<th style="${thS}">Share</th>`:''}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
function renderTeacherTransport(bkId){
  const wrap=document.getElementById('teacherTransportContent');if(!wrap)return;
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk){wrap.innerHTML='';return;}
  // Always sync from Supabase first so new guest submissions are visible
  syncTransportFromSupabase().then(()=>_renderTeacherTransportInner(bkId));
  _renderTeacherTransportInner(bkId); // immediate render from cache while sync happens
}
function _renderTeacherTransportInner(bkId){
  const wrap=document.getElementById('teacherTransportContent');if(!wrap)return;
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk){wrap.innerHTML='';return;}
  const {roster,guestsWithTransport,submittedCount,orphanSubs}=getTransportRoster(bkId);
  const _allTr=loadTransport(); // all retreats — needed for cross-retreat pricing

  if(!roster.length){
    wrap.innerHTML=`<div style="color:#8a7e74;font-size:13px;text-align:center;padding:40px 0;max-width:420px;margin:0 auto;line-height:1.65">
      No guests on your room list yet. Add guests under <b>My Room List</b> first — transport tracking is based on that roster so you can see who still needs to submit flight info.
    </div>`;
    return;
  }

  function sortKey(g,type){
    const tr=g.tr;
    const date=type==='arr'?tr?.arrivalDate:tr?.departureDate;
    const time=type==='arr'?tr?.arrivalTime:tr?.departureTime;
    const ot=type==='arr'?tr?.arrivalOT:tr?.departureOT;
    if(!date&&!ot)return'9999-99-99 99:99 '+g.name;
    if(ot)return'9998-99-99 99:99 '+g.name;
    return(date||'9999')+' '+(time||'99:99')+' '+g.name;
  }
  const arrGuests=[...guestsWithTransport].sort((a,b)=>sortKey(a,'arr').localeCompare(sortKey(b,'arr')));
  const depGuests=[...guestsWithTransport].sort((a,b)=>sortKey(a,'dep').localeCompare(sortKey(b,'dep')));
  const arrResult=_trAssignRideGroups(arrGuests,'arr',_allTr);
  const depResult=_trAssignRideGroups(depGuests,'dep',_allTr);
  const arrCount=guestsWithTransport.filter(g=>g.tr?.arrivalDate||g.tr?.arrivalOT).length;
  const depCount=guestsWithTransport.filter(g=>g.tr?.departureDate||g.tr?.departureOT).length;

  // Teacher pays transport banner
  const _tpFlags=bk.flags||[];
  const _tpPaysArr=_tpFlags.includes('teacher_pays_arrival_transport');
  const _tpPaysDep=_tpFlags.includes('teacher_pays_departure_transport');
  let _tpArrTotal=0,_tpDepTotal=0;
  if(_tpPaysArr)arrGuests.forEach((g,i)=>{const p=arrResult.prices[i];if(p?.pp)_tpArrTotal+=p.pp;});
  if(_tpPaysDep)depGuests.forEach((g,i)=>{const p=depResult.prices[i];if(p?.pp)_tpDepTotal+=p.pp;});
  const _tpBanner=(!_tpPaysArr&&!_tpPaysDep)?'':`<div style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:12px;padding:14px 20px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
    <span style="font-size:18px">★</span>
    <div>
      <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:3px">Teacher paying transportation</div>
      <div style="font-size:12px;color:#78350f">${[
        _tpPaysArr?(_tpArrTotal>0?`🛬 Arrivals total: <strong>$${_tpArrTotal}</strong> <span style="font-size:10px;opacity:.7">(est.)</span>`:'🛬 Arrivals: pending submissions'):'',
        _tpPaysDep?(_tpDepTotal>0?`🛫 Departures total: <strong>$${_tpDepTotal}</strong> <span style="font-size:10px;opacity:.7">(est.)</span>`:'🛫 Departures: pending submissions'):''
      ].filter(Boolean).join(' &nbsp;·&nbsp; ')}</div>
    </div>
  </div>`;

  const _trFormUrl=`${location.origin}/transport-form.html?bk=${bkId}`;
  let html=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
    <span style="font-size:12px;color:#8a7e74">${submittedCount} / ${roster.length} guests submitted</span>
    <div style="display:flex;gap:8px">
      <button onclick="navigator.clipboard&&navigator.clipboard.writeText('${_trFormUrl}').then(()=>{this.textContent='✓ Copied!';setTimeout(()=>this.textContent='🔗 Copy Form Link',1800)})" style="padding:6px 14px;border:1px solid #e8dfd4;border-radius:8px;background:#fff;font-family:'Jost',sans-serif;font-size:12px;cursor:pointer;color:#5a5048">🔗 Copy Form Link</button>
      <button onclick="renderTeacherTransport('${bkId}')" style="padding:6px 14px;border:1px solid #e8dfd4;border-radius:8px;background:#fff;font-family:'Jost',sans-serif;font-size:12px;cursor:pointer;color:#5a5048">↻ Refresh</button>
    </div>
  </div>`;

  if(orphanSubs.length){
    html+=`<div style="background:#fff;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#991b1b;line-height:1.55">
      <b>${orphanSubs.length} transport form${orphanSubs.length!==1?'s':''}</b> received from people not on your room list:
      ${orphanSubs.map(s=>escHtml(`${s.firstName} ${s.lastName}`.trim())).join(', ')}.
      Ask Amansala to align these with your room list if they should be in your group.
    </div>`;
  }

  const cardS='background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:16px;border:1px solid #e8dfd4';
  const hdS='padding:14px 20px;border-bottom:1px solid #e8dfd4;display:flex;align-items:center;gap:10px';

  html+=`<div style="${cardS}">
    <div style="${hdS}">
      <span style="font-size:15px">✈️</span>
      <span style="font-size:13px;font-weight:700;color:#2d2520">Arrivals</span>
      <span style="font-size:11px;font-weight:600;padding:2px 9px;border-radius:20px;background:#f0fdf9;color:#0e9494">${arrCount} submitted</span>
    </div>
    ${_trBuildTransportTable(arrGuests,'arr',arrResult)}
  </div>

  <div style="${cardS}">
    <div style="${hdS}">
      <span style="font-size:15px">🛫</span>
      <span style="font-size:13px;font-weight:700;color:#2d2520">Departures</span>
      <span style="font-size:11px;font-weight:600;padding:2px 9px;border-radius:20px;background:#fffbf0;color:#b45309">${depCount} submitted</span>
    </div>
    ${_trBuildTransportTable(depGuests,'dep',depResult)}
  </div>

  ${_tpBanner}

  <div style="background:#f0fdf9;border:1px solid #9dd1d1;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:12.5px;color:#0e5f5f;line-height:1.7">
    <strong>Need transport assistance?</strong> Contact us at <a href="mailto:retreats@amansala.com" style="color:#0e9494;font-weight:700">retreats@amansala.com</a> and we'll be happy to help arrange airport transfers or shared shuttles.
  </div>

  ${_trPricingCardHtml()}`;

  wrap.innerHTML=html;
}

function enterTeacherView(bkId){
  document.getElementById('teacherLoginScreen').style.display='none';
  document.body.classList.add('teacher-mode');
  if(sessionStorage.getItem('ama_admin_viewing')==='1')document.body.classList.add('admin-preview');
  // Apply lock immediately (before Supabase merge) so CSS takes effect from first render
  const _previewLockedId=sessionStorage.getItem('ama_preview_locked_bk');
  const bk=AppData.bookings.find(b=>b.id===bkId);
  if(_previewLockedId===bkId){
    if(bk)bk.allLocked=true;
    document.body.classList.add('retreat-locked');
  }
  if(bk){
    document.querySelector('.app-brand').innerHTML=`Amansala <span>TEACHER PORTAL</span>`;
    const nameTag=document.createElement('span');
    nameTag.style.cssText='font-family:Jost,sans-serif;font-size:12px;color:rgba(255,255,255,.6);margin-left:16px;';
    nameTag.textContent=`${bk.leaderName||bk.retreatName} · ${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}`;
    document.querySelector('.app-header>div:first-child').appendChild(nameTag);
    // Record last-seen timestamp — only for real teacher logins, not admin preview
    if(!sessionStorage.getItem('ama_teacher_mode')){
      bk.teacherLastSeen=new Date().toISOString();
      bk.teacherSeenCount=(bk.teacherSeenCount||0)+1;
      saveAll();
    }
  }
  // If admin entered via "Preview as Teacher", show the return button
  if(sessionStorage.getItem('ama_teacher_mode')==='1'){
    const btn=document.getElementById('adminReturnBtn');
    if(btn)btn.style.display='inline-block';
  }
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  const tp=document.getElementById('tab-teacherreg');if(tp)tp.classList.add('active');
  regInitSel();
  setTimeout(()=>{
    if(bkId)regSelectRetreat(bkId);
    const row=document.getElementById('regRetreatSelWrap')?.closest('.reg-retreat-sel-row');
    if(row)row.style.display='none';
    // Show teacher nav
    document.getElementById('teacherNav').style.display='flex';
    // Build dashboard
    const bkr=AppData.bookings.find(b=>b.id===bkId);
    if(bkr){
      const lbl=document.getElementById('td-retreat-label');
      if(lbl)lbl.textContent=`${bkr.leaderName||bkr.retreatName} · ${fmtDate(bkr.startDate)} – ${fmtDate(bkr.endDate)} · ${getNights(bkr)} nights`;
      renderChecklist(bkId);
      tdRenderTransportReminder(bkId);
      renderYogiLetter(bkr);
      renderPlanningGuide();
      loadWhatsappField(bkr);
      // Show red dot on Contract tab if contract is pending signature
      const contractBtn=document.getElementById('tnBtnContract');
      const contractReady=bkr.contractSentViaPortal||['contract_sent','contract_signed','deposit_paid','room_list_sent','confirmed'].includes(bkr.status);
      if(contractBtn&&contractReady&&!bkr.contractSignedAt){
        if(!contractBtn.querySelector('.tn-dot')){
          const dot=document.createElement('span');dot.className='tn-dot';contractBtn.appendChild(dot);
        }
      }
      // Show green dot on Room List tab if rooms are assigned
      const roomsBtn=document.getElementById('tnBtnRooms');
      if(roomsBtn&&(bkr.blockedRooms||[]).length>0){
        if(!roomsBtn.querySelector('.tn-dot')){
          const dot=document.createElement('span');dot.className='tn-dot';dot.style.background='#16a34a';roomsBtn.appendChild(dot);
        }
      }
      // Show orange dot on My Finances tab if deposit invoice pending OR final payment approaching
      const finBtn=document.getElementById('tnBtnFinancial');
      if(finBtn){
        const depositPending=bkr.depositInvoice&&bkr.depositInvoice.status==='pending';
        const daysOut=daysUntil(bkr.startDate);
        const {balance}=calcBkBalance(bkr);
        const finalApproaching=daysOut<=49&&balance>0;
        if((depositPending||finalApproaching)&&!finBtn.querySelector('.tn-dot')){
          const dot=document.createElement('span');dot.className='tn-dot';dot.style.background='#d97706';finBtn.appendChild(dot);
        }
      }
    }
    // If contract is pending, start on contract view; if room list just sent, go to rooms; otherwise dashboard
    const bkrCheck=AppData.bookings.find(b=>b.id===bkId);
    if(bkrCheck&&bkrCheck.contractSentViaPortal&&!bkrCheck.contractSignedAt){
      teacherShowView('contract');
    } else if(bkrCheck&&(bkrCheck.blockedRooms||[]).length>0&&bkrCheck.status==='room_list_sent'){
      teacherShowView('rooms');
    } else {
      teacherShowView('dash');
    }
    skylarInit();
  },80);
}

// Admin: show teacher code in Teacher Reg toolbar
function teacherPortalLink(bkId){
  return `${location.origin}/booking-hub.html?mode=teacher&bk=${bkId}`;
}

function showTeacherCode(){
  if(!regSelBk)return;
  const link=teacherPortalLink(regSelBk.id);
  navigator.clipboard.writeText(link).catch(()=>{});
  showToast('Portal link copied!');
  document.getElementById('regTeacherCodeWrap').style.display='none';
}

function copyTeacherLink(){
  if(!regSelBk)return;
  navigator.clipboard.writeText(teacherPortalLink(regSelBk.id)).then(()=>showToast('Link copied!')).catch(()=>showToast('Link: '+teacherPortalLink(regSelBk.id)));
}

function openTeacherEmailModal(){
  if(!regSelBk)return;
  const link=teacherPortalLink(regSelBk.id);
  const name=regSelBk.leaderName||regSelBk.retreatName||'Teacher';
  const firstName=name.split(' ')[0];
  const retreat=regSelBk.retreatName||regSelBk.leaderName||'Retreat';
  const dates=`${fmtDate(regSelBk.startDate)} – ${fmtDate(regSelBk.endDate)}`;
  const nights=getNights(regSelBk);
  document.getElementById('teacherEmailSub').textContent=name;
  document.getElementById('teacherEmailSubject').value=
    `Your Room Registration Portal — ${retreat} (${dates})`;
  document.getElementById('teacherEmailBody').value=
`Hi ${firstName},

Your Amansala room registration portal is ready. Please use the link below to access your retreat and complete your room list:

${link}

This link is unique to your retreat — ${retreat}, ${dates} (${nights} nights).

Questions? Contact us at darlene@amansala.com.

Warm regards,
The Amansala Team`;
  openModal('teacherEmailModal');
}

function openTeacherEmailApp(){
  const modal=document.getElementById('teacherEmailModal');
  const to=modal.dataset.to||'';
  const subj=document.getElementById('teacherEmailSubject').value;
  const body=document.getElementById('teacherEmailBody').value;
  window.location.href='mailto:'+encodeURIComponent(to)+'?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body);
}

function copyTeacherEmailAll(){
  const subj=document.getElementById('teacherEmailSubject').value;
  const body=document.getElementById('teacherEmailBody').value;
  navigator.clipboard.writeText(`Subject: ${subj}\n\n${body}`)
    .then(()=>showToast('Email copied to clipboard!'))
    .catch(()=>showToast('Select the text above and copy manually.'));
}

document.addEventListener('DOMContentLoaded',function(){
  try{initStaffLogin();}catch(e){console.error('initStaffLogin failed',e);const ov=document.getElementById('staffLoginOverlay');if(ov)ov.style.display='flex';}
});

// ── PRINT SCHEDULE ──────────────────────────────────────────────────────────
let _schedBkId=null;

function openPrintSchedule(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  _schedBkId=bkId;
  const sr=bk.scheduleRequest;
  const nights=Math.max(1,Math.round((pd(bk.endDate)-pd(bk.startDate))/DAY_MS));
  const DAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MON_NAMES=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // Build confirmed shala names
  const shalaName=id=>id?(SHALAS.find(s=>s.id===id)?.name||id):'';
  const mShala=sr?shalaName(sr.morningShala1):'';
  const aShala=sr?shalaName(sr.afternoonShala1):'';
  // Format time
  const fmtT=t=>{if(!t)return'';const[h,m]=t.split(':').map(Number);const ap=h>=12?'PM':'AM';return`${h%12||12}:${String(m).padStart(2,'0')} ${ap}`;};
  const addMin=(t,mins)=>{if(!t)return'';const[h,m]=t.split(':').map(Number);const tot=h*60+m+mins;const hh=Math.floor(tot/60)%24;return`${String(hh).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}`;};
  // Build days — a retreat with N nights has N+1 calendar days (arrival day,
  // then each night, then the departure/checkout day), so this must loop
  // through nights INCLUSIVE or the departure day silently never appears.
  const days=[];
  for(let i=0;i<=nights;i++){
    const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
    const dateStr=d.toISOString().slice(0,10);
    const dayLabel=DAY_NAMES[d.getDay()]+' | '+MON_NAMES[d.getMonth()]+' '+(d.getDate())+(i===0?'st':i===1?'nd':i===2?'rd':'th');
    const rows=[];
    if(i===0){
      rows.push({time:'3:00 PM',desc:'Check-in',shala:'',cls:'',sk:'15:00'});
      const snackTimeP=tsArrivalSnackTime(bk);
      if(snackTimeP)rows.push({time:fmtT(snackTimeP),desc:'Welcome Snack',shala:'',cls:'',sk:snackTimeP});
      if(sr?.hasArrivalClass&&sr?.arrivalSlot){
        const end=fmtT(addMin(sr.arrivalSlot,sr.arrivalDur||60));
        rows.push({time:fmtT(sr.arrivalSlot)+' – '+end,desc:tsEffClassLabel(sr,'arrival','Opening Class'),shala:mShala,cls:'shala',sk:sr.arrivalSlot});
      }
      rows.push({time:'7:30 PM',desc:'Dinner',shala:'',cls:'',sk:'19:30'});
    } else if(i===nights){
      rows.push({time:'7:00 AM',desc:'Fruit, Coffee &amp; Tea — Closing Comments',shala:'',cls:'',sk:'07:00'});
      if(sr?.hasDepartureClass&&sr?.departureSlot){
        const depShala=shalaName(sr.departureShala1||sr.morningShala1);
        const end=fmtT(addMin(sr.departureSlot,sr.departureDur||60));
        rows.push({time:fmtT(sr.departureSlot)+' – '+end,desc:tsEffClassLabel(sr,'departure','Departure Morning Class'),shala:depShala,cls:'shala',sk:sr.departureSlot});
      } else {
        const _usualDep=tsUsualMorning(bk);
        if(_usualDep.start){
          const end=fmtT(addMin(_usualDep.start,_usualDep.dur||60));
          rows.push({time:fmtT(_usualDep.start)+' – '+end,desc:tsEffClassLabel(sr,'morning','Morning Class'),shala:mShala,cls:'shala',sk:_usualDep.start});
        }
      }
      rows.push({time:'9:30 AM',desc:'Full Breakfast',shala:'',cls:'',sk:'09:30'});
      rows.push({time:'',desc:'Departures',shala:'',cls:'',sk:'99:99'});
    } else {
      if(sr?.hasSunrise&&sr?.sunriseStart&&(sr.sunriseDates||[]).includes(dateStr)){
        const srEnd=fmtT(addMin(sr.sunriseStart,sr.sunriseDur||45));
        rows.push({time:fmtT(sr.sunriseStart)+' – '+srEnd,desc:'Sunrise Activity'+(sr.sunriseLocation?' — '+(TS_SUNRISE_LOCATIONS[sr.sunriseLocation]||sr.sunriseLocation):'')+' (no shala, no music — quiet hours)',shala:'',cls:'',sk:sr.sunriseStart});
      }
      rows.push({time:'7:00 AM',desc:'Fruit, Coffee &amp; Tea',shala:'',cls:'',sk:'07:00'});
      // Per-day time/shala overrides — must be applied here too, not just on
      // the read-only itinerary view, or the printed sheet goes stale the
      // moment a teacher sets a different time/shala for a specific day.
      const _pTimeOvs=bk.scheduleTimeOverrides||[];
      const _pMornOv=_pTimeOvs.find(o=>o.date===dateStr&&o.period==='morn');
      const _pAftOv=_pTimeOvs.find(o=>o.date===dateStr&&o.period==='aft');
      const _pUsualMorn=tsUsualMorning(bk);
      const _pDayMornStart=_pMornOv?_pMornOv.start:_pUsualMorn.start;
      const _pDayMornDur=_pMornOv?(_pMornOv.dur||_pUsualMorn.dur||60):(_pUsualMorn.dur||60);
      const _pDayMornShala=shalaName(_pMornOv?.shala1||sr?.morningShala1);
      if(_pDayMornStart){
        const end=fmtT(addMin(_pDayMornStart,_pDayMornDur));
        rows.push({time:fmtT(_pDayMornStart)+' – '+end,desc:tsEffClassLabelDay(sr,bk,dateStr,'morn','morning','Morning Class')+(_pMornOv?' (time changed)':''),shala:_pDayMornShala,cls:'shala',sk:_pDayMornStart});
      }
      const _pOv=sr?.adminOverride||{};const _pMStart=_pOv.morningStart||_pUsualMorn.start||'';const _pMDur=parseInt(_pOv.morningDur||_pUsualMorn.dur||90);const _pBrunchT=_pMStart?addMin(_pMStart,_pMDur+15):'09:45';
      rows.push({time:fmtT(_pBrunchT),desc:_pBrunchT<'09:45'?'Breakfast':'Brunch',shala:'',cls:'',sk:_pBrunchT});
      rows.push({time:'3:00 PM',desc:'Snack',shala:'',cls:'',sk:'15:00'});
      if(sr?.workshops){
        const ws=(sr.workshops||[]).find(w=>w.enabled&&w.date===dateStr);
        if(ws){
          const wsEnd=fmtT(addMin(ws.start,ws.dur||90));
          rows.push({time:fmtT(ws.start)+' – '+wsEnd,desc:'Mid-Afternoon Class'+(ws.notes?' — '+ws.notes:''),shala:shalaName(ws.shala1),cls:'shala',sk:ws.start||'16:00'});
        }
      }
      const _pDayAfSlot=_pAftOv?_pAftOv.start:(sr?.afternoonSlot||sr?.afternoonStart);
      const _pDayAfDur=_pAftOv?(_pAftOv.dur||sr?.afternoonDur||60):(sr?.afternoonDur||60);
      const _pDayAfShala=shalaName(_pAftOv?.shala1||sr?.afternoonShala1);
      if(sr?.hasAfternoon&&_pDayAfSlot){
        const aEnd=fmtT(addMin(_pDayAfSlot,_pDayAfDur));
        rows.push({time:fmtT(_pDayAfSlot)+' – '+aEnd,desc:tsEffClassLabelDay(sr,bk,dateStr,'aft','afternoon','Afternoon Class')+(_pAftOv?' (time changed)':''),shala:_pDayAfShala,cls:'shala',sk:_pDayAfSlot||'16:30'});
      }
      const isOffsite=sr?.offsiteNight&&(()=>{
        const ofNight=pd(bk.startDate).getTime()+(parseInt(sr.offsiteNight)-1)*DAY_MS;
        return Math.abs(d.getTime()-ofNight)<DAY_MS/2;
      })();
      const hasGitanoPrint=(bk.retreatActivities||[]).some(a=>a.aoId==='ao13'&&a.date===dateStr);
      if(!hasGitanoPrint)rows.push({time:'7:30 PM',desc:isOffsite?'Dinner | Off-site':'Dinner',shala:'',cls:'',sk:'19:30'});
    }
    // Tours/ceremonies/prepaid activities can land on any day EXCEPT arrival.
    const printActMap={};ADD_ONS.forEach(a=>printActMap[a.id]=a);printActMap['ao12']={id:'ao12',name:'Group Salsa Class',price:0};
    (bk.retreatActivities||[]).filter(a=>a.date===dateStr&&dateStr!==bk.startDate).forEach(a=>{
      const ao=printActMap[a.aoId]||{name:a.aoId,price:0};
      const dur=ACTS_DUR[a.aoId]||90;
      const timeRange=a.time?(fmtT(a.time)+' – '+fmtT(addMin(a.time,dur))):'';
      const desc=a.prepaid?(ao.name+(a.requestedTime?' (requested this time)':'')):('Optional '+ao.name+(ao.price?' — $'+ao.price+' USD per person':''));
      rows.push({time:timeRange,desc,shala:ACT_SHALA[a.aoId]||'',cls:'',sk:a.time||'99:99'});
    });
    rows.sort((a,b)=>(a.sk||'99:99').localeCompare(b.sk||'99:99'));
    days.push({label:dayLabel,rows});
  }
  // Store for add-row
  window._schedDays=days;
  renderSchedulePrint(bk,days);
  document.getElementById('printScheduleModal').style.display='block';
}

function renderSchedulePrint(bk,days){
  const pax=bk.pax||'';
  const start=pd(bk.startDate);const end=pd(bk.endDate);
  const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateRange=`${MON[start.getMonth()]} ${start.getDate()} – ${MON[end.getMonth()]} ${end.getDate()}`;
  const half=Math.ceil(days.length/2);
  const left=days.slice(0,half);
  const right=days.slice(half);
  const renderDay=(day,di)=>{
    const parts=(day.label||'').split(' | ');
    const dayName=parts[0]||day.label;
    const dayDate=parts[1]||'';
    return`<div class="sched-day-block" data-day="${di}" style="margin-bottom:26px;break-inside:avoid">
      <div style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#9ca3af;font-family:'Jost',sans-serif;margin-bottom:2px">${dayName}</div>
      <div style="font-size:22px;font-weight:700;color:#1a2332;margin-bottom:7px;font-family:'Cormorant Garamond',Georgia,serif">${dayDate}</div>
      <div style="height:1px;background:#e0d8cc;margin-bottom:10px"></div>
      ${day.rows.map((r,ri)=>`
        <div style="display:flex;align-items:baseline;padding:5px 0;border-bottom:1px solid #f2ede8" data-ri="${ri}">
          <span style="min-width:130px;flex-shrink:0;padding-right:14px">
            <input class="sched-item-editable" value="${r.time}" placeholder="Time" onchange="schedEdit(${di},${ri},'time',this.value)" style="width:120px;font-size:14px;color:#6b7280;font-weight:600;font-family:'Jost',sans-serif">
          </span>
          <span style="flex:1">
            <input class="sched-item-editable" value="${r.desc}" placeholder="Activity" onchange="schedEdit(${di},${ri},'desc',this.value)" style="width:100%;font-size:14px;color:#1a2332;font-family:'Cormorant Garamond',Georgia,serif">
          </span>
          <span style="flex-shrink:0;margin-left:8px">
            <input class="sched-item-editable" value="${r.shala||''}" placeholder="" onchange="schedEdit(${di},${ri},'shala',this.value)" style="width:${r.shala?'90px':'0px'};font-size:14px;color:#4a7070;font-style:italic;font-family:'Cormorant Garamond',Georgia,serif">
          </span>
        </div>`).join('')}
    </div>`;
  };
  const printPrepaidIds=[...new Set([...(bk.packages||[]),...(bk.retreatActivities||[]).filter(a=>a.prepaid).map(a=>a.aoId)])];
  const printPrepaidItems=ADD_ONS.filter(a=>printPrepaidIds.includes(a.id));
  const printPrepaidHtml=printPrepaidItems.length?`<div style="background:#f0fdf4;border:1.5px solid #6ee7b7;border-radius:10px;padding:12px 16px;margin-bottom:22px;text-align:left">
    <div style="font-family:'Jost',sans-serif;font-size:14px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">✦ Prepaid Package</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${printPrepaidItems.map(ao=>`<span style="background:#dcfce7;color:#15803d;border:1px solid #6ee7b7;padding:3px 12px;border-radius:99px;font-size:14px;font-weight:600;font-family:'Jost',sans-serif">${ao.name}</span>`).join('')}</div>
  </div>`:'';
  document.getElementById('schedPrintArea').innerHTML=`
    <div style="text-align:center;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid #e0d8cc">
      <img src="/logo-amansala.png" alt="Amansala" style="height:50px;margin-bottom:8px">
      <div style="font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:700;color:#1a2332;margin-bottom:5px;letter-spacing:-.3px">${bk.leaderName||bk.retreatName}</div>
      <div style="font-family:'Jost',sans-serif;font-size:14px;color:#6b7280;font-weight:500;letter-spacing:.3px">${dateRange}${pax?' &nbsp;·&nbsp; '+pax+' guests':''}</div>
    </div>
    ${printPrepaidHtml}
    <div class="sched-days-grid">
      <div>${left.map((d,i)=>renderDay(d,i)).join('')}</div>
      <div>${right.map((d,i)=>renderDay(d,i+half)).join('')}</div>
    </div>`;
}

function schedEdit(di,ri,field,val){
  if(window._schedDays&&window._schedDays[di]&&window._schedDays[di].rows[ri])
    window._schedDays[di].rows[ri][field]=val;
}

function addScheduleRow(){
  const days=window._schedDays;if(!days)return;
  const dayIdx=parseInt(prompt(`Which day? (1–${days.length})`));
  if(isNaN(dayIdx)||dayIdx<1||dayIdx>days.length)return;
  days[dayIdx-1].rows.push({time:'',desc:'',shala:'',cls:''});
  const bk=AppData.bookings.find(b=>b.id===_schedBkId);
  if(bk)renderSchedulePrint(bk,days);
}

// ── SCHEDULE TAB (SKEDDA-LIKE) ──────────────────────────────────────────────
const SKED_SHALAS=[
  {id:'grande',    name:'Grande'},
  {id:'chica',     name:'Chica'},
  {id:'beachfront',name:'Beachfront'},
  {id:'heaven',    name:'Heaven Shala'},
  {id:'skye',      name:'Skye'},
];
const SKED_ACTIVITIES=[
  {id:'sunrise',  name:'Sunrise Activity'},
  {id:'ruins',    name:'Tulum Ruins Tour'},
  {id:'atik',     name:'Atik Cenote Tour'},
  {id:'cenote',   name:'Grande Cenote Tour'},
  {id:'mangroves',name:'Mangroves Tour'},
  {id:'muyil',    name:'Muyil Float Tour'},
  {id:'cacao',    name:'Sound Healing & Cacao Ceremony'},
  {id:'temazcal', name:'Mayan Temazcal'},
  {id:'clay',     name:'Mayan Clay Ceremony'},
  {id:'icebath',  name:'Ice Bath & Breathwork'},
  {id:'salsa',    name:'Group Salsa Class'},
  {id:'cooking',  name:'Cooking Class'},
  {id:'gitano',   name:'Gitano Dinner'},
  {id:'optional', name:'Pre-Paid Activity'},
];
const SKED_START_H=5;
const SKED_END_H=22;
const SKED_PX_HR=72;
const SKED_COL_W=150;
const SKED_TIME_W=72;
let schedEvents=[];
let skedViewDate=new Date();skedViewDate.setHours(0,0,0,0);

function skedLoadEvents(){
  try{const raw=localStorage.getItem('ama_schedEvents');if(raw)schedEvents=JSON.parse(raw);}catch(e){schedEvents=[];}
}
function skedSaveEvents(){
  try{localStorage.setItem('ama_schedEvents',JSON.stringify(schedEvents));}catch(e){}
}

function skedFmtTime(t){
  if(!t)return'';
  const[h,m]=t.split(':').map(Number);
  const ap=h>=12?'PM':'AM';
  const h12=h>12?h-12:h===0?12:h;
  return h12+(m?':'+String(m).padStart(2,'0'):'')+' '+ap;
}
function skedTimeToMin(t){const[h,m]=t.split(':').map(Number);return h*60+m;}
function skedMinToTime(min){const h=Math.floor(min/60);const m=min%60;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');}

let skedView='day'; // 'day' | 'week' | 'list'
let skedSubViewMode='calendar'; // 'calendar' | 'retreats'

function skedSubView(mode){
  skedSubViewMode=mode;
  document.getElementById('skedSubCalBtn').classList.toggle('active',mode==='calendar');
  document.getElementById('skedSubRspBtn').classList.toggle('active',mode==='retreats');
  document.getElementById('skedCalSection').style.display=mode==='calendar'?'flex':'none';
  document.getElementById('skedRspSection').style.display=mode==='retreats'?'block':'none';
  if(mode==='retreats')buildRetreatSchedulesPanel();
}

function buildRetreatSchedulesPanel(){
  const DAY_NAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MON_NAMES=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtDate=iso=>{if(!iso)return'—';const d=pd(iso);return MON_NAMES[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear();};
  const fmtT=t=>{if(!t)return'';const[h,m]=t.split(':').map(Number);const ap=h>=12?'PM':'AM';return`${h%12||12}:${String(m).padStart(2,'0')} ${ap}`;};
  const addMin=(t,mins)=>{if(!t)return'';const[h,m]=t.split(':').map(Number);const tot=h*60+m+mins;return`${Math.floor(tot/60)%24}:${String(tot%60).padStart(2,'0')}`;};
  const shalaName=id=>id?(SHALAS.find(s=>s.id===id)?.name||id):'—';
  const hasSched=AppData.bookings.filter(b=>b.scheduleRequest?.submittedAt);
  hasSched.sort((a,b)=>(a.startDate||'').localeCompare(b.startDate||''));
  const el=document.getElementById('rspContent');
  const statusBadge=s=>{
    const cfg={pending:{bg:'#fef3c7',c:'#92400e',lbl:'Pending'},confirmed:{bg:'#dcfce7',c:'#15803d',lbl:'Confirmed'},changes:{bg:'#fee2e2',c:'#dc2626',lbl:'Changes Requested'}};
    const r=cfg[s]||cfg.pending;
    return`<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:99px;font-size:11.5px;font-weight:700;background:${r.bg};color:${r.c}">${r.lbl}</span>`;
  };
  // Completion overview — every upcoming retreat in chronological order, with
  // who has and hasn't submitted a schedule flagged in red so it's obvious
  // at a glance who still needs to be chased.
  const todayStr=fmtISO(new Date());
  const upcoming=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.startDate&&b.startDate>=todayStr)
    .sort((a,b)=>(a.startDate||'').localeCompare(b.startDate||''));
  const missingCount=upcoming.filter(b=>!b.scheduleRequest?.submittedAt).length;
  const overviewRows=upcoming.map(b=>{
    const submitted=!!b.scheduleRequest?.submittedAt;
    const label=b.leaderName||b.retreatName||'Untitled Retreat';
    return `<tr style="${submitted?'':'background:#fef2f2'}">
      <td style="padding:8px 12px;border-bottom:1px solid #eee2d4;font-weight:600;color:${submitted?'var(--dark)':'#dc2626'}"><span onclick="openTeacherPortal('${b.id}')" style="cursor:pointer;text-decoration:underline;text-decoration-color:transparent;transition:text-decoration-color .15s" onmouseover="this.style.textDecorationColor='currentColor'" onmouseout="this.style.textDecorationColor='transparent'" title="Open ${escHtml(label)}'s teacher portal">${label}</span></td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee2d4;color:var(--muted);white-space:nowrap">${fmtDate(b.startDate)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee2d4">${submitted
        ?`<span style="color:#15803d;font-weight:700;font-size:12.5px">✓ Submitted</span> ${statusBadge(b.scheduleRequest.adminStatus||'pending')}`
        :`<span style="color:#dc2626;font-weight:700;font-size:12.5px">✗ Not Filled Out</span>`}</td>
    </tr>`;
  }).join('');
  const overviewHtml=`<div style="background:#fff;border:1px solid #e8dfd4;border-radius:12px;overflow:hidden;margin-bottom:24px">
    <div style="padding:12px 18px;border-bottom:1px solid #e8dfd4;display:flex;align-items:center;gap:10px;background:#f8f5f0">
      <span style="font-weight:700;font-size:13.5px;color:var(--dark)">Schedule Completion — Upcoming Retreats</span>
      <span style="font-size:11.5px;color:${missingCount?'#dc2626':'#15803d'};font-weight:700">${missingCount} of ${upcoming.length} still missing</span>
    </div>
    ${upcoming.length?`<table style="width:100%;border-collapse:collapse;font-size:12.5px"><tbody>${overviewRows}</tbody></table>`
      :'<p style="color:var(--muted);font-size:13px;text-align:center;padding:24px 0">No upcoming retreats found.</p>'}
  </div>`;
  if(!hasSched.length){el.innerHTML=overviewHtml+'<p style="color:var(--muted);font-size:13px;text-align:center;padding:40px 0">No retreat schedules submitted yet.</p>';return;}
  el.innerHTML=overviewHtml+hasSched.map((bk,idx)=>{
    const sr=bk.scheduleRequest;
    const st=sr.adminStatus||'pending';
    const nights=Math.max(1,Math.round((pd(bk.endDate)-pd(bk.startDate))/DAY_MS));
    // Build schedule rows excluding meals
    const dayBlocks=[];
    for(let i=0;i<=nights;i++){
      const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
      const dateStr=d.toISOString().slice(0,10);
      const dayLbl=DAY_NAMES[d.getDay()]+', '+MON_NAMES[d.getMonth()]+' '+d.getDate();
      const rows=[];
      const _rspMornOv=(bk.scheduleTimeOverrides||[]).find(o=>o.date===dateStr&&o.period==='morn');
      const _rspUsual=tsUsualMorning(bk);
      if(i===0){
        const us=_rspUsual;
        if(us.start){
          const end=fmtT(addMin(us.start,us.dur||60));
          rows.push({time:fmtT(us.start)+' – '+end,desc:tsEffClassLabel(sr,'arrival','Opening Class'),note:shalaName(us.shala1||sr.morningShala1),type:'class'});
        }
      } else if(i===nights){
        const us=_rspUsual;
        if(us.start){
          const end=fmtT(addMin(us.start,us.dur||60));
          rows.push({time:fmtT(us.start)+' – '+end,desc:tsEffClassLabel(sr,'morning','Morning Class'),note:shalaName(us.shala1||sr.morningShala1),type:'class'});
        }
      } else {
        const dayStart=_rspMornOv?.start;
        if(dayStart){
          const dayDur=_rspMornOv?.dur||60;
          const end=fmtT(addMin(dayStart,dayDur));
          rows.push({time:fmtT(dayStart)+' – '+end,desc:tsEffClassLabelDay(sr,bk,dateStr,'morn','morning','Morning Class'),note:shalaName(_rspMornOv?.shala1||sr.morningShala1),type:'class'});
        }
        const ws=(sr.workshops||[]).find(w=>w.enabled&&w.date===dateStr);
        if(ws){
          const wsEnd=fmtT(addMin(ws.start,ws.dur||90));
          rows.push({time:fmtT(ws.start)+' – '+wsEnd,desc:'Mid-Afternoon Class'+(ws.notes?' — '+ws.notes:''),note:shalaName(ws.shala1),type:'class'});
        }
        const _afSlotQ=sr.afternoonSlot||sr.afternoonStart;
        if(sr.hasAfternoon&&_afSlotQ){
          const aEnd=fmtT(addMin(_afSlotQ,sr.afternoonDur||60));
          rows.push({time:fmtT(_afSlotQ)+' – '+aEnd,desc:tsEffClassLabel(sr,'afternoon','Afternoon Class'),note:shalaName(sr.afternoonShala1),type:'class'});
        }
        (bk.retreatActivities||[]).filter(a=>a.date===dateStr&&dateStr!==bk.startDate).forEach(a=>{
          const ao=ADD_ONS.find(x=>x.id===a.aoId);if(!ao)return;
          const isTour=['ao1','ao2','ao3','ao6','ao7'].includes(a.aoId);
          const desc=a.prepaid
            ?(ao.name+' — Pre-Paid Activity')
            :((isTour?'Optional Tour to ':'Optional: ')+ao.name+(ao.price?' — $'+ao.price+' USD':''));
          rows.push({time:a.time?fmtT(a.time):'11:45 AM',desc,note:'',type:a.prepaid?'prepaid':'optional'});
        });
      }
      if(rows.length)dayBlocks.push({dayLbl,rows});
    }
    const rowsHtml=dayBlocks.map(db=>`
      <div class="rsp-day-heading">${db.dayLbl}</div>
      <table class="rsp-sched-table">
        ${db.rows.map(r=>`<tr style="${r.type==='prepaid'?'background:#f0fdf4':r.type==='optional'?'background:#eff6ff':''}">
          <td style="color:${r.type==='prepaid'?'#15803d':r.type==='optional'?'#2563eb':'var(--muted)'}">${r.time}</td>
          <td style="font-weight:${r.type==='class'?'600':'400'}">${r.desc}${r.note&&r.note!=='—'?'<span style="color:#c0392b;font-size:11.5px;font-weight:700;margin-left:6px">'+r.note+'</span>':''}</td>
        </tr>`).join('')}
      </table>`).join('');
    return`<div class="rsp-card" id="rsp-card-${idx}">
      <div class="rsp-card-hdr" onclick="rspToggle(${idx})">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--dark)">${bk.leaderName||bk.retreatName}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)} · ${nights} night${nights!==1?'s':''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          ${statusBadge(st)}
          ${(st==='pending'||st==='changes')?`<button class="btn btn-primary" style="font-size:11.5px;padding:6px 14px;white-space:nowrap;background:#059669;border-color:#059669" onclick="event.stopPropagation();openScheduleViewer('${bk.id}')">Review &amp; Confirm</button>`:''}
          ${st==='confirmed'?`<button class="btn btn-secondary" style="font-size:11.5px;padding:6px 12px;white-space:nowrap;color:#059669;border-color:#6ee7b7" onclick="event.stopPropagation();openScheduleViewer('${bk.id}')">View Confirmed</button>`:''}
          <button class="btn btn-secondary" style="font-size:11.5px;padding:6px 12px;white-space:nowrap" onclick="event.stopPropagation();openPrintSchedule('${bk.id}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print
          </button>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;transition:transform .2s" id="rsp-chevron-${idx}"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="rsp-card-body">${rowsHtml||'<p style="color:var(--muted);font-size:13px;font-style:italic">No schedule items.</p>'}</div>
    </div>`;
  }).join('');
}

function rspToggle(idx){
  const card=document.getElementById('rsp-card-'+idx);
  const chevron=document.getElementById('rsp-chevron-'+idx);
  if(!card)return;
  card.classList.toggle('open');
  if(chevron)chevron.style.transform=card.classList.contains('open')?'rotate(180deg)':'';
}

function skedSetView(v){
  skedView=v;
  ['day','week','list'].forEach(id=>{
    const btn=document.getElementById('skedView'+id.charAt(0).toUpperCase()+id.slice(1));
    if(btn){btn.style.background=id===v?'var(--teal)':'transparent';btn.style.color=id===v?'#fff':'var(--muted)';}
  });
  skedBuild();
}
function skedPrevPeriod(){
  if(skedView==='week')skedViewDate=addDays(skedViewDate,-7);
  else skedViewDate=addDays(skedViewDate,-1);
  skedBuild();
}
function skedNextPeriod(){
  if(skedView==='week')skedViewDate=addDays(skedViewDate,7);
  else skedViewDate=addDays(skedViewDate,1);
  skedBuild();
}
function skedPrevDay(){skedPrevPeriod();}
function skedNextDay(){skedNextPeriod();}
function skedGoToday(){skedViewDate=new Date();skedViewDate.setHours(0,0,0,0);skedBuild();}
let _skedMCY=0,_skedMCM=0,_skedMCOpen=false;
function skedOpenDatePicker(){
  const pop=document.getElementById('skedMiniCalPop');
  if(!pop)return;
  if(_skedMCOpen){skedMiniCalClose();return;}
  _skedMCY=skedViewDate.getFullYear();
  _skedMCM=skedViewDate.getMonth();
  skedMiniCalRender();
  pop.style.display='block';
  _skedMCOpen=true;
  setTimeout(()=>document.addEventListener('click',skedMiniCalOutside),10);
}
function skedMiniCalClose(){
  const pop=document.getElementById('skedMiniCalPop');
  if(pop)pop.style.display='none';
  _skedMCOpen=false;
  document.removeEventListener('click',skedMiniCalOutside);
}
function skedMiniCalOutside(){skedMiniCalClose();}
function skedMiniCalNav(dir){_skedMCM+=dir;if(_skedMCM>11){_skedMCM=0;_skedMCY++;}else if(_skedMCM<0){_skedMCM=11;_skedMCY--;}skedMiniCalRender();}
function skedMiniCalRender(){
  const MNAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DNAMES=['S','M','T','W','T','F','S'];
  const title=document.getElementById('skedMiniCalTitle');
  const grid=document.getElementById('skedMiniCalGrid');
  const legend=document.getElementById('skedMiniCalLegend');
  if(!title||!grid)return;
  title.textContent=MNAMES[_skedMCM]+' '+_skedMCY;
  // Build retreat date map for this month: iso→[{color,name}]
  const retreatMap={};
  const activeBookings=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.startDate&&b.endDate);
  activeBookings.forEach(bk=>{
    const pal=RETREAT_PALETTE[getRetreatColorIdx(bk.id)];
    const name=(bk.leaderName||bk.retreatName||'Retreat').split(' ')[0];
    const start=new Date(bk.startDate+'T12:00:00');
    const end=new Date(bk.endDate+'T12:00:00');
    for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
      const iso=d.toISOString().slice(0,10);
      if(!retreatMap[iso])retreatMap[iso]=[];
      retreatMap[iso].push({color:pal.border,bg:pal.bg,name});
    }
  });
  const todayISO=new Date().toISOString().slice(0,10);
  const selISO=fmtISO(skedViewDate);
  // First day of month, padding
  const first=new Date(_skedMCY,_skedMCM,1).getDay();
  const daysInMonth=new Date(_skedMCY,_skedMCM+1,0).getDate();
  let html='<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center">';
  // Day headers
  DNAMES.forEach(d=>{html+=`<div style="font-size:10px;font-weight:700;color:var(--muted);padding:2px 0">${d}</div>`;});
  // Empty cells before 1st
  for(let i=0;i<first;i++)html+='<div></div>';
  // Day cells
  for(let day=1;day<=daysInMonth;day++){
    const iso=`${_skedMCY}-${String(_skedMCM+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday=iso===todayISO;
    const isSel=iso===selISO;
    const retreats=retreatMap[iso]||[];
    const hasBk=retreats.length>0;
    const dots=retreats.slice(0,3).map(r=>`<div style="width:5px;height:5px;border-radius:50%;background:${r.color};flex-shrink:0"></div>`).join('');
    const bg=isSel?'var(--teal)':isToday?'#e8f5f5':'transparent';
    const txtClr=isSel?'#fff':isToday?'var(--teal)':'var(--dark)';
    const fw=isSel||isToday?'700':'400';
    html+=`<div onclick="skedPickDate('${iso}');skedMiniCalClose()" style="cursor:pointer;border-radius:8px;padding:4px 2px;background:${bg};color:${txtClr};font-weight:${fw};font-size:12.5px;display:flex;flex-direction:column;align-items:center;gap:2px;transition:background .12s" onmouseover="if('${iso}'!=='${selISO}')this.style.background='var(--sand)'" onmouseout="if('${iso}'!=='${selISO}')this.style.background='${bg}'">
      <span>${day}</span>
      ${hasBk?`<div style="display:flex;gap:1px;justify-content:center">${dots}</div>`:'<div style="height:5px"></div>'}
    </div>`;
  }
  html+='</div>';
  grid.innerHTML=html;
  // Legend: unique retreats active this month
  const seen=new Set();const legendItems=[];
  for(let day=1;day<=daysInMonth;day++){
    const iso=`${_skedMCY}-${String(_skedMCM+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    (retreatMap[iso]||[]).forEach(r=>{if(!seen.has(r.name)){seen.add(r.name);legendItems.push(r);}});
  }
  if(legend)legend.innerHTML=legendItems.map(r=>`<span style="display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${r.color}"></span>${r.name}</span>`).join('');
}
function skedPickDate(val){
  if(!val)return;
  const parts=val.split('-');
  skedViewDate=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
  skedBuild();
}

function skedGetRetreatEvents(dateStr){
  const evs=[];
  // Orientation with Amansala — every confirmed retreat gets one on its
  // arrival day, 15 minutes before its first (arrival) yoga class, or at a
  // fixed 8:30 PM (after dinner) in Grande if it has no arrival class. Ryan
  // leads by default; if two retreats land on the exact same Orientation
  // time, only the first keeps Ryan — the rest go to Max since Ryan can't
  // be in two places at once.
  const openingCircleLeaders={};
  {
    const candidates=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.scheduleRequest?.adminStatus==='confirmed'&&b.startDate===dateStr);
    const timeCounts={};
    candidates.forEach(bk=>{
      const sr=bk.scheduleRequest;
      const ocTime=(sr.hasArrivalClass&&sr.arrivalSlot)?skedMinToTime(skedTimeToMin(sr.arrivalSlot)-15):'20:30';
      timeCounts[ocTime]=(timeCounts[ocTime]||0)+1;
      openingCircleLeaders[bk.id]=timeCounts[ocTime]===1?'Ryan':'Max';
    });
  }
  AppData.bookings.filter(b=>b.status!=='cancelled'&&b.scheduleRequest?.adminStatus==='confirmed').forEach(bk=>{
    const sr=bk.scheduleRequest;
    if(!sr)return;
    if(dateStr<bk.startDate||dateStr>bk.endDate)return;
    const pal=RETREAT_PALETTE[getRetreatColorIdx(bk.id)];
    const title=bk.leaderName||bk.retreatName||'Retreat';
    // Merge adminOverride into effective schedule values (admin-assigned shala wins)
    const ov=sr.adminOverride||{};
    const usualMorn=tsUsualMorning(bk);
    const effMornStart=ov.morningStart||usualMorn.start;
    const effMornDur=ov.morningDur||usualMorn.dur||90;
    const effMornShala=ov.morningShala1||sr.morningShala1;
    const effAfSlot=ov.afternoonStart||sr.afternoonSlot||sr.afternoonStart;
    const effAfDur=ov.afternoonDur||sr.afternoonDur||75;
    // Fallback to morning shala if teacher didn't pick afternoon shala
    const effAfShala=ov.afternoonShala1||sr.afternoonShala1||sr.morningShala1;
    const isArrivalDay=dateStr===bk.startDate;
    const isDepartureDay=dateStr===bk.endDate;
    const musicNote=(Array.isArray(sr.music)?sr.music:[sr.music]).includes('system')?' 🎵':'';
    // Arrival day — show arrival evening class if set, otherwise fall back to opening morning class
    if(isArrivalDay){
      const ocLeader=openingCircleLeaders[bk.id]||'Ryan';
      if(sr.hasArrivalClass&&sr.arrivalSlot){
        const arShala=sr.arrivalShala1||effMornShala;
        const ocTime=skedMinToTime(skedTimeToMin(sr.arrivalSlot)-15);
        const ocEnd=sr.arrivalSlot;
        evs.push({id:'ret_'+bk.id+'_opencircle',resourceId:arShala||'grande',date:dateStr,startTime:ocTime,endTime:ocEnd,title,subtitle:'Orientation with Amansala — '+ocLeader,color:pal.border,bg:pal.bg,textColor:pal.text,isRetreat:true,bkId:bk.id});
        if(arShala){
          const arDur=sr.arrivalDur||60;
          const arEnd=skedMinToTime(skedTimeToMin(sr.arrivalSlot)+arDur);
          evs.push({id:'ret_'+bk.id+'_arr',resourceId:arShala,date:dateStr,startTime:sr.arrivalSlot,endTime:arEnd,title,subtitle:tsEffClassLabel(sr,'arrival','Arrival Evening Class'),color:pal.border,bg:pal.bg,textColor:pal.text,isRetreat:true,bkId:bk.id});
        }
      } else {
        evs.push({id:'ret_'+bk.id+'_opencircle',resourceId:'grande',date:dateStr,startTime:'20:30',endTime:'20:45',title,subtitle:'Orientation with Amansala — '+ocLeader,color:pal.border,bg:pal.bg,textColor:pal.text,isRetreat:true,bkId:bk.id});
      }
      if(effMornStart&&effMornShala){
        // No arrival class — show opening morning class (respects a one-off override for this date)
        const arrOv=(bk.scheduleTimeOverrides||[]).find(o=>o.date===dateStr&&o.period==='morn');
        const arrStart=arrOv?arrOv.start:effMornStart;
        const arrDur=arrOv?.dur||effMornDur;
        const mEnd=skedMinToTime(skedTimeToMin(arrStart)+arrDur);
        evs.push({id:'ret_'+bk.id+'_morn_arr',resourceId:effMornShala,date:dateStr,startTime:arrStart,endTime:mEnd,title,subtitle:tsEffClassLabel(sr,'arrival','Opening Class')+(arrOv?' (time changed)':'')+musicNote,color:pal.border,bg:pal.bg,textColor:pal.text,isRetreat:true,bkId:bk.id});
      }
    }
    // Departure day — show departure morning class if set, otherwise fall back to regular morning class
    else if(isDepartureDay){
      if(sr.hasDepartureClass&&sr.departureSlot){
        const depShala=sr.departureShala1||effMornShala;
        if(depShala){
          const depDurVal=sr.departureDur||60;
          const depEnd=skedMinToTime(skedTimeToMin(sr.departureSlot)+depDurVal);
          evs.push({id:'ret_'+bk.id+'_dep',resourceId:depShala,date:dateStr,startTime:sr.departureSlot,endTime:depEnd,title,subtitle:tsEffClassLabel(sr,'departure','Departure Morning Class'),color:pal.border,bg:pal.bg,textColor:pal.text,isRetreat:true,bkId:bk.id});
        }
      } else if(effMornStart&&effMornShala){
        const depOv=(bk.scheduleTimeOverrides||[]).find(o=>o.date===dateStr&&o.period==='morn');
        const depStart=depOv?depOv.start:effMornStart;
        const depDur=depOv?.dur||effMornDur;
        const mEnd=skedMinToTime(skedTimeToMin(depStart)+depDur);
        evs.push({id:'ret_'+bk.id+'_morn_dep',resourceId:effMornShala,date:dateStr,startTime:depStart,endTime:mEnd,title,subtitle:tsEffClassLabel(sr,'departure','Morning Class')+(depOv?' (time changed)':'')+musicNote,color:pal.border,bg:pal.bg,textColor:pal.text,isRetreat:true,bkId:bk.id});
      }
    }
    // Middle days — morning class + evening class
    else {
      if(sr.hasSunrise&&sr.sunriseStart&&(sr.sunriseDates||[]).includes(dateStr)){
        const srEnd=skedMinToTime(skedTimeToMin(sr.sunriseStart)+(sr.sunriseDur||45));
        const srLoc=TS_SUNRISE_LOCATIONS[sr.sunriseLocation]||sr.sunriseLocation||'';
        evs.push({id:'ret_'+bk.id+'_sunrise_'+dateStr,resourceId:'sunrise',date:dateStr,startTime:sr.sunriseStart,endTime:srEnd,title,subtitle:'Sunrise Activity'+(srLoc?' — '+srLoc:'')+' (no music)',color:pal.border,bg:pal.bg,textColor:pal.text,isRetreat:true,bkId:bk.id});
      }
      const skips=bk.scheduleSkips||[];
      const mornSkipped=skips.some(s=>s.date===dateStr&&s.period==='morn');
      const aftSkipped=skips.some(s=>s.date===dateStr&&s.period==='aft');
      // Per-day time overrides — some teachers start/finish at different times on
      // different days rather than the same time every day.
      const timeOvs=bk.scheduleTimeOverrides||[];
      const mornOv=timeOvs.find(o=>o.date===dateStr&&o.period==='morn');
      const aftOv=timeOvs.find(o=>o.date===dateStr&&o.period==='aft');
      const dayMornStart=mornOv?mornOv.start:effMornStart;
      const dayMornDur=mornOv?(mornOv.dur||effMornDur):effMornDur;
      const dayAfSlot=aftOv?aftOv.start:effAfSlot;
      const dayAfDur=aftOv?(aftOv.dur||effAfDur):effAfDur;
      const dayMornShala=mornOv?.shala1||effMornShala;
      if(dayMornStart&&dayMornShala&&!mornSkipped){
        const mEnd=skedMinToTime(skedTimeToMin(dayMornStart)+dayMornDur);
        evs.push({id:'ret_'+bk.id+'_morn',resourceId:dayMornShala,date:dateStr,startTime:dayMornStart,endTime:mEnd,title,subtitle:tsEffClassLabelDay(sr,bk,dateStr,'morn','morning','Morning Class')+(mornOv?' (time changed)':'')+musicNote,color:pal.border,bg:pal.bg,textColor:pal.text,isRetreat:true,bkId:bk.id});
      }
      const hasAf=sr.hasAfternoon||(ov.afternoonStart&&(ov.afternoonShala1||sr.afternoonShala1||sr.morningShala1));
      const dayAfShala=aftOv?.shala1||effAfShala;
      if(hasAf&&dayAfSlot&&dayAfShala&&!aftSkipped){
        const aEnd=skedMinToTime(skedTimeToMin(dayAfSlot)+dayAfDur);
        evs.push({id:'ret_'+bk.id+'_aft',resourceId:dayAfShala,date:dateStr,startTime:dayAfSlot,endTime:aEnd,title,subtitle:tsEffClassLabelDay(sr,bk,dateStr,'aft','afternoon','Evening Class')+(aftOv?' (time changed)':''),color:pal.border,bg:pal.bg,textColor:pal.text,isRetreat:true,bkId:bk.id});
      }
    }
    // Workshops — only shala1
    if(sr.hasWorkshop&&sr.workshops){
      sr.workshops.filter(w=>w.enabled&&w.date===dateStr&&w.shala1).forEach(w=>{
        const wDur=w.dur||90;
        const wEnd=w.start?skedMinToTime(skedTimeToMin(w.start)+wDur):'';
        evs.push({id:'ret_'+bk.id+'_ws_'+dateStr,resourceId:w.shala1,date:dateStr,startTime:w.start||'',endTime:wEnd,title,subtitle:'Mid-Afternoon Class'+(w.notes?' — '+w.notes.slice(0,24):''),color:pal.border,bg:pal.bg,textColor:pal.text,isRetreat:true,bkId:bk.id});
      });
    }
    // Activities assigned by admin — never on the arrival day
    (bk.retreatActivities||[]).filter(a=>a.date===dateStr&&dateStr!==bk.startDate).forEach(a=>{
      const ao=ADD_ONS.find(x=>x.id===a.aoId);if(!ao)return;
      const aoMap={ao1:'ruins',ao6:'cenote',ao7:'mangroves',ao2:'muyil',ao3:'atik',ao4:'cacao',ao5:'temazcal',ao9:'clay',ao10:'icebath',ao12:'salsa',ao8:'ruins',ao11:'ruins',ao13:'gitano',ao14:'cooking'};
      const startT=a.time||'09:00';
      const endT=skedMinToTime(skedTimeToMin(startT)+90);
      if(a.prepaid){
        // Prepaid — show in the activity's own column in green AND in Pre-Paid Activity column
        const rsId=aoMap[a.aoId]||'ruins';
        evs.push({id:'ret_'+bk.id+'_ao_'+a.aoId+'_'+dateStr,resourceId:rsId,date:dateStr,startTime:startT,endTime:endT,title:ao.name,subtitle:title+' · Pre-Paid Activity',color:'#059669',bg:'#d1fae5',textColor:'#065f46',isRetreat:true,bkId:bk.id});
        evs.push({id:'ret_'+bk.id+'_ao_'+a.aoId+'_prepaid_opt_'+dateStr,resourceId:'optional',date:dateStr,startTime:startT,endTime:endT,title:ao.name,subtitle:title+' · Pre-Paid Activity',color:'#059669',bg:'#d1fae5',textColor:'#065f46',isRetreat:true,bkId:bk.id});
      } else {
        // Optional — collect for grouping below
        evs.push({id:'ret_'+bk.id+'_ao_'+a.aoId+'_opt_'+dateStr,resourceId:'optional',date:dateStr,startTime:startT,endTime:endT,title:ao.name,subtitle:title,_price:ao.price,color:'#d97706',bg:'#fef3c7',textColor:'#92400e',isRetreat:true,bkId:bk.id,_isOptional:true});
      }
    });
  });
  // Group optional events with same activity + time into one merged block
  const nonOpt=evs.filter(e=>!e._isOptional);
  const optMap={};
  evs.filter(e=>e._isOptional).forEach(e=>{
    const key=e.title+'|'+e.startTime+'|'+e.date;
    if(!optMap[key]){optMap[key]={...e,_names:[e.subtitle]};}
    else if(!optMap[key]._names.includes(e.subtitle))optMap[key]._names.push(e.subtitle);
  });
  const mergedOpt=Object.values(optMap).map(({_names,_price,...e})=>({
    ...e,
    subtitle:_names.join(', ')+' · Optional'+((_price||_price===0)?' — $'+_price:''),
    id:'opt_merged_'+e.title.replace(/\W/g,'_')+'_'+e.startTime+'_'+e.date
  }));
  return [...nonOpt,...mergedOpt];
}

function skedBuild(){
  try{
  const lbl=document.getElementById('skedDateLabelText');
  const wrap=document.getElementById('skedWrap');
  if(!lbl||!wrap){return;}
  const inp=document.getElementById('skedDateInput');

  const DAYS_LONG=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const DAYS_SHORT=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS_LONG=['January','February','March','April','May','June','July','August','September','October','November','December'];

  if(skedView==='week'){
    // Week: show Mon of week to Sun
    const dow=skedViewDate.getDay();
    const weekStart=addDays(skedViewDate,-(dow===0?6:dow-1));
    const weekEnd=addDays(weekStart,6);
    lbl.textContent=MONTHS_LONG[weekStart.getMonth()]+' '+weekStart.getDate()+' – '+MONTHS_LONG[weekEnd.getMonth()]+' '+weekEnd.getDate()+', '+weekEnd.getFullYear();
    if(inp) inp.value=fmtISO(weekStart);
    wrap.innerHTML=skedBuildWeek(weekStart,DAYS_SHORT,MONTHS_LONG);
    return;
  }
  if(skedView==='list'){
    // List: 7-day rolling list
    lbl.textContent='Next 7 Days — '+MONTHS_LONG[skedViewDate.getMonth()]+' '+skedViewDate.getDate();
    if(inp) inp.value=fmtISO(skedViewDate);
    wrap.innerHTML=skedBuildList(7,DAYS_LONG,MONTHS_LONG);
    return;
  }
  // Day view
  lbl.textContent=DAYS_LONG[skedViewDate.getDay()].toUpperCase()+', '+MONTHS_LONG[skedViewDate.getMonth()].toUpperCase()+' '+skedViewDate.getDate()+', '+skedViewDate.getFullYear();
  if(inp) inp.value=fmtISO(skedViewDate);

  const dateStr=fmtISO(skedViewDate);
  const retreatEvs=skedGetRetreatEvents(dateStr);
  const manualEvs=schedEvents.filter(e=>e.date===dateStr);
  const bbcEvs=typeof skedGetBbcEvents==='function'?skedGetBbcEvents(dateStr):[];
  const allEvs=[...retreatEvs,...manualEvs,...bbcEvs];

  const allCols=[...SKED_SHALAS.map(s=>({...s,group:'shala'})),...SKED_ACTIVITIES.map(a=>({...a,group:'activity'}))];
  const gridH=(SKED_END_H-SKED_START_H)*SKED_PX_HR;
  const HEADER_H=72; // two rows of 36px each

  // Build column event maps
  const colEvs={};
  allCols.forEach(c=>{colEvs[c.id]=allEvs.filter(e=>e.resourceId===c.id);});

  let html='<div style="display:flex;min-width:'+(SKED_TIME_W+allCols.length*SKED_COL_W)+'px;position:relative">';

  // Time gutter
  html+='<div style="width:'+SKED_TIME_W+'px;min-width:'+SKED_TIME_W+'px;flex-shrink:0;position:sticky;left:0;z-index:20;background:#fff;border-right:2px solid #e0d8cc">';
  // Header placeholder (matches two header rows)
  html+='<div style="height:'+HEADER_H+'px;border-bottom:2px solid #e0d8cc;background:#fff;position:sticky;top:0;z-index:31"></div>';
  // Hour labels
  html+='<div style="position:relative;height:'+gridH+'px">';
  for(let h=SKED_START_H;h<=SKED_END_H;h++){
    const top=(h-SKED_START_H)*SKED_PX_HR;
    const ap=h>=12?'PM':'AM';
    const h12=h>12?h-12:h===0?12:h;
    html+='<div style="position:absolute;top:'+top+'px;left:0;right:0;height:'+SKED_PX_HR+'px;border-bottom:1px solid #f1f5f9;box-sizing:border-box">';
    html+='<div style="position:absolute;top:-8px;right:6px;font-size:10px;font-weight:600;color:#9ca3af;white-space:nowrap">'+h12+' '+ap+'</div>';
    html+='</div>';
  }
  html+='</div></div>';

  // Columns area (all cols together in a flex row, with sticky header)
  html+='<div style="flex:1;display:flex;flex-direction:column">';
  // Sticky two-row header
  html+='<div style="position:sticky;top:0;z-index:30;display:flex;flex-direction:column">';
  // Row 1: Group labels
  html+='<div style="display:flex;height:36px">';
  html+='<div style="width:'+(SKED_SHALAS.length*SKED_COL_W)+'px;min-width:'+(SKED_SHALAS.length*SKED_COL_W)+'px;display:flex;align-items:center;justify-content:center;background:#ecfdf5;border-bottom:1px solid #d1fae5;border-right:2px solid #6ee7b7;font-size:11px;font-weight:700;letter-spacing:1.5px;color:#059669;text-transform:uppercase">SHALAS</div>';
  html+='<div style="width:'+(SKED_ACTIVITIES.length*SKED_COL_W)+'px;min-width:'+(SKED_ACTIVITIES.length*SKED_COL_W)+'px;display:flex;align-items:center;justify-content:center;background:#eff6ff;border-bottom:1px solid #bfdbfe;font-size:11px;font-weight:700;letter-spacing:1.5px;color:#1d4ed8;text-transform:uppercase">ADD-ON ACTIVITIES</div>';
  html+='</div>';
  // Row 2: Individual col names
  html+='<div style="display:flex;height:36px;border-bottom:2px solid #e0d8cc">';
  allCols.forEach(col=>{
    const bg=col.group==='shala'?'#f9fafb':'#f8faff';
    html+='<div style="width:'+SKED_COL_W+'px;min-width:'+SKED_COL_W+'px;background:'+bg+';display:flex;align-items:center;justify-content:center;border-right:1px solid #e0d8cc;font-size:11.5px;font-weight:700;color:#374151;text-align:center;padding:0 4px;overflow:hidden">'+col.name+'</div>';
  });
  html+='</div>';
  html+='</div>'; // end sticky header

  // Column bodies (flex row)
  html+='<div style="display:flex;flex:1">';
  allCols.forEach(col=>{
    const bg=col.group==='shala'?'#fafafa':'#f8faff';
    html+='<div style="width:'+SKED_COL_W+'px;min-width:'+SKED_COL_W+'px;position:relative;border-right:1px solid #e8e8e8;background:'+bg+'" onclick="skedClickCol(event,\''+col.id+'\',\''+dateStr+'\')">';
    // Hour lines
    for(let h=0;h<(SKED_END_H-SKED_START_H);h++){
      html+='<div style="position:absolute;top:'+(h*SKED_PX_HR)+'px;left:0;right:0;height:'+SKED_PX_HR+'px;border-bottom:1px solid #f1f5f9;box-sizing:border-box">';
      html+='<div style="position:absolute;top:50%;left:0;right:0;height:0;border-top:1px dashed #e5e7eb"></div>';
      html+='</div>';
    }
    // Spacer to set height
    html+='<div style="height:'+gridH+'px"></div>';
    // Events
    const shalaLabel=SKED_SHALAS.find(s=>s.id===col.id)?.name||'';
    colEvs[col.id].forEach(ev=>{
      if(!ev.startTime)return;
      const startMin=skedTimeToMin(ev.startTime);
      const endMin=ev.endTime?skedTimeToMin(ev.endTime):startMin+60;
      const top=(startMin-SKED_START_H*60)*(SKED_PX_HR/60);
      const height=Math.max(20,(endMin-startMin)*(SKED_PX_HR/60));
      const color=ev.color||'#2d6a6a';
      const bgColor=ev.bg||(color+'22');
      const textColor=ev.textColor||color;
      const evId=ev.isRetreat?ev.bkId:ev.id;
      html+='<div class="sked-event" style="top:'+top+'px;height:'+height+'px;background:'+bgColor+';border-left:3px solid '+color+'" onclick="event.stopPropagation();skedClickEvent(\''+ev.id+'\',\''+evId+'\','+ev.isRetreat+',\''+ev.date+'\')">';
      html+='<div style="display:flex;align-items:center;justify-content:space-between;gap:3px;overflow:hidden">';
      html+='<span style="font-size:11px;font-weight:700;color:'+textColor+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">'+escHtml(ev.title)+'</span>';
      if(shalaLabel)html+='<span style="font-size:11.5px;font-weight:800;color:'+textColor+';background:rgba(255,255,255,.55);border-radius:4px;padding:0 5px;flex-shrink:0;white-space:nowrap;letter-spacing:-.2px">'+escHtml(shalaLabel)+'</span>';
      html+='</div>';
      if(ev.subtitle)html+='<div style="font-size:10px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(ev.subtitle)+'</div>';
      html+='<div style="font-size:9.5px;color:#6b7280">'+skedFmtTime(ev.startTime)+' – '+skedFmtTime(ev.endTime)+'</div>';
      html+='</div>';
    });
    html+='</div>'; // end col
  });
  html+='</div>'; // end col bodies
  html+='</div>'; // end columns area
  html+='</div>'; // end flex row

  wrap.innerHTML=html;

  // Scroll to 6 AM
  const scroll=document.getElementById('skedScroll');
  if(scroll)scroll.scrollTop=(6-SKED_START_H)*SKED_PX_HR+HEADER_H;
  }catch(err){
    const wrap2=document.getElementById('skedWrap');
    if(wrap2)wrap2.innerHTML='<div style="padding:32px;color:#dc2626;font-size:13px">Calendar error: '+String(err)+'</div>';
    console.error('skedBuild error',err);
  }
}

// ── WEEK VIEW ──
function skedBuildWeek(weekStart,DAYS_SHORT,MONTHS_LONG){
  const dates=[];for(let i=0;i<7;i++)dates.push(addDays(weekStart,i));
  const allEvs={};
  dates.forEach(d=>{const ds=fmtISO(d);allEvs[ds]=[...skedGetRetreatEvents(ds),...schedEvents.filter(e=>e.date===ds),...(typeof skedGetBbcEvents==='function'?skedGetBbcEvents(ds):[])];});
  const allCols=[...SKED_SHALAS,...SKED_ACTIVITIES];
  const gridH=(SKED_END_H-SKED_START_H)*SKED_PX_HR;
  const DAY_COL_W=Math.max(100, Math.floor((SKED_COL_W*allCols.length)/7));
  let h='<div style="display:flex;min-width:'+(SKED_TIME_W+dates.length*DAY_COL_W)+'px">';
  // Time gutter
  h+='<div style="width:'+SKED_TIME_W+'px;min-width:'+SKED_TIME_W+'px;flex-shrink:0;position:sticky;left:0;z-index:20;background:#fff;border-right:2px solid #e0d8cc">';
  h+='<div style="height:36px;border-bottom:2px solid #e0d8cc;position:sticky;top:0;z-index:31;background:#fff"></div>';
  h+='<div style="position:relative;height:'+gridH+'px">';
  for(let i=SKED_START_H;i<=SKED_END_H;i++){const top=(i-SKED_START_H)*SKED_PX_HR;const h12=i>12?i-12:i===0?12:i;const ap=i>=12?'PM':'AM';h+='<div style="position:absolute;top:'+top+'px;right:6px;font-size:10px;color:#9ca3af;transform:translateY(-7px)">'+h12+' '+ap+'</div>';}
  h+='</div></div>';
  // Day columns
  h+='<div style="flex:1;display:flex;flex-direction:column">';
  h+='<div style="position:sticky;top:0;z-index:30;display:flex;height:36px;border-bottom:2px solid #e0d8cc;background:#fff">';
  dates.forEach(d=>{const ds=fmtISO(d);const today=fmtISO(new Date());const isToday=ds===today;h+='<div style="width:'+DAY_COL_W+'px;min-width:'+DAY_COL_W+'px;text-align:center;padding:6px 2px;border-right:1px solid #e8e8e8;font-size:11.5px;font-weight:700;color:'+(isToday?'var(--teal)':'#374151')+';background:'+(isToday?'#f0fdf4':'#fff')+'">'+DAYS_SHORT[d.getDay()]+' '+d.getDate()+'</div>';});
  h+='</div>';
  h+='<div style="display:flex">';
  dates.forEach(d=>{
    const ds=fmtISO(d);const today=fmtISO(new Date());const isToday=ds===today;
    const evs=allEvs[ds]||[];
    h+='<div style="width:'+DAY_COL_W+'px;min-width:'+DAY_COL_W+'px;position:relative;border-right:1px solid #e8e8e8;background:'+(isToday?'#f9fffe':'#fafafa')+'" onclick="skedClickCol(event,\'all\',\''+ds+'\')">';
    for(let i=0;i<(SKED_END_H-SKED_START_H);i++){h+='<div style="height:'+SKED_PX_HR+'px;border-bottom:1px solid #f1f5f9;box-sizing:border-box"><div style="height:50%;border-bottom:1px dashed #e5e7eb"></div></div>';}
    h+='<div style="height:'+gridH+'px;position:absolute;top:0;left:0;right:0">';
    // Render events for this day (all shalas/activities combined)
    evs.forEach(ev=>{
      if(!ev.startTime)return;
      const startMin=skedTimeToMin(ev.startTime);const endMin=ev.endTime?skedTimeToMin(ev.endTime):startMin+60;
      const top=(startMin-SKED_START_H*60)*(SKED_PX_HR/60);
      const height=Math.max(16,(endMin-startMin)*(SKED_PX_HR/60));
      const color=ev.color||'#2d6a6a';const bgColor=ev.bg||(color+'22');
      const evId=ev.isRetreat?ev.bkId:ev.id;
      const isShalaRes=SKED_SHALAS.some(s=>s.id===ev.resourceId);
      const rsLabel=[...SKED_SHALAS,...SKED_ACTIVITIES].find(r=>r.id===ev.resourceId)?.name||'';
      // Only room to show the shala line once the block is tall enough not to
      // clip it — short (e.g. 15-min) events still show on click via skedClickEvent.
      const shalaLine=height>=32
        ?(isShalaRes?'<div style="font-size:9px;font-weight:700;color:#0e7490;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📍 '+escHtml(rsLabel.toUpperCase())+'</div>'
          :!rsLabel?'<div style="font-size:9px;font-weight:700;color:#b45309;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">⚠ NO SHALA</div>':'')
        :'';
      h+='<div class="sked-event" style="top:'+top+'px;height:'+height+'px;background:'+bgColor+';border-left:3px solid '+color+'" onclick="event.stopPropagation();skedClickEvent(\''+ev.id+'\',\''+evId+'\','+ev.isRetreat+',\''+ev.date+'\')">';
      h+='<div style="font-size:10px;font-weight:700;color:'+color+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(ev.title)+'</div>';
      h+='<div style="font-size:9px;color:#6b7280">'+skedFmtTime(ev.startTime)+'</div>';
      h+=shalaLine;
      h+='</div>';
    });
    h+='</div></div>';
  });
  h+='</div></div></div>';
  return h;
}

// ── LIST VIEW ──
function skedBuildList(days,DAYS_LONG,MONTHS_LONG){
  const MNTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let h='<div style="padding:20px;max-width:800px">';
  let hasAny=false;
  for(let i=0;i<days;i++){
    const d=addDays(skedViewDate,i);
    const ds=fmtISO(d);
    const evs=[...skedGetRetreatEvents(ds),...schedEvents.filter(e=>e.date===ds),...(typeof skedGetBbcEvents==='function'?skedGetBbcEvents(ds):[])].sort((a,b)=>(a.startTime||'').localeCompare(b.startTime||''));
    if(!evs.length)continue;
    hasAny=true;
    const isToday=ds===fmtISO(new Date());
    h+='<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:'+(isToday?'var(--teal)':'var(--muted)')+';padding:8px 0 6px;border-bottom:2px solid '+(isToday?'var(--teal)':'var(--border)')+';margin-bottom:10px">'+DAYS_LONG[d.getDay()]+', '+MNTHS[d.getMonth()]+' '+d.getDate()+(isToday?' — Today':'')+'</div>';
    evs.forEach(ev=>{
      const color=ev.color||'#2d6a6a';const bgColor=ev.bg||(color+'22');
      const isShalaRes=SKED_SHALAS.some(s=>s.id===ev.resourceId);
      const rsLabel=[...SKED_SHALAS,...SKED_ACTIVITIES].find(r=>r.id===ev.resourceId)?.name||ev.resourceId||'';
      const evId=ev.isRetreat?ev.bkId:ev.id;
      // Shala line: bold/high-contrast, deliberately more prominent than the
      // retreat/teacher subtitle above it (was pale var(--muted) gray before
      // — easy to miss). Missing shala now surfaces as a visible warning
      // instead of silently showing nothing.
      const shalaHtml=isShalaRes
        ?'<div style="font-size:12.5px;font-weight:700;color:#0e7490;margin-top:3px;letter-spacing:.2px">📍 SHALA: '+escHtml(rsLabel.toUpperCase())+'</div>'
        :rsLabel?'<div style="font-size:11px;color:var(--muted);margin-top:2px">'+escHtml(rsLabel)+'</div>'
        :'<div style="font-size:12px;font-weight:700;color:#b45309;margin-top:3px">⚠ SHALA TO BE CONFIRMED</div>';
      h+='<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid '+color+'44;border-left:4px solid '+color+';border-radius:8px;margin-bottom:8px;background:'+bgColor+';cursor:pointer" onclick="skedClickEvent(\''+ev.id+'\',\''+evId+'\','+ev.isRetreat+',\''+ev.date+'\')">';
      h+='<div style="min-width:80px;font-size:12px;font-weight:700;color:'+color+'">'+skedFmtTime(ev.startTime)+(ev.endTime?' – '+skedFmtTime(ev.endTime):'')+'</div>';
      h+='<div style="flex:1"><div style="font-size:13px;font-weight:700;color:#1a2332">'+escHtml(ev.title)+'</div>';
      if(ev.subtitle)h+='<div style="font-size:12px;color:#374151">'+escHtml(ev.subtitle)+'</div>';
      h+=shalaHtml;
      h+='</div>';
      if(!ev.isRetreat)h+='<button onclick="event.stopPropagation();openSkedEditModal(\''+ev.id+'\')" style="font-size:10.5px;padding:3px 8px;border:1px solid var(--border);border-radius:5px;background:#fff;cursor:pointer;color:var(--muted)">Edit</button>';
      h+='</div>';
    });
    h+='</div>';
  }
  if(!hasAny)h+='<div style="text-align:center;padding:48px 20px;color:var(--muted);font-size:13px">No events in the next '+days+' days.</div>';
  h+='</div>';
  return h;
}

function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// Every event id suffix that represents a clickable, editable class box, and
// what kind of edit it needs: 'daily' (the repeating morning/evening class —
// also shown as a fallback on arrival/departure days) vs 'oneoff' (the
// dedicated Arrival Evening / Departure Morning class, which only ever exists
// on that one specific day, so there's no "whole retreat" scope to offer).
const SKED_CLASS_SUFFIX_INFO={
  morn:    {kind:'daily',   period:'morn'},
  morn_arr:{kind:'daily',   period:'morn'},
  morn_dep:{kind:'daily',   period:'morn'},
  aft:     {kind:'daily',   period:'aft'},
  arr:     {kind:'oneoff',  field:'arrivalSlot',   durField:'arrivalDur',   label:'Arrival Evening Class',   rangeStart:'12:00',rangeEnd:'21:00'},
  dep:     {kind:'oneoff',  field:'departureSlot', durField:'departureDur', label:'Departure Morning Class', rangeStart:'05:30',rangeEnd:'10:30'},
};

function skedClickEvent(evId,bkId,isRetreat,dateStr){
  if(typeof evId==='string'&&evId.indexOf('bbc_')===0){
    const schedId=evId.slice(4);
    if(typeof bbcJumpToSchedule==='function')bbcJumpToSchedule(schedId);
    return;
  }
  if(isRetreat){
    const prefix='ret_'+bkId+'_';
    const suffix=evId.indexOf(prefix)===0?evId.slice(prefix.length):'';
    if(SKED_CLASS_SUFFIX_INFO[suffix]&&dateStr){
      openSkedEditClassModal(bkId,suffix,dateStr);
      return;
    }
    openScheduleViewer(bkId);
  }
  else{openSkedEditModal(evId);}
}

// Click-to-edit modal for a teacher's class box on the master calendar — lets
// admin change the time for just one day, or the whole retreat's repeating
// schedule, without the old confirm()/prompt() dialog chain.
function openSkedEditClassModal(bkId,suffix,dateStr){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const info=SKED_CLASS_SUFFIX_INFO[suffix];if(!info)return;
  const label=bk.leaderName||bk.retreatName||'This teacher';
  document.getElementById('skedEditClassBkId').value=bkId;
  document.getElementById('skedEditClassDate').value=dateStr;
  document.getElementById('skedEditClassSuffix').value=suffix;
  document.getElementById('skedEditClassSub').textContent=label+' · '+dateStr;

  const scopeWrap=document.getElementById('skedEditClassScopeWrap');
  const resetBtn=document.getElementById('skedEditClassResetBtn');
  const skipBtn=document.getElementById('skedEditClassSkipBtn');
  const sel=document.getElementById('skedEditClassTime');
  const durSel=document.getElementById('skedEditClassDur');
  const sr=bk.scheduleRequest||{};

  if(info.kind==='oneoff'){
    document.getElementById('skedEditClassTitle').textContent=tsEffClassLabel(sr,suffix==='arr'?'arrival':'departure',info.label);
    const opts=[];
    for(let m=tsT2M(info.rangeStart);m<=tsT2M(info.rangeEnd);m+=15)opts.push(tsM2T(m));
    sel.innerHTML=opts.map(t=>`<option value="${t}">${tsFmt(t)}</option>`).join('');
    sel.value=sr[info.field]||opts[0];
    durSel.value=String(sr[info.durField]||60);
    scopeWrap.style.display='none';
    resetBtn.style.display='none';
    skipBtn.style.display='none';
  } else {
    const period=info.period;
    const isMorn=period==='morn';
    const labelKey=suffix==='morn_arr'?'arrival':suffix==='morn_dep'?'departure':isMorn?'morning':'afternoon';
    document.getElementById('skedEditClassTitle').textContent=tsEffClassLabel(sr,labelKey,(isMorn?'Morning':'Evening')+' Class');
    const already=(bk.scheduleSkips||[]).some(s=>s.date===dateStr&&s.period===period);
    const timeOvs=bk.scheduleTimeOverrides||[];
    const existingOv=timeOvs.find(o=>o.date===dateStr&&o.period===period);
    let opts;
    if(isMorn){
      opts=tsAllMorningSlots();
    } else {
      opts=[];
      for(let m=tsT2M('13:00');m<=tsT2M('21:00');m+=15)opts.push(tsM2T(m));
    }
    sel.innerHTML=opts.map(t=>`<option value="${t}">${tsFmt(t)}</option>`).join('');
    const ov=sr.adminOverride||{};
    const usualStart=isMorn?(ov.morningStart||tsUsualMorning(bk).start):(ov.afternoonStart||sr.afternoonSlot||sr.afternoonStart);
    const usualDur=isMorn?(ov.morningDur||tsUsualMorning(bk).dur):(ov.afternoonDur||sr.afternoonDur);
    sel.value=existingOv?existingOv.start:(usualStart||opts[0]);
    durSel.value=String(existingOv?.dur||usualDur||60);
    scopeWrap.style.display='';
    resetBtn.style.display=existingOv?'inline-flex':'none';
    skipBtn.style.display='inline-flex';
    skipBtn.textContent=already?'Restore this day':'Skip this day';
    skipBtn.setAttribute('data-skipped',already?'1':'0');
    document.querySelector('input[name="skedEditScope"][value="once"]').checked=true;
  }

  openModal('skedEditClassModal');
}

function skedSaveClassEdit(){
  const bkId=document.getElementById('skedEditClassBkId').value;
  const dateStr=document.getElementById('skedEditClassDate').value;
  const suffix=document.getElementById('skedEditClassSuffix').value;
  const info=SKED_CLASS_SUFFIX_INFO[suffix];
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk||!info)return;
  const newTime=document.getElementById('skedEditClassTime').value;
  const newDur=parseInt(document.getElementById('skedEditClassDur').value)||60;

  if(info.kind==='oneoff'){
    if(!bk.scheduleRequest)bk.scheduleRequest={};
    bk.scheduleRequest[info.field]=newTime;
    bk.scheduleRequest[info.durField]=newDur;
    saveAll();skedBuild();closeModal('skedEditClassModal');
    showToast('Time updated.');
    return;
  }

  const period=info.period;
  const scope=document.querySelector('input[name="skedEditScope"]:checked')?.value||'once';
  if(scope==='week'){
    if(!bk.scheduleRequest)bk.scheduleRequest={};
    if(!bk.scheduleRequest.adminOverride)bk.scheduleRequest.adminOverride={};
    if(period==='morn'){bk.scheduleRequest.adminOverride.morningStart=newTime;bk.scheduleRequest.adminOverride.morningDur=newDur;}
    else{bk.scheduleRequest.adminOverride.afternoonStart=newTime;bk.scheduleRequest.adminOverride.afternoonDur=newDur;}
    bk.scheduleTimeOverrides=(bk.scheduleTimeOverrides||[]).filter(o=>!(o.date===dateStr&&o.period===period));
    saveAll();skedBuild();closeModal('skedEditClassModal');
    showToast('Schedule updated for the whole retreat.');
    return;
  }
  // Preserve any class type/co-teacher/shala/characteristics the teacher
  // already set for this exact day — this modal only edits time/duration,
  // so it must not silently wipe out the rest of that day's override.
  const existingOv=(bk.scheduleTimeOverrides||[]).find(o=>o.date===dateStr&&o.period===period)||{};
  bk.scheduleTimeOverrides=(bk.scheduleTimeOverrides||[]).filter(o=>!(o.date===dateStr&&o.period===period));
  bk.scheduleTimeOverrides.push({...existingOv,date:dateStr,period,start:newTime,dur:newDur});
  saveAll();skedBuild();closeModal('skedEditClassModal');
  showToast('Time updated for '+dateStr+'.');
}

function skedResetOverrideFromModal(){
  const bkId=document.getElementById('skedEditClassBkId').value;
  const dateStr=document.getElementById('skedEditClassDate').value;
  const suffix=document.getElementById('skedEditClassSuffix').value;
  const period=SKED_CLASS_SUFFIX_INFO[suffix]?.period;
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk||!period)return;
  bk.scheduleTimeOverrides=(bk.scheduleTimeOverrides||[]).filter(o=>!(o.date===dateStr&&o.period===period));
  saveAll();skedBuild();closeModal('skedEditClassModal');
  showToast('Reset to usual time for '+dateStr+'.');
}

function skedSkipFromModal(){
  const bkId=document.getElementById('skedEditClassBkId').value;
  const dateStr=document.getElementById('skedEditClassDate').value;
  const suffix=document.getElementById('skedEditClassSuffix').value;
  const period=SKED_CLASS_SUFFIX_INFO[suffix]?.period;
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk||!period)return;
  const btn=document.getElementById('skedEditClassSkipBtn');
  const already=btn.getAttribute('data-skipped')==='1';
  if(already){
    bk.scheduleSkips=(bk.scheduleSkips||[]).filter(s=>!(s.date===dateStr&&s.period===period));
    saveAll();skedBuild();closeModal('skedEditClassModal');
    showToast('Class restored for '+dateStr+'.');
  } else {
    if(!bk.scheduleSkips)bk.scheduleSkips=[];
    bk.scheduleSkips.push({date:dateStr,period});
    saveAll();skedBuild();closeModal('skedEditClassModal');
    showToast('Class skipped for '+dateStr+'.');
  }
}

function skedClickCol(e,resourceId,dateStr){
  if(e.target.closest('.sked-event'))return;
  const col=e.currentTarget;
  const rect=col.getBoundingClientRect();
  const y=e.clientY-rect.top;
  const minFromTop=y/(SKED_PX_HR/60);
  const totalMin=SKED_START_H*60+minFromTop;
  const snapped=Math.round(totalMin/30)*30;
  const startMin=Math.max(SKED_START_H*60,Math.min(SKED_END_H*60-30,snapped));
  const endMin=startMin+60;
  const pad=n=>String(n).padStart(2,'0');
  const startTime=pad(Math.floor(startMin/60))+':'+pad(startMin%60);
  const endTime=pad(Math.floor(endMin/60))+':'+pad(endMin%60);
  openSkedNewModal(resourceId,dateStr,startTime,endTime);
}

let _skedSelColor='#2d6a6a';
const SKED_COLORS=['#2d6a6a','#3b82f6','#7c3aed','#d97706','#db2777'];

function openSkedNewModal(resourceId,date,startTime,endTime){
  resourceId=resourceId||'';
  date=date||fmtISO(skedViewDate);
  startTime=startTime||'';
  endTime=endTime||'';
  document.getElementById('skedEvId').value='';
  document.getElementById('skedEvTitle').value='';
  const resSel=document.getElementById('skedEvResource');
  if(resSel)resSel.value=resourceId;
  document.getElementById('skedEvDate').value=date;
  document.getElementById('skedEvStart').value=startTime;
  document.getElementById('skedEvEnd').value=endTime;
  document.getElementById('skedEvNotes').value='';
  _skedSelColor=SKED_COLORS[0];
  skedRenderColorSwatches();
  const delBtn=document.getElementById('skedEvDeleteBtn');
  if(delBtn)delBtn.style.display='none';
  document.getElementById('skedEventModalTitle').textContent='New Event';
  openModal('skedEventModal');
}

function openSkedEditModal(evId){
  const ev=schedEvents.find(e=>e.id===evId);if(!ev)return;
  document.getElementById('skedEvId').value=ev.id;
  document.getElementById('skedEvTitle').value=ev.title||'';
  const resSel=document.getElementById('skedEvResource');
  if(resSel)resSel.value=ev.resourceId||'';
  document.getElementById('skedEvDate').value=ev.date||'';
  document.getElementById('skedEvStart').value=ev.startTime||'';
  document.getElementById('skedEvEnd').value=ev.endTime||'';
  document.getElementById('skedEvNotes').value=ev.notes||'';
  _skedSelColor=ev.color||SKED_COLORS[0];
  skedRenderColorSwatches();
  const delBtn=document.getElementById('skedEvDeleteBtn');
  if(delBtn)delBtn.style.display='inline-flex';
  document.getElementById('skedEventModalTitle').textContent='Edit Event';
  openModal('skedEventModal');
}

function skedRenderColorSwatches(){
  const wrap=document.getElementById('skedColorSwatches');
  if(!wrap)return;
  wrap.innerHTML=SKED_COLORS.map(c=>'<span class="sked-color-swatch'+(c===_skedSelColor?' selected':'')+'" style="background:'+c+'" onclick="skedPickColor(\''+c+'\')"></span>').join('');
}

function skedPickColor(c){
  _skedSelColor=c;
  skedRenderColorSwatches();
}

function skedSaveEvent(){
  const id=document.getElementById('skedEvId').value;
  const title=document.getElementById('skedEvTitle').value.trim();
  const resourceId=document.getElementById('skedEvResource').value;
  const date=document.getElementById('skedEvDate').value;
  const startTime=document.getElementById('skedEvStart').value;
  const endTime=document.getElementById('skedEvEnd').value;
  const notes=document.getElementById('skedEvNotes').value.trim();
  if(!title){showToast('Please enter a title.');return;}
  if(!date){showToast('Please select a date.');return;}
  if(id){
    const ev=schedEvents.find(e=>e.id===id);
    if(ev){Object.assign(ev,{title,resourceId,date,startTime,endTime,notes,color:_skedSelColor});}
  }else{
    schedEvents.push({id:uid(),title,resourceId,date,startTime,endTime,notes,color:_skedSelColor});
  }
  skedSaveEvents();
  closeModal('skedEventModal');
  skedBuild();
}

function skedDeleteEvent(){
  const id=document.getElementById('skedEvId').value;
  if(!id)return;
  schedEvents=schedEvents.filter(e=>e.id!==id);
  skedSaveEvents();
  closeModal('skedEventModal');
  skedBuild();
}

// ── DAILY ROOM REPORT ────────────────────────────────────────────────────────
function openDailyReport(){
  if(!regSelBk)return;
  const bk=regSelBk;
  const nights=getNights(bk);
  const bkRegs=AppData.regs.filter(r=>r.bookingId===bk.id);
  const DAY_NAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let html='';
  for(let i=0;i<nights;i++){
    const d=new Date(pd(bk.startDate).getTime()+i*DAY_MS);
    const dayLabel=DAY_NAMES[d.getDay()]+', '+MON[d.getMonth()]+' '+d.getDate();
    const occupied=bkRegs.filter(r=>(r.guests||[]).some(g=>g.name));
    html+=`<div style="margin-bottom:18px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--teal);padding:8px 0 6px;border-bottom:2px solid var(--border);margin-bottom:8px">${dayLabel}</div>
      ${occupied.length?`<table style="width:100%;border-collapse:collapse">
        <tr style="background:var(--sand)"><th style="text-align:left;padding:5px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Room</th><th style="text-align:left;padding:5px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Guests</th><th style="text-align:left;padding:5px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Type</th><th style="text-align:right;padding:5px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Rate/Night</th><th style="text-align:left;padding:5px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Upgrade Potential</th><th style="text-align:left;padding:5px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Upgrade Group</th></tr>
        ${occupied.map(r=>{
          const rt=AppData.roomTypes.find(t=>t.id===r.roomTypeId);
          const gNames=(r.guests||[]).filter(g=>g.name).map(g=>g.name+(r.isTeacherRoom?' (Teacher)':'')).join(', ');
          const rate=rt?`$${rt.price1}`:r.customPrice?`$${r.customPrice/nights}`:'—';
          const upg=(typeof trGetUpgrade==='function')?trGetUpgrade(bk.id,r.room):null;
          const upgCell=upg
            ?`<span style="font-weight:700;color:#15803d">→ ${upg.toName}</span> <span style="color:var(--muted)">+$${upg.upgradeNightly}/night${upg.isSolo?'':' pp'} · ${upg.availableCount} avail.</span>`
            :`<span style="color:#c0b8b0">—</span>`;
          return`<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:6px 10px;font-size:13px;font-weight:700">${r.room}</td>
            <td style="padding:6px 10px;font-size:13px">${gNames}</td>
            <td style="padding:6px 10px;font-size:12.5px;color:var(--muted)">${rt?.name||'—'}</td>
            <td style="padding:6px 10px;font-size:12.5px;text-align:right">${rate}</td>
            <td style="padding:6px 10px;font-size:12px;white-space:nowrap">${upgCell}</td>
            <td style="padding:6px 10px"><input type="text" value="${escHtml(r.upgradeGroupNote||'')}" placeholder="e.g. group with GV5, GV10" style="width:100%;box-sizing:border-box;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-family:'Jost',sans-serif;font-size:12px;background:var(--sand)" onchange="drSaveUpgradeGroup('${r.id}',this.value)"></td>
          </tr>`;
        }).join('')}
      </table>`:`<div style="font-size:12.5px;color:var(--muted);font-style:italic;padding:4px 0">No guests registered yet</div>`}
    </div>`;
  }
  document.getElementById('drSub').textContent=`${bk.leaderName||bk.retreatName} · ${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}`;
  document.getElementById('drContent').innerHTML=html;
  openModal('dailyReportModal');
}

function drSaveUpgradeGroup(regId,val){
  const r=AppData.regs.find(x=>x.id===regId);if(!r)return;
  r.upgradeGroupNote=val.trim();
  r.updatedAt=new Date().toISOString();
  saveAll();
  showToast('Saved.');
}

// ===== ACTIONS ▾ MENU — features ported from Staging (js/modules/teachers.js) =====

// ── Real Rooms — what the teacher actually sees vs. the real room numbers ──
function openRealRoomsPanel(){
  if(!regSelBk)return;
  const bk=regSelBk;
  const blocked=bk.blockedRooms||[];
  const hideRooms=bk.packageCustomPrices?.__cfg__?.hideRoomNumbers??true;
  const cards=blocked.length?blocked.map(room=>{
    const rt=AppData.roomTypes.find(t=>(t.rooms||[]).includes(room));
    const reg=getRegForRoom(bk.id,room);
    const guestNames=(reg?.guests||[]).filter(g=>g.name).map(g=>g.name).join(' & ');
    const used=!!guestNames;
    return`<div style="padding:8px 12px;border-radius:8px;background:${used?'#f0fdf4':'#fff'};border:1.5px solid ${used?'#86efac':'var(--border)'};min-width:130px">
      <div style="font-size:12.5px;font-weight:700;color:var(--dark)">${escHtml(room)}</div>
      <div style="font-size:11px;color:var(--muted)">${rt?escHtml(rt.name):''}</div>
      ${hideRooms?`<div style="font-size:10px;color:#0e9494;font-weight:600;margin-top:2px">Teacher sees: Room</div>`:''}
      <div style="font-size:11px;font-weight:600;margin-top:3px;color:${used?'#16a34a':'#9ca3af'}">${used?'✓ '+escHtml(guestNames):'Available'}</div>
    </div>`;
  }).join(''):'<div style="color:var(--muted);font-size:13px">No rooms blocked yet</div>';
  const stateBadge=hideRooms
    ?`<span style="background:#0e5a5a;color:#fff;font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:10px;margin-left:8px">Room numbers hidden from teacher</span>`
    :`<span style="background:#f0fdf4;color:#15803d;font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:10px;margin-left:8px;border:1px solid #86efac">Room numbers visible to teacher</span>`;
  document.getElementById('realRoomsSub').textContent=`${bk.leaderName||bk.retreatName} · ${blocked.length} rooms`;
  document.getElementById('realRoomsBody').innerHTML=`<div style="display:flex;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:6px">
    <span style="font-size:13px;font-weight:700;color:var(--dark)">Real Rooms (${blocked.length})</span>
    ${stateBadge}
    <button class="btn btn-secondary" style="margin-left:auto;font-size:12px;padding:6px 12px" onclick="toggleHideRoomNumbers()">${hideRooms?'👁 Show Real Numbers to Teacher':'🙈 Hide Real Numbers from Teacher'}</button>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:8px">${cards}</div>`;
  openModal('realRoomsModal');
}
// hideRoomNumbers lives in packageCustomPrices.__cfg__ (matches staging exactly) — read
// by regRender()'s three room-number cells (numTd) below so IS_TEACHER_MODE actually
// respects this per-retreat setting instead of always showing "Room N".
async function toggleHideRoomNumbers(){
  if(!regSelBk)return;
  const pcp=regSelBk.packageCustomPrices||{};
  const cfg=pcp.__cfg__||{};
  const newVal=!(cfg.hideRoomNumbers??true);
  regSelBk.packageCustomPrices={...pcp,__cfg__:{...cfg,hideRoomNumbers:newVal}};
  saveAll();regRender();
  try{await db.from('bookings').update({package_custom_prices:regSelBk.packageCustomPrices}).eq('id',regSelBk.id);}catch(e){}
  showToast(newVal?'Room numbers hidden from teacher ✓':'Room numbers visible to teacher ✓');
  if(document.getElementById('realRoomsModal')?.classList.contains('open'))openRealRoomsPanel();
}

// ── Package Rates — read-only reference table of the ADD_ONS catalog ──
function openPkgRatesPanel(){
  const rows=ADD_ONS.map(ao=>`<tr style="border-top:1px solid var(--border)">
    <td style="padding:6px 10px;font-size:12.5px;font-weight:600;color:var(--dark)">${escHtml(ao.name)}</td>
    <td style="padding:6px 10px;font-size:11.5px;color:var(--muted)">${ao.desc?escHtml(ao.desc):'—'}</td>
    <td style="padding:6px 10px;text-align:right;font-size:12.5px;font-weight:700;color:var(--teal)">${ao.price!=null?fmt$(ao.price):'—'}</td>
  </tr>`).join('');
  document.getElementById('pkgRatesBody').innerHTML=`<table style="border-collapse:collapse;width:100%">
    <thead><tr style="background:var(--sand)">
      <th style="padding:6px 10px;text-align:left;font-size:10.5px;color:var(--muted);text-transform:uppercase">Package</th>
      <th style="padding:6px 10px;text-align:left;font-size:10.5px;color:var(--muted);text-transform:uppercase">Description</th>
      <th style="padding:6px 10px;text-align:right;font-size:10.5px;color:var(--muted);text-transform:uppercase">Price/person</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  openModal('pkgRatesModal');
}

// ── Teacher Pays Arrival/Departure Transport — flag toggle ──
async function toggleTransportPay(direction){
  if(!regSelBk)return;
  const flagKey='teacher_pays_'+direction+'_transport';
  const flags=regSelBk.flags||[];
  const newFlags=flags.includes(flagKey)?flags.filter(f=>f!==flagKey):[...flags,flagKey];
  regSelBk.flags=newFlags;
  saveAll();regRender();
  try{await db.from('bookings').update({flags:newFlags}).eq('id',regSelBk.id);}catch(e){}
  const on=newFlags.includes(flagKey);
  showToast(`Teacher Pays ${direction==='arrival'?'Arrival':'Departure'} Transport ${on?'ON ✓':'OFF'}`);
}

// ── Bot Activity Log — reads the shared bot_log table (written by the WhatsApp bot) ──
async function openBotLogModal(){
  if(!regSelBk)return;
  document.getElementById('botLogSub').textContent=regSelBk.leaderName||regSelBk.retreatName||'';
  document.getElementById('botLogBody').innerHTML=`<div style="text-align:center;color:var(--muted);font-size:13px;padding:40px">Loading...</div>`;
  openModal('botLogModal');
  try{
    const{data,error}=await db.from('bot_log').select('*').eq('booking_id',regSelBk.id).order('created_at',{ascending:false}).limit(100);
    const body=document.getElementById('botLogBody');
    if(error||!data||!data.length){body.innerHTML='<div style="text-align:center;color:var(--muted);font-size:13px;padding:40px">No bot activity yet for this retreat.</div>';return;}
    const fmtTime=ts=>new Date(ts).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const TOOL_LABELS={
      add_room_by_type:{icon:'➕',label:'Room Added',color:'#dcfce7',border:'#86efac',text:'#15803d'},
      remove_room_by_type:{icon:'➖',label:'Room Removed',color:'#fee2e2',border:'#fca5a5',text:'#b91c1c'},
      get_available_room_types:{icon:'🔍',label:'Checked Availability',color:'#f0f9ff',border:'#bae6fd',text:'#0369a1'},
      get_my_room_types:{icon:'🏠',label:'Viewed Rooms',color:'#f8fafc',border:'#e2e8f0',text:'#475569'},
      get_pricing_info:{icon:'💰',label:'Viewed Pricing',color:'#fefce8',border:'#fde68a',text:'#92400e'},
      get_estimated_quote:{icon:'📊',label:'Viewed Quote',color:'#fefce8',border:'#fde68a',text:'#92400e'},
      get_rooming_list:{icon:'👥',label:'Viewed Rooming',color:'#f8fafc',border:'#e2e8f0',text:'#475569'},
      get_retreat_info:{icon:'ℹ️',label:'Viewed Info',color:'#f8fafc',border:'#e2e8f0',text:'#475569'},
    };
    body.innerHTML=data.map(log=>{
      const t=TOOL_LABELS[log.tool_name]||{icon:'⚙️',label:log.tool_name,color:'#f8fafc',border:'#e2e8f0',text:'#374151'};
      const result=log.tool_result||{};
      const detail=result.type_added?`Type: ${result.type_added}`:result.type_removed?`Type: ${result.type_removed}`:result.success===false?`Not done: ${result.reason||''}`:'';
      return`<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);align-items:flex-start">
        <div style="flex-shrink:0;margin-top:2px"><span style="background:${t.color};border:1px solid ${t.border};color:${t.text};font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;white-space:nowrap">${t.icon} ${t.label}</span></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:var(--dark);font-style:italic;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(log.user_message||'')}">"${escHtml((log.user_message||'').slice(0,80))}${(log.user_message||'').length>80?'…':''}"</div>
          ${detail?`<div style="font-size:11px;color:${t.text};font-weight:600">${escHtml(detail)}</div>`:''}
        </div>
        <div style="font-size:10px;color:var(--muted);white-space:nowrap;flex-shrink:0">${fmtTime(log.created_at)}</div>
      </div>`;
    }).join('');
  }catch(e){document.getElementById('botLogBody').innerHTML=`<div style="color:#dc2626;font-size:13px;padding:20px">Error loading log: ${escHtml(String(e))}</div>`;}
}

// ── Send Deposit Info — wire/Zelle/Venmo instructions email (ported from Staging) ──
async function sendDepositEmail(){
  if(!regSelBk)return;
  const bk=regSelBk;
  if(!bk.leaderEmail){showToast('No email on file for this retreat leader');return;}
  if(!confirm(`Send deposit instructions to ${bk.leaderEmail}?\n\nThis will send wire transfer and payment details for the $2,500 deposit.`))return;
  const dueDate=(()=>{const d=new Date();d.setDate(d.getDate()+7);return d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});})();
  const ref=`${bk.leaderName||'Retreat'} - ${bk.startDate?fmtDate(bk.startDate):''}`;
  const fmtRange=`${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}`;
  const retreat=bk.retreatName||bk.leaderName||'Retreat';
  const depositHtml=`<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><table style="max-width:580px;margin:20px auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)" cellpadding="0" cellspacing="0" width="100%"><tr><td style="background:#1a2332;padding:22px 32px"><span style="color:#4db6ac;font-size:22px;font-weight:700;letter-spacing:3px">AMANSALA</span></td></tr><tr><td style="background:#ffffff;padding:32px;color:#374151;font-size:14px;line-height:1.7"><p>Hi ${bk.leaderName},</p><p>Thank you for signing your retreat contract! To confirm your dates, please submit your <strong>$2,500 deposit by ${dueDate}</strong>.</p><p style="font-size:13px;color:#6b7280">If the deposit is not received within 7 days of signing, Amansala reserves the right to release your dates.</p><table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:13px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><tr style="background:#1a2332"><td colspan="2" style="padding:10px 14px;color:#4db6ac;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.8px">Wire Transfer — Wells Fargo</td></tr><tr style="background:#fff"><td style="padding:9px 14px;color:#9ca3af;width:45%">Bank Name</td><td style="padding:9px 14px;font-weight:600;color:#111827">Wells Fargo</td></tr><tr style="background:#f8fafc"><td style="padding:9px 14px;color:#9ca3af">Account Name</td><td style="padding:9px 14px;font-weight:600;color:#111827">Amansala LLC</td></tr><tr style="background:#fff"><td style="padding:9px 14px;color:#9ca3af">Account Number</td><td style="padding:9px 14px;font-weight:600;color:#111827">1639211174</td></tr><tr style="background:#f8fafc"><td style="padding:9px 14px;color:#9ca3af">Routing (RTN/ABA)</td><td style="padding:9px 14px;font-weight:600;color:#111827">121000248</td></tr><tr style="background:#fff"><td style="padding:9px 14px;color:#9ca3af">SWIFT/BIC</td><td style="padding:9px 14px;font-weight:600;color:#111827">WFBIUS6S</td></tr><tr style="background:#f8fafc"><td style="padding:9px 14px;color:#9ca3af">Account Address</td><td style="padding:9px 14px;font-weight:600;color:#111827">22219 N 39th Street, Phoenix AZ 85050, USA</td></tr><tr style="background:#fff"><td style="padding:9px 14px;color:#9ca3af">Bank Address</td><td style="padding:9px 14px;font-weight:600;color:#111827">21040 N Tatum Blvd, Phoenix AZ 85050, United States</td></tr><tr style="background:#f8fafc"><td style="padding:9px 14px;color:#9ca3af">Reference</td><td style="padding:9px 14px;font-weight:700;color:#2d6a6a">${ref}<br><span style="font-weight:400;color:#6b7280;font-size:12px">Please include retreat leader name and arrival date</span></td></tr></table><table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><tr style="background:#1a2332"><td colspan="2" style="padding:10px 14px;color:#4db6ac;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.8px">Other Payment Options</td></tr><tr style="background:#fff"><td style="padding:9px 14px;color:#9ca3af;width:45%">Zelle</td><td style="padding:9px 14px;font-weight:600;color:#111827">payments@amansala.com</td></tr><tr style="background:#f8fafc"><td style="padding:9px 14px;color:#9ca3af">Venmo</td><td style="padding:9px 14px;font-weight:600;color:#111827">@amansala</td></tr></table><p style="font-size:13px;color:#6b7280;background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:12px 16px">⚠️ <strong>All payments must be made via bank wire or bank transfer. Credit cards are not accepted.</strong><br>Please email <a href="mailto:retreats@amansala.com" style="color:#2d6a6a">retreats@amansala.com</a> with your confirmation once payment is sent.</p><table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:13px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><tr style="background:#fff"><td style="padding:10px 14px;color:#9ca3af;width:40%">Retreat</td><td style="padding:10px 14px;font-weight:600;color:#111827">${retreat}</td></tr><tr style="background:#f8fafc"><td style="padding:10px 14px;color:#9ca3af">Dates</td><td style="padding:10px 14px;font-weight:600;color:#111827">${fmtRange}</td></tr><tr style="background:#fff"><td style="padding:10px 14px;color:#9ca3af">Deposit Due</td><td style="padding:10px 14px;font-weight:700;color:#dc2626">${dueDate}</td></tr></table><p>We can't wait to welcome you to Amansala! 🌴</p></td></tr><tr><td style="background:#f1f5f9;padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af">Amansala Bikini Boot Camp &amp; Retreat Center &nbsp;·&nbsp; Tulum, Mexico</td></tr></table></td></tr></table></body></html>`;
  try{
    await _sendEmail(bk.leaderEmail.split(',').map(e=>e.trim()).filter(Boolean),`Deposit Instructions — ${retreat} · ${fmtRange}`,depositHtml,'retreats@amansala.com');
  }catch(e){showToast('Email failed: '+e.message);return;}
  showToast('Deposit instructions sent to '+bk.leaderEmail+' ✓');
  logActivity('email_sent',`Deposit instructions → ${bk.leaderName} (${bk.leaderEmail})`,bk.id);
}

// ── Sync blocked_rooms from registrations — repairs drift where a registration's
// room isn't reflected in the booking's blocked_rooms list (the exact "orphaned
// registration" pattern behind several balance-mismatch bugs fixed this session) ──
// ── Tax rate quick-select (compact info bar) — writes to the same real,
// synced location getBkTaxRate()/calcPkgCost() already read (packageCustomPrices
// .__cfg__.taxRate), same fix as savePkgCustomPrices() above ──
async function regSetTaxRate(val){
  if(!regSelBk)return;
  const tr=parseFloat(val);
  if(isNaN(tr))return;
  regSelBk.taxRate=tr;
  if(!regSelBk.packageCustomPrices)regSelBk.packageCustomPrices={};
  regSelBk.packageCustomPrices.__cfg__={...(regSelBk.packageCustomPrices.__cfg__||{}),taxRate:tr};
  saveAll();regRender();
  try{await db.from('bookings').update({package_custom_prices:regSelBk.packageCustomPrices}).eq('id',regSelBk.id);}catch(e){}
  showToast(`Tax rate ${Math.round(tr*100)}% saved ✓`);
}

// ── Booking Activity Log — read-only viewer over the real activity_log table ──
const ACTIVITY_LOG_LABELS={
  booking_create:{icon:'✦',label:'Booking created',color:'#16a34a'},
  booking_cancel:{icon:'✕',label:'Booking cancelled',color:'#dc2626'},
  guest_create:{icon:'+',label:'Guest added',color:'#0369a1'},
  guest_update:{icon:'✎',label:'Guest edited',color:'#0369a1'},
  guest_delete:{icon:'−',label:'Guest removed',color:'#b91c1c'},
  payment_add:{icon:'$',label:'Payment recorded',color:'#16a34a'},
  payment_delete:{icon:'$',label:'Payment deleted',color:'#b91c1c'},
  room_move:{icon:'🛏',label:'Room moved',color:'#7c3aed'},
  room_block:{icon:'🛏',label:'Room blocked',color:'#7c3aed'},
  room_unblock:{icon:'🛏',label:'Room unblocked',color:'#9ca3af'},
  lock_toggle:{icon:'🔒',label:'Lock changed',color:'#d97706'},
  email_sent:{icon:'✉',label:'Email sent',color:'#0891b2'},
  cb_push:{icon:'☁',label:'Pushed to Cloudbeds',color:'#6366f1'},
  cb_recover:{icon:'☁',label:'CB IDs recovered',color:'#6366f1'},
};
async function showBookingLogModal(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  document.getElementById('bookingLogSub').textContent=bk.leaderName||bk.retreatName||'';
  document.getElementById('bookingLogBody').innerHTML=`<div style="text-align:center;color:var(--muted);font-size:13px;padding:40px">Loading...</div>`;
  openModal('bookingLogModal');
  try{
    const{data,error}=await db.from('activity_log').select('*').eq('booking_id',bkId).order('created_at',{ascending:false}).limit(200);
    const body=document.getElementById('bookingLogBody');
    if(error||!data||!data.length){body.innerHTML='<div style="text-align:center;color:var(--muted);font-size:13px;padding:40px">No activity logged yet for this retreat.</div>';return;}
    body.innerHTML=data.map(l=>{
      const meta=ACTIVITY_LOG_LABELS[l.action]||{icon:'•',label:l.action,color:'#374151'};
      return`<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);align-items:flex-start">
        <div style="flex-shrink:0;margin-top:2px"><span style="color:${meta.color};font-weight:700;font-size:13px">${meta.icon} ${meta.label}</span></div>
        <div style="flex:1;min-width:0">
          ${l.detail?`<div style="font-size:12.5px;color:var(--dark)">${escHtml(l.detail)}</div>`:''}
          <div style="font-size:11px;color:var(--muted)">${escHtml(l.user_name||'—')}${l.user_role?` · ${escHtml(l.user_role)}`:''}</div>
        </div>
        <div style="font-size:10px;color:var(--muted);white-space:nowrap;flex-shrink:0">${new Date(l.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
      </div>`;
    }).join('');
  }catch(e){document.getElementById('bookingLogBody').innerHTML=`<div style="color:#dc2626;font-size:13px;padding:20px">Error loading log: ${escHtml(String(e))}</div>`;}
}

async function syncBlockedRoomsFromRegs(){
  if(!regSelBk)return;
  const regRooms=[...new Set(AppData.regs.filter(r=>r.bookingId===regSelBk.id&&r.room).map(r=>r.room))];
  if(!regRooms.length){showToast('No rooms assigned in registrations yet');return;}
  const existing=new Set(regSelBk.blockedRooms||[]);
  const added=regRooms.filter(r=>!existing.has(r));
  if(!added.length){showToast('blocked_rooms already in sync ✓');return;}
  const newBlocked=[...existing,...added];
  regSelBk.blockedRooms=newBlocked;
  saveAll();regRender();
  try{await db.from('bookings').update({blocked_rooms:newBlocked}).eq('id',regSelBk.id);}catch(e){}
  showToast(`Rooms synced: ${added.join(', ')} added to blocked_rooms ✓`);
}

