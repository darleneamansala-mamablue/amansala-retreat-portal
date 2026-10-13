// ===== shala-guard.js — two retreats can never hold the same shala at overlapping times =====
// Loaded as a classic script AFTER teacher-portal.js and cloudbeds-extra.js; shares global scope. Standalone: it wraps a few
// existing functions (nothing else is edited) so that:
//   1. TEACHER picker: a shala that another retreat has already chosen (as 1st OR 2nd choice, confirmed OR pending) at an
//      overlapping time is shown as taken and cannot be picked (tsCheckConflict).
//   2. TEACHER: if the teacher changes the time after picking, a pick that now clashes is cleared automatically (tsRenderShalaGrid).
//   3. TEACHER: the request cannot be submitted while any chosen shala clashes (tsSubmitSchedule).
//   4. ADMIN: "Send changes" (suggested times / shalas) and "Confirm" are refused when the result would double-book a shala that
//      another CONFIRMED retreat already holds (tsSendAdminChanges, tsAdminStatus). To resolve an existing clash, change one
//      of the two requests first.
// "Overlap" = the retreat dates overlap AND the class times overlap with the same 15-minute buffer the rest of the portal uses
// (a class with no time yet counts as overlapping, like the existing check). Arrival / departure classes only clash with another
// retreat's arrival / departure class on the same date. Admin overrides are used in place of the original request when present.

