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

  // Rows
  const LANE_H=48;
  AppData.venRows.forEach(rowName=>{
    const soy=new Date(venYear,0,1),eoy=new Date(venYear,11,31);
    // Pre-compute visible blocks + lane assignment
    const visBks=AppData.bookings.filter(b=>b.row===rowName).map(bk=>{
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
    track.addEventListener('drop',e=>{track.style.background='';const bkId=e.dataTransfer.getData('text/bk-id');if(!bkId)return;e.preventDefault();const tb=AppData.bookings.find(b=>b.id===bkId);if(tb&&tb.row!==rowName){tb.row=rowName;saveAll();venBuild();showToast(`Moved to ${rowName}`);}});
    daysArr.forEach((d,i)=>{if(d.d===1){const gl=document.createElement('div');gl.className='g-gl ms';gl.style.left=i*36+'px';track.appendChild(gl);}if(d.td){const tl=document.createElement('div');tl.className='g-gl today-l';tl.style.left=(i*36+18)+'px';track.appendChild(tl);}});
    visBks.forEach(({bk,li,wi})=>{
      const lane=bkLane.get(bk.id)||0;
      const isInquiry=bk.source==='inquiry'&&bk.status==='requested';
      const st=isInquiry
        ?{label:'Inquiry',bg:'#f3f4f6',border:'#9ca3af',text:'#6b7280',dash:false}
        :(STATUS[bk.status]||STATUS.requested);
      const regCount=registeredCount(bk.id);
      const autoFlags=getAutoFlags(bk);
      const manualFlags=(bk.flags||[]).filter(f=>!f.resolved);
      const hasFlags=autoFlags.length>0||manualFlags.length>0;
      const bl=document.createElement('div');bl.className='bk'+(isInquiry?' inquiry':st.dash?' dashed':'');
      bl.style.cssText=`left:${li*36+2}px;width:${wi*36-4}px;top:${8+lane*LANE_H}px;height:40px;background:${st.bg};border-color:${st.border};color:${st.text};position:absolute;`;
      const fillPct=bk.pax>0?Math.min(100,Math.round(regCount/bk.pax*100)):0;
      const countHtml=!isInquiry&&bk.pax?`<span class="bk-count" style="font-size:10.5px;font-weight:700;background:rgba(0,0,0,.12);border-radius:4px;padding:1px 5px;margin-left:4px">${regCount}/${bk.pax}</span>`:'';
      const transRoster=!isInquiry&&typeof getTransportRoster==='function'?getTransportRoster(bk.id):null;
      const transportHtml=transRoster&&transRoster.roster.length>0?`<span class="bk-transport" title="Transportation: ${transRoster.submittedCount}/${transRoster.roster.length} submitted — ${trCompletionLabel(transRoster.submittedCount,transRoster.roster.length)}" style="font-size:10.5px;font-weight:700;background:rgba(0,0,0,.12);border-radius:4px;padding:1px 5px;margin-left:4px;color:${trCompletionColor(transRoster.submittedCount,transRoster.roster.length)}">🚐 ${transRoster.submittedCount}/${transRoster.roster.length}</span>`:'';
      const flagHtml=hasFlags?`<span class="bk-flag" title="${autoFlags.length+manualFlags.length} flag(s)" onclick="event.stopPropagation();openFlagsModal('${bk.id}')">🚩</span>`:'';
      const stBadge=isInquiry
        ?`<span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;background:#e5e7eb;color:#6b7280;border-radius:3px;padding:1px 5px;margin-left:6px">Inquiry</span>`
        :`<span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;opacity:.75;margin-left:5px">${st.label}</span>`;
      const finBadge=bk.finalPaymentRequested?`<span title="Final payment requested" style="font-size:9.5px;background:rgba(0,0,0,.15);border-radius:3px;padding:1px 5px;margin-left:3px;font-weight:700">$</span>`:'';
      const bkTd=!bk.teacherDiscountDisabled?calcTeacherDiscount(bk,AppData.regs.filter(r=>r.bookingId===bk.id)):null;
      const discBadge=bkTd&&bkTd.tiers.some(t=>t.earned)?`<span title="Teacher discount earned — $${bkTd.totalCredit.toLocaleString()} credit" style="font-size:9px;font-weight:700;background:#16a34a;color:#fff;border-radius:3px;padding:1px 5px;margin-left:3px">★ DISC</span>`:'';
      bl.innerHTML=`<span class="bk-n">${bk.leaderName||bk.retreatName}</span>${stBadge}<span class="bk-s">${bk.retreatName&&bk.leaderName?bk.retreatName:''}</span>${countHtml}${transportHtml}${finBadge}${discBadge}<span style="flex:1"></span>${flagHtml}`;
      if(bk.pax&&fillPct>0){const bar=document.createElement('div');bar.style.cssText=`position:absolute;bottom:0;left:0;height:3px;width:${fillPct}%;background:${st.border};opacity:.6;border-radius:0 0 4px 4px;`;bl.appendChild(bar);}
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
  // Populate row filter
  const rSel=document.getElementById('dfRow');
  rSel.innerHTML='<option value="">All rows</option>';
  AppData.venRows.forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent=r;rSel.appendChild(o);});
  dfBuild();
}

function dfBuild(){
  const month=parseInt(document.getElementById('dfMonth').value);
  const year=parseInt(document.getElementById('dfYear').value);
  const rowFilter=document.getElementById('dfRow').value;
  const durations=Array.from(document.querySelectorAll('#tab-datefinder .df-dur-checks input:checked')).map(cb=>parseInt(cb.value));
  if(!durations.length){document.getElementById('dfResults').innerHTML='<div class="df-no-gaps">Select at least one duration above.</div>';return;}

  // Search window: 3 months centered on selected month (give context either side)
  const winStart=new Date(year,month,1);
  const winEnd=new Date(year,month+1,0); // last day of selected month

  const rows=rowFilter?[rowFilter]:AppData.venRows;
  const container=document.getElementById('dfResults');
  container.innerHTML='';

  let anyResult=false;
  rows.forEach(row=>{
    const rowBks=AppData.bookings
      .filter(b=>b.status!=='cancelled'&&b.row===row&&b.startDate&&b.endDate)
      .sort((a,b)=>a.startDate.localeCompare(b.startDate));

    // Build gap list: look at a wide window (prev month → 2 months after) to catch edge gaps
    const scanStart=new Date(year,month-1,1);
    const scanEnd=new Date(year,month+2,0);

    // Collect all gap windows not covered by any booking in this row
    const gaps=[];
    let cursor=fmtISO(scanStart);
    rowBks.forEach(bk=>{
      if(bk.startDate>cursor){
        gaps.push({start:cursor,end:bk.startDate,prevBk:null,nextBk:bk});
      }
      if(bk.endDate>cursor) cursor=bk.endDate;
    });
    // Gap after last booking
    const scanEndStr=fmtISO(scanEnd);
    if(cursor<scanEndStr) gaps.push({start:cursor,end:scanEndStr,prevBk:rowBks[rowBks.length-1]||null,nextBk:null});

    // Assign prevBk properly for each gap
    let lastBk=null;
    const gapsWithPrev=[];
    rowBks.forEach(bk=>{
      const g=gaps.find(g=>g.end===bk.startDate);
      if(g)g.prevBk=lastBk;
      lastBk=bk;
    });

    // For each gap, find slots that overlap the selected month and fit requested durations
    const rowSlots=[];
    gaps.forEach(gap=>{
      const gapDays=Math.round((pd(gap.end)-pd(gap.start))/DAY_MS);
      const maxDur=Math.max(...durations);
      if(gapDays<Math.min(...durations))return;

      durations.forEach(nights=>{
        if(gapDays<nights)return;
        // Straight-line start (start of gap = end of prev retreat)
        const slStart=gap.start;
        const slEnd=fmtISO(addDays(pd(slStart),nights));
        // Does this slot overlap the selected month?
        const slStartD=pd(slStart),slEndD=pd(slEnd);
        const mStart=new Date(year,month,1),mEnd=new Date(year,month+1,1);
        if(slStartD>=mEnd||slEndD<=mStart)return;
        const isStraightLinePrev=!!gap.prevBk;
        const isStraightLineNext=gap.nextBk&&slEnd===gap.nextBk.startDate;
        rowSlots.push({nights,start:slStart,end:slEnd,gapDays,prevBk:gap.prevBk,nextBk:gap.nextBk,isStraightLinePrev,isStraightLineNext});
      });
    });

    if(!rowSlots.length)return;
    anyResult=true;

    const card=document.createElement('div');card.className='df-row-card';
    card.innerHTML=`<div class="df-row-hdr">${row}</div>`;

    // Group slots by gap (unique start of gap)
    const gapGroups=new Map();
    rowSlots.forEach(s=>{
      const key=s.start+'|'+s.gapDays;
      if(!gapGroups.has(key))gapGroups.set(key,{gapDays:s.gapDays,prevBk:s.prevBk,nextBk:s.nextBk,slots:[]});
      gapGroups.get(key).slots.push(s);
    });

    gapGroups.forEach(({gapDays,prevBk,nextBk,slots})=>{
      const gapDiv=document.createElement('div');gapDiv.className='df-gap';
      const adjParts=[];
      if(prevBk)adjParts.push(`← ${prevBk.leaderName||prevBk.retreatName} ends ${fmtDate(prevBk.endDate)}`);
      if(nextBk)adjParts.push(`${nextBk.leaderName||nextBk.retreatName} starts ${fmtDate(nextBk.startDate)} →`);
      const adjTxt=adjParts.length?`<span class="df-gap-adj">${adjParts.join(' &nbsp;·&nbsp; ')}</span>`:'<span class="df-gap-adj">No adjacent retreats</span>';
      gapDiv.innerHTML=`<div class="df-gap-meta"><b>${gapDays} nights open</b> ${adjTxt}</div>`;

      const slotsDiv=document.createElement('div');slotsDiv.className='df-slots';
      slots.forEach(s=>{
        const isSL=s.isStraightLinePrev||s.isStraightLineNext;
        // Count retreats on other rows running concurrently with this slot
        const concurrent=AppData.bookings.filter(b=>
          b.status!=='cancelled'&&b.row!==row&&
          datesOverlap(s.start,s.end,b.startDate,b.endDate)
        );
        const concurN=concurrent.length;
        const concurLabel=concurN===0
          ?'<span style="font-size:10px;color:#94a3b8">No other retreats</span>'
          :`<span style="font-size:10px;color:#f59e0b;font-weight:700" title="${concurrent.map(b=>b.leaderName||b.retreatName).join(', ')}">⚑ ${concurN} retreat${concurN>1?'s':''} also booked</span>`;
        const slotEl=document.createElement('div');
        slotEl.className='df-slot '+(isSL?'sl':'nsl');
        slotEl.style.flexDirection='column';slotEl.style.alignItems='flex-start';slotEl.style.gap='3px';
        const rowEsc=row.replace(/'/g,"\\'");
        slotEl.innerHTML=`<div style="display:flex;align-items:center;gap:6px"><span class="df-slot-nights">${s.nights}N</span>`
          +`<span>${fmtDate(s.start)} – ${fmtDate(s.end)}</span>`
          +(isSL?`<span style="font-size:10px;opacity:.75">↔ Straight-line</span>`:'')+'</div>'
          +`<div style="display:flex;align-items:center;gap:10px;padding-left:2px">${concurLabel}`
          +`<button class="df-reserve-btn" onclick="dfOpenReserve('${rowEsc}','${s.start}','${s.end}',${s.nights})">Reserve</button></div>`;
        slotEl.title=`${s.nights}-night retreat: ${fmtDate(s.start)} – ${fmtDate(s.end)}${concurN?'\nAlso booked: '+concurrent.map(b=>b.leaderName||b.retreatName).join(', '):''}`;
        slotsDiv.appendChild(slotEl);
      });
      gapDiv.appendChild(slotsDiv);
      card.appendChild(gapDiv);
    });

    container.appendChild(card);
  });

  if(!anyResult){
    container.innerHTML=`<div class="df-no-gaps">No openings found in ${MONTHS[month]} ${year} for the selected durations and rows.</div>`;
  }
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
    if(!datesOverlap(qrPending.start,qrPending.end,other.startDate,other.endDate))return;
    (other.blockedRooms||[]).forEach(r=>takenRooms.add(r));
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
  // Build taken rooms (exclude this new booking — it doesn't exist yet)
  const takenRooms=new Set();
  AppData.bookings.forEach(other=>{
    if(!datesOverlap(start,end,other.startDate,other.endDate))return;
    (other.blockedRooms||[]).forEach(r=>takenRooms.add(r));
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
function showAvailPreview(id){
  const bk=AppData.bookings.find(b=>b.id===id);
  if(!bk)return;
  const s=bk.startDate,e=bk.endDate;

  // Overlapping bookings (excluding this one and cancelled)
  const overlapping=AppData.bookings.filter(b=>b.id!==id&&b.status!=='cancelled'&&b.startDate<e&&b.endDate>s);
  const takenRooms=new Set();
  overlapping.forEach(b=>(b.blockedRooms||[]).forEach(r=>takenRooms.add(r)));

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

function openVenEdit(id){const bk=AppData.bookings.find(b=>b.id===id);if(!bk)return;venEditId=id;document.getElementById('venModalTitle').textContent='Edit Booking';['venDelBtn','venGoRegBtn','venFinBtn','venCopyRoomsBtn'].forEach(el=>document.getElementById(el).style.display='inline-flex');
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
  Object.assign(bk,{leaderName:lead,retreatName:ret,leaderEmail,leaderPhone,startDate:start,endDate:end,row,pax,status:newStatus,notes,docLink,mealPlan});const savedBkId=venEditId;const savedName=lead||ret;saveAll();closeModal('venModal');venBuild();buildDashboard();logActivity('Booking updated',`${savedName} · ${fmtDate(start)} – ${fmtDate(end)}`,savedBkId);if(prevStatus!==newStatus&&!datesChanged){logActivity('Status changed',`${statusLabel(prevStatus)} → ${statusLabel(newStatus)}`,savedBkId);if(newStatus==='contract_sent'&&prevStatus==='requested')sendTeacherEmail(bk,'dates_accepted');}if(!datesChanged&&prevPax!=pax&&pax>0)logActivity('Pax updated',`${prevPax||'?'} → ${pax} guests`,savedBkId);}else{
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

// Point the Room Calendar at a booking's dates, with 6 days of context before and after
function rcJumpToBooking(bk){
  const pad=6;
  rcStart=addDays(pd(bk.startDate),-pad);
  const spanDays=Math.round((pd(bk.endDate)-pd(bk.startDate))/DAY_MS);
  rcShowDays=spanDays+pad*2+1;
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
  // Find taken rooms from OTHER overlapping bookings (not self, not source)
  const takenRooms=new Set();
  AppData.bookings.forEach(other=>{
    if(other.id===bk.id||other.id===srcId)return;
    if(!datesOverlap(bk.startDate,bk.endDate,other.startDate,other.endDate))return;
    (other.blockedRooms||[]).forEach(r=>takenRooms.add(r));
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
  const takenRooms=new Set();
  AppData.bookings.forEach(other=>{
    if(other.id===bk.id||other.id===srcId)return;
    if(!datesOverlap(bk.startDate,bk.endDate,other.startDate,other.endDate))return;
    (other.blockedRooms||[]).forEach(r=>takenRooms.add(r));
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
  const takenRooms=new Set();
  AppData.bookings.forEach(other=>{
    if(other.id===bk.id)return;
    if(!datesOverlap(bk.startDate,bk.endDate,other.startDate,other.endDate))return;
    (other.blockedRooms||[]).forEach(r=>takenRooms.add(r));
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
  dr.appendChild(dc);hdr.appendChild(dr);body.appendChild(hdr);

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
        rcMoveRoom(rcDragData.bkId,rcDragData.fromRoom,room);
      });

      days.forEach((d,i)=>{if(d.getDate()===1){const gl=document.createElement('div');gl.className='g-gl ms';gl.style.left=i*36+'px';track.appendChild(gl);}if(fmtISO(d)===todayStr){const tl=document.createElement('div');tl.className='g-gl today-l';tl.style.left=(i*36+18)+'px';track.appendChild(tl);}});

      // Show any booking that has blocked this room (registered guest or just blocked)
      AppData.bookings.filter(bk=>bk.status!=='cancelled'&&entry.physical.some(p=>(bk.blockedRooms||[]).includes(p))).forEach(bk=>{
        const bkS=pd(bk.startDate).getTime(),bkE=pd(bk.endDate).getTime();
        const winE=startMs+rcShowDays*DAY_MS;
        if(bkS>=winE||bkE<=startMs)return;
        const cs=Math.max(bkS,startMs),ce=Math.min(bkE,winE);
        const li=Math.round((cs-startMs)/DAY_MS),wi=Math.round((ce-cs)/DAY_MS);
        if(wi<=0)return;
        const st=STATUS[bk.status]||STATUS.requested;
        const pc=RETREAT_PALETTE[getRetreatColorIdx(bk.id)];
        const regEntry=AppData.regs.find(r=>r.bookingId===bk.id&&entry.physical.includes(r.room));
        const guestNames=regEntry?(regEntry.guests||[]).filter(g=>g.name).map(g=>g.name):[];
        const hasGuest=guestNames.length>0;
        const bl=document.createElement('div');
        bl.className='bk'+(st.dash||!hasGuest?' dashed':'');
        bl.style.cssText=`left:${li*36+2}px;width:${wi*36-4}px;top:5px;height:34px;background:${pc.bg};border-color:${pc.border};color:${pc.text};cursor:grab;border-left:4px solid ${st.border};`;
        bl.draggable=true;
        bl.innerHTML=`<span class="bk-n">${bk.leaderName||bk.retreatName}</span>`
          +(hasGuest?`<span class="bk-s">${guestNames[0]}</span>`:`<span class="bk-s" style="opacity:.5;font-style:italic">blocked</span>`);
        bl.addEventListener('dragstart',e=>{
          rcDragData={bkId:bk.id,fromRoom:room,rtId:rt.id};
          e.dataTransfer.effectAllowed='move';
          e.dataTransfer.setData('text/plain',JSON.stringify(rcDragData));
          setTimeout(()=>bl.classList.add('rc-dragging'),0);
        });
        bl.addEventListener('dragend',()=>{bl.classList.remove('rc-dragging');rcDragData=null;});
        bl.addEventListener('mouseenter',e=>showTip(e,bk));bl.addEventListener('mousemove',moveTip);bl.addEventListener('mouseleave',hideTip);
        bl.addEventListener('click',()=>{const btn=document.querySelectorAll('.tab-btn')[2];switchTab('teacherreg',btn);setTimeout(()=>regSelectRetreat(bk.id),80);});
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
    const bedOccDays=new Map();
    AppData.bookings.filter(bk=>bk.status!=='cancelled').forEach(bk=>{
      beds.forEach(bed=>{
        if(!(bk.blockedRooms||[]).includes(bed))return;
        const bkS=pd(bk.startDate).getTime(),bkE=pd(bk.endDate).getTime();
        days.forEach(d=>{const t=d.getTime();if(t>=bkS&&t<bkE){const iso=fmtISO(d);if(!bedOccDays.has(iso))bedOccDays.set(iso,new Set());bedOccDays.get(iso).add(bed);}});
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
    days.forEach((d,i)=>{const iso=fmtISO(d);const occ=bedOccDays.get(iso);const full=occ&&occ.size>=beds.length;if(full&&rs<0)rs=i;else if(!full)flush(i);});
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
  rcFetchExternalReservations(startMs);
}

async function rcFetchExternalReservations(startMs){
  const startDate=fmtISO(new Date(startMs));
  const endDate=fmtISO(new Date(startMs+rcShowDays*DAY_MS));
  const portalResIds=new Set();
  AppData.bookings.forEach(bk=>Object.values(bk.cbReservationIds||{}).forEach(id=>{if(id)portalResIds.add(String(id));}));
  let data;
  try{
    const resp=await fetch('/.netlify/functions/cloudbeds?action=getExternalReservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({startDate,endDate})});
    data=await resp.json();
  }catch(e){console.warn('[rcExternal] fetch error',e);return;}
  if(!data?.success){console.warn('[rcExternal]',data?.error);return;}
  externalReservations=data.reservations||[];
  console.log('[rcExternal] reservations received:',data.reservations?.length,'portal excluded:',portalResIds.size);
  if(data.reservations?.length)console.log('[rcExternal] first res sample:',JSON.stringify(data.reservations[0]));
  const allTracks=[...document.querySelectorAll('[data-room]')];
  const trackNames=allTracks.map(t=>t.getAttribute('data-room'));
  console.log('[rcExternal] calendar tracks:',trackNames);
  (data.reservations||[]).forEach(r=>{
    if(portalResIds.has(String(r.reservationID)))return;
    const rS=pd(r.startDate).getTime(),rE=pd(r.endDate).getTime();
    const winE=startMs+rcShowDays*DAY_MS;
    if(rS>=winE||rE<=startMs)return;
    const cs=Math.max(rS,startMs),ce=Math.min(rE,winE);
    const li=Math.round((cs-startMs)/DAY_MS),wi=Math.round((ce-cs)/DAY_MS);
    if(wi<=0)return;
    console.log('[rcExternal] placing',r.reservationID,r.guestName,'rooms:',r.rooms);
    (r.rooms||[]).forEach(roomName=>{
      const track=allTracks.find(t=>t.getAttribute('data-room').toLowerCase()===roomName.toLowerCase());
      if(!track){console.warn('[rcExternal] no track for room:',roomName,'available:',trackNames);return;}
      const bl=document.createElement('div');
      bl.className='bk';
      bl.style.cssText=`left:${li*36+2}px;width:${wi*36-4}px;top:5px;height:34px;background:repeating-linear-gradient(45deg,#d0d0d0,#d0d0d0 4px,#eaeaea 4px,#eaeaea 8px);border-color:#aaa;color:#444;border-left:4px solid #888;cursor:default;pointer-events:auto;`;
      bl.title=`${r.guestName} · ${r.sourceName||r.status} · ${r.startDate} – ${r.endDate}`;
      bl.innerHTML=`<span class="bk-n" style="color:#444">${r.guestName}</span><span class="bk-s" style="color:#666;opacity:.9">${fmtShort(pd(r.startDate))} – ${fmtShort(pd(r.endDate))}</span>`;
      track.appendChild(bl);
    });
  });
}

function rcMoveRoom(bkId,fromRoom,toRoom){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  // Check toRoom not already blocked by another retreat on overlapping dates
  const conflict=AppData.bookings.find(other=>
    other.id!==bkId&&other.status!=='cancelled'&&
    (other.blockedRooms||[]).includes(toRoom)&&
    datesOverlap(bk.startDate,bk.endDate,other.startDate,other.endDate)
  );
  if(conflict){showToast(`Room ${toRoom} is already blocked by ${conflict.leaderName||conflict.retreatName}.`);return;}
  // Swap in blockedRooms
  bk.blockedRooms=(bk.blockedRooms||[]).map(r=>r===fromRoom?toRoom:r);
  // Update any guest reg pointing at fromRoom
  const reg=AppData.regs.find(r=>r.bookingId===bkId&&r.room===fromRoom);
  if(reg){
    const targetRt=AppData.roomTypes.find(rt=>rt.rooms.includes(toRoom));
    reg.room=toRoom;
    if(targetRt)reg.roomTypeId=targetRt.id;
    reg.customPrice=null;
  }
  // Transfer Cloudbeds IDs to the new room and move the reservation in Cloudbeds
  const _cbResId=(bk.cbReservationIds||{})[fromRoom];
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
        const movedReg=AppData.regs.find(r=>r.bookingId===bk.id&&r.room===toRoom);
        const movedNames=(movedReg?.guests||[]).filter(g=>g.name).map(g=>g.name.trim());
        const _cbGuestIdMv=(bk.cbGuestIds||{})[toRoom]||null;
        fetch(`${CLOUDBEDS_PROXY}?action=updateReservationGuest`,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({reservationId:_cbResId,guestId:_cbGuestIdMv,roomName:toRoom,startDate:bk.startDate,endDate:bk.endDate,
            guestFirstName:movedNames.join(' & '),groupName:bk.retreatName||bk.row||'',leaderName:bk.leaderName||'',adults:Math.max(1,movedNames.length),dailyRate:0})
        }).catch(e=>console.warn('[CB rcMove name]',e));
      }
    }).catch(e=>console.warn('[CB rcMove]',e));
  }
  saveAll();rcBuild();showToast(`Moved ${fromRoom} → ${toRoom}`);
}

function rcShift(n){rcStart=addDays(rcStart,n);rcBuild();}
function rcGoToday(){rcStart=new Date();rcStart.setHours(0,0,0,0);rcBuild();}
function rcOnStart(){const v=document.getElementById('rcStartInput').value;if(v)rcStart=pd(v);rcBuild();}
function rcGoToMonth(m){const y=rcStart.getFullYear();rcStart=new Date(y,m,1);rcStart.setHours(0,0,0,0);rcBuild();}
function rcOnShow(){rcShowDays=parseInt(document.getElementById('rcShowSel').value);rcBuild();}

