// ===== reports.js — Financial Summary, ported from Amansala Staging's js/modules/report.js =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as
// modules/commissions.js). Reuses the portal's own existing calcBkBalance()/getRegsForBk()
// (modules/payments.js) instead of recomputing revenue from scratch the way staging's
// version did -- this always matches what Booking Detail/Payments already show, no separate
// revenue-calc logic to keep in sync.
//
// Scoped to retreats only (bookingType !== 'room_only') to mirror staging, which never had a
// Room Only concept at all -- every booking there WAS a retreat. Room Only's own volume/revenue
// already has its own reporting surface (Advanced Search, per-booking Payments), and mixing it
// into a table whose columns are "Retreat / Dates / Rooms / Guests" would both look wrong and
// (if only partially filtered) make the totals not match the visible rows.

let _rptYear='all',_rptShowCanc=false,_rptRows=[];

const _RPT_METHOD_LABELS={wire:'Wire Transfer',zelle:'Zelle',venmo:'Venmo',card:'Credit Card',cash:'Cash',cheque:'Cheque',paypal:'Paypal',clip:'Clip',other:'Other'};
const _RPT_METHOD_COLORS={wire:'#dbeafe:#1d4ed8',zelle:'#fce7f3:#9d174d',venmo:'#ede9fe:#5b21b6',card:'#dcfce7:#15803d',cash:'#fef9c3:#854d0e',cheque:'#f3f4f6:#374151',paypal:'#e0f2fe:#0369a1',clip:'#fdf4ff:#7e22ce',other:'#f3f4f6:#374151'};
const _rptFmtMonth=d=>d?pd(d+'-01').toLocaleDateString('en-US',{month:'long',year:'numeric'}):'—';

function _rptBuildRows(){
  return AppData.bookings.filter(bk=>bk.bookingType!=='room_only').map(bk=>{
    const {charged,totalPaid,balance}=calcBkBalance(bk);
    const regs=getRegsForBk(bk.id);
    const guestNames=new Set();
    regs.forEach(r=>(r.guests||[]).forEach(g=>{if(g.name&&g.name.trim())guestNames.add(g.name.trim().toLowerCase());}));
    const occupiedRooms=regs.filter(r=>(r.guests||[]).some(g=>g.name&&g.name.trim())).length;
    return{
      bk,revenue:charged,collected:totalPaid,balance,
      nights:getNights(bk),
      rooms:(bk.blockedRooms||[]).length,
      occupied:occupiedRooms,
      guests:guestNames.size,
    };
  });
}

function _rptFiltered(){
  return _rptRows.filter(r=>{
    if(!_rptShowCanc&&r.bk.status==='cancelled')return false;
    if(_rptYear!=='all'){
      const y=(r.bk.startDate||'').slice(0,4);
      if(y!==_rptYear)return false;
    }
    return true;
  });
}

function reportsRender(){
  const el=document.getElementById('reportsContent');
  if(!el)return;
  _rptRows=_rptBuildRows();
  _rptRenderBody();
}

