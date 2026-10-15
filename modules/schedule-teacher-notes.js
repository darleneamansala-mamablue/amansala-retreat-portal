// ===== schedule-teacher-notes.js — admin-only "What the teacher said" notes in a retreat's Schedule window =====
// Loaded as a classic script AFTER teacher-portal.js; shares global scope. Standalone: openScheduleViewer is wrapped, not edited.
// Free-text notes for the admin (requests, changes, reminders the teacher mentioned). Stored on the retreat's schedule request as
// scheduleRequest.adminTeacherNotes (+ adminTeacherNotesAt) so it saves with the retreat. Never shown on teacher screens or printouts.
function stnEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function stnSave(bkId){
  const bk=(AppData.bookings||[]).find(b=>b.id===bkId);const ta=document.getElementById('stnText_'+bkId);
  if(!bk||!bk.scheduleRequest||!ta)return;
  bk.scheduleRequest.adminTeacherNotes=ta.value;
  bk.scheduleRequest.adminTeacherNotesAt=new Date().toISOString();
  saveAll();
  const s=document.getElementById('stnStatus_'+bkId);if(s)s.textContent='Saved '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  try{showToast('Notes saved');}catch(e){}
}
function stnRender(bkId){
  try{
    const bk=(AppData.bookings||[]).find(b=>b.id===bkId);const body=document.getElementById('svBody');
    if(!bk||!bk.scheduleRequest||!body)return;
    if(typeof IS_TEACHER_MODE!=='undefined'&&IS_TEACHER_MODE&&!document.body.classList.contains('admin-preview'))return;
    body.querySelector('.stn-card')?.remove();
    const sr=bk.scheduleRequest;
    const el=document.createElement('div');el.className='stn-card';
    el.style.cssText='margin-bottom:16px;padding:12px 14px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px';
    el.innerHTML=`<div style="font-size:13px;font-weight:700;color:#78350f;margin-bottom:6px">📝 What the teacher said <span style="font-weight:600;font-size:11.5px;color:#92400e">(admin only — the teacher never sees this)</span></div>
      <textarea id="stnText_${stnEsc(bkId)}" rows="4" placeholder="Write what the teacher told you: requests, changes, reminders…" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #d6c4a1;border-radius:8px;font-family:'Jost',sans-serif;font-size:13.5px;color:#2d2a26;resize:vertical">${stnEsc(sr.adminTeacherNotes||'')}</textarea>
      <div style="display:flex;align-items:center;gap:10px;margin-top:6px"><button type="button" class="btn btn-primary" style="font-size:12px;padding:5px 14px" onclick="stnSave('${stnEsc(bkId)}')">Save notes</button>
      <span id="stnStatus_${stnEsc(bkId)}" style="font-size:11.5px;color:#92400e">${sr.adminTeacherNotesAt?'Last saved '+new Date(sr.adminTeacherNotesAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''}</span></div>`;
    body.insertBefore(el,body.firstChild);
  }catch(e){}
}
(function(){
  const f=window.openScheduleViewer;
  if(typeof f==='function')window.openScheduleViewer=function(bkId){const r=f.apply(this,arguments);stnRender(bkId);return r;};
})();
