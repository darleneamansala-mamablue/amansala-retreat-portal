// ===== retreat-builder.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== RETREAT BUILDER =====
const ADD_ONS_DEFAULT=[
  {id:'ao1', name:'Tulum Ruins',                    desc:'Archaeological tour of ancient Maya ruins',                  price:95},
  {id:'ao6', name:'Grande Cenote',                   desc:'Snorkeling and swimming in a stunning cenote',               price:95},
  {id:'ao7', name:'Mangroves',                       desc:'Scenic boat tour through the mangrove jungle',               price:95},
  {id:'ao2', name:'Muyil Float Tour',                desc:'Lazy river float through ancient Maya canals',               price:145},
  {id:'ao3', name:'Atik Cenote',                     desc:'Sacred cenote experience with an art walk',                  price:130},
  {id:'ao4', name:'Sound Healing & Cacao Ceremony',  desc:'Traditional heart-opening ceremony with live sound healing', price:65},
  {id:'ao5', name:'Temazcal',                        desc:'Traditional Maya sweat lodge ceremony',                      price:95},
  {id:'ao9', name:'Mayan Clay Ceremony',             desc:'Natural clay body treatment on the beach',                   price:65},
  {id:'ao10',name:'Ice Bath & Breathwork',           desc:'Cold plunge ice bath with guided breathwork session',        price:45},
  {id:'ao8', name:'Massage (60 min)',                desc:'Relaxation or deep tissue massage',                         price:95},
  {id:'ao11',name:'Offsite Dinner Onsite',           desc:'Onsite dinner option on the offsite dinner evening',         price:40},
  {id:'ao12',name:'Group Salsa Class',               desc:'Included group salsa dance class',                          price:0},
  {id:'ao13',name:'Gitano Dinner',                   desc:'Offsite dinner at Gitano Tulum — $75 dinner + 15% gratuity + $15 transport per person (16% IVA applies)',price:101.25},
  {id:'ao14',name:'Cooking Class',                   desc:'Included hands-on cooking demonstration — complimentary for all guests',price:0},
];
// Merge stored package customizations (edited prices + custom packages) over defaults
function loadAddOns(){
  const stored=JSON.parse(localStorage.getItem('amansala_addons')||'null');
  if(!stored)return ADD_ONS_DEFAULT.map(a=>({...a}));
  // Start from defaults, apply stored edits, then append any custom entries
  const merged=ADD_ONS_DEFAULT.map(def=>{
    const edit=stored.find(s=>s.id===def.id);
    return edit?{...def,...edit}:{...def};
  });
  stored.filter(s=>!ADD_ONS_DEFAULT.find(d=>d.id===s.id)).forEach(c=>merged.push({...c}));
  return merged;
}
let ADD_ONS=loadAddOns();
const PKG_DISCOUNT=0.10;
// add_ons: read from the real SQL table (same one the new app manages) instead of the
// legacy app_store blob — ADD_ONS_DEFAULT (above) stays only as an offline/fetch-failure
// fallback. Confirmed real drift: Atik Cenote was $130 here vs $95 in the live table.
const _ADDON_COL_TO_FIELD={description:'desc'};
const _ADDON_FIELD_TO_COL={desc:'description'};
const _ADDON_COLUMNS=['id','name','description','price','regular_price','category','duration','is_custom'];
function sqlAddOnToApp(row){const a={};for(const col in row) a[_ADDON_COL_TO_FIELD[col]||_s2c(col)]=row[col];return a;}
function appAddOnToSqlRow(a){const row={};_ADDON_COLUMNS.forEach(col=>{const field=_ADDON_COL_TO_FIELD[col]||_s2c(col);row[col]=a[field]!==undefined?a[field]:null;});return row;}
async function syncAddOnsFromSupabase(){
  try{
    const {data,error}=await db.from('add_ons').select('*');
    if(error||!data||!data.length)return;
    ADD_ONS=data.map(sqlAddOnToApp);
    localStorage.setItem('amansala_addons',JSON.stringify(ADD_ONS));
    if(typeof regRender==='function')regRender();
  }catch(e){console.warn('[retreat-builder] addOns SQL sync failed',e);}
}
async function saveAddOnsToSupabase(saved){
  try{
    const rows=(saved||ADD_ONS).map(appAddOnToSqlRow);
    if(rows.length)await db.from('add_ons').upsert(rows);
  }catch(e){console.warn('[retreat-builder] addOns SQL save failed',e);}
}
syncAddOnsFromSupabase(); // pull any saved custom package rates on load -- without this call the sync/save functions above were dead code

// Room preset: base mix for 15 guests (12 rooms), scale +2 rooms per additional 5 guests
function getBldPreset(pax){
  // Fixed presets: 10, 15, 20, 25, 30
  // 10-person: handled separately (Casa Shanti) — return minimal tiers as fallback
  // 15-person base:
  //   1 Beachfront King (rt1)     = 1 bed
  //   1 Beachview Double (rt6)    = 2 beds
  //   1 Superior King (rt2)       = 1 bed
  //   1 Garden Plus King (rt3)    = 1 bed
  //   3 Garden King (rt4)         = 3 beds
  //   2 Double Room (rt7)         = 4 beds
  //   1 Triple (rt8)              = 3 beds
  //   Total = 15 guest beds
  //   + 1 Garden Basic (rt5) for teacher (added separately, not counted here)
  // Each +5 increment adds: +1 rt1, +1 rt4, +1 rt5 (guest), +1 rt7 = 5 beds
  const increments=Math.max(0,Math.round((Math.max(pax,15)-15)/5));
  const tiers=[
    {id:'rt1',n:1+increments},
    {id:'rt6',n:1},
    {id:'rt2',n:1},
    {id:'rt3',n:1},
    {id:'rt4',n:3+increments},
    {id:'rt7',n:2+increments},
    {id:'rt8',n:1},
    {id:'rt5',n:increments}, // guest Garden Basics from increments (teacher's is added separately)
  ];
  return{tiers:tiers.filter(t=>t.n>0),scaling:increments,increments};
}
const BLD_PRESETS=[
  {maxPax:15, tiers:getBldPreset(15).tiers},
  {maxPax:20, tiers:getBldPreset(20).tiers},
  {maxPax:25, tiers:getBldPreset(25).tiers},
  {maxPax:30, tiers:getBldPreset(30).tiers},
  {maxPax:999,tiers:getBldPreset(35).tiers},
];

let builds=[], bldSelId=null, bldPaxN=10, bldCurBkId=null;

function loadBuilds(){builds=JSON.parse(localStorage.getItem('amansala_builds')||'[]');}
function saveBuilds(){localStorage.setItem('amansala_builds',JSON.stringify(builds));}

// Step navigation
function bldStep(n){
  [1,2,3].forEach(i=>{
    const s=document.getElementById('bld-step'+i);
    if(s)s.style.display=i===n?'flex':'none';
    const sb=document.getElementById('sbar'+i);
    if(sb){sb.classList.toggle('active',i===n);sb.classList.toggle('done',i<n);}
    const sl=document.getElementById('sline'+i);
    if(sl)sl.classList.toggle('done',i<n);
  });
}

function recoverTeacherRooms(){
  // Auto-assign teacher room for any booking at room_list_sent/confirmed that's missing one
  let changed=false;
  AppData.bookings.forEach(bk=>{
    if(!['room_list_sent','confirmed'].includes(bk.status))return;
    const hasTeacherRoom=AppData.regs.some(r=>r.bookingId===bk.id&&r.isTeacherRoom&&r.room);
    if(!hasTeacherRoom){autoAssignTeacherRoom(bk);changed=true;}
  });
  if(changed)saveAll();
}

function recoverBuildBookings(){
  let recovered=false;
  builds.forEach(b=>{
    if(b.bkId&&b.startDate&&b.endDate&&!AppData.bookings.find(bk=>bk.id===b.bkId)&&!deletedBookingIds.has(b.bkId)){
      AppData.bookings.push({id:b.bkId,row:b.venRow||AppData.venRows[0]||'RETREAT 1',leaderName:b.leaderName,retreatName:b.retreatName,startDate:b.startDate,endDate:b.endDate,pax:b.estPax||10,status:'requested',notes:b.notes||'',roomAssignments:[],blockedRooms:[]});
      recovered=true;
    }
  });
  if(recovered)saveAll();
  return recovered;
}

function bldListRender(){
  const el=document.getElementById('bldList');if(!el)return;
  el.innerHTML='';
  recoverBuildBookings();
  // Merge builds + any bookings not yet linked to a build
  const linkedBkIds=new Set(builds.map(b=>b.bkId).filter(Boolean));
  const unlinked=AppData.bookings.filter(bk=>!linkedBkIds.has(bk.id)&&bk.status!=='cancelled')
    .map(bk=>({_fromBooking:true,id:null,bkId:bk.id,leaderName:bk.leaderName,retreatName:bk.retreatName,startDate:bk.startDate,estPax:bk.pax,venRow:bk.row,notes:bk.notes||''}));
  const allItems=[...builds,...unlinked];
  if(allItems.length===0){el.innerHTML='<div style="padding:14px 22px;font-size:12.5px;color:var(--muted);font-style:italic">No saved retreats yet.</div>';return;}
  const STATUS_DOT={requested:'#f59e0b',contract_sent:'#3b82f6',contract_signed:'#8b5cf6',deposit_paid:'#10b981',room_list_sent:'#2d6a6a',confirmed:'#059669',cancelled:'#ef4444'};
  const STATUS_LBL={requested:'Soft Hold',contract_sent:'Contract Sent',contract_signed:'Signed',deposit_paid:'Deposit Paid',room_list_sent:'Rooms Built',confirmed:'Confirmed',cancelled:'Cancelled'};
  allItems.forEach(b=>{
    const div=document.createElement('div');
    div.className='builder-save-item'+(b.id===bldSelId?' active':'');
    const bk=AppData.bookings.find(bk=>bk.id===b.bkId);
    const st=bk?bk.status:null;
    const statusBadge=st?`<span style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:${STATUS_DOT[st]||'#888'};background:${STATUS_DOT[st]||'#888'}1a;padding:1px 6px;border-radius:20px;white-space:nowrap">${STATUS_LBL[st]||st}</span>`:'';
    const venueBadge=b._fromBooking?`<span style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#0891b2;background:#e0f2fe;padding:1px 5px;border-radius:4px;margin-left:4px">venue</span>`:'';
    div.innerHTML=`<div style="flex:1"><div class="bsi-name" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">${b.leaderName||b.retreatName||'Untitled'}${venueBadge}</div><div class="bsi-meta" style="margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">${statusBadge}<span>${b.startDate?fmtDate(b.startDate):''}</span></div></div>`;
    div.onclick=()=>b._fromBooking?bldLoadFromBooking(b.bkId):bldLoad(b.id);
    el.appendChild(div);
  });
}

function bldLoadFromBooking(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  bldSelId=null;bldPaxN=bk.pax||10;bldCurBkId=bkId;
  document.getElementById('bld-leader').value=bk.leaderName||'';
  document.getElementById('bld-leader-email').value=bk.leaderEmail||'';
  document.getElementById('bld-name').value=bk.retreatName||'';
  document.getElementById('bld-start').value=bk.startDate||'';
  document.getElementById('bld-end').value=bk.endDate||'';
  document.getElementById('bld-pax').value=bldPaxN;
  document.getElementById('bld-pax-val').textContent=bldPaxN;
  document.getElementById('bld-notes').value=bk.notes||'';
  document.getElementById('bldDelBtn').style.display='inline-flex';
  bldFillRowSel();
  if(bk.row){const s=document.getElementById('bld-row');if(s)s.value=bk.row;}
  bldAddonRender([]);bldCalc([]);bldListRender();bldRenderStatusPanel();bldStep(1);
}

function bldFillRowSel(){
  const sel=document.getElementById('bld-row');if(!sel)return;
  const cur=sel.value;sel.innerHTML='';
  AppData.venRows.forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent=r;sel.appendChild(o);});
  if(cur)sel.value=cur;
}

function bldLoad(id){
  const b=builds.find(x=>x.id===id);if(!b)return;
  bldSelId=id;bldPaxN=b.estPax||10;bldCurBkId=b.bkId||null;
  document.getElementById('bld-leader').value=b.leaderName||'';
  document.getElementById('bld-leader-email').value=b.leaderEmail||'';
  document.getElementById('bld-name').value=b.retreatName||'';
  document.getElementById('bld-start').value=b.startDate||'';
  document.getElementById('bld-end').value=b.endDate||'';
  document.getElementById('bld-pax').value=bldPaxN;
  document.getElementById('bld-pax-val').textContent=bldPaxN;
  document.getElementById('bld-notes').value=b.notes||'';
  document.getElementById('bldDelBtn').style.display='inline-flex';
  bldFillRowSel();
  if(b.venRow){const s=document.getElementById('bld-row');if(s)s.value=b.venRow;}
  bldAddonRender(b.addOns||[]);
  bldListRender();bldCalc(b.addOns||[]);bldRenderStatusPanel();bldStep(1);
}

