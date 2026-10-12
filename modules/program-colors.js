// ===== program-colors.js — We Travel, Bikini Bootcamp and Restore and Renew are always light pink =====
// Loaded as a classic script AFTER venues.js; shares global scope. Standalone: no other module is edited.
// A booking counts as one of these programs when its retreat name or leader name says We Travel, Bikini Bootcamp (BBC) or
// Restore and Renew (RNR), or it came from WeTravel. Those get one light pink everywhere a booking is colored:
//   - Room Calendar: the "Active in this view" strip and the room bars (bkPaletteColor is the single source for both)
//   - Venues: the retreat bars (recolored after each draw, matched by the name printed on the bar)
// The regular retreat palette had its own soft pink; so pink stays exclusive to these programs, that one palette slot is
// changed to lime (retreats that used it change from pink to lime).

const PROGRAM_PINK={bg:'#ffd9e8',border:'#ec4899',text:'#9d174d'};
const PROGRAM_RE=/we\s*travel|bikini\s*boot\s*camp|restore\s*(?:and|&|n)\s*renew|\bbbc\b|\brnr\b/i;
function isProgramBooking(bk){
  if(!bk)return false;
  return bk.source==='wetravel'||bk.mealPlan==='weTravel'||PROGRAM_RE.test(String(bk.retreatName||'')+' '+String(bk.leaderName||''));
}
(function(){
  RETREAT_PALETTE[2]={bg:'#ecfccb',border:'#65a30d',text:'#365314'};   // was soft pink
  const pc=bkPaletteColor;
  bkPaletteColor=function(bk){return isProgramBooking(bk)?PROGRAM_PINK:pc.apply(this,arguments);};
  const paint=()=>{
    document.querySelectorAll('#venBody .bk').forEach(el=>{
      const name=(el.querySelector('.bk-n')||{}).textContent||'';
      if(!PROGRAM_RE.test(name))return;
      el.style.background=PROGRAM_PINK.bg;el.style.borderColor=PROGRAM_PINK.border;el.style.color=PROGRAM_PINK.text;
    });
  };
  const ven=venBuild;
  venBuild=function(){const r=ven.apply(this,arguments);try{paint();}catch(e){}return r;};
  try{paint();}catch(e){}
})();
