// ===== sales-pipeline.js — Retreat Sales Pipeline / CRM =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as other modules/*.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.
//
// This is a NEW VIEW LAYER over the existing AppData.bookings records (retreat leads already
// live there — see leader-inquiry.html). It does not replace bk.status or any of the existing
// contract/payment/venue logic; it adds an independent bk.pipelineStage (13-stage Kanban) plus
// a permanent bk.pipelineActivity[] history, computed/added lazily so untouched bookings are
// never batch-rewritten.

// ===== STAGE DEFINITIONS =====
const PIPE_STAGES=[
  {key:'new_inquiry',              label:'New Inquiry'},
  {key:'initial_response_sent',    label:'Initial Response Sent'},
  {key:'engaged_lead',             label:'Engaged Lead'},
  {key:'call_scheduled',           label:'Call Scheduled'},
  {key:'proposal_followup',        label:'Proposal & Follow-Up'},
  {key:'decision_pending',         label:'Decision Pending'},
  {key:'ready_for_contract',       label:'Ready for Contract'},
  {key:'contract_sent',            label:'Contract Sent'},
  {key:'awaiting_signature_deposit',label:'Awaiting Signature & Deposit'},
  {key:'booked',                   label:'Booked'},
  {key:'onboarding_started',       label:'Onboarding Started'},
  {key:'on_hold',                  label:'On Hold'},
  {key:'closed_lost',              label:'Closed—Lost'},
];
// Main line = the 11 forward-progressing stages (excludes the two side-states On Hold /
// Closed-Lost, which are reachable from anywhere and aren't part of the forward order).
const PIPE_MAIN_LINE=PIPE_STAGES.slice(0,11).map(s=>s.key);
function pipeMainIdx(key){return PIPE_MAIN_LINE.indexOf(key);}
function pipeStageLabel(key){return(PIPE_STAGES.find(s=>s.key===key)||{}).label||key;}

const PIPE_CLOSED_LOST_REASONS=[
  'Chose another venue','Pricing/budget','Dates unavailable',
  'Group did not materialize','No response','Postponed indefinitely','Other',
];

// type: key -> {label, target(bk)->stageKey|null, stampFields?}
const PIPE_ACTIVITY_TYPES=[
  {key:'initial_response', label:'Initial response sent', target:()=>'initial_response_sent'},
  {key:'reply_received',   label:'Reply received',        target:()=>'engaged_lead'},
  {key:'call_scheduled',   label:'Call scheduled',        target:()=>'call_scheduled'},
  {key:'call_completed',   label:'Call completed',        target:()=>'proposal_followup'},
  {key:'followup_sent',    label:'Follow-up sent',        target:()=>null}, // logged only, no auto stage change
  {key:'proposal_sent',    label:'Proposal sent',         target:()=>'proposal_followup'},
  {key:'considering',      label:'Client is considering', target:()=>'decision_pending'},
  {key:'contract_requested',label:'Contract requested',   target:()=>'ready_for_contract'},
  {key:'contract_sent',    label:'Contract sent',         target:()=>'contract_sent'},
  {key:'contract_signed',  label:'Contract signed',       target:bk=>pipeDepositReceived(bk)?'booked':'awaiting_signature_deposit'},
  {key:'deposit_received', label:'Deposit received',      target:bk=>pipeContractSigned(bk)?'booked':'awaiting_signature_deposit'},
  {key:'teacher_portal_sent',label:'Teacher portal sent', target:()=>'onboarding_started'},
  {key:'hold',              label:'Place on hold',        target:()=>'on_hold'},
  {key:'lost',              label:'Close as lost',        target:()=>'closed_lost'},
];
function pipeActType(key){return PIPE_ACTIVITY_TYPES.find(t=>t.key===key);}

// ===== DERIVED / EXISTING-FIELD READERS (no duplicate booleans — see plan) =====
function pipeContractSent(bk){return!!bk.contractSentAt;}
function pipeContractSigned(bk){return!!(bk.contractSignedAt||bk.contractSignature);}
function pipeDepositReceived(bk){return(bk.payments||[]).reduce((s,p)=>s+(Number(p.amount)||0),0)>0||bk.depositInvoice?.status==='paid';}
function pipeTeacherPortalSent(bk){return!!bk.roomListSentAt;}

function pipeDeriveStageFromStatus(bk){
  const s=bk.status;
  if(s==='cancelled')return'closed_lost';
  if(s==='contract_sent')return'contract_sent';
  if(s==='contract_signed'||s==='deposit_paid'){
    return(pipeContractSigned(bk)&&pipeDepositReceived(bk))?'booked':'awaiting_signature_deposit';
  }
  if(s==='room_list_sent')return'onboarding_started';
  if(s==='confirmed')return pipeTeacherPortalSent(bk)?'onboarding_started':'booked';
  return'new_inquiry'; // requested / legacy / unknown
}
// Lazy migration: never batch-written. Only persisted the first time a user
// actually interacts with a lead (pipeMoveStage / pipeSubmitActivity).
function pipeGetStage(bk){return bk.pipelineStage||pipeDeriveStageFromStatus(bk);}

