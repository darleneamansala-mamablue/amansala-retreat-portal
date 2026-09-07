// ===== transport.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

const TRANSPORT_KEY='amansala_transport';
let deletedTransportIds=new Set(JSON.parse(localStorage.getItem('amansala_deleted_transport_ids')||'[]'));

function loadTransport(){try{return(JSON.parse(localStorage.getItem(TRANSPORT_KEY)||'[]')).filter(s=>!deletedTransportIds.has(s.id));}catch{return[];}}

// ===== DRIVER CONFIRMATION WORKFLOW (7-state) =====
// Separate from sub.status (which means "is this transport request itself
// valid vs cancelled") — this tracks whether the ASSIGNED DRIVER has
// acknowledged one leg (arrival or departure) of a submission. Stored in
// driverConfirmations{} (declared in driver-portal.js, loads after this file
// — safe because these are only read/written from inside function bodies,
// called after both scripts have loaded, same pattern trBuildDriverView
// already relies on).
const TR_DRV_STATUS={
  pending:  {label:'Pending Driver Confirmation',       color:'#92400e',bg:'#fef3c7',border:'#fde68a'},
  viewed:   {label:'Viewed by Driver',                   color:'#0369a1',bg:'#e0f2fe',border:'#93c5fd'},
  confirmed:{label:'Confirmed by Driver',                color:'#15803d',bg:'#dcfce7',border:'#86efac'},
  reconfirm:{label:'Changes Require Reconfirmation',     color:'#c2410c',bg:'#ffedd5',border:'#fdba74'},
  declined: {label:'Driver Declined/Unable',             color:'#dc2626',bg:'#fee2e2',border:'#fca5a5'},
  completed:{label:'Trip Completed',                     color:'#fff',   bg:'#115e59',border:'#115e59'},
  cancelled:{label:'Cancelled',                          color:'#6b7280',bg:'#f3f4f6',border:'#d1d5db'},
};
function trDrvKey(sub,kind){return sub.id+'_'+kind;}
function trDrvRec(sub,kind){
  const dc=(typeof driverConfirmations!=='undefined')?driverConfirmations:null;
  if(!dc)return null;
  return dc[trDrvKey(sub,kind)]||null;
}
// Which important fields feed reconfirmation, and the id/label of the driver
// currently assigned to this leg (explicit override first, falling back to
// the existing airport-based auto-assignment so nothing already assigned
// silently changes).
function trDrvFieldsSnapshot(sub,kind,computedDefaultId){
  return{
    date:kind==='arrival'?sub.arrivalDate:sub.departureDate,
    time:kind==='arrival'?sub.arrivalTime:sub.departureTime,
    airport:kind==='arrival'?sub.arrivalAirport:sub.departureAirport,
    flightNumber:sub.flightNumber||'',
    guest:trTransportFullName(sub),
    driverId:trDrvAssignedId(sub,kind,computedDefaultId),
    note:(kind==='arrival'?sub.arrivalDriverNote:sub.departureDriverNote)||'',
  };
}
// computedDefaultId, when passed, is the driver trComputeDriverAssignments's
// date-level pairing already decided (it alone knows whether a Cancún
// departure is a same-day round-trip riding with Salamon vs a standalone
// Irving departure) — this function only falls back to the simple
// arrival-airport heuristic when called without that context.
function trDrvAssignedId(sub,kind,computedDefaultId){
  const override=kind==='arrival'?sub.arrivalDriverId:sub.departureDriverId;
  if(override)return override;
  if(computedDefaultId)return computedDefaultId;
  const airport=kind==='arrival'?sub.arrivalAirport:sub.departureAirport;
  return(airport==='cancun'&&kind==='arrival')?'drv_salamon':'drv_irving';
}
function trDrvAssignedName(sub,kind,computedDefaultId){
  const id=trDrvAssignedId(sub,kind,computedDefaultId);
  const list=(typeof driverAccounts!=='undefined'&&driverAccounts.length)?driverAccounts:(typeof DEF_DRIVERS!=='undefined'?DEF_DRIVERS:[]);
  return list.find(d=>d.id===id)?.name||'Unassigned';
}
function trDrvPushHistory(rec,event,by,detail){
  if(!rec.history)rec.history=[];
  rec.history.push({at:new Date().toISOString(),event,by:by||null,detail:detail||null});
}
function trDrvEnsureRec(sub,kind,assignedBy){
  const dc=driverConfirmations;
  const key=trDrvKey(sub,kind);
  if(!dc[key]){
    dc[key]={status:'pending',driverId:trDrvAssignedId(sub,kind),assignedBy:assignedBy||null,assignedAt:new Date().toISOString(),
      viewedAt:null,confirmedAt:null,confirmedBy:null,declineReason:null,declinedAt:null,
      version:1,confirmedVersion:null,note:null,changeMessage:null,snapshot:trDrvFieldsSnapshot(sub,kind),history:[]};
    trDrvPushHistory(dc[key],'assigned',assignedBy||'System',`Assigned to ${trDrvAssignedName(sub,kind)}`);
  }
  return dc[key];
}
// Diffs the leg's current fields against the snapshot taken at last
// assignment/confirmation. If an important field changed AND the leg was
// confirmed (or already needs reconfirmation), reset it to 'reconfirm' and
// store a human-readable message of exactly what changed. Call this any
// time a submission's key fields are edited (guest intake resubmission,
// staff quick-edit, driver reassignment).
function trDrvCheckReconfirm(sub,kind,changedBy){
  const dc=driverConfirmations;const key=trDrvKey(sub,kind);
  const rec=dc[key];
  if(!rec){trDrvEnsureRec(sub,kind,changedBy);return;}
  const now=trDrvFieldsSnapshot(sub,kind);
  const prev=rec.snapshot||now;
  const FIELD_LABELS={date:'Date',time:'Pickup time',airport:'Airport',flightNumber:'Flight number',guest:'Guest',driverId:'Assigned driver',note:'Transportation note'};
  const changes=Object.keys(FIELD_LABELS).filter(f=>(prev[f]||'')!==(now[f]||''));
  if(!changes.length)return;
  const wasLive=rec.status==='confirmed'||rec.status==='reconfirm'||rec.status==='viewed';
  const msgs=changes.map(f=>{
    const label=FIELD_LABELS[f];
    let a=prev[f]||'—',b=now[f]||'—';
    if(f==='time'){a=a&&a!=='—'?tsFmt(a):'—';b=b&&b!=='—'?tsFmt(b):'—';}
    if(f==='airport'){a=a==='cancun'?'CUN':a==='tulum'?'TQO':a;b=b==='cancun'?'CUN':b==='tulum'?'TQO':b;}
    if(f==='driverId'){
      const list=(typeof driverAccounts!=='undefined'&&driverAccounts.length)?driverAccounts:(typeof DEF_DRIVERS!=='undefined'?DEF_DRIVERS:[]);
      a=list.find(d=>d.id===a)?.name||a;b=trDrvAssignedName(sub,kind);
    }
    return`${label} changed from ${a} to ${b}.`;
  });
  const changeMessage=msgs.join(' ')+(wasLive?' Driver must reconfirm.':'');
  rec.snapshot=now;
  rec.driverId=now.driverId;
  rec.version=(rec.version||1)+1;
  rec.changeMessage=changeMessage;
  rec.changedAt=new Date().toISOString();
  if(wasLive){
    rec.status='reconfirm';
    trDrvPushHistory(rec,'reconfirm_required',changedBy||'System',changeMessage);
  }else{
    trDrvPushHistory(rec,'updated',changedBy||'System',changeMessage);
  }
}
// Gathers every trip (arrival + departure legs) assigned to one driver
// across a date window, reusing trComputeDriverAssignments per distinct
// date so the same round-trip-pairing/default-routing logic applies no
// matter how far out the driver looks — used by both the embedded and
// standalone driver dashboards, and by the admin Driver Assignments page.
function trDrvGatherTrips(driverId,daysBack,daysFwd){
  const allSubs=loadTransport();
  const dates=new Set();
  const today=new Date();today.setHours(0,0,0,0);
  const inWindow=ds=>{
    if(!ds)return false;
    const d=new Date(ds+'T00:00:00');
    const diffDays=Math.round((d-today)/86400000);
    return diffDays>=-daysBack&&diffDays<=daysFwd;
  };
  allSubs.forEach(s=>{
    if(inWindow(s.arrivalDate))dates.add(s.arrivalDate);
    if(inWindow(s.departureDate))dates.add(s.departureDate);
  });
  const trips=[];
  [...dates].sort().forEach(d=>{
    const{byDriverId}=trComputeDriverAssignments(d);
    (byDriverId[driverId]||[]).forEach(t=>trips.push({...t,_date:t._kind==='arrival'?t.arrivalDate:t.departureDate}));
  });
  return trips;
}
// All drivers' trips combined (not scoped to one driverId) — feeds the
// management alerts panel on the Driver Assignments page.
function trDrvGatherAllTrips(daysBack,daysFwd){
  const allSubs=loadTransport();
  const dates=new Set();
  const today=new Date();today.setHours(0,0,0,0);
  const inWindow=ds=>{
    if(!ds)return false;
    const d=new Date(ds+'T00:00:00');
    const diffDays=Math.round((d-today)/86400000);
    return diffDays>=-daysBack&&diffDays<=daysFwd;
  };
  allSubs.forEach(s=>{
    if(inWindow(s.arrivalDate))dates.add(s.arrivalDate);
    if(inWindow(s.departureDate))dates.add(s.departureDate);
  });
  const trips=[];
  [...dates].sort().forEach(d=>{
    const{allTrips}=trComputeDriverAssignments(d);
    allTrips.forEach(t=>trips.push({...t,_date:t._kind==='arrival'?t.arrivalDate:t.departureDate}));
  });
  return trips;
}
function trDrvManagementAlerts(){
  const trips=trDrvGatherAllTrips(0,14).filter(t=>t.status!=='cancelled');
  const now=Date.now();
  const within24h=t=>{
    const time=t._kind==='arrival'?t.arrivalTime:t.departureTime;
    if(!t._date||!time)return false;
    const dt=new Date(t._date+'T'+time+':00');
    const diffH=(dt-now)/3600000;
    return diffH>=0&&diffH<=24;
  };
  const st=t=>t._drvRec?.status;
  return{
    pending:trips.filter(t=>st(t)==='pending').length,
    viewedNotConfirmed:trips.filter(t=>st(t)==='viewed').length,
    reconfirm:trips.filter(t=>st(t)==='reconfirm').length,
    declined:trips.filter(t=>st(t)==='declined').length,
    noDriver:trips.filter(t=>!t._assignedDriverId).length,
    departures24h:trips.filter(t=>t._kind==='departure'&&within24h(t)&&['pending','viewed','reconfirm'].includes(st(t))).length,
    arrivals24h:trips.filter(t=>t._kind==='arrival'&&within24h(t)&&['pending','viewed','reconfirm'].includes(st(t))).length,
  };
}
function trDrvAlertsHtml(){
  const a=trDrvManagementAlerts();
  const chips=[
    {n:a.pending,label:'pending',color:'#92400e',bg:'#fef3c7'},
    {n:a.viewedNotConfirmed,label:'viewed, not confirmed',color:'#0369a1',bg:'#e0f2fe'},
    {n:a.reconfirm,label:'need reconfirmation',color:'#c2410c',bg:'#ffedd5'},
    {n:a.declined,label:'declined',color:'#dc2626',bg:'#fee2e2'},
    {n:a.noDriver,label:'no driver assigned',color:'#6b7280',bg:'#f3f4f6'},
    {n:a.arrivals24h,label:'arrivals <24h unconfirmed',color:'#b91c1c',bg:'#fef2f2'},
    {n:a.departures24h,label:'departures <24h unconfirmed',color:'#b91c1c',bg:'#fef2f2'},
  ].filter(c=>c.n>0);
  if(!chips.length)return`<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:12.5px;color:#15803d;font-weight:700">✓ All driver confirmations are up to date.</div>`;
  const urgent=a.arrivals24h+a.departures24h;
  return`<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:12px;padding:14px 18px;margin-bottom:16px">
    ${urgent?`<div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:8px">Driver confirmation required: ${urgent} transportation assignment${urgent!==1?'s':''} within 24 hours ${urgent!==1?'have':'has'} not been confirmed.</div>`:''}
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${chips.map(c=>`<span style="font-size:11.5px;font-weight:700;color:${c.color};background:${c.bg};border-radius:99px;padding:4px 12px;white-space:nowrap">${c.n} ${c.label}</span>`).join('')}
    </div>
  </div>`;
}
function trDrvSetAssignedDriver(subId,kind,driverId,assignedBy){
  const data=loadTransport();const sub=data.find(s=>s.id===subId);if(!sub)return;
  if(kind==='arrival')sub.arrivalDriverId=driverId;else sub.departureDriverId=driverId;
  saveTransport(data);
  trDrvEnsureRec(sub,kind,assignedBy);
  trDrvCheckReconfirm(sub,kind,assignedBy);
  driverConfirmations[trDrvKey(sub,kind)].driverId=driverId;
  saveDriverConfirmations();
  if(typeof refreshTransport==='function')refreshTransport();
}
function trFmtTulum(iso){
  if(!iso)return'';
  try{
    return new Date(iso).toLocaleString('en-US',{timeZone:'America/Cancun',month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
  }catch(e){return new Date(iso).toLocaleString();}
}
function trNormName(s){return(s||'').toLowerCase().replace(/\s+/g,' ').trim();}
function trTransportFullName(s){return trNormName(((s.firstName||'')+' '+(s.lastName||'')).trim());}
function trGuestMatchesSub(guest,sub){
  const email=(guest.email||'').toLowerCase().trim();
  const subEmail=(sub.email||'').toLowerCase().trim();
  if(email&&subEmail&&email===subEmail)return true;
  const gName=trNormName(guest.name);
  const subName=trTransportFullName(sub);
  if(!gName||!subName)return false;
  if(gName===subName)return true;
  const gFirst=gName.split(' ')[0];
  const subFirst=trNormName(sub.firstName);
  if(gFirst&&subFirst&&gFirst===subFirst&&(!gName.includes(' ')||!sub.lastName))return true;
  return false;
}
/** Room-list roster is source of truth for who should submit transport. */
function getTransportRoster(bkId){
  const allSubs=loadTransport().filter(s=>s.bookingId===bkId&&s.status!=='cancelled');
  const roster=[];
  AppData.regs.filter(r=>r.bookingId===bkId&&!r.isTeacherRoom).forEach(r=>{
    (r.guests||[]).filter(g=>g.name).forEach(g=>{
      roster.push({name:g.name,email:(g.email||r.email||'').trim(),room:r.room||''});
    });
  });
  const matchedSubs=[];
  const usedIdx=new Set();
  roster.forEach(guest=>{
    const idx=allSubs.findIndex((s,i)=>!usedIdx.has(i)&&trGuestMatchesSub(guest,s));
    if(idx>=0){matchedSubs.push(allSubs[idx]);usedIdx.add(idx);}
  });
  const missing=roster.filter(guest=>!matchedSubs.some(s=>trGuestMatchesSub(guest,s)));
  return{
    roster,
    allSubs,
    matchedSubs,
    missing,
    submittedCount:roster.length-missing.length,
    orphanSubs:allSubs.filter((_,i)=>!usedIdx.has(i))
  };
}
// Shared red/orange/green coding for "how much of this retreat's transport is
// filled out" — used on the Transport tab's Status view and the Dashboard.

function trCompletionColor(have,total){
  if(total===0)return'#6b7280';
  if(have===0)return'#dc2626';
  if(have<total)return'#d97706';
  return'#16a34a';
}
function trCompletionLabel(have,total){
  if(total===0)return'No guests on room list yet';
  if(have===0)return'Nobody filled out';
  if(have<total)return'Partially filled out';
  return'All filled out';
}

function trRosterStatusHtml(roster,missing){
  if(!roster.length)return'';
  const missingSet=new Set(missing.map(g=>trNormName(g.name)));
  const rows=roster.map(g=>{
    const done=!missingSet.has(trNormName(g.name));
    const status=done
      ?'<span style="font-size:10.5px;font-weight:700;color:#15803d;background:#dcfce7;border-radius:5px;padding:2px 8px">Received</span>'
      :'<span style="font-size:10.5px;font-weight:700;color:#92400e;background:#fef9c3;border-radius:5px;padding:2px 8px">Missing</span>';
    return`<tr style="border-bottom:1px solid #f0ece4">
      <td style="padding:8px 14px;font-weight:600;color:#2d2520">${g.name}</td>
      <td style="padding:8px 14px;color:#8a7e74">${g.room||'—'}</td>
      <td style="padding:8px 14px;text-align:right">${status}</td>
    </tr>`;
  }).join('');
  return`<div style="background:#fff;border:1px solid #e8dfd4;border-radius:12px;margin-bottom:20px;overflow:hidden">
    <div style="background:#f2f8f6;padding:10px 16px;border-bottom:1px solid #c8d8d4;font-size:12px;font-weight:700;color:#0e9494">Room List — Transport Status</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#faf7f2">
        <th style="padding:7px 14px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4">Guest</th>
        <th style="padding:7px 14px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4">Room</th>
        <th style="padding:7px 14px;text-align:right;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4">Transport</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function saveTransport(data){
  localStorage.setItem(TRANSPORT_KEY,JSON.stringify(data));
  // Sync each entry to Supabase
  if(Array.isArray(data))data.forEach(e=>saveTransportToSupabase(e));
}
// Merge Supabase transport into localStorage (Supabase wins per entry, keep local-only entries)
async function syncTransportFromSupabase(){
  // Merge deletedTransportIds from Supabase so deletions from ANY device stay permanent
  try{
    const {data:delData}=await db.from('app_store').select('value').eq('key','deletedTransportIds').maybeSingle();
    if(delData?.value&&Array.isArray(delData.value))delData.value.forEach(id=>deletedTransportIds.add(id));
    localStorage.setItem('amansala_deleted_transport_ids',JSON.stringify([...deletedTransportIds]));
  }catch(e){}

  // Refresh the shared manual-grouping map (same `settings.transport_groups` row the
  // admin Transport board writes via tr2SaveGroupSetting, and driver-view.html reads
  // independently) so Teacher Portal's "My Transport" grouping stays consistent with it.
  try{
    const {data:setRow}=await db.from('settings').select('value').eq('key','transport_groups').maybeSingle();
    tr2UserGroupMap=new Map(setRow?.value||[]);
  }catch(e){}

  const remote=await loadTransportFromSupabase();
  if(!remote)return;
  const local=loadTransport();
  const localById=new Map(local.map(l=>[l.id,l]));
  const remoteIds=new Set(remote.map(r=>r.id));
  // Keep local entries not yet in Supabase, merge with all remote entries — excluding anything deleted
  const localOnly=local.filter(l=>!remoteIds.has(l.id)&&!deletedTransportIds.has(l.id));
  const merged=[...remote,...localOnly].filter(s=>!deletedTransportIds.has(s.id));
  localStorage.setItem(TRANSPORT_KEY,JSON.stringify(merged));
  // Push any local-only entries up to Supabase
  localOnly.forEach(e=>saveTransportToSupabase(e));
  // If Supabase still somehow has a row marked deleted, remove it there too
  remote.filter(r=>deletedTransportIds.has(r.id)).forEach(r=>deleteTransportFromSupabase(r.id));

  // A guest/leader resubmitting the transport form upserts by the same id
  // (see transport-form.html's _editingEntryId reuse) — this is the only
  // place that update becomes visible on the admin side, so it's where
  // reconfirmation gets triggered for any already-confirmed leg whose
  // important fields changed underneath it.
  if(typeof driverConfirmations!=='undefined'){
    let anyChanged=false;
    remote.forEach(sub=>{
      const before=localById.get(sub.id);
      if(!before)return; // brand-new submission — trDrvEnsureRec will create a fresh 'pending' record on first render, nothing to reconfirm
      const FIELDS=['arrivalDate','arrivalTime','arrivalAirport','departureDate','departureTime','departureAirport','flightNumber','firstName','lastName'];
      const changed=FIELDS.some(f=>(before[f]||'')!==(sub[f]||''));
      if(!changed)return;
      if(sub.arrivalDate&&sub.arrivalTime&&sub.arrivalAirport){trDrvCheckReconfirm(sub,'arrival','Guest resubmission');anyChanged=true;}
      if(sub.departureDate&&sub.departureTime&&sub.departureAirport){trDrvCheckReconfirm(sub,'departure','Guest resubmission');anyChanged=true;}
    });
    if(anyChanged&&typeof saveDriverConfirmations==='function')saveDriverConfirmations();
  }
}

function trTimeToMins(t){if(!t)return 0;const[h,m]=(t||'').split(':');return parseInt(h)*60+parseInt(m);}

// ── CHARGE TO ROOM FOLIO ─────────────────────────────────────────────────
// Manual "click to charge" button (staff trigger this around arrival time,
// not automatic) — same folio-charge shape/pattern as the Spa "Charge to
// Room" button (spaChargeApptToRoom in modules/spa.js), reusing the
// roster/email-or-name guest matching already used to check who has
// submitted transport info (trGuestMatchesSub/getTransportRoster above).

function trGetPrice(airport,size){
  const c=airport==='cancun';
  if(size>=6)return c?45:40;
  if(size===5)return c?55:45;
  if(size===4)return c?65:55;
  if(size===3)return c?80:65;
  if(size===2)return c?100:80;
  return c?195:145;
}
function trVehicleType(size){
  if(size<=4)return'SUV';
  if(size<=10)return'Van';
  return'Transfer';
}

// ── Ride sharing ─────────────────────────────────────────────────────────
// Two subs auto-group within 20 min of each other. Staff can also force any
// subs to share a ride via a common shareGroupId (trMarkSharing), which
// overrides the time window — this is how "slide them together" works and
// why the per-person price recalculates via trGetPrice(airport, grp.length).

function trAddMins(t,mins){
  if(!t)return'—';
  const total=trTimeToMins(t)+mins;
  const h=Math.floor(total/60)%24, m=total%60;
  return (h<10?'0':'')+h+':'+(m<10?'0':'')+m;
}

const TR_UPGRADE_MAP={rt5:'rt4',rt4:'rt6',rt3:'rt2',rt2:'rt1'};

function trGetUpgrade(bkId,roomNum){
  if(!roomNum||roomNum==='—')return null;
  // Find the guest's reg to get roomTypeId
  const reg=getRegForRoom(bkId,roomNum);
  const rtId=reg?reg.roomTypeId:null;
  let rt=AppData.roomTypes.find(r=>r.id===rtId)||AppData.roomTypes.find(r=>r.rooms.includes(roomNum));
  if(!rt)return null;

  const nextId=TR_UPGRADE_MAP[rt.id];
  if(!nextId)return null;

  const nextRt=AppData.roomTypes.find(r=>r.id===nextId);
  if(!nextRt)return null;

  const bk=AppData.bookings.find(b=>b.id===bkId);
  if(!bk)return null;

  // Collect rooms unavailable during this booking's dates
  const busyRooms=new Set();
  AppData.bookings.forEach(b=>{
    if(b.status==='cancelled'||b.id===bk.id)return; // own retreat's blocked rooms may still be available
    if(b.startDate<bk.endDate&&b.endDate>bk.startDate){
      (b.blockedRooms||[]).forEach(r=>busyRooms.add(r));
    }
  });
  // Rooms assigned to OTHER guests in the same booking are also unavailable
  AppData.regs.filter(r=>r.bookingId===bk.id&&r.room&&r.room!==roomNum).forEach(r=>busyRooms.add(r.room));

  // Triples (and larger) never upgrade — only solo and double-occupancy rooms are eligible
  const guestCount=reg?(reg.guests||[]).filter(g=>g.name).length:1;
  if(guestCount>=3)return null;

  const available=nextRt.rooms.filter(room=>!busyRooms.has(room));
  if(!available.length)return null;
  // Prefer Grande rooms over Chica (CH) rooms — only suggest CH if nothing else available
  const grandeFirst=[...available.filter(r=>!r.toUpperCase().startsWith('CH')),...available.filter(r=>r.toUpperCase().startsWith('CH'))];
  available.splice(0,available.length,...grandeFirst);

  // Nightly fee = (nextPrice - currentPrice) × 0.9 (10% discount off the price difference)
  const curPrice=guestCount>=2?rt.price2:rt.price1;
  const nxtPrice=guestCount>=2?nextRt.price2:nextRt.price1;
  const upgradeNightly=Math.round((nxtPrice-curPrice)*0.9);
  if(upgradeNightly<=0)return null;

  // Doubles only surface an upgrade once both roommates have confirmed interest —
  // it's a per-person charge, so both need to agree to split it before we offer it.
  const needsConfirmation=guestCount===2&&!(reg&&reg.upgradeBothInterested);

  return{
    fromName:rt.name,
    toName:nextRt.name,
    upgradeNightly,
    availableCount:available.length,
    suggestedRoom:available[0],
    isSolo:guestCount<2,
    needsConfirmation,
    regId:reg?reg.id:null
  };
}




// ===== TRANSPORT ADMIN BOARD (ported from Staging's js/modules/transport.js) =====
// Reads bookings/registrations/room types from AppData (already loaded, camelCase,
// kept live by saveAll()/loadFromSupabase()) instead of separate raw fetches — avoids
// a second, potentially-stale copy of the same data. Everything else (the `transport`
// table itself, `staff`, `commissions`, `settings.transport_groups`) has no AppData
// equivalent, so those go straight to Supabase, matching staging's exact table/column
// shapes (confirmed via staging's js/data/*.js).
//
// getTransportRoster/trCompletionColor/trCompletionLabel/trGetUpgrade/trTimeToMins/
// trGetPrice/trVehicleType/trAddMins/trRosterStatusHtml/loadTransport/saveTransport/
// syncTransportFromSupabase/the driver-confirmation-workflow block above are ALL kept
// exactly as they were — Venues' roster badge, Teacher Portal's own "My Transport" view,
// Daily Report's upgrade column, and driver-portal.js all depend on them and have no
// staging equivalent to replace them with (confirmed 2026-09-07).

const TR2_RATES = {
  cancun: [195, 100, 80, 65, 55, 45],
  tulum:  [145,  80, 65, 55, 45, 40],
};
function tr2AutoRate(e, groupPax) {
  groupPax = groupPax || 1;
  if (e.ot) return 0;
  const tbl = e.airport === 'cancun' ? TR2_RATES.cancun : e.airport === 'tulum' ? TR2_RATES.tulum : null;
  if (!tbl) return null;
  return tbl[Math.min(groupPax - 1, tbl.length - 1)];
}

let tr2View          = 'arrivals';
let tr2RetreatFilter = '';
let tr2DateFrom      = '';
let tr2DateTo        = '';
let tr2ShowArchived  = false;
let tr2AllEntries    = [];
let tr2ActiveBooks   = [];
let tr2RawRows       = {};   // id → full row (for edit modal)
let tr2NameMap       = {};   // normalizedName → { bkId, retreatLabel, origName }
let tr2UserGroupMap  = new Map(); // dirId → groupKey (loaded from settings.transport_groups)
let tr2GroupKeyMap   = new Map(); // dirId → groupKey (current render snapshot, for drop targets)
let tr2DragSrc       = null;
let tr2UgCounter     = 0;
let tr2UpgradeMode   = false;
let tr2RoomNameToRtId = {};
let tr2StaffList     = [];
const tr2ConfirmedUpgrades = new Map();

const TR2_UPGRADE_PATH = {
  rt5: ['rt4', 'rt3', 'rt2', 'rt1'],
  rt4: ['rt3', 'rt2', 'rt1'],
  rt3: ['rt2', 'rt1'],
  rt2: ['rt1'],
  rt1: [],
  bd2: ['bd1'],
  bd1: [],
  rt8: [], rt9: [], bd3: [], bd4: [],
};
const TR2_LATERAL_ONLY = new Set(['rt8', 'rt9', 'bd3', 'bd4']);

function tr2IsHighSeason(dateStr) {
  if (!dateStr) return true;
  const m = pd(dateStr).getMonth() + 1;
  return !(m >= 5 && m <= 9);
}

function tr2AvailableRoomsOfType(rtId, bkStart, bkEnd, ownBkId) {
  const rt = AppData.roomTypes.find(r => r.id === rtId);
  if (!rt) return [];
  return (rt.rooms || []).filter(roomName =>
    !tr2ActiveBooks.some(b => {
      if (b.id === ownBkId || b.status === 'cancelled') return false;
      if (b.endDate < bkStart || b.startDate > bkEnd) return false;
      return (b.blockedRooms || []).includes(roomName);
    })
  );
}

function tr2UpgradeCell(e) {
  if (!e.room) return `<span style="color:#d1d5db;font-size:11px">—</span>`;
  const confirmed = tr2ConfirmedUpgrades.get(e.rowId);
  let confirmedBadgeHtml = '';
  if (confirmed) {
    const badge = confirmed.lateral
      ? `<span style="color:#6b7280;font-size:10px;font-weight:600">↔ ${escHtml(confirmed.newRoom)}</span>`
      : `<span style="color:#0d9488;font-size:10px;font-weight:600">⬆ ${escHtml(confirmed.newRoom)}</span>`;
    const staffBadge = confirmed.staffName ? ` <span style="color:#6b7280;font-size:9.5px">· ${escHtml(confirmed.staffName)}</span>` : '';
    confirmedBadgeHtml = `<div style="display:flex;align-items:center;gap:3px;margin-bottom:4px">
      ${badge}${staffBadge}
      <button onclick="event.stopPropagation();tr2ClearUpgrade('${e.rowId}')" title="Limpiar upgrade confirmado"
        style="background:none;border:none;color:#9ca3af;font-size:10px;cursor:pointer;padding:0 2px;line-height:1;margin-left:2px">×</button>
    </div>`;
  }

  const rtId = tr2RoomNameToRtId[e.room];
  if (!rtId) return confirmedBadgeHtml || `<span style="color:#9ca3af;font-size:11px">Sin tipo</span>`;
  const bk = tr2ActiveBooks.find(b => b.id === e.retreatId);
  if (!bk) return confirmedBadgeHtml || `<span style="color:#9ca3af;font-size:11px">—</span>`;
  const nights = Math.max(1, Math.round((pd(bk.endDate) - pd(bk.startDate)) / DAY_MS));
  const high   = tr2IsHighSeason(bk.startDate);
  const fromRt = AppData.roomTypes.find(r => r.id === rtId);
  const fromP  = high ? fromRt?.price1 : fromRt?.price1_low;
  const upgrades = TR2_UPGRADE_PATH[rtId] || [];

  const opts = [];
  for (const toRtId of upgrades) {
    const toRt = AppData.roomTypes.find(r => r.id === toRtId);
    if (!toRt) continue;
    const avail = tr2AvailableRoomsOfType(toRtId, bk.startDate, bk.endDate, bk.id);
    if (!avail.length) continue;
    const toP = high ? toRt.price1 : toRt.price1_low;
    const diff = (fromP != null && toP != null) ? (toP - fromP) : null;
    opts.push({ toRtId, name: toRt.name, avail, diff, toP, lateral: false });
  }
  if (TR2_LATERAL_ONLY.has(rtId)) {
    const avail = tr2AvailableRoomsOfType(rtId, bk.startDate, bk.endDate, bk.id).filter(r => r.toLowerCase() !== e.room.toLowerCase());
    if (avail.length) opts.push({ toRtId: rtId, name: fromRt?.name || '', avail, diff: 0, lateral: true });
  }

  if (!opts.length) {
    const noOptsMsg = upgrades.length === 0 && !TR2_LATERAL_ONLY.has(rtId)
      ? `<span style="color:#15803d;font-size:11px;font-weight:600">★ Top</span>`
      : `<span style="color:#9ca3af;font-size:11px">Sin disponibilidad</span>`;
    return confirmedBadgeHtml ? `<div>${confirmedBadgeHtml}${noOptsMsg}</div>` : noOptsMsg;
  }

  const staffSelId = `tr2-upg-staff-${e.rowId}`;
  const staffSel = tr2StaffList.length
    ? `<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
        <span style="font-size:9px;font-weight:700;color:#6b7280;white-space:nowrap">Staff:</span>
        <select id="${staffSelId}" style="font-size:10px;border:1px solid #d1d5db;border-radius:4px;padding:1px 4px;font-family:'Jost',sans-serif">
          <option value="">—</option>
          ${tr2StaffList.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('')}
        </select>
      </div>`
    : '';

  const chips = opts.map(opt => {
    const selId = `tr2-upg-${e.rowId}-${opt.toRtId}${opt.lateral ? 'l' : ''}`;
    const priceTag = opt.lateral
      ? `<span style="color:#6b7280;font-size:9.5px">sin costo</span>`
      : opt.diff != null && opt.diff > 0
        ? `<span style="color:#059669;font-size:9.5px;font-weight:700">+$${opt.diff}/n · $${opt.diff * nights} total</span>`
        : opt.toP != null
          ? `<span style="color:#0369a1;font-size:9.5px;font-weight:600">$${opt.toP}/n · $${opt.toP * nights} total</span>`
          : `<span style="color:#9ca3af;font-size:9.5px">ver precio</span>`;
    const nightlyRate = opt.lateral ? 0 : (opt.diff != null && opt.diff > 0) ? opt.diff : (opt.toP != null) ? opt.toP : null;
    const pretaxTotal = nightlyRate != null ? nightlyRate * nights : null;
    const pretaxArg = pretaxTotal != null ? pretaxTotal : 'null';
    const rateArg = nightlyRate != null ? nightlyRate : 'null';
    return `<span style="display:inline-flex;align-items:center;gap:4px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:3px 5px;white-space:nowrap">
      <span style="font-size:10px;font-weight:700;color:#111827">${escHtml(opt.name)}</span>
      ${priceTag}
      <select id="${selId}" style="font-size:10px;border:1px solid #d1d5db;border-radius:4px;padding:1px 2px;max-width:72px;font-family:'Jost',sans-serif">
        ${opt.avail.map(r => `<option value="${escHtml(r)}">${escHtml(r)}</option>`).join('')}
      </select>
      <button onclick="tr2ConfirmUpgrade('${e.rowId}','${opt.toRtId}','${selId}','${staffSelId}',${pretaxArg},${nights},${rateArg})"
        style="background:${opt.lateral ? '#6b7280' : '#0d9488'};color:#fff;border:none;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif">
        ${opt.lateral ? 'Mover' : 'OK'}
      </button>
    </span>`;
  }).join(' ');

  return `<div>${confirmedBadgeHtml}<div>${staffSel}<div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center">${chips}</div></div></div>`;
}

function tr2ApplyTabStyles() {
  const ACT = `background:#fff;border:none;padding:5px 13px;border-radius:6px;font-size:12.5px;font-weight:600;color:#111827;cursor:pointer;font-family:'Jost',sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.1)`;
  const INA = `background:transparent;border:none;padding:5px 13px;border-radius:6px;font-size:12.5px;font-weight:500;color:#6b7280;cursor:pointer;font-family:'Jost',sans-serif`;
  document.getElementById('tr2-tab-arr')?.setAttribute('style', tr2View === 'arrivals'   ? ACT : INA);
  document.getElementById('tr2-tab-dep')?.setAttribute('style', tr2View === 'departures' ? ACT : INA);
  document.getElementById('tr2-tab-all')?.setAttribute('style', tr2View === 'all'        ? ACT : INA);
}
function tr2Btn(bg, c) { return `background:${bg};color:${c};border:none;padding:7px 14px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif`; }

function trInit() {
  const container = document.getElementById('tab-transport-body');
  if (!container) return;
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:16px 20px;background:#fff;border-bottom:1px solid #e5e7eb;flex-shrink:0;flex-wrap:wrap">
        <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0">Transport</h2>
        <div style="display:flex;background:#f1f5f9;border-radius:8px;padding:3px;gap:2px">
          <button id="tr2-tab-arr" onclick="tr2SetView('arrivals')">Arrivals</button>
          <button id="tr2-tab-dep" onclick="tr2SetView('departures')">Departures</button>
          <button id="tr2-tab-all" onclick="tr2SetView('all')">All</button>
        </div>
        <div style="flex:1"></div>
        <button id="tr2-automatch-btn" onclick="tr2AutoMatch()" style="display:none;${tr2Btn('#fef3c7','#92400e')};font-size:12px" title="Asignar entradas sin retiro automáticamente por nombre">🔍 Auto-asignar</button>
        <button onclick="tr2CopyIndividualLink()" style="${tr2Btn('#f1f5f9','#374151')};font-size:12px" title="Link para huéspedes individuales (sin grupo)">🔗 Individual Link</button>
        <button id="tr2-copy-link-btn" onclick="tr2CopyFormLink()" style="${tr2Btn('#4db6ac','#fff')};font-size:12px" title="Copiar link del formulario para el retiro seleccionado">📋 Copy Guest Link</button>
        <button onclick="tr2OpenDriverView('irving')" style="${tr2Btn('#f5f3ff','#6d28d9')};font-size:12px" title="Vista chofer — Irving (TQO + CUN salidas)">🚐 Irving</button>
        <button onclick="tr2OpenDriverView('salomon')" style="${tr2Btn('#fff7ed','#c2410c')};font-size:12px" title="Vista chofer — Salomón (CUN llegadas)">🚐 Salomón</button>
        <button onclick="tr2ResetGroups()" style="${tr2Btn('#f3f4f6','#374151')};font-size:12px" title="Deshacer grupos manuales">↩ Grupos</button>
        <button id="tr2-upgrade-btn" onclick="tr2ToggleUpgradeMode()" style="${tr2Btn('#f3f4f6','#374151')};font-size:12px" title="Vista de upgrades disponibles">⬆ Upgrades</button>
        <button id="tr2-charge-btn" onclick="tr2RunAutoCharge()" style="${tr2Btn('#d1fae5','#065f46')};font-size:12px" title="Cargar transport al folio">💳 Charge</button>
        <button onclick="trInit()" style="${tr2Btn('#f3f4f6','#374151')}">↺</button>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:10px 20px;background:#f8fafc;border-bottom:1px solid #e5e7eb;flex-wrap:wrap">
        <select id="tr2-retreat-sel" onchange="tr2SetRetreat(this.value)"
          style="padding:6px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:12.5px;font-family:'Jost',sans-serif;color:#374151;outline:none;min-width:180px;max-width:280px">
          <option value="">All retreats</option>
        </select>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:12px;font-weight:600;color:#6b7280;white-space:nowrap">From</span>
          <input type="date" id="tr2-date-from" onchange="tr2SetDateFrom(this.value)"
            style="padding:6px 8px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:12.5px;font-family:'Jost',sans-serif;color:#374151;outline:none">
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:12px;font-weight:600;color:#6b7280;white-space:nowrap">To</span>
          <input type="date" id="tr2-date-to" onchange="tr2SetDateTo(this.value)"
            style="padding:6px 8px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:12.5px;font-family:'Jost',sans-serif;color:#374151;outline:none">
        </div>
        <button id="tr2-clear-btn" onclick="tr2ClearFilters()" style="display:none;background:#fef2f2;color:#dc2626;border:none;padding:5px 10px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif">✕ Clear</button>
        <div style="flex:1"></div>
        <button id="tr2-archive-btn" onclick="tr2ToggleArchived()" style="background:#f1f5f9;color:#6b7280;border:1.5px solid #e5e7eb;padding:5px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif" title="Ver entradas anteriores">📦 Archived</button>
      </div>
      <div id="tr2-body" style="flex:1;overflow-y:auto;padding:20px"></div>
    </div>`;

  tr2View = localStorage.getItem('ama_tr2_view') || 'arrivals';
  tr2ApplyTabStyles();
  tr2LoadData();
}

function tr2SetView(v) {
  tr2View = v;
  if (v !== 'arrivals') tr2UpgradeMode = false;
  localStorage.setItem('ama_tr2_view', v);
  tr2ApplyTabStyles();
  tr2BuildView();
}
function tr2SetRetreat(v) {
  tr2RetreatFilter = v;
  tr2SyncClearBtn();
  const btn = document.getElementById('tr2-copy-link-btn');
  if (btn) btn.textContent = v ? '📋 Copy Retreat Link' : '📋 Copy Guest Link';
  tr2BuildView();
}
function tr2SetDateFrom(v) { tr2DateFrom = v; tr2SyncClearBtn(); tr2BuildView(); }
function tr2SetDateTo(v)   { tr2DateTo   = v; tr2SyncClearBtn(); tr2BuildView(); }
function tr2ClearFilters() {
  tr2RetreatFilter = ''; tr2DateFrom = ''; tr2DateTo = '';
  const sel = document.getElementById('tr2-retreat-sel'); if (sel) sel.value = '';
  const df  = document.getElementById('tr2-date-from');   if (df)  df.value  = '';
  const dt  = document.getElementById('tr2-date-to');     if (dt)  dt.value  = '';
  tr2SyncClearBtn();
  tr2BuildView();
}
function tr2SyncClearBtn() {
  const btn = document.getElementById('tr2-clear-btn');
  if (btn) btn.style.display = (tr2RetreatFilter || tr2DateFrom || tr2DateTo) ? '' : 'none';
}
function tr2ToggleArchived() {
  tr2ShowArchived = !tr2ShowArchived;
  const btn = document.getElementById('tr2-archive-btn');
  if (btn) { btn.style.background = tr2ShowArchived ? '#1a2332' : ''; btn.style.color = tr2ShowArchived ? '#fff' : ''; }
  tr2BuildView();
}

async function tr2LoadData() {
  const body = document.getElementById('tr2-body');
  if (body) body.innerHTML = `<div style="padding:20px;color:#9ca3af;text-align:center">Loading…</div>`;

  const [{ data: rows }, { data: staffData }] = await Promise.all([
    db.from('transport').select('*').order('submitted_at', { ascending: false }),
    db.from('staff').select('id,name,username,role,active').order('name', { ascending: true }),
  ]);

  tr2StaffList = (staffData || []).filter(s => s.active);
  tr2RoomNameToRtId = {};
  AppData.roomTypes.forEach(rt => { (rt.rooms || []).forEach(name => { tr2RoomNameToRtId[name] = rt.id; }); });

  tr2ActiveBooks = AppData.bookings.filter(b => b.status !== 'cancelled');
  const bkMap = {};
  tr2ActiveBooks.forEach(b => { bkMap[b.id] = b; });

  const roomLookup = {}, firstNameIdx = {}, emailRoomIdx = {};
  tr2NameMap = {};
  tr2ActiveBooks.forEach(bk => {
    const retreatLabel = [bk.retreatName, bk.leaderName].filter(Boolean).join(' · ');
    AppData.regs.filter(r => r.bookingId === bk.id).forEach(reg => {
      (reg.guests || []).forEach(g => {
        if (g.name) {
          roomLookup[`${bk.id}|${g.name.toLowerCase()}`] = reg.room || '';
          const firstName = g.name.trim().split(/\s+/)[0].toLowerCase();
          if (firstName.length >= 3) {
            const fk = `${bk.id}|${firstName}`;
            if (!firstNameIdx[fk]) firstNameIdx[fk] = { room: reg.room || '', count: 0 };
            firstNameIdx[fk].count++;
          }
          const key = tr2NormName(g.name);
          if (key) tr2NameMap[key] = { bkId: bk.id, retreatLabel, origName: g.name };
        }
        if (g.email) {
          const ek = `${bk.id}|${g.email.toLowerCase().trim()}`;
          if (!emailRoomIdx[ek]) emailRoomIdx[ek] = { room: reg.room || '', count: 0 };
          emailRoomIdx[ek].count++;
        }
      });
    });
  });

  const sel = document.getElementById('tr2-retreat-sel');
  if (sel) {
    const sorted = [...tr2ActiveBooks].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    sel.innerHTML = `<option value="">All retreats</option>` +
      sorted.map(b => `<option value="${b.id}">${escHtml(b.leaderName)}${b.retreatName ? ` · ${escHtml(b.retreatName)}` : ''} (${fmtDate(b.startDate)})</option>`).join('');
    if (tr2RetreatFilter) sel.value = tr2RetreatFilter;
  }

  const normDate = s => { if (!s) return ''; const p = String(s).trim().split('-'); return p.length === 3 ? `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}` : String(s).trim(); };
  const pickBetter = (cur, row) => {
    const score = r => { const d = r.data || {}; return (d.arrivalDate?2:0)+(d.flightNumber?1:0)+(d.departureDate?1:0)+(r.booking_id?1:0); };
    if (score(row) > score(cur)) return row;
    if (score(row) === score(cur) && String(row.id) > String(cur.id)) return row;
    return cur;
  };
  const dedupedRows = (() => {
    const map = new Map();
    for (const row of rows || []) {
      const d = row.data || {};
      const em = (d.email || '').toLowerCase().trim();
      const fn = (d.firstName || '').toLowerCase().trim();
      const ln = (d.lastName || '').toLowerCase().trim();
      const bk = row.booking_id || (d.bookingId || '');
      const key = em ? `email|${bk}|${em}` : `name|${fn}_${ln}|${normDate(d.arrivalDate)}|${normDate(d.departureDate)}`;
      const cur = map.get(key);
      map.set(key, cur ? pickBetter(cur, row) : row);
    }
    const map2 = new Map();
    for (const row of map.values()) {
      const d = row.data || {};
      const key2 = `${row.booking_id || (d.bookingId||'')}|${(d.firstName||'').toLowerCase().trim()}_${(d.lastName||'').toLowerCase().trim()}|${normDate(d.arrivalDate)}`;
      const cur2 = map2.get(key2);
      map2.set(key2, cur2 ? pickBetter(cur2, row) : row);
    }
    return [...map2.values()];
  })();

  tr2AllEntries = [];
  tr2RawRows = {};
  for (const row of dedupedRows) {
    tr2RawRows[row.id] = row;
    const d = row.data || {};
    const bkId = row.booking_id;
    const bk = bkMap[bkId];
    const name = [d.firstName, d.lastName].filter(Boolean).join(' ');
    const room = roomLookup[`${bkId}|${name.toLowerCase()}`] ?? (() => {
      const fn = (d.firstName || '').trim().toLowerCase();
      if (fn.length >= 3) { const fi = firstNameIdx[`${bkId}|${fn}`]; if (fi && fi.count === 1) return fi.room; }
      const em = (d.email || '').toLowerCase().trim();
      if (em && bkId) { const ei = emailRoomIdx[`${bkId}|${em}`]; if (ei && ei.count === 1) return ei.room; }
      return '';
    })();
    const retreatLabel = bk ? [bk.retreatName, bk.leaderName].filter(Boolean).join(' · ') : 'Sin retiro asignado';

    if (d.arrivalDate && d.arrivalTime) {
      tr2AllEntries.push({
        rowId: row.id, type: 'arrival', date: d.arrivalDate, time: d.arrivalTime, guest: name,
        email: d.email || '', flight: d.flightNumber || '', airport: d.arrivalAirport || '',
        ot: !!d.arrivalOT, share: !!d.willingToShare, notes: d.notes || '', room, retreatId: bkId, retreatLabel,
        eta: d.arrivalOT ? null : tr2AddMins(d.arrivalTime, d.arrivalAirport === 'cancun' ? 90 : 45),
        driverConfirmed: !!d.driver_confirmed, cost: d.serviceCost != null ? Number(d.serviceCost) : null,
      });
    }
    if (d.departureDate && d.departureTime) {
      const depAirport = d.departureAirport || '';
      const pickup = (!d.departureOT && depAirport) ? tr2AddMins(d.departureTime, depAirport === 'cancun' ? -240 : -150) : null;
      tr2AllEntries.push({
        rowId: row.id, type: 'departure', date: d.departureDate, time: d.departureTime, guest: name,
        email: d.email || '', flight: d.flightNumber || '', airport: depAirport,
        ot: !!d.departureOT, share: !!d.willingToShare, notes: d.notes || '', room, retreatId: bkId, retreatLabel,
        eta: null, pickup, driverConfirmed: !!d.driver_confirmed, cost: d.serviceCost != null ? Number(d.serviceCost) : null,
      });
    }
  }

  // Synthetic OT entries — registered guests with no transport form submission,
  // so upgrades can still be offered to guests using their own transport.
  const transportedKeys   = new Set(tr2AllEntries.map(e => `${e.retreatId}|${tr2NormName(e.guest)}`));
  const transportedEmails = new Set(tr2AllEntries.filter(e => e.email?.trim()).map(e => `${e.retreatId}|${e.email.toLowerCase().trim()}`));
  tr2ActiveBooks.forEach(bk => {
    const retreatLabel = [bk.retreatName, bk.leaderName].filter(Boolean).join(' · ');
    AppData.regs.filter(r => r.bookingId === bk.id).forEach(reg => {
      const room = reg.room || '';
      (reg.guests || []).forEach(g => {
        if (!g.name) return;
        if (transportedKeys.has(`${bk.id}|${tr2NormName(g.name)}`)) return;
        if (g.email?.trim() && transportedEmails.has(`${bk.id}|${g.email.toLowerCase().trim()}`)) return;
        tr2AllEntries.push({
          rowId: `synth-${reg.id}-${tr2NormName(g.name)}`, type: 'arrival', date: bk.startDate, time: '',
          guest: g.name, email: g.email || '', flight: '', airport: '', ot: true, share: false, notes: '',
          room, retreatId: bk.id, retreatLabel, eta: null, driverConfirmed: false, cost: null, isSynthetic: true,
        });
      });
    });
  });

  for (const row of dedupedRows) {
    const uc = row.data?.upgradeConfirmed;
    if (uc && !tr2ConfirmedUpgrades.has(row.id)) tr2ConfirmedUpgrades.set(row.id, uc);
  }

  tr2UserGroupMap = new Map();
  tr2UgCounter = 0;
  try {
    const { data: setRow } = await db.from('settings').select('value').eq('key', 'transport_groups').maybeSingle();
    const savedGroups = setRow?.value || [];
    for (const [rowId, gk] of savedGroups) {
      tr2UserGroupMap.set(rowId, gk);
      if (gk.startsWith('ug_')) { const n = parseInt(gk.slice(3)); if (n > tr2UgCounter) tr2UgCounter = n; }
    }
  } catch (e) {}

  tr2BuildView();
}

const TR2_PASTEL = ['#eff6ff','#f0fdf4','#faf5ff','#fffbeb','#fdf2f8','#f0fdfa','#fff7ed','#f0f9ff'];
function tr2ToMins(t) { if (!t) return null; const [h,m] = t.split(':').map(Number); return h*60+(m||0); }
function tr2AssignGroupColors(entries) {
  const colorMap = new Map();
  const clusters = [];
  for (const e of entries) {
    const sortTime = e.type === 'departure' ? (e.pickup || e.time) : e.time;
    const mins = tr2ToMins(sortTime);
    if (!e.date || mins === null) continue;
    const key = `${e.date}|${e.airport}|${e.type}`;
    let joined = false;
    for (const cl of clusters) {
      if (cl.key !== key) continue;
      if (cl.idxs.some(id => Math.abs(tr2ToMins(entries.find(x => x.rowId === id)?.[e.type === 'departure' ? 'pickup' : 'time'] || '') - mins) <= 20)) {
        cl.idxs.push(e.rowId); joined = true; break;
      }
    }
    if (!joined) clusters.push({ key, idxs: [e.rowId] });
  }
  let ci = 0;
  clusters.forEach(cl => { const color = TR2_PASTEL[ci++ % TR2_PASTEL.length]; cl.idxs.forEach(id => colorMap.set(id, color)); });
  return colorMap;
}

function tr2BuildView() {
  const body = document.getElementById('tr2-body');
  if (!body) return;
  tr2GroupKeyMap = new Map();
  let arrTotal = 0, depTotal = 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  const archived = tr2AllEntries.filter(e => !e.isSynthetic && e.date < todayStr);
  const archBtn = document.getElementById('tr2-archive-btn');
  if (archBtn) {
    archBtn.textContent = archived.length ? `📦 Archived (${archived.length})` : '📦 Archived';
    archBtn.style.background = tr2ShowArchived ? '#1a2332' : '';
    archBtn.style.color = tr2ShowArchived ? '#fff' : '';
  }

  const filtered = tr2AllEntries.filter(e => {
    if (tr2View === 'arrivals' && e.type !== 'arrival') return false;
    if (tr2View === 'departures' && e.type !== 'departure') return false;
    if (tr2RetreatFilter && e.retreatId !== tr2RetreatFilter) return false;
    if (tr2DateFrom && e.date < tr2DateFrom) return false;
    if (tr2DateTo && e.date > tr2DateTo) return false;
    if (!tr2ShowArchived && !tr2DateFrom && !tr2DateTo && !tr2RetreatFilter && e.date < todayStr) return false;
    return true;
  }).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const aSort = a.type === 'departure' ? (a.pickup || a.time || '') : (a.time || '');
    const bSort = b.type === 'departure' ? (b.pickup || b.time || '') : (b.time || '');
    return aSort.localeCompare(bSort);
  });

  if (!filtered.length) {
    body.innerHTML = `<div style="padding:60px 20px;text-align:center;color:#9ca3af">
      <div style="font-size:32px;margin-bottom:12px">✈️</div>
      <div style="font-size:15px;font-weight:600;color:#374151;margin-bottom:6px">No transport entries</div>
      <div style="font-size:13px">${tr2RetreatFilter || tr2DateFrom || tr2DateTo ? 'Try adjusting the filters' : 'Guests submit their flight info via the transport form'}</div>
    </div>`;
    return;
  }

  const otEntries = filtered.filter(e => e.ot);
  const normalEntries = filtered.filter(e => !e.ot);
  const colorMap = tr2AssignGroupColors(normalEntries);
  const today = new Date().toISOString().slice(0,10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0,10);

  const TH = (t, w) => `<th style="padding:7px 12px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;text-align:left;white-space:nowrap;${w?'width:'+w:''}border-bottom:2px solid #e5e7eb">${t}</th>`;
  const timeColLabel = tr2View === 'departures' ? 'Pick-up · Hora vuelo' : tr2View === 'arrivals' ? 'Hora vuelo → Hotel' : 'Hora';
  const upgBtn = document.getElementById('tr2-upgrade-btn');
  if (upgBtn) { upgBtn.style.background = tr2UpgradeMode ? '#0d9488' : ''; upgBtn.style.color = tr2UpgradeMode ? '#fff' : ''; }
  const tableHeader = `<thead><tr>
    ${TH('Habitación','80px')}${TH('Nombre')}${TH('Tipo')}${TH('Aeropuerto','90px')}${TH(timeColLabel)}${TH('Retiro')}
    ${tr2UpgradeMode ? TH('Upgrade','200px') : TH('Notas')}
    ${TH('Costo','70px')}${TH('','40px')}
  </tr></thead>`;

  let html = `<div style="padding:0 0 20px"><table style="width:100%;border-collapse:collapse;font-family:'Jost',sans-serif">${tableHeader}<tbody>`;

  if (normalEntries.length) {
    const groups = new Map();
    normalEntries.forEach(e => { if (!groups.has(e.date)) groups.set(e.date, []); groups.get(e.date).push(e); });
    for (const [date, items] of groups) {
      const isToday = date === today, isTmrw = date === tomorrow;
      const label = isToday ? 'Today' : isTmrw ? 'Tomorrow' : fmtDate(date);
      const bg = isToday ? '#ccfbf1' : '#f1f5f9', color = isToday ? '#0f766e' : '#374151';
      html += `<tr><td colspan="9" style="padding:8px 12px;background:${bg};font-size:11px;font-weight:700;color:${color};border-top:2px solid #e5e7eb">${label}</td></tr>`;

      const serviceGroups = [];
      const seen = new Map();
      items.forEach(e => {
        const autoKey = colorMap.get(e.rowId) || ('__solo__' + e.rowId);
        const dirKey = `${e.type}|${e.rowId}`;
        const gk = tr2UserGroupMap.has(dirKey) ? tr2UserGroupMap.get(dirKey) : autoKey;
        if (!seen.has(gk)) { seen.set(gk, serviceGroups.length); serviceGroups.push({ key: gk, color: colorMap.get(e.rowId), entries: [] }); }
        serviceGroups[seen.get(gk)].entries.push(e);
        if (serviceGroups[seen.get(gk)].entries.length === 1) serviceGroups[seen.get(gk)].color = colorMap.get(e.rowId);
      });

      serviceGroups.forEach((svc, si) => {
        const pax = svc.entries.length;
        svc.entries.forEach(e => tr2GroupKeyMap.set(`${e.type}|${e.rowId}`, svc.key));
        const firstDirId = `${svc.entries[0].type}|${svc.entries[0].rowId}`;
        html += `<tr style="background:${svc.color || '#f9fafb'}"
          ondragover="event.preventDefault();this.style.outline='2px solid #4db6ac'"
          ondragleave="this.style.outline=''"
          ondrop="event.preventDefault();this.style.outline='';tr2Drop('${firstDirId}')">
          <td colspan="9" style="padding:3px 12px;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:.3px">${pax} pax · <span style="font-weight:400;opacity:.7">arrastra aquí para unir</span></td>
        </tr>`;
        svc.entries.forEach(e => {
          if (!e.ot) { const c = e.cost ?? tr2AutoRate(e, pax); if (c != null) { if (e.type === 'arrival') arrTotal += c; else depTotal += c; } }
          html += tr2RenderRow(e, svc.color, pax);
        });
        if (si < serviceGroups.length - 1) html += `<tr><td colspan="9" style="padding:8px;background:#fff;border:none"></td></tr>`;
      });
    }
  }

  if (otEntries.length) {
    html += `<tr><td colspan="9" style="padding:8px 12px;background:#fef2f2;font-size:11px;font-weight:700;color:#dc2626;border-top:2px solid #e5e7eb">Own Transport (${otEntries.length})</td></tr>`;
    otEntries.forEach(e => { html += tr2RenderRow(e, null); });
  }

  html += `</tbody></table></div>`;

  let summaryBanner = '';
  if (tr2RetreatFilter) {
    const bk = tr2ActiveBooks.find(b => b.id === tr2RetreatFilter);
    const flags = bk?.flags || [];
    const paysArr = flags.includes('teacher_pays_arrival_transport');
    const paysDep = flags.includes('teacher_pays_departure_transport');
    if (paysArr || paysDep) {
      const parts = [];
      if (paysArr) parts.push(`🛬 Arrivals: <strong>${arrTotal > 0 ? '$' + arrTotal : '—'}</strong>`);
      if (paysDep) parts.push(`🛫 Departures: <strong>${depTotal > 0 ? '$' + depTotal : '—'}</strong>`);
      summaryBanner = `<div style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px;padding:10px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px;font-size:12.5px;color:#92400e">
        <span style="font-size:15px">★</span><span><strong>Teacher pays transport</strong> &nbsp;·&nbsp; ${parts.join(' &nbsp;&nbsp; ')}</span>
      </div>`;
    }
  }
  body.innerHTML = summaryBanner + html;

  const hasUnassigned = tr2AllEntries.some(e => !tr2ActiveBooks.find(b => b.id === e.retreatId));
  const autoBtn = document.getElementById('tr2-automatch-btn');
  if (autoBtn) autoBtn.style.display = hasUnassigned ? '' : 'none';
}

function tr2RenderRow(e, color, groupPax) {
  groupPax = groupPax || 1;
  const isArr = e.type === 'arrival';
  const displayCost = e.cost ?? tr2AutoRate(e, groupPax);
  const TD = (content, style) => `<td style="padding:9px 12px;font-size:12.5px;color:#374151;border-bottom:1px solid rgba(0,0,0,.04);vertical-align:middle;${style||''}">${content}</td>`;

  const typeBadge = isArr
    ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#dbeafe;color:#1d4ed8">🛬 Arrival</span>`
    : `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#fce7f3;color:#9d174d">🛫 Departure</span>`;
  const airportBadge = e.ot
    ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#fef2f2;color:#dc2626">OT</span>`
    : e.airport === 'cancun'
      ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#eff6ff;color:#2563eb">CUN</span>`
      : e.airport === 'tulum'
        ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#f0fdf4;color:#16a34a">TQO</span>`
        : `<span style="font-size:10px;color:#9ca3af">—</span>`;

  const raw = tr2RawRows[e.rowId]?.data || {};
  const charged = isArr ? raw.folioCharged?.arrivalFolioItemId : raw.folioCharged?.departureFolioItemId;
  const paidBy  = isArr ? raw.folioCharged?.arrivalPaidBy      : raw.folioCharged?.departurePaidBy;
  const chargedBadge = charged
    ? `<span style="font-size:9px;padding:1px 6px;border-radius:10px;background:#d1fae5;color:#065f46;font-weight:700">💳 ${paidBy === 'teacher' ? 'Teacher' : 'Folio'} ✓</span>` : '';

  const flightLabelRaw = isArr ? (raw.flightLabel ?? null) : null;
  const flightStatusBadge = (() => {
    if (!isArr || !e.flight) return '';
    const today = new Date().toISOString().slice(0, 10);
    let lbl = flightLabelRaw;
    if (!lbl) lbl = e.date < today ? 'LANDED' : 'SCHEDULED';
    const cancelled = lbl === 'CANCELLED', delayed = lbl.startsWith('DELAYED'), early = lbl.startsWith('EARLY'), landed = lbl === 'LANDED', scheduled = lbl === 'SCHEDULED';
    const bg = cancelled?'#fef2f2':delayed?'#fff7ed':early?'#eff6ff':(landed||scheduled)?'#f1f5f9':'#f0fdf4';
    const cl = cancelled?'#dc2626':delayed?'#c2410c':early?'#1d4ed8':(landed||scheduled)?'#9ca3af':'#15803d';
    return `<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;background:${bg};color:${cl};white-space:nowrap;display:inline-block">${lbl}</span>`;
  })();

  const timeCell = isArr
    ? (e.time ? `<span style="font-weight:700">${tr2FmtTime(e.time)}</span>${e.eta ? `<span style="color:#9ca3af;font-size:11px"> → ~${tr2FmtTime(e.eta)}</span>` : ''}${(e.flight || flightStatusBadge) ? `<div style="font-size:10.5px;color:#6b7280;margin-top:2px;display:flex;align-items:center;gap:4px;flex-wrap:wrap">${e.flight ? escHtml(e.flight) : ''}${flightStatusBadge}</div>` : ''}` : '—')
    : (e.pickup ? `<span style="color:#7e22ce;font-weight:700">🚐 ${tr2FmtTime(e.pickup)}</span>${e.time ? `<span style="color:#9ca3af;font-size:11px"> ✈ ${tr2FmtTime(e.time)}</span>` : ''}` : (e.time ? tr2FmtTime(e.time) : '—'));

  const nameCell = `<div style="font-weight:700;color:#111827">${escHtml(e.guest)}</div>
    ${e.driverConfirmed ? `<span style="font-size:9px;padding:1px 5px;border-radius:10px;background:#d1fae5;color:#065f46;font-weight:600">✓ Chofer</span>` : ''}
    ${e.share ? `<span style="font-size:9px;padding:1px 5px;border-radius:10px;background:#f0fdf4;color:#16a34a;font-weight:600">Shared</span>` : ''}
    ${chargedBadge}`;

  const costCell = displayCost != null
    ? `<span style="font-weight:700;color:#0f766e">$${displayCost}</span>${e.cost == null ? `<span style="font-size:9px;color:#9ca3af;margin-left:2px">auto</span>` : ''}`
    : `<span style="color:#d1d5db;font-size:11px">—</span>`;

  const rowBg = color ? `background:${color}` : '';

  return `<tr style="${rowBg};cursor:grab" draggable="true" ondragstart="tr2DragStart(event,'${e.type}|${e.rowId}')" ondragend="this.style.opacity=''">
    ${TD(e.room ? escHtml(e.room) : `<span style="color:#d1d5db">—</span>`, 'font-weight:600')}
    ${TD(nameCell)}
    ${TD(typeBadge)}
    ${TD(airportBadge, 'text-align:center')}
    ${TD(timeCell)}
    ${TD(e.retreatLabel ? `<span style="font-size:11px;color:#6b7280">${escHtml(e.retreatLabel)}</span>` : '')}
    ${tr2UpgradeMode ? `<td style="padding:7px 10px;border-bottom:1px solid rgba(0,0,0,.04);vertical-align:top">${tr2UpgradeCell(e)}</td>` : TD(e.notes ? `<span style="font-size:11px;color:#6b7280;font-style:italic">${escHtml(e.notes)}</span>` : '')}
    ${TD(costCell)}
    <td style="padding:4px 8px;border-bottom:1px solid #f1f5f9;white-space:nowrap">
      ${!e.isSynthetic && groupPax > 1 ? `<button onclick="tr2SplitEntry('${e.type}|${e.rowId}')" title="Separar del grupo" style="background:#fef2f2;border:none;border-radius:6px;padding:4px 7px;font-size:11px;cursor:pointer;color:#dc2626;line-height:1;margin-right:3px">⊗</button>` : ''}
      <button onclick="tr2EditEntry('${e.rowId}')" title="${e.isSynthetic ? 'Agregar info de vuelo' : 'Editar'}" style="background:#f1f5f9;border:none;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;color:#374151;line-height:1">✏️</button>
    </td>
  </tr>`;
}

