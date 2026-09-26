// ===== BOOKING DETAIL / FOLIO VIEW =====
// Rich per-reservation view opened from the Rooms tab (modules/venues.js) AND from
// modules/reservations.js, matching the equivalent screen in the staging app
// (js/modules/reservations.js). Reads/writes the real `folios`/`folio_items` SQL
// tables directly, on-demand -- this is intentionally NOT part of the bulk
// loadFromSupabase()/syncToSupabase() cycle, so it can't interfere with the
// already-migrated bookings/registrations/payments sync.
//
// Two "kinds" of subject share this one modal: a retreat/room-only guest
// (_bdKind='reg', keyed by a `registrations` row) and an individual Booking
// Engine reservation (_bdKind='req', keyed by a `booking_requests` row --
// these have no registration at all, per booking-engine-admin.js). Folio
// rendering/payments/charges (_bdFolioRowHtml, bdRecordPayment, etc.) are
// already subject-agnostic (keyed only by folio id) -- _bdSubject() is the
// one seam that normalizes the two into a common shape for everything else
// (header, check-in/out, notes, delete).
let _bdKind='reg',_bdId=null,_bdReqCache=null,_bdFolios=[],_bdAddOpen={};

function _bdReqSqlToApp(row){const o={};for(const k in row)o[_s2c(k)]=row[k];return o;}

// Normalizes the current subject (registration+booking, or booking_request)
// into one shape every render/action function below reads from -- Card on
// File is intentionally left registration-only for now (booking_requests has
// no stripe_* columns yet), _bdRender() hides that section for kind='req'.
function _bdSubject(){
  if(_bdKind==='req'){
    const r=_bdReqCache;if(!r)return null;
    return {
      id:r.id,guestName:`${r.firstName||''} ${r.lastName||''}`.trim()||'Guest',guestEmail:r.email||'',
      room:r.room||r.roomTypeName||'—',
      checkIn:r.checkIn,checkOut:r.checkOut,notes:r.notes||r.dietary||'',
      checkedInAt:r.checkedInAt||null,checkedOutAt:r.checkedOutAt||null,
      rate:r.dailyRate!=null?Number(r.dailyRate):null,adults:r.adults||1,
      sourceLabel:r.source||null,retreatLabel:null,retreatBkId:null,
      folioCol:'booking_request_id',bookingType:'room_only',
      stripeCustomerId:null,stripePaymentMethodId:null,stripeCardBrand:null,stripeCardLast4:null,
    };
  }
  const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return null;
  const bk=AppData.bookings.find(b=>b.id===reg.bookingId);if(!bk)return null;
  const guest=(reg.guests||[]).find(g=>g.name)||{name:'Guest'};
  const gc=(reg.guests||[]).filter(g=>g.name).length||1;
  const rt=AppData.roomTypes.find(r=>(r.rooms||[]).includes(reg.room));
  const checkIn=reg.checkIn||bk.startDate,checkOut=reg.checkOut||bk.endDate;
  const nights=Math.max(1,Math.round((pd(checkOut)-pd(checkIn))/DAY_MS));
  const rate=reg.customRateOverride!=null?Number(reg.customRateOverride):(rt?getRoomRate(rt,gc,checkIn,nights):0);
  return {
    id:reg.id,guestName:guest.name,guestEmail:guest.email||'',
    room:reg.room||'—',
    checkIn,checkOut,notes:reg.notes||'',
    checkedInAt:reg.checkedInAt||null,checkedOutAt:reg.checkedOutAt||null,
    rate,adults:gc,sourceLabel:bk.source?_bdSourceLabel(bk.source):null,
    retreatLabel:bk.leaderName||bk.retreatName||'',retreatBkId:bk.id,
    folioCol:'registration_id',bookingType:bk.bookingType,
    stripeCustomerId:reg.stripeCustomerId,stripePaymentMethodId:reg.stripePaymentMethodId,
    stripeCardBrand:reg.stripeCardBrand,stripeCardLast4:reg.stripeCardLast4,
  };
}

const _BD_PAY_METHODS=['Cash','Zelle','Venmo','Paypal','Bank Transfer','Clip','Credit Card (Stripe)','Card on File'];

function _bdCardLabel(reg){
  const brand=reg.stripeCardBrand?reg.stripeCardBrand.charAt(0).toUpperCase()+reg.stripeCardBrand.slice(1):'Card';
  return reg.stripeCardLast4?`${brand} •••• ${reg.stripeCardLast4}`:brand;
}

function _bdShortId(id){return String(id||'').replace(/-/g,'').slice(-6).toUpperCase();}
// Friendly label for bookings.source (raw values like 'wetravel' are machine-friendly
// keys, not what a person should see) — mirrors staging's Source field, shown here
// alongside (not instead of) the Retreat link, since a source like WeTravel still has
// a real multi-guest room list worth jumping into, unlike staging's single-room "request"
// bookings this field originally described there.
function _bdSourceLabel(source){
  const KNOWN={wetravel:'WeTravel'};
  return KNOWN[source]||source;
}

// Clicking the retreat name opens the ADMIN's own Registration tab (full room-list
// management for staff), not the teacher-facing preview, in a NEW tab so this booking
// detail stays open behind it. ama_admin_return_bk is the same flag exitTeacherModeFully()
// uses to land back on a specific retreat's Registration tab — window.open() copies
// this tab's sessionStorage (staff login included) into the new one, and that new
// tab's own initStaffLogin() picks the flag up and calls regSelectRetreat() itself.
function _bdGoToRegistration(bkId){
  if(!bkId)return;
  sessionStorage.setItem('ama_admin_return_bk',bkId);
  window.open(location.origin+'/booking-hub.html','_blank');
}

