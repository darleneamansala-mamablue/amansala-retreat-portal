// ===== commissions.js — ported from staging's new modular admin app (js/modules/commissions.js) =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// The `commissions` table already exists and portal's own transport.js (tr2ConfirmUpgrade) already
// inserts into it when staff sell a room upgrade — this is purely the missing viewer/payout screen.

let _cmRows=[],_cmStaff=[],_cmFilterStaff='',_cmFilterStatus='',_cmDateFrom='',_cmDateTo='';

async function commissionsRender(){
  const el=document.getElementById('commissionsContent');
  if(!el)return;
  el.innerHTML=`
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div class="panel-toolbar">
        <h2>Commissions</h2>
        <div class="toolbar-right">
          <select id="cm-staff-sel" onchange="cmSetStaff(this.value)" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-family:'Jost',sans-serif;color:#374151;outline:none">
            <option value="">All Staff</option>
          </select>
          <select id="cm-status-sel" onchange="cmSetStatus(this.value)" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-family:'Jost',sans-serif;color:#374151;outline:none">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
          </select>
          <input type="date" id="cm-from" onchange="cmSetFrom(this.value)" style="padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-family:'Jost',sans-serif;color:#374151;outline:none">
          <input type="date" id="cm-to" onchange="cmSetTo(this.value)" style="padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-family:'Jost',sans-serif;color:#374151;outline:none">
          <button class="btn-icon" onclick="commissionsLoadData()">↺</button>
        </div>
      </div>
      <div id="cm-body" style="flex:1;overflow-y:auto;padding:20px;background:#f0ece4"></div>
    </div>`;
  await commissionsLoadData();
}

async function commissionsLoadData(){
  const body=document.getElementById('cm-body');
  if(body)body.innerHTML=`<div style="padding:40px;text-align:center;color:var(--muted)">Loading…</div>`;
  try{
    let q=db.from('commissions').select('*').order('date',{ascending:false});
    if(_cmFilterStaff)q=q.eq('staff_id',_cmFilterStaff);
    if(_cmFilterStatus)q=q.eq('status',_cmFilterStatus);
    if(_cmDateFrom)q=q.gte('date',_cmDateFrom);
    if(_cmDateTo)q=q.lte('date',_cmDateTo);
    const[{data:staffData},{data:cmData,error}]=await Promise.all([
      db.from('staff').select('id,name,active').order('name',{ascending:true}),
      q,
    ]);
    if(error)throw error;
    _cmStaff=(staffData||[]).filter(s=>s.active);
    _cmRows=cmData||[];
    const staffSel=document.getElementById('cm-staff-sel');
    if(staffSel){
      staffSel.innerHTML='<option value="">All Staff</option>'+
        _cmStaff.map(s=>`<option value="${s.id}"${s.id===_cmFilterStaff?' selected':''}>${escHtml(s.name)}</option>`).join('');
    }
    commissionsRenderBody();
  }catch(e){if(body)body.innerHTML=`<div style="padding:24px;color:#dc2626;font-size:13px">Error: ${escHtml(e.message)}</div>`;}
}

