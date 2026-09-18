// ===== room-activities.js — Daily Activities editor for Room-Only guests =====
// (Bikini Bootcamp / Restore & Renew — including WeTravel-sourced bookings
// of either type). These guests never submit a teacher schedule request, so
// the retreat Schedule Viewer (hard-gated on scheduleRequest.submittedAt in
// modules/teacher-portal.js openScheduleViewer) never applies to them — but
// the underlying activity functions (svAddActivity/svAutoAssignActivities/
// svActivityEditorHtml etc., also in teacher-portal.js) work on any
// booking's retreatActivities regardless of scheduleRequest, so this reuses
// them directly instead of duplicating that logic. Populating
// retreatActivities this way is what makes these guests show up correctly
// on the Activity Sheet (modules/activity-sheet.js), same as retreat groups.
// Loaded as a classic script; shares global scope with booking-hub.html.

function openRoomActivitiesEditor(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);
  if(!bk){showToast('Booking not found — try refreshing the page.');return;}
  const titleEl=document.getElementById('raModalTitle');
  if(titleEl)titleEl.textContent=`Daily Activities — ${bk.leaderName||bk.retreatName||'Guest'}`;
  const body=document.getElementById('raBody');
  if(!body)return;
  const actCount=(bk.retreatActivities||[]).length;
  body.innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <span style="font-size:12.5px;color:var(--muted);flex:1">${actCount?`${actCount} tour${actCount!==1?'s/ceremonies':'/ceremony'} assigned`:'No activities assigned yet'}</span>
      ${actCount?`<button class="btn" style="font-size:12px;white-space:nowrap;background:#fff;border:1.5px solid #7c3aed;color:#7c3aed" onclick="svSyncPrepaidFlags('${bkId}')">✓ Sync Prepaid</button>`:''}
      <button class="btn btn-primary" style="font-size:12px;white-space:nowrap;background:#059669;border-color:#059669" onclick="svAutoAssignActivities('${bkId}')">⚡ Auto-Assign Activities</button>
    </div>
    ${svActivityEditorHtml(bk,bkId)}
  `;
  openModal('roomActivitiesModal');
}
