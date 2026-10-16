// ===== temazcal-split.js — split a Temazcal into two groups (Darlene 2026-10-16) =====
// Loaded as a classic script AFTER teacher-portal.js (and salsa-rule.js); shares global scope. Standalone: no other module is edited.
// The Temazcal fits 20 people. A bigger group does it twice, back to back, with a 30-minute break between the two:
//   group 2 starts SPLIT_TZ_DURATION + SPLIT_TZ_GAP minutes after group 1 (default 90 + 30 = 2 hours later).
// Adds a "Temazcal groups" panel under "Assigned Activities" in Review Schedule. Splitting keeps the existing Temazcal entry as
// group 1 and adds a second Temazcal entry (same day, later time) as group 2, so every screen that lists activities simply shows
// two Temazcal times. Each entry carries session (1 or 2) and groupSize. Merging removes group 2 again.
// A date change on either group moves both (they are one night). Change the constants below to change the rules.

const TZ_AO='ao5', TZ_MAX=20, TZ_DURATION=90, TZ_GAP=30;

function tzAdd(t,mins){
  const m=String(t||'').match(/^(\d{1,2}):(\d{2})$/);if(!m)return '';
  const tot=((+m[1])*60+(+m[2])+mins)%1440;
  return String(Math.floor(tot/60)).padStart(2,'0')+':'+String(tot%60).padStart(2,'0');
}
function tzFmt(t){const m=String(t||'').match(/^(\d{1,2}):(\d{2})$/);if(!m)return t||'';const h=+m[1];return ((h%12)||12)+':'+m[2]+(h>=12?' pm':' am');}
function tzEntries(bk){return (bk.retreatActivities||[]).filter(a=>a&&a.aoId===TZ_AO);}
function tzPax(bk){
  const n=Number(bk.pax)||0;
  if(n)return n;
  try{return (AppData.regs||[]).filter(r=>r.bookingId===bk.id&&!r.cancelled).reduce((s,r)=>s+(r.guests||[]).filter(g=>g&&String(g.name||'').trim()).length,0);}catch(e){return 0;}
}
function tzEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function tzPanel(bk,bkId){
  const ents=tzEntries(bk);
  if(!ents.length)return '';
  const pax=tzPax(bk);
  const box='margin-top:12px;border:1.5px solid var(--border);border-radius:10px;overflow:hidden';
  const head='<div style="padding:8px 10px;background:#f8f5f0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)">Temazcal groups — the Temazcal fits '+TZ_MAX+' people</div>';
  const inp='padding:5px 8px;border:1.5px solid var(--border);border-radius:7px;font-family:\'Jost\',sans-serif;font-size:12px;background:var(--sand)';
  const btn='font-size:12px;white-space:nowrap';
  if(ents.length>=2){
    const g1=ents.find(a=>a.session===1)||ents[0],g2=ents.find(a=>a.session===2)||ents[1];
    return `<div style="${box}">${head}<div style="padding:10px;font-size:12.5px;line-height:1.7">
      <div><b>Group 1:</b> <input type="number" min="1" max="${TZ_MAX}" id="tzS1" value="${g1.groupSize||''}" style="${inp};width:64px"> guests at <b>${tzFmt(g1.time)}</b></div>
      <div><b>Group 2:</b> <input type="number" min="1" max="${TZ_MAX}" id="tzS2" value="${g2.groupSize||''}" style="${inp};width:64px"> guests at <b>${tzFmt(g2.time)}</b></div>
      <div style="color:var(--muted);font-size:11.5px">Change a group's start time in the list above. Group 2 is normally ${TZ_DURATION+TZ_GAP} minutes after group 1 (${TZ_DURATION}-minute ceremony + ${TZ_GAP}-minute break).</div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" style="${btn}" onclick="tzSaveSizes('${bkId}')">Save group sizes</button>
      <button class="btn btn-secondary" style="${btn}" onclick="tzMerge('${bkId}')">Merge back into one group</button></div></div></div>`;
  }
  const a=ents[0];
  const g1=Math.min(TZ_MAX,Math.ceil((pax||TZ_MAX*2)/2)),g2=Math.max(1,(pax||g1*2)-g1);
  const warn=pax>TZ_MAX?`<div style="color:#b45309;font-weight:600">${pax} guests — more than the ${TZ_MAX} the Temazcal fits, so it needs two groups.</div>`:`<div style="color:var(--muted)">${pax?pax+' guests.':''} One group is fine up to ${TZ_MAX}.</div>`;
  return `<div style="${box}">${head}<div style="padding:10px;font-size:12.5px;line-height:1.7">${warn}
    <div>Group 1: <input type="number" min="1" max="${TZ_MAX}" id="tzS1" value="${g1}" style="${inp};width:64px"> guests at <b>${tzFmt(a.time)}</b></div>
    <div>Group 2: <input type="number" min="1" max="${TZ_MAX}" id="tzS2" value="${g2}" style="${inp};width:64px"> guests at <input type="time" id="tzT2" value="${tzAdd(a.time,TZ_DURATION+TZ_GAP)}" style="${inp}"> <span style="color:var(--muted);font-size:11.5px">(${TZ_DURATION}-minute ceremony + ${TZ_GAP}-minute break)</span></div>
    <div style="margin-top:8px"><button class="btn btn-primary" style="${btn}" onclick="tzSplit('${bkId}')">Split into 2 groups</button></div></div></div>`;
}
function tzBk(bkId){return (AppData.bookings||[]).find(b=>b.id===bkId);}
function tzRead(){
  const n=id=>parseInt((document.getElementById(id)||{}).value,10)||0;
  return {s1:n('tzS1'),s2:n('tzS2'),t2:(document.getElementById('tzT2')||{}).value||''};
}
function tzSplit(bkId){
  const bk=tzBk(bkId);if(!bk)return;
  const a=tzEntries(bk)[0];if(!a)return;
  const {s1,s2,t2}=tzRead();
  if(s1<1||s2<1){showToast('Enter how many guests are in each group.');return;}
  if(s1>TZ_MAX||s2>TZ_MAX){showToast(`The Temazcal fits ${TZ_MAX} people — each group can have at most ${TZ_MAX}.`);return;}
  if(!t2){showToast('Enter the start time for group 2.');return;}
  if(t2<=a.time){showToast('Group 2 has to start after group 1 has finished.');return;}
  a.session=1;a.groupSize=s1;
  bk.retreatActivities.push({aoId:TZ_AO,date:a.date,time:t2,prepaid:a.prepaid,session:2,groupSize:s2});
  bk.retreatActivitiesUpdatedAt=new Date().toISOString();
  saveAll();svRefreshActivityView(bkId);
  showToast(`Temazcal split: group 1 (${s1}) at ${tzFmt(a.time)}, group 2 (${s2}) at ${tzFmt(t2)}.`);
}
function tzSaveSizes(bkId){
  const bk=tzBk(bkId);if(!bk)return;
  const {s1,s2}=tzRead();
  if(s1<1||s2<1||s1>TZ_MAX||s2>TZ_MAX){showToast(`Each group needs between 1 and ${TZ_MAX} guests.`);return;}
  const ents=tzEntries(bk);
  const g1=ents.find(a=>a.session===1)||ents[0],g2=ents.find(a=>a.session===2)||ents[1];
  g1.groupSize=s1;g2.groupSize=s2;
  bk.retreatActivitiesUpdatedAt=new Date().toISOString();
  saveAll();svRefreshActivityView(bkId);
}
function tzMerge(bkId){
  const bk=tzBk(bkId);if(!bk)return;
  const ents=tzEntries(bk);if(ents.length<2)return;
  const g1=ents.find(a=>a.session===1)||ents[0],g2=ents.find(a=>a.session===2)||ents[1];
  bk.retreatActivities=bk.retreatActivities.filter(a=>a!==g2);
  delete g1.session;delete g1.groupSize;
  bk.retreatActivitiesUpdatedAt=new Date().toISOString();
  saveAll();svRefreshActivityView(bkId);
  showToast('Temazcal is back to one group.');
}

if(typeof svActivityEditorHtml==='function'){
  const _tzOrigEditor=svActivityEditorHtml;
  svActivityEditorHtml=function(bk,bkId){
    let html=_tzOrigEditor.apply(this,arguments);
    try{html+=tzPanel(bk,bkId);}catch(e){console.warn('[temazcal-split]',e);}
    return html;
  };
}
// both groups are one night: moving either group's day moves the other with it
if(typeof svChangeActivityDate==='function'){
  const _tzOrigDate=svChangeActivityDate;
  svChangeActivityDate=function(bkId,idx,newDate){
    const bk=tzBk(bkId),act=bk&&(bk.retreatActivities||[])[idx];
    const before=act&&act.date;
    _tzOrigDate.apply(this,arguments);
    try{
      if(act&&act.aoId===TZ_AO&&act.date&&act.date!==before){
        let moved=false;
        tzEntries(bk).forEach(a=>{if(a!==act&&a.date!==act.date){a.date=act.date;moved=true;}});
        if(moved){bk.retreatActivitiesUpdatedAt=new Date().toISOString();saveAll();svRefreshActivityView(bkId);}
      }
    }catch(e){console.warn('[temazcal-split]',e);}
  };
}
