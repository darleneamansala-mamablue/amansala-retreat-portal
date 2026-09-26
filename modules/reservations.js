// ===== RESERVATIONS — Arrivals / In House / Departures / Search / Create =====
// Jorge's ask 2026-09-26: a unified front-desk dashboard the portal never had,
// ported from a separate, disconnected "staging" rewrite (js/modules/reservations.js,
// recovered from an old Netlify deploy with no git history) and adapted to this
// app's actual conventions -- no live Supabase re-query per render (AppData.regs/
// AppData.bookings/AppData.roomTypes are already loaded), and reusing the folio/
// check-in system already built into modules/booking-detail.js instead of
// reimplementing it.
//
// Two kinds of guest, unified into one dashboard:
// - "group": any registrations row (retreat guests AND Room Only bookings both
//   get one, per the 2026-09-25 fix) -- read straight from AppData.regs/AppData.bookings.
// - "individual": a paid Booking Engine reservation (`booking_requests`, no
//   registrations row at all -- see booking-engine-admin.js). Not part of
//   AppData, so fetched here and cached locally; resRefresh() re-fetches.
let _resTab='arrivals';
let _resRequests=[];
let _resRequestsLoaded=false;
let _resArrDate=fmtISO(new Date());
let _resDepDate=fmtISO(new Date());
let _resAuditDate=fmtISO(new Date());

const _RES_TAB_ACT='background:#fff;border:1px solid var(--border);border-bottom:1px solid #fff;padding:8px 18px;border-radius:8px 8px 0 0;font-size:13px;font-weight:700;color:var(--dark);cursor:pointer;font-family:\'Jost\',sans-serif;margin-bottom:-1px';
const _RES_TAB_INA='background:transparent;border:none;padding:8px 18px;border-radius:8px 8px 0 0;font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;font-family:\'Jost\',sans-serif';

async function resInit(){
  const root=document.getElementById('resRoot');if(!root)return;
  root.innerHTML=`
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div style="background:#fff;border-bottom:1px solid var(--border);padding:14px 20px 0;flex-shrink:0">
        <div style="display:flex;align-items:flex-end;gap:0;flex-wrap:wrap">
          <h2 style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600;color:var(--dark);margin:0 20px 10px 0">Reservations</h2>
          <button id="res-tab-arrivals"   onclick="resSetTab('arrivals')"   style="${_RES_TAB_ACT}">Arrivals</button>
          <button id="res-tab-inhotel"    onclick="resSetTab('inhotel')"    style="${_RES_TAB_INA}">In House</button>
          <button id="res-tab-departures" onclick="resSetTab('departures')" style="${_RES_TAB_INA}">Departures</button>
          <button id="res-tab-search"     onclick="resSetTab('search')"     style="${_RES_TAB_INA}">Advanced Search</button>
        </div>
      </div>
      <div id="res-body" style="flex:1;overflow-y:auto;padding:20px"></div>
    </div>`;
  if(!_resRequestsLoaded){
    await _resFetchRequests();
    _resRequestsLoaded=true;
  }
  _resRender();
}

// Called by booking-detail.js after a booking_requests check-in/out/notes/
// cancel, since that data isn't part of AppData and this page keeps its own
// cached copy -- re-fetches only if this tab is actually the one showing.
async function resRefresh(){
  if(!document.getElementById('tab-reservations')?.classList.contains('active'))return;
  await _resFetchRequests();
  _resRender();
}

async function _resFetchRequests(){
  try{
    const {data,error}=await db.from('booking_requests').select('*').order('check_in',{ascending:true});
    if(error)throw error;
    _resRequests=(data||[]).map(_bdReqSqlToApp);
  }catch(e){
    console.warn('[reservations] load booking_requests',e.message);
    _resRequests=[];
  }
}

function resSetTab(t){
  _resTab=t;
  ['arrivals','inhotel','departures','search'].forEach(id=>{
    document.getElementById('res-tab-'+id)?.setAttribute('style',t===id?_RES_TAB_ACT:_RES_TAB_INA);
  });
  _resRender();
}

