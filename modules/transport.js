// ===== transport.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== TRANSPORTATION =====
const TRANSPORT_KEY='amansala_transport';
let trSelBkId=null;
let trCurrentView='month'; // 'month' | 'retreat' | 'all' | 'individual'
let trMonthOffset=0; // months from today's month

function loadTransport(){try{return JSON.parse(localStorage.getItem(TRANSPORT_KEY)||'[]');}catch{return[];}}
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
  const allSubs=loadTransport().filter(s=>s.bookingId===bkId);
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
function saveTransport(data){
  localStorage.setItem(TRANSPORT_KEY,JSON.stringify(data));
  // Sync each entry to Supabase
  if(Array.isArray(data))data.forEach(e=>saveTransportToSupabase(e));
}
// Merge Supabase transport into localStorage (Supabase wins per entry, keep local-only entries)
async function syncTransportFromSupabase(){
  const remote=await loadTransportFromSupabase();
  if(!remote)return;
  const local=loadTransport();
  const remoteIds=new Set(remote.map(r=>r.id));
  // Keep local entries not yet in Supabase, merge with all remote entries
  const localOnly=local.filter(l=>!remoteIds.has(l.id));
  const merged=[...remote,...localOnly];
  localStorage.setItem(TRANSPORT_KEY,JSON.stringify(merged));
  // Push any local-only entries up to Supabase
  localOnly.forEach(e=>saveTransportToSupabase(e));
}
async function refreshTransport(){
  await syncTransportFromSupabase();
  if(trCurrentView==='month')trBuildMonthView();
  else if(trCurrentView==='all')trBuildAllArrivals();
  else if(trCurrentView==='individual')trBuildIndividual();
  else if(trSelBkId)trSelectRetreat(trSelBkId);
}

function trSetView(v){
  trCurrentView=v;
  const mBtn=document.getElementById('trViewMonth'),rBtn=document.getElementById('trViewRetreat'),aBtn=document.getElementById('trViewAll'),iBtn=document.getElementById('trViewIndividual');
  const mCtrl=document.getElementById('trMonthControls'),rCtrl=document.getElementById('trRetreatControls'),aCtrl=document.getElementById('trAllControls'),iCtrl=document.getElementById('trIndividualControls');
  const activeStyle='background:#fff;color:#0e9494;box-shadow:0 1px 4px rgba(0,0,0,.08)';
  const inactiveStyle='background:transparent;color:#8a7e74;box-shadow:none';
  [mBtn,rBtn,aBtn,iBtn].forEach(b=>{if(b)b.style.cssText=b.style.cssText.replace(/background[^;]+;|color[^;]+;|box-shadow[^;]+;/g,'')+inactiveStyle;});
  [mCtrl,rCtrl,aCtrl,iCtrl].forEach(c=>{if(c)c.style.display='none';});
  if(v==='month'){
    if(mBtn)mBtn.style.cssText=mBtn.style.cssText.replace(/background[^;]+;|color[^;]+;|box-shadow[^;]+;/g,'')+activeStyle;
    if(mCtrl)mCtrl.style.display='flex';
    trBuildMonthView();
    syncTransportFromSupabase().then(()=>trBuildMonthView());
  } else if(v==='retreat'){
    if(rBtn)rBtn.style.cssText=rBtn.style.cssText.replace(/background[^;]+;|color[^;]+;|box-shadow[^;]+;/g,'')+activeStyle;
    if(rCtrl)rCtrl.style.display='flex';
    trSelectRetreat(trSelBkId||'');
    syncTransportFromSupabase().then(()=>{if(trSelBkId)trSelectRetreat(trSelBkId);});
  } else if(v==='individual'){
    if(iBtn)iBtn.style.cssText=iBtn.style.cssText.replace(/background[^;]+;|color[^;]+;|box-shadow[^;]+;/g,'')+activeStyle;
    if(iCtrl)iCtrl.style.display='flex';
    trBuildIndividual();
    syncTransportFromSupabase().then(()=>trBuildIndividual());
  } else {
    if(aBtn)aBtn.style.cssText=aBtn.style.cssText.replace(/background[^;]+;|color[^;]+;|box-shadow[^;]+;/g,'')+activeStyle;
    if(aCtrl)aCtrl.style.display='flex';
    const dEl=document.getElementById('trAllDate');
    if(dEl&&!dEl.value)dEl.value=fmtISO(new Date());
    trBuildAllArrivals();
    syncTransportFromSupabase().then(()=>trBuildAllArrivals());
  }
}
function trMonthNav(dir){trMonthOffset+=dir;trBuildMonthView();}
function trMonthGoToday(){trMonthOffset=0;trBuildMonthView();}

