// ===== booking-page-checks.js — "Booking checks" card on the Dashboard =====
// Loaded as a classic script AFTER booking-page-dashboard.js; shares global scope. Standalone: bpdRender is wrapped, not edited.
// Lists EVERY guest booking-page order (the payments card only shows the latest 8) so staff can tick, per booking:
//   Seen (we looked at it) · Checked (payment/booking verified) · Room OK (we confirmed they are in the right room) + a note.
// Each tick records who and when. Data: app_store key retreat_booking_checks = { [piId]: { seen, checked, roomOk, note } },
// where seen/checked/roomOk are { by, at } or absent. Never touches retreat_booking_orders or the balance schedule.
// Each save re-reads the key and merges ONLY the one booking, so two people ticking different bookings don't overwrite each other.

let _bpc={checks:{},at:0,busy:false,filter:'todo',open:true};
const BPC_KEY='retreat_booking_checks';
const BPC_FIELDS=[['seen','Seen'],['checked','Checked'],['roomOk','Room OK']];
function bpcWho(){try{return (document.getElementById('staffBadgeName')?.textContent||'').trim()||'Staff';}catch(e){return 'Staff';}}
function bpcDay(iso){try{return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'});}catch(e){return '';}}
async function bpcLoad(){
  if(_bpc.busy||Date.now()-_bpc.at<60000)return false;
  _bpc.busy=true;
  try{
    const r=await db.from('app_store').select('value').eq('key',BPC_KEY).maybeSingle();
    const checks=(r.data&&r.data.value)||{};
    const changed=JSON.stringify(checks)!==JSON.stringify(_bpc.checks);
    _bpc.checks=checks;_bpc.at=Date.now();_bpc.busy=false;return changed;
  }catch(e){_bpc.busy=false;_bpc.at=Date.now();return false;}
}
// Re-reads the live blob, applies one change to one booking, writes it back.
async function bpcSave(piId,mutate){
  try{
    const r=await db.from('app_store').select('value').eq('key',BPC_KEY).maybeSingle();
    const all=(r.data&&r.data.value)||{};
    const cur={...(all[piId]||{})};
    mutate(cur);
    all[piId]=cur;
    const w=await db.from('app_store').upsert({key:BPC_KEY,value:all,updated_at:new Date().toISOString()});
    if(w&&w.error)throw w.error;
    _bpc.checks=all;_bpc.at=Date.now();
  }catch(e){showToast('Could not save the check — try again ('+(e.message||e)+')');}
  bpcRender();
}
function bpcToggle(piId,field){
  bpcSave(piId,cur=>{if(cur[field])delete cur[field];else cur[field]={by:bpcWho(),at:new Date().toISOString()};});
}
function bpcNote(piId,val){
  bpcSave(piId,cur=>{const v=String(val||'').trim();if(v)cur.note=v;else delete cur.note;});
}
function bpcSetFilter(f){_bpc.filter=f;bpcRender();}
function bpcToggleOpen(){_bpc.open=!_bpc.open;bpcRender();}
function bpcIsFull(o){
  const it=(_bpd.sched||[]).find(x=>x.piId===o.piId);
  return !(Number(o.balance)>0)||(it&&it.status==='paid');
}
function bpcRender(){
  const host=document.getElementById('dbContent');if(!host||bpdTeacher())return;
  host.querySelector('.bpc-card')?.remove();
  const orders=Object.values(_bpd.orders||{}).filter(o=>o&&o.bookingId&&o.piId).sort((a,b)=>(b.at||'').localeCompare(a.at||''));
  if(!orders.length)return;
  const done=o=>{const c=_bpc.checks[o.piId]||{};return c.seen&&c.checked&&c.roomOk;};
  const todo=orders.filter(o=>!done(o));
  let list=orders;
  if(_bpc.filter==='todo')list=todo;
  else if(_bpc.filter==='full')list=orders.filter(bpcIsFull);
  const pill=(f,txt)=>`<button class="btn ${_bpc.filter===f?'btn-primary':'btn-secondary'}" style="padding:3px 10px;font-size:11.5px" onclick="bpcSetFilter('${f}')">${txt}</button>`;
  let html=`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;cursor:pointer" onclick="bpcToggleOpen()"><b style="font-size:15px;flex:1">✅ Booking checks</b><span style="font-size:11.5px;color:${todo.length?'#b45309':'#15803d'};font-weight:700">${todo.length?todo.length+' still to check':'All checked'}</span><span style="font-size:11.5px;color:#7a6f64">${orders.length} booking${orders.length===1?'':'s'} ${_bpc.open?'▲':'▼'}</span></div>`;
  if(_bpc.open){
    html+=`<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 4px">${pill('todo','Still to check')}${pill('full','Paid in full')}${pill('all','All')}</div>`;
    if(!list.length)html+=`<div style="font-size:13px;color:#7a6f64;padding:8px 0">Nothing here.</div>`;
    list.forEach(o=>{
      const c=_bpc.checks[o.piId]||{};
      const full=bpcIsFull(o);
      const chip=full?`<span style="padding:1px 8px;border-radius:9px;font-size:10.5px;font-weight:700;background:#dcfce7;color:#14532d;border:1px solid #16a34a;white-space:nowrap">Paid in full</span>`
        :`<span style="padding:1px 8px;border-radius:9px;font-size:10.5px;font-weight:700;background:#fef3c7;color:#92400e;border:1px solid #d97706;white-space:nowrap">50% paid</span>`;
      const boxes=BPC_FIELDS.map(([f,lbl])=>{
        const v=c[f];
        return `<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;white-space:nowrap" title="${v?bpdEsc(v.by)+' · '+bpcDay(v.at):''}"><input type="checkbox" ${v?'checked':''} onchange="bpcToggle('${bpdEsc(o.piId)}','${f}')"><span style="font-weight:${v?'700':'500'};color:${v?'#14532d':'#2d2520'}">${lbl}</span>${v?`<span style="font-size:10.5px;color:#7a6f64">${bpdEsc(v.by)}, ${bpcDay(v.at)}</span>`:''}</label>`;
      }).join('');
      html+=`<div style="padding:8px 0;border-top:1px solid #f1ede5;${done(o)?'background:#f7fbf7':''}">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12.5px">${chip}<b>${bpdEsc(o.name||'')}</b><span style="color:#5a5048">${bpdEsc(bpdRetreatName(o.bookingId))} · paid ${bpdMoney(o.paidNow||o.total)}${(o.units||[]).length?' · Room '+bpdEsc(o.units.join(', ')):''}</span>${o.recordUrl?`<a href="${bpdEsc(o.recordUrl)}" target="_blank" rel="noopener" style="margin-left:auto;color:#2d6a6a;font-weight:700">Booking record (PDF)</a>`:''}</div>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:6px">${boxes}<input type="text" value="${bpdEsc(c.note||'')}" placeholder="Note, e.g. matches Stripe, room confirmed" onchange="bpcNote('${bpdEsc(o.piId)}',this.value)" style="flex:1;min-width:200px;padding:5px 9px;border:1.5px solid #d6cfc4;border-radius:7px;font-family:'Jost',sans-serif;font-size:12.5px"></div>
      </div>`;
    });
  }
  const card=document.createElement('div');card.className='bpc-card';
  card.style.cssText='background:#fff;border:1.5px solid #e8dfd4;border-radius:14px;padding:16px 18px;margin:0 0 16px';
  card.innerHTML=html;
  const pay=host.querySelector('.bpd-card');
  if(pay)pay.insertAdjacentElement('afterend',card);else host.insertBefore(card,host.firstChild);
}
(function(){
  const prev=bpdRender;
  bpdRender=function(){
    const r=prev.apply(this,arguments);
    try{bpcRender();bpcLoad().then(ch=>{if(ch)bpcRender();});}catch(e){}
    return r;
  };
})();