async function _resRender(){
  const body=document.getElementById('res-body');if(!body)return;
  const mySeq=++_resRenderSeq;
  if(_resTab==='inhotel'||_resTab==='arrivals'||_resTab==='departures')body.innerHTML=`<div style="padding:60px 20px;text-align:center;color:var(--muted);font-size:13px">Loading…</div>`;
  let html;
  if(_resTab==='inhotel') html=await _resBuildInHotelView();
  else if(_resTab==='arrivals') html=await _resBuildMovementView('arrivals');
  else if(_resTab==='departures') html=await _resBuildMovementView('departures');
  else{body.innerHTML=_resBuildSearchView();return;}
  if(mySeq!==_resRenderSeq)return; // superseded by a newer render (tab switched mid-fetch)
  body.innerHTML=html;
}
let _resRenderSeq=0;

// ─── SHARED ROW BUILDERS ──────────────────────────────────────
// One row per named guest across every active registrations row (retreat +
// Room Only) -- mirrors getRoomRate's own gc/nights inputs so the rate shown
// here always matches what Balance Due/the folio actually charges.
// Same single-bed room types as the Room Calendar (modules/venues.js) --
// Jorge's ask 2026-09-26: these should be ONE row combining every sharing
// guest's name, not one row per guest (unlike "Bed in a ___" types, where
// each lettered code is already its own separately-booked bed/guest).
// Check-in/out is already tracked on the registration, not per guest, so a
// combined row's action correctly applies to everyone sharing it.
const _RES_ONE_BED_RT_IDS=['rt1','rt2','rt3','rt4','rt5'];
function _resGroupRows(){
  const out=[];
  AppData.regs.forEach(reg=>{
    const bk=AppData.bookings.find(b=>b.id===reg.bookingId);
    if(!bk||bk.status==='cancelled')return;
    const named=(reg.guests||[]).filter(g=>g.name&&!g.cancelled);
    if(!named.length)return;
    const checkIn=reg.checkIn||bk.startDate,checkOut=reg.checkOut||bk.endDate;
    if(!checkIn||!checkOut)return;
    const rt=AppData.roomTypes.find(r=>(r.rooms||[]).includes(reg.room));
    const gc=named.length;
    const nights=Math.max(1,Math.round((pd(checkOut)-pd(checkIn))/DAY_MS));
    const rate=reg.customRateOverride!=null?Number(reg.customRateOverride):(rt?getRoomRate(rt,gc,checkIn,nights):null);
    const base={
      room:reg.room||'—',roomType:rt?.name||'—',checkIn,checkOut,rate,
      notes:reg.notes||'',source:bk.leaderName||bk.retreatName||'Group',
      type:'group',id:reg.id,checkedInAt:reg.checkedInAt||null,checkedOutAt:reg.checkedOutAt||null,
      cardOnFile:!!reg.stripePaymentMethodId,balance:null,
      discountCode:null, // no discount-code concept for retreat/Room Only regs
      // Whole-room cancel (Booking Detail's "Cancel" button, Jorge's ask
      // 2026-09-26) -- excluded from Arrivals/In House/Departures below, but
      // still shown (tagged) in Advanced Search so it's a findable record.
      cancelled:!!reg.cancelled,
    };
    if(named.length>1&&rt&&_RES_ONE_BED_RT_IDS.includes(rt.id)){
      out.push({...base,name:_joinNames(named.map(g=>g.name)),guestNames:named.map(g=>g.name),notes:reg.notes||named.map(g=>g.notes).filter(Boolean).join(' / ')});
    }else{
      named.forEach(g=>out.push({...base,name:g.name,guestNames:[g.name],notes:reg.notes||g.notes||''}));
    }
  });
  return out;
}
function _resIndivRows(){
  return _resRequests
    .filter(r=>r.status!=='declined')
    .map(r=>{
      const rt=AppData.roomTypes.find(t=>t.id===r.roomTypeId||t.name===r.roomTypeName);
      const rate=r.dailyRate!=null?Number(r.dailyRate):(rt?roomOnlyRateForDate(rt,r.checkIn):null);
      return {
        name:`${r.firstName||''} ${r.lastName||''}`.trim()||'Guest',room:r.room||r.roomTypeName||'—',
        roomType:rt?.name||r.roomTypeName||'—',
        checkIn:r.checkIn,checkOut:r.checkOut,rate,notes:r.notes||r.dietary||'',
        source:r.source||'Booking Engine',type:'individual',id:r.id,status:r.status,
        checkedInAt:r.checkedInAt||null,checkedOutAt:r.checkedOutAt||null,
        cardOnFile:false, // Card on File isn't wired up for Booking Engine reservations yet
        balance:null,discountCode:r.discountCode||null,
      };
    });
}
function _resOpenRowAt(i){
  const r=_resLastRows[i];if(!r)return;
  if(r.type==='individual')openBookingDetailForRequest(r.id);
  // A merged single-bed-room row opens the first sharing guest's own folio --
  // each guest still has their own separate folio underneath (booking-detail.js
  // itself now also lists every sharing guest in its Guest panel).
  else openBookingDetailForReg(r.id,(r.guestNames||[r.name])[0]);
}

