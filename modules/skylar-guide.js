// ===== skylar-guide.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== SKYLAR GUIDE =====
var skylarOpen=false,skylarGreeted=false;

function skylarIsRSOnline(){
  const now=new Date();
  const utcH=now.getUTCHours();
  const day=now.getUTCDay(); // 0=Sun 6=Sat; Cancun=EST=UTC-5
  return day>=1&&day<=5&&utcH>=14&&utcH<23;
}

function skylarInit(){
  const w=document.getElementById('skylarWidget');
  if(!w)return;
  w.style.display='block';
  // Retreat Specialist online status
  const online=skylarIsRSOnline();
  const dot=document.getElementById('skylarRSDot');
  const lbl=document.getElementById('skylarRSLabel');
  if(dot)dot.style.background=online?'#4ade80':'#9ca3af';
  if(lbl)lbl.textContent=online?'Online':'Away';
  // Show unread badge after 2s to draw attention
  if(!skylarGreeted){
    setTimeout(()=>{
      const badge=document.getElementById('skylarBadge');
      if(badge&&!skylarOpen){badge.style.display='flex';}
    },2000);
  }
}

function skylarToggle(){
  skylarOpen=!skylarOpen;
  const panel=document.getElementById('skylarPanel');
  const badge=document.getElementById('skylarBadge');
  if(panel)panel.style.display=skylarOpen?'flex':'none';
  if(badge)badge.style.display='none';
  if(skylarOpen&&!skylarGreeted){
    skylarGreeted=true;
    setTimeout(()=>{
      skylarBotMsg("Hi! I'm <strong>Skylar</strong> 👋 Before connecting you to our team, have you had a chance to check the <strong>Help & FAQ</strong> tab? Most questions are answered there!");
      setTimeout(skylarShowOptions,600);
    },350);
  }
}

function skylarShowOptions(){
  const msgs=document.getElementById('skylarMessages');
  if(!msgs)return;
  const div=document.createElement('div');
  div.style.cssText='display:flex;align-items:flex-start;gap:8px';
  div.innerHTML=`<div style="width:28px;height:28px;border-radius:50%;background:#2d6a6a;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:white;flex-shrink:0;margin-top:2px">S</div>
  <div style="background:white;border:1px solid #e5e7eb;padding:12px 14px;border-radius:4px 14px 14px 14px;max-width:90%">
    <div style="display:flex;flex-direction:column;gap:8px">
      <button onclick="skylarGoFaq()" style="display:flex;align-items:center;gap:8px;background:#2d6a6a;color:white;border:none;padding:10px 14px;border-radius:9px;font-weight:600;font-size:13px;font-family:'Jost',sans-serif;cursor:pointer;text-align:left">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="white" stroke-width="2"/><path d="M9 9C9 7.34 10.34 6 12 6s3 1.34 3 3c0 2-3 2-3 4M12 17v1" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
        Take me to Help &amp; FAQ
      </button>
      <button onclick="skylarStillNeedHelp(this)" style="display:flex;align-items:center;gap:8px;background:#f0f9f9;color:#2d6a6a;border:1.5px solid #b2d8d8;padding:10px 14px;border-radius:9px;font-weight:600;font-size:13px;font-family:'Jost',sans-serif;cursor:pointer;text-align:left">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" stroke="#2d6a6a" stroke-width="2"/></svg>
        Yes, I still need help
      </button>
    </div>
  </div>`;
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
}

function skylarGoFaq(){
  skylarToggle();
  if(typeof teacherShowView==='function')teacherShowView('faq');
}

function skylarStillNeedHelp(btn){
  if(btn){const wrap=btn.closest('div[style*="flex-direction:column"]');if(wrap)wrap.closest('.skylar-options-wrap')?.remove();}
  const online=skylarIsRSOnline();
  skylarBotMsg(online
    ? "Of course! A <strong>Retreat Specialist</strong> is available right now — choose how you'd like to reach us:"
    : "We're away right now, but don't worry — we'll get back to you as soon as we're back! 🌙"
  );
  setTimeout(()=>{
    const msgs=document.getElementById('skylarMessages');
    if(!msgs)return;
    const div=document.createElement('div');
    div.style.cssText='display:flex;align-items:flex-start;gap:8px';
    div.innerHTML=`<div style="width:28px;height:28px;border-radius:50%;background:#2d6a6a;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:white;flex-shrink:0;margin-top:2px">S</div>
    <div style="background:white;border:1px solid #e5e7eb;padding:12px 14px;border-radius:4px 14px 14px 14px;max-width:90%">
      <div style="display:flex;flex-direction:column;gap:8px">
        <a href="https://wa.me/5215592252190" target="_blank" style="display:flex;align-items:center;gap:8px;background:#25d366;color:white;text-decoration:none;padding:10px 14px;border-radius:9px;font-weight:600;font-size:13px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.858L.044 23.456a.5.5 0 0 0 .615.597l5.78-1.516A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.7-.523-5.232-1.432l-.374-.222-3.89 1.02 1.001-3.774-.245-.389A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
          WhatsApp us
        </a>
        <a href="mailto:darlene@amansala.com" style="display:flex;align-items:center;gap:8px;background:#f0f9f9;color:#2d6a6a;text-decoration:none;padding:10px 14px;border-radius:9px;font-weight:600;font-size:13px;border:1.5px solid #b2d8d8">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" stroke="#2d6a6a" stroke-width="2"/><path d="M22 6l-10 7L2 6" stroke="#2d6a6a" stroke-width="2" stroke-linecap="round"/></svg>
          Email us
        </a>
        <a href="https://calendly.com/darlene-amansala/discovery-call-retreats" target="_blank" style="display:flex;align-items:center;gap:8px;background:#f0f9f9;color:#2d6a6a;text-decoration:none;padding:10px 14px;border-radius:9px;font-weight:600;font-size:13px;border:1.5px solid #b2d8d8">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#2d6a6a" stroke-width="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="#2d6a6a" stroke-width="2" stroke-linecap="round"/></svg>
          Book a call
        </a>
      </div>
    </div>`;
    msgs.appendChild(div);
    msgs.scrollTop=msgs.scrollHeight;
  },600);
}

function skylarBotMsg(html){
  const msgs=document.getElementById('skylarMessages');
  if(!msgs)return;
  const div=document.createElement('div');
  div.style.cssText='display:flex;align-items:flex-start;gap:8px';
  div.innerHTML=`<div style="width:28px;height:28px;border-radius:50%;background:#2d6a6a;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:white;flex-shrink:0;margin-top:2px">S</div><div style="background:white;border:1px solid #e5e7eb;padding:10px 13px;border-radius:4px 14px 14px 14px;font-size:13px;color:#2d3a3a;line-height:1.6;max-width:84%;word-break:break-word">${html}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
}


