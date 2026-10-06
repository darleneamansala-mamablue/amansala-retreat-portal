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
let _bdKind='reg',_bdId=null,_bdReqCache=null,_bdFolios=[],_bdAddOpen={},_bdEditOpen={},_bdCommissionStaffByItem={};
// Edit mode for the Booking/Guest panel (name, phone, room, dates) -- Jorge's
// ask 2026-10-06: "no tenemos un boton editar que nos permita editar nombre,
// numero de telefono, cuarto, fechas". Separate from _bdEditOpen above (which
// toggles one folio line item at a time) -- this is one on/off switch for the
// whole panel, reset whenever the modal opens a new subject.
let _bdDetailEditMode=false;

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
      allGuests:[{name:`${r.firstName||''} ${r.lastName||''}`.trim()||'Guest',email:r.email||'',phone:r.phone||''}],
      room:r.room||r.roomTypeName||'—',
      checkIn:r.checkIn,checkOut:r.checkOut,notes:r.notes||r.dietary||'',
      checkedInAt:r.checkedInAt||null,checkedOutAt:r.checkedOutAt||null,
      rate:r.dailyRate!=null?Number(r.dailyRate):null,adults:r.adults||1,
      sourceLabel:r.source||null,retreatLabel:null,retreatBkId:null,
      folioCol:'booking_request_id',bookingType:'room_only',
      stripeCustomerId:null,stripePaymentMethodId:null,stripeCardBrand:null,stripeCardLast4:null,
      cancelled:r.status==='declined',
    };
  }
  const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return null;
  const bk=AppData.bookings.find(b=>b.id===reg.bookingId);if(!bk)return null;
  const namedGuests=(reg.guests||[]).filter(g=>g.name&&!g.cancelled);
  const guest=namedGuests[0]||{name:'Guest'};
  const gc=namedGuests.length||1;
  const rt=AppData.roomTypes.find(r=>(r.rooms||[]).includes(reg.room));
  const checkIn=reg.checkIn||bk.startDate,checkOut=reg.checkOut||bk.endDate;
  const nights=Math.max(1,Math.round((pd(checkOut)-pd(checkIn))/DAY_MS));
  const rate=reg.customRateOverride!=null?Number(reg.customRateOverride):(rt?getRoomRate(rt,gc,checkIn,nights):0);
  return {
    id:reg.id,guestName:guest.name,guestEmail:guest.email||'',
    // Every guest sharing this room (Jorge's ask 2026-09-26: single-bed rooms
    // like Sonu & Preeti Phabi in CH1 should show both people's contact info
    // here, not just the one this folio happens to be for -- each still has
    // their own separate folio below, unaffected).
    allGuests:namedGuests.length?namedGuests.map(g=>({name:g.name,email:g.email||'',phone:g.phone||''})):[{name:guest.name,email:guest.email||'',phone:guest.phone||''}],
    room:reg.room||'—',
    checkIn,checkOut,notes:reg.notes||'',
    checkedInAt:reg.checkedInAt||null,checkedOutAt:reg.checkedOutAt||null,
    rate,adults:gc,sourceLabel:bk.source?_bdSourceLabel(bk.source):null,
    retreatLabel:bk.leaderName||bk.retreatName||'',retreatBkId:bk.id,
    folioCol:'registration_id',bookingType:bk.bookingType,
    stripeCustomerId:reg.stripeCustomerId,stripePaymentMethodId:reg.stripePaymentMethodId,
    stripeCardBrand:reg.stripeCardBrand,stripeCardLast4:reg.stripeCardLast4,
    cancelled:!!reg.cancelled,
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
  _bdKind='reg';_bdId=regId;_bdReqCache=null;_bdAddOpen={};_bdEditOpen={};_bdDetailEditMode=false;
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
  _bdKind='req';_bdId=requestId;_bdGuestNameOverride=null;_bdAddOpen={};_bdEditOpen={};_bdDetailEditMode=false;
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

// A Split Stay reg (modules/booking-detail.js's bdConfirmSplitStay) is a
// separate `registrations` row purely so _calcRoomRevenue can bill each
// physical room correctly -- it's still the SAME guest's SAME stay, so the
// folio (charges/payments) should be shared across every segment, not
// re-created per room. Without this, each segment auto-created its own
// empty folio and a charge added on one half was invisible on the other --
// Jorge's report 2026-09-29: "los cargos no se ven en las dos partes del
// split" (this is also why it still felt like two separate reservations).
// Always anchor the folio to the chain's EARLIEST segment, whichever one is
// currently open.
function _bdFolioAnchorId(subj){
  if(_bdKind!=='reg')return subj.id;
  const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return subj.id;
  const bk=AppData.bookings.find(b=>b.id===reg.bookingId);if(!bk)return subj.id;
  const chain=_bdSplitChain(reg,bk);
  return chain.length>1?chain[0].id:subj.id;
}

async function _bdLoadFolios(){
  const subj=_bdSubject();if(!subj)return;
  const guestName=_bdKind==='reg'?(_bdGuestNameOverride||subj.guestName):subj.guestName;
  const folioSubjId=_bdFolioAnchorId(subj);
  try{
    let {data:folios,error}=await db.from('folios').select('*').eq(subj.folioCol,folioSubjId).eq('guest_name',guestName);
    if(error)throw error;
    if(!folios||!folios.length){
      const token=uid().replace(/[^a-z0-9]/gi,'');
      const {data:created,error:cErr}=await db.from('folios').insert({[subj.folioCol]:folioSubjId,guest_name:guestName,name:guestName,payment_token:token,status:'open'}).select().single();
      if(cErr)throw cErr;
      folios=[created];
    }
    const folioIds=folios.map(f=>f.id);
    const {data:items,error:iErr}=await db.from('folio_items').select('*').in('folio_id',folioIds).order('created_at',{ascending:true});
    if(iErr)throw iErr;
    _bdFolios=folios.map(f=>({folio:f,items:(items||[]).filter(i=>i.folio_id===f.id)}));
    // Jorge's report 2026-10-01: reopening Edit on a Comisión charge always
    // showed the Staff field blank, even after it had saved correctly --
    // folio_items itself has no staff/commission columns, so look up which
    // staff is actually linked (via the commissions.folio_item_id we added)
    // and pre-select it when rendering the edit form.
    const commItemIds=(items||[]).filter(i=>i.category==='Comisión').map(i=>i.id);
    _bdCommissionStaffByItem={};
    if(commItemIds.length){
      const{data:comms}=await db.from('commissions').select('folio_item_id,staff_id').in('folio_item_id',commItemIds);
      (comms||[]).forEach(c=>{if(c.folio_item_id)_bdCommissionStaffByItem[c.folio_item_id]=c.staff_id;});
    }
    _bdRender();
  }catch(e){
    document.getElementById('bdBody').innerHTML=`<div style="padding:40px 20px;text-align:center;color:#dc2626;font-size:13px">Could not load folio: ${escHtml(e.message||String(e))}</div>`;
  }
}

function _bdItemTotal(i){return Number(i.qty)*Number(i.unit_price)*(1+(Number(i.tax_rate)||0)/100);}
function _bdFolioTotal(f){return f.items.reduce((s,i)=>s+_bdItemTotal(i),0);}
// "Closed" only means no more charges can be added to a folio -- it's a lock,
// not proof it was paid (bdCloseFolio never checks the balance first). The
// header Balance Due used to only sum OPEN folios, so a closed-but-unpaid
// folio (e.g. a room upgrade charge, Jorge's report 2026-09-29: Kristen
// Bughaher's $232 upgrade folio, CLOSED, never paid) silently vanished from
// what the guest appeared to owe. Every folio's real balance counts here.
function _bdBalanceDue(){return _bdFolios.reduce((s,f)=>s+_bdFolioTotal(f),0);}

// Walks a Split Stay's full chain of registrations under the same booking --
// not just this reg's immediate neighbor(s) -- by following checkout===checkin
// links backward and forward (using the same checkIn||bk.startDate /
// checkOut||bk.endDate fallback _bdSubject() uses, since the FIRST segment of
// a split never gets its own check_in set). Returns [reg] alone when it isn't
// part of a split. Jorge's ask 2026-09-29: the Period/nights shown for one
// segment only ("1 night") looked wrong when the guest's real stay spans
// several rooms -- this is what lets the render show the FULL stay too.
function _bdSplitChain(reg,bk){
  if(!reg||!bk)return[reg];
  const eff=r=>({in:r.checkIn||bk.startDate,out:r.checkOut||bk.endDate});
  const all=AppData.regs.filter(r=>r.bookingId===bk.id);
  let chain=[reg],cur=reg;
  while(true){
    const me=eff(cur);
    const prev=all.find(r=>!chain.includes(r)&&eff(r).out===me.in);
    if(!prev)break;
    chain.unshift(prev);cur=prev;
  }
  cur=reg;
  while(true){
    const me=eff(cur);
    const next=all.find(r=>!chain.includes(r)&&eff(r).in===me.out);
    if(!next)break;
    chain.push(next);cur=next;
  }
  return chain;
}
// Detects a Split Stay's immediate neighbor(s) -- Jorge's report 2026-09-29:
// after splitting, neither half showed any sign of the other -- staff had no
// way to tell why TEST CYAN had two entries.
function _bdSplitLineage(reg,bk){
  const chain=_bdSplitChain(reg,bk);
  if(chain.length<2)return null;
  const idx=chain.indexOf(reg);
  return{prev:chain[idx-1]||null,next:chain[idx+1]||null};
}

// Undoes a Split Stay -- Jorge's ask 2026-09-29: "como cancelo el split".
// Keeps the EARLIEST segment (the original room), stretches its check_out
// back to cover the whole chain, and deletes every other segment (folios
// first, same FK reason as bdDeleteReservation) -- also drops any room that
// split added to blocked_rooms and nothing else still uses.
async function bdUndoSplit(){
  if(_bdKind!=='reg')return;
  const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return;
  const bk=AppData.bookings.find(b=>b.id===reg.bookingId);if(!bk)return;
  const chain=_bdSplitChain(reg,bk);
  if(chain.length<2){showToast('This reservation is not part of a split.');return;}
  const eff=r=>({in:r.checkIn||bk.startDate,out:r.checkOut||bk.endDate});
  const survivor=chain[0];
  const toRemove=chain.slice(1);
  const fullOut=eff(chain[chain.length-1]).out;
  if(!confirm(`Undo this split?\n\nRoom${toRemove.length>1?'s':''} ${toRemove.map(r=>r.room).join(', ')} will be removed, and room ${survivor.room} will cover the whole stay again through ${fmtDate(fullOut)}.`))return;
  try{
    for(const r of toRemove){
      await _bdDeleteFoliosForReg(r.id);
      const {error}=await db.from('registrations').delete().eq('id',r.id);
      if(error)throw new Error(error.message);
    }
    const {error:e1}=await db.from('registrations').update({check_out:fullOut}).eq('id',survivor.id);
    if(e1)throw new Error(e1.message);
    AppData.regs=AppData.regs.filter(r=>!toRemove.some(x=>x.id===r.id));
    survivor.checkOut=fullOut;
    const removedRooms=[...new Set(toRemove.map(r=>r.room))];
    const stillUsed=room=>AppData.regs.some(r=>r.bookingId===bk.id&&roomCodesEqual(r.room,room));
    const updatedBlocked=(bk.blockedRooms||[]).filter(rm=>!removedRooms.some(x=>roomCodesEqual(x,rm))||stillUsed(rm));
    if(updatedBlocked.length!==(bk.blockedRooms||[]).length){
      const {error:e2}=await db.from('bookings').update({blocked_rooms:updatedBlocked}).eq('id',bk.id);
      if(e2)throw new Error(e2.message);
      bk.blockedRooms=updatedBlocked;
    }
    // Cancel the removed room's own Cloudbeds reservation, if it has one --
    // same cleanup blockSave() already does when a room is unblocked
    // (modules/room-blocking.js). Jorge's report 2026-09-29: "cuando quito
    // el split la reserva se queda ahi" -- Undo Split deleted the portal
    // registration but left the room's CB reservation orphaned.
    removedRooms.forEach(rm=>{
      if(stillUsed(rm))return; // another active reg still needs this room's CB link
      const rid=(bk.cbReservationIds||{})[rm];
      if(!rid)return;
      fetch(`${CLOUDBEDS_PROXY}?action=cancelReservation`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reservationId:rid})})
        .then(res=>res.json()).then(d=>console.log('[CB cancel undo-split]',rm,rid,JSON.stringify(d).slice(0,150)))
        .catch(e=>console.warn('[CB cancel undo-split]',e));
      delete bk.cbReservationIds[rm];
      if(bk.cbGuestIds)delete bk.cbGuestIds[rm];
      if(bk.cbAdjustmentIds)delete bk.cbAdjustmentIds[rm];
      if(bk.cbNoteIds)delete bk.cbNoteIds[rm];
    });
    saveAll();
    showToast('Split undone ✓');
    _bdId=survivor.id;
    if(typeof venBuild==='function')venBuild();
    if(typeof rcBuild==='function')rcBuild();
    if(typeof resRefresh==='function')resRefresh();
    await _bdLoadFolios();
  }catch(e){
    showToast('Error: '+(e.message||'Something went wrong.'));
  }
}

