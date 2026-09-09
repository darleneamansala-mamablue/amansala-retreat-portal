// ===== WE TRAVEL ADMIN TAB =====
// One place to see every booking synced from We Travel (source==='wetravel')
// and to manage the package-name -> portal room_type mapping that
// netlify/functions/wetravel-webhook.js reads (app_store key='weTravelPackageMap')
// instead of hand-editing that row via curl. A package the webhook couldn't map
// gets logged into app_store key='weTravelUnmappedPackages' (see
// recordUnmappedPackage() in the webhook) and surfaces here as a warning with a
// one-click "map it" control.

let _wtPackageMap={},_wtUnmapped={};

async function wtAdminInit(){
  document.getElementById('wtUnmappedSection').innerHTML='<div style="padding:20px;text-align:center;color:var(--muted);font-size:12.5px">Loading…</div>';
  try{
    const {data,error}=await db.from('app_store').select('key,value').in('key',['weTravelPackageMap','weTravelUnmappedPackages']);
    if(error)throw error;
    const map={};(data||[]).forEach(r=>map[r.key]=r.value);
    _wtPackageMap=map.weTravelPackageMap||{};
    _wtUnmapped=map.weTravelUnmappedPackages||{};
  }catch(e){
    _wtPackageMap={};_wtUnmapped={};
    console.warn('We Travel admin load failed:',e);
  }
  _wtRenderUnmapped();
  _wtRenderPackageMap();
  _wtRenderReservations();
}

async function _wtSaveMapAndUnmapped(){
  await Promise.all([
    db.from('app_store').upsert({key:'weTravelPackageMap',value:_wtPackageMap,updated_at:new Date().toISOString()},{onConflict:'key'}),
    db.from('app_store').upsert({key:'weTravelUnmappedPackages',value:_wtUnmapped,updated_at:new Date().toISOString()},{onConflict:'key'}),
  ]);
}

function _wtRenderUnmapped(){
  const el=document.getElementById('wtUnmappedSection');
  const names=Object.keys(_wtUnmapped);
  if(!names.length){el.innerHTML='';return;}
  el.innerHTML=`<div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:12px;padding:14px 18px">
    <div style="font-size:12.5px;font-weight:700;color:#b91c1c;margin-bottom:8px">⚠️ Paquetes sin mapear — no se está asignando cuarto para estos</div>
    ${names.map((n,i)=>{
      const info=_wtUnmapped[n]||{};
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;${i>0?'border-top:1px solid #fecaca':''};flex-wrap:wrap">
        <span style="font-size:12.5px;flex:1;min-width:160px;font-weight:600">${escHtml(n)}</span>
        <select id="wtNewMapRt-${i}" style="padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px">
          <option value="">Elegir tipo de habitación…</option>
          ${AppData.roomTypes.map(rt=>`<option value="${rt.id}">${escHtml(rt.name)}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="wtSaveMapping(${i})">Guardar</button>
        ${info.lastSeenAt?`<span style="color:#9ca3af;font-size:10.5px;white-space:nowrap">visto ${fmtDate(info.lastSeenAt)}</span>`:''}
      </div>`;
    }).join('')}
  </div>`;
}

async function wtSaveMapping(i){
  const name=Object.keys(_wtUnmapped)[i];
  const rtId=document.getElementById('wtNewMapRt-'+i)?.value;
  if(!name)return;
  if(!rtId){showToast('Elige un tipo de habitación primero');return;}
  _wtPackageMap={..._wtPackageMap,[name]:rtId};
  delete _wtUnmapped[name];
  try{await _wtSaveMapAndUnmapped();showToast('Mapeo guardado');}
  catch(e){showToast('Error al guardar: '+e.message);}
  _wtRenderUnmapped();_wtRenderPackageMap();
}

