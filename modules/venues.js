// ===== venues.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== VENUE GANTT =====
let _venTransportSynced=false;
function venBuild(){
  if(!_venTransportSynced&&typeof syncTransportFromSupabase==='function'){
    _venTransportSynced=true;
    syncTransportFromSupabase().then(()=>venBuild()).catch(()=>{});
  }
  venPopYearSel();
  const body=document.getElementById('venBody');
  body.innerHTML='';
  const today=new Date().toISOString().split('T')[0];
  const total=diy(venYear);

  const daysArr=[];
  for(let m=0;m<12;m++){const n=dim(m,venYear);for(let d=1;d<=n;d++){const dow=new Date(venYear,m,d).getDay();const ds=`${venYear}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;daysArr.push({m,d,dow,ds,wk:dow===0||dow===6,td:ds===today});}}

  // Header
  const hdr=document.createElement('div');hdr.className='gantt-hdr';
  const mr=document.createElement('div');mr.className='g-hrow';
  const c1=document.createElement('div');c1.className='g-corner';c1.style.width='180px';mr.appendChild(c1);
  const mc=document.createElement('div');mc.className='g-month-cells';
  for(let mo=0;mo<12;mo++){const w=dim(mo,venYear)*36;const el=document.createElement('div');el.className='g-mcell';el.style.cssText=`width:${w}px;min-width:${w}px`;el.textContent=MONTHS[mo];mc.appendChild(el);}
  mr.appendChild(mc);hdr.appendChild(mr);
  const dr=document.createElement('div');dr.className='g-hrow';
  const c2=document.createElement('div');c2.className='g-corner';c2.style.width='180px';dr.appendChild(c2);
  const dc=document.createElement('div');dc.className='g-day-cells';
  daysArr.forEach(d=>{const el=document.createElement('div');el.className='g-dcell'+(d.td?' today-h':'')+(d.wk?' weekend':'');el.innerHTML=`<span class="dd">${d.d}</span><span class="dn">${DSHORT[d.dow]}</span>`;dc.appendChild(el);});
  dr.appendChild(dc);hdr.appendChild(dr);body.appendChild(hdr);

  // Auto-resolve existing row conflicts: two retreats should never double up
  // in the same numbered Retreat section while another sits empty (Darlene's
  // call 2026-09-16). Only rebalances across the plain "RETREAT N" rows —
  // never touches Chica Retreat/Special Events/custom rows, which represent
  // a different physical property/context, not an interchangeable slot.
  (function resolveVenRowConflicts(){
    const numberedRows=AppData.venRows.filter(r=>/^RETREAT\s+\d+$/i.test(r));
    if(numberedRows.length<2)return;
    const active=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.bookingType!=='room_only'&&numberedRows.includes(b.row))
      .sort((a,b)=>a.startDate.localeCompare(b.startDate));
    const occupied={};let changed=false;
    active.forEach(bk=>{
      const conflicts=r=>(occupied[r]||[]).some(o=>datesOverlap(bk.startDate,bk.endDate,o.startDate,o.endDate));
      let targetRow=bk.row;
      if(conflicts(targetRow)){
        const free=numberedRows.find(r=>!conflicts(r));
        if(free&&free!==bk.row){targetRow=free;bk.row=free;changed=true;}
      }
      (occupied[targetRow]=occupied[targetRow]||[]).push({startDate:bk.startDate,endDate:bk.endDate});
    });
    if(changed)saveAll();
  })();

  // Rows
  const LANE_H=48;
  AppData.venRows.forEach(rowName=>{
    const soy=new Date(venYear,0,1),eoy=new Date(venYear,11,31);
    // Pre-compute visible blocks + lane assignment
    // Room Only bookings belong on the physical Room Calendar (rcBuild), not
    // this retreat-row Gantt — Darlene's call 2026-09-14: a Soft Hold on a
    // specific room was showing up here as if it were a retreat, which isn't
    // where staff expect Room Only bookings to live.
    const visBks=AppData.bookings.filter(b=>b.row===rowName&&b.bookingType!=='room_only').map(bk=>{
      const sd=pd(bk.startDate),ed=pd(bk.endDate);
      if(sd.getFullYear()>venYear||ed.getFullYear()<venYear)return null;
      const cs=new Date(Math.max(sd,soy)),ce=new Date(Math.min(ed,eoy));
      const li=Math.floor((cs-soy)/DAY_MS),wi=Math.floor((ce-cs)/DAY_MS);
      return wi>0?{bk,li,wi}:null;
    }).filter(Boolean).sort((a,b)=>a.bk.startDate.localeCompare(b.bk.startDate));
    const lanes=[];const bkLane=new Map(); // lanes[i] = array of {startDate,endDate}
    visBks.forEach(({bk})=>{
      let lane=-1;
      for(let i=0;i<lanes.length;i++){
        const noConflict=lanes[i].every(o=>!datesOverlap(bk.startDate,bk.endDate,o.startDate,o.endDate));
        if(noConflict){lane=i;break;}
      }
      if(lane===-1){lane=lanes.length;lanes.push([]);}
      lanes[lane].push({startDate:bk.startDate,endDate:bk.endDate});
      bkLane.set(bk.id,lane);
    });
    const numLanes=Math.max(1,lanes.length);
    const rowH=8+numLanes*LANE_H;

    const row=document.createElement('div');row.className='g-row';row.style.height=rowH+'px';
    const lbl=document.createElement('div');lbl.className='g-lbl ven-row-lbl';lbl.style.width='180px';lbl.dataset.row=rowName;
    lbl.innerHTML=`<span style="cursor:grab;font-size:12px;color:#ccc;margin-right:6px" title="Drag to reorder">⠿</span><span>${rowName}</span>`;
    lbl.draggable=true;
    lbl.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',rowName);lbl.style.opacity='.4';});
    lbl.addEventListener('dragend',()=>{lbl.style.opacity='1';});
    lbl.addEventListener('dragover',e=>{e.preventDefault();lbl.style.background='#e0f2fe';});
    lbl.addEventListener('dragleave',()=>{lbl.style.background='';});
    lbl.addEventListener('drop',e=>{e.preventDefault();lbl.style.background='';const from=e.dataTransfer.getData('text/plain');const to=rowName;if(from===to)return;const fi=AppData.venRows.indexOf(from),ti=AppData.venRows.indexOf(to);if(fi<0||ti<0)return;AppData.venRows.splice(fi,1);AppData.venRows.splice(ti,0,from);saveAll();venBuild();});
    row.appendChild(lbl);
    const track=document.createElement('div');track.className='g-track';track.style.cssText=`width:${total*36}px;min-width:${total*36}px`;
    track.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('text/bk-id')){e.preventDefault();track.style.background='rgba(45,106,106,.06)';}});
    track.addEventListener('dragleave',()=>{track.style.background='';});
    track.addEventListener('drop',e=>{track.style.background='';const bkId=e.dataTransfer.getData('text/bk-id');if(!bkId)return;e.preventDefault();const tb=AppData.bookings.find(b=>b.id===bkId);if(tb&&tb.row!==rowName){
      const conflict=AppData.bookings.some(b=>b.id!==tb.id&&b.row===rowName&&datesOverlap(tb.startDate,tb.endDate,b.startDate,b.endDate));
      const targetRow=conflict?findAvailableRow(tb.startDate,tb.endDate,tb.id):rowName;
      tb.row=targetRow;saveAll();venBuild();
      showToast(conflict?`Dates conflict in ${rowName} — moved to ${targetRow} instead.`:`Moved to ${targetRow}`);
    }});
    daysArr.forEach((d,i)=>{if(d.d===1){const gl=document.createElement('div');gl.className='g-gl ms';gl.style.left=i*36+'px';track.appendChild(gl);}if(d.td){const tl=document.createElement('div');tl.className='g-gl today-l';tl.style.left=(i*36+18)+'px';track.appendChild(tl);}});
    visBks.forEach(({bk,li,wi})=>{
      const lane=bkLane.get(bk.id)||0;
      const isInquiry=bk.source==='inquiry'&&bk.status==='requested';
      const isRoomOnly=bk.bookingType==='room_only';
      const st=isInquiry
        ?{label:'Inquiry',bg:'#f3f4f6',border:'#9ca3af',text:'#6b7280',dash:false}
        :isRoomOnly
        ?{label:(STATUS[bk.status]||STATUS.requested).label,...rmTypeColor(bk),dash:(STATUS[bk.status]||STATUS.requested).dash}
        :(STATUS[bk.status]||STATUS.requested);
      const regCount=registeredCount(bk.id);
      const autoFlags=getAutoFlags(bk);
      const manualFlags=(bk.flags||[]).filter(f=>!f.resolved);
      const hasFlags=autoFlags.length>0||manualFlags.length>0;
      const bl=document.createElement('div');bl.className='bk'+(isInquiry?' inquiry':st.dash?' dashed':'');
      bl.style.cssText=`left:${li*36+2}px;width:${wi*36-4}px;top:${8+lane*LANE_H}px;height:40px;background:${st.bg};border-color:${st.border};color:${st.text};position:absolute;`;
      const fillPct=bk.pax>0?Math.min(100,Math.round(regCount/bk.pax*100)):0;
      const countHtml=!isInquiry&&!isRoomOnly&&bk.pax?`<span class="bk-count" style="font-size:10.5px;font-weight:700;background:rgba(0,0,0,.12);border-radius:4px;padding:1px 5px;margin-left:4px">${regCount}/${bk.pax}</span>`:'';
      const transRoster=!isInquiry&&!isRoomOnly&&typeof getTransportRoster==='function'?getTransportRoster(bk.id):null;
      const transportHtml=transRoster&&transRoster.roster.length>0?`<span class="bk-transport" title="Transportation: ${transRoster.submittedCount}/${transRoster.roster.length} submitted — ${trCompletionLabel(transRoster.submittedCount,transRoster.roster.length)}" style="font-size:10.5px;font-weight:700;background:rgba(0,0,0,.12);border-radius:4px;padding:1px 5px;margin-left:4px;color:${trCompletionColor(transRoster.submittedCount,transRoster.roster.length)}">🚐 ${transRoster.submittedCount}/${transRoster.roster.length}</span>`:'';
      const flagHtml=hasFlags?`<span class="bk-flag" title="${autoFlags.length+manualFlags.length} flag(s)" onclick="event.stopPropagation();openFlagsModal('${bk.id}')">🚩</span>`:'';
      const roomOnlyBadge=isRoomOnly?`<span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;background:#a855f7;color:#fff;border-radius:3px;padding:1px 5px;margin-left:6px">🏨 Room Only</span>`:'';
      // Deposit Paid already has its own dedicated color in the legend (green)
      // — showing the word too was redundant (Darlene's call 2026-09-15).
      // Every other status keeps its text label since their colors alone
      // aren't as unambiguous (e.g. dashed red = Cancelled vs solid red =
      // Contract Signed).
      const stBadge=isInquiry
        ?`<span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;background:#e5e7eb;color:#6b7280;border-radius:3px;padding:1px 5px;margin-left:6px">Inquiry</span>`
        :bk.status==='deposit_paid'
        ?roomOnlyBadge
        :`<span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;opacity:.75;margin-left:5px">${st.label}</span>${roomOnlyBadge}`;
      const finBadge=bk.finalPaymentRequested?`<span title="Final payment requested" style="font-size:9.5px;background:rgba(0,0,0,.15);border-radius:3px;padding:1px 5px;margin-left:3px;font-weight:700">$</span>`:'';
      const bkTd=!bk.teacherDiscountDisabled?calcTeacherDiscount(bk,AppData.regs.filter(r=>r.bookingId===bk.id)):null;
      const discBadge=bkTd&&bkTd.tiers.some(t=>t.earned)?`<span title="Teacher discount earned — $${bkTd.totalCredit.toLocaleString()} credit" style="font-size:9px;font-weight:700;background:#16a34a;color:#fff;border-radius:3px;padding:1px 5px;margin-left:3px">★ DISC</span>`:'';
      bl.innerHTML=`<span class="bk-n">${bk.leaderName||bk.retreatName}</span>${stBadge}<span class="bk-s">${bk.retreatName&&bk.leaderName?bk.retreatName:''}</span>${countHtml}${transportHtml}${finBadge}${discBadge}<span style="flex:1"></span>${flagHtml}`;
      if(bk.pax&&fillPct>0){const bar=document.createElement('div');bar.style.cssText=`position:absolute;bottom:0;left:0;height:3px;width:${fillPct}%;background:${st.border};opacity:.6;border-radius:0 0 4px 4px;`;bl.appendChild(bar);}
      // roomLocked only protects a reservation from the automated
      // Straightline optimizer, never from a staff member manually
      // dragging it (Darlene's call 2026-09-17) — same as the Room Calendar.
      bl.draggable=true;
      bl.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/bk-id',bk.id);bl.style.opacity='.4';_bkDragActive=true;});
      bl.addEventListener('dragend',()=>{bl.style.opacity='1';setTimeout(()=>_bkDragActive=false,120);});
      bl.addEventListener('click',()=>{if(!_bkDragActive)showAvailPreview(bk.id);});
      bl.addEventListener('mouseenter',e=>showTip(e,bk,regCount));bl.addEventListener('mousemove',moveTip);bl.addEventListener('mouseleave',hideTip);
      track.appendChild(bl);
      // Flag badge — appended to track (not block) so overflow:hidden on block never clips it
      if(hasFlags){
        const flagCnt=autoFlags.length+manualFlags.length;
        const badge=document.createElement('div');
        badge.className='bk-flag-badge';
        badge.style.left=`${li*36+wi*36-12}px`;
        badge.style.top=`${8+lane*LANE_H-6}px`;
        badge.textContent=flagCnt>1?String(flagCnt):'!';
        badge.title=`${flagCnt} flag${flagCnt!==1?'s':''} — click to review`;
        badge.addEventListener('click',e=>{e.stopPropagation();openFlagsModal(bk.id);});
        track.appendChild(badge);
      }
    });
    row.appendChild(track);body.appendChild(row);
  });

  // ── PROGRAMS SECTION (BBC + RNR) ──
  const progSec=document.createElement('div');
  progSec.style.cssText='display:flex;height:28px;border-top:2px solid #a7f3d0;';
  const progSecL=document.createElement('div');
  progSecL.style.cssText='width:180px;min-width:180px;flex-shrink:0;position:sticky;left:0;z-index:10;background:#f0fdf4;border-right:2px solid var(--border);display:flex;align-items:center;padding:0 14px;';
  progSecL.innerHTML='<span style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#2d6a6a">Amansala Programs</span>';
  const progSecR=document.createElement('div');
  progSecR.style.cssText=`width:${total*36}px;min-width:${total*36}px;background:#f0fdf4;`;
  progSec.appendChild(progSecL);progSec.appendChild(progSecR);
  body.appendChild(progSec);

  const soy2=new Date(venYear,0,1),eoy2=new Date(venYear,11,31);
  ['BBC','RNR'].forEach(type=>{
    const typeName=type==='BBC'?'Bikini Bootcamp':'Restore & Renew';
    const typeColor=type==='BBC'?{bg:'#fef3c7',border:'#f59e0b',text:'#78350f'}:{bg:'#ede9fe',border:'#8b5cf6',text:'#4c1d95'};
    const typeBlocks=AppData.programBlocks.filter(p=>p.type===type&&p.startDate&&p.endDate&&pd(p.startDate)<=eoy2&&pd(p.endDate)>=soy2);
    const pRow=document.createElement('div');pRow.className='g-row';pRow.style.height='48px';
    const pLbl=document.createElement('div');pLbl.className='g-lbl';pLbl.style.cssText='width:180px;background:#fafff9;';
    pLbl.innerHTML=`<span style="font-size:11.5px;font-weight:700;color:#374151">${typeName}</span><button onclick="openProgBlock('${type}',null)" style="margin-left:auto;width:22px;height:22px;border-radius:6px;background:#2d6a6a;color:#fff;border:none;cursor:pointer;font-size:16px;line-height:1;flex-shrink:0;display:flex;align-items:center;justify-content:center">+</button>`;
    pRow.appendChild(pLbl);
    const pTrack=document.createElement('div');pTrack.className='g-track';pTrack.style.cssText=`width:${total*36}px;min-width:${total*36}px`;
    daysArr.forEach((d,i)=>{if(d.d===1){const gl=document.createElement('div');gl.className='g-gl ms';gl.style.left=i*36+'px';pTrack.appendChild(gl);}if(d.td){const tl=document.createElement('div');tl.className='g-gl today-l';tl.style.left=(i*36+18)+'px';pTrack.appendChild(tl);}});
    typeBlocks.forEach(pb=>{
      const sd=pd(pb.startDate),ed=pd(pb.endDate);
      const csT=Math.max(sd.getTime(),soy2.getTime()),ceT=Math.min(ed.getTime(),eoy2.getTime());
      const li=Math.floor((csT-soy2.getTime())/DAY_MS),wi=Math.floor((ceT-csT)/DAY_MS);
      if(wi<=0)return;
      const pbl=document.createElement('div');
      pbl.style.cssText=`position:absolute;left:${li*36+2}px;width:${wi*36-4}px;top:4px;height:40px;background:${typeColor.bg};border:2px solid ${typeColor.border};color:${typeColor.text};border-radius:6px;display:flex;align-items:center;padding:0 8px;cursor:pointer;box-sizing:border-box;overflow:hidden;white-space:nowrap;z-index:10;`;
      pbl.innerHTML=`<span style="font-size:11.5px;font-weight:600">${pb.count?pb.count+' guests':typeName}</span>${pb.notes?`<span style="font-size:10.5px;opacity:.7;margin-left:5px">${pb.notes}</span>`:''}`;
      pbl.addEventListener('click',()=>openProgBlock(type,pb.id));
      pTrack.appendChild(pbl);
    });
    pRow.appendChild(pTrack);body.appendChild(pRow);
  });

  // Special Events row on Gantt
  const evtYearEvents=(AppData.specialEvents||[]).filter(e=>e.status!=='cancelled'&&e.startDate&&e.endDate&&pd(e.startDate)<=eoy2&&pd(e.endDate)>=soy2);
  if(evtYearEvents.length){
    const evtRow=document.createElement('div');evtRow.style.cssText='display:flex;height:48px;border-top:1.5px solid var(--border);background:#faf5ff;';
    const evtLbl=document.createElement('div');evtLbl.style.cssText='width:180px;min-width:180px;flex-shrink:0;position:sticky;left:0;z-index:50;background:#f3e8ff;border-right:2px solid var(--border);display:flex;align-items:center;padding:0 14px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#7e22ce;gap:6px;';
    evtLbl.innerHTML='<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>Events';
    evtRow.appendChild(evtLbl);
    const evtTrack=document.createElement('div');evtTrack.style.cssText=`position:relative;width:${total*36}px;min-width:${total*36}px;height:48px;`;
    daysArr.forEach((d,i)=>{if(d.d===1){const gl=document.createElement('div');gl.className='g-gl ms';gl.style.left=i*36+'px';evtTrack.appendChild(gl);}});
    evtYearEvents.forEach(e=>{
      const sd=pd(e.startDate),ed=pd(e.endDate);
      const csT=Math.max(sd.getTime(),soy2.getTime()),ceT=Math.min(ed.getTime(),eoy2.getTime());
      const li=Math.floor((csT-soy2.getTime())/DAY_MS),wi=Math.floor((ceT-csT)/DAY_MS);
      if(wi<=0)return;
      const EVT_COLORS={wedding:{bg:'rgba(236,72,153,.12)',border:'#ec4899',text:'#9d174d'},bachelorette:{bg:'rgba(168,85,247,.12)',border:'#a855f7',text:'#6b21a8'},corporate:{bg:'rgba(59,130,246,.12)',border:'#3b82f6',text:'#1e40af'},birthday:{bg:'rgba(249,115,22,.12)',border:'#f97316',text:'#c2410c'},anniversary:{bg:'rgba(234,179,8,.12)',border:'#eab308',text:'#854d0e'},family:{bg:'rgba(34,197,94,.12)',border:'#22c55e',text:'#166534'},group:{bg:'rgba(14,148,148,.12)',border:'#0e9494',text:'#065f5f'},other:{bg:'rgba(100,116,139,.12)',border:'#64748b',text:'#334155'}};
      const c=EVT_COLORS[e.type]||EVT_COLORS.other;
      const ebl=document.createElement('div');
      ebl.style.cssText=`position:absolute;left:${li*36+2}px;width:${wi*36-4}px;top:5px;height:38px;background:${c.bg};border:2px solid ${c.border};color:${c.text};border-radius:6px;display:flex;align-items:center;padding:0 8px;cursor:pointer;box-sizing:border-box;overflow:hidden;white-space:nowrap;z-index:10;`;
      ebl.innerHTML=`<span style="font-size:11px;font-weight:600">${e.contact||e.name||'Event'}${e.pax?` · ${e.pax}p`:''}</span>`;
      ebl.addEventListener('click',()=>evtShowForm(e.id));
      evtTrack.appendChild(ebl);
    });
    evtRow.appendChild(evtTrack);body.appendChild(evtRow);
  }

  // Occ row
  const occRow=document.createElement('div');occRow.id='venOccRow';occRow.style.cssText='display:flex;height:32px;border-top:2px solid var(--border);background:var(--sand);position:sticky;bottom:0;z-index:40;';
  const ol=document.createElement('div');ol.style.cssText='width:180px;min-width:180px;flex-shrink:0;position:sticky;left:0;z-index:50;background:#ede9e1;border-right:2px solid var(--border);display:flex;align-items:center;padding:0 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);';ol.textContent='Occupancy';occRow.appendChild(ol);
  const occMap=new Array(total).fill(0);
  AppData.bookings.forEach(bk=>{if(bk.status==='cancelled')return;const soy=new Date(venYear,0,1),eoy=new Date(venYear,11,31);const cs=new Date(Math.max(pd(bk.startDate),soy));const ce=new Date(Math.min(pd(bk.endDate),eoy));const si=Math.floor((cs-soy)/DAY_MS),ei=Math.floor((ce-soy)/DAY_MS);for(let i=Math.max(0,si);i<=Math.min(total-1,ei);i++)occMap[i]++;});
  const ocells=document.createElement('div');ocells.style.display='flex';
  occMap.forEach(n=>{const oc=document.createElement('div');oc.className='occ-cell'+(n===1?' occ-1':n===2?' occ-2':n===3?' occ-3':n===4?' occ-4':n>=5?' occ-5':'');oc.textContent=n>0?n:'';ocells.appendChild(oc);});
  occRow.appendChild(ocells);body.appendChild(occRow);

  if(new Date().getFullYear()===venYear){const ti=daysArr.findIndex(d=>d.td);if(ti>3)setTimeout(()=>{document.getElementById('venScroll').scrollLeft=(ti-3)*36;},60);}

  // Populate cancelled retreats folder
  const cancelled=AppData.bookings.filter(b=>b.status==='cancelled').sort((a,b)=>b.startDate.localeCompare(a.startDate));
  const countEl=document.getElementById('cancelledCount');if(countEl)countEl.textContent=cancelled.length;
  const listEl=document.getElementById('cancelledList');
  if(listEl){
    if(cancelled.length===0){listEl.innerHTML='<p style="font-size:12.5px;color:var(--muted);padding:12px 0;font-style:italic">No cancelled retreats.</p>';}
    else{listEl.innerHTML=cancelled.map(bk=>`
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;margin:6px 0;background:#fff;border:1px solid #fecaca;border-radius:8px;cursor:pointer" onclick="openVenEdit('${bk.id}')">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:#374151">${bk.leaderName||bk.retreatName||'Untitled'}</div>
          <div style="font-size:11.5px;color:var(--muted)">${bk.retreatName&&bk.leaderName?bk.retreatName+' · ':''}${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)} · ${bk.pax||0} pax</div>
        </div>
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#991b1b;background:#fecaca;padding:2px 8px;border-radius:99px">Cancelled</span>
      </div>`).join('');}
  }
}

let cancelledOpen=false;
function toggleCancelledSection(){
  cancelledOpen=!cancelledOpen;
  const list=document.getElementById('cancelledList');
  const chevron=document.getElementById('cancelledChevron');
  if(list)list.style.display=cancelledOpen?'block':'none';
  if(chevron)chevron.style.transform=cancelledOpen?'rotate(90deg)':'';
}

function venShiftYear(d){venYear+=d;saveAll();venBuild();}
function venSetYear(y){venYear=y;saveAll();venBuild();}
function venScrollToMonth(m){
  const scroll=document.getElementById('venScroll');if(!scroll)return;
  let px=0;for(let i=0;i<m;i++)px+=dim(i,venYear)*36;
  scroll.scrollTo({left:px,behavior:'smooth'});
  // Highlight active month button
  for(let i=0;i<12;i++){const b=document.getElementById('venMonBtn'+i);if(b){b.style.background=i===m?'var(--teal)':'';b.style.color=i===m?'#fff':'';b.style.borderColor=i===m?'var(--teal)':'';}};
}
function venScrollToToday(){
  const t=new Date();const ty=t.getFullYear();
  if(ty!==venYear){venYear=ty;saveAll();venBuild();setTimeout(()=>venScrollToToday(),80);return;}
  const m=t.getMonth();venScrollToMonth(m);
}

// ── PROGRAM BLOCKS (BBC / RNR) ──
function openProgBlock(type,id){
  progEditType=type;progEditId=id;
  const name=type==='BBC'?'Bikini Bootcamp':'Restore & Renew';
  document.getElementById('progModalTitle').textContent=(id?'Edit ':'Add ')+name;
  document.getElementById('progModalSub').textContent=id?'Update participant count and dates':'Add a new block to the Gantt';
  document.getElementById('progDelBtn').style.display=id?'inline-flex':'none';
  if(id){const pb=AppData.programBlocks.find(p=>p.id===id);if(!pb)return;document.getElementById('pm-start').value=pb.startDate||'';document.getElementById('pm-end').value=pb.endDate||'';document.getElementById('pm-count').value=pb.count||'';document.getElementById('pm-notes').value=pb.notes||'';}
  else{document.getElementById('pm-start').value=`${venYear}-01-01`;document.getElementById('pm-end').value=`${venYear}-01-07`;document.getElementById('pm-count').value='';document.getElementById('pm-notes').value='';}
  openModal('progModal');
}
function saveProgBlock(){
  const start=document.getElementById('pm-start').value,end=document.getElementById('pm-end').value;
  if(!start||!end){alert('Please enter dates.');return;}
  if(start>end){alert('Departure must be after arrival.');return;}
  const count=parseInt(document.getElementById('pm-count').value)||0;
  const notes=document.getElementById('pm-notes').value.trim();
  if(progEditId){const pb=AppData.programBlocks.find(p=>p.id===progEditId);if(pb)Object.assign(pb,{startDate:start,endDate:end,count,notes});}
  else{AppData.programBlocks.push({id:uid(),type:progEditType,startDate:start,endDate:end,count,notes});}
  saveAll();closeModal('progModal');venBuild();showToast('Program block saved.');
}
function deleteProgBlock(){
  if(!progEditId||!confirm('Delete this program block?'))return;
  AppData.programBlocks=AppData.programBlocks.filter(p=>p.id!==progEditId);
  saveAll();closeModal('progModal');venBuild();showToast('Deleted.');
}
function venPopYearSel(){
  const sel=document.getElementById('venYearSel');if(!sel)return;
  const cur=new Date().getFullYear();
  const years=[];
  for(let y=cur-1;y<=cur+5;y++)years.push(y);
  // also include any year already in bookings
  AppData.bookings.forEach(b=>{const y=parseInt((b.startDate||'').slice(0,4));if(y&&!years.includes(y))years.push(y);});
  years.sort((a,b)=>a-b);
  sel.innerHTML=years.map(y=>`<option value="${y}"${y===venYear?' selected':''}>${y}</option>`).join('');
}