let _trAllRetreats=[];
let _trInitDone=false;
function trInit(){
  const inp=document.getElementById('trRetreatSearch');if(!inp)return;
  const today=fmtISO(new Date());
  _trAllRetreats=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.endDate>=today)
    .sort((a,b)=>a.startDate.localeCompare(b.startDate))
    .map(b=>({id:b.id,label:`${b.leaderName||b.retreatName} — ${fmtDate(b.startDate)} to ${fmtDate(b.endDate)}`}));
  if(trSelBkId){
    const bk=AppData.bookings.find(b=>b.id===trSelBkId);
    if(bk)inp.value=bk.leaderName||bk.retreatName||'';
  }
  if(!_trInitDone){
    // Close dropdown when clicking outside
    document.addEventListener('click',e=>{
      if(!e.target.closest('#trRetreatSearch')&&!e.target.closest('#trDropdownList'))
        document.getElementById('trDropdownList').style.display='none';
    },{capture:true});
    _trInitDone=true;
  }
  // Show month view immediately from localStorage, then refresh from Supabase
  trSetView('month');
  const wrap=document.getElementById('trContent');
  // Sync from Supabase in background and re-render once done
  syncTransportFromSupabase().then(()=>{
    if(trCurrentView==='month')trBuildMonthView();
    else if(trCurrentView==='all')trBuildAllArrivals();
    else if(trCurrentView==='individual')trBuildIndividual();
    else if(trSelBkId)trSelectRetreat(trSelBkId);
  });
}
function trFilterDropdown(q){
  const list=document.getElementById('trDropdownList');if(!list)return;
  const matches=q.trim()===''?_trAllRetreats:_trAllRetreats.filter(r=>r.label.toLowerCase().includes(q.toLowerCase()));
  if(!matches.length){list.innerHTML='<div style="padding:10px 14px;font-size:12.5px;color:#9ca3af">No retreats found</div>';list.style.display='block';return;}
  list.innerHTML=matches.map(r=>`<div onclick="trPickRetreat('${r.id}','${r.label.replace(/'/g,'&#39;')}')" style="padding:10px 14px;font-size:13px;color:#2d2520;cursor:pointer;font-family:'Jost',sans-serif;border-bottom:1px solid #f3f0eb" onmouseover="this.style.background='#f5f1eb'" onmouseout="this.style.background=''">${r.label}</div>`).join('');
  list.style.display='block';
}
function trPickRetreat(id,label){
  document.getElementById('trRetreatSearch').value=label;
  document.getElementById('trDropdownList').style.display='none';
  trSelectRetreat(id);
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

function trSelectRetreat(bkId){
  trSelBkId=bkId||null;
  const wrap=document.getElementById('trContent');if(!wrap)return;
  if(!bkId){wrap.innerHTML='<div style="color:#8a7e74;font-size:13px;text-align:center;padding:40px 0">Select a retreat to view transportation submissions.</div>';return;}
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk){wrap.innerHTML='';return;}
  const {roster,matchedSubs,missing,submittedCount,orphanSubs}=getTransportRoster(bkId);
  const subs=matchedSubs;

  if(!roster.length){
    wrap.innerHTML=`<div style="color:#8a7e74;font-size:13px;text-align:center;padding:40px 0;max-width:440px;margin:0 auto;line-height:1.65">
      No guests on the room list for this retreat yet. Add guests in <b>Room Registrations</b> first — transport tracking compares submissions against that roster.
    </div>`;
    return;
  }

  // Stats bar (room list = source of truth)
  let html=`<div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
    <div style="background:#fff;border:1px solid #e8dfd4;border-radius:11px;padding:14px 20px;flex:1;min-width:120px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#374151">${roster.length}</div>
      <div style="font-size:11px;color:#8a7e74;font-weight:600;margin-top:2px">On Room List</div>
    </div>
    <div style="background:#fff;border:1px solid #e8dfd4;border-radius:11px;padding:14px 20px;flex:1;min-width:120px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#0e9494">${submittedCount}</div>
      <div style="font-size:11px;color:#8a7e74;font-weight:600;margin-top:2px">Transport Received</div>
    </div>
    <div style="background:#fff;border:1px solid #e8dfd4;border-radius:11px;padding:14px 20px;flex:1;min-width:120px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:${missing.length?'#d97706':'#15803d'}">${missing.length}</div>
      <div style="font-size:11px;color:#8a7e74;font-weight:600;margin-top:2px">Missing</div>
    </div>
  </div>`;
  if(orphanSubs.length){
    html+=`<div style="background:#fff;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#991b1b;line-height:1.55">
      <b>${orphanSubs.length} submission${orphanSubs.length!==1?'s':''}</b> not matched to the room list:
      ${orphanSubs.map(s=>`${s.firstName} ${s.lastName}`.trim()).join(', ')}.
    </div>`;
  }
  html+=trRosterStatusHtml(roster,missing);

  // Arrivals grouped (OT excluded from groups, shown separately at bottom)
  html+=trBuildGroups(subs,'arrival','Arrivals',true);
  html+=trBuildGroups(subs,'departure','Departures',false);

  // OT — own transport arrivals
  const MNTHS2=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const otArrivals=subs.filter(s=>s.arrivalOT&&s.arrivalDate&&s.arrivalTime).sort((a,b)=>a.arrivalDate===b.arrivalDate?a.arrivalTime.localeCompare(b.arrivalTime):a.arrivalDate.localeCompare(b.arrivalDate));
  const otDepartures=subs.filter(s=>s.departureOT&&s.departureDate&&s.departureTime).sort((a,b)=>a.departureDate===b.departureDate?a.departureTime.localeCompare(b.departureTime):a.departureDate.localeCompare(b.departureDate));
  function otTable(list,timeKey,dateKey){
    return`<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#faf7f2"><th style="padding:6px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Guest</th><th style="padding:6px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Date</th><th style="padding:6px 12px;text-align:right;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Est. Time</th></tr></thead>
      <tbody>${list.map((s,i)=>{const dt=new Date(s[dateKey]+'T00:00:00');return`<tr style="border-bottom:1px solid #f0ece4;background:${i%2===0?'#fff':'#faf7f2'}"><td style="padding:6px 12px;font-weight:600;color:#dc2626">${s.firstName} ${s.lastName} <span style="font-size:10px;font-weight:700;background:#fee2e2;color:#dc2626;border-radius:4px;padding:1px 5px">OT</span></td><td style="padding:6px 12px;color:#8a7e74">${MNTHS2[dt.getMonth()]+' '+dt.getDate()}</td><td style="padding:6px 12px;text-align:right;font-weight:600;color:#5a5048">${tsFmt(s[timeKey])}</td></tr>`;}).join('')}</tbody>
    </table>`;
  }
  if(otArrivals.length)html+=`<div style="margin-bottom:18px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#8a7e74;margin-bottom:8px">OT — Own Transport Arrivals</div><div style="background:#fff;border:1.5px dashed #c8bfb5;border-radius:12px;overflow:hidden"><div style="background:#f5f1eb;padding:9px 14px;border-bottom:1px solid #e8dfd4;font-size:11.5px;color:#5a5048;font-style:italic">Arranging own transfer — listed for ETA reference only</div>${otTable(otArrivals,'arrivalTime','arrivalDate')}</div></div>`;
  if(otDepartures.length)html+=`<div style="margin-bottom:18px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#8a7e74;margin-bottom:8px">OT — Own Transport Departures</div><div style="background:#fff;border:1.5px dashed #c8bfb5;border-radius:12px;overflow:hidden"><div style="background:#f5f1eb;padding:9px 14px;border-bottom:1px solid #e8dfd4;font-size:11.5px;color:#5a5048;font-style:italic">Arranging own transfer — listed for reference only</div>${otTable(otDepartures,'departureTime','departureDate')}</div></div>`;

  // Missing guests
  if(missing.length){
    html+=`<div style="background:#fff;border:1px solid #fde68a;border-radius:12px;margin-bottom:18px;overflow:hidden">
      <div style="background:#fffbeb;padding:12px 18px;border-bottom:1px solid #fde68a;display:flex;align-items:center;gap:8px">
        <span style="font-size:12.5px;font-weight:700;color:#92400e">⚠ Missing Transport Info — ${missing.length} guest${missing.length!==1?'s':''}</span>
      </div>
      <div style="padding:12px 18px;display:flex;flex-wrap:wrap;gap:8px">
        ${missing.map(g=>`<span style="font-size:12px;padding:3px 10px;background:#fef9c3;border:1px solid #fcd34d;border-radius:6px;color:#92400e">${g.name}${g.email?' · <span style="opacity:.7">'+g.email+'</span>':''}</span>`).join('')}
      </div>
    </div>`;
  }

  // Build 20-min ride groups for this retreat's arrivals
  const trGroupMap={};
  const subsWithArrival=subs.filter(s=>s.arrivalDate&&s.arrivalTime&&s.arrivalAirport);
  ['cancun','tulum'].forEach(airport=>{
    const subset=subsWithArrival.filter(s=>s.arrivalAirport===airport)
      .sort((a,b)=>a.arrivalTime.localeCompare(b.arrivalTime));
    const used=new Set();
    subset.forEach((s,i)=>{
      if(used.has(i))return;
      const grp=[s];used.add(i);
      const anchor=trTimeToMins(s.arrivalTime);
      subset.forEach((s2,j)=>{
        if(j!==i&&!used.has(j)&&Math.abs(trTimeToMins(s2.arrivalTime)-anchor)<=20){grp.push(s2);used.add(j);}
      });
      const pp=trGetPrice(airport,grp.length);
      grp.forEach(g=>{trGroupMap[g.email]={groupSize:grp.length,pricePerPax:pp};});
    });
  });

  // All arrivals table — same columns as All Arrivals view
  if(subs.length){
    const sorted=subsWithArrival.sort((a,b)=>a.arrivalTime.localeCompare(b.arrivalTime));
    html+=`<div style="background:#fff;border:1px solid #e8dfd4;border-radius:12px;overflow:hidden">
      <div style="background:#f2f8f6;padding:12px 18px;border-bottom:1px solid #c8d8d4;display:flex;align-items:center;gap:10px">
        <span style="font-size:12.5px;font-weight:700;color:#0e9494">All Arrivals</span>
        <span style="font-size:11px;background:#0e9494;color:#fff;border-radius:99px;padding:1px 9px;font-weight:700">${sorted.length}</span>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f5f1eb">
            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4">Guest Name</th>
            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4;white-space:nowrap">Room #</th>
            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4">Flight</th>
            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4;white-space:nowrap">Arrival Time</th>
            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4">Airport</th>
            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4">ETA</th>
            <th style="padding:8px 12px;text-align:right;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4">Owes</th>
            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4;white-space:nowrap">Onsite Upgrade</th>
          </tr></thead>
          <tbody>${sorted.map((s,i)=>{
            const gm=trGroupMap[s.email];
            const room=trGuestRoom(bkId,s.email,s.firstName,s.lastName);
            const eta=s.arrivalAirport==='cancun'?trAddMins(s.arrivalTime,90):trAddMins(s.arrivalTime,45);
            const airChip=s.arrivalAirport==='cancun'
              ?'<span style="font-size:10px;background:#e0f2fe;color:#0369a1;border-radius:4px;padding:1px 6px;font-weight:700">CUN</span>'
              :'<span style="font-size:10px;background:#d1fae5;color:#065f46;border-radius:4px;padding:1px 6px;font-weight:700">TQO</span>';
            const priceCell=gm
              ?(gm.groupSize===1
                ?`<span style="font-weight:800;color:#5a5048">$${gm.pricePerPax}</span> <span style="font-size:10px;color:#8a7e74">Private</span>`
                :`<span style="font-weight:800;color:#15803d">$${gm.pricePerPax}</span> <span style="font-size:10px;color:#8a7e74">sharing</span>`)
              :'—';
            const upg=trGetUpgrade(bkId,room);
            const upgCell=upg
              ?`<div style="display:inline-flex;flex-direction:column;gap:2px">
                  <span style="font-size:11px;font-weight:700;color:#fff;background:#15803d;border-radius:5px;padding:2px 8px;white-space:nowrap">↑ ${upg.toName}${upg.suggestedRoom?' · Rm '+upg.suggestedRoom:''}</span>
                  <span style="font-size:10.5px;font-weight:700;color:#15803d">+$${upg.upgradeNightly}/night${upg.isSolo?'':' pp'} · ${upg.availableCount} avail.</span>
                </div>`
              :'<span style="color:#c0b8b0;font-size:11px">—</span>';
            const roomCat=trRoomCat(room);
            return`<tr style="border-bottom:1px solid #f0ece4;background:${i%2===0?'#fff':'#faf7f2'}">
              <td style="padding:9px 12px;font-weight:600;color:#2d2520;white-space:nowrap">${s.firstName} ${s.lastName}</td>
              <td style="padding:9px 12px;white-space:nowrap"><span style="font-weight:700;color:#2d2520">${room}</span>${roomCat?`<br><span style="font-size:10px;color:#8a7e74;font-weight:400">${roomCat}</span>`:''}</td>
              <td style="padding:9px 12px;color:#5a5048">${s.flightNumber||'—'}</td>
              <td style="padding:9px 12px;font-weight:700;color:#0e9494;white-space:nowrap">${tsFmt(s.arrivalTime)}</td>
              <td style="padding:9px 12px">${airChip}</td>
              <td style="padding:9px 12px;color:#2d2520;font-weight:600;white-space:nowrap">${eta}</td>
              <td style="padding:9px 12px;text-align:right">${priceCell}</td>
              <td style="padding:9px 12px">${upgCell}</td>
            </tr>`;}).join('')}</tbody>
        </table>
      </div>
    </div>`;
  }

  wrap.innerHTML=html;
}

