// ===== payments.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== PAYMENT RECORDING =====
let _payBkId=null;
let _payEditId=null;
const DEF_BANK_DETAILS=`Bank Name:         Wells Fargo
Account Name:      Amansala LLC
Account Number:    1639211174
Routing (RTN/ABA): 121000248

If sending from outside the US:
SWIFT/BIC:         WFBIUS6S
Account Address:   22219 N 39th Street, Phoenix AZ 85050, USA
Bank Address:      21040 N Tatum Blvd, Phoenix AZ 85050, United States

Reference note: Please include retreat leader name and arrival date
(e.g. "Smith Retreat - Jan 15 2027")`;
const _storedBank=localStorage.getItem('amansala_bank_details')||'';
let bankDetails=(_storedBank.trim()&&!_storedBank.includes('Account Number:\nRouting'))?_storedBank:DEF_BANK_DETAILS;

function saveBankDetails(){
  bankDetails=document.getElementById('bankEdit').value;
  localStorage.setItem('amansala_bank_details',bankDetails);
  document.getElementById('bankDisplay').textContent=bankDetails;
}
function toggleBankEdit(){
  const d=document.getElementById('bankDisplay');
  const e=document.getElementById('bankEdit');
  if(e.style.display==='none'){
    e.value=bankDetails;e.style.display='block';d.style.display='none';e.focus();
  }else{saveBankDetails();e.style.display='none';d.style.display='block';}
}
function getNextInvoiceNumber(){
  const year=new Date().getFullYear();
  const key='amansala_invoice_counter_'+year;
  const n=(parseInt(localStorage.getItem(key)||'0',10))+1;
  localStorage.setItem(key,String(n));
  return 'AMN-'+year+'-'+String(n).padStart(4,'0');
}