function commissionsRenderBody(){
  const body=document.getElementById('cm-body');
  if(!body)return;
  const filtered=_cmRows.filter(c=>{
    if(_cmFilterStaff&&c.staff_id!==_cmFilterStaff)return false;
    if(_cmFilterStatus&&c.status!==_cmFilterStatus)return false;
    if(_cmDateFrom&&c.date<_cmDateFrom)return false;
    if(_cmDateTo&&c.date>_cmDateTo)return false;
    return true;
  });
  if(!filtered.length){
    body.innerHTML=`<div style="padding:60px;text-align:center;color:var(--muted)">
      <div style="font-size:32px;margin-bottom:12px">💰</div>
      <div style="font-size:15px;font-weight:600;color:#374151">No commissions</div>
    </div>`;
    return;
  }
  const byStaff=new Map();
  filtered.forEach(c=>{
    if(!byStaff.has(c.staff_id))byStaff.set(c.staff_id,{name:c.staff_name,pending:0,paid:0});
    const g=byStaff.get(c.staff_id);
    if(c.status==='pending')g.pending+=Number(c.commission_amount);
    else g.paid+=Number(c.commission_amount);
  });
  let html='<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">';
  for(const[sid,g]of byStaff){
    html+=`<div style="background:#fff;border:1.5px solid var(--border);border-radius:10px;padding:14px 18px;min-width:180px">
      <div style="font-size:13px;font-weight:700;color:var(--dark);margin-bottom:6px">${escHtml(g.name)}</div>
      ${g.pending>0?`<div style="font-size:12px;color:#d97706;font-weight:600">Pendiente: $${g.pending.toFixed(2)}</div>`:''}
      ${g.paid>0?`<div style="font-size:12px;color:#16a34a;font-weight:600">Pagado: $${g.paid.toFixed(2)}</div>`:''}
      ${g.pending>0?`<button onclick="cmMarkAllPaid('${sid}')" class="btn btn-primary" style="margin-top:8px;padding:4px 10px;font-size:11px">Pagar todo ✓</button>`:''}
    </div>`;
  }
  html+='</div>';
  html+=`<div style="background:#fff;border:1.5px solid var(--border);border-radius:10px;overflow:hidden">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f8fafc">
        ${['Fecha','Staff','Huésped','Upgrade','Pretax','IVA 16%','Total huésped','Comisión','Status',''].map(h=>
          `<th style="padding:9px 12px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);text-align:left;border-bottom:2px solid var(--border)">${h}</th>`
        ).join('')}
      </tr></thead><tbody>`;
  filtered.forEach(c=>{
    const iva=(Number(c.upgrade_pretax)*0.16).toFixed(2);
    const isPaid=c.status==='paid';
    html+=`<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:9px 12px;font-size:12px;color:#374151">${fmtDate(c.date)}</td>
      <td style="padding:9px 12px;font-size:12px;font-weight:600;color:var(--dark)">${escHtml(c.staff_name)}</td>
      <td style="padding:9px 12px;font-size:12px;color:#374151">${escHtml(c.guest_name||'—')}</td>
      <td style="padding:9px 12px;font-size:11.5px;color:var(--muted)">${escHtml(c.room_from||'')} → ${escHtml(c.room_to||'')}</td>
      <td style="padding:9px 12px;font-size:12px;color:#374151">$${Number(c.upgrade_pretax).toFixed(2)}</td>
      <td style="padding:9px 12px;font-size:12px;color:#374151">$${iva}</td>
      <td style="padding:9px 12px;font-size:12px;font-weight:600;color:#0369a1">$${Number(c.upgrade_total).toFixed(2)}</td>
      <td style="padding:9px 12px;font-size:12px;font-weight:700;color:#059669">$${Number(c.commission_amount).toFixed(2)}</td>
      <td style="padding:9px 12px">
        <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;background:${isPaid?'#dcfce7':'#fef3c7'};color:${isPaid?'#15803d':'#92400e'}">${isPaid?'Pagado':'Pendiente'}</span>
      </td>
      <td style="padding:9px 12px;white-space:nowrap">
        ${!isPaid?`<button onclick="cmMarkPaid('${c.id}')" style="background:#0d9488;color:#fff;border:none;border-radius:5px;padding:3px 8px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif">Pagar ✓</button>`:''}
        <button onclick="cmDelete('${c.id}')" style="background:#fef2f2;color:#dc2626;border:none;border-radius:5px;padding:3px 6px;font-size:11px;cursor:pointer;font-family:'Jost',sans-serif;margin-left:4px">✕</button>
      </td>
    </tr>`;
  });
  html+='</tbody></table></div>';
  body.innerHTML=html;
}

function cmSetStaff(v){_cmFilterStaff=v;commissionsRenderBody();}
function cmSetStatus(v){_cmFilterStatus=v;commissionsRenderBody();}
function cmSetFrom(v){_cmDateFrom=v;commissionsRenderBody();}
function cmSetTo(v){_cmDateTo=v;commissionsRenderBody();}

async function cmMarkPaid(id){
  try{
    const{error}=await db.from('commissions').update({status:'paid'}).eq('id',id);
    if(error)throw error;
    const c=_cmRows.find(x=>x.id===id);if(c)c.status='paid';
    commissionsRenderBody();
    showToast('Comisión marcada como pagada ✓');
  }catch(e){showToast('Error: '+e.message);}
}
async function cmMarkAllPaid(staffId){
  const ids=_cmRows.filter(c=>c.staff_id===staffId&&c.status==='pending').map(c=>c.id);
  if(!ids.length)return;
  try{
    const{error}=await db.from('commissions').update({status:'paid'}).in('id',ids);
    if(error)throw error;
    _cmRows.filter(c=>ids.includes(c.id)).forEach(c=>c.status='paid');
    commissionsRenderBody();
    showToast(`${ids.length} comisiones marcadas como pagadas ✓`);
  }catch(e){showToast('Error: '+e.message);}
}
async function cmDelete(id){
  if(!confirm('¿Eliminar esta comisión?'))return;
  try{
    const{error}=await db.from('commissions').delete().eq('id',id);
    if(error)throw error;
    _cmRows=_cmRows.filter(c=>c.id!==id);
    commissionsRenderBody();
    showToast('Comisión eliminada');
  }catch(e){showToast('Error: '+e.message);}
}