function bldNew(){
  bldSelId=null;bldPaxN=10;bldCurBkId=null;
  ['bld-leader','bld-leader-email','bld-name','bld-start','bld-end','bld-notes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('bld-pax').value=10;
  document.getElementById('bld-pax-val').textContent=10;
  document.getElementById('bldDelBtn').style.display='none';
  bldFillRowSel();bldAddonRender([]);bldCalc([]);bldListRender();bldRenderStatusPanel();bldStep(1);
}

function bldAddonRender(selected){
  const grid=document.getElementById('addonGrid');if(!grid)return;
  grid.innerHTML='';
  ADD_ONS.forEach(ao=>{
    const on=selected.includes(ao.id);
    const card=document.createElement('div');
    card.className='addon-card'+(on?' selected':'');
    card.dataset.id=ao.id;
    card.innerHTML=`<div class="addon-check">${on?'✓':''}</div>
      <div class="addon-info"><div class="addon-name">${ao.name}</div><div class="addon-desc">${ao.desc}</div></div>
      <div class="addon-price-col"><div class="addon-price">$${ao.price}</div><div class="addon-price-disc" style="opacity:0" id="disc-${ao.id}">$${(ao.price*(1-PKG_DISCOUNT)).toFixed(0)} pkg</div></div>`;
    card.onclick=()=>bldToggleAddon(ao.id);
    grid.appendChild(card);
  });
  bldUpdateDiscLabels(selected);
}

function bldUpdateDiscLabels(sel){
  const isPkg=sel.length>=2;
  ADD_ONS.forEach(ao=>{const d=document.getElementById('disc-'+ao.id);if(d)d.style.opacity=isPkg?'1':'0';});
}

function bldToggleAddon(id){
  const sel=bldGetSelected();const idx=sel.indexOf(id);
  if(idx>=0)sel.splice(idx,1);else sel.push(id);
  bldAddonRender(sel);bldCalc(sel);
}

function bldGetSelected(){return Array.from(document.querySelectorAll('.addon-card.selected')).map(c=>c.dataset.id);}

function bldPax(delta){
  bldPaxN=Math.max(1,Math.min(200,bldPaxN+delta));
  document.getElementById('bld-pax').value=bldPaxN;
  document.getElementById('bld-pax-val').textContent=bldPaxN;
  bldCalc(bldGetSelected());
}
function bldPaxSync(){
  bldPaxN=parseInt(document.getElementById('bld-pax').value)||1;
  document.getElementById('bld-pax-val').textContent=bldPaxN;
  bldCalc(bldGetSelected());
}
function bldRender(){bldCalc(bldGetSelected());}
function bldOnStartDate(){
  const startEl=document.getElementById('bld-start');
  const endEl=document.getElementById('bld-end');
  const start=startEl.value;
  if(!start){bldRender();return;}
  // Set min so end can't be before start
  endEl.min=start;
  // Pre-fill end date to start + 5 days if end is empty or before start
  if(!endEl.value||endEl.value<=start){
    const d=new Date(start+'T00:00:00');
    d.setDate(d.getDate()+5);
    endEl.value=d.toISOString().split('T')[0];
  }
  bldRender();
  // Focus end date so its calendar opens at the right month
  endEl.focus();
  endEl.showPicker?.();
}

function bldCalc(selected){
  const sum=document.getElementById('bldSummary');if(!sum)return;
  const items=ADD_ONS.filter(a=>selected.includes(a.id));
  const isPkg=items.length>=2;
  bldUpdateDiscLabels(selected);
  if(items.length===0){sum.innerHTML='<div class="bs-empty">Select add-ons to see pricing.</div>';return;}
  const pax=bldPaxN;
  const leader=document.getElementById('bld-leader')?.value||'';
  const name=document.getElementById('bld-name')?.value||'';
  const startD=document.getElementById('bld-start')?.value;
  const endD=document.getElementById('bld-end')?.value;
  const subtotal=items.reduce((s,a)=>s+a.price,0);
  const discAmt=isPkg?+(subtotal*PKG_DISCOUNT).toFixed(2):0;
  const perPerson=+(subtotal-discAmt).toFixed(2);
  const groupTotal=+(perPerson*pax).toFixed(2);
  let html='';
  if(leader||name)html+=`<div class="bs-title">${leader||name}</div>`;
  html+=`<div class="bs-sub">${startD&&endD?fmtDate(startD)+' – '+fmtDate(endD)+' · ':''} ${pax} guests</div>`;
  if(isPkg)html+=`<div class="bs-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Package rate (10% off)</div>`;
  html+=`<div class="bs-items">`;
  items.forEach(a=>{
    const up=isPkg?+(a.price*(1-PKG_DISCOUNT)).toFixed(2):a.price;
    html+=`<div class="bs-item"><span>${a.name}</span><span><b>$${up}</b>${isPkg?`<span style="color:#bbb;font-size:10.5px;margin-left:4px">($${a.price})</span>`:''}</span></div>`;
  });
  html+=`</div><hr class="bs-divider">`;
  html+=`<div class="bs-row"><span>Add-ons subtotal</span><span>$${subtotal}</span></div>`;
  if(isPkg)html+=`<div class="bs-row disc"><span>Package discount (10%)</span><span>−$${discAmt}</span></div>`;
  html+=`<div class="bs-row total"><span>Per person</span><span>$${perPerson}</span></div>`;
  html+=`<div class="bs-row group"><span>Group total (${pax} guests)</span><span>${fmt$(groupTotal)}</span></div>`;
  html+=`<div class="prepaid-toggle"><label class="toggle-sw"><input type="checkbox" id="bld-prepaid" onchange="bldCalc(bldGetSelected())"><span class="toggle-slider"></span></label><span>Pre-paid pricing<span style="font-size:11px;color:var(--muted);margin-left:5px">(same 10% off)</span></span></div>`;
  sum.innerHTML=html;
}

// ---- STATUS PIPELINE ----
const BLD_STAGES=[
  {key:'requested',      label:'Soft Hold',       note:'Dates held tentatively'},
  {key:'contract_sent',  label:'Contract Sent',   note:'Contract sent to teacher'},
  {key:'contract_signed',label:'Contract Signed', note:'Signed copy received'},
  {key:'deposit_paid',   label:'Deposit Paid',    note:'Retreat confirmed — assign rooms when ready'},
  {key:'confirmed',      label:'Confirmed',       note:'Retreat fully confirmed'},
];
const BLD_STAGE_ORDER=['requested','contract_sent','contract_signed','deposit_paid','room_list_sent','confirmed','cancelled'];

function bldRenderStatusPanel(){
  const el=document.getElementById('bldStatusPipeline');if(!el)return;
  const bk=AppData.bookings.find(b=>b.id===bldCurBkId);
  const status=bk?bk.status:null;
  const curIdx=BLD_STAGE_ORDER.indexOf(status);
  let html='';
  BLD_STAGES.forEach((stage,i)=>{
    const si=BLD_STAGE_ORDER.indexOf(stage.key);
    const done=curIdx>si,cur=curIdx===si;
    html+=`<div style="display:flex;align-items:center;gap:10px;padding:7px 0;${i<BLD_STAGES.length-1?'border-bottom:1px solid #f4f0eb':''}">
      <div style="width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0;background:${done?'#2d6a6a':cur?'#2d6a6a':'#e8dfd4'};color:${done||cur?'#fff':'#b0a89e'}">${done?'✓':(i+1)}</div>
      <div style="flex:1">
        <div style="font-size:12.5px;font-weight:${cur?'700':'400'};color:${cur?'var(--dark)':done?'#6b7280':'#a89e94'}">${stage.label}</div>
        ${cur?`<div style="font-size:11px;color:var(--muted)">${stage.note}</div>`:''}
      </div>
      ${cur?`<span style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#2d6a6a;background:#e6f3f3;padding:2px 7px;border-radius:20px">Now</span>`:''}
    </div>`;
  });
  html+='<div style="margin-top:14px">';
  if(!bk){
    html+=`<button class="btn btn-primary" style="width:100%;padding:12px;font-size:13.5px" onclick="bldSaveSoftHold()">Save as Soft Hold &rarr;</button>
    <div style="font-size:11px;color:var(--muted);margin-top:7px;text-align:center;line-height:1.5">Saves to Venues Gantt as a tentative hold.<br>Room list unlocks after deposit.</div>`;
  } else if(status==='requested'){
    html+=`<button class="btn btn-secondary" style="width:100%;padding:9px;margin-bottom:8px;font-size:13px" onclick="bldSaveSoftHold()">Save Changes</button>
    <button class="btn btn-primary" style="width:100%;padding:12px;font-size:13.5px" onclick="bldSendContract()">Send Contract &rarr;</button>`;
  } else if(status==='contract_sent'){
    html+=`<button class="btn btn-secondary" style="width:100%;padding:9px;margin-bottom:8px;font-size:13px" onclick="bldSaveSoftHold()">Save Changes</button>
    <button class="btn btn-primary" style="width:100%;padding:12px;font-size:13.5px" onclick="bldMarkStatus('contract_signed')">Mark Contract Signed &rarr;</button>`;
  } else if(status==='contract_signed'){
    html+=`<button class="btn btn-secondary" style="width:100%;padding:9px;margin-bottom:8px;font-size:13px" onclick="bldSaveSoftHold()">Save Changes</button>
    <button class="btn btn-primary" style="width:100%;padding:12px;font-size:13.5px" onclick="bldMarkStatus('deposit_paid')">Mark Deposit Received &rarr;</button>`;
  } else if(['deposit_paid','room_list_sent','confirmed'].includes(status)){
    const isConfirmed=status==='confirmed';
    html+=`<button class="btn btn-secondary" style="width:100%;padding:9px;margin-bottom:8px;font-size:13px" onclick="bldSaveSoftHold()">Save Changes</button>
    ${!isConfirmed?`<button class="btn btn-primary" style="width:100%;padding:12px;font-size:13.5px;background:#059669;border-color:#059669;margin-bottom:6px" onclick="bldMarkStatus('confirmed')">Mark Confirmed ✓</button>`:''}
    <button class="btn btn-secondary" style="width:100%;padding:10px;font-size:13px" onclick="bldGoRoomList()">${isConfirmed?'View / Edit Room List':'Assign Rooms (optional)'}</button>
    <div style="font-size:11px;color:#059669;margin-top:7px;text-align:center;font-weight:600">Deposit received${isConfirmed?' · Confirmed ✓':''}</div>`;
  } else if(status==='cancelled'){
    html+=`<div style="color:#dc2626;font-size:13px;text-align:center;padding:10px 0;font-weight:600">Retreat cancelled</div>`;
  } else {
    html+=`<button class="btn btn-secondary" style="width:100%;padding:9px;margin-bottom:8px;font-size:13px" onclick="bldSaveSoftHold()">Save Changes</button>
    <button class="btn btn-primary" style="width:100%;padding:12px;font-size:13.5px" onclick="bldGoRoomList()">Build Room List &rarr;</button>`;
  }
  html+='</div>';
  el.innerHTML=html;
}

function bldSaveSoftHold(){
  const leader=document.getElementById('bld-leader').value.trim();
  const leaderEmail=document.getElementById('bld-leader-email').value.trim();
  const name=document.getElementById('bld-name').value.trim();
  const start=document.getElementById('bld-start').value;
  const end=document.getElementById('bld-end').value;
  if(!start||!end){alert('Please enter retreat dates.');return;}
  if(!leader&&!name){alert('Please enter a leader name or retreat name.');return;}
  bldPaxN=parseInt(document.getElementById('bld-pax').value)||bldPaxN||10;
  document.getElementById('bld-pax-val').textContent=bldPaxN;
  const venRow=document.getElementById('bld-row').value||AppData.venRows[0]||'RETREAT 1';
  const bldNotesVal=document.getElementById('bld-notes').value.trim();
  const effectiveRow=bldNotesVal.toLowerCase().includes('chica')?'CHICA':venRow;
  if(bldCurBkId){
    const bk=AppData.bookings.find(b=>b.id===bldCurBkId);
    if(bk)Object.assign(bk,{leaderName:leader,leaderEmail,retreatName:name,startDate:start,endDate:end,pax:bldPaxN,row:effectiveRow,notes:bldNotesVal});
  } else {
    const newBk={id:uid(),row:effectiveRow,leaderName:leader,leaderEmail,retreatName:name,startDate:start,endDate:end,pax:bldPaxN,status:'requested',notes:bldNotesVal,roomAssignments:[],blockedRooms:[]};
    AppData.bookings.push(newBk);bldCurBkId=newBk.id;
  }
  const sel=bldGetSelected();
  const obj={id:bldSelId||uid(),bkId:bldCurBkId,leaderName:leader,leaderEmail,retreatName:name,venRow,startDate:start,endDate:end,estPax:bldPaxN,addOns:sel,notes:bldNotesVal};
  if(bldSelId){const i=builds.findIndex(b=>b.id===bldSelId);if(i>=0)builds[i]=obj;}
  else{builds.unshift(obj);bldSelId=obj.id;}
  saveBuilds();saveAll();bldListRender();
  document.getElementById('bldDelBtn').style.display='inline-flex';
  bldRenderStatusPanel();venBuild();buildDashboard();
  showToast(`${leader||name} saved.`);
}

async function bldSendContract(){
  bldSaveSoftHold();
  if(!bldCurBkId)return;
  const bk=AppData.bookings.find(b=>b.id===bldCurBkId);if(!bk)return;
  if(!bk.leaderEmail){showToast('⚠ Add Leader Email first to send the contract');return;}
  _contractBkId=bldCurBkId;
  await emailContract();
  bldRenderStatusPanel();
}

function bldMarkStatus(newStatus){
  if(!bldCurBkId){bldSaveSoftHold();return;}
  const bk=AppData.bookings.find(b=>b.id===bldCurBkId);if(!bk)return;
  const leader=document.getElementById('bld-leader').value.trim();
  const leaderEmail=document.getElementById('bld-leader-email').value.trim();
  const name=document.getElementById('bld-name').value.trim();
  const start=document.getElementById('bld-start').value;
  const end=document.getElementById('bld-end').value;
  bldPaxN=parseInt(document.getElementById('bld-pax').value)||bldPaxN||10;
  const bldNotesVal=document.getElementById('bld-notes').value.trim();
  Object.assign(bk,{leaderName:leader||bk.leaderName,leaderEmail:leaderEmail||bk.leaderEmail,retreatName:name||bk.retreatName,startDate:start||bk.startDate,endDate:end||bk.endDate,pax:bldPaxN,notes:bldNotesVal,status:newStatus});
  if(bldSelId){const i=builds.findIndex(b=>b.id===bldSelId);if(i>=0)Object.assign(builds[i],{leaderName:leader,retreatName:name,startDate:start,endDate:end,estPax:bldPaxN,notes:bldNotesVal});}
  saveAll();saveBuilds();bldListRender();bldRenderStatusPanel();venBuild();buildDashboard();
  const LABELS={contract_sent:'Contract marked as sent',contract_signed:'Contract marked as signed',deposit_paid:'Deposit received — room list is now unlocked!'};
  showToast(LABELS[newStatus]||'Status updated.');
}

function bldGoRoomList(){
  if(!bldCurBkId){alert('Save the retreat first.');return;}
  bldPaxN=parseInt(document.getElementById('bld-pax').value)||bldPaxN||10;
  bldStep2Build();bldStep(2);
}

// Step 1 → 2
function bldNext1(){
  const leader=document.getElementById('bld-leader').value.trim();
  const leaderEmail=document.getElementById('bld-leader-email').value.trim();
  const name=document.getElementById('bld-name').value.trim();
  const start=document.getElementById('bld-start').value;
  const end=document.getElementById('bld-end').value;
  if(!start||!end){alert('Please enter retreat dates before continuing.');return;}
  if(!leader&&!name){alert('Please enter a leader name or retreat name.');return;}
  // Always re-read pax from input so typing 20 is respected even if oninput didn't fire
  bldPaxN=parseInt(document.getElementById('bld-pax').value)||bldPaxN||10;
  document.getElementById('bld-pax-val').textContent=bldPaxN;
  // Save / update venue booking
  const venRow=document.getElementById('bld-row').value||AppData.venRows[0]||'RETREAT 1';
  const bldNotesVal=document.getElementById('bld-notes').value.trim();
  const effectiveRow=bldNotesVal.toLowerCase().includes('chica')?'CHICA':venRow;
  if(bldCurBkId){
    const bk=AppData.bookings.find(b=>b.id===bldCurBkId);
    if(bk){Object.assign(bk,{leaderName:leader,leaderEmail,retreatName:name,startDate:start,endDate:end,pax:bldPaxN,row:effectiveRow,notes:bldNotesVal});}
  } else {
    const newBk={id:uid(),row:effectiveRow,leaderName:leader,leaderEmail,retreatName:name,startDate:start,endDate:end,pax:bldPaxN,status:'contract_sent',notes:bldNotesVal,roomAssignments:[],blockedRooms:[]};
    AppData.bookings.push(newBk);bldCurBkId=newBk.id;
  }
  // Save build
  const sel=bldGetSelected();
  const obj={id:bldSelId||uid(),bkId:bldCurBkId,leaderName:leader,leaderEmail,retreatName:name,venRow,startDate:start,endDate:end,estPax:bldPaxN,addOns:sel,notes:document.getElementById('bld-notes').value.trim()};
  if(bldSelId){const i=builds.findIndex(b=>b.id===bldSelId);if(i>=0)builds[i]=obj;}
  else{builds.unshift(obj);bldSelId=obj.id;}
  saveBuilds();saveAll();bldListRender();
  // Build step 2
  bldStep2Build();
  bldStep(2);
}

// Step 2: Room Block Creator
function bldStep2Build(){
  let bk=AppData.bookings.find(b=>b.id===bldCurBkId);
  // If booking was cleared but build still exists, re-create it
  if(!bk&&bldCurBkId){
    const b=builds.find(x=>x.bkId===bldCurBkId)||builds.find(x=>x.id===bldSelId);
    if(b){
      bk={id:bldCurBkId,row:b.venRow||AppData.venRows[0]||'RETREAT 1',leaderName:b.leaderName,retreatName:b.retreatName,startDate:b.startDate,endDate:b.endDate,pax:b.estPax||bldPaxN,status:'contract_sent',notes:b.notes||'',roomAssignments:[],blockedRooms:[]};
      AppData.bookings.push(bk);saveAll();
    }
  }
  if(!bk)return;
  document.getElementById('s2-retreatLbl').textContent=bk.leaderName||bk.retreatName;
  document.getElementById('s2-datesLbl').textContent=`${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}`;
  document.getElementById('s2-paxLbl').textContent=bldPaxN;

  // Conflict map
  const conflictMap=new Map();
  AppData.bookings.forEach(other=>{
    if(other.id===bk.id)return;
    if(!datesOverlap(bk.startDate,bk.endDate,other.startDate,other.endDate))return;
    (other.blockedRooms||[]).forEach(room=>{if(!conflictMap.has(room))conflictMap.set(room,other.leaderName||other.retreatName);});
  });

  const myBlocked=new Set(bk.blockedRooms||[]);
  const totalAvail=AppData.roomTypes.filter(rt=>!DUPLICATE_ROOM_ENTRY_IDS.has(rt.id)).reduce((s,rt)=>s+rt.rooms.filter(r=>!conflictMap.has(r)).length,0);
  document.getElementById('s2-availLbl').textContent=`${totalAvail} rooms available`;

  const grid=document.getElementById('s2-roomGrid');grid.innerHTML='';
  AppData.roomTypes.forEach(rt=>{
    const sec=document.createElement('div');sec.style.cssText='background:#fff;border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:14px';
    const hdr=document.createElement('div');hdr.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border)';
    hdr.innerHTML=`<div style="width:10px;height:10px;border-radius:50%;background:${rt.color};flex-shrink:0"></div>
      <span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--dark)">${rt.name}</span>
      <span style="font-size:11px;color:var(--muted)">(${rt.rooms.length} rooms · up to ${rt.maxOcc} guests)</span>
      <a href="#" style="margin-left:auto;font-size:11.5px;color:var(--teal);font-weight:600;text-decoration:none" onclick="s2SelectAll('${rt.id}',event)">Select All</a>`;
    sec.appendChild(hdr);
    const roomsDiv=document.createElement('div');roomsDiv.style.cssText='display:flex;flex-wrap:wrap;gap:6px';roomsDiv.id='s2grid-'+rt.id;
    rt.rooms.forEach(room=>{
      const conflict=conflictMap.get(room);const isChecked=myBlocked.has(room);
      const lbl=document.createElement('label');
      lbl.className='block-room-item'+(isChecked?' br-checked':'')+(conflict?' br-other':'');
      lbl.dataset.room=room;lbl.dataset.rtId=rt.id;
      const catLbl=roomCatLabel(room);
      lbl.innerHTML=`<input type="checkbox"${isChecked?' checked':''}${conflict?' disabled':''} onchange="s2Toggle(this)">`
        +`<span class="br-lbl">${room}</span>`+(catLbl?`<span class="br-cat ${catLbl.toLowerCase()}">${catLbl}</span>`:'')+( conflict?`<span style="font-size:9px;font-weight:800;color:#dc2626;letter-spacing:.3px;margin-left:2px">BOOKED · ${conflict}</span>`:'');
      roomsDiv.appendChild(lbl);
    });
    sec.appendChild(roomsDiv);grid.appendChild(sec);
  });
}

function s2Toggle(cb){
  const item=cb.closest('.block-room-item');
  cb.checked?item.classList.add('br-checked'):item.classList.remove('br-checked');
}

function s2SelectAll(rtId,e){
  e.preventDefault();
  const g=document.getElementById('s2grid-'+rtId);
  const cbs=Array.from(g.querySelectorAll('input:not(:disabled)'));
  const allOn=cbs.every(c=>c.checked);
  cbs.forEach(cb=>{cb.checked=!allOn;s2Toggle(cb);});
}

function bldAutoSuggest(){
  const bk=AppData.bookings.find(b=>b.id===bldCurBkId);
  const isChica=bk&&(bk.row==='CHICA'||(bk.notes||'').toLowerCase().includes('chica'));
  // Clear all
  document.querySelectorAll('#s2-roomGrid .block-room-item input:not(:disabled)').forEach(cb=>{cb.checked=false;s2Toggle(cb);});
  // Cycle through room types in this order, 1 room per type per pass, until total beds = pax
  // (beds = pax assumes solo occupancy — each bed slot = 1 guest)
  const CYCLE=['rt1','rt4','rt7','rt8','rt6','rt2','rt3','rt5','rt9'];
  const target=bldPaxN;
  // Build pools of available rooms per type
  const pools={};
  CYCLE.forEach(rtId=>{
    const rt=AppData.roomTypes.find(r=>r.id===rtId);if(!rt)return;
    const grid=document.getElementById('s2grid-'+rtId);if(!grid)return;
    let avail=Array.from(grid.querySelectorAll('input:not(:disabled):not(:checked)'));
    if(isChica){avail=avail.filter(cb=>roomCategory(cb.closest('.block-room-item').dataset.room)===1);}
    else{avail=avail.filter(cb=>roomCategory(cb.closest('.block-room-item').dataset.room)!==1);}
    pools[rtId]={items:avail,idx:0,maxOcc:rt.maxOcc};
  });
  let beds=0,anyPicked=true;
  while(beds<target&&anyPicked){
    anyPicked=false;
    for(const rtId of CYCLE){
      if(beds>=target)break;
      const pool=pools[rtId];if(!pool||pool.idx>=pool.items.length)continue;
      const cb=pool.items[pool.idx++];
      cb.checked=true;s2Toggle(cb);
      beds+=pool.maxOcc;
      anyPicked=true;
    }
  }
  showToast(`Auto-suggested ${isChica?'Chica ':''}rooms for ${bldPaxN} guests (${beds} beds).`);
}

function bldConfirmBlock(){
  const bk=AppData.bookings.find(b=>b.id===bldCurBkId);if(!bk)return;
  const selected=Array.from(document.querySelectorAll('#s2-roomGrid .block-room-item input:checked'))
    .map(cb=>cb.closest('.block-room-item').dataset.room);
  // Conflict check
  const conflictMap=new Map();
  AppData.bookings.forEach(other=>{
    if(other.id===bk.id)return;
    if(!datesOverlap(bk.startDate,bk.endDate,other.startDate,other.endDate))return;
    (other.blockedRooms||[]).forEach(r=>{if(!conflictMap.has(r))conflictMap.set(r,other.leaderName||other.retreatName);});
  });
  const conflicts=selected.filter(r=>conflictMap.has(r));
  if(conflicts.length){alert('Cannot confirm — rooms already blocked:\n'+conflicts.map(r=>`Room ${r} → ${conflictMap.get(r)}`).join('\n'));return;}
  bk.blockedRooms=selected;
  saveAll();venBuild();buildDashboard();
  // Build step 3
  bldStep3Build();bldStep(3);
}

function bldStep3Build(){
  const bk=AppData.bookings.find(b=>b.id===bldCurBkId);if(!bk)return;
  const nights=getNights(bk);
  document.getElementById('s3-summary').textContent=`${bk.leaderName||''} · ${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)} · ${nights} nights · ${bk.pax||bldPaxN} est. guests`;
  const blockedSet=new Set(bk.blockedRooms||[]);
  let cap=0;let html='<table style="width:100%;border-collapse:collapse;font-size:13px">';
  html+='<thead><tr style="border-bottom:2px solid var(--border)"><th style="padding:6px 10px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--muted)">Room Type</th><th style="padding:6px 10px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--muted)">Rooms Blocked</th><th style="padding:6px 10px;text-align:right;font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--muted)">Capacity</th></tr></thead><tbody>';
  AppData.roomTypes.forEach(rt=>{
    const rooms=rt.rooms.filter(r=>blockedSet.has(r));if(!rooms.length)return;
    const rtCap=rooms.length*rt.maxOcc;cap+=rtCap;
    html+=`<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:8px 10px;display:flex;align-items:center;gap:6px"><div style="width:9px;height:9px;border-radius:50%;background:${rt.color};flex-shrink:0"></div>${rt.name}</td>
      <td style="padding:8px 10px;color:var(--muted)">${rooms.join(', ')}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:600">${rtCap}</td></tr>`;
  });
  html+=`</tbody><tfoot><tr><td colspan="2" style="padding:10px 10px;font-weight:700;color:var(--dark)">Total Capacity</td><td style="padding:10px 10px;text-align:right;font-size:15px;font-weight:700;color:var(--teal)">${cap} beds</td></tr></tfoot></table>`;
  document.getElementById('s3-roomSummary').innerHTML=html;
}