// ── Drag and drop grouping ──
function tr2DragStart(event, rowId) { tr2DragSrc = rowId; event.dataTransfer.effectAllowed = 'move'; event.currentTarget?.style && (event.currentTarget.style.opacity = '0.5'); }
async function tr2Drop(targetFirstDirId) {
  if (!tr2DragSrc) return;
  const src = tr2DragSrc; tr2DragSrc = null;
  if (src === targetFirstDirId) return;
  const srcType = src.split('|')[0], tgtType = targetFirstDirId.split('|')[0];
  if (srcType !== tgtType) return;
  let targetKey = tr2GroupKeyMap.get(targetFirstDirId);
  if (!targetKey) return;

  const direction = srcType;
  const dirKey = direction === 'arrival' ? 'arrivalFolioItemId' : 'departureFolioItemId';
  const srcRowId = src.split('|')[1], tgtRowId = targetFirstDirId.split('|')[1];
  const oldSrcKey = tr2GroupKeyMap.get(src);
  const oldSrcGroupChargedIds = oldSrcKey
    ? [...tr2GroupKeyMap.entries()].filter(([dk, gk]) => gk === oldSrcKey && dk !== src && dk.startsWith(direction + '|'))
        .filter(([dk]) => !!tr2RawRows[dk.split('|')[1]]?.data?.folioCharged?.[dirKey]).map(([dk]) => dk.split('|')[1])
    : [];

  if (targetKey.startsWith('#') || targetKey.startsWith('__solo__')) {
    const ugKey = 'ug_' + (++tr2UgCounter);
    for (const [dirId, gk] of tr2GroupKeyMap) { if (gk === targetKey) tr2UserGroupMap.set(dirId, ugKey); }
    targetKey = ugKey;
  }
  tr2UserGroupMap.set(src, targetKey);
  tr2BuildView();
  await tr2SaveGroupSetting();

  const srcHasCharge = !!tr2RawRows[srcRowId]?.data?.folioCharged?.[dirKey];
  const tgtHasCharge = !!tr2RawRows[tgtRowId]?.data?.folioCharged?.[dirKey];
  if (srcHasCharge || tgtHasCharge || oldSrcGroupChargedIds.length) {
    const seenBkIds = new Set();
    const tryAdjust = async (rId) => {
      const bkId = tr2RawRows[rId]?.booking_id;
      const key = bkId ? `${bkId}|${direction}` : `null|${rId}`;
      if (seenBkIds.has(key)) return; seenBkIds.add(key);
      await tr2AdjustCharge(rId, direction);
    };
    if (srcHasCharge) await tryAdjust(srcRowId);
    if (tgtHasCharge) await tryAdjust(tgtRowId);
    for (const rId of oldSrcGroupChargedIds) await tryAdjust(rId);
    await tr2LoadData();
  }
}
async function tr2SaveGroupSetting() {
  try { await db.from('settings').upsert({ key: 'transport_groups', value: [...tr2UserGroupMap], updated_at: new Date().toISOString() }, { onConflict: 'key' }); } catch (e) {}
}
async function tr2ResetGroups() { tr2UserGroupMap.clear(); tr2BuildView(); await tr2SaveGroupSetting(); }
async function tr2SplitEntry(dirId) {
  const actualRowId = dirId.split('|')[1], direction = dirId.split('|')[0];
  const dirKey = direction === 'arrival' ? 'arrivalFolioItemId' : 'departureFolioItemId';
  const oldGroupKey = tr2GroupKeyMap.get(dirId);
  const otherChargedIds = oldGroupKey
    ? [...tr2GroupKeyMap.entries()].filter(([dk, gk]) => gk === oldGroupKey && dk !== dirId && dk.startsWith(direction + '|'))
        .filter(([dk]) => !!tr2RawRows[dk.split('|')[1]]?.data?.folioCharged?.[dirKey]).map(([dk]) => dk.split('|')[1])
    : [];
  tr2UserGroupMap.delete(dirId);
  tr2BuildView();
  await tr2SaveGroupSetting();
  const thisHasCharge = !!tr2RawRows[actualRowId]?.data?.folioCharged?.[dirKey];
  if (thisHasCharge || otherChargedIds.length) {
    const seenBkIds = new Set();
    const tryAdjust = async (rId) => {
      const bkId = tr2RawRows[rId]?.booking_id;
      const key = bkId ? `${bkId}|${direction}` : `null|${rId}`;
      if (seenBkIds.has(key)) return; seenBkIds.add(key);
      await tr2AdjustCharge(rId, direction);
    };
    if (thisHasCharge) await tryAdjust(actualRowId);
    for (const rId of otherChargedIds) await tryAdjust(rId);
    await tr2LoadData();
  }
}

