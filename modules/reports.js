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

let _rptYear='all',_rptShowCanc=false,_rptRows=[],_rptActiveTab='financial';

const _RPT_METHOD_LABELS={wire:'Wire Transfer',zelle:'Zelle',venmo:'Venmo',card:'Credit Card',cash:'Cash',cheque:'Cheque',paypal:'Paypal',clip:'Clip',other:'Other'};
const _RPT_METHOD_COLORS={wire:'#dbeafe:#1d4ed8',zelle:'#fce7f3:#9d174d',venmo:'#ede9fe:#5b21b6',card:'#dcfce7:#15803d',cash:'#fef9c3:#854d0e',cheque:'#f3f4f6:#374151',paypal:'#e0f2fe:#0369a1',clip:'#fdf4ff:#7e22ce',other:'#f3f4f6:#374151'};
const _rptFmtMonth=d=>d?pd(d+'-01').toLocaleDateString('en-US',{month:'long',year:'numeric'}):'—';
const _rptTabBtn=(id,label,active)=>`<button onclick="_rptSetTab('${id}')" style="padding:5px 14px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif;border:1.5px solid ${active?'#0e5a5a':'#e5e7eb'};background:${active?'#0e5a5a':'#f3f4f6'};color:${active?'#fff':'#6b7280'}">${label}</button>`;

function _rptSetTab(tab){
  _rptActiveTab=tab;
  if(tab==='daily')_rptRenderDaily();
  else if(tab==='gratuity')_rptRenderGratuity();
  else if(tab==='status')_rptRenderStatus();
  else _rptRenderBody();
}

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
      tipRate:getTip(bk),
      tipTotal:calcBkTipTotal(bk),
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
  if(_rptActiveTab==='daily')_rptRenderDaily();
  else if(_rptActiveTab==='gratuity')_rptRenderGratuity();
  else if(_rptActiveTab==='status')_rptRenderStatus();
  else _rptRenderBody();
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
      <div style="display:flex;gap:6px">
        ${_rptTabBtn('financial','Financial Summary',true)}
        ${_rptTabBtn('daily','Daily Report',false)}
        ${_rptTabBtn('gratuity','Gratuity Retreats',false)}
        ${_rptTabBtn('status','Contract & Portal',false)}
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

// ─── DAILY REPORT ──────────────────────────────────────────────
// Who-recorded-what, for a date range — needs a real answer to "who charged
// this / who took this payment", which folio_items didn't track at all until
// now (Jorge's ask 2026-09-29: "Hacer un cambio de base de datos para
// guardar quién registra cada pago/cargo"). Requires this one-time SQL:
//   ALTER TABLE folio_items ADD COLUMN IF NOT EXISTS staff_name text;
// Every folio_items INSERT that happens from an admin/staff session now
// writes staff_name (modules/booking-detail.js's 3 folio charge/payment
// inserts, modules/spa.js's charge-to-room insert); modules/payments.js's
// bk.payments (the separate retreat-level "Record Payment" ledger) now
// carries the same idea as staffName. Guest-facing charges (spa-booking.html's
// own checkout, Stripe card payments) have no staff session to attribute to
// -- those rows simply have no staff_name/staffName, and (matching staging's
// own "unattributed = show for everyone" rule) are never hidden by the user
// filter, just never counted toward any one person's total.
//
// NOT ported from staging: the Transport Charges table. Transport charging
// is driven by auto-charge-transport.js (an unattended process, not a
// person clicking "charge"), so there's no staff member to attribute it to
// -- a table that never has a name in it would just add noise here.

let _dailyFrom=fmtISO(new Date()),_dailyTo=fmtISO(new Date()),_dailyUser='all';
let _dailyFolioItems=[],_dailyStaffNames=[],_dailyLoaded=false,_dailyError=null;

