// ===== spa-summary.js — "Summary" view on the Spa tab =====
// Loaded as a classic script AFTER spa.js / spa-calendar.js; shares global scope. Standalone: spaSetView and spaRender are wrapped, not edited.
// The spa part of the team's daily briefing, as WhatsApp-style text (*bold*, • bullets) that can be copied or printed:
//   💆 SPA Y TAROT  (Grande / Chica start times, who attends Chica, the spa host, tarot room, early-booking warning, extra lines)
//   📋 SERVICIOS POR TERAPEUTA  (one block per therapist: confirmed or pending, then each service with its charge status,
//   using the portal's own spaResolveGuestForAppt rule for "Sin habitación vinculada")
// Below it, a separate "selling sheet": who is working, in which room, open gaps to sell, and the services we sell.
// Data: reads SpaData + SpaAppointments (read-only). Writes ONLY its own app_store key spa_summary_settings:
//   { hosts:{date:'Name'}, hostRoles:{date:'de Seguridad'}, attendants:{date:'Name'}, defaultHost, defaultHostRole, defaultAttendant,
//     starts:{date:{grande,chica}}, defaultStarts:{grande,chica}, tarot:{date:'habitación 1A'}, notes:{date:'one line per row'},
//     working:{date:[therapistId,...]}, sellStart:'09:00', sellEnd:'18:00', minGap:45, lang:'es' (selling-sheet labels only) }

