// ===== GUEST CHAT (WhatsApp/SMS via Twilio) =====
// Ported from staging's js/modules/messages.js — same conversation-list/thread UI,
// same `messages` table, same send-message.js/whatsapp-webhook.js backend (already
// live in this portal, Twilio credentials already configured). Adapted from an ES
// module (import/export, its own `db`/`toast`/`escHtml`) to this app's classic-script
// global scope, reusing the portal's own `db`, `showToast`, `escHtml`.

let _gcMessages=[],_gcSelectedPhone=null,_gcSubscribed=false,_gcSending=false,_gcSearchQ='';

async function gcInit(){
  const el=document.getElementById('gcRoot');
  if(!el)return;
  if(!_gcMessages.length) el.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:300px;color:#9ca3af">Cargando mensajes…</div>';
  await _gcLoad();
  _gcSubscribe();
  _gcRedraw();
}

async function _gcLoad(){
  const {data,error}=await db.from('messages').select('*').order('sent_at',{ascending:true}).limit(2000);
  if(error){console.error('messages load:',error);return;}
  _gcMessages=data||[];
}

function _gcSubscribe(){
  if(_gcSubscribed)return;
  _gcSubscribed=true;
  db.channel('messages-rt').on('postgres_changes',{event:'*',schema:'public',table:'messages'},payload=>{
    if(payload.eventType==='INSERT'){_gcMessages.push(payload.new);}
    else if(payload.eventType==='UPDATE'){const i=_gcMessages.findIndex(m=>m.id===payload.new.id);if(i!==-1)_gcMessages[i]=payload.new;}
    _gcRedraw();
  }).subscribe();
}

function _gcConversations(){
  const map=new Map();
  for(const m of _gcMessages){
    const p=m.phone;
    if(!map.has(p))map.set(p,{phone:p,guestName:m.guest_name,room:m.room,bookingId:m.booking_id,messages:[]});
    const conv=map.get(p);
    conv.messages.push(m);
    if(m.guest_name&&!conv.guestName)conv.guestName=m.guest_name;
    if(m.room&&!conv.room)conv.room=m.room;
  }
  return [...map.values()].sort((a,b)=>{
    const ta=a.messages.at(-1)?.sent_at||'',tb=b.messages.at(-1)?.sent_at||'';
    return tb.localeCompare(ta);
  });
}

function _gcUnreadCount(conv){return conv.messages.filter(m=>m.direction==='in'&&!m.read_at).length;}

function _gcFmtTime(isoStr){
  if(!isoStr)return'';
  const d=new Date(isoStr),now=new Date(),diff=now-d;
  if(diff<86400000&&d.getDate()===now.getDate())return d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  if(diff<172800000)return'Ayer';
  return d.toLocaleDateString('es-MX',{day:'numeric',month:'short'});
}

function _gcFmtPhone(phone){
  const d=phone.replace(/\D/g,'');
  if(d.length===12&&d.startsWith('52'))return `+52 ${d.slice(2,4)} ${d.slice(4,8)} ${d.slice(8)}`;
  if(d.length===11&&d.startsWith('1'))return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return phone;
}

async function _gcMarkRead(phone){
  const unread=_gcMessages.filter(m=>m.phone===phone&&m.direction==='in'&&!m.read_at);
  if(!unread.length)return;
  const ids=unread.map(m=>m.id),now=new Date().toISOString();
  await db.from('messages').update({read_at:now}).in('id',ids);
  unread.forEach(m=>{m.read_at=now;});
}