function renderTeacherInvoice(bkId){
  const wrap=document.getElementById('teacherInvoiceContent');if(!wrap)return;
  const bk=AppData.bookings.find(b=>b.id===bkId);
  if(!bk){wrap.innerHTML='';return;}
  // Auto-generate invoice for already-signed contracts that predate this feature
  if(!bk.depositInvoice&&(bk.contractSignedAt||bk.status==='contract_signed')){
    bk.depositInvoice={number:getNextInvoiceNumber(),issuedAt:bk.contractSignedAt,dueAt:new Date(new Date(bk.contractSignedAt).getTime()+7*86400000).toISOString(),amount:2500,status:'pending'};
    saveAll();
  }
  if(!bk.depositInvoice){
    wrap.innerHTML=`<div style="text-align:center;padding:60px 20px;color:#8a7e74;font-size:13px">
      <div style="font-size:40px;margin-bottom:16px">🧾</div>
      <div style="font-weight:600;margin-bottom:6px">No invoice yet</div>
      <div>Your deposit invoice will appear here once your contract is signed.</div>
    </div>`;
    return;
  }
  const inv=bk.depositInvoice;
  const isPaid=inv.status==='paid';
  const issuedDate=new Date(inv.issuedAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const dueDate=new Date(inv.dueAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const paidDate=inv.paidAt?new Date(inv.paidAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}):null;
  const retreatDates=fmtDate(bk.startDate)+' – '+fmtDate(bk.endDate);
  // Payment instructions — use saved bank details, and always show Zelle prominently
  const bankLines=(bankDetails||'').trim().split('\n').filter(l=>l.trim()&&!l.trim().startsWith('Reference'));
  const bankHTML=bankLines.map(l=>`<div style="font-size:12px;color:#4b5563;line-height:1.8">${l.trim()}</div>`).join('');
  wrap.innerHTML=`
  <div style="background:#fff;border:1.5px solid #c8dada;border-radius:18px;overflow:hidden;box-shadow:0 6px 32px rgba(45,106,106,.10)">

    <!-- Invoice Header — teal brand -->
    <div style="background:linear-gradient(135deg,#2d6a6a 0%,#3d8080 100%);padding:30px 36px 26px;color:#fff;position:relative">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px">
        <div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:600;letter-spacing:.4px;line-height:1">Amansala</div>
          <div style="font-size:10px;letter-spacing:2.8px;text-transform:uppercase;color:rgba(255,255,255,.55);margin-top:5px">Eco-Chic Resort &amp; Retreat · Tulum, Mexico</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:2.5px;color:rgba(255,255,255,.55)">Invoice</div>
          <div style="font-size:20px;font-weight:700;font-family:monospace;color:#fff;margin-top:3px;letter-spacing:1px">${inv.number}</div>
          ${isPaid
            ? '<div style="display:inline-block;margin-top:10px;background:rgba(255,255,255,.18);border:1.5px solid rgba(255,255,255,.4);color:#fff;font-size:10.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:5px 16px;border-radius:99px">&#10003; Paid</div>'
            : '<div style="display:inline-block;margin-top:10px;background:rgba(255,255,255,.15);border:1.5px solid rgba(255,255,255,.35);color:#fff;font-size:10.5px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:5px 16px;border-radius:99px">Awaiting Payment</div>'}
        </div>
      </div>
    </div>

    <!-- Thin teal accent stripe -->
    <div style="height:3px;background:linear-gradient(90deg,#5fa8a8,#e0d8cc)"></div>

    <!-- From / To / Dates row -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1.5px solid #e8e0d4;background:#faf7f3">
      <div style="padding:20px 26px;border-right:1px solid #e8e0d4">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:2px;color:#9a8f82;font-weight:700;margin-bottom:7px">From</div>
        <div style="font-size:13px;font-weight:700;color:#2d3a3a">Amansala</div>
        <div style="font-size:11.5px;color:#7a7068;line-height:1.75;margin-top:2px">Eco-Chic Resort &amp; Retreat<br>Tulum, Quintana Roo, Mexico</div>
      </div>
      <div style="padding:20px 26px;border-right:1px solid #e8e0d4">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:2px;color:#9a8f82;font-weight:700;margin-bottom:7px">To</div>
        <div style="font-size:13px;font-weight:700;color:#2d3a3a">${bk.leaderName||bk.retreatName||'Retreat Leader'}</div>
        ${bk.leaderEmail?`<div style="font-size:11.5px;color:#7a7068;margin-top:2px">${bk.leaderEmail}</div>`:''}
        ${bk.leaderPhone?`<div style="font-size:11.5px;color:#7a7068">${bk.leaderPhone}</div>`:''}
      </div>
      <div style="padding:20px 26px">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:2px;color:#9a8f82;font-weight:700;margin-bottom:7px">Dates</div>
        <div style="font-size:11.5px;color:#7a7068;line-height:1.9">
          <div><span style="color:#9a8f82">Issued:</span> ${issuedDate}</div>
          <div><span style="color:${isPaid?'#2d6a6a':'#b04040'};font-weight:600">Due:</span> ${dueDate}</div>
          ${paidDate?`<div style="color:#2d6a6a;font-weight:600;margin-top:2px">&#10003; Paid: ${paidDate}</div>`:''}
        </div>
      </div>
    </div>

    <!-- Line item -->
    <div style="padding:26px 36px;background:#fff">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1.5px solid #e8e0d4">
            <th style="padding:9px 0;text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:2px;color:#9a8f82;font-weight:700">Description</th>
            <th style="padding:9px 0;text-align:center;font-size:9.5px;text-transform:uppercase;letter-spacing:2px;color:#9a8f82;font-weight:700">Qty</th>
            <th style="padding:9px 0;text-align:right;font-size:9.5px;text-transform:uppercase;letter-spacing:2px;color:#9a8f82;font-weight:700">Price</th>
            <th style="padding:9px 0;text-align:right;font-size:9.5px;text-transform:uppercase;letter-spacing:2px;color:#9a8f82;font-weight:700">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:18px 0 14px">
              <div style="font-size:14px;font-weight:600;color:#2d3a3a">Deposit for Retreat</div>
              <div style="font-size:11.5px;color:#9a8f82;margin-top:4px">${retreatDates} · ${bk.row||''}</div>
            </td>
            <td style="padding:18px 0 14px;text-align:center;font-size:13px;color:#7a7068">1</td>
            <td style="padding:18px 0 14px;text-align:right;font-size:13px;color:#7a7068">$2,500.00</td>
            <td style="padding:18px 0 14px;text-align:right;font-size:16px;font-weight:700;color:#2d3a3a">$2,500.00</td>
          </tr>
        </tbody>
      </table>
      <!-- Totals -->
      <div style="display:flex;flex-direction:column;align-items:flex-end;margin-top:6px;gap:5px;border-top:1px solid #ece7df;padding-top:14px">
        <div style="display:flex;gap:48px;font-size:12px;color:#9a8f82"><span>Subtotal</span><span style="min-width:90px;text-align:right">$2,500.00</span></div>
        <div style="display:flex;gap:48px;font-size:12px;color:#9a8f82"><span>Tax</span><span style="min-width:90px;text-align:right">$0.00</span></div>
        <div style="display:flex;gap:48px;font-size:17px;font-weight:700;color:#2d6a6a;border-top:2px solid #2d6a6a;padding-top:10px;margin-top:4px"><span>Total</span><span style="min-width:90px;text-align:right">$2,500.00</span></div>
      </div>
    </div>

    <!-- Payment Instructions or Paid Banner -->
    ${!isPaid?`
    <div style="margin:0 36px 30px;background:#f0f9f9;border:1.5px solid #a8cfcf;border-radius:14px;padding:22px 26px">
      <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:2px;color:#2d6a6a;font-weight:700;margin-bottom:16px">How to Pay Your Deposit</div>
      <div style="display:grid;grid-template-columns:1fr;gap:24px">
        <div style="background:#fff;border:1px solid #c8dada;border-radius:10px;padding:16px 18px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;font-weight:700;margin-bottom:8px">Wire / Bank Transfer</div>
          ${bankHTML||'<div style="font-size:11.5px;color:#7a7068">Contact us for wire details</div>'}
        </div>
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid #a8cfcf;font-size:11.5px;color:#7a7068;line-height:1.6">
        For alternative payment methods, please contact us at <strong style="color:#2d6a6a">retreats@amansala.com</strong>
      </div>
      <div style="margin-top:16px;padding:14px 18px;background:#f0f9f9;border:1.5px solid #a8cfcf;border-radius:12px;font-size:12px;color:#3d6060;line-height:1.7;text-align:center">
        Once your transfer is complete, kindly send your <strong>proof of payment</strong> to us at
        <a href="mailto:retreats@amansala.com" style="color:#2d6a6a;font-weight:700;text-decoration:none">retreats@amansala.com</a>
        — this helps us confirm your reservation quickly. Thank you! 🌿
      </div>
    </div>`:`
    <div style="margin:0 36px 30px;display:flex;flex-direction:column;gap:16px">
      <div style="background:#f0f9f9;border:1.5px solid #a8cfcf;border-radius:14px;padding:20px 26px;display:flex;align-items:center;gap:16px">
        <div style="width:44px;height:44px;border-radius:50%;background:#2d6a6a;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <span style="color:#fff;font-size:20px;line-height:1">&#10003;</span>
        </div>
        <div>
          <div style="font-size:14px;font-weight:700;color:#2d6a6a">Deposit Received — Thank You!</div>
          <div style="font-size:12px;color:#5a8080;margin-top:3px;line-height:1.6">Your deposit has been recorded. We look forward to welcoming you and your guests to Amansala.</div>
        </div>
      </div>
      ${bankHTML?`<div style="background:#fff;border:1.5px solid #c8dada;border-radius:12px;padding:18px 22px">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:2px;color:#2d6a6a;font-weight:700;margin-bottom:10px">Wire / Bank Transfer Reference</div>
        ${bankHTML}
      </div>`:''}
    </div>`}

    <!-- Footer -->
    <div style="border-top:1.5px solid #e8e0d4;padding:14px 36px;background:#faf7f3;text-align:center;font-size:11px;color:#9a8f82;letter-spacing:.3px">
      retreats@amansala.com &nbsp;·&nbsp; Amansala Eco-Chic Resort &amp; Retreat &nbsp;·&nbsp; Tulum, Mexico
    </div>
  </div>`;
}

function daysUntil(dateStr){
  const today=new Date();today.setHours(0,0,0,0);
  const target=new Date(dateStr+'T00:00:00');
  return Math.round((target-today)/86400000);
}
function finalPaymentDue(bk){
  // 6 weeks (42 days) before retreat start
  const d=new Date(bk.startDate+'T00:00:00');
  d.setDate(d.getDate()-42);
  return d;
}

function renderTeacherFinalPayment(bk){
  const wrap=document.getElementById('teacherFinalPaymentContent');if(!wrap)return;
  const daysToRetreat=daysUntil(bk.startDate);
  const dueDate=finalPaymentDue(bk);
  const dueDateStr=dueDate.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const daysToPayment=Math.round((dueDate-new Date().setHours(0,0,0,0))/86400000);
  // Calculate balance
  const {charged,totalPaid,balance}=calcBkBalance(bk);
  const isPaid=charged>0&&balance<=0;

  // State A: >7 weeks out — show a gentle upcoming notice
  if(daysToRetreat>49){
    wrap.innerHTML=`<div style="background:#faf7f3;border:1.5px solid #c8dada;border-radius:14px;padding:20px 24px;text-align:center;color:#7a7068;margin-top:20px">
      <div style="font-size:13px;font-weight:600;color:#2d3a3a;margin-bottom:6px">Final Balance — Due 6 Weeks Before Your Retreat</div>
      <div style="font-size:12px;line-height:1.7">Your final balance invoice will appear here approximately <strong>7 weeks before your retreat</strong> (around <strong>${new Date(new Date(bk.startDate+'T00:00:00').getTime()-49*86400000).toLocaleDateString('en-US',{month:'long',day:'numeric'})}</strong>). No action needed yet.</div>
    </div>`;
    return;
  }

  // State B: 7 weeks out (49–43 days) — 1-week warning
  if(daysToRetreat>42&&daysToRetreat<=49){
    wrap.innerHTML=`<div style="background:#fffbeb;border:2px solid #fcd34d;border-radius:14px;padding:22px 26px;margin-top:20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div style="width:38px;height:38px;border-radius:50%;background:#fef3c7;border:2px solid #fcd34d;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px">&#9888;</div>
        <div>
          <div style="font-size:14px;font-weight:700;color:#92400e">Final Balance Due in 1 Week</div>
          <div style="font-size:12px;color:#b45309;margin-top:2px">Due date: <strong>${dueDateStr}</strong></div>
        </div>
      </div>
      <p style="font-size:13px;color:#78350f;line-height:1.75;margin:0">Your final retreat balance of <strong style="color:#92400e">${fmt$(balance)}</strong> will be due on <strong>${dueDateStr}</strong>. Please visit the <strong>My Finances</strong> tab and follow the payment instructions to ensure your retreat dates are secured.</p>
    </div>`;
    return;
  }

  // State C: ≤6 weeks — full final invoice
  wrap.innerHTML=`
  <div style="margin-top:24px;background:#fff;border:1.5px solid ${isPaid?'#a8cfcf':'#fcd34d'};border-radius:18px;overflow:hidden;box-shadow:0 4px 20px rgba(45,106,106,.08)">
    <div style="background:${isPaid?'linear-gradient(135deg,#2d6a6a,#3d8080)':'linear-gradient(135deg,#92400e,#b45309)'};padding:22px 30px;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,.6)">Final Balance Invoice</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;margin-top:2px">${bk.leaderName||bk.retreatName}</div>
      </div>
      <div style="text-align:right">
        ${isPaid
          ? '<div style="background:rgba(255,255,255,.2);border:1.5px solid rgba(255,255,255,.4);border-radius:99px;padding:5px 16px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">&#10003; Paid in Full</div>'
          : `<div style="font-size:24px;font-weight:700">${fmt$(balance)}</div><div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:2px">Due: ${dueDateStr}</div>`}
      </div>
    </div>
    ${!isPaid?`
    <div style="padding:20px 30px 24px;background:#fff">
      <div style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px;padding:14px 18px;margin-bottom:18px;font-size:12.5px;color:#78350f;line-height:1.7">
        <strong>Final payment is due ${dueDateStr}.</strong> Remember — you can continue to sell rooms. Just email us to check availability before confirming any new guests.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px">
        <div style="background:#faf7f3;border:1px solid #e8e0d4;border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#9a8f82;font-weight:700;margin-bottom:4px">Total Charged</div>
          <div style="font-size:18px;font-weight:700;color:#2d3a3a">${fmt$(charged)}</div>
        </div>
        <div style="background:#faf7f3;border:1px solid #e8e0d4;border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#9a8f82;font-weight:700;margin-bottom:4px">Total Paid</div>
          <div style="font-size:18px;font-weight:700;color:#2d6a6a">${fmt$(totalPaid)}</div>
        </div>
        <div style="background:#fef3c7;border:1.5px solid #fcd34d;border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;font-weight:700;margin-bottom:4px">Balance Due</div>
          <div style="font-size:18px;font-weight:700;color:#92400e">${fmt$(balance)}</div>
        </div>
      </div>
      <div style="background:#f0f9f9;border:1.5px solid #a8cfcf;border-radius:12px;padding:18px 22px">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:2px;color:#2d6a6a;font-weight:700;margin-bottom:12px">Wire / Bank Transfer</div>
        ${(bankDetails||'').trim().split('\n').filter(l=>l.trim()&&!l.trim().startsWith('Reference')).map(l=>`<div style="font-size:12px;color:#5a8080;line-height:1.9">${l.trim()}</div>`).join('')||'<div style="font-size:12px;color:#7a7068">Contact retreats@amansala.com for wire details</div>'}
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid #a8cfcf;font-size:11.5px;color:#5a8080">Questions? <strong style="color:#2d6a6a">retreats@amansala.com</strong></div>
      </div>
    </div>`:`
    <div style="padding:20px 30px;display:flex;align-items:center;gap:14px">
      <div style="width:42px;height:42px;border-radius:50%;background:#2d6a6a;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff;font-size:20px">&#10003;</div>
      <div><div style="font-size:14px;font-weight:700;color:#2d6a6a">Balance Paid in Full — Thank You!</div><div style="font-size:12px;color:#5a8080;margin-top:3px">All payments have been received. We look forward to welcoming you and your guests.</div></div>
    </div>`}
  </div>`;

  // Also update the room list banner
  renderFinalPaymentBanner(bk);
}

function renderFinalPaymentBanner(bk){
  const banner=document.getElementById('finalPaymentBanner');if(!banner)return;
  const daysToRetreat=daysUntil(bk.startDate);
  const {balance}=calcBkBalance(bk);
  if(daysToRetreat<=42&&balance>0){
    const dueDate=finalPaymentDue(bk);
    const dueDateStr=dueDate.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
    document.getElementById('fpBannerTitle').textContent=`Final Payment Due ${dueDateStr} — ${fmt$(balance)} outstanding`;
    document.getElementById('fpBannerMsg').textContent='Remember — you can continue to sell rooms. Just email us to check availability before confirming any new guests.';
    banner.style.display='block';
  } else {
    banner.style.display='none';
  }
}

function quickDeposit(method){
  document.getElementById('pay-amount').value='2500';
  document.getElementById('pay-method').value=method;
  document.getElementById('pay-note').value='Deposit';
  document.getElementById('pay-amount').style.borderColor='#2d6a6a';
  setTimeout(()=>document.getElementById('pay-amount').style.borderColor='',1200);
}
function payReminderFromModal(){
  const bkId=document.getElementById('paymentModal').dataset.bkId;
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  sendPaymentReminder(bk);
}
// Room Only double/triple bookings get asked once, before the first
// payment, whether each guest should have their own folio — Darlene's
// Phase 1 spec. Only fires for pax 2/3 room_only bookings that haven't
// been asked yet; every other booking type/pax count is unaffected.
function fsShouldAsk(bk){
  return bk.bookingType==='room_only'&&(bk.pax===2||bk.pax===3)&&!bk.folioSplit;
}
let _fsPendingBkId=null,_fsPendingQuickMethod=null;
function openPaymentModal(bkId,quickMethod){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  if(fsShouldAsk(bk)){
    _fsPendingBkId=bkId;_fsPendingQuickMethod=quickMethod||null;
    openModal('folioSplitAskModal');
    return;
  }
  _openPaymentModalReal(bkId,quickMethod);
}
function fsPushHistory(bk,event,detail){
  if(!bk.folioSplit)bk.folioSplit={history:[]};
  if(!bk.folioSplit.history)bk.folioSplit.history=[];
  bk.folioSplit.history.push({at:new Date().toISOString(),by:getCurrentSession()?.name||'Staff',event,detail:detail||null});
}
function fsChooseNo(){
  const bk=AppData.bookings.find(b=>b.id===_fsPendingBkId);if(!bk)return;
  bk.folioSplit={mode:'combined',askedAt:new Date().toISOString(),askedBy:getCurrentSession()?.name||'Staff',history:[]};
  fsPushHistory(bk,'kept_combined',null);
  saveAll();
  closeModal('folioSplitAskModal');
  logActivity('Folio kept combined',bk.leaderName||bk.retreatName,bk.id);
  _openPaymentModalReal(_fsPendingBkId,_fsPendingQuickMethod);
}
function fsSkip(){
  const bk=AppData.bookings.find(b=>b.id===_fsPendingBkId);
  closeModal('folioSplitAskModal');
  if(bk)_openPaymentModalReal(_fsPendingBkId,_fsPendingQuickMethod);
}
function fsChooseYes(){
  const bk=AppData.bookings.find(b=>b.id===_fsPendingBkId);if(!bk)return;
  closeModal('folioSplitAskModal');
  const guestCount=bk.pax; // 2 or 3, guaranteed by fsShouldAsk
  const primary=bk.leaderName||'Guest 1';
  let html=`<div style="font-size:12.5px;color:var(--muted);margin-bottom:14px">Guest 1 is <b>${escHtml(primary)}</b> (the reservation holder). Enter the full name${guestCount>2?'s':''} of the other guest${guestCount>2?'s':''} sharing this room.</div>`;
  for(let i=2;i<=guestCount;i++){
    html+=`<div class="fg"><label>Guest ${i}'s Full Name *</label><input type="text" id="fsGuestName${i}" placeholder="Full name"></div>`;
  }
  document.getElementById('folioSplitNamesBody').innerHTML=html;
  openModal('folioSplitNamesModal');
}
function fsSaveNames(){
  const bk=AppData.bookings.find(b=>b.id===_fsPendingBkId);if(!bk)return;
  const guestCount=bk.pax;
  const names=[bk.leaderName||'Guest 1'];
  for(let i=2;i<=guestCount;i++){
    const val=document.getElementById('fsGuestName'+i).value.trim();
    if(!val){alert(`Please enter Guest ${i}'s full name.`);return;}
    names.push(val);
  }
  const equalPct=+(100/names.length).toFixed(2);
  const splitPct=names.map((_,i)=>i===names.length-1?+(100-equalPct*(names.length-1)).toFixed(2):equalPct);
  bk.folioSplit={mode:'separate',guestNames:names,splitPct,askedAt:new Date().toISOString(),askedBy:getCurrentSession()?.name||'Staff',history:[]};
  fsPushHistory(bk,'separate_folios_created',`Guests: ${names.join(', ')} — split ${splitPct.map(p=>p+'%').join(' / ')}`);
  saveAll();
  closeModal('folioSplitNamesModal');
  logActivity('Separate folios created',`${bk.leaderName||bk.retreatName} — ${names.join(', ')}`,bk.id);
  showToast('Separate folios requested — each guest pays individually.');
  _openPaymentModalReal(_fsPendingBkId,_fsPendingQuickMethod);
}
function _openPaymentModalReal(bkId,quickMethod){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  document.getElementById('paymentModal').dataset.bkId=bkId;
  _payBkId=bkId;
  _payEditId=null;
  const lbl=document.getElementById('paySaveBtnLabel');if(lbl)lbl.textContent='Save Payment';
  const ceb=document.getElementById('payCancelEditBtn');if(ceb)ceb.style.display='none';
  document.getElementById('payModalTitle').textContent='Record Payment — '+(bk.leaderName||bk.retreatName);
  document.getElementById('payModalSub').textContent=fmtDate(bk.startDate)+' – '+fmtDate(bk.endDate)+' · '+bk.row;
  document.getElementById('pay-date').value=fmtISO(new Date());
  document.getElementById('pay-ref').value='';
  if(quickMethod){
    document.getElementById('pay-amount').value='2500';
    document.getElementById('pay-note').value='Deposit';
    document.getElementById('pay-method').value=quickMethod;
    setTimeout(()=>{document.getElementById('pay-amount').style.borderColor='#2d6a6a';setTimeout(()=>document.getElementById('pay-amount').style.borderColor='',1200);},80);
  } else {
    document.getElementById('pay-amount').value='';
    document.getElementById('pay-note').value='';
    document.getElementById('pay-method').value='wire';
  }
  document.getElementById('bankDisplay').textContent=bankDetails;
  document.getElementById('bankEdit').style.display='none';
  document.getElementById('bankDisplay').style.display='block';
  const guestRow=document.getElementById('payGuestAttribRow');
  if(bk.folioSplit?.mode==='separate'){
    guestRow.style.display='block';
    document.getElementById('pay-guest').innerHTML=bk.folioSplit.guestNames.map(n=>`<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  }else{
    guestRow.style.display='none';
  }
  renderPayBalance(bk);renderPayHistory(bk);
  openModal('paymentModal');
}
function _calcRoomRevenue(bk){
  // Exact mirror of renderEstQuote grand total — single source of truth
  const nights=getNights(bk);
  const blockedSet=new Set(bk.blockedRooms||[]);
  const bkRegs=getRegsForBk(bk.id);
  const regByRoom={};
  bkRegs.forEach(r=>{if(blockedSet.has(r.room))regByRoom[r.room]=r;});
  const tipPer=getTip(bk),pkgTaxRate=getBkTaxRate(bk),roomTaxRate=pkgTaxRate===0?0:0.16;
  const addOnItems=calcPkgItems(bk);
  let total=0;
  Array.from(blockedSet).forEach(room=>{
    const rt=AppData.roomTypes.find(t=>(t.rooms||[]).includes(room));
    if(!rt)return;
    const reg=regByRoom[room];
    const gc=reg?new Set((reg.guests||[]).filter(g=>g.name).map(g=>g.name.trim())).size:0;
    if(!gc)return;
    const _eCI=reg.checkIn||bk.startDate;
    const _eNightsRaw=(reg.checkIn&&reg.checkOut)?Math.max(1,Math.round((pd(reg.checkOut)-pd(reg.checkIn))/DAY_MS)):nights;
    // custom_nights_override/custom_tip_nights_override/custom_tip_rate_override: an admin-set
    // billed-nights count for this registration, independent of the raw check-in/check-out span.
    const _eNights=reg.customNightsOverride!=null?Number(reg.customNightsOverride):_eNightsRaw;
    const _eTipNights=reg.customTipNightsOverride!=null?Number(reg.customTipNightsOverride):_eNights;
    const _eTipRate=reg.customTipRateOverride!=null?Number(reg.customTipRateOverride):tipPer;
    const _isBd1Extra=rt.id==='bd1'&&reg.customRateOverride==null&&(gc>=2||_getSharedBeds(room).some(s=>blockedSet.has(s)&&(regByRoom[s]?.guests||[]).filter(g=>g.name).length>=2));
    const rate=reg.customRateOverride!=null?reg.customRateOverride:(_isBd1Extra?(isLowSeason(_eCI,_eNights)?BD1_EXTRA_RATE_LOW:BD1_EXTRA_RATE_HIGH):getRoomRate(rt,gc,_eCI,_eNights));
    const base=+(rate*gc*_eNights).toFixed(2);
    const pkgCost=reg.customPkgPrice!=null?reg.customPkgPrice:(addOnItems.length?+(calcPkgCost(bk,gc)).toFixed(2):0);
    const roomTax=+(base*roomTaxRate).toFixed(2);
    const pTax=+(pkgCost*pkgTaxRate).toFixed(2);
    const tip=+(_eTipRate*gc*_eTipNights).toFixed(2);
    total+=+(base+pkgCost+roomTax+pTax+tip).toFixed(2);
  });
  const sr=bk.scheduleRequest;
  if(sr?.bowlRental&&sr.bowlQty&&sr.bowlDays){const slots=(sr.bowlDays||[]).reduce((n,e)=>n+(e.am?1:0)+(e.pm?1:0),0);total+=sr.bowlQty*slots*15;}
  if(sr?.setupService&&sr.setupDays?.length){const sessions=(sr.setupDays||[]).reduce((n,e)=>n+(e.am?1:0)+(e.pm?1:0),0);total+=sessions*25;}
  return +(total-(bk.eqDiscountAmt||0)).toFixed(2);
}
function calcBkBalance(bk){
  const roomRevenue=_calcRoomRevenue(bk);
  // Individual guest charges (spa/transport/etc., posted per-registration via
  // reg.charges) roll up onto the retreat leader's master bill/balance here —
  // students' incidentals are the group's responsibility, not billed separately,
  // unless a guest is on their own booking (in which case getRegsForBk already
  // scopes to just their reg).
  const incidentalCharges=getRegsForBk(bk.id).reduce((s,reg)=>s+((reg.charges||[]).reduce((s2,c)=>s2+(c.amount||0),0)),0);
  const charged=+(roomRevenue+incidentalCharges).toFixed(2);
  const totalPaid=(bk.payments||[]).reduce((s,p)=>s+(p.amount||0),0);
  return{charged,totalPaid,balance:+(charged-totalPaid).toFixed(2),roomRevenue,incidentalCharges};
}
function renderPayBalance(bk){
  const {charged,totalPaid,balance,roomRevenue,incidentalCharges}=calcBkBalance(bk);
  const clr=balance<=0?'#16a34a':balance>1000?'#dc2626':'#d97706';
  const wrap=document.getElementById('payBalanceSummary');
  wrap.style.display='block';
  const breakdownHtml=incidentalCharges>0?`<div style="text-align:center;padding:6px 10px;font-size:10.5px;color:var(--muted);border-top:1px solid var(--border)">Room/Package ${fmt$(roomRevenue)} + Guest Charges ${fmt$(incidentalCharges)}</div>`:'';
  wrap.innerHTML=`<div style="display:flex">
    <div style="flex:1;text-align:center;padding:14px 10px;border-right:1px solid var(--border)">
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px;font-weight:600">Total Charged</div>
      <div style="font-size:20px;font-weight:700;color:var(--dark)">${fmt$(charged)}</div>
    </div>
    <div style="flex:1;text-align:center;padding:14px 10px;border-right:1px solid var(--border)">
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px;font-weight:600">Total Paid</div>
      <div style="font-size:20px;font-weight:700;color:#16a34a">${fmt$(totalPaid)}</div>
    </div>
    <div style="flex:1;text-align:center;padding:14px 10px;background:${balance<=0?'#f0fdf4':balance>1000?'#fef2f2':'#fffbeb'}">
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px;font-weight:600">Balance Due</div>
      <div style="font-size:20px;font-weight:700;color:${clr}">${balance<=0?'Paid in Full':fmt$(balance)}</div>
    </div>
  </div>${breakdownHtml}`;
}
function renderPayHistory(bk){
  const payments=(bk.payments||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const el=document.getElementById('payHistoryList');
  if(!payments.length){el.innerHTML='<div style="font-size:13px;color:var(--muted);text-align:center;padding:20px;border:1px dashed var(--border);border-radius:8px">No payments recorded yet for this booking.</div>';return;}
  const methodLabel={wire:'Wire Transfer',cheque:'Cheque',zelle:'Zelle',venmo:'Venmo',card:'Credit Card',check:'Cheque',cash:'Cash',other:'Other'};
  el.innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:12.5px">
    <tr style="background:#f8fafc"><th style="padding:7px 10px;text-align:left;color:var(--muted);font-size:11px;font-weight:700;border-bottom:2px solid var(--border)">Date</th><th style="padding:7px 10px;text-align:left;color:var(--muted);font-size:11px;font-weight:700;border-bottom:2px solid var(--border)">Amount</th><th style="padding:7px 10px;text-align:left;color:var(--muted);font-size:11px;font-weight:700;border-bottom:2px solid var(--border)">Method</th><th style="padding:7px 10px;text-align:left;color:var(--muted);font-size:11px;font-weight:700;border-bottom:2px solid var(--border)">Reference #</th><th style="padding:7px 10px;text-align:left;color:var(--muted);font-size:11px;font-weight:700;border-bottom:2px solid var(--border)">Note</th><th style="border-bottom:2px solid var(--border)"></th></tr>
    ${payments.map(p=>`<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:9px 10px">${fmtDate(p.date)}</td>
      <td style="padding:9px 10px;font-weight:700;color:#16a34a">${fmt$(p.amount)}</td>
      <td style="padding:9px 10px;color:var(--muted)">${methodLabel[p.method]||p.method}</td>
      <td style="padding:9px 10px;font-family:monospace;font-size:11.5px">${p.ref||'—'}</td>
      <td style="padding:9px 10px;color:var(--muted)">${p.note||'—'}</td>
      <td style="padding:9px 10px;text-align:right;white-space:nowrap"><button class="btn btn-secondary btn-sm" onclick="editPayment('${bk.id}','${p.id}')" style="padding:3px 8px;font-size:11px;margin-right:4px">Edit</button><button class="btn btn-danger btn-sm" onclick="deletePayment('${bk.id}','${p.id}')" style="padding:3px 8px;font-size:11px">Remove</button></td>
    </tr>`).join('')}
    <tr style="background:#f8fafc;font-weight:700">
      <td style="padding:9px 10px;font-size:12px">Total</td>
      <td style="padding:9px 10px;color:#16a34a">${fmt$(payments.reduce((s,p)=>s+p.amount,0))}</td>
      <td colspan="4"></td>
    </tr>
  </table>`;
}
function savePayment(){
  const bk=AppData.bookings.find(b=>b.id===_payBkId);if(!bk)return;
  const amount=Math.round(parseFloat(document.getElementById('pay-amount').value)*100)/100;
  const date=document.getElementById('pay-date').value;
  if(!amount||amount<=0){alert('Enter a valid payment amount.');return;}
  if(!date){alert('Select the date the payment was received.');return;}
  if(!bk.payments)bk.payments=[];
  const method=document.getElementById('pay-method').value;
  const ref=document.getElementById('pay-ref').value.trim();
  const note=document.getElementById('pay-note').value.trim();
  const guestName=bk.folioSplit?.mode==='separate'?(document.getElementById('pay-guest').value||null):null;
  if(_payEditId){
    // Edit existing payment
    const p=bk.payments.find(x=>x.id===_payEditId);
    if(p){p.amount=amount;p.date=date;p.method=method;p.ref=ref;p.note=note;p.guestName=guestName;}
    payCancelEdit();
    saveAll();renderPayBalance(bk);renderPayHistory(bk);buildDashboard();venBuild();
    logActivity('Payment updated',`${fmt$(amount)} via ${method} — ${guestName||bk.leaderName||bk.retreatName}`,bk.id);
    showToast('Payment updated ✓');
    return;
  }
  bk.payments.push({id:uid(),amount,date,method,ref,note,guestName,ts:new Date().toISOString()});
  // Advance status to deposit_paid when first payment recorded
  if(['contract_sent','contract_signed','requested'].includes(bk.status)){
    bk.status='deposit_paid';
    bk.statusChangedAt=new Date().toISOString();
    if(bk.depositInvoice&&bk.depositInvoice.status==='pending'){
      bk.depositInvoice.status='paid';
      bk.depositInvoice.paidAt=new Date().toISOString();
    }
    if(typeof pipeAutoAdvance==='function')pipeAutoAdvance(bk,'deposit_received');
    sendTeacherEmail(bk,'deposit_received');
    showToast(fmt$(amount)+' recorded — status updated to Deposit Paid ✓');
  } else {
    showToast(fmt$(amount)+' payment recorded ✓');
  }
  document.getElementById('pay-amount').value='';
  document.getElementById('pay-ref').value='';
  document.getElementById('pay-note').value='';
  saveAll();renderPayBalance(bk);renderPayHistory(bk);buildDashboard();venBuild();
  logActivity('Payment recorded',`${fmt$(amount)} via ${method} — ${guestName||bk.leaderName||bk.retreatName}`,bk.id);
}

function editPayment(bkId,payId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const p=bk.payments.find(x=>x.id===payId);if(!p)return;
  _payEditId=payId;
  document.getElementById('pay-amount').value=p.amount;
  document.getElementById('pay-date').value=p.date;
  document.getElementById('pay-method').value=p.method||'wire';
  document.getElementById('pay-ref').value=p.ref||'';
  document.getElementById('pay-note').value=p.note||'';
  const lbl=document.getElementById('paySaveBtnLabel');if(lbl)lbl.textContent='Update Payment';
  const ceb=document.getElementById('payCancelEditBtn');if(ceb)ceb.style.display='inline-flex';
  // Highlight the form section
  const amtEl=document.getElementById('pay-amount');
  if(amtEl){amtEl.style.borderColor='#2d6a6a';amtEl.focus();setTimeout(()=>amtEl.style.borderColor='',2000);}
  showToast('Edit the fields above and click Update Payment.');
}

function payCancelEdit(){
  _payEditId=null;
  document.getElementById('pay-amount').value='';
  document.getElementById('pay-date').value=fmtISO(new Date());
  document.getElementById('pay-ref').value='';
  document.getElementById('pay-note').value='';
  document.getElementById('pay-method').value='wire';
  const lbl=document.getElementById('paySaveBtnLabel');if(lbl)lbl.textContent='Save Payment';
  const ceb=document.getElementById('payCancelEditBtn');if(ceb)ceb.style.display='none';
}
function deletePayment(bkId,payId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  if(!confirm('Remove this payment record?'))return;
  bk.payments=(bk.payments||[]).filter(p=>p.id!==payId);
  saveAll();renderPayBalance(bk);renderPayHistory(bk);buildDashboard();
  logActivity('Payment removed',`From ${bk.leaderName||bk.retreatName}`,bk.id);
  showToast('Payment removed.');
}
function renderVmPaymentWidget(bk){
  const el=document.getElementById('vm-payment-widget');if(!el)return;
  const {charged,totalPaid,balance}=calcBkBalance(bk);
  const payments=(bk.payments||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const clr=balance<=0?'#16a34a':balance>0?'#dc2626':'#374151';
  const methodLabel={wire:'Wire',cheque:'Cheque',zelle:'Zelle',venmo:'Venmo',card:'Credit Card',check:'Cheque',cash:'Cash',other:'Other'};
  el.style.display='block';
  el.innerHTML=`
    <div style="display:flex;background:#f8fafc;border-bottom:1px solid var(--border)">
      <div style="flex:1;text-align:center;padding:10px 8px;border-right:1px solid var(--border)">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:2px">Charged</div>
        <div style="font-size:15px;font-weight:700;color:var(--dark)">${fmt$(charged)}</div>
      </div>
      <div style="flex:1;text-align:center;padding:10px 8px;border-right:1px solid var(--border)">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:2px">Paid</div>
        <div style="font-size:15px;font-weight:700;color:#16a34a">${fmt$(totalPaid)}</div>
      </div>
      <div style="flex:1;text-align:center;padding:10px 8px;background:${balance<=0?'#f0fdf4':balance>500?'#fef2f2':'#fffbeb'}">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:2px">Balance</div>
        <div style="font-size:15px;font-weight:700;color:${clr}">${balance<=0?'✓ Paid':fmt$(balance)}</div>
      </div>
    </div>
    <div style="padding:8px 14px;border-top:1px solid var(--border)">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:6px">Quick $2,500 Deposit</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <button type="button" onclick="closeModal('venModal');openPaymentModal('${bk.id}','wire')" style="flex:1;min-width:70px;padding:7px 6px;border:2px solid #2d6a6a;border-radius:7px;background:#f0fdf4;color:#2d6a6a;font-family:'Jost',sans-serif;font-size:11.5px;font-weight:700;cursor:pointer;transition:all .15s" onmouseover="this.style.background='#2d6a6a';this.style.color='#fff'" onmouseout="this.style.background='#f0fdf4';this.style.color='#2d6a6a'">🏦 Wire</button>
        <button type="button" onclick="closeModal('venModal');openPaymentModal('${bk.id}','cheque')" style="flex:1;min-width:70px;padding:7px 6px;border:2px solid #92400e;border-radius:7px;background:#fffbeb;color:#92400e;font-family:'Jost',sans-serif;font-size:11.5px;font-weight:700;cursor:pointer;transition:all .15s" onmouseover="this.style.background='#92400e';this.style.color='#fff'" onmouseout="this.style.background='#fffbeb';this.style.color='#92400e'">🧾 Cheque</button>
        <button type="button" onclick="closeModal('venModal');openPaymentModal('${bk.id}','zelle')" style="flex:1;min-width:70px;padding:7px 6px;border:2px solid #7c3aed;border-radius:7px;background:#f5f3ff;color:#7c3aed;font-family:'Jost',sans-serif;font-size:11.5px;font-weight:700;cursor:pointer;transition:all .15s" onmouseover="this.style.background='#7c3aed';this.style.color='#fff'" onmouseout="this.style.background='#f5f3ff';this.style.color='#7c3aed'">💵 Zelle</button>
        <button type="button" onclick="closeModal('venModal');openPaymentModal('${bk.id}','venmo')" style="flex:1;min-width:70px;padding:7px 6px;border:2px solid #0077c8;border-radius:7px;background:#eff6ff;color:#0077c8;font-family:'Jost',sans-serif;font-size:11.5px;font-weight:700;cursor:pointer;transition:all .15s" onmouseover="this.style.background='#0077c8';this.style.color='#fff'" onmouseout="this.style.background='#eff6ff';this.style.color='#0077c8'">💵 Venmo</button>
        <button type="button" onclick="closeModal('venModal');openPaymentModal('${bk.id}','card')" style="flex:1;min-width:70px;padding:7px 6px;border:2px solid #e11d48;border-radius:7px;background:#fff1f2;color:#e11d48;font-family:'Jost',sans-serif;font-size:11.5px;font-weight:700;cursor:pointer;transition:all .15s" onmouseover="this.style.background='#e11d48';this.style.color='#fff'" onmouseout="this.style.background='#fff1f2';this.style.color='#e11d48'">💳 Card</button>
      </div>
    </div>
    <div style="padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid var(--border)">
      <div style="font-size:12px;color:var(--muted)">
        ${payments.length===0?'No payments recorded yet.'
          :payments.slice(0,2).map(p=>`<span style="display:inline-flex;align-items:center;gap:5px;margin-right:10px"><span style="font-weight:600;color:#16a34a">${fmt$(p.amount)}</span><span style="color:var(--muted);font-size:11px">${methodLabel[p.method]||p.method} · ${fmtDate(p.date)}</span></span>`).join('')
          +( payments.length>2?`<span style="color:var(--muted);font-size:11px">+${payments.length-2} more</span>`:'' )}
      </div>
      <button class="btn btn-secondary btn-sm" onclick="closeModal('venModal');openPaymentModal('${bk.id}')">View All Payments</button>
    </div>`;
}

// ===== CHARGES LEDGER (internal record-keeping, not a folio/POS system) =====
// A charge with a matching Guest name is stored on that guest's OWN registration
// (reg.charges) — their individual folio. Left blank, it's a room/booking-level
// charge (bk.charges) — e.g. incidentals not tied to one person.
const VMC_CATEGORIES=['Spa','Massage','Excursión','Food & Bev','Boutique','Laundry','Private Session','Transport','Upgrade','Other'];
// Groups the finer-grained charge categories above into the 5 consumption
// buckets Darlene wants on the guest folio quick-view.
const GF_DEPT_MAP={Spa:'Spa',Massage:'Spa','Private Session':'Spa',Excursión:'Tours / Ceremonies','Food & Bev':'F&B',Boutique:'Boutique',Transport:'Transport'};
const GF_DEPT_ORDER=['Transport','F&B','Boutique','Tours / Ceremonies','Spa','Other'];
function gfDeptFor(category){return GF_DEPT_MAP[category]||'Other';}
let _vmChargesAddOpen=false;
let _vmChargeItems=null; // lazy-loaded, cached catalog from Booking Engine → Items — powers the description autosuggest only
async function vmLoadChargeItems(){
  if(_vmChargeItems!==null)return _vmChargeItems;
  try{const{data}=await db.from('app_store').select('value').eq('key','chargeItems').maybeSingle();_vmChargeItems=(data?.value||[]).filter(i=>i.active!==false);}
  catch(e){_vmChargeItems=[];}
  return _vmChargeItems;
}
function vmChargesGuestNames(bk){
  return AppData.regs.filter(r=>r.bookingId===bk.id).flatMap(r=>(r.guests||[]).filter(g=>g.name).map(g=>g.name));
}
function vmFindRegForGuestName(bk,name){
  const key=(name||'').trim().toLowerCase();if(!key)return null;
  const regs=AppData.regs.filter(r=>r.bookingId===bk.id);
  for(const r of regs){if((r.guests||[]).some(g=>(g.name||'').trim().toLowerCase()===key))return r;}
  return null;
}
function renderVmChargesWidget(bk){
  const el=document.getElementById('vm-charges-widget');if(!el)return;
  const bkCharges=(bk.charges||[]).map(c=>({...c,_scope:'booking'}));
  const regCharges=AppData.regs.filter(r=>r.bookingId===bk.id).flatMap(r=>(r.charges||[]).map(c=>({...c,_scope:'guest',_regId:r.id})));
  const charges=[...bkCharges,...regCharges].sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''));
  const total=charges.reduce((s,c)=>s+(c.amount||0),0);
  el.style.display='block';
  if(_vmChargesAddOpen&&_vmChargeItems===null){vmLoadChargeItems().then(()=>renderVmChargesWidget(bk));}
  const guestNames=vmChargesGuestNames(bk);
  const addFormHtml=_vmChargesAddOpen?`
    <div style="padding:10px 14px;background:#f8fafc;border-top:1px solid var(--border)">
      <div class="frow" style="margin:0 0 8px">
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Date</label><input type="date" id="vmc-date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Category</label><select id="vmc-category">${VMC_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>
      </div>
      <div class="frow" style="margin:0 0 8px">
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Description</label><input type="text" id="vmc-desc" placeholder="e.g. Massage 60min" list="vmc-desc-list"><datalist id="vmc-desc-list">${(_vmChargeItems||[]).map(i=>`<option value="${escHtml(i.name)}" data-price="${i.price}">`).join('')}</datalist></div>
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Amount ($)</label><input type="number" id="vmc-amount" min="0" step="0.01" placeholder="0.00"></div>
      </div>
      <div class="frow full" style="margin:0 0 10px">
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Guest <span style="font-weight:400">(optional)</span></label><input type="text" id="vmc-guest" placeholder="Leave empty to charge the room" list="vmc-guest-list"><datalist id="vmc-guest-list">${guestNames.map(n=>`<option value="${escHtml(n)}">`).join('')}</datalist></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="vmChargesToggleAdd()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="vmChargesSave('${bk.id}')">Save</button>
      </div>
    </div>`:'';
  el.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f8fafc;border-bottom:1px solid var(--border);gap:8px;flex-wrap:wrap">
      <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted)">Charges${total>0?' · '+fmt$(total)+' total':''}</span>
      <div style="display:flex;gap:6px">
        ${guestNames.length>1?`<button class="btn btn-secondary btn-sm" onclick="vmBulkChargeOpen('${bk.id}')">👥 Bulk Charge</button>`:''}
        <button class="btn btn-secondary btn-sm" onclick="vmChargesToggleAdd()">${_vmChargesAddOpen?'Cancel':'+ Add Charge'}</button>
      </div>
    </div>
    ${addFormHtml}
    ${!charges.length?`<div style="padding:16px 14px;text-align:center;font-size:12.5px;color:var(--muted)">No charges yet — use "+ Add Charge" to record extras of the stay.</div>`
      :`<div style="padding:4px 14px 8px">
        ${charges.map(c=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f1f5f9">
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:600;color:var(--dark)">${escHtml(c.description||c.item||'')} <span style="font-weight:400;color:var(--muted);font-size:11px">· ${escHtml(c.category||'Other')}</span></div>
            <div style="font-size:11px;color:var(--muted)">${c.guestName?`👤 ${escHtml(c.guestName)} · `:'🏠 Room · '}${fmtDate((c.date||c.addedAt||'').slice(0,10))} · ${escHtml(c.addedBy||'Staff')}</div>
          </div>
          <div style="font-size:13px;font-weight:700;color:var(--dark);white-space:nowrap">${fmt$(c.amount)}</div>
          <button class="btn btn-danger btn-sm" onclick="vmChargesDelete('${bk.id}','${c.id}','${c._scope}'${c._regId?`,'${c._regId}'`:''})" style="padding:3px 8px;font-size:11px">Remove</button>
        </div>`).join('')}
      </div>`}`;
}
// ── Bulk charge: one description/category/amount, applied as a separate charge on EACH selected guest's own folio ──
function vmBulkChargeOpen(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const regs=AppData.regs.filter(r=>r.bookingId===bkId);
  const guestRows=regs.flatMap(r=>(r.guests||[]).filter(g=>g.name).map((g,gi)=>({reg:r,guest:g,guestIdx:r.guests.indexOf(g)})));
  if(!guestRows.length){showToast('No registered guests on this booking yet.');return;}
  let existing=document.getElementById('bulkChargeModal');if(existing)existing.remove();
  const overlay=document.createElement('div');
  overlay.id='bulkChargeModal';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;padding:24px;max-width:480px;width:100%;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:'Jost',sans-serif">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:var(--dark)">Bulk Charge</div>
      <button onclick="document.getElementById('bulkChargeModal').remove()" style="background:none;border:none;font-size:20px;color:#9ca3af;cursor:pointer">&times;</button>
    </div>
    <div class="frow" style="margin:0 0 8px">
      <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Category</label><select id="bc-category">${VMC_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>
      <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Amount ($ per person)</label><input type="number" id="bc-amount" min="0" step="0.01" placeholder="0.00"></div>
    </div>
    <div class="frow full" style="margin:0 0 12px">
      <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Description</label><input type="text" id="bc-desc" placeholder="e.g. Offsite Dinner"></div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Apply to</span>
      <button class="btn btn-secondary btn-sm" onclick="document.querySelectorAll('.bc-guest-chk').forEach(c=>c.checked=true)">Select All</button>
    </div>
    <div style="border:1.5px solid var(--border);border-radius:9px;max-height:220px;overflow-y:auto;margin-bottom:16px">
      ${guestRows.map((r,i)=>`<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #f3f4f6;cursor:pointer;font-size:13px;color:var(--dark)"><input type="checkbox" class="bc-guest-chk" data-regid="${r.reg.id}" data-gidx="${r.guestIdx}" checked> ${escHtml(r.guest.name)} <span style="color:var(--muted);font-size:11.5px">— ${escHtml(r.reg.room||'')}</span></label>`).join('')}
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('bulkChargeModal').remove()">Cancel</button>
      <button class="btn btn-primary btn-sm" onclick="vmBulkChargeSave('${bkId}')">Save Charges</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}
function vmBulkChargeSave(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const category=document.getElementById('bc-category').value||'Other';
  const description=document.getElementById('bc-desc').value.trim();
  const amount=Math.round(parseFloat(document.getElementById('bc-amount').value)*100)/100;
  const checked=[...document.querySelectorAll('.bc-guest-chk:checked')];
  if(!description){alert('Enter a description.');return;}
  if(!amount||amount<=0){alert('Enter a valid amount.');return;}
  if(!checked.length){alert('Select at least one guest.');return;}
  const who=getCurrentSession()?.name||'Staff';
  const date=new Date().toISOString().slice(0,10);
  let count=0;
  checked.forEach(chk=>{
    const reg=AppData.regs.find(r=>r.id===chk.dataset.regid);if(!reg)return;
    const guest=(reg.guests||[])[parseInt(chk.dataset.gidx)];if(!guest)return;
    if(!reg.charges)reg.charges=[];
    reg.charges.push({id:uid(),date,category,description,amount,guestName:guest.name,addedAt:new Date().toISOString(),addedBy:who});
    count++;
  });
  saveAll();
  document.getElementById('bulkChargeModal').remove();
  renderVmChargesWidget(bk);
  logActivity('Bulk charge added',`${fmt$(amount)} × ${count} — ${description} — ${bk.leaderName||bk.retreatName}`,bk.id);
  renderVmHistory(bk.id);
  showToast(`Charged ${count} guest${count!==1?'s':''} ✓`);
}
function vmChargesToggleAdd(){
  _vmChargesAddOpen=!_vmChargesAddOpen;
  const bk=AppData.bookings.find(b=>b.id===venEditId);if(bk)renderVmChargesWidget(bk);
}
function vmChargesSave(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  const date=document.getElementById('vmc-date').value||new Date().toISOString().slice(0,10);
  const category=document.getElementById('vmc-category').value||'Other';
  const description=document.getElementById('vmc-desc').value.trim();
  const amount=Math.round(parseFloat(document.getElementById('vmc-amount').value)*100)/100;
  const guestName=document.getElementById('vmc-guest').value.trim();
  if(!description){alert('Enter a description for the charge.');return;}
  if(!amount||amount<=0){alert('Enter a valid amount.');return;}
  const charge={id:uid(),date,category,description,amount,guestName:guestName||null,addedAt:new Date().toISOString(),addedBy:getCurrentSession()?.name||'Staff'};
  const matchedReg=guestName?vmFindRegForGuestName(bk,guestName):null;
  if(matchedReg){
    if(!matchedReg.charges)matchedReg.charges=[];
    matchedReg.charges.push(charge);
  }else{
    if(!bk.charges)bk.charges=[];
    bk.charges.push(charge);
  }
  _vmChargesAddOpen=false;
  saveAll();renderVmChargesWidget(bk);
  logActivity('Charge added',`${fmt$(amount)} — ${description}${guestName?' — '+guestName:''} — ${bk.leaderName||bk.retreatName}`,bk.id);
  renderVmHistory(bk.id);
  showToast('Charge added ✓');
}
function vmChargesDelete(bkId,chargeId,scope,regId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  let c;
  if(scope==='guest'){
    const reg=AppData.regs.find(r=>r.id===regId);if(!reg)return;
    c=(reg.charges||[]).find(x=>x.id===chargeId);if(!c)return;
    if(!confirm(`Remove this charge — "${c.description}" (${fmt$(c.amount)})?`))return;
    reg.charges=(reg.charges||[]).filter(x=>x.id!==chargeId);
  }else{
    c=(bk.charges||[]).find(x=>x.id===chargeId);if(!c)return;
    if(!confirm(`Remove this charge — "${c.description}" (${fmt$(c.amount)})?`))return;
    bk.charges=(bk.charges||[]).filter(x=>x.id!==chargeId);
  }
  saveAll();renderVmChargesWidget(bk);
  logActivity('Charge removed',`${fmt$(c.amount)} — ${c.description}${c.guestName?' — '+c.guestName:''} — ${bk.leaderName||bk.retreatName}`,bk.id);
  renderVmHistory(bk.id);
  showToast('Charge removed.');
}

// ===== INDIVIDUAL GUEST FOLIO ===== (opened by clicking a guest's name in a room list,
// or by clicking a Room Only booking — Hilario/Jorge-style in-house guests are a member
// of an existing retreat, not their own retreat, so clicking them should land here
// directly rather than on a room list or the full reservation-edit form).
let _gfRegId=null,_gfGuestIdx=0,_gfAddOpen=false,_gfBkId=null;
function openGuestFolio(regId,guestIdx){
  const reg=AppData.regs.find(r=>r.id===regId);if(!reg)return;
  const guest=(reg.guests||[])[guestIdx];if(!guest)return;
  _gfRegId=regId;_gfGuestIdx=guestIdx;_gfBkId=null;_gfAddOpen=false;
  renderGuestFolio();
  openModal('guestFolioModal');
}
function openBookingFolio(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  _gfBkId=bkId;_gfRegId=null;_gfAddOpen=false;
  renderGuestFolio();
  openModal('guestFolioModal');
}
function gfEditDetails(){
  const bkId=_gfBkId;if(!bkId)return;
  closeModal('guestFolioModal');
  rmOpenEditBooking(bkId);
}
function renderGuestFolio(){
  if(_gfBkId) return renderBookingFolio();
  const reg=AppData.regs.find(r=>r.id===_gfRegId);if(!reg)return closeModal('guestFolioModal');
  const guest=(reg.guests||[])[_gfGuestIdx];if(!guest)return closeModal('guestFolioModal');
  const bk=AppData.bookings.find(b=>b.id===reg.bookingId);
  const charges=(reg.charges||[]).slice().sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''));
  const total=charges.reduce((s,c)=>s+(c.amount||0),0);
  document.getElementById('gfTitle').textContent=guest.name;
  document.getElementById('gfSub').textContent=`Room ${reg.room||'—'} · ${bk?(bk.leaderName||bk.retreatName):''}`;
  const addFormHtml=_gfAddOpen?`
    <div style="padding:10px 14px;background:#f8fafc;border-top:1px solid var(--border)">
      <div class="frow" style="margin:0 0 8px">
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Date</label><input type="date" id="gfc-date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Category</label><select id="gfc-category">${VMC_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>
      </div>
      <div class="frow" style="margin:0 0 10px">
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Description</label><input type="text" id="gfc-desc" placeholder="e.g. Massage 60min"></div>
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Amount ($)</label><input type="number" id="gfc-amount" min="0" step="0.01" placeholder="0.00"></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="gfToggleAdd()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="gfChargeSave()">Save</button>
      </div>
    </div>`:'';
  const bkBalance=bk?calcBkBalance(bk):null;
  const infoRow=(label,value)=>value?`<div style="display:flex;gap:8px;padding:3px 0"><span style="font-size:11px;color:var(--muted);min-width:52px">${label}</span><span style="font-size:12.5px;color:var(--dark)">${escHtml(value)}</span></div>`:'';
  const byDept={};charges.forEach(c=>{const d=gfDeptFor(c.category);byDept[d]=(byDept[d]||0)+(c.amount||0);});
  const deptChipsHtml=Object.keys(byDept).length?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${GF_DEPT_ORDER.filter(d=>byDept[d]>0).map(d=>`<div style="background:#fff;border:1px solid var(--border);border-radius:7px;padding:4px 9px"><span style="font-size:10px;color:var(--muted)">${d}</span> <span style="font-size:11.5px;font-weight:700;color:var(--dark)">${fmt$(byDept[d])}</span></div>`).join('')}</div>`:'';
  document.getElementById('gfBody').innerHTML=`
    <div style="padding:12px 14px;background:#f8fafc;border-bottom:1px solid var(--border)">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 14px;margin-bottom:${(guest.email||guest.phone||guest.notes)?'10px':'0'}">
        ${infoRow('Email',guest.email)}
        ${infoRow('Phone',guest.phone)}
      </div>
      ${guest.notes?`<div style="font-size:12px;color:var(--dark);background:#fff;border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:10px"><span style="font-weight:700;color:var(--muted);text-transform:uppercase;font-size:10px;letter-spacing:.6px">Notes</span><div style="margin-top:2px">${escHtml(guest.notes)}</div></div>`:''}
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)">Outstanding — This Guest's Charges</div><div style="font-size:15px;font-weight:800;color:var(--dark)">${fmt$(total)}</div></div>
        ${bkBalance?`<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)">Retreat Balance (all guests)</div><div style="font-size:15px;font-weight:800;color:${bkBalance.balance>0?'#dc2626':'#16a34a'}">${bkBalance.balance>0?fmt$(bkBalance.balance):'Paid in full'}</div></div>`:''}
      </div>
      ${deptChipsHtml}
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f8fafc;border-bottom:1px solid var(--border)">
      <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted)">Folio${total>0?' · '+fmt$(total)+' total':''}</span>
      <button class="btn btn-secondary btn-sm" onclick="gfToggleAdd()">${_gfAddOpen?'Cancel':'+ Add Charge'}</button>
    </div>
    ${addFormHtml}
    ${!charges.length?`<div style="padding:16px 14px;text-align:center;font-size:12.5px;color:var(--muted)">No charges on this guest's folio yet.</div>`
      :`<div style="padding:4px 14px 8px">
        ${charges.map(c=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f1f5f9">
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:600;color:var(--dark)">${escHtml(c.description)} <span style="font-weight:400;color:var(--muted);font-size:11px">· ${escHtml(c.category||'Other')}</span></div>
            <div style="font-size:11px;color:var(--muted)">${fmtDate((c.date||c.addedAt||'').slice(0,10))} · ${escHtml(c.addedBy||'Staff')}</div>
          </div>
          <div style="font-size:13px;font-weight:700;color:var(--dark);white-space:nowrap">${fmt$(c.amount)}</div>
          <button class="btn btn-danger btn-sm" onclick="gfChargeDelete('${c.id}')" style="padding:3px 8px;font-size:11px">Remove</button>
        </div>`).join('')}
      </div>`}`;
}
// Booking-mode: Room Only guests (Walk-in/Direct/Bikini Bootcamp/Restore &
// Renew/OTA) have no `reg` at all — rmSaveNewBooking initializes charges
// directly on the booking — so this renders the same clean folio from `bk`.
// Per-guest breakdown for a split booking — room total is divided by
// bk.folioSplit.splitPct (equal by default, staff-adjustable below);
// charges/payments tagged with a guestName go to that guest, untagged
// ones fall to the primary guest so nothing silently disappears from the
// combined total. The combined reservation total itself is never touched
// here — this is purely a display split of the same numbers.
function gfSplitBreakdownHtml(bk,charges,roomTotal){
  const fs=bk.folioSplit;
  const names=fs.guestNames;
  const isAdmin=getCurrentSession()?.role==='admin';
  const payments=bk.payments||[];
  const rows=names.map((name,i)=>{
    const pct=fs.splitPct[i];
    const roomShare=+(roomTotal*pct/100).toFixed(2);
    const myCharges=charges.filter(c=>(c.guestName||names[0])===name);
    const myChargeTotal=myCharges.reduce((s,c)=>s+(c.amount||0),0);
    const myPayments=payments.filter(p=>(p.guestName||names[0])===name);
    const myPaid=myPayments.reduce((s,p)=>s+(p.amount||0),0);
    const myBalance=+(roomShare+myChargeTotal-myPaid).toFixed(2);
    return `<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:10px 12px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
        <div style="font-weight:700;color:var(--dark);font-size:13px">${escHtml(name)}</div>
        <div style="font-size:10.5px;color:var(--muted)">${pct}% share</div>
      </div>
      <div style="font-size:11.5px;color:var(--muted);display:flex;justify-content:space-between"><span>Room share</span><span>${fmt$(roomShare)}</span></div>
      <div style="font-size:11.5px;color:var(--muted);display:flex;justify-content:space-between"><span>Charges (${myCharges.length})</span><span>${fmt$(myChargeTotal)}</span></div>
      <div style="font-size:11.5px;color:var(--muted);display:flex;justify-content:space-between"><span>Paid</span><span style="color:#16a34a">${fmt$(myPaid)}</span></div>
      <div style="font-size:12.5px;font-weight:700;display:flex;justify-content:space-between;border-top:1px solid #f1f5f9;margin-top:5px;padding-top:5px"><span>Balance</span><span style="color:${myBalance>0?'#dc2626':'#16a34a'}">${myBalance>0?fmt$(myBalance):'Paid in full'}</span></div>
    </div>`;
  }).join('');
  const adjustHtml=isAdmin?`<div style="margin-top:8px">
    <button class="btn btn-secondary btn-sm" onclick="gfToggleSplitAdjust()">${_gfSplitAdjustOpen?'Cancel':'Adjust Split %'}</button>
    ${_gfSplitAdjustOpen?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:flex-end">
      ${names.map((name,i)=>`<div class="fg" style="margin:0"><label style="font-size:10px">${escHtml(name)} %</label><input type="number" id="gfSplitPct${i}" value="${fs.splitPct[i]}" min="0" max="100" step="0.01" style="width:80px"></div>`).join('')}
      <button class="btn btn-primary btn-sm" onclick="gfSaveSplitAdjust()">Save</button>
    </div>`:''}
  </div>`:'';
  return `<div style="padding:12px 14px;background:#f8fafc;border-bottom:1px solid var(--border)">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">${rows}</div>
    ${adjustHtml}
  </div>`;
}
let _gfSplitAdjustOpen=false;
function gfToggleSplitAdjust(){_gfSplitAdjustOpen=!_gfSplitAdjustOpen;renderGuestFolio();}
function gfSaveSplitAdjust(){
  const bk=AppData.bookings.find(b=>b.id===_gfBkId);if(!bk||bk.folioSplit?.mode!=='separate')return;
  const names=bk.folioSplit.guestNames;
  const vals=names.map((_,i)=>parseFloat(document.getElementById('gfSplitPct'+i).value));
  if(vals.some(v=>isNaN(v)||v<0)){alert('Enter valid percentages.');return;}
  const sum=+vals.reduce((s,v)=>s+v,0).toFixed(2);
  if(Math.abs(sum-100)>0.5){alert(`Split percentages must add up to 100% (currently ${sum}%).`);return;}
  const before=bk.folioSplit.splitPct.slice();
  bk.folioSplit.splitPct=vals;
  fsPushHistory(bk,'split_adjusted',`${names.map((n,i)=>`${n}: ${before[i]}%→${vals[i]}%`).join(', ')}`);
  saveAll();
  _gfSplitAdjustOpen=false;
  renderGuestFolio();
  logActivity('Folio split adjusted',names.map((n,i)=>`${n} ${vals[i]}%`).join(', '),bk.id);
  showToast('Split updated ✓');
}
// ===== PHASE 2 — ROOM BOOKING CONFIRMATION (preview + secure guest link + email) =====
// Token is real entropy (crypto.getRandomValues), NOT uid() — uid() is a
// timestamp + 4 base36 chars, guessable/enumerable, unsuitable for a
// public link. Generated once per booking and stored, never regenerated
// (so a previously-sent link keeps working).
function resGenSecureToken(){
  const bytes=new Uint8Array(24);
  (window.crypto||window.msCrypto).getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
function resEnsureConfirmation(bk){
  let changed=false;
  if(!bk.guestResToken){bk.guestResToken=resGenSecureToken();changed=true;}
  if(!bk.confirmationNumber){bk.confirmationNumber='AMZ-'+bk.id.replace(/[^0-9]/g,'').slice(-6).padStart(6,'0');changed=true;}
  if(changed)saveAll();
}
function resGuestLink(bk){
  return `${location.origin}/reservation.html?token=${bk.guestResToken}`;
}
// Balance/status math shared between the admin preview and the wording
// rule ("never call an unpaid reservation confirmed").
function resComputeInfo(bk){
  const roomTotal=bk.roomRateTotal||0;
  const chargesTotal=(bk.charges||[]).reduce((s,c)=>s+(c.amount||0),0);
  const total=+(roomTotal+chargesTotal).toFixed(2);
  const paid=(bk.payments||[]).reduce((s,p)=>s+(p.amount||0),0);
  const balance=+(total-paid).toFixed(2);
  const isPaid=balance<=0;
  const dueDate=finalPaymentDue(bk);
  return{roomTotal,chargesTotal,total,paid,balance,isPaid,dueDate};
}
let _resPreviewBkId=null,_resSending=false;
function resOpenPreview(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk)return;
  resEnsureConfirmation(bk);
  _resPreviewBkId=bkId;
  resRenderPreview();
  openModal('resPreviewModal');
}
function resRenderPreview(){
  const bk=AppData.bookings.find(b=>b.id===_resPreviewBkId);if(!bk)return;
  const rt=AppData.roomTypes.find(t=>t.id===bk.roomTypeId);
  const room=(bk.blockedRooms||[])[0]||'—';
  const {roomTotal,chargesTotal,total,paid,balance,isPaid,dueDate}=resComputeInfo(bk);
  const nights=bk.roomRateNights||0;
  const additionalGuests=bk.folioSplit?.mode==='separate'?bk.folioSplit.guestNames.slice(1):[];
  const statusLabel=isPaid?'Booking Confirmed':'Reservation Received — Payment Required';
  const statusColor=isPaid?'#16a34a':'#d97706';
  const sentLog=bk.guestResSentLog||[];
  const lastSent=sentLog[sentLog.length-1];
  document.getElementById('resPreviewBody').innerHTML=`
    <div style="background:${isPaid?'#f0fdf4':'#fffbeb'};border:1.5px solid ${statusColor};border-radius:10px;padding:12px 16px;margin-bottom:16px">
      <div style="font-weight:800;color:${statusColor};font-size:14px">${statusLabel}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">Confirmation #${bk.confirmationNumber}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:12.5px;margin-bottom:16px">
      <div><b>Guest</b><br>${escHtml(bk.leaderName||'—')}</div>
      <div><b>Email</b><br>${escHtml(bk.leaderEmail||'—')}</div>
      <div><b>Room / Category</b><br>${escHtml(room)}${rt?' · '+escHtml(rt.name):''} · ${bk.pax||1} guest${(bk.pax||1)!==1?'s':''}</div>
      <div><b>Additional Guests</b><br>${additionalGuests.length?additionalGuests.map(n=>escHtml(n)).join(', '):'—'}</div>
      <div><b>Dates</b><br>${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)} · ${nights} night${nights!==1?'s':''}</div>
      <div><b>Rate / Total</b><br>${fmt$(roomTotal)}${chargesTotal?' + '+fmt$(chargesTotal)+' charges':''} = <b>${fmt$(total)}</b></div>
      <div><b>Paid / Balance</b><br>${fmt$(paid)} paid · <span style="color:${balance>0?'#dc2626':'#16a34a'}">${balance>0?fmt$(balance)+' due':'Paid in full'}</span></div>
      <div><b>Payment Deadline</b><br>${balance>0?dueDate.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}):'—'}</div>
    </div>
    <div class="fg"><label>Guest-Facing Notes <span style="font-weight:400;color:var(--muted)">(shown to the guest — do not put internal/staff notes here)</span></label>
      <textarea id="resGuestNotes" rows="2">${escHtml(bk.guestNotes||'')}</textarea>
    </div>
    <div style="margin:10px 0;font-size:11px;color:var(--muted)">Secure link: <code style="background:#f8fafc;padding:2px 6px;border-radius:5px">${resGuestLink(bk)}</code></div>
    ${lastSent?`<div style="font-size:11px;color:var(--muted);margin-bottom:10px">Last sent ${new Date(lastSent.at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} by ${escHtml(lastSent.by)}${sentLog.length>1?` (${sentLog.length} times total)`:''}</div>`:''}
    <div id="resSendErr" style="display:none;color:#dc2626;font-size:12px;margin-bottom:8px"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" id="resSendBtn" onclick="resSendToGuest()">${lastSent?'Send Again':'Send to Guest'}</button>
      <button class="btn btn-secondary" onclick="resCopyWhatsApp()">Copy Link for WhatsApp</button>
    </div>`;
}
function resSaveGuestNotesFromPreview(){
  const bk=AppData.bookings.find(b=>b.id===_resPreviewBkId);if(!bk)return;
  const val=document.getElementById('resGuestNotes')?.value.trim()||'';
  if(bk.guestNotes===val)return;
  bk.guestNotes=val;
  saveAll();
}
async function resSendToGuest(){
  const bk=AppData.bookings.find(b=>b.id===_resPreviewBkId);if(!bk)return;
  if(!bk.leaderEmail){alert('No email on file for this guest — add one before sending.');return;}
  if(_resSending)return; // guards a double-click before the request completes
  resSaveGuestNotesFromPreview();
  const sentLog=bk.guestResSentLog||[];
  if(sentLog.length){
    const lastAt=new Date(sentLog[sentLog.length-1].at).getTime();
    if(Date.now()-lastAt<60000&&!confirm('A confirmation was already sent to this guest less than a minute ago. Send again?'))return;
  }
  _resSending=true;
  const btn=document.getElementById('resSendBtn');
  const errEl=document.getElementById('resSendErr');
  if(errEl)errEl.style.display='none';
  if(btn){btn.disabled=true;btn.textContent='Sending…';}
  try{
    const {roomTotal,chargesTotal,total,paid,balance,isPaid,dueDate}=resComputeInfo(bk);
    const name=bk.leaderName||'Guest';
    const rt=AppData.roomTypes.find(t=>t.id===bk.roomTypeId);
    const room=(bk.blockedRooms||[])[0]||'';
    const link=resGuestLink(bk);
    const statusLine=isPaid
      ?'Your booking is confirmed. We look forward to welcoming you!'
      :'Your reservation has been received and will be confirmed once the required payment is completed.';
    const additionalGuests=bk.folioSplit?.mode==='separate'?bk.folioSplit.guestNames.slice(1):[];
    const body=`<p style="font-size:15px;color:#1a2332">Hi ${escHtml(name.split(' ')[0])},</p>