function pipeFollowUpStatus(bk){
  if(!bk.followUpDate)return'none';
  const today=new Date().toISOString().slice(0,10);
  if(bk.followUpDate<today)return'overdue';
  if(bk.followUpDate===today)return'today';
  return'upcoming';
}
function pipeCanAdvancePastEarly(bk){return!!(bk.retreatName&&bk.retreatName.trim())&&typeof bk.isReturnGuest==='boolean';}
// The required-fields gate only blocks FORWARD progress past the early inquiry stages —
// it must never block a backward move, a hold, or a closed-lost (those are always allowed).
function pipeGateBlocksForward(bk,curStage,newStage){
  if(newStage==='on_hold'||newStage==='closed_lost')return false;
  const curIdx=pipeMainIdx(curStage),newIdx=pipeMainIdx(newStage);
  const isForward=curIdx===-1||newIdx>curIdx;
  return isForward&&newIdx>1&&!pipeCanAdvancePastEarly(bk);
}
function pipeCloseLostEligible(bk){return pipeGetStage(bk)==='booked'||pipeGetStage(bk)==='on_hold'||pipeGetStage(bk)==='closed_lost';}

function pipeLeads(){return(AppData.bookings||[]).slice();}
function pipeFmtDate(ds){if(!ds)return'';const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function pipeFmtDateShort(ds){if(!ds)return'';const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});}

// ===== STATE =====
let pipeFilters=new Set();
let pipeDetailId=null;
let pipeActivityBkId=null;
let pipeReasonCtx=null; // {bkId, newStage} awaiting a typed reason for a manual move

// ===== BADGES =====
function pipeBadge(text,bg,border,color){
  return`<span style="display:inline-block;font-size:10px;font-weight:800;letter-spacing:.3px;text-transform:uppercase;padding:2px 8px;border-radius:99px;background:${bg};border:1px solid ${border};color:${color};white-space:nowrap">${text}</span>`;
}
function pipeReturningBadge(bk){
  if(bk.isReturnGuest===true)return pipeBadge('Returning Guest','#dcfce7','#86efac','#14532d');
  if(bk.isReturnGuest===false)return pipeBadge('New Lead','#dbeafe','#93c5fd','#1e3a8a');
  return pipeBadge('Guest Status TBD','#f3f4f6','#d1d5db','#6b7280');
}
function pipeDatesBadgeHtml(bk){
  if(!bk.startDate||!bk.endDate)return pipeBadge('Dates TBD','#f3f4f6','#d1d5db','#6b7280');
  if(bk.datesFlexible)return pipeBadge('Dates Flexible','#fef9c3','#fde047','#854d0e');
  return'';
}
function pipeFollowUpBadge(bk){
  const st=pipeFollowUpStatus(bk);
  if(st==='overdue')return pipeBadge('Follow-Up Overdue','#fee2e2','#fca5a5','#991b1b');
  return'';
}