let _sss={hosts:{},hostRoles:{},attendants:{},notes:{},defaultHost:'',defaultHostRole:'',defaultAttendant:'',starts:{},defaultStarts:{},tarot:{},working:{},sellStart:'09:00',sellEnd:'18:00',minGap:45,lang:'es'};
let _sssDate='';
function sssEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function sssToMin(t){const [h,m]=String(t||'0:0').split(':').map(Number);return (h||0)*60+(m||0);}
function sssFromMin(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function sssFmt(t){const n=sssToMin(t);const h=Math.floor(n/60),m=n%60;return ((h%12)||12)+':'+String(m).padStart(2,'0')+(h>=12?' pm':' am');}
function sssDayLabel(ds){try{return new Date(ds+'T12:00:00').toLocaleDateString(_sss.lang==='en'?'en-US':'es-MX',{weekday:'long',month:'long',day:'numeric',year:'numeric'});}catch(e){return ds;}}
function sssToday(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
// First names as the team writes them (the Therapists list stores them without accents).
const SSS_ACCENTS={julian:'Julián',maria:'María',rubi:'Rubí',ivan:'Iván'};
function sssTherName(t){return ((t.firstName||'')+' '+(t.lastName||'')).trim();}
function sssRoomName(id){return (SpaData.rooms||[]).find(r=>r.id===id)?.name||'';}

async function sssLoad(){
  try{
    const r=await db.from('app_store').select('value').eq('key','spa_summary_settings').maybeSingle();
    if(r.data&&r.data.value&&typeof r.data.value==='object')_sss={..._sss,...r.data.value};
  }catch(e){}
}
// Re-reads the live blob and applies one change, so two people editing different days don't overwrite each other.
async function sssSave(mutate){
  try{
    const r=await db.from('app_store').select('value').eq('key','spa_summary_settings').maybeSingle();
    const cur={..._sss,...((r.data&&r.data.value)||{})};
    ['hosts','hostRoles','attendants','notes','starts','tarot','working','defaultStarts'].forEach(k=>{cur[k]={...(cur[k]||{})};});
    mutate(cur);
    const w=await db.from('app_store').upsert({key:'spa_summary_settings',value:cur,updated_at:new Date().toISOString()});
    if(w&&w.error)throw w.error;
    _sss=cur;
  }catch(e){showToast('Could not save — try again ('+(e.message||e)+')');}
  sssRender();
}

// Therapists on the roster for a day: the ones ticked; before anything is ticked, whoever already has an appointment that day.
function sssWorking(ds){
  const active=(SpaData.therapists||[]).filter(t=>t.active!==false);
  if(Array.isArray(_sss.working[ds]))return active.filter(t=>_sss.working[ds].includes(t.id));
  const ids=new Set((SpaAppointments||[]).filter(a=>a.date===ds&&a.status!=='CANCELLED'&&a.therapistId).map(a=>a.therapistId));
  return active.filter(t=>ids.has(t.id));
}
// Open windows between sellStart and sellEnd, at least minGap long, after taking out that therapist's appointments.
function sssGaps(t,ds){
  const lo=sssToMin(_sss.sellStart),hi=sssToMin(_sss.sellEnd),min=Number(_sss.minGap)||45;
  const busy=(SpaAppointments||[]).filter(a=>a.date===ds&&a.therapistId===t.id&&a.status!=='CANCELLED'&&a.start)
    .map(a=>{const sv=(SpaData.services||[]).find(s=>s.id===a.serviceId);const s=sssToMin(a.start);return [s,s+(Number(a.duration)||Number(sv?.duration)||60)+(Number(sv?.buffer)||0)];})
    .sort((a,b)=>a[0]-b[0]);
  const out=[];let cur=lo;
  busy.forEach(([s,e])=>{if(s-cur>=min)out.push([cur,Math.min(s,hi)]);cur=Math.max(cur,e);});
  if(hi-cur>=min)out.push([cur,hi]);
  return out.filter(g=>g[1]-g[0]>=min);
}
function sssApptCount(t,ds){return (SpaAppointments||[]).filter(a=>a.date===ds&&a.therapistId===t.id&&a.status!=='CANCELLED').length;}
function sssUnavailable(t,ds){try{return typeof scIsAvailable==='function'&&!scIsAvailable(sssTherName(t),ds);}catch(e){return false;}}

function sssSetDate(v){if(v){_sssDate=v;sssRender();}}
function sssSetHost(name){sssSave(c=>{c.hosts[_sssDate]=String(name||'').trim();});}
function sssSetHostRole(v){sssSave(c=>{c.hostRoles[_sssDate]=String(v||'').trim();});}
function sssSetAttendant(v){sssSave(c=>{c.attendants[_sssDate]=String(v||'').trim();});}
function sssSetNotes(v){sssSave(c=>{c.notes[_sssDate]=v;});}
function sssSetStart(which,v){sssSave(c=>{c.starts[_sssDate]={...(c.starts[_sssDate]||{}),[which]:v};});}
function sssSetTarot(v){sssSave(c=>{c.tarot[_sssDate]=v;});}
function sssSetLang(l){sssSave(c=>{c.lang=l;});}
function sssSetDefaultHost(){
  const d=_sssDate;
  sssSave(c=>{
    c.defaultHost=c.hosts[d]||c.defaultHost||'';c.defaultHostRole=c.hostRoles[d]||c.defaultHostRole||'';c.defaultAttendant=c.attendants[d]||c.defaultAttendant||'';
    c.defaultStarts={...(c.defaultStarts||{}),...(c.starts[d]||{})};
  });
  showToast('Host, Chica attendant and start times now apply to every day without its own pick.');
}
function sssToggleWorking(id){
  const cur=sssWorking(_sssDate).map(t=>t.id);
  const next=cur.includes(id)?cur.filter(x=>x!==id):cur.concat(id);
  sssSave(c=>{c.working[_sssDate]=next;});
}
function sssSetHours(){
  const s=document.getElementById('sssSellStart')?.value,e=document.getElementById('sssSellEnd')?.value,g=Number(document.getElementById('sssMinGap')?.value)||45;
  if(!s||!e||sssToMin(e)<=sssToMin(s)){showToast('Pick an end time after the start time.');return;}
  sssSave(c=>{c.sellStart=s;c.sellEnd=e;c.minGap=g;});
}

// ---- Selling sheet + briefing text ----
const SSS_T={
  es:{title:'Resumen del Spa',host:'Anfitriona/o del spa en Chica',nohost:'sin elegir todavía',spaTarot:'SPA Y TAROT',grande:'Spa Grande: inicio a las',chica:'Spa Chica: inicio a las',
    hostLine:n=>`${n} estará en Chica atendiendo el spa.`,early:(n,t)=>`Hay ${n===1?'un servicio registrado':n+' servicios registrados'} antes del inicio del spa (${t}): confirmar ubicación.`,
    who:'Quién trabaja y dónde',noRoster:'Nadie en la lista de este día todavía — marca a los terapeutas que trabajan.',th:['Terapeuta','Sala / lugar','Reservas','Huecos para vender'],
    appts:n=>n===1?'1 cita':n+' citas',unavail:'Marcó no disponible en Confirmaciones',full:'Agenda llena',
    agenda:'AGENDA DE SERVICIOS',legend:'✅ Terapeuta confirmado · ⏳ Confirmación pendiente  |  💳 Prepagado · ✓ Cargo realizado · 🧾 Cargo pendiente · ⚠️ Sin habitación vinculada',
    ath:['Hora','Servicio','Cliente','Terapeuta','Confirmación / pago'],noAppts:'No hay servicios registrados este día.',
    charged:'Cargo realizado',prepaid:'Prepagado',pending:'Cargo pendiente',noRoom:'Sin habitación vinculada',
    todo:'PENDIENTES DE COORDINACIÓN',confirmPend:l=>`Confirmar los servicios pendientes con ${l}.`,charge:l=>`Aplicar los cargos pendientes de ${l}.`,room:l=>`Revisar la habitación y el estado de cobro de ${l}.`,
    rest:l=>`Verificar los tiempos de descanso de ${l} entre servicios.`,none:'Nada pendiente.',services:n=>`Servicios que vendemos (${n})`,sth:['Servicio','Duración','Precio (USD)'],min:'min',
    and:' y ',gapsHdr:'Huecos'},
  en:{title:'Spa Summary',host:'Spa host at Chica',nohost:'not chosen yet',spaTarot:'SPA & TAROT',grande:'Grande spa: starts at',chica:'Chica spa: starts at',
    hostLine:n=>`${n} will be at Chica running the spa.`,early:(n,t)=>`${n===1?'1 service is':n+' services are'} booked before the spa starts (${t}): confirm location.`,
    who:'Who is working and where',noRoster:'No one on the roster for this day yet — tick the therapists who are working.',th:['Therapist','Room / location','Booked','Open gaps to sell'],
    appts:n=>n===1?'1 appt':n+' appts',unavail:'Marked unavailable in Staff Confirmations',full:'Fully booked',
    agenda:'SERVICE AGENDA',legend:'✅ Therapist confirmed · ⏳ Confirmation pending  |  💳 Prepaid · ✓ Charged · 🧾 Charge pending · ⚠️ No room linked',
    ath:['Time','Service','Guest','Therapist','Confirmation / payment'],noAppts:'No services booked this day.',
    charged:'Charged',prepaid:'Prepaid',pending:'Charge pending',noRoom:'No room linked',
    todo:'TO COORDINATE',confirmPend:l=>`Confirm the pending services with ${l}.`,charge:l=>`Apply the pending charges for ${l}.`,room:l=>`Check the room and payment status for ${l}.`,
    rest:l=>`Check ${l}'s rest time between services.`,none:'Nothing pending.',services:n=>`Services we sell (${n})`,sth:['Service','Time','Price (USD)'],min:'min',
    and:' and ',gapsHdr:'Gaps'}};
function sssList(arr,T){const a=[...new Set(arr)];return a.length<3?a.join(T.and):a.slice(0,-1).join(', ')+T.and+a[a.length-1];}
// Payment marker for one appointment, using the same rules as the Spa dashboard rows.
function sssPay(a){
  if(a.prepaid)return 'prepaid';
  if(a.folioStatus==='POSTED')return 'charged';
  if(a.guestType!=='hotel')return '';
  let r=null;try{r=spaResolveGuestForAppt(a);}catch(e){}
  return (r&&(r.match||r.bkMatch))?'pending':'noRoom';
}

// Selling sheet: who is working and where, open gaps to sell, and the services we sell.
function sssSellingHtml(ds){
  const T=SSS_T[_sss.lang==='en'?'en':'es'];
  const working=sssWorking(ds);
  const services=(SpaData.services||[]).filter(s=>s.active!==false).slice().sort((a,b)=>(a.category||'').localeCompare(b.category||'')||a.name.localeCompare(b.name));
  const money=n=>n==null||n===''?'—':'$'+Number(n);
  const th='style="text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b5f52;border-bottom:2px solid #e8dfd0"';
  const td='style="padding:6px 8px;border-bottom:1px solid #f0ebe0;font-size:13px;vertical-align:top"';
  const h2='style="font-family:\'Cormorant Garamond\',serif;font-size:20px;margin:18px 0 8px;color:#2d2520"';
  let html=`<div style="font-family:'Jost',sans-serif;color:#2d2520"><div style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600">${T.title} — ${sssEsc(sssDayLabel(ds))}</div><div ${h2}>${T.who}</div>`;
  if(!working.length)html+=`<div style="font-size:13px;color:#b45309">${T.noRoster}</div>`;
  else html+=`<table style="width:100%;border-collapse:collapse"><tr><th ${th}>${T.th[0]}</th><th ${th}>${T.th[1]}</th><th ${th}>${T.th[2]}</th><th ${th}>${T.th[3]} (${sssFmt(_sss.sellStart)}–${sssFmt(_sss.sellEnd)})</th></tr>${working.map(t=>{
    const gaps=sssGaps(t,ds);
    const gapTxt=sssUnavailable(t,ds)?`<span style="color:#b45309">${T.unavail}</span>`:(gaps.length?gaps.map(g=>`${sssFmt(sssFromMin(g[0]))} – ${sssFmt(sssFromMin(g[1]))}`).join('<br>'):T.full);
    return `<tr><td ${td}><b>${sssEsc(sssTherName(t))}</b></td><td ${td}>${sssEsc(sssRoomName(t.defaultRoomId)||'—')}</td><td ${td}>${T.appts(sssApptCount(t,ds))}</td><td ${td}>${gapTxt}</td></tr>`;}).join('')}</table>`;
  html+=`<div ${h2}>${T.services(services.length)}</div><table style="width:100%;border-collapse:collapse"><tr>${T.sth.map(x=>`<th ${th}>${x}</th>`).join('')}</tr>${services.map(s=>`<tr><td ${td}>${sssEsc(s.name)}</td><td ${td}>${s.duration?s.duration+' '+T.min:'—'}</td><td ${td}>${money(s.price)}</td></tr>`).join('')}</table></div>`;
  return html;
}

// ---- The briefing text (always Spanish: it is the message to the team) ----
const SSS_ES_DAYS=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const SSS_ES_MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function sssEsDate(ds){const d=new Date(ds+'T12:00:00');const w=SSS_ES_DAYS[d.getDay()];return w.charAt(0).toUpperCase()+w.slice(1)+' '+d.getDate()+' de '+SSS_ES_MONTHS[d.getMonth()]+' de '+d.getFullYear();}
// "Masaje 60 min", "Sanación maya 90 min", "Reflexología" — the short names the team uses.
function sssShortService(a){
  const sv=(SpaData.services||[]).find(x=>x.id===a.serviceId);const n=sv?.name||'';
  const dur=Number(a.duration)||Number(sv?.duration)||0;const mins=dur?' '+dur+' min':'';
  if(/tarot/i.test(n))return '';
  if(/reflex/i.test(n))return 'Reflexología';
  if(/mayan healing|mayan egg/i.test(n))return 'Sanación maya'+mins;
  if(/crystal/i.test(n))return 'Cristales'+mins;
  if(/massage|masaje|deep tissue|foot/i.test(n))return 'Masaje'+mins;
  return n+mins;
}
function sssPayWord(k){return {prepaid:'Prepagado',charged:'Cargo realizado',pending:'Cargo pendiente'}[k]||'';}
function sssBriefText(ds){
  const st={...(_sss.defaultStarts||{}),...(_sss.starts[ds]||{})};
  const host=_sss.hosts[ds]||_sss.defaultHost||'',role=_sss.hostRoles[ds]??_sss.defaultHostRole??'';
  const att=_sss.attendants[ds]||_sss.defaultAttendant||'';
  const tarotRoom=(_sss.tarot[ds]||'').trim();
  const extra=String(_sss.notes[ds]||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const appts=(SpaAppointments||[]).filter(a=>a.date===ds&&a.status!=='CANCELLED'&&a.start).slice().sort((a,b)=>a.start.localeCompare(b.start));
  const therFirst=id=>{const t=(SpaData.therapists||[]).find(x=>x.id===id);const f=t?(t.firstName||''):'';return SSS_ACCENTS[f.toLowerCase()]||f;};
  const isTarot=a=>/tarot/i.test((SpaData.services||[]).find(x=>x.id===a.serviceId)?.name||'');
  const L=[];
  L.push('☀️ *¡BUENOS DÍAS, EQUIPO!*','*'+sssEsDate(ds)+'*','','💆 *SPA Y TAROT*','');
  if(st.grande)L.push('• Spa Grande inicia: *'+sssFmt(st.grande)+'*');
  if(st.chica)L.push('• Spa Chica inicia: *'+sssFmt(st.chica)+'*');
  if(att)L.push('• '+att+' estará en Chica atendiendo el spa.');
  if(host)L.push('• *'+host+(role?', '+role:'')+', estará en Chica y será el anfitrión del spa.*');
  const tarotAppts=appts.filter(isTarot);
  if(tarotAppts.length&&tarotRoom){const tn=therFirst(tarotAppts[0].therapistId)||'El terapeuta';L.push('• '+tn+' realizará el tarot en *'+tarotRoom+'*.');}
  const first=[st.grande,st.chica].filter(Boolean).sort()[0];
  const early=first?appts.filter(a=>a.start<first):[];
  early.forEach(a=>{
    const word=/^Masaje/.test(sssShortService(a))?'Masaje':'Servicio';
    L.push('• '+word+' de las *'+sssFmt(a.start)+'*'+(early.length>1&&a.clientName?' ('+a.clientName+')':'')+': ubicación por confirmar, por ser anterior al inicio '+(st.grande&&st.chica?'de ambos spas.':'del spa.'));
  });
  extra.forEach(x=>L.push('• '+x));
  L.push('','📋 *SERVICIOS POR TERAPEUTA*');
  if(!appts.length)L.push('','No hay servicios registrados este día.');
  // Group by therapist, biggest block of the day first (by first appointment time).
  const groups=[];const idx={};
  appts.forEach(a=>{const k=a.therapistId||'_none';if(!(k in idx)){idx[k]=groups.length;groups.push({id:k,list:[]});}groups[idx[k]].list.push(a);});
  const gTarotOnly=g=>g.list.every(isTarot);
  groups.sort((a,b)=>(gTarotOnly(a)-gTarotOnly(b))||(b.list.length-a.list.length));
  groups.forEach(g=>{
    const name=(g.id==='_none'?'SIN ASIGNAR':therFirst(g.id).toUpperCase());
    const tarotOnly=g.list.every(isTarot);
    L.push('','*'+name+(tarotOnly&&tarotRoom?' — TAROT EN '+tarotRoom.replace(/^habitaci[oó]n\s*/i,'').toUpperCase():'')+'*');
    const conf=g.list.filter(a=>a.confirmed),unc=g.list.filter(a=>!a.confirmed);
    const single=g.list.length===1;
    if(!single){
      if(!unc.length)L.push(tarotOnly?'✅ Lecturas confirmadas.':'✅ Servicios confirmados por el terapeuta.');
      else if(!conf.length)L.push(tarotOnly?'⏳ Confirmación pendiente de las lecturas.':'⏳ Confirmación pendiente.');
      else L.push('⏳ Confirmación pendiente, excepto '+sssList(conf.map(a=>a.clientName||'—'),SSS_T.es)+'.');
    }
    g.list.forEach(a=>{
      const pay=sssPay(a),svc=sssShortService(a);
      const showConf=unc.length&&conf.length&&a.confirmed;   // only when it differs from the block header
      L.push('','• *'+sssFmt(a.start)+' — '+(a.clientName||'—')+'*');
      if(single){
        if(svc)L.push(svc);
        L.push([a.confirmed?'✅ Confirmado':'⏳ Sin confirmar',sssPayWord(pay)].filter(Boolean).join(' | '));
      }else{
        const bits=[];
        if(svc)bits.push(svc);
        if(showConf)bits.push('✅ Confirmado');
        if(sssPayWord(pay))bits.push(sssPayWord(pay));
        if(bits.length)L.push(bits.join(' | '));
      }
      if(pay==='noRoom')L.push('⚠️ Sin habitación vinculada');
    });
  });
  return L.join('\n');
}
// WhatsApp-style text -> HTML (bold only; everything else stays as typed).
function sssTextHtml(t){return sssEsc(t).replace(/\*([^*\n]+)\*/g,'<b>$1</b>').replace(/\n/g,'<br>');}
function sssCopy(){
  const t=sssBriefText(_sssDate);
  (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>showToast('Copied — paste it into WhatsApp.')).catch(()=>showToast('Could not copy — select the text and copy it.'));
}

function sssPrint(withSheet){
  const w=window.open('','_blank');if(!w){showToast('Allow pop-ups to print.');return;}
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Spa Summary ${sssEsc(_sssDate)}</title><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Jost:wght@400;600&display=swap" rel="stylesheet"><style>body{margin:28px}@media print{body{margin:12mm}}</style></head><body><div style="font-family:'Jost',sans-serif;font-size:15px;line-height:1.55">${sssTextHtml(sssBriefText(_sssDate))}</div>${withSheet?'<div style="page-break-before:always"></div>'+sssSellingHtml(_sssDate):''}<script>setTimeout(function(){window.print()},600)<\/script></body></html>`);
  w.document.close();
}

function sssRender(){
  const el=document.getElementById('spaContent');if(!el||typeof spaCurView==='undefined'||spaCurView!=='summary')return;
  if(!_sssDate)_sssDate=sssToday();
  const ds=_sssDate;
  const active=(SpaData.therapists||[]).filter(t=>t.active!==false);
  const workingIds=new Set(sssWorking(ds).map(t=>t.id));
  const host=_sss.hosts[ds]||_sss.defaultHost||'',role=_sss.hostRoles[ds]??_sss.defaultHostRole??'',att=_sss.attendants[ds]||_sss.defaultAttendant||'';
  const stv={...(_sss.defaultStarts||{}),...(_sss.starts[ds]||{})};
  const names=active.map(sssTherName).filter(Boolean).sort((a,b)=>a.localeCompare(b));
  const box='style="background:#fff;border:1.5px solid #e8dfd4;border-radius:14px;padding:16px 18px;margin-bottom:16px"';
  const inp='style="padding:7px 9px;border:1.5px solid #d6cfc4;border-radius:7px;font-family:\'Jost\',sans-serif;font-size:13px"';
  const lbl='style="font-size:12px;font-weight:700;color:#6b5f52"';
  el.style.textAlign='left';
  el.innerHTML=`<div style="max-width:900px;margin:0 auto">
    <div ${box}>
      <datalist id="sssNames">${names.map(n=>`<option value="${sssEsc(n)}">`).join('')}</datalist>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
        <label ${lbl}>DAY<br><input type="date" value="${ds}" onchange="sssSetDate(this.value)" ${inp}></label>
        <label ${lbl}>GRANDE SPA STARTS<br><input type="time" value="${sssEsc(stv.grande||'')}" onchange="sssSetStart('grande',this.value)" ${inp}></label>
        <label ${lbl}>CHICA SPA STARTS<br><input type="time" value="${sssEsc(stv.chica||'')}" onchange="sssSetStart('chica',this.value)" ${inp}></label>
        <label ${lbl}>ATTENDS THE SPA AT CHICA<br><input type="text" list="sssNames" value="${sssEsc(att)}" placeholder="e.g. Rubí" onchange="sssSetAttendant(this.value)" ${inp}></label></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">
        <label ${lbl}>SPA HOST AT CHICA<br><input type="text" list="sssNames" value="${sssEsc(host)}" placeholder="pick or type a name" onchange="sssSetHost(this.value)" ${inp}></label>
        <label ${lbl}>HOST'S ROLE (optional)<br><input type="text" value="${sssEsc(role)}" placeholder="e.g. de Seguridad" onchange="sssSetHostRole(this.value)" ${inp}></label>
        <label ${lbl}>TAROT ROOM<br><input type="text" value="${sssEsc(_sss.tarot[ds]||'')}" placeholder="e.g. habitación 1A" onchange="sssSetTarot(this.value)" ${inp}></label>
        <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px" onclick="sssSetDefaultHost()" title="Use this host, attendant and these start times on every day that has no pick of its own">Use every day</button></div>
      <label style="display:block;margin-top:10px;${lbl.slice(7,-1)}">EXTRA LINES FOR THE SPA SECTION (one per line)<br><textarea rows="2" onchange="sssSetNotes(this.value)" placeholder="e.g. Registro por aclarar respecto al temazcal de las 7:15 pm." style="width:100%;box-sizing:border-box;padding:7px 9px;border:1.5px solid #d6cfc4;border-radius:7px;font-family:'Jost',sans-serif;font-size:13px">${sssEsc(_sss.notes[ds]||'')}</textarea></label>
      <div style="margin-top:12px;font-size:12px;font-weight:700;color:#6b5f52">WHO IS WORKING THIS DAY — tick everyone on shift (used for the selling sheet)</div>
      <div style="display:flex;gap:6px 16px;flex-wrap:wrap;margin-top:6px">${active.map(t=>`<label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer"><input type="checkbox" ${workingIds.has(t.id)?'checked':''} onchange="sssToggleWorking('${sssEsc(t.id)}')">${sssEsc(sssTherName(t))}</label>`).join('')}</div></div>
    <div ${box}><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px"><b style="font-size:15px;flex:1">Briefing text</b>
      <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px" onclick="sssCopy()">Copy for WhatsApp</button>
      <button class="btn btn-primary" style="padding:6px 14px;font-size:12px" onclick="sssPrint(false)">🖨 Print / Save PDF</button></div>
      <div style="font-family:'Jost',sans-serif;font-size:14.5px;line-height:1.55;color:#2d2520">${sssTextHtml(sssBriefText(ds))}</div></div>
    <div ${box}><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;font-size:12px;font-weight:700;color:#6b5f52;margin-bottom:10px"><b style="font-size:15px;color:#2d2520;flex:1">Selling sheet — open gaps and services</b>
        <label>FROM<br><input type="time" id="sssSellStart" value="${sssEsc(_sss.sellStart)}" ${inp}></label>
        <label>TO<br><input type="time" id="sssSellEnd" value="${sssEsc(_sss.sellEnd)}" ${inp}></label>
        <label>SHORTEST GAP<br><select id="sssMinGap" ${inp}>${[30,45,60,90].map(m=>`<option value="${m}" ${Number(_sss.minGap)===m?'selected':''}>${m} min</option>`).join('')}</select></label>
        <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px" onclick="sssSetHours()">Save hours</button>
        <label>LANGUAGE<br><select onchange="sssSetLang(this.value)" ${inp}><option value="es" ${_sss.lang!=='en'?'selected':''}>Español</option><option value="en" ${_sss.lang==='en'?'selected':''}>English</option></select></label>
        <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px" onclick="sssPrint(true)">🖨 Print both</button></div>
      ${sssSellingHtml(ds)}</div></div>`;
}

(function(){
  // Toolbar button, added next to the existing view buttons.
  function addBtn(){
    const anchor=document.getElementById('spaViewPayroll');
    if(!anchor||document.getElementById('spaViewSummary'))return;
    const b=document.createElement('button');
    b.id='spaViewSummary';b.textContent='📋 Summary';b.setAttribute('onclick',"spaSetView('summary')");
    b.style.cssText=anchor.style.cssText;
    b.style.background='transparent';b.style.color='var(--dark)';
    anchor.insertAdjacentElement('afterend',b);
  }
  addBtn();document.addEventListener('DOMContentLoaded',addBtn);
  const prevSet=spaSetView;
  spaSetView=function(v){
    const r=prevSet.apply(this,arguments);
    const b=document.getElementById('spaViewSummary');
    if(b){b.style.background=v==='summary'?'var(--teal,#2d6a6a)':'transparent';b.style.color=v==='summary'?'#fff':'var(--dark)';}
    return r;
  };
  const prevRender=spaRender;
  spaRender=function(){
    if(spaCurView!=='summary')return prevRender.apply(this,arguments);
    const c=document.getElementById('spaContent');if(c){c.style.padding='';}
    const w=document.getElementById('spaAddBtnWrap');if(w)w.innerHTML='';
    sssLoad().then(sssRender);sssRender();
  };
})();