async function openBookingDetailForReg(regId,guestName){
  const reg=AppData.regs.find(r=>r.id===regId);if(!reg)return;
  const bk=AppData.bookings.find(b=>b.id===reg.bookingId);if(!bk)return;
  _bdKind='reg';_bdId=regId;_bdReqCache=null;_bdAddOpen={};
  _bdGuestNameOverride=guestName||(reg.guests||[]).find(g=>g.name)?.name||'Guest';
  document.getElementById('bdBody').innerHTML='<div style="padding:60px 20px;text-align:center;color:var(--muted);font-size:13px">Loading folio…</div>';
  openModal('bookingDetailModal');
  await _bdLoadFolios();
}

// Individual Booking Engine reservation (no registrations row at all -- see
// booking-engine-admin.js's beFetchRequests()). Opened from
// modules/reservations.js's Arrivals/In House/Departures/Search tabs.
let _bdGuestNameOverride=null;
async function openBookingDetailForRequest(requestId){
  _bdKind='req';_bdId=requestId;_bdGuestNameOverride=null;_bdAddOpen={};
  document.getElementById('bdBody').innerHTML='<div style="padding:60px 20px;text-align:center;color:var(--muted);font-size:13px">Loading folio…</div>';
  openModal('bookingDetailModal');
  try{
    const {data,error}=await db.from('booking_requests').select('*').eq('id',requestId).maybeSingle();
    if(error)throw error;
    if(!data)throw new Error('Reservation not found');
    _bdReqCache=_bdReqSqlToApp(data);
  }catch(e){
    document.getElementById('bdBody').innerHTML=`<div style="padding:40px 20px;text-align:center;color:#dc2626;font-size:13px">Could not load reservation: ${escHtml(e.message||String(e))}</div>`;
    return;
  }
  await _bdLoadFolios();
}

async function _bdLoadFolios(){
  const subj=_bdSubject();if(!subj)return;
  const guestName=_bdKind==='reg'?(_bdGuestNameOverride||subj.guestName):subj.guestName;
  try{
    let {data:folios,error}=await db.from('folios').select('*').eq(subj.folioCol,subj.id).eq('guest_name',guestName);
    if(error)throw error;
    if(!folios||!folios.length){
      const token=uid().replace(/[^a-z0-9]/gi,'');
      const {data:created,error:cErr}=await db.from('folios').insert({[subj.folioCol]:subj.id,guest_name:guestName,name:guestName,payment_token:token,status:'open'}).select().single();
      if(cErr)throw cErr;
      folios=[created];
    }
    const folioIds=folios.map(f=>f.id);
    const {data:items,error:iErr}=await db.from('folio_items').select('*').in('folio_id',folioIds).order('created_at',{ascending:true});
    if(iErr)throw iErr;
    _bdFolios=folios.map(f=>({folio:f,items:(items||[]).filter(i=>i.folio_id===f.id)}));
    _bdRender();
  }catch(e){
    document.getElementById('bdBody').innerHTML=`<div style="padding:40px 20px;text-align:center;color:#dc2626;font-size:13px">Could not load folio: ${escHtml(e.message||String(e))}</div>`;
  }
}

function _bdItemTotal(i){return Number(i.qty)*Number(i.unit_price)*(1+(Number(i.tax_rate)||0)/100);}
function _bdFolioTotal(f){return f.items.reduce((s,i)=>s+_bdItemTotal(i),0);}
function _bdBalanceDue(){return _bdFolios.filter(f=>f.folio.status==='open').reduce((s,f)=>s+_bdFolioTotal(f),0);}

