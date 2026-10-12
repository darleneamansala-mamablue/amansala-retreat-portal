// ===== contract-library-link.js — real contracts use the Contract Templates library =====
// Loaded as a classic script AFTER contracts.js, global-rate.js and contract-library.js; shares global scope.
// Standalone: contracts.js and contract-library.js are not modified. It wraps generateContractHTML / generateContractText
// (what the admin preview, the teacher's My Contract tab and "Copy contract" all use).
//
// Which wording a contract uses:
//   1. A SIGNED contract keeps exactly the wording it was signed with (the legacy wording, unless it has a snapshot).
//   2. A contract that has been SENT has a snapshot (a frozen copy of the library template, taken when it was sent), so
//      later edits to the template never change a contract the teacher is already looking at / about to sign.
//   3. An unsent or sent-before-this-existed (no snapshot) unsigned contract follows the ACTIVE library template for its
//      season (Retreat — High Season / Low Season in the Contract Templates tab).
//   4. No active template for the season → the old built-in wording, as before.
// Snapshots live in app_store key 'contract_snapshots' = {<bookingId>:{id,name,type,savedAt,sections}} (not on the booking
// row, so a booking save can never wipe them). Per-retreat edits made with "Edit wording for this retreat" still apply on top
// (matched by section title). The old rate-note (tax / gratuity), key-date lines and Special Notes + signature area are kept.

const CLC_SNAP_KEY='contract_snapshots';
let _clcLib=null,_clcSnaps={},_clcAt=0,_clcBusy=null;

function clcLoad(){
  if(_clcBusy)return _clcBusy;
  _clcBusy=(async()=>{
    let changed=false;
    try{
      const [lib,snapRes]=await Promise.all([clFetch(),db.from('app_store').select('value').eq('key',CLC_SNAP_KEY).maybeSingle()]);
      const snaps=(snapRes&&snapRes.data&&snapRes.data.value&&typeof snapRes.data.value==='object')?snapRes.data.value:{};
      changed=JSON.stringify(lib)!==JSON.stringify(_clcLib)||JSON.stringify(snaps)!==JSON.stringify(_clcSnaps);
      _clcLib=lib||{templates:[]};_clcSnaps=snaps;_clcAt=Date.now();
    }catch(e){console.warn('[contract-library-link] load failed:',e.message||e);}
    return changed;
  })().finally(()=>{_clcBusy=null;});
  return _clcBusy;
}
function clcKick(){
  if(_clcBusy||(_clcLib&&Date.now()-_clcAt<60000))return;
  clcLoad().then(changed=>{if(changed)clcRerender();});
}
function clcRerender(){
  try{
    const tb=document.getElementById('tcContractBody');
    const tid=localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id');
    if(tb&&tb.style.display!=='none'&&tid&&typeof renderTeacherContract==='function')renderTeacherContract(tid);
    const pv=document.getElementById('contractPreview');
    if(pv&&pv.innerHTML&&typeof _contractBkId!=='undefined'&&_contractBkId){
      const bk=AppData.bookings.find(b=>b.id===_contractBkId);if(bk)contractRenderPreview(bk);
    }
  }catch(e){}
}
function clcActiveTemplate(isLow){
  const type=isLow?'retreat-low':'retreat-high';
  return ((_clcLib&&_clcLib.templates)||[]).find(t=>t.type===type&&t.status==='active')||null;
}
// Template whose wording applies to this booking right now (null = old built-in wording)
function clcTemplateFor(bk,isLow){
  const snap=_clcSnaps[bk.id];
  if(snap&&Array.isArray(snap.sections))return snap;
  if(bk.contractSignedAt)return null;
  return clcActiveTemplate(isLow);
}
// Freeze the wording a teacher is being sent / is signing
function clcSnapshot(bk){
  if(!bk||bk.contractSignedAt&&_clcSnaps[bk.id])return;
  const t=clcActiveTemplate(isLowSeasonContract(bk.startDate));
  if(!t)return;
  const snap={id:t.id,name:t.name,type:t.type,savedAt:new Date().toISOString(),sections:JSON.parse(JSON.stringify(t.sections))};
  _clcSnaps[bk.id]=snap;
  (async()=>{
    try{
      const {data}=await db.from('app_store').select('value').eq('key',CLC_SNAP_KEY).maybeSingle();
      const cur=(data&&data.value&&typeof data.value==='object')?data.value:{};
      cur[bk.id]=snap;
      await db.from('app_store').upsert({key:CLC_SNAP_KEY,value:cur,updated_at:new Date().toISOString()});
    }catch(e){console.warn('[contract-library-link] snapshot save failed:',e.message||e);}
  })();
}
function clcDropSnapshot(bk){
  if(!bk||!_clcSnaps[bk.id])return;
  delete _clcSnaps[bk.id];
  (async()=>{
    try{
      const {data}=await db.from('app_store').select('value').eq('key',CLC_SNAP_KEY).maybeSingle();
      const cur=(data&&data.value&&typeof data.value==='object')?data.value:{};
      delete cur[bk.id];
      await db.from('app_store').upsert({key:CLC_SNAP_KEY,value:cur,updated_at:new Date().toISOString()});
    }catch(e){}
  })();
}