function bldGoToReg(){
  // Switch to Teacher Reg tab and pre-select this booking
  const btn=document.querySelector('.tab-btn:nth-child(3)');
  switchTab('teacherreg',btn||document.querySelector('.tab-btn'));
  setTimeout(()=>{
    const sel=document.getElementById('regRetreatSel');
    if(sel&&bldCurBkId){sel.value=bldCurBkId;regOnRetreat();}
  },100);
}

function bldDelete(){
  if(!bldSelId&&!bldCurBkId)return;
  const bkId=bldCurBkId;
  const bk=bkId?AppData.bookings.find(b=>b.id===bkId):null;
  const name=bk?(bk.leaderName||bk.retreatName):(builds.find(b=>b.id===bldSelId)?.leaderName||'this retreat');
  if(!confirm(`Delete "${name}"?\n\nThis will permanently remove the retreat and all its data.`))return;
  if(bkId){
    const bkObj=AppData.bookings.find(b=>b.id===bkId);
    if(bkObj)cancelCloudbedReservations(bkObj).catch(()=>{});
    deletedBookingIds.add(bkId);
    AppData.bookings=AppData.bookings.filter(b=>b.id!==bkId);
    AppData.regs=AppData.regs.filter(r=>r.bookingId!==bkId);
    Object.keys(adminDone).filter(k=>k.startsWith(bkId+'_')).forEach(k=>delete adminDone[k]);
    const acks=JSON.parse(localStorage.getItem('amansala_issue_acks')||'{}');
    Object.keys(acks).filter(k=>k.startsWith(bkId+'__')).forEach(k=>delete acks[k]);
    localStorage.setItem('amansala_issue_acks',JSON.stringify(acks));
    try{const t=loadTransport().filter(s=>s.bookingId!==bkId);saveTransport(t);}catch(e){}
    try{db.from('transport').delete().eq('booking_id',bkId).then(()=>{});}catch(e){}
  }
  builds=builds.filter(b=>b.id!==bldSelId&&(!bkId||b.bkId!==bkId));
  saveBuilds();saveAll();saveAdminDone();
  venBuild();buildDashboard();
  bldNew();
  showToast(`${name} deleted.`);
}