// ===== CARD =====
// Every lead is colored by type — Retreats (the default, no eventType) green,
// Weddings light blue, Bachelorette pink — so a mixed board stays scannable.
const PIPE_TYPE_COLORS={
  retreat:{bg:'#f0fdf4',border:'#86efac',label:null},
  wedding:{bg:'#eff6ff',border:'#93c5fd',label:'Wedding'},
  bachelorette:{bg:'#fdf2f8',border:'#f9a8d4',label:'Bachelorette'},
};
function pipeTypeColor(bk){return PIPE_TYPE_COLORS[bk.eventType]||PIPE_TYPE_COLORS.retreat;}
function pipeBuildCard(bk){
  const fu=pipeFollowUpStatus(bk);
  const fuColor={overdue:'#dc2626',today:'#b45309',upcoming:'#374151',none:'#9ca3af'}[fu];
  const fuLabel=bk.followUpDate?`Follow up: ${pipeFmtDateShort(bk.followUpDate)}`:'No follow-up scheduled';
  const dateRange=(bk.startDate&&bk.endDate)?`${pipeFmtDateShort(bk.startDate)}–${pipeFmtDateShort(bk.endDate)}`:'Dates TBD';
  const paxTxt=bk.pax?`${bk.pax} pax`:'Pax TBD';
  const tc=pipeTypeColor(bk);
  const el=document.createElement('div');
  el.className='salespipe-card';
  el.draggable=true;
  el.dataset.bkId=bk.id;
  el.style.cssText=`background:${tc.bg};border:1.5px solid ${tc.border};border-radius:10px;padding:12px 13px;margin-bottom:9px;cursor:grab;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:box-shadow .15s,border-color .15s;`;
  el.innerHTML=`
    ${tc.label?`<div style="margin-bottom:4px">${pipeBadge(tc.label,tc.bg,tc.border,tc.border)}</div>`:''}
    <div style="font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:700;color:var(--dark);line-height:1.25;margin-bottom:2px">${menuEsc(bk.retreatName||'Untitled Retreat')}</div>
    <div style="font-size:12.5px;color:var(--muted);margin-bottom:7px">${menuEsc(bk.leaderName||'No teacher/host on file')}</div>
    <div style="font-size:12px;color:var(--text);margin-bottom:8px">${dateRange} &middot; ${paxTxt}</div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:9px">${pipeReturningBadge(bk)}${pipeDatesBadgeHtml(bk)}${pipeFollowUpBadge(bk)}</div>
    <div style="font-size:11.5px;color:var(--text);border-top:1px solid #f0ece4;padding-top:7px">
      <div style="display:flex;justify-content:space-between;gap:6px"><span style="color:var(--muted)">Next:</span><span style="text-align:right;flex:1">${menuEsc(bk.nextAction)||'<span style="color:#c4b8a0;font-style:italic">Not set</span>'}</span></div>
      <div style="display:flex;justify-content:space-between;gap:6px;margin-top:2px"><span style="color:${fuColor};font-weight:${fu==='overdue'?800:600}">${fuLabel}</span><span style="color:var(--muted)">${menuEsc(bk.salesRep)||'Unassigned'}</span></div>
    </div>
    <div style="display:flex;gap:6px;margin-top:9px">
      <button onclick="event.stopPropagation();pipeOpenLogActivity('${bk.id}')" style="flex:1;background:#2d6a6a;color:#fff;border:none;border-radius:7px;padding:6px 0;font-family:'Jost',sans-serif;font-size:11px;font-weight:700;cursor:pointer">+ Log Activity</button>
      <button onclick="event.stopPropagation();pipeOpenLeadDetail('${bk.id}')" style="background:#fff;color:var(--dark);border:1.5px solid var(--border);border-radius:7px;padding:6px 10px;font-family:'Jost',sans-serif;font-size:11px;font-weight:700;cursor:pointer">Detail</button>
    </div>`;
  el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/pipe-bk-id',bk.id);el.style.opacity='.4';_bkDragActive=true;});
  el.addEventListener('dragend',()=>{el.style.opacity='1';setTimeout(()=>_bkDragActive=false,120);});
  el.addEventListener('click',()=>{if(!_bkDragActive)pipeOpenLeadDetail(bk.id);});
  return el;
}

// ===== BOARD =====
const PIPE_FILTER_DEFS=[
  {key:'due_today', label:'Follow-ups due today', test:bk=>pipeFollowUpStatus(bk)==='today'},
  {key:'overdue',    label:'Overdue follow-ups',   test:bk=>pipeFollowUpStatus(bk)==='overdue'},
  {key:'calls',      label:'Calls scheduled',      test:bk=>pipeGetStage(bk)==='call_scheduled'},
  {key:'unassigned', label:'Unassigned leads',     test:bk=>!bk.salesRep},
  {key:'returning',  label:'Returning guests',     test:bk=>bk.isReturnGuest===true},
  {key:'new',        label:'New leads',            test:bk=>bk.isReturnGuest===false},
  {key:'onhold',     label:'On-hold leads',        test:bk=>pipeGetStage(bk)==='on_hold'},
];
function pipeToggleFilter(key){
  if(pipeFilters.has(key))pipeFilters.delete(key);else pipeFilters.add(key);
  pipeRenderBoard();
}
function pipeMatchesFilters(bk){
  if(!pipeFilters.size)return true;
  return[...pipeFilters].every(k=>{const d=PIPE_FILTER_DEFS.find(f=>f.key===k);return d?d.test(bk):true;});
}
function pipeFilterBarHtml(){
  return`<div style="display:flex;flex-wrap:wrap;gap:7px;padding:0 24px 14px">${PIPE_FILTER_DEFS.map(f=>{
    const active=pipeFilters.has(f.key);
    return`<button onclick="pipeToggleFilter('${f.key}')" style="padding:6px 13px;border-radius:99px;font-family:'Jost',sans-serif;font-size:11.5px;font-weight:700;cursor:pointer;border:1.5px solid ${active?'#2d6a6a':'var(--border)'};background:${active?'#2d6a6a':'#fff'};color:${active?'#fff':'var(--text)'}">${f.label}</button>`;
  }).join('')}${pipeFilters.size?`<button onclick="pipeFilters.clear();pipeRenderBoard();" style="padding:6px 13px;border-radius:99px;font-family:'Jost',sans-serif;font-size:11.5px;font-weight:600;cursor:pointer;border:1.5px dashed var(--muted);background:none;color:var(--muted)">Clear filters</button>`:''}</div>`;
}