const SG_PERIODS=['morning','afternoon','arrival','departure'];
// true: a shala another retreat listed as its 2nd choice is also taken (nobody can pick the same shala twice).
// false: only another retreat's 1st choice (or admin-set shala) blocks; 2nd choices stay shareable.
const SG_COUNT_SECOND_CHOICES=true;
function sgHas(o,k){return !!o&&Object.prototype.hasOwnProperty.call(o,k);}
function sgEff(sr,key){const ov=sr&&sr.adminOverride;return sgHas(ov,key)?ov[key]:(sr?sr[key]:undefined);}
function sgT2M(t){if(!t||typeof t!=='string'||t.indexOf(':')<0)return null;const[h,m]=t.split(':').map(Number);return isNaN(h)||isNaN(m)?null:h*60+m;}
function sgM2T(m){return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
function sgLabel(r){if(!r)return '';const f=t=>{try{return tsFmt(t);}catch(e){return t;}};return f(sgM2T(r.s))+' – '+f(sgM2T(r.e));}
// 15-min buffer either way. A class with no time yet: the teacher picker treats it as overlapping (like the existing check),
// the admin checks do not (like the existing admin conflict list), so a blank morning time never blocks an admin action.
function sgOverlap(a,b,nullOverlaps){if(!a||!b)return !!nullOverlaps;return a.s<b.e+15&&a.e+15>b.s;}

// What one retreat's request says for a period: { range|null, shalas:[...] } or null when the period isn't used
function sgInfo(sr,period,theirs){
  if(!sr)return null;
  const rng=(start,dur,def)=>{const s=sgT2M(start);return s==null?null:{s,e:s+(+dur||def)};};
  if(period==='morning'){
    const shalas=[sgEff(sr,'morningShala1'),theirs&&!SG_COUNT_SECOND_CHOICES?null:sgEff(sr,'morningShala2')].filter(Boolean);
    return shalas.length?{range:rng(sgEff(sr,'morningStart'),sgEff(sr,'morningDur'),60),shalas}:null;
  }
  if(period==='afternoon'){
    const on=sr.hasAfternoon||sgHas(sr.adminOverride,'afternoonStart');
    const shalas=[sgEff(sr,'afternoonShala1'),theirs&&!SG_COUNT_SECOND_CHOICES?null:sgEff(sr,'afternoonShala2')].filter(Boolean);
    if(!on||!shalas.length)return null;
    const start=(sr.adminOverride&&sr.adminOverride.afternoonStart)||sr.afternoonSlot||sr.afternoonStart;
    return {range:rng(start,sgEff(sr,'afternoonDur'),60),shalas};
  }
  if(period==='arrival'||period==='departure'){
    if(!(period==='arrival'?sr.hasArrivalClass:sr.hasDepartureClass))return null;
    const shalas=[sgEff(sr,period+'Shala1'),theirs&&!SG_COUNT_SECOND_CHOICES?null:sgEff(sr,period+'Shala2')].filter(Boolean);
    return shalas.length?{range:rng(sgEff(sr,period+'Slot'),sgEff(sr,period+'Dur'),60),shalas}:null;
  }
  return null;
}
function sgOthers(bk,confirmedOnly){
  return AppData.bookings.filter(b=>b.id!==bk.id&&b.status!=='cancelled'&&b.scheduleRequest
    &&b.startDate<bk.endDate&&b.endDate>bk.startDate
    &&(!confirmedOnly||b.scheduleRequest.adminStatus==='confirmed'));
}
// All clashes between one request (bk + sr, which may carry an adminOverride) and the other retreats
function sgConflicts(bk,sr,confirmedOnly){
  const out=[];
  sgOthers(bk,confirmedOnly).forEach(other=>{
    SG_PERIODS.forEach(p=>{
      if(p==='arrival'&&bk.startDate!==other.startDate)return;
      if(p==='departure'&&bk.endDate!==other.endDate)return;
      const mine=sgInfo(sr,p,false),theirs=sgInfo(other.scheduleRequest,p,true);
      if(!mine||!theirs)return;
      if(!sgOverlap(mine.range,theirs.range,false))return;
      const shalas=mine.shalas.filter(s=>theirs.shalas.includes(s));
      if(shalas.length)out.push({other,period:p,shalas,myRange:mine.range,theirRange:theirs.range});
    });
  });
  return out;
}
function sgShalaName(id){try{return (SHALAS.find(s=>s.id===id)||{}).name||id;}catch(e){return id;}}
function sgMsg(list){
  return list.map(c=>`• ${c.other.leaderName||c.other.retreatName||'Another retreat'} (${c.other.startDate} – ${c.other.endDate}) already has ${c.shalas.map(sgShalaName).join(' and ')} for ${c.period}${c.theirRange?' at '+sgLabel(c.theirRange):''}`).join('\n');
}

// The teacher form's current picks as a request-like object (same field names the portal saves)
function sgBkId(){try{return typeof _tsBkId!=='undefined'?_tsBkId:null;}catch(e){return null;}}
function sgFromTs(){return (typeof _ts!=='undefined'&&_ts)?_ts:null;}
function sgMyRangeTs(period){
  const t=sgFromTs();if(!t)return null;
  if(period==='afternoon'){const s=sgT2M(t.afternoonSlot||'16:30');return s==null?null:{s,e:s+(t.afternoonDur||60)};}
  if(period==='arrival'){const s=sgT2M(t.arrivalSlot||'16:00');return s==null?null:{s,e:s+(t.arrivalDur||60)};}
  if(period==='departure'){const s=sgT2M(t.departureSlot||'08:00');return s==null?null:{s,e:s+(t.departureDur||60)};}
  if(t.morningStart){const s=sgT2M(t.morningStart);return s==null?null:{s,e:s+(t.morningDur||60)};}
  try{if(t.window){const w=TS_WINDOWS.find(w=>w.id===t.window);if(w)return{s:sgT2M(w.start),e:sgT2M(w.end)};}}catch(e){}
  return null;
}
function sgPeriodUsedTs(period){
  const t=sgFromTs();if(!t)return false;
  if(period==='afternoon')return !!t.hasAfternoon;
  if(period==='arrival')return !!t.hasArrivalClass;
  if(period==='departure')return !!t.hasDepartureClass;
  return period==='morning';
}
// Would picking `shalaId` for `period` on retreat `bkId` clash with another retreat's request?
function sgClashForPick(shalaId,period,bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);if(!bk||!SG_PERIODS.includes(period))return null;
  const my=sgMyRangeTs(period);
  for(const other of sgOthers(bk,false)){
    if(period==='arrival'&&bk.startDate!==other.startDate)continue;
    if(period==='departure'&&bk.endDate!==other.endDate)continue;
    const th=sgInfo(other.scheduleRequest,period,true);
    if(!th||!th.shalas.includes(shalaId))continue;
    if(!sgOverlap(my,th.range,true))continue;
    return {other,range:th.range};
  }
  return null;
}