function bldInitTab(){
  loadBuilds();bldFillRowSel();bldListRender();
  bldAddonRender([]);bldCalc([]);bldRenderStatusPanel();bldStep(1);
}

// Modal helpers
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.modal-overlay').forEach(m=>{m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id);});});

// Tooltip
const tip=document.getElementById('tip');
function showTip(e,bk,regCount){
  const st=STATUS[bk.status]||STATUS.confirmed;
  const rc=regCount!=null?regCount:registeredCount(bk.id);
  const flags=getAutoFlags(bk).concat((bk.flags||[]).filter(f=>!f.resolved));
  // Financial totals
  const nights=getNights(bk);
  const bkRegs=AppData.regs.filter(r=>r.bookingId===bk.id);
  let totalCharged=0,totalPaid=0;
  bkRegs.forEach(reg=>{
    const rt=AppData.roomTypes.find(t=>t.id===reg.roomTypeId);
    const gc=(reg.guests||[]).filter(g=>g.name).length||1;
    const price=reg.customPrice!=null?reg.customPrice:calcPrice(rt,gc,nights,bk.startDate,bk);
    totalCharged+=price;totalPaid+=reg.amountPaid||0;
  });
  // Also include booking-level payments (recorded via Record Payment)
  const bkPayments=(bk.payments||[]).reduce((s,p)=>s+p.amount,0);
  totalPaid+=bkPayments;
  const balance=totalCharged-totalPaid;
  const finHtml=(totalCharged>0||totalPaid>0)?`<div style="margin-top:5px;border-top:1px solid rgba(255,255,255,.15);padding-top:5px;display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;font-size:10.5px">
    ${totalCharged>0?`<span style="color:rgba(255,255,255,.6)">Total</span><span style="color:#fff;font-weight:700">${fmt$(totalCharged)}</span>`:''}
    <span style="color:rgba(255,255,255,.6)">Paid</span><span style="color:#6ee7b7;font-weight:700">${fmt$(totalPaid)}</span>
    ${totalCharged>0?`<span style="color:rgba(255,255,255,.6)">Owing</span><span style="font-weight:700;color:${balance>0?'#fca5a5':'#6ee7b7'}">${fmt$(balance)}</span>`:''}
  </div>`:'';
  let flagsHtml=flags.length?`<div style="margin-top:5px;border-top:1px solid rgba(255,255,255,.15);padding-top:5px">`+flags.slice(0,3).map(f=>`<div style="font-size:10px;color:#fca5a5">🚩 ${f.message}</div>`).join('')+'</div>':'';
  const notesHtml=bk.notes?`<div style="margin-top:5px;border-top:1px solid rgba(255,255,255,.15);padding-top:5px;font-size:10.5px;color:#fde68a">📝 ${escHtml(bk.notes)}</div>`:'';
  tip.innerHTML=`<div class="tip-n">${bk.leaderName||bk.retreatName}</div><div class="tip-d">${fmtDate(bk.startDate)} → ${fmtDate(bk.endDate)}</div><div style="font-size:10.5px;font-weight:600;color:${st.border};margin-top:3px">${st.label}</div>${bk.pax?`<div style="font-size:10.5px;color:rgba(255,255,255,.7);margin-top:3px">Registered: <b style="color:#fff">${rc}/${bk.pax}</b></div>`:''}${finHtml}${flagsHtml}${notesHtml}`;
  tip.classList.add('show');moveTip(e);
}
function moveTip(e){let x=e.clientX+14,y=e.clientY-10;if(x+260>window.innerWidth)x=e.clientX-260;tip.style.left=x+'px';tip.style.top=y+'px';}
function hideTip(){tip.classList.remove('show');}

function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}