// Per-guest folio balance -- deliberately NOT calcBkBalance() (the retreat's
// shared master bill). Each guest has their own folio (registration_id +
// guest_name, or booking_request_id for individual reservations), same
// tables/scoping modules/booking-detail.js's Rate and Folios uses -- Jorge's
// correction 2026-09-26: "esas reservas deben de tener un folio para el
// cargo de cada persona, no deben de compartir el mismo balance." Mutates
// each row's .balance in place; one bulk fetch for the whole visible list
// instead of one round trip per guest.
async function _resAttachFolioBalances(rows){
  const regIds=[...new Set(rows.filter(r=>r.type==='group').map(r=>r.id))];
  const reqIds=[...new Set(rows.filter(r=>r.type==='individual').map(r=>r.id))];
  if(!regIds.length&&!reqIds.length)return;
  try{
    const [regRes,reqRes]=await Promise.all([
      regIds.length?db.from('folios').select('id,registration_id,booking_request_id,guest_name,status').in('registration_id',regIds):Promise.resolve({data:[]}),
      reqIds.length?db.from('folios').select('id,registration_id,booking_request_id,guest_name,status').in('booking_request_id',reqIds):Promise.resolve({data:[]}),
    ]);
    if(regRes.error)throw regRes.error;
    if(reqRes.error)throw reqRes.error;
    const folios=[...(regRes.data||[]),...(reqRes.data||[])];
    rows.forEach(r=>{r.balance=0;});
    if(!folios||!folios.length)return;
    const openFolios=folios.filter(f=>f.status==='open');
    if(!openFolios.length)return;
    const folioIds=openFolios.map(f=>f.id);
    const {data:items,error:iErr}=await db.from('folio_items').select('folio_id,qty,unit_price,tax_rate').in('folio_id',folioIds);
    if(iErr)throw iErr;
    const totalByFolio={};
    (items||[]).forEach(i=>{totalByFolio[i.folio_id]=(totalByFolio[i.folio_id]||0)+Number(i.qty)*Number(i.unit_price)*(1+(Number(i.tax_rate)||0)/100);});
    const balanceByKey={};
    openFolios.forEach(f=>{
      const key=`${f.registration_id||''}:${f.booking_request_id||''}:${f.guest_name}`;
      balanceByKey[key]=(balanceByKey[key]||0)+(totalByFolio[f.id]||0);
    });
    rows.forEach(r=>{
      // A merged row (2+ names sharing one single-bed room) sums every
      // sharing guest's own folio -- each still has their own separate one.
      const names=r.type==='group'?(r.guestNames||[r.name]):[r.name];
      let sum=null;
      names.forEach(n=>{
        const key=r.type==='group'?`${r.id}::${n}`:`:${r.id}:${n}`;
        if(balanceByKey[key]!=null)sum=(sum||0)+balanceByKey[key];
      });
      if(sum!=null)r.balance=+sum.toFixed(2);
    });
  }catch(e){
    console.warn('[reservations] folio balances',e.message);
    rows.forEach(r=>{if(r.balance==null)r.balance=null;});
  }
}
async function resCheckIn(type,id){
  if(type==='individual'){
    const r=_resRequests.find(x=>x.id===id);if(!r)return;
    const now=new Date().toISOString();
    const {error}=await db.from('booking_requests').update({checked_in_at:now,status:'in_house'}).eq('id',id);
    if(error){showToast('Error: '+error.message);return;}
    r.checkedInAt=now;r.status='in_house';
  }else{
    const reg=AppData.regs.find(x=>x.id===id);if(!reg)return;
    const now=new Date().toISOString();
    const {error}=await db.from('registrations').update({checked_in_at:now}).eq('id',id);
    if(error){showToast('Error: '+error.message);return;}
    reg.checkedInAt=now;
  }
  showToast('Checked in ✓');
  _resRender();
  if(typeof hkInit==='function'&&document.getElementById('tab-housekeeping')?.classList.contains('active'))hkInit();
}
async function resCheckOut(type,id){
  if(type==='individual'){
    const r=_resRequests.find(x=>x.id===id);if(!r)return;
    if(!confirm(`Check out ${r.firstName||''} ${r.lastName||''} from ${r.room||r.roomTypeName||'this room'}?`))return;
    const now=new Date().toISOString();
    const {error}=await db.from('booking_requests').update({checked_out_at:now,status:'checked_out'}).eq('id',id);
    if(error){showToast('Error: '+error.message);return;}
    r.checkedOutAt=now;r.status='checked_out';
  }else{
    const reg=AppData.regs.find(x=>x.id===id);if(!reg)return;
    if(reg.checkedInAt&&Date.now()-new Date(reg.checkedInAt).getTime()<5000)return;
    const names=(reg.guests||[]).map(g=>g.name).filter(Boolean).join(' & ');
    if(!confirm(`Check out ${names||'this guest'} from room ${reg.room}?`))return;
    const now=new Date().toISOString();
    const {error}=await db.from('registrations').update({checked_out_at:now}).eq('id',id);
    if(error){showToast('Error: '+error.message);return;}
    reg.checkedOutAt=now;
  }
  showToast('Checked out ✓');
  _resRender();
  if(typeof hkInit==='function'&&document.getElementById('tab-housekeeping')?.classList.contains('active'))hkInit();
}

