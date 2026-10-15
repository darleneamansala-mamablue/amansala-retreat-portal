// ===== teacher-extra-nights.js — "Extra nights" link card on the TEACHER dashboard =====
// Loaded as a classic script AFTER teacher-portal.js; shares global scope. Standalone: renderChecklist is wrapped, not edited.
// Shows teachers the link their guests can use to book extra nights before/after the retreat, with a Copy button.
const TEN_LINK='https://amansalaportal.com/extra-nights.html';
function tenCopy(btn){
  const done=()=>{btn.textContent='✓ Copied!';setTimeout(()=>{btn.textContent='Copy Link';},2000);};
  try{navigator.clipboard.writeText(TEN_LINK).then(done).catch(()=>{prompt('Copy this link:',TEN_LINK);});}catch(e){prompt('Copy this link:',TEN_LINK);}
}
function tenRender(){
  try{
    const body=document.getElementById('clBody');if(!body||!body.parentNode)return;
    const host=body.parentNode;
    host.querySelector('.ten-card')?.remove();
    const el=document.createElement('div');el.className='ten-card';
    el.style.cssText='margin-top:14px;padding:14px 16px;background:#f7f4ee;border:1px solid #e3dccf;border-radius:10px';
    el.innerHTML=`<div style="font-size:14px;font-weight:700;color:#2d2a26">Extra nights for your guests</div>
      <div style="font-size:13px;color:#4a443d;margin-top:3px">If your guests want to book extra nights, they can use this link:</div>
      <div style="font-size:13px;color:#2d6a6a;word-break:break-all;margin-top:6px"><a href="${TEN_LINK}" target="_blank" rel="noopener" style="color:#2d6a6a">${TEN_LINK}</a></div>
      <button type="button" onclick="tenCopy(this)" style="margin-top:8px;padding:6px 14px;background:#2d6a6a;color:#fff;border:none;border-radius:6px;font-family:'Jost',sans-serif;font-size:12px;font-weight:600;cursor:pointer">Copy Link</button>`;
    host.appendChild(el);
  }catch(e){}
}
(function(){
  const f=window.renderChecklist;
  if(typeof f==='function')window.renderChecklist=function(){const r=f.apply(this,arguments);tenRender();return r;};
})();
