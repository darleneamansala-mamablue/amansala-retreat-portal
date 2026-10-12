// ===== avail-guests.js — Availability Check shows real guest numbers, not just the saved "Pax" =====
// Loaded as a classic script AFTER venues.js; shares global scope. Standalone: venues.js is not modified.
// The Availability Check popup (Venues → click a retreat bar) printed only the booking's saved Pax field, a planning number
// that stays at whatever was typed when the retreat was created (often 10) and never follows the retreat as it grows or
// is a full buyout. After the popup has drawn, this replaces the subtitle with the real picture:
//   N guests · X registered · Y rooms blocked · Buyout
// where N = the larger of the saved Pax and the guests actually registered, "registered" = named guests in the room list,
// "rooms blocked" = rooms held for the retreat, and "Buyout" appears for a Full House / buyout name or a huge room block.

(function(){
  const prev=showAvailPreview;
  showAvailPreview=async function(id){
    const r=await prev.apply(this,arguments);
    try{
      const bk=AppData.bookings.find(b=>b.id===id),el=document.getElementById('availPreviewDates');
      if(!bk||!el)return r;
      const reg=(typeof venueGuestCount==='function')?venueGuestCount(bk.id):0;
      const blocked=(bk.blockedRooms||[]).length;
      const pax=Number(bk.pax)||0;
      const n=Math.max(pax,reg);
      const buyout=/full\s*house|buy\s*-?\s*out/i.test(String(bk.leaderName||'')+' '+String(bk.retreatName||''))||blocked>=90;
      const parts=[`${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}`];
      if(n)parts.push(`${n} guests`);
      if(reg&&reg!==n)parts.push(`${reg} registered`);else if(reg)parts.push('all registered');
      if(blocked)parts.push(`${blocked} room${blocked>1?'s':''} blocked`);
      if(buyout)parts.push('Buyout');
      if(!pax&&!reg)parts.push('guest count not set');
      el.textContent=parts.join(' · ');
    }catch(e){}
    return r;
  };
})();