// ─── NIGHT AUDIT OCCUPANCY PANEL ──────────────────────────────
function _resBuildOccupancyPanel(date){
  const occRooms=new Set();
  AppData.regs.forEach(reg=>{
    const bk=AppData.bookings.find(b=>b.id===reg.bookingId);if(!bk||bk.status==='cancelled')return;
    const ci=reg.checkIn||bk.startDate,co=reg.checkOut||bk.endDate;
    if(!ci||!co||ci>date||co<=date)return;
    if(reg.room)occRooms.add(reg.room);
  });
  _resRequests.forEach(r=>{
    if(r.status==='declined'||r.status==='checked_out')return;
    if(!r.checkIn||!r.checkOut||r.checkIn>date||r.checkOut<=date)return;
    if(r.room)occRooms.add(r.room);
  });
  let totalRooms=0,totalOcc=0;
  const byType=AppData.roomTypes.filter(rt=>(rt.rooms||[]).length>0).map(rt=>{
    const rooms=rt.rooms||[];const occ=rooms.filter(r=>occRooms.has(r)).length;
    totalRooms+=rooms.length;totalOcc+=occ;
    return{name:rt.name,color:rt.color||'#6b7280',total:rooms.length,occ};
  });
  const pct=totalRooms>0?Math.round(totalOcc/totalRooms*100):0;
  const pctColor=pct>=80?'#16a34a':pct>=50?'#d97706':'#6b7280';
  const typeRows=byType.map(t=>{
    const tPct=t.total>0?Math.round(t.occ/t.total*100):0;
    return `<div style="display:flex;align-items:center;gap:8px">
      <div style="width:9px;height:9px;border-radius:50%;background:${t.color};flex-shrink:0"></div>
      <span style="font-size:12px;color:var(--text);min-width:130px">${escHtml(t.name)}</span>
      <div style="flex:1;height:5px;background:#f1f5f9;border-radius:3px;overflow:hidden;min-width:80px">
        <div style="height:5px;background:${t.color};border-radius:3px;width:${tPct}%"></div>
      </div>
      <span style="font-size:12px;font-weight:600;color:var(--text);min-width:36px;text-align:right">${t.occ}/${t.total}</span>
    </div>`;
  }).join('');
  return `<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:18px">
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:${byType.length?12:0}px">
      <span style="font-size:13px;font-weight:700;color:var(--dark)">Night Audit</span>
      <input type="date" value="${date}" onchange="resSetAuditDate(this.value)" style="border:1.5px solid var(--border);border-radius:7px;padding:4px 9px;font-size:12px;font-family:'Jost',sans-serif;outline:none;color:var(--text)">
      <span style="font-size:24px;font-weight:700;color:${pctColor}">${pct}%</span>
      <span style="font-size:13px;color:var(--muted)">${totalOcc} of ${totalRooms} rooms occupied</span>
      <div style="flex:1;height:7px;background:#f1f5f9;border-radius:4px;overflow:hidden;min-width:100px">
        <div style="height:7px;background:${pctColor};border-radius:4px;width:${pct}%"></div>
      </div>
    </div>
    ${byType.length?`<div style="display:flex;flex-direction:column;gap:6px">${typeRows}</div>`:''}
  </div>`;
}
function resSetAuditDate(d){_resAuditDate=d;if(_resTab==='inhotel')_resRender();}