<p style="color:#4a4a4a;line-height:1.7">Thank you for choosing Amansala. We are delighted to welcome you to Tulum.</p>
<div style="background:#f8fafc;border-left:4px solid #0e9494;padding:14px 18px;border-radius:6px;margin:20px 0;color:#1a2332;line-height:1.9">
  <b>Reservation:</b> ${escHtml(bk.confirmationNumber)}<br>
  <b>Room:</b> ${escHtml(rt?rt.name:room)}<br>
  <b>Guests:</b> ${escHtml([name,...additionalGuests].join(' & '))}<br>
  <b>Arrival:</b> ${fmtDate(bk.startDate)}<br>
  <b>Departure:</b> ${fmtDate(bk.endDate)}<br>
  <b>Total:</b> ${fmt$(total)} USD<br>
  <b>Paid:</b> ${fmt$(paid)}<br>
  <b>Balance:</b> ${fmt$(balance)}${balance>0?'<br><b>Payment due:</b> '+dueDate.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}):''}
</div>
<p style="color:#4a4a4a;line-height:1.7">${statusLine}</p>
${bk.guestNotes?`<p style="color:#4a4a4a;line-height:1.7"><b>Note:</b> ${escHtml(bk.guestNotes)}</p>`:''}
<div style="text-align:center;margin:28px 0">
  <a href="${link}" style="background:#0e9494;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;margin:0 6px 10px">View Reservation</a>
  ${balance>0?`<a href="${link}" style="background:#d97706;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;margin:0 6px 10px">Complete Payment</a>`:''}
