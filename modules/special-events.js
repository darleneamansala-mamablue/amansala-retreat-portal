// ===== special-events.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== SPECIAL EVENTS =====
const EVT_STATUS_LABELS={inquiry:'Inquiry',proposal_sent:'Proposal Sent',contract_sent:'Contract Sent',contract_signed:'Contract Signed',deposit_paid:'Deposit Paid',confirmed:'Confirmed',cancelled:'Cancelled'};
const EVT_STATUS_COLORS={inquiry:{bg:'#f5f3ff',color:'#6d28d9',border:'#ddd6fe'},proposal_sent:{bg:'#eff6ff',color:'#1d4ed8',border:'#bfdbfe'},contract_sent:{bg:'#ecfdf5',color:'#065f46',border:'#a7f3d0'},contract_signed:{bg:'#f0fdf4',color:'#15803d',border:'#bbf7d0'},deposit_paid:{bg:'#fff7ed',color:'#c2410c',border:'#fed7aa'},confirmed:{bg:'#f0fdfa',color:'#0f766e',border:'#99f6e4'},cancelled:{bg:'#fef2f2',color:'#991b1b',border:'#fecaca'}};
const EVT_TYPE_LABELS={wedding:'Wedding',bachelorette:'Bachelorette / Bach Party',corporate:'Corporate Retreat',birthday:'Birthday Celebration',anniversary:'Anniversary',family:'Family Reunion',group:'Private Group',other:'Other'};

function evtUpdateDot(){
  const dot=document.getElementById('evtDot');if(!dot)return;
  const n=(AppData.specialEvents||[]).filter(e=>e.status!=='cancelled').length;
  dot.textContent=n;dot.style.display=n>0?'inline-flex':'none';
}

function evtBuild(){
  evtUpdateDot();
  const el=document.getElementById('evtContent');if(!el)return;
  const active=(AppData.specialEvents||[]).filter(e=>e.status!=='cancelled').sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const cancelled=(AppData.specialEvents||[]).filter(e=>e.status==='cancelled');
  if(!active.length&&!cancelled.length){
    el.innerHTML=`<div style="text-align:center;padding:60px 20px">
      <div style="width:60px;height:60px;background:#f3e8ff;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      </div>
      <p style="color:#6d28d9;font-size:15px;font-weight:600;margin:0 0 6px">No special events yet</p>
      <p style="color:#a89e94;font-size:13px;margin:0 0 18px">Add an event or share the inquiry link with clients</p>
      <button onclick="evtShowForm(null)" style="padding:10px 22px;background:#a855f7;color:#fff;border:none;border-radius:10px;font-family:'Jost',sans-serif;font-size:13px;font-weight:600;cursor:pointer">+ New Event</button>
    </div>`;return;
  }
  const EVT_PIPELINE=[{id:'inquiry',label:'Inquiry'},{id:'proposal_sent',label:'Proposal'},{id:'contract_sent',label:'Contract Sent'},{id:'contract_signed',label:'Signed'},{id:'deposit_paid',label:'Deposit'},{id:'confirmed',label:'Confirmed'}];
  const byStatus={};
  EVT_PIPELINE.forEach(s=>{byStatus[s.id]=active.filter(e=>e.status===s.id);});
  let html=`<div style="display:flex;flex-direction:column;gap:28px">`;
  EVT_PIPELINE.forEach(step=>{
    const evts=byStatus[step.id];if(!evts.length)return;
    const sc=EVT_STATUS_COLORS[step.id]||EVT_STATUS_COLORS.inquiry;
    html+=`<div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${sc.bg};color:${sc.color};border:1px solid ${sc.border}">${EVT_STATUS_LABELS[step.id]}</span>
        <span style="font-size:12px;color:#a89e94">${evts.length} event${evts.length!==1?'s':''}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">${evts.map(e=>evtCard(e)).join('')}</div>
    </div>`;
  });
  if(cancelled.length){
    html+=`<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12.5px;color:#a89e94;font-weight:600;list-style:none;display:flex;align-items:center;gap:6px">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      ${cancelled.length} cancelled event${cancelled.length!==1?'s':''}
    </summary>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">${cancelled.map(e=>evtCard(e)).join('')}</div></details>`;
  }
  html+=`</div>`;
  el.innerHTML=html;
}