// Same room ordering the Rooms tab uses (modules/venues.js's Room Calendar):
// AppData.roomTypes' own order for the type section, then each room type's
// own `rooms` array order within it -- not alphabetical (e.g. room "35"
// sorts before "6a" alphabetically, which is never what Rooms shows).
function _resRoomSortKey(room){
  if(!room)return[9999,9999];
  for(let ti=0;ti<AppData.roomTypes.length;ti++){
    const idx=(AppData.roomTypes[ti].rooms||[]).indexOf(room);
    if(idx!==-1)return[ti,idx];
  }
  return[9999,9999];
}
// Jorge's ask 2026-09-26: group multiple sources (retreats) together, room-
// ordered within each group, instead of interleaving different retreats.
function _resSortRows(rows){
  rows.sort((a,b)=>{
    const sc=(a.source||'').localeCompare(b.source||'');
    if(sc!==0)return sc;
    const ka=_resRoomSortKey(a.room),kb=_resRoomSortKey(b.room);
    return ka[0]!==kb[0]?ka[0]-kb[0]:ka[1]-kb[1];
  });
  return rows;
}

// ─── IN HOTEL ─────────────────────────────────────────────────
async function _resBuildInHotelView(){
  const d=_resAuditDate;
  // "In House" means actually checked in, not just "today falls within their
  // stay dates" -- a guest who hasn't been checked in yet belongs on Arrivals
  // with a Check In button, not here (Jorge's ask 2026-09-26).
  const rows=_resSortRows([
    ..._resGroupRows().filter(r=>!r.cancelled&&r.checkIn<=d&&r.checkOut>d&&r.checkedInAt&&!r.checkedOutAt),
    ..._resIndivRows().filter(r=>r.checkIn<=d&&r.checkOut>d&&r.checkedInAt&&r.status!=='checked_out'),
  ]);
  await _resAttachFolioBalances(rows);

  return `<div style="max-width:1000px;margin:0 auto">
    ${_resBuildOccupancyPanel(d)}
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
      <span style="font-size:14px;font-weight:700;color:#1d4ed8">In House</span>
      <span style="background:#dbeafe;color:#1d4ed8;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px">${rows.length} guest${rows.length!==1?'s':''}</span>
      <span style="font-size:12px;color:var(--muted)">${fmtDate(d)}</span>
    </div>
    ${rows.length===0?_resEmptyState('🏨','No guests in hotel today'):_resTable(rows,{checkInCol:true,checkOutCol:true,actionMode:'checkout',cardCol:true,balanceCol:true})}
  </div>`;
}

