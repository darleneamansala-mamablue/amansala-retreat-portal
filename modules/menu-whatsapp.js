// menu-whatsapp.js — publishes the dishes of the next days for the restaurant team's 9 PM WhatsApp (netlify/functions/
// menu-whatsapp-lib.js, Jorge 2026-11-12). The weekly menu with Darlene's edits (menu-editor.js) and each week's Menu 1/2
// (menu-variants.js) only exist here in the browser, so the portal saves what each day serves to app_store
// 'menu_whatsapp_days' = {updatedAt, days:{'YYYY-MM-DD':{lightBreakfast,breakfast,brunch,lunch,snack,dinner}}}.
// Only when it changed; the groups and pax are read by the server from 'menuSchedule' itself.
(function(){
  const KEY='menu_whatsapp_days', DAYS_AHEAD=10;
  let last='';
  function build(){
    if(typeof menuDataFor!=='function')return null;
    const days={};
    for(let i=0;i<=DAYS_AHEAD;i++){
      const d=new Date(Date.now()-5*3600e3+i*864e5).toISOString().slice(0,10);
      const m=menuDataFor(d)||{};
      days[d]={lightBreakfast:m.lightBreakfast||[],breakfast:m.breakfast||[],brunch:m.brunch||[],lunch:m.lunch||[],snack:m.snack||[],dinner:m.dinner||null};
    }
    return days;
  }
  async function publish(){
    try{
      if(typeof db==='undefined'||!sessionStorage.getItem('amansala_staff_token'))return;
      const days=build(); if(!days)return;
      const s=JSON.stringify(days); if(s===last)return;
      const {error}=await db.from('app_store').upsert({key:KEY,value:{updatedAt:new Date().toISOString(),days},updated_at:new Date().toISOString()});
      if(!error)last=s;
    }catch(e){}
  }
  // after the menu edits and the week variants have loaded from Supabase, then every 15 minutes while the portal is open
  setTimeout(publish,20000);
  setInterval(publish,15*60e3);
  window.menuWhatsappPublish=publish;
})();