// ── Upgrades ──
function tr2ToggleUpgradeMode() {
  if (tr2View !== 'arrivals') { showToast('Upgrades solo disponible en Arrivals'); return; }
  tr2UpgradeMode = !tr2UpgradeMode;
  tr2BuildView();
}
async function tr2ConfirmUpgrade(rowId, toRtId, selId, staffSelId, pretaxTotal, nights, nightlyRate) {
  const newRoom = document.getElementById(selId)?.value;
  if (!newRoom) return;
  const entry = tr2AllEntries.find(e => e.rowId === rowId);
  if (!entry?.room || !entry.retreatId) { showToast('Sin cuarto asignado'); return; }

  const reg = getRegForRoom(entry.retreatId, entry.room);
  if (!reg) { showToast('No se encontró el registro del huésped'); return; }

  try { await db.from('registrations').update({ room: newRoom, room_type_id: toRtId }).eq('id', reg.id); } catch (e) { showToast('Error: ' + e.message); return; }
  reg.room = newRoom; reg.roomTypeId = toRtId; saveAll();

  const lateral = toRtId === tr2RoomNameToRtId[entry.room];
  const bk = tr2ActiveBooks.find(b => b.id === entry.retreatId);
  if (bk) {
    const oldRoom = entry.room.trim();
    const updatedBlocked = (bk.blockedRooms || []).map(r => r.trim().toLowerCase() === oldRoom.toLowerCase() ? newRoom : r);
    try { await db.from('bookings').update({ blocked_rooms: updatedBlocked }).eq('id', bk.id); bk.blockedRooms = updatedBlocked; saveAll(); }
    catch (e) { showToast('Upgrade OK — error actualizando blocked_rooms: ' + e.message); }
  }

  let staffName = '', staffId = '';
  if (staffSelId) {
    const rawId = document.getElementById(staffSelId)?.value;
    if (rawId) { staffId = rawId; staffName = tr2StaffList.find(s => s.id === rawId)?.name || ''; }
  }

  let folioOk = false;
  if (pretaxTotal != null && pretaxTotal > 0) {
    const upgradeTotal = +(pretaxTotal * 1.16).toFixed(2);
    const commissionAmount = +(pretaxTotal * 0.05).toFixed(2);
    const folioDesc = (nightlyRate && nights) ? `Upgrade $${nightlyRate} × ${nights} noches` : `Room Upgrade: ${entry.room} → ${newRoom}`;
    try {
      const fcRes = await fetch('/.netlify/functions/create-folio-charge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: reg.id, guestName: entry.guest, description: folioDesc, qty: nights || 1, unitPrice: nightlyRate || pretaxTotal, taxRate: 16 }),
      });
      const fcJson = await fcRes.json().catch(() => ({}));
      if (!fcRes.ok) showToast('Error folio (' + fcRes.status + '): ' + (fcJson.error || JSON.stringify(fcJson)));
      else folioOk = true;
    } catch (e) { showToast('Error folio (red): ' + e.message); }

    if (staffId) {
      try {
        await db.from('commissions').insert({
          staff_id: staffId, staff_name: staffName, type: 'upgrade', guest_name: entry.guest, booking_id: entry.retreatId,
          room_from: entry.room, room_to: newRoom, upgrade_pretax: pretaxTotal, upgrade_total: upgradeTotal,
          commission_rate: 0.05, commission_amount: commissionAmount, date: entry.date, status: 'pending',
        });
        showToast(`Upgrade confirmado: ${entry.guest} → ${newRoom}${folioOk ? ' · Cargo en folio ✓' : ''} · Comisión $${commissionAmount} para ${staffName} ✓`);
      } catch (e) { showToast('Upgrade OK — error al guardar comisión: ' + e.message); }
    } else {
      showToast(`Upgrade confirmado: ${entry.guest} → ${newRoom}${folioOk ? ' · Cargo en folio ✓' : ''}`);
    }
  } else {
    showToast(`${lateral ? 'Movido' : 'Upgrade confirmado'}: ${entry.guest} → ${newRoom} ✓`);
  }

  tr2ConfirmedUpgrades.set(rowId, { newRoom, staffName, lateral });
  const rawRow = tr2RawRows[rowId];
  if (rawRow) {
    const updatedData = { ...(rawRow.data || {}), upgradeConfirmed: { newRoom, staffName, lateral } };
    fetch('/.netlify/functions/patch-transport', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rawRow.id, data: updatedData }) }).catch(() => {});
  } else if (rowId.startsWith('synth-')) {
    const nameParts = entry.guest.trim().split(/\s+/);
    try {
      await db.from('transport').insert({ booking_id: entry.retreatId, data: {
        firstName: nameParts[0] || '', lastName: nameParts.slice(1).join(' ') || '', email: entry.email || '',
        arrivalDate: entry.date || '', arrivalOT: true, departureOT: true,
        upgradeConfirmed: { newRoom, staffName, lateral },
      }});
    } catch (e) {}
  }
  await tr2LoadData();
}
async function tr2ClearUpgrade(rowId) {
  tr2ConfirmedUpgrades.delete(rowId);
  const rawRow = tr2RawRows[rowId];
  if (rawRow) {
    const updatedData = { ...(rawRow.data || {}) };
    delete updatedData.upgradeConfirmed;
    fetch('/.netlify/functions/patch-transport', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rawRow.id, data: updatedData }) }).catch(() => {});
    rawRow.data = updatedData;
  }
  tr2BuildView();
}

