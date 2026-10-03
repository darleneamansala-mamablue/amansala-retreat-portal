// ===== room-prompts.js — Teacher Room Prompts =====
// Loaded as a classic script; shares global scope with booking-hub.html.
// Self-contained module (Darlene 2026-10-03). Nothing here assigns a room: the
// teacher can only ASK, staff decide.
//
// Teacher side (My Room List page) — a notice box above the room list:
//   1. Shared-room notice: a double / triple / quad room that isn't full.
//      From 10 weeks before arrival; stronger wording from 6 weeks.
//   2. Two guests in a Beachfront King / Garden king who don't look male:
//      "share the bed, or two beds?" — from 10 weeks, and only when the
//      matching two-bed room (Beachview Double / Double) is actually free.
//   3. "Request more [room type]" when every blocked room of a type is filled
//      and more of that type are free.
// Staff side — requests show on the Dashboard notifications (Room Requests)
// with Approve / Decline.
//
// Storage: app_store, one key per retreat (room_prompts_<bookingId>) so two
// teachers answering at once never overwrite each other.

const RP_NOTICE_DAYS=70;        // 10 weeks: first notice + "two beds?" question
const RP_STRONG_DAYS=42;        // 6 weeks: upgrade / surcharge wording
const RP_KING_TO_TWIN={rt1:'rt6',rt4:'rt7'}; // Beachfront King → Beachview Double, Garden → Double
const RP_REQUESTABLE_TYPES=new Set(['rt1','rt2','rt3','rt4','rt5','rt6','rt7','rt8','rt9']);
const RP_SHARED_TYPES={rt6:'Beachview Double',rt7:'Double Room',rt8:'Triple Room',rt9:'Quad Room'};
const RP_BED_TYPES={bd1:'Beachview Double',bd2:'Double Room',bd3:'Triple Room',bd4:'Quad Room'};

let rpStore={};            // { bookingId: {requests:[...]} }
let rpAdminLoadedAt=0, rpAdminLoading=false;

// ---------- name check: "only if it is not obvious that it is a man" ----------
const RP_MALE_NAMES=new Set(['james','john','robert','michael','william','david','richard','joseph','thomas','charles','christopher','daniel','matthew','anthony','mark','donald','steven','paul','andrew','joshua','kenneth','kevin','brian','george','timothy','ronald','edward','jason','jeffrey','ryan','jacob','gary','nicholas','eric','jonathan','stephen','larry','justin','scott','brandon','benjamin','samuel','gregory','alexander','frank','patrick','raymond','jack','dennis','jerry','tyler','aaron','jose','adam','nathan','henry','zachary','douglas','peter','kyle','noah','ethan','jeremy','walter','christian','keith','roger','terry','austin','sean','gerald','carl','harold','dylan','arthur','lawrence','jordan','jesse','bryan','billy','bruce','gabriel','joe','logan','albert','willie','alan','eugene','russell','vincent','philip','bobby','johnny','bradley','damian','carlos','juan','luis','miguel','pedro','jorge','diego','mario','marco','antonio','fernando','ricardo','roberto','sergio','alejandro','javier','manuel','rafael','tom','tim','mike','dave','bob','bill','jim','chris','matt','dan','steve','nick','tony','rick','andy','greg','jeff','josh','ben','sam','alex','drew','brad','chad','todd','troy','wayne','dean','glenn','ray','lee','vinnie','vinny','kiran','raj','amit','ravi','sanjay','vijay','wei','jian','hiroshi','kenji','takashi','omar','ali','ahmed','mohammed','muhammad','hassan','ibrahim','yusuf','hans','klaus','jean','pierre','luca','giovanni','paolo','andre','erik','lars','sven','anders','ivan','dmitri','sergei','oleg','chen','liang','jun','hao','minh','tuan','duc','bao','khoa']);
const RP_PARTNER_WORDS=/\b(husband|boyfriend|hubby|fianc[eé]|brother|father|dad|son|uncle|mr\.?|mister|sir|him|male|man|guy)\b/i;
function rpLooksMale(name){
  const n=String(name||'').trim();
  if(!n)return false;
  if(RP_PARTNER_WORDS.test(n))return true;
  const first=n.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g,'');
  return RP_MALE_NAMES.has(first);
}