async function _rptLoadDaily(){
  try{
    const fromTs=_dailyFrom+'T00:00:00.000Z',toTs=_dailyTo+'T23:59:59.999Z';
    const[itemsRes,staffRes]=await Promise.all([
      db.from('folio_items').select('id,folio_id,description,qty,unit_price,tax_rate,staff_name,created_at').gte('created_at',fromTs).lte('created_at',toTs).order('created_at',{ascending:false}),
      db.from('staff').select('name,active').order('name',{ascending:true}),
    ]);
    if(itemsRes.error)throw itemsRes.error;
    if(staffRes.error)throw staffRes.error;
    _dailyStaffNames=(staffRes.data||[]).filter(s=>s.active).map(s=>s.name);
    const items=itemsRes.data||[];
    const folioIds=[...new Set(items.map(i=>i.folio_id))];
    let foliosById={};
    if(folioIds.length){
      const{data:folios,error:fErr}=await db.from('folios').select('id,registration_id,booking_request_id,guest_name').in('id',folioIds);
      if(fErr)throw fErr;
      (folios||[]).forEach(f=>{foliosById[f.id]=f;});
    }
    _dailyFolioItems=items.map(i=>{
      const folio=foliosById[i.folio_id]||{};
      const reg=folio.registration_id?AppData.regs.find(r=>r.id===folio.registration_id):null;
      const bk=reg?AppData.bookings.find(b=>b.id===reg.bookingId):null;
      return{...i,guestName:folio.guest_name||null,bk,reqId:folio.booking_request_id||null,
        amount:+(Number(i.qty)*Number(i.unit_price)*(1+(Number(i.tax_rate)||0)/100)).toFixed(2)};
    });
    _dailyLoaded=true;_dailyError=null;
  }catch(e){
    _dailyError=e.message||String(e);
  }
}

function _rptDailyPayEntries(){
  const out=[];
  AppData.bookings.forEach(bk=>{
    (bk.payments||[]).forEach(p=>{
      if(!p.date||p.date<_dailyFrom||p.date>_dailyTo)return;
      if(_dailyUser!=='all'&&p.staffName!=null&&p.staffName!==_dailyUser)return;
      out.push({...p,bk});
    });
  });
  return out;
}
function _rptDailyFolioCharges(){
  return _dailyFolioItems.filter(i=>i.amount>0&&(_dailyUser==='all'||i.staff_name==null||i.staff_name===_dailyUser));
}
function _rptDailyFolioPayments(){
  return _dailyFolioItems.filter(i=>i.amount<0&&(_dailyUser==='all'||i.staff_name==null||i.staff_name===_dailyUser));
}

async function _rptRenderDaily(){
  const el=document.getElementById('reportsContent');
  if(!el)return;
  if(!_dailyLoaded){
    el.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:200px;color:#9ca3af;font-size:13px">Loading…</div>`;
    await _rptLoadDaily();
  }
  _rptRenderDailyView();
}