// ===== DATE FINDER =====
function dfInit(){
  // Populate year selector
  const ySel=document.getElementById('dfYear');
  if(!ySel.options.length){
    const yr=new Date().getFullYear();
    for(let y=yr;y<=yr+3;y++){const o=document.createElement('option');o.value=y;o.textContent=y;if(y===venYear)o.selected=true;ySel.appendChild(o);}
  }
  // Populate month selector to current/upcoming
  const mSel=document.getElementById('dfMonth');
  mSel.value=String(new Date().getMonth());
  // Populate row filters (both modes share the same row list)
  ['dfRow','dfRowSpecific'].forEach(id=>{
    const rSel=document.getElementById(id);if(!rSel)return;
    rSel.innerHTML='<option value="">All rows</option>';
    AppData.venRows.forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent=r;rSel.appendChild(o);});
  });
  const specificStartEl=document.getElementById('dfSpecificStart');
  if(specificStartEl&&!specificStartEl.value)specificStartEl.value=fmtISO(new Date());
  dfBuild();
}
function dfOnModeChange(){
  const mode=document.querySelector('input[name="dfMode"]:checked')?.value||'flexible';
  document.getElementById('dfSpecificControls').style.display=mode==='specific'?'flex':'none';
  document.getElementById('dfFlexibleControls').style.display=mode==='flexible'?'flex':'none';
  document.getElementById('dfResults').innerHTML='';
}

