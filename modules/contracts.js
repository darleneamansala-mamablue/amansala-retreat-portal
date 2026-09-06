// ===== contracts.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== CONTRACT TEMPLATE =====
const CONTRACT_TMPL_KEY='amansala_contract_template';
const CONTRACT_TMPL_DEFAULTS={
  depositAmount:'$2,500',
  cancellationFee:'$750',
  acFee:'$25',
  highInclusions:'High Season Inclusions: All meals except one dinner, use of yoga shala, housekeeping every other day, one cooking demonstration, and one Latin Grooves dance class.',
  lowInclusions:'Low Season Rates Include: All meals except one dinner, use of yoga shala, housekeeping every other day, one cooking demonstration, and one Latin Grooves dance class — all complimentary.',
  highRates:[
    {room:'Beachfront King',solo:'$575',sharing:'$360 pp'},
    {room:'Superior King',solo:'$475',sharing:'$305 pp'},
    {room:'Garden Plus King',solo:'$390',sharing:'$260 pp'},
    {room:'Garden King',solo:'$345',sharing:'$240 pp'},
    {room:'Garden Basic (private)',solo:'$295',sharing:'—'},
    {room:'Double Beachview',solo:'',sharing:'$335 pp'},
    {room:'Double Room',solo:'',sharing:'$275 pp'},
    {room:'Triple Room',solo:'',sharing:'$235 pp'}
  ],
  lowRates:[
    {room:'Beachfront King',solo:'$485',sharing:'$290 pp'},
    {room:'Superior King',solo:'$390',sharing:'$240 pp'},
    {room:'Garden Plus King',solo:'$315',sharing:'$200 pp'},
    {room:'Garden King',solo:'$300',sharing:'$200 pp'},
    {room:'Garden Basic (private)',solo:'$265',sharing:'—'},
    {room:'Double Beachview',solo:'',sharing:'$285 pp'},
    {room:'Double Room',solo:'',sharing:'$245 pp'},
    {room:'Triple Room',solo:'',sharing:'$220 pp'}
  ],
  paymentTerms:'All prices in this contract are in U.S. Dollars (USD).\n\nA deposit of {depositAmount} USD is due upon signing this contract. An invoice will be issued after the contract is signed. If the deposit is not received within seven (7) days of signing, Casa de Agua reserves the right to release the dates.\n\nAll payments must be made via bank wire or bank transfer. Credit cards are not accepted.\n\nFull payment for the group is due 6 weeks prior to the retreat start date. Any last-minute registrations must be paid within 3 weeks of the start date.',
  cancellationPolicy:'Cancellation by the Retreat Leader\n\nMore than 16 weeks before the start date: deposit refunded less {cancellationFee} USD.\n\nWithin 16 weeks of the start date: deposit is non-refundable and non-transferable to other dates or personal use.\n\nCancellation by Participants\n\nMore than 3 weeks prior to the start date: two (2) nights will be charged according to the occupancy type booked.\n\n3 weeks or less prior to the start date: non-refundable and non-transferable.\n\nThe Retreat Leader must clearly communicate this cancellation policy to their registrants. Casa de Agua\'s cancellation policy is independent of the Retreat Leader\'s own participant cancellation policy.',
  teacherPolicy:'With 15 paying guests (not including the Retreat Leader): one teacher receives room and board in a small private room (not beachfront) or a larger shared room. The comped room is for one person only — any additional person is charged at the group rate.\n\nIf the group does not reach 15 paying guests, the Retreat Leader\'s accommodations are charged at the group rate.\n\nWith 25 paying guests: two teachers receive either one shared large room with two beds, or two basic garden rooms. Upgrades are available by paying the difference.\n\nIf the minimum number of paying guests is not reached for a free room, Casa de Agua will offer a $20 USD per person, per day credit for each paying signup, applied toward the room. Example: 10 paying guests = $200 USD room credit.',
  yogaPolicy:'Amansala has four yoga shalas: one for up to 15 people, two for up to 25 people, and two for up to 45 people.\n\nSpace requests are honored on a best-effort basis; shalas are assigned based on group size and availability and cannot be guaranteed. All scheduling requests must be submitted 6 weeks prior to arrival.',
  propertyPolicy:'Air Conditioning: Room AC operates from 9:00 PM – 9:00 AM due to generator usage. 24-hour AC may be added for {acFee} per person per night (typically only necessary June–October).\n\nRoom Allotment Adjustments: Requests to increase or decrease room allotments are subject to availability at the time of request. If rooms remain unused 45 days prior to arrival, Casa de Agua reserves the right to resell them. The Retreat Leader will not be responsible for unused rooms.\n\nFlight Details: Flight details must be submitted 30 days prior to arrival using the form provided.\n\nCheck-In / Check-Out: Check-in is at 3:00 PM. Check-out is at 12:00 PM (noon). Early check-in is subject to availability and may incur an additional fee.',
  liabilityPolicy:'Limitation of Liability — Force Majeure: Performance of this Agreement is subject to acts of God, natural disasters, hurricanes, war, government regulations, transportation interruptions, civil disorder, or other events making travel impossible or inadvisable. In such cases, a credit toward a future retreat will be issued, valid for 24 months from the date of issuance. No cash refunds shall be issued under force majeure circumstances.\n\nLiability & Responsibility Disclaimer: The Retreat Organizer (signatory) acknowledges and agrees that the Retreat Organizer is the sole organizer and promoter of the retreat and is fully responsible for their guests, including their safety, legal claims, and travel arrangements. Casa de Agua acts solely as the reservation and contracting party for this booking and is not the operator or provider of on-site accommodations, services, meals, classes, or activities. All on-site services and retreat operations are delivered exclusively by Agua y Paz, an independent Mexican operational company. Casa de Agua bears no responsibility for any acts, omissions, injuries, losses, or claims of any nature arising from on-site operations or any matter occurring within the country of retreat. All such responsibility rests solely with Agua y Paz.\n\nIndemnification: The Organizer agrees to indemnify, defend, and hold harmless Casa de Agua, its owners, employees, and affiliates, from any and all claims, injuries, damages, losses, or liabilities related to the retreat, including but not limited to accidents, cancellations, or disputes arising between the Organizer and their participants. This indemnification obligation shall survive the termination or expiration of this Agreement.\n\nOrganizer Communications to Participants: The Organizer agrees to communicate clearly to all retreat participants that Casa de Agua is not the operator of the retreat, and that any concerns or liabilities related to the retreat experience must be addressed with the Organizer or with Agua y Paz directly.\n\nGoverning Law: This Agreement shall be governed by and construed in accordance with the laws of the United Mexican States. Any disputes arising under or in connection with this Agreement shall be subject to the jurisdiction of the competent courts of Quintana Roo, Mexico.'
};
function loadContractTmpl(){
  try{
    const s=localStorage.getItem(CONTRACT_TMPL_KEY);
    if(s){const p=JSON.parse(s);return Object.assign({},CONTRACT_TMPL_DEFAULTS,p,{highRates:p.highRates||CONTRACT_TMPL_DEFAULTS.highRates,lowRates:p.lowRates||CONTRACT_TMPL_DEFAULTS.lowRates});}
  }catch(e){}
  return Object.assign({},CONTRACT_TMPL_DEFAULTS);
}
function saveContractTmpl(t){
  localStorage.setItem(CONTRACT_TMPL_KEY,JSON.stringify(t));
  try{syncToSupabase({contractTemplate:t});}catch(e){}
}
function applyTmplVars(text,vars){
  return(text||'').replace(/\{depositAmount\}/g,vars.depositAmount||'$2,500').replace(/\{cancellationFee\}/g,vars.cancellationFee||'$750').replace(/\{acFee\}/g,vars.acFee||'$25');
}
function ctBuildRatesEditorHtml(rates,season){
  const isHigh=season==='high';
  const bg=isHigh?'#fef9ec':'#f0fdf4';
  const brd=isHigh?'#fde68a':'#d1fae5';
  let h=`<table style="width:100%;border-collapse:collapse"><thead><tr style="background:${bg}"><th style="text-align:left;padding:6px 8px;font-size:11.5px;border:1px solid ${brd}">Room Type</th><th style="padding:6px 8px;font-size:11.5px;border:1px solid ${brd};text-align:center">Solo / Night</th><th style="padding:6px 8px;font-size:11.5px;border:1px solid ${brd};text-align:center">Sharing pp / Night</th></tr></thead><tbody>`;
  rates.forEach((r,i)=>{
    h+=`<tr${i%2?' style="background:#fafafa"':''}><td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:12px;font-weight:600">${r.room}</td><td style="padding:3px 6px;border:1px solid #e5e7eb;text-align:center"><input data-s="${season}" data-i="${i}" data-f="solo" value="${(r.solo||'').replace(/"/g,'&quot;')}" style="width:80px;padding:4px 6px;border:1px solid #d1d5db;border-radius:5px;text-align:center;font-family:'Jost',sans-serif;font-size:12px;box-sizing:border-box"></td><td style="padding:3px 6px;border:1px solid #e5e7eb;text-align:center"><input data-s="${season}" data-i="${i}" data-f="sharing" value="${(r.sharing||'').replace(/"/g,'&quot;')}" style="width:90px;padding:4px 6px;border:1px solid #d1d5db;border-radius:5px;text-align:center;font-family:'Jost',sans-serif;font-size:12px;box-sizing:border-box"></td></tr>`;
  });
  h+='</tbody></table>';
  return h;
}
function openContractTemplateEditor(){
  const t=loadContractTmpl();
  document.getElementById('ctDepositAmount').value=t.depositAmount||'$2,500';
  document.getElementById('ctCancellationFee').value=t.cancellationFee||'$750';
  document.getElementById('ctAcFee').value=t.acFee||'$25';
  document.getElementById('ctHighRatesWrap').innerHTML=ctBuildRatesEditorHtml(t.highRates,'high');
  document.getElementById('ctLowRatesWrap').innerHTML=ctBuildRatesEditorHtml(t.lowRates,'low');
  document.getElementById('ctHighInclusions').value=t.highInclusions||'';
  document.getElementById('ctLowInclusions').value=t.lowInclusions||'';
  document.getElementById('ctPaymentTerms').value=t.paymentTerms||'';
  document.getElementById('ctCancellationPolicy').value=t.cancellationPolicy||'';
  document.getElementById('ctTeacherPolicy').value=t.teacherPolicy||'';
  document.getElementById('ctYogaPolicy').value=t.yogaPolicy||'';
  document.getElementById('ctPropertyPolicy').value=t.propertyPolicy||'';
  document.getElementById('ctLiabilityPolicy').value=t.liabilityPolicy||'';
  openModal('contractTemplateModal');
}
function saveContractTemplateFromForm(){
  const t=loadContractTmpl();
  t.depositAmount=document.getElementById('ctDepositAmount').value.trim()||'$2,500';
  t.cancellationFee=document.getElementById('ctCancellationFee').value.trim()||'$750';
  t.acFee=document.getElementById('ctAcFee').value.trim()||'$25';
  t.highInclusions=document.getElementById('ctHighInclusions').value.trim();
  t.lowInclusions=document.getElementById('ctLowInclusions').value.trim();
  t.paymentTerms=document.getElementById('ctPaymentTerms').value.trim();
  t.cancellationPolicy=document.getElementById('ctCancellationPolicy').value.trim();
  t.teacherPolicy=document.getElementById('ctTeacherPolicy').value.trim();
  t.yogaPolicy=document.getElementById('ctYogaPolicy').value.trim();
  t.propertyPolicy=document.getElementById('ctPropertyPolicy').value.trim();
  t.liabilityPolicy=document.getElementById('ctLiabilityPolicy').value.trim();
  document.querySelectorAll('#ctHighRatesWrap input[data-s="high"],#ctLowRatesWrap input[data-s="low"]').forEach(inp=>{
    const s=inp.dataset.s,i=parseInt(inp.dataset.i),f=inp.dataset.f;
    if(s==='high'&&t.highRates[i])t.highRates[i][f]=inp.value.trim();
    if(s==='low'&&t.lowRates[i])t.lowRates[i][f]=inp.value.trim();
  });
  saveContractTmpl(t);
  closeModal('contractTemplateModal');
  showToast('Contract template saved ✓');
}