function _rptRenderDailyView(){
  const el=document.getElementById('reportsContent');
  if(!el)return;
  const payEntries=_rptDailyPayEntries();
  const folioCharges=_rptDailyFolioCharges();
  const folioPayments=_rptDailyFolioPayments();

  const totalPay=payEntries.reduce((s,e)=>s+Number(e.amount||0),0);
  const totalFolioPay=folioPayments.reduce((s,e)=>s+Math.abs(e.amount),0);
  const totalCharges=folioCharges.reduce((s,e)=>s+e.amount,0);
  const totalIn=totalPay+totalFolioPay;

  const byUser={};
  payEntries.forEach(e=>{const u=e.staffName||'Unattributed';byUser[u]=(byUser[u]||0)+Number(e.amount||0);});
  folioPayments.forEach(e=>{const u=e.staff_name||'Unattributed';byUser[u]=(byUser[u]||0)+Math.abs(e.amount);});

  const isSameDay=_dailyFrom===_dailyTo;
  const rangeLabel=isSameDay?fmtDate(_dailyFrom):`${fmtDate(_dailyFrom)} – ${fmtDate(_dailyTo)}`;
  const inputS=`padding:6px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Jost',sans-serif;color:#374151;background:#fff;cursor:pointer`;

  el.innerHTML=`
  <div style="padding:24px 28px;font-family:'Jost',sans-serif;overflow-y:auto;height:100%;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px">
      <div>
        <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0">Daily Report</h2>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px">${rangeLabel}</div>
      </div>
      <div style="display:flex;gap:6px">
        ${_rptTabBtn('financial','Financial Summary',false)}
        ${_rptTabBtn('daily','Daily Report',true)}
        ${_rptTabBtn('gratuity','Gratuity Retreats',false)}
        ${_rptTabBtn('status','Contract & Portal',false)}
      </div>
      <div style="flex:1"></div>
      <input type="date" value="${_dailyFrom}" onchange="_rptSetDailyFrom(this.value)" style="${inputS}" title="From">
      <input type="date" value="${_dailyTo}" onchange="_rptSetDailyTo(this.value)" style="${inputS}" title="To">
      <select onchange="_rptSetDailyUser(this.value)" style="${inputS}">
        <option value="all" ${_dailyUser==='all'?'selected':''}>All users</option>
        ${_dailyStaffNames.map(u=>`<option value="${escHtml(u)}" ${_dailyUser===u?'selected':''}>${escHtml(u)}</option>`).join('')}
      </select>
      <button onclick="_rptRefreshDaily()" style="padding:6px 10px;background:#f3f4f6;color:#374151;border:1.5px solid var(--border);border-radius:8px;font-size:13px;cursor:pointer;font-family:'Jost',sans-serif" title="Reload data">↺</button>
      <button onclick="_rptExportDailyCsv()" style="padding:6px 14px;background:#0e5a5a;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif">↓ Export CSV</button>
    </div>

    ${_dailyError?`<div style="font-size:12px;color:#dc2626;margin-bottom:14px;padding:8px 12px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca">⚠ ${escHtml(_dailyError)}</div>`:''}

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
      ${_rptCard('Payments In',fmt$(totalIn),'#f0fdf4','#15803d')}
      ${_rptCard('Folio Charges',fmt$(totalCharges),'#fdf4ff','#7e22ce')}
      ${_rptCard('Total Records',String(payEntries.length+folioCharges.length+folioPayments.length),'#f8fafc','#374151')}
      ${_rptCard('Range',rangeLabel,'#f0f9ff','#0369a1')}
    </div>

    ${Object.keys(byUser).length>1&&_dailyUser==='all'?`
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:8px">Payments by User</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${Object.entries(byUser).sort((a,b)=>b[1]-a[1]).map(([u,amt])=>
          `<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:10px">
            <div style="width:28px;height:28px;border-radius:50%;background:#0e5a5a22;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#0e5a5a">${escHtml((u[0]||'?').toUpperCase())}</div>
            <div>
              <div style="font-size:12px;font-weight:600;color:#374151">${escHtml(u)}</div>
              <div style="font-size:15px;font-weight:800;color:#15803d">${fmt$(amt)}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`:''}

    <div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:10px">Payments Registered (${payEntries.length})</div>
      ${payEntries.length===0
        ?`<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:40px;text-align:center;color:#9ca3af;font-size:13px">No payment activity in this range</div>`
        :`<div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:#f8fafc;border-bottom:2px solid var(--border)">
            <tr><th style="${_rptTh()}">Date</th><th style="${_rptTh()}">User</th><th style="${_rptTh()}">Retreat</th><th style="${_rptTh('right')}">Amount</th><th style="${_rptTh('center')}">Method</th><th style="${_rptTh()}">Ref / Note</th></tr>
          </thead>
          <tbody>
            ${payEntries.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(e=>{
              const[mbg,mcl]=e.method?(_RPT_METHOD_COLORS[e.method]||'#f3f4f6:#374151').split(':'):['',''];
              const ml=e.method?(_RPT_METHOD_LABELS[e.method]||e.method):'';
              return`<tr style="border-bottom:1px solid #f3f4f6">
                <td style="${_rptTd()};white-space:nowrap;font-size:12px;font-weight:600;color:#111827">${fmtDate(e.date)}</td>
                <td style="${_rptTd()};font-size:12px">
                  <div style="display:flex;align-items:center;gap:6px">
                    <div style="width:22px;height:22px;border-radius:50%;background:#0e5a5a22;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#0e5a5a;flex-shrink:0">${escHtml((e.staffName||'?')[0].toUpperCase())}</div>
                    <span style="color:#374151;font-weight:600">${escHtml(e.staffName||'Unattributed')}</span>
                  </div>
                </td>
                <td style="${_rptTd()};font-size:12px;color:#374151;max-width:180px">${escHtml(e.bk?.retreatName||e.bk?.leaderName||'—')}</td>
                <td style="${_rptTd('right')};font-size:13px;font-weight:700;color:#15803d">${fmt$(e.amount)}</td>
                <td style="${_rptTd('center')}">${ml?`<span style="background:${mbg};color:${mcl};font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;white-space:nowrap">${ml}</span>`:'<span style="color:#d1d5db">—</span>'}</td>
                <td style="${_rptTd()};font-size:11px;color:#6b7280;max-width:160px">
                  ${e.ref?`<div style="font-weight:600;color:#374151">${escHtml(e.ref)}</div>`:''}
                  ${e.note?`<div>${escHtml(e.note)}</div>`:''}
                  ${!e.ref&&!e.note?'<span style="color:#d1d5db">—</span>':''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`}
    </div>

    <div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:10px">Folio Charges (${folioCharges.length})</div>
      ${folioCharges.length===0
        ?`<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:40px;text-align:center;color:#9ca3af;font-size:13px">No folio charges in this range</div>`
        :`<div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:#f8fafc;border-bottom:2px solid var(--border)">
            <tr><th style="${_rptTh()}">Date / Time</th><th style="${_rptTh()}">User</th><th style="${_rptTh()}">Guest</th><th style="${_rptTh()}">Description</th><th style="${_rptTh('right')}">Amount</th></tr>
          </thead>
          <tbody>
            ${folioCharges.map(r=>{
              const d=new Date(r.created_at);
              const ds=d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
              const ts=d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
              const retreat=r.bk?.retreatName||r.bk?.leaderName||null;
              const guestLine=[r.guestName,retreat].filter(Boolean).join(' · ')||'—';
              const hasUser=!!r.staff_name;
              return`<tr style="border-bottom:1px solid #f3f4f6">
                <td style="${_rptTd()};white-space:nowrap;font-size:12px"><div style="font-weight:600;color:#111827">${ds}</div><div style="color:#9ca3af">${ts}</div></td>
                <td style="${_rptTd()};font-size:12px">${hasUser
                  ?`<div style="display:flex;align-items:center;gap:6px"><div style="width:22px;height:22px;border-radius:50%;background:#7e22ce22;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#7e22ce;flex-shrink:0">${escHtml(r.staff_name[0].toUpperCase())}</div><span style="color:#374151;font-weight:600">${escHtml(r.staff_name)}</span></div>`
                  :`<span style="color:#d1d5db">—</span>`}</td>
                <td style="${_rptTd()};font-size:12px;color:#374151;max-width:200px">${escHtml(guestLine)}</td>
                <td style="${_rptTd()};font-size:12px;color:#374151;max-width:240px">${escHtml(r.description||'—')}</td>
                <td style="${_rptTd('right')};font-size:13px;font-weight:700;color:#7e22ce">${fmt$(r.amount)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`}
    </div>

    <div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:10px">Folio Payments Received (${folioPayments.length})</div>
      ${folioPayments.length===0
        ?`<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:28px;text-align:center;color:#9ca3af;font-size:13px">No folio payments in this range</div>`
        :`<div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:#f8fafc;border-bottom:2px solid var(--border)">
            <tr><th style="${_rptTh()}">Date / Time</th><th style="${_rptTh()}">User</th><th style="${_rptTh()}">Guest</th><th style="${_rptTh()}">Description</th><th style="${_rptTh('right')}">Amount</th></tr>
          </thead>
          <tbody>
            ${folioPayments.map(r=>{
              const d=new Date(r.created_at);
              const ds=d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
              const ts=d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
              const guest=r.guestName||r.bk?.retreatName||r.bk?.leaderName||'—';
              return`<tr style="border-bottom:1px solid #f3f4f6;background:#f0fdf4">
                <td style="${_rptTd()};font-size:12px;white-space:nowrap"><div style="font-weight:600;color:#111827">${ds}</div><div style="color:#9ca3af">${ts}</div></td>
                <td style="${_rptTd()};font-size:12px">${r.staff_name?escHtml(r.staff_name):'<span style="color:#d1d5db">—</span>'}</td>
                <td style="${_rptTd()};font-size:12px;color:#374151">${escHtml(guest)}</td>
                <td style="${_rptTd()};font-size:12px;color:#374151">${escHtml(r.description||'—')}</td>
                <td style="${_rptTd('right')};font-size:13px;font-weight:700;color:#15803d">${fmt$(Math.abs(r.amount))}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`}
    </div>
  </div>`;
}

function _rptSetDailyFrom(v){_dailyFrom=v;if(_dailyFrom>_dailyTo)_dailyTo=_dailyFrom;_rptLoadDaily().then(_rptRenderDailyView);}
function _rptSetDailyTo(v){_dailyTo=v;if(_dailyTo<_dailyFrom)_dailyFrom=_dailyTo;_rptLoadDaily().then(_rptRenderDailyView);}
function _rptSetDailyUser(u){_dailyUser=u;_rptRenderDailyView();}
async function _rptRefreshDaily(){_dailyLoaded=false;await _rptRenderDaily();}

function _rptExportDailyCsv(){
  const payEntries=_rptDailyPayEntries();
  const folioCharges=_rptDailyFolioCharges();
  const folioPayments=_rptDailyFolioPayments();
  const payLines=payEntries.map(e=>[
    'Payment',e.date||'',e.staffName||'',e.bk?.retreatName||e.bk?.leaderName||'',
    Number(e.amount||0).toFixed(2),e.method||'',e.ref||'',e.note||'',
  ]);
  const chargeLines=folioCharges.map(r=>[
    'Folio Charge',(r.created_at||'').slice(0,10),r.staff_name||'',r.guestName||r.bk?.retreatName||r.bk?.leaderName||'',
    r.amount.toFixed(2),r.description||'','','',
  ]);
  const payFolioLines=folioPayments.map(r=>[
    'Folio Payment',(r.created_at||'').slice(0,10),r.staff_name||'',r.guestName||r.bk?.retreatName||r.bk?.leaderName||'',
    Math.abs(r.amount).toFixed(2),r.description||'','','',
  ]);
  const header=['Type','Date','User','Retreat/Guest','Amount','Method/Description','Ref','Note'];
  const csvRows=[header,...payLines,...chargeLines,...payFolioLines];
  const csv=csvRows.map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement('a'),{href:url,download:`daily-report-${_dailyFrom}${_dailyFrom!==_dailyTo?'_to_'+_dailyTo:''}.csv`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── GRATUITY RETREATS ───────────────────────────────────────────
// Jorge's ask 2026-09-29: a tab listing every group with name/dates/guest
// count/tip-per-night/total gratuity, one row per retreat plus a month-by-
// month subtotal -- same per-retreat rows _rptBuildRows() already computes
// for Financial Summary (tipRate/tipTotal added there via calcBkTipTotal(),
// modules/payments.js), same year/show-cancelled filters, same CSV pattern.
function _rptRenderGratuity(){
  const el=document.getElementById('reportsContent');
  if(!el)return;
  const rows=_rptFiltered();
  const totalGuests=rows.reduce((s,r)=>s+r.guests,0);
  const totalTip=rows.reduce((s,r)=>s+r.tipTotal,0);
  const active=rows.filter(r=>r.bk.status!=='cancelled').length;
  const years=[...new Set(_rptRows.map(r=>(r.bk.startDate||'').slice(0,4)).filter(Boolean))].sort().reverse();

  const monthMap=new Map();
  rows.forEach(r=>{
    if(r.bk.status==='cancelled')return;
    const key=(r.bk.startDate||'').slice(0,7)||'?';
    const m=monthMap.get(key)||{key,tip:0,guests:0,count:0};
    m.tip+=r.tipTotal;m.guests+=r.guests;m.count++;
    monthMap.set(key,m);
  });
  const months=[...monthMap.values()].sort((a,b)=>b.key.localeCompare(a.key));

  el.innerHTML=`
  <div style="padding:24px 28px;font-family:'Jost',sans-serif;overflow-y:auto;height:100%;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px">
      <div>
        <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0">Gratuity Retreats</h2>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px">${active} retreat${active!==1?'s':''} · ${_rptYear==='all'?'All time':_rptYear}</div>
      </div>
      <div style="display:flex;gap:6px">
        ${_rptTabBtn('financial','Financial Summary',false)}
        ${_rptTabBtn('daily','Daily Report',false)}
        ${_rptTabBtn('gratuity','Gratuity Retreats',true)}
        ${_rptTabBtn('status','Contract & Portal',false)}
      </div>
      <div style="flex:1"></div>
      <select onchange="_rptSetYear(this.value)" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Jost',sans-serif;color:#374151;background:#fff;cursor:pointer">
        <option value="all" ${_rptYear==='all'?'selected':''}>All years</option>
        ${years.map(y=>`<option value="${y}" ${_rptYear===y?'selected':''}>${y}</option>`).join('')}
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#6b7280;cursor:pointer">
        <input type="checkbox" ${_rptShowCanc?'checked':''} onchange="_rptToggleCanc(this.checked);_rptRenderGratuity()">
        Show cancelled
      </label>
      <button onclick="_rptExportGratuityCsv()" style="padding:6px 14px;background:#0e5a5a;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Jost',sans-serif">
        ↓ Export CSV
      </button>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px">
      ${_rptCard('Total Gratuity',fmt$(totalTip),'#f0fdf9','#0e5a5a')}
      ${_rptCard('Guests Registered',String(totalGuests),'#f0f9ff','#0369a1')}
      ${_rptCard('Retreats',String(active),'#fefce8','#854d0e')}
    </div>

    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse">
        <thead style="background:#f8fafc;border-bottom:2px solid var(--border)">
          <tr>
            <th style="${_rptTh()}">Retreat</th>
            <th style="${_rptTh()}">Dates</th>
            <th style="${_rptTh('center')}">Guests</th>
            <th style="${_rptTh('right')}">Tip / Night</th>
            <th style="${_rptTh('right')}">Total Gratuity</th>
            <th style="${_rptTh('center')}">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length===0
            ?`<tr><td colspan="6" style="padding:60px;text-align:center;color:#9ca3af">No retreats found for this filter</td></tr>`
            :rows.slice().sort((a,b)=>(a.bk.startDate||'').localeCompare(b.bk.startDate||'')).map(_rptGratuityRowHtml).join('')}
        </tbody>
      </table>
    </div>

    ${months.length>0?`
    <div>
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:10px">Monthly Summary</div>
      <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:#f8fafc;border-bottom:2px solid var(--border)">
            <tr>
              <th style="${_rptTh()}">Month</th>
              <th style="${_rptTh('center')}">Retreats</th>
              <th style="${_rptTh('center')}">Guests</th>
              <th style="${_rptTh('right')}">Total Gratuity</th>
            </tr>
          </thead>
          <tbody>
            ${months.map(m=>`
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="${_rptTd()};font-weight:600;font-size:13px">${_rptFmtMonth(m.key)}</td>
              <td style="${_rptTd('center')};font-size:13px;color:#6b7280">${m.count}</td>
              <td style="${_rptTd('center')};font-size:13px;color:#6b7280">${m.guests}</td>
              <td style="${_rptTd('right')};font-weight:700;font-size:13px;color:#0e5a5a">${fmt$(m.tip)}</td>
            </tr>`).join('')}
            <tr style="background:#f8fafc;border-top:2px solid var(--border)">
              <td style="${_rptTd()};font-weight:800;font-size:13px">TOTAL</td>
              <td style="${_rptTd('center')};font-weight:700">${months.reduce((s,m)=>s+m.count,0)}</td>
              <td style="${_rptTd('center')};font-weight:700">${months.reduce((s,m)=>s+m.guests,0)}</td>
              <td style="${_rptTd('right')};font-weight:800;font-size:13px;color:#0e5a5a">${fmt$(totalTip)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`:''}
  </div>`;
}

function _rptGratuityRowHtml(r){
  const bk=r.bk;
  const canc=bk.status==='cancelled';
  const statusBadge=canc
    ?`<span style="background:#fee2e2;color:#dc2626;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px">Cancelled</span>`
    :`<span style="background:#dcfce7;color:#15803d;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px">Active</span>`;
  return`<tr style="border-bottom:1px solid #f3f4f6;cursor:pointer;${canc?'opacity:.55':''}" onclick="switchTab('teacherreg',document.getElementById('teacherregTabBtn'));regInitSel();regSelectRetreat('${bk.id}')">
    <td style="${_rptTd()}">
      <div style="font-weight:700;font-size:13px;color:#111827">${escHtml(bk.retreatName||bk.leaderName||'—')}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:1px">${escHtml(bk.leaderName||'')}</div>
    </td>
    <td style="${_rptTd()};white-space:nowrap;font-size:12px;color:#6b7280">
      ${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}<br>
      <span style="color:#d1d5db">${r.nights} night${r.nights!==1?'s':''}</span>
    </td>
    <td style="${_rptTd('center')};font-size:13px;font-weight:700;color:#374151">${r.guests||'—'}</td>
    <td style="${_rptTd('right')};font-size:13px;font-weight:600;color:#6b7280">${r.tipRate>0?fmt$(r.tipRate):'—'}</td>
    <td style="${_rptTd('right')};font-size:13px;font-weight:700;color:#0e5a5a">${r.tipTotal>0?fmt$(r.tipTotal):'—'}</td>
    <td style="${_rptTd('center')}">${statusBadge}</td>
  </tr>`;
}

function _rptExportGratuityCsv(){
  const rows=_rptFiltered().slice().sort((a,b)=>(b.bk.startDate||'').localeCompare(a.bk.startDate||''));
  const header=['Retreat','Teacher','Start Date','End Date','Nights','Guests','Tip Per Night','Total Gratuity','Status'];
  const lines=[header,...rows.map(r=>[
    r.bk.retreatName||r.bk.leaderName||'',
    r.bk.leaderName||'',
    r.bk.startDate||'',
    r.bk.endDate||'',
    r.nights,r.guests,
    r.tipRate.toFixed(2),r.tipTotal.toFixed(2),
    r.bk.status||'',
  ])].map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([lines],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement('a'),{href:url,download:`amansala-gratuity-${_rptYear}.csv`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── CONTRACT & PORTAL STATUS ────────────────────────────────────
// Jorge's ask 2026-09-30: "podemos tener un apartado en donde podamos ver
// a quien ya le enviamos contratos? o sent to teacher que es el portal?"
// -- who's missing a contract or their room list/portal, across every
// retreat, at a glance. Reads fields the app already persists (no schema
// change) -- venSendRoomList()/the contract flow in booking-hub.html
// already set these on bk itself.
let _rptOnlyMissing=false;

function _rptContractStatus(bk){
  const contractSent=!!bk.contractSentAt||!!bk.contractSentViaPortal||['contract_sent','contract_signed','deposit_paid','room_list_sent','confirmed'].includes(bk.status);
  // 'contract_signed' itself is just one stop on the pipeline -- deposit_paid/
  // room_list_sent/confirmed all come AFTER it, so a booking sitting in any of
  // those already has a signed contract even if contractSignedAt itself was
  // never recorded (same reasoning contractSent already applies to its own
  // downstream statuses). Jorge's ask 2026-09-30: don't show "Not Signed" for
  // retreats that are clearly past that stage.
  const contractSigned=!!bk.contractSignedAt||['contract_signed','deposit_paid','room_list_sent','confirmed'].includes(bk.status);
  const portalSent=!!bk.roomListSentAt||!!bk.roomListSentViaPortal||['room_list_sent','confirmed'].includes(bk.status);
  return{
    contractSent,contractSentAt:bk.contractSentAt||null,
    contractSigned,contractSignedAt:bk.contractSignedAt||null,
    portalSent,portalSentAt:bk.roomListSentAt||null,
  };
}

function _rptStatusBadge(on,onLabel,offLabel){
  return on
    ?`<span style="background:#dcfce7;color:#15803d;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;white-space:nowrap">✓ ${onLabel}</span>`
    :`<span style="background:#fee2e2;color:#dc2626;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;white-space:nowrap">${offLabel}</span>`;
}

function _rptRenderStatus(){
  const el=document.getElementById('reportsContent');
  if(!el)return;
  // WeTravel-sourced retreats never go through this app's own Send Contract/
  // Send Room List flows at all -- their contract happens on WeTravel's own
  // platform, so "Sent"/"Signed"/"Portal" here is meaningless noise for them
  // (Jorge's report 2026-09-30: "esos no deben de salir ahi en ese reporte",
  // pointing at We Travel BBC/RNR).
  const _statusFiltered=_rptFiltered().filter(r=>r.bk.source!=='wetravel');
  let rows=_statusFiltered.map(r=>({...r,cs:_rptContractStatus(r.bk)}));
  if(_rptOnlyMissing)rows=rows.filter(r=>!r.cs.contractSent||!r.cs.portalSent);
  const active=_statusFiltered.filter(r=>r.bk.status!=='cancelled').length;
  const years=[...new Set(_rptRows.map(r=>(r.bk.startDate||'').slice(0,4)).filter(Boolean))].sort().reverse();
  const missingContract=_statusFiltered.filter(r=>!_rptContractStatus(r.bk).contractSent).length;
  const missingPortal=_statusFiltered.filter(r=>!_rptContractStatus(r.bk).portalSent).length;

  el.innerHTML=`
  <div style="padding:24px 28px;font-family:'Jost',sans-serif;overflow-y:auto;height:100%;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px">
      <div>
        <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0">Contract & Portal Status</h2>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px">${active} retreat${active!==1?'s':''} · ${_rptYear==='all'?'All time':_rptYear}</div>
      </div>
      <div style="display:flex;gap:6px">
        ${_rptTabBtn('financial','Financial Summary',false)}
        ${_rptTabBtn('daily','Daily Report',false)}
        ${_rptTabBtn('gratuity','Gratuity Retreats',false)}
        ${_rptTabBtn('status','Contract & Portal',true)}
      </div>
      <div style="flex:1"></div>
      <select onchange="_rptSetYear(this.value);_rptRenderStatus()" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:'Jost',sans-serif;color:#374151;background:#fff;cursor:pointer">
        <option value="all" ${_rptYear==='all'?'selected':''}>All years</option>
        ${years.map(y=>`<option value="${y}" ${_rptYear===y?'selected':''}>${y}</option>`).join('')}
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#6b7280;cursor:pointer">
        <input type="checkbox" ${_rptShowCanc?'checked':''} onchange="_rptToggleCanc(this.checked);_rptRenderStatus()">
        Show cancelled
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#6b7280;cursor:pointer">
        <input type="checkbox" ${_rptOnlyMissing?'checked':''} onchange="_rptSetOnlyMissing(this.checked)">
        Only missing something
      </label>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px">
      ${_rptCard('Retreats',String(active),'#f0f9ff','#0369a1')}
      ${_rptCard('Missing Contract',String(missingContract),missingContract>0?'#fef2f2':'#f0fdf4',missingContract>0?'#dc2626':'#15803d')}
      ${_rptCard('Missing Portal / Room List',String(missingPortal),missingPortal>0?'#fef2f2':'#f0fdf4',missingPortal>0?'#dc2626':'#15803d')}
    </div>

    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead style="background:#f8fafc;border-bottom:2px solid var(--border)">
          <tr>
            <th style="${_rptTh()}">Retreat</th>
            <th style="${_rptTh()}">Dates</th>
            <th style="${_rptTh('center')}">Contract</th>
            <th style="${_rptTh('center')}">Signed</th>
            <th style="${_rptTh('center')}">Portal / Room List</th>
            <th style="${_rptTh('center')}">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length===0
            ?`<tr><td colspan="6" style="padding:60px;text-align:center;color:#9ca3af">${_rptOnlyMissing?'Nothing missing for this filter 🎉':'No retreats found for this filter'}</td></tr>`
            :rows.slice().sort((a,b)=>(a.bk.startDate||'').localeCompare(b.bk.startDate||'')).map(_rptStatusRowHtml).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function _rptStatusRowHtml(r){
  const bk=r.bk,cs=r.cs;
  const canc=bk.status==='cancelled';
  return`<tr style="border-bottom:1px solid #f3f4f6;cursor:pointer;${canc?'opacity:.55':''}" onclick="switchTab('teacherreg',document.getElementById('teacherregTabBtn'));regInitSel();regSelectRetreat('${bk.id}')">
    <td style="${_rptTd()}">
      <div style="font-weight:700;font-size:13px;color:#111827">${escHtml(bk.retreatName||bk.leaderName||'—')}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:1px">${escHtml(bk.leaderName||'')}</div>
    </td>
    <td style="${_rptTd()};white-space:nowrap;font-size:12px;color:#6b7280">${fmtDate(bk.startDate)} – ${fmtDate(bk.endDate)}</td>
    <td style="${_rptTd('center')}">
      ${_rptStatusBadge(cs.contractSent,'Sent','Not Sent')}
      ${cs.contractSentAt?`<div style="font-size:10px;color:#9ca3af;margin-top:3px">${fmtDate(cs.contractSentAt.slice(0,10))}</div>`:''}
    </td>
    <td style="${_rptTd('center')}">
      ${_rptStatusBadge(cs.contractSigned,'Signed','Not Signed')}
      ${cs.contractSignedAt?`<div style="font-size:10px;color:#9ca3af;margin-top:3px">${fmtDate(cs.contractSignedAt.slice(0,10))}</div>`:''}
    </td>
    <td style="${_rptTd('center')}">
      ${_rptStatusBadge(cs.portalSent,'Sent','Not Sent')}
      ${cs.portalSentAt?`<div style="font-size:10px;color:#9ca3af;margin-top:3px">${fmtDate(cs.portalSentAt.slice(0,10))}</div>`:''}
    </td>
    <td style="${_rptTd('center')}">
      ${canc?`<span style="background:#fee2e2;color:#dc2626;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px">Cancelled</span>`:`<span style="font-size:11px;color:#6b7280">${escHtml((bk.status||'').replace(/_/g,' '))}</span>`}
    </td>
  </tr>`;
}

function _rptSetOnlyMissing(v){_rptOnlyMissing=v;_rptRenderStatus();}
