// ===== contract-library.js — Contract Templates library (add / edit / duplicate / archive contracts) =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as commissions.js).
// Standalone module: does NOT touch contracts.js. Templates live in Supabase app_store key
// 'contract_library' so every device (and later the teacher portal) reads the same wording.
// Each template = {id,name,type,status,sections:[{id,kind:'text'|'rates',title,body|rates,note}],
//                  updatedAt,updatedBy,history:[{savedAt,savedBy,name,sections}]}

const CL_KEY='contract_library';
const CL_TYPES=[
  {v:'retreat-high',l:'Retreat — High Season'},
  {v:'retreat-low',l:'Retreat — Low Season'},
  {v:'wedding',l:'Wedding'},
  {v:'event',l:'Event / Other'}
];
const CL_PLACEHOLDERS=[
  ['leaderName','Client / leader name'],['retreatName','Retreat / event name'],['leaderEmail','Email'],
  ['startDate','Arrival date'],['endDate','Departure date'],['nights','Nights'],['pax','Guests'],
  ['gratuity','Gratuity $ pp/night'],['depositDue','Deposit due'],['fullPaymentDue','Full payment due'],
  ['cancelDeadline','Cancellation deadline'],['lastMinuteDue','Last-minute cutoff'],
  ['roomRelease','Room release date'],['flightDue','Flight info due']
];
let _clLib=null,_clSel=null,_clDirty=false,_clLastFocus=null;

function clEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function clId(){return 'ct'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function clUser(){try{return (typeof userName!=='undefined'&&userName)||'staff';}catch(e){return 'staff';}}

// ---------- storage ----------
async function clFetch(){
  const {data,error}=await db.from('app_store').select('value').eq('key',CL_KEY).maybeSingle();
  if(error)throw error;
  const v=data&&data.value;
  return (v&&Array.isArray(v.templates))?v:null;
}
async function clWrite(lib){
  const {error}=await db.from('app_store').upsert({key:CL_KEY,value:lib,updated_at:new Date().toISOString()});
  if(error)throw error;
}
// Starter library: the two retreat contracts are copied from the current Edit Template wording
// (so nothing is lost); Wedding is an empty outline — wording is yours to supply.
function clSeed(){
  let t;try{t=loadContractTmpl();}catch(e){t=null;}
  const tv=x=>t?applyTmplVars(x,t):(x||'');
  const retreat=(season)=>{
    const hi=season==='high';
    return [
      {id:clId(),kind:'rates',title:'Room Rates — '+(hi?'High Season (Oct – Apr)':'Low Season (May – Sep)'),
        rates:t?JSON.parse(JSON.stringify(hi?t.highRates:t.lowRates)):[],note:t?(hi?t.highInclusions:t.lowInclusions):''},
      {id:clId(),kind:'text',title:'Payment Terms',body:t?tv(t.paymentTerms):''},
      {id:clId(),kind:'text',title:'Cancellation Policy',body:t?tv(t.cancellationPolicy):''},
      {id:clId(),kind:'text',title:'Teacher / Leader Complimentary Policy',body:t?tv(hi?t.teacherPolicyHigh:t.teacherPolicyLow):''},
      {id:clId(),kind:'text',title:'Yoga Shalas',body:t?tv(t.yogaPolicy):''},
      {id:clId(),kind:'text',title:'Property Policies',body:t?tv(t.propertyPolicy):''},
      {id:clId(),kind:'text',title:'Liability & Governing Terms',body:t?tv(t.liabilityPolicy):''}
    ];
  };
  const now=new Date().toISOString();
  const mk=(name,type,sections,status)=>({id:clId(),name,type,status,sections,updatedAt:now,updatedBy:'system',history:[]});
  return {templates:[
    mk('Retreat Contract — High Season','retreat-high',retreat('high'),'active'),
    mk('Retreat Contract — Low Season','retreat-low',retreat('low'),'active'),
    mk('Wedding Contract','wedding',[
      {id:clId(),kind:'text',title:'Event Details',body:''},
      {id:clId(),kind:'text',title:'Payment Terms',body:''},
      {id:clId(),kind:'text',title:'Cancellation Policy',body:''},
      {id:clId(),kind:'text',title:'Liability & Governing Terms',body:''}
    ],'draft')
  ]};
}

// ---------- render ----------
async function contractLibRender(){
  const el=document.getElementById('contractLibContent');if(!el)return;
  el.innerHTML='<div style="padding:40px;text-align:center;color:var(--muted)">Loading…</div>';
  try{
    _clLib=await clFetch();
    if(!_clLib){_clLib=clSeed();await clWrite(_clLib);}
  }catch(e){
    el.innerHTML='<div style="padding:40px;color:#b91c1c">Could not load contract templates: '+clEsc(e.message||e)+'</div>';return;
  }
  if(!_clLib.templates.find(t=>t.id===_clSel))_clSel=(_clLib.templates.find(t=>t.status!=='archived')||_clLib.templates[0]||{}).id||null;
  _clDirty=false;clDraw();
}
function clCur(){return _clLib&&_clLib.templates.find(t=>t.id===_clSel);}
function clDraw(){
  const el=document.getElementById('contractLibContent');if(!el)return;
  const list=_clLib.templates.filter(t=>t.status!=='archived');
  const arch=_clLib.templates.filter(t=>t.status==='archived');
  const item=t=>`<div onclick="clSelect('${t.id}')" style="padding:10px 12px;border-radius:8px;cursor:pointer;margin-bottom:6px;border:1.5px solid ${t.id===_clSel?'var(--teal,#2d6a6a)':'transparent'};background:${t.id===_clSel?'#fff':'transparent'}">
      <div style="font-size:13px;font-weight:600;color:#1a2332">${clEsc(t.name)}</div>
      <div style="font-size:11px;color:#7f8c9a;margin-top:2px">${clEsc((CL_TYPES.find(x=>x.v===t.type)||{}).l||t.type)}${t.status==='draft'?' · <b style="color:#b45309">Draft</b>':''}</div></div>`;
  el.innerHTML=`<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
    <div class="panel-toolbar"><h2>Contract Templates</h2>
      <div class="toolbar-right"><button class="btn btn-primary" onclick="clNew()">+ New Contract</button></div></div>
    <div style="flex:1;display:flex;overflow:hidden;background:#f0ece4">
      <div style="width:270px;flex-shrink:0;overflow-y:auto;padding:14px;border-right:1px solid var(--border)">
        ${list.map(item).join('')||'<div style="font-size:12px;color:#7f8c9a">No contracts yet.</div>'}
        ${arch.length?`<div style="font-size:11px;font-weight:700;color:#7f8c9a;margin:14px 0 6px;text-transform:uppercase;letter-spacing:1px">Archived</div>${arch.map(item).join('')}`:''}
      </div>
      <div id="clEditor" style="flex:1;overflow-y:auto;padding:20px"></div>
    </div></div>`;
  clDrawEditor();
}
function clDrawEditor(){
  const box=document.getElementById('clEditor');if(!box)return;
  const t=clCur();
  if(!t){box.innerHTML='<div style="color:#7f8c9a">Select or create a contract.</div>';return;}
  const inp='width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:\'Jost\',sans-serif;font-size:13px;box-sizing:border-box';
  const secs=t.sections.map((s,i)=>{
    const head=`<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
      <input value="${clEsc(s.title)}" oninput="clSecField(${i},'title',this.value)" style="${inp};font-weight:700" placeholder="Section heading">
      <button class="btn-icon" title="Move up" onclick="clMove(${i},-1)">↑</button><button class="btn-icon" title="Move down" onclick="clMove(${i},1)">↓</button>
      <button class="btn-icon" title="Delete section" onclick="clDelSec(${i})" style="color:#b91c1c">✕</button></div>`;
    if(s.kind==='rates'){
      const rows=(s.rates||[]).map((r,j)=>`<tr>
        <td><input value="${clEsc(r.room)}" oninput="clRate(${i},${j},'room',this.value)" style="${inp}"></td>
        <td><input value="${clEsc(r.solo)}" oninput="clRate(${i},${j},'solo',this.value)" style="${inp};text-align:center"></td>
        <td><input value="${clEsc(r.sharing)}" oninput="clRate(${i},${j},'sharing',this.value)" style="${inp};text-align:center"></td>
        <td><button class="btn-icon" onclick="clDelRate(${i},${j})" style="color:#b91c1c">✕</button></td></tr>`).join('');
      return `<div style="background:#fff;border-radius:10px;padding:14px;margin-bottom:12px">${head}
        <table style="width:100%;border-collapse:separate;border-spacing:0 4px"><thead><tr style="font-size:11px;color:#7f8c9a;text-align:left"><th>Room type</th><th>Solo / night</th><th>Sharing pp / night</th><th></th></tr></thead><tbody>${rows}</tbody></table>
        <button class="btn btn-secondary" onclick="clAddRate(${i})" style="margin:6px 0 10px">+ Add room</button>
        <textarea oninput="clSecField(${i},'note',this.value)" onfocus="_clLastFocus=this" rows="3" style="${inp}" placeholder="Note under the table (inclusions, etc.)">${clEsc(s.note)}</textarea></div>`;
    }
    return `<div style="background:#fff;border-radius:10px;padding:14px;margin-bottom:12px">${head}
      <textarea id="clTa${i}" oninput="clSecField(${i},'body',this.value)" onfocus="_clLastFocus=this" rows="${Math.max(5,Math.min(18,(s.body||'').split('\n').length+2))}" style="${inp};line-height:1.6" placeholder="Write this section. Leave a blank line between paragraphs.">${clEsc(s.body)}</textarea></div>`;
  }).join('');
  box.innerHTML=`<div style="max-width:820px">
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div style="flex:2;min-width:220px"><label style="font-size:11px;color:#7f8c9a">Contract name</label><input id="clName" value="${clEsc(t.name)}" oninput="clMeta('name',this.value)" style="${inp}"></div>
      <div style="flex:1;min-width:180px"><label style="font-size:11px;color:#7f8c9a">Type</label><select onchange="clMeta('type',this.value)" style="${inp}">${CL_TYPES.map(x=>`<option value="${x.v}"${x.v===t.type?' selected':''}>${x.l}</option>`).join('')}</select></div>
      <div style="flex:1;min-width:140px"><label style="font-size:11px;color:#7f8c9a">Status</label><select onchange="clMeta('status',this.value)" style="${inp}"><option value="active"${t.status==='active'?' selected':''}>Active</option><option value="draft"${t.status==='draft'?' selected':''}>Draft</option><option value="archived"${t.status==='archived'?' selected':''}>Archived</option></select></div></div>
    <div style="background:#fff;border-radius:10px;padding:12px 14px;margin-bottom:14px">
      <div style="font-size:11.5px;color:#7f8c9a;margin-bottom:6px">Click a field to drop it into the text where your cursor is. It fills in automatically for each booking:</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${CL_PLACEHOLDERS.map(([k,l])=>`<button class="btn btn-secondary" style="padding:3px 9px;font-size:11.5px" title="${clEsc(l)}" onmousedown="event.preventDefault()" onclick="clInsertVar('${k}')">${clEsc(l)}</button>`).join('')}</div></div>
    ${secs}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
      <button class="btn btn-secondary" onclick="clAddSec('text')">+ Text section</button>
      <button class="btn btn-secondary" onclick="clAddSec('rates')">+ Rates table</button></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;position:sticky;bottom:0;background:#f0ece4;padding:10px 0">
      <button class="btn btn-primary" id="clSaveBtn" onclick="clSave()">Save contract</button>
      <button class="btn btn-secondary" onclick="clPreview()">Preview</button>
      <button class="btn btn-secondary" onclick="clDuplicate()">Duplicate</button>
      <button class="btn btn-secondary" onclick="clHistory()">Version history</button>
      <span id="clDirtyMsg" style="align-self:center;font-size:12px;color:#b45309"></span></div></div>`;
}

// ---------- edits (in-memory until Save) ----------
function clMark(){_clDirty=true;const m=document.getElementById('clDirtyMsg');if(m)m.textContent='Unsaved changes';}
function clMeta(k,v){const t=clCur();if(!t)return;t[k]=v;clMark();if(k!=='name')clDraw();}
function clSecField(i,k,v){const t=clCur();t.sections[i][k]=v;clMark();}
function clRate(i,j,k,v){clCur().sections[i].rates[j][k]=v;clMark();}
function clAddRate(i){clCur().sections[i].rates.push({room:'',solo:'',sharing:''});clMark();clDrawEditor();}
function clDelRate(i,j){clCur().sections[i].rates.splice(j,1);clMark();clDrawEditor();}
function clAddSec(kind){
  const t=clCur();
  t.sections.push(kind==='rates'?{id:clId(),kind:'rates',title:'Room Rates',rates:[{room:'',solo:'',sharing:''}],note:''}:{id:clId(),kind:'text',title:'New Section',body:''});
  clMark();clDrawEditor();
}
function clMove(i,d){const s=clCur().sections,j=i+d;if(j<0||j>=s.length)return;[s[i],s[j]]=[s[j],s[i]];clMark();clDrawEditor();}
function clDelSec(i){if(!confirm('Delete this section from the contract?'))return;clCur().sections.splice(i,1);clMark();clDrawEditor();}
function clInsertVar(k){
  const ta=_clLastFocus;
  if(!ta||!document.body.contains(ta)){showToast('Click inside a section first');return;}
  const tag='{{'+k+'}}',a=ta.selectionStart||0,b=ta.selectionEnd||0;
  ta.value=ta.value.slice(0,a)+tag+ta.value.slice(b);
  ta.selectionStart=ta.selectionEnd=a+tag.length;ta.focus();
  ta.dispatchEvent(new Event('input'));
}
function clSelect(id){
  if(_clDirty&&!confirm('You have unsaved changes. Leave without saving?'))return;
  if(_clDirty){contractLibRender().then(()=>{_clSel=id;clDraw();});return;}
  _clSel=id;clDraw();
}
function clNew(){
  if(_clDirty&&!confirm('You have unsaved changes. Discard them?'))return;
  const name=prompt('Name for the new contract (e.g. "Wedding Contract")');if(!name||!name.trim())return;
  const t={id:clId(),name:name.trim(),type:'event',status:'draft',sections:[{id:clId(),kind:'text',title:'Event Details',body:''}],updatedAt:new Date().toISOString(),updatedBy:clUser(),history:[]};
  _clLib.templates.push(t);_clSel=t.id;_clDirty=true;clDraw();clMark();
}
function clDuplicate(){
  const t=clCur();if(!t)return;
  const c=JSON.parse(JSON.stringify(t));
  c.id=clId();c.name=t.name+' (copy)';c.status='draft';c.history=[];
  c.sections.forEach(s=>s.id=clId());
  _clLib.templates.push(c);_clSel=c.id;_clDirty=true;clDraw();clMark();
}

// ---------- save (merge only THIS template into the freshest stored library) ----------
async function clSave(){
  const t=clCur();if(!t)return;
  if(!t.name.trim()){showToast('Give the contract a name');return;}
  const btn=document.getElementById('clSaveBtn');if(btn){btn.disabled=true;btn.textContent='Saving…';}
  try{
    const fresh=(await clFetch())||{templates:[]};
    const old=fresh.templates.find(x=>x.id===t.id);
    const hist=(old&&old.history)||[];
    if(old)hist.unshift({savedAt:old.updatedAt,savedBy:old.updatedBy,name:old.name,sections:old.sections});
    t.history=hist.slice(0,25);
    t.updatedAt=new Date().toISOString();t.updatedBy=clUser();
    const i=fresh.templates.findIndex(x=>x.id===t.id);
    if(i>=0)fresh.templates[i]=t;else fresh.templates.push(t);
    await clWrite(fresh);
    _clLib=fresh;_clDirty=false;
    showToast('Contract saved ✓');clDraw();
  }catch(e){
    showToast('Save failed: '+(e.message||e));
    if(btn){btn.disabled=false;btn.textContent='Save contract';}
  }
}

// ---------- fill + preview ----------
function clFillVars(bk){
  const f=d=>{try{return fmtShort(d);}catch(e){return '';}};
  if(!bk)return {leaderName:'[Client Name]',retreatName:'[Event Name]',leaderEmail:'[email]',startDate:'[Arrival]',endDate:'[Departure]',nights:'[#]',pax:'[#]',gratuity:'30',depositDue:'[date]',fullPaymentDue:'[date]',cancelDeadline:'[date]',lastMinuteDue:'[date]',roomRelease:'[date]',flightDue:'[date]'};
  const s=pd(bk.startDate);
  return {leaderName:bk.leaderName||'',retreatName:bk.retreatName||'',leaderEmail:bk.leaderEmail||'',
    startDate:fmtDate(bk.startDate),endDate:fmtDate(bk.endDate),nights:getNights(bk),pax:bk.pax||'',gratuity:getTip(bk),
    depositDue:f(addDays(new Date(),7)),fullPaymentDue:f(addDays(s,-42)),cancelDeadline:f(addDays(s,-112)),
    lastMinuteDue:f(addDays(s,-21)),roomRelease:f(addDays(s,-45)),flightDue:f(addDays(s,-30))};
}
function clFillText(text,vars){return clEsc(text||'').replace(/\{\{(\w+)\}\}/g,(m,k)=>k in vars?clEsc(vars[k]):m);}
// Public: HTML for a template filled with a booking (used by preview now; contract flow later)
function clRenderContractHTML(t,bk){
  const vars=clFillVars(bk);
  const hr='<hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0">';
  const h=x=>`<h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;margin-bottom:10px">${clFillText(x,vars)}</h3>`;
  const para=x=>clFillText(x,vars).split('\n\n').filter(p=>p.trim()).map(p=>`<p style="font-size:12.5px;line-height:1.85;color:#374151;margin-top:8px">${p.replace(/\n/g,'<br>')}</p>`).join('');
  const body=t.sections.map(s=>{
    if(s.kind==='rates'){
      const rows=(s.rates||[]).map((r,i)=>`<tr${i%2?' style="background:#fafafa"':''}><td style="padding:5px 10px;border:1px solid #e5e7eb;font-size:12px">${clEsc(r.room)}</td><td style="padding:5px 10px;border:1px solid #e5e7eb;text-align:center;font-size:12px">${clEsc(r.solo)||'—'}</td><td style="padding:5px 10px;border:1px solid #e5e7eb;text-align:center;font-size:12px">${clEsc(r.sharing)||'—'}</td></tr>`).join('');
      return h(s.title)+`<table style="width:100%;border-collapse:collapse;margin:8px 0 4px"><tr style="background:#f3f4f6"><th style="text-align:left;padding:6px 10px;font-size:12px;border:1px solid #e5e7eb">Room Type</th><th style="padding:6px 10px;font-size:12px;border:1px solid #e5e7eb">Solo / Night</th><th style="padding:6px 10px;font-size:12px;border:1px solid #e5e7eb">Sharing pp / Night</th></tr>${rows}</table>`+para(s.note);
    }
    return h(s.title)+para(s.body);
  }).join(hr);
  return `<div style="max-width:720px;margin:0 auto">
    <div style="text-align:center;margin-bottom:24px"><img src="/logo-amansala.png" alt="Amansala" style="height:42px;margin-bottom:6px">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7f8c9a">Eco-Chic Resort and Retreat</div>
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7f8c9a;margin-top:4px">${clEsc(t.name)}</div></div>
    <table style="width:100%;margin-bottom:20px;border-collapse:collapse">
      <tr><td style="padding:5px 0;font-size:13px;color:#7f8c9a;width:190px">Client</td><td style="padding:5px 0;font-size:13px;font-weight:600">${clEsc(vars.leaderName)}</td></tr>
      <tr><td style="padding:5px 0;font-size:13px;color:#7f8c9a">Arrival</td><td style="padding:5px 0;font-size:13px;font-weight:600">${clEsc(vars.startDate)}</td></tr>
      <tr><td style="padding:5px 0;font-size:13px;color:#7f8c9a">Departure</td><td style="padding:5px 0;font-size:13px;font-weight:600">${clEsc(vars.endDate)}</td></tr></table>
    ${hr}${body}${hr}
    <div style="text-align:center;margin-top:20px;font-size:11px;color:#7f8c9a">Amansala Eco-Chic Resort &amp; Retreat · Tulum, Mexico · reservations@amansala.com · www.amansala.com</div></div>`;
}
function clPreview(){
  const t=clCur();if(!t)return;
  const bks=(typeof AppData!=='undefined'&&AppData.bookings||[]).filter(b=>b.startDate).sort((a,b)=>b.startDate.localeCompare(a.startDate)).slice(0,60);
  let ov=document.getElementById('clPreviewOv');if(ov)ov.remove();
  ov=document.createElement('div');ov.id='clPreviewOv';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML=`<div style="background:#fff;border-radius:12px;width:min(820px,100%);max-height:92vh;display:flex;flex-direction:column">
    <div style="display:flex;gap:10px;align-items:center;padding:12px 16px;border-bottom:1px solid #e5e7eb">
      <b style="flex:1">Preview</b>
      <select id="clPrevBk" style="padding:6px;border:1.5px solid var(--border);border-radius:8px;max-width:320px"><option value="">Sample placeholders</option>${bks.map(b=>`<option value="${b.id}">${clEsc((b.leaderName||b.retreatName||'Booking')+' — '+fmtDate(b.startDate))}</option>`).join('')}</select>
      <button class="btn btn-secondary" onclick="document.getElementById('clPreviewOv').remove()">Close</button></div>
    <div id="clPrevBody" style="padding:24px;overflow-y:auto"></div></div>`;
  document.body.appendChild(ov);
  const draw=()=>{const id=document.getElementById('clPrevBk').value;document.getElementById('clPrevBody').innerHTML=clRenderContractHTML(t,bks.find(b=>b.id===id)||null);};
  document.getElementById('clPrevBk').onchange=draw;draw();
}

// ---------- version history ----------
function clHistory(){
  const t=clCur();if(!t)return;
  const h=t.history||[];
  if(!h.length){showToast('No earlier versions yet');return;}
  let ov=document.getElementById('clHistOv');if(ov)ov.remove();
  ov=document.createElement('div');ov.id='clHistOv';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML=`<div style="background:#fff;border-radius:12px;width:min(520px,100%);max-height:80vh;overflow-y:auto;padding:18px">
    <div style="display:flex;align-items:center;margin-bottom:10px"><b style="flex:1">Version history</b><button class="btn btn-secondary" onclick="document.getElementById('clHistOv').remove()">Close</button></div>
    ${h.map((v,i)=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #e5e7eb"><div style="flex:1;font-size:12.5px">${clEsc(new Date(v.savedAt).toLocaleString())}<div style="font-size:11px;color:#7f8c9a">by ${clEsc(v.savedBy||'?')} · ${(v.sections||[]).length} sections</div></div><button class="btn btn-secondary" onclick="clRestore(${i})">Restore</button></div>`).join('')}</div>`;
  document.body.appendChild(ov);
}
function clRestore(i){
  const t=clCur(),v=t.history[i];if(!v)return;
  if(!confirm('Load this earlier version into the editor? Nothing changes until you press Save.'))return;
  t.name=v.name;t.sections=JSON.parse(JSON.stringify(v.sections));
  document.getElementById('clHistOv').remove();clMark();clDraw();
}