// ══════════════════════════════════════════════════════════════════════════
// SHARED ROW/STRAIGHT-LINE ANALYSIS — used by both Date Finder modes.
// A retreat "works" on a row if that row has no conflicting retreat for the
// exact window AND there's at least one physical room (matching the Chica
// preference) available for the ENTIRE stay, not just the arrival night.
// ══════════════════════════════════════════════════════════════════════════
function dfEligibleRows(chicaPref,rowFilter){
  let rows=rowFilter?[rowFilter]:AppData.venRows.filter(r=>r!=='SPECIAL EVENTS');
  if(chicaPref==='want')rows=rows.filter(r=>r==='CHICA RETREAT');
  else if(chicaPref==='avoid')rows=rows.filter(r=>r!=='CHICA RETREAT');
  return rows;
}
function dfRowWindowInfo(row,start,end){
  const rowBks=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.row===row&&b.startDate&&b.endDate).sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const conflict=rowBks.find(b=>datesOverlap(start,end,b.startDate,b.endDate));
  if(conflict)return{free:false,conflict};
  const prevBk=rowBks.filter(b=>b.endDate<=start).sort((a,b)=>b.endDate.localeCompare(a.endDate))[0]||null;
  const nextBk=rowBks.filter(b=>b.startDate>=end).sort((a,b)=>a.startDate.localeCompare(b.startDate))[0]||null;
  return{free:true,prevBk,nextBk,
    gapBefore:prevBk?Math.round((pd(start)-pd(prevBk.endDate))/DAY_MS):0,
    gapAfter:nextBk?Math.round((pd(nextBk.startDate)-pd(end))/DAY_MS):0};
}
// Same-day checkout/check-in (gap=0) is a straight-line; a side with no
// neighbor at all has nothing to fail against, so it never blocks "perfect".
function dfStraightlineStatus(info){
  const beforeOk=!info.prevBk||info.gapBefore===0;
  const afterOk=!info.nextBk||info.gapAfter===0;
  return{
    status:(beforeOk&&afterOk)?'perfect':(beforeOk!==afterOk)?'partial':'none',
    gapBefore:info.gapBefore||0,gapAfter:info.gapAfter||0,totalGap:(info.gapBefore||0)+(info.gapAfter||0),
  };
}
function dfChicaFilterRooms(rooms,chicaPref){
  return rooms.filter(r=>chicaPref==='want'?roomCategory(r)===1:chicaPref==='avoid'?roomCategory(r)!==1:true);
}
function dfRoomAvailFiltered(start,end,chicaPref,extRes){
  return rsComputeAvailability(start,end,extRes).map(x=>{
    const rooms=dfChicaFilterRooms(x.rt.rooms,chicaPref);
    return{...x,totalRooms:rooms.length,availableRooms:x.availableRooms.filter(r=>rooms.includes(r))};
  }).filter(x=>x.totalRooms>0);
}
function dfFindLimitingNight(start,end,chicaPref,extRes){
  let cur=pd(start);const endD=pd(end);
  while(cur<endD){
    const dayStr=fmtISO(cur);
    const total=dfRoomAvailFiltered(dayStr,fmtISO(addDays(cur,1)),chicaPref,extRes).reduce((s,r)=>s+r.availableRooms.length,0);
    if(total===0)return dayStr;
    cur=addDays(cur,1);
  }
  return start;
}
// Full analysis of ONE candidate [start,end) window.
function dfAnalyzeWindow(start,end,chicaPref,rowFilter,extRes){
  const rows=dfEligibleRows(chicaPref,rowFilter);
  const rowInfos=rows.map(row=>({row,info:dfRowWindowInfo(row,start,end)}));
  const freeRows=rowInfos.filter(r=>r.info.free);
  const roomAvail=dfRoomAvailFiltered(start,end,chicaPref,extRes);
  const totalAvail=roomAvail.reduce((s,r)=>s+r.availableRooms.length,0);

  if(!freeRows.length){
    const seen=new Set();
    const conflicts=rowInfos.map(r=>r.info.conflict).filter(c=>c&&!seen.has(c.id)&&seen.add(c.id));
    const reason=conflicts.length===1
      ?`These dates overlap ${conflicts[0].leaderName||conflicts[0].retreatName}'s retreat (${fmtDate(conflicts[0].startDate)} – ${fmtDate(conflicts[0].endDate)}), and no other eligible row is free for this window.`
      :`Every eligible row already has a retreat booked over these dates (${conflicts.map(c=>c.leaderName||c.retreatName).join(', ')}).`;
    return{works:false,reason};
  }
  if(!totalAvail){
    const limiting=dfFindLimitingNight(start,end,chicaPref,extRes);
    const chicaNote=chicaPref==='avoid'?' (excluding Chica)':chicaPref==='want'?' (Chica only)':'';
    return{works:false,reason:`Room inventory is fully booked on ${fmtDate(limiting)}${chicaNote} for these dates.`};
  }
  const rank={perfect:0,partial:1,none:2};
  const scored=freeRows.map(r=>({...r,sl:dfStraightlineStatus(r.info)}));
  scored.sort((a,b)=>rank[a.sl.status]-rank[b.sl.status]||a.sl.totalGap-b.sl.totalGap);
  const best=scored[0];
  return{works:true,row:best.row,prevBk:best.info.prevBk,nextBk:best.info.nextBk,sl:best.sl,roomAvail,totalAvail};
}
// Scans outward from the requested start date (same nights/Chica/row filter)
// for dates that actually work, ranked by straight-line quality then
// closeness to what was originally requested.
function dfFindAlternatives(requestedStart,nights,chicaPref,rowFilter,extRes,maxRadius){
  maxRadius=maxRadius||45;
  const results=[];
  for(let offset=1;offset<=maxRadius;offset++){
    for(const dir of[-1,1]){
      const candStart=fmtISO(addDays(pd(requestedStart),offset*dir));
      const candEnd=fmtISO(addDays(pd(candStart),nights));
      const analysis=dfAnalyzeWindow(candStart,candEnd,chicaPref,rowFilter,extRes);
      if(analysis.works)results.push({start:candStart,end:candEnd,offset,analysis});
    }
  }
  const rank={perfect:0,partial:1,none:2};
  results.sort((a,b)=>
    rank[a.analysis.sl.status]-rank[b.analysis.sl.status]
    ||a.analysis.sl.totalGap-b.analysis.sl.totalGap
    ||a.offset-b.offset
    ||b.analysis.totalAvail-a.analysis.totalAvail
  );
  return results.slice(0,2);
}
function dfBadge(text,bg,color,border){
  return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;background:${bg};color:${color};border:1px solid ${border};white-space:nowrap">${text}</span>`;
}
function dfStatusBadges(works,sl){
  if(!works)return dfBadge('✕ DATES DO NOT WORK','#fef2f2','#991b1b','#fca5a5');
  const worksBadge=dfBadge('✓ DATES WORK','#f0fdf4','#166534','#86efac');
  const slBadge=sl.status==='perfect'?dfBadge('⭐ PERFECT STRAIGHT-LINE','#f0fdf4','#166534','#86efac')
    :sl.status==='partial'?dfBadge('✓ PARTIAL STRAIGHT-LINE','#f0fdfa','#0f766e','#5eead4')
    :dfBadge('⚠ AVAILABLE WITH GAP','#fffbeb','#92400e','#fde68a');
  return worksBadge+slBadge;
}
function dfRenderResultCard(opts){
  const{start,end,nights,analysis,isBest}=opts;
  const card=document.createElement('div');
  card.className='df-slot '+(analysis.works&&analysis.sl.status==='perfect'?'sl':'nsl');
  card.style.cssText='flex-direction:column;align-items:flex-start;gap:7px;padding:14px 16px;max-width:440px;box-sizing:border-box;margin-bottom:12px;';
  let html=isBest?'<div style="font-size:11px;font-weight:800;color:#166534;letter-spacing:.5px">⭐ BEST FIT</div>':'';
  html+=`<div style="font-size:15px;font-weight:700">${fmtDate(start)} – ${fmtDate(end)} <span style="font-weight:400;color:var(--muted);font-size:12px">(${nights} night${nights!==1?'s':''})</span></div>`;
  html+=`<div style="display:flex;gap:6px;flex-wrap:wrap">${dfStatusBadges(analysis.works,analysis.sl)}</div>`;
  if(!analysis.works){
    html+=`<div style="font-size:12px;color:#7f1d1d;background:#fef2f2;border-radius:6px;padding:7px 10px;width:100%;box-sizing:border-box">${escHtml(analysis.reason)}</div>`;
  } else {
    if(analysis.sl.status!=='perfect'){
      html+=`<div style="font-size:11.5px;color:var(--muted)">Gap before: <b>${analysis.sl.gapBefore}</b> &nbsp;·&nbsp; Gap after: <b>${analysis.sl.gapAfter}</b> &nbsp;·&nbsp; Total gap nights: <b>${analysis.sl.totalGap}</b></div>`;
    }
    if(analysis.prevBk||analysis.nextBk){
      const parts=[];
      if(analysis.prevBk)parts.push(`← ${escHtml(analysis.prevBk.leaderName||analysis.prevBk.retreatName)} ends ${fmtDate(analysis.prevBk.endDate)}`);
      if(analysis.nextBk)parts.push(`${escHtml(analysis.nextBk.leaderName||analysis.nextBk.retreatName)} starts ${fmtDate(analysis.nextBk.startDate)} →`);
      html+=`<div style="font-size:10.5px;color:#94a3b8">${parts.join(' &nbsp;·&nbsp; ')}${analysis.row?' &nbsp;·&nbsp; '+escHtml(analysis.row):''}</div>`;
    }
    const roomBreakdown=analysis.roomAvail.filter(r=>r.availableRooms.length>0)
      .map(r=>`<div style="display:flex;justify-content:space-between;gap:14px;padding:3px 0;font-size:11.5px"><span>${r.rt.name}</span><span style="font-weight:700;color:#059669">${r.availableRooms.length} of ${r.totalRooms}</span></div>`)
      .join('')||'<div style="font-size:11.5px;color:#9ca3af;font-style:italic">No rooms available.</div>';
    const concurrent=AppData.bookings.filter(b=>b.status!=='cancelled'&&datesOverlap(start,end,b.startDate,b.endDate)&&b.row!==analysis.row);
    html+=`<button type="button" onclick="const p=this.nextElementSibling;p.style.display=p.style.display==='block'?'none':'block';" style="font-size:10.5px;font-weight:700;color:#059669;background:none;border:none;cursor:pointer;padding:2px 0 0;text-decoration:underline">${analysis.totalAvail} room${analysis.totalAvail!==1?'s':''} available ▾</button>`;
    html+=`<div style="display:none;padding:8px 10px;background:#fff;border:1px solid var(--border);border-radius:8px;width:100%;box-sizing:border-box">${roomBreakdown}</div>`;
    if(concurrent.length){
      html+=`<button type="button" onclick="const p=this.nextElementSibling;p.style.display=p.style.display==='block'?'none':'block';" style="font-size:10.5px;font-weight:700;color:#f59e0b;background:none;border:none;cursor:pointer;padding:0;text-decoration:underline">⚑ ${concurrent.length} other retreat${concurrent.length!==1?'s':''} booked ▾</button>`;
      html+=`<div style="display:none;font-size:11px;color:var(--muted)">${concurrent.map(b=>escHtml(b.leaderName||b.retreatName)).join(', ')}</div>`;
    }
    const rowEsc=(analysis.row||'').replace(/'/g,"\\'");
    html+=`<button class="df-reserve-btn" onclick="dfOpenReserve('${rowEsc}','${start}','${end}',${nights})">Reserve</button>`;
  }
  card.innerHTML=html;
  return card;
}

function dfBuild(){
  const mode=document.querySelector('input[name="dfMode"]:checked')?.value||'flexible';
  return mode==='specific'?dfBuildSpecific():dfBuildFlexible();
}

// ══════════════════════════════════════════════════════════════════════════
// MODE 1 — SPECIFIC START DATE. "Can I come Feb 27 for 5 nights?" Answers
// availability and straight-line quality for that EXACT window, then (if it
// doesn't work, or works but doesn't straight-line perfectly) automatically
// suggests nearby dates that do — Darlene's ask 2026-09-17.
// ══════════════════════════════════════════════════════════════════════════
async function dfBuildSpecific(){
  const start=document.getElementById('dfSpecificStart').value;
  const nights=parseInt(document.getElementById('dfSpecificNights').value);
  const rowFilter=document.getElementById('dfRowSpecific').value;
  const chicaPref=document.getElementById('dfChicaPrefSpecific')?.value||'';
  const container=document.getElementById('dfResults');
  if(!start){container.innerHTML='<div class="df-no-gaps">Choose a start date.</div>';return;}
  const end=fmtISO(addDays(pd(start),nights));
  container.innerHTML='<div class="df-no-gaps">Checking Cloudbeds…<br><span style="font-size:11.5px">This can take up to 30-40 seconds.</span></div>';
  const scanStart=fmtISO(addDays(pd(start),-60)),scanEnd=fmtISO(addDays(pd(start),60));
  const extRes=await fetchExternalReservationsForRange(scanStart,scanEnd);
  container.innerHTML='';

  const analysis=dfAnalyzeWindow(start,end,chicaPref,rowFilter,extRes);
  const reqHdr=document.createElement('div');
  reqHdr.style.cssText='font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.5px;margin-bottom:8px';
  reqHdr.textContent='REQUESTED DATES';
  container.appendChild(reqHdr);
  container.appendChild(dfRenderResultCard({start,end,nights,analysis,isBest:false}));

  if(!analysis.works||analysis.sl.status!=='perfect'){
    const alts=dfFindAlternatives(start,nights,chicaPref,rowFilter,extRes);
    if(alts.length){
      const best=alts[0];
      const hdr=document.createElement('div');
      hdr.style.cssText='margin:24px 0 8px;font-weight:700;font-size:13px;color:var(--dark)';
      hdr.textContent=analysis.works?'BETTER STRAIGHT-LINE OPTION':'NEAREST DATES THAT WORK';
      container.appendChild(hdr);
      const msg=document.createElement('div');
      msg.style.cssText='font-size:12.5px;color:var(--muted);margin-bottom:12px;line-height:1.5;max-width:520px';
      msg.textContent=analysis.works
        ?`Your requested dates ${fmtDate(start)} – ${fmtDate(end)} work, but create ${analysis.sl.totalGap} unused gap night${analysis.sl.totalGap!==1?'s':''}. Moving to ${fmtDate(best.start)} – ${fmtDate(best.end)} ${best.analysis.sl.status==='perfect'?'creates a perfect straight-line with 0 gap nights':'is a better fit with '+best.analysis.sl.totalGap+' gap night'+(best.analysis.sl.totalGap!==1?'s':'')}.`
        :`Your requested dates ${fmtDate(start)} – ${fmtDate(end)} cannot be accommodated — ${analysis.reason} The closest ${nights}-night option that works is ${fmtDate(best.start)} – ${fmtDate(best.end)}.`;
      container.appendChild(msg);
      const altsWrap=document.createElement('div');altsWrap.style.cssText='display:flex;flex-wrap:wrap;gap:14px';
      alts.forEach((alt,i)=>altsWrap.appendChild(dfRenderResultCard({start:alt.start,end:alt.end,nights,analysis:alt.analysis,isBest:i===0})));
      container.appendChild(altsWrap);
    } else if(!analysis.works){
      const none=document.createElement('div');
      none.style.cssText='margin-top:16px;font-size:12.5px;color:var(--muted)';
      none.textContent=`No ${nights}-night option was found within 45 days of ${fmtDate(start)} either. Try a different duration or Chica preference.`;
      container.appendChild(none);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// MODE 2 — FLEXIBLE DATES. Scans the whole selected month across every
// eligible row/duration/preferred-day combination, then ranks ALL results
// globally by operational value (perfect straight-line first, then partial,
// then lowest gap) instead of just listing them chronologically per row —
// "show sales staff the dates we WANT to sell first" (Darlene's ask
// 2026-09-17).
// ══════════════════════════════════════════════════════════════════════════
async function dfBuildFlexible(){
  const month=parseInt(document.getElementById('dfMonth').value);
  const year=parseInt(document.getElementById('dfYear').value);
  const rowFilter=document.getElementById('dfRow').value;
  const chicaPref=document.getElementById('dfChicaPref')?.value||'';
  const durations=Array.from(document.querySelectorAll('#tab-datefinder .df-dur-checks input:checked')).map(cb=>parseInt(cb.value));
  const dayFilters=Array.from(document.querySelectorAll('#tab-datefinder .df-day-checks input:checked')).map(cb=>parseInt(cb.value));
  if(!durations.length){document.getElementById('dfResults').innerHTML='<div class="df-no-gaps">Select at least one duration above.</div>';return;}

  const container=document.getElementById('dfResults');
  container.innerHTML='<div class="df-no-gaps">Checking Cloudbeds…<br><span style="font-size:11.5px">This can take up to 30-40 seconds.</span></div>';
  const _dfScanStart=fmtISO(new Date(year,month-1,1)),_dfScanEnd=fmtISO(new Date(year,month+2,0));
  const extRes=await fetchExternalReservationsForRange(_dfScanStart,_dfScanEnd);
  container.innerHTML='';

  const rows=dfEligibleRows(chicaPref,rowFilter);
  const allCheckoutDates=new Set();
  AppData.bookings.forEach(b=>{if(b.status!=='cancelled'&&b.endDate)allCheckoutDates.add(b.endDate);});
  (extRes||[]).forEach(r=>{if(r.endDate)allCheckoutDates.add(r.endDate);});

  const mStart=new Date(year,month,1),mEnd=new Date(year,month+1,1);
  const scanStart=new Date(year,month-1,1),scanEnd=new Date(year,month+2,0);
  const allSlots=[];

  rows.forEach(row=>{
    const rowBks=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.row===row&&b.startDate&&b.endDate).sort((a,b)=>a.startDate.localeCompare(b.startDate));
    const gaps=[];
    let cursor=fmtISO(scanStart);
    rowBks.forEach(bk=>{
      if(bk.startDate>cursor)gaps.push({start:cursor,end:bk.startDate,prevBk:null,nextBk:bk});
      if(bk.endDate>cursor)cursor=bk.endDate;
    });
    const scanEndStr=fmtISO(scanEnd);
    if(cursor<scanEndStr)gaps.push({start:cursor,end:scanEndStr,prevBk:rowBks[rowBks.length-1]||null,nextBk:null});
    let lastBk=null;
    rowBks.forEach(bk=>{const g=gaps.find(g=>g.end===bk.startDate);if(g)g.prevBk=lastBk;lastBk=bk;});

    gaps.forEach(gap=>{
      const gapDays=Math.round((pd(gap.end)-pd(gap.start))/DAY_MS);
      if(gapDays<Math.min(...durations))return;
      durations.forEach(nights=>{
        if(gapDays<nights)return;
        let cur=pd(gap.start);
        const gapEndD=pd(gap.end);
        while(true){
          const candEndD=addDays(cur,nights);
          if(candEndD>gapEndD)break;
          const candStart=fmtISO(cur),candEnd=fmtISO(candEndD);
          const isGapStart=candStart===gap.start;
          // A preferred-weekday candidate must ALSO land on a date someone
          // is actually checking out somewhere — otherwise it's not a real
          // changeover date, just an arbitrary weekday inside the gap.
          const wanted=dayFilters.length?(dayFilters.includes(cur.getDay())&&(isGapStart||allCheckoutDates.has(candStart))):isGapStart;
          if(wanted&&!(cur>=mEnd||candEndD<=mStart)){
            const gapBefore=gap.prevBk?Math.round((pd(candStart)-pd(gap.prevBk.endDate))/DAY_MS):0;
            const gapAfter=gap.nextBk?Math.round((pd(gap.nextBk.startDate)-pd(candEnd))/DAY_MS):0;
            const sl=dfStraightlineStatus({prevBk:gap.prevBk,nextBk:gap.nextBk,gapBefore,gapAfter});
            allSlots.push({row,nights,start:candStart,end:candEnd,prevBk:gap.prevBk,nextBk:gap.nextBk,sl});
            cur=candEndD;
            continue;
          }
          cur=addDays(cur,1);
        }
      });
    });
  });

  if(!allSlots.length){
    container.innerHTML=`<div class="df-no-gaps">No openings found in ${MONTHS[month]} ${year} for the selected durations and rows.</div>`;
    return;
  }

  // Global priority, not chronological — but grouped under clear section
  // headers rather than one mixed list, so "perfect" vs "leaves a gap" is
  // never ambiguous at a glance (Darlene's call 2026-09-17: "they are not
  // all straightlining" — the fix isn't to hide the non-perfect ones, since
  // the spec explicitly wants them shown, it's to stop mixing them together).
  const tiers=[
    {status:'perfect',label:'⭐ PERFECT STRAIGHT-LINE',sub:'Same-day checkout → check-in on every adjacent side'},
    {status:'partial',label:'✓ PARTIAL STRAIGHT-LINE',sub:'Aligns on one side, leaves nights open on the other'},
    {status:'none',label:'⚠ AVAILABLE WITH GAP',sub:'Works, but does not align with either neighboring retreat'},
  ];
  allSlots.sort((a,b)=>a.sl.totalGap-b.sl.totalGap||a.start.localeCompare(b.start));
  tiers.forEach(tier=>{
    const slots=allSlots.filter(s=>s.sl.status===tier.status);
    if(!slots.length)return;
    const hdr=document.createElement('div');
    hdr.style.cssText='margin:20px 0 4px;font-weight:700;font-size:13px;color:var(--dark)';
    hdr.textContent=`${tier.label} (${slots.length})`;
    container.appendChild(hdr);
    const sub=document.createElement('div');
    sub.style.cssText='font-size:11.5px;color:var(--muted);margin-bottom:10px';
    sub.textContent=tier.sub;
    container.appendChild(sub);
    slots.forEach(s=>{
      const roomAvail=dfRoomAvailFiltered(s.start,s.end,chicaPref,extRes);
      const totalAvail=roomAvail.reduce((sum,r)=>sum+r.availableRooms.length,0);
      const analysis={works:true,row:s.row,prevBk:s.prevBk,nextBk:s.nextBk,sl:s.sl,roomAvail,totalAvail};
      container.appendChild(dfRenderResultCard({start:s.start,end:s.end,nights:s.nights,analysis,isBest:false}));
    });
  });
}


// ===== QUICK RESERVE =====
let qrPending=null;

function dfOpenReserve(row,start,end,nights){
  qrPending={row,start,end,nights};
  document.getElementById('qrModalSub').textContent=`${row} · ${fmtDate(start)} – ${fmtDate(end)}`;
  document.getElementById('qrInfoBar').innerHTML=
    `<span><b>Row</b>${row}</span>`
    +`<span><b>Check-in</b>${fmtDate(start)}</span>`
    +`<span><b>Check-out</b>${fmtDate(end)}</span>`
    +`<span><b>Duration</b>${nights} nights</span>`;
  document.getElementById('qr-leader').value='';
  document.getElementById('qr-retreat').value='';
  document.getElementById('qr-pax').value='';
  document.getElementById('qr-status').value='pending';
  document.getElementById('qr-notes').value='';
  document.getElementById('qrRoomPreview').textContent='Enter guest count to preview room assignment.';
  openModal('quickReserveModal');
  setTimeout(()=>document.getElementById('qr-leader').focus(),80);
}

function qrUpdatePreview(){
  if(!qrPending)return;
  const pax=parseInt(document.getElementById('qr-pax').value)||0;
  const notes=document.getElementById('qr-notes').value;
  const prev=document.getElementById('qrRoomPreview');
  if(!pax){prev.textContent='Enter guest count to preview room assignment.';return;}
  const isChica=qrPending.row==='CHICA'||notes.toLowerCase().includes('chica');
  const takenRooms=new Set();
  AppData.bookings.forEach(other=>{
    if(other.status==='cancelled')return;
    if(!datesOverlap(qrPending.start,qrPending.end,other.startDate,other.endDate))return;
    (other.blockedRooms||[]).forEach(r=>takenRooms.add(r));
    AppData.regs.filter(r=>r.bookingId===other.id&&r.room&&(r.guests||[]).some(g=>g.name)).forEach(r=>takenRooms.add(r.room));
  });
  const preset=getBldPreset(pax);
  const selected=[];
  preset.tiers.forEach(tier=>{
    const rt=AppData.roomTypes.find(r=>r.id===tier.id);if(!rt)return;
    const pool=rt.rooms.slice().filter(r=>!isChica||roomCategory(r)===1).sort((a,b)=>roomCategory(a)-roomCategory(b));
    let count=0;
    for(const room of pool){if(count>=tier.n)break;if(!takenRooms.has(room)){selected.push(room);count++;}}
  });
  if(selected.length)prev.innerHTML=`<b style="color:var(--teal)">${selected.length} rooms</b> will be assigned: <span style="color:var(--dark)">${selected.join(', ')}</span>`;
  else prev.innerHTML=`<span style="color:#dc2626">No rooms available for ${pax} guests on these dates.</span>`;
}

function qrSave(){
  if(!qrPending)return;
  const lead=document.getElementById('qr-leader').value.trim();
  const ret=document.getElementById('qr-retreat').value.trim();
  const pax=parseInt(document.getElementById('qr-pax').value)||0;
  const status=document.getElementById('qr-status').value;
  const notes=document.getElementById('qr-notes').value.trim();
  if(!lead&&!ret){alert('Enter a leader or retreat name.');return;}
  if(!pax){alert('Enter the number of guests.');return;}
  const {row,start,end,nights}=qrPending;
  const effectiveRow=notes.toLowerCase().includes('chica')?'CHICA':row;
  const isChica=effectiveRow==='CHICA';
  // Build taken rooms (exclude this new booking — it doesn't exist yet).
  // Also cross-checks real registrations, not just blockedRooms — a room can
  // have a named guest registered in it whose room was never added to
  // blockedRooms ("orphaned registration"; confirmed real incidents:
  // Katherine McClelland's CH3a/CH3b, Monica's 5B/GV13a/GV13b).
  const takenRooms=new Set();
  AppData.bookings.forEach(other=>{
    if(other.status==='cancelled')return;
    if(!datesOverlap(start,end,other.startDate,other.endDate))return;
    (other.blockedRooms||[]).forEach(r=>takenRooms.add(r));
    AppData.regs.filter(r=>r.bookingId===other.id&&r.room&&(r.guests||[]).some(g=>g.name)).forEach(r=>takenRooms.add(r.room));
  });
  const preset=getBldPreset(pax);
  const selected=[],skipped=[];
  preset.tiers.forEach(tier=>{
    const rt=AppData.roomTypes.find(r=>r.id===tier.id);if(!rt)return;
    const pool=rt.rooms.slice().filter(r=>!isChica||roomCategory(r)===1).sort((a,b)=>roomCategory(a)-roomCategory(b));
    let count=0;
    for(const room of pool){if(count>=tier.n)break;if(!takenRooms.has(room)){selected.push(room);count++;}}
    if(count<tier.n)skipped.push(`${tier.n-count}× ${rt.name}`);
  });
  if(!selected.length){alert('No rooms could be assigned — all available rooms may be blocked by overlapping retreats.');return;}
  let msg=`Reserve ${nights} nights for ${pax} guests?\n\nRooms to assign: ${selected.join(', ')}`;
  if(skipped.length)msg+=`\n\nNote: Not enough inventory for:\n${skipped.join('\n')}`;
  if(!confirm(msg))return;
  // Create booking
  const bkId=uid();
  AppData.bookings.push({id:bkId,leaderName:lead,retreatName:ret,startDate:start,endDate:end,row:effectiveRow,pax,status,notes,docLink:'',roomAssignments:[],blockedRooms:selected});
  saveAll();venBuild();
  closeModal('quickReserveModal');
  showToast(`Reserved · ${selected.length} rooms assigned.`);
  // Navigate to Teacher Registration with this booking selected
  const regBtn=document.querySelectorAll('.tab-btn')[2];
  switchTab('teacherreg',regBtn);
  setTimeout(()=>regSelectRetreat(bkId),80);
}

// Venue modal
function venGoToReg(){
  if(!venEditId)return;
  closeModal('venModal');
  const btn=document.querySelectorAll('.tab-btn')[2];
  switchTab('teacherreg',btn);
  setTimeout(()=>regSelectRetreat(venEditId),80);
}
// Returns the first venue row with no date conflict for start–end (excludes booking with excludeId)
function findAvailableRow(start,end,excludeId){
  for(const row of AppData.venRows){
    const conflict=AppData.bookings.some(b=>b.id!==excludeId&&b.row===row&&datesOverlap(start,end,b.startDate,b.endDate));
    if(!conflict)return row;
  }
  return AppData.venRows[0]; // fallback: first row (will stack)
}

// Rebuild the row dropdown with availability indicators for given dates
function venUpdateRowOptions(start,end,selectedRow,excludeId){
  const sel=document.getElementById('vm-row');if(!sel)return;
  sel.innerHTML=AppData.venRows.map(r=>{
    const conflict=start&&end&&AppData.bookings.some(b=>b.id!==excludeId&&b.row===r&&datesOverlap(start,end,b.startDate,b.endDate));
    const label=conflict?`${r} — dates taken`:r;
    const picked=r===(selectedRow||r);
    return`<option value="${r}"${picked?' selected':''}${conflict?' style="color:#b45309"':''}>${label}</option>`;
  }).join('');
}

function goToRoomOnlyTab(){
  switchTab('roomcal',document.querySelector('.tab-btn[onclick*="roomcal"]'));
  showToast('Click an open date on any room\'s row to book it.');
}
function openVenAdd(){
  venEditId=null;
  document.getElementById('venModalTitle').textContent='Add Booking';
  ['venDelBtn','venGoRegBtn','venContractBtn','venAcceptDatesBtn','venAutoAssignBtn','venManualAssignBtn','venAddMoreBtn','venRoomsSoldOutBtn','venFinBtn','venCopyRoomsBtn','venSendRoomListBtn','venScheduleBtn'].forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById('venRoomCalBanner').style.display='none';
  document.getElementById('vm-payment-widget').style.display='none';
  document.getElementById('vm-history').style.display='none';
  document.getElementById('vm-leader').value='';
  document.getElementById('vm-retreat').value='';
  document.getElementById('vm-email').value='';
  document.getElementById('vm-phone').value='';
  const _tpBanner=document.getElementById('tpMatchBanner');if(_tpBanner){_tpBanner.style.display='none';_tpBanner.innerHTML='';}
  const defStart=`${venYear}-01-01`,defEnd=`${venYear}-01-07`;
  document.getElementById('vm-start').value=defStart;
  document.getElementById('vm-end').value=defEnd;
  document.getElementById('vm-pax').value='';
  document.getElementById('vm-status').value='pending';
  document.getElementById('vm-notes').value='';
  document.getElementById('vm-doc-link').value='';
  const bestRow=findAvailableRow(defStart,defEnd,null);
  venUpdateRowOptions(defStart,defEnd,bestRow,null);
  // Re-evaluate row options whenever dates change
  ['vm-start','vm-end'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    el.onchange=()=>{
      const s=document.getElementById('vm-start').value,e=document.getElementById('vm-end').value;
      if(s&&e){const best=findAvailableRow(s,e,venEditId);venUpdateRowOptions(s,e,best,venEditId);}
    };
  });
  openModal('venModal');
}
// ── Room-only pricing engine — mirrors netlify/functions/get-rates.js exactly (base → seasonal → weekend → manual override) ──
// Shared by the "New Reservation" (room-only) modal below.
let _venRoSettings=null,_venRoRates=null;
async function venRoLoadPricingConfig(){
  if(_venRoSettings!==null&&_venRoRates!==null)return;
  try{
    const [{data:s},{data:r}]=await Promise.all([
      db.from('app_store').select('value').eq('key','bookingEngineSettings').maybeSingle(),
      db.from('app_store').select('value').eq('key','beRates').maybeSingle(),
    ]);
    _venRoSettings=s?.value||{};_venRoRates=r?.value||[];
  }catch(e){_venRoSettings={};_venRoRates=[];}
  // Keep the Room Only season %s and BBC package cost in sync with whatever was
  // last saved in Booking Engine → Rates, even if that tab was never opened
  // this session (rmAutoRate can otherwise run before beInit() hydrates them).
  if(_venRoSettings.room_only_season_pcts) ROOM_ONLY_SEASON_PCTS={...ROOM_ONLY_SEASON_PCTS,...(_venRoSettings.room_only_season_pcts)};
  if(_venRoSettings.bbc_package_classes_tours_massage!=null) BBC_PACKAGE_CLASSES_TOURS_MASSAGE=_venRoSettings.bbc_package_classes_tours_massage;
  if(_venRoSettings.bbc_package_food!=null) BBC_PACKAGE_FOOD=_venRoSettings.bbc_package_food;
}
function venRoIsLow(dateStr){const m=new Date(dateStr+'T12:00:00').getMonth()+1;return m>=5&&m<=9;}
function venRoIsWeekend(dateStr){const d=new Date(dateStr+'T12:00:00').getDay();return d===0||d===5||d===6;}
function venRoNightRate(rt,dateStr){
  const low=venRoIsLow(dateStr),wknd=venRoIsWeekend(dateStr),month=new Date(dateStr+'T12:00:00').getMonth()+1;
  const weekendPct=_venRoSettings?.weekend_premium??0;
  const seasonal=_venRoSettings?.seasonal_adjustments??{};
  const manual=(_venRoRates||[]).find(x=>x.roomTypeId===rt.id&&x.startDate<=dateStr&&x.endDate>=dateStr);
  if(manual){let price=manual.priceSingle;if(wknd&&weekendPct)price=Math.round(price*(1+weekendPct/100));return price;}
  const base=rt.be_price_single??(low?(rt.price1_low??rt.price1):rt.price1);
  if(base==null)return null;
  const seasonalPct=Number(seasonal[String(month)]??0);
  return Math.round(base*(1+seasonalPct/100)*(wknd&&weekendPct?(1+weekendPct/100):1));
}
// ── "New Reservation" — room-only booking modal, opened by clicking an empty cell on a room's row in the Rooms grid ──
let _rmEditId=null,_rmRoom=null,_rmRtId=null,_rmRateMode='solo';
function rmClose(){const m=document.getElementById('rmModal');m.style.display='none';m.classList.remove('open');}
function rmSetRateMode(mode){
  _rmRateMode=mode;
  const soloBtn=document.getElementById('rm-solo-btn'),shareBtn=document.getElementById('rm-share-btn');
  const active='border:1.5px solid #1c3d36;background:#1c3d36;color:#fff';const inactive='border:1.5px solid #d1d5db;background:#fff;color:#374151';
  if(soloBtn)soloBtn.style.cssText=(soloBtn.dataset.base||'')+(mode==='solo'?active:inactive);
  if(shareBtn)shareBtn.style.cssText=(shareBtn.dataset.base||'')+(mode==='sharing'?active:inactive);
  rmAutoRate();
}
// Bikini Bootcamp / Restore & Renew's package cost already bundles food (per
// Darlene's rate sheet — $85 of the $265 package is food), so these types
// default to the fullest meal plan rather than staff having to remember to
// switch it manually. Staff can still override before saving.
function rmOnTypeChange(){
  const rmType=document.getElementById('rm-type')?.value||'';
  const mealEl=document.getElementById('rm-mealplan');
  if(mealEl&&(rmType==='Bikini Bootcamp'||rmType==='Restore and Renew'))mealEl.value='full';
  rmAutoRate();
}
async function rmAutoRate(){
  const rateEl=document.getElementById('rm-rate'),hintEl=document.getElementById('rm-rate-hint');
  const start=document.getElementById('rm-start').value;
  if(!_rmRtId||!rateEl)return;
  const rt=AppData.roomTypes.find(r=>r.id===_rmRtId);if(!rt)return;
  await venRoLoadPricingConfig();
  const rmType=document.getElementById('rm-type')?.value||'';
  const isBbcOrRestore=rmType==='Bikini Bootcamp'||rmType==='Restore and Renew';
  if(isBbcOrRestore){
    // BBC / Restore & Renew: the existing seasonal retreat room rate (price1/price2)
    // plus a fixed package add-on (classes/tours/massage + food) — per Darlene.
    const gc=Math.max(1,parseInt(document.getElementById('rm-adults')?.value)||1);
    const low=isLowSeason(start||fmtISO(new Date()));
    const roomRate=getRoomRate(rt,gc,start||fmtISO(new Date()));
    const pkg=bbcPackageTotal();
    const rate=roomRate!=null?+(roomRate+pkg).toFixed(2):null;
    if(rate!=null){
      rateEl.value=rate;
      if(hintEl)hintEl.textContent=`${rt.name} · ${rmType} · ${low?'Low':'High'} Season · Room ${fmt$(roomRate)} + Package ${fmt$(pkg)}/night`;
    }else if(hintEl)hintEl.textContent=`${rt.name} — no rate configured for this room type`;
    return;
  }
  // Room Only (Walk-in/Direct/Booking.com/Expedia/Air BnB/OTA) — pull the live
  // Cloudbeds rate for this specific room + date first (Darlene's call
  // 2026-09-16: the old internal seasonal estimate didn't match what Cloudbeds
  // actually charges). Falls back to that estimate only if Cloudbeds has no
  // rate plan for this room/date or the request fails.
  const startDate=start||fmtISO(new Date());
  let cbRate=null,cbLabel=null;
  if(_rmRoom){
    try{
      const resp=await fetch(`/.netlify/functions/cloudbeds?action=getRoomOnlyRate&room=${encodeURIComponent(_rmRoom)}&start=${startDate}`);
      const j=await resp.json();
      if(j&&j.rate!=null){cbRate=j.rate;cbLabel=j.ratePlanName;}
    }catch(e){console.warn('[CB room-only rate] fetch failed:',e);}
  }
  if(cbRate!=null){
    rateEl.value=cbRate;
    if(hintEl)hintEl.textContent=`${rt.name} · Room Only · Cloudbeds live rate${cbLabel?' ('+cbLabel+')':''} · ${fmt$(cbRate)}/night`;
    return;
  }
  // Real seasonal rate sheet from Darlene (2026-09-02), one base rate per room
  // type computed by date via roomOnlySeasonPct(). She said sharing isn't
  // really offered as a separate rate, so solo/sharing compute the same
  // number for this category.
  const rate=roomOnlyRateForDate(rt,startDate);
  if(rate!=null){
    rateEl.value=rate;
    const pct=roomOnlySeasonPct(startDate);
    if(hintEl)hintEl.textContent=`${rt.name} · Room Only · ${pct===0?'Base rate':(pct>0?'+'+pct+'%':pct+'%')} · ${fmt$(rate)}/night (estimate — Cloudbeds rate unavailable)`;
  }else if(hintEl)hintEl.textContent=`${rt.name} — no Room Only rate configured yet`;
}
function rmUpdateNights(){
  const start=document.getElementById('rm-start').value,end=document.getElementById('rm-end').value;
  const el=document.getElementById('rm-nights');if(!el)return;
  if(!start||!end||end<=start){el.textContent='';return;}
  const nights=Math.round((pd(end)-pd(start))/DAY_MS);
  el.textContent=`${nights} night${nights!==1?'s':''}`;
}
function rmOpenNewBooking(room,rtId,startDate){
  _rmEditId=null;_rmRoom=room;_rmRtId=rtId;_rmRateMode='solo';
  const rt=AppData.roomTypes.find(r=>r.id===rtId);
  document.getElementById('rmModalTitle').textContent='New Reservation';
  document.getElementById('rmDelBtn').style.display='none';
  document.getElementById('rm-room').value=`${room}${rt?' — '+rt.name:''}`;
  const start=startDate||fmtISO(new Date());
  const end=fmtISO(addDays(pd(start),7));
  document.getElementById('rm-start').value=start;
  document.getElementById('rm-end').value=end;
  document.getElementById('rm-type').value='Walk-in';
  document.getElementById('rm-leader').value='';
  document.getElementById('rm-email').value='';
  document.getElementById('rm-notes').value='';
  document.getElementById('rm-mealplan').value='breakfast';
  document.getElementById('rm-adults').value='1';
  document.getElementById('rm-status').value='requested';
  const err=document.getElementById('rm-err');err.textContent='';err.style.display='none';
  document.getElementById('rm-pay-link-row').style.display='none';
  document.getElementById('rm-folio-wrap').style.display='none';
  rmSetRateMode('solo');
  rmUpdateNights();
  document.getElementById('rmModal').style.display='flex';document.getElementById('rmModal').classList.add('open');
  setTimeout(()=>document.getElementById('rm-leader').focus(),80);
}
function rmOpenEditBooking(id){
  const bk=AppData.bookings.find(b=>b.id===id);if(!bk||bk.bookingType!=='room_only')return;
  _rmEditId=id;_rmRoom=(bk.blockedRooms||[])[0]||'';_rmRtId=bk.roomTypeId||'';_rmRateMode='solo';
  const rt=AppData.roomTypes.find(r=>r.id===_rmRtId);
  document.getElementById('rmModalTitle').textContent='Edit Reservation';
  document.getElementById('rmDelBtn').style.display='inline-flex';
  document.getElementById('rm-room').value=`${_rmRoom}${rt?' — '+rt.name:''}`;
  document.getElementById('rm-start').value=bk.startDate;
  document.getElementById('rm-end').value=bk.endDate;
  document.getElementById('rm-type').value=bk.retreatName||'Walk-in';
  document.getElementById('rm-leader').value=bk.leaderName||'';
  document.getElementById('rm-email').value=bk.leaderEmail||'';
  document.getElementById('rm-notes').value=bk.notes||'';
  document.getElementById('rm-mealplan').value=bk.mealPlan||'none';
  document.getElementById('rm-adults').value=bk.pax||1;
  document.getElementById('rm-status').value=bk.status||'requested';
  const err=document.getElementById('rm-err');err.textContent='';err.style.display='none';
  const nightly=bk.roomRateNights?Math.round((bk.roomRateTotal||0)/bk.roomRateNights):null;
  document.getElementById('rm-rate').value=nightly??'';
  const hintEl=document.getElementById('rm-rate-hint');if(hintEl&&rt)hintEl.textContent=`${rt.name} · ${bk.roomRateNights||0} night(s) · ${fmt$(bk.roomRateTotal||0)} total`;
  rmUpdateNights();
  document.getElementById('rm-pay-link-row').style.display=bk.roomRateTotal>0?'block':'none';
  document.getElementById('rmModal').style.display='flex';document.getElementById('rmModal').classList.add('open');
  _rmAddChargeOpen=false;
  document.getElementById('rm-folio-wrap').style.display='block';
  rmRenderFolio();
}
// Room Only bookings have no room-list guest row to click into a folio from
// (rmSaveNewBooking never creates a `reg`) — charges live directly on the
// booking (bk.charges), initialized empty at creation. This is that folio,
// surfaced right in the Edit Reservation modal so staff can charge Room
// Only / Bikini Bootcamp / Restore & Renew guests without a separate screen.
let _rmAddChargeOpen=false;
function rmToggleAddCharge(){_rmAddChargeOpen=!_rmAddChargeOpen;rmRenderFolio();}
function rmRenderFolio(){
  const wrap=document.getElementById('rm-folio-wrap');if(!wrap||!_rmEditId)return;
  const bk=AppData.bookings.find(b=>b.id===_rmEditId);if(!bk)return;
  const charges=(bk.charges||[]).slice().sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''));
  const total=charges.reduce((s,c)=>s+(c.amount||0),0);
  const addFormHtml=_rmAddChargeOpen?`
    <div style="padding:10px 0;border-top:1px solid var(--border);margin-top:8px">
      <div class="frow" style="margin:0 0 8px">
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Date</label><input type="date" id="rmc-date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Category</label><select id="rmc-category">${VMC_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>
      </div>
      <div class="frow" style="margin:0 0 10px">
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Description</label><input type="text" id="rmc-desc" placeholder="e.g. Massage 60min"></div>
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Amount ($)</label><input type="number" id="rmc-amount" min="0" step="0.01" placeholder="0.00"></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="rmToggleAddCharge()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="rmChargeSave()">Save</button>
      </div>
    </div>`:'';
  wrap.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Folio${total>0?' · '+fmt$(total)+' total':''}</span>
      <button class="btn btn-secondary btn-sm" onclick="rmToggleAddCharge()">${_rmAddChargeOpen?'Cancel':'+ Add Charge'}</button>
    </div>
    ${addFormHtml}
    ${!charges.length?`<div style="padding:10px 0;text-align:center;font-size:12.5px;color:var(--muted)">No charges on this folio yet.</div>`
      :`<div style="margin-top:6px">
        ${charges.map(c=>`<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #f1f5f9">
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:600;color:var(--dark)">${escHtml(c.description)} <span style="font-weight:400;color:var(--muted);font-size:11px">· ${escHtml(c.category||'Other')}</span></div>
            <div style="font-size:11px;color:var(--muted)">${fmtDate((c.date||c.addedAt||'').slice(0,10))} · ${escHtml(c.addedBy||'Staff')}</div>
          </div>
          <div style="font-size:13px;font-weight:700;color:var(--dark);white-space:nowrap">${fmt$(c.amount)}</div>
          <button class="btn btn-danger btn-sm" onclick="rmChargeDelete('${c.id}')" style="padding:3px 8px;font-size:11px">Remove</button>
        </div>`).join('')}
      </div>`}`;
}
function rmChargeSave(){
  const bk=AppData.bookings.find(b=>b.id===_rmEditId);if(!bk)return;
  const date=document.getElementById('rmc-date').value||new Date().toISOString().slice(0,10);
  const category=document.getElementById('rmc-category').value||'Other';
  const description=document.getElementById('rmc-desc').value.trim();
  const amount=Math.round(parseFloat(document.getElementById('rmc-amount').value)*100)/100;
  if(!description){alert('Enter a description for the charge.');return;}
  if(!amount||amount<=0){alert('Enter a valid amount.');return;}
  if(!bk.charges)bk.charges=[];
  bk.charges.push({id:uid(),date,category,description,amount,guestName:bk.leaderName||null,addedAt:new Date().toISOString(),addedBy:getCurrentSession()?.name||'Staff'});
  _rmAddChargeOpen=false;
  saveAll();rmRenderFolio();
  logActivity('Charge added',`${fmt$(amount)} — ${description} — ${bk.leaderName||''}`,bk.id);
  showToast('Charge added ✓');
}
function rmChargeDelete(chargeId){
  const bk=AppData.bookings.find(b=>b.id===_rmEditId);if(!bk)return;
  const c=(bk.charges||[]).find(x=>x.id===chargeId);if(!c)return;
  if(!confirm(`Remove this charge — "${c.description}" (${fmt$(c.amount)})?`))return;
  bk.charges=(bk.charges||[]).filter(x=>x.id!==chargeId);
  saveAll();rmRenderFolio();
  logActivity('Charge removed',`${fmt$(c.amount)} — ${c.description} — ${bk.leaderName||''}`,bk.id);
  showToast('Charge removed.');
}
function rmDeleteBooking(){
  if(!_rmEditId||!confirm('Delete this reservation?'))return;
  AppData.bookings=AppData.bookings.filter(b=>b.id!==_rmEditId);
  saveAll();rmClose();venBuild();rcBuild();
  showToast('Reservation deleted.');
}
function rmSaveNewBooking(){
  const room=_rmRoom,rtId=_rmRtId;
  const start=document.getElementById('rm-start').value,end=document.getElementById('rm-end').value;
  const type=document.getElementById('rm-type').value;
  const leader=document.getElementById('rm-leader').value.trim();
  const leaderEmail=document.getElementById('rm-email').value.trim();
  const notes=document.getElementById('rm-notes').value.trim();
  const mealPlan=document.getElementById('rm-mealplan').value;
  const rate=parseFloat(document.getElementById('rm-rate').value)||0;
  const adults=parseInt(document.getElementById('rm-adults').value)||1;
  const status=document.getElementById('rm-status').value;
  const errEl=document.getElementById('rm-err');errEl.style.display='none';
  if(!leader){errEl.textContent='Guest name is required.';errEl.style.display='block';return;}
  if(!start||!end||end<=start){errEl.textContent='Invalid dates.';errEl.style.display='block';return;}
  if(leaderEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leaderEmail)){errEl.textContent='Enter a valid email or leave it blank.';errEl.style.display='block';return;}
  const nights=Math.round((pd(end)-pd(start))/DAY_MS);
  const roomRateTotal=rate*nights;
  // Conflict check (exclude the booking currently being edited, if any)
  const conflict=AppData.bookings.some(b=>b.id!==_rmEditId&&b.status!=='cancelled'&&(b.blockedRooms||[]).includes(room)&&datesOverlap(start,end,b.startDate,b.endDate));
  if(conflict){errEl.textContent=`Room ${room} is already booked for part of these dates.`;errEl.style.display='block';return;}
  if(_rmEditId){
    const bk=AppData.bookings.find(b=>b.id===_rmEditId);if(!bk)return;
    Object.assign(bk,{leaderName:leader,leaderEmail,notes,mealPlan,retreatName:type,startDate:start,endDate:end,pax:adults,status,roomTypeId:rtId,blockedRooms:[room],roomRateTotal,roomRateNights:nights});
    saveAll();rmClose();venBuild();rcBuild();
    logActivity('Room-only booking updated',`${leader} · ${room} · ${fmtDate(start)} – ${fmtDate(end)}`,_rmEditId);
    showToast('Reservation updated ✓');
    return;
  }
  const bestRow=findAvailableRow(start,end,null);
  const newId=uid();
  AppData.bookings.push({id:newId,bookingType:'room_only',leaderName:leader,leaderEmail,notes,mealPlan,retreatName:type,startDate:start,endDate:end,row:bestRow,pax:adults,status,docLink:'',roomAssignments:[],roomTypeId:rtId,blockedRooms:[room],roomRateTotal,roomRateNights:nights,charges:[],payments:[]});
  saveAll();rmClose();venBuild();rcBuild();
  logActivity('Room-only booking created',`${leader} · ${room} · ${type} · ${fmtDate(start)} – ${fmtDate(end)}${rate?' · '+fmt$(rate)+'/night':''}`,newId);
  showToast(`Reservation created — ${room} · ${leader} ✓`);
}
async function rmSendPaymentLink(){
  if(!_rmEditId)return;
  const bk=AppData.bookings.find(b=>b.id===_rmEditId);if(!bk)return;
  if(!bk.roomRateTotal||bk.roomRateTotal<=0){showToast('Set a rate before sending a payment link.');return;}
  const btn=document.getElementById('rm-pay-link-btn');
  const origLabel=btn.textContent;btn.disabled=true;btn.textContent='Preparing link…';
  try{
    const url=`${location.origin}/pay-booking.html?id=${bk.id}`;
    await navigator.clipboard.writeText(url).catch(()=>{});
    if(bk.leaderEmail){
      const room=(bk.blockedRooms||[])[0]||'';
      const html=`<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif">
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td>
      <table style="max-width:520px;margin:20px auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)" cellpadding="0" cellspacing="0" width="100%">
        <tr><td style="background:#1a2332;padding:22px 32px"><span style="color:#4db6ac;font-size:20px;font-weight:700;letter-spacing:2px">AMANSALA</span></td></tr>
        <tr><td style="background:#ffffff;padding:32px;color:#374151;font-size:14px;line-height:1.7">
          <p>Hi ${bk.leaderName||'there'},</p>
          <p>Here's your payment link for your upcoming stay at Amansala Tulum.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:13px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
            <tr style="background:#fff"><td style="padding:9px 14px;color:#9ca3af;width:40%">Room</td><td style="padding:9px 14px;font-weight:600;color:#111827">${room}</td></tr>
            <tr style="background:#f8fafc"><td style="padding:9px 14px;color:#9ca3af">Dates</td><td style="padding:9px 14px;font-weight:600;color:#111827">${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}</td></tr>
            <tr style="background:#fff"><td style="padding:9px 14px;color:#9ca3af">Amount Due</td><td style="padding:9px 14px;font-weight:700;color:#111827">${fmt$(bk.roomRateTotal)}</td></tr>
          </table>
          <p style="text-align:center;margin:28px 0"><a href="${url}" style="background:#4db6ac;color:#fff;padding:13px 30px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Pay Now</a></p>
          <p style="font-size:12px;color:#9ca3af;text-align:center">Or copy this link: ${url}</p>
        </td></tr>
        <tr><td style="background:#f1f5f9;padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af">Amansala Eco-Chic Resort · Tulum, Mexico</td></tr>
      </table></td></tr></table></body></html>`;
      await fetch('/.netlify/functions/send-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:bk.leaderEmail,subject:`Payment Link — Amansala Tulum · ${room}`,html})});
      logActivity('Payment link sent',`${bk.leaderName||''} · ${room} · ${fmt$(bk.roomRateTotal)} · emailed to ${bk.leaderEmail}`,bk.id);
      showToast('Payment link copied & emailed ✓');
    }else{
      logActivity('Payment link created',`${bk.leaderName||''} · ${room} · ${fmt$(bk.roomRateTotal)} · link copied (no email on file)`,bk.id);
      showToast('Payment link copied to clipboard ✓ (no email on file to send it)');
    }
  }catch(e){
    showToast('Could not prepare payment link.');
  }finally{
    btn.disabled=false;btn.textContent=origLabel;
  }
}
// ── "Book a Room" — guided search: dates+pax -> room-type availability counts -> pick a specific room -> hand off to the New Reservation modal ──
let _rsCheckIn=null,_rsCheckOut=null,_rsPax=1;
function rsOpen(){
  const today=fmtISO(new Date());
  document.getElementById('rs-start').value=today;
  document.getElementById('rs-end').value=fmtISO(addDays(pd(today),1));
  document.getElementById('rs-pax').value='1';
  document.getElementById('rs-err').style.display='none';
  document.getElementById('rsStep1').style.display='block';
  document.getElementById('rsStep2').style.display='none';
  openModal('roomSearchModal');
}
// Check-out never followed check-in — pick November for check-in and the
// check-out field (still holding whatever stale value it had, e.g. from
// today's default) stays in September, so its native date-picker opens on
// the wrong month too (real report 2026-09-15). Only nudges check-out when
// it's now invalid (on/before the new check-in) — a deliberately-set later
// check-out is left alone.
function rsCheckInChanged(){
  const startEl=document.getElementById('rs-start');
  const endEl=document.getElementById('rs-end');
  if(!startEl.value)return;
  if(!endEl.value||endEl.value<=startEl.value){
    endEl.value=fmtISO(addDays(pd(startEl.value),1));
  }
}
function rsBackToSearch(){
  document.getElementById('rsStep1').style.display='block';
  document.getElementById('rsStep2').style.display='none';
}
// Same overlap/blocked-rooms logic as netlify/functions/get-availability.js, computed
// client-side against AppData since the admin panel already has it all in memory.
// Also cross-checks actual registrations, not just each booking's blockedRooms
// — a room can have a real, named guest registered in it whose room code was
// never added to blockedRooms (an "orphaned registration"; confirmed real
// incidents: Katherine McClelland's CH3a/CH3b, Monica's 5B/GV13a/GV13b for
// Nov 1-6, 2026). Without this, a room like that showed up as "available"
// here even though it's genuinely occupied for the requested dates.
function rsComputeAvailability(checkIn,checkOut,extReservations){
  // room → {label, bkId} of whichever retreat is blocking it, so a blocked
  // room can still be shown (in red) with who has it — lets staff assess
  // whether that retreat could give it up, instead of just hiding it.
  const blockedBy=new Map();
  AppData.bookings.forEach(bk=>{
    if(bk.status==='cancelled')return;
    if(!(bk.startDate<checkOut&&bk.endDate>checkIn))return;
    const info={label:bk.leaderName||bk.retreatName||'Blocked',bkId:bk.id};
    (bk.blockedRooms||[]).forEach(r=>{if(!blockedBy.has(r))blockedBy.set(r,info);});
    AppData.regs.filter(r=>r.bookingId===bk.id&&r.room&&(r.guests||[]).some(g=>g.name)).forEach(r=>{if(!blockedBy.has(r.room))blockedBy.set(r.room,info);});
  });
  // A room booked DIRECTLY in Cloudbeds is genuinely occupied whether or
  // not anyone has clicked to "link" or "import" it into the portal yet —
  // availability must never depend on that matching/linking step, which is
  // inherently fuzzy (name matching). This is the actual sold-out-vs-not
  // question, so it checks raw Cloudbeds occupancy directly, independent of
  // any portal booking record (Darlene's call 2026-09-17 — a missed room
  // here is the difference between showing sold out or not).
  (extReservations||[]).forEach(r=>{
    if(!(r.startDate<checkOut&&r.endDate>checkIn))return;
    const info={label:r.guestName||'Cloudbeds reservation',bkId:null};
    (r.rooms||[]).forEach(room=>{if(!blockedBy.has(room))blockedBy.set(room,info);});
  });
  // A room sold as either one whole double/triple/quad OR individual beds
  // ("13" vs "13a"/"13b") is the SAME physical space. Excluding bd1-4 room
  // TYPES from the results (below) stopped them being listed as a separate,
  // duplicate card (real report 2026-09-15), but a bed-level booking on
  // "13a" never blocked "13" itself, and vice versa — so the parent room
  // (or the other bed) still showed as available while actually half/fully
  // occupied (real report 2026-09-16: Double/Beachview rooms showing
  // available while 100% booked). Propagate every block to its parent room
  // and/or sibling beds before computing per-type availability.
  [...blockedBy.keys()].forEach(room=>{
    const info=blockedBy.get(room);
    const sp=splitDoubleHalf(room);
    if(sp&&sp.base&&!blockedBy.has(sp.base))blockedBy.set(sp.base,info);
    (typeof _getSharedBeds==='function'?_getSharedBeds(room)||[]:[]).forEach(sib=>{if(!blockedBy.has(sib))blockedBy.set(sib,info);});
  });
  return AppData.roomTypes.filter(rt=>!DUPLICATE_ROOM_ENTRY_IDS.has(rt.id)).map(rt=>{
    const rooms=rt.rooms||[];
    const roomStatus=rooms.map(r=>{const b=blockedBy.get(r);return{room:r,available:!b,blockedByLabel:b?b.label:null,blockedByBkId:b?b.bkId:null};});
    const availableRooms=roomStatus.filter(x=>x.available).map(x=>x.room);
    return{rt,roomStatus,availableRooms,totalRooms:rooms.length};
  }).filter(x=>x.totalRooms>0);
}
function rsInspectBlocked(bkId){
  if(!bkId)return;
  closeModal('roomSearchModal');
  switchTab('teacherreg',document.querySelector('.tab-btn[onclick*="teacherreg"]'));
  setTimeout(()=>regSelectRetreat(bkId),80);
}
// Shared by every availability check (Book a Room, Date Finder, the booking
// availability preview) — fetches raw Cloudbeds occupancy for a date range
// so a room booked directly in Cloudbeds counts as taken even if nobody has
// linked/imported it into the portal yet. Availability must never depend on
// that matching step (Darlene's call 2026-09-17).
async function fetchExternalReservationsForRange(startDate,endDate){
  // getExternalReservations has no server-side cache and re-paginates the
  // full Cloudbeds reservation list on every call — routinely 15-25s for
  // this property. Without a client-side cap, a Netlify function that stalls
  // (rather than erroring) leaves fetch() waiting forever with zero feedback
  // — matches a real report of the Straightline Rooms preview looking
  // permanently "stuck on analyzing" (2026-09-17).
  const ctrl=typeof AbortController!=='undefined'?new AbortController():null;
  const timer=ctrl?setTimeout(()=>ctrl.abort(),45000):null;
  try{
    const resp=await fetch('/.netlify/functions/cloudbeds?action=getExternalReservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({startDate,endDate}),signal:ctrl?.signal});
    const data=await resp.json();
    return data?.success?(data.reservations||[]):[];
  }catch(e){console.warn('[availability] Cloudbeds fetch failed or timed out',e);return[];}
  finally{if(timer)clearTimeout(timer);}
}
async function rsSearch(){
  const start=document.getElementById('rs-start').value,end=document.getElementById('rs-end').value;
  const pax=parseInt(document.getElementById('rs-pax').value)||1;
  const errEl=document.getElementById('rs-err');errEl.style.display='none';
  if(!start||!end||end<=start){errEl.textContent='Please choose valid check-in/check-out dates.';errEl.style.display='block';return;}
  _rsCheckIn=start;_rsCheckOut=end;_rsPax=pax;
  const nights=Math.round((pd(end)-pd(start))/DAY_MS);
  document.getElementById('rsStep1').style.display='none';
  document.getElementById('rsStep2').style.display='block';
  document.getElementById('rsResults').innerHTML='<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">Checking Cloudbeds…</div>';
  const extRes=await fetchExternalReservationsForRange(start,end);
  const results=rsComputeAvailability(start,end,extRes).sort((a,b)=>b.availableRooms.length-a.availableRooms.length);
  document.getElementById('rs-summary').textContent=`${fmtDate(start)} – ${fmtDate(end)} · ${nights} night${nights!==1?'s':''} · ${pax} guest${pax!==1?'s':''}`;
  const low=venRoIsLow(start);
  const resEl=document.getElementById('rsResults');
  if(!results.length){resEl.innerHTML=`<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">No rooms available for these dates.</div>`;}
  else{
    resEl.innerHTML=results.map(({rt,roomStatus,availableRooms,totalRooms})=>{
      const soloRate=low?(rt.roomOnlyPrice1_low??rt.roomOnlyPrice1):rt.roomOnlyPrice1;
      const shareRate=low?(rt.roomOnlyPrice2_low??soloRate):(rt.roomOnlyPrice2??soloRate);
      const priceLine=soloRate!=null?`Room Only · Solo ${fmt$(soloRate)}${shareRate&&shareRate!==soloRate?` / Sharing ${fmt$(shareRate)}`:''}/night`:'No Room Only rate configured';
      return`<div class="rs-type-card" style="border:1.5px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer" onclick="rsToggleType('${rt.id}')">
          <div>
            <div style="font-weight:700;font-size:13.5px;color:var(--dark)">${rt.name}</div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${priceLine}</div>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div style="font-weight:700;font-size:13px;color:#059669">${availableRooms.length} of ${totalRooms} available</div>
            <div style="font-size:10.5px;color:var(--teal);font-weight:600">Hide/show ▾</div>
          </div>
        </div>
        <div id="rs-rooms-${rt.id}" style="display:flex;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);flex-wrap:wrap;gap:6px">
          ${roomStatus.map(({room,available,blockedByLabel,blockedByBkId})=>available
            ?`<button class="btn-nav" style="padding:6px 12px;border:1.5px solid #6ee7b7;background:#f0fdf4;color:#15803d;font-weight:700" onclick="rsPickRoom('${room}','${rt.id}')">${room}</button>`
            :(blockedByBkId
              ?`<button class="btn-nav" title="Blocked by ${escHtml(blockedByLabel)} — click to view their room list" style="padding:6px 12px;border:1.5px solid #fca5a5;background:#fef2f2;color:#b91c1c;font-weight:700" onclick="rsInspectBlocked('${blockedByBkId}')">${room}</button>`
              :`<button class="btn-nav" title="Booked directly in Cloudbeds by ${escHtml(blockedByLabel)} — not yet in the portal" style="padding:6px 12px;border:1.5px solid #fca5a5;background:#fef2f2;color:#b91c1c;font-weight:700;cursor:default" disabled>${room}</button>`)
          ).join('')}
        </div>
      </div>`;
    }).join('');
  }
}
function rsToggleType(rtId){
  const el=document.getElementById('rs-rooms-'+rtId);if(!el)return;
  const showing=el.style.display==='flex';
  el.style.display=showing?'none':'flex';
}
function rsPickRoom(room,rtId){
  closeModal('roomSearchModal');
  rmOpenNewBooking(room,rtId,_rsCheckIn);
  document.getElementById('rm-end').value=_rsCheckOut;
  document.getElementById('rm-adults').value=_rsPax;
  rmUpdateNights();rmAutoRate();
}
// Click on an empty spot in a room's Rooms-tab grid row → open the New Reservation modal prefilled with that room+date.
function rcTrackClick(event,room,rtId,trackEl){
  if(event.target.closest('.bk'))return; // clicked an existing booking block, not empty space
  const track=trackEl||event.currentTarget;
  const rect=track.getBoundingClientRect();
  const dayIdx=Math.floor((event.clientX-rect.left)/36);
  const days=rcShowDays;
  if(dayIdx<0||dayIdx>=days)return;
  const clickedDate=fmtISO(addDays(rcStart,dayIdx));
  const busy=AppData.bookings.some(bk=>bk.status!=='cancelled'&&(bk.blockedRooms||[]).includes(room)&&clickedDate>=bk.startDate&&clickedDate<bk.endDate);
  if(busy)return;
  rmOpenNewBooking(room,rtId,clickedDate);
}
async function showAvailPreview(id){
  const bk=AppData.bookings.find(b=>b.id===id);
  if(!bk)return;
  const s=bk.startDate,e=bk.endDate;

  // Show the modal right away with a loading state, then fill it in once
  // Cloudbeds occupancy comes back — same "must reflect raw Cloudbeds
  // occupancy, not just linked portal data" requirement as rsComputeAvailability
  // (Darlene's call 2026-09-17: a missed room here is a sold-out room shown
  // as available).
  document.getElementById('availPreviewTitle').textContent=(bk.leaderName||bk.retreatName||'Unnamed Retreat');
  document.getElementById('availPreviewDates').textContent=`${fmtDate(s)} – ${fmtDate(e)}${bk.pax?' · '+bk.pax+' guests':''}`;
  document.getElementById('availPreviewRooms').innerHTML='<div style="padding:10px;text-align:center;color:#9ca3af;font-size:12px">Checking Cloudbeds…</div>';
  document.getElementById('availPreviewConflicts').innerHTML='';
  document.getElementById('availPreviewFit').innerHTML='';
  document.getElementById('availPreviewModal').style.display='flex';
  const extRes=await fetchExternalReservationsForRange(s,e);

  // Overlapping bookings (excluding this one and cancelled) — used for the
  // "other retreats in this window" conflict list below, so this retreat
  // itself never shows up as its own conflict.
  const overlapping=AppData.bookings.filter(b=>b.id!==id&&b.status!=='cancelled'&&b.startDate<e&&b.endDate>s);
  // Room-availability COUNT must also treat this retreat's own already-
  // blocked rooms as taken — they're real, already-assigned capacity, not
  // open inventory. Excluding them (real incident: Katherine McClelland's
  // retreat already had 3 of the 15 Beachfront Kings, and the popup counted
  // them as "available" alongside the 1 genuinely free room, showing 4
  // instead of 1) silently inflated every "X available" number by however
  // many rooms this retreat already has of that type.
  const takenRooms=new Set();
  overlapping.forEach(b=>(b.blockedRooms||[]).forEach(r=>takenRooms.add(r)));
  (bk.blockedRooms||[]).forEach(r=>takenRooms.add(r));
  // Also cross-check real registrations, not just blockedRooms — a room can
  // have a named guest registered in it whose room was never added to its
  // booking's blockedRooms (an "orphaned registration"; confirmed real
  // incidents: Katherine McClelland's CH3a/CH3b, Monica's 5B/GV13a/GV13b).
  [...overlapping,bk].forEach(b=>{
    AppData.regs.filter(r=>r.bookingId===b.id&&r.room&&(r.guests||[]).some(g=>g.name)).forEach(r=>takenRooms.add(r.room));
  });
  // Rooms booked directly in Cloudbeds count as taken too, whether or not
  // they've been linked/imported into the portal yet.
  (extRes||[]).forEach(r=>{
    if(!(r.startDate<e&&r.endDate>s))return;
    (r.rooms||[]).forEach(room=>takenRooms.add(room));
  });
  // Same parent/bed propagation as rsComputeAvailability — a bed-level taken
  // room ("13a") must also count its parent ("13") as taken, and vice versa,
  // or this count still over-reports availability for Double/Beachview/
  // Triple/Quad room types (real report 2026-09-16).
  [...takenRooms].forEach(room=>{
    const sp=splitDoubleHalf(room);
    if(sp&&sp.base)takenRooms.add(sp.base);
    (typeof _getSharedBeds==='function'?_getSharedBeds(room)||[]:[]).forEach(sib=>takenRooms.add(sib));
  });

  // Per-type availability (skip bed-level duplicates so physical rooms aren't counted twice)
  const avail=AppData.roomTypes.filter(rt=>!DUPLICATE_ROOM_ENTRY_IDS.has(rt.id)).map(rt=>{
    const total=rt.rooms.length;
    const taken=rt.rooms.filter(r=>takenRooms.has(r)).length;
    return{...rt,total,taken,available:total-taken};
  }).filter(rt=>rt.total>0);

  const totalAvail=avail.reduce((s,rt)=>s+rt.available,0);
  const pax=bk.pax||0;
  // rough rooms needed ≈ pax / 1.5 average occupancy
  const roomsNeeded=pax?Math.ceil(pax/1.5):null;
  const fitOk=!roomsNeeded||(totalAvail>=roomsNeeded);
  const fitTight=roomsNeeded&&totalAvail>=roomsNeeded&&totalAvail<roomsNeeded+3;

  const fitBg=overlapping.length&&!fitOk?'#fef2f2':fitTight?'#fff7ed':'#f0fdf4';
  const fitClr=overlapping.length&&!fitOk?'#dc2626':fitTight?'#c2410c':'#15803d';
  const fitIcon=overlapping.length&&!fitOk?'⚠':'✓';
  const fitMsg=!roomsNeeded
    ?`${totalAvail} rooms available across all types for these dates`
    :!fitOk
    ?`Only ${totalAvail} rooms free — may be tight for ${pax} guests (need ~${roomsNeeded} rooms)`
    :fitTight
    ?`Doable but tight — ${totalAvail} rooms free for ${pax} guests (~${roomsNeeded} rooms needed)`
    :`Good fit — ${totalAvail} rooms free for ${pax} guest${pax!==1?'s':''} (~${roomsNeeded} rooms needed)`;

  const roomRows=avail.map(rt=>{
    const pct=rt.total>0?Math.round((rt.available/rt.total)*100):0;
    const barClr=rt.available===0?'#fca5a5':rt.available<=2?'#fcd34d':'#6ee7b7';
    const txtClr=rt.available===0?'#dc2626':rt.available<=2?'#b45309':'#15803d';
    return`<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid #f3f4f6">
      <div style="width:10px;height:10px;border-radius:50%;background:${rt.color};flex-shrink:0"></div>
      <span style="flex:1;font-size:12.5px;color:#374151;font-weight:500">${rt.name}</span>
      <div style="width:80px;height:6px;border-radius:3px;background:#e5e7eb;overflow:hidden;flex-shrink:0">
        <div style="height:100%;width:${pct}%;background:${barClr};border-radius:3px"></div>
      </div>
      <span style="font-size:12px;font-weight:700;color:${txtClr};width:52px;text-align:right;flex-shrink:0">${rt.available}/${rt.total}</span>
    </div>`;
  }).join('');

  let emptyHoldsCount=0;
  const conflictRows=overlapping.length
    ?overlapping.map(b=>{
      const rooms=(b.blockedRooms||[]).slice().sort((x,y)=>x.localeCompare(y,undefined,{numeric:true}));
      const roomChips=rooms.map(room=>{
        const reg=getRegForRoom(b.id,room);
        const namedGuests=(reg?.guests||[]).filter(g=>g.name);
        const occupied=namedGuests.length>0;
        if(!occupied)emptyHoldsCount++;
        const title=occupied?`Occupied: ${namedGuests.map(g=>g.name).join(', ')}`:'No guest registered yet — could be reassigned';
        return`<span title="${title}" style="font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:5px;border:1px solid ${occupied?'#99c9c9':'#e5e7eb'};background:${occupied?'#e6f4f4':'#f9fafb'};color:${occupied?'#0e6666':'#9ca3af'}">${room}${occupied?'':' ○'}</span>`;
      }).join('');
      return`<div style="padding:8px 0;border-bottom:1px solid #fef2f2">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${rooms.length?'6px':'0'}">
          <span style="font-size:12.5px;font-weight:600;color:#374151">${b.leaderName||b.retreatName||'Unnamed'}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:11.5px;color:#6b7280">${fmtDate(b.startDate)} – ${fmtDate(b.endDate)}</span>
            <span style="font-size:11px;font-weight:700;padding:2px 7px;border-radius:5px;background:#fef2f2;color:#dc2626">${rooms.length} rooms</span>
          </div>
        </div>
        ${rooms.length?`<div style="display:flex;flex-wrap:wrap;gap:5px">${roomChips}</div>`:''}
      </div>`;
    }).join('')+(emptyHoldsCount?`<p style="font-size:11.5px;color:#6b7280;margin:8px 0 0"><span style="color:#9ca3af">○</span> = held but no guest registered yet — <b>${emptyHoldsCount}</b> room${emptyHoldsCount!==1?'s':''} could be reassigned if needed.</p>`:'')
    :`<p style="font-size:12.5px;color:#6b7280;margin:6px 0">No other retreats in this window — fully open.</p>`;

  document.getElementById('availPreviewTitle').textContent=(bk.leaderName||bk.retreatName||'Unnamed Retreat');
  document.getElementById('availPreviewDates').textContent=`${fmtDate(s)} – ${fmtDate(e)}${pax?' · '+pax+' guests':''}`;
  document.getElementById('availPreviewRooms').innerHTML=roomRows;
  document.getElementById('availPreviewConflicts').innerHTML=conflictRows;
  document.getElementById('availPreviewFit').innerHTML=`<span style="font-weight:700;color:${fitClr}">${fitIcon} ${fitMsg}</span>`;
  document.getElementById('availPreviewFit').style.background=fitBg;
  document.getElementById('availPreviewOpenBtn').onclick=()=>{document.getElementById('availPreviewModal').style.display='none';openVenEdit(id);};
  document.getElementById('availPreviewBlockBtn').onclick=()=>{document.getElementById('availPreviewModal').style.display='none';openBlockModal(id);};
  // Admin's own Registration tab (regSelBk-based — Actions menu, room grid,
  // payments) — NOT openTeacherPortal(), which is the guest/teacher-facing
  // preview. Same navigation openBookingFromNotif() already uses.
  document.getElementById('availPreviewAdminBtn').onclick=()=>{
    document.getElementById('availPreviewModal').style.display='none';
    switchTab('teacherreg',document.getElementById('teacherregTabBtn'));
    setTimeout(()=>regSelectRetreat(id),80);
  };
  document.getElementById('availPreviewCalBtn').onclick=()=>{
    document.getElementById('availPreviewModal').style.display='none';
    rcJumpToBooking(bk);
    switchTab('roomcal',document.querySelector('.tab-btn[onclick*="roomcal"]'));
  };
  document.getElementById('availPreviewModal').style.display='flex';
}