// ─── ARRIVALS / DEPARTURES ────────────────────────────────────
async function _resBuildMovementView(type){
  const isArr=type==='arrivals';
  const date=isArr?_resArrDate:_resDepDate;
  const setter=isArr?'resSetArrDate':'resSetDepDate';
  const title=isArr?'Arrivals':'Departures';
  const color=isArr?'#0d9488':'#7c3aed';

  const rows=_resSortRows([
    ..._resGroupRows().filter(r=>!r.cancelled&&(isArr?r.checkIn:r.checkOut)===date),
    ..._resIndivRows().filter(r=>(isArr?r.checkIn:r.checkOut)===date),
  ]);
  await _resAttachFolioBalances(rows);
  const todayStr=fmtISO(new Date());
  const dateLabel=date===todayStr?'Today':fmtDate(date);

  return `<div style="max-width:960px;margin:0 auto">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap">
      <span style="font-size:14px;font-weight:700;color:${color}">${title} for</span>
      <input type="date" value="${date}" onchange="${setter}(this.value)" style="font-size:13px;font-weight:600;border:2px solid ${color}40;border-radius:8px;padding:5px 10px;color:${color};outline:none;cursor:pointer;background:#fff">
      <button onclick="${setter}('${todayStr}')" style="font-size:11.5px;background:${color}10;color:${color};border:1px solid ${color}30;border-radius:6px;padding:4px 10px;font-weight:600;cursor:pointer">Today</button>
      <span style="font-size:13px;font-weight:700;color:var(--text)">${rows.length} guest${rows.length!==1?'s':''}</span>
    </div>
    ${rows.length===0?_resEmptyState(isArr?'🛬':'🛫',`No ${title.toLowerCase()} on ${dateLabel}`):_resTable(rows,{checkInCol:true,checkOutCol:true,actionMode:isArr?'checkin':'checkout',balanceCol:true,cardCol:true})}
  </div>`;
}
function resSetArrDate(d){_resArrDate=d;_resRender();}
function resSetDepDate(d){_resDepDate=d;_resRender();}

function _resEmptyState(emoji,msg){
  return `<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:48px;text-align:center">
    <div style="font-size:32px;margin-bottom:10px">${emoji}</div>
    <div style="font-size:14px;font-weight:600;color:var(--text)">${escHtml(msg)}</div>
  </div>`;
}