function _bdRender(){
  const subj=_bdSubject();if(!subj)return;
  const _bdReg=_bdKind==='reg'?AppData.regs.find(r=>r.id===_bdId):null;
  const _bdBk=_bdReg?AppData.bookings.find(b=>b.id===_bdReg.bookingId):null;
  const _splitLineage=_bdReg?_bdSplitLineage(_bdReg,_bdBk):null;
  // Jorge's ask 2026-09-29: "en el total de noches se deberia de ver toda su
  // estancia no solo las partes del split" -- Period/nights below still show
  // just THIS segment (Room/Rate/Room Total all correctly stay per-segment,
  // since each room bills separately), but the guest's real, full stay across
  // every split segment is shown too when this reg is part of one.
  const _splitChain=_bdReg?_bdSplitChain(_bdReg,_bdBk):[_bdReg];
  const _fullStay=_splitChain.length>1?(()=>{
    const eff=r=>({in:r.checkIn||_bdBk.startDate,out:r.checkOut||_bdBk.endDate});
    const fullIn=eff(_splitChain[0]).in,fullOut=eff(_splitChain[_splitChain.length-1]).out;
    return{checkIn:fullIn,checkOut:fullOut,nights:Math.max(1,Math.round((pd(fullOut)-pd(fullIn))/DAY_MS))};
  })():null;
  const nights=Math.max(1,Math.round((pd(subj.checkOut)-pd(subj.checkIn))/DAY_MS));
  const roomTotal=nights*(subj.rate||0);
  const balanceDue=_bdBalanceDue();
  const statusBadge=subj.cancelled?{label:'Cancelled',bg:'rgba(239,68,68,.4)'}:subj.checkedOutAt?{label:'Checked Out',bg:'rgba(255,255,255,.15)'}:subj.checkedInAt?{label:'In House',bg:'rgba(34,197,94,.25)'}:{label:'Expected',bg:'rgba(255,255,255,.15)'};

  const hBtnS='background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.35);padding:6px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'Jost\',sans-serif';
  let headerBtns='';
  if(subj.cancelled){
    // Nothing to check in/out on a cancelled reservation.
  }else if(!subj.checkedInAt) headerBtns+=`<button onclick="bdCheckIn()" style="${hBtnS}">Check In</button>`;
  else if(!subj.checkedOutAt) headerBtns+=`<button onclick="bdCheckOut()" style="${hBtnS}">Check Out</button>`;
  else headerBtns+=`<button onclick="bdUndoCheckOut()" style="${hBtnS}">Undo Check Out</button>`;
  // Cancel marks just THIS room's reservation as cancelled (kept, not deleted --
  // shows up in Advanced Search tagged "Cancelled" for reporting) without
  // splitting it per-guest -- a whole physical room (e.g. CH16, two named
  // guests) cancels as one unit, unlike Nicole Chavez's earlier per-guest case.
  // Jorge's ask 2026-09-26: "solo quiero un boton cancel...cancelar es cancelar
  // y en un reporte salen cancelados" -- kept fully separate from Delete, which
  // still hard-removes the registration and is untouched.
  if(_bdKind==='reg'&&!subj.cancelled) headerBtns+=`<button onclick="bdCancelReservation()" style="${hBtnS};border-color:rgba(239,68,68,.6);color:#fca5a5">Cancel</button>`;
  // "Split Stay" — a guest changes physical room mid-stay without it being a
  // paid Upgrade (Jorge's ask 2026-09-29: "unos días está en un cuarto y
  // otros días en otro, eso no lo tenemos" — then "lo quiero para todos no
  // solo para grupos", so this applies to Room Only too. bdConfirmSplitStay/
  // bdCancelReservation/bdDeleteReservation all key off how many registrations
  // are actually under the booking rather than booking_type, so a split Room
  // Only booking's two segments can each be cancelled/deleted independently.
  // Mutually exclusive with "Undo Split" below -- Jorge's ask 2026-09-29:
  // "debe de salir en lugar de split stay cuando ya esta split" (both were
  // showing together once a reg was actually part of a split).
  if(_bdKind==='reg'&&!subj.cancelled&&!_splitLineage) headerBtns+=`<button onclick="bdOpenSplitStay()" style="${hBtnS}">Split Stay</button>`;
  // "Undo Split" -- Jorge's ask 2026-09-29: "como cancelo el split". Only
  // offered when this reg is actually part of one (_splitLineage is null
  // otherwise).
  if(_bdKind==='reg'&&!subj.cancelled&&_splitLineage) headerBtns+=`<button onclick="bdUndoSplit()" style="${hBtnS}">Undo Split</button>`;
  // "Log" -- Jorge's ask 2026-09-29: "no veo un boton de log en las
  // reservas para saber que paso o quien movio algo dentro de ahi". Reuses
  // the existing per-booking activity log viewer (showBookingLogModal,
  // modules/teacher-portal.js) -- same modal the Registration/Teachers
  // toolbar's own "Log" button already opens -- instead of a second,
  // redundant log UI just for Booking Detail. Shown regardless of
  // cancelled state, always visible (not just for kind='reg' -- no
  // booking-level log exists for an individual Booking Engine reservation).
  if(_bdKind==='reg') headerBtns+=`<button onclick="showBookingLogModal('${_bdBk.id}')" style="${hBtnS}">📋 Log</button>`;
  // Edit name/phone/room/dates directly -- Jorge's ask 2026-10-06: there was no
  // way to fix a typo'd name or move a guest to a different room/date from
  // this screen at all (Notes was the only editable field here). Toggles the
  // Booking/Guest panel below into an inline edit form.
  if(!subj.cancelled) headerBtns+=`<button onclick="bdToggleDetailEdit()" style="${hBtnS}">${_bdDetailEditMode?'✕ Cancel Edit':'✏️ Edit'}</button>`;
  headerBtns+=`<button onclick="bdDeleteReservation()" style="${hBtnS};border-color:rgba(239,68,68,.6);color:#fca5a5">Delete</button>`;

  document.getElementById('bdHdr').innerHTML=`
    <div style="display:flex;align-items:center;gap:14px">
      <button onclick="closeModal('bookingDetailModal')" style="${hBtnS}">&larr; Back</button>
      <div style="font-size:15px;font-weight:700">Booking <span style="font-weight:400;opacity:.85">${escHtml(_joinNames(subj.allGuests.map(g=>g.name)))}, ${fmtDate(subj.checkIn)}, #${_bdShortId(subj.id)}</span></div>
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
          <tr><td style="color:var(--muted);padding:5px 0;width:90px">Period</td><td style="padding:5px 0">${_bdDetailEditMode?`<input id="bdEditCheckIn" type="date" value="${subj.checkIn||''}" style="padding:4px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px"> — <input id="bdEditCheckOut" type="date" value="${subj.checkOut||''}" style="padding:4px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px">`:`${fmtDate(subj.checkIn)} — ${fmtDate(subj.checkOut)} <span style="color:var(--muted)">(${nights} night${nights!==1?'s':''})</span>`}</td></tr>
          ${_fullStay?`<tr><td style="color:var(--muted);padding:5px 0">Full Stay</td><td style="padding:5px 0">${fmtDate(_fullStay.checkIn)} — ${fmtDate(_fullStay.checkOut)} <span style="color:var(--muted)">(${_fullStay.nights} night${_fullStay.nights!==1?'s':''} total, across ${_splitChain.length} rooms)</span></td></tr>`:''}
          ${subj.retreatLabel!=null?`<tr><td style="color:var(--muted);padding:5px 0">Retreat</td><td style="padding:5px 0"><span onclick="_bdGoToRegistration('${subj.retreatBkId}')" title="Open this retreat's Registration tab" style="color:#1d4ed8;cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px">${escHtml(subj.retreatLabel)}</span></td></tr>`:''}
          ${subj.sourceLabel?`<tr><td style="color:var(--muted);padding:5px 0">Source</td><td style="padding:5px 0;color:#1d4ed8;font-weight:600">${escHtml(subj.sourceLabel)}</td></tr>`:''}
          <tr><td style="color:var(--muted);padding:5px 0">Room</td><td style="padding:5px 0;font-weight:700">${_bdDetailEditMode?`<input id="bdEditRoom" type="text" value="${escHtml(subj.room||'')}" style="padding:4px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;width:90px">`:escHtml(subj.room||'—')}</td></tr>
          ${_splitLineage?`<tr><td style="color:var(--muted);padding:5px 0">Split Stay</td><td style="padding:5px 0;font-size:12px">${_splitLineage.prev?`<span onclick="openBookingDetailForReg('${_splitLineage.prev.id}')" style="color:#1d4ed8;cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px">Room ${escHtml(_splitLineage.prev.room)}</span> until ${fmtDate(subj.checkIn)} → `:''}<strong>this room</strong>${_splitLineage.next?` → <span onclick="openBookingDetailForReg('${_splitLineage.next.id}')" style="color:#1d4ed8;cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px">Room ${escHtml(_splitLineage.next.room)}</span> from ${fmtDate(subj.checkOut)}`:''}</td></tr>`:''}
          <tr><td style="color:var(--muted);padding:5px 0">Rate</td><td style="padding:5px 0;color:#059669;font-weight:700">${subj.rate!=null?fmt$(subj.rate)+'/night':'—'}</td></tr>
        </table>
        <div style="margin-top:10px">
          <label style="font-size:11px;color:var(--muted);font-weight:600;display:block;margin-bottom:4px">Notes</label>
          <textarea id="bdNotes" placeholder="Internal notes..." style="width:100%;min-height:60px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:'Jost',sans-serif;font-size:12.5px;resize:vertical">${escHtml(subj.notes||'')}</textarea>
          <button class="btn btn-secondary btn-sm" onclick="bdSaveNotes()" style="margin-top:6px">Save</button>
        </div>
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">👤 Guest${subj.allGuests.length>1?'s':''}</div>
        <table style="width:100%;font-size:13px">
          <tr><td style="color:var(--muted);padding:5px 0;width:110px">Adults</td><td style="padding:5px 0">${subj.adults}</td></tr>
        </table>
        ${_bdDetailEditMode&&_bdKind==='req'?`<table style="width:100%;font-size:13px">
          <tr><td style="color:var(--muted);padding:5px 0;width:110px">First Name</td><td style="padding:5px 0"><input id="bdEditFirstName" type="text" value="${escHtml(_bdReqCache.firstName||'')}" style="padding:4px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;width:100%"></td></tr>
          <tr><td style="color:var(--muted);padding:5px 0">Last Name</td><td style="padding:5px 0"><input id="bdEditLastName" type="text" value="${escHtml(_bdReqCache.lastName||'')}" style="padding:4px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;width:100%"></td></tr>
          <tr><td style="color:var(--muted);padding:5px 0">Phone</td><td style="padding:5px 0"><input id="bdEditPhone-0" type="text" value="${escHtml(subj.allGuests[0]?.phone||'')}" style="padding:4px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;width:100%"></td></tr>
        </table>`:subj.allGuests.map((g,gi)=>`<table style="width:100%;font-size:13px;${gi>0?'margin-top:10px;border-top:1px solid var(--border);padding-top:10px':''}">
          <tr><td style="color:var(--muted);padding:5px 0;width:110px">Name</td><td style="padding:5px 0;font-weight:700">${_bdDetailEditMode?`<input id="bdEditName-${gi}" type="text" value="${escHtml(g.name)}" style="padding:4px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;width:100%">`:escHtml(g.name)}</td></tr>
          ${(g.email||_bdDetailEditMode)?`<tr><td style="color:var(--muted);padding:5px 0">Email</td><td style="padding:5px 0">${_bdDetailEditMode?`<input id="bdEditEmail-${gi}" type="text" value="${escHtml(g.email||'')}" style="padding:4px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;width:100%">`:escHtml(g.email)}</td></tr>`:''}
          ${(g.phone||_bdDetailEditMode)?`<tr><td style="color:var(--muted);padding:5px 0">Phone</td><td style="padding:5px 0">${_bdDetailEditMode?`<input id="bdEditPhone-${gi}" type="text" value="${escHtml(g.phone||'')}" style="padding:4px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:12.5px;width:100%">`:escHtml(g.phone)}</td></tr>`:''}
        </table>`).join('')}
        ${_bdDetailEditMode?`<div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="bdSaveDetails()">Save Changes</button>
          <button class="btn btn-secondary btn-sm" onclick="bdToggleDetailEdit()">Cancel</button>
        </div>`:''}
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
      ${_bdFolios.length?_bdTotalPaymentRowHtml():''}
    </div>`;
}