function openOvCalModal(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const PAD=3;
  const winS=new Date(new Date(bk.startDate).getTime()-PAD*DAY_MS);
  const winE=new Date(new Date(bk.endDate).getTime()+PAD*DAY_MS);
  const winSStr=winS.toISOString().slice(0,10);
  const winEStr=winE.toISOString().slice(0,10);
  const todayStr=new Date().toISOString().slice(0,10);
  // Build days array
  const dArr=[];
  for(let d=new Date(winS);d<=winE;d=new Date(d.getTime()+DAY_MS)){
    const ds=d.toISOString().slice(0,10);
    dArr.push({ds,d:d.getDate(),m:d.getMonth(),dow:d.getDay(),wk:d.getDay()===0||d.getDay()===6,td:ds===todayStr});
  }
  const nDays=dArr.length;
  const DW=36;const LBL_W=130;const LANE_H=48;
  // Month cells
  const MSHORT=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const mSegs=[];let curM=null,mCnt=0;
  dArr.forEach(d=>{if(d.m!==curM){if(curM!==null)mSegs.push({m:curM,cnt:mCnt});curM=d.m;mCnt=1;}else mCnt++;});
  if(curM!==null)mSegs.push({m:curM,cnt:mCnt});
  const monthCells=mSegs.map(s=>`<div class="g-mcell" style="width:${s.cnt*DW}px;min-width:${s.cnt*DW}px">${MSHORT[s.m]}</div>`).join('');
  const dayCells=dArr.map(d=>`<div class="g-dcell${d.td?' today-h':''}${d.wk?' weekend':''}"><span class="dd">${d.d}</span><span class="dn">${DSHORT[d.dow]}</span></div>`).join('');
  // Visible bookings
  const visBks=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.startDate<winEStr&&b.endDate>winSStr);
  // Render rows
  const rowsHtml=AppData.venRows.map(rowName=>{
    const rowBks=visBks.filter(b=>b.row===rowName).sort((a,b2)=>a.startDate.localeCompare(b2.startDate));
    if(!rowBks.length)return`<div class="g-row" style="height:${8+LANE_H}px"><div class="g-lbl ven-row-lbl" style="width:${LBL_W}px;font-size:11px">${rowName}</div><div class="g-track" style="width:${nDays*DW}px;min-width:${nDays*DW}px"></div></div>`;
    const lanes=[];const bkLane=new Map();
    rowBks.forEach(rb=>{
      let lane=lanes.findIndex(arr=>!arr.some(o=>o.startDate<rb.endDate&&o.endDate>rb.startDate));
      if(lane<0){lane=lanes.length;lanes.push([]);}lanes[lane].push(rb);bkLane.set(rb.id,lane);
    });
    const rowH=8+lanes.length*LANE_H;
    const gridLines=dArr.map((d,i)=>d.d===1?`<div class="g-gl ms" style="left:${i*DW}px"></div>`:(d.td?`<div class="g-gl today-l" style="left:${i*DW+18}px"></div>`:'')).join('');
    const blocks=rowBks.map(rb=>{
      const isInq=rb.source==='inquiry'&&rb.status==='requested';
      const st=isInq?{label:'Inquiry',bg:'#f3f4f6',border:'#9ca3af',text:'#6b7280',dash:false}:(STATUS[rb.status]||STATUS.requested);
      const lane=bkLane.get(rb.id)||0;
      const li=Math.floor((new Date(rb.startDate)-winS)/DAY_MS);
      const wi=Math.max(1,Math.floor((new Date(rb.endDate)-new Date(rb.startDate))/DAY_MS));
      const isCur=rb.id===bkId;
      const regCnt=registeredCount(rb.id);
      const cntHtml=rb.pax?`<span class="bk-count">${regCnt}/${rb.pax}</span>`:'';
      const stBadge=`<span style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;opacity:.75;margin-left:5px">${st.label}</span>`;
      const curOutline=isCur?`outline:2px solid ${st.border};outline-offset:2px;`:'';
      return`<div class="bk${st.dash?' dashed':''}" onclick="event.stopPropagation();document.getElementById('ovCalModal').style.display='none';openVenEdit('${rb.id}')" title="${rb.leaderName||rb.retreatName} · ${fmtDate(rb.startDate)}–${fmtDate(rb.endDate)}" style="left:${li*DW+2}px;width:${wi*DW-4}px;top:${8+lane*LANE_H}px;height:40px;background:${st.bg};border-color:${st.border};color:${st.text};${curOutline}"><span class="bk-n">${rb.leaderName||rb.retreatName}</span>${stBadge}${cntHtml}</div>`;
    }).join('');
    return`<div class="g-row" style="height:${rowH}px"><div class="g-lbl ven-row-lbl" style="width:${LBL_W}px;font-size:11px">${rowName}</div><div class="g-track" style="width:${nDays*DW}px;min-width:${nDays*DW}px">${gridLines}${blocks}</div></div>`;
  }).join('');
  document.getElementById('ovCalModalTitle').textContent=bk.leaderName||bk.retreatName;
  document.getElementById('ovCalModalDates').textContent=`${fmtDate(winSStr)} – ${fmtDate(winEStr)} (±${PAD} days)`;
  document.getElementById('ovCalGrid').innerHTML=`<div style="display:flex;position:sticky;top:0;z-index:30;background:#fff;border-bottom:2px solid var(--border)"><div class="g-corner" style="width:${LBL_W}px"></div><div><div class="g-month-cells">${monthCells}</div><div class="g-day-cells">${dayCells}</div></div></div>${rowsHtml}`;
  document.getElementById('ovCalModal').style.display='flex';
}