function _bdRender(){
  const subj=_bdSubject();if(!subj)return;
  const nights=Math.max(1,Math.round((pd(subj.checkOut)-pd(subj.checkIn))/DAY_MS));
  const roomTotal=nights*(subj.rate||0);
  const balanceDue=_bdBalanceDue();
  const statusBadge=subj.checkedOutAt?{label:'Checked Out',bg:'rgba(255,255,255,.15)'}:subj.checkedInAt?{label:'In House',bg:'rgba(34,197,94,.25)'}:{label:'Expected',bg:'rgba(255,255,255,.15)'};

  const hBtnS='background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.35);padding:6px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'Jost\',sans-serif';
  let headerBtns='';
  if(!subj.checkedInAt) headerBtns+=`<button onclick="bdCheckIn()" style="${hBtnS}">Check In</button>`;
  else if(!subj.checkedOutAt) headerBtns+=`<button onclick="bdCheckOut()" style="${hBtnS}">Check Out</button>`;
  else headerBtns+=`<button onclick="bdUndoCheckOut()" style="${hBtnS}">Undo Check Out</button>`;
  headerBtns+=`<button onclick="bdDeleteReservation()" style="${hBtnS};border-color:rgba(239,68,68,.6);color:#fca5a5">Delete</button>`;

  document.getElementById('bdHdr').innerHTML=`
    <div style="display:flex;align-items:center;gap:14px">
      <button onclick="closeModal('bookingDetailModal')" style="${hBtnS}">&larr; Back</button>
      <div style="font-size:15px;font-weight:700">Booking <span style="font-weight:400;opacity:.85">${escHtml(subj.guestName)}, ${fmtDate(subj.checkIn)}, #${_bdShortId(subj.id)}</span></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      ${headerBtns}
      <span style="background:${statusBadge.bg};padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700">${statusBadge.label}</span>
    </div>`;

  document.getElementById('bdBody').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;padding:24px 28px;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">📅 Booking</div>
        <table style="width:100%;font-size:13px">
          <tr><td style="color:var(--muted);padding:5px 0;width:90px">Period</td><td style="padding:5px 0">${fmtDate(subj.checkIn)} — ${fmtDate(subj.checkOut)} <span style="color:var(--muted)">(${nights} night${nights!==1?'s':''})</span></td></tr>
          ${subj.retreatLabel!=null?`<tr><td style="color:var(--muted);padding:5px 0">Retreat</td><td style="padding:5px 0"><span onclick="_bdGoToRegistration('${subj.retreatBkId}')" title="Open this retreat's Registration tab" style="color:#1d4ed8;cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px">${escHtml(subj.retreatLabel)}</span></td></tr>`:''}
          ${subj.sourceLabel?`<tr><td style="color:var(--muted);padding:5px 0">Source</td><td style="padding:5px 0;color:#1d4ed8;font-weight:600">${escHtml(subj.sourceLabel)}</td></tr>`:''}
          <tr><td style="color:var(--muted);padding:5px 0">Room</td><td style="padding:5px 0;font-weight:700">${escHtml(subj.room||'—')}</td></tr>
          <tr><td style="color:var(--muted);padding:5px 0">Rate</td><td style="padding:5px 0;color:#059669;font-weight:700">${subj.rate!=null?fmt$(subj.rate)+'/night':'—'}</td></tr>
        </table>
        <div style="margin-top:10px">
          <label style="font-size:11px;color:var(--muted);font-weight:600;display:block;margin-bottom:4px">Notes</label>
          <textarea id="bdNotes" placeholder="Internal notes..." style="width:100%;min-height:60px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:'Jost',sans-serif;font-size:12.5px;resize:vertical">${escHtml(subj.notes||'')}</textarea>
          <button class="btn btn-secondary btn-sm" onclick="bdSaveNotes()" style="margin-top:6px">Save</button>
        </div>
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">👤 Guest</div>
        <table style="width:100%;font-size:13px">
          <tr><td style="color:var(--muted);padding:5px 0;width:110px">Name</td><td style="padding:5px 0;font-weight:700">${escHtml(subj.guestName)}</td></tr>
          <tr><td style="color:var(--muted);padding:5px 0">Adults</td><td style="padding:5px 0">${subj.adults}</td></tr>
          ${subj.guestEmail?`<tr><td style="color:var(--muted);padding:5px 0">Email</td><td style="padding:5px 0">${escHtml(subj.guestEmail)}</td></tr>`:''}
        </table>
        <div style="margin-top:14px;padding:12px 14px;background:#fef2f2;border-radius:10px">
          <div style="font-size:11px;color:var(--muted);font-weight:600">Balance Due</div>
          <div style="font-size:22px;font-weight:800;color:${balanceDue>0?'#dc2626':'#059669'}">${fmt$(balanceDue)}</div>
        </div>
        ${subj.rate!=null?`<div style="margin-top:8px;font-size:12px;color:var(--muted)">Room Total &nbsp; ${nights} × ${fmt$(subj.rate)} = ${fmt$(roomTotal)}</div>`:''}
        ${_bdKind==='reg'?`<div style="margin-top:10px">
          ${subj.stripePaymentMethodId
            ?`<span style="font-size:12px;color:#374151">💳 ${escHtml(_bdCardLabel(subj))} on file</span>
              <button class="btn btn-secondary btn-sm" onclick="bdOpenSaveCard()" style="margin-left:8px;padding:2px 10px;font-size:11px">Update</button>
              <button class="btn btn-danger btn-sm" onclick="bdRemoveCard()" style="margin-left:4px;padding:2px 10px;font-size:11px">Remove</button>`
            :`<button class="btn btn-secondary btn-sm" onclick="bdOpenSaveCard()">💳 Save Card</button>`}
        </div>`:''}
      </div>
    </div>
    <div style="padding:20px 28px 28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">💳 Rate and Folios</div>
        <button class="btn btn-secondary btn-sm" onclick="bdAddFolio()">+ Add Folio</button>
      </div>
      ${_bdFolios.map(f=>_bdFolioRowHtml(f)).join('')}
    </div>`;
}

function _bdFolioRowHtml(f){
  const total=_bdFolioTotal(f);
  const isOpen=f.folio.status==='open';
  const fid=f.folio.id;
  const itemRows=f.items.map(i=>{
    const isPayment=Number(i.unit_price)<0;
    const lineTotal=_bdItemTotal(i);
    return `<tr style="${isPayment?'background:#f0fdf4':''}">
      <td style="padding:8px 12px;font-size:12.5px">${isPayment?'💳 ':''}${escHtml(i.description||'')}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;color:var(--muted)">${Number(i.qty)}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;color:var(--muted)">${fmt$(i.unit_price)}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;color:var(--muted)">${i.tax_rate?i.tax_rate+'%':'—'}</td>
      <td style="padding:8px 12px;font-size:12.5px;text-align:right;font-weight:700;color:${isPayment?'#059669':'inherit'}">${fmt$(lineTotal)}</td>
      <td style="padding:8px 12px;text-align:right;white-space:nowrap">
        ${isOpen?`<button class="btn btn-secondary btn-sm" onclick="bdEditItem('${fid}','${i.id}')" style="padding:2px 8px;font-size:11px">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="bdDeleteItem('${fid}','${i.id}')" style="padding:2px 8px;font-size:11px">✕</button>`:''}
      </td>
    </tr>`;
  }).join('');
  const addFormHtml=_bdAddOpen[fid]?`
    <tr>
      <td style="padding:6px 12px" colspan="2"><input id="bdc-desc-${fid}" placeholder="Description" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px"></td>
      <td style="padding:6px 12px"><input id="bdc-price-${fid}" type="number" step="0.01" placeholder="Price" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px"></td>
      <td style="padding:6px 12px"><input id="bdc-tax-${fid}" type="number" step="0.01" placeholder="Tax%" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px"></td>
      <td colspan="2" style="padding:6px 12px;text-align:right"><button class="btn btn-primary btn-sm" onclick="bdAddItem('${fid}')">+ Add</button></td>
    </tr>`:'';
  return `<div style="border:1px solid var(--border);border-radius:12px;margin-bottom:14px;overflow:hidden">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#f8fafc;border-bottom:1px solid var(--border)">
      <div>
        <span style="font-weight:700;font-size:13.5px">${escHtml(f.folio.name)}</span>
        <span style="margin-left:10px;font-size:12px;color:var(--muted)">Total ${fmt$(total)}</span>
        <span style="margin-left:10px;font-size:12px;font-weight:700;color:${total>0?'#dc2626':'#059669'}">Balance ${fmt$(total)}</span>
        <span style="margin-left:10px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${isOpen?'#fef3c7':'#dcfce7'};color:${isOpen?'#92400e':'#15803d'}">${f.folio.status.toUpperCase()}</span>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-primary btn-sm" onclick="bdCopyGuestLink('${f.folio.payment_token}')">Send to Guest</button>
        ${isOpen?`<button class="btn btn-secondary btn-sm" onclick="bdCloseFolio('${fid}')">Close</button>`:''}
        <button class="btn btn-danger btn-sm" onclick="bdDeleteFolioRow('${fid}')">Delete</button>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">
        <th style="text-align:left;padding:6px 12px">Description</th><th style="text-align:right;padding:6px 12px">Qty</th>
        <th style="text-align:right;padding:6px 12px">Unit Price</th><th style="text-align:right;padding:6px 12px">Tax</th>
        <th style="text-align:right;padding:6px 12px">Total</th><th style="padding:6px 12px"></th>
      </tr></thead>
      <tbody>${itemRows||`<tr><td colspan="6" style="padding:14px 12px;text-align:center;color:var(--muted);font-size:12px">No charges yet.</td></tr>`}
      ${isOpen?`<tr><td colspan="6" style="padding:6px 12px"><button class="btn btn-secondary btn-sm" onclick="bdToggleAdd('${fid}')" style="font-size:11px">${_bdAddOpen[fid]?'Cancel':'+ Add manually'}</button></td></tr>${addFormHtml}`:''}
      </tbody>
    </table>
    ${isOpen?_bdPaymentRowHtml(fid):''}
  </div>`;
}

function _bdPaymentRowHtml(fid){
  // Card on File is registration-only for now (booking_requests has no
  // stripe_* columns yet) -- don't offer an option that would silently no-op.
  const methods=_bdKind==='req'?_BD_PAY_METHODS.filter(m=>m!=='Card on File'):_BD_PAY_METHODS;
  return `<div style="display:flex;gap:8px;align-items:center;padding:10px 16px;background:#f8fafc;border-top:1px solid var(--border);flex-wrap:wrap">
    <span style="font-size:11px;font-weight:700;color:var(--muted)">Payment</span>
    <select id="bd-pay-method-${fid}" onchange="bdOnPayMethodChange('${fid}')" style="padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px">
      ${methods.map(m=>`<option value="${m}">${m}</option>`).join('')}
    </select>
    <input id="bd-pay-amount-${fid}" type="number" step="0.01" placeholder="Amount" style="width:100px;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px">
    <input id="bd-pay-ref-${fid}" type="text" placeholder="Reference (optional)" style="flex:1;min-width:120px;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px">
    <button id="bd-pay-btn-${fid}" class="btn btn-primary btn-sm" onclick="bdRecordPayment('${fid}')">Record</button>
  </div>`;
}

function bdOnPayMethodChange(fid){
  const method=document.getElementById(`bd-pay-method-${fid}`)?.value;
  const btn=document.getElementById(`bd-pay-btn-${fid}`);if(!btn)return;
  const amountEl=document.getElementById(`bd-pay-amount-${fid}`);
  if(method==='Credit Card (Stripe)'||method==='Card on File'){
    btn.textContent=method==='Card on File'?'💳 Charge Card on File':'💳 Charge Card';
    btn.onclick=method==='Card on File'?()=>bdChargeCardOnFile(fid):()=>bdOpenStripePayment(fid);
    const f=_bdFolios.find(x=>x.folio.id===fid);
    if(amountEl&&(!amountEl.value||parseFloat(amountEl.value)===0)&&f){const bal=_bdFolioTotal(f);if(bal>0)amountEl.value=bal.toFixed(2);}
  }else{
    btn.textContent='Record';
    btn.onclick=()=>bdRecordPayment(fid);
  }
}

async function bdChargeCardOnFile(fid){
  const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return;
  if(!reg.stripePaymentMethodId){showToast('No hay tarjeta guardada para este huésped — guarda una primero con "Save Card".');return;}
  const amount=parseFloat(document.getElementById(`bd-pay-amount-${fid}`)?.value);
  if(!amount||amount<=0){showToast('Enter a valid amount');return;}
  const btn=document.getElementById(`bd-pay-btn-${fid}`);
  const origLabel=btn.textContent;btn.disabled=true;btn.textContent='Cobrando…';
  try{
    const res=await fetch('/.netlify/functions/charge-card-on-file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({regId:_bdId,folioId:fid,amount,description:'Amansala · Folio charge'})});
    const data=await res.json();
    if(!res.ok||data.error)throw new Error(data.error||'No se pudo cobrar');
    showToast('Tarjeta cobrada ✓');
    const f=_bdFolios.find(x=>x.folio.id===fid);
    await _bdLoadFolios();
  }catch(e){
    showToast(e.message||'Error al cobrar la tarjeta');
    btn.disabled=false;btn.textContent=origLabel;
  }
}

async function bdToggleAdd(fid){_bdAddOpen[fid]=!_bdAddOpen[fid];_bdRender();}

async function bdAddItem(fid){
  const desc=document.getElementById(`bdc-desc-${fid}`)?.value.trim();
  const price=parseFloat(document.getElementById(`bdc-price-${fid}`)?.value);
  const tax=parseFloat(document.getElementById(`bdc-tax-${fid}`)?.value)||0;
  if(!desc||isNaN(price)){showToast('Enter a description and price');return;}
  const {error}=await db.from('folio_items').insert({folio_id:fid,description:desc,qty:1,unit_price:price,tax_rate:tax});
  if(error){showToast('Error: '+error.message);return;}
  _bdAddOpen[fid]=false;
  await _bdLoadFolios();
}

async function bdEditItem(fid,itemId){
  const f=_bdFolios.find(x=>x.folio.id===fid);const item=f?.items.find(i=>i.id===itemId);if(!item)return;
  const desc=prompt('Description',item.description);if(desc==null)return;
  const price=parseFloat(prompt('Unit price',item.unit_price));if(isNaN(price))return;
  const tax=parseFloat(prompt('Tax %',item.tax_rate||0))||0;
  const {error}=await db.from('folio_items').update({description:desc,unit_price:price,tax_rate:tax}).eq('id',itemId);
  if(error){showToast('Error: '+error.message);return;}
  await _bdLoadFolios();
}

async function bdDeleteItem(fid,itemId){
  if(!confirm('Remove this charge?'))return;
  const f=_bdFolios.find(x=>x.folio.id===fid);
  const {error}=await db.from('folio_items').delete().eq('id',itemId);
  if(error){showToast('Error: '+error.message);return;}
  await _bdLoadFolios();
}

async function bdRecordPayment(fid){
  const method=document.getElementById(`bd-pay-method-${fid}`)?.value;
  const amount=parseFloat(document.getElementById(`bd-pay-amount-${fid}`)?.value);
  const ref=document.getElementById(`bd-pay-ref-${fid}`)?.value.trim();
  if(!amount||amount<=0){showToast('Enter a valid amount');return;}
  const description=`Payment — ${method}${ref?': '+ref:''}`;
  const {error}=await db.from('folio_items').insert({folio_id:fid,description,qty:1,unit_price:-amount,tax_rate:0});
  if(error){showToast('Error recording payment: '+error.message);return;}
  showToast('Payment recorded ✓');
  const f=_bdFolios.find(x=>x.folio.id===fid);
  await _bdLoadFolios();
}

async function bdCloseFolio(fid){
  const {error}=await db.from('folios').update({status:'closed'}).eq('id',fid);
  if(error){showToast('Error: '+error.message);return;}
  const f=_bdFolios.find(x=>x.folio.id===fid);
  await _bdLoadFolios();
}

async function bdDeleteFolioRow(fid){
  if(!confirm('Delete this folio and all its charges?'))return;
  const f=_bdFolios.find(x=>x.folio.id===fid);
  await db.from('folio_items').delete().eq('folio_id',fid);
  const {error}=await db.from('folios').delete().eq('id',fid);
  if(error){showToast('Error: '+error.message);return;}
  await _bdLoadFolios();
}

async function bdAddFolio(){
  const subj=_bdSubject();if(!subj)return;
  const guestName=_bdFolios[0]?.folio.guest_name||subj.guestName;
  const name=prompt('Folio name',guestName);if(!name)return;
  const token=uid().replace(/[^a-z0-9]/gi,'');
  const {error}=await db.from('folios').insert({[subj.folioCol]:subj.id,guest_name:guestName,name,payment_token:token,status:'open'});
  if(error){showToast('Error: '+error.message);return;}
  await _bdLoadFolios();
}

function bdCopyGuestLink(token){
  const url=`${location.origin}/guest-pay.html?token=${token}`;
  navigator.clipboard.writeText(url).then(()=>showToast('Guest link copied to clipboard!')).catch(()=>{
    const ta=document.createElement('textarea');ta.value=url;ta.style.cssText='position:fixed;left:-9999px';
    document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);
    showToast('Guest link copied!');
  });
}

// Notifies modules/reservations.js (if its Arrivals/In House/Departures/
// Search tab is open) to refetch after a booking_requests row changes here --
// that page keeps its own local copy since booking_requests isn't part of
// AppData, unlike registrations (mutated in place above, already live).
function _bdNotifyReqChanged(){if(typeof resRefresh==='function')resRefresh();}

async function bdSaveNotes(){
  const notes=document.getElementById('bdNotes')?.value||'';
  if(_bdKind==='req'){
    const {error}=await db.from('booking_requests').update({notes}).eq('id',_bdId);
    if(error){showToast('Error: '+error.message);return;}
    if(_bdReqCache)_bdReqCache.notes=notes;
    _bdNotifyReqChanged();
  }else{
    const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return;
    const {error}=await db.from('registrations').update({notes}).eq('id',reg.id);
    if(error){showToast('Error: '+error.message);return;}
    reg.notes=notes;
  }
  showToast('Notes saved ✓');
}

async function bdCheckIn(){
  const now=new Date().toISOString();
  if(_bdKind==='req'){
    const {error}=await db.from('booking_requests').update({checked_in_at:now,status:'in_house'}).eq('id',_bdId);
    if(error){showToast('Error: '+error.message);return;}
    if(_bdReqCache){_bdReqCache.checkedInAt=now;_bdReqCache.status='in_house';}
    _bdNotifyReqChanged();
  }else{
    const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return;
    const {error}=await db.from('registrations').update({checked_in_at:now}).eq('id',reg.id);
    if(error){showToast('Error: '+error.message);return;}
    reg.checkedInAt=now;
  }
  showToast('Checked in ✓');
  _bdRender();
}

async function bdCheckOut(){
  const subj=_bdSubject();if(!subj)return;
  // Check In and Check Out share the same button spot, so a double-click on
  // Check In used to check the guest straight back out a second later (real
  // incident 2026-09-25, Binnie & Minnie CH14). Ignore Check Out clicks for a
  // few seconds after check-in, and always ask before checking out.
  if(subj.checkedInAt&&Date.now()-new Date(subj.checkedInAt).getTime()<5000)return;
  if(!confirm(`Check out ${subj.guestName||'this guest'} from room ${subj.room}?`))return;
  const now=new Date().toISOString();
  if(_bdKind==='req'){
    const {error}=await db.from('booking_requests').update({checked_out_at:now,status:'checked_out'}).eq('id',_bdId);
    if(error){showToast('Error: '+error.message);return;}
    if(_bdReqCache){_bdReqCache.checkedOutAt=now;_bdReqCache.status='checked_out';}
    _bdNotifyReqChanged();
  }else{
    const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return;
    const {error}=await db.from('registrations').update({checked_out_at:now}).eq('id',reg.id);
    if(error){showToast('Error: '+error.message);return;}
    reg.checkedOutAt=now;
  }
  showToast('Checked out ✓');
  _bdRender();
}

async function bdUndoCheckOut(){
  if(!confirm('Undo check-out? The guest goes back to In House.'))return;
  if(_bdKind==='req'){
    const {error}=await db.from('booking_requests').update({checked_out_at:null,status:'in_house'}).eq('id',_bdId);
    if(error){showToast('Error: '+error.message);return;}
    if(_bdReqCache){_bdReqCache.checkedOutAt=null;_bdReqCache.status='in_house';}
    _bdNotifyReqChanged();
  }else{
    const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return;
    const {error}=await db.from('registrations').update({checked_out_at:null}).eq('id',reg.id);
    if(error){showToast('Error: '+error.message);return;}
    reg.checkedOutAt=null;
  }
  showToast('Check-out undone ✓ — back In House');
  _bdRender();
}

async function bdDeleteReservation(){
  if(_bdKind==='req'){
    const subj=_bdSubject();if(!subj)return;
    if(!confirm(`Cancel ${subj.guestName||'this'} reservation?`))return;
    const {error}=await db.from('booking_requests').update({status:'declined'}).eq('id',_bdId);
    if(error){showToast('Error: '+error.message);return;}
    if(_bdReqCache)_bdReqCache.status='declined';
    showToast('Reservation cancelled ✓');
    closeModal('bookingDetailModal');
    _bdNotifyReqChanged();
    return;
  }
  const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return;
  const bookingId=reg.bookingId;
  const _bk=AppData.bookings.find(b=>b.id===bookingId);
  // Only a Room Only booking IS this one room — cancelling the booking there is
  // right. For a retreat, the booking is the whole group: cancelling it hid
  // every room of the retreat from the calendar (real incident 2026-09-25:
  // deleting room 21 cancelled all of Loco Luxury on its arrival day). For a
  // retreat, remove just this room's registration and leave the booking alone.
  if(_bk&&_bk.bookingType!=='room_only'){
    const names=(reg.guests||[]).map(g=>g.name).filter(Boolean).join(', ');
    if(!confirm(`Remove ${names||'this guest'} from room ${reg.room}?\n\nOnly this room's registration is removed — the rest of ${_bk.leaderName||_bk.retreatName||'the retreat'} is not touched.`))return;
    const {error:rErr}=await db.from('registrations').delete().eq('id',reg.id);
    if(rErr){showToast('Error: '+rErr.message);return;}
    AppData.regs=AppData.regs.filter(r=>r.id!==reg.id);
    if(typeof logActivity==='function')logActivity('Guest removed from room',`${names||'Guest'} · ${reg.room} · ${_bk.leaderName||_bk.retreatName||''}`,bookingId);
    showToast(`Removed from room ${reg.room} ✓ — retreat not changed`);
    closeModal('bookingDetailModal');
    if(typeof venBuild==='function')venBuild();
    if(typeof rcBuild==='function')rcBuild();
    return;
  }
  if(!confirm('Cancel this reservation? This action will mark the booking as cancelled.'))return;
  const {error:bErr}=await db.from('bookings').update({status:'cancelled'}).eq('id',bookingId);
  if(bErr){showToast('Error: '+bErr.message);return;}
  const {error:rErr}=await db.from('registrations').delete().eq('id',reg.id);
  if(rErr){showToast('Error: '+rErr.message);return;}
  const bk=AppData.bookings.find(b=>b.id===bookingId);if(bk)bk.status='cancelled';
  AppData.regs=AppData.regs.filter(r=>r.id!==reg.id);
  showToast('Reservation cancelled ✓');
  closeModal('bookingDetailModal');
  if(typeof venBuild==='function')venBuild();
}