function pipeRender(){
  const root=document.getElementById('pipelineRoot');
  if(!root)return;
  root.innerHTML=`
    <div style="padding:22px 24px 4px;flex-shrink:0">
      <div style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:700;color:var(--dark)">Retreat Sales Pipeline</div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:2px;margin-bottom:16px">Drag a card between stages, or use + Log Activity to record progress. All inquiries land here — Retreats (green), Weddings (light blue), Bachelorette (pink).</div>
    </div>
    <div id="pipeFilterBar"></div>
    <div id="pipeBoard" style="flex:1;overflow-x:auto;overflow-y:hidden;padding:0 24px 24px;display:flex;gap:0"></div>`;
  pipeRenderBoard();
}
function pipeRenderBoard(){
  const bar=document.getElementById('pipeFilterBar');
  if(bar)bar.innerHTML=pipeFilterBarHtml();
  const board=document.getElementById('pipeBoard');
  if(!board)return;
  const leads=pipeLeads();
  if(!leads.length){
    board.innerHTML=`<div style="padding:40px;color:var(--muted);font-size:13px;font-style:italic">No leads yet. New inquiries submitted through the Retreat Leader, Wedding, or Bachelorette forms will appear here automatically.</div>`;
    return;
  }
  board.innerHTML='';
  PIPE_STAGES.forEach(stage=>{
    const col=document.createElement('div');
    col.className='salespipe-col';
    col.dataset.stage=stage.key;
    col.style.cssText='flex:0 0 250px;width:250px;margin-right:14px;display:flex;flex-direction:column;background:#f7f4ee;border-radius:12px;max-height:100%;';
    const stageLeads=leads.filter(bk=>pipeGetStage(bk)===stage.key&&pipeMatchesFilters(bk));
    const hdr=document.createElement('div');
    hdr.style.cssText='padding:11px 13px;border-bottom:2px solid #e8e0d0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0';
    hdr.innerHTML=`<span style="font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:var(--dark)">${stage.label}</span><span style="background:#e8e0d0;color:#6b6255;border-radius:99px;padding:1px 8px;font-size:11px;font-weight:700">${stageLeads.length}</span>`;
    col.appendChild(hdr);
    const body=document.createElement('div');
    body.style.cssText='flex:1;overflow-y:auto;padding:10px;min-height:60px;';
    if(!stageLeads.length){
      body.innerHTML=`<div style="text-align:center;color:#c4b8a0;font-size:11.5px;font-style:italic;padding:16px 6px">No leads here</div>`;
    }else{
      stageLeads.sort((a,b)=>(a.retreatName||'').localeCompare(b.retreatName||'')).forEach(bk=>body.appendChild(pipeBuildCard(bk)));
    }
    body.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('text/pipe-bk-id')){e.preventDefault();col.style.background='#eef3f0';}});
    body.addEventListener('dragleave',()=>{col.style.background='#f7f4ee';});
    body.addEventListener('drop',e=>{
      col.style.background='#f7f4ee';
      const bkId=e.dataTransfer.getData('text/pipe-bk-id');
      if(!bkId)return;
      e.preventDefault();
      pipeRequestMove(bkId,stage.key);
    });
    col.appendChild(body);
    board.appendChild(col);
  });
}

// ===== MOVE (manual drag / dropdown) =====
function pipeRequestMove(bkId,newStage){
  const bk=AppData.bookings.find(b=>b.id===bkId);
  if(!bk)return;
  const curStage=pipeGetStage(bk);
  if(curStage===newStage)return;
  const curIdx=pipeMainIdx(curStage),newIdx=pipeMainIdx(newStage);
  if(pipeGateBlocksForward(bk,curStage,newStage)){
    alert('Before this lead can move past the early inquiry stages, please set the retreat name and Returning Guest / New Lead status on the lead detail page.');
    return;
  }
  const isBackward=curIdx>=0&&newIdx>=0&&newIdx<curIdx;
  const isSkip=curIdx>=0&&newIdx>=0&&(newIdx-curIdx)>1;
  const toHold=newStage==='on_hold';
  const toLost=newStage==='closed_lost';
  if(isBackward||isSkip||toHold||toLost){
    pipeReasonCtx={bkId,newStage,isBackward,isSkip,toHold,toLost};
    pipeOpenReasonModal();
    return;
  }
  pipeMoveStage(bkId,newStage,'');
}
function pipeMoveStage(bkId,newStage,reason,extra){
  const bk=AppData.bookings.find(b=>b.id===bkId);
  if(!bk)return;
  const fromStage=pipeGetStage(bk);
  bk.pipelineStage=newStage;
  bk.pipelineActivity=bk.pipelineActivity||[];
  bk.pipelineActivity.unshift({
    id:uid(),type:'stage_moved',at:new Date().toISOString(),
    byUser:getCurrentSession()?.name||'Unknown',
    notes:reason||'',fromStage,toStage:newStage,
    nextAction:'',followUpDate:'',assignedTo:'',
    meta:{...(extra||{}),fromStage,toStage:newStage,reason:reason||''},
  });
  saveAll();
  pipeRenderBoard();
  if(pipeDetailId===bkId)pipeRenderLeadDetail();
  showToast(`Moved to ${pipeStageLabel(newStage)}`);
}

