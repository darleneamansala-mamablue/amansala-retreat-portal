// ===== booking-page-dashboard.js — "Guest booking page payments" card on the Dashboard =====
// Loaded as a classic script AFTER retreat-builder.js; shares global scope. Standalone: buildDashboard is wrapped, not edited.
// Shows, at the top of the Dashboard (admin only): money collected through the guest booking page, balances still to be charged
// automatically (with a total), balances that failed (red, action needed), balances due in the next 30 days, and the latest
// bookings with a 50% / Paid in full chip and a link to each booking record PDF. Data: app_store retreat_booking_orders and
// retreat_balance_schedule (written by rb-fulfil.js / rb-charge-balances.js), refreshed at most once a minute.

let _bpd={orders:{},sched:[],cfg:{},at:0,busy:false};
function bpdTeacher(){try{return !!(typeof IS_TEACHER_MODE!=='undefined'&&IS_TEACHER_MODE&&!document.body.classList.contains('admin-preview'));}catch(e){return false;}}
function bpdEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function bpdMoney(n){return '$'+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function bpdDay(d){try{return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}catch(e){return d||'';}}
async function bpdLoad(){
  if(_bpd.busy||Date.now()-_bpd.at<60000)return false;
  _bpd.busy=true;
  try{
    const o=await db.from('app_store').select('value').eq('key','retreat_booking_orders').maybeSingle();
    const s=await db.from('app_store').select('value').eq('key','retreat_balance_schedule').maybeSingle();
    const c=await db.from('app_store').select('value').eq('key','retreat_booking_config').maybeSingle();
    const orders=(o.data&&o.data.value)||{},sched=(s.data&&s.data.value)||[],cfg=(c.data&&c.data.value)||{};
    const changed=JSON.stringify(orders)!==JSON.stringify(_bpd.orders)||JSON.stringify(sched)!==JSON.stringify(_bpd.sched)||JSON.stringify(Object.keys(cfg).map(k=>[k,cfg[k].enabled]))!==JSON.stringify(Object.keys(_bpd.cfg).map(k=>[k,_bpd.cfg[k].enabled]));
    _bpd.orders=orders;_bpd.sched=sched;_bpd.cfg=cfg;_bpd.at=Date.now();_bpd.busy=false;return changed;
  }catch(e){_bpd.busy=false;_bpd.at=Date.now();return false;}
}
function bpdGuestLink(bkId){try{const slug=(typeof computeShortSlug==='function')?computeShortSlug(bkId):'';if(slug)return location.origin+'/'+slug+'/book';}catch(e){}return location.origin+'/retreat-booking.html?r='+encodeURIComponent(bkId);}
function bpdReviewLink(bkId){return location.origin+'/retreat-booking.html?r='+encodeURIComponent(bkId)+'&preview=1';}
function bpdCopy(txt,label){navigator.clipboard.writeText(txt).then(()=>showToast(label+' copied')).catch(()=>showToast(txt));}
function bpdSetup(bkId){openBookingFromNotif(bkId);setTimeout(()=>{if(typeof rbsOpen==='function')rbsOpen();},900);}
function bpdPages(){
  const ids=Object.keys(_bpd.cfg||{});
  let h=`<div style="margin:0 0 10px;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#7a6f64">Retreat booking pages</div>`;
  if(!ids.length)return h+`<div style="font-size:13px;color:#7a6f64;padding:2px 0 10px">No retreat has a booking page yet. Open a retreat in Teacher Reg and choose Actions → Guest booking page.</div>`;
  ids.forEach(id=>{
    const cfg=_bpd.cfg[id],name=bpdRetreatName(id)||cfg.title||id;
    const open=!!cfg.enabled;
    const g=bpdGuestLink(id),r=bpdReviewLink(id);
    h+=`<div style="padding:8px 0;border-top:1px solid #f1ede5"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><b style="font-size:13.5px">${bpdEsc(name)}</b><span style="display:inline-block;padding:1px 8px;border-radius:9px;font-size:10.5px;font-weight:700;background:${open?'#dcfce7':'#f3f4f6'};color:${open?'#14532d':'#374151'};border:1px solid ${open?'#16a34a':'#9ca3af'}">${open?'Open for booking':'Closed (not open yet)'}</span>
      <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-secondary" style="padding:3px 10px;font-size:11.5px" onclick="bpdCopy('${bpdEsc(g)}','Guest link')">Copy guest link</button><button class="btn btn-secondary" style="padding:3px 10px;font-size:11.5px" onclick="bpdCopy('${bpdEsc(r)}','Review link')">Copy review link</button><button class="btn btn-secondary" style="padding:3px 10px;font-size:11.5px" onclick="window.open('${bpdEsc(r)}','_blank')">View page</button><button class="btn btn-primary" style="padding:3px 10px;font-size:11.5px" onclick="bpdSetup('${bpdEsc(id)}')">Set up</button></span></div>
      <div style="font-size:11px;color:#7a6f64;word-break:break-all;margin-top:3px">Guest link: ${bpdEsc(g)}</div></div>`;
  });
  return h+`<div style="height:6px"></div>`;
}
function bpdRetreatName(bkId){const b=(AppData.bookings||[]).find(x=>x.id===bkId);return b?(b.leaderName||b.retreatName||''):'';}
function bpdRender(){
  const host=document.getElementById('dbContent');if(!host||bpdTeacher())return;
  host.querySelector('.bpd-card')?.remove();
  const orders=Object.values(_bpd.orders).filter(o=>o&&o.bookingId).sort((a,b)=>(b.at||'').localeCompare(a.at||''));
  const sched=_bpd.sched||[];
  const todayStr=new Date().toISOString().slice(0,10);
  const in30=new Date(Date.now()+30*864e5).toISOString().slice(0,10);
  const collected=orders.filter(o=>o.status==='placed'||o.status==='needs_attention').reduce((a,o)=>a+(Number(o.paidNow)||Number(o.total)||0),0)
    +sched.filter(x=>x.status==='paid').reduce((a,x)=>a+(Number(x.amount)||0),0);
  const pending=sched.filter(x=>x.status==='scheduled'||x.status==='retry');
  const pendingSum=pending.reduce((a,x)=>a+(Number(x.amount)||0),0);
  const failed=sched.filter(x=>x.status==='failed');
  const dueSoon=pending.filter(x=>x.dueDate<=in30).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const attention=orders.filter(o=>o.status==='needs_attention'||o.status==='error');
  const chip=(txt,bg,bd,c)=>`<span style="display:inline-block;padding:1px 8px;border-radius:9px;font-size:10.5px;font-weight:700;background:${bg};color:${c};border:1px solid ${bd};white-space:nowrap">${txt}</span>`;
  const row=(inner)=>`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 0;border-top:1px solid #f1ede5;font-size:12.5px">${inner}</div>`;
  const stat=(lbl,val,clr)=>`<div style="flex:1;min-width:150px;padding:10px 14px;background:#faf7f2;border-radius:10px"><div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#7a6f64">${lbl}</div><div style="font-size:20px;font-weight:800;color:${clr||'#2d2520'}">${val}</div></div>`;
  let html=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><b style="font-size:15px;flex:1">🌐 Guest booking page payments</b><span style="font-size:11.5px;color:#7a6f64">${orders.length} booking${orders.length===1?'':'s'}</span></div>`;
  html+=bpdPages();
  if(!orders.length&&!sched.length){
    html+=`<div style="font-size:13px;color:#7a6f64;padding:6px 0">No bookings through the guest booking page yet. They will show up here as soon as the first guest pays. Set a retreat up in Teacher Reg → Actions → Guest booking page.</div>`;
  }else{
    html+=`<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">${stat('Collected',bpdMoney(collected),'#15803d')}${stat('Balances to charge',bpdMoney(pendingSum),'#b45309')}${stat('Failed charges',String(failed.length),failed.length?'#b91c1c':'#2d2520')}</div>`;
    if(failed.length||attention.length){
      html+=`<div style="margin:6px 0 2px;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#b91c1c">Action needed</div>`;
      failed.forEach(x=>{html+=row(`${chip('Balance failed','#fee2e2','#dc2626','#7f1d1d')}<b>${bpdEsc(x.name)}</b><span>${bpdMoney(x.amount)} · ${bpdEsc(x.retreat||bpdRetreatName(x.bookingId))}</span><span style="color:#7f1d1d">${bpdEsc(x.lastError||'')}</span><a href="#" onclick="openBookingFromNotif('${bpdEsc(x.bookingId)}');return false" style="margin-left:auto;color:#2d6a6a;font-weight:700">Open retreat</a>`);});
      attention.forEach(o=>{html+=row(`${chip(o.status==='error'?'Paid, not recorded':'Paid, no room','#fee2e2','#dc2626','#7f1d1d')}<b>${bpdEsc(o.name||'')}</b><span>${bpdEsc(o.email||'')} · ${bpdEsc(bpdRetreatName(o.bookingId))}</span>${o.recordUrl?`<a href="${bpdEsc(o.recordUrl)}" target="_blank" rel="noopener" style="margin-left:auto;color:#2d6a6a;font-weight:700">Booking record</a>`:''}`);});
    }
    if(dueSoon.length){
      html+=`<div style="margin:8px 0 2px;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#92400e">Balances due in the next 30 days</div>`;
      dueSoon.forEach(x=>{html+=row(`${chip(x.dueDate<=todayStr?'Due now':'Due '+bpdDay(x.dueDate),'#fef3c7','#d97706','#92400e')}<b>${bpdEsc(x.name)}</b><span>${bpdMoney(x.amount)} · ${bpdEsc(x.retreat||bpdRetreatName(x.bookingId))}</span>`);});
    }
    html+=`<div style="margin:8px 0 2px;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#7a6f64">Latest bookings</div>`;
    orders.slice(0,8).forEach(o=>{
      const it=sched.find(x=>x.piId===o.piId);
      let st;
      if(!(Number(o.balance)>0)||(it&&it.status==='paid'))st=chip('Paid in full','#dcfce7','#16a34a','#14532d');
      else if(it&&it.status==='failed')st=chip('Balance failed','#fee2e2','#dc2626','#7f1d1d');
      else if(it&&it.status==='cancelled')st=chip('Balance cancelled','#f3f4f6','#9ca3af','#374151');
      else st=chip(`50% paid · ${bpdMoney(o.balance)} due ${bpdDay(o.balanceDate)}`,'#fef3c7','#d97706','#92400e');
      html+=row(`${st}<b>${bpdEsc(o.name||'')}</b><span style="color:#5a5048">${bpdEsc(bpdRetreatName(o.bookingId))} · paid ${bpdMoney(o.paidNow||o.total)}${(o.units||[]).length?' · '+bpdEsc(o.units.join(', ')):''}</span>${o.recordUrl?`<a href="${bpdEsc(o.recordUrl)}" target="_blank" rel="noopener" style="margin-left:auto;color:#2d6a6a;font-weight:700">Booking record (PDF)</a>`:''}`);
    });
  }
  const card=document.createElement('div');card.className='bpd-card';
  card.style.cssText='background:#fff;border:1.5px solid #e8dfd4;border-radius:14px;padding:16px 18px;margin:0 0 16px';
  card.innerHTML=html;
  host.insertBefore(card,host.firstChild);
}
(function(){
  const prev=buildDashboard;
  buildDashboard=function(){
    const r=prev.apply(this,arguments);
    try{bpdRender();bpdLoad().then(ch=>{if(ch)bpdRender();});}catch(e){}
    return r;
  };
})();