function openVenEdit(id){const bk=AppData.bookings.find(b=>b.id===id);if(!bk)return;if(bk.bookingType==='room_only'){openBookingFolio(id);return;}venEditId=id;document.getElementById('venModalTitle').textContent='Edit Booking';['venDelBtn','venGoRegBtn','venFinBtn','venCopyRoomsBtn'].forEach(el=>document.getElementById(el).style.display='inline-flex');
  document.getElementById('venRoomCalBanner').style.display='flex';
  // Accept Dates button
  const adBtn=document.getElementById('venAcceptDatesBtn');if(adBtn){adBtn.style.display='inline-flex';if(bk.datesAccepted){adBtn.textContent='✓ Dates Accepted';adBtn.style.background='#059669';adBtn.style.color='#fff';adBtn.style.borderColor='#059669';adBtn.style.opacity='.7';adBtn.style.pointerEvents='none';}else{adBtn.textContent='✓ Accept Dates';adBtn.style.background='';adBtn.style.color='';adBtn.style.borderColor='';adBtn.style.opacity='';adBtn.style.pointerEvents='';}}
  // Contract button — disable after sent
  const cBtn=document.getElementById('venContractBtn');if(cBtn){cBtn.style.display='inline-flex';const contractSent=['contract_sent','contract_signed','deposit_paid','room_list_sent','confirmed'].includes(bk.status)||bk.contractSentViaPortal;if(contractSent){cBtn.textContent='✓ Contract Sent';cBtn.style.opacity='.5';cBtn.style.pointerEvents='none';cBtn.style.background='#6b7280';}else{cBtn.textContent='📋 Send Contract';cBtn.style.opacity='';cBtn.style.pointerEvents='';cBtn.style.background='';}}
  const tpBtn=document.getElementById('venTeacherPortalBtn');if(tpBtn)tpBtn.style.display='inline-flex';
  const cpBtn=document.getElementById('venCopyTeacherLinkBtn');if(cpBtn)cpBtn.style.display='inline-flex';
  const schedBtn=document.getElementById('venScheduleBtn');
  if(schedBtn){
    const hasSched=!!bk.scheduleRequest?.submittedAt;
    schedBtn.style.display=hasSched?'inline-flex':'none';
    const st=bk.scheduleRequest?.adminStatus||'pending';
    if(hasSched){schedBtn.textContent=st==='confirmed'?'✓ View Schedule':'📋 Review Schedule';schedBtn.style.background=st==='confirmed'?'#6b7280':'#059669';schedBtn.style.borderColor=st==='confirmed'?'#6b7280':'#059669';}
  }
  const hasRooms=(bk.blockedRooms||[]).length>0;
  // Disable Auto-assign + Manual Assign with strikethrough once rooms are blocked
  ['venAutoAssignBtn','venManualAssignBtn'].forEach(bid=>{
    const btn=document.getElementById(bid);
    btn.style.display='inline-flex';
    if(hasRooms){btn.style.opacity='.35';btn.style.textDecoration='line-through';btn.style.pointerEvents='none';btn.title='Room list already assigned';}
    else{btn.style.opacity='';btn.style.textDecoration='';btn.style.pointerEvents='';btn.title='';}
  });
  document.getElementById('venAddMoreBtn').style.display=hasRooms?'inline-flex':'none';
  document.getElementById('venRoomsSoldOutBtn').style.display=hasRooms?'inline-flex':'none';
  const depositPaid=['deposit_paid','room_list_sent','confirmed'].includes(bk.status)||(bk.payments||[]).some(p=>p.amount>0);
  const rlBtn=document.getElementById('venSendRoomListBtn');
  if(rlBtn){
    if(!hasRooms){rlBtn.style.display='none';}
    else if(!depositPaid){
      rlBtn.style.display='inline-flex';rlBtn.textContent='⚠ Deposit Required to Send';
      rlBtn.style.opacity='.45';rlBtn.style.pointerEvents='none';rlBtn.style.cursor='not-allowed';
      rlBtn.title='Deposit must be received before sending the room list';
    }else{
      rlBtn.style.display='inline-flex';rlBtn.style.opacity='';rlBtn.style.pointerEvents='';rlBtn.style.cursor='';rlBtn.title='';
      rlBtn.textContent=bk.roomListSentViaPortal?'↻ Resend Room List':'📋 Send Room List';
    }
  }
  document.getElementById('vm-leader').value=bk.leaderName||'';document.getElementById('vm-retreat').value=bk.retreatName||'';document.getElementById('vm-email').value=bk.leaderEmail||'';document.getElementById('vm-phone').value=bk.leaderPhone||'';document.getElementById('vm-start').value=bk.startDate||'';document.getElementById('vm-end').value=bk.endDate||'';document.getElementById('vm-pax').value=bk.pax||'';document.getElementById('vm-status').value=bk.status||'requested';document.getElementById('vm-notes').value=bk.notes||'';document.getElementById('vm-doc-link').value=bk.docLink||'';const mpEl=document.getElementById('vm-mealplan');if(mpEl)mpEl.value=bk.mealPlan||'standard';
  venUpdateRowOptions(bk.startDate,bk.endDate,bk.row,id);
  ['vm-start','vm-end'].forEach(fid=>{const el=document.getElementById(fid);if(!el)return;el.onchange=()=>{const s=document.getElementById('vm-start').value,e=document.getElementById('vm-end').value;if(s&&e)venUpdateRowOptions(s,e,document.getElementById('vm-row').value,id);};});
  renderVmPaymentWidget(bk);renderVmChargesWidget(bk);renderVmHistory(id);openModal('venModal');if(typeof tpCheckMatch==='function')tpCheckMatch();}

function renderVmHistory(bkId){
  const wrap=document.getElementById('vm-history');
  const list=document.getElementById('vm-history-list');
  if(!wrap||!list)return;
  const log=loadActivityLog().filter(e=>e.bkId===bkId);
  if(!log.length){wrap.style.display='none';return;}
  wrap.style.display='block';
  const actionIcon={'Booking created':'✦','Booking updated':'✎','Status changed':'⇄','Dates changed':'📅','Pax updated':'👥','Contract sent (email)':'📧','Contract sent to teacher portal':'📧','Dates accepted':'✓','Payment recorded':'💰','Payment removed':'✕','Charge added':'🧾','Charge removed':'✕','Room list sent to teacher portal':'📋','Teacher room auto-assigned':'🛏','Room locked':'🔒','Room unlocked':'🔓','Room moved':'↔','Rooms auto-assigned':'⚡','Task completed':'✓','Schedule approved':'✓','Schedule changes requested':'✎'};
  list.innerHTML=log.map(e=>{
    const t=new Date(e.ts);
    const dateStr=t.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    const timeStr=t.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    const icon=actionIcon[e.action]||'·';
    return`<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #f0ece4;align-items:flex-start">
      <div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:#f0ece4;display:flex;align-items:center;justify-content:center;font-size:13px;line-height:1">${icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text)">${e.action}</div>
        ${e.detail?`<div style="font-size:12px;color:var(--muted);margin-top:1px">${e.detail}</div>`:''}
        <div style="font-size:11px;color:#bbb;margin-top:3px">${dateStr} &middot; ${timeStr} &nbsp;&middot;&nbsp; <span style="font-weight:600;color:#9ca3af">${e.userName||'System'}</span></div>
      </div>
    </div>`;
  }).join('')+`<div style="font-size:11px;color:#ccc;text-align:center;padding:8px 0">${log.length} event${log.length!==1?'s':''} total</div>`;
}
function venSave(){const lead=document.getElementById('vm-leader').value.trim(),ret=document.getElementById('vm-retreat').value.trim(),leaderEmail=document.getElementById('vm-email').value.trim(),leaderPhone=document.getElementById('vm-phone').value.trim(),start=document.getElementById('vm-start').value,end=document.getElementById('vm-end').value,row=document.getElementById('vm-row').value,pax=parseInt(document.getElementById('vm-pax').value)||0,status=document.getElementById('vm-status').value,notes=document.getElementById('vm-notes').value.trim(),docLink=document.getElementById('vm-doc-link').value.trim(),mealPlan=document.getElementById('vm-mealplan')?.value||'standard';if(!lead&&!ret){alert('Enter a leader or retreat name.');return;}if(!start||!end){alert('Select dates.');return;}if(start>end){alert('Departure must be after arrival.');return;}if(venEditId){const bk=AppData.bookings.find(b=>b.id===venEditId);const prevStatus=bk.status,prevStart=bk.startDate,prevEnd=bk.endDate,prevPax=bk.pax;
  // Intercept cancellation: show policy modal instead of saving directly
  if(status==='cancelled'&&prevStatus!=='cancelled'){
    // Update non-status fields first so modal has accurate info
    Object.assign(bk,{leaderName:lead,retreatName:ret,leaderEmail,leaderPhone,startDate:start,endDate:end,row,pax,notes,docLink,mealPlan});
    openCancelModal(bk.id);return;
  }
  const datesChanged=prevStart!==start||prevEnd!==end;
  let newStatus=status;
  if(datesChanged){
    const hasContract=!!(bk.contractSignedAt||bk.contractSignature);
    const hasSched=!!bk.scheduleRequest?.submittedAt;
    const hasCbRes=bk.cbReservationIds&&Object.keys(bk.cbReservationIds).length>0;
    const lines=[];
    lines.push(`• Venue block will move to ${fmtDate(start)} – ${fmtDate(end)}`);
    lines.push('• Room block stays assigned (same rooms, new dates)');
    if(hasCbRes)lines.push('• Cloudbeds reservations will be cancelled — re-push after confirming dates');
    if(hasContract)lines.push('• Signed contract will be deleted — must be re-sent and re-signed');
    if(hasSched)lines.push('• Teacher schedule will be deleted — teacher must resubmit');
    if(!confirm('Changing dates will trigger the following:\n\n'+lines.join('\n')+'\n\nContinue?'))return;
    // Cancel Cloudbeds reservations
    if(hasCbRes){cancelCloudbedReservations(bk).catch(e=>console.warn('[CB cancel on date change]',e));bk.cbReservationIds={};bk.cbGuestIds={};bk.cbAdjustmentIds={};}
    // Wipe contract
    if(hasContract){delete bk.contractSignedAt;delete bk.contractSignature;delete bk.contractSentViaPortal;delete bk.contractSentAt;if(bk.depositInvoice)bk.depositInvoice.status='pending';}
    // Reset status back to requested
    if(['contract_signed','deposit_paid','room_list_sent','confirmed'].includes(bk.status))newStatus='requested';
    else if(bk.status==='contract_sent')newStatus='requested';
    // Wipe schedule
    if(hasSched){delete bk.scheduleRequest;delete bk.retreatActivities;}
    logActivity('Dates changed — cascade reset',`${fmtDate(prevStart)} – ${fmtDate(prevEnd)} → ${fmtDate(start)} – ${fmtDate(end)}${hasContract?' · contract deleted':''}${hasSched?' · schedule deleted':''}`,venEditId);
  }
  // Auto-find available row if the chosen row now has a date conflict with another retreat
  let assignedRow=row;
  const rowConflict=AppData.bookings.some(b=>b.id!==venEditId&&b.row===row&&datesOverlap(start,end,b.startDate,b.endDate));
  if(rowConflict){assignedRow=findAvailableRow(start,end,venEditId);if(assignedRow!==row)showToast(`Dates conflict in ${row} — moved to ${assignedRow} instead.`);}
  Object.assign(bk,{leaderName:lead,retreatName:ret,leaderEmail,leaderPhone,startDate:start,endDate:end,row:assignedRow,pax,status:newStatus,notes,docLink,mealPlan});const savedBkId=venEditId;const savedName=lead||ret;saveAll();closeModal('venModal');venBuild();buildDashboard();logActivity('Booking updated',`${savedName} · ${fmtDate(start)} – ${fmtDate(end)}`,savedBkId);if(prevStatus!==newStatus&&!datesChanged){logActivity('Status changed',`${statusLabel(prevStatus)} → ${statusLabel(newStatus)}`,savedBkId);if(newStatus==='contract_sent'&&prevStatus==='requested')sendTeacherEmail(bk,'dates_accepted');}if(!datesChanged&&prevPax!=pax&&pax>0)logActivity('Pax updated',`${prevPax||'?'} → ${pax} guests`,savedBkId);}else{
  // Auto-find available row if chosen row has a date conflict
  let assignedRow=row;
  const rowConflict=AppData.bookings.some(b=>b.row===row&&datesOverlap(start,end,b.startDate,b.endDate));
  if(rowConflict){assignedRow=findAvailableRow(start,end,null);showToast(`Dates conflict in ${row} — placed in ${assignedRow} instead.`);}
  AppData.bookings.push({id:uid(),leaderName:lead,retreatName:ret,leaderEmail,leaderPhone,startDate:start,endDate:end,row:assignedRow,pax,status,notes,docLink,mealPlan,roomAssignments:[]});
  const savedBkId=AppData.bookings[AppData.bookings.length-1]?.id;const savedName=lead||ret;
  saveAll();closeModal('venModal');venBuild();
  logActivity('Booking created',`${savedName} · ${fmtDate(start)} – ${fmtDate(end)} · ${assignedRow}`,savedBkId);
}
  showToast(venEditId?'Updated.':'Booking added.');}