// One combined "pay everything" control instead of having to pick a specific
// folio first (Jorge's ask 2026-09-29). Recorded against whichever folio
// currently carries the largest balance -- open OR closed (closed only means
// no more CHARGES, not that it can't be paid off). The aggregate Balance Due
// above sums every folio either way, so settling the whole thing through one
// folio still zeroes the total out correctly.
function _bdTotalPaymentRowHtml(){
  const methods=_bdKind==='req'?_BD_PAY_METHODS.filter(m=>m!=='Card on File'):_BD_PAY_METHODS;
  const bal=_bdBalanceDue();
  return `<div style="display:flex;gap:8px;align-items:center;padding:14px 16px;margin-top:4px;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;flex-wrap:wrap">
    <span style="font-size:11px;font-weight:800;color:#166534;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">Pay Full Balance</span>
    <select id="bd-pay-total-method" onchange="bdOnTotalPayMethodChange()" style="padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px">
      ${methods.map(m=>`<option value="${m}">${m}</option>`).join('')}
    </select>
    <input id="bd-pay-total-amount" type="number" step="0.01" placeholder="Amount" value="${bal>0?bal.toFixed(2):''}" style="width:110px;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px">
    <input id="bd-pay-total-ref" type="text" placeholder="Reference (optional)" style="flex:1;min-width:120px;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px">
    <button id="bd-pay-total-btn" class="btn btn-primary btn-sm" onclick="bdRecordTotalPayment()">Record</button>
  </div>`;
}
function _bdLargestBalanceFolio(){
  if(!_bdFolios.length)return null;
  return _bdFolios.reduce((best,f)=>_bdFolioTotal(f)>_bdFolioTotal(best)?f:best,_bdFolios[0]);
}
function bdOnTotalPayMethodChange(){
  const method=document.getElementById('bd-pay-total-method')?.value;
  const btn=document.getElementById('bd-pay-total-btn');if(!btn)return;
  const amountEl=document.getElementById('bd-pay-total-amount');
  if(method==='Credit Card (Stripe)'||method==='Card on File'){
    btn.textContent=method==='Card on File'?'💳 Charge Card on File':'💳 Charge Card';
    btn.onclick=method==='Card on File'?bdChargeCardOnFileTotal:bdOpenStripePaymentTotal;
    if(amountEl&&(!amountEl.value||parseFloat(amountEl.value)===0)){
      const bal=_bdBalanceDue();if(bal>0)amountEl.value=bal.toFixed(2);
    }
  }else{
    btn.textContent='Record';
    btn.onclick=bdRecordTotalPayment;
  }
}
async function bdRecordTotalPayment(){
  const method=document.getElementById('bd-pay-total-method')?.value;
  const amount=parseFloat(document.getElementById('bd-pay-total-amount')?.value);
  const ref=document.getElementById('bd-pay-total-ref')?.value.trim();
  if(!amount||amount<=0){showToast('Enter a valid amount');return;}
  const target=_bdLargestBalanceFolio();
  if(!target){showToast('No folio to record this payment against.');return;}
  const description=`Payment — ${method}${ref?': '+ref:''}`;
  const {error}=await db.from('folio_items').insert({folio_id:target.folio.id,description,qty:1,unit_price:-amount,tax_rate:0,category:'Payment',staff_name:getCurrentSession()?.name||null});
  if(error){showToast('Error recording payment: '+error.message);return;}
  showToast('Payment recorded ✓');
  await _bdLoadFolios();
}
function bdChargeCardOnFileTotal(){
  const amount=parseFloat(document.getElementById('bd-pay-total-amount')?.value);
  if(!amount||amount<=0){showToast('Enter a valid amount');return;}
  const target=_bdLargestBalanceFolio();
  if(!target){showToast('No folio to record this payment against.');return;}
  bdChargeCardOnFile(target.folio.id,amount,'bd-pay-total-btn');
}
function bdOpenStripePaymentTotal(){
  const amount=parseFloat(document.getElementById('bd-pay-total-amount')?.value);
  if(!amount||amount<=0){showToast('Enter a valid amount');return;}
  const target=_bdLargestBalanceFolio();
  if(!target){showToast('No folio to record this payment against.');return;}
  bdOpenStripePayment(target.folio.id,amount);
}