function _wtRenderPackageMap(){
  const el=document.getElementById('wtPackageMapBoard');
  const entries=Object.entries(_wtPackageMap);
  const rtName=id=>AppData.roomTypes.find(r=>r.id===id)?.name||id;
  el.innerHTML=`<table style="width:100%;border-collapse:collapse">
    <thead><tr style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;background:#f8fafc">
      <th style="text-align:left;padding:8px 14px">Paquete We Travel</th><th style="text-align:left;padding:8px 14px">Tipo de habitación</th><th style="padding:8px 14px"></th>
    </tr></thead>
    <tbody>
      ${entries.length?entries.map(([name,rtId],i)=>`<tr style="border-top:1px solid var(--border)">
        <td style="padding:8px 14px;font-size:12.5px">${escHtml(name)}</td>
        <td style="padding:8px 14px;font-size:12.5px">${escHtml(rtName(rtId))}</td>
        <td style="padding:8px 14px;text-align:right"><button class="btn btn-danger btn-sm" onclick="wtRemoveMapping(${i})">Quitar</button></td>
      </tr>`).join(''):`<tr><td colspan="3" style="padding:14px;text-align:center;color:var(--muted);font-size:12px">Sin mapeos todavía.</td></tr>`}
      <tr style="border-top:1px solid var(--border)">
        <td style="padding:8px 14px"><input id="wtAddPkgName" placeholder="Nombre exacto del paquete" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px"></td>
        <td style="padding:8px 14px"><select id="wtAddPkgRt" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:12px">
          <option value="">Elegir…</option>${AppData.roomTypes.map(rt=>`<option value="${rt.id}">${escHtml(rt.name)}</option>`).join('')}
        </select></td>
        <td style="padding:8px 14px;text-align:right"><button class="btn btn-secondary btn-sm" onclick="wtAddMappingManual()">+ Agregar</button></td>
      </tr>
    </tbody>
  </table>`;
}

async function wtRemoveMapping(i){
  const name=Object.keys(_wtPackageMap)[i];
  if(!name)return;
  delete _wtPackageMap[name];
  try{await _wtSaveMapAndUnmapped();showToast('Mapeo eliminado');}
  catch(e){showToast('Error: '+e.message);}
  _wtRenderPackageMap();
}

async function wtAddMappingManual(){
  const name=document.getElementById('wtAddPkgName')?.value.trim();
  const rtId=document.getElementById('wtAddPkgRt')?.value;
  if(!name||!rtId){showToast('Completa nombre y tipo de habitación');return;}
  _wtPackageMap={..._wtPackageMap,[name]:rtId};
  try{await _wtSaveMapAndUnmapped();showToast('Mapeo guardado');}
  catch(e){showToast('Error: '+e.message);}
  document.getElementById('wtAddPkgName').value='';
  _wtRenderPackageMap();
}

function _wtStatusBadge(bk){
  if(bk.status==='cancelled')return{label:'Cancelled',bg:'#fee2e2',fg:'#b91c1c'};
  if(bk.status==='confirmed')return{label:'Confirmed',bg:'#dcfce7',fg:'#15803d'};
  return{label:'Deposit Paid',bg:'#fef3c7',fg:'#92400e'};
}

function _wtRenderReservations(){
  const el=document.getElementById('wtReservationsBoard');
  const bks=AppData.bookings.filter(b=>b.source==='wetravel').sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||''));
  if(!bks.length){el.innerHTML='<div style="padding:20px;text-align:center;color:var(--muted);font-size:12.5px">Sin reservas de We Travel todavía.</div>';return;}
  el.innerHTML=`<table style="width:100%;border-collapse:collapse">
    <thead><tr style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;background:#f8fafc">
      <th style="text-align:left;padding:8px 14px">Retiro</th><th style="text-align:left;padding:8px 14px">Fechas</th>
      <th style="text-align:left;padding:8px 14px">Huéspedes</th><th style="text-align:left;padding:8px 14px">Cuartos</th>
      <th style="text-align:right;padding:8px 14px">Pagado</th><th style="text-align:left;padding:8px 14px">Estado</th>
    </tr></thead>
    <tbody>
      ${bks.map(bk=>{
        const regs=getRegsForBk(bk.id);
        const guests=regs.flatMap(r=>(r.guests||[]).filter(g=>g.name).map(g=>g.name));
        const rooms=regs.map(r=>r.room).filter(Boolean);
        const paid=regs.reduce((s,r)=>s+(r.amountPaid||0),0);
        const st=_wtStatusBadge(bk);
        return `<tr style="border-top:1px solid var(--border);cursor:pointer" onclick="openBookingFromNotif('${bk.id}')">
          <td style="padding:8px 14px;font-size:12.5px;font-weight:700">${escHtml(bk.leaderName||bk.retreatName||'')}</td>
          <td style="padding:8px 14px;font-size:12px;color:var(--muted);white-space:nowrap">${fmtDate(bk.startDate)} → ${fmtDate(bk.endDate)}</td>
          <td style="padding:8px 14px;font-size:12px">${escHtml(guests.join(', ')||'—')}</td>
          <td style="padding:8px 14px;font-size:12px">${escHtml(rooms.join(', ')||'—')}</td>
          <td style="padding:8px 14px;font-size:12.5px;text-align:right;font-weight:700;color:#059669">${fmt$(paid)}</td>
          <td style="padding:8px 14px"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${st.bg};color:${st.fg}">${st.label}</span></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}