// ===== REASON MODAL (backward / skip / hold / lost manual moves) =====
function pipeOpenReasonModal(){
  const ctx=pipeReasonCtx;if(!ctx)return;
  const bk=AppData.bookings.find(b=>b.id===ctx.bkId);
  const title=document.getElementById('pipeReasonTitle');
  const why=[];
  if(ctx.isBackward)why.push('this moves the lead backward');
  if(ctx.isSkip)why.push('this skips one or more stages');
  if(ctx.toHold)why.push('this places the lead on hold');
  if(ctx.toLost)why.push('this closes the lead as lost');
  if(title)title.textContent=`Moving "${bk?.retreatName||'this lead'}" to ${pipeStageLabel(ctx.newStage)}`;
  const sub=document.getElementById('pipeReasonSub');
  if(sub)sub.textContent=`A reason is required because ${why.join(' and ')}.`;
  const lostWrap=document.getElementById('pipeReasonLostWrap');
  if(lostWrap)lostWrap.style.display=ctx.toLost?'block':'none';
  const sel=document.getElementById('pipeReasonLostSelect');
  if(sel){sel.innerHTML=PIPE_CLOSED_LOST_REASONS.map(r=>`<option value="${r}">${r}</option>`).join('');sel.onchange=()=>{const oth=document.getElementById('pipeReasonLostOtherWrap');if(oth)oth.style.display=sel.value==='Other'?'block':'none';};}
  document.getElementById('pipeReasonLostOtherWrap').style.display='none';
  document.getElementById('pipeReasonText').value='';
  document.getElementById('pipeReasonLostOther').value='';
  openModal('pipeReasonModal');
}
function pipeSubmitReasonModal(){
  const ctx=pipeReasonCtx;if(!ctx)return;
  let reason=document.getElementById('pipeReasonText').value.trim();
  let extra={};
  if(ctx.toLost){
    const sel=document.getElementById('pipeReasonLostSelect').value;
    const other=document.getElementById('pipeReasonLostOther').value.trim();
    if(sel==='Other'&&!other){alert('Please add written notes for "Other".');return;}
    reason=sel==='Other'?`Other: ${other}`:sel;
    extra.closedLostReason=sel;
    if(sel==='Other')extra.closedLostNotes=other;
  }else if(!reason){
    alert('Please enter a short reason before continuing.');
    return;
  }
  closeModal('pipeReasonModal');
  pipeMoveStage(ctx.bkId,ctx.newStage,reason,extra);
  pipeReasonCtx=null;
}