// ── Admin "Charge Card" (Stripe) ──
let _bdStripe=null,_bdStripeElems=null,_bdStripeFolioId=null,_bdStripeAmt=0;

async function bdOpenStripePayment(fid){
  const amount=parseFloat(document.getElementById(`bd-pay-amount-${fid}`)?.value);
  if(!amount||amount<=0){showToast('Enter a valid amount');return;}
  _bdStripeFolioId=fid;_bdStripeAmt=amount;_bdStripe=null;_bdStripeElems=null;

  let modal=document.getElementById('bdStripeModal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='bdStripeModal';
    modal.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;align-items:center;justify-content:center';
    modal.innerHTML=`<div style="background:#fff;border-radius:14px;width:420px;max-width:96vw;max-height:90vh;overflow-y:auto;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.4)">
      <div style="font-size:16px;font-weight:800;color:#111827;margin-bottom:4px">Credit Card Payment</div>
      <div id="bdStripeAmtLabel" style="font-size:13px;color:#6b7280;margin-bottom:18px"></div>
      <div id="bdStripeEl" style="border:1.5px solid #e5e7eb;border-radius:8px;padding:12px;min-height:44px;margin-bottom:8px"><div style="color:#9ca3af;font-size:13px">Loading payment form…</div></div>
      <div id="bdStripeErr" style="color:#dc2626;font-size:12px;margin-bottom:8px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
        <button onclick="document.getElementById('bdStripeModal').style.display='none'" style="padding:8px 18px;border:1.5px solid #d1d5db;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif">Cancel</button>
        <button id="bdStripePayBtn" onclick="bdConfirmStripe()" disabled style="padding:8px 20px;border:none;border-radius:8px;background:#7c3aed;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Jost',sans-serif;opacity:.5">Loading…</button>
      </div>
      <div style="font-size:10px;color:#9ca3af;text-align:center;margin-top:10px">🔒 Secured by Stripe</div>
    </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('bdStripeAmtLabel').textContent=`Amount: ${fmt$(amount)}`;
  document.getElementById('bdStripeErr').textContent='';
  const payBtn=document.getElementById('bdStripePayBtn');
  payBtn.textContent='Loading…';payBtn.disabled=true;payBtn.style.opacity='.5';
  modal.style.display='flex';

  try{
    if(!window.Stripe){
      await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://js.stripe.com/v3/';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
    }
    const res=await fetch('/.netlify/functions/create-payment-intent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount,description:'Amansala · Folio charge',folioId:fid})});
    const data=await res.json();
    if(!res.ok||data.error)throw new Error(data.error||'Payment setup failed');
    _bdStripe=Stripe(data.publishableKey);
    _bdStripeElems=_bdStripe.elements({clientSecret:data.clientSecret,appearance:{theme:'stripe',variables:{fontFamily:'Jost, sans-serif',borderRadius:'6px',colorPrimary:'#7c3aed'}}});
    _bdStripeElems.create('payment',{wallets:{link:'never'}}).mount('#bdStripeEl');
    payBtn.textContent=`Pay ${fmt$(amount)}`;payBtn.disabled=false;payBtn.style.opacity='1';
  }catch(e){
    document.getElementById('bdStripeErr').textContent=e.message||'Could not load payment form.';
  }
}

// ── "Save Card" (Stripe SetupIntent) — vault a card at check-in without
// charging it, so later folio charges can use "Card on File" instead of a
// one-time payment link (Jorge's ask 2026-09-25). Mirrors bdOpenStripePayment/
// bdConfirmStripe's modal pattern exactly, but for setup instead of payment.
let _bdSaveCardStripe=null,_bdSaveCardElems=null;

async function bdOpenSaveCard(){
  _bdSaveCardStripe=null;_bdSaveCardElems=null;

  let modal=document.getElementById('bdSaveCardModal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='bdSaveCardModal';
    modal.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;align-items:center;justify-content:center';
    modal.innerHTML=`<div style="background:#fff;border-radius:14px;width:420px;max-width:96vw;max-height:90vh;overflow-y:auto;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.4)">
      <div style="font-size:16px;font-weight:800;color:#111827;margin-bottom:4px">Save Card on File</div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:18px">No se cobra nada ahora — se guarda para cargos futuros al folio.</div>
      <div id="bdSaveCardEl" style="border:1.5px solid #e5e7eb;border-radius:8px;padding:12px;min-height:44px;margin-bottom:8px"><div style="color:#9ca3af;font-size:13px">Loading form…</div></div>
      <div id="bdSaveCardErr" style="color:#dc2626;font-size:12px;margin-bottom:8px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
        <button onclick="document.getElementById('bdSaveCardModal').style.display='none'" style="padding:8px 18px;border:1.5px solid #d1d5db;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif">Cancel</button>
        <button id="bdSaveCardBtn" onclick="bdConfirmSaveCard()" disabled style="padding:8px 20px;border:none;border-radius:8px;background:#7c3aed;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Jost',sans-serif;opacity:.5">Loading…</button>
      </div>
      <div style="font-size:10px;color:#9ca3af;text-align:center;margin-top:10px">🔒 Secured by Stripe</div>
    </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('bdSaveCardErr').textContent='';
  const saveBtn=document.getElementById('bdSaveCardBtn');
  saveBtn.textContent='Loading…';saveBtn.disabled=true;saveBtn.style.opacity='.5';
  modal.style.display='flex';

  try{
    if(!window.Stripe){
      await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://js.stripe.com/v3/';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
    }
    const res=await fetch('/.netlify/functions/create-card-setup-intent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({regId:_bdId})});
    const data=await res.json();
    if(!res.ok||data.error)throw new Error(data.error||'No se pudo iniciar el guardado de tarjeta');
    _bdSaveCardStripe=Stripe(data.publishableKey);
    _bdSaveCardElems=_bdSaveCardStripe.elements({clientSecret:data.clientSecret,appearance:{theme:'stripe',variables:{fontFamily:'Jost, sans-serif',borderRadius:'6px',colorPrimary:'#7c3aed'}}});
    _bdSaveCardElems.create('payment',{wallets:{link:'never'}}).mount('#bdSaveCardEl');
    saveBtn.textContent='Save Card';saveBtn.disabled=false;saveBtn.style.opacity='1';
  }catch(e){
    document.getElementById('bdSaveCardErr').textContent=e.message||'Could not load card form.';
  }
}

async function bdConfirmSaveCard(){
  if(!_bdSaveCardStripe||!_bdSaveCardElems)return;
  const saveBtn=document.getElementById('bdSaveCardBtn');
  const errEl=document.getElementById('bdSaveCardErr');
  errEl.textContent='';saveBtn.disabled=true;saveBtn.textContent='Guardando…';
  try{
    const {error,setupIntent}=await _bdSaveCardStripe.confirmSetup({elements:_bdSaveCardElems,confirmParams:{return_url:window.location.href},redirect:'if_required'});
    if(error){errEl.textContent=error.message;saveBtn.disabled=false;saveBtn.textContent='Save Card';return;}
    if(!setupIntent?.id){errEl.textContent='No se recibió confirmación de Stripe.';return;}
    const confirmRes=await fetch('/.netlify/functions/confirm-card-setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({setupIntentId:setupIntent.id,regId:_bdId})});
    const confirmData=await confirmRes.json();
    if(!confirmRes.ok||confirmData.error){errEl.textContent='Tarjeta guardada pero no se pudo confirmar: '+(confirmData.error||'error desconocido');return;}
    const reg=AppData.regs.find(r=>r.id===_bdId);
    if(reg){reg.stripeCustomerId=confirmData.customerId;reg.stripePaymentMethodId=confirmData.paymentMethodId;reg.stripeCardBrand=confirmData.brand;reg.stripeCardLast4=confirmData.last4;}
    document.getElementById('bdSaveCardModal').style.display='none';
    showToast('Tarjeta guardada ✓');
    _bdRender();
  }catch(e){
    errEl.textContent=e.message||'Error al guardar la tarjeta';
    saveBtn.disabled=false;saveBtn.textContent='Save Card';
  }
}

async function bdRemoveCard(){
  const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return;
  if(!confirm(`Quitar la tarjeta guardada (${_bdCardLabel(reg)})?`))return;
  try{
    const res=await fetch('/.netlify/functions/remove-card-on-file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({regId:_bdId})});
    const data=await res.json();
    if(!res.ok||data.error)throw new Error(data.error||'No se pudo quitar la tarjeta');
    reg.stripePaymentMethodId=null;reg.stripeCardBrand=null;reg.stripeCardLast4=null;
    showToast('Tarjeta eliminada ✓');
    _bdRender();
  }catch(e){
    showToast(e.message||'Error al quitar la tarjeta');
  }
}

async function bdConfirmStripe(){
  if(!_bdStripe||!_bdStripeElems)return;
  const payBtn=document.getElementById('bdStripePayBtn');
  const errEl=document.getElementById('bdStripeErr');
  errEl.textContent='';payBtn.disabled=true;payBtn.textContent='Processing…';
  try{
    const {error,paymentIntent}=await _bdStripe.confirmPayment({elements:_bdStripeElems,confirmParams:{return_url:window.location.href},redirect:'if_required'});
    if(error){errEl.textContent=error.message;payBtn.disabled=false;payBtn.textContent=`Pay ${fmt$(_bdStripeAmt)}`;return;}
    if(!paymentIntent?.id){errEl.textContent='Payment did not return a confirmation id.';return;}
    const confirmRes=await fetch('/.netlify/functions/confirm-folio-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paymentIntentId:paymentIntent.id,folioId:_bdStripeFolioId})});
    const confirmData=await confirmRes.json();
    if(!confirmRes.ok||confirmData.error){errEl.textContent='Charged but could not save: '+(confirmData.error||'unknown error');return;}
    document.getElementById('bdStripeModal').style.display='none';
    showToast('Payment charged ✓');
    const f=_bdFolios.find(x=>x.folio.id===_bdStripeFolioId);
    await _bdLoadFolios();
  }catch(e){
    errEl.textContent=e.message||'Payment error';
    payBtn.disabled=false;payBtn.textContent=`Pay ${fmt$(_bdStripeAmt)}`;
  }
}