// ---------- data helpers ----------
function rpNamedGuests(reg){return ((reg&&reg.guests)||[]).filter(g=>g&&g.name&&!g.cancelled);}
function rpDaysUntil(bk){
  const t=new Date();t.setHours(0,0,0,0);
  const s=new Date((bk.startDate||'').slice(0,10)+'T00:00:00');
  return Math.round((s-t)/86400000);
}
function rpRtOfRoom(room){return (AppData.roomTypes||[]).find(rt=>(rt.rooms||[]).includes(room));}

// Shared rooms (double / triple / quad) that still have an open bed. Works for
// retreats blocked by whole rooms (rt6-rt9) and by bed (bd1-bd4).
function rpSharedRoomIssues(bk){
  const blocked=new Set(bk.blockedRooms||[]);
  const out=[];
  (AppData.roomTypes||[]).forEach(rt=>{
    if(RP_SHARED_TYPES[rt.id]){
      (rt.rooms||[]).filter(r=>blocked.has(r)).forEach(room=>{
        const reg=getRegForRoom(bk.id,room);
        if(reg&&reg.isTeacherRoom)return; // teacher's own room is never a shared-room issue
        const guests=rpNamedGuests(reg);
        const cap=rt.maxOcc||2;
        if(guests.length>0&&guests.length<cap)out.push({typeName:RP_SHARED_TYPES[rt.id],have:guests.length,cap,names:guests.map(g=>g.name)});
      });
    }else if(RP_BED_TYPES[rt.id]){
      const seen=new Set();
      (rt.rooms||[]).filter(r=>blocked.has(r)).forEach(room=>{
        const sp=splitDoubleHalf(room);if(!sp)return;
        const key=rt.id+'_'+String(sp.base).toLowerCase();
        if(seen.has(key))return;seen.add(key);
        const beds=[room,...(typeof _getSharedBeds==='function'?_getSharedBeds(room):[])].filter(r=>blocked.has(r));
        if(beds.some(r=>{const g=getRegForRoom(bk.id,r);return g&&g.isTeacherRoom;}))return;
        const filled=beds.filter(r=>rpNamedGuests(getRegForRoom(bk.id,r)).length>0);
        if(filled.length>0&&filled.length<beds.length){
          const names=[];filled.forEach(r=>rpNamedGuests(getRegForRoom(bk.id,r)).forEach(g=>names.push(g.name)));
          out.push({typeName:RP_BED_TYPES[rt.id],have:filled.length,cap:beds.length,names});
        }
      });
    }
  });
  return out;
}

// Two guests in a king, neither obviously male, with a free two-bed room.
function rpTwoBedQuestions(bk){
  const out=[];
  const blocked=new Set(bk.blockedRooms||[]);
  const acks=typeof getIssueAcks==='function'?getIssueAcks():{};
  AppData.regs.filter(r=>r.bookingId===bk.id&&!r.isTeacherRoom&&!r.cancelled&&blocked.has(r.room)).forEach(reg=>{
    const rt=rpRtOfRoom(reg.room);
    if(!rt||!RP_KING_TO_TWIN[rt.id])return;
    const guests=rpNamedGuests(reg);
    if(guests.length!==2)return;
    if(guests.some(g=>rpLooksMale(g.name)))return;
    const ack=acks[bk.id+'__king_females_'+reg.room];
    if(ack&&(ack.status==='couple'||ack.status==='done'))return; // staff already settled it
    const twinId=RP_KING_TO_TWIN[rt.id];
    const twin=(AppData.roomTypes||[]).find(t=>t.id===twinId);
    if(!twin||_freeRoomsCountForNotif(twinId,bk.startDate,bk.endDate)<1)return;
    out.push({room:reg.room,kingName:rt.name,twinName:twin.name,twinId,names:guests.map(g=>g.name)});
  });
  return out;
}