</div>
<p style="color:#4a4a4a">Warmly,<br><strong>The Amansala Team</strong></p>`;
    await _sendEmail(bk.leaderEmail,`Your Amansala Reservation — ${bk.confirmationNumber}`,_emailHtmlWrap(body),'bookings@amansala.com');
    if(!bk.guestResSentLog)bk.guestResSentLog=[];
    bk.guestResSentLog.push({at:new Date().toISOString(),by:getCurrentSession()?.name||'Staff',method:'email'});
    saveAll();
    logActivity('Reservation sent to guest',`${bk.confirmationNumber} — ${bk.leaderEmail}`,bk.id);
    showToast('Sent to guest ✓');
    resRenderPreview();
  }catch(e){
    if(errEl){errEl.textContent='Sending failed: '+(e.message||'unknown error')+'. ';errEl.style.display='block';
      const retryBtn=document.createElement('button');
      retryBtn.className='btn btn-secondary btn-sm';retryBtn.textContent='Retry';retryBtn.onclick=resSendToGuest;
      errEl.appendChild(retryBtn);
    }
  }finally{
    _resSending=false;
    if(btn){btn.disabled=false;btn.textContent=(bk.guestResSentLog||[]).length?'Send Again':'Send to Guest';}
  }
}
function resCopyWhatsApp(){
  const bk=AppData.bookings.find(b=>b.id===_resPreviewBkId);if(!bk)return;
  const link=resGuestLink(bk);
  const {balance}=resComputeInfo(bk);
  const msg=`Hi ${bk.leaderName||'there'}! Here's your Amansala reservation (${bk.confirmationNumber}): ${link}${balance>0?`\nBalance due: ${fmt$(balance)}`:''}`;
  navigator.clipboard.writeText(msg).then(()=>showToast('Copied — paste into WhatsApp ✓')).catch(()=>alert(msg));
}
function renderBookingFolio(){
  const bk=AppData.bookings.find(b=>b.id===_gfBkId);if(!bk)return closeModal('guestFolioModal');
  const rt=AppData.roomTypes.find(t=>t.id===bk.roomTypeId);
  const room=(bk.blockedRooms||[])[0]||'—';
  const charges=(bk.charges||[]).slice().sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''));
  const total=charges.reduce((s,c)=>s+(c.amount||0),0);
  document.getElementById('gfTitle').textContent=bk.leaderName||bk.retreatName||'Guest';
  document.getElementById('gfSub').innerHTML=`Room ${escHtml(room)}${rt?' · '+escHtml(rt.name):''} · ${escHtml(bk.retreatName||'')} <span onclick="gfEditDetails()" style="cursor:pointer;color:var(--teal,#2d6a6a);font-weight:600;text-decoration:underline;margin-left:6px">Edit Details</span> <span onclick="resOpenPreview('${bk.id}')" style="cursor:pointer;color:var(--teal,#2d6a6a);font-weight:600;text-decoration:underline;margin-left:6px">Preview &amp; Send to Guest</span>`;
  const fs=bk.folioSplit;
  const isSplit=fs?.mode==='separate';
  const addFormHtml=_gfAddOpen?`
    <div style="padding:10px 14px;background:#f8fafc;border-top:1px solid var(--border)">
      <div class="frow" style="margin:0 0 8px">
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Date</label><input type="date" id="gfc-date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Category</label><select id="gfc-category">${VMC_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>
      </div>
      <div class="frow" style="margin:0 0 10px">
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Description</label><input type="text" id="gfc-desc" placeholder="e.g. Massage 60min"></div>
        <div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Amount ($)</label><input type="number" id="gfc-amount" min="0" step="0.01" placeholder="0.00"></div>
      </div>
      ${isSplit?`<div class="frow" style="margin:0 0 10px"><div class="fg" style="margin:0"><label style="font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:3px">Which Guest?</label><select id="gfc-guest">${fs.guestNames.map(n=>`<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('')}</select></div></div>`:''}
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="gfToggleAdd()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="gfChargeSave()">Save</button>
      </div>
    </div>`:'';
  const roomTotal=bk.roomRateTotal||0;
  const paid=(bk.payments||[]).reduce((s,p)=>s+(p.amount||0),0);
  const balance=+(roomTotal+total-paid).toFixed(2);
  const byDept={};charges.forEach(c=>{const d=gfDeptFor(c.category);byDept[d]=(byDept[d]||0)+(c.amount||0);});
  const deptChipsHtml=Object.keys(byDept).length?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${GF_DEPT_ORDER.filter(d=>byDept[d]>0).map(d=>`<div style="background:#fff;border:1px solid var(--border);border-radius:7px;padding:4px 9px"><span style="font-size:10px;color:var(--muted)">${d}</span> <span style="font-size:11.5px;font-weight:700;color:var(--dark)">${fmt$(byDept[d])}</span></div>`).join('')}</div>`:'';
  const splitBannerHtml=isSplit?`<div style="padding:9px 14px;background:#eff6ff;border-bottom:1px solid #bfdbfe;font-size:12px;color:#1e40af;font-weight:600">Separate folios requested — each guest pays individually.</div>`:'';
  const splitBreakdownHtml=isSplit?gfSplitBreakdownHtml(bk,charges,roomTotal):'';
  document.getElementById('gfBody').innerHTML=`
    ${splitBannerHtml}
    <div style="padding:12px 14px;background:#f8fafc;border-bottom:1px solid var(--border)">
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)">Room/Package</div><div style="font-size:15px;font-weight:800;color:var(--dark)">${fmt$(roomTotal)}</div></div>
        <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)">Outstanding — Charges</div><div style="font-size:15px;font-weight:800;color:var(--dark)">${fmt$(total)}</div></div>
        <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)">Balance</div><div style="font-size:15px;font-weight:800;color:${balance>0?'#dc2626':'#16a34a'}">${balance>0?fmt$(balance):'Paid in full'}</div></div>
      </div>
      ${deptChipsHtml}
    </div>
    ${splitBreakdownHtml}
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f8fafc;border-bottom:1px solid var(--border)">
      <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted)">Folio${total>0?' · '+fmt$(total)+' total':''}</span>
      <button class="btn btn-secondary btn-sm" onclick="gfToggleAdd()">${_gfAddOpen?'Cancel':'+ Add Charge'}</button>
    </div>
    ${addFormHtml}
    ${!charges.length?`<div style="padding:16px 14px;text-align:center;font-size:12.5px;color:var(--muted)">No charges on this guest's folio yet.</div>`
      :`<div style="padding:4px 14px 8px">
        ${charges.map(c=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f1f5f9">
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:600;color:var(--dark)">${escHtml(c.description)} <span style="font-weight:400;color:var(--muted);font-size:11px">· ${escHtml(c.category||'Other')}</span></div>
            <div style="font-size:11px;color:var(--muted)">${fmtDate((c.date||c.addedAt||'').slice(0,10))} · ${escHtml(c.addedBy||'Staff')}</div>
          </div>
          <div style="font-size:13px;font-weight:700;color:var(--dark);white-space:nowrap">${fmt$(c.amount)}</div>
          <button class="btn btn-danger btn-sm" onclick="gfChargeDelete('${c.id}')" style="padding:3px 8px;font-size:11px">Remove</button>
        </div>`).join('')}
      </div>`}`;
}
function gfToggleAdd(){_gfAddOpen=!_gfAddOpen;renderGuestFolio();}
function gfChargeSave(){
  if(_gfBkId) return gfChargeSaveBooking();
  const reg=AppData.regs.find(r=>r.id===_gfRegId);if(!reg)return;
  const guest=(reg.guests||[])[_gfGuestIdx];
  const date=document.getElementById('gfc-date').value||new Date().toISOString().slice(0,10);
  const category=document.getElementById('gfc-category').value||'Other';
  const description=document.getElementById('gfc-desc').value.trim();
  const amount=Math.round(parseFloat(document.getElementById('gfc-amount').value)*100)/100;
  if(!description){alert('Enter a description for the charge.');return;}
  if(!amount||amount<=0){alert('Enter a valid amount.');return;}
  if(!reg.charges)reg.charges=[];
  reg.charges.push({id:uid(),date,category,description,amount,guestName:guest?.name||null,addedAt:new Date().toISOString(),addedBy:getCurrentSession()?.name||'Staff'});
  _gfAddOpen=false;
  saveAll();renderGuestFolio();
  logActivity('Charge added',`${fmt$(amount)} — ${description} — ${guest?.name||''}`,reg.bookingId);
  showToast('Charge added ✓');
}
function gfChargeSaveBooking(){
  const bk=AppData.bookings.find(b=>b.id===_gfBkId);if(!bk)return;
  const date=document.getElementById('gfc-date').value||new Date().toISOString().slice(0,10);
  const category=document.getElementById('gfc-category').value||'Other';
  const description=document.getElementById('gfc-desc').value.trim();
  const amount=Math.round(parseFloat(document.getElementById('gfc-amount').value)*100)/100;
  if(!description){alert('Enter a description for the charge.');return;}
  if(!amount||amount<=0){alert('Enter a valid amount.');return;}
  if(!bk.charges)bk.charges=[];
  const guestSel=document.getElementById('gfc-guest');
  const guestName=(bk.folioSplit?.mode==='separate'&&guestSel)?guestSel.value:(bk.leaderName||null);
  bk.charges.push({id:uid(),date,category,description,amount,guestName,addedAt:new Date().toISOString(),addedBy:getCurrentSession()?.name||'Staff'});
  _gfAddOpen=false;
  saveAll();renderGuestFolio();
  logActivity('Charge added',`${fmt$(amount)} — ${description} — ${guestName||''}`,bk.id);
  showToast('Charge added ✓');
}
function gfChargeDelete(chargeId){
  if(_gfBkId) return gfChargeDeleteBooking(chargeId);
  const reg=AppData.regs.find(r=>r.id===_gfRegId);if(!reg)return;
  const c=(reg.charges||[]).find(x=>x.id===chargeId);if(!c)return;
  if(!confirm(`Remove this charge — "${c.description}" (${fmt$(c.amount)})?`))return;
  reg.charges=(reg.charges||[]).filter(x=>x.id!==chargeId);
  saveAll();renderGuestFolio();
  logActivity('Charge removed',`${fmt$(c.amount)} — ${c.description} — ${c.guestName||''}`,reg.bookingId);
  showToast('Charge removed.');
}
function gfChargeDeleteBooking(chargeId){
  const bk=AppData.bookings.find(b=>b.id===_gfBkId);if(!bk)return;
  const c=(bk.charges||[]).find(x=>x.id===chargeId);if(!c)return;
  if(!confirm(`Remove this charge — "${c.description}" (${fmt$(c.amount)})?`))return;
  bk.charges=(bk.charges||[]).filter(x=>x.id!==chargeId);
  saveAll();renderGuestFolio();
  logActivity('Charge removed',`${fmt$(c.amount)} — ${c.description} — ${bk.leaderName||''}`,bk.id);
  showToast('Charge removed.');
}


