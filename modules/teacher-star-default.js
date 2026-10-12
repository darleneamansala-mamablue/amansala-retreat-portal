// ===== teacher-star-default.js — the retreat leader's own room always gets the teacher star =====
// Loaded as a classic script AFTER room-blocking.js; shares global scope. Standalone: room-blocking.js is not modified.
// The star (and everything that depends on "teacher room": paying-guest counts, the teacher's complimentary room, the room
// checklist) comes from registrations.is_teacher_room. Several retreats had the leader in a room with that flag unset, so no
// star showed. When a room is saved in the guest editor and one of its guests is the retreat's leader (same name, ignoring
// case/spaces/punctuation) and no other room of that retreat is already the teacher room, the flag is switched on.

(function(){
  const prev=gSave;
  gSave=function(){
    try{
      const bk=regSelBk;
      if(bk&&!gIsTeacherRoom&&bk.leaderName){
        const norm=s=>String(s||'').toLowerCase().replace(/[^a-z]/g,'');
        const leader=norm(bk.leaderName);
        const isLeaderHere=[0,1,2,3].some(i=>{const n=(document.getElementById('g'+i+'-name')?.value||'').trim();return n&&norm(n)===leader;});
        const alreadyHasTeacher=AppData.regs.some(r=>r.bookingId===bk.id&&r.isTeacherRoom&&!r.cancelled&&r.id!==gEditRegId);
        if(isLeaderHere&&!alreadyHasTeacher){
          gIsTeacherRoom=true;
          const chk=document.getElementById('g-teacher-check');if(chk)chk.checked=true;
        }
      }
    }catch(e){}
    return prev.apply(this,arguments);
  };
})();