function evtCard(e){
  const sc=EVT_STATUS_COLORS[e.status]||EVT_STATUS_COLORS.inquiry;
  const daysOut=e.startDate?Math.round((pd(e.startDate)-new Date())/DAY_MS):null;
  const daysLabel=daysOut===null?'':daysOut===0?'Today':daysOut<0?`${Math.abs(daysOut)}d ago`:`${daysOut}d away`;
  return`<div onclick="evtShowForm('${e.id}')" style="background:#fff;border:1.5px solid #e8dfd4;border-radius:12px;padding:14px 18px;cursor:pointer;transition:border-color .15s" onmouseover="this.style.borderColor='#a855f7'" onmouseout="this.style.borderColor='#e8dfd4'">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px">
          <span style="font-size:14px;font-weight:700;color:#2d2520">${e.contact||'Unnamed Event'}</span>
          ${e.name?`<span style="font-size:12.5px;color:#8a7e74">— ${e.name}</span>`:''}
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:11.5px;color:#6d28d9;font-weight:600;background:#f5f3ff;padding:2px 8px;border-radius:5px">${EVT_TYPE_LABELS[e.type]||e.type||'Event'}</span>
          ${e.startDate?`<span style="font-size:12px;color:#8a7e74">${fmtDate(e.startDate)}${e.endDate&&e.endDate!==e.startDate?' – '+fmtDate(e.endDate):''}</span>`:''}
          ${daysLabel?`<span style="font-size:11.5px;color:${daysOut>=0?'#0e9494':'#dc2626'};font-weight:600">${daysLabel}</span>`:''}
          ${e.pax?`<span style="font-size:12px;color:#8a7e74">${e.pax} guests est.</span>`:''}
        </div>
        ${e.notes?`<div style="margin-top:7px;font-size:12px;color:#a89e94;line-height:1.5">${e.notes}</div>`:''}
      </div>
      <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;background:${sc.bg};color:${sc.color};border:1px solid ${sc.border};flex-shrink:0">${EVT_STATUS_LABELS[e.status]||e.status}</span>
    </div>
    ${e.email||e.phone?`<div style="margin-top:9px;padding-top:9px;border-top:1px solid #f0ece4;display:flex;gap:14px;flex-wrap:wrap">
      ${e.email?`<span style="font-size:12px;color:#5a5048"><svg style="vertical-align:-2px;margin-right:3px" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>${e.email}</span>`:''}
      ${e.phone?`<span style="font-size:12px;color:#5a5048"><svg style="vertical-align:-2px;margin-right:3px" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.81a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${e.phone}</span>`:''}
    </div>`:''}
  </div>`;
}

function evtShowForm(id){
  const isNew=!id;
  const e=id?AppData.specialEvents.find(x=>x.id===id):null;
  document.getElementById('evtModalTitle').textContent=isNew?'New Special Event':'Edit Event';
  document.getElementById('evtModalSub').textContent=e?`Created ${e.createdAt?new Date(e.createdAt).toLocaleDateString():''}` :'';
  document.getElementById('evtId').value=id||'';
  document.getElementById('evtType').value=e?.type||'';
  document.getElementById('evtStatus').value=e?.status||'inquiry';
  document.getElementById('evtContact').value=e?.contact||'';
  document.getElementById('evtEmail').value=e?.email||'';
  document.getElementById('evtPhone').value=e?.phone||'';
  document.getElementById('evtStart').value=e?.startDate||'';
  document.getElementById('evtEnd').value=e?.endDate||'';
  document.getElementById('evtPax').value=e?.pax||'';
  document.getElementById('evtName').value=e?.name||'';
  document.getElementById('evtNotes').value=e?.notes||'';
  document.getElementById('evtDeleteWrap').style.display=isNew?'none':'block';
  document.getElementById('evtModal').style.display='flex';
}