// ===== PIPELINE STEPS =====
const PIPELINE_STEPS=[
  {id:'contractSigned',    label:'Contract\nSigned',    manual:true},
  {id:'depositPaid',       label:'Deposit\nPaid',       manual:false},
  {id:'roomListSent',      label:'Room List\nSent',     manual:true},
  {id:'scheduleFilled',    label:'Schedule\nFilled',    manual:false},
  {id:'scheduleConfirmed', label:'Schedule\nConfirmed', manual:false},
  {id:'transportFilled',   label:'Transport\nArranged', manual:true},
  {id:'teacherRoom',       label:'Teacher\nRoom',       manual:false},
  {id:'finalInvoicePaid',  label:'Final Invoice\nPaid', manual:true},
];
function dbPipelineStepDone(bk,stepId){
  switch(stepId){
    // Contract Signed: requires an actual signed date OR status explicitly set to contract_signed (not inferred from higher statuses)
    case 'contractSigned':
      return !!(bk.contractSignedAt||bk.status==='contract_signed');
    // Deposit Request Sent: manual only — admin clicks the dot
    case 'depositReqSent':
      return !!(adminDone[bk.id+'_depositReqSent']);
    // Deposit Paid: requires actual recorded payment with amount > 0 — status alone is NOT enough
    case 'depositPaid':
      return (bk.payments||[]).reduce((s,p)=>s+(p.amount||0),0)>0;
    case 'roomListSent':
      return !!(bk.roomListSentViaPortal||bk.roomListSentAt||adminDone[bk.id+'_roomListSent']);
    case 'scheduleFilled':
      return !!bk.scheduleRequest?.submittedAt;
    case 'scheduleConfirmed':
      return bk.scheduleRequest?.adminStatus==='confirmed';
    case 'transportFilled':
      return !!(adminDone[bk.id+'_transportFilled']);
    case 'teacherRoom':
      return AppData.regs.some(r=>r.bookingId===bk.id&&r.isTeacherRoom&&r.room)||!!(adminDone[bk.id+'_teacherRoom']);
    case 'finalInvoicePaid':
      return !!(bk.finalInvoicePaid||adminDone[bk.id+'_finalInvoicePaid']);
  }
  return false;
}
function dbTogglePipelineStep(bkId,stepId){
  const key=bkId+'_'+stepId;
  const bk=AppData.bookings.find(b=>b.id===bkId);
  if(adminDone[key]){
    delete adminDone[key];
    // Undo contractSignedAt if we set it here
    if(stepId==='contractSigned'&&bk&&bk._contractSignedByPipeline){delete bk.contractSignedAt;delete bk._contractSignedByPipeline;saveAll();}
    // Undo finalInvoicePaid on the booking
    if(stepId==='finalInvoicePaid'&&bk){delete bk.finalInvoicePaid;saveAll();}
  } else {
    adminDone[key]={ts:new Date().toISOString(),label:PIPELINE_STEPS.find(s=>s.id===stepId)?.label.replace('\n',' ')||stepId};
    // Also persist contractSignedAt on the booking so the step stays done after adminDone expires
    if(stepId==='contractSigned'&&bk&&!bk.contractSignedAt){
      bk.contractSignedAt=new Date().toISOString();bk._contractSignedByPipeline=true;
      if(bk.status==='contract_sent'||bk.status==='requested'){bk.status='contract_signed';bk.statusChangedAt=bk.contractSignedAt;}
      if(!bk.depositInvoice){bk.depositInvoice={number:getNextInvoiceNumber(),issuedAt:bk.contractSignedAt,dueAt:new Date(new Date(bk.contractSignedAt).getTime()+7*86400000).toISOString(),amount:2500,status:'pending'};}
      if(typeof pipeAutoAdvance==='function')pipeAutoAdvance(bk,'contract_signed');
      saveAll();
    }
    // Persist finalInvoicePaid on the booking so it syncs to Supabase and persists across devices
    if(stepId==='finalInvoicePaid'&&bk){bk.finalInvoicePaid=new Date().toISOString();saveAll();}
  }
  saveAdminDone();buildDashboard();
}
function buildPipelineSection(retreats,today){
  if(!retreats.length)return'';
  const N=PIPELINE_STEPS.length;

  // ── Detect date overlaps and assign color groups ─────────────────────────
  const OV_PALETTE=[
    {border:'#15803d',bg:'#ffffff',chip:'#dcfce7',chipBorder:'#86efac',chipText:'#14532d'},
  ];
  // Union-find
  const parent=new Map();
  const find=id=>{if(parent.get(id)!==id)parent.set(id,find(parent.get(id)));return parent.get(id);};
  const union=(a,b)=>{const ra=find(a),rb=find(b);if(ra!==rb)parent.set(ra,rb);};
  retreats.forEach(b=>parent.set(b.id,b.id));
  for(let i=0;i<retreats.length;i++)for(let j=i+1;j<retreats.length;j++){
    const a=retreats[i],b=retreats[j];
    if(a.startDate<b.endDate&&b.startDate<a.endDate)union(a.id,b.id);
  }
  // Assign palette index to each root that has 2+ members
  const rootCount=new Map(),rootPalette=new Map();
  retreats.forEach(b=>{const r=find(b.id);rootCount.set(r,(rootCount.get(r)||0)+1);});
  let palIdx=0;
  rootCount.forEach((cnt,root)=>{if(cnt>1){rootPalette.set(root,palIdx%OV_PALETTE.length);palIdx++;}});
  // Map each booking to its palette (or null)
  const bkPalette=new Map();
  retreats.forEach(b=>{const r=find(b.id);if(rootPalette.has(r))bkPalette.set(b.id,OV_PALETTE[rootPalette.get(r)]);});
  // Collect overlap peers for each booking
  const bkPeers=new Map();
  retreats.forEach(b=>{
    const r=find(b.id);
    if(rootPalette.has(r)){
      bkPeers.set(b.id,retreats.filter(x=>x.id!==b.id&&find(x.id)===r&&b.startDate<x.endDate&&x.startDate<b.endDate).map(x=>({id:x.id,name:x.leaderName||x.retreatName})));
    }
  });

  const buildCard=(bk)=>{
    const pal=bkPalette.get(bk.id)||null;
    const peers=bkPeers.get(bk.id)||[];
    const doneArr=PIPELINE_STEPS.map(s=>dbPipelineStepDone(bk,s.id));
    const doneCount=doneArr.filter(Boolean).length;
    const lastDoneIdx=doneArr.reduce((last,v,i)=>v?i:last,-1);
    const fillPct=lastDoneIdx<0?0:(lastDoneIdx/(N-1)*100);
    const pct=Math.round(doneCount/N*100);
    const nextIdx=doneArr.findIndex(v=>!v);
    const daysOut=Math.round((pd(bk.startDate)-today)/DAY_MS);
    const daysLabel=daysOut===0?'Today':daysOut<0?`${Math.abs(daysOut)}d ago`:`${daysOut}d away`;
    const {charged,totalPaid,balance}=calcBkBalance(bk);
    const balBadge=balance>0?`<span class="pipe-bal-badge">${fmt$(balance)} due</span>`:totalPaid>0||charged>0?`<span style="font-size:10.5px;font-weight:700;color:#15803d;background:#dcfce7;border:1px solid #86efac;border-radius:5px;padding:1px 7px">✓ Paid</span>`:'';
    const _tdCard=!bk.teacherDiscountDisabled?calcTeacherDiscount(bk,AppData.regs.filter(r=>r.bookingId===bk.id)):null;
    const discCardBadge=_tdCard&&_tdCard.tiers.some(t=>t.earned)?`<span title="Teacher discount earned: $${_tdCard.totalCredit.toLocaleString()} credit" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;background:#dcfce7;border:1.5px solid #86efac;color:#15803d;white-space:nowrap">★ $${_tdCard.totalCredit.toLocaleString()} teacher credit</span>`:(_tdCard&&_tdCard.tiers[0]&&!_tdCard.tiers[0].earned&&_tdCard.paidGuests>0)?`<span title="${_tdCard.paidGuests}/${_tdCard.tiers[0].threshold} guests toward teacher discount" style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:5px;background:#f0fdf4;border:1px solid #bbf7d0;color:#16a34a;white-space:nowrap">${_tdCard.paidGuests}/${_tdCard.tiers[0].threshold} → discount</span>`:'';
    const guestCount=registeredCount(bk.id);
    const nights=getNights(bk);
    const roomsBlocked=(bk.blockedRooms||[]).length;
    const roomsAssigned=AppData.regs.filter(r=>r.bookingId===bk.id&&r.room&&!r.isTeacherRoom).length;
    // Potential revenue = sum of all blocked rooms at single-occ peak rate × nights × 1.16 tax
    let potential=0;
    (bk.blockedRooms||[]).forEach(room=>{
      const rNorm=(room||'').trim().toLowerCase();
      const rt2=AppData.roomTypes.find(t=>(t.rooms||[]).some(r=>r.trim().toLowerCase()===rNorm));
      if(rt2)potential+=rt2.price1*nights*1.16;
    });
    const revenueRow=`<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e8dfd4">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:5px">
        <span style="font-size:12.5px;color:#a89e94">Revenue:</span>
        <span style="font-size:13px;font-weight:700;color:#15803d">${fmt$(totalPaid)} paid</span>
        <span style="font-size:12.5px;color:#a89e94">of</span>
        <span style="font-size:13px;font-weight:600;color:#374151">${fmt$(charged)} charged</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#a89e94">Potential if full:</span>
        <span style="font-size:14.5px;font-weight:800;color:#15803d">${potential>0?fmt$(Math.round(potential)):'—'}</span>
        ${potential>0&&charged>0?`<span style="font-size:12px;color:#a89e94">(${fmt$(Math.round(potential-charged))} still to earn)</span>`:''}
      </div>
    </div>`;
    // Room type utilization chips — case-insensitive room lookup
    const rtMap={};let unmatchedRooms=0;
    (bk.blockedRooms||[]).forEach(room=>{
      const roomNorm=(room||'').trim().toLowerCase();
      const rt2=AppData.roomTypes.find(t=>(t.rooms||[]).some(r=>r.trim().toLowerCase()===roomNorm));
      if(!rt2){unmatchedRooms++;return;}
      if(!rtMap[rt2.id])rtMap[rt2.id]={rt:rt2,total:0,assigned:0};
      rtMap[rt2.id].total++;
    });
    AppData.regs.filter(r=>r.bookingId===bk.id&&!r.isTeacherRoom&&r.room).forEach(reg=>{
      if(rtMap[reg.roomTypeId])rtMap[reg.roomTypeId].assigned++;
    });
    const rtChips=Object.values(rtMap).filter(({rt:rt2})=>!VIRTUAL_GROUP_RT_IDS.has(rt2.id)&&!(DOUBLE_RT_IDS.has(rt2.id)&&!BED_RT_IDS.has(rt2.id))).map(({rt:rt2,total,assigned})=>{
      const remaining=total-assigned;
      let bg,clr,border,tip,dot='';
      if(remaining===0){
        // Sold out — red
        bg='#fef2f2';clr='#dc2626';border='#fca5a5';
        tip='Sold out — no rooms left to sell';dot='● ';
      } else if(assigned===0){
        // Nothing sold yet — always neutral regardless of total
        bg='#f5f1eb';clr='#8a7e74';border='#c8bfb5';
        tip='No bookings yet';
      } else if(remaining===1){
        // 1 left — dark orange
        bg='#fff3e0';clr='#c2410c';border='#fb923c';
        tip='1 room left to sell';
      } else if(remaining===2){
        // 2 left — light orange
        bg='#fff7ed';clr='#ea580c';border='#fed7aa';
        tip='2 rooms left to sell';
      } else {
        // 3+ remaining, some sold — neutral
        bg='#f5f1eb';clr='#5a5048';border='#c8bfb5';
        tip=`${assigned}/${total} booked · ${remaining} left`;
      }
      return`<span title="${tip}" style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;padding:2px 7px;border-radius:5px;border:1px solid ${border};background:${bg};color:${clr};white-space:nowrap">${dot}${rt2.name} <span style="opacity:.7">${assigned}/${total}</span></span>`;
    }).join('')+(unmatchedRooms>0?`<span title="Room numbers not matching any room type" style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:5px;border:1px solid #fca5a5;background:#fef2f2;color:#dc2626">${unmatchedRooms} unmatched</span>`:'')+(!roomsBlocked?`<span style="font-size:13px;color:#a89e94;font-style:italic">No rooms blocked yet</span>`:'');
    const rtRow=rtChips?`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px">${rtChips}</div>`:'';
    const dots=PIPELINE_STEPS.map((s,i)=>{
      const done=doneArr[i];
      const cls='pipe-dot'+(done?' done':'')+(s.manual?' manual':'');
      const lblCls='pipe-lbl'+(done?' done':'');
      const tick=done?'✓':'';
      const onclick=s.manual?`onclick="event.stopPropagation();dbTogglePipelineStep('${bk.id}','${s.id}')" title="${done?'Mark incomplete':'Mark done'}"`:'' ;
      const lines=s.label.split('\n');
      return`<div class="pipe-step">
        <div class="${cls}" ${onclick}>${tick}</div>
        <div class="${lblCls}">${lines[0]}${lines[1]?'<br>'+lines[1]:''}</div>
      </div>`;
    }).join('');
    const ovStyle=pal?`border-left:4px solid ${pal.border};`:'';
    const ovBanner=pal&&peers.length?`<div style="margin-bottom:10px"><button onclick="event.stopPropagation();openOvCalModal('${bk.id}')" style="cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${pal.chipText};padding:3px 9px;border-radius:5px;background:${pal.chip};border:1px solid ${pal.chipBorder};font-family:'Jost',sans-serif">⚡ ${peers.length} retreat${peers.length>1?'s':''} overlap${peers.length===1?'s':''} ↗</button></div>`:'';
    return`<div class="pipe-card${balance>0?' has-balance':''}" style="${ovStyle}">
      ${ovBanner}
      <div class="pipe-hdr">
        <div style="cursor:pointer;flex:1" onclick="openVenEdit('${bk.id}')">
          <div class="pipe-name">${bk.leaderName||bk.retreatName}</div>
          <div class="pipe-sub">${bk.retreatName&&bk.leaderName?bk.retreatName+' · ':''}${bk.row} · ${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}</div>
        </div>
        <div class="pipe-right" style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            <span class="pipe-pct">${daysLabel}</span>
            ${balBadge}
            ${discCardBadge}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
            <button onclick="event.stopPropagation();dbOpenRoomCal('${bk.id}')" title="View Room Calendar — 6 days before/after" style="font-size:13px;font-weight:700;padding:4px 10px;border:1.5px solid #6b7280;border-radius:7px;background:#fff;color:#6b7280;cursor:pointer;white-space:nowrap;font-family:'Jost',sans-serif" onmouseover="this.style.background='#6b7280';this.style.color='#fff'" onmouseout="this.style.background='#fff';this.style.color='#6b7280'">📅</button>
            <button onclick="openVenEdit('${bk.id}')" style="font-size:11px;font-weight:700;padding:4px 12px;border:1.5px solid #6b7280;border-radius:7px;background:#fff;color:#6b7280;cursor:pointer;white-space:nowrap;font-family:'Jost',sans-serif;letter-spacing:.2px" onmouseover="this.style.background='#6b7280';this.style.color='#fff'" onmouseout="this.style.background='#fff';this.style.color='#6b7280'">Admin →</button>
            <button onclick="openTeacherPortal('${bk.id}')" style="font-size:11px;font-weight:700;padding:4px 12px;border:1.5px solid #0e9494;border-radius:7px;background:#fff;color:#0e9494;cursor:pointer;white-space:nowrap;font-family:'Jost',sans-serif;letter-spacing:.2px" onmouseover="this.style.background='#0e9494';this.style.color='#fff'" onmouseout="this.style.background='#fff';this.style.color='#0e9494'">Teacher Portal →</button>
          </div>
        </div>
      </div>
      <div class="pipe-track">
        <div class="pipe-line-wrap"><div class="pipe-line-fill" style="width:${fillPct.toFixed(1)}%"></div></div>
        <div class="pipe-steps">${dots}</div>
      </div>
      ${revenueRow}
      ${rtRow}
      ${bk.depositInvoiceSentAt&&!doneArr[PIPELINE_STEPS.findIndex(s=>s.id==='depositPaid')]?`<div style="margin-top:8px;padding:6px 10px;background:#f0fdf4;border:1px solid #86efac;border-radius:7px;font-size:11.5px;color:#15803d;display:flex;align-items:center;gap:6px">✉ Deposit invoice sent ${new Date(bk.depositInvoiceSentAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} · awaiting payment</div>`:''}
    </div>`;
  };
  // Grouped by month (each its own collapsed-by-default mini-accordion) rather
  // than dumping every retreat's card on the page at once when the section
  // opens — with 90+ active retreats that was an unusable wall of cards.
  const monthGroups=new Map();
  retreats.forEach(bk=>{
    const mk=(bk.startDate||'').slice(0,7); // YYYY-MM
    if(!monthGroups.has(mk))monthGroups.set(mk,[]);
    monthGroups.get(mk).push(bk);
  });
  const MON_FULL=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const cards=[...monthGroups.keys()].sort().map(mk=>{
    const [y,m]=mk.split('-');
    const label=`${MON_FULL[parseInt(m,10)-1]||mk} ${y}`;
    const group=monthGroups.get(mk);
    const key='retreatPipelineMonth_'+mk;
    if(!(key in _dbAccOpen))_dbAccOpen[key]=false;
    const open=_dbAccOpen[key];
    return`<div style="margin-bottom:10px;border:1px solid #e0d8cc;border-radius:10px;overflow:hidden;background:#fff">
      <div style="padding:8px 14px;background:#faf7f2;display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="dbToggleAccordion('${key}')">
        <span style="font-size:12.5px;font-weight:700;color:#5a5048">${label}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;color:#a89e94">${group.length} retreat${group.length!==1?'s':''}</span>
          <span id="dbAccChev-${key}" style="font-size:11px;color:#a89e94">${open?'▾':'▸'}</span>
        </div>
      </div>
      <div id="dbAcc-${key}" style="display:${open?'block':'none'};padding:12px">${group.map(buildCard).join('')}</div>
    </div>`;
  }).join('');
  if(!('retreatPipeline' in _dbAccOpen))_dbAccOpen.retreatPipeline=false;
  const pOpen=_dbAccOpen.retreatPipeline;
  return`<div class="db-section" style="border-color:#c8d8d4;margin-bottom:20px">
    <div class="db-sec-hdr" style="background:#f2f8f6;border-color:#c8d8d4;display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="dbToggleAccordion('retreatPipeline')">
      <span class="db-sec-title" style="color:#0e9494">🗓 Retreat Pipeline — ${retreats.length} retreat${retreats.length!==1?'s':''}</span>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:10.5px;color:#a89e94">Click dashed dots to mark manual steps · Click card to open</span>
        <span id="dbAccChev-retreatPipeline" style="font-size:12px;color:#0e9494">${pOpen?'▾':'▸'}</span>
      </div>
    </div>
    <div id="dbAcc-retreatPipeline" style="display:${pOpen?'block':'none'};padding:14px 18px;background:#f5f1eb">${cards}</div>
  </div>`;
}


// ===== BULK CHARGE =====
let _bcActiveBkId = null;

async function openBulkChargeModal() {
  // Reset results area
  const resultsEl = document.getElementById('bcResults');
  const resultsListEl = document.getElementById('bcResultsList');
  if (resultsEl) { resultsEl.style.display = 'none'; }
  if (resultsListEl) { resultsListEl.innerHTML = ''; }
  _bcActiveBkId = null; // reset retreat picker each time modal opens

  openModal('bulkChargeModal');

  // Load items into dropdown
  const sel = document.getElementById('bcItemSel');
  sel.innerHTML = '<option value="">Loading items…</option>';
  sel.disabled = true;
  try {
    const resp = await fetch(CLOUDBEDS_PROXY + '?action=getItems', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const data = await resp.json();
    sel.innerHTML = '<option value="">— Select item —</option>';
    if (data.items && data.items.length > 0) {
      // Group by categoryName
      const groups = {};
      for (const item of data.items) {
        const cat = item.categoryName || 'Other';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
      }
      for (const [cat, items] of Object.entries(groups)) {
        const grp = document.createElement('optgroup');
        grp.label = cat;
        for (const item of items) {
          const opt = document.createElement('option');
          opt.value = item.itemID;
          opt.textContent = (item.itemName || item.name || '(unnamed)') + ' — $' + (parseFloat(item.itemPrice || item.price || 0).toFixed(2));
          grp.appendChild(opt);
        }
        sel.appendChild(grp);
      }
    } else {
      sel.innerHTML = '<option value="">No items found</option>';
    }
  } catch (e) {
    sel.innerHTML = '<option value="">Error loading items</option>';
    console.error('[BulkCharge] getItems error:', e);
  }
  sel.disabled = false;

  // Populate guest list from currently selected retreat
  bcBuildGuestList();
}

function bcPickRetreat(id) {
  _bcActiveBkId = id || null;
  bcBuildGuestList();
}

function bcBuildGuestList() {
  const listEl = document.getElementById('bcGuestList');
  if (!listEl) return;

  // Resolve which booking to use: active modal pick > currently open retreat
  const bk = (regSelBk) || (_bcActiveBkId ? AppData.bookings.find(b => b.id === _bcActiveBkId) : null);

  if (!bk) {
    // No retreat active — show a retreat picker dropdown
    const upcoming = AppData.bookings
      .filter(b => b.status !== 'cancelled' && b.startDate)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    let opts = '<option value="">— Pick a retreat —</option>';
    for (const bkOpt of upcoming) {
      const label = (bkOpt.retreatName || bkOpt.row || bkOpt.id) + (bkOpt.startDate ? '  ·  ' + bkOpt.startDate : '');
      opts += `<option value="${escHtml(bkOpt.id)}">${escHtml(label)}</option>`;
    }
    listEl.innerHTML = `<div style="margin-bottom:10px">
      <label style="font-size:12px;font-weight:600;color:var(--dark);display:block;margin-bottom:4px">Retreat</label>
      <select onchange="bcPickRetreat(this.value)" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:'Jost',sans-serif;font-size:13px">${opts}</select>
    </div>
    <div style="font-size:13px;color:var(--muted);padding:4px 0">Select a retreat above to see its guests.</div>`;
    bcUpdateCount();
    return;
  }
  const cbIds = bk.cbReservationIds || {};
  const bkRegs = AppData.regs.filter(r => r.bookingId === bk.id);

  let html = '';
  for (const reg of bkRegs) {
    const room = reg.room;
    const guests = (reg.guests || []).filter(g => g.name);
    if (guests.length === 0) continue; // skip rooms with no named guests
    const cbResId = cbIds[room] || null;
    for (const g of guests) {
      if (!cbResId) {
        // Show greyed out with note
        html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:#f9fafb;border:1px solid var(--border);opacity:.5">
          <input type="checkbox" disabled style="width:15px;height:15px;flex-shrink:0">
          <span style="font-size:13px;color:var(--muted);flex:1"><b>${escHtml(g.name)}</b> — ${escHtml(room)}</span>
          <span style="font-size:11px;color:#9ca3af;font-style:italic">No CB reservation</span>
        </div>`;
      } else {
        html += `<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:#fff;border:1px solid var(--border);cursor:pointer" onmouseover="this.style.background='#f0f9ff'" onmouseout="this.style.background='#fff'">
          <input type="checkbox" class="bc-guest-chk" onchange="bcUpdateCount()"
            data-room="${escHtml(room)}" data-guest="${escHtml(g.name)}" data-cbresid="${escHtml(cbResId)}"
            style="width:15px;height:15px;flex-shrink:0;cursor:pointer">
          <span style="font-size:13px;color:var(--dark);flex:1"><b>${escHtml(g.name)}</b> — <span style="color:var(--muted)">${escHtml(room)}</span></span>
          <span class="bc-row-result" style="font-size:12px"></span>
        </label>`;
      }
    }
  }
  if (!html) {
    html = '<div style="font-size:13px;color:var(--muted);padding:8px 0">No guests with Cloudbeds reservations found in this retreat.</div>';
  }
  listEl.innerHTML = html;
  bcUpdateCount();
}

function bcUpdateCount() {
  const checked = document.querySelectorAll('#bcGuestList .bc-guest-chk:checked').length;
  const btn = document.getElementById('bcConfirmBtn');
  if (btn) btn.textContent = 'Post Charge to ' + checked + ' guest' + (checked === 1 ? '' : 's');
}

function bcSelectAll(state) {
  document.querySelectorAll('#bcGuestList .bc-guest-chk').forEach(chk => { chk.checked = state; });
  bcUpdateCount();
}

async function bcPostCharges() {
  const itemSel = document.getElementById('bcItemSel');
  const qtyInput = document.getElementById('bcQty');
  const confirmBtn = document.getElementById('bcConfirmBtn');
  const resultsEl = document.getElementById('bcResults');
  const resultsListEl = document.getElementById('bcResultsList');

  const itemID = itemSel ? itemSel.value : '';
  const itemQuantity = parseInt((qtyInput ? qtyInput.value : '') || '1', 10) || 1;

  if (!itemID) { alert('Please select an item first.'); return; }

  const checked = Array.from(document.querySelectorAll('#bcGuestList .bc-guest-chk:checked'));
  if (checked.length === 0) { alert('Please select at least one guest.'); return; }

  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Posting…';
  resultsListEl.innerHTML = '';
  resultsEl.style.display = 'block';

  for (const chk of checked) {
    const guestName = chk.dataset.guest;
    const room = chk.dataset.room;
    const cbResId = chk.dataset.cbresid;
    const rowResult = chk.closest('label') ? chk.closest('label').querySelector('.bc-row-result') : null;

    if (rowResult) rowResult.textContent = '…';

    try {
      const resp = await fetch(CLOUDBEDS_PROXY + '?action=postItem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationID: cbResId, itemID, itemQuantity }),
      });
      const data = await resp.json();
      if (data.success) {
        if (rowResult) { rowResult.textContent = '✓'; rowResult.style.color = '#16a34a'; }
        resultsListEl.innerHTML += `<div style="color:#16a34a">✓ <b>${escHtml(guestName)}</b> (${escHtml(room)})</div>`;
      } else {
        const msg = data.message || data.error || 'Unknown error';
        if (rowResult) { rowResult.textContent = '✗'; rowResult.style.color = '#dc2626'; }
        resultsListEl.innerHTML += `<div style="color:#dc2626">✗ <b>${escHtml(guestName)}</b> (${escHtml(room)}) — ${escHtml(msg)}</div>`;
      }
    } catch (e) {
      if (rowResult) { rowResult.textContent = '✗'; rowResult.style.color = '#dc2626'; }
      resultsListEl.innerHTML += `<div style="color:#dc2626">✗ <b>${escHtml(guestName)}</b> (${escHtml(room)}) — ${escHtml(e.message)}</div>`;
    }
  }

  confirmBtn.disabled = false;
  bcUpdateCount();
}


// ===== END BULK CHARGE =====
