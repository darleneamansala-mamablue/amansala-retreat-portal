// ===== admin-bot-log.js — ported from staging's new modular admin app (js/modules/admin-bot-log.js) =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Global, cross-retreat view of the bot_log table (last 200 rows) — distinct from the existing
// per-retreat "🤖 Bot Activity Log" modal (openBotLogModal in teacher-portal.js), which only shows
// one booking at a time. Same underlying table, additive rather than a replacement.

const ADMINBL_TOOL_META={
  add_room_by_type:{bg:'#dcfce7',color:'#15803d',label:'Room Added'},
  remove_room_by_type:{bg:'#fee2e2',color:'#b91c1c',label:'Room Removed'},
  get_available_room_types:{bg:'#e0f2fe',color:'#0369a1',label:'Checked Availability'},
  get_my_room_types:{bg:'#f1f5f9',color:'#475569',label:'Viewed Rooms'},
  get_pricing_info:{bg:'#fefce8',color:'#92400e',label:'Viewed Pricing'},
  get_estimated_quote:{bg:'#fefce8',color:'#92400e',label:'Viewed Quote'},
  get_rooming_list:{bg:'#f1f5f9',color:'#475569',label:'Viewed Rooming'},
  get_retreat_info:{bg:'#f1f5f9',color:'#475569',label:'Viewed Info'},
};
let _adminBlRows=[],_adminBlTypeFilter='',_adminBlSearch='';