// ===== DASHBOARD =====
// ---- ACTIVITY NOTIFICATIONS ----
// Ported from staging's js/modules/dashboard.js computeNotifications()/renderNotifPanel()
// — same 7 categories (Room Sold, Flights, Chat Bot, Schedule, Contracts, Payments,
// Transport), same dismiss/seen state shared via the real `settings` table (not
// localStorage), so dismissing here dismisses in staging too. NOT ported: transport
// charge notifications — staging's version reads transport.data.folioCharged, a field
// portal's transport.js never writes (no "who pays for the airport transfer" folio-charge
// feature exists here yet), so there would never be any real data to show.
function _timeAgo(ts){const d=Date.now()-ts,m=Math.floor(d/60000);if(m<1)return'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';const dy=Math.floor(h/24);return dy===1?'yesterday':dy+'d ago';}
function _freeRoomsCountForNotif(rtId,startDate,endDate){
  const rt=AppData.roomTypes.find(r=>r.id===rtId);if(!rt)return 0;
  const overlaps=(s1,e1,s2,e2)=>s1<e2&&e1>s2;
  const blocked=new Set();
  AppData.bookings.forEach(b=>{if(b.status!=='cancelled'&&overlaps(b.startDate,b.endDate,startDate,endDate))(b.blockedRooms||[]).forEach(r=>blocked.add(r));});
  return (rt.rooms||[]).filter(r=>!blocked.has(r)).length;
}
function _calcRoomTagsForNotif(bk){
  const regs=getRegsForBk(bk.id);
  const byType={};
  (bk.blockedRooms||[]).forEach(room=>{
    const rt=AppData.roomTypes.find(t=>(t.rooms||[]).includes(room));
    if(!rt)return;
    if(!byType[rt.id])byType[rt.id]={id:rt.id,name:rt.name,blocked:0,filled:0};
    byType[rt.id].blocked++;
  });
  regs.forEach(reg=>{
    if(reg.roomTypeId&&byType[reg.roomTypeId]&&(reg.guests||[]).some(g=>g.name))byType[reg.roomTypeId].filled++;
  });
  return Object.values(byType).filter(t=>t.blocked>0);
}
function computeActivityNotifs(){
  const LOOKBACK_MS=60*24*60*60*1000;
  const cutoff=new Date(Date.now()-LOOKBACK_MS);
  const seenDate=notifSeenAt;
  const dismissed=notifDismissed;
  const notifs=[];

  AppData.bookings.forEach(bk=>{
    if((bk.flags||[]).includes('archived'))return;
    if(bk.status==='cancelled')return;
    const label=(bk.leaderName||'')+(bk.retreatName?' · '+bk.retreatName:'');

    const tags=_calcRoomTagsForNotif(bk);
    const soldOut=tags.filter(t=>t.blocked>0&&t.filled>=t.blocked);
    if(soldOut.length>0){
      const typeKey=soldOut.map(t=>t.name).sort().join(',');
      const id=`sold_out_${bk.id}_${typeKey}`;
      if(!dismissed.has(id))
        notifs.push({id,type:'sold_out',bookingId:bk.id,label,ts:null,isNew:false,
          soldOutTypes:soldOut.map(t=>({name:t.name,free:_freeRoomsCountForNotif(t.id,bk.startDate,bk.endDate)}))});
    }

    if(bk.scheduleRequest?._preferences){
      const submittedAt=bk.scheduleRequest._submitted_at;
      const sid=`schedule_submitted_${bk.id}`;
      if(!dismissed.has(sid)){
        if(submittedAt){
          const ts=new Date(submittedAt);
          if(ts>=cutoff){
            const isNew=!seenDate||ts>seenDate;
            notifs.push({id:sid,type:'schedule_submitted',bookingId:bk.id,label,ts,isNew});
          }
        }else{
          notifs.push({id:sid,type:'schedule_submitted',bookingId:bk.id,label,ts:null,isNew:false});
        }
      }
    }

    if(bk.contractSignedAt){
      const ts=new Date(bk.contractSignedAt);
      if(ts>=cutoff){
        const isNew=!seenDate||ts>seenDate;
        const cid=`contract_signed_${bk.id}`;
        if(!dismissed.has(cid))
          notifs.push({id:cid,type:'contract_signed',bookingId:bk.id,label,ts,isNew,signer:bk.contractSignature||bk.leaderName});
        if(bk.leaderEmail){
          const did=`deposit_email_${bk.id}`;
          if(!dismissed.has(did))
            notifs.push({id:did,type:'deposit_email',bookingId:bk.id,label,ts,isNew,email:bk.leaderEmail});
        }
      }
    }
  });

  notifBotLog.forEach(entry=>{
    const id=`bot_room_${entry.id}`;
    if(dismissed.has(id))return;
    const ts=new Date(entry.created_at);
    if(ts<cutoff)return;
    const isNew=!seenDate||ts>seenDate;
    const bk=AppData.bookings.find(b=>b.id===entry.booking_id);
    const bkLabel=bk?(bk.leaderName||'')+(bk.retreatName?' · '+bk.retreatName:''):entry.booking_id;
    const isAdd=entry.tool_name==='add_room_by_type';
    const rtName=entry.tool_result?.type_added??entry.tool_result?.type_removed??'—';
    notifs.push({id,type:'bot_room',ts,isNew,isAdd,rtName,bkLabel});
  });

  notifPaidRequests.forEach(pr=>{
    const id=`payment_received_${pr.id}`;
    if(dismissed.has(id))return;
    const ts=new Date(pr.created_at);
    if(ts<cutoff)return;
    const isNew=!seenDate||ts>seenDate;
    const name=`${pr.first_name||''} ${pr.last_name||''}`.trim();
    notifs.push({id,type:'payment_received',ts,isNew,name,room:pr.room_type_name||'',amount:pr.amount_paid||0});
  });

  notifWeTravelPayments.forEach(p=>{
    if(dismissed.has(p.id))return;
    const ts=p.ts?new Date(p.ts):null;
    if(ts&&ts<cutoff)return;
    const isNew=!seenDate||(ts&&ts>seenDate);
    notifs.push({id:p.id,type:'wetravel_payment',ts,isNew,bookingId:p.bookingId,guestName:p.guestName||'',
      amount:p.amount||0,kind:p.kind||'created'});
  });

  notifFlightAlerts.forEach(a=>{
    if(dismissed.has(a.id))return;
    if(a.dismissed)return;
    const ts=a.detectedAt?new Date(a.detectedAt):null;
    if(ts&&ts<cutoff)return;
    const isNew=!seenDate||(ts&&ts>seenDate);
    notifs.push({id:a.id,type:'flight_alert',ts,isNew,flight:a.flight,guest:a.guest,date:a.date,label:a.label,
      oldTime:a.oldTime,newTime:a.newTime,chargeAdjusted:a.chargeAdjusted,
      needsAction:a.status==='cancelled'&&a.chargeAdjusted==='pending_admin_review'});
  });

  notifs.sort((a,b)=>{
    const aPriority=(a.type==='sold_out'||(a.type==='flight_alert'&&a.needsAction))?1:0;
    const bPriority=(b.type==='sold_out'||(b.type==='flight_alert'&&b.needsAction))?1:0;
    if(aPriority!==bPriority)return bPriority-aPriority;
    return (b.ts?.getTime()||0)-(a.ts?.getTime()||0);
  });
  return notifs;
}
async function _saveNotifDismissed(){
  try{await db.from('settings').upsert({key:'notif_dismissed',value:[...notifDismissed],updated_at:new Date().toISOString()},{onConflict:'key'});}catch(e){}
}
function _dismissActvNotif(id){notifDismissed.add(id);buildDashboard();_saveNotifDismissed();}
function _dismissAllActvNotifs(){
  computeActivityNotifs().forEach(n=>notifDismissed.add(n.id));
  buildDashboard();_saveNotifDismissed();
}
function openBookingFromNotif(bkId){
  if(!bkId)return;
  switchTab('teacherreg',document.getElementById('teacherregTabBtn'));
  setTimeout(()=>regSelectRetreat(bkId),80);
}
function _actvNotifSectionOpen(id){return localStorage.getItem('ama_notif_sec_'+id)==='1';}
function _toggleActvNotifSection(id){localStorage.setItem('ama_notif_sec_'+id,_actvNotifSectionOpen(id)?'0':'1');buildDashboard();}
function _actvNotifRowHtml(n){
  const bg=n.isNew?'background:#fffbeb;border-left:3px solid #f59e0b':'background:#f9fafb;border-left:3px solid #e5e7eb';
  const newBadge=n.isNew?'<span style="font-size:9px;font-weight:700;background:#f59e0b;color:#fff;padding:1px 6px;border-radius:10px;flex-shrink:0">NEW</span>':'';
  const dismissBtn=`<button onclick="event.stopPropagation();_dismissActvNotif('${n.id}')" title="Dismiss" style="margin-left:auto;background:none;border:none;font-size:14px;color:#9ca3af;cursor:pointer;padding:0 4px;line-height:1;flex-shrink:0">×</button>`;
  if(n.type==='sold_out'){
    const types=n.soldOutTypes.map(t=>{
      const freeBadge=t.free>0?` <span style="font-size:9.5px;font-weight:700;background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:4px">${t.free} empty</span>`:'';
      return `<strong>${escHtml(t.name)}</strong>${freeBadge}`;
    }).join(' + ');
    return `<div style="${bg};padding:8px 14px;border-radius:6px;font-size:12.5px;color:#374151;display:flex;align-items:center;gap:8px">
      <span style="font-size:14px;flex-shrink:0">🔴</span>
      <span style="cursor:pointer" onclick="openBookingFromNotif('${n.bookingId}')"><strong>Room Sold</strong> — ${escHtml(n.label)} — ${types}</span>
      ${dismissBtn}</div>`;
  }
  if(n.type==='schedule_submitted'){
    return `<div style="${bg};padding:8px 14px;border-radius:6px;font-size:12.5px;color:#374151;display:flex;align-items:center;gap:8px">
      <span style="font-size:14px;flex-shrink:0">📅</span>
      <span style="cursor:pointer" onclick="openBookingFromNotif('${n.bookingId}')"><strong>Schedule submitted</strong> — ${escHtml(n.label)}</span>
      ${newBadge}${n.ts?`<span style="color:#9ca3af;font-size:11px;white-space:nowrap">${_timeAgo(n.ts.getTime())}</span>`:''}
      ${dismissBtn}</div>`;
  }
  if(n.type==='contract_signed'){
    return `<div style="${bg};padding:8px 14px;border-radius:6px;font-size:12.5px;color:#374151;display:flex;align-items:center;gap:8px">
      <span style="font-size:14px;flex-shrink:0">📝</span>
      <span style="cursor:pointer" onclick="openBookingFromNotif('${n.bookingId}')"><strong>Contract signed</strong> — ${escHtml(n.label)} — by ${escHtml(n.signer)}</span>
      ${newBadge}<span style="color:#9ca3af;font-size:11px;white-space:nowrap">${_timeAgo(n.ts.getTime())}</span>
      ${dismissBtn}</div>`;
  }
  if(n.type==='deposit_email'){
    return `<div style="${bg};padding:8px 14px;border-radius:6px;font-size:12.5px;color:#374151;display:flex;align-items:center;gap:8px">
      <span style="font-size:14px;flex-shrink:0">✉️</span>
      <span style="cursor:pointer" onclick="openBookingFromNotif('${n.bookingId}')"><strong>Contract signed — send deposit info?</strong> — ${escHtml(n.label)} — ${escHtml(n.email)}</span>
      ${newBadge}<span style="color:#9ca3af;font-size:11px;white-space:nowrap">${_timeAgo(n.ts.getTime())}</span>
      ${dismissBtn}</div>`;
  }
  if(n.type==='bot_room'){
    const icon=n.isAdd?'🤖➕':'🤖➖';
    const action=n.isAdd?'Bot added room':'Bot removed room';
    return `<div style="${bg};padding:8px 14px;border-radius:6px;font-size:12.5px;color:#374151;display:flex;align-items:center;gap:8px">
      <span style="font-size:14px;flex-shrink:0">${icon}</span>
      <span><strong>${action}</strong> — ${escHtml(n.bkLabel)} — <strong>${escHtml(n.rtName)}</strong></span>
      ${newBadge}<span style="color:#9ca3af;font-size:11px;white-space:nowrap">${_timeAgo(n.ts.getTime())}</span>
      ${dismissBtn}</div>`;
  }
  if(n.type==='payment_received'){
    const amt=n.amount>0?` — <strong>${fmt$(n.amount)}</strong>`:'';
    return `<div style="${bg};padding:8px 14px;border-radius:6px;font-size:12.5px;color:#374151;display:flex;align-items:center;gap:8px">
      <span style="font-size:14px;flex-shrink:0">💳</span>
      <span><strong>Payment received</strong> — ${escHtml(n.name)}${n.room?' · '+escHtml(n.room):''}${amt}</span>
      ${newBadge}<span style="color:#9ca3af;font-size:11px;white-space:nowrap">${_timeAgo(n.ts.getTime())}</span>
      ${dismissBtn}</div>`;
  }
  if(n.type==='wetravel_payment'){
    const label=n.kind==='created'?'We Travel booking paid':'We Travel payment received';
    const amt=n.amount>0?` — <strong>${fmt$(n.amount)}</strong>`:'';
    return `<div style="${bg};padding:8px 14px;border-radius:6px;font-size:12.5px;color:#374151;display:flex;align-items:center;gap:8px">
      <span style="font-size:14px;flex-shrink:0">🧳</span>
      <span style="cursor:pointer" onclick="openBookingFromNotif('${n.bookingId}')"><strong>${label}</strong>${n.guestName?' — '+escHtml(n.guestName):''}${amt}</span>
      ${newBadge}${n.ts?`<span style="color:#9ca3af;font-size:11px;white-space:nowrap">${_timeAgo(n.ts.getTime())}</span>`:''}
      ${dismissBtn}</div>`;
  }
  if(n.type==='flight_alert'){
    const isCancelled=n.label==='CANCELLED';
    const rowBg=isCancelled?'background:#fef2f2;border-left:3px solid #dc2626':bg;
    const icon=isCancelled?'⛔':'⚠️';
    const timeChg=(n.oldTime&&n.newTime)?` · ${escHtml(n.oldTime)} → <strong>${escHtml(n.newTime)}</strong>`:'';
    return `<div style="${rowBg};padding:8px 14px;border-radius:6px;font-size:12.5px;color:#374151;display:flex;align-items:center;gap:8px">
      <span style="font-size:14px;flex-shrink:0">${icon}</span>
      <span><strong>${escHtml(n.label)}</strong> — ${escHtml(n.flight)} · ${escHtml(n.guest)} · ${escHtml(n.date)}${timeChg}</span>
      ${newBadge}${n.ts?`<span style="color:#9ca3af;font-size:11px;white-space:nowrap">${_timeAgo(n.ts.getTime())}</span>`:''}
      ${dismissBtn}</div>`;
  }
  return '';
}
const ACTV_NOTIF_SECTIONS=[
  {id:'room_sold',label:'Room Sold',icon:'🔴',types:['sold_out']},
  {id:'flights',label:'Flights',icon:'✈️',types:['flight_alert']},
  {id:'chat_bot',label:'Chat Bot',icon:'🤖',types:['bot_room']},
  {id:'schedule',label:'Schedule',icon:'📅',types:['schedule_submitted']},
  {id:'contracts',label:'Contracts',icon:'📝',types:['contract_signed','deposit_email']},
  {id:'payments',label:'Payments',icon:'💳',types:['payment_received']},
  {id:'wetravel',label:'We Travel',icon:'🧳',types:['wetravel_payment']},
];
function renderActvNotifPanel(notifs){
  if(!notifs.length)return'';
  const newCount=notifs.filter(n=>n.isNew).length;
  const sectionsHtml=ACTV_NOTIF_SECTIONS.map(sec=>{
    const items=notifs.filter(n=>sec.types.includes(n.type));
    if(!items.length)return'';
    const secNew=items.filter(n=>n.isNew).length;
    const secOpen=_actvNotifSectionOpen(sec.id);
    return `<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div onclick="_toggleActvNotifSection('${sec.id}')" style="display:flex;align-items:center;gap:8px;padding:8px 14px;cursor:pointer;user-select:none;background:#f9fafb">
        <span style="font-size:13px">${sec.icon}</span>
        <span style="font-size:12.5px;font-weight:700;color:#111827">${sec.label}</span>
        <span style="font-size:11px;color:#6b7280;font-weight:600">${items.length}</span>
        ${secNew>0?`<span style="background:#f59e0b;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px">${secNew} new</span>`:''}
        <div style="flex:1"></div>
        <span style="color:#9ca3af;font-size:11px">${secOpen?'▲':'▼'}</span>
      </div>
      ${secOpen?`<div style="display:flex;flex-direction:column;gap:4px;padding:6px 8px 8px">${items.map(_actvNotifRowHtml).filter(Boolean).join('')}</div>`:''}
    </div>`;
  }).filter(Boolean).join('');
  return `<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;margin-bottom:22px;overflow:hidden">
    <div style="display:flex;align-items:center;gap:10px;padding:13px 20px;background:#eef2ff;border-bottom:1px solid #c7d2fe">
      <span style="font-size:1.1rem">🔔</span>
      <span style="font-size:13px;font-weight:700;color:#3730a3">Notifications</span>
      ${newCount>0?`<span style="background:#f59e0b;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px">${newCount} new</span>`:''}
      <div style="flex:1"></div>
      <button onclick="_dismissAllActvNotifs()" style="padding:4px 12px;background:transparent;border:1px solid #6366f1;border-radius:6px;font-family:inherit;font-size:11.5px;font-weight:600;color:#4f46e5;cursor:pointer">Dismiss all</button>
    </div>
    <div style="padding:12px;display:flex;flex-direction:column;gap:6px">${sectionsHtml}</div>
  </div>`;
}
// ---- INQUIRY NOTIFICATIONS ----
function getSeenInquiries(){return new Set(JSON.parse(localStorage.getItem('amansala_inquiry_seen')||'[]'));}
function markInquirySeen(id){const s=getSeenInquiries();s.add(id);localStorage.setItem('amansala_inquiry_seen',JSON.stringify([...s]));}
function dismissAllInquiries(){
  AppData.bookings.filter(b=>b.source==='inquiry').forEach(b=>markInquirySeen(b.id));
  updateInquiryDot();buildDashboard();
}
function dismissInquiry(id){markInquirySeen(id);updateInquiryDot();buildDashboard();}
function openInquiryInVenues(bkId){
  markInquirySeen(bkId);updateInquiryDot();buildDashboard();
  switchTab('venues',document.querySelector('.tab-btn[onclick*="venues"]'));
  setTimeout(()=>{const bk=AppData.bookings.find(b=>b.id===bkId);if(bk)openVenEdit(bkId);},120);
}
function updateInquiryDot(){
  const seen=getSeenInquiries();
  const unseen=AppData.bookings.filter(b=>b.source==='inquiry'&&!seen.has(b.id));
  const dot=document.getElementById('inquiryDot');if(!dot)return;
  if(unseen.length){dot.style.display='inline-block';dot.textContent=unseen.length;}
  else{dot.style.display='none';}
}