(function(){
  // 1. teacher picker: taken shalas are blocked (also catches 2nd choices and pending requests)
  const origCheck=window.tsCheckConflict;
  if(typeof origCheck==='function'){
    window.tsCheckConflict=function(shalaId,period,bkId){
      const res=origCheck.apply(this,arguments);
      if(res&&res.level==='blocked')return res;
      try{
        const c=sgClashForPick(shalaId,period,bkId);
        if(c){const lbl=sgLabel(c.range);return {level:'blocked',message:'Already chosen by another group'+(lbl?' at '+lbl:''),bookedLabel:lbl};}
      }catch(e){}
      return res;
    };
  }
  // 2. teacher changed the time after picking: drop picks that now clash, then draw the grid
  const origGrid=window.tsRenderShalaGrid;
  if(typeof origGrid==='function'){
    window.tsRenderShalaGrid=function(period){
      try{
        const t=sgFromTs(),bkId=sgBkId();
        if(t&&bkId&&SG_PERIODS.includes(period)){
          const k1=period+'Shala1',k2=period+'Shala2',dropped=[];
          [k2,k1].forEach(k=>{if(t[k]&&sgClashForPick(t[k],period,bkId)){dropped.push(sgShalaName(t[k]));t[k]='';}});
          if(!t[k1]&&t[k2]){t[k1]=t[k2];t[k2]='';}
          if(dropped.length&&typeof showToast==='function')showToast(dropped.join(' and ')+' is already chosen by another group at that time, so it was removed. Please pick another shala.');
        }
      }catch(e){}
      return origGrid.apply(this,arguments);
    };
  }
  // 3. teacher submit: refuse while any chosen shala clashes
  const origSubmit=window.tsSubmitSchedule;
  if(typeof origSubmit==='function'){
    window.tsSubmitSchedule=function(){
      try{
        const bkId=sgBkId()||(localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id'));
        const bk=AppData.bookings.find(b=>b.id===bkId),t=sgFromTs();
        if(bk&&t){
          const sr={hasAfternoon:t.hasAfternoon,hasArrivalClass:t.hasArrivalClass,hasDepartureClass:t.hasDepartureClass,
            morningShala1:t.morningShala1,morningShala2:t.morningShala2,afternoonShala1:t.afternoonShala1,afternoonShala2:t.afternoonShala2,
            arrivalShala1:t.arrivalShala1,arrivalShala2:t.arrivalShala2,departureShala1:t.departureShala1,departureShala2:t.departureShala2};
          const bad=[];
          SG_PERIODS.forEach(p=>{if(!sgPeriodUsedTs(p))return;[p+'Shala1',p+'Shala2'].forEach(k=>{const id=sr[k];if(!id)return;const c=sgClashForPick(id,p,bkId);if(c)bad.push({other:c.other,period:p,shalas:[id],theirRange:c.range});});});
          if(bad.length){alert('Please choose a different shala before submitting:\n\n'+sgMsg(bad));return;}
        }
      }catch(e){}
      return origSubmit.apply(this,arguments);
    };
  }
  // 4a. admin "Send changes": the suggested times / shalas must not double-book a confirmed retreat
  const origChanges=window.tsSendAdminChanges;
  if(typeof origChanges==='function'){
    window.tsSendAdminChanges=function(bkId){
      try{
        const bk=AppData.bookings.find(b=>b.id===bkId);
        if(bk&&bk.scheduleRequest){
          const sr=bk.scheduleRequest,val=id=>document.getElementById(id)?.value;
          const ov={
            morningStart:val('svAdjMorningStart')||sr.morningStart,morningDur:parseInt(val('svAdjMorningDur'))||sr.morningDur,
            morningShala1:val('svAdjMorningShala1')||sr.morningShala1,morningShala2:val('svAdjMorningShala2')||sr.morningShala2};
          if(sr.hasAfternoon){ov.afternoonStart=val('svAdjAfternoonStart')||sr.afternoonStart;ov.afternoonDur=parseInt(val('svAdjAfternoonDur'))||sr.afternoonDur;
            ov.afternoonShala1=val('svAdjAfternoonShala1')||sr.afternoonShala1;ov.afternoonShala2=val('svAdjAfternoonShala2')||sr.afternoonShala2;}
          const list=sgConflicts(bk,Object.assign({},sr,{adminOverride:ov}),true);
          if(list.length){alert('These changes would put two retreats in the same shala at the same time, so they were not sent:\n\n'+sgMsg(list)+'\n\nPlease choose a different shala or time.');return;}
        }
      }catch(e){}
      return origChanges.apply(this,arguments);
    };
  }
  // 4b. admin "Confirm": refuse to confirm a request that double-books a confirmed retreat
  const origStatus=window.tsAdminStatus;
  if(typeof origStatus==='function'){
    window.tsAdminStatus=function(bkId,status){
      try{
        if(status==='confirmed'){
          const bk=AppData.bookings.find(b=>b.id===bkId);
          if(bk&&bk.scheduleRequest){
            const list=sgConflicts(bk,bk.scheduleRequest,true);
            if(list.length){alert('This schedule cannot be confirmed yet. Two retreats would be in the same shala at the same time:\n\n'+sgMsg(list)+'\n\nUse "Request changes" to ask for a different shala or time, then confirm.');return;}
          }
        }
      }catch(e){}
      return origStatus.apply(this,arguments);
    };
  }
})();