function _adminBlRetreatName(bkId){
  const bk=AppData.bookings.find(b=>b.id===bkId);
  return bk?(bk.retreatName||bk.leaderName||bkId):(bkId||'—');
}
function _adminBlFmtTime(iso){
  try{
    const d=new Date(iso);
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});
  }catch(e){return iso;}
}
function _adminBlApplyFilters(rows){
  return rows.filter(r=>{
    if(_adminBlTypeFilter&&r.tool_name!==_adminBlTypeFilter)return false;
    if(_adminBlSearch){
      const q=_adminBlSearch.toLowerCase();
      const name=_adminBlRetreatName(r.booking_id).toLowerCase();
      const msg=(r.user_message||'').toLowerCase();
      const tool=(r.tool_name||'').toLowerCase();
      if(!name.includes(q)&&!msg.includes(q)&&!tool.includes(q))return false;
    }
    return true;
  });
}
function adminBotLogRenderRows(){
  const body=document.getElementById('ablBody');
  if(!body)return;
  const rows=_adminBlApplyFilters(_adminBlRows);
  if(!rows.length){body.innerHTML='<div style="text-align:center;color:var(--muted);font-size:13px;padding:48px">No bot activity found.</div>';return;}
  let lastDate='';
  body.innerHTML=rows.map(r=>{
    const m=ADMINBL_TOOL_META[r.tool_name]||{bg:'#f3f4f6',color:'#6b7280',label:r.tool_name||'—'};
    const dt=r.created_at?new Date(r.created_at).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}):'';
    const dateHeader=dt!==lastDate
      ?`<div style="padding:8px 20px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#9ca3af;background:#f9fafb;border-bottom:1px solid #f1f5f9">${(lastDate=dt,dt)}</div>`
      :'';
    const name=_adminBlRetreatName(r.booking_id);
    const res=r.tool_result||{};
    const detail=res.type_added?`→ ${res.type_added}`:res.type_removed?`→ ${res.type_removed}`:res.success===false?`Not done: ${res.reason||''}`:'';
    const msg=(r.user_message||'').slice(0,120);
    return`${dateHeader}<div style="display:flex;align-items:flex-start;gap:12px;padding:11px 20px;border-bottom:1px solid #f1f5f9" onmouseenter="this.style.background='#f9fafb'" onmouseleave="this.style.background=''">
      <div style="flex-shrink:0;width:88px;text-align:right;font-size:11px;color:#9ca3af;padding-top:2px">${_adminBlFmtTime(r.created_at)}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;flex-wrap:wrap">
          <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:${m.bg};color:${m.color};white-space:nowrap">${m.label}</span>
          <span style="font-size:12px;font-weight:600;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px" title="${escHtml(name)}">${escHtml(name)}</span>
          ${detail?`<span style="font-size:11px;color:${m.color};font-weight:600">${escHtml(detail)}</span>`:''}
        </div>
        ${msg?`<div style="font-size:12.5px;color:#374151;line-height:1.5;word-break:break-word;font-style:italic">"${escHtml(msg)}${r.user_message.length>120?'…':''}"</div>`:''}
      </div>
    </div>`;
  }).join('');
}
function adminBotLogSetTypeFilter(type){
  _adminBlTypeFilter=type;
  document.querySelectorAll('.abl-type-btn').forEach(b=>{
    const active=b.dataset.type===type;
    b.style.background=active?'#1e293b':'#fff';
    b.style.color=active?'#fff':'#374151';
    b.style.borderColor=active?'#1e293b':'#e5e7eb';
  });
  adminBotLogRenderRows();
}
async function adminBotLogRender(){
  const el=document.getElementById('botLogAdminContent');
  if(!el)return;
  el.innerHTML=`
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div style="background:#0f172a;padding:16px 22px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-size:16px;font-weight:800;color:#fff">🤖 Bot Activity Log</div>
          <div style="font-size:11px;color:rgba(255,255,255,.45);margin-top:2px;letter-spacing:.4px">All retreats · Last 200 actions</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <input id="ablSearch" type="text" placeholder="Search…" oninput="_adminBlSearch=this.value;adminBotLogRenderRows()"
            style="border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#fff;border-radius:8px;padding:7px 11px;font-size:12px;outline:none;width:180px;font-family:inherit">
          <button onclick="adminBotLogLoad()" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.8);border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-family:inherit">↺ Refresh</button>
        </div>
      </div>
      <div style="padding:10px 22px;border-bottom:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0;background:#fff">
        <button class="abl-type-btn" data-type="" onclick="adminBotLogSetTypeFilter('')" style="font-size:11px;padding:4px 11px;border-radius:20px;border:1px solid #1e293b;background:#1e293b;color:#fff;cursor:pointer;font-family:inherit">All</button>
        <button class="abl-type-btn" data-type="add_room_by_type" onclick="adminBotLogSetTypeFilter('add_room_by_type')" style="font-size:11px;padding:4px 11px;border-radius:20px;border:1px solid #e5e7eb;background:#fff;color:#374151;cursor:pointer;font-family:inherit">➕ Add Room</button>
        <button class="abl-type-btn" data-type="remove_room_by_type" onclick="adminBotLogSetTypeFilter('remove_room_by_type')" style="font-size:11px;padding:4px 11px;border-radius:20px;border:1px solid #e5e7eb;background:#fff;color:#374151;cursor:pointer;font-family:inherit">➖ Remove Room</button>
        <button class="abl-type-btn" data-type="get_available_room_types" onclick="adminBotLogSetTypeFilter('get_available_room_types')" style="font-size:11px;padding:4px 11px;border-radius:20px;border:1px solid #e5e7eb;background:#fff;color:#374151;cursor:pointer;font-family:inherit">🔍 Availability</button>
        <button class="abl-type-btn" data-type="get_pricing_info" onclick="adminBotLogSetTypeFilter('get_pricing_info')" style="font-size:11px;padding:4px 11px;border-radius:20px;border:1px solid #e5e7eb;background:#fff;color:#374151;cursor:pointer;font-family:inherit">💰 Pricing</button>
        <button class="abl-type-btn" data-type="get_estimated_quote" onclick="adminBotLogSetTypeFilter('get_estimated_quote')" style="font-size:11px;padding:4px 11px;border-radius:20px;border:1px solid #e5e7eb;background:#fff;color:#374151;cursor:pointer;font-family:inherit">📊 Quote</button>
      </div>
      <div id="ablBody" style="flex:1;overflow-y:auto"><div style="text-align:center;color:var(--muted);font-size:13px;padding:48px">Loading…</div></div>
    </div>`;
  await adminBotLogLoad();
}
async function adminBotLogLoad(){
  const body=document.getElementById('ablBody');
  if(body)body.innerHTML='<div style="text-align:center;color:var(--muted);font-size:13px;padding:48px">Loading…</div>';
  try{
    const{data,error}=await db.from('bot_log').select('*').order('created_at',{ascending:false}).limit(200);
    if(error)throw error;
    _adminBlRows=data||[];
    adminBotLogRenderRows();
  }catch(e){if(body)body.innerHTML=`<div style="color:#dc2626;font-size:13px;padding:24px">Error: ${escHtml(String(e.message||e))}</div>`;}
}