function _bdFolioRowHtml(f){
  const total=_bdFolioTotal(f);
  const isOpen=f.folio.status==='open';
  const fid=f.folio.id;
  const itemRows=f.items.map(i=>{
    const isPayment=Number(i.unit_price)<0;
    const lineTotal=_bdItemTotal(i);
    // Date column, like Cloudbeds' folio (Darlene 2026-09-28). Spa charges set
    // created_at to the service day, so this shows when the massage was given.
    const itemDate=i.created_at?new Date(i.created_at).toLocaleDateString('en-CA'):'';
    // Jorge's ask 2026-09-30: editing a charge should let staff change
    // everything, including Category (it had no way to edit that at all --
    // bdEditItem() used to be three sequential prompt()s with no category).
    // Reuses the same pick-list as "+ Add manually" instead of free text.
    if(isOpen&&_bdEditOpen[i.id]){
      const commOpenE=i.category==='Comisión';
      return `<tr style="background:#fffbeb">
        <td style="padding:6px 12px;font-size:12px;white-space:nowrap;color:var(--dark)">${itemDate}</td>
        <td style="padding:6px 12px" colspan="2"><input id="bde-desc-${i.id}" value="${escHtml(i.description||'')}" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px;margin-bottom:6px"><select id="bde-cat-${i.id}" onchange="_bdOnCategoryChange('bde','${i.id}')" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px">${_bdCategoryOptionsHtml(i.category||'')}</select>${_bdCommissionFieldsHtml('bde',i.id,commOpenE,Number(i.unit_price),_bdCommissionStaffByItem[i.id])}</td>
        <td style="padding:6px 12px"><input id="bde-price-${i.id}" type="number" step="0.01" value="${Number(i.unit_price)}" oninput="_bdOnPriceInput('bde','${i.id}')" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px"></td>
        <td style="padding:6px 12px"><input id="bde-tax-${i.id}" type="number" step="0.01" value="${Number(i.tax_rate)||0}" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px"></td>
        <td colspan="2" style="padding:6px 12px;text-align:right;white-space:nowrap">
          <button class="btn btn-primary btn-sm" onclick="bdSaveEditItem('${fid}','${i.id}')" style="padding:2px 8px;font-size:11px">Save</button>
          <button class="btn btn-secondary btn-sm" onclick="bdToggleEditItem('${i.id}')" style="padding:2px 8px;font-size:11px">Cancel</button>
        </td>
      </tr>`;
    }
    return `<tr style="${isPayment?'background:#f0fdf4':''}">
      <td style="padding:8px 12px;font-size:12px;white-space:nowrap;color:var(--dark)">${itemDate}</td>
      <td style="padding:8px 12px;font-size:12.5px">${isPayment?'💳 ':''}${escHtml(i.description||'')}${i.category?`<span style="margin-left:8px;font-size:10px;font-weight:700;padding:1px 7px;border-radius:9px;background:#f3f4f6;color:var(--muted)">${escHtml(i.category)}</span>`:''}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;color:var(--muted)">${Number(i.qty)}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;color:var(--muted)">${fmt$(i.unit_price)}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;color:var(--muted)">${i.tax_rate?i.tax_rate+'%':'—'}</td>
      <td style="padding:8px 12px;font-size:12.5px;text-align:right;font-weight:700;color:${isPayment?'#059669':'inherit'}">${fmt$(lineTotal)}</td>
      <td style="padding:8px 12px;text-align:right;white-space:nowrap">
        ${isOpen?`<button class="btn btn-secondary btn-sm" onclick="bdToggleEditItem('${i.id}')" style="padding:2px 8px;font-size:11px">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="bdDeleteItem('${fid}','${i.id}')" style="padding:2px 8px;font-size:11px">✕</button>`:''}
      </td>
    </tr>`;
  }).join('');
  const addFormHtml=_bdAddOpen[fid]?`
    <tr>
      <td></td>
      <td style="padding:6px 12px" colspan="2">${_bdItemPickerHtml(fid)}<input id="bdc-desc-${fid}" placeholder="Description" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px;margin-bottom:6px"><select id="bdc-cat-${fid}" onchange="_bdOnCategoryChange('bdc','${fid}')" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px">${_bdCategoryOptionsHtml('')}</select>${_bdCommissionFieldsHtml('bdc',fid,false,0)}</td>
      <td style="padding:6px 12px"><input id="bdc-price-${fid}" type="number" step="0.01" placeholder="Price" oninput="_bdOnPriceInput('bdc','${fid}')" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px"></td>
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
        ${isOpen?`<button class="btn btn-secondary btn-sm" onclick="bdCloseFolio('${fid}')">Close</button>`:`<button class="btn btn-secondary btn-sm" onclick="bdReopenFolio('${fid}')">Reopen</button>`}
        <button class="btn btn-danger btn-sm" onclick="bdDeleteFolioRow('${fid}')">Delete</button>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">
        <th style="text-align:left;padding:6px 12px">Date</th><th style="text-align:left;padding:6px 12px">Description</th><th style="text-align:right;padding:6px 12px">Qty</th>
        <th style="text-align:right;padding:6px 12px">Unit Price</th><th style="text-align:right;padding:6px 12px">Tax</th>
        <th style="text-align:right;padding:6px 12px">Total</th><th style="padding:6px 12px"></th>
      </tr></thead>
      <tbody>${itemRows||`<tr><td colspan="7" style="padding:14px 12px;text-align:center;color:var(--muted);font-size:12px">No charges yet.</td></tr>`}
      ${isOpen?`<tr><td colspan="7" style="padding:6px 12px"><button class="btn btn-secondary btn-sm" onclick="bdToggleAdd('${fid}')" style="font-size:11px">${_bdAddOpen[fid]?'Cancel':'+ Add manually'}</button></td></tr>${addFormHtml}`:''}
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

// amountOverride/btnIdOverride let bdChargeCardOnFileTotal() (the "Pay Full
// Balance" row, 2026-09-29) reuse this exact same charge flow for whichever
// folio has the largest balance, even a CLOSED one that has no per-folio
// payment row of its own in the DOM to read an amount/button from.
async function bdChargeCardOnFile(fid,amountOverride,btnIdOverride){
  const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return;
  if(!reg.stripePaymentMethodId){showToast('No hay tarjeta guardada para este huésped — guarda una primero con "Save Card".');return;}
  const amount=amountOverride??parseFloat(document.getElementById(`bd-pay-amount-${fid}`)?.value);
  if(!amount||amount<=0){showToast('Enter a valid amount');return;}
  const btn=document.getElementById(btnIdOverride||`bd-pay-btn-${fid}`);
  const origLabel=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='Cobrando…';}
  try{
    const res=await fetch('/.netlify/functions/charge-card-on-file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({regId:_bdId,folioId:fid,amount,description:'Amansala · Folio charge'})});
    const data=await res.json();
    if(!res.ok||data.error)throw new Error(data.error||'No se pudo cobrar');
    showToast('Tarjeta cobrada ✓');
    await _bdLoadFolios();
  }catch(e){
    showToast(e.message||'Error al cobrar la tarjeta');
    if(btn){btn.disabled=false;btn.textContent=origLabel;}
  }
}

// Item catalog picker for "+ Add manually" -- Jorge's report 2026-09-30:
// staging's folio charge form lets staff pick from the same `items` catalog
// (Admin > Items, already shared/synced with Cloudbeds) instead of typing
// description/price/tax from scratch every time; this app's own version had
// no picker at all. Loaded once and cached (items rarely change mid-session).
let _bdCatalogItems=[];
async function _bdLoadCatalogItems(){
  // Used to skip the query entirely once _bdCatalogItems had anything in it
  // ("items rarely change mid-session") -- but a colleague adding a new item
  // to the catalog in a DIFFERENT tab/session (Jorge's report 2026-10-01:
  // "Tour Atik Cenote" never showed up) never invalidates that cache, so
  // anyone with this page already open never saw it, no matter how many
  // times they reopened "+ Add manually". Always re-fetch -- it only runs
  // when that form is opened, not on every keystroke/render, so the cost is
  // one small query per open, not per render.
  try{
    const{data,error}=await db.from('items').select('*').eq('active',true).order('category').order('name');
    if(error)throw error;
    _bdCatalogItems=data||[];
  }catch(e){console.warn('[booking-detail] catalog items load failed',e.message);}
}
// Categories that don't come from the Items catalog at all (payments, tips,
// commissions, etc.) -- unioned with whatever categories the catalog itself
// has, so the "+ Add manually" Category dropdown always covers both. Jorge's
// ask 2026-09-30: make Category an actual pick-list (not free text), and add
// "Tip Tarjeta" and "Comisión" to it.
const BD_EXTRA_CATEGORIES=['Payment','Transport','Restaurant','Upgrade','Room','Tip','Tip Tarjeta','Comisión','Gym','Boutique'];
function _bdCategoryOptionsHtml(selected){
  const cats=new Set(BD_EXTRA_CATEGORIES);
  _bdCatalogItems.forEach(it=>{if(it.category)cats.add(it.category);});
  const sorted=[...cats].sort((a,b)=>a.localeCompare(b));
  return`<option value="">— None —</option>`+sorted.map(c=>`<option value="${escHtml(c)}"${c===selected?' selected':''}>${escHtml(c)}</option>`).join('');
}
// Jorge's ask 2026-09-30: picking Category "Comisión" should reveal a Staff
// field and auto-derive a 5% commission from the charge's own Price -- same
// 5%-of-pretax convention already used for upgrade/reservation commissions
// (tr2ConfirmUpgrade in transport.js, rmSave in venues.js). Price keeps its
// normal meaning (the real charge, e.g. $200 for an upgrade) -- Jorge's
// follow-up ("QUE ES MONTO ANTES DE IMPUESTO?") was because an earlier
// version added a SECOND, separate amount field for this, which was
// confusing since Price already *is* the pretax amount. The commission
// itself (5% of Price) only ever lands in the `commissions` table, it
// never overwrites what the guest is actually charged on this folio.
function _bdStaffOptionsHtml(selected){
  const list=(typeof staffAccounts!=='undefined'?staffAccounts:[]).filter(s=>s.active);
  return`<option value="">— Selecciona staff —</option>`+list.map(s=>`<option value="${escHtml(s.id)}"${s.id===selected?' selected':''}>${escHtml(s.name)}</option>`).join('');
}
function _bdCommissionFieldsHtml(prefix,id,open,initialPrice,selectedStaffId){
  return`<div id="${prefix}-commwrap-${id}" style="display:${open?'block':'none'};margin-top:6px">
    <select id="${prefix}-staff-${id}" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px;margin-bottom:6px">${_bdStaffOptionsHtml(selectedStaffId||'')}</select>
    <div id="${prefix}-commpreview-${id}" style="font-size:11px;color:var(--muted)">${_bdCommissionPreviewText(initialPrice||0)}</div>
  </div>`;
}
function _bdCommissionPreviewText(price){
  return`Comisión (5% del precio, antes de impuesto): $${(( parseFloat(price)||0)*0.05).toFixed(2)}`;
}
function _bdOnCategoryChange(prefix,id){
  const catEl=document.getElementById(`${prefix}-cat-${id}`);
  const wrap=document.getElementById(`${prefix}-commwrap-${id}`);
  if(!catEl||!wrap)return;
  const isComm=catEl.value==='Comisión';
  wrap.style.display=isComm?'block':'none';
  if(isComm)_bdOnPriceInput(prefix,id);
}
function _bdOnPriceInput(prefix,id){
  const catEl=document.getElementById(`${prefix}-cat-${id}`);
  if(!catEl||catEl.value!=='Comisión')return;
  const priceEl=document.getElementById(`${prefix}-price-${id}`);
  const previewEl=document.getElementById(`${prefix}-commpreview-${id}`);
  if(!priceEl||!previewEl)return;
  previewEl.textContent=_bdCommissionPreviewText(priceEl.value);
}
function _bdItemPickerHtml(fid){
  if(!_bdCatalogItems.length)return'';
  const groups={};
  _bdCatalogItems.forEach(it=>{const c=it.category||'General';(groups[c]=groups[c]||[]).push(it);});
  let opts=`<option value="">— Manual —</option>`;
  Object.keys(groups).sort().forEach(cat=>{
    opts+=`<optgroup label="${escHtml(cat)}">`;
    groups[cat].forEach(it=>{
      opts+=`<option value="${escHtml(it.id)}" data-price="${Number(it.price).toFixed(2)}" data-tax="${Number(it.tax_rate)||0}" data-name="${escHtml(it.name)}" data-category="${escHtml(it.category||'General')}">${escHtml(it.name)} — ${fmt$(it.price)}</option>`;
    });
    opts+=`</optgroup>`;
  });
  return`<select id="bdc-pick-${fid}" onchange="bdPickItem('${fid}')" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px;margin-bottom:6px">${opts}</select>`;
}
function bdPickItem(fid){
  const sel=document.getElementById(`bdc-pick-${fid}`);if(!sel)return;
  const opt=sel.options[sel.selectedIndex];
  const descEl=document.getElementById(`bdc-desc-${fid}`);
  const priceEl=document.getElementById(`bdc-price-${fid}`);
  const taxEl=document.getElementById(`bdc-tax-${fid}`);
  const catEl=document.getElementById(`bdc-cat-${fid}`);
  if(opt&&opt.value){
    if(descEl){descEl.value=opt.dataset.name||'';descEl.style.display='none';}
    if(priceEl)priceEl.value=opt.dataset.price||'';
    if(taxEl)taxEl.value=opt.dataset.tax||'0';
    // Pre-filled from the item's own category but still a normal, editable
    // text field -- Jorge's report 2026-09-30: "no veo category para
    // seleccionar" (the category was only ever attached invisibly via a
    // data- attribute, never shown as a field staff could see or edit).
    if(catEl)catEl.value=opt.dataset.category||'';
  }else{
    if(descEl){descEl.value='';descEl.style.display='';descEl.focus();}
    if(priceEl)priceEl.value='';
    if(taxEl)taxEl.value='';
    if(catEl)catEl.value='';
  }
  _bdOnCategoryChange('bdc',fid);
}