// ── CRM — the three public inquiry forms (Retreat Leader, Wedding,
// Bachelorette) in one place: open/copy each link, plus a live feed of
// wedding/bachelorette leads (crm_inquiries — separate from bookings, so
// it never races the admin's own booking saves). Retreat leads already flow
// into Venues via the existing bookings/inquiries merge, so that one just
// links out to the existing Submissions view instead of duplicating it.
let crmInquiries=null;
async function dbCrmLoadInquiries(){
  try{
    const{data}=await db.from('app_store').select('value').eq('key','crm_inquiries').maybeSingle();
    crmInquiries=Array.isArray(data?.value)?data.value:[];
  }catch(e){crmInquiries=crmInquiries||[];}
  const wrap=document.getElementById('dbCrmRecent');
  if(wrap)wrap.innerHTML=dbCrmRecentListHtml();
}
function dbCrmRecentListHtml(){
  if(crmInquiries===null)return'<div style="padding:14px;font-size:12px;color:var(--muted);font-style:italic">Loading…</div>';
  const recent=crmInquiries.slice().sort((a,b)=>(b.submittedAt||'').localeCompare(a.submittedAt||'')).slice(0,8);
  if(!recent.length)return'<div style="padding:14px;font-size:12px;color:var(--muted);font-style:italic">No wedding or bachelorette inquiries yet.</div>';
  const fmtD=ds=>{if(!ds)return'TBD';const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});};
  return recent.map(i=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #f0ece4;font-size:12.5px">
    <div><b style="color:var(--dark)">${menuEsc(i.honoree||i.name)}</b> <span style="color:var(--muted);text-transform:capitalize">— ${i.type}</span></div>
    <div style="color:var(--muted)">${fmtD(i.date)} · ${i.guestCount||'?'} guests</div>
    <div style="color:var(--muted)">${menuEsc(i.email)}</div>
  </div>`).join('');
}
function dbCrmLinkRow(label,formUrl,copyUrl,submissionsUrl){
  const btn=(inner,onclick,href)=>href
    ?`<a href="${href}" target="_blank" style="display:inline-flex;align-items:center;gap:7px;padding:7px 14px;background:#fff;border:1.5px solid var(--border);border-radius:9px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:600;color:var(--dark);text-decoration:none;transition:all .15s" onmouseover="this.style.borderColor='#2d6a6a';this.style.color='#2d6a6a'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--dark)'">${inner}</a>`
    :`<button onclick="${onclick}" style="display:inline-flex;align-items:center;gap:7px;padding:7px 14px;background:#fff;border:1.5px solid var(--border);border-radius:9px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:600;color:var(--dark);cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='#2d6a6a';this.style.color='#2d6a6a'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--dark)'">${inner}</button>`;
  return`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
    <span style="font-size:12.5px;font-weight:700;color:var(--dark);min-width:140px">${label}</span>
    ${btn('Open Form',null,formUrl)}
    ${btn('Copy Link',`navigator.clipboard.writeText('${copyUrl}').then(()=>showToast('Link copied!'))`)}
    ${submissionsUrl?btn('Submissions',null,submissionsUrl):''}
  </div>`;
}
function dbCrmSectionHtml(){
  if(crmInquiries===null)dbCrmLoadInquiries();
  return dbAccordionSection('crmForms','📋','CRM — Inquiry Forms','#2d6a6a','#fff','var(--border)',
    `<button onclick="event.stopPropagation();switchTab('pipeline',document.getElementById('pipelineTabBtn'))" style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;background:#2d6a6a;border:none;border-radius:8px;font-family:'Jost',sans-serif;font-size:11.5px;font-weight:700;color:#fff;cursor:pointer">View Sales Pipeline →</button>`,
    `<div style="padding:12px 20px 16px">
      ${dbCrmLinkRow('Retreat Leader','/leader-inquiry.html','https://amansala-portal.netlify.app/leader-inquiry.html','/retreat-admin')}
      ${dbCrmLinkRow('Wedding','/event-inquiry.html?type=wedding','https://amansala-portal.netlify.app/event-inquiry.html?type=wedding')}
      ${dbCrmLinkRow('Bachelorette','/event-inquiry.html?type=bachelorette','https://amansala-portal.netlify.app/event-inquiry.html?type=bachelorette')}
      ${dbCrmLinkRow('Extra Nights','/extra-nights.html','https://amansala-portal.netlify.app/extra-nights.html')}
      ${dbCrmLinkRow('Book a Stay','/book.html','https://amansala-portal.netlify.app/book.html')}
      ${dbCrmLinkRow('Hotel PMS','https://amansala-staging.netlify.app','https://amansala-staging.netlify.app')}
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid #f0ece4">
        <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:6px">Recent Wedding / Bachelorette Inquiries</div>
        <div id="dbCrmRecent">${dbCrmRecentListHtml()}</div>
      </div>
    </div>`,
    false);
}
// Collapsible dashboard section — startOpen only matters the first time a
// key is rendered; after that the user's own expand/collapse choice (kept in
// _dbAccOpen for this session) wins, so re-rendering the dashboard doesn't
// keep snapping a section back open/closed on them.
let _dbAccOpen={};
function dbToggleAccordion(key){
  _dbAccOpen[key]=!_dbAccOpen[key];
  const body=document.getElementById('dbAcc-'+key),chev=document.getElementById('dbAccChev-'+key);
  if(body)body.style.display=_dbAccOpen[key]?'block':'none';
  if(chev)chev.textContent=_dbAccOpen[key]?'▾':'▸';
}
function dbAccordionSection(key,icon,title,color,bg,border,headerRight,bodyHtml,startOpen){
  if(!(key in _dbAccOpen))_dbAccOpen[key]=!!startOpen;
  const open=_dbAccOpen[key];
  return`<div class="db-section" style="margin-bottom:14px;border-color:${border}">
    <div class="db-sec-hdr" style="background:${bg};border-color:${border};display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="dbToggleAccordion('${key}')">
      <span class="db-sec-title" style="color:${color}">${icon}&nbsp; ${title}</span>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:12px;font-weight:700;color:${color}">${headerRight}</span>
        <span id="dbAccChev-${key}" style="font-size:12px;color:${color}">${open?'▾':'▸'}</span>
      </div>
    </div>
    <div id="dbAcc-${key}" style="display:${open?'block':'none'}">
      ${bodyHtml}
    </div>
  </div>`;
}
function buildDashboard(){
  const el=document.getElementById('dbContent');if(!el)return;
  const today=new Date();today.setHours(0,0,0,0);
  const todayStr=fmtISO(today);
  const in4wStr=fmtISO(addDays(today,28));
  const in6wStr=fmtISO(addDays(today,42));
  const in7wStr=fmtISO(addDays(today,49));
  const in30Str=fmtISO(addDays(today,30));

  // Extra Nights (extra-nights.html) and Book a Stay (book.html, retreatName
  // 'Escape' — book.html's own Stripe metadata literally calls this product
  // 'Escape') purchases both create a real bookings row so the room shows on
  // the venue calendar, but neither is a teacher retreat moving through the
  // sales pipeline — exclude them so they don't clutter the pipeline stages
  // and arrivals widget as if they were retreat "events".
  const NON_RETREAT_NAMES=new Set(['Extra Night','Escape']);
  const active=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.endDate>=todayStr&&!NON_RETREAT_NAMES.has(b.retreatName));

  // Payment alerts — the Sales Pipeline (CRM) now owns early-lead tracking
  // (soft holds, contract follow-up, deposit reminders), so the Dashboard only
  // tracks money actually pending on ALREADY-booked retreats, split by
  // certainty: a deposit not yet received isn't guaranteed revenue the way a
  // remaining final balance on a deposited retreat is.
  const depositPending=[],finalBalancePending=[];
  active.forEach(bk=>{
    if(adminDone[bk.id+'_payment'])return;
    const {charged,totalPaid:paid,balance}=calcBkBalance(bk);
    if(balance<=0)return;
    const obj={bk,balance,charged,paid};
    if(pipeDepositReceived(bk))finalBalancePending.push(obj);else depositPending.push(obj);
  });
  depositPending.sort((a,b)=>a.bk.startDate.localeCompare(b.bk.startDate));
  finalBalancePending.sort((a,b)=>a.bk.startDate.localeCompare(b.bk.startDate));
  const depositPendingTotal=depositPending.reduce((s,x)=>s+x.balance,0);
  const finalBalancePendingTotal=finalBalancePending.reduce((s,x)=>s+x.balance,0);
  // Overdue = balance still owed past its due date — the final-payment due
  // date (6 weeks before arrival, same convention finalPaymentDue() already
  // uses elsewhere) for retreats yet to arrive, or the retreat's own start
  // date once it's already begun/passed and still isn't paid off.
  const overdueBalances=[];
  active.forEach(bk=>{
    if(adminDone[bk.id+'_payment'])return;
    const {balance}=calcBkBalance(bk);
    if(balance<=0)return;
    const dueDateStr=bk.startDate<=todayStr?bk.startDate:fmtISO(finalPaymentDue(bk));
    if(dueDateStr>=todayStr)return;
    const daysOverdue=Math.round((today-pd(dueDateStr))/DAY_MS);
    overdueBalances.push({bk,balance,dueDateStr,daysOverdue});
  });
  overdueBalances.sort((a,b)=>b.daysOverdue-a.daysOverdue);
  const overdueBalancesTotal=overdueBalances.reduce((s,x)=>s+x.balance,0);
  const scheduleConfirmPending=active.filter(bk=>{
    if(!bk.scheduleRequest?.submittedAt)return false;
    const s=bk.scheduleRequest.adminStatus||'pending';
    return s==='pending'||s==='changes';
  }).sort((a,b)=>a.startDate.localeCompare(b.startDate));

  // Pipeline stages
  const noContract=active.filter(b=>['requested','pending'].includes(b.status))
    .sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const awaitingSig=active.filter(b=>b.status==='contract_sent'&&!b.contractSignedAt)
    .sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const awaitingDeposit=active.filter(b=>b.status==='contract_signed')
    .sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const createRoomList=active.filter(b=>b.status==='deposit_paid'&&!(b.blockedRooms||[]).length)
    .sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const sendRoomList=active.filter(b=>b.status==='deposit_paid'&&(b.blockedRooms||[]).length>0)
    .sort((a,b)=>a.startDate.localeCompare(b.startDate));

  // Arriving within 30 days
  const soon=active.filter(b=>b.startDate>=todayStr&&b.startDate<=in30Str)
    .sort((a,b)=>a.startDate.localeCompare(b.startDate));


  // ── BANK TOTALS ──
  const methodLabel={wire:'Wire Transfer',cheque:'Cheque',zelle:'Zelle',venmo:'Venmo',card:'Credit Card',check:'Cheque',cash:'Cash',other:'Other'};
  const bankTotals={wire:0,cheque:0,zelle:0,venmo:0,card:0,other:0};
  let grandTotalReceived=0,grandTotalOutstanding=0;
  AppData.bookings.filter(b=>b.status!=='cancelled').forEach(bk=>{
    (bk.payments||[]).forEach(p=>{bankTotals[p.method]=(bankTotals[p.method]||0)+p.amount;grandTotalReceived+=p.amount;});
    const {balance}=calcBkBalance(bk);
    if(balance>0)grandTotalOutstanding+=balance;
  });
  const bankRows=Object.entries(bankTotals).filter(([,v])=>v>0).map(([k,v])=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f1f5f9">
      <span style="font-size:12.5px;color:#374151">${methodLabel[k]||k}</span>
      <span style="font-size:13px;font-weight:700;color:#16a34a">${fmt$(v)}</span>
    </div>`).join('');
  const bankOverview=grandTotalReceived>0?dbAccordionSection('moneyReceived','💰','Money Received — All Retreats','#15803d','#f0fdf4','#86efac',
    `${fmt$(grandTotalReceived)} total`,
    `<div style="padding:4px 20px 8px">
      ${bankRows}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0 4px">
        <span style="font-size:12px;color:var(--muted)">Outstanding across all active retreats</span>
        <span style="font-size:13px;font-weight:700;color:${grandTotalOutstanding>0?'#dc2626':'#16a34a'}">${grandTotalOutstanding>0?fmt$(grandTotalOutstanding):'All paid ✓'}</span>
      </div>
    </div>`,
    false):'';

  // ── CANCELLATION BANK ──
  const cancelledWithFee=AppData.bookings.filter(b=>b.status==='cancelled'&&b.cancellationFee>0)
    .sort((a,b)=>b.cancelledAt?.localeCompare(a.cancelledAt||'')||0);
  const cancelledNoFee=AppData.bookings.filter(b=>b.status==='cancelled'&&!b.cancellationFee)
    .sort((a,b)=>b.cancelledAt?.localeCompare(a.cancelledAt||'')||0);
  const cancellationBankTotal=cancelledWithFee.reduce((s,b)=>s+(b.cancellationFee||0),0);
  const allCancelled=[...cancelledWithFee,...cancelledNoFee];
  const cancellationBankSection=allCancelled.length>0?`<div class="db-section" style="margin-bottom:20px;border-color:#fca5a5">
    <div class="db-sec-hdr" style="background:#fff1f2;border-color:#fca5a5;display:flex;justify-content:space-between;align-items:center">
      <span class="db-sec-title" style="color:#991b1b">🗂&nbsp; Cancelled Retreats</span>
      <span style="font-size:13px;font-weight:700;color:#991b1b">${cancellationBankTotal>0?`$${cancellationBankTotal.toLocaleString('en-US',{minimumFractionDigits:2})} retained`:''}</span>
    </div>
    <div style="padding:4px 20px 8px">
      ${cancellationBankTotal>0?`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0 8px;border-bottom:2px solid #fecaca;margin-bottom:6px">
        <span style="font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:.4px">Cancellation Bank</span>
        <span style="font-size:15px;font-weight:800;color:#991b1b">$${cancellationBankTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</span>
      </div>`:''}
      ${allCancelled.map(bk=>{
        const fee=bk.cancellationFee||0;
        const paid=bk.depositAtCancellation||0;
        const refund=Math.max(0,paid-fee);
        const cancelDate=bk.cancelledAt?fmtDate(bk.cancelledAt.split('T')[0]):'—';
        return`<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid #fef2f2">
          <div style="flex:1">
            <div style="font-size:13px;font-weight:700;color:#374151">${bk.leaderName||bk.retreatName||'Untitled'}</div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:1px">${bk.retreatName&&bk.leaderName?bk.retreatName+' · ':''}${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px">Cancelled ${cancelDate}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            ${fee>0?`<div style="font-size:13px;font-weight:800;color:#991b1b">$${fee.toLocaleString('en-US',{minimumFractionDigits:2})} retained</div>
            ${refund>0?`<div style="font-size:11px;color:#6b7280">Refund: $${refund.toLocaleString('en-US',{minimumFractionDigits:2})}</div>`:''}
            <div style="font-size:10px;font-weight:700;background:#fecaca;color:#991b1b;border-radius:6px;padding:1px 7px;margin-top:3px;display:inline-block">Within 16 weeks</div>`
            :`<div style="font-size:11px;color:#6b7280">${paid>0?`Refund: $${paid.toLocaleString('en-US',{minimumFractionDigits:2})}`:'No payment'}</div>
            <div style="font-size:10px;font-weight:700;background:#f1f5f9;color:#64748b;border-radius:6px;padding:1px 7px;margin-top:3px;display:inline-block">No fee</div>`}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`:'';

  // ── TEACHER PORTAL ACTIVITY ALERTS ──
  const SIXTY_DAYS=60*24*60*60*1000;
  const portalAlerts=[];
  active.forEach(bk=>{
    if(!bk.roomListSentViaPortal&&!bk.roomListSentAt)return; // room list not sent yet
    if(bk.startDate<todayStr)return; // already started/past
    const sentAt=bk.roomListSentAt?new Date(bk.roomListSentAt):null;
    const lastSeen=bk.teacherLastSeen?new Date(bk.teacherLastSeen):null;
    const sentAge=sentAt?(today-sentAt):null;
    const seenAge=lastSeen?(today-lastSeen):null;
    // Never opened after room list sent 2+ months ago
    if(sentAge&&sentAge>=SIXTY_DAYS&&!lastSeen){
      portalAlerts.push({bk,type:'never_opened',sentAt,lastSeen:null,sentAge});
    }
    // Opened but not in 2+ months
    else if(lastSeen&&seenAge>=SIXTY_DAYS){
      portalAlerts.push({bk,type:'inactive',sentAt,lastSeen,seenAge});
    }
  });
  const portalAlertSection=portalAlerts.length>0?`<div class="db-section" style="margin-bottom:20px;border-color:#fbbf24">
    <div class="db-sec-hdr" style="background:#fffbeb;border-color:#fcd34d;display:flex;justify-content:space-between;align-items:center">
      <span class="db-sec-title" style="color:#92400e">👁&nbsp; Teacher Portal Activity</span>
      <span style="font-size:11px;font-weight:700;background:#fcd34d;color:#78350f;border-radius:99px;padding:2px 10px">${portalAlerts.length} alert${portalAlerts.length!==1?'s':''}</span>
    </div>
    <div style="padding:4px 20px 8px">
      ${portalAlerts.map(({bk,type,sentAt,lastSeen})=>{
        const monthsAgo=lastSeen?Math.floor((today-lastSeen)/(30*24*60*60*1000)):null;
        const sentMonths=sentAt?Math.floor((today-sentAt)/(30*24*60*60*1000)):null;
        const msg=type==='never_opened'
          ?`Room list sent <strong>${sentMonths} month${sentMonths!==1?'s':''} ago</strong> — portal has <strong style="color:#dc2626">never been opened</strong>`
          :`Last opened <strong>${monthsAgo} month${monthsAgo!==1?'s':''} ago</strong> — portal inactive`;
        return`<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #fef3c7">
          <div style="width:32px;height:32px;border-radius:50%;background:${type==='never_opened'?'#fef2f2':'#fffbeb'};border:1.5px solid ${type==='never_opened'?'#fca5a5':'#fcd34d'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px">${type==='never_opened'?'✕':'⏱'}</div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:700;color:#374151">${bk.leaderName||bk.retreatName}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:1px">${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)} · ${msg}</div>
          </div>
          <button onclick="venBuild();switchTab('venues',document.querySelector('.tab-btn[onclick*=venues]'));setTimeout(()=>openVenEdit('${bk.id}'),120)" style="font-size:11px;font-weight:600;padding:5px 12px;border:1.5px solid #d97706;border-radius:7px;background:#fff;color:#d97706;cursor:pointer;white-space:nowrap;font-family:'Jost',sans-serif">View Retreat</button>
        </div>`;
      }).join('')}
    </div>
  </div>`:'';

  // ── GUEST INSIGHTS ──
  let totalGuests=0,returningCount=0,newCount=0,totalYears=0,yearsCount=0;
  AppData.regs.forEach(reg=>{
    const bk=AppData.bookings.find(b=>b.id===reg.bookingId);
    if(!bk||bk.status==='cancelled')return;
    (reg.guests||[]).filter(g=>g.name).forEach(g=>{
      totalGuests++;
      if(g.returning){returningCount++;if(g.yearsAttending){totalYears+=g.yearsAttending;yearsCount++;}}
      else newCount++;
    });
  });
  const retPct=totalGuests>0?Math.round(returningCount/totalGuests*100):0;
  const avgYrs=yearsCount>0?(totalYears/yearsCount).toFixed(1):'—';
  // Rebook rate: leaders who appear in 2+ bookings
  const leaderCounts={};AppData.bookings.filter(b=>b.status!=='cancelled').forEach(b=>{const k=(b.leaderName||'').trim().toLowerCase();if(k){leaderCounts[k]=(leaderCounts[k]||0)+1;}});
  const totalLeaders=Object.keys(leaderCounts).length;
  const rebookedLeaders=Object.values(leaderCounts).filter(c=>c>1).length;
  const rebookPct=totalLeaders>0?Math.round(rebookedLeaders/totalLeaders*100):0;

  // ── INVOICE DEADLINE ALERTS ──
  const invoiceAlerts=[],overdueAlerts=[];
  active.forEach(bk=>{
    const daysOut=Math.round((pd(bk.startDate)-today)/DAY_MS);
    if(daysOut<0)return;
    const {balance}=calcBkBalance(bk);
    if(daysOut<=49&&daysOut>35&&!adminDone[bk.id+'_invoice']){
      invoiceAlerts.push({bk,daysOut});
    }
    if(daysOut<=35&&balance>0&&!adminDone[bk.id+'_invoiceOverdue']){
      overdueAlerts.push({bk,daysOut,balance});
    }
  });

  // ── STAT CARDS ──
  // Transport coverage across retreats arriving within 30 days
  const transportTotals=soon.reduce((acc,bk)=>{
    const ros=(typeof getTransportRoster==='function')?getTransportRoster(bk.id):null;
    if(ros){acc.have+=ros.submittedCount;acc.total+=ros.roster.length;}
    return acc;
  },{have:0,total:0});
  const transportColor=transportTotals.total===0?'#6b7280':transportTotals.have>=transportTotals.total?'#16a34a':transportTotals.have===0?'#dc2626':'#d97706';
  const transportVal=transportTotals.total?`${transportTotals.have}/${transportTotals.total}`:'—';
  // Per-retreat breakdown for the same 30-day window, so it's a quick glance
  // list rather than just one combined number.
  const transportListRows=soon.map(bk=>{
    const ros=(typeof getTransportRoster==='function')?getTransportRoster(bk.id):null;
    if(!ros)return'';
    const have=ros.submittedCount,total=ros.roster.length;
    const color=trCompletionColor(have,total);
    return`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 16px;border-bottom:1px solid #f0ece4">
      <span style="font-size:12.5px;font-weight:600;color:var(--dark)">${bk.leaderName||bk.retreatName||'Untitled Retreat'}</span>
      <span style="font-size:12.5px;font-weight:800;color:${color}">${total?have+'/'+total:'—'} filled out</span>
    </div>`;
  }).join('');
  const transportListSection=soon.length?dbAccordionSection('transport30','🚐','Transport — Next 30 Days','#0e7490','#ecfeff','#67e8f9',
    `${soon.length} retreat${soon.length!==1?'s':''}`,
    transportListRows,
    false):'';
  const statGrid=`<div class="db-stat-grid">
    ${dbStat('Active Retreats',active.length,'#2d6a6a','<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>')}
    ${dbStat('Arriving in 30 Days',soon.length,'#0891b2','<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>')}
    ${dbStat('Transport (30 Days)',transportVal,transportColor,'<path d="M3 17h2l1.5-4.5A2 2 0 0 1 8.4 11h7.2a2 2 0 0 1 1.9 1.5L19 17h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5 17V9a2 2 0 0 1 2-2h6l4 4v6"/>')}
    ${dbStat('Payments Pending',depositPending.length+finalBalancePending.length,depositPending.length?'#991b1b':finalBalancePending.length?'#92400e':'#16a34a','<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>')}
    ${dbStat('Total Received',fmt$(grandTotalReceived),'#15803d','<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>')}
  </div>
  <div class="db-insights-bar">
    <div class="db-insight">
      <div class="db-insight-icon" style="background:#eff6ff"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg></div>
      <div class="db-insight-body"><div class="db-insight-val" style="color:#3b82f6">${newCount}</div><div class="db-insight-lbl">New Guests</div></div>
    </div>
    <div class="db-insight">
      <div class="db-insight-icon" style="background:#f0fdf4"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg></div>
      <div class="db-insight-body"><div class="db-insight-val" style="color:#16a34a">${returningCount}<span style="font-size:13px;font-weight:500;color:var(--muted);margin-left:4px">${totalGuests?'('+retPct+'%)':''}</span></div><div class="db-insight-lbl">Returning Guests</div></div>
    </div>
    <div class="db-insight">
      <div class="db-insight-icon" style="background:#faf5ff"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
      <div class="db-insight-body"><div class="db-insight-val" style="color:#7c3aed">${avgYrs}<span style="font-size:12px;font-weight:500;color:var(--muted);margin-left:3px">${avgYrs!=='—'?'yrs':''}</span></div><div class="db-insight-lbl">Avg Years Returning</div></div>
    </div>
    <div class="db-insight">
      <div class="db-insight-icon" style="background:#fff7ed"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>
      <div class="db-insight-body"><div class="db-insight-val" style="color:#ea580c">${rebookPct}%<span style="font-size:11px;font-weight:500;color:var(--muted);margin-left:4px">${rebookedLeaders}/${totalLeaders}</span></div><div class="db-insight-lbl">Leader Rebook Rate</div></div>
    </div>
  </div>`;

  // ── PIPELINE ──
  const allActive=active.slice().sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const pipeline=buildPipelineSection(allActive,today);

  // ── ACCORDION SECTIONS ── Deposit Pending / Final Balance Pending / Schedule
  // Confirmation Pending. Early-lead stages (soft hold, contract follow-up,
  // deposit reminders) moved to the Sales Pipeline (CRM) and are no longer
  // duplicated here.
  const dbItemRow=(bk,rightHtml,onclick)=>`<div class="db-alert-item" onclick="${onclick}" style="cursor:pointer">
    <span style="font-weight:600;font-size:13px">${bk.leaderName||bk.retreatName||'Unnamed'}</span>
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:12px;color:var(--muted)">${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}</span>
      ${rightHtml}
    </div>
  </div>`;
  let alerts=dbAccordionSection('overdueBalances','🔴','Overdue Balances','#7f1d1d','#fef2f2','#f87171',
    `${overdueBalances.length} retreat${overdueBalances.length!==1?'s':''} · ${fmt$(overdueBalancesTotal)}`,
    overdueBalances.length?overdueBalances.map(x=>dbItemRow(x.bk,`<span style="font-weight:700;color:#7f1d1d">${fmt$(x.balance)}</span><span style="font-size:10.5px;font-weight:700;background:#fecaca;color:#7f1d1d;border-radius:5px;padding:1px 7px">${x.daysOverdue}d overdue</span>`,`openPaymentModal('${x.bk.id}')`)).join(''):'<div style="padding:12px 16px;color:var(--muted);font-size:12.5px;font-style:italic">Nothing overdue.</div>',
    true)
  +dbAccordionSection('depositPending','💰','Deposit Pending','#991b1b','#fff5f5','#fca5a5',
    `${depositPending.length} retreat${depositPending.length!==1?'s':''} · ${fmt$(depositPendingTotal)}`,
    depositPending.length?depositPending.map(x=>dbItemRow(x.bk,`<span style="font-weight:700;color:#991b1b">${fmt$(x.balance)}</span>`,`openPaymentModal('${x.bk.id}')`)).join(''):'<div style="padding:12px 16px;color:var(--muted);font-size:12.5px;font-style:italic">Nothing pending.</div>',
    true)
  +dbAccordionSection('finalBalancePending','💵','Final Balance Pending','#92400e','#fff7ed','#fdba74',
    `${finalBalancePending.length} retreat${finalBalancePending.length!==1?'s':''} · ${fmt$(finalBalancePendingTotal)}`,
    finalBalancePending.length?finalBalancePending.map(x=>dbItemRow(x.bk,`<span style="font-weight:700;color:#92400e">${fmt$(x.balance)}</span>`,`openPaymentModal('${x.bk.id}')`)).join(''):'<div style="padding:12px 16px;color:var(--muted);font-size:12.5px;font-style:italic">Nothing pending.</div>',
    false)
  +dbAccordionSection('scheduleConfirmPending','📋','Schedule Confirmation Pending','#059669','#ecfdf5','#6ee7b7',
    `${scheduleConfirmPending.length} retreat${scheduleConfirmPending.length!==1?'s':''}`,
    scheduleConfirmPending.length?scheduleConfirmPending.map(bk=>{
      const isChanges=bk.scheduleRequest.adminStatus==='changes';
      return dbItemRow(bk,`<span style="padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;background:${isChanges?'#fef3c7':'#d1fae5'};color:${isChanges?'#92400e':'#065f46'}">${isChanges?'Changes Requested':'Awaiting Review'}</span>`,`openScheduleViewer('${bk.id}')`);
    }).join(''):'<div style="padding:12px 16px;color:var(--muted);font-size:12.5px;font-style:italic">Nothing pending.</div>',
    false);

  const noActiveMsg=!allActive.length?`<div style="text-align:center;padding:64px 20px">
    <div style="font-size:48px;margin-bottom:14px">✓</div>
    <div style="font-size:17px;font-weight:600;color:var(--dark)">All clear!</div>
    <div style="font-size:13px;color:var(--muted);margin-top:6px">No active retreats to show.</div>
  </div>`:'';
  // alerts (Deposit/Final Balance/Schedule Confirmation Pending) renders at
  // the very top of the Dashboard — Darlene's priority section — separately
  // from pipeline, which stays further down. Special Events dashboard card
  // removed 2026-09-03 per Darlene ("old feature, not needed") — the Special
  // Events tab/module itself is untouched, just no longer summarized here.
  const sections=pipeline+(allActive.length?'':noActiveMsg);

  // ── ACTIVITY NOTIFICATIONS ── (ported from staging's dashboard.js — see comment
  // above computeActivityNotifs() in this file for exactly what matches/doesn't)
  const actvSection=renderActvNotifPanel(computeActivityNotifs());

  // ── INQUIRY NOTIFICATIONS ──
  const seen=getSeenInquiries();
  const newInquiries=AppData.bookings.filter(b=>b.source==='inquiry'&&!seen.has(b.id))
    .sort((a,b)=>(b.submittedAt||'').localeCompare(a.submittedAt||''));
  updateInquiryDot();
  let inquirySection='';
  if(newInquiries.length){
    inquirySection=`<div style="background:#fff;border:1.5px solid #fbbf24;border-radius:14px;overflow:hidden;margin-bottom:22px;box-shadow:0 2px 8px rgba(251,191,36,.15)">
      <div style="padding:13px 20px;display:flex;align-items:center;gap:10px;background:#fffbeb;border-bottom:1px solid #fde68a">
        <span style="font-size:1.1rem">📬</span>
        <span style="font-size:13px;font-weight:700;color:#92400e;flex:1">${newInquiries.length} New Retreat Inquir${newInquiries.length>1?'ies':'y'}</span>
        <button onclick="dismissAllInquiries()" style="padding:4px 12px;background:transparent;border:1px solid #d97706;border-radius:6px;font-family:inherit;font-size:11.5px;font-weight:600;color:#b45309;cursor:pointer">Dismiss all</button>
      </div>
      ${newInquiries.map(bk=>{
        // Check for conflicts with existing confirmed bookings on same row
        const conflicts=AppData.bookings.filter(o=>
          o.id!==bk.id&&o.source!=='inquiry'&&o.status!=='cancelled'&&
          bk.startDate&&bk.endDate&&datesOverlap(bk.startDate,bk.endDate,o.startDate,o.endDate)
        );
        const conflictHtml=conflicts.length
          ?`<div style="font-size:11px;color:#dc2626;margin-top:4px;font-weight:600">⚠ Overlaps with: ${conflicts.map(o=>o.leaderName||o.retreatName).join(', ')}</div>`
          :bk.startDate?`<div style="font-size:11px;color:#16a34a;margin-top:4px;font-weight:600">✓ Dates look available</div>`:'';
        return`<div style="padding:13px 20px;border-bottom:1px solid #fef3c7;display:flex;align-items:flex-start;gap:12px;cursor:pointer" onclick="dismissInquiry('${bk.id}')">
          <div style="flex:1">
            <div style="font-size:13.5px;font-weight:700;color:var(--dark)">${bk.leaderName||'Unnamed'}</div>
            <div style="font-size:12px;color:#92400e;margin-top:2px">${bk.retreatType||'Retreat'} · ${bk.pax||0} guests${bk.startDate?' · '+fmtDate(bk.startDate)+(bk.endDate?' – '+fmtDate(bk.endDate):''):' · Dates TBD'}</div>
            <div style="font-size:11.5px;color:#b45309;margin-top:2px">${bk.leaderEmail||''}</div>
            ${conflictHtml}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#d97706;background:#fef3c7;padding:2px 7px;border-radius:20px">New Inquiry</span>
            <button onclick="event.stopPropagation();openInquiryInVenues('${bk.id}')" style="font-size:10.5px;color:var(--teal,#2d6a6a);background:none;border:none;cursor:pointer;font-family:inherit;padding:0;font-weight:600">Open →</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  el.innerHTML=`
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:600;color:var(--dark);margin:0">Dashboard</h2>
      <span style="font-size:12px;color:var(--muted);flex:1">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</span>
      <button onclick="loadFromSupabase().then(()=>{buildDashboard();showToast('Dashboard refreshed from cloud');})" style="padding:5px 13px;font-size:12px;font-weight:600;color:#2d6a6a;background:#fff;border:1.5px solid #2d6a6a;border-radius:7px;cursor:pointer;font-family:inherit">↻ Refresh</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
      <button onclick="dbGoToConfirmations('tour')" style="padding:9px 16px;font-size:12.5px;font-weight:700;color:#fff;background:#d97706;border:none;border-radius:9px;cursor:pointer;font-family:inherit">🚐 Tour Confirmations</button>
      <button onclick="dbGoToConfirmations('spa')" style="padding:9px 16px;font-size:12.5px;font-weight:700;color:#fff;background:#7c3aed;border:none;border-radius:9px;cursor:pointer;font-family:inherit">💆 Massage / Spa Confirmations</button>
      <button onclick="dbGoToConfirmations('bbc')" style="padding:9px 16px;font-size:12.5px;font-weight:700;color:#fff;background:#0e9494;border:none;border-radius:9px;cursor:pointer;font-family:inherit">🏋 Bikini Bootcamp Confirmations</button>
    </div>
    ${alerts}
    ${dbCrmSectionHtml()}
    ${actvSection}
    ${inquirySection}
    ${statGrid}
    ${transportListSection}
    ${bankOverview}
    ${cancellationBankSection}
    ${portalAlertSection}
    ${sections}`;
}

function dbStat(label,value,color,iconPath){
  return `<div class="db-stat-card">
    <div class="db-stat-top">
      <span class="db-stat-lbl">${label}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">${iconPath}</svg>
    </div>
    <div class="db-stat-val" style="color:${color}">${value}</div>
  </div>`;
}

function dbSection(title,bg,accent,border,count,itemsHtml){
  return `<div class="db-section" style="border-color:${border}">
    <div class="db-sec-hdr" style="background:${bg};border-color:${border}">
      <span class="db-sec-title" style="color:${accent}">${title}</span>
      <span class="db-sec-badge" style="background:${accent};color:#fff">${count}</span>
    </div>
    ${itemsHtml}
  </div>`;
}

function dbGoVenues(bkId){
  // no longer navigates away — open payment modal as a useful default
  openPaymentModal(bkId);
}
function dbGoReg(bkId){
  const btn=document.querySelector('.tab-btn[onclick*="teacherreg"]');
  switchTab('teacherreg',btn);
  setTimeout(()=>{
    const sel=document.getElementById('regRetreatSel');
    if(sel){sel.value=bkId;regOnRetreat();}
    setTimeout(()=>openBlockModal(bkId),150);
  },100);
}