function trBuildGroups(subs,direction,heading,showUpgrade=false){
  const MNTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateKey=direction+'Date', timeKey=direction+'Time', airportKey=direction+'Airport';
  // Airport is optional for departures — still show if date+time are present; exclude OT guests (shown separately)
  const otKey=direction+'OT';
  const valid=subs.filter(s=>!s[otKey]&&s[dateKey]&&s[timeKey]);
  if(!valid.length)return'';
  const byAD={};
  valid.forEach(s=>{const k=s[airportKey]+'|'+s[dateKey];if(!byAD[k])byAD[k]=[];byAD[k].push(s);});
  let out=`<div style="margin-bottom:18px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#8a7e74;margin-bottom:10px">${heading}</div>`;
  Object.entries(byAD).forEach(([key,list])=>{
    const [airport,date]=key.split('|');
    const airportLabel=airport==='cancun'?'Cancún Airport':'Tulum Airport';
    const dt=new Date(date+'T00:00:00');
    const dateLabel=MNTHS[dt.getMonth()]+' '+dt.getDate()+', '+dt.getFullYear();
    list.sort((a,b)=>a[timeKey].localeCompare(b[timeKey]));
    const groups=[];let cur=[list[0]];
    for(let i=1;i<list.length;i++){
      const anchor=trTimeToMins(cur[0][timeKey]);
      if(trTimeToMins(list[i][timeKey])-anchor<=30)cur.push(list[i]);
      else{groups.push(cur);cur=[list[i]];}
    }
    groups.push(cur);
    out+=`<div style="background:#fff;border:1px solid #e8dfd4;border-radius:12px;margin-bottom:10px;overflow:hidden">
      <div style="background:#f2f8f6;padding:10px 16px;border-bottom:1px solid #c8d8d4;font-size:12.5px;font-weight:700;color:#0e9494">${airportLabel} · ${dateLabel}</div>
      <div style="padding:12px 16px;display:flex;flex-direction:column;gap:10px">
        ${groups.map((g,gi)=>{
          const pricePerPax=trGetPrice(airport,g.length);
          const soloPax=trGetPrice(airport,1);
          const saves=soloPax-pricePerPax;
          const isSolo=g.length===1;
          const priceLabel=isSolo?`$${pricePerPax} Private Transport`:`$${pricePerPax}/person`;
          return`<div style="background:${gi%2===0?'#faf7f2':'#f2f8f6'};border:1px solid ${g.length>1?'#9dd1d1':'#e8dfd4'};border-radius:9px;padding:10px 14px">
          <div style="font-size:11px;font-weight:700;color:#0e9494;margin-bottom:7px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span>Group ${gi+1}</span>
            <span style="background:#0e9494;color:#fff;border-radius:99px;padding:1px 8px;font-size:10px">${g.length} guest${g.length!==1?'s':''}</span>
            <span style="color:#8a7e74;font-weight:400">${tsFmt(g[0][timeKey])}${g.length>1?' – '+tsFmt(g[g.length-1][timeKey]):''}</span>
            <span style="font-weight:700;color:${isSolo?'#5a5048':'#0e9494'};font-size:11px">${priceLabel}</span>
            ${saves>0?`<span style="background:#d1fae5;color:#065f46;border-radius:99px;padding:1px 8px;font-size:10px;font-weight:700">save $${saves} each</span>`:''}
          </div>
          <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="background:rgba(255,255,255,.5)">
              <th style="padding:5px 8px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Guest Name</th>
              <th style="padding:5px 8px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4;white-space:nowrap">Room #</th>
              <th style="padding:5px 8px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Flight</th>
              <th style="padding:5px 8px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4;white-space:nowrap">Arrival Time</th>
              <th style="padding:5px 8px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">ETA</th>
              <th style="padding:5px 8px;text-align:right;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Owes</th>
              ${showUpgrade?'<th style="padding:5px 8px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4;white-space:nowrap">Onsite Upgrade</th>':''}
            </tr></thead>
            <tbody>${g.map(s=>{
              const sRoom=trGuestRoom(s.bookingId,s.email,s.firstName,s.lastName);
              const sEta=s[airportKey]==='cancun'?trAddMins(s[timeKey],90):trAddMins(s[timeKey],45);
              const sUpg=showUpgrade?trGetUpgrade(s.bookingId,sRoom):null;
              const sUpgCell=sUpg
                ?`<div style="display:inline-flex;flex-direction:column;gap:2px">
                    <span style="font-size:10px;font-weight:700;color:#fff;background:#15803d;border-radius:5px;padding:2px 7px;white-space:nowrap">↑ ${sUpg.toName}${sUpg.suggestedRoom?' · Rm '+sUpg.suggestedRoom:''}</span>
                    <span style="font-size:10px;font-weight:700;color:#15803d">+$${sUpg.upgradeNightly}/night${sUpg.isSolo?'':' pp'} · ${sUpg.availableCount} avail.</span>
                  </div>`
                :'<span style="color:#c0b8b0;font-size:11px">—</span>';
              const sRoomCat=trRoomCat(sRoom);
              return`<tr style="border-bottom:1px solid rgba(0,0,0,.04)">
                <td style="padding:6px 8px;font-weight:600;color:#2d2520;white-space:nowrap">${s.firstName} ${s.lastName}</td>
                <td style="padding:6px 8px;white-space:nowrap"><span style="font-weight:700;color:#2d2520">${sRoom}</span>${sRoomCat?`<br><span style="font-size:10px;color:#8a7e74">${sRoomCat}</span>`:''}</td>
                <td style="padding:6px 8px;color:#5a5048">${s.flightNumber||'—'}</td>
                <td style="padding:6px 8px;font-weight:600;color:#0e9494;white-space:nowrap">${tsFmt(s[timeKey])}</td>
                <td style="padding:6px 8px;color:#2d2520;font-weight:600;white-space:nowrap">${sEta}</td>
                <td style="padding:6px 8px;text-align:right;font-weight:800;color:${isSolo?'#5a5048':'#15803d'};white-space:nowrap">$${pricePerPax}</td>
                ${showUpgrade?`<td style="padding:6px 8px">${sUpgCell}</td>`:''}
              </tr>`;}).join('')}
            </tbody>
          </table>
          </div>
        </div>`;}).join('')}
      </div>
    </div>`;
  });
  return out+'</div>';
}

function trTimeToMins(t){if(!t)return 0;const[h,m]=(t||'').split(':');return parseInt(h)*60+parseInt(m);}

// Transport pricing table
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

function trAddMins(t,mins){
  if(!t)return'—';
  const total=trTimeToMins(t)+mins;
  const h=Math.floor(total/60)%24, m=total%60;
  return (h<10?'0':'')+h+':'+(m<10?'0':'')+m;
}