// ===== LOG ACTIVITY MODAL =====
function pipeOpenLogActivity(bkId){
  pipeActivityBkId=bkId;
  const bk=AppData.bookings.find(b=>b.id===bkId);
  if(!bk)return;
  const sel=document.getElementById('pipeActTypeSelect');
  sel.innerHTML=PIPE_ACTIVITY_TYPES.map(t=>`<option value="${t.key}">${t.label}</option>`).join('');
  sel.value='initial_response';
  document.getElementById('pipeActTitle').textContent=`Log Activity — ${bk.retreatName||bk.leaderName||'Lead'}`;
  document.getElementById('pipeActNotes').value='';
  document.getElementById('pipeActNextAction').value=bk.nextAction||'';
  document.getElementById('pipeActFollowUp').value='';
  document.getElementById('pipeActCallDate').value='';
  document.getElementById('pipeActCallTime').value='';
  document.getElementById('pipeActCallTz').value='America/Cancun';
  document.getElementById('pipeActCallAgenda').value='';
  document.getElementById('pipeActOutcome').value='';
  document.getElementById('pipeActDepositAmt').value='';
  document.getElementById('pipeActHoldReason').value='';
  document.getElementById('pipeActLostReasonSel').innerHTML=PIPE_CLOSED_LOST_REASONS.map(r=>`<option value="${r}">${r}</option>`).join('');
  document.getElementById('pipeActLostOther').value='';
  document.getElementById('pipeActLostOtherWrap').style.display='none';
  document.getElementById('pipeActNoFollowUp').checked=false;
  const assignSel=document.getElementById('pipeActAssignee');
  assignSel.innerHTML='<option value="">—</option>'+staffAccounts.filter(s=>s.active).map(s=>`<option value="${menuEsc(s.name)}">${menuEsc(s.name)}</option>`).join('');
  assignSel.value=getCurrentSession()?.name||'';
  const submitBtn=document.getElementById('pipeActSubmitBtn');
  submitBtn.disabled=false;submitBtn.textContent='Log Activity';
  pipeActTypeChanged();
  openModal('pipeActModal');
}
function pipeActTypeChanged(){
  const type=document.getElementById('pipeActTypeSelect').value;
  document.getElementById('pipeActCallSchedFields').style.display=type==='call_scheduled'?'block':'none';
  document.getElementById('pipeActCallCompleteFields').style.display=type==='call_completed'?'block':'none';
  document.getElementById('pipeActDepositFields').style.display=type==='deposit_received'?'block':'none';
  document.getElementById('pipeActHoldFields').style.display=type==='hold'?'block':'none';
  document.getElementById('pipeActLostFields').style.display=type==='lost'?'block':'none';
  const bk=AppData.bookings.find(b=>b.id===pipeActivityBkId);
  const noFuRow=document.getElementById('pipeActNoFollowUpRow');
  const eligible=(bk&&pipeCloseLostEligible(bk))||type==='hold'||type==='lost';
  noFuRow.style.display=eligible?'flex':'none';
  const forceNoFu=type==='hold'||type==='lost';
  const cb=document.getElementById('pipeActNoFollowUp');
  if(forceNoFu)cb.checked=true;
  pipeActNoFollowUpChanged();
  const teacherPortalWarn=document.getElementById('pipeActTeacherPortalWarn');
  if(teacherPortalWarn)teacherPortalWarn.style.display=(type==='teacher_portal_sent'&&bk&&pipeGetStage(bk)!=='booked'&&pipeGetStage(bk)!=='onboarding_started')?'block':'none';
}
function pipeActLostReasonChanged(){
  const sel=document.getElementById('pipeActLostReasonSel').value;
  document.getElementById('pipeActLostOtherWrap').style.display=sel==='Other'?'block':'none';
}
function pipeActNoFollowUpChanged(){
  const off=document.getElementById('pipeActNoFollowUp').checked;
  document.getElementById('pipeActNextAction').disabled=off;
  document.getElementById('pipeActFollowUp').disabled=off;
  if(off){document.getElementById('pipeActNextAction').value='';document.getElementById('pipeActFollowUp').value='';}
}
function pipeSubmitActivity(){
  const bk=AppData.bookings.find(b=>b.id===pipeActivityBkId);
  if(!bk)return;
  const submitBtn=document.getElementById('pipeActSubmitBtn');
  if(submitBtn.disabled)return; // duplicate-submit guard
  const type=document.getElementById('pipeActTypeSelect').value;
  const act=pipeActType(type);
  let notes=document.getElementById('pipeActNotes').value.trim();
  const noFollowUp=document.getElementById('pipeActNoFollowUp').checked;
  const nextAction=noFollowUp?'':document.getElementById('pipeActNextAction').value.trim();
  const followUpDate=noFollowUp?'':document.getElementById('pipeActFollowUp').value;
  const assignedTo=document.getElementById('pipeActAssignee').value;
  if(!noFollowUp&&(!nextAction||!followUpDate)){
    alert('Please set a next action and follow-up date, or check "No follow-up required" (only available for Booked, On Hold or Closed—Lost leads).');
    return;
  }
  const meta={};
  if(type==='call_scheduled'){
    const callDate=document.getElementById('pipeActCallDate').value;
    const callTime=document.getElementById('pipeActCallTime').value;
    const callTz=document.getElementById('pipeActCallTz').value.trim();
    if(!callDate||!callTime||!callTz){alert('Call date, time and time zone are required to schedule a call.');return;}
    meta.callDate=callDate;meta.callTime=callTime;meta.callTz=callTz;
    meta.callAgenda=document.getElementById('pipeActCallAgenda').value.trim();
    bk.scheduledCallAt=`${callDate}T${callTime}`;
    bk.scheduledCallCompletedAt=null;
  }
  if(type==='call_completed'){
    meta.outcome=document.getElementById('pipeActOutcome').value.trim();
    bk.scheduledCallCompletedAt=new Date().toISOString();
  }
  if(type==='hold'){
    const holdReason=document.getElementById('pipeActHoldReason').value.trim();
    if(!holdReason){alert('Please enter a reason for placing this lead on hold.');return;}
    meta.reason=holdReason;
    notes=notes?`${holdReason} — ${notes}`:holdReason;
  }
  if(type==='lost'){
    const lostReason=document.getElementById('pipeActLostReasonSel').value;
    const lostOther=document.getElementById('pipeActLostOther').value.trim();
    if(lostReason==='Other'&&!lostOther){alert('Please add written notes for "Other".');return;}
    meta.closedLostReason=lostReason;
    if(lostReason==='Other')meta.closedLostNotes=lostOther;
    const reasonTxt=lostReason==='Other'?`Other: ${lostOther}`:lostReason;
    notes=notes?`${reasonTxt} — ${notes}`:reasonTxt;
  }
  if(type==='deposit_received'){
    const amt=parseFloat(document.getElementById('pipeActDepositAmt').value);
    if(amt>0){
      bk.payments=bk.payments||[];
      bk.payments.push({id:uid(),amount:amt,date:new Date().toISOString().slice(0,10),method:'other',note:'Recorded via Sales Pipeline activity log'});
      meta.depositAmount=amt;
    }
  }
  if(type==='teacher_portal_sent'){
    const eligible=pipeGetStage(bk)==='booked'||pipeGetStage(bk)==='onboarding_started';
    if(!eligible){
      const reason=prompt('This retreat has not reached "Booked" yet. Enter a reason to override and send the teacher portal anyway:');
      if(!reason)return;
      meta.override=true;meta.overrideReason=reason;
    }
    if(!bk.roomListSentAt)bk.roomListSentAt=new Date().toISOString();
  }
  if(type==='contract_sent'&&!bk.contractSentAt)bk.contractSentAt=new Date().toISOString();
  if(type==='contract_signed'&&!bk.contractSignedAt)bk.contractSignedAt=new Date().toISOString();

  submitBtn.disabled=true;submitBtn.textContent='Logging…';

  bk.pipelineActivity=bk.pipelineActivity||[];
  bk.pipelineActivity.unshift({
    id:uid(),type,at:new Date().toISOString(),
    byUser:getCurrentSession()?.name||'Unknown',
    notes,nextAction,followUpDate,assignedTo,meta,
  });
  if(nextAction)bk.nextAction=nextAction;
  if(followUpDate)bk.followUpDate=followUpDate;
  else if(noFollowUp)bk.followUpDate='';
  if(assignedTo)bk.salesRep=assignedTo;
  bk.pipelineStage=bk.pipelineStage||pipeDeriveStageFromStatus(bk);

  const targetStage=act.target(bk);
  let gatedByRequiredFields=false;
  if(targetStage){
    if(type==='hold'||type==='lost'){
      bk.pipelineStage=targetStage;
    }else if(pipeGateBlocksForward(bk,bk.pipelineStage,targetStage)){
      // Activity is still logged (valuable on its own), but the stage stays put until
      // retreat name + Returning Guest/New Lead status are filled in on the lead detail page.
      gatedByRequiredFields=true;
    }else{
      const curIdx=pipeMainIdx(bk.pipelineStage),newIdx=pipeMainIdx(targetStage);
      // Non-regression: routine activity logging never moves a lead backward.
      if(curIdx===-1||newIdx>curIdx)bk.pipelineStage=targetStage;
    }
  }

  saveAll();
  closeModal('pipeActModal');
  pipeRenderBoard();
  if(pipeDetailId===bk.id)pipeRenderLeadDetail();
  showToast(gatedByRequiredFields?'Activity logged — set retreat name & guest status to advance the stage':'Activity logged');
}