// Room types where every blocked room is filled and more are free.
function rpMoreRoomOptions(bk){
  const blocked=new Set(bk.blockedRooms||[]);
  const out=[];
  (AppData.roomTypes||[]).forEach(rt=>{
    if(!RP_REQUESTABLE_TYPES.has(rt.id))return;
    const rooms=(rt.rooms||[]).filter(r=>blocked.has(r));
    if(!rooms.length)return;
    const filled=rooms.filter(r=>rpNamedGuests(getRegForRoom(bk.id,r)).length>0);
    if(filled.length<rooms.length)return;
    const free=_freeRoomsCountForNotif(rt.id,bk.startDate,bk.endDate);
    if(free>0)out.push({typeId:rt.id,typeName:rt.name,free});
  });
  return out;
}

// ---------- storage ----------
async function rpLoad(bkId){
  try{
    const {data}=await db.from('app_store').select('value').eq('key','room_prompts_'+bkId).maybeSingle();
    rpStore[bkId]=(data&&data.value&&Array.isArray(data.value.requests))?data.value:{requests:[]};
  }catch(e){if(!rpStore[bkId])rpStore[bkId]={requests:[]};}
  return rpStore[bkId];
}
async function rpSave(bkId){
  try{await db.from('app_store').upsert({key:'room_prompts_'+bkId,value:rpStore[bkId],updated_at:new Date().toISOString()});return true;}
  catch(e){console.warn('[room-prompts] save failed',e);return false;}
}
async function rpAdd(bkId,req){
  const st=await rpLoad(bkId); // re-read first so we never clobber a newer write
  st.requests.push({id:'rp'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),status:'pending',createdAt:new Date().toISOString(),...req});
  const ok=await rpSave(bkId);
  if(!ok)showToast('Could not send — please try again.');
  return ok;
}
function rpReqFor(bkId,match){return ((rpStore[bkId]||{}).requests||[]).find(match);}

// ---------- teacher actions ----------
async function rpRequestMore(typeId){
  const bk=regSelBk;if(!bk)return;
  const opt=rpMoreRoomOptions(bk).find(o=>o.typeId===typeId);if(!opt)return;
  let qty=parseInt(prompt(`How many more ${opt.typeName} rooms would you like to request?`,'1'),10);
  if(!qty||qty<1)return;
  if(await rpAdd(bk.id,{kind:'more_rooms',typeId,typeName:opt.typeName,qty,label:(bk.leaderName||'')+(bk.retreatName?' · '+bk.retreatName:'')})){
    showToast('Request sent — we will be in touch.');rpRenderTeacher();
  }
}
async function rpAnswerBeds(room,choice){
  const bk=regSelBk;if(!bk)return;
  const q=rpTwoBedQuestions(bk).find(x=>x.room===room);if(!q)return;
  const base={kind:'two_beds',room,names:q.names,twinName:q.twinName,kingName:q.kingName,label:(bk.leaderName||'')+(bk.retreatName?' · '+bk.retreatName:'')};
  const ok=await rpAdd(bk.id,choice==='two'?base:{...base,status:'share'});
  if(ok){showToast(choice==='two'?'Request sent — we will be in touch.':'Thanks — noted.');rpRenderTeacher();}
}

