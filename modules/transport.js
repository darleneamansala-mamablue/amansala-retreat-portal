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
/** Room-list roster is source of truth for who should submit transport. */
function getTransportRoster(bkId){
  const allSubs=loadTransport().filter(s=>s.bookingId===bkId&&s.status!=='cancelled');
  // Includes the teacher's own room (isTeacherRoom) — she needs transport too,
  // and excluding her here meant her own submission never showed anywhere: not
  // under her name (filtered out of the roster) and not even attributed to her
  // by mistake once the email-collision fix stopped that (Jorge's report
  // 2026-09-17: "sigo sin ver Marcia en My Transportation, no se debe de excluir").
  const roster=[];
  // A room removed from the retreat's own room list (blockedRooms) can still
  // have a leftover registrations row -- without this check that orphaned reg
  // kept the guest on the teacher's own "My Transport" roster after being
  // removed from her room list (Jorge's report 2026-09-30: "en monica teacher
  // view my tranpsort sigue saliendo gv13 y ya ni estan ahi" -- same fix
  // already applied to the admin Transport tab's synthetic-entries loop).
  const _rosterBk=AppData.bookings.find(b=>b.id===bkId);
  AppData.regs.filter(r=>r.bookingId===bkId&&(!_rosterBk||roomListIncludes(_rosterBk.blockedRooms,r.room))).forEach(r=>{
    (r.guests||[]).filter(g=>g.name).forEach(g=>{
      roster.push({name:g.name,email:(g.email||r.email||'').trim(),room:r.room||''});
    });
  });
  const usedIdx=new Set();
  const guestSub=new Map(); // guest (roster entry) → matched sub, for a 1:1 per-guest view
  // Jorge's report 2026-10-20 (Carter Foxworth): the admin Transport tab and the
  // teacher's own "My Transport" showed different ride groupings for the same
  // retreat. Root cause: a guest who resubmitted the form (updated flight info)
  // leaves an old, stale duplicate row alongside the new one -- the admin board
  // already picks the most complete/newest one (tr2LoadData's pickBetter), but
  // this match used to just take whichever duplicate happened to come first in
  // allSubs, with no preference for which one was actually current. When more
  // than one unused submission matches a guest, pick the same way: most
  // complete info, then highest id as a tiebreak.
  const _trSubScore=s=>(s.arrivalDate?2:0)+(s.flightNumber?1:0)+(s.departureDate?1:0)+(s.bookingId?1:0);
  const matchGuest=(guest,predicate)=>{
    if(guestSub.has(guest))return;
    let idx=-1;
    allSubs.forEach((s,i)=>{
      if(usedIdx.has(i)||!predicate(s))return;
      if(idx<0)return void(idx=i);
      const sa=_trSubScore(allSubs[idx]),sb=_trSubScore(s);
      if(sb>sa||(sb===sa&&String(s.id)>String(allSubs[idx].id)))idx=i;
    });
    if(idx>=0){usedIdx.add(idx);guestSub.set(guest,allSubs[idx]);}
  };

  // Tier 1: email match — but ONLY when this email actually identifies a single
  // roster guest. Several room-list entries fall back to the retreat leader's own
  // email as a generic placeholder when the real guest never gave one — trusting
  // a shared placeholder as an identity match let one guest's real submission get
  // stolen by a completely different guest who happened to share it (Jorge's
  // report 2026-09-17: Marcia Hoffheins' own submission was showing up attached to
  // "Carla Carla" because both used marciahoffheins@gmail.com in the room list).
  const emailCounts=new Map();
  roster.forEach(g=>{const em=(g.email||'').toLowerCase().trim();if(em)emailCounts.set(em,(emailCounts.get(em)||0)+1);});
  roster.forEach(guest=>{
    const em=(guest.email||'').toLowerCase().trim();
    if(!em||emailCounts.get(em)!==1)return;
    matchGuest(guest,s=>(s.email||'').toLowerCase().trim()===em);
  });

  // Tier 2: exact full name.
  roster.forEach(guest=>matchGuest(guest,s=>trNormName(guest.name)===trTransportFullName(s)));

  // Tier 3: a room-list name that's abbreviated ("Billy S", "MIchelle M") never
  // exact-matches the guest's own fuller self-submitted name ("Billy Stalcup") —
  // but if that first name belongs to only ONE roster guest in this booking, it's
  // unambiguous — the same "unique first name in this booking" fallback the admin
  // Transportation tab already uses (tr2BuildView's firstNameIdx), which is why
  // that tab showed these guests correctly while My Transportation showed them as
  // "not submitted" for the exact same data.
  const firstNameCounts=new Map();
  roster.forEach(g=>{
    const fn=g.name.trim().split(/\s+/)[0].toLowerCase();
    if(fn.length<3)return;
    firstNameCounts.set(fn,(firstNameCounts.get(fn)||0)+1);
  });
  roster.forEach(guest=>{
    const fn=guest.name.trim().split(/\s+/)[0].toLowerCase();
    if(fn.length<3||firstNameCounts.get(fn)!==1)return;
    matchGuest(guest,s=>(s.firstName||'').trim().toLowerCase()===fn);
  });

  const missing=roster.filter(guest=>!guestSub.has(guest));
  // A guest who re-submits the form (e.g. to update a flight change) leaves a
  // SECOND row that the greedy one-sub-per-guest match above never consumes —
  // that's a duplicate of someone already on the room list, not a stranger.
  // Only flag a submission as a real "not on your room list" orphan when its
  // email/name doesn't identify ANY roster guest at all (confirmed real
  // incident 2026-09-22: Beth Stuart's group — Michelle Toussaint, Holly
  // Schaefer, Cheryl Zimmerman and Beth Stuart herself each submitted twice,
  // and the leftover duplicate wrongly showed as "not on your room list").
  const rosterEmails=new Set(roster.map(g=>(g.email||'').toLowerCase().trim()).filter(Boolean));
  const rosterNames=new Set(roster.map(g=>trNormName(g.name)));
  const trueOrphans=allSubs.filter((s,i)=>{
    if(usedIdx.has(i))return false;
    const em=(s.email||'').toLowerCase().trim();
    if(em&&rosterEmails.has(em))return false;
    if(rosterNames.has(trTransportFullName(s)))return false;
    return true;
  });
  return{
    roster,
    allSubs,
    matchedSubs:[...guestSub.values()],
    missing,
    submittedCount:roster.length-missing.length,
    orphanSubs:trueOrphans,
    // One row per room-list guest, whether or not they've submitted — for views that
    // need to show "not yet submitted" guests inline instead of in a separate list.
    guestsWithTransport:roster.map(guest=>({...guest,tr:guestSub.get(guest)||null}))
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
// submitted transport info (getTransportRoster above).

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
// Two subs auto-group within a 20-minute window of each other -- same
// window in the admin Transport board, driver-view.html, AND Teacher Portal
// (_trAssignRideGroups was still using 30 min until Jorge's report
// 2026-10-06 that the two views showed different groupings/pricing for the
// same retreat). Staff can
// also manually drag-and-drop entries together in the admin board — that
// override lives in settings.transport_groups (tr2UserGroupMap / tr2Drop /
// tr2SaveGroupSetting) keyed by `${arrival|departure}|${transport.id}`, shared
// live by Teacher Portal (_trAssignRideGroups / _trGlobalGroupPax) and
// driver-view.html (colorMap/buildPickupGroups/buildEtaGroups) — not a
// per-sub shareGroupId field. It overrides the time window and can span
// retreats, which is why per-person price recalculates via
// trGetPrice(airport, grp.length) (or the true cross-retreat headcount).

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

  // Collect rooms unavailable during this booking's dates. Also cross-checks
  // real registrations, not just blockedRooms — a room can have a named
  // guest registered in it whose room was never added to blockedRooms
  // ("orphaned registration"; confirmed real incidents: Katherine
  // McClelland's CH3a/CH3b, Monica's 5B/GV13a/GV13b).
  const busyRooms=new Set();
  AppData.bookings.forEach(b=>{
    if(b.status==='cancelled'||b.id===bk.id)return; // own retreat's blocked rooms may still be available
    if(b.startDate<bk.endDate&&b.endDate>bk.startDate){
      (b.blockedRooms||[]).forEach(r=>busyRooms.add(r));
      AppData.regs.filter(r=>r.bookingId===b.id&&r.room&&(r.guests||[]).some(g=>g.name)).forEach(r=>busyRooms.add(r.room));
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

// Jorge's ask 2026-10-15: staff-editable in Admin > Settings instead of hardcoded here —
// reads the live PortalSettings global (booking-hub.html), falling back to these same
// numbers if that screen was never saved.
function tr2Rates() { return (typeof PortalSettings !== 'undefined' && PortalSettings.transportRates) || { cancun: [195, 100, 80, 65, 55, 45], tulum: [145, 80, 65, 55, 45, 40] }; }
function tr2AutoRate(e, groupPax) {
  groupPax = groupPax || 1;
  if (e.ot) return 0;
  const rates = tr2Rates();
  const tbl = e.airport === 'cancun' ? rates.cancun : e.airport === 'tulum' ? rates.tulum : null;
  if (!tbl) return null;
  return tbl[Math.min(groupPax - 1, tbl.length - 1)];
}

let tr2View          = 'arrivals';
let tr2RetreatFilter = '';
let tr2RetreatLabelMap  = {}; // label (lowercased) -> booking id, for the retreat search box
let tr2RetreatIdToLabel = {}; // booking id -> display label
let tr2DateFrom      = '';
let tr2DateTo        = '';
let tr2ShowArchived  = false;
let tr2AllEntries    = [];
let tr2ActiveBooks   = [];
let tr2ActiveRequests = [];
let tr2RawRows       = {};   // id → full row (for edit modal)
let tr2NameMap       = {};   // normalizedName → { bkId, retreatLabel, origName }
let tr2UserGroupMap  = new Map(); // dirId → groupKey (loaded from settings.transport_groups)
let tr2GroupKeyMap   = new Map(); // dirId → groupKey (current render snapshot, for drop targets)
let tr2DragSrc       = null;
let tr2UgCounter     = 0;
let tr2UpgradeMode   = false;
let tr2RoomNameToRtId = {};
let tr2RoomNameToRtIdNorm = {};
let tr2StaffList     = [];

// Some stored room values don't match the canonical room-list casing/spacing exactly
// (e.g. a guest's room saved as "2b" when the canonical list has "2B", or "Casita 4/1"
// vs "Casita 4 / 1") -- Jorge's report 2026-10-19: the print's room-type sort scrambled
// these entries because the exact-match lookup returned undefined for them. Normalize
// (lowercase, strip whitespace) as a fallback so a stray case/spacing difference doesn't
// silently break the room->room-type lookup anywhere it's used.
const _tr2NormRoom = s => String(s || '').toLowerCase().replace(/\s+/g, '');
const tr2LookupRtId = room => (room && (tr2RoomNameToRtId[room] || tr2RoomNameToRtIdNorm[_tr2NormRoom(room)])) || undefined;
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
    }) &&
    // Jorge's report 2026-10-18: a room with an individual (Booking Engine/Direct/OTA)
    // same-day arrival showed as available for upgrade -- this function only ever checked
    // retreat/group bookings.blockedRooms, never booking_requests (which has its own `room`
    // column and isn't part of any bookings row's blockedRooms array at all). Checked-in
    // status is irrelevant here -- the room is reserved for that guest the moment the
    // reservation exists, whether or not they've physically checked in yet.
    !tr2ActiveRequests.some(r => {
      if (r.check_out < bkStart || r.check_in > bkEnd) return false;
      return r.room === roomName;
    }) &&
    // Within the guest's OWN retreat, a room already assigned to a DIFFERENT named guest isn't
    // free either -- the `b.id === ownBkId` skip above exists so a guest can be offered a room
    // still free on their own retreat's block, but it accidentally skipped checking same-retreat
    // occupancy entirely (Jorge's report 2026-10-18: room 33, already Billy S & Michelle M's
    // room on Marcia Hoffheins' own retreat, kept showing as an upgrade option for Laura Myzk,
    // a different guest on the SAME retreat).
    !AppData.regs.some(reg => reg.bookingId === ownBkId && reg.room === roomName && !reg.cancelled && (reg.guests || []).some(g => g.name && !g.cancelled))
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

  const rtId = tr2LookupRtId(e.room);
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
      ? `<span style="color:#9ca3af;font-size:11px;font-weight:600">N/A</span>`
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

// "Options" column (Jorge's ask 2026-10-18): a lateral SAME-category swap between two
// guests arriving the same day who haven't checked in yet -- e.g. Jorge in GV3, Pedro in
// GV5 (both Garden View, both arriving today, neither checked in) can trade outright so
// Jorge ends up in GV5 and Pedro in GV3. This is a logistics move, not an Upgrade (that's
// a different, better room type with its own price/folio/commission handling below) --
// only candidates in the SAME room type as this row's own room are ever offered.
function tr2OptionsCell(e) {
  if (!e.room || !e.regId || e.type !== 'arrival') return `<span style="color:#9ca3af;font-size:11px">—</span>`;
  const rtId = tr2LookupRtId(e.room);
  if (!rtId) return `<span style="color:#9ca3af;font-size:11px">Sin tipo</span>`;
  const seen = new Set();
  const candidates = tr2AllEntries.filter(c =>
    c.type === 'arrival' && c.regId && c.regId !== e.regId && c.room &&
    c.date === e.date && !c.checkedIn &&
    c.room.toLowerCase() !== e.room.toLowerCase() &&
    tr2LookupRtId(c.room) === rtId
  ).filter(c => { if (seen.has(c.regId)) return false; seen.add(c.regId); return true; });

  if (!candidates.length) return `<span style="color:#9ca3af;font-size:11px">Sin opciones</span>`;
  return `<div style="display:flex;flex-wrap:wrap;gap:3px">${candidates.map(c => `
    <button onclick="tr2SwapRooms('${e.rowId}','${c.regId}')" title="Intercambiar cuartos con ${escHtml(c.guest)}"
      style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:3px 6px;font-size:10px;font-weight:600;color:#374151;cursor:pointer;font-family:'Jost',sans-serif;white-space:nowrap">
      ↔ ${escHtml(c.room)} · ${escHtml(c.guest.trim().split(/\s+/)[0])}
    </button>`).join('')}</div>`;
}

async function tr2SwapRooms(rowId, candidateRegId) {
  const entry = tr2AllEntries.find(x => x.rowId === rowId);
  if (!entry?.regId || !entry.room) { showToast('Sin cuarto asignado'); return; }
  const regA = AppData.regs.find(r => r.id === entry.regId);
  const regB = AppData.regs.find(r => r.id === candidateRegId);
  if (!regA || !regB) { showToast('No se encontró el registro del huésped'); return; }
  const roomA = regA.room, roomB = regB.room;
  if (!roomA || !roomB) { showToast('Falta cuarto asignado'); return; }
  const guestBEntry = tr2AllEntries.find(x => x.regId === candidateRegId && x.type === 'arrival');
  const guestBName = guestBEntry?.guest || 'el otro huésped';
  if (!confirm(`¿Intercambiar cuartos?\n\n${entry.guest}: ${roomA} → ${roomB}\n${guestBName}: ${roomB} → ${roomA}`)) return;

  try {
    await db.from('registrations').update({ room: roomB }).eq('id', regA.id);
    await db.from('registrations').update({ room: roomA }).eq('id', regB.id);
  } catch (err) { showToast('Error: ' + err.message); return; }
  regA.room = roomB; regB.room = roomA;

  // Keep each retreat's blocked_rooms list in sync too (same reason tr2ConfirmUpgrade
  // does this for a real Upgrade) -- one update covering both swaps when it's the same
  // retreat/booking, two separate ones when the guests belong to different bookings.
  try {
    const bkA = tr2ActiveBooks.find(b => b.id === regA.bookingId);
    const bkB = tr2ActiveBooks.find(b => b.id === regB.bookingId);
    if (bkA && bkB && bkA.id === bkB.id) {
      const updated = (bkA.blockedRooms || []).map(r => {
        const rl = r.trim().toLowerCase();
        if (rl === roomA.trim().toLowerCase()) return roomB;
        if (rl === roomB.trim().toLowerCase()) return roomA;
        return r;
      });
      await db.from('bookings').update({ blocked_rooms: updated }).eq('id', bkA.id);
      bkA.blockedRooms = updated;
    } else {
      if (bkA) {
        const updatedA = (bkA.blockedRooms || []).map(r => r.trim().toLowerCase() === roomA.trim().toLowerCase() ? roomB : r);
        await db.from('bookings').update({ blocked_rooms: updatedA }).eq('id', bkA.id);
        bkA.blockedRooms = updatedA;
      }
      if (bkB) {
        const updatedB = (bkB.blockedRooms || []).map(r => r.trim().toLowerCase() === roomB.trim().toLowerCase() ? roomA : r);
        await db.from('bookings').update({ blocked_rooms: updatedB }).eq('id', bkB.id);
        bkB.blockedRooms = updatedB;
      }
    }
  } catch (err) { showToast('Cuartos intercambiados — error actualizando blocked_rooms: ' + err.message); }

  saveAll();
  showToast(`Intercambiado: ${entry.guest} → ${roomB} · ${guestBName} → ${roomA} ✓`);
  await tr2LoadData();
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
        <input type="text" id="tr2-retreat-search" list="tr2-retreat-list" placeholder="🔍 Buscar retiro…" autocomplete="off"
          oninput="tr2SetRetreatByLabel(this.value)"
          style="padding:6px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:12.5px;font-family:'Jost',sans-serif;color:#374151;outline:none;min-width:200px;max-width:280px">
        <datalist id="tr2-retreat-list"></datalist>
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
        <button onclick="tr2PrintView()" style="background:#f1f5f9;color:#374151;border:1.5px solid #e5e7eb;padding:5px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif" title="Imprimir lo que se ve ahora (mismos filtros)">🖨 Imprimir</button>
        <button id="tr2-week-btn" onclick="tr2ToggleWeekSummary()" style="background:#eef2ff;color:#4338ca;border:1.5px solid #e5e7eb;padding:5px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif" title="Ver cuántas llegadas y salidas hay cada día">📅 Resumen semanal</button>
        <button id="tr2-archive-btn" onclick="tr2ToggleArchived()" style="background:#f1f5f9;color:#6b7280;border:1.5px solid #e5e7eb;padding:5px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif" title="Ver entradas anteriores">📦 Archived</button>
      </div>
      <div id="tr2-body" style="flex:1;overflow-y:auto;padding:20px"></div>
    </div>`;

  tr2View = localStorage.getItem('ama_tr2_view') || 'arrivals';
  tr2ApplyTabStyles();
  tr2SyncWeekBtn();
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
// Free-text retreat search (Jorge's ask 2026-10-18: typing to find a retreat
// instead of scrolling a dropdown) -- resolves what's typed against the label
// map built in tr2LoadData() and only commits once it matches a real retreat
// exactly (e.g. after picking a <datalist> suggestion); any other text is
// treated the same as "All retreats" rather than filtering on a partial match.
function tr2SetRetreatByLabel(label) {
  const key = (label || '').trim().toLowerCase();
  tr2SetRetreat(key ? (tr2RetreatLabelMap[key] || '') : '');
}
function tr2SetDateFrom(v) { tr2DateFrom = v; tr2SyncClearBtn(); tr2BuildView(); }
function tr2SetDateTo(v)   { tr2DateTo   = v; tr2SyncClearBtn(); tr2BuildView(); }
function tr2JumpToday() {
  const t = new Date().toISOString().slice(0, 10);
  tr2DateFrom = t; tr2DateTo = t;
  const df = document.getElementById('tr2-date-from'); if (df) df.value = t;
  const dt = document.getElementById('tr2-date-to');   if (dt) dt.value = t;
  tr2SyncClearBtn();
  tr2BuildView();
}
function tr2ClearFilters() {
  tr2RetreatFilter = ''; tr2DateFrom = ''; tr2DateTo = '';
  const search = document.getElementById('tr2-retreat-search'); if (search) search.value = '';
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
// Weekly summary (Jorge's ask 2026-10-20) -- arrivals/departures per day; click a
// day to jump to it. With no date range it covers today + 6 days.
let tr2ShowWeekSummary = false;
function tr2SyncWeekBtn() {
  const btn = document.getElementById('tr2-week-btn');
  if (btn) { btn.style.background = tr2ShowWeekSummary ? '#4338ca' : '#eef2ff'; btn.style.color = tr2ShowWeekSummary ? '#fff' : '#4338ca'; }
}
function tr2ToggleWeekSummary() {
  tr2ShowWeekSummary = !tr2ShowWeekSummary;
  tr2SyncWeekBtn();
  tr2BuildView();
}
function tr2JumpToDay(dateStr) {
  tr2ShowWeekSummary = false;
  tr2SyncWeekBtn();
  tr2DateFrom = dateStr; tr2DateTo = dateStr;
  const df = document.getElementById('tr2-date-from'); if (df) df.value = dateStr;
  const dt = document.getElementById('tr2-date-to');   if (dt) dt.value = dateStr;
  tr2SyncClearBtn();
  tr2BuildView();
}

// Print button (Jorge's ask 2026-10-18) -- opens a clean printable sheet with
// whatever's currently filtered/sorted on screen (same view tab, retreat search,
// date range, or the today-only default), same pattern as the other print-sheet
// modules in this codebase (dietary-report.js, activity-sheet.js: a new window,
// its own minimal styles, a .no-print Print button hidden via @media print).
function tr2PrintView() {
  // Jorge's ask 2026-10-20: real Own Transport guests ("ya avisaron, no
  // necesitan transfer") were silently dropped from every print -- staff still
  // need them on the sheet (room list / closing balances), just labeled "OT"
  // instead of an airport/pickup. Synthetic "Missing" rows (nobody submitted
  // anything, also internally ot:true -- see tr2RenderRow above) stay out,
  // same as before, since there's nothing real to print for them. A real OT
  // entry with no date at all (edge case) is also skipped -- no day section
  // to put it under.
  const filtered = tr2FilteredSorted().filter(e => !e.isSynthetic && (!e.ot || e.date));
  const todayStr = new Date().toISOString().slice(0, 10);

  let rangeLabel;
  if (tr2DateFrom || tr2DateTo) rangeLabel = `${tr2DateFrom ? fmtDate(tr2DateFrom) : '…'} – ${tr2DateTo ? fmtDate(tr2DateTo) : '…'}`;
  else if (tr2ShowArchived) rangeLabel = 'Todas las fechas';
  else rangeLabel = `Hoy — ${fmtDate(todayStr)}`;
  const retreatLabel = tr2RetreatFilter ? (tr2RetreatIdToLabel[tr2RetreatFilter] || '') : 'Todos los retiros';
  const viewLabel = tr2View === 'arrivals' ? 'Llegadas' : tr2View === 'departures' ? 'Salidas' : 'Llegadas y Salidas';
  // Jorge's ask 2026-10-20: the Tipo column ("Salida"/"Llegada" on every single
  // row) is only useful when the print mixes both -- printing just one of them
  // already says so in the page subtitle, so it's dead weight. Costo comes off
  // entirely, same ask. Column count (used for every colspan below) follows.
  const showTypeCol = tr2View === 'all';
  // Jorge's ask 2026-10-20: Pick-up is a departure-only concept (arrivals have
  // no "pick up before the flight" step) -- drop the column entirely when
  // printing arrivals only, instead of showing an empty "—" on every row.
  const showPickupCol = tr2View !== 'arrivals';
  const printCols = 5 + (showTypeCol ? 1 : 0) + (showPickupCol ? 1 : 0);

  const groups = new Map();
  filtered.forEach(e => { if (!groups.has(e.date)) groups.set(e.date, []); groups.get(e.date).push(e); });

  // Jorge's ask 2026-10-20: Pick-up and Flight time are their own columns now,
  // not crammed into one "08:30 → 12:15" cell. Tipo only shows up when the
  // print mixes arrivals and departures; Costo is gone entirely.
  const entryRow = (e, color) => `
      <tr${color ? ` style="background:${color}"` : ''}>
        <td>${escHtml(e.room || '—')}</td>
        <td>${escHtml(e.guest || '')}</td>
        ${showTypeCol ? `<td>${e.type === 'arrival' ? 'Llegada' : 'Salida'}</td>` : ''}
        <td>${e.ot ? '<strong>OT</strong>' : escHtml(e.airport === 'cancun' ? 'CUN' : e.airport === 'tulum' ? 'TQO' : (e.airport || ''))}</td>
        ${showPickupCol ? `<td>${e.ot ? '—' : escHtml(e.type === 'departure' ? ((e.groupPickup || e.pickup) || '—') : '—')}</td>` : ''}
        <td>${e.ot ? '—' : escHtml(e.time || '')}</td>
        <td>${escHtml(e.retreatLabel || '')}</td>
      </tr>`;

  // Jorge's ask 2026-10-19, then follow-up same day: pure category order within a shared-ride
  // group (same order room types are defined in, matching Rooms/Rooms Calendar) -- an earlier
  // version also put "no upgrade possible" guests (Beachfront King, but also Casa Grande/Casita 4,
  // which don't participate in the upgrade system at all) at the very top, but that broke the
  // category order visually (those room types aren't adjacent in ROOM_ORDER), so Jorge asked to
  // drop that rule and sort purely by category.
  // AppData.roomTypes' own array order doesn't reliably match the canonical category
  // order (that's only true once loadFromSupabase()'s own re-sort has run) -- call
  // _roomSortKey() (modules/pricing.js's ROOM_ORDER, the same key Teachers/the Night
  // Audit chart use) directly instead of trusting array position, so this is correct
  // regardless (Jorge's report 2026-10-19: printed order didn't match room type at all).
  const _printRtOrder = rtId => {
    const rt = AppData.roomTypes.find(r => r.id === rtId);
    return (rt && typeof _roomSortKey === 'function') ? _roomSortKey(rt) : 9999;
  };
  const _printRoomPos = (rtId, room) => {
    const rt = AppData.roomTypes.find(r => r.id === rtId);
    const i = rt ? (rt.rooms || []).indexOf(room) : -1;
    return i === -1 ? 9999 : i;
  };
  // Jorge's ask 2026-10-19: Casa Grande (cg1-cg6) and Casita 4 (c4a-c4c) are each a single
  // physical house split into several bookable room types -- no blank row needed BETWEEN
  // their own sub-types, only when moving to a genuinely different house/category.
  const _printSpacerGroup = rtId => {
    if (!rtId) return rtId;
    if (rtId.startsWith('cg')) return 'cg';
    if (rtId.startsWith('c4')) return 'c4';
    if (rtId.startsWith('csh')) return 'csh';
    return rtId;
  };
  const _printSortEntries = entries => entries.slice().sort((a, b) => {
    const ra = tr2LookupRtId(a.room), rb = tr2LookupRtId(b.room);
    const ro = _printRtOrder(ra) - _printRtOrder(rb);
    if (ro !== 0) return ro;
    return _printRoomPos(ra, a.room) - _printRoomPos(rb, b.room);
  });

  // Same "shared ride" clustering AND the same pastel colors the on-screen board uses (same
  // flight/time window within ~20min, or a manual drag-and-drop merge saved in
  // tr2UserGroupMap) -- Jorge's ask 2026-10-18: the printed sheet also needs these groups set
  // apart, not just the date headers, and then (2026-10-18, follow-up) in the same colors.
  const rideGroupsHtml = items => {
    const serviceGroups = tr2GroupByRide(items, TR2_PRINT_PASTEL);
    return serviceGroups.map(svc => {
      // Jorge's ask 2026-10-20 (reversing the same-day scoping to departures
      // only): room-category sort/spacer applies to BOTH arrivals and
      // departures prints again, same as before that scoping -- "como lo
      // teniamos". Departures print itself is unchanged either way.
      const rows = _printSortEntries(svc.entries);
      // Jorge's ask 2026-10-20: a solo rider never got this header at all before
      // (only groups of 2+ did), so they silently looked like they belonged to
      // whichever group happened to print right above them. Every group now
      // gets one, including "1 pax".
      return `
      <tr class="ride" style="background:${svc.color || '#f9fafb'}"><td colspan="${printCols}">${svc.entries.length > 1 ? `${svc.entries.length} pax comparten este viaje` : '1 pax en este viaje'}</td></tr>
      ${rows.map((e, i, arr) => {
        // Jorge's ask 2026-10-19: a blank row between room categories within the same
        // shared-ride group, so the (now pure-category) order is easy to scan visually.
        const sep = (i > 0 && _printSpacerGroup(tr2LookupRtId(e.room)) !== _printSpacerGroup(tr2LookupRtId(arr[i - 1].room)))
          ? `<tr class="cat-spacer"><td colspan="${printCols}"></td></tr>` : '';
        return sep + entryRow(e, svc.color);
      }).join('')}
      <tr class="ride-end"><td colspan="${printCols}"></td></tr>
    `;
    }).join('');
  };

  const rowsHtml = filtered.length ? [...groups.entries()].map(([date, items], gi) => `
    ${gi > 0 ? `<tr class="spacer"><td colspan="${printCols}"></td></tr>` : ''}
    <tr class="grp"><td colspan="${printCols}">${date === todayStr ? '📍 HOY — ' : ''}${fmtDate(date)}</td></tr>
    ${rideGroupsHtml(items)}
  `).join('') : `<tr><td colspan="${printCols}" class="none">No hay entradas para estos filtros.</td></tr>`;

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <link rel="icon" type="image/png" href="/favicon.png"><title>Transport · ${rangeLabel}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{font-family:'Jost',sans-serif;margin:0;padding:36px 40px;color:#1a2332;background:#fff;font-size:11pt}
      .print-btn{padding:9px 20px;background:#2d6a6a;color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:'Jost',sans-serif;font-size:11pt;font-weight:600;float:right;margin-bottom:18px}
      .hdr{margin-bottom:18px;clear:both}
      .title{font-family:'Cormorant Garamond',serif;font-size:24pt;font-weight:700;color:#1a2332;margin-bottom:2px}
      .sub{font-size:10.5pt;color:#6b7280}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th{text-align:left;padding:6px 8px;font-size:9pt;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;border-bottom:2px solid #e5e7eb}
      td{padding:6px 8px;font-size:10.5pt;border-bottom:1px solid #f1f5f9;vertical-align:top}
      /* Background alone isn't reliable -- most browsers print with "background graphics" off
         by default, so the date-group bar needs a border + bold/uppercase treatment that still
         shows up with no color at all, on top of the background for whoever has it enabled. */
      tr.grp td{background:#f1f5f9;font-weight:700;font-size:10pt;letter-spacing:.5px;text-transform:uppercase;padding:8px;border-top:2px solid #1a2332;border-bottom:1px solid #d1d5db}
      tr.spacer td{padding:0;border:none;height:14px}
      /* Same "shared ride" cluster the on-screen board shows -- a dashed top rule + small caps
         label makes the group visible even with no color, plus the end-spacer leaves a real gap
         (border-bottom alone reads as just another row, which is what Jorge reported). */
      tr.ride td{padding:5px 8px 2px;border:none;border-top:1.5px dashed #9ca3af;font-size:8.5pt;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#6b7280}
      tr.ride-end td{padding:0;border:none;height:8px}
      tr.cat-spacer td{padding:0;border:none;height:8px}
      .none{color:#9ca3af;font-style:italic;text-align:center;padding:30px 0}
      @media print{.print-btn{display:none}tr.grp{break-inside:avoid}tr{break-inside:avoid}}
    </style></head><body>
    <button class="print-btn" onclick="window.print()">Print</button>
    <div class="hdr">
      <div class="title">Transport ${escHtml(viewLabel)}</div>
      <div class="sub">${escHtml(retreatLabel)} · ${escHtml(rangeLabel)}</div>
    </div>
    <table>
      <thead><tr><th>Habitación</th><th>Nombre</th>${showTypeCol ? '<th>Tipo</th>' : ''}<th>Aeropuerto</th>${showPickupCol ? '<th>Pick-up</th>' : ''}<th>Hora Vuelo</th><th>Retiro</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </body></html>`);
  win.document.close();
}

async function tr2LoadData() {
  const body = document.getElementById('tr2-body');
  if (body) body.innerHTML = `<div style="padding:20px;color:#9ca3af;text-align:center">Loading…</div>`;

  const [{ data: rows }, { data: staffData }, { data: reqRows }] = await Promise.all([
    db.from('transport').select('*').order('submitted_at', { ascending: false }),
    db.from('staff').select('id,name,username,role,active').order('name', { ascending: true }),
    db.from('booking_requests').select('room,check_in,check_out,status').neq('status', 'declined'),
  ]);

  tr2StaffList = (staffData || []).filter(s => s.active);
  tr2RoomNameToRtId = {};
  tr2RoomNameToRtIdNorm = {};
  AppData.roomTypes.forEach(rt => { (rt.rooms || []).forEach(name => { tr2RoomNameToRtId[name] = rt.id; tr2RoomNameToRtIdNorm[_tr2NormRoom(name)] = rt.id; }); });

  tr2ActiveBooks = AppData.bookings.filter(b => b.status !== 'cancelled');
  // Individual (Booking Engine/Direct/OTA) reservations -- tr2AvailableRoomsOfType() needs
  // these too, see the comment there (Jorge's report 2026-10-18).
  tr2ActiveRequests = (reqRows || []).filter(r => r.room && r.check_in && r.check_out);
  const bkMap = {};
  tr2ActiveBooks.forEach(b => { bkMap[b.id] = b; });

  const roomLookup = {}, firstNameIdx = {}, emailRoomIdx = {};
  tr2NameMap = {};
  // Guests cancelled from a shared room (Jorge's ask 2026-09-26: Nicole
  // Chavez, cancelled but her real transport form submission kept showing
  // up here) shouldn't show in Transport at all -- tracked separately from
  // roomLookup/etc. so a cancelled guest's name never resolves a room, and
  // her real submitted row gets skipped entirely below. A whole registration
  // can also be cancelled (reg.cancelled -- the Booking Detail "Cancel"
  // button, for a room that isn't split per-guest, e.g. CH16), which cancels
  // every guest in it the same way one guest's own g.cancelled would.
  const cancelledKeys = new Set();
  tr2ActiveBooks.forEach(bk => {
    const retreatLabel = [bk.retreatName, bk.leaderName].filter(Boolean).join(' · ');
    // Same guard as the synthetic "Missing Transport" loop below -- a room
    // removed from the retreat's own room list shouldn't feed room-lookup/
    // name-matching indices either, or a stale reg can still resolve a real
    // submitted form to a room the guest isn't actually on the list for.
    AppData.regs.filter(r => r.bookingId === bk.id && roomListIncludes(bk.blockedRooms, r.room)).forEach(reg => {
      const regCancelled = !!reg.cancelled;
      (reg.guests || []).forEach(g => {
        const isCancelled = regCancelled || g.cancelled;
        if (g.name && isCancelled) cancelledKeys.add(`${bk.id}|${tr2NormName(g.name)}`);
        if (g.name && !isCancelled) {
          // regId/checkedInAt carried alongside room (Jorge's ask 2026-10-18: a Check In
          // checkmark right in the Room column) -- same resolution precedence (exact name,
          // then unique first name, then unique email) the room match already used, just
          // returning the whole registration instead of only its room string.
          roomLookup[`${bk.id}|${g.name.toLowerCase()}`] = { room: reg.room || '', regId: reg.id, checkedInAt: reg.checkedInAt || null };
          const firstName = g.name.trim().split(/\s+/)[0].toLowerCase();
          if (firstName.length >= 3) {
            const fk = `${bk.id}|${firstName}`;
            if (!firstNameIdx[fk]) firstNameIdx[fk] = { room: reg.room || '', regId: reg.id, checkedInAt: reg.checkedInAt || null, count: 0 };
            firstNameIdx[fk].count++;
          }
          const key = tr2NormName(g.name);
          if (key) tr2NameMap[key] = { bkId: bk.id, retreatLabel, origName: g.name };
        }
        if (g.email && !isCancelled) {
          const ek = `${bk.id}|${g.email.toLowerCase().trim()}`;
          if (!emailRoomIdx[ek]) emailRoomIdx[ek] = { room: reg.room || '', regId: reg.id, checkedInAt: reg.checkedInAt || null, count: 0 };
          emailRoomIdx[ek].count++;
        }
      });
    });
  });

  const datalist = document.getElementById('tr2-retreat-list');
  tr2RetreatLabelMap = {}; tr2RetreatIdToLabel = {};
  if (datalist) {
    const sorted = [...tr2ActiveBooks].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    sorted.forEach(b => {
      const label = `${b.leaderName}${b.retreatName ? ` · ${b.retreatName}` : ''} (${fmtDate(b.startDate)})`;
      tr2RetreatLabelMap[label.toLowerCase()] = b.id;
      tr2RetreatIdToLabel[b.id] = label;
    });
    datalist.innerHTML = sorted.map(b => `<option value="${escHtml(tr2RetreatIdToLabel[b.id])}">`).join('');
    const search = document.getElementById('tr2-retreat-search');
    if (search) search.value = tr2RetreatFilter ? (tr2RetreatIdToLabel[tr2RetreatFilter] || '') : '';
  }

  const normDate = s => { if (!s) return ''; const p = String(s).trim().split('-'); return p.length === 3 ? `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}` : String(s).trim(); };
  // Jorge's report 2026-10-20 (Jennifer Marvel): her real submission (room 23,
  // flight Delta 1773, needs a real transfer) kept losing to a placeholder
  // stub row (no room, no airport, both directions marked Own Transport, a
  // generic "AA1234" flight) because the two scored EXACTLY equal on the old
  // signals (both happened to have every date field + a flight number filled
  // in) and the tie-break was a meaningless raw string compare of `id` --
  // whichever id string happened to sort higher won, with no relation to
  // which row was actually real. Added two more completeness signals (a real
  // room assignment; NOT being Own-Transport in both directions at once,
  // which is the exact shape of an empty placeholder) and replaced the id
  // tie-break with `submitted_at` (the real row is always a genuine, timestamped
  // submission -- newest wins, same idea as pickBetter already favoring "more
  // complete").
  const pickBetter = (cur, row) => {
    const score = r => {
      const d = r.data || {};
      let s = (d.arrivalDate?2:0)+(d.flightNumber?1:0)+(d.departureDate?1:0)+(r.booking_id?1:0);
      if (d.roomOverride) s += 2;
      if (d.arrivalAirport) s += 1;
      if (d.departureAirport) s += 1;
      if (!(d.arrivalOT && d.departureOT)) s += 2;
      return s;
    };
    const sRow = score(row), sCur = score(cur);
    if (sRow > sCur) return row;
    if (sRow < sCur) return cur;
    const aRow = row.submitted_at || '', aCur = cur.submitted_at || '';
    if (aRow && aCur) return aRow > aCur ? row : cur;
    return String(row.id) > String(cur.id) ? row : cur;
  };
  // Same real person can submit the form more than once with a one-letter name typo/variant
  // (confirmed live 2026-10-18: "Elliot"/"Elliott"/"Elli" Free, all the same
  // freeelliott0@gmail.com, showed up as 2-3 separate "Sin retiro asignado" duplicates) -- the
  // exact-string dedup below never merges those on its own. Scoped strictly to an EXACT
  // matching email -- never guess across different emails, two real people can easily share a
  // similar-sounding name. Within each email group, cluster rows that share the same last name
  // and whose first names are either within 1 character of each other (Levenshtein, catches a
  // typo like "Elliot"/"Elliott") OR where one is a nickname-style prefix of the other, length
  // >= 3 (catches "Elli" -> "Elliott"/"Elliot" -- a straight Levenshtein check alone missed this:
  // "elli" is 2-3 edits away from "elliot"/"elliott", not 1, confirmed live 2026-10-18 when the
  // first version of this fix still left Elli Free as a separate unmerged row). Rewrite every
  // row in a cluster to the cluster's best-scoring spelling, so the dedup below (keyed on exact
  // name match) naturally collapses them into one.
  const normalizedRows = (() => {
    const renameMap = new Map(); // row.id -> {firstName, lastName}
    const fuzzyPart = (a, b) => a === b || tr2Levenshtein(a, b) <= 1 || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));
    // Clusters rows within one `groups` Map (groupKey -> rows) using the fuzzy
    // first/last name rule, writing any merges into the shared renameMap.
    // Called once scoped by email, once scoped by booking_id (see below) --
    // Jorge's report 2026-10-20: "Kat Warner" / "Kat Wawner" (one letter off
    // in the LAST name) never merged under the email-only pass because they'd
    // submitted with two genuinely different email addresses; booking_id
    // catches that case (two real, different-email submissions for the same
    // guest on the SAME retreat) without the risk email-only scoping avoided
    // in the first place (two unrelated people merging across DIFFERENT
    // retreats) -- booking_id already rules that out structurally.
    const clusterAndRename = groups => {
      groups.forEach(group => {
        if (group.length < 2) return;
        const clusters = [];
        group.forEach(row => {
          const d = row.data || {};
          const fn = (d.firstName || '').trim().toLowerCase();
          const ln = (d.lastName || '').trim().toLowerCase();
          if (!fn && !ln) return;
          const target = clusters.find(c => fuzzyPart(c.fn, fn) && fuzzyPart(c.ln, ln));
          if (target) target.rows.push(row); else clusters.push({ fn, ln, rows: [row] });
        });
        clusters.forEach(c => {
          if (c.rows.length < 2) return;
          // Prefer whichever variant's EXACT spelling matches a real registration's guest name
          // (keeps the existing exact-name room lookup below working) over just the most
          // "complete" submission -- confirmed live 2026-10-18: normalizing Elli/Elliot/Elliott
          // Free to "Elliott" (the most complete submission) broke the exact-name room match
          // "Elli Free" (the REAL registration spelling) used to provide, leaving the merged row
          // with no room at all.
          const registryMatch = c.rows.find(row => {
            const d = row.data || {};
            const bk = row.booking_id || d.bookingId || '';
            const full = `${(d.firstName || '').trim()} ${(d.lastName || '').trim()}`.trim().toLowerCase();
            return bk && full && roomLookup[`${bk}|${full}`] !== undefined;
          });
          const best = registryMatch || c.rows.reduce((a, b) => pickBetter(a, b));
          const bd = best.data || {};
          c.rows.forEach(row => { if (row.id !== best.id) renameMap.set(row.id, { firstName: bd.firstName, lastName: bd.lastName }); });
        });
      });
    };
    // Same real person can submit the form more than once with a one-letter name typo/variant
    // (confirmed live 2026-10-18: "Elliot"/"Elliott"/"Elli" Free, all the same
    // freeelliott0@gmail.com, showed up as 2-3 separate "Sin retiro asignado" duplicates) --
    // scoped strictly to an EXACT matching email, never guessing across different emails (two
    // real people can easily share a similar-sounding name across different households).
    const byEmail = new Map();
    (rows || []).forEach(row => {
      const em = ((row.data || {}).email || '').toLowerCase().trim();
      if (!em) return;
      if (!byEmail.has(em)) byEmail.set(em, []);
      byEmail.get(em).push(row);
    });
    clusterAndRename(byEmail);
    const byBooking = new Map();
    (rows || []).forEach(row => {
      const bk = row.booking_id || (row.data || {}).bookingId || '';
      if (!bk) return;
      if (!byBooking.has(bk)) byBooking.set(bk, []);
      byBooking.get(bk).push(row);
    });
    clusterAndRename(byBooking);
    if (!renameMap.size) return rows;
    return (rows || []).map(row => {
      const rn = renameMap.get(row.id);
      return rn ? { ...row, data: { ...(row.data || {}), firstName: rn.firstName, lastName: rn.lastName } } : row;
    });
  })();
  const dedupedRows = (() => {
    const map = new Map();
    for (const row of normalizedRows || []) {
      const d = row.data || {};
      const em = (d.email || '').toLowerCase().trim();
      const fn = (d.firstName || '').toLowerCase().trim();
      const ln = (d.lastName || '').toLowerCase().trim();
      const bk = row.booking_id || (d.bookingId || '');
      // Name is part of the key even when there's an email — two DIFFERENT real
      // people sharing one household/family email (a couple booking together,
      // e.g. Susan & Edward McClelland both using katiesolyoga@gmail.com) used to
      // collide on email alone and silently collapse into a single row, dropping
      // one person's whole submission (Jorge's report 2026-09-17: Susan McClelland
      // missing from Transportation even though she'd submitted). Email-only
      // matching was meant to catch the SAME person resubmitting the form twice,
      // which this still does — that case has the same name too.
      const key = em ? `email|${bk}|${em}|${fn}_${ln}` : `name|${fn}_${ln}|${normDate(d.arrivalDate)}|${normDate(d.departureDate)}`;
      const cur = map.get(key);
      map.set(key, cur ? pickBetter(cur, row) : row);
    }
    // Jorge's report 2026-10-20 (Carter Foxworth: Riley Colins/Kat Warner/
    // Jennifer Marvel each showing twice): this key used to include
    // arrivalDate, so a guest who resubmitted the form with a CORRECTED date
    // (not just more detail on the same date -- exactly what Hilario does when
    // he adjusts someone's info) never matched their own earlier row here and
    // both survived forever. booking_id already disambiguates two different
    // real people across different retreats, so the date was never needed to
    // avoid a false match within the same booking -- dropped.
    const map2 = new Map();
    for (const row of map.values()) {
      const d = row.data || {};
      const key2 = `${row.booking_id || (d.bookingId||'')}|${(d.firstName||'').toLowerCase().trim()}_${(d.lastName||'').toLowerCase().trim()}`;
      const cur2 = map2.get(key2);
      map2.set(key2, cur2 ? pickBetter(cur2, row) : row);
    }
    return [...map2.values()];
  })();

  tr2AllEntries = [];
  tr2RawRows = {};
  for (const row of dedupedRows) {
    const d = row.data || {};
    let bkId = row.booking_id;
    let bk = bkMap[bkId];
    const name = [d.firstName, d.lastName].filter(Boolean).join(' ');
    // A row's own booking_id can point at a booking that's gone (deleted/recreated with a new
    // id -- confirmed live 2026-10-18: Carter Foxworth's and Heather Kasey's retreats each had
    // old transport submissions stuck on a since-deleted booking_id, showing as a permanent
    // duplicate "Sin retiro asignado" row next to the correctly-matched one). Fall back to the
    // same name match tr2NameMap already builds from every CURRENT active booking's own
    // registrations, so a stale booking_id self-heals instead of needing a one-off data fix
    // every time this happens.
    if (!bk && name) {
      const fallback = tr2NameMap[tr2NormName(name)];
      if (fallback) { bkId = fallback.bkId; bk = bkMap[bkId]; }
    }
    if (bkId && cancelledKeys.has(`${bkId}|${tr2NormName(name)}`)) continue;
    tr2RawRows[row.id] = row;
    // A manual correction from the edit modal (d.roomOverride) always wins — the
    // auto-match (exact name, then unique first name, then unique email) is a best
    // guess and has no way to fix itself when it's wrong, unlike the room list itself
    // which staff can just edit directly (Jorge's report 2026-09-17: the Transportation
    // tab's Room column had no way to adjust it, unlike My Transportation).
    // Same precedence as before (exact name, then unique first name, then unique email) --
    // now resolving the whole {room, regId, checkedInAt} match instead of just a room string,
    // so the Check In checkmark (Jorge's ask 2026-10-18) knows which registration to update.
    const matched = roomLookup[`${bkId}|${name.toLowerCase()}`] ?? (() => {
      const fn = (d.firstName || '').trim().toLowerCase();
      if (fn.length >= 3) { const fi = firstNameIdx[`${bkId}|${fn}`]; if (fi && fi.count === 1) return fi; }
      const em = (d.email || '').toLowerCase().trim();
      if (em && bkId) { const ei = emailRoomIdx[`${bkId}|${em}`]; if (ei && ei.count === 1) return ei; }
      return null;
    })();
    const room = (d.roomOverride || '').trim() || (matched ? matched.room : '');
    const regId = matched ? matched.regId : null;
    const checkedIn = !!(matched && matched.checkedInAt);
    const retreatLabel = bk ? [bk.retreatName, bk.leaderName].filter(Boolean).join(' · ') : 'Sin retiro asignado';

    // An OT (own transport) guest legitimately has no date/time at all, or a
    // date with no time (staff ticking the OT box on an existing submission
    // doesn't require filling in a time) -- requiring BOTH to render the entry
    // at all silently dropped them from every view, "Own Transport" section
    // included (real incident 2026-10-14: Jorge marked Maria Averill OT in
    // admin, but with arrivalTime left blank she vanished everywhere instead
    // of showing under Own Transport).
    if (d.arrivalOT || (d.arrivalDate && d.arrivalTime)) {
      tr2AllEntries.push({
        rowId: row.id, type: 'arrival', date: d.arrivalDate || '', time: d.arrivalTime || '', guest: name,
        email: d.email || '', flight: d.flightNumber || '', airport: d.arrivalAirport || '',
        ot: !!d.arrivalOT, share: !!d.willingToShare, notes: d.notes || '', room, retreatId: bkId, retreatLabel,
        eta: (d.arrivalOT || !d.arrivalTime) ? null : tr2AddMins(d.arrivalTime, d.arrivalAirport === 'cancun' ? 90 : 45),
        driverConfirmed: !!d.driver_confirmed, cost: d.serviceCost != null ? Number(d.serviceCost) : null,
        regId, checkedIn,
      });
    }
    if (d.departureOT || (d.departureDate && d.departureTime)) {
      const depAirport = d.departureAirport || '';
      // d.departurePickupOverride (editable only by Hilario/Jorge, see
      // tr2EditEntry/tr2CanEditPickup below) wins over the auto-calculated time.
      const pickup = (!d.departureOT && depAirport && d.departureTime) ? (d.departurePickupOverride || tr2DefaultPickup(d)) : null;
      tr2AllEntries.push({
        rowId: row.id, type: 'departure', date: d.departureDate || '', time: d.departureTime || '', guest: name,
        email: d.email || '', flight: d.flightNumber || '', airport: depAirport,
        ot: !!d.departureOT, share: !!d.willingToShare, notes: d.notes || '', room, retreatId: bkId, retreatLabel,
        eta: null, pickup, driverConfirmed: !!d.driver_confirmed, cost: d.serviceCost != null ? Number(d.serviceCost) : null,
        regId, checkedIn,
      });
    }
  }

  // Synthetic "Missing transport" entries — registered guests with no transport form
  // submission, so upgrades can still be offered to guests using their own transport.
  // (marked ot:true purely for the internal "no transfer to arrange" logic elsewhere —
  // the badge below shows "Missing", not "OT", since nobody actually told us they're
  // arranging their own ride; see isSynthetic in tr2AirportBadge-equivalent below.)
  const transportedKeys   = new Set(tr2AllEntries.map(e => `${e.retreatId}|${tr2NormName(e.guest)}`));
  const transportedEmails = new Set(tr2AllEntries.filter(e => e.email?.trim()).map(e => `${e.retreatId}|${e.email.toLowerCase().trim()}`));
  // Same unique-first-name-in-this-booking fallback the Room-column lookup above uses —
  // an abbreviated room-list name ("Billy S") never exact-matches the guest's own
  // fuller submitted name ("Billy Stalcup"), so without this check that real submission
  // (already shown elsewhere in this table) ALSO spawned a bogus "Missing transport"
  // duplicate for the same person (Jorge's report 2026-09-17: Billy S/Michelle M/Crystal W
  // showing twice — once with their real flight info, once as a fake "Own Transport" row).
  const transportedFirstNames = new Map(); // `${bkId}|${firstname}` -> true
  tr2AllEntries.forEach(e => {
    // Plain first token, NOT tr2NormName(e.guest) — that sorts words alphabetically
    // (for order-insensitive matching elsewhere), so "Michelle Maggiore" became
    // "maggiore michelle" and its first word was her LAST name, never matching the
    // room-list guest's actual first name ("michelle") — the exact bug this whole
    // check exists to avoid (Jorge's report 2026-09-17: Michelle M still duplicated
    // after Billy S/Crystal W were fixed).
    const fn = (e.guest || '').trim().split(/\s+/)[0]?.toLowerCase();
    if (!fn) return;
    const key = `${e.retreatId}|${fn}`;
    if (!transportedFirstNames.has(key)) transportedFirstNames.set(key, true);
  });
  tr2ActiveBooks.forEach(bk => {
    const retreatLabel = [bk.retreatName, bk.leaderName].filter(Boolean).join(' · ');
    // A room removed from the retreat's own room list (bk.blockedRooms) can still
    // have a leftover registrations row (nobody deletes it, just unblocks the
    // room) -- without this check that orphaned reg kept spawning a synthetic
    // "Missing Transport" entry for a guest who isn't even on the room list
    // anymore (Jorge's report 2026-09-30: GV13a/GV13b still showing after being
    // removed from Monica's "Just Breathe Yoga Retreat").
    AppData.regs.filter(r => r.bookingId === bk.id && roomListIncludes(bk.blockedRooms, r.room)).forEach(reg => {
      const room = reg.room || '';
      (reg.guests || []).forEach(g => {
        if (!g.name || g.cancelled || reg.cancelled) return;
        if (transportedKeys.has(`${bk.id}|${tr2NormName(g.name)}`)) return;
        // Only trust "this email already submitted" when the email actually identifies
        // ONE roster guest — several family members can share one household email in
        // the room list (emailRoomIdx.count>1), and without this guard, ANY of them
        // having submitted made the OTHERS look like they'd submitted too, so they
        // never got a "Missing Transport" row at all (Jorge's report 2026-09-17:
        // Katherine McClelland, sharing katiesolyoga@gmail.com with Susan & Edward who
        // did submit, never showed up as missing even though she never submitted).
        const gEm = (g.email || '').toLowerCase().trim();
        if (gEm && emailRoomIdx[`${bk.id}|${gEm}`]?.count === 1 && transportedEmails.has(`${bk.id}|${gEm}`)) return;
        const gFn = g.name.trim().split(/\s+/)[0].toLowerCase();
        if (gFn.length >= 3 && firstNameIdx[`${bk.id}|${gFn}`]?.count === 1 && transportedFirstNames.has(`${bk.id}|${gFn}`)) return;
        tr2AllEntries.push({
          rowId: `synth-${reg.id}-${tr2NormName(g.name)}`, type: 'arrival', date: bk.startDate, time: '',
          guest: g.name, email: g.email || '', flight: '', airport: '', ot: true, share: false, notes: '',
          room, retreatId: bk.id, retreatLabel, eta: null, driverConfirmed: false, cost: null, isSynthetic: true,
          regId: reg.id, checkedIn: !!reg.checkedInAt,
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

  tr2BlendGroupPickups();
  tr2BuildView();
}

const TR2_PASTEL = ['#eff6ff','#f0fdf4','#faf5ff','#fffbeb','#fdf2f8','#f0fdfa','#fff7ed','#f0f9ff'];
// Same idea but stronger -- the on-screen palette above is a near-white tint that's fine next
// to the admin table's own borders/shading, but printed/screenshotted it reads as no color at
// all (Jorge's report 2026-10-18: "sigue sin mostrar colores" on the print sheet).
const TR2_PRINT_PASTEL = ['#dbeafe','#dcfce7','#ede9fe','#fef3c7','#fce7f3','#ccfbf1','#fed7aa','#e0f2fe'];
function tr2ToMins(t) { if (!t) return null; const [h,m] = t.split(':').map(Number); return h*60+(m||0); }
function tr2AssignGroupColors(entries, palette = TR2_PASTEL) {
  const colorMap = new Map();
  const clusters = []; // {key, idxs}
  const sortTimeOf = e => tr2ToMins(e.type === 'departure' ? (e.pickup || e.time) : e.time);
  for (const e of entries) {
    const mins = sortTimeOf(e);
    if (!e.date || mins === null) continue;
    const key = `${e.date}|${e.airport}|${e.type}`;
    // A guest can be within 20 min of members from MORE THAN ONE already-formed
    // cluster at once (e.g. 8:30 and 8:44 are each already their own cluster;
    // an 8:36 guest bridges both) -- collect EVERY matching cluster, not just
    // the first, and merge them all into one. Jorge's report 2026-10-20: a
    // transitively-chained group (8:30..9:15, each neighbor within 20 min but
    // the far ends 45 min apart) was silently splitting into separate clusters
    // depending on processing order, since the old version joined only the
    // first match and never merged two clusters that both turned out to fit.
    const matchIdxs = [];
    clusters.forEach((cl, ci) => {
      if (cl.key !== key) return;
      if (cl.idxs.some(id => Math.abs(sortTimeOf(entries.find(x => x.rowId === id)) - mins) <= 20)) matchIdxs.push(ci);
    });
    if (!matchIdxs.length) { clusters.push({ key, idxs: [e.rowId] }); continue; }
    const first = matchIdxs[0];
    for (let i = matchIdxs.length - 1; i >= 1; i--) {
      clusters[first].idxs.push(...clusters[matchIdxs[i]].idxs);
      clusters.splice(matchIdxs[i], 1);
    }
    clusters[first].idxs.push(e.rowId);
  }
  let ci = 0;
  clusters.forEach(cl => { const color = palette[ci++ % palette.length]; cl.idxs.forEach(id => colorMap.set(id, color)); });
  return colorMap;
}
// Real "who's actually riding together" grouping -- a manual tr2UserGroupMap
// entry for a specific row wins over the auto-cluster colors above (which can
// put unrelated same-day clusters under the same recycled palette color once
// there are more clusters than colors, so color alone is never a safe way to
// tell who's really grouped). Shared by tr2BuildView(), tr2PrintView(), and
// tr2BlendGroupPickups() below so all three agree on the exact same groups.
function tr2GroupByRide(items, palette = TR2_PASTEL) {
  const colorMap = tr2AssignGroupColors(items, palette);
  const groups = [];
  const seen = new Map();
  items.forEach(e => {
    const autoKey = colorMap.get(e.rowId) || ('__solo__' + e.rowId);
    const gk = tr2UserGroupMap.has(`${e.type}|${e.rowId}`) ? tr2UserGroupMap.get(`${e.type}|${e.rowId}`) : autoKey;
    if (!seen.has(gk)) { seen.set(gk, groups.length); groups.push({ key: gk, color: colorMap.get(e.rowId), entries: [] }); }
    groups[seen.get(gk)].entries.push(e);
  });
  return groups;
}
// Jorge's ask 2026-10-20: guests sharing one ride must all show the SAME pickup
// time -- the earliest one actually needed in the group -- not each their own
// individually-computed time (a later flight in the same shared ride doesn't
// mean a later pickup; the van leaves once, at the earliest time anyone in it
// needs). Same idea driver-view.html's buildPickupGroups() and the teacher
// portal's _trAssignRideGroups() already use for their own views.
//
// Sets e.groupPickup (the DISPLAY value) rather than overwriting e.pickup (the
// guest's own TRUE auto-calculated-or-overridden time) -- tr2AssignGroupColors'
// own clustering, "Editar transporte"'s default, and re-grouping after a manual
// drag-and-drop all need that real per-guest value to stay intact; only
// mutating a guest's real pickup would make it unrecoverable the moment a
// drag-and-drop pulls them into or out of a group. Every place that DISPLAYS or
// SORTS a departure's pickup reads `e.groupPickup || e.pickup`.
//
// Runs once, right after tr2AllEntries/tr2UserGroupMap are ready and again
// after any manual regroup (tr2Drop/tr2SplitEntry/tr2ResetGroups), so the
// admin table, print and sort order all agree with no further wiring.
function tr2BlendGroupPickups() {
  tr2AllEntries.forEach(e => { if (e.type === 'departure') delete e.groupPickup; });
  const byDate = new Map();
  tr2AllEntries.forEach(e => {
    if (e.type !== 'departure' || !e.pickup) return;
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  });
  byDate.forEach(items => {
    tr2GroupByRide(items).forEach(g => {
      if (g.entries.length < 2) return;
      const minMins = Math.min(...g.entries.map(e => tr2ToMins(e.pickup)));
      const blended = `${String(Math.floor(minMins / 60)).padStart(2, '0')}:${String(minMins % 60).padStart(2, '0')}`;
      g.entries.forEach(e => { e.groupPickup = blended; });
    });
  });
}

// Shared by tr2BuildView() and tr2PrintView() -- same view/retreat/date filters,
// same today-only default, same sort order, so the printed sheet always matches
// whatever's currently on screen.
function tr2FilteredSorted() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const noFilters = !tr2DateFrom && !tr2DateTo && !tr2RetreatFilter && !tr2ShowArchived;
  return tr2AllEntries.filter(e => {
    if (tr2View === 'arrivals' && e.type !== 'arrival') return false;
    if (tr2View === 'departures' && e.type !== 'departure') return false;
    if (tr2RetreatFilter && e.retreatId !== tr2RetreatFilter) return false;
    if (tr2DateFrom && e.date < tr2DateFrom) return false;
    if (tr2DateTo && e.date > tr2DateTo) return false;
    if (noFilters && e.date !== todayStr) return false;
    return true;
  }).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const aSort = a.type === 'departure' ? (a.groupPickup || a.pickup || a.time || '') : (a.time || '');
    const bSort = b.type === 'departure' ? (b.groupPickup || b.pickup || b.time || '') : (b.time || '');
    return aSort.localeCompare(bSort);
  });
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

  const filtered = tr2FilteredSorted();

  if (tr2ShowWeekSummary) {
    let entries = filtered;
    if (!tr2DateFrom && !tr2DateTo && !tr2ShowArchived) {
      const end = new Date(todayStr + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 6);
      const endStr = end.toISOString().slice(0, 10);
      entries = tr2AllEntries.filter(e => {
        if (tr2View === 'arrivals' && e.type !== 'arrival') return false;
        if (tr2View === 'departures' && e.type !== 'departure') return false;
        if (tr2RetreatFilter && e.retreatId !== tr2RetreatFilter) return false;
        return e.date >= todayStr && e.date <= endStr;
      });
    }
    const byDay = new Map();
    entries.filter(e => !e.isSynthetic && e.date).forEach(e => {
      if (!byDay.has(e.date)) byDay.set(e.date, { arrivals: 0, departures: 0 });
      const d = byDay.get(e.date);
      if (e.type === 'arrival') d.arrivals++; else d.departures++;
    });
    const days = [...byDay.keys()].sort();
    if (!days.length) {
      body.innerHTML = `<div style="padding:60px 20px;text-align:center;color:#9ca3af">No hay entradas en este rango.</div>`;
      return;
    }
    const th = 'padding:7px 14px;font-size:10.5px;font-weight:700;text-transform:uppercase;color:#6b7280;text-align:left;border-bottom:2px solid #e5e7eb';
    const rows = days.map(dateStr => {
      const d = byDay.get(dateStr);
      const label = new Date(dateStr + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
      return `<tr onclick="tr2JumpToDay('${dateStr}')" style="cursor:pointer;border-bottom:1px solid #e5e7eb" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
        <td style="padding:10px 14px;font-size:13.5px;font-weight:600;color:#111827;text-transform:capitalize">${label}</td>
        <td style="padding:10px 14px;font-size:13px;color:#059669">${d.arrivals} llegada${d.arrivals !== 1 ? 's' : ''}</td>
        <td style="padding:10px 14px;font-size:13px;color:#dc2626">${d.departures} salida${d.departures !== 1 ? 's' : ''}</td>
      </tr>`;
    }).join('');
    body.innerHTML = `<div style="padding:0 0 20px"><table style="width:100%;border-collapse:collapse;font-family:'Jost',sans-serif">
      <thead><tr><th style="${th}">Día</th><th style="${th}">Llegadas</th><th style="${th}">Salidas</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
    return;
  }

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
  const today = new Date().toISOString().slice(0,10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0,10);

  const TH = (t, w) => `<th style="padding:7px 12px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;text-align:left;white-space:nowrap;${w?'width:'+w:''}border-bottom:2px solid #e5e7eb">${t}</th>`;
  const timeColLabel = tr2View === 'departures' ? 'Pick-up · Hora vuelo' : tr2View === 'arrivals' ? 'Hora vuelo → Hotel' : 'Hora';
  const upgBtn = document.getElementById('tr2-upgrade-btn');
  if (upgBtn) { upgBtn.style.background = tr2UpgradeMode ? '#0d9488' : ''; upgBtn.style.color = tr2UpgradeMode ? '#fff' : ''; }
  // Jorge's ask 2026-10-18: the Check In checkmark gets its own column instead of sitting
  // next to the room number, and in Upgrade mode an Options column (lateral same-category
  // room swaps, see tr2OptionsCell/tr2SwapRooms) sits right before Upgrade. Column count
  // varies with tr2UpgradeMode, so every colspan="N" group-header row below has to track it.
  const totalCols = tr2UpgradeMode ? 11 : 10;
  const tableHeader = `<thead><tr>
    ${TH('Habitación','80px')}${TH('Check In','70px')}${TH('Nombre')}${TH('Tipo')}${TH('Aeropuerto','90px')}${TH(timeColLabel)}${TH('Retiro')}
    ${tr2UpgradeMode ? TH('Options','170px') + TH('Upgrade','200px') : TH('Notas')}
    ${TH('Costo','70px')}${TH('','40px')}
  </tr></thead>`;

  let html = `<div style="padding:0 0 20px"><table style="width:100%;border-collapse:collapse;font-family:'Jost',sans-serif">${tableHeader}<tbody>`;

  if (normalEntries.length) {
    const groups = new Map();
    normalEntries.forEach(e => { if (!groups.has(e.date)) groups.set(e.date, []); groups.get(e.date).push(e); });
    for (const [date, items] of groups) {
      const isToday = date === today, isTmrw = date === tomorrow;
      // Same "📍 TODAY — Sunday, October 18" treatment driver-view.html already shows. Made
      // into an actual button (Jorge's ask 2026-10-18) -- clicking it jumps the From/To range
      // back to today, since the default-today view (see tr2BuildView's noFilters above) is
      // the only time a plain "Today" label with nothing to click would ever show.
      const label = isToday ? `📍 TODAY — ${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}` : isTmrw ? 'Tomorrow' : fmtDate(date);
      const bg = isToday ? '#ccfbf1' : '#f1f5f9', color = isToday ? '#0f766e' : '#374151';
      const labelHtml = isToday
        ? `<button onclick="tr2JumpToday()" title="Ver solo hoy" style="background:#0f766e;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Jost',sans-serif">${label}</button>`
        : label;
      html += `<tr><td colspan="${totalCols}" style="padding:8px 12px;background:${bg};font-size:11px;font-weight:700;color:${color};border-top:2px solid #e5e7eb">${labelHtml}</td></tr>`;

      const serviceGroups = tr2GroupByRide(items);

      serviceGroups.forEach((svc, si) => {
        const pax = svc.entries.length;
        svc.entries.forEach(e => tr2GroupKeyMap.set(`${e.type}|${e.rowId}`, svc.key));
        const firstDirId = `${svc.entries[0].type}|${svc.entries[0].rowId}`;
        html += `<tr style="background:${svc.color || '#f9fafb'}"
          ondragover="event.preventDefault();this.style.outline='2px solid #4db6ac'"
          ondragleave="this.style.outline=''"
          ondrop="event.preventDefault();this.style.outline='';tr2Drop('${firstDirId}')">
          <td colspan="${totalCols}" style="padding:3px 12px;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:.3px">${pax} pax · <span style="font-weight:400;opacity:.7">arrastra aquí para unir</span></td>
        </tr>`;
        svc.entries.forEach(e => {
          if (!e.ot) { const c = e.cost ?? tr2AutoRate(e, pax); if (c != null) { if (e.type === 'arrival') arrTotal += c; else depTotal += c; } }
          html += tr2RenderRow(e, svc.color, pax);
        });
        if (si < serviceGroups.length - 1) html += `<tr><td colspan="${totalCols}" style="padding:8px;background:#fff;border:none"></td></tr>`;
      });
    }
  }

  // Jorge's report 2026-10-19: the "📍 TODAY" header above only ever renders while
  // looping over normalEntries' own dates -- when today's ONLY entries are Own
  // Transport/Missing ones (e.g. a lone Missing-Transport guest, no real submitted
  // arrivals yet), that loop never runs at all and staff see the Missing Transport
  // section with no date context whatsoever. Show the same header here too, once,
  // whenever that's the case.
  if (!normalEntries.some(e => e.date === today) && otEntries.some(e => e.date === today)) {
    const label = `📍 TODAY — ${new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
    html += `<tr><td colspan="${totalCols}" style="padding:8px 12px;background:#ccfbf1;font-size:11px;font-weight:700;color:#0f766e;border-top:2px solid #e5e7eb"><button onclick="tr2JumpToday()" title="Ver solo hoy" style="background:#0f766e;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Jost',sans-serif">${label}</button></td></tr>`;
  }

  // Real OT (guest told us they're arranging their own transport) and synthetic
  // "Missing" (registered but never submitted anything) are both ot:true internally,
  // but they mean opposite things for staff — split them into their own headed
  // sections instead of lumping "missing" guests under an "Own Transport" heading.
  const realOtEntries = otEntries.filter(e => !e.isSynthetic);
  const missingEntries = otEntries.filter(e => e.isSynthetic);
  if (realOtEntries.length) {
    html += `<tr><td colspan="${totalCols}" style="padding:8px 12px;background:#fef2f2;font-size:11px;font-weight:700;color:#dc2626;border-top:2px solid #e5e7eb">Own Transport (${realOtEntries.length})</td></tr>`;
    realOtEntries.forEach(e => { html += tr2RenderRow(e, null); });
  }
  if (missingEntries.length) {
    html += `<tr><td colspan="${totalCols}" style="padding:8px 12px;background:#fef9c3;font-size:11px;font-weight:700;color:#92400e;border-top:2px solid #e5e7eb">Missing Transport (${missingEntries.length})</td></tr>`;
    missingEntries.forEach(e => { html += tr2RenderRow(e, null); });
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
  // A synthetic row (isSynthetic) means nobody actually submitted a form — it's not
  // that the guest told us they're arranging their own transport (real OT), it's that
  // we have no data from them at all. Those are two different situations and staff
  // need to tell them apart (Jorge's report 2026-09-17): OT means "confirmed, don't
  // arrange a transfer"; Missing means "still needs to be chased down".
  const airportBadge = e.isSynthetic
    ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#fef9c3;color:#92400e">Missing</span>`
    : e.ot
    ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#fef2f2;color:#dc2626">OT</span>`
    : e.airport === 'cancun'
      ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#eff6ff;color:#2563eb">CUN</span>`
      : e.airport === 'tulum'
        ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#f0fdf4;color:#16a34a">TQO</span>`
        // A real submission (not synthetic) that didn't check Own Transport AND has no
        // airport picked is an incomplete form, not just "nothing to show" — flag it the
        // same way as a no-submission guest instead of a blank dash (Jorge's ask
        // 2026-09-18: unchecked OT + no airport should read "Missing Information").
        : `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#fef9c3;color:#92400e">Missing Information</span>`;

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
    : ((e.groupPickup || e.pickup) ? `<span style="color:#7e22ce;font-weight:700">🚐 ${tr2FmtTime(e.groupPickup || e.pickup)}</span>${e.time ? `<span style="color:#9ca3af;font-size:11px"> ✈ ${tr2FmtTime(e.time)}</span>` : ''}` : (e.time ? tr2FmtTime(e.time) : '—'));

  const nameCell = `<div style="font-weight:700;color:#111827">${escHtml(e.guest)}</div>
    ${e.driverConfirmed ? `<span style="font-size:9px;padding:1px 5px;border-radius:10px;background:#d1fae5;color:#065f46;font-weight:600">✓ Chofer</span>` : ''}
    ${e.share ? `<span style="font-size:9px;padding:1px 5px;border-radius:10px;background:#f0fdf4;color:#16a34a;font-weight:600">Shared</span>` : ''}
    ${chargedBadge}`;

  const costCell = displayCost != null
    ? `<span style="font-weight:700;color:#0f766e">$${displayCost}</span>${e.cost == null ? `<span style="font-size:9px;color:#9ca3af;margin-left:2px">auto</span>` : ''}`
    : `<span style="color:#d1d5db;font-size:11px">—</span>`;

  const rowBg = color ? `background:${color}` : '';

  // Check In moved into its own column (Jorge's ask 2026-10-18: it was sitting right next
  // to the room number, he wants it separated out).
  const checkInCell = e.regId
    ? `<button onclick="event.stopPropagation();tr2ToggleCheckIn('${e.regId}',${!e.checkedIn})" title="${e.checkedIn ? 'Checked in -- click to undo' : 'Click to check in'}" style="border:none;border-radius:50%;width:20px;height:20px;line-height:1;font-size:12px;cursor:pointer;flex-shrink:0;background:${e.checkedIn ? '#16a34a' : '#f1f5f9'};color:${e.checkedIn ? '#fff' : '#9ca3af'}">✓</button>`
    : '';

  return `<tr style="${rowBg};cursor:grab" draggable="true" ondragstart="tr2DragStart(event,'${e.type}|${e.rowId}')" ondragend="this.style.opacity=''">
    ${TD(e.room ? escHtml(e.room) : `<span style="color:#d1d5db">—</span>`, 'font-weight:600')}
    ${TD(checkInCell, 'text-align:center')}
    ${TD(nameCell)}
    ${TD(typeBadge)}
    ${TD(airportBadge, 'text-align:center')}
    ${TD(timeCell)}
    ${TD(e.retreatLabel ? `<span style="font-size:11px;color:#6b7280">${escHtml(e.retreatLabel)}</span>` : '')}
    ${tr2UpgradeMode ? `<td style="padding:7px 10px;border-bottom:1px solid rgba(0,0,0,.04);vertical-align:top">${tr2OptionsCell(e)}</td><td style="padding:7px 10px;border-bottom:1px solid rgba(0,0,0,.04);vertical-align:top">${tr2UpgradeCell(e)}</td>` : TD(e.notes ? `<span style="font-size:11px;color:#6b7280;font-style:italic">${escHtml(e.notes)}</span>` : '')}
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
  // Jorge's ask 2026-09-26: dropping someone INTO a group changes that
  // group's size/rate too -- previously only the one row dropped onto got
  // recharged, leaving every OTHER already-charged member of the target
  // group stale. Captured before targetKey gets reassigned to a fresh ugKey
  // below, same pattern as oldSrcGroupChargedIds.
  const oldTgtGroupChargedIds = [...tr2GroupKeyMap.entries()]
    .filter(([dk, gk]) => gk === targetKey && dk !== targetFirstDirId && dk.startsWith(direction + '|'))
    .filter(([dk]) => !!tr2RawRows[dk.split('|')[1]]?.data?.folioCharged?.[dirKey]).map(([dk]) => dk.split('|')[1]);

  if (targetKey.startsWith('#') || targetKey.startsWith('__solo__')) {
    const ugKey = 'ug_' + (++tr2UgCounter);
    for (const [dirId, gk] of tr2GroupKeyMap) { if (gk === targetKey) tr2UserGroupMap.set(dirId, ugKey); }
    targetKey = ugKey;
  }
  tr2UserGroupMap.set(src, targetKey);
  tr2BlendGroupPickups();
  tr2BuildView();
  await tr2SaveGroupSetting();

  const srcHasCharge = !!tr2RawRows[srcRowId]?.data?.folioCharged?.[dirKey];
  const tgtHasCharge = !!tr2RawRows[tgtRowId]?.data?.folioCharged?.[dirKey];
  if (srcHasCharge || tgtHasCharge || oldSrcGroupChargedIds.length || oldTgtGroupChargedIds.length) {
    // One adjust call per booking is enough -- adjust-transport-charge.js
    // sweeps every same-booking sibling itself. What it does NOT do is reach
    // siblings from a DIFFERENT booking sharing the same van, so every
    // distinct booking touched by either the old or new group still needs
    // its own representative call (Jorge's ask 2026-09-26).
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
    for (const rId of oldTgtGroupChargedIds) await tryAdjust(rId);
    await tr2LoadData();
  }
}
async function tr2SaveGroupSetting() {
  try { await db.from('settings').upsert({ key: 'transport_groups', value: [...tr2UserGroupMap], updated_at: new Date().toISOString() }, { onConflict: 'key' }); } catch (e) {}
}
async function tr2ResetGroups() { tr2UserGroupMap.clear(); tr2BlendGroupPickups(); tr2BuildView(); await tr2SaveGroupSetting(); }
async function tr2SplitEntry(dirId) {
  const actualRowId = dirId.split('|')[1], direction = dirId.split('|')[0];
  const dirKey = direction === 'arrival' ? 'arrivalFolioItemId' : 'departureFolioItemId';
  const oldGroupKey = tr2GroupKeyMap.get(dirId);
  const otherChargedIds = oldGroupKey
    ? [...tr2GroupKeyMap.entries()].filter(([dk, gk]) => gk === oldGroupKey && dk !== dirId && dk.startsWith(direction + '|'))
        .filter(([dk]) => !!tr2RawRows[dk.split('|')[1]]?.data?.folioCharged?.[dirKey]).map(([dk]) => dk.split('|')[1])
    : [];
  // Jorge's report 2026-10-20: clicking "✕ Split" on a guest who was only ever
  // in an AUTO-cluster (never dragged into a manual group) did nothing -- there
  // was no tr2UserGroupMap entry for them to delete, so the exact same
  // time-proximity auto-cluster just re-formed on the next render. A unique
  // key nobody else will ever share forces this one row solo from now on,
  // same as deleting does for an actual manual-group member.
  if (tr2UserGroupMap.has(dirId)) tr2UserGroupMap.delete(dirId);
  else tr2UserGroupMap.set(dirId, '__forced_solo__' + actualRowId);
  tr2BlendGroupPickups();
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
  // Staff is mandatory for any PAID upgrade — Jorge's ask 2026-09-26: skipping
  // staff meant the commission silently never got created. Free lateral moves
  // (pretaxTotal null/0) have no commission on the line, so no staff required.
  if (pretaxTotal != null && pretaxTotal > 0) {
    const rawStaffId = staffSelId ? document.getElementById(staffSelId)?.value : '';
    if (!rawStaffId) { showToast('Selecciona qué miembro del staff vendió este upgrade antes de confirmar.'); return; }
  }
  const entry = tr2AllEntries.find(e => e.rowId === rowId);
  if (!entry?.room || !entry.retreatId) { showToast('Sin cuarto asignado'); return; }

  const reg = getRegForRoom(entry.retreatId, entry.room);
  if (!reg) { showToast('No se encontró el registro del huésped'); return; }

  const lateral = toRtId === tr2LookupRtId(entry.room);
  const bk = tr2ActiveBooks.find(b => b.id === entry.retreatId);

  const regUpdate = { room: newRoom, room_type_id: toRtId };
  // Freeze the retreat's own MASTER bill (Teachers/Registration, calcBkBalance
  // -> _calcRoomRevenue) at the PRE-upgrade rate -- Jorge's ask 2026-09-28.
  // _calcRoomRevenue derives a room's rate from whatever physical room a reg
  // currently sits in (via AppData.roomTypes), so moving someone into a
  // pricier room type silently inflated the WHOLE GROUP's bill on top of the
  // guest's own upgrade folio charge below -- double-billing the retreat for
  // money that's only supposed to hit that one guest's personal folio. Skip
  // for a lateral move (same room type -- nothing to freeze) and skip if a
  // custom rate was already set (that's the real negotiated group rate,
  // already frozen -- don't overwrite it with a computed one).
  if (!lateral && bk && reg.customRateOverride == null) {
    const fromRtId = tr2LookupRtId(entry.room);
    const fromRt = fromRtId ? AppData.roomTypes.find(r => r.id === fromRtId) : null;
    if (fromRt) {
      const gc = (reg.guests || []).filter(g => g.name && !g.cancelled).length || 1;
      const origNights = Math.max(1, Math.round((pd(bk.endDate) - pd(bk.startDate)) / DAY_MS));
      const origRate = getRoomRate(fromRt, gc, reg.checkIn || bk.startDate, origNights);
      if (origRate != null) regUpdate.custom_rate_override = origRate;
    }
  }

  try { await db.from('registrations').update(regUpdate).eq('id', reg.id); } catch (e) { showToast('Error: ' + e.message); return; }
  reg.room = newRoom; reg.roomTypeId = toRtId;
  if (regUpdate.custom_rate_override != null) reg.customRateOverride = regUpdate.custom_rate_override;
  saveAll();

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

  let folioOk = false, folioItemId = null;
  if (pretaxTotal != null && pretaxTotal > 0) {
    const upgradeTotal = +(pretaxTotal * (1 + portalRoomsTaxRate())).toFixed(2);
    const commissionAmount = +(pretaxTotal * portalCommissionRate()).toFixed(2);
    const folioDesc = (nightlyRate && nights) ? `Upgrade $${nightlyRate} × ${nights} noches` : `Room Upgrade: ${entry.room} → ${newRoom}`;
    try {
      const fcRes = await fetch('/.netlify/functions/create-folio-charge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: reg.id, guestName: entry.guest, description: folioDesc, qty: nights || 1, unitPrice: nightlyRate || pretaxTotal, taxRate: Math.round(portalRoomsTaxRate()*100), category: 'Upgrade' }),
      });
      const fcJson = await fcRes.json().catch(() => ({}));
      if (!fcRes.ok) showToast('Error folio (' + fcRes.status + '): ' + (fcJson.error || JSON.stringify(fcJson)));
      else { folioOk = true; folioItemId = fcJson?.data?.id || null; }
    } catch (e) { showToast('Error folio (red): ' + e.message); }

    if (staffId) {
      try {
        // Jorge's report 2026-10-03: Michele's commissions for Leah Simpson/
        // Chelsea Roussey still showed the ORIGINAL estimated upgrade price
        // ($220/night, the destination room type's list rate) even after
        // staff corrected the actual folio charge down to a negotiated
        // $120/night and $78.57/night -- nothing ever linked the commission
        // back to the folio charge it came from, so editing the charge later
        // (Booking Detail's "Edit") left the commission stale. folio_item_id
        // is that link -- bdSaveEditItem()/bdDeleteItem() (booking-detail.js)
        // now keep any commission row linked this way in sync automatically.
        await db.from('commissions').insert({
          staff_id: staffId, staff_name: staffName, type: 'upgrade', guest_name: entry.guest, booking_id: entry.retreatId,
          folio_item_id: folioItemId,
          room_from: entry.room, room_to: newRoom, upgrade_pretax: pretaxTotal, upgrade_total: upgradeTotal,
          commission_rate: portalCommissionRate(), commission_amount: commissionAmount, date: entry.date, status: 'pending',
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

// Check In checkmark right in Transport's Room column (Jorge's ask 2026-10-18) -- same
// registrations.checked_in_at field/semantics the Reservations tab's resCheckIn() already
// uses, just reachable from here too so staff don't have to jump to another tab.
async function tr2ToggleCheckIn(regId, checkIn) {
  const reg = AppData.regs.find(r => r.id === regId); if (!reg) return;
  const now = checkIn ? new Date().toISOString() : null;
  const { error } = await db.from('registrations').update({ checked_in_at: now }).eq('id', regId);
  if (error) { showToast('Error: ' + error.message); return; }
  reg.checkedInAt = now;
  showToast(checkIn ? 'Checked in ✓' : 'Check-in removed');
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
// The auto-calculated pickup time (no manual override) -- shared by the main
// row-building loop above and the edit modal's default display below, so they
// can never drift apart.
function tr2DefaultPickup(d) {
  if (!d || d.departureOT || !d.departureAirport || !d.departureTime) return null;
  return tr2AddMins(d.departureTime, d.departureAirport === 'cancun' ? -210 : -150);
}
// Jorge's ask 2026-10-20: the departure pickup time can be manually overridden
// per guest, but only Hilario and Jorge should be able to change it -- everyone
// else can still see it, just not edit it.
const TR2_PICKUP_EDIT_STAFF = ['hilario', 'jorge'];
function tr2CanEditPickup() {
  // Substring match, not exact equality -- a staff account's display name can be
  // "Jorge Canales"/"Jorge C." etc, not necessarily the bare first name (Jorge's
  // report 2026-10-20: logged in as himself, field still showed locked).
  const name = ((typeof getCurrentSession === 'function' ? getCurrentSession()?.name : '') || '').trim().toLowerCase();
  return TR2_PICKUP_EDIT_STAFF.some(n => name.includes(n));
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
  const entry = tr2AllEntries.find(e => e.rowId === rowId) || null;
  const nameParts = isSynth && entry ? entry.guest.trim().split(/\s+/) : [];
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
        <div style="grid-column:1/-1">
          <label style="${TR2_LBL_S}">Cuarto</label>
          ${inp('tr2-e-room','text',d.roomOverride||entry?.room||'','ej. 14a')}
          <div style="font-size:10.5px;color:#9ca3af;margin-top:2px">Se detecta automático por nombre — ajusta aquí solo si quedó mal asignado.</div>
        </div>
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
        <div>
          <label style="${TR2_LBL_S}">Pick up${tr2CanEditPickup()?'':' 🔒'}</label>
          <input id="tr2-e-dep-pickup" type="time" value="${escHtml(d.departurePickupOverride||tr2DefaultPickup(d)||'')}" ${tr2CanEditPickup()?'':'disabled'} style="${TR2_INPUT_S}${tr2CanEditPickup()?'':';background:#f3f4f6;color:#6b7280'}">
          <div style="font-size:10.5px;color:#9ca3af;margin-top:2px">${tr2CanEditPickup()?'Calculado automático — cámbialo aquí solo si necesita una hora distinta.':'Solo Hilario y Jorge pueden editar la hora de pick up.'}</div>
        </div>
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
    roomOverride: g('tr2-e-room')?.value.trim() || null,
    arrivalDate: g('tr2-e-arr-date')?.value || '', arrivalTime: g('tr2-e-arr-time')?.value || '', arrivalAirport: g('tr2-e-arr-airport')?.value || 'cancun',
    flightNumber: g('tr2-e-flight')?.value.trim() || '', arrivalOT: g('tr2-e-arr-ot')?.checked || false,
    departureDate: g('tr2-e-dep-date')?.value || '', departureTime: g('tr2-e-dep-time')?.value || '', departureAirport: g('tr2-e-dep-airport')?.value || 'cancun',
    departureOT: g('tr2-e-dep-ot')?.checked || false, willingToShare: g('tr2-e-share')?.checked || false, notes: g('tr2-e-notes')?.value.trim() || '',
    serviceCost: g('tr2-e-cost')?.value !== '' ? Number(g('tr2-e-cost').value) : null,
  };
  // Pick up override: field is read-only for everyone except Hilario/Jorge (see
  // tr2CanEditPickup), so a non-privileged save must never touch the stored
  // override -- it's already carried over unchanged via ...oldData above.
  // Clearing it back to exactly the auto-calculated time drops the override
  // entirely, so later flight-time edits keep auto-adjusting the pickup.
  if (tr2CanEditPickup()) {
    const pickupVal = g('tr2-e-dep-pickup')?.value || '';
    updatedData.departurePickupOverride = (pickupVal && pickupVal !== (tr2DefaultPickup(updatedData) || '')) ? pickupVal : null;
  }

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
    // The `transport` table has no default for `id` — a plain insert() with none
    // fails outright (23502 not-null violation), so saving from a "Missing
    // Transport" row silently never created anything (Jorge's report 2026-09-18:
    // "cuando le das editar no guarda la información"). Client-generated id,
    // matching the tr_<timestamp> pattern already used elsewhere for this table.
    const newId = `tr_${Date.now()}`;
    updatedData.id = newId;
    try {
      await db.from('transport').insert({ id: newId, booking_id: entry?.retreatId || null, data: updatedData });
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
    // Tombstone it — without this, any browser tab whose localStorage still has this
    // row cached (loaded before this delete) will see it as "local-only, not yet in
    // Supabase" on its next syncTransportFromSupabase() and push it right back up,
    // silently resurrecting a deleted duplicate.
    deletedTransportIds.add(rowId);
    localStorage.setItem('amansala_deleted_transport_ids', JSON.stringify([...deletedTransportIds]));
    try { await db.from('app_store').upsert({ key: 'deletedTransportIds', value: [...deletedTransportIds], updated_at: new Date().toISOString() }); } catch (e) {}
    document.getElementById('tr2-edit-modal')?.remove();
    showToast('Registro eliminado');
    await tr2LoadData();
  } catch (e) { showToast('Error al eliminar: ' + e.message); }
}

// ── Auto-match (name-based, for entries with no retreat assigned) ──
function tr2NormName(name) {
  return (name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, '').trim().split(/\s+/).sort().join(' ');
}
// Standard edit distance (insert/delete/substitute, each cost 1) -- used by tr2LoadData's
// same-email name-variant clustering ("Elliot"/"Elliott"/"Elli" Free) to catch a one-letter
// typo/nickname without guessing across different emails.
function tr2Levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  let prev = Array.from({ length: bl + 1 }, (_, i) => i);
  for (let i = 1; i <= al; i++) {
    const cur = [i];
    for (let j = 1; j <= bl; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    prev = cur;
  }
  return prev[bl];
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