// ===== LEAD DETAIL PAGE =====
function pipeOpenLeadDetail(bkId){
  pipeDetailId=bkId;
  openModal('pipeDetailModal');
  pipeRenderLeadDetail();
}
function pipeCloseLeadDetail(){pipeDetailId=null;closeModal('pipeDetailModal');}
function pipeSetField(field,el){
  const bk=AppData.bookings.find(b=>b.id===pipeDetailId);
  if(!bk)return;
  const val=el.type==='checkbox'?el.checked:el.value;
  if(field==='isReturnGuest')bk.isReturnGuest=val===''?undefined:val==='true';
  else bk[field]=val;
  saveAll();
  pipeRenderBoard();
}
function pipeRenderLeadDetail(){
  const wrap=document.getElementById('pipeDetailBody');
  const bk=AppData.bookings.find(b=>b.id===pipeDetailId);
  if(!wrap)return;
  if(!bk){wrap.innerHTML='<div style="padding:20px;color:var(--muted)">Lead not found — it may have been removed.</div>';return;}
  const stage=pipeGetStage(bk);
  const history=(bk.pipelineActivity||[]).slice().sort((a,b)=>(b.at||'').localeCompare(a.at||''));
  const fld=(label,value)=>`<div style="margin-bottom:10px"><div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);margin-bottom:2px">${label}</div><div style="font-size:13px;color:var(--text)">${value||'<span style=\'color:#c4b8a0;font-style:italic\'>Not set</span>'}</div></div>`;
  document.getElementById('pipeDetailTitle').textContent=bk.retreatName||'Untitled Retreat';
  wrap.innerHTML=`
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">${pipeBadge(pipeStageLabel(stage),'#e0f2fe','#7dd3fc','#0c4a6e')}${pipeReturningBadge(bk)}${pipeDatesBadgeHtml(bk)}${pipeFollowUpBadge(bk)}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px">
      ${fld('Teacher / Host',menuEsc(bk.leaderName))}
      ${fld('Contact',menuEsc(bk.leaderEmail)+(bk.leaderPhone?' &middot; '+menuEsc(bk.leaderPhone):''))}
      ${fld('Proposed Dates',(bk.startDate&&bk.endDate)?`${pipeFmtDate(bk.startDate)} – ${pipeFmtDate(bk.endDate)}`:'TBD')}
      ${fld('Estimated Pax',bk.pax||'TBD')}
      ${fld('Lead Source',bk.source==='inquiry'?'Website inquiry form':'Added by admin')}
      ${fld('Previous Retreat',bk.isReturnGuest?menuEsc(bk.previousVisit)||'Returning guest — no prior visit notes on file':'—')}
    </div>
    <div class="frow">
      <div class="fg"><label>Returning Guest?</label><select onchange="pipeSetField('isReturnGuest',this)"><option value="" ${bk.isReturnGuest===undefined?'selected':''}>Unknown</option><option value="true" ${bk.isReturnGuest===true?'selected':''}>Yes — Returning</option><option value="false" ${bk.isReturnGuest===false?'selected':''}>No — New Lead</option></select></div>
      <div class="fg"><label>Dates Flexible?</label><select onchange="pipeSetField('datesFlexible',this)"><option value="false" ${!bk.datesFlexible?'selected':''}>No</option><option value="true" ${bk.datesFlexible?'selected':''}>Yes</option></select></div>
    </div>
    <div class="frow">
      <div class="fg"><label>Assigned Sales Rep</label><select onchange="pipeSetField('salesRep',this)"><option value="">Unassigned</option>${staffAccounts.filter(s=>s.active).map(s=>`<option value="${menuEsc(s.name)}" ${bk.salesRep===s.name?'selected':''}>${menuEsc(s.name)}</option>`).join('')}</select></div>
      <div class="fg"><label>Follow-Up Date</label><input type="date" value="${bk.followUpDate||''}" onchange="pipeSetField('followUpDate',this)"></div>
    </div>
    <div class="frow full"><div class="fg"><label>Next Action</label><input type="text" value="${menuEsc(bk.nextAction)}" onchange="pipeSetField('nextAction',this)" placeholder="e.g. Send revised pricing"></div></div>
    <div class="frow full"><div class="fg"><label>Internal Notes</label><textarea onchange="pipeSetField('notes',this)" placeholder="Internal notes for the team">${menuEsc(bk.notes)}</textarea></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin:14px 0;padding:12px;background:var(--sand);border-radius:10px">
      <div style="text-align:center"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted)">Contract Sent</div><div style="font-size:18px">${pipeContractSent(bk)?'✅':'—'}</div></div>
      <div style="text-align:center"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted)">Contract Signed</div><div style="font-size:18px">${pipeContractSigned(bk)?'✅':'—'}</div></div>
      <div style="text-align:center"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted)">Deposit Received</div><div style="font-size:18px">${pipeDepositReceived(bk)?'✅':'—'}</div></div>
      <div style="text-align:center"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted)">Teacher Portal Sent</div><div style="font-size:18px">${pipeTeacherPortalSent(bk)?'✅':'—'}</div></div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:18px">
      <button onclick="pipeOpenLogActivity('${bk.id}')" style="flex:1;background:#2d6a6a;color:#fff;border:none;border-radius:8px;padding:10px 0;font-family:'Jost',sans-serif;font-size:13px;font-weight:700;cursor:pointer">+ Log Activity</button>
    </div>
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px;border-top:1px solid var(--border);padding-top:14px">Activity History</div>
    <div>${history.length?history.map(pipeHistEntryHtml).join(''):'<div style="color:var(--muted);font-size:12.5px;font-style:italic;padding:8px 0">No activity logged yet.</div>'}</div>`;
}
function pipeHistEntryHtml(e){
  const t=new Date(e.at);
  const dateStr=t.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const timeStr=t.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  const label=e.type==='stage_moved'?`Moved from ${pipeStageLabel(e.fromStage)} to ${pipeStageLabel(e.toStage)}`:(pipeActType(e.type)?.label||e.type);
  return`<div style="padding:9px 0;border-bottom:1px solid #f0ece4">
    <div style="font-size:13px;font-weight:600;color:var(--text)">${menuEsc(label)}</div>
    ${e.notes?`<div style="font-size:12px;color:var(--muted);margin-top:1px">${menuEsc(e.notes)}</div>`:''}
    ${e.nextAction?`<div style="font-size:12px;color:var(--muted);margin-top:1px">Next: ${menuEsc(e.nextAction)}${e.followUpDate?' by '+pipeFmtDateShort(e.followUpDate):''}</div>`:''}
    <div style="font-size:11px;color:#bbb;margin-top:3px">${dateStr} &middot; ${timeStr} &nbsp;&middot;&nbsp; <span style="font-weight:600;color:#9ca3af">${menuEsc(e.byUser)||'System'}</span></div>
  </div>`;
}