// ---------- teacher rendering ----------
function rpRenderTeacher(){
  if(typeof IS_TEACHER_MODE==='undefined'||!IS_TEACHER_MODE)return;
  const bk=regSelBk;
  let box=document.getElementById('rpPrompts');
  if(!box){
    const anchor=document.getElementById('regGitanoNotice')||document.getElementById('regPanel');
    if(!anchor)return;
    box=document.createElement('div');box.id='rpPrompts';
    anchor.parentNode.insertBefore(box,anchor.id==='regPanel'?anchor:anchor.nextSibling);
  }
  if(!bk||bk.allLocked||!(bk.blockedRooms||[]).length||['cancelled','requested'].includes(bk.status)){box.innerHTML='';return;}
  if(!rpStore[bk.id]){rpLoad(bk.id).then(rpRenderTeacher);return;}
  const days=rpDaysUntil(bk);
  const card=(bg,border,title,body)=>`<div style="background:${bg};border:1.5px solid ${border};border-radius:10px;padding:12px 16px;margin-bottom:8px;font-family:'Jost',sans-serif;font-size:13px;color:#1f2937;line-height:1.5"><div style="font-weight:700;margin-bottom:3px">${title}</div>${body}</div>`;
  const btn=(label,fn,primary)=>`<button onclick="${fn}" style="margin:8px 8px 0 0;padding:6px 14px;border-radius:7px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer;border:1.5px solid #2d6a6a;${primary?'background:#2d6a6a;color:#fff':'background:#fff;color:#2d6a6a'}">${label}</button>`;
  let html='';

  // 1. shared rooms that aren't full
  if(days>0&&days<=RP_NOTICE_DAYS){
    const issues=rpSharedRoomIssues(bk);
    if(issues.length){
      const strong=days<=RP_STRONG_DAYS;
      const list=issues.map(i=>`<li>${escHtml(i.typeName)} — ${i.have} of ${i.cap} beds filled (${i.names.map(escHtml).join(', ')})</li>`).join('');
      html+=card(strong?'#fef2f2':'#fffbeb',strong?'#fca5a5':'#fcd34d',
        strong?'Shared rooms still need guests':'Shared rooms are not full yet',
        `<ul style="margin:4px 0 6px 18px;padding:0">${list}</ul>`+
        (strong
          ?`Shared rooms must be filled to capacity. If a room is still not full, we will have to upgrade your client to the cheapest private room available and a surcharge will apply.`
          :`Please note: each shared room must be filled to capacity, or your client will have to upgrade to a private room.`));
    }
  }

  // 2. two guests in a king bed
  if(days>0&&days<=RP_NOTICE_DAYS){
    rpTwoBedQuestions(bk).forEach(q=>{
      if(rpReqFor(bk.id,r=>r.kind==='two_beds'&&r.room===q.room))return; // already answered
      html+=card('#f0f9f9','#b2d8d8','Bed preference',
        `${q.names.map(escHtml).join(' &amp; ')} are booked in a ${escHtml(q.kingName)} room (one king bed). Do they prefer to share a bed, or have a room with two beds (${escHtml(q.twinName)})?`+
        btn('Share the bed',`rpAnswerBeds('${q.room.replace(/'/g,"\\'")}','share')`,false)+btn('Two beds please',`rpAnswerBeds('${q.room.replace(/'/g,"\\'")}','two')`,true));
    });
  }

  // 3. request more of a full room type
  rpMoreRoomOptions(bk).forEach(o=>{
    const sent=rpReqFor(bk.id,r=>r.kind==='more_rooms'&&r.typeId===o.typeId&&r.status==='pending');
    html+=card('#f9fafb','#e5e7eb',`${escHtml(o.typeName)} is full`,
      sent?`Your request for ${sent.qty} more ${escHtml(o.typeName)} is with our team.`
          :`All of your ${escHtml(o.typeName)} rooms are filled. Need more?`+btn(`Request more ${escHtml(o.typeName)}`,`rpRequestMore('${o.typeId}')`,true));
  });

  // status of answered requests
  ((rpStore[bk.id]||{}).requests||[]).filter(r=>r.status==='approved'||r.status==='declined').slice(-3).forEach(r=>{
    const what=r.kind==='more_rooms'?`${r.qty} more ${r.typeName}`:`two-bed room for ${(r.names||[]).join(' & ')}`;
    html+=card(r.status==='approved'?'#f0fdf4':'#f9fafb',r.status==='approved'?'#86efac':'#e5e7eb','Room request',
      r.status==='approved'?`Approved: ${escHtml(what)}. We will update your rooms shortly.`:`Not available this time: ${escHtml(what)}. Please email us if you would like to talk it through.`);
  });
  box.innerHTML=html?`<div style="padding:10px 28px 0">${html}</div>`:'';
}

