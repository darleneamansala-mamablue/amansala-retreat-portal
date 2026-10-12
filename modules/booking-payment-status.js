// ===== booking-payment-status.js — color-codes room list rows by how the guest paid on the retreat booking page =====
// Loaded as a classic script AFTER teacher-portal.js; shares global scope. Standalone: no other module is edited. Admin only
// (teachers never see it).
// For guests who booked through the guest booking page (retreat-booking.html), their room's rows in Teacher Reg get:
//   amber  "50% paid · $X due <date>"   — paid half; the balance is scheduled to be charged automatically
//   green  "Paid in full"               — paid everything at booking, or the balance has been charged
//   red    "Balance charge failed"      — the automatic charge failed twice; contact the guest
//   gray   "Balance cancelled"          — staff cancelled the automatic charge
// Rooms that did not come through the page are left exactly as they are. Data: app_store retreat_booking_orders and
// retreat_balance_schedule (written by rb-fulfil.js / rb-charge-balances.js), refreshed at most once a minute.

const BPS_STYLES={
  half:{bg:'#fef3c7',border:'#d97706',txt:'#92400e'},
  full:{bg:'#dcfce7',border:'#16a34a',txt:'#14532d'},
  failed:{bg:'#fee2e2',border:'#dc2626',txt:'#7f1d1d'},
  cancelled:{bg:'#f3f4f6',border:'#9ca3af',txt:'#374151'}
};
let _bps={orders:{},sched:[],at:0,busy:false};

function bpsIsTeacher(){try{return !!(typeof IS_TEACHER_MODE!=='undefined'&&IS_TEACHER_MODE&&!document.body.classList.contains('admin-preview'));}catch(e){return false;}}
async function bpsLoad(){
  if(_bps.busy||(Date.now()-_bps.at<60000))return false;
  _bps.busy=true;
  try{
    const o=await db.from('app_store').select('value').eq('key','retreat_booking_orders').maybeSingle();
    const s=await db.from('app_store').select('value').eq('key','retreat_balance_schedule').maybeSingle();
    const orders=(o.data&&o.data.value)||{},sched=(s.data&&s.data.value)||[];
    const changed=JSON.stringify(orders)!==JSON.stringify(_bps.orders)||JSON.stringify(sched)!==JSON.stringify(_bps.sched);
    _bps.orders=orders;_bps.sched=sched;_bps.at=Date.now();_bps.busy=false;
    return changed;
  }catch(e){_bps.busy=false;_bps.at=Date.now();return false;}
}
function bpsMoney(n){return Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function bpsFmt(d){try{return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});}catch(e){return d;}}
// state of one room of the selected retreat, or null when it was not booked through the page
function bpsState(bkId,room){
  const orders=Object.values(_bps.orders).filter(x=>x.bookingId===bkId&&(x.units||[]).includes(room)&&(x.status==='placed'||x.status==='needs_attention'));
  if(!orders.length)return null;
  const od=orders.sort((a,b)=>(b.at||'').localeCompare(a.at||''))[0];
  if(!(Number(od.balance)>0))return {k:'full',label:'Paid in full'};
  const it=_bps.sched.find(x=>x.piId===od.piId);
  if(!it)return {k:'half',label:`50% paid · $${bpsMoney(od.balance)} due ${bpsFmt(od.balanceDate)}`};
  if(it.status==='paid')return {k:'full',label:'Paid in full'};
  if(it.status==='failed')return {k:'failed',label:'Balance charge failed'};
  if(it.status==='cancelled')return {k:'cancelled',label:'Balance charge cancelled'};
  return {k:'half',label:`50% paid · $${bpsMoney(it.amount)} due ${bpsFmt(it.dueDate)}`};
}
function bpsApply(){
  if(bpsIsTeacher()||typeof regSelBk==='undefined'||!regSelBk)return;
  document.querySelectorAll('[id^="rtb_"] tr[data-room]').forEach(tr=>{
    tr.querySelector('.bps-badge')?.remove();
    tr.style.removeProperty('background');tr.style.removeProperty('box-shadow');
    const st=bpsState(regSelBk.id,tr.dataset.room);if(!st)return;
    const c=BPS_STYLES[st.k];
    tr.style.background=c.bg;tr.style.boxShadow=`inset 4px 0 0 ${c.border}`;
    const nameTd=tr.querySelector('.r-guest')||tr.querySelector('td:nth-child(3)');
    if(nameTd){
      const b=document.createElement('span');b.className='bps-badge';b.textContent=st.label;
      b.style.cssText=`display:inline-block;margin-left:8px;padding:1px 7px;border-radius:8px;font-size:10.5px;font-weight:700;background:#fff;color:${c.txt};border:1px solid ${c.border};white-space:nowrap`;
      nameTd.appendChild(b);
    }
  });
}
(function(){
  const prev=regRender;
  regRender=function(){
    const r=prev.apply(this,arguments);
    try{bpsApply();bpsLoad().then(ch=>{if(ch)bpsApply();});}catch(e){}
    return r;
  };
})();