async function bdToggleAdd(fid){
  _bdAddOpen[fid]=!_bdAddOpen[fid];
  // Jorge's report 2026-10-01: Staff selection for Comisión kept resetting
  // to blank before Save. Root cause: this used to render immediately, THEN
  // render AGAIN once the Items catalog finished loading -- on a fresh page
  // load _bdLoadCatalogItems() is a real network round-trip, so if staff had
  // already picked something in the live form before that second render
  // fired, the whole row got rebuilt from scratch and silently wiped it.
  // Awaiting the catalog load first means there's only ever one render.
  if(_bdAddOpen[fid])await _bdLoadCatalogItems();
  _bdRender();
}

// Guest folio's own commissions insert, shared by bdAddItem/bdSaveEditItem --
// mirrors the 5%-of-pretax `commissions` row shape already used elsewhere
// (tr2ConfirmUpgrade in transport.js, rmSave in venues.js) so a commission
// logged from a folio charge shows up in the existing Commissions tab too.
// Upsert (not blind insert) keyed on folio_item_id -- Jorge's report
// 2026-09-30: a commission for Max silently never appeared. Root cause: this
// folio_item's category was ALREADY "Comisión" from before the Staff field
// existed (no commission had ever actually been logged for it), so the old
// "only log if category is NEWLY Comisión" guard assumed one already existed
// and skipped it forever. Checking for a real, linked commissions row (by
// folio_item_id) instead of inferring from category state fixes that, and
// also makes re-saving (e.g. changing the staff) update the same row
// instead of creating a duplicate.
async function _bdUpsertCommission(fid,itemId,staffId,baseAmount,taxRate,commissionAmount,desc){
  const staffName=(typeof staffAccounts!=='undefined'?staffAccounts:[]).find(s=>s.id===staffId)?.name||'';
  const f=_bdFolios.find(x=>x.folio.id===fid);
  const guestName=f?.folio?.name||_bdGuestNameOverride||'';
  const bookingId=_bdKind==='reg'?(AppData.regs.find(r=>r.id===_bdId)?.bookingId||null):null;
  const payload={
    staff_id:staffId,staff_name:staffName,type:'folio',guest_name:guestName,booking_id:bookingId,
    folio_item_id:itemId,
    // room_from/room_to are free text on this table -- repurposed here to
    // carry the folio charge's own description so it shows up readably in
    // the Commissions tab (commissionsRenderBody()'s detail column).
    room_from:null,room_to:desc||'Cargo de folio',upgrade_pretax:baseAmount,upgrade_total:+(baseAmount*(1+(taxRate||0)/100)).toFixed(2),
    commission_rate:0.05,commission_amount:commissionAmount,date:new Date().toISOString().slice(0,10),status:'pending',
  };
  try{
    const{data:existing}=await db.from('commissions').select('id').eq('folio_item_id',itemId).maybeSingle();
    if(existing){
      const{error}=await db.from('commissions').update(payload).eq('id',existing.id);
      if(error){console.warn('[commission] update failed:',error.message);showToast('Cargo guardado, pero la comisión no se pudo actualizar: '+error.message);}
    }else{
      const{error}=await db.from('commissions').insert(payload);
      if(error){console.warn('[commission] insert failed:',error.message);showToast('Cargo guardado, pero la comisión no se pudo registrar: '+error.message);}
    }
  }catch(e){console.warn('[commission] upsert failed:',e.message);showToast('Cargo guardado, pero la comisión no se pudo registrar: '+e.message);}
}