async function _gcSendMessage(phone,body,conv){
  if(_gcSending||!body.trim())return;
  _gcSending=true;
  const channel=conv?.channel||'whatsapp';
  const optimistic={id:`opt-${Date.now()}`,direction:'out',phone,body:body.trim(),channel,
    guest_name:conv?.guestName||null,booking_id:conv?.bookingId||null,room:conv?.room||null,
    sent_at:new Date().toISOString(),status:'sending'};
  _gcMessages.push(optimistic);
  _gcRedraw();
  try{
    const res=await fetch('/.netlify/functions/send-message',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({to:phone,body:body.trim(),channel,guestName:conv?.guestName||null,bookingId:conv?.bookingId||null,room:conv?.room||null})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Error al enviar');
    const idx=_gcMessages.findIndex(m=>m.id===optimistic.id);
    if(idx!==-1)_gcMessages.splice(idx,1);
  }catch(err){
    showToast(err.message);
    const idx=_gcMessages.findIndex(m=>m.id===optimistic.id);
    if(idx!==-1)_gcMessages[idx].status='error';
  }finally{
    _gcSending=false;
    _gcRedraw();
  }
}

function _gcQuickLinks(conv){
  if(!conv)return'';
  const bk=conv.bookingId;
  if(!bk)return'';
  const links=[
    {label:'💳 Link de pago',url:`${location.origin}/guest-pay.html?bk=${bk}`},
    {label:'🏨 Pre check-in',url:`${location.origin}/transport-form.html?bk=${bk}`},
    {label:'🧾 Folio',url:`${location.origin}/guest-pay.html?bk=${bk}&tab=folio`},
    {label:'🔗 Portal del retiro',url:`${location.origin}/retreat-portal.html?bk=${bk}`},
  ];
  return links.map(l=>`<button onclick="_gcSendLink('${escHtml(conv.phone)}','${escHtml(l.url)}','${escHtml(l.label)}')"
    style="padding:5px 11px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;background:#f9fafb;cursor:pointer;white-space:nowrap">${l.label}</button>`).join('');
}

function _gcFilteredConvs(){
  const convs=_gcConversations();
  return _gcSearchQ?convs.filter(c=>(c.guestName||'').toLowerCase().includes(_gcSearchQ)||c.phone.includes(_gcSearchQ)||(c.room||'').toLowerCase().includes(_gcSearchQ)):convs;
}

function _gcRedrawList(){
  const listEl=document.getElementById('gc-conv-list');
  if(!listEl){_gcRedraw();return;}
  const filtered=_gcFilteredConvs();
  const selConv=filtered.find(c=>c.phone===_gcSelectedPhone)||filtered[0]||null;
  listEl.innerHTML=filtered.length?filtered.map(c=>_gcConvItemHtml(c,selConv)).join(''):
    `<div style="padding:40px 20px;text-align:center;color:#9ca3af;font-size:13px">${_gcMessages.length?'Sin resultados':'No hay mensajes aún'}<br><span style="font-size:11px">Los mensajes de WhatsApp/SMS<br>aparecerán aquí</span></div>`;
}

function _gcRedraw(){
  const root=document.getElementById('gcRoot');
  if(!root)return;
  const filtered=_gcFilteredConvs();
  const selConv=filtered.find(c=>c.phone===_gcSelectedPhone)||filtered[0]||null;
  if(selConv&&_gcSelectedPhone!==selConv.phone)_gcSelectedPhone=selConv.phone;

  root.innerHTML=`<div style="display:flex;height:calc(100vh - 130px);font-family:inherit;background:#fff;border:1.5px solid var(--border);border-radius:12px;overflow:hidden">
    <div style="width:300px;min-width:240px;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;background:#fff">
      <div style="padding:16px 16px 12px;border-bottom:1px solid #e5e7eb">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <h2 style="font-size:17px;font-weight:700;color:#111827;margin:0;flex:1">💬 Mensajes</h2>
          <button onclick="_gcShowGuestPicker()" title="Nueva conversación" style="width:28px;height:28px;border-radius:50%;border:none;background:#e0f2fe;color:#0369a1;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:700">+</button>
        </div>
        <input id="gc-search" type="text" placeholder="Buscar conversaciones…" oninput="_gcSearch(this.value)"
          style="width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none">
      </div>
      <div id="gc-conv-list" style="flex:1;overflow-y:auto">
        ${filtered.length?filtered.map(c=>_gcConvItemHtml(c,selConv)).join(''):`<div style="padding:40px 20px;text-align:center;color:#9ca3af;font-size:13px">No hay mensajes aún<br><span style="font-size:11px">Los mensajes de WhatsApp/SMS<br>aparecerán aquí</span></div>`}
      </div>
    </div>
    <div id="gc-thread-panel" style="flex:1;display:flex;flex-direction:column;background:#f8fafc;min-width:0">
      ${selConv?_gcThreadHtml(selConv):_gcEmptyHtml()}
    </div>
  </div>`;

  const thread=document.getElementById('gc-thread');
  if(thread)thread.scrollTop=thread.scrollHeight;
  if(selConv)_gcMarkRead(selConv.phone);
}

function _gcConvItemHtml(conv,selConv){
  const isActive=conv.phone===selConv?.phone;
  const last=conv.messages.at(-1);
  const unread=_gcUnreadCount(conv);
  const initials=(conv.guestName||conv.phone.slice(-4)).split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
  const preview=last?(last.direction==='out'?'↗ ':'')+(last.body||'[media]'):'';
  return `<div onclick="_gcSelect('${escHtml(conv.phone)}')" style="padding:12px 16px;cursor:pointer;border-bottom:1px solid #f3f4f6;display:flex;gap:10px;align-items:flex-start;${isActive?'background:#e0f2fe;':'background:#fff;'}">
    <div style="width:38px;height:38px;border-radius:50%;background:${isActive?'#0284c7':'#94a3b8'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">${initials}</div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
        <span style="font-size:13px;font-weight:${unread?'700':'500'};color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">${escHtml(conv.guestName||_gcFmtPhone(conv.phone))}</span>
        <span style="font-size:11px;color:#9ca3af;flex-shrink:0">${_gcFmtTime(last?.sent_at)}</span>
      </div>
      ${conv.room?`<div style="font-size:11px;color:#6b7280;margin-bottom:2px">${escHtml(conv.room)}</div>`:''}
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px">${escHtml(preview.slice(0,50))}${preview.length>50?'…':''}</span>
        ${unread?`<span style="background:#10b981;color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px;flex-shrink:0">${unread}</span>`:''}
      </div>
    </div>
  </div>`;
}

function _gcThreadHtml(conv){
  const bubbles=conv.messages.map(m=>{
    const isOut=m.direction==='out';
    const status=isOut?(m.status==='sending'?' ⏳':m.status==='error'?' ❌':' ✓'):'';
    return `<div style="display:flex;justify-content:${isOut?'flex-end':'flex-start'};margin-bottom:6px">
      <div style="max-width:75%;background:${isOut?'#dcf8c6':'#fff'};border-radius:${isOut?'16px 4px 16px 16px':'4px 16px 16px 16px'};padding:8px 12px;box-shadow:0 1px 2px rgba(0,0,0,.08);font-size:13px;color:#111827">
        ${m.media_url?`<div style="margin-bottom:4px"><a href="${escHtml(m.media_url)}" target="_blank" style="color:#0369a1;font-size:12px">📎 Adjunto</a></div>`:''}
        <div style="white-space:pre-wrap;word-break:break-word">${escHtml(m.body||'')}</div>
        <div style="font-size:10px;color:#9ca3af;text-align:right;margin-top:3px">${_gcFmtTime(m.sent_at)}${status}</div>
      </div>
    </div>`;
  }).join('');
  const ql=_gcQuickLinks(conv);
  return `<div style="padding:12px 20px;border-bottom:1px solid #e5e7eb;background:#fff;display:flex;align-items:center;gap:12px">
    <div style="width:36px;height:36px;border-radius:50%;background:#0284c7;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700">${(conv.guestName||conv.phone.slice(-4)).split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}</div>
    <div>
      <div style="font-size:14px;font-weight:700;color:#111827">${escHtml(conv.guestName||_gcFmtPhone(conv.phone))}</div>
      <div style="font-size:12px;color:#6b7280">${_gcFmtPhone(conv.phone)}${conv.room?` · ${escHtml(conv.room)}`:''}${conv.bookingId?` · <span onclick="_bdGoToRegistration('${conv.bookingId}')" style="color:#0369a1;text-decoration:underline;cursor:pointer">Ver reserva</span>`:''}</div>
    </div>
  </div>
  <div id="gc-thread" style="flex:1;overflow-y:auto;padding:16px 20px">
    ${bubbles||`<div style="text-align:center;color:#9ca3af;font-size:13px;margin-top:40px">Inicio de conversación</div>`}
  </div>
  ${ql?`<div style="padding:8px 16px;border-top:1px solid #e5e7eb;background:#fff;display:flex;gap:6px;overflow-x:auto;flex-wrap:nowrap">${ql}</div>`:''}
  <div style="padding:12px 16px;border-top:1px solid #e5e7eb;background:#fff;display:flex;gap:8px">
    <textarea id="gc-input" rows="2" placeholder="Escribe un mensaje…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();_gcSend()}"
      style="flex:1;resize:none;border:1px solid #d1d5db;border-radius:10px;padding:8px 12px;font-size:13px;font-family:inherit;outline:none;line-height:1.4"></textarea>
    <button onclick="_gcSend()" style="align-self:flex-end;padding:9px 16px;background:#0284c7;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">Enviar ↗</button>
  </div>`;
}

function _gcEmptyHtml(){
  return `<div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#9ca3af;gap:12px">
    <div style="font-size:48px">💬</div>
    <div style="font-size:15px;font-weight:600;color:#374151">Mensajes de WhatsApp y SMS</div>
    <div style="font-size:13px;text-align:center;max-width:340px;line-height:1.5">Los mensajes entrantes aparecerán aquí automáticamente.<br>Selecciona una conversación o inicia una nueva.</div>
  </div>`;
}

function _gcSelect(phone){_gcSelectedPhone=phone;_gcMarkRead(phone).then(_gcRedraw);}
function _gcSearch(q){_gcSearchQ=q.toLowerCase().trim();_gcRedrawList();}
function _gcSend(){
  const input=document.getElementById('gc-input');
  if(!input||!_gcSelectedPhone)return;
  const body=input.value.trim();
  if(!body)return;
  input.value='';
  const conv=_gcConversations().find(c=>c.phone===_gcSelectedPhone);
  _gcSendMessage(_gcSelectedPhone,body,conv);
}
function _gcSendLink(phone,url,label){
  const conv=_gcConversations().find(c=>c.phone===phone);
  _gcSendMessage(phone,`${label}: ${url}`,conv);
}

// ─── TEMPLATES ───────────────────────────────────────────────
const GC_TEMPLATES=[
  {id:'welcome',label:'Bienvenida',body:'Hola {nombre}, bienvenido/a a Amansala 🌊 Estamos felices de tenerte aquí. ¿Tienes alguna pregunta sobre tu estancia?'},
  {id:'payment',label:'Link de pago',body:'Hola {nombre}, aquí tu link de pago para tu reserva en Amansala: {link_pago}'},
  {id:'checkin',label:'Pre check-in',body:'Hola {nombre}, para agilizar tu llegada puedes llenar tu información aquí: {link_checkin}'},
  {id:'arrival',label:'Recordatorio llegada',body:'Hola {nombre}, te recordamos que tu llegada a Amansala es mañana. El check-in es a partir de las 3pm. ¡Te esperamos!'},
  {id:'checkout',label:'Recordatorio salida',body:'Hola {nombre}, recordatorio de que tu check-out es mañana antes de las 12pm. Fue un placer tenerte en Amansala 🙏'},
  {id:'custom',label:'Mensaje libre',body:''},
];

function _gcHasCountryCode(phone){return /^\+\d{7,}/.test(phone.trim());}
function _gcPhoneWarning(phone){
  if(!phone)return'';
  if(_gcHasCountryCode(phone))return'';
  const digits=phone.replace(/\D/g,'');
  const hint=digits.length===10?'¿Es de EE.UU.? Agrega +1 al inicio. ¿México? Agrega +52.':'Agrega el código de país al inicio (ej: +1, +52, +44)';
  return `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:7px;padding:8px 10px;font-size:12px;color:#92400e;margin-top:6px">⚠️ Sin código de país — WhatsApp/SMS no llegará. ${hint}</div>`;
}

// ─── GUEST PICKER ────────────────────────────────────────────
let _gcPickerGuests=[],_gcPickerSearch='',_gcPickerChannel='whatsapp',_gcPickerTpl='welcome',_gcPickerSel=null,_gcPickerPhone='';

function _gcLoadPickerGuests(){
  // Reuse already-loaded AppData instead of a fresh Supabase query — this portal
  // keeps registrations/bookings in memory already (unlike staging, which queried
  // Supabase directly here).
  const today=fmtISO(new Date());
  const seen=new Set();
  const list=[];
  (AppData.regs||[]).forEach(reg=>{
    const bk=AppData.bookings.find(b=>b.id===reg.bookingId);
    const ci=reg.checkIn||bk?.startDate||null;
    const co=reg.checkOut||bk?.endDate||null;
    const status=!ci||!co?'upcoming':(ci<=today&&co>today)?'in-house':(ci>today)?'upcoming':'past';
    (reg.guests||[]).forEach(g=>{
      if(!g.name||!g.phone)return;
      const phone=g.phone.trim();
      if(seen.has(phone))return;
      seen.add(phone);
      list.push({name:g.name,phone,room:reg.room||'',bookingId:reg.bookingId||'',status,retreat:bk?.retreatName||'',checkIn:ci||'',checkOut:co||''});
    });
  });
  const order={'in-house':0,upcoming:1,past:2};
  list.sort((a,b)=>{const od=order[a.status]-order[b.status];if(od!==0)return od;return (a.checkIn||'').localeCompare(b.checkIn||'');});
  _gcPickerGuests=list;
}

function _gcShowGuestPicker(){
  let overlay=document.getElementById('gc-picker-overlay');
  if(overlay)overlay.remove();
  overlay=document.createElement('div');
  overlay.id='gc-picker-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.onclick=(e)=>{if(e.target===overlay)overlay.remove();};
  document.body.appendChild(overlay);
  _gcPickerSel=null;_gcPickerSearch='';_gcPickerChannel='whatsapp';_gcPickerTpl='welcome';_gcPickerPhone='';
  _gcLoadPickerGuests();
  _gcRenderPicker(overlay);
}

function _gcRenderPicker(overlay){
  const filtered=_gcPickerGuests.filter(g=>!_gcPickerSearch||g.name.toLowerCase().includes(_gcPickerSearch)||g.phone.includes(_gcPickerSearch)||(g.room||'').toLowerCase().includes(_gcPickerSearch));
  const tpl=GC_TEMPLATES.find(t=>t.id===_gcPickerTpl)||GC_TEMPLATES[0];
  const selG=_gcPickerSel;
  const activePhone=_gcPickerPhone||selG?.phone||'';
  const msgBody=tpl.body.replace('{nombre}',selG?.name||'huésped')
    .replace('{link_pago}',selG?.bookingId?`${location.origin}/guest-pay.html?bk=${selG.bookingId}`:'[link]')
    .replace('{link_checkin}',selG?.bookingId?`${location.origin}/transport-form.html?bk=${selG.bookingId}`:'[link]');

  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;width:540px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.3)">
    <div style="padding:20px 24px 16px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:16px;font-weight:700;color:#111827">Nueva conversación</div>
      <button onclick="document.getElementById('gc-picker-overlay').remove()" style="border:none;background:none;font-size:20px;color:#9ca3af;cursor:pointer;line-height:1">×</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:16px">
      <div>
        <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">HUÉSPED</div>
        <input id="gc-picker-search" type="text" placeholder="Buscar por nombre, cuarto o teléfono…" oninput="_gcPickerSearchFn(this.value)"
          style="width:100%;box-sizing:border-box;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;outline:none;margin-bottom:8px">
        <div style="border:1px solid #e5e7eb;border-radius:9px;overflow:hidden;max-height:200px;overflow-y:auto">
          ${filtered.length===0?`<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">Sin resultados</div>`:filtered.map(g=>{
            const isSel=selG?.phone===g.phone;
            const badge=g.status==='in-house'?`<span style="font-size:10px;background:#dcfce7;color:#15803d;border-radius:4px;padding:1px 5px;font-weight:600">EN CASA</span>`
              :g.status==='upcoming'?`<span style="font-size:10px;background:#e0f2fe;color:#0369a1;border-radius:4px;padding:1px 5px;font-weight:600">PRÓXIMO</span>`
              :`<span style="font-size:10px;background:#f3f4f6;color:#6b7280;border-radius:4px;padding:1px 5px;font-weight:600">PASADO</span>`;
            return `<div onclick="_gcPickerSelectGuest('${escHtml(g.phone)}')" style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;${isSel?'background:#e0f2fe;':'background:#fff;'}border-bottom:1px solid #f3f4f6">
              <div style="width:32px;height:32px;border-radius:50%;background:${isSel?'#0284c7':'#94a3b8'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${g.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}</div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px"><span style="font-size:13px;font-weight:600;color:#111827">${escHtml(g.name)}</span>${badge}</div>
                <div style="font-size:12px;color:#6b7280">${g.room?escHtml(g.room)+' · ':''}${_gcFmtPhone(g.phone)}</div>
              </div>
              ${isSel?'<div style="color:#0284c7;font-size:16px">✓</div>':''}
            </div>`;
          }).join('')}
        </div>
        ${selG?`<div style="margin-top:10px">
          <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:4px">TELÉFONO (con código de país)</div>
          <input id="gc-picker-phone" type="tel" value="${escHtml(activePhone)}" oninput="_gcPickerEditPhone(this.value)" placeholder="+1 555 000 0000"
            style="width:100%;box-sizing:border-box;padding:8px 12px;font-size:13px;font-family:inherit;border:1.5px solid ${_gcHasCountryCode(activePhone)?'#86efac':'#fcd34d'};border-radius:9px;outline:none;color:#111827">
          ${_gcPhoneWarning(activePhone)}
        </div>`:''}
      </div>
      <div>
        <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px">CANAL</div>
        <div style="display:flex;gap:8px">
          ${[['whatsapp','💬 WhatsApp'],['sms','📱 SMS']].map(([id,label])=>`<button onclick="_gcPickerChannelFn('${id}')" style="flex:1;padding:9px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;border:2px solid ${_gcPickerChannel===id?'#0284c7':'#e5e7eb'};background:${_gcPickerChannel===id?'#e0f2fe':'#fff'};color:${_gcPickerChannel===id?'#0284c7':'#6b7280'}">${label}</button>`).join('')}
        </div>
      </div>
      <div>
        <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px">MENSAJE</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
          ${GC_TEMPLATES.map(t=>`<button onclick="_gcPickerTplFn('${t.id}')" style="padding:5px 11px;border-radius:20px;font-size:12px;cursor:pointer;border:1.5px solid ${_gcPickerTpl===t.id?'#0284c7':'#e5e7eb'};background:${_gcPickerTpl===t.id?'#e0f2fe':'#fff'};color:${_gcPickerTpl===t.id?'#0284c7':'#6b7280'};font-weight:500">${t.label}</button>`).join('')}
        </div>
        <textarea id="gc-picker-body" rows="3" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;outline:none;resize:vertical;line-height:1.5;color:#111827">${escHtml(msgBody)}</textarea>
      </div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #e5e7eb;display:flex;gap:10px;justify-content:flex-end">
      <button onclick="document.getElementById('gc-picker-overlay').remove()" style="padding:9px 18px;border:1px solid #e5e7eb;border-radius:9px;font-size:13px;font-weight:600;background:#fff;color:#374151;cursor:pointer">Cancelar</button>
      <button onclick="_gcPickerSendFn()" style="padding:9px 20px;border:none;border-radius:9px;font-size:13px;font-weight:600;background:${selG?'#0284c7':'#94a3b8'};color:#fff;cursor:${selG?'pointer':'default'}">${_gcPickerChannel==='whatsapp'?'💬':'📱'} Enviar mensaje</button>
    </div>
  </div>`;
}

function _gcPickerSearchFn(q){
  _gcPickerSearch=q.toLowerCase().trim();
  const overlay=document.getElementById('gc-picker-overlay');
  _gcRenderPicker(overlay);
  const inp=document.getElementById('gc-picker-search');
  if(inp){inp.focus();inp.value=q;}
}
function _gcPickerSelectGuest(phone){
  _gcPickerSel=_gcPickerGuests.find(g=>g.phone===phone)||null;
  _gcPickerPhone=_gcPickerSel?.phone||'';
  _gcRenderPicker(document.getElementById('gc-picker-overlay'));
}
function _gcPickerEditPhone(val){
  _gcPickerPhone=val;
  const inp=document.getElementById('gc-picker-phone');
  if(inp)inp.style.borderColor=_gcHasCountryCode(val)?'#86efac':'#fcd34d';
}
function _gcPickerChannelFn(ch){_gcPickerChannel=ch;_gcRenderPicker(document.getElementById('gc-picker-overlay'));}
function _gcPickerTplFn(id){
  _gcPickerTpl=id;
  _gcRenderPicker(document.getElementById('gc-picker-overlay'));
  if(id==='custom')setTimeout(()=>document.getElementById('gc-picker-body')?.focus(),50);
}
async function _gcPickerSendFn(){
  if(!_gcPickerSel){showToast('Selecciona un huésped primero');return;}
  const phone=(document.getElementById('gc-picker-phone')?.value||_gcPickerPhone||_gcPickerSel.phone).trim();
  if(!phone){showToast('Número de teléfono requerido');return;}
  if(!_gcHasCountryCode(phone)){showToast('Agrega el código de país al número (ej: +1, +52)');return;}
  const body=document.getElementById('gc-picker-body')?.value?.trim();
  if(!body){showToast('El mensaje no puede estar vacío');return;}
  const g=_gcPickerSel;
  if(!_gcMessages.find(m=>m.phone===phone)){
    _gcMessages.push({id:`pre-${Date.now()}`,direction:'out',phone,body,channel:_gcPickerChannel,
      guest_name:g.name,booking_id:g.bookingId,room:g.room,sent_at:new Date().toISOString(),status:'sending'});
  }
  _gcSelectedPhone=phone;
  document.getElementById('gc-picker-overlay')?.remove();
  _gcRedraw();
  _gcSendMessage(phone,body,{guestName:g.name,bookingId:g.bookingId,room:g.room,channel:_gcPickerChannel});
}