let _resLastRows=[];
function _resTable(rows,{checkInCol,checkOutCol,actionMode,cardCol,balanceCol,discountCol}){
  _resLastRows=rows;
  const actionCell=(r)=>{
    if(actionMode==='checkin'){
      return r.checkedInAt
        ?`<span style="font-size:11px;font-weight:700;color:#059669;background:#d1fae5;padding:3px 10px;border-radius:20px">✓ Checked In</span>`
        :`<button onclick="resCheckIn('${r.type}','${r.id}')" style="background:#0d9488;color:#fff;border:none;padding:5px 12px;border-radius:7px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:'Jost',sans-serif">Check In</button>`;
    }
    return r.checkedOutAt
      ?`<span style="font-size:11px;font-weight:700;color:#059669;background:#d1fae5;padding:3px 10px;border-radius:20px">✓ Checked Out</span>`
      :`<button onclick="resCheckOut('${r.type}','${r.id}')" style="background:#7c3aed;color:#fff;border:none;padding:5px 12px;border-radius:7px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:'Jost',sans-serif">Check Out</button>`;
  };
  // Fixed column order per Jorge's ask 2026-09-26: Room, Room Type, Name,
  // Check-In, Check-Out, Rate/Night, Source, Balance, Card on File, Notes, Action.
  return `<div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f8fafc;border-bottom:1px solid var(--border)">
        <th style="padding:10px 16px;text-align:left;font-size:10.5px;font-weight:700;color:var(--muted)">ROOM</th>
        <th style="padding:10px 16px;text-align:left;font-size:10.5px;font-weight:700;color:var(--muted)">ROOM TYPE</th>
        <th style="padding:10px 16px;text-align:left;font-size:10.5px;font-weight:700;color:var(--muted)">NAME</th>
        ${checkInCol?'<th style="padding:10px 16px;text-align:left;font-size:10.5px;font-weight:700;color:var(--muted)">CHECK-IN</th>':''}
        ${checkOutCol?'<th style="padding:10px 16px;text-align:left;font-size:10.5px;font-weight:700;color:var(--muted)">CHECK-OUT</th>':''}
        <th style="padding:10px 16px;text-align:left;font-size:10.5px;font-weight:700;color:var(--muted)">RATE / NIGHT</th>
        <th style="padding:10px 16px;text-align:left;font-size:10.5px;font-weight:700;color:var(--muted)">SOURCE</th>
        ${balanceCol?'<th style="padding:10px 16px;text-align:right;font-size:10.5px;font-weight:700;color:var(--muted)">BALANCE</th>':''}
        ${cardCol?'<th style="padding:10px 16px;text-align:center;font-size:10.5px;font-weight:700;color:var(--muted)">CARD ON FILE</th>':''}
        ${discountCol?'<th style="padding:10px 16px;text-align:left;font-size:10.5px;font-weight:700;color:var(--muted)">DISCOUNT</th>':''}
        <th style="padding:10px 16px;text-align:left;font-size:10.5px;font-weight:700;color:var(--muted)">NOTES</th>
        <th style="padding:10px 16px;text-align:center;font-size:10.5px;font-weight:700;color:var(--muted)">ACTION</th>
      </tr></thead>
      <tbody>${rows.map((r,i)=>`
        <tr style="border-bottom:1px solid #f3f4f6;cursor:pointer" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''" onclick="_resOpenRowAt(${i})">
          <td style="padding:11px 16px;font-size:12px;color:var(--text)">${escHtml(r.room)}</td>
          <td style="padding:11px 16px;font-size:12px;color:var(--text)">${escHtml(r.roomType)}</td>
          <td style="padding:11px 16px;font-size:13px;font-weight:700;color:#1d4ed8;text-decoration:underline;text-underline-offset:2px">${escHtml(r.name)}${r.cancelled?` <span style="font-size:10px;font-weight:700;color:#dc2626;background:#fee2e2;padding:1px 7px;border-radius:20px;text-decoration:none;display:inline-block">CANCELLED</span>`:''}</td>
          ${checkInCol?`<td style="padding:11px 16px;font-size:12px;color:var(--text)">${fmtDate(r.checkIn)}</td>`:''}
          ${checkOutCol?`<td style="padding:11px 16px;font-size:12px;color:var(--text)">${fmtDate(r.checkOut)}</td>`:''}
          <td style="padding:11px 16px;font-size:12px;font-weight:600;color:#0d9488">${r.rate!=null?fmt$(r.rate):'—'}</td>
          <td style="padding:11px 16px"><span style="font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:5px;background:${r.type==='group'?'#dbeafe':'#f0fdf4'};color:${r.type==='group'?'#1e3a8a':'#065f46'}">${escHtml(r.source)}</span></td>
          ${balanceCol?`<td style="padding:11px 16px;text-align:right;font-size:12px;font-weight:700;color:${r.balance>0?'#dc2626':'#059669'}">${r.balance!=null?fmt$(r.balance):'—'}</td>`:''}
          ${cardCol?`<td style="padding:11px 16px;text-align:center;font-size:11px;font-weight:700;color:${r.cardOnFile?'#059669':'#dc2626'}">${r.cardOnFile?'Yes':'No'}</td>`:''}
          ${discountCol?`<td style="padding:11px 16px;font-size:12px;color:#7c3aed;font-family:monospace">${escHtml(r.discountCode||'—')}</td>`:''}
          <td style="padding:11px 16px;font-size:12px;color:var(--muted);max-width:220px;white-space:pre-wrap">${escHtml(r.notes)}</td>
          <td style="padding:11px 16px;text-align:center" onclick="event.stopPropagation()">${actionCell(r)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

// ─── ADVANCED SEARCH ──────────────────────────────────────────
// Searches everything already in memory (both group regs and cached booking_requests)
// instead of re-querying Supabase per keystroke -- it's all local already.
function _resBuildSearchView(){
  const fi=`padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Jost',sans-serif;outline:none;color:var(--text);background:#fff`;
  return `<div style="max-width:860px">
    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:20px">
      <h3 style="font-size:14px;font-weight:800;color:var(--dark);margin:0 0 16px">Search Reservations</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">NAME</label>
          <input id="res-srch-name" type="text" placeholder="First or last name" style="${fi};width:100%;box-sizing:border-box" onkeydown="if(event.key==='Enter')resRunSearch()"></div>
        <div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">ROOM</label>
          <input id="res-srch-room" type="text" placeholder="e.g. 22" style="${fi};width:100%;box-sizing:border-box" onkeydown="if(event.key==='Enter')resRunSearch()"></div>
        <div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">SOURCE</label>
          <input id="res-srch-source" type="text" placeholder="online, Escape, retreat name…" style="${fi};width:100%;box-sizing:border-box" onkeydown="if(event.key==='Enter')resRunSearch()"></div>
        <div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">CHECK-IN FROM</label>
          <input id="res-srch-from" type="date" style="${fi};width:100%;box-sizing:border-box"></div>
        <div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">CHECK-IN TO</label>
          <input id="res-srch-to" type="date" style="${fi};width:100%;box-sizing:border-box"></div>
        <div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">DISCOUNT CODE</label>
          <input id="res-srch-code" type="text" placeholder="EXTRANIGHT, STAFF…" style="${fi};width:100%;box-sizing:border-box" onkeydown="if(event.key==='Enter')resRunSearch()"></div>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="resRunSearch()" style="background:#0d9488;color:#fff;border:none;padding:8px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Jost',sans-serif">Search</button>
        <button onclick="['res-srch-name','res-srch-room','res-srch-source','res-srch-from','res-srch-to','res-srch-code'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});document.getElementById('res-srch-results').innerHTML=''"
          style="background:#fff;color:var(--muted);border:1px solid var(--border);padding:8px 16px;border-radius:8px;font-size:13px;cursor:pointer;font-family:'Jost',sans-serif">Clear</button>
      </div>
    </div>
    <div id="res-srch-results"></div>
  </div>`;
}
async function resRunSearch(){
  const name=document.getElementById('res-srch-name')?.value.trim().toLowerCase();
  const room=document.getElementById('res-srch-room')?.value.trim().toLowerCase();
  const source=document.getElementById('res-srch-source')?.value.trim().toLowerCase();
  const from=document.getElementById('res-srch-from')?.value;
  const to=document.getElementById('res-srch-to')?.value;
  const code=document.getElementById('res-srch-code')?.value.trim().toLowerCase();
  const resultsEl=document.getElementById('res-srch-results');if(!resultsEl)return;
  if(!name&&!room&&!source&&!from&&!to&&!code){resultsEl.innerHTML=`<p style="color:var(--muted);font-size:13px">Enter at least one search criteria.</p>`;return;}

  let rows=[..._resGroupRows(),..._resIndivRows()];
  if(name)rows=rows.filter(r=>r.name.toLowerCase().includes(name));
  if(room)rows=rows.filter(r=>(r.room||'').toLowerCase().includes(room));
  if(source)rows=rows.filter(r=>(r.source||'').toLowerCase().includes(source));
  if(from)rows=rows.filter(r=>r.checkIn>=from);
  if(to)rows=rows.filter(r=>r.checkIn<=to);
  // Only individual Booking Engine reservations (booking_requests) carry a
  // discount code -- retreat/Room Only regs have no equivalent field.
  if(code)rows=rows.filter(r=>(r.discountCode||'').toLowerCase().includes(code));
  _resSortRows(rows);

  if(!rows.length){resultsEl.innerHTML=`<p style="color:var(--muted);font-size:13px">No results found.</p>`;return;}
  resultsEl.innerHTML=`<p style="color:var(--muted);font-size:13px">Loading…</p>`;
  await _resAttachFolioBalances(rows);
  resultsEl.innerHTML=`<div style="font-size:12px;color:var(--muted);margin-bottom:8px">${rows.length} result${rows.length!==1?'s':''} found</div>
    ${_resTable(rows,{checkInCol:true,checkOutCol:true,actionMode:'checkin',balanceCol:true,cardCol:true,discountCol:true})}`;
}