// ── Manual auto-charge (real Cloudbeds folio charge) ──
function tr2RunAutoCharge() {
  const isArr = tr2View !== 'departures';
  const typeKey = isArr ? 'arrival' : 'departure';
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
  const visibleDates = [...new Set(tr2AllEntries.filter(e => e.type === typeKey && !e.ot && e.date).map(e => e.date))].sort();
  const defaultDate = tr2DateFrom || visibleDates[0] || tomorrow;

  const modal = document.createElement('div');
  modal.id = 'tr2-charge-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <span style="font-size:16px;font-weight:700;color:#111827">💳 Cargar ${isArr ? 'llegadas' : 'salidas'} al folio</span>
        <button onclick="document.getElementById('tr2-charge-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280">×</button>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <label style="font-size:12px;font-weight:600;color:#6b7280;white-space:nowrap">Fecha de ${isArr ? 'llegada' : 'salida'}:</label>
        <input id="tr2-charge-date" type="date" value="${defaultDate}"
          oninput="document.getElementById('tr2-charge-preview').innerHTML=tr2ChargePreview(this.value,'${typeKey}')"
          style="padding:6px 9px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;font-family:'Jost',sans-serif;outline:none">
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <thead><tr style="background:#f8fafc">
          <th style="padding:6px 8px;font-size:11px;font-weight:700;color:#6b7280;text-align:left">Huésped</th>
          <th style="padding:6px 8px;font-size:11px;font-weight:700;color:#6b7280;text-align:left">Retiro</th>
          <th style="padding:6px 8px;font-size:11px;font-weight:700;color:#6b7280;text-align:center">Estado</th>
        </tr></thead>
        <tbody id="tr2-charge-preview">${tr2ChargePreview(defaultDate, typeKey)}</tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button onclick="document.getElementById('tr2-charge-modal').remove()" style="${tr2Btn('#f3f4f6','#374151')}">Cancelar</button>
        <button id="tr2-charge-confirm" onclick="tr2DoCharge(document.getElementById('tr2-charge-date').value,'${typeKey}')" style="${tr2Btn('#065f06','#fff')}">Cargar ahora</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}