function evtSave(){
  const id=document.getElementById('evtId').value;
  const type=document.getElementById('evtType').value;
  const contact=document.getElementById('evtContact').value.trim();
  const startDate=document.getElementById('evtStart').value;
  const endDate=document.getElementById('evtEnd').value;
  if(!type){alert('Please select an event type.');return;}
  if(!contact){alert('Please enter a contact name.');return;}
  if(!startDate||!endDate){alert('Please enter start and end dates.');return;}
  if(endDate<startDate){alert('End date must be on or after start date.');return;}
  const data={type,status:document.getElementById('evtStatus').value||'inquiry',contact,email:document.getElementById('evtEmail').value.trim(),phone:document.getElementById('evtPhone').value.trim(),startDate,endDate,pax:parseInt(document.getElementById('evtPax').value)||null,name:document.getElementById('evtName').value.trim(),notes:document.getElementById('evtNotes').value.trim()};
  if(id){
    const idx=AppData.specialEvents.findIndex(e=>e.id===id);
    if(idx>=0)AppData.specialEvents[idx]={...AppData.specialEvents[idx],...data};
  }else{
    AppData.specialEvents.push({id:uid(),createdAt:new Date().toISOString(),...data});
  }
  saveAll();closeModal('evtModal');evtBuild();venBuild();
}

function evtDelete(id){
  if(!id||!confirm('Delete this event?'))return;
  AppData.specialEvents=AppData.specialEvents.filter(e=>e.id!==id);
  saveAll();closeModal('evtModal');evtBuild();venBuild();
}

function evtCopyLink(){
  const url=location.origin+location.pathname+'?mode=event';
  if(navigator.clipboard){navigator.clipboard.writeText(url).then(()=>alert('Inquiry link copied!\n\n'+url)).catch(()=>{prompt('Copy this link:',url);});}
  else{prompt('Copy this link:',url);}
}

