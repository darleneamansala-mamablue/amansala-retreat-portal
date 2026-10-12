// ===== retreat-booking-setup.js — set up and switch on a retreat's guest booking page =====
// Loaded as a classic script AFTER teacher-portal.js; shares global scope. Standalone: no other module is edited.
// Teacher Reg → Actions → "🌐 Guest booking page" opens this screen for the selected retreat. Everything is saved to Supabase
// app_store key 'retreat_booking_config' = { <bookingId>: cfg } and read by the server functions
// (retreat-booking-info / -intent, see netlify/functions/rb-lib.js). The guest page is retreat-booking.html?r=<bookingId>
// (also /<teacher>/book). The page stays OFF until "Open for guests" is ticked.
// Guests who book are written into the retreat's room list (free rooms/beds of the room block), so rooms must be blocked
// for the retreat first (Add More Rooms); the screen shows how many are free per room type.

const RBS_KEY='retreat_booking_config', RBS_ORDERS='retreat_booking_orders', RBS_SPA='retreat_spa_requests';
const RBS_DEFAULT_POLICY='More than 6 weeks prior to the start date: two (2) nights will be charged according to the occupancy type booked.\n6 weeks or less prior to the start date: non-refundable and non-transferable.';
const RBS_DEFAULTS={
  taxFeePct:24,gratuityPerNight:30,teachingFee:{on:false,amountPP:0},
  includes:['Accommodations for your full stay','All meals, with the exception of one offsite dinner','Group Salsa dance class','Cooking demonstration'],
  notIncluded:'Not included: the one offsite dinner, tours and spa treatments.',
  notifyEmail:'retreats@amansala.com',
  rooms:[
    {rtId:'rt1',kind:'king',label:'Beachfront King',soloRate:575,shareRate:360,desc:'An ocean-facing king room steps from the sand, with morning light and a private terrace.',imageUrl:'/images/rooms/beachfront-deluxe.jpg',tags:['King bed','Ocean view','Terrace']},
    {rtId:'rt2',kind:'king',label:'Superior King',soloRate:475,shareRate:305,desc:'A spacious king room on the garden side with a generous bathroom and a quiet sitting corner.',imageUrl:'/images/rooms/superior.jpg',tags:['King bed','Garden side','Sitting area']},
    {rtId:'rt3',kind:'king',label:'Garden Plus King',soloRate:390,shareRate:260,desc:'A larger garden room with its own terrace, surrounded by greenery and shade.',imageUrl:'/images/rooms/garden-plus.jpg',tags:['King bed','Terrace','Garden']},
    {rtId:'rt4',kind:'king',label:'Garden King',soloRate:345,shareRate:240,desc:'A calm garden room with a king bed, the simplest way to stay close to everything.',imageUrl:'/images/rooms/garden-king.jpg',tags:['King bed','Garden','Quiet']},
    {rtId:'rt5',kind:'single',label:'Garden Basic (private)',soloRate:295,desc:'A simple private room for one guest.',imageUrl:'/images/rooms/super-simple.jpg',tags:['Private','One guest']},
    {rtId:'bd1',kind:'twin',label:'Double Beachview',shareRate:335,maxBeds:2,desc:'A bright room with two separate beds and ocean views. Book one bed to be matched with another guest, or both beds to share with a friend.',imageUrl:'/images/rooms/beachview-double.jpg',tags:['Two beds','Beach view','Private bathroom']},
    {rtId:'bd2',kind:'twin',label:'Double Room',shareRate:275,maxBeds:2,desc:'A bright room with two separate beds. Book one bed to be matched with another guest, or both beds to share with a friend.',imageUrl:'/images/rooms/garden-double.jpg',tags:['Two beds','Private bathroom','Garden side']},
    {rtId:'bd3',kind:'twin',label:'Triple Room',shareRate:235,maxBeds:3,desc:'A roomy room with three separate beds, ideal for a group of friends. Book one bed, two or all three.',imageUrl:'/images/rooms/family-room.jpg',tags:['Three beds','Private bathroom','Garden side']}
  ],
  services:[
    {id:'massage',name:'Massage',desc:'A restorative massage with one of our therapists. Choose one hour or ninety minutes.',opts:[{m:60,p:95},{m:90,p:145}]},
    {id:'mayan',name:'Mayan Healing Massage',desc:'A traditional Mayan healing massage using warm oils and ancestral technique.',opts:[{m:60,p:111},{m:90,p:165}]},
    {id:'tarot',name:'Tarot Card Reading',desc:'A one hour reading with Mama Blue to bring clarity to the questions you are carrying.',opts:[{m:60,p:95}]}
  ]
};
let _rbsBk=null,_rbsCfg=null;

function rbsEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function rbsLink(bk){
  try{const slug=(typeof computeShortSlug==='function')?computeShortSlug(bk.id):'';if(slug)return `${location.origin}/${slug}/book`;}catch(e){}
  return `${location.origin}/retreat-booking.html?r=${encodeURIComponent(bk.id)}`;
}
async function rbsLoadAll(){
  const {data}=await db.from('app_store').select('value').eq('key',RBS_KEY).maybeSingle();
  return (data&&data.value&&typeof data.value==='object')?data.value:{};
}
function rbsFreeCount(bk,rtId){
  const rt=AppData.roomTypes.find(t=>t.id===rtId);if(!rt)return {blocked:0,held:0,free:0};
  const blocked=(bk.blockedRooms||[]).filter(r=>(rt.rooms||[]).includes(r));
  // the guest page only offers rooms Cloudbeds holds for the retreat (each has a placeholder reservation there)
  const cb=bk.cbReservationIds||{};
  const held=blocked.filter(r=>cb[r]);
  const taken=new Set(AppData.regs.filter(r=>r.bookingId===bk.id&&!r.cancelled&&(r.guests||[]).some(g=>g.name)).map(r=>r.room));
  return {blocked:blocked.length,held:held.length,free:held.filter(r=>!taken.has(r)).length};
}
async function rbsOpen(){
  const bk=(typeof regSelBk!=='undefined')?regSelBk:null;
  if(!bk){showToast('Select a retreat first');return;}
  _rbsBk=bk;
  let all={};try{all=await rbsLoadAll();}catch(e){}
  const saved=all[bk.id];
  _rbsCfg=saved?JSON.parse(JSON.stringify(saved)):Object.assign({enabled:false,title:bk.retreatName||bk.leaderName||'',bannerUrl:'',policy:RBS_DEFAULT_POLICY},JSON.parse(JSON.stringify(RBS_DEFAULTS)));
  let orders={},spa=[];
  try{
    const o=await db.from('app_store').select('value').eq('key',RBS_ORDERS).maybeSingle();orders=(o.data&&o.data.value)||{};
    const s=await db.from('app_store').select('value').eq('key',RBS_SPA).maybeSingle();spa=(s.data&&s.data.value)||[];
  }catch(e){}
  const mine=Object.values(orders).filter(x=>x.bookingId===bk.id);
  const mySpa=spa.filter(x=>x.bookingId===bk.id);
  rbsRender(mine,mySpa);
}
function rbsRender(orders,spa){
  document.getElementById('rbsOv')?.remove();
  const c=_rbsCfg,bk=_rbsBk;
  const ov=document.createElement('div');ov.id='rbsOv';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  const inp='padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:inherit;font-size:13px';
  const roomRows=c.rooms.map((r,i)=>{
    const f=rbsFreeCount(bk,r.rtId);
    const rates=r.kind==='king'?`<input data-r="${i}" data-f="soloRate" type="number" value="${r.soloRate||''}" style="${inp};width:80px" title="One guest per night"> <input data-r="${i}" data-f="shareRate" type="number" value="${r.shareRate||''}" style="${inp};width:80px" title="Two guests, per person per night">`
      :r.kind==='twin'?`<input data-r="${i}" data-f="shareRate" type="number" value="${r.shareRate||''}" style="${inp};width:80px" title="Per bed per night">`
      :`<input data-r="${i}" data-f="soloRate" type="number" value="${r.soloRate||''}" style="${inp};width:80px" title="One guest per night">`;
    const lbl=r.kind==='king'?'solo · sharing pp':r.kind==='twin'?'per bed':'solo';
    return `<tr style="border-top:1px solid #e5e7eb"><td style="padding:6px 8px;font-weight:600;font-size:13px">${rbsEsc(r.label)}</td><td style="padding:6px 8px">${rates}<div style="font-size:10.5px;color:#7f8c9a">${lbl} · per night</div></td><td style="padding:6px 8px;font-size:12.5px;color:${f.free?'#15803d':'#b91c1c'};font-weight:700">${f.free} free · ${f.held} of ${f.blocked} blocked rooms held in Cloudbeds</td></tr>`;
  }).join('');
  const svcRows=c.services.map((s,i)=>`<tr style="border-top:1px solid #e5e7eb"><td style="padding:6px 8px;font-weight:600;font-size:13px">${rbsEsc(s.name)}</td>${[60,90].map(m=>{const o=(s.opts||[]).find(x=>x.m===m);return `<td style="padding:6px 8px">${(m===60||o)?`<input data-s="${i}" data-m="${m}" type="number" value="${o?o.p:''}" style="${inp};width:80px" placeholder="—">`:`<input data-s="${i}" data-m="${m}" type="number" value="" style="${inp};width:80px" placeholder="—">`}<span style="font-size:10.5px;color:#7f8c9a"> ${m} min</span></td>`}).join('')}</tr>`).join('');
  const orderRows=orders.length?orders.sort((a,b)=>(b.at||'').localeCompare(a.at||'')).map(o=>`<div style="font-size:12.5px;padding:4px 0;border-top:1px solid #f1f5f9"><b>${rbsEsc(o.name||'')}</b> · ${rbsEsc(o.email||'')} · $${Number(o.total||0).toLocaleString()} · <span style="font-weight:700;color:${o.status==='placed'?'#15803d':'#b91c1c'}">${rbsEsc(o.status)}</span>${o.units&&o.units.length?' · '+rbsEsc(o.units.join(', ')):''}</div>`).join(''):'<div style="font-size:12.5px;color:#7f8c9a">No bookings yet.</div>';
  const spaRows=spa.length?spa.map(s=>`<div style="font-size:12.5px;padding:4px 0;border-top:1px solid #f1f5f9"><b>${rbsEsc(s.name)}</b> · ${rbsEsc(s.phone||'')} · ${(s.items||[]).map(i=>rbsEsc(i.name)+' '+i.minutes+' min'+(i.qty>1?' ×'+i.qty:'')).join(', ')}</div>`).join(''):'<div style="font-size:12.5px;color:#7f8c9a">No spa pre-bookings yet.</div>';
  ov.innerHTML=`<div style="background:#fff;border-radius:12px;width:min(820px,100%);max-height:92vh;overflow-y:auto;padding:20px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><b style="font-size:17px;flex:1">Guest booking page · ${rbsEsc(bk.leaderName||bk.retreatName||'')}</b><button class="btn btn-secondary" onclick="document.getElementById('rbsOv').remove()">Close</button></div>
    <div style="font-size:12.5px;color:#5a5048;margin-bottom:12px">Guests pick a room, add spa services, agree to the cancellation policy and pay by card. They are placed in this retreat's room list. Block rooms for the retreat first (Add More Rooms) and push the retreat to Cloudbeds: only rooms Cloudbeds holds are offered, so the page always matches the hotel inventory.</div>
    <label style="display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:12px"><input type="checkbox" id="rbsEnabled" ${c.enabled?'checked':''}> Open for guests (the page shows "not open yet" until this is ticked)</label>
    <label style="display:flex;align-items:flex-start;gap:8px;font-weight:600;margin-bottom:12px;font-size:13px"><input type="checkbox" id="rbsLock" ${(c.lockRoomList!==false)?'checked':''} style="margin-top:3px"> <span>Only admin can edit the room list. Locks it for the teacher (they can see it but cannot add, edit or move guests), because Amansala collects the guests' payments. Stays locked until you untick this and save.</span></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <label style="font-size:12px;font-weight:600">Page title<input id="rbsTitle" value="${rbsEsc(c.title||'')}" style="${inp};width:100%;display:block"></label>
      <label style="font-size:12px;font-weight:600">Banner image (file in /images/retreats/, or full web address; empty = just the title)<input id="rbsBanner" value="${rbsEsc(c.bannerUrl||'')}" style="${inp};width:100%;display:block"></label>
      <label style="font-size:12px;font-weight:600">Taxes &amp; fees shown as one line (%)<input id="rbsTax" type="number" value="${c.taxFeePct}" style="${inp};width:100%;display:block"></label>
      <label style="font-size:12px;font-weight:600">Gratuity per person per night ($)<input id="rbsGrat" type="number" value="${c.gratuityPerNight}" style="${inp};width:100%;display:block"></label>
    </div>
    <div style="margin-bottom:12px;padding:10px 12px;background:#f5f3ee;border-radius:8px;display:flex;gap:14px;flex-wrap:wrap;align-items:center">
      <b style="font-size:13px">Teaching fee:</b>
      <label><input type="radio" name="rbsTf" id="rbsTfNo" ${c.teachingFee&&c.teachingFee.on?'':'checked'}> No teaching fee (billed separately)</label>
      <label><input type="radio" name="rbsTf" id="rbsTfYes" ${c.teachingFee&&c.teachingFee.on?'checked':''}> Teaching fee $<input id="rbsTfAmt" type="number" value="${(c.teachingFee&&c.teachingFee.amountPP)||0}" style="${inp};width:90px"> per person (added before the taxes &amp; fees)</label>
    </div>
    <b style="font-size:13px">Rooms and rates</b>
    <table style="width:100%;border-collapse:collapse;margin:4px 0 12px">${roomRows}</table>
    <b style="font-size:13px">Spa services (price per session)</b>
    <table style="width:100%;border-collapse:collapse;margin:4px 0 12px">${svcRows}</table>
    <label style="font-size:12px;font-weight:600">Cancellation policy (shown on the page and ticked before paying)<textarea id="rbsPolicy" rows="3" style="${inp};width:100%;display:block">${rbsEsc(c.policy||RBS_DEFAULT_POLICY)}</textarea></label>
    <label style="font-size:12px;font-weight:600;display:block;margin-top:8px">What's included (one per line)<textarea id="rbsIncl" rows="4" style="${inp};width:100%;display:block">${rbsEsc((c.includes||[]).join('\n'))}</textarea></label>
    <label style="font-size:12px;font-weight:600;display:block;margin-top:8px">What is not included<input id="rbsNot" value="${rbsEsc(c.notIncluded||'')}" style="${inp};width:100%;display:block"></label>
    <label style="font-size:12px;font-weight:600;display:block;margin-top:8px">Email for new-booking alerts<input id="rbsNotify" value="${rbsEsc(c.notifyEmail||'')}" style="${inp};width:100%;display:block"></label>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0">
      <button class="btn btn-primary" onclick="rbsSave()">Save</button>
      <button class="btn btn-secondary" onclick="rbsCopy()">Copy guest link</button>
      <button class="btn btn-secondary" onclick="window.open(rbsLink(_rbsBk),'_blank')">Open page</button>
    </div>
    <div style="font-size:11.5px;color:#7f8c9a;word-break:break-all;margin-bottom:10px">${rbsEsc(rbsLink(bk))}</div>
    <b style="font-size:13px">Bookings (${orders.length})</b>${orderRows}
    <div style="height:10px"></div><b style="font-size:13px">Spa pre-bookings to schedule (${spa.length})</b>${spaRows}
  </div>`;
  document.body.appendChild(ov);
}
function rbsCollect(){
  const c=_rbsCfg,g=id=>document.getElementById(id);
  c.enabled=g('rbsEnabled').checked;c.lockRoomList=g('rbsLock').checked;c.title=g('rbsTitle').value.trim();c.bannerUrl=g('rbsBanner').value.trim();
  c.taxFeePct=Number(g('rbsTax').value)||0;c.gratuityPerNight=Number(g('rbsGrat').value)||0;
  c.teachingFee={on:g('rbsTfYes').checked,amountPP:Number(g('rbsTfAmt').value)||0};
  document.querySelectorAll('#rbsOv input[data-r]').forEach(i=>{const r=c.rooms[+i.dataset.r];const v=i.value===''?0:Number(i.value);r[i.dataset.f]=v;});
  document.querySelectorAll('#rbsOv input[data-s]').forEach(i=>{
    const s=c.services[+i.dataset.s],m=+i.dataset.m;s.opts=(s.opts||[]).filter(o=>o.m!==m);
    if(i.value!==''&&Number(i.value)>0)s.opts.push({m,p:Number(i.value)});
    s.opts.sort((a,b)=>a.m-b.m);
  });
  c.services=c.services.filter(s=>s.opts.length);
  c.policy=g('rbsPolicy').value.trim()||RBS_DEFAULT_POLICY;
  c.includes=g('rbsIncl').value.split('\n').map(x=>x.trim()).filter(Boolean);
  c.notIncluded=g('rbsNot').value.trim();c.notifyEmail=g('rbsNotify').value.trim();
  // a room with no price is not offered
  c.rooms=c.rooms.filter(r=>r.kind==='twin'?r.shareRate>0:r.kind==='king'?(r.soloRate>0&&r.shareRate>0):r.soloRate>0);
  return c;
}
async function rbsSave(){
  try{
    const c=rbsCollect();
    const all=await rbsLoadAll();   // re-read so another retreat saved meanwhile is not overwritten
    all[_rbsBk.id]=c;
    const {error}=await db.from('app_store').upsert({key:RBS_KEY,value:all,updated_at:new Date().toISOString()});
    if(error)throw error;
    // room list is admin-only for a retreat where Amansala collects payments (same lock as Actions > Lock for Teacher)
    if(c.enabled||c.lockRoomList===false){const want=!!c.lockRoomList;if(!!_rbsBk.allLocked!==want){_rbsBk.allLocked=want;saveAll();try{regRender();}catch(e){}}}
    showToast(c.enabled?'Saved. The guest booking page is OPEN.':'Saved. The page is still closed to guests.');
    rbsOpen();
  }catch(e){showToast('Save failed: '+(e.message||e));}
}
function rbsCopy(){
  const l=rbsLink(_rbsBk);
  navigator.clipboard.writeText(l).then(()=>showToast('Guest link copied')).catch(()=>showToast('Link: '+l));
}
(function(){
  const prev=regBuildActionsMenu;
  regBuildActionsMenu=function(bk){
    prev.apply(this,arguments);
    const menu=document.getElementById('regActionsMenu');
    if(menu&&bk&&!(typeof IS_TEACHER_MODE!=='undefined'&&IS_TEACHER_MODE&&!document.body.classList.contains('admin-preview')))
      menu.insertAdjacentHTML('afterbegin',_regActionMenuItem('🌐 Guest booking page',"rbsOpen()"));
  };
})();