function _rptRenderBody(){
  const el=document.getElementById('reportsContent');
  if(!el)return;
  const rows=_rptFiltered();
  const totalRev=rows.reduce((s,r)=>s+r.revenue,0);
  const totalPaid=rows.reduce((s,r)=>s+r.collected,0);
  const totalBal=rows.reduce((s,r)=>s+r.balance,0);
  const active=rows.filter(r=>r.bk.status!=='cancelled').length;

  const years=[...new Set(_rptRows.map(r=>(r.bk.startDate||'').slice(0,4)).filter(Boolean))].sort().reverse();

  const visibleBkIds=new Set(rows.map(r=>r.bk.id));
  const byMethod={};
  rows.forEach(r=>{
    if(!visibleBkIds.has(r.bk.id))return;
    (r.bk.payments||[]).forEach(p=>{
      const m=p.method||'other';
      byMethod[m]=(byMethod[m]||0)+Number(p.amount||0);
    });
  });
  const methodEntries=Object.entries(byMethod).sort((a,b)=>b[1]-a[1]);

  const monthMap=new Map();
  rows.forEach(r=>{
    if(r.bk.status==='cancelled')return;
    const key=(r.bk.startDate||'').slice(0,7)||'?';
    const m=monthMap.get(key)||{key,rev:0,paid:0,bal:0,count:0};
    m.rev+=r.revenue;m.paid+=r.collected;m.bal+=r.balance;m.count++;
    monthMap.set(key,m);
  });
  const months=[...monthMap.values()].sort((a,b)=>b.key.localeCompare(a.key));

  el.innerHTML=`
  <div style="padding:24px 28px;font-family:'Jost',sans-serif;overflow-y:auto;height:100%;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px">
      <div>
        <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0">Financial Summary</h2>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px">${active} retreat${active!==1?'s':''} · ${_rptYear==='all'?'All time':_rptYear}</div>
      </div>
      <div style="flex:1"></div>
      <select onchange="_rptSetYear(this.value)" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Jost',sans-serif;color:#374151;background:#fff;cursor:pointer">
        <option value="all" ${_rptYear==='all'?'selected':''}>All years</option>
        ${years.map(y=>`<option value="${y}" ${_rptYear===y?'selected':''}>${y}</option>`).join('')}
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#6b7280;cursor:pointer">
        <input type="checkbox" ${_rptShowCanc?'checked':''} onchange="_rptToggleCanc(this.checked)">
        Show cancelled
      </label>
      <button onclick="_rptExportCsv()" style="padding:6px 14px;background:#0e5a5a;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif">
        ↓ Export CSV
      </button>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
      ${_rptCard('Total Revenue',fmt$(totalRev),'#f0fdf9','#0e5a5a')}
      ${_rptCard('Collected',fmt$(totalPaid),'#f0fdf4','#15803d')}
      ${_rptCard('Outstanding',fmt$(totalBal),totalBal>0?'#fff7ed':'#f8fafc',totalBal>0?'#c2410c':'#374151')}
      ${_rptCard('Retreats',String(active),'#f0f9ff','#0369a1')}
    </div>

    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse">
        <thead style="background:#f8fafc;border-bottom:2px solid var(--border)">
          <tr>
            <th style="${_rptTh()}">Retreat</th>
            <th style="${_rptTh()}">Dates</th>
            <th style="${_rptTh('center')}">Rooms</th>
            <th style="${_rptTh('center')}">Guests</th>
            <th style="${_rptTh('right')}">Revenue</th>
            <th style="${_rptTh('right')}">Collected</th>
            <th style="${_rptTh('right')}">Balance</th>
            <th style="${_rptTh('center')}">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length===0
            ?`<tr><td colspan="8" style="padding:60px;text-align:center;color:#9ca3af">No retreats found for this filter</td></tr>`
            :rows.slice().sort((a,b)=>(a.bk.startDate||'').localeCompare(b.bk.startDate||'')).map(_rptRowHtml).join('')}
        </tbody>
      </table>
    </div>

    ${methodEntries.length>0?`
    <div style="margin-bottom:24px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:10px">Collections by Payment Method</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${methodEntries.map(([method,amount])=>{
          const[bg,color]=(_RPT_METHOD_COLORS[method]||'#f3f4f6:#374151').split(':');
          const label=_RPT_METHOD_LABELS[method]||method;
          const pct=totalPaid>0?Math.round(amount/totalPaid*100):0;
          return`<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px 18px;min-width:150px;flex:1">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
              <span style="background:${bg};color:${color};font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">${escHtml(label)}</span>
              <span style="font-size:11px;color:#9ca3af">${pct}%</span>
            </div>
            <div style="font-size:20px;font-weight:800;color:#111827">${fmt$(amount)}</div>
            <div style="margin-top:6px;height:4px;background:#f3f4f6;border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${color};border-radius:2px"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`:''}

    ${months.length>0?`
    <div>
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:10px">Monthly Summary</div>
      <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:#f8fafc;border-bottom:2px solid var(--border)">
            <tr>
              <th style="${_rptTh()}">Month</th>
              <th style="${_rptTh('center')}">Retreats</th>
              <th style="${_rptTh('right')}">Revenue</th>
              <th style="${_rptTh('right')}">Collected</th>
              <th style="${_rptTh('right')}">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${months.map(m=>`
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="${_rptTd()};font-weight:600;font-size:13px">${_rptFmtMonth(m.key)}</td>
              <td style="${_rptTd('center')};font-size:13px;color:#6b7280">${m.count}</td>
              <td style="${_rptTd('right')};font-weight:700;font-size:13px">${fmt$(m.rev)}</td>
              <td style="${_rptTd('right')};font-size:13px;color:#15803d;font-weight:600">${fmt$(m.paid)}</td>
              <td style="${_rptTd('right')};font-size:13px;font-weight:600;color:${m.bal>0?'#c2410c':'#374151'}">${fmt$(m.bal)}</td>
            </tr>`).join('')}
            <tr style="background:#f8fafc;border-top:2px solid var(--border)">
              <td style="${_rptTd()};font-weight:800;font-size:13px">TOTAL</td>
              <td style="${_rptTd('center')};font-weight:700">${months.reduce((s,m)=>s+m.count,0)}</td>
              <td style="${_rptTd('right')};font-weight:800;font-size:13px">${fmt$(totalRev)}</td>
              <td style="${_rptTd('right')};font-weight:800;font-size:13px;color:#15803d">${fmt$(totalPaid)}</td>
              <td style="${_rptTd('right')};font-weight:800;font-size:13px;color:${totalBal>0?'#c2410c':'#374151'}">${fmt$(totalBal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`:''}
  </div>`;
}

function _rptCard(label,value,bg,color){
  return`<div style="background:${bg};border-radius:12px;padding:16px 20px;border:1px solid var(--border)">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:6px">${label}</div>
    <div style="font-size:22px;font-weight:800;color:${color}">${value}</div>
  </div>`;
}

function _rptRowHtml(r){
  const bk=r.bk;
  const canc=bk.status==='cancelled';
  const noRev=r.revenue===0;
  const statusBadge=canc
    ?`<span style="background:#fee2e2;color:#dc2626;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px">Cancelled</span>`
    :r.balance<=0
      ?`<span style="background:#dcfce7;color:#15803d;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px">Paid</span>`
      :r.collected>0
        ?`<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px">Partial</span>`
        :`<span style="background:#f3f4f6;color:#6b7280;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px">Pending</span>`;
  return`<tr style="border-bottom:1px solid #f3f4f6;cursor:pointer;${canc?'opacity:.55':''}" onclick="switchTab('teacherreg',document.getElementById('teacherregTabBtn'));regInitSel();regSelectRetreat('${bk.id}')">
    <td style="${_rptTd()}">
      <div style="font-weight:700;font-size:13px;color:#111827">${escHtml(bk.retreatName||bk.leaderName||'—')}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:1px">${escHtml(bk.leaderName||'')}</div>
    </td>
    <td style="${_rptTd()};white-space:nowrap;font-size:12px;color:#6b7280">
      ${fmtDate(bk.startDate)}<br>
      <span style="color:#d1d5db">${r.nights} night${r.nights!==1?'s':''}</span>
    </td>
    <td style="${_rptTd('center')};font-size:13px;color:#374151">
      <span style="font-weight:700">${r.occupied}</span><span style="color:#d1d5db">/${r.rooms}</span>
    </td>
    <td style="${_rptTd('center')};font-size:13px;color:#374151">${r.guests||'—'}</td>
    <td style="${_rptTd('right')};font-weight:700;font-size:13px;color:${noRev?'#d1d5db':'#111827'}">${noRev?'—':fmt$(r.revenue)}</td>
    <td style="${_rptTd('right')};font-size:13px;font-weight:600;color:#15803d">${r.collected>0?fmt$(r.collected):'<span style="color:#d1d5db">—</span>'}</td>
    <td style="${_rptTd('right')};font-size:13px;font-weight:700;color:${r.balance>0?'#c2410c':r.balance<0?'#0369a1':'#374151'}">
      ${noRev?'<span style="color:#d1d5db">—</span>':fmt$(r.balance)}
    </td>
    <td style="${_rptTd('center')}">${statusBadge}</td>
  </tr>`;
}

function _rptTh(align='left'){return`padding:9px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;text-align:${align}`;}
function _rptTd(align='left'){return`padding:10px 14px;vertical-align:middle;text-align:${align}`;}

function _rptSetYear(y){_rptYear=y;_rptRenderBody();}
function _rptToggleCanc(v){_rptShowCanc=v;_rptRenderBody();}

function _rptExportCsv(){
  const rows=_rptFiltered().slice().sort((a,b)=>(b.bk.startDate||'').localeCompare(a.bk.startDate||''));
  const header=['Retreat','Teacher','Start Date','End Date','Nights','Rooms','Occupied','Guests','Revenue','Collected','Balance','Status'];
  const lines=[header,...rows.map(r=>[
    r.bk.retreatName||r.bk.leaderName||'',
    r.bk.leaderName||'',
    r.bk.startDate||'',
    r.bk.endDate||'',
    r.nights,r.rooms,r.occupied,r.guests,
    r.revenue.toFixed(2),r.collected.toFixed(2),r.balance.toFixed(2),
    r.bk.status||'',
  ])].map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([lines],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement('a'),{href:url,download:`amansala-report-${_rptYear}.csv`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