function trGuestRoom(bkId,email,firstName,lastName){
  const match=AppData.regs.find(r=>r.bookingId===bkId&&r.room&&(r.guests||[]).some(g=>
    (g.email&&email&&g.email.toLowerCase().trim()===email.toLowerCase().trim())||
    (g.name&&firstName&&g.name.toLowerCase().trim()===(firstName+' '+lastName).toLowerCase().trim())
  ));
  if(match)return match.room;
  return '<span style="font-size:10px;color:#d97706;font-weight:600">not in room list</span>';
}
function trRoomCat(roomNum){
  if(!roomNum)return'';
  const rt=AppData.roomTypes.find(r=>r.rooms&&r.rooms.includes(roomNum));
  return rt?rt.name:'';
}

// ── Onsite upgrade helper ────────────────────────────────────────────────────
// Category names used on pricing chart (guest-facing)
const TR_CAT={rt1:'Beachfront',rt2:'Beachview',rt3:'Steps to Sea',rt4:'Garden Plus',rt5:'Garden Basico'};
// Upgrade chain: each entry can move to the next
const TR_CHAIN=['rt5','rt4','rt3','rt2','rt1'];

function trGetUpgrade(bkId,roomNum){
  if(!roomNum||roomNum==='—')return null;
  // Find the guest's reg to get roomTypeId
  const reg=AppData.regs.find(r=>r.bookingId===bkId&&r.room===roomNum);
  const rtId=reg?reg.roomTypeId:null;
  let rt=AppData.roomTypes.find(r=>r.id===rtId)||AppData.roomTypes.find(r=>r.rooms.includes(roomNum));
  if(!rt)return null;

  const idx=TR_CHAIN.indexOf(rt.id);
  if(idx===-1||idx===TR_CHAIN.length-1)return null; // not in chain or already top

  const nextRt=AppData.roomTypes.find(r=>r.id===TR_CHAIN[idx+1]);
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

  const available=nextRt.rooms.filter(room=>!busyRooms.has(room));
  if(!available.length)return null;
  // Prefer Grande rooms over Chica (CH) rooms — only suggest CH if nothing else available
  const grandeFirst=[...available.filter(r=>!r.toUpperCase().startsWith('CH')),...available.filter(r=>r.toUpperCase().startsWith('CH'))];
  available.splice(0,available.length,...grandeFirst);

  // Nightly fee = (nextPrice - currentPrice) × 0.9 (10% discount off the price difference)
  const guestCount=reg?(reg.guests||[]).filter(g=>g.name).length:1;
  const curPrice=guestCount>=2?rt.price2:rt.price1;
  const nxtPrice=guestCount>=2?nextRt.price2:nextRt.price1;
  const upgradeNightly=Math.round((nxtPrice-curPrice)*0.9);
  if(upgradeNightly<=0)return null;

  return{
    fromName:TR_CAT[rt.id]||rt.name,
    toName:TR_CAT[nextRt.id]||nextRt.name,
    upgradeNightly,
    availableCount:available.length,
    suggestedRoom:available[0],
    isSolo:guestCount<2
  };
}