// ===== CONTRACT GENERATOR =====
let _contractBkId=null;
function openContractModal(bkId){
  // Pull latest from Supabase first so teacher signatures from other devices show immediately
  loadFromSupabase().then(()=>{
    try{loadAll();}catch(e){}
    _openContractModalRender(bkId);
  }).catch(()=>{try{loadAll();}catch(e){} _openContractModalRender(bkId);});
}
function _openContractModalRender(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  _contractBkId=bkId;
  const isLow=isLowSeasonContract(bk.startDate);
  const today=new Date();today.setHours(0,0,0,0);
  document.getElementById('contractModalTitle').textContent='Retreat Contract — '+(bk.leaderName||bk.retreatName);
  document.getElementById('contractModalSub').textContent=fmtDate(bk.startDate)+' – '+fmtDate(bk.endDate)+' · '+bk.row;
  const badge=document.getElementById('contractSeasonBadge');
  const note=document.getElementById('contractSeasonNote');
  if(isLow){badge.textContent='Low Season';badge.style.cssText='font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;background:#dcfce7;color:#15803d';note.textContent='Rates and inclusions reflect low season (May – Sep)';}
  else{badge.textContent='High Season';badge.style.cssText='font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;background:#fef3c7;color:#92400e';note.textContent='Rates and inclusions reflect high season (Oct – Apr)';}
  document.getElementById('contractPreview').innerHTML=generateContractHTML(bk,isLow,today);
  const notesInput=document.getElementById('contractNotesInput');if(notesInput)notesInput.value=bk.contractNotes||'';
  // Buttons
  const alreadyMarkedSent=['contract_sent','contract_signed','deposit_paid','room_list_sent'].includes(bk.status);
  const sentBtn=document.getElementById('contractSentBtn');
  const portalBtn=document.getElementById('contractSendPortalBtn');
  const sigStatus=document.getElementById('contractSignedStatus');
  const voidBtn=document.getElementById('contractVoidBtn');
  if(bk.contractSignedAt && bk.contractSignature){
    portalBtn.style.display='none';
    sentBtn.style.display='none';
    if(voidBtn)voidBtn.style.display='';
    sigStatus.style.display='flex';
    sigStatus.innerHTML=`&#10003; Signed by ${bk.contractSignature} on ${fmtDate(bk.contractSignedAt.slice(0,10))}`;
    setTimeout(()=>{
      const sigArea=document.getElementById('tcContractSigArea');
      if(!sigArea)return;
      const signedDate=new Date(bk.contractSignedAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
      const pkgs=calcPkgItems(bk);
      sigArea.innerHTML=`
        <div style="font-size:11px;color:#7f8c9a;margin-bottom:10px">Retreat Leader Signature</div>
        <div style="border-bottom:2px solid #1a2332;margin-bottom:8px"></div>
        <div style="font-size:12.5px;font-weight:600">${bk.contractSignature}</div>
        <div style="font-size:11px;color:#7f8c9a;margin-top:10px">Date: ${signedDate}</div>
        ${pkgs.length?`<div style="margin-top:10px;font-size:11.5px;color:var(--teal);font-weight:600">Experiences selected: ${pkgs.map(p=>p.name).join(' · ')}</div>`:''}`;
    },80);
  } else {
    sigStatus.style.display='none';
    if(voidBtn)voidBtn.style.display='none';
    // Always show portal button until signed — status alone doesn't mean it was sent via portal
    portalBtn.style.display='';
    portalBtn.textContent=bk.contractSentViaPortal?'Resend to Teacher Portal':'Send to Teacher Portal';
    sentBtn.style.display=alreadyMarkedSent?'none':'';
  }
  openModal('contractModal');
}
function isLowSeasonContract(dateStr){if(!dateStr)return false;const m=pd(dateStr).getMonth()+1;return m>=5&&m<=9;}
function generateContractHTML(bk,isLow,signDate){
  const leader=bk.leaderName||'Retreat Leader';
  const retreat=bk.retreatName||'';
  const pax=bk.pax||'';
  const nights=getNights(bk);
  const depositDue=fmtShort(addDays(signDate||new Date(),7));
  const payFullDue=fmtShort(addDays(pd(bk.startDate),-42));
  const cancelDeadline=fmtShort(addDays(pd(bk.startDate),-112));
  const roomRelease=fmtShort(addDays(pd(bk.startDate),-45));
  const flightDue=fmtShort(addDays(pd(bk.startDate),-30));
  const lastMinReg=fmtShort(addDays(pd(bk.startDate),-21));
  const hr=`<hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0">`;
  const tmpl=loadContractTmpl();
  function buildRatesTable(rates,season){
    const isHigh=season==='high';
    const bg=isHigh?'#fef9ec':'#f0fdf4';
    const brd=isHigh?'#fde68a':'#d1fae5';
    let t=`<table style="width:100%;border-collapse:collapse;margin:8px 0 4px"><tr style="background:${bg}"><th style="text-align:left;padding:6px 10px;font-size:12px;border:1px solid ${brd}">Room Type</th><th style="padding:6px 10px;font-size:12px;border:1px solid ${brd};text-align:center">Solo / Night</th><th style="padding:6px 10px;font-size:12px;border:1px solid ${brd};text-align:center">Sharing pp / Night</th></tr>`;
    rates.forEach((r,i)=>{
      const s=r.solo||'—',sh=r.sharing||'—';
      t+=`<tr${i%2?' style="background:#fafafa"':''}><td style="padding:5px 10px;border:1px solid #e5e7eb;font-size:12px">${r.room}</td><td style="padding:5px 10px;border:1px solid #e5e7eb;text-align:center;font-size:12px">${s}</td><td style="padding:5px 10px;border:1px solid #e5e7eb;text-align:center;font-size:12px">${sh}</td></tr>`;
    });
    t+='</table>';
    return t;
  }
  const ratesHigh=buildRatesTable(tmpl.highRates,'high')+`<p style="font-size:11px;color:#92400e;margin-top:6px">${tmpl.highInclusions}</p>`;
  const ratesLow=buildRatesTable(tmpl.lowRates,'low')+`<p style="font-size:11.5px;color:#15803d;margin-top:8px;line-height:1.7">${tmpl.lowInclusions}</p>`;
  return `<div style="max-width:720px;margin:0 auto">
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600;color:#1a2332;letter-spacing:.5px">AMANSALA ECO-CHIC RESORT AND RETREAT</div>
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7f8c9a;margin-top:4px">Retreat Agreement</div>
      <div style="margin-top:8px">${isLow?'<span style="background:#dcfce7;color:#15803d;font-size:11px;font-weight:700;padding:3px 12px;border-radius:99px">LOW SEASON RATES</span>':'<span style="background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:3px 12px;border-radius:99px">HIGH SEASON RATES</span>'}</div>
    </div>
    <table style="width:100%;margin-bottom:20px;border-collapse:collapse">
      <tr><td style="padding:5px 0;font-size:13px;color:#7f8c9a;width:190px">Retreat Leader</td><td style="padding:5px 0;font-size:13px;font-weight:600">${leader}</td></tr>
      ${retreat?`<tr><td style="padding:5px 0;font-size:13px;color:#7f8c9a">Retreat Name</td><td style="padding:5px 0;font-size:13px;font-weight:600">${retreat}</td></tr>`:''}
      <tr><td style="padding:5px 0;font-size:13px;color:#7f8c9a">Arrival</td><td style="padding:5px 0;font-size:13px;font-weight:600">${fmtDate(bk.startDate)}</td></tr>
      <tr><td style="padding:5px 0;font-size:13px;color:#7f8c9a">Departure</td><td style="padding:5px 0;font-size:13px;font-weight:600">${fmtDate(bk.endDate)}</td></tr>
      <tr><td style="padding:5px 0;font-size:13px;color:#7f8c9a">Duration</td><td style="padding:5px 0;font-size:13px;font-weight:600">${nights} nights</td></tr>
      ${pax?`<tr><td style="padding:5px 0;font-size:13px;color:#7f8c9a">Participants</td><td style="padding:5px 0;font-size:13px;font-weight:600">${pax} guests</td></tr>`:''}
      ${bk.leaderEmail?`<tr><td style="padding:5px 0;font-size:13px;color:#7f8c9a">Leader Email</td><td style="padding:5px 0;font-size:13px">${bk.leaderEmail}</td></tr>`:''}
    </table>
    ${hr}
    <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;margin-bottom:4px">Room Rates — ${isLow?'Low Season (May – Sep)':'High Season (Oct – Apr)'}</h3>
    <p style="font-size:11.5px;color:#7f8c9a;margin-bottom:8px">All room rates are subject to 16% tax and $${getTip(bk)} USD per person, per day gratuity (covers the waitstaff and kitchen team). Tipping housekeeping, spa therapists, bell staff, and tour guides — or offering a collective team tip — is customary and always appreciated.</p>
    ${isLow?ratesLow:ratesHigh}
    ${hr}
    <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;margin-bottom:10px">Payment Terms</h3>
    ${applyTmplVars(tmpl.paymentTerms,tmpl).split('\n\n').map(p=>`<p style="font-size:12.5px;line-height:1.85;color:#374151;margin-top:8px">${p.replace(/\n/g,'<br>')}</p>`).join('')}
    <p style="font-size:12px;color:#7f8c9a;margin-top:6px">Deposit due by ${depositDue} · Full payment due by ${payFullDue} · Last-minute cutoff ${lastMinReg}</p>
    ${hr}
    <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;margin-bottom:10px">Cancellation Policy</h3>
    ${applyTmplVars(tmpl.cancellationPolicy,tmpl).split('\n\n').map(p=>`<p style="font-size:12.5px;line-height:1.85;color:#374151;margin-top:8px">${p.replace(/\n/g,'<br>')}</p>`).join('')}
    <p style="font-size:12px;color:#7f8c9a;margin-top:6px">Cancellation deadline: ${cancelDeadline} · Last-minute cutoff: ${lastMinReg}</p>
    ${hr}
    <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;margin-bottom:10px">Teacher / Leader Complimentary Policy</h3>
    ${tmpl.teacherPolicy.split('\n\n').map(p=>`<p style="font-size:12.5px;line-height:1.85;color:#374151;margin-top:8px">${p.replace(/\n/g,'<br>')}</p>`).join('')}
    ${hr}
    <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;margin-bottom:10px">Yoga Shalas</h3>
    ${tmpl.yogaPolicy.split('\n\n').map(p=>`<p style="font-size:12.5px;line-height:1.85;color:#374151;margin-top:8px">${p.replace(/\n/g,'<br>')}</p>`).join('')}
    ${hr}
    <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;margin-bottom:10px">Property Policies</h3>
    ${applyTmplVars(tmpl.propertyPolicy,tmpl).split('\n\n').map(p=>`<p style="font-size:12.5px;line-height:1.85;color:#374151;margin-top:8px">${p.replace(/\n/g,'<br>')}</p>`).join('')}
    <p style="font-size:12px;color:#7f8c9a;margin-top:6px">Room release: ${roomRelease} · Flight info due: ${flightDue}</p>
    ${hr}
    <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;margin-bottom:10px">Liability &amp; Governing Terms</h3>
    ${tmpl.liabilityPolicy.split('\n\n').map(p=>`<p style="font-size:12.5px;line-height:1.85;color:#374151;margin-top:8px">${p.replace(/\n/g,'<br>')}</p>`).join('')}
    ${hr}
    ${hr}
    <h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#0369a1;margin-bottom:10px">Special Notes</h3>
    ${bk.contractNotes?`<p style="font-size:12.5px;line-height:1.85;color:#374151;white-space:pre-wrap">${bk.contractNotes}</p>`:`<p style="font-size:12px;color:#9ca3af;font-style:italic">No special notes for this retreat.</p>`}
    <div id="tcContractSigArea"></div>
    <div style="text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#7f8c9a">
      Amansala Eco-Chic Resort &amp; Retreat · Tulum, Mexico · reservations@amansala.com · www.amansala.com
    </div>
  </div>`;
}
function generateContractText(bk,isLow,signDate){
  const leader=bk.leaderName||'Retreat Leader';
  const retreat=bk.retreatName||'';
  const pax=bk.pax||'TBD';
  const nights=getNights(bk);
  const depositDue=fmtShort(addDays(signDate||new Date(),7));
  const payFullDue=fmtShort(addDays(pd(bk.startDate),-42));
  const cancelDeadline=fmtShort(addDays(pd(bk.startDate),-112));
  const roomRelease=fmtShort(addDays(pd(bk.startDate),-45));
  const flightDue=fmtShort(addDays(pd(bk.startDate),-30));
  const lastMinReg=fmtShort(addDays(pd(bk.startDate),-21));
  const season=isLow?'LOW SEASON (May – Sep)':'HIGH SEASON (Oct – Apr)';
  const eq='═'.repeat(52);const dash='─'.repeat(40);
  return `AMANSALA ECO-CHIC RESORT AND RETREAT
GROUP RETREAT BOOKING AGREEMENT — ${season}
${eq}

Retreat Leader:  ${leader}${retreat?'\nRetreat Name:    '+retreat:''}
Arrival:         ${fmtDate(bk.startDate)}
Departure:       ${fmtDate(bk.endDate)}
Duration:        ${nights} nights
Participants:    ${pax}

KEY DATES & DEADLINES
${dash}
Deposit Due (7 days after signing): ${depositDue}
Cancellation Deadline (16 weeks):   ${cancelDeadline}
Room Release (45 days before):      ${roomRelease}
Flight Info Due (30 days before):   ${flightDue}
Last-Min Registration (3 weeks):    ${lastMinReg}
FULL PAYMENT DUE (6 weeks):         ${payFullDue}  ← FINAL DEADLINE

${isLow?`ROOM RATES — LOW SEASON
${dash}
Beachfront King:   $485 solo / $290 pp sharing
Superior King:     $390 solo / $240 pp sharing
Garden Plus King:  $315 solo / $200 pp sharing
Garden King:       $300 solo / $200 pp sharing
Garden Basic:      $265 private
Double Beachview:  $285 pp
Double Room:       $245 pp
Triple Room:       $220 pp`:`ROOM RATES — HIGH SEASON
${dash}
Beachfront King:   $575 solo / $360 pp sharing
Superior King:     $475 solo / $305 pp sharing
Garden Plus King:  $390 solo / $260 pp sharing
Garden King:       $345 solo / $240 pp sharing
Garden Basic:      $295 private
Double Beachview:  $335 pp
Double Room:       $275 pp
Triple Room:       $235 pp`}

RATES INCLUDE: All meals except one dinner, use of yoga shala, housekeeping every other day,
one cooking demonstration, and one Latin Grooves dance class.

All rates are subject to 16% tax and $${getTip(bk)} USD per person, per day gratuity (covers
the waitstaff and kitchen team). Tipping housekeeping, spa therapists, bell staff, and tour
guides is customary and always appreciated.

1. DEPOSIT & PAYMENT
${dash}
All prices in this contract are in U.S. Dollars (USD).

A deposit of $2,500 USD is due upon signing this contract. An invoice will be issued after the
contract is signed. If the deposit is not received within seven (7) days of signing, Casa de Agua
reserves the right to release the dates.

All payments must be made via bank wire or bank transfer. Credit cards are not accepted.

2. PAYMENT SCHEDULE
${dash}
• Full payment for the group is due 6 weeks prior to the retreat start date (by ${payFullDue})
• Last-minute registrations must be paid within 3 weeks of the start date

3. CANCELLATION BY THE RETREAT LEADER
${dash}
• More than 16 weeks before the start date (before ${cancelDeadline}): deposit refunded less $750 USD
• Within 16 weeks of the start date: deposit is non-refundable and non-transferable

4. CANCELLATION BY PARTICIPANTS
${dash}
• More than 3 weeks prior to start date: two (2) nights charged per occupancy type booked
• 3 weeks or less prior to start date: non-refundable and non-transferable

The Retreat Leader must clearly communicate this cancellation policy to their registrants.
Casa de Agua's cancellation policy is independent of the Retreat Leader's own policy.

5. TEACHER / LEADER COMPLIMENTARY POLICY
${dash}
• With 15 paying guests: one teacher receives room and board in a small private room (not
  beachfront) or a larger shared room. Comped room is for one person only.
• If the group does not reach 15 paying guests, the Retreat Leader's accommodations are
  charged at the group rate.
• With 25 paying guests: two teachers receive one shared large room or two basic garden rooms.
  Upgrades available by paying the difference.
• If the minimum is not reached, Casa de Agua offers a $20 USD per person, per day credit
  for each paying signup applied toward the room. Example: 10 guests = $200 USD credit.

6. YOGA SHALAS
${dash}
Amansala has four yoga shalas: one for up to 15 people, two for up to 25 people, and two for
up to 45 people. Space requests are honored on a best-effort basis and cannot be guaranteed.
All scheduling requests must be submitted 6 weeks prior to arrival.

7. PROPERTY POLICIES
${dash}
• Air Conditioning: Room AC operates 9:00 PM – 9:00 AM. 24-hour AC available for $25 USD
  per person per night (typically only necessary June–October).
• Room Allotment: Rooms unused 45 days prior to arrival (${roomRelease}) may be resold.
  The Retreat Leader will not be responsible for unused rooms.
• Flight Details: Must be submitted 30 days prior to arrival (by ${flightDue}).
• Check-in: 3:00 PM | Check-out: 12:00 PM. Early check-in subject to availability and fee.

8. LIABILITY & GOVERNING TERMS
${dash}
Force Majeure: Performance is subject to acts of God, natural disasters, war, government
regulations, or other events making travel impossible. A credit toward a future retreat will be
issued, valid for 24 months. No cash refunds under force majeure.

Liability Disclaimer: Casa de Agua acts solely as the reservation and contracting party. All
on-site services are delivered exclusively by Agua y Paz, an independent Mexican operational
company. Casa de Agua bears no responsibility for acts, omissions, injuries, or claims arising
from on-site operations. All such responsibility rests solely with Agua y Paz.

Indemnification: The Organizer agrees to indemnify and hold harmless Casa de Agua, its
owners, employees, and affiliates from any claims, injuries, or liabilities related to the retreat.
This obligation survives termination of this Agreement.

Governing Law: This Agreement shall be governed by the laws of the United Mexican States.
Disputes shall be subject to the jurisdiction of the courts of Quintana Roo, Mexico.

${bk.contractNotes?`SPECIAL NOTES\n${dash}\n${bk.contractNotes}\n`:''}
${dash}
Retreat Leader Signature: _______________________

Date: _______________________

${dash}
Amansala Eco-Chic Resort & Retreat · Tulum, Mexico
reservations@amansala.com · www.amansala.com`;
}
function contractNotesSave(){
  const bk=AppData.bookings.find(b=>b.id===_contractBkId);if(!bk)return;
  bk.contractNotes=(document.getElementById('contractNotesInput').value||'').trim();
  saveAll();
  const isLow=isLowSeasonContract(bk.startDate);
  const today=new Date();today.setHours(0,0,0,0);
  document.getElementById('contractPreview').innerHTML=generateContractHTML(bk,isLow,today);
  const msg=document.getElementById('contractNotesSavedMsg');
  if(msg){msg.style.display='inline';setTimeout(()=>msg.style.display='none',2500);}
}
function contractNotesChange(val){
  // kept for backwards compat — save button is now primary
  const bk=AppData.bookings.find(b=>b.id===_contractBkId);if(!bk)return;
  bk.contractNotes=val.trim();
}
function copyContract(){
  const bk=AppData.bookings.find(b=>b.id===_contractBkId);if(!bk)return;
  const isLow=isLowSeasonContract(bk.startDate);
  const today=new Date();today.setHours(0,0,0,0);
  const text=generateContractText(bk,isLow,today);
  navigator.clipboard.writeText(text).then(()=>showToast('Contract copied to clipboard!')).catch(()=>{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast('Contract copied!');});
}
async function emailContract(){
  const bk=AppData.bookings.find(b=>b.id===_contractBkId);if(!bk)return;
  if(!bk.leaderEmail){showToast('⚠ No email on file for this retreat leader');return;}
  const portalLink=teacherPortalLink(bk.id);
  bk.contractSentViaPortal=true;
  bk.contractSentAt=new Date().toISOString();
  saveAll();
  await syncToSupabase();
  const name=bk.leaderName||'Retreat Leader';
  const retreat=bk.retreatName||name+"'s Retreat";
  const dates=fmtDate(bk.startDate)+' – '+fmtDate(bk.endDate);
  const subject='Your Retreat Contract is Ready to Sign — '+retreat;
  const body=`<p style="font-size:15px;color:#1a2332">Hi ${name},</p>
<p style="color:#4a4a4a;line-height:1.7">Your retreat agreement for <strong>${retreat}</strong> (${dates}) is ready to review and sign.</p>
<p style="color:#4a4a4a;line-height:1.7">Please click the button below to open your retreat portal, review all the details, and sign the contract digitally:</p>
<div style="text-align:center;margin:28px 0">
  <a href="${portalLink}" style="background:#0e9494;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Review &amp; Sign Contract &rarr;</a>
</div>
<p style="color:#6b7280;font-size:12px;text-align:center">If the button doesn't work, copy this link into your browser:<br>${portalLink}</p>
<p style="color:#4a4a4a">Warm regards,<br><strong>Amansala Team</strong></p>`;
  const btn=document.querySelector('[onclick="emailContract()"]');
  if(btn){btn.disabled=true;btn.textContent='Sending...';}
  try{
    await _sendEmail(bk.leaderEmail,subject,_emailHtmlWrap(body),'retreats@amansala.com');
    showToast(`✉ Contract sent to ${name} (${bk.leaderEmail})`);
    markContractSent();
  }catch(err){
    console.warn('[Email error]',err);
    showToast('⚠ Could not send — '+err.message);
  }finally{
    if(btn){btn.disabled=false;btn.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg> Send Email';}
  }
}
function markContractSent(){
  const bk=AppData.bookings.find(b=>b.id===_contractBkId);if(!bk)return;
  bk.status='contract_sent';
  bk.statusChangedAt=new Date().toISOString();
  saveAll();closeModal('contractModal');buildDashboard();venBuild();
  logActivity('Contract sent (email)',`Sent to ${bk.leaderName||bk.retreatName}`,bk.id);
  showToast('Contract marked as sent!');
}

function sendContractToPortal(){
  const bk=AppData.bookings.find(b=>b.id===_contractBkId);if(!bk)return;
  bk.contractSentViaPortal=true;
  bk.contractSentAt=new Date().toISOString();
  if(!['contract_sent','contract_signed','deposit_paid','room_list_sent'].includes(bk.status)){
    bk.status='contract_sent';
    bk.statusChangedAt=new Date().toISOString();
  }
  saveAll();closeModal('contractModal');buildDashboard();venBuild();
  logActivity('Contract sent to teacher portal',`${bk.leaderName||bk.retreatName} — awaiting signature`,bk.id);
  sendTeacherEmail(bk,'contract_sent');
  const link=teacherPortalLink(bk.id);
  navigator.clipboard.writeText(link).catch(()=>{});
  showToast('Contract sent! Portal link copied to clipboard.');
}

function voidContractSignature(){
  const bk=AppData.bookings.find(b=>b.id===_contractBkId);if(!bk||!bk.contractSignedAt)return;
  const name=bk.leaderName||bk.retreatName||'this retreat';
  if(!confirm(`Void the signed contract for ${name}?\n\nThis will erase the signature and reset the contract status to "Contract Sent" so the teacher must sign again.\n\nThis cannot be undone.`))return;
  const prevSig=bk.contractSignature||'';
  delete bk.contractSignedAt;
  delete bk.contractSignature;
  delete bk.contractSignatureImage;
  delete bk.contractAuditUserAgent;
  delete bk.addOnsConfirmedAt;
  if(bk._contractSignedByPipeline)delete bk._contractSignedByPipeline;
  bk.status='contract_sent';
  bk.statusChangedAt=new Date().toISOString();
  saveAll();
  logActivity('Contract signature voided',`${name}${prevSig?' — was signed by '+prevSig:''}`,bk.id);
  showToast('Signature voided. Teacher must re-sign.');
  // Refresh modal
  openContractModal(bk.id);
  buildDashboard();venBuild();
}

function copyTeacherPortalLink(){
  const m=document.getElementById('teacherEmailModal');
  const link=m?.dataset.link||'';
  if(!link)return;
  navigator.clipboard.writeText(link).then(()=>showToast('Portal link copied!')).catch(()=>showToast('Link: '+link));
}
function venCopyTeacherLink(){
  const bk=AppData.bookings.find(b=>b.id===venEditId);if(!bk)return;
  const link=teacherPortalLink(bk.id);
  navigator.clipboard.writeText(link).then(()=>showToast('Teacher link copied!')).catch(()=>showToast('Link: '+link));
}

function sendRoomListToPortal(){
  const bk=regSelBk;if(!bk)return;
  bk.roomListSentViaPortal=true;
  bk.roomListSentAt=new Date().toISOString();
  if(!['room_list_sent'].includes(bk.status)){
    bk.status='room_list_sent';
    bk.statusChangedAt=new Date().toISOString();
  }
  adminDone[bk.id+'_roomListSent']={ts:new Date().toISOString(),label:'Room List Sent'};saveAdminDone();
  saveAll();buildDashboard();venBuild();
  const rlLbl=document.getElementById('regPortalRoomListLbl');if(rlLbl)rlLbl.textContent='Resend Room List to Portal';
  logActivity('Room list sent to teacher portal',`${bk.leaderName||bk.retreatName} — room assignments now visible in portal`,bk.id);
  openRoomListEmailModal(bk);
}

function autoAssignTeacherRoom(bk){
  // Skip only if a teacher reg already has a real room assigned
  const existing=AppData.regs.find(r=>r.bookingId===bk.id&&r.isTeacherRoom);
  if(existing&&existing.room)return;
  // Remove any incomplete ghost teacher regs (no room assigned)
  if(existing&&!existing.room){
    const idx=AppData.regs.indexOf(existing);if(idx>-1)AppData.regs.splice(idx,1);
  }
  // Teacher room is always Garden Basic (rt5)
  const rt=AppData.roomTypes.find(r=>r.id==='rt5');
  if(!rt){showToast('No Garden Basic room type found — teacher room not assigned.');return;}
  const assignedRooms=new Set(AppData.regs.filter(r=>r.bookingId===bk.id).map(r=>r.room));
  const inBlocked=(bk.blockedRooms||[]).find(r=>rt.rooms.includes(r)&&!assignedRooms.has(r));
  const chosenRoom=inBlocked||rt.rooms.find(r=>!assignedRooms.has(r));
  if(!chosenRoom){showToast('No Garden Basic rooms available — assign teacher room manually.');return;}
  const nights=getNights(bk);
  // Garden Basic is comped for the teacher once the retreat has 10+ paying guests;
  // below that, the teacher pays the normal room rate. Upgrading to a nicer room
  // (upgradeTeacherRoom, below) always charges the full rate for that room regardless.
  const isComped=registeredCount(bk.id)>=10;
  const price=isComped?0:getRoomRate(rt,1,bk.startDate,nights)*(nights||1);
  AppData.regs.push({id:uid(),bookingId:bk.id,room:chosenRoom,roomTypeId:'rt5',isTeacherRoom:true,
    guests:[{name:bk.leaderName||'Retreat Leader',returning:false,yearsAttending:null,notes:'Teacher room (auto-assigned)'}],
    customPrice:price,amountPaid:0,notes:isComped?'Teacher room — Garden Basic (comped, 10+ paying guests)':'Teacher room — Garden Basic (auto-assigned)'});
  if(!(bk.blockedRooms||[]).includes(chosenRoom)){if(!bk.blockedRooms)bk.blockedRooms=[];bk.blockedRooms.push(chosenRoom);bk.blockedRoomsUpdatedAt=new Date().toISOString();}
  logActivity('Teacher room auto-assigned',`${bk.leaderName||bk.retreatName} — ${chosenRoom} (Garden Basic) · ${isComped?'comped':'$'+price}`,bk.id);
}

function upgradeTeacherRoom(bkId,newRoom){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const teacherReg=AppData.regs.find(r=>r.bookingId===bkId&&r.isTeacherRoom);if(!teacherReg)return;
  const gkType=AppData.roomTypes.find(rt=>rt.id==='rt4');// Garden King
  if(!gkType)return;
  const nights=getNights(bk);
  const oldRoom=teacherReg.room;
  teacherReg.room=newRoom;
  teacherReg.roomTypeId='rt4';
  teacherReg.customPrice=getRoomRate(gkType,1,bk.startDate,nights)*nights;
  teacherReg.notes='Teacher room — upgraded to Garden King';
  if(!bk.blockedRooms)bk.blockedRooms=[];
  if(!bk.blockedRooms.includes(newRoom))bk.blockedRooms.push(newRoom);
  bk.blockedRoomsUpdatedAt=new Date().toISOString();
  saveAll();buildDashboard();regRender();
  logActivity('Teacher room upgraded',`${bk.leaderName||bk.retreatName} — ${oldRoom} → ${newRoom} (Garden King)`,bkId);
  showToast(`Teacher moved to ${newRoom} (Garden King)`);
}

function openRoomListEmailModal(bk){
  const name=bk.leaderName||bk.retreatName||'Teacher';
  const firstName=name.split(' ')[0];
  const retreat=bk.retreatName||bk.leaderName||'Retreat';
  const dates=`${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}`;
  const link=teacherPortalLink(bk.id);
  const subject=`Your Room List Is Ready — ${retreat} (${dates})`;
  const body=`Hi ${firstName},

Great news! Your room list has been activated in your retreat portal. You can now view your room assignments for ${retreat} (${dates}).

Access your portal here:
${link}

Questions? Contact us at darlene@amansala.com.

Warm regards,
The Amansala Team`;
  document.getElementById('teacherEmailSub').textContent=name+(bk.leaderEmail?' — '+bk.leaderEmail:'');
  document.getElementById('teacherEmailSubject').value=subject;
  document.getElementById('teacherEmailBody').value=body;
  // Store for mailto button
  document.getElementById('teacherEmailModal').dataset.to=bk.leaderEmail||'';
  document.getElementById('teacherEmailModal').dataset.subject=subject;
  document.getElementById('teacherEmailModal').dataset.link=link;
  openModal('teacherEmailModal');
}

function renderTeacherContract(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const body=document.getElementById('tcContractBody');
  const signSection=document.getElementById('tcSignSection');
  const signedBanner=document.getElementById('tcSignedBanner');
  const notSentMsg=document.getElementById('tcNotSentMsg');
  if(!body)return;

  const contractAvailable=bk.contractSentViaPortal||['contract_sent','contract_signed','deposit_paid','room_list_sent','confirmed'].includes(bk.status);
  if(!contractAvailable){
    body.style.display='none';signSection.style.display='none';
    signedBanner.style.display='none';notSentMsg.style.display='block';
    return;
  }

  const isLow=isLowSeasonContract(bk.startDate);
  const sentDate=bk.contractSentAt?new Date(bk.contractSentAt):new Date();
  sentDate.setHours(0,0,0,0);
  body.innerHTML=generateContractHTML(bk,isLow,sentDate);
  body.style.display='block';
  notSentMsg.style.display='none';

  if(bk.contractSignedAt && bk.contractSignature){
    signSection.style.display='none';
    signedBanner.style.display='flex';
    const pkgs=calcPkgItems(bk);
    const pkgLine=pkgs.length?` · ${pkgs.map(p=>p.name).join(', ')}`:'';
    document.getElementById('tcSignedDetail').textContent=
      `Signed by ${bk.contractSignature} on ${new Date(bk.contractSignedAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}${pkgLine}`;
    setTimeout(()=>{
      const sigArea=document.getElementById('tcContractSigArea');
      if(!sigArea)return;
      const signedDate=new Date(bk.contractSignedAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
      sigArea.innerHTML=`<div style="max-width:420px;margin-top:8px">
        <div style="border:1.5px solid #86efac;border-radius:10px;padding:16px 20px;background:#f0fdf4">
          <div style="font-size:11px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Retreat Leader Signature</div>
          <div style="border-bottom:2px solid #1a2332;margin-bottom:8px"></div>
          <div style="font-size:13px;font-weight:700;color:#1a2332">${bk.contractSignature}</div>
          <div style="font-size:11px;color:#166534;margin-top:8px">Signed: ${signedDate}</div>
          ${pkgs.length?pkgs.map(p=>p.name).join(' · '):''}
        </div>
      </div>`;
    },80);
  } else {
    signedBanner.style.display='none';
    signSection.style.display='block';
    // Render compact add-on grid with existing selections pre-checked
    tcRenderAddonGrid(bk.packages||[]);
  }
}


// ===== SIGNATURE PAD =====
let _sigDrawing=false,_sigHasMark=false;
function sigInit(){
  const canvas=document.getElementById('sigCanvas');if(!canvas)return;
  const rect=()=>canvas.getBoundingClientRect();
  const ctx=canvas.getContext('2d');
  canvas.width=canvas.offsetWidth||600;
  ctx.strokeStyle='#1a2433';ctx.lineWidth=2.2;ctx.lineCap='round';ctx.lineJoin='round';
  const pos=(e)=>{const r=rect();const src=e.touches?e.touches[0]:e;return{x:(src.clientX-r.left)*(canvas.width/r.width),y:(src.clientY-r.top)*(canvas.height/r.height)};};
  const start=(e)=>{e.preventDefault();_sigDrawing=true;_sigHasMark=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);document.getElementById('sigPlaceholder').style.display='none';};
  const move=(e)=>{e.preventDefault();if(!_sigDrawing)return;const p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.beginPath();ctx.moveTo(p.x,p.y);};
  const end=(e)=>{e.preventDefault();_sigDrawing=false;};
  canvas.addEventListener('mousedown',start);canvas.addEventListener('mousemove',move);canvas.addEventListener('mouseup',end);canvas.addEventListener('mouseleave',end);
  canvas.addEventListener('touchstart',start,{passive:false});canvas.addEventListener('touchmove',move,{passive:false});canvas.addEventListener('touchend',end);
}
function sigClear(){
  const canvas=document.getElementById('sigCanvas');if(!canvas)return;
  canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  _sigHasMark=false;
  document.getElementById('sigPlaceholder').style.display='';
}
function sigGetDataUrl(){
  const canvas=document.getElementById('sigCanvas');if(!canvas||!_sigHasMark)return null;
  return canvas.toDataURL('image/png');
}

function teacherSignContract(){
  const savedId=(localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id'));
  const bk=AppData.bookings.find(b=>b.id===savedId);if(!bk)return;
  const name=(document.getElementById('tcSigName').value||'').trim();
  const agreed=document.getElementById('tcSigAgree').checked;
  if(!name){showToast('Please type your full legal name to sign.');return;}
  if(!agreed){showToast('Please check the agreement box to confirm you have read the terms.');return;}
  // Read selected add-ons from inline checkboxes
  const selectedPkgs=[...document.querySelectorAll('#tcAddonGrid input[type=checkbox]:checked')]
    .map(cb=>cb.dataset.id).filter(Boolean);
  bk.contractSignature=name;
  bk.contractSignedAt=new Date().toISOString();
  bk.contractAuditUserAgent=navigator.userAgent;
  bk.packages=selectedPkgs;
  bk.addOnsConfirmedAt=new Date().toISOString();
  delete bk.contractSignatureImage;
  bk.status='contract_signed';
  bk.statusChangedAt=new Date().toISOString();
  // Auto-generate deposit invoice on first sign
  if(!bk.depositInvoice){
    bk.depositInvoice={number:getNextInvoiceNumber(),issuedAt:new Date().toISOString(),dueAt:new Date(Date.now()+7*86400000).toISOString(),amount:2500,status:'pending'};
  }
  if(typeof pipeAutoAdvance==='function')pipeAutoAdvance(bk,'contract_signed');
  saveAll();
  const names=ADD_ONS.filter(a=>selectedPkgs.includes(a.id)).map(a=>a.name);
  logActivity('Contract signed',`${bk.leaderName||bk.retreatName} — signed by ${name}${names.length?' · '+names.join(', '):''}`,bk.id);
  const contractBtn=document.getElementById('tnBtnContract');
  if(contractBtn){const dot=contractBtn.querySelector('.tn-dot');if(dot)dot.remove();}
  // Add dot to My Finances tab so teacher notices the invoice
  const finBtn=document.getElementById('tnBtnFinancial');
  if(finBtn&&!finBtn.querySelector('.tn-dot')){const dot=document.createElement('span');dot.className='tn-dot';dot.style.background='#d97706';finBtn.appendChild(dot);}
  renderTeacherContract(savedId);
  renderTeacherUpgrades(bk);
  showToast('Contract signed. Thank you!');
  // Notify Amansala team
  const _sigRetreat=bk.retreatName||bk.leaderName||'Retreat';
  const _sigDates=fmtDate(bk.startDate)+' – '+fmtDate(bk.endDate);
  const _sigBody=`<p style="font-size:15px;color:#1a2332">Contract Signed</p>
<p style="color:#4a4a4a;line-height:1.7"><strong>${bk.leaderName||'Retreat Leader'}</strong> has signed the retreat agreement for <strong>${_sigRetreat}</strong> (${_sigDates}).</p>
<p style="color:#4a4a4a">Signed by: <strong>${name}</strong><br>Date: ${new Date().toLocaleString()}</p>`;
  _sendEmail('retreats@amansala.com','✅ Contract Signed — '+_sigRetreat,_emailHtmlWrap(_sigBody),'retreats@amansala.com').catch(()=>{});
  // Auto-send deposit invoice to teacher
  if(bk.leaderEmail) _sendDepositInvoiceEmail(bk).catch(()=>{});
  setTimeout(()=>{populateDepositModal(bk.id);openModal('depositReminderModal');},600);
}

async function _sendDepositInvoiceEmail(bk){
  if(!bk?.leaderEmail||!bk.depositInvoice)return;
  const inv=bk.depositInvoice;
  const name=bk.leaderName||'Retreat Leader';
  const retreat=bk.retreatName||name+"'s Retreat";
  const dates=fmtDate(bk.startDate)+' – '+fmtDate(bk.endDate);
  const portal=teacherPortalLink(bk.id);
  const issuedDate=new Date(inv.issuedAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const dueDate=new Date(inv.dueAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const bankLines=(bankDetails||'').trim().split('\n').filter(l=>l.trim()&&!l.trim().startsWith('Reference'));
  const bankHTML=bankLines.map(l=>`<div style="font-size:12px;color:#4b5563;line-height:1.9;font-family:monospace">${l.trim()}</div>`).join('');
  const body=`
<p style="font-size:15px;color:#1a2332">Hi ${name},</p>
<p style="color:#4a4a4a;line-height:1.7">Thank you for signing the retreat agreement for <strong>${retreat}</strong>. Your deposit invoice is attached below.</p>
<table style="width:100%;border-collapse:collapse;background:#fff;border:1.5px solid #c8dada;border-radius:12px;overflow:hidden;margin:20px 0">
  <tr style="background:linear-gradient(135deg,#2d6a6a,#3d8080)">
    <td colspan="2" style="padding:22px 28px">
      <div style="color:#fff;font-size:22px;font-family:Georgia,serif;font-weight:600">Amansala</div>
      <div style="color:rgba(255,255,255,.7);font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Deposit Invoice · ${inv.number}</div>
    </td>
  </tr>
  <tr style="background:#faf7f3;border-bottom:1px solid #e8e0d4">
    <td style="padding:16px 28px;width:50%">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#9a8f82;font-weight:700;margin-bottom:6px">Billed To</div>
      <div style="font-size:13px;font-weight:700;color:#2d3a3a">${name}</div>
      <div style="font-size:12px;color:#7a7068">${bk.leaderEmail}</div>
    </td>
    <td style="padding:16px 28px">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#9a8f82;font-weight:700;margin-bottom:6px">Invoice Details</div>
      <div style="font-size:12px;color:#4b5563;line-height:1.9">Issued: <strong>${issuedDate}</strong><br>Due: <strong style="color:#b04040">${dueDate}</strong><br>Retreat: ${dates}</div>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding:22px 28px;border-bottom:1px solid #e8e0d4">
      <table style="width:100%;border-collapse:collapse">
        <tr style="border-bottom:1px solid #ece7df">
          <th style="text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#9a8f82;padding-bottom:8px">Description</th>
          <th style="text-align:right;font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#9a8f82;padding-bottom:8px">Amount</th>
        </tr>
        <tr>
          <td style="padding:16px 0 12px;font-size:13px;color:#2d3a3a;font-weight:600">Deposit for Retreat<br><span style="font-size:11px;color:#9a8f82;font-weight:400">${dates}</span></td>
          <td style="padding:16px 0 12px;text-align:right;font-size:18px;font-weight:700;color:#2d6a6a">$2,500.00</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding:22px 28px;background:#f0f9f9">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#2d6a6a;font-weight:700;margin-bottom:14px">How to Pay</div>
      <div style="background:#fff;border:1px solid #c8dada;border-radius:8px;padding:14px 16px;margin-bottom:14px">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;font-weight:700;margin-bottom:8px">Wire / Bank Transfer</div>
        ${bankHTML||'<div style="font-size:12px;color:#7a7068">Contact retreats@amansala.com for wire details</div>'}
      </div>
      <div style="font-size:11.5px;color:#7a7068;line-height:1.7;text-align:center">Once your transfer is complete, please send your <strong>proof of payment</strong> to <a href="mailto:retreats@amansala.com" style="color:#2d6a6a;font-weight:700">retreats@amansala.com</a></div>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding:14px 28px;background:#faf7f3;text-align:center;border-top:1px solid #e8e0d4">
      <a href="${portal}" style="display:inline-block;background:#2d6a6a;color:#fff;padding:10px 24px;border-radius:7px;text-decoration:none;font-weight:600;font-size:13px">View Invoice in Portal →</a>
    </td>
  </tr>
</table>
<p style="color:#6b7280;font-size:12px;line-height:1.7">If the deposit is not received within <strong>7 days</strong> of signing, Casa de Agua reserves the right to release the dates. If you have any questions, please reply to this email.</p>
<p style="color:#4a4a4a">Warm regards,<br><strong>Amansala Team</strong></p>`;
  await _sendEmail(bk.leaderEmail,'Deposit Invoice #'+inv.number+' — '+retreat,_emailHtmlWrap(body),'retreats@amansala.com');
  bk.depositInvoiceSentAt=new Date().toISOString();
  saveAll();
  logActivity('Deposit invoice emailed',`Invoice ${inv.number} · $2,500 · due ${dueDate} · sent to ${bk.leaderEmail}`,bk.id);
}

function populateDepositModal(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  // Room block preview
  const roomsEl=document.getElementById('drm-rooms');
  if(roomsEl){
    const rooms=bk.blockedRooms||[];
    if(!rooms.length){roomsEl.style.display='none';return;}
    // Group by room type
    const grouped=[];
    AppData.roomTypes.forEach(rt=>{
      const mine=rooms.filter(r=>rt.rooms.includes(r));
      if(mine.length)grouped.push({name:rt.name,color:rt.color,n:mine.length,rooms:mine});
    });
    roomsEl.style.display='block';
    roomsEl.innerHTML=`<div style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#5a6a6a;margin-bottom:8px">Suggested Room Block · ${rooms.length} rooms</div>`
      +grouped.map(g=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #eee;font-size:13px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${g.color};flex-shrink:0"></span>
        <span style="flex:1;color:#2d3a3a">${g.name}</span>
        <span style="font-weight:700;color:#2d6a6a">${g.n} room${g.n>1?'s':''}</span>
      </div>`).join('')
      +`<div style="margin-top:8px;font-size:11px;color:#9a8f82">Admin can adjust this block at any time before the retreat.</div>`;
  }
  // Add-on summary
  const addonsEl=document.getElementById('drm-addons');
  if(addonsEl){
    const pkgItems=calcPkgItems(bk);
    if(!pkgItems.length){addonsEl.style.display='none';return;}
    addonsEl.style.display='block';
    addonsEl.innerHTML=`<div style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#5a6a6a;margin-bottom:8px">Add-ons Confirmed</div>`
      +pkgItems.map(a=>`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px">
        <span style="color:#2d6a6a;font-weight:700">✓</span>
        <span style="flex:1;color:#2d3a3a">${a.name}</span>
        <span style="color:#5a6a6a">$${a.price}/person</span>
      </div>`).join('');
  }
}

function tcRenderAddonGrid(selectedIds){
  const grid=document.getElementById('tcAddonGrid');if(!grid)return;
  grid.innerHTML=ADD_ONS.filter(ao=>ao.price>0).map(ao=>{
    const on=(selectedIds||[]).includes(ao.id);
    const priceHtml=ao.regularPrice
      ? `<span style="font-size:11px;color:#dc2626;text-decoration:line-through;margin-right:4px">$${ao.regularPrice}</span><span style="font-size:12px;font-weight:700;color:#059669">$${ao.price}</span>`
      : `<span style="font-size:12px;font-weight:700;color:var(--dark)">$${ao.price}</span>`;
    return`<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;border:1.5px solid ${on?'var(--teal)':'var(--border)'};border-radius:8px;cursor:pointer;background:${on?'#f0f9f9':'#fff'};transition:all .12s">
      <input type="checkbox" data-id="${ao.id}" ${on?'checked':''} style="accent-color:var(--teal);width:14px;height:14px;flex-shrink:0" onchange="tcAddonChange(this)">
      <span style="flex:1;font-size:12px;font-weight:600;color:var(--dark)">${ao.name}</span>
      <span style="flex-shrink:0">${priceHtml}</span>
    </label>`;
  }).join('');
  tcUpdateAddonSummary();
}
function tcAddonChange(chk){
  // Uncheck "not interested" if an add-on was selected
  if(chk.checked){const ni=document.getElementById('tcNoAddOns');if(ni)ni.checked=false;}
  const lbl=chk.closest('label');
  if(lbl){lbl.style.borderColor=chk.checked?'var(--teal)':'var(--border)';lbl.style.background=chk.checked?'#f0f9f9':'#fff';}
  tcUpdateAddonSummary();
}
function tcToggleNoAddOns(chk){
  if(chk.checked){
    // Uncheck all add-ons
    document.querySelectorAll('#tcAddonGrid input[type=checkbox]').forEach(cb=>{
      cb.checked=false;
      const lbl=cb.closest('label');
      if(lbl){lbl.style.borderColor='var(--border)';lbl.style.background='#fff';}
    });
    tcUpdateAddonSummary();
  }
}
function tcUpdateAddonSummary(){
  const box=document.getElementById('tcAddonSummary');if(!box)return;
  const checked=[...document.querySelectorAll('#tcAddonGrid input[type=checkbox]:checked')];
  const sel=checked.map(cb=>ADD_ONS.find(a=>a.id===cb.dataset.id)).filter(Boolean);
  if(!sel.length){box.style.display='none';return;}
  const total=sel.reduce((s,a)=>s+a.price,0);
  const disc=sel.length>=2?+(total*PKG_DISCOUNT).toFixed(2):0;
  box.style.display='block';
  box.innerHTML=`<b>${sel.length} experience${sel.length>1?'s':''} selected</b> — $${(total-disc).toFixed(0)}/person${disc>0?' <span style="color:#059669">(10% pkg discount)</span>':''}`;
}
// Legacy stubs kept to avoid reference errors from old state checks
function tcShowAddOnStep(){}
function teacherConfirmAddOns(){}
function teacherSkipAddOns(){}

