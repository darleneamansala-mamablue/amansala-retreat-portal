// ===== spa-summary.js — "Summary" view on the Spa tab =====
// Loaded as a classic script AFTER spa.js / spa-calendar.js; shares global scope. Standalone: spaSetView and spaRender are wrapped, not edited.
// One printable page for a chosen day, laid out like the team's daily briefing (SPA Y TAROT / AGENDA DE SERVICIOS / pendientes):
// the spa host at Chica (click to choose), Grande and Chica start times, tarot location, who is working and in which room,
// the day's agenda (confirmed / prepaid / charged / no room match, using the portal's own spaResolveGuestForAppt rule),
// open gaps to sell per therapist, things to sort out, and the services we sell. Spanish or English.
// Data: reads SpaData + SpaAppointments (read-only). Writes ONLY its own app_store key spa_summary_settings:
//   { hosts:{date:'Name'}, defaultHost, starts:{date:{grande,chica}}, defaultStarts:{grande,chica}, tarot:{date:'text'},
//     working:{date:[therapistId,...]}, sellStart:'09:00', sellEnd:'18:00', minGap:45, lang:'es' }

let _sss={hosts:{},defaultHost:'',starts:{},defaultStarts:{},tarot:{},working:{},sellStart:'09:00',sellEnd:'18:00',minGap:45,lang:'es'};
let _sssDate='';
function sssEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function sssToMin(t){const [h,m]=String(t||'0:0').split(':').map(Number);return (h||0)*60+(m||0);}
function sssFromMin(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function sssFmt(t){const n=sssToMin(t);const h=Math.floor(n/60),m=n%60;return ((h%12)||12)+(m?':'+String(m).padStart(2,'0'):'')+(h>=12?' pm':' am');}
function sssDayLabel(ds){try{return new Date(ds+'T12:00:00').toLocaleDateString(_sss.lang==='en'?'en-US':'es-MX',{weekday:'long',month:'long',day:'numeric',year:'numeric'});}catch(e){return ds;}}
function sssToday(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
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
    ['hosts','starts','tarot','working','defaultStarts'].forEach(k=>{cur[k]={...(cur[k]||{})};});
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
function sssSetHost(name){sssSave(c=>{c.hosts[_sssDate]=name;});}
function sssSetStart(which,v){sssSave(c=>{c.starts[_sssDate]={...(c.starts[_sssDate]||{}),[which]:v};});}
function sssSetTarot(v){sssSave(c=>{c.tarot[_sssDate]=v;});}
function sssSetLang(l){sssSave(c=>{c.lang=l;});}
function sssSetDefaultHost(){
  const name=_sss.hosts[_sssDate]||_sss.defaultHost||'';
  if(!name){showToast('Pick a host first.');return;}
  sssSave(c=>{c.defaultHost=name;c.defaultStarts={...(c.defaultStarts||{}),...(c.starts[_sssDate]||{})};});showToast(name+' and the spa start times now apply to every day without its own pick.');
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

// The report itself (used on screen and in the print window).
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
function sssReportHtml(ds,forPrint){
  const T=SSS_T[_sss.lang==='en'?'en':'es'];
  const host=_sss.hosts[ds]||_sss.defaultHost||'';
  const st={...(_sss.defaultStarts||{}),...(_sss.starts[ds]||{})};
  const tarot=_sss.tarot[ds]||'';
  const working=sssWorking(ds);
  const therName=id=>{const t=(SpaData.therapists||[]).find(x=>x.id===id);return t?(t.firstName||''):'—';};
  const svcName=id=>(SpaData.services||[]).find(x=>x.id===id)?.name||'—';
  const appts=(SpaAppointments||[]).filter(a=>a.date===ds&&a.status!=='CANCELLED'&&a.start).slice().sort((a,b)=>a.start.localeCompare(b.start));
  const services=(SpaData.services||[]).filter(s=>s.active!==false).slice().sort((a,b)=>(a.category||'').localeCompare(b.category||'')||a.name.localeCompare(b.name));
  const money=n=>n==null||n===''?'—':'$'+Number(n);
  const th='style="text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b5f52;border-bottom:2px solid #e8dfd0"';
  const td='style="padding:6px 8px;border-bottom:1px solid #f0ebe0;font-size:13px;vertical-align:top"';
  const h2='style="font-family:\'Cormorant Garamond\',serif;font-size:20px;margin:22px 0 8px;color:#2d2520"';
  const firstStart=[st.grande,st.chica].filter(Boolean).sort()[0];
  const early=firstStart?appts.filter(a=>a.start<firstStart):[];
  let html=`<div style="font-family:'Jost',sans-serif;color:#2d2520"><div style="font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:600">${T.title}</div><div style="font-size:14px;color:#6b5f52">${sssEsc(sssDayLabel(ds))}</div>
  <div ${h2}>${T.spaTarot}</div><div style="font-size:14px;line-height:1.8">`;
  if(st.grande)html+=`• ${T.grande} <b>${sssFmt(st.grande)}</b><br>`;
  if(st.chica)html+=`• ${T.chica} <b>${sssFmt(st.chica)}</b><br>`;
  html+=host?`• <b>${T.hostLine(sssEsc(host))}</b><br>`:`• <b>${T.host}:</b> <span style="color:#b45309">${T.nohost}</span><br>`;
  if(tarot)html+=`• ${sssEsc(tarot)}<br>`;
  if(early.length)html+=`• ${T.early(early.length,sssFmt(firstStart))}<br>`;
  html+=`</div><div ${h2}>${T.who}</div>`;
  if(!working.length)html+=`<div style="font-size:13px;color:#b45309">${T.noRoster}</div>`;
  else html+=`<table style="width:100%;border-collapse:collapse"><tr><th ${th}>${T.th[0]}</th><th ${th}>${T.th[1]}</th><th ${th}>${T.th[2]}</th><th ${th}>${T.th[3]} (${sssFmt(_sss.sellStart)}–${sssFmt(_sss.sellEnd)})</th></tr>${working.map(t=>{
    const gaps=sssGaps(t,ds);
    const gapTxt=sssUnavailable(t,ds)?`<span style="color:#b45309">${T.unavail}</span>`:(gaps.length?gaps.map(g=>`${sssFmt(sssFromMin(g[0]))} – ${sssFmt(sssFromMin(g[1]))}`).join('<br>'):T.full);
    return `<tr><td ${td}><b>${sssEsc(sssTherName(t))}</b></td><td ${td}>${sssEsc(sssRoomName(t.defaultRoomId)||'—')}</td><td ${td}>${T.appts(sssApptCount(t,ds))}</td><td ${td}>${gapTxt}</td></tr>`;}).join('')}</table>`;
  html+=`<div ${h2}>${T.agenda}</div><div style="font-size:12px;color:#6b5f52;margin-bottom:6px">${T.legend}</div>`;
  const payTxt={prepaid:'💳 '+T.prepaid,charged:'✓ '+T.charged,pending:'🧾 '+T.pending,noRoom:'⚠️ '+T.noRoom,'':''};
  if(!appts.length)html+=`<div style="font-size:13px;color:#6b5f52">${T.noAppts}</div>`;
  else html+=`<table style="width:100%;border-collapse:collapse"><tr>${T.ath.map(x=>`<th ${th}>${x}</th>`).join('')}</tr>${appts.map(a=>`<tr><td ${td}>${sssFmt(a.start)}</td><td ${td}>${sssEsc(svcName(a.serviceId))}${a.duration?' · '+a.duration+' '+T.min:''}</td><td ${td}>${sssEsc(a.clientName||'')}</td><td ${td}>${sssEsc(therName(a.therapistId))}</td><td ${td}>${a.confirmed?'✅':'⏳'}${payTxt[sssPay(a)]?' · '+payTxt[sssPay(a)]:''}</td></tr>`).join('')}</table>`;
  // Things to sort out, built from the same agenda.
  const todo=[];
  const unconf=appts.filter(a=>!a.confirmed);
  if(unconf.length)todo.push(T.confirmPend(sssList(unconf.map(a=>therName(a.therapistId)),T)));
  const pend=appts.filter(a=>sssPay(a)==='pending');
  if(pend.length)todo.push(T.charge(sssList(pend.map(a=>a.clientName||'—'),T)));
  const noRoom=appts.filter(a=>sssPay(a)==='noRoom');
  if(noRoom.length)todo.push(T.room(sssList(noRoom.map(a=>a.clientName||'—'),T)));
  const tight=new Set();
  const byTher={};appts.forEach(a=>{(byTher[a.therapistId]=byTher[a.therapistId]||[]).push(a);});
  Object.keys(byTher).forEach(id=>{const l=byTher[id];for(let i=1;i<l.length;i++){if(sssToMin(l[i].start)-(sssToMin(l[i-1].start)+(Number(l[i-1].duration)||60))<15)tight.add(therName(id));}});
  if(tight.size)todo.push(T.rest(sssList([...tight],T)));
  html+=`<div ${h2}>${T.todo}</div>${todo.length?'<div style="font-size:14px;line-height:1.8">'+todo.map(x=>'• '+x).join('<br>')+'</div>':`<div style="font-size:13px;color:#6b5f52">${T.none}</div>`}`;
  html+=`<div ${h2}>${T.services(services.length)}</div><table style="width:100%;border-collapse:collapse"><tr>${T.sth.map(x=>`<th ${th}>${x}</th>`).join('')}</tr>${services.map(s=>`<tr><td ${td}>${sssEsc(s.name)}</td><td ${td}>${s.duration?s.duration+' '+T.min:'—'}</td><td ${td}>${money(s.price)}</td></tr>`).join('')}</table></div>`;
  return html;
}
function sssPrint(){
  const w=window.open('','_blank');if(!w){showToast('Allow pop-ups to print.');return;}
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Spa Summary ${sssEsc(_sssDate)}</title><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Jost:wght@400;600&display=swap" rel="stylesheet"><style>body{margin:28px}@media print{body{margin:12mm}}</style></head><body>${sssReportHtml(_sssDate,true)}<script>setTimeout(function(){window.print()},600)<\/script></body></html>`);
  w.document.close();
}

function sssRender(){
  const el=document.getElementById('spaContent');if(!el||typeof spaCurView==='undefined'||spaCurView!=='summary')return;
  if(!_sssDate)_sssDate=sssToday();
  const ds=_sssDate;
  const active=(SpaData.therapists||[]).filter(t=>t.active!==false);
  const workingIds=new Set(sssWorking(ds).map(t=>t.id));
  const host=_sss.hosts[ds]||_sss.defaultHost||'';
  const stv={...(_sss.defaultStarts||{}),...(_sss.starts[ds]||{})};
  const names=active.map(sssTherName).filter(Boolean).sort((a,b)=>a.localeCompare(b));
  const hostOpts=`<option value="">— choose —</option>`+names.map(n=>`<option value="${sssEsc(n)}" ${n===host?'selected':''}>${sssEsc(n)}</option>`).join('')+(host&&!names.includes(host)?`<option value="${sssEsc(host)}" selected>${sssEsc(host)}</option>`:'');
  const box='style="background:#fff;border:1.5px solid #e8dfd4;border-radius:14px;padding:16px 18px;margin-bottom:16px"';
  const inp='style="padding:7px 9px;border:1.5px solid #d6cfc4;border-radius:7px;font-family:\'Jost\',sans-serif;font-size:13px"';
  el.style.textAlign='left';
  el.innerHTML=`<div style="max-width:900px;margin:0 auto">
    <div ${box}><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
      <label style="font-size:12px;font-weight:700;color:#6b5f52">DAY<br><input type="date" value="${ds}" onchange="sssSetDate(this.value)" ${inp}></label>
      <label style="font-size:12px;font-weight:700;color:#6b5f52">SPA HOST AT CHICA<br><select onchange="sssSetHost(this.value)" ${inp}>${hostOpts}</select></label>
      <label style="font-size:12px;font-weight:700;color:#6b5f52">GRANDE SPA STARTS<br><input type="time" value="${sssEsc(stv.grande||'')}" onchange="sssSetStart('grande',this.value)" ${inp}></label>
      <label style="font-size:12px;font-weight:700;color:#6b5f52">CHICA SPA STARTS<br><input type="time" value="${sssEsc(stv.chica||'')}" onchange="sssSetStart('chica',this.value)" ${inp}></label>
      <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px" onclick="sssSetDefaultHost()" title="Use this host and these start times on every day that has no pick of its own">Use every day</button>
      <label style="font-size:12px;font-weight:700;color:#6b5f52">LANGUAGE<br><select onchange="sssSetLang(this.value)" ${inp}><option value="es" ${_sss.lang!=='en'?'selected':''}>Español</option><option value="en" ${_sss.lang==='en'?'selected':''}>English</option></select></label>
      <button class="btn btn-primary" style="padding:7px 16px;font-size:12.5px;margin-left:auto" onclick="sssPrint()">🖨 Print / Save PDF</button></div>
      <label style="display:block;margin-top:12px;font-size:12px;font-weight:700;color:#6b5f52">TAROT / NOTE FOR THE SPA SECTION<br><input type="text" value="${sssEsc(_sss.tarot[ds]||'')}" placeholder="e.g. Darlene will do the tarot readings in room 1A" onchange="sssSetTarot(this.value)" style="width:100%;box-sizing:border-box;padding:7px 9px;border:1.5px solid #d6cfc4;border-radius:7px;font-family:'Jost',sans-serif;font-size:13px"></label>
      <div style="margin-top:14px;font-size:12px;font-weight:700;color:#6b5f52">WHO IS WORKING THIS DAY — tick everyone on shift</div>
      <div style="display:flex;gap:6px 16px;flex-wrap:wrap;margin-top:6px">${active.map(t=>`<label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer"><input type="checkbox" ${workingIds.has(t.id)?'checked':''} onchange="sssToggleWorking('${sssEsc(t.id)}')">${sssEsc(sssTherName(t))}</label>`).join('')}</div>
      <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;font-size:12px;font-weight:700;color:#6b5f52">
        <label>SELLING HOURS FROM<br><input type="time" id="sssSellStart" value="${sssEsc(_sss.sellStart)}" ${inp}></label>
        <label>TO<br><input type="time" id="sssSellEnd" value="${sssEsc(_sss.sellEnd)}" ${inp}></label>
        <label>SHORTEST GAP WORTH LISTING<br><select id="sssMinGap" ${inp}>${[30,45,60,90].map(m=>`<option value="${m}" ${Number(_sss.minGap)===m?'selected':''}>${m} min</option>`).join('')}</select></label>
        <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px" onclick="sssSetHours()">Save hours</button></div></div>
    <div ${box}>${sssReportHtml(ds,false)}</div></div>`;
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