function tr2ChargePreview(date, type) {
  type = type || 'arrival';
  if (!date) return '';
  const isArr = type === 'arrival';
  const chargedF = isArr ? 'arrivalFolioItemId' : 'departureFolioItemId';
  const paidByF  = isArr ? 'arrivalPaidBy' : 'departurePaidBy';
  const tFlag    = isArr ? 'teacher_pays_arrival_transport' : 'teacher_pays_departure_transport';
  const rows = tr2AllEntries.filter(e => e.type === type && !e.ot && e.date === date);
  if (!rows.length) return `<tr><td colspan="3" style="padding:16px;text-align:center;color:#9ca3af;font-size:12px">Sin ${isArr ? 'llegadas' : 'salidas'} para esta fecha</td></tr>`;
  return rows.map(e => {
    const charged = !!(tr2RawRows[e.rowId]?.data?.folioCharged?.[chargedF]);
    const paidBy  = tr2RawRows[e.rowId]?.data?.folioCharged?.[paidByF];
    const noRetiro = !e.retreatId;
    const bk = tr2ActiveBooks.find(b => b.id === e.retreatId);
    const teacherPays = (bk?.flags || []).includes(tFlag);
    return `<tr style="font-size:12px;border-bottom:1px solid #f3f4f6">
      <td style="padding:5px 8px;font-weight:600">${escHtml(e.guest)}</td>
      <td style="padding:5px 8px;color:#6b7280">${escHtml(e.retreatLabel || '—')}</td>
      <td style="padding:5px 8px;text-align:center">
        ${charged && paidBy === 'teacher' ? `<span style="background:#fef9c3;color:#854d0e;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px">💳 Teacher ✓</span>`
        : charged ? `<span style="background:#d1fae5;color:#065f46;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px">💳 Folio ✓</span>`
        : noRetiro && !e.guest ? `<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px">Sin nombre</span>`
        : noRetiro ? `<span style="background:#eff6ff;color:#1d4ed8;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px">Al huésped (sin retiro)</span>`
        : teacherPays ? `<span style="background:#fef9c3;color:#854d0e;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px">★ Al teacher</span>`
        : `<span style="background:#eff6ff;color:#1d4ed8;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px">Al huésped</span>`}
      </td>
    </tr>`;
  }).join('');
}
async function tr2DoCharge(date, type) {
  type = type || 'arrival';
  if (!date) return;
  const btn = document.getElementById('tr2-charge-confirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Cargando…'; }
  try {
    const res = await fetch(`/.netlify/functions/auto-charge-transport?date=${encodeURIComponent(date)}&type=${type}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, type }),
    });
    const rawText = await res.text();
    let json = {}; try { json = JSON.parse(rawText); } catch (e) {}
    document.getElementById('tr2-charge-modal')?.remove();
    if (!res.ok) { showToast(`Error ${res.status}: ${rawText.slice(0, 120)}`); return; }
    const charged = json.charged?.length || 0, errors = json.errors?.length || 0, skipped = json.skipped?.length || 0;
    if (errors > 0) { const detail = json.errors.slice(0, 3).map(e => e.name ? `${e.name}: ${e.reason}` : e.reason).join(' · '); showToast(`${charged} cargados · ${errors} errores: ${detail}`); }
    else if (charged === 0) showToast(`Sin entradas nuevas para cargar el ${date}${skipped ? ` · ${skipped} ya cargados` : ''}`);
    else showToast(`💳 ${charged} cargo${charged !== 1 ? 's' : ''} aplicado${charged !== 1 ? 's' : ''} para ${date} ✓`);
    await tr2LoadData();
  } catch (err) {
    showToast('Error: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Cargar ahora'; }
  }
}
async function tr2AdjustCharge(rowId, direction) {
  try {
    const res = await fetch('/.netlify/functions/adjust-transport-charge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowId: String(rowId), direction }) });
    const rawText = await res.text();
    let json = {}; try { json = JSON.parse(rawText); } catch (e) {}
    if (!res.ok) { showToast(`Error ajustando cargo (${res.status}): ${rawText.slice(0, 120)}`); return false; }
    const { voided, recharged } = json;
    const msg = recharged?.length
      ? (recharged[0].paidBy === 'teacher' ? `Cargo ajustado ✓ — $${recharged[0].total} (teacher)` : `Cargo ajustado ✓ — ${recharged.length} huésped${recharged.length !== 1 ? 'es' : ''}`)
      : voided?.length ? `Cargo anulado — sin entradas elegibles` : `Sin cambios de cargo`;
    showToast(msg);
    return true;
  } catch (e) { showToast(`Error ajustando cargo: ${e.message}`); return false; }
}

// ── Driver view / copy links ──
function tr2OpenDriverView(co) { window.open(`${location.origin}/driver-view.html?co=${co}`, '_blank'); }
function tr2CopyFormLink() {
  const url = `${location.origin}/transport-form.html` + (tr2RetreatFilter ? `?bk=${tr2RetreatFilter}` : '');
  navigator.clipboard?.writeText(url).then(() => showToast('Link copiado ✓')) ?? prompt('Copia este link:', url);
}
function tr2CopyIndividualLink() {
  const url = `${location.origin}/transport-form.html`;
  navigator.clipboard?.writeText(url).then(() => showToast('Individual link copiado ✓')) ?? prompt('Copia este link:', url);
}

// ── Helpers ──
function tr2AddMins(timeStr, mins) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const total = ((h * 60 + m + mins) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}
function tr2FmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

// ── Edit modal ──
const TR2_INPUT_S = "width:100%;box-sizing:border-box;padding:6px 9px;border:1.5px solid #e5e7eb;border-radius:7px;font-size:13px;font-family:'Jost',sans-serif;color:#111827;outline:none";
const TR2_LBL_S = 'display:block;font-size:11px;font-weight:600;color:#6b7280;margin-bottom:3px';
function tr2EditEntry(rowId) {
  const isSynth = rowId.startsWith('synth-');
  const row = tr2RawRows[rowId];
  if (!row && !isSynth) return;
  const entry = isSynth ? tr2AllEntries.find(e => e.rowId === rowId) : null;
  const nameParts = entry ? entry.guest.trim().split(/\s+/) : [];
  const d = row?.data || { firstName: nameParts[0]||'', lastName: nameParts.slice(1).join(' ')||'', email: entry?.email||'', arrivalOT:true, departureOT:true };

  const sel = (id, opts, val) => `<select id="${id}" style="${TR2_INPUT_S}">${opts.map(o => `<option value="${o.v}"${o.v===val?' selected':''}>${o.l}</option>`).join('')}</select>`;
  const inp = (id, type, val, placeholder) => `<input id="${id}" type="${type}" value="${escHtml(val==null?'':val)}" placeholder="${placeholder||''}" style="${TR2_INPUT_S}">`;
  const chk = (id, checked, label) => `<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:#374151;cursor:pointer"><input id="${id}" type="checkbox" ${checked?'checked':''}> ${label}</label>`;
  const airportOpts = [{v:'cancun',l:'CUN – Cancún'},{v:'tulum',l:'TQO – Tulum'}];

  const modal = document.createElement('div');
  modal.id = 'tr2-edit-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;width:100%;max-width:540px;max-height:90vh;overflow-y:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <span style="font-size:16px;font-weight:700;color:#111827">Editar transporte</span>
        <button onclick="document.getElementById('tr2-edit-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280">×</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="${TR2_LBL_S}">Nombre</label>${inp('tr2-e-fn','text',d.firstName)}</div>
        <div><label style="${TR2_LBL_S}">Apellido</label>${inp('tr2-e-ln','text',d.lastName)}</div>
        <div style="grid-column:1/-1"><label style="${TR2_LBL_S}">Email</label>${inp('tr2-e-email','email',d.email)}</div>
      </div>
      <div style="margin:14px 0 6px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Llegada</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="${TR2_LBL_S}">Fecha</label>${inp('tr2-e-arr-date','date',d.arrivalDate)}</div>
        <div><label style="${TR2_LBL_S}">Hora</label>${inp('tr2-e-arr-time','time',d.arrivalTime)}</div>
        <div><label style="${TR2_LBL_S}">Aeropuerto</label>${sel('tr2-e-arr-airport',airportOpts,d.arrivalAirport||'cancun')}</div>
        <div><label style="${TR2_LBL_S}">Vuelo</label>${inp('tr2-e-flight','text',d.flightNumber,'AA1234')}</div>
        <div style="grid-column:1/-1">${chk('tr2-e-arr-ot',!!d.arrivalOT,'Own Transport (no necesita transfer)')}</div>
      </div>
      <div style="margin:14px 0 6px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Salida</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="${TR2_LBL_S}">Fecha</label>${inp('tr2-e-dep-date','date',d.departureDate)}</div>
        <div><label style="${TR2_LBL_S}">Hora</label>${inp('tr2-e-dep-time','time',d.departureTime)}</div>
        <div><label style="${TR2_LBL_S}">Aeropuerto</label>${sel('tr2-e-dep-airport',airportOpts,d.departureAirport||'cancun')}</div>
        <div style="grid-column:1/-1">${chk('tr2-e-dep-ot',!!d.departureOT,'Own Transport (no necesita transfer)')}</div>
      </div>
      <div style="margin:14px 0 6px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Extra</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${chk('tr2-e-share',!!d.willingToShare,'Dispuesto a compartir transfer')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label style="${TR2_LBL_S}">Costo del servicio (USD)</label>${inp('tr2-e-cost','number',d.serviceCost??'','95')}</div>
        </div>
        <div><label style="${TR2_LBL_S}">Notas</label><textarea id="tr2-e-notes" rows="2" style="${TR2_INPUT_S};resize:vertical">${escHtml(d.notes||'')}</textarea></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:20px;gap:8px">
        ${!isSynth ? `<button onclick="tr2DeleteEntry('${rowId}')" style="background:#fef2f2;color:#dc2626;border:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif">Eliminar</button>` : '<div></div>'}
        <div style="display:flex;gap:8px">
          <button onclick="document.getElementById('tr2-edit-modal').remove()" style="${tr2Btn('#f3f4f6','#374151')}">Cancelar</button>
          <button onclick="tr2SaveEdit('${rowId}')" style="${tr2Btn('#0f766e','#fff')}">Guardar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
}
async function tr2SaveEdit(rowId) {
  const isSynth = rowId.startsWith('synth-');
  const g = id => document.getElementById(id);
  const oldData = tr2RawRows[rowId]?.data || {};
  const updatedData = {
    ...oldData,
    firstName: g('tr2-e-fn')?.value.trim() || '', lastName: g('tr2-e-ln')?.value.trim() || '', email: g('tr2-e-email')?.value.trim() || '',
    arrivalDate: g('tr2-e-arr-date')?.value || '', arrivalTime: g('tr2-e-arr-time')?.value || '', arrivalAirport: g('tr2-e-arr-airport')?.value || 'cancun',
    flightNumber: g('tr2-e-flight')?.value.trim() || '', arrivalOT: g('tr2-e-arr-ot')?.checked || false,
    departureDate: g('tr2-e-dep-date')?.value || '', departureTime: g('tr2-e-dep-time')?.value || '', departureAirport: g('tr2-e-dep-airport')?.value || 'cancun',
    departureOT: g('tr2-e-dep-ot')?.checked || false, willingToShare: g('tr2-e-share')?.checked || false, notes: g('tr2-e-notes')?.value.trim() || '',
    serviceCost: g('tr2-e-cost')?.value !== '' ? Number(g('tr2-e-cost').value) : null,
  };

  const hadArrCharge = !!oldData.folioCharged?.arrivalFolioItemId, hadDepCharge = !!oldData.folioCharged?.departureFolioItemId;
  const arrChanged = hadArrCharge && (oldData.arrivalTime !== updatedData.arrivalTime || oldData.arrivalAirport !== updatedData.arrivalAirport || !!oldData.arrivalOT !== updatedData.arrivalOT);
  const depChanged = hadDepCharge && (oldData.departureTime !== updatedData.departureTime || oldData.departureAirport !== updatedData.departureAirport || !!oldData.departureOT !== updatedData.departureOT);

  const thisBkId = tr2RawRows[rowId]?.booking_id;
  const crossGroupCharged = (direction, dirKey) => {
    const groupKey = tr2GroupKeyMap.get(`${direction}|${rowId}`);
    if (!groupKey) return [];
    return [...tr2GroupKeyMap.entries()].filter(([dk, gk]) => gk === groupKey && dk !== `${direction}|${rowId}` && dk.startsWith(direction + '|'))
      .filter(([dk]) => { const rId = dk.split('|')[1]; return !!tr2RawRows[rId]?.data?.folioCharged?.[dirKey] && tr2RawRows[rId]?.booking_id !== thisBkId; })
      .map(([dk]) => dk.split('|')[1]);
  };
  const arrCrossCharged = arrChanged ? crossGroupCharged('arrival', 'arrivalFolioItemId') : [];
  const depCrossCharged = depChanged ? crossGroupCharged('departure', 'departureFolioItemId') : [];

  const btn = document.querySelector('#tr2-edit-modal button[onclick*="tr2SaveEdit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  if (isSynth) {
    const entry = tr2AllEntries.find(e => e.rowId === rowId);
    try {
      await db.from('transport').insert({ booking_id: entry?.retreatId || null, data: updatedData });
      document.getElementById('tr2-edit-modal')?.remove();
      showToast('Transporte creado ✓');
      await tr2LoadData();
    } catch (e) { showToast('Error al guardar: ' + e.message); if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; } }
    return;
  }

  try {
    await db.from('transport').update({ data: updatedData }).eq('id', rowId);
    document.getElementById('tr2-edit-modal')?.remove();
    showToast('Transporte actualizado ✓');
    if (arrChanged) {
      await tr2AdjustCharge(rowId, 'arrival');
      const seen = new Set([thisBkId]);
      for (const rId of arrCrossCharged) { const bkId = tr2RawRows[rId]?.booking_id; if (!seen.has(bkId)) { seen.add(bkId); await tr2AdjustCharge(rId, 'arrival'); } }
    }
    if (depChanged) {
      await tr2AdjustCharge(rowId, 'departure');
      const seen = new Set([thisBkId]);
      for (const rId of depCrossCharged) { const bkId = tr2RawRows[rId]?.booking_id; if (!seen.has(bkId)) { seen.add(bkId); await tr2AdjustCharge(rId, 'departure'); } }
    }
    await tr2LoadData();
  } catch (e) { showToast('Error al guardar: ' + e.message); if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; } }
}
async function tr2DeleteEntry(rowId) {
  if (!confirm('¿Eliminar este registro de transporte?')) return;
  try {
    await db.from('transport').delete().eq('id', rowId);
    document.getElementById('tr2-edit-modal')?.remove();
    showToast('Registro eliminado');
    await tr2LoadData();
  } catch (e) { showToast('Error al eliminar: ' + e.message); }
}