function initEventMode(){
  if(!IS_EVENT_MODE)return;
  document.body.innerHTML=`<style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Jost:wght@300;400;500;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Jost',sans-serif;background:#f8f4f0;min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px}
    .ef-wrap{background:#fff;border-radius:20px;box-shadow:0 8px 40px rgba(0,0,0,.1);max-width:560px;width:100%;overflow:hidden}
    .ef-hero{background:linear-gradient(135deg,#1a3333 0%,#2d6a6a 100%);padding:36px 32px 28px;text-align:center}
    .ef-hero h1{font-family:'Cormorant Garamond',serif;color:#fff;font-size:28px;font-weight:600;margin-bottom:6px}
    .ef-hero p{color:rgba(255,255,255,.75);font-size:14px;line-height:1.6}
    .ef-body{padding:28px 32px 32px}
    .ef-field{margin-bottom:16px}
    .ef-label{display:block;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8a7e74;margin-bottom:5px}
    .ef-input{width:100%;padding:10px 14px;border:1.5px solid #d4cdc5;border-radius:10px;font-family:'Jost',sans-serif;font-size:14px;color:#2d2520;background:#fff;transition:border-color .15s}
    .ef-input:focus{outline:none;border-color:#a855f7}
    .ef-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .ef-submit{width:100%;padding:14px;background:linear-gradient(135deg,#9333ea,#a855f7);color:#fff;border:none;border-radius:12px;font-family:'Jost',sans-serif;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:.3px;margin-top:8px;transition:opacity .15s}
    .ef-submit:hover{opacity:.9}
    .ef-thanks{display:none;text-align:center;padding:40px 32px}
    .ef-thanks h2{font-family:'Cormorant Garamond',serif;font-size:24px;color:#1a3333;margin-bottom:10px}
    .ef-thanks p{font-size:14px;color:#8a7e74;line-height:1.7}
    select.ef-input{cursor:pointer}
    textarea.ef-input{resize:vertical;min-height:90px}
  </style>
  <div class="ef-wrap">
    <div class="ef-hero">
      <h1>Special Event Inquiry</h1>
      <p>Weddings · Bachelorette Parties · Corporate Retreats<br>Birthday Celebrations · Private Groups & More</p>
    </div>
    <div class="ef-body">
      <form id="efForm">
        <div class="ef-field">
          <label class="ef-label">Event Type *</label>
          <select id="efType" class="ef-input" required>
            <option value="">Select your event type…</option>
            <option value="wedding">Wedding</option>
            <option value="bachelorette">Bachelorette / Bach Party</option>
            <option value="corporate">Corporate Retreat</option>
            <option value="birthday">Birthday Celebration</option>
            <option value="anniversary">Anniversary</option>
            <option value="family">Family Reunion</option>
            <option value="group">Private Group</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="ef-row">
          <div class="ef-field">
            <label class="ef-label">Your Name *</label>
            <input id="efContact" class="ef-input" type="text" placeholder="Full name" required>
          </div>
          <div class="ef-field">
            <label class="ef-label">Email *</label>
            <input id="efEmail" class="ef-input" type="email" placeholder="email@example.com" required>
          </div>
        </div>
        <div class="ef-row">
          <div class="ef-field">
            <label class="ef-label">Phone</label>
            <input id="efPhone" class="ef-input" type="tel" placeholder="+1 (555) 000-0000">
          </div>
          <div class="ef-field">
            <label class="ef-label">Estimated Guests</label>
            <input id="efPax" class="ef-input" type="number" min="1" placeholder="How many people?">
          </div>
        </div>
        <div class="ef-row">
          <div class="ef-field">
            <label class="ef-label">Preferred Start Date *</label>
            <input id="efStart" class="ef-input" type="date" required>
          </div>
          <div class="ef-field">
            <label class="ef-label">Preferred End Date *</label>
            <input id="efEnd" class="ef-input" type="date" required>
          </div>
        </div>
        <div class="ef-field">
          <label class="ef-label">Tell Us About Your Event</label>
          <textarea id="efNotes" class="ef-input" placeholder="Share any special requests, ideas, or questions…"></textarea>
        </div>
        <button type="submit" class="ef-submit">Send Inquiry</button>
      </form>
      <div class="ef-thanks" id="efThanks">
        <div style="width:56px;height:56px;background:#f3e8ff;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:26px">✨</div>
        <h2>We received your inquiry!</h2>
        <p>Thank you for your interest in hosting your event at Amansala. Our team will be in touch within 1–2 business days to discuss the details and explore how we can make your vision come to life.</p>
        <p style="margin-top:14px;font-size:13px;color:#a89e94">amansala.com</p>
      </div>
    </div>
  </div>`;
  document.getElementById('efForm').addEventListener('submit',async function(ev){
    ev.preventDefault();
    const type=document.getElementById('efType').value;
    const contact=document.getElementById('efContact').value.trim();
    const email=document.getElementById('efEmail').value.trim();
    const startDate=document.getElementById('efStart').value;
    const endDate=document.getElementById('efEnd').value;
    if(!type||!contact||!email||!startDate||!endDate)return;
    const newEvt={id:'evt_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),createdAt:new Date().toISOString(),type,status:'inquiry',contact,email,phone:document.getElementById('efPhone').value.trim(),pax:parseInt(document.getElementById('efPax').value)||null,startDate,endDate,notes:document.getElementById('efNotes').value.trim(),source:'public_form'};
    try{
      const SK=SUPA_KEY, SU=SUPA_URL;
      const H={'Content-Type':'application/json','apikey':SK,'Authorization':'Bearer '+SK};
      const row=await fetch(SU+'/rest/v1/app_store?key=eq.specialEvents&select=value',{headers:H}).then(r=>r.json());
      const existing=Array.isArray(row[0]?.value)?row[0].value:[];
      existing.push(newEvt);
      const method=row.length?'PATCH':'POST';
      const url=SU+'/rest/v1/app_store'+(row.length?'?key=eq.specialEvents':'');
      await fetch(url,{method,headers:{...H,'Prefer':'return=minimal'},body:JSON.stringify({key:'specialEvents',value:existing,updated_at:new Date().toISOString()})});
    }catch(e){console.warn('Event submission Supabase error:',e);}
    // Email notification via Netlify Forms
    try{
      const fd=new URLSearchParams();
      fd.append('form-name','special-event-inquiry');
      fd.append('event_type',type);
      fd.append('name',contact);
      fd.append('email',email);
      fd.append('phone',document.getElementById('efPhone').value.trim());
      fd.append('guests',document.getElementById('efPax').value||'');
      fd.append('start_date',startDate);
      fd.append('end_date',endDate);
      fd.append('notes',document.getElementById('efNotes').value.trim());
      await fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:fd.toString()});
    }catch(e){console.warn('Netlify form notify failed',e);}
    document.getElementById('efForm').style.display='none';
    document.getElementById('efThanks').style.display='block';
  });
}