// regRender wrapper — keep the original behaviour, then draw the prompts. A
// failure here must never break the room list itself.
const _rpOrigRegRender=regRender;
regRender=function(){
  const r=_rpOrigRegRender.apply(this,arguments);
  try{rpRenderTeacher();}catch(e){console.warn('[room-prompts]',e);}
  return r;
};

// ---------- staff side: Dashboard notifications ----------
async function rpAdminRefresh(){
  if(rpAdminLoading)return;
  rpAdminLoading=true;
  try{
    const {data}=await db.from('app_store').select('key,value').like('key','room_prompts_%');
    const before=JSON.stringify(rpPendingList());
    rpStore={};
    (data||[]).forEach(row=>{rpStore[row.key.replace('room_prompts_','')]=(row.value&&Array.isArray(row.value.requests))?row.value:{requests:[]};});
    rpAdminLoadedAt=Date.now();
    if(before!==JSON.stringify(rpPendingList())&&typeof buildDashboard==='function')buildDashboard();
  }catch(e){}
  rpAdminLoading=false;
}
function rpPendingList(){
  const out=[];
  Object.keys(rpStore).forEach(bkId=>{
    const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk||bk.status==='cancelled')return;
    (rpStore[bkId].requests||[]).filter(r=>r.status==='pending').forEach(r=>out.push({...r,bookingId:bkId}));
  });
  return out;
}
async function rpResolve(bkId,reqId,status){
  const st=await rpLoad(bkId);
  const r=st.requests.find(x=>x.id===reqId);if(!r)return;
  r.status=status;r.resolvedAt=new Date().toISOString();
  await rpSave(bkId);
  if(typeof buildDashboard==='function')buildDashboard();
  showToast(status==='approved'?'Approved — block the rooms for this retreat.':'Declined.');
}

if(typeof ACTV_NOTIF_SECTIONS!=='undefined'&&!ACTV_NOTIF_SECTIONS.find(s=>s.id==='room_requests'))
  ACTV_NOTIF_SECTIONS.unshift({id:'room_requests',label:'Room Requests',icon:'🛏',types:['room_request']});

if(typeof computeActivityNotifs==='function'){
  const _rpOrigNotifs=computeActivityNotifs;
  computeActivityNotifs=function(){
    const notifs=_rpOrigNotifs.apply(this,arguments);
    if(!(typeof IS_TEACHER_MODE!=='undefined'&&IS_TEACHER_MODE)&&Date.now()-rpAdminLoadedAt>60000)rpAdminRefresh();
    rpPendingList().forEach(r=>notifs.push({id:'room_request_'+r.id,type:'room_request',bookingId:r.bookingId,label:r.label||'',ts:new Date(r.createdAt),isNew:true,req:r}));
    return notifs;
  };
}
if(typeof _actvNotifRowHtml==='function'){
  const _rpOrigRow=_actvNotifRowHtml;
  _actvNotifRowHtml=function(n){
    if(n.type!=='room_request')return _rpOrigRow.apply(this,arguments);
    const r=n.req;
    const what=r.kind==='more_rooms'
      ?`wants <strong>${r.qty} more ${escHtml(r.typeName)}</strong>`
      :`${escHtml((r.names||[]).join(' &amp; '))} want <strong>two beds</strong> (${escHtml(r.twinName||'twin room')}) instead of a ${escHtml(r.kingName||'king')}`;
    const b=(label,st,col)=>`<button onclick="event.stopPropagation();rpResolve('${n.bookingId}','${r.id}','${st}')" style="padding:3px 10px;border-radius:6px;border:1.5px solid ${col};background:#fff;color:${col};font-size:11.5px;font-weight:700;cursor:pointer;font-family:'Jost',sans-serif">${label}</button>`;
    return `<div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:8px 14px;border-radius:6px;font-size:12.5px;color:#374151;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:14px;flex-shrink:0">🛏</span>
      <span style="cursor:pointer" onclick="openBookingFromNotif('${n.bookingId}')"><strong>${escHtml(n.label)}</strong> ${what}</span>
      <span style="margin-left:auto;display:flex;gap:6px">${b('Approve','approved','#15803d')}${b('Decline','declined','#b91c1c')}</span></div>`;
  };
}