// ── Auto-match (name-based, for entries with no retreat assigned) ──
function tr2NormName(name) {
  return (name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, '').trim().split(/\s+/).sort().join(' ');
}
function tr2AutoMatch() {
  const unassignedRowIds = new Set(tr2AllEntries.filter(e => !tr2ActiveBooks.find(b => b.id === e.retreatId)).map(e => e.rowId));
  if (!unassignedRowIds.size) { showToast('No hay entradas sin retiro'); return; }
  const proposed = [], unmatched = [];
  for (const rowId of unassignedRowIds) {
    const row = tr2RawRows[rowId]; if (!row) continue;
    const d = row.data || {};
    const guestName = [d.firstName, d.lastName].filter(Boolean).join(' ');
    const key = tr2NormName(guestName);
    const match = tr2NameMap[key];
    const keyFirst = tr2NormName(d.firstName || ''), keyLast = tr2NormName(d.lastName || '');
    const partialMatch = !match && Object.entries(tr2NameMap).find(([k]) => k.includes(keyFirst) && keyFirst.length > 2 && k.includes(keyLast) && keyLast.length > 2);
    if (match) proposed.push({ rowId, guestName, email: d.email || '', match, confidence: 'Alta' });
    else if (partialMatch) proposed.push({ rowId, guestName, email: d.email || '', match: partialMatch[1], confidence: 'Media', note: `Nombre registrado: ${partialMatch[1].origName}` });
    else unmatched.push({ rowId, guestName, email: d.email || '' });
  }

  const modal = document.createElement('div');
  modal.id = 'tr2-match-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  const rowsHtml = proposed.map((p, i) => `
    <tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:8px 10px">
        <input type="checkbox" id="tr2-match-chk-${i}" checked style="margin-right:6px">
        <span style="font-size:13px;font-weight:600;color:#111827">${escHtml(p.guestName)}</span>
        ${p.email ? `<div style="font-size:11px;color:#9ca3af">${escHtml(p.email)}</div>` : ''}
      </td>
      <td style="padding:8px 10px;font-size:12px;color:#374151">
        ${escHtml(p.match.retreatLabel)}
        ${p.note ? `<div style="font-size:11px;color:#f59e0b">${escHtml(p.note)}</div>` : ''}
      </td>
      <td style="padding:8px 10px;text-align:center">
        <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:${p.confidence==='Alta'?'#dcfce7':'#fef3c7'};color:${p.confidence==='Alta'?'#166534':'#92400e'}">${p.confidence}</span>
      </td>
    </tr>`).join('');
  const unmatchedHtml = unmatched.length ? `
    <div style="margin-top:12px;padding:10px;background:#fef2f2;border-radius:8px;font-size:12px;color:#dc2626">
      <strong>Sin match (${unmatched.length}):</strong> ${unmatched.map(u => escHtml(u.guestName || u.email || 'Desconocido')).join(', ')}
    </div>` : '';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;width:100%;max-width:640px;max-height:90vh;overflow-y:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:16px;font-weight:700;color:#111827">Asignación automática por nombre</span>
        <button onclick="document.getElementById('tr2-match-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280">×</button>
      </div>
      <p style="font-size:12px;color:#6b7280;margin:0 0 14px">Matches encontrados comparando el nombre del huésped con las registrations. Desmarca los que no sean correctos.</p>
      ${proposed.length ? `
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f8fafc">
          <th style="padding:7px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Huésped</th>
          <th style="padding:7px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Retiro propuesto</th>
          <th style="padding:7px 10px;text-align:center;font-size:11px;color:#6b7280;font-weight:600">Confianza</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>` : `<p style="color:#9ca3af;font-size:13px;text-align:center;padding:20px">No se encontraron matches por nombre.</p>`}
      ${unmatchedHtml}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
        <button onclick="document.getElementById('tr2-match-modal').remove()" style="${tr2Btn('#f3f4f6','#374151')}">Cancelar</button>
        ${proposed.length ? `<button onclick="tr2ConfirmMatches(${JSON.stringify(proposed.map((p,i)=>({rowId:p.rowId,bkId:p.match.bkId,idx:i})))})" style="${tr2Btn('#0f766e','#fff')}">Confirmar seleccionados</button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(modal);
}
async function tr2ConfirmMatches(items) {
  const toSave = items.filter(item => document.getElementById(`tr2-match-chk-${item.idx}`)?.checked);
  if (!toSave.length) { showToast('Ninguno seleccionado'); return; }
  const btn = document.querySelector('#tr2-match-modal button[onclick*="tr2ConfirmMatches"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  let ok = 0, fail = 0;
  await Promise.all(toSave.map(async ({ rowId, bkId }) => {
    try { await db.from('transport').update({ booking_id: bkId }).eq('id', rowId); ok++; } catch (e) { fail++; }
  }));
  document.getElementById('tr2-match-modal')?.remove();
  showToast(ok ? `${ok} asignados correctamente${fail ? `, ${fail} fallaron` : ''}` : 'Error al guardar');
  if (ok) await tr2LoadData();
}

// Hook into tab switch
const _origSwitchTab = window.switchTab;
window.switchTab = function(id, btn) {
  if (typeof _origSwitchTab === 'function') _origSwitchTab(id, btn);
  if (id === 'transport') trInit();
};