function trBuildMonthView(){
  const wrap=document.getElementById('trContent');if(!wrap)return;
  const MNTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MNTHS3=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const now=new Date();
  const viewDate=new Date(now.getFullYear(),now.getMonth()+trMonthOffset,1);
  const yr=viewDate.getFullYear(),mo=viewDate.getMonth();
  const monthLabel=MNTHS[mo]+' '+yr;
  const lbl=document.getElementById('trMonthLabel');
  if(lbl)lbl.textContent=monthLabel;

  const allSubs=loadTransport();
  const today=fmtISO(now);

  // Build day-by-day data for this month
  const daysInMonth=new Date(yr,mo+1,0).getDate();
  const days=[];
  for(let d=1;d<=daysInMonth;d++){
    const iso=`${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow=new Date(iso+'T00:00:00').getDay();
    // Transport submissions arriving/departing this day
    const arrivals=allSubs.filter(s=>s.arrivalDate===iso&&s.arrivalTime);
    const departures=allSubs.filter(s=>s.departureDate===iso&&s.departureTime);
    // Bookings checking in or out this day
    const checkIns=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.startDate===iso);
    const checkOuts=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.endDate===iso);
    // Active retreats this day (started but not ended)
    const active=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.startDate<=iso&&b.endDate>=iso);
    days.push({iso,d,dow,arrivals,departures,checkIns,checkOuts,active});
  }

  // Summary stats
  const totalArrivals=days.reduce((s,d)=>s+d.arrivals.length,0);
  const totalDepartures=days.reduce((s,d)=>s+d.departures.length,0);
  const activeRetreats=new Set(AppData.bookings.filter(b=>b.status!=='cancelled'&&b.startDate<=`${yr}-${String(mo+1).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`&&b.endDate>=`${yr}-${String(mo+1).padStart(2,'0')}-01`).map(b=>b.id)).size;

  let html=`<div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
    <div style="background:#fff;border:1px solid #e8dfd4;border-radius:11px;padding:14px 20px;flex:1;min-width:110px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#0e9494">${totalArrivals}</div>
      <div style="font-size:11px;color:#8a7e74;font-weight:600;margin-top:2px">Arrivals This Month</div>
    </div>
    <div style="background:#fff;border:1px solid #e8dfd4;border-radius:11px;padding:14px 20px;flex:1;min-width:110px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#d97706">${totalDepartures}</div>
      <div style="font-size:11px;color:#8a7e74;font-weight:600;margin-top:2px">Departures This Month</div>
    </div>
    <div style="background:#fff;border:1px solid #e8dfd4;border-radius:11px;padding:14px 20px;flex:1;min-width:110px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#7c3aed">${activeRetreats}</div>
      <div style="font-size:11px;color:#8a7e74;font-weight:600;margin-top:2px">Retreats This Month</div>
    </div>
  </div>`;

  html+='<div style="display:flex;flex-direction:column;gap:6px">';
  days.forEach(day=>{
    const hasActivity=day.arrivals.length||day.departures.length||day.checkIns.length||day.checkOuts.length||day.active.length;
    if(!hasActivity){
      // Compact empty day row
      const isToday=day.iso===today;
      const dayName=DAYS[day.dow];
      html+=`<div style="background:${isToday?'#f0fdfb':'#faf8f5'};border:1px solid ${isToday?'#0e9494':'#e8dfd4'};border-radius:9px;padding:7px 16px;display:flex;align-items:center;gap:10px;opacity:.55">
        <span style="font-size:11px;font-weight:700;color:#8a7e74;min-width:36px">${dayName}</span>
        <span style="font-size:12.5px;color:#5a5048;font-weight:600">${MNTHS3[mo]} ${day.d}</span>
        <span style="font-size:11px;color:#c8bfb5;margin-left:auto">No activity</span>
      </div>`;
      return;
    }
    const isToday=day.iso===today;
    const isPast=day.iso<today;
    const borderColor=isToday?'#0e9494':day.arrivals.length?'#6ee7b7':day.checkOuts.length?'#fcd34d':'#e8dfd4';
    const bgColor=isToday?'#f0fdfb':isPast?'#faf7f2':'#fff';
    const dayName=DAYS[day.dow];
    const dayLabelShort=MNTHS3[mo]+' '+day.d;

    // Retreat activity chips
    const retreatChips=[];
    day.checkIns.forEach(b=>{
      retreatChips.push(`<span style="font-size:11px;background:#dcfce7;color:#15803d;border:1px solid #6ee7b7;padding:2px 9px;border-radius:99px;font-weight:700;white-space:nowrap">▶ ${b.leaderName||b.retreatName||'Retreat'} check-in</span>`);
    });
    day.checkOuts.forEach(b=>{
      retreatChips.push(`<span style="font-size:11px;background:#fef9c3;color:#854d0e;border:1px solid #fcd34d;padding:2px 9px;border-radius:99px;font-weight:700;white-space:nowrap">■ ${b.leaderName||b.retreatName||'Retreat'} check-out</span>`);
    });
    // Active retreats not checking in/out today
    const checkInIds=new Set(day.checkIns.map(b=>b.id));
    const checkOutIds=new Set(day.checkOuts.map(b=>b.id));
    day.active.filter(b=>!checkInIds.has(b.id)&&!checkOutIds.has(b.id)).forEach(b=>{
      retreatChips.push(`<span style="font-size:11px;background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;padding:2px 9px;border-radius:99px;white-space:nowrap">● ${b.leaderName||b.retreatName||'Retreat'}</span>`);
    });

    // Arrival/departure summary
    let movementHtml='';
    if(day.arrivals.length){
      const enriched=day.arrivals.map(s=>{
        const bk=AppData.bookings.find(b=>b.id===s.bookingId)||{};
        const etaMins=s.arrivalAirport==='cancun'?90:45;
        const room=trGuestRoom(s.bookingId,s.email,s.firstName,s.lastName);
        return{...s,retreatLabel:bk.leaderName||bk.retreatName||'Unknown',eta:trAddMins(s.arrivalTime,etaMins),room};
      }).sort((a,b)=>a.arrivalTime.localeCompare(b.arrivalTime));
      movementHtml+=`<div style="margin-top:10px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#15803d;margin-bottom:6px">Arrivals (${day.arrivals.length})</div>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11.5px">
          <thead><tr style="background:#f0fdf4">
            <th style="padding:5px 10px;text-align:left;color:#15803d;font-weight:700;border-bottom:1px solid #bbf7d0;white-space:nowrap">Time</th>
            <th style="padding:5px 10px;text-align:left;color:#15803d;font-weight:700;border-bottom:1px solid #bbf7d0">Airport</th>
            <th style="padding:5px 10px;text-align:left;color:#15803d;font-weight:700;border-bottom:1px solid #bbf7d0">ETA</th>
            <th style="padding:5px 10px;text-align:left;color:#15803d;font-weight:700;border-bottom:1px solid #bbf7d0">Guest</th>
            <th style="padding:5px 10px;text-align:left;color:#15803d;font-weight:700;border-bottom:1px solid #bbf7d0">Room</th>
            <th style="padding:5px 10px;text-align:left;color:#15803d;font-weight:700;border-bottom:1px solid #bbf7d0">Flight</th>
            <th style="padding:5px 10px;text-align:left;color:#15803d;font-weight:700;border-bottom:1px solid #bbf7d0">Retreat</th>
            <th style="padding:5px 10px;border-bottom:1px solid #bbf7d0"></th>
          </tr></thead>
          <tbody>${enriched.map((s,i)=>{
            const airChip=s.arrivalAirport==='cancun'
              ?'<span style="font-size:10px;background:#e0f2fe;color:#0369a1;border-radius:4px;padding:1px 5px;font-weight:700">CUN</span>'
              :'<span style="font-size:10px;background:#d1fae5;color:#065f46;border-radius:4px;padding:1px 5px;font-weight:700">TQO</span>';
            const mRoomCat=trRoomCat(s.room);
            return`<tr style="border-bottom:1px solid #f0fdf4;background:${i%2===0?'#fff':'#f9fefe'}">
              <td style="padding:6px 10px;font-weight:700;color:#0e9494;white-space:nowrap">${tsFmt(s.arrivalTime)}</td>
              <td style="padding:6px 10px">${airChip}</td>
              <td style="padding:6px 10px;color:#2d2520;font-weight:600;white-space:nowrap">${s.eta}</td>
              <td style="padding:6px 10px;font-weight:600;color:#2d2520;white-space:nowrap">${s.firstName} ${s.lastName}</td>
              <td style="padding:6px 10px;white-space:nowrap"><span style="font-weight:700;color:#2d2520">${s.room}</span>${mRoomCat?`<br><span style="font-size:10px;color:#8a7e74">${mRoomCat}</span>`:''}</td>
              <td style="padding:6px 10px;color:#5a5048">${s.flightNumber||'—'}</td>
              <td style="padding:6px 10px;color:#8a7e74;font-size:11px">${s.retreatLabel}</td>
              <td style="padding:6px 10px;text-align:right"><button onclick="trDeleteArrival('${s.id}')" style="font-size:11px;color:#dc2626;background:none;border:none;cursor:pointer;padding:2px 6px;border-radius:4px" title="Remove">✕</button></td>
            </tr>`;}).join('')}
          </tbody>
        </table></div>
      </div>`;
    }
    if(day.departures.length){
      const enrichedDep=day.departures.map(s=>{
        const bk=AppData.bookings.find(b=>b.id===s.bookingId)||{};
        return{...s,retreatLabel:bk.leaderName||bk.retreatName||'Unknown'};
      }).sort((a,b)=>a.departureTime.localeCompare(b.departureTime));
      movementHtml+=`<div style="margin-top:10px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#b45309;margin-bottom:6px">Departures (${day.departures.length})</div>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11.5px">
          <thead><tr style="background:#fffbeb">
            <th style="padding:5px 10px;text-align:left;color:#b45309;font-weight:700;border-bottom:1px solid #fcd34d;white-space:nowrap">Time</th>
            <th style="padding:5px 10px;text-align:left;color:#b45309;font-weight:700;border-bottom:1px solid #fcd34d">Airport</th>
            <th style="padding:5px 10px;text-align:left;color:#b45309;font-weight:700;border-bottom:1px solid #fcd34d">Guest</th>
            <th style="padding:5px 10px;text-align:left;color:#b45309;font-weight:700;border-bottom:1px solid #fcd34d">Flight</th>
            <th style="padding:5px 10px;text-align:left;color:#b45309;font-weight:700;border-bottom:1px solid #fcd34d">Retreat</th>
          </tr></thead>
          <tbody>${enrichedDep.map((s,i)=>{
            const airChip=s.departureAirport==='cancun'
              ?'<span style="font-size:10px;background:#e0f2fe;color:#0369a1;border-radius:4px;padding:1px 5px;font-weight:700">CUN</span>'
              :'<span style="font-size:10px;background:#d1fae5;color:#065f46;border-radius:4px;padding:1px 5px;font-weight:700">TQO</span>';
            return`<tr style="border-bottom:1px solid #fffbeb;background:${i%2===0?'#fff':'#fffdf5'}">
              <td style="padding:6px 10px;font-weight:700;color:#d97706;white-space:nowrap">${tsFmt(s.departureTime)}</td>
              <td style="padding:6px 10px">${airChip}</td>
              <td style="padding:6px 10px;font-weight:600;color:#2d2520;white-space:nowrap">${s.firstName} ${s.lastName}</td>
              <td style="padding:6px 10px;color:#5a5048">${s.flightNumber||s.departureFlight||'—'}</td>
              <td style="padding:6px 10px;color:#8a7e74;font-size:11px">${s.retreatLabel}</td>
            </tr>`;}).join('')}
          </tbody>
        </table></div>
      </div>`;
    }

    html+=`<div style="background:${bgColor};border:1.5px solid ${borderColor};border-radius:13px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:12px;padding:12px 18px;cursor:pointer;user-select:none" onclick="this.parentElement.querySelector('.trDayBody').style.display=this.parentElement.querySelector('.trDayBody').style.display==='none'?'block':'none'">
        <div style="min-width:52px">
          <div style="font-size:11px;font-weight:700;color:${isPast?'#9ca3af':isToday?'#0e9494':'#5a5048'};text-transform:uppercase;letter-spacing:.5px">${dayName}</div>
          <div style="font-size:20px;font-weight:800;color:${isToday?'#0e9494':isPast?'#9ca3af':'#2d2520'};line-height:1.1">${day.d}</div>
        </div>
        <div style="flex:1;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          ${retreatChips.join('')}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          ${(()=>{
            if(!day.arrivals.length)return'';
            const totalArrPax=day.checkIns.reduce((s,b)=>s+(b.pax||0),0);
            const submitted=day.arrivals.filter(s=>!s.arrivalOT).length;
            const missing=totalArrPax>0?totalArrPax-submitted:0;
            const label=totalArrPax>0?`${submitted} / ${totalArrPax}`:`${submitted}`;
            const chipColor=missing>0?'#dc2626':'#15803d';
            const chipBg=missing>0?'#fee2e2':'#dcfce7';
            return`<span style="font-size:11.5px;font-weight:700;color:${chipColor};background:${chipBg};padding:3px 10px;border-radius:99px;white-space:nowrap">▲ ${label} arriving</span>`;
          })()}
          ${(()=>{
            if(!day.departures.length)return'';
            const totalDepPax=day.checkOuts.reduce((s,b)=>s+(b.pax||0),0);
            const submitted=day.departures.filter(s=>!s.departureOT).length;
            const label=totalDepPax>0?`${submitted} / ${totalDepPax}`:`${submitted}`;
            const missing=totalDepPax>0?totalDepPax-submitted:0;
            const chipColor=missing>0?'#b45309':'#b45309';
            return`<span style="font-size:11.5px;font-weight:700;color:${chipColor};background:#fef9c3;padding:3px 10px;border-radius:99px;white-space:nowrap">▼ ${label} departing</span>`;
          })()}
          <span style="font-size:16px;color:#c8bfb5">${(day.arrivals.length||day.departures.length)?'▾':'›'}</span>
        </div>
      </div>
      <div class="trDayBody" style="display:${(day.arrivals.length||day.departures.length)?'block':'none'};padding:0 18px 14px">
        ${movementHtml||'<div style="color:#8a7e74;font-size:12.5px;padding:8px 0">No transport submissions for this day.</div>'}
      </div>
    </div>`;
  });
  html+='</div>';
  wrap.innerHTML=html;
}

function trBuildAllArrivals(){
  const wrap=document.getElementById('trContent');if(!wrap)return;
  const dEl=document.getElementById('trAllDate');
  const date=dEl?dEl.value:'';
  if(!date){wrap.innerHTML='<div style="color:#8a7e74;font-size:13px;text-align:center;padding:40px 0">Select a date to view all arrivals.</div>';return;}
  const MNTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const allSubs=loadTransport().filter(s=>s.arrivalDate===date&&s.arrivalTime&&s.arrivalAirport);
  if(!allSubs.length){
    // Build upcoming arrivals for the rest of the month
    const selDt=new Date(date+'T00:00:00');
    const monthEnd=new Date(selDt.getFullYear(),selDt.getMonth()+1,0).toISOString().slice(0,10);
    const upcoming=loadTransport().filter(s=>s.arrivalDate>date&&s.arrivalDate<=monthEnd&&s.arrivalTime&&s.arrivalAirport)
      .sort((a,b)=>a.arrivalDate===b.arrivalDate?a.arrivalTime.localeCompare(b.arrivalTime):a.arrivalDate.localeCompare(b.arrivalDate));
    let html='<div style="color:#8a7e74;font-size:13px;text-align:center;padding:30px 0 20px">No arrivals recorded for this date.</div>';
    if(upcoming.length){
      // Group by date
      const byDate={};
      upcoming.forEach(s=>{if(!byDate[s.arrivalDate])byDate[s.arrivalDate]=[];byDate[s.arrivalDate].push(s);});
      html+=`<div style="margin-top:4px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#8a7e74;margin-bottom:12px">Upcoming Arrivals This Month</div>`;
      Object.entries(byDate).forEach(([d,subs])=>{
        const dt2=new Date(d+'T00:00:00');
        const dayLabel=MNTHS[dt2.getMonth()]+' '+dt2.getDate()+', '+dt2.getFullYear();
        const enriched2=subs.map(s=>{
          const bk=AppData.bookings.find(b=>b.id===s.bookingId)||{};
          const etaMins=s.arrivalAirport==='cancun'?90:45;
          return{...s,retreatLabel:(s.bookingId==='individual'||s.isIndividual)?'Individual Guest':(bk.leaderName||bk.retreatName||'Unknown Retreat'),
            room:trGuestRoom(s.bookingId,s.email,s.firstName,s.lastName),
            eta:trAddMins(s.arrivalTime,etaMins)};
        });
        html+=`<div style="background:#fff;border:1px solid #e8dfd4;border-radius:12px;margin-bottom:10px;overflow:hidden">
          <div style="background:#f2f8f6;padding:9px 16px;border-bottom:1px solid #c8d8d4;display:flex;align-items:center;gap:8px;cursor:pointer" onclick="document.getElementById('trAllDate').value='${d}';trBuildAllArrivals()">
            <span style="font-size:12.5px;font-weight:700;color:#0e9494">${dayLabel}</span>
            <span style="font-size:11px;background:#0e9494;color:#fff;border-radius:99px;padding:1px 8px;font-weight:700">${enriched2.length} arrival${enriched2.length!==1?'s':''}</span>
            <span style="font-size:11px;color:#8a7e74;margin-left:auto">click to view →</span>
          </div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr style="background:#f5f1eb">
                <th style="padding:7px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4;white-space:nowrap">Time</th>
                <th style="padding:7px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Airport</th>
                <th style="padding:7px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">ETA</th>
                <th style="padding:7px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Flight</th>
                <th style="padding:7px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4;white-space:nowrap">Room #</th>
                <th style="padding:7px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Guest</th>
                <th style="padding:7px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Retreat</th>
                <th style="padding:7px 12px;border-bottom:1px solid #e8dfd4"></th>
              </tr></thead>
              <tbody>${enriched2.map((s,i)=>{
                const airChip=s.arrivalAirport==='cancun'
                  ?'<span style="font-size:10px;background:#e0f2fe;color:#0369a1;border-radius:4px;padding:1px 6px;font-weight:700">CUN</span>'
                  :'<span style="font-size:10px;background:#d1fae5;color:#065f46;border-radius:4px;padding:1px 6px;font-weight:700">TQO</span>';
                return`<tr style="border-bottom:1px solid #f0ece4;background:${i%2===0?'#fff':'#faf7f2'}">
                  <td style="padding:8px 12px;font-weight:700;color:#0e9494;white-space:nowrap">${tsFmt(s.arrivalTime)}</td>
                  <td style="padding:8px 12px">${airChip}</td>
                  <td style="padding:8px 12px;color:#2d2520;font-weight:600;white-space:nowrap">${s.eta}</td>
                  <td style="padding:8px 12px;color:#5a5048">${s.flightNumber||'—'}</td>
                  <td style="padding:8px 12px;white-space:nowrap"><span style="font-weight:700;color:#2d2520">${s.room}</span>${trRoomCat(s.room)?`<br><span style="font-size:10px;color:#8a7e74">${trRoomCat(s.room)}</span>`:''}</td>
                  <td style="padding:8px 12px;font-weight:600;color:#2d2520;white-space:nowrap">${s.firstName} ${s.lastName}</td>
                  <td style="padding:8px 12px;color:#8a7e74;font-size:11.5px">${s.retreatLabel}</td>
                  <td style="padding:8px 12px;text-align:right"><button onclick="trDeleteArrival('${s.id}')" style="font-size:11px;color:#dc2626;background:none;border:none;cursor:pointer;padding:2px 6px;border-radius:4px" title="Remove">✕</button></td>
                </tr>`;}).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
      });
      html+='</div>';
    } else {
      html+='<div style="color:#8a7e74;font-size:12.5px;text-align:center;padding-bottom:20px">No upcoming arrivals recorded for the rest of this month.</div>';
    }
    wrap.innerHTML=html;return;
  }

  // Enrich with retreat + room data
  const enriched=allSubs.map(s=>{
    const bk=AppData.bookings.find(b=>b.id===s.bookingId)||{};
    const etaMins=s.arrivalAirport==='cancun'?90:45;
    return{...s,
      retreatLabel:(s.bookingId==='individual'||s.isIndividual)?'Individual Guest':(bk.leaderName||bk.retreatName||'Unknown Retreat'),
      room:trGuestRoom(s.bookingId,s.email,s.firstName,s.lastName),
      eta:trAddMins(s.arrivalTime,etaMins)
    };
  });

  // Sort ALL arrivals chronologically
  enriched.sort((a,b)=>a.arrivalAirport===b.arrivalAirport?a.arrivalTime.localeCompare(b.arrivalTime):a.arrivalTime.localeCompare(b.arrivalTime));

  // ── Group EVERYONE by airport into 20-minute ride windows ──────────────────
  // Assign each person a groupId and pricePerPax
  const groupMap={}; // email -> {groupId, groupSize, pricePerPax, soloPrice, airport}
  const rideGroups=[]; // [{airport, airLabel, guests[], pricePerPax, soloPrice, eta}]

  ['cancun','tulum'].forEach(airport=>{
    const subset=enriched.filter(s=>s.arrivalAirport===airport).sort((a,b)=>a.arrivalTime.localeCompare(b.arrivalTime));
    if(!subset.length)return;
    // Greedy 20-min grouping
    const used=new Set();
    subset.forEach((s,i)=>{
      if(used.has(i))return;
      const grp=[s];used.add(i);
      const anchor=trTimeToMins(s.arrivalTime);
      subset.forEach((s2,j)=>{
        if(j!==i&&!used.has(j)&&Math.abs(trTimeToMins(s2.arrivalTime)-anchor)<=20){
          grp.push(s2);used.add(j);
        }
      });
      const pricePax=trGetPrice(airport,grp.length);
      const soloPax=trGetPrice(airport,1);
      const airLabel=airport==='cancun'?'Cancún (CUN)':'Tulum (TQO)';
      const gid='grp_'+rideGroups.length;
      rideGroups.push({airport,airLabel,guests:grp,pricePerPax:pricePax,soloPrice:soloPax,eta:grp[0].eta,gid});
      grp.forEach(g=>{groupMap[g.email]={gid,groupSize:grp.length,pricePerPax:pricePax,soloPrice:soloPax,airport};});
    });
  });

  const dt=new Date(date+'T00:00:00');
  const dateLabel=MNTHS[dt.getMonth()]+' '+dt.getDate()+', '+dt.getFullYear();

  // ── Ride Groups panel ──────────────────────────────────────────────────────
  const GROUP_COLORS=['#e8f5f5','#faf5ff','#fff7ed','#f0fdf4','#eff6ff','#fdf4ff'];
  let html=`<div style="margin-bottom:20px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#8a7e74;margin-bottom:12px">Ride Groups · ${dateLabel}</div>
    <div style="display:flex;flex-direction:column;gap:10px">
    ${rideGroups.map((rg,gi)=>{
      const saves=rg.soloPrice-rg.pricePerPax;
      const bg=GROUP_COLORS[gi%GROUP_COLORS.length];
      return`<div style="background:${bg};border:1.5px solid #c8d8d4;border-radius:12px;padding:14px 18px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
          <span style="font-size:13px;font-weight:700;color:#0e9494">Ride ${gi+1}</span>
          <span style="font-size:11px;background:#0e9494;color:#fff;border-radius:99px;padding:2px 10px;font-weight:700">${rg.guests.length} person${rg.guests.length!==1?'s':''}</span>
          <span style="font-size:11.5px;color:#5a5048">${rg.airLabel}</span>
          <span style="font-size:11.5px;color:#8a7e74">ETA ${rg.eta}</span>
          <span style="font-size:13px;font-weight:800;color:${rg.guests.length===1?'#5a5048':'#15803d'};margin-left:auto">$${rg.pricePerPax} <span style="font-size:10.5px;font-weight:500;color:#8a7e74">${rg.guests.length===1?'Private Transport':'per person'}</span></span>
          ${saves>0?`<span style="font-size:11px;background:#d1fae5;color:#065f46;border-radius:99px;padding:2px 10px;font-weight:700">save $${saves} vs solo</span>`:''}
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="background:rgba(255,255,255,.6)">
              <th style="padding:6px 10px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #c8d8d4">Guest Name</th>
              <th style="padding:6px 10px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #c8d8d4;white-space:nowrap">Room #</th>
              <th style="padding:6px 10px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #c8d8d4">Flight</th>
              <th style="padding:6px 10px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #c8d8d4;white-space:nowrap">Arrival Time</th>
              <th style="padding:6px 10px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #c8d8d4">Airport</th>
              <th style="padding:6px 10px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #c8d8d4">ETA</th>
              <th style="padding:6px 10px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #c8d8d4">Retreat</th>
              <th style="padding:6px 10px;text-align:right;color:#5a5048;font-weight:700;border-bottom:1px solid #c8d8d4">Owes</th>
              <th style="padding:6px 10px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #c8d8d4;white-space:nowrap">Onsite Upgrade</th>
            </tr></thead>
            <tbody>${rg.guests.map(g=>{
              const airChipSm=g.arrivalAirport==='cancun'
                ?'<span style="font-size:10px;background:#e0f2fe;color:#0369a1;border-radius:4px;padding:1px 6px;font-weight:700">CUN</span>'
                :'<span style="font-size:10px;background:#d1fae5;color:#065f46;border-radius:4px;padding:1px 6px;font-weight:700">TQO</span>';
              const gUpg=trGetUpgrade(g.bookingId,g.room);
              const gUpgCell=gUpg
                ?`<div style="display:inline-flex;flex-direction:column;gap:2px">
                    <span style="font-size:10px;font-weight:700;color:#fff;background:#15803d;border-radius:5px;padding:2px 7px;white-space:nowrap">↑ ${gUpg.toName}${gUpg.suggestedRoom?' · Rm '+gUpg.suggestedRoom:''}</span>
                    <span style="font-size:10px;font-weight:700;color:#15803d">+$${gUpg.upgradeNightly}/night${gUpg.isSolo?'':' pp'} · ${gUpg.availableCount} avail.</span>
                  </div>`
                :'<span style="color:#c0b8b0;font-size:11px">—</span>';
              return`<tr style="border-bottom:1px solid rgba(200,216,212,.4)">
              <td style="padding:7px 10px;font-weight:600;color:#2d2520;white-space:nowrap">${g.firstName} ${g.lastName}</td>
              <td style="padding:7px 10px;font-weight:700;color:#2d2520">${g.room}</td>
              <td style="padding:7px 10px;color:#5a5048">${g.flightNumber||'—'}</td>
              <td style="padding:7px 10px;font-weight:600;color:#0e9494;white-space:nowrap">${tsFmt(g.arrivalTime)}</td>
              <td style="padding:7px 10px">${airChipSm}</td>
              <td style="padding:7px 10px;color:#2d2520;font-weight:600;white-space:nowrap">${g.eta}</td>
              <td style="padding:7px 10px;color:#8a7e74;font-size:11.5px">${g.retreatLabel}</td>
              <td style="padding:7px 10px;text-align:right;font-weight:800;color:${rg.guests.length===1?'#5a5048':'#15803d'};white-space:nowrap">$${rg.pricePerPax}</td>
              <td style="padding:7px 10px">${gUpgCell}</td>
            </tr>`;}).join('')}</tbody>
          </table>
        </div>
      </div>`;
    }).join('')}
    </div>
  </div>`;

  // ── Master chronological table with group + price columns ─────────────────
  html+=`<div style="background:#fff;border:1px solid #e8dfd4;border-radius:12px;overflow:hidden">
    <div style="background:#f2f8f6;padding:10px 18px;border-bottom:1px solid #c8d8d4;display:flex;align-items:center;gap:10px">
      <span style="font-size:12px;font-weight:700;color:#0e9494">All Arrivals · ${dateLabel}</span>
      <span style="font-size:11px;background:#0e9494;color:#fff;border-radius:99px;padding:1px 9px;font-weight:700">${enriched.length} total</span>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f5f1eb">
          <th style="padding:8px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Guest Name</th>
          <th style="padding:8px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4;white-space:nowrap">Room #</th>
          <th style="padding:8px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Flight</th>
          <th style="padding:8px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4;white-space:nowrap">Arrival Time</th>
          <th style="padding:8px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Airport</th>
          <th style="padding:8px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">ETA</th>
          <th style="padding:8px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Retreat</th>
          <th style="padding:8px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Ride</th>
          <th style="padding:8px 12px;text-align:right;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4">Price</th>
          <th style="padding:8px 12px;text-align:left;color:#5a5048;font-weight:700;border-bottom:1px solid #e8dfd4;white-space:nowrap">Onsite Upgrade</th>
        </tr></thead>
        <tbody>${enriched.map((s,i)=>{
          const gInfo=groupMap[s.email];
          const gNum=gInfo?rideGroups.findIndex(r=>r.gid===gInfo.gid)+1:null;
          const airChip=s.arrivalAirport==='cancun'
            ?'<span style="font-size:10px;background:#e0f2fe;color:#0369a1;border-radius:4px;padding:1px 6px;font-weight:700">CUN</span>'
            :'<span style="font-size:10px;background:#d1fae5;color:#065f46;border-radius:4px;padding:1px 6px;font-weight:700">TQO</span>';
          const rideChip=gNum?`<span style="font-size:10px;background:${GROUP_COLORS[(gNum-1)%GROUP_COLORS.length]};border:1px solid #c8d8d4;color:#0e9494;border-radius:4px;padding:1px 7px;font-weight:700">Ride ${gNum}</span>`:'—';
          const priceCell=gInfo
            ?(gInfo.groupSize===1
              ?`<span style="font-weight:800;color:#5a5048">$${gInfo.pricePerPax}</span> <span style="font-size:10px;color:#8a7e74">Private</span>`
              :`<span style="font-weight:800;color:#15803d">$${gInfo.pricePerPax}</span> <span style="font-size:10px;color:#8a7e74">sharing</span>`)
            :'—';
          const mUpg=trGetUpgrade(s.bookingId,s.room);
          const mUpgCell=mUpg
            ?`<div style="display:inline-flex;flex-direction:column;gap:2px">
                <span style="font-size:10px;font-weight:700;color:#fff;background:#15803d;border-radius:5px;padding:2px 7px;white-space:nowrap">↑ ${mUpg.toName}${mUpg.suggestedRoom?' · Rm '+mUpg.suggestedRoom:''}</span>
                <span style="font-size:10px;font-weight:700;color:#15803d">+$${mUpg.upgradeNightly}/night${mUpg.isSolo?'':' pp'} · ${mUpg.availableCount} avail.</span>
              </div>`
            :'<span style="color:#c0b8b0;font-size:11px">—</span>';
          return`<tr style="border-bottom:1px solid #f0ece4;background:${i%2===0?'#fff':'#faf7f2'}">
            <td style="padding:9px 12px;font-weight:600;color:#2d2520;white-space:nowrap">${s.firstName} ${s.lastName}</td>
            <td style="padding:9px 12px;font-weight:700;color:#2d2520">${s.room}</td>
            <td style="padding:9px 12px;color:#5a5048">${s.flightNumber||'—'}</td>
            <td style="padding:9px 12px;font-weight:700;color:#0e9494;white-space:nowrap">${tsFmt(s.arrivalTime)}</td>
            <td style="padding:9px 12px">${airChip}</td>
            <td style="padding:9px 12px;color:#2d2520;font-weight:600;white-space:nowrap">${s.eta}</td>
            <td style="padding:9px 12px;color:#8a7e74;font-size:11.5px">${s.retreatLabel}</td>
            <td style="padding:9px 12px">${rideChip}</td>
            <td style="padding:9px 12px;text-align:right">${priceCell}</td>
            <td style="padding:9px 12px">${mUpgCell}</td>
          </tr>`;}).join('')}</tbody>
      </table>
    </div>
  </div>`;

  wrap.innerHTML=html;
}

