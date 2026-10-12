// ===== retreat-assistant-tab.js — the Retreat Assistant (AI chat) inside each teacher's portal =====
// Loaded as a classic script AFTER teacher-portal.js; shares global scope. Standalone: nothing else is modified.
// History: the assistant used to be a floating button (2026-09-08), removed 2026-09-15 because it sat on top of the Save
// Schedule Request button. It now lives as its own tab ("Assistant") in the teacher portal's navigation, so it can never
// cover another control. The backend (netlify/functions/chat-teacher.js) and the message functions (_chatAppend, _chatSend,
// _chatHistory, ... in teacher-portal.js) are unchanged; this module only adds the tab, its page and the wiring.

function raBuild(){
  const nav=document.getElementById('teacherNav'),faqView=document.getElementById('teacherFaqView');
  if(!nav||!faqView||document.getElementById('tnBtnAssistant'))return;
  const btn=document.createElement('button');
  btn.className='tn-btn';btn.id='tnBtnAssistant';btn.type='button';
  btn.innerHTML='&#9632; Assistant';
  btn.onclick=()=>teacherShowView('assistant');
  const faqBtn=document.getElementById('tnBtnFaq');
  nav.insertBefore(btn,faqBtn||null);
  const v=document.createElement('div');
  v.id='teacherAssistantView';
  v.style.cssText='display:none;flex-direction:column;background:#f5f1eb';
  v.innerHTML=`<div style="padding:28px 36px;max-width:800px;margin:0 auto;width:100%;box-sizing:border-box">
    <div style="margin-bottom:16px">
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:600;color:#2d2520;margin:0">Retreat Assistant</h2>
      <p style="font-size:12.5px;color:#5a5048;margin:4px 0 0">Ask about your rooms, availability and your retreat. The assistant can add or remove rooms for you. / Pregunta sobre tus cuartos y tu retiro.</p>
    </div>
    <div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;height:min(560px,calc(100vh - 260px));min-height:380px">
      <div id="ama-chat-msgs" style="flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;background:#fafafa"></div>
      <div style="padding:10px 12px;border-top:1px solid #e5e7eb;background:#fff;display:flex;gap:8px">
        <textarea id="ama-chat-inp" onkeydown="_chatKeydown(event)" rows="1" placeholder="Ask a question… / Escribe tu pregunta…"
          style="flex:1;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px 12px;font-family:'Jost',sans-serif;font-size:14px;color:#1a2332;resize:none;outline:none;line-height:1.4;max-height:90px;overflow-y:auto"
          onfocus="this.style.borderColor='#3d8a8a'" onblur="this.style.borderColor='#e5e7eb'"></textarea>
        <button type="button" onclick="_chatSend()" title="Send" style="background:#3d8a8a;color:#fff;border:none;border-radius:10px;padding:0 18px;cursor:pointer;font-size:14px;font-weight:700;align-self:flex-end;height:40px">Send</button>
      </div>
    </div>
  </div></div>`;
  faqView.insertAdjacentElement('afterend',v);
}
function raOpenGreeting(){
  if(_chatHistory.length)return;
  const saved=_chatLoadLocal();
  if(saved.length){_chatHistory=saved;saved.forEach(m=>_chatAppend(m.role,m.content));}
  else _chatAppend('assistant',"Hi! I'm your Amansala Retreat Assistant. I can check room availability, add or remove rooms from your retreat, and answer your questions. How can I help you? / ¡Hola! Soy tu asistente de Amansala. ¿En qué te puedo ayudar?");
}
(function(){
  const prev=teacherShowView;
  teacherShowView=function(view){
    raBuild();
    prev.apply(this,arguments);
    const av=document.getElementById('teacherAssistantView'),ab=document.getElementById('tnBtnAssistant');
    if(!av)return;
    const on=view==='assistant';
    av.style.display=on?'flex':'none';
    if(ab)ab.classList.toggle('active',on);
    if(on){raOpenGreeting();setTimeout(()=>document.getElementById('ama-chat-inp')?.focus(),100);}
  };
  raBuild();
  // /<teacher>/assistant opens it directly
  try{if(new URLSearchParams(location.search).get('view')==='assistant')setTimeout(()=>{try{teacherShowView('assistant');}catch(e){}},600);}catch(e){}
})();