// Jorge's report 2026-10-03: Michele's upgrade commissions (created from
// transport.js's tr2ConfirmUpgrade, category 'Upgrade' not 'Comisión') kept
// showing the ORIGINAL estimated upgrade price even after staff corrected
// the actual folio charge afterward -- nothing re-synced the linked
// commissions row. _bdUpsertCommission() above already keeps a 'Comisión'-
// category charge's OWN commission in sync; this covers every OTHER
// category, for whatever already has a commissions.folio_item_id link
// (upgrades/reservations from transport.js/venues.js) -- a no-op if this
// charge was never linked to a commission at all.
async function _bdSyncLinkedCommission(itemId,qty,unitPrice,taxRate){
  try{
    const{data:existing}=await db.from('commissions').select('id,commission_rate').eq('folio_item_id',itemId).maybeSingle();
    if(!existing)return;
    const pretax=+(Number(qty)*Number(unitPrice)).toFixed(2);
    const total=+(pretax*(1+(Number(taxRate)||0)/100)).toFixed(2);
    const rate=Number(existing.commission_rate)||0.05;
    const commissionAmount=+(pretax*rate).toFixed(2);
    await db.from('commissions').update({upgrade_pretax:pretax,upgrade_total:total,commission_amount:commissionAmount}).eq('id',existing.id);
  }catch(e){console.warn('[commission] linked sync failed:',e.message);}
}

async function bdAddItem(fid){
  const descEl=document.getElementById(`bdc-desc-${fid}`);
  const desc=descEl?.value.trim();
  const tax=parseFloat(document.getElementById(`bdc-tax-${fid}`)?.value)||0;
  // Pre-filled by bdPickItem() when the charge came from the Items catalog
  // picker, but always a normal editable field -- staff can type/change it
  // for a freely-typed manual charge too (Jorge's ask 2026-09-30: track
  // category on every charge, manual and automatic alike).
  const category=document.getElementById(`bdc-cat-${fid}`)?.value.trim()||null;
  const isComm=category==='Comisión';
  const price=parseFloat(document.getElementById(`bdc-price-${fid}`)?.value);
  let staffId='';
  if(isComm){
    staffId=document.getElementById(`bdc-staff-${fid}`)?.value||'';
    if(!staffId){showToast('Selecciona el staff de la comisión');return;}
  }
  if(!desc||isNaN(price)){showToast('Enter a description and price');return;}
  const {data:newItem,error}=await db.from('folio_items').insert({folio_id:fid,description:desc,qty:1,unit_price:price,tax_rate:tax,category,staff_name:getCurrentSession()?.name||null}).select().single();
  if(error){showToast('Error: '+error.message);return;}
  if(isComm&&staffId)await _bdUpsertCommission(fid,newItem.id,staffId,price,tax,+(price*0.05).toFixed(2),desc);
  _bdAddOpen[fid]=false;
  await _bdLoadFolios();
}

async function bdToggleEditItem(itemId){
  _bdEditOpen[itemId]=!_bdEditOpen[itemId];
  // Same race as bdToggleAdd() above -- await the catalog load so there's
  // only one render, instead of a second one later that can wipe out a
  // Staff pick made in the meantime.
  if(_bdEditOpen[itemId])await _bdLoadCatalogItems();
  _bdRender();
}

async function bdSaveEditItem(fid,itemId){
  const desc=document.getElementById(`bde-desc-${itemId}`)?.value.trim();
  const tax=parseFloat(document.getElementById(`bde-tax-${itemId}`)?.value)||0;
  const category=document.getElementById(`bde-cat-${itemId}`)?.value.trim()||null;
  const isComm=category==='Comisión';
  const price=parseFloat(document.getElementById(`bde-price-${itemId}`)?.value);
  let staffId='';
  if(isComm){
    staffId=document.getElementById(`bde-staff-${itemId}`)?.value||'';
    if(!staffId){showToast('Selecciona el staff de la comisión');return;}
  }
  if(!desc||isNaN(price)){showToast('Enter a description and price');return;}
  const origItem=_bdFolios.find(x=>x.folio.id===fid)?.items.find(x=>x.id===itemId);
  const {error}=await db.from('folio_items').update({description:desc,unit_price:price,tax_rate:tax,category}).eq('id',itemId);
  if(error){showToast('Error: '+error.message);return;}
  if(isComm&&staffId)await _bdUpsertCommission(fid,itemId,staffId,price,tax,+(price*0.05).toFixed(2),desc);
  else await _bdSyncLinkedCommission(itemId,origItem?.qty??1,price,tax);
  delete _bdEditOpen[itemId];
  await _bdLoadFolios();
}

async function bdDeleteItem(fid,itemId){
  if(!confirm('Remove this charge?'))return;
  const f=_bdFolios.find(x=>x.folio.id===fid);
  const {error}=await db.from('folio_items').delete().eq('id',itemId);
  if(error){showToast('Error: '+error.message);return;}
  // A commission linked to this charge (commissions.folio_item_id) has
  // nothing left to commission once the charge itself is gone.
  db.from('commissions').delete().eq('folio_item_id',itemId).then(({error})=>{if(error)console.warn('[commission] delete-linked failed:',error.message);});
  await _bdLoadFolios();
}