// "Edit wording for this retreat" keys → section titles
const CLC_OVERRIDE_KEYS=[[/^payment/i,'paymentTerms'],[/^cancellation/i,'cancellationPolicy'],[/complimentary/i,'teacherPolicy'],[/shala/i,'yogaPolicy'],[/^property/i,'propertyPolicy'],[/liabilit/i,'liabilityPolicy']];
function clcOverrideKey(title){const m=CLC_OVERRIDE_KEYS.find(([re])=>re.test(title||''));return m?m[1]:null;}
function clcBody(bk,s){
  const k=clcOverrideKey(s.title);
  const ov=k&&bk.contractOverrides&&bk.contractOverrides[k];
  return typeof ov==='string'?ov:(s.body||'');
}
function clcRates(bk,s,isLow){
  const ov=bk.contractOverrides&&bk.contractOverrides[(isLow?'low':'high')+'Rates'];
  return Array.isArray(ov)?ov:(s.rates||[]);
}
function clcVarsText(text,vars){
  const t=(typeof applyTmplVars==='function')?applyTmplVars(text,loadContractTmpl()):(text||'');
  return String(t).replace(/\{\{(\w+)\}\}/g,(m,k)=>k in vars?String(vars[k]):m);
}

function clcBuildHTML(t,bk,isLow,legacy){
  const iR=legacy.indexOf('<h3'),iS=legacy.indexOf('Special Notes');
  if(iR<0||iS<0)return null;
  const iT=legacy.lastIndexOf('<h3',iS);
  if(iT<iR)return null;
  const head=legacy.slice(0,iR),tail=legacy.slice(iT);
  const dateLines=[...legacy.matchAll(/<p style="font-size:12px;color:#7f8c9a;margin-top:6px">[\s\S]*?<\/p>/g)].map(m=>m[0]);   // payment, cancellation, property
  const rateNote=(legacy.match(/<p style="font-size:11\.5px;color:#7f8c9a;margin-bottom:8px">[\s\S]*?<\/p>/)||[''])[0];            // tax + gratuity sentence
  const vars=clFillVars(bk);
  const hr='<hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0">';
  const h=x=>`<h3 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#2d6a6a;margin-bottom:10px">${clEsc(clcVarsText(x,vars))}</h3>`;
  const para=x=>clEsc(clcVarsText(x,vars)).split('\n\n').filter(p=>p.trim()).map(p=>`<p style="font-size:12.5px;line-height:1.85;color:#374151;margin-top:8px">${p.replace(/\n/g,'<br>')}</p>`).join('');
  const body=t.sections.map(s=>{
    if(s.kind==='rates'){
      const rows=clcRates(bk,s,isLow).map((r,i)=>`<tr${i%2?' style="background:#fafafa"':''}><td style="padding:5px 10px;border:1px solid #e5e7eb;font-size:12px">${clEsc(r.room)}</td><td style="padding:5px 10px;border:1px solid #e5e7eb;text-align:center;font-size:12px">${clEsc(r.solo)||'—'}</td><td style="padding:5px 10px;border:1px solid #e5e7eb;text-align:center;font-size:12px">${clEsc(r.sharing)||'—'}</td></tr>`).join('');
      const note=(s.note||'').trim().length>1?para(s.note):'';
      return h(s.title)+rateNote+`<table style="width:100%;border-collapse:collapse;margin:8px 0 4px"><tr style="background:#f3f4f6"><th style="text-align:left;padding:6px 10px;font-size:12px;border:1px solid #e5e7eb">Room Type</th><th style="padding:6px 10px;font-size:12px;border:1px solid #e5e7eb">Solo / Night</th><th style="padding:6px 10px;font-size:12px;border:1px solid #e5e7eb">Sharing pp / Night</th></tr>${rows}</table>`+note;
    }
    const k=clcOverrideKey(s.title);
    const extra=k==='paymentTerms'?dateLines[0]:k==='cancellationPolicy'?dateLines[1]:k==='propertyPolicy'?dateLines[2]:'';
    return h(s.title)+para(clcBody(bk,s))+(extra||'');
  }).join(hr);
  return head+body+hr+tail;
}
function clcBuildText(t,bk,isLow,legacy){
  const iKey=legacy.indexOf('KEY DATES');
  const iSpecial=legacy.indexOf('SPECIAL NOTES');
  const iSig=legacy.indexOf('Retreat Leader Signature');
  if(iKey<0||iSig<0)return null;
  const dash='─'.repeat(40);
  const tailStart=iSpecial>=0?iSpecial:legacy.lastIndexOf(dash,iSig);
  const iFirst=legacy.search(/\n1\. /);
  const keyDates=(iFirst>iKey)?legacy.slice(iKey,iFirst).trimEnd()+'\n\n':'';
  const vars=clFillVars(bk);
  const sections=t.sections.map((s,i)=>{
    const title=clcVarsText(s.title,vars).toUpperCase();
    if(s.kind==='rates'){
      const lines=clcRates(bk,s,isLow).map(r=>`• ${r.room}: Solo ${r.solo||'—'} | Sharing ${r.sharing||'—'}`).join('\n');
      return `${i+1}. ${title}\n${dash}\n${lines}`;
    }
    return `${i+1}. ${title}\n${dash}\n${clcVarsText(clcBody(bk,s),vars)}`;
  }).join('\n\n');
  return legacy.slice(0,iKey)+keyDates+sections+'\n\n'+legacy.slice(tailStart);
}