function trCopyFormLink(){
  const bk=trSelBkId?AppData.bookings.find(b=>b.id===trSelBkId):null;
  const url=`${location.origin}/transport-form.html`+(bk?'?bk='+bk.id:'');
  if(navigator.clipboard){navigator.clipboard.writeText(url).then(()=>showToast('Form link copied to clipboard!'));}
  else{prompt('Copy this link:',url);}
}

function trCopyIndividualLink(){
  const url=`${location.origin}/transport-form.html`;
  if(navigator.clipboard){navigator.clipboard.writeText(url).then(()=>showToast('Individual form link copied!'));}
  else{prompt('Copy this link:',url);}
}

function trDeleteIndividualSub(id){
  if(!confirm('Remove this transport submission?'))return;
  const data=loadTransport().filter(s=>s.id!==id);
  saveTransport(data);
  trBuildIndividual();
  showToast('Submission removed.');
}

function trBuildIndividual(){
  const wrap=document.getElementById('trContent');if(!wrap)return;
  const subs=loadTransport().filter(s=>s.bookingId==='individual'||s.isIndividual)
    .sort((a,b)=>(b.submittedAt||'').localeCompare(a.submittedAt||''));

  if(!subs.length){
    wrap.innerHTML=`<div style="color:#8a7e74;font-size:13px;text-align:center;padding:60px 0;max-width:440px;margin:0 auto;line-height:1.65">
      No individual guest transport submissions yet.<br>
      <span style="font-size:12px">Share the form link (button above) with guests who booked directly — not part of a retreat group.</span>
    </div>`;
    return;
  }

  const MNTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtD(iso){if(!iso)return'—';const[y,m,d]=iso.split('-');return MNTHS[parseInt(m,10)-1]+' '+parseInt(d,10)+', '+y;}

  let html=`<div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
    <div style="background:#fff;border:1px solid #e8dfd4;border-radius:11px;padding:14px 20px;flex:1;min-width:110px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#0e9494">${subs.length}</div>
      <div style="font-size:11px;color:#8a7e74;font-weight:600;margin-top:2px">Total Submissions</div>
    </div>
    <div style="background:#fff;border:1px solid #e8dfd4;border-radius:11px;padding:14px 20px;flex:1;min-width:110px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#0e9494">${subs.filter(s=>s.arrivalDate&&s.arrivalDate>=fmtISO(new Date())).length}</div>
      <div style="font-size:11px;color:#8a7e74;font-weight:600;margin-top:2px">Upcoming Arrivals</div>
    </div>
  </div>`;

  html+=`<div style="background:#fff;border:1px solid #e8dfd4;border-radius:12px;overflow:hidden">
    <div style="background:#f2f8f6;padding:12px 18px;border-bottom:1px solid #c8d8d4;font-size:12.5px;font-weight:700;color:#0e9494">Individual Guest Submissions</div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f5f1eb">
          <th style="padding:8px 12px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4">Name</th>
          <th style="padding:8px 12px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4">Email</th>
          <th style="padding:8px 12px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4">Flight</th>
          <th style="padding:8px 12px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4">Arrival</th>
          <th style="padding:8px 12px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4">Airport</th>
          <th style="padding:8px 12px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4">Departure</th>
          <th style="padding:8px 12px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4">Notes</th>
          <th style="padding:8px 12px;text-align:left;font-weight:700;color:#5a5048;border-bottom:1px solid #e8dfd4;white-space:nowrap">Submitted</th>
          <th style="padding:8px 12px;border-bottom:1px solid #e8dfd4"></th>
        </tr></thead>
        <tbody>${subs.map((s,i)=>{
          const airChipArr=s.arrivalAirport==='cancun'
            ?'<span style="font-size:10px;background:#e0f2fe;color:#0369a1;border-radius:4px;padding:1px 6px;font-weight:700">CUN</span>'
            :s.arrivalAirport==='tulum'
              ?'<span style="font-size:10px;background:#d1fae5;color:#065f46;border-radius:4px;padding:1px 6px;font-weight:700">TQO</span>'
              :(s.arrivalOT?'<span style="font-size:10px;background:#fee2e2;color:#dc2626;border-radius:4px;padding:1px 6px;font-weight:700">OT</span>':'—');
          const arrTime=s.arrivalOT?`Own transport — ${fmtD(s.arrivalDate)}`:(s.arrivalDate?`${fmtD(s.arrivalDate)} ${tsFmt(s.arrivalTime)||''}`.trim():'—');
          const depTime=s.departureOT?`Own transport — ${fmtD(s.departureDate)}`:(s.departureDate?`${fmtD(s.departureDate)} ${tsFmt(s.departureTime)||''}`.trim():'—');
          const subDt=s.submittedAt?new Date(s.submittedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
          return`<tr style="border-bottom:1px solid #f0ece4;background:${i%2===0?'#fff':'#faf7f2'}">
            <td style="padding:9px 12px;font-weight:600;color:#2d2520;white-space:nowrap">${s.firstName||''} ${s.lastName||''}</td>
            <td style="padding:9px 12px;color:#5a5048;font-size:11.5px">${s.email||'—'}</td>
            <td style="padding:9px 12px;color:#5a5048">${s.flightNumber||'—'}</td>
            <td style="padding:9px 12px;color:#2d2520;white-space:nowrap">${arrTime}</td>
            <td style="padding:9px 12px">${airChipArr}</td>
            <td style="padding:9px 12px;color:#2d2520;white-space:nowrap">${depTime}</td>
            <td style="padding:9px 12px;color:#8a7e74;font-size:11px;max-width:160px">${s.notes?s.notes.substring(0,80)+(s.notes.length>80?'…':''):'—'}</td>
            <td style="padding:9px 12px;color:#8a7e74;font-size:11px;white-space:nowrap">${subDt}</td>
            <td style="padding:9px 12px;text-align:right"><button onclick="trDeleteIndividualSub('${s.id}')" style="font-size:11px;color:#dc2626;background:none;border:none;cursor:pointer;padding:2px 6px;border-radius:4px" title="Remove">✕</button></td>
          </tr>`;}).join('')}</tbody>
      </table>
    </div>
  </div>`;

  wrap.innerHTML=html;
}

function trDeleteSub(id){
  if(!confirm('Remove this transport submission?'))return;
  const data=loadTransport().filter(s=>s.id!==id);
  saveTransport(data);
  trSelectRetreat(trSelBkId);
  showToast('Submission removed.');
}

function trDeleteArrival(id){
  if(!confirm('Remove this transport submission?'))return;
  const data=loadTransport().filter(s=>s.id!==id);
  saveTransport(data);
  refreshTransport();
  showToast('Submission removed.');
}

// Hook into tab switch
const _origSwitchTab=window.switchTab;
window.switchTab=function(id,btn){
  if(typeof _origSwitchTab==='function')_origSwitchTab(id,btn);
  if(id==='transport')trInit();
};