function venDelete(){
  if(!venEditId)return;
  const bk=AppData.bookings.find(b=>b.id===venEditId);
  const name=bk?`${bk.leaderName||bk.retreatName}`:'this retreat';
  // Show custom confirmation modal requiring typed phrase
  let existing=document.getElementById('venDeleteConfirmModal');if(existing)existing.remove();
  const overlay=document.createElement('div');
  overlay.id='venDeleteConfirmModal';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;padding:32px 28px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:'Jost',sans-serif">
    <div style="font-size:22px;margin-bottom:8px;text-align:center">⚠️</div>
    <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:#991b1b;margin-bottom:8px;text-align:center">Delete Retreat</div>
    <div style="font-size:13px;color:#374151;line-height:1.7;margin-bottom:6px;text-align:center"><b>${name}</b></div>
    <div style="font-size:12.5px;color:#6b7280;line-height:1.7;margin-bottom:18px">This will permanently remove the retreat, all guest registrations, builder entries, and payment records. <b>This cannot be undone.</b></div>
    <div style="font-size:12.5px;color:#374151;margin-bottom:8px;font-weight:600">Type <span style="background:#fee2e2;color:#991b1b;padding:1px 7px;border-radius:5px;font-weight:700">cancel retreat</span> to confirm:</div>
    <input id="venDeletePhrase" type="text" placeholder="cancel retreat" autocomplete="off"
      oninput="document.getElementById('venDeleteBtn').disabled=this.value.trim().toLowerCase()!=='cancel retreat'"
      style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;font-family:'Jost',sans-serif;outline:none;margin-bottom:16px">
    <div style="display:flex;gap:10px">
      <button onclick="document.getElementById('venDeleteConfirmModal').remove()" style="flex:1;padding:10px;background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:8px;font-family:'Jost',sans-serif;font-size:13px;font-weight:600;cursor:pointer;color:#374151">Keep Retreat</button>
      <button id="venDeleteBtn" disabled onclick="venDeleteConfirmed()" style="flex:1;padding:10px;background:#dc2626;border:none;border-radius:8px;font-family:'Jost',sans-serif;font-size:13px;font-weight:700;cursor:pointer;color:#fff;opacity:.4;transition:opacity .15s" onmouseover="if(!this.disabled)this.style.opacity='1'" onmouseout="if(!this.disabled)this.style.opacity=''">Delete Permanently</button>
    </div>
  </div>`;
  // Enable/disable delete btn style sync
  const enableStyle=()=>{const btn=document.getElementById('venDeleteBtn');if(btn)btn.style.opacity=btn.disabled?'.4':'1';};
  overlay.querySelector('#venDeletePhrase').addEventListener('input',enableStyle);
  document.body.appendChild(overlay);
  setTimeout(()=>overlay.querySelector('#venDeletePhrase')?.focus(),80);
}
function venDeleteConfirmed(){
  const phrase=document.getElementById('venDeletePhrase')?.value?.trim().toLowerCase();
  if(phrase!=='cancel retreat')return;
  document.getElementById('venDeleteConfirmModal')?.remove();
  if(!venEditId)return;
  const bk=AppData.bookings.find(b=>b.id===venEditId);
  const id=venEditId;
  cancelCloudbedReservations(bk).catch(e=>console.warn('[CB cancel]',e));
  deletedBookingIds.add(id);
  AppData.bookings=AppData.bookings.filter(b=>b.id!==id);
  AppData.regs=AppData.regs.filter(r=>r.bookingId!==id);
  if(typeof builds!=='undefined')builds=builds.filter(b=>b.bkId!==id);
  Object.keys(adminDone).filter(k=>k.startsWith(id+'_')).forEach(k=>delete adminDone[k]);
  const acks=JSON.parse(localStorage.getItem('amansala_issue_acks')||'{}');
  Object.keys(acks).filter(k=>k.startsWith(id+'__')).forEach(k=>delete acks[k]);
  localStorage.setItem('amansala_issue_acks',JSON.stringify(acks));
  // Remove all transport submissions for this retreat
  const remainingTransport=loadTransport().filter(s=>s.bookingId!==id);
  saveTransport(remainingTransport);
  // Remove from Supabase transport table
  try{db.from('transport').delete().eq('booking_id',id).then(()=>{});}catch(e){}
  saveBuilds();saveAll();saveAdminDone();
  closeModal('venModal');venBuild();buildDashboard();
  showToast(`${bk?bk.leaderName||bk.retreatName:'Retreat'} deleted.`);
}
function openCancelModal(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const today=new Date();today.setHours(0,0,0,0);
  const arrival=pd(bk.startDate);
  const weeksOut=Math.floor((arrival-today)/(7*24*60*60*1000));
  const within16=(arrival-today)<=(16*7*24*60*60*1000)&&arrival>today;
  const totalPaid=(bk.payments||[]).reduce((s,p)=>s+p.amount,0);
  const refund=within16?Math.max(0,totalPaid-750):totalPaid;
  const el=document.getElementById('cancelModalBody');
  if(el){
    el.innerHTML=`<div style="text-align:center;margin-bottom:16px">
      <div style="width:48px;height:48px;border-radius:50%;background:#fef2f2;border:2px solid #fca5a5;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:20px">✕</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:#991b1b;margin-bottom:4px">Cancel Retreat</div>
      <div style="font-size:13px;color:#6b7280">${bk.leaderName||bk.retreatName} · ${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}</div>
    </div>
    ${within16?`<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:14px 18px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Within 16 Weeks — Cancellation Policy Applies</div>
      <div style="font-size:12.5px;color:#7f1d1d;line-height:1.7">Retreat arrives in <strong>${weeksOut} week${weeksOut!==1?'s':''}</strong>. Per policy, Amansala retains <strong>$750</strong> of the deposit paid.</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="background:#faf7f3;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Total Paid</div>
        <div style="font-size:16px;font-weight:700;color:#374151">${fmt$(totalPaid)}</div>
      </div>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Refund to Leader</div>
        <div style="font-size:16px;font-weight:700;color:#15803d">${fmt$(refund)}</div>
      </div>
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:13px;font-weight:600;color:#374151">Retained by Amansala</span>
      <span style="font-size:15px;font-weight:800;color:#991b1b">$750.00</span>
    </div>`:`<div style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px;padding:14px 18px;margin-bottom:16px">
      <div style="font-size:12.5px;color:#92400e;line-height:1.7">More than 16 weeks out — no cancellation fee applies. ${totalPaid>0?`Full deposit of <strong>${fmt$(totalPaid)}</strong> to be refunded.`:''}</div>
    </div>`}
    <div style="font-size:12px;color:#9ca3af;margin-bottom:18px">Room block will be released automatically. This cannot be undone.</div>
    <div style="display:flex;gap:10px">
      <button class="btn btn-secondary" style="flex:1" onclick="closeModal('cancelConfirmModal')">Keep Retreat</button>
      <button class="btn btn-danger" style="flex:1;background:#dc2626;border-color:#dc2626;color:#fff" onclick="confirmCancellation('${bkId}',${within16})">Confirm Cancellation</button>
    </div>`;
  }
  closeModal('venModal');
  openModal('cancelConfirmModal');
}

function confirmCancellation(bkId,within16){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const totalPaid=(bk.payments||[]).reduce((s,p)=>s+p.amount,0);
  bk.status='cancelled';
  bk.statusChangedAt=new Date().toISOString();
  bk.cancelledAt=new Date().toISOString();
  bk.cancelledWithin16Weeks=!!within16;
  bk.cancellationFee=within16?750:0;
  bk.depositAtCancellation=totalPaid;
  cancelCloudbedReservations(bk).catch(e=>console.warn('[CB cancel]',e));
  bk.blockedRooms=[];
  saveAll();closeModal('cancelConfirmModal');venBuild();buildDashboard();
  logActivity('Retreat cancelled',`${bk.leaderName||bk.retreatName} — ${within16?'within 16 weeks · $750 retained':'no fee'}`,bkId);
  showToast(`Retreat cancelled.${within16?' $750 retained in Cancellation Bank.':''}`);
}

function venOpenTeacherPortal(){const bk=AppData.bookings.find(b=>b.id===venEditId);if(!bk)return;openTeacherPortal(bk.id);}
function venOpenContract(){const id=venEditId;closeModal('venModal');setTimeout(()=>openContractModal(id),120);}
function venSendRoomList(){const bk=AppData.bookings.find(b=>b.id===venEditId);if(!bk)return;bk.roomListSentViaPortal=true;bk.roomListSentAt=new Date().toISOString();bk.status='room_list_sent';bk.statusChangedAt=new Date().toISOString();adminDone[bk.id+'_roomListSent']={ts:new Date().toISOString(),label:'Room List Sent'};saveAdminDone();saveAll();closeModal('venModal');buildDashboard();venBuild();logActivity('Room list sent to teacher portal',`${bk.leaderName||bk.retreatName} — room assignments now visible in portal`,bk.id);sendTeacherEmail(bk,'room_list_sent');openRoomListEmailModal(bk);showToast('Room list sent to teacher portal.');}
function venAcceptDates(){const bk=AppData.bookings.find(b=>b.id===venEditId);if(!bk)return;bk.datesAccepted=true;bk.datesAcceptedAt=new Date().toISOString();saveAll();const btn=document.getElementById('venAcceptDatesBtn');if(btn){btn.textContent='✓ Dates Accepted';btn.style.background='#059669';btn.style.color='#fff';btn.style.borderColor='#059669';btn.style.opacity='.7';btn.style.pointerEvents='none';}logActivity('Dates accepted',`${bk.leaderName||bk.retreatName} · ${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}`,venEditId);showToast('Dates accepted.');}
function autoSetEnd(startId,endId,days=5){
  const s=document.getElementById(startId)?.value;
  const eEl=document.getElementById(endId);
  if(!s||!eEl)return;
  eEl.min=s;
  // Reset departure when: no value, departure is before arrival, or year/month differs from arrival
  // This ensures the departure calendar always opens in the same month as arrival
  const sYM=s.slice(0,7); // YYYY-MM
  const eYM=(eEl.value||'').slice(0,7);
  if(!eEl.value||eEl.value<s||eYM!==sYM){
    const d=new Date(s+'T00:00:00');
    d.setDate(d.getDate()+days);
    eEl.value=d.toISOString().split('T')[0];
  }
}

function venAddMoreRooms(){
  closeModal('venModal');
  openBlockModal(venEditId);
}

// Point the Room Calendar at a booking's dates, with `pad` days of context before and after
function rcJumpToBooking(bk,pad){
  pad=pad!=null?pad:6;
  rcStart=addDays(pd(bk.startDate),-pad);
  // Always land on the standard 30-day view (Darlene's call 2026-09-15) — this
  // used to size the window to the retreat's own span + padding, which landed
  // on an odd 15-18 day view instead of the default everyone expects. Still
  // widen past 30 for a retreat that's genuinely longer than that, so its full
  // stay stays visible, but never narrower than 30.
  const spanDays=Math.round((pd(bk.endDate)-pd(bk.startDate))/DAY_MS);
  rcShowDays=Math.max(30,spanDays+pad*2+1);
}

function dbOpenRoomCal(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  rcJumpToBooking(bk);
  switchTab('roomcal',document.querySelector('.tab-btn[onclick*="roomcal"]'));
}

function venOpenRoomCalendar(){
  const bk=AppData.bookings.find(b=>b.id===venEditId);if(!bk)return;
  rcJumpToBooking(bk);
  closeModal('venModal');
  switchTab('roomcal',document.querySelector('.tab-btn[onclick*="roomcal"]'));
}

function venDuplicateRetreat(){
  const bk=AppData.bookings.find(b=>b.id===venEditId);if(!bk)return;
  const newStart=prompt('New arrival date (YYYY-MM-DD):',bk.startDate)||'';
  const newEnd=prompt('New departure date (YYYY-MM-DD):',bk.endDate)||'';
  if(!newStart||!newEnd){showToast('Cancelled.');return;}
  if(newStart>=newEnd){alert('Departure must be after arrival.');return;}
  const newLeader=prompt('Leader / Group name:',bk.leaderName||'')||'';
  const newName=prompt('Retreat name:',bk.retreatName||'')||'';
  const newBk={
    id:uid(),
    leaderName:newLeader||bk.leaderName,
    retreatName:newName||bk.retreatName,
    startDate:newStart,endDate:newEnd,
    row:bk.row,pax:bk.pax,status:'requested',
    notes:bk.notes||'',docLink:'',
    roomAssignments:[],
    blockedRooms:[...(bk.blockedRooms||[])],
  };
  AppData.bookings.push(newBk);
  saveAll();closeModal('venModal');venBuild();
  showToast(`New retreat created — ${(newBk.blockedRooms||[]).length} rooms copied. Update dates & status as needed.`);
}

function venOpenCopyRooms(){
  const bk=AppData.bookings.find(b=>b.id===venEditId);if(!bk)return;
  document.getElementById('crModalSub').textContent=`Copying into: ${bk.leaderName||bk.retreatName} · ${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}`;
  // Populate source dropdown — any booking (except self) that has rooms assigned
  const sel=document.getElementById('crSourceSel');
  sel.innerHTML='<option value="">— Select a retreat —</option>';
  AppData.bookings
    .filter(b=>b.id!==venEditId&&(b.blockedRooms||[]).length>0)
    .sort((a,b)=>a.startDate.localeCompare(b.startDate))
    .forEach(b=>{
      const o=document.createElement('option');
      o.value=b.id;
      o.textContent=`${b.leaderName||b.retreatName} · ${fmtDate(b.startDate)} – ${fmtDate(b.endDate)} (${(b.blockedRooms||[]).length} rooms)`;
      sel.appendChild(o);
    });
  document.getElementById('crPreview').textContent='Select a retreat above to preview what will be copied.';
  openModal('copyRoomsModal');
}

function crUpdatePreview(){
  const bk=AppData.bookings.find(b=>b.id===venEditId);if(!bk)return;
  const srcId=document.getElementById('crSourceSel').value;
  const prev=document.getElementById('crPreview');
  if(!srcId){prev.textContent='Select a retreat above to preview what will be copied.';return;}
  const src=AppData.bookings.find(b=>b.id===srcId);if(!src){return;}
  // Find taken rooms from OTHER overlapping bookings (not self, not source).
  // Also cross-checks real registrations, not just blockedRooms — see the
  // note in crSave() below.
  const takenRooms=new Set();
  AppData.bookings.forEach(other=>{
    if(other.id===bk.id||other.id===srcId||other.status==='cancelled')return;
    if(!datesOverlap(bk.startDate,bk.endDate,other.startDate,other.endDate))return;
    (other.blockedRooms||[]).forEach(r=>takenRooms.add(r));
    AppData.regs.filter(r=>r.bookingId===other.id&&r.room&&(r.guests||[]).some(g=>g.name)).forEach(r=>takenRooms.add(r.room));
  });
  const available=(src.blockedRooms||[]).filter(r=>!takenRooms.has(r));
  const blocked=(src.blockedRooms||[]).filter(r=>takenRooms.has(r));
  let html=`<b style="color:var(--teal)">${available.length} rooms will be copied:</b> <span style="color:var(--dark)">${available.join(', ')||'none'}</span>`;
  if(blocked.length)html+=`<br><span style="color:#dc2626;font-size:11.5px">⚑ ${blocked.length} room${blocked.length>1?'s':''} skipped (taken by another retreat): ${blocked.join(', ')}</span>`;
  prev.innerHTML=html;
}

function crSave(){
  const bk=AppData.bookings.find(b=>b.id===venEditId);if(!bk)return;
  const srcId=document.getElementById('crSourceSel').value;
  if(!srcId){alert('Select a retreat to copy from.');return;}
  const src=AppData.bookings.find(b=>b.id===srcId);if(!src)return;
  // Also cross-checks real registrations, not just blockedRooms — a room can
  // have a named guest registered in it whose room was never added to
  // blockedRooms ("orphaned registration"; confirmed real incidents:
  // Katherine McClelland's CH3a/CH3b, Monica's 5B/GV13a/GV13b).
  const takenRooms=new Set();
  AppData.bookings.forEach(other=>{
    if(other.id===bk.id||other.id===srcId||other.status==='cancelled')return;
    if(!datesOverlap(bk.startDate,bk.endDate,other.startDate,other.endDate))return;
    (other.blockedRooms||[]).forEach(r=>takenRooms.add(r));
    AppData.regs.filter(r=>r.bookingId===other.id&&r.room&&(r.guests||[]).some(g=>g.name)).forEach(r=>takenRooms.add(r.room));
  });
  const available=(src.blockedRooms||[]).filter(r=>!takenRooms.has(r));
  const skipped=(src.blockedRooms||[]).filter(r=>takenRooms.has(r));
  if(!available.length){alert('No rooms could be copied — all rooms from that retreat are already taken on your dates.');return;}
  let msg=`Copy ${available.length} rooms from "${src.leaderName||src.retreatName}"?\n\nRooms: ${available.join(', ')}`;
  if(skipped.length)msg+=`\n\nSkipped (already taken): ${skipped.join(', ')}`;
  if(!confirm(msg))return;
  bk.blockedRooms=available;
  saveAll();closeModal('copyRoomsModal');venBuild();
  showToast(`${available.length} rooms copied.`);
}

// Shared room-block computation — no UI side effects. Returns {selected, beds, flags, slRooms, preset, casaShanti}
function computeAutoRoomBlock(bk){
  const pax=parseInt(bk.pax)||15;
  // Also cross-checks real registrations, not just blockedRooms — a room can
  // have a named guest registered in it whose room was never added to
  // blockedRooms ("orphaned registration"; confirmed real incidents:
  // Katherine McClelland's CH3a/CH3b, Monica's 5B/GV13a/GV13b).
  const takenRooms=new Set();
  AppData.bookings.forEach(other=>{
    if(other.id===bk.id||other.status==='cancelled')return;
    if(!datesOverlap(bk.startDate,bk.endDate,other.startDate,other.endDate))return;
    (other.blockedRooms||[]).forEach(r=>takenRooms.add(r));
    AppData.regs.filter(r=>r.bookingId===other.id&&r.room&&(r.guests||[]).some(g=>g.name)).forEach(r=>takenRooms.add(r.room));
  });
  const rowAllowed=getRowAllowedRooms(bk.row);
  const slRooms=getStraightLineRooms(bk);
  const flags=[];
  if(slRooms.size)flags.push(`Straight-line: ${slRooms.size} room${slRooms.size!==1?'s':''} from back-to-back retreat on ${bk.row}`);
  function pickFromType(rtId,n){
    const rt=AppData.roomTypes.find(r=>r.id===rtId);if(!rt)return[];
    const pool=rt.rooms.filter(r=>roomInAutoPool(r,bk,rowAllowed,takenRooms))
      .sort((a,b)=>roomAutoSortKey(a,slRooms)-roomAutoSortKey(b,slRooms)||a.localeCompare(b,undefined,{numeric:true}));
    return pool.slice(0,n);
  }
  // 10-PERSON: try Casa Shanti first (any row — falls back to standard mix if unavailable)
  if(pax<=10){
    function pickCasa(rtId,n){
      const rt=AppData.roomTypes.find(r=>r.id===rtId);if(!rt)return[];
      return rt.rooms.filter(r=>!takenRooms.has(r))
        .sort((a,b)=>roomAutoSortKey(a,slRooms)-roomAutoSortKey(b,slRooms)||a.localeCompare(b,undefined,{numeric:true}))
        .slice(0,n);
    }
    const kings=pickCasa('csh1',3);
    const queens=pickCasa('csh2',3);
    const csRooms=[...kings,...queens];
    const teacherPool=(AppData.roomTypes.find(r=>r.id==='rt5')?.rooms||[]).filter(r=>!takenRooms.has(r))
      .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const teacherRm=teacherPool[0];
    if(csRooms.length>=4){
      const selected=[...csRooms,...(teacherRm?[teacherRm]:[])];
      if(!teacherRm)flags.push('No Garden Basic available for teacher room');
      return{selected,beds:csRooms.length*2,flags,slRooms,preset:{tiers:[],scaling:0,increments:0},casaShanti:true};
    }
    flags.push('Casa Shanti not fully available — using standard room list');
  }
  // 15-PERSON BASE + increments
  const preset=getBldPreset(pax);
  const selected=[];
  let beds=0;
  for(const tier of preset.tiers){
    const rt=AppData.roomTypes.find(r=>r.id===tier.id);if(!rt)continue;
    const picked=pickFromType(tier.id,tier.n);
    picked.forEach(r=>takenRooms.add(r));
    selected.push(...picked);
    const bedMap={rt1:1,rt2:1,rt3:1,rt4:1,rt5:1,rt6:2,rt7:2,rt8:3,csh1:2,csh2:2};
    beds+=picked.length*(bedMap[tier.id]||1);
    if(picked.length<tier.n){
      flags.push(`Only ${picked.length}/${tier.n} ${rt.name} rooms available`);
    }
  }
  // Teacher Garden Basic (always, separate from guest rooms)
  const usedSet=new Set(selected);
  const rt5=AppData.roomTypes.find(r=>r.id==='rt5');
  const teacherPool=(rt5?.rooms||[]).filter(r=>roomInAutoPool(r,bk,rowAllowed,takenRooms)&&!usedSet.has(r))
    .sort((a,b)=>roomAutoSortKey(a,slRooms)-roomAutoSortKey(b,slRooms)||a.localeCompare(b,undefined,{numeric:true}));
  const teacherRm=teacherPool[0];
  if(teacherRm){selected.push(teacherRm);}
  else{flags.push('No Garden Basic available for teacher room');}
  // Expand virtual-group parent rooms (rt8/rt9) to individual sub-rooms (bd3/bd4)
  const expandedSel=[];
  selected.forEach(r=>{
    const isVirtParent=AppData.roomTypes.some(t=>VIRTUAL_GROUP_RT_IDS.has(t.id)&&(t.rooms||[]).includes(r));
    if(isVirtParent){const subs=_getSharedBeds(r);if(subs.length){expandedSel.push(...subs);return;}}
    expandedSel.push(r);
  });
  return{selected:[...new Set(expandedSel)],beds,flags,slRooms,preset,casaShanti:false};
}

function venAutoAssign(){
  const bk=AppData.bookings.find(b=>b.id===venEditId);if(!bk)return;
  const pax=bk.pax||0;
  if(!pax){alert('Set the expected Pax count on this booking first.');return;}
  const{selected,beds,flags,slRooms,preset,casaShanti}=computeAutoRoomBlock(bk);
  if(!selected.length){alert('No rooms available — all inventory may be blocked by overlapping retreats.');return;}
  const breakdown=AppData.roomTypes.map(rt=>{
    const got=selected.filter(r=>rt.rooms.includes(r)).length;
    return got>0?`  ${got}× ${rt.name}`:'';
  }).filter(Boolean).join('\n');
  let msg=`Room Block for ${pax} guests (${beds} guest beds)\n──────────────────────────\n${breakdown}\n──────────────────────────\n`;
  if(casaShanti)msg+=`📍 Casa Shanti (10-person placement)\n`;
  if(preset.increments>0)msg+=`Base 15 + ${preset.increments} increment${preset.increments>1?'s':''} (${pax} guests)\n`;
  if(flags.length)msg+=`\n⚠ ${flags.join('\n⚠ ')}\n`;
  msg+=`\nProceed with this room block?`;
  if(!confirm(msg))return;
  bk.blockedRooms=selected;
  autoAssignTeacherRoom(bk);
  saveAll();closeModal('venModal');venBuild();buildDashboard();
  logActivity('Rooms auto-assigned',`${selected.length} rooms / ${beds} guest beds for ${pax} guests · ${bk.leaderName||bk.retreatName}`,bk.id);
  showToast(`${selected.length} rooms assigned (${beds} guest beds).`);
}

function venManualAssign(){
  if(!venEditId)return;
  closeModal('venModal');
  openBlockModal(venEditId);
}

function openVenFinancials(){
  const bk=AppData.bookings.find(b=>b.id===venEditId);if(!bk)return;
  const nights=getNights(bk);
  document.getElementById('finModalSub').textContent=
    `${bk.leaderName||bk.retreatName} · ${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)} · ${nights} nights`;
  const bkRegs=AppData.regs.filter(r=>r.bookingId===bk.id);
  let totalCharged=0,totalPaid=0;
  let rows='';
  bkRegs.forEach(reg=>{
    const rt=AppData.roomTypes.find(t=>t.id===reg.roomTypeId);
    const gc=(reg.guests||[]).filter(g=>g.name).length||1;
    const price=reg.customPrice!=null?reg.customPrice:calcPrice(rt,gc,nights,bk.startDate,bk);
    const paid=reg.amountPaid||0;const balance=price-paid;
    totalCharged+=price;totalPaid+=paid;
    const gNames=(reg.guests||[]).filter(g=>g.name).map(g=>g.name).join(' & ')||'—';
    rows+=`<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:8px 12px;font-weight:600">${reg.room}</td>
      <td style="padding:8px 12px;color:var(--muted)">${rt?rt.name:'—'}</td>
      <td style="padding:8px 12px">${gNames}</td>
      <td style="padding:8px 12px;text-align:right">$${price.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
      <td style="padding:8px 12px;text-align:right;color:#16a34a">$${paid.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:600;color:${balance>0?'#dc2626':'#16a34a'}">$${balance.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
    </tr>`;
  });
  if(!bkRegs.length)rows=`<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--muted);font-style:italic">No registered guests yet.</td></tr>`;
  const totalBalance=totalCharged-totalPaid;

  // Potential = all blocked rooms at max occupancy
  let totalPotential=0;
  (bk.blockedRooms||[]).forEach(room=>{
    const rt=AppData.roomTypes.find(t=>t.rooms.includes(room));
    if(!rt)return;
    totalPotential+=calcPrice(rt,rt.maxOcc||2,nights,bk.startDate,bk);
  });
  const pct=totalPotential>0?Math.min(100,Math.round(totalCharged/totalPotential*100)):0;
  const remaining=Math.max(0,totalPotential-totalCharged);
  const barColor=pct>=90?'#16a34a':pct>=60?'#0891b2':'#f59e0b';

  // Teacher discount calculation
  const td=calcTeacherDiscount(bk,bkRegs);
  const nextTier=td.tiers.find(t=>!t.earned);
  const anyEarned=td.tiers.some(t=>t.earned);
  const allEarned=td.tiers.every(t=>t.earned);
  const tdHtml=(()=>{
    if(bk.teacherDiscountDisabled)return`<div style="margin-top:14px;padding:12px 16px;background:#f9fafb;border:1.5px dashed #d1d5db;border-radius:10px;font-size:12.5px;color:#9ca3af;display:flex;align-items:center;gap:8px"><span>Teacher discount disabled for this retreat</span><button onclick="event.stopPropagation();const bk=bookings.find(b=>b.id==='${bk.id}');if(bk){delete bk.teacherDiscountDisabled;saveAll();openVenFinancials();}" style="margin-left:auto;padding:3px 10px;font-size:11.5px;background:#fff;border:1px solid #d1d5db;border-radius:5px;cursor:pointer;font-family:'Jost',sans-serif">Re-enable</button></div>`;
    const tierRows=td.tiers.map((t,i)=>{
      const pg=Math.min(td.paidGuests,t.threshold);
      const pct2=Math.round(pg/t.threshold*100);
      const barC=t.earned?'#16a34a':'#0891b2';
      return`<div style="margin-bottom:${i<td.tiers.length-1?'12px':'0'}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
          <span style="font-size:12.5px;font-weight:600;color:${t.earned?'#15803d':'var(--dark)'}">${t.earned?'✓ ':''}<b>${t.label}</b></span>
          <span style="font-size:12px;color:${t.earned?'#15803d':'var(--muted)'}">
            ${t.earned
              ?`<b style="color:#15803d">−$${t.credit.toLocaleString()} credit</b> ($${t.rate}/night × ${t.nights} nights)`
              :`${td.paidGuests}/${t.threshold} guests — need ${t.threshold-td.paidGuests} more`}
          </span>
        </div>
        <div style="background:#e5e7eb;border-radius:99px;height:7px;overflow:hidden">
          <div style="height:100%;width:${pct2}%;background:${barC};border-radius:99px;transition:width .4s"></div>
        </div>
      </div>`;
    }).join('');
    const creditSummary=anyEarned?`<div style="margin-top:12px;padding:10px 14px;background:${allEarned?'#dcfce7':'#eff6ff'};border-radius:8px;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:13px;font-weight:700;color:${allEarned?'#15803d':'#1d4ed8'}">Total Teacher Credit Earned</span>
      <span style="font-size:15px;font-weight:800;color:${allEarned?'#15803d':'#1d4ed8'}">−$${td.totalCredit.toLocaleString()}</span>
    </div>`:'';
    return`<div style="margin-top:14px;border:1.5px solid ${anyEarned?'#86efac':'#bfdbfe'};border-radius:10px;overflow:hidden">
      <div style="padding:10px 16px;background:${anyEarned?'#f0fdf4':'#eff6ff'};border-bottom:1px solid ${anyEarned?'#86efac':'#bfdbfe'};display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${anyEarned?'#15803d':'#1d4ed8'}">Teacher Discount · ${td.paidGuests} registered guest${td.paidGuests!==1?'s':''}</span>
        <button onclick="event.stopPropagation();const bk2=bookings.find(b=>b.id==='${bk.id}');if(bk2){bk2.teacherDiscountDisabled=true;saveAll();openVenFinancials();}" style="padding:2px 9px;font-size:11px;background:#fff;border:1px solid ${anyEarned?'#86efac':'#bfdbfe'};border-radius:5px;cursor:pointer;font-family:'Jost',sans-serif;color:${anyEarned?'#15803d':'#1d4ed8'}">Disable</button>
      </div>
      <div style="padding:14px 16px">${tierRows}${creditSummary}</div>
    </div>`;
  })();

  document.getElementById('finModalBody').innerHTML=`
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="border-bottom:2px solid var(--border)">
        <th style="padding:8px 12px;text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700">Room</th>
        <th style="padding:8px 12px;text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700">Type</th>
        <th style="padding:8px 12px;text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700">Guest(s)</th>
        <th style="padding:8px 12px;text-align:right;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700">Charged</th>
        <th style="padding:8px 12px;text-align:right;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700">Paid</th>
        <th style="padding:8px 12px;text-align:right;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700">Balance</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="border-top:2px solid var(--border);background:var(--sand)">
        <td colspan="3" style="padding:10px 12px;font-weight:700">Total — ${bkRegs.length} room${bkRegs.length!==1?'s':''} · ${bk.pax||0} pax estimated</td>
        <td style="padding:10px 12px;text-align:right;font-weight:700">$${totalCharged.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:700;color:#16a34a">$${totalPaid.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:700;color:${totalBalance>0?'#dc2626':'#16a34a'}">$${totalBalance.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
      </tr></tfoot>
    </table>
    ${totalPotential>0?`
    <div style="margin-top:14px;padding:14px 16px;background:var(--sand);border-radius:10px;border:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Revenue Goal</span>
        <span style="font-size:12.5px;font-weight:700;color:${barColor}">${pct}% filled</span>
      </div>
      <div style="background:#e5e7eb;border-radius:99px;height:10px;overflow:hidden;margin-bottom:8px">
        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:99px;transition:width .4s ease"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12.5px">
        <span><b style="color:${barColor}">$${totalCharged.toLocaleString(undefined,{maximumFractionDigits:0})}</b> <span style="color:var(--muted)">sold</span></span>
        <span style="color:var(--muted)">of</span>
        <span><b>$${totalPotential.toLocaleString(undefined,{maximumFractionDigits:0})}</b> <span style="color:var(--muted)">full potential</span></span>
        <span style="color:var(--muted)">·</span>
        <span><b style="color:#f59e0b">$${remaining.toLocaleString(undefined,{maximumFractionDigits:0})}</b> <span style="color:var(--muted)">remaining</span></span>
      </div>
    </div>`:''}

    ${tdHtml}

    <div id="finPayNoteEl" style="margin-top:12px;padding:8px 12px;background:#fef3c7;border-left:3px solid #fcd34d;border-radius:6px;font-size:12.5px;color:#92400e;display:${bk.finalPaymentDate?'block':'none'}">
      ⏳ Final payment requested${bk.finalPaymentDate?' on '+fmtDate(bk.finalPaymentDate):''}
    </div>
    ${(()=>{
      const pays=(bk.payments||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
      if(!pays.length)return '';
      const methodLabel={wire:'Wire',cheque:'Cheque',zelle:'Zelle',venmo:'Venmo',card:'Credit Card',check:'Cheque',cash:'Cash',other:'Other'};
      const totalRec=pays.reduce((s,p)=>s+p.amount,0);
      const rows=pays.map(p=>`<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:7px 12px">${fmtDate(p.date)}</td>
        <td style="padding:7px 12px;color:var(--muted)">${methodLabel[p.method]||p.method}</td>
        <td style="padding:7px 12px;color:var(--muted)">${p.ref||'—'}</td>
        <td style="padding:7px 12px;color:var(--muted)">${p.note||''}</td>
        <td style="padding:7px 12px;text-align:right;font-weight:600;color:#16a34a">${fmt$(p.amount)}</td>
      </tr>`).join('');
      return `<div style="margin-top:16px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:8px">Payments Received</div>
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead><tr style="border-bottom:2px solid var(--border)">
            <th style="padding:6px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700">Date</th>
            <th style="padding:6px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700">Method</th>
            <th style="padding:6px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700">Reference</th>
            <th style="padding:6px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700">Note</th>
            <th style="padding:6px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700">Amount</th>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot><tr style="border-top:2px solid var(--border);background:var(--sand)">
            <td colspan="4" style="padding:8px 12px;font-weight:700">Total Received</td>
            <td style="padding:8px 12px;text-align:right;font-weight:700;color:#16a34a">$${totalRec.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
          </tr></tfoot>
        </table>
      </div>`;
    })()}

    <!-- How to Pay section -->
    <div style="margin-top:22px;border:1.5px solid #86efac;border-radius:12px;overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 16px;background:#f0fdf4;border-bottom:1px solid #86efac">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#15803d">How to Pay</span>
        <button onclick="finToggleBankEdit()" style="padding:3px 11px;font-size:11.5px;font-weight:600;color:#15803d;background:#fff;border:1.5px solid #86efac;border-radius:6px;cursor:pointer;font-family:'Jost',sans-serif">Edit</button>
      </div>
      <div style="padding:14px 16px">
        <div id="finBankDisplay" style="font-size:12.5px;font-family:monospace;white-space:pre-wrap;line-height:1.85;color:#1a2332">${(bankDetails||'').trim()||'<span style="color:#a89e94;font-style:italic">No banking instructions added yet — click Edit to add wire, Zelle, or Venmo details.</span>'}</div>
        <textarea id="finBankEdit" style="display:none;width:100%;height:160px;font-family:monospace;font-size:12.5px;border:2px solid #0e9494;border-radius:8px;padding:12px;resize:vertical;outline:none;box-sizing:border-box" placeholder="Enter payment instructions here...
Example:
Wire Transfer:
  Bank Name: Chase Bank
  Account Name: Amansala Inc
  Account #: 123456789
  Routing #: 021000021
  SWIFT: CHASUS33

Zelle: payments@amansala.com
Venmo: @amansala

Please email retreats@amansala.com with your confirmation once payment is sent." onblur="finSaveBankEdit()"></textarea>
      </div>
    </div>`;
  document.getElementById('finFinalPayReq').checked=!!bk.finalPaymentRequested;
  document.getElementById('finFinalPayDate').textContent=bk.finalPaymentDate?'Sent '+fmtDate(bk.finalPaymentDate):'';
  openModal('finModal');
}

function finToggleBankEdit(){
  const d=document.getElementById('finBankDisplay');
  const e=document.getElementById('finBankEdit');
  if(!d||!e)return;
  if(e.style.display==='block'){
    finSaveBankEdit();
  }else{
    e.value=bankDetails||'';
    e.style.display='block';d.style.display='none';e.focus();
  }
}
function finSaveBankEdit(){
  const d=document.getElementById('finBankDisplay');
  const e=document.getElementById('finBankEdit');
  if(!d||!e)return;
  bankDetails=e.value;
  localStorage.setItem('amansala_bank_details',bankDetails);
  // Also keep the main payment modal in sync
  const mainDisplay=document.getElementById('bankDisplay');
  if(mainDisplay)mainDisplay.textContent=bankDetails;
  d.textContent=bankDetails.trim()||'No banking instructions added yet — click Edit to add details.';
  e.style.display='none';d.style.display='block';
}
function finToggleFinalPay(){
  const bk=AppData.bookings.find(b=>b.id===venEditId);if(!bk)return;
  bk.finalPaymentRequested=document.getElementById('finFinalPayReq').checked;
  if(bk.finalPaymentRequested){bk.finalPaymentDate=new Date().toISOString().split('T')[0];}
  else{delete bk.finalPaymentDate;}
  saveAll();venBuild();
  document.getElementById('finFinalPayDate').textContent=bk.finalPaymentDate?'Sent '+fmtDate(bk.finalPaymentDate):'';
  const noteEl=document.getElementById('finPayNoteEl');
  if(noteEl){noteEl.style.display=bk.finalPaymentDate?'block':'none';if(bk.finalPaymentDate)noteEl.textContent='⏳ Final payment requested on '+fmtDate(bk.finalPaymentDate);}
  showToast(bk.finalPaymentRequested?'Final payment request marked.':'Cleared.');
}

// Venue room list copy
function openCopyModal(){
  let text='ROOM LIST\n\n';
  AppData.bookings.filter(b=>b.status!=='cancelled').sort((a,b)=>a.startDate.localeCompare(b.startDate)).forEach(bk=>{
    const rs=getRegsForBk(bk.id);if(!rs.length)return;
    text+=`${(bk.leaderName||bk.retreatName).toUpperCase()} · ${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}\n${'─'.repeat(40)}\n`;
    rs.forEach(r=>{const names=(r.guests||[]).filter(g=>g.name).map(g=>g.name).join(' & ');text+=`  ${r.room.padEnd(8)}${names}\n`;});
    text+='\n';
  });
  document.getElementById('copyModalTitle').textContent='Room List — All Retreats';
  document.getElementById('copyPrev').textContent=text;
  openModal('copyModal');
}


// ===== ROOM CALENDAR =====
function rcBuild(){
  const end=addDays(rcStart,rcShowDays-1);
  document.getElementById('rcRangeLbl').textContent=`${fmtShort(rcStart)} — ${fmtShort(end)}`;
  document.getElementById('rcStartInput').value=fmtISO(rcStart);
  document.getElementById('rcShowSel').value=String(rcShowDays);
  const todayStr=new Date().toISOString().split('T')[0];
  const body=document.getElementById('rcBody');
  body.innerHTML='';
  // Event delegation for empty-cell clicks: bound ONCE to the stable #rcBody container rather
  // than to each individual .g-track element, which gets destroyed and recreated on every
  // rcBuild() call. A per-element listener can silently go missing if a rebuild happens between
  // page load and a real click (e.g. a background data refresh) -- delegation is immune to that.
  if(!body.dataset.rcClickBound){
    body.dataset.rcClickBound='1';
    body.addEventListener('click',e=>{
      const track=e.target.closest('.g-track');if(!track)return;
      if(e.target.closest('.bk')||e.target.closest('.bk-lock'))return;
      rcTrackClick(e,track.dataset.room,track.dataset.rtid,track);
    });
  }

  // Build days
  const days=[];for(let i=0;i<rcShowDays;i++)days.push(addDays(rcStart,i));

  // Month spans
  const mspans=[];let cm=-1,sp=null;
  days.forEach((d,i)=>{const m=d.getMonth(),y=d.getFullYear();if(m!==cm||y!==sp?.year){sp={month:m,year:y,start:i,count:1};mspans.push(sp);cm=m;}else sp.count++;});

  // Header
  const hdr=document.createElement('div');hdr.className='gantt-hdr';
  const mr=document.createElement('div');mr.className='g-hrow';
  const c1=document.createElement('div');c1.className='g-corner';c1.style.width='160px';mr.appendChild(c1);
  const mc=document.createElement('div');mc.className='g-month-cells';
  mspans.forEach(s=>{const w=s.count*36;const el=document.createElement('div');el.className='g-mcell';el.style.cssText=`width:${w}px;min-width:${w}px`;el.textContent=`${MONTHS[s.month]} ${s.year}`;mc.appendChild(el);});
  mr.appendChild(mc);hdr.appendChild(mr);
  const dr=document.createElement('div');dr.className='g-hrow';
  const c2=document.createElement('div');c2.className='g-corner';c2.style.width='160px';dr.appendChild(c2);
  const dc=document.createElement('div');dc.className='g-day-cells';
  days.forEach(d=>{const ds=fmtISO(d),dow=d.getDay();const el=document.createElement('div');el.className='g-dcell'+(ds===todayStr?' today-h':'')+(dow===0||dow===6?' weekend':'');el.innerHTML=`<span class="dd">${d.getDate()}</span><span class="dn">${DSHORT[dow]}</span>`;dc.appendChild(el);});
  dr.appendChild(dc);hdr.appendChild(dr);

  // "Happening now" strip — third header row, right under the date numbers, so it
  // scrolls/stays sticky together with them instead of living outside the grid. Pills
  // are positioned like mini Gantt bars (left/width in _rcRenderTodayLegend), lined up
  // with the day columns in dc above, not just listed in a flex row.
  const lr=document.createElement('div');lr.className='g-hrow';lr.id='rcTodayLegend';lr.style.cssText='display:none;background:#fff;border-bottom:1px solid var(--border);';
  const c3=document.createElement('div');c3.className='g-corner';c3.id='rcTodayLegendLabel';c3.style.cssText='width:160px;min-width:160px;flex-shrink:0;display:flex;align-items:center;padding:0 10px;';lr.appendChild(c3);
  const legendCells=document.createElement('div');legendCells.id='rcTodayLegendCells';legendCells.style.position='relative';lr.appendChild(legendCells);
  hdr.appendChild(lr);

  body.appendChild(hdr);

  const W=rcShowDays*36,startMs=rcStart.getTime();
  let totalRooms=0;
  const occupied=new Array(rcShowDays).fill(0);

  const RC_PROP_COLORS={'AMANSALA':'#e0f2fe','CASA SHANTI':'#e0f7fa','CASA GRANDE':'#fef3c7'};
  let rcLastProp=null;
  AppData.roomTypes.forEach(rt=>{
    totalRooms+=buildUiRoomEntries(rt).length;
    const prop=rt.property||'AMANSALA';
    if(prop!==rcLastProp){
      rcLastProp=prop;
      const ph=document.createElement('div');
      ph.style.cssText=`display:flex;align-items:center;height:28px;background:${RC_PROP_COLORS[prop]||'#f5f5f5'};border-top:1px solid var(--border);padding:0 14px;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#374151;flex-shrink:0`;
      ph.textContent=prop;
      body.appendChild(ph);
    }
    const th=document.createElement('div');th.className='rt-hdr-row';
    const _low=isLowSeason(fmtISO(rcStart));
    const _p1=_low?(rt.price1_low||rt.price1):rt.price1;
    const _p2=_low?(rt.price2_low||rt.price2):rt.price2;
    const _season=_low?' <span style="font-size:10px;background:#dcfce7;color:#15803d;padding:1px 6px;border-radius:99px;font-weight:700">LOW</span>':' <span style="font-size:10px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:99px;font-weight:700">HIGH</span>';
    const uiCount=buildUiRoomEntries(rt).length;
    th.innerHTML=`<div class="rt-hdr-lbl" style="width:160px;min-width:160px"><span class="rc-collapse">▼</span><div class="rt-dot" style="background:${rt.color}"></div><span>${rt.name}</span></div><div class="rt-hdr-track">${uiCount} rooms · ${rt.maxOcc===1?'Private':'up to '+rt.maxOcc+' guests'} · ${rt.maxOcc===1?'$'+_p1:'Solo $'+_p1+' / Sharing $'+_p2}/night${_season}</div>`;
    let collapsed=false;
    th.addEventListener('click',()=>{collapsed=!collapsed;th.querySelector('.rc-collapse').textContent=collapsed?'▶':'▼';body.querySelectorAll('.rcr-'+rt.id).forEach(r=>r.style.display=collapsed?'none':'flex');});
    body.appendChild(th);

    buildUiRoomEntries(rt).flatMap(e=>e.merged?e.physical.map(p=>({display:p,physical:[p],merged:false})):[e]).forEach(entry=>{
      const room=entry.display;
      const rr=document.createElement('div');rr.className=`g-row rcr-${rt.id}`;rr.style.height='44px';
      const lbl=document.createElement('div');lbl.className='g-lbl rc-row-lbl';lbl.style.cssText='width:160px;min-width:160px;flex-direction:column;align-items:flex-start;justify-content:center;gap:1px';
      lbl.innerHTML=`<span style="font-weight:700;font-size:13px">${room}</span><span style="font-size:10px;color:var(--muted);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px">${rt.name}</span>`;rr.appendChild(lbl);
      const track=document.createElement('div');track.className='g-track';track.style.cssText=`width:${W}px;min-width:${W}px`;
      track.dataset.room=entry.physical[0];track.dataset.rtid=rt.id;track.setAttribute('data-droptarget','1');
      track.addEventListener('dragover',e=>{
        if(!rcDragData||rcDragData.rtId!==rt.id||entry.physical.includes(rcDragData.fromRoom))return;
        e.preventDefault();track.classList.add('rc-drag-over');
      });
      track.addEventListener('dragleave',()=>track.classList.remove('rc-drag-over'));
      track.addEventListener('drop',e=>{
        e.preventDefault();track.classList.remove('rc-drag-over');
        if(!rcDragData||rcDragData.rtId!==rt.id)return;
        if(rcDragData.external)rcMoveExternalReservation(rcDragData.reservationID,rcDragData.fromRoom,room,rcDragData.guestName,rcDragData.startDate,rcDragData.endDate);
        else rcMoveRoom(rcDragData.bkId,rcDragData.fromRoom,room);
      });
      track.style.cursor='pointer';

      days.forEach((d,i)=>{if(d.getDate()===1){const gl=document.createElement('div');gl.className='g-gl ms';gl.style.left=i*36+'px';track.appendChild(gl);}if(fmtISO(d)===todayStr){const tl=document.createElement('div');tl.className='g-gl today-l';tl.style.left=(i*36+18)+'px';track.appendChild(tl);}});

      // Show any booking that has blocked this room (registered guest or just blocked).
      // Case-insensitive — room codes are inconsistently cased in real data (Cloudbeds
      // reports rooms uppercase, e.g. "2B", vs this app's usually-lowercase "2b"), and an
      // exact-case match here silently hid a real, currently-checked-in booking from this
      // grid (same root cause just fixed in the Block Rooms modal's conflict check).
      AppData.bookings.filter(bk=>bk.status!=='cancelled'&&entry.physical.some(p=>(bk.blockedRooms||[]).some(r=>r.toLowerCase()===p.toLowerCase()))).forEach(bk=>{
        const bkS=pd(bk.startDate).getTime(),bkE=pd(bk.endDate).getTime();
        const winE=startMs+rcShowDays*DAY_MS;
        if(bkS>=winE||bkE<=startMs)return;
        const cs=Math.max(bkS,startMs),ce=Math.min(bkE,winE);
        const li=Math.round((cs-startMs)/DAY_MS),wi=Math.round((ce-cs)/DAY_MS);
        if(wi<=0)return;
        const st=STATUS[bk.status]||STATUS.requested;
        const pc=bkPaletteColor(bk);
        const regEntry=AppData.regs.find(r=>r.bookingId===bk.id&&entry.physical.includes(r.room));
        // Room Only bookings have no separate guest registration — the leader
        // IS the guest. Once it's past a Soft Hold (Darlene's rule 2026-09-16:
        // confirmed, not on hold), treat it as a real reservation instead of
        // showing "blocked" — spa charge-to-room already matches on leaderName
        // regardless of status, so this just fixes the visual/lock state.
        const isRealRoomOnly=bk.bookingType==='room_only'&&bk.status!=='requested'&&bk.leaderName;
        // A room where every named guest has been cancelled is vacated for
        // Rooms purposes — skip its bar entirely (frees the slot up visually)
        // even though the retreat's own blockedRooms/billing occupancy count
        // is untouched (Jorge's call 2026-09-17: Teachers still shows the
        // cancelled guest + fee; only Rooms should look empty).
        const _namedInRoom=(regEntry?.guests||[]).filter(g=>g.name);
        if(_namedInRoom.length&&_namedInRoom.every(g=>g.cancelled))return;
        const guestNames=regEntry?_namedInRoom.filter(g=>!g.cancelled).map(g=>g.name):(isRealRoomOnly?[bk.leaderName]:[]);
        const hasGuest=guestNames.length>0;
        const bl=document.createElement('div');
        bl.className='bk'+(st.dash||!hasGuest?' dashed':'');
        // Room Only (direct/OTA/Cloudbeds-import) bookings get a dashed
        // outline around the whole box on top of their own color family — a
        // color alone can look close enough to a retreat's hash color to
        // cause confusion; the outline makes "not a retreat" unmistakable at
        // a glance (Darlene's ask 2026-09-17).
        const roomOnlyOutline=bk.bookingType==='room_only'?`outline:2px dashed ${pc.border};outline-offset:-2px;`:'';
        // The lock protects a reservation from the AUTOMATED optimizer
        // (room-optimizer.js honors bk.roomLocked as an absolute no-touch
        // rule) — it was never meant to stop a staff member from personally
        // choosing to drag it, so manual dragging here ignores it (Darlene's
        // call 2026-09-17: "if we move it here we should be able to move it").
        bl.style.cssText=`left:${li*36+2}px;width:${wi*36-4}px;top:5px;height:34px;background:${pc.bg};border-color:${pc.border};color:${pc.text};cursor:grab;border-left:4px solid ${st.border};${roomOnlyOutline}`;
        bl.draggable=true;
        // Never show retreat/leader name and guest name together on a room row
        // — the retreat is already identifiable via color + the Active in
        // This View strip above. A room with a named guest shows only that
        // guest's name; an unassigned-but-blocked room still shows the
        // retreat name (there's no guest name to pair it with) plus "blocked".
        const roomOnlyIcon=bk.bookingType==='room_only'?'🏨 ':'';
        bl.innerHTML=`<span class="bk-lock" title="${bk.roomLocked?'Locked — the Straightline optimizer will never move this (click to unlock). You can still drag it yourself.':'Click to lock — protects this from the Straightline optimizer, not from you dragging it'}" onclick="event.stopPropagation();bkToggleLock('${bk.id}')" style="cursor:pointer;margin-right:4px;opacity:${bk.roomLocked?'1':'.35'}">${bk.roomLocked?'🔒':'🔓'}</span>`
          +(hasGuest?`<span class="bk-n">${roomOnlyIcon}${guestNames[0]}</span>`:`<span class="bk-n">${roomOnlyIcon}${bk.leaderName||bk.retreatName}</span><span class="bk-s" style="opacity:.5;font-style:italic">blocked</span>`);
        bl.addEventListener('dragstart',e=>{
          rcDragData={bkId:bk.id,fromRoom:room,rtId:rt.id};
          e.dataTransfer.effectAllowed='move';
          e.dataTransfer.setData('text/plain',JSON.stringify(rcDragData));
          setTimeout(()=>bl.classList.add('rc-dragging'),0);
        });
        bl.addEventListener('dragend',()=>{bl.classList.remove('rc-dragging');rcDragData=null;});
        bl.addEventListener('mouseenter',e=>showNoteTip(e,bk,regEntry?.notes));bl.addEventListener('mousemove',moveTip);bl.addEventListener('mouseleave',hideTip);
        bl.addEventListener('click',e=>{
          e.stopPropagation();
          if(regEntry&&hasGuest){openBookingDetailForReg(regEntry.id,guestNames[0]);return;}
          // Room Only bookings (Walk-in/Direct/Bikini Bootcamp/Restore & Renew/OTA)
          // have no `reg` at all — they're an in-house guest, not a retreat with a
          // room list — so go straight to their simple folio, same as any other guest.
          // A blocked-but-not-yet-registered retreat room has no folios/folio_items
          // anchor either (that system is keyed by registration_id/booking_request_id),
          // so it falls back to the same simple booking-level folio rather than
          // silently jumping into the Teacher Registration roster.
          openBookingFolio(bk.id);
        });
        track.appendChild(bl);
        for(let i=Math.max(0,li);i<Math.min(rcShowDays,li+wi);i++)occupied[i]++;
      });

      rr.appendChild(track);body.appendChild(rr);
    });
  });

  // Overlay soft-red blocks on physical room tracks when all beds are simultaneously occupied
  const bedToPhysical=new Map();
  AppData.roomTypes.forEach(rt=>{
    if(!BED_RT_IDS.has(rt.id))return;
    buildUiRoomEntries(rt).forEach(e=>{if(e.merged&&e.physical.length>1)bedToPhysical.set(e.display,e.physical);});
  });
  bedToPhysical.forEach((beds,displayName)=>{
    const physTrack=document.querySelector(`[data-room="${CSS.escape(displayName)}"]`);
    if(!physTrack)return;
    const bedOccDays=new Map(); // iso -> Map(bed -> bkId)
    AppData.bookings.filter(bk=>bk.status!=='cancelled').forEach(bk=>{
      beds.forEach(bed=>{
        if(!(bk.blockedRooms||[]).includes(bed))return;
        const bkS=pd(bk.startDate).getTime(),bkE=pd(bk.endDate).getTime();
        days.forEach(d=>{const t=d.getTime();if(t>=bkS&&t<bkE){const iso=fmtISO(d);if(!bedOccDays.has(iso))bedOccDays.set(iso,new Map());bedOccDays.get(iso).set(bed,bk.id);}});
      });
    });
    let rs=-1;
    const flush=i=>{
      if(rs<0)return;
      const bl=document.createElement('div');
      bl.style.cssText=`position:absolute;left:${rs*36+2}px;width:${(i-rs)*36-4}px;top:5px;height:34px;background:rgba(220,38,38,0.10);border:1.5px dashed rgba(220,38,38,0.35);border-left:4px solid rgba(220,38,38,0.45);border-radius:4px;pointer-events:none;`;
      bl.title=`Habitación completa (${beds.join(' + ')} ocupadas)`;
      physTrack.appendChild(bl);rs=-1;
    };
    days.forEach((d,i)=>{
      const iso=fmtISO(d);
      const occ=bedOccDays.get(iso);
      // Only flag "full" when the two bed halves belong to DIFFERENT
      // bookings (a genuine split/roommate double) — a single retreat's own
      // whole-room hold already shows its own named box at this room, so
      // this overlay was just a redundant, unlabeled duplicate of it on top
      // (Darlene's report 2026-09-17: reading as "blocked" with no
      // explanation over rooms another retreat already legitimately has).
      const full=occ&&occ.size>=beds.length&&new Set(occ.values()).size>1;
      if(full&&rs<0)rs=i;else if(!full)flush(i);
    });
    flush(days.length);
  });

  // Avail row
  const ar=document.createElement('div');ar.style.cssText='display:flex;height:28px;background:var(--sand);border-top:2px solid var(--border);position:sticky;bottom:0;z-index:40;';
  const al=document.createElement('div');al.style.cssText='width:160px;min-width:160px;flex-shrink:0;position:sticky;left:0;z-index:50;background:#ede9e1;border-right:2px solid var(--border);display:flex;align-items:center;padding:0 10px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);';al.textContent='Avail';ar.appendChild(al);
  const acells=document.createElement('div');acells.style.display='flex';
  let totAvail=0;
  days.forEach((_,i)=>{const occ=occupied[i],avail=totalRooms-occ;totAvail+=avail;const cl=avail===0?'av-full':avail<=totalRooms*.3?'av-high':'av-low';const c=document.createElement('div');c.className=`av-cell ${cl}`;c.textContent=avail;acells.appendChild(c);});
  ar.appendChild(acells);body.appendChild(ar);
  document.getElementById('rcAvailBar').innerHTML=`<strong>${totalRooms}</strong> total rooms &nbsp;·&nbsp; <strong>${rcShowDays}</strong> days &nbsp;·&nbsp; Avg avail: <strong>${Math.round(totAvail/rcShowDays)}</strong>/day`;
  localStorage.setItem('amansala_cal_start',fmtISO(rcStart));localStorage.setItem('amansala_cal_show',String(rcShowDays));
  _rcRenderTodayLegend();
  rcFetchExternalReservations(startMs);
}

// Color-coded strip of whichever retreats overlap the date range the grid is
// CURRENTLY SCROLLED TO (updates as you navigate) — same colors as their bars in
// the grid below, so the two stay visually consistent.
// Lightweight tooltip for the room-grid bars — name + this room's own
// registration note (the same "Notes" field editable on the booking-detail
// modal, reg.notes) only, none of showTip()'s balance/registered/flags
// detail (Jorge's call 2026-09-15: that detail belongs in "Happening now"
// above, not per-room — and the note must be the room-specific one, not
// the retreat-wide bk.notes).
function showNoteTip(e,bk,regNotes){
  if(!regNotes){hideTip();return;}
  tip.innerHTML=`<div class="tip-n">${bk.leaderName||bk.retreatName||''}</div><div style="margin-top:4px;font-size:10.5px;color:#fde68a">📝 ${escHtml(regNotes)}</div>`;
  tip.classList.add('show');moveTip(e);
}

function _rcRenderTodayLegend(){
  const el=document.getElementById('rcTodayLegend');const cells=document.getElementById('rcTodayLegendCells');
  const lbl=document.getElementById('rcTodayLegendLabel');
  if(!el||!cells||!lbl)return;
  const winStartMs=rcStart.getTime(),winEndMs=winStartMs+rcShowDays*DAY_MS;
  const winStartStr=fmtISO(rcStart),winEndStr=fmtISO(new Date(winEndMs));
  const todayStr=fmtISO(new Date());
  const isTodayInView=todayStr>=winStartStr&&todayStr<winEndStr;
  // Room Only bookings belong on the physical Room Calendar grid below, not
  // this retreat-level summary strip — Darlene's call 2026-09-14. bookingType
  // alone isn't reliable (only 1 of 126 bookings in prod actually has it set
  // to 'room_only' — most individual bookings predate that field), so also
  // treat pax<=1 as room-only: confirmed 2026-09-15 every pax=1 booking in
  // prod is a single-guest booking, never a genuine solo-leader retreat.
  const active=AppData.bookings.filter(bk=>bk.status!=='cancelled'&&bk.bookingType!=='room_only'&&(bk.pax||0)>1&&bk.startDate&&bk.endDate&&bk.startDate<winEndStr&&bk.endDate>winStartStr);
  if(!active.length){el.style.display='none';cells.innerHTML='';cells.style.height='';return;}
  active.sort((a,b)=>a.startDate.localeCompare(b.startDate));

  // Lane assignment so overlapping retreats stack instead of colliding — same
  // approach venBuild() already uses for its per-row bars.
  const lanes=[];const bkLane=new Map();
  active.forEach(bk=>{
    let lane=-1;
    for(let i=0;i<lanes.length;i++){
      if(lanes[i].every(o=>!(bk.startDate<o.endDate&&bk.endDate>o.startDate))){lane=i;break;}
    }
    if(lane===-1){lane=lanes.length;lanes.push([]);}
    lanes[lane].push({startDate:bk.startDate,endDate:bk.endDate});
    bkLane.set(bk.id,lane);
  });
  const LANE_H=24;
  el.style.display='flex';
  lbl.innerHTML=`<span class="rc-collapse" id="rcTodayLegendChevron" style="margin-right:6px">${_rcLegendCollapsed()?'▶':'▼'}</span><span>${isTodayInView?'Happening now':'Active in this view'}</span>`;
  lbl.style.cursor='pointer';
  lbl.onclick=_rcToggleLegend;
  cells.style.height=(lanes.length*LANE_H)+'px';
  cells.innerHTML=active.map(bk=>{
    const bkS=Math.max(pd(bk.startDate).getTime(),winStartMs);
    const bkE=Math.min(pd(bk.endDate).getTime(),winEndMs);
    const li=Math.round((bkS-winStartMs)/DAY_MS);
    const wi=Math.max(1,Math.round((bkE-bkS)/DAY_MS));
    const lane=bkLane.get(bk.id)||0;
    const pc=bkPaletteColor(bk);
    const name=bk.leaderName||bk.retreatName||'—';
    const regCount=registeredCount(bk.id);
    const roomOnlyOutline=bk.bookingType==='room_only'?`outline:1.5px dashed ${pc.border};outline-offset:-2px;`:'';
    const roomOnlyIcon=bk.bookingType==='room_only'?'🏨 ':'';
    return `<span class="rtl-pill" data-bk-id="${bk.id}" onclick="_bdGoToRegistration('${bk.id}')" style="position:absolute;display:flex;align-items:center;left:${li*36+1}px;width:${wi*36-2}px;top:${lane*LANE_H+1}px;height:${LANE_H-3}px;background:${pc.bg};border-color:${pc.border};color:${pc.text};overflow:hidden;white-space:nowrap;text-overflow:ellipsis;justify-content:flex-start;box-sizing:border-box;${roomOnlyOutline}">${roomOnlyIcon}${escHtml(name)}<span style="margin-left:5px;font-size:9.5px;font-weight:800;opacity:.7;flex-shrink:0">${regCount}</span></span>`;
  }).join('');
  // Same rich showTip popup (Total/Paid/Owing, Registered, sold-out flags,
  // notes) the grid bars below already use — this strip only had a plain
  // title= tooltip before.
  cells.querySelectorAll('.rtl-pill').forEach(pill=>{
    const bk=AppData.bookings.find(b=>b.id===pill.dataset.bkId);
    if(!bk)return;
    pill.addEventListener('mouseenter',e=>showTip(e,bk));
    pill.addEventListener('mousemove',moveTip);
    pill.addEventListener('mouseleave',hideTip);
  });
  _rcApplyLegendCollapse();
}
// Collapsed by default (anything but an explicit '0' counts as collapsed) —
// gives the calendar grid more room out of the box. Persisted so it survives
// Prev/Next/Today navigation and page reloads, same amansala_* localStorage
// convention as the calendar's own view-window persistence just above.
function _rcLegendCollapsed(){return localStorage.getItem('amansala_legend_collapsed')!=='0';}
function _rcApplyLegendCollapse(){
  const cells=document.getElementById('rcTodayLegendCells');
  const chevron=document.getElementById('rcTodayLegendChevron');
  if(!cells)return;
  const collapsed=_rcLegendCollapsed();
  cells.style.display=collapsed?'none':'';
  if(chevron)chevron.textContent=collapsed?'▶':'▼';
}
function _rcToggleLegend(){
  localStorage.setItem('amansala_legend_collapsed',_rcLegendCollapsed()?'0':'1');
  _rcApplyLegendCollapse();
}

// Bumped on every call so a slow/late-resolving fetch can tell it's been
// superseded by a newer window (Prev/Next/Today navigated again before this
// one finished) and bail instead of drawing its bars — positioned using ITS
// OWN startMs — into whatever tracks happen to be on screen by the time it
// resolves. Without this, navigating the calendar while a fetch is still in
// flight left stale-window bars (correct date label, wrong pixel position)
// scattered across the currently-visible months.
let rcExtReqSeq=0;
// Cloudbeds has no server-side cache for this and routinely takes 15-25s to
// respond — with rcBuild() clearing every box before this resolved, every
// click/move that triggered a rebuild made every grey (external/unlinked)
// reservation visibly vanish for that whole window, then reappear once the
// slow fetch finally came back (real reports 2026-09-17: Piper, Karin,
// Shannon's extra night, Molly Morgan all "going missing" this way —
// they're guests only identifiable via one of these grey boxes). Rendering
// from the last-known `externalReservations` immediately, before kicking
// off a fresh fetch to replace it, means something is always on screen.
function rcRenderExternalReservations(reservations,startMs){
  const portalResIds=new Set();
  AppData.bookings.forEach(bk=>Object.values(bk.cbReservationIds||{}).forEach(id=>{if(id)portalResIds.add(String(id));}));
  const allTracks=[...document.querySelectorAll('[data-room]')];
  const trackNames=allTracks.map(t=>t.getAttribute('data-room'));
  allTracks.forEach(t=>t.querySelectorAll('.bk[data-ext="1"]').forEach(el=>el.remove()));
  (reservations||[]).forEach(r=>{
    if(portalResIds.has(String(r.reservationID)))return;
    const rS=pd(r.startDate).getTime(),rE=pd(r.endDate).getTime();
    const winE=startMs+rcShowDays*DAY_MS;
    if(rS>=winE||rE<=startMs)return;
    const cs=Math.max(rS,startMs),ce=Math.min(rE,winE);
    const li=Math.round((cs-startMs)/DAY_MS),wi=Math.round((ce-cs)/DAY_MS);
    if(wi<=0)return;
    // A Cloudbeds reservation for a guest ALREADY registered in a real
    // portal retreat (just never linked via cbReservationIds) should render
    // as part of that retreat and be clickable to actually join it, not show
    // as a disconnected grey "import as new booking" block (Darlene's ask
    // 2026-09-16 — Penelope/Karin, guests within Shannon Jamail's retreat).
    const match=rcKnownGuestMatch(r.guestName);
    (r.rooms||[]).forEach(roomName=>{
      const track=allTracks.find(t=>t.getAttribute('data-room').toLowerCase()===roomName.toLowerCase());
      if(!track){console.warn('[rcExternal] no track for room:',roomName,'available:',trackNames);return;}
      const bl=document.createElement('div');
      bl.className='bk';
      bl.setAttribute('data-ext','1');
      // Draggable straight to a different room, same as a portal booking —
      // a raw Cloudbeds reservation (typically a guest's extra night booked
      // separately from their real retreat) needing to move doesn't require
      // linking/importing it first (Darlene's ask 2026-09-17: "I need to be
      // able to move these"). Moves the reservation directly in Cloudbeds;
      // no portal booking record exists for it to update.
      bl.draggable=true;
      const extRt=AppData.roomTypes.find(t=>(t.rooms||[]).includes(roomName));
      bl.addEventListener('dragstart',e=>{
        rcDragData={external:true,reservationID:r.reservationID,fromRoom:roomName,rtId:extRt?.id||null,guestName:r.guestName,startDate:r.startDate,endDate:r.endDate};
        e.dataTransfer.effectAllowed='move';
        setTimeout(()=>bl.classList.add('rc-dragging'),0);
      });
      bl.addEventListener('dragend',()=>{bl.classList.remove('rc-dragging');rcDragData=null;});
      // Small cancel button on every raw-Cloudbeds box (matched or not) so an
      // erroneous/duplicate reservation (e.g. Connie Smith's CH4 extra-night
      // booking, 2026-09-17) can be cancelled straight from the calendar
      // instead of having to go into Cloudbeds itself.
      const cancelBtn=document.createElement('span');
      cancelBtn.textContent='✕';
      cancelBtn.title='Cancel this reservation in Cloudbeds';
      cancelBtn.style.cssText='position:absolute;top:1px;right:2px;font-size:10px;font-weight:700;line-height:1;padding:2px 3px;border-radius:3px;cursor:pointer;background:rgba(255,255,255,.55);z-index:2;';
      cancelBtn.addEventListener('click',(ev)=>rcCancelExternalReservation(r,roomName,ev));
      if(match){
        const pal=RETREAT_PALETTE[getRetreatColorIdx(match.bk)];
        const label=match.bk.leaderName||match.bk.retreatName||'';
        bl.style.cssText=`left:${li*36+2}px;width:${wi*36-4}px;top:5px;height:34px;background:${pal.bg};border-color:${pal.border};color:${pal.text};border-left:4px solid ${pal.border};cursor:pointer;pointer-events:auto;position:relative;`;
        bl.title=`${r.guestName} · matches ${label} · click to link this room to their booking`;
        bl.innerHTML=`<span class="bk-n">${r.guestName}</span><span class="bk-s" style="opacity:.75">${label}</span>`;
        bl.addEventListener('click',()=>linkExternalReservationToBooking(r,match.bk.id,roomName));
      } else {
        bl.style.cssText=`left:${li*36+2}px;width:${wi*36-4}px;top:5px;height:34px;background:repeating-linear-gradient(45deg,#d0d0d0,#d0d0d0 4px,#eaeaea 4px,#eaeaea 8px);border-color:#aaa;color:#444;border-left:4px solid #888;cursor:pointer;pointer-events:auto;position:relative;`;
        bl.title=`${r.guestName} · ${r.sourceName||r.status} · ${r.startDate} – ${r.endDate} · click to add a charge`;
        bl.innerHTML=`<span class="bk-n" style="color:#444">${r.guestName}</span><span class="bk-s" style="color:#666;opacity:.9">${fmtShort(pd(r.startDate))} – ${fmtShort(pd(r.endDate))}</span>`;
        bl.addEventListener('click',()=>importExternalReservation(r));
      }
      bl.appendChild(cancelBtn);
      track.appendChild(bl);
    });
  });
}
async function rcFetchExternalReservations(startMs){
  const mySeq=++rcExtReqSeq;
  // Show whatever we already have instantly instead of leaving every grey
  // box blank while Cloudbeds is slow to respond.
  if(externalReservations?.length)rcRenderExternalReservations(externalReservations,startMs);
  const startDate=fmtISO(new Date(startMs));
  const endDate=fmtISO(new Date(startMs+rcShowDays*DAY_MS));
  let data;
  try{
    const resp=await fetch('/.netlify/functions/cloudbeds?action=getExternalReservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({startDate,endDate})});
    data=await resp.json();
  }catch(e){console.warn('[rcExternal] fetch error',e);return;}
  if(mySeq!==rcExtReqSeq)return; // superseded by a newer window while this was in flight
  if(!data?.success){console.warn('[rcExternal]',data?.error);return;}
  externalReservations=data.reservations||[];
  rcRenderExternalReservations(externalReservations,startMs);
}
// Cancels a raw Cloudbeds-only reservation straight from the Room Calendar —
// e.g. an erroneous or duplicate extra-night booking that should never have
// been made. This talks to Cloudbeds directly (there's no portal booking to
// clean up — it was never linked/imported), so it's irreversible from here;
// confirm() makes that explicit before it fires.
function rcCancelExternalReservation(r,roomName,ev){
  if(ev)ev.stopPropagation();
  if(!confirm(`Cancel ${r.guestName}'s Cloudbeds reservation for room ${roomName} (${fmtDate(r.startDate)} – ${fmtDate(r.endDate)})?\n\nThis cancels it directly in Cloudbeds and cannot be undone from here.`))return;
  fetch('/.netlify/functions/cloudbeds?action=cancelReservation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reservationId:r.reservationID})})
    .then(res=>res.json())
    .then(d=>{
      if(!d?.success){showToast('Could not cancel in Cloudbeds — try again.');console.warn('[rcCancel]',d);return;}
      showToast(`Cancelled ✓ — ${roomName} reservation removed from Cloudbeds.`);
      rcBuild();
    })
    .catch(e=>{console.warn('[rcCancel]',e);showToast('Could not reach Cloudbeds — try again.');});
}

// Matches a Cloudbeds guest name against every leader name and registered
// guest name already in the portal (for a non-cancelled booking), so a
// reservation Cloudbeds knows about but the portal hasn't linked yet
// (cbReservationIds missing that room) can still be recognized as belonging
// to a real retreat instead of looking like a brand-new, unrelated walk-in.
function rcKnownGuestMatch(guestName){
  // Strip parenthetical nicknames ("Kathryn (Katie) Stevenson" -> "Kathryn
  // Stevenson") before comparing, or a name Cloudbeds annotated that way
  // never matches the portal's plain version of it (real gap found
  // 2026-09-16 while chasing this down).
  const clean=s=>(s||'').replace(/\([^)]*\)/g,' ').replace(/\s+/g,' ').toLowerCase().trim();
  const norm=clean(guestName);
  if(!norm)return null;
  for(const bk of AppData.bookings){
    if(bk.status==='cancelled')continue;
    // Check the retreat name too, not just the leader's personal name — a
    // Cloudbeds reservation is sometimes tagged with the retreat's name
    // ("... De La Sol Retreat") rather than who's actually on it.
    for(const candidate of [bk.leaderName,bk.retreatName]){
      if(!candidate)continue;
      const ln=clean(candidate);
      if(ln&&(norm.includes(ln)||ln.includes(norm)))return{bk};
    }
  }
  for(const reg of AppData.regs){
    const bk=AppData.bookings.find(b=>b.id===reg.bookingId);
    if(!bk||bk.status==='cancelled')continue;
    for(const g of(reg.guests||[])){
      if(!g.name)continue;
      const gn=clean(g.name);
      if(gn&&(norm.includes(gn)||gn.includes(norm)))return{bk,room:reg.room};
    }
  }
  return null;
}
// ── CLOUDBEDS LINK CHECKER — bulk version of the single-room-click linking
// above. Scans every non-cancelled booking's full date span (not just
// whatever's currently scrolled into view on the Room Calendar) for
// Cloudbeds reservations that match a known guest but were never linked,
// and lets staff review/link them all in one pass instead of stumbling on
// each one individually as a grey block (Darlene's ask 2026-09-16 — this
// mis-linking was causing problems in several places, not just display).
let _rclMatches=[];
async function rclOpen(){
  openModal('rclModal');
  const statusEl=document.getElementById('rclStatus'),resultsEl=document.getElementById('rclResults'),linkAllBtn=document.getElementById('rclLinkAllBtn');
  statusEl.textContent='Scanning…';resultsEl.innerHTML='';linkAllBtn.style.display='none';
  _rclMatches=[];

  const activeBks=AppData.bookings.filter(b=>b.status!=='cancelled'&&b.startDate&&b.endDate);
  if(!activeBks.length){statusEl.textContent='No active bookings to check.';return;}
  const minStart=activeBks.reduce((m,b)=>b.startDate<m?b.startDate:m,activeBks[0].startDate);
  const maxEnd=activeBks.reduce((m,b)=>b.endDate>m?b.endDate:m,activeBks[0].endDate);
  const startDate=fmtISO(addDays(pd(minStart),-1));
  const endDate=maxEnd;

  const portalResIds=new Set();
  AppData.bookings.forEach(bk=>Object.values(bk.cbReservationIds||{}).forEach(id=>{if(id)portalResIds.add(String(id));}));

  let data;
  try{
    const resp=await fetch('/.netlify/functions/cloudbeds?action=getExternalReservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({startDate,endDate})});
    data=await resp.json();
  }catch(e){statusEl.textContent='Could not reach Cloudbeds — try again.';return;}
  if(!data?.success){statusEl.textContent='Cloudbeds error: '+(data?.error||'unknown');return;}

  const seen=new Set();
  (data.reservations||[]).forEach(r=>{
    if(portalResIds.has(String(r.reservationID))||seen.has(r.reservationID))return;
    const match=rcKnownGuestMatch(r.guestName);
    if(!match)return;
    seen.add(r.reservationID);
    (r.rooms||[]).forEach(room=>_rclMatches.push({r,bk:match.bk,room}));
  });

  if(!_rclMatches.length){statusEl.textContent='✓ No mis-linked reservations found — everything checks out.';return;}
  statusEl.textContent=`Found ${_rclMatches.length} room${_rclMatches.length!==1?'s':''} to link:`;
  linkAllBtn.style.display='inline-flex';
  rclRenderResults();
}
function rclRenderResults(){
  const el=document.getElementById('rclResults'),statusEl=document.getElementById('rclStatus'),linkAllBtn=document.getElementById('rclLinkAllBtn');
  if(!_rclMatches.length){el.innerHTML='';linkAllBtn.style.display='none';statusEl.textContent='✓ All linked.';return;}
  el.innerHTML=_rclMatches.map((m,i)=>`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:9px;margin-bottom:8px">
      <div style="font-size:13px">
        <b>${escHtml(m.r.guestName)}</b> · Room ${escHtml(m.room)}
        <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${escHtml(m.bk.leaderName||m.bk.retreatName||'')} · ${fmtDate(m.r.startDate)} – ${fmtDate(m.r.endDate)}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="rclLinkOne(${i})">Link</button>
    </div>`).join('');
}
function _rclApplyLink(m){
  const bk=m.bk;
  // A room can have TWO separate back-to-back Cloudbeds reservations (e.g.
  // an extra night tacked onto the end of a stay) — cbReservationIds only
  // stores one ID per room, so blindly overwriting an existing different ID
  // silently orphans whichever reservation was linked before (real incident
  // 2026-09-16: Susan McClelland's extra night overwrote the link to her
  // main 5-night stay in the same room). Skip instead of clobbering; these
  // need a manual decision, not an automatic one.
  if(bk.cbReservationIds&&bk.cbReservationIds[m.room]&&bk.cbReservationIds[m.room]!==m.r.reservationID){
    showToast(`Skipped ${m.room} — it's already linked to a different Cloudbeds reservation (likely a separate night). Ask Claude to help merge these.`);
    return;
  }
  if(!bk.blockedRooms)bk.blockedRooms=[];
  if(!bk.blockedRooms.includes(m.room))bk.blockedRooms.push(m.room);
  if(!bk.cbReservationIds)bk.cbReservationIds={};
  bk.cbReservationIds[m.room]=m.r.reservationID;
  bk.blockedRoomsUpdatedAt=new Date().toISOString();
  logActivity('Cloudbeds reservation linked',`${m.r.guestName} · ${m.room} → ${bk.leaderName||bk.retreatName}`,bk.id);
}
function rclLinkOne(i){
  const m=_rclMatches[i];if(!m)return;
  _rclApplyLink(m);
  _rclMatches.splice(i,1);
  saveAll();venBuild();rcBuild();
  rclRenderResults();
  showToast('Linked ✓');
}
function rclLinkAll(){
  if(!_rclMatches.length)return;
  if(!confirm(`Link all ${_rclMatches.length} matched rooms to their retreats?`))return;
  _rclMatches.forEach(_rclApplyLink);
  const n=_rclMatches.length;
  _rclMatches=[];
  saveAll();venBuild();rcBuild();
  rclRenderResults();
  showToast(`Linked ${n} room${n!==1?'s':''} ✓`);
}
// Links a matched Cloudbeds reservation's room into the existing retreat's
// booking (blockedRooms + cbReservationIds) instead of creating a separate,
// disconnected booking — Darlene's ask 2026-09-16: a guest's room booked
// directly in Cloudbeds should become part of their real retreat here,
// bookable and editable, not sit as an anonymous grey block.
function linkExternalReservationToBooking(r,bkId,roomName){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const label=bk.leaderName||bk.retreatName||'this retreat';
  // Same protection as the bulk Link Checker — a room can have two separate
  // back-to-back Cloudbeds reservations (e.g. an extra night), and
  // cbReservationIds only stores one ID per room, so overwriting an
  // existing DIFFERENT id here would silently orphan whichever reservation
  // was linked before (real incident 2026-09-16, Susan McClelland's extra
  // night vs. her main stay in room 33).
  if(bk.cbReservationIds&&bk.cbReservationIds[roomName]&&bk.cbReservationIds[roomName]!==r.reservationID){
    // Almost always an extra/extended night booked as its own separate
    // Cloudbeds reservation for the same room (real incidents: Susan
    // McClelland room 33, Connie Smith CH4 2026-09-17) — cbReservationIds
    // can only hold one ID per room, so this can never be "linked" onto
    // ${label}'s booking without overwriting the other reservation. It CAN
    // safely become its own standalone portal booking instead, as long as
    // it doesn't actually overlap ${label}'s dates for this room.
    if(confirm(`${roomName} already has a different Cloudbeds reservation linked to ${label} for overlapping-name dates.\n\nThis looks like a separate extra-night stay for ${r.guestName}, not part of ${label}'s booking. Import it as its own booking instead?`)){
      importExternalReservation(r);
    }
    return;
  }
  if(!confirm(`Link ${r.guestName}'s Cloudbeds reservation (room ${roomName}) to ${label}'s booking?`))return;
  if(!bk.blockedRooms)bk.blockedRooms=[];
  if(!bk.blockedRooms.includes(roomName))bk.blockedRooms.push(roomName);
  if(!bk.cbReservationIds)bk.cbReservationIds={};
  bk.cbReservationIds[roomName]=r.reservationID;
  bk.blockedRoomsUpdatedAt=new Date().toISOString();
  saveAll();venBuild();rcBuild();
  logActivity('Cloudbeds reservation linked',`${r.guestName} · ${roomName} → ${label}`,bkId);
  showToast(`Linked ✓ — ${roomName} is now part of ${label}'s booking.`);
}
// A grey/hatched bar (see rcFetchExternalReservations above) is a reservation
// that lives only in Cloudbeds — no matching guest found anywhere in the
// portal, so it's genuinely unrelated to any existing retreat. Importing it
// as a normal 'room_only' booking (same shape rmSaveNewBooking creates for a
// walk-in) gives it a real folio going forward. Tagging cbReservationIds
// here also makes rcFetchExternalReservations's portalResIds check exclude
// it on the next fetch, so it becomes a normal colored bar instead of
// reappearing grey.
function importExternalReservation(r){
  const room=(r.rooms||[])[0];
  if(!room){showToast('Could not find a room for this reservation — check it in Cloudbeds.');return;}
  // Guard against creating a duplicate/conflicting booking for a room
  // another active portal booking already has for overlapping dates — this
  // is exactly how the Shannon Jamail Group duplicate happened (real
  // incident 2026-09-16): a match should have linked it to her existing
  // retreat instead of importing it as a disconnected new booking.
  const conflict=AppData.bookings.find(other=>other.status!=='cancelled'&&(other.blockedRooms||[]).includes(room)&&datesOverlap(r.startDate,r.endDate,other.startDate,other.endDate));
  // This is a suggestion, not a hard rule — usually the right call IS to
  // link it to that retreat instead, but sometimes the retreat's own
  // blockedRooms entry is the stale/wrong one (e.g. a leftover placeholder)
  // and this reservation is the real one. Staff can see the reason and
  // choose to import anyway rather than being stuck with no path forward
  // (Darlene's ask 2026-09-17 — every block needs a stated reason AND a way
  // to override it).
  if(conflict&&!confirm(`Room ${room} is already part of ${conflict.leaderName||conflict.retreatName}'s booking for overlapping dates — this usually means it should be linked to that retreat instead (try "Check Cloudbeds Links").\n\nImport it as its own separate booking anyway?`))return;
  if(!confirm(`Import ${r.guestName}'s Cloudbeds reservation (room ${room}) into the portal so you can add charges to it?`))return;
  const rt=AppData.roomTypes.find(t=>(t.rooms||[]).includes(room));
  const cbReservationIds={};(r.rooms||[]).forEach(rm=>cbReservationIds[rm]=r.reservationID);
  const newId=uid();
  AppData.bookings.push({
    id:newId,bookingType:'room_only',leaderName:r.guestName,leaderEmail:r._email||'',
    retreatName:'Direct/OTA (Cloudbeds)',startDate:r.startDate,endDate:r.endDate,
    row:findAvailableRow(r.startDate,r.endDate,null),pax:1,status:'confirmed',
    docLink:'',roomAssignments:[],roomTypeId:rt?rt.id:'',blockedRooms:r.rooms&&r.rooms.length?r.rooms:[room],
    roomRateTotal:0,roomRateNights:Math.max(1,Math.round((pd(r.endDate)-pd(r.startDate))/DAY_MS)),
    charges:[],payments:[],cbReservationIds,
    notes:`Imported from Cloudbeds reservation #${r.reservationID}`,
  });
  saveAll();venBuild();rcBuild();
  logActivity('Booking created',`Imported from Cloudbeds — ${r.guestName} · ${room}`,newId);
  showToast('Imported ✓ — you can now add charges to this reservation.');
  openBookingFolio(newId);
}
function bkToggleLock(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  bk.roomLocked=!bk.roomLocked;
  saveAll();venBuild();rcBuild();
  logActivity(bk.roomLocked?'Room locked':'Room unlocked',`${bk.leaderName||bk.retreatName||''} · ${(bk.blockedRooms||[])[0]||''}`,bkId);
  showToast(bk.roomLocked?'Room locked — the Straightline optimizer will not move this 🔒 (you still can, manually)':'Room unlocked');
}
function rcMoveRoom(bkId,fromRoom,toRoom){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  // roomLocked only protects a reservation from the automated Straightline
  // optimizer — it never blocks a staff member manually moving it here
  // (Darlene's call 2026-09-17).
  // Check toRoom not already blocked by another retreat on overlapping dates
  const conflict=AppData.bookings.find(other=>
    other.id!==bkId&&other.status!=='cancelled'&&
    (other.blockedRooms||[]).includes(toRoom)&&
    datesOverlap(bk.startDate,bk.endDate,other.startDate,other.endDate)
  );
  if(conflict){showToast(`Room ${toRoom} is already blocked by ${conflict.leaderName||conflict.retreatName}.`);return;}
  // Swap in blockedRooms
  bk.blockedRooms=(bk.blockedRooms||[]).map(r=>r===fromRoom?toRoom:r);
  // Update any guest reg pointing at fromRoom -- if fromRoom has more than one
  // registration (a stale empty duplicate alongside the real named guest), moving
  // the WRONG one here is exactly how a room move can silently orphan a real
  // guest's registration at the old room label while an empty one "moves" instead.
  const reg=getRegForRoom(bkId,fromRoom);
  if(reg){
    const targetRt=AppData.roomTypes.find(rt=>rt.rooms.includes(toRoom));
    reg.room=toRoom;
    if(targetRt)reg.roomTypeId=targetRt.id;
    reg.customPrice=null;
  }
  // Transfer Cloudbeds IDs to the new room and move the reservation in Cloudbeds
  const _cbResId=(bk.cbReservationIds||{})[fromRoom];
  if(!_cbResId){
    // fromRoom was never pushed to Cloudbeds (e.g. blocked but Save Block/Push to CB
    // hasn't run yet) — the move only happened in portal. Say so instead of silently
    // skipping the Cloudbeds side with no indication at all.
    saveAll();rcBuild();showToast(`Moved ${fromRoom} → ${toRoom} in portal (no Cloudbeds reservation on ${fromRoom} yet — nothing to sync)`);
    return;
  }
  if(_cbResId){
    if(!bk.cbReservationIds)bk.cbReservationIds={};
    bk.cbReservationIds[toRoom]=_cbResId; delete bk.cbReservationIds[fromRoom];
    if(bk.cbAdjustmentIds){bk.cbAdjustmentIds[toRoom]=bk.cbAdjustmentIds[fromRoom]||null;delete bk.cbAdjustmentIds[fromRoom];}
    if(bk.cbGuestIds){bk.cbGuestIds[toRoom]=bk.cbGuestIds[fromRoom]||null;delete bk.cbGuestIds[fromRoom];}
    if(bk.cbNoteIds){bk.cbNoteIds[toRoom]=bk.cbNoteIds[fromRoom]||null;delete bk.cbNoteIds[fromRoom];}
    const _cbCfgMv=JSON.parse(localStorage.getItem('ama_cb_config')||'{}');
    const _cbMappingMv=_cbCfgMv.mapping||[];
    const _mappedMv=_cbMappingMv.find(m=>m.portalRoom===toRoom);
    let _newCbRoomId=_mappedMv?.cbId||cbRoomLookup[toRoom]||null;
    if(!_newCbRoomId){const norm=s=>s.toLowerCase().replace(/\s*-\s*/g,'-');const cbKey=Object.keys(cbRoomLookup).find(k=>norm(k)===norm(toRoom));if(cbKey)_newCbRoomId=cbRoomLookup[cbKey];}
    fetch(`${CLOUDBEDS_PROXY}?action=moveReservationRoom`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({reservationId:_cbResId,newCbRoomId:_newCbRoomId,startDate:bk.startDate,endDate:bk.endDate})
    }).then(r=>r.json()).then(d=>{
      console.log('[CB rcMove]',toRoom,_newCbRoomId,JSON.stringify(d).slice(0,200));
      if(!d?.success)showToast(`⚠ Cuarto movido en portal — verifica Cloudbeds para ${toRoom}`);
      else{
        // Update guest name on the reservation now in toRoom
        const movedReg=getRegForRoom(bk.id,toRoom);
        const movedNames=(movedReg?.guests||[]).filter(g=>g.name).map(g=>g.name.trim());
        const _cbGuestIdMv=(bk.cbGuestIds||{})[toRoom]||null;
        fetch(`${CLOUDBEDS_PROXY}?action=updateReservationGuest`,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({reservationId:_cbResId,guestId:_cbGuestIdMv,roomName:toRoom,startDate:bk.startDate,endDate:bk.endDate,
            guestFirstName:movedNames.join(' & '),groupName:bk.retreatName||bk.row||'',leaderName:bk.leaderName||'',adults:Math.max(1,movedNames.length),dailyRate:0})
        }).then(r=>r.json()).then(nd=>{
          // updateReservationGuest can fall back server-side to cancel+recreate,
          // returning a NEW reservationId — capture it or the next move/sync/push
          // can't find this room and creates a duplicate reservation.
          if(nd.reservationId&&nd.reservationId!==_cbResId){
            bk.cbReservationIds[toRoom]=nd.reservationId;
            if(nd.guestId){if(!bk.cbGuestIds)bk.cbGuestIds={};bk.cbGuestIds[toRoom]=nd.guestId;}
            saveAll();
          }
        }).catch(e=>console.warn('[CB rcMove name]',e));
      }
    }).catch(e=>console.warn('[CB rcMove]',e));
  }
  saveAll();rcBuild();showToast(`Moved ${fromRoom} → ${toRoom}`);
}
// Drag-and-drop move for a raw, unlinked Cloudbeds reservation (see
// rcRenderExternalReservations) — moves it directly in Cloudbeds. There is
// no portal booking record to update; it stays a raw reservation afterward,
// just correctly repositioned (still clickable to link/import, unchanged).
async function rcMoveExternalReservation(reservationID,fromRoom,toRoom,guestName,startDate,endDate){
  if(fromRoom===toRoom)return;
  const conflict=AppData.bookings.find(other=>other.status!=='cancelled'&&(other.blockedRooms||[]).includes(toRoom)&&datesOverlap(startDate,endDate,other.startDate,other.endDate));
  if(conflict){showToast(`Room ${toRoom} is already part of ${conflict.leaderName||conflict.retreatName}'s booking for these dates.`);return;}
  showToast(`Moving ${guestName} to ${toRoom}…`);
  try{
    const cbCfg=JSON.parse(localStorage.getItem('ama_cb_config')||'{}');
    const mapping=(cbCfg.mapping||[]).find(m=>m.portalRoom===toRoom);
    let newCbRoomId=mapping?.cbId||cbRoomLookup?.[toRoom]||null;
    if(!newCbRoomId){
      const norm=s=>s.toLowerCase().replace(/\s*-\s*/g,'-');
      const key=Object.keys(cbRoomLookup||{}).find(k=>norm(k)===norm(toRoom));
      if(key)newCbRoomId=cbRoomLookup[key];
    }
    const resp=await fetch(`${CLOUDBEDS_PROXY}?action=moveReservationRoom`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({reservationId:reservationID,newCbRoomId,newRoomName:toRoom,startDate,endDate})}).then(r=>r.json());
    if(!resp?.success){showToast(`⚠ Cloudbeds could not confirm moving ${guestName} to ${toRoom} — try again.`);return;}
    showToast(`Moved ✓ — ${guestName} is now in room ${toRoom}.`);
    logActivity('Room moved (Cloudbeds-only reservation)',`${guestName}: Room ${fromRoom} → ${toRoom}`,null);
    rcBuild();
  }catch(e){console.warn('[rcMoveExternal]',e);showToast('Could not reach Cloudbeds — try again.');}
}

function rcShift(n){rcStart=addDays(rcStart,n);rcBuild();}
function rcGoToday(){rcStart=new Date();rcStart.setHours(0,0,0,0);rcBuild();}
function rcOnStart(){const v=document.getElementById('rcStartInput').value;if(v)rcStart=pd(v);rcBuild();}
function rcGoToMonth(m){const y=rcStart.getFullYear();rcStart=new Date(y,m,1);rcStart.setHours(0,0,0,0);rcBuild();}
function rcOnShow(){rcShowDays=parseInt(document.getElementById('rcShowSel').value);rcBuild();}