(function(){
  const wrap=(name,build)=>{
    const prev=window[name];if(typeof prev!=='function')return;
    window[name]=function(bk,isLow){
      const legacy=prev.apply(this,arguments);
      try{
        clcKick();
        const t=clcTemplateFor(bk,isLow);
        if(!t)return legacy;
        return build(t,bk,isLow,legacy)||legacy;
      }catch(e){console.warn('[contract-library-link]',e);return legacy;}
    };
  };
  wrap('generateContractHTML',clcBuildHTML);
  wrap('generateContractText',clcBuildText);

  // freeze the wording when a contract is sent / signed; unfreeze when a signature is voided so the new template applies
  const before=(name,fn)=>{
    const prev=window[name];if(typeof prev!=='function')return;
    window[name]=function(){try{fn.apply(this,arguments);}catch(e){}return prev.apply(this,arguments);};
  };
  before('sendContractToPortal',()=>{const bk=AppData.bookings.find(b=>b.id===_contractBkId);if(bk&&!bk.contractSignedAt)clcSnapshot(bk);});
  before('emailContract',()=>{const bk=AppData.bookings.find(b=>b.id===_contractBkId);if(bk&&!bk.contractSignedAt)clcSnapshot(bk);});
  before('teacherSignContract',()=>{
    const id=localStorage.getItem('teacher_bk_id')||sessionStorage.getItem('teacher_bk_id');
    const bk=AppData.bookings.find(b=>b.id===id);
    if(bk&&!_clcSnaps[bk.id])clcSnapshot(bk);
  });
  const vSig=window.voidContractSignature;
  if(typeof vSig==='function')window.voidContractSignature=function(){
    const bk=AppData.bookings.find(b=>b.id===_contractBkId);
    const r=vSig.apply(this,arguments);
    if(bk&&!bk.contractSignedAt)clcDropSnapshot(bk);
    return r;
  };
  clcLoad().then(changed=>{if(changed)clcRerender();});
})();