async function bdRecordPayment(fid){
  const method=document.getElementById(`bd-pay-method-${fid}`)?.value;
  const amount=parseFloat(document.getElementById(`bd-pay-amount-${fid}`)?.value);
  const ref=document.getElementById(`bd-pay-ref-${fid}`)?.value.trim();
  if(!amount||amount<=0){showToast('Enter a valid amount');return;}
  const description=`Payment — ${method}${ref?': '+ref:''}`;
  const {error}=await db.from('folio_items').insert({folio_id:fid,description,qty:1,unit_price:-amount,tax_rate:0,category:'Payment',staff_name:getCurrentSession()?.name||null});
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
// Jorge's ask 2026-09-29: undo an accidental/premature Close -- reopens a
// folio so charges can be added/edited and its own payment row shows again.
async function bdReopenFolio(fid){
  const {error}=await db.from('folios').update({status:'open'}).eq('id',fid);
  if(error){showToast('Error: '+error.message);return;}
  showToast('Folio reopened ✓');
  await _bdLoadFolios();
}

// _bdLoadFolios() auto-creates a folio for a registration the first time its
// Booking Detail is opened -- so by the time anyone clicks Delete there's
// almost always at least one folio already pointing at that registration_id.
// folios.registration_id is a foreign key with no ON DELETE CASCADE, so
// deleting the registration first (Jorge's report 2026-09-29: deleting a
// Split Stay segment failed silently) violates that constraint. Delete the
// registration's own folios/folio_items first, same order bdDeleteFolioRow
// already uses for a single folio.
// A Split Stay's shared folio is anchored to the chain's EARLIEST segment
// (see _bdFolioAnchorId) -- deleting THAT segment while a later one still
// exists would otherwise take its charges/payments down with it. Hand the
// folio off to the next remaining segment instead of deleting it whenever
// that's the case; only actually delete the folio when this reg either
// isn't part of a split or is the last segment left.
async function _bdReleaseFoliosForDelete(reg,bk){
  const chain=bk?_bdSplitChain(reg,bk):[reg];
  if(chain.length>1&&chain[0].id===reg.id){
    const {error}=await db.from('folios').update({registration_id:chain[1].id}).eq('registration_id',reg.id);
    if(error)throw new Error(error.message);
    return;
  }
  await _bdDeleteFoliosForReg(reg.id);
}

async function _bdDeleteFoliosForReg(regId){
  const {data:folios}=await db.from('folios').select('id').eq('registration_id',regId);
  const ids=(folios||[]).map(f=>f.id);
  if(!ids.length)return;
  await db.from('folio_items').delete().in('folio_id',ids);
  await db.from('folios').delete().in('id',ids);
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
  const {error}=await db.from('folios').insert({[subj.folioCol]:_bdFolioAnchorId(subj),guest_name:guestName,name,payment_token:token,status:'open'});
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

function bdToggleDetailEdit(){
  _bdDetailEditMode=!_bdDetailEditMode;
  _bdRender();
}

async function bdSaveDetails(){
  if(_bdKind==='req'){
    const firstName=(document.getElementById('bdEditFirstName')?.value||'').trim();
    const lastName=(document.getElementById('bdEditLastName')?.value||'').trim();
    const phone=(document.getElementById('bdEditPhone-0')?.value||'').trim();
    const room=(document.getElementById('bdEditRoom')?.value||'').trim();
    const checkIn=document.getElementById('bdEditCheckIn')?.value||null;
    const checkOut=document.getElementById('bdEditCheckOut')?.value||null;
    if(!firstName){showToast('El nombre no puede quedar vacío');return;}
    const {error}=await db.from('booking_requests').update({first_name:firstName,last_name:lastName,phone,room,check_in:checkIn,check_out:checkOut}).eq('id',_bdId);
    if(error){showToast('Error: '+error.message);return;}
    if(_bdReqCache)Object.assign(_bdReqCache,{firstName,lastName,phone,room,checkIn,checkOut});
    _bdNotifyReqChanged();
  }else{
    const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return;
    // Rate (when not already pinned by a customRateOverride) is computed live
    // from room type + occupancy + check-in date (isLowSeason/getRoomRate) --
    // moving the dates here could silently shift it into a different season
    // bucket. Jorge's ask 2026-10-06: "al cambiar fechas no debe de cambiar la
    // tarifa" -- capture whatever the rate was BEFORE this edit and pin it as
    // an override whenever dates actually change, so editing dates here never
    // moves the price. A room change still re-prices normally (different room
    // = legitimately different rate), only the date fields are guarded.
    const subjBefore=_bdSubject();
    const room=(document.getElementById('bdEditRoom')?.value||'').trim();
    const checkIn=document.getElementById('bdEditCheckIn')?.value||null;
    const checkOut=document.getElementById('bdEditCheckOut')?.value||null;
    if(reg.customRateOverride==null&&(checkIn!==(subjBefore.checkIn||null)||checkOut!==(subjBefore.checkOut||null))){
      reg.customRateOverride=subjBefore.rate;
    }
    // filter() returns the SAME guest object references as reg.guests -- editing
    // namedGuests[gi] here mutates reg.guests in place, no re-merge needed.
    const namedGuests=(reg.guests||[]).filter(g=>g.name&&!g.cancelled);
    for(let gi=0;gi<namedGuests.length;gi++){
      const name=(document.getElementById(`bdEditName-${gi}`)?.value||'').trim();
      if(!name){showToast('El nombre no puede quedar vacío');return;}
      namedGuests[gi].name=name;
      namedGuests[gi].email=(document.getElementById(`bdEditEmail-${gi}`)?.value||'').trim();
      namedGuests[gi].phone=(document.getElementById(`bdEditPhone-${gi}`)?.value||'').trim();
    }
    const {error}=await db.from('registrations').update({guests:reg.guests,room,check_in:checkIn,check_out:checkOut,custom_rate_override:reg.customRateOverride}).eq('id',reg.id);
    if(error){showToast('Error: '+error.message);return;}
    reg.room=room;reg.checkIn=checkIn;reg.checkOut=checkOut;
  }
  _bdDetailEditMode=false;
  showToast('Guardado ✓');
  _bdRender();
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
  if(!confirm(`Check out ${_joinNames(subj.allGuests.map(g=>g.name))||'this guest'} from room ${subj.room}?`))return;
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

// Marks THIS room's registration as cancelled -- kept (not deleted), excluded
// from Arrivals/In House/Departures and Transport (modules/reservations.js,
// modules/transport.js, netlify/functions/auto-charge-transport.js all check
// reg.cancelled), but still findable/tagged "Cancelled" in Advanced Search.
// 'req' kind (booking_requests) has its own equivalent already -- Delete sets
// status='declined' there -- so this button only shows for 'reg' kind.
async function bdCancelReservation(){
  if(_bdKind!=='reg')return;
  const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return;
  if(reg.cancelled){showToast('Ya está cancelada.');return;}
  const names=(reg.guests||[]).map(g=>g.name).filter(Boolean).join(' & ');
  if(!confirm(`Cancel this reservation — room ${reg.room||''} (${names||'guest'})?\n\nStays on record as cancelled (not deleted) — comes out of Arrivals/In House/Departures and Transport, but you can still find it later in Advanced Search.`))return;
  const now=new Date().toISOString();
  const {error}=await db.from('registrations').update({cancelled:true,cancelled_at:now}).eq('id',reg.id);
  if(error){showToast('Error: '+error.message);return;}
  reg.cancelled=true;reg.cancelledAt=now;
  // Room Only is normally 1:1 booking↔room — also mark the BOOKING cancelled
  // so the room actually frees up everywhere that already checks bk.status
  // (Room Calendar availability, the "+ Book a Room" conflict check, etc.).
  // But a Split Stay (bdConfirmSplitStay, 2026-09-29) can leave a room_only
  // booking with a SECOND registration/room too -- cancelling the booking
  // there would wrongly take the other segment's room down as well, so only
  // do this when this really is the only registration left under it.
  const bk=AppData.bookings.find(b=>b.id===reg.bookingId);
  const _otherActiveRegs=AppData.regs.filter(r=>r.bookingId===reg.bookingId&&r.id!==reg.id&&!r.cancelled).length;
  if(bk&&bk.bookingType==='room_only'&&!_otherActiveRegs&&bk.status!=='cancelled'){
    const {error:bErr}=await db.from('bookings').update({status:'cancelled'}).eq('id',bk.id);
    if(bErr)showToast('Cancelled the reservation, but could not free the room: '+bErr.message);
    else bk.status='cancelled';
  }
  if(typeof logActivity==='function')logActivity('Reservation cancelled',`${names||'Guest'} · ${reg.room||''}`,reg.bookingId);
  showToast('Reservation cancelled ✓');
  _bdRender();
  if(typeof venBuild==='function')venBuild();
  if(typeof rcBuild==='function')rcBuild();
  if(typeof resRefresh==='function')resRefresh();
}

// ── Split Stay — a guest moves to a DIFFERENT physical room mid-stay without
// it being a paid Upgrade (Jorge's ask 2026-09-29: "unos días está en un
// cuarto y otros días en otro, eso no lo tenemos"). Shortens this reg's own
// stay to end at the split date, then creates a SECOND registration for the
// new room covering the rest of the stay — _calcRoomRevenue already bills
// per physical room, so two regs under the same booking just work, no
// billing-engine change needed. The new segment's rate is frozen at the SAME
// per-night rate this reg was already paying (same principle as
// rcMoveRoom's cross-category protection, added earlier today) so switching
// rooms mid-stay never silently changes what the guest owes.
function bdOpenSplitStay(){
  const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return;
  const bk=AppData.bookings.find(b=>b.id===reg.bookingId);if(!bk)return;
  const checkIn=reg.checkIn||bk.startDate,checkOut=reg.checkOut||bk.endDate;
  const minSplit=fmtISO(addDays(pd(checkIn),1));
  const maxSplit=fmtISO(addDays(pd(checkOut),-1));
  if(pd(minSplit)>pd(maxSplit)){showToast('This stay is too short to split (needs at least 2 nights).');return;}

  let modal=document.getElementById('bdSplitModal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='bdSplitModal';
    modal.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;align-items:center;justify-content:center';
    modal.innerHTML=`<div style="background:#fff;border-radius:14px;width:420px;max-width:96vw;max-height:90vh;overflow-y:auto;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.4)">
      <div style="font-size:16px;font-weight:800;color:#111827;margin-bottom:4px">Split Stay</div>
      <div id="bdSplitSub" style="font-size:13px;color:#6b7280;margin-bottom:18px"></div>
      <label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">Moves to a new room starting</label>
      <input id="bd-split-date" type="date" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;margin-bottom:14px">
      <label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">New room</label>
      <select id="bd-split-room" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;margin-bottom:8px"></select>
      <div id="bdSplitErr" style="color:#dc2626;font-size:12px;margin-bottom:8px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
        <button onclick="document.getElementById('bdSplitModal').style.display='none'" style="padding:8px 18px;border:1.5px solid #d1d5db;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif">Cancel</button>
        <button id="bdSplitBtn" onclick="bdConfirmSplitStay()" style="padding:8px 20px;border:none;border-radius:8px;background:#2d6a6a;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Jost',sans-serif">Split</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }
  const names=(reg.guests||[]).map(g=>g.name).filter(Boolean).join(' & ');
  document.getElementById('bdSplitSub').textContent=`${names||'Guest'} — currently room ${reg.room} (${fmtDate(checkIn)}–${fmtDate(checkOut)})`;
  const dateEl=document.getElementById('bd-split-date');
  dateEl.min=minSplit;dateEl.max=maxSplit;dateEl.value=minSplit;
  const roomSel=document.getElementById('bd-split-room');
  const opts=[];
  AppData.roomTypes.forEach(rt=>{
    const rooms=(rt.rooms||[]).filter(r=>!roomCodesEqual(r,reg.room));
    if(!rooms.length)return;
    opts.push(`<optgroup label="${escHtml(rt.name)}">${rooms.map(r=>`<option value="${escHtml(r)}">${escHtml(r)}</option>`).join('')}</optgroup>`);
  });
  roomSel.innerHTML=opts.join('');
  document.getElementById('bdSplitErr').textContent='';
  const btn=document.getElementById('bdSplitBtn');btn.disabled=false;btn.textContent='Split';
  modal.style.display='flex';
}
async function bdConfirmSplitStay(){
  const reg=AppData.regs.find(r=>r.id===_bdId);if(!reg)return;
  const bk=AppData.bookings.find(b=>b.id===reg.bookingId);if(!bk)return;
  const errEl=document.getElementById('bdSplitErr');
  const splitDate=document.getElementById('bd-split-date')?.value;
  const newRoom=document.getElementById('bd-split-room')?.value;
  if(!splitDate||!newRoom){errEl.textContent='Pick a date and a room.';return;}
  const checkIn=reg.checkIn||bk.startDate,checkOut=reg.checkOut||bk.endDate;
  if(!(splitDate>checkIn&&splitDate<checkOut)){errEl.textContent='The split date must fall strictly within the current stay.';return;}
  // Same conflict check rcMoveRoom uses (modules/venues.js) -- is the new
  // room already blocked by another booking for any of those nights?
  const conflict=AppData.bookings.find(other=>
    other.id!==bk.id&&other.status!=='cancelled'&&
    roomListIncludes(other.blockedRooms,newRoom)&&
    datesOverlap(splitDate,checkOut,other.startDate,other.endDate)
  );
  if(conflict){errEl.textContent=`Room ${newRoom} is already blocked by ${conflict.leaderName||conflict.retreatName} for part of those dates.`;return;}

  const btn=document.getElementById('bdSplitBtn');
  const origLabel=btn.textContent;btn.disabled=true;btn.textContent='Splitting…';
  try{
    const newRt=AppData.roomTypes.find(rt=>(rt.rooms||[]).includes(newRoom));
    const currentRt=AppData.roomTypes.find(rt=>(rt.rooms||[]).includes(reg.room));
    const gc=(reg.guests||[]).filter(g=>g.name&&!g.cancelled).length||1;
    const origNights=Math.max(1,Math.round((pd(checkOut)-pd(checkIn))/DAY_MS));
    const carryRate=reg.customRateOverride!=null?reg.customRateOverride:(currentRt?getRoomRate(currentRt,gc,checkIn,origNights):null);

    const {error:e1}=await db.from('registrations').update({check_out:splitDate}).eq('id',reg.id);
    if(e1)throw new Error(e1.message);

    const newRegPayload={
      id:uid(),booking_id:bk.id,room:newRoom,room_type_id:newRt?.id||null,
      guests:JSON.parse(JSON.stringify(reg.guests||[])),
      check_in:splitDate,check_out:checkOut,
      checked_in_at:reg.checkedInAt||null,
      custom_rate_override:carryRate,
      stripe_customer_id:reg.stripeCustomerId||null,
      stripe_payment_method_id:reg.stripePaymentMethodId||null,
      stripe_card_brand:reg.stripeCardBrand||null,
      stripe_card_last4:reg.stripeCardLast4||null,
      notes:reg.notes||'',
    };
    const {data:createdRows,error:e2}=await db.from('registrations').insert(newRegPayload).select();
    if(e2)throw new Error(e2.message);
    const created=createdRows?.[0];

    if(!roomListIncludes(bk.blockedRooms,newRoom)){
      const updatedBlocked=[...(bk.blockedRooms||[]),newRoom];
      const {error:e3}=await db.from('bookings').update({blocked_rooms:updatedBlocked}).eq('id',bk.id);
      if(e3)throw new Error(e3.message);
      bk.blockedRooms=updatedBlocked;
    }

    reg.checkOut=splitDate;
    if(created)AppData.regs.push(sqlRegToApp(created));
    saveAll();
    if(typeof logActivity==='function')logActivity('Stay split',`${reg.room} → ${newRoom} from ${fmtDate(splitDate)}`,bk.id);
    showToast(`Split ✓ — moves to ${newRoom} on ${fmtDate(splitDate)}`);
    document.getElementById('bdSplitModal').style.display='none';
    _bdRender();
    if(typeof venBuild==='function')venBuild();
    if(typeof rcBuild==='function')rcBuild();
    if(typeof resRefresh==='function')resRefresh();
  }catch(e){
    errEl.textContent=e.message||'Something went wrong.';
    btn.disabled=false;btn.textContent=origLabel;
  }
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
  // A Room Only booking that's been Split (bdConfirmSplitStay, 2026-09-29)
  // now has MORE than one registration under it too -- in that case it needs
  // the exact same "just this one" treatment, or deleting one segment would
  // wrongly cancel the whole booking (and the other segment's room with it).
  const _otherRegsCount=AppData.regs.filter(r=>r.bookingId===bookingId&&r.id!==reg.id).length;
  if(_bk&&(_bk.bookingType!=='room_only'||_otherRegsCount>0)){
    const names=(reg.guests||[]).map(g=>g.name).filter(Boolean).join(', ');
    if(!confirm(`Remove ${names||'this guest'} from room ${reg.room}?\n\nOnly this room's registration is removed — the rest of ${_bk.leaderName||_bk.retreatName||'the retreat'} is not touched.`))return;
    try{await _bdReleaseFoliosForDelete(reg,_bk);}catch(e){showToast('Error: '+e.message);return;}
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
  try{await _bdReleaseFoliosForDelete(reg,_bk);}catch(e){showToast('Error: '+e.message);return;}
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

// amountOverride lets bdOpenStripePaymentTotal() ("Pay Full Balance", 2026-09-29)
// target whichever folio has the largest balance, even a CLOSED one with no
// per-folio payment row of its own in the DOM to read an amount from.
async function bdOpenStripePayment(fid,amountOverride){
  const amount=amountOverride??parseFloat(document.getElementById(`bd-pay-amount-${fid}`)?.value);
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
